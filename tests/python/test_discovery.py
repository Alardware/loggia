"""Tests de la decouverte cote composant.

Ce module existe parce que les commandes equivalentes de Home Assistant sont
reservees aux administrateurs : sur un compte ordinaire, le dashboard n'avait ni
pieces ni appareils. Les tests verifient donc surtout ce qui SORT — la forme de
l'index, et ce qu'on refuse d'y mettre.
"""
from __future__ import annotations

import hashlib
import sys
import types

import pytest

from conftest import charger


class FauxRegistre:
    """Registre minimal : les vrais exposent bien plus, on n'en lit qu'une part."""

    def __init__(self, zones=(), etages=(), appareils=(), entites=()):
        self._zones, self._etages = list(zones), list(etages)
        self.devices = {d.id: d for d in appareils}
        self.entities = {e.entity_id: e for e in entites}

    def async_list_areas(self):
        return self._zones

    def async_list_floors(self):
        return self._etages


def objet(**champs):
    """Un enregistrement de registre, accessible par attribut."""
    return types.SimpleNamespace(**champs)


class FauxEtats:
    """Les etats de Home Assistant : on n'y lit que `get(entity_id).attributes`.

    Sans etat pour une entite — une entite du registre que rien n'a encore
    chargee — `get` rend None, comme le vrai.
    """

    def __init__(self, attributs=None):
        self._attributs = dict(attributs or {})

    def get(self, entity_id):
        if entity_id not in self._attributs:
            return None
        return objet(attributes=self._attributs[entity_id])


def zone(id_, nom, etage=None, icone=None):
    return objet(id=id_, name=nom, floor_id=etage, icon=icone)


def appareil(id_, **reste):
    base = dict(name=None, name_by_user=None, manufacturer=None, model=None,
                sw_version=None, identifiers=set(), area_id=None,
                via_device_id=None, entry_type=None, disabled_by=None)
    base.update(reste)
    return objet(id=id_, **base)


def entite(entity_id, **reste):
    base = dict(name=None, original_name=None, device_id=None, area_id=None,
                platform=None, entity_category=None, device_class=None, translation_key=None,
                original_device_class=None, unit_of_measurement=None,
                hidden_by=None, disabled_by=None)
    base.update(reste)
    return objet(entity_id=entity_id, **base)


@pytest.fixture
def decouverte():
    return charger("discovery")


def poser(module, *, zones=(), etages=(), appareils=(), entites=(), services=None, etats=None):
    """Branche des registres factices sur les doublures `homeassistant.*`.

    `etats` : {entity_id: attributs} — les etats que Home Assistant connait.
    """
    reg = FauxRegistre(zones, etages, appareils, entites)
    for nom in ("area_registry", "device_registry", "entity_registry", "floor_registry"):
        sys.modules[f"homeassistant.helpers.{nom}"].async_get = lambda _h, r=reg: r
    module.ar = sys.modules["homeassistant.helpers.area_registry"]
    module.dr = sys.modules["homeassistant.helpers.device_registry"]
    module.er = sys.modules["homeassistant.helpers.entity_registry"]
    return types.SimpleNamespace(
        services=types.SimpleNamespace(async_services=lambda: services or {}),
        states=FauxEtats(etats))


# ── Forme de l'index ────────────────────────────────────────────────────────

def test_index_complet(decouverte):
    hass = poser(
        decouverte,
        zones=[zone("salon", "Salon", "rdc")],
        appareils=[appareil("d1", name="Lampe", manufacturer="Exemple", model="X1",
                            identifiers={("demo", "abc")}, area_id="salon")],
        entites=[entite("light.exemple", device_id="d1", platform="demo")],
        services={"light": {"turn_on": objet(schema=None)}},
    )
    index = decouverte.async_index(hass)
    assert index["version"] == decouverte.INDEX_VERSION
    assert index["areas"] == [
        {"id": "salon", "name": "Salon", "floor": "rdc", "icon": None}]
    assert index["devices"][0]["manufacturer"] == "Exemple"
    # L'integration se lit dans `identifiers`, pas ailleurs : c'est elle qui
    # permettra plus tard de choisir un profil de connaissances.
    assert index["devices"][0]["integration"] == "demo"
    assert index["entities"][0]["id"] == "light.exemple"
    assert index["services"]["light"]["turn_on"] == {"fields": []}


def test_le_nom_donne_par_l_utilisateur_prime(decouverte):
    """Renommer un appareil dans Home Assistant doit se voir dans le dashboard."""
    hass = poser(decouverte, appareils=[appareil("d1", name="Robot X2", name_by_user="Le robot")])
    assert decouverte.async_index(hass)["devices"][0]["name"] == "Le robot"


