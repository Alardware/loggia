"""Les scenarios : ce que la maison fait d'un seul geste.

Pourquoi ce module existe
─────────────────────────
« Bonne nuit », « Je pars », « Cinema » : les gestes que toutes les maisons
connaissent, et que chaque installation reecrit en scripts. Les ecosystemes
grand public les livrent tous d'avance ; Loggia les proposait par une rangee
de « scenes rapides » sans editeur, qui ne montrait que les six premieres
scenes de Home Assistant — jamais un script, jamais rien de compose.

Loggia les propose donc lui-meme, huit, composes d'apres ce que la maison
possede, et laisse ajouter les siens.

Un scenario est une MAIN, pas une regle
──────────────────────────────────────
Il part avec le contexte de la personne qui l'a lance : les regles y voient
une main (ADR 0002) et gelent ce qu'il a touche ; aucun gel ne le retient —
qui appuie sur « Bonne nuit » veut la maison eteinte, meme la lampe qu'il
vient d'allumer. Il passe donc par `hass.services` directement, pas par
`Regles.agir()`, et note lui-meme au journal ce qu'il a fait.

Compose, ou lie
───────────────
Un scenario COMPOSE decrit des familles et des portees — « toutes les
lumieres », « les volets du sejour » — resolues AU LANCEMENT contre les
registres : une lampe ajoutee demain est prise sans rien toucher. Une scene
Home Assistant fige une liste d'entites ; ici non. Un scenario LIE lance une
scene ou un script existant, et rien d'autre.

Ce que ce module refuse
───────────────────────
Desarmer une alarme, deverrouiller une porte : aucun geste ne le fait, ni par
defaut ni sur demande — le meme principe que le module presence. Armer parce
qu'on part est sans risque ; desarmer parce qu'on appuie sur une carte en est
un.
"""
from __future__ import annotations

import copy
import logging
import re
import time
import unicodedata
from datetime import datetime
from typing import TYPE_CHECKING, Any

from homeassistant.core import Context, HomeAssistant, callback

from .discovery import async_index
from .nuit import CLE as CLE_NUIT, fait_nuit

if TYPE_CHECKING:  # l'annotation seule — les tests chargent ce module hors paquet
    from .store import LoggiaStore

_LOGGER = logging.getLogger(__name__)

CLE = "loggia_scenarios"
# Les scenes rapides d'avant la v3.28 : reprises une fois, en scenarios lies.
CLE_ANCIENNE = "loggia_quickscenes"
CLE_ALARME = "loggia_alarm"
CLE_PRESENCE = "loggia_presence"
MODULE = "scenarios"

MAX_SCENARIOS = 24
MAX_ACTIONS = 12
MAX_NOM = 40

TEINTES = ("accent", "ambre", "tendre", "chambre", "bain", "vert", "gris")
PORTEES = ("maison", "piece", "vie")
CONDITIONS = (None, "nuit", "jour")

# Les familles et leurs gestes. Ni « desarmer » ni « deverrouiller » : voir
# le docstring du module.
GESTES: dict[str, tuple[str, ...]] = {
    "lumieres": ("eteindre", "allumer"),
    "volets": ("ouvrir", "fermer"),
    "medias": ("eteindre", "pause", "lecture", "allumer_tv"),
    "chauffage": ("confort", "eco"),
    "alarme": ("absent", "nuit", "maison"),
    "serrures": ("verrouiller",),
}
FAMILLES = tuple(GESTES)
DOMAINES = {"lumieres": "light", "volets": "cover", "medias": "media_player",
            "chauffage": "climate", "alarme": "alarm_control_panel", "serrures": "lock"}

# Ce qu'un volet est : par `device_class`, jamais par nom. Un portail, une
# porte de garage ou un clapet n'en est pas un ; une classe absente en est un.
CLASSES_VOLET = (None, "", "shutter", "blind", "shade", "curtain", "awning", "window")

# Les pieces ou l'on ne recoit pas : la portee « pieces de vie » les exclut.
MOTS_INTIMES = ("chambre", "bedroom", "bain", "bath", "wc", "toilet", "douche",
                "shower", "garage", "cave", "cellar", "buanderie", "laundry",
                "grenier", "attic")

SERVICES_ALARME = {"absent": "alarm_arm_away", "nuit": "alarm_arm_night",
                   "maison": "alarm_arm_home"}
# Le prereglage quand le thermostat en a un, la consigne sinon.
PRESETS_CHAUFFAGE = {"confort": ("comfort", 20.0), "eco": ("eco", 17.0)}
BORNES_VALEUR = {"lumieres": (1, 100), "chauffage": (5, 30)}

