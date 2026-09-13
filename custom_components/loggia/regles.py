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
declarees et du mode simulation — sans une ligne de plus. `prevenir()` fait de
meme pour ce qui se dit au telephone : un seul canal, deux regimes.

── Les heures calmes, et le seul canal qui les contourne ───────────────────

Entre deux heures — la nuit, en general — rien ne doit sonner. Une regle qui
reveille la maison pour une pile a plat se fait debrancher dans la semaine.
Les notifications partent quand meme, silencieuses : on les lira au reveil.

Une seule chose passe par-dessus, et par-dessus le mode silencieux du
telephone avec : le DANGER. Fumee, gaz, monoxyde, fuite, alarme. Tout le reste
attend.

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

import copy
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

# Cinq cents lignes : plusieurs jours d'une maison active — sept modules et
# les notifications dedans —, pour un fichier qui reste leger. On garde par
# le nombre, pas par la date : la taille reste bornee quelle que soit la
# maison.
MAX_JOURNAL = 500

# L'ecriture est differee : une soiree de volets, ce sont quelques dizaines
# d'entrees en deux minutes, et autant d'ecritures disque pour rien.
DELAI_ECRITURE = 20.0

# Combien de temps une entite touchee a la main echappe aux regles.
GEL_DEFAUT = 30 * 60

# Combien de temps une tenue survit si la regle qui l'a prise oublie de la
# rendre. Un filet, pas un reglage : les regles rendent leurs tenues.
TENUE_MAX = 12 * 3600

# L'echelle de la maison : quatre paliers, du plus fort au plus faible. Avant
# elle, les priorites ne valaient qu'a l'interieur d'un module, et deux
# modules visant la meme lampe — la nuit eteint, l'eclairage doux allume, le
# depart eteint tout — se battaient sans arbitre.
#
#   surete    le danger, le vent fort, la fenetre ouverte qui coupe le
#             chauffage : ce qu'on ne discute pas ;
#   presence  le depart, le retour, l'invite ;
#   nuit      la fermeture du soir, l'extinction, la veilleuse ;
#   confort   la protection solaire, l'ouverture du matin, l'eclairage doux.
#
# Une regle prend son niveau dans son palier — `niveau("nuit", 5)` — et ne se
# compare aux autres que par ce nombre. Au-dessus de tous : une main.
ECHELLE = {"surete": 100, "presence": 80, "nuit": 60, "confort": 40}


def niveau(palier: str, rang: int = 0) -> int:
    """Le niveau d'une regle : son palier, plus son rang dans le palier.

    Le rang va de 0 a 19 : un palier ne mord jamais sur le suivant, quel que
    soit le zele d'un module. Un palier inconnu est une erreur, pas un defaut
    silencieux — une regle qui ne sait pas ou se placer se place en confort,
    et le dit.
    """
    if palier not in ECHELLE:
        raise ValueError("palier inconnu : %r" % (palier,))
    return ECHELLE[palier] + max(0, min(19, int(rang)))

# La configuration des alertes — le telephone choisi, et les heures calmes —
# vit sous cette cle, ecrite par Parametres > Alertes.
CLE_ALERTES = "loggia_alertes"

