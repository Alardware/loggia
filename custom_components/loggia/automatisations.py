"""Les automatisations de Home Assistant qui COMMANDENT un appareil (ADR 0155).

Pourquoi ce module existe
─────────────────────────
Le planning du distributeur etait une liste SAISIE dans Parametres : une heure
recopiee a la main, pas celle de l'automatisation qui distribue vraiment
(05/10). L'utilisateur l'a tranche : une automatisation se reconnait a ce
qu'elle FAIT — une action qui commande l'appareil, scripts suivis, l'heure lue
dans le declencheur —, JAMAIS a son nom.

Ce que Home Assistant releve deja
─────────────────────────────────
`automations_with_entity` / `automations_with_device` rendent les
automatisations dont `referenced_entities` / `referenced_devices` nomment une
cible. Ces references sont l'UNION des declencheurs, des conditions et des
actions : l'alerte « bac presque vide » y remonte aussi. Le filtre porte donc
sur les seules ACTIONS — `action_script.referenced_*`, et le parcours de
`raw_config` quand l'attribut manque (automatisation indisponible : ses
references sont vides, `automations_with_entity` ne la voit jamais ; une
version future qui le renommerait).

Deux sortes de cibles (contradicteur, 05/10)
────────────────────────────────────────────
Les cibles de COMMANDE (la commande, la portion, le mode, le script designe)
servent a TROUVER les candidates. Ne sont GARDEES que celles dont une action
vise une cible de REPAS : la commande, le script designe, ou un script qui
commande. Regler la portion ou le mode est un reglage, pas un repas : sinon une
« portion d'hiver » posee a 06:00 passerait pour un repas, entrerait dans le
prochain repas et les jours de reserve, et retiendrait le planning de Loggia —
un repas saute.

Un appel DIRECT `action: script.nourrir` n'est pas une reference pour HA (il
ne releve que target et data) : on parcourt donc toutes les automatisations
par `scripts_appeles`. Un script commande s'il vise une cible de repas,
directement ou par un script qu'il appelle — trois niveaux au plus, garde
anti-cycle.

Ce qui sort d'ici
─────────────────
Un RESUME : nom, etat, heures, jours, portions, droits. JAMAIS `raw_config`,
un message ni des donnees brutes : Home Assistant reserve `automation/config`
aux administrateurs, une commande ouverte ne doit pas le contourner. Une heure
qu'on ne peut pas deduire ne s'invente pas (soleil, periodique, « autre »).

Les fonctions de lecture de `raw_config` sont PURES (testees a sec) ; seule
`resumer` touche a Home Assistant, et ses imports sont paresseux : sans le
composant `automation`, elle rend une liste vide.
"""
from __future__ import annotations

import datetime as _dt
import logging
import re
from collections.abc import Callable, Iterable
from typing import Any

_LOGGER = logging.getLogger(__name__)

# Une device action ne vaut commande, quand son entite ne se resout pas, que
# dans ces domaines — une lumiere du distributeur n'est pas un repas. Egale a
# `tables.DOMAINES_ACTION_APPAREIL` de tests/fixtures/distributeurs.json.
DOMAINES_ACTION_APPAREIL = ("button", "number", "select", "text")
OPTION_START = "START"
# Les cles de donnees lues comme une quantite, sur l'action qui commande.
CLES_PORTIONS = ("value", "portions", "amount", "quantity", "grams")
# `script.turn_on` & co. visent un script par sa CIBLE (HA la releve) ; tout
# autre service du domaine `script` est un appel direct `script.<id>`.
SERVICES_SCRIPT_GENERIQUES = ("turn_on", "turn_off", "toggle", "reload")
# Les services qui NOMMENT une entite sans jamais la commander (relecture du
# 05/10) : un journal de bord, une notification, un rafraichissement. La liste
# est FERMEE, a dessein : le relecteur proposait d'exiger le domaine de
# l'entite (ou script / homeassistant), mais un service d'integration
# (`petkit.*`, `tuya.*`…) qui vise la commande distribue peut-etre — et un repas
# en double est le risque le plus grave (ADR 0155). On ecarte ce qu'on SAIT
# muet, pas ce qu'on ne connait pas.
DOMAINES_QUI_NOMMENT = ("logbook", "notify", "persistent_notification", "recorder", "system_log",
                        "logger", "tts")
SERVICES_QUI_NOMMENT = ("homeassistant.update_entity",)
# Trois niveaux de scripts au plus sous une automatisation (garde anti-cycle).
PROFONDEUR_SCRIPTS = 3
JOURS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
# Un time_pattern rend au plus 24 occurrences par jour : au-dela, « autre ».
OCCURRENCES_MAX = 24

_HEURE = re.compile(r"^\s*(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*$")
_DECALAGE = re.compile(r"^\s*([+-])?(\d{1,3}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*$")
_ENTITE = re.compile(r"^[a-z_]+\.[a-z0-9_]+$")
_GABARIT = object()  # une valeur en gabarit : portions inconnues


# ── Lecture pure de raw_config ──────────────────────────────────────────────

def _liste(x: Any) -> list:
    if x is None:
        return []
    return list(x) if isinstance(x, (list, tuple)) else [x]


def _active(bloc: Any) -> bool:
    """Un declencheur, une condition ou une action `enabled: false` est ignore.
    Un gabarit dans `enabled` n'est pas evalue : on le garde."""
    return not (isinstance(bloc, dict) and bloc.get("enabled") is False)


