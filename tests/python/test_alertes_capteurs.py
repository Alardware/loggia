"""Les alertes de surete, audit des capteurs du 19/10 (lot 2).

Chaque test part d'un defaut constate sur le vrai module : une fumee qui
ouvrait les velux et deployait le store banne (H6), une fuite deja la au
demarrage de Home Assistant et jamais vue (H4), une reconnexion Zigbee prise
pour une ouverture sous alarme ou pour une fuite neuve (H5), une plante qui
passait pour une fuite des qu'elle n'etait pas un modele (M1), un detecteur
qui se taisait sans que personne le sache (M5), `armed_custom_bypass` que
l'ecran disait arme et pas le serveur (M21), une categorie decochee qui
laissait la maison reagir (M22), une entite renommee pendant un danger qui
laissait la maison forcee (M23).
"""
from __future__ import annotations

import sys

import pytest

from conftest import charger
from test_alertes import (  # noqa: F401  (fixtures reutilisees)
    ALARME, FUITE, FUMEE, PORTE, FauxEtat, FauxEvenement, FauxHass, creer, lancer, maison, module,
    registre)


def services(a):
    return [(d, s) for d, s, _ in a._hass.services.appels]


def noms_des_taches(a):
    """Le nom des coroutines posees, puis abandonnees : ce que l'evenement
    AURAIT lance, sans le lancer."""
    noms = [t.cr_code.co_name for t in a._hass.taches]
    a._hass.abandonner()
    return noms


def muet(etat, valeur="unavailable"):
    return FauxEtat(etat.entity_id, valeur, dict(etat.attributes))


def eteint(etat):
    return FauxEtat(etat.entity_id, "off", dict(etat.attributes))


# ── H6 : une fumee n'ouvre ni un velux ni un store banne ─────────────────────

def test_la_fumee_n_ouvre_que_volets_stores_et_rideaux(creer, module):
    """Le 19/10 : une fumee remontait aussi `window` (un velux : l'ouvrir,
    c'est faire entrer l'air qui attise) et `awning` (un store banne : le
    deployer au-dessus d'une fenetre en feu). ouvrants.py ne les ouvre
    jamais ; la surete non plus, desormais."""
    etats = maison()
    etats["cover.velux"] = FauxEtat("cover.velux", "closed", {"device_class": "window", "current_position": 0})
    etats["cover.banne"] = FauxEtat("cover.banne", "closed", {"device_class": "awning", "current_position": 0})
    etats["cover.store"] = FauxEtat("cover.store", "closed", {"device_class": "blind", "current_position": 0})
    a = creer(etats=etats)
    lancer(a._reagir(FUMEE, "fumee"))
    ouverts = [c.get("entity_id") for d, s, c in a._hass.services.appels if s == "open_cover"]
    assert ouverts == [["cover.salon", "cover.store"]], ouverts
    assert set(module.VOLETS_CLASSES) == {"shutter", "blind", "curtain", "shade"}


def test_la_liste_de_la_surete_vient_de_celle_des_ouvrants(module):
    """Une seule definition d'un volet : celle d'ouvrants.py, moins le store
    banne. Une classe ajoutee la-bas arrive ici sans qu'on y pense."""
    ouvrants = charger("ouvrants")
    assert set(module.VOLETS_CLASSES) == set(ouvrants.CLASSES_VOLETS) - {ouvrants.STORE_BANNE}
    assert ouvrants.FENETRE_DE_TOIT not in module.VOLETS_CLASSES


# ── H4 : un danger deja la quand Home Assistant demarre ─────────────────────

def test_une_fuite_deja_la_au_demarrage_previent_sans_toucher_la_maison(creer, monkeypatch):
    """Une fuite survenue pendant que Home Assistant etait arrete : son premier
    etat ecrit est `on`, sans etat d'avant — l'ecoute l'ignorait. Une fois
    Home Assistant demarre, la revue PREVIENT le telephone.
    ASSERTION MODIFIEE (19/10, son choix « Prevenir seulement ») : la revue ne
    fait plus reagir la maison — un danger qu'on n'a pas vu arriver (l'ecoute
    CO d'une camera restee allumee, Alarmo revenu « declenche ») ne doit pas
    allumer toutes ses lumieres au redemarrage."""
    registre(monkeypatch, {FUITE.entity_id: "zha"})
    etats = {**maison(), FUITE.entity_id: FUITE, PORTE.entity_id: PORTE}
    a = creer(etats=etats)
    lancer(a._async_revoir())
    assert services(a) == [("notify", "mobile")]
    assert a._dangers == {}


