"""Reconnaitre un chauffage, et lui parler dans sa langue (chantier Chauffage, § 3 et § 4).

Trois familles, et jamais le `friendly_name` : un `select` aux ordres fil
pilote dont l'identifiant stable dit « pilot wire », un VTherm par sa
plateforme, tout autre `climate` comme thermostat. Puis, pour chacune, l'ordre
qui la met dans un mode — et la question « y est-elle deja ? ».
"""
from __future__ import annotations

import ast
import types

import pytest

from conftest import COMPOSANT, charger


@pytest.fixture(scope="module")
def fam():
    return charger("chauffage_familles")


NODON = ["comfort", "eco", "frost_protection", "off", "comfort_-1", "comfort_-2"]
UID_NODON = "0x00158d0001a2b3c4_pilot_wire_mode_zigbee2mqtt"
POELE = {"hvac_modes": ["off", "heat"], "min_temp": 5, "max_temp": 35,
         "preset_modes": ["turbo", "manual", "comfort", "auto", "overnight"]}
# Les memes bornes dans une maison en °F : Home Assistant les donne dans l'unite de la maison.
POELE_F = {**POELE, "min_temp": 41, "max_temp": 95}
VTHERM = {"hvac_modes": ["heat", "off"], "preset_modes": ["none", "frost", "eco", "comfort", "boost"]}


def test_les_familles_ne_tirent_rien_de_home_assistant():
    arbre = ast.parse((COMPOSANT / "chauffage_familles.py").read_text(encoding="utf-8"))
    modules = {n.module for n in ast.walk(arbre) if isinstance(n, ast.ImportFrom)}
    assert not any(m and m.startswith("homeassistant") for m in modules), modules


def test_une_option_se_lit_en_anglais_comme_en_francais(fam):
    assert fam.mode_option("comfort") == "confort"
    assert fam.mode_option("comfort_-1") == "confort_1"
    assert fam.mode_option("Confort −2") == "confort_2"
    assert fam.mode_option("Éco") == "eco"
    assert fam.mode_option("Hors-gel") == "hors_gel"
    assert fam.mode_option("frost_protection") == "hors_gel"
    assert fam.mode_option("Arrêt") == "arret"
    assert fam.mode_option("off") == "arret"
    for autre in ("boost", "auto", "", None, "comfort_-3"):
        assert fam.mode_option(autre) is None, autre


def test_le_module_garde_ses_propres_mots(fam):
    """`select_option` refuse une option que le module ne propose pas : on
    renvoie SON mot, jamais le notre."""
    assert fam.options_du_module(NODON) == {"confort": "comfort", "eco": "eco", "hors_gel": "frost_protection",
                                            "arret": "off", "confort_1": "comfort_-1", "confort_2": "comfort_-2"}
    assert fam.options_du_module(["Confort", "Eco", "Hors-gel", "Arrêt"])["arret"] == "Arrêt"
    assert fam.options_du_module(None) == {}


def test_un_fil_pilote_demande_ses_ordres_et_son_identifiant(fam):
    attrs = {"options": NODON}
    assert fam.famille("select", "mqtt", UID_NODON, "Pilot wire mode", attrs) == "fil_pilote"
    # Le nom d'origine suffit quand l'identifiant ne dit rien.
    assert fam.famille("select", "x", "abc123", "Pilot wire mode", attrs) == "fil_pilote"
    assert fam.famille("select", "x", "abc123", None, {"options": ["Confort", "Eco", "Hors-gel", "Arrêt"]}) is None, \
        "des options seules ne font pas un fil pilote"
    assert fam.famille("select", "mqtt", UID_NODON, None, {"options": ["comfort", "eco", "off"]}) is None, \
        "sans hors-gel, ce n'est pas un fil pilote"
    assert fam.famille("select", "mqtt", UID_NODON, None, None) is None


def test_un_climate_est_un_thermostat_un_vtherm_ou_le_notre(fam):
    assert fam.famille("climate", "maestro_mcz", "uid", None, POELE) == "thermostat"
    assert fam.famille("climate", "versatile_thermostat", "uid", None, VTHERM) == "vtherm"
    assert fam.famille("climate", "loggia", "uid", None, {}) is None
    assert fam.famille("switch", "mqtt", UID_NODON, None, {}) is None


def test_un_climate_sans_consigne_n_est_pas_un_thermostat(fam):
    """Un chauffage qui ne se regle que par prereglages (un Heatzy...) n'a pas
    `TARGET_TEMPERATURE`, le bit 1 de `supported_features` : Home Assistant
    refuserait `set_temperature`. Il n'est pas un thermostat de la v1."""
    prereglages = {**POELE, "supported_features": 16}
    assert fam.famille("climate", "heatzy", "uid", None, prereglages) is None
    assert fam.famille("climate", "heatzy", "uid", None, {**POELE, "supported_features": 2}) is None, \
        "une plage seule ne recoit pas non plus une consigne unique"
    assert fam.famille("climate", "maestro_mcz", "uid", None, {**POELE, "supported_features": 17}) == "thermostat"
    # Absent ou illisible, l'attribut n'exclut personne : on n'ecarte que ce que l'appareil dit ne pas savoir faire.
    for illisible in (None, "17"):
        assert fam.famille("climate", "maestro_mcz", "uid", None, {**POELE, "supported_features": illisible}) \
            == "thermostat", illisible
    assert fam.famille("climate", "maestro_mcz", "uid", None, None) == "thermostat"
    # Un VTherm se commande par ses prereglages : il n'a pas besoin de consigne.
    assert fam.famille("climate", "versatile_thermostat", "uid", None, prereglages) == "vtherm"


