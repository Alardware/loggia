"""Les minuteurs d'extinction : « eteindre dans 30 min », tenus par Home Assistant.

Pourquoi ce module existe
─────────────────────────
Retour du 21/09 : « pourquoi Loggia doit rester ouvert, c'est absurde, et je
n'ai pas le decompte ». Le minuteur vivait dans l'onglet du navigateur — un
`setTimeout` : fermer l'ecran l'annulait sans rien dire, un autre appareil ne
le voyait pas, et la ligne se contentait d'un « dans 30 min » arrondi. Il vit
desormais ICI : il part meme quand aucun ecran n'est ouvert, et chaque ecran
lit la meme heure de fin pour afficher le meme decompte.

Ce qui se passe quand...
────────────────────────
  * on reappuie : le temps s'AJOUTE a ce qui reste (+30 min, +30 min...) ;
  * l'appareil est eteint a la main avant l'heure : le minuteur s'efface — il
    n'avait plus d'objet, et il ne doit pas eteindre la lampe qu'on rallumera
    plus tard ;
  * Home Assistant redemarre : les minuteurs sont relus. Un minuteur echu
    pendant l'arret s'execute au demarrage — « eteindre dans 30 min » voulait
    dire « eteinte a telle heure », et cette heure est passee ;
  * l'appareil est deja eteint a l'heure dite : rien a faire, rien au journal.

L'extinction est la MAIN de celui qui a pose le minuteur, differee : elle part
avec son contexte (`Context(user_id=...)`), comme un scenario, et laisse une
ligne au journal. Le compte qui pose un minuteur doit avoir le droit de piloter
l'appareil : le composant appelle le service lui-meme, la verification que Home
Assistant ferait d'un appel direct n'a donc pas lieu (audit 18/09).
"""
from __future__ import annotations

import logging
import re
import time
from typing import TYPE_CHECKING, Any

from homeassistant.core import Context, HomeAssistant, callback

from .regles import demarrer

if TYPE_CHECKING:  # l'annotation seule — les tests chargent ce module hors paquet
    from .store import LoggiaStore

_LOGGER = logging.getLogger(__name__)

CLE = "loggia_minuteurs"
MODULE = "minuteurs"

# Ce qu'un minuteur sait eteindre : ce que les fiches proposent, et ce que
# `homeassistant.turn_off` eteint sans ambiguite.
DOMAINES = ("light", "switch", "fan", "input_boolean", "media_player")
ENTITE = re.compile(r"^(%s)\.[a-z0-9_]+$" % "|".join(DOMAINES))

MAX_MINUTEURS = 50
PAS_MAX = 24 * 60            # un appui ajoute au plus une journee
TOTAL_MAX = 24 * 3600        # et un minuteur ne va jamais au-dela de 24 h

# Ce qui compte pour « deja eteint » : l'extinction n'a alors plus d'objet.
ETEINT = {"off", "unavailable", "unknown", "standby"}


# ── Ce qui se calcule, sans Home Assistant ──────────────────────────────────

def valide(haid: Any) -> bool:
    return isinstance(haid, str) and bool(ENTITE.match(haid))


def normaliser(brut: Any) -> dict[str, dict[str, Any]]:
    """La table relue du magasin : ce qui est illisible s'ecarte, le reste est
    garde TEL QUEL — y compris l'echu, que le demarrage doit executer."""
    propre: dict[str, dict[str, Any]] = {}
    if not isinstance(brut, dict):
        return propre
    for haid, e in brut.items():
        if not valide(haid) or not isinstance(e, dict):
            continue
        try:
            fin = float(e.get("fin"))
            duree = int(e.get("duree") or 0)
        except (TypeError, ValueError):
            continue
        if fin <= 0:
            continue
        par = e.get("par")
        propre[haid] = {"fin": fin, "duree": max(0, duree), "par": par if isinstance(par, str) else None}
        if len(propre) >= MAX_MINUTEURS:
            break
    return propre


