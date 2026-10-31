"""Le carnet des lumieres : chaque allumage, extinction et reglage, avec son niveau et son contexte (chantier Lumieres, L1).

Pourquoi ce module existe
─────────────────────────
Le logbook de Home Assistant ne dit que les passages on/off : ni le niveau
d'un allumage, ni un reglage, ni le niveau d'une lampe eteinte - Home
Assistant efface `brightness` a l'extinction. La popup d'une lumiere dit
« Allumee a 45 % » et « Reglee a 60 % », et une lampe eteinte garde son
repere gris (« se rallumera a 80 % ») : ce carnet le tient, ecran ferme.

Il NOTE des faits - l'etat, le niveau, le contexte, le nom d'une
automatisation ou d'un script - et ne juge rien : le « qui » se range a
l'ecran, avec la regle commune aux prises (L12). Il ne commande rien, et
n'ecrit rien au journal de Loggia.

Ce qui se calcule vit dans `lumieres_calcul.py`, pur ; ici le temps reel : le
registre, les abonnements, le disque.
"""
from __future__ import annotations

import asyncio
import copy
import logging
import time
from typing import TYPE_CHECKING, Any

from homeassistant.core import HomeAssistant, callback

from .const import DOMAIN
from .lumieres_calcul import (annoncer_fondu, clore_demarrage, contexte, elaguer, fiche_neuve, fin_demarrage,
                              garder_liens, lien_de, lire_carnet, noter, sans_doute_demarrage, sans_fondu,
                              sans_rallumage_en_doute, veille_a_minuit)
from .lumieres_maison import (CLE_ENTITES, CLE_INTERRUPTEURS, async_interrupteurs_declares, lire_registre,
                              lumieres_de_la_maison)
from .regles import demarrer

if TYPE_CHECKING:  # l'annotation seule — les tests chargent ce module hors paquet
    from .store import LoggiaStore

_LOGGER = logging.getLogger(__name__)

# Les interrupteurs declares lumieres (Parametres > Entites) : suivis comme
# des lampes. Le rechargement suit la cle (rechargement.py).
CLE = CLE_INTERRUPTEURS
# Ce qui ouvre un contexte au nom d'une automatisation ou d'un script (spec 6.1).
AUTOMATISMES = ("automation_triggered", "script_started")
# Le carnet dans SON fichier de `.storage`, comme l'etat des prises : il
# survit au redemarrage.
CLE_ETAT = "loggia_lumieres_etat"
VERSION_ETAT = 1
# L'ecriture est differee, comme celle du journal (`regles.py`) : une soiree
# de reglages, ce sont des dizaines de notes en quelques minutes.
DELAI_ECRITURE_S = 20.0
# Quand seul `dernier` a change - un blanc qui glisse de 10 K, un eclairage
# adaptatif -, le fichier entier (0,3 Mo, copie comprise) ne se reecrit pas toutes
# les 20 s, toute la journee : cinq minutes. Une note ou un changement de `vu`
# gardent DELAI_ECRITURE_S, et ce qui attend part toujours au dechargement et a
# l'arret de Home Assistant.
DELAI_ECRITURE_LENT_S = 300.0
# Le dechargement de l'integration lance l'ecriture de ce qui attendait, et
# l'instance suivante relirait le fichier PENDANT cette ecriture, puis
# l'ecraserait de ce qu'elle a lu. La tache reste donc dans `hass.data[DOMAIN]`
# (le dechargement n'en retire que les modules) : la suivante l'attend avant de
# relire - ATTENTE_ECRITURE_S au plus, un disque qui s'etrangle n'empeche pas le
# carnet de demarrer.
CLE_ECRITURE_FINALE = "lumieres_ecriture"
ATTENTE_ECRITURE_S = 10.0


def _horodatage(quand: Any) -> float | None:
    """Un instant de Home Assistant (`last_changed`), en secondes ; None sinon."""
    try:
        return float(quand.timestamp())
    except (AttributeError, TypeError, ValueError, OverflowError, OSError):
        return None


