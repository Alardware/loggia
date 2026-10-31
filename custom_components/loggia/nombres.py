"""Un nombre fini, lu d'une valeur venue d'ailleurs (lot 8 de l'audit du 28/10, M12).

La meme garde etait reecrite dans huit modules : un booleen n'est pas un
nombre, et « nan » ou « inf » non plus - un vent a « nan » rendait
`valeur >= seuil` toujours faux, et la mise a l'abri ne partait jamais (ADR
0280). Deux lectures, selon ce que le module recoit :

  `fini(x)` : x EST deja un nombre (int ou float), et il est fini. Un texte
              n'en est pas un : c'est la lecture d'une configuration ecrite par
              l'ecran, ou d'un attribut que Home Assistant donne en nombre.
  `lu(x)`   : x se LIT comme un nombre (`float(x)`) : « 21.5 », l'etat d'un
              capteur, compte aussi.

Les deux rendent un float, ou None. Un entier trop grand pour un float (un
JSON de quatre cents chiffres) rend None au lieu de lever.
"""
from __future__ import annotations

import math
from typing import Any


def fini(x: Any) -> float | None:
    """Un nombre fini, ou None - un booleen n'en est pas un, ni un texte."""
    if isinstance(x, bool) or not isinstance(x, (int, float)):
        return None
    try:
        valeur = float(x)
    except OverflowError:
        return None
    return valeur if math.isfinite(valeur) else None


def lu(x: Any) -> float | None:
    """Ce qui se lit comme un nombre fini (« 21.5 » compte), ou None - un booleen n'en est pas un."""
    if isinstance(x, bool):
        return None
    try:
        valeur = float(x)
    except (TypeError, ValueError, OverflowError):
        return None
    return valeur if math.isfinite(valeur) else None
