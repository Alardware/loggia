"""Tests du test de sirene : « sonner trois secondes », tenu par le serveur.

Audit du 22/09 : le bouton « Test sonore (3 s) » allumait la sirene puis
comptait trois secondes DANS L'ONGLET avant de l'eteindre — onglet ferme ou
connexion perdue pendant ce temps, la sirene restait allumee. Ce qui compte
ici : le test part et s'arrete cote serveur, il respecte les droits de celui
qui appuie, il ne coupe jamais une sirene qui sonne pour de vrai, et un
redemarrage pendant le test l'eteint au lieu de l'oublier.
"""
from __future__ import annotations

import asyncio
import sys

import pytest

from conftest import COMPOSANT, FauxStore, charger


def lancer(coro):
    return asyncio.run(coro)


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
        self.appels.append((domaine, service, dict(data), getattr(context, "user_id", None)))


class FauxHass:
    def __init__(self, etats):
        self.states = FauxEtats({k: (v if isinstance(v, FauxEtat) else FauxEtat(v)) for k, v in etats.items()})
        self.services = FauxServices()
        self.taches = []

    def async_create_task(self, coro):
        self.taches.append(coro)
        return coro

    def abandonner(self):
        taches, self.taches = self.taches, []
        for coro in taches:
            coro.close()


class Rendezvous:
    """Remplace `async_call_later` : garde le delai et le rappel, sans attendre."""

    def __init__(self):
        self.poses = {}
        self.annules = 0
        self._n = 0

    def __call__(self, hass, delai, rappel):
        self._n += 1
        cle = self._n
        self.poses[cle] = (delai, rappel)

        def annuler():
            self.annules += 1
            self.poses.pop(cle, None)
        return annuler


@pytest.fixture
def module():
    return charger("sirene")


@pytest.fixture
def rdv(monkeypatch):
    ev = sys.modules["homeassistant.helpers.event"]
    r = Rendezvous()
    monkeypatch.setattr(ev, "async_call_later", r, raising=False)
    return r


@pytest.fixture
def creer(module, store_module, rdv):
    faits = []
    regles_module = charger("regles")

    def fabrique(etats=None, depart=None):
        magasin = store_module.LoggiaStore.__new__(store_module.LoggiaStore)
        magasin._store = FauxStore({"users": {}, "shared": {"loggia_sirene_test": depart or {}}, "migrated": True})
        magasin._ancien = FauxStore(None)
        magasin._data = None
        magasin._lock = asyncio.Lock()
        m = module.LoggiaSirene.__new__(module.LoggiaSirene)
        m.hass = FauxHass(etats or {})
        m.store = magasin
        m.regles = regles_module.Regles(m.hass, magasin)
        m.regles._depot = FauxStore(None)
        m.table = {}
        m._rdv = {}
        faits.append(m)
        return m

    yield fabrique
    for m in faits:
        m.hass.abandonner()


def journal(m):
    return [(e["quoi"], e["motif"], e["cibles"]) for e in lancer(m.regles.journal(module="sirene"))]


def rdv_du_module(rdv):
    """Les rendez-vous du module seul : le journal pose le sien (20 s) a
    chaque ligne ecrite, et il n'est pas ce qu'on regarde ici."""
    return [(d, r) for d, r in rdv.poses.values() if d <= 3]


# ── Ce qui se calcule ───────────────────────────────────────────────────────

def test_seules_les_sirenes_se_testent(module):
    for bon in ("siren.interieure", "switch.sirene_garage"):
        assert module.valide(bon), bon
    for mauvais in ("light.salon", "alarm_control_panel.maison", "siren.", "siren.Interieure",
                    "script.sonner", None, 42, "siren.x; rm -rf"):
        assert not module.valide(mauvais), mauvais


def test_la_duree_geree_se_lit_dans_les_drapeaux(module):
    assert module.gere_duree(16) and module.gere_duree(23) and module.gere_duree("16")
    for non in (7, 0, None, "", "beaucoup", 15):
        assert not module.gere_duree(non), non


def test_la_table_relue_ecarte_l_illisible(module):
    brut = {
        "siren.a": {"fin": 1000, "par": "u1"},
        "siren.b": {"fin": "pas un nombre"},
        "light.c": {"fin": 1000},
        "switch.d": "n'importe quoi",
        "switch.e": {"fin": 5.5, "par": 12},
    }
    t = module.normaliser(brut)
    assert t == {"siren.a": {"fin": 1000.0, "par": "u1"}, "switch.e": {"fin": 5.5, "par": None}}
    assert module.normaliser(None) == {} and module.normaliser([1, 2]) == {}


