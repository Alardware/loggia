"""Le distributeur de croquettes tel que son APPAREIL le montre (ADR 0155).

Pourquoi ce module existe
─────────────────────────
Jusqu'au 05/10, « Distribuer » prenait le premier `select.*feed` de TOUTE la
maison, l'epingle le premier `number.*serving_size`, et un script devine a son
nom pouvait servir de commande. Un aquarium dont le select « feed » propose
START aurait nourri les poissons a la place du chat. Le distributeur se
designe desormais par son appareil, et tout ce qui suit ne regarde QUE ses
entites (ses « soeurs »).

Ce module ne fait que LIRE : des entrees de registre et des etats, rendus en
dictionnaires. Aucun import de Home Assistant — `automatisations.py` et
`distributeurs.py` le chargent, les tests aussi, sans doublure.

Ce qu'il rend
─────────────
  * `appareil_de` : l'appareil designe, ou celui de la premiere entite
    designee (haid > portionWeight > distribuees > reservoir) ; une autre
    entite designee posee sur un AUTRE appareil est ignoree et signalee ;
  * `soeurs` : les entites de l'appareil, sans les desactivees (elles n'ont
    pas d'etat) ; une entite MASQUEE reste une soeur — tuya-local masque son
    `meal_plan`, l'ecarter ferait croire a un appareil sans programme ;
  * `commande_distribuer` : la regle R1, la premiere qui s'applique gagne ;
  * `programme_appareil` : le programme tenu par l'appareil, en LECTURE seule ;
  * `anomalies`, `consommables` : les tables R2 et R3, pour le journal.

Les tables sont des constantes nommees, EGALES cle par cle a `tables` de
`tests/fixtures/distributeurs.json` : le JS (`src/distributeur.js`) lit la
meme fixture, une table qui divergerait rougit des deux cotes. Les motifs se
testent sur le SUFFIXE en minuscules (la partie de l'entity_id apres le point),
jamais sur le nom affiche ; ils s'ecrivent a l'identique en Python et en JS.

Ce qui est hors v1 (ADR 0155) : decoder tuya-local (le format change d'un
produit a l'autre, une heure fausse est pire que rien), lire Xiaomi, LocalTuya,
ESPHome, Catlink, ecrire le programme d'un appareil.
"""
from __future__ import annotations

import json
import math
import re
from typing import Any, Iterable

# ── Tables (figees par tests/fixtures/distributeurs.json > tables) ─────────

# R1 — la commande. 1) un bouton ; 2) un number qu'on ECRIT (Tuya, PetKit) ;
# 3) un text qu'on ecrit (PetKit) ; 4) un select feed qui propose START (Z2M) ;
# 5) le script DESIGNE, jamais devine.
CLES_BOUTON = ("feed", "manual_feed")
MOTIF_SUFFIXE_FEED = r"(^|_)(manual_)?feed(_now)?$|food_out$"
MOTIF_EXCLU_BOUTON = r"plan|schedule|reset|cancel|enable|disable"
CLES_NUMBER_ECRIT = ("feed", "manual_feed")
PLATEFORMES_NUMBER_ECRIT = ("petkit", "tuya", "tuya_local")
# Un number qui parle de quantite, de taille, de portion ou de poids est un
# REGLAGE : l'ecrire ne distribue rien (Petlibro manual_feed_quantity).
MOTIF_NUMBER_REGLAGE = r"quantity|size|portion|weight"
PREFIXE_TEXT_ECRIT = "manual_feed"
PLATEFORMES_TEXT_ECRIT = ("petkit",)
MOTIF_SELECT_FEED = r"_feed$"
OPTION_START = "START"
# Une device action ne vaut commande que dans ces domaines (lu par
# automatisations.py : une lumiere du distributeur n'est pas un repas).
DOMAINES_ACTION_APPAREIL = ("button", "number", "select", "text")

# La portion et son poids.
CLES_PORTION = ("manual_feed_quantity", "manual_portions", "portions", "serving_size")
MOTIF_SUFFIXE_PORTION = r"(^|_)(serving_size|portions|manual_portions)$"
CLES_POIDS_PORTION = ("portion_weight",)
MOTIF_SUFFIXE_POIDS_PORTION = r"(^|_)portion_weight$"

# Le programme de l'appareil.
CLES_PROGRAMME: dict[str, tuple[str, ...]] = {
    "petlibro": ("feeding_schedule",),
    "petkit": ("raw_distribution_data",),
    "aqara_mode": ("feeding_mode",),
    "tuya_local": ("meal_plan", "schedule"),
}
MOTIF_MODE_Z2M = r"_mode$"
OPTIONS_MODE_Z2M = ("manual", "schedule")
MOTIF_SCHEDULE_Z2M = r"_schedule$"
MODES = {"manual": "manuel", "schedule": "programme"}
JOURS_Z2M: dict[str, tuple[int, ...]] = {
    "everyday": (0, 1, 2, 3, 4, 5, 6),
    "workdays": (0, 1, 2, 3, 4),
    "weekend": (5, 6),
    "mon": (0,),
    "tue": (1,),
    "wed": (2,),
    "thu": (3,),
    "fri": (4,),
    "sat": (5,),
    "sun": (6,),
    "mon-wed-fri-sun": (0, 2, 4, 6),
    "tue-thu-sat": (1, 3, 5),
}
JOURS_TUYA = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")
SERVICES_PETSAFE = ("petsafe.add_schedule",)
SERVICE_TUYA_PROGRAMME = "tuya.get_feeder_meal_plan"

# R2 — les anomalies (binary_sensor seulement).
CLES_ANOMALIE_BAS = ("food_level", "food_level_1", "food_level_2", "food_low",
                     "left_food_low", "right_food_low", "tank_empty")
CLES_ANOMALIE_BLOQUE = ("barn_door_error", "door_blocked", "error_detected",
                        "food_dispenser_state", "food_outlet_state", "rotor_stuck")
