"""Le socle commun des regles : ce qu'elles partagent toutes.

Six modules de regles vivent a cote de ce fichier — volets, fenetres, presence,
nuit, veilles, interrupteurs. Chacun avait ecrit sa propre plomberie, et les
memes defauts s'y repetaient :

  * CINQ journaux separes, chacun en memoire, tous remis a zero au moindre
    redemarrage. Deboguer une regle qui ne s'est pas declenchee cette nuit
    etait donc impossible le lendemain — c'est arrive, deux jours durant, sur
    le planning des volets ;
  * AUCUNE distinction entre une main et une regle. Une lampe allumee par
    quelqu'un et une lampe allumee par le dashboard se ressemblent trait pour
    trait, et la regle suivante eteignait les deux ;
  * une seule priorite, ecrite en dur au milieu d'une fonction.

Ce fichier tient ces choses une fois pour toutes. Une regle qui passe par
`agir()` herite du journal, du respect du geste manuel, des priorites
declarees et du mode simulation — sans une ligne de plus. `prevenir()` fait de
meme pour ce qui se dit au telephone : un seul canal, deux regimes.

── Les heures calmes, et le seul canal qui les contourne ───────────────────

Entre deux heures — la nuit, en general — rien ne doit sonner. Une regle qui
reveille la maison pour une pile a plat se fait debrancher dans la semaine.
Les notifications partent quand meme, silencieuses : on les lira au reveil.

Une seule chose passe par-dessus, et par-dessus le mode silencieux du
telephone avec : le DANGER. Fumee, gaz, monoxyde, fuite, alarme. Tout le reste
attend.

── Ce que « geste manuel » veut dire, exactement ────────────────────────────

Home Assistant attache un `Context` a chaque changement d'etat. Quand il vient
d'une personne — interface, application, voix —, ce contexte porte un
`user_id`. Quand il vient d'une automatisation ou d'une integration, il n'en
porte pas. C'est la seule difference, et elle suffit.

Une entite touchee a la main est donc GELEE : les regles cessent de la piloter
pendant un temps. Sans cela, on remonte un volet, le dashboard le redescend, on
le remonte encore — et l'on finit par tout debrancher. C'est le premier motif
d'abandon de ce genre de systeme, et il ne se corrige pas regle par regle.
"""
from __future__ import annotations

import asyncio
import copy
import logging
import secrets
import time
from typing import Any

from homeassistant.core import Context, HomeAssistant, callback

from . import destinataires
from .const import DOMAIN
from .eau_calcul import est_vanne_eau
from .entites import motif
from .textes import joindre, langue_serveur, parties, rendre_fr, traduire
from .volets_calcul import cible_de

_LOGGER = logging.getLogger(__name__)

# Le journal vit dans SON fichier, pas dans la configuration.
#
# Melange a elle, il l'aurait gonflee a chaque manoeuvre, aurait voyage dans
# chaque synchronisation entre appareils, et se serait heurte aux plafonds de
# taille de `store.py`. Il n'appartient d'ailleurs a personne : c'est ce que la
# maison a fait, pas un reglage de quelqu'un.
CLE_JOURNAL = "loggia_journal"
VERSION_JOURNAL = 1

# Cinq cents lignes : plusieurs jours d'une maison active — sept modules et
# les notifications dedans —, pour un fichier qui reste leger. On garde par
# le nombre, pas par la date : la taille reste bornee quelle que soit la
# maison.
MAX_JOURNAL = 500

# L'ecriture est differee : une soiree de volets, ce sont quelques dizaines
# d'entrees en deux minutes, et autant d'ecritures disque pour rien.
DELAI_ECRITURE = 20.0
# Un rechargement de l'integration : `arreter()` lance l'ecriture de ce qui
# attendait, et l'instance suivante relirait le fichier PENDANT cette
# ecriture, puis l'ecraserait de ce qu'elle a lu. La tache reste donc dans
# `hass.data[DOMAIN]` (le dechargement n'en retire que les modules), et la
# suivante l'attend avant de relire - ATTENTE_ECRITURE_S au plus -, sur le
# patron du carnet des lumieres et des robots (audit du 19/10).
CLE_ECRITURE_FINALE = "regles_ecriture"
ATTENTE_ECRITURE_S = 10.0

# Combien de temps une entite touchee a la main echappe aux regles.
GEL_DEFAUT = 30 * 60

# Combien de temps une tenue survit si la regle qui l'a prise oublie de la
# rendre. Un filet, pas un reglage : les regles rendent leurs tenues.
#
# SAUF les tenues qui attendent un EVENEMENT (audit du 03/10) : le depart tient
# jusqu'au retour, la fenetre ouverte jusqu'a sa fermeture — `agir(...,
# jusqu_a_relacher=True)`. Avec le filet, un depart a 7 h 30 tombait a
# 19 h 30 : au retour de 20 h, ni chauffage ni lampes n'etaient rendus, et la
# nuit suivante l'eclairage nocturne rallumait la maison vide.
TENUE_MAX = 12 * 3600

# L'echelle de la maison : quatre paliers, du plus fort au plus faible. Avant
# elle, les priorites ne valaient qu'a l'interieur d'un module, et deux
# modules visant la meme lampe — la nuit eteint, l'eclairage doux allume, le
# depart eteint tout — se battaient sans arbitre.
#
#   surete    le danger, le vent fort, la fenetre ouverte qui coupe le
#             chauffage : ce qu'on ne discute pas ;
#   presence  le depart, le retour, l'invite ;
#   nuit      la fermeture du soir, l'extinction, la veilleuse ;
#   confort   la protection solaire, l'ouverture du matin, l'eclairage doux.
#
# Une regle prend son niveau dans son palier — `niveau("nuit", 5)` — et ne se
# compare aux autres que par ce nombre. Au-dessus de tous : une main.
ECHELLE = {"surete": 100, "presence": 80, "nuit": 60, "confort": 40}


