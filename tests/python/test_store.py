"""Tests du stockage de configuration.

`store.py` concentre les risques de PERTE DE DONNEES : il fusionne une partie
commune a toute la maison avec la partie propre a chaque compte, et il fait
remonter une configuration existante vers le commun. Chaque defaut trouve lors
de l'audit du 23/08 a sa contre-epreuve ci-dessous, pour qu'il ne revienne pas
silencieusement.
"""
from __future__ import annotations

import asyncio

import pytest


def lancer(coro):
    """Execute une coroutine dans un contexte neuf."""
    return asyncio.run(coro)


# ── Repartition commun / personnel ──────────────────────────────────────────

def test_admin_ecrit_dans_le_commun(creer_store):
    magasin = creer_store({"users": {}, "shared": {}, "migrated": True})
    lancer(magasin.async_set_user("u1", {"loggia_rooms": ["Salon"]}, is_admin=True))
    data = lancer(magasin._load())
    assert data["shared"]["loggia_rooms"] == ["Salon"]
    assert "loggia_rooms" not in data["users"].get("u1", {})


def test_non_admin_n_ecrit_que_chez_lui(creer_store):
    """Le point de securite : sans cela, tout compte authentifie reecrivait le
    dashboard de toute la maison — et pouvait se donner le role admin en
    reecrivant `loggia_users`."""
    magasin = creer_store({"users": {}, "shared": {"loggia_rooms": ["Salon"]}, "migrated": True})
    lancer(magasin.async_set_user(
        "intrus",
        {"loggia_rooms": ["PIRATE"], "loggia_users": [{"role": "Admin"}]},
        is_admin=False,
    ))
    data = lancer(magasin._load())
    assert data["shared"]["loggia_rooms"] == ["Salon"], "le commun a ete altere"
    assert "loggia_users" not in data["shared"], "un non-admin a injecte un profil admin"
    # Ses reglages ne sont pas perdus pour autant : ils valent pour lui seul.
    assert data["users"]["intrus"]["loggia_rooms"] == ["PIRATE"]


def test_cles_personnelles_restent_personnelles(creer_store):
    magasin = creer_store({"users": {}, "shared": {}, "migrated": True})
    lancer(magasin.async_set_user(
        "u1", {"loggia_active_user": 2, "loggia-secpanel": "0"}, is_admin=True))
    data = lancer(magasin._load())
    assert data["users"]["u1"]["loggia_active_user"] == 2
    assert data["shared"] == {}, "un reglage d'appareil a fui dans le commun"


def test_le_personnel_prime_a_la_lecture(creer_store):
    magasin = creer_store({
        "users": {"u1": {"t": "moi"}},
        "shared": {"t": "maison", "z": "commun"},
        "migrated": True,
    })
    assert lancer(magasin.async_get_user("u1")) == {"t": "moi", "z": "commun"}


# ── `replace` : le defaut qui effacait la maison ────────────────────────────

def test_replace_admin_ne_vide_pas_le_commun(creer_store):
    """`replace` ne remet a zero QUE la section de l'appelant. Il vidait
    `shared`, donc le dashboard de tous les autres comptes, sur un seul appel."""
    magasin = creer_store({
        "users": {"u1": {"vieux": 1}},
        "shared": {"loggia_rooms": ["Salon"]},
        "migrated": True,
    })
    lancer(magasin.async_set_user("u1", {"loggia-secpanel": "0"}, replace=True, is_admin=True))
    data = lancer(magasin._load())
    assert data["shared"]["loggia_rooms"] == ["Salon"], "la maison a ete effacee"
    assert "vieux" not in data["users"]["u1"], "la section personnelle n'a pas ete remplacee"


def test_replace_non_admin_ne_touche_pas_au_commun(creer_store):
    magasin = creer_store({"users": {}, "shared": {"a": 1}, "migrated": True})
    lancer(magasin.async_set_user("u2", {}, replace=True, is_admin=False))
    assert lancer(magasin._load())["shared"] == {"a": 1}


# ── Effacement et changement de categorie ──────────────────────────────────

def test_valeur_nulle_efface_des_deux_cotes(creer_store):
    magasin = creer_store({
        "users": {"u1": {"k": "perso"}}, "shared": {"k": "commun"}, "migrated": True,
    })
    lancer(magasin.async_set_user("u1", {"k": None}, is_admin=True))
    data = lancer(magasin._load())
    assert "k" not in data["shared"] and "k" not in data["users"]["u1"]


