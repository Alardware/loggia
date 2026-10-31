"""L'eau chaude pendant les vacances (chantier G3, E2 ; ADR 0302).

Une OPTION du chauffage, decochee par defaut : pendant les Vacances, les
chauffe-eau qui savent le faire passent en mode absence, et le quittent avant le
retour. Loggia ne leve que ce qu'il a pose ; « Observer sans agir » n'envoie rien.
"""
from __future__ import annotations

from datetime import timedelta

import pytest

from conftest import FauxStore, charger
from test_chauffage import FauxEtat, LUNDI_0700, config, creer, lancer, module, paris, regles_module  # noqa: F401


@pytest.fixture
def eau():
    return charger("eau_chaude")


@pytest.fixture
def cc():
    return charger("chauffage_config")


BALLON = "water_heater.ballon"
SAIT = {"supported_features": 1 | 2 | 4}


def vacances(fin=None, option=True):
    cfg = config(maison={"mode": "vacances", "vacances_fin": fin.isoformat() if fin else None})
    cfg["eau_chaude"] = {"absence": option}
    return cfg


def table(away="off", **attrs):
    return {BALLON: FauxEtat("eco", {**SAIT, "away_mode": away, **attrs}),
            "water_heater.sans_absence": FauxEtat("eco", {"supported_features": 1})}


def appels(m):
    return [a for a in m.hass.services.appels if a[0] == "water_heater"]


def test_l_option_est_decochee_par_defaut(cc):
    assert cc.config_defaut()["eau_chaude"] == {"absence": False}
    assert cc.lire_config({"eau_chaude": {"absence": "oui"}})["eau_chaude"] == {"absence": False}
    cfg = cc.config_defaut()
    cc.poser_patch(cfg, {"eau_chaude": {"absence": True}}, {})
    assert cfg["eau_chaude"] == {"absence": True}
    with pytest.raises(ValueError):
        cc.poser_patch(cfg, {"eau_chaude": {"absence": 1}}, {})


def test_le_mode_absence_se_leve_avant_le_retour(eau):
    fin = paris(2026, 10, 20, 0)
    cfg = vacances(fin)
    assert eau.levee_a(cfg) == fin - eau.AVANCE_RETOUR
    assert eau.absence_voulue(cfg, fin - timedelta(hours=13)) is True
    assert eau.absence_voulue(cfg, fin - timedelta(hours=11)) is False
    assert eau.absence_voulue(vacances(fin, option=False), LUNDI_0700) is False
    assert eau.absence_voulue(vacances(None), LUNDI_0700) is True, "sans date de fin : jusqu'au retour au Planning"
    assert eau.absence_voulue(config(), LUNDI_0700) is False


def test_loggia_ne_leve_que_ce_qu_il_a_pose(eau):
    assert eau.ordres_absence({"a": "off", "b": "on", "c": None}, True, set()) == ([("a", True)], {"a"}, set(), set())
    # « b » etait en absence a la main : il n'est pas a nous.
    assert eau.ordres_absence({"a": "on", "b": "on"}, False, {"a"}) == ([("a", False)], set(), set(), set())
    # Muet au moment de lever : on le gardera pour son retour.
    assert eau.ordres_absence({"a": None}, False, {"a"}) == ([], {"a"}, set(), set())
    # Disparu de Home Assistant : plus rien a tenir.
    assert eau.ordres_absence({}, False, {"a"}) == ([], set(), set(), set())


