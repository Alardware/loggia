"""Le mode enfant sans Home Assistant : la configuration, les heures, le plafond, le temps d'ecran, la demande (chantier Mode enfant, E5 a E14 ; spec 5, 7.1, 7.2).

Pur : ni Home Assistant, ni horloge, ni disque. `enfant.py` y prend ce qui se
calcule et garde le temps reel - le registre, les abonnements, les echeances,
les services, le journal, le telephone.

Deux garanties que les tests tiennent (spec 8) :
  * `decision_volume` rend une valeur STRICTEMENT plus basse que le volume lu,
    ou rien : la maison ne monte jamais rien ;
  * `poser_patch` refuse un patch qui porte une valeur que l'ecran n'envoie pas
    SANS rien ecrire.

Les instants sont des secondes depuis 1970 (`t`), les dates des `datetime`
au fuseau de la maison (`dt`, `dt_util.now()`) ; un jour s'ecrit « 2026-10-17 ».
"""
from __future__ import annotations

import math
import re
from datetime import datetime, timedelta
from typing import Any

CLE = "loggia_enfant"
MODULE = "enfant"
# Un lecteur, tel que Home Assistant l'ecrit. Lus par `fullmatch` (26/10) : le `$` de Python accepte un `\n` final.
LECTEUR = re.compile(r"^media_player\.[a-z0-9_]+$")
HEURE = re.compile(r"^([01][0-9]|2[0-3]):([0-5][0-9])$")

# Le plafond de volume : de 10 a 100 par pas de 5 a l'ecran ; le serveur accepte tout entier des bornes.
VOLUME_MIN, VOLUME_MAX = 10, 100
# Le budget du jour, en minutes ; 0 = illimite. Une journee au plus.
BUDGET_MAX = 24 * 60
# Au plus un ordre de volume par appareil PHYSIQUE toutes les RAMENE_S secondes (E7) ; le reflet de la
# jumelle - l'officielle qui sonde encore l'ancien volume - s'ignore REFLET_S apres un ramene.
RAMENE_S = 5
REFLET_S = 60
# Rallumee, l'Apple TV s'eteint de nouveau au plus une fois par COUPURE_S (E9) ; la grace de vingt secondes
# avant (GRACE_S) et le preavis de la voix (PREAVIS_S) sont des delais du temps reel : ils vivent dans enfant.py.
COUPURE_S = 60
# L'insistance (E3 C) : INSISTANCE_N fois en INSISTANCE_S, UNE notification, puis le journal seul SILENCE_S.
INSISTANCE_N = 3
INSISTANCE_S = 600
SILENCE_S = 3600
# La demande (E13) : une a la fois, expiree au bout de DEMANDE_S ; accordee, BONUS_MIN de plus.
DEMANDE_S = 1800
BONUS_MIN = 15
# « Lever les limites 30 min » (E14) : les seules valeurs que l'ecran envoie, 30 ou 0.
LEVEES = (0, 30)
# Au coucher (E10) : le premier titre qui joue dans les GARDE_TITRE_S apres une puce est garde jusqu'au matin.
GARDE_TITRE_S = 90
# Ce que l'etat garde : vingt ramenes, vingt rallumages au plus.
RAMENES_MAX = 20
# Les cles du telephone dont l'etat retient la derniere heure.
PREVENTIONS = ("volume", "rallumage", "voix")
PHRASES_DORMIR_DEFAUT = ("joue du bruit blanc", "joue de la musique pour dormir")
PHRASES_MAX = 2
NOM_MAX = 64
PREFIXE_ACTION = "LOGGIA_ENFANT_"


def nombre(x: Any) -> float | None:
    """Un nombre fini, ou None - un booleen n'en est pas un."""
    if isinstance(x, bool) or not isinstance(x, (int, float)):
        return None
    try:
        valeur = float(x)
    except OverflowError:
        return None
    return valeur if math.isfinite(valeur) else None


def entier(x: Any, bas: int, haut: int) -> int | None:
    """Un entier entre `bas` et `haut`, ou None : 2,5 n'est pas un volume."""
    if isinstance(x, bool) or not isinstance(x, int):
        return None
    return x if bas <= x <= haut else None