def niveau(palier: str, rang: int = 0) -> int:
    """Le niveau d'une regle : son palier, plus son rang dans le palier.

    Le rang va de 0 a 19 : un palier ne mord jamais sur le suivant, quel que
    soit le zele d'un module. Un palier inconnu est une erreur, pas un defaut
    silencieux — une regle qui ne sait pas ou se placer se place en confort,
    et le dit.
    """
    if palier not in ECHELLE:
        raise ValueError("palier inconnu : %r" % (palier,))
    return ECHELLE[palier] + max(0, min(19, int(rang)))


# La forme d'un identifiant d'entite : `domaine.objet`, en minuscules, chiffres
# et soulignes — ce que Home Assistant ecrit lui-meme.
ENTITE = motif()


def est_entite(valeur: Any) -> bool:
    """Un identifiant d'entite, et rien d'autre (audit du 19/10, M24).
    `fullmatch`, pas `match` : avec `^…$`, `match` laissait passer
    « sensor.a\n » — le `$` accepte un saut de ligne final (relecture du lot 2,
    point 5)."""
    return isinstance(valeur, str) and len(valeur) <= 255 and ENTITE.fullmatch(valeur) is not None


def entites_propres(liste: Any) -> list[str]:
    """Une liste recue, relue : seulement des identifiants d'entite.

    Les veilles et la presence ecrivaient ce que l'ecran envoyait sans le
    relire (audit du 19/10, M24) : un entier glisse dans `capteurs` etait
    ecrit, puis `sorted` levait TypeError au reabonnement — la veille
    n'ecoutait plus rien, au redemarrage pas davantage. Meme principe que
    `fenetres.piece_propre`, la forme en plus : ce qui n'est pas un
    identifiant est ecarte, une liste qui n'en est pas une devient vide.
    """
    if not isinstance(liste, list):
        return []
    return [h for h in liste if est_entite(h)]

# La configuration des alertes — le telephone choisi, et les heures calmes —
# vit sous cette cle, ecrite par Parametres > Alertes.
CLE_ALERTES = "loggia_alertes"

# Ce qui fait sonner une notification par-dessus le mode silencieux du
# telephone. Android et iOS lisent chacun leurs cles et ignorent les autres :
# on envoie les deux. Android : le canal « alarm_stream » sonne sur le flux
# des alarmes, que « Ne pas deranger » ne coupe pas. iOS : le son critique,
# que l'app compagnon est autorisee a emettre.
CRITIQUE: dict[str, Any] = {
    "ttl": 0, "priority": "high", "channel": "alarm_stream", "importance": "high",
    "push": {"sound": {"name": "default", "critical": 1, "volume": 1.0},
             "interruption-level": "critical"},
}
# Et ce qui la rend silencieuse : elle arrive, elle ne sonne pas.
SILENCIEUSE: dict[str, Any] = {"importance": "low", "push": {"sound": "none"}}


# ── La maison ne rouvre jamais l'eau seule (passe bis 2 de l'etape 3 IoT, 25/10 ; ADR 0217) ──
# Rouvrir, c'est une personne, depuis la popup de la vanne, apres la question.
# Ce qu'une regle, un planning, une veille, un scenario ou un bouton sans fil
# demanderait de ROUVRIR est retenu (`agir`, scenarios.py, interrupteurs.py) ;
# fermer passe toujours. Ici et non dans le carnet (eau_calcul.py) : le carnet
# note, il ne nomme aucun service.
SERVICES_OUVRANTS = ("turn_on", "toggle", "open_valve", "set_valve_position")
REFUS_EAU = "Loggia ne rouvre jamais l’eau seule"


def est_ouvrant(service: Any, data: Any) -> bool:
    """Ce service OUVRIRAIT-il ce qu'il vise ? `set_valve_position` a 0 ferme :
    il ne l'est pas. Lu par `a_ne_pas_rouvrir`, et par interrupteurs.py avant de
    resoudre une cible qui n'est pas une liste d'entites (trois defauts du 25/10)."""
    if service not in SERVICES_OUVRANTS:
        return False
    if service == "set_valve_position":
        try:
            position = float((data if isinstance(data, dict) else {}).get("position"))
        except (TypeError, ValueError):
            position = 0.0
        return position > 0
    return True


def a_ne_pas_rouvrir(service: Any, cibles: Any, data: Any, designee: Any, attributs_de: Any) -> list[str]:
    """Les cibles qu'un ordre de la MAISON rouvrirait : la prise (ou l'entite)
    designee dans Parametres > Alertes, et toute `valve` de classe `water`.
    `set_valve_position` a 0 ferme : il passe. `attributs_de` : entity_id ->
    attributs, ou None."""
    if not est_ouvrant(service, data):
        return []
    if isinstance(cibles, str):
        cibles = [cibles]
    refus = []
    for h in cibles or ():
        if not isinstance(h, str) or not h:
            continue
        if (isinstance(designee, str) and h == designee) or (h.startswith("valve.") and est_vanne_eau(attributs_de(h))):
            refus.append(h)
    return refus


def journal_lisible(lignes: Any, lecture: Any) -> list:
    """Le journal tel qu'un compte peut le lire (28/10, ADR 0279).

    `lecture` est le test de `_lecture_autorisee` (discovery.py) : None quand
    tout est permis — presque toutes les installations, et les
    administrateurs —, et le journal passe tel quel. Sinon chaque ligne ne
    garde que les cibles que ce compte peut lire ; une ligne dont il ne peut
    lire AUCUNE cible disparait. Une ligne sans cible (une alerte, un geste de
    la maison) reste. Les lignes du journal ne sont jamais modifiees : une
    ligne filtree est une copie."""
    lignes = list(lignes or ())
    if lecture is None:
        return lignes
    sortie = []
    for e in lignes:
        cibles = e.get("cibles") if isinstance(e, dict) else None
        if not cibles:
            sortie.append(e)
            continue
        lisibles = [h for h in cibles if isinstance(h, str) and lecture(h)]
        if not lisibles:
            continue
        sortie.append(e if len(lisibles) == len(cibles) else {**e, "cibles": lisibles})
    return sortie


def cles_lisibles(table: Any, lecture: Any) -> dict:
    """Une table {entity_id: ...} (gels, tenues, ordres en attente) reduite aux
    entites que ce compte peut lire. None : tout est permis."""
    if not isinstance(table, dict):
        return {}
    if lecture is None:
        return dict(table)
    return {h: v for h, v in table.items() if isinstance(h, str) and lecture(h)}


