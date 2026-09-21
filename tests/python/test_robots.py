"""Tests du planning des robots : l'aspirateur et la tondeuse partent a l'heure.

Le point qui compte : un depart retenu a TOUJOURS un motif au journal. Un robot
qui ne part pas sans dire pourquoi, c'est une regle qu'on debranche.
"""
from __future__ import annotations

import asyncio
import datetime as dt
from pathlib import Path

import pytest

from conftest import FauxStore, charger

RACINE = Path(__file__).resolve().parents[2]


def lancer(coro):
    return asyncio.run(coro)


class FauxEtat:
    def __init__(self, state, attributes=None):
        self.state = state
        self.attributes = attributes or {}


class FauxEtats:
    def __init__(self, table):
        self.table = dict(table)

    def get(self, haid):
        return self.table.get(haid)

    def async_entity_ids(self, domaine):
        return [e for e in self.table if e.startswith(domaine + '.')]


class FauxServices:
    def __init__(self):
        self.appels = []

    def has_service(self, domaine, service):
        return True

    async def async_call(self, domaine, service, data, blocking=False, context=None):
        self.appels.append((domaine, service, dict(data)))


class FauxHass:
    def __init__(self, etats):
        self.states = FauxEtats(etats)
        self.services = FauxServices()
        self.taches = []

    def async_create_task(self, coro):
        self.taches.append(coro)
        return coro

    def abandonner(self):
        taches, self.taches = self.taches, []
        for coro in taches:
            coro.close()


class Entree:
    def __init__(self, entity_id, device_id=None, platform=None, translation_key=None, disabled_by=None):
        self.entity_id = entity_id
        self.device_id = device_id
        self.platform = platform
        self.translation_key = translation_key
        self.disabled_by = disabled_by


class FauxRegistre:
    def __init__(self, entrees):
        self.entities = {e.entity_id: e for e in entrees}

    def async_get(self, haid):
        return self.entities.get(haid)


@pytest.fixture
def module():
    return charger("robots")


@pytest.fixture
def regles_module():
    return charger("regles")


@pytest.fixture
def creer(module, store_module, regles_module):
    faits = []

    def fabrique(config=None, etats=None, registre=(), meteo=None):
        partage = {"loggia_robots": config or {}}
        if meteo:
            partage["loggia_weather"] = meteo
        magasin = store_module.LoggiaStore.__new__(store_module.LoggiaStore)
        magasin._store = FauxStore({"users": {}, "shared": partage, "migrated": True})
        magasin._ancien = FauxStore(None)
        magasin._data = None
        magasin._lock = asyncio.Lock()

        r = module.LoggiaRobots.__new__(module.LoggiaRobots)
        r.hass = FauxHass(etats or {})
        r.store = magasin
        r._defait = []
        # Le socle commun, un vrai : c'est lui qui tient le journal et le gel.
        r.regles = regles_module.Regles(r.hass, magasin)
        r.regles._depot = FauxStore(None)
        r.cfg = lancer(r.async_config())
        faux = FauxRegistre(list(registre))
        r._registre = lambda: faux
        faits.append(r)
        return r

    yield fabrique
    for r in faits:
        r.hass.abandonner()


def planning(**k):
    base = {"id": "p1", "robot": "vacuum.robot", "heure": "09:30", "jours": [0, 1, 2, 3, 4], "zones": [], "actif": True}
    base.update(k)
    return base


# Un lundi : 14/09/2026.
LUNDI_0930 = dt.datetime(2026, 9, 14, 9, 30)


def journal(r):
    return [(e["quoi"], e["detail"], e["n"]) for e in lancer(r.regles.journal(module="robots"))]


# ── Ce qui se calcule ───────────────────────────────────────────────────────

def test_lire_une_heure(module):
    assert module.lire_heure("09:30") == (9, 30)
    assert module.lire_heure("9:05") == (9, 5)
    assert module.lire_heure("00:00") == (0, 0)
    assert module.lire_heure("23:59") == (23, 59)
    for mauvais in ("24:00", "12:60", "midi", "", None, 930):
        assert module.lire_heure(mauvais) is None


