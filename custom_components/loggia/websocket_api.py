"""Commandes WebSocket Loggia : lecture et ecriture de la configuration utilisateur.

Regle de securite centrale : l'identite provient TOUJOURS de
`connection.user.id`, c'est-a-dire de la session WebSocket authentifiee par Home
Assistant. Le client ne peut pas designer un autre utilisateur — aucune commande
n'accepte de champ `user_id`. Un utilisateur ne lit et n'ecrit donc que sa propre
configuration, et les permissions Home Assistant restent celles de sa session.

Les 31 commandes, toutes prefixees `loggia/`. Le compte et la repartition
entre ouvertes et reservees sont verrouilles par `test_websocket_api.py` :
une commande nouvelle doit y etre rangee d'un cote ou de l'autre.

  La configuration
    config/get      -> {"config": {...}, "user": {...}}
    config/set      -> fusionne un patch, renvoie la config resultante
    config/delete   -> efface la configuration de l'utilisateur
    config/suivre   -> un flux : a chaque ecriture, le compte et les cles qui
                       ont change (jamais les valeurs), pour relire
  L'installation
    discovery       -> ce que Home Assistant sait : pieces, appareils, entites
  Le socle des regles
    regles/etat     -> le journal de la maison, et ce qui retient en ce moment
    regles/degeler  -> rendre la main aux regles sur une entite (admin)
  Les modules de regles — `etat` se lit de tout compte, `config` est reservee
  aux administrateurs : volets, fenetres, presence, nuit, veilles, scenarios,
  robots.
  Les gestes, ouverts a tout compte mais bornes a ce qu'il a le droit de
  piloter
    scenarios/lancer        -> lancer un scenario
    minuteurs/etat|poser|annuler -> le minuteur d'extinction d'un appareil
    sirene/tester           -> sonner trois secondes, tenu ici
  Les boutons sans fil
    interrupteurs/etat      -> ce que l'ecoute a vu passer
    interrupteurs/affecter  -> lier un geste a une action (admin)
    interrupteurs/ecouter   -> ouvrir l'ecoute cinq minutes (admin)
  Le code administrateur
    pin/verifier    -> verifie ici, essais limites
    pin/definir     -> le definir, hache (admin)

`loggia/discovery` est ouverte a tout compte authentifie, a dessein. Les
commandes equivalentes de Home Assistant — `config/area_registry/list` et ses
voisines — exigent un administrateur : le dashboard n'avait donc ni pieces ni
appareils sur un compte ordinaire. Ce qui transite ici ne contient ni jeton, ni
option de configuration : des noms, des rattachements, de quoi reconnaitre un
appareil.
"""
from __future__ import annotations

import asyncio
import hmac
import json
import logging
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback

from .code_admin import CODE_DEFAUT, LaissezPasser, Limiteur, code_valide, hacher, passage_admin, verifier
from .discovery import async_index
from .scenarios import controle_de
from .store import MAX_TOTAL_BYTES, MAX_VALUE_BYTES, SIGNAL_CONFIG, LoggiaStore, MaisonReserveeError

_LOGGER = logging.getLogger(__name__)

