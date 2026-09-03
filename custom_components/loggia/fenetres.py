"""Fenetre ouverte : couper le chauffage de la piece, et le rendre apres.

Pourquoi ce module existe
─────────────────────────
Chauffer une piece dont la fenetre est ouverte, c'est chauffer la rue. La
regle est connue de tout le monde et n'existe dans aucune installation par
defaut : il faut l'ecrire, piece par piece, dans une automatisation par
radiateur. Loggia connait deja les pieces, les ouvrants et les chauffages —
il ne lui manquait que de s'en servir.

Ce qui se passe
───────────────
Un ouvrant s'ouvre. On attend le delai regle (trois minutes par defaut, le
temps d'aerer sans que le radiateur s'arrete pour rien), puis on coupe les
chauffages de cette piece — en notant ce qu'ils faisaient. La fenetre se
referme : on leur rend leur etat.

Trois precautions, chacune pour un cas qui arrive :

  On ne rend que ce qu'on a pris. Si quelqu'un a touche au radiateur pendant
  l'aeration, son geste l'emporte : on ne restaure pas par-dessus.

  On n'oublie rien au redemarrage. L'etat d'avant vit en memoire, pas sur
  disque : apres un redemarrage, Loggia ne sait plus ce qu'il avait coupe et
  ne pretend pas le savoir. Le premier changement d'ouvrant remet tout au
  clair.

  Une piece a souvent plusieurs ouvrants. Le chauffage ne repart que lorsque
  le DERNIER s'est referme.
"""
from __future__ import annotations

import logging
import time
from typing import TYPE_CHECKING, Any

from homeassistant.core import HomeAssistant, callback

if TYPE_CHECKING:  # l'annotation seule — les tests chargent ce module hors paquet
    from .store import LoggiaStore

_LOGGER = logging.getLogger(__name__)

CLE = "loggia_fenetres"

# Les etats qui ne veulent rien dire : un capteur qui vient de tomber ne doit
# ni couper le chauffage ni le rendre.
MUETS = {"unavailable", "unknown", "none", ""}

DEFAUT: dict[str, Any] = {"actif": False, "delai": 3, "reprise": 0, "pieces": {}}


def ouvrants_ouverts(etats: dict, ouvrants) -> list:
    """Ceux qui sont ouverts, parmi les ouvrants d'une piece.

    Un `binary_sensor` d'ouverture dit `on` quand il est ouvert ; un `cover`
    dit `open`. Les deux comptent, et les valeurs muettes ne comptent pas.
    """
    ouverts = []
    for haid in ouvrants or []:
        st = etats.get(haid)
        if st is None:
            continue
        valeur = str(getattr(st, "state", "")).lower()
        if valeur in MUETS:
            continue
        if valeur in ("on", "open", "opening"):
            ouverts.append(haid)
    return ouverts


def eteint_pour(haid: str):
    """Le service qui coupe un chauffage, selon son domaine."""
    domaine = haid.split(".", 1)[0]
    if domaine == "climate":
        return ("climate", "set_hvac_mode", {"hvac_mode": "off"})
    if domaine in ("switch", "input_boolean"):
        return (domaine, "turn_off", {})
    # Tout le reste passe par le service universel : une prise, une vanne,
    # ce qu'on n'a pas prevu.
    return ("homeassistant", "turn_off", {})


def rend_pour(haid: str, avant: str):
    """Le service qui rend un chauffage a l'etat ou on l'a trouve."""
    domaine = haid.split(".", 1)[0]
    if domaine == "climate":
        return ("climate", "set_hvac_mode", {"hvac_mode": avant})
    if domaine in ("switch", "input_boolean"):
        return (domaine, "turn_on" if avant == "on" else "turn_off", {})
    return ("homeassistant", "turn_on" if avant == "on" else "turn_off", {})


