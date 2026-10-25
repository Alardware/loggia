"""La configuration du chauffage, et ce qu'il garde au redemarrage (chantier Chauffage, § 7).

Deux cles :

  loggia_chauffage        la configuration, dans la partie COMMUNE du magasin
                          (`store.py`), ecrite par les administrateurs — sauf
                          le mode de la maison, ouvert a tous (§ 8.3) ;
  loggia_chauffage_etat   l'etat vivant : les reprises en main. Un fichier A
                          PART dans `.storage`, comme le journal (`regles.py`,
                          CLE_JOURNAL) : il bouge a chaque geste, n'appartient a
                          personne, ne doit ni voyager avec la configuration
                          vers chaque ecran ni revenir d'un import.

Un chauffage se range sous son IDENTIFIANT STABLE — celui du registre, pas
l'`entity_id`, que l'utilisateur renomme. Disparu de Home Assistant, il garde
son planning (« introuvable », § 10).

Pur : ni Home Assistant ni horloge. Ce qui se CHARGE est relu avec indulgence
— l'illisible s'ecarte, un fichier abime ne doit pas tout eteindre. Ce qui
s'ECRIT est refuse au premier defaut, et le refus NOMME la cle (§ 7) : son
code, que l'ecran traduit, et la cle apres les deux-points (`refus.py`).

Deux garde-fous tiennent le moteur hors de portee d'un reglage qui le tromperait.
Une semaine sans AUCUN changement ne s'ecrit pas et, relue, redevient la semaine
type : le chauffage resterait dans son dernier mode apres une fenetre, une
Absence ou l'Ete. Et les trois consignes tiennent l'ordre du froid au chaud des
modes, hors_gel < eco <= confort : un Eco plus chaud que le Confort, ou qui
rejoint le Hors-gel, n'a pas de sens. Avec Confort -1 et -2 deduits sans jamais
passer sous l'Eco (`chauffage_familles.py`), une fenetre ou une Absence reglee
sur Eco ne releve alors jamais une piece.
"""
from __future__ import annotations

import copy
from datetime import datetime
from typing import Any

from .chauffage_calcul import FROID, JOURS, MAISON_DEFAUT, MAISONS, MODES, ecrire_heure, lire_heure
from .chauffage_familles import TEMPERATURES_DEFAUT
from .refus import RefusNomme

VERSION = 1
MAX_CHAUFFAGES = 32
MAX_CHANGEMENTS_JOUR = 12
TEMPERATURE_MIN = 5.0
TEMPERATURE_MAX = 30.0
FAMILLES = ("fil_pilote", "thermostat", "vtherm")
# Ce que la fenetre ouverte fait du chauffage ; « rien » le laisse au planning.
REGLAGES_FENETRE = ("arret", "eco", "rien")

# La semaine type du premier allumage (§ 9.3) : du lundi au vendredi Confort
# 06:30, Eco 08:30, Confort 18:00, Eco 22:30 ; le week-end Confort 08:00,
# Eco 22:30.
SEMAINE_OUVREE = (("06:30", "confort"), ("08:30", "eco"), ("18:00", "confort"), ("22:30", "eco"))
SEMAINE_REPOS = (("08:00", "confort"), ("22:30", "eco"))


def semaine_type() -> dict[str, list[dict[str, str]]]:
    """La semaine proposee au premier allumage d'un planning."""
    return {jour: [{"h": h, "mode": m} for h, m in (SEMAINE_REPOS if jour in ("sam", "dim") else SEMAINE_OUVREE)]
            for jour in JOURS}


def adapter_aux_modes(liste: Any, permis: Any) -> list[dict[str, Any]]:
    """Les changements d'un jour pour un chauffage qui ne comprend pas tous les
    modes : chaque mode qu'il ne comprend pas devient le plus proche qu'il
    comprend SANS etre plus chaud — on ne chauffe jamais plus par une
    adaptation —, a defaut le plus froid qu'il comprend. Les heures ne bougent
    pas. Sans aucun mode compris (`permis` vide, ou None : un chauffage que le
    serveur ne voit pas), rien a quoi s'adapter : les changements tels quels.

    Le jumeau de `adapterAuxModes` (src/chauffageplanning.js), tenu sur la meme
    regle par les deux suites. Pas `mode_applicable` : ses replis remontent
    parfois (le Hors-gel vers l'Eco), et le Confort n'en a aucun."""
    compris = [m for m in FROID if isinstance(permis, (list, tuple, set, frozenset)) and m in permis]
    sortie: list[dict[str, Any]] = []
    for c in liste if isinstance(liste, list) else ():
        if not isinstance(c, dict):
            continue
        mode = c.get("mode")
        if compris and mode not in compris:
            rang = FROID.index(mode) if mode in FROID else -1
            plus_froids = [m for m in compris if FROID.index(m) < rang]
            mode = plus_froids[-1] if plus_froids else compris[0]
        sortie.append({"h": c.get("h"), "mode": mode})
    return sortie


