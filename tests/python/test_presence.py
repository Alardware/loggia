"""Tests du depart et du retour.

Trois choses valent d'etre verrouillees : une maison sans suivi de presence ne
doit JAMAIS se croire vide, on ne rend que ce qu'on a pris, et on ne rallume
pas en plein jour.
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

    def async_entity_ids(self, domaine):
        return [e for e in self.table if e.startswith(domaine + '.')]


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
    return charger("presence")


@pytest.fixture
def creer(module, store_module):
    faits = []

    def fabrique(config=None, etats=None):
        magasin = store_module.LoggiaStore.__new__(store_module.LoggiaStore)
        magasin._store = FauxStore({"users": {}, "shared": {"loggia_presence": config or {}}, "migrated": True})
        magasin._ancien = FauxStore(None)
        magasin._data = None
        magasin._lock = asyncio.Lock()

        p = module.LoggiaPresence.__new__(module.LoggiaPresence)
        p.hass = FauxHass(etats or {})
        p.store = magasin
        p.cfg = lancer(p.async_config())
        p.eteintes = {}
        p.dehors = False
        p.journal = []
        p._minuteur = None
        p._defait = []
        faits.append(p)
        return p

    yield fabrique
    for p in faits:
        p.hass.abandonner()


# ── La maison est-elle vide ? ───────────────────────────────────────────────

def test_tout_le_monde_dehors(module):
    etats = {"person.a": FauxEtat("not_home"), "person.b": FauxEtat("not_home")}
    assert module.tous_absents(etats, ["person.a", "person.b"])


def test_une_seule_personne_a_la_maison_suffit(module):
    etats = {"person.a": FauxEtat("not_home"), "person.b": FauxEtat("home")}
    assert not module.tous_absents(etats, ["person.a", "person.b"])


def test_sans_personne_suivie_la_maison_n_est_pas_vide(module):
    """LE garde-fou. Sans lui, une installation sans suivi de presence se
    croirait vide en permanence et s'eteindrait toute seule."""
    assert not module.tous_absents({}, [])
    assert not module.tous_absents({}, ["person.a"])          # entite absente
    assert not module.tous_absents({"person.a": None}, ["person.a"])


def test_un_telephone_muet_ne_prouve_pas_une_absence(module):
    """Un telephone eteint n'est pas une maison vide."""
    etats = {"person.a": FauxEtat("unavailable"), "person.b": FauxEtat("unknown")}
    assert not module.tous_absents(etats, ["person.a", "person.b"])
    # Mais si une AUTRE personne repond et est dehors, la maison l'est.
    etats["person.c"] = FauxEtat("not_home")
    assert module.tous_absents(etats, ["person.a", "person.b", "person.c"])


def test_le_jour_est_le_repli(module):
    """Se tromper vers le jour omet un rallumage ; se tromper vers la nuit
    rallumerait la maison en plein apres-midi."""
    assert module.fait_nuit(FauxEtat("below_horizon"))
    assert not module.fait_nuit(FauxEtat("above_horizon"))
    assert not module.fait_nuit(None)


# ── Le depart ───────────────────────────────────────────────────────────────

DEHORS = {"person.a": FauxEtat("not_home")}
MAISON = {"light.salon": FauxEtat("on"), "light.cuisine": FauxEtat("off")}


def cfg(**extra):
    c = {"actif": True, "delai_depart": 0, "personnes": ["person.a"]}
    c.update(extra)
    return c


def test_le_depart_eteint_les_lumieres_allumees(creer):
    p = creer(cfg(), {**DEHORS, **MAISON})
    lancer(p._async_depart())
    assert p.hass.services.appels == [("light", "turn_off", {"entity_id": ["light.salon"]})]
    # Seule celle qui etait allumee est notee : l'autre ne se rallumera pas.
    assert p.eteintes == {"light.salon": "on"}
    assert p.dehors is True


def test_quelqu_un_rentre_pendant_le_decompte(creer):
    p = creer(cfg(), {"person.a": FauxEtat("home"), **MAISON})
    lancer(p._async_depart())
    assert p.hass.services.appels == []


def test_le_depart_baisse_le_chauffage(creer):
    c = cfg(depart={"lumieres": False, "chauffage": {"actif": True, "consigne": 16}})
    p = creer(c, {**DEHORS, "climate.salon": FauxEtat("heat")})
    lancer(p._async_depart())
    assert p.hass.services.appels == [
        ("climate", "set_temperature", {"entity_id": ["climate.salon"], "temperature": 16.0})
    ]


def test_le_depart_arme_l_alarme(creer):
    c = cfg(depart={"lumieres": False,
                    "alarme": {"actif": True, "entite": "alarm_control_panel.maison", "mode": "away"}})
    p = creer(c, DEHORS)
    lancer(p._async_depart())
    assert p.hass.services.appels == [
        ("alarm_control_panel", "alarm_arm_away", {"entity_id": ["alarm_control_panel.maison"]})
    ]


