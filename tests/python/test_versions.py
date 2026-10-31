"""Les versions precedentes de la configuration (29/10, ADR 0285).

Avant une ecriture, le magasin garde ce qui etait sur le disque : la
configuration entiere, au plus une copie par quart d'heure, les dix dernieres,
dans un fichier a part (`loggia_versions`). Deux commandes, reservees aux
administrateurs de Home Assistant, les listent et en remettent une — apres
avoir garde l'etat du moment, pour qu'on puisse revenir sur le retour.

Ce que ces tests tiennent : une rafale ne fait qu'une copie, celle d'avant la
rafale ; dix au plus ; rendre garde l'etat actuel ; un compte ordinaire est
refuse ; un fichier de versions illisible n'empeche jamais la configuration de
s'ecrire.
"""
from __future__ import annotations

import asyncio
import logging
import os
import sys

import pytest

from conftest import FauxStore, charger

if os.environ.get("CI"):
    import voluptuous as vol  # noqa: F401
else:
    vol = pytest.importorskip("voluptuous")

from test_websocket_api_execution import Connexion, Hass, envoyer  # noqa: E402

store_mod = charger("store")
versions = charger("versions")
code_admin = charger("code_admin")
appareils = charger("appareils")

T0 = 1_793_000_000.0  # lundi 26 octobre 2026, 07:33:20 UTC
QUART = 15 * 60


def lancer(coro):
    return asyncio.run(coro)


class Horloge:
    """L'heure des copies, avancee a la main."""

    def __init__(self, t=T0):
        self.t = t

    def __call__(self):
        return self.t


@pytest.fixture
def horloge(monkeypatch):
    h = Horloge()
    monkeypatch.setattr(versions, "_maintenant", h)
    return h


def magasin(creer_store, depart=None, depot=None):
    m = creer_store(depart if depart is not None else {
        "users": {}, "migrated": True, "schema": 2,
        "shared": {"loggia_rooms": ["Salon"]},
    })
    m._versions = versions.Versions(depot if depot is not None else FauxStore(None))
    return m


def copies(m):
    return (m._versions._depot.contenu or {}).get("versions", [])


def contenu(entree):
    return versions.decompresser(entree["contenu"])


async def ecrire(m, patch, compte="Papa"):
    return await m.async_set_user("u-papa", patch, is_admin=True, compte=compte)


# ── Une rafale, une copie ───────────────────────────────────────────────────

def test_une_rafale_ne_fait_qu_une_copie_celle_d_avant_la_rafale(creer_store, horloge):
    m = magasin(creer_store)

    async def scenario():
        for i, piece in enumerate(["Cuisine", "Bureau", "Garage", "Cave", "Grenier"]):
            horloge.t = T0 + i * 60  # cinq reglages en quatre minutes
            await ecrire(m, {"loggia_rooms": ["Salon", piece]})

    lancer(scenario())
    assert len(copies(m)) == 1, "une rafale de reglages ne fait qu'une copie"
    assert contenu(copies(m)[0])["shared"]["loggia_rooms"] == ["Salon"], "la copie est l'etat d'AVANT la rafale"
    assert m._store.contenu["shared"]["loggia_rooms"] == ["Salon", "Grenier"], "la configuration s'ecrit quand meme"

    # Un quart d'heure apres la derniere copie, une nouvelle rafale : sa copie.
    horloge.t = T0 + QUART + 1
    lancer(ecrire(m, {"loggia_rooms": ["Atelier"]}))
    assert len(copies(m)) == 2
    assert contenu(copies(m)[0])["shared"]["loggia_rooms"] == ["Salon", "Grenier"], "la plus recente en tete"


def test_une_copie_porte_sa_date_utc_son_compte_et_sa_taille(creer_store, horloge):
    m = magasin(creer_store)
    lancer(ecrire(m, {"loggia_rooms": ["Cuisine"]}, compte="Camille"))
    (e,) = copies(m)
    assert e["date"] == "2026-10-26T07:33:20+00:00", e["date"]
    assert e["compte"] == "Camille"
    assert e["motif"] == "ecriture"
    assert e["taille"] == len(versions.texte_de(contenu(e)).encode("utf-8"))
    assert isinstance(e["id"], str) and e["id"]
    # Un module du serveur ecrit sans compte : la copie n'en porte pas.
    horloge.t += QUART
    lancer(m.async_set_shared("loggia_nuit", {"heure": "23:00"}))
    assert copies(m)[0]["compte"] is None


