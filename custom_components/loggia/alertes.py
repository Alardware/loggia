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
  fuite                    → la vanne d'eau coupee.
Tout cela en tete de l'echelle (surete), tenu tant que le danger dure. Quand
il passe, la maison revient a l'etat d'avant — sauf la vanne, qui reste
coupee jusqu'a ce qu'une main la rouvre : une fuite s'inspecte (ADR 0022).
"""
from __future__ import annotations

import logging
import time
from typing import TYPE_CHECKING, Any

from homeassistant.core import Event, HomeAssistant, callback

from .regles import niveau

if TYPE_CHECKING:  # l'annotation seule — les tests chargent ce module hors paquet
    from .store import LoggiaStore

_LOGGER = logging.getLogger(__name__)

CLE_CONFIG = "loggia_alertes"

# device_class -> (categorie, message)
BINAIRES: dict[str, tuple[str, str]] = {
    "smoke": ("fumee", "Fumée détectée"),
    "gas": ("gaz", "Gaz détecté"),
    "carbon_monoxide": ("co", "Monoxyde de carbone détecté"),
    "moisture": ("fuite", "Fuite d'eau détectée"),
    "safety": ("fumee", "Alerte de sûreté"),
}
PORTES = ("door", "window", "garage_door", "opening")
# Ce qui reveille — le seul canal qui contourne les heures calmes.
DANGER = ("fumee", "gaz", "co", "fuite", "alarme")
ARMEE = ("armed_away", "armed_home", "armed_night", "armed_vacation")

# La moitie « action » de §18 : quel danger declenche quoi.
LUMIERES = ("fumee", "co", "alarme")   # pas le gaz : un relais qui claque est une etincelle
VOLETS = ("fumee", "co", "gaz")
VANNE = ("fuite",)
# Une porte de garage, un portail, une porte : pas des volets, on ne les ouvre pas.
PAS_UN_VOLET = ("garage", "gate", "door")
# En tete de l'echelle : au-dessus du vent, au-dessus de tout — sauf une main.
PRIORITE = niveau("surete", 19)
ACTIONS_DEFAUT: dict[str, Any] = {"actif": True, "lumieres": True, "volets": True,
                                  "vanne": {"actif": True, "entite": ""}}


class LoggiaAlertes:
    """Ecoute les etats et pousse les alertes de surete configurees."""

    def __init__(self, hass: HomeAssistant, store: "LoggiaStore", regles) -> None:
        self._hass = hass
        self._store = store
        # Le socle : c'est lui qui parle au telephone, et qui sait quand se
        # taire et quand ne pas se taire.
        self._regles = regles
        # Anti-rafale : un capteur qui bat (fuite au bord du seuil) ne doit pas
        # mitrailler le telephone. L'alarme declenchee passe toujours.
        self._dernier: dict[str, float] = {}
        # La maison qui reagit (§18) : les dangers en cours, l'etat d'AVANT de
        # ce qu'on a touche — pour le rendre —, et la vanne qu'on a coupee.
        self._dangers: dict[str, str] = {}
        self._avant: dict[str, dict] = {}
        self._vanne_coupee: str | None = None
        hass.bus.async_listen("state_changed", self._on_state)
        _LOGGER.info("Loggia : alertes de sûreté à l'écoute")

    @callback
    def _on_state(self, event: Event) -> None:
        new = event.data.get("new_state")
        old = event.data.get("old_state")
        if new is None or old is None:
            return  # apparition/disparition d'entite : pas un evenement de surete
        if new.state in ("unknown", "unavailable"):
            # Un capteur de danger qui se tait PENDANT un danger : sa fin est
            # incertaine, mais laisser la maison forcee jusqu'a une main serait
            # pire (audit 18/09). On rend, et le journal le dit.
            if new.entity_id in self._dangers:
                self._hass.async_create_task(self._danger_passe(new.entity_id, muet=True))
            return
        if new.state == old.state:
            return
        domaine = new.entity_id.split(".")[0]
        if domaine == "binary_sensor" and new.state == "on":
            dc = new.attributes.get("device_class")
            if dc in BINAIRES:
                cat, msg = BINAIRES[dc]
                self._hass.async_create_task(self._envoyer(new, cat, msg))
                self._hass.async_create_task(self._reagir(new, cat))
            elif dc in PORTES:
                self._hass.async_create_task(self._porte_ouverte(new))
        elif domaine == "binary_sensor" and new.state == "off" and old.state == "on":
            if new.attributes.get("device_class") in BINAIRES:
                self._hass.async_create_task(self._danger_passe(new.entity_id))
        elif domaine == "alarm_control_panel" and new.state == "triggered":
            self._hass.async_create_task(self._envoyer(new, "alarme", "Alarme déclenchée", urgent=True))
            self._hass.async_create_task(self._reagir(new, "alarme"))
        elif domaine == "alarm_control_panel" and old.state == "triggered":
            self._hass.async_create_task(self._danger_passe(new.entity_id))

    # ── La maison reagit (§18) ─────────────────────────────────────────────
    async def _actions(self) -> dict:
        cfg = await self._store.async_get_shared(CLE_CONFIG)
        actions: dict[str, Any] = dict(ACTIONS_DEFAUT)
        actions["vanne"] = dict(ACTIONS_DEFAUT["vanne"])
        brut = (cfg.get("actions") if isinstance(cfg, dict) else None) or {}
        if isinstance(brut, dict):
            for k, v in brut.items():
                if k == "vanne" and isinstance(v, dict):
                    actions["vanne"].update(v)
                elif k in actions:
                    actions[k] = v
        return actions

    def _entites(self, domaine: str, sauf_classes=()) -> list:
        """Les entites joignables d'un domaine, moins certaines classes."""
        try:
            etats = self._hass.states.async_all(domaine)
        except Exception:  # noqa: BLE001
            # Sans cette trace, la reaction de surete manquait en silence.
            _LOGGER.warning("Loggia alertes : lecture des %s impossible pendant l'alerte", domaine, exc_info=True)
            return []
        return sorted(s.entity_id for s in etats
                      if s.state not in ("unavailable", "unknown")
                      and (s.attributes or {}).get("device_class") not in sauf_classes)

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

    def _vanne(self, designee) -> str | None:
        """La vanne d'eau : celle qu'on a designee, sinon la premiere `valve`
        d'eau que Home Assistant connait. Une prise designee vaut aussi."""
        if isinstance(designee, str) and designee:
            return designee
        for haid in self._entites("valve"):
            st = self._hass.states.get(haid)
            if st is not None and (st.attributes or {}).get("device_class") == "water":
                return haid
        return None

    async def _reagir(self, etat: Any, cat: str) -> None:
        """Sur un danger, la maison agit — en tete de l'echelle, et tenu."""
        actions = await self._actions()
        if not actions.get("actif"):
            return
        self._dangers[etat.entity_id] = cat
        nom = etat.attributes.get("friendly_name") or etat.entity_id
        motif = "%s : %s" % (cat, nom)
        if actions.get("lumieres") and cat in LUMIERES:
            lumieres = self._entites("light")
            if lumieres:
                self._retenir(lumieres)
                await self._regles.agir("alertes", "danger", "light", "turn_on", lumieres,
                                        {"brightness_pct": 100}, quoi="allumer", motif=motif,
                                        priorite=PRIORITE, tenir=True)
        if actions.get("volets") and cat in VOLETS:
            volets = self._entites("cover", PAS_UN_VOLET)
            if volets:
                self._retenir(volets)
                await self._regles.agir("alertes", "danger", "cover", "open_cover", volets,
                                        quoi="remonter", motif=motif, priorite=PRIORITE, tenir=True)
        vanne = actions.get("vanne") or {}
        if vanne.get("actif") and cat in VANNE:
            entite = self._vanne(vanne.get("entite"))
            if entite:
                domaine = entite.split(".")[0]
                service = "close_valve" if domaine == "valve" else "turn_off"
                partis = await self._regles.agir("alertes", "danger", domaine, service, [entite],
                                                 quoi="couper", motif=motif, priorite=PRIORITE,
                                                 tenir=True)
                if partis:
                    self._vanne_coupee = entite
            else:
                await self._regles.noter("alertes", "danger", "couper", n=0, motif=motif,
                                         detail="aucune vanne d'eau : rien à couper")

    async def _danger_passe(self, haid: str, muet: bool = False) -> None:
        """Un capteur retombe. Tant qu'un autre danger dure, on ne rend rien."""
        self._dangers.pop(haid, None)
        if muet:
            _LOGGER.warning("Loggia alertes : %s s'est tu pendant un danger — la maison est rendue", haid)
            await self._regles.noter("alertes", "danger", "capteur muet", cibles=[haid], motif="danger",
                                     detail="le capteur s'est tu pendant le danger : la maison est rendue, a verifier")
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
            if haid.startswith("light."):
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
        if eteindre:
            await self._regles.agir("alertes", "danger", "light", "turn_off", sorted(eteindre),
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
        if self._vanne_coupee:
            await self._regles.noter("alertes", "danger", "laisser coupée", cibles=[self._vanne_coupee],
                                     n=1, motif="danger passé",
                                     detail="la vanne d'eau se rouvre à la main")
            self._vanne_coupee = None

    async def _porte_ouverte(self, etat: Any) -> None:
        """Une ouverture n'alerte que si une alarme est armee — sinon c'est la vie."""
        armee = any(
            s.state in ARMEE
            for s in self._hass.states.async_all("alarm_control_panel")
        )
        if armee:
            await self._envoyer(etat, "portes", "Ouverture pendant que l'alarme est armée")

    async def _envoyer(self, etat: Any, categorie: str, message: str, urgent: bool = False) -> None:
        cfg = await self._store.async_get_shared(CLE_CONFIG)
        if not isinstance(cfg, dict) or not cfg.get("actif"):
            return
        cats = cfg.get("categories") or {}
        if not cats.get(categorie):
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
        parti = await self._regles.prevenir(
            "alertes", categorie, f"{message} : {nom}", titre="Loggia — sûreté",
            critique=categorie in DANGER, motif=etat.entity_id)
        if parti:
            _LOGGER.info("Loggia : alerte %s envoyée pour %s", categorie, etat.entity_id)
