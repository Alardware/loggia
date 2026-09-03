"""Tests de la coupure du chauffage sur fenetre ouverte.

Ce qui merite d'etre verrouille ici tient en trois phrases : on ne coupe que
ce qui chauffait, on ne rend que ce qu'on a pris, et une piece a souvent
plusieurs fenetres. Le reste decoule.
"""
from __future__ import annotations

import asyncio

import pytest

from conftest import FauxStore, charger


def lancer(coro):
    return asyncio.run(coro)


class FauxEtat:
    def __init__(self, state, attributes=None):
        self.state = state
        self.attributes = attributes or {}


class FauxEtats:
    def __init__(self, table):
        self.table = dict(table)

    def get(self, haid):
        return self.table.get(haid)


class FauxServices:
    def __init__(self):
        self.appels = []

    async def async_call(self, domaine, service, data, blocking=False):
        self.appels.append((domaine, service, dict(data)))


class FauxHass:
    def __init__(self, etats):
        self.states = FauxEtats(etats)
        self.services = FauxServices()
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
    return charger("fenetres")


@pytest.fixture
def creer(module, store_module):
    faits = []

    def fabrique(config=None, etats=None):
        magasin = store_module.LoggiaStore.__new__(store_module.LoggiaStore)
        magasin._store = FauxStore({"users": {}, "shared": {"loggia_fenetres": config or {}}, "migrated": True})
        magasin._ancien = FauxStore(None)
        magasin._data = None
        magasin._lock = asyncio.Lock()

        f = module.LoggiaFenetres.__new__(module.LoggiaFenetres)
        f.hass = FauxHass(etats or {})
        f.store = magasin
        f.cfg = lancer(f.async_config())
        f.coupes = {}
        f.journal = []
        f._minuteurs = {}
        f._defait = []
        faits.append(f)
        return f

    yield fabrique
    for f in faits:
        f.hass.abandonner()


OUVERTE = {"binary_sensor.fen_chambre": FauxEtat("on")}
FERMEE = {"binary_sensor.fen_chambre": FauxEtat("off")}
RADIATEUR = {"switch.rad_chambre": FauxEtat("on")}


def cfg(delai=0, **extra):
    c = {"actif": True, "delai": delai, "pieces": {
        "Chambre": {"actif": True, "ouvrants": ["binary_sensor.fen_chambre"],
                    "chauffages": ["switch.rad_chambre"]}}}
    c.update(extra)
    return c


# ── Lire l'etat d'un ouvrant ────────────────────────────────────────────────

def test_les_deux_vocabulaires_d_ouverture(module):
    """Un `binary_sensor` dit `on`, un `cover` dit `open` : les deux comptent."""
    etats = {"a": FauxEtat("on"), "b": FauxEtat("open"), "c": FauxEtat("off"), "d": FauxEtat("closed")}
    assert module.ouvrants_ouverts(etats, ["a", "b", "c", "d"]) == ["a", "b"]


def test_un_capteur_muet_ne_compte_pas(module):
    """Un capteur tombe ne doit ni couper le chauffage ni le rendre."""
    etats = {"a": FauxEtat("unavailable"), "b": FauxEtat("unknown"), "c": FauxEtat("on")}
    assert module.ouvrants_ouverts(etats, ["a", "b", "c"]) == ["c"]


def test_le_service_depend_du_domaine(module):
    assert module.eteint_pour("climate.salon") == ("climate", "set_hvac_mode", {"hvac_mode": "off"})
    assert module.eteint_pour("switch.rad") == ("switch", "turn_off", {})
    # Une prise, une vanne, ce qu'on n'a pas prevu : le service universel.
    assert module.eteint_pour("valve.rad")[0] == "homeassistant"


def test_rendre_remet_l_etat_d_avant(module):
    assert module.rend_pour("climate.salon", "heat") == ("climate", "set_hvac_mode", {"hvac_mode": "heat"})
    assert module.rend_pour("switch.rad", "on") == ("switch", "turn_on", {})


# ── Couper ──────────────────────────────────────────────────────────────────

def test_la_fenetre_ouverte_coupe_le_radiateur(creer):
    f = creer(cfg(), {**OUVERTE, **RADIATEUR})
    lancer(f._async_couper("Chambre"))
    assert f.hass.services.appels == [("switch", "turn_off", {"entity_id": "switch.rad_chambre"})]
    assert f.coupes == {"Chambre": {"switch.rad_chambre": "on"}}


def test_un_radiateur_deja_eteint_n_est_pas_touche(creer):
    """Sans cette garde, on le rallumerait a la fermeture — un chauffage qui
    s'allume tout seul parce qu'on a ouvert la fenetre."""
    f = creer(cfg(), {**OUVERTE, "switch.rad_chambre": FauxEtat("off")})
    lancer(f._async_couper("Chambre"))
    assert f.hass.services.appels == []
    assert f.coupes == {}


def test_la_fenetre_refermee_entre_temps_annule_la_coupure(creer):
    """Le delai a pu s'ecouler pendant qu'on refermait."""
    f = creer(cfg(), {**FERMEE, **RADIATEUR})
    lancer(f._async_couper("Chambre"))
    assert f.hass.services.appels == []


