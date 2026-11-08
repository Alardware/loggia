"""Les rappels : « me prevenir a 22 h 30 », tenus par Home Assistant (07/11, usage etape 11).

Pourquoi ce module existe
─────────────────────────
La vue Energie disait ce qui s'etait passe, pas quoi faire. Elle conseille
desormais de lancer le lave-vaisselle aux heures creuses — ou au moment le
moins cher d'un prix qui varie —, et le geste qui suit ce conseil est un
RAPPEL : a l'heure dite, le telephone de celui qui l'a demande recoit
« Prise lave-vaisselle : les heures creuses commencent ». Son choix du 07/11 :
prevenir, jamais couper puis rallumer la prise — beaucoup de machines ne
repartent pas seules au retour du courant.

Une action differee vit ICI, jamais dans l'onglet (ADR 0064) : l'ecran ferme,
le rappel part quand meme, et chaque ecran du compte voit le meme.

Ce qui se passe quand...
────────────────────────
  * on le repose pour le meme appareil : il REMPLACE le precedent ;
  * l'appareil a demarre avant l'heure (un cycle en cours, prises.py) : le
    rappel n'a plus d'objet, il se tait ;
  * Home Assistant redemarre : les rappels sont relus ; un rappel echu pendant
    l'arret part s'il a moins de `RETARD_MAX` de retard, sinon il s'oublie —
    « les heures creuses commencent » trois heures apres tromperait ;
  * le compte n'a pas de telephone : rien ne part, le journal le dit — et
    l'ecran ne propose pas le bouton (`peut`).

Le texte est construit ICI, d'un gabarit du catalogue et du nom de la prise :
l'ecran n'envoie ni phrase ni nom. Il part vers les telephones du compte qui
l'a pose (`regles.prevenir(compte=…)`), jamais vers ceux des autres. Un compte
ne voit et n'annule que SES rappels ; qui pose vient de la session, jamais du
message.
"""
from __future__ import annotations

import copy
import logging
import secrets
import time
from typing import TYPE_CHECKING, Any

from homeassistant.core import HomeAssistant, callback

from .entites import motif_de
from .regles import demarrer

if TYPE_CHECKING:  # l'annotation seule — les tests chargent ce module hors paquet
    from .store import LoggiaStore

_LOGGER = logging.getLogger(__name__)

CLE = "loggia_rappels"
MODULE = "rappels"

# Ce qu'un rappel peut nommer : une prise (l'electromenager qu'on lancera).
ENTITE = motif_de(("switch",))
# Le moment que le rappel annonce : le debut des heures creuses, ou celui du
# creux d'un prix qui varie (`fenetreMoinsChere`, tarif.js).
SORTES = ("hc", "creux")
# (regle du journal, gabarit du telephone), par (sorte, prise nommee) : une
# table de messages, la forme que la garde des traductions sait lire
# (tests/python/test_lot16_alertes_traduites.py).
MESSAGES = {
    ("hc", True): ("rappel", "{nom} : les heures creuses commencent"),
    ("hc", False): ("rappel", "Les heures creuses commencent"),
    ("creux", True): ("rappel", "{nom} : le moment le moins cher commence"),
    ("creux", False): ("rappel", "Le moment le moins cher commence"),
}

MAX_PAR_COMPTE = 10
MAX_RAPPELS = 100
AVANCE_MIN = 30              # un rappel dans moins de 30 s n'en est pas un
HORIZON = 24 * 3600          # ni au-dela d'une journee
RETARD_MAX = 15 * 60         # echu pendant un arret : il part s'il a moins de 15 min de retard


# ── Ce qui se calcule, sans Home Assistant ──────────────────────────────────

def entite_valide(haid: Any) -> bool:
    return isinstance(haid, str) and bool(ENTITE.fullmatch(haid))


def normaliser(brut: Any) -> dict[str, dict[str, Any]]:
    """La table relue du magasin : ce qui est illisible s'ecarte, le reste est
    garde TEL QUEL — y compris l'echu, que le demarrage doit regarder."""
    propre: dict[str, dict[str, Any]] = {}
    if not isinstance(brut, dict):
        return propre
    for rid, e in brut.items():
        if not isinstance(rid, str) or not rid or not isinstance(e, dict):
            continue
        try:
            quand = float(e.get("quand"))
        except (TypeError, ValueError):
            continue
        par, entite, sorte = e.get("par"), e.get("entite"), e.get("sorte")
        if not quand > 0 or not isinstance(par, str) or not par or sorte not in SORTES:
            continue
        if entite is not None and not entite_valide(entite):
            continue
        propre[rid] = {"quand": quand, "par": par, "entite": entite, "sorte": sorte}
        if len(propre) >= MAX_RAPPELS:
            break
    return propre


