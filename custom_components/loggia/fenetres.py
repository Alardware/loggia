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
  ne pretend pas le savoir. Mais des que Home Assistant a demarre, il revoit
  chaque piece : une fenetre restee ouverte recompte son delai, puis est
  coupee (ou donnee au moteur du chauffage) comme si elle venait de s'ouvrir.

  Une piece a souvent plusieurs ouvrants. Le chauffage ne repart que lorsque
  le DERNIER s'est referme.
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from homeassistant.core import HomeAssistant, callback

from .chauffage_familles import PREFIXE_CONSIGNE, mode_option, options_du_module
from .const import DOMAIN
from .regles import demarrer, niveau

if TYPE_CHECKING:  # l'annotation seule — les tests chargent ce module hors paquet
    from .store import LoggiaStore

_LOGGER = logging.getLogger(__name__)

CLE = "loggia_fenetres"

# Les etats qui ne veulent rien dire : un capteur qui vient de tomber ne doit
# ni couper le chauffage ni le rendre.
MUETS = {"unavailable", "unknown", "none", ""}

DEFAUT: dict[str, Any] = {"actif": False, "delai": 3, "reprise": 0, "pieces": {},
                          # Observer sans agir : la regle note ce qu'elle aurait fait.
                          "simulation": False}

# Chauffer dehors n'est jamais voulu : la coupure est une question de SURETE,
# et tient le chauffage tant que la fenetre est ouverte. Le retour de
# presence, plus faible, attend qu'elle se referme pour remettre sa consigne.
PRIORITE = niveau("surete", 5)


def ouvrants_muets(etats: dict, ouvrants) -> list:
    """Ceux qui ne disent rien — indisponibles, inconnus, absents.

    Un capteur muet ne dit pas « ferme » (audit du 03/10) : la pile d'un
    capteur Zigbee qui lache, fenetre ouverte, remettait le chauffage en
    marche. Il ne coupe pas, il ne rend pas non plus.
    """
    muets = []
    for haid in ouvrants or []:
        st = etats.get(haid)
        if st is None or str(getattr(st, "state", "")).lower() in MUETS:
            muets.append(haid)
    return muets


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


def piece_propre(piece: dict) -> dict:
    """Une piece dont les listes ne portent que des identifiants.

    Rien ne relisait la configuration recue (lot 15 de l'audit du 03/10) : un
    entier glisse dans `ouvrants` etait ecrit, puis `sorted` levait TypeError
    au reabonnement — la regle n'ecoutait plus rien, au redemarrage pas
    davantage. Meme filtre que `regles.suivre` : ce qui n'est pas un texte est
    ecarte, une liste qui n'en est pas une devient vide.
    """
    propre = dict(piece)
    for cle in ("ouvrants", "chauffages"):
        if cle in propre:
            liste = propre[cle]
            propre[cle] = [h for h in liste if isinstance(h, str)] if isinstance(liste, list) else []
    return propre


def eteint_pour(haid: str, options=None):
    """Le service qui coupe un chauffage, selon son domaine — None s'il ne
    sait pas le couper.

    Un fil pilote (`select`) se coupe par SON ordre Arret, l'option telle que
    le module l'ecrit — jamais par l'interrupteur de son module, qui le
    priverait de tout ordre (chantier Chauffage, § 6)."""
    domaine = haid.split(".", 1)[0]
    if domaine == "climate":
        return ("climate", "set_hvac_mode", {"hvac_mode": "off"})
    if domaine == "select":
        arret = options_du_module(options).get("arret")
        return ("select", "select_option", {"option": arret}) if arret else None
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
    if domaine == "select":
        # L'option d'avant, telle quelle : « frost_protection » reste le hors-gel.
        return ("select", "select_option", {"option": avant})
    if domaine in ("switch", "input_boolean"):
        return (domaine, "turn_on" if avant == "on" else "turn_off", {})
    return ("homeassistant", "turn_on" if avant == "on" else "turn_off", {})


