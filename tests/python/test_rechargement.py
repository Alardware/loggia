"""Une configuration ecrite par l'ecran est reprise tout de suite (03/10).

Un import remplace la configuration des modules par la configuration
generale. Le fichier changeait, pas le module : la nuit eteignait la maison
selon l'ancienne heure jusqu'au redemarrage suivant. Ici, le vrai magasin
emet son signal, et le vrai module Nuit se recharge.
"""
from __future__ import annotations

import asyncio
import sys

import pytest

from conftest import FauxStore, charger
from test_nuit import FauxHass


def lancer(coro):
    return asyncio.run(coro)


@pytest.fixture
def rechargement():
    return charger("rechargement")


@pytest.fixture
def signal(monkeypatch):
    """Un repartiteur qui delivre vraiment : `connect` retient l'ecouteur,
    `send` l'appelle, comme celui de Home Assistant."""
    disp = sys.modules["homeassistant.helpers.dispatcher"]
    ecouteurs = []

    def connecter(_hass, _signal, rappel):
        ecouteurs.append(rappel)
        return lambda: ecouteurs.remove(rappel)

    monkeypatch.setattr(disp, "async_dispatcher_connect", connecter)
    monkeypatch.setattr(disp, "async_dispatcher_send", lambda _h, _s, info: [r(info) for r in list(ecouteurs)])
    return ecouteurs


def test_seuls_les_modules_touches_se_rechargent(rechargement):
    assert rechargement.modules_a_recharger(["loggia_rooms", "loggia_nuit", "loggia_volets", "loggia_nuit"]) == ["nuit", "volets"]
    assert rechargement.modules_a_recharger(["loggia_rooms", "loggia-theme"]) == []
    assert rechargement.modules_a_recharger(None) == []


def test_chaque_cle_nommee_est_bien_celle_de_son_module(rechargement):
    """La table ne vaut que si elle dit vrai : la cle d'un module, c'est sa
    constante `CLE`. Un renommage d'un cote seul couperait le rechargement."""
    for cle, nom in rechargement.CLES_DES_MODULES.items():
        assert charger(nom).CLE == cle, nom


def _nuit_sur(magasin, hass, regles_module):
    module = charger("nuit")
    n = module.LoggiaNuit.__new__(module.LoggiaNuit)
    n.hass = hass
    n.store = magasin
    n.cfg = lancer(n.async_config())
    n._minuteurs, n._minuteurs_pieces, n.allumees = {}, {}, {}
    n._defait, n._defait_heure = [], []
    n.regles = regles_module.Regles(hass, magasin)
    n.regles._depot = FauxStore(None)
    return n


def _executer(hass):
    """Les taches posees par le signal, puis celles qu'elles posent."""
    for _ in range(5):
        taches, hass.taches = hass.taches, []
        if not taches:
            return
        for coro in taches:
            lancer(coro)


def test_un_import_recharge_la_nuit(signal, rechargement, store_module):
    regles_module = charger("regles")
    hass = FauxHass({})
    magasin = store_module.LoggiaStore.__new__(store_module.LoggiaStore)
    magasin._store = FauxStore({"users": {}, "migrated": True,
                                "shared": {"loggia_nuit": {"coucher": {"actif": True, "heure": "23:30"}}}})
    magasin._ancien = FauxStore(None)
    magasin._data = None
    magasin._lock = asyncio.Lock()
    magasin.hass = hass
    nuit = _nuit_sur(magasin, hass, regles_module)
    assert nuit.cfg["coucher"]["heure"] == "23:30"

    ecoute = rechargement.LoggiaRechargement(hass, {"nuit": nuit})
    # Ce que l'ecran envoie pour importer : purge et contenu en un seul lot.
    lancer(magasin.async_set_user("u1", {"loggia_nuit": {"coucher": {"actif": True, "heure": "22:00"}}}, is_admin=True))
    _executer(hass)
    assert nuit.cfg["coucher"]["heure"] == "22:00", "le module garde l'heure d'avant l'import"

    # Une remise a zero efface la cle : le module revient a ses defauts.
    lancer(magasin.async_set_user("u1", {"loggia_nuit": None}, is_admin=True))
    _executer(hass)
    assert nuit.cfg["coucher"]["heure"] == "23:30" and nuit.cfg["coucher"]["actif"] is False

    # Arrete, il n'ecoute plus.
    ecoute.async_arreter()
    assert signal == []
    hass.abandonner()


def test_une_ecriture_qui_ne_touche_aucun_module_ne_recharge_rien(signal, rechargement):
    appels = []

    class Module:
        async def async_enregistrer(self, patch):
            appels.append(patch)

    hass = FauxHass({})
    rechargement.LoggiaRechargement(hass, {"nuit": Module(), "volets": Module()})
    for rappel in list(signal):
        rappel({"user_id": "u1", "perso": ["loggia-navoffset"], "communes": ["loggia_rooms"]})
    assert hass.taches == []
    for rappel in list(signal):
        rappel({"user_id": "u1", "perso": [], "communes": ["loggia_volets"]})
    _executer(hass)
    assert appels == [{}], "le module touche doit se recharger une fois, a vide"


def test_un_module_qui_echoue_n_empeche_pas_les_autres(signal, rechargement):
    recharges = []

    class Casse:
        async def async_enregistrer(self, patch):
            raise ValueError("configuration illisible")

    class Sain:
        async def async_enregistrer(self, patch):
            recharges.append("volets")

    hass = FauxHass({})
    rechargement.LoggiaRechargement(hass, {"nuit": Casse(), "volets": Sain()})
    for rappel in list(signal):
        rappel({"communes": ["loggia_nuit", "loggia_volets"]})
    _executer(hass)
    assert recharges == ["volets"]