def demarrer(hass: HomeAssistant, module: Any, coro: Any, nom: str) -> None:
    """Lance le demarrage d'un module SANS le perdre (24/09, plan M10).

    Chaque module posait `hass.async_create_task(self._async_demarrer())` et
    s'en remettait la. Une tache qui leve n'est retrouvee par personne : au
    mieux Home Assistant ecrit « Task exception was never retrieved » quand le
    ramasse-miettes passe, au pire rien du tout. Le module repondait ensuite a
    l'ecran comme si de rien n'etait — table vide, aucune reprise, aucun mot.

    Ici l'echec est ECRIT, et il se retient : `module.demarrage` vaut True quand
    tout s'est bien passe, False sinon. Ce que le module rend a l'ecran peut
    donc dire qu'il n'a pas demarre, au lieu de se taire.
    """
    setattr(module, "demarrage", None)

    async def _garde() -> None:
        try:
            await coro
            setattr(module, "demarrage", True)
        except Exception:  # noqa: BLE001
            setattr(module, "demarrage", False)
            _LOGGER.exception("Loggia %s : demarrage impossible", nom)

    hass.async_create_task(_garde())


class Regles:
    """Journal, geste manuel, et l'entonnoir par lequel toute regle commande."""

    def __init__(self, hass: HomeAssistant, store: Any) -> None:
        self.hass = hass
        self.store = store
        self._entrees: list[dict[str, Any]] = []
        self._charge = False
        # Un seul chargement, les autres l'attendent (audit du 03/10) : le
        # drapeau pose AVANT de lire laissait un second `noter` inserer sa
        # ligne, que la relecture du disque ecrasait aussitot — au demarrage,
        # precisement quand plusieurs modules notent en meme temps.
        self._verrou_charge = asyncio.Lock()
        # {entity_id: horodatage de fin de gel}
        self._gel: dict[str, float] = {}
        self.duree_gel = GEL_DEFAUT
        # Les entites que les regles pilotent, par module. On n'ecoute que
        # celles-la : ecouter toute la maison couterait cher pour rien.
        self._pilotees: dict[str, set[str]] = {}
        self._defait_gestes = None
        # Les contextes que NOUS avons produits. Sans cette liste, la regle
        # prendrait son propre effet pour un geste humain et se gelerait
        # elle-meme au premier ordre.
        self._miens: list[str] = []
        # Qui tient quoi : {entity_id: {"module", "regle", "priorite", "fin"}}.
        # Une regle qui TIENT une entite la protege des regles plus faibles
        # jusqu'a ce qu'elle la rende — voir `agir`.
        self._tenues: dict[str, dict[str, Any]] = {}
        # Qui veut savoir qu'une main s'est posee : la presence, pour qui un
        # geste pendant le decompte de depart dit que quelqu'un est la (§10).
        self._sur_main: list = []
        self.derniere_main: float = 0.0
        self._ecriture = None
        # L'ecriture EN VOL : l'echeance a sonne, la tache est partie. Un
        # arret qui arrive la la depose pour l'instance suivante (`arreter`).
        self._ecriture_en_cours = None
        self._ecriture_jeton = 0
        self._depot = None
        # A l'arret de Home Assistant, ce que l'ecriture differee retient
        # encore doit partir : sinon les dernieres lignes disparaissaient (audit 18/09).
        #
        # Le desabonnement se GARDE (audit du 27/09). Il partait a la poubelle,
        # et `arreter()` ne le retirait pas : chaque rechargement de
        # l'integration laissait une instance `Regles` accrochee au bus jusqu'a
        # l'arret reel du process — et le jour venu, autant d'ecritures
        # concurrentes du meme fichier de journal qu'il y avait eu de
        # rechargements.
        self._defait_arret = None
        bus = getattr(hass, "bus", None)
        if bus is not None and hasattr(bus, "async_listen_once"):
            try:
                self._defait_arret = bus.async_listen_once("homeassistant_stop", self._sur_arret)
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia regles : pas d'ecoute de l'arret")

    async def _sur_arret(self, _event) -> None:
        """L'arret : ecrire tout de suite ce que le differe retient."""
        # Home Assistant retire lui-meme une ecoute `once` apres l'avoir
        # declenchee : la garder ici ferait mentir `arreter()`.
        self._defait_arret = None
        if self._ecriture is not None:
            try:
                self._ecriture()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia regles : ecriture deja annulee")
            self._ecriture = None
        if self._entrees:
            await self._ecrire()

    # ── Le journal ─────────────────────────────────────────────────────────
    def _store_journal(self):
        if self._depot is None:
            from homeassistant.helpers.storage import Store

            self._depot = Store(self.hass, VERSION_JOURNAL, CLE_JOURNAL)
        return self._depot

    async def _async_attendre_ecriture_retiree(self) -> None:
        """L'ecriture finale de l'instance que celle-ci remplace (rechargement
        de l'integration), s'il y en a une : on l'attend, ATTENTE_ECRITURE_S au
        plus. Elle ne s'attend qu'une fois."""
        donnees = getattr(self.hass, "data", None)
        propres = donnees.get(DOMAIN) if isinstance(donnees, dict) else None
        tache = propres.pop(CLE_ECRITURE_FINALE, None) if isinstance(propres, dict) else None
        if tache is None:
            return
        try:
            _, restantes = await asyncio.wait({asyncio.ensure_future(tache)}, timeout=ATTENTE_ECRITURE_S)
        except Exception:  # noqa: BLE001
            _LOGGER.warning("Loggia regles : ecriture de l'instance retiree impossible a attendre", exc_info=True)
            return
        if restantes:
            _LOGGER.warning("Loggia regles : l'ecriture du journal de l'instance retiree n'a pas fini en %s s, "
                            "on relit le fichier quand meme", ATTENTE_ECRITURE_S)

    async def _charger(self) -> None:
        if self._charge:
            return
        async with self._verrou_charge:
            if self._charge:
                return
            # Un rechargement : l'instance retiree finit d'ecrire ses dernieres
            # lignes. On relit APRES elle, pas pendant.
            await self._async_attendre_ecriture_retiree()
            try:
                brut = await self._store_journal().async_load()
            except Exception:  # noqa: BLE001
                _LOGGER.exception("Loggia regles : journal illisible, on repart a vide")
                brut = None
            if isinstance(brut, dict) and isinstance(brut.get("entrees"), list):
                self._entrees = [e for e in brut["entrees"] if isinstance(e, dict)][:MAX_JOURNAL]
            self._charge = True

    @callback
    def _programmer_ecriture(self) -> None:
        """Ecrit le journal, mais pas a chaque ligne."""
        if self._ecriture is not None:
            return
        from homeassistant.helpers.event import async_call_later

        @callback
        def ecrire(_now):
            self._ecriture = None
            self._ecriture_jeton = getattr(self, "_ecriture_jeton", 0) + 1
            self._ecriture_en_cours = self.hass.async_create_task(self._ecrire_en_vol(self._ecriture_jeton))

        self._ecriture = async_call_later(self.hass, DELAI_ECRITURE, ecrire)

    async def _ecrire_en_vol(self, jeton: int) -> None:
        """L'ecriture de l'echeance, qui s'oublie une fois finie - la sienne
        seulement (`jeton`), pas une plus recente."""
        try:
            await self._ecrire()
        finally:
            if getattr(self, "_ecriture_jeton", 0) == jeton:
                self._ecriture_en_cours = None

    def _ecriture_en_vol(self) -> Any:
        """La tache d'ecriture partie et pas encore finie, s'il y en a une."""
        tache = getattr(self, "_ecriture_en_cours", None)
        fini = getattr(tache, "done", None)
        return None if tache is None or (callable(fini) and fini()) else tache

    async def _ecrire(self) -> None:
        try:
            await self._store_journal().async_save({"entrees": self._entrees[:MAX_JOURNAL]})
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Loggia regles : journal non enregistre")

    async def noter(self, module: str, regle: str, quoi: str, *,
                    cibles=(), n: int | None = None, motif: str = "",
                    detail: str = "", simule: bool = False,
                    echec: bool = False, cible: int | None = None,
                    orientation: int | None = None,
                    dehors: float | None = None) -> dict[str, Any]:
        """Une ligne de journal, commune a toutes les regles.

        `motif` est ce qui a declenche — « lever + 30 », « vent 62 km/h »,
        « personne depuis 20 min ». C'est la colonne qui manque partout
        ailleurs : sans elle, on lit qu'un volet s'est ferme sans savoir
        pourquoi, et l'on ne peut ni corriger ni faire confiance.

        `echec` : la ligne rouge — un ordre qui n'a pas abouti (ADR 0007).
        Le drapeau n'est pose que sur ces lignes-la.

        `cible`, `orientation`, `dehors` (chantier Volets, spec 6.4) : la
        position que vise un ordre de volet, et, sur les lignes de la
        protection solaire, la facade du volet et la temperature dehors a cet
        instant. Une ligne ne les porte que s'ils sont donnes : les autres
        modules, et les lignes d'avant, n'en ont pas.
        """
        await self._charger()
        cibles = [h for h in cibles if isinstance(h, str)]
        entree = {
            "ts": time.time(),
            "module": module,
            "regle": regle,
            "quoi": rendre_fr(quoi),
            "cibles": cibles,
            "n": len(cibles) if n is None else int(n),
            "motif": rendre_fr(motif),
            "detail": rendre_fr(detail),
            # Ce qui AURAIT ete fait : le mode simulation. L'ecran le marque,
            # pour qu'on ne cherche pas pourquoi rien n'a bouge.
            "simule": bool(simule),
        }
        for champ, valeur in (("cible", cible), ("orientation", orientation), ("dehors", dehors)):
            if valeur is not None:
                entree[champ] = valeur
        # Un texte compose — un gabarit et ses arguments — garde ses parties
        # a cote du francais rendu : c'est ce que l'ecran traduit (ADR 0070).
        # Un mot fixe n'en a pas besoin, sa cle suffit.
        g = {champ: [[gab, args] for gab, args in p]
             for champ, p in (("quoi", parties(quoi)), ("motif", parties(motif)),
                              ("detail", parties(detail))) if p}
        if g:
            entree["g"] = g
        if echec:
            entree["echec"] = True
        self._entrees.insert(0, entree)
        del self._entrees[MAX_JOURNAL:]
        self._programmer_ecriture()
        return entree

    async def journal(self, limite: int = 100, module: str | None = None) -> list:
        await self._charger()
        lignes = self._entrees
        if module:
            lignes = [e for e in lignes if e.get("module") == module]
        return lignes[: max(1, int(limite))]

    # ── Le geste manuel ────────────────────────────────────────────────────
    def suivre(self, module: str, haids) -> None:
        """Declare les entites qu'un module pilote.

        A appeler quand la configuration change : une entite qu'on ne pilote
        plus n'a plus a etre ecoutee, et une nouvelle doit l'etre AVANT le
        premier geste — sinon la premiere main posee dessus passe inapercue.
        """
        nouveau = {h for h in haids if isinstance(h, str)}
        if self._pilotees.get(module) == nouveau:
            return
        self._pilotees[module] = nouveau
        self._reposer_ecoute()

    def _reposer_ecoute(self) -> None:
        if self._defait_gestes is not None:
            try:
                self._defait_gestes()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia regles : ecoute des gestes deja retiree")
            self._defait_gestes = None
        toutes: set[str] = set()
        for lot in self._pilotees.values():
            toutes |= lot
        if not toutes:
            return
        from homeassistant.helpers.event import async_track_state_change_event

        self._defait_gestes = async_track_state_change_event(
            self.hass, sorted(toutes), self._sur_changement)

    def est_mien(self, ident: Any) -> bool:
        """Ce contexte est-il celui d'un ordre de Loggia (`agir`) ? Le carnet de
        l'eau s'en sert pour qu'une fermeture a la main ne passe pas pour celle
        de la regle de fuite (chantier IoT, etape 3, passe bis, point 10)."""
        return isinstance(ident, str) and ident in self._miens

    @callback
    def _sur_changement(self, event) -> None:
        """Une main s'est-elle posee sur cette entite ?

        `context.user_id` est rempli quand le changement vient d'une personne,
        et vide quand il vient d'une automatisation ou d'une integration.
        C'est la seule difference disponible, et elle est fiable.
        """
        ctx = getattr(event, "context", None)
        if ctx is None or not getattr(ctx, "user_id", None):
            return
        if getattr(ctx, "id", None) in self._miens:
            return                      # notre propre ordre, rendu par HA
        haid = event.data.get("entity_id")
        if not haid:
            return
        self._gel[haid] = time.time() + self.duree_gel
        # La main reprend aussi ce qu'une regle tenait. Sans cela, la regle
        # rendrait l'entite derriere elle a la fin du gel — la protection
        # solaire rouvrant un volet qu'on venait de baisser a la main.
        self._tenues.pop(haid, None)
        self._prevenir_main(haid)

    def gele(self, haid: str) -> bool:
        """Cette entite est-elle sous la main de quelqu'un ?"""
        fin = self._gel.get(haid)
        if fin is None:
            return False
        if time.time() >= fin:
            del self._gel[haid]
            return False
        return True

    def gel_restant(self, haid: str) -> int:
        """Secondes restantes, pour le dire a l'ecran plutot que de se taire."""
        fin = self._gel.get(haid)
        return max(0, int(fin - time.time())) if fin else 0

    def degeler(self, haid: str) -> None:
        """Rendre la main aux regles avant l'heure — un bouton, un depart."""
        self._gel.pop(haid, None)

    async def geler(self, module: str, regle: str, cibles, *,
                    quoi: str = "main", motif: str = "") -> list:
        """Une main qui ne passe pas par Home Assistant.

        Un interrupteur sans fil passe par Loggia, qui appelle le service sans
        contexte d'utilisateur : pour l'ecoute des changements d'etat, c'est
        une automatisation. Or c'est un humain qui a appuye. Le module le
        declare donc ici, entite par entite : gel, tenue reprise, et une
        ligne au journal qui dit « bouton ».
        """
        haids = [h for h in cibles if isinstance(h, str)]
        for h in haids:
            self._gel[h] = time.time() + self.duree_gel
            self._tenues.pop(h, None)
            self._prevenir_main(h)
        await self.noter(module, regle, quoi, cibles=haids, motif=motif)
        return haids

    def ecouter_mains(self, rappel):
        """Prevenir `rappel(entity_id)` a chaque main posee sur une entite
        suivie — par Home Assistant ou declaree par un module (`geler`).
        Rend la fonction qui retire l'ecoute."""
        self._sur_main.append(rappel)

        def retirer():
            try:
                self._sur_main.remove(rappel)
            except ValueError:
                pass
        return retirer

    def _prevenir_main(self, haid: str) -> None:
        self.derniere_main = time.time()
        for rappel in list(self._sur_main):
            try:
                rappel(haid)
            except Exception:  # noqa: BLE001
                _LOGGER.exception("Loggia regles : un abonne aux mains a echoue")

    def gels(self) -> dict:
        """Ce qu'une main retient en ce moment : {entity_id: secondes restantes}."""
        return {h: self.gel_restant(h) for h in list(self._gel) if self.gele(h)}

    # ── Les priorites ──────────────────────────────────────────────────────
    def _tenue(self, haid: str):
        """La tenue en cours sur cette entite, ou None — echue, elle tombe."""
        t = self._tenues.get(haid)
        if t is not None and t["fin"] is not None and time.time() >= t["fin"]:
            del self._tenues[haid]
            return None
        return t

    def tient(self, module: str, regle: str, haid: str) -> bool:
        """Cette regle tient-elle encore cette entite ?

        A demander avant de « rendre » : une regle plus forte, ou une main,
        a pu la prendre depuis — et la rendre la contredirait.
        """
        t = self._tenue(haid)
        return t is not None and t["module"] == module and t["regle"] == regle

    def tenu_par_plus_fort(self, module: str, regle: str, haid: str, priorite: int):
        """La regle qui tient cette entite et l'emporte sur (`module`, `regle`)
        a ce rang - celle qui la retiendrait dans `agir` -, ou None. A demander
        avant de RETENTER : un ordre qui sera retenu n'a pas a partir, ni a
        noter une ligne de plus a chaque passage (audit du 19/10)."""
        t = self._tenue(haid)
        if t is not None and (t["module"], t["regle"]) != (module, regle) and t["priorite"] > priorite:
            return t["regle"]
        return None

    def tenues(self, module: str) -> dict[str, str]:
        """Ce que tiennent les regles d'un module : {entity_id: regle}."""
        return {h: t["regle"] for h, t in list(self._tenues.items())
                if t["module"] == module and self._tenue(h) is not None}

    def tenues_toutes(self) -> dict:
        """Ce que tient chaque regle de la maison, pour l'ecran :
        {entity_id: {"module", "regle"}}. Les tenues echues n'y sont pas."""
        return {h: {"module": t["module"], "regle": t["regle"]}
                for h, t in list(self._tenues.items()) if self._tenue(h) is not None}

    def tenir(self, module: str, regle: str, cibles, priorite: int = 0) -> None:
        """Tenir sans commander, jusqu'a `relacher` : ce qu'une autre regle a deja
        fait et qu'on reprend a son compte — la coupure qu'un moteur laisse a la
        regle des fenetres (audit du 19/10)."""
        for haid in cibles or ():
            if isinstance(haid, str):
                self._tenues[haid] = {"module": module, "regle": regle, "priorite": priorite, "fin": None}

    def relacher(self, module: str, regle: str | None = None, cibles=None) -> None:
        """Rend ce qu'une regle tenait — tout le module si `regle` est None."""
        for haid, t in list(self._tenues.items()):
            if t["module"] != module or (regle is not None and t["regle"] != regle):
                continue
            if cibles is not None and haid not in cibles:
                continue
            del self._tenues[haid]

    # ── Le telephone ───────────────────────────────────────────────────────
    async def _alertes(self) -> dict:
        try:
            cfg = await self.store.async_get_shared(CLE_ALERTES, None)
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Loggia regles : configuration des alertes illisible")
            return {}
        return cfg if isinstance(cfg, dict) else {}

    # ── L'eau ne se rouvre pas seule (passe bis 2 de l'etape 3 IoT ; ADR 0217) ──
    async def eau_retenue(self, service: str, cibles, data: dict | None = None) -> list[str]:
        """Les cibles qu'un ordre de la maison ROUVRIRAIT — la prise designee
        comme vanne d'eau (`loggia_alertes.actions.vanne.entite`), une `valve`
        de classe `water` — et qui ne partent donc pas. Une ligne au journal de
        Home Assistant ; celle de Loggia, l'appelant l'ecrit (`REFUS_EAU`).
        Rouvrir, c'est une personne, depuis la popup de la vanne : l'ecran
        appelle Home Assistant lui-meme, il ne passe jamais par ici."""
        if service not in SERVICES_OUVRANTS:
            return []
        actions = self._table(self._table(await self._alertes()).get("actions"))
        designee = self._table(actions.get("vanne")).get("entite")

        def attributs(haid: str):
            try:
                return getattr(self.hass.states.get(haid), "attributes", None)
            except Exception:  # noqa: BLE001 — un etat illisible : la classe reste inconnue
                return None
        refus = a_ne_pas_rouvrir(service, cibles, data, designee, attributs)
        if refus:
            _LOGGER.warning("Loggia ne rouvre jamais l'eau seule : %s retenu pour %s", service, ", ".join(refus))
        return refus

    async def eau_a_garder(self) -> bool:
        """Y a-t-il de l'eau a garder ? La prise designee dans Parametres > Alertes, ou une `valve` de classe `water`. Sans
        elles, un bouton qui vise une piece part tel qu'il est regle, et c'est Home Assistant qui la resout, comme avant
        (trois defauts du 25/10) ; des etats illisibles : on garde."""
        actions = self._table(self._table(await self._alertes()).get("actions"))
        designee = self._table(actions.get("vanne")).get("entite")
        if isinstance(designee, str) and designee:
            return True
        try:
            return any(est_vanne_eau(getattr(self.hass.states.get(h), "attributes", None))
                       for h in self.hass.states.async_entity_ids("valve"))
        except Exception:  # noqa: BLE001 — des etats illisibles : dans le doute, on garde
            return True

    @staticmethod
    def _table(x: Any) -> dict:
        return x if isinstance(x, dict) else {}

    def _maintenant(self):
        from homeassistant.util import dt as dt_util

        return dt_util.now()

    @staticmethod
    def _minutes(hhmm):
        """« 22:30 » -> 1350. None si ce n'est pas une heure."""
        try:
            h, m = str(hhmm).strip().split(":")[:2]
            h, m = int(h), int(m)
        except (TypeError, ValueError, AttributeError):
            return None
        if not (0 <= h < 24 and 0 <= m < 60):
            return None
        return h * 60 + m

    @staticmethod
    def dans_la_plage(plage, quand) -> bool:
        """`quand` tombe-t-il dans les heures calmes `plage` ?

        La plage traverse minuit le plus souvent — 22 h a 7 h — et c'est le
        cas qui se rate : « entre 22 et 7 » ne se teste pas avec un simple
        encadrement.
        """
        if not isinstance(plage, dict) or not plage.get("actif"):
            return False
        debut = Regles._minutes(plage.get("debut", "22:00"))
        fin = Regles._minutes(plage.get("fin", "07:00"))
        if debut is None or fin is None or debut == fin:
            return False
        t = quand.hour * 60 + quand.minute
        if debut < fin:
            return debut <= t < fin
        return t >= debut or t < fin

    async def calme(self) -> bool:
        """Est-on dans les heures calmes ? Pour qui veut se taire — une voix
        sur une enceinte, une lumiere qui clignote."""
        return self.dans_la_plage((await self._alertes()).get("calme"), self._maintenant())

    async def _cibles(self, pour: str, cfg: dict) -> list[str]:
        """Les services decouverts pour ce public (destinataires.py). Une
        decouverte qui casse ne coupe rien : le repli prend la suite."""
        try:
            gens = await destinataires.personnes(self.hass, cfg.get("personnes"))
        except Exception:  # noqa: BLE001
            _LOGGER.debug("Loggia regles : destinataires illisibles, repli", exc_info=True)
            return []
        return destinataires.choisir(gens, pour)

    async def async_destinataires(self) -> dict[str, Any]:
        """Qui recevra quoi, pour Parametres > Alertes (`loggia/notifications/destinataires`,
        administrateurs) : chaque personne, ses telephones, ce qui est corrige,
        et le service de repli."""
        cfg = await self._alertes()
        gens = await destinataires.personnes(self.hass, cfg.get("personnes"))
        return {"personnes": gens, "repli": str(cfg.get("service") or "").strip(),
                "routes": {p: destinataires.choisir(gens, p) for p in destinataires.POUR}}

    async def a_qui_parler(self, pour: str = "tous") -> bool:
        """Quelqu'un recevrait-il une notification de ce public ? Un telephone
        decouvert, ou le service choisi dans Parametres > Alertes. Ce que lisent
        les ecrans qui disaient « choisissez un telephone » (veilles, prises)."""
        cfg = await self._alertes()
        return bool(str(cfg.get("service") or "").strip()) or bool(await self._cibles(pour, cfg))

    async def _pousser(self, service: str, charge: dict) -> bool:
        """Un envoi, et ce que Home Assistant en dit tout de suite. L'appel ne
        bloque pas : l'application compagnon note elle-meme un echec de push
        sans le lever ; ce qui se voit ici, c'est un service refuse."""
        try:
            await self.hass.services.async_call("notify", service, charge, blocking=False)
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Loggia regles : notify.%s a echoue", service)
            return False
        return True

    async def prevenir(self, module: str, regle: str, message: str, *,
                       titre: str = "Loggia", critique: bool = False,
                       motif: str = "", simuler: bool = False,
                       data: dict | None = None, pour: str = "tous") -> bool:
        """Previent les bonnes personnes, sur leur telephone (ADR 0301).

        `pour` : `tous` (la surete), `admins` (le mode enfant), `presents` (la
        fin d'un cycle, la collecte, les veilles ordinaires) — destinataires.py.
        Le service choisi dans Parametres > Alertes est le REPLI : quand rien
        n'est decouvert pour ce public, et quand un envoi est refuse. Le repli
        se dit au journal de Home Assistant, en debug.

        La SURETE (`tous`) part TOUJOURS aussi au repli (relecture du 30/10,
        point 1) : un groupe `notify.famille` dont un seul telephone est trouve,
        un Telegram, un vieux telephone qui ne leve rien, une personne sans
        compte — avant ce chantier, le repli les servait ; une alerte de surete
        ne doit jamais atteindre moins de monde qu'avant. Un `tag` commun dans
        `data` laisse l'application compagnon fondre les doublons.

        Deux regimes, et rien entre les deux :

          * CRITIQUE — fumee, gaz, monoxyde, fuite, alarme. Passe toujours, et
            par-dessus le mode silencieux du telephone. C'est le SEUL canal
            qui contourne les heures calmes ;
          * tout le reste. Pendant les heures calmes, la notification part
            quand meme — on la lira au reveil — mais ne sonne pas.

        `data` (chantier Mode enfant, E13) : ce que l'application compagnon lit
        en plus du texte — les BOUTONS d'une notification (`actions`), que
        l'appui renvoie en `mobile_app_notification_action`. Il s'ajoute au
        regime du son, sans l'ecraser.

        Le son critique, le silence des heures calmes et les boutons sont des
        cles de l'application compagnon : ils ne partent que vers un service
        `mobile_app_*` — et vers le repli, qui les recevait deja et peut etre
        un groupe de telephones. Un service choisi a la main pour une personne
        (Telegram, un courriel) recoit le texte seul.

        Chaque envoi laisse une ligne au journal, avec son regime et le nombre
        de telephones atteints : quand rien n'a sonne cette nuit, on sait si
        c'etait voulu. Rend vrai si quelque chose est parti.
        """
        if pour not in destinataires.POUR:
            raise ValueError("pour : tous, admins ou presents, pas %r" % (pour,))
        await self._charger()
        cfg = await self._alertes()
        repli = str(cfg.get("service") or "").strip()
        quoi = "alerter" if critique else "prevenir"
        # Le telephone lit la langue du serveur (ADR 0070) ; le journal, lui,
        # garde le francais rendu et les parties que l'ecran traduit.
        langue = langue_serveur(self.hass)
        texte = traduire(message, langue)
        cibles = await self._cibles(pour, cfg)
        doublons = False
        if (pour == "tous" and cibles and repli and repli not in cibles
                and self.hass.services.has_service("notify", repli)):
            cibles = [*cibles, repli]
            doublons = True
        if not cibles:
            if not repli:
                await self.noter(module, regle, quoi, n=0, motif=motif,
                                 detail=("personne a qui parler · {message}", {"message": texte}))
                return False
            if not self.hass.services.has_service("notify", repli):
                await self.noter(module, regle, quoi, n=0, motif=motif,
                                 detail=("notify.{service} introuvable · {message}",
                                         {"service": repli, "message": texte}))
                return False
            _LOGGER.debug("Loggia regles : personne de decouvert pour « %s », repli sur notify.%s", pour, repli)
            cibles = [repli]
        extra: dict[str, Any] = {}
        regime = None
        if critique:
            extra = copy.deepcopy(CRITIQUE)
            regime = "critique"
        elif self.dans_la_plage(cfg.get("calme"), self._maintenant()):
            extra = copy.deepcopy(SILENCIEUSE)
            regime = "silencieuse, heures calmes"
        if data:
            extra = {**extra, **copy.deepcopy(data)}
        if doublons:
            # Le meme telephone peut l'avoir deux fois (par lui-meme, et par un
            # groupe de repli) : un tag commun, et l'application n'en garde qu'une.
            extra["tag"] = "loggia-" + secrets.token_hex(6)

        def charge(service: str) -> dict[str, Any]:
            c: dict[str, Any] = {"title": traduire(titre, langue), "message": texte}
            if extra and (service.startswith(destinataires.PREFIXE_APP) or service == repli):
                c["data"] = copy.deepcopy(extra)
            return c

        partis = len(cibles)
        if not simuler:
            partis, essaye = 0, set(cibles)
            for service in cibles:
                if await self._pousser(service, charge(service)):
                    partis += 1
                    continue
                # Un envoi refuse : le repli, une fois, s'il n'est pas deja servi.
                if repli and repli not in essaye and self.hass.services.has_service("notify", repli):
                    essaye.add(repli)
                    _LOGGER.debug("Loggia regles : notify.%s refuse, repli sur notify.%s", service, repli)
                    if await self._pousser(repli, charge(repli)):
                        partis += 1
            if not partis:
                await self.noter(module, regle, quoi, n=0, motif=motif,
                                 detail=("envoi impossible · {message}", {"message": texte}))
                return False
        await self.noter(module, regle, quoi, n=partis, motif=motif,
                         detail=joindre(regime, message), simule=simuler)
        return True

    # ── L'entonnoir ────────────────────────────────────────────────────────
    async def agir(self, module: str, regle: str, domaine: str, service: str,
                   cibles, data: dict | None = None, *,
                   quoi: str = "", motif: str = "", priorite: int = 0,
                   tenir: bool = False, jusqu_a_relacher: bool = False,
                   simuler: bool = False, orientation: int | None = None,
                   dehors: float | None = None, attendre: bool = False) -> list:
        """Commande, en respectant ce que les regles doivent toutes respecter.

        Rend la liste des entites REELLEMENT commandees — jamais la liste
        demandee. C'est la difference qui manquait partout : une regle qui
        note « ferme 2 » alors qu'un volet etait gele mentait a celui qui lit
        le journal, et le defaut restait invisible.

        Deux choses retiennent une entite :
          * une MAIN posee dessus — le gel ;
          * une regle plus FORTE qui la tient. `priorite` se compare a la
            sienne et la plus haute l'emporte ; l'egalite ne retient pas.

        `tenir` : la regle garde ce qu'elle vient de commander et le protege
        des plus faibles, jusqu'a le rendre — `relacher`, ou une commande sans
        `tenir`. Commander par-dessus une tenue la reprend : la regle qui
        tenait ne rendra pas l'entite derriere nous.

        `jusqu_a_relacher` : la tenue n'a pas d'echeance — le filet de
        `TENUE_MAX` ne la fait pas tomber. Pour ce qui attend un evenement : le
        retour, la fermeture d'une fenetre. La regle DOIT la rendre.

        `simuler` : rien ne part. Le journal note ce qui SERAIT parti, et les
        tenues bougent comme en vrai — la simulation raconte la meme histoire
        que le reel, sans toucher a la maison.

        Un ordre de volet porte au journal la position qu'il vise (`cible`,
        chantier Volets, spec 6.4), quel que soit le module qui le donne ;
        `orientation` et `dehors` passent tels quels a `noter`.

        `attendre` : l'appel ATTEND la fin du service (`blocking=True`) — ce
        qui doit etre fait avant l'ordre suivant, et dont l'echec doit se
        savoir : les aires d'une tondeuse avant qu'elle ne tonde (chantier IoT,
        passe bis du 18/10, point 4). Sans lui, l'appel part sans attendre.
        """
        await self._charger()
        demandees = [h for h in cibles if isinstance(h, str)]
        # La maison ne ROUVRE jamais l'eau seule (passe bis 2 de l'etape 3 IoT ; ADR 0217) : la prise designee, une vanne d'eau,
        # ne partent pas — en observation non plus, le journal ne dit pas ce qui ne serait jamais parti. Fermer passe toujours.
        eau = await self.eau_retenue(service, demandees, data)
        demandees = [h for h in demandees if h not in eau]
        geles = [h for h in demandees if self.gele(h)]
        tenus_par: dict[str, int] = {}
        retenues = []
        for h in demandees:
            if h in geles:
                continue
            autre = self.tenu_par_plus_fort(module, regle, h, priorite)
            if autre is not None:
                tenus_par[autre] = tenus_par.get(autre, 0) + 1
                continue
            retenues.append(h)

        echec = False
        if retenues and not simuler:
            # Un contexte a NOUS : les changements d'etat qui en decouleront
            # seront reconnus comme les notres, et non pris pour une main.
            ctx = Context()
            self._miens.append(ctx.id)
            # Une rafale — coucher du soleil : volets, nuit, presence — depasse
            # vite soixante-quatre ordres avant que Home Assistant ne renvoie
            # leurs echos ; evinces, ils passaient pour des mains (audit 18/09).
            del self._miens[:-1024]
            charge: dict[str, Any] = {"entity_id": retenues}
            if data:
                charge.update(data)
            try:
                await self.hass.services.async_call(
                    domaine, service, charge, blocking=attendre, context=ctx)
            except Exception:  # noqa: BLE001
                _LOGGER.exception("Loggia regles : %s.%s a echoue", domaine, service)
                retenues = []
                echec = True

        for h in retenues:
            if tenir:
                self._tenues[h] = {"module": module, "regle": regle, "priorite": priorite,
                                   "fin": None if jusqu_a_relacher else time.time() + TENUE_MAX}
            else:
                self._tenues.pop(h, None)

        details: list = []
        if eau:
            details.append(REFUS_EAU)
        if echec:
            # Au journal aussi : « ferme 0 » sans motif se lisait comme un
            # volet gele, pas comme une commande refusee.
            details.append("commande refusee par Home Assistant")
        if geles:
            details.append(("{n} sous la main de quelqu’un", {"n": len(geles)}))
        for autre, nb in tenus_par.items():
            details.append(("{n} tenu par {regle}" if nb == 1 else "{n} tenus par {regle}",
                            {"n": nb, "regle": autre}))
        await self.noter(module, regle, quoi or service, cibles=retenues,
                         motif=motif, detail=details, simule=simuler,
                         cible=cible_de(service, data) if domaine == "cover" else None,
                         orientation=orientation, dehors=dehors)
        return retenues

    @callback
    def arreter(self) -> None:
        if self._defait_gestes is not None:
            try:
                self._defait_gestes()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia regles : ecoute deja retiree")
            self._defait_gestes = None
        # L'ecoute de l'arret part avec le reste : sans elle, l'instance qu'on
        # vient de retirer de `hass.data` resterait vivante dans le bus.
        if self._defait_arret is not None:
            try:
                self._defait_arret()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia regles : ecoute de l'arret deja retiree")
            self._defait_arret = None
        # Ce que l'ecriture differee retenait part MAINTENANT (audit du 27/09).
        #
        # On l'annulait sans jamais l'ecrire, alors que `_sur_arret` — le meme
        # geste, a l'arret reel — ecrit avant de partir, et que `__init__.py` le
        # promet noir sur blanc. Les lignes notees dans les vingt secondes
        # precedant un rechargement disparaissaient donc en silence : justement
        # le journal qu'on vient consulter pour comprendre une regle qui ne
        # s'est pas declenchee.
        #
        # On n'ecrit que si une ecriture ETAIT en attente. `_entrees` porte tout
        # le journal, deja relu du magasin : sans cette garde, chaque
        # rechargement reecrirait a l'identique un fichier de cinq cents lignes.
        #
        # Et la tache reste a la portee de l'instance suivante, qui l'attend
        # avant de relire le fichier (`_async_attendre_ecriture_retiree`, audit
        # du 19/10) - une ecriture deja EN VOL, dont l'echeance vient de
        # sonner, se depose de meme.
        differee = self._ecriture is not None
        tache = None
        if differee:
            try:
                self._ecriture()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia regles : ecriture deja annulee")
            self._ecriture = None
            if self._entrees:
                tache = self.hass.async_create_task(self._ecrire())
        else:
            tache = self._ecriture_en_vol()
        if tache is not None:
            donnees = getattr(self.hass, "data", None)
            if isinstance(donnees, dict):
                donnees.setdefault(DOMAIN, {})[CLE_ECRITURE_FINALE] = tache