def poser(table: dict, quand: Any, sorte: Any, entite: Any, par: Any, maintenant: float,
          rid: str) -> dict[str, dict[str, Any]]:
    """Une NOUVELLE table avec ce rappel : il remplace celui que ce compte avait
    deja pose pour le meme appareil (ou sans appareil)."""
    if isinstance(quand, bool) or not isinstance(quand, (int, float)):
        raise ValueError("quand : un instant, en secondes")
    if not maintenant + AVANCE_MIN <= quand <= maintenant + HORIZON:
        raise ValueError("quand : dans les prochaines 24 h")
    if sorte not in SORTES:
        raise ValueError("sorte : hc ou creux")
    if entite is not None and not entite_valide(entite):
        raise ValueError("entite : une prise")
    if not isinstance(par, str) or not par:
        raise ValueError("compte inconnu")
    neuve = {k: v for k, v in (table or {}).items() if not (v["par"] == par and v["entite"] == entite)}
    if sum(1 for v in neuve.values() if v["par"] == par) >= MAX_PAR_COMPTE or len(neuve) >= MAX_RAPPELS:
        raise ValueError("%d rappels au plus" % MAX_PAR_COMPTE)
    neuve[rid] = {"quand": float(quand), "par": par, "entite": entite, "sorte": sorte}
    return neuve


def echus(table: dict, maintenant: float) -> list[str]:
    return sorted(r for r, e in (table or {}).items() if e["quand"] <= maintenant)


def cle_message(entree: dict, nom: str) -> tuple[str, bool]:
    """La cle de `MESSAGES` : la phrase qui nomme la prise quand on lit son
    nom, sinon celle de la maison."""
    return (entree["sorte"], bool(entree.get("entite")) and bool(nom))


def vue(table: dict, par: Any, maintenant: float) -> dict[str, Any]:
    """Ce que l'ecran lit : les rappels A VENIR de CE compte, et l'heure du
    serveur. Jamais ceux des autres, jamais `par`."""
    siens = [{"id": r, "quand": e["quand"], "entite": e["entite"], "sorte": e["sorte"]}
             for r, e in sorted((table or {}).items(), key=lambda x: (x[1]["quand"], x[0]))
             if e["par"] == par and e["quand"] > maintenant]
    return {"rappels": siens, "maintenant": maintenant}


# ── Le module ───────────────────────────────────────────────────────────────

