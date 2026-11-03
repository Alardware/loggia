"""Ce que porte l'appareil d'une entite : ses voisines, par domaine (31/10, ADR 0305).

Pourquoi ce module existe
─────────────────────────
La classe d'un binaire dit CE QU'IL MESURE, pas QUI le mesure. Deux cas de son
installation, le 31/10, ou la classe seule trompait la surete :

- la pluie de la tondeuse. `binary_sensor.tondeuse_pluie_detectee`
  (Mammotion) est de classe `moisture` : de l'eau sur un capteur. Pour
  alertes.py, c'etait une FUITE - « Fuite d'eau détectée » a chaque averse, et
  la vanne coupee si une vanne etait choisie ;
- l'alarme qu'une camera ENTEND. Les cameras d'UniFi Protect reconnaissent le son
  d'un detecteur de monoxyde (`binary_sensor.camera_entree_alarme_de_co_detectee`, classe
  `carbon_monoxide`). Le son d'un detecteur chez un voisin, ou a la television,
  allumait toutes les lampes a 100 % et remontait les volets.

Ce qui les distingue n'est pas un nom (jamais de nom : ADR 0164), c'est
l'APPAREIL qui les porte. Un detecteur de fuite est un appareil a lui seul ; la
pluie de la tondeuse vit sur le meme appareil qu'un `lawn_mower`. Un detecteur
de monoxyde est un detecteur ; celui que la camera entend vit sur le meme
appareil qu'une `camera`. Le registre des entites le dit sans rien configurer.

Un registre illisible, ou une entite qu'il ne connait pas : aucune voisine. On
ne perd alors aucun vrai detecteur - c'est la regle d'ADR 0022.
"""
from __future__ import annotations

import logging
import re
from collections.abc import Iterable
from typing import Any

_LOGGER = logging.getLogger(__name__)

# Les robots qui portent un capteur de pluie : la tondeuse, et l'aspirateur
# d'exterieur qui en aurait un. Leur `moisture` est la meteo, pas une fuite.
ROBOTS = ("lawn_mower", "vacuum")
# Les classes qu'une camera peut ENTENDRE. Le gaz ne s'entend pas : un `gas`
# sur une camera reste un detecteur, comme avant.
CLASSES_ENTENDUES = ("smoke", "carbon_monoxide")


# `entree` absente : on la lit au registre.
_LIRE = object()


def domaines_voisins(hass: Any, haid: str, entree: Any = _LIRE) -> frozenset[str]:
    """Les domaines des entites que porte le meme appareil que `haid`, la
    sienne comprise. Vide sans appareil, hors du registre, ou s'il ne se lit
    pas. `entree` : celle du registre, quand l'appelant l'a deja lue - une
    lecture de moins."""
    try:
        from homeassistant.helpers import entity_registry as er

        registre = er.async_get(hass)
        if entree is _LIRE:
            entree = registre.async_get(haid)
        appareil = getattr(entree, "device_id", None)
        if not appareil:
            return frozenset()
        entites = registre.entities
        # `get_entries_for_device_id` : l'index de Home Assistant, sans tout
        # parcourir. Faute de lui, le registre entier.
        par_appareil = getattr(entites, "get_entries_for_device_id", None)
        if callable(par_appareil):
            lot: Iterable[Any] = par_appareil(appareil, True)
        else:
            lot = [e for e in entites.values() if getattr(e, "device_id", None) == appareil]
        return frozenset(str(e.entity_id).split(".", 1)[0] for e in lot if getattr(e, "entity_id", None))
    except Exception:  # noqa: BLE001
        _LOGGER.debug("Loggia : registre illisible pour l'appareil de %s", haid, exc_info=True)
        return frozenset()


def pluie_de_robot(voisins: Iterable[str]) -> bool:
    """Ce `moisture` est-il la pluie d'un robot (son appareil porte une
    tondeuse ou un aspirateur) ?"""
    return any(d in ROBOTS for d in voisins)


# Le bouton qui REARME un appareil en defaut (01/11, ADR 0307) : reconnu a sa cle
# stable - l'`unique_id` ou la `translation_key` que l'integration lui donne -,
# jamais a son nom. Chez lui, le poele MCZ Maestro : `…-m1_com_reset_allarm`.
# Etroit expres : un bouton « reset » quelconque (filtre, compteur) n'en est pas un.
REARMER = re.compile(r"(?:^|[_\-.])(?:reset_?al+arm|al+arm_?reset|reset_?(?:error|errors|fault|faults))(?:$|[_\-.])", re.I)


def est_rearmement(domaine: str, unique_id: Any, translation_key: Any) -> bool:
    """Ce bouton rearme-t-il l'alarme de son appareil ?"""
    if domaine != "button":
        return False
    return any(isinstance(c, str) and REARMER.search(c) for c in (unique_id, translation_key))


def entendue(dc: Any, voisins: Iterable[str]) -> bool:
    """Ce binaire est-il une alarme qu'une camera ENTEND (fumee, monoxyde, sur
    l'appareil d'une camera) ? Le son ne prouve pas un danger dans la maison."""
    return dc in CLASSES_ENTENDUES and "camera" in voisins