WS_GET = "loggia/config/get"
WS_SET = "loggia/config/set"
WS_DELETE = "loggia/config/delete"
WS_CFG_SUIVRE = "loggia/config/suivre"
WS_DISCOVERY = "loggia/discovery"
WS_INT_ETAT = "loggia/interrupteurs/etat"
WS_INT_AFFECTER = "loggia/interrupteurs/affecter"
WS_INT_ECOUTER = "loggia/interrupteurs/ecouter"
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
WS_REG_ETAT = "loggia/regles/etat"
WS_REG_DEGELER = "loggia/regles/degeler"
WS_SCN_ETAT = "loggia/scenarios/etat"
WS_SCN_CONFIG = "loggia/scenarios/config"
WS_SCN_LANCER = "loggia/scenarios/lancer"
WS_ROB_ETAT = "loggia/robots/etat"
WS_ROB_CONFIG = "loggia/robots/config"
WS_MIN_ETAT = "loggia/minuteurs/etat"
WS_MIN_POSER = "loggia/minuteurs/poser"
WS_MIN_ANNULER = "loggia/minuteurs/annuler"
WS_SIR_TESTER = "loggia/sirene/tester"
WS_PIN_VERIFIER = "loggia/pin/verifier"
WS_PIN_DEFINIR = "loggia/pin/definir"


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
                   acces_veilles=None, acces_regles=None, acces_scenarios=None,
                   acces_robots=None, acces_minuteurs=None, acces_sirene=None) -> None:
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

    async def _refus_profil_admin(patch, connection) -> str:
        """Le motif du refus, ou une chaine vide (24/09, plan M14).

        `loggia_active_user` est OUVERTE a tout compte, et doit le rester : une
        tablette de famille change de profil, c'est son usage premier. Mais
        l'ecran annonce « Requis pour basculer vers un profil Admin », et rien
        ne le verifiait : un appel direct sautait le code.

        On ne garde donc QUE le passage vers un profil Admin, et seulement
        pour un compte qui n'est pas deja administrateur de Home Assistant —
        celui-la n'a rien a prouver, il peut tout ailleurs.

        La liste des profils illisible fait REFUSER : sans elle on ne sait pas
        ce que l'on ouvre (ADR 0079).
        """
        if "loggia_active_user" not in patch:
            return ""
        if connection.user.is_admin:
            return ""
        if laissez_passer.valide(connection.user.id):
            return ""
        try:
            profils = await store.async_get_shared("loggia_users", None)
        except Exception:  # noqa: BLE001
            _LOGGER.warning(
                "Loggia : liste des profils illisible, le passage Admin est refuse",
                exc_info=True)
            return "le code administrateur n'a pas pu etre verifie"
        if not passage_admin(patch, profils):
            return ""
        return "le code administrateur est requis pour ce profil"

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
        refus = await _refus_profil_admin(patch, connection)
        if refus:
            connection.send_error(msg["id"], "not_admin", refus)
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
        except MaisonReserveeError as err:
            # Un code a part : ce n'est pas la forme du message qui cloche,
            # c'est le droit de l'ecrire. Le dashboard le dit tel quel
            # plutot que d'accuser un « format invalide » incomprehensible.
            connection.send_error(msg["id"], "not_admin", str(err))
            return
        except ValueError as err:
            connection.send_error(msg["id"], "invalid_format", str(err))
            return
        connection.send_result(msg["id"], {"config": config})

    @websocket_api.websocket_command({vol.Required("type"): WS_DELETE})
    @websocket_api.async_response
    async def handle_delete(hass, connection, msg):
        await store.async_delete_user(connection.user.id)
        connection.send_result(msg["id"], {"config": {}})

    @websocket_api.websocket_command({vol.Required("type"): WS_DISCOVERY})
    @callback
    def handle_discovery(hass, connection, msg):
        user = connection.user
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
        try:
            table = await interrupteurs.async_affecter(
                msg["cle"], msg["action"], msg["gestes"], msg.get("nom") or ""
            )
        except ValueError as err:
            connection.send_error(msg["id"], "payload_too_large", str(err))
            return
        connection.send_result(msg["id"], {"affectations": table})

    # L'ecoute d'apprentissage : l'ouvrir pour un temps compte, ou la couper.
    # Reservee comme l'affectation — c'est un reglage de la maison.
    @websocket_api.websocket_command(
        {
            vol.Required("type"): WS_INT_ECOUTER,
            vol.Required("duree"): vol.All(vol.Coerce(int), vol.Range(min=0, max=900)),
        }
    )
    @websocket_api.require_admin
    @websocket_api.async_response
    async def handle_int_ecouter(hass, connection, msg):
        interrupteurs = acces_interrupteurs() if acces_interrupteurs else None
        if interrupteurs is None:
            connection.send_error(
                msg["id"], "not_available", "ecoute des interrupteurs indisponible"
            )
            return
        connection.send_result(msg["id"], {"ecoute": interrupteurs.ecouter(msg["duree"])})

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
        try:
            config = await volets.async_enregistrer(msg["patch"])
        except ValueError as err:
            # Les plafonds de `store.py`. Sans ce relais, le refus
            # remonterait en erreur inconnue et l'ecran continuerait
            # d'afficher un reglage que le serveur n'a pas garde.
            connection.send_error(msg["id"], "payload_too_large", str(err))
            return
        connection.send_result(msg["id"], {"config": config})

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
        try:
            config = await fen.async_enregistrer(msg["patch"])
        except ValueError as err:
            # Les plafonds de `store.py`. Sans ce relais, le refus
            # remonterait en erreur inconnue et l'ecran continuerait
            # d'afficher un reglage que le serveur n'a pas garde.
            connection.send_error(msg["id"], "payload_too_large", str(err))
            return
        connection.send_result(msg["id"], {"config": config})

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
        try:
            config = await pre.async_enregistrer(msg["patch"])
        except ValueError as err:
            # Les plafonds de `store.py`. Sans ce relais, le refus
            # remonterait en erreur inconnue et l'ecran continuerait
            # d'afficher un reglage que le serveur n'a pas garde.
            connection.send_error(msg["id"], "payload_too_large", str(err))
            return
        connection.send_result(msg["id"], {"config": config})

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
        try:
            config = await nuit.async_enregistrer(msg["patch"])
        except ValueError as err:
            # Les plafonds de `store.py`. Sans ce relais, le refus
            # remonterait en erreur inconnue et l'ecran continuerait
            # d'afficher un reglage que le serveur n'a pas garde.
            connection.send_error(msg["id"], "payload_too_large", str(err))
            return
        connection.send_result(msg["id"], {"config": config})

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
        try:
            config = await vei.async_enregistrer(msg["patch"])
        except ValueError as err:
            # Les plafonds de `store.py`. Sans ce relais, le refus
            # remonterait en erreur inconnue et l'ecran continuerait
            # d'afficher un reglage que le serveur n'a pas garde.
            connection.send_error(msg["id"], "payload_too_large", str(err))
            return
        connection.send_result(msg["id"], {"config": config})

    # ── Le socle : le journal de la maison, et ce qui retient en ce moment ──
    #
    # ── Les scenarios (ADR 0027) ───────────────────────────────────────────
    # Lire et lancer sont ouverts a tout compte connecte : lancer, c'est
    # appeler des services que Home Assistant lui permet deja. Ecrire — les
    # scenarios sont ceux de la maison — reste aux administrateurs.
    @websocket_api.websocket_command({vol.Required("type"): WS_SCN_ETAT})
    @websocket_api.async_response
    async def handle_scn_etat(hass, connection, msg):
        scenarios = acces_scenarios() if acces_scenarios else None
        if scenarios is None:
            connection.send_error(msg["id"], "not_available", "scenarios indisponibles")
            return
        connection.send_result(msg["id"], await scenarios.async_etat())

    @websocket_api.websocket_command(
        {vol.Required("type"): WS_SCN_CONFIG, vol.Required("patch"): dict}
    )
    @websocket_api.require_admin
    @websocket_api.async_response
    async def handle_scn_config(hass, connection, msg):
        scenarios = acces_scenarios() if acces_scenarios else None
        if scenarios is None:
            connection.send_error(msg["id"], "not_available", "scenarios indisponibles")
            return
        try:
            config = await scenarios.async_enregistrer(msg["patch"])
        except ValueError as err:
            connection.send_error(msg["id"], "invalid_format", str(err))
            return
        # L'etat avec : l'ecran redessine sans attendre son sondage.
        connection.send_result(msg["id"], {"config": config, "etat": await scenarios.async_etat()})

    @websocket_api.websocket_command(
        {vol.Required("type"): WS_SCN_LANCER, vol.Required("id"): str}
    )
    @websocket_api.async_response
    async def handle_scn_lancer(hass, connection, msg):
        scenarios = acces_scenarios() if acces_scenarios else None
        if scenarios is None:
            connection.send_error(msg["id"], "not_available", "scenarios indisponibles")
            return
        # La main de celui qui appuie : les regles la verront comme telle.
        # Ses permissions d'entite, pas celles du composant (audit 18/09).
        resultat = await scenarios.async_lancer(msg["id"], user_id=connection.user.id,
                                                controle=controle_de(connection.user))
        if resultat is None:
            connection.send_error(msg["id"], "not_found", "scenario inconnu : %s" % msg["id"])
            return
        connection.send_result(msg["id"], resultat)

    # ── Le code administrateur (18/09) : verifie ICI, jamais renvoye ───────
    # Tout compte connecte peut tenter le code (c'est son usage : basculer de
    # profil sur une tablette de famille) ; les essais rates sont comptes par
    # compte et bloquent. Le definir reste aux administrateurs.
    limiteur = Limiteur()
    # Un compte a la fois : sans ce verrou, des tentatives envoyees en rafale
    # passaient toutes avant que le blocage ne tombe (audit 18/09).
    verrous_pin: dict[str, asyncio.Lock] = {}
    # Ce qu'un code verifie ouvre : le passage vers un profil Admin, pour
    # quelques minutes et pour ce compte-la seulement (24/09, plan M14).
    laissez_passer = LaissezPasser()

    @websocket_api.websocket_command({vol.Required("type"): WS_PIN_VERIFIER, vol.Required("pin"): str})
    @websocket_api.async_response
    async def handle_pin_verifier(hass, connection, msg):
        uid = connection.user.id
        async with verrous_pin.setdefault(uid, asyncio.Lock()):
            attente = limiteur.bloque_pendant(uid)
            if attente:
                connection.send_result(msg["id"], {"ok": False, "bloque": attente})
                return
            pin = msg["pin"]
            enregistrement = await store.async_get_code_admin()
            if enregistrement is None:
                # Jamais defini : le code par defaut, compare a temps constant.
                ok = code_valide(pin) and hmac.compare_digest(pin.encode("utf-8"), CODE_DEFAUT.encode("utf-8"))
            else:
                # PBKDF2 pese quelques dizaines de millisecondes : hors de la boucle.
                ok = await hass.async_add_executor_job(verifier, pin, enregistrement)
            if ok:
                limiteur.reussi(uid)
                laissez_passer.accorder(uid)
                connection.send_result(msg["id"], {"ok": True})
                return
            duree = limiteur.rate(uid)
            if duree:
                _LOGGER.warning("Loggia : code administrateur — trop d'essais rates, compte bloque %d s", duree)
            connection.send_result(msg["id"], {"ok": False, "bloque": duree})

    @websocket_api.websocket_command({vol.Required("type"): WS_PIN_DEFINIR, vol.Required("pin"): str})
    @websocket_api.require_admin
    @websocket_api.async_response
    async def handle_pin_definir(hass, connection, msg):
        if not code_valide(msg["pin"]):
            connection.send_error(msg["id"], "invalid_format", "le code fait de quatre a huit chiffres")
            return
        enregistrement = await hass.async_add_executor_job(hacher, msg["pin"])
        await store.async_set_code_admin(enregistrement)
        connection.send_result(msg["id"], {"defini": True})

    # ── Le planning des robots (ADR 0043) ──────────────────────────────────
    # Lire est ouvert a tout compte connecte ; ecrire — le planning est celui
    # de la maison — reste aux administrateurs.
    @websocket_api.websocket_command({vol.Required("type"): WS_ROB_ETAT})
    @websocket_api.async_response
    async def handle_rob_etat(hass, connection, msg):
        robots = acces_robots() if acces_robots else None
        if robots is None:
            connection.send_error(msg["id"], "not_available", "planning des robots indisponible")
            return
        connection.send_result(msg["id"], await robots.async_etat())

    @websocket_api.websocket_command(
        {vol.Required("type"): WS_ROB_CONFIG, vol.Required("patch"): dict}
    )
    @websocket_api.require_admin
    @websocket_api.async_response
    async def handle_rob_config(hass, connection, msg):
        robots = acces_robots() if acces_robots else None
        if robots is None:
            connection.send_error(msg["id"], "not_available", "planning des robots indisponible")
            return
        try:
            config = await robots.async_enregistrer(msg["patch"])
        except ValueError as err:
            connection.send_error(msg["id"], "invalid_format", str(err))
            return
        connection.send_result(msg["id"], {"config": config})

    # ── Suivre la configuration (22/09, ADR 0067) ──────────────────────────
    # Un ecran s'abonne une fois ; a chaque ecriture du magasin il apprend
    # QUI a change (le compte) et QUELLES cles — jamais les valeurs : il relit
    # ensuite par `loggia/config/get`, sous ses propres droits. Ouvert a tout
    # compte : il n'y transite que des noms de cles.
    @websocket_api.websocket_command({vol.Required("type"): WS_CFG_SUIVRE})
    @websocket_api.async_response
    async def handle_cfg_suivre(hass, connection, msg):
        from homeassistant.helpers.dispatcher import async_dispatcher_connect

        @callback
        def transmettre(changement):
            connection.send_message(websocket_api.event_message(msg["id"], changement))

        connection.subscriptions[msg["id"]] = async_dispatcher_connect(hass, SIGNAL_CONFIG, transmettre)
        connection.send_result(msg["id"])

    # ── Les minuteurs d'extinction (21/09) ─────────────────────────────────
    # Ouverts a tout compte connecte — c'est le geste d'une fiche de lampe —,
    # mais seulement sur ce que ce compte a le droit de PILOTER : le composant
    # eteint lui-meme, la verification de Home Assistant n'aurait pas lieu
    # (audit 18/09). Qui pose le minuteur vient de la session, jamais du message.
    def _minuteurs(connection, msg):
        minuteurs = acces_minuteurs() if acces_minuteurs else None
        if minuteurs is None:
            connection.send_error(msg["id"], "not_available", "minuteurs indisponibles")
        return minuteurs

    @websocket_api.websocket_command({vol.Required("type"): WS_MIN_ETAT})
    @websocket_api.async_response
    async def handle_min_etat(hass, connection, msg):
        minuteurs = _minuteurs(connection, msg)
        if minuteurs is None:
            return
        connection.send_result(msg["id"], minuteurs.async_etat(controle_de(connection.user)))

    @websocket_api.websocket_command(
        {vol.Required("type"): WS_MIN_POSER, vol.Required("entity_id"): str,
         vol.Required("minutes"): int}
    )
    @websocket_api.async_response
    async def handle_min_poser(hass, connection, msg):
        minuteurs = _minuteurs(connection, msg)
        if minuteurs is None:
            return
        try:
            etat = await minuteurs.async_poser(msg["entity_id"], msg["minutes"], par=connection.user.id,
                                               controle=controle_de(connection.user))
        except PermissionError as err:
            connection.send_error(msg["id"], "unauthorized", str(err))
            return
        except ValueError as err:
            connection.send_error(msg["id"], "invalid_format", str(err))
            return
        connection.send_result(msg["id"], etat)

    @websocket_api.websocket_command(
        {vol.Required("type"): WS_MIN_ANNULER, vol.Required("entity_id"): str}
    )
    @websocket_api.async_response
    async def handle_min_annuler(hass, connection, msg):
        minuteurs = _minuteurs(connection, msg)
        if minuteurs is None:
            return
        try:
            etat = await minuteurs.async_annuler(msg["entity_id"], controle=controle_de(connection.user))
        except PermissionError as err:
            connection.send_error(msg["id"], "unauthorized", str(err))
            return
        connection.send_result(msg["id"], etat)

    # ── Le test d'une sirene (22/09) ───────────────────────────────────────
    # Meme regime que les minuteurs : le geste d'une carte, ouvert a tout
    # compte connecte, sur ce qu'il a le droit de PILOTER — c'est le composant
    # qui allume et eteint. Qui teste vient de la session, jamais du message.
    @websocket_api.websocket_command(
        {vol.Required("type"): WS_SIR_TESTER, vol.Required("entity_id"): str}
    )
    @websocket_api.async_response
    async def handle_sir_tester(hass, connection, msg):
        sirene = acces_sirene() if acces_sirene else None
        if sirene is None:
            connection.send_error(msg["id"], "not_available", "test de sirene indisponible")
            return
        try:
            etat = await sirene.async_tester(msg["entity_id"], par=connection.user.id,
                                             controle=controle_de(connection.user))
        except PermissionError as err:
            connection.send_error(msg["id"], "unauthorized", str(err))
            return
        except ValueError as err:
            connection.send_error(msg["id"], "invalid_format", str(err))
            return
        connection.send_result(msg["id"], etat)

    # Toutes les regles melees, dans l'ordre du temps — le seul outil de
    # debogage d'un non-technicien. Et le PRESENT : quand rien ne bouge, la
    # question n'est pas ce qui s'est passe mais ce qui retient — une main,
    # une tenue, un ordre en attente.
    @websocket_api.websocket_command({
        vol.Required("type"): WS_REG_ETAT,
        vol.Optional("limite", default=200): vol.All(int, vol.Range(min=1, max=500)),
        vol.Optional("module"): str,
    })
    @websocket_api.async_response
    async def handle_reg_etat(hass, connection, msg):
        regles = acces_regles() if acces_regles else None
        if regles is None:
            connection.send_error(msg["id"], "not_available", "socle des regles indisponible")
            return
        # Les ordres en attente vivent chez les volets : le seul module qui en a.
        volets = acces_volets() if acces_volets else None
        attentes = getattr(volets, "attente", None) if volets is not None else None
        connection.send_result(msg["id"], {
            "journal": await regles.journal(limite=msg.get("limite", 200), module=msg.get("module")),
            "gels": regles.gels(),
            "tenues": regles.tenues_toutes(),
            "attentes": {h: dict(o) for h, o in attentes.items()} if isinstance(attentes, dict) else {},
            "calme": await regles.calme(),
        })

    # Rendre la main aux regles avant l'heure. C'est defaire ce que quelqu'un
    # a fait a la main : un geste d'administrateur, et il se voit au journal
    # comme les autres.
    @websocket_api.websocket_command(
        {vol.Required("type"): WS_REG_DEGELER, vol.Required("entity_id"): str}
    )
    @websocket_api.require_admin
    @websocket_api.async_response
    async def handle_reg_degeler(hass, connection, msg):
        regles = acces_regles() if acces_regles else None
        if regles is None:
            connection.send_error(msg["id"], "not_available", "socle des regles indisponible")
            return
        haid = msg["entity_id"]
        etait = regles.gele(haid)
        regles.degeler(haid)
        await regles.noter("regles", "main", "rendre la main", cibles=[haid],
                           motif="depuis le journal")
        connection.send_result(msg["id"], {"entity_id": haid, "etait_gele": etait,
                                           "gels": regles.gels()})

    websocket_api.async_register_command(hass, handle_reg_etat)
    websocket_api.async_register_command(hass, handle_reg_degeler)
    websocket_api.async_register_command(hass, handle_scn_etat)
    websocket_api.async_register_command(hass, handle_scn_config)
    websocket_api.async_register_command(hass, handle_scn_lancer)
    websocket_api.async_register_command(hass, handle_rob_etat)
    websocket_api.async_register_command(hass, handle_rob_config)
    websocket_api.async_register_command(hass, handle_min_etat)
    websocket_api.async_register_command(hass, handle_min_poser)
    websocket_api.async_register_command(hass, handle_min_annuler)
    websocket_api.async_register_command(hass, handle_sir_tester)
    websocket_api.async_register_command(hass, handle_pin_verifier)
    websocket_api.async_register_command(hass, handle_pin_definir)
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
    websocket_api.async_register_command(hass, handle_int_ecouter)
    websocket_api.async_register_command(hass, handle_discovery)
    websocket_api.async_register_command(hass, handle_get)
    websocket_api.async_register_command(hass, handle_set)
    websocket_api.async_register_command(hass, handle_delete)
    websocket_api.async_register_command(hass, handle_cfg_suivre)
    _LOGGER.info("Loggia : commandes WebSocket de configuration enregistrees")
