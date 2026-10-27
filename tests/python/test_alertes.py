"""Les alertes de surete, sur le socle des regles.

Ce qui compte ici tient en une phrase : le DANGER reveille, le reste attend.
Fumee, gaz, monoxyde, fuite, alarme partent en critique — par-dessus les
heures calmes et par-dessus le mode silencieux du telephone. L'ouverture
pendant que l'alarme est armee, elle, attend son heure comme les autres.
"""
from __future__ import annotations

import asyncio
import sys
import types
from datetime import datetime

import pytest

from conftest import FauxStore, charger


def lancer(coro):
    return asyncio.run(coro)


class FauxEtat:
    def __init__(self, entity_id, state, attributes=None):
        self.entity_id = entity_id
        self.state = state
        self.attributes = attributes or {}


class FauxEtats:
    def __init__(self, table):
        self.table = dict(table)

    def get(self, haid):
        return self.table.get(haid)

    def async_all(self, domaine):
        return [s for h, s in self.table.items() if h.startswith(domaine + '.')]


class FauxServices:
    def __init__(self, existants=('mobile',)):
        self.appels = []
        self.existants = set(existants)

    def has_service(self, domaine, service):
        return service in self.existants

    async def async_call(self, domaine, service, data, blocking=False, context=None):
        self.appels.append((domaine, service, dict(data)))


class FauxBus:
    def async_listen(self, *_a, **_k):
        return lambda: None


class FauxHass:
    def __init__(self, etats):
        self.states = FauxEtats(etats)
        self.services = FauxServices()
        self.bus = FauxBus()
        self.taches = []

    def async_create_task(self, coro):
        self.taches.append(coro)
        return coro

    def abandonner(self):
        taches, self.taches = self.taches, []
        for coro in taches:
            coro.close()


@pytest.fixture
def module():
    return charger("alertes")


@pytest.fixture
def creer(module, store_module):
    regles_module = charger("regles")
    faits = []

    def fabrique(config=None, etats=None, quand=None, partage=None):
        cfg = {"actif": True, "service": "mobile",
               "categories": {"fumee": True, "gaz": True, "co": True, "fuite": True,
                              "alarme": True, "portes": True},
               "cooldown_min": 5}
        cfg.update(config or {})
        magasin = store_module.LoggiaStore.__new__(store_module.LoggiaStore)
        magasin._store = FauxStore({"users": {}, "shared": {"loggia_alertes": cfg, **(partage or {})},
                                    "migrated": True})
        magasin._ancien = FauxStore(None)
        magasin._data = None
        magasin._lock = asyncio.Lock()

        a = module.LoggiaAlertes.__new__(module.LoggiaAlertes)
        a._hass = FauxHass(etats or {})
        a._store = magasin
        a._dernier = {}
        # La maison qui reagit (§18) : le vrai constructeur les pose, la fabrique aussi.
        a._dangers = {}
        a._avant = {}
        # ASSERTION MODIFIEE (etape 3 IoT, 25/10 ; I30) : les vannes coupees, une liste - toutes les vannes d'eau faute d'en avoir choisi une.
        a._vannes_coupees = []
        # Audit du 19/10 : le dernier etat connu avant un silence (H5), les
        # detecteurs muets guettes et deja signales (M5), l'attente du
        # demarrage (H4) — le vrai constructeur les pose, la fabrique aussi.
        a._connu = {}
        a._rendus_au_silence = set()
        a._muets = {}
        a._muets_dits = set()
        a._au_demarrage = None
        # Relecture du lot 2 : Home Assistant tourne deja (une apparition est un
        # evenement), et les detecteurs muets deja dits vivent dans un fichier.
        a._demarre = True
        a._depot = FauxStore(None)
        a._regles = regles_module.Regles(a._hass, magasin)
        a._regles._depot = FauxStore(None)
        if quand is not None:
            a._regles._maintenant = lambda: quand
        faits.append(a)
        return a

    yield fabrique
    for a in faits:
        a._hass.abandonner()


FUMEE = FauxEtat("binary_sensor.cuisine_fumee", "on",
                 {"device_class": "smoke", "friendly_name": "Fumée cuisine"})
PORTE = FauxEtat("binary_sensor.entree", "on",
                 {"device_class": "door", "friendly_name": "Porte d'entrée"})
CALME = {"actif": True, "debut": "22:00", "fin": "07:00"}
NUIT = datetime(2026, 9, 12, 3, 0)


def test_la_fumee_reveille_meme_la_nuit(creer):
    """Le seul canal qui contourne les heures calmes — et le mode silencieux du
    telephone avec."""
    a = creer({"calme": CALME}, quand=NUIT)
    lancer(a._envoyer(FUMEE, "fumee", "Fumée détectée"))
    assert len(a._hass.services.appels) == 1
    domaine, service, charge = a._hass.services.appels[0]
    assert (domaine, service) == ("notify", "mobile")
    assert charge["message"] == "Fumée détectée : Fumée cuisine"
    assert charge["title"] == "Loggia — sûreté"
    assert charge["data"]["channel"] == "alarm_stream"
    assert charge["data"]["push"]["sound"]["critical"] == 1