def test_un_danger_qui_apparait_deja_allume_apres_le_demarrage_alerte(creer, monkeypatch):
    """Relecture du lot 2, point 3 : une entite creee APRES le demarrage — une
    decouverte MQTT, une integration rechargee — et deja en fumee n'a pas
    d'etat d'avant. Home Assistant tourne : c'est un evenement."""
    registre(monkeypatch, {})
    a = creer(etats=maison())
    a._on_state(FauxEvenement(FUMEE, None))
    # ASSERTION MODIFIEE (19/10, « Prevenir seulement ») : un danger qu'on
    # decouvre deja la previent, sans faire reagir la maison.
    assert noms_des_taches(a) == ["_envoyer"]
    # Une porte qui apparait ouverte n'est pas une ouverture : rien d'avant.
    a._on_state(FauxEvenement(PORTE, None))
    assert noms_des_taches(a) == []


def test_avant_la_revue_une_apparition_attend_la_revue(creer, monkeypatch):
    """Pendant le demarrage, chaque entite apparait : la revue s'en charge,
    une fois — pas de double alerte."""
    registre(monkeypatch, {})
    a = creer(etats=maison())
    a._demarre = False
    a._on_state(FauxEvenement(FUMEE, None))
    assert noms_des_taches(a) == []


def test_une_alarme_deja_declenchee_au_demarrage_est_revue(creer):
    """Relecture du lot 2, point 3 : la revue prend aussi un panneau d'alarme a
    `triggered` — le telephone seulement.
    ASSERTION MODIFIEE (19/10, « Prevenir seulement ») : plus les lumieres."""
    a = creer(etats={**maison(), ALARME.entity_id: ALARME})
    lancer(a._async_revoir())
    assert a._dangers == {}
    assert services(a) == [("notify", "mobile")]


def test_la_revue_attend_la_fin_du_demarrage(module, store_module, monkeypatch):
    """Le constructeur pose la revue par `async_at_started`, comme fenetres.py :
    avant, une integration n'a peut-etre pas encore cree ses capteurs."""
    start = sys.modules["homeassistant.helpers.start"]
    rappels = []
    monkeypatch.setattr(start, "async_at_started", lambda hass, rappel: rappels.append(rappel) or (lambda: None))
    hass = FauxHass({})
    a = module.LoggiaAlertes(hass, store_module.LoggiaStore.__new__(store_module.LoggiaStore), regles=None)
    assert [r.__name__ for r in rappels] == ["_async_revoir"]
    assert a._au_demarrage is not None
    a.async_arreter()
    assert a._au_demarrage is None


# ── H5 : un retour depuis un etat muet n'est pas un evenement neuf ──────────

def test_z2m_qui_redemarre_porte_ouverte_alarme_armee_ne_dit_rien(creer):
    """Zigbee2MQTT redemarre : chaque capteur passe par `unavailable`, puis
    revient. La fenetre deja ouverte revenait « ouverte » et partait au
    telephone comme une ouverture sous alarme."""
    etats = maison()
    etats["alarm_control_panel.maison"] = FauxEtat("alarm_control_panel.maison", "armed_away", {})
    a = creer(etats=etats)
    a._on_state(FauxEvenement(muet(PORTE), PORTE))      # ouverte -> muette
    a._on_state(FauxEvenement(PORTE, muet(PORTE)))      # muette -> ouverte
    assert noms_des_taches(a) == []
    # Meme sans rien connaitre d'avant (un demarrage) : partir d'un etat muet
    # n'est pas une ouverture.
    b = creer(etats=etats)
    b._on_state(FauxEvenement(PORTE, muet(PORTE, "unknown")))
    assert noms_des_taches(b) == []