def prolonger(table: dict, haid: str, minutes: Any, maintenant: float,
              par: str | None = None) -> dict[str, dict[str, Any]]:
    """Une NOUVELLE table ou le minuteur de `haid` finit `minutes` plus tard :
    apres ce qui reste s'il en reste, sinon a partir de maintenant."""
    if not valide(haid):
        raise ValueError("entite non minutable : %r" % (haid,))
    # Un ENTIER, et rien d'autre : 2,5 ne devient pas 2 en silence, et un
    # booleen n'est pas un nombre de minutes.
    if isinstance(minutes, bool) or not isinstance(minutes, int):
        raise ValueError("minutes : un nombre entier")
    n = minutes
    if n < 1 or n > PAS_MAX:
        raise ValueError("minutes : entre 1 et %d" % PAS_MAX)
    neuve = dict(table or {})
    actuel = neuve.get(haid)
    en_cours = bool(actuel and actuel["fin"] > maintenant)
    if not en_cours and len({h for h, e in neuve.items() if e["fin"] > maintenant}) >= MAX_MINUTEURS:
        raise ValueError("%d minuteurs au plus" % MAX_MINUTEURS)
    depart = actuel["fin"] if en_cours else maintenant
    fin = min(depart + n * 60, maintenant + TOTAL_MAX)
    duree = (actuel["duree"] if en_cours else 0) + n
    neuve[haid] = {"fin": fin, "duree": duree, "par": par}
    return neuve


def reste(table: dict, haid: str, maintenant: float) -> float | None:
    """Les secondes qui restent, ou None s'il n'y a pas de minuteur en cours."""
    e = (table or {}).get(haid)
    if not e or e["fin"] <= maintenant:
        return None
    return e["fin"] - maintenant


def echus(table: dict, maintenant: float) -> list[str]:
    return sorted(h for h, e in (table or {}).items() if e["fin"] <= maintenant)


def motif(entree: dict, rattrape: bool = False) -> str:
    base = ("minuteur de %d min" % entree["duree"]) if entree.get("duree") else "minuteur"
    return base + (" (echu pendant un redemarrage)" if rattrape else "")


def vue(table: dict, maintenant: float, controle: Any = None) -> dict[str, Any]:
    """Ce que l'ecran lit : les minuteurs EN COURS, et l'heure du serveur — le
    decompte se cale dessus, quelle que soit l'horloge de l'appareil. Un compte
    restreint ne voit que ce qu'il peut piloter. Jamais `par` : qui a pose un
    minuteur ne regarde pas les autres ecrans."""
    en_cours = {}
    for haid, e in (table or {}).items():
        if e["fin"] <= maintenant:
            continue
        if controle is not None and not controle(haid):
            continue
        en_cours[haid] = {"fin": e["fin"], "duree": e["duree"]}
    return {"minuteurs": en_cours, "maintenant": maintenant}


# ── Le module ───────────────────────────────────────────────────────────────

