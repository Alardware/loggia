"""Conversions Celsius/Fahrenheit, cote backend. Miroir de `src/unites.js`.

Les tables de seuils du composant (confort, alertes CPU, protection solaire...)
restent TOUTES en Celsius, cote frontend comme cote backend : c'est la base
historique, et la reecrire pour chaque installation serait une source d'erreur
sans aucun gain. Seules les VALEURS PAR DEFAUT proposees a une installation
JAMAIS CONFIGUREE doivent parler la langue de cette installation (ADR a
completer) : une consigne de 17, pensee en Celsius, est un ordre de chauffer
bien plus fort qu'une maison tiede si l'installation compte en Fahrenheit.

Des qu'une valeur a ete enregistree une fois (par la fiche de presence ou de
volets), elle vient du magasin et ces fonctions ne la touchent plus : le
frontend l'a deja ecrite dans l'unite reelle de l'installation.
"""
from __future__ import annotations

from typing import Any


def unite_temperature(hass: Any) -> str:
    """'F' si l'installation mesure en Fahrenheit, 'C' sinon (et par defaut).

    Lit `hass.config.units.temperature_unit`, l'API du coeur de Home Assistant.
    Une doublure de test sans `config` (ou sans `units`) ne fait pas echouer le
    composant : on suppose alors le Celsius, comme avant ce module.
    """
    try:
        valeur = hass.config.units.temperature_unit
    except AttributeError:
        return "C"
    return "F" if valeur in ("°F", "F") else "C"


def depuis_celsius(valeur: float, unite: str) -> float:
    """Convertit une valeur pensee en Celsius vers l'unite demandee."""
    if unite == "F":
        return valeur * 9 / 5 + 32
    return valeur
