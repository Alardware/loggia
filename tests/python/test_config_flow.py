"""L'ajout de Loggia depuis l'interface (28/10, ADR 0281 ; audit du 28/10, B6).

`config_flow.py` n'avait aucun test. Il ne demande rien — ni identifiant, ni
adresse — et n'admet qu'une seule entree : le formulaire se reduit a une
confirmation, et un second ajout s'abandonne. Ici contre une doublure de
`ConfigFlow` (doublures_ha.py) ; le meme parcours tourne contre un vrai Home
Assistant dans tests/ha_reel/test_fumee.py.
"""
from __future__ import annotations

import asyncio
import sys

from conftest import charger
from doublures_ha import poser_demarrage

poser_demarrage()


def lancer(coro):
    return asyncio.run(coro)


def module():
    return charger("config_flow")


def test_le_parcours_porte_le_domaine_et_sa_version():
    m = module()
    assert m.LoggiaConfigFlow.domaine == "loggia"
    assert m.LoggiaConfigFlow.VERSION == 1


def test_sans_reponse_il_montre_la_confirmation_et_rien_d_autre():
    flux = module().LoggiaConfigFlow()
    r = lancer(flux.async_step_user())
    assert r == {"type": "form", "step_id": "user"}, "le formulaire demande quelque chose"
    assert flux.unique_id == "loggia", "l'entree n'est pas unique : deux Loggia pourraient s'ajouter"


def test_confirme_il_cree_une_entree_sans_donnees():
    flux = module().LoggiaConfigFlow()
    r = lancer(flux.async_step_user({}))
    assert r == {"type": "create_entry", "title": "Loggia", "data": {}}


def test_un_second_ajout_s_abandonne():
    entrees = sys.modules["homeassistant.config_entries"]
    flux = module().LoggiaConfigFlow(deja={"loggia"})
    try:
        lancer(flux.async_step_user())
    except entrees.AbortFlow as abandon:
        assert abandon.reason == "already_configured"
    else:
        raise AssertionError("un second Loggia a pu s'ajouter")
