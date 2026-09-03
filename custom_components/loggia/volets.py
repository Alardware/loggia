"""Volets : le planning du soleil, la protection solaire, la mise a l'abri.

Pourquoi ce module existe
─────────────────────────
La vue Volets de Loggia savait piloter un planning, mais pas le tenir : elle
lisait un `input_select` et des `input_boolean` que l'utilisateur avait crees
lui-meme, et c'est une automatisation YAML ecrite a la main qui faisait le
travail. Loggia n'etait qu'une telecommande posee sur le montage de quelqu'un
d'autre. Installer Loggia ne suffisait pas : il fallait encore ecrire
l'automatisation.

Ce module la porte. Trois regles, chacune debrayable :

  planning   ouvrir au lever, fermer au coucher, avec un decalage en minutes
             de part et d'autre et le choix des jours.
  soleil     l'ete, quand le soleil frappe une facade, baisser les volets de
             ce cote-la, puis les rouvrir quand il est passe. L'orientation se
             donne une fois par volet ; l'azimut et l'elevation viennent de
             `sun.sun`, que Home Assistant tient a jour.
  vent       au-dela d'un seuil, tout remonter. Un volet baisse dans une
             rafale est un volet plie, et cette regle PRIME sur les deux
             autres — sans quoi la protection solaire le rabaisserait dans la
             minute.

Ce que ce module n'est pas
──────────────────────────
Il n'ecrit pas dans `automations.yaml` et ne cree rien dans l'ecran
Automatisations de Home Assistant. Le prix a payer est clair : ces regles
vivent avec Loggia et disparaissent avec lui. En echange, elles ne dependent
d'aucun format d'editeur, ne peuvent pas etre ecrasees par une sauvegarde de
l'interface, et se reglent la ou l'on regarde ses volets.

La geometrie est ecrite en fonctions pures, testables sans Home Assistant :
c'est la que se joue « ce volet est-il au soleil », et c'est ce qu'on veut
pouvoir verifier sans lever le jour.
"""
from __future__ import annotations

import logging
import time
from datetime import timedelta
from typing import TYPE_CHECKING, Any

from homeassistant.core import HomeAssistant, callback

if TYPE_CHECKING:  # l'annotation seule — les tests chargent ce module hors paquet
    from .store import LoggiaStore

_LOGGER = logging.getLogger(__name__)

CLE = "loggia_volets"
SOLEIL = "sun.sun"

# Le bit SET_POSITION de CoverEntityFeature. Un volet qui ne l'a pas ne connait
# que l'ouvert et le ferme : lui demander 30 % ne donnerait rien.
COVER_SET_POSITION = 4

# Combien de degres le soleil doit avoir quitte la facade avant qu'on rouvre.
# Sans cette garde, le volet battrait des qu'il longe le bord du cone.
HYSTERESE_DEG = 8.0

DEFAUT: dict[str, Any] = {
    "planning": {"actif": False, "mode": "auto", "ouverture": {"decalage": 0},
                 "fermeture": {"decalage": 0}, "jours": [0, 1, 2, 3, 4, 5, 6], "volets": {}},
    "soleil": {"actif": False, "position": 30, "elevation_min": 15, "temp_min": 25,
               "temp_entite": "", "volets": {}},
    "vent": {"actif": False, "entite": "", "seuil": 50},
}


# ── La geometrie, en pur ───────────────────────────────────────────────────
def ecart_azimut(a, b) -> float:
    """Le plus petit angle entre deux azimuts, en degres (0 a 180).

    Un ecart brut se trompe au passage du nord : 350° et 10° sont voisins de
    20°, pas eloignes de 340°.
    """
    d = abs((float(a) - float(b)) % 360.0)
    return 360.0 - d if d > 180.0 else d


def au_soleil(azimut, elevation, orientation, ouverture=90.0, elevation_min=15.0, marge=0.0) -> bool:
    """Le soleil frappe-t-il une facade orientee ainsi ?

    `ouverture` est la demi-largeur du cone vise, de part et d'autre de
    l'orientation : 90° couvre tout ce que la facade peut voir, moins la
    resserre autour du plein axe. `marge` sert a l'hysterese — on exige un peu
    plus pour rouvrir que pour fermer.
    """
    if azimut is None or elevation is None or orientation is None:
        return False
    try:
        if float(elevation) < float(elevation_min):
            return False
        return ecart_azimut(azimut, orientation) <= max(0.0, float(ouverture) - float(marge))
    except (TypeError, ValueError):
        return False


