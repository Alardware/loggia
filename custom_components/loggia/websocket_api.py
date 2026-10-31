"""Commandes WebSocket Loggia : lecture et ecriture de la configuration utilisateur.

Regle de securite centrale : l'identite provient TOUJOURS de
`connection.user.id`, c'est-a-dire de la session WebSocket authentifiee par Home
Assistant. Le client ne peut pas designer un autre utilisateur — aucune commande
n'accepte de champ `user_id`. Un utilisateur ne lit et n'ecrit donc que sa propre
configuration, et les permissions Home Assistant restent celles de sa session.

Les 59 commandes, toutes prefixees `loggia/`, chacune une ligne de la table
`COMMANDES` (lot 8, ADR 0291). Le compte et la repartition entre ouvertes,
reservees et ouvertes au code de la maison sont verrouilles par
`test_websocket_api.py` et `test_websocket_registre.py` : une commande
nouvelle doit y etre rangee d'un cote ou de l'autre.

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
    notifications/destinataires -> qui recoit quoi : les personnes, leurs
                       telephones, les corrections, le repli (admin ; ADR 0301)
    collecte/sorti  -> « C'est sorti » pour un jour de ramassage, dans la
                       partie commune (tout compte ; ADR 0301)
  Les modules de regles — `etat` se lit de tout compte, `config` est reservee
  aux administrateurs : volets, fenetres, presence, nuit, veilles, scenarios,
  robots, distributeurs (ADR 0155 : `etat` rend un RESUME filtre par les
  droits du compte, jamais la configuration brute d'une automatisation).
    volets/manoeuvres       -> les lignes du journal qui parlent d'un volet,
                               pour l'historique de sa fiche (tous)
  Le chauffage (chantier Chauffage, § 8.2)
    chauffage/etat          -> l'etat calcule de chaque chauffage (tous)
    chauffage/main          -> reprendre la main, ou rendre au planning (tous,
                               bornes a ce que le compte peut piloter)
    chauffage/maison        -> Planning, Absence, Vacances (tous) ; Ete (admin)
    chauffage/config        -> plannings, temperatures, fenetre (admin)
    chauffage/historique    -> l'historique RESUME d'un chauffage, 1 ou 7 jours
                               (tous, sous leurs droits de lecture)
  Les prises (chantier Prises, spec 6.1)
    prises/etat             -> la configuration, et ce que chaque prise
                               publie : son type, sa protection, ses cycles
                               (tous)
    prises/config           -> proteger, imposer le type, prevenir a la fin
                               du cycle (admin)
  Le carnet des lumieres (chantier Lumieres, spec 6.2)
    lumieres/etat           -> le dernier niveau de chaque lampe (tous, sous
                               leurs droits de lecture)
    lumieres/journal        -> les notes d'une lampe depuis la veille (tous,
                               s'ils peuvent la lire)
  Le carnet de l'eau (chantier IoT, etape 3 ; I28, I29)
    eau/etat                -> pourquoi chaque vanne d'eau est fermee, ses
                               detecteurs, le journal du jour, la regle (tous,
                               sous leurs droits de lecture)
    eau/regle               -> « Fermer en cas de fuite » : cette valeur
                               seule, fondue au serveur dans `loggia_alertes`
                               (admin)
  Le mode enfant (chantier Mode enfant, spec 7.4)
    enfant/etat             -> les profils, leurs appareils, et ce que le mode
                               fait de chaque lecteur (tous, sous leurs droits
                               de lecture)
    enfant/config           -> les profils par piece : plafond, heures, temps
                               d'ecran (code de la maison, ou admin)
    enfant/lever            -> lever les limites 30 min, ou les retablir (code
                               de la maison, ou admin)
    enfant/repondre         -> accorder ou refuser la demande en cours (code
                               de la maison, ou admin)
    enfant/demander         -> l'enfant demande 15 min de plus, au telephone
                               (tous, bornes a ce qu'ils pilotent)
    enfant/dormir           -> dire a l'Echo la phrase du son pour dormir
                               (tous, bornes a ce qu'ils pilotent)
  Les gestes, ouverts a tout compte mais bornes a ce qu'il a le droit de
  piloter
    scenarios/lancer        -> lancer un scenario
    robots/lancer           -> le depart d'un robot : des pieces, des aires,
                               ou tout ; le carnet des passages le note
                               (chantier IoT, I3 A) ; un script maison de
                               l'aspirateur aussi (passe bis du 18/10, A)
    robots/scripts          -> designer un script par role dans la roue de la
                               popup : le role seul, fondu au serveur dans la
                               description de la maison (admin ; passe bis 2
                               de la tranche robots 2, 20/10)
    minuteurs/etat|poser|annuler -> le minuteur d'extinction d'un appareil
    sirene/tester           -> sonner trois secondes, tenu ici
  L'agencement, ouvert a tout compte (ADR 0125)
    scenarios/ordre         -> ranger les scenarios, et rien d'autre : des
                               identifiants que la maison connait (03/10)
  Les boutons sans fil
    interrupteurs/etat      -> ce que l'ecoute a vu passer
    interrupteurs/affecter  -> lier un geste a une action (admin)
    interrupteurs/ecouter   -> ouvrir l'ecoute cinq minutes (admin)
  Le code administrateur
    pin/verifier    -> verifie ici, essais limites
    pin/definir     -> le definir, hache (admin)
  Le profil du compte (ADR 0276)
    profils/moi     -> le profil Loggia du compte connecte, relie ou cree
                       d'office : ouverte a tout compte, mais ne touche qu'a
                       SON profil, designe par la connexion
  Les versions precedentes de la configuration (ADR 0285)
    versions/liste  -> les copies gardees avant les ecritures : date, compte,
                       taille, jamais leur contenu (admin)
    versions/rendre -> remettre une copie, `version` = son identifiant ; l'etat
                       du moment est garde d'abord (admin, comme l'import)

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
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback

from . import appareils
from .code_admin import LaissezPasser, Limiteur, VerrousParCompte, code_valide, hacher, longueur_de, passage_admin, verifier
from .discovery import async_index
from .refus import RefusNomme
from .scenarios import ScenariosInconnusError, controle_de
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
WS_VOL_MANOEUVRES = "loggia/volets/manoeuvres"
WS_FEN_ETAT = "loggia/fenetres/etat"
WS_FEN_CONFIG = "loggia/fenetres/config"
WS_PRE_ETAT = "loggia/presence/etat"
WS_PRE_CONFIG = "loggia/presence/config"
WS_NUI_ETAT = "loggia/nuit/etat"
WS_NUI_CONFIG = "loggia/nuit/config"
WS_VEI_ETAT = "loggia/veilles/etat"
WS_VEI_CONFIG = "loggia/veilles/config"
WS_COL_SORTI = "loggia/collecte/sorti"
WS_NOT_DESTINATAIRES = "loggia/notifications/destinataires"
WS_REG_ETAT = "loggia/regles/etat"
WS_REG_DEGELER = "loggia/regles/degeler"
WS_SCN_ETAT = "loggia/scenarios/etat"
WS_SCN_CONFIG = "loggia/scenarios/config"
WS_SCN_LANCER = "loggia/scenarios/lancer"
WS_SCN_ORDRE = "loggia/scenarios/ordre"
WS_ROB_ETAT = "loggia/robots/etat"
WS_ROB_CONFIG = "loggia/robots/config"
WS_ROB_LANCER = "loggia/robots/lancer"
WS_ROB_SCRIPTS = "loggia/robots/scripts"
WS_DIS_ETAT = "loggia/distributeurs/etat"
WS_DIS_CONFIG = "loggia/distributeurs/config"
WS_CHA_ETAT = "loggia/chauffage/etat"
WS_CHA_MAIN = "loggia/chauffage/main"
WS_CHA_MAISON = "loggia/chauffage/maison"
WS_CHA_CONFIG = "loggia/chauffage/config"
WS_CHA_HISTORIQUE = "loggia/chauffage/historique"
WS_PRI_ETAT = "loggia/prises/etat"
WS_PRI_CONFIG = "loggia/prises/config"
WS_LUM_ETAT = "loggia/lumieres/etat"
WS_LUM_JOURNAL = "loggia/lumieres/journal"
WS_EAU_ETAT = "loggia/eau/etat"
WS_EAU_REGLE = "loggia/eau/regle"
WS_ENF_ETAT = "loggia/enfant/etat"
WS_ENF_CONFIG = "loggia/enfant/config"
WS_ENF_LEVER = "loggia/enfant/lever"
WS_ENF_REPONDRE = "loggia/enfant/repondre"
WS_ENF_DEMANDER = "loggia/enfant/demander"
WS_ENF_DORMIR = "loggia/enfant/dormir"
WS_MIN_ETAT = "loggia/minuteurs/etat"
WS_MIN_POSER = "loggia/minuteurs/poser"
WS_MIN_ANNULER = "loggia/minuteurs/annuler"
WS_SIR_TESTER = "loggia/sirene/tester"
WS_PIN_VERIFIER = "loggia/pin/verifier"
WS_PIN_DEFINIR = "loggia/pin/definir"
WS_PROF_MOI = "loggia/profils/moi"
WS_VER_LISTE = "loggia/versions/liste"
WS_VER_RENDRE = "loggia/versions/rendre"


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
            # La cle APRES les deux-points, comme `not_admin` : l'ecran la
            # nomme dans sa langue sans lire le reste (audit du 03/10).
            return f"valeur trop volumineuse ({size} octets) : {key}"
        total += size
    if total > MAX_TOTAL_BYTES:
        return f"charge totale trop volumineuse ({total} octets)"
    return None


def _relayer(connection: websocket_api.ActiveConnection, msg: dict[str, Any], err: ValueError) -> None:
    """Un `ValueError` du composant, relaye a l'ecran (audit du 03/10).

    Son message partait tel quel, en francais sans accents, et l'ecran
    l'affichait dans les sept langues. Un refus PREVISIBLE — un plafond, une
    limite — porte desormais son code et ce qu'il nomme (`RefusNomme`,
    refus.py) : l'ecran le traduit (`src/refus.js`). Tout autre `ValueError`
    est un format que l'ecran n'envoie pas de lui-meme. Le message reste, pour
    le journal.
    """
    code = err.code if isinstance(err, RefusNomme) else "invalid_format"
    connection.send_error(msg["id"], code, str(err))


# ── Le registre des commandes (lot 8 de l'audit du 28/10, M12 ; ADR 0291) ──
#
# `async_register` faisait 1 262 lignes : chaque commande y etait declaree par
# ses decorateurs, son module resolu a la main, son « indisponible » recopie, et
# dix-sept parametres `acces_*` amenaient les modules. Chaque commande est
# desormais UNE ligne de la table `COMMANDES`, en bas : son type, son
# gestionnaire, son schema, son niveau d'acces, son module. Une seule boucle
# l'inscrit aupres de Home Assistant, avec les memes decorateurs qu'avant et
# dans le meme ordre : `require_admin`, puis le module (`not_available`), puis
# la garde du code de la maison.
#
# Les trois niveaux d'acces :
#   OUVERTE       - tout compte connecte ; la commande borne elle-meme a ce
#                   que le compte peut lire ou piloter quand il le faut.
#   ADMIN         - `require_admin` : ce qui ECRIT la maison.
#   CODE_OU_ADMIN - les gestes du parent (chantier Mode enfant, E2 B) : pas de
#                   `require_admin` - une tablette de famille porte un compte
#                   ordinaire, et c'est le code de la maison qui dit que c'est
#                   le parent. Le code verifie (`loggia/pin/verifier`) vaut
#                   laissez-passer cinq minutes pour CE compte, le meme que pour
#                   le passage vers un profil Admin ; un administrateur s'en
#                   passe. Le refus porte le code que l'ecran traduit deja
#                   (`code_admin_requis`, src/refus.js).
# tests/python/test_websocket_registre.py epingle, pour chaque commande, son
# nom, son niveau et ses champs - releves sur l'ancien code.
OUVERTE = "ouverte"
ADMIN = "admin"
CODE_OU_ADMIN = "code_ou_admin"

# Ce que repond une commande dont le module manque - une installation sans
# MQTT, une mise en place qui a echoue : une erreur claire plutot que de
# manquer a l'appel.
INDISPONIBLE = {
    "interrupteurs": "ecoute des interrupteurs indisponible",
    "volets": "regles de volets indisponibles",
    "fenetres": "regle des fenetres indisponible",
    "presence": "regle de presence indisponible",
    "nuit": "regles de nuit indisponibles",
    "veilles": "veilles indisponibles",
    "regles": "socle des regles indisponible",
    "scenarios": "scenarios indisponibles",
    "robots": "planning des robots indisponible",
    "distributeurs": "distributeur indisponible",
    "chauffage": "chauffage indisponible",
    "prises": "prises indisponibles",
    "lumieres": "carnet des lumieres indisponible",
    "eau": "carnet de l'eau indisponible",
    "enfant": "mode enfant indisponible",
    "minuteurs": "minuteurs indisponibles",
    "sirene": "test de sirene indisponible",
}

# Les roles qu'un script d'aspirateur peut tenir dans la roue de la popup.
ROLES_ROBOT = ["nettoyer_tout", "pieces_selectionnees", "pause", "reprendre", "retour_base", "localiser"]


@dataclass(frozen=True)
class Commande:
    """Une commande WebSocket, declaree : rien d'autre ne l'inscrit."""

    type: str
    # `gerer(ctx, connection, msg, module)` : `module` est celui que nomme
    # `module` ci-dessous, deja resolu - ou None si la commande n'en a pas.
    gerer: Callable[..., Any]
    # Le schema, hors `type`.
    schema: dict[Any, Any] = field(default_factory=dict)
    acces: str = OUVERTE
    # Le module de `hass.data[DOMAIN]` que la commande sert, resolu a l'appel.
    module: str | None = None
    # `False` : un gestionnaire `@callback`, qui repond sans attendre.
    asynchrone: bool = True


class Contexte:
    """Ce que les gestionnaires partagent, pour la vie du process.

    Le code administrateur (18/09) se verifie ICI, et n'est jamais renvoye.
    Tout compte connecte peut le tenter (c'est son usage : basculer de profil
    sur une tablette de famille) ; les essais rates sont comptes par compte et
    bloquent. Le definir reste aux administrateurs.
    """

    def __init__(self, hass: HomeAssistant, store: LoggiaStore, acces: Callable[[str], Any] | None) -> None:
        self.hass = hass
        self.store = store
        self._acces = acces
        self.limiteur = Limiteur()
        # Un compte a la fois : sans ce verrou, des tentatives envoyees en rafale
        # passaient toutes avant que le blocage ne tombe (audit 18/09). Le verrou
        # d'un compte s'en va quand plus personne ne l'attend (28/10, ADR 0279) :
        # le dictionnaire grandissait jusqu'au redemarrage.
        self.verrous_pin = VerrousParCompte()
        # Ce qu'un code verifie ouvre : le passage vers un profil Admin, pour
        # quelques minutes et pour ce compte-la seulement (24/09, plan M14).
        self.laissez_passer = LaissezPasser()

    def module(self, nom: str) -> Any:
        """Le module tel qu'il est MAINTENANT : il se recree a chaque chargement de l'integration."""
        return self._acces(nom) if self._acces else None


@callback
def async_register(hass: HomeAssistant, store: LoggiaStore, acces: Callable[[str], Any] | None = None) -> None:
    """Declare les commandes aupres du serveur WebSocket.

    `acces` est un APPELABLE, `acces("volets")` rend le module des volets :
    ces commandes ne s'enregistrent qu'une fois pour la vie du process, alors
    que les modules se recreent a chaque chargement de l'integration. On les
    resout donc au moment de l'appel. Un module peut manquer - une
    installation sans MQTT, ou une mise en place qui a echoue : ses commandes
    repondent alors une erreur claire plutot que de manquer a l'appel.
    """
    ctx = Contexte(hass, store, acces)
    for commande in COMMANDES:
        websocket_api.async_register_command(hass, _gestionnaire(ctx, commande))
    _LOGGER.info("Loggia : commandes WebSocket de configuration enregistrees")


def _gestionnaire(ctx: Contexte, commande: Commande):
    """Le gestionnaire que Home Assistant appelle, avec les decorateurs d'avant le registre."""
    nom = "handle_" + commande.type.removeprefix("loggia/").replace("/", "_")
    if commande.asynchrone:
        async def gestionnaire(hass, connection, msg):
            module = None
            if commande.module:
                module = ctx.module(commande.module)
                if module is None:
                    connection.send_error(msg["id"], "not_available", INDISPONIBLE[commande.module])
                    return
            if commande.acces == CODE_OU_ADMIN and not _code_ou_admin(ctx, connection, msg):
                return
            await commande.gerer(ctx, connection, msg, module)

        gestionnaire.__name__ = gestionnaire.__qualname__ = nom
        gestionnaire = websocket_api.async_response(gestionnaire)
    else:
        def gestionnaire(hass, connection, msg):
            commande.gerer(ctx, connection, msg, None)

        gestionnaire.__name__ = gestionnaire.__qualname__ = nom
        gestionnaire = callback(gestionnaire)
    if commande.acces == ADMIN:
        gestionnaire = websocket_api.require_admin(gestionnaire)
    return websocket_api.websocket_command({vol.Required("type"): commande.type, **commande.schema})(gestionnaire)


