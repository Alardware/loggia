"""Le planning des purificateurs d'air (sa consigne du 21/11, ADR 0387), tenu par Home Assistant.

Pourquoi ce module existe
─────────────────────────
La fiche d'un purificateur porte un onglet Planning : une semaine de plages, chacune un MODE (Arret, Auto, Nuit, ou un cran
de vitesse). Une action differee ne vit jamais dans l'onglet du navigateur (21/09) : un ecran se ferme, la maison continue.
Le planning vit donc ICI, comme celui des robots.

Ce qui se passe quand...
────────────────────────
  * une plage commence : son mode part — SEULEMENT si le mode change. Deux plages de suite au meme mode (la Nuit de 22:30
    puis celle de 00:00) n'en font qu'une : un reglage a la main tient jusqu'au prochain CHANGEMENT, puis le planning
    reprend. Rien n'est reimpose entre deux changements ;
  * on regle l'appareil a la main (sa fiche, sa telecommande, son application) : rien ; le prochain changement reprend ;
  * Home Assistant redemarre : le dernier changement manque pendant l'arret part au demarrage, s'il date de moins de six
    heures et n'avait pas deja ete applique — « Auto a 07:00 » voulait dire « en Auto le matin » ;
  * l'appareil ne sait pas le mode (un preset qu'il n'a plus) : rien ne part, une ligne au journal le dit ;
  * l'heure d'hiver repete 02:00-02:59 : un changement deja tente a cette heure ce jour-la ne repart pas.

Le planning est la configuration de la maison : seuls les administrateurs l'ecrivent ; tout compte le lit, sous ses droits
de lecture. Il commande l'appareil sans auteur (`Context()`), comme le planning des robots.
"""
from __future__ import annotations

import copy
import logging
import re
import time
from typing import TYPE_CHECKING, Any

from homeassistant.core import Context, HomeAssistant, callback

from .entites import motif_de
from .refus import RefusNomme
from .regles import demarrer

if TYPE_CHECKING:  # l'annotation seule — les tests chargent ce module hors paquet
    from .store import LoggiaStore

_LOGGER = logging.getLogger(__name__)

CLE = "loggia_purificateurs"
MODULE = "purificateurs"
ENTITE = motif_de(("fan",))

PAS = 30                       # minutes : le pas des plages
FIN = 24 * 60
MAX_PLAGES = 24                # par jour
MAX_PURIFICATEURS = 20
RATTRAPAGE_MAX = 6 * 3600      # un changement manque pendant un arret part au demarrage s'il a moins de six heures
MODES = re.compile(r"(arret|marche|auto|nuit|v[1-6])")

# Les modes d'un appareil, lus dans ses preset_modes (sans casse) : le meme vocabulaire que la fiche (purificateur.js).
PRESETS_AUTO = ("auto", "smart")
PRESETS_NUIT = ("sleep", "night", "silent", "advanced_sleep")


# ── Ce qui se calcule, sans Home Assistant ──────────────────────────────────

def valide(haid: Any) -> bool:
    return isinstance(haid, str) and bool(ENTITE.fullmatch(haid))


def journee(brute: Any) -> list[dict[str, Any]]:
    """Une journee propre, ou ValueError : des plages `{debut, mode}`, la premiere a 00:00, des debuts entiers au pas de
    30 min, strictement croissants, `MAX_PLAGES` au plus."""
    if not isinstance(brute, list) or not brute:
        raise RefusNomme("purificateur_semaine", "une journee est une liste de plages non vide")
    if len(brute) > MAX_PLAGES:
        raise RefusNomme("purificateur_semaine", "%d plages par jour au plus" % MAX_PLAGES)
    sortie: list[dict[str, Any]] = []
    for p in brute:
        if not isinstance(p, dict):
            raise RefusNomme("purificateur_semaine", "plage illisible")
        debut, mode = p.get("debut"), p.get("mode")
        if isinstance(debut, bool) or not isinstance(debut, int) or debut < 0 or debut >= FIN or debut % PAS:
            raise RefusNomme("purificateur_semaine", "debut au pas de %d min, entre 00:00 et 23:30" % PAS)
        if not isinstance(mode, str) or not MODES.fullmatch(mode):
            raise RefusNomme("purificateur_semaine", "mode inconnu", mode)
        if sortie and debut <= sortie[-1]["debut"]:
            raise RefusNomme("purificateur_semaine", "plages dans l'ordre, sans doublon")
        sortie.append({"debut": debut, "mode": mode})
    if sortie[0]["debut"] != 0:
        raise RefusNomme("purificateur_semaine", "la premiere plage commence a 00:00")
    return sortie