def test_chacun_n_offre_que_les_modes_qu_il_comprend(fam):
    assert fam.modes_permis("fil_pilote", {"options": NODON}) == list(fam.MODES)
    assert fam.modes_permis("fil_pilote", {"options": ["comfort", "eco", "frost_protection", "off"]}) == \
        ["confort", "eco", "hors_gel", "arret"]
    assert fam.modes_permis("vtherm", VTHERM) == ["confort", "eco", "hors_gel", "arret"]
    assert fam.modes_permis("thermostat", POELE) == list(fam.MODES)
    assert fam.modes_permis("thermostat", {"hvac_modes": ["heat"]}) == ["confort", "confort_1", "confort_2", "eco", "hors_gel"]


def test_un_mode_incompris_prend_le_plus_proche(fam):
    quatre = ["confort", "eco", "hors_gel", "arret"]
    assert fam.mode_applicable("confort_2", quatre) == "confort"
    assert fam.mode_applicable("eco", quatre) == "eco"
    assert fam.mode_applicable("hors_gel", ["confort", "eco"]) == "eco"
    assert fam.mode_applicable("arret", ["confort", "eco", "hors_gel"]) == "hors_gel"
    assert fam.mode_applicable("confort", ["eco"]) is None


def test_le_fil_pilote_recoit_son_option(fam):
    attrs = {"options": NODON}
    assert fam.commande("fil_pilote", {"mode": "confort_1"}, "eco", attrs, None) == [
        ("select", "select_option", {"option": "comfort_-1"})]
    assert fam.commande("fil_pilote", {"mode": "arret"}, "eco", attrs, None) == [
        ("select", "select_option", {"option": "off"})]
    assert fam.commande("fil_pilote", {"mode": "confort_1"}, "eco", {"options": NODON[:4]}, None) == []


def test_le_thermostat_recoit_une_temperature_et_s_allume(fam):
    temps = {"confort": 20, "eco": 17, "hors_gel": 7}
    # Allumer est un appel A PART, AVANT la consigne : Home Assistant ne tient
    # aucun compte d'un `hvac_mode` passe a `set_temperature` (c'est l'affaire
    # de l'integration, et certaines l'ignorent).
    assert fam.commande("thermostat", {"mode": "confort"}, "off", POELE, temps) == [
        ("climate", "set_hvac_mode", {"hvac_mode": "heat"}),
        ("climate", "set_temperature", {"temperature": 20.0})]
    # Sur son propre programme (`auto`), il est remis en chauffe de la meme facon.
    assert fam.commande("thermostat", {"mode": "eco"}, "auto", {"hvac_modes": ["heat", "auto"]}, temps) == [
        ("climate", "set_hvac_mode", {"hvac_mode": "heat"}),
        ("climate", "set_temperature", {"temperature": 17.0})]
    assert fam.commande("thermostat", {"mode": "confort_2"}, "heat", POELE, temps) == [
        ("climate", "set_temperature", {"temperature": 18.0})]
    assert fam.commande("thermostat", {"mode": "arret"}, "heat", POELE, temps) == [
        ("climate", "set_hvac_mode", {"hvac_mode": "off"})]
    # Une reprise a la main en temperature : la sienne, pas celle du mode.
    assert fam.commande("thermostat", {"mode": None, "temperature": 21.5}, "heat", POELE, temps) == [
        ("climate", "set_temperature", {"temperature": 21.5})]


def test_confort_moins_1_et_2_ne_descendent_jamais_sous_l_eco(fam):
    """Confort -1 et -2 se deduisent du Confort, mais jamais sous l'Eco : sinon une
    fenetre ou une Absence reglee sur Eco RELEVERAIT une piece sur un creneau
    Confort -2. Un Eco a 19 pour un Confort 20 est courant (pompe a chaleur)."""
    def consignes(confort, eco):
        temps = {"confort": confort, "eco": eco, "hors_gel": 7}
        return tuple(fam.temperature_du_mode(m, temps) for m in ("confort_1", "confort_2"))

    assert consignes(20, 19) == (19, 19)
    assert consignes(20, 17) == (19, 18)
    assert consignes(20, 20) == (20, 20), "un Eco au niveau du Confort : rien ne descend sous lui"
    # Du froid au chaud, toujours : Eco <= Confort -2 <= Confort -1 <= Confort.
    for confort, eco in ((20, 19), (20, 18.5), (20, 17), (22.5, 7.5), (20, 20)):
        un, deux = consignes(confort, eco)
        assert eco <= deux <= un <= confort, (confort, eco)
    # Et c'est cette consigne-la qui part au thermostat, et qu'il faut y retrouver.
    temps = {"confort": 20, "eco": 19, "hors_gel": 7}
    assert fam.commande("thermostat", {"mode": "confort_2"}, "heat", POELE, temps) == [
        ("climate", "set_temperature", {"temperature": 19.0})]
    assert fam.deja("thermostat", {"mode": "confort_2"}, "heat", {**POELE, "temperature": 19}, temps)


