"""Ce que Home Assistant sait de l'installation, lu depuis le composant.

Le dashboard lisait lui-meme les quatre registres, par `config/area_registry/list`
et ses voisins. Ces commandes sont RESERVEES AUX ADMINISTRATEURS : sur un compte
ordinaire, la decouverte ne renvoyait rien, et l'interface retombait sur ce
qu'elle pouvait deviner des seuls etats — sans pieces, sans zones, sans appareils.

Le composant, lui, tourne dans Home Assistant et lit ces registres directement.
Il les expose a tous les comptes authentifies, ce qui donne la meme interface a
toute la maison.

Ce qui sort d'ici est volontairement pauvre : identifiants, noms, rattachements,
et de quoi reconnaitre un appareil (fabricant, modele, integration) ou un
chauffage (sa famille — l'identifiant stable qui la designe reste ici). Pour un
lecteur, les EMPREINTES de ses identifiants d'appareil (un hachage court, jamais
la valeur) : c'est par elles que l'ecran reconnait une meme enceinte exposee par
deux integrations (chantier Medias, M1 B ; ADR 0208). Aucun jeton, aucune option
de configuration, rien qui touche aux identifiants de connexion d'une integration.
"""
from __future__ import annotations

import hashlib
import logging
from typing import Any

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import (
    area_registry as ar,
    device_registry as dr,
    entity_registry as er,
)

from .chauffage_familles import PLATEFORME_BT, commandes_par, famille
from .tarifs import role_tarif

_LOGGER = logging.getLogger(__name__)

# Le client compare ce numero au sien : une structure qui change sans prevenir
# ferait lire de travers un dashboard reste en cache.
INDEX_VERSION = 1


@callback
def _version_du_composant() -> str | None:
    """La version REELLEMENT installee, lue dans le manifeste.

    Le dashboard affichait un numero ecrit en dur dans son code, qui ne
    correspondait a rien : il annoncait « v3.0 » alors que le composant
    installe etait en 2.1.0. La seule source qui ne mente pas est le manifeste
    du composant qui tourne — c'est lui que HACS met a jour.
    """
    # Lu UNE fois, a l'import de `const.py` : relire le manifeste a chaque
    # decouverte etait un appel de fichier bloquant dans la boucle (audit 18/09).
    try:
        from .const import VERSION
        return VERSION or None
    except Exception:  # noqa: BLE001 — un manifeste illisible ne prive de rien
        return None


def _valeur(x: Any) -> Any:
    """Rend une valeur transportable : les registres melent enums et objets."""
    if x is None or isinstance(x, (str, int, float, bool)):
        return x
    v = getattr(x, "value", None)
    # `or` prenait une valeur d'enum fausse (0, "") pour une absence.
    return v if v is not None else str(x)


@callback
def _zones(hass: HomeAssistant) -> list[dict[str, Any]]:
    reg = ar.async_get(hass)
    return [
        {
            "id": a.id,
            "name": a.name,
            "floor": getattr(a, "floor_id", None),
            # L'icone que l'utilisateur a choisie pour sa piece dans Home
            # Assistant, sous la forme « mdi:sofa ». Elle etait jetee, et le
            # dashboard en deduisait une des mots du nom — ce qui obligeait a
            # nommer ses pieces comme il l'attendait.
            "icon": getattr(a, "icon", None),
        }
        for a in reg.async_list_areas()
    ]


@callback
def _etages(hass: HomeAssistant) -> list[dict[str, Any]]:
    """Les etages, presents depuis Home Assistant 2024.4.

    Le repli qui rendait une liste vide visait des versions anterieures a
    notre minimum, 2024.7 (`hacs.json`) : retire le 24/09 (plan S7).
    """
    from homeassistant.helpers import floor_registry as fr

    reg = fr.async_get(hass)
    return [
        {"id": f.floor_id, "name": f.name, "level": getattr(f, "level", None)}
        for f in reg.async_list_floors()
    ]


# Douze caracteres hexadecimaux : assez pour que deux appareils d'une maison ne se
# confondent pas, trop peu pour reconstruire quoi que ce soit.
EMPREINTE_LONGUEUR = 12


def _empreinte(valeur: Any) -> str:
    """L'empreinte d'un identifiant d'appareil : SHA-256 de sa VALEUR seule,
    sans le domaine de l'integration, tronque a douze caracteres.

    Les deux integrations d'une Echo (« Alexa Devices », l'officielle, et
    `alexa_media_player`, celle de HACS) ecrivent toutes deux le numero de serie
    de l'enceinte dans leurs identifiants, chacune sous son domaine : la valeur
    seule les fait se rejoindre. Le numero de serie, lui, ne quitte jamais le
    serveur en clair — l'index est lu par tout compte authentifie.
    """
    return hashlib.sha256(str(valeur).encode("utf-8")).hexdigest()[:EMPREINTE_LONGUEUR]