class LoggiaMinuteurs:
    """Tient les minuteurs d'extinction et eteint a l'heure."""

    def __init__(self, hass: HomeAssistant, store: "LoggiaStore", regles=None) -> None:
        self.hass = hass
        self.store = store
        self.regles = regles
        self.table: dict[str, dict[str, Any]] = {}
        self._rdv: dict[str, Any] = {}
        self._ecoute = None
        demarrer(hass, self, self._async_demarrer(), "minuteurs")

    async def _async_demarrer(self) -> None:
        self.table = normaliser(await self.store.async_get_shared(CLE, None))
        maintenant = time.time()
        for haid in echus(self.table, maintenant):
            await self._async_echoir(haid, rattrape=True)
        for haid in list(self.table):
            self._armer(haid)
        self._reecouter()
        if self.table:
            _LOGGER.info("Loggia minuteurs : %d en cours", len(self.table))

    # ── Les rendez-vous ────────────────────────────────────────────────────
    def _armer(self, haid: str) -> None:
        self._desarmer(haid)
        e = self.table.get(haid)
        if not e:
            return
        from homeassistant.helpers.event import async_call_later

        @callback
        def echu(_now) -> None:
            self._rdv.pop(haid, None)
            self.hass.async_create_task(self._async_echoir(haid))

        self._rdv[haid] = async_call_later(self.hass, max(0.0, e["fin"] - time.time()), echu)

    def _desarmer(self, haid: str) -> None:
        annule = self._rdv.pop(haid, None)
        if annule:
            try:
                annule()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia minuteurs : rendez-vous deja passe")

    # ── Une lampe eteinte a la main n'a plus de minuteur ───────────────────
    def _reecouter(self) -> None:
        if self._ecoute:
            try:
                self._ecoute()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia minuteurs : ecoute deja retiree")
            self._ecoute = None
        ids = sorted(self.table)
        if not ids:
            return
        from homeassistant.helpers.event import async_track_state_change_event

        self._ecoute = async_track_state_change_event(self.hass, ids, self._sur_etat)

    @callback
    def _sur_etat(self, event) -> None:
        d = event.data or {}
        haid = d.get("entity_id")
        neuf = d.get("new_state")
        # « off » seulement : une lampe Zigbee qui decroche une minute n'a pas
        # ete eteinte, son minuteur doit tenir.
        if haid in self.table and neuf is not None and str(neuf.state).lower() == "off":
            self.hass.async_create_task(self.async_annuler(haid))

    # ── L'extinction ───────────────────────────────────────────────────────
    async def _async_echoir(self, haid: str, rattrape: bool = False) -> None:
        entree = self.table.pop(haid, None)
        self._desarmer(haid)
        await self._sauver()
        self._reecouter()
        if entree is None:
            return
        st = self.hass.states.get(haid)
        if st is None or str(st.state).lower() in ETEINT:
            return
        ctx = Context(user_id=entree["par"]) if entree.get("par") else Context()
        try:
            await self.hass.services.async_call("homeassistant", "turn_off", {"entity_id": [haid]},
                                                blocking=False, context=ctx)
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Loggia minuteurs : l'extinction de %s a echoue", haid)
            return
        if self.regles is not None:
            await self.regles.noter(MODULE, "minuteur", "eteindre", cibles=[haid], n=1,
                                    motif=motif(entree, rattrape))

    async def _sauver(self) -> None:
        await self.store.async_set_shared(CLE, self.table)

    # ── Ce que l'interface lit et ecrit ────────────────────────────────────
    def async_etat(self, controle: Any = None) -> dict[str, Any]:
        return vue(self.table, time.time(), controle)

    async def async_poser(self, haid: str, minutes: Any, par: str | None = None,
                          controle: Any = None) -> dict[str, Any]:
        if not valide(haid):
            raise ValueError("entite non minutable : %r" % (haid,))
        if controle is not None and not controle(haid):
            raise PermissionError("pas le droit de piloter %s" % haid)
        if self.hass.states.get(haid) is None:
            raise ValueError("entite inconnue : %s" % haid)
        self.table = prolonger(self.table, haid, minutes, time.time(), par)
        await self._sauver()
        self._armer(haid)
        self._reecouter()
        return self.async_etat(controle)

    async def async_annuler(self, haid: str, controle: Any = None) -> dict[str, Any]:
        if controle is not None and not controle(haid):
            raise PermissionError("pas le droit de piloter %s" % haid)
        if self.table.pop(haid, None) is not None:
            self._desarmer(haid)
            await self._sauver()
            self._reecouter()
        return self.async_etat(controle)

    @callback
    def async_arreter(self) -> None:
        for haid in list(self._rdv):
            self._desarmer(haid)
        if self._ecoute:
            try:
                self._ecoute()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia minuteurs : desabonnement sans effet")
            self._ecoute = None
