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
  loggia/discovery      -> ce que Home Assistant sait de l'installation

`loggia/discovery` est ouverte a tout compte authentifie, a dessein. Les
commandes equivalentes de Home Assistant — `config/area_registry/list` et ses
voisines — exigent un administrateur : le dashboard n'avait donc ni pieces ni
appareils sur un compte ordinaire. Ce qui transite ici ne contient ni jeton, ni
option de configuration : des noms, des rattachements, de quoi reconnaitre un
appareil.
"""
from __future__ import annotations

import json
import logging
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.util import dt as dt_util

from .discovery import async_index
from .store import MAX_TOTAL_BYTES, MAX_VALUE_BYTES, LoggiaStore

_LOGGER = logging.getLogger(__name__)

WS_GET = "loggia/config/get"
WS_SET = "loggia/config/set"
WS_DELETE = "loggia/config/delete"
WS_STATS = "loggia/config/stats"
WS_DISCOVERY = "loggia/discovery"
WS_INT_ETAT = "loggia/interrupteurs/etat"
WS_INT_AFFECTER = "loggia/interrupteurs/affecter"
WS_VOL_ETAT = "loggia/volets/etat"
WS_VOL_CONFIG = "loggia/volets/config"
WS_FEN_ETAT = "loggia/fenetres/etat"
WS_FEN_CONFIG = "loggia/fenetres/config"
WS_PRE_ETAT = "loggia/presence/etat"
WS_PRE_CONFIG = "loggia/presence/config"
WS_NUI_ETAT = "loggia/nuit/etat"
WS_NUI_CONFIG = "loggia/nuit/config"
WS_VEI_ETAT = "loggia/veilles/etat"
WS_VEI_CONFIG = "loggia/veilles/config"


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
def async_register(hass: HomeAssistant, store: LoggiaStore,
                   acces_interrupteurs=None, acces_volets=None, acces_fenetres=None,
                   acces_presence=None, acces_nuit=None,
                   acces_veilles=None) -> None:
    """Declare les commandes aupres du serveur WebSocket.

    `acces_interrupteurs` est un APPELABLE, pas l'objet : ces commandes ne
    s'enregistrent qu'une fois pour la vie du process, alors que l'ecoute des
    interrupteurs se recree a chaque chargement de l'integration. On la
    resout donc au moment de l'appel. Elle peut manquer — une installation
    sans MQTT, ou une mise en place qui a echoue : les deux commandes
    repondent alors une erreur claire plutot que de manquer a l'appel.
    """

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

    # Qui a obtenu l'index, et quand. Tenu en memoire seulement : c'est un
    # diagnostic, pas une trace a conserver. Il repond a une question qu'on ne
    # peut pas poser autrement — la decouverte arrive-t-elle vraiment aux
    # comptes ordinaires, pour qui les commandes de Home Assistant sont fermees.
    servis: dict[str, dict[str, Any]] = {}

    @websocket_api.websocket_command({vol.Required("type"): WS_STATS})
    @websocket_api.require_admin
    @websocket_api.async_response
    async def handle_stats(hass, connection, msg):
        stats = await store.async_stats()
        stats["discovery"] = servis
        connection.send_result(msg["id"], stats)

    @websocket_api.websocket_command({vol.Required("type"): WS_DISCOVERY})
    @callback
    def handle_discovery(hass, connection, msg):
        user = connection.user
        vu = servis.setdefault(user.id, {"name": user.name, "admin": user.is_admin, "count": 0})
        vu["count"] += 1
        vu["last"] = dt_util.utcnow().isoformat(timespec="seconds")
        # Le compte vient de la connexion authentifiee, jamais du message : il
        # sert a retirer de la reponse ce que ce compte n'a pas le droit de lire.
        connection.send_result(msg["id"], {"index": async_index(hass, user)})

    # ── Interrupteurs sans fil ────────────────────────────────────────────
    # Lecture ouverte : des noms d'appareils et de boutons, comme la
    # decouverte. Ecriture reservee aux administrateurs — une affectation
    # appelle un service Home Assistant arbitraire, et un compte ordinaire ne
    # doit pas pouvoir se donner ce pouvoir par ce detour.
    @websocket_api.websocket_command({vol.Required("type"): WS_INT_ETAT})
    @websocket_api.async_response
    async def handle_int_etat(hass, connection, msg):
        interrupteurs = acces_interrupteurs() if acces_interrupteurs else None
        if interrupteurs is None:
            connection.send_error(
                msg["id"], "not_available", "ecoute des interrupteurs indisponible"
            )
            return
        connection.send_result(msg["id"], await interrupteurs.async_etat())

    @websocket_api.websocket_command(
        {
            vol.Required("type"): WS_INT_AFFECTER,
            vol.Required("cle"): str,
            vol.Required("action"): str,
            vol.Required("gestes"): [dict],
            vol.Optional("nom", default=""): str,
        }
    )
    @websocket_api.require_admin
    @websocket_api.async_response
    async def handle_int_affecter(hass, connection, msg):
        interrupteurs = acces_interrupteurs() if acces_interrupteurs else None
        if interrupteurs is None:
            connection.send_error(
                msg["id"], "not_available", "ecoute des interrupteurs indisponible"
            )
            return
        table = await interrupteurs.async_affecter(
            msg["cle"], msg["action"], msg["gestes"], msg.get("nom") or ""
        )
        connection.send_result(msg["id"], {"affectations": table})

    # ── Regles de volets ──────────────────────────────────────────────────
    # Meme partage que les interrupteurs : lecture ouverte, ecriture reservee
    # aux administrateurs. Un planning de volets commande la maison entiere.
    @websocket_api.websocket_command({vol.Required("type"): WS_VOL_ETAT})
    @websocket_api.async_response
    async def handle_vol_etat(hass, connection, msg):
        volets = acces_volets() if acces_volets else None
        if volets is None:
            connection.send_error(msg["id"], "not_available", "regles de volets indisponibles")
            return
        connection.send_result(msg["id"], await volets.async_etat())

    @websocket_api.websocket_command(
        {vol.Required("type"): WS_VOL_CONFIG, vol.Required("patch"): dict}
    )
    @websocket_api.require_admin
    @websocket_api.async_response
    async def handle_vol_config(hass, connection, msg):
        volets = acces_volets() if acces_volets else None
        if volets is None:
            connection.send_error(msg["id"], "not_available", "regles de volets indisponibles")
            return
        connection.send_result(msg["id"], {"config": await volets.async_enregistrer(msg["patch"])})

    # ── Fenetre ouverte, chauffage coupe ──────────────────────────────────
    @websocket_api.websocket_command({vol.Required("type"): WS_FEN_ETAT})
    @websocket_api.async_response
    async def handle_fen_etat(hass, connection, msg):
        fen = acces_fenetres() if acces_fenetres else None
        if fen is None:
            connection.send_error(msg["id"], "not_available", "regle des fenetres indisponible")
            return
        connection.send_result(msg["id"], await fen.async_etat())

    @websocket_api.websocket_command(
        {vol.Required("type"): WS_FEN_CONFIG, vol.Required("patch"): dict}
    )
    @websocket_api.require_admin
    @websocket_api.async_response
    async def handle_fen_config(hass, connection, msg):
        fen = acces_fenetres() if acces_fenetres else None
        if fen is None:
            connection.send_error(msg["id"], "not_available", "regle des fenetres indisponible")
            return
        connection.send_result(msg["id"], {"config": await fen.async_enregistrer(msg["patch"])})

    # ── Depart et retour ──────────────────────────────────────────────────
    @websocket_api.websocket_command({vol.Required("type"): WS_PRE_ETAT})
    @websocket_api.async_response
    async def handle_pre_etat(hass, connection, msg):
        pre = acces_presence() if acces_presence else None
        if pre is None:
            connection.send_error(msg["id"], "not_available", "regle de presence indisponible")
            return
        connection.send_result(msg["id"], await pre.async_etat())

    @websocket_api.websocket_command(
        {vol.Required("type"): WS_PRE_CONFIG, vol.Required("patch"): dict}
    )
    @websocket_api.require_admin
    @websocket_api.async_response
    async def handle_pre_config(hass, connection, msg):
        pre = acces_presence() if acces_presence else None
        if pre is None:
            connection.send_error(msg["id"], "not_available", "regle de presence indisponible")
            return
        connection.send_result(msg["id"], {"config": await pre.async_enregistrer(msg["patch"])})

    # ── La nuit ───────────────────────────────────────────────────────────
    @websocket_api.websocket_command({vol.Required("type"): WS_NUI_ETAT})
    @websocket_api.async_response
    async def handle_nui_etat(hass, connection, msg):
        nuit = acces_nuit() if acces_nuit else None
        if nuit is None:
            connection.send_error(msg["id"], "not_available", "regles de nuit indisponibles")
            return
        connection.send_result(msg["id"], await nuit.async_etat())

    @websocket_api.websocket_command(
        {vol.Required("type"): WS_NUI_CONFIG, vol.Required("patch"): dict}
    )
    @websocket_api.require_admin
    @websocket_api.async_response
    async def handle_nui_config(hass, connection, msg):
        nuit = acces_nuit() if acces_nuit else None
        if nuit is None:
            connection.send_error(msg["id"], "not_available", "regles de nuit indisponibles")
            return
        connection.send_result(msg["id"], {"config": await nuit.async_enregistrer(msg["patch"])})

    # ── Les veilles ───────────────────────────────────────────────────────
    @websocket_api.websocket_command({vol.Required("type"): WS_VEI_ETAT})
    @websocket_api.async_response
    async def handle_vei_etat(hass, connection, msg):
        vei = acces_veilles() if acces_veilles else None
        if vei is None:
            connection.send_error(msg["id"], "not_available", "veilles indisponibles")
            return
        connection.send_result(msg["id"], await vei.async_etat())

    @websocket_api.websocket_command(
        {vol.Required("type"): WS_VEI_CONFIG, vol.Required("patch"): dict}
    )
    @websocket_api.require_admin
    @websocket_api.async_response
    async def handle_vei_config(hass, connection, msg):
        vei = acces_veilles() if acces_veilles else None
        if vei is None:
            connection.send_error(msg["id"], "not_available", "veilles indisponibles")
            return
        connection.send_result(msg["id"], {"config": await vei.async_enregistrer(msg["patch"])})

    websocket_api.async_register_command(hass, handle_vei_etat)
    websocket_api.async_register_command(hass, handle_vei_config)
    websocket_api.async_register_command(hass, handle_nui_etat)
    websocket_api.async_register_command(hass, handle_nui_config)
    websocket_api.async_register_command(hass, handle_pre_etat)
    websocket_api.async_register_command(hass, handle_pre_config)
    websocket_api.async_register_command(hass, handle_fen_etat)
    websocket_api.async_register_command(hass, handle_fen_config)
    websocket_api.async_register_command(hass, handle_vol_etat)
    websocket_api.async_register_command(hass, handle_vol_config)
    websocket_api.async_register_command(hass, handle_int_etat)
    websocket_api.async_register_command(hass, handle_int_affecter)
    websocket_api.async_register_command(hass, handle_discovery)
    websocket_api.async_register_command(hass, handle_get)
    websocket_api.async_register_command(hass, handle_set)
    websocket_api.async_register_command(hass, handle_delete)
    websocket_api.async_register_command(hass, handle_stats)
    _LOGGER.info("Loggia : commandes WebSocket de configuration enregistrees")
