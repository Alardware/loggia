"""Depart et retour : la maison se met en veille quand elle se vide.

Pourquoi ce module existe
─────────────────────────
Partir en laissant les lumieres allumees et le chauffage a 21 degres est
l'oubli le plus courant de la domotique, et celui qui coute le plus cher. Home
Assistant sait qui est parti — il ne fait rien de cette information tant qu'on
ne l'a pas ecrit.

Ce qui se passe
───────────────
La derniere personne suivie quitte la maison. On attend le delai regle (cinq
minutes par defaut : un telephone qui accroche une autre antenne ne doit pas
vider la maison), puis on eteint les lumieres, on baisse le chauffage et on
arme l'alarme — chacun de ces trois gestes etant debrayable. Quelqu'un rentre :
on rend ce qu'on a pris.

Quatre precautions
──────────────────
  On ne rend que ce qu'on a pris. Les lumieres eteintes par la regle sont
  notees ; celles qui l'etaient deja ne se rallument pas au retour.

  On ne rallume pas en plein jour. Rentrer a quinze heures ne doit pas
  rallumer le salon. `sun.sun` tranche, et ce garde-fou se desactive.

  Le desarmement au retour est FERME par defaut, et il le reste tant que
  personne ne l'ouvre. Armer une alarme parce que la maison se vide est sans
  risque ; la desarmer parce qu'un telephone approche en est un, et ce choix
  doit etre fait en connaissance de cause.

  Un seul indice suffit (§10). Le telephone dit qui est parti, pas qui est
  reste. Pendant le decompte, un mouvement, une porte qui s'ouvre ou une
  lampe touchee a la main disent que quelqu'un est la : le decompte repart
  de zero, et le journal le dit une fois. Le depart n'est confirme qu'apres
  N minutes sans le moindre indice.
"""
from __future__ import annotations

import logging
import time
from typing import TYPE_CHECKING, Any

from homeassistant.core import HomeAssistant, callback

from .const import DOMAIN
from .lumieres_maison import (a_epargner, async_interrupteurs_declares, async_veilleuses, attributs_des_lumieres,
                              lumieres_de_la_maison, par_service, registre_de)
from .regles import demarrer, entites_propres, est_entite, niveau
from .unites import depuis_celsius, unite_temperature

if TYPE_CHECKING:  # l'annotation seule — les tests chargent ce module hors paquet
    from .store import LoggiaStore

_LOGGER = logging.getLogger(__name__)

CLE = "loggia_presence"
SOLEIL = "sun.sun"

# Un capteur muet ne prouve pas une absence : un telephone eteint n'est pas
# une maison vide.
MUETS = {"unavailable", "unknown", "none", ""}

# Ce qui trahit une presence sans telephone : un mouvement, une porte ou une
# fenetre qui s'ouvre. Par `device_class`, jamais par nom (critere 1).
INDICES = {"motion": "mouvement", "occupancy": "mouvement", "presence": "mouvement",
           "door": "ouverture", "window": "ouverture", "opening": "ouverture",
           "garage_door": "ouverture"}

# Le motif du journal, par genre d'indice — ceux d'INDICES, et « main » —
# ecrit EN ENTIER : c'est sa cle au catalogue de l'ecran (ADR 0070).
# Recompose a partir du genre, il n'etait ecrit nulle part, ni donc traduit,
# et le journal le montrait en francais dans les sept langues (relecture du
# 03/10). Un genre inconnu se dit « mouvement », comme dans `_sur_indice`.
MOTIFS_INDICE = {"mouvement": "mouvement : {nom}", "ouverture": "ouverture : {nom}",
                 "main": "main : {nom}"}

DEFAUT: dict[str, Any] = {
    "actif": False,
    "delai_depart": 5,
    "personnes": [],
    "depart": {"lumieres": True,
               "chauffage": {"actif": False, "consigne": 17, "confort": 20},
               "alarme": {"actif": False, "entite": "", "mode": "away"}},
    "retour": {"lumieres": False, "seulement_la_nuit": True,
               "chauffage": True, "desarmer": False},
    # Un seul indice suffit (§10) : les capteurs de mouvement et d'ouverture,
    # et les mains. Actif d'emblee — c'est ce qui rend le depart fiable.
    "indices": {"actif": True, "mains": True},
    # Le mode invite (ADR 0016) : un `input_boolean` DESIGNE, qui appartient a
    # Home Assistant. Allume, la maison n'est jamais vide.
    "invite": {"entite": ""},
    # Observer sans agir : la regle note ce qu'elle aurait fait.
    "simulation": {"actif": False},
}

# Le mode invite se coupe seul, trente minutes apres le retour d'un habitant :
# l'invite est parti ou n'est plus seul, la maison peut se remettre en veille.
INVITE_COUPURE = 30 * 60

