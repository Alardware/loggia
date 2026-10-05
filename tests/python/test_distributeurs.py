"""Le distributeur de croquettes : ses sources, et le planning de Loggia (05/10).

Decisions de l'utilisateur (ADR 0155) : le planning se lit dans le programme
de l'appareil, puis dans les automatisations qui COMMANDENT le distributeur,
et seulement a defaut dans un planning tenu par Loggia ; un repas tombe
pendant un redemarrage n'est pas rattrape, il est note « manque ».

Les points qui comptent ici :
  * un repas retenu a TOUJOURS un motif au journal ;
  * le serveur tient la regle des sources lui-meme, au depart de chaque repas ;
  * AUCUN `regles.suivre` sur la commande : une ration donnee a la main ne
    doit jamais geler la commande ni retenir le repas suivant — un repas saute,
    c'est la sante de l'animal ;
  * l'etat est un RESUME : jamais raw_config, ni la commande brute.
"""
from __future__ import annotations

import asyncio
import datetime as dt
import json
import sys
import types

import pytest

from conftest import FauxStore, charger
from doublures_ha import FausseAutomatisation, poser_automatisations


def lancer(coro):
    return asyncio.run(coro)


class FauxEtat:
    def __init__(self, state, attributes=None):
        self.state = state
        self.attributes = attributes or {}


class FauxEtats:
    def __init__(self, table):
        self.table = {k: (v if isinstance(v, FauxEtat) else FauxEtat(*v)) for k, v in table.items()}

    def get(self, haid):
        return self.table.get(haid)

    def async_entity_ids(self, domaine):
        return [e for e in self.table if e.startswith(domaine + ".")]


class FauxServices:
    """Les appels, et les services presents. Tuya rend sa reponse."""

    def __init__(self, presents=(), tuya=None):
        self.presents = set(presents)
        self.tuya = tuya
        self.appels = []

    def has_service(self, domaine, service):
        return f"{domaine}.{service}" in self.presents

    async def async_call(self, domaine, service, data, blocking=False, context=None, return_response=False):
        self.appels.append((domaine, service, dict(data)))
        if return_response:
            return self.tuya


class FauxHass:
    def __init__(self, etats, services=None):
        self.states = FauxEtats(etats)
        self.services = services or FauxServices()
        self.data = {}
        self.config = types.SimpleNamespace(time_zone="Europe/Paris")
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


class Compte:
    def __init__(self, admin=False, lire=None, piloter=None):
        self.id = "u-admin" if admin else "u-lea"
        self.is_admin = admin
        if lire is not None or piloter is not None:
            def check_entity(eid, sorte):
                regle = lire if sorte == "read" else piloter
                return True if regle is None else regle(eid)
            self.permissions = types.SimpleNamespace(check_entity=check_entity)


# ── Le distributeur de reference : un Aqara sous Zigbee2MQTT, comme chez lui ─

FEED = "select.distributeur_feed"
APPAREIL = "dev_aqara"
REGISTRE_AQARA = [
    Entree(FEED, APPAREIL, "mqtt"),
    Entree("number.distributeur_portion", APPAREIL, "mqtt"),
    Entree("select.distributeur_mode", APPAREIL, "mqtt"),
]
ETATS_AQARA = {
    FEED: ("unknown", {"options": ["START", "STOP"]}),
    "number.distributeur_portion": ("1", {"min": 1, "max": 10, "step": 1}),
    "select.distributeur_mode": ("manual", {"options": ["schedule", "manual"]}),
    "input_number.croquettes_reservoir": ("60", {"unit_of_measurement": "%"}),
}
FEEDER = {"appareil": APPAREIL, "haid": FEED, "haids": {"reservoir": "input_number.croquettes_reservoir"}}


def repas(**k):
    base = {"id": "r1", "heure": "07:30", "jours": [0, 1, 2, 3, 4, 5, 6], "portions": 2, "actif": True}
    base.update(k)
    return base


def auto_qui_distribue(eid="automation.croquettes_matin", heure="07:30"):
    """Une automatisation qui COMMANDE le distributeur : son action vise la commande."""
    return FausseAutomatisation(
        eid,
        {"id": "1700000000001", "alias": "Croquettes",
         "triggers": [{"trigger": "time", "at": heure}],
         "actions": [{"action": "select.select_option", "target": {"entity_id": FEED},
                      "data": {"option": "START"}}]},
        references={"entities": [FEED]}, action_script={"referenced_entities": [FEED]})


def alerte_qui_lit_le_bac():
    return FausseAutomatisation(
        "automation.alerte_bac",
        {"triggers": [{"trigger": "numeric_state", "entity_id": "input_number.croquettes_reservoir", "below": 10}],
         "actions": [{"action": "notify.notify", "data": {"message": "bac presque vide"}}]},
        references={"entities": ["input_number.croquettes_reservoir"]}, action_script={})


# Lundi 05/10/2026, 07:30.
LUNDI_0730 = dt.datetime(2026, 10, 5, 7, 30)


@pytest.fixture
def module():
    return charger("distributeurs")


@pytest.fixture
def regles_module():
    return charger("regles")


@pytest.fixture
def creer(module, store_module, regles_module):
    faits = []

    def fabrique(feeder=FEEDER, planning=None, etats=None, registre=REGISTRE_AQARA, autos=(),
                 services=None, partage_en_plus=None):
        partage = {"loggia_feeder": feeder}
        if planning is not None:
            partage["loggia_distributeurs"] = planning
        partage.update(partage_en_plus or {})
        magasin = store_module.LoggiaStore.__new__(store_module.LoggiaStore)
        magasin._store = FauxStore({"users": {}, "shared": partage, "migrated": True})
        magasin._ancien = FauxStore(None)
        magasin._data = None
        magasin._lock = asyncio.Lock()

        d = module.LoggiaDistributeurs.__new__(module.LoggiaDistributeurs)
        d.hass = FauxHass(ETATS_AQARA if etats is None else etats, services)
        poser_automatisations(d.hass, list(autos))
        for a in autos:
            d.hass.states.table.setdefault(a.entity_id, FauxEtat("on", {"friendly_name": "Croquettes",
                                                                        "id": (a.raw_config or {}).get("id")}))
        d.store = magasin
        d._defait = []
        d._tuya = {}
        d._registre_dit = False
        d._ids_registre = {}
        d._tentes = {}
        # Le socle commun, un vrai : c'est lui qui tient le journal et le gel.
        d.regles = regles_module.Regles(d.hass, magasin)
        d.regles._depot = FauxStore(None)
        d.cfg = lancer(d.async_config())
        faux = FauxRegistre(list(registre))
        d._registre = lambda: faux
        faits.append(d)
        return d

    yield fabrique
    for d in faits:
        d.hass.abandonner()


def journal(d):
    return [(e["quoi"], e["motif"], e["detail"], e["n"]) for e in lancer(d.regles.journal(module="distributeurs"))]