def _heure(texte: Any) -> str | None:
    """« 7:30 », « 07:30:00 » -> « 07:30 » ; None si ce n'est pas une heure."""
    if not isinstance(texte, str):
        return None
    m = _HEURE.match(texte)
    if not m:
        return None
    h, mi = int(m.group(1)), int(m.group(2))
    if h > 23 or mi > 59:
        return None
    return f"{h:02d}:{mi:02d}"


def _hhmm(minutes: int) -> str:
    minutes %= 1440
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def decalage(x: Any) -> int | None:
    """Un decalage en MINUTES entieres signees (les secondes tombent, vers zero).

    « [-]HH:MM[:SS] », {hours, minutes, seconds} ou un nombre de secondes.
    Absent -> 0 ; illisible (un gabarit) -> None.
    """
    if x is None:
        return 0
    if isinstance(x, bool):
        return None
    if isinstance(x, (int, float)):
        return int(x / 60)
    if isinstance(x, str):
        m = _DECALAGE.match(x)
        if not m:
            return None
        total = int(m.group(2)) * 3600 + int(m.group(3)) * 60 + int(m.group(4) or 0)
        return int((-total if m.group(1) == "-" else total) / 60)
    if isinstance(x, dict):
        total = 0.0
        for cle, poids in (("days", 86400), ("hours", 3600), ("minutes", 60), ("seconds", 1),
                           ("milliseconds", 0.001)):
            v = x.get(cle)
            if v is None:
                continue
            if isinstance(v, bool) or not isinstance(v, (int, float)):
                return None
            total += v * poids
        return int(total / 60)
    return None


def _entier(x: Any) -> int | None:
    if isinstance(x, bool):
        return None
    if isinstance(x, int):
        return x
    if isinstance(x, str) and x.strip().isdigit():
        return int(x.strip())
    return None


def _motif_horaire(trig: dict) -> dict:
    """time_pattern. hours « /N » (ou minutes seules) -> periodique, ses heures ;
    hours entier -> une heure fixe par jour (HA met alors les minutes absentes a
    0) ; tout le reste (« /5 » en minutes, « * ») -> autre."""
    heures, minutes, secondes = trig.get("hours"), trig.get("minutes"), trig.get("seconds")
    if secondes is not None and _entier(secondes) is None:
        return {"type": "autre"}
    if minutes is None:
        mi = 0 if heures is not None else None
    else:
        mi = _entier(minutes)
        if mi is None or mi > 59:
            return {"type": "autre"}
    if mi is None:  # ni heures ni minutes : toutes les secondes
        return {"type": "autre"}
    if heures is None:
        return {"type": "periodique", "toutes": 1, "heures": [_hhmm(h * 60 + mi) for h in range(24)]}
    if isinstance(heures, str) and heures.strip().startswith("/"):
        n = _entier(heures.strip()[1:])
        if not n or n > OCCURRENCES_MAX:
            return {"type": "autre"}
        return {"type": "periodique", "toutes": n,
                "heures": [_hhmm(h * 60 + mi) for h in range(0, 24, n)]}
    h = _entier(heures)
    if h is None or h > 23:
        return {"type": "autre"}
    return {"type": "heure", "heure": _hhmm(h * 60 + mi)}


def declencheurs(raw: Any) -> list[dict]:
    """Les declencheurs d'une automatisation, sans HA.

    `trigger` (2024.7) ou `triggers` (2024.10), `platform` ou `trigger` dans
    chacun ; `enabled: false` ignore. Types : heure {heure}, entite_heure
    {entite, decalage} (input_datetime ou sensor timestamp, resolu par
    `resumer`), soleil {evenement, decalage}, periodique {toutes, heures},
    autre. Les doublons exacts tombent.
    """
    raw = raw if isinstance(raw, dict) else {}
    sortie: list[dict] = []
    for trig in _liste(raw.get("triggers", raw.get("trigger"))):
        if not isinstance(trig, dict) or not _active(trig):
            continue
        sorte = trig.get("trigger", trig.get("platform"))
        lus: list[dict]
        if sorte == "time":
            lus = []
            for at in _liste(trig.get("at")):
                h = _heure(at)
                if h:
                    lus.append({"type": "heure", "heure": h})
                elif isinstance(at, str) and _ENTITE.match(at.strip()):
                    lus.append({"type": "entite_heure", "entite": at.strip(), "decalage": 0})
                elif isinstance(at, dict) and isinstance(at.get("entity_id"), str):
                    d = decalage(at.get("offset"))
                    lus.append({"type": "entite_heure", "entite": at["entity_id"].strip(), "decalage": d}
                               if d is not None else {"type": "autre"})
                else:
                    lus.append({"type": "autre"})
        elif sorte == "sun":
            d = decalage(trig.get("offset"))
            ev = trig.get("event")
            lus = [{"type": "soleil", "evenement": ev, "decalage": d}
                   if d is not None and ev in ("sunrise", "sunset") else {"type": "autre"}]
        elif sorte == "time_pattern":
            lus = [_motif_horaire(trig)]
        else:
            lus = [{"type": "autre"}]
        for d in lus:
            if d not in sortie:
                sortie.append(d)
    return sortie


