"""Les versions precedentes de la configuration (29/10, ADR 0285).

« Revenir a la version d'avant » : avant une ecriture, le magasin garde ce qui
etait sur le disque — la configuration ENTIERE, partagee et par compte, pour
qu'un retour remette un etat coherent. Au plus une copie par quart d'heure :
une rafale de reglages ne fait qu'une copie, celle d'avant la rafale. Les dix
plus recentes restent.

Les copies vivent dans un fichier a elles (`.storage/loggia_versions`), jamais
dans la configuration : elles en multiplieraient le poids, et chaque reglage
le reserialise. Chacune est COMPRESSEE (zlib, puis base64 pour tenir dans le
JSON de Home Assistant) : la configuration d'une vraie maison — 213 Ko sur le
disque, 71 Ko en JSON compact — tient en 12 Ko, et les dix copies en
125 Ko environ, quand dix copies en clair, indentees par Home Assistant,
pesaient deux Mo.

Une copie ne garde ni le code administrateur (hache ou clair), ni ce que le
serveur tient en cours d'execution — les minuteurs qui tournent, le test de
sirene, les fiches des ecrans (ADR 0220) : `GARDEES_AU_RETOUR`. Un retour
laisse ces cles telles qu'elles sont aujourd'hui, comme l'import (config.js,
`CLES_SERVEUR`).

ROBUSTESSE : rien ici n'empeche jamais la configuration de s'ecrire. Un fichier
de versions illisible est d'abord COPIE a cote (`.corrupt.<horodatage>`), dans
l'esprit de `_mettre_de_cote` (store.py, ADR 0280) : la copie se saute, l'erreur
va au journal, et le fichier repart vide ensuite. S'il n'a pas pu etre mis de
cote, plus aucune copie ne s'ecrit par-dessus avant le prochain redemarrage.
"""
from __future__ import annotations

import asyncio
import base64
import binascii
import hashlib
import json
import logging
import os
import shutil
import time
import uuid
import zlib
from datetime import datetime, timezone
from typing import Any

from .appareils import CLE_APPAREILS
from .code_admin import CLE_CLAIR, CLE_HACHE
from .refus import RefusNomme

_LOGGER = logging.getLogger(__name__)

STORAGE_KEY = "loggia_versions"
STORAGE_VERSION = 1
MAX_VERSIONS = 10
INTERVALLE_S = 15 * 60
# Le niveau 6, celui de zlib par defaut : 1,9 ms pour 71 Ko, 17 % du JSON
# compact ; le niveau 9 ne gagne que 1 % pour presque deux fois le temps.
NIVEAU_ZLIB = 6
# Une copie decompressee ne depasse jamais ce poids : la configuration en est
# plafonnee a 1 Mio par cote (store.py, MAX_TOTAL_BYTES).
MAX_DECOMPRESSE = 8 * 1024 * 1024

MOTIF_ECRITURE = "ecriture"
MOTIF_RETOUR = "retour"

# Ce qu'une copie ne porte pas, et qu'un retour laisse tel qu'il est. Les
# minuteurs et la sirene : `minuteurs.CLE`, `sirene.CLE` (tests/python/
# test_versions.py le verifie) — les importer ici tirerait leurs modules
# dans le magasin, charge avant eux. Le rappel de collecte (`collecte.CLE_ETAT`,
# ADR 0301) aussi : ce qui a ete dit et ce qui est sorti, pas un reglage.
GARDEES_AU_RETOUR: frozenset[str] = frozenset(
    {CLE_CLAIR, CLE_HACHE, "loggia_minuteurs", "loggia_sirene_test", CLE_APPAREILS, "loggia_collecte"}
)


def _maintenant() -> float:
    """L'heure des copies, en secondes UTC (remplacee dans les tests)."""
    return time.time()


def instantane(data: dict[str, Any]) -> dict[str, Any]:
    """Ce qu'une copie garde : les comptes et la maison, sans les cles gardees.
    Un compte sans reglage ne prend pas de place."""
    users = data.get("users") if isinstance(data.get("users"), dict) else {}
    shared = data.get("shared") if isinstance(data.get("shared"), dict) else {}
    return {
        "users": {uid: dict(v) for uid, v in users.items() if isinstance(v, dict) and v},
        "shared": {k: v for k, v in shared.items() if k not in GARDEES_AU_RETOUR},
    }


