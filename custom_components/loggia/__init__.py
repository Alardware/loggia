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
from dataclasses import dataclass

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
#
# `rechargement` vient EN TETE : il ecoute la configuration pour recharger les
# autres, il doit se taire avant qu'ils ne s'arretent.
MODULES_VIVANTS = (
    "rechargement",
    "alertes", "chauffage", "distributeurs", "eau", "enfant", "fenetres", "interrupteurs", "lumieres", "minuteurs",
    "nuit", "presence", "prises", "robots", "scenarios", "sirene", "veilles", "volets", "regles",
)


@dataclass(frozen=True)
class Module:
    """Un module que `_async_setup_common` cree (lot 8, audit du 28/10, M12).

    `classe` vit dans `.<cle>` ; elle recoit `hass` puis `arguments`, lus dans
    `hass.data[DOMAIN]` (`"data"` : le dictionnaire lui-meme). Elle ne nait que
    si chaque cle de `requis` y est deja. `panne` : ce que dit le journal si
    elle ne nait pas.
    """

    cle: str
    classe: str
    requis: tuple[str, ...]
    arguments: tuple[str, ...]
    panne: str


_REGLES = ("store", "regles")

# L'ORDRE COMPTE : un module nait apres ceux qu'il recoit.
MODULES = (
    # Le socle commun des regles : journal unifie et respect du geste manuel.
    # Il vient AVANT les modules de regles — chacun le recoit et lui confie
    # ses commandes. Sans lui, chaque module reecrivait sa propre plomberie,
    # et cinq journaux en memoire repartaient a zero a chaque redemarrage.
    Module("regles", "Regles", ("store",), ("store",), "socle des regles indisponible"),
    # Alertes de surete poussees sur telephone.
    Module("alertes", "LoggiaAlertes", _REGLES, _REGLES, "alertes de sûreté indisponibles"),
    # Interrupteurs sans fil : Zigbee2MQTT, ZHA, deCONZ. Une installation sans
    # interrupteur ne doit pas s'en trouver genee.
    Module("interrupteurs", "LoggiaInterrupteurs", _REGLES, _REGLES, "interrupteurs sans fil indisponibles"),
    # Regles de volets : planning du soleil, protection solaire, mise a l'abri.
    # Une maison sans volet ne doit pas s'en trouver genee.
    Module("volets", "LoggiaVolets", _REGLES, _REGLES, "regles de volets indisponibles"),
    # Le chauffage (chantier Chauffage) : un seul chef par chauffage au
    # planning allume. AVANT les fenetres et la presence, qui lui donnent leurs
    # faits — elles le cherchent au moment de servir, mais autant qu'il soit la.
    Module("chauffage", "LoggiaChauffage", _REGLES, _REGLES, "moteur du chauffage indisponible"),
    # Fenetre ouverte, chauffage coupe.
    Module("fenetres", "LoggiaFenetres", _REGLES, _REGLES, "regle des fenetres indisponible"),
    # Depart et retour : la maison se met en veille quand elle se vide.
    Module("presence", "LoggiaPresence", _REGLES, _REGLES, "regle de presence indisponible"),
    # La nuit : veilleuse a minuterie, et extinction des lampes oubliees.
    Module("nuit", "LoggiaNuit", _REGLES, _REGLES, "regles de nuit indisponibles"),
    # Trois veilles : l'air, les piles, le tarif. Elles parlent par le service
    # de notification deja choisi dans Alertes.
    Module("veilles", "LoggiaVeilles", _REGLES, _REGLES, "veilles indisponibles"),
    # Le planning des robots : l'aspirateur et la tondeuse partent a l'heure
    # dite (ADR 0043).
    Module("robots", "LoggiaRobots", _REGLES, _REGLES, "planning des robots indisponible"),
    # Le distributeur de croquettes (05/10, ADR 0155) : ses sources de repas
    # (programme de l'appareil, automatisations qui le commandent) et le
    # planning de Loggia, qui part meme ecran ferme. Apres les robots, dont il
    # reprend le format.
    Module("distributeurs", "LoggiaDistributeurs", _REGLES, _REGLES, "distributeur de croquettes indisponible"),
    # Les minuteurs d'extinction : « eteindre dans 30 min », tenus ICI et non
    # plus dans l'onglet du navigateur (21/09).
    Module("minuteurs", "LoggiaMinuteurs", _REGLES, _REGLES, "minuteurs d'extinction indisponibles"),
    # Le test d'une sirene : « sonner trois secondes », tenu ICI et non plus
    # dans l'onglet (22/09, ADR 0065).
    Module("sirene", "LoggiaSirene", _REGLES, _REGLES, "test de sirene indisponible"),
    # Les prises (chantier Prises) : leur configuration, et le cycle de
    # l'electromenager suivi meme ecran ferme.
    Module("prises", "LoggiaPrises", _REGLES, _REGLES, "prises indisponibles"),
    # Le carnet des lumieres (chantier Lumieres, L1) : chaque allumage,
    # extinction et reglage, avec son niveau et son contexte, note ecran
    # ferme. Il ne commande rien : le magasin lui suffit.
    Module("lumieres", "LoggiaLumieres", ("store",), ("store",), "carnet des lumieres indisponible"),
    # Le carnet de l'eau (chantier IoT, etape 3 ; I28, ADR 0217) : pourquoi une
    # vanne d'eau est fermee, ses detecteurs, le journal du jour, notes ecran
    # ferme. Il ne commande rien : le magasin lui suffit. La regle de fuite
    # (alertes.py) le trouve ici au moment d'agir, et lui dit la cause avant.
    Module("eau", "LoggiaEau", ("store",), ("store",), "carnet de l'eau indisponible"),
    # Le mode enfant (chantier Mode enfant) : les profils par piece, le plafond
    # de volume, le temps d'ecran et le coucher tenus ecran ferme, la demande
    # de l'enfant au telephone. Il previent par les regles, il n'agit jamais
    # par `agir` (E11).
    Module("enfant", "LoggiaEnfant", _REGLES, _REGLES, "mode enfant indisponible"),
    # Un import ou une remise a zero ecrit la configuration des modules par la
    # configuration generale : ils la reprennent tout de suite, au lieu
    # d'attendre le prochain redemarrage (relecture du lot 1, audit du 03/10).
    Module("rechargement", "LoggiaRechargement", ("store",), ("data",), "rechargement des modules indisponible"),
    # Les scenarios : ce que la maison fait d'un seul geste (ADR 0027). Ils
    # ne posent aucun abonnement — seul le magasin leur est necessaire ; le
    # socle, s'il est la.
    Module("scenarios", "LoggiaScenarios", ("store",), _REGLES, "scenarios indisponibles"),
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
            # Acces PARESSEUX aux modules : les commandes WebSocket ne
            # s'enregistrent qu'une fois pour la vie du process, et les modules
            # naissent quelques lignes plus bas - et renaissent a chaque
            # rechargement. Passer les objets ici aurait fige des `None` que
            # plus aucun rechargement n'aurait rattrapes.
            async_register_ws(hass, store, lambda nom: hass.data.get(DOMAIN, {}).get(nom))
            data["ws"] = True
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Loggia : configuration utilisateur indisponible")

    # Le plan 3D (chantier Plan 3D) : une vue HTTP authentifiee, hors de
    # /config/www/ qui est ouvert a tous. Meme regime que le WebSocket : une
    # seule fois pour la vie du process, et son echec ne gene rien d'autre.
    if not data.get("plan") and data.get("store"):
        try:
            from .plan import async_register_plan

            async_register_plan(hass, data["store"])
            data["plan"] = True
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Loggia : plan 3D indisponible")

    # La photo de fond d'un compte (ADR 0289) : meme regime que le plan 3D, une
    # vue authentifiee hors de /config/www/, chacun ne touchant qu'a la sienne.
    if not data.get("fond"):
        try:
            from .fond import async_register_fond

            async_register_fond(hass)
            data["fond"] = True
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Loggia : photo de fond indisponible")

    # Les modules, dans l'ordre de MODULES : chacun nait s'il manque et si ce
    # dont il a besoin est la. Meme regime que le WebSocket : ses abonnements
    # vivent jusqu'a l'arret du process (ou jusqu'au dechargement, qui les
    # fait taire), et son echec ne gene rien d'autre - il le dit au journal.
    for module in MODULES:
        if data.get(module.cle) or not all(data.get(r) for r in module.requis):
            continue
        try:
            # `from .<cle> import <classe>`, tel quel : `importlib.import_module`
            # dans la boucle ferait crier la garde des appels bloquants de Home
            # Assistant (« Detected blocking call to import_module »).
            classe = getattr(__import__(module.cle, globals(), None, [module.classe], 1), module.classe)
            data[module.cle] = classe(hass, *(data if a == "data" else data.get(a) for a in module.arguments))
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Loggia : %s", module.panne)

    # Le service `loggia.scenario` : une automatisation, l'assistant vocal ou
    # un interrupteur sans fil lance un scenario comme la carte le fait. Un
    # service ne se desenregistre pas : une fois pour la vie du process.
    if not data.get("service_scenario") and data.get("scenarios"):
        try:
            import voluptuous as vol
            from homeassistant.exceptions import ServiceValidationError

            def _refus(cle: str, **valeurs) -> ServiceValidationError:
                """Un refus que l'automatisation VOIT, dans la langue de la maison.

                Le service echouait en silence (audit du 03/10) : un scenario
                mal nomme dans une automatisation, un composant pas encore
                demarre, un compte illisible — l'automatisation se deroulait
                « avec succes » et rien ne se passait. Les messages vivent
                dans translations/*.json, section `exceptions`.
                """
                return ServiceValidationError(
                    translation_domain=DOMAIN, translation_key=cle,
                    translation_placeholders={k: str(v) for k, v in valeurs.items()} or None)

            async def _lancer_scenario(call):
                scenarios = hass.data.get(DOMAIN, {}).get("scenarios")
                if scenarios is None:
                    raise _refus("scenarios_indisponibles")
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
                    raise _refus("compte_illisible")

                ident = str(call.data.get("id") or "")
                resultat = await scenarios.async_lancer(ident, user_id=uid,
                                                        controle=controle_de(utilisateur) if uid else None)
                if resultat is None:
                    raise _refus("scenario_inconnu", id=ident)

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
