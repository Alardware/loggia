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
Depuis Home Assistant 2026.3, un service commun existe — `vacuum.clean_area`,
sur les ZONES de Home Assistant associees au robot dans le registre des
entites (tranche robots 2, ADR 0218 ; `robots_pieces.py`, pur) : un passage
ou un depart vise alors des zones (`zone`), et le serveur verifie AVANT
d'appeler ce que Home Assistant refuserait apres (le bit, l'association, une
zone sans piece, une autre carte). Avant cela, et pour ce que le robot publie
lui-meme, chaque integration a sa commande : le planning garde les segments
tels que le robot les numerote, et envoie la commande que SON integration
attend (`commande_pieces`). Integration inconnue, ou pieces que le robot ne
publie plus : le passage est RETENU, et le journal le dit — jamais « tout le
logement » a la place des pieces demandees, jamais une commande au hasard.

Le carnet des passages (chantier IoT, I3 A)
───────────────────────────────────────────
Home Assistant ne sait pas quelles pieces un robot nettoie : le carnet le tient
(`robots_carnet.py`, pur). Il ECOUTE les robots de la maison et les capteurs de
surface et d'erreur de leur appareil, et NOTE — il ne commande rien. Un depart
que Loggia donne — un geste de l'ecran par `loggia/robots/lancer`, ou ce
planning — y laisse sa demande : la session qui s'ouvre dans les deux minutes
en prend les pieces. Le carnet vit dans son fichier de `.storage`, ecrit en
differe et a l'arret, comme celui des lumieres.

