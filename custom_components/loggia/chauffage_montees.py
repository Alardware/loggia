"""La mesure des montees en temperature, sans Home Assistant (ADR 0340).

Quand le planning passe un chauffage a un mode plus chaud, combien la piece
gagne-t-elle, et en combien de temps ? Ce fichier ne sait que calculer : le
moteur (`chauffage.py`) lui donne des instants, des points deja lus et ce qu'il
a sorti du registre. Il ne commande rien, et ne leve jamais sur un fichier
abime. Les temperatures y sont en °C, les durees en minutes entieres.
"""
from __future__ import annotations

import math
import statistics
from collections.abc import Callable
from datetime import datetime, timedelta
from typing import Any

from .chauffage_calcul import FROID, JOURS, MINUTES_JOUR, changement_en_cours, mode_planning
from .chauffage_config import lire_instant
from .unites import vers_celsius

# Quatre-vingt-dix montees, environ six semaines a deux par jour.
MAX_PAR_CHAUFFAGE = 90
# Au-dela, un creneau long ne dit plus rien de la montee.
DUREE_MESUREE = timedelta(hours=4)
DUREE_MINIMALE = timedelta(minutes=20)
# La valeur de depart doit etre recente : plus vieille, la sonde se taisait.
AGE_DEPART = timedelta(hours=3)
# Un ordre parti dans ces minutes est le passage du planning (une relance, une
# verification) ; apres, c'est autre chose : une fenetre refermee, un retour.
MARGE_OUVERTURE = 5
MONTEES_POUR_RYTHME = 3
FENETRE_RYTHME = 30


