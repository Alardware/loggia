"""Commandes WebSocket Loggia : lecture et ecriture de la configuration utilisateur.

Regle de securite centrale : l'identite provient TOUJOURS de
`connection.user.id`, c'est-a-dire de la session WebSocket authentifiee par Home
Assistant. Le client ne peut pas designer un autre utilisateur — aucune commande
n'accepte de champ `user_id`. Un utilisateur ne lit et n'ecrit donc que sa propre
configuration, et les permissions Home Assistant restent celles de sa session.

Commandes :
  loggia/config/get     -> {"config": {...}, "user": {...}}
  loggia/config/set     -> fusionne un patch, renvoie la config resultante
  loggia/config/delete  -> efface la configuration de l'utilisateur
  loggia/config/stats   -> chiffres de diagnostic (admin uniquement)
"""
from __future__ import annotations

import json
import logging
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback

from .store import MAX_TOTAL_BYTES, MAX_VALUE_BYTES, LoggiaStore

_LOGGER = logging.getLogger(__name__)

WS_GET = "loggia/config/get"
WS_SET = "loggia/config/set"
WS_DELETE = "loggia/config/delete"
WS_STATS = "loggia/config/stats"


def _user_info(connection: websocket_api.ActiveConnection) -> dict[str, Any]:
    """Identite minimale de l'appelant, telle que Home Assistant la connait."""
    user = connection.user
    return {
        "id": user.id,
        "name": user.name,
        "is_admin": user.is_admin,
        "is_owner": getattr(user, "is_owner", False),
    }


def _payload_too_big(patch: dict[str, Any]) -> str | None:
    """Verifie les tailles avant ecriture. Renvoie un message d'erreur ou None."""
    total = 0
    for key, value in patch.items():
        try:
            size = len(json.dumps(value, ensure_ascii=False).encode("utf-8"))
        except (TypeError, ValueError):
            return f"valeur non serialisable pour la cle {key}"
        if size > MAX_VALUE_BYTES:
            return f"valeur trop volumineuse pour la cle {key} ({size} octets)"
        total += size
    if total > MAX_TOTAL_BYTES:
        return f"charge totale trop volumineuse ({total} octets)"
    return None


@callback
def async_register(hass: HomeAssistant, store: LoggiaStore) -> None:
    """Declare les commandes aupres du serveur WebSocket."""

    @websocket_api.websocket_command({vol.Required("type"): WS_GET})
    @websocket_api.async_response
    async def handle_get(hass, connection, msg):
        config = await store.async_get_user(connection.user.id)
        connection.send_result(msg["id"], {"config": config, "user": _user_info(connection)})

    @websocket_api.websocket_command(
        {
            vol.Required("type"): WS_SET,
            vol.Required("config"): dict,
            vol.Optional("replace", default=False): bool,
        }
    )
    @websocket_api.async_response
    async def handle_set(hass, connection, msg):
        patch: dict[str, Any] = msg["config"]
        if any(not isinstance(k, str) for k in patch):
            connection.send_error(msg["id"], "invalid_format", "cles non textuelles")
            return
        problem = _payload_too_big(patch)
        if problem:
            connection.send_error(msg["id"], "payload_too_large", problem)
            return
        try:
            # Le role vient de la connexion authentifiee, jamais du message :
            # un client ne doit pas pouvoir se declarer administrateur.
            config = await store.async_set_user(
                connection.user.id,
                patch,
                replace=bool(msg.get("replace")),
                is_admin=bool(connection.user.is_admin),
            )
        except ValueError as err:
            connection.send_error(msg["id"], "invalid_format", str(err))
            return
        connection.send_result(msg["id"], {"config": config})

    @websocket_api.websocket_command({vol.Required("type"): WS_DELETE})
    @websocket_api.async_response
    async def handle_delete(hass, connection, msg):
        await store.async_delete_user(connection.user.id)
        connection.send_result(msg["id"], {"config": {}})

    @websocket_api.websocket_command({vol.Required("type"): WS_STATS})
    @websocket_api.require_admin
    @websocket_api.async_response
    async def handle_stats(hass, connection, msg):
        connection.send_result(msg["id"], await store.async_stats())

    websocket_api.async_register_command(hass, handle_get)
    websocket_api.async_register_command(hass, handle_set)
    websocket_api.async_register_command(hass, handle_delete)
    websocket_api.async_register_command(hass, handle_stats)
    _LOGGER.info("Loggia : commandes WebSocket de configuration enregistrees")
