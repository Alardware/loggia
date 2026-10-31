"""Les minuteurs d'extinction : « eteindre dans 30 min », tenus par Home Assistant.

Pourquoi ce module existe
─────────────────────────
Retour du 21/09 : « pourquoi Loggia doit rester ouvert, c'est absurde, et je
n'ai pas le decompte ». Le minuteur vivait dans l'onglet du navigateur — un
`setTimeout` : fermer l'ecran l'annulait sans rien dire, un autre appareil ne
le voyait pas, et la ligne se contentait d'un « dans 30 min » arrondi. Il vit
desormais ICI : il part meme quand aucun ecran n'est ouvert, et chaque ecran
lit la meme heure de fin pour afficher le meme decompte.

Ce qui se passe quand...
────────────────────────
  * on reappuie : le temps s'AJOUTE a ce qui reste (+30 min, +30 min...) ;
  * l'appareil est eteint a la main avant l'heure : le minuteur s'efface — il
    n'avait plus d'objet, et il ne doit pas eteindre la lampe qu'on rallumera
    plus tard ;
  * Home Assistant redemarre : les minuteurs sont relus. Un minuteur echu
    pendant l'arret s'execute au demarrage — « eteindre dans 30 min » voulait
    dire « eteinte a telle heure », et cette heure est passee ;
  * l'appareil est deja eteint a l'heure dite : rien a faire, rien au journal ;
  * l'appareil ne repond pas a l'heure dite (« unavailable », « unknown », ou
    pas encore recree au demarrage) : l'extinction ATTEND son retour, au plus
    `ATTENTE_MAX` (24 h) apres l'heure — revenu allume, il s'eteint ; revenu
    eteint, il n'y a plus rien a faire ; muet au-dela, on renonce (28/10,
    ADR 0280) ;
  * on le pose sur un appareil deja eteint : il est refuse (`minuteur_deja_eteint`) —
    garde, il couperait l'appareil une fois rallume, a l'heure d'un geste
    oublie (audit du 19/10).

L'extinction est la MAIN de celui qui a pose le minuteur, differee : elle part
avec son contexte (`Context(user_id=...)`), comme un scenario, et laisse une
ligne au journal. Le compte qui pose un minuteur doit avoir le droit de piloter
l'appareil : le composant appelle le service lui-meme, la verification que Home
Assistant ferait d'un appel direct n'a donc pas lieu (audit 18/09).
"""
from __future__ import annotations

import copy
import logging
import time
from typing import TYPE_CHECKING, Any

from homeassistant.core import Context, HomeAssistant, callback

from .entites import motif_de
from .refus import RefusNomme
from .regles import demarrer

if TYPE_CHECKING:  # l'annotation seule — les tests chargent ce module hors paquet
    from .store import LoggiaStore

_LOGGER = logging.getLogger(__name__)

CLE = "loggia_minuteurs"
MODULE = "minuteurs"

# Ce qu'un minuteur sait eteindre : ce que les fiches proposent, et ce que
# `homeassistant.turn_off` eteint sans ambiguite.
DOMAINES = ("light", "switch", "fan", "input_boolean", "media_player")
ENTITE = motif_de(DOMAINES)

MAX_MINUTEURS = 50
PAS_MAX = 24 * 60            # un appui ajoute au plus une journee
TOTAL_MAX = 24 * 3600        # et un minuteur ne va jamais au-dela de 24 h

# Ce qui compte pour « deja eteint » : l'extinction n'a alors plus d'objet.
# Ce qui refuse aussi la POSE : un appareil coupe.
COUPE = {"off", "standby"}
# Un appareil qui ne repond plus (« unavailable », « unknown ») garde le droit
# au minuteur : il revient souvent allume, et doit s'eteindre. Jusqu'au 28/10,
# l'echeance le prenait pour eteint et abandonnait — la lampe revenue allumee
# le restait. Desormais l'extinction l'attend, au plus `ATTENTE_MAX` apres
# l'heure : un appareil parti pour de bon ne garde pas un rendez-vous eternel,
# et une lampe qui reviendrait trois jours plus tard ne s'eteint pas sur un
# geste oublie (ADR 0280).
MUET = {"unavailable", "unknown"}
ATTENTE_MAX = 24 * 3600