def test_une_porte_fermee_avant_le_silence_puis_ouverte_est_une_ouverture(creer):
    """Relecture du lot 2, point 2 : fermee avant le silence, ouverte apres —
    quelqu'un est entre pendant que le capteur se taisait. L'alarme armee, ca
    se dit."""
    etats = maison()
    etats["alarm_control_panel.maison"] = FauxEtat("alarm_control_panel.maison", "armed_away", {})
    a = creer(etats=etats)
    ferme = eteint(PORTE)
    a._on_state(FauxEvenement(muet(ferme), ferme))
    a._hass.abandonner()
    a._on_state(FauxEvenement(PORTE, muet(ferme)))
    assert noms_des_taches(a) == ["_porte_ouverte"]


def test_une_fuite_toujours_mouillee_qui_decroche_ne_realerte_pas(creer, monkeypatch):
    """La fuite decroche (la maison est rendue, le journal le dit), puis
    revient, toujours mouillee : pas de seconde notification.

    ASSERTION MODIFIEE (relecture du lot 2, point 1) : elle ne re-reagissait
    pas non plus — mais la maison, rendue pendant le silence, n'etait alors
    plus forcee alors que le danger durait. Elle est de nouveau forcee, sans
    un mot de plus au telephone."""
    registre(monkeypatch, {FUITE.entity_id: "zha"})
    a = creer(etats=maison(), config={"cooldown_min": 1})
    lancer(a._reagir(FUITE, "fuite"))
    a._hass.services.appels.clear()
    a._on_state(FauxEvenement(muet(FUITE), FUITE))
    lancer(a._hass.taches.pop())                       # la maison est rendue
    assert a._dangers == {}
    a._on_state(FauxEvenement(FUITE, muet(FUITE)))
    assert [t.cr_code.co_name for t in a._hass.taches] == ["_reagir"], "ni alerte neuve, mais la reaction"
    lancer(a._hass.taches.pop())
    assert services(a) == [("valve", "close_valve")], "rien au telephone, la vanne de nouveau coupee"
    assert a._dangers == {FUITE.entity_id: "fuite"}, "la maison n'est plus forcee alors que la fuite dure"


def test_une_fumee_qui_decroche_et_revient_reforce_la_maison(creer, monkeypatch):
    """Le cas de la relecture : le detecteur se tait pendant la fumee (la
    maison est rendue), puis revient, toujours en fumee."""
    registre(monkeypatch, {})
    a = creer(etats=maison())
    lancer(a._reagir(FUMEE, "fumee"))
    a._on_state(FauxEvenement(muet(FUMEE), FUMEE))
    lancer(a._hass.taches.pop())
    a._hass.services.appels.clear()
    a._on_state(FauxEvenement(FUMEE, muet(FUMEE)))
    lancer(a._hass.taches.pop())
    assert ("light", "turn_on") in services(a) and ("notify", "mobile") not in services(a)


def test_une_fuite_qui_revient_seche_termine_le_danger(creer, monkeypatch):
    """Le dernier etat connu fait foi des deux cotes : mouillee avant le
    silence, seche apres, c'est la fin du danger."""
    registre(monkeypatch, {FUITE.entity_id: "zha"})
    a = creer(etats=maison())
    a._on_state(FauxEvenement(muet(FUITE), FUITE))
    a._hass.abandonner()
    a._on_state(FauxEvenement(eteint(FUITE), muet(FUITE)))
    assert noms_des_taches(a) == ["_danger_passe"]


def test_un_danger_jamais_vu_qui_sort_du_silence_alerte(creer, monkeypatch):
    """Sans etat connu d'avant — un detecteur qui se reconnecte apres le
    demarrage —, une fumee reste une fumee : mieux vaut une alerte de trop."""
    registre(monkeypatch, {})
    a = creer(etats=maison())
    a._on_state(FauxEvenement(FUMEE, muet(FUMEE, "unknown")))
    # ASSERTION MODIFIEE (19/10, « Prevenir seulement ») : sans etat connu
    # d'avant, on n'a pas VU le danger arriver — le telephone, pas la maison.
    assert noms_des_taches(a) == ["_envoyer"]


