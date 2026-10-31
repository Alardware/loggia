"""La collecte des dechets, cote serveur : ou la lire, et ce qui a ete dit (30/10, G2 ; ADR 0301).

Le rappel de la veille au soir est une VEILLE (veilles.py) : il part a
l'heure reglee, ecran ferme, aux personnes a la maison. Ce module ne fait que
calculer — aucun appel a Home Assistant, rien qui parle au telephone :

  * OU lire le prochain ramassage. Un calendrier ou des capteurs, reconnus
    d'abord par leur PLATEFORME (Waste Collection Schedule, Afvalbeheer), puis
    par leur nom, sans accents, dans les sept langues de Loggia. La liste est
    celle de l'ecran (`MOTS_COLLECTE`, src/collecte.js) — un test les compare.
    Un capteur trouve par son nom doit en plus porter une date ou un nombre de
    jours : « Dechets tries, 12 kg » n'est pas un ramassage ;
  * QUOI passe demain : les evenements du calendrier ce jour-la, ou les
    capteurs dont le prochain passage tombe demain ;
  * QUAND : a l'heure reglee, ou au demarrage dans les trois heures qui
    suivent (l'idee d'Afvalbeheer) — jamais apres minuit, ou « demain » serait
    devenu aujourd'hui ;
  * ce qui a ete DIT et ce qui est SORTI, dans la partie commune du magasin
    (`loggia_collecte`) : le bouton du telephone et celui du bandeau y
    ecrivent, et tous les ecrans se taisent ensemble.
"""
from __future__ import annotations

import re
import unicodedata
from datetime import date, datetime, timedelta
from typing import Any

# La partie commune du magasin : tenue par le serveur, jamais exportee.
CLE_ETAT = "loggia_collecte"
HEURE_DEFAUT = "19:00"
# Le rattrapage au demarrage : trois heures apres l'heure, pas plus.
RATTRAPAGE_MIN = 180
PREFIXE_ACTION = "LOGGIA_COLLECTE_SORTI_"

# Les integrations de ramassage : leur plateforme suffit.
PLATEFORMES = ("waste_collection_schedule", "afvalbeheer")
# Les mots du ramassage, sans accents, dans les sept langues — ceux de l'ecran.
# Des MOTS ENTIERS (relecture du 30/10, point 6) : « Familie Muller »,
# « Tonte des bordures », « Collectif parents » ne sont pas des ramassages.
MOTS = ("collecte", "collectes", "collection", "collections", "ramassage", "ramassages", "poubelle", "poubelles",
        "ordure", "ordures", "dechet", "dechets", "waste", "abfall", "abfuhr", "mull", "muell",
        "mullkalender", "mulltermin", "mulltermine", "mulltonne", "mulltonnen",
        "inzameling", "inzamelingen", "ophaling", "ophalingen", "afval", "raccolta", "rifiuti", "rifiuto",
        "recogida", "recogidas", "residuos", "residuo", "basura", "basuras",
        "odpad", "odpady", "odpadow", "odpadu", "smieci", "wywoz", "wywozu")
# Les mots composes de l'allemand et du neerlandais : « Abfallkalender »,
# « Afvalkalender » commencent par le mot ; « Restmull », « Restafval », « Mullabfuhr »,
# « Mullabholung » finissent par lui (contre-relecture du 30/10).
DEBUTS = ("abfall", "abfuhr", "afval")
FINS = ("mull", "muell", "abfall", "afval", "abfuhr", "abholung")
CLES_JOURS = ("jours_restants", "daysTo", "days_to", "Days_until", "days_until", "days", "jours")
CLES_DATE = ("date", "next_date", "prochaine_date", "next_collection", "collection_date")
CLASSES_DATE = ("date", "timestamp")
MUETS = {"unavailable", "unknown", "none", ""}
_DATE_ISO = re.compile(r"^(\d{4})-(\d{2})-(\d{2})(?:[T ]|$)")


def sans_accents(texte: Any) -> str:
    """« Odbiór odpadów » -> « odbior odpadow », comme `sansAccents` (outils.js)."""
    s = unicodedata.normalize("NFD", "" if texte is None else str(texte))
    return "".join(c for c in s if not unicodedata.combining(c)).lower()


