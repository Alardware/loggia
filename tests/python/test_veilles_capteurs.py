"""Les veilles, audit des capteurs du 19/10 (lot 2).

Ce qui est verrouille ici, defaut constate par defaut :
  * « Observer sans agir » valait pour tout, sauf les veilles : la VMC et la
    prise des heures creuses partaient quand meme (H3) ;
  * une valeur muette rearmait l'alerte — une pile qui decroche et revient
    sonnait deux fois (M2) — et ce qui avait ete signale s'oubliait au
    redemarrage (M2) ;
  * les piles du serveur ne suivaient pas la regle de l'ecran : le seuil
    exclu, les binaires ignores, les telephones et les batteries
    rechargeables signales, un premier passage une heure apres le
    demarrage (M3) ;
  * un capteur apparu apres le demarrage n'etait jamais suivi (M4) ;
  * une liste recue n'etait pas relue : un entier dans `capteurs` cassait le
    reabonnement, au redemarrage aussi (M24).
"""
from __future__ import annotations

import sys
import types

import pytest

from conftest import FauxStore
from test_veilles import FauxEtat, creer, lancer, module, regles_module  # noqa: F401  (fixtures reutilisees)


def pile(v, nom="Pile"):
    return FauxEtat(str(v), {"device_class": "battery", "friendly_name": nom})


def notifications(v):
    return [a for a in v.hass.services.appels if a[0] == "notify"]


class Entree(types.SimpleNamespace):
    """Une entree du registre des entites, aux champs que la veille lit."""

    def __init__(self, entity_id, **champs):
        base = dict(platform="zha", device_id=None, hidden_by=None, disabled_by=None,
                    device_class=None, original_device_class=None)
        base.update(champs)
        super().__init__(entity_id=entity_id, **base)


def registre(monkeypatch, entrees, appareils=None):
    """Le registre des entites (et des appareils, pour `entry_type`)."""
    reg = types.SimpleNamespace(entities={e.entity_id: e for e in entrees},
                                async_get=lambda h: None)
    reg.async_get = lambda haid: reg.entities.get(haid)
    monkeypatch.setattr(sys.modules["homeassistant.helpers.entity_registry"], "async_get", lambda _h: reg)
    dreg = types.SimpleNamespace(async_get=lambda d: (appareils or {}).get(d))
    monkeypatch.setattr(sys.modules["homeassistant.helpers.device_registry"], "async_get", lambda _h: dreg)


# ── H3 : les veilles respectent « Observer sans agir » ──────────────────────

AIR = {"sensor.co2": FauxEtat("1600", {"device_class": "carbon_dioxide", "friendly_name": "CO2 salon"})}


def test_en_observation_la_ventilation_ne_part_pas(creer):
    """La simulation note ce que la veille AURAIT fait, et ne touche a rien :
    ni la VMC, ni le telephone (ADR 0004, « le telephone aussi se simule »)."""
    v = creer({"co2": {"actif": True, "seuil": 1400, "ventilation": ["switch.vmc"]},
               "simulation": {"actif": True}}, AIR)
    lancer(v._async_co2())
    assert v.hass.services.appels == []
    lignes = lancer(v.regles.journal(module="veilles"))
    assert [(l["quoi"], l["simule"]) for l in lignes] == [("ventiler", True), ("prevenir", True)]


def test_en_observation_les_heures_creuses_n_allument_rien(creer):
    v = creer({"creuses": {"actif": True, "entite": "sensor.tarif", "valeur": "HC",
                           "prises": ["switch.lave_vaisselle"]},
               "simulation": {"actif": True}}, {"sensor.tarif": FauxEtat("HC")})
    lancer(v._async_creuses())
    assert v.hass.services.appels == []


def test_le_drapeau_se_lit_et_s_ecrit_comme_celui_des_autres_modules(creer):
    """Le meme patch que les volets ou la nuit : `{simulation: {actif}}`. Une
    valeur qui n'est pas un booleen ne met pas en observation."""
    v = creer({}, {})
    assert v.cfg["simulation"] == {"actif": False}
    cfg = lancer(v.async_enregistrer({"simulation": {"actif": True}}))
    assert cfg["simulation"] == {"actif": True}
    assert lancer(v.async_etat())["config"]["simulation"] == {"actif": True}
    cfg = lancer(v.async_enregistrer({"simulation": {"actif": "oui"}}))
    assert cfg["simulation"] == {"actif": False}