def test_le_thermostat_passe_en_arret(creer):
    c = cfg()
    c["pieces"]["Chambre"]["chauffages"] = ["climate.chambre"]
    f = creer(c, {**OUVERTE, "climate.chambre": FauxEtat("heat")})
    lancer(f._async_couper("Chambre"))
    assert f.hass.services.appels == [
        ("climate", "set_hvac_mode", {"entity_id": "climate.chambre", "hvac_mode": "off"})
    ]


def test_une_piece_eteinte_est_ignoree(creer):
    c = cfg()
    c["pieces"]["Chambre"]["actif"] = False
    f = creer(c, {**OUVERTE, **RADIATEUR})
    lancer(f._async_couper("Chambre"))
    assert f.hass.services.appels == []


# ── Rendre ──────────────────────────────────────────────────────────────────

def test_la_fermeture_rend_le_chauffage(creer):
    f = creer(cfg(), {**OUVERTE, **RADIATEUR})
    lancer(f._async_couper("Chambre"))
    f.hass.states.table["binary_sensor.fen_chambre"] = FauxEtat("off")
    f.hass.states.table["switch.rad_chambre"] = FauxEtat("off")
    lancer(f._async_rendre("Chambre"))
    assert f.hass.services.appels[-1] == ("switch", "turn_on", {"entity_id": "switch.rad_chambre"})
    assert f.coupes == {}


def test_on_ne_rend_pas_par_dessus_un_geste_humain(creer):
    """LE point : si quelqu'un a rallume pendant l'aeration, son geste
    l'emporte. On ne rend que ce qu'on a pris."""
    f = creer(cfg(), {**OUVERTE, **RADIATEUR})
    lancer(f._async_couper("Chambre"))
    avant = len(f.hass.services.appels)
    f.hass.states.table["switch.rad_chambre"] = FauxEtat("on")   # rallume a la main
    lancer(f._async_rendre("Chambre"))
    assert len(f.hass.services.appels) == avant
    assert f.coupes == {}


def test_rendre_sans_avoir_coupe_ne_fait_rien(creer):
    f = creer(cfg(), {**FERMEE, **RADIATEUR})
    lancer(f._async_rendre("Chambre"))
    assert f.hass.services.appels == []


# ── Plusieurs fenetres ──────────────────────────────────────────────────────

def cfg_deux():
    return {"actif": True, "delai": 0, "pieces": {"Salon": {
        "actif": True,
        "ouvrants": ["binary_sensor.fen_a", "binary_sensor.fen_b"],
        "chauffages": ["switch.rad_salon"]}}}


def test_le_chauffage_ne_repart_qu_a_la_derniere_fenetre(creer):
    etats = {"binary_sensor.fen_a": FauxEtat("on"), "binary_sensor.fen_b": FauxEtat("on"),
             "switch.rad_salon": FauxEtat("on")}
    f = creer(cfg_deux(), etats)
    lancer(f._async_couper("Salon"))
    assert f.coupes["Salon"] == {"switch.rad_salon": "on"}

    # Une seule refermee : le chauffage reste coupe.
    f.hass.states.table["binary_sensor.fen_a"] = FauxEtat("off")
    f.hass.states.table["switch.rad_salon"] = FauxEtat("off")
    lancer(f._async_piece("Salon"))
    assert "Salon" in f.coupes

    # La seconde aussi : cette fois on rend.
    f.hass.states.table["binary_sensor.fen_b"] = FauxEtat("off")
    lancer(f._async_piece("Salon"))
    assert f.coupes == {}
    assert f.hass.services.appels[-1] == ("switch", "turn_on", {"entity_id": "switch.rad_salon"})


def test_un_delai_de_zero_coupe_tout_de_suite(creer):
    """Avec un delai, l'armement passe par un minuteur de Home Assistant que
    ces tests ne font pas tourner ; a zero, la coupure est immediate."""
    f = creer(cfg(delai=0), {**OUVERTE, **RADIATEUR})
    lancer(f._async_armer("Chambre"))
    assert f.hass.services.appels == [("switch", "turn_off", {"entity_id": "switch.rad_chambre"})]


# ── La configuration ────────────────────────────────────────────────────────

def test_les_defauts(creer):
    f = creer()
    assert f.cfg["actif"] is False
    assert f.cfg["delai"] == 3
    assert f.cfg["pieces"] == {}


def test_enregistrer_fusionne_une_piece(creer):
    f = creer(cfg())
    lancer(f.async_enregistrer({"delai": 7, "pieces": {"Chambre": {"actif": False}}}))
    assert f.cfg["delai"] == 7
    # Le reste de la piece survit au patch partiel.
    assert f.cfg["pieces"]["Chambre"]["ouvrants"] == ["binary_sensor.fen_chambre"]
    assert f.cfg["pieces"]["Chambre"]["actif"] is False


def test_enregistrer_none_retire_la_piece(creer):
    f = creer(cfg())
    lancer(f.async_enregistrer({"pieces": {"Chambre": None}}))
    assert f.cfg["pieces"] == {}
