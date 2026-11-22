"""Tests du planning des purificateurs d'air (sa consigne du 21/11, ADR 0387), tenu par le serveur.

Ce qui compte : une semaine illisible ne s'enregistre pas ; le planning n'agit qu'aux CHANGEMENTS de mode — un reglage a la
main tient jusqu'au suivant, et minuit ne reimpose pas la Nuit commencee la veille ; chaque mode devient le bon service de
l'appareil, ou rien quand il ne le sait pas ; un changement manque pendant un redemarrage part au demarrage, une seule fois ;
un compte ne lit que les purificateurs qu'il a le droit de lire.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone

import pytest

from conftest import FauxStore, charger


def lancer(coro):
    return asyncio.run(coro)


SEMAINE = [{"debut": 0, "mode": "nuit"}, {"debut": 420, "mode": "auto"}, {"debut": 510, "mode": "arret"},
           {"debut": 1050, "mode": "auto"}, {"debut": 1350, "mode": "nuit"}]
WEEKEND = [{"debut": 0, "mode": "nuit"}, {"debut": 570, "mode": "auto"}, {"debut": 1380, "mode": "nuit"}]
TYPE = [SEMAINE] * 5 + [WEEKEND] * 2
# Le LV-PUR131S : vitesse (1), prereglages (8), eteindre (16), allumer (32).
VESYNC = {"supported_features": 57, "preset_modes": ["auto", "sleep"], "percentage_step": 100 / 3, "preset_mode": "auto"}


class FauxEtat:
    def __init__(self, state, attributes=None):
        self.state = state
        self.attributes = dict(attributes or {})


class FauxEtats:
    def __init__(self, table):
        self.table = dict(table)

    def get(self, haid):
        return self.table.get(haid)


class FauxServices:
    def __init__(self):
        self.appels = []

    async def async_call(self, domaine, service, data, blocking=False, context=None):
        self.appels.append((domaine, service, dict(data)))


class FauxHass:
    def __init__(self, etats):
        self.states = FauxEtats(etats)
        self.services = FauxServices()

    def async_create_task(self, coro):
        coro.close()


@pytest.fixture
def module():
    return charger("purificateurs")


@pytest.fixture
def creer(module, store_module):
    regles_module = charger("regles")

    def fabrique(etats=None, table=None):
        magasin = store_module.LoggiaStore.__new__(store_module.LoggiaStore)
        magasin._store = FauxStore({"users": {}, "shared": {"loggia_purificateurs": table or {}}, "migrated": True})
        magasin._ancien = FauxStore(None)
        magasin._data = None
        magasin._lock = asyncio.Lock()
        m = module.LoggiaPurificateurs.__new__(module.LoggiaPurificateurs)
        m.hass = FauxHass(etats if etats is not None else {"fan.air": FauxEtat("on", VESYNC)})
        m.store = magasin
        m.regles = regles_module.Regles(m.hass, magasin)
        m.regles._depot = FauxStore(None)
        m.table = module.normaliser(table or {})
        m._tic = None
        m._au_demarrage = None
        m._tentes = {}
        return m

    return fabrique


def a(jour, h, mi=0, s=0):
    """Le 16/11/2026 est un lundi : `jour` 0 = lundi."""
    return datetime(2026, 11, 16 + jour, h, mi, s, tzinfo=timezone.utc)


# ── Ce qui se calcule ───────────────────────────────────────────────────────

def test_une_semaine_illisible_est_refusee_par_son_code(module):
    assert module.semaine(TYPE)[0][1] == {"debut": 420, "mode": "auto"}
    mauvaises = [
        TYPE[:6],                                                     # six jours
        [[{"debut": 30, "mode": "auto"}]] * 7,                        # la premiere plage ne commence pas a 00:00
        [[{"debut": 0, "mode": "auto"}, {"debut": 45, "mode": "nuit"}]] * 7,     # hors du pas de 30 min
        [[{"debut": 0, "mode": "auto"}, {"debut": 0, "mode": "nuit"}]] * 7,      # deux plages a la meme heure
        [[{"debut": 0, "mode": "turbo"}]] * 7,                        # un mode que le planning ne connait pas
        [[{"debut": 0, "mode": "auto"}, {"debut": 1440, "mode": "nuit"}]] * 7,   # 24:00
        [[{"debut": True, "mode": "auto"}]] * 7,                      # un booleen n'est pas une heure
        [[{"debut": 0, "mode": "v7"}]] * 7,                           # sept crans
    ]
    for m in mauvaises:
        with pytest.raises(ValueError) as e:
            module.semaine(m)
        assert getattr(e.value, "code", None) == "purificateur_semaine", m


def test_seuls_les_changements_de_mode_comptent_minuit_compris(module):
    s = module.semaine(TYPE)
    ch = module.changements(s)
    # La Nuit de 22:30 continue a 00:00 : minuit n'est pas un changement (du dimanche au lundi non plus : 23:00 -> 00:00,
    # Nuit aussi). Lundi : 07:00 Auto, 08:30 Arret, 17:30 Auto, 22:30 Nuit.
    assert [(j, d, m) for j, d, m in ch if j == 0] == [(0, 420, "auto"), (0, 510, "arret"), (0, 1050, "auto"), (0, 1350, "nuit")]
    assert module.change_a(s, 0, 0) is None
    assert module.change_a(s, 0, 420) == "auto"
    assert module.change_a(s, 5, 570) == "auto"
    # Une semaine d'un seul mode ne change jamais.
    assert module.changements(module.semaine([[{"debut": 0, "mode": "auto"}]] * 7)) == []


def test_le_dernier_changement_se_compte_sur_la_semaine(module):
    s = module.semaine(TYPE)
    assert module.dernier_changement(s, 0, 450) == (30, "auto")       # lundi 07:30 : Auto depuis 30 min
    assert module.dernier_changement(s, 0, 60) == (60 + 60, "nuit")   # lundi 01:00 : la Nuit de dimanche 23:00
    assert module.dernier_changement(module.semaine([[{"debut": 0, "mode": "auto"}]] * 7), 0, 60) is None


def test_chaque_mode_devient_le_service_de_l_appareil(module):
    assert module.ordre("arret", VESYNC) == ("turn_off", {})
    assert module.ordre("auto", VESYNC) == ("turn_on", {"preset_mode": "auto"})
    assert module.ordre("nuit", VESYNC) == ("turn_on", {"preset_mode": "sleep"})
    assert module.ordre("v1", VESYNC) == ("turn_on", {"percentage": 33})
    assert module.ordre("v2", VESYNC) == ("turn_on", {"percentage": 67})
    assert module.ordre("v3", VESYNC) == ("turn_on", {"percentage": 100})
    # Ce que l'appareil ne sait pas : rien.
    assert module.ordre("v4", VESYNC) is None
    assert module.ordre("nuit", {"preset_modes": ["auto"]}) is None
    assert module.ordre("v1", {"preset_modes": ["auto"]}) is None
    # Les mots d'un autre fabricant, sans casse.
    assert module.ordre("nuit", {"supported_features": 8 | 16 | 32, "preset_modes": ["Auto", "Silent", "Favorite"]}) == ("turn_on", {"preset_mode": "Silent"})


def test_ce_que_l_appareil_ne_declare_pas_ne_part_pas(module):
    """La remarque du 21/11 : « les commandes doivent correspondre a l'entite ». Le serveur suit le meme masque que la fiche."""
    simple = {"supported_features": 16 | 32}                       # marche et arret, rien d'autre
    assert module.ordre("marche", simple) == ("turn_on", {})
    assert module.ordre("arret", simple) == ("turn_off", {})
    assert module.ordre("auto", {**simple, "preset_modes": ["auto"]}) is None, "des prereglages sans le bit 8"
    assert module.ordre("v1", {**simple, "percentage_step": 25}) is None, "une vitesse sans le bit 1"
    assert module.ordre("arret", {"supported_features": 32}) is None, "eteindre sans le bit 16"
    assert module.ordre("marche", {"supported_features": 16}) is None, "allumer sans le bit 32"
    # Sans masque (un etat incomplet) : allumer et eteindre, rien d'autre.
    assert module.ordre("marche", {}) == ("turn_on", {}) and module.ordre("arret", {}) == ("turn_off", {})
    assert module.ordre("auto", {"preset_modes": ["auto"]}) is None
    # Des crans sans modes : quatre vitesses de 25 %.
    crans = {"supported_features": 1 | 16 | 32, "percentage_step": 25}
    assert [module.ordre("v%d" % k, crans) for k in (1, 4, 5)] == [("turn_on", {"percentage": 25}), ("turn_on", {"percentage": 100}), None]
    assert module.semaine([[{"debut": 0, "mode": "marche"}]] * 7)[0] == [{"debut": 0, "mode": "marche"}]


