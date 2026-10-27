"""Un compte Home Assistant = son profil Loggia (ADR 0276, ticket #38).

« Si sur son téléphone il est connecté à Home Assistant avec son compte, ça
doit charger son profil, point. »
"""
from __future__ import annotations

import asyncio

import pytest

from conftest import charger

profils = charger("profils")

MOI, EPOUSE, AUTRE = "compte-moi", "compte-epouse", "compte-autre"


def lancer(coro):
    return asyncio.run(coro)


def test_le_ticket_38_l_administrateur_retrouve_le_profil_admin_libre():
    # Une installation : le profil par défaut, et celui de l'épouse.
    liste = [{"name": "Administrateur", "role": "Admin"}, {"name": "Marie", "role": "Famille"}]
    i, liste, change = profils.profil_du_compte(liste, MOI, "Giorgio", True)
    assert i == 0 and change, "l'administrateur ne retrouve pas le profil Admin de son installation"
    assert liste[0]["haId"] == MOI
    # L'épouse, au compte ordinaire, relie le sien par le nom — depuis SON compte.
    j, liste, change = profils.profil_du_compte(liste, EPOUSE, "Marie", False)
    assert j == 1 and change and liste[1]["haId"] == EPOUSE
    # Ensuite, chacun retrouve le sien sans rien réécrire.
    assert profils.profil_du_compte(liste, MOI, "Giorgio", True)[::2] == (0, False)
    assert profils.profil_du_compte(liste, EPOUSE, "Marie", False)[::2] == (1, False)


def test_un_compte_sans_profil_en_recoit_un_a_son_nom():
    liste = [{"name": "Guillaume", "role": "Admin", "haId": MOI}]
    i, liste, change = profils.profil_du_compte(liste, EPOUSE, "Clara", False)
    assert change and i == 1
    assert liste[1]["name"] == "Clara" and liste[1]["role"] == "Famille" and liste[1]["haId"] == EPOUSE
    assert liste[1]["droits"] == [] and liste[1]["vues"] == []
    assert liste[1]["c"].startswith("var(--o-"), "une couleur en dur"


def test_jamais_un_profil_admin_pour_un_compte_qui_ne_l_est_pas():
    # Un profil Admin libre du même nom n'est pas repris par un compte ordinaire.
    liste = [{"name": "Luna", "role": "Admin"}]
    i, liste, change = profils.profil_du_compte(liste, EPOUSE, "Luna", False)
    assert i == 1 and liste[1]["role"] == "Famille", "un compte ordinaire s'est vu donner un profil Admin"
    assert "haId" not in liste[0]
    # Ni le profil Admin libre « d'installation ».
    i, liste, _ = profils.profil_du_compte([{"name": "Administrateur", "role": "Admin"}], AUTRE, "Invité", False)
    assert i == 1 and liste[1]["role"] == "Famille"
    # Un compte qui a perdu son rôle d'administrateur ne rouvre pas son profil Admin.
    i, liste, _ = profils.profil_du_compte([{"name": "Ex", "role": "Admin", "haId": AUTRE}], AUTRE, "Ex", False)
    assert i == 1 and liste[1]["role"] == "Famille"


def test_deux_profils_admin_libres_ne_se_devinent_pas():
    liste = [{"name": "A", "role": "Admin"}, {"name": "B", "role": "Admin"}]
    i, liste, _ = profils.profil_du_compte(liste, MOI, "Giorgio", True)
    assert i == 2 and liste[2]["role"] == "Admin", "un profil Admin a été pris au hasard"


def test_le_nom_se_compare_sans_casse_ni_espaces():
    i, liste, _ = profils.profil_du_compte([{"name": " clara ", "role": "Famille"}], EPOUSE, "Clara", False)
    assert i == 0 and liste[0]["haId"] == EPOUSE


def test_sans_compte_rien_ne_se_fait():
    with pytest.raises(ValueError):
        profils.profil_du_compte([], "", "X", False)


def test_le_magasin_relie_une_fois_et_le_signale(creer_store):
    magasin = creer_store({"users": {}, "migrated": True, "shared": {"loggia_users": [{"name": "Administrateur", "role": "Admin"}]}})
    signaux = []
    magasin._signaler = lambda user_id, perso=(), communes=(): signaux.append(list(communes))
    res = lancer(magasin.async_profil_du_compte(MOI, "Giorgio", True))
    assert res["index"] == 0 and res["cree"] is True
    assert lancer(magasin._load())["shared"]["loggia_users"][0]["haId"] == MOI
    assert signaux == [["loggia_users"]]
    ecritures = magasin._store.ecritures
    res = lancer(magasin.async_profil_du_compte(MOI, "Giorgio", True))
    assert res["cree"] is False and magasin._store.ecritures == ecritures, "chaque ouverture réécrit la liste"