def test_chaque_danger_est_critique(module):
    for cat in ("fumee", "gaz", "co", "fuite", "alarme"):
        assert cat in module.DANGER, cat
    assert "portes" not in module.DANGER


def test_une_classe_qui_ne_nomme_pas_le_danger_ne_declenche_rien(module):
    """`safety` ne dit pas DE QUOI il s'agit — et Meteoalarm s'en sert pour une
    alerte METEO.

    Il etait range en « fumee » : le 06/10/2026 a 06:10, une alerte meteo a
    ouvert le volet d'une chambre ou dormaient des gens et allume les quatorze
    lumieres de la maison. Le journal disait « fumee : meteoalarm ». Quatre fois
    en dix jours, prises pour un mystere.
    """
    assert "safety" not in module.BINAIRES, (
        "une classe fourre-tout ne doit jamais declencher une evacuation")
    # Celles qui restent nomment toutes ce qu'elles ont vu.
    assert set(module.BINAIRES) == {"smoke", "gas", "carbon_monoxide", "moisture"}
    # Et chacune part bien dans une categorie qui reveille.
    for dc, (cat, _msg) in module.BINAIRES.items():
        assert cat in module.DANGER, dc


def test_ce_qui_ouvre_les_volets_et_allume_reste_nomme(module):
    """Le garde-fou de l'autre bout : meme si une classe revenait par megarde,
    les categories qui AGISSENT restent celles qu'on a choisies une a une."""
    assert module.VOLETS == ("fumee", "co", "gaz")
    assert module.LUMIERES == ("fumee", "co", "alarme")
    assert module.VANNE == ("fuite",)


def test_une_porte_attend_son_heure(creer):
    """L'ouverture pendant que l'alarme est armee n'est pas un danger : la
    nuit, elle arrive en silence."""
    a = creer({"calme": CALME}, quand=NUIT)
    lancer(a._envoyer(PORTE, "portes", "Ouverture pendant que l'alarme est armée"))
    charge = a._hass.services.appels[0][2]
    assert charge["data"] == {"importance": "low", "push": {"sound": "none"}}


def test_une_porte_le_jour_sonne_normalement(creer):
    a = creer({"calme": CALME}, quand=datetime(2026, 9, 12, 15, 0))
    lancer(a._envoyer(PORTE, "portes", "Ouverture pendant que l'alarme est armée"))
    assert "data" not in a._hass.services.appels[0][2]


def test_le_journal_commun_garde_l_alerte(creer):
    a = creer()
    lancer(a._envoyer(FUMEE, "fumee", "Fumée détectée"))
    ligne = lancer(a._regles.journal())[0]
    assert (ligne["module"], ligne["regle"], ligne["quoi"]) == ("alertes", "fumee", "alerter")
    assert ligne["motif"] == "binary_sensor.cuisine_fumee"
    assert ligne["detail"].startswith("critique")


def test_alertes_coupees_rien_ne_part(creer):
    a = creer({"actif": False})
    lancer(a._envoyer(FUMEE, "fumee", "Fumée détectée"))
    assert a._hass.services.appels == []


def test_une_categorie_decochee_ne_part_pas(creer):
    a = creer({"categories": {"fumee": False}})
    lancer(a._envoyer(FUMEE, "fumee", "Fumée détectée"))
    assert a._hass.services.appels == []


def test_l_anti_rafale_tient_sauf_pour_l_alarme(creer):
    a = creer()
    lancer(a._envoyer(FUMEE, "fumee", "Fumée détectée"))
    lancer(a._envoyer(FUMEE, "fumee", "Fumée détectée"))
    assert len(a._hass.services.appels) == 1, "un capteur qui bat a mitraille le telephone"
    alarme = FauxEtat("alarm_control_panel.maison", "triggered", {"friendly_name": "Maison"})
    lancer(a._envoyer(alarme, "alarme", "Alarme déclenchée", urgent=True))
    lancer(a._envoyer(alarme, "alarme", "Alarme déclenchée", urgent=True))
    assert len(a._hass.services.appels) == 3, "l'alarme passe toujours, sans delai"


def test_sans_telephone_rien_ne_part_et_le_journal_le_dit(creer):
    a = creer({"service": ""})
    lancer(a._envoyer(FUMEE, "fumee", "Fumée détectée"))
    assert a._hass.services.appels == []
    assert lancer(a._regles.journal())[0]["detail"].startswith("personne a qui parler")


