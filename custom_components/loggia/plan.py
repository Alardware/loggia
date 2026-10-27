"""Le plan 3D de la maison : un fichier .glb par etage (chantier Plan 3D).

Pourquoi pas `/config/www/` : tout ce qui s'y trouve est servi en `/local/…`
SANS authentification. Un plan de maison n'a rien a faire en libre acces —
c'est la disposition des pieces, l'emplacement des portes. Les plans vivent
donc dans `/config/loggia/plans/` et passent par une vue authentifiee :

  GET    /api/loggia/plan/<etage>   tout compte connecte : le fichier
  POST   /api/loggia/plan/<etage>   administrateur : le remplace (corps brut)
  DELETE /api/loggia/plan/<etage>   administrateur : le retire

`etage` est l'id d'un etage de Home Assistant, ou `maison` quand la maison
n'en declare pas. Le fichier ne passe jamais par le magasin (256 Ko au plus
par valeur) ; seule sa fiche y va, sous la cle commune `loggia_plan3d` —
c'est elle qui previent les ecrans qu'un plan a change.

Toute E/S disque passe par l'executor : rien de bloquant dans la boucle.
"""
from __future__ import annotations

import hashlib
import logging
import os
import re
import struct
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_LOGGER = logging.getLogger(__name__)

URL = "/api/loggia/plan/{etage}"
CLE = "loggia_plan3d"
# Un plan compresse (meshopt) d'une maison entiere pese moins d'un megaoctet ;
# un export brut de Sweet Home 3D, une dizaine. 40 Mo laissent de la marge
# sans laisser remplir le disque de la box.
TAILLE_MAX = 40 * 1024 * 1024
_ETAGE = re.compile(r"^[a-z0-9_]{1,64}$")


class PlanRefuse(ValueError):
    """Un plan refuse, avec un code que l'ecran traduit."""

    def __init__(self, code: str, detail: str = "") -> None:
        super().__init__(detail or code)
        self.code = code


def etage_valide(etage: str) -> bool:
    """Un nom d'etage sur : il devient un nom de fichier."""
    # `fullmatch` (26/10) : avec `match`, le `$` de Python accepte un `\n` final.
    return bool(_ETAGE.fullmatch(etage or ""))


def verifier_glb(octets: bytes) -> None:
    """Un glTF 2 binaire, entier, et pas trop lourd — sinon `PlanRefuse`.

    L'en-tete fait 12 octets : la signature `glTF`, la version (2), puis la
    longueur totale annoncee. Un fichier tronque en route l'annonce plus long
    qu'il n'est : on le refuse plutot que d'ecraser un plan qui marchait.
    """
    if not octets:
        raise PlanRefuse("plan_vide")
    if len(octets) > TAILLE_MAX:
        raise PlanRefuse("plan_trop_lourd", f"{len(octets)} > {TAILLE_MAX}")
    if len(octets) < 12 or octets[:4] != b"glTF":
        raise PlanRefuse("plan_format")
    version, longueur = struct.unpack_from("<II", octets, 4)
    if version != 2:
        raise PlanRefuse("plan_format", f"glTF version {version}")
    if longueur != len(octets):
        raise PlanRefuse("plan_tronque", f"{len(octets)} octets pour {longueur} annonces")


def empreinte(octets: bytes) -> str:
    """La version d'un plan : change des qu'un octet change (anti-cache)."""
    return hashlib.sha256(octets).hexdigest()[:16]


def chemin_plan(dossier: Path, etage: str) -> Path:
    if not etage_valide(etage):
        raise PlanRefuse("plan_etage")
    return dossier / f"{etage}.glb"


def ecrire_plan(dossier: Path, etage: str, octets: bytes) -> str:
    """Ecrit d'un seul tenant : un fichier temporaire, puis un renommage.

    Une coupure au milieu laisse l'ancien plan intact, jamais un plan a
    moitie ecrit. Rend la version du plan ecrit."""
    verifier_glb(octets)
    cible = chemin_plan(dossier, etage)
    dossier.mkdir(parents=True, exist_ok=True)
    temporaire = cible.with_suffix(".glb.tmp")
    temporaire.write_bytes(octets)
    os.replace(temporaire, cible)
    return empreinte(octets)


