"""Le carnet de l'eau sans Home Assistant (chantier IoT, etape 3 ; I28, I30, ADR 0217).

Pur : ni Home Assistant, ni horloge, ni disque. `eau.py` y prend ce qui se
calcule et garde le temps reel - les abonnements, le disque.

Le carnet :
  * `vannes` : {entity_id: fiche}, la fiche d'une vanne d'eau - `vu` (son
    dernier sens vu, « ouverte » ou « fermee »), `cause` (qui l'a fermee, tant
    qu'elle reste fermee) et `depuis` (l'instant ou elle a change de sens) ;
  * `detecteurs` : {entity_id: fiche}, celle d'un detecteur de fuite - `vu`
    (« on » : de l'eau), `mouille_depuis`, `sec_depuis` ;
  * `journal` : les lignes du jour, dans l'ordre du temps.

Une cause : {"cause", "detecteur", "nom", "user_id"} - « fuite » (la regle
d'alertes.py l'a annoncee AVANT d'agir : le detecteur et son nom), «
automatisme » (une automatisation ou un script : son nom), « personne » (un
compte : l'ecran le nomme par la regle commune aux prises et aux lumieres), «
appareil » (aucun contexte : la vanne elle-meme, son bouton, son application).
Le carnet NOTE des faits ; il ne commande rien.
"""
from __future__ import annotations

import copy
from datetime import datetime
from typing import Any

from .nombres import fini

# Une fermeture annoncee par la regle de fuite vaut deux minutes : une vanne
# motorisee tourne en 5 a 20 s, une integration en nuage repond parfois en dix.
ANNONCE_S = 120
# Cent lignes par jour au plus : une journee ordinaire en fait trois ou quatre ;
# un detecteur qui bat au bord du seuil en ferait des centaines.
JOURNAL_MAX = 100
# Un `moisture` qu'un modele ou un groupe CALCULE n'est pas un detecteur (ADR
# 0022, la regle d'alertes.py).
PLATEFORMES_CALCULEES = ("template", "group")
QUOI = ("fuite", "sec", "fermee", "rouverte")
CAUSES = ("fuite", "automatisme", "personne", "appareil")
SENS = ("ouverte", "fermee")


# Un nombre fini, ou None (nombres.py, lot 8).
_nombre = fini


def _texte(x: Any) -> str | None:
    return x if isinstance(x, str) and x else None


def _table(x: Any) -> dict[str, Any]:
    return x if isinstance(x, dict) else {}


# ── Quelle vanne, quel detecteur ───────────────────────────────────────────
def est_vanne_eau(attributs: Any) -> bool:
    """Une `valve` de classe `water`."""
    return _table(attributs).get("device_class") == "water"


def vannes_de_la_maison(etats: dict[str, Any], designee: Any) -> list[str]:
    """Les vannes d'eau de la maison : celle qu'on a designee dans Parametres >
    Alertes (une prise commandee sur l'arrivee comprise), sinon TOUTES les
    `valve` de classe `water` (I30) - fermer est le sens sur. `etats` :
    {entity_id: attributs}."""
    if isinstance(designee, str) and designee:
        return [designee]
    return sorted(h for h, attrs in (etats or {}).items()
                  if isinstance(h, str) and h.startswith("valve.") and est_vanne_eau(attrs))


def sens_vanne(haid: Any, etat: Any) -> str | None:
    """« ouverte », « fermee », ou None (muette, ou un etat qui ne dit rien).
    Une prise designee : eteinte = eau coupee (alertes.py la coupe par
    `turn_off`)."""
    dom = str(haid).split(".")[0]
    if dom == "valve":
        return "fermee" if etat in ("closed", "closing") else "ouverte" if etat in ("open", "opening") else None
    if dom == "switch":
        return "fermee" if etat == "off" else "ouverte" if etat == "on" else None
    return None


def est_plante(haid: str, bases: Any) -> bool:
    """Le besoin d'eau d'une plante (la regle d'`alertes._est_plante`) : son
    identifiant commence par la base d'une plante, suivie de rien ou d'un « _ »."""
    for base in bases or ():
        if isinstance(base, str) and base and haid.startswith(base) and (
                len(haid) == len(base) or haid[len(base)] == "_"):
            return True
    return False


