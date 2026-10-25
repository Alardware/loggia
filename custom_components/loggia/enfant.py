"""Le mode enfant des medias : un profil par piece, tenu par Home Assistant (chantier Mode enfant, E1 a E14, E22 ; ADR 0210 a 0212).

Pourquoi ce module existe
─────────────────────────
Sa demande du 17/10 : « je ne voie pas pour la protection enfant ». La maison
ne peut pas EMPECHER « Alexa, monte le son », la telecommande de l'Apple TV ni
une appli lancee depuis le televiseur : elle voit apres coup, et elle RAMENE
(le volume), COUPE (l'ecran) ou PREVIENT (le telephone, l'Echo). Tout cela doit
tenir ecran ferme : c'est une regle de la maison, donc ici.

Ce que la maison fait, et ce qu'elle ne fait jamais (spec 8)
  * un volume publie au-dessus du plafond REDESCEND au plafond, sur l'entite
    qui a publie — jamais une valeur plus haute que celle lue ; un ordre par
    enceinte toutes les cinq secondes, le reflet de la jumelle ignore ;
  * le temps d'ecran se COMPTE sur l'etat des ecrans du profil ; use, ou hors
    des heures, l'ecran s'eteint (`turn_off`), et se reeteint s'il se rallume,
    vingt secondes de grace, une fois par minute ;
  * au coucher l'Echo baisse a 20 % et ce qui commence se met en pause — sauf
    le son pour dormir que Loggia a lance par ses puces ;
  * le telephone n'est prevenu qu'a l'INSISTANCE (trois fois en dix minutes,
    puis une heure de silence) et pour la demande de l'enfant, qui porte deux
    boutons ; l'Echo DIT la fin cinq minutes avant ;
  * allumer, lancer une lecture, monter un volume, basculer : aucun de ces
    services n'existe ici — la maison ne monte jamais rien et n'allume jamais
    rien (un test de source le tient) ;
  * les services sont appeles par le module lui-meme, avec son propre
    contexte, et notes au journal — PAS par `regles.agir` : la main de l'enfant
    sur la barre de la tablette gelerait precisement l'Echo que la regle doit
    ramener (E11, ADR 0210). « Observer sans agir » vaut ici aussi.

La fenetre de demarrage (ADR 0198, D1) : deux minutes apres que Home Assistant
a demarre, un etat relu n'est pas un geste — rien ne se ramene ni se coupe ; a
la fermeture, la maison regarde ou elle en est : ce qui depasse redescend, une
coupure due pendant l'arret s'execute si l'ecran est allume et toujours bloque.
Le temps de l'arret ne se compte pas.

Ce qui se calcule vit dans `enfant_calcul.py`, pur ; ici le temps reel : le
registre, les abonnements, les echeances, le disque, les services, le journal,
le telephone.
"""
from __future__ import annotations

import copy
import logging
import secrets
import time
from typing import TYPE_CHECKING, Any

from homeassistant.core import Context, HomeAssistant, callback

from .enfant_calcul import (CLE, COUPURE_S, action_telephone, actif, avancer_ecran, bloque, commencer_dormir,
                            config_defaut, coupure_due, dans_les_heures, decision_volume, demande_en_cours, demander,
                            doit_prevenir, echeance_s, etat_defaut, garder_titre, heure_hhmm, jour_de, lever, lire_action,
                            lire_config, nombre, normaliser, noter_coupure, noter_prevention, noter_ramene, nouveau_jour,
                            peut_couper, poser_patch, purger_demande, repondre, repondre_au_jeton, titre_a_garder,
                            titre_garde, vue_lecteur)
from .regles import demarrer
from .textes import langue_serveur, traduire

# Les delais du temps reel (les calculs n'en ont pas besoin) : rallumee, l'Apple TV attend GRACE_S puis s'eteint (E9),
# et un titre qui commence au coucher attend GRACE_S avant la pause (E10) ; PREAVIS_S avant la coupure, l'Echo le dit (E4 B).
GRACE_S = 20
PREAVIS_S = 300

if TYPE_CHECKING:  # l'annotation seule — les tests chargent ce module hors paquet
    from .store import LoggiaStore

_LOGGER = logging.getLogger(__name__)

MODULE = "enfant"
# L'etat vivant — les compteurs du jour, la demande, les ramenes — dans SON fichier de `.storage`, comme les prises.
CLE_ETAT = "loggia_enfant_etat"
VERSION_ETAT = 1
# Le compteur s'ecrit au plus toutes les ECRITURE_S ; une demande, un ramene, une coupure s'ecrivent tout de suite.
ECRITURE_S = 60
# La fenetre de demarrage (ADR 0198, D1) : rien ne se ramene ni se coupe pendant les deux minutes qui suivent le
# demarrage de Home Assistant ; les integrations publient alors des etats restaures, pas des gestes.
FENETRE_DEMARRAGE_S = 120
# Les bits d'un `media_player` (MediaPlayerEntityFeature) : ce que l'entite SAIT, et donc ce qu'on lui demande.
BIT_PAUSE, BIT_PLAY_MEDIA, BIT_TURN_OFF, BIT_STOP = 1, 512, 256, 4096
# Un ecran qui ne compte pas : eteint, en veille, muet.
ETEINT = ("off", "standby", "unavailable", "unknown")
MUET = ("unavailable", "unknown")
# Eteint POUR DE BON : la seule transition qui est un rallumage part d'ici (passe bis 2, 17/10). Un etat muet - l'integration qui se
# reconnecte, une entite recreee - n'est pas un geste de la main : trois reconnexions en dix minutes ne previennent pas le telephone.
ETEINT_DE_BON = tuple(e for e in ETEINT if e not in MUET)
# Les soeurs d'une Echo officielle, reconnues a leur cle de traduction : « Parler » (un notify), « Annonces » (un switch).
CLES_PARLER = ("speak",)
CLES_ANNONCES = ("announcements",)
# L'integration de HACS, la jumelle qui execute une phrase (« joue du bruit blanc ») et sait la pause.
PLATEFORME_HACS = "alexa_media"