class LoggiaRappels:
    """Tient les rappels et previent a l'heure."""

    def __init__(self, hass: HomeAssistant, store: "LoggiaStore", regles=None) -> None:
        self.hass = hass
        self.store = store
        self.regles = regles
        self.table: dict[str, dict[str, Any]] = {}
        self._rdv: dict[str, Any] = {}
        self._au_demarrage = None
        demarrer(hass, self, self._async_demarrer(), "rappels")

    async def _async_demarrer(self) -> None:
        self.table = normaliser(await self.store.async_get_shared(CLE, None))
        # Comme les minuteurs : le rattrapage attend la fin du demarrage — les
        # telephones (`notify.mobile_app_*`) et les prises y sont alors.
        from homeassistant.helpers.start import async_at_started

        self._au_demarrage = async_at_started(self.hass, self._async_rattraper)

    async def _async_rattraper(self, _hass=None) -> None:
        self._au_demarrage = None
        maintenant = time.time()
        for rid in echus(self.table, maintenant):
            try:
                await self._async_echoir(rid, maintenant=maintenant)
            except Exception:  # noqa: BLE001
                _LOGGER.exception("Loggia rappels : le rattrapage de %s a echoue", rid)
        for rid in list(self.table):
            self._armer(rid)

    # ── Les rendez-vous ────────────────────────────────────────────────────
    def _armer(self, rid: str) -> None:
        self._desarmer(rid)
        e = self.table.get(rid)
        if not e:
            return
        from homeassistant.helpers.event import async_call_later

        @callback
        def echu(_now) -> None:
            self._rdv.pop(rid, None)
            self.hass.async_create_task(self._async_echoir(rid))

        self._rdv[rid] = async_call_later(self.hass, max(0.0, e["quand"] - time.time()), echu)

    def _desarmer(self, rid: str) -> None:
        annule = self._rdv.pop(rid, None)
        if annule:
            try:
                annule()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia rappels : rendez-vous deja passe")

    # ── L'heure est venue ──────────────────────────────────────────────────
    def _en_cycle(self, haid: Any) -> bool:
        """L'appareil tourne-t-il deja ? Le module des prises, cherche au moment
        de servir (sa memoire, `suivi.en_cours`) : sans lui, on previent."""
        if not haid:
            return False
        prises = ((getattr(self.hass, "data", None) or {}).get("loggia") or {}).get("prises")
        memoire = getattr(prises, "memoire", None)
        suivi = (memoire.get(haid) or {}).get("suivi") if isinstance(memoire, dict) else None
        return isinstance(suivi, dict) and suivi.get("en_cours") is True

    def _nom(self, haid: Any) -> str:
        """Le nom qu'on lit, comme la fin d'un cycle le dit (`friendly_name`)."""
        st = self.hass.states.get(haid) if haid else None
        nom = (getattr(st, "attributes", None) or {}).get("friendly_name")
        return nom if isinstance(nom, str) else ""

    async def _async_echoir(self, rid: str, maintenant: float | None = None) -> None:
        """Prevenir D'ABORD, sauvegarder ensuite : une ecriture refusee ne doit
        pas taire un rappel (la lecon des minuteurs, ADR 0280)."""
        entree = self.table.pop(rid, None)
        self._desarmer(rid)
        if entree is None:
            return
        retard = (time.time() if maintenant is None else maintenant) - entree["quand"]
        if retard > RETARD_MAX:
            _LOGGER.info("Loggia rappels : %s oublie, echu depuis %d min pendant un arret", rid, retard // 60)
        elif self._en_cycle(entree.get("entite")):
            _LOGGER.debug("Loggia rappels : %s se tait, l'appareil tourne deja", rid)
        elif self.regles is not None:
            nom = self._nom(entree.get("entite"))
            regle, msg = MESSAGES[cle_message(entree, nom)]
            await self.regles.prevenir(MODULE, regle, (msg, {"nom": nom}), compte=entree["par"])
        try:
            await self._sauver()
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Loggia rappels : la table n'a pas pu etre sauvegardee apres %s", rid)

    async def _sauver(self) -> None:
        # Une COPIE au magasin, comme les minuteurs (ADR 0280).
        await self.store.async_set_shared(CLE, copy.deepcopy(self.table))

    # ── Ce que l'interface lit et ecrit ────────────────────────────────────
    async def async_etat(self, par: Any) -> dict[str, Any]:
        """Les rappels du compte, l'heure du serveur, et `peut` : ce compte a-t-il
        un telephone ou les recevoir ? Sans lui, l'ecran ne propose pas le bouton.
        `calme` : les heures calmes quand elles sont actives — un rappel qui y
        tombe arrive sans sonner, et l'ecran le dit avant."""
        out = vue(self.table, par, time.time())
        out["peut"] = bool(self.regles is not None and await self.regles.services_du_compte(par))
        out["calme"] = await self.regles.plage_calme() if self.regles is not None else None
        return out

    async def async_poser(self, quand: Any, sorte: Any, entite: Any = None, par: Any = None,
                          controle: Any = None) -> dict[str, Any]:
        if entite is not None:
            if not entite_valide(entite):
                raise ValueError("entite : une prise")
            # Le rappel ne commande rien : il nomme la prise qu'on LANCERA. Un
            # compte ne nomme que ce qu'il pilote, comme pour un minuteur.
            if controle is not None and not controle(entite):
                raise PermissionError("pas le droit de piloter %s" % entite)
            if self.hass.states.get(entite) is None:
                raise ValueError("entite inconnue : %s" % entite)
        rid = secrets.token_hex(6)
        self.table = poser(self.table, quand, sorte, entite, par, time.time(), rid)
        # Ceux qu'il remplace ne sont plus dans la table : leurs rendez-vous partent.
        for ancien in [r for r in self._rdv if r not in self.table]:
            self._desarmer(ancien)
        await self._sauver()
        self._armer(rid)
        return await self.async_etat(par)

    async def async_annuler(self, rid: Any, par: Any = None) -> dict[str, Any]:
        e = self.table.get(rid) if isinstance(rid, str) else None
        if e is not None and e["par"] == par:
            self.table.pop(rid, None)
            self._desarmer(rid)
            await self._sauver()
        return await self.async_etat(par)

    @callback
    def async_arreter(self) -> None:
        if self._au_demarrage:
            self._au_demarrage()
            self._au_demarrage = None
        for rid in list(self._rdv):
            self._desarmer(rid)
