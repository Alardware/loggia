"""Loggia Dashboard API — proxy de services HA avec allow-list cote serveur.

Expose une API HTTP authentifiee (auth Home Assistant standard) que le frontend
Loggia utilise a la place d'appels /api/services/* directs. Seuls les services
de l'allow-list ci-dessous sont executes ; tout le reste est refuse (fail-closed).

Sert aussi le dashboard lui-meme : le frontend construit est embarque dans
`frontend/` et expose par un panneau iframe. Rien a copier dans www/, aucun
dashboard YAML a ecrire.

Installation :
  - par HACS, puis Parametres -> Appareils et services -> Ajouter -> Loggia
  - ou a la main : copier ce dossier dans config/custom_components/loggia/,
    puis ajouter `loggia:` dans configuration.yaml (mode historique)
"""
from __future__ import annotations

import logging

from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv
from homeassistant.config_entries import ConfigEntry
from homeassistant.helpers.typing import ConfigType

from .panel import async_register_panel, async_remove_panel

_LOGGER = logging.getLogger(__name__)

from .const import DOMAIN, VERSION  # noqa: F401  (reexportes pour les modules du composant)
CONFIG_SCHEMA = cv.empty_config_schema(DOMAIN)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Mode historique : `loggia:` dans configuration.yaml."""
    if DOMAIN in config:
        await _async_setup_common(hass)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Mode normal : entree creee depuis l'interface (ou posee par HACS)."""
    await _async_setup_common(hass)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Retire le panneau.

    Les vues HTTP et les commandes WebSocket ne se desenregistrent pas : elles
    vivent jusqu'a l'arret du process. On ne touche donc PAS au drapeau qui les
    protege — sinon le chargement suivant (bouton « Recharger » de l'interface,
    action courante) retenterait `register_view` sur des routes deja prises.
    Seul le panneau, qui se reenregistre proprement, est remis a zero.
    """
    async_remove_panel(hass)
    hass.data.get(DOMAIN, {}).pop("panel", None)
    return True


async def _async_setup_common(hass: HomeAssistant) -> None:
    """Mise en place, quel que soit le mode d'installation.

    Idempotente : les deux modes peuvent coexister le temps d'une migration
    depuis l'installation manuelle, sans enregistrer deux fois les memes vues.
    """
    data = hass.data.setdefault(DOMAIN, {})

    # ── Ce qui vit jusqu'a l'arret du process : enregistre une seule fois ──
    # Ni les vues HTTP ni les commandes WebSocket ne savent se desenregistrer.
    # Les reenregistrer ferait au mieux un doublon, au pire lever une exception
    # qui ferait echouer tout le rechargement.
    if not data.get("http"):
        data["http"] = True
        hass.http.register_view(LoggiaPingView())
        _LOGGER.info("Loggia %s : /api/loggia/ping enregistre", VERSION)

    # Configuration par utilisateur (remplace le localStorage du navigateur).
    # Import local et try/except : si ce bloc echoue, le proxy de services doit
    # continuer a fonctionner — il tourne depuis juin et ne doit pas dependre
    # d'une fonctionnalite ajoutee apres coup.
    if not data.get("ws"):
        try:
            from .store import LoggiaStore
            from .websocket_api import async_register as async_register_ws

            store = LoggiaStore(hass)
            data["store"] = store
            async_register_ws(hass, store)
            data["ws"] = True
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Loggia : configuration utilisateur indisponible")

    # ── Ce qui se refait a chaque chargement : le panneau ──
    # Il se retire proprement dans `async_unload_entry`, donc il se reenregistre
    # sans risque. Un dashboard qui ne se sert pas ne doit pas empecher le proxy
    # et la configuration de fonctionner.
    if not data.get("panel"):
        try:
            await async_register_panel(hass, VERSION)
            data["panel"] = True
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Loggia : panneau indisponible")


class LoggiaPingView(HomeAssistantView):
    """GET /api/loggia/ping — verification d'installation (auth requise)."""

    url = "/api/loggia/ping"
    name = "api:loggia:ping"

    async def get(self, request):
        return self.json({"loggia": True, "version": VERSION})
