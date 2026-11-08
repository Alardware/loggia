"""Tests des rappels : « me prevenir a 22 h 30 », tenus par le serveur (07/11, usage etape 11).

Le geste d'un conseil de la vue Energie. Ce qui compte : le rappel part a
l'heure, ecran ferme, vers les telephones de CELUI qui l'a pose ; il se tait si
l'appareil tourne deja ; il survit a un redemarrage sans partir des heures en
retard ; un compte ne voit ni n'annule les rappels d'un autre.
"""
from __future__ import annotations

import asyncio
import sys
import time
from types import SimpleNamespace

import pytest

from conftest import COMPOSANT, FauxStore, charger


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


class FauxHass:
    def __init__(self, etats):
        self.states = FauxEtats({k: FauxEtat(*v) for k, v in etats.items()})
        self.data = {}
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


class FauxRegles:
    """Le socle, reduit a ce que les rappels lui demandent."""

    def __init__(self, services):
        self.services = list(services)
        self.envois = []
        self.calme = None

    async def prevenir(self, module, regle, message, compte=None, **_k):
        self.envois.append((module, regle, message, compte))
        return True

    async def services_du_compte(self, user_id, cfg=None):
        return list(self.services) if user_id else []

    async def plage_calme(self):
        return self.calme


LV = {"switch.lv": ("off", {"friendly_name": "Lave-vaisselle"})}


@pytest.fixture
def module():
    return charger("rappels")


@pytest.fixture
def rdv(monkeypatch):
    r = Rendezvous()
    monkeypatch.setattr(sys.modules["homeassistant.helpers.event"], "async_call_later", r, raising=False)
    return r


@pytest.fixture
def creer(module, store_module, rdv):
    faits = []

    def fabrique(etats=None, depart=None, services=("mobile_app_x",)):
        magasin = store_module.LoggiaStore.__new__(store_module.LoggiaStore)
        magasin._store = FauxStore({"users": {}, "shared": {"loggia_rappels": depart or {}}, "migrated": True})
        magasin._ancien = FauxStore(None)
        magasin._data = None
        magasin._lock = asyncio.Lock()
        m = module.LoggiaRappels.__new__(module.LoggiaRappels)
        m.hass = FauxHass(etats or {})
        m.store = magasin
        m.regles = FauxRegles(services)
        m.table = module.normaliser(depart or {})
        m._rdv = {}
        m._au_demarrage = None
        faits.append(m)
        return m

    yield fabrique
    for m in faits:
        m.hass.abandonner()


def executer(m):
    taches, m.hass.taches = m.hass.taches, []
    for coro in taches:
        lancer(coro)


# ── Ce qui se calcule ───────────────────────────────────────────────────────

def test_un_rappel_a_un_instant_proche_une_sorte_et_au_plus_une_prise(module):
    t = 1_000_000.0
    with pytest.raises(ValueError):
        module.poser({}, t + 10, "hc", None, "u1", t, "r")          # moins de 30 s
    with pytest.raises(ValueError):
        module.poser({}, t + 25 * 3600, "hc", None, "u1", t, "r")   # au-dela d'une journee
    with pytest.raises(ValueError):
        module.poser({}, True, "hc", None, "u1", t, "r")             # un booleen n'est pas un instant
    with pytest.raises(ValueError):
        module.poser({}, t + 3600, "plus_tard", None, "u1", t, "r")
    with pytest.raises(ValueError):
        module.poser({}, t + 3600, "hc", "light.salon", "u1", t, "r")  # une lampe ne se lance pas
    with pytest.raises(ValueError):
        module.poser({}, t + 3600, "hc", None, "", t, "r")           # personne
    table = module.poser({}, t + 3600, "creux", "switch.lv", "u1", t, "r")
    assert table == {"r": {"quand": t + 3600, "par": "u1", "entite": "switch.lv", "sorte": "creux"}}


def test_reposer_pour_le_meme_appareil_remplace(module):
    t = 1_000_000.0
    table = module.poser({}, t + 3600, "hc", "switch.lv", "u1", t, "a")
    table = module.poser(table, t + 7200, "hc", "switch.lv", "u1", t, "b")
    assert list(table) == ["b"]
    table = module.poser(table, t + 7200, "hc", "switch.lv", "u2", t, "c")   # un autre compte : le sien
    table = module.poser(table, t + 7200, "hc", None, "u1", t, "d")          # sans appareil : un autre rappel
    assert sorted(table) == ["b", "c", "d"]


