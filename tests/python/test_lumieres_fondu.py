"""Un fondu demande par Loggia ne remplit pas le carnet (chantier G5, ADR 0304).

Un scenario demande a une lampe un fondu (`transition`) : elle le fait elle-meme
et, selon son integration, publie ses paliers - toutes les secondes, toutes les
quarante, ou pas du tout. La fonte du carnet (FONDRE_S, 30 s) et l'echo d'une
extinction (ECHO_S, 10 s) ne couvrent pas trois minutes : « Reveil » aurait fait
six « Reglee a », « Bonne nuit » une « Reglee a 40 % » avant l'extinction, et la
lampe « se serait rallumee a 3 % ». Ce qui est verrouille ici : un fondu de trois
minutes ne fait qu'UNE entree, dans les deux sens, et le reste ne change pas.
"""
from __future__ import annotations

from datetime import datetime

import pytest

from conftest import charger
from test_chauffage import FuseauParis

PARIS = FuseauParis()
# Le vendredi 30/10/2026 a 07:00, a Paris : le Reveil.
T = datetime(2026, 10, 30, 7, 0, tzinfo=PARIS).timestamp()


@pytest.fixture(scope="module")
def calc():
    return charger("lumieres_calcul")


def note(when, state, bri=None, reglage=False, user=None):
    return {"when": when, "state": state, "bri": bri, "reglage": reglage,
            "context_user_id": user, "context_event_type": None, "context_name": None}


def a(pct):
    """Les attributs d'une lampe allumee a `pct` %, en blanc."""
    return {"brightness": round(pct * 255 / 100), "color_mode": "color_temp", "color_temp_kelvin": 2700}


# Le contexte de l'ordre du scenario (`Context.id`) : ses premiers paliers le portent, avec le compte de qui l'a lance.
SCN = "ctx-scenario"


def vue_eteinte(calc, t=T - 3600):
    return calc.noter(calc.fiche_neuve(), "off", {}, t, calc.contexte(None))


def vue_allumee(calc, pct, t=T - 3600):
    f = calc.noter(calc.fiche_neuve(), "off", {}, t - 60, calc.contexte(None))
    return calc.noter(f, "on", a(pct), t, calc.contexte(None))


@pytest.mark.parametrize("pas", [2, 15, 40, 61])
def test_un_reveil_de_trois_minutes_ne_fait_qu_une_entree(calc, pas):
    """« Reveil » : 30 % en trois minutes, lance par u-papa. Le premier etat porte
    son contexte, les paliers n'en ont plus (Home Assistant ne le garde que
    quelques secondes) ; tous les `pas` secondes. UNE note : « Allumee a 30 % »,
    a l'heure du geste, a son nom."""
    f = calc.annoncer_fondu(vue_eteinte(calc), T, 180, False, "u-papa", SCN)
    f = calc.noter(f, "on", a(1), T + 0.5, calc.contexte("u-papa"), origine=SCN)
    t, pct = T + 0.5, 1
    while t + pas <= T + 180:
        t += pas
        pct = min(30, pct + max(1, round(29 * pas / 180)))
        f = calc.noter(f, "on", a(pct), t, calc.contexte(None))
    f = calc.noter(f, "on", a(30), T + 181, calc.contexte(None))
    assert f["evenements"] == [note(T + 0.5, "on", 30, user="u-papa")]
    assert f["dernier"]["bri"] == 30


def test_sans_le_fondu_annonce_des_paliers_espaces_font_chacun_leur_note(calc):
    """Le temoin : sans `annoncer_fondu`, rien ne change - des reglages a plus de
    30 s l'un de l'autre font chacun leur note (FONDRE_S)."""
    f = calc.noter(vue_eteinte(calc), "on", a(1), T, calc.contexte("u-papa"))
    for i, pct in enumerate((10, 20, 30), start=1):
        f = calc.noter(f, "on", a(pct), T + 40 * i, calc.contexte(None))
    assert len(f["evenements"]) == 4


def test_un_reveil_sur_une_lampe_deja_allumee_fait_un_seul_reglage(calc):
    f = calc.annoncer_fondu(vue_allumee(calc, 10), T, 180, False, "u-papa", SCN)
    f = calc.noter(f, "on", a(12), T + 1, calc.contexte("u-papa"), origine=SCN)
    for i, pct in enumerate((18, 24, 30), start=1):
        f = calc.noter(f, "on", a(pct), T + 1 + 45 * i, calc.contexte(None))
    assert f["evenements"][-1] == note(T + 1, "on", 30, reglage=True, user="u-papa")
    assert len(f["evenements"]) == 2, "l'allumage d'avant, puis UN reglage"