def _jours_de(weekday: Any) -> set[int] | None:
    valeurs = [str(j).strip().lower() for j in _liste(weekday)]
    connus = {JOURS.index(j) for j in valeurs if j in JOURS}
    return connus or None


def jours(raw: Any) -> tuple[list[int] | None, bool]:
    """(jours, conditionnel). Jours : `weekday` des declencheurs d'heure, ou une
    condition `time` a weekday — seule, ou dans un `and` ; None = tous les
    jours. conditionnel : toute AUTRE condition de niveau haut (or, not,
    template, state, numeric_state, trigger…). Une branche choose / if n'est
    pas suivie en v1 (ADR 0155)."""
    raw = raw if isinstance(raw, dict) else {}
    # Declencheurs : l'union, sauf si l'un d'eux part tous les jours.
    par_declencheur: set[int] | None = set()
    for trig in _liste(raw.get("triggers", raw.get("trigger"))):
        if not isinstance(trig, dict) or not _active(trig):
            continue
        j = _jours_de(trig.get("weekday")) if trig.get("weekday") is not None else None
        if j is None:
            par_declencheur = None
            break
        par_declencheur |= j
    if par_declencheur is not None and not par_declencheur:
        par_declencheur = None  # aucun declencheur lisible : on ne restreint rien

    restreint: set[int] | None = None
    conditionnel = False

    def lire(cond: Any) -> None:
        nonlocal restreint, conditionnel
        if not _active(cond):
            return
        if not isinstance(cond, dict):  # gabarit abrege « {{ … }} »
            conditionnel = True
            return
        sorte = cond.get("condition")
        if sorte is None and len(cond) == 1 and next(iter(cond)) in ("and", "or", "not"):
            sorte = next(iter(cond))  # forme abregee {and: [...]}
            cond = {"condition": sorte, "conditions": cond[sorte]}
        if sorte == "time":
            j = _jours_de(cond.get("weekday")) if cond.get("weekday") is not None else None
            if j is not None:
                restreint = j if restreint is None else restreint & j
            return
        if sorte == "and":
            for sous in _liste(cond.get("conditions")):
                lire(sous)
            return
        conditionnel = True

    for cond in _liste(raw.get("conditions", raw.get("condition"))):
        lire(cond)

    if par_declencheur is None:
        tous = restreint
    elif restreint is None:
        tous = par_declencheur
    else:
        tous = par_declencheur & restreint
    if tous is not None and len(tous) == 7:
        tous = None
    return (sorted(tous) if tous is not None else None), conditionnel


def _ids(x: Any) -> list[str]:
    """Une liste d'entity_id ou de device_id : chaine, liste, « a, b ».
    Un gabarit ne s'evalue pas : il ne vise rien qu'on sache."""
    sortie = []
    for v in _liste(x):
        if not isinstance(v, str) or "{" in v:
            continue
        sortie += [p.strip().lower() for p in v.split(",") if p.strip()]
    return sortie


def actions(raw: Any) -> list[dict]:
    """Les APPELS d'une automatisation ou d'un script, a plat, sans HA.

    `action` / `actions` en tete (`sequence` pour un script), `service` ou
    `action` dans une etape ; descend dans sequence, choose (et default),
    if / then / else, parallel et repeat. Chaque appel :
    {appel 'domaine.service' | None, entites, appareils, donnees, appareil
    (la device action : {device_id, domaine, type, entite, option, valeur}) |
    None, repetition (le count d'un repeat englobant : entier, _GABARIT, None)}.
    Interne : JAMAIS renvoye a l'ecran.
    """
    raw = raw if isinstance(raw, dict) else {}
    etapes = raw.get("actions", raw.get("action", raw.get("sequence")))
    sortie: list[dict] = []

    def parcourir(liste: Any, rep: Any) -> None:
        for e in _liste(liste):
            etape(e, rep)

    def etape(e: Any, rep: Any) -> None:
        if not isinstance(e, dict) or not _active(e):
            return
        if "repeat" in e and isinstance(e["repeat"], dict):
            r = e["repeat"]
            n = _entier(r.get("count")) if "count" in r else None
            # while / until / for_each, ou un count en gabarit : on ne sait pas.
            parcourir(r.get("sequence"), n if n is not None else _GABARIT)
            return
        if "choose" in e:
            for option in _liste(e.get("choose")):
                if isinstance(option, dict):
                    parcourir(option.get("sequence"), rep)
            parcourir(e.get("default"), rep)
            return
        if "if" in e:
            parcourir(e.get("then"), rep)
            parcourir(e.get("else"), rep)
            return
        if "parallel" in e:
            parcourir(e.get("parallel"), rep)  # une etape, ou {sequence: [...]}
            return
        if "sequence" in e and isinstance(e.get("sequence"), list):
            parcourir(e.get("sequence"), rep)
            return
        service = e.get("action", e.get("service"))
        if isinstance(service, str) and "." in service and "{" not in service:
            cible = e.get("target") if isinstance(e.get("target"), dict) else {}
            donnees: dict = {}
            # `data_template` : l'ancienne ecriture, encore acceptee par HA et
            # relevee par lui ; le repli doit la lire aussi (contradicteur, 05/10).
            for cle in ("data_template", "data", "service_data"):
                if isinstance(e.get(cle), dict):
                    donnees.update(e[cle])
            entites = _ids(cible.get("entity_id")) + _ids(donnees.get("entity_id")) + _ids(e.get("entity_id"))
            appareils = _ids(cible.get("device_id")) + _ids(donnees.get("device_id"))
            sortie.append({"appel": service.strip().lower(), "entites": list(dict.fromkeys(entites)),
                           "appareils": list(dict.fromkeys(appareils)), "donnees": donnees,
                           "appareil": None, "repetition": rep})
            return
        if isinstance(e.get("device_id"), str) and isinstance(e.get("domain"), str) and "type" in e:
            sortie.append({"appel": None, "entites": [], "appareils": [e["device_id"].strip().lower()],
                           "donnees": {}, "repetition": rep,
                           "appareil": {"device_id": e["device_id"].strip().lower(),
                                        "domaine": e["domain"].strip().lower(),
                                        "type": str(e.get("type") or "").lower(),
                                        "entite": e.get("entity_id"), "option": e.get("option"),
                                        "valeur": e.get("value")}})

    parcourir(etapes, None)
    return sortie