def groupes_horaires(plan, covers, sens: str) -> dict:
    """Les volets ranges par decalage, pour un sens donne.

    Le planning n'a longtemps connu qu'une heure pour toute la maison. Or on
    ne veut pas que la chambre s'ouvre au lever du soleil comme le salon. Un
    volet peut donc porter son propre decalage, qui REMPLACE le general, ou
    se retirer entierement du planning.

    Renvoie {minutes: [entity_id]} — un rendez-vous par valeur distincte,
    plutot qu'un rendez-vous par volet.
    """
    try:
        general = int((plan.get(sens) or {}).get("decalage") or 0)
    except (TypeError, ValueError):
        general = 0
    par_volet = plan.get("volets") or {}
    groupes: dict = {}
    for haid in covers:
        reglage = par_volet.get(haid) if isinstance(par_volet, dict) else None
        if isinstance(reglage, dict):
            if reglage.get("exclu"):
                continue
            propre = reglage.get(sens)
            if propre not in (None, ""):
                try:
                    groupes.setdefault(int(propre), []).append(haid)
                    continue
                except (TypeError, ValueError):
                    pass
        groupes.setdefault(general, []).append(haid)
    return groupes


# Les trois positions du mode, reprises de celles que les installations
# ecrivaient a la main dans un `input_select`. `actif` dit si la regle existe ;
# le mode dit ce qu'elle fait aujourd'hui, et c'est lui qu'on change au
# quotidien depuis la vue Volets.
MODES = ("auto", "nuit", "manuel")


def planning_agit(mode, sens: str) -> bool:
    """Le planning doit-il bouger, dans ce mode et dans ce sens ?

    auto     ferme le soir et ouvre le matin.
    nuit     ferme le soir, mais laisse les volets fermes au matin — pour une
             chambre d'ami, un depart, une grasse matinee qui dure.
    manuel   ne touche a rien, sans qu'on ait a defaire les reglages.
    """
    m = str(mode or "auto").lower()
    if m not in MODES:
        m = "auto"
    if m == "manuel":
        return False
    if m == "nuit":
        return sens == "fermer"
    return True


def jour_actif(jours, quand) -> bool:
    """`jours` est indexe lundi = 0, comme `datetime.weekday()`."""
    if not isinstance(jours, list) or not jours:
        return True
    return quand.weekday() in jours


