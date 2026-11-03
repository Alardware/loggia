"""La fraicheur des mesures, jugee au serveur (01/11, ADR 0311).

Pourquoi ce module existe
─────────────────────────
Une mesure figee s'affichait comme fraiche. Un capteur Zigbee dont la pile
est morte garde sa derniere valeur sans jamais devenir `unavailable` quand
Zigbee2MQTT ne suit pas la disponibilite des appareils : 19,5 °C toute la
semaine, et l'ecran le croit.

L'ecran ne peut pas en juger. Il recoit les etats par `subscribe_entities`,
qui ne porte que `last_changed` et `last_updated`, jamais `last_reported`
(ADR 0303) : une valeur stable passerait pour figee. Le composant, lui, lit
l'etat de Home Assistant tel quel, et `last_reported` y avance a chaque
releve, meme identique au precedent.

La regle
────────
  * Une MESURE PHYSIQUE : un `sensor` dont la classe dit une grandeur de l'air
    ou de la maison (CLASSES_MESURE), porte par un appareil qui n'est pas un
    service (une meteo en ligne, un moniteur systeme). Pas un calcul
    (PLATEFORMES_CALCULEES : modele, groupe, statistiques…), pas un telephone
    (`mobile_app`).
  * Le dernier releve est celui de son APPAREIL, dans son integration : le
    `last_reported` le plus recent de ses entites qui parlent. Zigbee2MQTT
    (MQTT) n'ecrit l'etat d'une entite que si sa valeur change : une
    temperature stable sur un capteur vivant ne bouge pas, mais sa qualite de
    lien, sa pile, son humidite, si. Un appareil vivant n'est pas fige.
  * Sans releve depuis SEUIL (6 h), la mesure est figee ; pour une plante,
    SEUIL_PLANTE (24 h) : un capteur de plante parle peu. Une plante se
    reconnait comme ailleurs : la base d'une plante de `loggia_plants`
    (eau_calcul.est_plante).
  * Sans `last_reported` (une version de Home Assistant d'avant 2024.3), on
    ne juge pas. Une mesure muette (`unavailable`, `unknown`) non plus : elle
    se dit deja.

Ce qui n'est pas juge
─────────────────────
  * La lumiere, le vent et le bruit, hors des plantes : ils restent a 0 toute
    une nuit, et une integration qui ne pousse que les changements (le pont
    Hue) n'en dit rien. Une plante, elle, est relevee a heure fixe.
  * Rien ne part au telephone, rien ne se commande, aucun point d'attention :
    l'ecran ecrit « Dernier releve il y a 7 h » sur la mesure, c'est tout.
"""
from __future__ import annotations

from typing import Any, Callable, Iterable

from .eau_calcul import est_plante

# Les plantes de la maison (la configuration de l'ecran, comme alertes.py).
CLE_PLANTES = "loggia_plants"
SEUIL = 6 * 3600
SEUIL_PLANTE = 24 * 3600

MUETS = {"unavailable", "unknown", "none", ""}

# Les grandeurs dont un releve vieux de six heures dit une panne.
CLASSES_MESURE = frozenset((
    "temperature", "humidity", "carbon_dioxide", "carbon_monoxide",
    "pressure", "atmospheric_pressure", "moisture",
    "pm1", "pm25", "pm10", "volatile_organic_compounds",
    "volatile_organic_compounds_parts", "nitrogen_dioxide", "ozone",
))
# Celles d'une plante en plus : relevees a heure fixe, elles ne dorment pas la nuit.
CLASSES_PLANTE = CLASSES_MESURE | {"illuminance", "conductivity"}

# Ce qui CALCULE une valeur, ou la recoit d'un telephone : jamais juge.
PLATEFORMES_CALCULEES = frozenset((
    "template", "group", "statistics", "min_max", "derivative", "filter",
    "integration", "utility_meter", "threshold", "trend", "compensation",
    "mold_indicator", "thermal_comfort", "history_stats", "mobile_app",
))


def releve(etat: Any) -> float | None:
    """L'instant du dernier releve d'un etat (`last_reported`), en secondes ;
    None sans lui."""
    t = getattr(etat, "last_reported", None)
    try:
        return float(t.timestamp()) if t is not None else None
    except (AttributeError, TypeError, ValueError, OverflowError):
        return None


def parle(etat: Any) -> bool:
    """Un etat qui dit une valeur : ni absent ni muet."""
    return etat is not None and str(getattr(etat, "state", "") or "").strip().lower() not in MUETS


def mesure_physique(classe: Any, plateforme: Any, plante: bool) -> bool:
    """Une grandeur que la regle juge, d'une integration qui la RELEVE."""
    classes = CLASSES_PLANTE if plante else CLASSES_MESURE
    return classe in classes and str(plateforme or "") not in PLATEFORMES_CALCULEES


def figees(entrees: Iterable[Any], etat_de: Callable[[str], Any], physique: Callable[[str], bool],
           bases_plantes: Any, maintenant: float) -> dict[str, int]:
    """Les mesures figees : {entite: instant du dernier releve de son appareil,
    en secondes entieres}. `entrees` : le registre des entites ; `etat_de` :
    l'etat d'une entite ; `physique(appareil)` : un appareil qui n'est pas un
    service."""
    lignes = []
    for e in entrees:
        haid = str(getattr(e, "entity_id", "") or "")
        appareil = getattr(e, "device_id", None)
        if not haid or not appareil or getattr(e, "disabled_by", None) is not None:
            continue
        lignes.append((haid, appareil, getattr(e, "platform", None)))
    # Le dernier releve de chaque appareil, dans son integration : ses entites qui parlent.
    derniers: dict[tuple, float] = {}
    for haid, appareil, plateforme in lignes:
        etat = etat_de(haid)
        t = releve(etat) if parle(etat) else None
        if t is not None:
            cle = (appareil, plateforme)
            derniers[cle] = max(t, derniers.get(cle, t))
    sortie: dict[str, int] = {}
    for haid, appareil, plateforme in lignes:
        if not haid.startswith("sensor."):
            continue
        etat = etat_de(haid)
        if not parle(etat):
            continue
        plante = est_plante(haid, bases_plantes)
        classe = (getattr(etat, "attributes", None) or {}).get("device_class")
        if not mesure_physique(classe, plateforme, plante) or not physique(appareil):
            continue
        t = derniers.get((appareil, plateforme))
        if t is None:
            # Sans `last_reported`, on ne juge pas.
            continue
        if maintenant - t > (SEUIL_PLANTE if plante else SEUIL):
            sortie[haid] = int(t)
    return sortie