def test_juste_apres_un_redemarrage_l_alerte_part_quand_meme(creer, module, monkeypatch):
    """`monotonic()` compte depuis le demarrage de la machine. Comparer a 0.0
    faisait passer une premiere alerte pour une rafale pendant les cinq
    minutes suivant un reboot — et la fumee detectee a ce moment-la etait
    jetee. Trouve parce que la machine d'integration demarre a chaque fois."""
    monkeypatch.setattr(module.time, "monotonic", lambda: 12.0)
    a = creer()
    lancer(a._envoyer(FUMEE, "fumee", "Fumée détectée"))
    assert len(a._hass.services.appels) == 1, "l'alerte d'apres reboot a ete prise pour une rafale"


# ─────────────────────────────────────────────────────────────────────────────
# La maison reagit (§18, moitie « action », ADR 0022).
#
# Sur un danger, en tete de l'echelle : lumieres a 100 % (pas sur le gaz),
# volets remontes, vanne coupee. Quand le danger passe, tout revient comme
# avant — sauf la vanne, et sauf ce qu'une main a pris entre temps.
# ─────────────────────────────────────────────────────────────────────────────

def maison():
    return {
        "light.salon": FauxEtat("light.salon", "on", {"brightness": 80}),
        "light.couloir": FauxEtat("light.couloir", "off"),
        "cover.salon": FauxEtat("cover.salon", "closed", {"device_class": "shutter", "current_position": 0}),
        "cover.garage": FauxEtat("cover.garage", "closed", {"device_class": "garage"}),
        "valve.eau": FauxEtat("valve.eau", "open", {"device_class": "water"}),
    }


GAZ = FauxEtat("binary_sensor.cuisine_gaz", "on", {"device_class": "gas", "friendly_name": "Gaz cuisine"})
FUITE = FauxEtat("binary_sensor.sdb_fuite", "on", {"device_class": "moisture", "friendly_name": "Fuite SDB"})
ALARME = FauxEtat("alarm_control_panel.maison", "triggered", {"friendly_name": "Maison"})


def appels(a):
    return [(d, s, c.get("entity_id"), {k: v for k, v in c.items() if k != "entity_id"})
            for d, s, c in a._hass.services.appels]


def test_la_fumee_allume_tout_et_remonte_les_volets(creer):
    a = creer(etats=maison())
    lancer(a._reagir(FUMEE, "fumee"))
    assert appels(a) == [
        ("light", "turn_on", ["light.couloir", "light.salon"], {"brightness_pct": 100}),
        ("cover", "open_cover", ["cover.salon"], {}),
    ]
    # La porte de garage n'est pas un volet ; le reste est tenu.
    assert a._regles.tenues("alertes") == {"light.couloir": "danger", "light.salon": "danger",
                                           "cover.salon": "danger"}
    lignes = lancer(a._regles.journal())
    assert [l["quoi"] for l in lignes] == ["remonter", "allumer"]
    assert lignes[0]["motif"] == "fumee : Fumée cuisine"


def test_pas_de_lumiere_sur_le_gaz(creer):
    a = creer(etats=maison())
    lancer(a._reagir(GAZ, "gaz"))
    assert [(d, s) for d, s, _ in a._hass.services.appels] == [("cover", "open_cover")]


def test_la_fuite_coupe_la_vanne(creer):
    a = creer(etats=maison())
    lancer(a._reagir(FUITE, "fuite"))
    assert appels(a) == [("valve", "close_valve", ["valve.eau"], {})]
    # ASSERTION MODIFIEE (etape 3 IoT, 25/10 ; I30) : la liste des vannes coupees.
    assert a._vannes_coupees == ["valve.eau"]


def test_une_prise_designee_vaut_une_vanne(creer):
    etats = {**maison(), "switch.arrivee_eau": FauxEtat("switch.arrivee_eau", "on")}
    a = creer({"actions": {"vanne": {"actif": True, "entite": "switch.arrivee_eau"}}}, etats)
    lancer(a._reagir(FUITE, "fuite"))
    assert appels(a) == [("switch", "turn_off", ["switch.arrivee_eau"], {})]


def test_sans_vanne_le_journal_le_dit(creer):
    etats = maison()
    del etats["valve.eau"]
    a = creer(etats=etats)
    lancer(a._reagir(FUITE, "fuite"))
    assert a._hass.services.appels == []
    ligne = lancer(a._regles.journal())[0]
    assert ligne["quoi"] == "couper"
    assert ligne["n"] == 0
    assert "aucune vanne" in ligne["detail"]


def test_l_alarme_allume_sans_remonter(creer):
    a = creer(etats=maison())
    lancer(a._reagir(ALARME, "alarme"))
    assert [(d, s) for d, s, _ in a._hass.services.appels] == [("light", "turn_on")]


def test_le_danger_prime_sur_le_vent_et_sur_tout(module):
    regles = charger("regles")
    assert module.PRIORITE == regles.niveau("surete", 19)
    assert module.PRIORITE > regles.niveau("surete", 10)


