"""Le planning des robots : l'aspirateur et la tondeuse partent a l'heure dite.

Pourquoi ce module existe
─────────────────────────
Aucun robot ne publie son planning dans Home Assistant, et aucun service commun
ne permet de l'ecrire : celui de l'application du fabricant reste invisible
d'ici. Les maquettes du 17/09 montrent pourtant un onglet Planification et une
tuile « Prochain passage » (ADR 0043). Rien sans source : la source, c'est donc
Loggia — un planning tenu cote serveur, qui part meme quand aucun ecran n'est
ouvert.

Ce qui retient un depart
────────────────────────
  * le robot est injoignable, ou deja en route ;
  * « Ne pas deranger » : une plage, par robot, ou Loggia ne le lance jamais ;
  * la pluie, pour une tondeuse, quand la meteo de la maison le dit ;
  * une MAIN : quelqu'un vient de le renvoyer a sa base — le socle le gele.

Chaque depart retenu laisse une ligne au journal, avec son motif : « pourquoi
n'est-il pas parti ce matin ? » a une reponse. Un depart manque — Home
Assistant redemarrait a cette minute-la — ne se rattrape pas : un robot qui
part a l'improviste est pire qu'un passage saute.

Nettoyer des PIECES
───────────────────
Il n'existe pas de service commun : chaque integration a le sien. Le planning
garde donc les segments tels que le robot les numerote, et envoie la commande
que SON integration attend. Integration inconnue : le robot part pour un
passage complet, et le journal le dit — plutot qu'une commande au hasard.
"""
from __future__ import annotations

import logging
import re
from typing import TYPE_CHECKING, Any

from homeassistant.core import HomeAssistant, callback

from .regles import Regles, demarrer, niveau

if TYPE_CHECKING:  # l'annotation seule — les tests chargent ce module hors paquet
    from .store import LoggiaStore

_LOGGER = logging.getLogger(__name__)

CLE = "loggia_robots"
CLE_METEO = "loggia_weather"
MODULE = "robots"

MAX_PLANNINGS = 24
MAX_ZONES = 30
MAX_SEGMENTS = 20

ROBOT = re.compile(r"^(vacuum|lawn_mower)\.[a-z0-9_]+$")
IDENT = re.compile(r"^[a-z0-9_-]{1,40}$")
AIRE = re.compile(r"(^|_)(zone|area)_")

# Ce que la meteo appelle « il pleut » — ou pire. Une tondeuse ne sort pas.
PLUIE = {"rainy", "pouring", "lightning-rainy", "snowy", "snowy-rainy", "hail"}

CALME_DEFAUT: dict[str, Any] = {"actif": False, "debut": "22:00", "fin": "07:00"}

# Un depart planifie est du confort : la surete, la presence et la nuit passent
# devant s'ils tiennent le robot.
PRIORITE = niveau("confort", 2)


# ── Ce qui se calcule, sans Home Assistant ──────────────────────────────────

