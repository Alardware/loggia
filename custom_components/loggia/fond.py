"""La photo de fond d'un compte, rangee sur Home Assistant (30/10, ADR 0289).

« Le fond d'ecran n'est pas synchronise : j'ai mis une image en 5G depuis
l'exterieur, et en Wi-Fi local je n'ai pas d'image. » La photo vivait dans le
localStorage du navigateur ; or l'adresse exterieure et l'adresse locale sont
deux origines, donc deux localStorage — et une tablette n'en voyait rien.

La photo suit donc le COMPTE Home Assistant (un compte = un profil, ADR 0276),
comme le reste de l'apparence. Elle vit dans `/config/loggia/fonds/`, pas dans
`/config/www/` (servi a tous sans authentification), et passe par une vue
authentifiee ou chacun ne touche qu'a la sienne :

  GET    /api/loggia/fond   la photo du compte connecte
  POST   /api/loggia/fond   la remplace (corps brut, JPEG)
  DELETE /api/loggia/fond   la retire

Le fichier ne passe pas par le magasin (256 Ko au plus par valeur) ; l'ecran
note sa version dans l'apparence, c'est ce qui previent les autres ecrans.

Toute E/S disque passe par l'executor : rien de bloquant dans la boucle.
"""
from __future__ import annotations

import hashlib
import logging
import re
from pathlib import Path

from .fichiers import ecrire_d_un_tenant

_LOGGER = logging.getLogger(__name__)

URL = "/api/loggia/fond"
# L'ecran compresse a 1920 px, JPEG qualite .8 : quelques centaines de Ko.
# 4 Mo laissent de la marge sans laisser remplir le disque de la box.
TAILLE_MAX = 4 * 1024 * 1024
_COMPTE = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")


class FondRefuse(ValueError):
    """Une photo refusee, avec un code que l'ecran traduit."""

    def __init__(self, code: str, detail: str = "") -> None:
        super().__init__(detail or code)
        self.code = code


def verifier_jpeg(octets: bytes) -> None:
    """Un JPEG entier, et pas trop lourd — sinon `FondRefuse`."""
    if not octets:
        raise FondRefuse("fond_vide")
    if len(octets) > TAILLE_MAX:
        raise FondRefuse("fond_trop_lourd", f"{len(octets)} > {TAILLE_MAX}")
    # Debut (SOI) et fin (EOI) : un envoi coupe en route n'a pas sa fin.
    if octets[:3] != b"\xff\xd8\xff" or octets[-2:] != b"\xff\xd9":
        raise FondRefuse("fond_format")


def empreinte(octets: bytes) -> str:
    """La version d'une photo : change des qu'un octet change (anti-cache)."""
    return hashlib.sha256(octets).hexdigest()[:16]


def chemin_fond(dossier: Path, compte: str) -> Path:
    if not _COMPTE.fullmatch(compte or ""):
        raise FondRefuse("fond_compte")
    return dossier / f"{compte}.jpg"


def ecrire_fond(dossier: Path, compte: str, octets: bytes) -> str:
    """Ecrit d'un seul tenant (temporaire puis renommage) ; rend la version."""
    verifier_jpeg(octets)
    cible = chemin_fond(dossier, compte)
    dossier.mkdir(parents=True, exist_ok=True)
    # Un temporaire par envoi (lot 8, B5), comme le plan 3D.
    ecrire_d_un_tenant(cible, octets)
    return empreinte(octets)


def lire_fond(dossier: Path, compte: str) -> bytes | None:
    try:
        return chemin_fond(dossier, compte).read_bytes()
    except FileNotFoundError:
        return None


def supprimer_fond(dossier: Path, compte: str) -> bool:
    try:
        chemin_fond(dossier, compte).unlink()
        return True
    except FileNotFoundError:
        return False


async def lire_corps(contenu, limite: int = TAILLE_MAX) -> bytes:
    """Lit le corps par morceaux, en s'arretant des que la limite est passee."""
    morceaux = []
    total = 0
    while True:
        bloc = await contenu.read(1 << 16)
        if not bloc:
            break
        total += len(bloc)
        if total > limite:
            raise FondRefuse("fond_trop_lourd", f"> {limite}")
        morceaux.append(bloc)
    return b"".join(morceaux)


def creer_vue(hass, dossier: Path):
    """La vue HTTP, construite ici pour que les tests n'importent pas aiohttp."""
    from aiohttp import web
    from homeassistant.components.http import HomeAssistantView

    def refus(statut: int, code: str):
        return web.json_response({"code": code}, status=statut)

    def compte_de(request) -> str | None:
        utilisateur = request.get("hass_user")
        return getattr(utilisateur, "id", None) if utilisateur is not None else None

    class LoggiaFondView(HomeAssistantView):
        url = URL
        name = "api:loggia:fond"
        requires_auth = True

        async def get(self, request):
            compte = compte_de(request)
            if not compte:
                return refus(401, "fond_compte")
            try:
                octets = await hass.async_add_executor_job(lire_fond, dossier, compte)
            except FondRefuse as err:
                return refus(400, err.code)
            if octets is None:
                return refus(404, "fond_absent")
            version = empreinte(octets)
            if request.headers.get("If-None-Match") == f'"{version}"':
                return web.Response(status=304)
            return web.Response(body=octets, content_type="image/jpeg",
                                headers={"ETag": f'"{version}"', "Cache-Control": "private, no-cache"})

        async def post(self, request):
            compte = compte_de(request)
            if not compte:
                return refus(401, "fond_compte")
            try:
                octets = await lire_corps(request.content)
                version = await hass.async_add_executor_job(ecrire_fond, dossier, compte, octets)
            except FondRefuse as err:
                return refus(413 if err.code == "fond_trop_lourd" else 400, err.code)
            except OSError:
                _LOGGER.exception("Loggia : photo de fond impossible a ecrire")
                return refus(500, "fond_ecriture")
            return web.json_response({"version": version, "taille": len(octets)})

        async def delete(self, request):
            compte = compte_de(request)
            if not compte:
                return refus(401, "fond_compte")
            try:
                await hass.async_add_executor_job(supprimer_fond, dossier, compte)
            except FondRefuse as err:
                return refus(400, err.code)
            return web.json_response({"retire": True})

    return LoggiaFondView()


def async_register_fond(hass) -> None:
    """Enregistre la vue, une fois pour la vie du process (cf. __init__.py)."""
    dossier = Path(hass.config.path("loggia", "fonds"))
    hass.http.register_view(creer_vue(hass, dossier))
