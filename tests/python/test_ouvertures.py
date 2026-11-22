"""Tests du rappel des ouvertures (ADR 0388) : « Me prevenir si elle reste ouverte », « Prevenir des l'ouverture la nuit ».

Ce qui compte : rien ne part sans reglage ; au bout du delai, UNE notification, puis un rappel toutes les 15 minutes,
quatre au plus ; une fermeture fait taire ; un retour depuis un etat muet n'est pas une ouverture ; la nuit (22:00 -
07:00) ou maison vide, une notification des l'ouverture ; au demarrage, une ouverture deja ouverte recompte son delai
sans alerte de nuit ; le genre du message suit la classe.
"""
from __future__ import annotations

import asyncio
import datetime as dt
import sys
from types import SimpleNamespace

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
        return [h for h in self.table if h.startswith(domaine + ".")]


class FauxHass:
    def __init__(self, etats):
        self.states = FauxEtats({k: FauxEtat(*v) for k, v in etats.items()})
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
        self._n = 0

    def __call__(self, hass, delai, rappel):
        self._n += 1
        cle = self._n
        self.poses[cle] = (delai, rappel)

        def annuler():
            self.poses.pop(cle, None)
        return annuler

    def dernier(self):
        return self.poses[max(self.poses)] if self.poses else None


class FauxRegles:
    def __init__(self):
        self.envois = []

    async def prevenir(self, module, regle, message, **k):
        self.envois.append((module, regle, message, k.get("pour"), k.get("critique", False)))
        return True


PORTE = "binary_sensor.porte_entree"
OUVRANT = "binary_sensor.trappe"


@pytest.fixture
def module():
    return charger("ouvertures")


@pytest.fixture
def rdv(monkeypatch):
    r = Rendezvous()
    monkeypatch.setattr(sys.modules["homeassistant.helpers.event"], "async_call_later", r, raising=False)
    return r


@pytest.fixture
def heure(monkeypatch):
    """Fixe l'heure de la maison : `heure(23, 10)`."""
    def poser(h, m=0):
        monkeypatch.setattr(sys.modules["homeassistant.util.dt"], "now", lambda: dt.datetime(2026, 11, 22, h, m))
    poser(14, 0)
    return poser


@pytest.fixture
def creer(module, store_module, rdv):
    faits = []

    def fabrique(etats=None, table=None, presence=None):
        magasin = store_module.LoggiaStore.__new__(store_module.LoggiaStore)
        partage = {"loggia_ouvertures": table or {}}
        if presence is not None:
            partage["loggia_presence"] = presence
        magasin._store = FauxStore({"users": {}, "shared": partage, "migrated": True})
        magasin._ancien = FauxStore(None)
        magasin._data = None
        magasin._lock = asyncio.Lock()
        m = module.LoggiaOuvertures.__new__(module.LoggiaOuvertures)
        m.hass = FauxHass(etats or {})
        m.store = magasin
        m.regles = FauxRegles()
        m.cfg = module.config_de(table or {})
        m._minuteurs, m._depuis, m._rappels, m._delais, m._defait = {}, {}, {}, {}, []
        m._au_demarrage = None
        faits.append(m)
        return m

    yield fabrique
    for m in faits:
        m.hass.abandonner()


def executer(m):
    while m.hass.taches:
        taches, m.hass.taches = m.hass.taches, []
        for coro in taches:
            lancer(coro)


def evenement(haid, avant, apres):
    return SimpleNamespace(data={"entity_id": haid, "old_state": FauxEtat(avant) if avant else None, "new_state": FauxEtat(apres) if apres else None})


def ouvrir(m, haid=PORTE, avant="off", classe="door", nom="Porte d'entrée"):
    m.hass.states.table[haid] = FauxEtat("on", {"device_class": classe, "friendly_name": nom})
    m._sur_ouverture(evenement(haid, avant, "on"))


def echoir(m, rdv):
    """Fait passer la minuterie posee en dernier, comme si son heure etait venue."""
    _delai, rappel = rdv.dernier()
    rdv.poses.pop(max(rdv.poses))
    rappel(None)
    executer(m)


# ── La table ───────────────────────────────────────────────────────────────

def test_la_table_ne_garde_que_des_binaires_qui_demandent_quelque_chose(module):
    cfg = module.config_de({
        PORTE: {"delai": 10, "nuit": True},
        "binary_sensor.rien": {"delai": 0, "nuit": False},
        "binary_sensor.delai_inconnu": {"delai": 7},
        "binary_sensor.nuit_texte": {"nuit": "oui"},
        "switch.pas_un_binaire": {"delai": 5},
        "binary_sensor.casse": "n'importe quoi",
    })
    assert cfg == {PORTE: {"delai": 10, "nuit": True}}
    assert module.config_de(None) == {} and module.config_de([PORTE]) == {}


