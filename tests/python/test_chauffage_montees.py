"""La mesure des montees en temperature : le calcul seul (ADR 0340)."""
from __future__ import annotations

import types
from datetime import datetime, timedelta, timezone

import pytest

from conftest import charger

UTC = timezone.utc
D = datetime(2026, 11, 9, 5, 0, tzinfo=UTC)
SEMAINE = {"lun": [{"h": "06:30", "mode": "confort"}, {"h": "08:30", "mode": "eco"}],
           "mar": [], "mer": [], "jeu": [], "ven": [], "sam": [], "dim": []}


def mn(n):
    return timedelta(minutes=n)


@pytest.fixture
def m():
    return charger("chauffage_montees")


def test_plus_chaud_suit_l_ordre_des_modes(m):
    assert m.plus_chaud("eco", "confort_1") and m.plus_chaud("arret", "hors_gel")
    assert not m.plus_chaud("confort", "eco") and not m.plus_chaud("eco", "eco")
    assert not m.plus_chaud(None, "eco") and not m.plus_chaud("eco", "inconnu")


def test_le_passage_du_planning_dit_le_mode_quitte(m):
    assert m.passage_du_planning(SEMAINE, 0, 390) == "eco", "lundi 06:30 : la semaine boucle sur le dernier Eco"
    assert m.passage_du_planning(SEMAINE, 0, 395) == "eco", "cinq minutes apres : encore le passage"
    assert m.passage_du_planning(SEMAINE, 0, 396) is None, "au-dela : une fenetre refermee, un retour d'appareil"
    assert m.passage_du_planning({}, 0, 390) is None


def test_une_montee_normale_se_resume(m):
    points = [(D - mn(10), 17.0), (D + mn(30), 17.5), (D + mn(60), 18.5)]
    assert m.resume_montee(points, D, D + mn(75)) == {"t0": 17.0, "gain": 1.5, "duree": 75, "pour_un_degre": 45}


def test_un_gain_negatif_est_garde(m):
    r = m.resume_montee([(D - mn(5), 18.0), (D + mn(30), 17.6), (D + mn(40), 17.7)], D, D + mn(60))
    assert r["gain"] == -0.3 and r["pour_un_degre"] is None


def test_une_sonde_muette_ecarte_la_montee(m):
    assert m.resume_montee([(D - mn(181), 17.0), (D + mn(30), 18.0)], D, D + mn(60)) is None, "valeur de plus de 3 h"
    assert m.resume_montee([(D + mn(30), 18.0)], D, D + mn(60)) is None, "rien avant"
    assert m.resume_montee([(D - mn(5), 17.0)], D, D + mn(60)) is None, "rien apres"


def test_un_creneau_de_moins_de_vingt_minutes_ne_compte_pas(m):
    points = [(D - mn(5), 17.0), (D + mn(10), 17.4)]
    assert m.resume_montee(points, D, D + mn(19)) is None
    assert m.resume_montee(points, D, D + mn(20))["duree"] == 20


def test_seules_les_quatre_premieres_heures_sont_mesurees(m):
    points = [(D - mn(5), 17.0), (D + mn(240), 19.0), (D + mn(300), 21.0)]
    r = m.resume_montee(points, D, D + mn(360))
    assert (r["gain"], r["duree"]) == (2.0, 240)


def test_un_point_manquant_s_interpole(m):
    r = m.resume_montee([(D - mn(5), 17.0), (D + mn(100), 19.0)], D, D + mn(50))
    assert (r["gain"], r["duree"], r["pour_un_degre"]) == (1.0, 50, 50)


def montee(n=0, gain=1.0, duree=60):
    return {"debut": (D + timedelta(days=n)).isoformat(), "de": "eco", "a": "confort", "t0": 17.0, "gain": gain,
            "duree": duree, "pour_un_degre": 60, "ext": 7.2}


def test_la_liste_se_range_et_garde_quatre_vingt_dix_montees(m):
    liste = []
    for n in range(95, 0, -1):
        liste = m.ajouter(liste, montee(n))
    assert len(liste) == 90 and liste[0] == montee(6) and liste[-1] == montee(95)


def test_le_rythme_est_la_mediane_a_partir_de_trois_montees(m):
    assert m.rythme([montee(), montee(1)]) is None
    assert m.rythme([montee(0, 1.0, 60), montee(1, 0.5, 60), montee(2, 2.0, 60)]) == 1.0


