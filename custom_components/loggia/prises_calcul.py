"""Les prises sans Home Assistant : la configuration, ce que l'etat publie, le cycle (chantier Prises, spec 5 et 6.1).

Pur : ni Home Assistant, ni horloge, ni disque. `prises.py` y prend ce qui se
calcule et garde le temps reel — le registre, les abonnements, les echeances,
le journal, le telephone.

Un fichier a part pour une raison de plus que les tests : la garde de
tests/python/test_lot16_alertes_traduites.py prend toute chaine « prevenir »
d'un module qui parle au telephone pour un envoi deguise (`getattr`). Le champ
de la configuration porte ce nom (spec 6.1) : il ne s'ecrit qu'ici.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from .entites import motif
from .nombres import fini
from .prises_types import TYPES

CLE = "loggia_prises"
# Un interrupteur, tel que Home Assistant l'ecrit. Lu par `fullmatch` (26/10) :
# le `$` de Python accepte un `\n` final.
INTERRUPTEUR = motif("switch")
# Ce qu'on peut imposer (P2) : les types de l'ecran, sauf la sirene, qui n'est
# jamais une prise (P1).
IMPOSABLES = tuple(t for t in TYPES if t != "siren")


# Un nombre fini, ou None — un booleen n'en est pas un (nombres.py, lot 8).
nombre = fini


def _interrupteur(haid: Any) -> bool:
    return isinstance(haid, str) and INTERRUPTEUR.fullmatch(haid) is not None


# ── La configuration `loggia_prises` (spec 6.1) ────────────────────────────

def config_defaut() -> dict[str, Any]:
    """Rien de protege, rien d'impose, aucune alerte (P6 : coupee par defaut)."""
    return {"protegees": [], "types": {}, "prevenir": {}}


def lire_config(brut: Any) -> dict[str, Any]:
    """`loggia_prises` relue du magasin : ce qui est illisible s'ecarte, le reste
    se range — `protegees` triee sans doublon, les tables par identifiant, et
    `prevenir` ne garde que les alertes allumees."""
    cfg = config_defaut()
    if not isinstance(brut, dict):
        return cfg
    protegees = brut.get("protegees")
    if isinstance(protegees, list):
        cfg["protegees"] = sorted({h for h in protegees if _interrupteur(h)})
    types = brut.get("types")
    if isinstance(types, dict):
        cfg["types"] = {h: types[h] for h in sorted(h for h in types if _interrupteur(h))
                        if types[h] in IMPOSABLES}
    alertes = brut.get("prevenir")
    if isinstance(alertes, dict):
        cfg["prevenir"] = {h: True for h in sorted(h for h in alertes if _interrupteur(h))
                           if alertes[h] is True}
    return cfg


def poser_patch(cfg: dict[str, Any], patch: Any) -> dict[str, Any]:
    """Le patch de l'ecran pose sur `cfg` ; rend la configuration NEUVE, relue.

    `protegees` arrive ENTIERE et remplace la liste : c'est le piege des volets
    (`planning.volets`) — un patch qui ne porterait qu'une prise effacerait les
    autres. `types` et `prevenir` se posent prise par prise : un type None rend
    la prise a la reconnaissance par le nom (« Deviner d'apres le nom »), une
    alerte fausse se coupe. Une cle inconnue s'ignore ; une valeur que l'ecran
    n'envoie pas fait refuser le patch entier (ValueError), sans rien ecrire."""
    if not isinstance(patch, dict):
        raise ValueError("prises : le patch est une table")
    neuf = {"protegees": list(cfg["protegees"]), "types": dict(cfg["types"]),
            "prevenir": dict(cfg["prevenir"])}
    if "protegees" in patch:
        liste = patch["protegees"]
        if not isinstance(liste, list) or not all(_interrupteur(h) for h in liste):
            raise ValueError("prises : protegees est une liste d'interrupteurs")
        neuf["protegees"] = liste
    types = patch.get("types", {})
    if not isinstance(types, dict):
        raise ValueError("prises : types est une table")
    for haid, type_ in types.items():
        if not _interrupteur(haid) or not (type_ is None or type_ in IMPOSABLES):
            raise ValueError("prises : type illisible pour %r" % (haid,))
        if type_ is None:
            neuf["types"].pop(haid, None)
        else:
            neuf["types"][haid] = type_
    alertes = patch.get("prevenir", {})
    if not isinstance(alertes, dict):
        raise ValueError("prises : prevenir est une table")
    for haid, oui in alertes.items():
        if not _interrupteur(haid) or not isinstance(oui, bool):
            raise ValueError("prises : alerte illisible pour %r" % (haid,))
        if oui:
            neuf["prevenir"][haid] = True
        else:
            neuf["prevenir"].pop(haid, None)
    return lire_config(neuf)


