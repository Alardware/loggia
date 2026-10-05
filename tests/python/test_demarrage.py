"""Le composant demarre, s'arrete et redemarre (audit du 03/10).

`__init__.py` n'avait jamais ete execute par un test : 0 ligne sur 164. Ce
qui s'y casse — un nom mal ecrit, un module qui ne sait pas se taire, un
enregistrement fait deux fois au rechargement — ne se voyait qu'au demarrage
de Home Assistant, chez quelqu'un. Ici on le fait tourner pour de vrai : les
quatorze modules naissent, le service et le panneau s'enregistrent, le
dechargement les arrete tous, et un rechargement les rebatit sans rien
reenregistrer de ce qui vit jusqu'a l'arret du process.
"""
from __future__ import annotations

import asyncio
import os
import json
import logging
import re
import sys
import types

import pytest

# En CI, ces tests ne se sautent JAMAIS : sans `voluptuous`, ils passeraient
# en silence. Ailleurs, une machine sans lui les saute.
if os.environ.get("CI"):
    import voluptuous as vol
else:
    vol = pytest.importorskip("voluptuous")

from conftest import COMPOSANT, FauxStore, charger  # noqa: E402
from doublures_ha import poser_demarrage, poser_websocket_api  # noqa: E402

poser_websocket_api(vol)
poser_demarrage()


def lancer(coro):
    return asyncio.run(coro)


class FauxServices:
    def __init__(self):
        self.inscrits = {}

    def async_register(self, domaine, nom, gestionnaire, schema=None, **kwargs):
        assert (domaine, nom) not in self.inscrits, "service enregistre deux fois : " + nom
        self.inscrits[(domaine, nom)] = (gestionnaire, schema)

    def has_service(self, domaine, nom):
        return (domaine, nom) in self.inscrits


class FauxHass:
    def __init__(self, comptes=None):
        self.data = {}
        self.commandes = {}
        self.taches = []
        self.services = FauxServices()
        self.bus = types.SimpleNamespace(async_listen=lambda *a, **k: (lambda: None),
                                         async_listen_once=lambda *a, **k: (lambda: None),
                                         async_fire=lambda *a, **k: None)
        self.states = types.SimpleNamespace(get=lambda e: None, async_entity_ids=lambda d=None: [],
                                            async_all=lambda d=None: [])
        self.config = types.SimpleNamespace(components=set(), path=lambda *p: "/config",
                                            units=types.SimpleNamespace(temperature_unit="°C"),
                                            time_zone="Europe/Paris", latitude=48.85, longitude=2.35)
        self.chemins_statiques = []
        comptes = comptes or {}

        async def enregistrer_chemins(chemins):
            self.chemins_statiques.extend(chemins)

        async def lire_compte(uid):
            return comptes.get(uid)

        self.http = types.SimpleNamespace(async_register_static_paths=enregistrer_chemins)
        self.auth = types.SimpleNamespace(async_get_user=lire_compte)

    def async_create_task(self, coro, *args, **kwargs):
        self.taches.append(coro)
        return coro

    async def async_add_executor_job(self, fonction, *args):
        return fonction(*args)

    def executer(self):
        """Les taches posees au demarrage — `_async_demarrer` de chaque module —
        puis celles qu'elles posent a leur tour : le demarrage ENTIER."""
        for _ in range(5):
            taches, self.taches = self.taches, []
            if not taches:
                return
            for coro in taches:
                if asyncio.iscoroutine(coro):
                    asyncio.run(coro)


@pytest.fixture
def composant(monkeypatch, store_module):
    """`__init__.py` charge sous le paquet de test, et un .storage en memoire."""
    maison = {"users": {}, "migrated": True, "shared": {}}
    monkeypatch.setattr(store_module, "Store",
                        lambda hass, version, cle: FauxStore(maison if cle == store_module.STORAGE_KEY else None))
    monkeypatch.setattr(sys.modules["homeassistant.helpers.storage"], "Store",
                        lambda hass, version, cle: FauxStore(None))
    return charger("__init__")


def test_le_demarrage_cree_les_quatorze_modules_le_service_et_le_panneau(composant, caplog):
    hass = FauxHass()
    caplog.set_level(logging.WARNING)
    assert lancer(composant.async_setup_entry(hass, object())) is True
    hass.executer()
    # Chaque module se met en place a l'abri d'un `try` qui JOURNALISE : sans
    # cette ligne, un module casse au demarrage passerait le test en silence.
    erreurs = [r.getMessage() for r in caplog.records if r.levelno >= logging.ERROR]
    assert erreurs == [], erreurs
    data = hass.data[composant.DOMAIN]
    manquants = [nom for nom in composant.MODULES_VIVANTS if data.get(nom) is None]
    assert manquants == [], "modules absents apres le demarrage : %s" % manquants
    # 34 depuis le 05/10 (ADR 0155) : `loggia/distributeurs/etat` et
    # `loggia/distributeurs/config` s'ajoutent aux 32.
    assert data.get("ws") is True and len(hass.commandes) == 34
    assert hass.services.has_service(composant.DOMAIN, "scenario")
    assert "loggia" in hass.data.get("frontend_panels", {}), "le panneau n'est pas dans le menu"
    hass.executer()


