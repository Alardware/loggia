"""Les prises : leur configuration, le cycle de l'electromenager et sa fin (chantier Prises, spec 5 et 6).

Pourquoi ce module existe
─────────────────────────
La carte et la popup d'une prise disent ce qu'elle alimente, si elle est
protegee, si l'appareil a fini son cycle. Ce qui se regle — la protection, le
type impose, l'alerte de fin de cycle — appartient a la maison : une seule cle
partagee, `loggia_prises`, que seuls les administrateurs ecrivent (P4). La
protection est une garde de l'ECRAN (P5) : ce module ne coupe rien et
n'empeche rien de couper.

Le serveur reconnait les prises lui-meme, au registre de Home Assistant, avec
la regle de l'ecran (`prises_types.est_prise`, spec 6.4) : il en a besoin pour
suivre le cycle de l'electromenager meme quand aucun ecran n'est ouvert.

Ce qui se calcule vit dans `prises_calcul.py` et `prises_types.py`, purs ; ici
le temps reel : le registre, les abonnements, les echeances, le disque, le
journal et le telephone.
"""
from __future__ import annotations

import copy
import logging
import time
from datetime import datetime, timezone
from functools import partial
from typing import TYPE_CHECKING, Any

from homeassistant.core import HomeAssistant, callback

from .chauffage_familles import famille
from .prises_calcul import (CLE, FIN_S, avancer, bascule, conclure, config_defaut, couper, doit_dire_la_fin,
                            echeance, fiche, garder, heure_de, instant_iso, kwh_du_compteur, kwh_du_cycle, kwh_ecrit,
                            lire_config, lire_etat, poser_patch, reprendre, suivi_neuf, watts)
from .prises_types import compteurs_maison, est_prise, est_sirene, type_de_prise
from .regles import CLE_ALERTES, demarrer
from .textes import langue_rendue, langue_serveur

if TYPE_CHECKING:  # l'annotation seule — les tests chargent ce module hors paquet
    from .store import LoggiaStore

_LOGGER = logging.getLogger(__name__)

MODULE = "prises"
# L'etat vivant — le cycle en cours, les cycles des sept derniers jours — dans
# SON fichier de `.storage`, comme le chauffage : il survit au redemarrage.
CLE_ETAT = "loggia_prises_etat"
VERSION_ETAT = 1
# Les prises dont le serveur suit le cycle (P3) : lave-vaisselle, lave-linge,
# seche-linge.
ELECTROMENAGER = ("lv", "ll", "sl")
# Une prise publie sa puissance toutes les quelques secondes : l'etat vivant
# s'ecrit a chaque etape du cycle, et sinon au plus une fois par minute — en
# differe (`Store.async_delay_save`), que Home Assistant ecrit aussi a l'arret.
ECRITURE_S = 60
# Ce qui part au telephone a la fin d'un cycle (P6) : une constante, jamais un
# litteral glisse dans l'appel. Sa cle vit dans les six catalogues de
# src/langues, que scripts/textes_serveur.mjs recopie dans textes_catalogue.py
# (CLES_TELEPHONE) ; tests/python/test_lot16_alertes_traduites.py le verifie.
MSG_FIN = "{nom} : cycle terminé à {h} ({kwh} kWh)"


def _retirer_tout(retraits: list) -> None:
    """Retire chaque ecoute ; une deja retiree n'empeche pas les autres."""
    for retrait in retraits:
        try:
            retrait()
        except Exception:  # noqa: BLE001
            _LOGGER.debug("Loggia prises : ecoute deja retiree")