def test_en_fahrenheit_la_consigne_part_dans_l_unite_de_la_maison(fam):
    temps = {"confort": 20, "eco": 17, "hors_gel": 7}
    assert fam.commande("thermostat", {"mode": "confort"}, "heat", POELE_F, temps, "F") == [
        ("climate", "set_temperature", {"temperature": 68.0})]
    # 17 °C font 62,6 °F : Home Assistant propose le degre en °F, la consigne part a 63.
    assert fam.commande("thermostat", {"mode": "eco"}, "heat", POELE_F, temps, "F")[0][2]["temperature"] == 63
    assert fam.deja("thermostat", {"mode": "confort"}, "heat", {**POELE_F, "temperature": 68}, temps, "F")
    # Ce que Home Assistant lit est ce qu'on a envoye : 63 est l'Eco, 62 non.
    assert fam.deja("thermostat", {"mode": "eco"}, "heat", {**POELE_F, "temperature": 63}, temps, "F")
    assert not fam.deja("thermostat", {"mode": "eco"}, "heat", {**POELE_F, "temperature": 62}, temps, "F")


def test_la_consigne_suit_le_pas_de_l_appareil(fam):
    """Un poele au degre ne comprend pas 19,5 : on lui envoie ce qu'il sait
    faire, et on le reconnait ensuite dans ce mode."""
    temps = {"confort": 19.5, "eco": 17, "hors_gel": 7}
    au_degre = {**POELE, "target_temp_step": 1}
    assert fam.commande("thermostat", {"mode": "confort"}, "heat", au_degre, temps) == [
        ("climate", "set_temperature", {"temperature": 20.0})]
    assert fam.deja("thermostat", {"mode": "confort"}, "heat", {**au_degre, "temperature": 20}, temps)
    assert not fam.deja("thermostat", {"mode": "confort"}, "heat", {**au_degre, "temperature": 19}, temps)
    # Chaque demi va vers le haut : 19,5 et 20,5 ne donnent pas la meme consigne.
    assert [fam.commande("thermostat", {"mode": None, "temperature": t}, "heat", au_degre, temps)[0][2]["temperature"]
            for t in (19.5, 20.5)] == [20.0, 21.0]
    # Sans pas annonce : le demi-degre en °C. Un pas fin est respecte.
    assert fam.commande("thermostat", {"mode": None, "temperature": 20.3}, "heat", POELE, temps)[0][2]["temperature"] == 20.5
    fin = {**POELE, "target_temp_step": 0.1}
    assert fam.commande("thermostat", {"mode": None, "temperature": 20.3}, "heat", fin, temps)[0][2]["temperature"] == 20.3
    # Un pas illisible ne compte pas.
    for faux in (0, -1, "1", None):
        attrs = {**POELE, "target_temp_step": faux}
        assert fam.commande("thermostat", {"mode": None, "temperature": 20.3}, "heat", attrs, temps)[0][2]["temperature"] \
            == 20.5, faux
    # Un ecart de moins d'un demi-pas est le meme reglage : 17,2 lus pour un Eco a 17 sur un poele au demi-degre.
    assert fam.deja("thermostat", {"mode": "eco"}, "heat", {**POELE, "temperature": 17.2}, temps)
    assert not fam.deja("thermostat", {"mode": "eco"}, "heat", {**POELE, "temperature": 17.5}, temps)


def test_la_consigne_reste_entre_les_bornes_de_l_appareil(fam):
    """Home Assistant refuse une consigne hors de `min_temp` / `max_temp` : on la
    ramene dedans, et `deja` compare a ce qui serait envoye."""
    temps = {"confort": 40, "eco": 3, "hors_gel": 7}
    assert fam.commande("thermostat", {"mode": "confort"}, "heat", POELE, temps) == [
        ("climate", "set_temperature", {"temperature": 35.0})]
    assert fam.commande("thermostat", {"mode": "eco"}, "heat", POELE, temps) == [
        ("climate", "set_temperature", {"temperature": 5.0})]
    assert fam.deja("thermostat", {"mode": "confort"}, "heat", {**POELE, "temperature": 35}, temps)
    assert not fam.deja("thermostat", {"mode": "confort"}, "heat", {**POELE, "temperature": 34}, temps)
    # Une seule borne, ou une borne illisible : l'autre cote reste libre.
    assert fam.commande("thermostat", {"mode": "confort"}, "heat", {"max_temp": 30}, temps)[0][2]["temperature"] == 30.0
    assert fam.commande("thermostat", {"mode": "eco"}, "heat", {"min_temp": 5}, temps)[0][2]["temperature"] == 5.0
    assert fam.commande("thermostat", {"mode": "eco"}, "heat", {"min_temp": "5", "max_temp": None},
                        temps)[0][2]["temperature"] == 3.0
    # Elles sont lues dans l'unite de la maison, sans conversion : 5 et 35 sont ici des °F.
    assert fam.commande("thermostat", {"mode": "hors_gel"}, "heat", POELE, temps, "F")[0][2]["temperature"] == 35.0