def mot_de_collecte(mot: str) -> bool:
    """Un mot, deja sans accents : un mot du ramassage, ou un compose qui en part ou y finit."""
    return mot in MOTS or mot.startswith(DEBUTS) or mot.endswith(FINS)


def nom_de_collecte(*noms: Any) -> bool:
    """Un de ces noms parle-t-il de ramassage ? Mot a mot, sans accents."""
    return any(mot_de_collecte(m) for n in noms if n for m in re.split(r"[^a-z0-9]+", sans_accents(n)) if m)


def date_de(v: Any) -> date | None:
    """Une date ISO, ou None. « 2026-10-31T06:00:00+01:00 » compte pour son jour."""
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    if not isinstance(v, str):
        return None
    m = _DATE_ISO.match(v.strip())
    if not m:
        return None
    try:
        return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    except ValueError:
        return None


def _nombre(v: Any) -> int | None:
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return int(v) if v == v and abs(v) != float("inf") else None
    if not isinstance(v, str):
        return None
    n = re.findall(r"-?\d+", v)
    return int(n[0]) if len(n) == 1 else None


def capteur_dit_une_date(state: Any, attrs: dict) -> bool:
    """Un capteur qui porte un jour de passage : sa classe, une cle connue, ou
    un etat qui EST une date."""
    return (attrs.get("device_class") in CLASSES_DATE
            or any(k in attrs for k in CLES_JOURS + CLES_DATE)
            or date_de(state) is not None)


def sources(entrees: list) -> dict[str, list[str]]:
    """`entrees` : (entity_id, nom, plateforme, attributs, etat) des calendriers
    et des capteurs. Rend {calendriers, capteurs, plateforme} : ceux reconnus a
    leur plateforme d'abord, puis a leur nom, chaque groupe dans l'ordre des
    identifiants ; `plateforme` nomme ceux que leur plateforme designe."""
    rangs: dict[str, list[tuple[int, str]]] = {"calendriers": [], "capteurs": []}
    for haid, nom, plateforme, attrs, state in entrees:
        if not isinstance(haid, str):
            continue
        attrs = attrs if isinstance(attrs, dict) else {}
        par_plateforme = plateforme in PLATEFORMES
        if haid.startswith("calendar."):
            if par_plateforme or nom_de_collecte(nom, haid.split(".", 1)[1]):
                rangs["calendriers"].append((0 if par_plateforme else 1, haid))
        elif haid.startswith("sensor."):
            if par_plateforme or (capteur_dit_une_date(state, attrs) and nom_de_collecte(nom, haid.split(".", 1)[1])):
                rangs["capteurs"].append((0 if par_plateforme else 1, haid))
    out: dict[str, list[str]] = {k: [h for _, h in sorted(v)] for k, v in rangs.items()}
    out["plateforme"] = sorted(h for v in rangs.values() for r, h in v if r == 0)
    return out


def source(trouve: dict[str, list[str]]) -> tuple[str | None, list[str]]:
    """(calendrier, capteurs) : la PLATEFORME d'abord — son calendrier, puis
    ses capteurs —, puis un calendrier reconnu a son nom, puis des capteurs
    (relecture du 30/10, point 6). La regle de `sourceCollecte` (collecte.js)."""
    plat = set(trouve.get("plateforme") or [])
    cals, caps = trouve.get("calendriers") or [], trouve.get("capteurs") or []
    for calendriers, capteurs in (([c for c in cals if c in plat], [c for c in caps if c in plat]),
                                  ([c for c in cals if c not in plat], [c for c in caps if c not in plat])):
        if calendriers:
            return calendriers[0], []
        if capteurs:
            return None, capteurs
    return None, []


def _liste(v: Any) -> list[str]:
    brut = v if isinstance(v, (list, tuple)) else (re.split(r"[,;]", v) if isinstance(v, str) else [])
    return [str(t).strip() for t in brut if str(t).strip()]