# ── Ce que l'etat publie (spec 6.1) ────────────────────────────────────────

def instant_iso(horodatage: Any, fuseau: Any) -> str | None:
    """Un horodatage (secondes depuis 1970) a l'heure de la maison, a la seconde
    et avec son decalage — « 2026-10-13T16:14:00+02:00 » —, comme les instants
    du chauffage et des volets ; None s'il est illisible."""
    t = nombre(horodatage)
    if t is None:
        return None
    try:
        return datetime.fromtimestamp(t, tz=fuseau).replace(microsecond=0).isoformat()
    except (OverflowError, OSError, ValueError):
        return None


def fiche(haid: str, cfg: dict[str, Any], type_: str, suivi: Any, cycles: Any, fuseau: Any,
          suivie: bool = False) -> dict[str, Any]:
    """Une prise dans `loggia/prises/etat` (spec 6.1). `suivi` et `cycles` : ce
    que le serveur sait de son cycle (tache 3) ; None et [] sinon. `suivie` :
    le serveur suit-il VRAIMENT son cycle — un electromenager, avec un capteur
    de puissance a lui seul ? Publie sous `suivi`, toujours un booleen :
    l'ecran ne propose « Prevenir a la fin du cycle » que s'il est vrai."""
    en_cours = isinstance(suivi, dict) and suivi.get("en_cours") is True
    return {
        "type": type_,
        "impose": haid in cfg["types"],
        "protegee": haid in cfg["protegees"],
        "prevenir": cfg["prevenir"].get(haid) is True,
        "cycle": {"debut": instant_iso(suivi.get("debut"), fuseau)} if en_cours else None,
        "cycles": [{"debut": instant_iso(c["debut"], fuseau), "fin": instant_iso(c["fin"], fuseau),
                    "kwh": c["kwh"]} for c in (cycles or [])],
        "suivi": suivie is True,
    }


# ── Le cycle d'un electromenager (P3, spec 5) ──────────────────────────────
# Les seuils sont des constantes, pas des reglages : les changer passe par une
# ADR. « Au-dessus » de DEBUT_W, strictement ; « a ou sous » FIN_W. Le sechage
# d'un lave-vaisselle (14 W) n'est donc pas la fin.
DEBUT_W = 15.0
DEBUT_S = 60
FIN_W = 5.0
FIN_S = 600
# Sans nouvelle de la prise pendant un cycle : il est clos a la derniere
# baisse connue, sinon a la derniere mesure — sans alerte, la fin n'y est que
# supposee (relecture du 13/10).
SILENCE_S = 2 * 3600
# Six heures sans retomber : une veille au-dessus de 5 W, pas un cycle
# (relecture du 13/10). Il est interrompu, sans alerte ni place parmi les
# cycles ; le suivant attend que la puissance retombe a FIN_W ou moins.
DUREE_MAX_S = 6 * 3600
# La memoire : les cycles finis depuis sept jours, trente par prise au plus.
GARDE_S = 7 * 24 * 3600
CYCLES_MAX = 30
# Un capteur publie au changement : la puissance d'avant tient jusqu'a la
# mesure suivante — mais dix minutes au plus. Au-dela, l'integree ne suppose
# plus rien et se dit trouee : 2000 W a 13:40 puis plus rien jusqu'a 15:20
# faisaient 3,33 kWh, le compteur en disait 1,10 (audit du 19/10).
ECART_MAX_S = 600
# Ce que vaut l'unite d'un capteur de puissance, en watts ; et celle d'un
# compteur d'energie, en kWh. Les tables de src/unites.js (`facteurWatts`,
# `facteurKwh`), entree par entree : le serveur lit la courbe comme la carte la
# dessine. Une unite absente ou inconnue (« Watt », un modele) se lit telle
# quelle, facteur 1, comme a l'ecran ; « mw » et « mwh » restent ambigus
# (milli ou mega) et ne se devinent pas.
UNITES_W = {"mW": 0.001, "W": 1.0, "kW": 1000.0, "MW": 1e6, "GW": 1e9, "TW": 1e12, "BTU/h": 0.29307107,
            "VA": 1.0, "kVA": 1000.0}
