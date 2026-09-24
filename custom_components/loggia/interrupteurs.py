"""Interrupteurs Zigbee : ecouter les appuis, executer ce qu'on leur a affecte.

Pourquoi ce module existe
─────────────────────────
Un interrupteur Zigbee sans fil — une telecommande Hue, un bouton IKEA — ne
possede aucune entite qu'on puisse allumer ou eteindre. Il ne fait qu'annoncer
« on vient d'appuyer sur moi ». Home Assistant n'en tire rien tout seul : il
faut ecouter cette annonce et decider quoi faire. C'est le role tenu jusqu'ici
par un blueprint par modele, ou par une integration tierce.

Le probleme des blueprints par modele, constate le 03/09 sur trois Hue dimmer
gen 1 (RWL021) : ils s'abonnent a `zigbee2mqtt/+/action`, un topic par
attribut, que zigbee2mqtt ne publie QUE si `advanced.output` vaut
`attribute` ou `attribute_and_json`. Avec le reglage par defaut — tout dans un
seul JSON sur `zigbee2mqtt/<nom>` — ce topic n'existe pas et l'abonnement ne
recoit jamais rien. Pire : zigbee2mqtt 2.x ne cree plus le capteur d'action
« legacy », si bien qu'aucune entite `action` n'existe non plus dans Home
Assistant. Il n'y avait litteralement rien a ecouter.

Ce module ecoute donc la source, pas ses derives :

  - zigbee2mqtt : le JSON de `zigbee2mqtt/<nom>`, ou vit le champ `action` ;
  - ZHA : l'evenement `zha_event` ;
  - deCONZ : l'evenement `deconz_event`.

Et il n'a AUCUN catalogue de modeles. Un interrupteur se declare en etant
utilise : le premier appui inscrit l'appareil et le nom de son bouton dans le
journal ci-dessous, que l'interface montre en clair. On affecte ce qu'on veut
au nom qu'on vient de voir. Un modele inconnu de tous les catalogues marche
donc du premier coup, y compris un modele sorti apres cette version.

Securite
────────
Une affectation appelle un service Home Assistant arbitraire. L'ECRITURE est
donc reservee aux administrateurs (voir `websocket_api`), qui peuvent de toute
facon deja tout appeler. La LECTURE est ouverte : elle ne montre que des noms
d'appareils et de services, comme le reste de la decouverte.
"""
from __future__ import annotations

import json
import logging
import time
from typing import TYPE_CHECKING, Any

from homeassistant.core import Event, HomeAssistant, callback

from .regles import demarrer

if TYPE_CHECKING:  # l'annotation seule — les tests chargent ce module hors paquet
    from .store import LoggiaStore

_LOGGER = logging.getLogger(__name__)

CLE = "loggia_interrupteurs"

# Le topic de base de zigbee2mqtt est configurable, mais `zigbee2mqtt` est son
# defaut et ce qu'on trouve dans la quasi-totalite des installations.
TOPIC_Z2M = "zigbee2mqtt/+"

# `zigbee2mqtt/bridge/...` porte l'etat du pont, pas des appuis. Il arrive sur
# le meme niveau que les appareils et doit etre ecarte.
NOMS_RESERVES = {"bridge"}

# Combien d'appuis on garde en memoire pour l'apprentissage. Assez pour qu'on
# ait le temps de regarder l'interface apres avoir appuye, pas assez pour que
# ce soit un historique : ce journal n'est jamais ecrit sur disque.
JOURNAL_MAX = 40

# Un appui produit souvent deux messages : celui de l'action, puis la
# republication de l'etat. Deux occurrences de la meme action a moins de ce
# delai comptent pour une.
ANTI_REBOND_S = 0.6

# L'ecoute d'apprentissage : ouverte pour un temps compte, comme l'appairage
# de zigbee2mqtt, puis refermee d'elle-meme. Sans elle, chaque telecommande de
# la maison venait s'inscrire dans la page, reglee ou non (retour du 18/09).
ECOUTE_S = 300
ECOUTE_MAX_S = 900


