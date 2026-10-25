"""Parite JS / Python du calcul du chauffage (chantier Chauffage, § 12).

`tests/fixtures/chauffage_parite.json` est lue ici ET par
`tests/chauffage.test.mjs`. L'ecran dessine la barre et dit « jusqu'a 23:00,
puis Eco » avec le meme calcul que celui qui decide : s'ils divergeaient, la
carte mentirait sur ce que la maison va faire.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from conftest import charger

RACINE = Path(__file__).resolve().parents[2]
PARITE = json.loads((RACINE / "tests" / "fixtures" / "chauffage_parite.json").read_text(encoding="utf-8"))
CAS = {c["id"]: c for c in PARITE["cas"]}


@pytest.fixture(scope="module")
def calc():
    return charger("chauffage_calcul")


def test_la_fixture_a_ses_cas():
    assert len(CAS) >= 15, "la fixture de parite a perdu des cas"
    assert len(CAS) == len(PARITE["cas"]), "deux cas portent le meme identifiant"
    for cas in PARITE["cas"]:
        assert cas["entree"]["semaine"] in PARITE["semaines"], cas["id"]


@pytest.mark.parametrize("texte,attendu", PARITE["heures"])
def test_chaque_heure(calc, texte, attendu):
    assert calc.lire_heure(texte) == attendu


@pytest.mark.parametrize("cas", PARITE["en_cours"], ids=lambda c: c["id"])
def test_chaque_changement_en_cours(calc, cas):
    lu = calc.changement_en_cours(PARITE["semaines"][cas["semaine"]], cas["jour"], cas["minute"])
    assert (list(lu) if lu is not None else None) == cas["attendu"]


@pytest.mark.parametrize("ident", sorted(CAS))
def test_chaque_cas_de_parite(calc, ident):
    e = CAS[ident]["entree"]
    lu = calc.mode_voulu(PARITE["semaines"][e["semaine"]], e["maison"], e["reprise"], e["fenetre"],
                         e["jour"], e["minute"], reglage_fenetre=e["reglage_fenetre"])
    assert lu == CAS[ident]["attendu"]
