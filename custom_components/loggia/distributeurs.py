"""Le distributeur de croquettes : ses sources de repas, et le planning de Loggia.

Pourquoi ce module existe (05/10, ADR 0155)
───────────────────────────────────────────
Le « planning » du distributeur etait une liste SAISIE dans Parametres : une
heure recopiee a la main, pas celle de ce qui distribue vraiment. Le planning
se lit desormais, dans cet ordre (decision de l'utilisateur) :
  1. le programme tenu par l'APPAREIL (`distributeur_appareil.py`) ;
  2. les automatisations de Home Assistant qui COMMANDENT le distributeur,
     reconnues a ce qu'elles font (`automatisations.py`) ;
  3. sinon seulement, un planning tenu ICI — qui part meme ecran ferme, comme
     celui des robots (`robots.py`, dont il reprend le format et `est_du`).

Ce module calcule les sources et les tient lui-meme : l'ecran ne propose
« Ajouter un repas » que sans source PRESENTE, et le serveur refuse l'ajout
de meme ; un repas de Loggia deja la quand une source superieure devient
ACTIVE est RETENU au depart — `async_lancer` recalcule les sources juste avant
d'envoyer, Tuya compris : c'est la que se joue une double ration.

Pas de « suivre » sur la commande
─────────────────────────────────
Contrairement aux robots, ce module n'appelle PAS `regles.suivre` : une ration
donnee a la main depuis Home Assistant gelerait la commande 30 min
(`GEL_DEFAUT`), et le repas suivant serait retenu « sous la main de
quelqu'un ». Pour un robot, un passage saute est un moindre mal ; pour un
animal, un repas saute compte.

Un repas retenu laisse TOUJOURS une ligne au journal, avec son motif :
« commande inconnue », « distributeur injoignable », « autre source »,
« distributeur change » — et « erreur au depart » si le depart lui-meme a
casse. Un repas tombe pendant un redemarrage de Home Assistant n'est PAS
rattrape (decision 4 de l'utilisateur) : il est note « manque au
redemarrage », sans rien distribuer. Un repas ne part qu'une fois par jour et
par heure : la nuit du passage a l'heure d'hiver repete 02:00-03:00, et un
repas de 02:30 serait servi deux fois (contradicteur, 05/10).

Limite connue (contradicteur de C2, 05/10) : la nuit du passage a l'heure
d'ete, 02:00-02:59 n'existe pas. Home Assistant ne sonne pas ces minutes
(01:59 CET, puis 03:00 CEST, une minute plus tard en temps reel) : un repas de
02:30 ne part pas, et rien ne s'ecrit au journal. Le noter demande un mot de
journal de plus, donc une cle dans les six catalogues ; le servir a 03:00 est
une decision de l'utilisateur. Epingle par un test `xfail(strict=True)`.
"""
from __future__ import annotations

import asyncio
import datetime as _dt
import logging
import re
import time
from typing import TYPE_CHECKING, Any

from homeassistant.core import HomeAssistant, callback

from . import distributeur_appareil as da
from .refus import RefusNomme
from .regles import demarrer, niveau
from .robots import est_du, lire_heure

if TYPE_CHECKING:  # l'annotation seule — les tests chargent ce module hors paquet
    from .store import LoggiaStore

_LOGGER = logging.getLogger(__name__)

CLE = "loggia_distributeurs"
# La configuration du distributeur (Parametres) : appareil, entites designees,
# script, et pour la migration l'ancienne liste (`meals`) et `associees`.
CLE_FEEDER = "loggia_feeder"
# L'ancienne forme, un objet par domaine : lue a defaut de `loggia_feeder`.
CLE_ENTITES = "loggia_entities"
MODULE = "distributeurs"