def test_la_phase_d_un_robot(module):
    assert module.phase("cleaning") == "travail"
    assert module.phase("mowing") == "travail"
    assert module.phase("paused") == "pause"
    assert module.phase("returning") == "retour"
    assert module.phase("docked") == "base"
    assert module.phase("error") == "erreur"
    assert module.phase("idle") == "repos"
    for muet in ("unavailable", "unknown", "", None):
        assert module.phase(muet) == "absent"


def test_un_planning_tombe_a_sa_minute_et_ses_jours(module):
    assert module.est_du(planning(), LUNDI_0930) is True
    assert module.est_du(planning(), LUNDI_0930.replace(minute=31)) is False
    assert module.est_du(planning(), LUNDI_0930.replace(hour=10)) is False
    # Samedi 19/09 : hors des jours ouvres.
    assert module.est_du(planning(), dt.datetime(2026, 9, 19, 9, 30)) is False
    # Dimanche vaut 6.
    assert module.est_du(planning(jours=[6]), dt.datetime(2026, 9, 20, 9, 30)) is True
    assert module.est_du(planning(actif=False), LUNDI_0930) is False
    assert module.est_du(planning(heure="pas une heure"), LUNDI_0930) is False
    assert module.est_du(planning(jours=[]), LUNDI_0930) is False


def test_la_pluie_selon_la_meteo(module):
    for etat in ("rainy", "pouring", "lightning-rainy", "snowy", "snowy-rainy", "hail", "RAINY"):
        assert module.il_pleut(FauxEtat(etat)) is True
    for etat in ("sunny", "cloudy", "partlycloudy", "unavailable", ""):
        assert module.il_pleut(FauxEtat(etat)) is False
    assert module.il_pleut(None) is False


def test_la_commande_de_pieces_est_celle_de_l_integration(module):
    assert module.commande_pieces("ecovacs", [1, 3]) == (
        "vacuum", "send_command", {"command": "spot_area", "params": {"rooms": "1,3", "cleanings": 1}})
    assert module.commande_pieces("roborock", [16, 17]) == (
        "vacuum", "send_command", {"command": "app_segment_clean", "params": [16, 17]})
    assert module.commande_pieces("dreame_vacuum", [2]) == ("dreame_vacuum", "vacuum_clean_segment", {"segments": [2]})
    assert module.commande_pieces("xiaomi_miio", [2]) == ("xiaomi_miio", "vacuum_clean_segment", {"segments": [2]})
    assert module.commande_pieces("inconnue", [1]) is None
    assert module.commande_pieces(None, [1]) is None
    assert module.commande_pieces("ecovacs", []) is None
    # Un booleen n'est pas un numero de piece, une chaine non plus.
    assert module.commande_pieces("ecovacs", [True, "2"]) is None


def test_les_aires_d_une_tondeuse_sont_celles_de_son_appareil(module):
    entrees = [
        Entree("switch.t_zone_avant", "d1", translation_key="area"),
        Entree("switch.lawn_area_2", "d1"),
        # Un identifiant dans la langue de la maison : seule la cle le reconnait.
        Entree("switch.t_pelouse_nord", "d1", translation_key="area"),
        Entree("switch.t_pluie", "d1", translation_key="rain_detection"),
        Entree("switch.t_zone_eteinte", "d1", translation_key="area", disabled_by="user"),
        Entree("switch.autre_zone_1", "d2", translation_key="area"),
        Entree("sensor.t_zone_surface", "d1", translation_key="area"),
    ]
    assert module.aires_de(entrees, "d1") == ["switch.lawn_area_2", "switch.t_pelouse_nord", "switch.t_zone_avant"]
    assert module.aires_de(entrees, None) == []
    assert module.aires_de(None, "d1") == []


# ── Relire ce qu'on enregistre ──────────────────────────────────────────────

def test_un_planning_est_relu(module):
    propre = module.normaliser_planning({
        "id": "p-1", "robot": "lawn_mower.tondeuse", "heure": "7:05", "jours": [4, 0, 0],
        "zones": [{"id": "switch.t_zone_avant", "nom": "Avant"}, {"id": "salon", "segments": [1, 2]}]})
    assert propre == {
        "id": "p-1", "robot": "lawn_mower.tondeuse", "heure": "07:05", "jours": [0, 4], "actif": True,
        "zones": [{"id": "switch.t_zone_avant", "nom": "Avant", "segments": []},
                  {"id": "salon", "nom": "salon", "segments": [1, 2]}]}
    assert module.normaliser_planning(planning(actif=False))["actif"] is False


