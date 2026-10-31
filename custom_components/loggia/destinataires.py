"""Qui recoit quoi : le telephone de chaque personne, sans reglage (30/10, G2 ; ADR 0301).

Avant ce module, tout ce que Loggia disait au telephone partait par UN service
`notify.*`, choisi dans Parametres > Alertes. La fumee ne reveillait qu'un
telephone ; la demande de l'enfant pouvait tomber chez quelqu'un qui n'est pas
parent ; la fin du lave-linge sonnait chez qui etait au bureau.

Home Assistant sait deja qui a quel telephone. On le lit, sans liste de
marques :

  * la `person` porte son `user_id` et ses `device_trackers` ;
  * un traceur de l'application compagnon est une entite de la plateforme
    `mobile_app`, rattachee a un APPAREIL du registre ;
  * l'entree de configuration `mobile_app` de cet appareil porte le nom sous
    lequel le telephone s'est enregistre (`device_name`), et Home Assistant en
    tire le service : `notify.mobile_app_<nom en slug>` ;
  * ce service est VERIFIE (`has_service`) : jamais un nom devine.

Une personne sans traceur relie, mais dont le compte a enregistre une
application, la retrouve par son `user_id`.

Trois publics, et rien entre eux :

  * `tous`     — la surete : tout le monde ;
  * `admins`   — le mode enfant : les administrateurs de Home Assistant
                 (`user_id` -> compte -> `is_admin`). Jamais elargi : une
                 demande de l'enfant ne part pas chez l'enfant ;
  * `presents` — la fin d'un cycle, la collecte, les veilles ordinaires : les
                 personnes a la maison (`home`) ; s'il n'y a personne qui
                 puisse recevoir, tout le monde.

Ce qui se CORRIGE, dans Parametres > Alertes (`loggia_alertes.personnes`) :
choisir le service d'une personne, ou exclure un appareil d'un PUBLIC — le mode
enfant (une tablette d'enfant ou un ecran mural ouverts sous le compte d'un
parent administrateur), ou les notifications ordinaires. La SURETE ne
s'exclut jamais (relecture du 30/10, point 1). Un service choisi qui n'existe
plus rend la main a la decouverte. La decouverte reste la regle ; le reglage
ne sert qu'a corriger.

Rien ici n'envoie quoi que ce soit : regles.py envoie, ce module LIT.
"""
from __future__ import annotations

import logging
import re
import unicodedata
from typing import Any

_LOGGER = logging.getLogger(__name__)

DOMAINE_APP = "mobile_app"
PREFIXE_APP = DOMAINE_APP + "_"
POUR = ("tous", "admins", "presents")
# Les publics dont un appareil peut etre exclu. `tous`, la surete, n'en est pas.
EXCLUABLES = ("admins", "presents")
# Un plafond, pas un reglage : une personne n'a pas trente telephones.
MAX_EXCLUS = 32
MAX_SERVICE = 128


def slug(texte: Any) -> str:
    """Le slug de Home Assistant (`homeassistant.util.slugify`), et une copie
    de sa regle quand il manque (les tests) : minuscules, sans accents, tout
    ce qui n'est ni lettre ni chiffre devient « _ »."""
    try:
        from homeassistant.util import slugify
    except ImportError:
        slugify = None
    if callable(slugify):
        try:
            return str(slugify(str(texte)))
        except Exception:  # noqa: BLE001 — la copie fait aussi bien
            _LOGGER.debug("Loggia destinataires : slugify indisponible", exc_info=True)
    s = unicodedata.normalize("NFKD", str(texte or "")).encode("ascii", "ignore").decode("ascii").lower()
    return re.sub(r"[^a-z0-9]+", "_", s).strip("_")


def _service_propre(v: Any) -> str:
    """Un nom de service `notify.<nom>` sans son domaine, ou ''."""
    if not isinstance(v, str):
        return ""
    v = v.strip().removeprefix("notify.")
    return v if 0 < len(v) <= MAX_SERVICE and re.fullmatch(r"[a-z0-9_]+", v) else ""


