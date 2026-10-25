"""Le planning des volets, sans Home Assistant (chantier Volets, spec 6.2).

Une seule question : quand ce volet bougera-t-il ? Elle se pose sur les heures
du soleil que le serveur a deja lues (`soleil_jours` de l'etat) : des instants
ISO a l'heure de la maison, a la seconde, avec leur decalage
("2026-10-12T07:47:12+02:00"). Ce fichier ne lit ni le soleil ni l'horloge :
c'est ce qui le rend testable seul.

Il dit ce que fait le moteur (`volets.py`) TEL QU'IL EST :
  - le planning coupe, ou un mode qui ne bouge pas dans ce sens (« nuit » ne
    garde que les fermetures, « manuel » rien) : rien (`planning_agit`) ;
  - un volet `exclu` : jamais (`groupes_horaires`) ;
  - les jours propres d'un volet « Heures a lui » pour ce sens REMPLACENT ceux
    de la maison - vide, la liste veut dire jamais ; sans eux, ou sans « Heures
    a lui », ceux de la maison : absente, tous les jours ; vide, aucun (19/10)
    (`volets_du_jour`, V5) ;
  - le decalage propre du volet s'il en porte un pour ce sens, meme sans
    `perso` (`groupes_horaires`) ; sinon celui de la maison.
Le jour qui compte est celui de l'HEURE du mouvement, a l'horloge de la maison :
le moteur le lit quand la cloche sonne, et un coucher +240 min peut sonner le
lendemain.

Son jumeau, cote ecran, est `src/voletsplanning.js` : memes fonctions, memes
resultats, tenus d'accord par `tests/fixtures/volets_parite.json`, lue par les
deux suites. `tests/python/test_volets.py` (« Le calcul suit le moteur ») le
tient d'accord avec le moteur lui-meme.

Les deux langues lisent de la meme facon ce que l'ecran ecrit : des entiers,
des chaines de chiffres ASCII. Une valeur que l'ecran n'ecrit jamais (des
chiffres d'une autre ecriture, « 1_0 ») est ecartee ici, la ou le moteur la
lirait peut-etre.

Il porte aussi `cible_de`, la position que vise un ordre de volet : la
verification du moteur s'en sert (ADR 0007), et le socle la note au journal
sur tout ordre de volet (`regles.agir`, spec 6.4). Elle n'a pas de jumeau :
l'ecran la lit dans le journal.
"""
from __future__ import annotations

import math
import re
from datetime import date, datetime, timedelta, timezone
from typing import Any

# Les deux sens du planning, et l'evenement du soleil dont chacun part.
SENS = ("ouverture", "fermeture")
SOURCES = {"ouverture": "lever", "fermeture": "coucher"}
# Les trois positions du mode de la maison (volets.py, `MODES`).
MODES = ("auto", "nuit", "manuel")
# Ce que l'etat publie : sept jours devant soi, deux mouvements par jour au plus.
HORIZON_S = 7 * 24 * 3600
A_VENIR_MAX = 14

# Un instant tel que le serveur l'ecrit : a la seconde, avec son decalage,
# jamais « Z » ni fraction. Chiffres ASCII seulement.
INSTANT = re.compile(r"([1-9][0-9]{3})-([0-9]{2})-([0-9]{2})"
                     r"T([0-9]{2}):([0-9]{2}):([0-9]{2})([+-])([0-9]{2}):([0-9]{2})")
DATE = re.compile(r"([1-9][0-9]{3})-([0-9]{2})-([0-9]{2})")
# Un entier en chiffres ASCII ; seuls l'espace, la tabulation et les fins de
# ligne sont admis autour, DANS le motif (comme les heures du chauffage). Neuf
# chiffres au plus, comme le jumeau : au-dela de 4 300, `int()` leve, et le
# JavaScript rend Infinity bien avant ; aucun decalage ni aucun jour n'en a besoin.
ENTIER = re.compile(r"[ \t\r\n]*([+-]?[0-9]{1,9})[ \t\r\n]*")


# ── Lire ce que le serveur et l'ecran ecrivent ─────────────────────────────

def lire_instant(texte: Any) -> datetime | None:
    """« 2026-10-12T07:47:12+02:00 » -> un datetime qui garde son decalage ;
    None si ce n'est pas un instant ecrit comme le serveur l'ecrit."""
    if not isinstance(texte, str):
        return None
    m = INSTANT.fullmatch(texte)
    if not m:
        return None
    a, mo, j, h, mi, s, signe, dh, dm = m.groups()
    if int(dh) > 23 or int(dm) > 59:
        return None
    decalage = timedelta(hours=int(dh), minutes=int(dm))
    try:
        return datetime(int(a), int(mo), int(j), int(h), int(mi), int(s),
                        tzinfo=timezone(-decalage if signe == "-" else decalage))
    except ValueError:
        return None


