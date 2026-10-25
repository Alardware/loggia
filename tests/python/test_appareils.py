"""Le profil appartient a l'ecran (ADR 0220).

Un seul compte Home Assistant sur le PC et la tablette : changer de profil sur
l'un le changeait en silence sur l'autre. Chaque ecran a desormais sa fiche
dans `loggia_appareils`, et n'ecrit que la sienne.
"""
from __future__ import annotations

import asyncio
import time
import types

import pytest

from conftest import charger

try:
    import voluptuous as vol
except ImportError:  # pragma: no cover
    vol = pytest.importorskip("voluptuous")

from doublures_ha import poser_websocket_api  # noqa: E402

poser_websocket_api(vol)

appareils = charger("appareils")

TABLETTE = "tablette0001"
PC = "ordinateur01"
MAINTENANT = 1_760_700_000_000


def lancer(coro):
    return asyncio.run(coro)


# ── La fusion : ce qui part de l'ecran, ce qui reste rangé ──────────────────

def test_chaque_ecran_garde_son_profil():
    rangees = appareils.fusionner({}, {TABLETTE: {"profil": "1", "format": "tablette"}},
                                  compte="famille", is_admin=False, maintenant=MAINTENANT)
    rangees = appareils.fusionner(rangees, {PC: {"profil": "0", "format": "pc"}},
                                  compte="famille", is_admin=False, maintenant=MAINTENANT + 1)
    assert rangees[TABLETTE]["profil"] == "1", "le PC a repris le profil de la tablette"
    assert rangees[PC]["profil"] == "0"


def test_une_fiche_ne_touche_que_ses_champs():
    depart = {TABLETTE: {"profil": "1", "format": "tablette", "nom": "Cuisine", "vu": 5}}
    rangees = appareils.fusionner(depart, {TABLETTE: {"profil": "2"}},
                                  compte="famille", is_admin=False, maintenant=MAINTENANT)
    assert rangees[TABLETTE]["nom"] == "Cuisine"
    assert rangees[TABLETTE]["format"] == "tablette"
    assert rangees[TABLETTE]["profil"] == "2"
    assert rangees[TABLETTE]["vu"] == MAINTENANT


@pytest.mark.parametrize("demande", [
    {"court": {"profil": "1"}},                  # identifiant trop court
    {"Tablette0001": {"profil": "1"}},           # majuscule
    {TABLETTE: {"profil": "admin"}},             # profil qui n'est pas un rang
    {TABLETTE: {"profil": 1}},                   # rang non textuel
    {TABLETTE: {"format": "television"}},
    {TABLETTE: "1"},
    ["pas", "une", "liste"],
])
def test_une_forme_invalide_est_refusee(demande):
    with pytest.raises(ValueError):
        appareils.fusionner({}, demande, compte="famille", is_admin=False, maintenant=MAINTENANT)


def test_retirer_l_appareil_d_un_autre_compte_est_reserve():
    depart = {TABLETTE: {"profil": "1", "compte": "luna", "vu": MAINTENANT}}
    with pytest.raises(ValueError):
        appareils.fusionner(depart, {TABLETTE: None}, compte="invite", is_admin=False, maintenant=MAINTENANT)
    assert appareils.fusionner(depart, {TABLETTE: None}, compte="luna", is_admin=False, maintenant=MAINTENANT) == {}
    assert appareils.fusionner(depart, {TABLETTE: None}, compte="papa", is_admin=True, maintenant=MAINTENANT) == {}


def test_un_anonyme_oublie_s_en_va_un_nomme_reste():
    vieux = MAINTENANT - appareils.OUBLI_ANONYME_MS - 1
    depart = {
        "anonyme0001": {"profil": "0", "vu": vieux},
        "nomme000001": {"profil": "0", "nom": "Tablette cuisine", "vu": vieux},
    }
    rangees = appareils.fusionner(depart, {PC: {"profil": "0"}}, compte="u", is_admin=False, maintenant=MAINTENANT)
    assert "anonyme0001" not in rangees
    assert "nomme000001" in rangees


def test_l_ecran_ne_lit_pas_le_compte():
    vu = appareils.pour_l_ecran({TABLETTE: {"profil": "1", "compte": "luna", "vu": 3}})
    assert vu == {TABLETTE: {"profil": "1", "vu": 3}}


def test_la_mise_en_page_propre_est_un_choix_oui_ou_non():
    rangees = appareils.fusionner({}, {TABLETTE: {"propre": True, "nom": "  Tablette cuisine  "}},
                                  compte="famille", is_admin=False, maintenant=MAINTENANT)
    assert rangees[TABLETTE]["propre"] is True
    assert rangees[TABLETTE]["nom"] == "Tablette cuisine"
    with pytest.raises(ValueError):
        appareils.fusionner({}, {TABLETTE: {"propre": "oui"}}, compte="famille", is_admin=False, maintenant=MAINTENANT)
    # Sa propre apparence (ADR 0223) : un autre choix, independant du premier.
    rangees = appareils.fusionner(rangees, {TABLETTE: {"apparence": True}}, compte="famille", is_admin=False, maintenant=MAINTENANT)
    assert rangees[TABLETTE]["apparence"] is True and rangees[TABLETTE]["propre"] is True
    with pytest.raises(ValueError):
        appareils.fusionner({}, {TABLETTE: {"apparence": 1}}, compte="famille", is_admin=False, maintenant=MAINTENANT)