def _services(liste: Any) -> list[str]:
    out: list[str] = []
    for s in liste if isinstance(liste, (list, tuple)) else []:
        s = _service_propre(s)
        if s and s not in out:
            out.append(s)
    return out[:MAX_EXCLUS]


def corrections_de(brut: Any) -> dict[str, dict[str, Any]]:
    """`loggia_alertes.personnes`, nettoye :
    {person: {"service", "exclus": {"admins": [...], "presents": [...]}}}.
    Une liste `exclus` (la premiere forme, jamais publiee) vaut pour les deux
    publics ; une exclusion de `tous` n'existe pas. Ce qui n'est pas une
    personne, ni un service, est ecarte."""
    out: dict[str, dict[str, Any]] = {}
    if not isinstance(brut, dict):
        return out
    for person, c in brut.items():
        if not isinstance(person, str) or not person.startswith("person.") or not isinstance(c, dict):
            continue
        brut_exclus = c.get("exclus")
        if isinstance(brut_exclus, dict):
            exclus = {p: _services(brut_exclus.get(p)) for p in EXCLUABLES}
        else:
            liste = _services(brut_exclus)
            exclus = {p: list(liste) for p in EXCLUABLES}
        out[person] = {"service": _service_propre(c.get("service")), "exclus": exclus}
    return out


def recoit(personne: dict[str, Any], pour: str) -> list[str]:
    """Les services d'une personne pour ce public."""
    r = personne.get("recoit")
    return list(r.get(pour) or []) if isinstance(r, dict) else []


def choisir(personnes: list[dict[str, Any]], pour: str) -> list[str]:
    """Les services a qui parler pour ce public, dans l'ordre des personnes,
    chacun une fois. Vide : regles.py passe par le repli."""
    if pour not in POUR:
        raise ValueError("pour : tous, admins ou presents, pas %r" % (pour,))
    if pour == "admins":
        groupe = [p for p in personnes if p.get("admin")]
    elif pour == "presents":
        groupe = [p for p in personnes if p.get("present") and recoit(p, pour)] or personnes
    else:
        groupe = personnes
    out: list[str] = []
    for p in groupe:
        for s in recoit(p, pour):
            if s not in out:
                out.append(s)
    return out


class _Lecture:
    """Les registres, lus une fois par decouverte. Illisibles (un test, un
    Home Assistant qui demarre) : rien n'est decouvert, et le repli suffit."""

    def __init__(self, hass: Any) -> None:
        self.hass = hass
        self.entites = self.appareils = None
        try:
            from homeassistant.helpers import device_registry as dr
            from homeassistant.helpers import entity_registry as er

            entites, appareils = er.async_get(hass), dr.async_get(hass)
            entites.async_get("person.loggia")  # lisibles ?
            appareils.async_get("loggia")
            self.entites, self.appareils = entites, appareils
        except Exception:  # noqa: BLE001
            _LOGGER.debug("Loggia destinataires : registres illisibles", exc_info=True)

    def existe(self, service: str) -> bool:
        try:
            return bool(service) and bool(self.hass.services.has_service("notify", service))
        except Exception:  # noqa: BLE001
            return False

    def entree(self, entry_id: Any) -> Any:
        try:
            e = self.hass.config_entries.async_get_entry(entry_id) if entry_id else None
        except Exception:  # noqa: BLE001
            return None
        return e if getattr(e, "domain", None) == DOMAINE_APP else None

    def entrees_app(self) -> list:
        try:
            return list(self.hass.config_entries.async_entries(DOMAINE_APP))
        except Exception:  # noqa: BLE001
            return []

    def appareil_de(self, entree: Any, fiche: Any) -> dict[str, str] | None:
        """Le service d'un telephone, verifie, et le nom que la maison lui donne."""
        data = getattr(entree, "data", None) or {}
        for nom in (data.get("device_name"), getattr(fiche, "name", None)):
            if not nom:
                continue
            service = slug(PREFIXE_APP + str(nom))
            if self.existe(service):
                affiche = (getattr(fiche, "name_by_user", None) or getattr(fiche, "name", None) or nom) if fiche else nom
                return {"service": service, "nom": str(affiche)}
        return None

    def par_traceur(self, traceur: Any) -> dict[str, str] | None:
        if not isinstance(traceur, str) or self.entites is None:
            return None
        e = self.entites.async_get(traceur)
        if e is None:
            return None
        fiche = self.appareils.async_get(e.device_id) if getattr(e, "device_id", None) else None
        ids = getattr(fiche, "identifiers", None) or ()
        if getattr(e, "platform", None) != DOMAINE_APP and not any(
                isinstance(i, (tuple, list)) and i and i[0] == DOMAINE_APP for i in ids):
            return None
        entree = None
        for eid in [*(getattr(fiche, "config_entries", None) or ()), getattr(e, "config_entry_id", None)]:
            entree = self.entree(eid)
            if entree is not None:
                break
        return self.appareil_de(entree, fiche)

    def par_compte(self, user_id: str) -> list[dict[str, str]]:
        out = []
        for entree in self.entrees_app():
            if (getattr(entree, "data", None) or {}).get("user_id") != user_id:
                continue
            a = self.appareil_de(entree, None)
            if a and a not in out:
                out.append(a)
        return out

    def telephones(self, traceurs: Any, user_id: Any) -> list[dict[str, str]]:
        out: list[dict[str, str]] = []
        for t in traceurs if isinstance(traceurs, (list, tuple)) else []:
            a = self.par_traceur(t)
            if a and all(a["service"] != x["service"] for x in out):
                out.append(a)
        if not out and isinstance(user_id, str) and user_id:
            out = self.par_compte(user_id)
        return out