UNITES_KWH = {"mWh": 1e-6, "Wh": 0.001, "kWh": 1.0, "MWh": 1000.0, "GWh": 1e6, "TWh": 1e9,
              "J": 1 / 3.6e6, "kJ": 1 / 3600, "MJ": 1 / 3.6, "GJ": 1000 / 3.6,
              "cal": 4.184 / 3.6e6, "kcal": 4.184 / 3600, "Mcal": 4.184 / 3.6, "Gcal": 4184 / 3.6}
# Les unites ecrites a la main : « KW », « kwh ».
UNITES_W_BAS = {"w": 1.0, "kw": 1000.0, "va": 1.0, "kva": 1000.0}
UNITES_KWH_BAS = {"wh": 0.001, "kwh": 1.0}


def _facteur(table: dict[str, float], bas: dict[str, float], unite: Any) -> float:
    """`facteur` de src/unites.js : l'unite exacte, puis sa casse basse, sinon 1."""
    u = "" if unite is None else str(unite).strip()
    if not u:
        return 1.0
    if u in table:
        return table[u]
    return bas.get(u.lower(), 1.0)


def watts_par_unite(unite: Any) -> float:
    """Ce qui ramene l'unite d'une puissance au watt (`facteurWatts`)."""
    return _facteur(UNITES_W, UNITES_W_BAS, unite)


def kwh_par_unite(unite: Any) -> float:
    """Ce qui ramene l'unite d'une energie au kWh (`facteurKwh`)."""
    return _facteur(UNITES_KWH, UNITES_KWH_BAS, unite)


def lire_nombre(etat: Any) -> float | None:
    """L'etat d'un capteur en nombre : « 1950.4 » -> 1950.4 ; None quand il ne dit
    rien (« unavailable », « unknown »...)."""
    if isinstance(etat, str):
        try:
            return nombre(float(etat))
        except ValueError:
            return None
    return nombre(etat)


def watts(etat: Any, unite: Any) -> float | None:
    """Une puissance en watts, ou None : un etat muet (« unavailable »...)."""
    valeur = lire_nombre(etat)
    return valeur * watts_par_unite(unite) if valeur is not None else None


def suivi_neuf(dernier: Any = None, w: Any = None) -> dict[str, Any]:
    """Une prise au repos. `haut` : le premier instant au-dessus de DEBUT_W de la
    serie en cours ; `debut` et `bas` (le premier instant a ou sous FIN_W de la
    serie en cours) : pendant un cycle ; `dernier` : la derniere mesure
    lisible, `w` sa puissance — None quand elle ne tient plus (une mesure
    muette, un redemarrage) ; `wh` : l'energie integree depuis `haut`, puis
    depuis `debut` ; `wh_bas` : ce qu'elle valait a `bas` ; `troue` : il
    manque a `wh` une part de l'energie (`_trou`) ; `veille` : apres un cycle
    interrompu, vrai tant que la puissance n'est pas retombee a FIN_W ou moins.
    Tous les instants en secondes depuis 1970."""
    return {"en_cours": False, "haut": None, "debut": None, "bas": None,
            "dernier": dernier, "w": w, "wh": 0.0, "wh_bas": None, "troue": False, "veille": False}


def _trou(s: dict[str, Any]) -> bool:
    """Un trou de mesure manque-t-il a l'energie du cycle ? Seulement pendant un
    cycle ou un debut pressenti, et quand la puissance d'avant n'etait pas
    retombee a FIN_W ou moins : apres la baisse, l'energie du cycle est
    arretee (`wh_bas`), et ce qui manque a 5 W ne compte pas."""
    return (s["en_cours"] or s["haut"] is not None) and (s["w"] is None or s["w"] > FIN_W)