def lire_plan(dossier: Path, etage: str) -> bytes | None:
    cible = chemin_plan(dossier, etage)
    try:
        return cible.read_bytes()
    except FileNotFoundError:
        return None


def supprimer_plan(dossier: Path, etage: str) -> bool:
    cible = chemin_plan(dossier, etage)
    try:
        cible.unlink()
        return True
    except FileNotFoundError:
        return False


def fiche(valeur: Any, etage: str, nom: str | None, octets: bytes | None) -> dict:
    """La cle `loggia_plan3d` apres un depot (`octets`) ou un retrait (None).

    Les liaisons (`liens`) ne bougent pas : elles portent sur les NOMS des
    objets, et un nouvel import du meme modele les retrouve."""
    v = dict(valeur) if isinstance(valeur, dict) else {}
    plans = dict(v.get("plans") or {})
    if octets is None:
        plans.pop(etage, None)
    else:
        plans[etage] = {
            "version": empreinte(octets),
            "nom": (nom or f"{etage}.glb")[:120],
            "taille": len(octets),
            "date": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        }
    v["plans"] = plans
    return v


async def lire_corps(contenu, limite: int = TAILLE_MAX) -> bytes:
    """Lit le corps par morceaux, en s'arretant des que la limite est passee.

    `request.read()` s'arreterait au plafond general de Home Assistant
    (16 Mo) avec une erreur muette ; ici le refus est le notre, et nomme."""
    morceaux = []
    total = 0
    while True:
        bloc = await contenu.read(1 << 16)
        if not bloc:
            break
        total += len(bloc)
        if total > limite:
            raise PlanRefuse("plan_trop_lourd", f"> {limite}")
        morceaux.append(bloc)
    return b"".join(morceaux)


def creer_vue(hass, store, dossier: Path):
    """La vue HTTP, construite ici pour que les tests n'importent pas aiohttp."""
    from aiohttp import web
    from homeassistant.components.http import HomeAssistantView

    def refus(statut: int, code: str):
        return web.json_response({"code": code}, status=statut)

    class LoggiaPlanView(HomeAssistantView):
        url = URL
        name = "api:loggia:plan"
        requires_auth = True

        async def get(self, request, etage):
            if not etage_valide(etage):
                return refus(400, "plan_etage")
            octets = await hass.async_add_executor_job(lire_plan, dossier, etage)
            if octets is None:
                return refus(404, "plan_absent")
            version = empreinte(octets)
            if request.headers.get("If-None-Match") == f'"{version}"':
                return web.Response(status=304)
            return web.Response(body=octets, content_type="model/gltf-binary",
                                headers={"ETag": f'"{version}"', "Cache-Control": "private, no-cache"})

        async def post(self, request, etage):
            utilisateur = request.get("hass_user")
            if utilisateur is None or not utilisateur.is_admin:
                return refus(403, "not_admin")
            try:
                octets = await lire_corps(request.content)
                nom = request.query.get("nom")
                version = await hass.async_add_executor_job(ecrire_plan, dossier, etage, octets)
            except PlanRefuse as err:
                return refus(413 if err.code == "plan_trop_lourd" else 400, err.code)
            except OSError:
                _LOGGER.exception("Loggia : plan %s impossible a ecrire", etage)
                return refus(500, "plan_ecriture")
            await store.async_modifier_shared(CLE, lambda v: fiche(v, etage, nom, octets))
            return web.json_response({"version": version, "taille": len(octets)})

        async def delete(self, request, etage):
            utilisateur = request.get("hass_user")
            if utilisateur is None or not utilisateur.is_admin:
                return refus(403, "not_admin")
            if not etage_valide(etage):
                return refus(400, "plan_etage")
            await hass.async_add_executor_job(supprimer_plan, dossier, etage)
            await store.async_modifier_shared(CLE, lambda v: fiche(v, etage, None, None))
            return web.json_response({"retire": etage})

    return LoggiaPlanView()


def async_register_plan(hass, store) -> None:
    """Enregistre la vue, une fois pour la vie du process (cf. __init__.py)."""
    dossier = Path(hass.config.path("loggia", "plans"))
    hass.http.register_view(creer_vue(hass, store, dossier))
