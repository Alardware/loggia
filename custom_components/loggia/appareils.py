"""Les APPAREILS de la maison, et le profil que chacun regarde (ADR 0220).

« Sur la synchronisation il faudrait que ce soit comme pour une vraie app »
(17/10). Le profil actif disait vouloir appartenir a l'ecran — la tablette
reste sur le sien quand l'ordinateur change —, mais il etait range sous le
COMPTE Home Assistant. Un seul compte pour le PC et la tablette, et changer de
profil sur l'un le changeait en silence sur l'autre : la tablette affichait
« Luna » et rangeait les cartes de Guillaume.

Un appareil a donc sa FICHE, dans la maison :

    loggia_appareils = {
        "<id>": {"profil": "1", "format": "tablette", "nom": "", "propre": False,
                 "compte": "<compte HA>", "vu": 1760700000000},
    }

L'identifiant est tire au hasard par l'ecran et garde dans son stockage. La
fiche est ici, et non dans le navigateur, pour une raison : le passage vers un
profil Admin reste garde par le code (ADR 0080, `websocket_api.py`). Un profil
tenu par le seul navigateur sauterait cette garde.

Une fiche n'est pas une frontiere de securite — les profils n'en sont pas une.
Tout compte peut donc ecrire celle de l'ecran ou il se trouve ; seul retirer
la fiche d'un AUTRE compte reste reserve a un administrateur.

L'ecran n'envoie que SA fiche, jamais la liste entiere : deux ecrans qui
ecrivent en meme temps ne se reprennent pas l'un l'autre.
"""
from __future__ import annotations

import re
from typing import Any

# Une fiche mal formee est un defaut de l'ecran, pas un geste ordinaire : un
# simple `ValueError`, que les commandes relaient en `invalid_format`. Seuls les
# refus qu'un geste peut provoquer portent un code a eux (refus.py).
from .refus import RefusNomme

CLE_APPAREILS = "loggia_appareils"

# Ce que l'ecran tire : des minuscules et des chiffres. Rien d'autre ne passe,
# pour qu'un identifiant ne puisse pas se faire passer pour une cle.
MOTIF_ID = re.compile(r"^[a-z0-9]{8,40}$")
MOTIF_PROFIL = re.compile(r"^[0-9]{1,3}$")
FORMATS: frozenset[str] = frozenset({"pc", "tablette", "mobile"})
NOM_MAX = 40
MAX_APPAREILS = 64

# Un appareil SANS NOM qu'on n'a pas revu depuis 90 jours est oublie : un
# navigateur dont on a vide le cache en laisse un a chaque fois. Un appareil
# NOMME ne s'oublie jamais seul — quelqu'un l'a voulu.
OUBLI_ANONYME_MS = 90 * 24 * 3600 * 1000


def _fiches(valeur: Any) -> dict[str, dict[str, Any]]:
    """La liste rangee, debarrassee de ce qui n'a pas la forme d'une fiche."""
    if not isinstance(valeur, dict):
        return {}
    return {k: dict(v) for k, v in valeur.items()
            if isinstance(k, str) and MOTIF_ID.match(k) and isinstance(v, dict)}


def _demande_valide(ident: Any, demande: Any) -> dict[str, Any]:
    """Les champs d'une fiche envoyee par l'ecran, verifies un a un."""
    if not isinstance(ident, str) or not MOTIF_ID.match(ident):
        raise ValueError("identifiant d'appareil invalide")
    if not isinstance(demande, dict):
        raise ValueError("fiche d'appareil invalide")
    champs: dict[str, Any] = {}
    if "profil" in demande:
        profil = demande["profil"]
        if not isinstance(profil, str) or not MOTIF_PROFIL.match(profil):
            raise ValueError("profil d'appareil invalide")
        champs["profil"] = profil
    if "format" in demande:
        if demande["format"] not in FORMATS:
            raise ValueError("format d'appareil invalide")
        champs["format"] = demande["format"]
    if "nom" in demande:
        nom = demande["nom"]
        if not isinstance(nom, str):
            raise ValueError("nom d'appareil invalide")
        champs["nom"] = nom.strip()[:NOM_MAX]
    # « Cet ecran a sa propre mise en page » (ADR 0222), « sa propre
    # apparence » (ADR 0223) : deux choix oui / non, independants.
    for cle in ("propre", "apparence"):
        if cle in demande:
            if not isinstance(demande[cle], bool):
                raise ValueError("choix d'appareil invalide")
            champs[cle] = demande[cle]
    return champs


def profils_vises(demande: Any) -> list[str]:
    """Les profils vers lesquels une ecriture fait passer un ecran.

    La garde du profil Admin les verifie tous, comme elle verifie
    `loggia_active_user`. Une forme invalide ne vise rien ici : c'est la
    fusion qui la refusera."""
    if not isinstance(demande, dict):
        return []
    return [str(f["profil"]) for f in demande.values()
            if isinstance(f, dict) and isinstance(f.get("profil"), str)]


def fusionner(ancien: Any, demande: Any, *, compte: str, is_admin: bool,
              maintenant: int) -> dict[str, dict[str, Any]]:
    """La liste des appareils apres une ecriture.

    `demande` ne porte que les fiches qui changent ; les autres restent telles
    quelles. `None` a la place d'une fiche la retire. Chaque fiche ecrite
    retient le compte qui l'a ecrite et l'heure, en millisecondes."""
    if not isinstance(demande, dict):
        raise ValueError("liste d'appareils invalide")
    fiches = _fiches(ancien)
    for ident, fiche in demande.items():
        if fiche is None:
            existante = fiches.get(ident)
            if existante is None:
                continue
            if not is_admin and existante.get("compte") != compte:
                raise RefusNomme("not_admin", "retirer l'appareil d'un autre compte", ident)
            del fiches[ident]
            continue
        champs = _demande_valide(ident, fiche)
        fiches[ident] = {**fiches.get(ident, {}), **champs, "compte": compte, "vu": maintenant}

    seuil = maintenant - OUBLI_ANONYME_MS
    fiches = {k: v for k, v in fiches.items()
              if v.get("nom") or not isinstance(v.get("vu"), (int, float)) or v["vu"] >= seuil}
    if len(fiches) > MAX_APPAREILS:
        # Les anonymes les plus anciens d'abord ; un appareil nomme reste.
        anonymes = sorted((k for k, v in fiches.items() if not v.get("nom")),
                          key=lambda k: fiches[k].get("vu") or 0)
        for k in anonymes[:len(fiches) - MAX_APPAREILS]:
            del fiches[k]
    if len(fiches) > MAX_APPAREILS:
        raise RefusNomme("payload_too_large", "trop d'appareils", MAX_APPAREILS)
    return fiches


def pour_l_ecran(valeur: Any) -> dict[str, dict[str, Any]]:
    """La liste telle qu'un ecran la lit : sans le compte qui a ecrit.

    L'identifiant d'un compte Home Assistant n'a rien a faire sur l'ecran d'un
    autre. Il ne sert qu'ici, a decider qui peut retirer une fiche."""
    return {k: {c: x for c, x in v.items() if c != "compte"}
            for k, v in _fiches(valeur).items()}
