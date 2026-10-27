"""La maison ne ROUVRE jamais l'eau seule (chantier IoT, etape 3, passe bis 2 ; ADR 0217).

Rouvrir, c'est une personne, depuis la popup de la vanne, apres la question —
l'ecran appelle Home Assistant lui-meme et ne passe jamais par le serveur.
Aucune regle, aucun planning, aucune veille, aucun scenario, aucun bouton sans
fil n'allume la prise designee comme vanne d'eau ni n'ouvre une `valve` de
classe `water` : le garde vit dans `regles.agir`, et la ou un module appelle
les services sans lui (scenarios.py, interrupteurs.py). Fermer passe toujours.
"""
from __future__ import annotations

import asyncio
import json

import pytest

from conftest import FauxStore, charger

PRISE = "switch.prise_arrivee"
VANNE = "valve.arrivee"
ALERTES = {"loggia_alertes": {"service": "mobile", "actions": {"vanne": {"actif": True, "entite": PRISE}}}}


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

    def async_entity_ids(self, domaine=None):
        return [e for e in self.table if domaine is None or e.startswith(domaine + ".")]


class FauxServices:
    def __init__(self):
        self.appels = []

    def has_service(self, domaine, service):
        return True

    async def async_call(self, domaine, service, data, blocking=False, context=None):
        self.appels.append((domaine, service, dict(data)))


class FauxHass:
    def __init__(self, etats=None):
        self.states = FauxEtats(etats or {})
        self.services = FauxServices()
        self.taches = []

    def async_create_task(self, coro):
        self.taches.append(coro)
        return coro

    def abandonner(self):
        taches, self.taches = self.taches, []
        for coro in taches:
            coro.close()


def magasin_de(store_module, partage):
    m = store_module.LoggiaStore.__new__(store_module.LoggiaStore)
    m._store = FauxStore({"users": {}, "shared": json.loads(json.dumps(partage)), "migrated": True})
    m._ancien = FauxStore(None)
    m._data = None
    m._lock = asyncio.Lock()
    return m


def etats_maison():
    return {PRISE: FauxEtat("off"), "switch.lave_vaisselle": FauxEtat("off"),
            VANNE: FauxEtat("closed", {"device_class": "water"}),
            "valve.arrosage": FauxEtat("closed", {"device_class": "gas"})}


@pytest.fixture
def calcul():
    # Le calcul vit au socle (regles.py) : le carnet de l'eau note, il ne nomme aucun service (test_eau.py).
    return charger("regles")


@pytest.fixture
def socle(store_module):
    regles_module = charger("regles")
    faits = []

    def fabrique(partage=None, etats=None):
        hass = FauxHass(etats if etats is not None else etats_maison())
        r = regles_module.Regles(hass, magasin_de(store_module, partage if partage is not None else ALERTES))
        r._depot = FauxStore(None)
        faits.append(hass)
        return r

    yield fabrique
    for hass in faits:
        hass.abandonner()


# ── Le calcul ────────────────────────────────────────────────────────────────

def test_ce_qui_rouvrirait_l_eau(calcul):
    attrs = {VANNE: {"device_class": "water"}, "valve.gaz": {"device_class": "gas"}}.get
    r = lambda service, cibles, data=None: calcul.a_ne_pas_rouvrir(service, cibles, data, PRISE, attrs)  # noqa: E731
    assert r("turn_on", [PRISE, "switch.lampe"]) == [PRISE]
    assert r("toggle", PRISE) == [PRISE]
    assert r("open_valve", [VANNE, "valve.gaz"]) == [VANNE], "une vanne de gaz n'est pas l'eau"
    assert r("set_valve_position", [VANNE], {"position": 40}) == [VANNE]
    assert r("set_valve_position", [VANNE], {"position": 0}) == [], "a 0, elle ferme"
    for fermer in ("turn_off", "close_valve"):
        assert r(fermer, [PRISE, VANNE]) == [], "fermer passe toujours"
    # Sans prise designee, une prise n'est pas une vanne.
    assert calcul.a_ne_pas_rouvrir("turn_on", [PRISE], None, None, attrs) == []


# ── L'entonnoir : regles.agir ───────────────────────────────────────────────

def test_une_regle_ne_rallume_pas_la_prise_designee(socle):
    r = socle()
    partis = lancer(r.agir("veilles", "creuses", "homeassistant", "turn_on", [PRISE, "switch.lave_vaisselle"]))
    assert partis == ["switch.lave_vaisselle"]
    assert r.hass.services.appels == [("homeassistant", "turn_on", {"entity_id": ["switch.lave_vaisselle"]})]
    ligne = lancer(r.journal(module="veilles"))[0]
    assert "Loggia ne rouvre jamais l’eau seule" in ligne["detail"] and ligne["n"] == 1