@pytest.mark.parametrize("defaut", [
    {"id": ""}, {"id": "Avec Espace"}, {"id": "x" * 41},
    {"robot": "light.salon"}, {"robot": "vacuum."}, {"robot": ""},
    {"heure": "25:00"}, {"heure": None},
    {"jours": [7]}, {"jours": [-1]}, {"jours": "lundi"}, {"jours": [True]}, {"jours": [1.5]},
    {"zones": "salon"}, {"zones": [{"nom": "sans id"}]}, {"zones": ["salon"]},
    {"zones": [{"id": "s", "segments": ["1"]}]}, {"zones": [{"id": "s", "segments": [True]}]},
    {"zones": [{"id": "s", "segments": list(range(21))}]},
    {"zones": [{"id": "z%d" % i} for i in range(31)]},
])
def test_un_planning_illisible_est_refuse(module, defaut):
    with pytest.raises(ValueError):
        module.normaliser_planning(planning(**defaut))
    with pytest.raises(ValueError):
        module.normaliser_planning("pas un objet")


def test_au_chargement_l_illisible_est_ecarte_pas_fatal(module):
    cfg = module.normaliser({
        "plannings": [planning(), planning(id="p2", heure="99:99"), planning(), "n'importe quoi", planning(id="p3")],
        "robots": {
            "vacuum.robot": {"calme": {"actif": "oui", "debut": "21:00", "fin": "8:00"}, "pluie": {"actif": True}},
            "lawn_mower.t": {"calme": {"debut": "jamais"}},
            "light.salon": {"calme": {"actif": True}},
            "vacuum.autre": "rien",
        }})
    assert [p["id"] for p in cfg["plannings"]] == ["p1", "p3"]
    assert cfg["robots"] == {"vacuum.robot": {"calme": {"actif": True, "debut": "21:00", "fin": "08:00"},
                                              "pluie": {"actif": True}}}
    assert module.normaliser(None) == {"plannings": [], "robots": {}}
    assert module.normaliser({"plannings": "x", "robots": []}) == {"plannings": [], "robots": {}}
    beaucoup = module.normaliser({"plannings": [planning(id="p%d" % i) for i in range(40)]})
    assert len(beaucoup["plannings"]) == module.MAX_PLANNINGS


# ── Le depart ───────────────────────────────────────────────────────────────

def test_un_aspirateur_part_pour_ses_pieces(creer):
    zones = [{"id": "salon", "nom": "Salon", "segments": [1]}, {"id": "cuisine", "nom": "Cuisine", "segments": [3]}]
    r = creer({"plannings": [planning(zones=zones)]}, {"vacuum.robot": FauxEtat("docked")},
              registre=[Entree("vacuum.robot", "d1", platform="ecovacs")])
    assert lancer(r.async_minute(LUNDI_0930)) == ["p1"]
    assert r.hass.services.appels == [("vacuum", "send_command", {
        "entity_id": ["vacuum.robot"], "command": "spot_area", "params": {"rooms": "1,3", "cleanings": 1}})]
    assert journal(r)[0][0] == "nettoyer : Salon, Cuisine"
    assert lancer(r.regles.journal(module="robots"))[0]["motif"] == "planning 09:30"


def test_sans_piece_ou_sans_integration_connue_c_est_un_passage_complet(creer):
    r = creer({"plannings": [planning()]}, {"vacuum.robot": FauxEtat("idle")},
              registre=[Entree("vacuum.robot", "d1", platform="ecovacs")])
    assert lancer(r.async_minute(LUNDI_0930)) == ["p1"]
    assert r.hass.services.appels == [("vacuum", "start", {"entity_id": ["vacuum.robot"]})]
    assert journal(r)[0][0] == "nettoyer"

    zones = [{"id": "salon", "nom": "Salon", "segments": [1]}]
    r = creer({"plannings": [planning(zones=zones)]}, {"vacuum.robot": FauxEtat("docked")},
              registre=[Entree("vacuum.robot", "d1", platform="marque_inconnue")])
    assert lancer(r.async_minute(LUNDI_0930)) == ["p1"]
    assert r.hass.services.appels == [("vacuum", "start", {"entity_id": ["vacuum.robot"]})]
    assert "pieces inconnues" in journal(r)[0][0], "le journal dit que les pieces n'ont pas pu etre visees"