def test_le_vtherm_change_de_prereglage_jamais_de_temperature(fam):
    assert fam.commande("vtherm", {"mode": "eco"}, "heat", VTHERM, None) == [
        ("climate", "set_preset_mode", {"preset_mode": "eco"})]
    assert fam.commande("vtherm", {"mode": "hors_gel"}, "off", VTHERM, None) == [
        ("climate", "set_hvac_mode", {"hvac_mode": "heat"}),
        ("climate", "set_preset_mode", {"preset_mode": "frost"})]
    assert fam.commande("vtherm", {"mode": "confort_1"}, "heat", VTHERM, None) == []
    services = {s for m in fam.MODES for _, s, _ in fam.commande("vtherm", {"mode": m}, "heat", VTHERM, None)}
    assert "set_temperature" not in services


def test_deja_dans_le_mode(fam):
    temps = {"confort": 20, "eco": 17, "hors_gel": 7}
    assert fam.deja("fil_pilote", {"mode": "confort"}, "comfort", {"options": NODON}, None)
    assert not fam.deja("fil_pilote", {"mode": "confort"}, "eco", {"options": NODON}, None)
    assert fam.deja("thermostat", {"mode": "eco"}, "heat", {**POELE, "temperature": 17.0}, temps)
    assert not fam.deja("thermostat", {"mode": "eco"}, "off", {**POELE, "temperature": 17.0}, temps)
    assert not fam.deja("thermostat", {"mode": "eco"}, "auto", {"hvac_modes": ["heat", "auto"], "temperature": 17.0}, temps), \
        "un thermostat sur son propre programme n'obeit pas au planning"
    assert fam.deja("thermostat", {"mode": "arret"}, "off", POELE, temps)
    assert fam.deja("vtherm", {"mode": "eco"}, "heat", {**VTHERM, "preset_mode": "eco"}, None)
    assert not fam.deja("vtherm", {"mode": "eco"}, "heat", {**VTHERM, "preset_mode": "none"}, None)
    # Un mode que le VTherm n'a pas (confort_1), ou aucun mode, n'est jamais « deja » :
    # l'absence de prereglage n'est pas un accord (`None == None`).
    assert not fam.deja("vtherm", {"mode": "confort_1"}, "heat", VTHERM, None)
    assert not fam.deja("vtherm", {"mode": None}, "heat", VTHERM, None)
    for muet in ("unavailable", "unknown", None):
        assert not fam.deja("fil_pilote", {"mode": "confort"}, muet, {"options": NODON}, None)


def test_une_trame_fausse_se_reconnait(fam):
    """MCZ qui se reconnecte (25/10) : `heat`, consigne 0, piece a 0, prereglage `unknown`."""
    mcz = {"current_temperature": 0, "temperature": 0, "hvac_action": "idle", "preset_mode": "unknown"}
    assert fam.trame_fausse("thermostat", "heat", mcz)
    assert fam.trame_fausse("vtherm", "heat", {"temperature": -1})
    assert not fam.trame_fausse("thermostat", "off", mcz), "eteint, la consigne ne dit rien"
    assert not fam.trame_fausse("thermostat", "heat", {**mcz, "temperature": 5})
    assert not fam.trame_fausse("thermostat", "heat", {"current_temperature": 0}), "sans consigne"
    assert not fam.trame_fausse("fil_pilote", "comfort", mcz)
    assert not fam.trame_fausse("thermostat", "unavailable", mcz)
    assert not fam.trame_fausse("thermostat", "heat", None)


def test_lire_l_appareil_separe_un_geste_d_un_attribut_qui_bouge(fam):
    a = fam.lire_appareil("thermostat", "heat", {**POELE, "temperature": 21, "current_temperature": 19.5})
    b = fam.lire_appareil("thermostat", "heat", {**POELE, "temperature": 21, "current_temperature": 20.0})
    assert a["signature"] == b["signature"], "la piece se rechauffe : ce n'est pas un geste"
    assert (a["mode"], a["temperature"]) == (None, 21.0)
    assert fam.lire_appareil("thermostat", "off", POELE)["mode"] == "arret"
    assert fam.lire_appareil("thermostat", "heat", {**POELE, "temperature": 70}, "F")["temperature"] == 21.1
    assert fam.lire_appareil("fil_pilote", "comfort_-1", {})["mode"] == "confort_1"
    assert fam.lire_appareil("vtherm", "heat", {"preset_mode": "frost"})["mode"] == "hors_gel"
    assert fam.lire_appareil("vtherm", "heat", {"preset_mode": "boost"})["mode"] is None
    assert fam.lire_appareil("fil_pilote", "unavailable", {})["signature"] is None