def test_desactives_ecartes(decouverte):
    """Une entite desactivee n'a pas d'etat : l'afficher promettrait du vide."""
    hass = poser(
        decouverte,
        appareils=[appareil("d1"), appareil("d2", disabled_by="user")],
        entites=[entite("light.a"), entite("light.b", disabled_by="integration")],
    )
    index = decouverte.async_index(hass)
    assert [d["id"] for d in index["devices"]] == ["d1"]
    assert [e["id"] for e in index["entities"]] == ["light.a"]


class _Perms:
    """Politique de lecture minimale, a l'image de celle de Home Assistant."""

    def __init__(self, autorisees):
        self._ok = set(autorisees)

    def check_entity(self, entity_id, _action):
        return entity_id in self._ok


class _Compte:
    def __init__(self, is_admin, autorisees=None):
        self.id = "u1"
        self.name = "Test"
        self.is_admin = is_admin
        self.permissions = _Perms(autorisees or [])


def test_compte_restreint_ne_voit_que_ses_entites(decouverte):
    """Home Assistant sait limiter un compte : la decouverte doit s'y plier.

    Elle renvoyait le registre entier quel que soit le compte. Un administrateur
    pouvait donc restreindre quelqu'un, Loggia lui montrait tout de meme la
    maison complete.
    """
    hass = poser(decouverte, entites=[entite("light.a"), entite("light.b")])
    index = decouverte.async_index(hass, _Compte(False, ["light.a"]))
    assert [e["id"] for e in index["entities"]] == ["light.a"]


def test_compte_restreint_ne_voit_que_les_appareils_de_ses_entites(decouverte):
    """Audit du 19/10, M25 : les entites suivaient la politique du compte, les
    appareils non — un compte restreint a la lampe du salon recevait encore
    le nom, le fabricant et la piece de chaque appareil de la maison. Un
    appareil sans aucune entite autorisee ne part plus ; un appareil sans
    entite du tout non plus."""
    hass = poser(decouverte,
                 appareils=[appareil("d1", name="Lampe"), appareil("d2", name="Serrure"),
                            appareil("d3", name="Pont sans entite")],
                 entites=[entite("light.a", device_id="d1"), entite("lock.porte", device_id="d2"),
                          entite("sensor.d2_pile", device_id="d2", disabled_by="user")])
    index = decouverte.async_index(hass, _Compte(False, ["light.a", "sensor.d2_pile"]))
    assert [d["id"] for d in index["devices"]] == ["d1"]
    # Sans restriction, rien ne change : tous les appareils, meme sans entite.
    assert [d["id"] for d in decouverte.async_index(hass, _Compte(True))["devices"]] == ["d1", "d2", "d3"]


def test_sans_restriction_rien_ne_change(decouverte):
    """Le cas de presque toutes les installations : la reponse reste complete.

    Un administrateur, ou l'absence de compte connu, ne declenche aucun filtre —
    donc aucun parcours supplementaire et aucun changement de comportement.
    """
    hass = poser(decouverte, entites=[entite("light.a"), entite("light.b")])
    for compte in (None, _Compte(True)):
        index = decouverte.async_index(hass, compte)
        assert [e["id"] for e in index["entities"]] == ["light.a", "light.b"]


def test_version_de_firmware_absente(decouverte):
    """Une version exacte designe les failles publiees qui s'y appliquent.

    Le champ n'etait lu par personne cote client : il ne sort plus du serveur.
    """
    hass = poser(decouverte, appareils=[appareil("d1", sw_version="1.2.3")])
    appareil_vu = decouverte.async_index(hass)["devices"][0]
    assert "firmware" not in appareil_vu
    assert "1.2.3" not in repr(appareil_vu)


def test_masquee_signalee_mais_conservee(decouverte):
    """Masquee n'est pas desactivee : l'entite repond, on la marque seulement."""
    hass = poser(decouverte, entites=[entite("light.a", hidden_by="user")])
    assert decouverte.async_index(hass)["entities"][0]["hidden"] is True


def test_categorie_et_classe_transportees(decouverte):
    """Diagnostic et configuration n'ont rien a faire dans une carte."""
    hass = poser(decouverte, entites=[
        entite("sensor.rssi", entity_category=objet(value="diagnostic")),
        entite("sensor.temp", original_device_class="temperature"),
    ])
    e = decouverte.async_index(hass)["entities"]
    assert e[0]["category"] == "diagnostic"
    assert e[1]["device_class"] == "temperature"