def test_la_table_relue_ecarte_l_illisible(module):
    t = module.normaliser({"fan.air": {"actif": True, "semaine": TYPE, "dernier": 12.5}, "light.x": {"actif": True, "semaine": TYPE},
                           "fan.casse": {"actif": True, "semaine": "non"}, "fan.ok": {"actif": "oui", "semaine": TYPE}})
    assert sorted(t) == ["fan.air", "fan.ok"]
    assert t["fan.air"]["dernier"] == 12.5 and t["fan.ok"]["actif"] is False


def test_un_compte_ne_lit_que_ce_qu_il_a_le_droit_de_lire(module):
    t = module.normaliser({"fan.air": {"actif": True, "semaine": TYPE}, "fan.chambre": {"actif": False, "semaine": TYPE}})
    tout = module.vue(t, 1.0)
    assert sorted(tout["purificateurs"]) == ["fan.air", "fan.chambre"] and "dernier" not in tout["purificateurs"]["fan.air"]
    assert sorted(module.vue(t, 1.0, lambda h: h == "fan.air")["purificateurs"]) == ["fan.air"]


# ── Le module ───────────────────────────────────────────────────────────────

def test_le_planning_part_a_chaque_changement_et_seulement_la(creer):
    m = creer(table={"fan.air": {"actif": True, "semaine": TYPE}})
    assert lancer(m.async_minute(a(0, 7, 0))) == ["fan.air"]
    assert m.hass.services.appels == [("fan", "turn_on", {"entity_id": ["fan.air"], "preset_mode": "auto"})]
    # Entre deux changements, rien : le reglage a la main tient.
    assert lancer(m.async_minute(a(0, 7, 1))) == []
    # Minuit, Nuit -> Nuit : rien.
    assert lancer(m.async_minute(a(1, 0, 0))) == []
    assert lancer(m.async_minute(a(0, 8, 30))) == ["fan.air"]
    assert m.hass.services.appels[-1] == ("fan", "turn_off", {"entity_id": ["fan.air"]})
    lignes = lancer(m.regles.journal(module="purificateurs"))
    assert [e["quoi"] for e in lignes][:2] == ["arret", "auto"] and lignes[0]["motif"] == "planning 08:30"


