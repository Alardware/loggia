"""La nuit : une veilleuse qui s'eteint seule, et les lampes oubliees.

Pourquoi ce module existe
─────────────────────────
Trois besoins de fin de journee, que chaque installation reecrit a la main.

  La veilleuse d'une chambre d'enfant. On l'allume au coucher, elle doit
  s'eteindre une demi-heure plus tard — et si possible en fondu, parce qu'une
  lampe qui claque reveille l'enfant qu'elle vient d'endormir.

  Les lampes oubliees. A une heure donnee, ce qui traine encore allume
  s'eteint, sauf ce qu'on a mis de cote.

  L'eclairage nocturne (§14). La nuit, un mouvement dans une piece allume
  ses lampes a faible intensite ; sans mouvement pendant quelques minutes,
  elles s'eteignent seules. Une lampe deja allumee n'est pas touchee, et
  une lampe montee a la main reste allumee : la main l'emporte, la regle
  lache (ADR 0012).

Ce que ce module refuse de faire
────────────────────────────────
Le fondu n'est pas simule par paliers. Ou bien la lampe sait faire une
transition — Home Assistant l'annonce dans `supported_features` — et on la lui
demande ; ou bien elle ne sait pas, et elle s'eteint franchement. Baisser une
lampe par petits sauts toutes les secondes remplit le journal de Home
Assistant, use la liaison Zigbee, et donne un fondu saccade : c'est pire que
pas de fondu du tout.
"""
from __future__ import annotations

import copy
import logging
import time
from typing import TYPE_CHECKING, Any

from homeassistant.core import HomeAssistant, callback

from .presence import CLE as CLE_PRESENCE, invite_present
from .const import DOMAIN
from .lumieres_maison import (MUETS, a_epargner, async_interrupteurs_declares, attributs_des_lumieres,
                              lumieres_de_la_maison, par_service, registre_de, sait_fondre, service_de,
                              veilleuses_de)
from .refus import RefusNomme
from .regles import demarrer, niveau

if TYPE_CHECKING:  # l'annotation seule — les tests chargent ce module hors paquet
    from .store import LoggiaStore

_LOGGER = logging.getLogger(__name__)

CLE = "loggia_nuit"
SOLEIL = "sun.sun"

# Le bit TRANSITION de LightEntityFeature (`LIGHT_TRANSITION`) vit dans
# `lumieres_maison`, avec le test qui le lit (`sait_fondre`) : les scenarios le
# partagent depuis l'ADR 0304.

DEFAUT: dict[str, Any] = {
    "veilleuse": {"actif": False, "lampes": [], "duree": 30, "fondu": 5, "depuis": "19:00"},
    "coucher": {"actif": False, "heure": "23:30", "sauf": [], "jours": [0, 1, 2, 3, 4, 5, 6]},
    # L'eclairage nocturne : par piece, {nom: {actif, capteurs, lampes}} —
    # l'ecran remplit les listes depuis les zones de Home Assistant.
    "eclairage": {"actif": False, "luminosite": 10, "duree": 3, "pieces": {}},
    # Observer sans agir : les regles notent ce qu'elles auraient fait.
    "simulation": {"actif": False},
}

# Le palier « nuit » de l'echelle. La veilleuse un cran au-dessus de
# l'extinction : sa minuterie est un choix fait pour CETTE lampe.
# L'eclairage nocturne est un CONFORT (ADR 0014) : une maison vide, que le
# depart tient, ne s'allume pas sur le passage d'un chat.
PRIORITES = {"veilleuse": niveau("nuit", 5), "coucher": niveau("nuit"),
             "eclairage": niveau("confort", 5)}


def lire_heure(texte, defaut=(0, 0)):
    """« 19:00 » devient (19, 0). Une saisie illisible garde le defaut."""
    try:
        h, m = str(texte).split(":", 1)
        h, m = int(h), int(m)
        if 0 <= h <= 23 and 0 <= m <= 59:
            return (h, m)
    except (TypeError, ValueError):
        pass
    return defaut


