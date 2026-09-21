"""Tests des minuteurs d'extinction : « eteindre dans 30 min », tenus par le serveur.

Retour du 21/09 : « pourquoi Loggia doit rester ouvert, c'est absurde, et je
n'ai pas le decompte ». Ce qui compte : le minuteur survit a la fermeture de
l'ecran et au redemarrage de Home Assistant, il n'eteint pas ce qu'on a rallume
entre-temps, et personne ne l'utilise pour piloter ce qu'il n'a pas le droit de
piloter.
"""
from __future__ import annotations

import asyncio
import sys

import pytest

from conftest import COMPOSANT, FauxStore, charger


def lancer(coro):
    return asyncio.run(coro)


class FauxEtat:
    def __init__(self, state):
        self.state = state
        self.attributes = {}


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
        self.states = FauxEtats({k: FauxEtat(v) for k, v in etats.items()})
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
    return charger("minuteurs")


@pytest.fixture
def evenements(monkeypatch):
    ev = sys.modules["homeassistant.helpers.event"]
    rdv = Rendezvous()
    ecoutes = []

    def ecouter(hass, ids, rappel):
        ecoutes.append((list(ids), rappel))
        return lambda: None

    monkeypatch.setattr(ev, "async_call_later", rdv, raising=False)
    monkeypatch.setattr(ev, "async_track_state_change_event", ecouter, raising=False)
    return rdv, ecoutes


@pytest.fixture
def creer(module, store_module, evenements):
    faits = []
    regles_module = charger("regles")

    def fabrique(etats=None, depart=None):
        magasin = store_module.LoggiaStore.__new__(store_module.LoggiaStore)
        magasin._store = FauxStore({"users": {}, "shared": {"loggia_minuteurs": depart or {}}, "migrated": True})
        magasin._ancien = FauxStore(None)
        magasin._data = None
        magasin._lock = asyncio.Lock()
        m = module.LoggiaMinuteurs.__new__(module.LoggiaMinuteurs)
        m.hass = FauxHass(etats or {})
        m.store = magasin
        m.regles = regles_module.Regles(m.hass, magasin)
        m.regles._depot = FauxStore(None)
        m.table = {}
        m._rdv = {}
        m._ecoute = None
        faits.append(m)
        return m

    yield fabrique
    for m in faits:
        m.hass.abandonner()


def journal(m):
    return [(e["quoi"], e["motif"], e["cibles"]) for e in lancer(m.regles.journal(module="minuteurs"))]


# ── Ce qui se calcule ───────────────────────────────────────────────────────

def test_seules_les_entites_qu_on_sait_eteindre_se_minutent(module):
    for bon in ("light.salon", "switch.prise_cafe", "fan.plafond", "input_boolean.x", "media_player.tv"):
        assert module.valide(bon), bon
    for mauvais in ("lock.porte", "alarm_control_panel.maison", "cover.volet", "light.", "light.Salon",
                    "script.tout_eteindre", None, 42, "light.salon; rm -rf"):
        assert not module.valide(mauvais), mauvais


def test_un_appui_ajoute_au_temps_qui_reste(module):
    t = module.prolonger({}, "light.a", 30, 1000.0, par="u1")
    assert t["light.a"] == {"fin": 1000.0 + 1800, "duree": 30, "par": "u1"}
    # Dix minutes plus tard, +30 : il restait 20 min, il en reste 50.
    t2 = module.prolonger(t, "light.a", 30, 1600.0, par="u2")
    assert t2["light.a"]["fin"] == 1000.0 + 3600
    assert t2["light.a"]["duree"] == 60
    assert t["light.a"]["fin"] == 2800.0, "la table d'origine n'a pas bouge"
    # Un minuteur ECHU ne se prolonge pas : on repart de maintenant.
    t3 = module.prolonger(t, "light.a", 30, 9000.0)
    assert t3["light.a"] == {"fin": 9000.0 + 1800, "duree": 30, "par": None}