def test_le_decalage_d_un_thermostat(fam):
    """30/10 : un poele qui lit 1,5 °C de moins que la piece (decalage -1,5) recoit 18,5
    pour un Confort a 20 ; il est « deja » a 18,5 ; un geste a 21,5 sur l'appareil se
    relit 23 pour la piece. Sans decalage, rien ne change."""
    temps = {"confort": 20, "eco": 17, "hors_gel": 7}
    assert fam.commande("thermostat", {"mode": "confort"}, "heat", POELE, temps, "C", -1.5) == [
        ("climate", "set_temperature", {"temperature": 18.5})]
    assert fam.commande("thermostat", {"mode": None, "temperature": 21}, "heat", POELE, temps, "C", -1.5) == [
        ("climate", "set_temperature", {"temperature": 19.5})]
    assert fam.deja("thermostat", {"mode": "confort"}, "heat", {**POELE, "temperature": 18.5}, temps, "C", -1.5)
    assert not fam.deja("thermostat", {"mode": "confort"}, "heat", {**POELE, "temperature": 20}, temps, "C", -1.5)
    lu = fam.lire_appareil("thermostat", "heat", {**POELE, "temperature": 21.5}, "C", -1.5)
    assert lu["temperature"] == 23.0
    assert lu["signature"] == fam.lire_appareil("thermostat", "heat", {**POELE, "temperature": 21.5})["signature"]
    assert fam.commande("thermostat", {"mode": "confort"}, "heat", POELE, temps) == [
        ("climate", "set_temperature", {"temperature": 20.0})]


def test_l_interrupteur_du_module_est_trouve_jamais_commande(fam):
    E = types.SimpleNamespace
    entrees = [E(entity_id="switch.module", device_id="d1", disabled_by=None, entity_category=None),
               E(entity_id="switch.verrou_enfant", device_id="d1", disabled_by=None, entity_category="config"),
               E(entity_id="switch.voisin", device_id="d2", disabled_by=None, entity_category=None),
               E(entity_id="select.module_pilot_wire_mode", device_id="d1", disabled_by=None, entity_category=None)]
    assert fam.interrupteurs_du_module(entrees, "d1") == ["switch.module"]
    assert fam.interrupteurs_du_module(entrees, None) == []


# ── Le fil pilote sous ZHA (audit du 19/10) ─────────────────────────────────
# Lu dans le code de ZHA (zigpy/zha-device-handlers, zhaquirks/nodon/pilot_wire.py et
# legrand/cable_outlet.py ; zha/application/platforms/select.py) : un `select` d'enum
# publie le NOM du membre, `_` devenu espace — « FrostProtection », « ComfortMinus1 ».
# Cle de traduction `pilot_wire_mode`, nom de secours « Pilot wire mode » ; le
# `unique_id` est `<ieee>-<endpoint>[-<suffixe>]`, sans garantie de « pilot wire ».
ZHA_NODON = ["Off", "Comfort", "Eco", "FrostProtection", "ComfortMinus1", "ComfortMinus2"]
ZHA_LEGRAND = ["Comfort", "ComfortMinus1", "ComfortMinus2", "Eco", "FrostProtection", "Off"]


@pytest.mark.parametrize("options", [ZHA_NODON, ZHA_LEGRAND])
def test_les_ordres_d_un_fil_pilote_sous_zha_se_lisent(fam, options):
    assert fam.options_du_module(options) == {
        "arret": "Off", "confort": "Comfort", "eco": "Eco", "hors_gel": "FrostProtection",
        "confort_1": "ComfortMinus1", "confort_2": "ComfortMinus2"}, "chaque ordre, tel que le module l'ecrit"
    assert fam.mode_option("ComfortMinus2") == "confort_2"
    # Les graphies d'avant ne bougent pas.
    for option, mode in (("comfort_-1", "confort_1"), ("frost_protection", "hors_gel"), ("Hors-gel", "hors_gel"),
                         ("Confort -2", "confort_2"), ("Arrêt", "arret"), ("Anti-freeze", "hors_gel"),
                         ("antifreeze", "hors_gel")):
        assert fam.mode_option(option) == mode, option


def test_un_fil_pilote_sous_zha_est_reconnu_par_sa_cle_de_traduction(fam):
    attrs = {"options": ZHA_NODON}
    assert fam.famille("select", "zha", "00:15:8d:00:01:a2:b3:c4-1", None, attrs, "pilot_wire_mode") == "fil_pilote"
    assert fam.famille("select", "zha", "00:15:8d:00:01:a2:b3:c4-1", "Pilot wire mode", attrs) == "fil_pilote",         "ou par son nom de secours"
    assert fam.famille("select", "zha", "00:15:8d:00:01:a2:b3:c4-1", None, attrs, "device_mode") is None,         "le mode de la prise Legrand (Switch / PilotWire) n'est pas un fil pilote"
    assert fam.famille("select", "zha", "00:15:8d:00:01:a2:b3:c4-1", None, attrs) is None,         "sans aucun signe, on ne devine pas sur les seules options"