MAX_REPAS = 12
PORTIONS_MAX = 20
IDENT = re.compile(r"^[a-z0-9_-]{1,40}$")
# Un repas tombe depuis moins de 30 min au demarrage est note « manque ».
FENETRE_MANQUE = _dt.timedelta(minutes=30)
# Tuya officielle : delai de la reponse, et sa duree de vie en cache.
DELAI_TUYA = 5.0
CACHE_TUYA = 10 * 60
# Une ERREUR ne se garde qu'une minute (relecture, 05/10) : gardee 10 min, une
# panne du nuage vue fiche ouverte masquait le programme revenu entre-temps.
# Une minute, et pas zero : la fiche sonde toutes les 15 s, une panne ne doit
# pas marteler le nuage a ce rythme. Le DEPART, lui, relit toujours.
CACHE_TUYA_ERREUR = 60

# Un repas planifie est du confort, comme un robot : la surete, la presence et
# la nuit passent devant si elles tiennent la commande.
PRIORITE = niveau("confort", 2)

# Ce qui empeche d'AJOUTER un repas, nomme apres les deux-points du refus
# `ajout_refuse` : l'ecran le dit dans sa langue (refus.js). Un geste ordinaire
# le provoque — une automatisation creee depuis le dernier sondage de la
# fiche —, il ne part donc pas en `invalid_format`, dont l'ecran n'affiche que
# le francais sans accents du serveur (contradicteur, 05/10).
REFUS_SOURCE = "source"
REFUS_COMMANDE = "commande"


# ── Ce qui se calcule, sans Home Assistant ──────────────────────────────────

def normaliser_repas(brut) -> dict:
    """Un repas propre, ou ValueError — on n'enregistre pas un a-peu-pres."""
    if not isinstance(brut, dict):
        raise ValueError("un repas est un objet")
    ident = str(brut.get("id") or "")
    if not IDENT.match(ident):
        raise ValueError("identifiant de repas invalide : %r" % (ident,))
    heure = lire_heure(brut.get("heure"))
    if heure is None:
        raise ValueError("heure invalide : %r" % (brut.get("heure"),))
    jours = brut.get("jours")
    if not isinstance(jours, list) or any(isinstance(j, bool) or not isinstance(j, int) or not 0 <= j <= 6 for j in jours):
        raise ValueError("jours invalides : de 0 (lundi) a 6 (dimanche)")
    portions = brut.get("portions", 1)
    if isinstance(portions, bool) or not isinstance(portions, int) or not 1 <= portions <= PORTIONS_MAX:
        raise ValueError("portions invalides : de 1 a %d" % PORTIONS_MAX)
    return {"id": ident, "heure": "%02d:%02d" % heure, "jours": sorted(set(jours)),
            "portions": portions, "actif": bool(brut.get("actif", True))}


def _appareil(v) -> str | None:
    return v.strip() if isinstance(v, str) and v.strip() else None


def normaliser(brut) -> dict:
    """Le planning entier, relu. Ce qui est illisible est ECARTE au chargement
    — un fichier abime ne doit pas tout eteindre ; a l'ecriture,
    `async_enregistrer` refuse au lieu d'ecarter."""
    cfg: dict[str, Any] = {"appareil": None, "repas": []}
    if not isinstance(brut, dict):
        return cfg
    cfg["appareil"] = _appareil(brut.get("appareil"))
    liste = brut.get("repas")
    vus = set()
    for r in (liste if isinstance(liste, list) else [])[:MAX_REPAS]:
        try:
            propre = normaliser_repas(r)
        except ValueError:
            continue
        if propre["id"] in vus:
            continue
        vus.add(propre["id"])
        cfg["repas"].append(propre)
    return cfg


def sources(programme: dict | None, automatisations: list | None, planning: dict | None) -> dict:
    """{programme, automatisations, loggia}, chacune {presente, active}.

    PRESENTE : la source existe ; ACTIVE : elle distribue (ADR 0155). Une
    automatisation compte des qu'elle est dans la liste — reconnue par ses
    actions, ou indice (ancienne liste, associee a la main) : un indice qu'on
    ne sait pas lire distribue peut-etre, et un repas en double est le risque
    le plus grave. Allumee = `on`.
    """
    p = programme or {}
    autos = [a for a in (automatisations or []) if isinstance(a, dict)]
    repas = (planning or {}).get("repas") or []
    return {
        "programme": {"presente": bool(p.get("presente")), "active": bool(p.get("active"))},
        "automatisations": {"presente": bool(autos), "active": any(a.get("etat") == "on" for a in autos)},
        "loggia": {"presente": bool(repas), "active": any(r.get("actif") for r in repas)},
    }