def test_seule_la_vanne_retenue_rien_ne_part(socle):
    r = socle()
    assert lancer(r.agir("presence", "retour", "valve", "open_valve", [VANNE])) == []
    assert lancer(r.agir("nuit", "x", "switch", "toggle", [PRISE])) == []
    assert lancer(r.agir("robots", "x", "valve", "set_valve_position", [VANNE], {"position": 100})) == []
    assert r.hass.services.appels == []


def test_fermer_passe_toujours(socle):
    r = socle()
    assert lancer(r.agir("alertes", "danger", "switch", "turn_off", [PRISE])) == [PRISE]
    assert lancer(r.agir("alertes", "danger", "valve", "close_valve", [VANNE])) == [VANNE]
    assert lancer(r.agir("x", "y", "valve", "set_valve_position", [VANNE], {"position": 0})) == [VANNE]
    assert len(r.hass.services.appels) == 3


def test_sans_designation_une_prise_reste_une_prise(socle):
    r = socle(partage={})
    assert lancer(r.agir("veilles", "creuses", "homeassistant", "turn_on", [PRISE])) == [PRISE]


# ── La veille des heures creuses (veilles.py, « prises à allumer ») ─────────

def test_les_heures_creuses_ne_rouvrent_pas_l_eau(store_module, monkeypatch):
    import sys
    module = charger("veilles")
    for nom in ("entity_registry", "device_registry"):
        monkeypatch.setattr(sys.modules["homeassistant.helpers." + nom], "async_get",
                            lambda _h: (_ for _ in ()).throw(RuntimeError("registre illisible")))
    partage = {**ALERTES, "loggia_veilles": {"creuses": {"actif": True, "entite": "sensor.tarif", "valeur": "HC",
                                                         "prises": [PRISE, "switch.lave_vaisselle"]}}}
    v = module.LoggiaVeilles.__new__(module.LoggiaVeilles)
    v.hass = FauxHass({**etats_maison(), "sensor.tarif": FauxEtat("HC")})
    v.store = magasin_de(store_module, partage)
    v.cfg = lancer(v.async_config())
    v.signales, v.creuses_en_cours, v._defait = set(), False, []
    v.regles = charger("regles").Regles(v.hass, v.store)
    v.regles._depot = FauxStore(None)
    v._depot = FauxStore(None)
    try:
        lancer(v._async_creuses())
        allumes = [a for a in v.hass.services.appels if a[1] == "turn_on"]
        assert allumes == [("homeassistant", "turn_on", {"entity_id": ["switch.lave_vaisselle"]})]
    finally:
        v.hass.abandonner()


# ── Un scenario (scenarios.py appelle les services lui-meme) ────────────────

def test_un_scenario_ne_rouvre_pas_l_eau(store_module, monkeypatch):
    module = charger("scenarios")
    monkeypatch.setattr(module, "async_index", lambda hass, user=None: {"areas": [], "devices": [], "entities": []})
    # La prise designee est AUSSI declaree lumiere : « Allumer les lumieres » la viserait.
    partage = {**ALERTES, "loggia_switchlights": [PRISE],
               "loggia_scenarios": {"migre": True, "persos": [{"id": "matin", "nom": "Matin",
                                               "actions": [{"famille": "lumieres", "geste": "allumer", "portee": "maison"}]}]}}
    s = module.LoggiaScenarios.__new__(module.LoggiaScenarios)
    s.hass = FauxHass({**etats_maison(), "light.salon": FauxEtat("off"), "sun.sun": FauxEtat("below_horizon")})
    s.store = magasin_de(store_module, partage)
    s._derniers = {}
    s.regles = charger("regles").Regles(s.hass, s.store)
    s.regles._depot = FauxStore(None)
    try:
        assert lancer(s.async_lancer("matin")) is not None
        cibles = [h for _d, sv, data in s.hass.services.appels if sv == "turn_on" for h in data["entity_id"]]
        assert "light.salon" in cibles and PRISE not in cibles, s.hass.services.appels
        ligne = lancer(s.regles.journal(module="scenarios"))[0]
        assert "Loggia ne rouvre jamais l’eau seule" in ligne["detail"]
    finally:
        s.hass.abandonner()


# ── Un bouton sans fil (interrupteurs.py) ──────────────────────────────────

