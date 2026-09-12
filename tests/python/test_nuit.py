"""Tests de la veilleuse et de l'extinction du soir.

Deux points valent d'etre verrouilles : la plage horaire de la veilleuse
traverse minuit, et on ne demande une transition qu'a une lampe qui sait la
faire.
"""
from __future__ import annotations

import asyncio
from datetime import datetime

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

    async def async_call(self, domaine, service, data, blocking=False, context=None):
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
    return charger("nuit")


@pytest.fixture
def regles_module():
    return charger("regles")


@pytest.fixture
def creer(module, store_module, regles_module):
    faits = []

    def fabrique(config=None, etats=None):
        magasin = store_module.LoggiaStore.__new__(store_module.LoggiaStore)
        magasin._store = FauxStore({"users": {}, "shared": {"loggia_nuit": config or {}}, "migrated": True})
        magasin._ancien = FauxStore(None)
        magasin._data = None
        magasin._lock = asyncio.Lock()

        n = module.LoggiaNuit.__new__(module.LoggiaNuit)
        n.hass = FauxHass(etats or {})
        n.store = magasin
        n.cfg = lancer(n.async_config())
        n._minuteurs = {}
        n._defait = []
        n.regles = regles_module.Regles(n.hass, magasin)
        n.regles._depot = FauxStore(None)
        n._defait_heure = []
        faits.append(n)
        return n

    yield fabrique
    for n in faits:
        n.hass.abandonner()


# ── Lire une heure ──────────────────────────────────────────────────────────

def test_une_heure_se_lit(module):
    assert module.lire_heure('19:00') == (19, 0)
    assert module.lire_heure('23:30') == (23, 30)
    assert module.lire_heure('07:05') == (7, 5)


def test_une_heure_illisible_garde_le_defaut(module):
    for mauvaise in ('', None, 'minuit', '25:00', '12:99', '12'):
        assert module.lire_heure(mauvaise, (23, 30)) == (23, 30)


# ── La plage du soir ────────────────────────────────────────────────────────

def test_la_soiree_commence_a_l_heure_dite(module):
    assert module.dans_la_soiree(datetime(2026, 9, 4, 19, 0), '19:00')
    assert module.dans_la_soiree(datetime(2026, 9, 4, 22, 30), '19:00')
    assert not module.dans_la_soiree(datetime(2026, 9, 4, 15, 0), '19:00')


def test_la_soiree_traverse_minuit(module):
    """Une veilleuse allumee a 2 h du matin est encore la soiree de la veille :
    sans cela, elle resterait allumee jusqu'au matin."""
    assert module.dans_la_soiree(datetime(2026, 9, 4, 2, 0), '19:00')
    assert module.dans_la_soiree(datetime(2026, 9, 4, 6, 30), '19:00')
    # Mais l'apres-midi, non.
    assert not module.dans_la_soiree(datetime(2026, 9, 4, 13, 0), '19:00')


def test_sans_heure_la_regle_vaut_toujours(module):
    """Mieux vaut une veilleuse qui s'eteint trop souvent qu'une qui reste
    allumee."""
    assert module.dans_la_soiree(datetime(2026, 9, 4, 15, 0), '')
    assert module.dans_la_soiree(datetime(2026, 9, 4, 15, 0), None)


# ── Les lampes a eteindre ───────────────────────────────────────────────────

def test_seules_les_allumees_comptent(module):
    etats = {"light.a": FauxEtat("on"), "light.b": FauxEtat("off"), "light.c": FauxEtat("on")}
    assert module.a_eteindre(etats, []) == ["light.a", "light.c"]


def test_les_epargnees_sont_epargnees(module):
    etats = {"light.a": FauxEtat("on"), "light.veilleuse": FauxEtat("on")}
    assert module.a_eteindre(etats, ["light.veilleuse"]) == ["light.a"]


def test_une_lampe_muette_n_est_pas_eteinte(module):
    etats = {"light.a": FauxEtat("unavailable"), "light.b": FauxEtat("on")}
    assert module.a_eteindre(etats, []) == ["light.b"]


# ── La veilleuse ────────────────────────────────────────────────────────────

def cfg_veilleuse(**extra):
    v = {"actif": True, "lampes": ["light.veilleuse"], "duree": 0, "fondu": 5, "depuis": ""}
    v.update(extra)
    return {"veilleuse": v}


AVEC_FONDU = {"light.veilleuse": FauxEtat("on", {"supported_features": 32})}
SANS_FONDU = {"light.veilleuse": FauxEtat("on", {"supported_features": 0})}


def test_la_veilleuse_s_eteint_en_fondu(creer):
    n = creer(cfg_veilleuse(), AVEC_FONDU)
    lancer(n._async_eteindre_veilleuse("light.veilleuse"))
    assert n.hass.services.appels == [
        ("light", "turn_off", {"entity_id": ["light.veilleuse"], "transition": 300})
    ]


def test_une_lampe_qui_ne_sait_pas_fondre_s_eteint_franchement(creer):
    """On ne simule pas le fondu par paliers : ce serait saccade, ca remplirait
    le journal de Home Assistant et ca userait la liaison Zigbee."""
    n = creer(cfg_veilleuse(), SANS_FONDU)
    lancer(n._async_eteindre_veilleuse("light.veilleuse"))
    assert n.hass.services.appels == [
        ("light", "turn_off", {"entity_id": ["light.veilleuse"]})
    ]


def test_sans_fondu_demande_pas_de_transition(creer):
    n = creer(cfg_veilleuse(fondu=0), AVEC_FONDU)
    lancer(n._async_eteindre_veilleuse("light.veilleuse"))
    assert "transition" not in n.hass.services.appels[0][2]


