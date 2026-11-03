"""La fraicheur des mesures, jugee au serveur (01/11, ADR 0311 ; lot 7 du
rapport Gladys : A4 bis, F1).

- Une mesure physique (une classe de CLASSES_MESURE, sur un appareil qui n'est
  pas un service, d'une integration qui RELEVE) sans releve depuis 6 h est
  figee ; une plante, 24 h.
- Le releve est celui de l'appareil, dans son integration : le `last_reported`
  le plus recent de ses entites qui parlent.
- Sans `last_reported`, on ne juge pas. L'etat des veilles porte le verdict
  (`figees`) ; un registre illisible n'en donne aucun.
"""
from __future__ import annotations

import types
from datetime import datetime, timezone

import test_veilles as banc_veilles
import test_veilles_capteurs as banc_capteurs

from conftest import charger

creer = banc_veilles.creer
module = banc_veilles.module
regles_module = banc_veilles.regles_module
lancer = banc_veilles.lancer
Entree = banc_capteurs.Entree
registre = banc_capteurs.registre
notifications = banc_capteurs.notifications

MAINTENANT = 1_800_000_000.0
H = 3600


class Etat:
    """Un etat de Home Assistant, avec son dernier releve (`last_reported`)."""

    def __init__(self, state, classe=None, il_y_a=None, **attributs):
        self.state = state
        self.attributes = dict(attributs, **({"device_class": classe} if classe else {}))
        if il_y_a is not None:
            self.last_reported = datetime.fromtimestamp(MAINTENANT - il_y_a, tz=timezone.utc)


def juger(entrees, etats, *, services=(), plantes=(), maintenant=MAINTENANT):
    f = charger("fraicheur")
    return f.figees(entrees, etats.get, lambda appareil: appareil not in services, list(plantes), maintenant)


def test_une_temperature_muette_depuis_sept_heures_est_figee_a_l_instant_de_son_releve():
    e = [Entree("sensor.salon_temperature", platform="mqtt", device_id="thermo")]
    assert juger(e, {"sensor.salon_temperature": Etat("19.5", "temperature", 7 * H)}) == {
        "sensor.salon_temperature": int(MAINTENANT - 7 * H)}


def test_sous_six_heures_rien_et_six_heures_tout_juste_non_plus():
    e = [Entree("sensor.t", platform="mqtt", device_id="thermo")]
    assert juger(e, {"sensor.t": Etat("19.5", "temperature", 5 * H)}) == {}
    assert juger(e, {"sensor.t": Etat("19.5", "temperature", 6 * H)}) == {}, "plus de six heures"
    assert juger(e, {"sensor.t": Etat("19.5", "temperature", 6 * H + 1)}) != {}


def test_un_appareil_vivant_n_est_pas_fige_meme_si_sa_temperature_ne_bouge_pas():
    """MQTT n'ecrit l'etat que si la valeur change : la qualite du lien, elle,
    bouge. Une autre integration sur le meme appareil ne compte pas."""
    e = [Entree("sensor.t", platform="mqtt", device_id="thermo"),
         Entree("sensor.t_lien", platform="mqtt", device_id="thermo"),
         Entree("sensor.t_derivee", platform="derivative", device_id="thermo")]
    etats = {"sensor.t": Etat("19.5", "temperature", 9 * H), "sensor.t_lien": Etat("120", None, 600),
             "sensor.t_derivee": Etat("0", None, 60)}
    assert juger(e, etats) == {}
    etats["sensor.t_lien"] = Etat("120", None, 8 * H)
    assert juger(e, etats) == {"sensor.t": int(MAINTENANT - 8 * H)}, "le releve le plus recent de l'appareil, dans son integration"
    # Un voisin muet ne dit pas que l'appareil parle.
    etats["sensor.t_lien"] = Etat("unavailable", None, 60)
    assert juger(e, etats) == {"sensor.t": int(MAINTENANT - 9 * H)}


def test_sans_last_reported_on_ne_juge_pas():
    e = [Entree("sensor.t", platform="mqtt", device_id="thermo")]
    assert juger(e, {"sensor.t": Etat("19.5", "temperature")}) == {}


def test_une_mesure_muette_ne_se_juge_pas_elle_se_dit_deja():
    e = [Entree("sensor.t", platform="mqtt", device_id="thermo")]
    for muet in ("unavailable", "unknown", ""):
        assert juger(e, {"sensor.t": Etat(muet, "temperature", 9 * H)}) == {}


