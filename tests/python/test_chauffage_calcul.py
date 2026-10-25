"""Le calcul du chauffage, sans Home Assistant (chantier Chauffage, spec 5.2).

Une fonction pure dit ce que le chauffage doit faire a une heure MURALE. Ce
qui merite d'etre verrouille : la semaine boucle, un jour vide reprend la
veille, un changement a l'instant meme est deja en vigueur, et la fenetre ne
fait que baisser.
"""
from __future__ import annotations

import ast

import pytest

from conftest import COMPOSANT, charger


@pytest.fixture(scope="module")
def calc():
    return charger("chauffage_calcul")


SEMAINE = {"lun": [{"h": "06:30", "mode": "confort"}, {"h": "22:30", "mode": "eco"}],
           "mar": [], "mer": [], "jeu": [], "ven": [], "sam": [], "dim": []}


def test_le_calcul_n_importe_rien_de_home_assistant():
    arbre = ast.parse((COMPOSANT / "chauffage_calcul.py").read_text(encoding="utf-8"))
    modules = {n.module for n in ast.walk(arbre) if isinstance(n, ast.ImportFrom)}
    modules |= {a.name for n in ast.walk(arbre) if isinstance(n, ast.Import) for a in n.names}
    assert not any(m and m.startswith("homeassistant") for m in modules), modules
    assert modules <= {"__future__", "re", "typing"}, modules


def test_les_modes_et_les_jours(calc):
    assert calc.MODES == ("confort", "confort_1", "confort_2", "eco", "hors_gel", "arret")
    assert calc.JOURS == ("lun", "mar", "mer", "jeu", "ven", "sam", "dim")
    assert sorted(calc.FROID) == sorted(calc.MODES), "chaque mode a sa place, du plus froid au plus chaud"
    # L'ordre lui-meme est le contrat : la fenetre et l'Absence ne font que baisser.
    assert calc.FROID == ("arret", "hors_gel", "eco", "confort_2", "confort_1", "confort")


def test_lire_et_ecrire_une_heure(calc):
    bom = chr(0xFEFF)  # que le trim() de JavaScript retirerait, et que ce calcul laisse
    exposant_deux = chr(0xB2)  # un chiffre pour Unicode, pas pour une heure
    assert calc.lire_heure("06:30") == 390
    assert calc.lire_heure("6:05") == 365
    assert calc.lire_heure("23:59") == 1439
    for mauvais in ("24:00", "12:60", "6:5", "midi", "", None, 930, "07:15:00", exposant_deux + "3:00"):
        assert calc.lire_heure(mauvais) is None, mauvais
    # Autour de l'heure, seuls l'espace, la tabulation et les fins de ligne s'en vont.
    assert calc.lire_heure("06:30\n") == 390
    assert calc.lire_heure("\t 07:15 \r\n") == 435
    assert calc.lire_heure(bom + "06:30") is None, "un BOM n'est pas un blanc a retirer"
    assert calc.ecrire_heure(390) == "06:30"
    assert calc.ecrire_heure(0) == "00:00"


def test_la_semaine_boucle_et_le_jour_vide_reprend_la_veille(calc):
    # Mercredi midi : rien ce jour-la, ni la veille - c'est lundi soir qui vaut.
    assert calc.mode_planning(SEMAINE, 2, 720) == "eco"
    # Lundi 05:00, avant le premier changement : c'est la fin de la semaine d'avant.
    assert calc.changement_en_cours(SEMAINE, 0, 300) == (0, 1350, "eco")
    # Le changement a l'instant meme est deja en vigueur.
    assert calc.mode_planning(SEMAINE, 0, 390) == "confort"
    assert calc.mode_planning(SEMAINE, 0, 389) == "eco"


def test_le_prochain_changement_est_strictement_apres_et_effectif(calc):
    assert calc.prochain_changement(SEMAINE, 0, 390) == (0, 1350, "eco")
    # Dimanche soir : le prochain est lundi matin, la semaine boucle.
    assert calc.prochain_changement(SEMAINE, 6, 1380) == (0, 390, "confort")
    double = {"lun": [{"h": "08:00", "mode": "eco"}, {"h": "12:00", "mode": "eco"},
                      {"h": "18:00", "mode": "confort"}]}
    assert calc.prochain_changement(double, 0, 540) == (0, 1080, "confort")
    assert calc.prochain_changement({"lun": [{"h": "07:00", "mode": "eco"}]}, 3, 0) is None
    assert calc.prochain_changement({}, 0, 0) is None
    # Deux changements a la meme minute n'en font qu'un : pas de faux Eco a 08:00.
    meme_minute = {"lun": [{"h": "08:00", "mode": "eco"}, {"h": "08:00", "mode": "confort"}]}
    assert calc.prochain_changement(meme_minute, 0, 479) is None