def test_le_danger_passe_la_maison_revient_comme_avant(creer):
    a = creer(etats=maison())
    lancer(a._reagir(FUMEE, "fumee"))
    a._hass.services.appels.clear()
    lancer(a._danger_passe(FUMEE.entity_id))
    assert appels(a) == [
        ("light", "turn_off", ["light.couloir"], {}),
        ("light", "turn_on", ["light.salon"], {"brightness": 80}),
        ("cover", "close_cover", ["cover.salon"], {}),
    ]
    assert a._regles.tenues("alertes") == {}
    assert a._avant == {}
    assert lancer(a._regles.journal())[0]["motif"] == "danger passé"


def test_deux_dangers_on_ne_rend_qu_a_la_fin_du_dernier(creer):
    a = creer(etats=maison())
    lancer(a._reagir(FUMEE, "fumee"))
    lancer(a._reagir(GAZ, "gaz"))
    a._hass.services.appels.clear()
    lancer(a._danger_passe(FUMEE.entity_id))
    assert a._hass.services.appels == [], "un danger dure encore"
    lancer(a._danger_passe(GAZ.entity_id))
    assert len(a._hass.services.appels) == 3


def test_le_second_danger_ne_retient_pas_l_etat_du_premier(creer):
    a = creer(etats=maison())
    lancer(a._reagir(FUMEE, "fumee"))
    # Home Assistant a applique : tout est a 100 % et ouvert.
    a._hass.states.table["light.couloir"] = FauxEtat("light.couloir", "on", {"brightness": 255})
    a._hass.states.table["cover.salon"] = FauxEtat("cover.salon", "open", {"device_class": "shutter", "current_position": 100})
    lancer(a._reagir(GAZ, "gaz"))
    assert a._avant["light.couloir"]["state"] == "off"
    assert a._avant["cover.salon"]["position"] == 0


def test_une_main_pendant_l_alerte_garde_le_dernier_mot(creer):
    from homeassistant.core import Context
    a = creer(etats=maison())
    lancer(a._reagir(FUMEE, "fumee"))
    a._hass.services.appels.clear()

    class Ev:
        data = {"entity_id": "light.couloir"}
        context = Context(user_id="u1")

    a._regles._sur_changement(Ev())
    lancer(a._danger_passe(FUMEE.entity_id))
    assert [(d, s) for d, s, _ in a._hass.services.appels] == [("light", "turn_on"), ("cover", "close_cover")]
    # La regle n'essaie meme pas : ce n'est pas le gel du socle qui l'ecarte
    # apres coup, c'est la tenue perdue qui la retient avant.
    assert all("sous la main" not in l["detail"] for l in lancer(a._regles.journal()))


def test_la_vanne_reste_coupee_et_le_journal_le_dit(creer):
    a = creer(etats=maison())
    lancer(a._reagir(FUITE, "fuite"))
    a._hass.services.appels.clear()
    lancer(a._danger_passe(FUITE.entity_id))
    assert a._hass.services.appels == [], "la vanne a ete rouverte toute seule"
    ligne = lancer(a._regles.journal())[0]
    assert ligne["quoi"] == "laisser coupée"
    assert "rouvre à la main" in ligne["detail"]
    # ASSERTION MODIFIEE (etape 3 IoT, 25/10 ; I30) : la liste des vannes coupees, videe.
    assert a._vannes_coupees == []
    assert a._regles.tenues("alertes") == {}


def test_ce_qui_etait_deja_a_fond_n_est_pas_rendu(creer):
    etats = maison()
    etats["light.salon"] = FauxEtat("light.salon", "on", {"brightness": 255})
    etats["cover.salon"] = FauxEtat("cover.salon", "open", {"device_class": "shutter", "current_position": 100})
    a = creer(etats=etats)
    lancer(a._reagir(FUMEE, "fumee"))
    a._hass.services.appels.clear()
    lancer(a._danger_passe(FUMEE.entity_id))
    assert appels(a) == [("light", "turn_off", ["light.couloir"], {})]


def test_un_volet_a_mi_hauteur_retrouve_sa_hauteur(creer):
    etats = maison()
    etats["cover.salon"] = FauxEtat("cover.salon", "open", {"device_class": "shutter", "current_position": 40})
    a = creer(etats=etats)
    lancer(a._reagir(GAZ, "gaz"))
    a._hass.services.appels.clear()
    lancer(a._danger_passe(GAZ.entity_id))
    assert appels(a) == [("cover", "set_cover_position", ["cover.salon"], {"position": 40})]


def test_les_actions_se_debrayent(creer):
    a = creer({"actions": {"actif": False}}, maison())
    lancer(a._reagir(FUMEE, "fumee"))
    assert a._hass.services.appels == []
    b = creer({"actions": {"lumieres": False}}, maison())
    lancer(b._reagir(FUMEE, "fumee"))
    assert [(d, s) for d, s, _ in b._hass.services.appels] == [("cover", "open_cover")]