def test_une_extinction_en_fondu_ne_fait_qu_une_entree_et_garde_le_niveau_d_avant(calc):
    """« Bonne nuit » s'eteint en dix secondes : les paliers descendent, puis `off`.
    UNE note, « Eteinte » ; et la lampe se rallumera a 80 %, pas a 3 %."""
    f = calc.annoncer_fondu(vue_allumee(calc, 80), T, 10, True, "u-papa", SCN)
    for i, pct in enumerate((60, 30, 3), start=1):
        f = calc.noter(f, "on", a(pct), T + 2 * i, calc.contexte("u-papa" if i == 1 else None), origine=SCN if i == 1 else None)
    f = calc.noter(f, "off", {}, T + 10, calc.contexte(None))
    assert f["evenements"][-1] == note(T + 10, "off", user="u-papa"), "l'extinction est celle du geste"
    assert [n["state"] for n in f["evenements"]] == ["on", "off"]
    assert f["dernier"]["bri"] == 80


def test_une_extinction_de_trois_minutes_et_son_echo_ne_font_qu_une_entree(calc):
    """Une integration qui dit `off` des le debut, puis remonte un palier `on` une
    minute plus tard (l'echo, D2), puis le `off` final : bien au-dela de ECHO_S. UNE
    extinction, a l'heure du geste, et le niveau d'avant reste."""
    f = calc.annoncer_fondu(vue_allumee(calc, 80), T, 180, True, "u-papa", SCN)
    f = calc.noter(f, "off", {}, T + 1, calc.contexte("u-papa"), origine=SCN)
    f = calc.noter(f, "on", a(20), T + 60, calc.contexte(None))
    f = calc.noter(f, "off", {}, T + 175, calc.contexte(None))
    assert [n["state"] for n in f["evenements"]] == ["on", "off"]
    assert f["evenements"][-1] == note(T + 1, "off", user="u-papa")
    assert f["dernier"]["bri"] == 80


def test_pendant_le_fondu_un_autre_geste_reste_un_geste(calc):
    """Le fondu n'avale que ses propres paliers : quelqu'un d'autre qui remonte la
    lampe pendant l'extinction se note, et un rallumage plus haut qu'avant aussi."""
    f = calc.annoncer_fondu(vue_allumee(calc, 80), T, 180, True, "u-papa")
    f = calc.noter(f, "on", a(50), T + 20, calc.contexte("u-maman"))
    assert f["evenements"][-1] == note(T + 20, "on", 50, reglage=True, user="u-maman")
    g = calc.annoncer_fondu(vue_allumee(calc, 40), T, 180, True, "u-papa")
    g = calc.noter(g, "off", {}, T + 1, calc.contexte("u-papa"))
    g = calc.noter(g, "on", a(100), T + 30, calc.contexte(None))
    assert [n["state"] for n in g["evenements"]] == ["on", "off", "on"], "plus haut qu'avant : un vrai rallumage"


def test_le_fondu_fini_le_carnet_reprend_ses_regles(calc):
    f = calc.annoncer_fondu(vue_eteinte(calc), T, 3, False, "u-papa")
    f = calc.noter(f, "on", a(10), T + 1, calc.contexte("u-papa"))
    # Bien apres la fin du fondu (3 s, plus la marge) : un reglage a 40 s fait sa note.
    f = calc.noter(f, "on", a(50), T + 60, calc.contexte(None))
    assert len(f["evenements"]) == 2
    assert "fondu" not in f, "un fondu passe s'oublie"


def test_un_fondu_ne_s_ecrit_jamais(calc):
    f = calc.annoncer_fondu(vue_eteinte(calc), T, 180, False, None)
    assert "fondu" in f
    assert "fondu" not in calc.sans_fondu(f)
    assert calc.sans_fondu(vue_eteinte(calc)) == vue_eteinte(calc)
    # Une duree nulle, illisible : pas de fondu.
    for duree in (0, -5, None, "3", True):
        assert calc.annoncer_fondu(vue_eteinte(calc), T, duree, False, None) == vue_eteinte(calc)


# ── La relecture du 31/10 : un geste reste un geste, et l'auteur ne se prete que dans le sens du fondu ──

