"""Le plan 3D : verification du fichier, ecriture d'un seul tenant, droits.

La vue HTTP est testee avec des doublures d'aiohttp et de HomeAssistantView :
la CI n'installe ni l'un ni l'autre (cf. conftest.py).
"""
from __future__ import annotations

import asyncio
import json
import struct
import sys
import types

import pytest

from conftest import charger


def glb(contenu: bytes = b"") -> bytes:
    """Un glTF 2 binaire minimal, longueur annoncee juste."""
    corps = b'{"asset":{"version":"2.0"}}   ' + contenu
    corps += b" " * ((4 - len(corps) % 4) % 4)
    morceau = struct.pack("<II", len(corps), 0x4E4F534A) + corps
    return b"glTF" + struct.pack("<II", 2, 12 + len(morceau)) + morceau


@pytest.fixture
def plan():
    return charger("plan")


def test_un_glb_valide_passe(plan):
    plan.verifier_glb(glb())


@pytest.mark.parametrize("octets,code", [
    (b"", "plan_vide"),
    (b"OBJ fichier texte", "plan_format"),
    (b"glTF" + struct.pack("<II", 1, 12), "plan_format"),
])
def test_ce_qui_n_est_pas_un_glb_est_refuse_et_nomme(plan, octets, code):
    with pytest.raises(plan.PlanRefuse) as err:
        plan.verifier_glb(octets)
    assert err.value.code == code


def test_un_fichier_tronque_ne_remplace_pas_le_plan(plan, tmp_path):
    bon = glb(b"ancien")
    plan.ecrire_plan(tmp_path, "maison", bon)
    with pytest.raises(plan.PlanRefuse) as err:
        plan.ecrire_plan(tmp_path, "maison", glb(b"nouveau")[:-8])
    assert err.value.code == "plan_tronque"
    assert plan.lire_plan(tmp_path, "maison") == bon


def test_trop_lourd(plan, monkeypatch):
    monkeypatch.setattr(plan, "TAILLE_MAX", 100)
    with pytest.raises(plan.PlanRefuse) as err:
        plan.verifier_glb(glb(b"x" * 200))
    assert err.value.code == "plan_trop_lourd"


@pytest.mark.parametrize("etage", ["../secrets", "a/b", "", "Rez", "x" * 65, "rdc.glb"])
def test_un_etage_ne_sort_jamais_du_dossier(plan, tmp_path, etage):
    with pytest.raises(plan.PlanRefuse):
        plan.ecrire_plan(tmp_path, etage, glb())


def test_ecriture_lecture_retrait(plan, tmp_path):
    octets = glb(b"maison")
    version = plan.ecrire_plan(tmp_path / "plans", "rdc", octets)
    assert version == plan.empreinte(octets)
    assert plan.lire_plan(tmp_path / "plans", "rdc") == octets
    assert not list((tmp_path / "plans").glob("*.tmp"))
    assert plan.supprimer_plan(tmp_path / "plans", "rdc") is True
    assert plan.lire_plan(tmp_path / "plans", "rdc") is None
    assert plan.supprimer_plan(tmp_path / "plans", "rdc") is False


def test_la_fiche_garde_les_liaisons(plan):
    avant = {"liens": {"maison": {"lampe": {"entite": "light.salon"}}}, "plans": {"etage": {"version": "x"}}}
    apres = plan.fiche(avant, "maison", "maison-3d.glb", glb())
    assert apres["liens"] == avant["liens"]
    assert apres["plans"]["maison"]["nom"] == "maison-3d.glb"
    assert apres["plans"]["etage"] == {"version": "x"}
    retire = plan.fiche(apres, "maison", None, None)
    assert "maison" not in retire["plans"] and retire["liens"] == avant["liens"]


class Flux:
    def __init__(self, octets, bloc=7):
        self.octets, self.bloc, self.pos = octets, bloc, 0

    async def read(self, n):
        n = min(n, self.bloc)
        morceau = self.octets[self.pos:self.pos + n]
        self.pos += n
        return morceau


def test_le_corps_s_arrete_des_la_limite(plan):
    assert asyncio.run(plan.lire_corps(Flux(b"abcdefghij"), limite=10)) == b"abcdefghij"
    with pytest.raises(plan.PlanRefuse):
        asyncio.run(plan.lire_corps(Flux(b"abcdefghijk"), limite=10))


# ── La vue HTTP, avec des doublures ─────────────────────────────────────────

class Reponse:
    def __init__(self, body=None, status=200, content_type=None, headers=None):
        self.body, self.status, self.content_type, self.headers = body, status, content_type, headers or {}


def _json_response(data, status=200):
    return Reponse(json.dumps(data).encode(), status, "application/json")


@pytest.fixture
def vue(plan, tmp_path, monkeypatch):
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

    class Magasin:
        def __init__(self):
            self.valeur = None

        async def async_modifier_shared(self, cle, f):
            assert cle == "loggia_plan3d"
            self.valeur = f(self.valeur)
            return self.valeur

    magasin = Magasin()
    v = plan.creer_vue(Hass(), magasin, tmp_path)
    v.magasin = magasin
    return v


class Requete(dict):
    def __init__(self, admin=True, corps=b"", query=None, headers=None):
        super().__init__(hass_user=types.SimpleNamespace(is_admin=admin))
        self.content = Flux(corps, bloc=1 << 16)
        self.query = query or {}
        self.headers = headers or {}


def test_la_vue_exige_une_connexion(vue):
    assert vue.requires_auth is True
    assert vue.url == "/api/loggia/plan/{etage}"


def test_un_compte_ordinaire_ne_depose_ni_ne_retire_rien(vue):
    r = asyncio.run(vue.post(Requete(admin=False, corps=glb()), "maison"))
    assert r.status == 403
    r = asyncio.run(vue.delete(Requete(admin=False), "maison"))
    assert r.status == 403
    assert vue.magasin.valeur is None


def test_depot_puis_lecture_puis_retrait(vue):
    octets = glb(b"plan")
    r = asyncio.run(vue.post(Requete(corps=octets, query={"nom": "ma-maison.glb"}), "rdc"))
    assert r.status == 200
    assert vue.magasin.valeur["plans"]["rdc"]["nom"] == "ma-maison.glb"
    r = asyncio.run(vue.get(Requete(admin=False), "rdc"))
    assert r.status == 200 and r.body == octets and r.content_type == "model/gltf-binary"
    etag = r.headers["ETag"]
    assert asyncio.run(vue.get(Requete(admin=False, headers={"If-None-Match": etag}), "rdc")).status == 304
    assert asyncio.run(vue.delete(Requete(), "rdc")).status == 200
    assert asyncio.run(vue.get(Requete(), "rdc")).status == 404
    assert "rdc" not in vue.magasin.valeur["plans"]


def test_un_depot_refuse_dit_pourquoi(vue):
    r = asyncio.run(vue.post(Requete(corps=b"pas un plan"), "maison"))
    assert r.status == 400 and json.loads(r.body)["code"] == "plan_format"
    assert asyncio.run(vue.get(Requete(), "../x")).status == 400
