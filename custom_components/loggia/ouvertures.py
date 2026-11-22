"""Une ouverture restee ouverte : le telephone le dit (ADR 0388, ses maquettes du 22/11).

Pourquoi ce module existe
─────────────────────────
La popup d'une porte ou d'une fenetre porte « Me prevenir si elle reste
ouverte » — Jamais, 5, 10 ou 30 minutes — et « Prevenir des l'ouverture la
nuit ». Une minuterie ne vit pas dans un onglet : l'ecran peut etre ferme, la
tablette endormie. C'est donc le COMPOSANT qui ecoute et qui previent.

Le reglage vit dans la configuration commune, une table par entite
(`loggia_ouvertures` = {entite: {delai, nuit}}), ecrite par la popup
(`loggia/config/set`, reserve aux administrateurs comme toute cle de la
maison) et reprise aussitot par le rechargement (rechargement.py). Rien de
choisi : rien ne part.

Ce qui se passe
───────────────
  Une ouverture choisie s'ouvre — un VRAI passage de « off » a « on ». Un
  retour depuis un etat muet n'est pas une ouverture : le capteur revient, la
  porte etait peut-etre ouverte avant (la regle d'alertes.py).

  * Delai choisi : on compte. Toujours ouverte au bout du delai, une
    notification (« Porte d'entree est ouverte depuis 10 min »), puis un rappel
    toutes les 15 minutes tant qu'elle le reste, QUATRE au plus : un capteur
    bloque ouvert ne sonne pas toute la journee (« ne pas crier deux fois »,
    veilles.py). Fermee, muette, ou le reglage retire : on se tait.
  * La nuit cochee : de 22:00 a 07:00, ou quand personne n'est a la maison
    (`tous_absents`, presence.py : il faut au moins une personne suivie et
    joignable pour l'affirmer), une notification des l'ouverture.

  Les envois sont ORDINAIRES, jamais critiques : une ouverture n'est pas un
  danger (alertes.py le dit deja de l'ouverture pendant que l'alarme est
  armee) ; aux heures calmes, elle arrive sans sonner. Ils partent aux
  personnes presentes, a tout le monde quand la maison est vide
  (`pour="presents"`, destinataires.py).

  Au demarrage de Home Assistant, une ouverture deja ouverte recompte son
  delai depuis le demarrage : on ne sait pas depuis quand elle l'est, et
  `last_changed` vaut l'heure du redemarrage (ADR 0031). Elle ne declenche pas
  l'alerte de nuit : elle ne vient pas de s'ouvrir.
"""
from __future__ import annotations

import logging
import time
from typing import TYPE_CHECKING, Any

from homeassistant.core import HomeAssistant, callback

from .presence import tous_absents
from .regles import demarrer

if TYPE_CHECKING:  # l'annotation seule — les tests chargent ce module hors paquet
    from .store import LoggiaStore

_LOGGER = logging.getLogger(__name__)

CLE = "loggia_ouvertures"
MODULE = "ouvertures"
CLE_PRESENCE = "loggia_presence"
# Les delais de la popup, en minutes : 0 vaut « Jamais ».
DELAIS = (0, 5, 10, 30)
# Le rappel, une fois le delai passe : toutes les 15 minutes (sa maquette), quatre fois au plus.
REPRISE_MIN = 15
RAPPELS_MAX = 4
# La nuit de « Prevenir des l'ouverture la nuit » : de 22:00 a 07:00 (sa maquette ; `NUIT_OUVERTURE`, ouverture.js).
NUIT_DEBUT, NUIT_FIN = 22 * 60, 7 * 60

# Ce qui part au telephone : des constantes, recopiees dans CLES_TELEPHONE
# (scripts/textes_serveur.mjs) et traduites dans les sept catalogues.
# Le genre suit l'ecran : une porte, une fenetre, un garage sont « ouvertes » ;
# un ouvrant sans nom (`opening`) est « ouvert ».
MSG_RESTEE_OUVERTE = "{nom} est ouverte depuis {n} min"
MSG_RESTE_OUVERT = "{nom} est ouvert depuis {n} min"
MSG_VIENT_DE_S_OUVRIR = "{nom} vient de s’ouvrir"


def reglage(brut: Any) -> dict[str, Any]:
    """Le reglage d'une entite, borne : un delai de la liste (0 sinon), la nuit vraie ou fausse."""
    if not isinstance(brut, dict):
        return {"delai": 0, "nuit": False}
    try:
        delai = int(brut.get("delai") or 0)
    except (TypeError, ValueError):
        delai = 0
    return {"delai": delai if delai in DELAIS else 0, "nuit": brut.get("nuit") is True}


