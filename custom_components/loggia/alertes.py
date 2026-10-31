"""Alertes de surete : le telephone, et la maison qui reagit.

Le dashboard peut etre ferme, l'onglet endormi : c'est donc le COMPOSANT qui
ecoute les changements d'etat et appelle notify.*. La configuration vit dans la
partie commune du store (cle `loggia_alertes`), ecrite par un administrateur
depuis Parametres ; sans configuration, ou sans service choisi, rien ne part —
fail-safe.

Forme de la configuration :
  {
    "actif": true,
    "service": "mobile_app_iphone",          # le service notify, sans prefixe
    "categories": {"fumee": true, "gaz": true, "co": true, "fuite": true,
                    "alarme": true, "portes": false},
    "cooldown_min": 5,
    "actions": {"actif": true, "lumieres": true, "volets": true,
                "vanne": {"actif": true, "entite": ""}}
  }

Les categories sont reconnues par device_class, jamais par identifiant : le
composant reste installable chez n'importe qui.

L'envoi passe par le socle des regles (`regles.prevenir`), et c'est la que se
joue ce qui compte : le danger — fumee, gaz, monoxyde, fuite, alarme — part en
CRITIQUE, par-dessus le mode silencieux du telephone et les heures calmes.
L'ouverture pendant que l'alarme est armee, elle, attend son heure comme les
autres.

La moitie « action » de §18 : sur un danger, la maison reagit d'elle-meme.
  fumee, monoxyde, alarme  → toutes les lumieres a 100 % ;
  fumee, monoxyde, gaz     → les volets remontes — les issues, et l'acces des
                             secours. Pas de lumiere sur le gaz : un relais
                             qui claque est une etincelle ;
  fuite                    → la vanne d'eau coupee : celle qu'on a choisie,
                             sinon TOUTES les vannes d'eau (I30, 25/10).
Tout cela en tete de l'echelle (surete), tenu tant que le danger dure. Quand
il passe, la maison revient a l'etat d'avant — sauf la vanne, qui reste
coupee jusqu'a ce qu'une main la rouvre : une fuite s'inspecte (ADR 0022).

Audit des capteurs du 19/10 (ADR 0250) : la surete AGIT toujours, meme en
« Observer sans agir » ; une categorie decochee coupe aussi la reaction ; un
danger deja la au demarrage est traite ; un retour depuis un etat muet n'est
pas un evenement neuf ; un detecteur muet depuis un quart d'heure se dit.
"""
from __future__ import annotations

import logging
import time
from typing import TYPE_CHECKING, Any

from homeassistant.core import Event, HomeAssistant, callback

from .const import DOMAIN
from .lumieres_maison import async_interrupteurs_declares, lumieres_de_la_maison, par_service, registre_de
from .ouvrants import CLASSES_VOLETS, STORE_BANNE, ouvre_et_ferme
from .regles import niveau

if TYPE_CHECKING:  # l'annotation seule — les tests chargent ce module hors paquet
    from .store import LoggiaStore

_LOGGER = logging.getLogger(__name__)

CLE_CONFIG = "loggia_alertes"

# Ce qui part au telephone (05/10) : des constantes, jamais un litteral glisse
# dans un appel. Chaque gabarit est une cle de textes_catalogue.py, recopiee
# par scripts/textes_serveur.mjs (CLES_TELEPHONE). Un message retouche ici
# sans sa cle partait en francais chez un Allemand, et tout restait vert :
# tests/python/test_lot16_alertes_traduites.py le dit maintenant.
TITRE = "Loggia — sûreté"
MSG_ALARME = "Alarme déclenchée"
MSG_OUVERTURE = "Ouverture pendant que l’alarme est armée"
# Un detecteur de surete qui se tait (audit du 19/10, M5) : une pile a plat,
# un appareil decroche du reseau. Il ne previent plus de rien, et personne ne
# le savait. Une notification ORDINAIRE — pas un danger : elle attend les
# heures calmes comme les autres —, une seule fois jusqu'a son retour.
MSG_MUET = "Détecteur muet, à vérifier"
# Plusieurs a la fois (relecture du lot 2, point 8) : le coordinateur Zigbee
# tombe, tous les detecteurs se taisent dans la meme minute — UNE notification
# qui les nomme, pas une par detecteur.
MSG_MUETS = "Détecteurs muets, à vérifier"


def gabarit(message: str) -> str:
    """Le gabarit envoye : « Fumée détectée : {nom} », le nom venant de HA."""
    return message + " : {nom}"


