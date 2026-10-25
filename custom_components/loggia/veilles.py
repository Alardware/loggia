"""Quatre veilles : l'air, les piles, le tarif, les consommables.

Pourquoi ce module existe
─────────────────────────
Quatre surveillances de meme forme — une valeur, un seuil, une alerte — que
chaque installation reecrit separement.

  Le CO2. Au-dela de 1000 a 1200 ppm on dort mal et on pense moins bien.
  Personne ne consulte un capteur de CO2 ; il faut qu'il vienne le dire.

  Les piles. Un detecteur d'ouverture a plat ne previent pas qu'il est a plat :
  il se tait, et on croit la porte fermee. C'est la panne la plus silencieuse
  d'une installation domotique.

  Les heures creuses. Le lave-vaisselle attend souvent qu'on y pense.

  Les consommables (ADR 0006). Le filtre d'un aspirateur, la brosse d'un
  robot, le reservoir d'un distributeur : Home Assistant n'a pas de classe
  pour eux, et un nom (« filter », « brush ») ne prouve rien. On ne devine
  donc pas : l'utilisateur DESIGNE ses capteurs une fois, et la veille les
  lit comme des piles — en dessous du seuil, dans l'unite du capteur (le
  plus souvent un pourcentage restant), une seule alerte.

Le service de notification n'est PAS redemande : c'est celui deja choisi dans
Parametres > Alertes. Faire choisir son telephone deux fois serait une facon
de dire qu'on n'a pas regarde ce qui existait.

Ne pas crier deux fois
──────────────────────
Une alerte qui se repete toutes les trente secondes est pire que pas d'alerte :
on l'apprend par coeur et on cesse de la lire. Chaque veille note ce qu'elle a
signale et se tait jusqu'a ce que la valeur redevienne franchement bonne — pas
seulement bonne d'un cheveu, sinon un capteur qui oscille autour du seuil
sonnerait toute la journee.

Audit des capteurs du 19/10 (ADR 0250)
──────────────────────────────────────
  * « Observer sans agir » vaut pour les veilles : la ventilation, les prises
    des heures creuses et le telephone se simulent, comme ailleurs (ADR 0004).
    La surete, elle, n'en fait pas partie : elle agit toujours (alertes.py).
  * Une valeur muette (`unavailable`, `unknown`) ne rearme JAMAIS une alerte :
    seule une vraie valeur, revenue au-dela de l'hysterese, le fait.
  * Ce qui a ete signale vit dans son fichier du magasin
    (`loggia_veilles_etat`), comme le carnet des robots : un redemarrage ne
    re-notifie plus chaque pile basse.
  * Les piles suivent la regle de l'ecran (`pilesDeLaMaison`, piles.js) : le
    seuil compris, les binaires `battery` allumes, ni les telephones ni les
    batteries rechargeables ; un premier passage au demarrage complet.
  * Les veilles se reabonnent quand Home Assistant a fini de demarrer et quand
    le registre des entites change : un capteur apparu apres le demarrage est
    suivi.

Le monoxyde de carbone chiffre (ADR 0251, lot 3 ; decision du 19/10 :
« Telephone, sans reaction »)
──────────────────────────────────────────────────────────────────────
  Un capteur de classe `carbon_monoxide` en ppm, sur un appareil physique, au-
  dela du palier Danger de la table de l'ecran (SEUIL_CO) : UNE notification,
  par le canal critique — elle passe les heures calmes, comme la surete —,
  jusqu'a son retour franchement sous le seuil. La maison ne reagit pas : ni
  lumieres, ni volets (alertes.py, qui garde les binaires, n'en sait rien).
  Toujours suivi, sans reglage ; la categorie « co » decochee dans
  Parametres > Alertes le tait. « Observer sans agir » le simule.
"""
from __future__ import annotations

import logging
import math
from typing import TYPE_CHECKING, Any

from homeassistant.core import HomeAssistant, callback

from .regles import demarrer, entites_propres, est_entite, niveau

if TYPE_CHECKING:  # l'annotation seule — les tests chargent ce module hors paquet
    from .store import LoggiaStore

_LOGGER = logging.getLogger(__name__)

CLE = "loggia_veilles"
CLE_ALERTES = "loggia_alertes"
# Ce qui a ete signale, dans son fichier (audit du 19/10, M2) : ce n'est pas
# une configuration — rien a synchroniser entre appareils, rien a recharger.
CLE_ETAT = "loggia_veilles_etat"
VERSION_ETAT = 1
# Un plafond, pas un reglage : une maison n'a pas mille piles basses.
MAX_SIGNALES = 1000
PREFIXES_SIGNALES = ("co2:", "bat:", "conso:", "co:")
# Le registre change par rafales (une integration qui charge cent entites) :
# on se reabonne une fois, un peu apres la premiere (audit du 19/10, M4). Le
# delai laisse aussi a l'entite neuve le temps d'ecrire son premier etat.
DELAI_REGISTRE = 5.0

MUETS = {"unavailable", "unknown", "none", ""}

# La marge de retour au calme, en proportion du seuil. Un capteur de CO2
# oscille de quelques dizaines de ppm : sans elle, il sonnerait a chaque
# souffle.
HYSTERESE = 0.90