SLUG = re.compile(r"^[a-z0-9][a-z0-9_-]{0,39}$")


def _a(famille: str, geste: str, portee: str = "maison", **reste: Any) -> dict[str, Any]:
    d: dict[str, Any] = {"famille": famille, "geste": geste, "portee": portee}
    d.update(reste)
    return d


# Les huit scenarios de Loggia, dans l'ordre ou ils se presentent. `mots` sert
# a reconnaitre une scene ou un script existant qui fait la meme chose ;
# `piece` vaut « la piece de la television » ou « celle de l'enceinte » tant
# que l'utilisateur n'en a pas choisi une.
INTEGRES: list[dict[str, Any]] = [
    {"id": "reveil", "icone": "sunrise", "teinte": "ambre",
     "mots": ("reveil", "wake", "morning", "matin", "bonjour", "good_morning"),
     "actions": [_a("volets", "ouvrir"), _a("lumieres", "allumer", valeur=30, si="nuit"),
                 _a("chauffage", "confort")]},
    {"id": "depart", "icone": "running", "teinte": "bain",
     "mots": ("depart", "je_pars", "pars", "leave", "leaving", "away", "goodbye", "sortie", "absent"),
     "actions": [_a("lumieres", "eteindre"), _a("medias", "eteindre"), _a("chauffage", "eco"),
                 _a("alarme", "absent"), _a("serrures", "verrouiller")]},
    {"id": "retour", "icone": "home", "teinte": "accent",
     "mots": ("retour", "je_rentre", "rentre", "arrive", "coming_home", "im_home", "welcome", "bienvenue"),
     "actions": [_a("lumieres", "allumer", portee="vie", valeur=60, si="nuit"),
                 _a("chauffage", "confort")]},
    {"id": "nuit", "icone": "moon", "teinte": "chambre",
     "mots": ("nuit", "night", "bonne_nuit", "good_night", "dodo", "sleep", "coucher", "bedtime"),
     "actions": [_a("lumieres", "eteindre", sauf_veilleuses=True), _a("volets", "fermer"),
                 _a("medias", "eteindre"), _a("alarme", "nuit"), _a("serrures", "verrouiller")]},
    {"id": "cinema", "icone": "film", "teinte": "vert", "piece": "tv",
     "mots": ("cinema", "film", "movie", "netflix", "soiree_film"),
     "actions": [_a("medias", "pause"), _a("lumieres", "allumer", portee="piece", valeur=10),
                 _a("volets", "fermer", portee="piece"), _a("medias", "allumer_tv", portee="piece")]},
    {"id": "musique", "icone": "music", "teinte": "tendre", "piece": "enceinte",
     "mots": ("musique", "music", "radio", "playlist", "soiree", "party", "fete", "apero"),
     "actions": [_a("medias", "lecture", portee="piece"),
                 _a("lumieres", "allumer", portee="piece", valeur=50)]},
    {"id": "invites", "icone": "users", "teinte": "ambre",
     "mots": ("invite", "guest", "guests", "diner", "dinner", "reception"),
     "actions": [_a("lumieres", "allumer", portee="vie", valeur=100), _a("chauffage", "confort")]},
    {"id": "tout_eteindre", "icone": "power", "teinte": "gris",
     "mots": ("tout_eteindre", "all_off", "eteindre_tout", "everything_off"),
     "actions": [_a("lumieres", "eteindre"), _a("medias", "eteindre")]},
]
IDS_INTEGRES = tuple(s["id"] for s in INTEGRES)


# ── Outils purs ───────────────────────────────────────────────────────────────

def normaliser(texte: Any) -> str:
    """« Bonne nuit ! » devient « bonne_nuit » : sans accent, sans casse, un
    seul separateur — ce sur quoi les mots-cles se comparent."""
    s = unicodedata.normalize("NFKD", str(texte or ""))
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    s = re.sub(r"[^a-z0-9]+", "_", s).strip("_")
    return s


def slug(nom: Any) -> str:
    """L'identifiant d'un scenario personnel, tire de son nom."""
    s = normaliser(nom)[:32]
    return s or "scenario"