# device_class -> (categorie, message)
#
# `safety` N'EST PAS LA, ET NE DOIT PAS Y REVENIR. Il y figurait comme
# « fumee » — la categorie qui remonte les volets et allume toute la maison.
# Or Home Assistant ne lui donne qu'un sens : « on = pas sur », sans dire de
# quoi. Meteoalarm l'emploie pour une alerte METEO.
#
# Le 06/10/2026 a 06:10, une alerte meteo a donc ouvert le volet d'une chambre
# ou dormaient des gens et allume les quatorze lumieres de la maison. Le
# journal de Loggia dit « fumee : meteoalarm ». Ce n'etait pas la premiere
# fois : 27/09, 29/09, 03/10, 06/10 — toutes avec ce motif, et prises jusque-la
# pour un mystere.
#
# La regle qui reste : une classe ne declenche une EVACUATION que si elle nomme
# le danger. `smoke`, `gas`, `carbon_monoxide`, `moisture` le nomment ; une
# classe fourre-tout, non. Mieux vaut ignorer un capteur mal declare — cela se
# repare en lui donnant sa vraie classe — qu'ouvrir une chambre la nuit.
BINAIRES: dict[str, tuple[str, str]] = {
    "smoke": ("fumee", "Fumée détectée"),
    "gas": ("gaz", "Gaz détecté"),
    "carbon_monoxide": ("co", "Monoxyde de carbone détecté"),
    "moisture": ("fuite", "Fuite d’eau détectée"),
}
# Un `moisture` CALCULE n'est pas une fuite (16/10, ADR 0022). Chez
# l'utilisateur, `binary_sensor.dracaena_besoin_eau` et
# `binary_sensor.schefflera_besoin_eau` sont des modeles (`template`) de classe
# `moisture`, sans appareil : « la plante a soif ». Allumes, ils auraient dit
# « Fuite d'eau détectée » et coupe la vanne. La meme famille d'erreur que le
# `safety` de Meteoalarm : une classe lue sans regarder qui la porte. Un
# detecteur de fuite est un appareil ; un modele ou un groupe calcule. Le
# registre des entites donne la plateforme ; une entite qu'il ne connait pas
# (YAML sans `unique_id`) reste une fuite : on ne perd aucun vrai detecteur.
PLATEFORMES_CALCULEES = ("template", "group")
# Le besoin d'eau d'une plante n'est pas une fuite non plus, QUELLE QUE SOIT sa
# plateforme (audit du 19/10, M1) : un seuil (`threshold`) ou un ESPHome qui
# dit « la plante a soif » coupait la vanne. La regle est celle de l'ecran
# (attention.js, `estPlante`) : l'identifiant commence par la base d'une
# plante de `loggia_plants`, suivie de rien ou d'un « _ ».
CLE_PLANTES = "loggia_plants"
PORTES = ("door", "window", "garage_door", "opening")
# Ce qui reveille — le seul canal qui contourne les heures calmes.
DANGER = ("fumee", "gaz", "co", "fuite", "alarme")
# `armed_custom_bypass` : arme, quelques zones contournees. L'ecran le tenait
# pour arme (attention.js, « Ouvert, alarme armée »), le serveur non : une
# fenetre ouverte s'affichait et ne partait pas au telephone (audit du 19/10,
# M21). `gate` reste dehors : ce n'est pas une classe de binary_sensor.
ARMEE = ("armed_away", "armed_home", "armed_night", "armed_vacation", "armed_custom_bypass")
# Ce qu'un capteur dit quand il ne dit rien.
MUETS = ("unknown", "unavailable")
# Combien de temps un detecteur de surete peut se taire avant qu'on le dise
# (audit du 19/10, M5). Un quart d'heure : un reseau Zigbee qui redemarre, un
# routeur qui reprend, une mise a jour de Zigbee2MQTT tiennent dedans ; une
# pile a plat, non.
DELAI_MUET = 15 * 60
# Les detecteurs qui se sont tus dans cette minute-la partent ensemble (point 8).
FENETRE_MUETS = 60
# Les detecteurs muets deja dits, dans leur fichier (relecture du lot 2, point
# 8) : un redemarrage ne les redit pas. Comme `signales` des veilles.
CLE_ETAT = "loggia_alertes_etat"
VERSION_ETAT = 1
MAX_MUETS = 500

# La moitie « action » de §18 : quel danger declenche quoi.
LUMIERES = ("fumee", "co", "alarme")   # pas le gaz : un relais qui claque est une etincelle
VOLETS = ("fumee", "co", "gaz")
VANNE = ("fuite",)
# Ce qu'on REMONTE sur un danger — et non plus ce qu'on evite.
#
# La liste disait « ni garage, ni portail, ni porte ». Un portail dont la
# classe n'est pas renseignee vaut `None`, qui n'est aucun de ces trois noms :
# il passait le filtre et s'ouvrait sur une fausse alerte fumee (audit du
# 29/09/2026). Or beaucoup de portails n'ont pas de classe declaree.
#
# On nomme donc ce qu'on ouvre. Ce qu'on ne sait pas nommer reste ferme : ne
# pas remonter un volet mal declare se repare en lui donnant sa classe ;
# ouvrir un portail au milieu de la nuit, non.
#
# Ni `window` ni `awning` (audit du 19/10, H6). Ouvrir un velux sur une fumee,
# c'est faire entrer l'air qui attise ; deployer un store banne, c'est tendre
# une toile au-dessus d'une fenetre en feu. ouvrants.py ne les ouvre jamais :
# la surete prend SA liste des volets, moins le store banne.
VOLETS_CLASSES = tuple(c for c in CLASSES_VOLETS if c != STORE_BANNE)
# En tete de l'echelle : au-dessus du vent, au-dessus de tout — sauf une main.
PRIORITE = niveau("surete", 19)
ACTIONS_DEFAUT: dict[str, Any] = {"actif": True, "lumieres": True, "volets": True,
                                  "vanne": {"actif": True, "entite": ""}}


