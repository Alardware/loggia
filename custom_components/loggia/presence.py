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

from .regles import niveau

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
    # Observer sans agir : la regle note ce qu'elle aurait fait.
    "simulation": {"actif": False},
}

MODES_ALARME = {"away": "alarm_arm_away", "home": "alarm_arm_home",
                "night": "alarm_arm_night", "vacation": "alarm_arm_vacation"}

# Le palier « presence » de l'echelle : au-dessus de la nuit et du confort,
# sous la surete. Le depart TIENT ce qu'il eteint et ce qu'il baisse, jusqu'au
# retour : la veilleuse ou l'eclairage doux ne rallument pas une maison vide.
PRIORITE = niveau("presence")


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
        self._defait: list[Any] = []
        hass.async_create_task(self._async_demarrer())

    async def _async_demarrer(self) -> None:
        self.cfg = await self.async_config()
        await self._async_reabonner()

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
        if not suivis:
            return
        from homeassistant.helpers.event import async_track_state_change_event

        self._defait.append(
            async_track_state_change_event(self.hass, suivis, self._sur_personne)
        )
        _LOGGER.info("Loggia presence : %d personnes suivies", len(suivis))
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
                                    motif="%s : %s" % (genre, self._nom(haid)))
        await self._async_armer_depart(relance=True)

    def _declarer(self) -> None:
        """Declare au socle ce que le depart pilote : les lumieres, les
        chauffages, l'alarme. Rappele a chaque evaluation — les entites
        peuvent ne pas exister au demarrage."""
        pilotes = []
        if self.cfg.get("actif"):
            try:
                pilotes += list(self.hass.states.async_entity_ids("light"))
            except Exception:  # noqa: BLE001
                pass
            pilotes += self._climats()
            entite = ((self.cfg.get("depart") or {}).get("alarme") or {}).get("entite")
            if entite:
                pilotes.append(entite)
        self.regles.suivre("presence", pilotes)

    async def _async_evaluer(self) -> None:
        if not self.cfg.get("actif"):
            return
        self._declarer()
        vide = tous_absents(self._etats(), self.cfg.get("personnes"))
        if vide and not self.dehors:
            await self._async_armer_depart()
        elif not vide:
            self._desarmer()
            if self.dehors:
                self.dehors = False
                await self._async_retour()

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
        # Quelqu'un a pu rentrer pendant le decompte.
        if not tous_absents(etats, self.cfg.get("personnes")):
            return
        self.dehors = True
        d = self.cfg.get("depart") or {}

        if d.get("lumieres"):
            allumees = self._allumees()
            if allumees:
                # Ne retenir que ce qui est vraiment parti : une lampe sous la
                # main de quelqu'un n'a pas ete eteinte, et n'est pas a rallumer.
                partis = await self._async_service("light", "turn_off", allumees,
                                                   regle="depart", quoi="eteindre",
                                                   motif="maison vide", tenir=True)
                self.eteintes = {haid: "on" for haid in partis}

        chauffage = d.get("chauffage") or {}
        if chauffage.get("actif"):
            cibles = self._climats()
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
                                                   motif="maison vide", tenir=True)
                self.consignes = {haid: avant[haid] for haid in partis if haid in avant}

        alarme = d.get("alarme") or {}
        if alarme.get("actif") and alarme.get("entite"):
            service = MODES_ALARME.get(str(alarme.get("mode") or "away"), "alarm_arm_away")
            await self._async_service("alarm_control_panel", service, [alarme["entite"]],
                                      regle="depart", quoi="armer", motif="maison vide")

    def _allumees(self) -> list:
        """Les lumieres allumees en ce moment."""
        try:
            ids = self.hass.states.async_entity_ids("light")
        except Exception:  # noqa: BLE001
            return []
        return [i for i in sorted(ids)
                if str(getattr(self.hass.states.get(i), "state", "")).lower() == "on"]

    def _capteurs_indices(self) -> list:
        """Les capteurs de mouvement et d'ouverture de la maison, par `device_class`."""
        try:
            ids = self.hass.states.async_entity_ids("binary_sensor")
        except Exception:  # noqa: BLE001
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
                if a_rendre:
                    await self._async_service("light", "turn_on", a_rendre,
                                              regle="retour", quoi="rallumer", motif="retour")
                self.eteintes = {}

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
    def _etats(self, ids=None) -> dict:
        if ids is None:
            ids = list(self.cfg.get("personnes") or [])
        return {haid: self.hass.states.get(haid) for haid in ids}

    async def _async_service(self, domaine: str, service: str, cibles: list, extra=None, *,
                             regle: str = "", quoi: str = "", motif: str = "",
                             tenir: bool = False) -> list:
        """Commande par le socle : il ecarte ce qu'une main tient, et note."""
        return await self.regles.agir("presence", regle, domaine, service, cibles, extra,
                                      quoi=quoi or service, motif=motif,
                                      priorite=PRIORITE, tenir=tenir, simuler=self._simule())

    def _simule(self) -> bool:
        """Observer sans agir : la regle note, rien ne bouge."""
        return bool((self.cfg.get("simulation") or {}).get("actif"))

    def _repartir_de_zero(self) -> None:
        """Du simule au reel, ou l'inverse : la regle repart de ce que la
        maison EST. Un depart simule laissait `dehors` vrai, et le vrai
        depart suivant n'aurait rien eteint."""
        self._desarmer()
        self.eteintes = {}
        self.consignes = {}
        self.dehors = False
        self._indice_note = False
        self.regles.relacher("presence")

    # ── Ce que l'interface lit et ecrit ────────────────────────────────────
    async def async_config(self) -> dict[str, Any]:
        brut = await self.store.async_get_shared(CLE, None)
        cfg = {}
        for k, v in DEFAUT.items():
            if isinstance(v, dict):
                cfg[k] = {kk: (dict(vv) if isinstance(vv, dict) else vv) for kk, vv in v.items()}
            elif isinstance(v, list):
                cfg[k] = list(v)
            else:
                cfg[k] = v
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
        return cfg

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
            "journal": await self.regles.journal(limite=40, module="presence"),
        }

    async def async_enregistrer(self, patch: dict[str, Any]) -> dict[str, Any]:
        cfg = await self.async_config()
        simulait = bool((cfg.get("simulation") or {}).get("actif"))
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
        await self.store.async_set_shared(CLE, cfg)
        self.cfg = cfg
        if bool((cfg.get("simulation") or {}).get("actif")) != simulait:
            self._repartir_de_zero()
        await self._async_reabonner()
        return cfg

    @callback
    def async_arreter(self) -> None:
        self._desarmer()
        for defaire in self._defait:
            try:
                defaire()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia presence : desabonnement sans effet")
        self._defait.clear()