def test_une_configuration_vide_ne_prend_pas_de_place(creer_store, horloge):
    m = magasin(creer_store, {"users": {}, "migrated": True, "schema": 2, "shared": {}})
    lancer(ecrire(m, {"loggia_rooms": ["Salon"]}))
    assert copies(m) == []


def test_une_ecriture_qui_ne_change_rien_ne_double_pas_la_copie(creer_store, horloge):
    m = magasin(creer_store)
    lancer(ecrire(m, {"loggia_rooms": ["Cuisine"]}))
    horloge.t += QUART + 1
    lancer(ecrire(m, {"loggia_rooms": ["Cuisine"]}))
    horloge.t += QUART + 1
    lancer(ecrire(m, {"loggia_rooms": ["Cuisine"]}))
    assert len(copies(m)) == 2, "deux fois le meme etat ne fait qu'une copie"


# ── Dix au plus ─────────────────────────────────────────────────────────────

def test_dix_copies_au_plus_les_plus_recentes(creer_store, horloge):
    m = magasin(creer_store)

    async def scenario():
        for i in range(14):
            horloge.t = T0 + i * (QUART + 1)
            await ecrire(m, {"loggia_rooms": ["Piece %d" % i]})

    lancer(scenario())
    liste = copies(m)
    assert len(liste) == versions.MAX_VERSIONS == 10
    # La plus recente garde l'etat d'avant la quatorzieme ecriture.
    assert contenu(liste[0])["shared"]["loggia_rooms"] == ["Piece 12"]
    assert contenu(liste[-1])["shared"]["loggia_rooms"] == ["Piece 3"], "les plus anciennes sont parties"
    dates = [e["date"] for e in liste]
    assert dates == sorted(dates, reverse=True)


def test_la_liste_ne_rend_pas_le_contenu(creer_store, horloge):
    m = magasin(creer_store)
    lancer(ecrire(m, {"loggia_rooms": ["Cuisine"]}))
    (e,) = lancer(m.async_versions())
    assert set(e) == {"id", "date", "compte", "taille", "motif"}


# ── Ce que la copie garde, et ce qu'un retour ne remet pas ──────────────────

def test_la_copie_garde_tout_sauf_le_code_et_ce_que_le_serveur_tient(creer_store, horloge):
    hache = code_admin.hacher("4321")
    m = magasin(creer_store, {
        "users": {"u-lea": {"loggia_active_user": 1, "loggia-navoffset": 12}},
        "migrated": True, "schema": 2,
        "shared": {"loggia_rooms": ["Salon"], code_admin.CLE_HACHE: hache,
                   "loggia_minuteurs": {"light.salon": 1}, "loggia_sirene_test": {"x": 1},
                   appareils.CLE_APPAREILS: [{"id": "tablette"}]},
    })
    lancer(ecrire(m, {"loggia_rooms": ["Cuisine"]}))
    copie = contenu(copies(m)[0])
    assert copie["users"] == {"u-lea": {"loggia_active_user": 1, "loggia-navoffset": 12}}, "la configuration par profil aussi"
    assert copie["shared"] == {"loggia_rooms": ["Salon"]}, "ni le code, ni les minuteurs, ni la sirene, ni les fiches d'appareil"


def test_les_cles_gardees_sont_celles_des_modules():
    assert "loggia_minuteurs" == charger("minuteurs").CLE
    assert "loggia_sirene_test" == charger("sirene").CLE
    assert appareils.CLE_APPAREILS in versions.GARDEES_AU_RETOUR
    assert {code_admin.CLE_CLAIR, code_admin.CLE_HACHE} <= versions.GARDEES_AU_RETOUR


# ── Rendre une copie ────────────────────────────────────────────────────────