def score_integre(integre: dict[str, Any], *textes: Any) -> int:
    """Combien un nom ou un identifiant ressemble a un scenario de Loggia.

    Un texte EGAL a un mot-cle vaut trois, un texte qui le CONTIENT vaut un —
    de sorte que `script.good_night` aille a Bonne nuit (« good_night » et
    « night ») plutot qu'un `bedtime` d'enfant, et que `leaving_home` aille a
    Je pars sans que « home » ne le tire vers Je rentre : « home » seul n'est
    le mot de personne.
    """
    total = 0
    for t in textes:
        n = normaliser(t)
        if not n:
            continue
        for mot in integre.get("mots") or ():
            if n == mot:
                total += 3
            elif mot in n:
                total += 1
    return total


def meilleur_integre(haid: str, nom: Any = None, exclus=()) -> str | None:
    """Le scenario de Loggia auquel une scene ou un script ressemble le plus,
    ou None quand rien ne ressemble a rien."""
    queue = str(haid or "").split(".", 1)[-1]
    meilleur, score = None, 0
    for s in INTEGRES:
        if s["id"] in exclus:
            continue
        sc = score_integre(s, queue, nom)
        if sc > score:
            meilleur, score = s["id"], sc
    return meilleur


def est_lien(haid: Any) -> bool:
    return isinstance(haid, str) and (haid.startswith("scene.") or haid.startswith("script."))


def valider_action(brut: Any) -> dict[str, Any]:
    """Une action telle que l'ecran l'envoie, ou ValueError."""
    if not isinstance(brut, dict):
        raise ValueError("action illisible")
    famille = str(brut.get("famille") or "")
    if famille not in GESTES:
        raise ValueError(f"famille inconnue : {famille!r}")
    geste = str(brut.get("geste") or "")
    if geste not in GESTES[famille]:
        raise ValueError(f"geste inconnu pour {famille} : {geste!r}")
    portee = str(brut.get("portee") or "maison")
    if portee not in PORTEES:
        raise ValueError(f"portee inconnue : {portee!r}")
    si = brut.get("si") or None
    if si not in CONDITIONS:
        raise ValueError(f"condition inconnue : {si!r}")
    action: dict[str, Any] = {"famille": famille, "geste": geste, "portee": portee}
    piece = brut.get("piece")
    if isinstance(piece, str) and piece.strip():
        action["piece"] = piece.strip()[:60]
    if si:
        action["si"] = si
    if brut.get("sauf_veilleuses"):
        action["sauf_veilleuses"] = True
    bornes = BORNES_VALEUR.get(famille)
    if bornes and brut.get("valeur") is not None:
        try:
            v = float(brut["valeur"])
        except (TypeError, ValueError) as err:
            raise ValueError("valeur illisible") from err
        v = max(bornes[0], min(bornes[1], v))
        action["valeur"] = int(v) if famille == "lumieres" else round(v, 1)
    return action


def valider_scenario(brut: Any) -> dict[str, Any]:
    """Un scenario tel que l'ecran l'envoie, nettoye, ou ValueError."""
    if not isinstance(brut, dict):
        raise ValueError("scenario illisible")
    s: dict[str, Any] = {}
    ident = brut.get("id")
    if ident is not None:
        ident = str(ident)
        if not SLUG.match(ident):
            raise ValueError(f"identifiant invalide : {ident!r}")
        s["id"] = ident
    nom = brut.get("nom")
    if nom is not None:
        nom = str(nom).strip()[:MAX_NOM]
        s["nom"] = nom or None
    icone = brut.get("icone")
    if icone is not None:
        icone = str(icone).strip().lower()
        if not re.match(r"^[a-z0-9-]{1,40}$", icone):
            raise ValueError(f"icone invalide : {icone!r}")
        s["icone"] = icone
    teinte = brut.get("teinte")
    if teinte is not None:
        if teinte not in TEINTES:
            raise ValueError(f"teinte inconnue : {teinte!r}")
        s["teinte"] = teinte
    for champ in ("masque", "accueil"):
        if champ in brut:
            s[champ] = bool(brut[champ])
    if "lien" in brut:
        lien = brut["lien"]
        if lien is not None and not est_lien(lien):
            raise ValueError("un lien designe une scene ou un script")
        s["lien"] = lien or None
    if "piece" in brut:
        piece = brut["piece"]
        s["piece"] = (str(piece).strip()[:60] or None) if isinstance(piece, str) else None
    if "actions" in brut:
        actions = brut["actions"]
        if actions is None:
            s["actions"] = None
        else:
            if not isinstance(actions, list):
                raise ValueError("actions illisibles")
            if len(actions) > MAX_ACTIONS:
                raise ValueError(f"trop d'actions ({len(actions)} > {MAX_ACTIONS})")
            s["actions"] = [valider_action(a) for a in actions]
    return s


