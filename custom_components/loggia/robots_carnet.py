"""Le carnet des passages des robots, ce qui se calcule (chantier IoT, I3 A ; spec 9).

Pourquoi ce module existe
─────────────────────────
Home Assistant ne sait pas quelles pieces un robot nettoie, ni pourquoi il s'est arrete : l'historique d'un
aspirateur ne dit que travail, pause, retour, base, et aucune de ses integrations ne publie les pieces en cours.
La maquette ecrit pourtant « Nettoie · Salon, Cuisine » sur la carte, et « Salon · Cuisine » et « Bloque sous le
canape » dans l'Historique. Le carnet le tient ICI, pour tous les ecrans — celui qui a lance le passage comme les
autres :

  * une SESSION s'ouvre quand le robot se met au travail ; elle prend les pieces, la source (« loggia » pour un
    geste de l'ecran, « planning » pour un depart planifie) et le compte d'un DEPART demande dans les deux minutes
    (`noter_demande`) ; sans demande, sa source est « appareil » — un depart de l'application du fabricant, dont
    les pieces ne se savent pas ;
  * seul le TRAVAIL se compte : la pause et le retour non, et un robot muet ne ferme rien ;
  * elle se ferme a la base (« termine »), en erreur (« erreur ») ou arretee ailleurs (« interrompu ») ; moins
    d'une minute de travail est un faux depart, qui ne se garde pas ;
  * la surface est le maximum que son capteur publie pendant le passage, le motif une erreur NEUVE publiee pendant
    lui (`voir_erreur`, passe bis du 18/10, point 3) ;
  * Home Assistant qui s'arrete en plein passage (`voir_arret`, point 5) : le travail s'arrete a l'instant de la
    coupure, et le temps qu'elle dure ne se compte pas ;
  * un depart par un script maison (point A) donne au passage le nom du script (`libelle`) ;
  * quatorze jours, deux cents passages au plus.

Pur : ni Home Assistant ni l'heure — elles entrent en arguments, en secondes. Chaque fonction rend un carnet NEUF
et ne touche pas a celui qu'on lui donne. `robots.py` fait le temps reel : l'ecoute, le disque, les commandes.
"""
from __future__ import annotations

import copy
import datetime as dt
import math
import re
from typing import Any

VERSION = 1
# Un depart demande vaut pour le passage qui commence dans les deux minutes.
DEMANDE_S = 120
# Quatorze jours, deux cents passages au plus.
GARDE_S = 14 * 86400
MAX_PASSAGES = 200
# Moins d'une minute de travail : un faux depart.
FAUX_DEPART_S = 60
# Une session que plus rien ne ferme — le robot ne repond plus — se clot au bout d'un jour.
SESSION_MAX_S = 86400
MAX_ZONES = 30
ISSUES = ("termine", "interrompu", "erreur")
SOURCES = ("loggia", "planning", "appareil")
PHASES = ("travail", "pause", "retour")
ROBOT = re.compile(r"^(vacuum|lawn_mower)\.[a-z0-9_]+$")
# Ce qu'un capteur d'erreur publie quand tout va bien : ce n'est pas un motif.
SANS_ERREUR = {"", "none", "null", "0", "ok", "no_error", "noerror", "no error", "normal", "idle"}
# Ce qu'un capteur publie quand il ne dit RIEN — une coupure Bluetooth, un redemarrage (passe bis du 18/10, point 3) : ni
# une erreur, ni la fin d'une erreur ; l'ancien texte qui revient apres n'est pas une erreur neuve.
MUETS = {"unavailable", "unknown"}
# Une erreur publiee juste apres l'arret du robot — l'etat « erreur » et le capteur ne se suivent pas toujours dans le
# meme ordre — est le motif du passage qu'il vient de clore, une minute au plus apres lui.
RETARD_MOTIF_S = 60
FERMETURES = {"base": "termine", "erreur": "erreur", "repos": "interrompu"}


def carnet_vide() -> dict[str, Any]:
    return {"version": VERSION, "passages": [], "en_cours": {}, "demandes": {}, "erreurs": {}}


