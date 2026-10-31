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


# Le monoxyde de carbone (G1-D6, 30/10 ; ADR 0300) : la table de l'ecran
# (`VERS_PPM_CO`, src/unites.js), a 25 °C et 1 atm — mg/m3 x 24,45 / 28,01,
# ug/m3 mille fois moins, ppb / 1000. Les cles s'ecrivent comme Home Assistant :
# l'exposant ³ et le signe micro (U+00B5).
UNITES_CO = {"ppm": 1.0, "ppb": 0.001, "mg/m\u00b3": 24.45 / 28.01, "\u00b5g/m\u00b3": 24.45 / 28010}


def unite_co(unite: Any) -> str | None:
    """L'unite d'un monoxyde ramenee a l'ecriture de Home Assistant — « PPM »,
    « ug/m3 », le mu grec (U+03BC) au lieu du signe micro —, ou None si la
    table ne sait pas la convertir. La meme regle que `uniteCo` (unites.js)."""
    if unite is None:
        return None
    u = str(unite).strip().lower().replace("\u03bc", "\u00b5")
    if u.startswith("ug/"):
        u = "\u00b5g/" + u[3:]
    if u.endswith("/m3"):
        u = u[:-3] + "/m\u00b3"
    return u if u in UNITES_CO else None


def vers_ppm_co(valeur: float | None, unite: Any) -> float | None:
    """Une valeur de monoxyde en ppm ; None dans une unite inconnue : rien ne
    dit des ppm, on ne devine pas."""
    u = unite_co(unite)
    if valeur is None or u is None:
        return None
    return valeur * UNITES_CO[u]


def vers_celsius(valeur: float, unite: str) -> float:
    """L'inverse de `depuis_celsius` : une valeur dans l'unite de
    l'installation, ramenee en Celsius. Le chauffage garde ses consignes en °C
    (ADR 0128) ; ce qu'un geste a pose sur un thermostat Fahrenheit se range
    donc en Celsius."""
    if unite == "F":
        return (valeur - 32) * 5 / 9
    return valeur
