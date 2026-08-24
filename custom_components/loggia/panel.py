"""Frontend embarque : fichiers statiques et panneau lateral.

Le dashboard est servi par Home Assistant lui-meme, sous la meme origine que
l'interface. C'est ce qui permet au frontend de lire l'objet `hass` du document
parent — le meme modele que l'iframe posee a la main, sans les etapes manuelles.
"""
from __future__ import annotations

import logging
from pathlib import Path

from homeassistant.components import frontend
from homeassistant.core import HomeAssistant

_LOGGER = logging.getLogger(__name__)

# Prefixe des fichiers du frontend. Volontairement different de tout nom de
# dashboard plausible : un chemin statique capture TOUT ce qui commence par lui.
# Nomme « /loggia-dashboard », il avalait le dashboard Lovelace du meme nom, qui
# repondait alors 403 en navigation directe et ne se rechargeait plus (F5).
URL_BASE = "/loggia-static"
# Adresse du panneau dans la barre laterale.
#
# Home Assistant retient la page d'accueil de chaque compte sous cette forme
# (`core.default_panel`), et son selecteur ne propose que les dashboards
# Lovelace : un panneau ne s'y choisit pas. Le reglage se fait donc depuis
# Loggia — Parametres puis Apparence —, ce qui laisse l'adresse libre d'etre
# simplement le nom du projet.
PANEL_PATH = "loggia"
PANEL_TITLE = "Loggia"
PANEL_ICON = "mdi:view-dashboard-variant"


async def _async_serve_files(hass: HomeAssistant, root: Path) -> None:
    """Expose `frontend/` sous URL_BASE.

    `async_register_static_paths` est l'API depuis Home Assistant 2024.7 ;
    l'ancienne `register_static_path` reste en repli pour les versions
    anterieures, ou la nouvelle n'existe pas.
    """
    try:
        from homeassistant.components.http import StaticPathConfig

        await hass.http.async_register_static_paths(
            [StaticPathConfig(URL_BASE, str(root), cache_headers=False)]
        )
    except ImportError:
        hass.http.register_static_path(URL_BASE, str(root), cache_headers=False)


def _horodatage(chemin: Path) -> int | None:
    """Date de derniere ecriture du fichier, ou None s'il n'existe pas.

    Sert de jeton anti-cache : la version du manifeste ne change qu'aux
    publications, alors qu'un frontend reconstruit doit etre re-telecharge tout
    de suite. Sans cela, un appareil garde l'ancien `index.html` — et donc
    l'ancien code — jusqu'a ce que son cache expire de lui-meme.
    """
    try:
        return int(chemin.stat().st_mtime)
    except OSError:
        return None


async def async_register_panel(hass: HomeAssistant, version: str) -> None:
    """Sert le dashboard et l'ajoute au menu lateral."""
    root = Path(__file__).parent / "frontend"
    # `stat()` est synchrone : dans la boucle asyncio, Home Assistant le
    # signalerait comme appel bloquant.
    empreinte = await hass.async_add_executor_job(_horodatage, root / "index.html")
    if empreinte is None:
        _LOGGER.warning("Loggia : frontend absent de %s — panneau non enregistre", root)
        return

    await _async_serve_files(hass, root)

    if PANEL_PATH in hass.data.get("frontend_panels", {}):
        return

    # `?v=` porte la version ET la date du build : sans le second, deux
    # frontends differents de meme version partageraient la meme URL, et
    # l'appareil garderait le premier.
    jeton = f"{version}.{empreinte}"
    # Panneau CUSTOM et non « iframe » : le type natif impose sa barre d'outils
    # en haut de l'ecran. Notre element occupe toute la zone de contenu et n'y
    # dessine qu'un cadre — sans kiosk-mode pour masquer l'entete ni card-mod
    # pour etirer la carte, dont le chargement n'est pas garanti a temps.
    frontend.async_register_built_in_panel(
        hass,
        "custom",
        PANEL_TITLE,
        PANEL_ICON,
        frontend_url_path=PANEL_PATH,
        config={
            "_panel_custom": {
                "name": "loggia-panel",
                "module_url": f"{URL_BASE}/panel.js?v={jeton}",
                "embed_iframe": False,
                "trust_external": False,
            },
            "url": f"{URL_BASE}/index.html?v={jeton}",
        },
        require_admin=False,
    )
    _LOGGER.info("Loggia : panneau disponible sur /%s", PANEL_PATH)


def async_remove_panel(hass: HomeAssistant) -> None:
    """Retire le panneau du menu lateral."""
    if PANEL_PATH in hass.data.get("frontend_panels", {}):
        frontend.async_remove_panel(hass, PANEL_PATH)
