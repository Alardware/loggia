"""Le calcul du chauffage, sans Home Assistant (chantier Chauffage, spec 5.2).

Une seule question, toujours la meme : "que doit faire ce chauffage
maintenant ?". Elle se pose ici en HEURE MURALE - un jour de la semaine
(0 = lundi ... 6 = dimanche, comme `weekday()`) et une minute dans la journee.
Les instants, le fuseau et le changement d'heure appartiennent au moteur
(`chauffage.py`) : ce fichier n'en sait rien, et c'est ce qui le rend
testable seul.

Son jumeau, cote ecran, est `src/chauffage.js` : memes fonctions, memes
resultats, tenus d'accord par `tests/fixtures/chauffage_parite.json` - lue par
les deux suites. Si l'un bouge sans l'autre, l'une des deux rougit.
"""
from __future__ import annotations

import re
from typing import Any

# Les six modes, dans l'ordre ou l'ecran les propose (spec 4).
MODES = ("confort", "confort_1", "confort_2", "eco", "hors_gel", "arret")
# Du plus froid au plus chaud. La fenetre ne fait que BAISSER : un "Eco
# fenetre ouverte" ne rallume pas un poele coupe pour l'ete.
FROID = ("arret", "hors_gel", "eco", "confort_2", "confort_1", "confort")
# Les cles des jours, lundi d'abord : `weekday()` en est l'indice.
JOURS = ("lun", "mar", "mer", "jeu", "ven", "sam", "dim")
MINUTES_JOUR = 24 * 60
# Le mode de la maison, et ce que donnent Absence et Vacances sans reglage.
MAISONS = ("planning", "absence", "vacances", "ete")
MAISON_DEFAUT = {"absence": "eco", "vacances": "hors_gel"}

# Une heure murale : "6:05" ou "06:05", jamais "6:5". Chiffres ASCII
# seulement : `\d` laisserait passer les chiffres d'autres ecritures. Les seuls
# blancs admis autour (espace, tabulation, fins de ligne) sont DANS le motif :
# `strip()` de Python et `trim()` de JavaScript ne retirent pas les memes autres
# blancs, et un motif ancre reste lineaire sur une longue suite de blancs.
HEURE = re.compile(r"[ \t\r\n]*([0-9]{1,2}):([0-9]{2})[ \t\r\n]*")


def lire_heure(hhmm: Any) -> int | None:
    """'06:30' -> 390. None si ce n'est pas une heure de 00:00 a 23:59.

    Autour de l'heure, seuls l'espace, la tabulation et les fins de ligne sont
    admis (voir `HEURE`) : les deux langues doivent lire la meme chose."""
    if not isinstance(hhmm, str):
        return None
    m = HEURE.fullmatch(hhmm)
    if not m:
        return None
    h, mi = int(m.group(1)), int(m.group(2))
    if h > 23 or mi > 59:
        return None
    return h * 60 + mi


def ecrire_heure(minute: int) -> str:
    """390 -> '06:30'."""
    h, mi = divmod(int(minute) % MINUTES_JOUR, 60)
    return "%02d:%02d" % (h, mi)


def changements(semaine: Any) -> list[tuple[int, str]]:
    """Les changements de la semaine, en minutes depuis lundi 00:00, tries.

    Ce qui est illisible est ECARTE : un planning abime ne doit pas tout
    eteindre. C'est l'ecriture qui refuse (`chauffage_config.py`). Deux
    changements a la meme minute n'en font qu'un : le DERNIER de la liste
    l'emporte, sans quoi le premier ferait un faux "prochain changement"."""
    vus: dict[int, str] = {}
    if not isinstance(semaine, dict):
        return []
    for j, nom in enumerate(JOURS):
        liste = semaine.get(nom)
        if not isinstance(liste, list):
            continue
        for c in liste:
            if not isinstance(c, dict):
                continue
            minute = lire_heure(c.get("h"))
            if minute is None or c.get("mode") not in MODES:
                continue
            vus[j * MINUTES_JOUR + minute] = c["mode"]
    return sorted(vus.items())