def test_basculer_l_observation_repart_de_zero(creer):
    """Une alerte simulee n'est jamais partie : revenue au reel, la veille doit
    pouvoir la dire pour de vrai (ADR 0004)."""
    v = creer({"batterie": {"actif": True, "seuil": 15}, "simulation": {"actif": True}},
              {"sensor.p": pile(8)})
    lancer(v._async_batteries())
    assert notifications(v) == [] and v.signales == {"bat:sensor.p"}
    lancer(v.async_enregistrer({"simulation": {"actif": False}}))
    assert v.signales == set()
    lancer(v._async_batteries())
    assert len(notifications(v)) == 1


# ── M2 : une valeur muette ne rearme jamais ─────────────────────────────────

def test_une_pile_qui_decroche_ne_realerte_pas(creer):
    v = creer({"batterie": {"actif": True, "seuil": 15}}, {"sensor.p": pile(8)})
    lancer(v._async_batteries())
    v.hass.states.table["sensor.p"] = pile("unavailable")
    lancer(v._async_batteries())
    v.hass.states.table["sensor.p"] = pile(8)
    lancer(v._async_batteries())
    assert len(notifications(v)) == 1


def test_un_co2_qui_decroche_ne_realerte_pas(creer):
    v = creer({"co2": {"actif": True, "seuil": 1400}}, dict(AIR))
    lancer(v._async_co2())
    v.hass.states.table["sensor.co2"] = FauxEtat("unavailable", {"device_class": "carbon_dioxide"})
    lancer(v._async_co2())
    v.hass.states.table["sensor.co2"] = FauxEtat("1600", {"device_class": "carbon_dioxide"})
    lancer(v._async_co2())
    assert len(notifications(v)) == 1
    # Seule une vraie valeur, franchement revenue, rearme.
    v.hass.states.table["sensor.co2"] = FauxEtat("900", {"device_class": "carbon_dioxide"})
    lancer(v._async_co2())
    v.hass.states.table["sensor.co2"] = FauxEtat("1600", {"device_class": "carbon_dioxide"})
    lancer(v._async_co2())
    assert len(notifications(v)) == 2


def test_un_consommable_muet_ne_rearme_pas(creer):
    etats = {"sensor.brosse": FauxEtat("5", {"unit_of_measurement": "%"})}
    v = creer({"consommables": {"actif": True, "seuil": 10, "capteurs": ["sensor.brosse"]}}, etats)
    lancer(v._async_consommables())
    v.hass.states.table["sensor.brosse"] = FauxEtat("unknown", {})
    lancer(v._async_consommables())
    v.hass.states.table["sensor.brosse"] = FauxEtat("5", {"unit_of_measurement": "%"})
    lancer(v._async_consommables())
    assert len(notifications(v)) == 1


def test_le_seuil_du_co2_par_defaut_est_celui_de_la_maison(creer, module):
    """Le repli `seuil, 1200` contredisait le defaut a 1400 (confort.js) :
    une configuration sans seuil alertait a 1300 ppm."""
    v = creer({"co2": {"actif": True}}, {"sensor.co2": FauxEtat("1300", {"device_class": "carbon_dioxide"})})
    del v.cfg["co2"]["seuil"]
    lancer(v._async_co2())
    assert notifications(v) == []
    assert module.DEFAUT["co2"]["seuil"] == 1400


# ── M2 : ce qui a ete signale survit au redemarrage ─────────────────────────

def test_les_piles_signalees_ne_resonnent_pas_au_redemarrage(creer):
    """`signales` vit dans son fichier du magasin, comme le carnet des robots :
    a chaque redemarrage, chaque pile basse repartait au telephone."""
    v = creer({"batterie": {"actif": True, "seuil": 15}}, {"sensor.p": pile(8)})
    lancer(v._async_batteries())
    assert v._depot.contenu == {"signales": ["bat:sensor.p"]}
    w = creer({"batterie": {"actif": True, "seuil": 15}}, {"sensor.p": pile(8)})
    w._depot = FauxStore(v._depot.contenu)
    lancer(w._async_lire_etat())
    lancer(w._async_batteries())
    assert notifications(w) == []
    # Pile changee : on l'oublie, et le fichier aussi.
    w.hass.states.table["sensor.p"] = pile(100)
    lancer(w._async_batteries())
    assert w._depot.contenu == {"signales": []}