# Ce qui part au telephone (05/10) : des constantes, jamais un litteral glisse
# dans un appel. Chaque gabarit est une cle de textes_catalogue.py, recopiee
# par scripts/textes_serveur.mjs (CLES_TELEPHONE) : retouche ici sans sa cle,
# la veille partait en francais chez un Allemand —
# tests/python/test_lot16_alertes_traduites.py le dit. Les accents absents
# (« aerer », « pile a ») SONT la cle des sept catalogues : les corriger la
# renomme partout, polonais compris.
MSG_CO2 = "{nom} : {v} ppm, il faut aerer"
MSG_PILE = "{nom} : pile a {v} %"
# Une pile binaire (`binary_sensor` de classe `battery`) : `on` veut dire
# faible, sans chiffre (audit du 19/10, M3).
MSG_PILE_FAIBLE = "{nom} : pile faible"
MSG_CONSO = "{nom} : {reste} restant, a remplacer"
MSG_CREUSES = "Heures creuses : c’est le moment de lancer les machines"
# Le monoxyde de carbone au palier Danger (ADR 0251) : critique, sous le titre de la surete.
MSG_CO = "{nom} : monoxyde de carbone à {v} ppm, aérez et sortez"
TITRE = "Loggia — sûreté"

# Le palier Danger du monoxyde, en ppm : AU-DELA de 35 (« jusqu'a 35 » est
# Moyen). UNE source : la table de l'ecran, `PALIERS.co` de src/confort.js —
# tests/audit_capteurs_lot3.test.mjs verifie que les deux chiffres sont les
# memes.
SEUIL_CO = 35

# Ce que les veilles commandent a sa place dans l'echelle de la maison : la
# ventilation (l'air qu'on respire) passe devant le confort ; les prises des
# heures creuses sont du confort. Sans rang declare, tout partait a 0 — sous
# tout le monde, et une prise tenue ailleurs restait froide (audit 18/09).
PRIORITES = {"co2": niveau("nuit", 10), "creuses": niveau("confort", 5)}

DEFAUT: dict[str, Any] = {
    "co2": {"actif": False, "seuil": 1400, "capteurs": [], "ventilation": []},
    "batterie": {"actif": False, "seuil": 15},
    "creuses": {"actif": False, "entite": "", "valeur": "", "prises": []},
    # Les consommables : des capteurs DESIGNES, jamais devines (ADR 0006).
    "consommables": {"actif": False, "seuil": 10, "capteurs": []},
    # Observer sans agir (ADR 0004 ; audit du 19/10, H3) : le drapeau des
    # autres modules, que l'interrupteur des Regles pose avec eux.
    "simulation": {"actif": False},
}

# Les listes d'entites de la configuration, relues a chaque lecture et a
# chaque ecriture (audit du 19/10, M24).
LISTES = (("co2", "capteurs"), ("co2", "ventilation"), ("creuses", "prises"),
          ("consommables", "capteurs"))


def nombre(etat):
    """La valeur d'un capteur, ou None si elle ne veut rien dire."""
    if etat is None:
        return None
    brut = str(getattr(etat, "state", "")).lower()
    if brut in MUETS:
        return None
    try:
        valeur = float(brut)
    except (TypeError, ValueError):
        return None
    # « nan », « inf » : pas un nombre, comme une valeur muette (contre-relecture du lot 3).
    return valeur if math.isfinite(valeur) else None


def capteurs_de(etats: dict, classe: str) -> list:
    """Les entites d'une `device_class` donnee, quel que soit leur nom.

    On ne devine pas au nom de l'entite : Home Assistant dit lui-meme ce
    qu'elle mesure.
    """
    trouves = []
    for haid, st in (etats or {}).items():
        attrs = getattr(st, "attributes", None) or {}
        if attrs.get("device_class") == classe:
            trouves.append(haid)
    return sorted(trouves)


def au_dessus(valeur, seuil, deja_signale: bool) -> bool:
    """Faut-il signaler ? Avec la marge de retour au calme."""
    if valeur is None:
        return False
    try:
        seuil = float(seuil)
    except (TypeError, ValueError):
        return False
    if deja_signale:
        # On ne se tait qu'une fois franchement redescendu.
        return valeur > seuil * HYSTERESE
    return valeur > seuil


def en_dessous(valeur, seuil, deja_signale: bool, inclus: bool = False) -> bool:
    """Le pendant, pour ce qui se vide : une pile, une reserve.

    `inclus` : le seuil lui-meme compte (audit du 19/10, M3) — l'ecran dit
    « a changer » a 15 % pour un seuil de 15 (`niveauPile`, `<=`)."""
    if valeur is None:
        return False
    try:
        seuil = float(seuil)
    except (TypeError, ValueError):
        return False
    if deja_signale:
        # Une pile ne remonte pas toute seule : il faut un vrai changement.
        return valeur < seuil / HYSTERESE
    return valeur <= seuil if inclus else valeur < seuil


# Les onduleurs : leur batterie se recharge, ce n'est pas une pile a changer (audit du 19/10, M13).
ONDULEURS = ("nut", "apcupsd")