MOTIF_BAS = r"food_(low|shortage|empty|level)|hopper_low|not_enough_food|pet_food_left_level"
MOTIF_BLOQUE = r"block|jam|stuck|clog"

# R3 — les consommables (sensor seulement) et leur remise a zero (button).
CLES_CONSOMMABLE: dict[str, tuple[str, ...]] = {
    "deshydratant": ("desiccant_left_days", "remaining_desiccant"),
    "filtre": ("remaining_filter_days",),
    "nettoyage": ("remaining_cleaning_days",),
}
UNITES_JOURS = ("d",)
MOTIF_CONSOMMABLE = {"deshydratant": "desiccant", "filtre": "filter", "nettoyage": "clean"}
MOTIF_CONSOMMABLE_PCT = {"deshydratant": "desiccant.*level", "filtre": "filter_percent"}
CLES_RESET: dict[str, tuple[str, ...]] = {
    "deshydratant": ("desiccant_reset", "reset_desiccant"),
    "filtre": ("filter_reset", "reset_filter"),
    "nettoyage": ("cleaning_reset",),
}
MOTIF_RESET = {"deshydratant": "reset.*desiccant|desiccant.*reset"}

# En ligne, en cours, prochain et dernier repas, compteurs, evenements.
CLES_CONNECTIVITE = ("online",)
CLES_EN_COURS = ("feeding",)
CLES_PROCHAIN = ("next_feed_time",)
MOTIF_PROCHAIN = r"(^|_)next_feed(ing|_time)?$"
CLES_DERNIER = ("last_feed_time", "pet_last_meal_date")
MOTIF_DERNIER = r"(^|_)last_feed(ing|_time)?$"
CLES_COMPTEUR = ("manual_dispensed", "planned_dispensed", "portions_dispensed_today",
                 "times_dispensed", "today_feeding_quantity_weight", "today_feeding_times",
                 "total_dispensed", "weight_dispensed_today")
MOTIF_COMPTEUR_Z2M = r"(^|_)(portions_per_day|weight_per_day)$"
CLES_SOURCE_REPAS = ("last_amount", "last_feeding_size", "last_feeding_source")
MOTIF_SOURCE_REPAS = r"(^|_)feeding_(source|size)$"

# ── Hors des tables : le vocabulaire du module ──────────────────────────────

# L'ordre dans lequel une entite designee donne son appareil (ADR 0155).
ORDRE_DESIGNEES = ("haid", "portionWeight", "distribuees", "reservoir")
# « unknown » n'est PAS une panne : c'est l'etat normal d'un select feed Z2M,
# et un reservoir sans valeur (health.js separe muette et sans valeur).
MUET = "unavailable"
SANS_VALEUR = (None, "", "unavailable", "unknown", "none")
# Tuya officielle : au sondage de la carte, le service n'est PAS appele.
# `programme_appareil(..., tuya=NON_LU)` le dit ; une reponse se passe telle
# quelle, une erreur (exception, None, autre forme) se lit « non_lisible ».
NON_LU = object()

_HEURE = re.compile(r"^(\d{1,2}):(\d{2})(?::(\d{2}))?$")


# ── Petits outils ───────────────────────────────────────────────────────────

def _valeur(x: Any) -> Any:
    """Un enum de Home Assistant (EntityCategory, …) rendu en chaine."""
    v = getattr(x, "value", x)
    return v if v is None or isinstance(v, str) else str(v)


def _domaine(entity_id: str) -> str:
    return entity_id.split(".", 1)[0] if "." in entity_id else ""


def _suffixe(entity_id: str) -> str:
    return (entity_id.split(".", 1)[1] if "." in entity_id else entity_id).lower()


def _trouve(motif: str, texte: Any) -> bool:
    return isinstance(texte, str) and bool(texte) and re.search(motif, texte) is not None


def _nombre(v: Any) -> int | float | None:
    """Un nombre lu tel quel (attribut ou etat) ; 12.0 devient 12. Un booleen
    n'est pas un nombre, une chaine illisible non plus."""
    if isinstance(v, bool) or v is None:
        return None
    if isinstance(v, (int, float)):
        n = float(v)
    else:
        try:
            n = float(str(v).strip())
        except ValueError:
            return None
    if n != n or n in (float("inf"), float("-inf")):
        return None
    return int(n) if n.is_integer() else n


def _etat(etats: Any, entity_id: str | None) -> Any:
    if not entity_id or etats is None:
        return None
    try:
        return etats.get(entity_id)
    except Exception:  # noqa: BLE001 — un etat illisible est un etat absent
        return None


def _entrees(registre: Any) -> list:
    """Les entrees du registre : le vrai (`.entities`) ou une simple liste."""
    if registre is None:
        return []
    table = getattr(registre, "entities", registre)
    try:
        valeurs = table.values() if hasattr(table, "values") else table
        return [e for e in valeurs if getattr(e, "entity_id", None)]
    except Exception:  # noqa: BLE001
        return []


def _entree(registre: Any, entity_id: str | None) -> Any:
    if not entity_id or registre is None:
        return None
    lire = getattr(registre, "async_get", None)
    if callable(lire):
        try:
            return lire(entity_id)
        except Exception:  # noqa: BLE001
            return None
    for e in _entrees(registre):
        if e.entity_id == entity_id:
            return e
    return None


def _desactivee(entree: Any) -> bool:
    return getattr(entree, "disabled_by", None) not in (None, False)


def _cfg(cfg_feeder: Any) -> dict:
    return cfg_feeder if isinstance(cfg_feeder, dict) else {}


def _haids(cfg: dict) -> dict:
    h = cfg.get("haids")
    return h if isinstance(h, dict) else {}


def _id(v: Any) -> str | None:
    return v.strip() if isinstance(v, str) and "." in v.strip() else None