def _nombre(v: Any) -> float | None:
    if isinstance(v, bool):
        return None
    try:
        n = float(v)
    except (TypeError, ValueError):
        return None
    return n if math.isfinite(n) else None


def _zones(brut: Any) -> list[dict[str, str]]:
    """Les zones d'un depart : `[{id, nom}]` — les noms se disent, les identifiants relient aux puces de la popup.
    Les segments ne se gardent pas : ils ne servent qu'a la commande, deja partie."""
    if not isinstance(brut, list):
        return []
    out = []
    for z in brut[:MAX_ZONES]:
        if isinstance(z, dict) and isinstance(z.get("id"), str) and z["id"].strip():
            nom = z.get("nom")
            out.append({"id": z["id"][:80], "nom": (nom if isinstance(nom, str) and nom.strip() else z["id"])[:60]})
    return out


def _texte(v: Any) -> str | None:
    return v[:120] if isinstance(v, str) and v.strip() else None


def _passage(brut: Any) -> dict[str, Any] | None:
    """Un passage relu : sans robot, sans heures ou sans issue lisibles, il s'ecarte ; un champ secondaire
    illisible reprend sa valeur vide."""
    if not isinstance(brut, dict) or not isinstance(brut.get("robot"), str) or not ROBOT.match(brut["robot"]):
        return None
    debut, fin, duree = _nombre(brut.get("debut")), _nombre(brut.get("fin")), _nombre(brut.get("duree_s"))
    if debut is None or fin is None or duree is None or fin < debut or duree < 0 or brut.get("issue") not in ISSUES:
        return None
    surface = _nombre(brut.get("surface"))
    return {"robot": brut["robot"], "debut": debut, "fin": fin, "duree_s": duree, "issue": brut["issue"],
            "zones": _zones(brut.get("zones")), "tout": bool(brut.get("tout")),
            "source": brut.get("source") if brut.get("source") in SOURCES else "appareil",
            "par": _texte(brut.get("par")), "surface": surface if surface is not None and surface >= 0 else None,
            "motif": _texte(brut.get("motif")), "libelle": _texte(brut.get("libelle"))}


def _session(brut: Any) -> dict[str, Any] | None:
    if not isinstance(brut, dict):
        return None
    debut, depuis, travail = _nombre(brut.get("debut")), _nombre(brut.get("depuis")), _nombre(brut.get("travail_s"))
    if debut is None or brut.get("phase") not in PHASES:
        return None
    surface = _nombre(brut.get("surface"))
    return {"debut": debut, "depuis": depuis if depuis is not None else debut, "phase": brut["phase"],
            "travail_s": travail if travail is not None and travail >= 0 else 0,
            "zones": _zones(brut.get("zones")), "tout": bool(brut.get("tout")),
            "source": brut.get("source") if brut.get("source") in SOURCES else "appareil",
            "par": _texte(brut.get("par")), "surface": surface if surface is not None and surface >= 0 else None,
            "motif": _texte(brut.get("motif")), "libelle": _texte(brut.get("libelle")), "coupure": _nombre(brut.get("coupure"))}


def _demande(brut: Any) -> dict[str, Any] | None:
    if not isinstance(brut, dict) or _nombre(brut.get("t")) is None or brut.get("source") not in SOURCES:
        return None
    return {"t": _nombre(brut["t"]), "zones": _zones(brut.get("zones")), "tout": bool(brut.get("tout")),
            "source": brut["source"], "par": _texte(brut.get("par")), "libelle": _texte(brut.get("libelle"))}


def _par_robot(brut: Any, lire) -> dict[str, Any]:
    out = {}
    for robot, v in (brut.items() if isinstance(brut, dict) else []):
        propre = lire(v) if isinstance(robot, str) and ROBOT.match(robot) else None
        if propre is not None:
            out[robot] = propre
    return out


def _erreur(brut: Any) -> dict[str, Any] | None:
    if not isinstance(brut, dict) or _texte(brut.get("texte")) is None or _nombre(brut.get("t")) is None:
        return None
    return {"texte": _texte(brut["texte"]), "t": _nombre(brut["t"]), "date": _nombre(brut.get("date"))}