def test_les_actions_par_defaut_sont_actives(creer, module):
    a = creer(etats=maison())
    assert lancer(a._actions()) == module.ACTIONS_DEFAUT
    assert module.ACTIONS_DEFAUT["actif"] is True


def test_l_evenement_branche_les_deux_moities(creer):
    """`_on_state` : le telephone ET la maison, puis la fin du danger."""
    a = creer(etats=maison())

    class Ev:
        def __init__(self, new, old):
            self.data = {"new_state": new, "old_state": old}

    eteint = FauxEtat(FUMEE.entity_id, "off", FUMEE.attributes)
    a._on_state(Ev(FUMEE, eteint))
    assert len(a._hass.taches) == 2
    a._hass.abandonner()
    a._on_state(Ev(eteint, FUMEE))
    assert len(a._hass.taches) == 1
    a._hass.abandonner()
    calme = FauxEtat(ALARME.entity_id, "disarmed", ALARME.attributes)
    a._on_state(Ev(ALARME, calme))
    assert len(a._hass.taches) == 2
    a._hass.abandonner()
    a._on_state(Ev(calme, ALARME))
    assert len(a._hass.taches) == 1
    a._hass.abandonner()


def test_une_vanne_de_gaz_n_est_pas_une_vanne_d_eau(creer):
    etats = maison()
    del etats["valve.eau"]
    etats["valve.gaz"] = FauxEtat("valve.gaz", "open", {"device_class": "gas"})
    a = creer(etats=etats)
    lancer(a._reagir(FUITE, "fuite"))
    assert a._hass.services.appels == [], "on a coupe une vanne qui n'est pas d'eau"
    etats["valve.eau"] = FauxEtat("valve.eau", "open", {"device_class": "water"})
    b = creer(etats=etats)
    lancer(b._reagir(FUITE, "fuite"))
    assert appels(b) == [("valve", "close_valve", ["valve.eau"], {})]


class FauxEvenement:
    def __init__(self, new, old):
        self.data = {"new_state": new, "old_state": old}


def test_un_capteur_qui_se_tait_pendant_le_danger_rend_la_maison_et_le_dit(creer):
    """Audit 18/09 : un detecteur qui perdait sa pile PENDANT la fumee laissait
    lumieres et volets forces jusqu'a une main. La fin est incertaine : on
    rend quand meme, et le journal le marque."""
    a = creer(etats=maison())
    lancer(a._reagir(FUMEE, "fumee"))
    a._hass.services.appels.clear()
    muet = FauxEtat(FUMEE.entity_id, "unavailable", dict(FUMEE.attributes))
    a._on_state(FauxEvenement(muet, FUMEE))
    lancer(a._hass.taches[-1])
    assert len(a._hass.services.appels) == 3, "la maison est rendue"
    assert a._dangers == {}
    journal = lancer(a._regles.journal())
    assert any(e["quoi"] == "capteur muet" and "a verifier" in e["detail"] for e in journal)


def test_un_capteur_muet_sans_danger_ne_fait_rien(creer):
    a = creer(etats=maison())
    muet = FauxEtat(FUMEE.entity_id, "unavailable", dict(FUMEE.attributes))
    a._on_state(FauxEvenement(muet, FauxEtat(FUMEE.entity_id, "off", dict(FUMEE.attributes))))
    assert a._hass.taches == [] and a._hass.services.appels == []


def test_un_ouvrant_sans_classe_ne_s_ouvre_pas_sur_une_alerte(module, creer):
    """Ce qu'on ne sait pas nommer reste ferme (audit du 29/09).

    Le filtre ecartait trois noms — garage, portail, porte. Un portail dont la
    classe n'est pas renseignee vaut `None`, qui n'est aucun des trois : il
    passait, et une fausse alerte fumee l'ouvrait au milieu de la nuit. Or
    beaucoup de portails n'ont pas de classe declaree.

    Le filtre nomme desormais ce qu'il OUVRE. Ne pas remonter un volet mal
    declare se repare en lui donnant sa classe ; ouvrir un portail, non.
    """
    assert "garage" not in module.VOLETS_CLASSES
    assert "gate" not in module.VOLETS_CLASSES
    assert "door" not in module.VOLETS_CLASSES
    assert "shutter" in module.VOLETS_CLASSES and "blind" in module.VOLETS_CLASSES

    a = creer()
    a._hass.states.table = {
        "cover.volet": FauxEtat("cover.volet", "closed", {"device_class": "shutter"}),
        "cover.portail": FauxEtat("cover.portail", "closed", {"device_class": "gate"}),
        "cover.inconnu": FauxEtat("cover.inconnu", "closed", {}),
    }
    assert a._entites("cover", module.VOLETS_CLASSES) == ["cover.volet"]
    # Sans classes demandees, tout le domaine repond — les lumieres, la vanne.
    assert a._entites("cover") == ["cover.inconnu", "cover.portail", "cover.volet"]