def semaine_adaptee(semaine: Any, permis: Any) -> dict[str, list[dict[str, Any]]]:
    """Une semaine entiere dans les modes d'un chauffage, jour par jour
    (`adapter_aux_modes`)."""
    brut = semaine if isinstance(semaine, dict) else {}
    return {jour: adapter_aux_modes(brut.get(jour), permis) for jour in JOURS}


def config_defaut() -> dict[str, Any]:
    """Une maison ou aucun planning ne tourne (D5 : eteint par defaut). Absence et
    Vacances prennent les reglages par defaut du calcul (`MAISON_DEFAUT`) : une
    seule source."""
    return {"version": VERSION, "chauffages": {},
            "maison": {"mode": "planning", "vacances_fin": None,
                       "absence": MAISON_DEFAUT["absence"], "vacances": MAISON_DEFAUT["vacances"],
                       # L'Absence posee par la PRESENCE (et non a la main) : apres un
                       # redemarrage, elle seule se leve au retour (audit du 19/10).
                       "par_presence": False},
            "simulation": {"actif": False}}


def chauffage_defaut(entite: str, fam: str, permis: Any = None) -> dict[str, Any]:
    """Un chauffage qu'on vient de reconnaitre : planning ETEINT, semaine type
    dans SES modes (`permis`, ceux que le moteur lui reconnait), temperatures
    par defaut, la fenetre qui coupe. La semaine type telle quelle donnerait
    l'Eco a un VTherm sans prereglage `eco` : il refuserait ensuite chaque
    modification de sa semaine, l'ecran la renvoyant entiere (relecture de la
    tache 9 du plan 2)."""
    return {"entite": entite, "famille": fam, "planning": False,
            "semaine": semaine_adaptee(semaine_type(), permis),
            "temperatures": dict(TEMPERATURES_DEFAUT), "fenetre": "arret"}


def lire_instant(texte: Any) -> datetime | None:
    """Un instant ISO AVEC son decalage, ou None : une heure sans fuseau ne dit
    pas quand elle tombe."""
    if not isinstance(texte, str) or not texte.strip():
        return None
    try:
        instant = datetime.fromisoformat(texte.strip().replace("Z", "+00:00"))
    except ValueError:
        return None
    return instant if instant.tzinfo is not None else None


def _cle_en_desordre(t: dict[str, float], touchees: Any = ()) -> str | None:
    """None si les trois consignes tiennent l'ordre du froid au chaud des modes
    (`FROID`) : hors_gel < eco <= confort. Un Eco plus chaud que le Confort, ou
    qui rejoint le Hors-gel, n'a pas de sens ; un petit abaissement (Eco 19 pour
    un Confort 20, courant sur une pompe a chaleur) reste permis. C'est cet ordre
    qui laisse `temperature_du_mode` tenir Eco <= Confort -2 <= Confort -1 <=
    Confort : une fenetre ou une Absence reglee sur Eco ne releve jamais une piece.

    Sinon, la cle a nommer : celle des deux consignes en cause que la personne
    vient de changer (`touchees`) ; les deux, ou aucune : Eco, que les deux
    regles ont en commun."""
    if t["hors_gel"] >= t["eco"]:
        en_cause = ("hors_gel", "eco")
    elif t["eco"] > t["confort"]:
        en_cause = ("eco", "confort")
    else:
        return None
    changees = [cle for cle in en_cause if cle in touchees]
    return changees[0] if len(changees) == 1 else "eco"


# ── Charger : l'illisible s'ecarte ──────────────────────────────────────────

def lire_semaine(brut: Any) -> dict[str, list[dict[str, str]]]:
    """Une semaine relue : les sept jours, chacun trie, l'illisible ecarte. Une
    semaine qui n'a plus aucun changement (vide, ou toute illisible) redevient la
    semaine type : sans changement, le chauffage resterait dans son dernier mode
    apres une fenetre, une Absence ou l'Ete, sans rien pour l'en sortir."""
    semaine: dict[str, list[dict[str, str]]] = {}
    for jour in JOURS:
        liste = brut.get(jour) if isinstance(brut, dict) else None
        vus: dict[int, str] = {}
        for c in liste if isinstance(liste, list) else ():
            minute = lire_heure(c.get("h")) if isinstance(c, dict) else None
            if minute is None or c.get("mode") not in MODES:
                continue
            vus[minute] = c["mode"]
        semaine[jour] = [{"h": ecrire_heure(m), "mode": vus[m]} for m in sorted(vus)][:MAX_CHANGEMENTS_JOUR]
    return semaine if any(semaine.values()) else semaine_type()