`async_lancer_depart` est le geste d'une PERSONNE : sous son contexte
(`Context(user_id=…)` — le socle y voit une main, comme sur l'application du
fabricant) et ses droits de pilotage, par la commande de l'integration ou les
aires de la tondeuse puis `start_mowing` ; toujours un service explicite, jamais
`toggle`, et attendu — ATTENTE_DEPART_S au plus, sans rien annuler (passe bis 2
du 18/10, point E). Un depart en vol en refuse un second. Un refus previsible
porte son code (`RefusNomme`). Les scripts maison de l'aspirateur PRINCIPAL
(`vacuumScripts`) partent par lui aussi, avec le role que l'ecran demande, et
leur nom dit le passage (passe bis du 18/10, point A ; passe bis 2, points C et
J) ; `script.turn_on` rend la main des que le script DEMARRE : un echec dans le
script ne remonte pas, seul un refus de Home Assistant se dit (point M).
"""
from __future__ import annotations

import asyncio
import copy
import logging
import re
import time
import unicodedata
from typing import TYPE_CHECKING, Any

from homeassistant.core import Context, HomeAssistant, callback

from .const import DOMAIN
from .entites import motif, motif_de
from .refus import RefusNomme
from .regles import Regles, demarrer, niveau
from .robots_carnet import (DEMANDE_S, MUETS, carnet_vide, elaguer, instant, lire_carnet, noter_demande, texte_erreur, voir_arret,
                            voir_erreur, voir_phase, voir_surface, vue)
# `commande_pieces` vit dans le module pur depuis la tranche robots 2 ; il reste lisible d'ici (les tests, l'ADR 0215).
from .robots_pieces import (CLES_CARTE_ACTIVE, commande_pieces, commande_zones, est_zone_ha, lire_version,  # noqa: F401
                            pieces_du_robot, publie, segments_perimes, verifier_zones)

if TYPE_CHECKING:  # l'annotation seule — les tests chargent ce module hors paquet
    from .store import LoggiaStore

_LOGGER = logging.getLogger(__name__)

CLE = "loggia_robots"
CLE_METEO = "loggia_weather"
MODULE = "robots"

MAX_PLANNINGS = 24
MAX_ZONES = 30
MAX_SEGMENTS = 20

# Un identifiant se valide EN ENTIER, par `fullmatch` (petit paquet du 25/10) : avec `match`, le `$` de Python accepte un `\n` final,
# et « script.x\n » passait. Les ancres restent, pour qui relit le motif.
ROBOT = motif_de(("vacuum", "lawn_mower"))
IDENT = re.compile(r"^[a-z0-9_-]{1,40}$")
AIRE = re.compile(r"(^|_)(zone|area)_")

# Ce que la meteo appelle « il pleut » — ou pire. Une tondeuse ne sort pas.
PLUIE = {"rainy", "pouring", "lightning-rainy", "snowy", "snowy-rainy", "hail"}

CALME_DEFAUT: dict[str, Any] = {"actif": False, "debut": "22:00", "fin": "07:00"}

# Un depart planifie est du confort : la surete, la presence et la nuit passent
# devant s'ils tiennent le robot.
PRIORITE = niveau("confort", 2)

# Le carnet des passages (chantier IoT, I3 A), dans SON fichier de `.storage`.
CLE_ETAT = "loggia_robots_etat"
VERSION_ETAT = 1
# L'ecriture est differee : un passage, ce sont des dizaines de phases et de surfaces.
DELAI_ECRITURE_S = 20.0
# Un rechargement de l'integration : l'instance retiree ecrit ses dernieres notes, et la suivante l'attend avant
# de relire le fichier — ATTENTE_ECRITURE_S au plus —, comme le carnet des lumieres.
CLE_ECRITURE_FINALE = "robots_ecriture"
ATTENTE_ECRITURE_S = 10.0
UNITES_SURFACE = ("m²", "m2", "ft²", "sq ft")
# Deux appuis sur « Demarrer » — un doigt qui hesite, deux ecrans — ne font pas deux departs (passe bis du 18/10, point 1) : tant
# que le robot n'a pas bouge, une demande de depart de moins de DEPART_RECENT_S secondes se refuse (`deja_en_route`).
DEPART_RECENT_S = 15.0
# Un depart attend son integration un temps BORNE (passe bis 2 du 18/10, point E) : `blocking=True` n'a pas de delai, et une
# integration qui ne repond pas tenait le depart — et l'ecran — sans fin. ATTENTE_DEPART_S au plus, en tout : les bascules d'aires
# et la commande de depart. Passe ce delai, rien n'est annule — le service deja parti continue sans nous.
ATTENTE_DEPART_S = 20.0
# Un depart EN VOL (point E), par robot : de sa demande a la reponse de son integration, un second depart se refuse — un autre
# ecran, le planning de la meme minute, et l'inverse. Une integration qui ne repond jamais ne fige pas le robot : VOL_MAX_S au plus.
VOL_MAX_S = float(DEMANDE_S)
# Les scripts maison de l'aspirateur (passe bis du 18/10, point A ; sa reponse « Par le serveur ») : ceux que Parametres designe
# (`vacuumScripts`, dans la description de la maison `loggia_entities`), par ROLE. Les uns LANCENT un passage, les autres sont les
# gestes d'un passage en cours — et c'est le role que l'ecran demande qui le dit (passe bis 2 du 18/10, point J).
CLE_ENTITES = "loggia_entities"
SCRIPT = motif("script")
SCRIPTS_DEPART = ("nettoyer_tout", "pieces_selectionnees")
# `localiser` depuis la passe bis du 20/10 : la roue de la popup designe un script par role, celui-la compris.
SCRIPTS_GESTE = ("pause", "reprendre", "retour_base", "localiser")
ROLES_SCRIPT = SCRIPTS_DEPART + SCRIPTS_GESTE
# Les refus d'un depart par zones ou par pieces publiees (tranche robots 2 ; `verifier_zones`, `segments_perimes`) : le code que
# l'ecran dit (refusrobots.js), et ce que le planning ecrit au journal quand c'est lui qui est retenu. `scripts_gardent_la_main`
# (sa decision du 20/10) : un script de depart est designe, Loggia ne prend pas la main sur les pieces — le detail du planning
# est la phrase meme que la popup dit sous les puces, deja dans les sept langues.
MOTIFS_REFUS = {"association_absente": "association absente", "zone_sans_piece": "zone sans piece associee", "autre_carte": "autre carte",
                "pieces_inconnues": "pieces inconnues de cette integration", "pieces_perimees": "liste des pieces du robot perimee",
                "scripts_gardent_la_main": "vos scripts gardent la main pour les pieces"}
DETAILS_RETENU = {"association_absente": "association absente", "zone_sans_piece": "zone sans pièce associée", "autre_carte": "autre carte",
                  "pieces_inconnues": "pièces inconnues de cette intégration", "pieces_perimees": "liste des pièces du robot périmée",
                  "scripts_gardent_la_main": "Vos scripts gardent la main pour les pièces."}


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


def aires_de(entrees, appareil) -> list[str]:
    """Les interrupteurs d'aire d'une tondeuse : ceux de SON appareil, reconnus
    a leur cle de traduction, a defaut a leur identifiant. Ni une entite
    desactivee, ni une MASQUEE (passe bis du 18/10, point 2) : l'ecran les
    ecarte (`decrireSoeurs`), le serveur aussi — il ne les eteint pas derriere
    un depart, et « tout le jardin » ne les compte pas."""
    if not appareil:
        return []
    trouvees = []
    for e in entrees or []:
        haid = str(getattr(e, "entity_id", "") or "")
        if not haid.startswith("switch.") or getattr(e, "device_id", None) != appareil:
            continue
        if getattr(e, "disabled_by", None) or getattr(e, "hidden_by", None):
            continue
        if getattr(e, "translation_key", None) == "area" or AIRE.search(haid.split(".", 1)[1]):
            trouvees.append(haid)
    return sorted(trouvees)


def capteurs_du_robot(entrees, appareil, attributs) -> dict[str, str | None]:
    """La surface et l'erreur d'un robot, que le carnet suit : des capteurs de SON appareil, reconnus a leur cle de
    traduction, a defaut a leur identifiant. La surface est un capteur d'aire (sa classe, ou son unite) qui n'est
    pas un total ; l'erreur, le capteur qui dit l'erreur — ni son code, ni son heure ; l'heure de l'erreur, quand
    l'appareil la publie (passe bis du 18/10, point 3 : Mammotion, `error_1_time`) — une erreur datee d'avant un
    passage n'en est pas le motif. `attributs(entity_id)` rend les attributs de l'etat (l'unite et la classe vivent la)."""
    trouve: dict[str, str | None] = {"surface": None, "erreur": None, "heure_erreur": None}
    if not appareil:
        return trouve
    for e in sorted(entrees or [], key=lambda x: str(getattr(x, "entity_id", "") or "")):
        haid = str(getattr(e, "entity_id", "") or "")
        if not haid.startswith("sensor.") or getattr(e, "device_id", None) != appareil or getattr(e, "disabled_by", None):
            continue
        texte = (str(getattr(e, "translation_key", None) or "") + " " + haid.split(".", 1)[1]).lower()
        a = attributs(haid) or {}
        aire = a.get("device_class") == "area" or a.get("unit_of_measurement") in UNITES_SURFACE
        erreur = re.search(r"error|erreur", texte) and not re.search(r"code", texte)
        if trouve["surface"] is None and aire and "total" not in texte:
            trouve["surface"] = haid
        elif erreur and (a.get("device_class") == "timestamp" or re.search(r"time|heure|date", texte)):
            if trouve["heure_erreur"] is None:
                trouve["heure_erreur"] = haid
        elif trouve["erreur"] is None and erreur:
            trouve["erreur"] = haid
    return trouve


def nom_d_aire(haid: str, entree, etat) -> str:
    """Le nom d'une aire de tonte, tel que la popup le dit : le nom de l'entite sans celui de l'appareil, sans « Zone »."""
    brut = getattr(entree, "original_name", None) or (getattr(etat, "attributes", None) or {}).get("friendly_name") or haid.split(".", 1)[1]
    return re.sub(r"^(zone|area)\s+", "", str(brut), flags=re.I)[:60]


def _plat(texte: str) -> str:
    """Sans accents ni capitales : ce qu'on compare d'un nom a l'autre."""
    return unicodedata.normalize("NFD", texte).encode("ascii", "ignore").decode("ascii").lower()


def nom_de_script(etat, etat_robot=None) -> str:
    """Le nom d'un script maison, tel que le passage le dit (point A) : son nom dans Home Assistant, sans celui du robot devant
    (« Robot - Nettoyer partout » se dit « Nettoyer partout »), la premiere lettre en capitale."""
    a = getattr(etat, "attributes", None) or {}
    objet = str(getattr(etat, "entity_id", "") or "").split(".", 1)[-1].replace("_", " ")
    nom = str(a.get("friendly_name") or objet).strip()
    robot = str((getattr(etat_robot, "attributes", None) or {}).get("friendly_name") or "").strip()
    if robot and _plat(nom).startswith(_plat(robot)) and len(nom) > len(robot) + 1:
        nom = re.sub(r"^[\s·:–-]+", "", nom[len(robot):])
    return (nom[:1].upper() + nom[1:])[:60] if nom else "script"


def fusion_vacuum_scripts(entites: Any, role: Any, script: Any) -> dict[str, Any]:
    """La description de la maison apres qu'un ROLE de script a ete designe dans la roue de la popup (passe bis 2 du 20/10,
    relecture de controle) : `entites` est la valeur EN PLACE (ce que le magasin tient, jamais ce qu'un ecran croit savoir),
    `script` le script du role, ou None pour le retirer. Ne touche que `vacuumScripts[role]` : les dix-neuf autres cles de la
    description (alarme, cameras, climat, volets, energie...) restent telles quelles ; un role vide est retire, et `vacuumScripts`
    s'en va avec le dernier. Une description qui n'existe pas encore nait du seul role ; une description ILLISIBLE (pas un objet)
    refuse — rien ne s'ecrit a sa place. Pure : rend une copie, ne modifie rien sur place."""
    if role not in ROLES_SCRIPT:
        raise ValueError("role de script invalide : %r" % (role,))
    if script is not None and (not isinstance(script, str) or not SCRIPT.fullmatch(script)):
        raise ValueError("script invalide : %r" % (script,))
    if entites is None:
        entites = {}
    if not isinstance(entites, dict):
        # Un refus NOMME (petit paquet du 25/10) : la roue le dit en une phrase (refusrobots.js), plus le refus generique.
        raise RefusNomme("description_illisible", "description de la maison illisible", CLE_ENTITES)
    brut = entites.get("vacuumScripts")
    scripts = dict(brut) if isinstance(brut, dict) else {}
    if script is None:
        scripts.pop(role, None)
    else:
        scripts[role] = script
    suite = dict(entites)
    if scripts:
        suite["vacuumScripts"] = scripts
    else:
        suite.pop("vacuumScripts", None)
    return suite


def lire_zones(zones_brutes) -> list[dict]:
    """Les zones d'un planning ou d'un depart : `[{id, nom, segments}]`, ou ValueError — on n'envoie pas un a-peu-pres.

    Depuis la tranche robots 2 (R5), une zone porte `zone` — l'identifiant d'une zone de Home Assistant, que `vacuum.clean_area`
    attend — OU `segments`, jamais les deux ; et un passage ne mele pas les deux formes : les identifiants de segments changent
    quand la carte est refaite, celui d'une zone jamais."""
    if not isinstance(zones_brutes, list) or len(zones_brutes) > MAX_ZONES:
        raise ValueError("zones invalides")
    zones, formes = [], set()
    for z in zones_brutes:
        if not isinstance(z, dict) or not str(z.get("id") or "").strip():
            raise ValueError("zone invalide")
        segments = z.get("segments") or []
        if (not isinstance(segments, list) or len(segments) > MAX_SEGMENTS
                or any(isinstance(s, bool) or not isinstance(s, int) for s in segments)):
            raise ValueError("segments invalides pour la zone %r" % (z.get("id"),))
        propre = {"id": str(z["id"])[:80], "nom": str(z.get("nom") or z["id"])[:60], "segments": list(segments)}
        if z.get("zone") is not None:
            if not est_zone_ha(z) or segments:
                raise ValueError("zone de Home Assistant invalide pour %r" % (z.get("id"),))
            propre["zone"] = z["zone"]
            formes.add("zone")
        else:
            formes.add("segments")
        zones.append(propre)
    if len(formes) > 1:
        raise ValueError("un passage vise des zones de Home Assistant ou des segments, pas les deux")
    return zones


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
    if not IDENT.fullmatch(ident):
        raise ValueError("identifiant de planning invalide : %r" % (ident,))
    robot = str(brut.get("robot") or "")
    if not ROBOT.fullmatch(robot):
        raise ValueError("robot invalide : %r" % (robot,))
    heure = lire_heure(brut.get("heure"))
    if heure is None:
        raise ValueError("heure invalide : %r" % (brut.get("heure"),))
    jours = brut.get("jours")
    if not isinstance(jours, list) or any(isinstance(j, bool) or not isinstance(j, int) or not 0 <= j <= 6 for j in jours):
        raise ValueError("jours invalides : de 0 (lundi) a 6 (dimanche)")
    zones = lire_zones(brut.get("zones") or [])
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
        if not isinstance(haid, str) or not ROBOT.fullmatch(haid) or not isinstance(reglages, dict):
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
        self._poser_carnet()
        bus = getattr(hass, "bus", None)
        if bus is not None:
            # A l'arret de Home Assistant, ce que l'ecriture differee retient part tout de suite.
            self._defait_arret = bus.async_listen_once("homeassistant_stop", self._sur_arret)
        demarrer(hass, self, self._async_demarrer(), "robots")

    def _poser_carnet(self) -> None:
        """Le carnet des passages et ce qui le fait vivre : vide jusqu'a la relecture du disque."""
        self.carnet: dict[str, Any] = carnet_vide()
        # {robot: {surface, erreur}} : les soeurs que le carnet suit (`capteurs_du_robot`).
        self._suivis: dict[str, dict[str, str | None]] = {}
        self._ecoute = None
        self._ecriture = None
        self._depot = None
        self._au_demarrage = None
        self._defait_arret = None
        self._arrete = False
        # {robot: (jeton, instant)} : les departs en vol (passe bis 2 du 18/10, point E) ; et les services partis sans reponse dans le
        # temps borne, gardes ici jusqu'a leur fin — rien ne les annule.
        self._en_vol: dict[str, tuple[object, float]] = {}
        self._taches: set[Any] = set()
        # La version de Home Assistant, lue une fois (tranche robots 2, R4) ; un registre des zones illisible ne se dit qu'une fois.
        self._version_lue = False
        self._version: tuple[int, int] | None = None
        self._zones_dit = False

    def _maintenant(self) -> float:
        return time.time()

    async def _async_demarrer(self) -> None:
        self.cfg = await self.async_config()
        self._reabonner()
        # Un rechargement : on relit APRES l'ecriture finale de l'instance retiree, pas pendant — sinon notre
        # premiere ecriture effacerait ses dernieres notes.
        await self._async_attendre_ecriture_retiree()
        await self._async_lire_carnet()
        if self._arrete:
            return
        # Le suivi attend que Home Assistant ait FINI de demarrer : avant, une
        # integration n'a peut-etre pas encore cree ses robots.
        from homeassistant.helpers.start import async_at_started

        self._au_demarrage = async_at_started(self.hass, self._async_suivre)

    async def _async_attendre_ecriture_retiree(self) -> None:
        """L'ecriture finale de l'instance que celle-ci remplace, s'il y en a une : ATTENTE_ECRITURE_S au plus."""
        donnees = getattr(self.hass, "data", None)
        propres = donnees.get(DOMAIN) if isinstance(donnees, dict) else None
        tache = propres.pop(CLE_ECRITURE_FINALE, None) if isinstance(propres, dict) else None
        if tache is None:
            return
        try:
            _, restantes = await asyncio.wait({asyncio.ensure_future(tache)}, timeout=ATTENTE_ECRITURE_S)
        except Exception:  # noqa: BLE001
            _LOGGER.warning("Loggia robots : ecriture de l'instance retiree impossible a attendre", exc_info=True)
            return
        if restantes:
            _LOGGER.warning("Loggia robots : l'ecriture de l'instance retiree n'a pas fini en %s s, "
                            "on relit le fichier quand meme", ATTENTE_ECRITURE_S)

    async def _async_lire_carnet(self) -> None:
        """Le carnet garde. Illisible, on repart a vide et on le dit : un carnet abime ne vaut pas qu'on cesse de noter."""
        try:
            brut = await self._store_etat().async_load()
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Loggia robots : carnet illisible, on repart a vide")
            brut = None
        self.carnet = lire_carnet(brut, self._maintenant())

    async def _async_suivre(self, _hass=None) -> None:
        """Home Assistant a demarre : les robots de la maison, les capteurs de surface et d'erreur de leur appareil,
        l'ecoute. Ce que chacun fait MAINTENANT se note — un robot deja au travail ouvre sa session, un robot rentre
        pendant l'arret ferme la sienne ; relire un etat n'est pas un geste, rien ne part."""
        self._au_demarrage = None
        if self._arrete:
            return
        registre = self._registre()
        try:
            entrees = list(registre.entities.values()) if registre is not None else []
        except Exception:  # noqa: BLE001
            entrees = []
        attributs = lambda haid: getattr(self.hass.states.get(haid), "attributes", None)  # noqa: E731
        robots = sorted(self.hass.states.async_entity_ids("vacuum")) + sorted(self.hass.states.async_entity_ids("lawn_mower"))
        self._suivis = {r: capteurs_du_robot(entrees, getattr(self._entree(r), "device_id", None), attributs) for r in robots}
        ids = sorted(set(robots) | {h for s in self._suivis.values() for h in s.values() if h})
        if self._ecoute is not None:
            self._ecoute()
            self._ecoute = None
        if ids:
            from homeassistant.helpers.event import async_track_state_change_event

            self._ecoute = async_track_state_change_event(self.hass, ids, self._sur_etat)
        # Relire un etat n'est pas un geste : une erreur deja la devient la derniere connue, jamais le motif du passage en cours
        # (passe bis du 18/10, point 3).
        for haid in ids:
            etat = self.hass.states.get(haid)
            if etat is not None:
                self._voir(haid, etat, relue=True)

    @callback
    def _sur_etat(self, event) -> None:
        d = getattr(event, "data", None) or {}
        if isinstance(d.get("entity_id"), str) and d.get("new_state") is not None:
            self._voir(d["entity_id"], d["new_state"])

    def _voir(self, haid: str, etat: Any, *, relue: bool = False) -> None:
        """Un etat d'un robot ou d'une soeur suivie : le carnet le note, et le disque suit. L'erreur se lit au bon endroit
        (`texte_erreur` : le texte, jamais un code nu) et a son heure, quand l'appareil la publie ; le texte comme l'heure,
        l'un ou l'autre qui change, la font relire (point 3)."""
        if self._arrete:
            return
        avant, quand = self.carnet, self._maintenant()
        valeur = getattr(etat, "state", None)
        if ROBOT.fullmatch(haid):
            self.carnet = voir_phase(self.carnet, haid, phase(valeur), quand)
        for robot, s in self._suivis.items():
            if haid == s.get("surface"):
                self.carnet = voir_surface(self.carnet, robot, valeur)
            elif s.get("erreur") and haid in (s.get("erreur"), s.get("heure_erreur")):
                message = etat if haid == s["erreur"] else self.hass.states.get(s["erreur"])
                date = None
                if s.get("heure_erreur"):
                    date = etat if haid == s["heure_erreur"] else self.hass.states.get(s["heure_erreur"])
                    # L'appareil DATE ses erreurs, et son heure se tait — une coupure Bluetooth, un redemarrage : la lecture est
                    # muette, ni une erreur neuve ni la fin d'une erreur, et la date connue reste (passe bis 2 du 18/10, point A).
                    if date is None or str(getattr(date, "state", "") or "").strip().lower() in MUETS:
                        continue
                texte = texte_erreur(getattr(message, "state", None), getattr(message, "attributes", None))
                heure = instant(getattr(date, "state", None)) if date is not None else None
                self.carnet = voir_erreur(self.carnet, robot, texte, quand, heure=heure, relue=relue)
        if self.carnet != avant:
            self._programmer_ecriture()

    # ── Le disque du carnet ────────────────────────────────────────────────
    def _store_etat(self):
        if self._depot is None:
            from homeassistant.helpers.storage import Store

            self._depot = Store(self.hass, VERSION_ETAT, CLE_ETAT)
        return self._depot

    def _programmer_ecriture(self) -> None:
        """Ecrit le carnet, mais pas a chaque note : DELAI_ECRITURE_S apres la premiere ; une ecriture posee porte tout."""
        if self._arrete or self._ecriture is not None:
            return
        from homeassistant.helpers.event import async_call_later

        @callback
        def ecrire(_now) -> None:
            self._ecriture = None
            self.hass.async_create_task(self._async_ecrire())

        self._ecriture = async_call_later(self.hass, DELAI_ECRITURE_S, ecrire)

    def _annuler_ecriture(self) -> bool:
        """Annule l'ecriture differee ; vrai si elle attendait."""
        if self._ecriture is None:
            return False
        try:
            self._ecriture()
        except Exception:  # noqa: BLE001
            _LOGGER.debug("Loggia robots : ecriture deja partie")
        self._ecriture = None
        return True

    async def _async_ecrire(self) -> None:
        """Le carnet sur le disque, elague, en COPIE. Rien apres un demarrage rate : le carnet n'y a pas ete relu,
        il effacerait celui du fichier."""
        if getattr(self, "demarrage", None) is False:
            return
        self.carnet = elaguer(self.carnet, self._maintenant())
        try:
            await self._store_etat().async_save(copy.deepcopy(self.carnet))
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Loggia robots : carnet non enregistre")

    async def _sur_arret(self, _event) -> None:
        """L'arret de Home Assistant : chaque passage en cours note l'instant de la coupure (`voir_arret`, passe bis du 18/10,
        point 5) — au retour, le temps qu'elle a dure ne se compte pas comme du travail —, et ce que l'ecriture differee retient
        part maintenant, avec lui. Home Assistant retire lui-meme une ecoute `once` apres l'avoir declenchee : la garder ferait
        mentir `async_arreter`."""
        self._defait_arret = None
        avant = self.carnet
        self.carnet = voir_arret(self.carnet, self._maintenant())
        if self._annuler_ecriture() or self.carnet != avant:
            await self._async_ecrire()

    # ── La demande d'un depart, au carnet ──────────────────────────────────
    def _demander(self, robot: str, zones, *, tout: bool, source: str, par: str | None, libelle: str | None = None) -> float:
        """Un depart que Loggia donne : le passage qui commence dans les deux minutes en prendra les pieces — et le nom
        du script maison qui le lance (`libelle`, point A). Notee AVANT la commande — l'etat « au travail » peut revenir
        avant que l'appel rende la main. Rend son instant."""
        quand = self._maintenant()
        self.carnet = noter_demande(self.carnet, robot, zones, tout=tout, source=source, par=par, quand=quand, libelle=libelle)
        self._programmer_ecriture()
        return quand

    def _depart_recent(self, robot: str) -> bool:
        """Un depart vient-il d'etre demande pour ce robot — par un ecran ou le planning —, il y a moins de DEPART_RECENT_S ?
        Le robot ne l'a pas encore pris (sa session l'aurait consomme) : un second ne part pas derriere lui."""
        d = self.carnet["demandes"].get(robot)
        return d is not None and 0 <= self._maintenant() - d.get("t", 0) < DEPART_RECENT_S

    def _oublier_demande(self, robot: str, quand: float) -> None:
        """Le depart n'est pas parti : sa demande ne donnera pas ses pieces au passage que lancerait quelqu'un
        d'autre dans les deux minutes."""
        d = self.carnet["demandes"].get(robot)
        if d is not None and d.get("t") == quand:
            c = copy.deepcopy(self.carnet)
            c["demandes"].pop(robot, None)
            self.carnet = c

    # ── Le depart en vol, et l'attente bornee (passe bis 2 du 18/10, point E) ──
    def _vol(self, robot: str) -> bool:
        """Un depart de ce robot est-il EN VOL — demande, et son integration n'a pas encore repondu ? VOL_MAX_S au plus."""
        v = self._en_vol.get(robot)
        return v is not None and 0 <= self._maintenant() - v[1] < VOL_MAX_S

    def _lever_vol(self, robot: str) -> object:
        jeton = object()
        self._en_vol[robot] = (jeton, self._maintenant())
        return jeton

    def _poser_fin_de_vol(self, robot: str, jeton: object, restante: Any = None) -> None:
        """Le vol de CE depart finit : tout de suite si chaque service a repondu, sinon a la fin de celui qui court encore."""
        def baisser(_tache=None) -> None:
            v = self._en_vol.get(robot)
            if v is not None and v[0] is jeton:
                del self._en_vol[robot]
        if restante is None:
            baisser()
        else:
            restante.add_done_callback(baisser)

    async def _attendre(self, coro: Any, limite: float) -> tuple[bool, Any]:
        """Attend `coro` jusqu'a `limite` (l'horloge monotone) : `(True, son resultat)` s'il a fini — son echec remonte —, sinon
        `(False, sa tache)`, qui continue sans nous : rien ne l'annule, et elle reste gardee jusqu'a sa fin."""
        tache = asyncio.ensure_future(coro)
        finies, _ = await asyncio.wait({tache}, timeout=max(0.0, limite - time.monotonic()))
        if tache in finies:
            return True, tache.result()
        self._taches.add(tache)
        tache.add_done_callback(self._taches.discard)
        return False, tache

    def _suivre_tardif(self, tache: Any, robot: str, quand: float | None, quoi: Any) -> None:
        """La commande d'un depart, partie sans reponse dans le temps borne : elle compte pour partie. Si elle echoue apres coup, sa
        demande s'oublie et le journal le dit, en rouge (point E)."""
        def fin(t) -> None:
            if t.cancelled() or t.exception() is None:
                return
            if quand is not None:
                self._oublier_demande(robot, quand)
            _LOGGER.warning("Loggia robots : le depart de %s a echoue apres coup", robot, exc_info=t.exception())
            self.hass.async_create_task(self.regles.noter(MODULE, "main", quoi, cibles=[robot], n=0, motif="depuis l’écran",
                                                          detail="commande refusee par Home Assistant", echec=True))
        tache.add_done_callback(fin)

    def _cause_bascule(self, cibles: list[str], faites: list[str]) -> str:
        """Pourquoi une bascule d'aire n'a pas pris (point I) : une main posee sur l'aire n'est pas un refus de Home Assistant."""
        manquent = [c for c in cibles if c not in faites]
        return "sous la main de quelqu’un" if any(self.regles.gele(c) for c in manquent) else "commande refusee par Home Assistant"

    def _aires_nommees(self, robot: str, *, allumees: bool = False) -> list[dict[str, str]]:
        """Les aires d'une tondeuse, `[{id, nom}]` — ses aires ALLUMEES seulement si on le demande : celles qu'elle
        tond quand on ne lui en choisit aucune."""
        out = []
        for haid in self._aires(robot):
            etat = self.hass.states.get(haid)
            if allumees and str(getattr(etat, "state", "") or "").lower() != "on":
                continue
            out.append({"id": haid, "nom": nom_d_aire(haid, self._entree(haid), etat)})
        return out

    def _depart_tondeuse(self, robot: str, zones: list[dict]) -> tuple[list[dict], bool, list[tuple[str, str, list[str]]]]:
        """Ce que vise le depart d'une tondeuse, et ce qu'il bascule — UNE regle pour « ou », celle de la carte, de la popup et du
        planning (passe bis du 18/10, point 2). Jamais Loggia ne rallume une aire que la personne n'a pas touchee :
          * sans zone, elle tond ses aires DEJA allumees, et rien ne bascule ;
          * avec une selection, les choisies s'allument et les autres s'eteignent — un geste explicite.
        Rend `(visees, tout, bascules)` : `tout` quand les aires visees sont TOUTES ses aires visibles (ou qu'elle n'en a pas) — le
        passage se dit alors « tout le jardin » ; `bascules`, dans l'ordre, a finir avant `start_mowing`."""
        aires = self._aires(robot)
        if zones:
            choisies = [z["id"] for z in zones]
            bascules = [("switch", "turn_on", choisies)]
            autres = [a for a in aires if a not in choisies]
            if autres:
                bascules.append(("switch", "turn_off", autres))
            visees = list(zones)
        else:
            bascules, visees = [], self._aires_nommees(robot, allumees=True)
        tout = not aires or {z["id"] for z in visees} >= set(aires)
        return visees, tout, bascules

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
        """Lance ce qui tombe a cette minute. Rend les plannings PARTIS. Un planning qui LEVE — un registre etrange, une
        integration qui se trompe — n'emporte pas les autres de la meme minute (passe bis 2 du 20/10, sonde S4)."""
        if quand is None:
            from homeassistant.util import dt as dt_util

            quand = dt_util.now()
        partis = []
        for planning in list(self.cfg.get("plannings") or []):
            if not est_du(planning, quand):
                continue
            try:
                if await self.async_lancer(planning, quand):
                    partis.append(planning["id"])
            except Exception:  # noqa: BLE001
                _LOGGER.warning("Loggia robots : le planning %s de %s n'est pas parti", planning.get("id"), planning.get("robot"), exc_info=True)
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

    # ── Les pieces sans rien configurer (tranche robots 2 ; ADR 0218) — lecture seule, aucune commande ──
    def _version_ha(self) -> tuple[int, int] | None:
        """La version de Home Assistant (`homeassistant.const.__version__`), lue une fois : `spot_area` attend une liste depuis
        2026.3 (deebot-client 18), une chaine avant (R4). Illisible — un stub — : inconnue, et `version_recente` la tient pour recente."""
        if not self._version_lue:
            self._version_lue = True
            try:
                from homeassistant.const import __version__

                self._version = lire_version(__version__)
            except Exception:  # noqa: BLE001
                self._version = None
        return self._version

    def _options_vacuum(self, robot: str) -> dict[str, Any]:
        """`registry_entry.options["vacuum"]` : l'association pieces <-> zones (`area_mapping`) et `last_seen_segments` (R3)."""
        options = getattr(self._entree(robot), "options", None)
        vacuum = options.get("vacuum") if isinstance(options, dict) else None
        return vacuum if isinstance(vacuum, dict) else {}

    def _zones_registre(self) -> dict[str, dict[str, Any]]:
        """Le registre des zones de Home Assistant, avec leurs etages et le niveau de chacun : `{area_id: {nom, etage, niveau}}`.
        `areas` et `floors` sont des `UserDict` (`BaseRegistryItems`), pas des dict : tout `Mapping` se lit (passe bis du 20/10,
        point 4 — le niveau ne se lisait jamais). Illisible : rien — les zones ne se nomment pas —, dit une fois."""
        try:
            from collections.abc import Mapping

            from homeassistant.helpers import area_registry as ar, floor_registry as fr

            zones = ar.async_get(self.hass).areas
            try:
                etages = fr.async_get(self.hass).floors
            except Exception:  # noqa: BLE001
                etages = {}
            out = {}
            for area_id, z in dict(zones).items():
                etage = getattr(z, "floor_id", None)
                niveau = getattr(etages.get(etage), "level", None) if etage and isinstance(etages, Mapping) else None
                out[str(area_id)] = {"nom": str(getattr(z, "name", None) or area_id), "etage": etage,
                                     "niveau": niveau if isinstance(niveau, (int, float)) and not isinstance(niveau, bool) else None}
            return out
        except Exception:  # noqa: BLE001
            if not self._zones_dit:
                self._zones_dit = True
                _LOGGER.warning("Loggia robots : registre des zones illisible — les pieces d'un robot ne se nomment pas", exc_info=True)
            return {}

    def _entrees_triees(self) -> list | None:
        """Les entrees du registre, rangees une fois par leur identifiant — pour `_soeur`, qui en parcourt plusieurs par etat (passe
        bis du 20/10, point 11 : le registre se triait deux fois par robot toutes les 15 s). None : pas de registre."""
        registre = self._registre()
        if registre is None:
            return None
        try:
            return sorted(registre.entities.values(), key=lambda e: str(getattr(e, "entity_id", "") or ""))
        except Exception:  # noqa: BLE001
            return None

    def _soeur(self, robot: str, domaine: str, cles: tuple[str, ...], entrees: list | None = None) -> str | None:
        """Une soeur du robot — une entite de SON appareil, de ce domaine, reconnue a sa cle de traduction —, ni desactivee ni masquee.
        `entrees` : le registre deja range (`_entrees_triees`), quand l'appelant en lit plusieurs."""
        appareil = getattr(self._entree(robot), "device_id", None)
        if not appareil:
            return None
        if entrees is None:
            entrees = self._entrees_triees()
        for e in entrees or []:
            haid = str(getattr(e, "entity_id", "") or "")
            if (haid.startswith(domaine + ".") and getattr(e, "device_id", None) == appareil and getattr(e, "translation_key", None) in cles
                    and not getattr(e, "disabled_by", None) and not getattr(e, "hidden_by", None)):
                return haid
        return None

    def _etat_soeur(self, robot: str, domaine: str, cles: tuple[str, ...], entrees: list | None = None) -> tuple[str | None, Any]:
        """L'etat d'une soeur et ses attributs : (None, None) sans soeur, ou muette."""
        haid = self._soeur(robot, domaine, cles, entrees)
        etat = self.hass.states.get(haid) if haid else None
        valeur = str(getattr(etat, "state", "") or "").strip()
        if not valeur or valeur.lower() in MUETS:
            return None, None
        return valeur, getattr(etat, "attributes", None)

    def _cartes(self, robot: str, entrees: list | None = None) -> tuple[str | None, list | None]:
        """La carte active du robot et toutes ses cartes : l'etat de sa soeur `select` de carte (`active_map` chez Ecovacs,
        `selected_map` chez Roborock — le NOM de la carte) et ses `options` (passe bis du 20/10, point 1 : « une autre carte » se
        prouve par une autre option). Sans soeur, ou muette : (None, None) — toutes les zones sont alors des puces (R11)."""
        valeur, attributs = self._etat_soeur(robot, "select", CLES_CARTE_ACTIVE, entrees)
        if valeur is None:
            return None, None
        options = (attributs or {}).get("options") if isinstance(attributs, dict) else None
        return valeur, [str(o) for o in options] if isinstance(options, list) else None

    def _carte_active(self, robot: str) -> str | None:
        return self._cartes(robot)[0]

    def _passages(self, robot: str, entrees: list | None = None) -> int:
        """Le compteur de passages de l'appareil (`number` de cle `clean_count`), pour l'exception de Q2 A ; illisible, un passage."""
        valeur, _ = self._etat_soeur(robot, "number", ("clean_count",), entrees)
        try:
            n = int(float(valeur)) if valeur is not None else 1
        except (TypeError, ValueError):
            n = 1
        return n if n >= 1 else 1

    def _reparation(self, robot: str) -> bool:
        """La reparation `segments_changed_<id d'entree>` de Home Assistant est-elle ouverte (R9) ? Ignoree dans Home Assistant
        (`dismissed_version` posee), elle est fermee : la popup ne la redit pas en ambre (passe bis du 20/10, point 7). Illisible :
        fermee."""
        entree = self._entree(robot)
        ident = getattr(entree, "id", None)
        if not ident:
            return False
        try:
            from homeassistant.helpers import issue_registry as ir

            reparation = ir.async_get(self.hass).async_get_issue("vacuum", "segments_changed_%s" % ident)
            return reparation is not None and getattr(reparation, "dismissed_version", None) is None
        except Exception:  # noqa: BLE001
            return False

    async def _async_entites(self) -> Any:
        """La description de la maison (`loggia_entities`), ou None si elle ne se lit pas."""
        try:
            return await self.store.async_get_shared(CLE_ENTITES, None)
        except Exception:  # noqa: BLE001
            _LOGGER.warning("Loggia robots : description de la maison illisible", exc_info=True)
            return None

    def _roles_designes(self, robot: str, entites: Any) -> dict[str, str]:
        """Les scripts maison designes pour CE robot, par role (`{role: script.*}`) — ceux de la description de la maison
        (`vacuumScripts`), et pour l'aspirateur PRINCIPAL seul (`_aspirateur_principal`, passe bis 2 du 18/10, point C) ; un autre
        aspirateur, une tondeuse, une description illisible : aucun."""
        if not robot.startswith("vacuum.") or not isinstance(entites, dict):
            return {}
        brut = entites.get("vacuumScripts")
        if not isinstance(brut, dict) or self._aspirateur_principal(entites) != robot:
            return {}
        return {role: haid for role, haid in brut.items()
                if role in ROLES_SCRIPT and isinstance(haid, str) and SCRIPT.fullmatch(haid)}

    def _etat_script(self, script: Any) -> Any:
        """L'etat d'un script maison qui REPOND, ou None : absent de la maison, ou muet (`unavailable`, `unknown`). Home Assistant
        saute en silence une entite indisponible d'un service d'entite — `script.turn_on` « reussissait », rien ne bipait, et le
        journal disait le script fait (passe bis 2 du 20/10, sonde S2c) : un script muet est un script absent, partout."""
        etat = self.hass.states.get(script) if isinstance(script, str) else None
        if etat is None or str(getattr(etat, "state", "") or "").lower() in MUETS:
            return None
        return etat

    def _script_depart(self, robot: str, entites: Any) -> str | None:
        """Le script de DEPART designe pour ce robot et PRESENT dans la maison (sa decision du 20/10 : des qu'il y en a un, Loggia
        ne prend pas la main sur les pieces) : `"pieces"` si le script des pieces (`pieces_selectionnees`) l'est — les puces de la
        popup peuvent etre ses interrupteurs —, `"depart"` si seul `nettoyer_tout` l'est, None sans aucun. L'ecran exige en plus un
        interrupteur de piece (`parInterrupteurs`) : c'est lui qui choisit ; ici, on ne dit que la source."""
        roles = self._roles_designes(robot, entites)
        for role, forme in (("pieces_selectionnees", "pieces"), ("nettoyer_tout", "depart")):
            if self._etat_script(roles.get(role)) is not None:
                return forme
        return None

    async def _async_pieces(self, robot: str, entites: Any = None, entrees: list | None = None) -> dict[str, Any]:
        """Les pieces de ce robot, telles que Home Assistant les sait (§ 5.2 de la conception) : tout se lit, rien ne se commande.
        `entrees` : le registre deja range, quand l'etat le lit pour chaque aspirateur."""
        a = getattr(self.hass.states.get(robot), "attributes", None) or {}
        if entites is None:
            entites = await self._async_entites()
        if entrees is None:
            entrees = self._entrees_triees()
        carte, cartes = self._cartes(robot, entrees)
        # `designes` : les roles designes pour ce robot (la roue de la popup lit la verite du serveur, passe bis 2 du 20/10).
        return pieces_du_robot(a.get("supported_features"), a, self._options_vacuum(robot), self._zones_registre(), carte,
                               self._reparation(robot), scripts=self._script_depart(robot, entites), plateforme=self._plateforme(robot),
                               version_ha=self._version_ha(), cartes=cartes, designes=self._roles_designes(robot, entites))

    async def _async_pieces_ou_rien(self, robot: str, entites: Any = None) -> dict[str, Any] | None:
        """Les pieces d'un robot pour un DEPART — ou None quand leur lecture leve (un registre etrange) : « tout le logement »
        part sans elles, et des zones se refusent sans devinette (passe bis 2 du 20/10, sonde S4) ; `async_etat` se protege
        deja ainsi."""
        try:
            return await self._async_pieces(robot, entites)
        except Exception:  # noqa: BLE001
            _LOGGER.warning("Loggia robots : pieces de %s illisibles, le depart se juge sans elles", robot, exc_info=True)
            return None

    def _commande_segments(self, robot: str, zones: list[dict]) -> tuple[str, str, dict] | None:
        """La commande d'un depart par segments (la source 3, et les passages d'avant) : celle de l'integration, corrigee de la
        liste (R4) et bornee par le bit et par `rooms` (R1, Q2 A). None : des pieces que Loggia ne sait pas viser."""
        if any(not z["segments"] for z in zones):
            return None
        a = getattr(self.hass.states.get(robot), "attributes", None) or {}
        return commande_pieces(self._plateforme(robot), [s for z in zones for s in z["segments"]], bits=a.get("supported_features"),
                               version_ha=self._version_ha(), publie=publie(a), passages=self._passages(robot))

    def _segments_perimes(self, robot: str, zones: list[dict]) -> bool:
        """Chez Ecovacs, la liste que le robot publie fait foi (Q2) : un segment qu'il ne publie plus a l'instant du depart."""
        a = getattr(self.hass.states.get(robot), "attributes", None) or {}
        return segments_perimes([s for z in zones for s in z["segments"]], a, self._plateforme(robot))

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
        # Deja au travail, ou un depart de l'ecran demande a l'instant — ou encore en vol, sans reponse de son integration (passe bis
        # 2 du 18/10, point E : la course planning / ecran dans la meme minute) : un second depart ne part pas derriere lui.
        if ph in ("travail", "pause", "retour") or self._depart_recent(robot) or self._vol(robot):
            return await retenu("deja en route")
        reglages = (self.cfg.get("robots") or {}).get(robot) or {}
        if Regles.dans_la_plage(reglages.get("calme"), quand):
            return await retenu("ne pas deranger")
        tondeuse = robot.startswith("lawn_mower.")
        if tondeuse and (reglages.get("pluie") or {}).get("actif"):
            meteo = await self._meteo()
            if meteo and il_pleut(self.hass.states.get(meteo)):
                return await retenu("pluie")
        # Le depart du planning est EN VOL jusqu'a la reponse de ses services : l'ecran ne part pas derriere lui (point E).
        jeton, restante = self._lever_vol(robot), []
        try:
            if tondeuse:
                return await self._partir_tondeuse(planning, motif, retenu, restante)
            return await self._partir_aspirateur(planning, motif, retenu)
        finally:
            self._poser_fin_de_vol(robot, jeton, restante[0] if restante else None)

    async def _partir_tondeuse(self, planning: dict, motif: Any, retenu: Any, restante: list) -> bool:
        """Le passage planifie d'une tondeuse. Les aires sont des interrupteurs : la regle de « ou » (`_depart_tondeuse`, passe bis du
        18/10, point 2) — sans zone, ses aires deja allumees ; avec, les choisies s'allument et les autres s'eteignent. Aucune aire
        allumee ni choisie : il est retenu, `start_mowing` ne part jamais (passe bis 2 du 18/10, point D). Chaque bascule ATTENDUE
        avant de tondre (point 4), le temps borne (point E) ; une bascule qui n'a pas pris — l'aire choisie qui ne s'allume pas, une
        autre qui ne s'eteint pas —, et la tondeuse ne part pas, sinon elle tondrait ce que le passage excluait ; le journal dit la
        vraie cause (point I). Le carnet note ce que le depart vise (I3 A) ; un depart qui ne part pas oublie sa demande."""
        robot = planning["robot"]
        zones = planning.get("zones") or []
        noms = ", ".join(z["nom"] for z in zones)
        visees, tout, bascules = self._depart_tondeuse(robot, [z for z in zones if str(z["id"]).startswith("switch.")])
        if not visees and self._aires(robot):
            return await retenu("aucune zone allumée")
        limite = time.monotonic() + ATTENTE_DEPART_S
        for _domaine, service, cibles in bascules:
            fini, faites = await self._attendre(self.regles.agir(
                MODULE, "planning", "switch", service, cibles, quoi="choisir les zones" if service == "turn_on" else "ecarter les zones",
                motif=motif, priorite=PRIORITE, attendre=True), limite)
            if not fini:
                restante.append(faites)
                return await retenu("sans réponse de Home Assistant")
            if len(faites) < len(cibles):
                return await retenu(self._cause_bascule(cibles, faites))
        quand = self._demander(robot, visees, tout=tout, source="planning", par=None)
        partis = await self.regles.agir(MODULE, "planning", "lawn_mower", "start_mowing", [robot],
                                        quoi=("tondre : {noms}", {"noms": noms}) if noms else "tondre",
                                        motif=motif, priorite=PRIORITE)
        if not partis:
            self._oublier_demande(robot, quand)
        return bool(partis)

    async def _partir_aspirateur(self, planning: dict, motif: Any, retenu: Any) -> bool:
        """Le passage planifie d'un aspirateur : des ZONES de Home Assistant par `vacuum.clean_area` (R4, R5), des pieces par la
        commande de son integration (la forme d'avant), sinon tout le logement. Ce que Home Assistant refuserait — l'association
        absente, une zone sans piece, une autre carte, des pieces que l'integration ne sait pas viser ou que le robot ne publie
        plus — RETIENT le passage, et le journal le dit : jamais « tout le logement » a la place des pieces demandees.

        Sa decision du 20/10 : un script de DEPART designe (`_script_depart`) garde la main sur les pieces — un passage par pieces
        est RETENU (« Vos scripts gardent la main pour les pieces. » : le serveur ne joue pas ses interrupteurs), et « tout le
        logement » part par son `nettoyer_tout` quand il est designe et present, sinon par `vacuum.start`. Une main posee sur le
        ROBOT retient ce depart-la aussi (passe bis 2 du 20/10, sonde S3) : `regles.agir` ne regarderait que le gel du script."""
        robot = planning["robot"]
        zones = planning.get("zones") or []
        noms = ", ".join(z["nom"] for z in zones)
        entites = await self._async_entites()
        pieces = await self._async_pieces_ou_rien(robot, entites)
        if zones and pieces is not None and pieces["source"] == "scripts":
            return await retenu(DETAILS_RETENU["scripts_gardent_la_main"])
        if zones and est_zone_ha(zones[0]):
            code = verifier_zones(zones, pieces or {})
            if code:
                return await retenu(DETAILS_RETENU[code])
            commande = commande_zones(zones)
        elif zones:
            # La liste perimee d'abord (relecture qualite, D6) : chez Ecovacs, un `rooms` vide est une liste perimee, pas des pieces
            # inconnues de l'integration.
            if self._segments_perimes(robot, zones):
                return await retenu(DETAILS_RETENU["pieces_perimees"])
            commande = self._commande_segments(robot, zones)
            if commande is None:
                return await retenu(DETAILS_RETENU["pieces_inconnues"])
        else:
            commande = None
        if commande:
            domaine, service, data = commande
            quand = self._demander(robot, zones, tout=False, source="planning", par=None)
            partis = await self.regles.agir(MODULE, "planning", domaine, service, [robot], data,
                                            quoi=("nettoyer : {noms}", {"noms": noms}), motif=motif, priorite=PRIORITE)
        else:
            script = self._roles_designes(robot, entites).get("nettoyer_tout")
            etat_script = self._etat_script(script)
            if etat_script is not None:
                if self.regles.gele(robot):
                    return await retenu("sous la main de quelqu’un")
                libelle = nom_de_script(etat_script, self.hass.states.get(robot))
                quand = self._demander(robot, [], tout=True, source="planning", par=None, libelle=libelle)
                partis = await self.regles.agir(MODULE, "planning", "script", "turn_on", [script],
                                                quoi=("script : {nom}", {"nom": libelle}), motif=motif, priorite=PRIORITE)
            else:
                quand = self._demander(robot, [], tout=True, source="planning", par=None)
                partis = await self.regles.agir(MODULE, "planning", "vacuum", "start", [robot],
                                                quoi="nettoyer", motif=motif, priorite=PRIORITE)
        if not partis:
            self._oublier_demande(robot, quand)
        return bool(partis)

    def _aspirateur_principal(self, entites: Any) -> str | None:
        """L'aspirateur de « la maison », celui dont Parametres designe les scripts (`vacuumScripts` ; passe bis 2 du 18/10, point C) :
        celui que la description de la maison nomme (`loggia_entities.vacuum.main`), s'il est un aspirateur de la maison ; a defaut
        le SEUL aspirateur de la maison ; sinon aucun — deux aspirateurs et rien de nomme, les scripts ne sont a personne."""
        decrit = entites.get("vacuum") if isinstance(entites, dict) else None
        nomme = decrit.get("main") if isinstance(decrit, dict) else None
        if isinstance(nomme, str) and nomme.startswith("vacuum.") and self.hass.states.get(nomme) is not None:
            return nomme
        try:
            tous = list(self.hass.states.async_entity_ids("vacuum"))
        except Exception:  # noqa: BLE001
            tous = []
        return tous[0] if len(tous) == 1 else None

    async def _scripts_du_robot(self, robot: str) -> dict[str, str]:
        """Les scripts maison reconnus pour CE robot (point A) : `{role: script.*}` — ceux que la roue de sa popup designe pour
        l'aspirateur de la maison (`vacuumScripts`, dans `loggia_entities`, comme l'ecran les lit), et pour lui SEUL : l'aspirateur
        principal (`_roles_designes`) ; un autre aspirateur, une tondeuse n'en ont pas. Une description illisible n'en reconnait
        aucun."""
        if not robot.startswith("vacuum."):
            return {}
        return self._roles_designes(robot, await self._async_entites())

    async def _async_lancer_script(self, robot: str, script: Any, role: Any, zones: list[dict], *, user: Any,
                                   controle: Any) -> dict[str, Any]:
        """Un script maison de l'aspirateur, lance par une personne depuis l'ecran (point A ; sa reponse du 18/10, « Par le
        serveur ») : `script.turn_on`, un service explicite, sous son contexte et dans les limites de ses droits de pilotage — le
        robot ET le script. Son ROLE est celui que l'ecran demande (`role` ; passe bis 2 du 18/10, point J) : le script doit etre celui
        de ce role pour CE robot, sinon il se refuse (`script_inconnu`). Un role de depart (« nettoyer tout », « pieces
        selectionnees ») suit les regles d'un depart — injoignable, deja en route, les 15 s, le vol — et note au carnet le nom du
        script (`libelle`), et les pieces choisies s'il y en a ; un role de geste (pause, reprise, base) part seul.
        `script.turn_on` rend la main des que le script DEMARRE (point M) : on l'attend jusque-la, ATTENTE_DEPART_S au plus ; un
        echec a l'interieur du script ne remonte pas, seul un refus de Home Assistant se dit — `commande_refusee` pour un depart,
        `geste_refuse` pour un geste (point K)."""
        if not isinstance(script, str) or not SCRIPT.fullmatch(script):
            raise ValueError("script invalide : %r" % (script,))
        if role not in ROLES_SCRIPT:
            raise ValueError("role de script invalide : %r" % (role,))
        roles = await self._scripts_du_robot(robot)
        # Un script muet (`unavailable`, `unknown`) est un script absent (passe bis 2 du 20/10, sonde S2c) : rien ne se note comme fait.
        etat_script = self._etat_script(script)
        if roles.get(role) != script or etat_script is None:
            raise RefusNomme("script_inconnu", "script inconnu de ce robot", robot)
        if controle is not None and not controle(script):
            raise PermissionError("pas le droit de lancer %s" % script)
        depart = role in SCRIPTS_DEPART
        etat_robot = self.hass.states.get(robot)
        ph = phase(getattr(etat_robot, "state", None))
        # Un robot muet se refuse pour TOUT role, geste compris (trois defauts du 25/10, ADR 0218) : le script partait, l'ecran disait
        # « fait », et rien ne bougeait. Rien ne part, rien au carnet ni au journal ; les droits passent avant.
        if ph == "absent":
            raise RefusNomme("robot_injoignable", "robot injoignable", robot)
        libelle = nom_de_script(etat_script, etat_robot)
        par = getattr(user, "id", None)
        quand = jeton = restante = None
        if depart:
            if ph in ("travail", "pause", "retour") or self._depart_recent(robot) or self._vol(robot):
                raise RefusNomme("deja_en_route", "deja en route", robot)
            quand = self._demander(robot, zones, tout=False, source="loggia", par=par, libelle=libelle)
            jeton = self._lever_vol(robot)
        quoi = ("script : {nom}", {"nom": libelle})
        ctx = Context(user_id=par) if par else Context()
        try:
            fini, tache = await self._attendre(self.hass.services.async_call("script", "turn_on", {"entity_id": [script]},
                                                                             blocking=True, context=ctx),
                                               time.monotonic() + ATTENTE_DEPART_S)
            if not fini:
                restante = tache
                self._suivre_tardif(tache, robot, quand, quoi)
        except Exception as err:  # noqa: BLE001 — un refus, une panne : la meme suite
            if quand is not None:
                self._oublier_demande(robot, quand)
            _LOGGER.warning("Loggia robots : le script %s de %s n'a pas abouti", script, robot, exc_info=True)
            await self.regles.noter(MODULE, "main", quoi, cibles=[robot], n=0, motif="depuis l’écran",
                                    detail="commande refusee par Home Assistant", echec=True)
            if depart:
                raise RefusNomme("commande_refusee", "commande refusee par Home Assistant", robot) from err
            raise RefusNomme("geste_refuse", "geste refuse par Home Assistant", robot) from err
        finally:
            if jeton is not None:
                self._poser_fin_de_vol(robot, jeton, restante)
        await self.regles.noter(MODULE, "main", quoi, cibles=[robot], motif="depuis l’écran")
        return await self.async_etat(user)

    async def _async_localiser(self, robot: str, *, user: Any, controle: Any) -> dict[str, Any]:
        """« Localiser », decide ICI (petit paquet du 25/10) : l'ecran lisait la description de la maison dans le cache de son onglet
        (`cfgVal`) pour savoir si un script `localiser` etait designe — vide ou perime, `locate` partait alors qu'un script existait,
        ou l'inverse. Le serveur lit la description telle qu'elle est sur le disque : le script `localiser` de l'aspirateur principal,
        designe et qui repond, part par `_async_lancer_script` (un geste, rien au carnet) ; sinon `vacuum.locate`, un service explicite,
        sous le contexte de la personne et ATTENTE_DEPART_S au plus. Un robot muet se refuse (`robot_injoignable`) — Home Assistant
        sauterait l'entite en silence, et l'ecran dirait « Il bipe » ; un `locate` refuse, `geste_refuse`. Ni carnet, ni journal :
        c'etait deja le cas du `locate` que l'ecran envoyait lui-meme."""
        if not robot.startswith("vacuum."):
            raise ValueError("seul un aspirateur se localise : %r" % (robot,))
        script = (await self._scripts_du_robot(robot)).get("localiser")
        if self._etat_script(script) is not None:
            try:
                return await self._async_lancer_script(robot, script, "localiser", [], user=user, controle=controle)
            except RefusNomme as err:
                # Le script vient de disparaitre entre la lecture et le lancement : `locate` a sa place, comme avant.
                if err.code != "script_inconnu":
                    raise
        if phase(getattr(self.hass.states.get(robot), "state", None)) == "absent":
            raise RefusNomme("robot_injoignable", "robot injoignable", robot)
        par = getattr(user, "id", None)
        ctx = Context(user_id=par) if par else Context()
        try:
            await self._attendre(self.hass.services.async_call("vacuum", "locate", {"entity_id": [robot]}, blocking=True, context=ctx),
                                 time.monotonic() + ATTENTE_DEPART_S)
        except Exception as err:  # noqa: BLE001 — un refus, une panne : la meme suite
            _LOGGER.warning("Loggia robots : localiser %s n'a pas abouti", robot, exc_info=True)
            raise RefusNomme("geste_refuse", "geste refuse par Home Assistant", robot) from err
        return await self.async_etat(user)

    async def async_lancer_depart(self, robot: Any, zones: Any = None, *, script: Any = None, role: Any = None, user: Any = None,
                                  controle: Any = None, localiser: bool = False) -> dict[str, Any]:
        """`loggia/robots/lancer {robot, zones, script, role}` : le depart que donne une personne depuis l'ecran (I3 A).

        `zones` a la forme de celles d'un planning (`[{id, nom, segments}]`). Des pieces partent par la commande
        que SON integration attend ; aucune, c'est tout le logement (`vacuum.start`). Une tondeuse allume les aires
        choisies, eteint les autres, puis tond (`start_mowing`) ; sans aire choisie, elle tond ses aires allumees,
        que le carnet nomme — et sans aire allumee non plus, elle ne part pas. Toujours un service explicite, jamais
        `toggle` ; sous le contexte de la personne : le socle y voit une main, comme sur l'application du fabricant.
        Chaque service attendu, ATTENTE_DEPART_S au plus en tout (passe bis 2 du 18/10, point E) : une commande de depart
        sans reponse a temps compte pour partie et continue sans nous ; une bascule d'aire sans reponse retient la tondeuse.
        Rend l'etat, sous ses droits de lecture.

        Un refus ne commande rien et ne laisse aucune demande derriere lui : ValueError pour un robot ou des zones
        illisibles, PermissionError pour un robot que ce compte ne pilote pas, et un code (`RefusNomme`) pour ce
        qu'un geste ordinaire provoque — `robot_injoignable`, `deja_en_route` (au travail, en pause, au retour, un
        depart deja demande il y a moins de DEPART_RECENT_S, ou encore en vol : deux appuis, deux ecrans, l'ecran et le planning
        ne font pas deux departs), `pieces_inconnues` (l'integration ne sait pas viser des pieces : on ne part pas pour tout
        le logement a la place), `zone_inconnue` (une aire qui n'est pas la sienne), `aucune_aire` (une tondeuse a aires sans
        aire allumee ni choisie : `start_mowing` ne part jamais — point D), `sans_reponse` (une bascule d'aire que
        l'integration n'a pas faite a temps), `commande_refusee` (Home Assistant a refuse l'appel). Depuis la tranche robots 2
        (ADR 0218), un depart par ZONES de Home Assistant se verifie AVANT l'appel : `association_absente`, `zone_sans_piece` (une
        zone disparue du registre comprise), `autre_carte` ; et chez Ecovacs, `pieces_perimees` (une liste que le robot ne publie
        plus a l'instant du depart, ou plus rien). Depuis la passe bis du 20/10, `scripts_gardent_la_main` : un script de depart
        est designe, et Loggia ne prend pas la main sur les pieces — ni zones, ni segments. `script` et `role` : un script maison
        de l'aspirateur principal (`_async_lancer_script`) ; un script qui n'est pas celui de ce role, `script_inconnu`. `localiser`
        (petit paquet du 25/10) : « Localiser », que le serveur decide seul (`_async_localiser`) — ni zones, ni script avec lui."""
        if not isinstance(robot, str) or not ROBOT.fullmatch(robot):
            raise ValueError("robot invalide : %r" % (robot,))
        if controle is not None and not controle(robot):
            raise PermissionError("pas le droit de piloter %s" % robot)
        if localiser:
            if script is not None or role is not None or zones:
                raise ValueError("localiser se demande seul, sans zones ni script")
            return await self._async_localiser(robot, user=user, controle=controle)
        zones = lire_zones(zones if zones is not None else [])
        # Un script maison de l'aspirateur part par ici aussi (point A) : ses regles a lui.
        if script is not None:
            return await self._async_lancer_script(robot, script, role, zones, user=user, controle=controle)
        # Tout ce qui se LIT se lit AVANT la garde (relecture qualite, D8) : entre la garde et le vol, plus aucun `await` — deux
        # appuis dont la lecture suspendrait ne font pas deux departs. Les pieces du robot (tranche robots 2), et sa description ;
        # une lecture qui leve ne retient pas « tout le logement » (passe bis 2 du 20/10, sonde S4).
        pieces = await self._async_pieces_ou_rien(robot) if robot.startswith("vacuum.") else None
        ph = phase(getattr(self.hass.states.get(robot), "state", None))
        if ph == "absent":
            raise RefusNomme("robot_injoignable", "robot injoignable", robot)
        if ph in ("travail", "pause", "retour") or self._depart_recent(robot) or self._vol(robot):
            raise RefusNomme("deja_en_route", "deja en route", robot)
        # Sa decision du 20/10 : un script de depart designe garde la main sur les pieces — un depart par zones ou par segments ne
        # part pas d'ici (l'ecran n'en envoie pas ; le serveur le dit des memes mots).
        if zones and pieces is not None and pieces["source"] == "scripts":
            raise RefusNomme("scripts_gardent_la_main", MOTIFS_REFUS["scripts_gardent_la_main"], robot)

        appels: list[tuple[str, str, list[str], dict]] = []
        if robot.startswith("lawn_mower."):
            aires = self._aires(robot)
            for z in zones:
                if z["id"] not in aires:
                    raise RefusNomme("zone_inconnue", "zone inconnue de ce robot", z["id"])
            # La regle de « ou » (passe bis du 18/10, point 2) : sans zone, ses aires deja allumees, rien ne bascule ; avec, les
            # choisies s'allument et les autres s'eteignent — puis elle tond.
            visees, tout, bascules = self._depart_tondeuse(robot, zones)
            if aires and not visees:
                # Aucune aire allumee ni choisie (passe bis 2 du 18/10, point D) : `start_mowing` ne part jamais — elle tondrait on
                # ne sait quoi, et Loggia ne rallume pas une aire que personne n'a touchee. On choisit dans la fiche.
                raise RefusNomme("aucune_aire", "aucune zone allumee", robot)
            appels.extend((domaine, service, cibles, {}) for domaine, service, cibles in bascules)
            appels.append(("lawn_mower", "start_mowing", [robot], {}))
            noms = ", ".join(z["nom"] for z in visees)
            quoi: Any = ("tondre : {noms}", {"noms": noms}) if noms else "tondre"
        elif zones and est_zone_ha(zones[0]):
            # Des ZONES de Home Assistant (tranche robots 2, R4) : ce que Home Assistant refuserait APRES avoir lance se dit AVANT —
            # le bit, l'association, une zone sans piece, une zone d'une autre carte — ; puis `vacuum.clean_area`, une seule commande.
            code = verifier_zones(zones, pieces or {})
            if code:
                raise RefusNomme(code, MOTIFS_REFUS[code], robot)
            domaine, service, data = commande_zones(zones)
            appels.append((domaine, service, [robot], data))
            visees, tout = zones, False
            quoi = ("nettoyer : {noms}", {"noms": ", ".join(z["nom"] for z in zones)})
        elif zones:
            # Une piece sans segment, Loggia ne sait pas la viser (passe bis du 18/10, point 6) : le depart se refuse — ni « tout le
            # logement » a sa place, ni les seules pieces qu'il sait viser. Et chez Ecovacs, une liste que le robot ne publie plus
            # ne part pas (Q2) : on le dit — d'abord (relecture qualite, D6), car un `rooms` vide est une liste perimee avant
            # d'etre des pieces que l'integration ne sait pas viser.
            if self._segments_perimes(robot, zones):
                raise RefusNomme("pieces_perimees", MOTIFS_REFUS["pieces_perimees"], robot)
            commande = self._commande_segments(robot, zones)
            if commande is None:
                raise RefusNomme("pieces_inconnues", MOTIFS_REFUS["pieces_inconnues"], robot)
            domaine, service, data = commande
            appels.append((domaine, service, [robot], data))
            visees, tout = zones, False
            quoi = ("nettoyer : {noms}", {"noms": ", ".join(z["nom"] for z in zones)})
        else:
            appels.append(("vacuum", "start", [robot], {}))
            visees, tout, quoi = [], True, "nettoyer"

        par = getattr(user, "id", None)
        quand = self._demander(robot, visees, tout=tout, source="loggia", par=par)
        ctx = Context(user_id=par) if par else Context()
        jeton, restante = self._lever_vol(robot), None
        limite = time.monotonic() + ATTENTE_DEPART_S
        try:
            # Chaque service ATTENDU (passe bis du 18/10, point 4) : les bascules d'aires finies avant `start_mowing`, et l'echec
            # d'une integration — que seul un appel attendu fait remonter — se dit, au lieu de passer pour un depart. Le temps est
            # BORNE (passe bis 2 du 18/10, point E) : une bascule sans reponse retient la tondeuse ; la commande de depart sans
            # reponse compte pour partie et continue sans nous — le vol tient jusqu'a sa reponse.
            for i, (domaine, service, cibles, data) in enumerate(appels):
                fini, tache = await self._attendre(self.hass.services.async_call(domaine, service, {"entity_id": cibles, **data},
                                                                                 blocking=True, context=ctx), limite)
                if fini:
                    continue
                restante = tache
                if i < len(appels) - 1:
                    self._oublier_demande(robot, quand)
                    _LOGGER.warning("Loggia robots : %s.%s de %s sans reponse en %s s, la tondeuse ne part pas",
                                    domaine, service, robot, ATTENTE_DEPART_S)
                    await self.regles.noter(MODULE, "main", quoi, cibles=[robot], n=0, motif="depuis l’écran",
                                            detail="sans réponse de Home Assistant", echec=True)
                    raise RefusNomme("sans_reponse", "pas de reponse de Home Assistant", robot)
                _LOGGER.warning("Loggia robots : %s.%s de %s sans reponse en %s s, il continue sans nous",
                                domaine, service, robot, ATTENTE_DEPART_S)
                self._suivre_tardif(tache, robot, quand, quoi)
        except RefusNomme:
            raise
        except Exception as err:  # noqa: BLE001 — un refus, une panne : la meme suite
            self._oublier_demande(robot, quand)
            _LOGGER.warning("Loggia robots : le depart de %s n'a pas abouti", robot, exc_info=True)
            await self.regles.noter(MODULE, "main", quoi, cibles=[robot], n=0, motif="depuis l’écran",
                                    detail="commande refusee par Home Assistant", echec=True)
            raise RefusNomme("commande_refusee", "commande refusee par Home Assistant", robot) from err
        finally:
            self._poser_fin_de_vol(robot, jeton, restante)
        await self.regles.noter(MODULE, "main", quoi, cibles=[robot], motif="depuis l’écran")
        return await self.async_etat(user)

    # ── Ce que l'interface lit et ecrit ────────────────────────────────────
    async def async_config(self) -> dict[str, Any]:
        return normaliser(await self.store.async_get_shared(CLE, None))

    async def async_etat(self, user: Any = None) -> dict[str, Any]:
        """`loggia/robots/etat` : la configuration, la meteo, le journal — et le carnet (I3 A) : `passages` (le plus
        recent d'abord), `en_cours` et `erreurs` par robot, pour les robots que ce compte peut LIRE
        (`_lecture_autorisee`, la garde de l'etat du chauffage). Les durees en cours se comptent ici (`duree_min`).
        Plus de `maintenant` (passe bis du 18/10, point 10) : l'ecran ne le lisait pas, et il rendait chaque reponse
        differente de la precedente — l'ecran ne pouvait pas reconnaitre un etat inchange."""
        from .discovery import _lecture_autorisee

        lecture = _lecture_autorisee(user)
        # Les pieces de chaque aspirateur (tranche robots 2, R3) : l'association de Home Assistant, lue a chaque etat — une
        # association faite pendant que Loggia est ouvert se voit a la relecture suivante, sans recharger. Le registre se range UNE
        # fois pour tous ; un robot dont l'etat est etrange n'emporte pas les autres (passe bis du 20/10, point 11).
        entites = await self._async_entites()
        entrees = self._entrees_triees()
        pieces = {}
        try:
            aspirateurs = sorted(self.hass.states.async_entity_ids("vacuum"))
        except Exception:  # noqa: BLE001
            aspirateurs = []
        for robot in aspirateurs:
            if lecture is None or lecture(robot):
                try:
                    pieces[robot] = await self._async_pieces(robot, entites, entrees)
                except Exception:  # noqa: BLE001
                    _LOGGER.warning("Loggia robots : pieces de %s illisibles", robot, exc_info=True)
        # L'aspirateur principal que le serveur RETIENT (petit paquet du 25/10) : celui dont les scripts maison valent. L'ecran le lit
        # pour tout ce qui touche a ces scripts — il prenait le premier aspirateur decouvert, et proposait des scripts que le serveur
        # ignorait. None : aucun (deux aspirateurs et rien de nomme), ou un aspirateur que ce compte ne lit pas.
        principal = self._aspirateur_principal(entites)
        if principal is not None and lecture is not None and not lecture(principal):
            principal = None
        return {
            "principal": principal,
            "config": await self.async_config(),
            # La pluie ne retient une tondeuse que si la maison a une meteo :
            # sans elle, l'ecran ne propose pas le reglage.
            "meteo": await self._meteo(),
            "journal": await self.regles.journal(limite=20, module=MODULE),
            **vue(self.carnet, self._maintenant(), lecture),
            "pieces": pieces,
        }

    def _poser_patch(self, cfg: dict[str, Any], patch: dict[str, Any]) -> None:
        """`plannings` REMPLACE la liste ; `robots` se fusionne robot par robot.
        Tout est relu : une valeur illisible est refusee, pas ecartee — et
        rien n'est ecrit. Synchrone : sous le verrou du magasin."""
        patch = patch or {}
        if "plannings" in patch:
            liste = patch["plannings"]
            if not isinstance(liste, list):
                raise ValueError("plannings : une liste")
            if len(liste) > MAX_PLANNINGS:
                # Le seul refus que l'ecran puisse provoquer ici : son code, et
                # la limite que l'ecran dit dans sa langue (audit du 03/10).
                raise RefusNomme("trop_de_plannings", "trop de plannings, au plus", MAX_PLANNINGS)
            propres = [normaliser_planning(p) for p in liste]
            if len({p["id"] for p in propres}) != len(propres):
                raise ValueError("deux plannings portent le meme identifiant")
            cfg["plannings"] = propres
        if "robots" in patch:
            if not isinstance(patch["robots"], dict):
                raise ValueError("robots : un objet par robot")
            for haid, reglages in patch["robots"].items():
                if not isinstance(haid, str) or not ROBOT.fullmatch(haid) or not isinstance(reglages, dict):
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

    async def async_enregistrer(self, patch: dict[str, Any]) -> dict[str, Any]:
        """D'un seul tenant, sous le verrou du magasin (lot 15 de l'audit du
        03/10 ; voir store.async_modifier_shared). Un refus n'ecrit rien."""
        def changer(brut: Any) -> dict[str, Any]:
            cfg = normaliser(brut)
            self._poser_patch(cfg, patch)
            return cfg

        cfg = await self.store.async_modifier_shared(CLE, changer)
        self.cfg = cfg
        self._reabonner()
        return cfg

    async def async_designer_script(self, role: Any, script: Any, *, user: Any = None) -> dict[str, Any]:
        """`loggia/robots/scripts {role, script}` (passe bis 2 du 20/10, relecture de controle) : la roue de la popup designe un
        script par ROLE pour l'aspirateur de la maison — ou le retire (`script` None). Le role part SEUL de l'ecran, et se fond ici
        dans la description de la maison (`loggia_entities`) TELLE QU'ELLE EST SUR LE DISQUE, d'un seul tenant sous le verrou du
        magasin (`fusion_vacuum_scripts`) : rien d'autre que `vacuumScripts[role]` ne bouge. Avant, l'ecran reecrivait la
        description entiere par `config/set` depuis son cache — vide ou perime tant que `loggia/config/get` n'avait pas repondu —
        et une designation effacait les dix-neuf autres cles. Un refus (role ou script invalides, description illisible) n'ecrit
        rien ; le magasin signale la cle changee aux ecrans (ADR 0067). Rend l'etat des robots, sous les droits du compte : la roue
        y lit les roles designes (`pieces[robot].scripts`)."""
        if role not in ROLES_SCRIPT:
            raise ValueError("role de script invalide : %r" % (role,))
        if script is not None and (not isinstance(script, str) or not SCRIPT.fullmatch(script)):
            raise ValueError("script invalide : %r" % (script,))
        await self.store.async_modifier_shared(CLE_ENTITES, lambda en_place: fusion_vacuum_scripts(en_place, role, script))
        self.store.signaler_communes([CLE_ENTITES])
        return await self.async_etat(user)

    @callback
    def async_arreter(self) -> None:
        self._arrete = True
        for defaire in self._defait:
            try:
                defaire()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia robots : desabonnement sans effet")
        self._defait.clear()
        for nom in ("_au_demarrage", "_ecoute", "_defait_arret"):
            defaire = getattr(self, nom, None)
            if defaire is not None:
                try:
                    defaire()
                except Exception:  # noqa: BLE001
                    _LOGGER.debug("Loggia robots : ecoute du carnet deja retiree")
                setattr(self, nom, None)
        # Ce que l'ecriture differee retenait part MAINTENANT : un rechargement ne perd pas les dernieres notes. La
        # tache reste a la portee de l'instance suivante, qui l'attend avant de relire (`_async_attendre_ecriture_retiree`).
        if self._annuler_ecriture():
            tache = self.hass.async_create_task(self._async_ecrire())
            donnees = getattr(self.hass, "data", None)
            if isinstance(donnees, dict):
                donnees.setdefault(DOMAIN, {})[CLE_ECRITURE_FINALE] = tache