# ── La veille d'un thermostat (audit du 19/10) ──────────────────────────────
# Un poele MCZ s'arrete seul quand la piece atteint sa consigne et repart plus
# tard : Home Assistant le publie `off` avec `hvac_action: idle`. Mesure chez
# lui : 79 etats `off`/`idle` (sa veille), 36 `off`/`off` (vraiment eteint).
VEILLE = {**POELE, "temperature": 17.0, "hvac_action": "idle"}


@pytest.mark.parametrize("action", ["idle", "heating", "preheating"])
def test_un_thermostat_en_veille_n_est_pas_eteint(fam, action):
    attrs = {**VEILLE, "hvac_action": action}
    assert fam.en_veille("thermostat", "off", attrs)
    lu = fam.lire_appareil("thermostat", "off", attrs)
    assert (lu["mode"], lu["temperature"]) == (None, 17.0), "en veille, il garde sa consigne"
    assert lu["signature"] == fam.lire_appareil("thermostat", "heat", attrs)["signature"], \
        "s'endormir ou se reveiller n'est pas un geste"


def test_vraiment_eteint_reste_eteint(fam):
    for attrs in ({**POELE, "temperature": 17.0, "hvac_action": "off"}, {**POELE, "temperature": 17.0}):
        assert not fam.en_veille("thermostat", "off", attrs)
        assert fam.lire_appareil("thermostat", "off", attrs)["mode"] == "arret"
    assert not fam.en_veille("thermostat", "heat", VEILLE), "allume, il n'est pas en veille"
    assert not fam.en_veille("fil_pilote", "off", {"hvac_action": "idle"})
    assert not fam.en_veille("vtherm", "off", {**VTHERM, "hvac_action": "idle"})
    assert not fam.en_veille("thermostat", "off", {"hvac_modes": ["off", "cool"], "hvac_action": "idle"}), \
        "sans mode qui chauffe, rien a reveiller"


def test_en_veille_il_est_deja_au_planning_et_on_ne_le_rallume_pas(fam):
    temps = {"confort": 20, "eco": 17, "hors_gel": 7}
    assert fam.deja("thermostat", {"mode": "eco"}, "off", VEILLE, temps), "endormi a 17 : deja en Eco"
    assert not fam.deja("thermostat", {"mode": "confort"}, "off", VEILLE, temps)
    assert fam.commande("thermostat", {"mode": "confort"}, "off", VEILLE, temps) == [
        ("climate", "set_temperature", {"temperature": 20.0})], "on regle la consigne, sans le rallumer"
    assert not fam.deja("thermostat", {"mode": "arret"}, "off", VEILLE, temps), \
        "endormi, il repartira seul : l'Arret doit encore partir"
    assert fam.commande("thermostat", {"mode": "arret"}, "off", VEILLE, temps) == [
        ("climate", "set_hvac_mode", {"hvac_mode": "off"})]


# ── Ce qui refroidit (audit du 19/10) ───────────────────────────────────────
PAC = {"hvac_modes": ["off", "heat", "cool", "dry", "fan_only"], "min_temp": 16, "max_temp": 30,
       "supported_features": 1}
CLIM = {"hvac_modes": ["off", "cool", "dry", "fan_only"], "min_temp": 16, "max_temp": 30, "supported_features": 1}


def test_une_clim_qui_ne_fait_que_du_froid_n_est_pas_un_chauffage(fam):
    assert fam.famille("climate", "daikin", "clim-1", None, CLIM) is None
    assert fam.famille("climate", "daikin", "pac-1", None, PAC) == "thermostat"
    assert fam.famille("climate", "daikin", "pac-2", None, {**PAC, "hvac_modes": ["off", "heat_cool"]}) == "thermostat"
    assert fam.famille("climate", "generic", "t-1", None, {"supported_features": 1}) == "thermostat", \
        "sans liste de modes, on n'ecarte personne"


@pytest.mark.parametrize("froid", ["cool", "dry", "fan_only"])
def test_une_pompe_a_chaleur_qui_refroidit_n_est_jamais_remise_en_chauffe(fam, froid):
    assert fam.refroidit("thermostat", froid) and fam.refroidit("vtherm", froid)
    assert not fam.refroidit("thermostat", "heat") and not fam.refroidit("thermostat", "off")
    assert not fam.refroidit("fil_pilote", froid)


# ── La puissance fixe d'un poele MCZ (19/10) ────────────────────────────────
# Mesure chez lui le 19/10 : passe en `manual` dans l'application MCZ, le poele
# chauffe a puissance fixe (« Potenza 1 ») et ne regarde plus la consigne — 19 °C
# pour 17. Le planning croit l'Eco tenue et n'envoie rien.