def test_un_rallumage_a_la_main_pendant_une_extinction_en_fondu_se_note(calc):
    """Extinction en 3 min, `off` a T+1. A T+60, l'interrupteur mural la rallume a son
    niveau d'avant (80 % : pas STRICTEMENT plus bas) : c'est un geste, il se note, et
    l'extinction d'apres aussi (preuve R1 de la relecture)."""
    f = calc.annoncer_fondu(vue_allumee(calc, 80), T, 180, True, "u-papa", SCN)
    f = calc.noter(f, "off", {}, T + 1, calc.contexte("u-papa"), origine=SCN)
    f = calc.noter(f, "on", a(80), T + 60, calc.contexte(None))
    assert f["vu"]["state"] == "on"
    assert f["evenements"][-1] == note(T + 60, "on", 80), "sans auteur prete : un `on` ne va pas dans le sens d'une extinction"
    f = calc.noter(f, "off", {}, T + 300, calc.contexte(None))
    assert [n["state"] for n in f["evenements"]] == ["on", "off", "on", "off"]


def test_le_geste_d_un_compte_pendant_une_extinction_en_fondu_ne_s_efface_jamais(calc):
    """« Bonne nuit » (10 s) lance par u-papa ; 12 s plus tard, u-papa rallume sa lampe
    de chevet PAR LOGGIA - un autre ordre, un autre contexte - a 60 %, plus bas qu'avant.
    Un compte : il se note (preuve R1b). Le palier du fondu lui-meme, qui porte le
    contexte de l'ordre du scenario, reste avale."""
    f = calc.annoncer_fondu(vue_allumee(calc, 80), T, 10, True, "u-papa", SCN)
    f = calc.noter(f, "off", {}, T + 1, calc.contexte("u-papa"), origine=SCN)
    f = calc.noter(f, "on", a(60), T + 12, calc.contexte("u-papa"), origine="ctx-chevet")
    assert f["vu"]["state"] == "on" and f["evenements"][-1] == note(T + 12, "on", 60, user="u-papa")
    g = calc.annoncer_fondu(vue_allumee(calc, 80), T, 10, True, "u-papa", SCN)
    g = calc.noter(g, "on", a(70), T + 1, calc.contexte("u-papa"), origine=SCN)
    assert [n["state"] for n in g["evenements"]] == ["on"] and g["dernier"]["bri"] == 80


def test_une_extinction_a_la_main_pendant_un_reveil_garde_son_auteur(calc):
    """« Reveil » vers 30 % : un `off` a l'interrupteur a T+90 ne va pas dans le sens du
    fondu. Il ne prend pas le nom de qui a lance le scenario (preuve R2)."""
    f = calc.annoncer_fondu(vue_eteinte(calc), T, 180, False, "u-papa", SCN)
    f = calc.noter(f, "on", a(5), T + 1, calc.contexte("u-papa"), origine=SCN)
    f = calc.noter(f, "off", {}, T + 90, calc.contexte(None))
    assert f["evenements"][-1] == note(T + 90, "off"), "un geste mural, sans auteur"
    # Et l'inverse : pendant une extinction, un rallumage sans compte ne prend pas son nom non plus.
    g = calc.annoncer_fondu(vue_allumee(calc, 40), T, 180, True, "u-papa", SCN)
    g = calc.noter(g, "off", {}, T + 1, calc.contexte(None))
    assert g["evenements"][-1] == note(T + 1, "off", user="u-papa"), "l'extinction, dans le sens du fondu, est la sienne"
    g = calc.noter(g, "on", a(100), T + 30, calc.contexte(None))
    assert g["evenements"][-1] == note(T + 30, "on", 100)


def test_un_autre_ordre_du_meme_scenario_n_est_pas_avale(calc):
    """Contre-relecture du 31/10 (C4), au carnet : l'allumage a 20 % qui suit une
    extinction en fondu dans le meme scenario porte son PROPRE contexte (celui du
    lancement), pas celui de l'ordre du fondu : il se note, la lampe est allumee."""
    f = calc.annoncer_fondu(vue_allumee(calc, 80), T, 10, True, "u-papa", "ctx-fondu")
    f = calc.noter(f, "off", {}, T + 0.2, calc.contexte("u-papa"), origine="ctx-fondu")
    f = calc.noter(f, "on", a(20), T + 0.4, calc.contexte("u-papa"), origine="ctx-lancement")
    assert f["vu"]["state"] == "on" and f["evenements"][-1] == note(T + 0.4, "on", 20, user="u-papa")