def valide(haid: Any) -> bool:
    return isinstance(haid, str) and LECTEUR.fullmatch(haid) is not None


def minutes(hhmm: Any) -> int | None:
    """« 07:30 » -> 450 ; None si ce n'est pas une heure ecrite ainsi."""
    m = HEURE.fullmatch(hhmm) if isinstance(hhmm, str) else None
    return int(m.group(1)) * 60 + int(m.group(2)) if m else None


def _plage(brut: Any) -> list[str] | None:
    """Deux heures lisibles, ou None."""
    if isinstance(brut, (list, tuple)) and len(brut) == 2 and all(minutes(h) is not None for h in brut):
        return [str(brut[0]), str(brut[1])]
    return None


def _lecteurs(brut: Any) -> list[str] | None:
    """Une liste de lecteurs, sans doublon, dans l'ordre ; None si ce n'en est pas une."""
    if not isinstance(brut, list):
        return None
    vus: list[str] = []
    for h in brut:
        if valide(h) and h not in vus:
            vus.append(h)
    return vus


# ── La configuration `loggia_enfant` (spec 7.1) ─────────────────────────────

def config_defaut() -> dict[str, Any]:
    """Aucun profil, et la maison agit (« Observer sans agir » coupe)."""
    return {"profils": {}, "simulation": {"actif": False}}


def profil_defaut(nom: str, zone: str) -> dict[str, Any]:
    """Le profil de la maquette : 40 %, 20 % au coucher, 1 h 30, 07:30 - 20:30 (08:30 - 21:00 le week-end),
    les sons pour dormir et la voix."""
    return {"nom": nom, "zone": zone, "actif": True, "ajouts": [], "ecrans": None,
            "volume_max": 40, "coucher_max": 20, "budget": {"semaine": 90, "weekend": 90},
            "heures": {"semaine": ["07:30", "20:30"], "weekend": ["08:30", "21:00"]},
            "dormir": True, "voix": True, "phrases_dormir": list(PHRASES_DORMIR_DEFAUT)}


def lire_profil(ident: str, brut: Any) -> dict[str, Any] | None:
    """Un profil relu : ce qui est illisible reprend son defaut ; sans zone, rien."""
    if not isinstance(brut, dict) or not isinstance(brut.get("zone"), str) or not brut["zone"]:
        return None
    nom = brut.get("nom")
    p = profil_defaut(nom if isinstance(nom, str) and 0 < len(nom) <= NOM_MAX else ident, brut["zone"])
    for drapeau in ("actif", "dormir", "voix"):
        p[drapeau] = brut.get(drapeau) is True
    ajouts = _lecteurs(brut.get("ajouts"))
    if ajouts is not None:
        p["ajouts"] = ajouts
    ecrans = brut.get("ecrans")
    p["ecrans"] = _lecteurs(ecrans) if ecrans is not None else None
    v = entier(brut.get("volume_max"), VOLUME_MIN, VOLUME_MAX)
    if v is not None:
        p["volume_max"] = v
    c = entier(brut.get("coucher_max"), 0, VOLUME_MAX)
    if c is not None:
        p["coucher_max"] = c
    budget = brut.get("budget") if isinstance(brut.get("budget"), dict) else {}
    for jour in ("semaine", "weekend"):
        b = entier(budget.get(jour), 0, BUDGET_MAX)
        if b is not None:
            p["budget"][jour] = b
    heures = brut.get("heures") if isinstance(brut.get("heures"), dict) else {}
    for jour in ("semaine", "weekend"):
        plage = _plage(heures.get(jour))
        if plage is not None:
            p["heures"][jour] = plage
    phrases = brut.get("phrases_dormir")
    if isinstance(phrases, list):
        p["phrases_dormir"] = [s for s in phrases if isinstance(s, str) and s.strip()][:PHRASES_MAX]
    return p