# ── M1 : une seule regle « plante ou fuite » ────────────────────────────────

def test_le_besoin_d_eau_d_une_plante_n_est_pas_une_fuite(creer, monkeypatch):
    """L'ecran ecarte un `moisture` dont l'identifiant commence par la base
    d'une plante de `loggia_plants` (attention.js, `estPlante`) ; le serveur
    l'ecartait seulement s'il etait un modele. Un seuil (`threshold`) ou un
    ESPHome qui dit « la plante a soif » coupait la vanne."""
    registre(monkeypatch, {"binary_sensor.ficus_besoin_eau": "threshold",
                           "binary_sensor.ficusx_fuite": "esphome"})
    a = creer({"actif": True}, etats=maison())
    a._store._store.contenu["shared"]["loggia_plants"] = [{"base": "binary_sensor.ficus", "name": "Ficus"}]
    plante = FauxEtat("binary_sensor.ficus_besoin_eau", "on", {"device_class": "moisture", "friendly_name": "Ficus"})
    lancer(a._envoyer(plante, "fuite", "Fuite d’eau détectée"))
    lancer(a._reagir(plante, "fuite"))
    assert a._hass.services.appels == [] and a._dangers == {}
    # A la frontiere pres, comme l'ecran : « ficusx » n'est pas « ficus ».
    voisin = FauxEtat("binary_sensor.ficusx_fuite", "on", {"device_class": "moisture", "friendly_name": "Cave"})
    lancer(a._envoyer(voisin, "fuite", "Fuite d’eau détectée"))
    lancer(a._reagir(voisin, "fuite"))
    assert services(a) == [("notify", "mobile"), ("valve", "close_valve")]


def test_sans_plante_configuree_rien_ne_change(creer):
    a = creer(etats=maison())
    assert lancer(a._est_plante("binary_sensor.ficus_besoin_eau")) is False
    a._store._store.contenu["shared"]["loggia_plants"] = "illisible"
    a._store._data = None
    assert lancer(a._est_plante("binary_sensor.ficus_besoin_eau")) is False


# ── M21 : « arme en contournement » est arme ────────────────────────────────

def test_armed_custom_bypass_est_arme(creer, module):
    assert "armed_custom_bypass" in module.ARMEE
    etats = {"alarm_control_panel.maison": FauxEtat("alarm_control_panel.maison", "armed_custom_bypass", {})}
    a = creer(etats=etats)
    lancer(a._porte_ouverte(PORTE))
    assert services(a) == [("notify", "mobile")]


# ── M22 : une categorie decochee coupe aussi la reaction ────────────────────

def test_une_categorie_decochee_ne_fait_pas_reagir_la_maison(creer):
    """« Fuite » decochee : ni telephone, ni vanne. La vanne se coupait
    quand meme (audit du 19/10)."""
    a = creer({"categories": {"fuite": False}}, etats=maison())
    lancer(a._envoyer(FUITE, "fuite", "Fuite d’eau détectée"))
    lancer(a._reagir(FUITE, "fuite"))
    assert a._hass.services.appels == [] and a._dangers == {}
    # Les autres categories reagissent toujours.
    lancer(a._reagir(FUMEE, "fumee"))
    assert ("cover", "open_cover") in services(a)


def test_une_installation_jamais_configuree_reagit_comme_avant(creer):
    """Pas de `loggia_alertes` du tout : le defaut de l'ecran coche chaque
    danger (ALERTES_DEF, parametres.jsx), la maison reagit."""
    a = creer(etats=maison())
    a._store._store.contenu["shared"] = {}
    a._store._data = None
    lancer(a._reagir(FUITE, "fuite"))
    assert services(a) == [("valve", "close_valve")]
    # Une categorie absente d'une configuration ecrite garde le defaut : cochee.
    b = creer({"categories": {"fumee": True}}, etats=maison())
    lancer(b._reagir(FUITE, "fuite"))
    assert services(b) == [("valve", "close_valve")]