def test_cle_devenue_personnelle_ne_laisse_pas_d_orpheline(creer_store):
    """Une valeur restee dans le commun serait invisible mais agissante pour
    tous les autres comptes."""
    magasin = creer_store({
        "users": {"u1": {}}, "shared": {"loggia-secpanel": "vieux"}, "migrated": True,
    })
    lancer(magasin.async_set_user("u1", {"loggia-secpanel": "0"}, is_admin=True))
    data = lancer(magasin._load())
    assert "loggia-secpanel" not in data["shared"]
    assert data["users"]["u1"]["loggia-secpanel"] == "0"


def test_le_pin_est_refuse(creer_store, store_module):
    """Le code administrateur reste dans le navigateur : le projet interdit de
    le synchroniser, et il n'a rien a faire dans un fichier serveur."""
    assert "loggia_admin_pin" in store_module.FORBIDDEN_KEYS
    magasin = creer_store({"users": {}, "shared": {}, "migrated": True})
    lancer(magasin.async_set_user("u1", {"loggia_admin_pin": "1234"}, is_admin=True))
    data = lancer(magasin._load())
    assert "loggia_admin_pin" not in data["shared"]
    assert "loggia_admin_pin" not in data["users"].get("u1", {})


# ── Migration ───────────────────────────────────────────────────────────────

def test_migration_remonte_et_purge_la_source(creer_store):
    """La source gardait une copie de chaque cle remontee — et cette copie,
    prioritaire a la lecture, masquait pour ce compte toute mise a jour faite
    ensuite par un autre."""
    magasin = creer_store({"users": {"u1": {
        "loggia_rooms": ["Salon"], "loggia_look": "x", "loggia_active_user": 0,
    }}})
    data = lancer(magasin._load())
    assert data["shared"]["loggia_rooms"] == ["Salon"]
    assert "loggia_rooms" not in data["users"]["u1"], "doublon laisse dans la source"
    assert data["users"]["u1"]["loggia_active_user"] == 0, "le personnel a ete emporte"


def test_migration_ne_se_rejoue_pas_apres_effacement(creer_store):
    """Une partie commune vide est un etat LEGITIME. S'en servir de temoin
    ressuscitait au redemarrage ce qu'un administrateur venait d'effacer.

    Le second compte porte volontairement des cles communes : la migration ne
    purge QUE la source qu'elle a choisie, donc sans lui un rejeu ne remonterait
    rien et passerait inapercu — le test ne prouverait alors plus rien.
    """
    magasin = creer_store({"users": {
        "u1": {"loggia_rooms": ["Salon"], "loggia_look": "x", "loggia_active_user": 0},
        "u2": {"loggia_rooms": ["Ancien"], "loggia_entities": {"a": 1}},
    }})
    lancer(magasin._load())
    apres = magasin._store.contenu
    assert apres["shared"], "la premiere migration n'a rien remonte"
    assert apres["users"]["u2"]["loggia_rooms"] == ["Ancien"], "u2 n'a pas ete epargne"

    apres["shared"] = {}                      # l'admin a tout efface
    magasin2 = creer_store(apres)
    assert lancer(magasin2._load())["shared"] == {}, "la migration a rejoue"


def test_migration_marquee_meme_sans_rien_a_remonter(creer_store):
    magasin = creer_store({"users": {"u1": {"loggia_active_user": 0}}})
    assert lancer(magasin._load())["migrated"] is True


def test_premier_demarrage_sans_fichier(creer_store):
    data = lancer(creer_store(None)._load())
    assert data["users"] == {} and data["shared"] == {}


def test_contenu_illisible_ne_casse_rien(creer_store):
    """Un `.storage` corrompu ou d'une version anterieure ne doit pas empecher
    Home Assistant de demarrer."""
    for depart in ([], "texte", {"users": "pas un dict"}, {"shared": 42}):
        data = lancer(creer_store(depart)._load())
        assert isinstance(data["users"], dict) and isinstance(data["shared"], dict)


# ── Reprise de la configuration ecrite sous l'ancien nom ────────────────────