def test_une_alerte_n_ouvre_jamais_une_fenetre_de_toit(module, creer):
    """Audit du 19/10 (point 14). La liste des alertes ouvrait aussi les
    fenetres de toit (`window`) : sur une alerte fumee, en pleine pluie. Une
    fenetre de toit ne s'ouvre jamais par Loggia (ouvrants.py) ; la liste est
    celle des volets, et un volet « tilt seul » reste hors de l'appel groupe,
    qu'il ferait refuser en entier (point 11)."""
    ouvrants = charger("ouvrants")
    assert "window" not in module.VOLETS_CLASSES
    # ASSERTION MODIFIÉE (19/10) : le lot 2 des capteurs (H6) écarte aussi le store banne — une alerte ne
    # déploie pas une toile au-dessus d'une fenêtre en feu. La liste reste celle d'ouvrants.py, moins lui.
    assert tuple(module.VOLETS_CLASSES) == tuple(c for c in ouvrants.CLASSES_VOLETS if c != ouvrants.STORE_BANNE)
    a = creer(etats={
        "cover.volet": FauxEtat("cover.volet", "closed", {"device_class": "shutter", "supported_features": 15}),
        "cover.velux": FauxEtat("cover.velux", "closed", {"device_class": "window", "supported_features": 15}),
        "cover.lames": FauxEtat("cover.lames", "open", {"device_class": "blind", "supported_features": 16 | 32 | 128}),
    })
    lancer(a._reagir(FUMEE, "fumee"))
    covers = [x for x in a._hass.services.appels if x[0] == "cover"]
    assert covers == [("cover", "open_cover", {"entity_id": ["cover.volet"]})]


# ─────────────────────────────────────────────────────────────────────────────
# Un `moisture` CALCULE n'est pas une fuite (16/10, ADR 0022).
#
# Chez l'utilisateur, `binary_sensor.dracaena_besoin_eau` et
# `binary_sensor.schefflera_besoin_eau` sont des modeles (`template`) de classe
# `moisture`, sans appareil : « la plante a soif ». Allumes, ils disaient « Fuite
# d'eau detectee » et coupaient la vanne. La meme famille d'erreur que le
# `safety` de Meteoalarm (ADR 0157). La plateforme vient du registre des
# entites ; une entite qu'il ne connait pas reste une fuite.
# ─────────────────────────────────────────────────────────────────────────────

class FauxRegistre:
    """Le registre des entites : `async_get(entity_id)` rend l'entree, ou None."""

    def __init__(self, plateformes):
        self.plateformes = dict(plateformes)

    def async_get(self, haid):
        p = self.plateformes.get(haid)
        return None if p is None else types.SimpleNamespace(entity_id=haid, platform=p)


def registre(monkeypatch, plateformes):
    reg = FauxRegistre(plateformes)
    monkeypatch.setattr(sys.modules["homeassistant.helpers.entity_registry"], "async_get", lambda _h: reg)
    return reg


def binaire(haid, classe, etat="on"):
    return FauxEtat(haid, etat, {"device_class": classe, "friendly_name": haid})


def basculer(a, haid, classe):
    """Allume puis eteint le binaire : les taches de chaque moitie, comptees a part."""
    a._on_state(FauxEvenement(binaire(haid, classe), binaire(haid, classe, "off")))
    allume = len(a._hass.taches)
    a._hass.abandonner()
    a._on_state(FauxEvenement(binaire(haid, classe, "off"), binaire(haid, classe)))
    eteint = len(a._hass.taches)
    a._hass.abandonner()
    return allume, eteint


def test_un_moisture_de_modele_n_est_pas_une_fuite(creer, monkeypatch):
    """Son cas : « la plante a soif » n'envoie rien, ne coupe rien, ne rend rien."""
    registre(monkeypatch, {"binary_sensor.dracaena_besoin_eau": "template",
                           "binary_sensor.schefflera_besoin_eau": "template",
                           "binary_sensor.fuites": "group"})
    a = creer(etats=maison())
    for haid in ("binary_sensor.dracaena_besoin_eau", "binary_sensor.schefflera_besoin_eau", "binary_sensor.fuites"):
        assert basculer(a, haid, "moisture") == (0, 0), haid
    assert a._dangers == {} and a._hass.services.appels == []


def test_un_vrai_detecteur_de_fuite_reste_une_fuite(creer, monkeypatch):
    """Un appareil (Zigbee, MQTT…) : le telephone ET la vanne, puis la fin du danger."""
    registre(monkeypatch, {"binary_sensor.sdb_fuite": "mqtt"})
    a = creer(etats=maison())
    assert basculer(a, "binary_sensor.sdb_fuite", "moisture") == (2, 1)