def test_une_semaine_abimee_perd_l_illisible_pas_le_reste(calc):
    abimee = {"lun": [{"h": "25:00", "mode": "confort"}, {"h": "07:00", "mode": "chaud"}, "x",
                      {"h": "09:00", "mode": "eco"}], "mar": "rien"}
    assert calc.changements(abimee) == [(540, "eco")]
    assert calc.changements(None) == []
    assert calc.mode_planning({}, 0, 0) is None
    # Saisie dans le desordre : la semaine est rangee par heure.
    desordre = {"lun": [{"h": "22:30", "mode": "eco"}, {"h": "06:30", "mode": "confort"}]}
    assert calc.changements(desordre) == [(390, "confort"), (1350, "eco")]
    # Deux changements a la meme minute n'en font qu'un : le dernier l'emporte.
    meme_minute = {"lun": [{"h": "08:00", "mode": "eco"}, {"h": "08:00", "mode": "confort"}]}
    assert calc.changements(meme_minute) == [(480, "confort")]
    assert calc.mode_planning(meme_minute, 0, 480) == "confort"


def test_la_reprise_en_main_et_sa_fin(calc):
    assert calc.reprise_active({"mode": "confort", "reste": 1}) is True
    assert calc.reprise_active({"mode": "confort", "reste": 0.5}) is True, "le moteur compte en minutes fractionnaires"
    assert calc.reprise_active({"mode": "confort", "reste": None}) is True, "jusqu'a relance"
    assert calc.reprise_active({"mode": "confort", "reste": 0}) is False
    assert calc.reprise_active({"mode": "confort"}) is False, "une cle absente n'est pas une reprise eternelle"
    assert calc.reprise_active({"mode": "confort", "reste": True}) is False
    assert calc.reprise_active(None) is False


def test_l_echelle_des_priorites(calc):
    maison = {"mode": "planning"}
    assert calc.mode_voulu(SEMAINE, maison, None, False, 0, 420)["source"] == "planning"
    assert calc.mode_voulu(SEMAINE, {"mode": "ete"}, None, False, 0, 420)["mode"] == "arret"
    reprise = {"mode": "hors_gel", "reste": 30, "fin": [0, 450]}
    voulu = calc.mode_voulu(SEMAINE, {"mode": "ete"}, reprise, False, 0, 420)
    assert (voulu["mode"], voulu["source"], voulu["fin"]) == ("hors_gel", "main", [0, 450])
    assert voulu["puis"] == "arret", "apres la reprise, l'ete reprend"
    assert calc.mode_voulu(SEMAINE, maison, reprise, True, 0, 420)["source"] == "fenetre"
    # Une fin de reprise illisible n'abat pas le calcul : la reprise tient, sans "jusqu'a".
    sans_fin = {"mode": "confort", "source": "main", "fin": None, "puis": None}
    for abimee in (["lun", 600], [None, None], [True, 600], [9, 99999], [0, 1440], [-1, 0], [0.5, 600],
                   [0], [0, 600, 5], "00:10", 450):
        lu = calc.mode_voulu(SEMAINE, maison, {"mode": "confort", "reste": 30, "fin": abimee}, False, 0, 420)
        assert lu == sans_fin, abimee
    en_tuple = {"mode": "hors_gel", "reste": 30, "fin": (0, 450)}
    assert calc.mode_voulu(SEMAINE, maison, en_tuple, False, 0, 420)["fin"] == [0, 450]


def test_la_fenetre_ne_fait_que_baisser(calc):
    ete = calc.mode_voulu(SEMAINE, {"mode": "ete"}, None, True, 0, 420, reglage_fenetre="eco")
    assert (ete["mode"], ete["source"]) == ("arret", "maison"), "un Eco fenetre ouverte rallumait l'ete"
    rien = calc.mode_voulu(SEMAINE, {"mode": "planning"}, None, True, 0, 420, reglage_fenetre="rien")
    assert rien["source"] == "planning"
    # Une reprise au mode inconnu ne dit rien : la fenetre ouverte reprend la parole (et ne leve pas).
    inconnu = calc.mode_voulu(SEMAINE, {"mode": "planning"}, {"mode": "boost", "reste": 30}, True, 0, 420)
    assert inconnu["source"] == "fenetre"


def test_l_absence_ne_fait_que_baisser_et_les_vacances_gardent_du_gel(calc):
    froide = {"lun": [{"h": "08:00", "mode": "arret"}, {"h": "18:00", "mode": "confort"}]}
    # Lundi 10:00, planning a l'Arret : l'Absence (Eco) ne rallume rien...
    absent = calc.mode_voulu(froide, {"mode": "absence"}, None, False, 0, 600)
    assert (absent["mode"], absent["source"]) == ("arret", "planning")
    # ... et la suite est ramenee a l'Eco : a 18:00, le Confort ne viendra pas.
    assert (absent["fin"], absent["puis"]) == ([0, 1080], "eco")
    # Lundi 19:00, planning en Confort : l'Absence baisse a l'Eco.
    soir = calc.mode_voulu(froide, {"mode": "absence"}, None, False, 0, 1140)
    assert (soir["mode"], soir["source"]) == ("eco", "maison")
    # Les Vacances mettent le Hors-gel meme sur un planning a l'Arret : la garde contre le gel.
    vac = calc.mode_voulu(froide, {"mode": "vacances"}, None, False, 0, 600)
    assert (vac["mode"], vac["source"]) == ("hors_gel", "maison")
    # Absence au MEME mode que le planning : c'est la maison qui parle, et il n'y a pas de "puis".
    pareil = {"lun": [{"h": "08:00", "mode": "eco"}, {"h": "18:00", "mode": "confort"}]}
    assert calc.mode_voulu(pareil, {"mode": "absence"}, None, False, 0, 600) == {
        "mode": "eco", "source": "maison", "fin": None, "puis": None}