def semaine(brute: Any) -> list[list[dict[str, Any]]]:
    """Sept journees propres (lundi = 0), ou ValueError."""
    if not isinstance(brute, list) or len(brute) != 7:
        raise RefusNomme("purificateur_semaine", "sept journees, du lundi au dimanche")
    return [journee(j) for j in brute]


def normaliser(brut: Any) -> dict[str, dict[str, Any]]:
    """La table relue du magasin : ce qui est illisible s'ecarte, sans bruit."""
    propre: dict[str, dict[str, Any]] = {}
    if not isinstance(brut, dict):
        return propre
    for haid, e in brut.items():
        if not valide(haid) or not isinstance(e, dict):
            continue
        try:
            s = semaine(e.get("semaine"))
        except ValueError:
            continue
        dernier = e.get("dernier")
        propre[haid] = {"actif": e.get("actif") is True, "semaine": s,
                        "dernier": float(dernier) if isinstance(dernier, (int, float)) and not isinstance(dernier, bool) else 0.0}
        if len(propre) >= MAX_PURIFICATEURS:
            break
    return propre


def changements(s: list[list[dict[str, Any]]]) -> list[tuple[int, int, str]]:
    """Les CHANGEMENTS de la semaine, `(jour, debut, mode)` : une plage dont le mode differe de la plage d'avant — celle de
    la veille pour la premiere du jour, dimanche soir pour lundi 00:00. Une semaine d'un seul mode n'en a aucun."""
    plages = [(j, p["debut"], p["mode"]) for j in range(7) for p in s[j]]
    sortie = []
    for i, (j, debut, mode) in enumerate(plages):
        if mode != plages[i - 1][2]:
            sortie.append((j, debut, mode))
    return sortie


def change_a(s: list[list[dict[str, Any]]], jour: int, minute: int) -> str | None:
    """Le mode qui commence a (`jour`, `minute`) s'il y a la un changement, sinon None."""
    for j, debut, mode in changements(s):
        if j == jour and debut == minute:
            return mode
    return None


def dernier_changement(s: list[list[dict[str, Any]]], jour: int, minute: int) -> tuple[int, str] | None:
    """Le dernier changement a (`jour`, `minute`) ou avant, sur la semaine : `(minutes ecoulees depuis, mode)`, ou None."""
    maintenant = jour * FIN + minute
    meilleur = None
    for j, debut, mode in changements(s):
        ecart = (maintenant - (j * FIN + debut)) % (7 * FIN)
        if meilleur is None or ecart < meilleur[0]:
            meilleur = (ecart, mode)
    return meilleur


# Les bits de FanEntityFeature : vitesse, prereglages, eteindre, allumer.
SET_SPEED, PRESET_MODE, TURN_OFF, TURN_ON = 1, 8, 16, 32


def ordre(mode: str, attributs: dict[str, Any]) -> tuple[str, dict[str, Any]] | None:
    """Le service `fan` qui met l'appareil dans `mode`, et ses donnees ; None s'il ne sait pas ce mode.

    Seulement ce que l'appareil DECLARE (`supported_features`), comme la fiche : un prereglage sans le bit 8, une vitesse
    sans le bit 1, s'eteindre sans le bit 16 ne partent pas. Sans masque du tout, allumer et eteindre restent permis.
    Les crans : `percentage_step` de l'appareil (trois vitesses : 33, 67, 100)."""
    bits = attributs.get("supported_features")
    masque = bits if isinstance(bits, int) and not isinstance(bits, bool) else None

    def sait(b: int) -> bool:
        return (b in (TURN_ON, TURN_OFF)) if masque is None else bool(masque & b)

    if mode == "arret":
        return ("turn_off", {}) if sait(TURN_OFF) else None
    if mode == "marche":
        return ("turn_on", {}) if sait(TURN_ON) else None
    presets = [p for p in (attributs.get("preset_modes") or []) if isinstance(p, str)] if sait(PRESET_MODE) else []
    if mode in ("auto", "nuit"):
        voulus = PRESETS_AUTO if mode == "auto" else PRESETS_NUIT
        preset = next((p for p in presets if p.lower() in voulus), None)
        return ("turn_on", {"preset_mode": preset}) if preset else None
    if not sait(SET_SPEED):
        return None
    try:
        k = int(mode[1:])
        pas = float(attributs.get("percentage_step") or 0)
    except (TypeError, ValueError):
        return None
    if pas <= 0:
        return None
    crans = round(100 / pas)
    if k < 1 or k > crans:
        return None
    return ("turn_on", {"percentage": min(100, round(k * pas))})