def _integrer(s: dict[str, Any], t: float) -> None:
    """La puissance d'avant a tenu jusqu'a `t` : un capteur ne publie qu'au
    changement. Dix minutes au plus : au-dela, l'integree est trouee."""
    if ((s["en_cours"] or s["haut"] is not None) and s["dernier"] is not None
            and s["w"] is not None and t > s["dernier"]):
        s["wh"] += s["w"] * min(t - s["dernier"], ECART_MAX_S) / 3600.0
        if t - s["dernier"] > ECART_MAX_S and _trou(s):
            s["troue"] = True


def avancer(suivi: dict[str, Any], t: float, w: float) -> dict[str, Any]:
    """Une mesure `w` (W) a l'instant `t` : le suivi NEUF. Ce qui etait du avant
    elle se conclut d'abord (`conclure`)."""
    s = dict(suivi)
    _integrer(s, t)
    if not s["en_cours"]:
        # Apres un cycle interrompu, rien ne recommence avant une retombee a
        # FIN_W ou moins : la veille a 16 W ne refait pas un cycle toutes les
        # six heures.
        if s["veille"] and w <= FIN_W:
            s["veille"] = False
        if w <= DEBUT_W or s["veille"]:
            s["haut"], s["wh"], s["troue"] = None, 0.0, False
        elif s["haut"] is None:
            s["haut"], s["wh"], s["troue"] = t, 0.0, False
    elif w > FIN_W:
        s["bas"], s["wh_bas"] = None, None
    elif s["bas"] is None:
        s["bas"], s["wh_bas"] = t, s["wh"]
    s["dernier"], s["w"] = t, w
    return s


def couper(suivi: dict[str, Any], t: float) -> dict[str, Any]:
    """Une mesure muette (« unavailable », « unknown ») a l'instant `t` : la
    puissance d'avant a tenu jusqu'a elle — dix minutes au plus —, pas au-dela.
    La mesure suivante repart de zero (`w` None), et l'integree est trouee si
    la prise chauffait encore. `dernier` ne bouge pas : le silence se compte
    depuis la derniere mesure LISIBLE."""
    s = dict(suivi)
    _integrer(s, t)
    # Une seconde mesure muette (« unknown » apres « unavailable ») ne juge plus
    # rien : la premiere l'a fait, avec la puissance qui tenait encore.
    if s["w"] is not None and _trou(s):
        s["troue"] = True
    s["w"] = None
    return s


def _silence(suivi: dict[str, Any]) -> float:
    """L'instant ou un cycle sans baisse aura deux heures sans nouvelle."""
    return (suivi["dernier"] if suivi["dernier"] is not None else suivi["debut"]) + SILENCE_S


def echeance(suivi: dict[str, Any]) -> float | None:
    """Quand l'automate aura quelque chose a conclure sans nouvelle mesure : la
    minute du debut, les dix minutes de la fin ; sinon les deux heures de
    silence, ou la sixieme heure du cycle si elle vient avant."""
    if not suivi["en_cours"]:
        return suivi["haut"] + DEBUT_S if suivi["haut"] is not None else None
    if suivi["bas"] is not None:
        return suivi["bas"] + FIN_S
    return min(_silence(suivi), suivi["debut"] + DUREE_MAX_S)