def config_de(brut: Any) -> dict[str, dict[str, Any]]:
    """La table, nettoyee : des capteurs binaires, et seulement ceux qui demandent quelque chose."""
    out: dict[str, dict[str, Any]] = {}
    if isinstance(brut, dict):
        for haid, r in brut.items():
            if not isinstance(haid, str) or not haid.startswith("binary_sensor."):
                continue
            propre = reglage(r)
            if propre["delai"] or propre["nuit"]:
                out[haid] = propre
    return out


def de_nuit(minutes: int) -> bool:
    """De 22:00 a 07:00, minuit compris : `minutes` depuis minuit, heure de la maison."""
    return minutes >= NUIT_DEBUT or minutes < NUIT_FIN


def minutes_ouverte(depuis: float, maintenant: float) -> int:
    """Depuis combien de minutes, arrondi, jamais negatif."""
    return max(0, int(round((maintenant - depuis) / 60)))


class LoggiaOuvertures:
    """Previent quand une ouverture choisie reste ouverte, ou s'ouvre la nuit."""

    def __init__(self, hass: HomeAssistant, store: "LoggiaStore", regles=None) -> None:
        self.hass = hass
        self.store = store
        # Le socle commun : l'envoi au telephone et son journal (regles.prevenir).
        self.regles = regles
        self.cfg: dict[str, dict[str, Any]] = {}
        # Les minuteries en cours, l'heure d'ouverture comptee, les rappels deja envoyes.
        self._minuteurs: dict[str, Any] = {}
        self._depuis: dict[str, float] = {}
        self._rappels: dict[str, int] = {}
        # Le delai avec lequel chaque ouverture comptee a ete armee : un reglage change en cours de compte le reprend.
        self._delais: dict[str, int] = {}
        self._defait: list[Any] = []
        self._au_demarrage = None
        demarrer(hass, self, self._async_demarrer(), MODULE)

    async def _async_demarrer(self) -> None:
        self.cfg = await self.async_config()
        self._reabonner()
        from homeassistant.helpers.start import async_at_started

        self._au_demarrage = async_at_started(self.hass, self._async_rattraper)

    async def async_config(self) -> dict[str, dict[str, Any]]:
        return config_de(await self.store.async_get_shared(CLE, None))

    async def async_enregistrer(self, patch: dict[str, Any]) -> dict[str, dict[str, Any]]:
        """Relit la table (le rechargement passe un patch VIDE) ou y pose `patch` ({entite: reglage}), puis se
        reabonne : une ouverture retiree se tait, une ouverture ajoutee et deja ouverte compte des maintenant."""
        if patch:
            def changer(brut: Any) -> dict[str, Any]:
                table = dict(brut) if isinstance(brut, dict) else {}
                table.update(patch)
                return config_de(table)

            self.cfg = config_de(await self.store.async_modifier_shared(CLE, changer))
        else:
            self.cfg = await self.async_config()
        for haid in list(self._depuis):
            delai = self.cfg.get(haid, {}).get("delai")
            if not delai:
                self._desarmer(haid)
            elif delai != self._delais.get(haid) and not self._rappels.get(haid):
                # Le delai change AVANT le premier envoi : le compte reprend avec le nouveau, depuis l'ouverture.
                self._delais[haid] = delai
                self._annuler(haid)
                reste = delai * 60 - (time.time() - self._depuis[haid])
                self._programmer(haid, max(1.0, reste))
        self._reabonner()
        self._revoir()
        return self.cfg

    def _reabonner(self) -> None:
        for defaire in self._defait:
            try:
                defaire()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia ouvertures : abonnement deja retire")
        self._defait.clear()
        suivis = sorted(self.cfg)
        if not suivis:
            return
        from homeassistant.helpers.event import async_track_state_change_event

        self._defait.append(async_track_state_change_event(self.hass, suivis, self._sur_ouverture))
        _LOGGER.info("Loggia ouvertures : %d ouvertures surveillees", len(suivis))

    async def _async_rattraper(self, _hass=None) -> None:
        self._au_demarrage = None
        self._revoir()

    def _revoir(self) -> None:
        """Les ouvertures suivies deja ouvertes comptent leur delai depuis maintenant ; rien d'autre ne part."""
        for haid, r in self.cfg.items():
            st = self.hass.states.get(haid)
            if r["delai"] and st is not None and str(st.state) == "on":
                self._armer(haid, r["delai"] * 60)

    @callback
    def _sur_ouverture(self, event) -> None:
        data = getattr(event, "data", None) or {}
        haid = data.get("entity_id")
        neuf, vieux = data.get("new_state"), data.get("old_state")
        if not haid or haid not in self.cfg:
            return
        etat = str(getattr(neuf, "state", "")).lower() if neuf is not None else ""
        avant = str(getattr(vieux, "state", "")).lower() if vieux is not None else ""
        if etat != "on":
            self._desarmer(haid)
            return
        if avant == "on":
            return
        r = self.cfg[haid]
        # Un retour depuis un etat muet n'est pas une ouverture : on compte, on n'alerte pas de nuit.
        if avant == "off" and r["nuit"]:
            self.hass.async_create_task(self._async_nuit(haid))
        if r["delai"]:
            self._armer(haid, r["delai"] * 60)

    def _armer(self, haid: str, secondes: float) -> None:
        # Deja comptee — minuterie en cours, ou rappels epuises : une relecture du reglage ne relance pas la serie.
        if haid in self._minuteurs or haid in self._depuis:
            return
        self._depuis[haid] = time.time()
        self._rappels[haid] = 0
        self._delais[haid] = int(secondes // 60)
        self._programmer(haid, secondes)

    def _programmer(self, haid: str, secondes: float) -> None:
        from homeassistant.helpers.event import async_call_later

        @callback
        def echu(_now) -> None:
            self._minuteurs.pop(haid, None)
            self.hass.async_create_task(self._async_echu(haid))

        self._minuteurs[haid] = async_call_later(self.hass, secondes, echu)

    def _desarmer(self, haid: str) -> None:
        self._depuis.pop(haid, None)
        self._rappels.pop(haid, None)
        self._delais.pop(haid, None)
        self._annuler(haid)

    def _annuler(self, haid: str) -> None:
        annule = self._minuteurs.pop(haid, None)
        if annule:
            try:
                annule()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia ouvertures : minuteur deja passe")

    async def _async_echu(self, haid: str) -> None:
        st = self.hass.states.get(haid)
        r = self.cfg.get(haid) or {}
        if st is None or str(st.state) != "on" or not r.get("delai") or haid not in self._depuis:
            self._desarmer(haid)
            return
        await self._async_restee(haid, st, minutes_ouverte(self._depuis[haid], time.time()))
        # Fermee pendant l'envoi : `_desarmer` est passe, on ne reprogramme rien.
        if haid not in self._depuis:
            return
        envoyes = self._rappels.get(haid, 0) + 1
        self._rappels[haid] = envoyes
        if envoyes <= RAPPELS_MAX:
            self._programmer(haid, REPRISE_MIN * 60)

    @staticmethod
    def _nom(st, haid: str) -> str:
        return str(((getattr(st, "attributes", None) or {}).get("friendly_name")) or haid)

    async def _async_restee(self, haid: str, st, n: int) -> None:
        nom = self._nom(st, haid)
        if (getattr(st, "attributes", None) or {}).get("device_class") == "opening":
            await self.regles.prevenir(MODULE, "restee", (MSG_RESTE_OUVERT, {"nom": nom, "n": n}), pour="presents")
        else:
            await self.regles.prevenir(MODULE, "restee", (MSG_RESTEE_OUVERTE, {"nom": nom, "n": n}), pour="presents")

    async def _personne(self) -> bool:
        """Personne a la maison : les personnes de la presence, sinon toutes celles de Home Assistant."""
        cfg = await self.store.async_get_shared(CLE_PRESENCE, None)
        personnes = list((cfg or {}).get("personnes") or []) if isinstance(cfg, dict) else []
        if not personnes:
            personnes = list(self.hass.states.async_entity_ids("person"))
        return tous_absents(self.hass.states, personnes)

    async def _async_nuit(self, haid: str) -> None:
        from homeassistant.util import dt as dt_util

        maintenant = dt_util.now()
        if not (de_nuit(maintenant.hour * 60 + maintenant.minute) or await self._personne()):
            return
        st = self.hass.states.get(haid)
        await self.regles.prevenir(MODULE, "nuit", (MSG_VIENT_DE_S_OUVRIR, {"nom": self._nom(st, haid)}), pour="presents")

    async def async_etat(self) -> dict[str, Any]:
        """Ce qui est suivi et ce qui compte, pour les diagnostics."""
        return {"config": self.cfg, "en_cours": {h: {"depuis": d, "rappels": self._rappels.get(h, 0)} for h, d in self._depuis.items()}}

    def async_arreter(self) -> None:
        if self._au_demarrage:
            self._au_demarrage()
            self._au_demarrage = None
        for haid in list(self._minuteurs):
            self._desarmer(haid)
        for defaire in self._defait:
            try:
                defaire()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia ouvertures : desabonnement sans effet")
        self._defait.clear()