def test_une_veilleuse_deja_eteinte_n_est_pas_touchee(creer):
    n = creer(cfg_veilleuse(), {"light.veilleuse": FauxEtat("off", {})})
    lancer(n._async_eteindre_veilleuse("light.veilleuse"))
    assert n.hass.services.appels == []


def test_une_lampe_hors_liste_est_ignoree(creer):
    n = creer(cfg_veilleuse(), {**AVEC_FONDU, "light.salon": FauxEtat("on", {})})
    lancer(n._async_armer("light.salon"))
    assert n.hass.services.appels == []


def test_eteindre_a_la_main_annule_la_minuterie(creer):
    n = creer(cfg_veilleuse(duree=30), AVEC_FONDU)
    n._minuteurs["light.veilleuse"] = lambda: None
    n._desarmer("light.veilleuse")
    assert n._minuteurs == {}


# ── L'extinction du soir ────────────────────────────────────────────────────

def cfg_coucher(**extra):
    c = {"actif": True, "heure": "23:30", "sauf": [], "jours": []}
    c.update(extra)
    return {"coucher": c}


LAMPES = {"light.salon": FauxEtat("on"), "light.cuisine": FauxEtat("off"),
          "light.veilleuse": FauxEtat("on")}


def test_le_coucher_eteint_ce_qui_traine(creer):
    n = creer(cfg_coucher(), LAMPES)
    lancer(n._async_coucher())
    assert n.hass.services.appels == [
        ("light", "turn_off", {"entity_id": ["light.salon", "light.veilleuse"]})
    ]


def test_le_coucher_epargne_ce_qu_on_lui_dit(creer):
    n = creer(cfg_coucher(sauf=["light.veilleuse"]), LAMPES)
    lancer(n._async_coucher())
    assert n.hass.services.appels[0][2]["entity_id"] == ["light.salon"]


def test_le_coucher_eteint_ne_fait_rien(creer):
    n = creer({"coucher": {"actif": False}}, LAMPES)
    lancer(n._async_coucher())
    assert n.hass.services.appels == []


def test_rien_d_allume_rien_a_faire(creer):
    n = creer(cfg_coucher(), {"light.salon": FauxEtat("off")})
    lancer(n._async_coucher())
    assert n.hass.services.appels == []


# ── La configuration ────────────────────────────────────────────────────────

def test_les_defauts(creer):
    n = creer()
    assert n.cfg["veilleuse"]["actif"] is False
    assert n.cfg["veilleuse"]["duree"] == 30
    assert n.cfg["coucher"]["heure"] == "23:30"


def test_un_patch_partiel_garde_le_reste(creer):
    n = creer(cfg_veilleuse())
    lancer(n.async_enregistrer({"veilleuse": {"duree": 45}}))
    assert n.cfg["veilleuse"]["duree"] == 45
    assert n.cfg["veilleuse"]["lampes"] == ["light.veilleuse"]
    assert n.cfg["veilleuse"]["fondu"] == 5

# ── Sur le socle ────────────────────────────────────────────────────────────

def test_la_veilleuse_eteint_ce_qu_une_main_a_allume(creer):
    """C'est sa definition : on l'allume au coucher, elle s'eteint seule. Le
    gel de cette main ne la retient pas — sinon une veilleuse de trente
    minutes ne s'eteindrait jamais, le gel durant trente minutes lui aussi."""
    from homeassistant.core import Context

    n = creer(cfg_veilleuse(), AVEC_FONDU)
    lancer(n._async_reabonner())

    class Ev:
        data = {"entity_id": "light.veilleuse"}
        context = Context(user_id="u1")

    n.regles._sur_changement(Ev())
    assert n.regles.gele("light.veilleuse")
    lancer(n._async_eteindre_veilleuse("light.veilleuse"))
    assert [a[1] for a in n.hass.services.appels] == ["turn_off"]


def test_le_coucher_respecte_une_main(creer):
    """L'extinction du soir, elle, cede : une lampe touchee a la main dans la
    demi-heure reste allumee, et le journal le dit."""
    from homeassistant.core import Context

    n = creer(cfg_coucher(), LAMPES)
    lancer(n._async_reabonner())

    class Ev:
        data = {"entity_id": "light.salon"}
        context = Context(user_id="u1")

    n.regles._sur_changement(Ev())
    lancer(n._async_coucher())
    assert n.hass.services.appels[0][2]["entity_id"] == ["light.veilleuse"]
    assert "1 sous la main" in lancer(n.regles.journal())[0]["detail"]


def test_les_niveaux_sont_dans_le_palier_nuit(module):
    regles = charger("regles")
    for niveau in module.PRIORITES.values():
        assert regles.ECHELLE["nuit"] <= niveau < regles.ECHELLE["presence"]
    assert module.PRIORITES["veilleuse"] > module.PRIORITES["coucher"]


def test_les_lampes_sont_declarees_au_socle(creer):
    n = creer({**cfg_veilleuse(), **cfg_coucher()}, {**AVEC_FONDU, "light.salon": FauxEtat("on")})
    lancer(n._async_reabonner())
    assert {"light.veilleuse", "light.salon"} <= n.regles._pilotees.get("nuit", set())


def test_en_simulation_le_coucher_n_eteint_rien(creer):
    n = creer({**cfg_coucher(), "simulation": {"actif": True}}, LAMPES)
    lancer(n._async_coucher())
    assert n.hass.services.appels == []
    assert lancer(n.regles.journal())[0]["simule"] is True


def test_l_etat_montre_le_journal_commun(creer):
    n = creer(cfg_coucher(), LAMPES)
    lancer(n._async_coucher())
    etat = lancer(n.async_etat())
    assert etat["journal"][0]["module"] == "nuit"
    assert etat["journal"][0]["motif"] == "23:30"