class LoggiaFenetres:
    """Coupe le chauffage d'une piece dont un ouvrant reste ouvert."""

    def __init__(self, hass: HomeAssistant, store: "LoggiaStore") -> None:
        self.hass = hass
        self.store = store
        self.cfg: dict[str, Any] = {}
        # Ce qu'on a coupe, et ce qu'il faisait avant : {piece: {entite: etat}}.
        # En memoire seule — voir l'en-tete.
        self.coupes: dict[str, dict[str, str]] = {}
        self.journal: list[dict[str, Any]] = []
        self._minuteurs: dict[str, Any] = {}
        self._defait: list[Any] = []
        hass.async_create_task(self._async_demarrer())

    async def _async_demarrer(self) -> None:
        self.cfg = await self.async_config()
        await self._async_reabonner()

    async def _async_reabonner(self) -> None:
        """Suit les ouvrants declares. Rappele a chaque enregistrement."""
        for defaire in self._defait:
            try:
                defaire()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia fenetres : abonnement deja retire")
        self._defait.clear()
        if not self.cfg.get("actif"):
            return
        suivis = []
        for piece in (self.cfg.get("pieces") or {}).values():
            if isinstance(piece, dict) and piece.get("actif"):
                suivis.extend(piece.get("ouvrants") or [])
        if not suivis:
            return
        from homeassistant.helpers.event import async_track_state_change_event

        self._defait.append(
            async_track_state_change_event(self.hass, sorted(set(suivis)), self._sur_ouvrant)
        )
        _LOGGER.info("Loggia fenetres : %d ouvrants surveilles", len(set(suivis)))

    @callback
    def _sur_ouvrant(self, event) -> None:
        haid = (event.data or {}).get("entity_id")
        if not haid:
            return
        for nom, piece in (self.cfg.get("pieces") or {}).items():
            if isinstance(piece, dict) and haid in (piece.get("ouvrants") or []):
                self.hass.async_create_task(self._async_piece(nom))

    async def _async_piece(self, nom: str) -> None:
        piece = (self.cfg.get("pieces") or {}).get(nom)
        if not isinstance(piece, dict) or not piece.get("actif"):
            return
        ouverts = ouvrants_ouverts(self._etats(), piece.get("ouvrants"))
        if ouverts:
            await self._async_armer(nom)
        else:
            self._desarmer(nom)
            await self._async_rendre(nom)

    async def _async_armer(self, nom: str) -> None:
        """Compte le delai avant de couper. Un ouvrant deja compte ne recompte pas."""
        if nom in self._minuteurs or nom in self.coupes:
            return
        try:
            delai = max(0, int(self.cfg.get("delai", 3))) * 60
        except (TypeError, ValueError):
            delai = 180
        if delai == 0:
            await self._async_couper(nom)
            return
        from homeassistant.helpers.event import async_call_later

        @callback
        def echu(_now):
            self._minuteurs.pop(nom, None)
            self.hass.async_create_task(self._async_couper(nom))

        self._minuteurs[nom] = async_call_later(self.hass, delai, echu)

    def _desarmer(self, nom: str) -> None:
        annule = self._minuteurs.pop(nom, None)
        if annule:
            try:
                annule()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia fenetres : minuteur deja passe")

    async def _async_couper(self, nom: str) -> None:
        piece = (self.cfg.get("pieces") or {}).get(nom)
        if not isinstance(piece, dict) or not piece.get("actif"):
            return
        etats = self._etats()
        # Le delai a pu s'ecouler pendant que la fenetre se refermait.
        if not ouvrants_ouverts(etats, piece.get("ouvrants")):
            return
        avant: dict[str, str] = {}
        for haid in piece.get("chauffages") or []:
            st = etats.get(haid)
            valeur = str(getattr(st, "state", "")).lower() if st else ""
            if valeur in MUETS or valeur == "off":
                continue   # deja eteint, ou muet : rien a couper ni a rendre
            avant[haid] = valeur
            domaine, service, data = eteint_pour(haid)
            await self._async_service(domaine, service, haid, data)
        if avant:
            self.coupes[nom] = avant
            self._noter("couper", nom, list(avant))

    async def _async_rendre(self, nom: str) -> None:
        avant = self.coupes.pop(nom, None)
        if not avant:
            return
        etats = self._etats()
        rendus = []
        for haid, valeur in avant.items():
            st = etats.get(haid)
            actuel = str(getattr(st, "state", "")).lower() if st else ""
            # On ne rend que ce qu'on a pris : si quelqu'un a rallume entre
            # temps, son geste l'emporte sur notre restauration.
            if actuel not in ("off", "unavailable", "unknown"):
                continue
            domaine, service, data = rend_pour(haid, valeur)
            await self._async_service(domaine, service, haid, data)
            rendus.append(haid)
        if rendus:
            self._noter("rendre", nom, rendus)

    # ── Outils ─────────────────────────────────────────────────────────────
    def _etats(self) -> dict:
        """Les etats des entites qui nous interessent, sous forme de table."""
        table = {}
        for piece in (self.cfg.get("pieces") or {}).values():
            if not isinstance(piece, dict):
                continue
            for haid in list(piece.get("ouvrants") or []) + list(piece.get("chauffages") or []):
                if haid not in table:
                    table[haid] = self.hass.states.get(haid)
        return table

    async def _async_service(self, domaine: str, service: str, haid: str, data: dict) -> None:
        charge = {"entity_id": haid}
        charge.update(data or {})
        try:
            await self.hass.services.async_call(domaine, service, charge, blocking=False)
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Loggia fenetres : %s.%s a echoue sur %s", domaine, service, haid)

    def _noter(self, quoi: str, piece: str, entites: list) -> None:
        self.journal.insert(0, {"quoi": quoi, "piece": piece,
                                "entites": list(entites), "ts": time.time()})
        del self.journal[30:]

    # ── Ce que l'interface lit et ecrit ────────────────────────────────────
    async def async_config(self) -> dict[str, Any]:
        brut = await self.store.async_get_shared(CLE, None)
        cfg = dict(DEFAUT)
        cfg["pieces"] = {}
        if isinstance(brut, dict):
            for k, v in brut.items():
                if k == "pieces" and isinstance(v, dict):
                    cfg["pieces"] = {n: dict(p) for n, p in v.items() if isinstance(p, dict)}
                elif k in cfg:
                    cfg[k] = v
        return cfg

    async def async_etat(self) -> dict[str, Any]:
        return {
            "config": self.cfg or await self.async_config(),
            "coupes": {n: sorted(v) for n, v in self.coupes.items()},
            "en_attente": sorted(self._minuteurs),
            "journal": list(self.journal),
        }

    async def async_enregistrer(self, patch: dict[str, Any]) -> dict[str, Any]:
        cfg = await self.async_config()
        for k, v in (patch or {}).items():
            if k == "pieces" and isinstance(v, dict):
                for nom, piece in v.items():
                    if piece is None:
                        cfg["pieces"].pop(nom, None)
                    elif isinstance(piece, dict):
                        cfg["pieces"].setdefault(nom, {}).update(piece)
            elif k in cfg:
                cfg[k] = v
        await self.store.async_set_shared(CLE, cfg)
        self.cfg = cfg
        await self._async_reabonner()
        return cfg

    @callback
    def async_arreter(self) -> None:
        for nom in list(self._minuteurs):
            self._desarmer(nom)
        for defaire in self._defait:
            try:
                defaire()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia fenetres : desabonnement sans effet")
        self._defait.clear()