def scripts_appeles(raw: Any) -> list[str]:
    """Les appels DIRECTS `script.<id>` (hors turn_on, turn_off, toggle,
    reload) : HA ne les compte pas comme references."""
    return _scripts_appeles_de(actions(raw))


def _scripts_appeles_de(acts: list[dict]) -> list[str]:
    vus = []
    for a in acts:
        appel = a.get("appel") or ""
        dom, _, service = appel.partition(".")
        if dom == "script" and service and service not in SERVICES_SCRIPT_GENERIQUES:
            eid = f"script.{service}"
            if eid not in vus:
                vus.append(eid)
    return sorted(vus)


def _scripts_vises(acts: list[dict]) -> list[str]:
    """Tous les scripts qu'une suite d'actions (deja lue) lance : appels
    directs ET cibles `script.*` (script.turn_on, homeassistant.turn_on…)."""
    vus = set(_scripts_appeles_de(acts))
    for a in acts:
        vus |= {e for e in a["entites"] if e.startswith("script.")}
    return sorted(vus)


# Memoire des actions lues (relecture du 05/10) : `actions()` faisait 85 % du
# temps de `resumer`, 0,2 a 0,7 s dans la boucle d'evenements sur une maison
# de 400 a 1000 automatisations — a CHAQUE sondage (60 s par carte, 15 s par
# fiche ouverte, chaque client), et trois fois par script. Home Assistant cree
# une `raw_config` NEUVE a chaque rechargement des automatisations ou des
# scripts et ne la modifie jamais en place : le MEME objet a les memes
# actions. {id(raw): (raw, actions)} — l'objet est tenu, son id ne peut donc
# pas resservir ; seules les configurations vues au dernier passage restent,
# une ancienne ne survit pas a son rechargement.
_MEMOIRE_ACTIONS: dict[int, tuple[Any, list[dict]]] = {}


def _actions_lues(raw: Any, vus: dict[int, tuple[Any, list[dict]]]) -> list[dict]:
    """`actions(raw)`, lue une fois par objet `raw_config` ; `vus` recueille ce
    que ce passage a rencontre (la memoire du suivant)."""
    if not isinstance(raw, dict) or not raw:
        return []
    garde = vus.get(id(raw)) or _MEMOIRE_ACTIONS.get(id(raw))
    if garde is None or garde[0] is not raw:
        garde = (raw, actions(raw))
    vus[id(raw)] = garde
    return garde[1]


def _resoudre(registre: Any, ident: Any) -> str | None:
    """L'entity_id d'une device action : un identifiant de registre (uuid) que
    le registre resout ; un entity_id deja lisible passe tel quel."""
    if not isinstance(ident, str) or not ident:
        return None
    if "." in ident:
        return ident.strip().lower()
    if registre is None:
        return None
    try:
        r = registre(ident) if callable(registre) else registre.get(ident)
    except Exception:  # noqa: BLE001 — un registre illisible ne resout rien
        return None
    return r if isinstance(r, str) else None


def _est_start(option: Any) -> bool:
    return isinstance(option, str) and option.strip().upper() == OPTION_START