def test_un_compte_a_un_plafond(module):
    t = 1_000_000.0
    table = {}
    for i in range(module.MAX_PAR_COMPTE):
        table = module.poser(table, t + 3600, "hc", "switch.p%d" % i, "u1", t, "r%d" % i)
    with pytest.raises(ValueError):
        module.poser(table, t + 3600, "hc", "switch.p99", "u1", t, "trop")
    assert len(module.poser(table, t + 3600, "hc", "switch.p99", "u2", t, "autre")) == module.MAX_PAR_COMPTE + 1


def test_la_table_relue_ecarte_l_illisible_et_garde_l_echu(module):
    brut = {
        "ok": {"quand": 5.0, "par": "u1", "entite": None, "sorte": "hc"},
        "prise": {"quand": "6", "par": "u1", "entite": "switch.lv", "sorte": "creux"},
        "lampe": {"quand": 6, "par": "u1", "entite": "light.x", "sorte": "hc"},
        "sans_compte": {"quand": 6, "sorte": "hc"},
        "sorte": {"quand": 6, "par": "u1", "sorte": "jamais"},
        "quand": {"quand": "bientot", "par": "u1", "sorte": "hc"},
        "rien": "n'importe quoi",
    }
    assert module.normaliser(brut) == {
        "ok": {"quand": 5.0, "par": "u1", "entite": None, "sorte": "hc"},
        "prise": {"quand": 6.0, "par": "u1", "entite": "switch.lv", "sorte": "creux"},
    }
    assert module.normaliser(None) == {}


def test_l_ecran_ne_voit_que_les_siens_a_venir_sans_savoir_qui(module):
    table = {"a": {"quand": 50.0, "par": "u1", "entite": None, "sorte": "hc"},
             "b": {"quand": 200.0, "par": "u1", "entite": "switch.lv", "sorte": "hc"},
             "c": {"quand": 150.0, "par": "u2", "entite": None, "sorte": "hc"}}
    v = module.vue(table, "u1", 100.0)
    assert v == {"rappels": [{"id": "b", "quand": 200.0, "entite": "switch.lv", "sorte": "hc"}], "maintenant": 100.0}


def test_le_message_nomme_la_prise_ou_s_en_passe(module):
    phrase = lambda e, nom: module.MESSAGES[module.cle_message(e, nom)][1]  # noqa: E731
    assert phrase({"sorte": "hc", "entite": "switch.lv"}, "Lave-vaisselle") == "{nom} : les heures creuses commencent"
    assert phrase({"sorte": "hc", "entite": "switch.lv"}, "") == "Les heures creuses commencent"
    assert phrase({"sorte": "creux", "entite": None}, "X") == "Le moment le moins cher commence"
    # Chaque gabarit est une phrase du telephone, traduite (scripts/textes_serveur.mjs).
    catalogue = (COMPOSANT.parent.parent / "scripts" / "textes_serveur.mjs").read_text(encoding="utf-8")
    for _, gabarit in module.MESSAGES.values():
        assert "'%s'" % gabarit in catalogue, gabarit


# ── Le module ───────────────────────────────────────────────────────────────

def test_poser_sauve_arme_et_rend_l_etat_du_compte(creer, rdv):
    m = creer(LV)
    quand = time.time() + 3600
    etat = lancer(m.async_poser(quand, "hc", "switch.lv", par="u1"))
    assert etat["peut"] is True and etat["calme"] is None
    assert [(r["entite"], r["sorte"]) for r in etat["rappels"]] == [("switch.lv", "hc")]
    assert "par" not in etat["rappels"][0]
    (delai, _), = rdv.poses.values()
    assert 3590 < delai <= 3600
    sauve = lancer(m.store.async_get_shared("loggia_rappels", None))
    assert [e["par"] for e in sauve.values()] == ["u1"]


def test_reposer_desarme_l_ancien_rendez_vous(creer, rdv):
    m = creer(LV)
    lancer(m.async_poser(time.time() + 3600, "hc", "switch.lv", par="u1"))
    lancer(m.async_poser(time.time() + 7200, "hc", "switch.lv", par="u1"))
    assert len(m.table) == 1 and len(rdv.poses) == 1 and rdv.annules == 1