def changement_en_cours(semaine: Any, jour: int, minute: int) -> tuple[int, int, str] | None:
    """Le changement en vigueur a (jour, minute) : (jour, minute, mode).

    Un changement a cette minute-ci est DEJA en vigueur. Un jour sans
    changement reprend la fin de la veille, et avant le premier changement de
    la semaine c'est le dernier de la semaine d'avant : la semaine boucle.
    None : une semaine vide."""
    liste = changements(semaine)
    if not liste:
        return None
    t = jour * MINUTES_JOUR + minute
    w, mode = liste[-1]
    for wc, mc in liste:
        if wc > t:
            break
        w, mode = wc, mc
    return (w // MINUTES_JOUR, w % MINUTES_JOUR, mode)


def mode_planning(semaine: Any, jour: int, minute: int) -> str | None:
    """Le mode du creneau en cours, ou None pour une semaine vide."""
    en_cours = changement_en_cours(semaine, jour, minute)
    return en_cours[2] if en_cours else None


def prochain_changement(semaine: Any, jour: int, minute: int) -> tuple[int, int, str] | None:
    """Le prochain changement EFFECTIF strictement apres (jour, minute).

    Effectif : un changement qui remet le mode deja en cours ne compte pas -
    "jusqu'a 23:00, puis Eco" ne s'arrete pas sur un Eco suivi d'un Eco.
    None : la semaine ne change jamais de mode."""
    liste = changements(semaine)
    if not liste:
        return None
    t = jour * MINUTES_JOUR + minute
    courant = mode_planning(semaine, jour, minute)
    suite = [(w, m) for w, m in liste if w > t] + [(w, m) for w, m in liste if w <= t]
    for w, m in suite:
        if m != courant:
            return (w // MINUTES_JOUR, w % MINUTES_JOUR, m)
    return None


def reprise_active(reprise: Any) -> bool:
    """Une reprise en main est-elle en cours ?

    `reste` : les minutes avant sa fin, calculees par le moteur sur de vrais
    instants ; None veut dire "jusqu'a relance". Une cle absente vaut une
    reprise finie - jamais une reprise eternelle par oubli."""
    if not isinstance(reprise, dict):
        return False
    reste = reprise.get("reste", 0)
    if reste is None:
        return True
    return isinstance(reste, (int, float)) and not isinstance(reste, bool) and reste > 0


def mode_maison(maison: Any) -> str:
    """Le mode de la maison ; un mode illisible vaut 'planning'."""
    m = maison.get("mode") if isinstance(maison, dict) else None
    return m if m in MAISONS else "planning"


def reglage_maison(maison: Any, mode: str) -> str:
    """Le mode qu'Absence ou Vacances donne aux chauffages."""
    m = maison.get(mode) if isinstance(maison, dict) else None
    return m if m in MODES else MAISON_DEFAUT[mode]


def _maison_ou_planning(semaine: Any, maison: Any, jour: int, minute: int) -> dict[str, Any]:
    """Les marches 3 et 4 : le mode de la maison, sinon le planning.

    Ete : arret. Vacances : son reglage TEL QUEL - meme sur un planning a
    l'Arret, c'est la garde contre le gel d'un long depart. Absence : son
    reglage, mais seulement pour BAISSER (decision du 09/10) - une maison vide
    ne chauffe jamais plus que le planning ; un planning plus froid reste le
    planning, et sa suite ("puis") est ramenee au reglage d'Absence."""
    regime = mode_maison(maison)
    if regime == "ete":
        return {"mode": "arret", "source": "maison", "fin": None, "puis": None}
    if regime == "vacances":
        return {"mode": reglage_maison(maison, regime), "source": "maison", "fin": None, "puis": None}
    mode = mode_planning(semaine, jour, minute)
    plafond = reglage_maison(maison, regime) if regime == "absence" else None
    if plafond is not None and (mode is None or FROID.index(plafond) <= FROID.index(mode)):
        return {"mode": plafond, "source": "maison", "fin": None, "puis": None}
    suivant = prochain_changement(semaine, jour, minute) if mode is not None else None
    if suivant is None:
        return {"mode": mode, "source": "planning", "fin": None, "puis": None}
    puis = suivant[2]
    if plafond is not None and FROID.index(plafond) < FROID.index(puis):
        puis = plafond
    return {"mode": mode, "source": "planning", "fin": [suivant[0], suivant[1]], "puis": puis}


def _fin_lisible(fin: Any) -> list[int] | None:
    """La fin d'une reprise, [jour, minute] murale, ou None si elle est illisible.

    Deux entiers (pas des booleens), un jour de 0 a 6 et une minute de 0 a
    1439 : sinon la reprise n'a pas de "jusqu'a". Un etat abime ne doit jamais
    faire lever le calcul."""
    if not isinstance(fin, (list, tuple)) or len(fin) != 2:
        return None
    jour, minute = fin
    for n in (jour, minute):
        if not isinstance(n, int) or isinstance(n, bool):
            return None
    if not (0 <= jour < len(JOURS) and 0 <= minute < MINUTES_JOUR):
        return None
    return [jour, minute]


def mode_voulu(semaine: Any, maison: Any, reprise: Any, fenetre: bool, jour: int, minute: int,
               reglage_fenetre: str = "arret") -> dict[str, Any]:
    """Ce que le chauffage doit faire a cette heure murale (spec 5.1).

    La premiere marche qui repond l'emporte :
      1. une fenetre ouverte -> son reglage (`arret` ou `eco` ; `rien` ne
         repond pas) - et seulement si elle BAISSE vraiment : la fenetre ne
         rechauffe jamais ce que les marches suivantes laissent plus froid, et
         a mode egal elle se tait. Une fenetre qui ne coupe rien n'est pas une
         source : en Ete, ou sur un planning deja a l'Arret, l'ecran dirait
         sinon "fenetre ouverte" tout le temps qu'elle reste ouverte ;
      2. une reprise en main en cours -> son mode (None : "comme la personne
         l'a laisse") ;
      3. le mode de la maison -> Ete : arret ; Vacances : son reglage ;
         Absence : son reglage, pour baisser seulement ;
      4. le planning -> le mode du creneau en cours.

    `reprise` : None, ou {"mode", "reste" (minutes, None = jusqu'a relance),
    "fin" ([jour, minute] murale, ou None)}. Une `fin` illisible vaut None.
    Rend {"mode", "source", "fin", "puis"} : `fin` [jour, minute] et `puis`
    disent "jusqu'a 23:00, puis Eco" quand on les connait."""
    if reprise_active(reprise):
        mode = reprise.get("mode")
        mode = mode if mode in MODES else None
        fin = _fin_lisible(reprise.get("fin"))
        puis = _maison_ou_planning(semaine, maison, fin[0], fin[1])["mode"] if fin else None
        sans_fenetre = {"mode": mode, "source": "main", "fin": fin, "puis": puis}
    else:
        sans_fenetre = _maison_ou_planning(semaine, maison, jour, minute)
    if fenetre and reglage_fenetre in ("arret", "eco"):
        if sans_fenetre["mode"] is None or FROID.index(reglage_fenetre) < FROID.index(sans_fenetre["mode"]):
            return {"mode": reglage_fenetre, "source": "fenetre", "fin": None, "puis": None}
    return sans_fenetre