def vise(action: dict, cibles: Iterable[str], appareils: Iterable[str], registre: Any = None) -> bool:
    """Cette action vise-t-elle une des cibles ?

    Un appel : une entite de `target` / `data` / l'etape, ou l'appel DIRECT
    `script.<id>` d'une cible. Viser l'APPAREIL entier (target.device_id) ne
    compte que dans DOMAINES_ACTION_APPAREIL, et pour un select avec START.
    Une device action : resolue par le registre -> l'entite doit etre une
    cible ; non resolue -> l'appareil, le domaine, et START pour un select.

    Dans ces deux cas sans entite, le domaine doit AUSSI etre celui d'une
    cible-entite (contradicteur, 05/10) : `number.set_value` sur l'appareil
    entier ecrit la portion de l'Aqara, pas un repas — la « portion d'hiver »
    que l'ADR ecarte, revenue par le device_id ; un `button.press` sur un
    appareil commande par un select ne distribue rien. Sans cible-entite (pas
    de `commande`, seulement des scripts) : jamais.

    Un appel qui NOMME une cible sans la commander (`logbook.log`, une
    notification, `homeassistant.update_entity`…) ne vise rien (relecture,
    05/10) : il retenait tous les repas de Loggia, un repas saute.
    """
    cibles = {c.lower() for c in cibles}
    appareils = {a.lower() for a in appareils}
    domaines = {c.split(".", 1)[0] for c in cibles if not c.startswith("script.")}
    dev = action.get("appareil")
    if dev:
        eid = _resoudre(registre, dev.get("entite"))
        if eid is not None:
            return eid in cibles
        if (dev["device_id"] not in appareils or dev["domaine"] not in DOMAINES_ACTION_APPAREIL
                or dev["domaine"] not in domaines):
            return False
        return dev["domaine"] != "select" or _est_start(dev.get("option"))
    appel = action.get("appel") or ""
    dom, _, service = appel.partition(".")
    if set(action.get("entites") or ()) & cibles and dom not in DOMAINES_QUI_NOMMENT \
            and appel not in SERVICES_QUI_NOMMENT:
        return True
    if dom == "script" and service not in SERVICES_SCRIPT_GENERIQUES and appel in cibles:
        return True
    if set(action.get("appareils") or ()) & appareils and dom in DOMAINES_ACTION_APPAREIL and dom in domaines:
        return dom != "select" or _est_start((action.get("donnees") or {}).get("option"))
    return False


def _nombre(x: Any) -> Any:
    """Un nombre lu tel quel ; un gabarit -> _GABARIT ; rien -> None."""
    if isinstance(x, bool) or x is None:
        return None
    if isinstance(x, (int, float)):
        return int(x) if float(x).is_integer() else x
    if isinstance(x, str):
        s = x.strip()
        if "{" in s:
            return _GABARIT
        try:
            f = float(s.replace(",", "."))
        except ValueError:
            return None
        return int(f) if f.is_integer() else f
    return None


def _est_appui(action: dict) -> bool:
    dev = action.get("appareil")
    if dev:
        return dev["domaine"] == "button" or (dev["domaine"] == "select" and _est_start(dev.get("option")))
    appel = action.get("appel") or ""
    return appel == "button.press" or (
        appel == "select.select_option" and _est_start((action.get("donnees") or {}).get("option")))


def _lire_portions(action: dict) -> Any:
    """Les portions d'UNE action : nombre, _GABARIT, ou None (rien de dit)."""
    trouves = []
    donnees = dict(action.get("donnees") or {})
    if isinstance(donnees.get("variables"), dict):  # script.turn_on
        donnees = {**donnees["variables"], **{k: v for k, v in donnees.items() if k != "variables"}}
    for cle in CLES_PORTIONS:
        if cle in donnees:
            trouves.append(_nombre(donnees[cle]))
    dev = action.get("appareil")
    if dev and dev.get("valeur") is not None:
        trouves.append(_nombre(dev["valeur"]))
    rep = action.get("repetition")
    if rep is not None and _est_appui(action):
        trouves.append(rep)
    trouves = [t for t in trouves if t is not None]
    if any(t is _GABARIT for t in trouves):
        return _GABARIT
    distincts = set(trouves)
    if len(distincts) > 1:
        return _GABARIT  # deux valeurs differentes : ambigu
    return trouves[0] if trouves else None


def portions(action: dict) -> int | float | None:
    """Les portions d'une action qui commande : value, portions, amount,
    quantity ou grams numeriques, ou le count numerique d'un repeat autour d'un
    appui. Un gabarit, ou deux valeurs differentes -> None."""
    p = _lire_portions(action)
    return None if p is _GABARIT else p


def _portions_de(acts: list[dict], vise_repas: Callable[[dict], bool]) -> int | float | None:
    valeurs = [_lire_portions(a) for a in acts if vise_repas(a)]
    valeurs = [v for v in valeurs if v is not None]
    if not valeurs or any(v is _GABARIT for v in valeurs) or len(set(valeurs)) > 1:
        return None
    return valeurs[0]


# ── Avec Home Assistant ─────────────────────────────────────────────────────

def _etat(hass: Any, eid: str) -> Any:
    try:
        return hass.states.get(eid)
    except Exception:  # noqa: BLE001
        return None


def _local(hass: Any, quand: _dt.datetime) -> _dt.datetime:
    """L'heure de la MAISON. `dt_util.as_local` dans HA ; a defaut le fuseau
    de la configuration ; a defaut le decalage que porte l'horodatage."""
    try:
        from homeassistant.util import dt as dt_util

        return dt_util.as_local(quand)
    except Exception:  # noqa: BLE001, S110 — hors de HA (tests) : le repli suit
        pass
    try:
        from zoneinfo import ZoneInfo

        return quand.astimezone(ZoneInfo(hass.config.time_zone))
    except Exception:  # noqa: BLE001
        return quand