class LoggiaLumieres:
    """Le carnet des lumieres de la maison."""

    def __init__(self, hass: HomeAssistant, store: "LoggiaStore") -> None:
        self.hass = hass
        self.store = store
        # {entity_id: fiche} (`lumieres_calcul`).
        self.carnet: dict[str, dict[str, Any]] = {}
        # Les lampes suivies (L11) : les `light.*` sans categorie, et les
        # interrupteurs declares lumieres.
        self.suivies: set[str] = set()
        # {identifiant de contexte: (instant, type, nom)} : qui a ouvert un
        # contexte, garde une heure (`garder_liens`).
        self._liens: dict[str, tuple] = {}
        self._ecoutees: list[str] = []
        self._ecoute = None
        self._ecriture = None
        # L'ecriture EN VOL : l'echeance a sonne, la tache est partie. Un arret
        # qui arrive la la depose pour l'instance suivante (`async_arreter`).
        self._ecriture_en_cours = None
        self._ecriture_jeton = 0
        # Le delai de l'ecriture posee (`_programmer_ecriture`).
        self._delai_ecriture = DELAI_ECRITURE_S
        self._depot = None
        self._registre_dit = False
        self._au_demarrage = None
        self._arrete = False
        self._defait: list = []
        self._defait_arret = None
        # La fenetre de demarrage (doute D1, `lumieres_calcul.noter`) : ouverte des la
        # naissance du carnet, le silence d'une lampe n'y fait pas encore de note. Elle
        # se ferme FENETRE_DEMARRAGE_S apres que Home Assistant a demarre
        # (`_async_rattraper`), FENETRE_DEMARRAGE_MAX_S au plus apres la naissance.
        self._naissance = time.time()
        self._fenetre_demarrage = True
        self._echeance_demarrage = None
        bus = getattr(hass, "bus", None)
        if bus is not None:
            # Des la naissance : une automatisation du demarrage peut allumer une
            # lampe avant que le suivi commence, et le rattrapage lit alors le
            # contexte de son etat.
            for nom in AUTOMATISMES:
                self._defait.append(bus.async_listen(nom, self._sur_automatisme))
            # A l'arret de Home Assistant, ce que l'ecriture differee retient part
            # tout de suite, comme le journal (`regles._sur_arret`).
            self._defait_arret = bus.async_listen_once("homeassistant_stop", self._sur_arret)
        # Le garde-fou : meme si Home Assistant ne dit jamais qu'il a demarre.
        self._poser_fin_demarrage(None)
        demarrer(hass, self, self._async_demarrer(), "lumieres")

    async def _async_attendre_ecriture_retiree(self) -> None:
        """L'ecriture finale de l'instance que celle-ci remplace (rechargement de
        l'integration), s'il y en a une : on l'attend, ATTENTE_ECRITURE_S au plus.
        Elle ne s'attend qu'une fois."""
        donnees = getattr(self.hass, "data", None)
        propres = donnees.get(DOMAIN) if isinstance(donnees, dict) else None
        tache = propres.pop(CLE_ECRITURE_FINALE, None) if isinstance(propres, dict) else None
        if tache is None:
            return
        try:
            _, restantes = await asyncio.wait({asyncio.ensure_future(tache)}, timeout=ATTENTE_ECRITURE_S)
        except Exception:  # noqa: BLE001
            _LOGGER.warning("Loggia lumieres : ecriture de l'instance retiree impossible a attendre", exc_info=True)
            return
        if restantes:
            _LOGGER.warning("Loggia lumieres : l'ecriture de l'instance retiree n'a pas fini en %s s, "
                            "on relit le fichier quand meme", ATTENTE_ECRITURE_S)

    async def _async_demarrer(self) -> None:
        from homeassistant.util import dt as dt_util

        # Un rechargement de l'integration : l'instance retiree finit d'ecrire ses
        # dernieres notes. On relit APRES elle, pas pendant - sinon on lirait
        # l'ancien fichier, et notre premiere ecriture effacerait ces notes.
        await self._async_attendre_ecriture_retiree()
        # Le carnet garde (spec 6.1). Illisible, on repart a vide et on le dit,
        # comme le journal (`regles._charger`) : un carnet abime ne vaut pas
        # qu'on cesse de noter.
        try:
            brut = await self._store_etat().async_load()
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Loggia lumieres : carnet illisible, on repart a vide")
            brut = None
        self.carnet = lire_carnet(brut, veille_a_minuit(dt_util.now()))
        if self._arrete:
            return
        # Le suivi attend que Home Assistant ait FINI de demarrer : avant, une
        # integration n'a peut-etre pas encore cree ses lampes.
        from homeassistant.helpers.start import async_at_started

        self._au_demarrage = async_at_started(self.hass, self._async_rattraper)

    async def _async_rattraper(self, _hass=None) -> None:
        """Home Assistant a demarre : on recense, on ecoute, et ce qui a change
        pendant l'arret se note - chaque lampe suivie se compare a ce que le
        carnet a vu en dernier, a l'heure de son etat (`last_changed`)."""
        self._au_demarrage = None
        if self._arrete:
            return
        # La fenetre de demarrage se ferme FENETRE_DEMARRAGE_S plus tard. `async_at_started`
        # appelle ici quand `hass.state` passe a `running` - au signal
        # `homeassistant_started`, ou tout de suite s'il tournait deja (rechargement).
        self._poser_fin_demarrage(time.time())
        bus = getattr(self.hass, "bus", None)
        if bus is not None:
            self._defait.append(bus.async_listen("entity_registry_updated", self._sur_registre))
        await self._async_recenser()
        for haid in sorted(self.suivies):
            etat = self.hass.states.get(haid)
            self._voir(haid, etat, _horodatage(getattr(etat, "last_changed", None)))

    # ── Les lampes de la maison (L11) ──────────────────────────────────────
    def _registre(self) -> list | None:
        """Les entrees du registre des entites, ou None - en le DISANT une fois."""
        try:
            from homeassistant.helpers import entity_registry as er

            return list(er.async_get(self.hass).entities.values())
        except Exception:  # noqa: BLE001
            if not self._registre_dit:
                self._registre_dit = True
                _LOGGER.warning("Loggia lumieres : registre illisible, les lampes suivies restent les memes",
                                exc_info=True)
            return None

    async def _interrupteurs_lumieres(self) -> set[str]:
        """Les interrupteurs declares lumieres, lus comme `prises.py` les lit
        (`cvEstLumiere` de l'ecran) : `loggia_switchlights`, sinon `switchLights`
        de `loggia_entities` (`lumieres_maison.interrupteurs_declares`)."""
        return await async_interrupteurs_declares(self.store)

    async def _async_recenser(self) -> None:
        """Les lampes suivies, relues (L11) : les lumieres de la maison, par la
        definition commune a toutes les regles (`lumieres_maison`, audit du
        19/10) - les `light.*` du registre sans categorie, ni cachees ni
        desactivees (la LED d'une borne Wi-Fi, `config`, n'est pas une lumiere
        de la maison), celles que le registre ne connait pas (YAML), et les
        interrupteurs declares lumieres ; un groupe s'efface devant ses
        membres. Le carnet ne garde qu'elles. Un registre illisible garde ce
        qu'on suivait."""
        entrees = self._registre()
        if entrees is None:
            return
        declares = await self._interrupteurs_lumieres()
        registre = lire_registre(entrees)
        # Les `light.*` du registre - meme sans etat encore, une ampoule qu'on
        # vient d'appairer -, et celles qui n'ont qu'un etat.
        attributs: dict[str, dict[str, Any]] = {h: {} for h in registre if h.startswith("light.")}
        for haid in list(attributs) + list(self.hass.states.async_entity_ids("light")) + sorted(declares):
            etat = self.hass.states.get(haid)
            if etat is not None:
                attributs[haid] = dict(getattr(etat, "attributes", None) or {})
        suivies = set(lumieres_de_la_maison(attributs, registre, declares))
        if self._arrete:
            return
        self.suivies = suivies
        if set(self.carnet) - suivies:
            self.carnet = {h: f for h, f in self.carnet.items() if h in suivies}
            self._programmer_ecriture()
        # Une lampe qui entre au suivi en cours de route - un interrupteur qu'on
        # declare lumiere, une ampoule qu'on vient d'appairer - n'a pas de `vu` : son
        # premier geste passerait pour son premier etat vu, et ne se noterait pas. On
        # la prend dans l'etat ou elle est ; `noter` ecarte `unknown`, `unavailable` et
        # `restored` (relecture du 14/10), et la lampe attend alors son vrai etat. Une
        # lampe renommee a emporte sa fiche (`_sur_registre`) : elle n'est pas neuve.
        for haid in sorted(h for h in suivies if not (self.carnet.get(h) or {}).get("vu")):
            self._voir(haid, self.hass.states.get(haid))
        self._reabonner()

    def _reabonner(self) -> None:
        """Ecoute les lampes suivies, et elles seules."""
        ids = sorted(self.suivies)
        if ids == self._ecoutees:
            return
        self._retirer_ecoute()
        self._ecoutees = ids
        if ids:
            from homeassistant.helpers.event import async_track_state_change_event

            self._ecoute = async_track_state_change_event(self.hass, ids, self._sur_etat)

    def _retirer_ecoute(self) -> None:
        if self._ecoute is not None:
            try:
                self._ecoute()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia lumieres : ecoute deja retiree")
            self._ecoute = None
        self._ecoutees = []

    def _est_une_lumiere(self, haid: Any) -> bool:
        """Une entite dont le registre nous concerne : un `light.*`, ou un
        interrupteur qu'on suit - declare lumiere."""
        return isinstance(haid, str) and (haid.startswith("light.") or haid in self.suivies or haid in self.carnet)

    @callback
    def _sur_registre(self, event) -> None:
        """Le registre change : une lampe ajoutee, retiree, renommee, classee. On
        ne recense que pour une lumiere - un `light.*`, ou un interrupteur
        declare lumiere (audit du 19/10). Une lampe RENOMMEE (`action: update` et
        `old_entity_id`) emporte sa fiche - notes, `vu`, dernier niveau - sous son
        nouveau nom : sans cela son historique partait avec l'ancien (relecture du
        14/10). Un interrupteur declare renomme emporte aussi sa DECLARATION
        (`_async_redeclarer`) : sans cela `loggia_switchlights` nommait un
        interrupteur qui n'existait plus, et la fiche transferee repartait au
        recensement suivant."""
        d = getattr(event, "data", None) or {}
        nouveau, ancien = d.get("entity_id"), d.get("old_entity_id")
        if self._arrete or not any(self._est_une_lumiere(h) for h in (nouveau, ancien)):
            return
        renomme = (d.get("action") == "update" and isinstance(nouveau, str) and isinstance(ancien, str)
                   and ancien != nouveau)
        if renomme and ancien in self.carnet and nouveau not in self.carnet:
            self.carnet[nouveau] = self.carnet.pop(ancien)
            self._programmer_ecriture()
        if renomme and ancien.startswith("switch.") and ancien in self.suivies:
            self.hass.async_create_task(self._async_redeclarer(ancien, nouveau))
            return
        self.hass.async_create_task(self._async_recenser())

    async def _async_redeclarer(self, ancien: str, nouveau: str) -> None:
        """La declaration d'un interrupteur lumiere suit son renommage : dans
        `loggia_switchlights`, sinon dans `switchLights` de `loggia_entities` -
        la ou elle vit (`_interrupteurs_lumieres`). Puis on recense. Un magasin
        qui refuse (un plafond) se dit, et le recensement se fait quand meme."""
        def remplacer(liste: Any) -> Any:
            return [nouveau if h == ancien else h for h in liste] if isinstance(liste, list) else liste

        def dans_les_entites(brut: Any) -> Any:
            if not isinstance(brut, dict) or not isinstance(brut.get("switchLights"), list):
                return brut
            return {**brut, "switchLights": remplacer(brut["switchLights"])}

        try:
            if await self.store.async_get_shared(CLE, None) is not None:
                await self.store.async_modifier_shared(CLE, remplacer)
            else:
                await self.store.async_modifier_shared(CLE_ENTITES, dans_les_entites)
        except Exception:  # noqa: BLE001
            _LOGGER.warning("Loggia lumieres : la declaration de %s n'a pas pu suivre son renommage en %s",
                            ancien, nouveau, exc_info=True)
        await self._async_recenser()

    # ── Ce que le carnet note (spec 6.1) ───────────────────────────────────
    @callback
    def _sur_automatisme(self, event) -> None:
        """`automation_triggered`, `script_started` : le contexte qu'ils ouvrent
        porte le nom de l'automatisation ou du script. Le premier venu le garde :
        une automatisation qui lance un script reste l'automatisation, comme
        dans le logbook."""
        ident = getattr(getattr(event, "context", None), "id", None)
        if self._arrete or not isinstance(ident, str) or ident in self._liens:
            return
        maintenant = time.time()
        self._liens[ident] = (maintenant, getattr(event, "event_type", None),
                              (getattr(event, "data", None) or {}).get("name"))
        self._liens = garder_liens(self._liens, maintenant)

    @callback
    def _sur_etat(self, event) -> None:
        d = getattr(event, "data", None) or {}
        haid = d.get("entity_id")
        if haid in self.suivies:
            self._voir(haid, d.get("new_state"))

    def _voir(self, haid: str, etat: Any, t: float | None = None) -> None:
        """Un etat de la lampe, a l'instant `t` (maintenant, sinon) : sa fiche se
        met a jour (`noter`), et le disque suit."""
        if self._arrete or etat is None:
            return
        quand = time.time() if t is None else t
        ctx = getattr(etat, "context", None)
        lien = lien_de(self._liens, getattr(ctx, "id", None), getattr(ctx, "parent_id", None), quand)
        avant = self.carnet.get(haid) or fiche_neuve()
        apres = noter(avant, getattr(etat, "state", None), getattr(etat, "attributes", None), quand,
                      contexte(getattr(ctx, "user_id", None), lien), demarrage=self._fenetre_demarrage,
                      origine=getattr(ctx, "id", None))
        if apres != avant:
            self.carnet[haid] = apres
            # Une note, ou un changement de ce que la lampe etait (`vu`) : l'ecriture
            # part dans les 20 s. Seul `dernier` a bouge - un blanc qui glisse de
            # 10 K : le fichier entier ne se reecrit pas pour si peu.
            presse = any(apres[k] != avant[k] for k in ("vu", "niveau_a", "evenements"))
            self._programmer_ecriture(DELAI_ECRITURE_S if presse else DELAI_ECRITURE_LENT_S)

    @callback
    def annoncer_fondu(self, haids: Any, duree: Any, eteindre: bool, qui: Any = None, origine: Any = None) -> None:
        """Un fondu que Loggia demande MAINTENANT a ces lampes (un scenario, ADR
        0304), au nom du compte `qui`, par l'ordre de contexte `origine` (`Context.id`,
        que portent ses premiers paliers) : le carnet ne note pas ses paliers
        (`lumieres_calcul.annoncer_fondu`). Appele AVANT l'ordre, dont les etats
        suivent. Une lampe que le carnet ne suit pas est ignoree ; rien ne
        s'ecrit - un fondu ne dure que quelques minutes."""
        if self._arrete:
            return
        maintenant = time.time()
        for haid in haids if isinstance(haids, (list, tuple, set)) else ():
            if haid in self.suivies:
                self.carnet[haid] = annoncer_fondu(self.carnet.get(haid) or fiche_neuve(), maintenant, duree,
                                                   eteindre, qui, origine)

    # ── La fenetre de demarrage (doute D1) ─────────────────────────────────
    def _poser_fin_demarrage(self, demarre: float | None) -> None:
        """Pose l'echeance qui ferme la fenetre de demarrage (`fin_demarrage`) : a la
        naissance, le garde-fou ; quand Home Assistant a demarre (`demarre`), la
        vraie, qui le remplace. Deja passee, la fenetre se ferme tout de suite."""
        if not self._fenetre_demarrage or self._arrete:
            return
        self._annuler_fin_demarrage()
        delai = fin_demarrage(self._naissance, demarre) - time.time()
        if delai <= 0:
            self._fermer_demarrage()
            return
        from homeassistant.helpers.event import async_call_later

        @callback
        def fermer(_now) -> None:
            self._echeance_demarrage = None
            self._fermer_demarrage()

        self._echeance_demarrage = async_call_later(self.hass, delai, fermer)

    def _annuler_fin_demarrage(self) -> None:
        if self._echeance_demarrage is None:
            return
        try:
            self._echeance_demarrage()
        except Exception:  # noqa: BLE001
            _LOGGER.debug("Loggia lumieres : fin de la fenetre de demarrage deja partie")
        self._echeance_demarrage = None

    def _fermer_demarrage(self) -> None:
        """La fenetre de demarrage se ferme : une lampe encore muette n'attendait pas
        son integration, elle ne repond plus - sa note s'ecrit, a l'heure ou elle s'est
        tue (`clore_demarrage`). Hors de la fenetre, un silence se note aussitot."""
        self._fenetre_demarrage = False
        self._annuler_fin_demarrage()
        if self._arrete:
            return
        closes = {h: clore_demarrage(f) for h, f in self.carnet.items()}
        if any(closes[h] is not f for h, f in self.carnet.items()):
            self.carnet = closes
            self._programmer_ecriture()

    # ── Le disque ──────────────────────────────────────────────────────────
    def _store_etat(self):
        if self._depot is None:
            from homeassistant.helpers.storage import Store

            self._depot = Store(self.hass, VERSION_ETAT, CLE_ETAT)
        return self._depot

    def _programmer_ecriture(self, delai: float = DELAI_ECRITURE_S) -> None:
        """Ecrit le carnet, mais pas a chaque note : `delai` apres la premiere, comme
        le journal. Une ecriture deja posee reste, elle porte tout le carnet - sauf
        si celle-ci est plus pressee : une note ne fait pas attendre cinq minutes
        parce qu'un blanc glissait deja."""
        if self._arrete:
            return
        if self._ecriture is not None:
            if delai >= self._delai_ecriture:
                return
            self._annuler_ecriture()
        from homeassistant.helpers.event import async_call_later

        @callback
        def ecrire(_now) -> None:
            self._ecriture = None
            self._ecriture_jeton = getattr(self, "_ecriture_jeton", 0) + 1
            self._ecriture_en_cours = self.hass.async_create_task(self._async_ecrire_en_vol(self._ecriture_jeton))

        self._delai_ecriture = delai
        self._ecriture = async_call_later(self.hass, delai, ecrire)

    async def _async_ecrire_en_vol(self, jeton: int) -> None:
        """L'ecriture de l'echeance, qui s'oublie une fois finie - la sienne
        seulement (`jeton`), pas une plus recente."""
        try:
            await self._async_ecrire()
        finally:
            if getattr(self, "_ecriture_jeton", 0) == jeton:
                self._ecriture_en_cours = None

    def _ecriture_en_vol(self) -> Any:
        """La tache d'ecriture partie et pas encore finie, s'il y en a une."""
        tache = self._ecriture_en_cours
        fini = getattr(tache, "done", None)
        return None if tache is None or (callable(fini) and fini()) else tache

    def _annuler_ecriture(self) -> bool:
        """Annule l'ecriture differee ; vrai si elle attendait."""
        if self._ecriture is None:
            return False
        try:
            self._ecriture()
        except Exception:  # noqa: BLE001
            _LOGGER.debug("Loggia lumieres : ecriture deja partie")
        self._ecriture = None
        return True

    async def _async_ecrire(self) -> None:
        """Le carnet sur le disque, elague, en COPIE : la boucle peut le changer
        pendant que Home Assistant l'ecrit. Rien apres un demarrage rate
        (`regles.demarrer`) : le carnet n'y a pas ete relu, il effacerait celui
        du fichier."""
        if getattr(self, "demarrage", None) is False:
            return
        from homeassistant.util import dt as dt_util

        depuis = veille_a_minuit(dt_util.now())
        self.carnet = {h: dict(f, evenements=elaguer(f["evenements"], depuis)) for h, f in self.carnet.items()}
        # Le fichier garde ce que le carnet DIT : un rallumage encore en doute - peut-etre
        # l'echo d'une extinction en fondu - ne s'ecrit pas. Ecrit au milieu de l'echo, il
        # laissait « Allumee a 2 % » et un faux dernier niveau, que le redemarrage ne
        # savait plus reconnaitre (`sans_rallumage_en_doute`). Une lampe en doute de
        # demarrage s'y ecrit telle qu'avant son silence, sans le doute : un redemarrage
        # en pleine fenetre repart de ce qu'elle etait (`sans_doute_demarrage`, D1).
        maintenant = time.time()
        # Un fondu annonce (ADR 0304) ne s'ecrit pas non plus : il ne dure que quelques minutes.
        dit = {h: sans_rallumage_en_doute(sans_doute_demarrage(sans_fondu(f)), maintenant) for h, f in self.carnet.items()}
        try:
            await self._store_etat().async_save(copy.deepcopy(dit))
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Loggia lumieres : carnet non enregistre")

    async def _sur_arret(self, _event) -> None:
        """L'arret de Home Assistant : ce que l'ecriture differee retient part
        maintenant. Home Assistant retire lui-meme une ecoute `once` apres
        l'avoir declenchee : la garder ferait mentir `async_arreter`. La fenetre de
        demarrage ne se ferme plus : un doute ne devient pas une note pendant l'arret,
        apres l'ecriture qui ne l'a pas garde (D1)."""
        self._defait_arret = None
        self._annuler_fin_demarrage()
        if self._annuler_ecriture():
            await self._async_ecrire()

    # ── Ce que l'ecran lit (spec 6.2) ──────────────────────────────────────
    def _fiche_dite(self, haid: str, maintenant: float) -> dict[str, Any] | None:
        """La fiche d'une lampe telle que le carnet la dit : un rallumage encore en
        doute ne s'y lit pas encore (`sans_rallumage_en_doute`). None : pas de fiche."""
        fiche = self.carnet.get(haid)
        return sans_rallumage_en_doute(fiche, maintenant) if fiche else None

    async def async_etat(self, user: Any = None) -> dict[str, Any]:
        """`loggia/lumieres/etat` : le dernier niveau de chaque lampe suivie que
        ce compte peut lire (`_lecture_autorisee`, la garde de l'etat du
        chauffage). `dernier` vaut None tant que le carnet ne l'a pas vue
        allumee ; pendant un rallumage en doute, c'est encore celui d'avant."""
        from .discovery import _lecture_autorisee

        lecture = _lecture_autorisee(user)
        maintenant = time.time()
        return {"maintenant": maintenant,
                "lumieres": {h: {"dernier": (self._fiche_dite(h, maintenant) or {}).get("dernier")}
                             for h in sorted(self.suivies) if lecture is None or lecture(h)}}

    async def async_journal(self, haid: str, user: Any = None) -> dict[str, Any]:
        """`loggia/lumieres/journal` : les notes d'une lampe depuis la veille a
        00:00, dans l'ordre du temps, et la derniere d'avant (l'etat quand la
        fenetre s'ouvre). Un rallumage encore en doute n'y est pas encore. Une
        lampe que ce compte ne peut pas lire est refusee (PermissionError) ; une
        que le carnet ne suit pas n'a rien."""
        from homeassistant.util import dt as dt_util

        from .discovery import _lecture_autorisee

        lecture = _lecture_autorisee(user)
        if lecture is not None and not lecture(haid):
            raise PermissionError("pas le droit de lire %s" % haid)
        fiche = self._fiche_dite(haid, time.time())
        notes = elaguer(fiche["evenements"], veille_a_minuit(dt_util.now())) if fiche else []
        return {"evenements": [dict(n) for n in notes]}

    async def async_enregistrer(self, _patch: Any = None) -> None:
        """Le rechargement (rechargement.py) : `loggia_switchlights` a change - un
        import, Parametres > Entites, une prise declaree lumiere. Le carnet n'a
        pas de reglage a lui : il recense, et l'interrupteur declare se suit
        tout de suite."""
        await self._async_recenser()

    @callback
    def async_arreter(self) -> None:
        self._arrete = True
        if self._au_demarrage:
            self._au_demarrage()
            self._au_demarrage = None
        self._annuler_fin_demarrage()
        self._retirer_ecoute()
        for defaire in self._defait:
            try:
                defaire()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia lumieres : ecoute deja retiree")
        self._defait = []
        if self._defait_arret is not None:
            try:
                self._defait_arret()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia lumieres : ecoute de l'arret deja retiree")
            self._defait_arret = None
        # Ce que l'ecriture differee retenait part MAINTENANT, comme le journal
        # (`regles.arreter`) : un rechargement ne perd pas les dernieres notes. Et la
        # tache reste a la portee de l'instance suivante, qui l'attend avant de
        # relire le fichier (`_async_attendre_ecriture_retiree`). Une ecriture
        # deja EN VOL - l'echeance vient de sonner - se depose de meme (audit du
        # 19/10) : sans cela la suivante relisait le fichier pendant qu'elle
        # s'ecrivait.
        tache = self.hass.async_create_task(self._async_ecrire()) if self._annuler_ecriture() else self._ecriture_en_vol()
        if tache is not None:
            donnees = getattr(self.hass, "data", None)
            if isinstance(donnees, dict):
                donnees.setdefault(DOMAIN, {})[CLE_ECRITURE_FINALE] = tache
