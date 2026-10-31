"""Le moteur du chauffage : un seul chef par chauffage (chantier Chauffage, § 5 et § 6).

Pourquoi ce module existe
─────────────────────────
Deux systemes qui commandent le meme radiateur se defont l'un l'autre EN
SILENCE. Pour chaque chauffage dont le planning est allume, ce moteur est donc
le SEUL a commander. La regle des fenetres et la presence ne lui envoient plus
d'ordres : elles lui donnent des FAITS (« fenetre ouverte dans la chambre »,
« maison vide »), et il decide.

Une question, toujours la meme
──────────────────────────────
A chaque evenement — une fenetre, un depart ou un retour, un geste, l'heure
d'un changement, un redemarrage, un appareil qui revient —, pour chaque
chauffage dont le planning est allume : « que doit-il faire MAINTENANT ? »
(`chauffage_calcul.mode_voulu`). On compare au dernier etat connu de
l'appareil, et on n'envoie un ordre que s'il differe : jamais de rejeu, jamais
d'ordre en double. Un seul minuteur pour le prochain changement, tous
chauffages confondus ; au demarrage, on rattrape ce qui doit etre en vigueur.

Pourquoi il ne passe PAS par `regles.agir`
──────────────────────────────────────────
L'entonnoir du socle est fait pour des regles qui se partagent une entite. Ici
il n'y a qu'un chef, et trois de ses garde-fous le trahiraient :
  * le GEL (`regles.py:611`) : une main posee sur l'entite la retire aux
    regles trente minutes (GEL_DEFAUT). Un changement du planning tombe dans
    ces trente minutes serait perdu (§ 5.4) — la reprise en main le remplace ;
  * les TENUES (`regles.py:617-621`) : une coupure de fenetre laissee par la
    regle des fenetres, plus forte, retiendrait le chef lui-meme ;
  * la MAIN n'y est qu'un `user_id` (`regles.py:360`) : la telecommande du
    poele, l'application du fabricant n'en portent pas. Le geste se reconnait
    ici autrement : un etat qui ne correspond pas au dernier ordre, hors d'une
    fenetre de stabilisation de 90 s apres lui, et tant que l'appareil ne l'a
    pas confirme (une fois confirme, tout changement est un geste).
Il garde du socle ce qui vaut pour tous : le JOURNAL (`regles.noter`) et
l'esprit de « Observer sans agir » (ADR 0004) — son propre drapeau,
`simulation.actif`, comme chaque module qui commande.

Pur la ou il peut l'etre : le calcul (`chauffage_calcul`), les familles et
leurs ordres (`chauffage_familles`), la configuration (`chauffage_config`).
Ici vivent le temps reel, les abonnements et les appels.
"""
from __future__ import annotations

import asyncio
import copy
import logging
import re
from functools import partial
from datetime import datetime, timedelta, timezone, tzinfo
from typing import TYPE_CHECKING, Any

from homeassistant.core import Context, HomeAssistant, callback

from .chauffage_calcul import (JOURS, MINUTES_JOUR, changement_en_cours, changements, ecrire_heure, lire_heure,
                               mode_voulu, prochain_changement)
from .chauffage_config import (TEMPERATURE_MAX, TEMPERATURE_MIN, config_defaut, lire_config, lire_instant,
                               lire_reprises, nouvelle_reprise, poser_maison, poser_patch)
from .chauffage_familles import (MUETS, commande, consigne_en_unite, deja, famille, interrupteurs_du_module,
                                 lire_appareil, PLATEFORME_SCHEDULER, PLATEFORME_VELAIR, PREFIXE_CONSIGNE,
                                 concurrents_scheduler, entites_velair,
                                 historique_resume, mode_applicable, mode_chauffe, modes_permis, options_du_module,
                                 pas_revele, programmes_de_l_appareil, puissance_fixe, refroidit, temperature_du_mode,
                                 trame_fausse)
from .const import DOMAIN
from .eau_chaude import ESSAIS_LEVEE, RELANCE as RELANCE_EAU, RELANCE_MAX as RELANCE_EAU_MAX, absence_voulue, levee_a, option_active, ordres_absence, sait_absence
from .refus import RefusNomme
from .regles import demarrer
from .store import MaisonReserveeError
from .textes import joindre
from .unites import unite_temperature

if TYPE_CHECKING:  # l'annotation seule — les tests chargent ce module hors paquet
    from .store import LoggiaStore

_LOGGER = logging.getLogger(__name__)

MODULE = "chauffage"
# La configuration, partie commune du magasin (`store.py`) ; et l'etat vivant —
# les reprises en main — dans SON fichier de `.storage`, comme le journal.
CLE = "loggia_chauffage"
CLE_ETAT = "loggia_chauffage_etat"
# Les chauffe-eau que Loggia a mis en mode absence pour les Vacances (eau_chaude.py) :
# ce qu'il levera, et rien d'autre. Un fichier a part, comme les reprises.
CLE_EAU = "loggia_eau_chaude_etat"
VERSION_ETAT = 1
# Apres un ordre, l'appareil a le temps de le dire : un etat different dans
# cette fenetre n'est pas un geste (§ 5.4).
STABILISATION = 90
# Un ordre refuse se retente UNE fois, une minute plus tard (§ 5.6).
RELANCE = 60
# Un ordre ACCEPTE se verifie, la stabilisation passee : Home Assistant accepte un
# `select_option` que le module zigbee n'applique jamais, et le journal disait
# « Planning · Confort » sur un radiateur reste en Eco (relecture finale du 12/10).
VERIFICATION = STABILISATION + 5
# Un service qui ne repond pas en quinze secondes compte comme un refus.
DELAI_APPEL = 15
# Les durees qu'une reprise en main propose, en minutes (§ 9.3).
DUREES_MAIN = (60, 120, 240)
# Sans prochain changement a venir, la fin par defaut d'une reprise est 24 h plus tard.
DUREE_SANS_CHANGEMENT = timedelta(hours=24)
# Les prereglages qu'un VTherm prend de lui-meme : `safety` (sonde muette ; `security` dans
# ses anciennes versions) et `power` (delestage). Pas des gestes ; le moteur ne le commande
# pas tant qu'il y est, sauf pour l'eteindre.
PRESETS_AUTOMATIQUES = ("safety", "security", "power")

# Apres le demarrage, le temps qu'un module zigbee revienne : « injoignable » ne
# s'ecrit pas au journal pendant ce temps (audit du 19/10 : une ligne par radiateur
# a chaque redemarrage, ~2 min d'absence).
SILENCE_AU_DEMARRAGE = timedelta(minutes=5)

# Les mots du journal : le francais ecrit, la cle que l'ecran traduira (plan 2).
MOTS = {"confort": "Confort", "confort_1": "Confort −1", "confort_2": "Confort −2",
        "eco": "Éco", "hors_gel": "Hors-gel", "arret": "Arrêt"}
MOTS_MAISON = {"planning": "Planning", "absence": "Absence", "vacances": "Vacances", "ete": "Été"}
# La fin des Vacances que l'ecran envoie : un jour seul, « 2026-10-20 » (`_minuit_de_la_maison`).
DATE_SEULE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
# Le seul `detail` d'une reprise en main qui ne soit pas le NOM de qui l'a demandee a Loggia.
GESTE_AILLEURS = "geste fait ailleurs"


def journal_pour(lignes: list, lecture: Any) -> list:
    """Le journal tel qu'un compte peut le lire (relecture finale du 12/10, point 4) :
    sur le modele du distributeur (`_journal_pour`, distributeurs.py), en plus strict —
    seulement les lignes d'un chauffage qu'il peut LIRE, et ces seules cibles. Ni la
    maison (son `detail` est le nom de qui l'a changee), ni la fenetre d'une piece
    d'ailleurs, ni le nom de qui a repris la main (`async_reprendre_la_main`). Des
    COPIES : le journal du socle n'est pas touche. `lecture` : le filtre de
    `_lecture_autorisee` (discovery.py), que Home Assistant pose sur tout compte qui
    n'est pas administrateur ; None — un administrateur, ou l'etat demande sans
    compte — : tout se lit."""
    if lecture is None:
        return lignes
    sortie = []
    for e in lignes:
        cibles = [c for c in ((e.get("cibles") if isinstance(e, dict) else None) or [])
                  if isinstance(c, str) and lecture(c)]
        if not cibles:
            continue                                # la maison, ou un chauffage qu'il ne lit pas
        ligne = {**e, "cibles": cibles}
        if e.get("quoi") == "reprise en main" and e.get("detail") != GESTE_AILLEURS:
            ligne["detail"] = ""                    # le nom de qui l'a demandee a Loggia
        sortie.append(ligne)
    return sortie


# ── Le temps : heure murale et vrais instants ───────────────────────────────

def fuseau_de(hass: Any) -> tzinfo:
    """Le fuseau de la maison (`hass.config.time_zone`). Home Assistant tient
    deja ce fuseau en cache : `ZoneInfo` ne relit pas le disque. Illisible —
    une base des fuseaux absente, un nom inconnu — : l'UTC, et on le dit."""
    nom = getattr(getattr(hass, "config", None), "time_zone", None)
    if isinstance(nom, str) and nom:
        try:
            from zoneinfo import ZoneInfo

            return ZoneInfo(nom)
        except Exception:  # noqa: BLE001 — ZoneInfoNotFoundError, ValueError
            _LOGGER.warning("Loggia chauffage : fuseau %s illisible, l'heure UTC fait foi", nom)
    return timezone.utc


def heure_murale(instant: datetime, fuseau: tzinfo) -> tuple[int, int]:
    """Un instant, lu a l'horloge de la maison : (jour 0-6, minute 0-1439).

    Le planning ne recule jamais. Quand l'horloge revient en arriere (le
    dernier dimanche d'octobre, 02:00-03:00 passe deux fois), le SECOND
    passage rend la derniere minute que le premier a deja vecue — la fin de la
    plage repetee moins une minute (02:59) — et non l'heure affichee : sinon
    un « 02:15 » defairait le changement de 02:45 deja applique. A 03:00,
    l'horloge repart."""
    local = instant.astimezone(fuseau)
    if local.fold:                                  # second passage d'une plage repetee
        suite = instant.astimezone(timezone.utc)
        for _ in range(1440):                       # on avance jusqu'a sa fin (jamais plus d'un jour)
            suite += timedelta(minutes=1)
            apres = suite.astimezone(fuseau)
            if not apres.fold:
                local = apres.replace(tzinfo=None) - timedelta(minutes=1)
                break
    return local.weekday(), local.hour * 60 + local.minute


def _existe(naif: datetime, fuseau: tzinfo) -> bool:
    """Cette heure murale existe-t-elle ? Le passage a l'heure d'ete en saute une."""
    aller = naif.replace(tzinfo=fuseau).astimezone(timezone.utc)
    return aller.astimezone(fuseau).replace(tzinfo=None) == naif


