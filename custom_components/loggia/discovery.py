"""Ce que Home Assistant sait de l'installation, lu depuis le composant.

Le dashboard lisait lui-meme les quatre registres, par `config/area_registry/list`
et ses voisins. Ces commandes sont RESERVEES AUX ADMINISTRATEURS : sur un compte
ordinaire, la decouverte ne renvoyait rien, et l'interface retombait sur ce
qu'elle pouvait deviner des seuls etats — sans pieces, sans zones, sans appareils.

Le composant, lui, tourne dans Home Assistant et lit ces registres directement.
Il les expose a tous les comptes authentifies, ce qui donne la meme interface a
toute la maison.

Ce qui sort d'ici est volontairement pauvre : identifiants, noms, rattachements,
et de quoi reconnaitre un appareil (fabricant, modele, integration). Aucun jeton,
aucune option de configuration, rien qui touche aux identifiants de connexion
d'une integration.
"""
from __future__ import annotations

import logging
from typing import Any

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import (
    area_registry as ar,
    device_registry as dr,
    entity_registry as er,
)

_LOGGER = logging.getLogger(__name__)

# Le client compare ce numero au sien : une structure qui change sans prevenir
# ferait lire de travers un dashboard reste en cache.
INDEX_VERSION = 1


@callback
def _version_du_composant() -> str | None:
    """La version REELLEMENT installee, lue dans le manifeste.

    Le dashboard affichait un numero ecrit en dur dans son code, qui ne
    correspondait a rien : il annoncait « v3.0 » alors que le composant
    installe etait en 2.1.0. La seule source qui ne mente pas est le manifeste
    du composant qui tourne — c'est lui que HACS met a jour.
    """
    try:
        import json
        from pathlib import Path as _P
        m = json.loads((_P(__file__).parent / "manifest.json").read_text(encoding="utf-8"))
        return m.get("version")
    except Exception:  # noqa: BLE001 — un manifeste illisible ne prive de rien
        return None


def _valeur(x: Any) -> Any:
    """Rend une valeur transportable : les registres melent enums et objets."""
    if x is None or isinstance(x, (str, int, float, bool)):
        return x
    return getattr(x, "value", None) or str(x)


@callback
def _zones(hass: HomeAssistant) -> list[dict[str, Any]]:
    reg = ar.async_get(hass)
    return [
        {
            "id": a.id,
            "name": a.name,
            "floor": getattr(a, "floor_id", None),
            # L'icone que l'utilisateur a choisie pour sa piece dans Home
            # Assistant, sous la forme « mdi:sofa ». Elle etait jetee, et le
            # dashboard en deduisait une des mots du nom — ce qui obligeait a
            # nommer ses pieces comme il l'attendait.
            "icon": getattr(a, "icon", None),
        }
        for a in reg.async_list_areas()
    ]


@callback
def _etages(hass: HomeAssistant) -> list[dict[str, Any]]:
    """Les etages n'existent que depuis Home Assistant 2024.4."""
    try:
        from homeassistant.helpers import floor_registry as fr
    except ImportError:
        return []
    reg = fr.async_get(hass)
    return [
        {"id": f.floor_id, "name": f.name, "level": getattr(f, "level", None)}
        for f in reg.async_list_floors()
    ]


@callback
def _appareils(hass: HomeAssistant) -> list[dict[str, Any]]:
    reg = dr.async_get(hass)
    sortie = []
    for d in reg.devices.values():
        if d.disabled_by is not None:
            continue
        # `identifiers` porte le domaine de l'integration qui a cree l'appareil.
        integration = None
        for domaine, _ in d.identifiers:
            integration = domaine
            break
        sortie.append({
            "id": d.id,
            "name": d.name_by_user or d.name,
            # Fabricant et modele restent : ils servent a reconnaitre l'appareil
            # (voir profiles.js). La VERSION DE FIRMWARE, elle, ne servait a
            # personne — recopiee, jamais relue — et c'etait le champ le plus
            # exploitable de la reponse : une version exacte designe les failles
            # publiees qui s'y appliquent. Elle ne sort plus d'ici.
            "manufacturer": d.manufacturer,
            "model": d.model,
            "integration": integration,
            "area": d.area_id,
            "via": d.via_device_id,
            "entry_type": _valeur(d.entry_type),
        })
    return sortie