def eteindre(d, eid):
    d.hass.states.table[eid] = FauxEtat("off", dict(d.hass.states.table[eid].attributes))


# ── Ce qui se calcule ───────────────────────────────────────────────────────

def test_le_format_et_l_heure_sont_ceux_des_robots(module):
    robots = charger("robots")
    assert module.est_du is robots.est_du and module.lire_heure is robots.lire_heure
    assert module.CLE == "loggia_distributeurs" and module.MODULE == "distributeurs"
    assert module.MAX_REPAS == 12 and module.PORTIONS_MAX == 20


def test_un_repas_propre_ou_refuse(module):
    assert module.normaliser_repas({"id": "r1", "heure": "7:05", "jours": [3, 0, 3], "portions": 3}) == \
        {"id": "r1", "heure": "07:05", "jours": [0, 3], "portions": 3, "actif": True}
    for mauvais in ({"id": "R 1", "heure": "07:00", "jours": []},
                    {"id": "r1", "heure": "24:00", "jours": []},
                    {"id": "r1", "heure": "07:00", "jours": [7]},
                    {"id": "r1", "heure": "07:00", "jours": [True]},
                    {"id": "r1", "heure": "07:00", "jours": [], "portions": 0},
                    {"id": "r1", "heure": "07:00", "jours": [], "portions": 21},
                    {"id": "r1", "heure": "07:00", "jours": [], "portions": True},
                    {"id": "r1", "heure": "07:00", "jours": [], "portions": 1.5},
                    "r1"):
        with pytest.raises(ValueError):
            module.normaliser_repas(mauvais)


def test_au_chargement_l_illisible_est_ecarte(module):
    brut = {"appareil": " dev ", "repas": [repas(), repas(heure="midi"), repas(), repas(id="r2")]
            + [repas(id="x%d" % i) for i in range(20)]}
    cfg = module.normaliser(brut)
    assert cfg["appareil"] == "dev"
    assert [r["id"] for r in cfg["repas"]][:2] == ["r1", "r2"], "doublon ou illisible garde"
    assert len(cfg["repas"]) <= module.MAX_REPAS
    assert module.normaliser("abime") == {"appareil": None, "repas": []}


def test_sources_presente_et_active(module):
    vide = module.sources(None, [], {"repas": []})
    assert module.source_active(vide) is None
    illisible = {"presente": True, "active": False}
    s = module.sources(illisible, [{"etat": "off"}], {"repas": [repas(actif=True)]})
    assert s == {"programme": {"presente": True, "active": False},
                 "automatisations": {"presente": True, "active": False},
                 "loggia": {"presente": True, "active": True}}
    assert module.source_active(s) == "loggia"
    assert not module.superieure_active(s), "un programme illisible ou une automatisation eteinte ne retient rien"
    assert not module.peut_planifier(s, {"domaine": "select"}), "une source PRESENTE interdit l'ajout"
    assert module.peut_planifier(module.sources(None, [], None), {"domaine": "select"})
    assert not module.peut_planifier(module.sources(None, [], None), None), "sans commande, rien a planifier"
    actives = module.sources({"presente": True, "active": True}, [{"etat": "on"}], None)
    assert module.source_active(actives) == "appareil"
    assert module.source_active(module.sources(None, [{"etat": "on"}], None)) == "automatisations"


def test_l_ancienne_liste_comptee_et_ses_indices(module):
    feeder = {"meals": [{"time": "07:30", "label": "Matin", "auto": "automation.matin"},
                        {"time": "12:00", "label": "Midi", "auto": "input_boolean.repas_midi"},
                        {"time": "19:00", "label": 7}, "abime"],
              "associees": ["automation.par_zone", "light.cuisine", 3]}
    assert module.ancienne_liste(feeder) == {"n": 3, "relies": 1, "non_relies": [
        {"heure": "12:00", "label": "Midi"}, {"heure": "19:00", "label": "7"}]}
    assert module.indices(feeder) == {"ancienne_liste": ["automation.matin"], "associee": ["automation.par_zone"]}
    assert module.ancienne_liste(None) == {"n": 0, "relies": 0, "non_relies": []}


def test_les_repas_manques_dans_la_demi_heure(module):
    planning = {"repas": [repas(id="a", heure="07:30"), repas(id="b", heure="07:00"),
                          repas(id="c", heure="07:50"), repas(id="d", heure="07:40", actif=False),
                          repas(id="e", heure="07:35", jours=[1])]}
    vus = [(r["id"], q) for r, q in module.repas_manques(planning, dt.datetime(2026, 10, 5, 7, 45))]
    assert vus == [("a", dt.datetime(2026, 10, 5, 7, 30))], vus
    # Minuit passe : le repas de 23:50 est celui de la veille (un dimanche).
    nuit = {"repas": [repas(id="n", heure="23:50", jours=[6])]}
    assert [q for _, q in module.repas_manques(nuit, dt.datetime(2026, 10, 5, 0, 10))] == \
        [dt.datetime(2026, 10, 4, 23, 50)]


# ── Le depart : chaque commande, avec la bonne charge ───────────────────────

def test_un_select_feed_recoit_start(creer):
    d = creer(planning={"appareil": APPAREIL, "repas": [repas()]})
    assert lancer(d.async_lancer(d.cfg["repas"][0], LUNDI_0730)) is True
    assert d.hass.services.appels == [("select", "select_option", {"entity_id": [FEED], "option": "START"})]
    assert journal(d) == [("distribuer", "repas 07:30", "", 1)]


def test_un_bouton_est_presse_une_fois(creer):
    registre = [Entree("button.granary_manual_feed", "dev_p", "petlibro", "manual_feed")]
    etats = {"button.granary_manual_feed": ("unknown", {})}
    d = creer(feeder={"appareil": "dev_p"}, planning={"appareil": "dev_p", "repas": [repas(portions=3)]},
              etats=etats, registre=registre)
    assert lancer(d.async_lancer(d.cfg["repas"][0])) is True
    assert d.hass.services.appels == [("button", "press", {"entity_id": ["button.granary_manual_feed"]})]


def test_un_number_ecrit_les_portions_en_pas(creer):
    registre = [Entree("number.cwwsq_feed", "dev_t", "tuya", "feed")]
    etats = {"number.cwwsq_feed": ("0", {"min": 10, "max": 50, "step": 10})}
    d = creer(feeder={"appareil": "dev_t"}, planning={"appareil": "dev_t", "repas": [repas(portions=2)]},
              etats=etats, registre=registre)
    assert lancer(d.async_lancer(d.cfg["repas"][0])) is True
    assert d.hass.services.appels == [("number", "set_value", {"entity_id": ["number.cwwsq_feed"], "value": 20})]