def test_une_tondeuse_choisit_ses_aires_puis_tond(creer):
    zones = [{"id": "switch.t_zone_avant", "nom": "Avant", "segments": []}]
    r = creer({"plannings": [planning(robot="lawn_mower.t", zones=zones)]}, {"lawn_mower.t": FauxEtat("docked")},
              registre=[Entree("lawn_mower.t", "d1", platform="mammotion"),
                        Entree("switch.t_zone_avant", "d1", translation_key="area"),
                        Entree("switch.t_zone_arriere", "d1", translation_key="area"),
                        Entree("switch.voisin_zone", "d9", translation_key="area")])
    assert lancer(r.async_minute(LUNDI_0930)) == ["p1"]
    assert r.hass.services.appels == [
        ("switch", "turn_on", {"entity_id": ["switch.t_zone_avant"]}),
        ("switch", "turn_off", {"entity_id": ["switch.t_zone_arriere"]}),
        ("lawn_mower", "start_mowing", {"entity_id": ["lawn_mower.t"]}),
    ]
    assert journal(r)[0][0] == "tondre : Avant"

    r = creer({"plannings": [planning(robot="lawn_mower.t")]}, {"lawn_mower.t": FauxEtat("docked")})
    assert lancer(r.async_minute(LUNDI_0930)) == ["p1"]
    assert r.hass.services.appels == [("lawn_mower", "start_mowing", {"entity_id": ["lawn_mower.t"]})]
    assert journal(r)[0][0] == "tondre"


@pytest.mark.parametrize("etat,motif", [
    ("unavailable", "robot injoignable"), (None, "robot injoignable"),
    ("cleaning", "deja en route"), ("paused", "deja en route"), ("returning", "deja en route"),
])
def test_un_robot_absent_ou_en_route_ne_part_pas_et_le_journal_dit_pourquoi(creer, etat, motif):
    etats = {"vacuum.robot": FauxEtat(etat)} if etat is not None else {}
    r = creer({"plannings": [planning()]}, etats)
    assert lancer(r.async_minute(LUNDI_0930)) == []
    assert r.hass.services.appels == []
    assert journal(r) == [("retenu", motif, 0)]


def test_un_robot_en_erreur_ou_au_repos_part(creer):
    for etat in ("error", "idle", "docked"):
        r = creer({"plannings": [planning()]}, {"vacuum.robot": FauxEtat(etat)})
        assert lancer(r.async_minute(LUNDI_0930)) == ["p1"], etat


def test_ne_pas_deranger_retient_meme_par_dessus_minuit(creer):
    config = {"plannings": [planning(heure="23:15", jours=[0]), planning(id="p2", heure="06:45", jours=[0]),
                            planning(id="p3", heure="07:00", jours=[0])],
              "robots": {"vacuum.robot": {"calme": {"actif": True, "debut": "22:00", "fin": "07:00"}}}}
    r = creer(config, {"vacuum.robot": FauxEtat("docked")})
    assert lancer(r.async_minute(dt.datetime(2026, 9, 14, 23, 15))) == []
    assert lancer(r.async_minute(dt.datetime(2026, 9, 14, 6, 45))) == []
    assert journal(r)[0] == ("retenu", "ne pas deranger", 0)
    # La plage finit a 7 h pile : 07:00 part.
    assert lancer(r.async_minute(dt.datetime(2026, 9, 14, 7, 0))) == ["p3"]
    # Plage eteinte : rien ne retient.
    config["robots"]["vacuum.robot"]["calme"]["actif"] = False
    r = creer(config, {"vacuum.robot": FauxEtat("docked")})
    assert lancer(r.async_minute(dt.datetime(2026, 9, 14, 23, 15))) == ["p1"]
    # La plage d'un robot ne retient pas l'autre.
    config["robots"] = {"vacuum.autre": {"calme": {"actif": True, "debut": "22:00", "fin": "07:00"}}}
    r = creer(config, {"vacuum.robot": FauxEtat("docked")})
    assert lancer(r.async_minute(dt.datetime(2026, 9, 14, 23, 15))) == ["p1"]


