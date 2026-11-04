"""Les diagnostics de Loggia (04/11, ADR 0325).

Home Assistant › Appareils et services › Loggia › ⋮ › « Télécharger les
diagnostics », ou le bouton d'À propos dans Loggia. Le fichier se joint à un
ticket. Pour le ticket #43, il a fallu deviner la configuration de
l'utilisateur ; avec ce fichier, on aurait lu en une ligne que son profil
n'avait aucun ordre des pièces et qu'un autre en avait neuf.

Ce qu'il dit : les versions, les modules qui tournent, la FORME de la
configuration — quelles clés, de quel type, combien d'éléments — et ce que la
découverte a trouvé, compté par domaine et par intégration.

Ce qu'il ne dit JAMAIS : un nom (profil, pièce, personne, appareil), un
identifiant d'entité ou de compte, une adresse, un service de notification, un
code. Les valeurs ne sortent que pour une courte liste de réglages qui ne
disent rien de la maison (le rôle d'un profil, le mode clair ou sombre…). On
n'efface pas après coup ce qu'on aurait oublié de masquer : on ne recopie que
ce qui est sûr.
"""
from __future__ import annotations

import re
from collections import Counter
from pathlib import Path
from typing import Any

from .const import DOMAIN, VERSION

# Une clé qu'on peut montrer : un nom de réglage, en minuscule d'abord, sans
# espace ni accent (`piecesOrdre`, `loggia_accueil`, `__profils`), ou le numéro
# d'un profil. Un nom de pièce (« Salon », « Chambre de … ») commence par une
# majuscule ou porte un espace : il ne passe pas. Une entité (`light.salon`)
# porte un point : elle ne passe pas non plus.
_CLE_SURE = re.compile(r"^(?:_{0,2}[a-z][A-Za-z0-9_:-]{0,40}|[0-9]{1,3}|\*)$")
_ENTITE = re.compile(r"^[a-z_]+\.[a-z0-9_]+$")
# Un identifiant de compte, d'appareil ou d'écran : de l'hexadécimal, ou un tirage en minuscules et chiffres.
# Il commence souvent par une minuscule et passerait pour un nom de réglage (essai du 04/11 sur une vraie configuration).
_IDENTIFIANT = re.compile(r"^(?:[0-9a-f]{16,}|[a-z0-9]{20,40})$")
# Une valeur qui peut sortir : un mot, sans point (une entité), ni espace (un nom), ni barre (une adresse).
_MOT = re.compile(r"^[A-Za-z0-9_-]{1,24}$")

# Les seuls réglages dont la VALEUR sort : de courts mots choisis dans une
# liste, qui ne disent rien de la maison ni de ses habitants.
_VALEURS_SURES = frozenset({
    "role", "format", "mode", "theme", "langue", "tint", "radius", "fond", "verre", "plage",
    "loggia-mode", "loggia-theme", "loggia-langue", "loggia-ciel", "loggia-ha",
})

# Le code administrateur : ni sa forme, ni même sa présence détaillée.
_SECRETS = frozenset({"loggia_admin_pin", "loggia_admin_pin_hache"})

_PROFONDEUR = 7
_ELEMENTS = 12


def forme(valeur: Any, cle: str | None = None, profondeur: int = 0) -> Any:
    """La forme d'une valeur : son type, sa taille, et les clés sûres d'un dictionnaire."""
    if valeur is None or isinstance(valeur, bool):
        return valeur
    if isinstance(valeur, (int, float)):
        return "nombre"
    if isinstance(valeur, str):
        if cle in _VALEURS_SURES and _MOT.match(valeur):
            return valeur
        return "texte vide" if not valeur else "texte"
    if profondeur >= _PROFONDEUR:
        return "…"
    if isinstance(valeur, (list, tuple)):
        return {"liste": len(valeur), "elements": [forme(v, None, profondeur + 1) for v in valeur[:_ELEMENTS]]}
    if isinstance(valeur, dict):
        out: dict[str, Any] = {}
        entites = identifiants = autres = 0
        for k, v in valeur.items():
            k = str(k)
            if k in _SECRETS:
                out[k] = "masqué"
            elif _ENTITE.match(k):
                entites += 1
            elif _IDENTIFIANT.match(k):
                identifiants += 1
            elif _CLE_SURE.match(k):
                out[k] = forme(v, k, profondeur + 1)
            else:
                autres += 1
        if entites:
            out["<entités>"] = entites
        if identifiants:
            out["<identifiants>"] = identifiants
        if autres:
            out["<autres clés>"] = autres
        return out
    return type(valeur).__name__