def ecrire_instant(instant: datetime) -> str:
    """Un instant comme le serveur l'ecrit : a la seconde, avec son decalage."""
    return instant.replace(microsecond=0).isoformat()


def epoque(texte: Any) -> int | None:
    """L'instant, en secondes depuis le 1er janvier 1970 ; None s'il est illisible."""
    lu = lire_instant(texte)
    return int(lu.timestamp()) if lu is not None else None


def lire_date(texte: Any) -> date | None:
    """« 2026-10-12 » -> une date ; None si elle est illisible ou n'existe pas."""
    if not isinstance(texte, str):
        return None
    m = DATE.fullmatch(texte)
    if not m:
        return None
    try:
        return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    except ValueError:
        return None


def entier(valeur: Any) -> int | None:
    """Un entier comme l'ecran l'ecrit : un nombre (tronque), un booleen, ou des
    chiffres ASCII - neuf au plus - avec des blancs autour. Le reste : None."""
    if isinstance(valeur, bool):
        return int(valeur)
    if isinstance(valeur, int):
        return valeur
    if isinstance(valeur, float):
        return int(valeur) if math.isfinite(valeur) else None
    if isinstance(valeur, str):
        m = ENTIER.fullmatch(valeur)
        return int(m.group(1)) if m else None
    return None


def ajouter_minutes(texte: Any, minutes: int) -> datetime | None:
    """L'instant `texte` plus `minutes`, en gardant SON decalage - la meme
    arithmetique dans les deux langues. None s'il est illisible, ou hors des
    annees 1 a 9999."""
    lu = lire_instant(texte)
    if lu is None:
        return None
    try:
        return lu + timedelta(minutes=minutes)
    except OverflowError:
        return None


# ── Ce que la configuration dit d'un volet ─────────────────────────────────

def reglage_de(plan: Any, haid: str) -> dict | None:
    """Ce que la table `planning.volets` dit de ce volet : un dict, ou None."""
    par_volet = plan.get("volets") if isinstance(plan, dict) else None
    reglage = par_volet.get(haid) if isinstance(par_volet, dict) else None
    return reglage if isinstance(reglage, dict) else None


def regle_de(plan: Any, haid: str) -> str:
    """« jamais » (exclu), « perso » (ses propres heures : le drapeau, ou
    l'ancienne forme - un decalage propre sans drapeau -, que l'ecran lit deja
    ainsi), sinon « comme » (les autres)."""
    r = reglage_de(plan, haid)
    if r is None:
        return "comme"
    if r.get("exclu"):
        return "jamais"
    if r.get("perso") or r.get("ouverture") is not None or r.get("fermeture") is not None:
        return "perso"
    return "comme"


def mode_bouge(mode: Any, sens: str) -> bool:
    """Le mode de la maison bouge-t-il les volets dans ce sens ? « auto » :
    oui ; « nuit » : les fermetures seulement ; « manuel » : rien. Un mode
    inconnu vaut « auto » (volets.py, `planning_agit`)."""
    m = mode.lower() if isinstance(mode, str) and mode else "auto"
    if m not in MODES:
        m = "auto"
    if m == "manuel":
        return False
    if m == "nuit":
        return sens == "fermeture"
    return True


def jour_de_la_maison(plan: Any, jour: int) -> bool:
    """Les jours de la maison (`jour_actif`) : absents, tous les jours ; une
    liste vide, aucun (19/10, comme Parametres et les jours propres) ; sinon le
    jour (lundi = 0) doit y etre."""
    jours = plan.get("jours") if isinstance(plan, dict) else None
    if not isinstance(jours, list):
        return True
    return jour in jours


def jours_propres(plan: Any, haid: str, sens: str) -> set[int] | None:
    """Les jours propres de ce volet pour ce sens (`jours_ouverture`,
    `jours_fermeture`), ou None s'il n'en porte pas. Vide : jamais."""
    r = reglage_de(plan, haid)
    liste = r.get("jours_" + sens) if r is not None else None
    if not isinstance(liste, list):
        return None
    return {n for n in (entier(j) for j in liste) if n is not None}