@callback
def _porteurs_de_lecteur(hass: HomeAssistant) -> set[str]:
    """Les appareils qui portent au moins un `media_player` actif."""
    reg = er.async_get(hass)
    return {
        e.device_id
        for e in reg.entities.values()
        if e.device_id and e.disabled_by is None and e.entity_id.startswith("media_player.")
    }


@callback
def _appareils(hass: HomeAssistant, autorise: Any = None) -> list[dict[str, Any]]:
    """Les appareils de la maison.

    `autorise` est le meme test que pour les entites (`_lecture_autorisee`) :
    un compte restreint ne recoit que les appareils dont il peut lire au moins
    une entite active (audit du 19/10, M25). Il recevait le nom, le fabricant
    et la piece de chaque appareil de la maison, alors que les entites, elles,
    lui etaient filtrees. Sans restriction, rien ne change."""
    reg = dr.async_get(hass)
    lecteurs = _porteurs_de_lecteur(hass)
    permis = None
    if autorise is not None:
        permis = {e.device_id for e in er.async_get(hass).entities.values()
                  if e.device_id and e.disabled_by is None and autorise(e.entity_id)}
    sortie = []
    for d in reg.devices.values():
        if d.disabled_by is not None:
            continue
        if permis is not None and d.id not in permis:
            continue
        # `identifiers` porte le domaine de l'integration qui a cree l'appareil.
        integration = None
        for domaine, _ in d.identifiers:
            integration = domaine
            break
        entree = {
            "id": d.id,
            "name": d.name_by_user or d.name,
            # Fabricant et modele restent : ils servent a reconnaitre l'appareil
            # (voir profiles.js). La VERSION DE FIRMWARE, elle, ne servait a
            # personne — recopiee, jamais relue — et c'etait le champ le plus
            # exploitable de la reponse : une version exacte designe les failles
            # publiees qui s'y appliquent. Elle ne sort plus d'ici.
            "manufacturer": d.manufacturer,
            "model": d.model,
            "integration": integration,
            "area": d.area_id,
            "via": d.via_device_id,
            "entry_type": _valeur(d.entry_type),
        }
        # Les empreintes des identifiants (chantier Medias, M1 B ; ADR 0208) :
        # seulement pour un appareil qui porte un lecteur — l'index voyage vers
        # chaque ecran, pas de champ en plus ailleurs —, et seulement s'il a un
        # identifiant : un appareil sans identifiant n'a pas d'empreinte.
        if d.id in lecteurs:
            empreintes = sorted({_empreinte(v) for _, v in d.identifiers if v not in (None, "")})
            if empreintes:
                entree["empreintes"] = empreintes
        sortie.append(entree)
    return sortie


def _lecture_autorisee(user: Any) -> Any:
    """Renvoie un test `(entity_id) -> bool`, ou None si tout est permis.

    Home Assistant sait restreindre un compte a certaines entites. Cette
    decouverte l'ignorait : un administrateur pouvait limiter quelqu'un, Loggia
    lui renvoyait quand meme le registre entier. Le filtre s'appuie sur la
    politique du compte, jamais sur un champ envoye par le client.

    Sans restriction configuree — le cas de presque toutes les installations —
    `permissions` autorise tout et l'on renvoie None : aucun parcours
    supplementaire, aucun changement de comportement.
    """
    if user is None or getattr(user, "is_admin", False):
        return None
    perms = getattr(user, "permissions", None)
    verif = getattr(perms, "check_entity", None)
    if verif is None:
        return None
    return lambda entity_id: bool(verif(entity_id, "read"))


def commandes_du_registre(hass: Any, entrees: Any) -> dict[str, str]:
    """{entite commandee : le VTherm ou le Better Thermostat qui la commande} —
    pour ne pas en faire un chauffage de plus (audit du 19/10). Sans
    `config_entries` lisible, seuls les VTherm comptent."""
    def attributs_de(haid: str) -> dict:
        return dict(getattr(hass.states.get(haid), "attributes", None) or {})

    try:
        bt = [(getattr(x, "entry_id", None), dict(getattr(x, "data", None) or {}))
              for x in hass.config_entries.async_entries(PLATEFORME_BT)]
    except Exception:  # noqa: BLE001
        bt = []
    return commandes_par(entrees, attributs_de, bt)