def test_les_limites_sont_tenues(module):
    for minutes in (0, -5, 24 * 60 + 1, "trente", None, 2.5, True):
        with pytest.raises(ValueError):
            module.prolonger({}, "light.a", minutes, 0.0)
    with pytest.raises(ValueError):
        module.prolonger({}, "lock.porte", 30, 0.0)
    # Jamais plus de 24 h devant soi, quel que soit le nombre d'appuis.
    t = {}
    for _ in range(60):
        t = module.prolonger(t, "light.a", 60, 0.0)
    assert t["light.a"]["fin"] == 24 * 3600
    # Cinquante minuteurs en cours au plus ; un echu ne compte pas.
    plein = {"light.l%d" % i: {"fin": 500.0, "duree": 1, "par": None} for i in range(module.MAX_MINUTEURS)}
    with pytest.raises(ValueError):
        module.prolonger(plein, "light.de_trop", 30, 0.0)
    assert "light.de_trop" in module.prolonger(plein, "light.de_trop", 30, 600.0), "les echus liberent leur place"
    # Prolonger un minuteur deja en cours reste possible, meme plein.
    assert module.prolonger(plein, "light.l0", 30, 0.0)["light.l0"]["fin"] == 500.0 + 1800


def test_la_table_relue_ecarte_l_illisible_et_garde_l_echu(module):
    brut = {
        "light.a": {"fin": 1000, "duree": 30, "par": "u1"},
        "light.b": {"fin": "pas un nombre"},
        "lock.porte": {"fin": 1000},
        "light.c": "n'importe quoi",
        "light.d": {"fin": 0},
        "light.e": {"fin": 5.5, "duree": None, "par": 12},
    }
    t = module.normaliser(brut)
    assert set(t) == {"light.a", "light.e"}
    assert t["light.e"] == {"fin": 5.5, "duree": 0, "par": None}
    assert module.normaliser(None) == {} and module.normaliser([1, 2]) == {}
    assert module.echus(t, 100.0) == ["light.e"]


def test_l_ecran_ne_voit_que_l_en_cours_sans_savoir_qui(module):
    t = {"light.a": {"fin": 2000.0, "duree": 30, "par": "u1"},
         "light.b": {"fin": 100.0, "duree": 5, "par": "u2"},
         "switch.c": {"fin": 3000.0, "duree": 60, "par": None}}
    v = module.vue(t, 1000.0)
    assert v == {"minuteurs": {"light.a": {"fin": 2000.0, "duree": 30}, "switch.c": {"fin": 3000.0, "duree": 60}},
                 "maintenant": 1000.0}
    # Un compte restreint : seulement ce qu'il pilote.
    assert list(module.vue(t, 1000.0, lambda h: h == "switch.c")["minuteurs"]) == ["switch.c"]
    assert module.reste(t, "light.a", 1500.0) == 500.0
    assert module.reste(t, "light.b", 1500.0) is None and module.reste(t, "light.z", 0.0) is None


# ── Le module ───────────────────────────────────────────────────────────────

def test_poser_sauve_arme_et_ecoute(creer, evenements):
    rdv, ecoutes = evenements
    m = creer({"light.a": "on"})
    etat = lancer(m.async_poser("light.a", 30, par="u1"))
    assert list(etat["minuteurs"]) == ["light.a"]
    assert "par" not in etat["minuteurs"]["light.a"]
    # Sauve dans le magasin : un redemarrage le retrouvera.
    assert lancer(m.store.async_get_shared("loggia_minuteurs"))["light.a"]["par"] == "u1"
    (delai, _), = rdv.poses.values()
    assert 1790 < delai <= 1800
    assert ecoutes[-1][0] == ["light.a"]


def test_a_l_heure_la_lampe_s_eteint_de_la_main_de_celui_qui_l_a_voulu(creer, evenements):
    rdv, _ = evenements
    m = creer({"light.a": "on"})
    lancer(m.async_poser("light.a", 30, par="u1"))
    (_, rappel), = rdv.poses.values()
    rappel(None)
    lancer(m.hass.taches.pop())
    assert m.hass.services.appels == [("homeassistant", "turn_off", {"entity_id": ["light.a"]}, "u1")]
    assert m.table == {}
    assert lancer(m.store.async_get_shared("loggia_minuteurs")) == {}
    assert journal(m) == [("eteindre", "minuteur de 30 min", ["light.a"])]


def test_deja_eteinte_rien_a_faire(creer):
    m = creer({"light.a": "on"})
    lancer(m.async_poser("light.a", 30))
    m.hass.states.table["light.a"] = FauxEtat("off")
    lancer(m._async_echoir("light.a"))
    assert m.hass.services.appels == []
    assert journal(m) == []