def est_detecteur(haid: Any, attributs: Any, plateforme: Any, bases_plantes: Any = ()) -> bool:
    """Un detecteur de fuite : un `binary_sensor` de classe `moisture` que ni un
    modele ni un groupe ne calcule, et qui n'est pas le besoin d'eau d'une
    plante. Une entite que le registre ne connait pas reste un detecteur."""
    if not isinstance(haid, str) or not haid.startswith("binary_sensor."):
        return False
    if _table(attributs).get("device_class") != "moisture":
        return False
    return plateforme not in PLATEFORMES_CALCULEES and not est_plante(haid, bases_plantes)


# ── Qui a ferme ────────────────────────────────────────────────────────────
def cause(user_id: Any, lien: Any, annonce: Any, quand: float) -> dict[str, Any]:
    """La cause d'un changement de la vanne, la premiere qui s'applique : la
    fuite que la regle a ANNONCEE moins de deux minutes plus tot, une
    automatisation ou un script (`lien` : (type, nom)), une personne, l'appareil."""
    a = _table(annonce)
    t = _nombre(a.get("quand"))
    if t is not None and 0 <= quand - t <= ANNONCE_S:
        return {"cause": "fuite", "detecteur": _texte(a.get("detecteur")), "nom": _texte(a.get("nom")), "user_id": None}
    if isinstance(lien, tuple) and len(lien) == 2 and _texte(lien[0]):
        return {"cause": "automatisme", "detecteur": None, "nom": _texte(lien[1]), "user_id": None}
    if _texte(user_id):
        return {"cause": "personne", "detecteur": None, "nom": None, "user_id": user_id}
    return {"cause": "appareil", "detecteur": None, "nom": None, "user_id": None}


def _ligne(quand: float, quoi: str, haid: str, par: Any = None) -> dict[str, Any]:
    p = _table(par)
    return {"when": quand, "quoi": quoi, "entity_id": haid, "cause": _texte(p.get("cause")),
            "detecteur": _texte(p.get("detecteur")), "nom": _texte(p.get("nom")), "user_id": _texte(p.get("user_id"))}


# ── La vanne ───────────────────────────────────────────────────────────────
def fiche_vanne_neuve() -> dict[str, Any]:
    return {"vu": None, "cause": None, "depuis": None}


def noter_vanne(fiche: dict[str, Any], haid: str, etat: Any, quand: float, par: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any] | None]:
    """(fiche d'apres, ligne du journal ou None). La fermeture retient SA cause
    tant que la vanne reste fermee ; la rouverture l'efface. Le premier sens
    vu ne dit pas d'ou il vient : il se retient, sans ligne. Muette : rien."""
    sens = sens_vanne(haid, etat)
    if sens is None or fiche.get("vu") == sens:
        return fiche, None
    if fiche.get("vu") is None:
        return {"vu": sens, "cause": None, "depuis": None}, None
    if sens == "fermee":
        return {"vu": "fermee", "cause": dict(par), "depuis": quand}, _ligne(quand, "fermee", haid, par)
    return {"vu": "ouverte", "cause": None, "depuis": quand}, _ligne(quand, "rouverte", haid, par)


# ── Les detecteurs ─────────────────────────────────────────────────────────
def fiche_detecteur_neuve() -> dict[str, Any]:
    return {"vu": None, "mouille_depuis": None, "sec_depuis": None}


def noter_detecteur(fiche: dict[str, Any], haid: str, etat: Any, quand: float) -> tuple[dict[str, Any], dict[str, Any] | None]:
    """(fiche d'apres, ligne ou None). « on » : de l'eau ; un silence n'est pas
    un detecteur sec. Deja mouille au premier etat vu : depuis cet instant,
    sans ligne - on ne l'a pas vu arriver."""
    if etat not in ("on", "off") or fiche.get("vu") == etat:
        return fiche, None
    premier = fiche.get("vu") is None
    if etat == "on":
        suite = {"vu": "on", "mouille_depuis": quand, "sec_depuis": None}
        return suite, None if premier else _ligne(quand, "fuite", haid)
    if premier:
        return {**fiche, "vu": "off"}, None
    return {**fiche, "vu": "off", "sec_depuis": quand}, _ligne(quand, "sec", haid)


