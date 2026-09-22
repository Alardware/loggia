"""Le test d'une sirene : « sonner trois secondes », tenu par Home Assistant.

Pourquoi ce module existe
─────────────────────────
Audit du 22/09 : le bouton « Test sonore (3 s) » de la carte Sirene allumait
la sirene, puis comptait trois secondes DANS L'ONGLET avant de l'eteindre — un
`setTimeout`. Onglet ferme, page rechargee ou connexion perdue pendant ces
trois secondes : la sirene restait allumee. La meme absurdite que le minuteur
d'avant la v3.64.0, en plus bruyant. Le test vit desormais ICI.

Ce qui se passe quand...
────────────────────────
  * la sirene gere la duree (`SirenEntityFeature.DURATION`) : Home Assistant
    l'eteint lui-meme (`duration: 3`), il n'y a rien a tenir ;
  * elle ne la gere pas, ou c'est un `switch` : allumee, puis un rendez-vous
    de trois secondes l'eteint ;
  * on reappuie pendant le test : le rendez-vous repart de zero — la sirene
    n'est pas coupee au milieu du second test ;
  * Home Assistant redemarre pendant un test : le test en cours est relu au
    demarrage et la sirene eteinte aussitot — un redemarrage dure plus que
    trois secondes, elle a assez sonne ;
  * la sirene sonne deja, et ce n'est pas notre test : pas de test — on
    n'eteint pas une sirene qui sonne pour de vrai.

Comme le minuteur, le test est la MAIN de celui qui a appuye : les deux appels
partent avec son contexte (`Context(user_id=...)`) et laissent une ligne au
journal. Le compte doit avoir le droit de piloter la sirene : le composant
appelle les services lui-meme, la verification que Home Assistant ferait d'un
appel direct n'a donc pas lieu (audit 18/09).
"""
from __future__ import annotations

import logging
import re
import time
from typing import TYPE_CHECKING, Any

from homeassistant.core import Context, HomeAssistant, callback

if TYPE_CHECKING:  # l'annotation seule — les tests chargent ce module hors paquet
    from .store import LoggiaStore

_LOGGER = logging.getLogger(__name__)

CLE = "loggia_sirene_test"
MODULE = "sirene"

DUREE = 3  # secondes : ce que le bouton annonce

# Une sirene est un `siren.*`, ou un `switch.*` reconnu comme tel par la carte
# (ADR 0034) : les deux s'allument et s'eteignent par turn_on / turn_off.
DOMAINES = ("siren", "switch")
ENTITE = re.compile(r"^(%s)\.[a-z0-9_]+$" % "|".join(DOMAINES))

# SirenEntityFeature.DURATION : la sirene sait s'eteindre seule apres `duration`.
DRAPEAU_DUREE = 16

# Ce qui compte pour « eteinte » : eteindre n'a alors plus d'objet.
ETEINT = {"off", "unavailable", "unknown"}
INDISPONIBLE = {"unavailable", "unknown"}


# ── Ce qui se calcule, sans Home Assistant ──────────────────────────────────

def valide(haid: Any) -> bool:
    return isinstance(haid, str) and bool(ENTITE.match(haid))


def gere_duree(drapeaux: Any) -> bool:
    """La sirene annonce-t-elle DURATION dans `supported_features` ?"""
    try:
        return bool(int(drapeaux) & DRAPEAU_DUREE)
    except (TypeError, ValueError):
        return False


def normaliser(brut: Any) -> dict[str, dict[str, Any]]:
    """La table relue du magasin : ce qui est illisible s'ecarte."""
    propre: dict[str, dict[str, Any]] = {}
    if not isinstance(brut, dict):
        return propre
    for haid, e in brut.items():
        if not valide(haid) or not isinstance(e, dict):
            continue
        try:
            fin = float(e.get("fin"))
        except (TypeError, ValueError):
            continue
        par = e.get("par")
        propre[haid] = {"fin": fin, "par": par if isinstance(par, str) else None}
    return propre


# ── Le module ───────────────────────────────────────────────────────────────