MODES_ALARME = {"away": "alarm_arm_away", "home": "alarm_arm_home",
                "night": "alarm_arm_night", "vacation": "alarm_arm_vacation"}

# Le palier « presence » de l'echelle : au-dessus de la nuit et du confort,
# sous la surete. Le depart TIENT ce qu'il eteint et ce qu'il baisse, jusqu'au
# retour : la veilleuse ou l'eclairage doux ne rallument pas une maison vide.
PRIORITE = niveau("presence")

# Le registre change par rafales : on se reabonne une fois, un peu apres
# (audit du 19/10, M4). Le delai laisse a l'entite neuve le temps d'ecrire son
# premier etat — c'est lui qui dit si c'est un indice (`device_class`).
DELAI_REGISTRE = 5.0


def tous_absents(etats: dict, personnes) -> bool:
    """La maison est-elle vide ?

    Il faut au moins une personne SUIVIE et joignable pour l'affirmer : sans
    cela, une installation sans suivi de presence — ou dont tous les
    telephones sont muets — se croirait vide en permanence et s'eteindrait
    toute seule.
    """
    vus = 0
    for haid in personnes or []:
        st = etats.get(haid)
        if st is None:
            continue
        valeur = str(getattr(st, "state", "")).lower()
        if valeur in MUETS:
            continue
        vus += 1
        if valeur == "home":
            return False
    return vus > 0


def quelquun_est_la(etats: dict, personnes) -> bool:
    """Quelqu'un est-il RENTRE ? Il faut un `home` franc.

    C'est la question inverse de `tous_absents`, et ce n'en est surtout pas la
    negation. Les deux repondent « non » quand plus aucun telephone ne repond :
    la maison n'est alors ni declaree vide, ni declaree habitee — on ne sait
    pas, et on ne fait rien.

    La distinction n'est pas theorique. `tous_absents` rend `False` aussi bien
    parce que quelqu'un est la que parce qu'on n'en sait rien ; le retour, qui
    DESARME l'alarme, lisait ce `False` comme un retour. Une maison armee et
    vide se desarmait donc toute seule des que la box tombait et que les
    telephones cessaient d'etre joignables (audit du 29/09/2026).
    """
    for haid in personnes or []:
        st = etats.get(haid)
        if st is None:
            continue
        if str(getattr(st, "state", "")).lower() == "home":
            return True
    return False


def invite_present(etats, entite) -> bool:
    """Le mode invite est-il allume ? Seul un `on` franc compte : un
    interrupteur muet ou absent ne garde personne."""
    if not entite or not isinstance(entite, str):
        return False
    st = etats.get(entite) if etats is not None else None
    return st is not None and str(getattr(st, "state", "")).lower() == "on"


def fait_nuit(etat_soleil) -> bool:
    """Le soleil est-il couche ? Sans `sun.sun`, on suppose qu'il fait jour.

    Se tromper vers le jour ne fait qu'omettre un rallumage ; se tromper vers
    la nuit rallumerait la maison en plein apres-midi.
    """
    if etat_soleil is None:
        return False
    return str(getattr(etat_soleil, "state", "")).lower() == "below_horizon"


def genre_indice(etat) -> str | None:
    """« mouvement », « ouverture » — ou None si ce capteur n'en est pas un."""
    attrs = (getattr(etat, "attributes", None) or {}) if etat is not None else {}
    return INDICES.get(str(attrs.get("device_class") or "").lower())


def indice_dit_oui(etat) -> bool:
    """Un capteur d'indice ne dit quelque chose que quand il est a `on` :
    retomber, ou se taire, n'est pas un indice."""
    return etat is not None and str(getattr(etat, "state", "")).lower() == "on"