def test_rendre_remet_la_copie_et_garde_d_abord_l_etat_actuel(creer_store, horloge, monkeypatch):
    hache = code_admin.hacher("4321")
    m = magasin(creer_store, {
        "users": {"u-lea": {"loggia_active_user": 1}}, "migrated": True, "schema": 2,
        "shared": {"loggia_rooms": ["Salon"], code_admin.CLE_HACHE: hache},
    })
    signaux = []
    monkeypatch.setattr(sys.modules["homeassistant.helpers.dispatcher"], "async_dispatcher_send",
                        lambda hass, signal, info: signaux.append(info))
    m.hass = object()
    lancer(ecrire(m, {"loggia_rooms": ["Cuisine"], "loggia_look": {"theme": "nuit"}}))
    lancer(m.async_set_user("u-lea", {"loggia_active_user": 2}, is_admin=False, compte="Lea"))
    (ancienne,) = copies(m)
    signaux.clear()

    horloge.t += 120  # dans le meme quart d'heure : rendre garde quand meme l'etat actuel
    resultat = lancer(m.async_rendre_version(ancienne["id"], compte="Papa"))
    disque = m._store.contenu
    assert disque["shared"]["loggia_rooms"] == ["Salon"], "la copie est remise"
    assert "loggia_look" not in disque["shared"], "ce qui n'existait pas dans la copie s'en va"
    assert disque["users"] == {"u-lea": {"loggia_active_user": 1}}, "les reglages par profil reviennent aussi"
    assert disque["shared"][code_admin.CLE_HACHE] == hache, "le code administrateur reste celui d'aujourd'hui"
    assert resultat["rendue"] == ancienne["id"]
    # Ce que l'ecran du retour oublie de son stockage local : les cles qui ont bouge, communes et par compte.
    assert resultat["cles"] == ["loggia_active_user", "loggia_look", "loggia_rooms"]

    liste = copies(m)
    assert len(liste) == 2
    assert liste[0]["motif"] == "retour" and liste[0]["compte"] == "Papa"
    actuel = contenu(liste[0])
    assert actuel["shared"] == {"loggia_rooms": ["Cuisine"], "loggia_look": {"theme": "nuit"}}, "l'etat d'avant le retour est garde"
    assert actuel["users"] == {"u-lea": {"loggia_active_user": 2}}

    # Les ecrans l'apprennent comme apres une ecriture : les cles, jamais les valeurs.
    communes = sorted(c for s in signaux for c in s.get("communes", []))
    assert communes == ["loggia_look", "loggia_rooms"], signaux
    assert {"user_id": "u-lea", "perso": ["loggia_active_user"], "communes": []} in signaux

    # Et l'on revient sur le retour.
    horloge.t += 60
    lancer(m.async_rendre_version(liste[0]["id"], compte="Papa"))
    assert m._store.contenu["shared"]["loggia_rooms"] == ["Cuisine"]
    assert m._store.contenu["users"] == {"u-lea": {"loggia_active_user": 2}}


def test_rendre_ne_touche_ni_aux_minuteurs_ni_aux_appareils_ni_a_la_regle_de_fuite(creer_store, horloge):
    m = magasin(creer_store, {
        "users": {}, "migrated": True, "schema": 2,
        "shared": {"loggia_rooms": ["Salon"],
                   "loggia_alertes": {"actions": {"vanne": {"actif": True}}, "seuil": 1}},
    })
    lancer(ecrire(m, {"loggia_rooms": ["Cuisine"],
                      "loggia_alertes": {"actions": {"vanne": {"actif": True}}, "seuil": 2}}))
    (ancienne,) = copies(m)
    # Depuis : un minuteur tourne, un ecran s'est declare, la regle de fuite a ete coupee par sa commande.
    lancer(m.async_set_shared("loggia_minuteurs", {"light.salon": 99}))
    lancer(m.async_modifier_shared("loggia_alertes", lambda v: {**v, "actions": {"vanne": {"actif": False}}}))
    lancer(m.async_modifier_shared(appareils.CLE_APPAREILS, lambda v: [{"id": "tablette"}]))
    lancer(m.async_rendre_version(ancienne["id"], compte="Papa"))
    commun = m._store.contenu["shared"]
    assert commun["loggia_rooms"] == ["Salon"]
    assert commun["loggia_alertes"]["seuil"] == 1, "les alertes reviennent"
    assert commun["loggia_alertes"]["actions"]["vanne"]["actif"] is False, "« Fermer en cas de fuite » ne change que par sa commande"
    assert commun["loggia_minuteurs"] == {"light.salon": 99}, "un minuteur qui tourne n'appartient a aucune copie"
    assert commun[appareils.CLE_APPAREILS] == [{"id": "tablette"}]