def lire_config(brut: Any) -> dict[str, Any]:
    """`loggia_enfant` relue du magasin : ce qui est illisible s'ecarte, le reste se range."""
    cfg = config_defaut()
    if not isinstance(brut, dict):
        return cfg
    profils = brut.get("profils")
    if isinstance(profils, dict):
        for ident, p in profils.items():
            if not isinstance(ident, str) or not ident:
                continue
            lu = lire_profil(ident, p)
            if lu is not None:
                cfg["profils"][ident] = lu
    simulation = brut.get("simulation")
    cfg["simulation"]["actif"] = isinstance(simulation, dict) and simulation.get("actif") is True
    return cfg


def _refus(quoi: str) -> ValueError:
    return ValueError("mode enfant : " + quoi)


def _poser_profil(ident: str, courant: dict[str, Any] | None, patch: dict[str, Any]) -> dict[str, Any]:
    """Le patch d'un profil, champ par champ ; une valeur que l'ecran n'envoie pas fait tout refuser."""
    nom = patch.get("nom", None if courant is None else courant["nom"])
    if nom is None:
        nom = ident
    if not isinstance(nom, str) or not nom.strip() or len(nom) > NOM_MAX:
        raise _refus("nom illisible pour %r" % (ident,))
    p = dict(courant) if courant is not None else profil_defaut(nom, ident)
    p["nom"] = nom
    p["budget"], p["heures"] = dict(p["budget"]), dict(p["heures"])
    if "zone" in patch and patch["zone"] != ident:
        raise _refus("la zone d'un profil est sa cle : %r" % (ident,))
    for drapeau in ("actif", "dormir", "voix"):
        if drapeau in patch:
            if not isinstance(patch[drapeau], bool):
                raise _refus("%s : vrai ou faux" % drapeau)
            p[drapeau] = patch[drapeau]
    if "ajouts" in patch:
        liste = _lecteurs(patch["ajouts"])
        if liste is None or len(liste) != len(patch["ajouts"]) or not all(valide(h) for h in patch["ajouts"]):
            raise _refus("ajouts : une liste de lecteurs")
        p["ajouts"] = liste
    if "ecrans" in patch:
        if patch["ecrans"] is None:
            p["ecrans"] = None
        else:
            liste = _lecteurs(patch["ecrans"])
            if liste is None or not all(valide(h) for h in patch["ecrans"]):
                raise _refus("ecrans : une liste de lecteurs, ou rien")
            p["ecrans"] = liste
    if "volume_max" in patch:
        v = entier(patch["volume_max"], VOLUME_MIN, VOLUME_MAX)
        if v is None:
            raise _refus("volume_max : un entier de %d a %d" % (VOLUME_MIN, VOLUME_MAX))
        p["volume_max"] = v
    if "coucher_max" in patch:
        c = entier(patch["coucher_max"], 0, VOLUME_MAX)
        if c is None:
            raise _refus("coucher_max : un entier de 0 a %d" % VOLUME_MAX)
        p["coucher_max"] = c
    if "budget" in patch:
        if not isinstance(patch["budget"], dict) or not set(patch["budget"]) <= {"semaine", "weekend"}:
            raise _refus("budget : semaine et week-end, en minutes")
        for jour, b in patch["budget"].items():
            if entier(b, 0, BUDGET_MAX) is None:
                raise _refus("budget : un entier de 0 a %d minutes" % BUDGET_MAX)
            p["budget"][jour] = b
    if "heures" in patch:
        if not isinstance(patch["heures"], dict) or not set(patch["heures"]) <= {"semaine", "weekend"}:
            raise _refus("heures : semaine et week-end")
        for jour, plage in patch["heures"].items():
            if _plage(plage) is None:
                raise _refus("heures : deux heures « HH:MM »")
            p["heures"][jour] = _plage(plage)
    if "phrases_dormir" in patch:
        phrases = patch["phrases_dormir"]
        if (not isinstance(phrases, list) or not phrases or len(phrases) > PHRASES_MAX
                or not all(isinstance(s, str) and s.strip() and len(s) <= 120 for s in phrases)):
            raise _refus("phrases_dormir : une ou deux phrases")
        p["phrases_dormir"] = list(phrases)
    return p