def conclure(suivi: dict[str, Any], maintenant: float) -> tuple[dict[str, Any], dict[str, Any] | None]:
    """Ce qui est du a `maintenant` : (le suivi, l'evenement ou None).

    {"quoi": "debut", "debut"} : une minute au-dessus de 15 W, le cycle commence
    a son premier instant. Puis {"quoi", "cycle": {"debut", "fin", "wh",
    "troue"}}, et sa raison : "fin", dix minutes a 5 W ou moins — la fin est
    l'instant ou la puissance est TOMBEE, pas celui ou l'on conclut ; "silence", deux heures
    sans nouvelle — la derniere mesure ; "interrompu", six heures sans
    retomber — une veille, close a sa sixieme heure, et le suivant attend une
    retombee (`veille`). Seule la fin previent (relecture du 13/10)."""
    quand = echeance(suivi)
    if quand is None or maintenant < quand:
        return suivi, None
    if not suivi["en_cours"]:
        s = dict(suivi, en_cours=True, debut=suivi["haut"], haut=None)
        return s, {"quoi": "debut", "debut": s["debut"]}
    neuf = suivi_neuf(suivi["dernier"], suivi["w"])
    if suivi["bas"] is not None:
        quoi, fin, wh = "fin", suivi["bas"], suivi["wh_bas"]
    elif suivi["debut"] + DUREE_MAX_S <= _silence(suivi):
        quoi, fin, wh = "interrompu", suivi["debut"] + DUREE_MAX_S, suivi["wh"]
        neuf["veille"] = True
    else:
        quoi, wh = "silence", suivi["wh"]
        fin = suivi["dernier"] if suivi["dernier"] is not None else suivi["debut"]
    return neuf, {"quoi": quoi, "cycle": {"debut": suivi["debut"], "fin": fin, "wh": wh,
                                          "troue": suivi["troue"] is True}}


def reprendre(suivi: dict[str, Any], maintenant: float) -> tuple[dict[str, Any], dict[str, Any] | None]:
    """Au redemarrage (spec 5, « la memoire ») : un cycle en cours reprend, et ce
    qui est du se conclut — sans nouvelle depuis plus de deux heures, il est
    clos ; dix minutes basses passees pendant l'arret, il est fini a sa baisse.
    La puissance d'avant ne tient pas a travers l'arret : la mesure suivante
    repart de zero, et l'integree est trouee si la prise chauffait encore.
    Un debut seulement pressenti (`haut`) s'oublie : la prise le redira. Une
    veille attend toujours sa retombee."""
    if not suivi["en_cours"]:
        return dict(suivi_neuf(suivi["dernier"], suivi["w"]), veille=suivi["veille"]), None
    return conclure(dict(suivi, w=None, troue=suivi["troue"] or _trou(suivi)), maintenant)


def bascule(avant: dict[str, Any], apres: dict[str, Any]) -> bool:
    """Le suivi a-t-il change d'etape — un debut pressenti, une baisse, un cycle,
    la retombee d'une veille ? Ces moments-la s'ecrivent tout de suite ; le
    reste, au plus chaque minute."""
    return (avant["en_cours"] != apres["en_cours"] or avant["veille"] != apres["veille"]
            or any((avant[c] is None) != (apres[c] is None) for c in ("haut", "bas")))


def garder(cycles: list[dict[str, Any]], maintenant: float) -> list[dict[str, Any]]:
    """Les cycles finis depuis sept jours au plus, du plus ancien au plus recent,
    CYCLES_MAX au plus — les plus recents."""
    gardes = [c for c in cycles if c["fin"] >= maintenant - GARDE_S]
    return sorted(gardes, key=lambda c: c["debut"])[-CYCLES_MAX:]


def lire_suivi(brut: Any) -> dict[str, Any]:
    """Le suivi relu du disque : ce qui est illisible repart au repos. Un debut
    seulement pressenti (`haut`) s'oublie des la relecture : son echeance,
    perimee, sonnerait avant `reprendre` — un ecran ouvert pendant le demarrage
    relit le registre et arme les echeances — et ferait un faux cycle date
    d'avant l'arret. La prise le redira."""
    s = suivi_neuf()
    if not isinstance(brut, dict):
        return s
    for cle in ("debut", "bas", "dernier", "w", "wh_bas"):
        s[cle] = nombre(brut.get(cle))
    s["wh"] = nombre(brut.get("wh")) or 0.0
    s["en_cours"] = brut.get("en_cours") is True and s["debut"] is not None
    if s["en_cours"]:
        if s["bas"] is not None and s["wh_bas"] is None:
            s["wh_bas"] = s["wh"]
        s["troue"] = brut.get("troue") is True
    else:
        s["debut"] = s["bas"] = s["wh_bas"] = None
        s["wh"] = 0.0
        s["veille"] = brut.get("veille") is True
    return s