def test_le_script_designe_recoit_ses_portions(creer):
    etats = {"script.nourrir_le_chat": ("off", {})}
    d = creer(feeder={"script": "script.nourrir_le_chat"}, planning={"repas": [repas(portions=2)]},
              etats=etats, registre=[])
    assert lancer(d.async_lancer(d.cfg["repas"][0])) is True
    assert d.hass.services.appels == [("script", "turn_on", {"entity_id": ["script.nourrir_le_chat"],
                                                             "variables": {"portions": 2}})]


# ── Ce qui retient un repas : toujours un motif ─────────────────────────────

def test_sans_commande_le_repas_est_retenu(creer):
    d = creer(feeder={}, planning={"repas": [repas()]}, registre=[])
    assert lancer(d.async_lancer(d.cfg["repas"][0])) is False
    assert d.hass.services.appels == []
    assert journal(d) == [("retenu", "repas 07:30", "commande inconnue", 0)]


def test_un_distributeur_injoignable_retient_le_repas(creer):
    etats = dict(ETATS_AQARA)
    etats[FEED] = ("unavailable", {"options": ["START", "STOP"]})
    d = creer(planning={"appareil": APPAREIL, "repas": [repas()]}, etats=etats)
    assert lancer(d.async_lancer(d.cfg["repas"][0])) is False
    assert d.hass.services.appels == []
    assert journal(d) == [("retenu", "repas 07:30", "distributeur injoignable", 0)]


def test_une_automatisation_allumee_retient_le_repas_et_l_eteinte_non(creer):
    auto = auto_qui_distribue()
    d = creer(planning={"appareil": APPAREIL, "repas": [repas()]}, autos=[auto])
    assert lancer(d.async_lancer(d.cfg["repas"][0])) is False
    assert journal(d) == [("retenu", "repas 07:30", "autre source", 0)]
    # Elle s'arrete : le planning de Loggia reprend seul, sans rien toucher.
    eteindre(d, auto.entity_id)
    assert lancer(d.async_lancer(d.cfg["repas"][0])) is True
    assert d.hass.services.appels == [("select", "select_option", {"entity_id": [FEED], "option": "START"})]


def test_une_alerte_qui_lit_le_bac_ne_retient_rien(creer):
    d = creer(planning={"appareil": APPAREIL, "repas": [repas()]}, autos=[alerte_qui_lit_le_bac()])
    assert lancer(d.async_lancer(d.cfg["repas"][0])) is True, "une automatisation qui LIT le bac n'est pas un repas"


def test_un_programme_actif_retient_mais_un_programme_illisible_non(creer):
    # Aqara en mode programme, liste lisible avec un creneau : il distribue.
    registre = REGISTRE_AQARA + [Entree("sensor.distributeur_schedule", APPAREIL, "mqtt")]
    etats = dict(ETATS_AQARA)
    etats["select.distributeur_mode"] = ("schedule", {"options": ["schedule", "manual"]})
    etats["sensor.distributeur_schedule"] = (json.dumps([{"days": "everyday", "hour": 8, "minute": 0, "size": 1}]), {})
    d = creer(planning={"appareil": APPAREIL, "repas": [repas()]}, etats=etats, registre=registre)
    assert lancer(d.async_lancer(d.cfg["repas"][0])) is False
    assert journal(d)[0][2] == "autre source"
    # Mode programme SANS liste lisible : present, illisible, non actif — le
    # repas Loggia deja la n'est pas retenu (ADR 0155).
    etats["sensor.distributeur_schedule"] = ("unknown", {})
    d = creer(planning={"appareil": APPAREIL, "repas": [repas()]}, etats=etats, registre=registre)
    assert lancer(d.async_lancer(d.cfg["repas"][0])) is True


def test_un_autre_distributeur_retient_le_repas(creer):
    d = creer(planning={"appareil": "dev_ancien", "repas": [repas()]})
    assert lancer(d.async_lancer(d.cfg["repas"][0])) is False
    assert d.hass.services.appels == []
    assert journal(d) == [("retenu", "repas 07:30", "distributeur change", 0)]


def test_seul_le_repas_de_cette_minute_part(creer):
    d = creer(planning={"appareil": APPAREIL, "repas": [repas(id="a"), repas(id="b", heure="19:00"),
                                                        repas(id="c", actif=False)]})
    assert lancer(d.async_minute(LUNDI_0730)) == ["a"]


def test_un_repas_ne_part_qu_une_fois_la_nuit_du_passage_a_l_heure_d_hiver(creer):
    """Le 25/10/2026, 02:00-03:00 se repete : Home Assistant sonne 02:30 deux
    fois (avant et apres le recul). Un repas de 02:30 serait servi deux fois —
    la double ration, le risque le plus grave (contradicteur, 05/10)."""
    d = creer(planning={"appareil": APPAREIL, "repas": [repas(heure="02:30")]})
    ete = dt.datetime(2026, 10, 25, 2, 30, fold=0)
    hiver = dt.datetime(2026, 10, 25, 2, 30, fold=1)
    assert lancer(d.async_minute(ete)) == ["r1"]
    assert lancer(d.async_minute(hiver)) == [], "le meme repas est reparti une heure plus tard"
    assert len(d.hass.services.appels) == 1
    # Le lendemain, il repart.
    assert lancer(d.async_minute(dt.datetime(2026, 10, 26, 2, 30))) == ["r1"]


def test_un_depart_qui_casse_laisse_sa_ligne_et_n_arrete_pas_les_autres(creer, monkeypatch):
    d = creer(planning={"appareil": APPAREIL, "repas": [repas(id="a"), repas(id="b")]})
    vrai = d.async_lancer

    async def lancer_ou_casser(r, quand=None):
        if r["id"] == "a":
            raise RuntimeError("registre abime")
        return await vrai(r, quand)

    monkeypatch.setattr(d, "async_lancer", lancer_ou_casser)
    assert lancer(d.async_minute(LUNDI_0730)) == ["b"], "un repas qui casse a coupe les autres"
    assert ("retenu", "repas 07:30", "erreur au depart", 0) in journal(d), "un repas non servi sans un mot"


def test_le_tic_est_pose_meme_si_noter_les_manques_casse(creer, monkeypatch):
    """Une note de demarrage qui leve ne doit pas laisser le planning muet
    jusqu'au redemarrage suivant."""
    poses = []
    ev = sys.modules["homeassistant.helpers.event"]
    monkeypatch.setattr(ev, "async_track_time_change", lambda hass, rappel, **k: poses.append(k) or (lambda: None))
    d = creer(planning={"appareil": APPAREIL, "repas": [repas()]})

    async def casse(*a, **k):
        raise RuntimeError("journal illisible")

    monkeypatch.setattr(d, "async_noter_manques", casse)
    lancer(d._async_demarrer())
    assert poses == [{"second": 0}], "le tic n'est pas pose"


# ── Pas de « suivre » : une main ne retient jamais le repas suivant ─────────

