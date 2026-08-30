"""Alertes de surete poussees sur telephone.

Le dashboard peut etre ferme, l'onglet endormi : c'est donc le COMPOSANT qui
ecoute les changements d'etat et appelle notify.*. La configuration vit dans la
partie commune du store (cle `loggia_alertes`), ecrite par un administrateur
depuis Parametres ; sans configuration, ou sans service choisi, rien ne part —
fail-safe.

Forme de la configuration :
  {
    "actif": true,
    "service": "mobile_app_iphone",          # le service notify, sans prefixe
    "categories": {"fumee": true, "gaz": true, "co": true, "fuite": true,
                    "alarme": true, "portes": false},
    "cooldown_min": 5
  }

Les categories sont reconnues par device_class, jamais par identifiant : le
composant reste installable chez n'importe qui.
"""
from __future__ import annotations

import logging
import time
from typing import Any

from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.util import dt as dt_util

from .store import LoggiaStore

_LOGGER = logging.getLogger(__name__)

CLE_CONFIG = "loggia_alertes"

# device_class -> (categorie, message)
BINAIRES: dict[str, tuple[str, str]] = {
    "smoke": ("fumee", "Fumée détectée"),
    "gas": ("gaz", "Gaz détecté"),
    "carbon_monoxide": ("co", "Monoxyde de carbone détecté"),
    "moisture": ("fuite", "Fuite d'eau détectée"),
    "safety": ("fumee", "Alerte de sûreté"),
}
PORTES = ("door", "window", "garage_door", "opening")
ARMEE = ("armed_away", "armed_home", "armed_night", "armed_vacation")


class LoggiaAlertes:
    """Ecoute les etats et pousse les alertes de surete configurees."""

    def __init__(self, hass: HomeAssistant, store: LoggiaStore) -> None:
        self._hass = hass
        self._store = store
        # Anti-rafale : un capteur qui bat (fuite au bord du seuil) ne doit pas
        # mitrailler le telephone. L'alarme declenchee passe toujours.
        self._dernier: dict[str, float] = {}
        hass.bus.async_listen("state_changed", self._on_state)
        _LOGGER.info("Loggia : alertes de sûreté à l'écoute")

    @callback
    def _on_state(self, event: Event) -> None:
        new = event.data.get("new_state")
        old = event.data.get("old_state")
        if new is None or old is None:
            return  # apparition/disparition d'entite : pas un evenement de surete
        if new.state in ("unknown", "unavailable") or new.state == old.state:
            return
        domaine = new.entity_id.split(".")[0]
        if domaine == "binary_sensor" and new.state == "on":
            dc = new.attributes.get("device_class")
            if dc in BINAIRES:
                cat, msg = BINAIRES[dc]
                self._hass.async_create_task(self._envoyer(new, cat, msg))
            elif dc in PORTES:
                self._hass.async_create_task(self._porte_ouverte(new))
        elif domaine == "alarm_control_panel" and new.state == "triggered":
            self._hass.async_create_task(self._envoyer(new, "alarme", "Alarme déclenchée", urgent=True))

    async def _porte_ouverte(self, etat: Any) -> None:
        """Une ouverture n'alerte que si une alarme est armee — sinon c'est la vie."""
        armee = any(
            s.state in ARMEE
            for s in self._hass.states.async_all("alarm_control_panel")
        )
        if armee:
            await self._envoyer(etat, "portes", "Ouverture pendant que l'alarme est armée")

    async def _envoyer(self, etat: Any, categorie: str, message: str, urgent: bool = False) -> None:
        cfg = await self._store.async_get_shared(CLE_CONFIG)
        if not isinstance(cfg, dict) or not cfg.get("actif"):
            return
        service = str(cfg.get("service") or "").strip()
        if not service or not self._hass.services.has_service("notify", service):
            return
        cats = cfg.get("categories") or {}
        if not cats.get(categorie):
            return
        if not urgent:
            try:
                minutes = max(1, int(cfg.get("cooldown_min", 5)))
            except (TypeError, ValueError):
                minutes = 5
            maintenant = time.monotonic()
            precedent = self._dernier.get(etat.entity_id, 0.0)
            if maintenant - precedent < minutes * 60:
                return
            self._dernier[etat.entity_id] = maintenant
        nom = etat.attributes.get("friendly_name") or etat.entity_id
        try:
            await self._hass.services.async_call(
                "notify",
                service,
                {"title": "Loggia — sûreté", "message": f"{message} : {nom}"},
                blocking=False,
            )
            _LOGGER.info("Loggia : alerte %s envoyée pour %s", categorie, etat.entity_id)
            await self._journaliser(categorie, etat.entity_id, nom, message)
        except Exception:  # noqa: BLE001 — une alerte qui echoue ne doit rien casser d'autre
            _LOGGER.exception("Loggia : échec d'envoi de l'alerte %s", categorie)

    async def _journaliser(self, categorie: str, entity_id: str, nom: str, message: str) -> None:
        """Les vingt derniers envois, gardes avec la configuration commune —
        l'ecran Parametres -> Alertes les montre sans commande supplementaire."""
        try:
            journal = await self._store.async_get_shared("loggia_alertes_journal", [])
            if not isinstance(journal, list):
                journal = []
            journal.insert(0, {
                "quand": dt_util.utcnow().isoformat(timespec="seconds"),
                "categorie": categorie,
                "entite": entity_id,
                "nom": nom,
                "message": message,
            })
            await self._store.async_set_shared("loggia_alertes_journal", journal[:20])
        except Exception:  # noqa: BLE001 — le journal est un confort, jamais un blocage
            _LOGGER.exception("Loggia : journal des alertes indisponible")
