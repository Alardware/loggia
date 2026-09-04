"""Depart et retour : la maison se met en veille quand elle se vide.

Pourquoi ce module existe
─────────────────────────
Partir en laissant les lumieres allumees et le chauffage a 21 degres est
l'oubli le plus courant de la domotique, et celui qui coute le plus cher. Home
Assistant sait qui est parti — il ne fait rien de cette information tant qu'on
ne l'a pas ecrit.

Ce qui se passe
───────────────
La derniere personne suivie quitte la maison. On attend le delai regle (cinq
minutes par defaut : un telephone qui accroche une autre antenne ne doit pas
vider la maison), puis on eteint les lumieres, on baisse le chauffage et on
arme l'alarme — chacun de ces trois gestes etant debrayable. Quelqu'un rentre :
on rend ce qu'on a pris.

Trois precautions
─────────────────
  On ne rend que ce qu'on a pris. Les lumieres eteintes par la regle sont
  notees ; celles qui l'etaient deja ne se rallument pas au retour.

  On ne rallume pas en plein jour. Rentrer a quinze heures ne doit pas
  rallumer le salon. `sun.sun` tranche, et ce garde-fou se desactive.

  Le desarmement au retour est FERME par defaut, et il le reste tant que
  personne ne l'ouvre. Armer une alarme parce que la maison se vide est sans
  risque ; la desarmer parce qu'un telephone approche en est un, et ce choix
  doit etre fait en connaissance de cause.
"""
from __future__ import annotations

import logging
import time
from typing import TYPE_CHECKING, Any

from homeassistant.core import HomeAssistant, callback

if TYPE_CHECKING:  # l'annotation seule — les tests chargent ce module hors paquet
    from .store import LoggiaStore

_LOGGER = logging.getLogger(__name__)

CLE = "loggia_presence"
SOLEIL = "sun.sun"

# Un capteur muet ne prouve pas une absence : un telephone eteint n'est pas
# une maison vide.
MUETS = {"unavailable", "unknown", "none", ""}

DEFAUT: dict[str, Any] = {
    "actif": False,
    "delai_depart": 5,
    "personnes": [],
    "depart": {"lumieres": True,
               "chauffage": {"actif": False, "consigne": 17, "confort": 20},
               "alarme": {"actif": False, "entite": "", "mode": "away"}},
    "retour": {"lumieres": False, "seulement_la_nuit": True,
               "chauffage": True, "desarmer": False},
}

MODES_ALARME = {"away": "alarm_arm_away", "home": "alarm_arm_home",
                "night": "alarm_arm_night", "vacation": "alarm_arm_vacation"}


def tous_absents(etats: dict, personnes) -> bool:
    """La maison est-elle vide ?

    Il faut au moins une personne SUIVIE et joignable pour l'affirmer : sans
    cela, une installation sans suivi de presence — ou dont tous les
    telephones sont muets — se croirait vide en permanence et s'eteindrait
    toute seule.
    """
    vus = 0
    for haid in personnes or []:
        st = etats.get(haid)
        if st is None:
            continue
        valeur = str(getattr(st, "state", "")).lower()
        if valeur in MUETS:
            continue
        vus += 1
        if valeur == "home":
            return False
    return vus > 0


def fait_nuit(etat_soleil) -> bool:
    """Le soleil est-il couche ? Sans `sun.sun`, on suppose qu'il fait jour.

    Se tromper vers le jour ne fait qu'omettre un rallumage ; se tromper vers
    la nuit rallumerait la maison en plein apres-midi.
    """
    if etat_soleil is None:
        return False
    return str(getattr(etat_soleil, "state", "")).lower() == "below_horizon"