def test_le_moteur_pose_puis_leve_et_s_en_souvient(creer):
    fin = LUNDI_0700 + timedelta(days=3)
    m = creer(vacances(fin), table())
    m._depot_eau = FauxStore(None)
    lancer(m.async_evaluer())
    assert appels(m) == [("water_heater", "set_away_mode", {"entity_id": [BALLON], "away_mode": True})]
    assert lancer(m._depot_eau.async_load()) == {"poses": [BALLON], "laisses": [], "vus": []}
    # Le lendemain du depart, l'appareil est en absence : rien ne repart, et il est VU en absence.
    m.hass.states.table[BALLON] = FauxEtat("eco", {**SAIT, "away_mode": "on"})
    m.hass.services.appels.clear()
    lancer(m.async_evaluer())
    assert appels(m) == []
    assert lancer(m._depot_eau.async_load()) == {"poses": [BALLON], "laisses": [], "vus": [BALLON]}
    # Le minuteur du chauffage se reveille pour lever avant le retour.
    assert m.prochain_reveil(LUNDI_0700) == fin - timedelta(hours=12)
    # Douze heures avant la fin : leve.
    m.horloge = fin - timedelta(hours=11)
    lancer(m.async_evaluer())
    assert appels(m) == [("water_heater", "set_away_mode", {"entity_id": [BALLON], "away_mode": False})]
    assert lancer(m._depot_eau.async_load()) == {"poses": [], "laisses": [], "vus": []}


def test_sans_l_option_rien_ne_part(creer):
    m = creer(vacances(None, option=False), table())
    m._depot_eau = FauxStore(None)
    lancer(m.async_evaluer())
    assert appels(m) == []


def test_en_observation_rien_ne_part(creer):
    cfg = vacances(None)
    cfg["simulation"] = {"actif": True}
    m = creer(cfg, table())
    m._depot_eau = FauxStore(None)
    lancer(m.async_evaluer())
    assert appels(m) == []


def test_l_etat_publie_l_option(creer):
    m = creer(vacances(None), table())
    m._depot_eau = FauxStore(None)
    assert lancer(m.async_etat())["eau_chaude"] == {"absence": True}


# ── Relecture indépendante du 30/10 : les points 1 et 5 ─────────────────────

def test_un_ballon_remis_a_la_main_pendant_les_vacances_n_est_pas_repose(eau):
    """Posé par Loggia, remis hors absence à la main : il sort de la liste, sans
    nouvel ordre — et reste laissé tranquille jusqu'à la fin des Vacances."""
    # Vu en absence depuis notre ordre (`vus`), puis « off » : un geste.
    ordres, poses, laisses, vus = eau.ordres_absence({BALLON: "off"}, True, {BALLON}, set(), {BALLON})
    assert (ordres, poses, laisses, vus) == ([], set(), {BALLON}, set())
    # Au calcul suivant, toujours hors absence : on ne le repose pas.
    assert eau.ordres_absence({BALLON: "off"}, True, poses, laisses, vus) == ([], set(), {BALLON}, set())
    # Les Vacances finies, il est oublié : aux prochaines, il repartira en absence.
    assert eau.ordres_absence({BALLON: "off"}, False, poses, laisses, vus) == ([], set(), set(), set())


def test_un_off_avant_que_notre_ordre_ait_pris_n_est_pas_un_geste(eau, creer):
    """Contre-relecture du 30/10 : un ballon en nuage publie tard. Un autre calcul
    passe avant qu'il dise « on » : son « off » est l'état d'avant notre ordre,
    pas un geste — il reste posé, et sera levé au retour."""
    assert eau.ordres_absence({BALLON: "off"}, True, {BALLON}, set(), set()) == ([], {BALLON}, set(), set())
    fin = LUNDI_0700 + timedelta(days=3)
    m = creer(vacances(fin), table())
    m._depot_eau = FauxStore(None)
    lancer(m.async_evaluer())                                   # pose (l'ordre part)
    m.horloge += timedelta(seconds=20)
    m.hass.services.appels.clear()
    lancer(m.async_evaluer())                                   # l'état dit encore « off »
    assert appels(m) == [], "pas de second ordre"
    assert lancer(m._depot_eau.async_load()) == {"poses": [BALLON], "laisses": [], "vus": []}
    m.hass.states.table[BALLON] = FauxEtat("eco", {**SAIT, "away_mode": "on"})   # l'ordre a pris
    m.horloge = fin - timedelta(hours=11)
    lancer(m.async_evaluer())
    assert appels(m) == [("water_heater", "set_away_mode", {"entity_id": [BALLON], "away_mode": False})], "levé avant le retour"