def texte_de(etat: dict[str, Any]) -> str:
    """Le JSON d'une copie : compact, cles triees — la meme configuration
    donne le meme texte, donc la meme empreinte."""
    return json.dumps(etat, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def compresser(etat: dict[str, Any]) -> tuple[str, int, str]:
    """(contenu en base64, taille du JSON en octets, empreinte)."""
    brut = texte_de(etat).encode("utf-8")
    texte = base64.b64encode(zlib.compress(brut, NIVEAU_ZLIB)).decode("ascii")
    return texte, len(brut), hashlib.sha256(brut).hexdigest()[:24]


def decompresser(texte: Any) -> dict[str, Any]:
    """Le contenu d'une copie, ou ValueError s'il est abime."""
    try:
        compresse = base64.b64decode(str(texte), validate=True)
        d = zlib.decompressobj()
        brut = d.decompress(compresse, MAX_DECOMPRESSE)
        if d.unconsumed_tail:
            raise ValueError("copie trop volumineuse")
        etat = json.loads(brut.decode("utf-8"))
    except (binascii.Error, zlib.error, UnicodeDecodeError, json.JSONDecodeError) as err:
        raise ValueError("copie illisible") from err
    if not isinstance(etat, dict) or not isinstance(etat.get("users"), dict) or not isinstance(etat.get("shared"), dict):
        raise ValueError("copie illisible")
    return etat


def rendre(actuel: dict[str, Any], copie: dict[str, Any]) -> dict[str, Any]:
    """La configuration apres le retour : celle de la copie, sauf les cles
    gardees, reprises d'aujourd'hui. Le reste du fichier (`schema`,
    `migrated`) ne bouge pas."""
    commun_actuel = actuel.get("shared") if isinstance(actuel.get("shared"), dict) else {}
    commun = {k: v for k, v in copie["shared"].items() if k not in GARDEES_AU_RETOUR}
    commun.update({k: commun_actuel[k] for k in GARDEES_AU_RETOUR if k in commun_actuel})
    comptes = {uid: dict(v) for uid, v in copie["users"].items() if isinstance(v, dict)}
    return {**actuel, "users": comptes, "shared": commun}


def _secondes(iso: Any) -> float:
    try:
        return datetime.fromisoformat(str(iso)).timestamp()
    except ValueError:
        return 0.0


def _valide(e: Any) -> bool:
    return (isinstance(e, dict) and isinstance(e.get("id"), str) and isinstance(e.get("date"), str)
            and isinstance(e.get("contenu"), str))


def _resume(e: dict[str, Any]) -> dict[str, Any]:
    """Une copie, sans son contenu : ce que l'ecran affiche."""
    return {"id": e["id"], "date": e["date"], "compte": e.get("compte"),
            "taille": e.get("taille"), "motif": e.get("motif") or MOTIF_ECRITURE}


async def copier_a_cote(hass: Any, depot: Any) -> str | None:
    """Copie le fichier d'un `Store` a cote de lui (`<fichier>.corrupt.<date>`).

    Rend son chemin, '' s'il n'y avait pas de fichier, None si la copie a
    echoue. Jamais deplace : tant que la copie n'est pas faite, rien ne doit
    s'ecrire par-dessus (ADR 0280). Partage par le magasin et les versions."""
    chemin = getattr(depot, "path", None)
    if not isinstance(chemin, str) or not chemin:
        return None
    cible = "%s.corrupt.%s" % (chemin, time.strftime("%Y%m%dT%H%M%S"))

    def copier() -> str:
        if not os.path.exists(chemin):
            return ""
        shutil.copy2(chemin, cible)
        return cible

    try:
        if hass is not None:
            return await hass.async_add_executor_job(copier)
        return await asyncio.get_running_loop().run_in_executor(None, copier)
    except Exception:  # noqa: BLE001
        _LOGGER.exception("Loggia : copie du fichier illisible impossible")
        return None


class Versions:
    """Le fichier des copies. Appele sous le verrou du magasin, seulement."""

    def __init__(self, depot: Any, hass: Any = None) -> None:
        self._depot = depot
        self.hass = hass
        self._liste: list[dict[str, Any]] | None = None
        # Illisible ET non copie a cote : plus rien ne s'ecrit par-dessus.
        self._hors_service = False

    async def _executer(self, fonction, *args):
        hass = self.hass
        if hass is not None:
            return await hass.async_add_executor_job(fonction, *args)
        return await asyncio.get_running_loop().run_in_executor(None, fonction, *args)

    async def _charger(self) -> list[dict[str, Any]] | None:
        """Les copies, la plus recente en tete — ou None : pas de copie cette
        fois (fichier illisible), ni tant qu'il n'a pas ete mis de cote."""
        if self._liste is not None:
            return self._liste
        if self._hors_service:
            return None
        try:
            brut = await self._depot.async_load()
        except Exception:  # noqa: BLE001 — une copie ne bloque jamais la configuration
            _LOGGER.exception("Loggia : le fichier des versions n'a pas pu etre lu, la copie est sautee")
            copie = await copier_a_cote(self.hass, self._depot)
            if copie is None:
                self._hors_service = True
                _LOGGER.error("Loggia : le fichier des versions illisible n'a pas pu etre copie : plus aucune "
                              "version ne sera gardee avant le prochain redemarrage")
            else:
                if copie:
                    _LOGGER.warning("Loggia : le fichier des versions illisible est garde sous %s", copie)
                self._liste = []
            return None
        entrees = brut.get("versions") if isinstance(brut, dict) else None
        self._liste = [e for e in entrees if _valide(e)][:MAX_VERSIONS] if isinstance(entrees, list) else []
        return self._liste

    async def async_garder(self, data: dict[str, Any], *, compte: str | None = None,
                           motif: str = MOTIF_ECRITURE, forcer: bool = False) -> bool:
        """Garde `data` — ce qui est sur le disque — avant qu'il ne change.

        Sans `forcer`, au plus une copie par quart d'heure. Rend True quand
        l'etat est desormais garde (copie neuve, ou identique a la derniere)
        ou qu'il n'y a rien a garder ; False sinon. Ne leve jamais."""
        try:
            return await self._garder(data, compte, motif, forcer)
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Loggia : la version precedente de la configuration n'a pas pu etre gardee")
            return False

    async def _garder(self, data, compte, motif, forcer) -> bool:
        etat = instantane(data)
        if not etat["users"] and not etat["shared"]:
            return True
        liste = await self._charger()
        if liste is None:
            return False
        maintenant = _maintenant()
        if not forcer and liste and 0 <= maintenant - _secondes(liste[0]["date"]) < INTERVALLE_S:
            return False
        texte, taille, empreinte = await self._executer(compresser, etat)
        if liste and liste[0].get("empreinte") == empreinte:
            return True
        entree = {
            "id": uuid.uuid4().hex[:16],
            "date": datetime.fromtimestamp(maintenant, timezone.utc).isoformat(timespec="seconds"),
            "compte": str(compte)[:100] if compte else None,
            "taille": taille,
            "motif": motif,
            "empreinte": empreinte,
            "contenu": texte,
        }
        nouvelle = [entree] + liste[:MAX_VERSIONS - 1]
        await self._depot.async_save({"versions": nouvelle})
        self._liste = nouvelle
        return True

    async def async_liste(self) -> list[dict[str, Any]]:
        """Les copies, sans leur contenu, la plus recente en tete."""
        liste = await self._charger()
        if liste is None:
            liste = self._liste
        if liste is None:
            raise RefusNomme("versions_indisponibles", "le fichier des versions est illisible")
        return [_resume(e) for e in liste]

    async def async_lire(self, ident: str) -> dict[str, Any]:
        """Le contenu d'une copie. Refus nommes : inconnue, illisible."""
        liste = await self._charger()
        if liste is None:
            liste = self._liste
        if liste is None:
            raise RefusNomme("versions_indisponibles", "le fichier des versions est illisible")
        entree = next((e for e in liste if e["id"] == ident), None)
        if entree is None:
            raise RefusNomme("version_inconnue", "version inconnue", ident)
        try:
            return await self._executer(decompresser, entree["contenu"])
        except ValueError as err:
            raise RefusNomme("version_illisible", "copie illisible", ident) from err
