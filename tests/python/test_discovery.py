"""Tests de la decouverte cote composant.

Ce module existe parce que les commandes equivalentes de Home Assistant sont
reservees aux administrateurs : sur un compte ordinaire, le dashboard n'avait ni
pieces ni appareils. Les tests verifient donc surtout ce qui SORT — la forme de
l'index, et ce qu'on refuse d'y mettre.
"""
from __future__ import annotations

import sys
import types

import pytest

from conftest import charger


class FauxRegistre:
    """Registre minimal : les vrais exposent bien plus, on n'en lit qu'une part."""

    def __init__(self, zones=(), etages=(), appareils=(), entites=()):
        self._zones, self._etages = list(zones), list(etages)
        self.devices = {d.id: d for d in appareils}
        self.entities = {e.entity_id: e for e in entites}

    def async_list_areas(self):
        return self._zones

    def async_list_floors(self):
        return self._etages


def objet(**champs):
    """Un enregistrement de registre, accessible par attribut."""
    return types.SimpleNamespace(**champs)


def zone(id_, nom, etage=None, icone=None):
    return objet(id=id_, name=nom, floor_id=etage, icon=icone)


def appareil(id_, **reste):
    base = dict(name=None, name_by_user=None, manufacturer=None, model=None,
                sw_version=None, identifiers=set(), area_id=None,
                via_device_id=None, entry_type=None, disabled_by=None)
    base.update(reste)
    return objet(id=id_, **base)


def entite(entity_id, **reste):
    base = dict(name=None, original_name=None, device_id=None, area_id=None,
                platform=None, entity_category=None, device_class=None,
                original_device_class=None, unit_of_measurement=None,
                hidden_by=None, disabled_by=None)
    base.update(reste)
    return objet(entity_id=entity_id, **base)


@pytest.fixture
def decouverte():
    return charger("discovery")


def poser(module, *, zones=(), etages=(), appareils=(), entites=(), services=None):
    """Branche des registres factices sur les doublures `homeassistant.*`."""
    reg = FauxRegistre(zones, etages, appareils, entites)
    for nom in ("area_registry", "device_registry", "entity_registry", "floor_registry"):
        sys.modules[f"homeassistant.helpers.{nom}"].async_get = lambda _h, r=reg: r
    module.ar = sys.modules["homeassistant.helpers.area_registry"]
    module.dr = sys.modules["homeassistant.helpers.device_registry"]
    module.er = sys.modules["homeassistant.helpers.entity_registry"]
    return types.SimpleNamespace(
        services=types.SimpleNamespace(async_services=lambda: services or {}))


# ── Forme de l'index ────────────────────────────────────────────────────────

def test_index_complet(decouverte):
    hass = poser(
        decouverte,
        zones=[zone("salon", "Salon", "rdc")],
        appareils=[appareil("d1", name="Lampe", manufacturer="Exemple", model="X1",
                            identifiers={("demo", "abc")}, area_id="salon")],
        entites=[entite("light.exemple", device_id="d1", platform="demo")],
        services={"light": {"turn_on": objet(schema=None)}},
    )
    index = decouverte.async_index(hass)
    assert index["version"] == decouverte.INDEX_VERSION
    assert index["areas"] == [
        {"id": "salon", "name": "Salon", "floor": "rdc", "icon": None}]
    assert index["devices"][0]["manufacturer"] == "Exemple"
    # L'integration se lit dans `identifiers`, pas ailleurs : c'est elle qui
    # permettra plus tard de choisir un profil de connaissances.
    assert index["devices"][0]["integration"] == "demo"
    assert index["entities"][0]["id"] == "light.exemple"
    assert index["services"]["light"]["turn_on"] == {"fields": []}


def test_le_nom_donne_par_l_utilisateur_prime(decouverte):
    """Renommer un appareil dans Home Assistant doit se voir dans le dashboard."""
    hass = poser(decouverte, appareils=[appareil("d1", name="Robot X2", name_by_user="Le robot")])
    assert decouverte.async_index(hass)["devices"][0]["name"] == "Le robot"


def test_desactives_ecartes(decouverte):
    """Une entite desactivee n'a pas d'etat : l'afficher promettrait du vide."""
    hass = poser(
        decouverte,
        appareils=[appareil("d1"), appareil("d2", disabled_by="user")],
        entites=[entite("light.a"), entite("light.b", disabled_by="integration")],
    )
    index = decouverte.async_index(hass)
    assert [d["id"] for d in index["devices"]] == ["d1"]
    assert [e["id"] for e in index["entities"]] == ["light.a"]


def test_masquee_signalee_mais_conservee(decouverte):
    """Masquee n'est pas desactivee : l'entite repond, on la marque seulement."""
    hass = poser(decouverte, entites=[entite("light.a", hidden_by="user")])
    assert decouverte.async_index(hass)["entities"][0]["hidden"] is True


def test_categorie_et_classe_transportees(decouverte):
    """Diagnostic et configuration n'ont rien a faire dans une carte."""
    hass = poser(decouverte, entites=[
        entite("sensor.rssi", entity_category=objet(value="diagnostic")),
        entite("sensor.temp", original_device_class="temperature"),
    ])
    e = decouverte.async_index(hass)["entities"]
    assert e[0]["category"] == "diagnostic"
    assert e[1]["device_class"] == "temperature"


# ── Ce qu'on refuse d'exposer ───────────────────────────────────────────────

def test_index_sans_secret(decouverte):
    """Aucun jeton ni option de configuration ne doit transiter.

    La commande est ouverte a tout compte authentifie — c'est tout son interet —
    donc ce qu'elle renvoie doit rester anodin.
    """
    hass = poser(decouverte, appareils=[appareil("d1", identifiers={("demo", "abc")})])
    plat = repr(decouverte.async_index(hass)).lower()
    for interdit in ("token", "password", "api_key", "secret", "credential"):
        assert interdit not in plat


# ── Robustesse ──────────────────────────────────────────────────────────────

def _explose(_hass):
    raise RuntimeError("registre indisponible")


def test_registre_illisible_ne_prive_de_rien(decouverte):
    """Home Assistant doit demarrer meme si un registre repond de travers."""
    hass = poser(decouverte)
    sys.modules["homeassistant.helpers.area_registry"].async_get = _explose
    index = decouverte.async_index(hass)
    assert index["areas"] == [] and index["devices"] == []


def test_etages_absents_sur_ancienne_version(decouverte, monkeypatch):
    """Les etages n'existent que depuis 2024.4 : leur absence n'est pas une panne."""
    hass = poser(decouverte)
    monkeypatch.setitem(sys.modules, "homeassistant.helpers.floor_registry", None)
    assert decouverte.async_index(hass)["floors"] == []


def test_icone_de_zone_transportee(decouverte):
    """L'icone choisie dans Home Assistant doit arriver jusqu'au dashboard.

    Sans elle, l'icone d'une piece se deduisait des mots de son nom, ce qui
    obligeait a nommer ses pieces comme le dashboard l'attendait.
    """
    hass = poser(decouverte, zones=[zone("chambre", "Chambre Enfant", icone="mdi:teddy-bear")])
    assert decouverte.async_index(hass)["areas"][0]["icon"] == "mdi:teddy-bear"