class LoggiaPrises:
    """Les prises de la maison : leur configuration, leur etat, leurs cycles."""

    def __init__(self, hass: HomeAssistant, store: "LoggiaStore", regles=None) -> None:
        self.hass = hass
        self.store = store
        # Le socle commun : le journal et le telephone (taches 3 et 4).
        self.regles = regles
        self.cfg: dict[str, Any] = config_defaut()
        # Les prises que la maison a, vues par le serveur (spec 6.4) :
        # {interrupteur: {"nom", "puissance", "energie"}}.
        self.prises: dict[str, dict[str, Any]] = {}
        # Ce que le serveur sait du cycle de chaque prise de l'electromenager :
        # {interrupteur: {"suivi", "cycles"}} (tache 3).
        self.memoire: dict[str, dict[str, Any]] = {}
        # {capteur de puissance: interrupteur} : ce qu'on ecoute (`_suivies`).
        self._capteurs: dict[str, str] = {}
        self._ecoute = None
        # Une echeance par prise : son annulation, et son instant.
        self._rdv: dict[str, Any] = {}
        self._echeances: dict[str, float] = {}
        self._depot = None
        # Une ecriture differee attend-elle ? Une seule a la fois.
        self._differe = False
        # La memoire relue du disque : rien ne s'ecrit avant (`_demarre`).
        self._relu = False
        self._historique_dit = False
        self._au_demarrage = None
        self._registre_dit = False
        self._arrete = False
        demarrer(hass, self, self._async_demarrer(), "prises")

    async def _async_demarrer(self) -> None:
        self.cfg = await self.async_config()
        # Les cycles gardes (spec 5, « la memoire »). Illisibles, on repart a vide
        # et on le dit, comme le journal (`regles._charger`) : un historique
        # abime ne vaut pas qu'on cesse de suivre les cycles.
        try:
            brut = await self._store_etat().async_load()
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Loggia prises : etat des prises illisible, on repart a vide")
            brut = None
        self.memoire = lire_etat(brut, time.time())
        self._relu = True
        if self._arrete:
            return
        # Le registre attend que Home Assistant ait FINI de demarrer : avant, une
        # integration n'a peut-etre pas encore cree ses prises.
        from homeassistant.helpers.start import async_at_started

        self._au_demarrage = async_at_started(self.hass, self._async_rattraper)

    async def _async_rattraper(self, _hass=None) -> None:
        self._au_demarrage = None
        if self._arrete:
            return
        if await self._async_recenser():
            # Une prise qui n'est plus reconnue — retiree, desactivee — quitte la
            # memoire : son cycle et son historique ne servent plus a personne
            # (audit du 19/10). Un registre illisible ne purge rien.
            for haid in [h for h in self.memoire if h not in self.prises]:
                del self.memoire[haid]
                self._desarmer(haid)
        # Un cycle en cours au redemarrage reprend ; ce qui est du pendant l'arret
        # se conclut (spec 5).
        maintenant = time.time()
        for haid, m in list(self.memoire.items()):
            m["suivi"], evenement = reprendre(m["suivi"], maintenant)
            self._armer(haid)
            if evenement is not None:
                await self._async_evenement(haid, evenement)
        await self._sauver()

    # ── Les prises de la maison (spec 6.4) ─────────────────────────────────
    def _registres(self):
        """(entrees du registre des entites, appareils par identifiant), ou None
        — en le DISANT une fois."""
        try:
            from homeassistant.helpers import device_registry as dr, entity_registry as er

            return list(er.async_get(self.hass).entities.values()), dr.async_get(self.hass).devices
        except Exception:  # noqa: BLE001
            if not self._registre_dit:
                self._registre_dit = True
                _LOGGER.warning("Loggia prises : registres illisibles, les prises restent celles "
                                "deja reconnues", exc_info=True)
            return None

    async def _lumieres(self) -> set[str]:
        """Les interrupteurs declares lumieres : `cvEstLumiere` de l'ecran — la liste
        de Parametres > Entites (`loggia_switchlights`), sinon `loggia_entities`."""
        liste = await self.store.async_get_shared("loggia_switchlights", None)
        if liste is None:
            entites = await self.store.async_get_shared("loggia_entities", None)
            liste = entites.get("switchLights") if isinstance(entites, dict) else None
        return {h for h in liste if isinstance(h, str)} if isinstance(liste, list) else set()

    async def _compteurs(self) -> list[str] | None:
        """Les compteurs de la maison que declare le tableau de bord Energie
        (`compteurs_maison`) : une prise posee sur leur appareil n'en est pas une
        (spec 6.4). Le registre se relit a chaque lecture de l'etat : pas besoin
        d'ecouter les changements de ces preferences. Illisibles — pas
        d'integration Energie, une version qui l'ecrit autrement —, None."""
        try:
            from homeassistant.components.energy.data import async_get_manager

            return compteurs_maison((await async_get_manager(self.hass)).data)
        except Exception:  # noqa: BLE001
            _LOGGER.debug("Loggia prises : preferences Energie illisibles", exc_info=True)
            return None

    def _nom(self, haid: str, entree: Any = None) -> str:
        """Le nom qu'on lit : `friendly_name`, sinon celui du registre, sinon rien."""
        attrs = getattr(self.hass.states.get(haid), "attributes", None) or {}
        nom = attrs.get("friendly_name") or getattr(entree, "name", None) or getattr(entree, "original_name", None)
        return nom if isinstance(nom, str) else ""

    def _decrire(self, entree: Any) -> dict[str, Any]:
        """Une entite du registre, comme la regle « est une prise » la lit."""
        categorie = getattr(entree, "entity_category", None)
        return {"entity_id": entree.entity_id,
                "device_class": getattr(entree, "device_class", None) or getattr(entree, "original_device_class", None),
                "entity_category": getattr(categorie, "value", categorie),
                "nom": self._nom(entree.entity_id, entree)}

    def _fil_pilote(self, voisines: list) -> bool:
        """L'appareil porte-t-il un `select` fil pilote (chantier Chauffage) ?"""
        for e in voisines:
            if str(e.entity_id).startswith("select."):
                attrs = getattr(self.hass.states.get(e.entity_id), "attributes", None) or {}
                if famille("select", getattr(e, "platform", None), getattr(e, "unique_id", None),
                           getattr(e, "original_name", None), dict(attrs),
                           getattr(e, "translation_key", None)) == "fil_pilote":
                    return True
        return False

    async def _async_recenser(self) -> bool:
        """Les prises de la maison, relues au registre : {interrupteur: {"nom",
        "puissance", "energie"}}. Un registre illisible garde ce qu'on savait, et
        rend False."""
        lus = self._registres()
        if lus is None:
            return False
        entrees, appareils = lus
        lumieres = await self._lumieres()
        compteurs = await self._compteurs()
        par_appareil: dict[Any, list] = {}
        for e in entrees:
            if getattr(e, "disabled_by", None) is None and getattr(e, "device_id", None):
                par_appareil.setdefault(e.device_id, []).append(e)
        prises: dict[str, dict[str, Any]] = {}
        vus: set[str] = set()
        for e in entrees:
            haid = str(getattr(e, "entity_id", "") or "")
            if not haid.startswith("switch.") or getattr(e, "disabled_by", None) is not None:
                continue
            vus.add(haid)
            appareil = appareils.get(e.device_id) if getattr(e, "device_id", None) else None
            voisines = [x for x in par_appareil.get(getattr(e, "device_id", None), []) if x.entity_id != haid]
            entite = self._decrire(e)
            lu = est_prise(entite, None if appareil is None else {
                "fabricant": getattr(appareil, "manufacturer", None), "modele": getattr(appareil, "model", None),
                "nom": getattr(appareil, "name_by_user", None) or getattr(appareil, "name", None)},
                [self._decrire(x) for x in voisines], haid in lumieres, self._fil_pilote(voisines),
                est_sirene(haid, entite["nom"]), compteurs)
            if lu["prise"]:
                prises[haid] = {"nom": entite["nom"], "puissance": lu["puissance"], "energie": lu["energie"]}
        # Un interrupteur hors du registre (YAML sans identifiant) : ni appareil, ni soeurs.
        for haid in sorted(self.hass.states.async_entity_ids("switch")):
            if haid in vus:
                continue
            attrs = getattr(self.hass.states.get(haid), "attributes", None) or {}
            entite = {"entity_id": haid, "device_class": attrs.get("device_class"), "entity_category": None,
                      "nom": self._nom(haid)}
            if est_prise(entite, None, [], haid in lumieres, False, est_sirene(haid, entite["nom"]),
                         compteurs)["prise"]:
                prises[haid] = {"nom": entite["nom"], "puissance": None, "energie": None}
        self.prises = prises
        self._reabonner()
        return True

    def _type(self, haid: str) -> str:
        """Le type retenu : impose, sinon devine par le nom puis l'identifiant (P2)."""
        return type_de_prise((self.prises.get(haid) or {}).get("nom"), self.cfg["types"].get(haid), haid)

    # ── Le cycle de l'electromenager (P3, spec 5) ──────────────────────────
    def _suivies(self) -> dict[str, str]:
        """Les prises dont le serveur suit VRAIMENT le cycle : {interrupteur:
        capteur de puissance}. Un electromenager, et un capteur a lui seul : un
        capteur que plusieurs interrupteurs partagent (une multiprise a un seul
        compteur) n'en fait suivre AUCUN — la puissance commune ne s'attribue pas
        a une sortie, et la bouilloire d'a cote finirait le cycle du lave-linge
        (audit du 19/10)."""
        par_capteur: dict[str, list[str]] = {}
        for haid, info in sorted(self.prises.items()):
            if info["puissance"]:
                par_capteur.setdefault(info["puissance"], []).append(haid)
        return {haids[0]: capteur for capteur, haids in par_capteur.items()
                if len(haids) == 1 and self._type(haids[0]) in ELECTROMENAGER}

    def _reabonner(self) -> None:
        """Ecoute la puissance des prises suivies (`_suivies`), et d'elles seules :
        {capteur: interrupteur}. Chaque prise dont le serveur se souvient garde son
        echeance, meme si elle n'est plus suivie : un cycle en cours finit alors
        par son silence."""
        if self._arrete:
            return
        capteurs = {capteur: haid for haid, capteur in self._suivies().items()}
        if capteurs != self._capteurs:
            if self._ecoute is not None:
                self._ecoute()
                self._ecoute = None
            self._capteurs = capteurs
            if capteurs:
                from homeassistant.helpers import event

                ids = sorted(capteurs)
                retraits = [event.async_track_state_change_event(self.hass, ids, self._sur_puissance)]
                # Une valeur publiee identique ne fait plus de `state_changed`,
                # mais un `state_reported` (Home Assistant 2024.4) : sans lui, un
                # sechage fige a 14 W passerait pour un silence. Une version qui
                # n'a pas cette ecoute s'en passe.
                rapports = getattr(event, "async_track_state_report_event", None)
                if rapports is not None:
                    retraits.append(rapports(self.hass, ids, self._sur_puissance))
                self._ecoute = partial(_retirer_tout, retraits)
        for haid in capteurs.values():
            self.memoire.setdefault(haid, {"suivi": suivi_neuf(), "cycles": []})
        for haid in list(self.memoire):
            self._armer(haid)

    @callback
    def _sur_puissance(self, event) -> None:
        """Une mesure de puissance : un changement (`state_changed`), ou la meme
        valeur publiee de nouveau (`state_reported`), de memes donnees. Muette
        (`unavailable`, `unknown`), ce n'est pas une nouvelle : le silence se
        compte depuis la derniere mesure lisible — mais la puissance d'avant ne
        tient plus au-dela (`couper`)."""
        d = getattr(event, "data", None) or {}
        haid = self._capteurs.get(d.get("entity_id"))
        etat = d.get("new_state")
        if self._arrete or haid is None:
            return
        w = watts(getattr(etat, "state", None), (getattr(etat, "attributes", None) or {}).get("unit_of_measurement"))
        self._mesurer(haid, w, time.time())

    def _mesurer(self, haid: str, w: float | None, t: float) -> None:
        """Ce qui etait du AVANT cette mesure se conclut, puis elle compte ; muette
        (`w` None), elle coupe l'integration."""
        m = self.memoire.setdefault(haid, {"suivi": suivi_neuf(), "cycles": []})
        # Une horloge qui recule (une mise a l'heure) ne date pas une mesure
        # avant la precedente : une fin ne precede jamais son debut.
        if m["suivi"]["dernier"] is not None:
            t = max(t, m["suivi"]["dernier"])
        avant, evenement = conclure(m["suivi"], t)
        m["suivi"] = couper(avant, t) if w is None else avancer(avant, t, w)
        self._armer(haid)
        if evenement is not None:
            self.hass.async_create_task(self._async_evenement(haid, evenement))
        elif bascule(avant, m["suivi"]):
            self.hass.async_create_task(self._sauver())
        # Le reste, au plus chaque minute, et seulement pendant un cycle ou un
        # debut pressenti : au repos, une veille qui fluctue n'a rien a garder.
        elif m["suivi"]["en_cours"] or m["suivi"]["haut"] is not None:
            self._differer()

    def _armer(self, haid: str) -> None:
        """L'echeance de cette prise (`echeance`), posee une fois : la reposer a
        chaque mesure ne servirait a rien."""
        m = self.memoire.get(haid)
        quand = echeance(m["suivi"]) if m is not None and not self._arrete else None
        if haid in self._rdv and self._echeances.get(haid) == quand:
            return
        self._desarmer(haid)
        if quand is None:
            return
        from homeassistant.helpers.event import async_call_later

        @callback
        def sonne(_now) -> None:
            self._rdv.pop(haid, None)
            self._echoir(haid)

        self._echeances[haid] = quand
        self._rdv[haid] = async_call_later(self.hass, max(0.0, quand - time.time()), sonne)

    def _desarmer(self, haid: str) -> None:
        self._echeances.pop(haid, None)
        annule = self._rdv.pop(haid, None)
        if annule:
            try:
                annule()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia prises : echeance deja passee")

    def _echoir(self, haid: str) -> None:
        m = self.memoire.get(haid)
        if self._arrete or m is None:
            return
        m["suivi"], evenement = conclure(m["suivi"], time.time())
        self._armer(haid)
        if evenement is not None:
            self.hass.async_create_task(self._async_evenement(haid, evenement))

    async def _async_evenement(self, haid: str, evenement: dict[str, Any]) -> None:
        """Un cycle commence, finit ou s'interrompt : le journal (spec 5), la
        memoire, le disque. Chaque ligne porte dans ses parties l'instant REEL
        (`ts`) : on ne conclut qu'une minute apres le debut, et dix apres la fin."""
        from homeassistant.util import dt as dt_util

        fuseau = dt_util.now().tzinfo
        if evenement["quoi"] == "debut":
            debut = evenement["debut"]
            if self.regles is not None:
                await self.regles.noter(MODULE, "cycle", "cycle démarré", cibles=[haid], n=1,
                                        motif=("à {h}", {"h": heure_de(debut, fuseau), "ts": debut}))
            await self._sauver()
            return
        cycle = evenement["cycle"]
        heure = heure_de(cycle["fin"], fuseau)
        if evenement["quoi"] == "interrompu":
            # Six heures sans retomber : une veille, pas un cycle. Ni place parmi
            # les cycles, ni alerte ; le journal le dit (relecture du 13/10).
            if self.regles is not None:
                await self.regles.noter(MODULE, "cycle", "cycle interrompu", cibles=[haid], n=1,
                                        motif=("à {h}", {"h": heure, "ts": cycle["fin"]}))
            await self._sauver()
            return
        # Le suivi remis au repos s'ecrit AVANT l'historique : un rechargement
        # pendant sa lecture ne laisse plus sur le disque un cycle en cours, que
        # le demarrage suivant conclurait une seconde fois (relecture du 13/10).
        await self._sauver()
        kwh = await self._async_kwh(haid, cycle)
        m = self.memoire.setdefault(haid, {"suivi": suivi_neuf(), "cycles": []})
        m["cycles"] = garder(m["cycles"] + [{"debut": cycle["debut"], "fin": cycle["fin"], "kwh": kwh}],
                             time.time())
        if self.regles is not None:
            await self.regles.noter(MODULE, "cycle", "cycle terminé", cibles=[haid], n=1,
                                    motif=[("à {h}", {"h": heure, "ts": cycle["fin"]}), ("{kwh} kWh", {"kwh": kwh})])
        await self._sauver()
        # L'alerte (P6), si on l'a demandee pour cette prise. Le socle choisit le
        # telephone et le regime : silencieuse pendant les heures calmes ; sans
        # telephone, rien ne part et le journal le dit. Une cloture par le
        # silence ne previent pas : la fin n'y est que supposee — une prise qui
        # decroche, une valeur figee (relecture du 13/10).
        if evenement["quoi"] == "fin" and self.regles is not None and doit_dire_la_fin(self.cfg, haid):
            nom = (self.prises.get(haid) or {}).get("nom") or haid
            texte = kwh_ecrit(kwh, langue_rendue(MSG_FIN, langue_serveur(self.hass)))
            await self.regles.prevenir(MODULE, "cycle", (MSG_FIN, {"nom": nom, "h": heure, "kwh": texte}), pour="presents")

    async def _async_kwh(self, haid: str, cycle: dict[str, Any]) -> float:
        """L'energie du cycle (spec 5) : le compteur `energy` de la prise, lu dans
        l'historique de Home Assistant, s'il dit a peu pres ce que dit la
        puissance integree — ou si celle-ci est trouee (`kwh_du_cycle`) ; sans
        compteur, s'il ne se lit pas ou s'il s'en ecarte, la puissance integree.
        Jamais None : l'integree est toujours calculee (`conclure`).

        Le compteur se lit jusqu'a DIX MINUTES apres la fin : bien des prises
        publient leur energie en retard, et la fin ne se conclut que dix minutes
        apres la baisse — la donnee existe. A 5 W ou moins, ces dix minutes
        n'ajoutent presque rien."""
        compteur = (self.prises.get(haid) or {}).get("energie")
        lu = await self._async_compteur(compteur, cycle["debut"], cycle["fin"] + FIN_S) if compteur else None
        return kwh_du_cycle(lu, cycle.get("wh"), cycle.get("troue") is True)

    async def _async_compteur(self, capteur: str, debut: float, fin: float) -> float | None:
        """Le compteur lu dans l'historique : la valeur au debut
        (`include_start_time_state`), puis chaque changement jusqu'a `fin`."""
        try:
            from homeassistant.components.recorder import get_instance, history

            lus = await get_instance(self.hass).async_add_executor_job(partial(
                history.state_changes_during_period, self.hass, datetime.fromtimestamp(debut, timezone.utc),
                datetime.fromtimestamp(fin, timezone.utc), capteur, no_attributes=True,
                include_start_time_state=True))
        except Exception:  # noqa: BLE001
            # Une fois, pas a chaque cycle : un historique coupe le reste longtemps.
            if not self._historique_dit:
                self._historique_dit = True
                _LOGGER.warning("Loggia prises : historique illisible, l'energie d'un cycle se compte "
                                "d'apres sa puissance", exc_info=True)
            return None
        self._historique_dit = False
        unite = (getattr(self.hass.states.get(capteur), "attributes", None) or {}).get("unit_of_measurement")
        return kwh_du_compteur([getattr(e, "state", None) for e in (lus or {}).get(capteur, [])], unite)

    def _store_etat(self):
        if self._depot is None:
            from homeassistant.helpers.storage import Store

            self._depot = Store(self.hass, VERSION_ETAT, CLE_ETAT)
        return self._depot

    def _demarre(self) -> bool:
        """La memoire a-t-elle ete RELUE du disque ? Avant, l'ecrire effacerait celle
        du fichier : apres un demarrage rate, et aussi pendant le demarrage — un
        ecran ouvert abonne deja les prises, et une mesure ecrivait (audit du
        19/10). Pas `demarrage is True` (`regles.demarrer`) : Home Assistant lance
        le rattrapage AUSSITOT (`async_at_started`, tache demarree sur-le-champ),
        encore dans `_async_demarrer` — ses ecritures, la fin d'un cycle conclue
        pendant l'arret, seraient refusees, et conclues de nouveau au demarrage
        suivant."""
        return self._relu

    async def _sauver(self, force: bool = False) -> None:
        """La memoire sur le disque, tout de suite : une COPIE, que la boucle peut
        changer pendant que Home Assistant l'ecrit. Elle remplace l'ecriture
        differee qui attendait. Rien avant la fin du demarrage (`_demarre`), ni
        apres l'arret — sauf `force`, l'ecriture que l'arret doit (`async_arreter`)."""
        if (self._arrete and not force) or not self._demarre():
            return
        self._differe = False
        try:
            await self._store_etat().async_save(copy.deepcopy(self.memoire))
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Loggia prises : cycles non enregistres")

    def _differer(self) -> None:
        """La memoire sur le disque d'ici une minute (`Store.async_delay_save`) :
        une seule attente a la fois, que les mesures suivantes ne repoussent pas.
        Home Assistant l'ecrit aussi s'il s'arrete avant ; une ecriture immediate
        (`_sauver`) la remplace."""
        if self._differe or self._arrete or not self._demarre():
            return
        self._differe = True
        self._store_etat().async_delay_save(self._a_ecrire, ECRITURE_S)

    @callback
    def _a_ecrire(self) -> dict[str, Any]:
        """Ce que l'ecriture differee emporte : la memoire du moment ou elle PART,
        copiee."""
        self._differe = False
        return copy.deepcopy(self.memoire)

    # ── Ce que l'interface lit et ecrit ────────────────────────────────────
    async def async_config(self) -> dict[str, Any]:
        return lire_config(await self.store.async_get_shared(CLE, None))

    async def async_etat(self) -> dict[str, Any]:
        """`loggia/prises/etat` (spec 6.1) : lu de tout compte, calcule en memoire.
        Le registre se relit a chaque lecture : une prise ajoutee se voit tout de
        suite."""
        from homeassistant.util import dt as dt_util

        await self._async_recenser()
        maintenant = dt_util.now()
        fuseau = maintenant.tzinfo
        alertes = await self.store.async_get_shared(CLE_ALERTES, None)
        prises = {}
        suivies = self._suivies()
        for haid in sorted(self.prises):
            m = self.memoire.get(haid) or {}
            # Sept jours glissants : un cycle trop vieux s'oublie aussi en marche,
            # pas seulement au redemarrage (`lire_etat`).
            prises[haid] = fiche(haid, self.cfg, self._type(haid), m.get("suivi"),
                                 garder(m.get("cycles") or [], maintenant.timestamp()), fuseau,
                                 suivie=haid in suivies)
        return {
            "maintenant": instant_iso(maintenant.timestamp(), fuseau),
            "config": self.cfg,
            "prises": prises,
            # Un telephone trouve chez qui est a la maison, ou le repli de
            # Parametres > Alertes : sans eux, « Prevenir a la fin du cycle » n'a
            # personne a qui parler (spec 3.8 ; ADR 0301, relecture du 30/10).
            "notifier": (await self.regles.a_qui_parler("presents")) if getattr(self, "regles", None) is not None
            else bool(str((alertes if isinstance(alertes, dict) else {}).get("service") or "").strip()),
        }

    async def async_enregistrer(self, patch: dict[str, Any]) -> dict[str, Any]:
        """`loggia/prises/config` : le patch pose d'un seul tenant, sous le verrou du
        magasin (lot 15 de l'audit du 03/10). Un patch vide relit la cle : c'est
        le rechargement apres un import (rechargement.py)."""
        self.cfg = await self.store.async_modifier_shared(CLE, lambda brut: poser_patch(lire_config(brut), patch))
        await self._async_recenser()
        return self.cfg

    @callback
    def async_arreter(self) -> None:
        self._arrete = True
        if self._au_demarrage:
            self._au_demarrage()
            self._au_demarrage = None
        for haid in list(self._rdv):
            self._desarmer(haid)
        if self._ecoute is not None:
            self._ecoute()
            self._ecoute = None
        # Une ecriture differee qui attend s'ecrit MAINTENANT : partie plus tard,
        # elle ecraserait le fichier que le module recharge a deja reecrit.
        if self._differe:
            self.hass.async_create_task(self._sauver(force=True))