def designees(cfg_feeder: Any) -> list[str]:
    """Les entites designees dans Parametres, dans l'ordre qui donne l'appareil,
    puis le script ; sans doublon."""
    cfg = _cfg(cfg_feeder)
    h = _haids(cfg)
    vues: list[str] = []
    for cle in ORDRE_DESIGNEES:
        eid = _id(cfg.get(cle) if cle == "haid" else h.get(cle))
        if eid and eid not in vues:
            vues.append(eid)
    script = _script_designe(cfg)
    if script and script not in vues:
        vues.append(script)
    return vues


def _script_designe(cfg: dict) -> str | None:
    s = _id(cfg.get("script"))
    return s if s and s.startswith("script.") else None


def _tries(soeurs: Iterable[dict]) -> list[dict]:
    # Departage : l'ordre des points de code de l'entity_id, comme le JS.
    return sorted((s for s in soeurs or () if isinstance(s, dict) and s.get("entity_id")),
                  key=lambda s: s["entity_id"])


def _premiere(soeurs: Iterable[dict], test) -> dict | None:
    for s in _tries(soeurs):
        if test(s):
            return s
    return None


def _cle(s: dict) -> str:
    return (s.get("cle") or "").lower()


def _attrs(s: dict) -> dict:
    a = s.get("attributs")
    return a if isinstance(a, dict) else {}


# ── L'appareil et ses soeurs ────────────────────────────────────────────────

def appareil_de(cfg_feeder: Any, registre: Any) -> tuple[str | None, list[dict]]:
    """(device_id | None, notes).

    `cfg.appareil` s'il est donne ; sinon le device_id de la premiere entite
    designee qui en a un (haid > portionWeight > distribuees > reservoir). Une
    autre entite designee posee sur un AUTRE appareil est ignoree et signalee :
    `{code: 'appareil_divergent', entity_id}`. Une entite sans appareil (un
    helper) n'est pas une divergence.
    """
    cfg = _cfg(cfg_feeder)
    h = _haids(cfg)
    ordre: list[str] = []
    for cle in ORDRE_DESIGNEES:
        eid = _id(cfg.get(cle) if cle == "haid" else h.get(cle))
        if eid and eid not in ordre:
            ordre.append(eid)
    appareils = {eid: getattr(_entree(registre, eid), "device_id", None) for eid in ordre}
    choisi = cfg.get("appareil").strip() if isinstance(cfg.get("appareil"), str) else None
    choisi = choisi or None
    if choisi is None:
        choisi = next((appareils[eid] for eid in ordre if appareils[eid]), None)
    notes = [{"code": "appareil_divergent", "entity_id": eid}
             for eid in ordre if appareils[eid] and choisi and appareils[eid] != choisi]
    return choisi, notes


def _soeur(entity_id: str, entree: Any, etat: Any) -> dict:
    attributs = dict(getattr(etat, "attributes", None) or {}) if etat is not None else {}
    classe = (getattr(entree, "device_class", None) or getattr(entree, "original_device_class", None)
              or attributs.get("device_class"))
    return {
        "entity_id": entity_id,
        "domaine": _domaine(entity_id),
        "plateforme": getattr(entree, "platform", None),
        "cle": getattr(entree, "translation_key", None),
        "classe": _valeur(classe),
        "categorie": _valeur(getattr(entree, "entity_category", None)),
        "suffixe": _suffixe(entity_id),
        "etat": getattr(etat, "state", None) if etat is not None else None,
        "attributs": attributs,
        "device_id": getattr(entree, "device_id", None),
    }


def soeurs(registre: Any, etats: Any, device_id: str | None, cfg: Any = None) -> list[dict]:
    """Les entites de l'appareil, triees par entity_id.

    `{entity_id, domaine, plateforme, cle, classe, categorie, suffixe, etat,
    attributs, device_id}`. Les DESACTIVEES sortent (elles n'ont pas d'etat) ;
    les masquees restent. Sans appareil, les soeurs sont les seules entites
    designees dans `cfg` (loggia_feeder) qui existent.
    """
    sortie: list[dict] = []
    if device_id:
        for e in _entrees(registre):
            if getattr(e, "device_id", None) == device_id and not _desactivee(e):
                sortie.append(_soeur(e.entity_id, e, _etat(etats, e.entity_id)))
    else:
        for eid in designees(cfg):
            e = _entree(registre, eid)
            etat = _etat(etats, eid)
            if (e is None and etat is None) or _desactivee(e):
                continue
            sortie.append(_soeur(eid, e, etat))
    return _tries(sortie)


# ── R1 : la commande de distribution ────────────────────────────────────────

def _bouton(s: dict) -> bool:
    if s["domaine"] != "button":
        return False
    cle, suf = _cle(s), s["suffixe"]
    if not (cle in CLES_BOUTON or _trouve(MOTIF_SUFFIXE_FEED, suf)):
        return False
    return not (_trouve(MOTIF_EXCLU_BOUTON, suf) or _trouve(MOTIF_EXCLU_BOUTON, cle))


def _number_ecrit(s: dict) -> bool:
    cle = _cle(s)
    return (s["domaine"] == "number" and cle in CLES_NUMBER_ECRIT
            and s.get("plateforme") in PLATEFORMES_NUMBER_ECRIT
            and not _trouve(MOTIF_NUMBER_REGLAGE, cle))


def _text_ecrit(s: dict) -> bool:
    return (s["domaine"] == "text" and _cle(s).startswith(PREFIXE_TEXT_ECRIT)
            and s.get("plateforme") in PLATEFORMES_TEXT_ECRIT)