def test_hors_du_registre_ou_registre_illisible_c_est_une_fuite(creer, monkeypatch):
    """Une entite YAML sans `unique_id` n'est pas au registre : elle reste une
    fuite — on ne perd aucun vrai detecteur. Un registre illisible non plus."""
    registre(monkeypatch, {})
    a = creer(etats=maison())
    assert basculer(a, "binary_sensor.fuite_yaml", "moisture") == (2, 1)

    def casse(_h):
        raise RuntimeError("registre indisponible")

    monkeypatch.setattr(sys.modules["homeassistant.helpers.entity_registry"], "async_get", casse)
    b = creer(etats=maison())
    assert basculer(b, "binary_sensor.sdb_fuite", "moisture") == (2, 1)


def test_la_regle_ne_touche_que_les_fuites(creer, module, monkeypatch):
    """Une fumee de modele reste une fumee : la regle ne vaut que pour `moisture`,
    et ne nomme que ce qui CALCULE — un modele, un groupe."""
    registre(monkeypatch, {"binary_sensor.fumee_calculee": "template"})
    a = creer(etats=maison())
    assert basculer(a, "binary_sensor.fumee_calculee", "smoke") == (2, 1)
    assert module.PLATEFORMES_CALCULEES == ("template", "group")


# ─────────────────────────────────────────────────────────────────────────────
# Une seule idee de la lumiere de la maison (audit du 19/10, ADR 0260) : le
# danger allume les lumieres de la maison - ni la LED d'une borne (`config`)
# ni une lampe cachee -, l'interrupteur declare lumiere par SON service, et
# un groupe s'efface devant ses membres. Le danger passe, chacun revient.
# ─────────────────────────────────────────────────────────────────────────────

EXTERIEUR = "switch.lumiere_exterieur"
LED = "light.u6_lr_led"


def _entree_lumiere(haid, categorie=None, cache=None):
    return types.SimpleNamespace(entity_id=haid, entity_category=categorie, hidden_by=cache, disabled_by=None)


def registre_des_lumieres(monkeypatch, *entrees):
    reg = types.SimpleNamespace(entities={e.entity_id: e for e in entrees})
    monkeypatch.setattr(sys.modules["homeassistant.helpers.entity_registry"], "async_get", lambda _h: reg)


def quartier():
    return {
        "light.salon": FauxEtat("light.salon", "on", {"brightness": 80}),
        "light.couloir": FauxEtat("light.couloir", "off"),
        "light.tout": FauxEtat("light.tout", "on", {"entity_id": ["light.salon", "light.couloir"]}),
        LED: FauxEtat(LED, "on", {"brightness": 255}),
        "light.cachee": FauxEtat("light.cachee", "off"),
        EXTERIEUR: FauxEtat(EXTERIEUR, "off"),
        "switch.prise_nas": FauxEtat("switch.prise_nas", "on"),
    }


def test_le_danger_n_allume_ni_la_led_ni_la_cachee_mais_l_interrupteur_declare(creer, monkeypatch):
    """La LED de la borne UniFi (`config`) passait a 100 % sur une fumee. Elle
    n'est pas une lumiere de la maison ; la cachee non plus ; le groupe
    s'efface devant ses membres ; l'interrupteur declare lumiere s'allume, par
    `homeassistant` - il n'a pas de niveau a monter."""
    registre_des_lumieres(monkeypatch, _entree_lumiere(LED, categorie="config"),
                          _entree_lumiere("light.cachee", cache="user"), _entree_lumiere("light.salon"),
                          _entree_lumiere(EXTERIEUR), _entree_lumiere("switch.prise_nas"))
    a = creer(etats=quartier(), partage={"loggia_switchlights": [EXTERIEUR]})
    lancer(a._reagir(FUMEE, "fumee"))
    assert appels(a) == [
        ("light", "turn_on", ["light.couloir", "light.salon"], {"brightness_pct": 100}),
        ("homeassistant", "turn_on", [EXTERIEUR], {}),
    ]
    assert a._regles.tenues("alertes") == {"light.couloir": "danger", "light.salon": "danger", EXTERIEUR: "danger"}
    assert [(l["quoi"], l["n"]) for l in lancer(a._regles.journal())] == [("allumer", 1), ("allumer", 2)]
    # Le danger passe : le couloir et l'interrupteur, eteints avant, s'eteignent - chacun par son service.
    a._hass.services.appels.clear()
    lancer(a._danger_passe(FUMEE.entity_id))
    assert appels(a) == [
        ("light", "turn_off", ["light.couloir"], {}),
        ("homeassistant", "turn_off", [EXTERIEUR], {}),
        ("light", "turn_on", ["light.salon"], {"brightness": 80}),
    ]
    assert a._regles.tenues("alertes") == {}


