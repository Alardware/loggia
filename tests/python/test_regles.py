"""Le socle commun des regles.

Trois mecaniques y vivent, et chacune corrige un defaut constate :

  * le JOURNAL etait ecrit cinq fois, en memoire, et repartait a zero a chaque
    redemarrage. Deboguer une regle qui n'a pas fonctionne cette nuit etait
    donc impossible le lendemain — c'est arrive, deux jours durant, sur le
    planning des volets ;
  * rien ne distinguait une MAIN d'une regle. Une lampe allumee par quelqu'un
    et une lampe allumee par le dashboard se ressemblent trait pour trait ;
  * une regle qui commandait notait le nombre DEMANDE, jamais le nombre parti.
    « ferme 2 » alors qu'un volet n'avait rien recu : le journal mentait, et le
    defaut restait invisible.
"""
from __future__ import annotations

import asyncio
import time

import pytest

from conftest import FauxStore, charger


def lancer(coro):
    return asyncio.run(coro)


class FauxServices:
    def __init__(self):
        self.appels = []

    async def async_call(self, domaine, service, data, blocking=False, context=None):
        self.appels.append((domaine, service, dict(data), context))


class FauxHass:
    def __init__(self):
        self.services = FauxServices()
        self.taches = []

    def async_create_task(self, coro):
        self.taches.append(coro)
        return coro

    def abandonner(self):
        taches, self.taches = self.taches, []
        for coro in taches:
            coro.close()


class FauxEvenement:
    """Un changement d'etat, avec le contexte qui dit d'ou il vient."""

    def __init__(self, haid, context):
        self.data = {"entity_id": haid}
        self.context = context


@pytest.fixture
def module():
    return charger("regles")


@pytest.fixture
def socle(module):
    faits = []

    def fabrique(depart=None):
        r = module.Regles(FauxHass(), None)
        r._depot = FauxStore(depart)
        faits.append(r)
        return r

    yield fabrique
    for r in faits:
        r.hass.abandonner()


def contexte(user_id=None):
    from homeassistant.core import Context

    return Context(user_id=user_id)


# ── Le journal ──────────────────────────────────────────────────────────────

def test_une_ligne_porte_son_motif(socle):
    """Sans le motif, on lit qu'un volet s'est ferme sans savoir pourquoi.

    C'est la colonne qui manquait aux cinq journaux precedents, et la seule
    qui permette a quelqu'un de comprendre sa maison sans lire le code.
    """
    r = socle()
    ligne = lancer(r.noter("volets", "planning", "fermer",
                           cibles=["cover.a", "cover.b"], motif="coucher + 30"))
    assert ligne["module"] == "volets"
    assert ligne["motif"] == "coucher + 30"
    assert ligne["n"] == 2
    assert ligne["ts"] > 0


def test_le_journal_survit_au_redemarrage(socle):
    """Le defaut d'origine : cinq journaux en memoire, vides a chaque reveil."""
    depart = {"entrees": [{"ts": 1.0, "module": "nuit", "regle": "veilleuse",
                           "quoi": "eteindre", "cibles": [], "n": 0,
                           "motif": "", "detail": ""}]}
    r = socle(depart)
    lignes = lancer(r.journal())
    assert len(lignes) == 1
    assert lignes[0]["module"] == "nuit"


def test_le_plus_recent_vient_en_premier(socle):
    r = socle()
    lancer(r.noter("volets", "planning", "ouvrir"))
    lancer(r.noter("nuit", "veilleuse", "eteindre"))
    lignes = lancer(r.journal())
    assert [l["module"] for l in lignes] == ["nuit", "volets"]


def test_le_journal_ne_grossit_pas_sans_fin(socle, module):
    r = socle()
    for i in range(module.MAX_JOURNAL + 40):
        lancer(r.noter("volets", "planning", "ouvrir", detail=str(i)))
    assert len(lancer(r.journal(limite=1000))) == module.MAX_JOURNAL


def test_on_peut_lire_le_journal_d_un_seul_module(socle):
    r = socle()
    lancer(r.noter("volets", "planning", "ouvrir"))
    lancer(r.noter("nuit", "veilleuse", "eteindre"))
    assert [l["module"] for l in lancer(r.journal(module="volets"))] == ["volets"]


# ── Le geste manuel ─────────────────────────────────────────────────────────

def test_une_main_gele_l_entite(socle):
    """`context.user_id` rempli : le changement vient d'une personne."""
    r = socle()
    r.suivre("volets", ["cover.a"])
    r._sur_changement(FauxEvenement("cover.a", contexte(user_id="u1")))
    assert r.gele("cover.a")
    assert r.gel_restant("cover.a") > 0