def _option_start(options: Any) -> str | None:
    """L'option START telle que l'ENTITE l'ecrit, casse ignoree (05/10,
    contradicteur) : le JS (`commandeDistribuer`) et automatisations.py
    (`_est_start`) ignorent la casse ; un « start » reconnu par l'ecran mais pas
    ici aurait montre « Distribuer » sur la carte et retenu chaque repas Loggia
    en « commande inconnue ». On renvoie l'option de l'entite : select_option
    refuse une option qu'elle ne propose pas."""
    if not isinstance(options, (list, tuple)):
        return None
    return next((o for o in options if isinstance(o, str) and o.strip().upper() == OPTION_START), None)


def _select_feed(s: dict) -> bool:
    return (s["domaine"] == "select" and _trouve(MOTIF_SELECT_FEED, s["suffixe"])
            and _option_start(_attrs(s).get("options")) is not None)


def _commande(domaine, service, entity_id, donnees=None, quantite=False, mini=None, maxi=None, pas=None):
    return {"domaine": domaine, "service": service, "entity_id": entity_id,
            "donnees": dict(donnees or {}), "quantite": quantite, "min": mini, "max": maxi, "pas": pas}


def commande_distribuer(soeurs: Iterable[dict], etats: Any = None, cfg: Any = None) -> dict | None:
    """La commande qui distribue, ou None (« Loggia ne sait pas commander »).

    `{domaine, service, entity_id, donnees, quantite, min, max, pas}`. Elle ne
    regarde QUE les soeurs : jamais une commande prise hors de l'appareil, meme
    faute de mieux. La commande de l'appareil passe avant le script designe.
    Un select feed muet garde ses options (attributs de capacite) : il reste
    reconnu, et la fiche dit « ne repond plus » plutot que « ne sait pas ».
    """
    liste = _tries(soeurs)
    s = _premiere(liste, _bouton)
    if s:
        return _commande("button", "press", s["entity_id"])
    s = _premiere(liste, _number_ecrit)
    if s:
        a = _attrs(s)
        return _commande("number", "set_value", s["entity_id"], quantite=True,
                         mini=_nombre(a.get("min")), maxi=_nombre(a.get("max")), pas=_nombre(a.get("step")))
    s = _premiere(liste, _text_ecrit)
    if s:
        # Un text n'a pas de bornes de VALEUR : min et max y sont des longueurs.
        return _commande("text", "set_value", s["entity_id"], quantite=True)
    s = _premiere(liste, _select_feed)
    if s:
        return _commande("select", "select_option", s["entity_id"],
                         {"option": _option_start(_attrs(s).get("options"))})
    script = _script_designe(_cfg(cfg))
    if script:
        return _commande("script", "turn_on", script)
    return None


def nombre_de_portions(n: Any) -> int | None:
    """Un nombre de portions : un ENTIER, au moins 1, arrondi au plus proche
    (2,5 → 3, comme `Math.round` du JS). Illisible → None : le serveur
    n'invente pas un repas.

    Pourquoi (05/10, contradicteur) : `n × pas` borne par un `min` a 0 (PetKit
    en grammes) ecrivait 0 pour n = 0 ou negatif — un « repas » de 0 g note
    distribue au journal —, et le script designe recevait `portions: 0` ou
    `None`. Le JS (`valeurPortions`, `envoiDistribuer`) comptait deja ainsi.
    """
    v = _nombre(n)
    if v is None:
        return None
    return max(1, int(math.floor(v + 0.5)))


def valeur_portions(commande: dict | None, n: Any) -> int | float | None:
    """La valeur ECRITE pour n portions : une portion = UN PAS de l'entite.

    `min(max, max(min, n × pas))` ; pas absent = 1, min absent = 1, max absent
    = pas de plafond. Ecrire « 2 » dans le number en grammes d'un PetKit au pas
    de 20 serait refuse, ou distribuerait 2 g (05/10, en ecrivant la fixture).
    n passe par `nombre_de_portions` (entier, au moins 1). None pour une
    commande qui n'ecrit pas de quantite, ou un n illisible.
    """
    if not commande or not commande.get("quantite"):
        return None
    portions = nombre_de_portions(n)
    if portions is None:
        return None
    pas = commande.get("pas") or 1
    mini = commande.get("min")
    mini = 1 if mini is None else mini
    v = max(mini, portions * pas)
    if commande.get("max") is not None:
        v = min(commande["max"], v)
    return _nombre(round(v, 6))


def une_portion(commande: dict | None) -> int | float | None:
    """Ce qu'envoie le bouton de la carte : une portion, donc un pas."""
    return valeur_portions(commande, 1)


def envoi(commande: dict | None, n: Any = 1) -> dict | None:
    """L'appel complet pour un repas de n portions : `{domaine, service, data}`.

    Un bouton ou un select partent UNE fois, quel que soit n ; un number recoit
    la valeur, un text la meme en chaine ; le script recoit `variables:
    {portions: n}`, n entier au moins 1. Un n illisible ne part pas (None),
    sauf pour un bouton ou un select, qui ne le lisent pas.
    """
    if not commande:
        return None
    data: dict[str, Any] = {"entity_id": commande["entity_id"]}
    domaine = commande["domaine"]
    if domaine in ("number", "text"):
        v = valeur_portions(commande, n)
        if v is None:
            return None
        data["value"] = str(v) if domaine == "text" else v
    elif domaine == "script":
        portions = nombre_de_portions(n)
        if portions is None:
            return None
        data["variables"] = {"portions": portions}
    else:
        data.update(commande.get("donnees") or {})
    return {"domaine": domaine, "service": commande["service"], "data": data}


def _mode_aqara(s: dict) -> bool:
    if s["domaine"] != "select":
        return False
    if _cle(s) in CLES_PROGRAMME["aqara_mode"]:
        return True
    options = _attrs(s).get("options")
    if s.get("plateforme") != "mqtt" or not _trouve(MOTIF_MODE_Z2M, s["suffixe"]):
        return False
    if not isinstance(options, (list, tuple)):
        return False
    vues = {str(o).lower() for o in options}
    return all(o in vues for o in OPTIONS_MODE_Z2M)