def test_cle_de_traduction_transportee(decouverte):
    """L'identifiant est traduit a la creation, la cle ne l'est pas.

    « sensor.robot_temps_restant_filtre » ne dit « filtre » qu'en francais ; sa
    cle `lifespan_filter` le dit partout. Une entite sans cle rend None.
    """
    hass = poser(decouverte, entites=[
        entite("sensor.robot_temps_restant_filtre", translation_key="lifespan_filter"),
        entite("sensor.autre"),
    ])
    e = decouverte.async_index(hass)["entities"]
    assert e[0]["key"] == "lifespan_filter"
    assert e[1]["key"] is None


# ── Les empreintes d'un lecteur (chantier Medias, M1 B ; ADR 0208) ──────────
# Une meme Echo existe deux fois au registre : un appareil par integration, et
# le numero de serie dans les identifiants de chacun, sous deux domaines. L'ecran
# les apparie par l'EMPREINTE de la valeur ; la valeur, elle, ne sort pas.

def test_deux_domaines_meme_valeur_meme_empreinte(decouverte):
    """L'officielle et la HACS d'une Echo se rejoignent par la valeur seule :
    le domaine de l'integration n'entre pas dans l'empreinte."""
    hass = poser(
        decouverte,
        appareils=[appareil("d_off", identifiers={("alexa_devices", "SERIE-DEMO-0001")}),
                   appareil("d_hacs", identifiers={("alexa_media", "SERIE-DEMO-0001")}),
                   appareil("d_autre", identifiers={("alexa_media", "SERIE-DEMO-0002")})],
        entites=[entite("media_player.off", device_id="d_off"),
                 entite("media_player.hacs", device_id="d_hacs"),
                 entite("media_player.autre", device_id="d_autre")],
    )
    index = decouverte.async_index(hass)
    par_id = {d["id"]: d for d in index["devices"]}
    assert par_id["d_off"]["empreintes"] == par_id["d_hacs"]["empreintes"]
    assert par_id["d_off"]["empreintes"] != par_id["d_autre"]["empreintes"], "deux valeurs, deux empreintes"
    # La forme : UNE empreinte par identifiant, douze caracteres hexadecimaux, triees.
    assert len(par_id["d_off"]["empreintes"]) == 1
    assert all(len(e) == 12 and int(e, 16) >= 0 for e in par_id["d_off"]["empreintes"])
    # La valeur ne voyage jamais : ni telle quelle, ni en minuscules.
    assert "SERIE-DEMO" not in repr(index) and "serie-demo" not in repr(index).lower()


def test_sans_identifiant_pas_d_empreinte(decouverte):
    """Un appareil sans identifiant n'a pas d'empreinte ; une valeur vide non
    plus. Et seul un appareil qui porte un lecteur en a : l'index voyage vers
    chaque ecran, pas de champ en plus pour une lampe."""
    hass = poser(
        decouverte,
        appareils=[appareil("d_nu"),
                   appareil("d_vide", identifiers={("demo", "")}),
                   appareil("d_lampe", identifiers={("hue", "SERIE-LAMPE")}),
                   appareil("d_double", identifiers={("cast", "ABC"), ("cast", "DEF")})],
        entites=[entite("media_player.nu", device_id="d_nu"),
                 entite("media_player.vide", device_id="d_vide"),
                 entite("light.lampe", device_id="d_lampe"),
                 entite("media_player.double", device_id="d_double"),
                 entite("media_player.inactif", device_id="d_lampe", disabled_by="user")],
    )
    par_id = {d["id"]: d for d in decouverte.async_index(hass)["devices"]}
    assert "empreintes" not in par_id["d_nu"]
    assert "empreintes" not in par_id["d_vide"]
    assert "empreintes" not in par_id["d_lampe"], "un lecteur desactive ne fait pas de l'appareil un porteur"
    assert len(par_id["d_double"]["empreintes"]) == 2, "deux identifiants, deux empreintes"


def test_l_empreinte_est_stable(decouverte):
    """La meme valeur donne la meme empreinte d'un appel a l'autre et d'une
    installation a l'autre : c'est un hachage, pas un tirage."""
    assert decouverte._empreinte("SERIE-DEMO-0001") == decouverte._empreinte("SERIE-DEMO-0001")
    assert decouverte._empreinte("SERIE-DEMO-0001") == hashlib.sha256(b"SERIE-DEMO-0001").hexdigest()[:12]
    assert decouverte._empreinte(42) == decouverte._empreinte("42"), "une valeur numerique se hache comme sa chaine"


