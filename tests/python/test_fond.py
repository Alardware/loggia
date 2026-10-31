"""La photo de fond d'un compte, rangee sur Home Assistant (ADR 0289).

« Le fond d'ecran n'est pas synchronise » : elle vivait dans le localStorage,
une origine par adresse. La vue HTTP est testee avec des doublures d'aiohttp
et de HomeAssistantView, comme celle du plan 3D (cf. test_plan.py).
"""
from __future__ import annotations

import asyncio
import json
import sys
import types

import pytest

from conftest import charger

JPEG = b"\xff\xd8\xff\xe0" + b"photo" * 10 + b"\xff\xd9"


@pytest.fixture
def fond():
    return charger("fond")


def test_un_jpeg_entier_passe(fond):
    fond.verifier_jpeg(JPEG)


@pytest.mark.parametrize("octets,code", [
    (b"", "fond_vide"),
    (b"\x89PNG\r\n\x1a\n...", "fond_format"),
    (JPEG[:-2], "fond_format"),  # coupe en route : pas de fin
])
def test_ce_qui_n_est_pas_un_jpeg_entier_est_refuse_et_nomme(fond, octets, code):
    with pytest.raises(fond.FondRefuse) as err:
        fond.verifier_jpeg(octets)
    assert err.value.code == code


def test_trop_lourd(fond, monkeypatch):
    monkeypatch.setattr(fond, "TAILLE_MAX", 10)
    with pytest.raises(fond.FondRefuse) as err:
        fond.verifier_jpeg(JPEG)
    assert err.value.code == "fond_trop_lourd"


@pytest.mark.parametrize("compte", ["../x", "a/b", "", "abc\n", "x" * 65])
def test_un_compte_ne_sort_jamais_du_dossier(fond, tmp_path, compte):
    with pytest.raises(fond.FondRefuse):
        fond.chemin_fond(tmp_path, compte)


def test_ecriture_lecture_retrait(fond, tmp_path):
    version = fond.ecrire_fond(tmp_path, "abc123", JPEG)
    assert version == fond.empreinte(JPEG)
    assert fond.lire_fond(tmp_path, "abc123") == JPEG
    assert not list(tmp_path.glob("*.tmp"))
    assert fond.supprimer_fond(tmp_path, "abc123") is True
    assert fond.lire_fond(tmp_path, "abc123") is None
    assert fond.supprimer_fond(tmp_path, "abc123") is False


def test_une_photo_refusee_ne_remplace_pas_la_bonne(fond, tmp_path):
    fond.ecrire_fond(tmp_path, "abc123", JPEG)
    with pytest.raises(fond.FondRefuse):
        fond.ecrire_fond(tmp_path, "abc123", JPEG[:-2])
    assert fond.lire_fond(tmp_path, "abc123") == JPEG


# ── La vue HTTP, avec des doublures ─────────────────────────────────────────

class Reponse:
    def __init__(self, body=None, status=200, content_type=None, headers=None):
        self.body, self.status, self.content_type, self.headers = body, status, content_type, headers or {}


def _json_response(data, status=200):
    return Reponse(json.dumps(data).encode(), status, "application/json")


class Flux:
    def __init__(self, octets, bloc=1 << 16):
        self.octets, self.bloc = octets, bloc

    async def read(self, n):
        morceau, self.octets = self.octets[:min(n, self.bloc)], self.octets[min(n, self.bloc):]
        return morceau


@pytest.fixture
def vue(fond, tmp_path, monkeypatch):
    web = types.SimpleNamespace(Response=Reponse, json_response=_json_response)
    aiohttp = types.ModuleType("aiohttp")
    aiohttp.web = web
    monkeypatch.setitem(sys.modules, "aiohttp", aiohttp)
    monkeypatch.setitem(sys.modules, "aiohttp.web", web)
    http = types.ModuleType("homeassistant.components.http")
    http.HomeAssistantView = type("HomeAssistantView", (), {})
    monkeypatch.setitem(sys.modules, "homeassistant.components", types.ModuleType("homeassistant.components"))
    monkeypatch.setitem(sys.modules, "homeassistant.components.http", http)

    class Hass:
        async def async_add_executor_job(self, f, *a):
            return f(*a)

    return fond.creer_vue(Hass(), tmp_path)


class Requete(dict):
    def __init__(self, compte="compte1", corps=b"", headers=None, admin=False):
        super().__init__(hass_user=types.SimpleNamespace(id=compte, is_admin=admin) if compte else None)
        self.content = Flux(corps)
        self.headers = headers or {}


def test_la_vue_exige_une_connexion(vue):
    assert vue.requires_auth is True
    assert vue.url == "/api/loggia/fond"


def test_un_compte_ordinaire_range_sa_photo(vue):
    """Ce n'est pas un reglage de la maison : chacun range la sienne."""
    r = asyncio.run(vue.post(Requete(corps=JPEG, admin=False)))
    assert r.status == 200 and json.loads(r.body)["version"]


def test_chacun_ne_voit_que_la_sienne(vue):
    asyncio.run(vue.post(Requete("lui", corps=JPEG)))
    assert asyncio.run(vue.get(Requete("lui"))).body == JPEG
    assert asyncio.run(vue.get(Requete("elle"))).status == 404
    asyncio.run(vue.delete(Requete("elle")))
    assert asyncio.run(vue.get(Requete("lui"))).status == 200, "retirer la sienne ne touche pas celle d'un autre"


def test_depot_puis_lecture_puis_retrait(vue):
    r = asyncio.run(vue.post(Requete(corps=JPEG)))
    assert r.status == 200
    r = asyncio.run(vue.get(Requete()))
    assert r.status == 200 and r.body == JPEG and r.content_type == "image/jpeg"
    etag = r.headers["ETag"]
    assert asyncio.run(vue.get(Requete(headers={"If-None-Match": etag}))).status == 304
    assert asyncio.run(vue.delete(Requete())).status == 200
    assert asyncio.run(vue.get(Requete())).status == 404


def test_un_depot_refuse_dit_pourquoi(vue):
    r = asyncio.run(vue.post(Requete(corps=b"pas une photo")))
    assert r.status == 400 and json.loads(r.body)["code"] == "fond_format"


def test_sans_compte_rien(vue):
    assert asyncio.run(vue.get(Requete(compte=None))).status == 401
    assert asyncio.run(vue.post(Requete(compte=None, corps=JPEG))).status == 401