def dans_la_soiree(maintenant, depuis) -> bool:
    """L'heure est-elle passee ?

    La plage court de `depuis` jusqu'a la fin de la nuit : une veilleuse
    allumee a 22 h compte, une allumee a 2 h du matin aussi, une allumee a
    15 h non. Sans heure lisible, la regle vaut a toute heure — mieux vaut
    une veilleuse qui s'eteint trop souvent qu'une qui reste allumee.
    """
    if depuis in (None, ""):
        return True
    h, m = lire_heure(depuis, (0, 0))
    debut = h * 60 + m
    courant = maintenant.hour * 60 + maintenant.minute
    # Avant midi, on est de l'autre cote de minuit : la soiree de la veille.
    return courant >= debut or courant < 12 * 60


def a_eteindre(etats: dict, sauf) -> list:
    """Les lampes allumees, moins celles qu'on epargne."""
    epargnees = set(sauf or [])
    return sorted(haid for haid, st in (etats or {}).items()
                  if haid not in epargnees
                  and str(getattr(st, "state", "")).lower() == "on")


# Les listes d'entites de la configuration, par section : des textes seulement
# (`_poser_patch`). `jours` est a part : des entiers de 0 a 6.
LISTES = {"veilleuse": ("lampes",), "coucher": ("sauf",)}
LISTES_PIECE = ("capteurs", "lampes")


def _liste_de_textes(section: str, cle: str, valeur: Any) -> None:
    """Refuse (`nuit_format`) ce qui n'est pas une liste de textes."""
    if not isinstance(valeur, list) or not all(isinstance(h, str) for h in valeur):
        raise RefusNomme("nuit_format", "une liste d'entites est attendue", section + "." + cle)


def verifier_patch(patch: Any) -> None:
    """Le patch de l'ecran, verifie AVANT d'ecrire (audit du 19/10) : les
    listes d'entites sont des listes de textes, les jours des entiers de 0 a
    6. Un patch qui n'en est pas un se refuse par son code - `nuit_format`,
    un code NOMME que l'ecran sait dire (src/refus.js), jamais le
    `invalid_format` generique -, et rien ne s'ecrit - avant, `lampes: "light.x"` s'ecrivait tel quel, et la veilleuse
    suivait chaque lettre."""
    if not isinstance(patch, dict):
        raise RefusNomme("nuit_format", "un patch est une table")
    for section, valeurs in patch.items():
        if not isinstance(valeurs, dict):
            continue
        for cle in LISTES.get(section, ()):
            if cle in valeurs:
                _liste_de_textes(section, cle, valeurs[cle])
        if section == "coucher" and "jours" in valeurs:
            jours = valeurs["jours"]
            if (not isinstance(jours, list)
                    or not all(isinstance(j, int) and not isinstance(j, bool) and 0 <= j <= 6 for j in jours)):
                raise RefusNomme("nuit_format", "des jours de 0 a 6 sont attendus", "coucher.jours")
        if section == "eclairage" and isinstance(valeurs.get("pieces"), dict):
            for nom, piece in valeurs["pieces"].items():
                if not isinstance(piece, dict):
                    continue
                for cle in LISTES_PIECE:
                    if cle in piece:
                        _liste_de_textes("eclairage.pieces." + str(nom), cle, piece[cle])


def lisible_par(lecture: Any, cfg: dict[str, Any]) -> dict[str, Any]:
    """La configuration telle qu'un compte la LIT (audit du 19/10) : ses listes
    d'entites - veilleuses, lampes epargnees, lampes et capteurs des pieces -
    ne gardent que ce que `lecture` autorise. La liste des veilleuses reste
    rendue : l'ecran en a besoin pour epargner. `lecture` None : tout."""
    if lecture is None:
        return cfg
    cfg = copy.deepcopy(cfg)
    for section, cles in LISTES.items():
        for cle in cles:
            liste = (cfg.get(section) or {}).get(cle)
            if isinstance(liste, list):
                cfg[section][cle] = [h for h in liste if not isinstance(h, str) or lecture(h)]
    for piece in ((cfg.get("eclairage") or {}).get("pieces") or {}).values():
        if not isinstance(piece, dict):
            continue
        for cle in LISTES_PIECE:
            if isinstance(piece.get(cle), list):
                piece[cle] = [h for h in piece[cle] if not isinstance(h, str) or lecture(h)]
    return cfg


def fait_nuit(etat_soleil) -> bool:
    """Le soleil est-il couche ? Sans `sun.sun`, on suppose qu'il fait jour :
    se tromper vers le jour n'omet qu'un eclairage, se tromper vers la nuit
    allumerait le couloir en plein apres-midi."""
    if etat_soleil is None:
        return False
    return str(getattr(etat_soleil, "state", "")).lower() == "below_horizon"