# ── M23 : une entite supprimee pendant un danger rend la maison ─────────────

def test_une_entite_supprimee_pendant_un_danger_rend_la_maison(creer):
    a = creer(etats=maison())
    lancer(a._reagir(FUMEE, "fumee"))
    a._hass.services.appels.clear()
    a._on_state(FauxEvenement(None, FUMEE))      # renommee ou supprimee : plus d'etat neuf
    assert [t.cr_code.co_name for t in a._hass.taches] == ["_danger_passe"]
    lancer(a._hass.taches.pop())
    assert a._dangers == {} and len(a._hass.services.appels) == 3, "la maison est restee forcee"


def test_une_entite_supprimee_hors_danger_ne_fait_rien(creer):
    a = creer(etats=maison())
    a._on_state(FauxEvenement(None, PORTE))
    assert noms_des_taches(a) == []


# ── M5 : un detecteur de surete qui se tait se signale, une fois ────────────

@pytest.fixture
def minuteurs(monkeypatch):
    """`async_call_later` retenu : (delai, rappel, annule ?) par guet. Les
    autres delais — l'ecriture differee du journal — ne nous regardent pas."""
    ev = sys.modules["homeassistant.helpers.event"]
    poses = []

    def poser(_hass, delai, rappel):
        if "_guetter_muet" not in rappel.__qualname__:
            return lambda: None
        entree = {"delai": delai, "rappel": rappel, "annule": False}
        poses.append(entree)

        def annuler():
            entree["annule"] = True
        return annuler

    monkeypatch.setattr(ev, "async_call_later", poser)
    return poses


def echoir(a, minuteur):
    """Le delai passe : le rappel part, et la tache qu'il pose aussi."""
    minuteur["rappel"](None)
    for t in [a._hass.taches.pop() for _ in range(len(a._hass.taches))]:
        lancer(t)


def test_un_detecteur_muet_depuis_quinze_minutes_se_signale_une_fois(creer, module, minuteurs, monkeypatch):
    registre(monkeypatch, {})
    a = creer(etats=maison())
    a._hass.states.table[FUMEE.entity_id] = muet(FUMEE)
    a._on_state(FauxEvenement(muet(FUMEE), eteint(FUMEE)))
    assert [m["delai"] for m in minuteurs] == [module.DELAI_MUET]
    assert module.DELAI_MUET == 15 * 60
    echoir(a, minuteurs[0])
    assert len(a._hass.services.appels) == 1
    domaine, service, charge = a._hass.services.appels[0]
    assert (domaine, service) == ("notify", "mobile")
    assert charge["message"] == "Détecteur muet, à vérifier : Fumée cuisine"
    assert "data" not in charge, "un detecteur muet n'est pas un danger : rien de critique"
    # Une seule fois jusqu'a son retour : le muet suivant ne pose rien.
    a._on_state(FauxEvenement(muet(FUMEE, "unknown"), muet(FUMEE)))
    assert len(minuteurs) == 1
    # Ni lumiere, ni volet, ni vanne : seulement le telephone.
    assert services(a) == [("notify", "mobile")]
    # Il revient, puis se tait encore : on peut le redire.
    a._on_state(FauxEvenement(eteint(FUMEE), muet(FUMEE)))
    a._on_state(FauxEvenement(muet(FUMEE), eteint(FUMEE)))
    assert len(minuteurs) == 2


def test_un_detecteur_qui_revient_avant_le_delai_ne_dit_rien(creer, minuteurs, monkeypatch):
    registre(monkeypatch, {})
    a = creer(etats=maison())
    a._on_state(FauxEvenement(muet(FUMEE), eteint(FUMEE)))
    a._on_state(FauxEvenement(eteint(FUMEE), muet(FUMEE)))
    assert minuteurs[0]["annule"] is True
    a._hass.states.table[FUMEE.entity_id] = eteint(FUMEE)
    echoir(a, minuteurs[0])
    assert a._hass.services.appels == []