def test_rendre_une_copie_inconnue_nomme_son_refus(creer_store, horloge):
    m = magasin(creer_store)
    lancer(ecrire(m, {"loggia_rooms": ["Cuisine"]}))
    with pytest.raises(store_mod.RefusNomme) as err:
        lancer(m.async_rendre_version("nimporte", compte="Papa"))
    assert err.value.code == "version_inconnue"
    assert m._store.contenu["shared"]["loggia_rooms"] == ["Cuisine"], "rien n'a bouge"


def test_rendre_refuse_si_l_etat_actuel_ne_peut_pas_etre_garde(creer_store, horloge):
    class DepotFragile(FauxStore):
        casse = False

        async def async_save(self, data):
            if self.casse:
                raise OSError("disque plein")
            await super().async_save(data)

    depot = DepotFragile(None)
    m = magasin(creer_store, depot=depot)
    lancer(ecrire(m, {"loggia_rooms": ["Cuisine"]}))
    (ancienne,) = copies(m)
    depot.casse = True
    with pytest.raises(store_mod.RefusNomme) as err:
        lancer(m.async_rendre_version(ancienne["id"], compte="Papa"))
    assert err.value.code == "versions_indisponibles"
    assert m._store.contenu["shared"]["loggia_rooms"] == ["Cuisine"], "sans copie de l'etat actuel, pas de retour"


# ── Robustesse : un fichier de versions qui lache ───────────────────────────

class DepotIllisible(FauxStore):
    """Un `Store` dont la lecture leve - droits, disque, version inconnue."""

    def __init__(self, path=None):
        super().__init__(None)
        self.path = path

    async def async_load(self):
        raise OSError("lecture impossible")


def test_un_fichier_de_versions_illisible_n_empeche_pas_d_ecrire(creer_store, horloge, caplog, tmp_path):
    fichier = tmp_path / "loggia_versions"
    fichier.write_text("{ abime", encoding="utf-8")
    depot = DepotIllisible(str(fichier))
    m = magasin(creer_store, depot=depot)
    caplog.set_level(logging.ERROR)
    lancer(ecrire(m, {"loggia_rooms": ["Cuisine"]}))
    assert m._store.contenu["shared"]["loggia_rooms"] == ["Cuisine"], "la configuration s'ecrit quand meme"
    assert depot.ecritures == 0, "la copie se saute"
    assert any("versions" in r.getMessage() for r in caplog.records if r.levelno >= logging.ERROR), "l'erreur va au journal"
    mis_de_cote = [p.name for p in tmp_path.iterdir() if p.name.startswith("loggia_versions.corrupt.")]
    assert len(mis_de_cote) == 1, "le fichier illisible est copie a cote avant tout"
    assert fichier.read_text(encoding="utf-8") == "{ abime", "jamais deplace ni ecrase"
    # Mis de cote, le fichier repart vide : la rafale suivante a sa copie.
    horloge.t += QUART + 1
    lancer(ecrire(m, {"loggia_rooms": ["Bureau"]}))
    assert len(depot.contenu["versions"]) == 1


def test_un_fichier_de_versions_qu_on_ne_peut_pas_mettre_de_cote_n_est_jamais_ecrase(creer_store, horloge, caplog):
    depot = DepotIllisible(None)  # pas de chemin : rien a copier, donc rien a ecraser
    m = magasin(creer_store, depot=depot)
    caplog.set_level(logging.ERROR)
    for i in range(3):
        horloge.t += QUART + 1
        lancer(ecrire(m, {"loggia_rooms": ["Piece %d" % i]}))
    assert m._store.contenu["shared"]["loggia_rooms"] == ["Piece 2"]
    assert depot.ecritures == 0
    with pytest.raises(store_mod.RefusNomme) as err:
        lancer(m.async_versions())
    assert err.value.code == "versions_indisponibles"