def test_le_rythme_ne_regarde_que_les_trente_dernieres(m):
    assert m.rythme([montee(i, 9.0) for i in range(5)] + [montee(10 + i, 1.0) for i in range(30)]) == 1.0


@pytest.mark.parametrize("brut", [None, "x", [], {"en_cours": 1, "montees": 2}, {"montees": {"a": "x"}},
                                  {"montees": {"a": [{"debut": "pas une date"}]}}, {"en_cours": {"a": {"sonde": 3}}}])
def test_un_fichier_abime_vaut_un_fichier_vide(m, brut):
    assert m.lire_fichier(brut) == {"en_cours": {}, "montees": {}}


def test_le_fichier_garde_ce_qui_se_lit(m):
    en_cours = {"debut": D.isoformat(), "fin_prevue": None, "de": "eco", "a": "confort", "sonde": "sensor.x",
                "attribut": None, "ext": None}
    lu = m.lire_fichier({"en_cours": {"a": en_cours, "b": {"sonde": 1}}, "montees": {"a": [montee(), {"t0": True}]}})
    assert lu == {"en_cours": {"a": en_cours}, "montees": {"a": [montee()]}}


def test_les_chauffages_retires_sont_oublies(m):
    etat = {"en_cours": {"a": 1, "b": 2}, "montees": {"a": [3], "b": [4]}}
    assert m.garder(etat, {"a"}) == {"en_cours": {"a": 1}, "montees": {"a": [3]}}


def releve(state, attributes=None):
    return types.SimpleNamespace(state=state, last_updated=D, attributes=attributes or {})


def test_les_points_lus_ne_gardent_que_des_nombres_en_celsius(m):
    assert m.points_lus([releve("68"), releve("unknown"), releve("nan")], None, "F") == [(D, 20.0)]
    assert m.points_lus([releve("heat", {"current_temperature": 19.5}), releve("heat")], "current_temperature", "C") == [(D, 19.5)]


def sonde(m, **k):
    base = dict(entite="select.rad", famille="fil_pilote", zones=None, pieces=None, nom_zone="Bureau",
                sur_appareil=[], dans_zone=[], existe=lambda x: True, mesure_propre=False)
    return m.choisir_sonde(**{**base, **k})


def test_la_sonde_decrite_a_la_main_passe_d_abord(m):
    zones = [{"modeEnt": "select.rad", "tempSensor": "sensor.main"}]
    pieces = [{"room": "Bureau", "haid": {"temp": "sensor.piece"}}]
    assert sonde(m, zones=zones, pieces=pieces) == {"sonde": "sensor.main", "attribut": None}


def test_puis_la_sonde_de_la_piece_rapprochee_par_le_nom(m):
    pieces = [{"room": " bureau ", "haid": {"temp": "sensor.piece"}}]
    assert sonde(m, pieces=pieces, sur_appareil=["sensor.module"]) == {"sonde": "sensor.piece", "attribut": None}


def test_la_sonde_de_la_piece_ne_peut_pas_etre_portee_par_l_appareil(m):
    pieces = [{"room": "Bureau", "haid": {"temp": "sensor.module"}}]
    assert sonde(m, pieces=pieces, sur_appareil=["sensor.module"]) == {"sonde": "sensor.module", "attribut": None}
    assert sonde(m, famille="thermostat", pieces=pieces, sur_appareil=["sensor.module"]) is None


def test_le_capteur_de_l_appareil_ne_vaut_que_pour_un_fil_pilote(m):
    assert sonde(m, sur_appareil=["sensor.module"])["sonde"] == "sensor.module"
    assert sonde(m, famille="thermostat", sur_appareil=["sensor.fumees"]) is None


def test_puis_le_premier_capteur_de_la_zone_hors_de_l_appareil(m):
    r = sonde(m, famille="thermostat", sur_appareil=["sensor.fumees"], dans_zone=["sensor.fumees", "sensor.zone"])
    assert r == {"sonde": "sensor.zone", "attribut": None}


def test_enfin_la_mesure_d_un_thermostat(m):
    r = sonde(m, entite="climate.poele", famille="thermostat", mesure_propre=True)
    assert r == {"sonde": "climate.poele", "attribut": "current_temperature"}


def test_une_sonde_qui_n_existe_plus_ne_compte_pas(m):
    zones = [{"haid": "select.rad", "tempSensor": "sensor.main"}]
    assert sonde(m, zones=zones, existe=lambda x: False) is None