def source_active(s: dict) -> str | None:
    """La source qui distribue, dans l'ordre de la decision : l'appareil, puis
    les automatisations, puis Loggia ; None si aucune n'est active."""
    if s["programme"]["active"]:
        return "appareil"
    if s["automatisations"]["active"]:
        return "automatisations"
    if s["loggia"]["active"]:
        return "loggia"
    return None


def superieure_active(s: dict) -> bool:
    """Une source AU-DESSUS du planning de Loggia distribue : il se retient.
    Un programme present mais illisible n'est pas actif (ADR 0155) : il ne
    retient pas un repas Loggia deja la."""
    return s["programme"]["active"] or s["automatisations"]["active"]


def refus_ajout(s: dict, commande: dict | None) -> str | None:
    """Ce qui empeche d'ajouter un repas : une source superieure PRESENTE
    (`REFUS_SOURCE`, d'abord : c'est elle qui distribue), sinon l'absence de
    commande (`REFUS_COMMANDE`) ; None quand l'ajout est permis."""
    if s["programme"]["presente"] or s["automatisations"]["presente"]:
        return REFUS_SOURCE
    return REFUS_COMMANDE if commande is None else None


def peut_planifier(s: dict, commande: dict | None) -> bool:
    """« Ajouter un repas » : aucune source superieure PRESENTE, et une commande."""
    return refus_ajout(s, commande) is None


def ancienne_liste(feeder: Any) -> dict:
    """L'ancienne liste de Parametres, comptee pour l'encart de migration :
    `{n, relies, non_relies: [{heure, label}]}`. Reliee = une `automation.*`."""
    meals = feeder.get("meals") if isinstance(feeder, dict) else None
    meals = [m for m in (meals if isinstance(meals, list) else []) if isinstance(m, dict)]
    relie = [isinstance(m.get("auto"), str) and m["auto"].startswith("automation.") for m in meals]

    def texte(v):
        return v if v is None or isinstance(v, str) else str(v)

    return {"n": len(meals), "relies": sum(relie),
            "non_relies": [{"heure": texte(m.get("time")), "label": texte(m.get("label"))}
                           for m, r in zip(meals, relie) if not r]}


def indices(feeder: Any) -> dict:
    """Les automatisations nommees par l'ancienne liste, et celles associees a
    la main : montrees meme si leurs actions ne les font pas reconnaitre."""
    f = feeder if isinstance(feeder, dict) else {}
    meals = f.get("meals") if isinstance(f.get("meals"), list) else []
    associees = f.get("associees") if isinstance(f.get("associees"), list) else []
    return {
        "ancienne_liste": sorted({m["auto"] for m in meals if isinstance(m, dict)
                                  and isinstance(m.get("auto"), str) and m["auto"].startswith("automation.")}),
        "associee": sorted({a for a in associees if isinstance(a, str) and a.startswith("automation.")}),
    }


def repas_manques(planning: dict, maintenant: _dt.datetime) -> list[tuple[dict, _dt.datetime]]:
    """Les repas ACTIFS dont l'heure est passee depuis moins de 30 min :
    (repas, quand). Hier compris, pour un repas de 23:50 vu a 00:10."""
    sortie = []
    for r in (planning or {}).get("repas") or []:
        if not r.get("actif"):
            continue
        h = lire_heure(r.get("heure"))
        if h is None:
            continue
        for decale in (0, 1):
            jour = (maintenant - _dt.timedelta(days=decale)).date()
            quand = maintenant.replace(year=jour.year, month=jour.month, day=jour.day,
                                       hour=h[0], minute=h[1], second=0, microsecond=0)
            if jour.weekday() in (r.get("jours") or []) and maintenant - FENETRE_MANQUE <= quand < maintenant:
                sortie.append((r, quand))
    return sortie


def script_designe(feeder: Any) -> str | None:
    """Le script DESIGNE dans Parametres — jamais un script devine a son nom."""
    s = feeder.get("script") if isinstance(feeder, dict) else None
    return s.strip() if isinstance(s, str) and s.strip().startswith("script.") else None