def resume_index(index: dict[str, Any]) -> dict[str, Any]:
    """Ce que la découverte a trouvé, COMPTÉ : jamais un nom ni un identifiant."""
    entites = [e for e in (index.get("entities") or []) if isinstance(e, dict)]
    par_domaine = Counter(str(e.get("id", "")).split(".")[0] for e in entites if e.get("id"))
    par_plateforme = Counter(str(e.get("platform")) for e in entites if e.get("platform"))
    drapeaux: Counter[str] = Counter()
    for e in entites:
        for k, v in e.items():
            # Les drapeaux de la découverte (`rearmer`, `etat_poele`, `meteo`…) : des booléens ou de courts rôles.
            if k not in ("id", "name", "device", "area", "platform", "key", "category", "device_class", "unit", "hidden") and v not in (None, False, "", [], {}):
                drapeaux[k] += 1
    services = index.get("services") or {}
    return {
        "version_index": index.get("version"),
        "zones": len(index.get("areas") or []),
        "etages": len(index.get("floors") or []),
        "appareils": len(index.get("devices") or []),
        "entites": len(entites),
        "entites_masquees": sum(1 for e in entites if e.get("hidden")),
        "par_domaine": dict(sorted(par_domaine.items())),
        "par_integration": dict(sorted(par_plateforme.items())),
        "drapeaux": dict(sorted(drapeaux.items())),
        "services": {d: len(s or {}) for d, s in sorted(services.items())} if isinstance(services, dict) else {},
    }


def _boot_servi(racine: Path) -> str | None:
    """Le boot que sert `frontend/index.html` : la version de l'écran que reçoivent les navigateurs."""
    try:
        m = re.search(r"boot-[A-Za-z0-9_-]+\.js", (racine / "frontend" / "index.html").read_text(encoding="utf-8"))
        return m.group(0) if m else None
    except OSError:
        return None


async def async_get_config_entry_diagnostics(hass: Any, entry: Any) -> dict[str, Any]:
    """Le fichier que Home Assistant fait télécharger."""
    from homeassistant import const as ha_const  # noqa: PLC0415 — lu au moment du téléchargement

    data = hass.data.get(DOMAIN, {}) if isinstance(getattr(hass, "data", None), dict) else {}
    store = data.get("store")
    contenu: dict[str, Any] = {}
    if store is not None and hasattr(store, "async_pour_diagnostics"):
        try:
            contenu = await store.async_pour_diagnostics() or {}
        except Exception:  # noqa: BLE001 — un magasin illisible se dit, il n'empêche pas le fichier
            contenu = {"erreur": "configuration illisible"}
    comptes = contenu.get("users") if isinstance(contenu.get("users"), dict) else {}
    communes = contenu.get("shared") if isinstance(contenu.get("shared"), dict) else {}

    try:
        from .discovery import async_index  # noqa: PLC0415 — les registres ne se lisent qu'ici
        decouverte: dict[str, Any] = resume_index(async_index(hass))
    except Exception:  # noqa: BLE001
        decouverte = {"erreur": "registres illisibles"}

    return {
        "loggia": {
            "version": VERSION,
            "home_assistant": getattr(ha_const, "__version__", None),
            "boot_servi": await hass.async_add_executor_job(_boot_servi, Path(__file__).parent),
            "modules": sorted(k for k in data if isinstance(k, str)),
        },
        "configuration": {
            "schema": contenu.get("schema"),
            "migree": contenu.get("migrated"),
            "comptes": len(comptes),
            "communes": forme(communes),
            # Les comptes de Home Assistant, numérotés : leur identifiant ne sort pas.
            "par_compte": {f"compte {i + 1}": forme(v) for i, v in enumerate(comptes.values())},
        },
        "decouverte": decouverte,
    }