def lire_temperatures(brut: Any) -> dict[str, float]:
    """Les trois consignes en °C ; une valeur illisible reprend son defaut. Si le
    resultat ne tient pas l'ordre du froid au chaud (`_cle_en_desordre` :
    hors_gel < eco <= confort), les trois reprennent leur defaut : charger ne
    refuse jamais, et un reglage abime n'atteint pas le moteur."""
    t = dict(TEMPERATURES_DEFAUT)
    for cle in t:
        v = brut.get(cle) if isinstance(brut, dict) else None
        if isinstance(v, (int, float)) and not isinstance(v, bool) and TEMPERATURE_MIN <= v <= TEMPERATURE_MAX:
            t[cle] = float(v)
    return dict(TEMPERATURES_DEFAUT) if _cle_en_desordre(t) is not None else t


def lire_config(brut: Any) -> dict[str, Any]:
    """La configuration entiere, relue."""
    cfg = config_defaut()
    if not isinstance(brut, dict):
        return cfg
    chauffages = brut.get("chauffages")
    for cle, c in (chauffages.items() if isinstance(chauffages, dict) else ()):
        if len(cfg["chauffages"]) >= MAX_CHAUFFAGES:
            break
        if not isinstance(cle, str) or not cle or not isinstance(c, dict):
            continue
        if not isinstance(c.get("entite"), str) or c.get("famille") not in FAMILLES:
            continue
        cfg["chauffages"][cle] = {
            "entite": c["entite"], "famille": c["famille"], "planning": c.get("planning") is True,
            "semaine": lire_semaine(c.get("semaine")), "temperatures": lire_temperatures(c.get("temperatures")),
            "fenetre": c.get("fenetre") if c.get("fenetre") in REGLAGES_FENETRE else "arret"}
    maison = brut.get("maison") if isinstance(brut.get("maison"), dict) else {}
    if maison.get("mode") in MAISONS:
        cfg["maison"]["mode"] = maison["mode"]
    if cfg["maison"]["mode"] == "vacances" and lire_instant(maison.get("vacances_fin")):
        cfg["maison"]["vacances_fin"] = maison["vacances_fin"]
    cfg["maison"]["par_presence"] = cfg["maison"]["mode"] == "absence" and maison.get("par_presence") is True
    for cle in ("absence", "vacances"):
        if maison.get(cle) in MODES:
            cfg["maison"][cle] = maison[cle]
    simulation = brut.get("simulation")
    cfg["simulation"]["actif"] = isinstance(simulation, dict) and simulation.get("actif") is True
    return cfg


def lire_reprises(brut: Any, maintenant: datetime) -> dict[str, dict[str, Any]]:
    """Les reprises en main relues au demarrage. Une reprise ECHUE pendant la
    coupure est abandonnee : c'est le planning qui s'applique (§ 10)."""
    propres: dict[str, dict[str, Any]] = {}
    for cle, r in (brut.items() if isinstance(brut, dict) else ()):
        if not isinstance(cle, str) or not isinstance(r, dict):
            continue
        mode = r.get("mode") if r.get("mode") in MODES else None
        t = r.get("temperature")
        t = float(t) if isinstance(t, (int, float)) and not isinstance(t, bool) else None
        fin = lire_instant(r.get("fin")) if r.get("fin") is not None else None
        if r.get("fin") is not None and (fin is None or fin <= maintenant):
            continue
        depuis = lire_instant(r.get("depuis"))
        propres[cle] = {"mode": mode, "temperature": t, "fin": fin.isoformat() if fin else None,
                        "depuis": depuis.isoformat() if depuis else maintenant.isoformat(),
                        "par": r.get("par") if isinstance(r.get("par"), str) else None,
                        "programme": r.get("programme") is True}
    return propres