def test_la_pluie_ne_retient_qu_une_tondeuse_qui_le_demande(creer):
    tondeuse = {"plannings": [planning(robot="lawn_mower.t")], "robots": {"lawn_mower.t": {"pluie": {"actif": True}}}}
    etats = {"lawn_mower.t": FauxEtat("docked"), "weather.maison": FauxEtat("pouring"), "weather.autre": FauxEtat("sunny")}
    r = creer(tondeuse, etats, meteo="weather.maison")
    assert lancer(r.async_minute(LUNDI_0930)) == []
    assert journal(r) == [("retenu", "pluie", 0)]
    # La meteo CHOISIE fait foi, pas la premiere venue.
    r = creer(tondeuse, etats, meteo="weather.autre")
    assert lancer(r.async_minute(LUNDI_0930)) == ["p1"]
    # Sans choix : la premiere entite meteo, par ordre d'identifiant.
    r = creer(tondeuse, etats)
    assert lancer(r.async_minute(LUNDI_0930)) == ["p1"]
    r = creer(tondeuse, {"lawn_mower.t": FauxEtat("docked"), "weather.maison": FauxEtat("rainy")})
    assert lancer(r.async_minute(LUNDI_0930)) == []
    # Un choix qui n'existe plus : la meteo qui reste fait foi.
    r = creer(tondeuse, {"lawn_mower.t": FauxEtat("docked"), "weather.b": FauxEtat("rainy")}, meteo="weather.disparue")
    assert lancer(r.async_minute(LUNDI_0930)) == []
    r = creer(tondeuse, {"lawn_mower.t": FauxEtat("docked"), "weather.b": FauxEtat("sunny")}, meteo="weather.disparue")
    assert lancer(r.async_minute(LUNDI_0930)) == ["p1"]
    # Reglage eteint : la tondeuse part sous la pluie — c'est son choix.
    sans = {"plannings": [planning(robot="lawn_mower.t")], "robots": {"lawn_mower.t": {"pluie": {"actif": False}}}}
    r = creer(sans, etats, meteo="weather.maison")
    assert lancer(r.async_minute(LUNDI_0930)) == ["p1"]
    # Pas de meteo du tout : rien ne retient.
    r = creer(tondeuse, {"lawn_mower.t": FauxEtat("docked")})
    assert lancer(r.async_minute(LUNDI_0930)) == ["p1"]
    # Un aspirateur se moque de la pluie.
    asp = {"plannings": [planning()], "robots": {"vacuum.robot": {"pluie": {"actif": True}}}}
    r = creer(asp, {"vacuum.robot": FauxEtat("docked"), "weather.maison": FauxEtat("pouring")}, meteo="weather.maison")
    assert lancer(r.async_minute(LUNDI_0930)) == ["p1"]


def test_une_main_posee_sur_le_robot_prime(creer):
    r = creer({"plannings": [planning()]}, {"vacuum.robot": FauxEtat("docked")})
    lancer(r.regles.geler("robots", "main", ["vacuum.robot"], motif="renvoye a la base"))
    assert lancer(r.async_minute(LUNDI_0930)) == []
    assert r.hass.services.appels == []
    assert "sous la main" in journal(r)[0][1]


def test_seuls_les_plannings_de_la_minute_partent(creer):
    config = {"plannings": [planning(), planning(id="p2", robot="lawn_mower.t", heure="09:30", jours=[0]),
                            planning(id="p3", heure="18:00"), planning(id="p4", actif=False)]}
    r = creer(config, {"vacuum.robot": FauxEtat("docked"), "lawn_mower.t": FauxEtat("docked")})
    assert lancer(r.async_minute(LUNDI_0930)) == ["p1", "p2"]
    assert [a[:2] for a in r.hass.services.appels] == [("vacuum", "start"), ("lawn_mower", "start_mowing")]


# ── Ce que l'interface lit et ecrit ─────────────────────────────────────────