def test_un_fichier_d_etat_abime_repart_a_vide(creer):
    v = creer({}, {})
    v._depot = FauxStore({"signales": ["bat:sensor.p", 3, None, "autre:chose"]})
    lancer(v._async_lire_etat())
    assert v.signales == {"bat:sensor.p"}
    v._depot = FauxStore("illisible")
    lancer(v._async_lire_etat())
    assert v.signales == set()


# ── M3 : les piles du serveur suivent la regle de l'ecran ───────────────────

def test_une_pile_au_seuil_est_signalee(creer):
    """L'ecran dit « a changer » a 15 % pour un seuil de 15 (`niveauPile`,
    `<=`) ; le serveur se taisait jusqu'a 14."""
    v = creer({"batterie": {"actif": True, "seuil": 15}}, {"sensor.p": pile(15)})
    lancer(v._async_batteries())
    assert len(notifications(v)) == 1


def test_une_pile_binaire_allumee_est_signalee(creer, monkeypatch):
    """`binary_sensor` de classe `battery` : `on` veut dire faible. Il n'a pas
    de chiffre ; il etait ignore."""
    registre(monkeypatch, [Entree("binary_sensor.porte_pile", device_id="d1")], {"d1": types.SimpleNamespace(entry_type=None)})
    v = creer({"batterie": {"actif": True, "seuil": 15}},
              {"binary_sensor.porte_pile": FauxEtat("on", {"device_class": "battery", "friendly_name": "Porte"})})
    lancer(v._async_batteries())
    assert [c["message"] for _, _, c in notifications(v)] == ["Porte : pile faible"]
    lancer(v._async_batteries())
    assert len(notifications(v)) == 1, "une seule fois"
    v.hass.states.table["binary_sensor.porte_pile"] = FauxEtat("unavailable", {"device_class": "battery"})
    lancer(v._async_batteries())
    v.hass.states.table["binary_sensor.porte_pile"] = FauxEtat("on", {"device_class": "battery", "friendly_name": "Porte"})
    lancer(v._async_batteries())
    assert len(notifications(v)) == 1, "le silence ne rearme pas"
    v.hass.states.table["binary_sensor.porte_pile"] = FauxEtat("off", {"device_class": "battery"})
    lancer(v._async_batteries())
    assert v.signales == set()


def test_une_pile_binaire_a_cote_d_une_pile_chiffree_ne_double_pas(creer, monkeypatch):
    """Comme l'ecran (`pilesDeLaMaison`) : un appareil qui a une pile chiffree
    ne se dit pas deux fois par son binaire."""
    registre(monkeypatch, [Entree("binary_sensor.porte_pile", device_id="d1"),
                           Entree("sensor.porte_pile", device_id="d1")],
             {"d1": types.SimpleNamespace(entry_type=None)})
    v = creer({"batterie": {"actif": True, "seuil": 15}},
              {"binary_sensor.porte_pile": FauxEtat("on", {"device_class": "battery"}),
               "sensor.porte_pile": pile(60)})
    lancer(v._async_batteries())
    assert notifications(v) == []


def test_ni_telephone_ni_batterie_rechargeable(creer, monkeypatch):
    """Les telephones (`mobile_app`) et les batteries rechargeables — un robot,
    ce que l'appareil charge (`battery_charging`) — sont hors de la carte
    Piles de l'ecran ; le serveur les signalait."""
    registre(monkeypatch, [
        Entree("sensor.pixel_battery_level", platform="mobile_app", device_id="tel"),
        Entree("sensor.robot_batterie", device_id="robot"), Entree("vacuum.robot", device_id="robot"),
        Entree("sensor.voiture_batterie", device_id="auto"),
        Entree("binary_sensor.voiture_charge", device_id="auto", original_device_class="battery_charging"),
        Entree("sensor.cachee", hidden_by="user"),
        Entree("sensor.porte", device_id="d1"),
    ])
    etats = {"sensor.pixel_battery_level": pile(9), "sensor.robot_batterie": pile(9),
             "sensor.voiture_batterie": pile(9), "sensor.cachee": pile(9), "sensor.porte": pile(9, "Porte")}
    v = creer({"batterie": {"actif": True, "seuil": 15}}, etats)
    lancer(v._async_batteries())
    assert [c["message"] for _, _, c in notifications(v)] == ["Porte : pile a 9 %"]