def test_un_calcul_un_telephone_un_service_ni_un_capteur_sans_appareil_ne_sont_juges():
    etats = {h: Etat("20", "temperature", 9 * H) for h in ("sensor.a", "sensor.b", "sensor.c", "sensor.d", "sensor.e", "sensor.f")}
    e = [Entree("sensor.a", platform="template", device_id="x"),
         Entree("sensor.b", platform="statistics", device_id="y"),
         Entree("sensor.c", platform="mobile_app", device_id="tel"),
         Entree("sensor.d", platform="meteo_france", device_id="ville"),
         Entree("sensor.e", platform="mqtt", device_id=None),
         Entree("sensor.f", platform="mqtt", device_id="z", disabled_by="user")]
    assert juger(e, etats, services={"ville"}) == {}


def test_seules_les_grandeurs_de_la_table_se_jugent():
    e = [Entree("sensor." + c, platform="mqtt", device_id="d_" + c) for c in
         ("humidity", "carbon_dioxide", "pressure", "pm25", "illuminance", "wind_speed", "sound_pressure", "power", "battery")]
    etats = {"sensor." + c: Etat("10", c, 9 * H) for c in
             ("humidity", "carbon_dioxide", "pressure", "pm25", "illuminance", "wind_speed", "sound_pressure", "power", "battery")}
    assert sorted(juger(e, etats)) == ["sensor.carbon_dioxide", "sensor.humidity", "sensor.pm25", "sensor.pressure"], \
        "la lumiere, le vent et le bruit dorment la nuit ; une puissance, une pile ne sont pas l'air"
    assert juger([Entree("binary_sensor.t", platform="mqtt", device_id="b")], {"binary_sensor.t": Etat("on", "temperature", 9 * H)}) == {}


def test_une_plante_a_vingt_quatre_heures_lumiere_et_engrais_compris():
    base = "sensor.sonde_ficus"
    e = [Entree(base + "_humidite", platform="xiaomi_ble", device_id="plante"),
         Entree(base + "_eclairement", platform="xiaomi_ble", device_id="plante"),
         Entree(base + "_conductivite", platform="xiaomi_ble", device_id="plante")]
    etats = {base + "_humidite": Etat("30", "moisture", 20 * H), base + "_eclairement": Etat("0", "illuminance", 20 * H),
             base + "_conductivite": Etat("300", "conductivity", 20 * H)}
    assert juger(e, etats, plantes=[base]) == {}, "vingt heures : une plante parle peu"
    assert juger(e, etats) == {base + "_humidite": int(MAINTENANT - 20 * H)}, "hors plante : six heures, et ni lumiere ni engrais"
    for k in etats:
        etats[k] = Etat(etats[k].state, etats[k].attributes["device_class"], 25 * H)
    assert sorted(juger(e, etats, plantes=[base])) == sorted(etats)
    # La regle des plantes de la maison : la base suivie de rien ou d'un « _ ».
    assert juger(e, etats, plantes=["sensor.sonde_ficu"]) == {base + "_humidite": int(MAINTENANT - 25 * H)}


def test_l_etat_des_veilles_porte_le_verdict_sans_rien_au_telephone(creer, monkeypatch):
    registre(monkeypatch, [Entree("sensor.t", platform="mqtt", device_id="thermo"),
                           Entree("sensor.ville_t", platform="met", device_id="ville")],
             {"thermo": types.SimpleNamespace(entry_type=None), "ville": types.SimpleNamespace(entry_type="service")})
    monkeypatch.setattr(charger("veilles").time, "time", lambda: MAINTENANT)
    v = creer({}, {"sensor.t": Etat("19.5", "temperature", 7 * H), "sensor.ville_t": Etat("12", "temperature", 7 * H)})
    etat = lancer(v.async_etat())
    assert etat["figees"] == {"sensor.t": int(MAINTENANT - 7 * H)}, "un service (une meteo en ligne) ne se juge pas"
    assert etat["signales"] == [] and notifications(v) == [] and v.hass.services.appels == []


def test_les_plantes_de_la_maison_se_lisent_dans_sa_configuration(creer, monkeypatch):
    base = "sensor.sonde_ficus"
    registre(monkeypatch, [Entree(base + "_humidite", platform="xiaomi_ble", device_id="plante")],
             {"plante": types.SimpleNamespace(entry_type=None)})
    monkeypatch.setattr(charger("veilles").time, "time", lambda: MAINTENANT)
    v = creer({}, {base + "_humidite": Etat("30", "moisture", 10 * H)})
    assert lancer(v.async_etat())["figees"] == {base + "_humidite": int(MAINTENANT - 10 * H)}
    lancer(v.store.async_set_shared("loggia_plants", [{"name": "Ficus", "base": base}, "abime", {"base": None}]))
    assert lancer(v.async_etat())["figees"] == {}, "une plante : vingt-quatre heures"


def test_un_registre_illisible_ne_juge_rien(creer):
    v = creer({}, {"sensor.t": Etat("19.5", "temperature", 9 * H)})
    assert lancer(v.async_etat())["figees"] == {}