def test_une_regle_ne_gele_rien(socle):
    """Sans `user_id`, le changement vient d'une automatisation : les regles
    doivent continuer de piloter."""
    r = socle()
    r.suivre("volets", ["cover.a"])
    r._sur_changement(FauxEvenement("cover.a", contexte()))
    assert not r.gele("cover.a")


def test_le_socle_ne_se_gele_pas_lui_meme(socle):
    """Le piege : notre propre ordre revient sous forme de changement d'etat.

    Sans reconnaitre nos contextes, la premiere commande gelait l'entite et la
    regle ne pouvait plus jamais agir.
    """
    r = socle()
    r.suivre("volets", ["cover.a"])
    lancer(r.agir("volets", "planning", "cover", "close_cover", ["cover.a"]))
    _, _, _, ctx = r.hass.services.appels[0]
    # Home Assistant nous rend le changement, avec NOTRE contexte — et un
    # `user_id` s'il a ete declenche depuis une session utilisateur.
    ctx.user_id = "u1"
    r._sur_changement(FauxEvenement("cover.a", ctx))
    assert not r.gele("cover.a")


def test_le_gel_expire(socle):
    r = socle()
    r.duree_gel = 0.001
    r.suivre("volets", ["cover.a"])
    r._sur_changement(FauxEvenement("cover.a", contexte(user_id="u1")))
    time.sleep(0.01)
    assert not r.gele("cover.a")


def test_on_peut_rendre_la_main_aux_regles(socle):
    r = socle()
    r.suivre("volets", ["cover.a"])
    r._sur_changement(FauxEvenement("cover.a", contexte(user_id="u1")))
    r.degeler("cover.a")
    assert not r.gele("cover.a")


# ── L'entonnoir ─────────────────────────────────────────────────────────────

def test_agir_ecarte_ce_qui_est_sous_la_main(socle):
    r = socle()
    r.suivre("volets", ["cover.a", "cover.b"])
    r._sur_changement(FauxEvenement("cover.a", contexte(user_id="u1")))
    partis = lancer(r.agir("volets", "planning", "cover", "close_cover",
                           ["cover.a", "cover.b"], motif="coucher + 30"))
    assert partis == ["cover.b"], "on a commande une entite que quelqu'un tenait"
    assert r.hass.services.appels[0][2]["entity_id"] == ["cover.b"]


def test_le_journal_ne_compte_que_ce_qui_est_parti(socle):
    """« ferme 2 » alors qu'un seul est parti : c'est ce mensonge qui rendait
    les defauts invisibles."""
    r = socle()
    r.suivre("volets", ["cover.a", "cover.b"])
    r._sur_changement(FauxEvenement("cover.a", contexte(user_id="u1")))
    lancer(r.agir("volets", "planning", "cover", "close_cover", ["cover.a", "cover.b"]))
    ligne = lancer(r.journal())[0]
    assert ligne["n"] == 1
    assert "sous la main" in ligne["detail"]


def test_tout_gele_ne_commande_rien(socle):
    r = socle()
    r.suivre("volets", ["cover.a"])
    r._sur_changement(FauxEvenement("cover.a", contexte(user_id="u1")))
    partis = lancer(r.agir("volets", "planning", "cover", "close_cover", ["cover.a"]))
    assert partis == []
    assert r.hass.services.appels == []
    assert lancer(r.journal())[0]["n"] == 0


def test_les_donnees_du_service_passent(socle):
    r = socle()
    lancer(r.agir("volets", "soleil", "cover", "set_cover_position",
                  ["cover.a"], {"position": 30}, motif="facade au soleil"))
    _, service, data, _ = r.hass.services.appels[0]
    assert service == "set_cover_position"
    assert data == {"entity_id": ["cover.a"], "position": 30}


def test_chaque_ordre_a_son_propre_contexte(socle):
    """Deux ordres partageant un contexte : le second passerait pour le premier,
    et la reconnaissance de nos propres effets se tromperait."""
    r = socle()
    lancer(r.agir("volets", "planning", "cover", "close_cover", ["cover.a"]))
    lancer(r.agir("nuit", "veilleuse", "light", "turn_off", ["light.a"]))
    assert r.hass.services.appels[0][3].id != r.hass.services.appels[1][3].id


# ── Les priorites ───────────────────────────────────────────────────────────

def test_une_regle_forte_tient_contre_une_faible(socle):
    """« Vent fort passe avant les deux autres », generalise : chaque regle
    declare son niveau, et le plus haut l'emporte."""
    r = socle()
    lancer(r.agir("volets", "vent", "cover", "open_cover", ["cover.a"], priorite=100, tenir=True))
    partis = lancer(r.agir("volets", "planning", "cover", "close_cover", ["cover.a"], priorite=60))
    assert partis == []
    assert len(r.hass.services.appels) == 1, "le planning a baisse un volet que le vent tenait"
    assert "1 tenu par vent" in lancer(r.journal())[0]["detail"]


