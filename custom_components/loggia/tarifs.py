"""Le contrat d'electricite a couleurs, reconnu sans liste d'integrations (chantier G3, E4 ; ADR 0302).

Deux roles, poses dans l'index que l'ecran lit (`discovery.py`) — seul le ROLE
sort, jamais l'identifiant stable qui l'a permis :

  creneau          le capteur binaire « heures creuses en cours » dont
                   l'identifiant stable (`unique_id`) finit par `_off_peak` —
                   celui de `rtetempo`, qui n'a pas de cle de traduction pour
                   que `creneau.js` le trouve ;
  couleur          un `enum` dont les options disent bleu, blanc ET rouge (ou
                   blue, white, red) : la FORME d'un jour Tempo ;
  couleur_demain   le meme, quand son identifiant stable ou sa cle de
                   traduction disent le lendemain (next, tomorrow, demain…).

Les options se comparent mises a plat (minuscules, sans accent) et mot par mot :
« TEMPO_ROUGE » dit rouge, « 🔴 » ne dit rien. Pur : pas d'import de Home
Assistant.
"""
from __future__ import annotations

import re
import unicodedata
from typing import Any

OFF_PEAK = re.compile(r"[_-]off[_-]?peak$", re.IGNORECASE)
LENDEMAIN = re.compile(r"next|tomorrow|demain|prochain|lendemain|morgen|domani|manana|jutro", re.IGNORECASE)
TROIS_COULEURS = (frozenset({"bleu", "blanc", "rouge"}), frozenset({"blue", "white", "red"}))


def mots(texte: Any) -> set[str]:
    """Les mots d'un texte, a plat : « TEMPO_Rouge » → {"tempo", "rouge"}."""
    plat = unicodedata.normalize("NFKD", str(texte or "")).encode("ascii", "ignore").decode().lower()
    return {m for m in re.split(r"[^a-z0-9]+", plat) if m}


def couleurs_tempo(options: Any) -> bool:
    """Les options disent-elles les trois couleurs d'un jour Tempo ?"""
    if not isinstance(options, (list, tuple)):
        return False
    vus: set[str] = set()
    for o in options:
        vus |= mots(o)
    return any(c <= vus for c in TROIS_COULEURS)


def role_tarif(domaine: str, unique_id: Any, translation_key: Any, attributs: Any) -> str | None:
    """Le role d'une entite dans le contrat a couleurs, ou None."""
    uid = unique_id if isinstance(unique_id, str) else ""
    if domaine == "binary_sensor":
        return "creneau" if uid and OFF_PEAK.search(uid) else None
    if domaine != "sensor" or not hasattr(attributs, "get") or not couleurs_tempo(attributs.get("options")):
        return None
    cle = translation_key if isinstance(translation_key, str) else ""
    return "couleur_demain" if LENDEMAIN.search(uid) or LENDEMAIN.search(cle) else "couleur"