# ── Le module ───────────────────────────────────────────────────────────────

def test_un_switch_s_allume_puis_le_serveur_l_eteint_trois_secondes_plus_tard(creer, rdv):
    m = creer({"switch.sirene": "off"})
    etat = lancer(m.async_tester("switch.sirene", par="u1"))
    assert m.hass.services.appels == [("switch", "turn_on", {"entity_id": ["switch.sirene"]}, "u1")]
    assert etat["entity_id"] == "switch.sirene" and etat["duree"] == 3
    assert 0 < etat["fin"] - etat["maintenant"] <= 3
    # Sauve : un redemarrage pendant le test saura qu'elle sonne.
    assert lancer(m.store.async_get_shared("loggia_sirene_test"))["switch.sirene"]["par"] == "u1"
    (delai, rappel), = rdv_du_module(rdv)
    assert 2.9 < delai <= 3
    assert journal(m) == [("sonner", "test sonore de 3 s", ["switch.sirene"])]
    # L'heure passe : le serveur eteint, de la main de celui qui a teste.
    m.hass.states.table["switch.sirene"] = FauxEtat("on")
    rappel(None)
    lancer(m.hass.taches.pop())
    assert m.hass.services.appels[-1] == ("switch", "turn_off", {"entity_id": ["switch.sirene"]}, "u1")
    assert m.table == {}
    assert lancer(m.store.async_get_shared("loggia_sirene_test")) == {}
    # Le journal se lit du plus recent au plus ancien.
    assert journal(m) == [("eteindre", "fin du test", ["switch.sirene"]),
                          ("sonner", "test sonore de 3 s", ["switch.sirene"])]


def test_une_sirene_qui_gere_la_duree_est_eteinte_par_home_assistant(creer, rdv):
    m = creer({"siren.a": FauxEtat("off", {"supported_features": 16})})
    etat = lancer(m.async_tester("siren.a", par="u1"))
    assert m.hass.services.appels == [("siren", "turn_on", {"entity_id": ["siren.a"], "duration": 3}, "u1")]
    # Un rendez-vous est arme ici AUSSI (audit du 23/09) : sans entree dans la
    # table, un second appui pendant notre propre test etait refuse comme si la
    # sirene sonnait pour de vrai. A l'echeance elle est deja eteinte, et
    # `_async_eteindre` se contente de nettoyer.
    assert len(rdv_du_module(rdv)) == 1 and set(m._rdv) == {"siren.a"}
    assert set(m.table) == {"siren.a"}
    assert etat["duree"] == 3
    assert journal(m) == [("sonner", "test sonore de 3 s (duree geree par la sirene)", ["siren.a"])]


def test_une_sirene_sans_duree_est_tenue_comme_un_switch(creer, rdv):
    m = creer({"siren.a": FauxEtat("off", {"supported_features": 7})})
    lancer(m.async_tester("siren.a"))
    assert m.hass.services.appels == [("siren", "turn_on", {"entity_id": ["siren.a"]}, None)]
    assert list(m.table) == ["siren.a"] and len(rdv_du_module(rdv)) == 1


def test_reappuyer_pendant_le_test_repart_de_zero(creer, rdv):
    m = creer({"switch.s": "off"})
    lancer(m.async_tester("switch.s", par="u1"))
    m.hass.states.table["switch.s"] = FauxEtat("on")
    lancer(m.async_tester("switch.s", par="u1"))
    assert rdv.annules >= 1 and len(rdv_du_module(rdv)) == 1 and set(m._rdv) == {"switch.s"}, "un seul rendez-vous, le dernier"
    assert len(m.hass.services.appels) == 2, "rallumee, pas eteinte au milieu"


def test_une_sirene_qui_sonne_pour_de_vrai_ne_se_teste_pas(creer, rdv):
    m = creer({"siren.a": "on"})
    with pytest.raises(ValueError):
        lancer(m.async_tester("siren.a"))
    assert m.hass.services.appels == [] and rdv_du_module(rdv) == []


def test_indisponible_ou_inconnue_rien_ne_part(creer):
    m = creer({"siren.a": "unavailable"})
    for haid in ("siren.a", "siren.inconnue", "light.salon"):
        with pytest.raises(ValueError):
            lancer(m.async_tester(haid))
    assert m.hass.services.appels == []