def test_un_detecteur_muet_d_une_categorie_coupee_ne_dit_rien(creer, minuteurs, monkeypatch):
    registre(monkeypatch, {})
    a = creer({"categories": {"fumee": False}}, etats=maison())
    a._hass.states.table[FUMEE.entity_id] = muet(FUMEE)
    a._on_state(FauxEvenement(muet(FUMEE), eteint(FUMEE)))
    echoir(a, minuteurs[0])
    assert a._hass.services.appels == []


def test_une_porte_ou_une_plante_muette_ne_se_guette_pas(creer, minuteurs, monkeypatch):
    """Seuls les detecteurs de surete (BINAIRES) : une porte muette est le
    quotidien d'un reseau Zigbee, un modele de plante n'a pas de pile."""
    registre(monkeypatch, {"binary_sensor.dracaena_besoin_eau": "template"})
    a = creer(etats=maison())
    a._on_state(FauxEvenement(muet(PORTE), PORTE))
    plante = FauxEtat("binary_sensor.dracaena_besoin_eau", "off", {"device_class": "moisture"})
    a._on_state(FauxEvenement(muet(plante), plante))
    assert minuteurs == []


def test_un_detecteur_deja_muet_au_demarrage_se_guette(creer, minuteurs, monkeypatch):
    registre(monkeypatch, {})
    a = creer(etats={**maison(), FUMEE.entity_id: muet(FUMEE)})
    lancer(a._async_revoir())
    assert len(minuteurs) == 1


def test_l_arret_annule_les_guets(creer, minuteurs, monkeypatch):
    registre(monkeypatch, {})
    a = creer(etats=maison())
    a._defait = None
    a._on_state(FauxEvenement(muet(FUMEE), eteint(FUMEE)))
    a.async_arreter()
    assert minuteurs[0]["annule"] is True and a._muets == {}


def test_l_alarme_qui_sort_du_silence_deja_declenchee_ne_realerte_pas(creer):
    """Le meme principe pour le panneau : declenchee avant le silence,
    declenchee apres, ce n'est pas une seconde alarme.

    ASSERTION MODIFIEE (relecture du lot 2, point 1) : pas de seconde
    notification, mais la maison, rendue pendant le silence, reagit de
    nouveau — si elle reagissait avant le silence (son choix du 19/10 : seul
    un danger que la maison suivait la refait reagir)."""
    a = creer(etats=maison())
    lancer(a._reagir(ALARME, "alarme"))
    a._on_state(FauxEvenement(muet(ALARME), ALARME))
    while a._hass.taches:
        lancer(a._hass.taches.pop())
    a._on_state(FauxEvenement(ALARME, muet(ALARME)))
    assert noms_des_taches(a) == ["_reagir"]


# ── Relecture du lot 2, point 8 : des muets ensemble, une notification ──────

def test_des_detecteurs_muets_ensemble_donnent_une_seule_notification(creer, module, minuteurs, monkeypatch):
    """Le coordinateur Zigbee tombe : tous les detecteurs se taisent dans la
    meme minute. UNE notification qui les nomme, pas une par detecteur."""
    registre(monkeypatch, {})
    gaz = FauxEtat("binary_sensor.cuisine_gaz", "off", {"device_class": "gas", "friendly_name": "Gaz cuisine"})
    co = FauxEtat("binary_sensor.couloir_co", "off", {"device_class": "carbon_monoxide", "friendly_name": "CO couloir"})
    a = creer(etats={**maison(), FUMEE.entity_id: muet(FUMEE), gaz.entity_id: muet(gaz), co.entity_id: muet(co)})
    horloge = [0.0]
    monkeypatch.setattr(module.time, "monotonic", lambda: horloge[0])
    a._on_state(FauxEvenement(muet(FUMEE), eteint(FUMEE)))
    horloge[0] = 30.0
    a._on_state(FauxEvenement(muet(gaz), gaz))
    horloge[0] = 500.0                       # bien plus tard : pas dans la meme fenetre
    a._on_state(FauxEvenement(muet(co), co))
    horloge[0] = module.DELAI_MUET
    echoir(a, minuteurs[0])
    messages = [c["message"] for d, s, c in a._hass.services.appels if d == "notify"]
    assert messages == ["Détecteurs muets, à vérifier : Fumée cuisine, Gaz cuisine"]
    assert minuteurs[1]["annule"] is True, "le second a ete dit avec le premier"
    assert minuteurs[2]["annule"] is False, "le troisieme attend son tour"
    assert a._depot.contenu == {"muets": ["binary_sensor.cuisine_fumee", "binary_sensor.cuisine_gaz"]}
    horloge[0] = 500.0 + module.DELAI_MUET
    echoir(a, minuteurs[2])
    messages = [c["message"] for d, s, c in a._hass.services.appels if d == "notify"]
    assert messages[-1] == "Détecteur muet, à vérifier : CO couloir"