def capteurs_par_piece(reglage_eclairage) -> dict:
    """{capteur: nom de piece}, pour les pieces actives — ce que la regle ecoute."""
    sortie: dict[str, str] = {}
    for nom, piece in ((reglage_eclairage or {}).get("pieces") or {}).items():
        if not isinstance(piece, dict) or not piece.get("actif"):
            continue
        for capteur in piece.get("capteurs") or []:
            if isinstance(capteur, str) and capteur:
                sortie[capteur] = nom
    return sortie


def a_allumer(etats: dict, lampes) -> list:
    """Les lampes ETEINTES parmi celles de la piece.

    Une lampe deja allumee avant le mouvement n'est pas a nous : on n'y touche
    pas, ni maintenant ni a la fin du decompte (ADR 0012). Une lampe muette
    non plus.
    """
    return sorted(haid for haid in (lampes or [])
                  if str(getattr((etats or {}).get(haid), "state", "")).lower() == "off")


class LoggiaNuit:
    """Eteint la veilleuse apres son delai, les lampes oubliees a l'heure dite,
    et eclaire le passage la nuit."""

    # Valeurs de CLASSE : un objet bati sans passer par `__init__` - ce que
    # font les tests - les trouve quand meme. Immuables : une table de classe
    # serait partagee entre les instances.
    # Les interrupteurs declares lumieres, relus avant chaque geste qui les
    # commande (`_async_relire_interrupteurs`).
    _interrupteurs: frozenset = frozenset()
    # L'echeance de chaque veilleuse armee, en secondes depuis 1970 : ce qui
    # reste quand la lampe se tait (`_sur_lampe`).
    _echeances: dict[str, float] | None = None

    def __init__(self, hass: HomeAssistant, store: "LoggiaStore", regles=None) -> None:
        self.hass = hass
        self.store = store
        # Le socle commun : journal, geste manuel, priorites, simulation.
        self.regles = regles
        self.cfg: dict[str, Any] = {}
        # Une minuterie par lampe : deux veilleuses ne partagent pas la leur.
        self._minuteurs: dict[str, Any] = {}
        self._echeances = {}
        # L'eclairage nocturne : une minuterie par piece, et ce que la regle y
        # a allume — elle n'eteint que cela.
        self._minuteurs_pieces: dict[str, Any] = {}
        self.allumees: dict[str, list] = {}
        self._defait: list[Any] = []
        self._defait_heure: list[Any] = []
        demarrer(hass, self, self._async_demarrer(), "nuit")

    async def _async_demarrer(self) -> None:
        self.cfg = await self.async_config()
        await self._async_reabonner()

    async def _async_reabonner(self) -> None:
        for source in (self._defait, self._defait_heure):
            for defaire in source:
                try:
                    defaire()
                except Exception:  # noqa: BLE001
                    _LOGGER.debug("Loggia nuit : abonnement deja retire")
            source.clear()
        await self._async_relire_interrupteurs()
        self._declarer()

        v = self.cfg.get("veilleuse") or {}
        if v.get("actif") and v.get("lampes"):
            from homeassistant.helpers.event import async_track_state_change_event

            self._defait.append(
                async_track_state_change_event(self.hass, sorted(set(v["lampes"])), self._sur_lampe)
            )
            _LOGGER.info("Loggia nuit : %d veilleuses suivies", len(set(v["lampes"])))

        e = self.cfg.get("eclairage") or {}
        capteurs = capteurs_par_piece(e) if e.get("actif") else {}
        if capteurs:
            from homeassistant.helpers.event import async_track_state_change_event

            self._defait.append(
                async_track_state_change_event(self.hass, sorted(capteurs), self._sur_mouvement)
            )
            _LOGGER.info("Loggia nuit : eclairage nocturne dans %d piece(s)", len(set(capteurs.values())))

        c = self.cfg.get("coucher") or {}
        if c.get("actif"):
            from homeassistant.helpers.event import async_track_time_change

            h, m = lire_heure(c.get("heure"), (23, 30))
            self._defait_heure.append(
                async_track_time_change(self.hass, self._au_coucher, hour=h, minute=m, second=0)
            )
            _LOGGER.info("Loggia nuit : extinction a %02d:%02d", h, m)

        await self._async_reprendre_veilleuses()

    async def _async_reprendre_veilleuses(self) -> None:
        """Rearme les veilleuses DEJA allumees (audit du 27/09).

        La veilleuse ne reagissait qu'a une TRANSITION vers « on ». Un
        redemarrage de Home Assistant pendant qu'une veilleuse brule n'en
        produit aucune : la minuterie n'etait jamais posee, et la lampe restait
        allumee jusqu'au matin — l'exact contraire de ce que ce module promet.
        `minuteurs.py` et `sirene.py` reprennent deja leurs rendez-vous au
        demarrage ; la veilleuse ne le faisait pas.

        Elle est la SEULE a pouvoir le faire. L'eclairage nocturne n'eteint que
        ce qu'il a lui-meme allume (`self.allumees`), et cette liste ne vit
        qu'en memoire : apres un redemarrage il ne peut plus prouver qu'une
        lampe est a lui, et « une lampe deja allumee n'est pas a nous ». La
        veilleuse, elle, eteint par definition ce qu'une MAIN a allume — toute
        lampe de sa liste qui brule lui revient, sans rien avoir a se rappeler.

        On repose une duree PLEINE : le temps deja ecoule est perdu avec la
        memoire, et mieux vaut laisser bruler un peu trop que couper au nez de
        quelqu'un. `_async_armer` garde toutes ses conditions — module actif,
        lampe de la liste, plage du soir, pas de minuterie deja posee.
        """
        v = self.cfg.get("veilleuse") or {}
        if not v.get("actif"):
            return
        for haid in sorted(set(v.get("lampes") or [])):
            etat = self.hass.states.get(haid)
            if etat is not None and str(getattr(etat, "state", "")).lower() == "on":
                await self._async_armer(haid)

    # ── Les lumieres de la maison (lumieres_maison, audit du 19/10) ────────
    async def _async_relire_interrupteurs(self) -> None:
        """Les interrupteurs declares lumieres, relus au magasin : `_declarer`
        et le coucher sont synchrones, ils lisent la copie."""
        self._interrupteurs = frozenset(await async_interrupteurs_declares(self.store))

    def _lumieres(self) -> tuple[dict[str, dict[str, Any]], list[str]]:
        """({haid: attributs} des `light.*` et des interrupteurs declares,
        les lumieres de la maison) - la definition commune a toutes les
        regles : ni la LED d'une borne (`config`), ni une lampe cachee ; un
        groupe s'efface devant ses membres. Des etats illisibles levent."""
        attributs = attributs_des_lumieres(self.hass, self._interrupteurs)
        return attributs, lumieres_de_la_maison(attributs, registre_de(self.hass), self._interrupteurs)

    def _declarer(self) -> None:
        """Declare au socle ce que la nuit pilote : les veilleuses, et toutes
        les lumieres de la maison que l'extinction peut toucher - l'interrupteur
        declare lumiere compris. Rappele au coucher — les lampes peuvent ne pas
        exister au demarrage."""
        pilotes = []
        v = self.cfg.get("veilleuse") or {}
        if v.get("actif"):
            pilotes += list(v.get("lampes") or [])
        e = self.cfg.get("eclairage") or {}
        if e.get("actif"):
            for piece in (e.get("pieces") or {}).values():
                if isinstance(piece, dict) and piece.get("actif"):
                    pilotes += list(piece.get("lampes") or [])
        if (self.cfg.get("coucher") or {}).get("actif"):
            try:
                pilotes += self._lumieres()[1]
            except Exception:  # noqa: BLE001
                _LOGGER.warning("Loggia nuit : lampes illisibles, l'extinction ne les suivra pas", exc_info=True)
        self.regles.suivre("nuit", pilotes)

    # ── La veilleuse ───────────────────────────────────────────────────────
    def _les_echeances(self) -> dict[str, float]:
        if self._echeances is None:
            self._echeances = {}
        return self._echeances

    @callback
    def _sur_lampe(self, event) -> None:
        """La veilleuse change d'etat. Un ALLUMAGE arme la minuterie ; une
        extinction la desarme. Deux cas que l'audit du 19/10 a tranches :

          * un evenement d'attribut seul (`on` → `on`, un reglage de
            luminosite) n'est pas un allumage : une lampe allumee avant la
            plage ne s'arme pas parce qu'on la baisse a 20 h ;
          * une lampe qui se TAIT (`unavailable`, `unknown`) garde sa
            minuterie et son echeance ; a son retour, l'echeance d'origine
            tient - pas une duree pleine -, et passee pendant le silence,
            la lampe s'eteint tout de suite. Sans echeance connue, le retour
            vaut un allumage : mieux vaut une veilleuse qui s'eteint trop tot
            qu'une qui brule toute la nuit."""
        d = event.data or {}
        haid = d.get("entity_id")
        if not haid:
            return
        neuf = d.get("new_state")
        etat = str(getattr(neuf, "state", "")).lower() if neuf else ""
        ancien = d.get("old_state")
        avant = str(getattr(ancien, "state", "")).lower() if ancien else ""
        if etat == "on":
            if avant == "on":
                return
            if avant in MUETS and haid in self._minuteurs:
                return
            echeance = self._les_echeances().get(haid)
            if avant in MUETS and echeance is not None:
                reste = echeance - time.time()
                if reste <= 0:
                    self.hass.async_create_task(self._async_eteindre_veilleuse(haid))
                else:
                    self.hass.async_create_task(self._async_armer(haid, reste))
                return
            self.hass.async_create_task(self._async_armer(haid))
        elif etat in MUETS:
            # Muette : on ne sait rien de plus. La minuterie et l'echeance restent.
            return
        else:
            # Eteinte a la main : la minuterie n'a plus lieu d'etre.
            self._desarmer(haid)
            self._les_echeances().pop(haid, None)

    async def _async_armer(self, haid: str, duree: float | None = None) -> None:
        """Arme la minuterie de la veilleuse : la duree reglee, ou `duree`
        (secondes) - ce qui reste d'une echeance d'avant une panne."""
        from homeassistant.util import dt as dt_util

        v = self.cfg.get("veilleuse") or {}
        if not v.get("actif") or haid not in (v.get("lampes") or []):
            return
        if not dans_la_soiree(dt_util.now(), v.get("depuis")):
            return
        if haid in self._minuteurs:
            return
        if duree is None:
            try:
                duree = max(0, int(v.get("duree", 30))) * 60
            except (TypeError, ValueError):
                duree = 1800
        if duree <= 0:
            await self._async_eteindre_veilleuse(haid)
            return
        from homeassistant.helpers.event import async_call_later

        @callback
        def echu(_now):
            self._minuteurs.pop(haid, None)
            self.hass.async_create_task(self._async_eteindre_veilleuse(haid))

        self._les_echeances()[haid] = time.time() + duree
        self._minuteurs[haid] = async_call_later(self.hass, duree, echu)

    def _desarmer(self, haid: str) -> None:
        annule = self._minuteurs.pop(haid, None)
        if annule:
            try:
                annule()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia nuit : minuteur deja passe")

    def _sait_fondre(self, haid: str) -> bool:
        st = self.hass.states.get(haid)
        return sait_fondre(dict(getattr(st, "attributes", None) or {}) if st is not None else None)

    async def _async_eteindre_veilleuse(self, haid: str) -> None:
        st = self.hass.states.get(haid)
        etat = str(getattr(st, "state", "")).lower() if st is not None else ""
        if etat != "on":
            # Eteinte entre temps : rien a faire, l'echeance s'oublie. Muette : on
            # ne sait pas ; l'echeance reste, son retour la trouvera passee.
            if etat not in MUETS:
                self._les_echeances().pop(haid, None)
            return
        self._les_echeances().pop(haid, None)
        v = self.cfg.get("veilleuse") or {}
        data: dict[str, Any] = {}
        try:
            fondu = max(0, int(v.get("fondu", 0)))
        except (TypeError, ValueError):
            fondu = 0
        # Chacun par son service (lumieres_maison, retouches du 19/10, R5) : une
        # veilleuse peut etre un interrupteur declare lumiere - `light.turn_off`
        # sur un `switch.*`, Home Assistant le refuse. On ne demande une
        # transition qu'a une LAMPE qui sait la faire : un interrupteur n'en a
        # pas, quoi que dise son `supported_features`.
        domaine, service = service_de(haid, False)
        if fondu and domaine == "light" and self._sait_fondre(haid):
            data["transition"] = fondu * 60
        try:
            duree = max(0, int(v.get("duree", 30)))
        except (TypeError, ValueError):
            duree = 30
        # La veilleuse eteint ce qu'une MAIN a allume : c'est sa definition
        # meme, et le reglage vaut pour CETTE lampe. Le gel de cette main ne la
        # retient donc pas — sans quoi une veilleuse de trente minutes ne
        # s'eteindrait jamais, le gel durant trente minutes lui aussi.
        self.regles.degeler(haid)
        await self._async_service(domaine, service, [haid], data,
                                  regle="veilleuse", quoi="eteindre",
                                  motif=("{n} min", {"n": duree}), priorite=PRIORITES["veilleuse"])

    # ── L'eclairage nocturne ───────────────────────────────────────────────
    @callback
    def _sur_mouvement(self, event) -> None:
        d = getattr(event, "data", None) or {}
        piece = capteurs_par_piece(self.cfg.get("eclairage")).get(d.get("entity_id") or "")
        if not piece:
            return
        neuf = str(getattr(d.get("new_state"), "state", "")).lower()
        ancien = str(getattr(d.get("old_state"), "state", "")).lower()
        if neuf == "on" and ancien != "on":
            self.hass.async_create_task(self._async_allumer(piece))
        elif ancien == "on" and neuf != "on":
            # Plus de mouvement : le decompte commence — pour ce qu'on a allume.
            # Quel que soit le nouvel etat (audit du 03/10) : un capteur Zigbee
            # qui decroche passe de « on » a « unavailable », puis revient a
            # « off » — et la lampe restait allumee toute la nuit.
            self._armer_extinction(piece)

    async def _async_allumer(self, piece: str) -> None:
        e = self.cfg.get("eclairage") or {}
        if not e.get("actif"):
            return
        # Quelqu'un bouge : ce qu'on a allume reste allume.
        self._desarmer_piece(piece)
        if not fait_nuit(self.hass.states.get(SOLEIL)):
            return
        # Maison declaree vide : un chat devant le capteur n'allume rien
        # (ADR 0014). La tenue du depart ne protegeait que les lampes qu'il
        # avait eteintes, et tombait au bout de douze heures (audit du 03/10).
        presence = (getattr(self.hass, "data", None) or {}).get(DOMAIN, {}).get("presence")
        if presence is not None and getattr(presence, "dehors", False):
            return
        reglage = (e.get("pieces") or {}).get(piece) or {}
        lampes = list(reglage.get("lampes") or [])
        etats = {h: self.hass.states.get(h) for h in lampes}
        # Une lampe deja allumee n'est pas a nous. Une lampe sous la main de
        # quelqu'un, ou tenue par plus fort — le depart, maison vide —, non
        # plus : et on ne le note pas a chaque passage devant le capteur.
        tenues = self.regles.tenues_toutes()
        cibles = [h for h in a_allumer(etats, lampes)
                  if not self.regles.gele(h) and h not in tenues]
        if not cibles:
            return
        try:
            luminosite = max(1, min(100, int(e.get("luminosite", 10))))
        except (TypeError, ValueError):
            luminosite = 10
        # Par service (lumieres_maison) : une lampe a faible intensite, un
        # interrupteur declare lumiere tel quel - il n'a pas de niveau.
        partis: list = []
        for domaine, service, lot in par_service(cibles, True):
            partis += await self._async_service(domaine, service, lot,
                                                {"brightness_pct": luminosite} if domaine == "light" else None,
                                                regle="eclairage", quoi="allumer",
                                                motif=("mouvement : {piece}", {"piece": piece}),
                                                priorite=PRIORITES["eclairage"])
        if partis:
            self.allumees[piece] = sorted(set(self.allumees.get(piece, [])) | set(partis))

    def _armer_extinction(self, piece: str) -> None:
        if not self.allumees.get(piece):
            return
        self._desarmer_piece(piece)
        e = self.cfg.get("eclairage") or {}
        try:
            duree = max(0, int(e.get("duree", 3))) * 60
        except (TypeError, ValueError):
            duree = 180
        if duree == 0:
            self.hass.async_create_task(self._async_eteindre_piece(piece))
            return
        from homeassistant.helpers.event import async_call_later

        @callback
        def echu(_now):
            self._minuteurs_pieces.pop(piece, None)
            self.hass.async_create_task(self._async_eteindre_piece(piece))

        self._minuteurs_pieces[piece] = async_call_later(self.hass, duree, echu)

    def _desarmer_piece(self, piece: str) -> None:
        annule = self._minuteurs_pieces.pop(piece, None)
        if annule:
            try:
                annule()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia nuit : minuteur de piece deja passe")

    async def _async_eteindre_piece(self, piece: str) -> None:
        """Eteint ce que la regle a allume dans la piece — et rien d'autre.

        Une lampe montee a la main entre temps est gelee : le socle l'ecarte,
        le journal le dit, et la regle LACHE — elle ne reviendra pas a la fin
        du gel. Monter la lumiere, c'est dire « je reste » (ADR 0012).
        """
        allumees = self.allumees.pop(piece, [])
        etats = {h: self.hass.states.get(h) for h in allumees}
        cibles = [h for h in allumees if str(getattr(etats.get(h), "state", "")).lower() == "on"]
        if not cibles:
            return
        e = self.cfg.get("eclairage") or {}
        try:
            duree = max(0, int(e.get("duree", 3)))
        except (TypeError, ValueError):
            duree = 3
        for domaine, service, lot in par_service(cibles, False):
            await self._async_service(domaine, service, lot, None,
                                      regle="eclairage", quoi="eteindre",
                                      motif=("{n} min sans mouvement", {"n": duree}),
                                      priorite=PRIORITES["eclairage"])

    # ── Les lampes oubliees ────────────────────────────────────────────────
    @callback
    def _au_coucher(self, *_) -> None:
        self.hass.async_create_task(self._async_coucher())

    async def _async_coucher(self) -> None:
        from homeassistant.util import dt as dt_util

        c = self.cfg.get("coucher") or {}
        if not c.get("actif"):
            return
        jours = c.get("jours")
        if isinstance(jours, list) and jours and dt_util.now().weekday() not in jours:
            return
        # Le mode invite (ADR 0016) : quelqu'un garde la maison sans telephone
        # suivi — on n'eteint pas tout sur sa tete. L'interrupteur est celui
        # designe dans la regle de presence ; le journal dit que le coucher a
        # ete retenu, pour qu'on ne cherche pas pourquoi rien n'a bouge.
        #
        # SEULEMENT si la regle de presence tourne. Eteinte, elle n'arme plus
        # la coupure automatique des trente minutes — personne ne rendrait
        # donc la main, et le coucher serait retenu pour toujours sans que rien
        # ne le dise. Le mode invite est une piece de cette regle, pas un
        # interrupteur independant (audit du 23/09).
        presence = await self.store.async_get_shared(CLE_PRESENCE, None)
        presence = presence if isinstance(presence, dict) else {}
        invite = ((presence.get("invite") or {}).get("entite")) if presence.get("actif") else None
        if invite and invite_present(self.hass.states, invite):
            await self.regles.noter("nuit", "coucher", "retenir", n=0, motif="mode invite")
            return
        # Les lumieres de la maison, par la definition commune (lumieres_maison,
        # audit du 19/10) : ni la LED d'une borne ni une lampe cachee, mais
        # l'interrupteur declare lumiere - par SON service.
        await self._async_relire_interrupteurs()
        try:
            attributs, lumieres = self._lumieres()
        except Exception:  # noqa: BLE001
            _LOGGER.warning("Loggia nuit : lampes illisibles ce soir, extinction du coucher ignoree", exc_info=True)
            return
        etats = {h: self.hass.states.get(h) for h in lumieres}
        self._declarer()
        # Sa decision : les veilleuses sont epargnees PARTOUT - et le groupe
        # qui en contient une avec elles -, en plus de ce que `sauf` nomme.
        epargnees = set(h for h in (c.get("sauf") or []) if isinstance(h, str))
        epargnees |= a_epargner(attributs, veilleuses_de(self.cfg))
        cibles = a_eteindre(etats, epargnees)
        if not cibles:
            return
        for domaine, service, lot in par_service(cibles, False):
            await self._async_service(domaine, service, lot, None,
                                      regle="coucher", quoi="eteindre",
                                      motif=str(c.get("heure") or ""), priorite=PRIORITES["coucher"])

    # ── Outils ─────────────────────────────────────────────────────────────
    async def _async_service(self, domaine: str, service: str, cibles: list, data=None, *,
                             regle: str = "", quoi: str = "", motif: str = "",
                             priorite: int = 0) -> list:
        """Commande par le socle : il ecarte ce qu'une main tient, et note."""
        return await self.regles.agir("nuit", regle, domaine, service, cibles, data or None,
                                      quoi=quoi or service, motif=motif,
                                      priorite=priorite, simuler=self._simule())

    def _simule(self) -> bool:
        """Observer sans agir : les regles notent, rien ne bouge."""
        return bool((self.cfg.get("simulation") or {}).get("actif"))

    def _repartir_de_zero(self) -> None:
        for haid in list(self._minuteurs):
            self._desarmer(haid)
        for piece in list(self._minuteurs_pieces):
            self._desarmer_piece(piece)
        self.allumees.clear()
        self.regles.relacher("nuit")

    # ── Ce que l'interface lit et ecrit ────────────────────────────────────
    async def async_config(self) -> dict[str, Any]:
        return self._config_de(await self.store.async_get_shared(CLE, None))

    def _config_de(self, brut: Any) -> dict[str, Any]:
        """La configuration, defauts compris. Synchrone : `async_enregistrer`
        la rebatit sous le verrou du magasin (lot 15 de l'audit du 03/10)."""
        cfg = {k: dict(v) for k, v in DEFAUT.items()}
        cfg["veilleuse"]["lampes"] = []
        cfg["coucher"]["sauf"] = []
        cfg["coucher"]["jours"] = [0, 1, 2, 3, 4, 5, 6]
        cfg["eclairage"]["pieces"] = {}
        if isinstance(brut, dict):
            for section, valeurs in brut.items():
                if section in cfg and isinstance(valeurs, dict):
                    cfg[section].update(valeurs)
        return cfg

    async def async_etat(self, user: Any = None) -> dict[str, Any]:
        """`loggia/nuit/etat`, sous les droits de LECTURE du compte
        (`_lecture_autorisee`, la garde de l'etat du chauffage ; audit du
        19/10) : un compte restreint ne voit, dans les listes de la
        configuration, les minuteries, les pieces eclairees et le journal, que
        ce qu'il peut lire - une ligne du journal se tait des qu'une de ses
        cibles lui est fermee. La liste des veilleuses reste rendue, filtree :
        l'ecran en a besoin pour epargner. Sans compte, ou sans restriction :
        tout, comme avant."""
        from .discovery import _lecture_autorisee

        lecture = _lecture_autorisee(user)
        cfg = self.cfg or await self.async_config()
        journal = await self.regles.journal(limite=40, module="nuit")
        if lecture is not None:
            journal = [l for l in journal
                       if all(lecture(h) for h in (l.get("cibles") or []) if isinstance(h, str))]
        return {
            "config": lisible_par(lecture, cfg),
            "en_cours": sorted(h for h in self._minuteurs if lecture is None or lecture(h)),
            # Ce que l'eclairage nocturne a allume, piece par piece.
            "eclairees": {p: [h for h in l if lecture is None or lecture(h)] for p, l in self.allumees.items()},
            "journal": journal,
        }

    def _poser_patch(self, cfg: dict[str, Any], patch: dict[str, Any]) -> None:
        """Le patch de l'ecran, pose sur `cfg`. Synchrone : sous le verrou.
        Verifie d'abord (`verifier_patch`) : un patch mal forme ne pose rien."""
        verifier_patch(patch)
        for section, valeurs in (patch or {}).items():
            if section not in cfg or not isinstance(valeurs, dict):
                continue
            if section == "eclairage" and isinstance(valeurs.get("pieces"), dict):
                # Piece par piece, comme l'ecran les envoie : une a la fois,
                # `None` pour la retirer.
                pieces = dict(cfg["eclairage"].get("pieces") or {})
                for nom, piece in valeurs["pieces"].items():
                    if piece is None:
                        pieces.pop(nom, None)
                    elif isinstance(piece, dict):
                        pieces[nom] = {**pieces.get(nom, {}), **piece}
                valeurs = {**valeurs, "pieces": pieces}
            cfg[section].update(valeurs)

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
        # L'heure du coucher fait partie du rendez-vous : la changer oblige a
        # le reposer, sinon l'ancienne resterait armee jusqu'au redemarrage.
        await self._async_reabonner()
        return cfg

    @callback
    def async_arreter(self) -> None:
        for haid in list(self._minuteurs):
            self._desarmer(haid)
        for piece in list(self._minuteurs_pieces):
            self._desarmer_piece(piece)
        for source in (self._defait, self._defait_heure):
            for defaire in source:
                try:
                    defaire()
                except Exception:  # noqa: BLE001
                    _LOGGER.debug("Loggia nuit : desabonnement sans effet")
            source.clear()