def vue(table: dict, maintenant: float, lecture: Any = None) -> dict[str, Any]:
    """Ce que l'ecran lit : le planning de chaque purificateur que le compte peut LIRE, et l'heure du serveur."""
    out = {}
    for haid, e in (table or {}).items():
        if lecture is not None and not lecture(haid):
            continue
        out[haid] = {"actif": e["actif"], "semaine": copy.deepcopy(e["semaine"])}
    return {"purificateurs": out, "maintenant": maintenant}


# ── Le module ───────────────────────────────────────────────────────────────

class LoggiaPurificateurs:
    """Tient le planning des purificateurs et l'applique au debut de chaque changement."""

    def __init__(self, hass: HomeAssistant, store: "LoggiaStore", regles=None) -> None:
        self.hass = hass
        self.store = store
        self.regles = regles
        self.table: dict[str, dict[str, Any]] = {}
        self._tic = None
        self._au_demarrage = None
        self._tentes: dict[str, tuple] = {}
        demarrer(hass, self, self._async_demarrer(), "purificateurs")

    async def _async_demarrer(self) -> None:
        self.table = normaliser(await self.store.async_get_shared(CLE, None))
        from homeassistant.helpers.start import async_at_started

        # Le rattrapage attend que Home Assistant ait FINI de demarrer : l'appareil doit exister.
        self._au_demarrage = async_at_started(self.hass, self._async_rattraper)
        self._rebrancher()

    def _rebrancher(self) -> None:
        """Un tic par minute, a la seconde zero, tant qu'un planning est allume."""
        actifs = any(e["actif"] for e in self.table.values())
        if actifs and self._tic is None:
            from homeassistant.helpers.event import async_track_time_change

            self._tic = async_track_time_change(self.hass, self._sur_minute, second=0)
        elif not actifs and self._tic is not None:
            self._tic()
            self._tic = None

    @callback
    def _sur_minute(self, now) -> None:
        self.hass.async_create_task(self.async_minute(now))

    async def async_minute(self, quand=None) -> list[str]:
        """Applique ce qui change a cette minute. Rend les purificateurs commandes."""
        if quand is None:
            from homeassistant.util import dt as dt_util

            quand = dt_util.now()
        jour, minute = quand.weekday(), quand.hour * 60 + quand.minute
        faits = []
        for haid, e in list(self.table.items()):
            if not e["actif"]:
                continue
            mode = change_a(e["semaine"], jour, minute)
            if mode is None:
                continue
            # L'heure repetee de l'automne : deja tente a cette heure ce jour-la, il ne repart pas.
            cle = (quand.date(), minute)
            if self._tentes.get(haid) == cle:
                continue
            self._tentes[haid] = cle
            try:
                if await self._async_appliquer(haid, mode, "planning %02d:%02d" % divmod(minute, 60)):
                    faits.append(haid)
            except Exception:  # noqa: BLE001
                _LOGGER.warning("Loggia purificateurs : le planning de %s n'est pas parti", haid, exc_info=True)
        return faits

    async def _async_rattraper(self, _hass=None, quand=None) -> list[str]:
        """Le dernier changement manque pendant un arret de Home Assistant, s'il a moins de six heures et n'avait pas deja
        ete applique. Rend les purificateurs commandes."""
        self._au_demarrage = None
        if quand is None:
            from homeassistant.util import dt as dt_util

            quand = dt_util.now()
        maintenant = quand.timestamp()
        faits = []
        for haid, e in list(self.table.items()):
            if not e["actif"]:
                continue
            d = dernier_changement(e["semaine"], quand.weekday(), quand.hour * 60 + quand.minute)
            if d is None:
                continue
            ecart, mode = d
            depuis = maintenant - ecart * 60 - quand.second
            # Deja applique (un rechargement dans la journee), ou trop vieux : rien.
            if ecart * 60 > RATTRAPAGE_MAX or e.get("dernier", 0) >= depuis - 60:
                continue
            try:
                if await self._async_appliquer(haid, mode, "planning (manque pendant un redemarrage)"):
                    faits.append(haid)
            except Exception:  # noqa: BLE001
                _LOGGER.warning("Loggia purificateurs : le rattrapage de %s a echoue", haid, exc_info=True)
        return faits

    async def _async_appliquer(self, haid: str, mode: str, motif: str) -> bool:
        st = self.hass.states.get(haid)
        if st is None or str(st.state).lower() in ("unavailable", "unknown"):
            _LOGGER.info("Loggia purificateurs : %s ne repond pas, le changement vers %s attend le suivant", haid, mode)
            return False
        envoi = ordre(mode, dict(st.attributes or {}))
        if envoi is None:
            if self.regles is not None:
                await self.regles.noter(MODULE, "planning", mode, cibles=[haid], n=1, motif=motif + " : mode inconnu de l'appareil", echec=True)
            return False
        service, data = envoi
        await self.hass.services.async_call("fan", service, {"entity_id": [haid], **data}, blocking=False, context=Context())
        self.table[haid]["dernier"] = time.time()
        try:
            await self._sauver()
        except Exception:  # noqa: BLE001
            _LOGGER.warning("Loggia purificateurs : le dernier changement de %s n'a pas pu etre note", haid, exc_info=True)
        if self.regles is not None:
            await self.regles.noter(MODULE, "planning", mode, cibles=[haid], n=1, motif=motif)
        return True

    async def _sauver(self) -> None:
        await self.store.async_set_shared(CLE, copy.deepcopy(self.table))

    # ── Ce que l'interface lit et ecrit ────────────────────────────────────
    async def async_etat(self, user: Any = None) -> dict[str, Any]:
        from .discovery import _lecture_autorisee

        return vue(self.table, time.time(), _lecture_autorisee(user))

    async def async_regler(self, haid: str, actif: Any = None, semaine_brute: Any = None) -> dict[str, Any]:
        """Allumer, eteindre ou changer le planning de `haid`. Le premier reglage donne sa semaine."""
        if not valide(haid):
            raise RefusNomme("purificateur_inconnu", "pas un ventilateur", haid)
        if self.hass.states.get(haid) is None:
            raise RefusNomme("purificateur_inconnu", "entite inconnue", haid)
        if actif is not None and not isinstance(actif, bool):
            raise RefusNomme("purificateur_semaine", "actif : vrai ou faux")
        actuel = self.table.get(haid)
        neuve = semaine(semaine_brute) if semaine_brute is not None else (actuel or {}).get("semaine")
        if neuve is None:
            raise RefusNomme("purificateur_semaine", "le premier reglage donne la semaine")
        if actuel is None and len(self.table) >= MAX_PURIFICATEURS:
            raise RefusNomme("purificateur_semaine", "%d purificateurs au plus" % MAX_PURIFICATEURS)
        allume = actif if actif is not None else bool(actuel and actuel["actif"])
        # Allumer ne commande rien sur-le-champ : l'appareil reste sur son reglage jusqu'au prochain changement.
        dernier = time.time() if (allume and not (actuel and actuel["actif"])) else (actuel or {}).get("dernier", 0.0)
        self.table[haid] = {"actif": allume, "semaine": neuve, "dernier": dernier}
        await self._sauver()
        self._rebrancher()
        if self.regles is not None and actif is not None and (actuel is None or actuel["actif"] != actif):
            await self.regles.noter(MODULE, "planning", "allumer" if actif else "eteindre", cibles=[haid], n=1)
        return await self.async_etat()

    @callback
    def async_arreter(self) -> None:
        if self._au_demarrage:
            self._au_demarrage()
            self._au_demarrage = None
        if self._tic is not None:
            self._tic()
            self._tic = None