# ── Le journal du jour, le disque ──────────────────────────────────────────
def minuit(maintenant: datetime) -> float:
    """Aujourd'hui a 00:00, a l'heure de la maison, en secondes."""
    return datetime(maintenant.year, maintenant.month, maintenant.day, tzinfo=maintenant.tzinfo).timestamp()


def elaguer(journal: list[dict[str, Any]], depuis: float) -> list[dict[str, Any]]:
    """Les lignes d'aujourd'hui, les JOURNAL_MAX plus recentes."""
    return [l for l in journal if l["when"] >= depuis][-JOURNAL_MAX:]


def _lire_cause(brut: Any) -> dict[str, Any] | None:
    b = _table(brut)
    if b.get("cause") not in CAUSES:
        return None
    return {"cause": b["cause"], "detecteur": _texte(b.get("detecteur")), "nom": _texte(b.get("nom")),
            "user_id": _texte(b.get("user_id"))}


def _lire_ligne(brut: Any) -> dict[str, Any] | None:
    b = _table(brut)
    when = _nombre(b.get("when"))
    if when is None or b.get("quoi") not in QUOI or not _texte(b.get("entity_id")):
        return None
    return _ligne(when, b["quoi"], b["entity_id"], b)


def lire_carnet(brut: Any, depuis: float) -> dict[str, Any]:
    """`.storage/loggia_eau_etat` relu : ce qui ne se lit pas s'ecarte - une
    vanne qui n'en est pas une, une fiche abimee, une ligne d'hier."""
    b = _table(brut)
    vannes: dict[str, Any] = {}
    for haid, f in _table(b.get("vannes")).items():
        if not isinstance(haid, str) or not haid.startswith(("valve.", "switch.")):
            continue
        f = _table(f)
        if f.get("vu") not in SENS:
            vannes[haid] = fiche_vanne_neuve()
            continue
        fermee = f["vu"] == "fermee"
        vannes[haid] = {"vu": f["vu"], "cause": _lire_cause(f.get("cause")) if fermee else None, "depuis": _nombre(f.get("depuis"))}
    detecteurs: dict[str, Any] = {}
    for haid, f in _table(b.get("detecteurs")).items():
        if not isinstance(haid, str) or not haid.startswith("binary_sensor."):
            continue
        f = _table(f)
        detecteurs[haid] = {"vu": f.get("vu") if f.get("vu") in ("on", "off") else None,
                            "mouille_depuis": _nombre(f.get("mouille_depuis")), "sec_depuis": _nombre(f.get("sec_depuis"))}
    lignes = b.get("journal") if isinstance(b.get("journal"), list) else []
    journal = sorted((l for l in map(_lire_ligne, lignes) if l is not None), key=lambda l: l["when"])
    return {"vannes": vannes, "detecteurs": detecteurs, "journal": elaguer(journal, depuis)}


# ── La regle, et ce que l'ecran recoit ─────────────────────────────────────
def regle_de(cfg: Any, vannes: list[str]) -> dict[str, Any]:
    """« Fermer en cas de fuite » telle que la regle la lit (alertes.py) :
    `actif` (la bascule de la popup, `actions.vanne.actif`, vraie par defaut),
    `reagit` (la maison reagit aux dangers, et la fuite n'est pas decochee - sans
    cela la bascule ne ferait rien, et la popup le dit), `entite` (« Quelle
    vanne »), `toutes` (aucune n'est choisie : toutes les vannes d'eau, I30) et
    `vannes` (celles que la regle fermerait)."""
    c = _table(cfg)
    actions = _table(c.get("actions"))
    vanne = _table(actions.get("vanne"))
    cats = _table(c.get("categories"))
    entite = _texte(vanne.get("entite")) or ""
    # La lecture de la regle (alertes.py, `_actions` et `_categorie_reagit`), une seule (passe bis, point 8) : `bool(valeur)`,
    # vrai quand la cle manque. `None` passait ici pour « actif » et la-bas pour « coupe ».
    return {"actif": bool(vanne.get("actif", True)), "reagit": bool(actions.get("actif", True)) and bool(cats.get("fuite", True)),
            "entite": entite, "toutes": not entite, "vannes": list(vannes)}