def poser_patch(cfg: dict[str, Any], patch: Any) -> dict[str, Any]:
    """Le patch de l'ecran pose sur `cfg` ; rend la configuration NEUVE, relue.

    `profils` se pose profil par profil : une table remplace ou cree le profil
    de la cle (sa zone), `None` le retire. Les listes (`ajouts`, `ecrans`)
    arrivent ENTIERES et remplacent - le piege des volets. Une cle inconnue
    s'ignore ; une valeur que l'ecran n'envoie pas fait refuser le patch
    entier (ValueError), sans rien ecrire."""
    if not isinstance(patch, dict):
        raise _refus("le patch est une table")
    neuf = {"profils": dict(cfg["profils"]), "simulation": dict(cfg["simulation"])}
    if "profils" in patch:
        if not isinstance(patch["profils"], dict):
            raise _refus("profils est une table")
        for ident, p in patch["profils"].items():
            if not isinstance(ident, str) or not ident:
                raise _refus("un profil se nomme par sa zone")
            if p is None:
                neuf["profils"].pop(ident, None)
                continue
            if not isinstance(p, dict):
                raise _refus("un profil est une table")
            neuf["profils"][ident] = _poser_profil(ident, cfg["profils"].get(ident), p)
    if "simulation" in patch:
        if not isinstance(patch["simulation"], dict) or not isinstance(patch["simulation"].get("actif"), bool):
            raise _refus("simulation : {actif: vrai ou faux}")
        neuf["simulation"] = {"actif": patch["simulation"]["actif"]}
    return lire_config(neuf)


# ── Les heures (spec 5.4) ───────────────────────────────────────────────────

def jour_de(dt: datetime) -> str:
    """« 2026-10-17 » : le jour de la maison."""
    return dt.date().isoformat()


def heure_hhmm(dt: datetime) -> str:
    return dt.strftime("%H:%M")


def est_weekend(dt: datetime) -> bool:
    return dt.weekday() >= 5


def _type_jour(dt: datetime) -> str:
    return "weekend" if est_weekend(dt) else "semaine"


def heures_du_jour(profil: dict[str, Any], dt: datetime) -> tuple[int, int]:
    """(debut, fin) des heures autorisees du jour de `dt`, en minutes."""
    debut, fin = profil["heures"][_type_jour(dt)]
    return minutes(debut), minutes(fin)


def dans_les_heures(profil: dict[str, Any], dt: datetime) -> bool:
    """Est-on dans les heures du jour ? Minuit franchi compris (la regle `dans_la_plage` de regles.py) ;
    des heures egales valent « toujours » : un reglage absurde ne coupe rien."""
    debut, fin = heures_du_jour(profil, dt)
    t = dt.hour * 60 + dt.minute
    if debut == fin:
        return True
    if debut < fin:
        return debut <= t < fin
    return t >= debut or t < fin


def reprise(profil: dict[str, Any], dt: datetime) -> datetime:
    """Quand les ecrans reviennent : le debut des heures d'aujourd'hui si l'on est encore avant, sinon celui
    du jour SUIVANT - qui a les siennes (le week-end)."""
    debut, _ = heures_du_jour(profil, dt)
    base = dt.replace(hour=0, minute=0, second=0, microsecond=0)
    if dt.hour * 60 + dt.minute < debut:
        return base + timedelta(minutes=debut)
    demain = base + timedelta(days=1)
    debut_demain, _ = heures_du_jour(profil, demain)
    return demain + timedelta(minutes=debut_demain)


def _secondes_au_coucher(profil: dict[str, Any], dt: datetime) -> int | None:
    """Les secondes jusqu'a la fin des heures du jour ; None si elles ne finissent pas."""
    debut, fin = heures_du_jour(profil, dt)
    if debut == fin:
        return None
    t = dt.hour * 60 + dt.minute
    ecart = fin - t if (debut < fin or t < fin) else fin + 24 * 60 - t
    return max(0, ecart * 60 - dt.second)