# ── Ce qui se calcule, sans Home Assistant ──────────────────────────────────

def valide(haid: Any) -> bool:
    # `fullmatch` (26/10) : avec `match`, le `$` de Python accepte un `\n` final.
    return isinstance(haid, str) and bool(ENTITE.fullmatch(haid))


def normaliser(brut: Any) -> dict[str, dict[str, Any]]:
    """La table relue du magasin : ce qui est illisible s'ecarte, le reste est
    garde TEL QUEL — y compris l'echu, que le demarrage doit executer."""
    propre: dict[str, dict[str, Any]] = {}
    if not isinstance(brut, dict):
        return propre
    for haid, e in brut.items():
        if not valide(haid) or not isinstance(e, dict):
            continue
        try:
            fin = float(e.get("fin"))
            duree = int(e.get("duree") or 0)
        except (TypeError, ValueError):
            continue
        if fin <= 0:
            continue
        par = e.get("par")
        propre[haid] = {"fin": fin, "duree": max(0, duree), "par": par if isinstance(par, str) else None}
        if len(propre) >= MAX_MINUTEURS:
            break
    return propre


def prolonger(table: dict, haid: str, minutes: Any, maintenant: float,
              par: str | None = None) -> dict[str, dict[str, Any]]:
    """Une NOUVELLE table ou le minuteur de `haid` finit `minutes` plus tard :
    apres ce qui reste s'il en reste, sinon a partir de maintenant."""
    if not valide(haid):
        raise ValueError("entite non minutable : %r" % (haid,))
    # Un ENTIER, et rien d'autre : 2,5 ne devient pas 2 en silence, et un
    # booleen n'est pas un nombre de minutes.
    if isinstance(minutes, bool) or not isinstance(minutes, int):
        raise ValueError("minutes : un nombre entier")
    n = minutes
    if n < 1 or n > PAS_MAX:
        raise ValueError("minutes : entre 1 et %d" % PAS_MAX)
    neuve = dict(table or {})
    actuel = neuve.get(haid)
    en_cours = bool(actuel and actuel["fin"] > maintenant)
    if not en_cours and len({h for h, e in neuve.items() if e["fin"] > maintenant}) >= MAX_MINUTEURS:
        raise ValueError("%d minuteurs au plus" % MAX_MINUTEURS)
    depart = actuel["fin"] if en_cours else maintenant
    fin = min(depart + n * 60, maintenant + TOTAL_MAX)
    duree = (actuel["duree"] if en_cours else 0) + n
    neuve[haid] = {"fin": fin, "duree": duree, "par": par}
    return neuve


def reste(table: dict, haid: str, maintenant: float) -> float | None:
    """Les secondes qui restent, ou None s'il n'y a pas de minuteur en cours."""
    e = (table or {}).get(haid)
    if not e or e["fin"] <= maintenant:
        return None
    return e["fin"] - maintenant


def echus(table: dict, maintenant: float) -> list[str]:
    return sorted(h for h, e in (table or {}).items() if e["fin"] <= maintenant)


def motif(entree: dict, rattrape: bool = False) -> str:
    base = ("minuteur de %d min" % entree["duree"]) if entree.get("duree") else "minuteur"
    return base + (" (echu pendant un redemarrage)" if rattrape else "")


def vue(table: dict, maintenant: float, controle: Any = None) -> dict[str, Any]:
    """Ce que l'ecran lit : les minuteurs EN COURS, et l'heure du serveur — le
    decompte se cale dessus, quelle que soit l'horloge de l'appareil. Un compte
    restreint ne voit que ce qu'il peut piloter. Jamais `par` : qui a pose un
    minuteur ne regarde pas les autres ecrans."""
    en_cours = {}
    for haid, e in (table or {}).items():
        if e["fin"] <= maintenant:
            continue
        if controle is not None and not controle(haid):
            continue
        en_cours[haid] = {"fin": e["fin"], "duree": e["duree"]}
    return {"minuteurs": en_cours, "maintenant": maintenant}


# ── Le module ───────────────────────────────────────────────────────────────

