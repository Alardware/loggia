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
    # ASSERTION MODIFIEE (ADR 0278, 27/10) : l'enregistrement porte aussi la
    # longueur du code, pour que le pave sache quand verifier.
    assert set(e) == {"sel", "hache", "iterations", "longueur"}
    # Le code n'est pas range en clair. Sur un sel tire au hasard, « 1234 » tombe
    # dans l'hexadecimal environ une fois sur 700 (25/10, vu une fois) : sel fixe.
    fixe = module.hacher("1234", sel=b"\0" * 16)
    assert "1234" not in fixe["hache"] and "1234" not in fixe["sel"]
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


def test_la_longueur_du_code_et_rien_d_autre(module):
    """Ticket #38 (ADR 0278) : le pave verifiait des le quatrieme chiffre, un
    code de huit ne se saisissait jamais. L'enregistrement dit combien de
    chiffres attendre ; une valeur hors de 4 a 8 ne dit rien."""
    for code in ("0000", "12345", "12345678"):
        assert module.longueur_de(module.hacher(code)) == len(code)
    ancien = {k: v for k, v in module.hacher("12345678").items() if k != "longueur"}
    assert module.longueur_de(ancien) is None, "un code d'avant le 27/10 n'a pas de longueur connue"
    assert module.enregistrement_valide(ancien) and module.verifier("12345678", ancien), "il se verifie quand meme"
    for faux in (3, 9, True, "8", None):
        assert module.longueur_de({**ancien, "longueur": faux}) is None
    assert module.longueur_de(None) is None


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
    # ASSERTION MODIFIEE (lot 8, 30/10 ; ADR 0291) : le contexte des gestionnaires (`ctx`) porte
    # le laissez-passer et le magasin.
    assert "refus = await _refus_profil_admin(ctx, patch, connection)" in src
    corps = src.split("async def _refus_profil_admin")[1].split("async def handle_set")[0]
    assert "if connection.user.is_admin:" in corps
    assert "laissez_passer.valide(connection.user.id)" in corps
    assert "passage_admin(patch, profils)" in corps
    # Une verification reussie l'accorde.
    assert "laissez_passer.accorder(uid)" in src



# TEST AJOUTE (audit du 28/10 ; ADR 0279) : il n'y a plus de code par defaut. `0000` ouvrait le laissez-passer tant que
# personne n'avait defini de code ; la constante partie, aucun module ne peut plus s'en servir.
def test_il_n_y_a_plus_de_code_par_defaut(module):
    assert not hasattr(module, "CODE_DEFAUT")


# TEST AJOUTE (audit du 28/10, B4 ; ADR 0279) : un code redefini referme tous les laissez-passer et oublie tous les rates.
def test_un_code_redefini_referme_tout_et_oublie_les_rates(module):
    t = [0.0]
    lp = module.LaissezPasser(horloge=lambda: t[0])
    lp.accorder("a")
    lp.accorder("b")
    lp.tout_retirer()
    assert lp.valide("a") is False and lp.valide("b") is False
    lim = module.Limiteur(horloge=lambda: t[0])
    for _ in range(module.ESSAIS_LIBRES):
        lim.rate("a")
    assert lim.bloque_pendant("a") > 0
    lim.tout_oublier()
    assert lim.bloque_pendant("a") == 0
    assert lim.rate("a") == 0, "les rates d'avant comptent encore"


# TEST AJOUTE (audit du 28/10, B4 ; ADR 0279) : le verrou d'un compte s'en va quand plus personne ne l'attend - le
# dictionnaire grandissait jusqu'au redemarrage -, sans jamais laisser deux verifications du meme compte passer ensemble.
def test_les_verrous_par_compte_se_purgent_sans_laisser_passer_deux_essais(module):
    import asyncio

    verrous = module.VerrousParCompte()
    dedans = []
    ensemble = []

    async def essai(cle, n):
        async with verrous.de(cle):
            dedans.append(cle)
            ensemble.append(dedans.count(cle))
            await asyncio.sleep(0)
            await asyncio.sleep(0)
            dedans.remove(cle)
        return n

    async def scenario():
        await asyncio.gather(*(essai("u-lea", i) for i in range(5)), essai("u-max", 9))
        return len(verrous)

    assert asyncio.run(scenario()) == 0, "un verrou reste apres le dernier essai"
    assert max(ensemble) == 1, "deux essais du meme compte sont passes ensemble"