def _heure_d_entite(hass: Any, eid: str, decal: int) -> str | None:
    """L'heure quotidienne qu'une entite donne a un declencheur `time`.

    input_datetime a heure SEULE (une date en fait un rendez-vous unique, pas
    un repas quotidien) ; sensor de classe timestamp, a l'heure de la maison.
    Vide ou illisible -> None : l'heure ne s'invente pas.
    """
    st = _etat(hass, eid)
    if st is None or str(getattr(st, "state", "")).lower() in ("", "unknown", "unavailable", "none"):
        return None
    attrs = getattr(st, "attributes", None) or {}
    dom = eid.split(".", 1)[0]
    if dom == "input_datetime":
        if attrs.get("has_date") or not attrs.get("has_time", True):
            return None
        h, mi = attrs.get("hour"), attrs.get("minute")
        if isinstance(h, int) and isinstance(mi, int):
            return _hhmm(h * 60 + mi + decal)
        lu = _heure(str(st.state))
        return _hhmm(int(lu[:2]) * 60 + int(lu[3:]) + decal) if lu else None
    if dom == "sensor" and attrs.get("device_class") == "timestamp":
        try:
            quand = _dt.datetime.fromisoformat(str(st.state).replace("Z", "+00:00"))
        except ValueError:
            return None
        if quand.tzinfo is not None:
            quand = _local(hass, quand)
        return _hhmm(quand.hour * 60 + quand.minute + decal)
    return None


def _resoudre_declencheurs(hass: Any, bruts: list[dict]) -> list[dict]:
    sortie: list[dict] = []
    for d in bruts:
        if d["type"] == "entite_heure":
            h = _heure_d_entite(hass, d["entite"], d.get("decalage") or 0)
            d = {"type": "heure", "heure": h} if h else {"type": "autre"}
        if d not in sortie:
            sortie.append(d)
    return sortie


def _composant(hass: Any, cle: str) -> Any:
    try:
        return (getattr(hass, "data", None) or {}).get(cle)
    except Exception:  # noqa: BLE001
        return None


def _entites_de(composant: Any) -> list:
    try:
        return list(getattr(composant, "entities", None) or [])
    except Exception:  # noqa: BLE001
        return []


def _entite(composant: Any, eid: str) -> Any:
    try:
        return composant.get_entity(eid) if composant is not None else None
    except Exception:  # noqa: BLE001
        return None


def _refs_actions(ent: Any) -> tuple[set, set] | None:
    """Ce que HA a releve dans les seules ACTIONS ; None quand il ne le dit
    pas (indisponible, version future) — repli sur raw_config."""
    scr = getattr(ent, "action_script", None)
    if scr is None:
        scr = getattr(ent, "script", None)  # une entite script.*
    if scr is None:
        return None
    try:
        return set(scr.referenced_entities or ()), set(scr.referenced_devices or ())
    except Exception:  # noqa: BLE001
        return None


def _registre_ha(hass: Any) -> Callable[[str], str | None] | None:
    try:
        from homeassistant.helpers import entity_registry as er

        reg = er.async_get(hass)
        resoudre = er.async_resolve_entity_id
    except Exception:  # noqa: BLE001
        return None
    return lambda ident: resoudre(reg, ident)


def _appelle(fonction: Any, hass: Any, x: str) -> list[str]:
    try:
        return [e for e in (fonction(hass, x) or []) if isinstance(e, str)]
    except Exception:  # noqa: BLE001
        return []


def _texte(x: Any) -> Any:
    if isinstance(x, (_dt.datetime, _dt.date)):
        return x.isoformat()
    return x if x is None or isinstance(x, str) else str(x)


def resumer(hass: Any, cibles: Iterable[str], appareils: Iterable[str], scripts: Iterable[str],
            indices: Any, user: Any, *, commande: str | None = None, registre: Any = None) -> list[dict]:
    """Les automatisations qui COMMANDENT l'appareil, resumees, filtrees par
    les droits du compte : `pour_compte(resumer_maison(...), user)`.

    cibles    : les cibles de COMMANDE (commande, portion, mode, script
                designe) — pour TROUVER les candidates ;
    appareils : les device_id de l'appareil ;
    scripts   : les scripts DESIGNES (Parametres) — des cibles de repas ;
    indices   : {ancienne_liste: [...], associee: [...]} — montres meme non
                reconnus, `indice` dit d'ou ils viennent ;
    user      : le compte (None = droits de la maison, au depart d'un repas) ;
    commande  : l'entite qui DISTRIBUE (commande_distribuer) — avec les
                scripts designes, ce sont les cibles de REPAS qui GARDENT une
                automatisation. Absente : seuls les scripts designes comptent
                (prudence : la portion et le mode ne deviennent jamais un repas) ;
    registre  : resout l'identifiant de registre d'une device action
                (mapping ou fonction) ; par defaut, celui de HA.
    """
    return pour_compte(resumer_maison(hass, cibles, appareils, scripts, indices,
                                      commande=commande, registre=registre), user)