def test_a_l_heure_le_telephone_de_celui_qui_l_a_pose(creer, rdv):
    m = creer(LV)
    lancer(m.async_poser(time.time() + 3600, "hc", "switch.lv", par="u1"))
    (_, rappel), = rdv.poses.values()
    rappel(None)
    executer(m)
    assert m.regles.envois == [("rappels", "rappel", ("{nom} : les heures creuses commencent", {"nom": "Lave-vaisselle"}), "u1")]
    assert m.table == {}
    assert lancer(m.store.async_get_shared("loggia_rappels", None)) == {}


def test_il_se_tait_si_l_appareil_tourne_deja(creer, rdv):
    m = creer(LV)
    m.hass.data = {"loggia": {"prises": SimpleNamespace(memoire={"switch.lv": {"suivi": {"en_cours": True}}})}}
    lancer(m.async_poser(time.time() + 3600, "hc", "switch.lv", par="u1"))
    (_, rappel), = rdv.poses.values()
    rappel(None)
    executer(m)
    assert m.regles.envois == [] and m.table == {}


def test_au_redemarrage_l_echu_recent_part_et_le_vieux_s_oublie(creer, rdv):
    t = time.time()
    m = creer(LV, depart={
        "recent": {"quand": t - 60, "par": "u1", "entite": None, "sorte": "hc"},
        "vieux": {"quand": t - 3 * 3600, "par": "u1", "entite": None, "sorte": "hc"},
        "a_venir": {"quand": t + 600, "par": "u2", "entite": None, "sorte": "creux"},
    })
    lancer(m._async_rattraper())
    assert m.regles.envois == [("rappels", "rappel", ("Les heures creuses commencent", {"nom": ""}), "u1")]
    assert list(m.table) == ["a_venir"] and len(rdv.poses) == 1


def test_un_compte_n_annule_pas_le_rappel_d_un_autre(creer):
    m = creer(LV)
    etat = lancer(m.async_poser(time.time() + 3600, "hc", None, par="u1"))
    rid = etat["rappels"][0]["id"]
    assert lancer(m.async_annuler(rid, par="u2"))["rappels"] == []      # il ne le voit meme pas
    assert rid in m.table
    assert lancer(m.async_annuler(rid, par="u1"))["rappels"] == []
    assert m.table == {}


def test_sans_telephone_l_ecran_ne_propose_rien(creer):
    m = creer(LV, services=())
    assert lancer(m.async_etat("u1"))["peut"] is False


def test_une_prise_qu_on_ne_pilote_pas_ne_se_nomme_pas(creer):
    m = creer(LV)
    with pytest.raises(PermissionError):
        lancer(m.async_poser(time.time() + 3600, "hc", "switch.lv", par="u1", controle=lambda _h: False))
    with pytest.raises(ValueError):
        lancer(m.async_poser(time.time() + 3600, "hc", "switch.inconnue", par="u1"))
    assert m.table == {}


def test_l_arret_desarme_tout(creer, rdv):
    m = creer(LV)
    lancer(m.async_poser(time.time() + 3600, "hc", "switch.lv", par="u1"))
    m.async_arreter()
    assert rdv.poses == {} and m._rdv == {}


def test_le_composant_cree_le_module_et_ouvre_ses_trois_commandes():
    from conftest import declaration

    init = (COMPOSANT / "__init__.py").read_text(encoding="utf-8")
    assert 'Module("rappels", "LoggiaRappels", _REGLES, _REGLES,' in init
    vivants = init.split("MODULES_VIVANTS = (")[1].split(")")[0]
    assert '"rappels"' in vivants
    ws = (COMPOSANT / "websocket_api.py").read_text(encoding="utf-8")
    for commande, constante, nom in (("loggia/rappels/etat", "WS_RAP_ETAT", "handle_rap_etat"),
                                     ("loggia/rappels/poser", "WS_RAP_POSER", "handle_rap_poser"),
                                     ("loggia/rappels/annuler", "WS_RAP_ANNULER", "handle_rap_annuler")):
        assert commande in ws, commande
        ligne = declaration(ws, "Commande(%s, %s," % (constante, nom))
        # Le geste d'un conseil : ouvert a tout compte connecte...
        assert "acces=" not in ligne and 'module="rappels"' in ligne, nom
    # ... mais chacun les SIENS : le compte vient de la session, jamais du message.
    corps = ws.split("async def handle_rap_etat")[1].split("# ── La table")[0]
    assert corps.count("connection.user.id") == 3
    assert 'msg.get("par")' not in corps and 'msg["par"]' not in corps