def test_la_batterie_de_la_maison_reste_a_l_energie(creer):
    """Le role `batSoc` d'Energie (`loggia_energyHaids`) : l'ecran l'ecarte de
    la carte Piles, le serveur aussi."""
    v = creer({"batterie": {"actif": True, "seuil": 15}},
              {"sensor.powerwall_soc": pile(8, "Powerwall"), "sensor.porte": pile(8, "Porte")})
    v.store._store.contenu["shared"]["loggia_energyHaids"] = {"batSoc": "sensor.powerwall_soc"}
    v.store._data = None
    lancer(v._async_batteries())
    assert [c["message"] for _, _, c in notifications(v)] == ["Porte : pile a 8 %"]


def test_la_batterie_du_tableau_energie_reste_a_l_energie(creer, monkeypatch):
    """Sans fiche, l'ecran prend la batterie du tableau de bord Energie de Home
    Assistant, et sa pile sur le meme appareil (resolve.js) : le serveur lit
    le meme tableau."""
    registre(monkeypatch, [Entree("sensor.batterie_energie", device_id="bat"),
                           Entree("sensor.batterie_niveau", device_id="bat")])
    prefs = {"energy_sources": [{"type": "battery", "stat_energy_from": "sensor.batterie_energie"}]}

    async def gestionnaire(_hass):
        return types.SimpleNamespace(data=prefs)

    energy = types.ModuleType("homeassistant.components.energy.data")
    energy.async_get_manager = gestionnaire
    monkeypatch.setitem(sys.modules, "homeassistant.components", types.ModuleType("homeassistant.components"))
    monkeypatch.setitem(sys.modules, "homeassistant.components.energy", types.ModuleType("homeassistant.components.energy"))
    monkeypatch.setitem(sys.modules, "homeassistant.components.energy.data", energy)
    v = creer({"batterie": {"actif": True, "seuil": 15}}, {"sensor.batterie_niveau": pile(8)})
    lancer(v._async_batteries())
    assert notifications(v) == []


def test_le_premier_passage_a_lieu_au_demarrage_complet(creer):
    """Un passage par heure, mais le premier quand Home Assistant a fini de
    demarrer — pas une heure apres."""
    v = creer({"batterie": {"actif": True, "seuil": 15}}, {"sensor.p": pile(8)})
    lancer(v._async_rattraper())
    assert len(notifications(v)) == 1


# ── M4 : un capteur apparu apres le demarrage est suivi ─────────────────────

class FauxBus:
    def __init__(self):
        self.ecoutes = []

    def async_listen(self, evenement, rappel):
        entree = [evenement, rappel, True]
        self.ecoutes.append(entree)

        def retirer():
            entree[2] = False
        return retirer


def test_un_capteur_de_co2_apparu_apres_le_demarrage_est_suivi(creer, monkeypatch):
    ev = sys.modules["homeassistant.helpers.event"]
    poses, delais = [], []
    monkeypatch.setattr(ev, "async_track_state_change_event",
                        lambda h, ids, cb: poses.append(list(ids)) or (lambda: None))
    monkeypatch.setattr(ev, "async_call_later",
                        lambda h, d, cb: delais.append(cb) or (lambda: None))
    v = creer({"co2": {"actif": True}}, {})
    v.hass.bus = FauxBus()
    lancer(v._async_rattraper())
    assert poses == []
    assert [e[0] for e in v.hass.bus.ecoutes] == ["entity_registry_updated"]
    # Le capteur arrive : le registre le dit, la veille se reabonne un peu apres.
    v.hass.states.table["sensor.salon_co2"] = FauxEtat("700", {"device_class": "carbon_dioxide"})
    rappel = v.hass.bus.ecoutes[0][1]
    rappel(types.SimpleNamespace(data={"action": "create", "entity_id": "sensor.salon_co2"}))
    rappel(types.SimpleNamespace(data={"action": "create", "entity_id": "sensor.salon_co2_bis"}))
    assert len(delais) == 1, "une rafale du registre ne pose qu'un reabonnement"
    delais[0](None)
    lancer(v.hass.taches.pop())
    assert poses == [["sensor.salon_co2"]]
    # Une lampe qui arrive ne regarde pas les veilles.
    rappel(types.SimpleNamespace(data={"action": "create", "entity_id": "light.salon"}))
    assert len(delais) == 1