def entites_testees(raw: Any) -> set[str]:
    """Les entites que les ACTIONS d'une automatisation (ou d'un script)
    TESTENT sans les commander : conditions d'un choose, d'un if, d'un
    repeat while / until, etape `condition`, declencheurs d'un
    wait_for_trigger — avec leurs and / or / not. HA met les premieres dans
    `referenced_entities` (`condition.async_extract_entities`)."""
    raw = raw if isinstance(raw, dict) else {}
    sortie: set[str] = set()

    def condition(c: Any) -> None:
        if isinstance(c, list):
            for x in c:
                condition(x)
            return
        if not isinstance(c, dict):
            return  # un gabarit abrege ne nomme rien qu'on sache
        sortie.update(_ids(c.get("entity_id")))
        condition(c.get("conditions"))
        for cle in ("and", "or", "not"):
            if cle in c and "condition" not in c:
                condition(c[cle])

    def parcourir(liste: Any) -> None:
        for e in _liste(liste):
            etape(e)

    def etape(e: Any) -> None:
        if not isinstance(e, dict):
            return
        if isinstance(e.get("repeat"), dict):
            condition(e["repeat"].get("while"))
            condition(e["repeat"].get("until"))
            parcourir(e["repeat"].get("sequence"))
        elif "choose" in e:
            for option in _liste(e.get("choose")):
                if isinstance(option, dict):
                    condition(option.get("conditions"))
                    parcourir(option.get("sequence"))
            parcourir(e.get("default"))
        elif "if" in e:
            condition(e.get("if"))
            parcourir(e.get("then"))
            parcourir(e.get("else"))
        elif "parallel" in e:
            parcourir(e.get("parallel"))
        elif "sequence" in e:
            parcourir(e.get("sequence"))
        elif "wait_for_trigger" in e:
            condition(e.get("wait_for_trigger"))
        elif "condition" in e or (len(e) == 1 and next(iter(e)) in ("and", "or", "not")):
            condition(e)

    parcourir(raw.get("actions", raw.get("action", raw.get("sequence"))))
    return sortie


def _reconnue(acts: list[dict], refs: tuple[set, set] | None, gardiennes: set,
              vise_repas: Callable[[dict], bool], raw: Any) -> bool:
    """Une automatisation (ou un script) commande-t-elle l'appareil ?

    Une action lue qui la vise suffit. Sinon, ce que HA a releve dans les
    actions (`referenced_entities`) compte encore, MOINS ce que le parcours a
    vu muet : une entite testee (`entites_testees` — HA y met les CONDITIONS
    d'un choose ou d'un if : tester l'etat de la commande n'est pas la
    commander, relecture du 05/10) ou nommee par un appel qui ne la commande
    pas (`logbook.log`, une notification…).

    Pas « le parcours tranche seul » (contradicteur de C2, 05/10) : HA releve
    aussi ce que `actions()` ne lit pas — `service_template`, un service en
    gabarit a cible fixe, une `sequence` sans liste. Les ecarter des qu'une
    autre action se lisait faisait partir le repas de Loggia a cote de celui de
    l'automatisation : une double ration, le risque le plus grave (ADR 0155).
    On ecarte ce qu'on SAIT muet, pas ce qu'on ne sait pas lire.
    """
    if any(vise_repas(a) for a in acts):
        return True
    douteuses = (refs[0] & gardiennes) if refs else set()
    if not douteuses:
        return False
    # Aucune action lue ne commande : celles qui nomment une gardienne la
    # nomment donc sans la commander.
    muettes = entites_testees(raw) | {e for a in acts for e in a.get("entites") or ()}
    return bool(douteuses - muettes)


