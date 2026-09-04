"""La nuit : une veilleuse qui s'eteint seule, et les lampes oubliees.

Pourquoi ce module existe
─────────────────────────
Deux besoins de fin de journee, que chaque installation reecrit a la main.

  La veilleuse d'une chambre d'enfant. On l'allume au coucher, elle doit
  s'eteindre une demi-heure plus tard — et si possible en fondu, parce qu'une
  lampe qui claque reveille l'enfant qu'elle vient d'endormir.

  Les lampes oubliees. A une heure donnee, ce qui traine encore allume
  s'eteint, sauf ce qu'on a mis de cote.

Ce que ce module refuse de faire
────────────────────────────────
Le fondu n'est pas simule par paliers. Ou bien la lampe sait faire une
transition — Home Assistant l'annonce dans `supported_features` — et on la lui
demande ; ou bien elle ne sait pas, et elle s'eteint franchement. Baisser une
lampe par petits sauts toutes les secondes remplit le journal de Home
Assistant, use la liaison Zigbee, et donne un fondu saccade : c'est pire que
pas de fondu du tout.
"""
from __future__ import annotations

import logging
import time
from typing import TYPE_CHECKING, Any

from homeassistant.core import HomeAssistant, callback

if TYPE_CHECKING:  # l'annotation seule — les tests chargent ce module hors paquet
    from .store import LoggiaStore

_LOGGER = logging.getLogger(__name__)

CLE = "loggia_nuit"

# Le bit TRANSITION de LightEntityFeature : une lampe qui ne l'a pas ne sait
# pas s'eteindre en fondu, et le lui demander ne ferait rien de bon.
LIGHT_TRANSITION = 32

DEFAUT: dict[str, Any] = {
    "veilleuse": {"actif": False, "lampes": [], "duree": 30, "fondu": 5, "depuis": "19:00"},
    "coucher": {"actif": False, "heure": "23:30", "sauf": [], "jours": [0, 1, 2, 3, 4, 5, 6]},
}


def lire_heure(texte, defaut=(0, 0)):
    """« 19:00 » devient (19, 0). Une saisie illisible garde le defaut."""
    try:
        h, m = str(texte).split(":", 1)
        h, m = int(h), int(m)
        if 0 <= h <= 23 and 0 <= m <= 59:
            return (h, m)
    except (TypeError, ValueError):
        pass
    return defaut


def dans_la_soiree(maintenant, depuis) -> bool:
    """L'heure est-elle passee ?

    La plage court de `depuis` jusqu'a la fin de la nuit : une veilleuse
    allumee a 22 h compte, une allumee a 2 h du matin aussi, une allumee a
    15 h non. Sans heure lisible, la regle vaut a toute heure — mieux vaut
    une veilleuse qui s'eteint trop souvent qu'une qui reste allumee.
    """
    if depuis in (None, ""):
        return True
    h, m = lire_heure(depuis, (0, 0))
    debut = h * 60 + m
    courant = maintenant.hour * 60 + maintenant.minute
    # Avant midi, on est de l'autre cote de minuit : la soiree de la veille.
    return courant >= debut or courant < 12 * 60


def a_eteindre(etats: dict, sauf) -> list:
    """Les lampes allumees, moins celles qu'on epargne."""
    epargnees = set(sauf or [])
    return sorted(haid for haid, st in (etats or {}).items()
                  if haid not in epargnees
                  and str(getattr(st, "state", "")).lower() == "on")