def test_un_poele_mcz_en_manuel_chauffe_a_puissance_fixe(fam):
    assert fam.puissance_fixe("maestro_mcz", {**POELE, "preset_mode": "manual"})
    assert not fam.puissance_fixe("maestro_mcz", {**POELE, "preset_mode": "auto"})
    assert not fam.puissance_fixe("maestro_mcz", POELE), "sans prereglage, rien a dire"
    assert not fam.puissance_fixe("netatmo", {**POELE, "preset_mode": "manual"}),         "ailleurs, « manuel » peut etre une consigne tenue a la main : on ne suppose rien"
    assert not fam.puissance_fixe(None, None)


# ── Un thermostat qui suit son propre programme (Tado, Netatmo ; 19/10) ─────
# Lu dans le code de Home Assistant : sous Tado, `auto` = son programme
# intelligent, `heat` = un reglage manuel temporaire ; sous Netatmo, `auto` =
# son programme, `heat` = le manuel, qui expire. Revenir en `auto` n'est pas
# une consigne : « il suit son programme ».
TADO = {"hvac_modes": ["off", "auto", "heat"], "min_temp": 5, "max_temp": 25, "supported_features": 17}


def test_un_thermostat_sur_son_programme_se_lit_comme_tel(fam):
    lu = fam.lire_appareil("thermostat", "auto", {**TADO, "temperature": 19})
    assert lu["programme"] is True and lu["mode"] is None and lu["temperature"] == 19.0
    autre = fam.lire_appareil("thermostat", "auto", {**TADO, "temperature": 17})
    assert lu["signature"] == autre["signature"], "son programme change sa consigne : ce n'est pas un geste"
    assert lu["signature"] != fam.lire_appareil("thermostat", "heat", {**TADO, "temperature": 19})["signature"]
    assert not fam.lire_appareil("thermostat", "heat", {**TADO, "temperature": 19}).get("programme")
    # Un appareil dont `auto` EST le mode qui chauffe (sans `heat`) n'a pas de programme a lui.
    seul = {"hvac_modes": ["off", "auto"], "temperature": 19}
    assert not fam.lire_appareil("thermostat", "auto", seul).get("programme")


# ── Ce qu'un VTherm ou un Better Thermostat commande (audit du 19/10) ───────

def test_les_entites_commandees_par_un_vtherm_se_lisent_dans_ses_attributs(fam):
    assert fam.sous_jacents_vtherm({"vtherm_over_climate": {"underlying_entities": ["climate.trv_salon"]}}) \
        == ["climate.trv_salon"]
    assert fam.sous_jacents_vtherm({"vtherm_over_switch": {"underlying_entities": ["switch.rad", "select.rad_pilot_wire_mode"]}}) \
        == ["select.rad_pilot_wire_mode", "switch.rad"]
    assert fam.sous_jacents_vtherm({"vtherm_over_valve": {"underlying_entities": ["number.vanne"]}}) == ["number.vanne"]
    # Ses versions anciennes : a plat.
    assert fam.sous_jacents_vtherm({"underlying_climate_0": "climate.a", "underlying_entity_1": "switch.b",
                                    "underlying_entities": ["climate.c"]}) == ["climate.a", "climate.c", "switch.b"]
    assert fam.sous_jacents_vtherm({"temperature": 20}) == [] and fam.sous_jacents_vtherm(None) == []


def test_les_vannes_d_un_better_thermostat_se_lisent_dans_son_integration(fam):
    assert fam.sous_jacents_bt({"thermostat": [{"trv": "climate.trv_1", "integration": "zha"}, {"trv": "climate.trv_2"}]}) \
        == ["climate.trv_1", "climate.trv_2"]
    assert fam.sous_jacents_bt({"thermostat": "pas une liste"}) == [] and fam.sous_jacents_bt(None) == []


def test_qui_commande_quoi(fam):
    E = types.SimpleNamespace
    entrees = [E(entity_id="climate.salon_vt", platform="versatile_thermostat", config_entry_id="vt1"),
               E(entity_id="climate.bureau_bt", platform="better_thermostat", config_entry_id="bt1"),
               E(entity_id="climate.trv_salon", platform="zha", config_entry_id="z")]
    attrs = {"climate.salon_vt": {"vtherm_over_climate": {"underlying_entities": ["climate.trv_salon"]}}}
    bt = [("bt1", {"thermostat": [{"trv": "climate.trv_bureau"}]}), ("bt2", {"thermostat": [{"trv": "climate.trv_x"}]})]
    assert fam.commandes_par(entrees, lambda h: attrs.get(h, {}), bt) == {
        "climate.trv_salon": "climate.salon_vt", "climate.trv_bureau": "climate.bureau_bt", "climate.trv_x": ""}


# ── L'historique resume (audit du 19/10) ────────────────────────────────────