def portion(soeurs: Iterable[dict], etats: Any = None, cfg: Any = None,
            registre: Any = None, appareil: str | None = None) -> dict | None:
    """La taille de la portion : `{entity_id, unite, min, max, pas}`.

    Le number designe (`haids.portionWeight`) s'il existe — et s'il n'est pas
    pose sur un AUTRE appareil —, sinon la soeur number de cle CLES_PORTION,
    sinon de suffixe MOTIF_SUFFIXE_PORTION. L'unite vient de l'entite
    (unit_of_measurement), jamais un « g » en dur : le serving_size d'Aqara
    compte des portions.
    """
    liste = _tries(soeurs)
    choisie = None
    designe = _id(_haids(_cfg(cfg)).get("portionWeight"))
    if designe and _domaine(designe) == "number":
        choisie = next((s for s in liste if s["entity_id"] == designe), None)
        if choisie is None:
            ailleurs = getattr(_entree(registre, designe), "device_id", None)
            etat = _etat(etats, designe)
            if etat is not None and not (ailleurs and appareil and ailleurs != appareil):
                choisie = _soeur(designe, _entree(registre, designe), etat)
    if choisie is None:
        choisie = (_premiere(liste, lambda s: s["domaine"] == "number" and _cle(s) in CLES_PORTION)
                   or _premiere(liste, lambda s: s["domaine"] == "number"
                                and _trouve(MOTIF_SUFFIXE_PORTION, s["suffixe"])))
    if choisie is None:
        return None
    a = _attrs(choisie)
    return {"entity_id": choisie["entity_id"], "unite": a.get("unit_of_measurement") or None,
            "min": _nombre(a.get("min")), "max": _nombre(a.get("max")), "pas": _nombre(a.get("step"))}


def poids_portion(soeurs: Iterable[dict]) -> dict | None:
    """Le poids d'une portion, quand l'appareil le dit : `{entity_id, unite}`."""
    s = (_premiere(soeurs, lambda s: s["domaine"] == "number" and _cle(s) in CLES_POIDS_PORTION)
         or _premiere(soeurs, lambda s: s["domaine"] == "number"
                      and _trouve(MOTIF_SUFFIXE_POIDS_PORTION, s["suffixe"])))
    if s is None:
        return None
    return {"entity_id": s["entity_id"], "unite": _attrs(s).get("unit_of_measurement") or None}


def cibles_de_commande(soeurs: Iterable[dict], etats: Any = None, cfg: Any = None,
                       commande: dict | None = None, registre: Any = None,
                       appareil: str | None = None) -> list[str]:
    """Ce qu'une automatisation peut VISER pour etre candidate (ADR 0155).

    La commande, le number de portion, le select de mode et le script designe,
    tries. Jamais un sensor, un binary_sensor, ni le reservoir designe : une
    automatisation qui LIT le bac ne commande rien. (Ne sont GARDEES que celles
    qui visent une cible de REPAS : voir `cibles_de_repas`.)
    """
    if commande is None:
        commande = commande_distribuer(soeurs, etats, cfg)
    reservoir = _id(_haids(_cfg(cfg)).get("reservoir"))
    vues: set[str] = set()
    if commande:
        vues.add(commande["entity_id"])
    p = portion(soeurs, etats, cfg, registre, appareil)
    if p:
        vues.add(p["entity_id"])
    mode = _premiere(soeurs, _mode_aqara)
    if mode:
        vues.add(mode["entity_id"])
    script = _script_designe(_cfg(cfg))
    if script:
        vues.add(script)
    return sorted(e for e in vues
                  if _domaine(e) not in ("sensor", "binary_sensor") and e != reservoir)


def cibles_de_repas(commande: dict | None, cfg: Any = None) -> list[str]:
    """Les cibles qui font un REPAS : la commande et le script designe.

    Regler la portion ou le mode est un reglage, pas un repas (contradicteur,
    05/10) : une « portion d'hiver » posee chaque matin a 06:00 passerait
    sinon pour un repas, et retiendrait le planning Loggia.
    """
    vues = {commande["entity_id"]} if commande else set()
    script = _script_designe(_cfg(cfg))
    if script:
        vues.add(script)
    return sorted(vues)


def action_appareil_de_repas(domaine: Any, option: Any = None) -> bool:
    """Une device action NON resolue par le registre, posee sur l'appareil du
    distributeur : vaut-elle un repas ? Seulement dans DOMAINES_ACTION_APPAREIL
    et, pour un select, avec l'option START — une lumiere du distributeur, ou
    son mode choisi dans l'editeur visuel, ne sont pas des repas (05/10). Lu
    par automatisations.py ; la device action RESOLUE se juge, elle, sur
    `cibles_de_repas`."""
    if domaine not in DOMAINES_ACTION_APPAREIL:
        return False
    # Casse ignoree, comme `_est_start` d'automatisations.py (05/10).
    return domaine != "select" or _option_start([option]) is not None


# ── Le programme de l'appareil (lecture seule) ──────────────────────────────

def _programme(source=None, connu=False, presente=False, active=False, lisible=False,
               mode=None, note=None, repas=None) -> dict:
    return {"source": source, "connu": connu, "presente": presente, "active": active,
            "lisible": lisible, "mode": mode, "note": note, "repas": list(repas or [])}


def _lisible(source: str, repas: list[dict], mode=None, actif_global: bool = True) -> dict:
    repas = sorted(repas, key=lambda r: (r["heure"], r["jours"][0] if r["jours"] else 7))
    presente = bool(repas)
    return _programme(source, True, presente, presente and actif_global and any(r["actif"] for r in repas),
                      True, mode, None, repas)


def _tenu(source: str, mode=None) -> dict:
    """Present mais illisible : il bloque l'ajout d'un repas Loggia, il n'allume
    pas « deux sources », il ne retient pas un repas Loggia deja la."""
    return _programme(source, True, True, False, False, mode, "tenu_par_appareil")