def test_un_detecteur_deja_dit_ne_se_redit_pas_au_redemarrage(creer, minuteurs, monkeypatch):
    """L'ensemble deja signale est persiste : apres un redemarrage, un
    detecteur toujours muet ne repart pas au telephone."""
    registre(monkeypatch, {})
    a = creer(etats={**maison(), FUMEE.entity_id: muet(FUMEE), PORTE.entity_id: PORTE})
    a._depot.contenu = {"muets": [FUMEE.entity_id, "binary_sensor.disparu", 3]}
    lancer(a._async_revoir())
    assert minuteurs == [] and a._muets_dits == {FUMEE.entity_id}
    assert a._depot.contenu == {"muets": [FUMEE.entity_id]}, "les entites disparues sortent du fichier"
    # Il revient : il sort de l'ensemble, et du fichier.
    a._on_state(FauxEvenement(eteint(FUMEE), muet(FUMEE)))
    for t in [a._hass.taches.pop() for _ in range(len(a._hass.taches))]:
        lancer(t)
    assert a._depot.contenu == {"muets": []}


def test_un_detecteur_muet_non_dit_n_est_pas_retenu(creer, minuteurs, monkeypatch):
    """Contre-relecture, point B : il n'entre dans l'ensemble deja dit — et
    sur le disque — que si la notification est partie. Un telephone disparu
    ne doit pas le faire taire pour toujours."""
    registre(monkeypatch, {})
    a = creer({"service": "telephone_vendu"}, etats={**maison(), FUMEE.entity_id: muet(FUMEE)})
    a._on_state(FauxEvenement(muet(FUMEE), eteint(FUMEE)))
    echoir(a, minuteurs[0])
    assert a._hass.services.appels == []
    assert a._muets_dits == set() and a._depot.contenu is None


# ── Son choix du 19/10 : au demarrage, prevenir seulement ───────────────────

def test_un_danger_vu_au_demarrage_qui_decroche_et_revient_ne_force_rien(creer, monkeypatch):
    """La revue a seulement prevenu. Si le detecteur se tait puis revient, il
    n'a jamais fait reagir la maison : son retour ne l'allume pas non plus."""
    registre(monkeypatch, {})
    a = creer(etats={**maison(), FUMEE.entity_id: FUMEE})
    lancer(a._async_revoir())
    a._hass.services.appels.clear()
    a._on_state(FauxEvenement(muet(FUMEE), FUMEE))
    while a._hass.taches:
        lancer(a._hass.taches.pop())
    a._on_state(FauxEvenement(FUMEE, muet(FUMEE)))
    while a._hass.taches:
        lancer(a._hass.taches.pop())
    assert ("light", "turn_on") not in services(a), services(a)
    assert ("notify", "mobile") not in services(a), "deja prevenu par la revue"


def test_un_danger_vu_au_demarrage_qui_retombe_puis_revient_fait_reagir(creer, monkeypatch):
    """Retombe puis revient pendant que Home Assistant tourne : ce passage-la,
    on l'a VU — la maison reagit, comme a tout vrai danger."""
    registre(monkeypatch, {})
    a = creer(etats={**maison(), FUMEE.entity_id: FUMEE})
    lancer(a._async_revoir())
    a._on_state(FauxEvenement(eteint(FUMEE), FUMEE))
    a._hass.abandonner()
    a._on_state(FauxEvenement(FUMEE, eteint(FUMEE)))
    assert noms_des_taches(a) == ["_envoyer", "_reagir"]