def test_la_nuit_va_de_22_h_a_7_h(module):
    assert module.de_nuit(22 * 60) and module.de_nuit(0) and module.de_nuit(6 * 60 + 59)
    assert not module.de_nuit(7 * 60) and not module.de_nuit(21 * 60 + 59) and not module.de_nuit(14 * 60)


# ── Le delai, puis les rappels ─────────────────────────────────────────────

def test_rien_ne_part_sans_reglage(creer, rdv):
    m = creer(table={})
    ouvrir(m)
    executer(m)
    assert rdv.poses == {} and m.regles.envois == []


def test_au_bout_du_delai_une_notification_puis_quatre_rappels_au_plus(creer, rdv, module, monkeypatch):
    horloge = [1_000_000.0]
    monkeypatch.setattr(module.time, "time", lambda: horloge[0])
    m = creer(table={PORTE: {"delai": 10}})
    ouvrir(m)
    executer(m)
    assert rdv.dernier()[0] == 600
    for k in range(8):
        if not rdv.poses:
            break
        horloge[0] += rdv.dernier()[0]
        echoir(m, rdv)
        if k < 5:
            assert len(m.regles.envois) == k + 1
    envois = m.regles.envois
    assert len(envois) == 1 + module.RAPPELS_MAX
    module_, regle, (gabarit, args), pour, critique = envois[0]
    assert (module_, regle, gabarit, pour, critique) == ("ouvertures", "restee", module.MSG_RESTEE_OUVERTE, "presents", False)
    assert args == {"nom": "Porte d'entrée", "n": 10}
    assert envois[1][2][1]["n"] == 25 and envois[-1][2][1]["n"] == 70
    assert rdv.poses == {}, "plus de rappel apres le quatrieme"


def test_une_fermeture_fait_taire(creer, rdv):
    m = creer(table={PORTE: {"delai": 5}})
    ouvrir(m)
    assert len(rdv.poses) == 1
    m.hass.states.table[PORTE] = FauxEtat("off", {"device_class": "door"})
    m._sur_ouverture(evenement(PORTE, "on", "off"))
    assert rdv.poses == {} and m._depuis == {}
    executer(m)
    assert m.regles.envois == []


def test_une_minuterie_qui_echoit_sur_une_porte_fermee_ne_dit_rien(creer, rdv):
    m = creer(table={PORTE: {"delai": 5}})
    ouvrir(m)
    m.hass.states.table[PORTE] = FauxEtat("off", {"device_class": "door"})
    echoir(m, rdv)
    assert m.regles.envois == [] and rdv.poses == {}


def test_un_ouvrant_sans_nom_est_ouvert_au_masculin(creer, rdv, module):
    m = creer(table={OUVRANT: {"delai": 5}})
    ouvrir(m, OUVRANT, classe="opening", nom="Trappe")
    echoir(m, rdv)
    assert m.regles.envois[0][2][0] == module.MSG_RESTE_OUVERT


def test_une_ouverture_deja_comptee_ne_recompte_pas(creer, rdv):
    m = creer(table={PORTE: {"delai": 10}})
    ouvrir(m)
    m._sur_ouverture(evenement(PORTE, "on", "on"))
    ouvrir(m, avant="unavailable")
    assert len(rdv.poses) == 1


# ── La nuit et la maison vide ───────────────────────────────────────────────

def test_la_nuit_une_notification_des_l_ouverture(creer, heure, module):
    heure(23, 10)
    m = creer(table={PORTE: {"nuit": True}})
    ouvrir(m)
    executer(m)
    assert [(e[1], e[2][0], e[2][1]) for e in m.regles.envois] == [("nuit", module.MSG_VIENT_DE_S_OUVRIR, {"nom": "Porte d'entrée"})]


def test_le_jour_quelqu_un_a_la_maison_rien_ne_part(creer, heure):
    heure(14, 0)
    m = creer(etats={"person.camille": ("home",)}, table={PORTE: {"nuit": True}})
    ouvrir(m)
    executer(m)
    assert m.regles.envois == []


def test_le_jour_maison_vide_une_notification(creer, heure, module):
    heure(14, 0)
    m = creer(etats={"person.camille": ("not_home",), "person.alex": ("Travail",)}, table={PORTE: {"nuit": True}},
              presence={"personnes": ["person.camille", "person.alex"]})
    ouvrir(m)
    executer(m)
    assert [e[2][0] for e in m.regles.envois] == [module.MSG_VIENT_DE_S_OUVRIR]


def test_sans_personne_suivie_la_maison_n_est_pas_vide(creer, heure):
    heure(14, 0)
    m = creer(table={PORTE: {"nuit": True}})
    ouvrir(m)
    executer(m)
    assert m.regles.envois == []