def lire_capteur(state: Any, attrs: dict, aujourd_hui: date) -> dict[str, Any] | None:
    """Le prochain passage d'UN capteur : {jours, date, types}, ou None.
    Le nombre de jours fait foi quand il existe ; sinon la date ; sinon l'etat."""
    attrs = attrs if isinstance(attrs, dict) else {}
    if str(state or "").strip().lower() in MUETS and not attrs:
        return None
    jours = None
    for k in CLES_JOURS:
        if k in attrs:
            jours = _nombre(attrs[k])
            if jours is not None:
                break
    quand = None
    for k in CLES_DATE:
        if k in attrs:
            quand = date_de(attrs[k])
            if quand is not None:
                break
    if quand is None:
        quand = date_de(state)
    if jours is None and quand is None:
        jours = _nombre(state)
    if jours is None and quand is not None:
        jours = (quand - aujourd_hui).days
    if jours is None:
        return None
    if quand is None:
        quand = aujourd_hui + timedelta(days=jours)
    types = _liste(attrs["types"] if "types" in attrs else attrs.get("type", attrs.get("waste_type")))
    return {"jours": jours, "date": quand, "types": types}


def types_des_capteurs(lus: list, jour: date) -> list[str]:
    """Ce qui passe CE jour-la d'apres des capteurs : les types que dit chaque
    capteur dont la date tombe ce jour, sinon son nom (un capteur par bac). Le
    passage d'aujourd'hui ne cache pas celui de demain (relecture du 30/10,
    point 3)."""
    types: list[str] = []
    for nom, lu in lus:
        if not isinstance(lu, dict) or lu.get("date") != jour:
            continue
        for t in lu.get("types") or ([str(nom)] if nom else []):
            if t not in types:
                types.append(t)
    return types


def types_du_jour(evenements: Any, jour: date) -> list[str]:
    """Les intitules des evenements qui COMMENCENT ce jour-la, chacun une fois."""
    out: list[str] = []
    for e in evenements if isinstance(evenements, list) else []:
        if not isinstance(e, dict):
            continue
        debut = e.get("start")
        if isinstance(debut, dict):
            debut = debut.get("date") or debut.get("dateTime")
        titre = str(e.get("summary") or "").strip()
        if titre and date_de(debut) == jour and titre not in out:
            out.append(titre)
    return out


def heure_de(v: Any) -> str | None:
    """« 7:05 » -> « 07:05 » ; None si ce n'est pas une heure."""
    m = re.fullmatch(r"\s*(\d{1,2}):(\d{2})\s*", v) if isinstance(v, str) else None
    if not m:
        return None
    h, mi = int(m.group(1)), int(m.group(2))
    return "%02d:%02d" % (h, mi) if h < 24 and mi < 60 else None


def dans_la_fenetre(maintenant: datetime, heure: Any) -> bool:
    """A l'heure reglee, ou dans les trois heures qui suivent — le meme soir."""
    hhmm = heure_de(heure) or HEURE_DEFAUT
    debut = int(hhmm[:2]) * 60 + int(hhmm[3:])
    t = maintenant.hour * 60 + maintenant.minute
    return debut <= t < min(debut + RATTRAPAGE_MIN, 24 * 60)


def date_iso(v: Any) -> str | None:
    """« 2026-10-31 », valide, ou None."""
    if not isinstance(v, str) or len(v) != 10:
        return None
    d = date_de(v)
    return d.isoformat() if d is not None else None


def action_sorti(cle: str) -> str:
    """L'identifiant du bouton « C'est sorti » : il porte le jour du ramassage."""
    return PREFIXE_ACTION + cle


def lire_action(action: Any) -> str | None:
    """Le jour d'un `mobile_app_notification_action` qui nous concerne, ou None."""
    if not isinstance(action, str) or not action.startswith(PREFIXE_ACTION):
        return None
    return date_iso(action[len(PREFIXE_ACTION):])


def etat_de(brut: Any) -> dict[str, str]:
    """Ce qui a ete dit (`rappele`) et ce qui est sorti (`sorti`) : un jour ISO, ou ''."""
    b = brut if isinstance(brut, dict) else {}
    return {"sorti": date_iso(b.get("sorti")) or "", "rappele": date_iso(b.get("rappele")) or ""}


def poser_sorti(brut: Any, cle: str, sorti: bool) -> dict[str, str]:
    """« C'est sorti » pour ce jour-la — ou le retirer, s'il etait ce jour-la."""
    e = etat_de(brut)
    if sorti:
        e["sorti"] = cle
    elif e["sorti"] == cle:
        e["sorti"] = ""
    return e


def poser_rappel(brut: Any, cle: str) -> dict[str, str]:
    """Le rappel de ce jour-la est parti : il ne repartira pas."""
    e = etat_de(brut)
    e["rappele"] = cle
    return e