def test_enregistrer_remplace_les_plannings_et_fusionne_les_robots(creer):
    r = creer({"plannings": [planning()], "robots": {"vacuum.robot": {"calme": {"actif": True, "debut": "21:00", "fin": "06:00"}}}})
    cfg = lancer(r.async_enregistrer({"plannings": [planning(id="neuf", heure="18:00")]}))
    assert [p["id"] for p in cfg["plannings"]] == ["neuf"]
    assert cfg["robots"]["vacuum.robot"]["calme"]["debut"] == "21:00", "les reglages des robots ne bougent pas"
    cfg = lancer(r.async_enregistrer({"robots": {"vacuum.robot": {"calme": {"fin": "07:30"}},
                                                "lawn_mower.t": {"pluie": {"actif": True}}}}))
    assert cfg["robots"]["vacuum.robot"] == {"calme": {"actif": True, "debut": "21:00", "fin": "07:30"}, "pluie": {"actif": False}}
    assert cfg["robots"]["lawn_mower.t"] == {"calme": {"actif": False, "debut": "22:00", "fin": "07:00"}, "pluie": {"actif": True}}
    assert [p["id"] for p in cfg["plannings"]] == ["neuf"], "les plannings ne bougent pas"
    # Ecrit dans le magasin, et relu tel quel.
    assert lancer(r.store.async_get_shared("loggia_robots"))["plannings"][0]["id"] == "neuf"
    assert r.cfg == cfg
    assert r.regles._pilotees["robots"] == {"vacuum.robot"}, "le robot planifie est declare au socle"
    lancer(r.async_enregistrer({"plannings": [planning(id="neuf"), planning(id="dort", robot="lawn_mower.t", actif=False)]}))
    assert r.regles._pilotees["robots"] == {"vacuum.robot"}, "un planning eteint ne fait pas ecouter son robot"
    lancer(r.async_enregistrer({"plannings": []}))
    assert r.regles._pilotees["robots"] == set()


@pytest.mark.parametrize("patch", [
    {"plannings": "rien"},
    {"plannings": [planning(heure="25:00")]},
    {"plannings": [planning(), planning()]},
    {"plannings": [planning(id="p%d" % i) for i in range(25)]},
    {"robots": []},
    {"robots": {"light.salon": {"calme": {"actif": True}}}},
    {"robots": {"vacuum.robot": "rien"}},
    {"robots": {"vacuum.robot": {"calme": "la nuit"}}},
    {"robots": {"vacuum.robot": {"calme": {"debut": "minuit"}}}},
    {"robots": {"vacuum.robot": {"pluie": True}}},
])
def test_enregistrer_refuse_l_illisible_sans_rien_ecrire(creer, patch):
    r = creer({"plannings": [planning()]})
    with pytest.raises(ValueError):
        lancer(r.async_enregistrer(patch))
    assert [p["id"] for p in lancer(r.async_config())["plannings"]] == ["p1"]


def test_l_etat_dit_la_config_la_meteo_et_le_journal(creer):
    r = creer({"plannings": [planning()]}, {"vacuum.robot": FauxEtat("cleaning"), "weather.maison": FauxEtat("sunny")})
    lancer(r.async_minute(LUNDI_0930))
    etat = lancer(r.async_etat())
    assert [p["id"] for p in etat["config"]["plannings"]] == ["p1"]
    assert etat["meteo"] == "weather.maison"
    assert [e["detail"] for e in etat["journal"]] == ["deja en route"]
    assert lancer(creer().async_etat())["meteo"] is None


# ── Le branchement ──────────────────────────────────────────────────────────

def test_le_module_est_branche_dans_le_composant():
    init = (RACINE / "custom_components" / "loggia" / "__init__.py").read_text(encoding="utf-8")
    assert 'data["robots"] = LoggiaRobots(hass, data["store"], data.get("regles"))' in init
    assert 'acces_robots=lambda: hass.data.get(DOMAIN, {}).get("robots")' in init
    ws = (RACINE / "custom_components" / "loggia" / "websocket_api.py").read_text(encoding="utf-8")
    assert 'WS_ROB_ETAT = "loggia/robots/etat"' in ws and 'WS_ROB_CONFIG = "loggia/robots/config"' in ws
    ecrire = ws[ws.index('{vol.Required("type"): WS_ROB_CONFIG'):]
    assert ecrire.index("@websocket_api.require_admin") < ecrire.index("async def handle_rob_config"), \
        "ecrire le planning de la maison reste aux administrateurs"
    assert "websocket_api.async_register_command(hass, handle_rob_etat)" in ws
    assert "websocket_api.async_register_command(hass, handle_rob_config)" in ws