def nouvelle_reprise(mode: Any, temperature: Any, fin: datetime | None, maintenant: datetime,
                     par: Any = None, programme: bool = False) -> dict[str, Any]:
    """Une reprise en main, telle qu'elle se garde (§ 7). `programme` : le
    thermostat est revenu a SON programme (Tado, Netatmo) — on le laisse faire,
    rien ne lui est envoye jusqu'a la fin de la reprise (19/10)."""
    return {"mode": mode if mode in MODES else None,
            "temperature": float(temperature) if isinstance(temperature, (int, float)) else None,
            "fin": fin.isoformat() if fin else None, "depuis": maintenant.isoformat(),
            "par": par if isinstance(par, str) else None, "programme": programme is True}


# ── Ecrire : refuser en nommant ─────────────────────────────────────────────

def valider_semaine(brut: Any, permis: list[str] | None = None) -> dict[str, list[dict[str, str]]]:
    """La semaine que l'ecran envoie, ou un refus qui NOMME la cle :
    « heure illisible : jeu[2].h », « mode confort_1 inconnu de ce chauffage :
    jeu[2].mode », « plus de 12 changements ce jour : jeu ». Une semaine sans
    aucun changement est refusee aussi (`chauffage_semaine_vide`, cle `semaine`) :
    elle laisserait le chauffage dans son dernier mode."""
    if not isinstance(brut, dict):
        raise ValueError("semaine : un objet par jour")
    inconnus = sorted(str(k) for k in brut if k not in JOURS)
    if inconnus:
        raise ValueError("jour inconnu : %s" % ", ".join(inconnus))
    semaine: dict[str, list[dict[str, str]]] = {}
    for jour in JOURS:
        liste = brut.get(jour, [])
        if not isinstance(liste, list):
            raise ValueError("%s : une liste de changements" % jour)
        if len(liste) > MAX_CHANGEMENTS_JOUR:
            raise RefusNomme("chauffage_trop_de_changements",
                             "plus de %d changements ce jour" % MAX_CHANGEMENTS_JOUR, jour)
        vus: dict[int, str] = {}
        for i, c in enumerate(liste):
            if not isinstance(c, dict):
                raise ValueError("%s[%d] : un changement {h, mode}" % (jour, i))
            minute = lire_heure(c.get("h"))
            if minute is None:
                raise RefusNomme("chauffage_heure_illisible", "heure illisible", "%s[%d].h" % (jour, i))
            mode = c.get("mode")
            if mode not in MODES or (permis is not None and mode not in permis):
                raise RefusNomme("chauffage_mode_inconnu", "mode %s inconnu de ce chauffage" % (mode,),
                                 "%s[%d].mode" % (jour, i))
            if minute in vus:
                raise RefusNomme("chauffage_heure_en_double", "deux changements a la meme heure",
                                 "%s[%d].h" % (jour, i))
            vus[minute] = mode
        semaine[jour] = [{"h": ecrire_heure(m), "mode": vus[m]} for m in sorted(vus)]
    if not any(semaine.values()):
        raise RefusNomme("chauffage_semaine_vide", "planning sans aucun changement", "semaine")
    return semaine


def valider_temperatures(brut: Any, actuelles: dict[str, float]) -> dict[str, float]:
    """Les consignes des modes d'un thermostat, en °C, de 5 a 30, au demi-degre,
    dans l'ordre du froid au chaud : hors_gel < eco <= confort (voir
    `_cle_en_desordre`). L'ordre se juge sur le resultat, apres l'arrondi."""
    if not isinstance(brut, dict):
        raise ValueError("temperatures : un objet {confort, eco, hors_gel}")
    t = dict(actuelles)
    for cle, v in brut.items():
        if cle not in TEMPERATURES_DEFAUT:
            raise ValueError("temperature inconnue : %s" % cle)
        if (not isinstance(v, (int, float)) or isinstance(v, bool)
                or not TEMPERATURE_MIN <= v <= TEMPERATURE_MAX):
            raise RefusNomme("chauffage_temperature_hors_bornes", "temperature hors bornes (5 a 30 °C)",
                             "temperatures.%s" % cle)
        t[cle] = round(float(v) * 2) / 2
    fautive = _cle_en_desordre(t, brut)
    if fautive is not None:
        raise RefusNomme("chauffage_temperatures_desordre",
                         "temperatures en desordre (hors_gel < eco <= confort)", "temperatures.%s" % fautive)
    return t