class LoggiaSirene:
    """Allume une sirene pour l'essayer, et l'eteint trois secondes plus tard."""

    def __init__(self, hass: HomeAssistant, store: "LoggiaStore", regles=None) -> None:
        self.hass = hass
        self.store = store
        self.regles = regles
        self.table: dict[str, dict[str, Any]] = {}
        self._rdv: dict[str, Any] = {}
        hass.async_create_task(self._async_demarrer())

    async def _async_demarrer(self) -> None:
        self.table = normaliser(await self.store.async_get_shared(CLE, None))
        # Un test qui traverse un redemarrage a deja trop dure : on eteint.
        for haid in sorted(self.table):
            await self._async_eteindre(haid, rattrape=True)

    # ── Le rendez-vous ─────────────────────────────────────────────────────
    def _armer(self, haid: str) -> None:
        self._desarmer(haid)
        e = self.table.get(haid)
        if not e:
            return
        from homeassistant.helpers.event import async_call_later

        @callback
        def echu(_now) -> None:
            self._rdv.pop(haid, None)
            self.hass.async_create_task(self._async_eteindre(haid))

        self._rdv[haid] = async_call_later(self.hass, max(0.0, e["fin"] - time.time()), echu)

    def _desarmer(self, haid: str) -> None:
        annule = self._rdv.pop(haid, None)
        if annule:
            try:
                annule()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia sirene : rendez-vous deja passe")

    # ── L'extinction ───────────────────────────────────────────────────────
    async def _async_eteindre(self, haid: str, rattrape: bool = False) -> None:
        entree = self.table.pop(haid, None)
        self._desarmer(haid)
        await self._sauver()
        if entree is None:
            return
        st = self.hass.states.get(haid)
        if st is None or str(st.state).lower() in ETEINT:
            return
        ctx = Context(user_id=entree["par"]) if entree.get("par") else Context()
        dom = haid.split(".", 1)[0]
        try:
            await self.hass.services.async_call(dom, "turn_off", {"entity_id": [haid]},
                                                blocking=False, context=ctx)
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Loggia sirene : l'extinction de %s a echoue", haid)
            return
        if self.regles is not None:
            await self.regles.noter(MODULE, "test", "eteindre", cibles=[haid], n=1,
                                    motif="fin du test" + (" (redemarrage pendant le test)" if rattrape else ""))

    async def _sauver(self) -> None:
        await self.store.async_set_shared(CLE, self.table)

    # ── Ce que l'interface demande ─────────────────────────────────────────
    async def async_tester(self, haid: str, par: str | None = None,
                           controle: Any = None) -> dict[str, Any]:
        if not valide(haid):
            raise ValueError("entite non testable : %r" % (haid,))
        if controle is not None and not controle(haid):
            raise PermissionError("pas le droit de piloter %s" % haid)
        st = self.hass.states.get(haid)
        if st is None:
            raise ValueError("entite inconnue : %s" % haid)
        etat = str(st.state).lower()
        if etat in INDISPONIBLE:
            raise ValueError("sirene indisponible : %s" % haid)
        # Elle sonne, et ce n'est pas notre test : une alerte en cours, qu'un
        # essai ne doit surtout pas couper trois secondes plus tard.
        if etat == "on" and haid not in self.table:
            raise ValueError("la sirene sonne deja : %s" % haid)

        maintenant = time.time()
        ctx = Context(user_id=par) if par else Context()
        dom = haid.split(".", 1)[0]
        attrs = getattr(st, "attributes", None) or {}
        par_la_sirene = dom == "siren" and gere_duree(attrs.get("supported_features"))
        data: dict[str, Any] = {"entity_id": [haid]}
        if par_la_sirene:
            data["duration"] = DUREE
        await self.hass.services.async_call(dom, "turn_on", data, blocking=False, context=ctx)

        if not par_la_sirene:
            self.table[haid] = {"fin": maintenant + DUREE, "par": par}
            await self._sauver()
            self._armer(haid)
        if self.regles is not None:
            await self.regles.noter(MODULE, "test", "sonner", cibles=[haid], n=1,
                                    motif="test sonore de %d s" % DUREE
                                    + (" (duree geree par la sirene)" if par_la_sirene else ""))
        return {"entity_id": haid, "duree": DUREE, "fin": maintenant + DUREE, "maintenant": maintenant}

    @callback
    def async_arreter(self) -> None:
        for haid in list(self._rdv):
            self._desarmer(haid)