def test_le_mode_d_armement_est_respecte(creer):
    c = cfg(depart={"lumieres": False,
                    "alarme": {"actif": True, "entite": "alarm_control_panel.maison", "mode": "night"}})
    p = creer(c, DEHORS)
    lancer(p._async_depart())
    assert p.hass.services.appels[0][1] == "alarm_arm_night"


# ── Le retour ───────────────────────────────────────────────────────────────

def test_le_retour_rallume_ce_qu_on_a_eteint(creer):
    c = cfg(retour={"lumieres": True, "seulement_la_nuit": True, "chauffage": False})
    p = creer(c, {**DEHORS, "light.salon": FauxEtat("on"), "sun.sun": FauxEtat("below_horizon")})
    lancer(p._async_depart())
    p.hass.states.table["light.salon"] = FauxEtat("off")
    lancer(p._async_retour())
    assert p.hass.services.appels[-1] == ("light", "turn_on", {"entity_id": ["light.salon"]})
    assert p.eteintes == {}


def test_on_ne_rallume_pas_en_plein_jour(creer):
    """Rentrer a quinze heures ne doit pas rallumer le salon."""
    c = cfg(retour={"lumieres": True, "seulement_la_nuit": True, "chauffage": False})
    p = creer(c, {**DEHORS, "light.salon": FauxEtat("on"), "sun.sun": FauxEtat("above_horizon")})
    lancer(p._async_depart())
    avant = len(p.hass.services.appels)
    p.hass.states.table["light.salon"] = FauxEtat("off")
    lancer(p._async_retour())
    assert len(p.hass.services.appels) == avant
    assert p.eteintes == {}


def test_le_garde_fou_du_jour_se_desactive(creer):
    c = cfg(retour={"lumieres": True, "seulement_la_nuit": False, "chauffage": False})
    p = creer(c, {**DEHORS, "light.salon": FauxEtat("on"), "sun.sun": FauxEtat("above_horizon")})
    lancer(p._async_depart())
    p.hass.states.table["light.salon"] = FauxEtat("off")
    lancer(p._async_retour())
    assert p.hass.services.appels[-1][1] == "turn_on"


def test_une_lampe_rallumee_entre_temps_n_est_pas_notre_affaire(creer):
    c = cfg(retour={"lumieres": True, "seulement_la_nuit": False, "chauffage": False})
    p = creer(c, {**DEHORS, "light.salon": FauxEtat("on")})
    lancer(p._async_depart())
    avant = len(p.hass.services.appels)
    # Quelqu'un l'a rallumee avant qu'on rentre : on ne repasse pas dessus.
    lancer(p._async_retour())
    assert len(p.hass.services.appels) == avant


def test_le_desarmement_est_ferme_par_defaut(creer):
    """Armer parce que la maison se vide est sans risque ; desarmer parce
    qu'un telephone approche en est un."""
    p = creer(cfg())
    assert p.cfg["retour"]["desarmer"] is False
    p2 = creer(cfg(depart={"lumieres": False,
                           "alarme": {"actif": True, "entite": "alarm_control_panel.maison"}}))
    lancer(p2._async_retour())
    assert p2.hass.services.appels == []


def test_le_desarmement_ouvert_fonctionne(creer):
    c = cfg(depart={"lumieres": False,
                    "alarme": {"actif": True, "entite": "alarm_control_panel.maison"}},
            retour={"lumieres": False, "chauffage": False, "desarmer": True})
    p = creer(c, DEHORS)
    lancer(p._async_retour())
    assert p.hass.services.appels == [
        ("alarm_control_panel", "alarm_disarm", {"entity_id": ["alarm_control_panel.maison"]})
    ]


# ── La configuration ────────────────────────────────────────────────────────

def test_les_defauts(creer):
    p = creer()
    assert p.cfg["actif"] is False
    assert p.cfg["delai_depart"] == 5
    assert p.cfg["depart"]["lumieres"] is True
    assert p.cfg["retour"]["seulement_la_nuit"] is True


def test_un_patch_imbrique_garde_le_reste(creer):
    p = creer(cfg())
    lancer(p.async_enregistrer({"depart": {"chauffage": {"consigne": 15}}}))
    assert p.cfg["depart"]["chauffage"]["consigne"] == 15
    # Le voisin de la meme sous-section survit.
    assert p.cfg["depart"]["chauffage"]["actif"] is False
    assert p.cfg["depart"]["lumieres"] is True


def test_la_liste_des_personnes_se_remplace(creer):
    p = creer(cfg())
    lancer(p.async_enregistrer({"personnes": ["person.a", "person.b"]}))
    assert p.cfg["personnes"] == ["person.a", "person.b"]