def _code_ou_admin(ctx: Contexte, connection, msg) -> bool:
    """Le parent : administrateur, ou le code de la maison verifie il y a moins de cinq minutes."""
    if connection.user.is_admin or ctx.laissez_passer.valide(connection.user.id):
        return True
    connection.send_error(msg["id"], "code_admin_requis", "le code de la maison est requis pour le mode enfant")
    return False


# ── Les gestionnaires communs : l'etat et la configuration d'un module ──────

def _etat(par_compte: bool = False):
    """`etat` d'un module, tel qu'il le rend. `par_compte` : sous les droits de
    LECTURE du compte (audit du 19/10) - le module tait ce qu'il ne lit pas. Le
    compte vient de la session, jamais du message."""
    async def handle_etat(ctx, connection, msg, module):
        if par_compte:
            connection.send_result(msg["id"], await module.async_etat(connection.user))
        else:
            connection.send_result(msg["id"], await module.async_etat())

    return handle_etat


def _config(etat: str | None = None):
    """`config` d'un module : ecrire sa configuration, celle de la maison.

    Les plafonds de `store.py`, et les refus nommes du module, sont relayes
    (audit du 03/10) : sans ce relais, le refus remonterait en erreur inconnue
    et l'ecran continuerait d'afficher un reglage que le serveur n'a pas garde.
    Un plafond dit `payload_too_large` et nomme sa cle ; une valeur illisible
    n'en est pas un.

    `etat` : rendre l'etat avec, pour que l'ecran redessine sans attendre son
    sondage - `"seul"` tel quel, `"compte"` sous les droits du compte.
    """
    async def handle_config(ctx, connection, msg, module):
        try:
            config = await module.async_enregistrer(msg["patch"])
        except ValueError as err:
            _relayer(connection, msg, err)
            return
        if etat == "seul":
            connection.send_result(msg["id"], {"config": config, "etat": await module.async_etat()})
        elif etat == "compte":
            connection.send_result(msg["id"], {"config": config, "etat": await module.async_etat(connection.user)})
        else:
            connection.send_result(msg["id"], {"config": config})

    return handle_config