def test_une_regle_plus_forte_passe_et_reprend(socle):
    """Commander par-dessus une tenue la reprend : la regle qui tenait ne
    rendra pas l'entite derriere nous."""
    r = socle()
    lancer(r.agir("volets", "soleil", "cover", "set_cover_position", ["cover.a"],
                  {"position": 30}, priorite=50, tenir=True))
    assert r.tient("volets", "soleil", "cover.a")
    partis = lancer(r.agir("volets", "planning", "cover", "close_cover", ["cover.a"], priorite=60))
    assert partis == ["cover.a"]
    assert not r.tient("volets", "soleil", "cover.a"), "le soleil rouvrirait un volet ferme pour la nuit"


def test_a_egalite_rien_ne_retient(socle):
    r = socle()
    lancer(r.agir("volets", "a", "cover", "open_cover", ["cover.a"], priorite=50, tenir=True))
    assert lancer(r.agir("volets", "b", "cover", "close_cover", ["cover.a"], priorite=50)) == ["cover.a"]


def test_rendre_libere_les_plus_faibles(socle):
    r = socle()
    lancer(r.agir("volets", "vent", "cover", "open_cover", ["cover.a"], priorite=100, tenir=True))
    r.relacher("volets", "vent")
    assert lancer(r.agir("volets", "planning", "cover", "close_cover", ["cover.a"], priorite=60)) == ["cover.a"]


def test_une_main_reprend_ce_qu_une_regle_tenait(socle):
    """Sans cela, la regle rendrait l'entite a la fin du gel : la protection
    solaire rouvrant un volet qu'on venait de baisser a la main."""
    r = socle()
    r.suivre("volets", ["cover.a"])
    lancer(r.agir("volets", "soleil", "cover", "close_cover", ["cover.a"], priorite=50, tenir=True))
    r._sur_changement(FauxEvenement("cover.a", contexte(user_id="u1")))
    assert not r.tient("volets", "soleil", "cover.a")


def test_une_tenue_oubliee_finit_par_tomber(socle):
    """Un filet : une regle qui oublie de rendre ne bloque pas les autres pour toujours."""
    r = socle()
    lancer(r.agir("volets", "vent", "cover", "open_cover", ["cover.a"], priorite=100, tenir=True))
    r._tenues["cover.a"]["fin"] = time.time() - 1
    assert lancer(r.agir("volets", "planning", "cover", "close_cover", ["cover.a"], priorite=60)) == ["cover.a"]


def test_relacher_tout_un_module_et_lui_seul(socle):
    r = socle()
    lancer(r.agir("volets", "vent", "cover", "open_cover", ["cover.a"], priorite=100, tenir=True))
    lancer(r.agir("volets", "soleil", "cover", "close_cover", ["cover.b"], priorite=50, tenir=True))
    lancer(r.agir("nuit", "veilleuse", "light", "turn_on", ["light.a"], priorite=10, tenir=True))
    r.relacher("volets")
    assert r.tenues("volets") == {}
    assert r.tenues("nuit") == {"light.a": "veilleuse"}


# ── La simulation ───────────────────────────────────────────────────────────

def test_la_simulation_n_envoie_rien_mais_note_tout(socle):
    """« Observer sans agir » : ce qui donne confiance a un tiers avant de
    laisser le dashboard piloter sa maison."""
    r = socle()
    partis = lancer(r.agir("volets", "planning", "cover", "close_cover", ["cover.a", "cover.b"],
                           motif="coucher", simuler=True))
    assert r.hass.services.appels == [], "la simulation a commande la maison"
    assert partis == ["cover.a", "cover.b"], "la simulation doit dire ce qui SERAIT parti"
    ligne = lancer(r.journal())[0]
    assert ligne["simule"] is True
    assert ligne["n"] == 2
    assert ligne["motif"] == "coucher"


def test_la_simulation_respecte_les_mains_et_les_priorites(socle):
    """Elle raconte la meme histoire que le reel : une entite gelee, ou tenue
    par plus fort, n'y part pas davantage."""
    r = socle()
    r.suivre("volets", ["cover.a", "cover.b"])
    r._sur_changement(FauxEvenement("cover.a", contexte(user_id="u1")))
    lancer(r.agir("volets", "vent", "cover", "open_cover", ["cover.b"], priorite=100,
                  tenir=True, simuler=True))
    partis = lancer(r.agir("volets", "planning", "cover", "close_cover", ["cover.a", "cover.b"],
                           priorite=60, simuler=True))
    assert partis == []
    assert r.hass.services.appels == []


def test_une_ligne_reelle_n_est_pas_simulee(socle):
    r = socle()
    lancer(r.agir("volets", "planning", "cover", "close_cover", ["cover.a"]))
    assert lancer(r.journal())[0]["simule"] is False