class LoggiaMinuteurs:
    """Tient les minuteurs d'extinction et eteint a l'heure."""

    def __init__(self, hass: HomeAssistant, store: "LoggiaStore", regles=None) -> None:
        self.hass = hass
        self.store = store
        self.regles = regles
        self.table: dict[str, dict[str, Any]] = {}
        self._rdv: dict[str, Any] = {}
        self._ecoute = None
        self._au_demarrage = None
        demarrer(hass, self, self._async_demarrer(), "minuteurs")

    async def _async_demarrer(self) -> None:
        self.table = normaliser(await self.store.async_get_shared(CLE, None))
        # Le rattrapage attend que Home Assistant ait FINI de demarrer (audit
        # du 03/10). Lance pendant la mise en place, il trouvait parfois la
        # lampe pas encore creee par son integration : le minuteur echu etait
        # efface sans rien eteindre, et la lampe restait allumee la nuit.
        # Deja demarre (un rechargement), il part aussitot.
        from homeassistant.helpers.start import async_at_started

        self._au_demarrage = async_at_started(self.hass, self._async_rattraper)

    async def _async_rattraper(self, _hass=None) -> None:
        self._au_demarrage = None
        maintenant = time.time()
        # Un minuteur qui leve ne coupe plus ceux qui suivent (28/10, ADR 0280) :
        # l'exception interrompait la boucle, et les autres n'etaient ni
        # executes, ni rearmes, ni reecoutes jusqu'au redemarrage suivant.
        for haid in echus(self.table, maintenant):
            try:
                await self._async_echoir(haid, rattrape=True)
            except Exception:  # noqa: BLE001
                _LOGGER.exception("Loggia minuteurs : le rattrapage de %s a echoue", haid)
        for haid in list(self.table):
            self._armer(haid)
        self._reecouter()
        if self.table:
            _LOGGER.info("Loggia minuteurs : %d en cours", len(self.table))

    # ── Les rendez-vous ────────────────────────────────────────────────────
    def _armer(self, haid: str) -> None:
        self._desarmer(haid)
        e = self.table.get(haid)
        if not e:
            return
        from homeassistant.helpers.event import async_call_later

        @callback
        def echu(_now) -> None:
            self._rdv.pop(haid, None)
            self.hass.async_create_task(self._async_echoir(haid))

        maintenant = time.time()
        # Echu et en attente d'un appareil muet : le rendez-vous est celui du
        # renoncement, `ATTENTE_MAX` apres l'heure. Son retour, lui, passe par
        # l'ecoute des etats (`_sur_etat`).
        quand = e["fin"] if e["fin"] > maintenant else e["fin"] + ATTENTE_MAX
        self._rdv[haid] = async_call_later(self.hass, max(0.0, quand - maintenant), echu)

    def _desarmer(self, haid: str) -> None:
        annule = self._rdv.pop(haid, None)
        if annule:
            try:
                annule()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia minuteurs : rendez-vous deja passe")

    # ── Une lampe eteinte a la main n'a plus de minuteur ───────────────────
    def _reecouter(self) -> None:
        if self._ecoute:
            try:
                self._ecoute()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia minuteurs : ecoute deja retiree")
            self._ecoute = None
        ids = sorted(self.table)
        if not ids:
            return
        from homeassistant.helpers.event import async_track_state_change_event

        self._ecoute = async_track_state_change_event(self.hass, ids, self._sur_etat)

    @callback
    def _sur_etat(self, event) -> None:
        d = event.data or {}
        haid = d.get("entity_id")
        neuf = d.get("new_state")
        # « off » seulement : une lampe Zigbee qui decroche une minute n'a pas
        # ete eteinte, son minuteur doit tenir.
        if haid not in self.table or neuf is None:
            return
        etat = str(neuf.state).lower()
        if etat == "off":
            self.hass.async_create_task(self.async_annuler(haid))
        elif etat not in MUET and self.table[haid]["fin"] <= time.time():
            # Echu pendant son absence : il revient, l'extinction part (ADR 0280).
            self.hass.async_create_task(self._async_echoir(haid))

    # ── L'extinction ───────────────────────────────────────────────────────
    async def _async_echoir(self, haid: str, rattrape: bool = False) -> None:
        """L'heure est venue : eteindre D'ABORD, sauvegarder ensuite (28/10,
        ADR 0280). La sauvegarde passait avant l'extinction et sans garde : une
        ecriture refusee (plafond du magasin, disque) laissait l'appareil
        allume. Ecrite apres, une sauvegarde ratee laisse au pire une entree
        sur le disque, que le prochain demarrage trouve eteinte et efface."""
        entree = self.table.get(haid)
        self._desarmer(haid)
        if entree is None:
            return
        st = self.hass.states.get(haid)
        etat = str(st.state).lower() if st is not None else None
        if (etat is None or etat in MUET) and time.time() - entree["fin"] < ATTENTE_MAX:
            # Il ne repond pas : l'extinction l'attend (son retour passe par
            # `_sur_etat`), et le renoncement est arme.
            self._armer(haid)
            return
        self.table.pop(haid, None)
        eteint = False
        if etat is not None and etat not in MUET and etat not in COUPE:
            ctx = Context(user_id=entree["par"]) if entree.get("par") else Context()
            try:
                await self.hass.services.async_call("homeassistant", "turn_off", {"entity_id": [haid]},
                                                    blocking=False, context=ctx)
                eteint = True
            except Exception:  # noqa: BLE001
                _LOGGER.exception("Loggia minuteurs : l'extinction de %s a echoue", haid)
        elif etat is None or etat in MUET:
            _LOGGER.info("Loggia minuteurs : %s n'est pas revenu dans les %d h, l'extinction est abandonnee",
                         haid, ATTENTE_MAX // 3600)
        try:
            await self._sauver()
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Loggia minuteurs : la table n'a pas pu etre sauvegardee apres %s", haid)
        self._reecouter()
        if eteint and self.regles is not None:
            await self.regles.noter(MODULE, "minuteur", "eteindre", cibles=[haid], n=1,
                                    motif=motif(entree, rattrape))

    async def _sauver(self) -> None:
        # Une COPIE au magasin (28/10, ADR 0280) : la table vivante, rangee
        # telle quelle dans son cache, etait ensuite modifiee avant l'ecriture —
        # un refus de plafond laissait le cache different du disque.
        await self.store.async_set_shared(CLE, copy.deepcopy(self.table))

    # ── Ce que l'interface lit et ecrit ────────────────────────────────────
    def async_etat(self, controle: Any = None) -> dict[str, Any]:
        return vue(self.table, time.time(), controle)

    async def async_poser(self, haid: str, minutes: Any, par: str | None = None,
                          controle: Any = None) -> dict[str, Any]:
        if not valide(haid):
            raise ValueError("entite non minutable : %r" % (haid,))
        if controle is not None and not controle(haid):
            raise PermissionError("pas le droit de piloter %s" % haid)
        st = self.hass.states.get(haid)
        if st is None:
            raise ValueError("entite inconnue : %s" % haid)
        if str(st.state).lower() in COUPE:
            raise RefusNomme("minuteur_deja_eteint", "appareil deja eteint", haid)
        self.table = prolonger(self.table, haid, minutes, time.time(), par)
        await self._sauver()
        self._armer(haid)
        self._reecouter()
        # La pose se note au journal (chantier Prises, spec 6.3) : le journal du
        # jour d'une prise la dit (« minuteur · 30 min »). `n`, dans les parties :
        # les minutes de CET appui, ajoutees a ce qui restait. Jamais `par`.
        if self.regles is not None:
            await self.regles.noter(MODULE, "minuteur", "poser", cibles=[haid], n=1,
                                    motif=("{n} min", {"n": minutes}))
        return self.async_etat(controle)

    async def async_annuler(self, haid: str, controle: Any = None) -> dict[str, Any]:
        if controle is not None and not controle(haid):
            raise PermissionError("pas le droit de piloter %s" % haid)
        if self.table.pop(haid, None) is not None:
            self._desarmer(haid)
            await self._sauver()
            self._reecouter()
        return self.async_etat(controle)

    @callback
    def async_arreter(self) -> None:
        if self._au_demarrage:
            self._au_demarrage()
            self._au_demarrage = None
        for haid in list(self._rdv):
            self._desarmer(haid)
        if self._ecoute:
            try:
                self._ecoute()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia minuteurs : desabonnement sans effet")
            self._ecoute = None