def test_pas_de_fuite_d_abonnement(creer):
    v = creer({}, {})
    v.hass.bus = FauxBus()
    lancer(v._async_rattraper())
    lancer(v._async_rattraper())
    assert len(v.hass.bus.ecoutes) == 1, "un second demarrage a pose une seconde ecoute du registre"
    v.async_arreter()
    assert v.hass.bus.ecoutes[0][2] is False


# ── M24 : seules des entites passent ────────────────────────────────────────

def test_une_valeur_qui_n_est_pas_une_entite_est_ecartee(creer, monkeypatch):
    ev = sys.modules["homeassistant.helpers.event"]
    monkeypatch.setattr(ev, "async_track_state_change_event", lambda h, ids, cb: sorted(ids) and (lambda: None))
    v = creer({}, {})
    cfg = lancer(v.async_enregistrer({
        "co2": {"actif": True, "capteurs": ["sensor.a", 3, "pas une entite", None, "Sensor.B"],
                "ventilation": "switch.vmc"},
        "creuses": {"actif": True, "entite": {"x": 1}, "prises": ["switch.lave_vaisselle", ["x"]]},
        "consommables": {"capteurs": ["sensor.filtre", 7]},
    }))
    assert cfg["co2"]["capteurs"] == ["sensor.a"]
    assert cfg["co2"]["ventilation"] == []
    assert cfg["creuses"]["entite"] == "" and cfg["creuses"]["prises"] == ["switch.lave_vaisselle"]
    assert cfg["consommables"]["capteurs"] == ["sensor.filtre"]
    # Et rien d'invalide n'a ete ecrit.
    assert lancer(v.store.async_get_shared("loggia_veilles"))["co2"]["capteurs"] == ["sensor.a"]


def test_une_configuration_deja_abimee_se_relit_propre(creer):
    """Ce qu'une version d'avant a laisse ecrire ne casse plus le demarrage."""
    v = creer({"co2": {"actif": True, "capteurs": ["sensor.a", 3]}}, {})
    assert v.cfg["co2"]["capteurs"] == ["sensor.a"]
    lancer(v._async_reabonner())


# ── Relecture du lot 2 ──────────────────────────────────────────────────────

def test_une_pile_non_dite_reste_a_dire(creer):
    """Point 4 : la cle n'entre dans `signales` — persiste — que si la
    notification est partie. Un telephone pas encore pret au demarrage
    faisait perdre l'alerte de pile pour toujours."""
    v = creer({"batterie": {"actif": True, "seuil": 15}}, {"sensor.p": pile(8)}, notify=None)
    lancer(v._async_batteries())
    assert notifications(v) == [] and v.signales == set()
    assert v._depot.contenu is None, "rien a ecrire : rien n'a ete dit"
    v.store._store.contenu["shared"]["loggia_alertes"] = {"service": "mobile"}
    v.store._data = None
    lancer(v._async_batteries())
    assert len(notifications(v)) == 1 and v.signales == {"bat:sensor.p"}


def test_un_consommable_non_dit_reste_a_dire(creer):
    etats = {"sensor.brosse": FauxEtat("5", {"unit_of_measurement": "%"})}
    v = creer({"consommables": {"actif": True, "seuil": 10, "capteurs": ["sensor.brosse"]}}, etats, notify=None)
    lancer(v._async_consommables())
    assert v.signales == set()