# Ce qui fait sonner une notification par-dessus le mode silencieux du
# telephone. Android et iOS lisent chacun leurs cles et ignorent les autres :
# on envoie les deux. Android : le canal « alarm_stream » sonne sur le flux
# des alarmes, que « Ne pas deranger » ne coupe pas. iOS : le son critique,
# que l'app compagnon est autorisee a emettre.
CRITIQUE: dict[str, Any] = {
    "ttl": 0, "priority": "high", "channel": "alarm_stream", "importance": "high",
    "push": {"sound": {"name": "default", "critical": 1, "volume": 1.0},
             "interruption-level": "critical"},
}
# Et ce qui la rend silencieuse : elle arrive, elle ne sonne pas.
SILENCIEUSE: dict[str, Any] = {"importance": "low", "push": {"sound": "none"}}


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
        # Qui veut savoir qu'une main s'est posee : la presence, pour qui un
        # geste pendant le decompte de depart dit que quelqu'un est la (§10).
        self._sur_main: list = []
        self.derniere_main: float = 0.0
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
        self._prevenir_main(haid)

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

    async def geler(self, module: str, regle: str, cibles, *,
                    quoi: str = "main", motif: str = "") -> list:
        """Une main qui ne passe pas par Home Assistant.

        Un interrupteur sans fil passe par Loggia, qui appelle le service sans
        contexte d'utilisateur : pour l'ecoute des changements d'etat, c'est
        une automatisation. Or c'est un humain qui a appuye. Le module le
        declare donc ici, entite par entite : gel, tenue reprise, et une
        ligne au journal qui dit « bouton ».
        """
        haids = [h for h in cibles if isinstance(h, str)]
        for h in haids:
            self._gel[h] = time.time() + self.duree_gel
            self._tenues.pop(h, None)
            self._prevenir_main(h)
        await self.noter(module, regle, quoi, cibles=haids, motif=motif)
        return haids

    def ecouter_mains(self, rappel):
        """Prevenir `rappel(entity_id)` a chaque main posee sur une entite
        suivie — par Home Assistant ou declaree par un module (`geler`).
        Rend la fonction qui retire l'ecoute."""
        self._sur_main.append(rappel)

        def retirer():
            try:
                self._sur_main.remove(rappel)
            except ValueError:
                pass
        return retirer

    def _prevenir_main(self, haid: str) -> None:
        self.derniere_main = time.time()
        for rappel in list(self._sur_main):
            try:
                rappel(haid)
            except Exception:  # noqa: BLE001
                _LOGGER.exception("Loggia regles : un abonne aux mains a echoue")

    def gels(self) -> dict:
        """Ce qu'une main retient en ce moment : {entity_id: secondes restantes}."""
        return {h: self.gel_restant(h) for h in list(self._gel) if self.gele(h)}

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

    def tenues_toutes(self) -> dict:
        """Ce que tient chaque regle de la maison, pour l'ecran :
        {entity_id: {"module", "regle"}}. Les tenues echues n'y sont pas."""
        return {h: {"module": t["module"], "regle": t["regle"]}
                for h, t in list(self._tenues.items()) if self._tenue(h) is not None}

    def relacher(self, module: str, regle: str | None = None, cibles=None) -> None:
        """Rend ce qu'une regle tenait — tout le module si `regle` est None."""
        for haid, t in list(self._tenues.items()):
            if t["module"] != module or (regle is not None and t["regle"] != regle):
                continue
            if cibles is not None and haid not in cibles:
                continue
            del self._tenues[haid]

    # ── Le telephone ───────────────────────────────────────────────────────
    async def _alertes(self) -> dict:
        try:
            cfg = await self.store.async_get_shared(CLE_ALERTES, None)
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Loggia regles : configuration des alertes illisible")
            return {}
        return cfg if isinstance(cfg, dict) else {}

    def _maintenant(self):
        from homeassistant.util import dt as dt_util

        return dt_util.now()

    @staticmethod
    def _minutes(hhmm):
        """« 22:30 » -> 1350. None si ce n'est pas une heure."""
        try:
            h, m = str(hhmm).strip().split(":")[:2]
            h, m = int(h), int(m)
        except (TypeError, ValueError, AttributeError):
            return None
        if not (0 <= h < 24 and 0 <= m < 60):
            return None
        return h * 60 + m

    @staticmethod
    def dans_la_plage(plage, quand) -> bool:
        """`quand` tombe-t-il dans les heures calmes `plage` ?

        La plage traverse minuit le plus souvent — 22 h a 7 h — et c'est le
        cas qui se rate : « entre 22 et 7 » ne se teste pas avec un simple
        encadrement.
        """
        if not isinstance(plage, dict) or not plage.get("actif"):
            return False
        debut = Regles._minutes(plage.get("debut", "22:00"))
        fin = Regles._minutes(plage.get("fin", "07:00"))
        if debut is None or fin is None or debut == fin:
            return False
        t = quand.hour * 60 + quand.minute
        if debut < fin:
            return debut <= t < fin
        return t >= debut or t < fin

    async def calme(self) -> bool:
        """Est-on dans les heures calmes ? Pour qui veut se taire — une voix
        sur une enceinte, une lumiere qui clignote."""
        return self.dans_la_plage((await self._alertes()).get("calme"), self._maintenant())

    async def prevenir(self, module: str, regle: str, message: str, *,
                       titre: str = "Loggia", critique: bool = False,
                       motif: str = "", simuler: bool = False) -> bool:
        """Previent quelqu'un, par le telephone choisi dans Parametres > Alertes.

        Deux regimes, et rien entre les deux :

          * CRITIQUE — fumee, gaz, monoxyde, fuite, alarme. Passe toujours, et
            par-dessus le mode silencieux du telephone. C'est le SEUL canal
            qui contourne les heures calmes ;
          * tout le reste. Pendant les heures calmes, la notification part
            quand meme — on la lira au reveil — mais ne sonne pas.

        Chaque envoi laisse une ligne au journal, avec son regime : quand rien
        n'a sonne cette nuit, on sait si c'etait voulu. Rend vrai si quelque
        chose est parti.
        """
        await self._charger()
        cfg = await self._alertes()
        service = str(cfg.get("service") or "").strip()
        quoi = "alerter" if critique else "prevenir"
        if not service:
            await self.noter(module, regle, quoi, n=0, motif=motif,
                             detail="personne a qui parler · " + message)
            return False
        if not self.hass.services.has_service("notify", service):
            await self.noter(module, regle, quoi, n=0, motif=motif,
                             detail="notify.%s introuvable · %s" % (service, message))
            return False
        charge: dict[str, Any] = {"title": titre, "message": message}
        regime = ""
        if critique:
            charge["data"] = copy.deepcopy(CRITIQUE)
            regime = "critique · "
        elif self.dans_la_plage(cfg.get("calme"), self._maintenant()):
            charge["data"] = copy.deepcopy(SILENCIEUSE)
            regime = "silencieuse, heures calmes · "
        if not simuler:
            try:
                await self.hass.services.async_call("notify", service, charge, blocking=False)
            except Exception:  # noqa: BLE001
                _LOGGER.exception("Loggia regles : notify.%s a echoue", service)
                await self.noter(module, regle, quoi, n=0, motif=motif,
                                 detail="envoi impossible · " + message)
                return False
        await self.noter(module, regle, quoi, n=1, motif=motif,
                         detail=regime + message, simule=simuler)
        return True

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