def test_laisses_videe_a_la_levee(creer):
    fin = LUNDI_0700 + timedelta(days=3)
    m = creer(vacances(fin), table())
    m._depot_eau = FauxStore(None)
    lancer(m.async_evaluer())                                   # pose
    m.hass.states.table[BALLON] = FauxEtat("eco", {**SAIT, "away_mode": "on"})
    lancer(m.async_evaluer())                                   # vu en absence
    m.hass.states.table[BALLON] = FauxEtat("eco", {**SAIT, "away_mode": "off"})  # remis à la main
    m.hass.services.appels.clear()
    lancer(m.async_evaluer())
    assert appels(m) == []
    assert lancer(m._depot_eau.async_load()) == {"poses": [], "laisses": [BALLON], "vus": []}
    m.horloge = fin - timedelta(hours=11)
    lancer(m.async_evaluer())
    assert appels(m) == [] and lancer(m._depot_eau.async_load()) == {"poses": [], "laisses": [], "vus": []}


def test_une_levee_refusee_se_retente_trois_fois_puis_le_journal_le_dit(creer, caplog):
    m = creer(config(), table(away="on"))
    m._depot_eau = FauxStore(None)
    m._eau_poses = {BALLON}
    m.hass.services.refus = 10
    for _ in range(5):
        lancer(m.async_evaluer())
        m.horloge += timedelta(minutes=5)
    assert m.hass.services.refus == 7, "trois essais, pas un toutes les 5 min pendant 48 h"
    assert m._eau_poses == set() and m.prochain_reveil(m.horloge) is None
    assert any("apres 3 essais" in r.getMessage() for r in caplog.records)


def test_muet_au_retour_un_reveil_court_le_relevera(creer):
    """Muet au moment de lever le mode absence (un ballon en nuage, HA qui
    redémarre) : il reste posé, et un réveil court revient le lever."""
    fin = LUNDI_0700 + timedelta(days=3)
    m = creer(vacances(fin), table())
    m._depot_eau = FauxStore(None)
    lancer(m.async_evaluer())                                   # pose
    m.hass.states.table[BALLON] = FauxEtat("unavailable", {**SAIT})
    m.horloge = fin + timedelta(hours=2)
    m.hass.services.appels.clear()
    lancer(m.async_evaluer())                                   # fin des Vacances, ballon muet
    assert m.cfg["maison"]["mode"] == "planning"
    assert appels(m) == [] and m._eau_poses == {BALLON}
    assert m.prochain_reveil(m.horloge) == m.horloge + timedelta(minutes=5), "un réveil court tant qu'il reste posé"
    # Il revient, toujours en absence : le réveil le lève.
    m.hass.states.table[BALLON] = FauxEtat("eco", {**SAIT, "away_mode": "on"})
    m.horloge += timedelta(minutes=5)
    lancer(m.async_evaluer())
    assert appels(m) == [("water_heater", "set_away_mode", {"entity_id": [BALLON], "away_mode": False})]
    assert m.prochain_reveil(m.horloge) is None, "plus rien à lever : plus de réveil"


def test_le_reveil_court_est_borne(creer):
    """Muet trop longtemps : Loggia cesse de se réveiller pour lui (il le lèvera au prochain calcul)."""
    m = creer(config(), table())
    m._depot_eau = FauxStore(None)
    m._eau_poses = {BALLON}
    m.hass.states.table[BALLON] = FauxEtat("unavailable", {**SAIT})
    lancer(m.async_evaluer())
    assert m.prochain_reveil(m.horloge) == m.horloge + timedelta(minutes=5)
    m.horloge += timedelta(hours=49)
    lancer(m.async_evaluer())
    assert m.prochain_reveil(m.horloge) is None
    assert m._eau_poses == {BALLON}, "toujours tenu : il sera levé dès qu'un calcul le verra"