def plafond(profil: dict[str, Any], dt: datetime) -> int:
    """Le volume au-dela duquel la maison ramene : le plafond, baisse au coucher (E7)."""
    if dans_les_heures(profil, dt):
        return profil["volume_max"]
    return min(profil["volume_max"], profil["coucher_max"])


def budget_min(profil: dict[str, Any], dt: datetime) -> int:
    return profil["budget"][_type_jour(dt)]


# ── L'etat `.storage/loggia_enfant_etat` (spec 7.2) ────────────────────────

def etat_defaut(jour: str) -> dict[str, Any]:
    return {"jour": jour, "ecran_s": {}, "bonus_min": 0, "leve_jusqua": None, "demande": None,
            "refus_jour": None, "ramenes": [], "rallumages": [], "preventions": {}, "dormir": None, "coupures": {}}


def nouveau_jour(etat: dict[str, Any], jour: str) -> dict[str, Any]:
    """Minuit : les compteurs du jour repartent, le refus d'hier ne tient plus, la demande d'hier non plus."""
    return dict(etat, jour=jour, ecran_s={}, bonus_min=0, refus_jour=None, demande=None)


def _demande_lue(brut: Any) -> dict[str, Any] | None:
    if not isinstance(brut, dict) or not valide(brut.get("appareil")) or nombre(brut.get("quand")) is None:
        return None
    jeton = brut.get("jeton")
    reponse = brut.get("reponse")
    if not isinstance(jeton, str) or not jeton or reponse not in (None, "accordee", "refusee"):
        return None
    return {"appareil": brut["appareil"], "quand": float(brut["quand"]), "jeton": jeton, "reponse": reponse}


def _etat_lu(brut: dict[str, Any], t: float, jour: str) -> dict[str, Any]:
    e = etat_defaut(jour)
    if isinstance(brut.get("ecran_s"), dict):
        e["ecran_s"] = {h: int(nombre(s)) for h, s in brut["ecran_s"].items() if valide(h) and nombre(s) is not None and nombre(s) >= 0}
    b = entier(brut.get("bonus_min"), 0, BUDGET_MAX)
    e["bonus_min"] = b if b is not None else 0
    fin = nombre(brut.get("leve_jusqua"))
    e["leve_jusqua"] = fin if fin is not None and fin > t else None
    e["demande"] = _demande_lue(brut.get("demande"))
    e["refus_jour"] = brut.get("refus_jour") if isinstance(brut.get("refus_jour"), str) else None
    if isinstance(brut.get("ramenes"), list):
        e["ramenes"] = [[float(r[0]), r[1], r[2], int(r[3]), int(r[4])] for r in brut["ramenes"]
                        if isinstance(r, list) and len(r) == 5 and nombre(r[0]) is not None
                        and isinstance(r[1], str) and isinstance(r[2], str) and nombre(r[3]) is not None and nombre(r[4]) is not None][-RAMENES_MAX:]
    if isinstance(brut.get("rallumages"), list):
        e["rallumages"] = [float(x) for x in brut["rallumages"] if nombre(x) is not None][-RAMENES_MAX:]
    if isinstance(brut.get("preventions"), dict):
        e["preventions"] = {k: float(v) for k, v in brut["preventions"].items() if k in PREVENTIONS and nombre(v) is not None}
    d = brut.get("dormir")
    if isinstance(d, dict) and nombre(d.get("depuis")) is not None:
        e["dormir"] = {"depuis": float(d["depuis"]), "titres": [x for x in d.get("titres", []) if isinstance(x, str)] if isinstance(d.get("titres"), list) else []}
    if isinstance(brut.get("coupures"), dict):
        e["coupures"] = {h: float(v) for h, v in brut["coupures"].items() if valide(h) and nombre(v) is not None}
    jour_lu = brut.get("jour")
    if jour_lu != jour:
        e = nouveau_jour(e, jour)
    return purger_demande(e, t)