# Ce qui part au telephone (E22) : des constantes, jamais un litteral glisse dans l'appel. Leurs cles vivent dans les
# six catalogues de src/langues, que scripts/textes_serveur.mjs recopie dans textes_catalogue.py (CLES_TELEPHONE) ;
# tests/python/test_lot16_alertes_traduites.py le verifie.
TITRE = "Loggia — mode enfant"
MSG_DEMANDE = "{nom} demande 15 min de plus ({appareil})"
MSG_VOLUME = "Volume ramené trois fois en dix minutes sur {appareil}"
MSG_RALLUMAGE = "{appareil} se rallume après l’heure"
# Ce que l'Echo DIT (E4 B), et les deux boutons de la notification (E13) : des textes du serveur, traduits comme ceux
# du telephone (CLES_VOIX), mais pas des envois au telephone.
VOIX_PREAVIS = "{nom}, l’écran s’éteint dans cinq minutes"
BOUTON_ACCORDER = "Accorder 15 min"
BOUTON_REFUSER = "Refuser"


def _cles_physiques(appareils: dict) -> dict[str, str]:
    """{appareil: cle} : deux appareils du registre qui partagent la VALEUR d'un identifiant sont UNE enceinte —
    l'officielle et la jumelle HACS d'une Echo ecrivent toutes deux son numero de serie (l'empreinte, ADR 0208)."""
    par_valeur: dict[str, set[str]] = {}
    for d in appareils.values():
        for _domaine, v in getattr(d, "identifiers", None) or ():
            if v not in (None, ""):
                par_valeur.setdefault(str(v), set()).add(d.id)
    cles: dict[str, str] = {}
    for d in appareils.values():
        groupe = {d.id}
        for _domaine, v in getattr(d, "identifiers", None) or ():
            if v not in (None, ""):
                groupe |= par_valeur[str(v)]
        cles[d.id] = min(groupe)
    return cles


def _service(entree: Any) -> bool:
    """L'appareil est-il un service (Spotify, un compte) ? Le registre ecrit un enum ou une chaine."""
    valeur = getattr(entree, "entry_type", None)
    return str(getattr(valeur, "value", valeur) or "") == "service"