def test_reprise_de_l_ancien_fichier(creer_store):
    """Renommer le projet ne doit pas repartir d'un dashboard vide."""
    magasin = creer_store(None, ancien={
        "users": {"u1": {"orion_active_user": 2, "orion-secpanel": "0"}},
        "shared": {"orion_rooms": ["Salon"], "orion-theme": "sombre"},
        "migrated": True,
    })
    data = lancer(magasin._load())
    assert data["shared"]["loggia_rooms"] == ["Salon"]
    assert data["shared"]["loggia-theme"] == "sombre"
    assert data["users"]["u1"]["loggia_active_user"] == 2
    assert data["users"]["u1"]["loggia-secpanel"] == "0"
    assert not [k for k in data["shared"] if k.startswith("orion")]
    assert magasin._store.ecritures == 1, "la reprise n'a pas ete enregistree"


def test_reprise_ignoree_si_le_nouveau_fichier_existe(creer_store):
    """Une fois la reprise faite, l'ancien fichier ne doit plus rien dicter."""
    magasin = creer_store(
        {"users": {}, "shared": {"loggia_rooms": ["Neuf"]}, "migrated": True},
        ancien={"users": {}, "shared": {"orion_rooms": ["Vieux"]}, "migrated": True},
    )
    assert lancer(magasin._load())["shared"]["loggia_rooms"] == ["Neuf"]


def test_sans_ancien_fichier_on_demarre_a_vide(creer_store):
    data = lancer(creer_store(None)._load())
    assert data["users"] == {} and data["shared"] == {}


# ── Suppression ─────────────────────────────────────────────────────────────

def test_suppression_epargne_le_commun(creer_store):
    """Effacer depuis un appareil ne doit pas vider le dashboard des autres."""
    magasin = creer_store({
        "users": {"u1": {"a": 1}}, "shared": {"loggia_rooms": ["Salon"]}, "migrated": True,
    })
    lancer(magasin.async_delete_user("u1"))
    data = lancer(magasin._load())
    assert "u1" not in data["users"]
    assert data["shared"]["loggia_rooms"] == ["Salon"]


# ── Garde-fous et concurrence ───────────────────────────────────────────────

def test_trop_de_cles_est_refuse(creer_store, store_module):
    magasin = creer_store({"users": {}, "shared": {}, "migrated": True})
    trop = {f"loggia-k{i}panel": i for i in range(store_module.MAX_KEYS_PER_USER + 5)}
    with pytest.raises(ValueError):
        lancer(magasin.async_set_user("u1", trop, is_admin=True))


def test_ecritures_concurrentes_ne_se_perdent_pas(creer_store):
    """Vingt ecritures simultanees doivent toutes se retrouver.

    ATTENTION a ce que ce test prouve : il verifie qu'aucune n'est perdue, PAS
    que le verrou fonctionne. Retirer `async with self._lock` le laisse passer,
    verifie par mutation — parce qu'entre la lecture et la mutation de l'etat il
    n'y a aucun `await`, donc rien ne s'entrelace, doublure ou pas.

    Le verrou protege la fenetre pendant laquelle le VRAI `Store` serialise le
    dictionnaire dans un fil separe, alors que la boucle continue de tourner.
    Aucune doublure ne reproduit fidelement cette fenetre : ce point-la releve
    de la relecture, pas du test.
    """
    magasin = creer_store({"users": {}, "shared": {}, "migrated": True})

    async def scenario():
        await asyncio.gather(*(
            magasin.async_set_user("u1", {f"loggia_c{i}": i}, is_admin=True)
            for i in range(20)
        ))
        return await magasin._load()

    data = lancer(scenario())
    for i in range(20):
        assert data["shared"][f"loggia_c{i}"] == i, f"ecriture {i} perdue"


def test_classement_des_cles(store_module):
    est_perso = store_module.est_personnelle
    for cle in ("loggia_active_user", "loggia-navoffset", "loggia-topoffset",
                "loggia-lastseen", "loggia-secpanel", "loggia-enpanel"):
        assert est_perso(cle), f"{cle} devrait rester sur l'appareil"
    for cle in ("loggia_rooms", "loggia_entities", "loggia_users", "loggia-theme",
                "loggia_energyHaids", "loggia_roomlayout"):
        assert not est_perso(cle), f"{cle} devrait etre commun a la maison"