def test_un_bouton_sans_fil_ne_rouvre_pas_l_eau(store_module):
    module = charger("interrupteurs")
    partage = {**ALERTES, "loggia_interrupteurs": {"z2m/Bouton": {"nom": "Bouton", "actions": {"single": [
        {"service": "homeassistant.turn_on", "data": {"entity_id": [PRISE, "switch.lave_vaisselle"]}},
        {"service": "valve.open_valve", "data": {"entity_id": VANNE}},
        {"service": "switch.turn_off", "data": {"entity_id": PRISE}},
    ]}}}}
    e = module.LoggiaInterrupteurs.__new__(module.LoggiaInterrupteurs)
    e.hass = FauxHass(etats_maison())
    e.store = magasin_de(store_module, partage)
    e.regles = charger("regles").Regles(e.hass, e.store)
    e.regles._depot = FauxStore(None)
    try:
        lancer(e._async_executer("z2m/Bouton", "single"))
        assert e.hass.services.appels == [
            ("homeassistant", "turn_on", {"entity_id": ["switch.lave_vaisselle"]}),
            ("switch", "turn_off", {"entity_id": PRISE}),
        ]
    finally:
        e.hass.abandonner()


# ── Un bouton qui vise une PIECE, un appareil, un etage, une etiquette (trois defauts du 25/10) ──
# La garde ne lisait que `entity_id` : un `turn_on` regle sur la cuisine rallumait la prise designee. La cible se resout
# par les registres — une entite est dans une piece si son `area_id` y est, ou si elle n'en a pas et que son appareil y
# est —, l'eau en sort, le reste part en `entity_id` explicite ; une cible illisible ne part pas.

def _registres(monkeypatch, illisible=False):
    import sys
    from types import SimpleNamespace as N

    def entite(haid, area=None, device=None, labels=(), categorie=None, masque=None):
        return N(entity_id=haid, area_id=area, device_id=device, labels=set(labels), entity_category=categorie,
                 hidden_by=masque, disabled_by=None)
    entites = [entite(PRISE, device="d_prise", labels={"arrivee"}),
               entite("switch.lave_vaisselle", area="cuisine"),
               entite("light.cuisine", area="cuisine"),
               entite("switch.reglage", area="cuisine", categorie="config"),
               entite("switch.cachee", area="cuisine", masque="user"),
               entite("switch.ailleurs", area="salon", device="d_prise"),
               entite(VANNE, area="garage")]
    appareils = {"d_prise": N(id="d_prise", area_id="cuisine", labels=set(), disabled_by=None)}
    pieces = {"cuisine": N(id="cuisine", floor_id="rdc", labels=set()), "salon": N(id="salon", floor_id="etage", labels=set()),
              "garage": N(id="garage", floor_id="rdc", labels=set())}
    registres = {"entity_registry": N(entities={x.entity_id: x for x in entites}), "device_registry": N(devices=appareils),
                 "area_registry": N(areas=pieces)}
    for nom, reg in registres.items():
        if illisible:
            monkeypatch.setattr(sys.modules["homeassistant.helpers." + nom], "async_get",
                                lambda _h: (_ for _ in ()).throw(RuntimeError("registre illisible")))
        else:
            monkeypatch.setattr(sys.modules["homeassistant.helpers." + nom], "async_get", lambda _h, reg=reg: reg)


def _bouton(store_module, gestes):
    module = charger("interrupteurs")
    partage = {**ALERTES, "loggia_interrupteurs": {"z2m/Bouton": {"nom": "Bouton", "actions": {"single": gestes}}}}
    e = module.LoggiaInterrupteurs.__new__(module.LoggiaInterrupteurs)
    etats = {**etats_maison(), "light.cuisine": FauxEtat("off"), "switch.reglage": FauxEtat("off")}
    e.hass = FauxHass(etats)
    e.store = magasin_de(store_module, partage)
    e.regles = charger("regles").Regles(e.hass, e.store)
    e.regles._depot = FauxStore(None)
    try:
        lancer(e._async_executer("z2m/Bouton", "single"))
        return e.hass.services.appels
    finally:
        e.hass.abandonner()