def test_un_retour_depuis_un_etat_muet_n_est_pas_une_ouverture(creer, heure, rdv):
    heure(23, 30)
    m = creer(table={PORTE: {"nuit": True, "delai": 10}})
    ouvrir(m, avant="unavailable")
    executer(m)
    assert m.regles.envois == [], "pas d'alerte de nuit"
    assert len(rdv.poses) == 1, "le delai compte quand meme"


# ── Le demarrage et le rechargement ─────────────────────────────────────────

def test_au_demarrage_une_ouverture_deja_ouverte_recompte_son_delai_sans_alerte_de_nuit(creer, heure, rdv):
    heure(23, 0)
    m = creer(etats={PORTE: ("on", {"device_class": "door"}), "binary_sensor.fermee": ("off", {"device_class": "door"})},
              table={PORTE: {"delai": 30, "nuit": True}, "binary_sensor.fermee": {"delai": 5}})
    lancer(m._async_rattraper())
    executer(m)
    assert [d for d, _ in rdv.poses.values()] == [1800]
    assert m.regles.envois == []


def test_un_reglage_retire_fait_taire_la_minuterie(creer, rdv):
    m = creer(etats={PORTE: ("on", {"device_class": "door"})}, table={PORTE: {"delai": 10}})
    ouvrir(m)
    assert len(rdv.poses) == 1

    async def vider():
        await m.store.async_modifier_shared("loggia_ouvertures", lambda _b: {})
        return await m.async_enregistrer({})

    assert lancer(vider()) == {}
    assert rdv.poses == {} and m._depuis == {}


def test_une_relecture_du_reglage_ne_relance_pas_la_serie_epuisee(creer, rdv, module, monkeypatch):
    """Relecture du 22/11 : rappels epuises, porte toujours ouverte ; un reglage touche ailleurs ne repart pas de zero."""
    horloge = [1_000_000.0]
    monkeypatch.setattr(module.time, "time", lambda: horloge[0])
    m = creer(etats={PORTE: ("on", {"device_class": "door"})}, table={PORTE: {"delai": 5}})
    ouvrir(m)
    while rdv.poses:
        horloge[0] += rdv.dernier()[0]
        echoir(m, rdv)
    assert len(m.regles.envois) == 1 + module.RAPPELS_MAX
    lancer(m.async_enregistrer({OUVRANT: {"delai": 10}}))
    assert rdv.poses == {}, "aucune nouvelle serie pour la porte deja comptee"


def test_un_delai_change_avant_le_premier_envoi_reprend_le_compte(creer, rdv, module, monkeypatch):
    """Relecture du 22/11 : armee a 30 min, ouverte depuis 8 min, l'utilisateur choisit 10 min — il reste 2 min."""
    horloge = [1_000_000.0]
    monkeypatch.setattr(module.time, "time", lambda: horloge[0])
    m = creer(etats={PORTE: ("on", {"device_class": "door"})}, table={PORTE: {"delai": 30}})
    ouvrir(m)
    assert rdv.dernier()[0] == 1800
    horloge[0] += 8 * 60

    async def changer():
        await m.store.async_modifier_shared("loggia_ouvertures", lambda _b: {PORTE: {"delai": 10}})
        return await m.async_enregistrer({})

    lancer(changer())
    assert [d for d, _ in rdv.poses.values()] == [120]
    horloge[0] += 120
    echoir(m, rdv)
    assert m.regles.envois[0][2][1]["n"] == 10


def test_fermee_pendant_l_envoi_rien_n_est_reprogramme(creer, rdv, module):
    m = creer(table={PORTE: {"delai": 5}})
    ouvrir(m)

    async def fermer_pendant(module_, regle, message, **k):
        m.regles.envois.append((module_, regle, message, k.get("pour"), False))
        m._sur_ouverture(evenement(PORTE, "on", "off"))
        return True

    m.regles.prevenir = fermer_pendant
    echoir(m, rdv)
    assert len(m.regles.envois) == 1
    assert rdv.poses == {} and m._depuis == {} and m._minuteurs == {}


def test_un_patch_se_pose_dans_la_table(creer):
    m = creer(table={PORTE: {"delai": 10}})
    cfg = lancer(m.async_enregistrer({OUVRANT: {"delai": 5, "nuit": True}}))
    assert cfg == {PORTE: {"delai": 10, "nuit": False}, OUVRANT: {"delai": 5, "nuit": True}}


def test_l_arret_retire_tout(creer, rdv):
    m = creer(table={PORTE: {"delai": 10}})
    ouvrir(m)
    m.async_arreter()
    assert rdv.poses == {} and m._minuteurs == {}


def test_le_rechargement_suit_la_cle():
    rechargement = charger("rechargement")
    assert rechargement.CLES_DES_MODULES["loggia_ouvertures"] == "ouvertures"
    assert rechargement.modules_a_recharger(["loggia_ouvertures"]) == ["ouvertures"]
