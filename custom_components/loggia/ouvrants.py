"""Ce qu'est un volet — et ce que Loggia a le droit d'en faire (03/10).

Trois regles bougent les ouvrants de la maison sans que personne regarde : le
planning du soleil, le vent fort, et les scenarios. Elles prenaient TOUS les
`cover.*` : une nuit de tempete, le vent ouvrait la porte de garage et le
portail, puis les rouvrait s'ils ne bougeaient pas ; le matin, le lever du
soleil faisait de meme ; le scenario Reveil ouvrait un portail sans classe
(audit du 03/10). L'ADR 0022 le disait pourtant : un garage, un portail, une
porte ne sont pas des volets.

UNE LISTE POSITIVE, comme l'ADR 0110 pour les alertes : un volet se reconnait
a sa `device_class`. Ce qu'on ne sait pas nommer — une classe absente, comme
beaucoup de portails motorises — n'en est pas un, et Loggia n'y touche pas.
C'est le choix de l'utilisateur du 03/10 (« option b ») : un vrai volet sans
classe ne sera plus pilote ; il suffit de lui en donner une dans Home Assistant.

LES FENETRES DE TOIT (velux), sur option. Une fenetre n'est pas un volet :
« tout remonter » au vent, c'est l'OUVRIR dans la tempete. Loggia ne fait
donc que les FERMER — au coucher, par vent fort, dans un scenario qui ferme —
et jamais ne les ouvre. L'option est dans les reglages des volets : chacun
choisit.

LE STORE BANNE suit le planning comme avant, mais au vent il se REPLIE : pour
lui, « ouvrir » c'est se deployer, et un store deploye dans une rafale se
dechire comme un volet baisse se plie.
"""
from __future__ import annotations

from typing import Any

# Les volets : roulants, stores, toiles, rideaux, stores bannes.
CLASSES_VOLETS: tuple[str, ...] = ("shutter", "blind", "shade", "curtain", "awning")
STORE_BANNE = "awning"
FENETRE_DE_TOIT = "window"


def est_volet(classe: Any) -> bool:
    """Un volet, par sa `device_class` — jamais par son nom, jamais par defaut."""
    return classe in CLASSES_VOLETS


def est_fenetre_de_toit(classe: Any) -> bool:
    return classe == FENETRE_DE_TOIT


def geste_au_vent(classe: Any, velux: bool = False) -> str | None:
    """Ce que le vent fort fait de cet ouvrant, ou None s'il n'y touche pas.

    Un volet se remonte (baisse, il se plie), un store banne se replie
    (deploye, il se dechire), une fenetre de toit se ferme si l'option est
    prise. Le reste — garage, portail, porte, classe inconnue — ne bouge pas.
    """
    if classe == STORE_BANNE:
        return "close_cover"
    if est_volet(classe):
        return "open_cover"
    if velux and est_fenetre_de_toit(classe):
        return "close_cover"
    return None