class _Illisible(ValueError):
    """Un creneau qu'on ne sait pas lire : toute la liste devient illisible."""


def _hhmm(v: Any) -> str:
    m = _HEURE.match(v.strip()) if isinstance(v, str) else None
    if not m:
        raise _Illisible(v)
    h, mi = int(m.group(1)), int(m.group(2))
    if h > 23 or mi > 59:
        raise _Illisible(v)
    return "%02d:%02d" % (h, mi)


def _entier(v: Any, mini: int, maxi: int) -> int:
    n = _nombre(v)
    if not isinstance(n, int) or not mini <= n <= maxi:
        raise _Illisible(v)
    return n


def _portions(v: Any) -> int | float:
    n = _nombre(v) if not isinstance(v, str) else None
    if n is None:
        raise _Illisible(v)
    return n


def _repas(heure: str, jours, portions, actif: bool, etat_jour=None) -> dict:
    return {"heure": heure, "jours": sorted(set(jours)), "portions": portions,
            "actif": bool(actif), "etat_jour": etat_jour}


def lire_petlibro(s: dict) -> dict:
    """binary_sensor feeding_schedule, attribut `schedule` (repeat_days 1 = lundi).
    Actif = etat 'on' ET un repas allume."""
    if s.get("etat") in SANS_VALEUR or not isinstance(_attrs(s).get("schedule"), list):
        return _programme("petlibro")
    try:
        repas = []
        for r in _attrs(s)["schedule"]:
            if not isinstance(r, dict) or not isinstance(r.get("repeat_days"), list):
                raise _Illisible(r)
            jours = [_entier(j, 1, 7) - 1 for j in r["repeat_days"]]
            repas.append(_repas(_hhmm(r.get("time")), jours, _portions(r.get("amount_raw")),
                                r.get("enabled", True), r.get("state")))
    except _Illisible:
        return _tenu("petlibro")
    return _lisible("petlibro", repas, actif_global=s.get("etat") == "on")