def _cle_appareil(source: str, identifiant: str) -> str:
    """Identifie un interrupteur, toutes sources confondues."""
    return f"{source}/{identifiant}"


def _entites_de(data) -> list:
    """Les entites visees par un appel de service : `entity_id`, seul ou en liste."""
    if not isinstance(data, dict):
        return []
    ids = data.get("entity_id")
    if isinstance(ids, str):
        return [ids]
    if isinstance(ids, list):
        return [i for i in ids if isinstance(i, str)]
    return []


class LoggiaInterrupteurs:
    """Ecoute les interrupteurs sans fil et execute leurs affectations."""

    # La fin de l'ecoute d'apprentissage, sur l'horloge monotone ; 0 = coupee.
    # Coupee au demarrage : on l'ouvre quand on veut apprendre un bouton.
    # Elle ne commande que ce qui s'INSCRIT — un bouton deja regle marche
    # toujours, ecoute ouverte ou non.
    ecoute_fin: float = 0.0

    def __init__(self, hass: HomeAssistant, store: "LoggiaStore", regles=None) -> None:
        self.hass = hass
        self.store = store
        # Le socle des regles. Un appui est une MAIN : ce qu'il commande est
        # gele, comme si on avait touche l'interrupteur mural — voir `_async_executer`.
        self.regles = regles
        # Ce qu'on a vu passer, du plus recent au plus ancien. En memoire seule.
        self.journal: list[dict[str, Any]] = []
        # Les appareils rencontres depuis le demarrage : cle -> fiche.
        self.vus: dict[str, dict[str, Any]] = {}
        self._dernier: dict[str, float] = {}
        self._defait: list[Any] = []
        # Ce qui est reellement branche. L'interface le montre : sans cela, une
        # page muette ne dit pas si personne n'appuie ou si personne n'ecoute.
        self.sources: dict[str, Any] = {"mqtt_present": False, "z2m": False, "zha": False, "deconz": False}
        demarrer(hass, self, self._async_demarrer(), "interrupteurs")

    async def _async_demarrer(self) -> None:
        """Branche les trois sources. L'absence de l'une n'empeche pas les autres."""
        # MQTT charge ou non : la reponse change le SENS d'un echec. Sans MQTT,
        # ne pas s'abonner est normal ; avec MQTT, c'est une panne, et elle
        # doit se voir dans le journal plutot que de se taire en debug.
        present = False
        try:
            present = "mqtt" in self.hass.config.components
        except Exception:  # noqa: BLE001
            present = False
        self.sources["mqtt_present"] = present
        try:
            from homeassistant.components import mqtt

            self._defait.append(
                await mqtt.async_subscribe(self.hass, TOPIC_Z2M, self._sur_mqtt, 0)
            )
            self.sources["z2m"] = True
            _LOGGER.info("Loggia : interrupteurs zigbee2mqtt a l'ecoute (%s)", TOPIC_Z2M)
        except Exception:  # noqa: BLE001
            if present:
                _LOGGER.warning(
                    "Loggia : MQTT est la mais l'abonnement %s a echoue — les "
                    "interrupteurs Zigbee2MQTT resteront muets", TOPIC_Z2M, exc_info=True
                )
            else:
                _LOGGER.debug("Loggia : pas d'integration MQTT, rien a ecouter de ce cote")

        # L'ecoute ne coute rien et ne dit rien : un abonnement a un nom
        # d'evenement reussit meme si personne ne l'emettra jamais. La source
        # n'est annoncee « a l'ecoute » que si l'integration est chargee (audit 18/09).
        self._defait.append(self.hass.bus.async_listen("zha_event", self._sur_zha))
        self.sources["zha"] = self._composant("zha")
        self._defait.append(self.hass.bus.async_listen("deconz_event", self._sur_deconz))
        self.sources["deconz"] = self._composant("deconz")

    def _composant(self, nom: str) -> bool:
        try:
            return nom in self.hass.config.components
        except Exception:  # noqa: BLE001
            return False

    # ── Les sources ───────────────────────────────────────────────────────
    @callback
    def _sur_mqtt(self, message) -> None:
        """Message zigbee2mqtt : le champ `action` du JSON, s'il y en a un."""
        topic = getattr(message, "topic", "") or ""
        nom = topic.split("/", 1)[1] if "/" in topic else ""
        if not nom or nom in NOMS_RESERVES:
            return
        charge = getattr(message, "payload", "") or ""
        try:
            data = json.loads(charge)
        except (TypeError, ValueError):
            return
        if not isinstance(data, dict):
            return
        action = data.get("action")
        # Zigbee2mqtt remet `action` a vide apres l'appui : ces messages-la ne
        # sont pas des appuis, ils en sont la retombee.
        if not isinstance(action, str) or not action:
            return
        self._traiter("z2m", nom, nom, action)

    @callback
    def _sur_zha(self, event: Event) -> None:
        """Evenement ZHA : `command` porte le bouton, l'IEEE identifie l'appareil."""
        d = event.data or {}
        ieee = d.get("device_ieee") or d.get("unique_id") or ""
        action = d.get("command") or ""
        if not ieee or not action:
            return
        args = d.get("args")
        # Deux boutons d'une meme telecommande partagent parfois la commande et
        # ne se distinguent que par l'argument (un numero de groupe).
        if isinstance(args, list) and args and isinstance(args[0], (int, str)):
            action = f"{action}_{args[0]}"
        self._traiter("zha", str(ieee), str(d.get("device_id") or ieee), str(action))

    @callback
    def _sur_deconz(self, event: Event) -> None:
        """Evenement deCONZ : `event` est un code numerique de bouton."""
        d = event.data or {}
        ident = d.get("unique_id") or d.get("id") or ""
        code = d.get("event")
        if not ident or code is None:
            return
        self._traiter("deconz", str(ident), str(d.get("id") or ident), str(code))

    # ── Le traitement commun ──────────────────────────────────────────────
    @callback
    def _traiter(self, source: str, identifiant: str, nom: str, action: str) -> None:
        cle = _cle_appareil(source, identifiant)
        maintenant = time.monotonic()
        empreinte = f"{cle}|{action}"
        precedent = self._dernier.get(empreinte)
        if precedent is not None and maintenant - precedent < ANTI_REBOND_S:
            return
        self._dernier[empreinte] = maintenant

        # Ecoute coupee : rien ne s'inscrit, et la page ne se remplit pas de
        # toutes les telecommandes de la maison. L'affectation, elle, part.
        if self.ecoute_active():
            appareil = self.vus.setdefault(
                cle, {"cle": cle, "source": source, "nom": nom, "actions": []}
            )
            appareil["nom"] = nom
            if action not in appareil["actions"]:
                appareil["actions"].append(action)

            self.journal.insert(0, {
                "cle": cle,
                "source": source,
                "nom": nom,
                "action": action,
                "ts": time.time(),
            })
            del self.journal[JOURNAL_MAX:]

        self.hass.async_create_task(self._async_executer(cle, action))

    # ── L'ecoute d'apprentissage ──────────────────────────────────────────
    def ecoute_active(self) -> bool:
        return time.monotonic() < self.ecoute_fin

    def ecoute_etat(self) -> dict[str, Any]:
        """Ouverte ou non, et pour combien de secondes encore."""
        reste = max(0, int(round(self.ecoute_fin - time.monotonic())))
        return {"active": reste > 0, "reste": reste}

    def ecouter(self, duree_s: int) -> dict[str, Any]:
        """Ouvre l'ecoute pour `duree_s` secondes (bornee), ou la coupe (0)."""
        try:
            duree = max(0, min(int(duree_s), ECOUTE_MAX_S))
        except (TypeError, ValueError):
            duree = 0
        self.ecoute_fin = time.monotonic() + duree if duree else 0.0
        return self.ecoute_etat()

    async def _async_executer(self, cle: str, action: str) -> None:
        """Appelle ce qui a ete affecte a ce bouton, s'il y a quelque chose."""
        table = await self.async_affectations()
        appareil = table.get(cle)
        if not isinstance(appareil, dict):
            return
        gestes = (appareil.get("actions") or {}).get(action)
        if not isinstance(gestes, list):
            return
        nom = str(appareil.get("nom") or cle.split("/", 1)[-1])
        for geste in gestes:
            if not isinstance(geste, dict):
                continue
            service = str(geste.get("service") or "")
            if service.count(".") != 1:
                _LOGGER.warning(
                    "Loggia : service mal forme pour %s / %s : %r", cle, action, service
                )
                continue
            domaine, nom_service = service.split(".", 1)
            data = geste.get("data")
            try:
                await self.hass.services.async_call(
                    domaine,
                    nom_service,
                    data if isinstance(data, dict) else {},
                    blocking=False,
                )
            except Exception:  # noqa: BLE001
                # Une cible disparue ne doit pas casser l'ecoute : l'appui
                # suivant doit continuer a marcher.
                _LOGGER.exception(
                    "Loggia : %s a echoue pour %s / %s", service, cle, action
                )
                continue
            # C'est un humain qui a appuye. L'appel part sans contexte
            # d'utilisateur — le socle ne le verrait pas —, alors on le lui
            # dit : ce que le bouton a commande est gele, comme apres un geste
            # sur l'interrupteur mural.
            if self.regles is not None:
                await self.regles.geler("interrupteurs", nom, _entites_de(data),
                                        quoi="bouton", motif="%s → %s" % (action, service))

    # ── Ce que l'interface lit et ecrit ───────────────────────────────────
    async def async_affectations(self) -> dict[str, Any]:
        table = await self.store.async_get_shared(CLE, {})
        return table if isinstance(table, dict) else {}

    async def async_etat(self) -> dict[str, Any]:
        """Tout ce qu'il faut a l'interface : le connu, le vu, le journal."""
        table = await self.async_affectations()
        # Un appareil affecte doit apparaitre meme si personne n'a appuye
        # dessus depuis le dernier redemarrage.
        appareils: dict[str, dict[str, Any]] = {}
        for cle, enr in table.items():
            if not isinstance(enr, dict):
                continue
            appareils[cle] = {
                "cle": cle,
                "source": str(enr.get("source") or cle.split("/", 1)[0]),
                "nom": str(enr.get("nom") or cle.split("/", 1)[-1]),
                "affectees": sorted((enr.get("actions") or {}).keys()),
                "vues": [],
            }
        for cle, vu in self.vus.items():
            fiche = appareils.setdefault(cle, {
                "cle": cle,
                "source": vu["source"],
                "nom": vu["nom"],
                "affectees": [],
            })
            fiche["nom"] = vu["nom"]
            fiche["vues"] = list(vu["actions"])
        return {
            "appareils": sorted(appareils.values(), key=lambda a: a["nom"].lower()),
            "affectations": table,
            "journal": list(self.journal),
            "sources": dict(self.sources),
            "ecoute": self.ecoute_etat(),
        }

    async def async_affecter(
        self, cle: str, action: str, gestes: list[Any], nom: str = ""
    ) -> dict[str, Any]:
        """Pose (ou retire, si `gestes` est vide) ce que fait un bouton."""
        table = dict(await self.async_affectations())
        enr = dict(table.get(cle) or {})
        enr.setdefault("source", cle.split("/", 1)[0])
        enr["nom"] = nom or enr.get("nom") or cle.split("/", 1)[-1]
        actions = dict(enr.get("actions") or {})
        if gestes:
            actions[action] = gestes
        else:
            actions.pop(action, None)
        enr["actions"] = actions
        if actions:
            table[cle] = enr
        else:
            # Plus un seul bouton affecte : l'appareil quitte la table plutot
            # que d'y rester en coquille vide.
            table.pop(cle, None)
        await self.store.async_set_shared(CLE, table)
        return table

    @callback
    def async_arreter(self) -> None:
        """Debranche les trois sources. Sert au rechargement de l'integration."""
        for defaire in self._defait:
            try:
                defaire()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia : desabonnement d'interrupteur sans effet")
        self._defait.clear()
