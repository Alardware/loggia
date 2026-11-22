"""Une ampoule « alimentee par » un interrupteur (audit du 12/11, lot X4 ; ADR 0369).

Ce qui vaut d'etre verrouille : la relation se lit proprement, quoi qu'on y ait
ecrit ; une ampoule est hors tension quand SA source est eteinte, et seulement
alors - une source muette ou absente ne dit rien ; une source ne peut pas etre
elle-meme alimentee (ni chaine, ni boucle) ; un magasin ou des etats illisibles
ne filtrent rien, plutot que de ne rien commander.
"""
from __future__ import annotations

import asyncio
import types

import pytest

from conftest import charger


def lancer(coro):
    return asyncio.run(coro)


@pytest.fixture
def maison():
    return charger("lumieres_maison")


AMPOULE, AUTRE, PLAFONNIER, PRISE = "light.ampoule_un", "light.ampoule_deux", "light.plafonnier", "switch.prise_lampe"


def test_la_relation_se_lit_proprement(maison):
    brut = {AMPOULE: PLAFONNIER, AUTRE: PRISE,
            "light.seule": "light.seule",      # sa propre source
            "light.b": 5, 7: "light.c",        # ni l'un ni l'autre n'est un texte
            "sensor.x": PLAFONNIER,            # ce n'est pas une lampe
            "light.c": "sensor.y",             # ce n'est ni une lampe ni un interrupteur
            "light.d": ""}
    assert maison.alimentations_de(brut) == {AMPOULE: PLAFONNIER, AUTRE: PRISE}
    for rien in (None, [], "x", 3, {}):
        assert maison.alimentations_de(rien) == {}
    # Un interrupteur declare lumiere peut lui aussi etre derriere un autre.
    assert maison.alimentations_de({"switch.applique": PLAFONNIER}) == {"switch.applique": PLAFONNIER}


def test_une_source_ne_peut_pas_etre_elle_meme_alimentee(maison):
    # Une chaine : la relation dont la source est elle-meme alimentee s'ecarte.
    assert maison.alimentations_de({AMPOULE: PLAFONNIER, PLAFONNIER: PRISE}) == {PLAFONNIER: PRISE}
    # Une boucle : rien ne tient.
    assert maison.alimentations_de({AMPOULE: AUTRE, AUTRE: AMPOULE}) == {}


def test_hors_tension_quand_la_source_est_eteinte(maison):
    relations = {AMPOULE: PLAFONNIER, AUTRE: PRISE}
    assert maison.hors_tension(relations, {PLAFONNIER: "off", PRISE: "on"}.get) == {AMPOULE}
    assert maison.hors_tension(relations, {PLAFONNIER: "OFF", PRISE: "off"}.get) == {AMPOULE, AUTRE}
    assert maison.hors_tension(relations, {PLAFONNIER: "on", PRISE: "on"}.get) == set()
    assert maison.hors_tension({}, {PLAFONNIER: "off"}.get) == set()


@pytest.mark.parametrize("muet", ["unavailable", "unknown", "", None])
def test_une_source_muette_ne_dit_rien(maison, muet):
    assert maison.hors_tension({AMPOULE: PLAFONNIER}, {PLAFONNIER: muet}.get) == set()
    # Une source sans etat du tout.
    assert maison.hors_tension({AMPOULE: PLAFONNIER}, {}.get) == set()


def test_une_lecture_qui_leve_ne_filtre_rien(maison):
    def casse(_haid):
        raise RuntimeError("etats illisibles")

    assert maison.hors_tension({AMPOULE: PLAFONNIER}, casse) == set()


def test_le_magasin_donne_la_relation(maison, creer_store):
    magasin = creer_store({"users": {}, "migrated": True,
                           "shared": {"loggia_alimentation": {AMPOULE: PLAFONNIER, "light.x": "light.x"}}})
    assert lancer(maison.async_alimentations(magasin)) == {AMPOULE: PLAFONNIER}
    assert lancer(maison.async_alimentations(creer_store({"users": {}, "migrated": True, "shared": {}}))) == {}

    class Casse:
        async def async_get_shared(self, *_):
            raise RuntimeError("magasin illisible")

    # Un magasin illisible : aucune relation, la regle commande comme avant.
    assert lancer(maison.async_alimentations(Casse())) == {}


def test_les_etats_de_home_assistant_se_lisent(maison):
    etats = {PLAFONNIER: types.SimpleNamespace(state="off"), PRISE: types.SimpleNamespace(state="on")}
    hass = types.SimpleNamespace(states=types.SimpleNamespace(get=etats.get))
    assert maison.hors_tension_dans(hass, {AMPOULE: PLAFONNIER, AUTRE: PRISE}) == {AMPOULE}
    # Sans relation, les etats ne sont meme pas lus.
    assert maison.hors_tension_dans(None, {}) == set()
    # Des etats illisibles : rien n'est ecarte.
    assert maison.hors_tension_dans(types.SimpleNamespace(), {AMPOULE: PLAFONNIER}) == set()