def test_profils_vises():
    assert appareils.profils_vises({TABLETTE: {"profil": "0"}, PC: None}) == ["0"]
    assert appareils.profils_vises(None) == []


# ── Le magasin : la fiche est de la maison, ouverte a tous ──────────────────

def test_un_compte_ordinaire_ecrit_sa_fiche_sans_effacer_les_autres(creer_store):
    recent = int(time.time() * 1000)
    magasin = creer_store({"users": {}, "migrated": True, "shared": {
        "loggia_appareils": {PC: {"profil": "0", "compte": "famille", "vu": recent}}}})
    rendu = lancer(magasin.async_set_user("famille", {"loggia_appareils": {TABLETTE: {"profil": "1"}}}, is_admin=False))
    data = lancer(magasin._load())
    assert set(data["shared"]["loggia_appareils"]) == {PC, TABLETTE}, "une fiche a effacé l'autre"
    assert data["shared"]["loggia_appareils"][TABLETTE]["compte"] == "famille"
    assert "loggia_appareils" not in data["users"].get("famille", {})
    assert "compte" not in rendu["loggia_appareils"][TABLETTE], "le compte est revenu à l'écran"


def test_la_lecture_cache_le_compte(creer_store):
    magasin = creer_store({"users": {}, "migrated": True, "shared": {
        "loggia_appareils": {PC: {"profil": "0", "compte": "famille", "vu": 1}}}})
    config = lancer(magasin.async_get_user("autre"))
    assert config["loggia_appareils"] == {PC: {"profil": "0", "vu": 1}}


def test_tout_retirer_reste_reserve(creer_store, store_module):
    magasin = creer_store({"users": {}, "migrated": True, "shared": {
        "loggia_appareils": {PC: {"profil": "0", "compte": "famille", "vu": 1}}}})
    with pytest.raises(store_module.MaisonReserveeError):
        lancer(magasin.async_set_user("famille", {"loggia_appareils": None}, is_admin=False))
    lancer(magasin.async_set_user("papa", {"loggia_appareils": None}, is_admin=True))
    assert "loggia_appareils" not in lancer(magasin._load())["shared"]


# ── La garde du profil Admin passe aussi par la fiche (ADR 0080) ────────────

PROFILS = [{"name": "Papa", "role": "Admin"}, {"name": "Léa", "role": "Famille"}]


class Hass:
    def __init__(self):
        self.commandes = {}
        self.data = {}

    async def async_add_executor_job(self, fonction, *args):
        return fonction(*args)


class Connexion:
    def __init__(self, uid="u-lea", admin=False):
        self.user = types.SimpleNamespace(id=uid, name=uid, is_admin=admin, is_owner=False, permissions=None)
        self.resultats = []
        self.erreurs = []

    def send_result(self, mid, resultat=None):
        self.resultats.append((mid, resultat))

    def send_error(self, mid, code, message):
        self.erreurs.append((mid, code, message))


async def envoyer(hass, cx, message):
    commande = hass.commandes[message["type"]]
    msg = commande._ws_schema(message)
    retour = commande(hass, cx, msg)
    if asyncio.iscoroutine(retour):
        await retour


@pytest.fixture
def banc(creer_store):
    module = charger("websocket_api")
    magasin = creer_store({"users": {}, "migrated": True, "shared": {"loggia_users": PROFILS}})
    hass = Hass()
    module.async_register(hass, magasin)
    return types.SimpleNamespace(hass=hass, store=magasin)


def test_passer_un_ecran_sur_un_profil_admin_demande_le_code(banc):
    cx = Connexion(admin=False)
    vers_papa = {"id": 1, "type": "loggia/config/set",
                 "config": {"loggia_appareils": {TABLETTE: {"profil": "0"}}}}
    lancer(envoyer(banc.hass, cx, vers_papa))
    assert [e[1] for e in cx.erreurs] == ["code_admin_requis"], cx.erreurs
    assert "loggia_appareils" not in lancer(banc.store._load())["shared"]
    # Vers un profil ordinaire : accepte, sans code.
    lancer(envoyer(banc.hass, cx, {"id": 2, "type": "loggia/config/set",
                                   "config": {"loggia_appareils": {TABLETTE: {"profil": "1"}}}}))
    assert len(cx.erreurs) == 1, cx.erreurs
    assert lancer(banc.store._load())["shared"]["loggia_appareils"][TABLETTE]["profil"] == "1"
    # Le code verifie ouvre le passage, comme pour `loggia_active_user`.
    lancer(envoyer(banc.hass, cx, {"id": 3, "type": "loggia/pin/verifier", "pin": "0000"}))
    lancer(envoyer(banc.hass, cx, {**vers_papa, "id": 4}))
    assert len(cx.erreurs) == 1, cx.erreurs


def test_un_administrateur_n_a_rien_a_prouver(banc):
    cx = Connexion(uid="u-papa", admin=True)
    lancer(envoyer(banc.hass, cx, {"id": 1, "type": "loggia/config/set",
                                   "config": {"loggia_appareils": {PC: {"profil": "0"}}}}))
    assert not cx.erreurs, cx.erreurs