# ── La configuration ───────────────────────────────────────────────────────

async def handle_get(ctx, connection, msg, module):
    config = await ctx.store.async_get_user(connection.user.id)
    connection.send_result(msg["id"], {"config": config, "user": _user_info(connection)})


async def _refus_profil_admin(ctx: Contexte, patch, connection) -> str:
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

    Le profil d'un ECRAN passe aussi par sa fiche d'appareil (ADR 0220) :
    chaque profil qu'elle vise est garde de la meme facon.
    """
    vises = appareils.profils_vises(patch.get(appareils.CLE_APPAREILS))
    if "loggia_active_user" not in patch and not vises:
        return ""
    if connection.user.is_admin:
        return ""
    if ctx.laissez_passer.valide(connection.user.id):
        return ""
    try:
        profils = await ctx.store.async_get_shared("loggia_users", None)
    except Exception:  # noqa: BLE001
        _LOGGER.warning(
            "Loggia : liste des profils illisible, le passage Admin est refuse",
            exc_info=True)
        return "le code administrateur n'a pas pu etre verifie"
    if not (passage_admin(patch, profils)
            or any(passage_admin({"loggia_active_user": v}, profils) for v in vises)):
        return ""
    return "le code administrateur est requis pour ce profil"


async def handle_set(ctx, connection, msg, module):
    patch: dict[str, Any] = msg["config"]
    if any(not isinstance(k, str) for k in patch):
        connection.send_error(msg["id"], "invalid_format", "cles non textuelles")
        return
    problem = _payload_too_big(patch)
    if problem:
        connection.send_error(msg["id"], "payload_too_large", problem)
        return
    refus = await _refus_profil_admin(ctx, patch, connection)
    if refus:
        # Son code a lui (audit du 03/10) : `not_admin` est celui des
        # reglages de la maison, et l'ecran departageait les deux refus par
        # une expression sur ce motif en francais. Le motif reste, pour le
        # journal.
        connection.send_error(msg["id"], "code_admin_requis", refus)
        return
    try:
        # Le role vient de la connexion authentifiee, jamais du message :
        # un client ne doit pas pouvoir se declarer administrateur.
        config = await ctx.store.async_set_user(
            connection.user.id,
            patch,
            replace=bool(msg.get("replace")),
            is_admin=bool(connection.user.is_admin),
            # Seulement pour la version precedente gardee avant
            # l'ecriture (ADR 0285) : qui a ecrit.
            compte=connection.user.name,
        )
    except MaisonReserveeError as err:
        # Un code a part : ce n'est pas la forme du message qui cloche,
        # c'est le droit de l'ecrire. Le dashboard le dit tel quel
        # plutot que d'accuser un « format invalide » incomprehensible.
        connection.send_error(msg["id"], "not_admin", str(err))
        return
    except ValueError as err:
        # Les plafonds du magasin disent `payload_too_large` ; le reste est
        # un format invalide (audit du 03/10).
        _relayer(connection, msg, err)
        return
    connection.send_result(msg["id"], {"config": config})


async def handle_delete(ctx, connection, msg, module):
    await ctx.store.async_delete_user(connection.user.id)
    connection.send_result(msg["id"], {"config": {}})


# Suivre la configuration (22/09, ADR 0067). Un ecran s'abonne une fois ; a
# chaque ecriture du magasin il apprend QUI a change (le compte) et QUELLES
# cles — jamais les valeurs : il relit ensuite par `loggia/config/get`, sous
# ses propres droits. Ouvert a tout compte : il n'y transite que des noms de
# cles.
async def handle_cfg_suivre(ctx, connection, msg, module):
    from homeassistant.helpers.dispatcher import async_dispatcher_connect

    hass = ctx.hass

    @callback
    def transmettre(changement):
        connection.send_message(websocket_api.event_message(msg["id"], changement))

    connection.subscriptions[msg["id"]] = async_dispatcher_connect(hass, SIGNAL_CONFIG, transmettre)
    connection.send_result(msg["id"])


def handle_discovery(ctx, connection, msg, module):
    user = connection.user
    # Le compte vient de la connexion authentifiee, jamais du message : il
    # sert a retirer de la reponse ce que ce compte n'a pas le droit de lire.
    connection.send_result(msg["id"], {"index": async_index(ctx.hass, user)})


# ── Interrupteurs sans fil ────────────────────────────────────────────────
# Lecture ouverte : des noms d'appareils et de boutons, comme la decouverte.
# Ecriture reservee aux administrateurs — une affectation appelle un service
# Home Assistant, et un compte ordinaire ne doit pas pouvoir se donner ce
# pouvoir par ce detour. L'ecoute d'apprentissage s'ouvre pour un temps compte,
# ou se coupe : reservee comme l'affectation, c'est un reglage de la maison.
async def handle_int_affecter(ctx, connection, msg, interrupteurs):
    try:
        table = await interrupteurs.async_affecter(
            msg["cle"], msg["action"], msg["gestes"], msg.get("nom") or ""
        )
    except ValueError as err:
        # Un plafond du magasin, un geste illisible, un service hors des
        # domaines permis : son code, et ce qu'il nomme (audit du 03/10).
        _relayer(connection, msg, err)
        return
    connection.send_result(msg["id"], {"affectations": table})


async def handle_int_ecouter(ctx, connection, msg, interrupteurs):
    connection.send_result(msg["id"], {"ecoute": interrupteurs.ecouter(msg["duree"])})


# Les manoeuvres d'un volet (chantier Volets, spec 6.5) : des lignes du
# journal, en lecture, ouvertes a tout compte comme l'etat — sous ses
# droits de LECTURE (audit du 19/10) : une entite que le compte ne lit pas
# se refuse en `unauthorized`, comme le journal d'une lampe. Le compte
# vient de la session, jamais du message. `depuis` : des secondes depuis 1970.
async def handle_vol_manoeuvres(ctx, connection, msg, volets):
    try:
        manoeuvres = await volets.async_manoeuvres(msg["entity_id"], msg["depuis"], connection.user)
    except PermissionError as err:
        connection.send_error(msg["id"], "unauthorized", str(err))
        return
    connection.send_result(msg["id"], manoeuvres)


# ── Le socle : le journal de la maison, et ce qui retient en ce moment ──
# Toutes les regles melees, dans l'ordre du temps — le seul outil de
# debogage d'un non-technicien. Et le PRESENT : quand rien ne bouge, la
# question n'est pas ce qui s'est passe mais ce qui retient — une main,
# une tenue, un ordre en attente.
async def handle_reg_etat(ctx, connection, msg, regles):
    # Les ordres en attente vivent chez les volets : le seul module qui en a.
    volets = ctx.module("volets")
    attentes = getattr(volets, "attente", None) if volets is not None else None
    # Sous les droits de LECTURE du compte (28/10, ADR 0279), comme les
    # lumieres, le chauffage et le mode enfant : le journal nommait toutes
    # les entites de la maison a tout compte connecte.
    from .discovery import _lecture_autorisee
    from .regles import cles_lisibles, journal_lisible

    lecture = _lecture_autorisee(connection.user)
    journal = await regles.journal(limite=msg.get("limite", 200), module=msg.get("module"))
    connection.send_result(msg["id"], {
        "journal": journal_lisible(journal, lecture),
        "gels": cles_lisibles(regles.gels(), lecture),
        "tenues": cles_lisibles(regles.tenues_toutes(), lecture),
        "attentes": {h: dict(o) for h, o in cles_lisibles(attentes, lecture).items()},
        "calme": await regles.calme(),
    })


# Rendre la main aux regles avant l'heure. C'est defaire ce que quelqu'un
# a fait a la main : un geste d'administrateur, et il se voit au journal
# comme les autres.
async def handle_reg_degeler(ctx, connection, msg, regles):
    haid = msg["entity_id"]
    etait = regles.gele(haid)
    regles.degeler(haid)
    await regles.noter("regles", "main", "rendre la main", cibles=[haid],
                       motif="depuis le journal")
    connection.send_result(msg["id"], {"entity_id": haid, "etait_gele": etait,
                                       "gels": regles.gels()})


# ── Qui recoit quoi, et la collecte (chantier G2 ; ADR 0301) ──────────────
# Les destinataires des notifications, pour Parametres > Alertes : les
# personnes, leurs telephones, ce qui est corrige — aux administrateurs, qui
# seuls corrigent `loggia_alertes`.
async def handle_not_destinataires(ctx, connection, msg, regles):
    connection.send_result(msg["id"], await regles.async_destinataires())


# « C'est sorti », depuis le bandeau de l'Accueil : ouvert a tout compte —
# sortir les bacs n'est pas un privilege. Le meme endroit que le bouton de la
# notification (`loggia_collecte`, la partie commune).
async def handle_col_sorti(ctx, connection, msg, veilles):
    try:
        etat = await veilles.async_sorti(msg["date"], msg["sorti"])
    except ValueError as err:
        _relayer(connection, msg, err)
        return
    connection.send_result(msg["id"], etat)


# ── Les scenarios (ADR 0027) ───────────────────────────────────────────────
# Lire et lancer sont ouverts a tout compte connecte : lancer, c'est
# appeler des services que Home Assistant lui permet deja. Ecrire — les
# scenarios sont ceux de la maison — reste aux administrateurs, sauf
# l'ORDRE (audit du 03/10) : ranger est de l'agencement, et passe par sa
# propre commande.
#
# Ranger les scenarios (audit du 03/10). L'ordre passait par `config`,
# reservee : sur un compte ordinaire la fleche de la vue etait refusee, et
# l'ecran avalait le refus. Or l'ordre est de l'AGENCEMENT (ADR 0125),
# ouvert a tout compte comme ranger ses cartes. Cette commande ne fait que
# ca : aucun scenario dans le message, rien que des identifiants que la
# maison connait — un inconnu fait tout refuser en se nommant
# (`not_found`). Le schema borne le reste : du texte, 64 au plus, le
# double de ce que la maison peut compter (8 de Loggia + 24 personnels).
async def handle_scn_ordre(ctx, connection, msg, scenarios):
    try:
        config = await scenarios.async_ordonner(msg["ordre"])
    except ScenariosInconnusError as err:
        connection.send_error(msg["id"], "not_found", str(err))
        return
    except ValueError as err:
        # Par `_relayer`, comme ses voisines (relecture du 03/10) : un
        # plafond du magasin leve `payload_too_large` en nommant
        # `loggia_scenarios`, et repartait d'ici en `invalid_format` — le
        # code et la cle perdus, l'ecran disait une panne. Un ordre
        # illisible (un doublon) reste `invalid_format`.
        _relayer(connection, msg, err)
        return
    # L'etat avec, deja range : l'ecran redessine sans attendre son sondage.
    connection.send_result(msg["id"], {"ordre": config["ordre"], "etat": await scenarios.async_etat()})


# Le scenario se nomme `scenario`, JAMAIS `id` (audit du 03/10) : `id` est
# le numero du message, que la bibliotheque du navigateur ecrase avec le
# sien, et que Home Assistant exige entier. Le schema etendu remplacait la
# cle de base par `str` : tout lancement depuis l'ecran etait refuse en
# « invalid_format ». tests/python/test_websocket_api_execution.py refuse
# desormais tout schema qui declare `id`.
async def handle_scn_lancer(ctx, connection, msg, scenarios):
    # La main de celui qui appuie : les regles la verront comme telle.
    # Ses permissions d'entite, pas celles du composant (audit 18/09).
    resultat = await scenarios.async_lancer(msg["scenario"], user_id=connection.user.id,
                                            controle=controle_de(connection.user))
    if resultat is None:
        connection.send_error(msg["id"], "not_found", "scenario inconnu : %s" % msg["scenario"])
        return
    connection.send_result(msg["id"], resultat)


# ── Le code administrateur (18/09) : verifie ICI, jamais renvoye ───────────
async def handle_pin_verifier(ctx, connection, msg, module):
    limiteur, verrous_pin, laissez_passer = ctx.limiteur, ctx.verrous_pin, ctx.laissez_passer
    uid = connection.user.id
    async with verrous_pin.de(uid):
        attente = limiteur.bloque_pendant(uid)
        if attente:
            connection.send_result(msg["id"], {"ok": False, "bloque": attente})
            return
        pin = msg["pin"]
        enregistrement = await ctx.store.async_get_code_admin()
        if enregistrement is None:
            # Jamais defini : RIEN ne passe (28/10, ADR 0279). Le code par
            # defaut, `0000`, ouvrait le laissez-passer a tout compte
            # connecte — donc les reglages du mode enfant, dont la phrase
            # que l'Echo execute. Le refus se nomme : l'ecran propose alors
            # de creer le code a un administrateur, et le dit aux autres.
            # Pas un essai rate : il n'y avait rien a deviner.
            connection.send_error(msg["id"], "code_non_defini",
                                  "aucun code administrateur n'est defini : un administrateur de Home Assistant doit le creer")
            return
        # PBKDF2 pese quelques dizaines de millisecondes : hors de la boucle.
        ok = await ctx.hass.async_add_executor_job(verifier, pin, enregistrement)
        if ok:
            if enregistrement is not None and longueur_de(enregistrement) is None:
                # Un code d'avant le 27/10 : sa longueur s'apprend ici, a
                # la premiere reussite (ADR 0278). Ensuite le pave verifie
                # seul au bon chiffre, sans bouton. Par le magasin, sous
                # son verrou : un code redefini pendant PBKDF2 reste le
                # nouveau.
                await ctx.store.async_apprendre_longueur_code(enregistrement["sel"], enregistrement["hache"], len(pin))
            limiteur.reussi(uid)
            laissez_passer.accorder(uid)
            connection.send_result(msg["id"], {"ok": True})
            return
        duree = limiteur.rate(uid)
        if duree:
            _LOGGER.warning("Loggia : code administrateur — trop d'essais rates, compte bloque %d s", duree)
        connection.send_result(msg["id"], {"ok": False, "bloque": duree})


async def handle_pin_definir(ctx, connection, msg, module):
    if not code_valide(msg["pin"]):
        connection.send_error(msg["id"], "invalid_format", "le code fait de quatre a huit chiffres")
        return
    enregistrement = await ctx.hass.async_add_executor_job(hacher, msg["pin"])
    await ctx.store.async_set_code_admin(enregistrement)
    # Un nouveau code ferme ce que l'ancien avait ouvert, et les rates
    # comptes contre l'ancien ne valent plus (28/10, ADR 0279).
    ctx.laissez_passer.tout_retirer()
    ctx.limiteur.tout_oublier()
    connection.send_result(msg["id"], {"defini": True})


async def handle_prof_moi(ctx, connection, msg, module):
    """Le profil du compte connecte (ADR 0276) : « s'il est connecte a
    Home Assistant avec son compte, ca doit charger son profil, point ».

    Ouverte a tout compte, a dessein : une epouse au compte ordinaire doit
    retrouver SON profil. Rien ne vient du message — ni compte, ni nom, ni
    role : tout est lu sur la connexion, et un profil Admin ne se donne qu'a
    un administrateur de Home Assistant."""
    user = connection.user
    try:
        res = await ctx.store.async_profil_du_compte(user.id, user.name or "", bool(user.is_admin))
    except ValueError as err:
        _relayer(connection, msg, err)
        return
    connection.send_result(msg["id"], res)


# ── Le planning des robots (ADR 0043) ──────────────────────────────────────
# Lire est ouvert a tout compte connecte ; ecrire — le planning est celui
# de la maison — reste aux administrateurs. Le carnet des passages (I3 A)
# se lit sous les droits de LECTURE du compte, et `lancer` — le depart
# d'un robot, le geste de tous les jours — est borne a ce qu'il PILOTE.
async def handle_rob_lancer(ctx, connection, msg, robots):
    try:
        etat = await robots.async_lancer_depart(msg["robot"], msg["zones"], user=connection.user,
                                                controle=controle_de(connection.user),
                                                **{k: msg[k] for k in ("script", "role", "localiser") if k in msg})
    except PermissionError as err:
        connection.send_error(msg["id"], "unauthorized", str(err))
        return
    except ValueError as err:
        # Injoignable, deja en route, des pieces que l'integration ne sait
        # pas viser, une aire qui n'est pas la sienne, un appel refuse : le
        # refus porte son code, l'ecran le dit (src/refusrobots.js).
        _relayer(connection, msg, err)
        return
    connection.send_result(msg["id"], etat)


# La roue de la popup designe un script par ROLE (passe bis 2 de la tranche
# robots 2, 20/10 ; relecture de controle) : le role part SEUL, et le serveur
# le fond dans la description de la maison telle qu'elle est sur le disque.
# L'ecran reecrivait `loggia_entities` ENTIERE par `config/set` depuis son
# cache — vide ou perime tant que `config/get` n'avait pas repondu —, et une
# designation depuis un onglet lent effacait les dix-neuf autres cles. La
# description est celle de la maison : administrateurs seulement. Rend l'etat
# des robots, ou la roue lit les roles designes.
async def handle_rob_scripts(ctx, connection, msg, robots):
    try:
        etat = await robots.async_designer_script(msg["role"], msg["script"], user=connection.user)
    except ValueError as err:
        # Un script qui n'en est pas un, une description illisible : rien ne
        # s'ecrit, et le refus porte son code (un plafond du magasin aussi).
        _relayer(connection, msg, err)
        return
    connection.send_result(msg["id"], etat)


# ── Le distributeur de croquettes (05/10, ADR 0155) ────────────────────────
# `etat` est ouverte a tout compte connecte, comme celui des robots, mais
# ce n'est pas `automation/config` (reserve aux administrateurs par Home
# Assistant) par un detour : un RESUME des automatisations qui commandent
# le distributeur, filtre par ce que CE compte peut lire et piloter.
# `detail` : la fiche ouverte — la Tuya officielle n'est interrogee que la.
# `config` ecrit le planning de la maison (douze repas au plus : le refus
# nomme sa limite) : administrateurs seulement.
async def handle_dis_etat(ctx, connection, msg, distributeurs):
    connection.send_result(msg["id"], await distributeurs.async_etat(
        connection.user, detail=bool(msg.get("detail"))))


# ── Le chauffage (chantier Chauffage, § 8.2) ───────────────────────────────
# `etat` et `main` sont ouverts a tout compte connecte : reprendre la main
# sur un radiateur est un geste de tous les jours. Mais bornes a ce que CE
# compte peut lire et PILOTER — le moteur commande lui-meme, la
# verification que Home Assistant ferait d'un appel direct n'a pas lieu
# (comme les minuteurs). `maison` est ouverte pour Planning, Absence et
# Vacances ; Ete est une saison, il reste aux administrateurs (§ 8.3) et
# le refus le nomme. `config` ecrit la maison : administrateurs seulement ;
# les refus nommes du planning (`chauffage_config.py`) sont relayes.
# Les temperatures s'y disent en °C (ADR 0128) : l'ecran convertit.
#
# Le chauffage se nomme `chauffage`, JAMAIS `id` : `id` est le numero du
# message (voir le lancement d'un scenario plus haut).
async def handle_cha_main(ctx, connection, msg, chauffage):
    controle = controle_de(connection.user)
    try:
        if msg.get("reprendre"):
            await chauffage.async_rendre_au_planning(msg["chauffage"], controle=controle)
        else:
            await chauffage.async_reprendre_la_main(
                msg["chauffage"], mode=msg.get("mode"), temperature=msg.get("temperature"),
                fin=msg["fin"], par=connection.user.id, nom=connection.user.name, controle=controle)
    except PermissionError as err:
        connection.send_error(msg["id"], "unauthorized", str(err))
        return
    except ValueError as err:
        # Un mode que ce chauffage ne comprend pas, une consigne hors
        # bornes : le refus porte son code et nomme ce qui ne va pas.
        _relayer(connection, msg, err)
        return
    connection.send_result(msg["id"], await chauffage.async_etat(connection.user))


async def handle_cha_maison(ctx, connection, msg, chauffage):
    try:
        # Le role vient de la connexion authentifiee, jamais du message.
        await chauffage.async_maison(msg["mode"], msg.get("fin"), admin=bool(connection.user.is_admin),
                                     nom=connection.user.name)
    except MaisonReserveeError as err:
        # La forme du magasin : `not_admin`, la cle apres les deux-points.
        connection.send_error(msg["id"], "not_admin", str(err))
        return
    except ValueError as err:
        _relayer(connection, msg, err)
        return
    connection.send_result(msg["id"], await chauffage.async_etat(connection.user))


# L'historique d'un chauffage, RESUME par le serveur : la fiche lisait sept
# jours d'un `climate` avec tous ses attributs (3 a 14 Mo pour un poele ;
# audit du 19/10). Ouvert a tout compte, sous ses droits de LECTURE — comme
# `etat`. L'enregistreur arrete : « historique_indisponible », la fiche
# retombe sur `history/period`.
async def handle_cha_historique(ctx, connection, msg, chauffage):
    try:
        resultat = await chauffage.async_historique(msg["chauffage"], msg["jours"], connection.user)
    except PermissionError as err:
        connection.send_error(msg["id"], "unauthorized", str(err))
        return
    except ValueError as err:
        _relayer(connection, msg, err)
        return
    except Exception:  # noqa: BLE001
        _LOGGER.warning("Loggia chauffage : historique illisible", exc_info=True)
        connection.send_error(msg["id"], "historique_indisponible", "historique illisible")
        return
    connection.send_result(msg["id"], resultat)


# ── Le carnet des lumieres (chantier Lumieres, spec 6.2) ───────────────────
# Deux lectures, ouvertes a tout compte connecte, sous ses droits de
# LECTURE (`_lecture_autorisee`, la garde de l'etat du chauffage) : `etat`
# tait les lampes que le compte ne lit pas, `journal` les refuse. Le compte
# vient de la session, jamais du message.
async def handle_lum_journal(ctx, connection, msg, lumieres):
    try:
        journal = await lumieres.async_journal(msg["entity_id"], connection.user)
    except PermissionError as err:
        connection.send_error(msg["id"], "unauthorized", str(err))
        return
    connection.send_result(msg["id"], journal)


# ── Le carnet de l'eau (chantier IoT, etape 3 ; I28, I29) ──────────────────
# `etat` se lit de tout compte, sous ses droits de LECTURE, comme le carnet
# des lumieres. `regle` est « Fermer en cas de fuite » (I29) : la bascule de
# la popup. Elle ne prend QU'UN booleen et ne touche QUE
# `actions.vanne.actif`, fondue au serveur dans `loggia_alertes` telle
# qu'elle est sur le disque, sous le verrou du magasin - jamais la cle
# entiere depuis le cache d'un onglet. C'est un reglage de la maison :
# administrateurs seulement.
async def handle_eau_regle(ctx, connection, msg, eau):
    try:
        etat = await eau.async_regler(msg["actif"], user=connection.user)
    except ValueError as err:
        # Un plafond du magasin, une valeur refusee : rien ne s'ecrit, et le
        # refus nomme la cle (`loggia_alertes`).
        _relayer(connection, msg, err)
        return
    connection.send_result(msg["id"], etat)


# ── Le mode enfant (chantier Mode enfant, spec 7.4) ────────────────────────
# Trois regimes. `etat` se lit de tout compte, sous ses droits de LECTURE
# (le module tait les lecteurs que le compte ne lit pas). `demander` et
# `dormir` sont les gestes de la chambre : ouverts, bornes a ce que le
# compte PILOTE. `config`, `lever` et `repondre` sont les gestes du PARENT
# (E2 B) : CODE_OU_ADMIN, gardes par `_code_ou_admin`.
async def handle_enf_config(ctx, connection, msg, enfant):
    # Le laissez-passer du code ouvre les PROFILS du mode enfant, rien d'autre (passe bis, 17/10) : « Observer
    # sans agir » (`simulation`) est un reglage de la MAISON, aux administrateurs comme par `config/set` ; une cle
    # que l'ecran n'envoie pas est un format inconnu — le module l'ignorerait en silence, on la refuse ici.
    inconnues = [k for k in msg["patch"] if k not in ("profils", "simulation")]
    if inconnues:
        connection.send_error(msg["id"], "invalid_format", "mode enfant : clé inconnue : %s" % ", ".join(sorted(map(str, inconnues))))
        return
    if "simulation" in msg["patch"] and not connection.user.is_admin:
        connection.send_error(msg["id"], "unauthorized", "« Observer sans agir » du mode enfant est aux administrateurs")
        return
    try:
        config = await enfant.async_enregistrer(msg["patch"])
    except ValueError as err:
        # Une valeur que l'ecran n'envoie pas, ou un plafond du magasin :
        # son code, et ce qu'il nomme.
        _relayer(connection, msg, err)
        return
    # L'etat avec : l'ecran redessine sans attendre son sondage.
    connection.send_result(msg["id"], {"config": config, "etat": await enfant.async_etat(connection.user)})


# Le profil se nomme `profil`, JAMAIS `id` : `id` est le numero du message
# (voir le lancement d'un scenario plus haut). 30 leve les limites une
# demi-heure, 0 les retablit (E14).
async def handle_enf_lever(ctx, connection, msg, enfant):
    try:
        etat = await enfant.async_lever(msg["profil"], msg["minutes"], connection.user)
    except ValueError as err:
        _relayer(connection, msg, err)
        return
    connection.send_result(msg["id"], etat)


async def handle_enf_repondre(ctx, connection, msg, enfant):
    try:
        etat = await enfant.async_repondre(msg["profil"], msg["accorder"], connection.user)
    except ValueError as err:
        # Aucune demande en attente : le refus du module, nomme.
        _relayer(connection, msg, err)
        return
    connection.send_result(msg["id"], etat)


async def handle_enf_demander(ctx, connection, msg, enfant):
    try:
        etat = await enfant.async_demander(msg["profil"], controle=controle_de(connection.user), user=connection.user)
    except PermissionError as err:
        connection.send_error(msg["id"], "unauthorized", str(err))
        return
    except ValueError as err:
        # Aucun ecran bloque par le temps, une demande deja en cours.
        _relayer(connection, msg, err)
        return
    connection.send_result(msg["id"], etat)


async def handle_enf_dormir(ctx, connection, msg, enfant):
    try:
        etat = await enfant.async_dormir(msg["profil"], msg["son"], controle=controle_de(connection.user),
                                         user=connection.user)
    except PermissionError as err:
        connection.send_error(msg["id"], "unauthorized", str(err))
        return
    except ValueError as err:
        # Un son que le profil n'a pas, aucune jumelle qui reponde.
        _relayer(connection, msg, err)
        return
    connection.send_result(msg["id"], etat)


# ── Les versions precedentes de la configuration (29/10, ADR 0285) ─────────
# Reservees aux administrateurs de Home Assistant, comme l'import et la
# remise a zero qu'elles completent : en rendre une remplace la
# configuration de toute la maison. Le magasin fait tout sous son verrou ;
# ses refus portent leur code (`versions_indisponibles`,
# `version_inconnue`, `version_illisible`). L'identifiant d'une copie se
# nomme `version` : `id` est le numero du message.
async def handle_ver_liste(ctx, connection, msg, module):
    try:
        liste = await ctx.store.async_versions()
    except ValueError as err:
        _relayer(connection, msg, err)
        return
    connection.send_result(msg["id"], {"versions": liste})


async def handle_ver_rendre(ctx, connection, msg, module):
    try:
        # Le nom vient de la connexion : il dit, sur la copie gardee
        # avant le retour, qui l'a fait.
        resultat = await ctx.store.async_rendre_version(msg["version"], compte=connection.user.name)
    except ValueError as err:
        _relayer(connection, msg, err)
        return
    connection.send_result(msg["id"], resultat)


# ── Les minuteurs d'extinction (21/09) ─────────────────────────────────────
# Ouverts a tout compte connecte — c'est le geste d'une fiche de lampe —,
# mais seulement sur ce que ce compte a le droit de PILOTER : le composant
# eteint lui-meme, la verification de Home Assistant n'aurait pas lieu
# (audit 18/09). Qui pose le minuteur vient de la session, jamais du message.
async def handle_min_etat(ctx, connection, msg, minuteurs):
    connection.send_result(msg["id"], minuteurs.async_etat(controle_de(connection.user)))


async def handle_min_poser(ctx, connection, msg, minuteurs):
    try:
        etat = await minuteurs.async_poser(msg["entity_id"], msg["minutes"], par=connection.user.id,
                                           controle=controle_de(connection.user))
    except PermissionError as err:
        connection.send_error(msg["id"], "unauthorized", str(err))
        return
    except ValueError as err:
        # Un appareil deja eteint se refuse par son code (`minuteur_deja_eteint`).
        _relayer(connection, msg, err)
        return
    connection.send_result(msg["id"], etat)


async def handle_min_annuler(ctx, connection, msg, minuteurs):
    try:
        etat = await minuteurs.async_annuler(msg["entity_id"], controle=controle_de(connection.user))
    except PermissionError as err:
        connection.send_error(msg["id"], "unauthorized", str(err))
        return
    connection.send_result(msg["id"], etat)


# ── Le test d'une sirene (22/09) ───────────────────────────────────────────
# Meme regime que les minuteurs : le geste d'une carte, ouvert a tout
# compte connecte, sur ce qu'il a le droit de PILOTER — c'est le composant
# qui allume et eteint. Qui teste vient de la session, jamais du message.
async def handle_sir_tester(ctx, connection, msg, sirene):
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


# ── La table : chaque commande, une ligne ──────────────────────────────────
# `patch: dict` est le schema de toutes les commandes `config` d'un module.
_PATCH = {vol.Required("patch"): dict}
# Un identifiant de robot, de chauffage, de profil, de script : du texte borne.
_NOM_128 = vol.All(str, vol.Length(min=1, max=128))

COMMANDES: tuple[Commande, ...] = (
    # La configuration
    Commande(WS_GET, handle_get),
    Commande(WS_SET, handle_set, {vol.Required("config"): dict, vol.Optional("replace", default=False): bool}),
    Commande(WS_DELETE, handle_delete),
    Commande(WS_CFG_SUIVRE, handle_cfg_suivre),
    # L'installation
    Commande(WS_DISCOVERY, handle_discovery, asynchrone=False),
    # Les boutons sans fil
    Commande(WS_INT_ETAT, _etat(), module="interrupteurs"),
    Commande(WS_INT_AFFECTER, handle_int_affecter, {
        vol.Required("cle"): str,
        vol.Required("action"): str,
        # Chaque geste est verifie a l'ecriture (lot 8, B3 ; interrupteurs.py).
        vol.Required("gestes"): [dict],
        vol.Optional("nom", default=""): str,
    }, acces=ADMIN, module="interrupteurs"),
    Commande(WS_INT_ECOUTER, handle_int_ecouter,
             {vol.Required("duree"): vol.All(vol.Coerce(int), vol.Range(min=0, max=900))},
             acces=ADMIN, module="interrupteurs"),
    # Les volets : un planning de volets commande la maison entiere
    Commande(WS_VOL_ETAT, _etat(), module="volets"),
    Commande(WS_VOL_CONFIG, _config(), _PATCH, acces=ADMIN, module="volets"),
    Commande(WS_VOL_MANOEUVRES, handle_vol_manoeuvres, {
        vol.Required("entity_id"): str,
        vol.Required("depuis"): vol.All(vol.Coerce(float), vol.Range(min=0)),
    }, module="volets"),
    # Fenetre ouverte, chauffage coupe
    Commande(WS_FEN_ETAT, _etat(), module="fenetres"),
    Commande(WS_FEN_CONFIG, _config(), _PATCH, acces=ADMIN, module="fenetres"),
    # Depart et retour
    Commande(WS_PRE_ETAT, _etat(), module="presence"),
    Commande(WS_PRE_CONFIG, _config(), _PATCH, acces=ADMIN, module="presence"),
    # La nuit : l'etat sous les droits de LECTURE du compte (audit du 19/10)
    Commande(WS_NUI_ETAT, _etat(par_compte=True), module="nuit"),
    Commande(WS_NUI_CONFIG, _config(), _PATCH, acces=ADMIN, module="nuit"),
    # Les veilles
    Commande(WS_VEI_ETAT, _etat(), module="veilles"),
    Commande(WS_VEI_CONFIG, _config(), _PATCH, acces=ADMIN, module="veilles"),
    # Le rappel de collecte : « C'est sorti » depuis le bandeau (ADR 0301)
    Commande(WS_COL_SORTI, handle_col_sorti, {
        vol.Required("date"): vol.All(str, vol.Length(min=10, max=10)),
        vol.Required("sorti"): bool,
    }, module="veilles"),
    # Le socle des regles
    Commande(WS_REG_ETAT, handle_reg_etat, {
        vol.Optional("limite", default=200): vol.All(int, vol.Range(min=1, max=500)),
        vol.Optional("module"): str,
    }, module="regles"),
    Commande(WS_REG_DEGELER, handle_reg_degeler, {vol.Required("entity_id"): str}, acces=ADMIN, module="regles"),
    # Qui recoit quoi (ADR 0301)
    Commande(WS_NOT_DESTINATAIRES, handle_not_destinataires, acces=ADMIN, module="regles"),
    # Les scenarios (24 scenarios, 12 actions : la limite se dit par son code)
    Commande(WS_SCN_ETAT, _etat(), module="scenarios"),
    Commande(WS_SCN_CONFIG, _config(etat="seul"), _PATCH, acces=ADMIN, module="scenarios"),
    Commande(WS_SCN_ORDRE, handle_scn_ordre,
             {vol.Required("ordre"): vol.All([vol.All(str, vol.Length(min=1, max=64))], vol.Length(max=64))},
             module="scenarios"),
    Commande(WS_SCN_LANCER, handle_scn_lancer, {vol.Required("scenario"): vol.All(str, vol.Length(min=1, max=64))},
             module="scenarios"),
    # Le code administrateur, et le profil du compte (ADR 0276)
    Commande(WS_PIN_VERIFIER, handle_pin_verifier, {vol.Required("pin"): str}),
    Commande(WS_PIN_DEFINIR, handle_pin_definir, {vol.Required("pin"): str}, acces=ADMIN),
    Commande(WS_PROF_MOI, handle_prof_moi),
    # Les robots (24 plannings au plus)
    Commande(WS_ROB_ETAT, _etat(par_compte=True), module="robots"),
    Commande(WS_ROB_CONFIG, _config(), _PATCH, acces=ADMIN, module="robots"),
    Commande(WS_ROB_LANCER, handle_rob_lancer, {
        # Le robot se nomme `robot`, JAMAIS `id` : `id` est le numero du message.
        vol.Required("robot"): _NOM_128,
        # `zones` a la forme de celles d'un planning ; vide, c'est tout.
        vol.Optional("zones", default=list): list,
        # Un script maison de l'aspirateur (passe bis du 18/10, point A ; sa reponse « Par le serveur ») : `script.turn_on`
        # sous les memes droits, s'il est un des siens.
        vol.Optional("script"): _NOM_128,
        # Le role que l'ecran DEMANDE au script — un depart, une reprise, la pause, la base, localiser (passe bis 2 du 18/10,
        # point J ; `localiser` depuis la passe bis de la tranche robots 2, 20/10) : c'est lui qui dit si le script lance un
        # passage, pas sa place dans une liste.
        vol.Optional("role"): vol.In(ROLES_ROBOT),
        # « Localiser », que le SERVEUR decide (petit paquet du 25/10) : le script `localiser` designe, sinon `vacuum.locate` —
        # d'apres la description de la maison sur le disque, jamais d'apres le cache d'un onglet. Un serveur d'avant refuse la cle
        # (`invalid_format`), et l'ecran envoie alors `locate` lui-meme : jamais un depart a la place.
        vol.Optional("localiser"): bool,
    }, module="robots"),
    Commande(WS_ROB_SCRIPTS, handle_rob_scripts, {
        vol.Required("role"): vol.In(ROLES_ROBOT),
        # Le script du role, ou None : « Aucun » retire le role.
        vol.Required("script"): vol.Any(None, _NOM_128),
    }, acces=ADMIN, module="robots"),
    # Le distributeur de croquettes
    Commande(WS_DIS_ETAT, handle_dis_etat, {vol.Optional("detail", default=False): bool}, module="distributeurs"),
    Commande(WS_DIS_CONFIG, _config(etat="compte"), _PATCH, acces=ADMIN, module="distributeurs"),
    # Le chauffage
    Commande(WS_CHA_ETAT, _etat(par_compte=True), module="chauffage"),
    Commande(WS_CHA_MAIN, handle_cha_main, {
        vol.Required("chauffage"): _NOM_128,
        vol.Optional("mode"): vol.In(["confort", "confort_1", "confort_2", "eco", "hors_gel", "arret"]),
        vol.Optional("temperature"): vol.Coerce(float),
        vol.Optional("fin", default="prochain"): vol.Any("prochain", "relance", 60, 120, 240),
        vol.Optional("reprendre", default=False): bool,
    }, module="chauffage"),
    Commande(WS_CHA_MAISON, handle_cha_maison, {
        vol.Required("mode"): vol.In(["planning", "absence", "vacances", "ete"]),
        vol.Optional("fin"): vol.Any(None, str),
    }, module="chauffage"),
    Commande(WS_CHA_CONFIG, _config(etat="compte"), _PATCH, acces=ADMIN, module="chauffage"),
    Commande(WS_CHA_HISTORIQUE, handle_cha_historique, {
        vol.Required("chauffage"): _NOM_128,
        vol.Optional("jours", default=1): vol.In([1, 7]),
    }, module="chauffage"),
    # Les prises (chantier Prises, spec 6.1) : `etat` ne dit rien que
    # `config/get` ne donne deja ; `config` - proteger, imposer le type,
    # l'alerte de fin de cycle - aux administrateurs (P4).
    Commande(WS_PRI_ETAT, _etat(), module="prises"),
    Commande(WS_PRI_CONFIG, _config(etat="seul"), _PATCH, acces=ADMIN, module="prises"),
    # Le carnet des lumieres
    Commande(WS_LUM_ETAT, _etat(par_compte=True), module="lumieres"),
    Commande(WS_LUM_JOURNAL, handle_lum_journal, {vol.Required("entity_id"): str}, module="lumieres"),
    # Le carnet de l'eau
    Commande(WS_EAU_ETAT, _etat(par_compte=True), module="eau"),
    Commande(WS_EAU_REGLE, handle_eau_regle, {vol.Required("actif"): bool}, acces=ADMIN, module="eau"),
    # Le mode enfant
    Commande(WS_ENF_ETAT, _etat(par_compte=True), module="enfant"),
    Commande(WS_ENF_CONFIG, handle_enf_config, _PATCH, acces=CODE_OU_ADMIN, module="enfant"),
    Commande(WS_ENF_LEVER, handle_enf_lever, {
        vol.Required("profil"): _NOM_128,
        vol.Required("minutes"): vol.In([0, 30]),
    }, acces=CODE_OU_ADMIN, module="enfant"),
    Commande(WS_ENF_REPONDRE, handle_enf_repondre, {
        vol.Required("profil"): _NOM_128,
        vol.Required("accorder"): bool,
    }, acces=CODE_OU_ADMIN, module="enfant"),
    Commande(WS_ENF_DEMANDER, handle_enf_demander, {vol.Required("profil"): _NOM_128}, module="enfant"),
    Commande(WS_ENF_DORMIR, handle_enf_dormir, {
        vol.Required("profil"): _NOM_128,
        vol.Required("son"): vol.All(int, vol.Range(min=0)),
    }, module="enfant"),
    # Les versions precedentes de la configuration
    Commande(WS_VER_LISTE, handle_ver_liste, acces=ADMIN),
    Commande(WS_VER_RENDRE, handle_ver_rendre, {vol.Required("version"): str}, acces=ADMIN),
    # Les minuteurs d'extinction, et le test d'une sirene
    Commande(WS_MIN_ETAT, handle_min_etat, module="minuteurs"),
    Commande(WS_MIN_POSER, handle_min_poser, {vol.Required("entity_id"): str, vol.Required("minutes"): int},
             module="minuteurs"),
    Commande(WS_MIN_ANNULER, handle_min_annuler, {vol.Required("entity_id"): str}, module="minuteurs"),
    Commande(WS_SIR_TESTER, handle_sir_tester, {vol.Required("entity_id"): str}, module="sirene"),
)
