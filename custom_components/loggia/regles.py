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
declarees et du mode simulation — sans une ligne de plus.

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

import logging
import time
from typing import Any

from homeassistant.core import Context, HomeAssistant, callback

_LOGGER = logging.getLogger(__name__)

# Le journal vit dans SON fichier, pas dans la configuration.
#
# Melange a elle, il l'aurait gonflee a chaque manoeuvre, aurait voyage dans
# chaque synchronisation entre appareils, et se serait heurte aux plafonds de
# taille de `store.py`. Il n'appartient d'ailleurs a personne : c'est ce que la
# maison a fait, pas un reglage de quelqu'un.
CLE_JOURNAL = "loggia_journal"
VERSION_JOURNAL = 1

# Deux cents lignes : de quoi remonter plusieurs jours de manoeuvres sans que
# le fichier ne devienne un poids.
MAX_JOURNAL = 200

# L'ecriture est differee : une soiree de volets, ce sont quelques dizaines
# d'entrees en deux minutes, et autant d'ecritures disque pour rien.
DELAI_ECRITURE = 20.0

# Combien de temps une entite touchee a la main echappe aux regles.
GEL_DEFAUT = 30 * 60

# Combien de temps une tenue survit si la regle qui l'a prise oublie de la
# rendre. Un filet, pas un reglage : les regles rendent leurs tenues.
TENUE_MAX = 12 * 3600


class Regles:
    """Journal, geste manuel, et l'entonnoir par lequel toute regle commande."""

    def __init__(self, hass: HomeAssistant, store: Any) -> None:
        self.hass = hass
        self.store = store
        self._entrees: list[dict[str, Any]] = []
        self._charge = False
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
        self._ecriture = None
        self._depot = None

    # ── Le journal ─────────────────────────────────────────────────────────
    def _store_journal(self):
        if self._depot is None:
            from homeassistant.helpers.storage import Store

            self._depot = Store(self.hass, VERSION_JOURNAL, CLE_JOURNAL)
        return self._depot

    async def _charger(self) -> None:
        if self._charge:
            return
        self._charge = True
        try:
            brut = await self._store_journal().async_load()
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Loggia regles : journal illisible, on repart a vide")
            brut = None
        if isinstance(brut, dict) and isinstance(brut.get("entrees"), list):
            self._entrees = [e for e in brut["entrees"] if isinstance(e, dict)][:MAX_JOURNAL]

    @callback
    def _programmer_ecriture(self) -> None:
        """Ecrit le journal, mais pas a chaque ligne."""
        if self._ecriture is not None:
            return
        from homeassistant.helpers.event import async_call_later

        @callback
        def ecrire(_now):
            self._ecriture = None
            self.hass.async_create_task(self._ecrire())

        self._ecriture = async_call_later(self.hass, DELAI_ECRITURE, ecrire)

    async def _ecrire(self) -> None:
        try:
            await self._store_journal().async_save({"entrees": self._entrees[:MAX_JOURNAL]})
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Loggia regles : journal non enregistre")

    async def noter(self, module: str, regle: str, quoi: str, *,
                    cibles=(), n: int | None = None, motif: str = "",
                    detail: str = "", simule: bool = False) -> dict[str, Any]:
        """Une ligne de journal, commune a toutes les regles.

        `motif` est ce qui a declenche — « lever + 30 », « vent 62 km/h »,
        « personne depuis 20 min ». C'est la colonne qui manque partout
        ailleurs : sans elle, on lit qu'un volet s'est ferme sans savoir
        pourquoi, et l'on ne peut ni corriger ni faire confiance.
        """
        await self._charger()
        cibles = [h for h in cibles if isinstance(h, str)]
        entree = {
            "ts": time.time(),
            "module": module,
            "regle": regle,
            "quoi": quoi,
            "cibles": cibles,
            "n": len(cibles) if n is None else int(n),
            "motif": motif,
            "detail": detail,
            # Ce qui AURAIT ete fait : le mode simulation. L'ecran le marque,
            # pour qu'on ne cherche pas pourquoi rien n'a bouge.
            "simule": bool(simule),
        }
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

    # ── Les priorites ──────────────────────────────────────────────────────
    def _tenue(self, haid: str):
        """La tenue en cours sur cette entite, ou None — echue, elle tombe."""
        t = self._tenues.get(haid)
        if t is not None and time.time() >= t["fin"]:
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

    def tenues(self, module: str) -> dict[str, str]:
        """Ce que tiennent les regles d'un module : {entity_id: regle}."""
        return {h: t["regle"] for h, t in list(self._tenues.items())
                if t["module"] == module and self._tenue(h) is not None}

    def relacher(self, module: str, regle: str | None = None, cibles=None) -> None:
        """Rend ce qu'une regle tenait — tout le module si `regle` est None."""
        for haid, t in list(self._tenues.items()):
            if t["module"] != module or (regle is not None and t["regle"] != regle):
                continue
            if cibles is not None and haid not in cibles:
                continue
            del self._tenues[haid]

    # ── L'entonnoir ────────────────────────────────────────────────────────
    async def agir(self, module: str, regle: str, domaine: str, service: str,
                   cibles, data: dict | None = None, *,
                   quoi: str = "", motif: str = "", priorite: int = 0,
                   tenir: bool = False, simuler: bool = False) -> list:
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

        `simuler` : rien ne part. Le journal note ce qui SERAIT parti, et les
        tenues bougent comme en vrai — la simulation raconte la meme histoire
        que le reel, sans toucher a la maison.
        """
        await self._charger()
        demandees = [h for h in cibles if isinstance(h, str)]
        geles = [h for h in demandees if self.gele(h)]
        tenus_par: dict[str, int] = {}
        retenues = []
        for h in demandees:
            if h in geles:
                continue
            t = self._tenue(h)
            if (t is not None and (t["module"], t["regle"]) != (module, regle)
                    and t["priorite"] > priorite):
                tenus_par[t["regle"]] = tenus_par.get(t["regle"], 0) + 1
                continue
            retenues.append(h)

        if retenues and not simuler:
            # Un contexte a NOUS : les changements d'etat qui en decouleront
            # seront reconnus comme les notres, et non pris pour une main.
            ctx = Context()
            self._miens.append(ctx.id)
            del self._miens[:-64]
            charge: dict[str, Any] = {"entity_id": retenues}
            if data:
                charge.update(data)
            try:
                await self.hass.services.async_call(
                    domaine, service, charge, blocking=False, context=ctx)
            except Exception:  # noqa: BLE001
                _LOGGER.exception("Loggia regles : %s.%s a echoue", domaine, service)
                retenues = []

        for h in retenues:
            if tenir:
                self._tenues[h] = {"module": module, "regle": regle,
                                   "priorite": priorite, "fin": time.time() + TENUE_MAX}
            else:
                self._tenues.pop(h, None)

        details = []
        if geles:
            details.append("%d sous la main de quelqu'un" % len(geles))
        for autre, nb in tenus_par.items():
            details.append("%d tenu%s par %s" % (nb, "s" if nb > 1 else "", autre))
        await self.noter(module, regle, quoi or service, cibles=retenues,
                         motif=motif, detail=" · ".join(details), simule=simuler)
        return retenues

    @callback
    def arreter(self) -> None:
        if self._defait_gestes is not None:
            try:
                self._defait_gestes()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia regles : ecoute deja retiree")
            self._defait_gestes = None
        if self._ecriture is not None:
            try:
                self._ecriture()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia regles : ecriture deja annulee")
            self._ecriture = None