def _motif(repas: dict) -> tuple[str, dict]:
    return ("repas {heure}", {"heure": repas["heure"]})


def _commande_publique(commande: dict | None) -> dict | None:
    """Ce que l'ecran a besoin de savoir de la commande — sans entity_id ni
    donnees : il la retrouve par sa propre table (`commandeDistribuer`)."""
    if not commande:
        return None
    return {k: commande.get(k) for k in ("domaine", "quantite", "min", "max", "pas")}


def _journal_pour(lignes: list, lecture) -> list:
    """Le journal tel qu'un compte peut le lire : les `cibles` qu'il ne peut
    pas LIRE se taisent, leur nombre `n` reste (relecture du 05/10 — l'etat
    ouvert a tout compte portait l'entity_id de la commande que
    `_commande_publique` prend soin de taire). Des COPIES : le journal du socle
    n'est pas touche. `lecture` None : tout se lit."""
    if lecture is None:
        return lignes
    return [{**e, "cibles": [c for c in (e.get("cibles") or []) if isinstance(c, str) and lecture(c)]}
            if isinstance(e, dict) else e for e in lignes]


class LoggiaDistributeurs:
    """Calcule les sources du distributeur et tient le planning de Loggia."""

    def __init__(self, hass: HomeAssistant, store: "LoggiaStore", regles=None) -> None:
        self.hass = hass
        self.store = store
        # Le socle commun : journal et priorites. PAS de `suivre` (voir en tete).
        self.regles = regles
        self.cfg: dict[str, Any] = {"appareil": None, "repas": []}
        self._defait: list[Any] = []
        self._registre_dit = False
        # {device_id: (horodatage, reponse)} — Tuya officielle, 10 min.
        self._tuya: dict[str, tuple[float, Any]] = {}
        # Resout l'identifiant de registre d'une device action : None = celui
        # de Home Assistant (automatisations._registre_ha). Les tests le posent.
        self._ids_registre: Any = None
        # {id du repas: (jour, (heure, minute))} du dernier depart TENTE : un
        # repas ne part qu'une fois par jour et par heure (heure d'hiver).
        self._tentes: dict[str, tuple] = {}
        demarrer(hass, self, self._async_demarrer(), "distributeurs")

    async def _async_demarrer(self) -> None:
        self.cfg = await self.async_config()
        # Le tic D'ABORD : noter un repas manque ne doit jamais empecher les
        # suivants de partir (contradicteur, 05/10 — une note qui levait
        # laissait le planning muet jusqu'au redemarrage suivant).
        self._reabonner()
        try:
            await self.async_noter_manques()
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Loggia distributeurs : repas manques non notes au demarrage")

    def _reabonner(self) -> None:
        for defaire in self._defait:
            try:
                defaire()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia distributeurs : abonnement deja retire")
        self._defait.clear()
        # PAS de `self.regles.suivre(...)` : une ration manuelle ne doit jamais
        # geler la commande ni retenir le repas suivant (en tete du module).
        actifs = [r for r in self.cfg.get("repas") or [] if r.get("actif")]
        if not actifs:
            return
        from homeassistant.helpers.event import async_track_time_change

        # Un tic par minute, a la seconde zero : douze repas au plus a comparer.
        self._defait.append(async_track_time_change(self.hass, self._sur_minute, second=0))
        _LOGGER.info("Loggia distributeurs : %d repas actif(s)", len(actifs))

    @callback
    def _sur_minute(self, now) -> None:
        self.hass.async_create_task(self.async_minute(now))

    def _maintenant(self) -> _dt.datetime:
        from homeassistant.util import dt as dt_util

        return dt_util.now()

    async def async_minute(self, quand=None) -> list:
        """Lance ce qui tombe a cette minute. Rend les repas PARTIS."""
        if quand is None:
            quand = self._maintenant()
        tentes = getattr(self, "_tentes", None)
        if tentes is None:
            tentes = self._tentes = {}
        partis = []
        for repas in list(self.cfg.get("repas") or []):
            if not est_du(repas, quand):
                continue
            # La nuit du passage a l'heure d'hiver, 02:30 sonne deux fois : un
            # repas deja tente ce jour a cette heure ne repart pas.
            cle = (quand.date(), (quand.hour, quand.minute))
            if tentes.get(repas["id"]) == cle:
                continue
            tentes[repas["id"]] = cle
            if getattr(quand, "fold", 0) and await self._tente_a_la_premiere_occurrence(repas, quand):
                continue
            try:
                if await self.async_lancer(repas, quand):
                    partis.append(repas["id"])
            except Exception:  # noqa: BLE001
                # Un depart qui casse ne coupe pas les autres repas de la
                # minute, et laisse sa ligne : « pourquoi n'a-t-il pas mange ? »
                _LOGGER.exception("Loggia distributeurs : depart du repas %s impossible", repas.get("heure"))
                try:
                    await self.regles.noter(MODULE, "repas", "retenu", cibles=[], n=0,
                                            motif=_motif(repas), detail="erreur au depart")
                except Exception:  # noqa: BLE001
                    _LOGGER.debug("Loggia distributeurs : journal indisponible")
        return partis

    async def _tente_a_la_premiere_occurrence(self, repas: dict, quand: _dt.datetime) -> bool:
        """L'heure REPETEE (fold=1) : le journal montre-t-il ce repas tente a
        la premiere occurrence de cette heure ?

        `_tentes` ne vit qu'en memoire : un redemarrage de Home Assistant, ou un
        « Recharger » de l'integration, entre 02:30 CEST et 02:30 CET servait
        le repas une seconde fois (relecture, 05/10). Le journal, lui, survit.
        Lu SEULEMENT dans l'heure repetee, une nuit par an : un jour ordinaire,
        deux repas a la meme heure (motif identique, identifiants differents)
        partent l'un et l'autre."""
        debut, fin = quand.replace(fold=0).timestamp(), quand.timestamp()
        motif = "repas " + repas["heure"]
        try:
            lignes = await self.regles.journal(limite=500, module=MODULE)
        except Exception:  # noqa: BLE001 — sans journal, la memoire seule decide
            _LOGGER.debug("Loggia distributeurs : journal illisible a l'heure repetee", exc_info=True)
            return False
        return any(e.get("regle") == "repas" and e.get("motif") == motif
                   and debut <= (e.get("ts") or 0) < fin for e in lignes)

    async def async_noter_manques(self, maintenant=None) -> list:
        """Au demarrage : un repas tombe pendant le redemarrage n'est PAS servi
        en retard (decision 4) ; il est note « manque au redemarrage ». Un repas
        que le journal montre deja — parti ou retenu, a un rechargement de
        l'integration — ne l'est pas : rien n'a ete manque."""
        if maintenant is None:
            maintenant = self._maintenant()
        manques = repas_manques(self.cfg, maintenant)
        if not manques:
            return []
        lignes = await self.regles.journal(limite=500, module=MODULE)
        notes = []
        for repas, quand in manques:
            motif = _motif(repas)
            # La PREMIERE occurrence de l'heure (relecture, 05/10) : a l'heure
            # repetee, `quand` herite le fold de `maintenant`, et un repas servi
            # a 02:30 CEST passait pour manque a 02:40 CET.
            depuis = quand.replace(fold=0).timestamp()
            vu = any(e.get("regle") == "repas" and e.get("motif") == "repas " + repas["heure"]
                     and (e.get("ts") or 0) >= depuis for e in lignes)
            if vu:
                continue
            await self.regles.noter(MODULE, "repas", "retenu", cibles=[], n=0,
                                    motif=motif, detail="manque au redemarrage")
            notes.append(repas["id"])
        return notes

    # ── Ce que Home Assistant sait du distributeur ─────────────────────────
    def _registre(self):
        """Le registre des entites, ou None — en le disant une fois."""
        try:
            from homeassistant.helpers import entity_registry as er

            return er.async_get(self.hass)
        except Exception:  # noqa: BLE001
            if not getattr(self, "_registre_dit", False):
                self._registre_dit = True
                _LOGGER.warning("Loggia distributeurs : registre des entites illisible — "
                                "le distributeur ne se reconnait que par ses entites designees",
                                exc_info=True)
            return None

    def _fiche_appareil(self, device_id: str | None) -> dict | None:
        """{device_id, nom, fabricant, modele} depuis le registre des appareils."""
        if not device_id:
            return None
        info: dict[str, Any] = {"device_id": device_id, "nom": None, "fabricant": None, "modele": None}
        try:
            from homeassistant.helpers import device_registry as dr

            entree = dr.async_get(self.hass).async_get(device_id)
        except Exception:  # noqa: BLE001
            entree = None
        if entree is not None:
            def texte(v):
                return v if v is None or isinstance(v, str) else str(v)
            info.update(nom=texte(getattr(entree, "name_by_user", None) or getattr(entree, "name", None)),
                        fabricant=texte(getattr(entree, "manufacturer", None)),
                        modele=texte(getattr(entree, "model", None)))
        return info

    def _services(self) -> list[str]:
        """Les services qui disent qu'un appareil tient un programme."""
        vus = []
        for nom in tuple(da.SERVICES_PETSAFE) + (da.SERVICE_TUYA_PROGRAMME,):
            domaine, service = nom.split(".", 1)
            try:
                if self.hass.services.has_service(domaine, service):
                    vus.append(nom)
            except Exception:  # noqa: BLE001
                continue
        return vus

    async def _feeder(self) -> dict:
        """`loggia_feeder`, a defaut l'ancien `loggia_entities.feeder` — comme
        l'ecran (`loggiaEnt`, state.js) : une configuration heritee avait sa
        carte et son « Distribuer », mais le serveur n'y voyait ni commande ni
        automatisation (relecture « donnees », 05/10). Une description VIDEE
        volontairement (`{}`) reste vide : seule l'ABSENCE de la cle retombe."""
        try:
            brut = await self.store.async_get_shared(CLE_FEEDER, None)
            if brut is None:
                ancien = await self.store.async_get_shared(CLE_ENTITES, None)
                brut = ancien.get("feeder") if isinstance(ancien, dict) else None
        except Exception:  # noqa: BLE001
            _LOGGER.warning("Loggia distributeurs : configuration du distributeur illisible", exc_info=True)
            brut = None
        return brut if isinstance(brut, dict) else {}

    async def _lire_tuya(self, device_id: str | None, frais: bool = False) -> Any:
        """La reponse de `tuya.get_feeder_meal_plan`, 5 s au plus, gardee
        10 min — une erreur, une minute. Toute erreur rend None : `lire_tuya`
        dit « non lisible », jamais une panne. `frais` : le cache ne sert pas
        (le depart d'un repas)."""
        if not device_id:
            return None
        cache = getattr(self, "_tuya", None)
        if cache is None:
            cache = self._tuya = {}
        garde = cache.get(device_id)
        if not frais and garde is not None:
            duree = CACHE_TUYA if garde[1] is not None else CACHE_TUYA_ERREUR
            if time.time() - garde[0] < duree:
                return garde[1]
        domaine, service = da.SERVICE_TUYA_PROGRAMME.split(".", 1)
        try:
            async with asyncio.timeout(DELAI_TUYA):
                reponse = await self.hass.services.async_call(
                    domaine, service, {"device_id": device_id}, blocking=True, return_response=True)
        except Exception:  # noqa: BLE001 — « non lisible ici », jamais une panne
            _LOGGER.debug("Loggia distributeurs : programme Tuya illisible", exc_info=True)
            reponse = None
        cache[device_id] = (time.time(), reponse)
        return reponse

    async def _decrire(self, feeder: dict, detail: bool, frais: bool = False) -> dict:
        """Ce que l'appareil dit de lui. `detail` : la Tuya officielle est
        interrogee (fiche ouverte, depart d'un repas) ; jamais au sondage.
        `frais` : sans le cache — le depart relit, c'est la que se joue une
        double ration (ADR 0155 ; relecture du 05/10)."""
        services = self._services()
        etats = getattr(self.hass, "states", None)
        d = da.decrire_appareil(feeder, self._registre(), etats, services)
        if detail and da.tuya_a_lire(d["soeurs"], services):
            reponse = await self._lire_tuya(d["appareil"], frais=frais)
            d["programme"] = da.programme_appareil(d["soeurs"], etats, services, reponse)
        return d

    def _automatisations(self, feeder: dict, d: dict) -> list:
        """Les automatisations qui commandent le distributeur, resumees sous
        les droits de la MAISON : [(element, id_config)]. Les droits d'un
        compte s'appliquent ensuite par `pour_compte`, sans second parcours
        (relecture du 05/10 : un compte ordinaire le payait deux fois)."""
        from .automatisations import resumer_maison

        script = script_designe(feeder)
        commande = d["commande"]["entity_id"] if d.get("commande") else None
        try:
            return resumer_maison(self.hass, d["cibles_de_commande"], [d["appareil"]] if d["appareil"] else [],
                                  [script] if script else [], indices(feeder),
                                  commande=commande, registre=getattr(self, "_ids_registre", None))
        except Exception:  # noqa: BLE001
            # Une automatisation illisible ne doit pas couper la fiche ni le
            # depart : sans liste, aucune source superieure n'est vue — le
            # journal de Home Assistant le dit.
            _LOGGER.exception("Loggia distributeurs : automatisations illisibles")
            return []

    async def async_sources(self, user=None, detail: bool = False) -> dict:
        """Les sources, telles que le serveur les tient : `{sources, source,
        peutPlanifier, appareil, commande}` — sous les droits de la maison
        quand `user` est None (le depart d'un repas)."""
        from .automatisations import pour_compte

        feeder = await self._feeder()
        d = await self._decrire(feeder, detail)
        s = sources(d["programme"], pour_compte(self._automatisations(feeder, d), user), self.cfg)
        return {"sources": s, "source": source_active(s), "refus": refus_ajout(s, d["commande"]),
                "peutPlanifier": peut_planifier(s, d["commande"]),
                "appareil": d["appareil"], "commande": d["commande"]}

    # ── Le depart ──────────────────────────────────────────────────────────
    async def async_lancer(self, repas: dict, quand=None) -> bool:
        """Distribue un repas, ou dit au journal ce qui l'a retenu."""
        motif = _motif(repas)

        async def retenu(pourquoi: str) -> bool:
            await self.regles.noter(MODULE, "repas", "retenu", cibles=[], n=0,
                                    motif=motif, detail=pourquoi)
            return False

        feeder = await self._feeder()
        # Tout est RELU au depart, Tuya compris (ADR 0155) : la configuration,
        # l'appareil, ses soeurs, la commande, et les sources superieures.
        d = await self._decrire(feeder, detail=True, frais=True)
        commande = d["commande"]
        if commande is None:
            return await retenu("commande inconnue")
        etats = getattr(self.hass, "states", None)
        etat = etats.get(commande["entity_id"]) if etats is not None else None
        if etat is None or getattr(etat, "state", None) == da.MUET:
            return await retenu("distributeur injoignable")
        from .automatisations import pour_compte

        s = sources(d["programme"], pour_compte(self._automatisations(feeder, d), None), self.cfg)
        if superieure_active(s):
            return await retenu("autre source")
        if d["appareil"] != self.cfg.get("appareil"):
            return await retenu("distributeur change")
        envoi = da.envoi(commande, repas.get("portions", 1))
        if envoi is None:
            return await retenu("commande inconnue")
        data = {k: v for k, v in envoi["data"].items() if k != "entity_id"}
        partis = await self.regles.agir(MODULE, "repas", envoi["domaine"], envoi["service"],
                                        [commande["entity_id"]], data or None,
                                        quoi="distribuer", motif=motif, priorite=PRIORITE)
        return bool(partis)

    # ── Ce que l'interface lit et ecrit ────────────────────────────────────
    async def async_config(self) -> dict[str, Any]:
        return normaliser(await self.store.async_get_shared(CLE, None))

    async def async_etat(self, user=None, detail: bool = False) -> dict[str, Any]:
        """La reponse de `loggia/distributeurs/etat` (contrat de l'ADR 0155).

        Un RESUME : jamais raw_config, ni entity_id de commande, ni donnees
        brutes. Les automatisations sont filtrees par les droits de `user` ;
        les SOURCES, elles, sont celles de la maison — c'est sur elles que le
        serveur retient ou non un repas, l'ecran doit dire la meme chose.
        """
        from .automatisations import pour_compte
        from .discovery import _lecture_autorisee

        feeder = await self._feeder()
        planning = await self.async_config()
        d = await self._decrire(feeder, detail)
        paires = self._automatisations(feeder, d)
        autos = pour_compte(paires, user)
        s = sources(d["programme"], pour_compte(paires, None), planning)
        notes = list(d.get("notes") or [])
        if planning["repas"] and planning.get("appareil") != d["appareil"]:
            notes.append({"code": "distributeur_change"})
        if getattr(self, "demarrage", None) is False:
            notes.append({"code": "demarrage_impossible"})
        return {
            "source": source_active(s),
            "sources": s,
            "appareil": self._fiche_appareil(d["appareil"]),
            "programme": d["programme"],
            "automatisations": autos,
            "planning": planning,
            "peutPlanifier": peut_planifier(s, d["commande"]),
            "commande": _commande_publique(d["commande"]),
            "ancienne_liste": ancienne_liste(feeder),
            "notes": notes,
            "journal": _journal_pour(await self.regles.journal(limite=20, module=MODULE),
                                     _lecture_autorisee(user)),
        }

    def _poser_patch(self, cfg: dict[str, Any], patch: dict[str, Any], appareil: str | None,
                     refus: str | None) -> None:
        """`repas` REMPLACE la liste, et l'appareil du moment est retenu avec
        elle (« distributeur change » au depart s'il change ensuite). Tout est
        relu : une valeur illisible est refusee, pas ecartee — et rien n'est
        ecrit. Synchrone : sous le verrou du magasin."""
        patch = patch or {}
        if "repas" not in patch:
            return
        liste = patch["repas"]
        if not isinstance(liste, list):
            raise ValueError("repas : une liste")
        if len(liste) > MAX_REPAS:
            raise RefusNomme("trop_de_repas", "trop de repas, au plus", MAX_REPAS)
        propres = [normaliser_repas(r) for r in liste]
        if len({r["id"] for r in propres}) != len(propres):
            raise ValueError("deux repas portent le meme identifiant")
        # Le serveur tient la regle, pas seulement l'ecran (ADR 0155) : un
        # repas NOUVEAU n'entre que sans source superieure presente et avec une
        # commande. Modifier, couper ou supprimer un repas existant reste permis.
        # Le refus porte son CODE et sa raison (`REFUS_SOURCE`, `REFUS_COMMANDE`).
        anciens = {r["id"] for r in cfg["repas"]}
        if refus is not None and any(r["id"] not in anciens for r in propres):
            raise RefusNomme("ajout_refuse", "ajout de repas refuse", refus)
        cfg["repas"] = propres
        cfg["appareil"] = appareil

    async def async_enregistrer(self, patch: dict[str, Any]) -> dict[str, Any]:
        """D'un seul tenant, sous le verrou du magasin (lot 15 de l'audit du
        03/10). Un refus n'ecrit rien. Un patch vide (rechargement apres un
        import) relit et reabonne seulement."""
        appareil, refus = None, REFUS_SOURCE
        if isinstance(patch, dict) and "repas" in patch:
            # Hors du verrou : on LIT seulement (loggia_feeder, le registre,
            # les automatisations) ; l'ecriture se juge sous le verrou.
            etat = await self.async_sources(None, detail=True)
            appareil, refus = etat["appareil"], etat["refus"]

        def changer(brut: Any) -> dict[str, Any]:
            cfg = normaliser(brut)
            self._poser_patch(cfg, patch, appareil, refus)
            return cfg

        cfg = await self.store.async_modifier_shared(CLE, changer)
        self.cfg = cfg
        self._reabonner()
        return cfg

    @callback
    def async_arreter(self) -> None:
        for defaire in self._defait:
            try:
                defaire()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia distributeurs : desabonnement sans effet")
        self._defait.clear()