@callback
def _entites(hass: HomeAssistant, autorise: Any = None) -> list[dict[str, Any]]:
    reg = er.async_get(hass)
    commandes = commandes_du_registre(hass, list(reg.entities.values()))
    sortie = []
    for e in reg.entities.values():
        if e.disabled_by is not None:
            continue
        if autorise is not None and not autorise(e.entity_id):
            continue
        entree = {
            "id": e.entity_id,
            "name": e.name or e.original_name,
            "device": e.device_id,
            "area": e.area_id,
            "platform": e.platform,
            # La cle de traduction : ce que l'integration appelle l'entite, dans
            # toutes les langues. L'identifiant, lui, est traduit a la creation
            # (« temps_restant_filtre ») : un motif ecrit en anglais ne le
            # reconnait pas. Les robots s'y fient pour leurs pieces d'usure.
            "key": getattr(e, "translation_key", None),
            # Une entite de diagnostic ou de configuration n'a rien a faire
            # dans une carte : le client a besoin de le savoir.
            "category": _valeur(e.entity_category),
            "device_class": e.device_class or e.original_device_class,
            "unit": e.unit_of_measurement,
            "hidden": e.hidden_by is not None,
        }
        # La famille d'un chauffage (chauffage_familles.py) : fil pilote,
        # thermostat ou VTherm. L'ecran n'a ni l'`unique_id` qui dit « pilot
        # wire » ni les options : la reconnaissance se fait ICI, une seule fois,
        # et il lit le resultat. Seule la famille sort — l'identifiant stable
        # reste au serveur. La cle n'est posee que pour un chauffage : l'index
        # voyage vers chaque ecran, pas de champ vide en plus.
        domaine = e.entity_id.split(".", 1)[0]
        if domaine in ("climate", "select"):
            etat = hass.states.get(e.entity_id)
            fam = famille(domaine, e.platform, getattr(e, "unique_id", None), e.original_name,
                          dict(getattr(etat, "attributes", None) or {}), getattr(e, "translation_key", None))
            # Commande par un VTherm ou un Better Thermostat : pas un chauffage de plus.
            if fam and e.entity_id not in commandes:
                entree["famille"] = fam
        # Le contrat a couleurs (tarifs.py, chantier G3, E4) : le creneau d'heures creuses
        # reconnu a son identifiant stable, la couleur du lendemain a sa forme. Le role seul.
        # Un binaire se lit a son identifiant seul ; un capteur, a ses options (sans copie : ils sont des centaines).
        elif domaine in ("binary_sensor", "sensor"):
            attributs = getattr(hass.states.get(e.entity_id), "attributes", None) or {} if domaine == "sensor" else {}
            role = role_tarif(domaine, getattr(e, "unique_id", None), getattr(e, "translation_key", None), attributs)
            if role:
                entree["tarif"] = role
        sortie.append(entree)
    return sortie


@callback
def _services(hass: HomeAssistant) -> dict[str, dict[str, Any]]:
    """Ce que l'installation sait REELLEMENT faire.

    Une capacite deduite du seul domaine est une supposition : `vacuum` ne dit
    pas si le robot accepte `send_command`. La liste des services le dit.

    Seuls les noms de champs sont conserves — descriptions et selecteurs pesent
    plusieurs centaines de kilo-octets, et le client n'en a pas l'usage.
    """
    sortie: dict[str, dict[str, Any]] = {}
    for domaine, services in hass.services.async_services().items():
        entrees: dict[str, Any] = {}
        for nom, service in services.items():
            champs: list[str] = []
            schema = getattr(service, "schema", None)
            interne = getattr(schema, "schema", None) if schema is not None else None
            if isinstance(interne, dict):
                champs = sorted(str(getattr(c, "schema", c)) for c in interne)
            entrees[nom] = {"fields": champs}
        sortie[domaine] = entrees
    return sortie


@callback
def async_index(hass: HomeAssistant, user: Any = None) -> dict[str, Any]:
    """Tout ce dont le dashboard a besoin pour se construire, en un envoi.

    `user` est le compte de la connexion WebSocket, quand l'appelant le connait.
    Il ne sert qu'a retirer ce que ce compte n'a pas le droit de lire ; il n'est
    jamais lu depuis un message du client. Omis, la reponse est complete — c'est
    ce que font les tests et ce qui se passait avant.
    """
    autorise = _lecture_autorisee(user)
    try:
        return {
            "version": INDEX_VERSION,
            # La version du composant, distincte de celle de l'index : l'une dit
            # la forme des donnees, l'autre ce qui est installe.
            "component_version": _version_du_composant(),
            "areas": _zones(hass),
            "floors": _etages(hass),
            "devices": _appareils(hass, autorise),
            "entities": _entites(hass, autorise),
            "services": _services(hass),
        }
    except Exception:  # noqa: BLE001 — un registre illisible ne doit pas priver
        _LOGGER.exception("Loggia : lecture des registres impossible")
        return {"version": INDEX_VERSION, "component_version": _version_du_composant(),
                "areas": [], "floors": [], "devices": [], "entities": [], "services": {}}
