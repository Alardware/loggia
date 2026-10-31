"""Le carnet de l'eau : pourquoi la vanne est fermee, et le journal du jour (chantier IoT, etape 3 ; I28, I29, ADR 0217).

Pourquoi ce module existe
─────────────────────────
Home Assistant dit qu'une vanne est fermee ; il ne dit pas POURQUOI. La popup
de l'arrivee d'eau dit « Depuis 14:02 · fuite sous l'evier », « fermee a la
main », « par la maison » : ce carnet le tient, ecran ferme. Le journal de la
maison (500 lignes, tous modules) n'y suffirait pas une semaine d'absence.

Il suit les vannes d'eau de la maison - toute `valve` de classe `water`, et la
vanne designee dans Parametres > Alertes, une prise comprise - et les
detecteurs de fuite (la regle d'alertes.py : un `moisture` de modele ou de
groupe n'en est pas un, ni le besoin d'eau d'une plante). Il NOTE chaque
changement avec son contexte : la fermeture sur fuite (alertes.py la lui
annonce AVANT d'agir : le detecteur et son nom), une personne (le compte du
contexte), une automatisation ou un script (le nom que leur contexte porte),
l'appareil lui-meme (aucun contexte) ; et chaque detecteur mouille puis sec.

Il ne commande RIEN : fermer sur fuite est la regle d'alertes.py, rouvrir est
toujours le geste d'une personne. Une seule ecriture lui appartient - «
Fermer en cas de fuite » (I29), `actions.vanne.actif` de `loggia_alertes`, et
rien d'autre, sous le verrou du magasin.

Ce qui se calcule vit dans `eau_calcul.py`, pur ; ici le temps reel.
"""
from __future__ import annotations

import asyncio
import copy
import logging
import time
from typing import TYPE_CHECKING, Any

from homeassistant.core import HomeAssistant, callback

from .const import DOMAIN
from .eau_calcul import (cause, elaguer, est_detecteur, est_vanne_eau, etat_public, fiche_detecteur_neuve,
                         fiche_vanne_neuve, fusion_actif, lire_carnet, minuit, noter_detecteur, noter_vanne,
                         regle_de, sens_vanne, vannes_de_la_maison)
from .lumieres_calcul import garder_liens, lien_de
from .regles import demarrer

if TYPE_CHECKING:  # l'annotation seule — les tests chargent ce module hors paquet
    from .store import LoggiaStore

_LOGGER = logging.getLogger(__name__)

# La configuration de la regle : celle des alertes (alertes.py). Le
# rechargement suit la cle (rechargement.py).
CLE = "loggia_alertes"
# Les plantes : leur besoin d'eau n'est pas une fuite. La cle se recharge
# aussi (rechargement.py ; passe bis, point 13).
CLE_PLANTES = "loggia_plants"
AUTOMATISMES = ("automation_triggered", "script_started")
# Le carnet dans SON fichier de `.storage`, comme celui des lumieres.
CLE_ETAT = "loggia_eau_etat"
VERSION_ETAT = 1
DELAI_ECRITURE_S = 20.0
# Le dechargement lance l'ecriture de ce qui attendait ; l'instance suivante
# l'attend avant de relire (le motif de lumieres.py).
CLE_ECRITURE_FINALE = "eau_ecriture"
ATTENTE_ECRITURE_S = 10.0


def _horodatage(quand: Any) -> float | None:
    try:
        return float(quand.timestamp())
    except (AttributeError, TypeError, ValueError, OverflowError, OSError):
        return None


@callback
def etat_ecoute(data: Any) -> bool:
    """Ce que l'eau ecoute : vannes, prises et binaires — ceux que `_suivi`
    trie ensuite. Le reste de la maison ne reveille plus `_sur_etat` (28/10,
    ADR 0280)."""
    haid = data.get("entity_id") if isinstance(data, dict) else None
    return isinstance(haid, str) and haid.startswith(("valve.", "switch.", "binary_sensor."))


