"""La forme d'un identifiant d'entite, en un seul endroit (lot 8 de l'audit du 28/10, M12).

`domaine.objet`, en minuscules, chiffres et soulignes - ce que Home Assistant
ecrit lui-meme. La regex existait en quatre variantes (automatisations,
minuteurs, regles, sirene), et en quatre autres pour des domaines nommes
(lecteur, interrupteur, robot, script). Elles se fabriquent ici ; chaque
module garde son nom de motif, et le motif garde exactement sa forme d'avant
(tests/python/test_nombres_entites.py).

Lu par `fullmatch` la ou il garde une entree (26/10) : le `$` de Python
accepte un `\\n` final.
"""
from __future__ import annotations

import re
from collections.abc import Iterable

# Ce qui suit le point : l'objet.
OBJET = "[a-z0-9_]+"
# Un domaine quelconque.
DOMAINE = "[a-z0-9_]+"


def motif(domaine: str = DOMAINE) -> re.Pattern[str]:
    """Une entite dont le domaine suit le fragment `domaine` (une regex)."""
    return re.compile(r"^%s\.%s$" % (domaine, OBJET))


def motif_de(domaines: Iterable[str]) -> re.Pattern[str]:
    """Une entite de l'un de ces domaines, nommes en toutes lettres."""
    return motif("(%s)" % "|".join(domaines))