def test_aucun_suivre_sur_la_commande(creer, monkeypatch):
    """Un repas saute, c'est la sante de l'animal : une ration donnee a la main
    depuis Home Assistant ne doit pas geler la commande 30 min."""
    d = creer(planning={"appareil": APPAREIL, "repas": [repas()]})
    suivis = []
    monkeypatch.setattr(d.regles, "suivre", lambda module, haids: suivis.append((module, list(haids))))
    ecoutes = []
    ev = sys.modules["homeassistant.helpers.event"]
    monkeypatch.setattr(ev, "async_track_state_change_event",
                        lambda hass, ids, rappel: ecoutes.append(list(ids)) or (lambda: None))
    lancer(d.async_enregistrer({"repas": [repas(), repas(id="r2", heure="19:00")]}))
    d._reabonner()
    assert suivis == [] and ecoutes == [], "la commande du distributeur est suivie : une main la gelerait"
    assert FEED not in set().union(*d.regles._pilotees.values()) if d.regles._pilotees else True
    # Et le depart passe : rien ne gele ce que personne ne suit.
    assert not d.regles.gele(FEED)
    assert lancer(d.async_lancer(d.cfg["repas"][0])) is True


def test_le_tic_n_est_pose_qu_avec_un_repas_actif(creer, monkeypatch):
    poses = []
    ev = sys.modules["homeassistant.helpers.event"]
    monkeypatch.setattr(ev, "async_track_time_change", lambda hass, rappel, **k: poses.append(k) or (lambda: None))
    d = creer(planning={"repas": [repas(actif=False)]})
    d._reabonner()
    assert poses == []
    d = creer(planning={"repas": [repas()]})
    d._reabonner()
    assert poses == [{"second": 0}]
    d.async_arreter()
    assert d._defait == []


# ── L'ecriture : sous le verrou, et le serveur tient la regle ──────────────

def test_ajouter_un_repas_sans_source(creer):
    d = creer()
    cfg = lancer(d.async_enregistrer({"repas": [repas()]}))
    assert cfg == {"appareil": APPAREIL, "repas": [repas()]}, "l'appareil du moment est retenu avec le planning"
    assert lancer(d.store.async_get_shared("loggia_distributeurs")) == cfg


def _nomme(refus):
    return str(refus.value).split(":", 1)[1].strip()


def test_ajouter_est_refuse_quand_une_automatisation_existe_meme_eteinte(creer):
    auto = auto_qui_distribue()
    d = creer(autos=[auto])
    eteindre(d, auto.entity_id)
    with pytest.raises(ValueError) as refus:
        lancer(d.async_enregistrer({"repas": [repas()]}))
    assert lancer(d.store.async_get_shared("loggia_distributeurs")) is None, "un ajout refuse a ete ecrit"
    # Un geste ordinaire le provoque (la fiche n'a pas encore vu l'automatisation
    # creee) : il porte son CODE et sa raison, l'ecran le dit dans sa langue —
    # pas le francais sans accents d'un `invalid_format` (contradicteur, 05/10).
    assert getattr(refus.value, "code", None) == "ajout_refuse" and _nomme(refus) == "source"


def test_ajouter_est_refuse_sans_commande(creer):
    d = creer(feeder={}, registre=[])
    with pytest.raises(ValueError) as refus:
        lancer(d.async_enregistrer({"repas": [repas()]}))
    assert getattr(refus.value, "code", None) == "ajout_refuse" and _nomme(refus) == "commande"


def test_la_raison_d_un_ajout_refuse(module):
    vide = module.sources(None, [], None)
    assert module.refus_ajout(vide, {"domaine": "select"}) is None
    assert module.refus_ajout(vide, None) == module.REFUS_COMMANDE
    # Une source presente l'emporte : c'est elle qu'il faut couper, pas la commande.
    assert module.refus_ajout(module.sources({"presente": True}, [], None), None) == module.REFUS_SOURCE


def test_un_repas_deja_la_se_coupe_et_se_supprime_meme_en_pause(creer):
    auto = auto_qui_distribue()
    d = creer(planning={"appareil": APPAREIL, "repas": [repas(), repas(id="r2", heure="19:00")]}, autos=[auto])
    cfg = lancer(d.async_enregistrer({"repas": [repas(actif=False)]}))
    assert cfg["repas"] == [repas(actif=False)]


def test_trop_de_repas_se_refuse_par_son_code(creer):
    d = creer()
    trop = [repas(id="r%d" % i) for i in range(13)]
    with pytest.raises(ValueError) as refus:
        lancer(d.async_enregistrer({"repas": trop}))
    assert getattr(refus.value, "code", None) == "trop_de_repas"
    assert str(refus.value).split(":", 1)[1].strip() == "12", "la limite doit etre NOMMEE"
    assert d.store._store.ecritures == 0


def test_un_repas_illisible_n_ecrit_rien(creer):
    d = creer()
    for patch in ({"repas": "r1"}, {"repas": [repas(heure="midi")]}, {"repas": [repas(), repas()]}):
        with pytest.raises(ValueError):
            lancer(d.async_enregistrer(patch))
    assert d.store._store.ecritures == 0


def test_un_rechargement_relit_sans_rien_changer(creer):
    d = creer(planning={"appareil": "dev_x", "repas": [repas()]})
    d.cfg = {"appareil": None, "repas": []}
    assert lancer(d.async_enregistrer({})) == {"appareil": "dev_x", "repas": [repas()]}
    assert d.cfg["repas"] == [repas()]


# ── Le redemarrage : rien n'est rattrape, tout est dit ──────────────────────

def test_un_repas_tombe_pendant_le_redemarrage_est_note_manque(creer):
    d = creer(planning={"appareil": APPAREIL, "repas": [repas(heure="07:30"), repas(id="r2", heure="06:00")]})
    assert lancer(d.async_noter_manques(dt.datetime(2026, 10, 5, 7, 45))) == ["r1"]
    assert d.hass.services.appels == [], "un repas manque ne se sert pas en retard (decision 4)"
    assert journal(d) == [("retenu", "repas 07:30", "manque au redemarrage", 0)]


def test_un_repas_parti_avant_un_rechargement_n_est_pas_manque(creer):
    d = creer(planning={"appareil": APPAREIL, "repas": [repas(heure="07:30")]})
    quand = dt.datetime(2026, 10, 5, 7, 30)
    d.regles._charge = True
    d.regles._entrees = [{"ts": quand.timestamp() + 2, "module": "distributeurs", "regle": "repas",
                          "quoi": "distribuer", "motif": "repas 07:30", "detail": "", "n": 1}]
    assert lancer(d.async_noter_manques(dt.datetime(2026, 10, 5, 7, 45))) == []
    # Celui d'HIER ne compte pas pour aujourd'hui.
    d.regles._entrees[0]["ts"] = quand.timestamp() - 86400
    assert lancer(d.async_noter_manques(dt.datetime(2026, 10, 5, 7, 45))) == ["r1"]


