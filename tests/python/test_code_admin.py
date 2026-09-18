"""Tests du code administrateur : hache, verifie a temps constant, essais limites."""
from __future__ import annotations

import pytest

from conftest import charger


@pytest.fixture
def module():
    return charger("code_admin")


def test_quatre_a_huit_chiffres(module):
    for ok in ("0000", "1234", "12345678"):
        assert module.code_valide(ok) is True
    for non in ("123", "123456789", "12a4", "", None, 1234, " 1234", "1234\n"):
        assert module.code_valide(non) is False


def test_le_hache_ne_dit_pas_le_code_et_le_verifie(module):
    e = module.hacher("1234")
    assert set(e) == {"sel", "hache", "iterations"}
    assert "1234" not in e["hache"] and "1234" not in e["sel"]
    assert module.verifier("1234", e) is True
    assert module.verifier("1235", e) is False
    assert module.verifier("0000", e) is False
    # Deux hachages du meme code ne se ressemblent pas : le sel est aleatoire.
    assert module.hacher("1234")["hache"] != e["hache"]
    # Un sel impose donne un resultat reproductible.
    a = module.hacher("1234", sel=b"x" * 16, iterations=1000)
    b = module.hacher("1234", sel=b"x" * 16, iterations=1000)
    assert a == b
    with pytest.raises(ValueError):
        module.hacher("12")


def test_un_enregistrement_abime_ne_laisse_rien_passer(module):
    assert module.verifier("1234", None) is False
    assert module.verifier("1234", {"sel": "zz", "hache": "00", "iterations": 1000}) is False
    assert module.verifier("1234", {"sel": "00", "hache": "00", "iterations": 10}) is False, "trop peu d'iterations : pas un enregistrement a nous"
    assert module.verifier("1234", {"sel": "00", "hache": "00", "iterations": True}) is False
    assert module.verifier("12", module.hacher("1234")) is False, "un code invalide ne se compare pas"
    assert module.enregistrement_valide(module.hacher("0000")) is True


def test_cinq_rates_puis_un_blocage_qui_double(module):
    t = [0.0]
    lim = module.Limiteur(horloge=lambda: t[0])
    for _ in range(4):
        assert lim.rate("u1") == 0
    assert lim.bloque_pendant("u1") == 0
    assert lim.rate("u1") == 60, "le cinquieme rate bloque une minute"
    assert lim.bloque_pendant("u1") == 61
    t[0] = 30.0
    assert lim.bloque_pendant("u1") == 31
    t[0] = 61.0
    assert lim.bloque_pendant("u1") == 0
    for _ in range(4):
        assert lim.rate("u1") == 0
    assert lim.rate("u1") == 120, "le palier suivant double"
    t[0] = 200.0
    for _ in range(5):
        lim.rate("u1")
    t[0] = 10_000.0
    for _ in range(5):
        lim.rate("u1")
    t[0] = 20_000.0
    for _ in range(4):
        lim.rate("u1")
    assert lim.rate("u1") == 900, "plafonne a quinze minutes"


def test_une_reussite_remet_a_zero_et_un_compte_ne_bloque_pas_l_autre(module):
    t = [0.0]
    lim = module.Limiteur(horloge=lambda: t[0])
    for _ in range(5):
        lim.rate("u1")
    assert lim.bloque_pendant("u1") > 0
    assert lim.bloque_pendant("u2") == 0
    lim.reussi("u1")
    assert lim.bloque_pendant("u1") == 0
    for _ in range(4):
        lim.rate("u1")
    assert lim.rate("u1") == 60, "les paliers aussi sont oublies"


def test_les_rates_trop_vieux_ne_comptent_plus(module):
    t = [0.0]
    lim = module.Limiteur(horloge=lambda: t[0])
    for _ in range(4):
        lim.rate("u1")
    t[0] = 601.0
    assert lim.rate("u1") == 0, "quatre rates d'il y a dix minutes sont oublies"