def test_personne_ne_teste_ce_qu_il_ne_pilote_pas(creer):
    m = creer({"siren.a": "off"})
    with pytest.raises(PermissionError):
        lancer(m.async_tester("siren.a", controle=lambda _h: False))
    assert m.hass.services.appels == [] and m.table == {}


def test_deja_eteinte_a_l_heure_dite_rien_a_faire(creer, rdv):
    m = creer({"switch.s": "off"})
    lancer(m.async_tester("switch.s"))
    (_, rappel), = rdv_du_module(rdv)
    rappel(None)
    lancer(m.hass.taches.pop())
    assert [a[1] for a in m.hass.services.appels] == ["turn_on"], "pas de turn_off sur une sirene deja eteinte"
    assert journal(m) == [("sonner", "test sonore de 3 s", ["switch.s"])]


def test_au_demarrage_un_test_en_cours_est_eteint_aussitot(creer, rdv):
    m = creer({"switch.s": "on", "siren.b": "off"},
              depart={"switch.s": {"fin": 1.0, "par": "u1"}, "siren.b": {"fin": 1.0, "par": "u2"}})
    lancer(m._async_demarrer())
    # Un redemarrage dure plus de trois secondes : elle a assez sonne.
    assert m.hass.services.appels == [("switch", "turn_off", {"entity_id": ["switch.s"]}, "u1")]
    assert m.table == {} and m._rdv == {} and rdv_du_module(rdv) == []
    assert lancer(m.store.async_get_shared("loggia_sirene_test")) == {}
    assert journal(m) == [("eteindre", "fin du test (redemarrage pendant le test)", ["switch.s"])]


# ── Le cablage ──────────────────────────────────────────────────────────────

def test_le_composant_cree_le_module_et_ouvre_sa_commande():
    init = (COMPOSANT / "__init__.py").read_text(encoding="utf-8")
    assert 'data["sirene"] = LoggiaSirene(hass, data["store"], data.get("regles"))' in init
    assert 'acces_sirene=lambda: hass.data.get(DOMAIN, {}).get("sirene")' in init
    ws = (COMPOSANT / "websocket_api.py").read_text(encoding="utf-8")
    assert "loggia/sirene/tester" in ws
    assert "websocket_api.async_register_command(hass, handle_sir_tester)" in ws
    i = ws.index("async def handle_sir_tester")
    # Le geste d'une carte : ouvert a tout compte connecte...
    assert "require_admin" not in ws[i - 300:i]
    # ... mais sur ce qu'il a le droit de PILOTER, et c'est lui qui teste.
    assert "await sirene.async_tester(msg[\"entity_id\"], par=connection.user.id," in ws


def test_reappuyer_pendant_le_test_d_une_sirene_a_duree_repart_de_zero(creer, rdv):
    """La garde « elle sonne deja » ne doit viser QUE ce qui ne vient pas de
    nous. Une sirene qui gere sa duree n'entrait pas dans la table : le second
    appui etait refuse, et la carte disait « Le test n'a pas pu partir »."""
    m = creer({"siren.a": FauxEtat("off", {"supported_features": 16})})
    lancer(m.async_tester("siren.a", par="u1"))
    m.hass.states.table["siren.a"] = FauxEtat("on", {"supported_features": 16})
    lancer(m.async_tester("siren.a", par="u1"))
    assert len(m.hass.services.appels) == 2, "le second appui doit repartir"
    assert len(rdv_du_module(rdv)) == 1, "un seul rendez-vous : le precedent est desarme"


def test_a_l_echeance_une_sirene_deja_eteinte_ne_recoit_rien(creer, rdv):
    """Elle s'est arretee seule : on nettoie la table, on ne commande rien, et
    on n'ecrit pas une extinction qui n'a pas eu lieu."""
    m = creer({"siren.a": FauxEtat("off", {"supported_features": 16})})
    lancer(m.async_tester("siren.a"))
    m.hass.services.appels.clear()
    _, rappel = rdv_du_module(rdv)[0]
    rappel(None)
    lancer(m.hass.taches.pop())
    assert m.hass.services.appels == [], "la sirene etait deja eteinte"
    assert m.table == {}, "la table est nettoyee"
    assert [j for j in journal(m) if j[0] == "eteindre"] == []