class LoggiaNuit:
    """Eteint la veilleuse apres son delai, et les lampes oubliees a l'heure dite."""

    def __init__(self, hass: HomeAssistant, store: "LoggiaStore") -> None:
        self.hass = hass
        self.store = store
        self.cfg: dict[str, Any] = {}
        # Une minuterie par lampe : deux veilleuses ne partagent pas la leur.
        self._minuteurs: dict[str, Any] = {}
        self.journal: list[dict[str, Any]] = []
        self._defait: list[Any] = []
        self._defait_heure: list[Any] = []
        hass.async_create_task(self._async_demarrer())

    async def _async_demarrer(self) -> None:
        self.cfg = await self.async_config()
        await self._async_reabonner()

    async def _async_reabonner(self) -> None:
        for source in (self._defait, self._defait_heure):
            for defaire in source:
                try:
                    defaire()
                except Exception:  # noqa: BLE001
                    _LOGGER.debug("Loggia nuit : abonnement deja retire")
            source.clear()

        v = self.cfg.get("veilleuse") or {}
        if v.get("actif") and v.get("lampes"):
            from homeassistant.helpers.event import async_track_state_change_event

            self._defait.append(
                async_track_state_change_event(self.hass, sorted(set(v["lampes"])), self._sur_lampe)
            )
            _LOGGER.info("Loggia nuit : %d veilleuses suivies", len(set(v["lampes"])))

        c = self.cfg.get("coucher") or {}
        if c.get("actif"):
            from homeassistant.helpers.event import async_track_time_change

            h, m = lire_heure(c.get("heure"), (23, 30))
            self._defait_heure.append(
                async_track_time_change(self.hass, self._au_coucher, hour=h, minute=m, second=0)
            )
            _LOGGER.info("Loggia nuit : extinction a %02d:%02d", h, m)

    # ── La veilleuse ───────────────────────────────────────────────────────
    @callback
    def _sur_lampe(self, event) -> None:
        d = event.data or {}
        haid = d.get("entity_id")
        if not haid:
            return
        neuf = d.get("new_state")
        etat = str(getattr(neuf, "state", "")).lower() if neuf else ""
        if etat == "on":
            self.hass.async_create_task(self._async_armer(haid))
        else:
            # Eteinte a la main : la minuterie n'a plus lieu d'etre.
            self._desarmer(haid)

    async def _async_armer(self, haid: str) -> None:
        from homeassistant.util import dt as dt_util

        v = self.cfg.get("veilleuse") or {}
        if not v.get("actif") or haid not in (v.get("lampes") or []):
            return
        if not dans_la_soiree(dt_util.now(), v.get("depuis")):
            return
        if haid in self._minuteurs:
            return
        try:
            duree = max(0, int(v.get("duree", 30))) * 60
        except (TypeError, ValueError):
            duree = 1800
        if duree == 0:
            await self._async_eteindre_veilleuse(haid)
            return
        from homeassistant.helpers.event import async_call_later

        @callback
        def echu(_now):
            self._minuteurs.pop(haid, None)
            self.hass.async_create_task(self._async_eteindre_veilleuse(haid))

        self._minuteurs[haid] = async_call_later(self.hass, duree, echu)

    def _desarmer(self, haid: str) -> None:
        annule = self._minuteurs.pop(haid, None)
        if annule:
            try:
                annule()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia nuit : minuteur deja passe")

    def _sait_fondre(self, haid: str) -> bool:
        st = self.hass.states.get(haid)
        f = (st.attributes.get("supported_features") if st else None) or 0
        try:
            return bool(int(f) & LIGHT_TRANSITION)
        except (TypeError, ValueError):
            return False

    async def _async_eteindre_veilleuse(self, haid: str) -> None:
        st = self.hass.states.get(haid)
        # Eteinte entre temps : rien a faire.
        if st is None or str(getattr(st, "state", "")).lower() != "on":
            return
        v = self.cfg.get("veilleuse") or {}
        data: dict[str, Any] = {"entity_id": haid}
        try:
            fondu = max(0, int(v.get("fondu", 0)))
        except (TypeError, ValueError):
            fondu = 0
        # On ne demande une transition qu'a une lampe qui sait la faire.
        if fondu and self._sait_fondre(haid):
            data["transition"] = fondu * 60
        await self._async_service("light", "turn_off", data)
        self._noter("veilleuse", [haid])

    # ── Les lampes oubliees ────────────────────────────────────────────────
    @callback
    def _au_coucher(self, *_) -> None:
        self.hass.async_create_task(self._async_coucher())

    async def _async_coucher(self) -> None:
        from homeassistant.util import dt as dt_util

        c = self.cfg.get("coucher") or {}
        if not c.get("actif"):
            return
        jours = c.get("jours")
        if isinstance(jours, list) and jours and dt_util.now().weekday() not in jours:
            return
        try:
            ids = self.hass.states.async_entity_ids("light")
        except Exception:  # noqa: BLE001
            return
        etats = {i: self.hass.states.get(i) for i in ids}
        cibles = a_eteindre(etats, c.get("sauf"))
        if not cibles:
            return
        await self._async_service("light", "turn_off", {"entity_id": cibles})
        self._noter("coucher", cibles)

    # ── Outils ─────────────────────────────────────────────────────────────
    async def _async_service(self, domaine: str, service: str, data: dict) -> None:
        try:
            await self.hass.services.async_call(domaine, service, data, blocking=False)
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Loggia nuit : %s.%s a echoue", domaine, service)

    def _noter(self, quoi: str, entites: list) -> None:
        self.journal.insert(0, {"quoi": quoi, "entites": list(entites), "ts": time.time()})
        del self.journal[30:]

    # ── Ce que l'interface lit et ecrit ────────────────────────────────────
    async def async_config(self) -> dict[str, Any]:
        brut = await self.store.async_get_shared(CLE, None)
        cfg = {k: dict(v) for k, v in DEFAUT.items()}
        cfg["veilleuse"]["lampes"] = []
        cfg["coucher"]["sauf"] = []
        cfg["coucher"]["jours"] = [0, 1, 2, 3, 4, 5, 6]
        if isinstance(brut, dict):
            for section, valeurs in brut.items():
                if section in cfg and isinstance(valeurs, dict):
                    cfg[section].update(valeurs)
        return cfg

    async def async_etat(self) -> dict[str, Any]:
        return {
            "config": self.cfg or await self.async_config(),
            "en_cours": sorted(self._minuteurs),
            "journal": list(self.journal),
        }

    async def async_enregistrer(self, patch: dict[str, Any]) -> dict[str, Any]:
        cfg = await self.async_config()
        for section, valeurs in (patch or {}).items():
            if section in cfg and isinstance(valeurs, dict):
                cfg[section].update(valeurs)
        await self.store.async_set_shared(CLE, cfg)
        self.cfg = cfg
        # L'heure du coucher fait partie du rendez-vous : la changer oblige a
        # le reposer, sinon l'ancienne resterait armee jusqu'au redemarrage.
        await self._async_reabonner()
        return cfg

    @callback
    def async_arreter(self) -> None:
        for haid in list(self._minuteurs):
            self._desarmer(haid)
        for source in (self._defait, self._defait_heure):
            for defaire in source:
                try:
                    defaire()
                except Exception:  # noqa: BLE001
                    _LOGGER.debug("Loggia nuit : desabonnement sans effet")
            source.clear()
