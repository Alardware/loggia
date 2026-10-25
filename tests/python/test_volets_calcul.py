"""Le planning des volets, en pur (chantier Volets, spec 6.2) - et sa parite JS.

`tests/fixtures/volets_parite.json` est lue ici ET par
`tests/voletsplanning.test.mjs`. La carte d'un volet lit `a_venir` dans l'etat
du serveur ; l'onglet Planning de sa fiche dessine la semaine avec le jumeau
(`src/voletsplanning.js`). S'ils divergeaient, la fiche dirait une heure et la
carte une autre. Le moteur lui-meme est rejoue contre ce calcul dans
`test_volets.py` (« Le calcul suit le moteur »).
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from conftest import charger

RACINE = Path(__file__).resolve().parents[2]
PARITE = json.loads((RACINE / "tests" / "fixtures" / "volets_parite.json").read_text(encoding="utf-8"))
SOLEIL = PARITE["soleils"]["octobre"]
PLANS = PARITE["plans"]


@pytest.fixture(scope="module")
def calc():
    return charger("volets_calcul")


def test_la_fixture_a_ses_cas():
    assert len(PARITE["a_venir"]) >= 15 and len(PARITE["semaine"]) >= 15, "la fixture a perdu des cas"
    assert len(PARITE["regles"]) >= 12 and len(PARITE["instants"]) >= 20 and len(PARITE["decalages"]) >= 4
    for liste in ("a_venir", "semaine", "regles", "decalages"):
        ids = [c["id"] for c in PARITE[liste]]
        assert len(ids) == len(set(ids)), liste + " : deux cas portent le meme identifiant"
    for cas in PARITE["a_venir"] + PARITE["semaine"]:
        assert cas["plan"] in PLANS and cas["soleil"] in PARITE["soleils"], cas["id"]


@pytest.mark.parametrize("texte,attendu", PARITE["instants"])
def test_chaque_instant(calc, texte, attendu):
    assert calc.epoque(texte) == attendu


@pytest.mark.parametrize("cas", PARITE["regles"], ids=lambda c: c["id"])
def test_chaque_regle(calc, cas):
    assert calc.regle_de(cas["plan"], "cover.x") == cas["attendu"]


@pytest.mark.parametrize("cas", PARITE["decalages"], ids=lambda c: c["id"])
def test_chaque_decalage(calc, cas):
    assert calc.decalage_de(cas["plan"], "cover.x", cas["sens"]) == cas["attendu"]


@pytest.mark.parametrize("cas", PARITE["a_venir"], ids=lambda c: c["id"])
def test_chaque_a_venir(calc, cas):
    lu = calc.a_venir(PLANS[cas["plan"]], cas["volet"], PARITE["soleils"][cas["soleil"]], cas["maintenant"])
    assert lu == cas["attendu"]


@pytest.mark.parametrize("cas", PARITE["semaine"], ids=lambda c: c["id"])
def test_chaque_semaine(calc, cas):
    lu = calc.semaine(PLANS[cas["plan"]], cas["volet"], PARITE["soleils"][cas["soleil"]], cas["lundi"])
    assert lu == cas["attendu"]


# ── Les regles, ecrites a la main (la fixture ne s'evalue pas elle-meme) ────

def test_le_salon_ouvre_et_ferme_avec_son_decalage(calc):
    """Le lever du mercredi 21/10 est a 08:17:00 ; +30 min."""
    (premier, deuxieme) = calc.a_venir(PLANS["chez_lui"], "cover.salon", SOLEIL, "2026-10-21T06:00:00+02:00")[:2]
    assert premier == {"sens": "ouverture", "heure": "2026-10-21T08:47:00+02:00", "source": "lever", "decalage": 30}
    assert deuxieme == {"sens": "fermeture", "heure": "2026-10-21T19:25:00+02:00", "source": "coucher", "decalage": 30}


def test_la_chambre_ne_s_ouvre_jamais_seule(calc):
    """Sa configuration du 12/10 : `jours_ouverture: []` veut dire jamais."""
    sens = {m["sens"] for m in calc.a_venir(PLANS["chez_lui"], "cover.chambre", SOLEIL, "2026-10-21T06:00:00+02:00")}
    assert sens == {"fermeture"}


def test_jamais_manuel_et_planning_coupe_ne_donnent_rien(calc):
    assert calc.a_venir(PLANS["chez_lui"], "cover.groupe", SOLEIL, "2026-10-21T06:00:00+02:00") == []
    for nom in ("manuel", "coupe"):
        assert calc.a_venir(PLANS[nom], "cover.salon", SOLEIL, "2026-10-21T06:00:00+02:00") == [], nom
    assert {m["sens"] for m in calc.a_venir(PLANS["nuit"], "cover.salon", SOLEIL,
                                           "2026-10-21T06:00:00+02:00")} == {"fermeture"}


def test_les_jours_propres_remplacent_ceux_de_la_maison(calc):
    """V5 : la maison du lundi au vendredi, la chambre « Heures a lui » le samedi
    et le dimanche - elle s'ouvre le week-end. Ses fermetures, sans jours
    propres, suivent la maison ; et des jours sans « Heures a lui » ne comptent
    pas."""
    plan = PLANS["semaine_maison"]
    assert [calc.bouge(plan, "cover.chambre", "ouverture", j) for j in range(7)] == [False] * 5 + [True] * 2
    assert [calc.bouge(plan, "cover.chambre", "fermeture", j) for j in range(7)] == [True] * 5 + [False] * 2
    assert [calc.bouge(PLANS["jours_sans_perso"], "cover.salon", "ouverture", j)
            for j in range(7)] == [True] * 5 + [False] * 2


def test_un_decalage_negatif_avance_l_heure(calc):
    """Lever du lundi 26/10 a 07:24:05 (heure d'hiver), -45 min."""
    plan = PLANS["negatifs"]
    assert calc.decalage_de(plan, "cover.chambre", "ouverture") == -45
    assert calc.decalage_de(plan, "cover.chambre", "fermeture") == -120
    (ligne,) = [lg for lg in calc.semaine(plan, "cover.chambre", SOLEIL, "2026-10-26") if lg["date"] == "2026-10-26"]
    assert ligne == {"date": "2026-10-26", "ouverture": "06:39", "fermeture": "15:45"}


def test_l_ancienne_forme_garde_son_decalage(calc):
    """Un decalage propre sans `perso` : le moteur l'applique, l'ecran le lit
    « Heures a lui »."""
    plan = PLANS["ancienne_forme"]
    assert calc.regle_de(plan, "cover.salon") == "perso"
    assert calc.decalage_de(plan, "cover.salon", "ouverture") == 45
    assert calc.decalage_de(plan, "cover.salon", "fermeture") == 0


def test_au_dela_de_neuf_chiffres_un_entier_est_illisible(calc):
    """Plus de 4 300 chiffres dans `.storage` : `int()` levait ValueError, et tout
    `loggia/volets/etat` tombait avec lui ; le JavaScript rendait Infinity. Neuf
    chiffres au plus, des deux cotes (les cas « decalages » de la fixture) : au-dela,
    le decalage de la maison reprend, et le jour est ecarte."""
    plan = {**PLANS["chez_lui"], "volets": {"cover.salon": {"ouverture": "9" * 5000,
                                                           "jours_fermeture": ["1" * 5000, 3]}}}
    assert calc.decalage_de(plan, "cover.salon", "ouverture") == 30
    assert calc.jours_propres(plan, "cover.salon", "fermeture") == {3}
    lus = calc.a_venir(plan, "cover.salon", SOLEIL, "2026-10-21T06:00:00+02:00")
    assert lus[0] == {"sens": "ouverture", "heure": "2026-10-21T08:47:00+02:00", "source": "lever", "decalage": 30}
    assert {m["heure"] for m in lus if m["sens"] == "fermeture"} == {"2026-10-22T19:23:10+02:00"}, "le jeudi seul"


def test_le_jour_qui_compte_est_celui_de_l_heure(calc):
    """Un coucher +240 min sonne apres minuit : le moteur lit le jour quand la
    cloche sonne. La maison ne ferme pas le week-end : la fermeture du vendredi
    soir (samedi 01:58) ne part pas, celle du dimanche soir (lundi 01:58) si."""
    lignes = {lg["date"]: lg for lg in calc.semaine(PLANS["tard"], "cover.salon", PARITE["soleils"]["juin"], "2026-06-15")}
    assert lignes["2026-06-19"]["fermeture"] is None
    assert lignes["2026-06-21"] == {"date": "2026-06-21", "ouverture": None, "fermeture": "01:58"}


def test_un_jour_sans_lever_ni_coucher_n_a_rien(calc):
    lignes = calc.semaine(PLANS["chez_lui"], "cover.cuisine", PARITE["soleils"]["polaire"], "2026-12-21")
    assert lignes[0] == {"date": "2026-12-21", "ouverture": None, "fermeture": None}
    assert lignes[2] == {"date": "2026-12-23", "ouverture": None, "fermeture": "13:10"}


def test_l_heure_exacte_n_est_plus_a_venir_et_la_borne_haute_l_est(calc):
    """Strictement apres `maintenant`, et jusqu'a sept jours pile."""
    a_l_heure = calc.a_venir(PLANS["chez_lui"], "cover.salon", SOLEIL, "2026-10-21T08:47:00+02:00")
    assert a_l_heure[0]["heure"] == "2026-10-21T19:25:00+02:00"
    pile = calc.a_venir(PLANS["chez_lui"], "cover.salon", SOLEIL, "2026-10-21T08:56:55+02:00")
    assert len(pile) == 14 and pile[-1]["heure"] == "2026-10-28T07:56:55+01:00"


def test_quatorze_au_plus(calc, monkeypatch):
    """Le cas « quatorze_au_plus » de la fixture : le mercredi a 19:20, QUINZE
    mouvements tombent dans les sept jours - le soir meme jusqu'au mercredi
    suivant, ouverture et fermeture comprises. Le plafond coupe le quinzieme, la
    fermeture du 28/10 ; sans lui, on les verrait tous."""
    (cas,) = [c for c in PARITE["a_venir"] if c["id"] == "quatorze_au_plus"]
    monkeypatch.setattr(calc, "A_VENIR_MAX", 99)
    tous = calc.a_venir(PLANS[cas["plan"]], cas["volet"], SOLEIL, cas["maintenant"])
    assert len(tous) == 15 and tous[-1]["heure"] == "2026-10-28T18:12:10+01:00"
    monkeypatch.undo()
    assert calc.A_VENIR_MAX == 14
    assert calc.a_venir(PLANS[cas["plan"]], cas["volet"], SOLEIL, cas["maintenant"]) == tous[:14] == cas["attendu"]
    assert cas["attendu"][-1]["heure"] == "2026-10-28T07:56:55+01:00"


def test_rien_ne_leve_sur_un_plan_ou_un_soleil_abimes(calc):
    for plan in (None, [], "x", {"volets": "x", "jours": {"0": 1}, "ouverture": [], "actif": True}):
        for soleil in (None, "x", [None, 3, {"date": None}], [{"date": "2026-10-21", "lever": 5}]):
            assert calc.a_venir(plan, "cover.salon", soleil, "2026-10-21T00:00:00+02:00") is not None
            assert len(calc.semaine(plan, "cover.salon", soleil, "2026-10-19")) == 7