def test_un_planning_eteint_ne_commande_rien(creer):
    m = creer(table={"fan.air": {"actif": False, "semaine": TYPE}})
    assert lancer(m.async_minute(a(0, 7, 0))) == [] and m.hass.services.appels == []


def test_l_heure_repetee_ne_relance_pas_le_meme_changement(creer):
    m = creer(table={"fan.air": {"actif": True, "semaine": TYPE}})
    assert lancer(m.async_minute(a(0, 7, 0))) == ["fan.air"]
    assert lancer(m.async_minute(a(0, 7, 0))) == []
    assert len(m.hass.services.appels) == 1


def test_un_appareil_muet_ou_qui_ignore_le_mode_n_est_pas_commande(creer):
    m = creer(etats={"fan.air": FauxEtat("unavailable", VESYNC)}, table={"fan.air": {"actif": True, "semaine": TYPE}})
    assert lancer(m.async_minute(a(0, 7, 0))) == [] and m.hass.services.appels == []
    m = creer(etats={"fan.air": FauxEtat("on", {"preset_modes": ["sleep"]})}, table={"fan.air": {"actif": True, "semaine": TYPE}})
    assert lancer(m.async_minute(a(0, 7, 0))) == [] and m.hass.services.appels == []
    lignes = lancer(m.regles.journal(module="purificateurs"))
    assert lignes and lignes[0].get("echec") is True


def test_le_changement_manque_pendant_un_redemarrage_part_une_fois(creer):
    quand = a(0, 7, 40)
    applique_avant = a(0, 0, 0).timestamp()                  # la derniere fois : avant 07:00
    m = creer(table={"fan.air": {"actif": True, "semaine": TYPE, "dernier": applique_avant}})
    assert lancer(m._async_rattraper(quand=quand)) == ["fan.air"]
    assert m.hass.services.appels == [("fan", "turn_on", {"entity_id": ["fan.air"], "preset_mode": "auto"})]
    # Relu au demarrage suivant, il est deja applique : rien.
    m.table["fan.air"]["dernier"] = quand.timestamp()
    assert lancer(m._async_rattraper(quand=a(0, 7, 50))) == []
    # Applique a 07:00 avant l'arret (un reglage a la main depuis) : rien.
    m = creer(table={"fan.air": {"actif": True, "semaine": TYPE, "dernier": a(0, 7, 0, 5).timestamp()}})
    assert lancer(m._async_rattraper(quand=quand)) == []
    # Plus de six heures : trop vieux.
    m = creer(table={"fan.air": {"actif": True, "semaine": TYPE, "dernier": 0}})
    assert lancer(m._async_rattraper(quand=a(0, 16, 0))) == []


def test_regler_valide_et_allumer_ne_commande_rien(creer):
    m = creer(table={})
    with pytest.raises(ValueError) as e:
        lancer(m.async_regler("light.x", True, TYPE))
    assert e.value.code == "purificateur_inconnu"
    with pytest.raises(ValueError) as e:
        lancer(m.async_regler("fan.inconnu", True, TYPE))
    assert e.value.code == "purificateur_inconnu"
    with pytest.raises(ValueError) as e:
        lancer(m.async_regler("fan.air", True))
    assert e.value.code == "purificateur_semaine"
    etat = lancer(m.async_regler("fan.air", True, TYPE))
    assert etat["purificateurs"]["fan.air"]["actif"] is True
    assert m.hass.services.appels == [], "allumer le planning ne commande pas l'appareil sur-le-champ"
    # L'interrupteur seul garde la semaine ; la semaine seule garde l'interrupteur.
    lancer(m.async_regler("fan.air", False))
    assert m.table["fan.air"]["actif"] is False and m.table["fan.air"]["semaine"][0] == SEMAINE
    lancer(m.async_regler("fan.air", None, [[{"debut": 0, "mode": "auto"}]] * 7))
    assert m.table["fan.air"]["actif"] is False and m.table["fan.air"]["semaine"][0] == [{"debut": 0, "mode": "auto"}]
    assert lancer(m.store.async_get_shared("loggia_purificateurs"))["fan.air"]["semaine"][0] == [{"debut": 0, "mode": "auto"}]