@pytest.mark.parametrize("service,data,attendu", [
    # Une piece : son entite directe, et la prise par son appareil — la prise sort, le reste part.
    ("homeassistant.turn_on", {"area_id": "cuisine"}, {"entity_id": ["light.cuisine", "switch.lave_vaisselle"]}),
    ("switch.turn_on", {"area_id": "cuisine"}, {"entity_id": ["switch.lave_vaisselle"]}),
    ("switch.toggle", {"area_id": ["cuisine"]}, {"entity_id": ["switch.lave_vaisselle"]}),
    ("light.turn_on", {"area_id": "cuisine", "brightness_pct": 40}, {"entity_id": ["light.cuisine"], "brightness_pct": 40}),
    # Un appareil, un etage, une etiquette, un bloc `target`.
    ("switch.turn_on", {"device_id": "d_prise"}, {"entity_id": ["switch.ailleurs"]}),
    ("switch.turn_on", {"floor_id": "rdc"}, {"entity_id": ["switch.lave_vaisselle"]}),
    ("switch.turn_on", {"label_id": "arrivee"}, None),
    ("switch.turn_on", {"target": {"area_id": "cuisine"}}, {"entity_id": ["switch.lave_vaisselle"]}),
    # `all`, et une liste que Home Assistant lit en la decoupant aux virgules et en minuscules.
    ("switch.turn_on", {"entity_id": "all"}, {"entity_id": ["switch.lave_vaisselle", "switch.reglage"]}),
    ("switch.turn_on", {"entity_id": "switch.lave_vaisselle, SWITCH.Prise_Arrivee"}, {"entity_id": ["switch.lave_vaisselle"]}),
    ("valve.open_valve", {"area_id": "garage"}, None),
    ("valve.set_valve_position", {"floor_id": "rdc", "position": 50}, None),
])
def test_un_bouton_qui_vise_une_piece_ne_rouvre_pas_l_eau(store_module, monkeypatch, service, data, attendu):
    _registres(monkeypatch)
    appels = _bouton(store_module, [{"service": service, "data": data}])
    domaine, nom = service.split(".")
    assert appels == ([(domaine, nom, attendu)] if attendu is not None else []), appels


def test_fermer_une_piece_passe_tel_quel_meme_registre_illisible(store_module, monkeypatch):
    _registres(monkeypatch, illisible=True)
    appels = _bouton(store_module, [{"service": "switch.turn_off", "data": {"area_id": "cuisine"}},
                                    {"service": "valve.set_valve_position", "data": {"area_id": "garage", "position": 0}}])
    assert appels == [("switch", "turn_off", {"area_id": "cuisine"}),
                      ("valve", "set_valve_position", {"area_id": "garage", "position": 0})]


@pytest.mark.parametrize("data", [
    {"area_id": "cuisine"},                       # registre illisible
    {"area_id": 3},                               # forme inconnue
    {"target": "cuisine"},                        # un bloc `target` qui n'est pas un objet
    {"entity_id": ["switch.lave_vaisselle", 4]},  # une liste melee
])
def test_une_cible_qui_ne_se_resout_pas_ne_part_pas(store_module, monkeypatch, caplog, data):
    _registres(monkeypatch, illisible=data == {"area_id": "cuisine"})
    with caplog.at_level("WARNING"):
        appels = _bouton(store_module, [{"service": "switch.turn_on", "data": data}])
    assert appels == [], "dans le doute, un service ouvrant ne part pas"
    assert any("eau" in r.getMessage() for r in caplog.records), "le refus se lit au journal de Home Assistant"


def test_tout_allumer_partout_par_all_ne_part_pas(store_module, monkeypatch):
    # `homeassistant.turn_on` sur `all` : aucun domaine pour borner la cible — on ne la devine pas.
    _registres(monkeypatch)
    assert _bouton(store_module, [{"service": "homeassistant.turn_on", "data": {"entity_id": "all"}}]) == []


def test_sans_eau_a_garder_un_bouton_qui_vise_une_piece_part_tel_quel(store_module, monkeypatch):
    # Ni prise designee, ni `valve` de classe `water` : rien a garder. Le bouton part tel qu'il est regle, et c'est Home
    # Assistant qui resout la piece, comme avant — meme registre illisible, meme `all` sans domaine.
    _registres(monkeypatch, illisible=True)
    module = charger("interrupteurs")
    gestes = [{"service": "switch.turn_on", "data": {"area_id": "cuisine"}},
              {"service": "homeassistant.turn_on", "data": {"entity_id": "all"}},
              {"service": "light.toggle", "data": {"target": {"floor_id": "rdc"}}}]
    e = module.LoggiaInterrupteurs.__new__(module.LoggiaInterrupteurs)
    e.hass = FauxHass({PRISE: FauxEtat("off"), "valve.arrosage": FauxEtat("closed", {"device_class": "gas"})})
    e.store = magasin_de(store_module, {"loggia_interrupteurs": {"z2m/Bouton": {"nom": "Bouton", "actions": {"single": gestes}}}})
    e.regles = charger("regles").Regles(e.hass, e.store)
    e.regles._depot = FauxStore(None)
    try:
        lancer(e._async_executer("z2m/Bouton", "single"))
        assert e.hass.services.appels == [("switch", "turn_on", {"area_id": "cuisine"}),
                                          ("homeassistant", "turn_on", {"entity_id": "all"}),
                                          ("light", "toggle", {"target": {"floor_id": "rdc"}})]
    finally:
        e.hass.abandonner()