class LoggiaPresence:
    """Met la maison en veille quand elle se vide, et la reveille au retour."""

    # Valeur de CLASSE : un objet bati sans passer par `__init__` - ce que
    # font les tests - la trouve quand meme. Les interrupteurs declares
    # lumieres, relus avant chaque geste qui les commande.
    _interrupteurs: frozenset = frozenset()

    # Ce que le constructeur pose apres coup (audit du 19/10, M4) : des valeurs
    # simples, que chaque instance remplace par les siennes.
    _au_demarrage = None
    _defait_registre = None
    _reabonnement = None
    _arrete = False

    def __init__(self, hass: HomeAssistant, store: "LoggiaStore", regles=None) -> None:
        self.hass = hass
        self.store = store
        # Le socle commun : journal, geste manuel, priorites, simulation.
        self.regles = regles
        self.cfg: dict[str, Any] = {}
        # Ce qu'on a eteint en partant : {entite: etat d'avant}. En memoire
        # seule — apres un redemarrage, Loggia ne pretend pas savoir.
        self.eteintes: dict[str, str] = {}
        # Les consignes de chauffage d'AVANT le depart : {entite: temperature}.
        # Le retour les remet telles quelles — pas a un defaut. Memes regles
        # que `eteintes` : en memoire, et apres un redemarrage on ne remet rien
        # plutot que d'inventer.
        self.consignes: dict[str, float] = {}
        self.dehors = False
        self._minuteur = None
        # Le dernier indice vu, pour l'ecran : {"entite", "nom", "genre", "ts"}.
        self.dernier_indice: dict[str, Any] | None = None
        # Une ligne de journal par decompte, pas une par mouvement.
        self._indice_note = False
        # Le mode invite (ADR 0016) : la coupure programmee, et si la maison
        # etait vide a l'evaluation precedente — c'est le RETOUR d'un
        # habitant qui lance la demi-heure, pas sa presence.
        self._minuteur_invite = None
        self._absents_avant: bool | None = None
        self._defait: list[Any] = []
        # Le rattrapage, une fois Home Assistant demarre (audit du 19/10).
        self._au_demarrage = None
        demarrer(hass, self, self._async_demarrer(), "presence")

    async def _async_demarrer(self) -> None:
        self.cfg = await self.async_config()
        await self._async_reabonner()
        # `dehors` n'est qu'en memoire : apres un redemarrage pendant l'absence, le
        # premier evenement serait le RETOUR, lu avec `dehors` faux — la maison
        # restait en Absence. On fait le point une fois Home Assistant demarre, les
        # personnes relues (audit du 19/10). Les indices aussi s'y relisent
        # (audit des capteurs du 19/10, M4) : au setup, Zigbee n'a souvent pas
        # encore cree ses capteurs de mouvement, et rien ne les reposait.
        from homeassistant.helpers.start import async_at_started

        self._au_demarrage = async_at_started(self.hass, self._async_rattraper)

    async def _async_rattraper(self, _hass=None) -> None:
        """Le point au demarrage. La maison est VIDE : on l'evalue comme a chaque
        changement — le depart se rearme, et le retour se verra. Quelqu'un est LA
        (rentre pendant le redemarrage) : seule l'Absence que la presence avait
        posee au chauffage se leve ; lumieres et alarme, on ne sait pas ce que le
        depart en avait fait, on n'y touche pas.

        D'abord, l'ecoute du registre, une fois, et les abonnements reposes sur
        ce qui existe maintenant (audit des capteurs du 19/10, M4)."""
        self._au_demarrage = None
        if self._arrete:
            return
        bus = getattr(self.hass, "bus", None)
        if bus is not None and self._defait_registre is None:
            self._defait_registre = bus.async_listen("entity_registry_updated", self._sur_registre)
        await self._async_reabonner()
        if not self.cfg.get("actif"):
            return
        etats = self._etats()
        invite = self._invite_present()
        if tous_absents(etats, self.cfg.get("personnes")) and not invite:
            await self._async_evaluer()
            return
        if not (quelquun_est_la(etats, self.cfg.get("personnes")) or invite):
            return                                  # on ne sait pas : on ne fait rien
        if not (self.cfg.get("retour") or {}).get("chauffage"):
            return
        chef = self._chef()
        if chef is None or not chef.absence_par_presence():
            return
        try:
            await chef.async_presence(False, simuler=self._simule())
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Loggia presence : le moteur du chauffage n'a pas pris le retour")

    @callback
    def _sur_registre(self, event) -> None:
        """Un capteur arrive, part ou change de nom : on se reabonne — une
        fois par rafale, un peu apres. Un capteur de mouvement appaire apres
        le demarrage devient un indice (audit du 19/10, M4)."""
        d = getattr(event, "data", None) or {}
        haid = str(d.get("entity_id") or "")
        if self._arrete or self._reabonnement is not None or not haid.startswith("binary_sensor."):
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
                _LOGGER.debug("Loggia presence : abonnement deja retire")
        self._defait.clear()
        self._declarer()
        if not self.cfg.get("actif"):
            return
        suivis = list(self.cfg.get("personnes") or [])
        # L'interrupteur du mode invite (ADR 0016) : le basculer, d'ou que ce
        # soit, revalue la maison comme le ferait un telephone.
        invite = self._invite_entite()
        if invite:
            suivis.append(invite)
        if not suivis:
            return
        from homeassistant.helpers.event import async_track_state_change_event

        self._defait.append(
            async_track_state_change_event(self.hass, suivis, self._sur_personne)
        )
        # En debug (relecture du lot 2, point 7) : une rafale du registre
        # reabonne la presence, le journal de HA n'a pas a l'ecrire a chaque fois.
        _LOGGER.debug("Loggia presence : %d personnes suivies", len(suivis))
        # Les indices (§10) : les capteurs de mouvement et d'ouverture, et les
        # mains que le socle voit passer.
        ind = self.cfg.get("indices") or {}
        if ind.get("actif", True):
            capteurs = self._capteurs_indices()
            if capteurs:
                self._defait.append(
                    async_track_state_change_event(self.hass, capteurs, self._sur_indice)
                )
        if ind.get("mains", True):
            self._defait.append(self.regles.ecouter_mains(self._sur_main))

    @callback
    def _sur_personne(self, _event) -> None:
        self.hass.async_create_task(self._async_evaluer())

    @callback
    def _sur_indice(self, event) -> None:
        """Un capteur de mouvement ou d'ouverture vient de passer a `on`."""
        data = getattr(event, "data", None) or {}
        nouveau = data.get("new_state")
        # Un passage, pas un etat : `on` qui reste `on` (un attribut qui bouge)
        # n'est pas un nouvel indice.
        if not indice_dit_oui(nouveau) or indice_dit_oui(data.get("old_state")):
            return
        haid = data.get("entity_id") or ""
        self._indice(haid, genre_indice(nouveau) or "mouvement")

    def _sur_main(self, haid: str) -> None:
        """Le socle a vu une main se poser sur une entite pilotee."""
        self._indice(haid, "main")

    def _indice(self, haid: str, genre: str) -> None:
        """Quelqu'un est la. Pendant le decompte, il repart de zero (§10).

        Hors decompte, rien : la maison en veille ne se reveille que par un
        retour — un chat devant le capteur ne rallume pas le salon.
        """
        self.dernier_indice = {"entite": haid, "nom": self._nom(haid), "genre": genre,
                               "ts": time.time()}
        if self._minuteur is None:
            return
        self._desarmer()
        self.hass.async_create_task(self._async_reporter(haid, genre))

    async def _async_reporter(self, haid: str, genre: str) -> None:
        # Une ligne par decompte : un capteur qui voit passer quelqu'un toutes
        # les trente secondes remplirait le journal pour rien.
        if not self._indice_note:
            self._indice_note = True
            await self.regles.noter("presence", "depart", "reporter", n=0,
                                    motif=(MOTIFS_INDICE.get(genre, "mouvement : {nom}"),
                                           {"nom": self._nom(haid)}))
        await self._async_armer_depart(relance=True)

    # ── Les lumieres de la maison (lumieres_maison, audit du 19/10) ────────
    async def _async_relire_interrupteurs(self) -> None:
        """Les interrupteurs declares lumieres, relus au magasin : `_declarer`
        est synchrone, il lit la copie."""
        self._interrupteurs = frozenset(await async_interrupteurs_declares(self.store))

    def _lumieres(self) -> tuple[dict[str, dict[str, Any]], list[str]]:
        """({haid: attributs}, les lumieres de la maison) - la definition
        commune a toutes les regles : ni la LED d'une borne (`config`), ni une
        lampe cachee ; l'interrupteur declare lumiere compris ; un groupe
        s'efface devant ses membres. Des etats illisibles levent."""
        attributs = attributs_des_lumieres(self.hass, self._interrupteurs)
        return attributs, lumieres_de_la_maison(attributs, registre_de(self.hass), self._interrupteurs)

    def _declarer(self) -> None:
        """Declare au socle ce que le depart pilote : les lumieres de la
        maison, les chauffages, l'alarme. Rappele a chaque evaluation — les
        entites peuvent ne pas exister au demarrage."""
        pilotes = []
        if self.cfg.get("actif"):
            try:
                pilotes += self._lumieres()[1]
            except Exception:  # noqa: BLE001
                _LOGGER.warning("Loggia presence : lampes illisibles, le depart ne les suivra pas", exc_info=True)
            pilotes += self._climats()
            entite = ((self.cfg.get("depart") or {}).get("alarme") or {}).get("entite")
            if entite:
                pilotes.append(entite)
            # L'interrupteur invite aussi : une main qui le rallume le gele,
            # et la coupure automatique ne se battra pas contre elle.
            invite = self._invite_entite()
            if invite:
                pilotes.append(invite)
        self.regles.suivre("presence", pilotes)

    async def _async_evaluer(self) -> None:
        if not self.cfg.get("actif"):
            return
        await self._async_relire_interrupteurs()
        self._declarer()
        etats = self._etats()
        absents = tous_absents(etats, self.cfg.get("personnes"))
        invite = self._invite_present()
        # Le mode invite (ADR 0016) : quelqu'un garde la maison sans telephone
        # suivi. Allume, la maison n'est jamais vide.
        vide = absents and not invite
        # Le RETOUR demande un signe FRANC — un `home`, ou le mode invite —, et
        # non plus la simple absence de signe : sans telephone joignable, la
        # maison restait « rentree » et l'alarme se desarmait toute seule.
        rentre = quelquun_est_la(etats, self.cfg.get("personnes")) or invite
        if vide and not self.dehors:
            await self._async_armer_depart()
        elif not vide:
            self._desarmer()
            if self.dehors and rentre:
                self.dehors = False
                await self._async_retour()
        # Un habitant RENTRE pendant le mode invite : le mode se coupera seul
        # une demi-heure plus tard. Reparti entre-temps, ou mode eteint : on
        # n'en parle plus.
        if invite and not absents and self._absents_avant:
            self._armer_coupure_invite()
        elif absents or not invite:
            self._desarmer_invite()
        self._absents_avant = absents

    # ── Le mode invite (ADR 0016) ──────────────────────────────────────────
    def _invite_entite(self) -> str:
        e = (self.cfg.get("invite") or {}).get("entite")
        return e if isinstance(e, str) else ""

    def _invite_present(self) -> bool:
        return invite_present(self.hass.states, self._invite_entite())

    def _armer_coupure_invite(self) -> None:
        if self._minuteur_invite is not None:
            return
        from homeassistant.helpers.event import async_call_later

        @callback
        def echu(_now):
            self._minuteur_invite = None
            self.hass.async_create_task(self._async_couper_invite())

        self._minuteur_invite = async_call_later(self.hass, INVITE_COUPURE, echu)

    def _desarmer_invite(self) -> None:
        annule, self._minuteur_invite = self._minuteur_invite, None
        if annule:
            try:
                annule()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia presence : coupure invite deja passee")

    async def _async_couper_invite(self) -> None:
        """La demi-heure est passee : l'habitant est toujours la, l'invite ne
        garde plus rien. Par le socle : une main qui a rallume l'interrupteur
        entre-temps le gele, et il reste allume."""
        entite = self._invite_entite()
        if not entite or not self._invite_present():
            return
        if tous_absents(self._etats(), self.cfg.get("personnes")):
            return
        await self._async_service("input_boolean", "turn_off", [entite],
                                  regle="invite", quoi="couper",
                                  motif="un habitant est rentre depuis 30 min")

    async def _async_armer_depart(self, relance: bool = False) -> None:
        """Le delai avant de vider la maison.

        Un telephone qui accroche une autre antenne se declare absent quelques
        secondes ; sans ce delai, la maison s'eteindrait sous le nez de qui
        vient de rentrer.
        """
        if self._minuteur is not None:
            return
        # Un decompte neuf a droit a sa ligne « reporter » ; une relance apres
        # un indice, non.
        if not relance:
            self._indice_note = False
        try:
            delai = max(0, int(self.cfg.get("delai_depart", 5))) * 60
        except (TypeError, ValueError):
            delai = 300
        if delai == 0:
            await self._async_depart()
            return
        from homeassistant.helpers.event import async_call_later

        @callback
        def echu(_now):
            self._minuteur = None
            self.hass.async_create_task(self._async_depart())

        self._minuteur = async_call_later(self.hass, delai, echu)

    def _desarmer(self) -> None:
        annule, self._minuteur = self._minuteur, None
        if annule:
            try:
                annule()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia presence : minuteur deja passe")

    # ── Le depart ──────────────────────────────────────────────────────────
    async def _async_depart(self) -> None:
        etats = self._etats()
        # Quelqu'un a pu rentrer pendant le decompte — ou allumer le mode invite.
        if not tous_absents(etats, self.cfg.get("personnes")) or self._invite_present():
            return
        self.dehors = True
        d = self.cfg.get("depart") or {}

        if d.get("lumieres"):
            allumees = await self._async_allumees()
            if allumees:
                # Ne retenir que ce qui est vraiment parti : une lampe sous la
                # main de quelqu'un n'a pas ete eteinte, et n'est pas a rallumer.
                # Par service (lumieres_maison) : l'interrupteur declare lumiere
                # recoit `homeassistant.turn_off`, pas `light.turn_off`.
                partis: list = []
                for domaine, service, lot in par_service(allumees, False):
                    partis += await self._async_service(domaine, service, lot,
                                                        regle="depart", quoi="eteindre",
                                                        motif="maison vide", tenir=True,
                                                        jusqu_a_relacher=True)
                self.eteintes = {haid: "on" for haid in partis}

        chauffage = d.get("chauffage") or {}
        if chauffage.get("actif"):
            # Un chauffage au planning allume n'a qu'un chef : le moteur. La
            # presence lui donne le fait — la maison se vide — et il met la
            # maison en Absence s'il le faut (chantier Chauffage, § 6). Une panne
            # du moteur ne prive ni de l'alarme ni du reste du depart (relecture
            # finale du 12/10) : elle s'ecrit au journal de Home Assistant.
            chef = self._chef()
            if chef is not None:
                try:
                    await chef.async_presence(True, simuler=self._simule())
                except Exception:  # noqa: BLE001
                    _LOGGER.exception("Loggia presence : le moteur du chauffage n'a pas pris le depart")
            cibles = [h for h in self._climats() if chef is None or not chef.pilote(h)]
            if cibles:
                try:
                    consigne = float(chauffage.get("consigne", 17))
                except (TypeError, ValueError):
                    consigne = 17.0
                # Les consignes d'AVANT, pour les remettre telles quelles.
                avant: dict[str, float] = {}
                for haid in cibles:
                    st = self.hass.states.get(haid)
                    t = ((getattr(st, "attributes", None) or {}).get("temperature")
                         if st is not None else None)
                    if isinstance(t, (int, float)) and not isinstance(t, bool):
                        avant[haid] = float(t)
                partis = await self._async_service("climate", "set_temperature", cibles,
                                                   {"temperature": consigne},
                                                   regle="depart", quoi="baisser",
                                                   motif="maison vide", tenir=True,
                                                   jusqu_a_relacher=True)
                self.consignes = {haid: avant[haid] for haid in partis if haid in avant}

        alarme = d.get("alarme") or {}
        if alarme.get("actif") and alarme.get("entite"):
            service = MODES_ALARME.get(str(alarme.get("mode") or "away"), "alarm_arm_away")
            await self._async_service("alarm_control_panel", service, [alarme["entite"]],
                                      regle="depart", quoi="armer", motif="maison vide")

    async def _async_allumees(self) -> list:
        """Les lumieres de la maison allumees en ce moment - moins ce qu'on
        epargne : les veilleuses de la regle Nuit, et le groupe qui en contient
        une (sa decision du 19/10 : les veilleuses sont epargnees partout)."""
        await self._async_relire_interrupteurs()
        try:
            attributs, lumieres = self._lumieres()
        except Exception:  # noqa: BLE001
            _LOGGER.warning("Loggia presence : lampes illisibles, rien ne sera eteint au depart", exc_info=True)
            return []
        epargnees = a_epargner(attributs, await async_veilleuses(self.store))
        return [h for h in lumieres if h not in epargnees
                and str(getattr(self.hass.states.get(h), "state", "")).lower() == "on"]

    def _capteurs_indices(self) -> list:
        """Les capteurs de mouvement et d'ouverture de la maison, par `device_class`."""
        try:
            ids = self.hass.states.async_entity_ids("binary_sensor")
        except Exception:  # noqa: BLE001
            _LOGGER.warning("Loggia presence : capteurs illisibles", exc_info=True)
            return []
        return [i for i in sorted(ids) if genre_indice(self.hass.states.get(i))]

    def _nom(self, haid: str) -> str:
        st = self.hass.states.get(haid)
        nom = ((getattr(st, "attributes", None) or {}).get("friendly_name")
               if st is not None else None)
        return str(nom) if nom else haid

    def _climats(self) -> list:
        try:
            return sorted(self.hass.states.async_entity_ids("climate"))
        except Exception:  # noqa: BLE001
            _LOGGER.warning("Loggia presence : thermostats illisibles", exc_info=True)
            return []

    # ── Le retour ──────────────────────────────────────────────────────────
    async def _async_retour(self) -> None:
        r = self.cfg.get("retour") or {}

        if r.get("lumieres") and self.eteintes:
            # On ne rallume pas en plein jour : rentrer a quinze heures ne doit
            # pas rallumer le salon.
            if r.get("seulement_la_nuit", True) and not fait_nuit(self.hass.states.get(SOLEIL)):
                self.eteintes = {}
            else:
                etats = self._etats(list(self.eteintes))
                # On ne rend que ce qu'on a pris — et qu'on tient encore : une
                # lampe rallumee entre temps par quelqu'un d'autre, ou prise par
                # une regle plus forte, n'est pas notre affaire.
                a_rendre = [h for h in sorted(self.eteintes)
                            if str(getattr(etats.get(h), "state", "")).lower() == "off"
                            and self.regles.tient("presence", "depart", h)]
                # Chacun par son service (lumieres_maison) : l'interrupteur
                # declare lumiere par `homeassistant.turn_on`.
                for domaine, service, lot in par_service(a_rendre, True):
                    await self._async_service(domaine, service, lot,
                                              regle="retour", quoi="rallumer", motif="retour")
                self.eteintes = {}

        if r.get("chauffage"):
            chef = self._chef()
            if chef is not None:
                # Comme au depart : une panne du moteur ne retient ni les consignes ni l'alarme.
                try:
                    await chef.async_presence(False, simuler=self._simule())
                except Exception:  # noqa: BLE001
                    _LOGGER.exception("Loggia presence : le moteur du chauffage n'a pas pris le retour")

        if r.get("chauffage") and self.consignes:
            # Les consignes d'AVANT le depart, telles quelles — pas un defaut,
            # qui ecraserait un reglage fait a la main. Groupees par valeur :
            # un appel par temperature, pas un par radiateur.
            par_valeur: dict[float, list] = {}
            for haid, t in self.consignes.items():
                if self.regles.tient("presence", "depart", haid):
                    par_valeur.setdefault(t, []).append(haid)
            for t, haids in sorted(par_valeur.items()):
                await self._async_service("climate", "set_temperature", sorted(haids),
                                          {"temperature": t},
                                          regle="retour", quoi="remettre", motif="retour")
            self.consignes = {}

        alarme = (self.cfg.get("depart") or {}).get("alarme") or {}
        if r.get("desarmer") and alarme.get("entite"):
            await self._async_service("alarm_control_panel", "alarm_disarm", [alarme["entite"]],
                                      regle="retour", quoi="desarmer", motif="retour")

        # Tout ce que le depart tenait est rendu — meme ce qu'on n'a pas remis.
        self.regles.relacher("presence")

    # ── Outils ─────────────────────────────────────────────────────────────
    def _chef(self):
        """Le moteur du chauffage, cherche au moment de servir — comme
        `rechargement.py` : un rechargement de l'integration le rebatit."""
        data = getattr(self.hass, "data", None)
        return (data.get(DOMAIN) or {}).get("chauffage") if isinstance(data, dict) else None

    def _etats(self, ids=None) -> dict:
        if ids is None:
            ids = list(self.cfg.get("personnes") or [])
        return {haid: self.hass.states.get(haid) for haid in ids}

    async def _async_service(self, domaine: str, service: str, cibles: list, extra=None, *,
                             regle: str = "", quoi: str = "", motif: str = "",
                             tenir: bool = False, jusqu_a_relacher: bool = False) -> list:
        """Commande par le socle : il ecarte ce qu'une main tient, et note."""
        return await self.regles.agir("presence", regle, domaine, service, cibles, extra,
                                      quoi=quoi or service, motif=motif,
                                      priorite=PRIORITE, tenir=tenir,
                                      jusqu_a_relacher=jusqu_a_relacher, simuler=self._simule())

    def _simule(self) -> bool:
        """Observer sans agir : la regle note, rien ne bouge."""
        return bool((self.cfg.get("simulation") or {}).get("actif"))

    def _repartir_de_zero(self) -> None:
        """Du simule au reel, ou l'inverse : la regle repart de ce que la
        maison EST. Un depart simule laissait `dehors` vrai, et le vrai
        depart suivant n'aurait rien eteint."""
        self._desarmer()
        self._desarmer_invite()
        self._absents_avant = None
        self.eteintes = {}
        self.consignes = {}
        self.dehors = False
        self._indice_note = False
        self.regles.relacher("presence")

    # ── Ce que l'interface lit et ecrit ────────────────────────────────────
    async def async_config(self) -> dict[str, Any]:
        return self._config_de(await self.store.async_get_shared(CLE, None))

    def _config_de(self, brut: Any) -> dict[str, Any]:
        """La configuration, defauts compris. Synchrone : `async_enregistrer`
        la rebatit sous le verrou du magasin (lot 15 de l'audit du 03/10)."""
        cfg = {}
        for k, v in DEFAUT.items():
            if isinstance(v, dict):
                cfg[k] = {kk: (dict(vv) if isinstance(vv, dict) else vv) for kk, vv in v.items()}
            elif isinstance(v, list):
                cfg[k] = list(v)
            else:
                cfg[k] = v
        # Les defauts de chauffage (17, 20) sont penses en Celsius ; une
        # installation jamais configuree et reglee en Fahrenheit merite une
        # proposition dans SA langue, pas un ordre de chauffer trois fois plus
        # fort que prevu. Une valeur deja enregistree vient de `brut` plus bas
        # et n'est jamais touchee ici : le frontend l'a deja ecrite en reel.
        unite = unite_temperature(self.hass)
        if unite == "F":
            chauffage = cfg["depart"]["chauffage"]
            chauffage["consigne"] = round(depuis_celsius(chauffage["consigne"], "F"))
            chauffage["confort"] = round(depuis_celsius(chauffage["confort"], "F"))
        if isinstance(brut, dict):
            for k, v in brut.items():
                if k not in cfg:
                    continue
                if isinstance(cfg[k], dict) and isinstance(v, dict):
                    for kk, vv in v.items():
                        if isinstance(cfg[k].get(kk), dict) and isinstance(vv, dict):
                            cfg[k][kk].update(vv)
                        else:
                            cfg[k][kk] = vv
                else:
                    cfg[k] = v
        self._nettoyer(cfg)
        return cfg

    @staticmethod
    def _nettoyer(cfg: dict[str, Any]) -> None:
        """Seulement des identifiants d'entite (audit du 19/10, M24) : les
        personnes suivies, l'interrupteur invite, l'alarme du depart. Ce qui
        n'en est pas un est ecarte — jamais ecrit, et une configuration deja
        abimee se relit propre. Un entier parmi les personnes faisait lever
        l'abonnement, au redemarrage aussi."""
        cfg["personnes"] = entites_propres(cfg.get("personnes"))
        for section, cle in (("invite", None), ("depart", "alarme")):
            bloc = cfg.get(section)
            if cle is not None:
                bloc = bloc.get(cle) if isinstance(bloc, dict) else None
            if isinstance(bloc, dict) and "entite" in bloc and not est_entite(bloc["entite"]):
                bloc["entite"] = ""

    async def async_etat(self) -> dict[str, Any]:
        return {
            "config": self.cfg or await self.async_config(),
            "dehors": self.dehors,
            "en_attente": self._minuteur is not None,
            "eteintes": sorted(self.eteintes),
            "consignes": dict(self.consignes),
            # Les indices (§10) : ce que la maison sait voir, et le dernier vu.
            "indices": {"capteurs": self._capteurs_indices(),
                        "dernier": dict(self.dernier_indice) if self.dernier_indice else None},
            # Le mode invite (ADR 0016) : l'interrupteur, s'il garde la maison
            # en ce moment, et si sa coupure est programmee.
            "invite": {"entite": self._invite_entite(), "present": self._invite_present(),
                       "coupure_prevue": self._minuteur_invite is not None},
            "journal": await self.regles.journal(limite=40, module="presence"),
        }

    def _poser_patch(self, cfg: dict[str, Any], patch: dict[str, Any]) -> None:
        """Le patch de l'ecran, pose sur `cfg`. Synchrone : sous le verrou."""
        for k, v in (patch or {}).items():
            if k not in cfg:
                continue
            if isinstance(cfg[k], dict) and isinstance(v, dict):
                for kk, vv in v.items():
                    if isinstance(cfg[k].get(kk), dict) and isinstance(vv, dict):
                        cfg[k][kk].update(vv)
                    else:
                        cfg[k][kk] = vv
            else:
                cfg[k] = v
        # Ce qui n'est pas une entite est ecarte, jamais ecrit (audit du 19/10, M24).
        self._nettoyer(cfg)

    async def async_enregistrer(self, patch: dict[str, Any]) -> dict[str, Any]:
        # D'un seul tenant, sous le verrou du magasin (lot 15 de l'audit du
        # 03/10 ; voir store.async_modifier_shared).
        simulait = False

        def changer(brut: Any) -> dict[str, Any]:
            nonlocal simulait
            cfg = self._config_de(brut)
            simulait = bool((cfg.get("simulation") or {}).get("actif"))
            self._poser_patch(cfg, patch)
            return cfg

        cfg = await self.store.async_modifier_shared(CLE, changer)
        self.cfg = cfg
        if bool((cfg.get("simulation") or {}).get("actif")) != simulait:
            self._repartir_de_zero()
        # Coupee, la regle rend ce qu'elle tenait : ses tenues n'ont plus
        # d'echeance (le depart tient jusqu'au retour), un retour qui ne
        # viendra plus les laisserait jusqu'au redemarrage (03/10).
        if not cfg.get("actif"):
            self.regles.relacher("presence")
        await self._async_reabonner()
        return cfg

    @callback
    def async_arreter(self) -> None:
        # L'attente du demarrage, l'ecoute du registre et le reabonnement en
        # attente partent avec le reste (audit du 19/10, M4).
        self._arrete = True
        for nom in ("_au_demarrage", "_defait_registre", "_reabonnement"):
            defaire = getattr(self, nom, None)
            if defaire is not None:
                try:
                    defaire()
                except Exception:  # noqa: BLE001
                    _LOGGER.debug("Loggia presence : %s deja retire", nom)
                setattr(self, nom, None)
        self._desarmer()
        self._desarmer_invite()
        annule, self._au_demarrage = getattr(self, "_au_demarrage", None), None
        if annule:
            annule()
        for defaire in self._defait:
            try:
                defaire()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia presence : desabonnement sans effet")
        self._defait.clear()