def _minutes(duree: timedelta) -> int:
    return int(duree.total_seconds() // 60)


def plus_chaud(de: Any, a: Any) -> bool:
    """`a` est-il un mode plus chaud que `de`, dans l'ordre de `FROID` ?"""
    return de in FROID and a in FROID and FROID.index(a) > FROID.index(de)


def passage_du_planning(semaine: Any, jour: int, minute: int) -> str | None:
    """Le mode que le planning quittait, si (jour, minute) tombe dans les cinq
    minutes d'un changement ; None sinon, ou pour une semaine vide."""
    en_cours = changement_en_cours(semaine, jour, minute)
    if en_cours is None:
        return None
    debut = en_cours[0] * MINUTES_JOUR + en_cours[1]
    semaine_entiere = len(JOURS) * MINUTES_JOUR
    if (jour * MINUTES_JOUR + minute - debut) % semaine_entiere > MARGE_OUVERTURE:
        return None
    avant = (debut - 1) % semaine_entiere
    return mode_planning(semaine, avant // MINUTES_JOUR, avant % MINUTES_JOUR)


def _valeur_a(points: list[tuple[datetime, float]], instant: datetime) -> float:
    """La valeur a `instant`, lineaire entre deux points ; apres le dernier, sa valeur."""
    avant = points[0]
    for t, v in points:
        if t <= instant:
            avant = (t, v)
            continue
        return avant[1] + (v - avant[1]) * ((instant - avant[0]) / (t - avant[0]))
    return avant[1]


def _pour_un_degre(ligne: list[tuple[datetime, float]], debut: datetime, arrivee: datetime) -> int | None:
    """Les minutes pour gagner 1 °C, ou None si la piece n'y arrive pas avant `arrivee`."""
    cible = ligne[0][1] + 1
    for (t1, v1), (t2, v2) in zip(ligne, ligne[1:]):
        if v2 >= cible:
            instant = t1 + (t2 - t1) * ((cible - v1) / (v2 - v1))
            return _minutes(instant - debut) if instant <= arrivee else None
    return None


def resume_montee(points: list[tuple[datetime, float]], debut: datetime, fin: datetime) -> dict[str, Any] | None:
    """Le resume d'une montee, ou None si elle est ecartee. Depart : le dernier
    point d'avant `debut`. Arrivee : la valeur a `min(fin, debut + 4 h)`."""
    lus = sorted(points, key=lambda p: p[0])
    depart = [p for p in lus if p[0] <= debut and debut - p[0] <= AGE_DEPART]
    apres = [p for p in lus if p[0] > debut]
    arrivee = min(fin, debut + DUREE_MESUREE)
    if not depart or not apres or arrivee - debut < DUREE_MINIMALE:
        return None
    t0 = depart[-1][1]
    ligne = [(debut, t0), *apres]
    return {"t0": round(t0, 1), "gain": round(_valeur_a(ligne, arrivee) - t0, 1),
            "duree": _minutes(arrivee - debut), "pour_un_degre": _pour_un_degre(ligne, debut, arrivee)}


def ajouter(liste: list[dict[str, Any]], montee: dict[str, Any]) -> list[dict[str, Any]]:
    """La liste rangee par date, limitee aux `MAX_PAR_CHAUFFAGE` dernieres."""
    return sorted([*liste, montee], key=lambda m: lire_instant(m["debut"]))[-MAX_PAR_CHAUFFAGE:]


def rythme(montees: list[dict[str, Any]]) -> float | None:
    """Les °C par heure habituels : la mediane des 30 dernieres, None sous 3 montees."""
    derniers = montees[-FENETRE_RYTHME:]
    if len(derniers) < MONTEES_POUR_RYTHME:
        return None
    return round(statistics.median(m["gain"] * 60 / m["duree"] for m in derniers), 1)


def _nombre(x: Any) -> bool:
    return isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x)


def _montee_lisible(m: Any) -> bool:
    return (isinstance(m, dict) and lire_instant(m.get("debut")) is not None and m.get("de") in FROID
            and m.get("a") in FROID and _nombre(m.get("t0")) and _nombre(m.get("gain"))
            and _nombre(m.get("duree")) and m["duree"] > 0
            and (m.get("pour_un_degre") is None or _nombre(m.get("pour_un_degre")))
            and (m.get("ext") is None or _nombre(m.get("ext"))))


def _en_cours_lisible(m: Any) -> bool:
    return (isinstance(m, dict) and lire_instant(m.get("debut")) is not None
            and (m.get("fin_prevue") is None or lire_instant(m.get("fin_prevue")) is not None)
            and m.get("de") in FROID and m.get("a") in FROID
            and isinstance(m.get("sonde"), str) and bool(m["sonde"])
            and (m.get("attribut") is None or isinstance(m.get("attribut"), str))
            and (m.get("ext") is None or _nombre(m.get("ext"))))


def lire_fichier(brut: Any) -> dict[str, Any]:
    """Ce qui se relit d'un fichier ; abime, il vaut vide. Ne leve jamais."""
    lu = brut if isinstance(brut, dict) else {}
    en_cours = lu.get("en_cours") if isinstance(lu.get("en_cours"), dict) else {}
    montees = lu.get("montees") if isinstance(lu.get("montees"), dict) else {}
    propres: dict[str, list[dict[str, Any]]] = {}
    for cle, liste in montees.items():
        bonnes = [m for m in liste if _montee_lisible(m)] if isinstance(liste, list) else []
        if bonnes:
            propres[str(cle)] = sorted(bonnes, key=lambda m: lire_instant(m["debut"]))[-MAX_PAR_CHAUFFAGE:]
    return {"en_cours": {str(c): m for c, m in en_cours.items() if _en_cours_lisible(m)}, "montees": propres}


def garder(etat: dict[str, Any], cles: Any) -> dict[str, Any]:
    """L'etat sans les chauffages qui ne sont plus dans `cles`."""
    return {"en_cours": {c: m for c, m in etat["en_cours"].items() if c in cles},
            "montees": {c: l for c, l in etat["montees"].items() if c in cles}}


def points_lus(etats: Any, attribut: str | None, unite: str) -> list[tuple[datetime, float]]:
    """Les mesures d'une lecture de l'historique, en °C. Ce qui n'est pas un nombre part."""
    sortie: list[tuple[datetime, float]] = []
    for e in etats or []:
        brut = (getattr(e, "attributes", None) or {}).get(attribut) if attribut else getattr(e, "state", None)
        instant = getattr(e, "last_updated", None) or getattr(e, "last_changed", None)
        try:
            valeur = float(brut)
        except (TypeError, ValueError):
            continue
        if isinstance(instant, datetime) and math.isfinite(valeur):
            sortie.append((instant, vers_celsius(valeur, unite)))
    return sortie


def choisir_sonde(entite: str, famille: Any, zones: Any, pieces: Any, nom_zone: Any, sur_appareil: list[str],
                  dans_zone: list[str], existe: Callable[[str], bool], mesure_propre: bool) -> dict[str, Any] | None:
    """La sonde d'un chauffage, `{"sonde", "attribut"}`, ou None : la zone decrite
    a la main, le capteur de sa piece dans Loggia, celui de son module (fil
    pilote), le premier de sa zone hors de l'appareil (les fumees d'un poele ne
    mesurent pas la piece), enfin la mesure d'un thermostat."""
    def retenue(x: Any) -> bool:
        return isinstance(x, str) and bool(x) and x != entite and existe(x)

    for z in zones if isinstance(zones, list) else []:
        if isinstance(z, dict) and entite in (z.get("haid"), z.get("modeEnt")) and retenue(z.get("tempSensor")):
            return {"sonde": z["tempSensor"], "attribut": None}
    nom = str(nom_zone or "").strip().lower()
    for r in pieces if nom and isinstance(pieces, list) else []:
        if isinstance(r, dict) and str(r.get("room") or "").strip().lower() == nom and isinstance(r.get("haid"), dict):
            temp = r["haid"].get("temp")
            if retenue(temp) and temp not in sur_appareil:
                return {"sonde": temp, "attribut": None}
    if famille == "fil_pilote" and sur_appareil:
        return {"sonde": sur_appareil[0], "attribut": None}
    hors_appareil = [x for x in dans_zone if x not in sur_appareil]
    if hors_appareil:
        return {"sonde": hors_appareil[0], "attribut": None}
    return {"sonde": entite, "attribut": "current_temperature"} if mesure_propre else None