def test_l_historique_d_un_climate_se_resume(fam):
    lourd = {"hvac_modes": ["off", "heat"], "preset_modes": ["auto"] * 40, "friendly_name": "Poele", "icon": "mdi:stove"}
    points = [("heat", "2026-10-19T10:00:00+00:00", {**lourd, "temperature": 20, "current_temperature": 18.5, "hvac_action": "heating"}),
              ("heat", "2026-10-19T10:00:30+00:00", {**lourd, "temperature": 20, "current_temperature": 18.5, "hvac_action": "heating"}),
              ("heat", "2026-10-19T10:05:00+00:00", {**lourd, "temperature": 20, "current_temperature": 19.0, "hvac_action": "heating"}),
              ("off", "2026-10-19T10:30:00+00:00", {**lourd, "temperature": 20, "current_temperature": 19.0, "hvac_action": "idle"}),
              ("off", None, {"temperature": 20})]
    r = fam.historique_resume(points)
    assert [(p["state"], p["last_updated"]) for p in r] == [
        ("heat", "2026-10-19T10:00:00+00:00"), ("heat", "2026-10-19T10:05:00+00:00"), ("off", "2026-10-19T10:30:00+00:00")], \
        "un point quand quelque chose d'utile change ; un point sans date est ecarte"
    assert r[0]["attributes"] == {"temperature": 20, "current_temperature": 18.5, "hvac_action": "heating"}, \
        "ni ses listes, ni son nom, ni son icone"


# ── Les programmes d'ailleurs : Scheduler, Velair (D5 ; audit du 19/10) ─────

def test_un_scheduler_allume_qui_commande_le_chauffage_est_un_concurrent(fam):
    inters = [("switch.schedule_salon", "on", {"entities": ["climate.poele", "light.x"]}),
              ("switch.schedule_eteint", "off", {"entities": ["climate.poele"]}),
              ("switch.schedule_autre", "on", {"entities": ["climate.bureau"]}),
              ("switch.schedule_muet", "unavailable", {"entities": ["climate.poele"]}),
              ("switch.schedule_declenche", "triggered", {"entities": ["climate.poele"]})]
    assert fam.concurrents_scheduler(inters, "climate.poele") == ["switch.schedule_declenche", "switch.schedule_salon"]


def test_les_thermostats_d_un_velair_se_lisent_dans_ses_options_sinon_ses_donnees(fam):
    assert fam.entites_velair({"climate_entities": ["climate.a"]}, {"climate_entities": ["climate.b"]}) == ["climate.a"]
    assert fam.entites_velair({}, {"climate_entities": ["climate.b"]}) == ["climate.b"]
    assert fam.entites_velair(None, None) == []


# ── Le programme de l'appareil (audit du 19/10, D5) ─────────────────────────

def test_le_programme_de_l_appareil_est_trouve_par_son_identifiant_ou_son_nom_d_origine(fam):
    E = types.SimpleNamespace

    def e(entity_id, device_id="d1", unique_id=None, original_name=None, translation_key=None, disabled_by=None):
        return E(entity_id=entity_id, device_id=device_id, unique_id=unique_id, original_name=original_name,
                 translation_key=translation_key, disabled_by=disabled_by, entity_category=None)

    entrees = [
        e("climate.poele", unique_id="1809110010019"),
        e("switch.poele_timer", unique_id="1809110010019-crono_enabled", original_name="Timer"),
        e("switch.poele_start_stop", unique_id="1809110010019-att_eco", original_name="Start / Stop"),
        e("switch.mon_nom_a_moi", unique_id="abc", translation_key="schedule"),
        e("switch.desactive", unique_id="x-schedule", disabled_by="user"),
        e("switch.voisin_timer", device_id="d2", unique_id="y-timer"),
        e("sensor.poele_timer", unique_id="z-timer"),
    ]
    assert fam.programmes_de_l_appareil(entrees, "d1") == ["switch.mon_nom_a_moi", "switch.poele_timer"]
    assert fam.programmes_de_l_appareil(entrees, None) == []
    # Le nom AFFICHE ne compte pas : l'utilisateur le renomme.
    assert fam.programmes_de_l_appareil([e("switch.planning_maison", unique_id="u1", original_name="Lampe")],
                                        "d1") == []


@pytest.mark.parametrize("envoye,lue,attendu", [
    (17.5, 17, 1.0), (17.5, 18, 1.0),          # au degre : il tronque, ou il arrondit
    (17.5, 17.5, None),                         # il a pris la demi
    (18, 18, None), (18, 17, None),             # une consigne entiere ne revele rien
    (17.5, 19, None),                           # trop loin : son programme, pas son pas
    (None, 17, None), (17.5, None, None), ("x", 17, None),
])
def test_le_pas_qu_un_appareil_revele(fam, envoye, lue, attendu):
    assert fam.pas_revele(envoye, lue) == attendu


def test_vers_celsius_est_l_inverse_de_depuis_celsius():
    unites = charger("unites")
    assert unites.vers_celsius(68, "F") == 20
    assert unites.vers_celsius(20, "C") == 20
    assert round(unites.vers_celsius(unites.depuis_celsius(17.5, "F"), "F"), 6) == 17.5