def normaliser(brut: Any, t: float, jour: str) -> dict[str, dict[str, Any]]:
    """L'etat relu du disque : {profil: etat}, ce qui est illisible repart a vide ; un jour d'avant repart
    a zero, une levee passee s'efface, une demande expiree se purge."""
    etats: dict[str, dict[str, Any]] = {}
    if not isinstance(brut, dict):
        return etats
    for ident, e in brut.items():
        if isinstance(ident, str) and ident and isinstance(e, dict):
            etats[ident] = _etat_lu(e, t, jour)
    return etats


# ── Les limites levees (E14) ───────────────────────────────────────────────

def leve(etat: dict[str, Any], t: float) -> bool:
    fin = etat.get("leve_jusqua")
    return fin is not None and fin > t


def lever(etat: dict[str, Any], minutes_levee: Any, t: float) -> dict[str, Any]:
    """`enfant/lever {minutes}` : 30 pose `leve_jusqua`, 0 retablit."""
    if isinstance(minutes_levee, bool) or minutes_levee not in LEVEES:
        raise _refus("minutes : %s" % " ou ".join(str(m) for m in LEVEES))
    return dict(etat, leve_jusqua=(t + minutes_levee * 60) if minutes_levee else None)


def actif(profil: dict[str, Any], etat: dict[str, Any], t: float) -> bool:
    """Le profil agit : allume, et les limites ne sont pas levees."""
    return bool(profil["actif"]) and not leve(etat, t)


# ── Le plafond qui ramene (E7) ──────────────────────────────────────────────

def decision_volume(profil: dict[str, Any], etat: dict[str, Any], dt: datetime, t: float,
                    entite: str, appareil: str, volume_lu: Any) -> dict[str, Any] | None:
    """Un volume publie : rien, ou `{entite, volume, lu}` avec `volume` STRICTEMENT plus bas que `lu`.

    Rien si le profil n'agit pas, si le volume ne se lit pas, s'il est a ou sous le plafond, si le meme
    appareil PHYSIQUE a ete ramene il y a moins de RAMENE_S, ou si c'est le reflet de la jumelle - la meme
    valeur, ou une plus basse, que celle ramenee il y a moins de REFLET_S."""
    if not actif(profil, etat, t):
        return None
    lu = nombre(volume_lu)
    if lu is None:
        return None
    lu = int(round(lu))
    cible = plafond(profil, dt)
    if lu <= cible:
        return None
    for quand, _ent, app, ancien, _cible in etat["ramenes"]:
        if app != appareil:
            continue
        if t - quand < RAMENE_S:
            return None
        if t - quand < REFLET_S and lu <= ancien:
            return None
    return {"entite": entite, "volume": cible, "lu": lu}


def noter_ramene(etat: dict[str, Any], t: float, entite: str, appareil: str, lu: int, cible: int) -> dict[str, Any]:
    return dict(etat, ramenes=(etat["ramenes"] + [[t, entite, appareil, lu, cible]])[-RAMENES_MAX:])


# ── L'insistance (E3 C) ────────────────────────────────────────────────────

def insistance(instants: list, t: float) -> int:
    """Combien d'instants dans les INSISTANCE_S dernieres secondes."""
    return sum(1 for x in instants if 0 <= t - x < INSISTANCE_S)


def doit_prevenir(etat: dict[str, Any], cle: str, instants: list, t: float) -> bool:
    """INSISTANCE_N fois en INSISTANCE_S, et la derniere notification de cette cle a plus de SILENCE_S."""
    if insistance(instants, t) < INSISTANCE_N:
        return False
    derniere = etat["preventions"].get(cle)
    return derniere is None or t - derniere >= SILENCE_S


def noter_prevention(etat: dict[str, Any], cle: str, t: float) -> dict[str, Any]:
    return dict(etat, preventions=dict(etat["preventions"], **{cle: t}))


# ── Le temps d'ecran (E8), la coupure (E9) ─────────────────────────────────

def avancer_ecran(etat: dict[str, Any], entite: str, secondes: float, jour: str) -> dict[str, Any]:
    """Le temps allume depuis la derniere mesure ; un jour nouveau repart a zero d'abord."""
    e = nouveau_jour(etat, jour) if etat["jour"] != jour else dict(etat)
    e["ecran_s"] = dict(e["ecran_s"])
    e["ecran_s"][entite] = e["ecran_s"].get(entite, 0) + int(max(0, secondes))
    return e