# ── La famille d'un chauffage ───────────────────────────────────────────────
# La decouverte des pieces, Objets et la regle des fenetres ne lisent que
# l'index, et l'index ne porte pas l'`unique_id` qui dit « pilot wire » : la
# famille se reconnait ICI, une seule fois (`chauffage_familles.famille`), et
# l'ecran la lit. Seule la famille sort — l'identifiant stable reste au serveur.

NODON = ["comfort", "eco", "frost_protection", "off", "comfort_-1", "comfort_-2"]
UID_NODON = "00158d0001abcdef_pilot_wire_mode_zigbee2mqtt"


def test_un_module_fil_pilote_porte_sa_famille(decouverte):
    """L'identifiant stable OU le nom d'origine disent « pilot wire » ; les
    options du NodOn sont des ordres fil pilote."""
    hass = poser(
        decouverte,
        entites=[
            entite("select.radiateur_salon_pilot_wire_mode", platform="mqtt", unique_id=UID_NODON),
            entite("select.module_chambre", platform="mqtt", unique_id="abc123",
                   original_name="Pilot wire mode"),
        ],
        etats={"select.radiateur_salon_pilot_wire_mode": {"options": NODON},
               "select.module_chambre": {"options": NODON}},
    )
    index = decouverte.async_index(hass)
    assert [e["famille"] for e in index["entities"]] == ["fil_pilote", "fil_pilote"]
    # L'identifiant stable ne voyage pas : on ne garde que ce qu'il a permis de reconnaitre.
    assert "00158d0001abcdef" not in repr(index)


def test_les_memes_ordres_sans_pilot_wire_ne_font_pas_un_fil_pilote(decouverte):
    """Des options seules ne font pas un fil pilote — ni le nom que
    l'utilisateur donne a l'entite, qu'il renomme comme il veut (ADR 0164, 0174) :
    seuls l'identifiant stable et le nom d'origine comptent."""
    hass = poser(
        decouverte,
        entites=[
            entite("select.mode_chauffe", platform="mqtt", unique_id="abc123_heating_mode",
                   original_name="Heating mode"),
            entite("select.pilot_wire_salon", name="Pilot wire salon", platform="mqtt",
                   unique_id="def456_mode"),
        ],
        etats={"select.mode_chauffe": {"options": NODON},
               "select.pilot_wire_salon": {"options": NODON}},
    )
    for e in decouverte.async_index(hass)["entities"]:
        assert "famille" not in e, e["id"]


def test_un_climate_qui_recoit_une_consigne_est_un_thermostat(decouverte):
    """Le bit 1 de `supported_features` (`TARGET_TEMPERATURE`) : une
    temperature par mode. Les autres bits n'y changent rien."""
    hass = poser(
        decouverte,
        entites=[entite("climate.poele", platform="maestro_mcz", unique_id="mcz-1")],
        etats={"climate.poele": {"supported_features": 17, "hvac_modes": ["off", "heat"]}},
    )
    assert decouverte.async_index(hass)["entities"][0]["famille"] == "thermostat"


def test_un_vtherm_se_reconnait_a_sa_plateforme(decouverte):
    """Il se commande par ses prereglages, jamais par `set_temperature`."""
    hass = poser(
        decouverte,
        entites=[entite("climate.salon_vtherm", platform="versatile_thermostat", unique_id="vt-1")],
        etats={"climate.salon_vtherm": {"supported_features": 17,
                                        "preset_modes": ["none", "frost", "eco", "comfort"]}},
    )
    assert decouverte.async_index(hass)["entities"][0]["famille"] == "vtherm"


def test_ce_qu_un_vtherm_ou_un_better_thermostat_commande_n_a_pas_de_famille(decouverte):
    """Audit du 19/10 : leur vanne sortait comme un chauffage de plus — deux chefs."""
    hass = poser(
        decouverte,
        entites=[entite("climate.salon_vtherm", platform="versatile_thermostat", unique_id="vt-1"),
                 entite("climate.trv_salon", platform="zha", unique_id="trv-1"),
                 entite("climate.bureau_bt", platform="better_thermostat", unique_id="bt-1", config_entry_id="bt1"),
                 entite("climate.trv_bureau", platform="zha", unique_id="trv-2"),
                 entite("climate.poele", platform="maestro_mcz", unique_id="mcz-1")],
        etats={"climate.salon_vtherm": {"supported_features": 17, "preset_modes": ["eco", "comfort"],
                                        "vtherm_over_climate": {"underlying_entities": ["climate.trv_salon"]}},
               "climate.trv_salon": {"supported_features": 1, "hvac_modes": ["off", "heat"]},
               "climate.bureau_bt": {"supported_features": 1, "hvac_modes": ["off", "heat"]},
               "climate.trv_bureau": {"supported_features": 1, "hvac_modes": ["off", "heat"]},
               "climate.poele": {"supported_features": 1, "hvac_modes": ["off", "heat"]}},
    )
    hass.config_entries = types.SimpleNamespace(async_entries=lambda domaine: [
        types.SimpleNamespace(entry_id="bt1", data={"thermostat": [{"trv": "climate.trv_bureau"}]})]
        if domaine == "better_thermostat" else [])
    familles = {e["id"]: e.get("famille") for e in decouverte.async_index(hass)["entities"]}
    assert familles == {"climate.salon_vtherm": "vtherm", "climate.trv_salon": None,
                        "climate.bureau_bt": "thermostat", "climate.trv_bureau": None, "climate.poele": "thermostat"}


