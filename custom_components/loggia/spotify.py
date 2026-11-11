"""Spotify : lancer une playlist sur une enceinte, en un geste (ADR 0344).

L'integration officielle Spotify ne joue que sur l'appareil Spotify Connect
ACTIF ; sans appareil choisi, elle prend le premier de sa liste — souvent le
navigateur de l'ordinateur. Il faut donc deux gestes, dans cet ordre :
`media_player.select_source` (l'enceinte), puis `media_player.play_media` (la
playlist). Ils se font ici et pas dans le navigateur : une fiche fermee entre
les deux ne laisse pas la moitie d'un geste, et l'echec revient en un refus
nomme que l'ecran traduit (`src/refus.js`).

Le compte est l'entite `media_player` de l'integration ; l'enceinte, un nom de
sa `source_list`. Rien ne se devine : une enceinte que Spotify ne voit pas en
ce moment (une Echo endormie) est refusee, plutot que jouee ailleurs. Le module
ne garde aucun etat.

Les playlists du compte se lisent ici aussi (ADR 0346) : a l'arret, le lecteur
de l'integration ne declare plus que le choix de l'enceinte, et Home Assistant
refuse de le parcourir (`media_player/browse_media`). L'integration, elle, se
parcourt toujours (`spotify.async_browse_media`, celle qu'appellent Sonos ou
Cast) : une playlist se montre, que Spotify joue ou non.
"""
from __future__ import annotations

import asyncio
import re
from collections.abc import Awaitable, Callable
from typing import Any

from homeassistant.core import Context, HomeAssistant

from .refus import RefusNomme

# La meme regle que l'ecran (`uriSpotify`, src/spotify.js) : une playlist ou un
# album, par son URI, son lien open.spotify.com (avec ou sans la langue,
# `intl-fr/`), ou l'identifiant de l'arbre (`spotify://<entree>/spotify:...`).
_URI = re.compile(r"spotify:(playlist|album):([A-Za-z0-9]{10,40})")
_LIEN = re.compile(r"open\.spotify\.com/(?:[a-z-]+/)?(playlist|album)/([A-Za-z0-9]{10,40})")

# Le temps que Spotify bascule sur l'enceinte : sans lui, la playlist part
# encore sur l'appareil d'avant.
ATTENTE_BASCULE = 2.0

# Le dossier des playlists du compte, dans l'arbre de l'integration.
PREFIXE = "spotify://"
DOSSIER_PLAYLISTS = "current_user_playlists"


def uri_spotify(texte: object) -> str | None:
    """L'URI `spotify:playlist:...` d'un texte, ou `None`."""
    t = str(texte or "").strip()
    trouve = _URI.search(t) or _LIEN.search(t)
    return f"spotify:{trouve.group(1)}:{trouve.group(2)}" if trouve else None


async def async_jouer(
    hass: HomeAssistant,
    compte: str,
    uri: str,
    sortie: str | None = None,
    *,
    par: str | None = None,
    controle: Callable[[str], bool] | None = None,
    attente: float = ATTENTE_BASCULE,
) -> dict:
    """Choisir l'enceinte, puis lancer la playlist. Rend `{uri, sortie}`.

    `controle` est le droit de piloter du compte de la session : un compte qui
    ne pilote pas ce lecteur Spotify n'en fait rien jouer (`PermissionError`).
    """
    if not isinstance(compte, str) or not compte.startswith("media_player."):
        raise RefusNomme("spotify_compte_absent", "compte Spotify introuvable", compte)
    if controle is not None and not controle(compte):
        raise PermissionError(f"pas le droit de piloter {compte}")
    etat = hass.states.get(compte)
    if etat is None:
        raise RefusNomme("spotify_compte_absent", "compte Spotify introuvable", compte)
    lue = uri_spotify(uri)
    if lue is None:
        raise RefusNomme("spotify_lien", "lien Spotify illisible")
    attrs = getattr(etat, "attributes", None) or {}
    ctx = Context(user_id=par) if par else Context()
    try:
        if sortie:
            if sortie not in (attrs.get("source_list") or []):
                raise RefusNomme("spotify_enceinte_absente", "enceinte absente de Spotify Connect", sortie)
            if attrs.get("source") != sortie:
                await hass.services.async_call(
                    "media_player", "select_source", {"entity_id": compte, "source": sortie},
                    blocking=True, context=ctx)
                if attente > 0:
                    await asyncio.sleep(attente)
        await hass.services.async_call(
            "media_player", "play_media",
            {"entity_id": compte, "media_content_id": lue, "media_content_type": lue.split(":")[1]},
            blocking=True, context=ctx)
    except RefusNomme:
        raise
    except Exception as err:  # une panne de Spotify, un compte sans Premium : un refus nomme, jamais une trace
        raise RefusNomme("spotify_refus", "lecture refusee par Spotify", str(err)) from err
    return {"uri": lue, "sortie": sortie or None}


def _entree_spotify(hass: HomeAssistant, compte: str) -> str | None:
    """L'entree de configuration Spotify du lecteur `compte`, ou `None`."""
    try:
        from homeassistant.helpers import entity_registry as er

        e = er.async_get(hass).async_get(compte)
    except (ImportError, AttributeError):  # registre illisible : comme un compte absent
        return None
    if e is None or getattr(e, "platform", None) != "spotify":
        return None
    return getattr(e, "config_entry_id", None) or None


async def async_playlists(
    hass: HomeAssistant,
    compte: str,
    *,
    lecture: Callable[[str], bool] | None = None,
    entree: str | None = None,
    naviguer: Callable[..., Awaitable[Any]] | None = None,
) -> dict:
    """Les playlists du compte, que Spotify joue ou non : le dossier de l'arbre (`as_dict`).

    `lecture` est le droit de voir du compte de la session : un compte qui ne
    voit pas ce lecteur Spotify n'en lit rien (`PermissionError`). Une panne
    de Spotify revient en un refus nomme ; l'ecran dit alors que Spotify ne
    repond pas.
    """
    if not isinstance(compte, str) or not compte.startswith("media_player."):
        raise RefusNomme("spotify_compte_absent", "compte Spotify introuvable", compte)
    if lecture is not None and not lecture(compte):
        raise PermissionError(f"pas le droit de voir {compte}")
    if entree is None:
        entree = _entree_spotify(hass, compte)
    if not entree:
        raise RefusNomme("spotify_compte_absent", "compte Spotify introuvable", compte)
    try:
        if naviguer is None:
            from homeassistant.components import spotify as integration

            naviguer = integration.async_browse_media
        noeud = await naviguer(hass, PREFIXE + DOSSIER_PLAYLISTS, f"{PREFIXE}{entree}/{DOSSIER_PLAYLISTS}")
    except Exception as err:  # une panne de Spotify, un compte deconnecte : un refus nomme, jamais une trace
        raise RefusNomme("spotify_refus", "playlists illisibles", str(err)) from err
    return noeud.as_dict() if hasattr(noeud, "as_dict") else dict(noeud)
