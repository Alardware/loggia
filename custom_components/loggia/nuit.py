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

import logging
from typing import TYPE_CHECKING, Any

from homeassistant.core import HomeAssistant, callback

from .presence import CLE as CLE_PRESENCE, invite_present
from .regles import niveau

if TYPE_CHECKING:  # l'annotation seule — les tests chargent ce module hors paquet
    from .store import LoggiaStore

_LOGGER = logging.getLogger(__name__)

CLE = "loggia_nuit"
SOLEIL = "sun.sun"

# Le bit TRANSITION de LightEntityFeature : une lampe qui ne l'a pas ne sait
# pas s'eteindre en fondu, et le lui demander ne ferait rien de bon.
LIGHT_TRANSITION = 32

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

    def __init__(self, hass: HomeAssistant, store: "LoggiaStore", regles=None) -> None:
        self.hass = hass
        self.store = store
        # Le socle commun : journal, geste manuel, priorites, simulation.
        self.regles = regles
        self.cfg: dict[str, Any] = {}
        # Une minuterie par lampe : deux veilleuses ne partagent pas la leur.
        self._minuteurs: dict[str, Any] = {}
        # L'eclairage nocturne : une minuterie par piece, et ce que la regle y
        # a allume — elle n'eteint que cela.
        self._minuteurs_pieces: dict[str, Any] = {}
        self.allumees: dict[str, list] = {}
        self._defait: list[Any] = []
        self._defait_heure: list[Any] = []
        hass.async_create_task(self._async_demarrer())

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

    def _declarer(self) -> None:
        """Declare au socle ce que la nuit pilote : les veilleuses, et toutes
        les lampes que l'extinction peut toucher. Rappele au coucher — les
        lampes peuvent ne pas exister au demarrage."""
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
                pilotes += list(self.hass.states.async_entity_ids("light"))
            except Exception:  # noqa: BLE001
                _LOGGER.warning("Loggia nuit : lampes illisibles, l'extinction ne les suivra pas", exc_info=True)
        self.regles.suivre("nuit", pilotes)

    # ── La veilleuse ───────────────────────────────────────────────────────
    @callback
    def _sur_lampe(self, event) -> None:
        d = event.data or {}
        haid = d.get("entity_id")
        if not haid:
            return
        neuf = d.get("new_state")
        etat = str(getattr(neuf, "state", "")).lower() if neuf else ""
        if etat == "on":
            self.hass.async_create_task(self._async_armer(haid))
        else:
            # Eteinte a la main : la minuterie n'a plus lieu d'etre.
            self._desarmer(haid)

    async def _async_armer(self, haid: str) -> None:
        from homeassistant.util import dt as dt_util

        v = self.cfg.get("veilleuse") or {}
        if not v.get("actif") or haid not in (v.get("lampes") or []):
            return
        if not dans_la_soiree(dt_util.now(), v.get("depuis")):
            return
        if haid in self._minuteurs:
            return
        try:
            duree = max(0, int(v.get("duree", 30))) * 60
        except (TypeError, ValueError):
            duree = 1800
        if duree == 0:
            await self._async_eteindre_veilleuse(haid)
            return
        from homeassistant.helpers.event import async_call_later

        @callback
        def echu(_now):
            self._minuteurs.pop(haid, None)
            self.hass.async_create_task(self._async_eteindre_veilleuse(haid))

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
        f = (st.attributes.get("supported_features") if st else None) or 0
        try:
            return bool(int(f) & LIGHT_TRANSITION)
        except (TypeError, ValueError):
            return False

    async def _async_eteindre_veilleuse(self, haid: str) -> None:
        st = self.hass.states.get(haid)
        # Eteinte entre temps : rien a faire.
        if st is None or str(getattr(st, "state", "")).lower() != "on":
            return
        v = self.cfg.get("veilleuse") or {}
        data: dict[str, Any] = {}
        try:
            fondu = max(0, int(v.get("fondu", 0)))
        except (TypeError, ValueError):
            fondu = 0
        # On ne demande une transition qu'a une lampe qui sait la faire.
        if fondu and self._sait_fondre(haid):
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
        await self._async_service("light", "turn_off", [haid], data,
                                  regle="veilleuse", quoi="eteindre",
                                  motif="%d min" % duree, priorite=PRIORITES["veilleuse"])

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
        elif neuf == "off" and ancien == "on":
            # Plus de mouvement : le decompte commence — pour ce qu'on a allume.
            self._armer_extinction(piece)

    async def _async_allumer(self, piece: str) -> None:
        e = self.cfg.get("eclairage") or {}
        if not e.get("actif"):
            return
        # Quelqu'un bouge : ce qu'on a allume reste allume.
        self._desarmer_piece(piece)
        if not fait_nuit(self.hass.states.get(SOLEIL)):
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
        partis = await self._async_service("light", "turn_on", cibles,
                                           {"brightness_pct": luminosite},
                                           regle="eclairage", quoi="allumer",
                                           motif="mouvement : %s" % piece,
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
        await self._async_service("light", "turn_off", cibles, None,
                                  regle="eclairage", quoi="eteindre",
                                  motif="%d min sans mouvement" % duree,
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
        presence = await self.store.async_get_shared(CLE_PRESENCE, None)
        invite = ((presence or {}).get("invite") or {}).get("entite") if isinstance(presence, dict) else None
        if invite and invite_present(self.hass.states, invite):
            await self.regles.noter("nuit", "coucher", "retenir", n=0, motif="mode invite")
            return
        try:
            ids = self.hass.states.async_entity_ids("light")
        except Exception:  # noqa: BLE001
            _LOGGER.warning("Loggia nuit : lampes illisibles ce soir, extinction du coucher ignoree", exc_info=True)
            return
        etats = {i: self.hass.states.get(i) for i in ids}
        self._declarer()
        cibles = a_eteindre(etats, c.get("sauf"))
        if not cibles:
            return
        await self._async_service("light", "turn_off", cibles, None,
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
        brut = await self.store.async_get_shared(CLE, None)
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

    async def async_etat(self) -> dict[str, Any]:
        return {
            "config": self.cfg or await self.async_config(),
            "en_cours": sorted(self._minuteurs),
            # Ce que l'eclairage nocturne a allume, piece par piece.
            "eclairees": {p: list(l) for p, l in self.allumees.items()},
            "journal": await self.regles.journal(limite=40, module="nuit"),
        }

    async def async_enregistrer(self, patch: dict[str, Any]) -> dict[str, Any]:
        cfg = await self.async_config()
        simulait = bool((cfg.get("simulation") or {}).get("actif"))
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
        await self.store.async_set_shared(CLE, cfg)
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