def test_ce_qui_n_est_plus_suivi_sort_de_signales(creer, monkeypatch):
    """Point 6 : une entite supprimee, un capteur qu'on ne designe plus,
    sortent de `signales` au passage suivant — la limite de 1000 ne jette
    jamais une vraie cle.

    ASSERTION MODIFIEE (contre-relecture, point A) : « supprimee » veut dire
    sans etat ET absente du registre des entites ; le registre est donc pose
    ici. Sans lui, on ne sait pas, et la cle reste."""
    registre(monkeypatch, [Entree("sensor.p")])
    v = creer({"batterie": {"actif": True, "seuil": 15},
               "consommables": {"actif": True, "seuil": 10, "capteurs": ["sensor.brosse"]},
               "co2": {"actif": True, "seuil": 1400, "capteurs": ["sensor.co2"]}},
              {"sensor.p": pile(8), "sensor.brosse": FauxEtat("50", {}),
               "sensor.co2": FauxEtat("800", {"device_class": "carbon_dioxide"})})
    v.signales = {"bat:sensor.p", "bat:sensor.disparue", "conso:sensor.ancien", "co2:sensor.vieux", "co2:sensor.co2"}
    lancer(v._async_batteries())
    lancer(v._async_consommables())
    lancer(v._async_co2())
    assert v.signales == {"bat:sensor.p"}
    assert v._depot.contenu == {"signales": ["bat:sensor.p"]}


def test_un_reabonnement_ne_repousse_pas_le_passage_horaire(creer, monkeypatch, caplog):
    """Point 7 : chaque rafale du registre reposait l'intervalle d'une heure —
    le passage des piles reculait sans fin. Il ne se pose qu'une fois, et se
    retire quand plus rien ne le demande. Et pas un INFO par reabonnement."""
    ev = sys.modules["homeassistant.helpers.event"]
    poses = []

    def intervalle(_h, _cb, _delai):
        entree = {"actif": True}
        poses.append(entree)

        def retirer():
            entree["actif"] = False
        return retirer

    monkeypatch.setattr(ev, "async_track_time_interval", intervalle)
    v = creer({"batterie": {"actif": True, "seuil": 15}}, {})
    with caplog.at_level("INFO", logger=v.__module__):
        lancer(v._async_reabonner())
        lancer(v._async_reabonner())
    assert len(poses) == 1 and poses[0]["actif"]
    assert [r for r in caplog.records if r.levelname == "INFO"] == []
    v.cfg["batterie"]["actif"] = False
    lancer(v._async_reabonner())
    assert poses[0]["actif"] is False
    v.async_arreter()


def test_un_identifiant_suivi_d_un_saut_de_ligne_n_est_pas_une_entite():
    """Point 5 : `^…$` avec `match` accepte « sensor.a\n » ; `fullmatch` non."""
    from conftest import charger

    regles = charger("regles")
    assert regles.est_entite("sensor.a") is True
    assert regles.est_entite("sensor.a\n") is False
    assert regles.entites_propres(["sensor.a\n", "sensor.b"]) == ["sensor.b"]


def test_une_pile_pas_encore_creee_au_demarrage_garde_sa_cle(creer, monkeypatch):
    """Contre-relecture, point A : au premier passage du demarrage, Zigbee2MQTT
    n'a pas encore cree l'entite. Sa cle `bat:` etait purgee puis effacee du
    disque, et la pile, toujours basse, repartait au telephone a chaque
    redemarrage. Une entite qui a encore son entree au registre — ou un
    registre illisible — garde sa cle."""
    v = creer({"batterie": {"actif": True, "seuil": 15}}, {})
    v.signales = {"bat:sensor.p"}
    lancer(v._async_batteries())                 # registre illisible : on ne sait pas
    assert v.signales == {"bat:sensor.p"}
    registre(monkeypatch, [Entree("sensor.p")])
    lancer(v._async_batteries())                 # au registre, pas encore d'etat
    assert v.signales == {"bat:sensor.p"}
    v.hass.states.table["sensor.p"] = pile(8)
    lancer(v._async_batteries())                 # elle arrive, toujours a 8 %
    assert notifications(v) == [], "re-notifiee apres redemarrage"
    # Supprimee pour de bon (ni etat, ni registre) : elle sort.
    del v.hass.states.table["sensor.p"]
    registre(monkeypatch, [])
    lancer(v._async_batteries())
    assert v.signales == set()


def test_le_co2_decouvert_garde_sa_cle_tant_que_l_entite_existe(creer, monkeypatch):
    """Le meme principe pour le CO2 decouvert (aucun capteur designe) : un
    capteur pas encore cree au demarrage garde sa cle."""
    registre(monkeypatch, [Entree("sensor.co2_salon")])
    v = creer({"co2": {"actif": True, "seuil": 1400}}, {})
    v.signales = {"co2:sensor.co2_salon", "co2:sensor.vieux"}
    lancer(v._async_co2())
    assert v.signales == {"co2:sensor.co2_salon"}