def _lecture_autorisee(user: Any) -> Any:
    """Renvoie un test `(entity_id) -> bool`, ou None si tout est permis.

    Home Assistant sait restreindre un compte a certaines entites. Cette
    decouverte l'ignorait : un administrateur pouvait limiter quelqu'un, Loggia
    lui renvoyait quand meme le registre entier. Le filtre s'appuie sur la
    politique du compte, jamais sur un champ envoye par le client.

    Sans restriction configuree — le cas de presque toutes les installations —
    `permissions` autorise tout et l'on renvoie None : aucun parcours
    supplementaire, aucun changement de comportement.
    """
    if user is None or getattr(user, "is_admin", False):
        return None
    perms = getattr(user, "permissions", None)
    verif = getattr(perms, "check_entity", None)
    if verif is None:
        return None
    return lambda entity_id: bool(verif(entity_id, "read"))


@callback
def _entites(hass: HomeAssistant, autorise: Any = None) -> list[dict[str, Any]]:
    reg = er.async_get(hass)
    sortie = []
    for e in reg.entities.values():
        if e.disabled_by is not None:
            continue
        if autorise is not None and not autorise(e.entity_id):
            continue
        sortie.append({
            "id": e.entity_id,
            "name": e.name or e.original_name,
            "device": e.device_id,
            "area": e.area_id,
            "platform": e.platform,
            # Une entite de diagnostic ou de configuration n'a rien a faire
            # dans une carte : le client a besoin de le savoir.
            "category": _valeur(e.entity_category),
            "device_class": e.device_class or e.original_device_class,
            "unit": e.unit_of_measurement,
            "hidden": e.hidden_by is not None,
        })
    return sortie


@callback
def _services(hass: HomeAssistant) -> dict[str, dict[str, Any]]:
    """Ce que l'installation sait REELLEMENT faire.

    Une capacite deduite du seul domaine est une supposition : `vacuum` ne dit
    pas si le robot accepte `send_command`. La liste des services le dit.

    Seuls les noms de champs sont conserves — descriptions et selecteurs pesent
    plusieurs centaines de kilo-octets, et le client n'en a pas l'usage.
    """
    sortie: dict[str, dict[str, Any]] = {}
    for domaine, services in hass.services.async_services().items():
        entrees: dict[str, Any] = {}
        for nom, service in services.items():
            champs: list[str] = []
            schema = getattr(service, "schema", None)
            interne = getattr(schema, "schema", None) if schema is not None else None
            if isinstance(interne, dict):
                champs = sorted(str(getattr(c, "schema", c)) for c in interne)
            entrees[nom] = {"fields": champs}
        sortie[domaine] = entrees
    return sortie


@callback
def async_index(hass: HomeAssistant, user: Any = None) -> dict[str, Any]:
    """Tout ce dont le dashboard a besoin pour se construire, en un envoi.

    `user` est le compte de la connexion WebSocket, quand l'appelant le connait.
    Il ne sert qu'a retirer ce que ce compte n'a pas le droit de lire ; il n'est
    jamais lu depuis un message du client. Omis, la reponse est complete — c'est
    ce que font les tests et ce qui se passait avant.
    """
    autorise = _lecture_autorisee(user)
    try:
        return {
            "version": INDEX_VERSION,
            # La version du composant, distincte de celle de l'index : l'une dit
            # la forme des donnees, l'autre ce qui est installe.
            "component_version": _version_du_composant(),
            "areas": _zones(hass),
            "floors": _etages(hass),
            "devices": _appareils(hass),
            "entities": _entites(hass, autorise),
            "services": _services(hass),
        }
    except Exception:  # noqa: BLE001 — un registre illisible ne doit pas priver
        _LOGGER.exception("Loggia : lecture des registres impossible")
        return {"version": INDEX_VERSION, "component_version": _version_du_composant(),
                "areas": [], "floors": [], "devices": [], "entities": [], "services": {}}