def lire_carnet(brut: Any, maintenant: float) -> dict[str, Any]:
    """Le carnet du disque, relu propre : ce qui est illisible s'ecarte — un fichier abime ne vaut pas qu'on
    cesse de noter —, puis l'elagage."""
    c = carnet_vide()
    if not isinstance(brut, dict):
        return c
    c["passages"] = [p for p in map(_passage, brut.get("passages") if isinstance(brut.get("passages"), list) else []) if p]
    c["en_cours"] = _par_robot(brut.get("en_cours"), _session)
    c["demandes"] = _par_robot(brut.get("demandes"), _demande)
    c["erreurs"] = _par_robot(brut.get("erreurs"), _erreur)
    return elaguer(c, maintenant)


def noter_demande(carnet: dict[str, Any], robot: str, zones: Any, *, tout: bool, source: str, par: str | None,
                  quand: float, libelle: str | None = None) -> dict[str, Any]:
    """Un depart demande par Loggia — un geste de l'ecran (`loggia`) ou le planning (`planning`) : le passage qui
    commence dans les DEMANDE_S secondes le prendra. `libelle` : le nom du script maison qui le lance (point A)."""
    c = copy.deepcopy(carnet)
    c["demandes"][robot] = {"t": float(quand), "zones": _zones(zones), "tout": bool(tout),
                            "source": source if source in SOURCES else "appareil", "par": _texte(par), "libelle": _texte(libelle)}
    return c


def _clore(c: dict[str, Any], robot: str, quand: float, issue: str) -> None:
    s = c["en_cours"].pop(robot, None)
    if s is None:
        return
    if s["phase"] == "travail":
        s["travail_s"] += max(0.0, quand - s["depuis"])
    if s["travail_s"] < FAUX_DEPART_S:
        return
    c["passages"].append({"robot": robot, "debut": s["debut"], "fin": float(quand), "duree_s": s["travail_s"], "issue": issue,
                          "zones": s["zones"], "tout": s["tout"], "source": s["source"], "par": s["par"],
                          "surface": s["surface"], "motif": s["motif"], "libelle": s.get("libelle")})


def voir_phase(carnet: dict[str, Any], robot: str, phase: str, quand: float) -> dict[str, Any]:
    """Une phase du robot (`phase` de robots.py), a l'instant `quand` : la session s'ouvre, compte son travail,
    se ferme. Une session qui a traverse un arret de Home Assistant (`coupure`, `voir_arret`) ne compte pas le temps
    de la coupure : revue au travail, en pause ou au retour, elle repart de l'instant ou elle est revue ; revue a la
    base, en erreur ou a l'arret, elle se clot a l'instant de la coupure — ce qu'on sait de sa fin."""
    c = copy.deepcopy(carnet)
    s = c["en_cours"].get(robot)
    if s is not None and s.get("coupure") is not None and phase != "absent":
        coupure = s.pop("coupure")
        if phase in FERMETURES:
            _clore(c, robot, coupure, FERMETURES[phase])
            return elaguer(c, quand)
        s["phase"], s["depuis"] = phase if phase in PHASES else s["phase"], float(quand)
        return elaguer(c, quand)
    if phase == "travail":
        if s is None:
            d = c["demandes"].pop(robot, None)
            if d is not None and not (0 <= quand - d["t"] <= DEMANDE_S):
                d = None
            c["en_cours"][robot] = {"debut": float(quand), "depuis": float(quand), "phase": "travail", "travail_s": 0,
                                    "zones": d["zones"] if d else [], "tout": d["tout"] if d else False,
                                    "source": d["source"] if d else "appareil", "par": d["par"] if d else None,
                                    "surface": None, "motif": None, "libelle": d.get("libelle") if d else None, "coupure": None}
        elif s["phase"] != "travail":
            s["phase"], s["depuis"] = "travail", float(quand)
    elif phase in ("pause", "retour"):
        if s is not None:
            if s["phase"] == "travail":
                s["travail_s"] += max(0.0, quand - s["depuis"])
            s["phase"], s["depuis"] = phase, float(quand)
    elif phase in FERMETURES:
        _clore(c, robot, quand, FERMETURES[phase])
    # `absent` : le robot ne repond plus — il travaille peut-etre encore ; rien ne se ferme.
    return elaguer(c, quand)