# ── Ce que l'ecran lit ──────────────────────────────────────────────────────

CLES_ETAT = {"source", "sources", "appareil", "programme", "automatisations", "planning", "peutPlanifier",
             "commande", "ancienne_liste", "notes", "journal"}


def test_l_etat_suit_le_contrat(creer):
    feeder = dict(FEEDER, meals=[{"time": "07:30", "label": "Matin", "auto": "automation.croquettes_matin"},
                                 {"time": "12:00", "label": "Midi", "auto": "input_boolean.repas_midi"}])
    d = creer(feeder=feeder, autos=[auto_qui_distribue(), alerte_qui_lit_le_bac()])
    etat = lancer(d.async_etat(Compte(admin=True)))
    assert set(etat) == CLES_ETAT
    assert etat["source"] == "automatisations"
    assert etat["sources"]["automatisations"] == {"presente": True, "active": True}
    assert etat["programme"]["source"] == "aqara" and etat["programme"]["mode"] == "manuel"
    assert [a["entity_id"] for a in etat["automatisations"]] == ["automation.croquettes_matin"], \
        "l'alerte qui lit le bac est ecartee"
    auto = etat["automatisations"][0]
    assert auto["heures"] == ["07:30"] and auto["indice"] is None and auto["modifiable"] is True
    assert etat["peutPlanifier"] is False
    assert etat["commande"] == {"domaine": "select", "quantite": False, "min": None, "max": None, "pas": None}
    assert etat["ancienne_liste"] == {"n": 2, "relies": 1, "non_relies": [{"heure": "12:00", "label": "Midi"}]}
    assert etat["planning"] == {"appareil": None, "repas": []}
    assert etat["appareil"]["device_id"] == APPAREIL


def test_l_etat_ne_porte_jamais_le_brut(creer):
    d = creer(autos=[auto_qui_distribue()])
    texte = json.dumps(lancer(d.async_etat(Compte(admin=False))))
    for brut in ("raw_config", "triggers", "actions", "select_option", '"option"', FEED):
        assert brut not in texte, brut + " sort dans l'etat ouvert a tout compte"


def test_un_compte_ordinaire_voit_ce_qu_il_peut_lire(creer):
    d = creer(autos=[auto_qui_distribue()])
    ordinaire = lancer(d.async_etat(Compte(admin=False)))
    assert ordinaire["automatisations"][0]["modifiable"] is False and "id_config" not in ordinaire["automatisations"][0]
    restreint = lancer(d.async_etat(Compte(lire=lambda eid: not eid.startswith("automation."),
                                           piloter=lambda eid: False)))
    assert restreint["automatisations"] == [], "une automatisation illisible pour ce compte est sortie"
    # Les sources restent celles de la maison : c'est sur elles que le serveur
    # retient un repas, l'ecran dit la meme chose.
    assert restreint["sources"]["automatisations"]["active"] is True and restreint["peutPlanifier"] is False
    pilote = lancer(d.async_etat(Compte(piloter=lambda eid: False)))
    assert pilote["automatisations"][0]["pilotable"] is False


def test_sans_rien_un_etat_vide_honnete(creer):
    d = creer(feeder={}, registre=[], etats={})
    etat = lancer(d.async_etat(None))
    assert set(etat) == CLES_ETAT
    assert etat["source"] is None and etat["commande"] is None and etat["appareil"] is None
    assert etat["peutPlanifier"] is False and etat["automatisations"] == []
    assert etat["ancienne_liste"] == {"n": 0, "relies": 0, "non_relies": []}


def test_le_planning_d_un_autre_appareil_est_signale(creer):
    d = creer(planning={"appareil": "dev_ancien", "repas": [repas()]})
    assert {"code": "distributeur_change"} in lancer(d.async_etat(None))["notes"]


def test_l_appareil_se_nomme_par_son_registre(creer, monkeypatch):
    fiche = types.SimpleNamespace(name="Distributeur", name_by_user="Croquettes du chat",
                                  manufacturer="Aqara", model="ZNCWWSQ01LM")
    reg = types.SimpleNamespace(async_get=lambda did: fiche if did == APPAREIL else None)
    monkeypatch.setattr(sys.modules["homeassistant.helpers.device_registry"], "async_get", lambda hass: reg,
                        raising=False)
    d = creer()
    assert lancer(d.async_etat(None))["appareil"] == {"device_id": APPAREIL, "nom": "Croquettes du chat",
                                                      "fabricant": "Aqara", "modele": "ZNCWWSQ01LM"}


# ── Le journal se lit dans les sept langues ─────────────────────────────────

MOTS_DU_JOURNAL = ("repas {heure}", "distribuer", "retenu", "commande inconnue", "distributeur injoignable",
                   "autre source", "distributeur change", "manque au redemarrage", "erreur au depart")


def test_chaque_mot_du_journal_a_sa_cle_dans_chaque_langue():
    """L'ecran traduit le journal par la CLE francaise que le serveur ecrit
    (journalmots.js). Un mot sans cle s'affiche en francais sans accents dans
    les six autres langues — et rien ne le verifiait pour les mots du serveur
    (contradicteur, 05/10). Rouge tant que les catalogues ne les portent pas."""
    from conftest import COMPOSANT, RACINE

    source = (COMPOSANT / "distributeurs.py").read_text(encoding="utf-8")
    for mot in MOTS_DU_JOURNAL:
        assert '"%s"' % mot in source, "plus ecrit par distributeurs.py, a retirer d'ici : " + mot
    manquants = []
    for langue in ("en", "de", "nl", "it", "es", "pl"):
        catalogue = (RACINE / "src" / "langues" / (langue + ".js")).read_text(encoding="utf-8")
        manquants += ["%s : %s" % (langue, mot) for mot in MOTS_DU_JOURNAL
                      if ("'%s':" % mot) not in catalogue and ('"%s":' % mot) not in catalogue]
    assert manquants == [], "sans cle, ces mots s'affichent en francais : " + ", ".join(manquants)


# ── Tuya officielle : seulement fiche ouverte, ou au depart ─────────────────

def _tuya(creer, reponse):
    registre = [Entree("number.cwwsq_feed", "dev_t", "tuya", "feed")]
    etats = {"number.cwwsq_feed": ("0", {"min": 1, "max": 20, "step": 1})}
    services = FauxServices(presents={"tuya.get_feeder_meal_plan"}, tuya=reponse)
    return creer(feeder={"appareil": "dev_t"}, etats=etats, registre=registre, services=services,
                 planning={"appareil": "dev_t", "repas": [repas()]})


PLAN_TUYA = {"meal_plan": [{"days": ["monday", "tuesday"], "time": "08:00", "portion": 1, "enabled": True}]}