def test_le_dechargement_arrete_chaque_module_et_retire_le_panneau(composant, monkeypatch):
    hass = FauxHass()
    lancer(composant.async_setup_entry(hass, object()))
    data = hass.data[composant.DOMAIN]
    arretes = []

    def espion(nom, arreter):
        def arreter_et_noter():
            arretes.append(nom)
            return arreter()
        return arreter_et_noter

    for nom in composant.MODULES_VIVANTS:
        module = data[nom]
        arreter = getattr(module, "async_arreter", None) or getattr(module, "arreter")
        monkeypatch.setattr(module, arreter.__name__, espion(nom, arreter))
    assert lancer(composant.async_unload_entry(hass, object())) is True
    assert sorted(arretes) == sorted(composant.MODULES_VIVANTS), \
        "modules jamais arretes : %s" % (set(composant.MODULES_VIVANTS) - set(arretes))
    assert all(nom not in data for nom in composant.MODULES_VIVANTS), "un module arrete est reste dans hass.data"
    assert "loggia" not in hass.data.get("frontend_panels", {})
    # Ce qui vit jusqu'a l'arret du process reste : le magasin, ses commandes.
    assert data.get("store") is not None and data.get("ws") is True
    hass.executer()


def test_un_rechargement_rebatit_les_modules_sans_rien_reenregistrer(composant, caplog):
    hass = FauxHass()
    caplog.set_level(logging.WARNING)
    lancer(composant.async_setup_entry(hass, object()))
    avant = dict(hass.data[composant.DOMAIN])
    lancer(composant.async_unload_entry(hass, object()))
    # `FauxServices.async_register` refuse un deuxieme enregistrement : ce
    # rechargement echouerait s'il reinscrivait le service.
    lancer(composant.async_setup_entry(hass, object()))
    data = hass.data[composant.DOMAIN]
    for nom in composant.MODULES_VIVANTS:
        assert data.get(nom) is not None, nom + " n'a pas ete rebati"
        assert data[nom] is not avant[nom], nom + " est l'ancienne instance"
    assert len(hass.commandes) == 34
    assert "loggia" in hass.data.get("frontend_panels", {})
    hass.executer()
    erreurs = [r.getMessage() for r in caplog.records if r.levelno >= logging.ERROR]
    assert erreurs == [], erreurs


# ── Le service loggia.scenario dit ses refus ────────────────────────────────

def _gestionnaire(hass, composant):
    return hass.services.inscrits[(composant.DOMAIN, "scenario")][0]


def test_un_scenario_inconnu_fait_echouer_l_automatisation(composant):
    hass = FauxHass()
    lancer(composant.async_setup_entry(hass, object()))
    appel = types.SimpleNamespace(data={"id": "faute_de_frappe"}, context=types.SimpleNamespace(user_id=None))
    with pytest.raises(sys.modules["homeassistant.exceptions"].ServiceValidationError) as refus:
        lancer(_gestionnaire(hass, composant)(appel))
    assert refus.value.translation_key == "scenario_inconnu"
    assert refus.value.translation_placeholders == {"id": "faute_de_frappe"}
    hass.executer()


def test_un_compte_illisible_fait_echouer_au_lieu_d_elargir(composant):
    hass = FauxHass(comptes={})
    lancer(composant.async_setup_entry(hass, object()))
    appel = types.SimpleNamespace(data={"id": "nuit"}, context=types.SimpleNamespace(user_id="u-fantome"))
    with pytest.raises(sys.modules["homeassistant.exceptions"].ServiceValidationError) as refus:
        lancer(_gestionnaire(hass, composant)(appel))
    assert refus.value.translation_key == "compte_illisible"
    hass.executer()


def test_chaque_refus_du_service_est_traduit_dans_les_sept_langues():
    source = (COMPOSANT / "__init__.py").read_text(encoding="utf-8")
    cles = set(re.findall(r'_refus\("([a-z_]+)"', source))
    assert cles == {"scenario_inconnu", "scenarios_indisponibles", "compte_illisible"}, cles
    fichiers = sorted((COMPOSANT / "translations").glob("*.json"))
    assert len(fichiers) == 7
    for fichier in fichiers:
        exceptions = json.loads(fichier.read_text(encoding="utf-8")).get("exceptions", {})
        for cle in cles:
            assert exceptions.get(cle, {}).get("message"), "%s : message absent pour %s" % (fichier.name, cle)
        assert "{id}" in exceptions["scenario_inconnu"]["message"], fichier.name + " perd le nom du scenario"