def test_un_climate_sans_consigne_n_a_pas_de_famille(decouverte):
    """Un chauffage qui ne se regle que par prereglages (un Heatzy...) n'a pas
    le bit 1 : Home Assistant refuserait `set_temperature`."""
    hass = poser(
        decouverte,
        entites=[entite("climate.heatzy", platform="heatzy", unique_id="hz-1")],
        etats={"climate.heatzy": {"supported_features": 16, "preset_modes": ["comfort", "eco"]}},
    )
    assert "famille" not in decouverte.async_index(hass)["entities"][0]


def test_ni_une_lumiere_ni_un_interrupteur_n_ont_de_famille(decouverte):
    """L'index voyage vers chaque ecran : pas de champ vide en plus. Meme
    l'interrupteur d'un module fil pilote n'est pas un chauffage (il ne se
    coupe jamais, § 3.3)."""
    hass = poser(
        decouverte,
        entites=[entite("light.salon", platform="hue"),
                 entite("switch.radiateur_salon", platform="mqtt", unique_id=UID_NODON)],
        etats={"light.salon": {"supported_color_modes": ["xy"]}, "switch.radiateur_salon": {}},
    )
    for e in decouverte.async_index(hass)["entities"]:
        assert "famille" not in e, e["id"]


def test_sans_etat_la_famille_ne_se_devine_pas(decouverte):
    """Les options d'un `select` se lisent dans son etat. Une entite du registre
    que rien n'a chargee n'en a pas : rien a reconnaitre, et surtout pas
    d'erreur — elle ferait perdre l'index entier."""
    hass = poser(decouverte, entites=[entite("select.module", platform="mqtt", unique_id=UID_NODON)])
    index = decouverte.async_index(hass)
    assert [e["id"] for e in index["entities"]] == ["select.module"]
    assert "famille" not in index["entities"][0]


# ── Ce qu'on refuse d'exposer ───────────────────────────────────────────────

def test_index_sans_secret(decouverte):
    """Aucun jeton ni option de configuration ne doit transiter.

    La commande est ouverte a tout compte authentifie — c'est tout son interet —
    donc ce qu'elle renvoie doit rester anodin.
    """
    hass = poser(decouverte, appareils=[appareil("d1", identifiers={("demo", "abc")})])
    plat = repr(decouverte.async_index(hass)).lower()
    for interdit in ("token", "password", "api_key", "secret", "credential"):
        assert interdit not in plat


# ── Robustesse ──────────────────────────────────────────────────────────────

def _explose(_hass):
    raise RuntimeError("registre indisponible")


def test_registre_illisible_ne_prive_de_rien(decouverte):
    """Home Assistant doit demarrer meme si un registre repond de travers."""
    hass = poser(decouverte)
    sys.modules["homeassistant.helpers.area_registry"].async_get = _explose
    index = decouverte.async_index(hass)
    assert index["areas"] == [] and index["devices"] == []


def test_etages_absents_sur_ancienne_version(decouverte, monkeypatch):
    """Les etages n'existent que depuis 2024.4 : leur absence n'est pas une panne."""
    hass = poser(decouverte)
    monkeypatch.setitem(sys.modules, "homeassistant.helpers.floor_registry", None)
    assert decouverte.async_index(hass)["floors"] == []


def test_icone_de_zone_transportee(decouverte):
    """L'icone choisie dans Home Assistant doit arriver jusqu'au dashboard.

    Sans elle, l'icone d'une piece se deduisait des mots de son nom, ce qui
    obligeait a nommer ses pieces comme le dashboard l'attendait.
    """
    hass = poser(decouverte, zones=[zone("chambre", "Chambre Enfant", icone="mdi:teddy-bear")])
    assert decouverte.async_index(hass)["areas"][0]["icon"] == "mdi:teddy-bear"