def instant_de(jour: int, minute: int, apres: datetime, fuseau: tzinfo) -> datetime:
    """Le premier instant APRES `apres` ou l'horloge de la maison marque
    (jour, minute) — en UTC.

    Une heure qui n'existe pas (le « 02:30 » du passage a l'heure d'ete)
    tombe a la premiere minute qui existe : 03:00. Une heure qui existe deux
    fois (le « 02:30 » de l'heure d'hiver) tombe a la PREMIERE ; deja passee,
    a la seconde — le changement s'applique une fois, l'appareil y est deja."""
    local = apres.astimezone(fuseau)
    ecart = (jour - local.weekday()) % 7
    if ecart == 0 and minute <= local.hour * 60 + local.minute:
        ecart = 7
    date = local.date() + timedelta(days=ecart)
    naif = datetime(date.year, date.month, date.day, minute // 60, minute % 60)
    for _ in range(180):
        if _existe(naif, fuseau):
            break
        naif += timedelta(minutes=1)
    for pli in (0, 1):
        instant = naif.replace(tzinfo=fuseau, fold=pli).astimezone(timezone.utc)
        if instant > apres:
            return instant
    return instant_de(jour, minute, apres + timedelta(days=1), fuseau)


# ── Les modules fil pilote et leurs interrupteurs ───────────────────────────

def select_par_interrupteur(connus: dict[str, dict[str, Any]], entrees: Any) -> dict[str, str]:
    """{interrupteur: select} : chaque `switch` du MEME appareil qu'un module fil
    pilote reconnu (`connus`, ce que rend `candidats`) designe le `select` de ce
    module — celui que la regle des fenetres coupe a sa place (§ 3.3).

    Un seul passage sur le registre, a partir des chauffages deja reconnus.
    Demandee interrupteur par interrupteur (`select_du_module`), la question
    refaisait `candidats` a chaque fois : l'etat de l'ecran, qui la posait pour
    chaque chauffage, en faisait 43 pour 2 000 entites et six pieces — dix fois
    le temps de l'etat entier, sur la boucle d'evenements (relecture du 12/10).

    Comme `select_du_module` : un appareil qui a deux `select` fil pilote donne
    le premier reconnu ; un interrupteur se lit a sa premiere entree."""
    par_appareil: dict[Any, str] = {}
    for info in connus.values():
        if info.get("famille") == "fil_pilote" and info.get("appareil"):
            par_appareil.setdefault(info["appareil"], info["entite"])
    table: dict[str, str] = {}
    if not par_appareil:
        return table
    vus: set[str] = set()
    for e in entrees or ():
        haid = getattr(e, "entity_id", None)
        if not isinstance(haid, str) or not haid.startswith("switch.") or haid in vus:
            continue
        vus.add(haid)
        select = par_appareil.get(getattr(e, "device_id", None))
        if select:
            table[haid] = select
    return table


# ── Le moteur ───────────────────────────────────────────────────────────────

class LoggiaChauffage:
    """Le seul chef des chauffages dont le planning est allume."""

    def __init__(self, hass: HomeAssistant, store: "LoggiaStore", regles=None) -> None:
        self.hass = hass
        self.store = store
        # Le socle commun : le journal — voir l'en-tete pour ce qu'on n'y prend pas.
        self.regles = regles
        self.cfg: dict[str, Any] = config_defaut()
        # Les reprises en main : {cle: {"mode", "temperature", "fin", "depuis", "par"}}.
        self.reprises: dict[str, dict[str, Any]] = {}
        # Les FAITS de la regle des fenetres : {entity_id: pieces ouvertes}.
        self.fenetres: dict[str, set[str]] = {}
        self.fuseau = fuseau_de(hass)
        self._horloge = lambda: datetime.now(timezone.utc)
        # {entity_id: cle} des chauffages au planning allume.
        self._pilotes: dict[str, str] = {}
        # Le dernier ordre parti, par chauffage : {"cible", "ts"}.
        self._ordres: dict[str, dict[str, Any]] = {}
        # Nos contextes : leurs echos ne sont pas des gestes.
        self._miens: list[str] = []
        # Ce qui a deja ete dit au journal, pour ne pas le redire a chaque
        # evenement : une simulation, un appareil injoignable.
        self._notes: dict[str, Any] = {}
        self._relances: dict[str, Any] = {}
        # La verification du dernier ordre parti, par chauffage (`_verifier_plus_tard`).
        self._verifications: dict[str, Any] = {}
        # Le pas que chaque appareil a REVELE en prenant nos consignes a sa facon (30/10) :
        # {entity_id: pas}. Un poele MCZ n'annonce pas qu'il est au degre.
        self._pas: dict[str, float] = {}
        # Le dernier ordre qu'un appareil n'a pas garde, par chauffage (30/10) : {"mode", "temperature", "depuis"}.
        self._defaits: dict[str, dict[str, Any]] = {}
        # Les `switch` du programme de chaque appareil pilote, ecoutes : {entity_id: cle} (30/10).
        self._programmes: dict[str, str] = {}
        self._minuteur = None
        self._ecoute = None
        self._au_demarrage = None
        # L'ecoute du registre des entites : un radiateur renomme (audit du 19/10).
        self._ecoute_registre = None
        self._depot = None
        # Les chauffe-eau mis en mode absence pour les Vacances, et leur fichier (eau_chaude.py).
        self._eau_poses: set[str] = set()
        # Ceux qu'on a remis a la main pendant les Vacances : laisses tranquilles jusqu'a leur fin.
        self._eau_laisses: set[str] = set()
        # Ceux qu'on a VUS en absence depuis notre ordre : seul un « off » apres un « on » est un geste.
        self._eau_vus: set[str] = set()
        # Les levees refusees, par ballon : trois essais, puis un message au journal (en memoire).
        self._eau_essais: dict[str, int] = {}
        # Depuis quand un ballon pose attend d'etre leve (muet) : le reveil court est borne.
        self._eau_attente: datetime | None = None
        self._depot_eau = None
        self._registre_dit = False
        # Arrete (`async_arreter`) : plus rien ne se programme, ne s'abonne ni ne
        # commande, meme pour une tache deja en vol. Sans lui, un rechargement
        # laisserait l'ancien moteur commander a cote du nouveau.
        self._arrete = False
        self._verrou = asyncio.Lock()
        demarrer(hass, self, self._async_demarrer(), "chauffage")

    async def _async_demarrer(self) -> None:
        self.cfg = await self.async_config()
        # Qui est pilote, des maintenant : la regle des fenetres et la presence le
        # demandent (`pilote`) avant la fin du demarrage de Home Assistant.
        self._recenser()
        try:
            brut = await self._store_etat().async_load()
            # Arrete pendant ce chargement (un rechargement de l'integration) : le moteur
            # suivant tient le fichier, l'ancien n'y reecrit pas sa copie nettoyee.
            if self._arrete:
                return
            self.reprises = lire_reprises(brut, self.maintenant())
            if brut is not None and brut != self.reprises:
                await self._sauver_reprises()
            await self._lire_eau()
            if self._arrete:
                return                              # arrete pendant l'ecriture
            # Le rattrapage attend que Home Assistant ait FINI de demarrer : avant,
            # le radiateur n'existe peut-etre pas encore (ADR 0138, point 5).
            from homeassistant.helpers.start import async_at_started

            self._au_demarrage = async_at_started(self.hass, self._async_rattraper)
            # Un radiateur renomme : sans cette ecoute, il restait abonne sous son
            # ancien nom jusqu'au prochain rechargement — deux chefs (audit du 19/10).
            bus = getattr(self.hass, "bus", None)
            if bus is not None:
                self._ecoute_registre = bus.async_listen("entity_registry_updated", self._sur_registre)
        except Exception:
            # Rate a moitie (relecture finale du 12/10, point 3) : les chauffages sont
            # deja nommes pilotes, et le moteur n'est abonne a rien. Il ne se dit plus le
            # chef de personne — la regle des fenetres et la presence reprennent la main —
            # et l'echec remonte a `demarrer` (regles.py), qui l'ecrit au journal de Home
            # Assistant et le retient : `demarrage` faux, que l'etat publie. Jusqu'au
            # prochain demarrage, le moteur ne commande plus rien (`_hors_service`).
            self._pilotes = {}
            _LOGGER.warning("Loggia chauffage : demarrage rate, la regle des fenetres et la presence "
                            "gardent les radiateurs jusqu'au prochain demarrage")
            raise

    async def _async_rattraper(self, _hass=None) -> None:
        """Au demarrage, ce qui doit etre en vigueur s'applique : une coupure a
        6 h 20 ne fait pas sauter le Confort de 6 h 30 (§ 5.3)."""
        if self._arrete:
            return
        self._au_demarrage = None
        # Les modules zigbee reviennent une a deux minutes apres Home Assistant : pas de
        # « retenu · appareil injoignable » au journal pendant ce temps (audit du 19/10).
        self._demarre_a = self.maintenant()
        self._reabonner()
        await self.async_evaluer(raison="redemarrage")

    def maintenant(self) -> datetime:
        return self._horloge()

    def _rate(self) -> bool:
        """Le demarrage a echoue : `demarrage` faux, que `regles.demarrer` ecrit (le
        fichier des reprises illisible, par exemple). Jusqu'au prochain demarrage — un
        rechargement de l'integration, un redemarrage de Home Assistant."""
        return getattr(self, "demarrage", None) is False

    def _hors_service(self) -> bool:
        """Arrete (`async_arreter`), ou rate au demarrage (`_rate`) : le moteur ne
        s'abonne, ne se programme, ne verifie ni ne commande plus. Ce qui n'est que
        configuration ou fait — un reglage, le mode de la maison, une fenetre — garde
        ses propres gardes : apres un demarrage rate, cela s'enregistre encore, pour le
        moteur suivant (relecture finale du 12/10, point 3)."""
        return self._arrete or self._rate()

    # ── Ce que Home Assistant sait des chauffages ──────────────────────────
    def _registre(self):
        """Le registre des entites, ou None — en le DISANT une fois."""
        try:
            from homeassistant.helpers import entity_registry as er

            return er.async_get(self.hass)
        except Exception:  # noqa: BLE001
            if not self._registre_dit:
                self._registre_dit = True
                _LOGGER.warning("Loggia chauffage : registre des entites illisible, "
                                "les chauffages restent ceux qui sont enregistres", exc_info=True)
            return None

    def _entrees(self) -> list:
        registre = self._registre()
        try:
            return list(registre.entities.values()) if registre is not None else []
        except Exception:  # noqa: BLE001
            return []

    def _entrees_par_id(self) -> dict[str, Any] | None:
        """{identifiant du registre: entree}, ou None si le registre est illisible."""
        if self._registre() is None:
            return None
        return {getattr(e, "id", None): e for e in self._entrees() if getattr(e, "id", None)}

    def _entite(self, cle: str, c: dict | None, registre: dict | None) -> str | None:
        """L'entity_id d'AUJOURD'HUI d'un chauffage — l'utilisateur renomme.
        None : introuvable."""
        if registre is None:
            return (c or {}).get("entite")
        entree = registre.get(cle)
        if entree is not None:
            return getattr(entree, "entity_id", None)
        if "." in cle and self.hass.states.get(cle) is not None:
            return cle
        return None

    def _attributs(self, entite: str | None) -> tuple[Any, dict]:
        st = self.hass.states.get(entite) if entite else None
        return getattr(st, "state", None), self._avec_pas(entite, dict(getattr(st, "attributes", None) or {}))

    def _avec_pas(self, entite: str | None, attrs: dict) -> dict:
        """Les attributs d'un appareil, avec le pas qu'il a REVELE quand il n'en annonce
        aucun (30/10, `pas_revele`) : la consigne suivante part a ce pas."""
        pas = self._pas.get(entite) if entite else None
        if pas is not None and attrs.get("target_temp_step") is None:
            return {**attrs, "target_temp_step": pas}
        return attrs

    def _nom_appareil(self, appareil: str | None) -> str | None:
        """Le nom d'un appareil au registre des appareils : celui que l'utilisateur
        lui a donne (`name_by_user`), sinon le sien. None : pas d'appareil, un
        appareil inconnu ou un registre illisible — l'appelant a son repli."""
        if not appareil:
            return None
        try:
            from homeassistant.helpers import device_registry as dr

            entree = dr.async_get(self.hass).async_get(appareil)
        except Exception:  # noqa: BLE001 — un nom en moins, pas une panne
            return None
        nom = getattr(entree, "name_by_user", None) or getattr(entree, "name", None)
        return nom if isinstance(nom, str) and nom else None

    def _commandes(self) -> dict[str, str]:
        """{entite : le VTherm ou le Better Thermostat qui la commande} (audit du 19/10)."""
        from .discovery import commandes_du_registre

        return commandes_du_registre(self.hass, self._entrees())

    def candidats(self) -> dict[str, dict[str, Any]]:
        """Les chauffages que la maison a, reconnus sans reglage (§ 3) :
        {cle: {"entite", "famille", "permis", "appareil"}}. Ce qu'un VTherm ou un
        Better Thermostat commande n'en est pas un de plus : son planning passe
        par eux (audit du 19/10)."""
        trouves: dict[str, dict[str, Any]] = {}
        vus = set()
        commandes = self._commandes()
        for e in self._entrees():
            haid = str(getattr(e, "entity_id", "") or "")
            domaine = haid.split(".", 1)[0]
            if domaine not in ("climate", "select") or getattr(e, "disabled_by", None):
                continue
            if haid in commandes:
                vus.add(haid)
                continue
            vus.add(haid)
            _, attrs = self._attributs(haid)
            fam = famille(domaine, getattr(e, "platform", None), getattr(e, "unique_id", None),
                          getattr(e, "original_name", None), attrs, getattr(e, "translation_key", None))
            if fam:
                trouves[getattr(e, "id", None) or haid] = {
                    "entite": haid, "famille": fam, "permis": modes_permis(fam, attrs),
                    "appareil": getattr(e, "device_id", None)}
        # Un `climate` sans registre (YAML sans unique_id) : son entity_id fait sa cle.
        try:
            climats = sorted(self.hass.states.async_entity_ids("climate"))
        except Exception:  # noqa: BLE001
            climats = []
        for haid in climats:
            if haid in vus:
                continue
            _, attrs = self._attributs(haid)
            # Ni plateforme ni identifiant : `famille` ne juge que l'etat, et ecarte
            # un `climate` qui ne recoit pas de consigne (choix 16).
            fam = famille("climate", None, None, None, attrs)
            if fam:
                trouves[haid] = {"entite": haid, "famille": fam,
                                 "permis": modes_permis(fam, attrs), "appareil": None}
        return trouves

    def pilote(self, entite: str) -> bool:
        """Ce chauffage suit-il le planning, et le moteur COMMANDE-t-il ? Alors il est
        son seul chef. En observation (Observer sans agir) il ne commande rien : il
        n'est le chef de personne, la regle des fenetres et la presence gardent la main."""
        return entite in self._pilotes and not self._simule()

    def select_du_module(self, entite: str) -> str | None:
        """Le `select` fil pilote d'un module dont `entite` est l'INTERRUPTEUR —
        celui qu'il ne faut jamais couper (§ 3.3). None sinon. Pour UN
        interrupteur, sous la regle de `select_par_interrupteur` : l'etat de
        l'ecran, lui, fait la table de tous en un seul passage."""
        if not isinstance(entite, str) or not entite.startswith("switch."):
            return None
        entrees = self._entrees()
        appareil = next((getattr(e, "device_id", None) for e in entrees
                         if getattr(e, "entity_id", None) == entite), None)
        if not appareil:
            return None                             # hors du registre, ou sans appareil : pas de module
        return select_par_interrupteur(self.candidats(), entrees).get(entite)

    def _module_coupe(self, info: dict[str, Any] | None) -> bool:
        """L'interrupteur du module est-il coupe ? Jamais rallume par Loggia
        (§ 3.3) : on le DIT — le planning ne peut rien (§ 10)."""
        if not info or info.get("famille") != "fil_pilote":
            return False
        for haid in interrupteurs_du_module(self._entrees(), info.get("appareil")):
            if str(getattr(self.hass.states.get(haid), "state", "")).lower() == "off":
                return True
        return False

    def _concurrents(self, entite: str | None) -> list[dict[str, Any]]:
        """Les programmes d'AILLEURS qui commandent ce chauffage (D5, § 3.4 ; audit
        du 19/10) : une integration Velair, un `switch` Scheduler allume, une
        automatisation allumee dont une action le commande. [{type, entite, nom}].
        Planning allume avec eux : deux chefs. Jamais coupes par Loggia : on le DIT."""
        if not entite:
            return []
        sortie: list[dict[str, Any]] = []

        def nom(haid: str) -> str:
            return str((getattr(self.hass.states.get(haid), "attributes", None) or {}).get("friendly_name") or haid)

        try:
            for x in self.hass.config_entries.async_entries(PLATEFORME_VELAIR):
                if entite in entites_velair(getattr(x, "options", None), getattr(x, "data", None)):
                    sortie.append({"type": "velair", "entite": None, "nom": str(getattr(x, "title", "") or "Velair")})
        except Exception:  # noqa: BLE001
            pass
        planificateurs = [(getattr(e, "entity_id", ""), *self._attributs(getattr(e, "entity_id", "")))
                          for e in self._entrees()
                          if getattr(e, "platform", None) == PLATEFORME_SCHEDULER
                          and str(getattr(e, "entity_id", "")).startswith("switch.")]
        for haid in concurrents_scheduler(planificateurs, entite):
            sortie.append({"type": "scheduler", "entite": haid, "nom": nom(haid)})
        from .automatisations import automatisations_qui_commandent

        for haid in automatisations_qui_commandent(self.hass, entite):
            sortie.append({"type": "automation", "entite": haid, "nom": nom(haid)})
        return sortie

    def _programme_allume(self, info: dict[str, Any] | None) -> str | None:
        """Le `switch` allume du programme de l'APPAREIL (le chrono d'un poele),
        ou None. Allume, il change les reglages lui-meme : le planning ne s'allume
        pas, et un planning deja allume le dit (D5 ; audit du 19/10). Jamais
        coupe par Loggia."""
        if not info or info.get("famille") == "vtherm":
            return None
        for haid in programmes_de_l_appareil(self._entrees(), info.get("appareil")):
            if str(getattr(self.hass.states.get(haid), "state", "")).lower() == "on":
                return haid
        return None

    def _programme_de(self, entite: str | None, fam: str | None) -> str | None:
        """`_programme_allume` d'un chauffage connu par son entite : l'appareil de son
        entree au registre (30/10)."""
        entree = next((e for e in self._entrees() if entite and getattr(e, "entity_id", None) == entite), None)
        if entree is None:
            return None
        return self._programme_allume({"famille": fam, "appareil": getattr(entree, "device_id", None)})

    # ── Les abonnements ────────────────────────────────────────────────────
    def _recenser(self) -> None:
        """Les chauffages au planning allume, {entity_id: cle} : ceux dont le moteur
        est le seul chef. Relus au registre des entites, qui est deja la quand la
        configuration se charge : `pilote` n'attend pas le rattrapage."""
        registre = self._entrees_par_id()
        commandes = self._commandes()
        self._pilotes = {}
        for cle, c in self.cfg["chauffages"].items():
            if c.get("planning"):
                entite = self._entite(cle, c, registre)
                # Commande par un VTherm ou un Better Thermostat : un planning allume avant
                # cette reconnaissance ne commande plus rien — deux chefs (audit du 19/10).
                if entite and entite not in commandes:
                    self._pilotes[entite] = cle

    def _reabonner(self) -> None:
        if self._hors_service():
            return                                  # rate au demarrage : `_pilotes` reste vide
        if self._ecoute is not None:
            try:
                self._ecoute()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia chauffage : ecoute deja retiree")
            self._ecoute = None
        self._recenser()
        # Le programme de chaque appareil pilote (le Timer d'un poele), ecoute : il
        # s'eteint, le planning reprend tout de suite ; il s'allume, le moteur se retient (30/10).
        entrees = self._entrees()
        self._programmes = {}
        for entite, cle in self._pilotes.items():
            if (self.cfg["chauffages"].get(cle) or {}).get("famille") == "vtherm":
                continue
            entree = next((e for e in entrees if getattr(e, "entity_id", None) == entite), None)
            for haid in programmes_de_l_appareil(entrees, getattr(entree, "device_id", None)):
                self._programmes.setdefault(haid, cle)
        if not self._pilotes:
            return
        from homeassistant.helpers.event import async_track_state_change_event

        self._ecoute = async_track_state_change_event(self.hass, sorted(self._pilotes) + sorted(self._programmes),
                                                      self._sur_etat)

    @callback
    def _sur_registre(self, event) -> None:
        """Le registre des entites a change. Un chauffage RENOMME (son
        identifiant stable ne bouge pas, son entity_id si) : on se reabonne sous
        son nouveau nom, la fenetre ouverte le suit, et il est reevalue. Avant,
        `pilote(nouveau)` repondait faux et ses gestes n'etaient plus vus."""
        if self._arrete:
            return
        d = getattr(event, "data", None) or {}
        ancien, neuf = d.get("old_entity_id"), d.get("entity_id")
        if d.get("action") != "update" or not ancien or not neuf or ancien == neuf:
            return
        nomme = ancien in self._pilotes or any(c.get("entite") == ancien for c in self.cfg["chauffages"].values())
        if ancien in self.fenetres:
            self.fenetres[neuf] = self.fenetres.pop(ancien)
        if not nomme:
            return
        self._reabonner()
        cle = self._pilotes.get(neuf)
        if cle is not None:
            self.hass.async_create_task(self.async_evaluer([cle], raison="renomme"))

    @callback
    def _sur_etat(self, event) -> None:
        """Un chauffage pilote a change. Revenu d'une coupure : on recalcule et
        on applique (§ 5.6). Un geste fait ailleurs : une reprise en main.
        Notre propre ordre, un attribut qui bouge, un VTherm qui se met de
        lui-meme en securite : rien. Tant que l'appareil n'a pas confirme notre
        ordre, un autre etat n'est qu'un etat intermediaire ; apres, c'est un geste."""
        if self._arrete:
            return
        d = getattr(event, "data", None) or {}
        entite = d.get("entity_id")
        cle = self._pilotes.get(entite)
        neuf, vieux = d.get("new_state"), d.get("old_state")
        prog = self._programmes.get(entite) if cle is None else None
        if prog is not None:
            # Le programme de l'appareil s'allume ou s'eteint : le moteur se retient, ou reprend (30/10).
            avant, apres = (str(getattr(x, "state", "")).lower() for x in (vieux, neuf))
            if neuf is not None and avant != apres and apres in ("on", "off"):
                self.hass.async_create_task(self.async_evaluer([prog], raison="programme"))
            return
        if cle is None or neuf is None or str(neuf.state).lower() in MUETS:
            return
        c = self.cfg["chauffages"].get(cle) or {}
        fam = c.get("famille")
        if trame_fausse(fam, neuf.state, neuf.attributes):
            return                                  # MCZ qui se reconnecte : ni geste, ni ordre (25/10)
        if vieux is None or str(vieux.state).lower() in MUETS or trame_fausse(fam, vieux.state, vieux.attributes):
            self.hass.async_create_task(self.async_evaluer([cle], raison="retour"))
            return
        if refroidit(fam, neuf.state):
            return                                  # elle refroidit : le planning de chauffe attend (audit du 19/10)
        unite = unite_temperature(self.hass)
        lu = lire_appareil(fam, neuf.state, neuf.attributes, unite, self._decalage(c))
        if lu["signature"] == lire_appareil(fam, vieux.state, vieux.attributes, unite)["signature"]:
            return                                  # la piece se rechauffe : ce n'est pas un geste
        if fam == "vtherm":
            avant = vieux.attributes.get("preset_mode") in PRESETS_AUTOMATIQUES
            apres = neuf.attributes.get("preset_mode") in PRESETS_AUTOMATIQUES
            if avant or apres:
                if avant and not apres:
                    # Sa securite ou son delestage est fini : le planning, qu'on ne lui envoyait plus, s'applique.
                    self.hass.async_create_task(self.async_evaluer([cle], raison="retour"))
                return                              # VTherm se met de lui-meme en securite ou en delestage
        ordre = self._ordres.get(cle)
        confirme = ordre is not None and deja(fam, ordre["cible"], neuf.state,
                                              self._avec_pas(entite, dict(neuf.attributes or {})),
                                              c.get("temperatures"), unite, self._decalage(c))
        if not confirme and ordre is not None and fam == "thermostat":
            pas = pas_revele(ordre.get("envoye"), (neuf.attributes or {}).get("temperature"))
            if pas is not None:
                self._pas[entite] = pas             # pris a SON pas : 17,5 °C envoyes, 17 lus (30/10)
                confirme = True
        if confirme:
            ordre["vu"] = True                      # l'appareil a repondu : la stabilisation est finie
            self._defaits.pop(cle, None)
        ctx = getattr(event, "context", None)
        if getattr(ctx, "id", None) in self._miens:
            return                                  # notre ordre, rendu par Home Assistant
        if ordre is not None:
            if confirme:
                return                              # l'echo de notre ordre, sous un autre contexte
            if not ordre.get("vu") and (self.maintenant() - ordre["ts"]).total_seconds() < STABILISATION:
                return                              # l'appareil se cherche encore
        if self._programme_de(entite, fam):
            return                                  # son programme allume (le Timer d'un poele) : pas un geste (30/10)
        self.hass.async_create_task(self._async_geste(cle, entite, lu, getattr(ctx, "user_id", None)))

    # ── Le calcul, et l'ordre ──────────────────────────────────────────────
    async def async_evaluer(self, cles=None, raison: str | None = None) -> None:
        """La question, pour chaque chauffage au planning allume (ou ceux de `cles`).

        Une panne ne perd ni le minuteur ni les autres chauffages : elle est
        ecrite au journal de Home Assistant, et le reveil est reprogramme quoi
        qu'il arrive. Arrete, ou rate au demarrage : rien (`_hors_service`)."""
        if self._hors_service():
            return
        try:
            async with self._verrou:
                if self._hors_service():
                    return                          # arrete pendant qu'il attendait son tour
                maintenant = self.maintenant()
                try:
                    await self._fin_des_vacances(maintenant)
                except Exception:  # noqa: BLE001
                    _LOGGER.exception("Loggia chauffage : la fin des vacances n'a pas pu etre enregistree")
                try:
                    await self._eau_chaude(maintenant)
                except Exception:  # noqa: BLE001
                    _LOGGER.exception("Loggia chauffage : l'eau chaude des vacances n'a pas pu etre reglee")
                registre = self._entrees_par_id()
                for cle, c in list(self.cfg["chauffages"].items()):
                    if self._hors_service():
                        break                       # arrete pendant un appel : plus aucun ordre
                    if c.get("planning") and (cles is None or cle in cles):
                        try:
                            await self._evaluer_un(cle, c, maintenant, registre, raison)
                        except Exception:  # noqa: BLE001
                            _LOGGER.exception("Loggia chauffage : %s n'a pas pu etre evalue", cle)
        finally:
            self._programmer()

    def _voulu(self, cle: str, c: dict[str, Any], entite: str | None,
               maintenant: datetime, fenetre: bool | None = None) -> dict[str, Any]:
        """`mode_voulu`, nourri de vrais instants : la reprise et sa fin
        ramenees a l'heure murale. `fenetre` : None = ce qui est su ; faux =
        ce qui serait voulu SANS la fenetre."""
        jour, minute = heure_murale(maintenant, self.fuseau)
        r = self.reprises.get(cle)
        reprise = None
        if r is not None:
            fin = lire_instant(r.get("fin"))
            reprise = {"mode": r.get("mode"),
                       "reste": None if fin is None else (fin - maintenant).total_seconds() / 60,
                       "fin": list(heure_murale(fin, self.fuseau)) if fin else None}
        ouverte = bool(self.fenetres.get(entite)) if fenetre is None else fenetre
        return mode_voulu(c["semaine"], self.cfg["maison"], reprise, ouverte, jour, minute, c["fenetre"])

    @staticmethod
    def _decalage(c: dict[str, Any] | None) -> float:
        """Le decalage d'un thermostat, en °C (30/10) : ce que le moteur ajoute a la
        consigne de la piece avant de l'envoyer. 0 pour le reste."""
        d = (c or {}).get("decalage")
        return float(d) if (c or {}).get("famille") == "thermostat" and isinstance(d, (int, float)) else 0.0

    def _coupures_fenetre(self) -> dict[str, tuple[list[str], str, str]]:
        """Les radiateurs que le moteur tient COUPES pour une fenetre ouverte :
        {entite: (pieces, ce qu'il faudra rendre, l'etat laisse)}. Ce qu'il
        faudra rendre : ce que le planning mettrait sans la fenetre — l'option
        du module, le mode qui chauffe d'un thermostat eteint, ou, pour un
        thermostat seulement BAISSE (fenetre en Eco), la CONSIGNE d'avant
        (`PREFIXE_CONSIGNE` ; 25/10 — elle restait basse apres la fermeture)."""
        maintenant = self.maintenant()
        sortie: dict[str, tuple[list[str], str, str]] = {}
        for entite, cle in self._pilotes.items():
            pieces = self.fenetres.get(entite)
            c = self.cfg["chauffages"].get(cle)
            etat, attrs = self._attributs(entite)
            if not pieces or not c or etat is None or str(etat).lower() in MUETS:
                continue
            if self._voulu(cle, c, entite, maintenant)["source"] != "fenetre":
                continue
            sans = self._voulu(cle, c, entite, maintenant, fenetre=False)
            mode = mode_applicable(sans["mode"], modes_permis(c["famille"], attrs))
            # Une reprise en main en temperature (sans mode, ou avec) : sa consigne.
            posee = (self.reprises.get(cle) or {}).get("temperature") if sans["source"] == "main" else None
            posee = float(posee) if isinstance(posee, (int, float)) else None
            if mode == "arret" or (mode is None and posee is None):
                continue
            laisse = str(etat)
            if c["famille"] == "fil_pilote":
                rendre = options_du_module(attrs.get("options")).get(mode)
            elif str(etat) == "off":
                rendre = mode_chauffe(attrs)
            elif c["famille"] == "thermostat" and isinstance(attrs.get("temperature"), (int, float)):
                t = posee if posee is not None else temperature_du_mode(mode, c["temperatures"])
                rendre = None if t is None else (
                    PREFIXE_CONSIGNE + str(float(consigne_en_unite(t + self._decalage(c), attrs, unite_temperature(self.hass)))))
                laisse = PREFIXE_CONSIGNE + str(float(attrs["temperature"]))
            else:
                rendre = None
            if rendre and rendre != laisse:
                sortie[entite] = (sorted(pieces), rendre, laisse)
        return sortie

    async def _evaluer_un(self, cle: str, c: dict[str, Any], maintenant: datetime, registre,
                          raison: str | None, relance: bool = False) -> None:
        entite = self._entite(cle, c, registre)
        if not entite:
            return                                  # introuvable : l'etat le dit
        if entite in self._commandes():
            return                                  # son planning passe par son VTherm / Better Thermostat (19/10)
        r = self.reprises.get(cle)
        if r is not None and r.get("fin") is not None:
            fin = lire_instant(r.get("fin"))
            if fin is None or fin <= maintenant:
                self.reprises.pop(cle, None)
                await self._sauver_reprises()
                await self.regles.noter(MODULE, "main", "reprendre le planning", cibles=[entite], n=0,
                                        motif="fin de la reprise en main")
        etat, attrs = self._attributs(entite)
        voulu = self._voulu(cle, c, entite, maintenant)
        r = self.reprises.get(cle)
        if voulu["source"] == "main" and r is not None:
            if r.get("programme"):
                return                              # il suit son programme : on le laisse faire (19/10)
            cible = {"mode": r.get("mode"), "temperature": r.get("temperature")}
        else:
            cible = {"mode": mode_applicable(voulu["mode"], modes_permis(c["famille"], attrs)), "temperature": None}
            if voulu["source"] == "fenetre" and c["famille"] == "thermostat" and r is not None:
                # La fenetre ne fait que baisser, une consigne posee a la main comprise :
                # `mode_voulu` ne compare que des modes, et une reprise sans mode (une
                # temperature seule) lui laisse la parole. L'Eco ne releve donc jamais un
                # thermostat deja plus bas que lui ; l'arret, lui, n'a pas de consigne.
                posee, froid = r.get("temperature"), temperature_du_mode(voulu["mode"], c["temperatures"])
                if r.get("mode") is None and isinstance(posee, (int, float)) and froid is not None:
                    cible["temperature"] = min(froid, float(posee))
        if cible["mode"] is None and cible["temperature"] is None:
            return
        if etat is None or str(etat).lower() in MUETS or trame_fausse(c["famille"], etat, attrs):
            # Injoignable (ou une trame fausse, 25/10) : pas d'ordre. Son retour relancera le calcul (§ 5.6). Juste apres
            # le demarrage, il revient le plus souvent de lui-meme : rien au journal (19/10).
            demarre_a = getattr(self, "_demarre_a", None)
            if demarre_a is not None and maintenant - demarre_a < SILENCE_AU_DEMARRAGE:
                return
            if self._notes.get(cle) != ("injoignable", cible["mode"]):
                self._notes[cle] = ("injoignable", cible["mode"])
                await self.regles.noter(MODULE, voulu["source"], "retenu", cibles=[entite], n=0,
                                        motif=self._motif({**c, "entite": entite}, voulu, maintenant),
                                        detail="appareil injoignable")
            return
        if refroidit(c["famille"], etat):
            # Une pompe a chaleur en froid : ni remise en chauffe, ni eteinte, pas meme par
            # l'Ete ; le planning reprend quand elle repasse en chauffe (audit du 19/10).
            if self._notes.get(cle) != ("refroidit", cible["mode"]):
                self._notes[cle] = ("refroidit", cible["mode"])
                await self.regles.noter(MODULE, voulu["source"], "retenu", cibles=[entite], n=0,
                                        motif=self._motif({**c, "entite": entite}, voulu, maintenant),
                                        detail="il refroidit")
            return
        # En securite ou en delestage, VTherm commande seul ; l'Arret, lui, passe toujours :
        # c'est la fenetre ouverte, ou l'Ete, qui l'eteint.
        if (c["famille"] == "vtherm" and cible["mode"] != "arret"
                and attrs.get("preset_mode") in PRESETS_AUTOMATIQUES):
            return
        programme = self._programme_de(entite, c["famille"])
        if programme and cible["mode"] != "arret":
            # Son propre programme commande (le Timer d'un poele) : chaque ordre serait defait
            # dans la minute (30/10). Rien ne part ; son extinction relance le calcul
            # (`_sur_etat`). L'Arret passe : c'est la fenetre ouverte, ou l'Ete, qui l'eteint.
            if self._notes.get(cle) != ("programme", programme):
                self._notes[cle] = ("programme", programme)
                await self.regles.noter(MODULE, voulu["source"], "retenu", cibles=[entite], n=0,
                                        motif=self._motif({**c, "entite": entite}, voulu, maintenant),
                                        detail="son programme commande")
            return
        unite = unite_temperature(self.hass)
        if deja(c["famille"], cible, etat, attrs, c["temperatures"], unite, self._decalage(c)):
            self._notes.pop(cle, None)
            self._defaits.pop(cle, None)
            return
        ordre = self._ordres.get(cle)
        if (ordre is not None and ordre["cible"] == cible
                and (maintenant - ordre["ts"]).total_seconds() < STABILISATION):
            return                                  # parti, l'appareil n'a pas encore repondu
        appels = commande(c["famille"], cible, etat, attrs, c["temperatures"], unite, self._decalage(c))
        if not appels:
            return
        await self._commander(cle, c, entite, cible, voulu, appels, maintenant, raison, relance)

    def _quoi(self, cible: dict[str, Any]):
        """Le mot du journal : le mode, sinon la consigne d'une reprise a la main."""
        if cible.get("mode") in MOTS:
            return MOTS[cible["mode"]]
        return ("{t} °C", {"t": "%g" % cible["temperature"]})

    def _motif(self, c: dict[str, Any], voulu: dict[str, Any], maintenant: datetime):
        """Pourquoi : « planning 06:30 », la maison, les pieces dont la fenetre est ouverte."""
        source = voulu["source"]
        if source == "planning":
            jour, minute = heure_murale(maintenant, self.fuseau)
            en_cours = changement_en_cours(c["semaine"], jour, minute)
            return ("planning {heure}", {"heure": ecrire_heure(en_cours[1])}) if en_cours else "planning"
        if source == "maison":
            return MOTS_MAISON.get(self.cfg["maison"]["mode"], "")
        if source == "fenetre":
            return ", ".join(sorted(self.fenetres.get(c.get("entite"), ()))) or "fenêtre ouverte"
        return ""

    def _motif_fin(self, fin: datetime | None):
        """« jusqu'à 21:00 », ou « jusqu'à relance »."""
        if fin is None:
            return "jusqu’à relance"
        local = fin.astimezone(self.fuseau)
        return ("jusqu’à {heure}", {"heure": "%02d:%02d" % (local.hour, local.minute)})

    async def _commander(self, cle: str, c: dict[str, Any], entite: str, cible: dict[str, Any],
                         voulu: dict[str, Any], appels: list, maintenant: datetime,
                         raison: str | None, relance: bool) -> None:
        regle = voulu["source"]
        quoi = self._quoi(cible)
        motif = self._motif({**c, "entite": entite}, voulu, maintenant)
        if regle == "main":
            motif = self._motif_fin(lire_instant((self.reprises.get(cle) or {}).get("fin")))
        detail = joindre("rattrapage au redémarrage" if raison == "redemarrage" else None)
        if self._simule():
            # « Observer sans agir » (ADR 0004) : le calcul et le journal, aucun
            # ordre — et une ligne par decision, pas une par evenement.
            if self._notes.get(cle) != ("simule", regle, cible.get("mode"), cible.get("temperature")):
                self._notes[cle] = ("simule", regle, cible.get("mode"), cible.get("temperature"))
                await self.regles.noter(MODULE, regle, quoi, cibles=[entite], motif=motif, detail=detail,
                                        simule=True)
            return
        r = self.reprises.get(cle) or {}
        # La main de qui l'a demandee, quand c'est une reprise en main : comme
        # un minuteur, l'ordre est SON geste, differe (minuteurs.py).
        ctx = Context(user_id=r["par"]) if regle == "main" and r.get("par") else Context()
        self._miens.append(ctx.id)
        del self._miens[:-256]
        # L'ordre, et de quoi le redire s'il ne se confirme pas (`_async_verifier`). `envoye` : la
        # consigne partie, dans l'unite de la maison — ce que l'appareil en fait revele son pas.
        envoye = next((d.get("temperature") for _domaine, service, d in appels if service == "set_temperature"), None)
        ordre = self._ordres[cle] = {"cible": dict(cible), "ts": maintenant, "relance": relance,
                                     "regle": regle, "quoi": quoi, "motif": motif, "envoye": envoye}
        try:
            for domaine, service, donnees in appels:
                await asyncio.wait_for(
                    self.hass.services.async_call(domaine, service, {"entity_id": [entite], **donnees},
                                                  blocking=True, context=ctx),
                    DELAI_APPEL)
        except Exception:  # noqa: BLE001 — un refus, une panne, un silence : la meme suite
            _LOGGER.warning("Loggia chauffage : l'ordre pour %s n'a pas abouti", entite, exc_info=True)
            self._ordres.pop(cle, None)
            self._annuler_verification(cle)         # celle d'un ordre d'avant n'a plus d'objet
            await self.regles.noter(MODULE, regle, quoi, cibles=[entite], n=0, motif=motif,
                                    detail=joindre(detail, "nouvel échec, on attend" if relance
                                                   else "commande refusee par Home Assistant"),
                                    echec=True)
            if not relance:
                self._relancer(cle)
            return
        self._annuler_relance(cle)
        self._notes.pop(cle, None)
        await self.regles.noter(MODULE, regle, quoi, cibles=[entite], motif=motif, detail=detail)
        self._verifier_plus_tard(cle, ordre)

    # ── Un ordre refuse se retente une fois (§ 5.6) ────────────────────────
    def _relancer(self, cle: str) -> None:
        if self._arrete:
            return                                  # un moteur arrete ne retente rien
        self._annuler_relance(cle)
        from homeassistant.helpers.event import async_call_later

        @callback
        def echu(_now) -> None:
            self._relances.pop(cle, None)
            self.hass.async_create_task(self._async_relance(cle))

        self._relances[cle] = async_call_later(self.hass, RELANCE, echu)

    def _annuler_relance(self, cle: str) -> None:
        annule = self._relances.pop(cle, None)
        if annule:
            try:
                annule()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia chauffage : relance deja passee")

    async def _async_relance(self, cle: str) -> None:
        """La nouvelle tentative RECALCULE : on ne rejoue jamais un ordre ancien."""
        if self._hors_service():
            return
        try:
            async with self._verrou:
                if self._hors_service():
                    return
                c = self.cfg["chauffages"].get(cle)
                if c and c.get("planning"):
                    try:
                        await self._evaluer_un(cle, c, self.maintenant(), self._entrees_par_id(), "relance",
                                               relance=True)
                    except Exception:  # noqa: BLE001
                        _LOGGER.exception("Loggia chauffage : %s n'a pas pu etre retente", cle)
        finally:
            self._programmer()

    # ── Un ordre accepte se verifie (relecture finale du 12/10, point 1) ───
    def _verifier_plus_tard(self, cle: str, ordre: dict[str, Any]) -> None:
        """Dans 95 s, la stabilisation passee : l'appareil a-t-il pris l'ordre ? Une
        seule verification par chauffage, celle de son dernier ordre parti. « Observer
        sans agir » n'envoie rien, et donc ne verifie rien."""
        if self._hors_service():
            return
        self._annuler_verification(cle)
        from homeassistant.helpers.event import async_call_later

        @callback
        def echu(_now) -> None:
            self._verifications.pop(cle, None)
            self.hass.async_create_task(self._async_verifier(cle, ordre))

        self._verifications[cle] = async_call_later(self.hass, VERIFICATION, echu)

    def _annuler_verification(self, cle: str) -> None:
        annule = self._verifications.pop(cle, None)
        if annule:
            try:
                annule()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia chauffage : verification deja passee")

    async def _async_verifier(self, cle: str, ordre: dict[str, Any]) -> None:
        """L'ordre parti il y a 95 s est-il pris ? Oui — l'appareil l'a confirme, ou il
        est dans le mode ou a la consigne voulus — : rien, aucun ordre en double. Non :
        le journal le dit (« non confirmé », avec son motif), et l'evaluation de ce
        chauffage se relance UNE fois, par la relance des ordres refuses
        (`_async_relance`). Perdue elle aussi, la nouvelle tentative se dit « non
        confirmé · nouvel échec, on attend » : l'evenement suivant redonnera sa chance,
        comme apres un refus (§ 5.6). Remplace par un autre ordre, defait par une
        reprise en main, moteur arrete ou en observation, planning coupe : rien."""
        if self._hors_service():
            return
        relancer = False
        try:
            async with self._verrou:
                if (self._hors_service() or self._simule() or self._ordres.get(cle) is not ordre
                        or ordre.get("vu")):
                    return
                c = self.cfg["chauffages"].get(cle)
                entite = self._entite(cle, c, self._entrees_par_id()) if c and c.get("planning") else None
                if not entite:
                    return
                etat, attrs = self._attributs(entite)
                if deja(c["famille"], ordre["cible"], etat, attrs, c["temperatures"], unite_temperature(self.hass),
                        self._decalage(c)):
                    return                          # pris, sans que son echo soit passe par nous
                if c["famille"] == "thermostat":
                    pas = pas_revele(ordre.get("envoye"), attrs.get("temperature"))
                    if pas is not None:
                        self._pas[entite] = pas     # pris a SON pas, sans que son echo soit passe par nous (30/10)
                        return
                relancer = not ordre.get("relance")
                if not relancer:
                    # Perdu deux fois : ce qu'il fait a la place se DIT, jusqu'a ce qu'un ordre tienne (30/10).
                    lu = lire_appareil(c["famille"], etat, attrs, unite_temperature(self.hass), self._decalage(c))
                    self._defaits[cle] = {"mode": lu["mode"], "temperature": lu["temperature"],
                                          "depuis": self._a_l_heure_de_la_maison(self.maintenant())}
                await self.regles.noter(MODULE, ordre["regle"], ordre["quoi"], cibles=[entite], n=0,
                                        motif=ordre["motif"],
                                        detail=joindre("non confirmé", None if relancer else "nouvel échec, on attend"),
                                        echec=True)
        except Exception:  # noqa: BLE001 — une panne ne fait tomber ni le moteur ni les autres
            _LOGGER.exception("Loggia chauffage : l'ordre pour %s n'a pas pu etre verifie", cle)
            return
        if relancer:
            await self._async_relance(cle)

    # ── Le prochain changement : un seul minuteur ──────────────────────────
    def prochain_reveil(self, maintenant: datetime) -> datetime | None:
        """Le prochain instant ou quelque chose change, tous chauffages confondus :
        un changement de planning, la fin d'une reprise en main, la fin des vacances."""
        instants: list[datetime] = []
        jour, minute = heure_murale(maintenant, self.fuseau)
        for cle, c in self.cfg["chauffages"].items():
            if not c.get("planning"):
                continue
            suivant = prochain_changement(c["semaine"], jour, minute)
            if suivant is not None:
                instants.append(instant_de(suivant[0], suivant[1], maintenant, self.fuseau))
            fin = lire_instant((self.reprises.get(cle) or {}).get("fin"))
            if fin is not None:
                instants.append(fin)
        if self.cfg["maison"]["mode"] == "vacances":
            fin = lire_instant(self.cfg["maison"].get("vacances_fin"))
            if fin is not None:
                instants.append(fin)
        # Le mode absence des chauffe-eau se leve AVANT le retour (eau_chaude.py).
        leve = levee_a(self.cfg)
        if leve is not None:
            instants.append(leve)
        # Un ballon pose qu'on n'a pas pu lever (muet) : un reveil court, borne (eau_chaude.RELANCE_MAX).
        attente = getattr(self, "_eau_attente", None)
        if attente is not None and maintenant - attente < RELANCE_EAU_MAX:
            instants.append(maintenant + RELANCE_EAU)
        futurs = [i for i in instants if i > maintenant]
        return min(futurs) if futurs else None

    def _programmer(self) -> None:
        if self._hors_service():
            return                                  # un moteur arrete, ou rate, ne se reveille plus
        if self._minuteur is not None:
            self._minuteur()
            self._minuteur = None
        prochain = self.prochain_reveil(self.maintenant())
        if prochain is None:
            return
        from homeassistant.helpers.event import async_track_point_in_time

        self._minuteur = async_track_point_in_time(self.hass, self._sur_reveil, prochain)

    @callback
    def _sur_reveil(self, _now) -> None:
        if self._arrete:
            return
        self._minuteur = None
        self.hass.async_create_task(self.async_evaluer(raison="heure"))

    async def _fin_des_vacances(self, maintenant: datetime) -> None:
        """La date de fin des Vacances est passee : la maison revient au Planning."""
        maison = self.cfg["maison"]
        fin = lire_instant(maison.get("vacances_fin"))
        if maison["mode"] != "vacances" or fin is None or fin > maintenant:
            return
        await self._ecrire_maison("planning", None, maintenant)
        await self.regles.noter(MODULE, "maison", MOTS_MAISON["planning"], n=0, motif="fin des vacances")

    # ── L'eau chaude des Vacances (chantier G3, E2 ; eau_chaude.py) ─────────
    async def _eau_chaude(self, maintenant: datetime) -> None:
        """Option cochee et maison en Vacances : chaque chauffe-eau qui sait le
        faire passe en mode absence, et le quitte `AVANCE_RETOUR` avant la fin.
        Loggia ne leve que ce qu'il a pose. « Observer sans agir » : rien ne part."""
        poses = set(getattr(self, "_eau_poses", None) or ())
        laisses = set(getattr(self, "_eau_laisses", None) or ())
        if not poses and not laisses and not option_active(self.cfg):
            self._eau_attente = None
            return
        etats = getattr(self.hass, "states", None)
        ids = etats.async_entity_ids("water_heater") if etats is not None and hasattr(etats, "async_entity_ids") else []
        lus: dict[str, Any] = {}
        for haid in ids:
            st = etats.get(haid)
            if st is None or str(st.state).lower() in MUETS or not sait_absence(getattr(st, "attributes", None)):
                lus[haid] = None
                continue
            away = (st.attributes or {}).get("away_mode")
            lus[haid] = away if away in ("on", "off") else None
        voulu = absence_voulue(self.cfg, maintenant)
        vus_avant = set(getattr(self, "_eau_vus", None) or ())
        ordres, tenus, garde, vus = ordres_absence(lus, voulu, poses, laisses, vus_avant)
        if self._simule():
            return                                  # Observer sans agir (ADR 0004)
        essais = getattr(self, "_eau_essais", None)
        if essais is None:
            essais = self._eau_essais = {}
        for haid, poser in ordres:
            ctx = Context()
            self._miens.append(ctx.id)
            del self._miens[:-256]
            try:
                await asyncio.wait_for(self.hass.services.async_call(
                    "water_heater", "set_away_mode", {"entity_id": [haid], "away_mode": poser},
                    blocking=True, context=ctx), DELAI_APPEL)
            except Exception:  # noqa: BLE001 — refus ou silence : on retentera au prochain calcul
                if poser:
                    _LOGGER.warning("Loggia chauffage : le mode absence de %s n'a pas pu etre pose", haid, exc_info=True)
                    tenus.discard(haid)
                    continue
                essais[haid] = essais.get(haid, 0) + 1
                if essais[haid] < ESSAIS_LEVEE:
                    tenus.add(haid)                 # retente au reveil suivant (5 min)
                    _LOGGER.debug("Loggia chauffage : levee du mode absence de %s refusee (%d)", haid, essais[haid])
                else:
                    # Trois refus : Loggia cesse, et le dit. Le ballon reste en absence : a lever a la main.
                    _LOGGER.warning("Loggia chauffage : le mode absence de %s n'a pas pu etre leve apres %d essais ; "
                                    "il reste en absence, a lever a la main", haid, essais[haid], exc_info=True)
                    essais.pop(haid, None)
        for haid in [h for h in essais if h not in tenus]:
            essais.pop(haid, None)
        # Encore pose alors que l'absence n'est plus voulue (un ballon muet) : le reveil court reviendra le lever.
        if tenus and not voulu:
            self._eau_attente = getattr(self, "_eau_attente", None) or maintenant
        else:
            self._eau_attente = None
        if tenus != poses or garde != laisses or vus != vus_avant:
            self._eau_poses = tenus
            self._eau_laisses = garde
            self._eau_vus = vus
            await self._sauver_eau()

    def _store_eau(self):
        if getattr(self, "_depot_eau", None) is None:
            from homeassistant.helpers.storage import Store

            self._depot_eau = Store(self.hass, VERSION_ETAT, CLE_EAU)
        return self._depot_eau

    async def _lire_eau(self) -> None:
        try:
            brut = await self._store_eau().async_load()
        except Exception:  # noqa: BLE001 — illisible : rien de pose, rien a lever
            _LOGGER.warning("Loggia chauffage : l'etat de l'eau chaude est illisible", exc_info=True)
            brut = None
        def lue(cle: str) -> set[str]:
            liste = brut.get(cle) if isinstance(brut, dict) else None
            return {h for h in liste if isinstance(h, str)} if isinstance(liste, list) else set()

        self._eau_poses = lue("poses")
        self._eau_laisses = lue("laisses")
        self._eau_vus = lue("vus")

    async def _sauver_eau(self) -> None:
        try:
            await self._store_eau().async_save({"poses": sorted(getattr(self, "_eau_poses", None) or ()),
                                                "laisses": sorted(getattr(self, "_eau_laisses", None) or ()),
                                                "vus": sorted(getattr(self, "_eau_vus", None) or ())})
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Loggia chauffage : l'etat de l'eau chaude n'a pas ete enregistre")

    async def _ecrire_maison(self, mode: Any, fin: Any, maintenant: datetime,
                             par_presence: bool = False) -> None:
        """Le mode de la maison, ecrit d'un seul tenant sous le verrou du magasin."""
        def changer(brut: Any) -> dict[str, Any]:
            cfg = lire_config(brut)
            poser_maison(cfg, mode, fin, maintenant, par_presence)
            return cfg

        self.cfg = await self.store.async_modifier_shared(CLE, changer)

    # ── La reprise en main (§ 5.4) ─────────────────────────────────────────
    # Un moteur arrete (`async_arreter`) ne prend plus de demande : rien ne s'enregistre,
    # rien ne s'ecrit, rien ne se commande. Apres un rechargement, l'ancien moteur et le
    # nouveau lisent le MEME fichier des reprises.
    def _fin_par_defaut(self, c: dict[str, Any], maintenant: datetime) -> datetime:
        """Le prochain changement du planning (D3). Un planning qui ne change
        jamais de mode n'en a pas : la reprise dure alors 24 h, pas davantage."""
        jour, minute = heure_murale(maintenant, self.fuseau)
        suivant = prochain_changement(c["semaine"], jour, minute)
        if suivant is None:
            return maintenant + DUREE_SANS_CHANGEMENT
        return instant_de(suivant[0], suivant[1], maintenant, self.fuseau)

    async def _async_geste(self, cle: str, entite: str, lu: dict[str, Any], par: str | None) -> None:
        """Un geste fait ailleurs — la telecommande, l'application du fabricant,
        la carte de Home Assistant : une reprise en main, jusqu'au prochain
        changement du planning."""
        if self._hors_service():
            return                                  # la tache attendait son tour : le moteur est arrete, ou rate
        c = self.cfg["chauffages"].get(cle)
        if c is None:
            return
        maintenant = self.maintenant()
        fin = self._fin_par_defaut(c, maintenant)
        # Une consigne hors des bornes de Loggia (5 a 30 °C) est respectee, jamais
        # renvoyee : ramenee au minimum de l'appareil, elle repartait vers lui (25/10).
        t = lu["temperature"]
        t = t if isinstance(t, (int, float)) and TEMPERATURE_MIN <= t <= TEMPERATURE_MAX else None
        self.reprises[cle] = nouvelle_reprise(lu["mode"], t, fin, maintenant, par,
                                              programme=lu.get("programme") is True)
        self._ordres.pop(cle, None)                 # la main a pris la suite : notre dernier ordre est perime
        self._defaits.pop(cle, None)
        self._annuler_verification(cle)
        await self._sauver_reprises()
        await self.regles.noter(MODULE, "main", "reprise en main", cibles=[entite], n=0,
                                motif=self._motif_fin(fin), detail=GESTE_AILLEURS)
        await self.async_evaluer([cle], raison="geste")

    async def async_reprendre_la_main(self, cle: str, *, mode: Any = None, temperature: Any = None,
                                      fin: Any = "prochain", par: str | None = None, nom: str = "",
                                      controle: Any = None) -> None:
        """Une reprise en main demandee a Loggia (§ 8.2) : un mode, ou une
        consigne en °C pour un thermostat, jusqu'au prochain changement — ou
        1 h, 2 h, 4 h, ou jusqu'a relance. Le compte doit pouvoir PILOTER le
        chauffage : c'est le moteur qui commande, Home Assistant ne verifiera
        rien (comme les minuteurs)."""
        if self._hors_service():
            return                                  # arrete, ou rate au demarrage : la demande est ignoree
        c = self.cfg["chauffages"].get(cle)
        if c is None:
            raise RefusNomme("chauffage_inconnu", "chauffage inconnu", cle)
        if not c.get("planning"):
            raise RefusNomme("chauffage_sans_planning", "planning eteint pour ce chauffage", cle)
        entite = self._entite(cle, c, self._entrees_par_id())
        if not entite:
            raise RefusNomme("chauffage_inconnu", "chauffage introuvable", cle)
        if controle is not None and not controle(entite):
            raise PermissionError("pas le droit de piloter %s" % entite)
        _, attrs = self._attributs(entite)
        if mode is None and temperature is None:
            raise ValueError("un mode ou une temperature")
        if mode is not None and mode not in modes_permis(c["famille"], attrs):
            raise RefusNomme("chauffage_mode_inconnu", "mode %s inconnu de ce chauffage" % (mode,), "mode")
        if temperature is not None:
            if c["famille"] != "thermostat":
                raise ValueError("temperature : pour un thermostat seulement")
            if not TEMPERATURE_MIN <= temperature <= TEMPERATURE_MAX:
                raise RefusNomme("chauffage_temperature_hors_bornes", "temperature hors bornes (5 a 30 °C)",
                                 "temperature")
        maintenant = self.maintenant()
        if fin == "prochain":
            instant = self._fin_par_defaut(c, maintenant)
        elif fin == "relance":
            instant = None
        elif isinstance(fin, int) and not isinstance(fin, bool) and fin in DUREES_MAIN:
            instant = maintenant + timedelta(minutes=fin)
        else:
            raise ValueError("fin : prochain, relance, 60, 120 ou 240")
        self.reprises[cle] = nouvelle_reprise(mode, temperature, instant, maintenant, par)
        await self._sauver_reprises()
        await self.regles.noter(MODULE, "main", "reprise en main", cibles=[entite], n=0,
                                motif=self._motif_fin(instant), detail=nom or "")
        await self.async_evaluer([cle], raison="main")

    async def async_rendre_au_planning(self, cle: str, controle: Any = None) -> None:
        """« Reprendre le planning » : la reprise en main tombe, le planning s'applique."""
        if self._hors_service():
            return                                  # arrete, ou rate au demarrage : la demande est ignoree
        c = self.cfg["chauffages"].get(cle)
        if c is None:
            raise RefusNomme("chauffage_inconnu", "chauffage inconnu", cle)
        entite = self._entite(cle, c, self._entrees_par_id())
        if controle is not None and entite and not controle(entite):
            raise PermissionError("pas le droit de piloter %s" % entite)
        if self.reprises.pop(cle, None) is not None:
            await self._sauver_reprises()
            await self.regles.noter(MODULE, "main", "reprendre le planning", cibles=[entite] if entite else [],
                                    n=0)
        await self.async_evaluer([cle], raison="main")

    # ── Les faits des autres regles, et le mode de la maison (§ 6, § 8.3) ──
    # Un moteur arrete (`async_arreter`) ne prend plus de demande de la maison : ni la presence, ni le mode, ni
    # la configuration n'ecrivent, ne journalisent ni ne commandent. Apres un rechargement, l'ancien moteur et
    # le nouveau lisent le MEME magasin. Un fait de fenetre, lui, n'est que de la memoire : l'evaluation qui le
    # suit (`async_evaluer`) a deja ses gardes.
    async def async_fenetre(self, entite: str, piece: str, ouverte: bool) -> None:
        """La regle des fenetres dit qu'une fenetre de `piece` est ouverte (son
        delai passe) ou refermee. Le moteur decide, chauffage par chauffage."""
        pieces = self.fenetres.setdefault(entite, set())
        avant = bool(pieces)
        if ouverte:
            pieces.add(piece)
        else:
            pieces.discard(piece)
        if not pieces:
            self.fenetres.pop(entite, None)
        if bool(pieces) != avant and entite in self._pilotes:
            await self.async_evaluer([self._pilotes[entite]], raison="fenetre")

    def fenetre_ouverte(self, entite: str) -> bool:
        return bool(self.fenetres.get(entite))

    def _regle_fenetres(self) -> Any:
        """La regle des fenetres, cherchee au moment de servir — l'inverse de son
        `_chef()` : un rechargement de l'integration la rebatit."""
        data = getattr(self.hass, "data", None)
        return (data.get(DOMAIN) or {}).get("fenetres") if isinstance(data, dict) else None

    def _veille_des_fenetres(self, regle: Any, connus: dict[str, dict[str, Any]]) -> dict[str, bool] | None:
        """Ce que la regle des fenetres surveille, et ce qu'elle voit MAINTENANT,
        pour tout un etat : {chauffage: un ouvrant de ses pieces suivies est-il
        ouvert ?} (`LoggiaFenetres.veille`). UNE question par etat, avec la table
        {interrupteur: select} faite d'un seul passage sur les chauffages deja
        reconnus (`connus`) : posee chauffage par chauffage, elle refaisait
        `candidats` pour chaque interrupteur de chaque piece (relecture du 12/10).
        None : pas de regle, ou une regle en panne — elle ne promet rien."""
        if regle is None:
            return None
        try:
            return dict(regle.veille(select_par_interrupteur(connus, self._entrees())))
        except Exception:  # noqa: BLE001 — une panne de la regle ne fait pas tomber l'etat
            _LOGGER.debug("Loggia chauffage : la regle des fenetres n'a pas repondu", exc_info=True)
            return None

    def _fenetres_observe(self, regle: Any) -> bool:
        """La regle des fenetres est-elle en « Observer sans agir » ? Elle a son
        propre drapeau (`simulation`, fenetres.py), que le socle respecte
        (`regles.agir`) : hors planning, c'est elle qui coupe — et en observation
        elle ne coupe rien ; l'ecran ne promettra pas « A l'ouverture : Arret »
        (partie D). Absente, ou en panne : faux."""
        if regle is None:
            return False
        try:
            return bool(regle.observe())
        except Exception:  # noqa: BLE001 — une panne de la regle ne fait pas tomber l'etat
            return False

    def _fenetre_dite(self, entite: str | None, veille: dict[str, bool] | None) -> bool | None:
        """La fenetre telle que l'ecran la dit (plan 2, tache 10 bis B) : ouverte
        quand un fait l'a dit — le moteur agit dessus —, fermee quand la regle
        surveille ce chauffage (`veille`), None sinon. Une piece que la regle ne
        suit pas n'a pas de protection a promettre ; une regle en panne n'en
        promet aucune."""
        if not entite:
            return None
        if self.fenetre_ouverte(entite):
            return True
        return False if veille is not None and entite in veille else None

    async def async_presence(self, vide: bool, simuler: bool = False) -> bool:
        """La presence dit que la maison est vide, ou habitee. Au depart, la
        maison passe en Absence — seulement si elle etait en Planning ; au
        retour, en Planning — seulement si elle etait en Absence. Vacances et
        Ete ne se touchent qu'a la main (§ 6). C'est la presence qui AGIT sur
        le mode : en « Observer sans agir » (le SIEN), le journal dit ce
        qu'elle aurait fait. Rend vrai si le mode a change."""
        if self._arrete:
            return False                            # arrete : la demande est ignoree
        if not any(c.get("planning") for c in self.cfg["chauffages"].values()):
            return False
        actuel = self.cfg["maison"]["mode"]
        if vide and actuel == "planning":
            nouveau = "absence"
        elif not vide and actuel == "absence":
            nouveau = "planning"
        else:
            return False
        motif = "maison vide" if vide else "retour"
        if simuler:
            await self.regles.noter(MODULE, "maison", MOTS_MAISON[nouveau], n=0, motif=motif, simule=True)
            return False
        await self._ecrire_maison(nouveau, None, self.maintenant(), par_presence=vide)
        await self.regles.noter(MODULE, "maison", MOTS_MAISON[nouveau], n=0, motif=motif)
        await self.async_evaluer(raison="maison")
        return True

    def absence_par_presence(self) -> bool:
        """La maison est-elle en Absence parce que la PRESENCE l'y a mise ? Apres
        un redemarrage, la presence a oublie son depart (`dehors` est en memoire) :
        elle demande ceci pour lever l'Absence d'une maison deja rentree, sans
        toucher a celle qu'une personne a posee (audit du 19/10)."""
        maison = self.cfg.get("maison") or {}
        return maison.get("mode") == "absence" and maison.get("par_presence") is True

    async def async_maison(self, mode: Any, fin: Any = None, *, admin: bool = False, nom: str = "") -> None:
        """Le mode de la maison, demande a Loggia (§ 8.2). Planning, Absence,
        Vacances : tout le monde. Ete — y entrer comme en sortir — : les
        administrateurs (§ 8.3), et le refus nomme sa cle. La fin des
        Vacances : une DATE seule (`_minuit_de_la_maison`), ou un instant ISO
        avec son decalage, comme avant."""
        if self._arrete:
            return                                  # arrete : la demande est ignoree
        if not admin and "ete" in (mode, self.cfg["maison"]["mode"]):
            raise MaisonReserveeError("reglages reserves aux administrateurs Home Assistant : maison.ete")
        avant = self.cfg["maison"]["mode"]
        await self._ecrire_maison(mode, self._minuit_de_la_maison(fin), self.maintenant())
        await self.regles.noter(MODULE, "maison", MOTS_MAISON[mode], n=0, detail=nom or "")
        if mode in ("vacances", "ete") and mode != avant and self.reprises:
            # SON CHOIX (19/10) : partir en Vacances ou passer en Ete efface les reprises
            # en cours — parti avec Confort « jusqu'a relance », la maison chauffait tout
            # le sejour. Une reprise faite PENDANT le sejour compte encore : changer la
            # date de retour ne l'efface pas.
            for cle in sorted(self.reprises):
                entite = (self.cfg["chauffages"].get(cle) or {}).get("entite")
                await self.regles.noter(MODULE, "main", "reprendre le planning", cibles=[entite] if entite else [],
                                        n=0, motif=MOTS_MAISON[mode])
            self.reprises.clear()
            await self._sauver_reprises()
        await self.async_evaluer(raison="maison")

    def _minuit_de_la_maison(self, fin: Any) -> Any:
        """La fin des Vacances que l'ecran envoie : le JOUR choisi, seul
        (« 2026-10-20 », la valeur de son champ date), devient minuit de ce
        jour a l'heure de la MAISON — l'ecran, peut-etre a l'etranger, ne
        connait pas son fuseau : a minuit de Paris, un navigateur a Athenes
        envoyait 23:00 la veille, et chaque validation reculait d'un jour (plan
        2, relecture des taches 11 et 12). Le jour du retour, la maison
        repasse au Planning des minuit. Tout le reste passe tel quel a
        `poser_maison` : un instant ISO avec son decalage, accepte comme avant,
        ou ce qu'il refuse — un jour qui n'existe pas, une date passee."""
        if not isinstance(fin, str) or not DATE_SEULE.match(fin.strip()):
            return fin
        try:
            jour = datetime.strptime(fin.strip(), "%Y-%m-%d")
        except ValueError:
            return fin
        return jour.replace(tzinfo=self.fuseau).isoformat()

    # ── Ce que l'interface lit et ecrit ────────────────────────────────────
    async def async_config(self) -> dict[str, Any]:
        return lire_config(await self.store.async_get_shared(CLE, None))

    def _simule(self) -> bool:
        """Observer sans agir : le moteur calcule et note, rien ne part."""
        return bool((self.cfg.get("simulation") or {}).get("actif"))

    def _repartir_de_zero(self) -> None:
        """Du simule au reel, ou l'inverse : on repart de ce que la maison EST
        (ADR 0004). Les fenetres restent — ce sont des faits. Les reprises en
        main tombent : prises pendant l'observation, elles venaient le plus
        souvent de l'ancien systeme, qui commandait encore les radiateurs."""
        self._ordres.clear()
        self._notes.clear()
        self.reprises.clear()
        for cle in list(self._relances):
            self._annuler_relance(cle)
        for cle in list(self._verifications):
            self._annuler_verification(cle)

    async def async_enregistrer(self, patch: dict[str, Any]) -> dict[str, Any]:
        """`loggia/chauffage/config` (administrateurs) — et le rechargement apres
        un import, avec un patch vide. D'un seul tenant, sous le verrou du
        magasin ; un refus n'ecrit rien."""
        if self._arrete:
            return self.cfg                         # arrete : la demande est ignoree
        simulait = self._simule()
        connus = self.candidats()
        # Ce que le moteur tient coupe pour une fenetre ouverte : s'il le lache, la
        # regle des fenetres le rendra a la fermeture (audit du 19/10).
        regle = self._regle_fenetres()
        coupures = self._coupures_fenetre() if regle is not None and hasattr(regle, "adopter") else {}
        # Allumer le planning d'un appareil dont le programme tourne : deux chefs. Refuse,
        # en nommant ce programme ; un planning deja allume reste allume (il le dit).
        demandes = (patch or {}).get("chauffages") if isinstance(patch, dict) else None
        for cle, c in (demandes.items() if isinstance(demandes, dict) else ()):
            if not isinstance(c, dict) or c.get("planning") is not True:
                continue
            if (self.cfg["chauffages"].get(cle) or {}).get("planning"):
                continue
            programme = self._programme_allume(connus.get(cle))
            if programme:
                raise RefusNomme("chauffage_programme_appareil",
                                 "le programme de l'appareil est allume : %s" % programme, programme)
            concurrents = self._concurrents((connus.get(cle) or {}).get("entite"))
            if concurrents:
                premier = concurrents[0]
                raise RefusNomme("chauffage_programme_concurrent",
                                 "un autre programme le commande : %s" % premier["nom"],
                                 premier["entite"] or premier["type"])

        def changer(brut: Any) -> dict[str, Any]:
            cfg = lire_config(brut)
            poser_patch(cfg, patch or {}, connus)
            return cfg

        self.cfg = await self.store.async_modifier_shared(CLE, changer)
        bascule = self._simule() != simulait
        if bascule:
            self._repartir_de_zero()
        # Un planning coupe emporte sa reprise en main : elle n'a plus d'objet.
        orphelines = [cle for cle in self.reprises
                      if not (self.cfg["chauffages"].get(cle) or {}).get("planning")]
        for cle in orphelines:
            self.reprises.pop(cle, None)
        if bascule or orphelines:
            await self._sauver_reprises()
        self._reabonner()
        for entite, (pieces, rendre, laisse) in coupures.items():
            if not self.pilote(entite):
                for piece in pieces:
                    regle.adopter(piece, entite, rendre, laisse)
        await self.async_evaluer(raison="reglage")
        return self.cfg

    async def async_historique(self, cle: str, jours: int, user: Any = None) -> dict[str, Any]:
        """`loggia/chauffage/historique` : l'historique d'un chauffage sur `jours`
        jours, RESUME (`historique_resume`) — la fiche lisait sept jours d'un
        `climate` avec tous ses attributs, 3 a 14 Mo pour un poele (audit du
        19/10). Un compte restreint ne lit que ce qu'il a le droit de lire."""
        from .discovery import _lecture_autorisee

        c = self.cfg["chauffages"].get(cle)
        entite = (self.candidats().get(cle) or {}).get("entite") or self._entite(cle, c, self._entrees_par_id())
        if not entite:
            raise RefusNomme("chauffage_inconnu", "chauffage inconnu", cle)
        autorise = _lecture_autorisee(user)
        if autorise is not None and not autorise(entite):
            raise PermissionError("pas le droit de lire %s" % entite)
        fin = self.maintenant()
        from homeassistant.components.recorder import get_instance, history

        lus = await get_instance(self.hass).async_add_executor_job(partial(
            history.state_changes_during_period, self.hass, fin - timedelta(days=jours), fin, entite,
            no_attributes=False, include_start_time_state=True))

        def instant(e: Any) -> Any:
            x = getattr(e, "last_updated", None) or getattr(e, "last_changed", None)
            return x.isoformat() if isinstance(x, datetime) else x

        points = [(getattr(e, "state", None), instant(e), dict(getattr(e, "attributes", None) or {}))
                  for e in (lus or {}).get(entite, [])]
        return {"chauffage": cle, "entite": entite, "points": historique_resume(points)}

    async def async_etat(self, user: Any = None) -> dict[str, Any]:
        """L'etat calcule de chaque chauffage, pour l'ecran (§ 8.2). Un compte
        restreint ne voit que ce qu'il a le droit de lire. `minute` : maintenant
        a l'horloge du planning, [jour, minute] — l'ecran place l'instant sur la
        barre du jour sans connaitre ni le fuseau de la maison ni l'heure rejouee.
        Les instants (`maintenant`, les fins, le debut d'une reprise, la fin des
        vacances) s'ecrivent a l'heure de la maison (`_a_l_heure_de_la_maison`).

        La regle des fenetres est interrogee UNE fois pour tout l'etat (relecture
        du 12/10) : ce qu'elle surveille et ce qu'elle voit (`_veille_des_fenetres`),
        et si elle observe sans agir (`fenetres_observe`).

        Un chauffage introuvable n'a d'autre geste que « Supprimer son planning »,
        reserve aux administrateurs (spec § 10) : il ne se publie qu'a eux. Et le
        journal d'un compte restreint ne porte que ses chauffages (`journal_pour`,
        relecture finale du 12/10, point 4)."""
        from .discovery import _lecture_autorisee

        autorise = _lecture_autorisee(user)
        admin = user is None or bool(getattr(user, "is_admin", False))
        maintenant = self.maintenant()
        connus = self.candidats()
        registre = self._entrees_par_id()
        regle = self._regle_fenetres()
        veille = self._veille_des_fenetres(regle, connus)
        liste = []
        for cle in dict.fromkeys(list(self.cfg["chauffages"]) + list(connus)):
            c = self.cfg["chauffages"].get(cle)
            info = connus.get(cle)
            entite = info["entite"] if info else self._entite(cle, c, registre)
            if not entite and not admin:
                continue                            # introuvable : aux administrateurs seulement
            if autorise is not None and entite and not autorise(entite):
                continue
            liste.append(self._etat_un(cle, c, info, entite, maintenant, veille))
        maison = dict(self.cfg["maison"])
        maison["vacances_fin"] = self._a_l_heure_de_la_maison(maison.get("vacances_fin"))
        return {"chauffages": liste, "maison": maison, "simulation": self._simule(),
                # L'option de l'eau chaude des Vacances (chantier G3, E2) : la popup du chauffe-eau la lit.
                "eau_chaude": dict(self.cfg.get("eau_chaude") or {"absence": False}),
                # La regle des fenetres en « Observer sans agir » : hors planning, c'est elle
                # qui coupe — et elle ne coupe rien. L'ecran s'en sert (partie D).
                "fenetres_observe": self._fenetres_observe(regle),
                "maintenant": self._a_l_heure_de_la_maison(maintenant),
                "minute": list(heure_murale(maintenant, self.fuseau)),
                # Un planning tourne-t-il ? Compte sur la configuration, AVANT le filtre des
                # droits : un compte qui ne voit aucun chauffage au planning ne doit pas lire
                # « aucun planning allume » quand la presence change bien la maison.
                "plannings_allumes": any(c.get("planning") for c in self.cfg["chauffages"].values()),
                # Vrai demarre, faux rate (`regles.demarrer`) — le moteur ne commande alors
                # plus rien jusqu'au prochain demarrage —, None tant qu'il demarre.
                "demarrage": getattr(self, "demarrage", None),
                "journal": journal_pour(await self.regles.journal(limite=40, module=MODULE), autorise)}

    def _a_l_heure_de_la_maison(self, instant: Any) -> Any:
        """Un instant pour l'ecran, ecrit dans le fuseau de la maison : l'ecran lit
        l'heure dans la partie MURALE de la chaine, sans conversion (plan 2, choix
        5) — en UTC, « jusqu'a 08:30 » se lirait « 06:30 ». Une chaine se relit
        (`lire_instant`) ; illisible, elle passe telle quelle, comme None. Le
        stockage, lui, garde ce qu'il a."""
        lu = lire_instant(instant) if isinstance(instant, str) else instant
        return lu.astimezone(self.fuseau).isoformat() if isinstance(lu, datetime) else instant

    def _etat_un(self, cle: str, c: dict | None, info: dict | None, entite: str | None,
                 maintenant: datetime, veille: dict[str, bool] | None = None) -> dict[str, Any]:
        """Un chauffage, pour l'ecran : sa famille, ses modes, ce qu'il doit
        faire et pourquoi, jusqu'a quand, et ce qui l'en empeche. Au planning
        allume, sa journee (`jour`), ou la fiche lit ce que « Reprendre le
        planning » remettra ; None sinon. Un fil pilote : les options de son module.
        `veille` : ce que la regle des fenetres surveille et voit, demande une
        fois pour tout l'etat (`_veille_des_fenetres`) ; None sans regle."""
        etat, attrs = self._attributs(entite)
        # Sans etat — introuvable, ou au registre sans etat —, ses modes ne seraient
        # qu'une supposition tiree de sa famille, et le moteur ne lui envoie rien
        # (`_evaluer_un`) : ni mode applique, ni mode d'ouverture (relecture du 12/10).
        sans_etat = etat is None
        fam = (info or {}).get("famille") or (c or {}).get("famille")
        avertissements = []
        if entite is None:
            avertissements.append("introuvable")
        elif etat is None or str(etat).lower() in MUETS:
            avertissements.append("injoignable")
        if self._module_coupe(info):
            avertissements.append("module_coupe")
        programme = self._programme_allume(info)
        if programme:
            avertissements.append("programme_appareil")
        concurrents = self._concurrents(entite)
        if concurrents:
            avertissements.append("programme_concurrent")
        if refroidit(fam, etat):
            avertissements.append("refroidit")
        commande_par = self._commandes().get(entite) if entite else None
        if commande_par is not None:
            avertissements.append("commande_par")
        if fam == "thermostat" and entite:
            plateforme = next((getattr(e, "platform", None) for e in self._entrees()
                               if getattr(e, "entity_id", None) == entite), None)
            if puissance_fixe(plateforme, attrs):
                avertissements.append("puissance_fixe")
        # Son dernier ordre perdu deux fois (30/10) ; son programme allume le dit deja mieux.
        defait = self._defaits.get(cle) if (c or {}).get("planning") and not programme else None
        if defait is not None:
            avertissements.append("ordre_defait")
        # Un module fil pilote se nomme comme son APPAREIL (« Radiateur Chambre ») :
        # son `select` s'affiche sous ce nom suivi de celui de l'exposition
        # (« Radiateur Chambre Pilot wire mode » sous zigbee2mqtt). L'ecran nomme
        # sa zone de meme (resolve.js). Un thermostat garde son nom affiche.
        nom = self._nom_appareil((info or {}).get("appareil")) if fam == "fil_pilote" else None
        # Introuvable — renomme ou retire —, il garde un nom a lui : l'entite que retient sa
        # configuration. Deux chauffages perdus ne s'appellent plus « Chauffage » tous les deux.
        nom = nom or attrs.get("friendly_name") or entite or (c or {}).get("entite")
        reglage_fenetre = (c or {}).get("fenetre", "arret")
        # Les modes tels que le moteur les compte quand il commande : ceux de la famille
        # configuree (`_evaluer_un`), sinon ceux de la famille reconnue.
        permis = modes_permis(c["famille"], attrs) if c is not None and c.get("famille") else (
            modes_permis(fam, attrs) if fam else [])
        sortie: dict[str, Any] = {
            "cle": cle, "entite": entite, "nom": nom, "famille": fam,
            "planning": bool((c or {}).get("planning")), "modes": modes_permis(fam, attrs) if fam else [],
            # `mode` : le mode VOULU, que la logique lit ; `applique` : celui que le moteur
            # envoie vraiment — l'Arret d'un thermostat sans `off` est son Hors-gel ; None
            # sans etat.
            "mode": None, "applique": None, "source": None, "fin": None, "puis": None, "reprise": None,
            # `fenetre_ouverte` : le FAIT — la regle a dit l'ouverture, son delai passe :
            # elle coupe, ou le moteur coupe ; faux la ou elle surveille, None ailleurs.
            # `ouvrant_ouvert` : l'ouvrant MAINTENANT, avant le delai comme apres un
            # redemarrage ; None la ou la regle ne surveille pas. `fenetre_mode` : ce
            # qu'une ouverture appliquerait a CET appareil, None pour « ne rien faire »
            # et sans etat.
            "fenetre": reglage_fenetre, "fenetre_ouverte": self._fenetre_dite(entite, veille),
            "ouvrant_ouvert": veille.get(entite) if veille is not None and entite else None,
            "fenetre_mode": (None if sans_etat or reglage_fenetre == "rien"
                             else mode_applicable(reglage_fenetre, permis)),
            "semaine": (c or {}).get("semaine"), "temperatures": (c or {}).get("temperatures"),
            "avertissements": avertissements,
            # Le `switch` du programme de l'appareil, allume : la fiche le nomme.
            "programme": programme,
            # Les programmes d'ailleurs qui le commandent (Velair, Scheduler, une
            # automatisation) : la fiche les nomme (D5 ; audit du 19/10).
            "concurrents": concurrents,
            # Le VTherm ou le Better Thermostat qui le commande : la fiche le nomme.
            "commande_par": commande_par,
            # Le decalage de son capteur (°C, 30/10) : l'ecran montre et regle la consigne de la PIECE.
            "decalage": self._decalage(c),
            # Ce qu'il fait au lieu de son dernier ordre, perdu deux fois (30/10) : {"mode", "temperature" (°C), "depuis"}.
            "defait": defait,
            # Planning eteint, la carte commande le module elle-meme : avec l'option telle
            # qu'il l'ecrit, `select_option` refusant toute autre graphie.
            "options": options_du_module(attrs.get("options")) if fam == "fil_pilote" and entite else None,
            "jour": None}
        if c is None:
            return sortie
        voulu = self._voulu(cle, c, entite, maintenant)
        r = self.reprises.get(cle)
        fin = None
        if voulu["source"] == "main":
            fin = (r or {}).get("fin")
        elif voulu["fin"] is not None:
            fin = instant_de(voulu["fin"][0], voulu["fin"][1], maintenant, self.fuseau)
        # La reprise telle qu'elle se garde, ses deux instants a l'heure de la maison.
        reprise = None if r is None else {k: self._a_l_heure_de_la_maison(v) if k in ("fin", "depuis") else v
                                          for k, v in r.items()}
        sortie.update({"mode": voulu["mode"],
                       "applique": None if sans_etat else mode_applicable(voulu["mode"], permis),
                       "source": voulu["source"], "fin": self._a_l_heure_de_la_maison(fin),
                       "puis": voulu["puis"], "reprise": reprise})
        if c.get("planning"):
            jour, _ = heure_murale(maintenant, self.fuseau)
            sortie["jour"] = self._journee(c["semaine"], jour)
        return sortie

    # La journee du planning (plan 2, choix 4) : le serveur la donne deja calculee —
    # l'ecran n'embarque pas ce calcul dans son demarrage, et le changement d'heure
    # comme le fuseau de la maison restent ici. La carte n'a plus de barre depuis sa
    # maquette du 11/10 (cartes 1a) ; la fiche y lit le mode que le planning a
    # maintenant (« Reprendre le planning · Eco »).
    def _journee(self, semaine: Any, jour: int) -> list[dict[str, Any]]:
        """Les bandes d'aujourd'hui, [{"de", "a", "mode"}], contigues de 0 a 1440
        en minutes murales. Bornes : minuit et chaque changement du jour ; le mode
        d'une bande est celui de son debut, le mode de la maison applique (Ete,
        Vacances, Absence), sans reprise ni fenetre. Deux bandes voisines du meme
        mode n'en font qu'une. Une semaine sans aucun changement : []."""
        if not changements(semaine):
            return []
        liste = semaine.get(JOURS[jour])
        bornes = {0}
        for changement in liste if isinstance(liste, list) else ():
            minute = lire_heure(changement.get("h")) if isinstance(changement, dict) else None
            if minute is not None:
                bornes.add(minute)
        debuts = sorted(bornes)
        bandes: list[dict[str, Any]] = []
        for de, a in zip(debuts, debuts[1:] + [MINUTES_JOUR]):
            mode = mode_voulu(semaine, self.cfg["maison"], None, False, jour, de)["mode"]
            if bandes and bandes[-1]["mode"] == mode:
                bandes[-1]["a"] = a                 # meme mode : la bande d'avant s'allonge
            else:
                bandes.append({"de": de, "a": a, "mode": mode})
        return bandes

    # ── Le fichier des reprises ────────────────────────────────────────────
    def _store_etat(self):
        if self._depot is None:
            from homeassistant.helpers.storage import Store

            self._depot = Store(self.hass, VERSION_ETAT, CLE_ETAT)
        return self._depot

    async def _sauver_reprises(self) -> None:
        if self._rate():
            return                                  # rate au demarrage : le fichier qu'il n'a pas su lire reste tel quel
        try:
            # Une COPIE (28/10, ADR 0280) : `Store` serialise plus tard, et les
            # reprises vivantes peuvent changer entre-temps.
            await self._store_etat().async_save(copy.deepcopy(self.reprises))
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Loggia chauffage : reprises en main non enregistrees")

    @callback
    def async_arreter(self) -> None:
        # D'ABORD : une evaluation, une relance ou un demarrage deja en vol voit ce
        # drapeau a son prochain pas, et ne reprogramme, ne s'abonne ni ne commande.
        self._arrete = True
        if self._au_demarrage:
            self._au_demarrage()
            self._au_demarrage = None
        if self._minuteur is not None:
            self._minuteur()
            self._minuteur = None
        if self._ecoute is not None:
            try:
                self._ecoute()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia chauffage : desabonnement sans effet")
            self._ecoute = None
        ecoute_registre, self._ecoute_registre = getattr(self, "_ecoute_registre", None), None
        if ecoute_registre is not None:
            ecoute_registre()
        for cle in list(self._relances):
            self._annuler_relance(cle)
        for cle in list(self._verifications):
            self._annuler_verification(cle)
