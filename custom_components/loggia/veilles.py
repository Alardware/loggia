"""Trois veilles : l'air, les piles, le tarif.

Pourquoi ce module existe
─────────────────────────
Trois surveillances de meme forme — une valeur, un seuil, une alerte — que
chaque installation reecrit separement.

  Le CO2. Au-dela de 1000 a 1200 ppm on dort mal et on pense moins bien.
  Personne ne consulte un capteur de CO2 ; il faut qu'il vienne le dire.

  Les piles. Un detecteur d'ouverture a plat ne previent pas qu'il est a plat :
  il se tait, et on croit la porte fermee. C'est la panne la plus silencieuse
  d'une installation domotique.

  Les heures creuses. Le lave-vaisselle attend souvent qu'on y pense.

Le service de notification n'est PAS redemande : c'est celui deja choisi dans
Parametres > Alertes. Faire choisir son telephone deux fois serait une facon
de dire qu'on n'a pas regarde ce qui existait.

Ne pas crier deux fois
──────────────────────
Une alerte qui se repete toutes les trente secondes est pire que pas d'alerte :
on l'apprend par coeur et on cesse de la lire. Chaque veille note ce qu'elle a
signale et se tait jusqu'a ce que la valeur redevienne franchement bonne — pas
seulement bonne d'un cheveu, sinon un capteur qui oscille autour du seuil
sonnerait toute la journee.
"""
from __future__ import annotations

import logging
import time
from typing import TYPE_CHECKING, Any

from homeassistant.core import HomeAssistant, callback

if TYPE_CHECKING:  # l'annotation seule — les tests chargent ce module hors paquet
    from .store import LoggiaStore

_LOGGER = logging.getLogger(__name__)

CLE = "loggia_veilles"
CLE_ALERTES = "loggia_alertes"

MUETS = {"unavailable", "unknown", "none", ""}

# La marge de retour au calme, en proportion du seuil. Un capteur de CO2
# oscille de quelques dizaines de ppm : sans elle, il sonnerait a chaque
# souffle.
HYSTERESE = 0.90

DEFAUT: dict[str, Any] = {
    "co2": {"actif": False, "seuil": 1200, "capteurs": [], "ventilation": []},
    "batterie": {"actif": False, "seuil": 15},
    "creuses": {"actif": False, "entite": "", "valeur": "", "prises": []},
}


def nombre(etat):
    """La valeur d'un capteur, ou None si elle ne veut rien dire."""
    if etat is None:
        return None
    brut = str(getattr(etat, "state", "")).lower()
    if brut in MUETS:
        return None
    try:
        return float(brut)
    except (TypeError, ValueError):
        return None


def capteurs_de(etats: dict, classe: str) -> list:
    """Les entites d'une `device_class` donnee, quel que soit leur nom.

    On ne devine pas au nom de l'entite : Home Assistant dit lui-meme ce
    qu'elle mesure.
    """
    trouves = []
    for haid, st in (etats or {}).items():
        attrs = getattr(st, "attributes", None) or {}
        if attrs.get("device_class") == classe:
            trouves.append(haid)
    return sorted(trouves)


def au_dessus(valeur, seuil, deja_signale: bool) -> bool:
    """Faut-il signaler ? Avec la marge de retour au calme."""
    if valeur is None:
        return False
    try:
        seuil = float(seuil)
    except (TypeError, ValueError):
        return False
    if deja_signale:
        # On ne se tait qu'une fois franchement redescendu.
        return valeur > seuil * HYSTERESE
    return valeur > seuil


def en_dessous(valeur, seuil, deja_signale: bool) -> bool:
    """Le pendant, pour ce qui se vide : une pile, une reserve."""
    if valeur is None:
        return False
    try:
        seuil = float(seuil)
    except (TypeError, ValueError):
        return False
    if deja_signale:
        # Une pile ne remonte pas toute seule : il faut un vrai changement.
        return valeur < seuil / HYSTERESE
    return valeur < seuil


