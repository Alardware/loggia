"""Les deux petits modules communs du lot 8 (audit du 28/10, M12).

`nombres.py` remplace huit copies de la meme garde ; `entites.py` fabrique la
regex d'entite qui existait en quatre variantes, plus quatre pour des domaines
nommes. C'est un rangement : chaque motif garde EXACTEMENT sa chaine d'avant,
relevee ici sur l'ancien code, et chaque lecture rend ce qu'elle rendait.
"""
from __future__ import annotations

import pytest

from conftest import charger

# Le motif de chaque module, tel qu'il etait ecrit avant le lot 8.
MOTIFS_AVANT = [
    ("automatisations", "_ENTITE", r"^[a-z_]+\.[a-z0-9_]+$"),
    ("minuteurs", "ENTITE", r"^(light|switch|fan|input_boolean|media_player)\.[a-z0-9_]+$"),
    ("regles", "ENTITE", r"^[a-z0-9_]+\.[a-z0-9_]+$"),
    ("sirene", "ENTITE", r"^(siren|switch)\.[a-z0-9_]+$"),
    ("enfant_calcul", "LECTEUR", r"^media_player\.[a-z0-9_]+$"),
    ("prises_calcul", "INTERRUPTEUR", r"^switch\.[a-z0-9_]+$"),
    ("robots", "ROBOT", r"^(vacuum|lawn_mower)\.[a-z0-9_]+$"),
    ("robots", "SCRIPT", r"^script\.[a-z0-9_]+$"),
    ("robots_carnet", "ROBOT", r"^(vacuum|lawn_mower)\.[a-z0-9_]+$"),
]


@pytest.mark.parametrize("module, nom, avant", MOTIFS_AVANT)
def test_chaque_motif_garde_sa_forme(module, nom, avant):
    assert getattr(charger(module), nom).pattern == avant


def test_les_modules_importent_le_motif_commun():
    """Plus de regex d'entite ecrite a la main dans ces modules."""
    from conftest import COMPOSANT
    for module in {m for m, _, _ in MOTIFS_AVANT}:
        source = (COMPOSANT / (module + ".py")).read_text(encoding="utf-8")
        assert r"\.[a-z0-9_]+$" not in source, module + " reecrit la regex d'entite"
        assert "from .entites import" in source, module


@pytest.mark.parametrize("x, attendu", [
    (1, 1.0), (2.5, 2.5), (-3, -3.0), (0, 0.0),
    (True, None), (False, None), (None, None), ("21.5", None), ([], None),
    (float("nan"), None), (float("inf"), None), (float("-inf"), None), (10 ** 400, None),
])
def test_fini(x, attendu):
    assert charger("nombres").fini(x) == attendu


@pytest.mark.parametrize("x, attendu", [
    (1, 1.0), (2.5, 2.5), ("21.5", 21.5), (" 7 ", 7.0), ("-0", 0.0),
    (True, None), (False, None), (None, None), ("", None), ("abc", None), ([], None), ({}, None),
    ("nan", None), ("inf", None), ("-Infinity", None), (float("nan"), None), (10 ** 400, None), ("1e400", None),
])
def test_lu(x, attendu):
    assert charger("nombres").lu(x) == attendu


@pytest.mark.parametrize("module, nom, lecture", [
    ("eau_calcul", "_nombre", "fini"), ("enfant_calcul", "nombre", "fini"), ("lumieres_calcul", "nombre", "fini"),
    ("prises_calcul", "nombre", "fini"), ("chauffage_familles", "_nombre", "fini"), ("robots_carnet", "_nombre", "lu"),
])
def test_les_modules_lisent_par_nombres(module, nom, lecture):
    assert getattr(charger(module), nom) is getattr(charger("nombres"), lecture)


def test_l_orientation_et_le_seuil_du_vent():
    """`volets.degres` et `seuil_vent_valide`, passes par nombres.py : memes reponses qu'avant."""
    volets = charger("volets")
    assert [volets.degres(v) for v in (225, "225", 370.5, -10, None, "", True, "nan", "abc")] == \
        [225, 225, 10, 350, None, None, None, None, None]
    assert volets.seuil_vent_valide(40) == 40 and volets.seuil_vent_valide(12.5) == 12.5
    for mauvais in (0, -1, True, "40", float("nan"), float("inf"), None, 10 ** 400):
        with pytest.raises(ValueError):
            volets.seuil_vent_valide(mauvais)
