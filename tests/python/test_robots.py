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
# L'horloge du carnet des passages (chantier IoT, tache 4), en secondes.
T0 = 1_800_000_000.0


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
        # ASSERTION MODIFIEE (chantier IoT, tache 4, 18/10 ; I3 A) : le compte de chaque appel, et un service qui refuse — le
        # depart que donne `loggia/robots/lancer` part au nom de la personne, et un refus de Home Assistant se dit.
        self.contextes = []
        self.refuse = None
        # ASSERTION MODIFIEE (passe bis du 18/10, point 4) : chaque appel dit s'il ATTENDAIT la fin du service (`blocking`) — les
        # bascules d'aires doivent finir avant `start_mowing`, et l'echec d'une integration doit remonter.
        self.bloquants = []
        # ASSERTION MODIFIEE (passe bis 2 du 18/10, point E) : un service LENT — une integration qui tarde, ou ne repond pas : il part
        # (il est note), puis attend que le test le libere (`liberer`) ; rien ne doit l'annuler (`annules`).
        self.lents = set()
        self.en_attente = []
        self.annules = []
        self._libre = None

    def has_service(self, domaine, service):
        return True

    async def async_call(self, domaine, service, data, blocking=False, context=None):
        if self.refuse == (domaine, service):
            raise RuntimeError("service refuse")
        self.appels.append((domaine, service, dict(data)))
        self.contextes.append(getattr(context, "user_id", None))
        self.bloquants.append(blocking)
        if (domaine, service) in self.lents:
            if self._libre is None:
                self._libre = asyncio.Event()
            self.en_attente.append((domaine, service))
            try:
                await self._libre.wait()
            except asyncio.CancelledError:
                self.annules.append((domaine, service))
                raise
            self.en_attente.remove((domaine, service))

    def liberer(self):
        if self._libre is not None:
            self._libre.set()


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
    # ASSERTION MODIFIEE (chantier IoT, tache 4, 18/10) : `original_name`, le nom d'une aire de tonte sans celui de l'appareil.
    # ASSERTION MODIFIEE (passe bis du 18/10, point 2) : `hidden_by`, une entite masquee — l'ecran l'ecarte, le serveur aussi.
    # ASSERTION MODIFIEE (tranche robots 2, 19/10 ; R3, R9) : `options`, les options de l'entite (`vacuum.area_mapping`), et `id`,
    # l'identifiant d'entree que porte la reparation `segments_changed_<id>`.
    def __init__(self, entity_id, device_id=None, platform=None, translation_key=None, disabled_by=None, original_name=None,
                 hidden_by=None, options=None, id=None):
        self.entity_id = entity_id
        self.device_id = device_id
        self.platform = platform
        self.translation_key = translation_key
        self.disabled_by = disabled_by
        self.original_name = original_name
        self.hidden_by = hidden_by
        self.options = options
        self.id = id


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

    # ASSERTION MODIFIEE (passe bis du 18/10, point A) : `entites`, la description de la maison (`loggia_entities`) — ses scripts
    # maison de l'aspirateur (`vacuumScripts`), que `loggia/robots/lancer` reconnait.
    def fabrique(config=None, etats=None, registre=(), meteo=None, entites=None):
        partage = {"loggia_robots": config or {}}
        if meteo:
            partage["loggia_weather"] = meteo
        if entites is not None:
            partage["loggia_entities"] = entites
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
        # ASSERTION MODIFIEE (chantier IoT, tache 4, 18/10 ; I3 A) : la fabrique pose aussi le carnet des passages, son disque
        # (un FauxStore) et son horloge, comme `__init__` les pose — elle contourne `__init__`.
        r._poser_carnet()
        r._depot = FauxStore(None)
        r._maintenant = lambda: T0
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
    # ASSERTION MODIFIEE (tranche robots 2, 19/10 ; R4) : deebot-client 18 (HA >= 2026.3) attend une LISTE — « 1,3 » y devenait
    # « 1,,,3 » — ; la chaine reste pour un Home Assistant d'avant 2026.3. Chez Ecovacs, le bit CLEAN_AREA conditionne `spot_area`.
    assert module.commande_pieces("ecovacs", [1, 3], bits=16384) == (
        "vacuum", "send_command", {"command": "spot_area", "params": {"rooms": [1, 3], "cleanings": 1}})
    assert module.commande_pieces("ecovacs", [1, 3], version_ha=(2026, 2)) == (
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
        # ASSERTION MODIFIEE (passe bis du 18/10, point 2) : une aire MASQUEE n'en est pas une — l'ecran l'ecarte (`decrireSoeurs`),
        # le serveur aussi : il ne l'eteint pas derriere un depart, et « tout le jardin » ne la compte pas.
        Entree("switch.t_zone_cachee", "d1", translation_key="area", hidden_by="user"),
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
    # ASSERTION MODIFIEE (tranche robots 2, 19/10 ; R1, R4) : le robot a le bit CLEAN_AREA et publie ses pieces — la commande part
    # avec une LISTE (deebot-client 18) ; sans le bit ni `rooms`, un Ecovacs ne sait plus viser des pieces sur un HA recent.
    r = creer({"plannings": [planning(zones=zones)]}, {"vacuum.robot": FauxEtat("docked", {"supported_features": 16384, "rooms": {"salon": 1, "cuisine": 3}})},
              registre=[Entree("vacuum.robot", "d1", platform="ecovacs")])
    assert lancer(r.async_minute(LUNDI_0930)) == ["p1"]
    assert r.hass.services.appels == [("vacuum", "send_command", {
        "entity_id": ["vacuum.robot"], "command": "spot_area", "params": {"rooms": [1, 3], "cleanings": 1}})]
    assert journal(r)[0][0] == "nettoyer : Salon, Cuisine"
    assert lancer(r.regles.journal(module="robots"))[0]["motif"] == "planning 09:30"


def test_sans_piece_ou_sans_integration_connue_c_est_un_passage_complet(creer):
    r = creer({"plannings": [planning()]}, {"vacuum.robot": FauxEtat("idle")},
              registre=[Entree("vacuum.robot", "d1", platform="ecovacs")])
    assert lancer(r.async_minute(LUNDI_0930)) == ["p1"]
    assert r.hass.services.appels == [("vacuum", "start", {"entity_id": ["vacuum.robot"]})]
    assert journal(r)[0][0] == "nettoyer"

    # ASSERTION MODIFIEE (tranche robots 2, 19/10 ; R5, et la regle de l'ecran depuis la passe bis du 18/10, point 6) : un passage
    # qui NOMME des pieces que l'integration ne sait pas viser est RETENU, jamais « tout le logement » a sa place — un passage de
    # 23:00 pour la cuisine ne nettoie pas toute la maison ; le journal dit pourquoi.
    zones = [{"id": "salon", "nom": "Salon", "segments": [1]}]
    r = creer({"plannings": [planning(zones=zones)]}, {"vacuum.robot": FauxEtat("docked")},
              registre=[Entree("vacuum.robot", "d1", platform="marque_inconnue")])
    assert lancer(r.async_minute(LUNDI_0930)) == []
    assert r.hass.services.appels == [], "rien ne part : ni les pieces, ni tout le logement a leur place"
    assert journal(r)[0] == ("retenu", "pièces inconnues de cette intégration", 0), "le journal dit que les pieces n'ont pas pu etre visees"


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


def test_un_planning_de_trop_se_refuse_par_son_code_et_nomme_la_limite(creer, module):
    """Le refus que l'ecran peut provoquer — un planning de trop — porte un
    code a lui, et la limite apres les deux-points : l'ecran le dit dans sa
    langue (audit du 03/10). Il s'affichait en francais sans accents."""
    r = creer({"plannings": [planning()]})
    with pytest.raises(ValueError) as refus:
        lancer(r.async_enregistrer({"plannings": [planning(id="p%d" % i) for i in range(module.MAX_PLANNINGS + 1)]}))
    assert getattr(refus.value, "code", None) == "trop_de_plannings"
    assert str(refus.value).endswith(" : %d" % module.MAX_PLANNINGS), str(refus.value)
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


# ── Le carnet des passages, en temps reel (chantier IoT, tache 4 ; I3 A, spec 9) ─
# TESTS AJOUTES (chantier IoT, tache 4, 18/10). Le carnet ECOUTE et NOTE ; il ne commande rien. Seul `loggia/robots/lancer` — le
# geste d'une personne, sous son contexte et ses droits de pilotage — envoie un depart, toujours par un service explicite.

ZONES = [{"id": "seg:1", "nom": "Salon", "segments": [1]}, {"id": "seg:2", "nom": "Cuisine", "segments": [2]}]


class Evenement:
    def __init__(self, haid, etat):
        self.data = {"entity_id": haid, "new_state": etat}


class Compte:
    """Un compte Home Assistant : administrateur, ou ordinaire avec une politique d'entites."""

    def __init__(self, uid, admin=False, lit=None):
        self.id, self.is_admin = uid, admin
        self.permissions = type("P", (), {"check_entity": staticmethod(lambda haid, sorte: lit is None or haid in lit)})()


def ecovacs(creer, etat="docked", **k):
    # ASSERTION MODIFIEE (tranche robots 2, 19/10 ; R1, R4, Q2) : l'aspirateur de ces tests a le bit CLEAN_AREA et publie ses pieces
    # (`rooms`) — c'est ce qu'un Ecovacs doit annoncer pour que `spot_area` parte sur un Home Assistant recent, et sa liste fait foi.
    return creer(k.pop("config", {}), {"vacuum.robot": FauxEtat(etat, {"supported_features": 16384, "rooms": {"salon": 1, "cuisine": 2}}), **k.pop("etats", {})},
                 registre=[Entree("vacuum.robot", "d1", platform="ecovacs"), *k.pop("registre", [])], **k)


def test_lancer_des_pieces_les_note_au_carnet_au_nom_de_la_personne(creer):
    r = ecovacs(creer)
    etat = lancer(r.async_lancer_depart("vacuum.robot", ZONES, user=Compte("u1")))
    # ASSERTION MODIFIEE (tranche robots 2, 19/10 ; R4) : une LISTE, celle que deebot-client 18 attend.
    assert r.hass.services.appels == [("vacuum", "send_command", {
        "entity_id": ["vacuum.robot"], "command": "spot_area", "params": {"rooms": [1, 2], "cleanings": 1}})], "la commande de l'integration"
    assert r.hass.services.contextes == ["u1"], "le depart part au nom de la personne : le socle y voit une main"
    j = lancer(r.regles.journal(module="robots"))[0]
    assert (j["regle"], j["quoi"], j["motif"], j["cibles"]) == ("main", "nettoyer : Salon, Cuisine", "depuis l’écran", ["vacuum.robot"])
    # ASSERTION MODIFIEE (passe bis du 18/10, point 10) : `maintenant`, l'heure du serveur que l'ecran ne lisait pas, quitte l'etat ;
    # le depart rend l'etat du carnet.
    assert r.carnet["demandes"]["vacuum.robot"]["par"] == "u1" and "maintenant" not in etat and "en_cours" in etat
    # Le robot part : sa session prend les pieces ; il rentre : le passage est au carnet.
    r._maintenant = lambda: T0 + 30
    r._sur_etat(Evenement("vacuum.robot", FauxEtat("cleaning")))
    s = lancer(r.async_etat())["en_cours"]["vacuum.robot"]
    assert (s["zones"], s["tout"], s["source"]) == ([{"id": "seg:1", "nom": "Salon"}, {"id": "seg:2", "nom": "Cuisine"}], False, "loggia")
    r._maintenant = lambda: T0 + 30 + 51 * 60
    r._sur_etat(Evenement("vacuum.robot", FauxEtat("docked")))
    p = lancer(r.async_etat())["passages"][0]
    assert (p["duree_min"], p["issue"], [z["nom"] for z in p["zones"]]) == (51, "termine", ["Salon", "Cuisine"])


def test_lancer_sans_piece_nettoie_tout_le_logement(creer):
    r = ecovacs(creer)
    lancer(r.async_lancer_depart("vacuum.robot", [], user=Compte("u1")))
    assert r.hass.services.appels == [("vacuum", "start", {"entity_id": ["vacuum.robot"]})], "un service explicite : `start`, jamais `toggle`"
    assert r.carnet["demandes"]["vacuum.robot"]["tout"] is True
    assert lancer(r.regles.journal(module="robots"))[0]["quoi"] == "nettoyer"


def test_lancer_une_tondeuse_allume_ses_aires_choisies_puis_tond(creer):
    aires = [Entree("switch.t_zone_avant", "d1", translation_key="area", original_name="Zone Pelouse avant"),
             Entree("switch.t_zone_arriere", "d1", translation_key="area", original_name="Zone Pelouse arrière")]
    etats = {"lawn_mower.t": FauxEtat("docked"), "switch.t_zone_avant": FauxEtat("off"), "switch.t_zone_arriere": FauxEtat("on")}
    r = creer({}, etats, registre=[Entree("lawn_mower.t", "d1", platform="mammotion"), *aires])
    choisie = [{"id": "switch.t_zone_avant", "nom": "Pelouse avant", "segments": []}]
    lancer(r.async_lancer_depart("lawn_mower.t", choisie, user=Compte("u1")))
    assert r.hass.services.appels == [
        ("switch", "turn_on", {"entity_id": ["switch.t_zone_avant"]}),
        ("switch", "turn_off", {"entity_id": ["switch.t_zone_arriere"]}),
        ("lawn_mower", "start_mowing", {"entity_id": ["lawn_mower.t"]}),
    ], "le depart allume les choisies et eteint les autres, comme le planning"
    assert r.carnet["demandes"]["lawn_mower.t"]["zones"] == [{"id": "switch.t_zone_avant", "nom": "Pelouse avant"}]
    # Sans zone choisie : elle tond ses aires ALLUMEES, et le carnet les nomme.
    r = creer({}, etats, registre=[Entree("lawn_mower.t", "d1", platform="mammotion"), *aires])
    lancer(r.async_lancer_depart("lawn_mower.t", [], user=Compte("u1")))
    assert r.hass.services.appels == [("lawn_mower", "start_mowing", {"entity_id": ["lawn_mower.t"]})]
    d = r.carnet["demandes"]["lawn_mower.t"]
    assert (d["zones"], d["tout"]) == ([{"id": "switch.t_zone_arriere", "nom": "Pelouse arrière"}], False)
    assert lancer(r.regles.journal(module="robots"))[0]["quoi"] == "tondre : Pelouse arrière"
    # Sans aire du tout : tout le jardin.
    r = creer({}, {"lawn_mower.t": FauxEtat("docked")}, registre=[Entree("lawn_mower.t", "d1", platform="mammotion")])
    lancer(r.async_lancer_depart("lawn_mower.t", [], user=Compte("u1")))
    assert r.carnet["demandes"]["lawn_mower.t"]["tout"] is True


def test_la_tondeuse_une_seule_regle_pour_ou(creer):
    """TEST AJOUTE (passe bis du 18/10, point 2) : jamais Loggia ne rallume une aire que la personne n'a pas touchee.
      * sans zone — « Demarrer » de la carte, un passage du planning sans zone —, elle tond ses aires DEJA allumees, sans rien
        basculer ;
      * avec une selection, les choisies s'allument et les autres s'eteignent (un geste explicite), puis elle tond ;
      * une aire MASQUEE n'est ni basculee, ni comptee ;
      * quand les aires visees sont TOUTES ses aires visibles, le passage se dit « tout le jardin » (`tout`), sinon leur liste."""
    aires = [Entree("switch.t_zone_avant", "d1", translation_key="area", original_name="Zone Pelouse avant"),
             Entree("switch.t_zone_arriere", "d1", translation_key="area", original_name="Zone Pelouse arrière"),
             Entree("switch.t_zone_cachee", "d1", translation_key="area", original_name="Zone Cachée", hidden_by="user")]

    def tondeuse(avant="off", arriere="on", config=None):
        etats = {"lawn_mower.t": FauxEtat("docked"), "switch.t_zone_avant": FauxEtat(avant), "switch.t_zone_arriere": FauxEtat(arriere),
                 "switch.t_zone_cachee": FauxEtat("on")}
        return creer(config or {}, etats, registre=[Entree("lawn_mower.t", "d1", platform="mammotion"), *aires])

    # Toutes ses aires visibles choisies : allumees, la cachee intouchee — « tout le jardin ».
    r = tondeuse()
    toutes = [{"id": "switch.t_zone_avant", "nom": "Pelouse avant", "segments": []}, {"id": "switch.t_zone_arriere", "nom": "Pelouse arrière", "segments": []}]
    lancer(r.async_lancer_depart("lawn_mower.t", toutes, user=Compte("u1")))
    assert r.hass.services.appels == [("switch", "turn_on", {"entity_id": ["switch.t_zone_avant", "switch.t_zone_arriere"]}),
                                      ("lawn_mower", "start_mowing", {"entity_id": ["lawn_mower.t"]})], "rien d'eteint : la cachee n'est pas une aire"
    d = r.carnet["demandes"]["lawn_mower.t"]
    assert (d["tout"], [z["nom"] for z in d["zones"]]) == (True, ["Pelouse avant", "Pelouse arrière"]), "toutes ses aires : « tout le jardin »"
    # Sans zone, l'arriere seule allumee : rien ne bascule, et le passage dit l'arriere.
    r = tondeuse()
    lancer(r.async_lancer_depart("lawn_mower.t", [], user=Compte("u1")))
    assert r.hass.services.appels == [("lawn_mower", "start_mowing", {"entity_id": ["lawn_mower.t"]})]
    d = r.carnet["demandes"]["lawn_mower.t"]
    assert (d["tout"], [z["nom"] for z in d["zones"]]) == (False, ["Pelouse arrière"])
    # Sans zone, ses deux aires visibles allumees : « tout le jardin », toujours sans rien basculer.
    r = tondeuse(avant="on")
    lancer(r.async_lancer_depart("lawn_mower.t", [], user=Compte("u1")))
    assert r.hass.services.appels == [("lawn_mower", "start_mowing", {"entity_id": ["lawn_mower.t"]})]
    assert r.carnet["demandes"]["lawn_mower.t"]["tout"] is True
    # ASSERTION MODIFIEE (passe bis 2 du 18/10, point D) : aucune aire allumee, la tondeuse partait quand meme (`start_mowing`, le
    # passage sans ses aires). Un depart sans aire allumee n'envoie JAMAIS `start_mowing` : il se refuse par son code (`aucune_aire`),
    # sans rien commander ni laisser de demande — et Loggia ne rallume toujours aucune aire.
    r = tondeuse(arriere="off")
    with pytest.raises(ValueError) as e:
        lancer(r.async_lancer_depart("lawn_mower.t", [], user=Compte("u1")))
    assert getattr(e.value, "code", None) == "aucune_aire"
    assert (r.hass.services.appels, r.carnet["demandes"]) == ([], {})
    # Le planning sans zone : la meme regle, rien ne bascule.
    r = tondeuse(config={"plannings": [planning(robot="lawn_mower.t")]})
    assert lancer(r.async_minute(LUNDI_0930)) == ["p1"]
    assert r.hass.services.appels == [("lawn_mower", "start_mowing", {"entity_id": ["lawn_mower.t"]})]
    assert [z["nom"] for z in r.carnet["demandes"]["lawn_mower.t"]["zones"]] == ["Pelouse arrière"]
    # Une aire masquee demandee : ce n'est pas une des siennes.
    r = tondeuse()
    with pytest.raises(ValueError) as e:
        lancer(r.async_lancer_depart("lawn_mower.t", [{"id": "switch.t_zone_cachee", "nom": "Cachée", "segments": []}], user=Compte("u1")))
    assert getattr(e.value, "code", None) == "zone_inconnue" and r.hass.services.appels == []


def test_lancer_attend_chaque_service_et_un_echec_se_dit(creer):
    """TEST AJOUTE (passe bis du 18/10, point 4) : le depart attend chaque service (`blocking=True`) — les bascules d'aires d'abord,
    `start_mowing` ensuite, jamais dans le desordre — et l'echec d'une integration (une erreur que seul un appel attendu fait
    remonter) se dit par un refus nomme, `commande_refusee`, sans laisser de demande au carnet ; une bascule qui echoue ne fait pas
    tondre. Le planning attend lui aussi ses bascules, et ne tond pas si l'aire choisie n'a pas pu s'allumer."""
    aires = [Entree("switch.t_zone_avant", "d1", translation_key="area"), Entree("switch.t_zone_arriere", "d1", translation_key="area")]
    etats = {"lawn_mower.t": FauxEtat("docked"), "switch.t_zone_avant": FauxEtat("off"), "switch.t_zone_arriere": FauxEtat("on")}
    choisie = [{"id": "switch.t_zone_avant", "nom": "Avant", "segments": []}]
    r = creer({}, etats, registre=[Entree("lawn_mower.t", "d1", platform="mammotion"), *aires])
    lancer(r.async_lancer_depart("lawn_mower.t", choisie, user=Compte("u1")))
    assert [a[:2] for a in r.hass.services.appels] == [("switch", "turn_on"), ("switch", "turn_off"), ("lawn_mower", "start_mowing")]
    assert r.hass.services.bloquants == [True, True, True], "chaque service attendu : l'ordre tient, un echec remonte"
    for refuse in (("switch", "turn_on"), ("lawn_mower", "start_mowing")):
        r = creer({}, etats, registre=[Entree("lawn_mower.t", "d1", platform="mammotion"), *aires])
        r.hass.services.refuse = refuse
        with pytest.raises(ValueError) as e:
            lancer(r.async_lancer_depart("lawn_mower.t", choisie, user=Compte("u1")))
        assert getattr(e.value, "code", None) == "commande_refusee", refuse
        assert ("lawn_mower", "start_mowing") not in [a[:2] for a in r.hass.services.appels], refuse
        assert r.carnet["demandes"] == {}, "un depart qui n'est pas parti ne laisse pas sa demande"
        j = lancer(r.regles.journal(module="robots"))[0]
        assert (j["regle"], j["detail"]) == ("main", "commande refusee par Home Assistant")
    # L'aspirateur aussi : la commande de son integration, attendue.
    r = ecovacs(creer)
    lancer(r.async_lancer_depart("vacuum.robot", ZONES, user=Compte("u1")))
    assert r.hass.services.bloquants == [True]
    # Le planning : ses bascules attendues, puis il tond ; une bascule refusee : il ne tond pas, et le journal le dit.
    config = {"plannings": [planning(robot="lawn_mower.t", zones=choisie)]}
    r = creer(config, etats, registre=[Entree("lawn_mower.t", "d1", platform="mammotion"), *aires])
    assert lancer(r.async_minute(LUNDI_0930)) == ["p1"]
    assert r.hass.services.bloquants[:2] == [True, True], "les bascules du planning, attendues avant de tondre"
    r = creer(config, etats, registre=[Entree("lawn_mower.t", "d1", platform="mammotion"), *aires])
    r.hass.services.refuse = ("switch", "turn_on")
    assert lancer(r.async_minute(LUNDI_0930)) == []
    assert ("lawn_mower", "start_mowing") not in [a[:2] for a in r.hass.services.appels], "l'aire n'a pas pu s'allumer : pas de tonte"
    assert r.carnet["demandes"] == {}


AIRES_T = [Entree("switch.t_zone_avant", "d1", translation_key="area"), Entree("switch.t_zone_arriere", "d1", translation_key="area")]
REGISTRE_T = [Entree("lawn_mower.t", "d1", platform="mammotion"), *AIRES_T]
AVANT_SEULE = [{"id": "switch.t_zone_avant", "nom": "Avant", "segments": []}]


def test_sans_aire_allumee_ni_l_ecran_ni_le_planning_ne_font_tondre(creer):
    """TEST AJOUTE (passe bis 2 du 18/10, point D) : une tondeuse a aires dont aucune n'est allumee ne tond pas sans qu'on lui en
    choisisse une — jamais `start_mowing` dans ce cas, et Loggia ne rallume aucune aire. `loggia/robots/lancer` sans zone se refuse
    par son code (`aucune_aire`) ; un passage du planning sans zone est RETENU, et le journal dit la vraie cause, « aucune zone
    allumée ». Un passage qui nomme ses zones, lui, les allume et part ; une tondeuse sans aire du tout tond tout le jardin."""
    eteintes = {"lawn_mower.t": FauxEtat("docked"), "switch.t_zone_avant": FauxEtat("off"), "switch.t_zone_arriere": FauxEtat("off")}
    r = creer({"plannings": [planning(robot="lawn_mower.t")]}, eteintes, registre=REGISTRE_T)
    assert lancer(r.async_minute(LUNDI_0930)) == []
    assert (r.hass.services.appels, r.carnet["demandes"]) == ([], {})
    assert journal(r)[0] == ("retenu", "aucune zone allumée", 0)
    r = creer({"plannings": [planning(robot="lawn_mower.t", zones=AVANT_SEULE)]}, eteintes, registre=REGISTRE_T)
    assert lancer(r.async_minute(LUNDI_0930)) == ["p1"], "le passage nomme ses zones : elles s'allument, il part"
    assert [a[:2] for a in r.hass.services.appels] == [("switch", "turn_on"), ("switch", "turn_off"), ("lawn_mower", "start_mowing")]
    r = creer({}, {"lawn_mower.t": FauxEtat("docked")}, registre=[Entree("lawn_mower.t", "d1", platform="mammotion")])
    lancer(r.async_lancer_depart("lawn_mower.t", [], user=Compte("u1")))
    assert r.hass.services.appels == [("lawn_mower", "start_mowing", {"entity_id": ["lawn_mower.t"]})], "sans aire : tout le jardin"


def test_le_planning_d_une_tondeuse_retient_son_passage_et_dit_la_vraie_cause(creer):
    """TEST AJOUTE (passe bis 2 du 18/10, point I ; la sonde de la relecture de controle). Avant de tondre, le planning allume les zones
    du passage et ETEINT les autres. Si l'extinction d'une autre aire echoue, la tondeuse ne part pas — elle tondrait ce que le passage
    excluait — et le passage est retenu. La cause ecrite est la vraie : une aire sous la main de quelqu'un n'est pas « commande refusee
    par Home Assistant »."""
    etats = {"lawn_mower.t": FauxEtat("docked"), "switch.t_zone_avant": FauxEtat("off"), "switch.t_zone_arriere": FauxEtat("on")}
    config = {"plannings": [planning(robot="lawn_mower.t", zones=AVANT_SEULE)]}
    r = creer(config, etats, registre=REGISTRE_T)
    r.hass.services.refuse = ("switch", "turn_off")
    assert lancer(r.async_minute(LUNDI_0930)) == [], "l'aire arriere est restee allumee : pas de tonte"
    assert ("lawn_mower", "start_mowing") not in [a[:2] for a in r.hass.services.appels] and r.carnet["demandes"] == {}
    assert journal(r)[0] == ("retenu", "commande refusee par Home Assistant", 0)
    for sous_la_main in ("switch.t_zone_avant", "switch.t_zone_arriere"):
        r = creer(config, etats, registre=REGISTRE_T)
        r.regles.gele = lambda h, x=sous_la_main: h == x
        assert lancer(r.async_minute(LUNDI_0930)) == [], sous_la_main
        assert ("lawn_mower", "start_mowing") not in [a[:2] for a in r.hass.services.appels], sous_la_main
        assert journal(r)[0] == ("retenu", "sous la main de quelqu’un", 0), (sous_la_main, journal(r))


def test_un_depart_attend_l_integration_un_temps_borne_et_tient_son_vol(creer, module):
    """TEST AJOUTE (passe bis 2 du 18/10, point E). `blocking=True` n'avait pas de delai : une integration qui ne repond pas tenait le
    depart sans fin. Le depart l'attend ATTENTE_DEPART_S au plus, en tout, sans annuler le service deja parti : passe ce delai, une
    commande de depart partie compte pour partie (l'ecran l'a pour partie, le service continue sans nous) ; une bascule d'aire sans
    reponse retient la tondeuse (`sans_reponse`), sans demande laissee. Tant que le premier depart n'a pas repondu, un second se refuse
    (`deja_en_route`) — passe les 15 s, un autre ecran, le planning de la meme minute ; et le planning en vol refuse l'ecran. Sa
    reponse venue, le drapeau tombe."""
    asp = ecovacs(creer, config={"plannings": [planning()]})
    tond = creer({}, {"lawn_mower.t": FauxEtat("docked"), "switch.t_zone_avant": FauxEtat("off"), "switch.t_zone_arriere": FauxEtat("on")},
                 registre=REGISTRE_T)
    plan = creer({"plannings": [planning(robot="lawn_mower.t", zones=AVANT_SEULE)]},
                 {"lawn_mower.t": FauxEtat("docked"), "switch.t_zone_avant": FauxEtat("off"), "switch.t_zone_arriere": FauxEtat("on")},
                 registre=REGISTRE_T)

    async def lignes(r):
        return [(e["quoi"], e["detail"], e["n"]) for e in await r.regles.journal(module="robots")]

    async def laisser_finir():
        for _ in range(10):
            await asyncio.sleep(0)

    async def scenario():
        # L'aspirateur : `vacuum.start` ne repond pas.
        asp.hass.services.lents = {("vacuum", "start")}
        etat = await asp.async_lancer_depart("vacuum.robot", [], user=Compte("u1"))
        assert "en_cours" in etat and asp.hass.services.en_attente == [("vacuum", "start")], "rendu sans reponse ; le service court encore"
        asp._maintenant = lambda: T0 + 30
        with pytest.raises(ValueError) as e:
            await asp.async_lancer_depart("vacuum.robot", ZONES, user=Compte("u2"))
        assert getattr(e.value, "code", None) == "deja_en_route", "passe les 15 s : le drapeau garde"
        assert await asp.async_minute(LUNDI_0930) == [], "le planning de la meme minute aussi"
        assert (await lignes(asp))[0] == ("retenu", "deja en route", 0)
        assert len(asp.hass.services.appels) == 1
        asp.hass.services.liberer()
        await laisser_finir()
        assert (asp.hass.services.en_attente, asp.hass.services.annules) == ([], []), "il a fini : rien ne l'a annule"
        asp.hass.services.lents = set()
        await asp.async_lancer_depart("vacuum.robot", [], user=Compte("u2"))
        assert len(asp.hass.services.appels) == 2, "sa reponse venue, le drapeau tombe"
        # La tondeuse : une bascule d'aire sans reponse — elle ne tond pas, et le dit.
        tond.hass.services.lents = {("switch", "turn_on")}
        with pytest.raises(ValueError) as e:
            await tond.async_lancer_depart("lawn_mower.t", AVANT_SEULE, user=Compte("u1"))
        assert getattr(e.value, "code", None) == "sans_reponse"
        assert ("lawn_mower", "start_mowing") not in [a[:2] for a in tond.hass.services.appels] and tond.carnet["demandes"] == {}
        with pytest.raises(ValueError) as e:
            await tond.async_lancer_depart("lawn_mower.t", AVANT_SEULE, user=Compte("u1"))
        assert getattr(e.value, "code", None) == "deja_en_route", "la bascule court encore : pas de second depart"
        tond.hass.services.liberer()
        await laisser_finir()
        assert tond.hass.services.annules == []
        # Le planning en vol — sa bascule sans reponse — refuse l'ecran ; borne, il retient son passage et le dit.
        plan.hass.services.lents = {("switch", "turn_on")}
        tache = asyncio.ensure_future(plan.async_minute(LUNDI_0930))
        await asyncio.sleep(0.01)
        with pytest.raises(ValueError) as e:
            await plan.async_lancer_depart("lawn_mower.t", AVANT_SEULE, user=Compte("u1"))
        assert getattr(e.value, "code", None) == "deja_en_route", "la course planning / ecran dans la meme minute"
        assert await tache == []
        assert (await lignes(plan))[0] == ("retenu", "sans réponse de Home Assistant", 0)
        plan.hass.services.liberer()
        await laisser_finir()
        assert plan.hass.services.annules == []

    module.ATTENTE_DEPART_S, avant = 0.05, module.ATTENTE_DEPART_S
    try:
        lancer(scenario())
    finally:
        module.ATTENTE_DEPART_S = avant


@pytest.mark.parametrize("cas,refus", [
    ("robot invalide", ValueError), ("pas pilotable", PermissionError), ("injoignable", "robot_injoignable"),
    ("en route", "deja_en_route"), ("zones illisibles", ValueError), ("integration inconnue", "pieces_inconnues"),
    ("aire d'un autre", "zone_inconnue"), ("service refuse", "commande_refusee"),
    # TEST AJOUTE (passe bis du 18/10, point 6) : une piece choisie sans segment — Loggia ne sait pas la viser — ne retombe ni sur
    # « tout le logement », ni sur les seules pieces qu'elle sait viser : le depart se refuse.
    ("piece sans segment", "pieces_inconnues"),
])
def test_lancer_refuse_et_ne_commande_rien(creer, cas, refus):
    robot, zones, controle = "vacuum.robot", ZONES, None
    r = ecovacs(creer)
    if cas == "robot invalide":
        robot = "light.salon"
    elif cas == "pas pilotable":
        controle = lambda haid: haid != "vacuum.robot"
    elif cas == "injoignable":
        r = ecovacs(creer, etat="unavailable")
    elif cas == "en route":
        r = ecovacs(creer, etat="paused")
    elif cas == "zones illisibles":
        zones = [{"nom": "sans id"}]
    elif cas == "integration inconnue":
        r = creer({}, {"vacuum.robot": FauxEtat("docked")}, registre=[Entree("vacuum.robot", "d1", platform="marque_inconnue")])
    elif cas == "aire d'un autre":
        robot, zones = "lawn_mower.t", [{"id": "switch.voisin_zone", "nom": "Voisin", "segments": []}]
        r = creer({}, {"lawn_mower.t": FauxEtat("docked")}, registre=[Entree("lawn_mower.t", "d1"), Entree("switch.voisin_zone", "d9", translation_key="area")])
    elif cas == "service refuse":
        r.hass.services.refuse = ("vacuum", "send_command")
    elif cas == "piece sans segment":
        zones = [ZONES[0], {"id": "bureau", "nom": "Bureau", "segments": []}]
    with pytest.raises(PermissionError if refus is PermissionError else ValueError) as e:
        lancer(r.async_lancer_depart(robot, zones, user=Compte("u1"), controle=controle))
    if isinstance(refus, str):
        assert getattr(e.value, "code", None) == refus, cas
    assert r.hass.services.appels == [], cas + " : rien n'est parti"
    assert r.carnet["demandes"] == {}, cas + " : aucune demande ne reste derriere un refus"


def test_un_depart_deja_demande_se_refuse_quinze_secondes(creer):
    """TEST AJOUTE (passe bis du 18/10, point 1) : deux appuis sur « Demarrer » — un doigt qui hesite, deux ecrans — ne font pas
    deux departs. Tant que le robot n'a pas bouge, une demande de depart de moins de 15 s se refuse par `deja_en_route`, sans
    rien commander ; passe 15 s, un robot qui n'est pas parti peut etre relance. Le planning aussi laisse sa demande."""
    r = ecovacs(creer)
    lancer(r.async_lancer_depart("vacuum.robot", [], user=Compte("u1")))
    r._maintenant = lambda: T0 + 14.9
    with pytest.raises(ValueError) as e:
        lancer(r.async_lancer_depart("vacuum.robot", ZONES, user=Compte("u2")))
    assert getattr(e.value, "code", None) == "deja_en_route"
    assert r.hass.services.appels == [("vacuum", "start", {"entity_id": ["vacuum.robot"]})], "un seul depart"
    assert r.carnet["demandes"]["vacuum.robot"]["tout"] is True, "la premiere demande reste, la seconde ne la remplace pas"
    r._maintenant = lambda: T0 + 15
    lancer(r.async_lancer_depart("vacuum.robot", ZONES, user=Compte("u2")))
    assert len(r.hass.services.appels) == 2, "passe 15 s, le robot n'est pas parti : il se relance"
    # Le planning vient de lancer : un depart d'ecran dans la foulee se refuse aussi.
    r = ecovacs(creer, config={"plannings": [planning()]})
    assert lancer(r.async_minute(LUNDI_0930)) == ["p1"]
    with pytest.raises(ValueError) as e:
        lancer(r.async_lancer_depart("vacuum.robot", [], user=Compte("u1")))
    assert getattr(e.value, "code", None) == "deja_en_route"


SCRIPTS = {"vacuumScripts": {"nettoyer_tout": "script.robot_partout", "pieces_selectionnees": "script.robot_pieces",
                             "pause": "script.robot_pause", "retour_base": "script.robot_base"}}
ETATS_SCRIPTS = {"vacuum.robot": FauxEtat("docked", {"friendly_name": "Robot"}),
                 "script.robot_partout": FauxEtat("off", {"friendly_name": "Robot - Nettoyer partout"}),
                 "script.robot_pieces": FauxEtat("off", {"friendly_name": "nettoyer les pièces choisies"}),
                 "script.robot_pause": FauxEtat("off", {"friendly_name": "Robot : pause douce"}),
                 "script.robot_base": FauxEtat("off", {}), "script.autre": FauxEtat("off", {"friendly_name": "Arroser"})}


def test_un_script_maison_part_par_le_serveur_et_donne_son_nom_au_passage(creer):
    """TEST AJOUTE (passe bis du 18/10, point A ; sa reponse « Par le serveur ») : les scripts maison de l'aspirateur
    (`vacuumScripts`, les boutons de la popup) partent par `loggia/robots/lancer` — `script.turn_on`, un service explicite,
    attendu, sous le contexte de la personne. Un script qui LANCE un passage (`nettoyer_tout`, `pieces_selectionnees`) suit les
    regles d'un depart — injoignable, deja en route, les 15 s — et note au carnet le NOM du script (sans celui du robot devant),
    qui dit le passage a la place de « Nettoyage » ; les pieces choisies, s'il y en a, passent devant. Un script de geste (la pause,
    la base) part sans rien noter."""
    # ASSERTION MODIFIEE (passe bis 2 du 18/10, point J) : chaque script part avec le ROLE que l'ecran demande (`role`) — le depart,
    # les pieces, la pause : c'est lui, et non la place du script dans une liste, qui dit s'il lance un passage.
    r = ecovacs(creer, etats=ETATS_SCRIPTS, entites=SCRIPTS)
    lancer(r.async_lancer_depart("vacuum.robot", [], script="script.robot_partout", role="nettoyer_tout", user=Compte("u1")))
    assert r.hass.services.appels == [("script", "turn_on", {"entity_id": ["script.robot_partout"]})]
    assert (r.hass.services.contextes, r.hass.services.bloquants) == (["u1"], [True]), "au nom de la personne, jusqu'a ce que le script demarre"
    d = r.carnet["demandes"]["vacuum.robot"]
    assert (d["libelle"], d["zones"], d["tout"], d["source"]) == ("Nettoyer partout", [], False, "loggia"), "le nom du script, sans celui du robot"
    assert journal(r)[0][0] == "script : Nettoyer partout"
    r._maintenant = lambda: T0 + 30
    r._sur_etat(Evenement("vacuum.robot", FauxEtat("cleaning")))
    assert lancer(r.async_etat())["en_cours"]["vacuum.robot"]["libelle"] == "Nettoyer partout"
    # Deux appuis : le second depart, dans les 15 s, se refuse — le robot est deja en route.
    r = ecovacs(creer, etats=ETATS_SCRIPTS, entites=SCRIPTS)
    lancer(r.async_lancer_depart("vacuum.robot", [], script="script.robot_partout", role="nettoyer_tout", user=Compte("u1")))
    with pytest.raises(ValueError) as e:
        lancer(r.async_lancer_depart("vacuum.robot", [], script="script.robot_partout", role="nettoyer_tout", user=Compte("u1")))
    assert getattr(e.value, "code", None) == "deja_en_route" and len(r.hass.services.appels) == 1
    # Les pieces choisies d'un script de pieces : elles disent le passage.
    r = ecovacs(creer, etats=ETATS_SCRIPTS, entites=SCRIPTS)
    lancer(r.async_lancer_depart("vacuum.robot", [{"id": "bureau", "nom": "Bureau", "segments": []}], script="script.robot_pieces",
                                 role="pieces_selectionnees", user=Compte("u1")))
    d = r.carnet["demandes"]["vacuum.robot"]
    assert (d["zones"], d["libelle"]) == ([{"id": "bureau", "nom": "Bureau"}], "Nettoyer les pièces choisies")
    # Un script de geste, robot au travail : il part, sans demande au carnet ni regle de depart.
    r = ecovacs(creer, etats={**ETATS_SCRIPTS, "vacuum.robot": FauxEtat("cleaning", {"friendly_name": "Robot"})}, entites=SCRIPTS)
    lancer(r.async_lancer_depart("vacuum.robot", [], script="script.robot_pause", role="pause", user=Compte("u1")))
    assert r.hass.services.appels == [("script", "turn_on", {"entity_id": ["script.robot_pause"]})] and r.carnet["demandes"] == {}
    assert journal(r)[0][0] == "script : Pause douce"


@pytest.mark.parametrize("cas,refus", [
    ("pas un des siens", "script_inconnu"), ("une tondeuse", "script_inconnu"), ("absent de la maison", "script_inconnu"),
    ("robot pas pilotable", PermissionError), ("script pas pilotable", PermissionError), ("en route", "deja_en_route"),
    ("injoignable", "robot_injoignable"), ("service refuse", "commande_refusee"),
    # TEST AJOUTE (passe bis 2 du 18/10, point K) : un script de GESTE refuse n'est pas un « depart non lance » — son code a lui.
    ("geste refuse", "geste_refuse"),
    # TEST AJOUTE (passe bis 2 du 18/10, point J) : le role demande doit etre celui du script ; sans role, rien ne part.
    ("pas le script de ce role", "script_inconnu"), ("sans role", ValueError),
])
def test_un_script_maison_refuse_et_ne_commande_rien(creer, cas, refus):
    """TEST AJOUTE (passe bis du 18/10, point A) : un script qui n'est pas un des scripts reconnus pour CE robot — un autre script
    de la maison, un robot qui n'en a pas, un script disparu — se refuse par son code (`script_inconnu`) ; les droits de pilotage
    bornent le robot ET le script ; un depart garde ses refus ; un echec ne laisse pas de demande derriere lui.
    ASSERTION MODIFIEE (passe bis 2 du 18/10, point J) : chaque appel nomme le role demande (`role`)."""
    robot, script, role, controle = "vacuum.robot", "script.robot_partout", "nettoyer_tout", None
    etats = dict(ETATS_SCRIPTS)
    if cas == "pas un des siens":
        script = "script.autre"
    elif cas == "une tondeuse":
        robot = "lawn_mower.t"
        etats["lawn_mower.t"] = FauxEtat("docked")
    elif cas == "absent de la maison":
        del etats["script.robot_partout"]
    elif cas == "robot pas pilotable":
        controle = lambda haid: haid != "vacuum.robot"  # noqa: E731
    elif cas == "script pas pilotable":
        controle = lambda haid: haid != "script.robot_partout"  # noqa: E731
    elif cas == "en route":
        etats["vacuum.robot"] = FauxEtat("paused", {"friendly_name": "Robot"})
    elif cas == "injoignable":
        etats["vacuum.robot"] = FauxEtat("unavailable")
    elif cas == "geste refuse":
        script, role = "script.robot_pause", "pause"
        etats["vacuum.robot"] = FauxEtat("cleaning", {"friendly_name": "Robot"})
    elif cas == "pas le script de ce role":
        role = "pause"
    elif cas == "sans role":
        role = None
    r = ecovacs(creer, etats=etats, entites=SCRIPTS)
    if cas in ("service refuse", "geste refuse"):
        r.hass.services.refuse = ("script", "turn_on")
    with pytest.raises(PermissionError if refus is PermissionError else ValueError) as e:
        lancer(r.async_lancer_depart(robot, [], script=script, role=role, user=Compte("u1"), controle=controle))
    if isinstance(refus, str):
        assert getattr(e.value, "code", None) == refus, cas
    elif refus is ValueError:
        assert getattr(e.value, "code", None) is None, cas + " : un appel illisible, pas un refus nomme"
    assert r.hass.services.appels == [], cas + " : rien n'est parti"
    assert r.carnet["demandes"] == {}, cas + " : aucune demande ne reste derriere un refus"


def test_le_role_d_un_script_est_celui_que_l_ecran_demande(creer):
    """TEST AJOUTE (passe bis 2 du 18/10, point J) : le role d'un script — un depart, une reprise, une pause, la base — est celui que
    l'ecran DEMANDE, pas son appartenance a une liste. Le meme script, designe pour « nettoyer tout » ET pour « reprendre », reprend un
    robot en pause au lieu de tomber sur `deja_en_route` — et ne note aucune demande ; demande comme depart, le robot en pause, il se
    refuse, comme un depart."""
    scripts = {"vacuumScripts": {"nettoyer_tout": "script.robot_go", "reprendre": "script.robot_go"}}
    etats = {"vacuum.robot": FauxEtat("paused", {"friendly_name": "Robot"}), "script.robot_go": FauxEtat("off", {"friendly_name": "Robot - Aller"})}
    r = ecovacs(creer, etats=etats, entites=scripts)
    lancer(r.async_lancer_depart("vacuum.robot", [], script="script.robot_go", role="reprendre", user=Compte("u1")))
    assert r.hass.services.appels == [("script", "turn_on", {"entity_id": ["script.robot_go"]})] and r.carnet["demandes"] == {}
    with pytest.raises(ValueError) as e:
        lancer(r.async_lancer_depart("vacuum.robot", [], script="script.robot_go", role="nettoyer_tout", user=Compte("u1")))
    assert getattr(e.value, "code", None) == "deja_en_route" and len(r.hass.services.appels) == 1


def test_les_scripts_maison_n_appartiennent_qu_a_l_aspirateur_principal(creer):
    """TEST AJOUTE (passe bis 2 du 18/10, point C) : `vacuumScripts` designe les scripts de « l'aspirateur de la maison » — celui que
    sa description nomme (`loggia_entities.vacuum.main`), a defaut le SEUL aspirateur de la maison ; deux aspirateurs et aucun nomme,
    aucun script n'est reconnu. Un autre aspirateur ne les lance pas : le serveur les refuse (`script_inconnu`), rien ne part."""
    deux = {**ETATS_SCRIPTS, "vacuum.autre": FauxEtat("docked", {"friendly_name": "Autre"})}
    autre = [Entree("vacuum.autre", "d3", platform="ecovacs")]
    partout = dict(script="script.robot_partout", role="nettoyer_tout", user=Compte("u1"))
    r = ecovacs(creer, etats=deux, registre=autre, entites={**SCRIPTS, "vacuum": {"main": "vacuum.robot"}})
    with pytest.raises(ValueError) as e:
        lancer(r.async_lancer_depart("vacuum.autre", [], **partout))
    assert getattr(e.value, "code", None) == "script_inconnu" and r.hass.services.appels == [], "pas les scripts de l'autre"
    lancer(r.async_lancer_depart("vacuum.robot", [], **partout))
    assert r.hass.services.appels == [("script", "turn_on", {"entity_id": ["script.robot_partout"]})], "le principal : les siens"
    # Deux aspirateurs, aucun nomme — ou un nom qui n'est pas un aspirateur de la maison : aucun script reconnu.
    for entites in (SCRIPTS, {**SCRIPTS, "vacuum": {"main": "vacuum.disparu"}}, {**SCRIPTS, "vacuum": "vacuum.robot"}):
        r = ecovacs(creer, etats=deux, registre=autre, entites=entites)
        for robot in ("vacuum.robot", "vacuum.autre"):
            with pytest.raises(ValueError) as e:
                lancer(r.async_lancer_depart(robot, [], **partout))
            assert getattr(e.value, "code", None) == "script_inconnu", (robot, entites.get("vacuum"))
        assert r.hass.services.appels == []
    # Le seul aspirateur de la maison, sans nom : les siens.
    r = ecovacs(creer, etats=ETATS_SCRIPTS, entites=SCRIPTS)
    lancer(r.async_lancer_depart("vacuum.robot", [], **partout))
    assert len(r.hass.services.appels) == 1


def test_le_planning_note_son_depart_au_carnet(creer):
    r = ecovacs(creer, config={"plannings": [planning(zones=[{"id": "salon", "nom": "Salon", "segments": [1]}])]})
    r._maintenant = lambda: T0
    assert lancer(r.async_minute(LUNDI_0930)) == ["p1"]
    d = r.carnet["demandes"]["vacuum.robot"]
    assert (d["source"], d["par"], d["zones"], d["tout"]) == ("planning", None, [{"id": "salon", "nom": "Salon"}], False)
    r._sur_etat(Evenement("vacuum.robot", FauxEtat("cleaning")))
    assert r.carnet["en_cours"]["vacuum.robot"]["source"] == "planning"
    # Un depart retenu ne laisse pas de demande.
    r = ecovacs(creer, etat="cleaning", config={"plannings": [planning()]})
    lancer(r.async_minute(LUNDI_0930))
    assert r.carnet["demandes"] == {}


def test_les_capteurs_que_le_carnet_suit(module):
    entrees = [
        Entree("sensor.r_surface_nettoyee", "d1", translation_key="stats_area"),
        Entree("sensor.r_surface_totale", "d1", translation_key="total_stats_area"),
        Entree("sensor.r_erreur", "d1", translation_key="error"),
        Entree("sensor.r_code_erreur", "d1", translation_key="error_code"),
        Entree("sensor.autre_surface", "d2", translation_key="stats_area"),
        Entree("sensor.r_erreur_eteinte", "d1", translation_key="last_error", disabled_by="integration"),
    ]
    # ASSERTION MODIFIEE (passe bis du 18/10, point 3) : l'heure de l'erreur, quand l'appareil la publie (Mammotion : sa cle
    # `error_1_time`, un horodatage), se suit aussi — une erreur datee d'avant un passage n'en est pas le motif.
    entrees.append(Entree("sensor.r_heure_erreur", "d1", translation_key="error_1_time"))
    attributs = {"sensor.r_surface_nettoyee": {"unit_of_measurement": "m²"}, "sensor.r_surface_totale": {"unit_of_measurement": "m²", "device_class": "area"},
                 "sensor.autre_surface": {"unit_of_measurement": "m²"}, "sensor.r_heure_erreur": {"device_class": "timestamp"}}
    assert module.capteurs_du_robot(entrees, "d1", attributs.get) == {"surface": "sensor.r_surface_nettoyee", "erreur": "sensor.r_erreur",
                                                                      "heure_erreur": "sensor.r_heure_erreur"}, \
        "ni un total, ni un code d'erreur, ni l'appareil voisin, ni un capteur desactive ; l'heure a part"
    assert module.capteurs_du_robot(entrees, None, attributs.get) == {"surface": None, "erreur": None, "heure_erreur": None}


def test_le_carnet_suit_la_surface_et_l_erreur_des_soeurs(creer):
    r = ecovacs(creer, etats={"sensor.r_surface": FauxEtat("0", {"unit_of_measurement": "m²"}), "sensor.r_erreur": FauxEtat("no_error")},
                registre=[Entree("sensor.r_surface", "d1", translation_key="stats_area"), Entree("sensor.r_erreur", "d1", translation_key="error")])
    lancer(r._async_suivre())
    # ASSERTION MODIFIEE (passe bis du 18/10, point 3) : l'heure de l'erreur se suit aussi — cet aspirateur n'en a pas.
    assert r._suivis == {"vacuum.robot": {"surface": "sensor.r_surface", "erreur": "sensor.r_erreur", "heure_erreur": None}}
    r._sur_etat(Evenement("vacuum.robot", FauxEtat("cleaning")))
    for v in ("12", "42", "40"):
        r._sur_etat(Evenement("sensor.r_surface", FauxEtat(v)))
    r._sur_etat(Evenement("sensor.r_erreur", FauxEtat("Bloqué sous le canapé")))
    r._maintenant = lambda: T0 + 22 * 60
    r._sur_etat(Evenement("vacuum.robot", FauxEtat("idle")))
    p = r.carnet["passages"][-1]
    assert (p["surface"], p["motif"], p["issue"]) == (42, "Bloqué sous le canapé", "interrompu")
    assert lancer(r.async_etat())["erreurs"]["vacuum.robot"]["texte"] == "Bloqué sous le canapé"


def test_le_motif_se_lit_au_bon_endroit_et_seulement_neuf(creer):
    """TEST AJOUTE (passe bis du 18/10, point 3). L'aspirateur de l'integration officielle publie un CODE d'erreur et son texte
    dans l'attribut `description` (0 : tout va bien) : le motif est le texte, jamais le code. Une coupure (`unavailable`) ne fait
    pas revenir l'ancienne erreur en erreur neuve. Au demarrage de Home Assistant, l'erreur relue devient la derniere connue,
    jamais le motif du passage en cours. La tondeuse publie le texte ET l'heure de sa derniere erreur : une erreur d'avant le
    passage n'en est pas le motif ; la meme erreur a une heure neuve en est une."""
    # L'aspirateur : un code, son texte en attribut.
    r = ecovacs(creer, etats={"sensor.r_erreur": FauxEtat("0", {"description": "NoError: Robot is operational"})},
                registre=[Entree("sensor.r_erreur", "d1", translation_key="error")])
    lancer(r._async_suivre())
    r._sur_etat(Evenement("vacuum.robot", FauxEtat("cleaning")))
    r._sur_etat(Evenement("sensor.r_erreur", FauxEtat("unavailable")))
    assert r.carnet["en_cours"]["vacuum.robot"]["motif"] is None
    r._sur_etat(Evenement("sensor.r_erreur", FauxEtat("102", {"description": "Brosse principale bloquée"})))
    assert r.carnet["en_cours"]["vacuum.robot"]["motif"] == "Brosse principale bloquée", "le texte, jamais le code"
    r._sur_etat(Evenement("sensor.r_erreur", FauxEtat("104")))
    assert r.carnet["en_cours"]["vacuum.robot"]["motif"] == "Brosse principale bloquée", "un code sans texte ne se montre pas"
    # Au demarrage, une erreur deja la : la derniere connue, pas le motif du passage que le robot poursuit.
    r = ecovacs(creer, etat="cleaning", etats={"sensor.r_erreur": FauxEtat("102", {"description": "Brosse principale bloquée"})},
                registre=[Entree("sensor.r_erreur", "d1", translation_key="error")])
    lancer(r._async_suivre())
    assert (r.carnet["en_cours"]["vacuum.robot"]["motif"], r.carnet["erreurs"]["vacuum.robot"]["texte"]) == (None, "Brosse principale bloquée")
    # La tondeuse : le texte et l'heure de sa derniere erreur.
    avant = "2026-10-17T09:00:00+00:00"
    etats = {"lawn_mower.t": FauxEtat("docked"), "sensor.t_message": FauxEtat("Pluie détectée"), "sensor.t_heure": FauxEtat(avant, {"device_class": "timestamp"})}
    registre = [Entree("lawn_mower.t", "d2", platform="mammotion"), Entree("sensor.t_message", "d2", translation_key="error_1_message"),
                Entree("sensor.t_heure", "d2", translation_key="error_1_time")]
    r = creer({}, etats, registre=registre)
    lancer(r._async_suivre())
    assert r._suivis["lawn_mower.t"] == {"surface": None, "erreur": "sensor.t_message", "heure_erreur": "sensor.t_heure"}
    r._maintenant = lambda: dt.datetime(2026, 10, 17, 10, 0, tzinfo=dt.timezone.utc).timestamp()
    r._sur_etat(Evenement("lawn_mower.t", FauxEtat("mowing")))
    r._sur_etat(Evenement("sensor.t_message", FauxEtat("unavailable")))
    r._sur_etat(Evenement("sensor.t_message", FauxEtat("Pluie détectée")))
    assert r.carnet["en_cours"]["lawn_mower.t"]["motif"] is None, "la derniere erreur d'avant le passage, revenue : pas son motif"
    r.hass.states.table["sensor.t_heure"] = FauxEtat("2026-10-17T10:20:00+00:00", {"device_class": "timestamp"})
    r._sur_etat(Evenement("sensor.t_heure", r.hass.states.table["sensor.t_heure"]))
    assert r.carnet["en_cours"]["lawn_mower.t"]["motif"] == "Pluie détectée", "la meme erreur, a une heure neuve pendant le passage : son motif"


def test_un_capteur_d_heure_muet_rend_la_lecture_muette(creer):
    """TEST AJOUTE (passe bis 2 du 18/10, point A ; la sonde de la relecture de controle, ses deux cas dans les deux ordres). Quand
    l'appareil DATE ses erreurs (Mammotion : le message et son heure, par Bluetooth et par le nuage), un capteur d'heure muet
    (`unavailable`, `unknown`) rend la lecture muette : ni erreur neuve, ni fin d'erreur, et la date connue reste. Une coupure ne fait
    pas d'une vieille erreur (09:00) le motif d'un passage commence a 10:00 — que l'heure se taise avant le message ou apres, que le
    message revienne avant l'heure ou apres. Une erreur vraiment neuve, datee pendant le passage, en reste le motif."""
    avant = "2026-10-17T09:00:00+00:00"
    date_avant = dt.datetime(2026, 10, 17, 9, 0, tzinfo=dt.timezone.utc).timestamp()

    def tondeuse():
        etats = {"lawn_mower.t": FauxEtat("docked"), "sensor.t_message": FauxEtat("Pluie détectée"),
                 "sensor.t_heure": FauxEtat(avant, {"device_class": "timestamp"})}
        registre = [Entree("lawn_mower.t", "d2", platform="mammotion"), Entree("sensor.t_message", "d2", translation_key="error_1_message"),
                    Entree("sensor.t_heure", "d2", translation_key="error_1_time")]
        r = creer({}, etats, registre=registre)
        lancer(r._async_suivre())
        r._maintenant = lambda: dt.datetime(2026, 10, 17, 10, 0, tzinfo=dt.timezone.utc).timestamp()
        r._sur_etat(Evenement("lawn_mower.t", FauxEtat("mowing")))
        assert r.carnet["en_cours"]["lawn_mower.t"]["motif"] is None
        return r

    def poser(r, haid, etat):
        r.hass.states.table[haid] = etat
        r._sur_etat(Evenement(haid, etat))

    def lu(r):
        e = r.carnet["erreurs"].get("lawn_mower.t") or {}
        return r.carnet["en_cours"]["lawn_mower.t"]["motif"], e.get("texte"), e.get("date")

    heure = lambda v: FauxEtat(v, {"device_class": "timestamp"})  # noqa: E731
    # 1. L'heure se tait AVANT le message, qui garde l'ancien texte ; puis le message se tait ; au retour, l'heure revient la premiere.
    r = tondeuse()
    poser(r, "sensor.t_heure", FauxEtat("unavailable"))
    assert lu(r) == (None, "Pluie détectée", date_avant), "l'heure muette : la lecture est muette, la date connue reste"
    poser(r, "sensor.t_message", FauxEtat("unavailable"))
    poser(r, "sensor.t_heure", heure(avant))
    poser(r, "sensor.t_message", FauxEtat("Pluie détectée"))
    assert lu(r) == (None, "Pluie détectée", date_avant), "la meme vieille erreur, revenue : pas le motif"
    # 2. Le message se tait AVANT l'heure ; au retour, le message revient le premier, l'heure encore muette.
    r = tondeuse()
    poser(r, "sensor.t_message", FauxEtat("unavailable"))
    poser(r, "sensor.t_heure", FauxEtat("unavailable"))
    poser(r, "sensor.t_message", FauxEtat("Pluie détectée"))
    assert lu(r) == (None, "Pluie détectée", date_avant), "l'heure encore muette : la lecture est muette"
    poser(r, "sensor.t_heure", heure(avant))
    assert lu(r) == (None, "Pluie détectée", date_avant), "l'heure revenue, la meme : rien de neuf"
    # Muette, l'heure ne laisse pas non plus dire la FIN d'une erreur.
    poser(r, "sensor.t_heure", FauxEtat("unknown"))
    poser(r, "sensor.t_message", FauxEtat("no_error"))
    assert lu(r) == (None, "Pluie détectée", date_avant), "ni fin d'erreur"
    # Une erreur neuve, datee pendant le passage : son motif.
    r.hass.states.table["sensor.t_message"] = FauxEtat("Lame bloquée")
    poser(r, "sensor.t_heure", heure("2026-10-17T10:20:00+00:00"))
    assert lu(r)[:2] == ("Lame bloquée", "Lame bloquée")


def test_au_demarrage_le_carnet_reprend_ou_en_sont_les_robots(creer):
    r = ecovacs(creer, etat="cleaning")
    lancer(r._async_suivre())
    assert "vacuum.robot" in r.carnet["en_cours"], "un robot deja au travail ouvre sa session"
    assert r.hass.services.appels == [], "relire un etat n'est pas un geste : rien ne part"


def test_l_etat_rend_le_carnet_sous_les_droits_de_lecture(creer):
    r = creer({}, {"vacuum.robot": FauxEtat("docked"), "lawn_mower.t": FauxEtat("docked")})
    r._sur_etat(Evenement("vacuum.robot", FauxEtat("cleaning")))
    r._sur_etat(Evenement("lawn_mower.t", FauxEtat("mowing")))
    tout = lancer(r.async_etat(Compte("admin", admin=True)))
    # ASSERTION MODIFIEE (passe bis du 18/10, point 10) : plus de `maintenant` — un champ mort, qui changeait chaque reponse et
    # empechait l'ecran de reconnaitre un etat inchange.
    assert sorted(tout["en_cours"]) == ["lawn_mower.t", "vacuum.robot"] and "maintenant" not in tout
    borne = lancer(r.async_etat(Compte("u2", lit={"lawn_mower.t"})))
    assert list(borne["en_cours"]) == ["lawn_mower.t"], "un compte ne lit que les robots qu'il a le droit de lire"


def test_le_carnet_se_relit_au_demarrage_et_s_ecrit(creer, module):
    r = ecovacs(creer)
    vieux = {"passages": [{"robot": "vacuum.robot", "debut": T0 - 7200, "fin": T0 - 3600, "duree_s": 3000, "issue": "termine",
                           "zones": [], "tout": True, "source": "loggia", "par": "u1", "surface": 68, "motif": None}]}
    r._depot = FauxStore(vieux)
    lancer(r._async_lire_carnet())
    assert len(r.carnet["passages"]) == 1
    r._sur_etat(Evenement("vacuum.robot", FauxEtat("cleaning")))
    assert r._ecriture is not None, "l'ecriture est differee"
    lancer(r._async_ecrire())
    assert r._depot.contenu["en_cours"] and r._depot.contenu["version"] == module.VERSION_ETAT
    # A l'arret, ce qui attendait part.
    r._ecriture = lambda: None
    r.async_arreter()
    lancer(r.hass.taches.pop())
    assert r._depot.ecritures == 2 and r._arrete is True


def test_un_redemarrage_de_home_assistant_ne_compte_pas_la_coupure(creer):
    """TEST AJOUTE (passe bis du 18/10, point 5) : a l'arret de Home Assistant (`_sur_arret`), le passage en cours note l'instant
    de la coupure et le disque l'ecrit tout de suite, meme sans ecriture en attente. Au retour, une heure plus tard : un robot qui
    travaille encore reprend a l'instant ou il est revu — l'heure de coupure ne compte pas ; un robot rentre pendant la coupure clot
    son passage a son instant."""
    r = ecovacs(creer)
    r._sur_etat(Evenement("vacuum.robot", FauxEtat("cleaning")))
    r._annuler_ecriture()  # rien n'attend : l'arret ecrit quand meme, la coupure est une note neuve
    r._maintenant = lambda: T0 + 600
    lancer(r._sur_arret(None))
    assert r._depot.ecritures == 1 and r._depot.contenu["en_cours"]["vacuum.robot"]["coupure"] == T0 + 600
    for etat, attendu in (("cleaning", None), ("docked", (600, T0 + 600, "termine"))):
        r2 = ecovacs(creer, etat=etat)
        r2._depot = FauxStore(r._depot.contenu)
        r2._maintenant = lambda: T0 + 4200
        lancer(r2._async_lire_carnet())
        lancer(r2._async_suivre())
        if attendu is None:
            s = r2.carnet["en_cours"]["vacuum.robot"]
            assert (s["depuis"], s["travail_s"], s.get("coupure")) == (T0 + 4200, 600, None), "il reprend a l'instant ou il est revu"
            r2._maintenant = lambda: T0 + 4800
            r2._sur_etat(Evenement("vacuum.robot", FauxEtat("docked")))
            assert r2.carnet["passages"][-1]["duree_s"] == 1200, "dix minutes avant la coupure, dix apres"
        else:
            p = r2.carnet["passages"][-1]
            assert (p["duree_s"], p["fin"], p["issue"]) == attendu, "rentre pendant la coupure : clos a son instant"


def test_le_rechargement_attend_l_ecriture_de_l_instance_retiree(creer, module, caplog):
    """TEST AJOUTE (passe bis du 18/10, point 5) : au rechargement de l'integration, l'instance suivante attend l'ecriture finale
    de celle qu'elle remplace avant de relire le fichier — ATTENTE_ECRITURE_S au plus, puis elle relit quand meme, et le dit."""
    async def scenario(r, duree, attente):
        fini = []

        async def ecriture_finale():
            await asyncio.sleep(duree)
            fini.append("ecrite")
        tache = asyncio.ensure_future(ecriture_finale())
        r.hass.data = {module.DOMAIN: {module.CLE_ECRITURE_FINALE: tache}}
        module.ATTENTE_ECRITURE_S, avant = attente, module.ATTENTE_ECRITURE_S
        try:
            await r._async_attendre_ecriture_retiree()
        finally:
            module.ATTENTE_ECRITURE_S = avant
        laissee = module.CLE_ECRITURE_FINALE in r.hass.data[module.DOMAIN]
        tache.cancel()
        return fini, laissee

    assert lancer(scenario(ecovacs(creer), 0, 10.0)) == (["ecrite"], False), "attendue, puis oubliee"
    with caplog.at_level("WARNING"):
        assert lancer(scenario(ecovacs(creer), 5, 0.01)) == ([], False), "trop longue : on relit quand meme"
    assert "n'a pas fini" in caplog.text
    # Rien a attendre : rien ne bloque.
    r = ecovacs(creer)
    r.hass.data = {}
    lancer(r._async_attendre_ecriture_retiree())


def test_l_arret_retire_toutes_les_ecoutes(creer, module):
    """TEST AJOUTE (passe bis du 18/10, point 5) : `async_arreter` retire chaque ecoute — le tic du planning, l'attente du
    demarrage, l'ecoute des etats, celle de l'arret de Home Assistant — et laisse a l'instance suivante l'ecriture de ce que
    l'ecriture differee retenait ; apres lui, rien ne se note ni ne s'ecrit."""
    r = ecovacs(creer)
    retires = []
    r._defait = [lambda: retires.append("planning")]
    r._au_demarrage = lambda: retires.append("demarrage")
    r._ecoute = lambda: retires.append("etats")
    r._defait_arret = lambda: retires.append("arret")
    r._ecriture = lambda: retires.append("ecriture differee")
    r.hass.data = {}
    r.async_arreter()
    assert sorted(retires) == ["arret", "demarrage", "ecriture differee", "etats", "planning"]
    assert (r._defait, r._au_demarrage, r._ecoute, r._defait_arret, r._ecriture, r._arrete) == ([], None, None, None, None, True)
    tache = r.hass.data[module.DOMAIN][module.CLE_ECRITURE_FINALE]
    lancer(tache)
    assert r._depot.ecritures == 1, "ce qui attendait part, pour l'instance suivante"
    r._sur_etat(Evenement("vacuum.robot", FauxEtat("cleaning")))
    assert r.carnet["en_cours"] == {} and r._ecriture is None, "arrete : plus rien ne se note"


def test_le_carnet_ne_commande_rien_et_aucun_toggle():
    carnet = (RACINE / "custom_components" / "loggia" / "robots_carnet.py").read_text(encoding="utf-8")
    assert "async_call" not in carnet and "hass" not in carnet, "le calcul du carnet est pur : il ne commande rien"
    robots = (RACINE / "custom_components" / "loggia" / "robots.py").read_text(encoding="utf-8")
    assert '"toggle"' not in robots and "'toggle'" not in robots, "un robot se commande par un service explicite"
    ws = (RACINE / "custom_components" / "loggia" / "websocket_api.py").read_text(encoding="utf-8")
    assert 'WS_ROB_LANCER = "loggia/robots/lancer"' in ws and "websocket_api.async_register_command(hass, handle_rob_lancer)" in ws
    corps = ws[ws.index("async def handle_rob_lancer"):ws.index("# ── Le distributeur de croquettes")]
    assert "controle=controle_de(connection.user)" in corps and "user=connection.user" in corps, "borne a ce que le compte pilote"
    assert '"unauthorized"' in corps and "_relayer(connection, msg, err)" in corps, "un refus nomme son code"
    assert "await robots.async_etat(connection.user)" in ws, "l'etat se lit sous les droits du compte"


# ── Les pieces sans rien configurer (chantier IoT, tranche robots 2, 19/10 ; ADR 0218) ───────────────────────────────────────────
#
# TESTS AJOUTES : les zones de Home Assistant comme pieces (R2 a R5, R9, R11, R13 ; ses choix Q1 A, Q2 A, Q3 A) — `pieces` dans
# l'etat, sous les droits de lecture ; `lancer` et le planning par zones (`vacuum.clean_area`), les refus dits AVANT l'appel ;
# `lire_zones` avec `zone` ; un passage d'avant par segments inchange, et une liste perimee qui le retient ; ce que le serveur lit
# de Home Assistant (la version, la carte active, le compteur de passages, le registre des zones et ses etages).

ASSOCIATION = {"vacuum": {"area_mapping": {"cuisine": ["m1_2"], "salon": ["m1_1"], "etage": ["m2_9"], "vide": []},
                          "last_seen_segments": [{"id": "m1_1", "name": "Salon", "group": "Maison"}, {"id": "m1_2", "name": "Cuisine", "group": "Maison"},
                                                 {"id": "m2_9", "name": "Chambre", "group": "Étage"}]}}
ZONES_REGISTRE = {"cuisine": {"nom": "Cuisine", "etage": "rdc", "niveau": 0}, "salon": {"nom": "Salon", "etage": "rdc", "niveau": 0},
                  "etage": {"nom": "Étage", "etage": "haut", "niveau": 1}, "vide": {"nom": "Vide", "etage": None, "niveau": None}}
ZONES_HA = [{"id": "zone:cuisine", "nom": "Cuisine", "zone": "cuisine"}, {"id": "zone:salon", "nom": "Salon", "zone": "salon"}]


def associe(creer, etat="docked", *, options=ASSOCIATION, bits=16384, carte="Maison", registre=(), **k):
    """Un Ecovacs associe dans Home Assistant : le bit, l'association dans les options de son entree, sa soeur de carte active
    (`active_map` : son etat est le NOM de la carte, ses options les noms de toutes — ASSERTION MODIFIEE, passe bis du 20/10,
    point 1), le registre des zones double (`_zones_registre`), la reparation fermee."""
    etats = {"vacuum.robot": FauxEtat(etat, {"supported_features": bits, "rooms": {"salon": 1, "cuisine": 2}}),
             "select.robot_carte": FauxEtat(carte, {"options": ["Maison", "Étage"]}), **k.pop("etats", {})}
    r = creer(k.pop("config", {}), etats,
              registre=[Entree("vacuum.robot", "d1", platform="ecovacs", options=options, id="e1"),
                        Entree("select.robot_carte", "d1", platform="ecovacs", translation_key="active_map"), *registre], **k)
    r._zones_registre = lambda: ZONES_REGISTRE
    r._reparation = lambda robot: False
    return r


def test_lire_zones_accepte_une_zone_de_home_assistant_ou_des_segments_jamais_les_deux(module):
    assert module.lire_zones(ZONES_HA) == [{"id": "zone:cuisine", "nom": "Cuisine", "segments": [], "zone": "cuisine"},
                                           {"id": "zone:salon", "nom": "Salon", "segments": [], "zone": "salon"}]
    assert module.lire_zones(ZONES) == ZONES, "la forme d'avant, inchangee"
    for mauvaise in ([{"id": "z", "nom": "Z", "zone": "cuisine", "segments": [1]}],   # les deux formes dans une zone
                     [ZONES_HA[0], ZONES[0]],                                           # les deux formes dans un passage (R5)
                     [{"id": "z", "nom": "Z", "zone": ""}], [{"id": "z", "nom": "Z", "zone": "cui sine"}], [{"id": "z", "nom": "Z", "zone": "x" * 81}],
                     [{"id": "z", "nom": "Z", "zone": 3}]):
        with pytest.raises(ValueError):
            module.lire_zones(mauvaise)
    assert module.normaliser_planning(planning(zones=ZONES_HA))["zones"][0] == {"id": "zone:cuisine", "nom": "Cuisine", "segments": [], "zone": "cuisine"}


def test_l_etat_rend_les_pieces_de_chaque_aspirateur_sous_les_droits_de_lecture(creer):
    r = associe(creer, etats={"lawn_mower.t": FauxEtat("docked"), "number.robot_compteur": FauxEtat("2", {"min": 1, "max": 4})},
                registre=[Entree("lawn_mower.t", "d2"), Entree("number.robot_compteur", "d1", platform="ecovacs", translation_key="clean_count")])
    etat = lancer(r.async_etat(Compte("u1", admin=True)))
    p = etat["pieces"]["vacuum.robot"]
    # ASSERTION MODIFIEE (passe bis du 20/10, point 11) : `commande` et `passages` ne sont plus dans l'etat.
    assert (p["source"], p["capable"], p["association"], p["carte_changee"], p["script_pieces"]) == ("zones", True, True, False, False)
    assert [z["id"] for z in p["zones"]] == ["zone:cuisine", "zone:salon"], "par etage puis par nom ; « vide » n'a pas de segment"
    assert p["autres_cartes"] == [{"carte": "Étage", "n": 1}] and p["autres_zones"] == ["etage"], "la chambre est sur l'autre carte"
    assert "lawn_mower.t" not in etat["pieces"], "une tondeuse n'a pas de pieces de Home Assistant"
    # La reparation ouverte : `carte_changee`, les puces restent.
    r._reparation = lambda robot: True
    assert lancer(r.async_etat(Compte("u1", admin=True)))["pieces"]["vacuum.robot"]["carte_changee"] is True
    # Un compte qui ne lit pas ce robot ne voit pas ses pieces (la garde de l'etat, `_lecture_autorisee`).
    assert lancer(r.async_etat(Compte("u2", lit={"lawn_mower.t"})))["pieces"] == {}
    # Ses scripts gardent la main (Q1 A) : la source le dit, les zones restent lisibles pour la ligne de la popup. Le script des
    # pieces doit etre designe pour l'aspirateur principal ET exister ; un script absent de la maison ne garde rien.
    r = associe(creer, etats={"script.robot_pieces": FauxEtat("off")}, entites={"vacuumScripts": {"pieces_selectionnees": "script.robot_pieces"}})
    p = lancer(r.async_etat(Compte("u1", admin=True)))["pieces"]["vacuum.robot"]
    assert (p["source"], len(p["zones"])) == ("scripts", 2)
    r = associe(creer, entites={"vacuumScripts": {"pieces_selectionnees": "script.disparu"}})
    assert lancer(r.async_etat(Compte("u1", admin=True)))["pieces"]["vacuum.robot"]["source"] == "zones"
    # Sans association : le bit, et les pieces publiees par `spot_area` ; sans bit ni association, l'exception (Q2 A).
    p = lancer(associe(creer, options={}).async_etat(None))["pieces"]["vacuum.robot"]
    assert (p["source"], p["association"], [s["id"] for s in p["segments"]]) == ("segments", False, ["seg:1", "seg:2"])
    p = lancer(associe(creer, options={}, bits=0).async_etat(None))["pieces"]["vacuum.robot"]
    assert (p["source"], p["capable"]) == ("segments", False)


def test_lancer_par_zones_appelle_clean_area_et_note_le_carnet(creer):
    r = associe(creer)
    etat = lancer(r.async_lancer_depart("vacuum.robot", ZONES_HA, user=Compte("u1")))
    assert r.hass.services.appels == [("vacuum", "clean_area", {"entity_id": ["vacuum.robot"], "cleaning_area_id": ["cuisine", "salon"]})]
    assert (r.hass.services.contextes, r.hass.services.bloquants) == (["u1"], [True]), "au nom de la personne, attendu"
    d = r.carnet["demandes"]["vacuum.robot"]
    assert (d["zones"], d["tout"], d["source"]) == ([{"id": "zone:cuisine", "nom": "Cuisine"}, {"id": "zone:salon", "nom": "Salon"}], False, "loggia")
    assert journal(r)[0][0] == "nettoyer : Cuisine, Salon" and "pieces" in etat
    # Le planning garde la zone (R5), et un enregistrement par zones passe.
    cfg = lancer(r.async_enregistrer({"plannings": [planning(zones=ZONES_HA)]}))
    assert cfg["plannings"][0]["zones"][1]["zone"] == "salon"


@pytest.mark.parametrize("cas,refus", [
    ("association absente", "association_absente"), ("zone sans piece", "zone_sans_piece"), ("zone disparue du registre", "zone_sans_piece"),
    ("autre carte", "autre_carte"), ("sans le bit", "pieces_inconnues"), ("liste perimee", "pieces_perimees"), ("rooms vide", "pieces_perimees"),
])
def test_lancer_par_zones_refuse_avant_l_appel_et_ne_commande_rien(creer, cas, refus):
    zones = ZONES_HA
    if cas == "association absente":
        r = associe(creer, options={})
    elif cas == "zone sans piece":
        r, zones = associe(creer), [ZONES_HA[0], {"id": "zone:vide", "nom": "Vide", "zone": "vide"}]
    elif cas == "zone disparue du registre":
        r, zones = associe(creer), [{"id": "zone:grenier", "nom": "Grenier", "zone": "grenier"}]
    elif cas == "autre carte":
        r, zones = associe(creer), [ZONES_HA[0], {"id": "zone:etage", "nom": "Étage", "zone": "etage"}]
    elif cas == "sans le bit":
        r = associe(creer, bits=0)
    elif cas == "liste perimee":
        # Q2 : chez Ecovacs, la liste que le robot publie fait foi — un segment qu'il ne publie plus ne part pas.
        r, zones = associe(creer), [ZONES[0], {"id": "seg:7", "nom": "Cave", "segments": [7]}]
    else:
        r, zones = associe(creer, etats={"vacuum.robot": FauxEtat("docked", {"supported_features": 16384, "rooms": {}})}), ZONES
    with pytest.raises(ValueError) as e:
        lancer(r.async_lancer_depart("vacuum.robot", zones, user=Compte("u1")))
    assert getattr(e.value, "code", None) == refus, cas
    assert r.hass.services.appels == [] and r.carnet["demandes"] == {}, cas + " : rien n'est parti, aucune demande ne reste"


def test_le_planning_part_par_zones_et_retient_ce_que_home_assistant_refuserait(creer):
    r = associe(creer, config={"plannings": [planning(zones=ZONES_HA)]})
    assert lancer(r.async_minute(LUNDI_0930)) == ["p1"]
    assert r.hass.services.appels == [("vacuum", "clean_area", {"entity_id": ["vacuum.robot"], "cleaning_area_id": ["cuisine", "salon"]})]
    assert journal(r)[0][0] == "nettoyer : Cuisine, Salon"
    assert r.carnet["demandes"]["vacuum.robot"]["zones"][0] == {"id": "zone:cuisine", "nom": "Cuisine"}
    for zones, detail in (([ZONES_HA[0], {"id": "zone:vide", "nom": "Vide", "zone": "vide"}], "zone sans pièce associée"),
                          ([{"id": "zone:etage", "nom": "Étage", "zone": "etage"}], "autre carte")):
        r = associe(creer, config={"plannings": [planning(zones=zones)]})
        assert lancer(r.async_minute(LUNDI_0930)) == [] and r.hass.services.appels == []
        assert journal(r)[0] == ("retenu", detail, 0), detail
    r = associe(creer, options={}, config={"plannings": [planning(zones=ZONES_HA)]})
    assert lancer(r.async_minute(LUNDI_0930)) == [] and journal(r)[0] == ("retenu", "association absente", 0)
    assert r.carnet["demandes"] == {}, "un passage retenu ne laisse pas de demande"


def test_un_passage_d_avant_par_segments_part_comme_avant_et_une_liste_perimee_le_retient(creer):
    r = associe(creer, config={"plannings": [planning(zones=ZONES)]})
    assert lancer(r.async_minute(LUNDI_0930)) == ["p1"]
    assert r.hass.services.appels == [("vacuum", "send_command", {"entity_id": ["vacuum.robot"], "command": "spot_area", "params": {"rooms": [1, 2], "cleanings": 1}})]
    # Le robot ne publie plus l'une de ses pieces : le passage est retenu, le journal le dit (Q2 : jamais une liste perimee sans le dire).
    r = associe(creer, config={"plannings": [planning(zones=[ZONES[0], {"id": "seg:7", "nom": "Cave", "segments": [7]}])]})
    assert lancer(r.async_minute(LUNDI_0930)) == [] and r.hass.services.appels == []
    assert journal(r)[0] == ("retenu", "liste des pièces du robot périmée", 0)
    # Sans le bit : l'exception (Q2 A), avec le compteur de passages de l'appareil ; sans `rooms`, retenu.
    r = associe(creer, bits=0, config={"plannings": [planning(zones=ZONES)]},
                etats={"number.robot_compteur": FauxEtat("2", {})}, registre=[Entree("number.robot_compteur", "d1", translation_key="clean_count")])
    assert lancer(r.async_minute(LUNDI_0930)) == ["p1"]
    assert r.hass.services.appels == [("vacuum", "send_command", {"entity_id": ["vacuum.robot"], "command": "clean_V2",
                                                                  "params": {"act": "start", "content": {"type": "freeClean", "value": "2,1,2"}}})]


def test_le_serveur_lit_la_version_la_carte_active_le_compteur_et_les_zones(creer, module):
    r = associe(creer, carte="Étage", etats={"number.robot_compteur": FauxEtat("3", {}), "number.robot_autre": FauxEtat("9", {})},
                registre=[Entree("number.robot_compteur", "d1", translation_key="clean_count"), Entree("number.robot_autre", "d1")])
    # ASSERTION MODIFIEE (passe bis du 20/10, point 1) : la carte active se lit avec ses options — le nom de chaque carte.
    assert r._carte_active("vacuum.robot") == "Étage" and r._cartes("vacuum.robot") == ("Étage", ["Maison", "Étage"]) and r._passages("vacuum.robot") == 3
    r.hass.states.table["select.robot_carte"] = FauxEtat("unavailable")
    r.hass.states.table["number.robot_compteur"] = FauxEtat("x")
    assert r._carte_active("vacuum.robot") is None and r._cartes("vacuum.robot") == (None, None) and r._passages("vacuum.robot") == 1, "une soeur muette ne dit rien"
    assert r._options_vacuum("vacuum.robot") == ASSOCIATION["vacuum"] and r._options_vacuum("lawn_mower.t") == {}
    # La version : celle de Home Assistant (`homeassistant.const.__version__`) ; dans ce test, le stub n'en a pas — inconnue.
    assert r._version_ha() is None and charger("robots_pieces").version_recente(r._version_ha()) is True
    # Le registre des zones, avec ses etages et leurs niveaux — et illisible, rien, dit une fois.
    import sys
    ar, fr = sys.modules["homeassistant.helpers.area_registry"], sys.modules["homeassistant.helpers.floor_registry"]
    ar_avant, fr_avant = ar.async_get, fr.async_get
    try:
        class Zone:
            def __init__(self, name, floor_id):
                self.name, self.floor_id = name, floor_id

        class Etage:
            def __init__(self, level):
                self.level = level
        ar.async_get = lambda hass: type("R", (), {"areas": {"cuisine": Zone("Cuisine", "rdc"), "cave": Zone("Cave", None)}})()
        fr.async_get = lambda hass: type("F", (), {"floors": {"rdc": Etage(0)}})()
        r = creer({}, {"vacuum.robot": FauxEtat("docked")})
        assert r._zones_registre() == {"cuisine": {"nom": "Cuisine", "etage": "rdc", "niveau": 0}, "cave": {"nom": "Cave", "etage": None, "niveau": None}}
        ar.async_get = lambda hass: (_ for _ in ()).throw(RuntimeError("registre"))
        r = creer({}, {"vacuum.robot": FauxEtat("docked")})
        assert r._zones_registre() == {} and r._zones_registre() == {}
    finally:
        ar.async_get, fr.async_get = ar_avant, fr_avant
    # La reparation : lue dans le registre des reparations de Home Assistant par l'identifiant d'entree ; illisible, fermee.
    r = associe(creer)
    del r._reparation
    assert r._reparation("vacuum.robot") is False


# ── Passe bis de la tranche robots 2 (20/10) : sa decision « Mon script garde la main », et les relectures ───────────────────────
#
# TESTS AJOUTES : des qu'un script de DEPART est designe pour l'aspirateur de la maison, Loggia ne prend jamais la main sur les
# pieces — le planning par pieces est RETENU (« Vos scripts gardent la main pour les pieces. »), « tout le logement » part par son
# `nettoyer_tout`, un depart par zones ou par segments se refuse par son code ; la source `scripts` n'est qu'a l'aspirateur principal
# (relecture qualite, M10) ; le niveau d'etage se lit dans le vrai registre (un `UserDict`, D1) ; `rooms` vide est une liste perimee
# (D6) ; la garde du double depart ne chevauche plus un `await` (D8) ; une reparation ignoree dans Home Assistant est fermee ; le
# registre des entites se trie une fois par etat, et un robot etrange ne fait pas tomber l'etat ; `localiser` est un role de geste.

ENTITES_SON_CAS = {"vacuumScripts": {"nettoyer_tout": "script.robot_partout", "pause": "script.robot_pause", "reprendre": "script.robot_reprise",
                                     "retour_base": "script.robot_base", "localiser": "script.robot_ou"}}
ETATS_SON_CAS = {"script.robot_partout": FauxEtat("off", {"friendly_name": "Robot - Nettoyer partout"}), "script.robot_pause": FauxEtat("off"),
                 "script.robot_reprise": FauxEtat("off"), "script.robot_base": FauxEtat("off"), "script.robot_ou": FauxEtat("off"),
                 "script.robot_pieces": FauxEtat("off", {"friendly_name": "Robot - Nettoyer les pièces choisies"})}
ENTITES_AVEC_PIECES = {"vacuumScripts": {**ENTITES_SON_CAS["vacuumScripts"], "pieces_selectionnees": "script.robot_pieces"}}


def test_un_script_de_depart_designe_le_planning_par_pieces_est_retenu_et_tout_le_logement_part_par_son_script(creer):
    # Son cas : ses scripts sans `pieces_selectionnees`, son Ecovacs sans le bit qui publie `rooms`. Un passage par pieces (la forme
    # d'avant, par segments) : RETENU — plus jamais l'exception `clean_V2` derriere ses scripts (relecture qualite, D5).
    r = associe(creer, bits=0, options={}, config={"plannings": [planning(zones=ZONES)]}, etats=ETATS_SON_CAS, entites=ENTITES_SON_CAS)
    p = lancer(r.async_etat(None))["pieces"]["vacuum.robot"]
    assert (p["source"], p["script_pieces"]) == ("scripts", False)
    assert lancer(r.async_minute(LUNDI_0930)) == [] and r.hass.services.appels == []
    assert journal(r)[0] == ("retenu", "Vos scripts gardent la main pour les pièces.", 0)
    assert r.carnet["demandes"] == {}
    # Avec `pieces_selectionnees` designe aussi : le planning par pieces est retenu de meme (le serveur ne joue pas ses interrupteurs).
    r = associe(creer, bits=0, options={}, config={"plannings": [planning(zones=ZONES)]}, etats=ETATS_SON_CAS, entites=ENTITES_AVEC_PIECES)
    assert lancer(r.async_etat(None))["pieces"]["vacuum.robot"]["script_pieces"] is True
    assert lancer(r.async_minute(LUNDI_0930)) == [] and journal(r)[0] == ("retenu", "Vos scripts gardent la main pour les pièces.", 0)
    # Un passage par ZONES de Home Assistant derriere ses scripts (le bit et l'association venus d'une mise a jour) : retenu aussi.
    r = associe(creer, config={"plannings": [planning(zones=ZONES_HA)]}, etats=ETATS_SON_CAS, entites=ENTITES_SON_CAS)
    assert lancer(r.async_minute(LUNDI_0930)) == [] and r.hass.services.appels == []
    assert journal(r)[0] == ("retenu", "Vos scripts gardent la main pour les pièces.", 0)
    # « Tout le logement » au planning : par son script `nettoyer_tout`, que le serveur sait lancer ; le carnet note son nom.
    r = associe(creer, bits=0, options={}, config={"plannings": [planning()]}, etats=ETATS_SON_CAS, entites=ENTITES_SON_CAS)
    assert lancer(r.async_minute(LUNDI_0930)) == ["p1"]
    assert r.hass.services.appels == [("script", "turn_on", {"entity_id": ["script.robot_partout"]})]
    d = r.carnet["demandes"]["vacuum.robot"]
    assert (d["tout"], d["source"], d["libelle"]) == (True, "planning", "Robot - Nettoyer partout"), "le nom du script (le robot de ce test n'a pas de nom)"
    # Sans `nettoyer_tout` (le script des pieces seul) : la commande de base, comme avant.
    r = associe(creer, bits=0, options={}, config={"plannings": [planning()]}, etats=ETATS_SON_CAS,
                entites={"vacuumScripts": {"pieces_selectionnees": "script.robot_pieces"}})
    assert lancer(r.async_minute(LUNDI_0930)) == ["p1"] and r.hass.services.appels == [("vacuum", "start", {"entity_id": ["vacuum.robot"]})]
    # Un `nettoyer_tout` designe mais absent de la maison ne garde rien : la commande de base, et la source n'est pas `scripts`.
    r = associe(creer, bits=0, options={}, config={"plannings": [planning()]}, entites=ENTITES_SON_CAS)
    assert lancer(r.async_etat(None))["pieces"]["vacuum.robot"]["source"] == "segments"
    assert lancer(r.async_minute(LUNDI_0930)) == ["p1"] and r.hass.services.appels == [("vacuum", "start", {"entity_id": ["vacuum.robot"]})]


def test_lancer_par_zones_ou_par_segments_derriere_un_script_de_depart_se_refuse_par_son_code(creer):
    for zones in (ZONES_HA, ZONES):
        r = associe(creer, etats=ETATS_SON_CAS, entites=ENTITES_SON_CAS)
        with pytest.raises(ValueError) as e:
            lancer(r.async_lancer_depart("vacuum.robot", zones, user=Compte("u1")))
        assert getattr(e.value, "code", None) == "scripts_gardent_la_main"
        assert r.hass.services.appels == [] and r.carnet["demandes"] == {}, "rien n'est parti, aucune demande ne reste"
    # Tout le logement sans script : la commande de base (l'ecran choisit lui-meme `nettoyer_tout` quand il est designe).
    r = associe(creer, etats=ETATS_SON_CAS, entites=ENTITES_SON_CAS)
    lancer(r.async_lancer_depart("vacuum.robot", [], user=Compte("u1")))
    assert r.hass.services.appels == [("vacuum", "start", {"entity_id": ["vacuum.robot"]})]
    # Son script des pieces, par le serveur, part comme a l'etape 1 (le chemin qui existe).
    r = associe(creer, etats=ETATS_SON_CAS, entites=ENTITES_AVEC_PIECES)
    lancer(r.async_lancer_depart("vacuum.robot", [{"id": "salon", "nom": "Salon", "segments": []}], script="script.robot_pieces",
                                 role="pieces_selectionnees", user=Compte("u1")))
    assert r.hass.services.appels == [("script", "turn_on", {"entity_id": ["script.robot_pieces"]})]


def test_la_source_scripts_n_est_qu_a_l_aspirateur_principal(creer):
    """Relecture qualite, M10 : « n'importe quel aspirateur garde la main » survivait."""
    deux = {**ETATS_SON_CAS, "vacuum.autre": FauxEtat("docked", {"supported_features": 0, "rooms": {"salon": 1}})}
    r = associe(creer, bits=0, options={}, etats=deux, registre=[Entree("vacuum.autre", "d3", platform="ecovacs")],
                entites={**ENTITES_AVEC_PIECES, "vacuum": {"main": "vacuum.robot"}})
    p = lancer(r.async_etat(None))["pieces"]
    assert (p["vacuum.robot"]["source"], p["vacuum.autre"]["source"]) == ("scripts", "segments"), "les scripts sont ceux du principal"
    # Deux aspirateurs et aucun nomme : les scripts ne sont a personne.
    r = associe(creer, bits=0, options={}, etats=deux, registre=[Entree("vacuum.autre", "d3", platform="ecovacs")], entites=ENTITES_AVEC_PIECES)
    p = lancer(r.async_etat(None))["pieces"]
    assert (p["vacuum.robot"]["source"], p["vacuum.autre"]["source"]) == ("segments", "segments")


def test_le_niveau_d_etage_se_lit_dans_le_vrai_registre_un_userdict(creer):
    """Relecture qualite, D1 : `FloorRegistry.floors` est un `FloorRegistryItems` (UserDict), pas un dict — le niveau ne se lisait
    jamais, et l'ordre des puces suivait l'identifiant d'etage."""
    import collections
    import sys
    ar, fr = sys.modules["homeassistant.helpers.area_registry"], sys.modules["homeassistant.helpers.floor_registry"]
    ar_avant, fr_avant = ar.async_get, fr.async_get

    class Zone:
        def __init__(self, name, floor_id):
            self.name, self.floor_id = name, floor_id

    class Etage:
        def __init__(self, level):
            self.level = level
    try:
        ar.async_get = lambda hass: type("R", (), {"areas": collections.UserDict({"cuisine": Zone("Cuisine", "rdc"), "chambre": Zone("Chambre", "etage")})})()
        fr.async_get = lambda hass: type("F", (), {"floors": collections.UserDict({"rdc": Etage(0), "etage": Etage(1)})})()
        r = creer({}, {"vacuum.robot": FauxEtat("docked")})
        lu = r._zones_registre()
        assert (lu["cuisine"]["niveau"], lu["chambre"]["niveau"]) == (0, 1)
        P = charger("robots_pieces")
        p = P.pieces_du_robot(16384, {}, {"area_mapping": {"cuisine": ["m1_1"], "chambre": ["m1_2"]}}, lu, plateforme="ecovacs", version_ha=(2026, 10))
        assert [z["zone"] for z in p["zones"]] == ["cuisine", "chambre"], "le rez-de-chaussee (niveau 0) devant l'etage (niveau 1)"
    finally:
        ar.async_get, fr.async_get = ar_avant, fr_avant


def test_rooms_vide_a_l_heure_dite_c_est_une_liste_perimee_pas_des_pieces_inconnues(creer):
    """Relecture qualite, D6 : son cas intermittent — `rooms` vide sans le bit. La cause est « liste perimee », pas « pieces
    inconnues » ; `_segments_perimes` se verifie d'abord, au planning comme a l'ecran."""
    vide = {"vacuum.robot": FauxEtat("docked", {"supported_features": 0, "rooms": {}})}
    r = associe(creer, bits=0, options={}, config={"plannings": [planning(zones=ZONES)]}, etats=vide)
    assert lancer(r.async_minute(LUNDI_0930)) == [] and r.hass.services.appels == []
    assert journal(r)[0] == ("retenu", "liste des pièces du robot périmée", 0)
    r = associe(creer, bits=0, options={}, etats=vide)
    with pytest.raises(ValueError) as e:
        lancer(r.async_lancer_depart("vacuum.robot", ZONES, user=Compte("u1")))
    assert getattr(e.value, "code", None) == "pieces_perimees"
    # Une autre integration qui ne publie pas sa liste : la regle d'aujourd'hui, « pieces inconnues » quand elle ne sait pas viser.
    r = creer({"plannings": [planning(zones=ZONES)]}, {"vacuum.robot": FauxEtat("docked")}, registre=[Entree("vacuum.robot", "d1", platform="inconnue")])
    assert lancer(r.async_minute(LUNDI_0930)) == [] and journal(r)[0] == ("retenu", "pièces inconnues de cette intégration", 0)


def test_deux_departs_par_zones_dont_la_lecture_suspend_n_en_font_qu_un(creer):
    """Relecture qualite, D8 : la garde (`_depart_recent`, `_vol`) se lisait AVANT `await self._async_pieces` et se posait APRES —
    la moindre suspension laissait passer le second appui. Les pieces se lisent avant la garde, comme `_async_lancer_script`."""
    r = associe(creer)
    avant = r._async_entites

    async def lente():
        await asyncio.sleep(0)
        return await avant()
    r._async_entites = lente

    async def deux():
        return await asyncio.gather(r.async_lancer_depart("vacuum.robot", ZONES_HA, user=Compte("u1")),
                                    r.async_lancer_depart("vacuum.robot", ZONES_HA, user=Compte("u2")), return_exceptions=True)
    res = lancer(deux())
    assert len(r.hass.services.appels) == 1, res
    assert sum(1 for x in res if getattr(x, "code", None) == "deja_en_route") == 1


def test_une_reparation_ignoree_dans_home_assistant_est_fermee(creer):
    import sys
    import types
    ir = sys.modules.get("homeassistant.helpers.issue_registry")
    if ir is None:
        ir = types.ModuleType("homeassistant.helpers.issue_registry")
        sys.modules["homeassistant.helpers.issue_registry"] = ir
    avant = getattr(ir, "async_get", None)
    try:
        for version, ouverte in ((None, True), ("2026.10.1", False)):
            entree = type("Issue", (), {"dismissed_version": version})()
            ir.async_get = lambda hass, e=entree: type("IR", (), {"async_get_issue": lambda self, domaine, ident: e if (domaine, ident) == ("vacuum", "segments_changed_e1") else None})()
            r = associe(creer)
            del r._reparation
            assert r._reparation("vacuum.robot") is ouverte, version
            assert lancer(r.async_etat(None))["pieces"]["vacuum.robot"]["carte_changee"] is ouverte
    finally:
        if avant is not None:
            ir.async_get = avant


def test_le_registre_se_trie_une_fois_par_etat_et_un_robot_etrange_ne_fait_pas_tomber_l_etat(creer):
    class RegistreCompte(FauxRegistre):
        """Compte les PARCOURS du registre (`entities`, ce que l'on trie) ; `async_get`, une lecture par identifiant, ne compte pas."""
        lectures = 0

        @property
        def entities(self):
            type(self).lectures += 1
            return self._entities

        @entities.setter
        def entities(self, v):
            self._entities = v

        def async_get(self, haid):
            return self._entities.get(haid)
    r = associe(creer, etats={"vacuum.deux": FauxEtat("docked", {"supported_features": 16384}), "vacuum.bizarre": FauxEtat("docked", {"supported_features": "x"})},
                registre=[Entree("vacuum.deux", "d2", platform="roborock"), Entree("select.deux_carte", "d2", translation_key="selected_map"),
                          Entree("vacuum.bizarre", "d9", platform="ecovacs")])
    faux = RegistreCompte(list(r._registre().entities.values()))
    r._registre = lambda: faux
    etat = lancer(r.async_etat(None))
    assert RegistreCompte.lectures == 1, "le registre se trie UNE fois par etat, pas deux fois par robot"
    assert sorted(etat["pieces"]) == ["vacuum.deux", "vacuum.robot"], "un `supported_features` illisible n'emporte pas les autres"


def test_le_script_localiser_est_un_geste_de_l_aspirateur_principal(creer):
    r = associe(creer, etats=ETATS_SON_CAS, entites=ENTITES_SON_CAS)
    lancer(r.async_lancer_depart("vacuum.robot", [], script="script.robot_ou", role="localiser", user=Compte("u1")))
    assert r.hass.services.appels == [("script", "turn_on", {"entity_id": ["script.robot_ou"]})]
    assert r.carnet["demandes"] == {}, "un geste, pas un depart : rien au carnet"
    # Le schema de `loggia/robots/lancer` l'accepte.
    ws = (RACINE / "custom_components" / "loggia" / "websocket_api.py").read_text(encoding="utf-8")
    assert '"retour_base", "localiser"]' in ws


# ── Passe bis 2 de la tranche robots 2 (20/10) : la relecture de controle ─────────────────────────────────────────────────────────
#
# TESTS AJOUTES : la roue de la popup n'ecrit plus la description de la maison depuis l'ecran — un onglet qui ne l'avait pas encore
# lue (l'application mobile, un navigateur neuf) envoyait `{loggia_entities: {vacuumScripts: {un role}}}` et effacait ses dix-neuf
# cles (alarme, cameras, climat, volets, energie...). Le role part SEUL (`loggia/robots/scripts`, administrateurs), et le serveur le
# fond dans la description TELLE QU'ELLE EST SUR LE DISQUE, sous le verrou du magasin : rien d'autre ne bouge. L'etat porte les roles
# designes (`pieces[robot].scripts`) : la roue lit la verite du serveur. Et : une main posee sur le robot retient aussi le planning
# par `nettoyer_tout` (sonde S3) ; un script indisponible ne part pas et ne se note pas (S2c) ; une lecture des pieces qui leve
# n'empeche ni « tout le logement » ni les autres plannings de la minute (S4).

MAISON_ENTIERE = {"vacuum": {"main": "vacuum.robot"}, "alarm": "alarm_control_panel.z", "cameras": ["camera.y"], "climate": ["climate.x"],
                  "covers": ["cover.a"], "energy": {"consoNow": "sensor.e"}, "people": [{"haid": "person.p"}], "weather": "weather.w",
                  "lights": ["light.l"], "medias": ["media_player.m"], "switchLights": ["switch.s"], "feeder": {"main": "button.f"},
                  "mower": "lawn_mower.t", "plants": ["sensor.pl"], "vacuumRooms": [{"id": "salon", "name": "Salon", "toggle": "input_boolean.s"}],
                  "sirene": "siren.s", "locks": ["lock.l"], "water": "switch.w", "calendars": ["calendar.c"],
                  **ENTITES_SON_CAS}


def test_la_roue_designe_un_role_seul_et_le_serveur_le_fond_dans_la_description_telle_quelle_est(creer):
    assert len(MAISON_ENTIERE) == 20, "la description de sa maison : dix-neuf cles, et ses scripts"
    r = associe(creer, bits=0, options={}, etats=ETATS_SON_CAS, entites=MAISON_ENTIERE)
    etat = lancer(r.async_designer_script("pieces_selectionnees", "script.robot_pieces", user=Compte("u1", admin=True)))
    apres = lancer(r.store.async_get_shared("loggia_entities"))
    assert sorted(apres) == sorted(MAISON_ENTIERE), "aucune cle de la maison n'a bouge"
    assert {k: v for k, v in apres.items() if k != "vacuumScripts"} == {k: v for k, v in MAISON_ENTIERE.items() if k != "vacuumScripts"}
    assert apres["vacuumScripts"] == {**ENTITES_SON_CAS["vacuumScripts"], "pieces_selectionnees": "script.robot_pieces"}, "le role, en plus des siens"
    # La commande rend l'etat des robots, et l'etat porte les roles designes : la roue lit la verite du serveur.
    assert "en_cours" in etat and etat["pieces"]["vacuum.robot"]["scripts"] == apres["vacuumScripts"]
    assert etat["pieces"]["vacuum.robot"]["script_pieces"] is True
    # « Aucun » retire le role, et lui seul.
    lancer(r.async_designer_script("localiser", None, user=Compte("u1", admin=True)))
    apres = lancer(r.store.async_get_shared("loggia_entities"))
    assert sorted(apres) == sorted(MAISON_ENTIERE) and "localiser" not in apres["vacuumScripts"] and apres["vacuumScripts"]["pause"] == "script.robot_pause"
    assert r.hass.services.appels == [], "designer ne commande rien"


def test_la_sonde_de_la_relecture_un_onglet_qui_n_a_rien_lu_ne_peut_rien_effacer(creer, module):
    """Les cas 2 et 3 de `sonde_cfgset.mjs` : un onglet dont le cache est vide (cas 2) ou garde une vieille copie de la description
    (cas 3) n'envoie que `{role, script}` — le serveur ne lit que cela, et fond le role dans ce qu'il tient. Ce que l'onglet croit
    savoir de la description n'entre jamais dans la fusion : `fusion_vacuum_scripts` ne prend que la valeur EN PLACE."""
    en_place = dict(MAISON_ENTIERE)
    fondu = module.fusion_vacuum_scripts(en_place, "pieces_selectionnees", "script.robot_pieces")
    assert {k: v for k, v in fondu.items() if k != "vacuumScripts"} == {k: v for k, v in MAISON_ENTIERE.items() if k != "vacuumScripts"}
    assert fondu["vacuumScripts"]["pieces_selectionnees"] == "script.robot_pieces" and fondu["vacuumScripts"]["pause"] == "script.robot_pause"
    assert en_place == MAISON_ENTIERE, "la valeur en place n'est pas modifiee sur place"
    # Sans description encore : elle nait du seul role. Sans `vacuumScripts` : il nait.
    assert module.fusion_vacuum_scripts(None, "localiser", "script.robot_ou") == {"vacuumScripts": {"localiser": "script.robot_ou"}}
    assert module.fusion_vacuum_scripts({"alarm": "alarm_control_panel.z"}, "pause", "script.robot_pause") == {"alarm": "alarm_control_panel.z", "vacuumScripts": {"pause": "script.robot_pause"}}
    # Un role vide est retire ; le dernier retire emporte `vacuumScripts` ; un `vacuumScripts` illisible repart du role seul.
    assert module.fusion_vacuum_scripts({"alarm": "a", "vacuumScripts": {"pause": "script.p"}}, "pause", None) == {"alarm": "a"}
    assert module.fusion_vacuum_scripts({"alarm": "a"}, "pause", None) == {"alarm": "a"}
    assert module.fusion_vacuum_scripts({"vacuumScripts": "x"}, "pause", "script.p") == {"vacuumScripts": {"pause": "script.p"}}
    # Une description illisible (pas un objet) : refus — rien ne s'ecrit a sa place.
    for illisible in ([], "texte", 3):
        with pytest.raises(ValueError):
            module.fusion_vacuum_scripts(illisible, "pause", "script.p")
    # Un role ou un script invalides : refus, avant d'ouvrir le magasin.
    for role, script in (("danser", "script.p"), ("pause", "light.p"), ("pause", ""), ("pause", 3), (None, "script.p")):
        with pytest.raises(ValueError):
            module.fusion_vacuum_scripts(dict(MAISON_ENTIERE), role, script)


def test_designer_refuse_sans_rien_ecrire_et_la_commande_est_aux_administrateurs(creer):
    r = associe(creer, bits=0, options={}, etats=ETATS_SON_CAS, entites=MAISON_ENTIERE)
    for role, script in (("danser", "script.p"), ("pause", "light.p")):
        with pytest.raises(ValueError):
            lancer(r.async_designer_script(role, script, user=Compte("u1", admin=True)))
    assert lancer(r.store.async_get_shared("loggia_entities")) == MAISON_ENTIERE
    # Une description illisible sur le disque : refus, elle reste telle quelle.
    r = associe(creer, bits=0, options={}, etats=ETATS_SON_CAS, entites=["pas", "un", "objet"])
    with pytest.raises(ValueError):
        lancer(r.async_designer_script("pause", "script.robot_pause", user=Compte("u1", admin=True)))
    assert lancer(r.store.async_get_shared("loggia_entities")) == ["pas", "un", "objet"]
    # Le composant : la commande existe, reservee aux administrateurs, enregistree, et relaie le refus par son code.
    ws = (RACINE / "custom_components" / "loggia" / "websocket_api.py").read_text(encoding="utf-8")
    assert 'WS_ROB_SCRIPTS = "loggia/robots/scripts"' in ws and "websocket_api.async_register_command(hass, handle_rob_scripts)" in ws
    corps = ws[ws.index('vol.Required("type"): WS_ROB_SCRIPTS'):ws.index("# ── Le distributeur de croquettes")]
    assert "@websocket_api.require_admin" in corps and "_relayer(connection, msg, err)" in corps
    assert "robots.async_designer_script(msg[\"role\"], msg[\"script\"]" in corps


def test_l_etat_porte_les_roles_designes_de_l_aspirateur_principal_seul(creer):
    deux = {**ETATS_SON_CAS, "vacuum.autre": FauxEtat("docked", {"supported_features": 0})}
    r = associe(creer, bits=0, options={}, etats=deux, registre=[Entree("vacuum.autre", "d3", platform="ecovacs")],
                entites={**ENTITES_SON_CAS, "vacuum": {"main": "vacuum.robot"}})
    p = lancer(r.async_etat(None))["pieces"]
    assert p["vacuum.robot"]["scripts"] == ENTITES_SON_CAS["vacuumScripts"] and p["vacuum.autre"]["scripts"] == {}
    # Sans description : aucun role.
    r = associe(creer, bits=0, options={})
    assert lancer(r.async_etat(None))["pieces"]["vacuum.robot"]["scripts"] == {}


def test_une_main_posee_sur_le_robot_retient_aussi_le_planning_par_son_script(creer):
    """Sonde S3 de la relecture de controle : `regles.agir('script', 'turn_on', [script])` regardait le gel du SCRIPT — une main posee
    sur le ROBOT (renvoye a la base par quelqu'un) ne retenait plus le passage par `nettoyer_tout`, alors qu'elle retient `vacuum.start`
    (`test_une_main_posee_sur_le_robot_prime`)."""
    r = associe(creer, bits=0, options={}, config={"plannings": [planning()]}, etats=ETATS_SON_CAS, entites=ENTITES_SON_CAS)
    lancer(r.regles.geler("robots", "main", ["vacuum.robot"], motif="renvoye a la base"))
    assert lancer(r.async_minute(LUNDI_0930)) == []
    assert r.hass.services.appels == [] and r.carnet["demandes"] == {}, "rien ne part, aucune demande ne reste"
    assert journal(r)[0] == ("retenu", "sous la main de quelqu’un", 0)


def test_un_script_indisponible_ne_part_pas_et_ne_se_note_pas(creer):
    """Sonde S2c : Home Assistant saute en silence une entite `unavailable` d'un service d'entite — `script.turn_on` « reussissait »,
    rien ne bipait, et le journal disait « script : Localiser ». Un script muet est un script absent : `script_inconnu`, et l'ecran
    retombe sur `vacuum.locate`. Pour un script de DEPART, meme regle : il ne garde plus la main (`_script_depart`), et « tout le
    logement » au planning repart par `vacuum.start`."""
    for muet in ("unavailable", "unknown"):
        r = associe(creer, etats={**ETATS_SON_CAS, "script.robot_ou": FauxEtat(muet)}, entites=ENTITES_SON_CAS)
        with pytest.raises(ValueError) as e:
            lancer(r.async_lancer_depart("vacuum.robot", [], script="script.robot_ou", role="localiser", user=Compte("u1")))
        assert getattr(e.value, "code", None) == "script_inconnu"
        assert r.hass.services.appels == [] and journal(r) == [] and r.carnet["demandes"] == {}
    # Son `nettoyer_tout` indisponible : la source n'est plus `scripts`, et le planning part par la commande de base.
    r = associe(creer, bits=0, options={}, config={"plannings": [planning()]}, etats={**ETATS_SON_CAS, "script.robot_partout": FauxEtat("unavailable")},
                entites=ENTITES_SON_CAS)
    assert lancer(r.async_etat(None))["pieces"]["vacuum.robot"]["source"] == "segments"
    assert lancer(r.async_minute(LUNDI_0930)) == ["p1"] and r.hass.services.appels == [("vacuum", "start", {"entity_id": ["vacuum.robot"]})]


def test_une_lecture_des_pieces_qui_leve_n_empeche_ni_tout_le_logement_ni_les_autres_plannings(creer):
    """Sonde S4 : `async_lancer_depart` lit les pieces avant la garde (D8) sans `try` — un registre etrange emportait le depart,
    alors que `async_etat` s'en protege (point 11). Et un planning qui leve ne doit pas faire tomber les autres de la meme minute."""
    def casse(robot):
        raise RuntimeError("options illisibles")
    r = ecovacs(creer)
    r._options_vacuum = casse
    lancer(r.async_lancer_depart("vacuum.robot", [], user=Compte("u1")))
    assert r.hass.services.appels == [("vacuum", "start", {"entity_id": ["vacuum.robot"]})], "tout le logement part, sans les pieces"
    # Des zones derriere une lecture qui leve : refus nomme, rien ne part — jamais une devinette.
    r = ecovacs(creer)
    r._options_vacuum = casse
    with pytest.raises(ValueError) as e:
        lancer(r.async_lancer_depart("vacuum.robot", ZONES_HA, user=Compte("u1")))
    assert getattr(e.value, "code", None) == "pieces_inconnues" and r.hass.services.appels == []
    # Le planning « tout le logement » part aussi derriere une lecture qui leve.
    r = ecovacs(creer, config={"plannings": [planning()]})
    r._options_vacuum = casse
    assert lancer(r.async_minute(LUNDI_0930)) == ["p1"] and r.hass.services.appels == [("vacuum", "start", {"entity_id": ["vacuum.robot"]})]
    # Un planning qui LEVE n'emporte pas le suivant de la meme minute.
    r = creer({"plannings": [planning(), planning(id="p2", robot="lawn_mower.t")]}, {"vacuum.robot": FauxEtat("docked"), "lawn_mower.t": FauxEtat("docked")})
    original = r.async_lancer

    async def leve(p, quand):
        if p["id"] == "p1":
            raise RuntimeError("boum")
        return await original(p, quand)
    r.async_lancer = leve
    assert lancer(r.async_minute(LUNDI_0930)) == ["p2"]
    assert r.hass.services.appels == [("lawn_mower", "start_mowing", {"entity_id": ["lawn_mower.t"]})]