def test_tuya_n_est_appele_qu_avec_detail(creer):
    d = _tuya(creer, PLAN_TUYA)
    sondage = lancer(d.async_etat(None))
    assert d.hass.services.appels == [], "le sondage de la carte a interroge Tuya"
    assert sondage["programme"]["note"] == "a_lire"
    fiche = lancer(d.async_etat(None, detail=True))
    assert d.hass.services.appels == [("tuya", "get_feeder_meal_plan", {"device_id": "dev_t"})]
    assert fiche["programme"]["lisible"] is True and fiche["programme"]["active"] is True
    lancer(d.async_etat(None, detail=True))
    assert len(d.hass.services.appels) == 1, "le cache de 10 min n'a pas servi"


def test_tuya_est_relu_au_depart(creer):
    d = _tuya(creer, PLAN_TUYA)
    assert lancer(d.async_lancer(d.cfg["repas"][0])) is False, "un programme Tuya actif retient le repas"
    assert journal(d)[0][2] == "autre source"
    assert ("tuya", "get_feeder_meal_plan", {"device_id": "dev_t"}) in d.hass.services.appels


def test_une_erreur_tuya_n_est_pas_une_panne(creer):
    d = _tuya(creer, None)

    async def casse(*a, **k):
        raise RuntimeError("device_not_support_meal_plan")

    d.hass.services.async_call = casse
    etat = lancer(d.async_etat(None, detail=True))
    assert etat["programme"]["note"] == "non_lisible" and etat["programme"]["active"] is False


# ── Relecture du 05/10 : ce que les sondes du serveur ont prouve ───────────

def test_une_erreur_tuya_ne_reste_pas_en_cache_au_depart(creer):
    """Sonde de relecture (05/10) : la fiche s'ouvre pendant une panne du nuage
    Tuya, l'ERREUR restait 10 min en cache ; le service revient avec un
    programme actif, le depart ne le relisait pas et le repas de Loggia partait
    a cote de celui de l'appareil — une double ration. Le depart relit."""
    d = _tuya(creer, PLAN_TUYA)
    vrai = d.hass.services.async_call

    async def muet(*a, **k):
        raise TimeoutError("nuage Tuya muet")

    d.hass.services.async_call = muet
    lancer(d.async_etat(None, detail=True))
    d.hass.services.async_call = vrai  # le nuage revient
    assert lancer(d.async_lancer(d.cfg["repas"][0])) is False, "parti a cote du programme de l'appareil"
    assert journal(d)[0][2] == "autre source"
    assert [a for a in d.hass.services.appels if a[0] == "number"] == [], "une ration est partie"


def test_le_depart_relit_tuya_meme_une_reponse_recente(creer):
    """Une reponse LUE il y a quelques minutes (« aucun programme ») ne vaut
    plus au depart : l'ADR 0155 le veut relu, c'est la que se joue la double
    ration."""
    d = _tuya(creer, {"meal_plan": []})
    lancer(d.async_etat(None, detail=True))
    d.hass.services.tuya = PLAN_TUYA  # programme active depuis l'application
    assert lancer(d.async_lancer(d.cfg["repas"][0])) is False
    assert journal(d)[0][2] == "autre source"


def test_une_erreur_tuya_se_relit_apres_une_minute(creer, module):
    """Pendant une panne, la fiche ouverte (sondage de 15 s) ne martele pas le
    nuage ; une minute apres, elle reessaie — pas dix."""
    d = _tuya(creer, PLAN_TUYA)
    vrai = d.hass.services.async_call
    essais = []

    async def muet(*a, **k):
        essais.append(a)
        raise TimeoutError("nuage Tuya muet")

    d.hass.services.async_call = muet
    lancer(d.async_etat(None, detail=True))
    lancer(d.async_etat(None, detail=True))
    assert len(essais) == 1, "une panne relue a chaque sondage"
    horodatage, reponse = d._tuya["dev_t"]
    d._tuya["dev_t"] = (horodatage - 61, reponse)
    d.hass.services.async_call = vrai
    fiche = lancer(d.async_etat(None, detail=True))
    assert fiche["programme"]["active"] is True, "l'erreur est restee en cache au-dela d'une minute"


def test_un_compte_ordinaire_ne_coute_pas_un_second_parcours(creer, monkeypatch):
    """Sonde de relecture (05/10) : `async_etat` parcourait toutes les
    automatisations DEUX fois pour un compte ordinaire (ses droits, puis ceux
    de la maison) — jusqu'a 0,7 s dans la boucle d'evenements sur une grosse
    maison, a chaque sondage. Une fois suffit : les droits du compte filtrent
    ce que la maison a calcule."""
    d = creer(autos=[auto_qui_distribue(), alerte_qui_lit_le_bac()])
    auto = sys.modules["homeassistant.components.automation"]
    vrai = auto.automations_with_entity
    appels = []
    monkeypatch.setattr(auto, "automations_with_entity", lambda h, eid: appels.append(eid) or vrai(h, eid))
    admin = lancer(d.async_etat(Compte(admin=True)))
    par_admin, appels[:] = len(appels), []
    ordinaire = lancer(d.async_etat(Compte(admin=False)))
    assert len(appels) == par_admin, "le compte ordinaire paie un second parcours"
    assert [a["entity_id"] for a in ordinaire["automatisations"]] == [a["entity_id"] for a in admin["automatisations"]]
    assert ordinaire["automatisations"][0]["modifiable"] is False and "id_config" not in ordinaire["automatisations"][0]
    assert admin["automatisations"][0]["id_config"] == "1700000000001"
    assert ordinaire["sources"] == admin["sources"]
    # Et pas un parcours de trop, ni pour l'un ni pour l'autre.
    parcours = []
    vrai_parcours = d._automatisations
    monkeypatch.setattr(d, "_automatisations", lambda *a: parcours.append(1) or vrai_parcours(*a))
    for compte in (Compte(admin=False), Compte(admin=True), Compte(lire=lambda eid: False), None):
        parcours.clear()
        lancer(d.async_etat(compte))
        assert len(parcours) == 1, "un etat a parcouru les automatisations plus d'une fois"


class _Paris(dt.tzinfo):
    """Europe/Paris autour du 25/10/2026, ecrit a la main (pas de tzdata sous
    Windows) : 02:00-03:00 se repete, fold=0 en CEST puis fold=1 en CET."""

    def utcoffset(self, x):
        naif = x.replace(tzinfo=None)
        if naif < dt.datetime(2026, 10, 25, 2, 0):
            return dt.timedelta(hours=2)
        if naif >= dt.datetime(2026, 10, 25, 3, 0):
            return dt.timedelta(hours=1)
        return dt.timedelta(hours=1 if x.fold else 2)

    def dst(self, x):
        return self.utcoffset(x) - dt.timedelta(hours=1)

    def tzname(self, x):
        return "CET" if self.utcoffset(x) == dt.timedelta(hours=1) else "CEST"


PARIS = _Paris()