def config_vide() -> dict[str, Any]:
    return {"version": 1, "integres": {}, "persos": [], "ordre": [], "migre": False}


def lire_config(brut: Any) -> dict[str, Any]:
    """Ce que le magasin contient, ramene a une forme sure."""
    cfg = config_vide()
    if not isinstance(brut, dict):
        return cfg
    integres = brut.get("integres")
    if isinstance(integres, dict):
        cfg["integres"] = {k: dict(v) for k, v in integres.items()
                           if k in IDS_INTEGRES and isinstance(v, dict)}
    persos = brut.get("persos")
    if isinstance(persos, list):
        cfg["persos"] = [dict(p) for p in persos
                         if isinstance(p, dict) and isinstance(p.get("id"), str)]
    ordre = brut.get("ordre")
    if isinstance(ordre, list):
        cfg["ordre"] = [x for x in ordre if isinstance(x, str)]
    cfg["migre"] = bool(brut.get("migre"))
    return cfg


def effectifs(cfg: dict[str, Any]) -> list[dict[str, Any]]:
    """Les scenarios tels qu'ils se presentent : les huit de Loggia, chacun
    avec ce que l'utilisateur y a change, puis les siens ; dans l'ordre
    choisi, les inconnus de l'ordre a la suite."""
    out: list[dict[str, Any]] = []
    for base in INTEGRES:
        o = (cfg.get("integres") or {}).get(base["id"]) or {}
        actions = o.get("actions")
        out.append({
            "id": base["id"], "integre": True,
            "nom": o.get("nom") or None,
            "icone": o.get("icone") or base["icone"],
            "teinte": o.get("teinte") or base["teinte"],
            "masque": bool(o.get("masque")),
            "accueil": bool(o.get("accueil", True)),
            "lien": o.get("lien") or None,
            "piece": o.get("piece") or None,
            "piece_auto": base.get("piece"),
            "actions": copy.deepcopy(actions if isinstance(actions, list) else base["actions"]),
            "modifie": bool(o),
        })
    for p in cfg.get("persos") or []:
        actions = p.get("actions")
        out.append({
            "id": p["id"], "integre": False,
            "nom": p.get("nom") or p["id"],
            "icone": p.get("icone") or "sparkles",
            "teinte": p.get("teinte") if p.get("teinte") in TEINTES else "accent",
            "masque": bool(p.get("masque")),
            "accueil": bool(p.get("accueil", True)),
            "lien": p.get("lien") or None,
            "piece": p.get("piece") or None,
            "piece_auto": None,
            "actions": copy.deepcopy(actions) if isinstance(actions, list) else [],
            "modifie": True,
        })
    ordre = cfg.get("ordre") or []
    if ordre:
        rang = {ident: i for i, ident in enumerate(ordre)}
        out.sort(key=lambda s: rang.get(s["id"], len(rang)))
    return out


def intime(piece: Any) -> bool:
    n = normaliser(piece)
    return any(mot in n for mot in MOTS_INTIMES)


def dans_la_portee(entite: dict[str, Any], portee: str, piece: str | None) -> bool:
    if portee == "maison":
        return True
    ou = entite.get("piece")
    if portee == "piece":
        return bool(piece) and bool(ou) and normaliser(ou) == normaliser(piece)
    # « pieces de vie » : une piece connue, et pas une ou l'on dort ni ou l'on
    # se lave. Une entite sans piece n'est pas une piece de vie.
    return bool(ou) and not intime(ou)


def piece_de(scenario: dict[str, Any], maison: dict[str, Any]) -> str | None:
    """La piece d'un scenario : celle qu'on a choisie, sinon celle de la
    television (cinema) ou de l'enceinte (musique), sinon aucune."""
    if scenario.get("piece"):
        return scenario["piece"]
    auto = scenario.get("piece_auto")
    if not auto:
        return None
    for haid in sorted(maison.get("entites") or {}):
        e = maison["entites"][haid]
        if not haid.startswith("media_player.") or not e.get("piece"):
            continue
        est_tv = e.get("classe") == "tv"
        if (auto == "tv" and est_tv) or (auto == "enceinte" and not est_tv):
            return e["piece"]
    return None