def voir_arret(carnet: dict[str, Any], quand: float) -> dict[str, Any]:
    """L'arret de Home Assistant (passe bis du 18/10, point 5) : chaque session en cours note l'instant de la coupure, et son
    travail s'arrete la. Ce qui se passe pendant la coupure ne se sait pas : au retour, `voir_phase` n'en compte rien."""
    c = copy.deepcopy(carnet)
    for s in c["en_cours"].values():
        if s["phase"] == "travail":
            s["travail_s"] += max(0.0, quand - s["depuis"])
            s["depuis"] = float(quand)
        s["coupure"] = float(quand)
    return c


def voir_surface(carnet: dict[str, Any], robot: str, valeur: Any) -> dict[str, Any]:
    """La surface que publie son capteur, pendant un passage : le maximum. Hors passage, rien."""
    n = _nombre(valeur)
    if robot not in carnet["en_cours"] or n is None or n < 0:
        return carnet
    c = copy.deepcopy(carnet)
    s = c["en_cours"][robot]
    s["surface"] = n if s["surface"] is None else max(s["surface"], n)
    return c


def texte_erreur(valeur: Any, attributs: Any = None) -> str | None:
    """Ce que dit le capteur d'erreur d'un robot (passe bis du 18/10, point 3) : None quand il ne dit RIEN (muet, inconnu),
    une chaine vide quand tout va bien, sinon le texte — jamais un code nu. L'integration officielle Ecovacs publie un CODE
    en etat (0 : tout va bien) et son texte dans l'attribut `description` ; d'autres, comme Mammotion, le texte en etat."""
    s = str(valeur).strip() if valeur is not None else ""
    if valeur is None or s.lower() in MUETS:
        return None
    if re.fullmatch(r"-?\d+", s):
        if int(s) == 0:
            return ""
        d = (attributs or {}).get("description") if isinstance(attributs, dict) else None
        d = d.strip() if isinstance(d, str) else ""
        return d[:120] if d and d.lower() not in SANS_ERREUR else None
    return "" if s.lower() in SANS_ERREUR else s[:120]


def instant(valeur: Any) -> float | None:
    """Un horodatage de Home Assistant (« 2026-10-17T10:20:00+00:00 ») en secondes ; None s'il ne se lit pas."""
    if not isinstance(valeur, str) or valeur.strip().lower() in MUETS:
        return None
    try:
        d = dt.datetime.fromisoformat(valeur.strip().replace("Z", "+00:00"))
    except ValueError:
        return None
    if d.tzinfo is None:
        d = d.replace(tzinfo=dt.timezone.utc)
    return d.timestamp()