def bouge(plan: Any, haid: str, sens: str, jour: int) -> bool:
    """Le moteur commande-t-il ce volet dans ce sens le jour `jour` (0 = lundi :
    le jour de l'HEURE du mouvement, a l'horloge de la maison) ?"""
    if not isinstance(plan, dict) or not plan.get("actif"):
        return False
    regle = regle_de(plan, haid)
    if not mode_bouge(plan.get("mode"), sens) or regle == "jamais":
        return False
    propres = jours_propres(plan, haid, sens) if regle == "perso" else None
    if propres is not None:
        return jour in propres
    return jour_de_la_maison(plan, jour)


def decalage_de(plan: Any, haid: str, sens: str) -> int:
    """Le decalage du mouvement, en minutes : celui du volet s'il en porte un
    pour ce sens (meme sans `perso`), sinon celui de la maison, sinon 0."""
    r = reglage_de(plan, haid)
    brut = r.get(sens) if r is not None else None
    propre = entier(brut) if brut not in (None, "") else None
    if propre is not None:
        return propre
    section = plan.get(sens) if isinstance(plan, dict) else None
    general = entier(section.get("decalage")) if isinstance(section, dict) else None
    return general if general is not None else 0


def cible_de(service: str, extra=None):
    """Ou un ordre veut mener le volet : 100 ouvert, 0 ferme, la position
    demandee - ou None quand l'ordre ne vise aucune position (stop). La
    verification des volets s'en sert (ADR 0007), et le socle la note au
    journal sur tout ordre de volet (`regles.agir`, spec 6.4)."""
    if service == "open_cover":
        return 100
    if service == "close_cover":
        return 0
    if service == "set_cover_position":
        try:
            return int((extra or {}).get("position"))
        except (TypeError, ValueError):
            return None
    return None


# ── Les mouvements ─────────────────────────────────────────────────────────

def soleil_par_date(soleil_jours: Any) -> dict[str, dict]:
    """Les jours de soleil par date (« AAAA-MM-JJ »). Une date illisible est
    ecartee ; une date en double garde la DERNIERE entree."""
    table: dict[str, dict] = {}
    if not isinstance(soleil_jours, list):
        return table
    for jour in soleil_jours:
        if isinstance(jour, dict) and lire_date(jour.get("date")) is not None:
            table[jour["date"]] = jour
    return table


def _mouvement(plan: Any, haid: str, jour_soleil: Any, sens: str) -> tuple[datetime, dict] | None:
    """Le mouvement de ce volet, ce jour de soleil, dans ce sens - ou None.
    Rend l'instant et {"sens", "heure", "source", "decalage"}."""
    if not isinstance(jour_soleil, dict):
        return None
    decalage = decalage_de(plan, haid, sens)
    quand = ajouter_minutes(jour_soleil.get(SOURCES[sens]), decalage)
    if quand is None or not bouge(plan, haid, sens, quand.weekday()):
        return None
    return quand, {"sens": sens, "heure": ecrire_instant(quand), "source": SOURCES[sens],
                   "decalage": decalage}


def a_venir(plan: Any, haid: str, soleil_jours: Any, maintenant: Any) -> list[dict]:
    """Les mouvements de ce volet strictement APRES `maintenant` (ISO) et dans
    les sept jours, du plus proche au plus lointain : A_VENIR_MAX au plus.
    `maintenant` illisible : aucun."""
    t0 = epoque(maintenant)
    if t0 is None:
        return []
    trouves = []
    for jour_soleil in soleil_par_date(soleil_jours).values():
        for rang, sens in enumerate(SENS):
            lu = _mouvement(plan, haid, jour_soleil, sens)
            if lu is None:
                continue
            t = int(lu[0].timestamp())
            if t0 < t <= t0 + HORIZON_S:
                trouves.append((t, rang, lu[1]))
    trouves.sort(key=lambda x: (x[0], x[1]))
    return [m for _, _, m in trouves[:A_VENIR_MAX]]


def semaine(plan: Any, haid: str, soleil_jours: Any, lundi: Any) -> list[dict]:
    """Les sept jours a partir de `lundi` (« AAAA-MM-JJ »), passes compris :
    {"date", "ouverture", "fermeture"}, chaque heure en « HH:MM » a l'horloge
    de la maison (tronquee a la minute), ou None. `lundi` illisible : []."""
    debut = lire_date(lundi)
    if debut is None:
        return []
    try:
        jours = [(debut + timedelta(days=i)).isoformat() for i in range(7)]
    except OverflowError:
        return []
    table = soleil_par_date(soleil_jours)
    lignes = []
    for jour in jours:
        ligne: dict[str, Any] = {"date": jour}
        for sens in SENS:
            lu = _mouvement(plan, haid, table.get(jour), sens)
            ligne[sens] = "%02d:%02d" % (lu[0].hour, lu[0].minute) if lu else None
        lignes.append(ligne)
    return lignes
