"""Les alertes de surete, sur le socle des regles.

Ce qui compte ici tient en une phrase : le DANGER reveille, le reste attend.
Fumee, gaz, monoxyde, fuite, alarme partent en critique — par-dessus les
heures calmes et par-dessus le mode silencieux du telephone. L'ouverture
pendant que l'alarme est armee, elle, attend son heure comme les autres.
"""
from __future__ import annotations

import asyncio
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

    def fabrique(config=None, etats=None, quand=None):
        cfg = {"actif": True, "service": "mobile",
               "categories": {"fumee": True, "gaz": True, "co": True, "fuite": True,
                              "alarme": True, "portes": True},
               "cooldown_min": 5}
        cfg.update(config or {})
        magasin = store_module.LoggiaStore.__new__(store_module.LoggiaStore)
        magasin._store = FauxStore({"users": {}, "shared": {"loggia_alertes": cfg}, "migrated": True})
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
        a._vanne_coupee = None
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
        "cover.salon": FauxEtat("cover.salon", "closed", {"current_position": 0}),
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
    assert a._vanne_coupee == "valve.eau"


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
    a._hass.states.table["cover.salon"] = FauxEtat("cover.salon", "open", {"current_position": 100})
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
    assert a._vanne_coupee is None
    assert a._regles.tenues("alertes") == {}


def test_ce_qui_etait_deja_a_fond_n_est_pas_rendu(creer):
    etats = maison()
    etats["light.salon"] = FauxEtat("light.salon", "on", {"brightness": 255})
    etats["cover.salon"] = FauxEtat("cover.salon", "open", {"current_position": 100})
    a = creer(etats=etats)
    lancer(a._reagir(FUMEE, "fumee"))
    a._hass.services.appels.clear()
    lancer(a._danger_passe(FUMEE.entity_id))
    assert appels(a) == [("light", "turn_off", ["light.couloir"], {})]


def test_un_volet_a_mi_hauteur_retrouve_sa_hauteur(creer):
    etats = maison()
    etats["cover.salon"] = FauxEtat("cover.salon", "open", {"current_position": 40})
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
