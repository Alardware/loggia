"""Parite JS / Python AU-DELA de la grande fixture (ADR 0155, 05/10).

`tests/fixtures/distributeurs_parite.json` est lue ici ET par
`tests/distributeur.test.mjs`. Ses cas etaient ecrits en dur dans le seul test
JS, « releves » sur le Python : le Python ne les rejouait pas, et le cas d'un
select feed aux options en minuscules y disait le CONTRAIRE de
test_distributeur_appareil.py (relecture « tests », 05/10) — l'ecran sans
« Distribuer » quand le serveur reconnaissait la commande. Chaque cas n'epingle
que le point ou le JS avait derive ; une cle absente d'`attendu` n'est pas lue.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from conftest import charger
from test_distributeur_appareil import json_de, monter

RACINE = Path(__file__).resolve().parents[2]
PARITE = json.loads((RACINE / "tests" / "fixtures" / "distributeurs_parite.json").read_text(encoding="utf-8"))
CAS = {c["id"]: c for c in PARITE["cas"]}


@pytest.fixture(scope="module")
def da():
    return charger("distributeur_appareil")


def _lu(da, cas):
    """Ce que le serveur lit du cas, dans le vocabulaire d'`attendu`."""
    registre, etats, services = monter(cas)
    lu = da.decrire_appareil(cas["config"], registre, etats, services)
    c = lu["commande"]
    return {
        "appareil": lu["appareil"],
        "notes": json_de(lu["notes"]),
        "commande_id": c["entity_id"] if c else None,
        "donnees": json_de(c["donnees"]) if c else None,
        "portion_id": lu["portion"]["entity_id"] if lu["portion"] else None,
        "cibles_de_commande": json_de(lu["cibles_de_commande"]),
        "consommables": json_de(lu["consommables"]),
        "une_portion": lu["une_portion"],
        "envoi_2_portions": json_de(da.envoi(c, 2)),
    }


def test_la_fixture_de_parite_a_ses_cas():
    assert len(CAS) >= 11, "la fixture de parite a perdu des cas"
    for cas in CAS.values():
        assert cas["attendu"], cas["id"]


@pytest.mark.parametrize("ident", sorted(CAS))
def test_chaque_cas_de_parite(da, ident):
    cas = CAS[ident]
    lu = _lu(da, cas)
    for cle, attendu in cas["attendu"].items():
        assert cle in lu, "cle d'attendu inconnue : %s" % cle
        assert lu[cle] == attendu, "%s > %s" % (ident, cle)
