"""Les textes du serveur, et leur langue (ADR 0070).

Le composant ecrit le journal en francais, et c'est le francais qui reste
ecrit : les journaux existants, les logs, les tests. Mais l'ecran, lui, parle
sept langues ; et le telephone, la langue du serveur.

Une ligne qui porte des variables — « vent 62 km/h », « 2 sous la main de
quelqu'un » — ne peut pas se traduire apres coup. Elle se compose donc de
PARTIES : un gabarit et ses arguments, ``("vent {v}", {"v": "62 km/h"})``.
Le journal garde le francais rendu ET les parties (``g``) ; l'ecran traduit
chaque gabarit par sa cle francaise, exactement comme le reste de
l'interface, et remplit les reperes.

Les notifications partent du serveur : elles sont rendues ici, dans la langue
de Home Assistant (``hass.config.language``), par le catalogue de
``textes_catalogue.py`` — genere depuis les catalogues du frontend, jamais
ecrit a la main.
"""
from __future__ import annotations

from typing import Any

from .textes_catalogue import TEXTES

LANGUE_SOURCE = "fr"
SEPARATEUR = " · "


def partie(gabarit: str, **args: Any) -> tuple[str, dict[str, Any]]:
    """Un gabarit et ses arguments : ``partie("vent {v}", v=valeur)``."""
    return (str(gabarit), dict(args))


def parties(texte: Any) -> list[tuple[str, dict[str, Any]]] | None:
    """Les parties d'un texte compose — ou ``None`` pour un mot fixe.

    Un ``str`` est un mot fixe : l'ecran le traduit par sa cle, rien a
    garder. Un tuple est une partie ; une liste, plusieurs (un ``str`` dans
    la liste est une partie sans argument).
    """
    if texte is None or isinstance(texte, str):
        return None
    if isinstance(texte, tuple):
        return [(str(texte[0]), dict(texte[1] or {}))]
    if isinstance(texte, list):
        out = []
        for p in texte:
            if p is None or p == "":
                continue
            if isinstance(p, str):
                out.append((p, {}))
            elif isinstance(p, tuple):
                out.append((str(p[0]), dict(p[1] or {})))
        return out
    return None


def joindre(*morceaux: Any) -> list[tuple[str, dict[str, Any]]]:
    """Plusieurs textes — fixes, parties, listes — en une seule liste de parties."""
    out: list[tuple[str, dict[str, Any]]] = []
    for m in morceaux:
        if m is None or m == "":
            continue
        if isinstance(m, str):
            out.append((m, {}))
        else:
            out.extend(parties(m) or [])
    return out


def remplir(gabarit: str, args: dict[str, Any] | None) -> str:
    """Les reperes ``{k}`` remplaces — sans ``str.format``, qu'une accolade
    dans un nom d'appareil ferait echouer."""
    s = str(gabarit)
    for k, v in (args or {}).items():
        s = s.replace("{" + str(k) + "}", str(v))
    return s


def rendre_fr(texte: Any) -> str:
    """Le francais ecrit au journal : ce que les modules ont toujours ecrit."""
    if texte is None:
        return ""
    if isinstance(texte, str):
        return texte
    return SEPARATEUR.join(remplir(g, a) for g, a in (parties(texte) or []))


def langue_serveur(hass: Any) -> str:
    """La langue de Home Assistant, en deux lettres — le francais a defaut.

    C'est celle des notifications : le telephone n'a pas d'ecran de Loggia
    pour choisir, il lit ce que le serveur parle.
    """
    cfg = getattr(hass, "config", None)
    brut = getattr(cfg, "language", None) if cfg is not None else None
    code = str(brut or "").strip().lower()[:2]
    return code or LANGUE_SOURCE


def traduire(texte: Any, langue: str) -> str:
    """Un texte rendu dans ``langue`` : le francais tel quel, sinon le
    catalogue de cette langue, sinon l'anglais, sinon le francais."""
    if texte is None:
        return ""
    if langue == LANGUE_SOURCE:
        return rendre_fr(texte)
    cat = TEXTES.get(langue) or {}
    filet = TEXTES.get("en") or {}
    parts = parties(texte) or [(str(texte), {})]
    return SEPARATEUR.join(remplir(cat.get(g) or filet.get(g) or g, a) for g, a in parts)
