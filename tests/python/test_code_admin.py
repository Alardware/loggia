"""Tests du code administrateur : hache, verifie a temps constant, essais limites."""
from __future__ import annotations

import pytest

from pathlib import Path

from conftest import charger

RACINE = Path(__file__).resolve().parents[2]


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


# ── Le passage vers un profil Admin (24/09, plan M14) ──────────────────────

PROFILS = [{"name": "Démo", "role": "Admin"}, {"name": "Invité", "role": "Famille"}]


def test_seul_le_passage_vers_un_profil_admin_est_garde():
    """`loggia_active_user` reste OUVERTE : une tablette de famille change de
    profil, c'est son usage premier. Seul le passage vers Admin se garde."""
    m = charger("code_admin")
    assert m.passage_admin({"loggia_active_user": "0"}, PROFILS) is True
    assert m.passage_admin({"loggia_active_user": "1"}, PROFILS) is False
    # Le role se compare sans casse ni espaces : un profil importe peut varier.
    assert m.passage_admin({"loggia_active_user": "0"}, [{"role": " admin "}]) is True
    # Rien a garder : une autre cle, un index hors liste, une liste illisible.
    assert m.passage_admin({"loggia_look": "ios"}, PROFILS) is False
    assert m.passage_admin({"loggia_active_user": "9"}, PROFILS) is False
    assert m.passage_admin({"loggia_active_user": "0"}, None) is False
    assert m.passage_admin({"loggia_active_user": "abc"}, PROFILS) is False
    assert m.passage_admin({"loggia_active_user": "0"}, ["pas un objet"]) is False


def test_un_code_verifie_ouvre_le_passage_pour_un_temps_puis_se_ferme():
    m = charger("code_admin")
    t = [1000.0]
    lp = m.LaissezPasser(duree=300, horloge=lambda: t[0])
    assert lp.valide("a") is False, "rien n'est ouvert sans avoir prouve le code"
    lp.accorder("a")
    assert lp.valide("a") is True
    assert lp.valide("b") is False, "le laissez-passer vaut pour UN compte"
    t[0] += 299
    assert lp.valide("a") is True
    t[0] += 2
    assert lp.valide("a") is False, "il ne vaut pas plus que sa duree"
    lp.accorder("a")
    lp.retirer("a")
    assert lp.valide("a") is False


def test_le_gestionnaire_garde_bien_le_passage():
    """La regle est branchee, et un administrateur Home Assistant la saute :
    il peut deja tout ailleurs, lui demander le code n'ajoute rien."""
    src = (RACINE / "custom_components" / "loggia" / "websocket_api.py").read_text(encoding="utf-8")
    assert "refus = await _refus_profil_admin(patch, connection)" in src
    corps = src.split("async def _refus_profil_admin")[1].split("@websocket_api")[0]
    assert "if connection.user.is_admin:" in corps
    assert "laissez_passer.valide(connection.user.id)" in corps
    assert "passage_admin(patch, profils)" in corps
    # Une verification reussie l'accorde.
    assert "laissez_passer.accorder(uid)" in src

