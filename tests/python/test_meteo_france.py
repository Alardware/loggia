"""Meteo-France en entier (01/11, ADR 0309 ; lot 5 du rapport Gladys : D14, W1, W2).

Les probabilites de pluie, de neige et de gel, et la pluie de l'heure qui vient,
sont des capteurs a part de l'integration `meteo_france`, sans cle de traduction.
Ils se reconnaissent a la fin de leur identifiant stable, `<lat>,<lon>_rain_chance`
(forme relevee dans un registre reel). Le role seul sort dans l'index : les
coordonnees de la ville restent au serveur.
"""
from __future__ import annotations

import test_discovery as banc_index

from conftest import charger

decouverte = banc_index.decouverte
VILLE = "0.000001,0.000002"


def test_le_role_se_lit_a_la_fin_de_l_identifiant_stable():
    meteo = charger("meteo")
    assert meteo.role_meteo("sensor", "meteo_france", VILLE + "_rain_chance") == "pluie"
    assert meteo.role_meteo("sensor", "meteo_france", VILLE + "_snow_chance") == "neige"
    assert meteo.role_meteo("sensor", "meteo_france", VILLE + "_freeze_chance") == "gel"
    assert meteo.role_meteo("sensor", "meteo_france", VILLE + "_next_rain") == "pluie_heure"


def test_rien_hors_de_meteo_france_ni_pour_ses_autres_capteurs():
    meteo = charger("meteo")
    assert meteo.role_meteo("sensor", "meteo_france", VILLE + "_wind_speed") is None
    assert meteo.role_meteo("sensor", "meteo_france", VILLE) is None
    assert meteo.role_meteo("sensor", "openweathermap", VILLE + "_rain_chance") is None, "une autre integration"
    assert meteo.role_meteo("weather", "meteo_france", VILLE + "_rain_chance") is None
    assert meteo.role_meteo("sensor", "meteo_france", None) is None


def test_l_index_porte_le_role_et_pas_les_coordonnees(decouverte):
    ids = {"sensor.ville_rain_chance": "_rain_chance", "sensor.ville_next_rain": "_next_rain",
           "sensor.ville_wind_speed": "_wind_speed"}
    hass = banc_index.poser(
        decouverte,
        entites=[banc_index.entite(i, platform="meteo_france", unique_id=VILLE + fin, device_id="ville") for i, fin in ids.items()]
        + [banc_index.entite("sensor.autre_rain_chance", platform="zha", unique_id="x_rain_chance")],
        etats={i: {} for i in [*ids, "sensor.autre_rain_chance"]},
    )
    index = decouverte.async_index(hass)
    roles = {e["id"]: e.get("meteo") for e in index["entities"]}
    assert roles == {"sensor.ville_rain_chance": "pluie", "sensor.ville_next_rain": "pluie_heure",
                     "sensor.ville_wind_speed": None, "sensor.autre_rain_chance": None}
    assert VILLE not in repr(index)