def lire_cycles(brut: Any) -> list[dict[str, Any]]:
    """Les cycles relus du disque : {"debut", "fin", "kwh"}, illisibles ecartes."""
    cycles = []
    for c in brut if isinstance(brut, list) else []:
        if not isinstance(c, dict):
            continue
        debut, fin = nombre(c.get("debut")), nombre(c.get("fin"))
        if debut is not None and fin is not None and fin >= debut:
            cycles.append({"debut": debut, "fin": fin, "kwh": nombre(c.get("kwh"))})
    return cycles


def lire_etat(brut: Any, maintenant: float) -> dict[str, dict[str, Any]]:
    """`.storage/loggia_prises_etat` relu : {interrupteur: {"suivi", "cycles"}}."""
    memoire: dict[str, dict[str, Any]] = {}
    if not isinstance(brut, dict):
        return memoire
    for haid, e in brut.items():
        if _interrupteur(haid) and isinstance(e, dict):
            memoire[haid] = {"suivi": lire_suivi(e.get("suivi")),
                             "cycles": garder(lire_cycles(e.get("cycles")), maintenant)}
    return memoire


def heure_de(horodatage: float, fuseau: Any) -> str:
    """« 16:14 », a l'heure de la maison."""
    return datetime.fromtimestamp(horodatage, tz=fuseau).strftime("%H:%M")


def kwh_du_compteur(etats: Any, unite: Any) -> float | None:
    """L'energie d'un cycle d'apres son compteur, en kWh : la somme des hausses
    entre deux lectures — un compteur remis a zero (une prise qui redemarre)
    ne retranche rien. None : moins de deux lectures. L'unite se lit comme a
    l'ecran (`kwh_par_unite`)."""
    lus = [v for v in (lire_nombre(e) for e in (etats or [])) if v is not None]
    if len(lus) < 2:
        return None
    return round(sum(max(0.0, b - a) for a, b in zip(lus, lus[1:])) * kwh_par_unite(unite), 3)


def kwh_du_cycle(compteur: Any, wh: Any, troue: bool = False) -> float | None:
    """L'energie retenue pour un cycle, en kWh : celle du compteur, s'il ne
    s'ecarte pas de plus du simple au double de la puissance integree (`wh`,
    toujours calculee) ; sinon l'integree. Une lecture parasite (120,40 -> 0 ->
    120,95 faisait « 120,95 kWh ») ou un compteur immobile (0,00 kWh) ne passent
    plus (relecture du 13/10).

    Une integree TROUEE (`troue` : une prise muette, un redemarrage, un ecart
    de plus de dix minutes) reste sous l'energie vraie : le compteur l'emporte
    alors, meme a plus du double, sauf s'il dit moins de la moitie de ce qu'on
    a vu passer — un compteur fige. Une integree nulle ne dit rien : le
    compteur aussi. On compare AVANT d'arrondir (audit du 19/10)."""
    lu, integre = nombre(compteur), nombre(wh)
    integre = integre / 1000.0 if integre is not None else None
    if lu is None or integre is None:
        retenu = integre if lu is None else lu
    elif troue or integre <= 0:
        retenu = lu if 2 * lu >= integre else integre
    else:
        retenu = integre if max(lu, integre) > 2 * min(lu, integre) else lu
    return round(retenu, 3) if retenu is not None else None


# ── L'alerte de fin de cycle (P6) ──────────────────────────────────────────

def doit_dire_la_fin(cfg: dict[str, Any], haid: str) -> bool:
    """« Prevenir a la fin du cycle » est-il allume pour cette prise ? Coupe par
    defaut (P6)."""
    return cfg["prevenir"].get(haid) is True


def kwh_ecrit(kwh: float, langue: str) -> str:
    """Les kWh du telephone : deux decimales, et la virgule de toutes les langues
    de Loggia sauf l'anglais — 1.083 -> « 1,08 ». `langue` : celle du texte
    REELLEMENT rendu (`textes.langue_rendue`) — hors des sept, l'anglais."""
    texte = "%.2f" % kwh
    return texte if langue == "en" else texte.replace(".", ",")
