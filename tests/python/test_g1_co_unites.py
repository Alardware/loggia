"""Chantier G1 (30/10), D6 : le monoxyde du serveur se lit dans son unite, comme l'ecran (ADR 0300).

La veille du monoxyde (`_async_co`, veilles.py) ne gardait que les capteurs en
ppm : un monoxyde en mg/m3, en ug/m3 (Airly) ou en ppb n'etait jamais suivi,
quand l'ecran, lui, le lisait comme des ppm. Les deux suivent desormais la
meme table : des ppm, ou une unite qui s'y ramene (25 °C, 1 atm) —
mg/m3 x 24,45 / 28,01, ug/m3 mille fois moins, ppb / 1000. Une autre unite ne
se devine pas. Le seuil ne change pas : au-dela de 35 ppm.
"""
from __future__ import annotations

import types

import pytest

from conftest import RACINE, charger
from test_veilles import creer, lancer, module, regles_module  # noqa: F401  (fixtures reutilisees)
from test_veilles_capteurs import Entree, FauxEtat, notifications, registre

MICRO = "\u00b5"


def co(v, unite, nom="Cuisine CO"):
    return FauxEtat(str(v), {"device_class": "carbon_monoxide", "unit_of_measurement": unite, "friendly_name": nom})


def maison(monkeypatch, ids):
    registre(monkeypatch, [Entree(h, device_id="d1") for h in ids], {"d1": types.SimpleNamespace(entry_type=None)})


def test_les_unites_du_monoxyde_sont_celles_de_l_ecran():
    u = charger("unites")
    assert [u.unite_co(x) for x in ("ppm", "PPM", " ppm ", "ppb", "mg/m\u00b3", "mg/m3", MICRO + "g/m\u00b3",
                                    "\u03bcg/m\u00b3", "ug/m3", MICRO + "g/m3")] == [
        "ppm", "ppm", "ppm", "ppb", "mg/m\u00b3", "mg/m\u00b3", MICRO + "g/m\u00b3", MICRO + "g/m\u00b3",
        MICRO + "g/m\u00b3", MICRO + "g/m\u00b3"]
    assert [u.unite_co(x) for x in (None, "", "%", "mg/L", "ppt")] == [None] * 5
    assert u.vers_ppm_co(10, "mg/m\u00b3") == pytest.approx(10 * 24.45 / 28.01)
    assert u.vers_ppm_co(10000, MICRO + "g/m\u00b3") == pytest.approx(10 * 24.45 / 28.01)
    assert u.vers_ppm_co(9000, "ppb") == pytest.approx(9)
    assert u.vers_ppm_co(12, "ppm") == 12
    assert u.vers_ppm_co(12, "%") is None
    # UNE table, des deux cotes.
    js = (RACINE / "src" / "unites.js").read_text(encoding="utf-8")
    assert ("const VERS_PPM_CO = { ppm: 1, ppb: 0.001, 'mg/m\u00b3': 24.45 / 28.01, '" + MICRO + "g/m\u00b3': 24.45 / 28010 };") in js
    py = (RACINE / "custom_components" / "loggia" / "unites.py").read_text(encoding="utf-8")
    assert 'UNITES_CO = {"ppm": 1.0, "ppb": 0.001, "mg/m\\u00b3": 24.45 / 28.01, "\\u00b5g/m\\u00b3": 24.45 / 28010}' in py


def test_un_monoxyde_en_microgrammes_ou_milligrammes_previent_en_ppm(creer, monkeypatch):
    ids = ["sensor.salon_co", "sensor.garage_co", "sensor.cave_co", "sensor.cellier_co"]
    maison(monkeypatch, ids)
    v = creer({}, {
        # 45 000 ug/m3 = 39,3 ppm : un danger, dit en ppm, arrondi vers le haut.
        "sensor.salon_co": co(45000, MICRO + "g/m\u00b3", "Salon CO"),
        # 41 mg/m3 = 35,8 ppm : un danger aussi.
        "sensor.garage_co": co(41, "mg/m\u00b3", "Garage CO"),
        # 30 mg/m3 = 26,2 ppm : au calme, meme si « 30 » paraitrait proche de 35.
        "sensor.cave_co": co(30, "mg/m\u00b3", "Cave CO"),
        # Un pourcentage n'est pas des ppm : pas suivi, pas un « 200 ppm ».
        "sensor.cellier_co": co(200, "%", "Cellier CO"),
    })
    lancer(v._async_co())
    assert sorted(c["message"] for _, _, c in notifications(v)) == [
        "Garage CO : monoxyde de carbone à 36 ppm, aérez et sortez",
        "Salon CO : monoxyde de carbone à 40 ppm, aérez et sortez",
    ]
    assert sorted(v._capteurs_co(v.hass.states.table)) == ["sensor.cave_co", "sensor.garage_co", "sensor.salon_co"]


def test_un_ppb_redescend_comme_un_ppm(creer, monkeypatch):
    maison(monkeypatch, ["sensor.salon_co"])
    v = creer({}, {"sensor.salon_co": co(36000, "ppb", "Salon CO")})
    lancer(v._async_co())
    assert len(notifications(v)) == 1
    # 31 000 ppb = 31 ppm : sous le retour au calme (31,5 ppm), il redevient signalable.
    v.hass.states.table["sensor.salon_co"] = co(31000, "ppb", "Salon CO")
    lancer(v._async_co())
    assert v.signales == set()