def lire_heure(hhmm) -> tuple[int, int] | None:
    """« 09:30 » -> (9, 30). None si ce n'est pas une heure."""
    minutes = Regles._minutes(hhmm)
    return None if minutes is None else (minutes // 60, minutes % 60)


def phase(etat) -> str:
    """La phase d'un robot, d'apres l'etat normalise par Home Assistant."""
    s = str(etat if etat is not None else "").lower()
    if s in ("", "unavailable", "unknown", "none"):
        return "absent"
    if s in ("cleaning", "mowing"):
        return "travail"
    if s == "paused":
        return "pause"
    if s == "returning":
        return "retour"
    if s == "docked":
        return "base"
    if s == "error":
        return "erreur"
    return "repos"


def est_du(planning: dict, quand) -> bool:
    """Ce planning tombe-t-il a cette minute ? Lundi vaut 0, comme `weekday()`."""
    if not planning.get("actif"):
        return False
    heure = lire_heure(planning.get("heure"))
    if heure is None:
        return False
    return quand.weekday() in (planning.get("jours") or []) and (quand.hour, quand.minute) == heure


def il_pleut(etat_meteo) -> bool:
    """La meteo de la maison dit-elle qu'il pleut ? Muette, elle ne retient rien."""
    return str(getattr(etat_meteo, "state", "") or "").lower() in PLUIE


def commande_pieces(plateforme, segments) -> tuple[str, str, dict] | None:
    """La commande qui nettoie des pieces, telle que l'integration l'attend.

    Rend (domaine, service, data) — sans `entity_id`, que le socle ajoute — ou
    None quand l'integration est inconnue : pas de commande au hasard.
    """
    segs = [s for s in (segments or []) if isinstance(s, int) and not isinstance(s, bool)]
    if not segs:
        return None
    if plateforme == "ecovacs":
        return ("vacuum", "send_command",
                {"command": "spot_area", "params": {"rooms": ",".join(str(s) for s in segs), "cleanings": 1}})
    if plateforme == "roborock":
        return ("vacuum", "send_command", {"command": "app_segment_clean", "params": segs})
    if plateforme in ("dreame_vacuum", "xiaomi_miio"):
        return (plateforme, "vacuum_clean_segment", {"segments": segs})
    return None


def aires_de(entrees, appareil) -> list[str]:
    """Les interrupteurs d'aire d'une tondeuse : ceux de SON appareil, reconnus
    a leur cle de traduction, a defaut a leur identifiant."""
    if not appareil:
        return []
    trouvees = []
    for e in entrees or []:
        haid = str(getattr(e, "entity_id", "") or "")
        if not haid.startswith("switch.") or getattr(e, "device_id", None) != appareil:
            continue
        if getattr(e, "disabled_by", None):
            continue
        if getattr(e, "translation_key", None) == "area" or AIRE.search(haid.split(".", 1)[1]):
            trouvees.append(haid)
    return sorted(trouvees)


def lire_plage(brut, defaut: dict) -> dict:
    """Une plage {actif, debut, fin} relue ; une heure illisible est refusee."""
    plage = dict(defaut)
    if not isinstance(brut, dict):
        return plage
    plage["actif"] = bool(brut.get("actif"))
    for borne in ("debut", "fin"):
        if borne in brut:
            heure = lire_heure(brut[borne])
            if heure is None:
                raise ValueError("heure invalide : %r" % (brut[borne],))
            plage[borne] = "%02d:%02d" % heure
    return plage


def normaliser_planning(brut) -> dict:
    """Un planning propre, ou ValueError — on n'enregistre pas un a-peu-pres."""
    if not isinstance(brut, dict):
        raise ValueError("un planning est un objet")
    ident = str(brut.get("id") or "")
    if not IDENT.match(ident):
        raise ValueError("identifiant de planning invalide : %r" % (ident,))
    robot = str(brut.get("robot") or "")
    if not ROBOT.match(robot):
        raise ValueError("robot invalide : %r" % (robot,))
    heure = lire_heure(brut.get("heure"))
    if heure is None:
        raise ValueError("heure invalide : %r" % (brut.get("heure"),))
    jours = brut.get("jours")
    if not isinstance(jours, list) or any(isinstance(j, bool) or not isinstance(j, int) or not 0 <= j <= 6 for j in jours):
        raise ValueError("jours invalides : de 0 (lundi) a 6 (dimanche)")
    zones_brutes = brut.get("zones") or []
    if not isinstance(zones_brutes, list) or len(zones_brutes) > MAX_ZONES:
        raise ValueError("zones invalides")
    zones = []
    for z in zones_brutes:
        if not isinstance(z, dict) or not str(z.get("id") or "").strip():
            raise ValueError("zone invalide")
        segments = z.get("segments") or []
        if (not isinstance(segments, list) or len(segments) > MAX_SEGMENTS
                or any(isinstance(s, bool) or not isinstance(s, int) for s in segments)):
            raise ValueError("segments invalides pour la zone %r" % (z.get("id"),))
        zones.append({"id": str(z["id"])[:80], "nom": str(z.get("nom") or z["id"])[:60], "segments": list(segments)})
    return {"id": ident, "robot": robot, "heure": "%02d:%02d" % heure,
            "jours": sorted(set(jours)), "zones": zones, "actif": bool(brut.get("actif", True))}


def reglages_defaut() -> dict:
    return {"calme": dict(CALME_DEFAUT), "pluie": {"actif": False}}


def normaliser(brut) -> dict:
    """La configuration entiere, relue. Ce qui est illisible est ECARTE au
    chargement — un fichier abime ne doit pas tout eteindre ; a l'ecriture,
    `async_enregistrer` refuse au lieu d'ecarter."""
    cfg: dict[str, Any] = {"plannings": [], "robots": {}}
    if not isinstance(brut, dict):
        return cfg
    liste = brut.get("plannings")
    vus = set()
    for p in (liste if isinstance(liste, list) else [])[:MAX_PLANNINGS]:
        try:
            propre = normaliser_planning(p)
        except ValueError:
            continue
        if propre["id"] in vus:
            continue
        vus.add(propre["id"])
        cfg["plannings"].append(propre)
    robots = brut.get("robots")
    for haid, reglages in (robots.items() if isinstance(robots, dict) else []):
        if not isinstance(haid, str) or not ROBOT.match(haid) or not isinstance(reglages, dict):
            continue
        pluie = reglages.get("pluie")
        try:
            cfg["robots"][haid] = {"calme": lire_plage(reglages.get("calme"), CALME_DEFAUT),
                                   "pluie": {"actif": bool(pluie.get("actif")) if isinstance(pluie, dict) else False}}
        except ValueError:
            continue
    return cfg


class LoggiaRobots:
    """Tient le planning des robots et les lance a l'heure."""

    def __init__(self, hass: HomeAssistant, store: "LoggiaStore", regles=None) -> None:
        self.hass = hass
        self.store = store
        # Le socle commun : journal, geste manuel, priorites — voir `regles.py`.
        self.regles = regles
        self.cfg: dict[str, Any] = {"plannings": [], "robots": {}}
        self._defait: list[Any] = []
        # Un registre illisible ne se signale qu'une fois (voir `_registre`).
        self._registre_dit = False
        demarrer(hass, self, self._async_demarrer(), "robots")

    async def _async_demarrer(self) -> None:
        self.cfg = await self.async_config()
        self._reabonner()

    def _reabonner(self) -> None:
        for defaire in self._defait:
            try:
                defaire()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia robots : abonnement deja retire")
        self._defait.clear()
        actifs = [p for p in self.cfg.get("plannings") or [] if p.get("actif")]
        # Ce que ce module PILOTE est declare au socle : une main posee sur le
        # robot le gele, et le planning ne passe pas par-dessus.
        self.regles.suivre(MODULE, sorted({p["robot"] for p in actifs}))
        if not actifs:
            return
        from homeassistant.helpers.event import async_track_time_change

        # Un tic par minute, a la seconde zero : vingt-quatre plannings au plus
        # a comparer, rien qui pese.
        self._defait.append(async_track_time_change(self.hass, self._sur_minute, second=0))
        _LOGGER.info("Loggia robots : %d planning(s) actif(s)", len(actifs))

    @callback
    def _sur_minute(self, now) -> None:
        self.hass.async_create_task(self.async_minute(now))

    async def async_minute(self, quand=None) -> list:
        """Lance ce qui tombe a cette minute. Rend les plannings PARTIS."""
        if quand is None:
            from homeassistant.util import dt as dt_util

            quand = dt_util.now()
        partis = []
        for planning in list(self.cfg.get("plannings") or []):
            if est_du(planning, quand) and await self.async_lancer(planning, quand):
                partis.append(planning["id"])
        return partis

    # ── Ce que Home Assistant sait du robot ────────────────────────────────
    def _registre(self):
        """Le registre des entites, ou None — en le DISANT (24/09, plan M10).

        Sans registre, le robot perd sa plateforme et ses aires : le planning
        passe entier, et rien n'expliquait pourquoi. Une fois par vie du
        process suffit a le signaler : repete a chaque lecture, il noierait
        le journal de Home Assistant.
        """
        try:
            from homeassistant.helpers import entity_registry as er

            return er.async_get(self.hass)
        except Exception:  # noqa: BLE001
            if not self._registre_dit:
                self._registre_dit = True
                _LOGGER.warning(
                    "Loggia robots : registre des entites illisible — ni plateforme "
                    "ni aire, le planning passera entier", exc_info=True)
            return None

    def _entree(self, haid: str):
        registre = self._registre()
        try:
            return registre.async_get(haid) if registre is not None else None
        except Exception:  # noqa: BLE001
            return None

    def _plateforme(self, robot: str):
        return getattr(self._entree(robot), "platform", None)

    def _aires(self, robot: str) -> list[str]:
        registre = self._registre()
        try:
            entrees = list(registre.entities.values()) if registre is not None else []
        except Exception:  # noqa: BLE001
            entrees = []
        return aires_de(entrees, getattr(self._entree(robot), "device_id", None))

    async def _meteo(self):
        """L'entite meteo de la maison : celle choisie, sinon la premiere."""
        try:
            choisie = await self.store.async_get_shared(CLE_METEO, None)
        except Exception:  # noqa: BLE001
            _LOGGER.warning("Loggia robots : meteo de la maison illisible, la pluie ne retiendra rien", exc_info=True)
            choisie = None
        if isinstance(choisie, str) and choisie.startswith("weather.") and self.hass.states.get(choisie) is not None:
            return choisie
        try:
            toutes = sorted(self.hass.states.async_entity_ids("weather"))
        except Exception:  # noqa: BLE001
            _LOGGER.warning("Loggia robots : entites meteo illisibles, la pluie ne retiendra rien", exc_info=True)
            toutes = []
        return toutes[0] if toutes else None

    # ── Le depart ──────────────────────────────────────────────────────────
    async def async_lancer(self, planning: dict, quand) -> bool:
        """Lance un planning, ou dit au journal ce qui l'a retenu."""
        robot = planning["robot"]
        motif = ("planning {heure}", {"heure": planning["heure"]})
        ph = phase(getattr(self.hass.states.get(robot), "state", None))

        async def retenu(pourquoi: str) -> bool:
            await self.regles.noter(MODULE, "planning", "retenu", cibles=[robot], n=0,
                                    motif=motif, detail=pourquoi)
            return False

        if ph == "absent":
            return await retenu("robot injoignable")
        if ph in ("travail", "pause", "retour"):
            return await retenu("deja en route")
        reglages = (self.cfg.get("robots") or {}).get(robot) or {}
        if Regles.dans_la_plage(reglages.get("calme"), quand):
            return await retenu("ne pas deranger")
        tondeuse = robot.startswith("lawn_mower.")
        if tondeuse and (reglages.get("pluie") or {}).get("actif"):
            meteo = await self._meteo()
            if meteo and il_pleut(self.hass.states.get(meteo)):
                return await retenu("pluie")

        zones = planning.get("zones") or []
        noms = ", ".join(z["nom"] for z in zones)
        if tondeuse:
            choisies = [z["id"] for z in zones if str(z["id"]).startswith("switch.")]
            if choisies:
                # Les aires sont des interrupteurs : allumer les choisies,
                # eteindre les autres, puis tondre ce qui est allume.
                autres = [a for a in self._aires(robot) if a not in choisies]
                await self.regles.agir(MODULE, "planning", "switch", "turn_on", choisies,
                                       quoi="choisir les zones", motif=motif, priorite=PRIORITE)
                if autres:
                    await self.regles.agir(MODULE, "planning", "switch", "turn_off", autres,
                                           quoi="ecarter les zones", motif=motif, priorite=PRIORITE)
            partis = await self.regles.agir(MODULE, "planning", "lawn_mower", "start_mowing", [robot],
                                            quoi=("tondre : {noms}", {"noms": noms}) if noms else "tondre",
                                            motif=motif, priorite=PRIORITE)
            return bool(partis)

        segments = [s for z in zones for s in (z.get("segments") or [])]
        commande = commande_pieces(self._plateforme(robot), segments)
        if commande:
            domaine, service, data = commande
            partis = await self.regles.agir(MODULE, "planning", domaine, service, [robot], data,
                                            quoi=("nettoyer : {noms}", {"noms": noms}), motif=motif, priorite=PRIORITE)
            return bool(partis)
        quoi = "nettoyer" if not zones else "nettoyer tout (pieces inconnues de cette integration)"
        partis = await self.regles.agir(MODULE, "planning", "vacuum", "start", [robot],
                                        quoi=quoi, motif=motif, priorite=PRIORITE)
        return bool(partis)

    # ── Ce que l'interface lit et ecrit ────────────────────────────────────
    async def async_config(self) -> dict[str, Any]:
        return normaliser(await self.store.async_get_shared(CLE, None))

    async def async_etat(self) -> dict[str, Any]:
        return {
            "config": await self.async_config(),
            # La pluie ne retient une tondeuse que si la maison a une meteo :
            # sans elle, l'ecran ne propose pas le reglage.
            "meteo": await self._meteo(),
            "journal": await self.regles.journal(limite=20, module=MODULE),
        }

    async def async_enregistrer(self, patch: dict[str, Any]) -> dict[str, Any]:
        """`plannings` REMPLACE la liste ; `robots` se fusionne robot par robot.
        Tout est relu : une valeur illisible est refusee, pas ecartee."""
        cfg = await self.async_config()
        patch = patch or {}
        if "plannings" in patch:
            liste = patch["plannings"]
            if not isinstance(liste, list) or len(liste) > MAX_PLANNINGS:
                raise ValueError("%d plannings au plus" % MAX_PLANNINGS)
            propres = [normaliser_planning(p) for p in liste]
            if len({p["id"] for p in propres}) != len(propres):
                raise ValueError("deux plannings portent le meme identifiant")
            cfg["plannings"] = propres
        if "robots" in patch:
            if not isinstance(patch["robots"], dict):
                raise ValueError("robots : un objet par robot")
            for haid, reglages in patch["robots"].items():
                if not isinstance(haid, str) or not ROBOT.match(haid) or not isinstance(reglages, dict):
                    raise ValueError("robot invalide : %r" % (haid,))
                actuel = cfg["robots"].get(haid) or reglages_defaut()
                if "calme" in reglages:
                    if not isinstance(reglages["calme"], dict):
                        raise ValueError("calme : un objet {actif, debut, fin}")
                    actuel["calme"] = lire_plage({**actuel["calme"], **reglages["calme"]}, CALME_DEFAUT)
                if "pluie" in reglages:
                    if not isinstance(reglages["pluie"], dict):
                        raise ValueError("pluie : un objet {actif}")
                    actuel["pluie"] = {"actif": bool(reglages["pluie"].get("actif"))}
                cfg["robots"][haid] = actuel
        await self.store.async_set_shared(CLE, cfg)
        self.cfg = cfg
        self._reabonner()
        return cfg

    @callback
    def async_arreter(self) -> None:
        for defaire in self._defait:
            try:
                defaire()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia robots : desabonnement sans effet")
        self._defait.clear()