def fusion_actif(cfg: Any, actif: bool) -> dict[str, Any]:
    """`loggia_alertes` d'apres « Fermer en cas de fuite » (I29) : SEULE
    `actions.vanne.actif` change - le reste tel qu'il est sur le disque. Une
    copie : la valeur en place n'est pas touchee."""
    suite = copy.deepcopy(cfg) if isinstance(cfg, dict) else {}
    actions = suite.get("actions") if isinstance(suite.get("actions"), dict) else {}
    vanne = actions.get("vanne") if isinstance(actions.get("vanne"), dict) else {}
    suite["actions"] = {**actions, "vanne": {**vanne, "actif": bool(actif)}}
    return suite


def garder_fermer_sur_fuite(disque: Any, demande: Any) -> Any:
    """`loggia_alertes` que la configuration generale (`loggia/config/set`)
    ecrit, `actions.vanne.actif` repris du DISQUE (passe bis, point 6) : seule
    `loggia/eau/regle` le change. Parametres envoie la cle entiere depuis ce
    qu'il a lu a l'ouverture ; sans cela, la bascule de la popup, changee
    entre-temps, revenait a l'ancienne valeur. Sur le disque sans valeur : la
    demande n'en porte pas non plus (le defaut, vrai, vaut). Une suppression
    (None) ou un format abime passent tels quels. Une copie."""
    if not isinstance(demande, dict):
        return demande
    suite = copy.deepcopy(demande)
    vanne_disque = _table(_table(_table(disque).get("actions")).get("vanne"))
    actions = suite.get("actions") if isinstance(suite.get("actions"), dict) else {}
    vanne = dict(actions.get("vanne")) if isinstance(actions.get("vanne"), dict) else {}
    vanne.pop("actif", None)
    if "actif" in vanne_disque:
        vanne["actif"] = vanne_disque["actif"]
    if vanne or isinstance(actions.get("vanne"), dict):
        suite["actions"] = {**actions, "vanne": vanne}
    return suite


def etat_public(carnet: dict[str, Any], regle: dict[str, Any], maintenant: float, lecture: Any = None) -> dict[str, Any]:
    """`loggia/eau/etat` : ce que l'ecran lit, sous les droits de LECTURE du
    compte (`lecture`, None = tout) - une vanne ou un detecteur qu'il ne lit pas
    ne s'y trouve pas, ni dans le journal, ni nomme dans une cause."""
    lit = (lambda h: True) if lecture is None else lecture
    def cachee(p: dict[str, Any]) -> dict[str, Any]:
        d = p.get("detecteur")
        return {**p, "detecteur": None, "nom": None} if d and not lit(d) else p
    vannes = {}
    for h, f in sorted(carnet.get("vannes", {}).items()):
        if not lit(h):
            continue
        p = cachee({"cause": None, "detecteur": None, "nom": None, "user_id": None, **(f.get("cause") or {})})
        vannes[h] = {"ferme": f.get("vu") == "fermee", "cause": p["cause"], "detecteur": p["detecteur"], "nom": p["nom"],
                     "user_id": p["user_id"], "depuis": f.get("depuis")}
    detecteurs = {h: {"mouille_depuis": f.get("mouille_depuis"), "sec_depuis": f.get("sec_depuis")}
                  for h, f in sorted(carnet.get("detecteurs", {}).items()) if lit(h)}
    journal = [cachee(dict(l)) for l in sorted(carnet.get("journal", []), key=lambda l: l["when"]) if lit(l["entity_id"])]
    return {"maintenant": maintenant, "vannes": vannes, "detecteurs": detecteurs, "journal": journal,
            "regle": {**regle, "vannes": [h for h in regle.get("vannes", []) if lit(h)]}}