def test_eteinte_a_la_main_le_minuteur_s_efface(creer, evenements):
    _, ecoutes = evenements
    m = creer({"light.a": "on", "light.b": "on"})
    lancer(m.async_poser("light.a", 30))
    lancer(m.async_poser("light.b", 30))
    _, sur_etat = ecoutes[-1]

    class Ev:
        def __init__(self, haid, etat):
            self.data = {"entity_id": haid, "new_state": FauxEtat(etat)}

    # Une lampe qui decroche du reseau n'a pas ete eteinte.
    sur_etat(Ev("light.a", "unavailable"))
    assert m.hass.taches == []
    sur_etat(Ev("light.a", "off"))
    lancer(m.hass.taches.pop())
    assert set(m.table) == {"light.b"}
    assert m.hass.services.appels == [], "effacer n'eteint rien"


def test_au_demarrage_l_echu_s_execute_et_le_reste_se_rearme(creer, evenements, monkeypatch, module):
    rdv, _ = evenements
    monkeypatch.setattr(module.time, "time", lambda: 10_000.0)
    m = creer({"light.a": "on", "light.b": "on"},
              depart={"light.a": {"fin": 9_000.0, "duree": 30, "par": "u1"},
                      "light.b": {"fin": 12_000.0, "duree": 60, "par": "u2"}})
    lancer(m._async_demarrer())
    assert m.hass.services.appels == [("homeassistant", "turn_off", {"entity_id": ["light.a"]}, "u1")]
    assert journal(m) == [("eteindre", "minuteur de 30 min (echu pendant un redemarrage)", ["light.a"])]
    assert set(m.table) == {"light.b"}
    # Le seul minuteur reste arme sur ce qui lui reste (le journal, lui, pose
    # sa propre ecriture differee : on ne regarde que le rendez-vous du module).
    assert set(m._rdv) == {"light.b"}
    assert 2_000.0 in [d for d, _ in rdv.poses.values()]


def test_personne_ne_minute_ce_qu_il_ne_pilote_pas(creer):
    m = creer({"light.a": "on"})

    def interdit(_haid):
        return False

    with pytest.raises(PermissionError):
        lancer(m.async_poser("light.a", 30, controle=interdit))
    assert m.table == {}
    lancer(m.async_poser("light.a", 30))
    with pytest.raises(PermissionError):
        lancer(m.async_annuler("light.a", controle=interdit))
    assert "light.a" in m.table
    with pytest.raises(ValueError):
        lancer(m.async_poser("light.inconnue", 30))


def test_annuler_efface_et_desarme(creer, evenements):
    rdv, _ = evenements
    m = creer({"light.a": "on"})
    lancer(m.async_poser("light.a", 30))
    etat = lancer(m.async_annuler("light.a"))
    assert etat["minuteurs"] == {}
    assert rdv.poses == {} and rdv.annules >= 1
    assert lancer(m.store.async_get_shared("loggia_minuteurs")) == {}
    # Annuler ce qui n'existe pas n'est pas une erreur.
    assert lancer(m.async_annuler("light.a"))["minuteurs"] == {}


# ── Le cablage ──────────────────────────────────────────────────────────────

def test_le_composant_cree_le_module_et_ouvre_ses_trois_commandes():
    init = (COMPOSANT / "__init__.py").read_text(encoding="utf-8")
    assert 'data["minuteurs"] = LoggiaMinuteurs(hass, data["store"], data.get("regles"))' in init
    assert 'acces_minuteurs=lambda: hass.data.get(DOMAIN, {}).get("minuteurs")' in init
    ws = (COMPOSANT / "websocket_api.py").read_text(encoding="utf-8")
    for commande, nom in (("loggia/minuteurs/etat", "handle_min_etat"),
                          ("loggia/minuteurs/poser", "handle_min_poser"),
                          ("loggia/minuteurs/annuler", "handle_min_annuler")):
        assert commande in ws, commande
        assert "websocket_api.async_register_command(hass, %s)" % nom in ws, nom
        i = ws.index("async def %s" % nom)
        # Le geste d'une fiche de lampe : ouvert a tout compte connecte...
        assert "require_admin" not in ws[i - 300:i], nom + " ne doit pas exiger un administrateur"
    # ... mais sur ce qu'il a le droit de PILOTER, et c'est lui qui le pose.
    assert "par=connection.user.id" in ws
    assert ws.count("controle=controle_de(connection.user)") >= 3
    assert '"unauthorized"' in ws