def voir_erreur(carnet: dict[str, Any], robot: str, texte: Any, quand: float, *, heure: float | None = None,
                relue: bool = False) -> dict[str, Any]:
    """Ce que publie le capteur d'erreur du robot (`texte_erreur`), a l'instant `quand` (passe bis du 18/10, point 3) :
      * muet (None, « unavailable », « unknown ») : rien — ni une erreur, ni la fin d'une erreur ;
      * « tout va bien » (`SANS_ERREUR`) : la derniere connue s'efface ;
      * le MEME texte que la derniere connue (et, si l'appareil date ses erreurs, la meme heure — ou pas d'heure du tout : la date
        connue reste, passe bis 2 du 18/10, point A) : rien — une « derniere erreur » qui persiste, ou qui revient apres une
        coupure, n'est pas une erreur neuve ;
      * une erreur neuve devient la derniere connue, et le motif du passage en cours — sauf relue au demarrage de Home
        Assistant (`relue`), ou datee (`heure`) d'avant le debut du passage. Publiee juste apres l'arret du robot, une
        minute au plus, c'est le motif du passage qu'il vient de clore, s'il n'en a pas.
    Rend le carnet donne, tel quel, quand rien ne change."""
    if texte is None or (isinstance(texte, str) and texte.strip().lower() in MUETS):
        return carnet
    t = texte.strip()[:120] if isinstance(texte, str) else ""
    if t.lower() in SANS_ERREUR:
        if robot not in carnet["erreurs"]:
            return carnet
        c = copy.deepcopy(carnet)
        c["erreurs"].pop(robot, None)
        return c
    date = float(heure) if heure is not None else None
    connue = carnet["erreurs"].get(robot)
    # Le meme texte n'est pas une erreur neuve : a la meme heure, ou SANS heure — une erreur datee relue sans la sienne garde la date
    # connue (passe bis 2 du 18/10, point A). Le meme texte a une heure neuve, lui, en est une.
    if connue is not None and connue.get("texte") == t and (date is None or connue.get("date") == date):
        return carnet
    c = copy.deepcopy(carnet)
    c["erreurs"][robot] = {"texte": t, "t": float(quand), "date": date}
    if relue:
        return c
    repere = date if date is not None else float(quand)
    s = c["en_cours"].get(robot)
    if s is not None:
        if date is None or date >= s["debut"]:
            s["motif"] = t
        return c
    for p in reversed(c["passages"]):
        if p["robot"] != robot:
            continue
        if (p["issue"] in ("erreur", "interrompu") and p.get("motif") is None
                and p["debut"] <= repere <= p["fin"] + RETARD_MOTIF_S):
            p["motif"] = t
        break
    return c


def elaguer(carnet: dict[str, Any], maintenant: float) -> dict[str, Any]:
    """Quatorze jours, deux cents passages au plus — les plus recents ; une demande de plus de deux minutes ne sert
    plus ; une session que plus rien n'a fermee en un jour se clot, interrompue, a sa derniere phase."""
    c = copy.deepcopy(carnet)
    for robot, s in list(c["en_cours"].items()):
        if maintenant - s["debut"] > SESSION_MAX_S:
            _clore(c, robot, s["depuis"], "interrompu")
    c["passages"] = sorted((p for p in c["passages"] if p["fin"] >= maintenant - GARDE_S), key=lambda p: p["fin"])[-MAX_PASSAGES:]
    c["demandes"] = {r: d for r, d in c["demandes"].items() if 0 <= maintenant - d["t"] <= DEMANDE_S}
    return c


def vue(carnet: dict[str, Any], maintenant: float, lecture=None) -> dict[str, Any]:
    """Ce que `loggia/robots/etat` rend du carnet, pour ce que le compte peut LIRE (`lecture`, None : tout) :
    `passages` (le plus recent d'abord), `en_cours` et `erreurs` par robot. Le compte qui a lance ne sort pas du
    serveur."""
    lu = (lambda r: True) if lecture is None else lecture
    passages = [{"robot": p["robot"], "debut": p["debut"], "fin": p["fin"], "duree_min": int(round(p["duree_s"] / 60)),
                 "issue": p["issue"], "zones": p["zones"], "tout": p["tout"], "source": p["source"],
                 "surface": p["surface"], "motif": p["motif"], "libelle": p.get("libelle")}
                for p in sorted(carnet["passages"], key=lambda p: p["fin"], reverse=True) if lu(p["robot"])]
    en_cours = {}
    for robot, s in carnet["en_cours"].items():
        if not lu(robot):
            continue
        travail = s["travail_s"] + (max(0.0, maintenant - s["depuis"]) if s["phase"] == "travail" and s.get("coupure") is None else 0)
        en_cours[robot] = {"debut": s["debut"], "phase": s["phase"], "duree_min": int(round(travail / 60)), "zones": s["zones"],
                           "tout": s["tout"], "source": s["source"], "surface": s["surface"], "libelle": s.get("libelle")}
    erreurs = {r: dict(e) for r, e in carnet["erreurs"].items() if lu(r)}
    return {"passages": passages, "en_cours": en_cours, "erreurs": erreurs}