def test_une_copie_qui_ne_s_ecrit_pas_n_empeche_pas_d_ecrire(creer_store, horloge, caplog):
    class DepotPlein(FauxStore):
        async def async_save(self, data):
            raise OSError("disque plein")

    m = magasin(creer_store, depot=DepotPlein(None))
    caplog.set_level(logging.ERROR)
    lancer(ecrire(m, {"loggia_rooms": ["Cuisine"]}))
    assert m._store.contenu["shared"]["loggia_rooms"] == ["Cuisine"]
    assert any(r.levelno >= logging.ERROR for r in caplog.records)


def test_une_copie_abimee_se_refuse_sans_rien_toucher(creer_store, horloge):
    m = magasin(creer_store)
    lancer(ecrire(m, {"loggia_rooms": ["Cuisine"]}))
    m._versions._depot.contenu["versions"][0]["contenu"] = "pas du zlib"
    m._versions._liste = None  # relu du disque
    ident = m._versions._depot.contenu["versions"][0]["id"]
    with pytest.raises(store_mod.RefusNomme) as err:
        lancer(m.async_rendre_version(ident, compte="Papa"))
    assert err.value.code == "version_illisible"
    assert m._store.contenu["shared"]["loggia_rooms"] == ["Cuisine"]


def test_la_compression_aller_retour():
    etat = {"users": {"u": {"loggia-navoffset": 3}}, "shared": {"loggia_rooms": ["Séjour"] * 50}}
    texte, taille, empreinte = versions.compresser(etat)
    assert versions.decompresser(texte) == etat
    assert taille == len(versions.texte_de(etat).encode("utf-8"))
    assert len(texte) < taille, "compresse, une copie prend moins que la configuration"
    assert versions.compresser(etat)[2] == empreinte, "la meme configuration, la meme empreinte"


# ── Les commandes : reservees aux administrateurs de Home Assistant ─────────

@pytest.fixture
def banc(creer_store, horloge):
    module = charger("websocket_api")
    m = magasin(creer_store)
    hass = Hass()
    module.async_register(hass, m)
    return hass, m


def test_un_compte_ordinaire_ne_liste_ni_ne_rend(banc):
    hass, m = banc
    lancer(ecrire(m, {"loggia_rooms": ["Cuisine"]}))
    ident = copies(m)[0]["id"]
    cx = Connexion(uid="u-lea", admin=False)
    lancer(envoyer(hass, cx, {"id": 1, "type": "loggia/versions/liste"}))
    lancer(envoyer(hass, cx, {"id": 2, "type": "loggia/versions/rendre", "version": ident}))
    assert [e[1] for e in cx.erreurs] == ["unauthorized", "unauthorized"], cx.erreurs
    assert cx.resultats == []
    assert m._store.contenu["shared"]["loggia_rooms"] == ["Cuisine"]


def test_un_administrateur_liste_et_rend(banc):
    hass, m = banc
    lancer(ecrire(m, {"loggia_rooms": ["Cuisine"]}))
    admin = Connexion(uid="u-papa", admin=True)
    lancer(envoyer(hass, admin, {"id": 3, "type": "loggia/versions/liste"}))
    assert admin.erreurs == []
    ((_, reponse),) = admin.resultats
    (entree,) = reponse["versions"]
    assert "contenu" not in entree
    lancer(envoyer(hass, admin, {"id": 4, "type": "loggia/versions/rendre", "version": entree["id"]}))
    assert admin.erreurs == [], admin.erreurs
    assert m._store.contenu["shared"]["loggia_rooms"] == ["Salon"]
    assert copies(m)[0]["compte"] == "u-papa", "le nom du compte vient de la connexion"
    # Un refus nomme son code.
    lancer(envoyer(hass, admin, {"id": 5, "type": "loggia/versions/rendre", "version": "inconnue"}))
    assert [e[1] for e in admin.erreurs] == ["version_inconnue"]