def resumer_maison(hass: Any, cibles: Iterable[str], appareils: Iterable[str], scripts: Iterable[str],
                   indices: Any, *, commande: str | None = None,
                   registre: Any = None) -> list[tuple[dict, str | None]]:
    """Le resume sous les droits de la MAISON : [(element, id_config)].

    Calcule UNE fois par sondage (relecture du 05/10) : un compte ordinaire
    payait un second parcours de toutes les automatisations — ses droits, puis
    ceux de la maison sur lesquels le serveur retient un repas. `pour_compte`
    applique ensuite les droits d'un compte sans rien recalculer. `id_config`
    reste ici, hors de l'element : il ne sort que pour un administrateur.
    """
    try:
        from homeassistant.components.automation import (
            automations_with_device,
            automations_with_entity,
        )
    except ImportError:
        return []
    try:
        from homeassistant.components.script import (
            scripts_with_device,
            scripts_with_entity,
        )
    except ImportError:
        scripts_with_entity = scripts_with_device = None

    cibles = {c.lower() for c in cibles or () if isinstance(c, str)}
    appareils = {a.lower() for a in appareils or () if isinstance(a, str)}
    designes = {s.lower() for s in scripts or () if isinstance(s, str)}
    repas = set(designes) | ({commande.lower()} if isinstance(commande, str) else set())
    if registre is None:
        registre = _registre_ha(hass)
    comp_auto, comp_script = _composant(hass, "automation"), _composant(hass, "script")
    vus: dict[int, tuple[Any, list[dict]]] = {}

    # 1) Les scripts qui COMMANDENT : candidats par HA, plus tous ceux du
    #    composant (un appel direct entre scripts n'est pas une reference).
    pool = set(designes) | {e.entity_id for e in _entites_de(comp_script) if isinstance(getattr(e, "entity_id", None), str)}
    if scripts_with_entity is not None:
        for c in cibles | repas:
            pool.update(_appelle(scripts_with_entity, hass, c))
        for d in appareils:
            pool.update(_appelle(scripts_with_device, hass, d))

    # Memoire (contradicteur, 05/10) : sans elle, chaque script du pool
    # reparcourait ses descendants sur trois niveaux — 0,4 s pour 100 scripts
    # qui en appellent 3, 5 s pour 300 qui en appellent 8, DANS la boucle
    # d'evenements, a chaque sondage de la carte et a chaque depart de repas.
    # Chaque script est lu UNE fois ; la reponse est memorisee par (script,
    # niveaux restants). La garde de chemin tombe : la profondeur bornee arrete
    # deja un cycle, et un descendant qui repasse par un ancetre a moins de
    # niveaux que lui — il ne peut rien trouver que l'ancetre n'ait vu.
    lus: dict[str, tuple[bool, list[str]]] = {}

    def lire_script(sid: str) -> tuple[bool, list[str]]:
        if sid not in lus:
            ent = _entite(comp_script, sid)
            raw = getattr(ent, "raw_config", None) if ent is not None else None
            refs = _refs_actions(ent) if ent is not None else None
            acts = _actions_lues(raw, vus)
            direct = _reconnue(acts, refs, repas, lambda a: vise(a, repas, appareils, registre), raw)
            lus[sid] = (direct, _scripts_vises(acts))
        return lus[sid]

    reponses: dict[tuple[str, int], bool] = {}

    def script_commande(sid: str, reste: int) -> bool:
        if sid in repas:
            return True
        if reste <= 0:
            return False
        cle = (sid, reste)
        if cle not in reponses:  # `reste` decroit : (sid, reste) ne se rappelle jamais lui-meme
            direct, appeles = lire_script(sid)
            reponses[cle] = direct or any(script_commande(s, reste - 1) for s in appeles)
        return reponses[cle]

    commandants = {s for s in pool if script_commande(s, PROFONDEUR_SCRIPTS)}
    gardiennes = repas | commandants

    # 2) Les automatisations candidates.
    candidates: set[str] = set()
    for c in cibles | gardiennes:
        candidates.update(_appelle(automations_with_entity, hass, c))
    for d in appareils:
        candidates.update(_appelle(automations_with_device, hass, d))
    for ent in _entites_de(comp_auto):
        eid = getattr(ent, "entity_id", None)
        if not isinstance(eid, str):
            continue
        raw = getattr(ent, "raw_config", None)
        # Appel direct d'un script qui commande ; ou references inconnues
        # (indisponible) : seul raw_config peut le dire.
        if set(_scripts_appeles_de(_actions_lues(raw, vus))) & gardiennes or _refs_actions(ent) is None:
            candidates.add(eid)
    par_indice: dict[str, str] = {}
    if isinstance(indices, dict):
        for sorte in ("ancienne_liste", "associee"):  # associee, geste explicite, l'emporte
            for eid in _liste(indices.get(sorte)):
                if isinstance(eid, str) and eid.startswith("automation."):
                    par_indice[eid] = sorte
    candidates |= set(par_indice)

    def vise_repas(a: dict) -> bool:
        return vise(a, gardiennes, appareils, registre)

    # 3) Le resume, sous les droits de la maison.
    sortie: list[tuple[dict, str | None]] = []
    for eid in sorted(candidates):
        ent = _entite(comp_auto, eid)
        st = _etat(hass, eid)
        if ent is None and st is None:
            continue
        raw = getattr(ent, "raw_config", None) if ent is not None else None
        raw = raw if isinstance(raw, dict) else {}
        acts = _actions_lues(raw, vus)
        refs = _refs_actions(ent) if ent is not None else None
        reconnue = _reconnue(acts, refs, gardiennes, vise_repas, raw)
        if not reconnue and eid not in par_indice:
            continue
        attrs = dict(getattr(st, "attributes", None) or {}) if st is not None else {}
        decl = _resoudre_declencheurs(hass, declencheurs(raw))
        j, cond = jours(raw)
        id_config = attrs.get("id") or raw.get("id")
        element = {
            "entity_id": eid,
            "nom": _texte(attrs.get("friendly_name") or raw.get("alias") or eid),
            "etat": str(getattr(st, "state", None) or "unavailable"),
            "dernier": _texte(attrs.get("last_triggered")),
            "declencheurs": decl,
            "heures": sorted({d["heure"] for d in decl if d["type"] == "heure"}),
            "jours": j,
            "conditionnel": cond,
            "portions": _portions_de(acts, vise_repas) if reconnue else None,
            "pilotable": True,
            "modifiable": False,
            "indice": None if reconnue else par_indice[eid],
        }
        sortie.append((element, str(id_config) if id_config else None))
    sortie.sort(key=lambda p: ((p[0]["heures"] or ["~"])[0], str(p[0]["nom"]).casefold(), p[0]["entity_id"]))
    _MEMOIRE_ACTIONS.clear()
    _MEMOIRE_ACTIONS.update(vus)
    return sortie


def pour_compte(maison: list[tuple[dict, str | None]], user: Any) -> list[dict]:
    """Les droits d'un compte sur le resume de la maison : ce qu'il ne peut pas
    LIRE sort, `pilotable` suit ses droits de CONTROLE, `modifiable` et
    `id_config` sont reserves a un administrateur (HA reserve
    `automation/config`). Des COPIES : un compte ne deteint pas sur un autre."""
    from .discovery import _lecture_autorisee
    from .scenarios import controle_de

    lecture, controle = _lecture_autorisee(user), controle_de(user)
    admin = bool(user is not None and getattr(user, "is_admin", False))
    sortie = []
    for element, id_config in maison:
        eid = element["entity_id"]
        if lecture is not None and not lecture(eid):
            continue
        e = {k: v for k, v in element.items() if k != "indice"}
        e["pilotable"] = True if controle is None else bool(controle(eid))
        e["modifiable"] = bool(admin and id_config)
        if e["modifiable"]:
            e["id_config"] = id_config
        e["indice"] = element["indice"]
        sortie.append(e)
    return sortie