def test_sans_registre_le_danger_allume_tout_ce_qui_est_une_lampe(creer):
    """Le registre illisible : on ne filtre rien - la LED y passe, plutot que
    de laisser la maison dans le noir. Le groupe s'efface quand meme."""
    a = creer(etats=quartier())
    lancer(a._reagir(FUMEE, "fumee"))
    assert appels(a)[0] == ("light", "turn_on", ["light.cachee", "light.couloir", "light.salon", LED],
                            {"brightness_pct": 100})


# ─────────────────────────────────────────────────────────────────────────────
# TESTS AJOUTES (etape 3 IoT, 25/10 ; I28, I30, ADR 0022 amendee, ADR 0217).
#
# Faute d'une vanne choisie, la regle fermait « la premiere `valve` d'eau » par
# ordre d'identifiant : une vanne d'arrosage pouvait passer avant l'arrivee.
# Elle les ferme TOUTES - fermer est le sens sur. Et elle dit au carnet de
# l'eau (eau.py) la cause et le detecteur AVANT d'agir : la popup dira « fuite
# sous l'evier ». Jamais une ouverture.
# ─────────────────────────────────────────────────────────────────────────────

class FauxCarnet:
    def __init__(self, hass):
        self.hass, self.annonces = hass, []

    def annoncer_fermeture(self, vannes, detecteur, nom):
        # Ce qui est deja parti au moment de l'annonce : rien.
        self.annonces.append((list(vannes), detecteur, nom, len(self.hass.services.appels)))


def avec_carnet(a):
    carnet = FauxCarnet(a._hass)
    a._hass.data = {"loggia": {"eau": carnet}}
    return carnet


def test_sans_vanne_choisie_toutes_les_vannes_d_eau(creer):
    etats = {**maison(), "valve.arrosage": FauxEtat("valve.arrosage", "open", {"device_class": "water"}),
             "valve.gaz": FauxEtat("valve.gaz", "open", {"device_class": "gas"}),
             "valve.muette": FauxEtat("valve.muette", "unavailable", {"device_class": "water"})}
    a = creer(etats=etats)
    lancer(a._reagir(FUITE, "fuite"))
    assert appels(a) == [("valve", "close_valve", ["valve.arrosage", "valve.eau"], {})], "toutes les vannes d'eau joignables ; jamais le gaz"
    assert a._vannes_coupees == ["valve.arrosage", "valve.eau"]


def test_une_vanne_choisie_est_la_seule_fermee(creer):
    etats = {**maison(), "valve.arrosage": FauxEtat("valve.arrosage", "open", {"device_class": "water"})}
    a = creer({"actions": {"vanne": {"actif": True, "entite": "valve.eau"}}}, etats)
    lancer(a._reagir(FUITE, "fuite"))
    assert appels(a) == [("valve", "close_valve", ["valve.eau"], {})]


def test_la_regle_dit_la_cause_au_carnet_avant_d_agir(creer):
    a = creer(etats=maison())
    carnet = avec_carnet(a)
    lancer(a._reagir(FUITE, "fuite"))
    assert carnet.annonces == [(["valve.eau"], "binary_sensor.sdb_fuite", "Fuite SDB", 0)], "annoncee AVANT la commande"
    assert appels(a) == [("valve", "close_valve", ["valve.eau"], {})]


def test_sans_carnet_la_vanne_se_ferme_quand_meme(creer):
    """Le carnet absent (un demarrage rate) ne retient pas la surete."""
    a = creer(etats=maison())
    a._hass.data = {"loggia": {}}
    lancer(a._reagir(FUITE, "fuite"))
    assert appels(a) == [("valve", "close_valve", ["valve.eau"], {})]


def test_le_danger_passe_toutes_les_vannes_restent_coupees(creer):
    etats = {**maison(), "valve.arrosage": FauxEtat("valve.arrosage", "open", {"device_class": "water"})}
    a = creer(etats=etats)
    lancer(a._reagir(FUITE, "fuite"))
    a._hass.services.appels.clear()
    lancer(a._danger_passe(FUITE.entity_id))
    assert a._hass.services.appels == [], "aucune vanne rouverte"
    ligne = lancer(a._regles.journal())[0]
    assert ligne["quoi"] == "laisser coupée" and ligne["n"] == 2


def test_la_regle_n_ouvre_jamais_une_vanne():
    from conftest import COMPOSANT

    source = (COMPOSANT / "alertes.py").read_text(encoding="utf-8")
    assert "open_valve" not in source and "set_valve_position" not in source, "une regle qui se trompe ne doit jamais ouvrir l'eau"


def test_les_vannes_coupees_ne_se_partagent_pas_entre_instances():
    """TEST AJOUTE (passe bis de l'etape 3, 25/10 ; point 11) : une liste au niveau de la CLASSE se partageait entre les
    instances - un rechargement de l'integration aurait herite des vannes coupees par l'ancienne. Le defaut de classe est un
    tuple, chaque instance pose sa liste."""
    alertes = charger("alertes")
    assert isinstance(alertes.LoggiaAlertes.__dict__["_vannes_coupees"], tuple)