def utilise_s(etat: dict[str, Any], entite: str) -> int:
    return int(etat["ecran_s"].get(entite, 0))


def reste_s(profil: dict[str, Any], etat: dict[str, Any], entite: str, dt: datetime) -> int | None:
    """Ce qui reste du jour, en secondes ; None sans budget (illimite)."""
    budget = budget_min(profil, dt)
    if not budget:
        return None
    return max(0, (budget + etat["bonus_min"]) * 60 - utilise_s(etat, entite))


def bloque(profil: dict[str, Any], etat: dict[str, Any], entite: str, est_ecran: bool, dt: datetime, t: float) -> str | None:
    """None, « coucher » (hors des heures) ou « temps » (le budget du jour est use, sur un ecran)."""
    if not actif(profil, etat, t):
        return None
    if not dans_les_heures(profil, dt):
        return "coucher"
    if est_ecran and reste_s(profil, etat, entite, dt) == 0:
        return "temps"
    return None


def echeance_s(profil: dict[str, Any], etat: dict[str, Any], entite: str, est_ecran: bool, dt: datetime, t: float) -> int | None:
    """Dans combien de secondes ce lecteur sera bloque - le budget ou le coucher, le premier des deux ;
    None s'il l'est deja, si rien ne le bloquera, ou si le profil n'agit pas."""
    if not actif(profil, etat, t) or bloque(profil, etat, entite, est_ecran, dt, t) is not None:
        return None
    coucher = _secondes_au_coucher(profil, dt)
    reste = reste_s(profil, etat, entite, dt) if est_ecran else None
    candidats = [x for x in (coucher, reste) if x is not None]
    return min(candidats) if candidats else None


def coupure_due(profil: dict[str, Any], etat: dict[str, Any], entite: str, est_ecran: bool, allume: bool,
                dt: datetime, t: float) -> bool:
    """Un ecran allume alors qu'il est bloque : a eteindre."""
    return bool(est_ecran and allume and bloque(profil, etat, entite, True, dt, t) is not None)


def peut_couper(etat: dict[str, Any], entite: str, t: float) -> bool:
    """Au plus un `turn_off` par COUPURE_S sur une entite."""
    derniere = etat["coupures"].get(entite)
    return derniere is None or t - derniere >= COUPURE_S


def noter_coupure(etat: dict[str, Any], entite: str, t: float, rallumage: bool) -> dict[str, Any]:
    e = dict(etat, coupures=dict(etat["coupures"], **{entite: t}))
    if rallumage:
        e["rallumages"] = (etat["rallumages"] + [t])[-RAMENES_MAX:]
    return e


# ── La demande et la reponse (E13) ─────────────────────────────────────────

def demande_en_cours(etat: dict[str, Any], t: float) -> dict[str, Any] | None:
    """La demande qui attend une reponse, si elle n'a pas expire."""
    d = etat.get("demande")
    if d and d["reponse"] is None and t - d["quand"] < DEMANDE_S:
        return d
    return None


def purger_demande(etat: dict[str, Any], t: float) -> dict[str, Any]:
    """Une demande sans reponse depuis DEMANDE_S s'oublie (« Demande expiree »)."""
    d = etat.get("demande")
    if d and d["reponse"] is None and t - d["quand"] >= DEMANDE_S:
        return dict(etat, demande=None)
    return etat


def demander(etat: dict[str, Any], appareil: str, t: float, jeton: str) -> dict[str, Any]:
    """Une demande de BONUS_MIN de plus : une a la fois, et plus aucune apres un refus du jour."""
    if demande_en_cours(etat, t) is not None:
        raise _refus("une demande attend deja sa reponse")
    if etat.get("refus_jour") is not None and etat["refus_jour"] == etat["jour"]:
        raise _refus("refusee aujourd'hui : demain")
    return dict(etat, demande={"appareil": appareil, "quand": t, "jeton": jeton, "reponse": None})