async def _admin(hass: Any, user_id: Any) -> bool:
    if not isinstance(user_id, str) or not user_id:
        return False
    try:
        compte = await hass.auth.async_get_user(user_id)
    except Exception:  # noqa: BLE001
        return False
    return bool(getattr(compte, "is_admin", False)) if compte is not None else False


async def decouvrir(hass: Any) -> list[dict[str, Any]]:
    """Chaque `person`, dans l'ordre de son identifiant :
    {person, nom, present, admin, appareils: [{service, nom}]}."""
    try:
        ids = sorted(hass.states.async_entity_ids("person"))
    except Exception:  # noqa: BLE001
        return []
    if not ids:
        return []
    lecture = _Lecture(hass)
    out = []
    for haid in ids:
        st = hass.states.get(haid)
        if st is None:
            continue
        attrs = getattr(st, "attributes", None) or {}
        user_id = attrs.get("user_id")
        out.append({
            "person": haid,
            "nom": str(attrs.get("friendly_name") or haid),
            "present": str(getattr(st, "state", "")) == "home",
            "admin": await _admin(hass, user_id),
            "appareils": lecture.telephones(attrs.get("device_trackers"), user_id),
        })
    return out


async def personnes(hass: Any, corrections: Any) -> list[dict[str, Any]]:
    """La decouverte, corrections posees. Chaque personne porte en plus
    `service` (choisi a la main, ou ''), `service_absent` (choisi, mais il
    n'existe plus), `exclus` par public, et `recoit` : {public: services}.
    La surete (`tous`) recoit sur tout ce qui est la, exclusions ignorees."""
    corr = corrections_de(corrections)
    gens = await decouvrir(hass)
    lecture = _Lecture.__new__(_Lecture)
    lecture.hass = hass
    for p in gens:
        c = corr.get(p["person"]) or {"service": "", "exclus": {x: [] for x in EXCLUABLES}}
        choisi = c["service"]
        present = bool(choisi) and lecture.existe(choisi)
        # Choisi a la main : il remplace la decouverte — s'il existe encore.
        # Disparu, la decouverte reprend : jamais une personne muette.
        base = [choisi] if present else [a["service"] for a in p["appareils"]]
        p["service"] = choisi
        p["service_absent"] = bool(choisi) and not present
        p["exclus"] = {x: list(c["exclus"][x]) for x in EXCLUABLES}
        p["recoit"] = {"tous": list(base),
                       **{x: [s for s in base if s not in c["exclus"][x]] for x in EXCLUABLES}}
    return gens