def _servi(d, quand, heure="02:30"):
    """Le journal tel que l'instance d'avant le redemarrage l'a laisse."""
    d.regles._charge = True
    d.regles._entrees = [{"ts": quand.timestamp() + 1, "module": "distributeurs", "regle": "repas",
                          "quoi": "distribuer", "cibles": [FEED], "n": 1, "motif": "repas " + heure,
                          "detail": "", "simule": False}]


def test_heure_d_hiver_un_redemarrage_ne_ressert_pas_le_repas(creer):
    """Sonde de relecture (05/10) : le dedoublonnage de l'heure repetee ne
    vivait qu'en memoire. Servi a 02:30 CEST, Home Assistant redemarre (ou
    l'integration se recharge) avant 02:30 CET : la nouvelle instance le
    servait une seconde fois. Le journal, lui, a survecu."""
    d = creer(planning={"appareil": APPAREIL, "repas": [repas(heure="02:30")]})
    _servi(d, dt.datetime(2026, 10, 25, 2, 30, tzinfo=PARIS, fold=0))
    hiver = dt.datetime(2026, 10, 25, 2, 30, tzinfo=PARIS, fold=1)
    assert lancer(d.async_minute(hiver)) == [], "servi deux fois la nuit du passage a l'heure d'hiver"
    assert d.hass.services.appels == []


def test_heure_d_hiver_un_repas_jamais_tente_part_a_la_seconde_occurrence(creer):
    """Le journal ne retient que ce qui a ete TENTE a la premiere occurrence :
    sans ligne ce jour-la, le repas de 02:30 CET part (il n'a pas ete servi)."""
    d = creer(planning={"appareil": APPAREIL, "repas": [repas(heure="02:30")]})
    _servi(d, dt.datetime(2026, 10, 24, 2, 30, tzinfo=PARIS))  # la veille : ne compte pas
    assert lancer(d.async_minute(dt.datetime(2026, 10, 25, 2, 30, tzinfo=PARIS, fold=1))) == ["r1"]


def test_heure_d_hiver_la_ligne_d_un_autre_repas_ne_retient_pas(creer):
    """Contradicteur de C2 (05/10), mutation « sans motif » qui survivait : a
    l'heure repetee, seule une ligne de CE repas le retient. Le repas de 02:30,
    ajoute a 02:40 CEST, n'a jamais ete tente ; celui de 02:45 est parti a
    02:45 CEST ; Home Assistant redemarre a 02:10 CET — a 02:30 CET, le repas
    de 02:30 part, la ligne de 02:45 ne dit rien de lui."""
    d = creer(planning={"appareil": APPAREIL, "repas": [repas(id="a", heure="02:30"), repas(id="b", heure="02:45")]})
    _servi(d, dt.datetime(2026, 10, 25, 2, 45, tzinfo=PARIS, fold=0), heure="02:45")
    assert lancer(d.async_minute(dt.datetime(2026, 10, 25, 2, 30, tzinfo=PARIS, fold=1))) == ["a"]


def test_deux_repas_a_la_meme_heure_partent_tous_les_deux(creer):
    """Un jour ordinaire, le journal n'est pas consulte : deux repas a 07:30
    (identifiants differents) partent l'un et l'autre."""
    d = creer(planning={"appareil": APPAREIL, "repas": [repas(id="a"), repas(id="b", portions=1)]})
    _servi(d, dt.datetime(2026, 10, 5, 7, 29, tzinfo=PARIS), heure="07:30")
    assert lancer(d.async_minute(dt.datetime(2026, 10, 5, 7, 30, tzinfo=PARIS))) == ["a", "b"]


def test_l_heure_repetee_n_ecrit_pas_un_manque_a_tort(creer):
    """Sonde de relecture (05/10) : servi a 02:30 CEST, redemarrage fini a 02:40
    CET ; `depuis` prenait la SECONDE occurrence de 02:30 et la ligne
    « distribuer » passait pour anterieure — « manque au redemarrage » a tort."""
    d = creer(planning={"appareil": APPAREIL, "repas": [repas(heure="02:30")]})
    _servi(d, dt.datetime(2026, 10, 25, 2, 30, tzinfo=PARIS, fold=0))
    assert lancer(d.async_noter_manques(dt.datetime(2026, 10, 25, 2, 40, tzinfo=PARIS, fold=1))) == []


def test_un_journal_de_bord_qui_nomme_la_commande_ne_retient_rien(creer):
    """Sonde de relecture (05/10) : `logbook.log` avec l'entity_id de la
    commande NOMME le distributeur sans le commander ; il retenait tous les
    repas de Loggia (« autre source ») — un repas saute."""
    trace = FausseAutomatisation(
        "automation.trace", {"id": "9", "alias": "Trace",
                             "triggers": [{"trigger": "state", "entity_id": "input_number.croquettes_reservoir"}],
                             "actions": [{"action": "logbook.log",
                                          "data": {"name": "Bac", "message": "bas", "entity_id": FEED}}]},
        references={"entities": [FEED]}, action_script={"referenced_entities": [FEED]})
    d = creer(planning={"appareil": APPAREIL, "repas": [repas()]}, autos=[trace])
    assert lancer(d.async_lancer(d.cfg["repas"][0])) is True, "un journal de bord a retenu le repas"


def test_le_journal_ne_montre_pas_la_commande_a_qui_ne_peut_pas_la_lire(creer):
    """Sonde de relecture (05/10) : l'etat ouvert a tout compte portait
    l'entity_id de la commande dans `journal[].cibles`, alors que
    `_commande_publique` le tait. Le compte la voit si ses droits la lui
    laissent lire ; sinon, le nombre reste, pas le nom."""
    d = creer(planning={"appareil": APPAREIL, "repas": [repas()]})
    assert lancer(d.async_lancer(d.cfg["repas"][0])) is True
    restreint = lancer(d.async_etat(Compte(lire=lambda eid: eid != FEED)))
    assert FEED not in json.dumps(restreint), "la commande sort dans le journal d'un compte qui ne la lit pas"
    assert restreint["journal"][0]["n"] == 1 and restreint["journal"][0]["cibles"] == []
    # Le journal lui-meme n'est pas touche : l'administrateur le voit entier.
    assert lancer(d.async_etat(Compte(admin=True)))["journal"][0]["cibles"] == [FEED]


def test_ajouter_est_refuse_a_cote_d_un_programme_tuya_actif(creer):
    """Mutation M08 (relecture du 05/10) : l'ecriture doit lire les sources
    AVEC Tuya — sans `detail`, l'ajout passait a cote d'un programme actif."""
    d = _tuya(creer, PLAN_TUYA)
    with pytest.raises(ValueError) as refus:
        lancer(d.async_enregistrer({"repas": [repas(), repas(id="r2", heure="19:00")]}))
    assert getattr(refus.value, "code", None) == "ajout_refuse" and _nomme(refus) == "source"