def _rechargeable(soeurs: list, classes: dict) -> bool:
    """Une batterie RECHARGEABLE, comme l'ecran la reconnait (piles.js) : son
    appareil porte un aspirateur, une tondeuse, un `battery_charging`, une
    prise branchee (`plug` : la tablette, la voiture) ou une puissance de
    charge (audit du 19/10, M13)."""
    return any(h.startswith(("vacuum.", "lawn_mower.")) or classes.get(h) in ("battery_charging", "plug")
               or (h.startswith("sensor.") and classes.get(h) == "power" and "charg" in h)
               for h in soeurs)


class LoggiaVeilles:
    """Surveille l'air, les piles et le tarif, et le dit une seule fois."""

    # Ce que le constructeur pose apres coup (audit du 19/10) : des valeurs
    # simples, que chaque instance remplace par les siennes.
    _depot = None
    _au_demarrage = None
    _defait_registre = None
    _reabonnement = None
    _horaire = None
    _arrete = False

    def __init__(self, hass: HomeAssistant, store: "LoggiaStore", regles=None) -> None:
        self.hass = hass
        self.store = store
        # Le socle commun : journal, geste manuel, et le telephone — voir
        # `regles.py`. Tout ce qui sort d'ici passe par lui.
        self.regles = regles
        self.cfg: dict[str, Any] = {}
        # Ce qui a deja ete signale, pour ne pas le redire.
        self.signales: set = set()
        self.creuses_en_cours = False
        self._defait: list[Any] = []
        demarrer(hass, self, self._async_demarrer(), "veilles")

    async def _async_demarrer(self) -> None:
        self.cfg = await self.async_config()
        await self._async_lire_etat()
        await self._async_reabonner()
        # Le suivi se repose quand Home Assistant a FINI de demarrer (audit du
        # 19/10, M4) : avant, une integration n'a peut-etre pas encore cree ses
        # capteurs, et le CO2 decouvert restait vide jusqu'au prochain
        # enregistrement. Deja demarre (un rechargement), le rappel part aussitot.
        from homeassistant.helpers.start import async_at_started

        self._au_demarrage = async_at_started(self.hass, self._async_rattraper)

    async def _async_rattraper(self, _hass=None) -> None:
        """Home Assistant a demarre : l'ecoute du registre, le suivi repose,
        et le premier passage des piles et des consommables — pas une heure
        apres (audit du 19/10, M3)."""
        self._au_demarrage = None
        if self._arrete:
            return
        bus = getattr(self.hass, "bus", None)
        if bus is not None and self._defait_registre is None:
            self._defait_registre = bus.async_listen("entity_registry_updated", self._sur_registre)
        await self._async_reabonner()
        await self._async_horaire()

    @callback
    def _sur_registre(self, event) -> None:
        """Une entite arrive, part ou change de nom : si c'est un capteur, on
        se reabonne — une fois par rafale, un peu apres."""
        d = getattr(event, "data", None) or {}
        haid = str(d.get("entity_id") or "")
        if self._arrete or self._reabonnement is not None or not haid.startswith(("sensor.", "binary_sensor.")):
            return
        from homeassistant.helpers.event import async_call_later

        @callback
        def echu(_now) -> None:
            self._reabonnement = None
            if not self._arrete:
                self.hass.async_create_task(self._async_reabonner())

        self._reabonnement = async_call_later(self.hass, DELAI_REGISTRE, echu)

    async def _async_reabonner(self) -> None:
        for defaire in self._defait:
            try:
                defaire()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia veilles : abonnement deja retire")
        self._defait.clear()

        from homeassistant.helpers.event import (async_track_state_change_event,
                                                 async_track_time_interval)

        suivis = []
        co2 = self.cfg.get("co2") or {}
        if co2.get("actif"):
            suivis.extend(co2.get("capteurs") or self._capteurs_co2())
        creuses = self.cfg.get("creuses") or {}
        if creuses.get("actif") and creuses.get("entite"):
            suivis.append(creuses["entite"])
        # Le monoxyde chiffre : toujours suivi (ADR 0251).
        suivis.extend(self._capteurs_co(self._tous_les_etats()))
        if suivis:
            self._defait.append(
                async_track_state_change_event(self.hass, sorted(set(suivis)), self._sur_etat)
            )
        # Ce que ces veilles PILOTENT — la ventilation, les prises — est declare
        # au socle : une main posee dessus les gele.
        self.regles.suivre("veilles", list(co2.get("ventilation") or []) + list(creuses.get("prises") or []))

        # Les piles ne se surveillent pas a l'evenement : elles changent
        # lentement, et une entite qui tombe a 14 % ne merite pas qu'on ecoute
        # toute l'installation. Un passage par heure suffit — pour les
        # consommables aussi, qui s'usent encore plus lentement.
        #
        # L'intervalle se pose UNE fois, et se retire quand plus rien ne le
        # demande (relecture du lot 2, point 7) : repose a chaque reabonnement,
        # une rafale du registre repoussait le passage des piles sans fin.
        horaire = bool((self.cfg.get("batterie") or {}).get("actif")
                       or (self.cfg.get("consommables") or {}).get("actif")
                       or self._capteurs_co(self._tous_les_etats()))
        if horaire and self._horaire is None:
            from datetime import timedelta

            self._horaire = async_track_time_interval(self.hass, self._sur_heure, timedelta(hours=1))
        elif not horaire and self._horaire is not None:
            try:
                self._horaire()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia veilles : passage horaire deja retire")
            self._horaire = None
        # En debug (point 7) : un reabonnement par rafale du registre.
        _LOGGER.debug("Loggia veilles : %d entites suivies", len(set(suivis)))

    def _tous_les_etats(self) -> dict:
        try:
            ids = list(self.hass.states.async_entity_ids("sensor"))
            ids += list(self.hass.states.async_entity_ids("binary_sensor"))
        except Exception:  # noqa: BLE001
            # Le module qui empeche les pannes silencieuses ne doit pas en avoir une.
            _LOGGER.warning("Loggia veilles : capteurs illisibles, aucune veille ce tour", exc_info=True)
            return {}
        return {i: self.hass.states.get(i) for i in ids}

    def _capteurs_co2(self) -> list:
        return capteurs_de(self._tous_les_etats(), "carbon_dioxide")

    @callback
    def _sur_etat(self, _event) -> None:
        self.hass.async_create_task(self._async_evaluer())

    @callback
    def _sur_heure(self, _now) -> None:
        self.hass.async_create_task(self._async_horaire())

    async def _async_horaire(self) -> None:
        """Ce qui se vide lentement : un passage par heure. Le monoxyde chiffre
        aussi (contre-relecture du lot 3) : un danger deja la au demarrage
        complet se dit, et un envoi rate se retente — une fois tant que la cle
        est gardee."""
        await self._async_batteries()
        await self._async_consommables()
        await self._async_co()

    async def _async_evaluer(self) -> None:
        await self._async_co2()
        await self._async_co()
        await self._async_creuses()

    # ── L'air ──────────────────────────────────────────────────────────────
    async def _async_co2(self) -> None:
        c = self.cfg.get("co2") or {}
        if not c.get("actif"):
            return
        etats = self._tous_les_etats()
        cibles = c.get("capteurs") or capteurs_de(etats, "carbon_dioxide")
        # Le defaut de la maison (1400, confort.js), jamais un autre chiffre :
        # le repli a 1200 le contredisait (audit du 19/10).
        seuil = c.get("seuil", DEFAUT["co2"]["seuil"])
        avant = set(self.signales)
        # Designes : la liste fait foi. Decouverts : seulement ce qui n'existe
        # plus (contre-relecture, point A).
        self._purger("co2:", c.get("capteurs") or None)
        for haid in cibles:
            valeur = nombre(etats.get(haid))
            if valeur is None:
                # Muet : ni alerte ni rearmement (audit du 19/10, M2).
                continue
            cle = "co2:" + haid
            deja = cle in self.signales
            if au_dessus(valeur, seuil, deja):
                if not deja:
                    self.signales.add(cle)
                    motif = ("{v} ppm", {"v": int(valeur)})
                    await self._async_prevenir(
                        "co2", (MSG_CO2, {"nom": self._nom(haid, etats), "v": int(valeur)}),
                        motif=motif)
                    ventilation = c.get("ventilation") or []
                    if ventilation:
                        await self._async_service("homeassistant", "turn_on", ventilation,
                                                  regle="co2", quoi="ventiler", motif=motif)
            elif deja:
                self.signales.discard(cle)
        if self.signales != avant:
            await self._async_garder()

    # ── Les piles ──────────────────────────────────────────────────────────
    async def _async_batteries(self) -> None:
        b = self.cfg.get("batterie") or {}
        if not b.get("actif"):
            return
        etats = self._tous_les_etats()
        exclues = await self._piles_exclues(etats)
        seuil = b.get("seuil", DEFAUT["batterie"]["seuil"])
        avant = set(self.signales)
        suivies = [h for h in capteurs_de(etats, "battery") if h not in exclues]
        self._purger("bat:")
        for haid in suivies:
            cle = "bat:" + haid
            deja = cle in self.signales
            if haid.startswith("binary_sensor."):
                # Une pile binaire : `on` = faible, `off` = changee. Le reste —
                # un silence — ne dit rien (audit du 19/10, M2 et M3).
                brut = str(getattr(etats.get(haid), "state", "")).lower()
                # La cle seulement si c'est parti (relecture du lot 2, point
                # 4) : un telephone pas encore pret ne fait rien perdre.
                if brut == "on" and not deja:
                    if await self._async_prevenir(
                            "batterie", (MSG_PILE_FAIBLE, {"nom": self._nom(haid, etats)}), motif="faible"):
                        self.signales.add(cle)
                elif brut == "off" and deja:
                    self.signales.discard(cle)
                continue
            valeur = nombre(etats.get(haid))
            if valeur is None:
                # Muette : elle ne rearme pas (audit du 19/10, M2).
                continue
            if en_dessous(valeur, seuil, deja, inclus=True):
                if not deja and await self._async_prevenir(
                        "batterie", (MSG_PILE, {"nom": self._nom(haid, etats), "v": int(valeur)}),
                        motif=("{v} %", {"v": int(valeur)})):
                    self.signales.add(cle)
            elif deja:
                # Pile changee : on redevient capable de prevenir.
                self.signales.discard(cle)
        if self.signales != avant:
            await self._async_garder()

    async def _piles_exclues(self, etats: dict) -> set:
        """Les piles que l'ecran ne montre pas sur la carte Piles
        (`pilesDeLaMaison`, piles.js), donc que la veille ne dit pas non plus
        (audit du 19/10, M3) : masquees ou desactivees, les telephones
        (`mobile_app`), les batteries rechargeables (un robot, ce que
        l'appareil charge, un onduleur), la batterie de la maison (le role
        `batSoc` d'Energie) ; une pile sans APPAREIL PHYSIQUE (audit du 19/10,
        M13 : un `min_max` « pile la plus basse » ou un modele sans appareil
        redisait une pile deja comptee) ; et une pile binaire d'un appareil qui
        a deja une pile chiffree. Un registre illisible n'ecarte que la
        batterie de la maison : mieux vaut une pile de trop qu'une de moins."""
        piles = capteurs_de(etats, "battery")
        exclues = set(await self._batterie_maison(etats))
        try:
            from homeassistant.helpers import entity_registry as er

            entrees = {e.entity_id: e for e in er.async_get(self.hass).entities.values()}
        except Exception:  # noqa: BLE001
            _LOGGER.debug("Loggia veilles : registre illisible, les piles ne sont pas triees", exc_info=True)
            return exclues
        par_appareil: dict[str, list] = {}
        classes: dict[str, Any] = {}
        for haid, e in entrees.items():
            if getattr(e, "device_id", None):
                par_appareil.setdefault(e.device_id, []).append(haid)
            attrs = getattr(etats.get(haid), "attributes", None) or {}
            classes[haid] = (attrs.get("device_class") or getattr(e, "device_class", None)
                             or getattr(e, "original_device_class", None))
        appareils_maison = {getattr(entrees.get(h), "device_id", None) for h in exclues} - {None}
        chiffrees: set = set()
        for haid in piles:
            e = entrees.get(haid)
            if e is None:
                # Inconnue du registre (YAML, un modele) : sans appareil, comme
                # a l'ecran (audit du 19/10, M13), elle ne compte pas.
                exclues.add(haid)
                continue
            appareil = getattr(e, "device_id", None)
            if (getattr(e, "hidden_by", None) is not None or getattr(e, "disabled_by", None) is not None
                    or getattr(e, "platform", None) in ("mobile_app",) + ONDULEURS
                    or not appareil or appareil in appareils_maison
                    or _rechargeable(par_appareil.get(appareil, []), classes)):
                exclues.add(haid)
            elif haid.startswith("sensor."):
                chiffrees.add(appareil)
        try:
            from homeassistant.helpers import device_registry as dr

            appareils = dr.async_get(self.hass)
        except Exception:  # noqa: BLE001
            appareils = None
        for haid in piles:
            if haid in exclues:
                continue
            appareil = getattr(entrees.get(haid), "device_id", None)
            try:
                fiche = appareils.async_get(appareil) if appareils is not None and appareil else None
            except Exception:  # noqa: BLE001
                fiche = None
            # Un appareil de SERVICE n'est pas physique (C16) : ni sa pile
            # chiffree (audit du 19/10, M13), ni son binaire.
            if (str(getattr(fiche, "entry_type", None) or "").endswith("service")
                    or (haid.startswith("binary_sensor.") and appareil in chiffrees)):
                exclues.add(haid)
        return exclues

    async def _batterie_maison(self, etats: dict) -> set:
        """La batterie de la maison et ses piles, comme l'ecran la trouve
        (`enHaids().batSoc`, state.js) : la fiche Energie d'abord
        (`loggia_energyHaids`, sinon `loggia_entities`), et des qu'elle nomme
        la famille de la batterie, elle seule ; sinon le tableau de bord
        Energie de Home Assistant — les piles de l'appareil de sa batterie."""
        famille = ("batNow", "batSoc", "batChargeNow", "batDechargeNow")
        fiche = await self.store.async_get_shared("loggia_energyHaids", None)
        if not isinstance(fiche, dict):
            entites = await self.store.async_get_shared("loggia_entities", None)
            fiche = entites.get("energy") if isinstance(entites, dict) else None
        if isinstance(fiche, dict) and any(k in fiche for k in famille):
            soc = fiche.get("batSoc")
            return {soc} if est_entite(soc) else set()
        try:
            from homeassistant.components.energy.data import async_get_manager

            prefs = (await async_get_manager(self.hass)).data or {}
            from homeassistant.helpers import entity_registry as er

            reg = er.async_get(self.hass)
            compteurs = [s.get(k) for s in (prefs.get("energy_sources") or [])
                         if isinstance(s, dict) and s.get("type") == "battery"
                         for k in ("stat_energy_from", "stat_energy_to")]
            appareils = {getattr(reg.async_get(c), "device_id", None) for c in compteurs if isinstance(c, str)}
            appareils.discard(None)
            if not appareils:
                return set()
            return {h for h in capteurs_de(etats, "battery")
                    if getattr(reg.async_get(h), "device_id", None) in appareils}
        except Exception:  # noqa: BLE001
            # Pas de tableau Energie (ou illisible) : pas de batterie de la maison.
            return set()

    # ── Les consommables (ADR 0006) ────────────────────────────────────────
    async def _async_consommables(self) -> None:
        c = self.cfg.get("consommables") or {}
        if not c.get("actif"):
            return
        # Seulement ce qui a ete DESIGNE : la veille n'inspecte aucun nom.
        avant = set(self.signales)
        designes = [h for h in (c.get("capteurs") or []) if isinstance(h, str)]
        self._purger("conso:", designes)
        for haid in designes:
            st = self.hass.states.get(haid)
            valeur = nombre(st)
            if valeur is None:
                # Muet : ni alerte ni rearmement (audit du 19/10, M2).
                continue
            cle = "conso:" + haid
            deja = cle in self.signales
            if en_dessous(valeur, c.get("seuil", 10), deja):
                if not deja:
                    unite = str((getattr(st, "attributes", None) or {}).get("unit_of_measurement") or "").strip()
                    reste = ("%g %s" % (valeur, unite)).strip()
                    # La cle seulement si c'est parti (relecture du lot 2, point 4).
                    if await self._async_prevenir(
                            "consommables", (MSG_CONSO, {"nom": self._nom(haid, {haid: st}), "reste": reste}),
                            motif=reste):
                        self.signales.add(cle)
            elif deja:
                # Remplace : on redevient capable de prevenir.
                self.signales.discard(cle)
        if self.signales != avant:
            await self._async_garder()

    # ── Le tarif ───────────────────────────────────────────────────────────
    async def _async_creuses(self) -> None:
        c = self.cfg.get("creuses") or {}
        if not c.get("actif") or not c.get("entite"):
            return
        st = self.hass.states.get(c["entite"])
        if st is None:
            return
        valeur = str(getattr(st, "state", "")).strip().lower()
        attendu = str(c.get("valeur") or "").strip().lower()
        if not attendu:
            return
        dedans = valeur == attendu
        if dedans and not self.creuses_en_cours:
            self.creuses_en_cours = True
            await self._async_prevenir(
                "creuses", MSG_CREUSES,
                motif=attendu)
            prises = c.get("prises") or []
            if prises:
                await self._async_service("homeassistant", "turn_on", prises,
                                          regle="creuses", quoi="allumer", motif=attendu)
        elif not dedans:
            self.creuses_en_cours = False

    # ── Le monoxyde de carbone chiffre (ADR 0251) ──────────────────────────
    def _capteurs_co(self, etats: dict) -> list:
        """Les capteurs de monoxyde en ppm, sur un appareil PHYSIQUE (C16) :
        ni un modele, ni un service. Un registre illisible les garde tous :
        mieux vaut un capteur de trop qu'un danger tu."""
        cibles = [h for h in capteurs_de(etats, "carbon_monoxide") if h.startswith("sensor.")
                  and str((getattr(etats.get(h), "attributes", None) or {}).get("unit_of_measurement") or "").lower() == "ppm"]
        if not cibles:
            return []
        try:
            from homeassistant.helpers import device_registry as dr
            from homeassistant.helpers import entity_registry as er

            entites = er.async_get(self.hass)
            appareils = dr.async_get(self.hass)
            entites.async_get("sensor.loggia")  # lisible ?
        except Exception:  # noqa: BLE001
            return cibles

        def physique(haid: str) -> bool:
            e = entites.async_get(haid)
            appareil = getattr(e, "device_id", None) if e is not None else None
            if not appareil:
                return False
            try:
                fiche = appareils.async_get(appareil)
            except Exception:  # noqa: BLE001
                fiche = None
            return not str(getattr(fiche, "entry_type", None) or "").endswith("service")
        return [h for h in cibles if physique(h)]

    async def _co_tait(self) -> bool:
        """La categorie « co » decochee dans Parametres > Alertes : rien ne
        part (ADR 0250, une categorie decochee coupe tout)."""
        cfg = await self.store.async_get_shared(CLE_ALERTES, None)
        cats = cfg.get("categories") if isinstance(cfg, dict) else None
        return isinstance(cats, dict) and cats.get("co") is False

    async def _async_co(self) -> None:
        etats = self._tous_les_etats()
        cibles = self._capteurs_co(etats)
        avant = set(self.signales)
        self._purger("co:")
        tait = await self._co_tait()
        for haid in cibles:
            valeur = nombre(etats.get(haid))
            if valeur is None:
                # Muet : ni alerte ni rearmement.
                continue
            cle = "co:" + haid
            deja = cle in self.signales
            if au_dessus(valeur, SEUIL_CO, deja):
                # La cle seulement si c'est parti : un telephone pas encore pret ne fait rien perdre.
                # Arrondi VERS LE HAUT : 35,4 ppm est un danger, « 35 ppm » ne le dirait pas.
                v = math.ceil(valeur)
                if not deja and not tait and await self.regles.prevenir(
                        "veilles", "co", (MSG_CO, {"nom": self._nom(haid, etats), "v": v}),
                        titre=TITRE, critique=True, motif=("{v} ppm", {"v": v}), simuler=self._simule()):
                    self.signales.add(cle)
            elif deja:
                self.signales.discard(cle)
        if self.signales != avant:
            await self._async_garder()

    # ── Outils ─────────────────────────────────────────────────────────────
    def _nom(self, haid: str, etats: dict) -> str:
        st = etats.get(haid) or self.hass.states.get(haid)
        attrs = getattr(st, "attributes", None) or {}
        return str(attrs.get("friendly_name") or haid)

    async def _async_prevenir(self, regle: str, message: str, motif: str = "") -> bool:
        """Par le socle : le telephone choisi dans Parametres > Alertes, et les
        heures calmes — ces veilles ne reveillent personne, elles attendent.
        En observation, le telephone aussi se simule (ADR 0004)."""
        return await self.regles.prevenir("veilles", regle, message, motif=motif, simuler=self._simule())

    async def _async_service(self, domaine: str, service: str, cibles: list, *,
                             regle: str = "", quoi: str = "", motif: str = "") -> list:
        """Commande par le socle : il ecarte ce qu'une main tient, et note."""
        return await self.regles.agir("veilles", regle, domaine, service, cibles,
                                      quoi=quoi or service, motif=motif,
                                      priorite=PRIORITES.get(regle, 0), simuler=self._simule())

    def _purger(self, prefixe: str, designes=None) -> None:
        """Ne garde de `prefixe` que les cles encore suivies (relecture du lot
        2, point 6) : la limite de MAX_SIGNALES ne jette jamais une vraie cle.

        `designes` : la liste de l'utilisateur fait foi — un capteur qu'on ne
        designe plus sort. Sans elle (les piles, le CO2 decouvert), ne sort
        QUE ce qui n'existe plus : ni etat, ni entree au registre des entites
        (contre-relecture, point A). Au premier passage du demarrage,
        Zigbee2MQTT n'a pas toujours cree ses entites : leur cle etait purgee,
        effacee du disque, et la pile toujours basse repartait au telephone a
        chaque redemarrage. Un registre illisible : on ne sait pas, on garde."""
        if designes is not None:
            garder = set(designes).__contains__
        else:
            try:
                from homeassistant.helpers import entity_registry as er

                registre = er.async_get(self.hass)
                registre.async_get("sensor.loggia")  # lisible ?
            except Exception:  # noqa: BLE001
                return

            def garder(haid: str) -> bool:
                return self.hass.states.get(haid) is not None or registre.async_get(haid) is not None

        self.signales = {k for k in self.signales
                         if not k.startswith(prefixe) or garder(k[len(prefixe):])}

    def _simule(self) -> bool:
        """« Observer sans agir » (audit du 19/10, H3) : les veilles notent ce
        qu'elles feraient, et ne touchent a rien."""
        return bool((self.cfg.get("simulation") or {}).get("actif"))

    def _repartir_de_zero(self) -> None:
        """Du simule au reel, ou l'inverse : la veille repart de ce que la
        maison EST (ADR 0004). Une alerte simulee n'est jamais partie : revenu
        au reel, on doit pouvoir la dire pour de vrai."""
        self.signales = set()
        self.creuses_en_cours = False
        self.regles.relacher("veilles")

    # ── Ce qui a ete signale, sur le disque (audit du 19/10, M2) ───────────
    def _store_etat(self):
        if self._depot is None:
            from homeassistant.helpers.storage import Store

            self._depot = Store(self.hass, VERSION_ETAT, CLE_ETAT)
        return self._depot

    async def _async_lire_etat(self) -> None:
        """Ce qui a ete signale avant l'arret. Illisible ou abime, on repart a
        vide et on le dit : au pire, une alerte de plus."""
        try:
            brut = await self._store_etat().async_load()
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Loggia veilles : etat illisible, on repart a vide")
            brut = None
        liste = brut.get("signales") if isinstance(brut, dict) else None
        if not isinstance(liste, list):
            liste = []
        self.signales = {s for s in liste if isinstance(s, str) and s.startswith(PREFIXES_SIGNALES)}
        if len(self.signales) > MAX_SIGNALES:
            self.signales = set(sorted(self.signales)[:MAX_SIGNALES])

    async def _async_garder(self) -> None:
        """Ecrit ce qui a ete signale. Il change rarement — une pile, un CO2 —,
        on l'ecrit donc tout de suite."""
        try:
            await self._store_etat().async_save({"signales": sorted(self.signales)[:MAX_SIGNALES]})
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Loggia veilles : etat non enregistre")

    # ── Ce que l'interface lit et ecrit ────────────────────────────────────
    async def async_config(self) -> dict[str, Any]:
        return self._config_de(await self.store.async_get_shared(CLE, None))

    def _config_de(self, brut: Any) -> dict[str, Any]:
        """La configuration, defauts compris. Synchrone : `async_enregistrer`
        la rebatit sous le verrou du magasin (lot 15 de l'audit du 03/10)."""
        cfg = {k: dict(v) for k, v in DEFAUT.items()}
        cfg["co2"]["capteurs"] = []
        cfg["co2"]["ventilation"] = []
        cfg["creuses"]["prises"] = []
        cfg["consommables"]["capteurs"] = []
        if isinstance(brut, dict):
            for section, valeurs in brut.items():
                if section in cfg and isinstance(valeurs, dict):
                    cfg[section].update(valeurs)
        self._nettoyer(cfg)
        return cfg

    @staticmethod
    def _nettoyer(cfg: dict[str, Any]) -> None:
        """Les listes ne portent que des identifiants d'entite, l'entite du
        tarif aussi, et le drapeau d'observation est un vrai booleen (audit du
        19/10, M24). A la lecture comme a l'ecriture : une configuration deja
        abimee par une version d'avant se relit propre."""
        for section, cle in LISTES:
            cfg[section][cle] = entites_propres(cfg[section].get(cle))
        entite = cfg["creuses"].get("entite")
        cfg["creuses"]["entite"] = entite if est_entite(entite) else ""
        cfg["simulation"] = {"actif": cfg["simulation"].get("actif") is True}

    async def async_etat(self) -> dict[str, Any]:
        etats = self._tous_les_etats()
        alertes = await self.store.async_get_shared(CLE_ALERTES, None)
        return {
            "config": self.cfg or await self.async_config(),
            # Ce que la decouverte propose, pour que l'interface n'ait rien a deviner.
            "capteurs_co2": capteurs_de(etats, "carbon_dioxide"),
            "capteurs_batterie": capteurs_de(etats, "battery"),
            # Sans service de notification, ces veilles n'ont personne a qui parler.
            "notification": bool(str((alertes or {}).get("service") or "").strip()),
            "signales": sorted(self.signales),
            "journal": await self.regles.journal(limite=40, module="veilles"),
        }

    def _poser_patch(self, cfg: dict[str, Any], patch: dict[str, Any]) -> None:
        """Le patch de l'ecran, pose sur `cfg`, seuils bornes. Synchrone :
        sous le verrou."""
        for section, valeurs in (patch or {}).items():
            if section in cfg and isinstance(valeurs, dict):
                cfg[section].update(valeurs)
        # Ce qui n'est pas une entite est ecarte, jamais ecrit (audit du 19/10, M24).
        self._nettoyer(cfg)
        # Les seuils se bornent ICI, pas seulement dans le navigateur (audit du
        # 23/09) : l'ecran clampait, l'API non. Un seuil illisible ou negatif
        # passait, et la veille devenait muette pour toujours sans rien dire.
        # Meme regime que les tentatives des volets.
        #
        # Le consommable n'a PAS de borne haute : son seuil est dans l'unite du
        # capteur, et un reservoir se compte en millilitres autant qu'un filtre
        # en pour-cent. On refuse seulement ce qui n'est pas un nombre positif.
        for section, mini, maxi in (("batterie", 1, 100), ("co2", 400, 5000), ("consommables", 1, None)):
            s = cfg.get(section)
            if not isinstance(s, dict) or "seuil" not in s:
                continue
            try:
                v = float(s["seuil"])
                if v != v or v in (float("inf"), float("-inf")):
                    raise ValueError(s["seuil"])
                v = max(mini, v if maxi is None else min(maxi, v))
                s["seuil"] = int(v) if float(v).is_integer() else v
            except (TypeError, ValueError):
                s["seuil"] = DEFAUT[section]["seuil"]

    async def async_enregistrer(self, patch: dict[str, Any]) -> dict[str, Any]:
        # D'un seul tenant, sous le verrou du magasin (lot 15 de l'audit du
        # 03/10 ; voir store.async_modifier_shared).
        simulait = False

        def changer(brut: Any) -> dict[str, Any]:
            nonlocal simulait
            cfg = self._config_de(brut)
            simulait = cfg["simulation"]["actif"]
            self._poser_patch(cfg, patch)
            return cfg

        cfg = await self.store.async_modifier_shared(CLE, changer)
        self.cfg = cfg
        repart = cfg["simulation"]["actif"] != simulait
        if repart:
            self._repartir_de_zero()
            await self._async_garder()
        await self._async_reabonner()
        if repart:
            # Revenu au reel, un monoxyde deja dangereux se dit tout de suite.
            await self._async_co()
        return cfg

    @callback
    def async_arreter(self) -> None:
        # L'attente du demarrage, l'ecoute du registre et le reabonnement en
        # attente partent avec le reste (audit du 19/10, M4) : sans eux, une
        # instance retiree se reabonnerait encore.
        self._arrete = True
        for nom in ("_au_demarrage", "_defait_registre", "_reabonnement", "_horaire"):
            defaire = getattr(self, nom, None)
            if defaire is not None:
                try:
                    defaire()
                except Exception:  # noqa: BLE001
                    _LOGGER.debug("Loggia veilles : %s deja retire", nom)
                setattr(self, nom, None)
        for defaire in self._defait:
            try:
                defaire()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia veilles : desabonnement sans effet")
        self._defait.clear()