def renommer_dans(pieces: Any, ancien: str, neuf: str) -> bool:
    """Remplace `ancien` par `neuf` dans les ouvrants et les chauffages de chaque
    piece, EN PLACE. Rend vrai si quelque chose a change. Un ouvrant ou un
    radiateur renomme dans Home Assistant faisait perdre la protection en
    silence : la piece ne le voyait plus (audit du 19/10)."""
    change = False
    for piece in (pieces.values() if isinstance(pieces, dict) else ()):
        for cle in ("ouvrants", "chauffages"):
            liste = piece.get(cle) if isinstance(piece, dict) else None
            if isinstance(liste, list) and ancien in liste:
                piece[cle] = [neuf if h == ancien else h for h in liste]
                change = True
    return change


class LoggiaFenetres:
    """Coupe le chauffage d'une piece dont un ouvrant reste ouvert."""

    def __init__(self, hass: HomeAssistant, store: "LoggiaStore", regles=None) -> None:
        self.hass = hass
        self.store = store
        # Le socle commun : journal, geste manuel, priorites, simulation.
        # Toute commande passe par lui — voir `regles.py`.
        self.regles = regles
        self.cfg: dict[str, Any] = {}
        # Ce qu'on a coupe, et ce qu'il faisait avant : {piece: {entite: etat}}.
        # En memoire seule — voir l'en-tete.
        self.coupes: dict[str, dict[str, str]] = {}
        # Les coupures ADOPTEES du moteur du chauffage : {entite: l'etat qu'il a
        # laisse}. A la fermeture, on ne rend que si l'appareil y est encore.
        self._laisses: dict[str, str] = {}
        self._minuteurs: dict[str, Any] = {}
        self._defait: list[Any] = []
        # L'attente de la fin du demarrage de Home Assistant, tant qu'elle dure.
        self._au_demarrage = None
        # L'ecoute du registre des entites : un ouvrant ou un radiateur renomme (19/10).
        self._ecoute_registre = None
        demarrer(hass, self, self._async_demarrer(), "fenetres")

    async def _async_demarrer(self) -> None:
        self.cfg = await self.async_config()
        await self._async_reabonner()
        # La regle ne reagit qu'aux CHANGEMENTS des ouvrants : une fenetre deja
        # ouverte quand l'integration demarre (un rechargement, un redemarrage
        # de Home Assistant) serait oubliee, et le rattrapage du moteur
        # rechaufferait la piece. On attend donc que Home Assistant ait FINI de
        # demarrer, comme les minuteurs (ADR 0138), puis on revoit chaque piece.
        # Deja demarre (un rechargement), le rappel part aussitot.
        from homeassistant.helpers.start import async_at_started

        self._au_demarrage = async_at_started(self.hass, self._async_rattraper)
        bus = getattr(self.hass, "bus", None)
        if bus is not None:
            self._ecoute_registre = bus.async_listen("entity_registry_updated", self._sur_registre)

    @callback
    def _sur_registre(self, event) -> None:
        """Un ouvrant ou un chauffage d'une piece suivie a ete RENOMME : la
        configuration le suit (audit du 19/10)."""
        d = getattr(event, "data", None) or {}
        ancien, neuf = d.get("old_entity_id"), d.get("entity_id")
        if d.get("action") != "update" or not ancien or not neuf or ancien == neuf:
            return
        pieces = (self.cfg or {}).get("pieces") or {}
        connu = any(ancien in (p.get("ouvrants") or []) or ancien in (p.get("chauffages") or [])
                    for p in pieces.values() if isinstance(p, dict))
        if connu or any(ancien in c for c in self.coupes.values()):
            self.hass.async_create_task(self._async_renommer(ancien, neuf))

    async def _async_renommer(self, ancien: str, neuf: str) -> None:
        def changer(brut: Any) -> dict[str, Any]:
            cfg = self._config_de(brut)
            renommer_dans(cfg["pieces"], ancien, neuf)
            return cfg

        self.cfg = await self.store.async_modifier_shared(CLE, changer)
        # Ce qu'on tient coupe le reste, sous son nouveau nom : la fermeture le rendra.
        for coupes in self.coupes.values():
            if ancien in coupes:
                coupes[neuf] = coupes.pop(ancien)
        if ancien in self._laisses:
            self._laisses[neuf] = self._laisses.pop(ancien)
        if self.regles.tient("fenetres", "fenetre", ancien):
            self.regles.relacher("fenetres", "fenetre", cibles=[ancien])
            self.regles.tenir("fenetres", "fenetre", [neuf], priorite=PRIORITE)
        await self._async_reabonner()

    async def _async_rattraper(self, _hass=None) -> None:
        self._au_demarrage = None
        await self._async_revoir()

    async def _async_revoir(self) -> None:
        """Revoit chaque piece suivie, comme si son ouvrant venait de changer.

        Ouverte, la fenetre recompte son delai, puis donne son fait au moteur et
        coupe ce que le moteur ne pilote pas ; fermee, elle ne fait rien de neuf.
        On peut la repeter sans risque : un delai deja arme, une piece deja
        coupee ne bougent pas. Une piece qui echoue ne prive ni les autres ni
        l'enregistrement qui nous appelle."""
        if not self.cfg.get("actif"):
            return
        for nom in list(self.cfg.get("pieces") or {}):
            try:
                await self._async_piece(nom)
            except Exception:  # noqa: BLE001
                _LOGGER.exception("Loggia fenetres : la piece %s n'a pas pu etre revue", nom)

    async def _async_reabonner(self) -> None:
        """Suit les ouvrants declares. Rappele a chaque enregistrement."""
        for defaire in self._defait:
            try:
                defaire()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia fenetres : abonnement deja retire")
        self._defait.clear()
        suivis = []
        pilotes = []
        if self.cfg.get("actif"):
            for piece in (self.cfg.get("pieces") or {}).values():
                if isinstance(piece, dict) and piece.get("actif"):
                    suivis.extend(piece.get("ouvrants") or [])
                    pilotes.extend(self._chauffages(piece))
        # Ce que la regle PILOTE — les chauffages — est declare au socle : une
        # main posee dessus les gele. Declare meme vide, pour cesser d'ecouter
        # ce qu'on ne pilote plus.
        self.regles.suivre("fenetres", pilotes)
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
        etats = self._etats()
        ouverts = ouvrants_ouverts(etats, piece.get("ouvrants"))
        if ouverts:
            await self._async_armer(nom)
        else:
            self._desarmer(nom)
            # On ne rend que sur des ouvrants FRANCHEMENT fermes : un capteur
            # muet garde la coupure, la fenetre est peut-etre encore ouverte.
            if ouvrants_muets(etats, piece.get("ouvrants")):
                return
            await self._async_faits(nom, piece, False)
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
        # Le fait d'abord, au moteur du chauffage : il est le seul chef des
        # chauffages au planning allume, et decide pour eux (§ 6).
        await self._async_faits(nom, piece, True)
        avant: dict[str, str] = {}
        groupes: dict[tuple, list] = {}
        for haid in self._chauffages(piece):
            if self._pilote(haid):
                continue
            st = etats.get(haid)
            valeur = str(getattr(st, "state", "")).lower() if st else ""
            fil_pilote = haid.startswith("select.")
            if valeur in MUETS or valeur == "off" or (fil_pilote and mode_option(valeur) == "arret"):
                continue   # deja eteint, ou muet : rien a couper ni a rendre
            eteint = eteint_pour(haid, (getattr(st, "attributes", None) or {}).get("options"))
            if eteint is None:
                continue   # un select sans ordre Arret : on ne sait pas le couper
            # Un select se rend par SON option, telle qu'il l'ecrit.
            avant[haid] = st.state if fil_pilote else valeur
            domaine, service, data = eteint
            groupes.setdefault((domaine, service, tuple(sorted((data or {}).items()))), []).append(haid)
        for (domaine, service, data), haids in groupes.items():
            # La coupure TIENT le chauffage : tant que la fenetre est ouverte,
            # une regle plus faible — le retour de presence — ne le rallume pas.
            # Sans echeance : la coupure tient jusqu'a la fermeture, meme une
            # fenetre ouverte toute une journee (le filet de 12 h la rendait).
            partis = await self._async_service(domaine, service, haids, dict(data),
                                               regle="fenetre", quoi="couper",
                                               motif=nom, tenir=True, jusqu_a_relacher=True)
            # Ne retenir que ce qui est vraiment parti : un radiateur sous la
            # main de quelqu'un n'a pas ete coupe, et n'est pas a rendre.
            for haid in haids:
                if haid not in partis:
                    avant.pop(haid, None)
        if avant:
            self.coupes[nom] = avant

    def _autre_piece_ouverte(self, nom: str, haid: str, etats: dict):
        """Une AUTRE piece active, fenetre encore ouverte, qui partage ce chauffage."""
        for autre, piece in (self.cfg.get("pieces") or {}).items():
            if autre == nom or not isinstance(piece, dict) or not piece.get("actif"):
                continue
            if haid in self._chauffages(piece) and ouvrants_ouverts(etats, piece.get("ouvrants")):
                return autre
        return None

    async def _async_rendre(self, nom: str) -> None:
        avant = self.coupes.pop(nom, None)
        if not avant:
            return
        etats = self._etats()
        groupes: dict[tuple, list] = {}
        for haid, valeur in avant.items():
            # Passe au planning pendant l'aeration : le moteur le reprend, avec
            # le fait de la fermeture — la regle ne le rend pas derriere lui.
            if self._pilote(haid):
                continue
            # Un chauffage partage avec une autre piece dont la fenetre est
            # encore ouverte ne se rend pas : c'est a elle de le rendre, quand
            # SA fenetre se refermera — elle recoit la valeur d'avant (audit 18/09).
            autre = self._autre_piece_ouverte(nom, haid, etats)
            if autre:
                self.coupes.setdefault(autre, {})[haid] = valeur
                continue
            st = etats.get(haid)
            actuel = str(getattr(st, "state", "")).lower() if st else ""
            laisse = self._laisses.pop(haid, None)
            if laisse is not None and laisse.startswith(PREFIXE_CONSIGNE):
                # Une consigne BAISSEE par le moteur (fenetre en Eco) : rendue telle qu'elle
                # etait, si personne n'y a touche depuis — ni consigne, ni eteint — et
                # qu'on la tient encore (25/10).
                try:
                    actuelle = float((getattr(st, "attributes", None) or {}).get("temperature"))
                    pareille = abs(actuelle - float(laisse[len(PREFIXE_CONSIGNE):])) < 0.01
                    consigne = float(str(valeur)[len(PREFIXE_CONSIGNE):])
                except (TypeError, ValueError):
                    continue
                if pareille and actuel not in ("off", *MUETS) and self.regles.tient("fenetres", "fenetre", haid):
                    groupes.setdefault(("climate", "set_temperature", (("temperature", consigne),)), []).append(haid)
                continue
            # On ne rend que ce qu'on a pris : si quelqu'un a rallume entre
            # temps, son geste l'emporte sur notre restauration. Une coupure
            # adoptee se compare a l'etat que le moteur a laisse.
            if laisse is not None:
                if str(getattr(st, "state", "")) != laisse:
                    continue
            elif haid.startswith("select."):
                if mode_option(actuel) != "arret":
                    continue
            elif actuel not in ("off", "unavailable", "unknown"):
                continue
            # Et seulement ce qu'on TIENT encore : une main, ou plus fort, a pu
            # le prendre depuis — le rendre les contredirait.
            if not self.regles.tient("fenetres", "fenetre", haid):
                continue
            domaine, service, data = rend_pour(haid, valeur)
            groupes.setdefault((domaine, service, tuple(sorted((data or {}).items()))), []).append(haid)
        for (domaine, service, data), haids in groupes.items():
            await self._async_service(domaine, service, haids, dict(data),
                                      regle="fenetre", quoi="rendre", motif=nom)
        # Ce qu'on ne rend pas — rallume a la main, ou pris par plus fort — on
        # le lache quand meme : la tenue n'a plus d'echeance, et rien d'autre
        # ne la ferait tomber. Seul reste tenu ce qu'une autre piece garde.
        gardes = {h for piece in self.coupes.values() for h in piece}
        self.regles.relacher("fenetres", "fenetre", cibles=[h for h in avant if h not in gardes])

    # ── Un seul chef par chauffage (chantier Chauffage, § 6) ───────────────
    def adopter(self, nom: str, haid: str, rendre: str, laisse: str) -> None:
        """Le moteur du chauffage LACHE un radiateur qu'il a coupe pour une
        fenetre de `nom` encore ouverte (planning eteint, observation, chauffage
        retire) : la coupure devient la notre, et la fermeture rendra `rendre` —
        ce que le planning aurait mis sans la fenetre —, si l'appareil est encore
        dans l'etat `laisse`. Sans elle, il restait coupe (audit du 19/10). Un
        thermostat seulement baisse passe sa CONSIGNE (`PREFIXE_CONSIGNE`, 25/10)."""
        self.coupes.setdefault(nom, {})[haid] = rendre
        self._laisses[haid] = laisse
        self.regles.tenir("fenetres", "fenetre", [haid], priorite=PRIORITE)

    def _chef(self):
        """Le moteur du chauffage, cherche au moment de servir — comme
        `rechargement.py` : un rechargement de l'integration le rebatit."""
        data = getattr(self.hass, "data", None)
        return (data.get(DOMAIN) or {}).get("chauffage") if isinstance(data, dict) else None

    def _pilote(self, haid: str) -> bool:
        """Ce chauffage suit-il le planning ? Alors la regle ne le commande plus."""
        chef = self._chef()
        return bool(chef is not None and chef.pilote(haid))

    def _chauffages(self, piece: dict) -> list:
        """Les chauffages d'une piece. L'interrupteur d'un module fil pilote y
        est remplace par son `select` : on ne coupe jamais un module par son
        interrupteur (§ 3.3)."""
        chef = self._chef()
        sortie: list = []
        for haid in piece.get("chauffages") or []:
            vrai = (chef.select_du_module(haid) if chef is not None else None) or haid
            if vrai not in sortie:
                sortie.append(vrai)
        return sortie

    # ── Ce que la regle surveille, pour l'ecran du chauffage ───────────────
    @staticmethod
    def _suivie(piece: Any) -> bool:
        """Une piece que la regle suit : active, avec des ouvrants."""
        return isinstance(piece, dict) and bool(piece.get("actif")) and bool(piece.get("ouvrants"))

    def veille(self, table: dict[str, Any]) -> dict[str, bool]:
        """Ce que la regle surveille, et ce qu'elle voit MAINTENANT, en un seul
        passage sur les pieces : {chauffage: un ouvrant de l'une de ses pieces
        suivies est-il ouvert ?}. La seule question que l'etat du moteur lui pose,
        une fois par etat (`_veille_des_fenetres`, chauffage.py) ; la question
        isolee d'un chauffage (`surveille`) est partie avec ses tests (relecture
        finale du 12/10).

        Surveille : la regle est allumee, et une piece active, avec des ouvrants,
        compte ce chauffage — l'interrupteur d'un module y valant son `select`
        (`table`, {interrupteur: select}, que l'etat du moteur fait d'un seul
        passage : `select_par_interrupteur`). L'ecran du chauffage ne parle de
        fenetre que la ou une ouverture agira vraiment (plan 2, tache 10 bis B) :
        ailleurs, il promettrait une protection qui n'existe pas.

        Ouvert : comme pour couper (`ouvrants_ouverts`) — `on`, `open`,
        `opening` ; un capteur muet ne l'est pas. C'est l'ouvrant MAINTENANT :
        le fait que le moteur garde (`fenetre_ouverte`) n'arrive qu'apres le
        delai, et se perd au redemarrage — fenetre grande ouverte, la fiche
        disait « Fermee » (relecture du 12/10)."""
        vus: dict[str, bool] = {}
        if not self.cfg.get("actif"):
            return vus
        etats: dict[str, Any] = {}
        for piece in (self.cfg.get("pieces") or {}).values():
            if not self._suivie(piece):
                continue
            ouvrants = [h for h in piece.get("ouvrants") or [] if isinstance(h, str)]
            for haid in ouvrants:
                if haid not in etats:
                    etats[haid] = self.hass.states.get(haid)
            ouverte = bool(ouvrants_ouverts(etats, ouvrants))
            for haid in piece.get("chauffages") or []:
                if isinstance(haid, str):
                    vrai = table.get(haid) or haid
                    vus[vrai] = vus.get(vrai, False) or ouverte
        return vus

    async def _async_faits(self, nom: str, piece: dict, ouverte: bool) -> None:
        """Dit au moteur qu'une fenetre de `nom` est ouverte (le delai passe) ou
        refermee, pour TOUS les chauffages de la piece : il n'agit que pour
        ceux dont le planning est allume, et sait deja tout le jour ou l'on
        allume le planning d'un autre."""
        chef = self._chef()
        if chef is None:
            return
        for haid in self._chauffages(piece):
            await chef.async_fenetre(haid, nom, ouverte)

    # ── Outils ─────────────────────────────────────────────────────────────
    def _etats(self) -> dict:
        """Les etats des entites qui nous interessent, sous forme de table."""
        table = {}
        for piece in (self.cfg.get("pieces") or {}).values():
            if not isinstance(piece, dict):
                continue
            for haid in list(piece.get("ouvrants") or []) + self._chauffages(piece):
                if haid not in table:
                    table[haid] = self.hass.states.get(haid)
        return table

    async def _async_service(self, domaine: str, service: str, cibles: list, data: dict, *,
                             regle: str = "", quoi: str = "", motif: str = "",
                             tenir: bool = False, jusqu_a_relacher: bool = False) -> list:
        """Commande par le socle : il ecarte ce qu'une main tient, et note."""
        return await self.regles.agir("fenetres", regle, domaine, service, cibles, data or None,
                                      quoi=quoi or service, motif=motif,
                                      priorite=PRIORITE, tenir=tenir,
                                      jusqu_a_relacher=jusqu_a_relacher, simuler=self._simule())

    def _simule(self) -> bool:
        """Observer sans agir : la regle note, rien ne bouge."""
        return bool(self.cfg.get("simulation"))

    def observe(self) -> bool:
        """« Observer sans agir », vu du dehors : l'etat du moteur du chauffage le
        dit a l'ecran (`fenetres_observe`). Hors planning, c'est la regle qui
        coupe — en observation, elle ne coupe rien (`regles.agir`)."""
        return self._simule()

    def _repartir_de_zero(self) -> None:
        """Du simule au reel, ou l'inverse : la regle repart de ce que la
        maison EST, pas de ce qu'elle a imagine avoir coupe."""
        for nom in list(self._minuteurs):
            self._desarmer(nom)
        self.coupes.clear()
        self._laisses.clear()
        self.regles.relacher("fenetres")

    # ── Ce que l'interface lit et ecrit ────────────────────────────────────
    async def async_config(self) -> dict[str, Any]:
        return self._config_de(await self.store.async_get_shared(CLE, None))

    def _config_de(self, brut: Any) -> dict[str, Any]:
        """La configuration, defauts compris. Synchrone : `async_enregistrer`
        la rebatit sous le verrou du magasin (lot 15 de l'audit du 03/10)."""
        cfg = dict(DEFAUT)
        cfg["pieces"] = {}
        if isinstance(brut, dict):
            for k, v in brut.items():
                if k == "pieces":
                    # Une table, sinon le defaut `{}` : la branche generique
                    # recopiait une liste telle quelle, puis `.values()` levait
                    # au reabonnement comme au redemarrage (relecture du lot 15).
                    if isinstance(v, dict):
                        cfg["pieces"] = {n: piece_propre(p) for n, p in v.items() if isinstance(p, dict)}
                elif k in cfg:
                    cfg[k] = v
        return cfg

    async def async_etat(self) -> dict[str, Any]:
        return {
            "config": self.cfg or await self.async_config(),
            "coupes": {n: sorted(v) for n, v in self.coupes.items()},
            "en_attente": sorted(self._minuteurs),
            "journal": await self.regles.journal(limite=40, module="fenetres"),
        }

    def _poser_patch(self, cfg: dict[str, Any], patch: dict[str, Any]) -> None:
        """Le patch de l'ecran, pose sur `cfg`. Synchrone : sous le verrou."""
        for k, v in (patch or {}).items():
            if k == "pieces":
                # Jamais la branche generique : elle ecrivait la liste et
                # effacait les pieces reglees (relecture du lot 15).
                for nom, piece in (v.items() if isinstance(v, dict) else ()):
                    if piece is None:
                        cfg["pieces"].pop(nom, None)
                    elif isinstance(piece, dict):
                        cfg["pieces"][nom] = piece_propre({**cfg["pieces"].get(nom, {}), **piece})
            elif k in cfg:
                cfg[k] = v

    async def async_enregistrer(self, patch: dict[str, Any]) -> dict[str, Any]:
        # Lu, change et ecrit d'un seul tenant (store.async_modifier_shared,
        # lot 15 de l'audit du 03/10) : deux reglages envoyes ensemble
        # partaient de la meme configuration, le second effacait le premier.
        simulait = False
        anciennes = dict(self.cfg.get("pieces") or {}) if self.cfg.get("actif") else {}

        def changer(brut: Any) -> dict[str, Any]:
            nonlocal simulait
            cfg = self._config_de(brut)
            simulait = bool(cfg.get("simulation"))
            self._poser_patch(cfg, patch)
            return cfg

        cfg = await self.store.async_modifier_shared(CLE, changer)
        self.cfg = cfg
        # Une piece qui n'est plus suivie ne dira plus jamais « refermee » :
        # son fait part tout de suite, sinon le moteur garderait ses
        # chauffages coupes (§ 6).
        for nom, piece in anciennes.items():
            neuve = (cfg.get("pieces") or {}).get(nom)
            if isinstance(piece, dict) and (not cfg.get("actif") or not isinstance(neuve, dict)
                                            or not neuve.get("actif")):
                await self._async_faits(nom, piece, False)
        if bool(cfg.get("simulation")) != simulait:
            self._repartir_de_zero()
        # Regle coupee, ou piece retiree : ce qui y etait coupe est lache. La
        # coupure n'a plus d'echeance, une fermeture qui ne sera plus suivie
        # la laisserait jusqu'au redemarrage (03/10).
        for nom in list(self.coupes):
            piece = (cfg.get("pieces") or {}).get(nom)
            if not cfg.get("actif") or not isinstance(piece, dict) or not piece.get("actif"):
                self._desarmer(nom)
                self.regles.relacher("fenetres", "fenetre", cibles=list(self.coupes.pop(nom)))
        await self._async_reabonner()
        # Chaque reabonnement revoit les pieces : une fenetre deja ouverte quand
        # on se met a suivre sa piece (ou apres un import) est comptee tout de
        # suite, pas au prochain changement de son ouvrant.
        await self._async_revoir()
        return cfg

    @callback
    def async_arreter(self) -> None:
        if self._au_demarrage:
            self._au_demarrage()
            self._au_demarrage = None
        ecoute, self._ecoute_registre = getattr(self, "_ecoute_registre", None), None
        if ecoute is not None:
            ecoute()
        for nom in list(self._minuteurs):
            self._desarmer(nom)
        for defaire in self._defait:
            try:
                defaire()
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia fenetres : desabonnement sans effet")
        self._defait.clear()