def cibles(action: dict[str, Any], maison: dict[str, Any], piece: str | None,
           veilleuses=(), alarme: str | None = None, nuit: bool = False) -> list[str]:
    """Les entites qu'une action toucherait MAINTENANT — celles qui ont
    quelque chose a faire : on n'eteint pas une lampe eteinte, on ne ferme
    pas un volet ferme. C'est ce qui rend le journal vrai."""
    si = action.get("si")
    if (si == "nuit" and not nuit) or (si == "jour" and nuit):
        return []
    famille, geste = action["famille"], action["geste"]
    if famille == "alarme":
        return [alarme] if alarme else []
    portee = action.get("portee") or "maison"
    ou = action.get("piece") or piece
    domaine = DOMAINES[famille] + "."
    epargnees = set(veilleuses or ()) if action.get("sauf_veilleuses") else set()
    out = []
    for haid in sorted(maison.get("entites") or {}):
        if not haid.startswith(domaine) or haid in epargnees:
            continue
        e = maison["entites"][haid]
        if not dans_la_portee(e, portee, ou):
            continue
        etat = str(e.get("etat") or "").lower()
        if etat in ("unavailable", "unknown", ""):
            continue
        if famille == "lumieres":
            if geste == "eteindre" and etat != "on":
                continue
        elif famille == "volets":
            if e.get("classe") not in CLASSES_VOLET:
                continue
            if (geste == "fermer" and etat == "closed") or (geste == "ouvrir" and etat == "open"):
                continue
        elif famille == "medias":
            tv = e.get("classe") == "tv"
            if geste == "eteindre" and etat == "off":
                continue
            if geste == "pause" and etat != "playing":
                continue
            if geste == "lecture" and (tv or etat == "playing"):
                continue
            if geste == "allumer_tv" and not tv:
                continue
        elif famille == "serrures":
            if etat == "locked":
                continue
        out.append(haid)
    return out


def ordres(action: dict[str, Any], haids: list[str],
           maison: dict[str, Any]) -> list[tuple[str, str, list[str], dict[str, Any]]]:
    """Les appels de service d'une action, sur ses cibles."""
    if not haids:
        return []
    famille, geste = action["famille"], action["geste"]
    domaine = DOMAINES[famille]
    if famille == "lumieres":
        if geste == "eteindre":
            return [(domaine, "turn_off", haids, {})]
        return [(domaine, "turn_on", haids, {"brightness_pct": int(action.get("valeur") or 100)})]
    if famille == "volets":
        return [(domaine, "open_cover" if geste == "ouvrir" else "close_cover", haids, {})]
    if famille == "medias":
        service = {"eteindre": "turn_off", "pause": "media_pause",
                   "lecture": "media_play", "allumer_tv": "turn_on"}[geste]
        return [(domaine, service, haids, {})]
    if famille == "chauffage":
        preset, defaut = PRESETS_CHAUFFAGE[geste]
        consigne = float(action.get("valeur") or defaut)
        par_preset, par_consigne = [], []
        for haid in haids:
            modes = ((maison.get("entites") or {}).get(haid) or {}).get("attrs", {}).get("preset_modes") or []
            (par_preset if preset in modes else par_consigne).append(haid)
        out = []
        if par_preset:
            out.append((domaine, "set_preset_mode", par_preset, {"preset_mode": preset}))
        if par_consigne:
            out.append((domaine, "set_temperature", par_consigne, {"temperature": consigne}))
        return out
    if famille == "alarme":
        return [(domaine, SERVICES_ALARME[geste], haids, {})]
    return [(domaine, "lock", haids, {})]


def migrer_quickscenes(cfg: dict[str, Any], anciennes: Any) -> dict[str, Any]:
    """Les scenes rapides d'avant deviennent des scenarios lies : celle qui
    ressemble a un scenario de Loggia lui donne son lien, les autres
    deviennent des scenarios personnels. Une seule fois."""
    cfg = copy.deepcopy(cfg)
    pris = {i for i, o in cfg["integres"].items() if o.get("lien")}
    for entree in anciennes if isinstance(anciennes, list) else []:
        if not isinstance(entree, dict) or not est_lien(entree.get("haid")):
            continue
        haid, nom = entree["haid"], entree.get("name")
        cible = meilleur_integre(haid, nom, exclus=pris)
        if cible:
            cfg["integres"][cible] = {**cfg["integres"].get(cible, {}), "lien": haid}
            pris.add(cible)
            continue
        base = "perso_" + slug(nom or haid.split(".", 1)[-1])
        ident, n = base, 2
        existants = {p["id"] for p in cfg["persos"]}
        while ident in existants or ident in IDS_INTEGRES:
            ident, n = f"{base}_{n}", n + 1
        cfg["persos"].append({"id": ident,
                              "nom": str(nom or haid.split(".", 1)[-1].replace("_", " "))[:MAX_NOM],
                              "icone": str(entree.get("icon") or "sparkles"), "teinte": "accent",
                              "lien": haid, "actions": []})
    cfg["migre"] = True
    return cfg