def valider_chauffage(brut: Any, actuel: dict[str, Any], permis: list[str] | None = None) -> dict[str, Any]:
    """Un chauffage modifie : `planning`, `semaine`, `temperatures`, `fenetre`.
    `entite` et `famille` ne viennent jamais de l'ecran : le serveur les lit."""
    if not isinstance(brut, dict):
        raise ValueError("chauffage : un objet")
    inconnues = sorted(str(k) for k in brut if k not in ("planning", "semaine", "temperatures", "fenetre"))
    if inconnues:
        raise ValueError("champ inconnu : %s" % ", ".join(inconnues))
    neuf = copy.deepcopy(actuel)
    if "planning" in brut:
        if not isinstance(brut["planning"], bool):
            raise ValueError("planning : vrai ou faux")
        neuf["planning"] = brut["planning"]
    if "semaine" in brut:
        neuf["semaine"] = valider_semaine(brut["semaine"], permis)
    if "temperatures" in brut:
        neuf["temperatures"] = valider_temperatures(brut["temperatures"], neuf["temperatures"])
    if "fenetre" in brut:
        reglage = brut["fenetre"]
        if reglage not in REGLAGES_FENETRE:
            raise ValueError("fenetre : arret, eco ou rien")
        if reglage == "eco" and permis is not None and "eco" not in permis:
            raise RefusNomme("chauffage_mode_inconnu", "mode eco inconnu de ce chauffage", "fenetre")
        neuf["fenetre"] = reglage
    return neuf


def poser_patch(cfg: dict[str, Any], patch: Any, connus: dict[str, dict[str, Any]]) -> None:
    """Le patch de `loggia/chauffage/config`, pose sur `cfg` — ou un refus,
    et rien n'est ecrit. `connus` : les chauffages que le serveur reconnait en
    ce moment, {cle: {"entite", "famille", "permis"}}. Synchrone : il tourne
    sous le verrou du magasin (`async_modifier_shared`)."""
    if not isinstance(patch, dict):
        raise ValueError("patch : un objet")
    inconnues = sorted(str(k) for k in patch if k not in ("chauffages", "maison", "simulation"))
    if inconnues:
        raise ValueError("cle inconnue : %s" % ", ".join(inconnues))
    chauffages = patch.get("chauffages", {})
    if not isinstance(chauffages, dict):
        raise ValueError("chauffages : un objet par chauffage")
    for cle, c in chauffages.items():
        if c is None:
            cfg["chauffages"].pop(cle, None)
            continue
        connu = connus.get(cle)
        actuel = cfg["chauffages"].get(cle)
        if actuel is None and connu is None:
            raise RefusNomme("chauffage_inconnu", "chauffage inconnu", cle)
        if actuel is None:
            actuel = chauffage_defaut(connu["entite"], connu["famille"], connu.get("permis"))
        elif connu is not None:
            actuel = {**actuel, "entite": connu["entite"], "famille": connu["famille"]}
        cfg["chauffages"][cle] = valider_chauffage(c, actuel, connu.get("permis") if connu else None)
    if len(cfg["chauffages"]) > MAX_CHAUFFAGES:
        raise RefusNomme("chauffage_trop_de_chauffages", "trop de chauffages, au plus", MAX_CHAUFFAGES)
    maison = patch.get("maison", {})
    if not isinstance(maison, dict):
        raise ValueError("maison : un objet")
    for cle, mode in maison.items():
        if cle not in ("absence", "vacances"):
            raise ValueError("maison.%s : le mode de la maison passe par loggia/chauffage/maison" % cle)
        if mode not in MODES:
            raise RefusNomme("chauffage_mode_inconnu", "mode %s inconnu" % (mode,), "maison.%s" % cle)
        cfg["maison"][cle] = mode
    if "simulation" in patch:
        simulation = patch["simulation"]
        if not isinstance(simulation, dict) or not isinstance(simulation.get("actif"), bool):
            raise ValueError("simulation : {actif: vrai ou faux}")
        cfg["simulation"] = {"actif": simulation["actif"]}


def poser_maison(cfg: dict[str, Any], mode: Any, fin: Any, maintenant: datetime,
                 par_presence: bool = False) -> None:
    """Le mode de la maison (§ 8.2). Vacances peut avoir une fin, un instant ISO
    a venir ; les autres modes n'en ont pas. `par_presence` : une Absence posee
    par la presence (la maison s'est videe), pas par une personne."""
    if mode not in MAISONS:
        raise ValueError("mode de maison inconnu : %r" % (mode,))
    instant = None
    if fin is not None:
        instant = lire_instant(fin)
        if mode != "vacances" or instant is None or instant <= maintenant:
            raise RefusNomme("chauffage_date_illisible", "date illisible ou passee", "maison.vacances_fin")
    cfg["maison"]["mode"] = mode
    cfg["maison"]["vacances_fin"] = instant.isoformat() if instant else None
    cfg["maison"]["par_presence"] = bool(par_presence) and mode == "absence"
