"""Loggia — l'integration qui sert le dashboard et garde sa configuration.

Le frontend construit est embarque dans `frontend/` et expose par un panneau
plein ecran (pas une iframe : `embed_iframe` vaut False, cf. panel.py). Rien a
copier dans www/, aucun dashboard YAML a ecrire.

La configuration passe par des commandes WebSocket authentifiees, dont celles
qui ecrivent la maison exigent `require_admin`. Les appels de service, eux,
passent par l'API standard de Home Assistant : ce module n'ajoute pas de filtre
par-dessus, et n'en retire aucun.

Ce docstring a longtemps decrit une route `/api/loggia/call` protegee par une
allow-list. Elle n'a jamais existe dans le code, et le README l'annoncait au
public — corrige le 06/09. Une barriere de securite qu'on croit avoir est pire
que pas de barriere du tout.

Installation :
  - par HACS, puis Parametres -> Appareils et services -> Ajouter -> Loggia
  - ou a la main : copier ce dossier dans config/custom_components/loggia/,
    puis ajouter `loggia:` dans configuration.yaml (mode historique)
"""
from __future__ import annotations

import logging

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


# Les modules qui ECOUTENT et PROGRAMMENT : abonnements au bus, rendez-vous,
# minuteries. Ils savent tous se taire, et se rebatissent au chargement
# suivant puisque `_async_setup_common` ne les cree que s'ils manquent.
#
# `regles` en fait partie : c'est lui qui ecoute les gestes et qui retient
# l'ecriture differee du journal. Son arret l'ECRIT avant de partir.
MODULES_VIVANTS = (
    "alertes", "fenetres", "interrupteurs", "minuteurs", "nuit", "presence",
    "robots", "scenarios", "sirene", "veilles", "volets", "regles",
)


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Retire le panneau, et fait taire ce qui ecoute.

    Les vues HTTP et les commandes WebSocket ne se desenregistrent pas : elles
    vivent jusqu'a l'arret du process. On ne touche donc PAS aux drapeaux qui
    les protegent — sinon le chargement suivant (bouton « Recharger » de
    l'interface, action courante) retenterait `register_view` sur des routes
    deja prises. Le service `loggia.scenario` non plus, pour la meme raison.

    LE RESTE S'ARRETE (24/09, plan S7). Douze modules portaient une methode
    d'arret que PERSONNE n'appelait : leurs abonnements et leurs rendez-vous
    survivaient au dechargement, et un rechargement ne les recreait meme pas
    — ils etaient encore dans `hass.data`. On les arrete donc, et on les
    retire : le chargement suivant les rebatit neufs.

    Le magasin reste : il porte le fichier et son verrou, et rien ne l'ecoute.
    """
    async_remove_panel(hass)
    data = hass.data.get(DOMAIN, {})
    data.pop("panel", None)
    for nom in MODULES_VIVANTS:
        module = data.pop(nom, None)
        if module is None:
            continue
        arreter = getattr(module, "async_arreter", None) or getattr(module, "arreter", None)
        if arreter is None:
            continue
        try:
            arreter()
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Loggia %s : arret impossible", nom)
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
            # Acces PARESSEUX a l'ecoute des interrupteurs : les commandes
            # WebSocket ne s'enregistrent qu'une fois pour la vie du process,
            # et l'ecoute nait quelques lignes plus bas. Passer la valeur ici
            # aurait fige un `None` que plus aucun rechargement n'aurait
            # rattrape.
            async_register_ws(hass, store,
                              lambda: hass.data.get(DOMAIN, {}).get("interrupteurs"),
                              lambda: hass.data.get(DOMAIN, {}).get("volets"),
                              lambda: hass.data.get(DOMAIN, {}).get("fenetres"),
                              lambda: hass.data.get(DOMAIN, {}).get("presence"),
                              lambda: hass.data.get(DOMAIN, {}).get("nuit"),
                              lambda: hass.data.get(DOMAIN, {}).get("veilles"),
                              acces_regles=lambda: hass.data.get(DOMAIN, {}).get("regles"),
                              acces_scenarios=lambda: hass.data.get(DOMAIN, {}).get("scenarios"),
                              acces_robots=lambda: hass.data.get(DOMAIN, {}).get("robots"),
                              acces_minuteurs=lambda: hass.data.get(DOMAIN, {}).get("minuteurs"),
                              acces_sirene=lambda: hass.data.get(DOMAIN, {}).get("sirene"))
            data["ws"] = True
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Loggia : configuration utilisateur indisponible")

    # Le socle commun des regles : journal unifie et respect du geste manuel.
    # Il vient AVANT les modules de regles — chacun le recoit et lui confie
    # ses commandes. Sans lui, chaque module reecrivait sa propre plomberie,
    # et cinq journaux en memoire repartaient a zero a chaque redemarrage.
    if not data.get("regles") and data.get("store"):
        try:
            from .regles import Regles

            data["regles"] = Regles(hass, data["store"])
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Loggia : socle des regles indisponible")

    # Alertes de surete poussees sur telephone. Meme regime que le WebSocket :
    # le listener vit jusqu'a l'arret du process, on ne l'enregistre qu'une fois,
    # et son absence ne doit pas empecher le reste de fonctionner.
    if not data.get("alertes") and data.get("store") and data.get("regles"):
        try:
            from .alertes import LoggiaAlertes

            data["alertes"] = LoggiaAlertes(hass, data["store"], data["regles"])
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Loggia : alertes de sûreté indisponibles")

    # Interrupteurs sans fil : Zigbee2MQTT, ZHA, deCONZ. Meme regime encore —
    # les abonnements vivent jusqu'a l'arret du process, et une installation
    # sans interrupteur ne doit pas s'en trouver genee.
    if not data.get("interrupteurs") and data.get("store") and data.get("regles"):
        try:
            from .interrupteurs import LoggiaInterrupteurs

            data["interrupteurs"] = LoggiaInterrupteurs(hass, data["store"], data.get("regles"))
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Loggia : interrupteurs sans fil indisponibles")

    # Regles de volets : planning du soleil, protection solaire, mise a l'abri.
    # Meme regime : les abonnements vivent jusqu'a l'arret du process, et une
    # maison sans volet ne doit pas s'en trouver genee.
    if not data.get("volets") and data.get("store") and data.get("regles"):
        try:
            from .volets import LoggiaVolets

            data["volets"] = LoggiaVolets(hass, data["store"], data.get("regles"))
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Loggia : regles de volets indisponibles")

    # Fenetre ouverte, chauffage coupe. Meme regime que les regles ci-dessus.
    if not data.get("fenetres") and data.get("store") and data.get("regles"):
        try:
            from .fenetres import LoggiaFenetres

            data["fenetres"] = LoggiaFenetres(hass, data["store"], data.get("regles"))
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Loggia : regle des fenetres indisponible")

    # Depart et retour : la maison se met en veille quand elle se vide.
    if not data.get("presence") and data.get("store") and data.get("regles"):
        try:
            from .presence import LoggiaPresence

            data["presence"] = LoggiaPresence(hass, data["store"], data.get("regles"))
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Loggia : regle de presence indisponible")

    # La nuit : veilleuse a minuterie, et extinction des lampes oubliees.
    if not data.get("nuit") and data.get("store") and data.get("regles"):
        try:
            from .nuit import LoggiaNuit

            data["nuit"] = LoggiaNuit(hass, data["store"], data.get("regles"))
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Loggia : regles de nuit indisponibles")

    # Trois veilles : l'air, les piles, le tarif. Elles parlent par le service
    # de notification deja choisi dans Alertes.
    if not data.get("veilles") and data.get("store") and data.get("regles"):
        try:
            from .veilles import LoggiaVeilles

            data["veilles"] = LoggiaVeilles(hass, data["store"], data.get("regles"))
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Loggia : veilles indisponibles")

    # Le planning des robots : l'aspirateur et la tondeuse partent a l'heure
    # dite (ADR 0043). Meme regime que les regles ci-dessus.
    if not data.get("robots") and data.get("store") and data.get("regles"):
        try:
            from .robots import LoggiaRobots

            data["robots"] = LoggiaRobots(hass, data["store"], data.get("regles"))
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Loggia : planning des robots indisponible")

    # Les minuteurs d'extinction : « eteindre dans 30 min », tenus ICI et non
    # plus dans l'onglet du navigateur (21/09). Meme regime que les regles.
    if not data.get("minuteurs") and data.get("store") and data.get("regles"):
        try:
            from .minuteurs import LoggiaMinuteurs

            data["minuteurs"] = LoggiaMinuteurs(hass, data["store"], data.get("regles"))
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Loggia : minuteurs d'extinction indisponibles")

    # Le test d'une sirene : « sonner trois secondes », tenu ICI et non plus
    # dans l'onglet (22/09, ADR 0065). Meme regime que les minuteurs.
    if not data.get("sirene") and data.get("store") and data.get("regles"):
        try:
            from .sirene import LoggiaSirene

            data["sirene"] = LoggiaSirene(hass, data["store"], data.get("regles"))
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Loggia : test de sirene indisponible")

    # Les scenarios : ce que la maison fait d'un seul geste (ADR 0027). Ils
    # ne posent aucun abonnement — seul le magasin leur est necessaire.
    if not data.get("scenarios") and data.get("store"):
        try:
            from .scenarios import LoggiaScenarios

            data["scenarios"] = LoggiaScenarios(hass, data["store"], data.get("regles"))
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Loggia : scenarios indisponibles")

    # Le service `loggia.scenario` : une automatisation, l'assistant vocal ou
    # un interrupteur sans fil lance un scenario comme la carte le fait. Un
    # service ne se desenregistre pas : une fois pour la vie du process.
    if not data.get("service_scenario") and data.get("scenarios"):
        try:
            import voluptuous as vol

            async def _lancer_scenario(call):
                scenarios = hass.data.get(DOMAIN, {}).get("scenarios")
                if scenarios is None:
                    return
                contexte = getattr(call, "context", None)
                uid = getattr(contexte, "user_id", None)
                # Appele par une personne : ses permissions d'entite valent ici
                # aussi. Par une automatisation (pas d'utilisateur) : celles de
                # la maison.
                #
                # UN COMPTE ILLISIBLE FAIT REFUSER, IL N'ELARGIT PAS (24/09, M10).
                # `controle_de(None)` vaut « aucun filtre » : c'est le bon sens
                # pour une automatisation, qui n'a pas d'utilisateur, et le pire
                # possible pour une personne dont le compte n'a pas pu etre lu.
                # Le scenario partait alors avec les droits de la maison entiere,
                # l'inverse exact de l'ADR 0045. Un appel qui PORTE un identifiant
                # doit pouvoir le resoudre, sinon il ne part pas.
                utilisateur = None
                if uid:
                    try:
                        utilisateur = await hass.auth.async_get_user(uid)
                    except Exception:  # noqa: BLE001
                        utilisateur = None
                from .scenarios import compte_resolu, controle_de

                if not compte_resolu(uid, utilisateur):
                    _LOGGER.warning(
                        "Loggia : scenario refuse, le compte %s n'a pas pu etre lu", uid)
                    return

                await scenarios.async_lancer(str(call.data.get("id") or ""), user_id=uid,
                                             controle=controle_de(utilisateur) if uid else None)

            hass.services.async_register(DOMAIN, "scenario", _lancer_scenario,
                                         schema=vol.Schema({vol.Required("id"): cv.string}))
            data["service_scenario"] = True
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Loggia : service loggia.scenario indisponible")

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
