"""La vigilance sur l'Accueil (01/11, ADR 0310 ; lot 6 du rapport Gladys : W3).

L'alerte departementale de Meteo-France n'a pas de cle de traduction : son
identifiant stable est `<departement> Weather alert` (« 18 Weather alert »,
releve dans un registre reel). Le composant la reconnait a cette fin et pose le
role `vigilance` dans l'index ; l'ecran en tire le point de la vigilance rouge et
la ligne de l'orange.
"""
from __future__ import annotations

import test_discovery as banc_index

from conftest import charger

decouverte = banc_index.decouverte


def test_l_alerte_departementale_se_reconnait_a_son_identifiant_stable():
    meteo = charger("meteo")
    assert meteo.role_meteo("sensor", "meteo_france", "00 Weather alert") == "vigilance"
    assert meteo.role_meteo("sensor", "meteo_france", "2A Weather alert") == "vigilance", "la Corse"


def test_rien_hors_de_meteo_france_ni_hors_des_capteurs():
    meteo = charger("meteo")
    assert meteo.role_meteo("sensor", "meteoalarm", "00 Weather alert") is None
    assert meteo.role_meteo("binary_sensor", "meteo_france", "00 Weather alert") is None
    assert meteo.role_meteo("sensor", "meteo_france", "00 Weather") is None
    assert meteo.role_meteo("sensor", "meteo_france", "00 weather alert") is None, "la casse de l'integration"


def test_l_index_porte_le_role(decouverte):
    hass = banc_index.poser(
        decouverte,
        entites=[banc_index.entite("sensor.alerte_departement", platform="meteo_france", unique_id="00 Weather alert", device_id="ville"),
                 banc_index.entite("sensor.autre_alerte", platform="template", unique_id="00 Weather alert")],
        etats={"sensor.alerte_departement": {}, "sensor.autre_alerte": {}},
    )
    index = decouverte.async_index(hass)
    roles = {e["id"]: e.get("meteo") for e in index["entities"]}
    assert roles == {"sensor.alerte_departement": "vigilance", "sensor.autre_alerte": None}