class LoggiaVolets:
    """Tient les regles de volets : planning, soleil, mise a l'abri."""

    def __init__(self, hass: HomeAssistant, store: "LoggiaStore") -> None:
        self.hass = hass
        self.store = store
        self.cfg: dict[str, Any] = {}
        # Ce que la derniere evaluation a decide, volet par volet. Sert a ne
        # pas renvoyer dix fois la meme commande, et a savoir quoi rouvrir.
        self.abaisses: set[str] = set()
        self.a_l_abri = False
        self.journal: list[dict[str, Any]] = []
        self._defait: list[Any] = []
        self._defait_soleil: list[Any] = []
        hass.async_create_task(self._async_demarrer())

    async def _async_demarrer(self) -> None:
        self.cfg = await self.async_config()
        await self._async_reprogrammer()
        # Le soleil bouge : Home Assistant reecrit `sun.sun` regulierement, et
        # chaque ecriture est une occasion de reevaluer. Le vent a sa propre
        # entite, suivie par la meme fonction.
        from homeassistant.helpers.event import async_track_state_change_event

        surveillees = [SOLEIL]
        vent = (self.cfg.get("vent") or {}).get("entite")
        if vent:
            surveillees.append(vent)
        self._defait.append(
            async_track_state_change_event(self.hass, surveillees, self._sur_etat)
        )

    # ── Le planning ────────────────────────────────────────────────────────
    async def _async_reprogrammer(self) -> None:
        """(Re)pose les rendez-vous du lever et du coucher.

        Les decalages font partie du rendez-vous lui-meme : les changer oblige
        a tout reposer, d'ou cette fonction rappelee a chaque enregistrement.
        """
        for defaire in self._defait_soleil:
            try:
                defaire()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia volets : rendez-vous deja retire")
        self._defait_soleil.clear()

        plan = self.cfg.get("planning") or {}
        if not plan.get("actif"):
            return
        from homeassistant.helpers.event import async_track_sunrise, async_track_sunset

        # Un rendez-vous par decalage DISTINCT, et non un par volet : trois
        # chambres qui s'ouvrent une heure plus tard partagent le leur.
        covers = self._tous_les_covers()
        for sens, poser in (("ouverture", async_track_sunrise), ("fermeture", async_track_sunset)):
            groupes = groupes_horaires(plan, covers, sens)
            for decalage, cibles in groupes.items():
                self._defait_soleil.append(
                    poser(self.hass, self._rendezvous(sens, list(cibles)), timedelta(minutes=decalage))
                )
            _LOGGER.info("Loggia volets : %s armee en %d groupe(s)", sens, len(groupes))

    def _rendezvous(self, sens: str, cibles: list):
        """Le rappel d'un groupe, avec les volets qu'il commande."""
        quoi = "ouvrir" if sens == "ouverture" else "fermer"

        @callback
        def sonne(*_):
            self.hass.async_create_task(self._async_planifie(quoi, cibles))

        return sonne

    async def _async_planifie(self, sens: str, cibles=None) -> None:
        from homeassistant.util import dt as dt_util

        plan = self.cfg.get("planning") or {}
        if not plan.get("actif") or not jour_actif(plan.get("jours"), dt_util.now()):
            return
        if not planning_agit(plan.get("mode"), sens):
            return
        # Mise a l'abri en cours : on ne redescend rien, et on ne « rouvre »
        # pas ce qui est deja ouvert pour cette raison.
        if self.a_l_abri:
            return
        cibles = list(cibles) if cibles else self._tous_les_covers()
        if not cibles:
            return
        await self._async_service("open_cover" if sens == "ouvrir" else "close_cover", cibles)
        if sens == "ouvrir":
            self.abaisses.clear()
        self._noter(sens, "planning", len(cibles))

    # ── Le soleil et le vent ───────────────────────────────────────────────
    @callback
    def _sur_etat(self, _event) -> None:
        self.hass.async_create_task(self._async_evaluer())

    async def _async_evaluer(self) -> None:
        """Met a l'abri si le vent l'exige, sinon protege du soleil."""
        if await self._async_vent():
            return
        await self._async_soleil()

    async def _async_vent(self) -> bool:
        """Renvoie vrai si la mise a l'abri commande — et alors elle prime."""
        v = self.cfg.get("vent") or {}
        if not v.get("actif") or not v.get("entite"):
            self.a_l_abri = False
            return False
        valeur = self._nombre(v.get("entite"))
        if valeur is None:
            return False
        try:
            seuil = float(v.get("seuil") or 0)
        except (TypeError, ValueError):
            return False
        if valeur >= seuil:
            if not self.a_l_abri:
                cibles = self._tous_les_covers()
                if cibles:
                    await self._async_service("open_cover", cibles)
                    self._noter("ouvrir", "vent", len(cibles), detail=str(valeur))
                self.a_l_abri = True
                self.abaisses.clear()
            return True
        # On ne redescend qu'une fois nettement repasse sous le seuil : une
        # rafale qui oscille autour ferait autrement battre les volets.
        if self.a_l_abri and valeur < seuil * 0.85:
            self.a_l_abri = False
        return self.a_l_abri

    async def _async_soleil(self) -> None:
        s = self.cfg.get("soleil") or {}
        if not s.get("actif"):
            return
        par_volet = s.get("volets") or {}
        if not isinstance(par_volet, dict) or not par_volet:
            return
        st = self.hass.states.get(SOLEIL)
        attrs = (st.attributes if st else {}) or {}
        azimut = attrs.get("azimuth")
        elevation = attrs.get("elevation")
        if azimut is None or elevation is None:
            return

        # La condition de saison : une temperature exterieure plutot qu'un mois,
        # parce qu'une journee de septembre a 30 °C merite la meme protection
        # qu'une de juillet.
        temp_min = s.get("temp_min")
        if temp_min not in (None, ""):
            dehors = self._nombre(s.get("temp_entite"))
            if dehors is None:
                return
            try:
                if dehors < float(temp_min):
                    await self._async_rouvrir_proteges()
                    return
            except (TypeError, ValueError):
                return

        try:
            position = int(s.get("position", 30))
            elev_min = float(s.get("elevation_min", 15))
        except (TypeError, ValueError):
            return

        for haid, reglage in par_volet.items():
            if not isinstance(reglage, dict):
                continue
            orientation = reglage.get("orientation")
            ouverture = reglage.get("ouverture", 90)
            deja = haid in self.abaisses
            # Hysterese : il faut sortir franchement du cone pour rouvrir.
            frappe = au_soleil(azimut, elevation, orientation, ouverture, elev_min,
                               marge=HYSTERESE_DEG if deja else 0.0)
            if frappe and not deja:
                await self._async_position(haid, position)
                self.abaisses.add(haid)
                self._noter("proteger", "soleil", 1, detail=haid)
            elif not frappe and deja:
                await self._async_position(haid, 100)
                self.abaisses.discard(haid)
                self._noter("rouvrir", "soleil", 1, detail=haid)

    async def _async_rouvrir_proteges(self) -> None:
        for haid in list(self.abaisses):
            await self._async_position(haid, 100)
            self.abaisses.discard(haid)
            self._noter("rouvrir", "soleil", 1, detail=haid)

    # ── Les commandes ──────────────────────────────────────────────────────
    def _tous_les_covers(self) -> list:
        """Tous les volets de l'installation.

        Le planning les prend tous — un volet ajoute apres coup suit sans
        qu'on ait a le declarer — et la table par volet dit lesquels s'en
        ecartent. La protection solaire, elle, ne touche que ceux a qui on a
        donne une orientation : ce sont deux notions distinctes, et les
        confondre faisait suivre au planning les seuls volets orientes.
        """
        try:
            return sorted(self.hass.states.async_entity_ids("cover"))
        except Exception:  # noqa: BLE001
            return []

    def _nombre(self, haid):
        if not haid:
            return None
        st = self.hass.states.get(haid)
        if st is None:
            return None
        try:
            return float(st.state)
        except (TypeError, ValueError):
            return None

    def _sait_se_placer(self, haid: str) -> bool:
        st = self.hass.states.get(haid)
        f = (st.attributes.get("supported_features") if st else None) or 0
        try:
            return bool(int(f) & COVER_SET_POSITION)
        except (TypeError, ValueError):
            return False

    async def _async_position(self, haid: str, position: int) -> None:
        """Place un volet, ou l'ouvre / le ferme s'il ne sait pas se placer."""
        if self._sait_se_placer(haid):
            await self._async_service("set_cover_position", [haid], {"position": position})
        else:
            await self._async_service("open_cover" if position >= 50 else "close_cover", [haid])

    async def _async_service(self, service: str, cibles: list, extra=None) -> None:
        data = {"entity_id": cibles}
        if extra:
            data.update(extra)
        try:
            await self.hass.services.async_call("cover", service, data, blocking=False)
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Loggia volets : cover.%s a echoue", service)

    def _noter(self, quoi: str, regle: str, combien: int, detail: str = "") -> None:
        self.journal.insert(0, {"quoi": quoi, "regle": regle, "n": combien,
                                "detail": detail, "ts": time.time()})
        del self.journal[30:]

    # ── Ce que l'interface lit et ecrit ────────────────────────────────────
    async def async_config(self) -> dict[str, Any]:
        brut = await self.store.async_get_shared(CLE, None)
        cfg = {k: dict(v) for k, v in DEFAUT.items()}
        if isinstance(brut, dict):
            for section, valeurs in brut.items():
                if section in cfg and isinstance(valeurs, dict):
                    cfg[section].update(valeurs)
        return cfg

    async def async_etat(self) -> dict[str, Any]:
        st = self.hass.states.get(SOLEIL)
        attrs = (st.attributes if st else {}) or {}
        return {
            "config": self.cfg or await self.async_config(),
            "soleil": {"azimut": attrs.get("azimuth"), "elevation": attrs.get("elevation")},
            "abaisses": sorted(self.abaisses),
            "a_l_abri": self.a_l_abri,
            "journal": list(self.journal),
        }

    async def async_enregistrer(self, patch: dict[str, Any]) -> dict[str, Any]:
        cfg = await self.async_config()
        for section, valeurs in (patch or {}).items():
            if section in cfg and isinstance(valeurs, dict):
                cfg[section].update(valeurs)
        await self.store.async_set_shared(CLE, cfg)
        self.cfg = cfg
        # Les rendez-vous portent les decalages : les changer oblige a les
        # reposer, sinon l'ancienne heure resterait armee jusqu'au redemarrage.
        await self._async_reprogrammer()
        return cfg

    @callback
    def async_arreter(self) -> None:
        for source in (self._defait, self._defait_soleil):
            for defaire in source:
                try:
                    defaire()
                except Exception:  # noqa: BLE001
                    _LOGGER.debug("Loggia volets : desabonnement sans effet")
            source.clear()