def repondre(etat: dict[str, Any], accorder: bool, t: float, jour: str) -> dict[str, Any]:
    """La reponse du parent a la demande en cours : accordee, BONUS_MIN de plus ; refusee, plus de demande du jour."""
    d = demande_en_cours(etat, t)
    if d is None:
        raise _refus("aucune demande en attente")
    e = dict(etat, demande=dict(d, reponse="accordee" if accorder else "refusee"))
    if accorder:
        e["bonus_min"] = etat["bonus_min"] + BONUS_MIN
    else:
        e["refus_jour"] = jour
    return e


def action_telephone(jeton: str, accorder: bool) -> str:
    """L'identifiant d'un bouton de la notification : le jeton a usage unique, et la reponse."""
    return PREFIXE_ACTION + jeton + ("_OUI" if accorder else "_NON")


def lire_action(action: Any) -> tuple[str, bool] | None:
    """(jeton, accorder) d'un `mobile_app_notification_action`, ou None s'il ne nous concerne pas."""
    if not isinstance(action, str) or not action.startswith(PREFIXE_ACTION):
        return None
    reste = action[len(PREFIXE_ACTION):]
    for suffixe, accorder in (("_OUI", True), ("_NON", False)):
        if reste.endswith(suffixe) and len(reste) > len(suffixe):
            return reste[:-len(suffixe)], accorder
    return None


def repondre_au_jeton(etat: dict[str, Any], jeton: str, accorder: bool, t: float, jour: str) -> dict[str, Any] | None:
    """La reponse venue du telephone : seulement si le jeton est celui de la demande en cours."""
    d = demande_en_cours(etat, t)
    if d is None or d["jeton"] != jeton:
        return None
    return repondre(etat, accorder, t, jour)


# ── Les sons pour dormir (E10) ─────────────────────────────────────────────

def commencer_dormir(etat: dict[str, Any], t: float) -> dict[str, Any]:
    """Une puce « son pour dormir » : le prochain titre qui joue sera garde."""
    return dict(etat, dormir={"depuis": t, "titres": []})


def titre_a_garder(etat: dict[str, Any], titre: Any, t: float) -> bool:
    d = etat.get("dormir")
    return bool(d and not d["titres"] and isinstance(titre, str) and titre and 0 <= t - d["depuis"] < GARDE_TITRE_S)


def garder_titre(etat: dict[str, Any], titre: str, t: float) -> dict[str, Any]:
    d = etat["dormir"] or {"depuis": t, "titres": []}
    return dict(etat, dormir={"depuis": d["depuis"], "titres": d["titres"] + [titre]})


def titre_garde(etat: dict[str, Any], titre: Any) -> bool:
    d = etat.get("dormir")
    return bool(d and titre in d["titres"])


# ── Ce que l'ecran lit (spec 7.4) ───────────────────────────────────────────

def vue_lecteur(ident: str, profil: dict[str, Any], etat: dict[str, Any], entite: str, est_ecran: bool,
                dt: datetime, t: float) -> dict[str, Any]:
    """Un lecteur dans `loggia/enfant/etat` : jamais le jeton."""
    agit = actif(profil, etat, t)
    d = etat.get("demande")
    return {
        "profil": ident, "nom": profil["nom"], "actif": profil["actif"],
        "leve_jusqua": etat["leve_jusqua"] if leve(etat, t) else None,
        "plafond": plafond(profil, dt) if agit else None,
        "bloque": bloque(profil, etat, entite, est_ecran, dt, t),
        "reprise": heure_hhmm(reprise(profil, dt)),
        "ecran": {"budget_min": budget_min(profil, dt), "utilise_s": utilise_s(etat, entite), "bonus_min": etat["bonus_min"],
                  "reste_s": reste_s(profil, etat, entite, dt)} if est_ecran else None,
        "dormir": etat.get("dormir"),
        "demande": {"appareil": d["appareil"], "quand": d["quand"], "reponse": d["reponse"]} if d else None,
    }