class LoggiaVeilles:
    """Surveille l'air, les piles et le tarif, et le dit une seule fois."""

    def __init__(self, hass: HomeAssistant, store: "LoggiaStore") -> None:
        self.hass = hass
        self.store = store
        self.cfg: dict[str, Any] = {}
        # Ce qui a deja ete signale, pour ne pas le redire.
        self.signales: set = set()
        self.creuses_en_cours = False
        self.journal: list[dict[str, Any]] = []
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
                _LOGGER.debug("Loggia veilles : abonnement deja retire")
        self._defait.clear()

        from homeassistant.helpers.event import (async_track_state_change_event,
                                                 async_track_time_interval)

        suivis = []
        co2 = self.cfg.get("co2") or {}
        if co2.get("actif"):
            suivis.extend(co2.get("capteurs") or self._capteurs_co2())
        creuses = self.cfg.get("creuses") or {}
        if creuses.get("actif") and creuses.get("entite"):
            suivis.append(creuses["entite"])
        if suivis:
            self._defait.append(
                async_track_state_change_event(self.hass, sorted(set(suivis)), self._sur_etat)
            )

        # Les piles ne se surveillent pas a l'evenement : elles changent
        # lentement, et une entite qui tombe a 14 % ne merite pas qu'on ecoute
        # toute l'installation. Un passage par heure suffit.
        if (self.cfg.get("batterie") or {}).get("actif"):
            from datetime import timedelta

            self._defait.append(
                async_track_time_interval(self.hass, self._sur_heure, timedelta(hours=1))
            )
        _LOGGER.info("Loggia veilles : %d entites suivies", len(set(suivis)))

    def _tous_les_etats(self) -> dict:
        try:
            ids = list(self.hass.states.async_entity_ids("sensor"))
            ids += list(self.hass.states.async_entity_ids("binary_sensor"))
        except Exception:  # noqa: BLE001
            return {}
        return {i: self.hass.states.get(i) for i in ids}

    def _capteurs_co2(self) -> list:
        return capteurs_de(self._tous_les_etats(), "carbon_dioxide")

    @callback
    def _sur_etat(self, _event) -> None:
        self.hass.async_create_task(self._async_evaluer())

    @callback
    def _sur_heure(self, _now) -> None:
        self.hass.async_create_task(self._async_batteries())

    async def _async_evaluer(self) -> None:
        await self._async_co2()
        await self._async_creuses()

    # ── L'air ──────────────────────────────────────────────────────────────
    async def _async_co2(self) -> None:
        c = self.cfg.get("co2") or {}
        if not c.get("actif"):
            return
        etats = self._tous_les_etats()
        cibles = c.get("capteurs") or capteurs_de(etats, "carbon_dioxide")
        for haid in cibles:
            valeur = nombre(etats.get(haid))
            cle = "co2:" + haid
            deja = cle in self.signales
            if au_dessus(valeur, c.get("seuil", 1200), deja):
                if not deja:
                    self.signales.add(cle)
                    await self._async_prevenir(
                        "%s : %d ppm, il faut aerer" % (self._nom(haid, etats), int(valeur)))
                    ventilation = c.get("ventilation") or []
                    if ventilation:
                        await self._async_service("homeassistant", "turn_on", ventilation)
                    self._noter("co2", haid, valeur)
            elif deja:
                self.signales.discard(cle)

    # ── Les piles ──────────────────────────────────────────────────────────
    async def _async_batteries(self) -> None:
        b = self.cfg.get("batterie") or {}
        if not b.get("actif"):
            return
        etats = self._tous_les_etats()
        for haid in capteurs_de(etats, "battery"):
            valeur = nombre(etats.get(haid))
            cle = "bat:" + haid
            deja = cle in self.signales
            if en_dessous(valeur, b.get("seuil", 15), deja):
                if not deja:
                    self.signales.add(cle)
                    await self._async_prevenir(
                        "%s : pile a %d %%" % (self._nom(haid, etats), int(valeur)))
                    self._noter("batterie", haid, valeur)
            elif deja:
                # Pile changee : on redevient capable de prevenir.
                self.signales.discard(cle)

    # ── Le tarif ───────────────────────────────────────────────────────────
    async def _async_creuses(self) -> None:
        c = self.cfg.get("creuses") or {}
        if not c.get("actif") or not c.get("entite"):
            return
        st = self.hass.states.get(c["entite"])
        if st is None:
            return
        valeur = str(getattr(st, "state", "")).strip().lower()
        attendu = str(c.get("valeur") or "").strip().lower()
        if not attendu:
            return
        dedans = valeur == attendu
        if dedans and not self.creuses_en_cours:
            self.creuses_en_cours = True
            await self._async_prevenir("Heures creuses : c'est le moment de lancer les machines")
            prises = c.get("prises") or []
            if prises:
                await self._async_service("homeassistant", "turn_on", prises)
            self._noter("creuses", c["entite"], None)
        elif not dedans:
            self.creuses_en_cours = False

    # ── Outils ─────────────────────────────────────────────────────────────
    def _nom(self, haid: str, etats: dict) -> str:
        st = etats.get(haid) or self.hass.states.get(haid)
        attrs = getattr(st, "attributes", None) or {}
        return str(attrs.get("friendly_name") or haid)

    async def _async_prevenir(self, message: str) -> None:
        """Passe par le service notify deja choisi dans Parametres > Alertes."""
        cfg = await self.store.async_get_shared(CLE_ALERTES, None)
        service = str((cfg or {}).get("service") or "").strip()
        if not service:
            _LOGGER.debug("Loggia veilles : aucun service de notification choisi")
            return
        try:
            if not self.hass.services.has_service("notify", service):
                _LOGGER.warning("Loggia veilles : notify.%s n'existe pas", service)
                return
            await self.hass.services.async_call(
                "notify", service, {"title": "Loggia", "message": message}, blocking=False)
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Loggia veilles : notification impossible")

    async def _async_service(self, domaine: str, service: str, cibles: list) -> None:
        try:
            await self.hass.services.async_call(
                domaine, service, {"entity_id": cibles}, blocking=False)
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Loggia veilles : %s.%s a echoue", domaine, service)

    def _noter(self, quoi: str, entite: str, valeur) -> None:
        self.journal.insert(0, {"quoi": quoi, "entite": entite, "valeur": valeur,
                                "ts": time.time()})
        del self.journal[30:]

    # ── Ce que l'interface lit et ecrit ────────────────────────────────────
    async def async_config(self) -> dict[str, Any]:
        brut = await self.store.async_get_shared(CLE, None)
        cfg = {k: dict(v) for k, v in DEFAUT.items()}
        cfg["co2"]["capteurs"] = []
        cfg["co2"]["ventilation"] = []
        cfg["creuses"]["prises"] = []
        if isinstance(brut, dict):
            for section, valeurs in brut.items():
                if section in cfg and isinstance(valeurs, dict):
                    cfg[section].update(valeurs)
        return cfg

    async def async_etat(self) -> dict[str, Any]:
        etats = self._tous_les_etats()
        alertes = await self.store.async_get_shared(CLE_ALERTES, None)
        return {
            "config": self.cfg or await self.async_config(),
            # Ce que la decouverte propose, pour que l'interface n'ait rien a deviner.
            "capteurs_co2": capteurs_de(etats, "carbon_dioxide"),
            "capteurs_batterie": capteurs_de(etats, "battery"),
            # Sans service de notification, ces veilles n'ont personne a qui parler.
            "notification": bool(str((alertes or {}).get("service") or "").strip()),
            "signales": sorted(self.signales),
            "journal": list(self.journal),
        }

    async def async_enregistrer(self, patch: dict[str, Any]) -> dict[str, Any]:
        cfg = await self.async_config()
        for section, valeurs in (patch or {}).items():
            if section in cfg and isinstance(valeurs, dict):
                cfg[section].update(valeurs)
        await self.store.async_set_shared(CLE, cfg)
        self.cfg = cfg
        await self._async_reabonner()
        return cfg

    @callback
    def async_arreter(self) -> None:
        for defaire in self._defait:
            try:
                defaire()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia veilles : desabonnement sans effet")
        self._defait.clear()