class LoggiaEau:
    """Le carnet des vannes d'eau et des detecteurs de fuite."""

    _depot = None

    def __init__(self, hass: HomeAssistant, store: "LoggiaStore") -> None:
        self.hass = hass
        self.store = store
        self.carnet: dict[str, Any] = {"vannes": {}, "detecteurs": {}, "journal": []}
        # Les fermetures que la regle de fuite vient d'annoncer : {vanne: {quand, detecteur, nom}}.
        self._annonces: dict[str, dict[str, Any]] = {}
        # {contexte: (instant, type, nom)} : qui a ouvert un contexte (`garder_liens`).
        self._liens: dict[str, tuple] = {}
        self._cfg: Any = None
        self._designee = ""
        self._plantes: list[str] = []
        self._ecriture = None
        self._au_demarrage = None
        self._arrete = False
        self._defait: list = []
        self._maintenant = time.time
        bus = getattr(hass, "bus", None)
        if bus is not None:
            # Filtree AVANT le rappel (28/10, ADR 0280) : vannes, prises et
            # binaires seulement — le reste de la maison ne reveille plus `_sur_etat`.
            self._defait.append(bus.async_listen("state_changed", self._sur_etat, event_filter=etat_ecoute))
            for nom in AUTOMATISMES:
                self._defait.append(bus.async_listen(nom, self._sur_automatisme))
            self._defait.append(bus.async_listen_once("homeassistant_stop", self._sur_arret))
        demarrer(hass, self, self._async_demarrer(), "eau")

    # ── Le demarrage ───────────────────────────────────────────────────────
    async def _async_attendre_ecriture_retiree(self) -> None:
        donnees = getattr(self.hass, "data", None)
        propres = donnees.get(DOMAIN) if isinstance(donnees, dict) else None
        tache = propres.pop(CLE_ECRITURE_FINALE, None) if isinstance(propres, dict) else None
        if tache is None:
            return
        try:
            await asyncio.wait({asyncio.ensure_future(tache)}, timeout=ATTENTE_ECRITURE_S)
        except Exception:  # noqa: BLE001
            _LOGGER.warning("Loggia eau : ecriture de l'instance retiree impossible a attendre", exc_info=True)

    async def _async_demarrer(self) -> None:
        from homeassistant.util import dt as dt_util

        await self._async_attendre_ecriture_retiree()
        try:
            brut = await self._store_etat().async_load()
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Loggia eau : carnet illisible, on repart a vide")
            brut = None
        self.carnet = lire_carnet(brut, minuit(dt_util.now()))
        await self._async_lire_config()
        self._oublier_prises_rendues()
        if self._arrete:
            return
        from homeassistant.helpers.start import async_at_started

        self._au_demarrage = async_at_started(self.hass, self._async_rattraper)

    async def _async_rattraper(self, _hass=None) -> None:
        """Home Assistant a demarre : chaque vanne et chaque detecteur suivis se
        comparent a ce que le carnet a vu en dernier, a l'heure de leur etat."""
        self._au_demarrage = None
        if self._arrete:
            return
        for etat in sorted(self._etats(), key=lambda e: e.entity_id):
            self._voir(etat, _horodatage(getattr(etat, "last_changed", None)))

    async def _async_lire_config(self) -> None:
        try:
            self._cfg = await self.store.async_get_shared(CLE)
            plantes = await self.store.async_get_shared(CLE_PLANTES)
        except Exception:  # noqa: BLE001
            _LOGGER.warning("Loggia eau : configuration illisible, la regle d'avant reste", exc_info=True)
            return
        self._designee = regle_de(self._cfg, [])["entite"]
        self._plantes = [p.get("base") for p in plantes if isinstance(p, dict) and isinstance(p.get("base"), str)] \
            if isinstance(plantes, list) else []

    # ── Qui est suivi ──────────────────────────────────────────────────────
    def _etats(self) -> list:
        try:
            return [e for e in self.hass.states.async_all() if self._suivi(e.entity_id, e.attributes)]
        except Exception:  # noqa: BLE001
            _LOGGER.warning("Loggia eau : etats illisibles", exc_info=True)
            return []

    def _plateforme(self, haid: str) -> Any:
        try:
            from homeassistant.helpers import entity_registry as er

            entree = er.async_get(self.hass).async_get(haid)
        except Exception:  # noqa: BLE001
            return None
        return getattr(entree, "platform", None)

    def _est_vanne(self, haid: str, attributs: Any) -> bool:
        return haid == self._designee or (haid.startswith("valve.") and est_vanne_eau(attributs))

    def _suivi(self, haid: Any, attributs: Any) -> bool:
        if not isinstance(haid, str):
            return False
        if self._est_vanne(haid, attributs):
            return True
        # La classe AVANT le registre (passe bis, point 12) : chaque porte, chaque mouvement qui changeait lisait le registre.
        if not haid.startswith("binary_sensor.") or not isinstance(attributs, dict) or attributs.get("device_class") != "moisture":
            return False
        return est_detecteur(haid, attributs, self._plateforme(haid), self._plantes)

    # ── Ce que le carnet note ──────────────────────────────────────────────
    @callback
    def _sur_automatisme(self, event) -> None:
        ident = getattr(getattr(event, "context", None), "id", None)
        if self._arrete or not isinstance(ident, str) or ident in self._liens:
            return
        maintenant = self._maintenant()
        self._liens[ident] = (maintenant, getattr(event, "event_type", None), (getattr(event, "data", None) or {}).get("name"))
        self._liens = garder_liens(self._liens, maintenant)

    @callback
    def _sur_etat(self, event) -> None:
        nouveau = (getattr(event, "data", None) or {}).get("new_state")
        if self._arrete or nouveau is None:
            return
        haid = getattr(nouveau, "entity_id", None)
        if not isinstance(haid, str) or not haid.startswith(("valve.", "switch.", "binary_sensor.")):
            return
        if self._suivi(haid, getattr(nouveau, "attributes", None)):
            self._voir(nouveau)

    def _voir(self, etat: Any, t: float | None = None) -> None:
        """Un etat d'une vanne ou d'un detecteur, a l'instant `t` (maintenant,
        sinon) : sa fiche se met a jour, le journal aussi, et le disque suit."""
        haid = etat.entity_id
        quand = self._maintenant() if t is None else t
        urgent = False
        if self._est_vanne(haid, getattr(etat, "attributes", None)):
            avant = self.carnet["vannes"].get(haid) or fiche_vanne_neuve()
            ctx = getattr(etat, "context", None)
            lien = lien_de(self._liens, getattr(ctx, "id", None), getattr(ctx, "parent_id", None), quand)
            sens = sens_vanne(haid, etat.state)
            # Une annonce de la regle ne vaut que pour une FERMETURE, une fois, et celle que Loggia a commandee - son contexte
            # (passe bis, point 10) : une fermeture a la main dans les deux minutes n'est pas « fuite ». Rouverte, elle tombe.
            if sens == "ouverte":
                self._annonces.pop(haid, None)
            annonce = self._annonces.pop(haid, None) if sens == "fermee" and self._de_loggia(ctx) else None
            apres, ligne = noter_vanne(avant, haid, etat.state, quand, cause(getattr(ctx, "user_id", None), lien, annonce, quand))
            if apres != avant:
                self.carnet["vannes"][haid] = apres
                # La cause d'une fermeture sur fuite s'ecrit TOUT DE SUITE (passe bis, point 7) : une coupure de courant dans les
                # 20 s la perdait, et c'est elle qui fait demander avant de rouvrir.
                urgent = (apres.get("cause") or {}).get("cause") == "fuite"
        else:
            avant = self.carnet["detecteurs"].get(haid) or fiche_detecteur_neuve()
            apres, ligne = noter_detecteur(avant, haid, etat.state, quand)
            if apres != avant:
                self.carnet["detecteurs"][haid] = apres
        if ligne is not None:
            self.carnet["journal"].append(ligne)
        if urgent and not self._arrete:
            self._annuler_ecriture()
            self.hass.async_create_task(self._async_ecrire())
        elif apres != avant or ligne is not None:
            self._programmer_ecriture()

    def _de_loggia(self, ctx: Any) -> bool:
        """Le changement vient-il d'un ordre de Loggia (le contexte qu'une regle a pose, regles.py) ? Sans le socle des regles,
        on ne sait pas : l'annonce vaut, comme avant."""
        donnees = getattr(self.hass, "data", None)
        regles = (donnees.get(DOMAIN) or {}).get("regles") if isinstance(donnees, dict) else None
        est_mien = getattr(regles, "est_mien", None)
        if not callable(est_mien):
            return True
        return any(isinstance(i, str) and est_mien(i) for i in (getattr(ctx, "id", None), getattr(ctx, "parent_id", None)))

    def _oublier_prises_rendues(self) -> None:
        """Une prise designee puis retiree de « Quelle vanne » (passe bis, point 14) redevient une prise : sa fiche quitte le carnet,
        et `loggia/eau/etat`."""
        for haid in [h for h in self.carnet["vannes"] if h.startswith("switch.") and h != self._designee]:
            self.carnet["vannes"].pop(haid, None)

    def annoncer_fermeture(self, vannes: Any, detecteur: Any, nom: Any) -> None:
        """La regle de fuite (alertes.py) va fermer ces vannes, a cause de ce
        detecteur : la fermeture qui suit, dans les deux minutes, est la sienne."""
        quand = self._maintenant()
        for v in vannes or ():
            if isinstance(v, str):
                self._annonces[v] = {"quand": quand, "detecteur": detecteur if isinstance(detecteur, str) else None,
                                     "nom": nom if isinstance(nom, str) else None}

    # ── Le disque ──────────────────────────────────────────────────────────
    def _store_etat(self):
        if self._depot is None:
            from homeassistant.helpers.storage import Store

            self._depot = Store(self.hass, VERSION_ETAT, CLE_ETAT)
        return self._depot

    def _programmer_ecriture(self) -> None:
        if self._arrete or self._ecriture is not None:
            return
        from homeassistant.helpers.event import async_call_later

        @callback
        def ecrire(_now) -> None:
            self._ecriture = None
            self.hass.async_create_task(self._async_ecrire())

        self._ecriture = async_call_later(self.hass, DELAI_ECRITURE_S, ecrire)

    def _annuler_ecriture(self) -> bool:
        if self._ecriture is None:
            return False
        try:
            self._ecriture()
        except Exception:  # noqa: BLE001
            _LOGGER.debug("Loggia eau : ecriture deja partie")
        self._ecriture = None
        return True

    async def _async_ecrire(self) -> None:
        """Le carnet sur le disque, elague, en COPIE. Rien apres un demarrage
        rate : le carnet n'y a pas ete relu, il effacerait celui du fichier."""
        if getattr(self, "demarrage", None) is False:
            return
        from homeassistant.util import dt as dt_util

        self.carnet["journal"] = elaguer(self.carnet["journal"], minuit(dt_util.now()))
        try:
            await self._store_etat().async_save(copy.deepcopy(self.carnet))
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Loggia eau : carnet non enregistre")

    async def _sur_arret(self, _event) -> None:
        if self._annuler_ecriture():
            await self._async_ecrire()

    # ── Ce que l'ecran lit, et la seule ecriture ───────────────────────────
    def _vannes(self) -> list[str]:
        attrs = {e.entity_id: getattr(e, "attributes", None) or {} for e in self._etats() if self._est_vanne(e.entity_id, e.attributes)}
        return vannes_de_la_maison(attrs, self._designee)

    async def async_etat(self, user: Any = None) -> dict[str, Any]:
        """`loggia/eau/etat` : la cause de chaque vanne fermee, les detecteurs,
        le journal du jour et la regle, sous les droits de LECTURE du compte."""
        from homeassistant.util import dt as dt_util

        from .discovery import _lecture_autorisee

        carnet = {**self.carnet, "journal": elaguer(self.carnet["journal"], minuit(dt_util.now()))}
        return etat_public(carnet, regle_de(self._cfg, self._vannes()), self._maintenant(), _lecture_autorisee(user))

    async def async_regler(self, actif: Any, *, user: Any = None) -> dict[str, Any]:
        """`loggia/eau/regle {actif}` (I29) : « Fermer en cas de fuite ». SEULE
        `actions.vanne.actif` change, dans `loggia_alertes` TELLE QU'ELLE EST SUR
        LE DISQUE, d'un seul tenant sous le verrou du magasin - jamais la cle
        entiere depuis le cache d'un onglet, qui effacait une configuration lue
        trop tard. Un format refuse n'ecrit rien ; le magasin signale la cle aux
        ecrans (ADR 0067). Rend l'etat, sous les droits du compte."""
        if not isinstance(actif, bool):
            raise ValueError("actif : un booleen, pas %r" % (actif,))
        self._cfg = await self.store.async_modifier_shared(CLE, lambda en_place: fusion_actif(en_place, actif))
        self.store.signaler_communes([CLE])
        return await self.async_etat(user)

    async def async_enregistrer(self, _patch: Any = None) -> None:
        """Le rechargement (rechargement.py) : `loggia_alertes` a change - un
        import, Parametres > Alertes -, ou `loggia_plants` (une plante ajoutee :
        son besoin d'eau n'est pas une fuite). La vanne designee se suit tout de
        suite ; celle qu'on a retiree n'est plus une vanne."""
        await self._async_lire_config()
        avant = len(self.carnet["vannes"])
        self._oublier_prises_rendues()
        if len(self.carnet["vannes"]) != avant:
            self._programmer_ecriture()
        for etat in self._etats():
            if etat.entity_id not in self.carnet["vannes"] and etat.entity_id not in self.carnet["detecteurs"]:
                self._voir(etat, _horodatage(getattr(etat, "last_changed", None)))

    @callback
    def async_arreter(self) -> None:
        self._arrete = True
        if self._au_demarrage:
            self._au_demarrage()
            self._au_demarrage = None
        for defaire in self._defait:
            try:
                defaire()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia eau : ecoute deja retiree")
        self._defait = []
        if self._annuler_ecriture():
            tache = self.hass.async_create_task(self._async_ecrire())
            donnees = getattr(self.hass, "data", None)
            if isinstance(donnees, dict):
                donnees.setdefault(DOMAIN, {})[CLE_ECRITURE_FINALE] = tache