def _epoch(texte: Any) -> float | None:
    """L'etat d'une scene ou d'un script est la date de son dernier
    lancement, en ISO. Illisible : rien."""
    if not isinstance(texte, str) or not texte or texte in ("unknown", "unavailable"):
        return None
    try:
        return datetime.fromisoformat(texte.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


class LoggiaScenarios:
    """Compose, garde et lance les scenarios de la maison."""

    def __init__(self, hass: HomeAssistant, store: "LoggiaStore", regles=None) -> None:
        self.hass = hass
        self.store = store
        self.regles = regles
        # Le dernier lancement de chaque scenario compose, en memoire : un
        # scenario lie a sa date dans l'etat de sa scene.
        self._derniers: dict[str, float] = {}
        hass.async_create_task(self._async_demarrer())

    async def _async_demarrer(self) -> None:
        try:
            await self.async_migrer()
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Loggia scenarios : reprise des scenes rapides impossible")

    # ── La maison, telle qu'elle est maintenant ─────────────────────────────
    def _ids(self, domaine: str) -> list[str]:
        try:
            return list(self.hass.states.async_entity_ids(domaine))
        except Exception:  # noqa: BLE001
            return []

    @callback
    def inventaire(self) -> dict[str, Any]:
        """Les entites pilotables, avec leur piece (celle de l'entite, sinon
        de son appareil), leur classe et leur etat. Une entite de
        configuration ou de diagnostic — la diode d'une borne — n'y est pas."""
        try:
            index = async_index(self.hass)
        except Exception:  # noqa: BLE001
            index = {}
        zones = {a.get("id"): a.get("name") for a in index.get("areas") or [] if a.get("id")}
        appareils = {d.get("id"): d.get("area") for d in index.get("devices") or [] if d.get("id")}
        registre: dict[str, dict[str, Any]] = {}
        for e in index.get("entities") or []:
            if not e.get("id"):
                continue
            zone = e.get("area") or appareils.get(e.get("device"))
            registre[e["id"]] = {"piece": zones.get(zone), "classe": e.get("device_class"),
                                 "categorie": e.get("category"), "cache": bool(e.get("hidden"))}
        entites: dict[str, dict[str, Any]] = {}
        for domaine in DOMAINES.values():
            for haid in self._ids(domaine):
                r = registre.get(haid) or {}
                if r.get("categorie") or r.get("cache"):
                    continue
                st = self.hass.states.get(haid)
                attrs = dict(getattr(st, "attributes", None) or {})
                entites[haid] = {"piece": r.get("piece"),
                                 "classe": r.get("classe") or attrs.get("device_class"),
                                 "etat": str(getattr(st, "state", "") or ""),
                                 "attrs": attrs,
                                 "nom": str(attrs.get("friendly_name") or haid)}
        return {"zones": sorted({z for z in zones.values() if z}), "entites": entites}

    async def _veilleuses(self) -> list[str]:
        nuit = await self.store.async_get_shared(CLE_NUIT, None)
        v = (nuit or {}).get("veilleuse") if isinstance(nuit, dict) else None
        lampes = (v or {}).get("lampes") if isinstance(v, dict) else None
        return [h for h in (lampes or []) if isinstance(h, str)]

    async def _alarme(self, maison: dict[str, Any]) -> str | None:
        """Le panneau : celui choisi dans Parametres, sinon celui du module
        presence, sinon le seul qu'il y a."""
        choix = await self.store.async_get_shared(CLE_ALARME, None)
        if isinstance(choix, dict):
            choix = choix.get("haid") or choix.get("id") or choix.get("main")
        if isinstance(choix, str) and choix.startswith("alarm_control_panel."):
            return choix
        presence = await self.store.async_get_shared(CLE_PRESENCE, None)
        entite = (((presence or {}).get("depart") or {}).get("alarme") or {}).get("entite") \
            if isinstance(presence, dict) else None
        if isinstance(entite, str) and entite.startswith("alarm_control_panel."):
            return entite
        for haid in sorted(maison.get("entites") or {}):
            if haid.startswith("alarm_control_panel."):
                return haid
        return None

    def _nuit(self) -> bool:
        return fait_nuit(self.hass.states.get("sun.sun"))

    async def _contexte(self) -> dict[str, Any]:
        maison = self.inventaire()
        return {"maison": maison, "veilleuses": await self._veilleuses(),
                "alarme": await self._alarme(maison), "nuit": self._nuit()}

    def _resume(self, s: dict[str, Any], ctx: dict[str, Any]) -> tuple[str | None, list[dict[str, Any]]]:
        piece = piece_de(s, ctx["maison"])
        resume = []
        for a in s["actions"]:
            haids = cibles(a, ctx["maison"], piece, ctx["veilleuses"], ctx["alarme"], ctx["nuit"])
            resume.append({"famille": a["famille"], "geste": a["geste"], "portee": a.get("portee") or "maison",
                           "piece": a.get("piece") or (piece if (a.get("portee") == "piece") else None),
                           "valeur": a.get("valeur"), "si": a.get("si"), "n": len(haids)})
        return piece, resume

    # ── Lancer ──────────────────────────────────────────────────────────────
    async def async_lancer(self, ident: str, user_id: str | None = None) -> dict[str, Any] | None:
        """Lance un scenario. Rend ce qui est parti, ou None s'il n'existe pas."""
        cfg = await self.async_config()
        s = next((x for x in effectifs(cfg) if x["id"] == ident), None)
        if s is None:
            return None
        ctx = Context(user_id=user_id) if user_id else Context()
        nom = s.get("nom") or s["id"]
        fait: list[dict[str, Any]] = []
        touchees: list[str] = []
        if s.get("lien"):
            lien = s["lien"]
            domaine = lien.split(".", 1)[0]
            try:
                await self.hass.services.async_call(domaine, "turn_on", {"entity_id": [lien]},
                                                    blocking=False, context=ctx)
                fait.append({"famille": "lien", "geste": domaine, "n": 1})
                touchees.append(lien)
            except Exception:  # noqa: BLE001
                _LOGGER.exception("Loggia scenarios : %s a echoue", lien)
        else:
            c = await self._contexte()
            piece = piece_de(s, c["maison"])
            for a in s["actions"]:
                haids = cibles(a, c["maison"], piece, c["veilleuses"], c["alarme"], c["nuit"])
                n = 0
                for domaine, service, cibles_, data in ordres(a, haids, c["maison"]):
                    charge: dict[str, Any] = {"entity_id": list(cibles_)}
                    charge.update(data)
                    try:
                        await self.hass.services.async_call(domaine, service, charge,
                                                            blocking=False, context=ctx)
                    except Exception:  # noqa: BLE001
                        _LOGGER.exception("Loggia scenarios : %s.%s a echoue", domaine, service)
                        continue
                    n += len(cibles_)
                    touchees.extend(cibles_)
                fait.append({"famille": a["famille"], "geste": a["geste"], "n": n,
                             "piece": a.get("piece") or (piece if a.get("portee") == "piece" else None)})
        self._derniers[s["id"]] = time.time()
        if self.regles is not None:
            try:
                await self.regles.noter(MODULE, s["id"], nom, cibles=touchees,
                                        motif="lie" if s.get("lien") else "compose",
                                        detail=", ".join(f"{f['famille']} {f['n']}" for f in fait))
            except Exception:  # noqa: BLE001
                _LOGGER.debug("Loggia scenarios : journal indisponible")
        return {"id": s["id"], "fait": fait, "n": len(touchees)}

    # ── Ce que l'interface lit et ecrit ─────────────────────────────────────
    async def async_config(self) -> dict[str, Any]:
        return lire_config(await self.store.async_get_shared(CLE, None))

    async def async_migrer(self) -> dict[str, Any]:
        cfg = await self.async_config()
        if cfg.get("migre"):
            return cfg
        anciennes = await self.store.async_get_shared(CLE_ANCIENNE, None)
        cfg = migrer_quickscenes(cfg, anciennes)
        await self.store.async_set_shared(CLE, cfg)
        return cfg

    def _dernier(self, s: dict[str, Any]) -> float | None:
        fois = [self._derniers.get(s["id"])]
        if s.get("lien"):
            st = self.hass.states.get(s["lien"])
            fois.append(_epoch(getattr(st, "state", None)))
        fois = [f for f in fois if f]
        return max(fois) if fois else None

    async def async_etat(self) -> dict[str, Any]:
        cfg = await self.async_config()
        c = await self._contexte()
        maison = c["maison"]
        liens = []
        for domaine in ("scene", "script"):
            for haid in sorted(self._ids(domaine)):
                st = self.hass.states.get(haid)
                nom = (getattr(st, "attributes", None) or {}).get("friendly_name")
                liens.append({"haid": haid, "nom": str(nom or haid.split(".", 1)[-1].replace("_", " "))})
        pris = {s["lien"] for s in effectifs(cfg) if s.get("lien")}
        scenarios = []
        for s in effectifs(cfg):
            piece, resume = self._resume(s, c)
            suggestion = None
            if s["integre"] and not s.get("lien"):
                base = next(b for b in INTEGRES if b["id"] == s["id"])
                meilleur, score = None, 0
                for lien in liens:
                    if lien["haid"] in pris:
                        continue
                    sc = score_integre(base, lien["haid"].split(".", 1)[-1], lien["nom"])
                    if sc > score:
                        meilleur, score = lien["haid"], sc
                suggestion = meilleur
            scenarios.append({**{k: v for k, v in s.items() if k != "piece_auto"},
                              "piece_effective": piece, "resume": resume,
                              "dernier": self._dernier(s), "suggestion": suggestion,
                              "lien_absent": bool(s.get("lien")) and self.hass.states.get(s["lien"]) is None})
        journal = []
        if self.regles is not None:
            try:
                journal = await self.regles.journal(limite=40, module=MODULE)
            except Exception:  # noqa: BLE001
                journal = []
        return {"scenarios": scenarios, "liens": liens, "pieces": maison["zones"],
                "alarme": c["alarme"], "journal": journal}

    async def async_enregistrer(self, patch: dict[str, Any]) -> dict[str, Any]:
        """Quatre gestes, dans cet ordre : enregistrer un scenario (le sien ou
        ce qu'on change a l'un de Loggia), en supprimer un personnel,
        remettre d'origine un scenario de Loggia, choisir l'ordre."""
        cfg = await self.async_config()
        if not isinstance(patch, dict):
            raise ValueError("patch illisible")
        if "enregistrer" in patch:
            s = valider_scenario(patch["enregistrer"])
            ident = s.get("id")
            if ident in IDS_INTEGRES:
                ancien = cfg["integres"].get(ident) or {}
                neuf = {**ancien, **{k: v for k, v in s.items() if k != "id"}}
                # Des actions remises a None = les actions d'origine.
                if neuf.get("actions") is None:
                    neuf.pop("actions", None)
                cfg["integres"][ident] = neuf
            else:
                persos = cfg["persos"]
                existant = next((p for p in persos if p["id"] == ident), None) if ident else None
                if existant is None:
                    if len(persos) >= MAX_SCENARIOS:
                        raise ValueError(f"trop de scenarios ({MAX_SCENARIOS} au plus)")
                    base = "perso_" + slug(s.get("nom") or "scenario")
                    ident, n = base, 2
                    pris = {p["id"] for p in persos}
                    while ident in pris or ident in IDS_INTEGRES:
                        ident, n = f"{base}_{n}", n + 1
                    neuf = {"id": ident, "nom": s.get("nom") or ident, "icone": s.get("icone") or "sparkles",
                            "teinte": s.get("teinte") or "accent", "lien": s.get("lien"),
                            "piece": s.get("piece"), "actions": s.get("actions") or [],
                            "masque": bool(s.get("masque")), "accueil": bool(s.get("accueil", True))}
                    persos.append(neuf)
                else:
                    existant.update({k: v for k, v in s.items() if k != "id"})
                    if existant.get("actions") is None:
                        existant["actions"] = []
        if "supprimer" in patch:
            ident = str(patch["supprimer"])
            if ident in IDS_INTEGRES:
                raise ValueError("un scenario de Loggia se masque, il ne se supprime pas")
            cfg["persos"] = [p for p in cfg["persos"] if p["id"] != ident]
            cfg["ordre"] = [x for x in cfg["ordre"] if x != ident]
        if "reinitialiser" in patch:
            cfg["integres"].pop(str(patch["reinitialiser"]), None)
        if "ordre" in patch:
            ordre = patch["ordre"]
            if not isinstance(ordre, list):
                raise ValueError("ordre illisible")
            connus = {s["id"] for s in effectifs(cfg)}
            cfg["ordre"] = [x for x in ordre if isinstance(x, str) and x in connus]
        await self.store.async_set_shared(CLE, cfg)
        return cfg

    @callback
    def async_arreter(self) -> None:
        """Rien a defaire : aucun abonnement, aucune minuterie."""