def test_le_demarrage_note_les_repas_manques(creer, monkeypatch):
    """Mutation M10 (relecture du 05/10) : la decision 4 au DEMARRAGE — un repas
    tombe pendant le redemarrage est note, et rien n'est servi."""
    ev = sys.modules["homeassistant.helpers.event"]
    monkeypatch.setattr(ev, "async_track_time_change", lambda hass, rappel, **k: (lambda: None))
    d = creer(planning={"appareil": APPAREIL, "repas": [repas(heure="07:30")]})
    monkeypatch.setattr(d, "_maintenant", lambda: dt.datetime(2026, 10, 5, 7, 45))
    lancer(d._async_demarrer())
    assert journal(d) == [("retenu", "repas 07:30", "manque au redemarrage", 0)]
    assert d.hass.services.appels == []


def test_deja_vu_se_juge_repas_par_repas(creer):
    """Mutation M29 (relecture du 05/10) : la ligne de 07:30 ne dit rien de
    07:20 — sans le motif, 07:20 manque passait pour vu."""
    d = creer(planning={"appareil": APPAREIL, "repas": [repas(id="a", heure="07:20"), repas(id="b", heure="07:30")]})
    _servi(d, dt.datetime(2026, 10, 5, 7, 30), heure="07:30")
    assert lancer(d.async_noter_manques(dt.datetime(2026, 10, 5, 7, 45))) == ["a"]


def test_la_fenetre_des_manques_fait_trente_minutes_pile(module):
    """Mutation M11 (relecture du 05/10) : la borne est epinglee — un repas
    pile 30 min avant est note, 30 min et une seconde ne l'est plus."""
    planning = {"repas": [repas(heure="07:00")]}
    assert [r["id"] for r, _ in module.repas_manques(planning, dt.datetime(2026, 10, 5, 7, 30))] == ["r1"]
    assert module.repas_manques(planning, dt.datetime(2026, 10, 5, 7, 30, 1)) == []


def test_un_distributeur_decrit_dans_l_ancien_loggia_entities(creer):
    """Relecture « donnees » (05/10) : l'ecran lit `loggia_feeder`, a defaut
    `loggia_entities.feeder` (loggiaEnt) ; le serveur ne lisait que le premier
    — ni commande, ni automatisation reconnue pour une configuration heritee."""
    d = creer(feeder=None, partage_en_plus={"loggia_entities": {"feeder": FEEDER}},
              planning={"appareil": APPAREIL, "repas": [repas()]})
    assert lancer(d.async_lancer(d.cfg["repas"][0])) is True
    assert d.hass.services.appels == [("select", "select_option", {"entity_id": [FEED], "option": "START"})]
    # Une description VIDEE volontairement reste vide, comme a l'ecran.
    d = creer(feeder={}, partage_en_plus={"loggia_entities": {"feeder": FEEDER}},
              planning={"appareil": APPAREIL, "repas": [repas()]})
    assert lancer(d.async_lancer(d.cfg["repas"][0])) is False
    assert journal(d) == [("retenu", "repas 07:30", "commande inconnue", 0)]


# ── Le contrat partage avec l'ecran (tests/fixtures/distributeurs.json) ─────

def _contrat():
    from conftest import RACINE

    return json.loads((RACINE / "tests" / "fixtures" / "distributeurs.json").read_text(encoding="utf-8"))["contrat"]


def test_le_contrat_de_l_ecran_est_celui_du_serveur(module, creer):
    """Relecture « tests » (05/10) : le bloc `contrat` n'etait lu que par le JS,
    le Python gardait ses copies (CLES_ETAT, CLES_ELEMENT). Une cle renommee au
    serveur laissait l'ecran se tester sur l'ancienne forme."""
    from test_automatisations import CLES_ELEMENT

    c = _contrat()
    etat = c["etat_exemple"]
    assert set(etat) - {"_note"} == CLES_ETAT
    for a in etat["automatisations"]:
        assert set(a) == CLES_ELEMENT | ({"id_config"} if a["modifiable"] else set()), a["entity_id"]
    assert set(etat["commande"]) == set(module._commande_publique({"domaine": "select"}))
    assert module.normaliser(c["loggia_distributeurs"]) == c["loggia_distributeurs"]
    for r in c["config_patch_exemple"]["patch"]["repas"]:
        assert module.normaliser_repas(r) == r
    assert c["config_patch_exemple"]["type"] == "loggia/distributeurs/config"
    # L'ancienne liste de l'exemple est bien celle que le serveur compterait.
    assert module.ancienne_liste(c["loggia_feeder"]) == etat["ancienne_liste"]
    # Une ligne de journal a la forme de celle que le serveur ecrit.
    d = creer(feeder={}, registre=[], planning={"repas": [repas()]})
    lancer(d.async_lancer(d.cfg["repas"][0]))
    (ligne,) = lancer(d.regles.journal(module="distributeurs"))
    assert set(ligne) == set(etat["journal"][0])


class _ParisPrintemps(dt.tzinfo):
    """Europe/Paris autour du 29/03/2026, ecrit a la main : 02:00-03:00
    n'existe pas (CET +1, puis CEST +2 a 01:00 UTC)."""

    BASCULE = dt.datetime(2026, 3, 29, 1, 0)  # en UTC

    def utcoffset(self, x):
        # Une heure du trou se lit avec le decalage d'avant, comme zoneinfo.
        return dt.timedelta(hours=1 if x.replace(tzinfo=None) < dt.datetime(2026, 3, 29, 3, 0) else 2)

    def dst(self, x):
        return self.utcoffset(x) - dt.timedelta(hours=1)

    def fromutc(self, x):
        naif = x.replace(tzinfo=None)
        return (naif + dt.timedelta(hours=1 if naif < self.BASCULE else 2)).replace(tzinfo=self)


@pytest.mark.xfail(strict=True, raises=AssertionError, reason="limite connue (en tete de distributeurs.py) : "
                   "noter le repas saute demande un mot de journal et six catalogues")
def test_heure_d_ete_un_repas_du_trou_laisse_une_ligne(creer):
    """Contradicteur de C2 (05/10) : la nuit du passage a l'heure d'ete, le tic
    de 03:00 CEST suit celui de 01:59 CET — UNE minute en temps reel. La
    detection proposee (« plus de 61 s ecoulees en UTC ») ne verrait donc
    jamais le trou : il faut comparer l'HEURE MURALE du tic a celle de la
    minute reelle precedente (61 min d'ecart au lieu d'une). Le jour ou ce
    test passe, retirer le `xfail`."""
    printemps = _ParisPrintemps()
    d = creer(planning={"appareil": APPAREIL, "repas": [repas(heure="02:30")]})
    lancer(d.async_minute(dt.datetime(2026, 3, 29, 1, 59, tzinfo=printemps)))
    lancer(d.async_minute(dt.datetime(2026, 3, 29, 3, 0, tzinfo=printemps)))
    assert [ligne[1] for ligne in journal(d)] == ["repas 02:30"], "un repas du trou ne laisse aucune ligne"