class LoggiaPresence:
    """Met la maison en veille quand elle se vide, et la reveille au retour."""

    def __init__(self, hass: HomeAssistant, store: "LoggiaStore") -> None:
        self.hass = hass
        self.store = store
        self.cfg: dict[str, Any] = {}
        # Ce qu'on a eteint en partant : {entite: etat d'avant}. En memoire
        # seule — apres un redemarrage, Loggia ne pretend pas savoir.
        self.eteintes: dict[str, str] = {}
        self.dehors = False
        self.journal: list[dict[str, Any]] = []
        self._minuteur = None
        self._defait: list[Any] = []
        hass.async_create_task(self._async_demarrer())

    async def _async_demarrer(self) -> None:
        self.cfg = await self.async_config()
        await self._async_reabonner()

    async def _async_reabonner(self) -> None:
        for defaire in self._defait:
            try:
                defaire()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia presence : abonnement deja retire")
        self._defait.clear()
        if not self.cfg.get("actif"):
            return
        suivis = list(self.cfg.get("personnes") or [])
        if not suivis:
            return
        from homeassistant.helpers.event import async_track_state_change_event

        self._defait.append(
            async_track_state_change_event(self.hass, suivis, self._sur_personne)
        )
        _LOGGER.info("Loggia presence : %d personnes suivies", len(suivis))

    @callback
    def _sur_personne(self, _event) -> None:
        self.hass.async_create_task(self._async_evaluer())

    async def _async_evaluer(self) -> None:
        if not self.cfg.get("actif"):
            return
        vide = tous_absents(self._etats(), self.cfg.get("personnes"))
        if vide and not self.dehors:
            await self._async_armer_depart()
        elif not vide:
            self._desarmer()
            if self.dehors:
                self.dehors = False
                await self._async_retour()

    async def _async_armer_depart(self) -> None:
        """Le delai avant de vider la maison.

        Un telephone qui accroche une autre antenne se declare absent quelques
        secondes ; sans ce delai, la maison s'eteindrait sous le nez de qui
        vient de rentrer.
        """
        if self._minuteur is not None:
            return
        try:
            delai = max(0, int(self.cfg.get("delai_depart", 5))) * 60
        except (TypeError, ValueError):
            delai = 300
        if delai == 0:
            await self._async_depart()
            return
        from homeassistant.helpers.event import async_call_later

        @callback
        def echu(_now):
            self._minuteur = None
            self.hass.async_create_task(self._async_depart())

        self._minuteur = async_call_later(self.hass, delai, echu)

    def _desarmer(self) -> None:
        annule, self._minuteur = self._minuteur, None
        if annule:
            try:
                annule()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia presence : minuteur deja passe")

    # ── Le depart ──────────────────────────────────────────────────────────
    async def _async_depart(self) -> None:
        etats = self._etats()
        # Quelqu'un a pu rentrer pendant le decompte.
        if not tous_absents(etats, self.cfg.get("personnes")):
            return
        self.dehors = True
        d = self.cfg.get("depart") or {}
        fait = []

        if d.get("lumieres"):
            allumees = self._allumees()
            if allumees:
                self.eteintes = {haid: "on" for haid in allumees}
                await self._async_service("light", "turn_off", allumees)
                fait.append("%d lumieres" % len(allumees))

        chauffage = d.get("chauffage") or {}
        if chauffage.get("actif"):
            cibles = self._climats()
            if cibles:
                try:
                    consigne = float(chauffage.get("consigne", 17))
                except (TypeError, ValueError):
                    consigne = 17.0
                await self._async_service("climate", "set_temperature", cibles,
                                          {"temperature": consigne})
                fait.append("chauffage a %g" % consigne)

        alarme = d.get("alarme") or {}
        if alarme.get("actif") and alarme.get("entite"):
            service = MODES_ALARME.get(str(alarme.get("mode") or "away"), "alarm_arm_away")
            await self._async_service("alarm_control_panel", service, [alarme["entite"]])
            fait.append("alarme armee")

        if fait:
            self._noter("depart", fait)

    def _allumees(self) -> list:
        """Les lumieres allumees en ce moment."""
        try:
            ids = self.hass.states.async_entity_ids("light")
        except Exception:  # noqa: BLE001
            return []
        return [i for i in sorted(ids)
                if str(getattr(self.hass.states.get(i), "state", "")).lower() == "on"]

    def _climats(self) -> list:
        try:
            return sorted(self.hass.states.async_entity_ids("climate"))
        except Exception:  # noqa: BLE001
            return []

    # ── Le retour ──────────────────────────────────────────────────────────
    async def _async_retour(self) -> None:
        r = self.cfg.get("retour") or {}
        fait = []

        if r.get("lumieres") and self.eteintes:
            # On ne rallume pas en plein jour : rentrer a quinze heures ne doit
            # pas rallumer le salon.
            if r.get("seulement_la_nuit", True) and not fait_nuit(self.hass.states.get(SOLEIL)):
                self.eteintes = {}
            else:
                etats = self._etats(list(self.eteintes))
                # On ne rend que ce qu'on a pris : une lampe rallumee entre
                # temps par quelqu'un d'autre n'est pas notre affaire.
                a_rendre = [h for h in sorted(self.eteintes)
                            if str(getattr(etats.get(h), "state", "")).lower() == "off"]
                if a_rendre:
                    await self._async_service("light", "turn_on", a_rendre)
                    fait.append("%d lumieres" % len(a_rendre))
                self.eteintes = {}

        if r.get("chauffage"):
            cibles = self._climats()
            confort = ((self.cfg.get("depart") or {}).get("chauffage") or {}).get("confort")
            if cibles and confort not in (None, ""):
                try:
                    valeur = float(confort)
                except (TypeError, ValueError):
                    valeur = None
                if valeur is not None:
                    await self._async_service("climate", "set_temperature", cibles,
                                              {"temperature": valeur})
                    fait.append("chauffage a %g" % valeur)

        alarme = (self.cfg.get("depart") or {}).get("alarme") or {}
        if r.get("desarmer") and alarme.get("entite"):
            await self._async_service("alarm_control_panel", "alarm_disarm", [alarme["entite"]])
            fait.append("alarme desarmee")

        if fait:
            self._noter("retour", fait)

    # ── Outils ─────────────────────────────────────────────────────────────
    def _etats(self, ids=None) -> dict:
        if ids is None:
            ids = list(self.cfg.get("personnes") or [])
        return {haid: self.hass.states.get(haid) for haid in ids}

    async def _async_service(self, domaine: str, service: str, cibles: list, extra=None) -> None:
        data = {"entity_id": cibles}
        if extra:
            data.update(extra)
        try:
            await self.hass.services.async_call(domaine, service, data, blocking=False)
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Loggia presence : %s.%s a echoue", domaine, service)

    def _noter(self, quoi: str, detail: list) -> None:
        self.journal.insert(0, {"quoi": quoi, "detail": list(detail), "ts": time.time()})
        del self.journal[30:]

    # ── Ce que l'interface lit et ecrit ────────────────────────────────────
    async def async_config(self) -> dict[str, Any]:
        brut = await self.store.async_get_shared(CLE, None)
        cfg = {}
        for k, v in DEFAUT.items():
            if isinstance(v, dict):
                cfg[k] = {kk: (dict(vv) if isinstance(vv, dict) else vv) for kk, vv in v.items()}
            elif isinstance(v, list):
                cfg[k] = list(v)
            else:
                cfg[k] = v
        if isinstance(brut, dict):
            for k, v in brut.items():
                if k not in cfg:
                    continue
                if isinstance(cfg[k], dict) and isinstance(v, dict):
                    for kk, vv in v.items():
                        if isinstance(cfg[k].get(kk), dict) and isinstance(vv, dict):
                            cfg[k][kk].update(vv)
                        else:
                            cfg[k][kk] = vv
                else:
                    cfg[k] = v
        return cfg

    async def async_etat(self) -> dict[str, Any]:
        return {
            "config": self.cfg or await self.async_config(),
            "dehors": self.dehors,
            "en_attente": self._minuteur is not None,
            "eteintes": sorted(self.eteintes),
            "journal": list(self.journal),
        }

    async def async_enregistrer(self, patch: dict[str, Any]) -> dict[str, Any]:
        cfg = await self.async_config()
        for k, v in (patch or {}).items():
            if k not in cfg:
                continue
            if isinstance(cfg[k], dict) and isinstance(v, dict):
                for kk, vv in v.items():
                    if isinstance(cfg[k].get(kk), dict) and isinstance(vv, dict):
                        cfg[k][kk].update(vv)
                    else:
                        cfg[k][kk] = vv
            else:
                cfg[k] = v
        await self.store.async_set_shared(CLE, cfg)
        self.cfg = cfg
        await self._async_reabonner()
        return cfg

    @callback
    def async_arreter(self) -> None:
        self._desarmer()
        for defaire in self._defait:
            try:
                defaire()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia presence : desabonnement sans effet")
        self._defait.clear()