class LoggiaEnfant:
    """Les profils du mode enfant : leurs lecteurs, leurs regles, leur etat."""

    def __init__(self, hass: HomeAssistant, store: "LoggiaStore", regles=None) -> None:
        self.hass = hass
        self.store = store
        self.regles = regles
        self.cfg: dict[str, Any] = config_defaut()
        # {profil: etat} (`enfant_calcul.etat_defaut`).
        self.etats: dict[str, dict[str, Any]] = {}
        # {profil: {entite: {"appareil", "ecran", "ajoute", "plateforme", "parler", "annonces"}}} : les lecteurs de
        # chaque profil, et la cle de l'appareil PHYSIQUE qui les porte (deux entites d'une Echo, une cle).
        self.membres: dict[str, dict[str, dict[str, Any]]] = {}
        # {profil: {"parler", "annonces", "hacs"}} : les soeurs dont les regles se servent.
        self.soeurs: dict[str, dict[str, Any]] = {}
        # Un ecran allume, et depuis quand on le compte : {entite: t}. Pas sur le disque — le temps de l'arret ne compte pas.
        self._allume_depuis: dict[str, float] = {}
        # Le dernier titre vu sur chaque lecteur : un titre qui CHANGE commence (E10).
        self._titres: dict[str, Any] = {}
        # Ce que le journal a dit en dernier des heures de chaque profil : « coucher », ou None.
        self._bloques: dict[str, str | None] = {}
        # Les ecrans sans le bit TURN_OFF dont le journal a deja dit « sans interrupteur » pendant CE blocage (passe bis, 17/10).
        self._sans_bouton: set[str] = set()
        self._ecoute = None
        self._ecoutees: list[str] = []
        self._tic_retrait = None
        # Les echeances posees : {(profil, entite, genre): annuler}.
        self._rdv: dict[tuple, Any] = {}
        self._fenetre = None
        self._fenetre_demarrage = True
        self._au_demarrage = None
        self._depot = None
        self._sauve_a = 0.0
        self._sale = False
        self._registre_dit = False
        self._arrete = False
        self._defait: list = []
        self._defait_arret = None
        bus = getattr(hass, "bus", None)
        if bus is not None:
            # La reponse du telephone (E13) : l'appui sur un bouton de la notification revient en evenement.
            self._defait.append(bus.async_listen("mobile_app_notification_action", self._sur_action))
            # A l'arret de Home Assistant, ce qui attend s'ecrit.
            self._defait_arret = bus.async_listen_once("homeassistant_stop", self._sur_arret)
        demarrer(hass, self, self._async_demarrer(), "enfant")

    # ── Le demarrage ───────────────────────────────────────────────────────
    async def _async_demarrer(self) -> None:
        self.cfg = lire_config(await self.store.async_get_shared(CLE, None))
        # L'etat du disque. Illisible, on repart a vide et on le dit, comme le journal (`regles._charger`).
        try:
            brut = await self._store_etat().async_load()
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Loggia enfant : etat illisible, on repart a vide")
            brut = None
        self.etats = normaliser(brut, time.time(), jour_de(self._now()))
        if self._arrete:
            return
        # Le registre attend que Home Assistant ait FINI de demarrer : avant, une integration n'a peut-etre pas
        # encore cree ses lecteurs.
        from homeassistant.helpers.start import async_at_started

        self._au_demarrage = async_at_started(self.hass, self._async_rattraper)

    async def _async_rattraper(self, _hass=None) -> None:
        self._au_demarrage = None
        if self._arrete:
            return
        bus = getattr(self.hass, "bus", None)
        if bus is not None:
            self._defait.append(bus.async_listen("entity_registry_updated", self._sur_registre))
        await self._async_recenser()
        from homeassistant.helpers.event import async_call_later, async_track_time_change

        # La minute : le compteur, les echeances, minuit.
        self._tic_retrait = async_track_time_change(self.hass, self._tic, second=0)
        # La fenetre de demarrage se ferme deux minutes plus tard (ADR 0198, D1).
        self._fenetre = async_call_later(self.hass, FENETRE_DEMARRAGE_S, self._fermer_demarrage)

    @callback
    def _fermer_demarrage(self, _now=None) -> None:
        """La fenetre fermee : la maison regarde ou elle en est. Les ecrans allumes se comptent a partir de
        maintenant, ce qui depasse redescend, une coupure due pendant l'arret s'execute."""
        self._fenetre = None
        self._fenetre_demarrage = False
        if self._arrete:
            return
        t, dt = time.time(), self._now()
        for ident, mem in self.membres.items():
            profil, etat = self.cfg["profils"].get(ident), self.etats.get(ident)
            if profil is None or etat is None:
                continue
            self._bloques[ident] = "coucher" if actif(profil, etat, t) and not dans_les_heures(profil, dt) else None
            for haid, info in mem.items():
                st = self.hass.states.get(haid)
                if st is None:
                    continue
                attrs = getattr(st, "attributes", None) or {}
                self._titres[haid] = attrs.get("media_title")
                if info["ecran"] and str(st.state).lower() not in ETEINT and haid not in self._allume_depuis:
                    self._allume_depuis[haid] = t
        self._regarder(couper=True)

    def _regarder(self, ident: str | None = None, couper: bool = False) -> None:
        """La maison regarde ou elle en est, sans attendre qu'un lecteur publie : a la fermeture de la fenetre de
        demarrage, au coucher et apres un reglage du parent (passe bis, 17/10 — une Echo a 30 % gardait 30 % jusqu'a
        son prochain evenement). Un volume lu au-dessus du plafond du moment REDESCEND, par la meme decision que sur un
        evenement (`decision_volume` : jamais plus haut que lu, un ordre par enceinte toutes les cinq secondes, le
        reflet de la jumelle ignore) ; `couper` : un ecran allume et bloque s'eteint (une coupure due pendant l'arret).
        Rien pendant la fenetre de demarrage, ou l'etat relu n'est pas un geste."""
        if self._arrete or self._fenetre_demarrage:
            return
        t, dt = time.time(), self._now()
        for ident_, mem in self.membres.items():
            if ident is not None and ident_ != ident:
                continue
            profil, etat = self.cfg["profils"].get(ident_), self.etats.get(ident_)
            if profil is None or etat is None:
                continue
            for haid, info in mem.items():
                st = self.hass.states.get(haid)
                if st is None:
                    continue
                self._plafond(ident_, haid, info, st, dt, t)
                if couper and info["ecran"] and str(st.state).lower() not in ETEINT \
                        and coupure_due(profil, self.etats[ident_], haid, True, True, dt, t) \
                        and peut_couper(self.etats[ident_], haid, t) and (ident_, haid, "coupure") not in self._rdv:
                    self.hass.async_create_task(self._async_couper(ident_, haid, rallumage=False))

    # ── Les lecteurs du profil (E1, E6) ────────────────────────────────────
    def _registres(self):
        """(entrees du registre des entites, appareils par identifiant), ou None — en le DISANT une fois."""
        try:
            from homeassistant.helpers import device_registry as dr, entity_registry as er

            return list(er.async_get(self.hass).entities.values()), dict(dr.async_get(self.hass).devices)
        except Exception:  # noqa: BLE001
            if not self._registre_dit:
                self._registre_dit = True
                _LOGGER.warning("Loggia enfant : registres illisibles, les lecteurs restent ceux deja recenses", exc_info=True)
            return None

    async def _async_recenser(self) -> None:
        """Les lecteurs de chaque profil : ceux de sa zone (l'entite, sinon l'appareil), plus les ajouts du parent et
        leur jumelle ; jamais un service ni l'appareil d'une camera (ADR 0208), ni une entite desactivee."""
        lus = self._registres()
        if lus is None:
            return
        entrees, appareils = lus
        cles = _cles_physiques(appareils)
        par_appareil: dict[Any, list] = {}
        for e in entrees:
            if getattr(e, "disabled_by", None) is None and getattr(e, "device_id", None):
                par_appareil.setdefault(e.device_id, []).append(e)
        lecteurs = {str(e.entity_id): e for e in entrees
                    if str(getattr(e, "entity_id", "") or "").startswith("media_player.") and getattr(e, "disabled_by", None) is None}

        def zone_de(e) -> Any:
            if getattr(e, "area_id", None):
                return e.area_id
            d = appareils.get(getattr(e, "device_id", None))
            return getattr(d, "area_id", None) if d is not None else None

        def exclu(e) -> bool:
            d = appareils.get(getattr(e, "device_id", None))
            if d is None:
                return False
            return _service(d) or any(str(x.entity_id).startswith("camera.") for x in par_appareil.get(d.id, []))

        def cle_physique(e) -> str:
            did = getattr(e, "device_id", None)
            return cles.get(did, did) if did else str(e.entity_id)

        def soeur(e, prefixe: str, cles_sœur: tuple) -> str | None:
            for x in par_appareil.get(getattr(e, "device_id", None), []):
                if str(x.entity_id).startswith(prefixe) and getattr(x, "translation_key", None) in cles_sœur:
                    return str(x.entity_id)
            return None

        membres: dict[str, dict[str, dict[str, Any]]] = {}
        soeurs: dict[str, dict[str, Any]] = {}
        for ident, profil in self.cfg["profils"].items():
            mem: dict[str, dict[str, Any]] = {}

            def ajouter(haid: str, ajoute: bool, mem=mem, profil=profil) -> None:
                e = lecteurs.get(haid)
                if e is None or haid in mem or exclu(e):
                    return
                attrs = getattr(self.hass.states.get(haid), "attributes", None) or {}
                classe = getattr(e, "device_class", None) or getattr(e, "original_device_class", None) or attrs.get("device_class")
                ecran = (haid in profil["ecrans"]) if profil["ecrans"] is not None else classe == "tv"
                mem[haid] = {"appareil": cle_physique(e), "ecran": bool(ecran), "ajoute": ajoute,
                             "plateforme": getattr(e, "platform", None),
                             "parler": soeur(e, "notify.", CLES_PARLER), "annonces": soeur(e, "switch.", CLES_ANNONCES)}

            for haid, e in lecteurs.items():
                if zone_de(e) == profil["zone"]:
                    ajouter(haid, False)
            for haid in profil["ajouts"]:
                ajouter(haid, True)
                e = lecteurs.get(haid)
                if e is None:
                    continue
                # La jumelle de l'ajout : l'autre entite de la meme enceinte (ADR 0208).
                for autre, x in lecteurs.items():
                    if autre != haid and cle_physique(x) == cle_physique(e):
                        ajouter(autre, True)
            membres[ident] = mem
            soeurs[ident] = {
                "parler": next((i["parler"] for _h, i in sorted(mem.items()) if i["parler"]), None),
                "annonces": next((i["annonces"] for _h, i in sorted(mem.items()) if i["annonces"]), None),
                "hacs": next((h for h, i in sorted(mem.items()) if i["plateforme"] == PLATEFORME_HACS), None),
            }
        if self._arrete:
            return
        self.membres, self.soeurs = membres, soeurs
        jour = jour_de(self._now())
        for ident in membres:
            self.etats.setdefault(ident, etat_defaut(jour))
        for ident in list(self.etats):
            if ident not in membres:
                del self.etats[ident]
                self._sale = True
        self._bloques = {ident: self._bloques.get(ident) for ident in membres}
        for haid in list(self._allume_depuis):
            if not any(haid in mem for mem in membres.values()):
                del self._allume_depuis[haid]
        # Un ecran qui quitte le profil emporte sa ligne « sans interrupteur » : s'il revient, son blocage aura la sienne (passe bis 2, 17/10).
        self._sans_bouton = {haid for haid in self._sans_bouton if any(haid in mem for mem in membres.values())}
        self._reabonner()

    def _reabonner(self) -> None:
        ids = sorted({h for mem in self.membres.values() for h in mem})
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
                _LOGGER.debug("Loggia enfant : ecoute deja retiree")
            self._ecoute = None
        self._ecoutees = []

    @callback
    def _sur_registre(self, event) -> None:
        """Une Echo qui change de piece, un lecteur qui arrive : on recense de nouveau."""
        d = getattr(event, "data", None) or {}
        if str(d.get("entity_id") or "").startswith("media_player.") and not self._arrete:
            self.hass.async_create_task(self._async_recenser())

    # ── Ce que les lecteurs publient ───────────────────────────────────────
    @callback
    def _sur_etat(self, event) -> None:
        d = getattr(event, "data", None) or {}
        haid, neuf, vieux = d.get("entity_id"), d.get("new_state"), d.get("old_state")
        if self._arrete or not haid or neuf is None:
            return
        t, dt = time.time(), self._now()
        for ident, mem in self.membres.items():
            info = mem.get(haid)
            profil, etat = self.cfg["profils"].get(ident), self.etats.get(ident)
            if info is None or profil is None or etat is None:
                continue
            allume = str(neuf.state).lower() not in ETEINT
            # L'ecran VIENT de s'allumer : l'ancien etat est « off » ou « standby » - jamais un etat muet (`unavailable`, `unknown` : une
            # integration qui se reconnecte), jamais l'absence d'etat (une entite recreee). Trois reconnexions en dix minutes sur un ecran
            # bloque ne sont pas trois rallumages : le telephone n'est pas prevenu a tort (passe bis 2, 17/10). Le tic de la minute
            # tient la suite : un ecran allume et bloque s'eteint, sans compter pour l'insistance.
            ancien = str(getattr(vieux, "state", "")).lower() if vieux is not None else None
            rallume = allume and ancien in ETEINT_DE_BON
            # 1. Le temps d'ecran (E8) : allume, l'ecran compte ; eteint, le temps allume s'ajoute.
            if info["ecran"]:
                self._compter(ident, haid, allume, t, dt)
            # Pendant la fenetre de demarrage, un etat n'est pas un geste (ADR 0198, D1).
            if self._fenetre_demarrage:
                continue
            # 2. Le plafond (E7).
            self._plafond(ident, haid, info, neuf, dt, t)
            # 3. Un ecran rallume alors qu'il est bloque (E9) : la grace, puis l'extinction — sur la TRANSITION eteint →
            #    allume seulement (passe bis, 17/10). Un ecran allume publie sa position ou son appli toutes les quelques
            #    secondes : chaque evenement recalait la grace, un Chromecast ou une Android TV n'etait JAMAIS reeteint, et
            #    tout evenement passait pour un rallumage. Deja allume, le tic de la minute tient la suite (une fois par minute).
            if info["ecran"] and rallume and coupure_due(profil, self.etats[ident], haid, True, True, dt, t):
                self._armer(ident, haid, "coupure", GRACE_S, rallumage=True)
            # 4. Une Echo au coucher (E10) : un titre qui commence.
            if not info["ecran"]:
                self._titre(ident, haid, neuf, vieux, t, dt)

    def _compter(self, ident: str, haid: str, allume: bool, t: float, dt) -> None:
        depuis = self._allume_depuis.get(haid)
        if allume and depuis is None:
            self._allume_depuis[haid] = t
        elif not allume and depuis is not None:
            del self._allume_depuis[haid]
            self._sans_bouton.discard(haid)
            self.etats[ident] = self._avancer(self.etats[ident], haid, depuis, t, dt)
            self._sale = True

    @staticmethod
    def _avancer(etat: dict[str, Any], haid: str, depuis: float, t: float, dt) -> dict[str, Any]:
        """Le temps allume de `depuis` a `t` s'ajoute au compteur. A cheval sur minuit (passe bis, 17/10 : une TV allumee
        de 23:58 a 00:02 comptait 180 s le jour nouveau au lieu de 120), ce qui precede minuit va au jour d'AVANT — qui
        s'efface ensuite avec lui —, le reste seul au jour de `dt`. Pour CHAQUE ecran allume (passe bis 2, 17/10 : le partage
        ne valait que pour le premier, qui faisait basculer le jour ; le second recevait tout l'intervalle sur le jour neuf,
        deux ecrans allumes a 23:58 comptaient 0 et 60 s a minuit au lieu de 0 et 0) : on scinde sur `depuis < minuit <= t`
        seul, et le jour d'avant ne recoit sa part que s'il n'a pas encore bascule — sinon il est deja efface, et la part
        ne compte nulle part."""
        jour = jour_de(dt)
        minuit = dt.replace(hour=0, minute=0, second=0, microsecond=0).timestamp()
        if depuis < minuit <= t:
            if etat["jour"] != jour:
                etat = avancer_ecran(etat, haid, minuit - depuis, etat["jour"])
            depuis = minuit
        return avancer_ecran(etat, haid, t - depuis, jour)

    def _plafond(self, ident: str, haid: str, info: dict[str, Any], st: Any, dt, t: float) -> None:
        """Un volume publie : s'il depasse, il redescend — sur CETTE entite (E7)."""
        attrs = getattr(st, "attributes", None) or {}
        lu = nombre(attrs.get("volume_level"))
        if lu is None or attrs.get("is_volume_muted") is True or str(st.state).lower() in MUET:
            return
        profil, etat = self.cfg["profils"][ident], self.etats[ident]
        decision = decision_volume(profil, etat, dt, t, haid, info["appareil"], round(lu * 100))
        if decision is None:
            return
        # Note tout de suite : la publication suivante, dans les cinq secondes, le verra.
        self.etats[ident] = noter_ramene(etat, t, haid, info["appareil"], decision["lu"], decision["volume"])
        self._sale = True
        self.hass.async_create_task(self._async_ramener(ident, decision, info["appareil"]))

    async def _async_ramener(self, ident: str, decision: dict[str, Any], appareil: str) -> None:
        entite, cible, lu = decision["entite"], decision["volume"], decision["lu"]
        t = time.time()
        await self._service("media_player", "volume_set", {"entity_id": entite, "volume_level": cible / 100})
        await self._noter("plafond", "volume ramené", cibles=[entite],
                          motif=[("de {a} à {b} %", {"a": lu, "b": cible}), "à la voix ou sur l’appareil"])
        etat = self.etats.get(ident)
        if etat is None:
            return
        # L'insistance (E3 C) : trois ramenes en dix minutes sur la meme enceinte, UNE notification, puis une heure.
        instants = [r[0] for r in etat["ramenes"] if r[2] == appareil]
        if doit_prevenir(etat, "volume", instants, t) and self.regles is not None:
            nom_appareil = self._nom(entite)
            await self.regles.prevenir(MODULE, "plafond", (MSG_VOLUME, {"appareil": nom_appareil}), titre=TITRE,
                                       simuler=self._simule())
            self.etats[ident] = noter_prevention(self.etats[ident], "volume", t)
        await self._sauver()

    def _titre(self, ident: str, haid: str, neuf: Any, vieux: Any, t: float, dt) -> None:
        """Au coucher, ce qui COMMENCE sur une Echo — un titre qui change, une lecture qui reprend — se met en pause
        vingt secondes plus tard, sauf le son pour dormir que Loggia a lance (E10)."""
        attrs = getattr(neuf, "attributes", None) or {}
        titre = attrs.get("media_title")
        avant = self._titres.get(haid)
        self._titres[haid] = titre
        joue = str(neuf.state).lower() == "playing" and bool(titre)
        reprend = vieux is None or str(getattr(vieux, "state", "")).lower() != "playing"
        if not joue or (titre == avant and not reprend):
            return
        profil, etat = self.cfg["profils"][ident], self.etats[ident]
        if titre_a_garder(etat, titre, t):
            self.etats[ident] = garder_titre(etat, titre, t)
            self._sale = True
            return
        if bloque(profil, etat, haid, False, dt, t) != "coucher":
            return
        if profil["dormir"] and titre_garde(etat, titre):
            return
        self._armer(ident, haid, "pause", GRACE_S, titre=titre)

    # ── Les echeances ──────────────────────────────────────────────────────
    def _armer(self, ident: str, haid: str, genre: str, delai: float, **champs: Any) -> None:
        cle = (ident, haid, genre)
        self._desarmer(cle)
        if self._arrete:
            return
        from homeassistant.helpers.event import async_call_later

        @callback
        def sonne(_now) -> None:
            self._rdv.pop(cle, None)
            if genre == "coupure":
                self.hass.async_create_task(self._async_couper(ident, haid, rallumage=bool(champs.get("rallumage"))))
            else:
                self.hass.async_create_task(self._async_pause(ident, haid, champs.get("titre")))

        self._rdv[cle] = async_call_later(self.hass, max(0.0, delai), sonne)

    def _desarmer(self, cle: tuple) -> None:
        annule = self._rdv.pop(cle, None)
        if annule:
            try:
                annule()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia enfant : echeance deja passee")

    async def _async_couper(self, ident: str, haid: str, rallumage: bool) -> None:
        """L'ecran s'eteint (`turn_off`, le bit TURN_OFF) s'il est encore allume et toujours bloque ; au plus une fois
        par minute — sinon on attend l'heure ; la troisieme fois en dix minutes, le telephone (E9, E3 C)."""
        profil, etat = self.cfg["profils"].get(ident), self.etats.get(ident)
        st = self.hass.states.get(haid)
        if profil is None or etat is None or st is None or self._arrete:
            return
        t, dt = time.time(), self._now()
        if str(st.state).lower() in ETEINT or not coupure_due(profil, etat, haid, True, True, dt, t):
            return
        if not peut_couper(etat, haid, t):
            self._armer(ident, haid, "coupure", etat["coupures"][haid] + COUPURE_S - t, rallumage=rallumage)
            return
        attrs = getattr(st, "attributes", None) or {}
        if not int(nombre(attrs.get("supported_features")) or 0) & BIT_TURN_OFF:
            # Une fois par blocage, pas a chaque tic ni a chaque evenement (passe bis, 17/10) : l'ecran s'oublie quand il
            # s'eteint ou quand le blocage cesse (`_compter`, `_tic`).
            if haid not in self._sans_bouton:
                self._sans_bouton.add(haid)
                await self._noter("coupure", "écran éteint", cibles=[], n=0, motif="sans interrupteur", echec=True)
            return
        quoi = bloque(profil, etat, haid, True, dt, t)
        self.etats[ident] = etat = noter_coupure(etat, haid, t, rallumage)
        await self._service("media_player", "turn_off", {"entity_id": haid})
        await self._noter("coupure", "écran éteint", cibles=[haid],
                          motif="rallumé" if rallumage else ("temps écoulé" if quoi == "temps" else "coucher"))
        if rallumage and doit_prevenir(etat, "rallumage", etat["rallumages"], t) and self.regles is not None:
            nom_appareil = self._nom(haid)
            await self.regles.prevenir(MODULE, "rallumage", (MSG_RALLUMAGE, {"appareil": nom_appareil}), titre=TITRE,
                                       simuler=self._simule())
            self.etats[ident] = noter_prevention(self.etats[ident], "rallumage", t)
        await self._sauver()

    async def _async_pause(self, ident: str, haid: str, titre: Any) -> None:
        """Vingt secondes apres : si le titre joue encore et n'est pas garde, la pause — `media_pause` sur l'entite qui
        a le bit, sinon `media_stop` (l'officielle), sinon rien, et le journal le dit."""
        profil, etat = self.cfg["profils"].get(ident), self.etats.get(ident)
        st = self.hass.states.get(haid)
        if profil is None or etat is None or st is None or self._arrete:
            return
        attrs = getattr(st, "attributes", None) or {}
        t, dt = time.time(), self._now()
        if str(st.state).lower() != "playing" or attrs.get("media_title") != titre:
            return
        if bloque(profil, etat, haid, False, dt, t) != "coucher" or (profil["dormir"] and titre_garde(etat, titre)):
            return
        bits = int(nombre(attrs.get("supported_features")) or 0)
        if bits & BIT_PAUSE:
            service = "media_pause"
        elif bits & BIT_STOP:
            service = "media_stop"
        else:
            await self._noter("coucher", "mis en pause", cibles=[], n=0, motif="sans pause", echec=True)
            return
        await self._service("media_player", service, {"entity_id": haid})
        await self._noter("coucher", "mis en pause", cibles=[haid], motif="coucher")

    # ── La minute (E8, E4 B, spec 5.5) ─────────────────────────────────────
    @callback
    def _tic(self, _now=None) -> None:
        if self._arrete:
            return
        t, dt = time.time(), self._now()
        jour = jour_de(dt)
        for ident, mem in self.membres.items():
            profil, etat = self.cfg["profils"].get(ident), self.etats.get(ident)
            if profil is None or etat is None:
                continue
            # Les ecrans allumes d'abord, sur le jour d'AVANT si minuit est passe entre deux tics (`_avancer`) ; le jour
            # nouveau ensuite — sans ecran allume, c'est ici qu'il commence.
            for haid, info in mem.items():
                if info["ecran"] and haid in self._allume_depuis:
                    etat = self._avancer(etat, haid, self._allume_depuis[haid], t, dt)
                    self._allume_depuis[haid] = t
                    self._sale = True
            if etat["jour"] != jour:
                etat = nouveau_jour(etat, jour)
                self._sale = True
            d = etat.get("demande")
            if d and d["reponse"] is None and demande_en_cours(etat, t) is None:
                etat = purger_demande(etat, t)
                self._sale = True
                self.hass.async_create_task(self._noter("demande", "demande expirée", cibles=[d["appareil"]]))
            self.etats[ident] = etat
            if self._fenetre_demarrage:
                continue
            self._dire_les_heures(ident, profil, etat, dt, t)
            for haid, info in mem.items():
                if not info["ecran"] or haid not in self._allume_depuis:
                    continue
                if not coupure_due(profil, etat, haid, True, True, dt, t):
                    # Plus bloque : le prochain blocage aura sa ligne « sans interrupteur ».
                    self._sans_bouton.discard(haid)
                elif peut_couper(etat, haid, t) and (ident, haid, "coupure") not in self._rdv:
                    self.hass.async_create_task(self._async_couper(ident, haid, rallumage=False))
                s = echeance_s(profil, etat, haid, True, dt, t)
                if s is not None and s <= PREAVIS_S:
                    self._voix(ident, profil, haid, t, s)
        self._sauver_si(t)

    def _dire_les_heures(self, ident: str, profil: dict[str, Any], etat: dict[str, Any], dt, t: float) -> None:
        """Le journal dit le coucher, et la reprise a l'heure dite — ou rien ne s'envoie (spec 5.5)."""
        maintenant = "coucher" if actif(profil, etat, t) and not dans_les_heures(profil, dt) else None
        avant = self._bloques.get(ident)
        self._bloques[ident] = maintenant
        if avant is None and maintenant == "coucher":
            self.hass.async_create_task(self._noter("heures", "coucher", cibles=[], n=0))
            # Le plafond du coucher s'applique a ce qui joue DEJA : une Echo a 30 % redescend a 20 sans attendre son
            # prochain evenement (passe bis, 17/10).
            self._regarder(ident)
        elif avant == "coucher" and maintenant is None:
            self.hass.async_create_task(self._noter("heures", "autorisé", cibles=[], n=0, motif=heure_hhmm(dt)))

    def _voix(self, ident: str, profil: dict[str, Any], haid: str, t: float, s: int) -> None:
        """Cinq minutes avant la coupure, l'Echo du profil le dit — une fois par echeance (E4 B)."""
        parler = (self.soeurs.get(ident) or {}).get("parler")
        if not parler or not profil["voix"]:
            return
        etat = self.etats[ident]
        echeance = t + s
        derniere = etat["preventions"].get("voix")
        if derniere is not None and abs(echeance - derniere) < PREAVIS_S + 60:
            return
        self.etats[ident] = noter_prevention(etat, "voix", echeance)
        self._sale = True
        self.hass.async_create_task(self._async_parler(parler, profil["nom"]))

    async def _async_parler(self, parler: str, nom: str) -> None:
        message = traduire((VOIX_PREAVIS, {"nom": nom}), langue_serveur(self.hass))
        await self._service("notify", "send_message", {"entity_id": parler, "message": message})
        await self._noter("voix", "voix", cibles=[parler], motif="l’écran s’éteint dans cinq minutes")

    # ── La reponse du telephone (E13) ──────────────────────────────────────
    async def _sur_action(self, event) -> None:
        lu = lire_action((getattr(event, "data", None) or {}).get("action"))
        if lu is None or self._arrete:
            return
        jeton, accorder = lu
        t, jour = time.time(), jour_de(self._now())
        for ident, etat in list(self.etats.items()):
            neuf = repondre_au_jeton(etat, jeton, accorder, t, jour)
            if neuf is None:
                continue
            self.etats[ident] = neuf
            await self._noter("demande", "15 min accordées" if accorder else "demande refusée",
                              cibles=[neuf["demande"]["appareil"]], motif="depuis le téléphone")
            await self._sauver()
            return

    # ── Les services, le journal, le disque ────────────────────────────────
    def _simule(self) -> bool:
        """Observer sans agir : les regles notent, rien ne bouge."""
        return bool((self.cfg.get("simulation") or {}).get("actif"))

    async def _service(self, domaine: str, service: str, data: dict[str, Any]) -> None:
        """Un service appele par le module, avec son propre contexte — jamais `agir` (E11). En simulation, rien ne part."""
        if self._simule():
            return
        try:
            await self.hass.services.async_call(domaine, service, data, blocking=False, context=Context())
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Loggia enfant : %s.%s a echoue", domaine, service)

    async def _noter(self, regle: str, quoi: str, **champs: Any) -> None:
        if self.regles is not None:
            await self.regles.noter(MODULE, regle, quoi, simule=self._simule(), **champs)

    def _nom(self, haid: str) -> str:
        attrs = getattr(self.hass.states.get(haid), "attributes", None) or {}
        nom = attrs.get("friendly_name")
        return nom if isinstance(nom, str) and nom else haid

    def _now(self):
        from homeassistant.util import dt as dt_util

        return dt_util.now()

    def _store_etat(self):
        if self._depot is None:
            from homeassistant.helpers.storage import Store

            self._depot = Store(self.hass, VERSION_ETAT, CLE_ETAT)
        return self._depot

    def _sauver_si(self, t: float) -> None:
        if self._sale and t - self._sauve_a >= ECRITURE_S:
            self.hass.async_create_task(self._sauver())

    async def _sauver(self, force: bool = False) -> None:
        """L'etat sur le disque : une COPIE, que la boucle peut changer pendant que Home Assistant l'ecrit. Rien
        apres l'arret (sauf l'ecriture de l'arret lui-meme), ni apres un demarrage rate (`regles.demarrer`) : l'etat
        n'y a pas ete relu, il effacerait celui du fichier."""
        if (self._arrete and not force) or getattr(self, "demarrage", None) is False:
            return
        self._sale = False
        self._sauve_a = time.time()
        try:
            await self._store_etat().async_save(copy.deepcopy(self.etats))
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Loggia enfant : etat non enregistre")

    async def _sur_arret(self, _event) -> None:
        """L'arret de Home Assistant : ce qui attend s'ecrit. Home Assistant retire lui-meme une ecoute `once`."""
        self._defait_arret = None
        if self._sale:
            await self._sauver(force=True)

    # ── Ce que l'ecran lit et ecrit (spec 7.4) ─────────────────────────────
    async def async_etat(self, user: Any = None) -> dict[str, Any]:
        """`loggia/enfant/etat` : les profils et leurs appareils, chaque lecteur et ce que le mode enfant en fait —
        sous les droits de lecture du compte. Jamais le code, jamais le jeton."""
        from .discovery import _lecture_autorisee

        lecture = _lecture_autorisee(user)
        t, dt = time.time(), self._now()
        jour = jour_de(dt)
        profils: dict[str, Any] = {}
        lecteurs: dict[str, Any] = {}
        for ident, profil in self.cfg["profils"].items():
            etat = self.etats.get(ident) or etat_defaut(jour)
            mem = self.membres.get(ident, {})
            appareils = []
            for cle in sorted({i["appareil"] for i in mem.values()}):
                entites = sorted(h for h, i in mem.items() if i["appareil"] == cle)
                principale = next((h for h in entites if mem[h]["plateforme"] != PLATEFORME_HACS), entites[0])
                if lecture is not None and not lecture(principale):
                    continue
                appareils.append({
                    "entite": principale, "ajoute": mem[principale]["ajoute"], "ecran": any(mem[h]["ecran"] for h in entites),
                    "parler": next((mem[h]["parler"] for h in entites if mem[h]["parler"]), None),
                    "annonces": next((mem[h]["annonces"] for h in entites if mem[h]["annonces"]), None),
                    "hacs": next((h for h in entites if mem[h]["plateforme"] == PLATEFORME_HACS), None),
                })
            appareils.sort(key=lambda a: (a["ajoute"], a["entite"]))
            d = etat.get("demande")
            profils[ident] = {
                "nom": profil["nom"], "zone": profil["zone"], "actif": profil["actif"],
                "leve_jusqua": etat["leve_jusqua"] if etat["leve_jusqua"] and etat["leve_jusqua"] > t else None,
                "demande": {"appareil": d["appareil"], "quand": d["quand"], "reponse": d["reponse"]} if d else None,
                "appareils": appareils, "voix": profil["voix"], "dormir": profil["dormir"],
            }
            for haid, info in mem.items():
                if lecture is None or lecture(haid):
                    # Un ecran allume : le temps depuis le dernier tic s'ajoute a ce que l'ecran lit — sans toucher au
                    # compteur, que le tic tient —, sinon le decompte sautait d'une minute a chaque sondage (passe bis, 17/10).
                    depuis = self._allume_depuis.get(haid) if info["ecran"] else None
                    vu = self._avancer(etat, haid, depuis, t, dt) if depuis is not None else etat
                    lecteurs[haid] = vue_lecteur(ident, profil, vu, haid, info["ecran"], dt, t)
        return {"maintenant": t, "demarre": getattr(self, "demarrage", None) is not False, "simulation": self._simule(),
                "profils": profils, "lecteurs": lecteurs}

    async def async_enregistrer(self, patch: Any) -> dict[str, Any]:
        """`loggia/enfant/config` : le patch pose d'un seul tenant, sous le verrou du magasin (`poser_patch` refuse sans
        rien ecrire). Un patch vide relit la cle : le rechargement apres un import (rechargement.py)."""
        self.cfg = await self.store.async_modifier_shared(CLE, lambda brut: poser_patch(lire_config(brut), patch))
        await self._async_recenser()
        # Le plafond neuf s'applique a ce qui joue : un `volume_max` baisse a 25 ramene l'Echo a 30 % tout de suite
        # (passe bis, 17/10) — vers le bas seulement, et jamais pendant la fenetre de demarrage.
        self._regarder()
        await self._sauver()
        return self.cfg

    def _profil(self, ident: Any) -> tuple[dict[str, Any], dict[str, Any]]:
        profil = self.cfg["profils"].get(ident) if isinstance(ident, str) else None
        if profil is None or ident not in self.etats:
            raise ValueError("mode enfant : profil inconnu : %r" % (ident,))
        return profil, self.etats[ident]

    async def async_lever(self, ident: Any, minutes: Any, user: Any = None) -> dict[str, Any]:
        """`loggia/enfant/lever {profil, minutes}` : 30 leve les limites, 0 les retablit (E14)."""
        _profil, etat = self._profil(ident)
        t = time.time()
        self.etats[ident] = lever(etat, minutes, t)
        if minutes:
            await self._noter("levee", "limites levées", cibles=[], n=0, motif=("{n} min", {"n": minutes}))
        else:
            await self._noter("levee", "limites rétablies", cibles=[], n=0)
        await self._sauver()
        return await self.async_etat(user)

    async def async_repondre(self, ident: Any, accorder: bool, user: Any = None) -> dict[str, Any]:
        """`loggia/enfant/repondre {profil, accorder}` : la reponse depuis l'ecran (E13)."""
        _profil, etat = self._profil(ident)
        t = time.time()
        neuf = repondre(etat, bool(accorder), t, jour_de(self._now()))
        self.etats[ident] = neuf
        await self._noter("demande", "15 min accordées" if accorder else "demande refusée",
                          cibles=[neuf["demande"]["appareil"]], motif="depuis l’écran")
        await self._sauver()
        return await self.async_etat(user)

    async def async_demander(self, ident: Any, controle: Any = None, user: Any = None) -> dict[str, Any]:
        """`loggia/enfant/demander {profil}` : depuis la popup d'un ecran bloque par le TEMPS (pas au coucher) ; une a
        la fois ; elle part au telephone avec deux boutons dont l'identifiant porte un jeton a usage unique (E13)."""
        profil, etat = self._profil(ident)
        t, dt = time.time(), self._now()
        ecrans = [h for h, i in self.membres.get(ident, {}).items() if i["ecran"] and bloque(profil, etat, h, True, dt, t) == "temps"]
        if not ecrans:
            raise ValueError("mode enfant : aucun écran n'est bloqué par le temps")
        if controle is not None and not controle(ecrans[0]):
            raise PermissionError("pas le droit de piloter %s" % ecrans[0])
        jeton = secrets.token_urlsafe(16)
        self.etats[ident] = demander(etat, ecrans[0], t, jeton)
        nom = profil["nom"]
        appareil = self._nom(ecrans[0])
        langue = langue_serveur(self.hass)
        boutons = {"actions": [{"action": action_telephone(jeton, True), "title": traduire(BOUTON_ACCORDER, langue)},
                               {"action": action_telephone(jeton, False), "title": traduire(BOUTON_REFUSER, langue)}]}
        if self.regles is not None:
            await self.regles.prevenir(MODULE, "demande", (MSG_DEMANDE, {"nom": nom, "appareil": appareil}), titre=TITRE,
                                       data=boutons, simuler=self._simule())
        await self._noter("demande", "demande", cibles=[ecrans[0]], motif=("{n} min", {"n": 15}))
        await self._sauver()
        return await self.async_etat(user)

    async def async_dormir(self, ident: Any, son: Any, controle: Any = None, user: Any = None) -> dict[str, Any]:
        """`loggia/enfant/dormir {profil, son}` : la phrase du son choisi, dite a la jumelle HACS qui repond
        (`play_media custom`) ; le premier titre qui joue ensuite est garde jusqu'au matin (E10)."""
        profil, etat = self._profil(ident)
        if isinstance(son, bool) or not isinstance(son, int) or not 0 <= son < len(profil["phrases_dormir"]):
            raise ValueError("mode enfant : son inconnu : %r" % (son,))
        hacs = (self.soeurs.get(ident) or {}).get("hacs")
        st = self.hass.states.get(hacs) if hacs else None
        if st is None or str(st.state).lower() in MUET:
            raise ValueError("mode enfant : aucune jumelle qui réponde")
        if controle is not None and not controle(hacs):
            raise PermissionError("pas le droit de piloter %s" % hacs)
        phrase = profil["phrases_dormir"][son]
        self.etats[ident] = commencer_dormir(etat, time.time())
        # Un geste de la popup, pas une regle : il part meme en « Observer sans agir », avec le contexte du serveur.
        try:
            await self.hass.services.async_call("media_player", "play_media",
                                                {"entity_id": hacs, "media_content_type": "custom", "media_content_id": phrase},
                                                blocking=False, context=Context())
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Loggia enfant : la phrase pour dormir n'est pas partie")
        await self._noter("coucher", "son pour dormir", cibles=[hacs], detail=phrase)
        await self._sauver()
        return await self.async_etat(user)

    @callback
    def async_arreter(self) -> None:
        if self._sale:
            self.hass.async_create_task(self._sauver(force=True))
        self._arrete = True
        if self._au_demarrage:
            self._au_demarrage()
            self._au_demarrage = None
        if self._fenetre is not None:
            try:
                self._fenetre()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia enfant : fenetre de demarrage deja fermee")
            self._fenetre = None
        for cle in list(self._rdv):
            self._desarmer(cle)
        self._retirer_ecoute()
        if self._tic_retrait is not None:
            try:
                self._tic_retrait()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia enfant : tic deja retire")
            self._tic_retrait = None
        for defaire in self._defait:
            try:
                defaire()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia enfant : ecoute deja retiree")
        self._defait = []
        if self._defait_arret is not None:
            try:
                self._defait_arret()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia enfant : ecoute de l'arret deja retiree")
            self._defait_arret = None