@callback
def etat_ecoute(data: Any) -> bool:
    """Ce que les alertes ecoutent : les binaires et les alarmes, y compris
    quand l'entite disparait (son danger doit se rendre). Le reste de la maison
    ne reveille plus `_on_state` (28/10, ADR 0280)."""
    haid = data.get("entity_id") if isinstance(data, dict) else None
    return isinstance(haid, str) and haid.startswith(("binary_sensor.", "alarm_control_panel."))


class LoggiaAlertes:
    """Ecoute les etats et pousse les alertes de surete configurees."""

    # Ce que le constructeur pose apres coup (relecture du lot 2) : des valeurs
    # simples, que chaque instance remplace par les siennes.
    _au_demarrage = None
    _depot = None
    # Les vannes d'eau coupees sur une fuite (chantier IoT, etape 3 ; I30) :
    # toutes, faute d'en avoir choisi une. Un TUPLE vide au niveau de la classe
    # (passe bis, point 11) : une liste s'y partageait entre les instances ;
    # chacune pose la sienne.
    _vannes_coupees: tuple = ()
    # Home Assistant a-t-il fini de demarrer — la revue est-elle passee ?
    _demarre = False

    def __init__(self, hass: HomeAssistant, store: "LoggiaStore", regles) -> None:
        self._hass = hass
        self._store = store
        # Le socle : c'est lui qui parle au telephone, et qui sait quand se
        # taire et quand ne pas se taire.
        self._regles = regles
        # Anti-rafale : un capteur qui bat (fuite au bord du seuil) ne doit pas
        # mitrailler le telephone. L'alarme declenchee passe toujours.
        self._defait = None
        self._dernier: dict[str, float] = {}
        # La maison qui reagit (§18) : les dangers en cours, l'etat d'AVANT de
        # ce qu'on a touche — pour le rendre —, et la vanne qu'on a coupee.
        self._dangers: dict[str, str] = {}
        self._avant: dict[str, dict] = {}
        self._vannes_coupees: list[str] = []
        # Le dernier etat CONNU de chaque capteur, avant qu'il ne se taise
        # (audit du 19/10, H5) : {entity_id: etat}. Un retour depuis
        # `unavailable` se compare a lui, pas au silence.
        self._connu: dict[str, str] = {}
        # Les dangers que la maison suivait quand leur capteur s'est tu : seuls
        # ceux-la la refont reagir a leur retour (son choix du 19/10).
        self._rendus_au_silence: set[str] = set()
        # Les detecteurs de surete qui se taisent (audit du 19/10, M5) :
        # {entity_id: {"annuler", "dc", "depuis"}} pour ceux qu'on guette, et
        # ceux deja signales — persistes (relecture du lot 2, point 8).
        self._muets: dict[str, dict] = {}
        self._muets_dits: set[str] = set()
        self._demarre = False
        # On GARDE de quoi se taire : sans ce fil, l'ecoute survivait au
        # dechargement du composant et un rechargement en posait une seconde
        # (24/09, plan S7).
        # Filtree AVANT le rappel (28/10, ADR 0280) : sans `event_filter`,
        # `_on_state` tournait a chaque changement d'etat de la maison pour en
        # rejeter presque tous.
        self._defait = hass.bus.async_listen("state_changed", self._on_state, event_filter=etat_ecoute)
        # Un danger deja la quand Home Assistant demarre (audit du 19/10, H4) :
        # son premier etat n'a pas d'etat d'avant, et l'ecoute l'ignorait. On
        # attend que Home Assistant ait FINI de demarrer, comme fenetres.py,
        # puis on passe en revue ce qui est deja allume. Deja demarre (un
        # rechargement), le rappel part aussitot.
        from homeassistant.helpers.start import async_at_started

        self._au_demarrage = async_at_started(hass, self._async_revoir)
        _LOGGER.info("Loggia : alertes de sûreté à l'écoute")

    async def _async_revoir(self, _hass=None) -> None:
        """La revue du demarrage : chaque binaire de danger deja a « on », et
        chaque alarme deja declenchee (relecture du lot 2, point 3), part
        au telephone — et la maison ne reagit PAS (son choix du 19/10,
        « Prevenir seulement ») : un danger qu'on n'a pas vu arriver, l'ecoute
        CO d'une camera restee allumee ou Alarmo revenu « declenche », ne doit
        pas allumer toutes ses lumieres au redemarrage ; chaque detecteur deja muet est
        guette — sauf s'il a deja ete dit avant l'arret (point 8). Les etats
        lus deviennent les derniers connus (H5)."""
        self._au_demarrage = None
        try:
            etats = list(self._hass.states.async_all("binary_sensor"))
            etats += list(self._hass.states.async_all("alarm_control_panel"))
        except Exception:  # noqa: BLE001
            _LOGGER.warning("Loggia alertes : etats illisibles, pas de revue au demarrage", exc_info=True)
            return
        # Des maintenant, une entite qui apparait est un evenement (point 3) :
        # celles qui existent deja sont dans `etats`, lus d'un coup.
        self._demarre = True
        await self._async_lire_etat()
        muets = {e.entity_id for e in etats if e.state in MUETS}
        if self._muets_dits - muets:
            # Revenus pendant l'arret, ou disparus : ils redeviennent signalables.
            self._muets_dits &= muets
            await self._async_garder()
        for etat in sorted(etats, key=lambda e: e.entity_id):
            if etat.state in MUETS:
                self._guetter_muet(etat)
                continue
            self._connu[etat.entity_id] = etat.state
            if self._danger_de(etat) is None:
                continue
            # Deux envois ecrits a part : un texte qui part au telephone se
            # nomme dans l'appel (tests/python/test_lot16_alertes_traduites.py).
            if etat.entity_id.startswith("alarm_control_panel."):
                await self._envoyer(etat, "alarme", MSG_ALARME, urgent=True)
                continue
            cat, msg = BINAIRES[etat.attributes.get("device_class")]
            await self._envoyer(etat, cat, msg)

    def _danger_de(self, etat: Any) -> tuple[str, str] | None:
        """(categorie, message) si cet etat EST un danger : un binaire de danger
        a « on » qui nomme un vrai danger, ou une alarme declenchee."""
        haid = etat.entity_id
        if haid.startswith("alarm_control_panel."):
            return ("alarme", MSG_ALARME) if etat.state == "triggered" else None
        if not haid.startswith("binary_sensor.") or etat.state != "on":
            return None
        dc = (etat.attributes or {}).get("device_class")
        if dc in BINAIRES and self._danger_reel(haid, dc):
            return BINAIRES[dc]
        return None

    @callback
    def _on_state(self, event: Event) -> None:
        new = event.data.get("new_state")
        old = event.data.get("old_state")
        if new is None:
            # Une entite supprimee ou renommee (audit du 19/10, M23) : son
            # danger ne finira jamais par un « off ». Comme un capteur qui se
            # tait : on rend la maison, et le journal le dit.
            if old is not None:
                self._oublier(old.entity_id)
                if old.entity_id in self._dangers:
                    self._hass.async_create_task(self._danger_passe(old.entity_id, muet=True))
            return
        haid = new.entity_id
        domaine = haid.split(".")[0]
        if domaine not in ("binary_sensor", "alarm_control_panel"):
            return
        if new.state in MUETS:
            # Le dernier etat connu, avant le silence (H5).
            if old is not None and old.state not in MUETS:
                self._connu[haid] = old.state
            # Un capteur de danger qui se tait PENDANT un danger : sa fin est
            # incertaine, mais laisser la maison forcee jusqu'a une main serait
            # pire (audit 18/09). On rend, et le journal le dit.
            if haid in self._dangers:
                self._rendus_au_silence.add(haid)
                self._hass.async_create_task(self._danger_passe(haid, muet=True))
            self._guetter_muet(new, old)
            return
        self._fin_muet(haid)
        porte = domaine == "binary_sensor" and (new.attributes or {}).get("device_class") in PORTES
        if old is None:
            # Une apparition. Pendant le demarrage, la revue s'en charge (H4) ;
            # APRES, c'est un evenement (relecture du lot 2, point 3) : une
            # decouverte MQTT, une integration rechargee, deja en fumee. Une
            # porte qui apparait ouverte, elle, ne s'est pas ouverte.
            if not self._demarre or porte:
                self._connu[haid] = new.state
                return
            avant = None
        elif old.state in MUETS:
            # Un retour depuis le silence (audit du 19/10, H5) : on compare au
            # dernier etat CONNU. Une ouverture sans rien de connu d'avant (un
            # demarrage) n'en est pas une ; fermee avant le silence, ouverte
            # apres, si (relecture du lot 2, point 2) — quelqu'un est entre.
            avant = self._connu.get(haid)
            if porte and avant is None:
                self._connu[haid] = new.state
                return
        else:
            avant = old.state
        self._connu[haid] = new.state
        if new.state == avant:
            # Le meme etat qu'avant le silence : pas d'evenement neuf, rien au
            # telephone. Mais un danger qui dure, rendu pendant le silence,
            # doit de nouveau forcer la maison (relecture du lot 2, point 1).
            danger = self._danger_de(new) if old is not None and old.state in MUETS else None
            if danger is not None and haid in self._rendus_au_silence and haid not in self._dangers:
                self._rendus_au_silence.discard(haid)
                self._hass.async_create_task(self._reagir(new, danger[0]))
            return
        self._rendus_au_silence.discard(haid)
        # La maison ne reagit qu'a un passage VU : d'un etat connu au danger.
        # Sans etat d'avant (une apparition, un retour sans rien de connu), on
        # n'a pas vu le danger arriver — le telephone, pas la maison (son choix
        # du 19/10, « Prevenir seulement »).
        vu = avant is not None
        if domaine == "binary_sensor" and new.state == "on":
            dc = new.attributes.get("device_class")
            if dc in BINAIRES:
                if not self._danger_reel(new.entity_id, dc):
                    return  # « la plante a soif » n'est pas une fuite
                cat, msg = BINAIRES[dc]
                self._hass.async_create_task(self._envoyer(new, cat, msg))
                if vu:
                    self._hass.async_create_task(self._reagir(new, cat))
            elif dc in PORTES:
                self._hass.async_create_task(self._porte_ouverte(new))
        elif domaine == "binary_sensor" and new.state == "off" and avant == "on":
            dc = new.attributes.get("device_class")
            if dc in BINAIRES and self._danger_reel(new.entity_id, dc):
                self._hass.async_create_task(self._danger_passe(new.entity_id))
        elif domaine == "alarm_control_panel" and new.state == "triggered":
            self._hass.async_create_task(self._envoyer(new, "alarme", MSG_ALARME, urgent=True))
            if vu:
                self._hass.async_create_task(self._reagir(new, "alarme"))
        elif domaine == "alarm_control_panel" and avant == "triggered":
            self._hass.async_create_task(self._danger_passe(new.entity_id))

    def _danger_reel(self, haid: str, dc: str) -> bool:
        """Un binaire de danger nomme-t-il un vrai danger ? Toujours, sauf un
        `moisture` qu'un modele ou un groupe calcule (16/10, ADR 0022). Le
        registre illisible, ou l'entite qu'il ne connait pas : c'est une fuite.
        Le besoin d'eau d'une plante se juge a part, sur la configuration
        (`_est_plante`, audit du 19/10, M1) : elle se lit en asynchrone."""
        if dc != "moisture":
            return True
        try:
            from homeassistant.helpers import entity_registry as er

            entree = er.async_get(self._hass).async_get(haid)
        except Exception:  # noqa: BLE001
            _LOGGER.debug("Loggia alertes : registre illisible pour %s, la fuite reste une fuite", haid, exc_info=True)
            return True
        return getattr(entree, "platform", None) not in PLATEFORMES_CALCULEES

    async def _est_plante(self, haid: str) -> bool:
        """Ce binaire est-il le besoin d'eau d'une plante de la maison ? La
        regle de l'ecran (attention.js, `estPlante`), mot pour mot : son
        identifiant commence par la base d'une plante de `loggia_plants`,
        suivie de rien ou d'un « _ » — `binary_sensor.ficusx` n'est pas le
        ficus (audit du 19/10, M1). Une configuration illisible : aucune plante."""
        try:
            plantes = await self._store.async_get_shared(CLE_PLANTES)
        except Exception:  # noqa: BLE001
            _LOGGER.debug("Loggia alertes : plantes illisibles, la fuite reste une fuite", exc_info=True)
            return False
        if not isinstance(plantes, list):
            return False
        for p in plantes:
            base = p.get("base") if isinstance(p, dict) else None
            if isinstance(base, str) and base and haid.startswith(base) and (
                    len(haid) == len(base) or haid[len(base)] == "_"):
                return True
        return False

    # ── Un detecteur de surete qui se tait (audit du 19/10, M5) ────────────
    def _guetter_muet(self, etat: Any, old: Any = None) -> None:
        """Un detecteur de surete vient de se taire : dans DELAI_MUET, s'il
        se tait encore, on le dit. Rien pour une porte, rien pour ce qui
        n'alerte pas (un modele de plante), rien s'il est deja signale."""
        haid = etat.entity_id
        if not haid.startswith("binary_sensor.") or haid in self._muets or haid in self._muets_dits:
            return
        # Un etat muet garde souvent ses attributs ; sinon, ceux d'avant.
        dc = (etat.attributes or {}).get("device_class") or (
            (getattr(old, "attributes", None) or {}).get("device_class"))
        if dc not in BINAIRES or not self._danger_reel(haid, dc):
            return
        from homeassistant.helpers.event import async_call_later

        @callback
        def echu(_now) -> None:
            entree = self._muets.get(haid)
            if entree is not None:
                entree["annuler"] = None
            self._hass.async_create_task(self._async_muet(haid))

        self._muets[haid] = {"annuler": None, "dc": dc, "depuis": time.monotonic()}
        self._muets[haid]["annuler"] = async_call_later(self._hass, DELAI_MUET, echu)

    def _lever_guet(self, haid: str) -> None:
        """Le delai de ce detecteur tombe, s'il court encore."""
        entree = self._muets.pop(haid, None)
        annuler = entree.get("annuler") if isinstance(entree, dict) else None
        if annuler is not None:
            try:
                annuler()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia alertes : delai du detecteur muet deja parti")

    def _fin_muet(self, haid: str) -> None:
        """Il reparle : le delai tombe, et il redevient signalable — le
        fichier le sait aussi (point 8)."""
        self._lever_guet(haid)
        if haid in self._muets_dits:
            self._muets_dits.discard(haid)
            self._hass.async_create_task(self._async_garder())

    def _oublier(self, haid: str) -> None:
        """Une entite qui disparait n'a plus rien a nous dire."""
        self._fin_muet(haid)
        self._connu.pop(haid, None)

    async def _async_muet(self, haid: str) -> None:
        """Le delai de `haid` est passe. Avec lui partent ceux qui se sont tus
        dans la meme minute (FENETRE_MUETS) : UNE notification ordinaire qui
        les nomme (relecture du lot 2, point 8), une seule fois jusqu'a leur
        retour. Pas de reaction de la maison : un silence n'est pas un danger."""
        maintenant = time.monotonic()
        lot = sorted(h for h, e in self._muets.items()
                     if h == haid or maintenant - e["depuis"] >= DELAI_MUET - FENETRE_MUETS)
        classes = {h: self._muets[h]["dc"] for h in lot}
        for h in lot:
            self._lever_guet(h)
        cfg = await self._store.async_get_shared(CLE_CONFIG)
        if not isinstance(cfg, dict) or not cfg.get("actif"):
            return
        noms: list[tuple[str, str]] = []
        for h in lot:
            etat = self._hass.states.get(h)
            if etat is None or etat.state not in MUETS or h in self._muets_dits:
                continue
            dc = classes[h]
            if not (cfg.get("categories") or {}).get(BINAIRES[dc][0]):
                continue
            if dc == "moisture" and await self._est_plante(h):
                continue
            noms.append(((etat.attributes or {}).get("friendly_name") or h, h))
        if not noms:
            return
        noms.sort()
        motif = ", ".join(h for _, h in noms)
        if len(noms) == 1:
            nom = noms[0][0]
            parti = await self._regles.prevenir("alertes", "muet", (gabarit(MSG_MUET), {"nom": nom}),
                                                titre=TITRE, motif=motif, pour="tous")
        else:
            nom = ", ".join(n for n, _ in noms)
            parti = await self._regles.prevenir("alertes", "muet", (gabarit(MSG_MUETS), {"nom": nom}),
                                                titre=TITRE, motif=motif, pour="tous")
        # Retenus — et ecrits — seulement si c'est parti (contre-relecture,
        # point B) : un telephone disparu ne doit pas les faire taire pour
        # toujours. Ils se rediront a leur prochain silence, ou au demarrage.
        if parti:
            self._muets_dits.update(h for _, h in noms)
            await self._async_garder()

    # ── Les muets deja dits, sur le disque (relecture du lot 2, point 8) ───
    def _store_etat(self):
        if self._depot is None:
            from homeassistant.helpers.storage import Store

            self._depot = Store(self._hass, VERSION_ETAT, CLE_ETAT)
        return self._depot

    async def _async_lire_etat(self) -> None:
        """Les detecteurs deja dits avant l'arret. Illisible ou abime : on
        repart a vide — au pire, un detecteur muet se redit une fois."""
        try:
            brut = await self._store_etat().async_load()
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Loggia alertes : etat illisible, on repart a vide")
            brut = None
        liste = brut.get("muets") if isinstance(brut, dict) else None
        if isinstance(liste, list):
            self._muets_dits |= {h for h in liste if isinstance(h, str) and h.startswith("binary_sensor.")}

    async def _async_garder(self) -> None:
        try:
            await self._store_etat().async_save({"muets": sorted(self._muets_dits)[:MAX_MUETS]})
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Loggia alertes : etat non enregistre")

    # ── La maison reagit (§18) ─────────────────────────────────────────────
    async def _actions(self) -> dict:
        cfg = await self._store.async_get_shared(CLE_CONFIG)
        actions: dict[str, Any] = dict(ACTIONS_DEFAUT)
        actions["vanne"] = dict(ACTIONS_DEFAUT["vanne"])
        brut = (cfg.get("actions") if isinstance(cfg, dict) else None) or {}
        if isinstance(brut, dict):
            for k, v in brut.items():
                if k == "vanne":
                    # Une vanne abimee (pas une table) garde le defaut, comme la popup la lit (eau_calcul.regle_de ;
                    # passe bis, point 8) : elle prenait sa place, et `_reagir` tombait sur la fuite.
                    if isinstance(v, dict):
                        actions["vanne"].update(v)
                elif k in actions:
                    actions[k] = v
        return actions

    def _entites(self, domaine: str, classes=None) -> list:
        """Les entites joignables d'un domaine.

        `classes` restreint aux `device_class` nommees ; sans elle, tout le
        domaine. Un filtre POSITIF : ce qui n'a pas de classe declaree n'est
        pas retenu quand on en demande une.
        """
        try:
            etats = self._hass.states.async_all(domaine)
        except Exception:  # noqa: BLE001
            # Sans cette trace, la reaction de surete manquait en silence.
            _LOGGER.warning("Loggia alertes : lecture des %s impossible pendant l'alerte", domaine, exc_info=True)
            return []
        return sorted(s.entity_id for s in etats
                      if s.state not in ("unavailable", "unknown")
                      and (classes is None
                           or (s.attributes or {}).get("device_class") in classes))

    async def _lumieres(self) -> list:
        """Les lumieres de la maison joignables, par la definition commune a
        toutes les regles (lumieres_maison, audit du 19/10) : ni la LED d'une
        borne (`config`) - qui passait a 100 % sur une fumee -, ni une lampe
        cachee ; l'interrupteur declare lumiere compris ; un groupe s'efface
        devant ses membres."""
        declares = await async_interrupteurs_declares(self._store)
        joignables = self._entites("light") + [h for h in sorted(declares) if h in self._entites("switch")]
        attributs = {h: dict(getattr(self._hass.states.get(h), "attributes", None) or {}) for h in joignables}
        return lumieres_de_la_maison(attributs, registre_de(self._hass), declares)

    def _features(self, haid: str):
        st = self._hass.states.get(haid)
        return (getattr(st, "attributes", None) or {}).get("supported_features") if st is not None else None

    def _retenir(self, haids) -> None:
        """L'etat d'AVANT, pour le rendre quand le danger passe — une fois : un
        second danger ne doit pas retenir l'etat que le premier a impose."""
        for haid in haids:
            if haid in self._avant:
                continue
            st = self._hass.states.get(haid)
            if st is None:
                continue
            attrs = st.attributes or {}
            self._avant[haid] = {"state": st.state, "brightness": attrs.get("brightness"),
                                 "position": attrs.get("current_position")}

    def _vannes(self, designee) -> list:
        """Les vannes d'eau a couper : celle qu'on a designee (une prise
        designee vaut aussi), sinon TOUTES les `valve` d'eau joignables (chantier
        IoT, etape 3 ; I30, ADR 0022 amendee). La regle coupait « la premiere »
        par ordre d'identifiant : une vanne d'arrosage pouvait passer avant
        l'arrivee. Fermer est le sens sur : plus de vannes fermees sur une
        fuite, jamais moins."""
        if isinstance(designee, str) and designee:
            return [designee]
        return [haid for haid in self._entites("valve")
                if (getattr(self._hass.states.get(haid), "attributes", None) or {}).get("device_class") == "water"]

    def _annoncer_eau(self, vannes: list, etat: Any, nom: str) -> None:
        """Le carnet de l'eau (eau.py) apprend la cause et le detecteur AVANT
        que la regle n'agisse : la popup dira « fuite sous l'evier ». Absent ou
        en echec, il ne retient pas la surete."""
        carnet = ((getattr(self._hass, "data", None) or {}).get(DOMAIN) or {}).get("eau")
        if carnet is None:
            return
        try:
            carnet.annoncer_fermeture(vannes, etat.entity_id, nom)
        except Exception:  # noqa: BLE001
            _LOGGER.warning("Loggia alertes : le carnet de l'eau n'a pas pu noter la cause", exc_info=True)

    async def _categorie_reagit(self, cat: str) -> bool:
        """Cette categorie fait-elle reagir la maison ? Decochee dans
        Parametres > Alertes, non (audit du 19/10, M22) : decocher « Fuite »
        laissait la vanne se couper. Une installation jamais configuree, ou
        une categorie que la configuration ne nomme pas, garde le defaut de
        l'ecran (ALERTES_DEF, parametres.jsx) : chaque danger coche."""
        cfg = await self._store.async_get_shared(CLE_CONFIG)
        cats = cfg.get("categories") if isinstance(cfg, dict) else None
        if not isinstance(cats, dict) or cat not in cats:
            return True
        return bool(cats[cat])

    async def _reagir(self, etat: Any, cat: str) -> None:
        """Sur un danger, la maison agit — en tete de l'echelle, et tenu.

        Toujours, meme en « Observer sans agir » (audit du 19/10, ADR 0250) :
        la surete ne se simule pas. Sauf une categorie decochee, et le besoin
        d'eau d'une plante."""
        actions = await self._actions()
        if not actions.get("actif"):
            return
        if not await self._categorie_reagit(cat):
            return
        if cat == "fuite" and await self._est_plante(etat.entity_id):
            return
        self._dangers[etat.entity_id] = cat
        nom = etat.attributes.get("friendly_name") or etat.entity_id
        motif = "%s : %s" % (cat, nom)
        if actions.get("lumieres") and cat in LUMIERES:
            lumieres = await self._lumieres()
            if lumieres:
                self._retenir(lumieres)
                # Par service : une lampe a 100 %, un interrupteur declare
                # lumiere tel quel - il n'a pas de niveau.
                for domaine, service, lot in par_service(lumieres, True):
                    await self._regles.agir("alertes", "danger", domaine, service, lot,
                                            {"brightness_pct": 100} if domaine == "light" else None,
                                            quoi="allumer", motif=motif, priorite=PRIORITE, tenir=True)
        if actions.get("volets") and cat in VOLETS:
            # Un volet « tilt seul » ferait refuser l'appel groupe entier.
            volets = [h for h in self._entites("cover", VOLETS_CLASSES)
                      if ouvre_et_ferme(self._features(h))]
            if volets:
                self._retenir(volets)
                await self._regles.agir("alertes", "danger", "cover", "open_cover", volets,
                                        quoi="remonter", motif=motif, priorite=PRIORITE, tenir=True)
        vanne = actions.get("vanne") or {}
        if vanne.get("actif") and cat in VANNE:
            entites = self._vannes(vanne.get("entite"))
            if entites:
                self._annoncer_eau(entites, etat, nom)
                partis: list = []
                # Par domaine : une `valve` par `close_valve`, une prise designee
                # par `turn_off`. Jamais d'ouverture.
                for domaine in sorted({h.split(".")[0] for h in entites}):
                    lot = [h for h in entites if h.split(".")[0] == domaine]
                    service = "close_valve" if domaine == "valve" else "turn_off"
                    partis += await self._regles.agir("alertes", "danger", domaine, service, lot,
                                                      quoi="couper", motif=motif, priorite=PRIORITE,
                                                      tenir=True)
                if partis:
                    self._vannes_coupees = list(partis)
            else:
                await self._regles.noter("alertes", "danger", "couper", n=0, motif=motif,
                                         detail="aucune vanne d’eau : rien à couper")

    async def _danger_passe(self, haid: str, muet: bool = False) -> None:
        """Un capteur retombe. Tant qu'un autre danger dure, on ne rend rien."""
        self._dangers.pop(haid, None)
        if muet:
            _LOGGER.warning("Loggia alertes : %s s'est tu pendant un danger — la maison est rendue", haid)
            await self._regles.noter("alertes", "danger", "capteur muet", cibles=[haid], motif="danger",
                                     detail="le capteur s’est tu pendant le danger : la maison est rendue, a verifier")
        if self._dangers:
            return
        await self._async_rendre()

    async def _async_rendre(self) -> None:
        """La maison revient a l'etat d'avant — ce que la regle tient encore :
        une lampe prise en main pendant l'alerte reste comme elle est. La
        vanne, elle, reste coupee : une fuite s'inspecte avant de rouvrir."""
        avant, self._avant = self._avant, {}
        eteindre: list = []
        allumer: dict[int, list] = {}
        positions: dict[int, list] = {}
        for haid, e in avant.items():
            if not self._regles.tient("alertes", "danger", haid):
                continue
            b, pos = e.get("brightness"), e.get("position")
            if haid.startswith("light.") or haid.startswith("switch."):
                # Un interrupteur declare lumiere : eteint avant, il s'eteint ;
                # allume, il n'a pas de niveau a remettre.
                if e.get("state") == "off":
                    eteindre.append(haid)
                elif isinstance(b, (int, float)) and not isinstance(b, bool) and b < 255:
                    allumer.setdefault(int(b), []).append(haid)
            elif haid.startswith("cover."):
                if isinstance(pos, (int, float)) and not isinstance(pos, bool) and pos < 100:
                    positions.setdefault(int(pos), []).append(haid)
                elif pos is None and e.get("state") == "closed":
                    positions.setdefault(0, []).append(haid)
        # Relacher AVANT de commander : `agir` ecarte ce qu'une regle tient, et
        # cette regle, c'est nous.
        self._regles.relacher("alertes", "danger")
        for domaine, service, lot in par_service(eteindre, False):
            await self._regles.agir("alertes", "danger", domaine, service, lot,
                                    quoi="rendre", motif="danger passé", priorite=PRIORITE)
        for b, haids in sorted(allumer.items()):
            await self._regles.agir("alertes", "danger", "light", "turn_on", sorted(haids),
                                    {"brightness": b}, quoi="rendre", motif="danger passé",
                                    priorite=PRIORITE)
        for pos, haids in sorted(positions.items()):
            if pos <= 0:
                await self._regles.agir("alertes", "danger", "cover", "close_cover", sorted(haids),
                                        quoi="rendre", motif="danger passé", priorite=PRIORITE)
            else:
                await self._regles.agir("alertes", "danger", "cover", "set_cover_position",
                                        sorted(haids), {"position": pos}, quoi="rendre",
                                        motif="danger passé", priorite=PRIORITE)
        if self._vannes_coupees:
            await self._regles.noter("alertes", "danger", "laisser coupée", cibles=list(self._vannes_coupees),
                                     n=len(self._vannes_coupees), motif="danger passé",
                                     detail="la vanne d’eau se rouvre à la main")
            self._vannes_coupees = []

    async def _porte_ouverte(self, etat: Any) -> None:
        """Une ouverture n'alerte que si une alarme est armee — sinon c'est la vie."""
        armee = any(
            s.state in ARMEE
            for s in self._hass.states.async_all("alarm_control_panel")
        )
        if armee:
            await self._envoyer(etat, "portes", MSG_OUVERTURE)

    async def _envoyer(self, etat: Any, categorie: str, message: str, urgent: bool = False) -> None:
        cfg = await self._store.async_get_shared(CLE_CONFIG)
        if not isinstance(cfg, dict) or not cfg.get("actif"):
            return
        cats = cfg.get("categories") or {}
        if not cats.get(categorie):
            return
        # « La plante a soif » n'est pas une fuite (audit du 19/10, M1).
        if categorie == "fuite" and await self._est_plante(etat.entity_id):
            return
        if not urgent:
            try:
                minutes = max(1, int(cfg.get("cooldown_min", 5)))
            except (TypeError, ValueError):
                minutes = 5
            # « Jamais alerte » est None, pas 0.0. `monotonic()` compte depuis le
            # demarrage de la machine : juste apres un redemarrage de la box,
            # il vaut quelques dizaines de secondes, et 0.0 passait alors pour
            # une alerte toute recente — la premiere fumee detectee dans les
            # cinq minutes suivant un reboot etait jetee, sans un mot. Vu sur
            # la machine d'integration, fraichement demarree.
            maintenant = time.monotonic()
            precedent = self._dernier.get(etat.entity_id)
            if precedent is not None and maintenant - precedent < minutes * 60:
                return
            self._dernier[etat.entity_id] = maintenant
        nom = etat.attributes.get("friendly_name") or etat.entity_id
        # Le message est un gabarit : « Fumée détectée : {nom} » a sa cle dans
        # chaque langue, le nom de l'appareil vient de Home Assistant (ADR 0070).
        parti = await self._regles.prevenir(
            "alertes", categorie, (gabarit(message), {"nom": nom}), titre=TITRE,
            critique=categorie in DANGER, motif=etat.entity_id, pour="tous")
        if parti:
            _LOGGER.info("Loggia : alerte %s envoyée pour %s", categorie, etat.entity_id)

    @callback
    def async_arreter(self) -> None:
        """Retire l'ecoute du bus, l'attente du demarrage et les delais des
        detecteurs muets (audit du 19/10) : les alertes ne programmaient rien,
        elles guettent desormais un silence."""
        if getattr(self, "_au_demarrage", None) is not None:
            try:
                self._au_demarrage()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia alertes : attente du demarrage deja retiree")
        self._au_demarrage = None
        for haid in list(getattr(self, "_muets", None) or {}):
            self._lever_guet(haid)
        if self._defait is None:
            return
        try:
            self._defait()
        except Exception:  # noqa: BLE001
            _LOGGER.debug("Loggia alertes : ecoute deja retiree")
        self._defait = None