def lire_petkit(s: dict) -> dict:
    """sensor raw_distribution_data, attribut `feed_daily_list` : un element par
    jour (repeats 1 = lundi … 7), ses `items` (heure en secondes). Les creneaux
    se regroupent par (heure, portions) ; jours = les jours NON suspendus ; un
    creneau suspendu tous ses jours garde ses jours et s'eteint."""
    liste = _attrs(s).get("feed_daily_list")
    if s.get("etat") in ("unavailable",) or not isinstance(liste, list):
        return _programme("petkit")
    try:
        groupes: dict[tuple, dict] = {}
        for jour in liste:
            if not isinstance(jour, dict) or not isinstance(jour.get("items"), list):
                raise _Illisible(jour)
            j = _entier(jour.get("repeats"), 1, 7) - 1
            suspendu = bool(_nombre(jour.get("suspended")) or 0)
            for item in jour["items"]:
                if not isinstance(item, dict):
                    raise _Illisible(item)
                sec = _entier(item.get("time"), 0, 86399)
                cle = ("%02d:%02d" % (sec // 3600, sec % 3600 // 60), _portions(item.get("amount")))
                g = groupes.setdefault(cle, {"tous": set(), "actifs": set()})
                g["tous"].add(j)
                if not suspendu:
                    g["actifs"].add(j)
    except _Illisible:
        return _tenu("petkit")
    repas = [_repas(h, g["actifs"] or g["tous"], p, bool(g["actifs"])) for (h, p), g in groupes.items()]
    return _lisible("petkit", repas)


def lire_aqara(mode_soeur: dict, schedule: dict | None) -> dict:
    """Aqara C1 : le mode (ZHA par la cle, Z2M par le suffixe et les options),
    et sous Zigbee2MQTT la liste quand elle est un JSON COMPLET.

    Mode illisible (unavailable, unknown, autre valeur : un Z2M hors ligne fait
    tomber toutes ses entites) → on ne sait pas : ni « manuel » ni « tenu par
    l'appareil ». Manuel → pas une source : les creneaux ne partent pas. Une
    liste au format Python (guillemets simples) reste illisible en v1, meme
    complete : remplacer des guillemets serait deviner.
    """
    mode = MODES.get(str(mode_soeur.get("etat") or "").lower())
    if mode is None:
        return _programme("aqara")
    if mode == "manuel":
        return _programme("aqara", True, mode="manuel", note="mode_manuel")
    if schedule is None or schedule.get("etat") in SANS_VALEUR:
        return _tenu("aqara", mode)
    try:
        liste = json.loads(schedule["etat"])
        if not isinstance(liste, list):
            raise _Illisible(liste)
        repas = []
        for r in liste:
            if not isinstance(r, dict) or not isinstance(r.get("days"), str) or r["days"] not in JOURS_Z2M:
                raise _Illisible(r)
            heure = "%02d:%02d" % (_entier(r.get("hour"), 0, 23), _entier(r.get("minute"), 0, 59))
            repas.append(_repas(heure, JOURS_Z2M[r["days"]], _portions(r.get("size")), True))
    except (ValueError, TypeError):  # _Illisible et json.JSONDecodeError en derivent
        return _tenu("aqara", mode)
    return _lisible("aqara", repas, mode)


def lire_tuya(reponse: Any) -> dict:
    """La reponse de `tuya.get_feeder_meal_plan` : `{meal_plan: [{days, time,
    portion, enabled}]}`. Forme SUPPOSEE (services.yaml, non verifiee sur un
    appareil) : toute autre forme se lit « non_lisible », jamais une panne."""
    erreur = _programme("tuya", note="non_lisible")
    liste = reponse.get("meal_plan") if isinstance(reponse, dict) else None
    if not isinstance(liste, list):
        return erreur
    try:
        repas = []
        for r in liste:
            if not isinstance(r, dict) or not isinstance(r.get("days"), list):
                raise _Illisible(r)
            jours = []
            for j in r["days"]:
                if j not in JOURS_TUYA:
                    raise _Illisible(j)
                jours.append(JOURS_TUYA.index(j))
            repas.append(_repas(_hhmm(r.get("time")), jours, _portions(r.get("portion")),
                                r.get("enabled", True)))
    except _Illisible:
        return erreur
    return _lisible("tuya", repas)


def _services(services: Any) -> set[str]:
    try:
        return {str(s) for s in services or ()}
    except TypeError:
        return set()


def _tuya_feed(soeurs: Iterable[dict]) -> dict | None:
    return _premiere(soeurs, lambda s: s["domaine"] == "number" and s.get("plateforme") == "tuya"
                     and _cle(s) == "feed")


def tuya_a_lire(soeurs: Iterable[dict], services: Any) -> bool:
    """Vrai quand la fiche ouverte (ou le depart d'un repas Loggia) doit appeler
    `tuya.get_feeder_meal_plan` : le service existe ET l'appareil est un Tuya
    officiel a number feed. Jamais au sondage de la carte."""
    return SERVICE_TUYA_PROGRAMME in _services(services) and _tuya_feed(soeurs) is not None


def programme_appareil(soeurs: Iterable[dict], etats: Any = None, services: Any = (),
                       tuya: Any = NON_LU) -> dict:
    """Le programme que l'appareil tient lui-meme, en LECTURE seule (v1).

    `{source, connu, presente, active, lisible, mode, note, repas[]}`.
    PRESENTE : la source existe ; ACTIVE : elle distribue. Un programme
    illisible est present et non actif. `connu` = faux quand on ne PEUT pas
    savoir si l'appareil distribue seul (Tuya sans service, Xiaomi, Catlink,
    LocalTuya, ESPHome, un mode Aqara illisible) : le formulaire du planning
    Loggia porte alors sa mise en garde fixe.

    `services` : les « domaine.service » presents (petsafe.add_schedule,
    tuya.get_feeder_meal_plan). `tuya` : la reponse de
    `tuya.get_feeder_meal_plan`, passee seulement fiche ouverte ou au depart
    d'un repas Loggia ; NON_LU au sondage de la carte (note « a_lire »).
    """
    liste = _tries(soeurs)
    vus = _services(services)

    s = _premiere(liste, lambda s: s["domaine"] == "binary_sensor"
                  and _cle(s) in CLES_PROGRAMME["petlibro"])
    if s:
        return lire_petlibro(s)

    s = _premiere(liste, lambda s: s["domaine"] == "sensor" and _cle(s) in CLES_PROGRAMME["petkit"])
    if s:
        return lire_petkit(s)
    commande = commande_distribuer(liste, etats)
    if commande and next((x.get("plateforme") for x in liste
                          if x["entity_id"] == commande["entity_id"]), None) == "petkit":
        # Le capteur de diagnostic est desactive par defaut. Une litiere PetKit
        # (sans commande) n'est pas invitee a l'activer : elle ne l'a pas.
        return _programme("petkit", note="capteur_diagnostic")

    s = _premiere(liste, _mode_aqara)
    if s:
        schedule = _premiere(liste, lambda x: x["domaine"] == "sensor" and x.get("plateforme") == "mqtt"
                             and _trouve(MOTIF_SCHEDULE_Z2M, x["suffixe"]))
        return lire_aqara(s, schedule)

    s = _premiere(liste, lambda s: s["domaine"] == "text" and s.get("plateforme") == "tuya_local"
                  and _cle(s) in CLES_PROGRAMME["tuya_local"])
    if s:
        # AUCUN decodage : le format change d'un produit a l'autre.
        etat = s.get("etat")
        if etat in (None, "unavailable", "unknown"):
            return _programme("tuya_local")
        if not str(etat).strip():
            return _programme("tuya_local", True)
        return _tenu("tuya_local")

    if any(x in vus for x in SERVICES_PETSAFE) and any(x.get("plateforme") == "petsafe" for x in liste):
        return _tenu("petsafe")

    if _tuya_feed(liste) is not None:
        if SERVICE_TUYA_PROGRAMME not in vus:
            return _programme("tuya")
        if tuya is NON_LU:
            return _programme("tuya", note="a_lire")
        return lire_tuya(tuya)

    return _programme()


# ── R2, R3 et le reste de ce que l'appareil dit de lui ──────────────────────

def anomalies(soeurs: Iterable[dict]) -> list[dict]:
    """R2 : `{entity_id, type: bas | bloque | autre, actif}`, triees.

    Par la cle quelle que soit la classe ; sinon la classe `problem` est
    exigee, puis MOTIF_BAS, MOTIF_BLOQUE, ou « autre » sous son propre nom.
    """
    sortie = []
    for s in _tries(soeurs):
        if s["domaine"] != "binary_sensor":
            continue
        cle, suf = _cle(s), s["suffixe"]
        if cle in CLES_ANOMALIE_BAS:
            genre = "bas"
        elif cle in CLES_ANOMALIE_BLOQUE:
            genre = "bloque"
        elif s.get("classe") != "problem":
            continue
        elif _trouve(MOTIF_BAS, suf):
            genre = "bas"
        elif _trouve(MOTIF_BLOQUE, suf):
            genre = "bloque"
        else:
            genre = "autre"
        sortie.append({"entity_id": s["entity_id"], "type": genre, "actif": s.get("etat") == "on"})
    return sortie


def _role_consommable(s: dict) -> tuple[str, str] | None:
    """(role, 'jours' | 'pct') ou None."""
    cle, suf = _cle(s), s["suffixe"]
    unite = _attrs(s).get("unit_of_measurement")
    for role, cles in CLES_CONSOMMABLE.items():
        if cle in cles:
            return role, ("pct" if unite == "%" else "jours")
    if unite in UNITES_JOURS:
        for role, motif in MOTIF_CONSOMMABLE.items():
            if _trouve(motif, suf):
                return role, "jours"
    if unite == "%":
        for role, motif in MOTIF_CONSOMMABLE_PCT.items():
            if _trouve(motif, suf):
                return role, "pct"
    return None


def _reset(soeurs: list[dict], role: str) -> str | None:
    s = (_premiere(soeurs, lambda s: s["domaine"] == "button" and _cle(s) in CLES_RESET.get(role, ()))
         or (_premiere(soeurs, lambda s: s["domaine"] == "button" and _trouve(MOTIF_RESET[role], s["suffixe"]))
             if role in MOTIF_RESET else None))
    return s["entity_id"] if s else None


def consommables(soeurs: Iterable[dict]) -> list[dict]:
    """R3 : `{entity_id, role: deshydratant | filtre | nettoyage, jours, pct,
    reset}`, tries. Par la cle, sinon unite 'd' + MOTIF_CONSOMMABLE, sinon
    unite '%' + MOTIF_CONSOMMABLE_PCT ; `reset` = le bouton du meme role."""
    liste = _tries(soeurs)
    sortie = []
    for s in liste:
        if s["domaine"] != "sensor":
            continue
        trouve = _role_consommable(s)
        if not trouve:
            continue
        role, mesure = trouve
        v = _nombre(s.get("etat")) if s.get("etat") not in SANS_VALEUR else None
        sortie.append({"entity_id": s["entity_id"], "role": role,
                       "jours": v if mesure == "jours" else None,
                       "pct": v if mesure == "pct" else None,
                       "reset": _reset(liste, role)})
    return sortie


def en_ligne(soeurs: Iterable[dict], etats: Any, cfg: Any = None,
             commande: dict | None = None) -> dict:
    """`{mort, raison}` (ADR 0048), dans cet ordre : la commande `unavailable`
    ou absente, la connectivite de l'appareil a `off`, le reservoir designe
    `unavailable` ou absent. Le reservoir seul ne suffisait plus : chez
    l'utilisateur, c'est un input_number qui ne tombe jamais (05/10)."""
    if commande:
        e = _etat(etats, commande["entity_id"])
        if e is None or getattr(e, "state", None) == MUET:
            return {"mort": True, "raison": "commande"}
    for s in _tries(soeurs):
        if (s["domaine"] == "binary_sensor" and s.get("etat") == "off"
                and (s.get("classe") == "connectivity" or _cle(s) in CLES_CONNECTIVITE)):
            return {"mort": True, "raison": "connectivite"}
    reservoir = _id(_haids(_cfg(cfg)).get("reservoir"))
    if reservoir:
        e = _etat(etats, reservoir)
        if e is None or getattr(e, "state", None) == MUET:
            return {"mort": True, "raison": "reservoir"}
    return {"mort": False, "raison": None}


def _par(soeurs, domaine: str, cles: tuple, motif: str | None) -> list[str]:
    return [s["entity_id"] for s in _tries(soeurs)
            if s["domaine"] == domaine and (_cle(s) in cles or (motif and _trouve(motif, s["suffixe"])))]


def en_cours(soeurs: Iterable[dict]) -> str | None:
    """Le binary_sensor « distribution en cours » (Tuya)."""
    ids = _par(soeurs, "binary_sensor", CLES_EN_COURS, None)
    return ids[0] if ids else None


def prochain_capteur(soeurs: Iterable[dict]) -> str | None:
    """Le capteur du prochain repas, quand l'appareil en a un (Petlibro, PetSafe)."""
    ids = _par(soeurs, "sensor", CLES_PROCHAIN, MOTIF_PROCHAIN)
    return ids[0] if ids else None


def historique(soeurs: Iterable[dict]) -> dict:
    """Les sources de l'historique : `{dernier, compteurs[], evenements[]}`.
    Les entites `event` de l'appareil s'ajoutent aux evenements."""
    dernier = _par(soeurs, "sensor", CLES_DERNIER, MOTIF_DERNIER)
    evenements = _par(soeurs, "sensor", CLES_SOURCE_REPAS, MOTIF_SOURCE_REPAS)
    evenements += [s["entity_id"] for s in _tries(soeurs) if s["domaine"] == "event"]
    return {"dernier": dernier[0] if dernier else None,
            "compteurs": _par(soeurs, "sensor", CLES_COMPTEUR, MOTIF_COMPTEUR_Z2M),
            "evenements": sorted(evenements)}


def decrire_appareil(cfg_feeder: Any, registre: Any, etats: Any, services: Any = (),
                     tuya: Any = NON_LU) -> dict:
    """Tout ce que l'appareil dit de lui, en un appel (les cles de
    `attendu` dans la fixture partagee). `distributeurs.py` s'en sert pour
    l'etat, le depart d'un repas et le journal."""
    appareil, notes = appareil_de(cfg_feeder, registre)
    liste = soeurs(registre, etats, appareil, cfg_feeder)
    commande = commande_distribuer(liste, etats, cfg_feeder)
    return {
        "appareil": appareil,
        "notes": notes,
        "soeurs": liste,
        "commande": commande,
        "une_portion": une_portion(commande),
        "portion": portion(liste, etats, cfg_feeder, registre, appareil),
        "poids_portion": poids_portion(liste),
        "cibles_de_commande": cibles_de_commande(liste, etats, cfg_feeder, commande, registre, appareil),
        "cibles_de_repas": cibles_de_repas(commande, cfg_feeder),
        "programme": programme_appareil(liste, etats, services, tuya),
        "anomalies": anomalies(liste),
        "consommables": consommables(liste),
        "en_ligne": en_ligne(liste, etats, cfg_feeder, commande),
        "en_cours": en_cours(liste),
        "prochain_capteur": prochain_capteur(liste),
        "historique": historique(liste),
    }
