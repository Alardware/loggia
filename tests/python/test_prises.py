"""Les prises : la configuration, l'etat, le cycle de l'electromenager et sa fin (chantier Prises, spec 5 et 6).

Ce qui merite d'etre verrouille : le serveur reconnait les prises comme
l'ecran (spec 6.4) ; `protegees` arrive entiere ; deux reglages partis
ensemble restent tous les deux ; un cycle commence apres une minute au-dessus
de 15 W et finit apres dix minutes a 5 W ou moins, date a la baisse ; il
survit au redemarrage ; sa fin previent, si on l'a demande, comme le reste de
la maison.

Le temps est simule : `time.time` et `dt_util.now` suivent une horloge que le
test avance, et les echeances (`async_call_later`) sonnent quand il le dit.
Le banc sert aux taches 2 a 6 du plan.
"""
from __future__ import annotations

import asyncio
import logging
import sys
import time
import types
from datetime import datetime

import pytest

from conftest import FauxStore, charger
from test_chauffage import FuseauParis

PARIS = FuseauParis()
LV, NAS, SEJOUR, POELE = "switch.prise_lave_vaisselle", "switch.prise_nas", "switch.prise_sejour", "switch.poele"
LV_W, LV_KWH = "sensor.prise_lave_vaisselle_power", "sensor.prise_lave_vaisselle_energy"
NODON = ["comfort", "eco", "frost_protection", "off", "comfort_-1", "comfort_-2"]


def lancer(coro):
    return asyncio.run(coro)


def paris(h, mi=0, s=0, jour=13):
    """Un instant d'octobre 2026 a Paris (le 13 est un mardi), en secondes depuis 1970."""
    return datetime(2026, 10, jour, h, mi, s, tzinfo=PARIS).timestamp()


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
        return [h for h in self.table if h.startswith(domaine + ".")]


class FauxServices:
    def __init__(self):
        self.appels = []

    def has_service(self, domaine, service):
        return service == "mobile"

    async def async_call(self, domaine, service, data, blocking=False, context=None):
        self.appels.append((domaine, service, dict(data)))


class FauxHass:
    def __init__(self, etats):
        self.states = FauxEtats(etats)
        self.services = FauxServices()
        self.config = types.SimpleNamespace(language="fr")
        self.taches = []

    def async_create_task(self, coro):
        self.taches.append(coro)
        return coro

    def executer(self):
        while self.taches:
            lancer(self.taches.pop(0))

    def abandonner(self):
        taches, self.taches = self.taches, []
        for coro in taches:
            coro.close()


def entree(entity_id, classe=None, categorie=None, unique_id=None):
    """Une entree du registre des entites, comme Home Assistant la tient."""
    return types.SimpleNamespace(entity_id=entity_id, device_id=None, device_class=None,
                                 original_device_class=classe, entity_category=categorie, name=None,
                                 original_name=None, platform="mqtt", unique_id=unique_id, disabled_by=None)


class Registres:
    """Les deux registres de Home Assistant : les entites, les appareils."""

    def __init__(self):
        self.entities = {}
        self.devices = {}

    def appareil(self, ident, fabricant, modele, *entrees):
        self.devices[ident] = types.SimpleNamespace(id=ident, manufacturer=fabricant, model=modele)
        for e in entrees:
            e.device_id = ident
            self.entities[e.entity_id] = e


def maison():
    """Sa maison, a peu pres (spec 0) : (registres, etats). Les prises Zigbee qui
    mesurent, le seul `power` du sejour, le poele pose sur l'appareil de
    l'energie de la maison, le pont, la sirene, un module fil pilote, une
    lumiere declaree, un interrupteur sans appareil, une prise hors registre."""
    reg = Registres()
    prise = ("Tuya", "Smart plug (with power monitoring)")
    reg.appareil("d-lv", *prise, entree(LV), entree(LV_W, "power"), entree(LV_KWH, "energy"),
                 entree("switch.prise_lave_vaisselle_child_lock", categorie="config"))
    reg.appareil("d-nas", *prise, entree(NAS), entree("sensor.prise_nas_power", "power"),
                 entree("sensor.prise_nas_energy", "energy"))
    reg.appareil("d-sejour", "Legrand", "NLP", entree(SEJOUR), entree("sensor.prise_sejour_puissance", "power"))
    reg.appareil("d-maison", "Home Assistant", "Passerelle MQTT", entree(POELE),
                 entree("sensor.energie_puissance_kw", "power"), entree("sensor.solaire_production_totale", "power"),
                 entree("sensor.energie_consommation_jour", "energy"), entree("sensor.solaire_energie_totale", "energy"))
    reg.appareil("d-pont", "Zigbee2MQTT", "Bridge", entree("switch.zigbee2mqtt_bridge_permit_join"))
    reg.appareil("d-sirene", "Heiman", "Smart siren", entree("switch.alarme_sirene_siren_on"),
                 entree("sensor.alarme_sirene_power", "power"))
    reg.appareil("d-rad", "NodOn", "SIN-4-FP-21", entree("switch.radiateur_chambre"),
                 entree("select.radiateur_chambre_pilot_wire_mode", unique_id="0x00158d00_pilot_wire_mode_zigbee2mqtt"),
                 entree("sensor.radiateur_chambre_power", "power"))
    reg.appareil("d-ext", *prise, entree("switch.lumiere_exterieur"), entree("sensor.lumiere_exterieur_power", "power"))
    reg.entities["switch.radiateur_salon"] = entree("switch.radiateur_salon")
    noms = {LV: "Prise lave-vaisselle", NAS: "Prise NAS", SEJOUR: "Prise séjour", POELE: "Poêle",
            "switch.zigbee2mqtt_bridge_permit_join": "Zigbee2MQTT Bridge Permit join",
            "switch.alarme_sirene_siren_on": "Alarme sirène Siren on", "switch.radiateur_chambre": "Radiateur Chambre",
            "switch.lumiere_exterieur": "Lumière extérieur", "switch.radiateur_salon": "Radiateur salon",
            "switch.prise_garage": "Prise garage"}
    etats = {h: FauxEtat("on", {"friendly_name": n}) for h, n in noms.items()}
    etats["switch.prise_garage"].attributes["device_class"] = "outlet"
    for e in reg.entities.values():
        if e.entity_id.startswith("sensor."):
            unite = {"power": "W", "energy": "kWh"}[e.original_device_class]
            etats[e.entity_id] = FauxEtat("0", {"friendly_name": e.entity_id[7:].replace("_", " "),
                                                "unit_of_measurement": unite})
    etats["select.radiateur_chambre_pilot_wire_mode"] = FauxEtat("comfort", {"options": NODON})
    return reg, etats


class Horloge:
    def __init__(self, t):
        self.t = t

    def __call__(self):
        return self.t


class Rendezvous:
    """`async_call_later` : retient chaque echeance, qui sonne quand le test le dit."""

    def __init__(self, horloge):
        self.horloge = horloge
        self.poses = []

    def __call__(self, hass, delai, rappel):
        e = {"quand": self.horloge.t + delai, "rappel": rappel, "annule": False}
        self.poses.append(e)

        def annuler():
            e["annule"] = True
        return annuler

    def armees(self):
        """Les echeances des prises encore armees (le journal pose les siennes, a 20 s)."""
        return sorted((e for e in self.poses if not e["annule"] and e["rappel"].__name__ == "sonne"),
                      key=lambda e: e["quand"])


class DepotDiffere(FauxStore):
    """Le `Store` de Home Assistant, avec son ecriture differee
    (`async_delay_save`) : la donnee se lit A L'ECRITURE, par la fonction
    donnee, et une ecriture immediate (`async_save`) remplace celle qui
    attendait. Elle part quand le test le dit (`ecrire_differee`) — le delai
    passe, ou Home Assistant s'arrete (son `final_write`)."""

    def __init__(self, depart=None):
        super().__init__(depart)
        self.differee, self.delai, self.differees = None, None, 0

    def async_delay_save(self, donnees, delai=0):
        self.differee, self.delai = donnees, delai
        self.differees += 1

    async def async_save(self, data):
        self.differee = None
        await super().async_save(data)

    def ecrire_differee(self):
        donnees, self.differee = self.differee, None
        lancer(FauxStore.async_save(self, donnees()))


class Banc:
    """Le module des prises dans sa maison, et le temps que le test fait passer."""

    def __init__(self, p, horloge, rdv, ecoutes, depot, rapports=()):
        self.p, self.horloge, self.rdv, self.ecoutes, self.depot = p, horloge, rdv, ecoutes, depot
        self.rapports = rapports

    def attendre(self, t):
        """Le temps passe jusqu'a `t` : chaque echeance due sonne, dans l'ordre."""
        while self.rdv.armees() and self.rdv.armees()[0]["quand"] <= t:
            e = self.rdv.armees()[0]
            self.horloge.t = max(self.horloge.t, e["quand"])
            e["annule"] = True
            e["rappel"](None)
            self.p.hass.executer()
        self.horloge.t = max(self.horloge.t, t)

    def mesurer(self, t, w, capteur=LV_W, unite="W"):
        """La prise publie `w` a l'instant `t` (« unavailable » se publie aussi)."""
        self.attendre(t)
        ecoute = [rappel for _, rappel in self.ecoutes if rappel.__name__ == "_sur_puissance"][-1]
        ecoute(types.SimpleNamespace(data={"entity_id": capteur,
                                           "new_state": FauxEtat(str(w), {"unit_of_measurement": unite})}))
        self.p.hass.executer()

    def rapporter(self, t, w, capteur=LV_W, unite="W"):
        """La prise publie de nouveau la MEME valeur a l'instant `t` : Home
        Assistant n'en fait plus un `state_changed`, mais un `state_reported`
        (2024.4), de memes donnees (`entity_id`, `new_state`)."""
        self.attendre(t)
        self.rapports[-1][1](types.SimpleNamespace(data={
            "entity_id": capteur, "new_state": FauxEtat(str(w), {"unit_of_measurement": unite})}))
        self.p.hass.executer()

    def etat(self):
        return lancer(self.p.async_etat())

    def journal(self):
        return [(e["quoi"], e["motif"]) for e in lancer(self.p.regles.journal(module="prises"))]


@pytest.fixture
def horloge(monkeypatch):
    """`time.time` et `dt_util.now` sur une horloge que le test avance : le mardi
    13/10/2026 a 13:30, a Paris."""
    h = Horloge(paris(13, 30))
    monkeypatch.setattr(time, "time", h)
    monkeypatch.setattr(sys.modules["homeassistant.util.dt"], "now", lambda: datetime.fromtimestamp(h.t, PARIS))
    return h


@pytest.fixture
def creer(monkeypatch, store_module, horloge):
    """Fabrique le module des prises dans sa maison, demarre comme Home Assistant
    le demarre. `config` : `loggia_prises` ; `memoire` : `.storage/loggia_prises_etat` ;
    `partage` : d'autres cles communes ; `registres`, `etats` : une autre maison."""
    module, regles_module = charger("prises"), charger("regles")
    faits = []

    def fabrique(config=None, memoire=None, partage=None, registres=None, etats=None):
        reg, etats_maison = maison()
        reg, etats = registres or reg, etats if etats is not None else etats_maison
        ev = sys.modules["homeassistant.helpers.event"]
        monkeypatch.setattr(sys.modules["homeassistant.helpers.entity_registry"], "async_get", lambda _h: reg)
        monkeypatch.setattr(sys.modules["homeassistant.helpers.device_registry"], "async_get", lambda _h: reg)
        depot = DepotDiffere(memoire)
        monkeypatch.setattr(sys.modules["homeassistant.helpers.storage"], "Store", lambda _h, _v, _c: depot)
        rdv, ecoutes, rapports = Rendezvous(horloge), [], []
        monkeypatch.setattr(ev, "async_call_later", rdv, raising=False)
        monkeypatch.setattr(ev, "async_track_state_change_event",
                            lambda _h, ids, rappel: ecoutes.append((list(ids), rappel)) or (lambda: None),
                            raising=False)
        # La meme valeur publiee de nouveau (`state_reported`) : retenue a part,
        # pour qu'un test la publie (`Banc.rapporter`).
        monkeypatch.setattr(ev, "async_track_state_report_event",
                            lambda _h, ids, rappel: rapports.append((list(ids), rappel)) or (lambda: None),
                            raising=False)
        commun = {"loggia_prises": config or {}, "loggia_switchlights": ["switch.lumiere_exterieur"],
                  **(partage or {})}
        magasin = store_module.LoggiaStore.__new__(store_module.LoggiaStore)
        magasin._store = FauxStore({"users": {}, "shared": commun, "migrated": True})
        magasin._ancien = FauxStore(None)
        magasin._data = None
        magasin._lock = asyncio.Lock()
        hass = FauxHass(etats)
        regles = regles_module.Regles(hass, magasin)
        regles._depot = FauxStore(None)
        b = Banc(module.LoggiaPrises(hass, magasin, regles), horloge, rdv, ecoutes, depot, rapports)
        hass.executer()
        faits.append(b)
        return b

    yield fabrique
    for b in faits:
        b.p.hass.abandonner()


# ── Les prises de la maison, vues par le serveur (spec 6.4) ─────────────────

def test_le_serveur_reconnait_les_prises_comme_l_ecran(creer):
    """Ni le pont, ni la sirene, ni le module fil pilote, ni la lumiere declaree,
    ni la configuration, ni l'interrupteur sans appareil ni mesure. Le poele non
    plus : son appareil porte l'energie de toute la maison, et aucun de ses
    capteurs ne partage un mot avec lui. Hors registre, la classe outlet suffit."""
    assert creer().p.prises == {
        LV: {"nom": "Prise lave-vaisselle", "puissance": LV_W, "energie": LV_KWH},
        NAS: {"nom": "Prise NAS", "puissance": "sensor.prise_nas_power", "energie": "sensor.prise_nas_energy"},
        SEJOUR: {"nom": "Prise séjour", "puissance": "sensor.prise_sejour_puissance", "energie": None},
        "switch.prise_garage": {"nom": "Prise garage", "puissance": None, "energie": None},
    }


def test_les_lumieres_declarees_se_lisent_comme_a_l_ecran(creer):
    """`loggia_switchlights` absente : la liste de `loggia_entities` (`switchLights`)."""
    b = creer(partage={"loggia_switchlights": None, "loggia_entities": {"switchLights": [NAS]}})
    assert sorted(b.p.prises) == sorted([LV, SEJOUR, "switch.lumiere_exterieur", "switch.prise_garage"])


def test_l_etat_dit_l_heure_la_configuration_et_chaque_prise(creer):
    etat = creer().etat()
    assert etat["maintenant"] == "2026-10-13T13:30:00+02:00"
    assert etat["config"] == {"protegees": [], "types": {}, "prevenir": {}}
    assert etat["prises"][LV] == {"type": "lv", "impose": False, "protegee": False, "prevenir": False,
                                  "cycle": None, "cycles": [], "suivi": True}
    assert {h: f["type"] for h, f in etat["prises"].items()} == {
        LV: "lv", NAS: "nas", SEJOUR: "prise", "switch.prise_garage": "prise"}
    assert etat["notifier"] is False


def test_l_etat_dit_quelles_prises_le_serveur_suit_vraiment(creer):
    """`suivi` : un electromenager, et un capteur de puissance a lui. L'ecran ne
    propose « Prevenir a la fin du cycle » que la — ailleurs, l'alerte ne
    partirait jamais (audit du 19/10)."""
    b = creer()
    assert {h: f["suivi"] for h, f in b.etat()["prises"].items()} == {
        LV: True, NAS: False, SEJOUR: False, "switch.prise_garage": False}
    lancer(b.p.async_enregistrer({"types": {SEJOUR: "ll", "switch.prise_garage": "ll"}}))
    prises = b.etat()["prises"]
    assert prises[SEJOUR]["suivi"] is True
    assert prises["switch.prise_garage"]["suivi"] is False, "un lave-linge sans mesure n'a pas de cycle"


def test_l_etat_dit_si_un_telephone_ecoute(creer):
    assert creer(partage={"loggia_alertes": {"service": "mobile"}}).etat()["notifier"] is True
    assert creer(partage={"loggia_alertes": {"service": "  "}}).etat()["notifier"] is False


def test_proteger_imposer_prevenir_se_lit_dans_l_etat(creer):
    b = creer()
    cfg = lancer(b.p.async_enregistrer({"protegees": [NAS], "types": {SEJOUR: "ll"}, "prevenir": {LV: True}}))
    assert cfg == {"protegees": [NAS], "types": {SEJOUR: "ll"}, "prevenir": {LV: True}}
    assert lancer(b.p.store.async_get_shared("loggia_prises")) == cfg, "dans la partie commune"
    prises = b.etat()["prises"]
    assert prises[NAS]["protegee"] is True and prises[NAS]["impose"] is False
    assert (prises[SEJOUR]["type"], prises[SEJOUR]["impose"]) == ("ll", True)
    assert prises[LV]["prevenir"] is True
    lancer(b.p.async_enregistrer({"types": {SEJOUR: None}}))
    assert b.etat()["prises"][SEJOUR]["type"] == "prise", "« Deviner d'apres le nom »"


def test_deux_reglages_partis_ensemble_restent_tous_les_deux(creer):
    """Sous le verrou du magasin (lot 15 de l'audit du 03/10) : le second ne repart
    pas de la configuration d'avant le premier."""
    b = creer()

    async def ensemble():
        await asyncio.gather(b.p.async_enregistrer({"types": {SEJOUR: "ll"}}),
                             b.p.async_enregistrer({"prevenir": {LV: True}}))

    lancer(ensemble())
    assert lancer(b.p.store.async_get_shared("loggia_prises")) == {
        "protegees": [], "types": {SEJOUR: "ll"}, "prevenir": {LV: True}}


def test_un_reglage_illisible_n_ecrit_rien(creer):
    b = creer(config={"protegees": [NAS]})
    with pytest.raises(ValueError):
        lancer(b.p.async_enregistrer({"protegees": [], "prevenir": {LV: "oui"}}))
    assert lancer(b.p.store.async_get_shared("loggia_prises")) == {"protegees": [NAS]}
    assert b.p.cfg["protegees"] == [NAS]


def test_la_cle_des_prises_est_reservee_aux_administrateurs(creer, store_module):
    """P4 : par la configuration generale non plus, un compte ordinaire ne
    retire pas la protection (la commande, elle, exige `require_admin`)."""
    b = creer()
    assert "loggia_prises" not in store_module.OUVERTES_A_TOUS
    with pytest.raises(store_module.MaisonReserveeError):
        lancer(b.p.store.async_set_user("u-lea", {"loggia_prises": {"protegees": []}}, is_admin=False))


def test_des_registres_illisibles_ne_cassent_rien_et_se_disent_une_fois(creer, monkeypatch, caplog):
    b = creer()
    avant = dict(b.p.prises)

    def casse(_hass):
        raise RuntimeError("registre indisponible")

    monkeypatch.setattr(sys.modules["homeassistant.helpers.entity_registry"], "async_get", casse)
    caplog.set_level(logging.WARNING)
    for _ in range(3):
        b.etat()
    assert b.p.prises == avant, "les prises deja reconnues restent"
    assert len([r for r in caplog.records if "registres illisibles" in r.getMessage()]) == 1


def test_la_bouilloire_d_a_cote_ne_finit_pas_le_lave_vaisselle(creer):
    """Relecture du 13/10, point 1 : une multiprise a un seul compteur. Il est
    commun a toutes les sorties ; aucune ne le prend sans en partager les mots,
    sinon la bouilloire branchee a cote dirait « Lave-vaisselle : cycle termine ».
    Decision du 19/10 : les sorties d'une multiprise qui mesure SONT des prises,
    sans capteur a elles ; aucun suivi de cycle."""
    reg = Registres()
    reg.appareil("d-multi", "Tuya", "Power strip (with power monitoring)", entree("switch.multiprise_l1"),
                 entree("switch.multiprise_l2"), entree("sensor.multiprise_power", "power"),
                 entree("sensor.multiprise_energy", "energy"))
    etats = {"switch.multiprise_l1": FauxEtat("on", {"friendly_name": "Lave-vaisselle"}),
             "switch.multiprise_l2": FauxEtat("on", {"friendly_name": "Bouilloire"}),
             "sensor.multiprise_power": FauxEtat("0", {"friendly_name": "Multiprise Power",
                                                       "unit_of_measurement": "W"}),
             "sensor.multiprise_energy": FauxEtat("0", {"friendly_name": "Multiprise Energy",
                                                        "unit_of_measurement": "kWh"})}
    b = creer(registres=reg, etats=etats)
    assert b.p.prises == {
        "switch.multiprise_l1": {"nom": "Lave-vaisselle", "puissance": None, "energie": None},
        "switch.multiprise_l2": {"nom": "Bouilloire", "puissance": None, "energie": None},
    }, "des prises, sans le compteur commun"
    assert b.ecoutes == [], "le compteur commun n'est ecoute pour aucune sortie"
    assert {h: f["suivi"] for h, f in b.etat()["prises"].items()} == {
        "switch.multiprise_l1": False, "switch.multiprise_l2": False}


def test_une_prise_posee_sur_un_compteur_de_la_maison_n_en_est_pas_une(creer, monkeypatch):
    """Les compteurs du tableau de bord Energie (`compteurs_maison`) : un switch
    pose sur leur appareil n'est pas une prise (prises_types.py). Le serveur les
    lit au gestionnaire Energie de Home Assistant ; sans lui, rien ne change."""
    prefs = {"energy_sources": [{"type": "grid", "flow_from": [{"stat_energy_from": "sensor.prise_nas_energy"}]}]}

    async def async_get_manager(_hass):
        return types.SimpleNamespace(data=prefs)

    energie = types.ModuleType("homeassistant.components.energy.data")
    energie.async_get_manager = async_get_manager
    monkeypatch.setitem(sys.modules, "homeassistant.components.energy.data", energie)
    assert NAS not in creer().p.prises
    monkeypatch.delitem(sys.modules, "homeassistant.components.energy.data")
    assert NAS in creer().p.prises, "sans integration Energie : aucun compteur"


def test_la_regle_lit_le_nom_de_l_appareil(creer, monkeypatch):
    """Le nom que l'on a donne a l'appareil d'abord (`name_by_user`), sinon le sien."""
    module = charger("prises")
    vrai, vus = module.est_prise, {}

    def est_prise(entite, appareil, *args):
        vus[entite["entity_id"]] = appareil
        return vrai(entite, appareil, *args)

    monkeypatch.setattr(module, "est_prise", est_prise)
    reg, etats = maison()
    reg.devices["d-lv"].name, reg.devices["d-lv"].name_by_user = "TS011F", "Cuisine"
    reg.devices["d-nas"].name = "TS011F"
    creer(registres=reg, etats=etats)
    assert vus[LV]["nom"] == "Cuisine" and vus[NAS]["nom"] == "TS011F"


def test_un_capteur_partage_par_deux_sorties_ne_fait_suivre_aucune(creer, monkeypatch):
    """Audit du 19/10 : si la reconnaissance donne le MEME capteur de puissance a
    deux sorties d'une multiprise, le serveur n'en suivait qu'une, en silence —
    avec la puissance des deux. La puissance commune ne s'attribue pas : aucune
    sortie n'est suivie, et l'etat le dit (`suivi`). Pose ici, la regle ne
    depend pas de celle qui choisit le capteur (prises_types.py)."""
    module = charger("prises")
    vrai = module.est_prise
    multi = {"switch.multiprise_lave_linge", "switch.multiprise_bouilloire"}

    def est_prise(entite, *args):
        if entite["entity_id"] in multi:
            return {"prise": True, "puissance": "sensor.multiprise_power", "energie": None}
        return vrai(entite, *args)

    monkeypatch.setattr(module, "est_prise", est_prise)
    reg, etats = maison()
    reg.appareil("d-multi", "Tuya", "Power strip (with power monitoring)", entree("switch.multiprise_lave_linge"),
                 entree("switch.multiprise_bouilloire"), entree("sensor.multiprise_power", "power"))
    etats["switch.multiprise_lave_linge"] = FauxEtat("on", {"friendly_name": "Lave-linge"})
    etats["switch.multiprise_bouilloire"] = FauxEtat("on", {"friendly_name": "Bouilloire"})
    etats["sensor.multiprise_power"] = FauxEtat("0", {"unit_of_measurement": "W"})
    b = creer(registres=reg, etats=etats)
    assert b.ecoutes[-1][0] == [LV_W], "le capteur commun n'est ecoute pour aucune sortie"
    prises = b.etat()["prises"]
    assert prises["switch.multiprise_lave_linge"]["suivi"] is False
    assert prises["switch.multiprise_bouilloire"]["suivi"] is False and prises[LV]["suivi"] is True
    assert sorted(b.p.memoire) == [LV]
    lancer(b.p.async_enregistrer({"types": {"switch.multiprise_bouilloire": "sl"}}))
    assert b.ecoutes[-1][0] == [LV_W], "deux electromenagers sur un capteur : toujours aucun"


# ── Le cycle de l'electromenager (P3, spec 5), en temps simule ──────────────

@pytest.fixture
def historique(monkeypatch):
    """`homeassistant.components.recorder`, comme le vrai : `get_instance(hass)` et
    son executeur, `history.state_changes_during_period(hass, debut, fin,
    entity_id, ...)` qui rend {entity_id: [etats]}. `etats` : ce qu'il rend ;
    `panne` : il leve ; `demandes` : ce qu'on lui a demande ; `pendant` : ce qui
    arrive PENDANT la lecture (un rechargement). Pose test par test, jamais dans
    conftest.py : sans lui, l'import echoue, comme sans enregistreur."""
    h = types.SimpleNamespace(etats=[], panne=False, demandes=[], pendant=None)

    def state_changes_during_period(hass, debut, fin, entity_id, no_attributes=False, descending=False,
                                    limit=None, include_start_time_state=True):
        if h.panne:
            raise RuntimeError("enregistreur arrete")
        if h.pendant is not None:
            h.pendant()
        h.demandes.append((debut, fin, entity_id, no_attributes, include_start_time_state))
        return {entity_id: [FauxEtat(v) for v in h.etats]}

    class Instance:
        async def async_add_executor_job(self, cible, *args):
            return cible(*args)

    recorder = types.ModuleType("homeassistant.components.recorder")
    recorder.get_instance = lambda _hass: Instance()
    recorder.history = types.SimpleNamespace(state_changes_during_period=state_changes_during_period)
    monkeypatch.setitem(sys.modules, "homeassistant.components.recorder", recorder)
    return h


def tenir(b, debut, fin, w, pas=300):
    """La prise publie `w` toutes les cinq minutes, de `debut` a `fin` exclue —
    comme une vraie prise, qui republie sa valeur : au-dela de dix minutes sans
    mesure, l'integree ne suppose plus rien (`ECART_MAX_S`)."""
    t = debut
    while t < fin:
        b.mesurer(t, w)
        t += pas


def cycle_d_une_heure(b):
    """13:40 a 14:40 a 1950 W, puis 3 W : le cycle commence a 13:41 (date 13:40)
    et finit a 14:50 (date 14:40)."""
    b.mesurer(paris(13, 35), 2)
    tenir(b, paris(13, 40), paris(14, 40), 1950)
    b.mesurer(paris(14, 40), 3)
    b.attendre(paris(14, 50))


def test_seul_l_electromenager_est_ecoute(creer):
    """Le NAS mesure mais n'a pas de cycle ; la prise du sejour en a un des
    qu'on lui impose un lave-linge (P2)."""
    b = creer()
    assert b.ecoutes[-1][0] == [LV_W]
    lancer(b.p.async_enregistrer({"types": {SEJOUR: "ll"}}))
    assert b.ecoutes[-1][0] == [LV_W, "sensor.prise_sejour_puissance"]


def test_une_prise_disparue_quitte_la_memoire_au_rechargement(creer):
    """Audit du 19/10 : `.storage/loggia_prises_etat` gardait pour toujours les
    cycles d'une prise retiree de la maison. Au demarrage, ce qui n'est plus une
    prise reconnue s'en va ; le reste demeure."""
    garde = {"debut": paris(9, 0), "fin": paris(10, 0), "kwh": 1.0}
    b = creer(memoire={LV: {"suivi": {}, "cycles": [garde]},
                       "switch.prise_retiree": {"suivi": {}, "cycles": [garde]}})
    assert sorted(b.p.memoire) == [LV]
    assert sorted(b.depot.contenu) == [LV] and b.depot.contenu[LV]["cycles"] == [garde]


def test_des_registres_illisibles_ne_purgent_rien(creer):
    """Sans registre, on ne sait pas quelles prises la maison a : on garde tout."""
    class Casse:
        devices = {}

        @property
        def entities(self):
            raise RuntimeError("registre indisponible")

    garde = {"debut": paris(9, 0), "fin": paris(10, 0), "kwh": 1.0}
    b = creer(registres=Casse(), memoire={LV: {"suivi": {}, "cycles": [garde]}})
    assert b.p.memoire[LV]["cycles"] == [garde]


def test_un_cycle_commence_apres_une_minute_et_se_publie(creer):
    b = creer()
    b.mesurer(paris(13, 40), 1950)
    assert b.etat()["prises"][LV]["cycle"] is None, "pas avant la minute"
    assert [e["quand"] for e in b.rdv.armees()] == [paris(13, 41)]
    b.attendre(paris(13, 41))
    assert b.etat()["prises"][LV]["cycle"] == {"debut": "2026-10-13T13:40:00+02:00"}
    assert b.journal() == [("cycle démarré", "à 13:40")]
    (ligne,) = lancer(b.p.regles.journal(module="prises"))
    assert (ligne["regle"], ligne["cibles"], ligne["g"]["motif"]) == (
        "cycle", [LV], [["à {h}", {"h": "13:40", "ts": paris(13, 40)}]])


def test_la_fin_est_datee_a_la_baisse_et_se_garde(creer):
    b = creer()
    cycle_d_une_heure(b)
    prise = b.etat()["prises"][LV]
    assert prise["cycle"] is None
    assert prise["cycles"] == [{"debut": "2026-10-13T13:40:00+02:00", "fin": "2026-10-13T14:40:00+02:00",
                                "kwh": 1.95}]
    assert b.journal() == [("cycle terminé", "à 14:40 · 1.95 kWh"), ("cycle démarré", "à 13:40")]
    fin = lancer(b.p.regles.journal(module="prises"))[0]
    assert fin["g"]["motif"] == [["à {h}", {"h": "14:40", "ts": paris(14, 40)}], ["{kwh} kWh", {"kwh": 1.95}]]
    assert b.depot.contenu[LV]["cycles"] == [{"debut": paris(13, 40), "fin": paris(14, 40), "kwh": 1.95}]


def test_le_sechage_a_14_w_n_est_pas_la_fin(creer):
    b = creer()
    b.mesurer(paris(13, 40), 1950)
    b.mesurer(paris(14, 40), 14)
    b.attendre(paris(16, 0))
    assert b.etat()["prises"][LV]["cycle"] == {"debut": "2026-10-13T13:40:00+02:00"}
    b.mesurer(paris(16, 14), 2)
    b.attendre(paris(16, 24))
    assert b.etat()["prises"][LV]["cycles"][0]["fin"] == "2026-10-13T16:14:00+02:00"


def test_une_horloge_qui_recule_ne_fait_pas_finir_un_cycle_avant_son_debut(creer):
    """Relecture du 13/10, point 7 : une mise a l'heure (NTP) en plein cycle. Une
    mesure ne se date jamais avant la precedente."""
    b = creer()
    b.mesurer(paris(13, 40), 1950)
    b.attendre(paris(13, 41))
    b.horloge.t = paris(13, 0)
    b.mesurer(paris(13, 0), 2)
    b.attendre(paris(14, 0))
    (cycle,) = b.etat()["prises"][LV]["cycles"]
    assert cycle["fin"] >= cycle["debut"], cycle


def test_six_heures_sans_retomber_interrompent_le_cycle_sans_alerte(creer):
    """Relecture du 13/10, point 3 : une veille a 16 W qui fluctue. A la sixieme
    heure, le cycle est interrompu : ni alerte, ni place parmi les cycles ; le
    journal le dit. Le suivant attend une retombee a 5 W ou moins."""
    b = creer(config={"prevenir": {LV: True}}, partage={"loggia_alertes": {"service": "mobile"}})
    for i in range(14):
        b.mesurer(paris(13, 40) + 1800 * i, 16 + 2 * (i % 2))
    prise = b.etat()["prises"][LV]
    assert (prise["cycle"], prise["cycles"]) == (None, [])
    assert b.journal() == [("cycle interrompu", "à 19:40"), ("cycle démarré", "à 13:40")]
    assert b.p.hass.services.appels == []
    b.mesurer(paris(20, 30), 2)
    b.mesurer(paris(21, 0), 1950)
    b.attendre(paris(21, 1))
    assert b.etat()["prises"][LV]["cycle"] == {"debut": "2026-10-13T21:00:00+02:00"}


def test_une_cloture_par_le_silence_ne_previent_pas(creer):
    """Relecture du 13/10, point 3 : deux heures sans nouvelle, la fin n'est que
    supposee. Le cycle se clot et se garde, le journal le dit ; le telephone se tait."""
    b = creer(config={"prevenir": {LV: True}}, partage={"loggia_alertes": {"service": "mobile"}})
    b.mesurer(paris(13, 40), 1950)
    b.mesurer(paris(14, 0), 1800)
    b.attendre(paris(16, 30))
    assert b.etat()["prises"][LV]["cycles"][0]["fin"] == "2026-10-13T14:00:00+02:00"
    assert [quoi for quoi, _ in b.journal()] == ["cycle terminé", "cycle démarré"]
    assert b.p.hass.services.appels == []


def test_une_valeur_publiee_identique_n_est_pas_un_silence(creer):
    """Relecture du 13/10, point 3 : une valeur figee ne fait plus de
    `state_changed`, mais un `state_reported`. Le serveur l'ecoute aussi : un
    sechage fige a 14 W n'est pas clos en plein sechage."""
    b = creer(config={"prevenir": {LV: True}}, partage={"loggia_alertes": {"service": "mobile"}})
    assert [ids for ids, _ in b.rapports] == [[LV_W]]
    b.mesurer(paris(13, 40), 1950)
    b.mesurer(paris(14, 40), 14)
    for t in (paris(15, 10), paris(15, 40), paris(16, 10), paris(16, 40)):
        b.rapporter(t, 14)
    b.mesurer(paris(17, 0), 2)
    b.attendre(paris(17, 10))
    assert b.etat()["prises"][LV]["cycles"][0]["fin"] == "2026-10-13T17:00:00+02:00"
    (appel,) = b.p.hass.services.appels
    assert "cycle terminé à 17:00" in appel[2]["message"]


def test_sans_state_reported_le_serveur_fait_sans(creer, monkeypatch):
    """Un Home Assistant sans `async_track_state_report_event` : l'ecoute des
    changements suffit, rien ne casse."""
    b = creer()
    monkeypatch.delattr(sys.modules["homeassistant.helpers.event"], "async_track_state_report_event")
    lancer(b.p.async_enregistrer({"types": {SEJOUR: "ll"}}))
    assert b.ecoutes[-1][0] == [LV_W, "sensor.prise_sejour_puissance"]
    assert [ids for ids, _ in b.rapports] == [[LV_W]], "pas de second abonnement"


def test_une_prise_muette_pendant_deux_heures_clot_son_cycle(creer):
    """« unavailable » n'est pas une nouvelle : le silence se compte depuis la
    derniere mesure lisible."""
    b = creer()
    b.mesurer(paris(13, 40), 1950)
    b.mesurer(paris(14, 0), 1800)
    b.mesurer(paris(14, 5), "unavailable")
    b.attendre(paris(16, 0))
    assert b.etat()["prises"][LV]["cycles"][0]["fin"] == "2026-10-13T14:00:00+02:00"


def test_l_energie_du_cycle_vient_du_compteur(creer, historique):
    historique.etats = ["10.00", "10.52", "11.08"]
    b = creer()
    cycle_d_une_heure(b)
    assert b.etat()["prises"][LV]["cycles"][0]["kwh"] == 1.08
    (debut, fin, capteur, sans_attributs, depuis_le_debut), = historique.demandes
    assert (debut.timestamp(), fin.timestamp(), capteur) == (paris(13, 40), paris(14, 50), LV_KWH), \
        "jusqu'a dix minutes apres la baisse : bien des prises publient leur energie en retard"
    assert sans_attributs and depuis_le_debut, "la valeur au debut du cycle compte"


@pytest.mark.parametrize("muette", [True, False], ids=["unavailable", "sans_nouvelle"])
def test_un_trou_de_mesure_ne_gonfle_pas_l_energie(creer, historique, muette):
    """Audit du 19/10 : 2000 W a 13:40, puis plus rien de lisible jusqu'a 15:20.
    La puissance d'avant passait pour tenue tout ce temps — 3,33 kWh —, et la
    regle du double gardait cette integree contre le compteur, qui disait 1,10.
    Elle ne tient plus a travers une mesure muette, ni plus de dix minutes ;
    l'integree trouee cede au compteur."""
    historique.etats = ["10.00", "11.10"]
    b = creer()
    b.mesurer(paris(13, 40), 2000)
    b.mesurer(paris(13, 45), 2000)
    if muette:
        b.mesurer(paris(13, 50), "unavailable")
    b.mesurer(paris(15, 20), 2)
    b.attendre(paris(15, 30))
    assert b.etat()["prises"][LV]["cycles"][0]["kwh"] == 1.10


def test_un_redemarrage_en_pleine_chauffe_ne_gonfle_pas_l_energie(creer, historique, horloge):
    """Meme defaut a travers un redemarrage : la puissance d'avant l'arret ne
    tient pas pendant l'arret."""
    historique.etats = ["10.00", "11.10"]
    memoire = {LV: {"suivi": {"en_cours": True, "debut": paris(13, 40), "dernier": paris(13, 45), "w": 2000.0,
                              "wh": 166.7}, "cycles": []}}
    horloge.t = paris(15, 20)
    b = creer(memoire=memoire)
    b.mesurer(paris(15, 20), 2)
    b.attendre(paris(15, 30))
    assert b.etat()["prises"][LV]["cycles"][0]["kwh"] == 1.10


@pytest.mark.parametrize("lectures", [["120.40", "0", "120.95"], ["120.40", "unavailable", "120.40"]],
                         ids=["lecture_parasite", "compteur_immobile"])
def test_un_compteur_qui_s_ecarte_de_la_puissance_lui_cede(creer, historique, lectures):
    """Relecture du 13/10, point 2 : « 120,95 kWh » au telephone, garde sept
    jours ; ou 0,00 kWh pour une heure a 1950 W. L'integree dit 1,95."""
    historique.etats = lectures
    b = creer()
    cycle_d_une_heure(b)
    assert b.etat()["prises"][LV]["cycles"][0]["kwh"] == 1.95


def test_sans_historique_la_puissance_s_integre_et_le_dit_une_fois(creer, historique, caplog):
    historique.panne = True
    caplog.set_level(logging.WARNING)
    b = creer()
    cycle_d_une_heure(b)
    tenir(b, paris(15, 0), paris(15, 30), 1950)
    b.mesurer(paris(15, 30), 2)
    b.attendre(paris(15, 40))
    assert [c["kwh"] for c in b.etat()["prises"][LV]["cycles"]] == [1.95, 0.975]
    assert len([r for r in caplog.records if "historique illisible" in r.getMessage()]) == 1


def test_un_rechargement_pendant_l_historique_ne_double_pas_la_fin(creer, historique):
    """Relecture du 13/10, point 5 : l'integration rechargee pendant la lecture
    de l'historique. `_sauver` refusait apres l'arret, le disque gardait le cycle
    en cours, et le demarrage suivant concluait la meme fin une seconde fois —
    une seconde alerte. Le suivi remis au repos s'ecrit AVANT la lecture."""
    reglages = {"config": {"prevenir": {LV: True}}, "partage": {"loggia_alertes": {"service": "mobile"}}}
    historique.etats = ["10.00", "11.95"]
    b = creer(**reglages)
    historique.pendant = b.p.async_arreter
    cycle_d_une_heure(b)
    assert len(b.p.hass.services.appels) == 1, "la fin dite une fois"
    historique.pendant = None
    c = creer(memoire=b.depot.contenu, **reglages)
    assert c.journal() == [] and c.p.hass.services.appels == []
    assert c.etat()["prises"][LV]["cycle"] is None


def test_les_cycles_survivent_au_redemarrage(creer):
    """Un cycle REEL : comparees seules, deux listes vides passaient aussi
    (relecture du 13/10, point 9)."""
    attendu = [{"debut": "2026-10-13T13:40:00+02:00", "fin": "2026-10-13T14:40:00+02:00", "kwh": 1.95}]
    b = creer()
    cycle_d_une_heure(b)
    assert b.etat()["prises"][LV]["cycles"] == attendu
    b.p.async_arreter()
    c = creer(memoire=b.depot.contenu)
    assert c.etat()["prises"][LV]["cycles"] == attendu


def test_en_marche_la_memoire_oublie_ce_qui_a_plus_de_sept_jours(creer, horloge):
    """Sept jours glissants, pas seulement au redemarrage : un cycle fini il y a
    six jours et vingt-trois heures quitte l'etat trois heures plus tard."""
    fin = paris(14, 30, jour=6)
    b = creer(memoire={LV: {"suivi": {}, "cycles": [{"debut": fin - 3600, "fin": fin, "kwh": 1.0}]}})
    assert len(b.etat()["prises"][LV]["cycles"]) == 1
    b.attendre(paris(16, 30))
    assert b.etat()["prises"][LV]["cycles"] == []


def test_un_cycle_en_cours_reprend_au_redemarrage(creer, horloge):
    memoire = {LV: {"suivi": {"en_cours": True, "debut": paris(13, 40), "dernier": paris(15, 0), "w": 1950.0,
                              "wh": 2600.0}, "cycles": []}}
    horloge.t = paris(15, 30)
    b = creer(memoire=memoire)
    assert b.etat()["prises"][LV]["cycle"] == {"debut": "2026-10-13T13:40:00+02:00"}
    assert [e["quand"] for e in b.rdv.armees()] == [paris(17, 0)], "le silence se compte depuis 15:00"
    b.mesurer(paris(16, 14), 2)
    b.attendre(paris(16, 24))
    assert b.etat()["prises"][LV]["cycles"][0]["fin"] == "2026-10-13T16:14:00+02:00"


@pytest.mark.parametrize("bas,fin", [(None, "2026-10-13T15:00:00+02:00"), (14, "2026-10-13T14:00:00+02:00")],
                         ids=["derniere_mesure", "derniere_baisse"])
def test_sans_nouvelle_depuis_deux_heures_le_cycle_est_clos_au_redemarrage(creer, horloge, bas, fin):
    suivi = {"en_cours": True, "debut": paris(13, 40), "dernier": paris(15, 0), "w": 3.0, "wh": 2000.0}
    if bas is not None:
        suivi.update(bas=paris(bas), wh_bas=1500.0)
    horloge.t = paris(17, 30)
    b = creer(memoire={LV: {"suivi": suivi, "cycles": []}})
    prise = b.etat()["prises"][LV]
    assert prise["cycle"] is None and prise["cycles"][0]["fin"] == fin
    assert b.journal()[0][0] == "cycle terminé"
    assert b.depot.contenu[LV]["suivi"]["en_cours"] is False, "le fichier le sait"


def test_un_debut_pressenti_s_oublie_au_redemarrage(creer, horloge):
    horloge.t = paris(13, 45)
    b = creer(memoire={LV: {"suivi": {"haut": paris(13, 40), "dernier": paris(13, 40), "w": 1950.0},
                            "cycles": []}})
    assert b.p.memoire[LV]["suivi"]["haut"] is None and b.rdv.armees() == []
    assert b.journal() == []


def test_un_ecran_ouvert_pendant_le_demarrage_ne_fait_pas_de_faux_cycle(creer, horloge, monkeypatch):
    """Relecture du 13/10, point 4. Home Assistant demarre encore : `reprendre`
    attend. Un ecran ouvert relit l'etat, donc le registre, qui arme les
    echeances de la memoire relue. Un debut pressenti avant l'arret ne doit pas
    en armer une : perimee, elle sonnerait aussitot, et ferait un cycle date
    d'avant l'arret."""
    attente = []
    monkeypatch.setattr(sys.modules["homeassistant.helpers.start"], "async_at_started",
                        lambda _hass, rappel: attente.append(rappel) or (lambda: None))
    horloge.t = paris(13, 45)
    b = creer(memoire={LV: {"suivi": {"haut": paris(13, 40), "dernier": paris(13, 40), "w": 1950.0},
                            "cycles": []}})
    assert attente, "le rattrapage attend la fin du demarrage"
    b.etat()
    b.attendre(paris(13, 50))
    assert b.journal() == [] and b.etat()["prises"][LV]["cycle"] is None


def test_un_fichier_illisible_repart_a_vide_et_le_dit(creer, caplog):
    """Comme le journal (`regles._charger`) : un historique abime ne vaut pas
    qu'on cesse de suivre les cycles. Le fichier se reecrit, propre."""
    class Abime(FauxStore):
        async def async_load(self):
            raise ValueError("JSON abime")

    caplog.set_level(logging.WARNING)
    b = creer()
    b.p._depot = Abime(None)
    lancer(b.p._async_demarrer())
    b.p.hass.executer()
    assert "etat des prises illisible" in caplog.text
    assert b.p.memoire == {LV: {"suivi": b.p.memoire[LV]["suivi"], "cycles": []}}
    assert b.p._depot.contenu[LV]["cycles"] == [], "le fichier se reecrit"
    b.mesurer(paris(13, 40), 1950)
    assert [e["quand"] for e in b.rdv.armees()] == [paris(13, 41)], "le suivi continue"


def test_une_mesure_ecrit_le_fichier_au_plus_chaque_minute_en_differe(creer):
    """Audit du 19/10 : une ecriture par minute pendant tout un cycle, chacune
    tout de suite. Elle passe par l'ecriture differee du `Store` : une seule
    attente a la fois, que les mesures suivantes ne repoussent pas, et qui
    emporte la memoire du moment ou elle part."""
    b = creer()
    b.mesurer(paris(13, 40), 1950)
    b.attendre(paris(13, 41))
    ecritures = b.depot.ecritures
    b.mesurer(paris(13, 41, 10), 1900)
    assert (b.depot.differees, b.depot.delai) == (1, 60) and b.depot.ecritures == ecritures, "rien tout de suite"
    b.mesurer(paris(13, 41, 20), 1850)
    assert b.depot.differees == 1, "l'attente en cours n'est pas repoussee"
    b.depot.ecrire_differee()
    assert b.depot.ecritures == ecritures + 1
    assert b.depot.contenu[LV]["suivi"]["dernier"] == paris(13, 41, 20), "la memoire du moment de l'ecriture"
    b.mesurer(paris(13, 42, 30), 1800)
    assert b.depot.differees == 2, "la suivante attend de nouveau"


def test_une_etape_du_cycle_s_ecrit_tout_de_suite_et_emporte_l_attente(creer):
    b = creer()
    b.mesurer(paris(13, 40), 1950)
    b.attendre(paris(13, 41))
    b.mesurer(paris(13, 41, 10), 1900)
    assert b.depot.differee is not None
    b.mesurer(paris(13, 42), 3)
    assert b.depot.differee is None and b.depot.contenu[LV]["suivi"]["bas"] == paris(13, 42)
    b.mesurer(paris(13, 42, 30), 2)
    assert b.depot.differees == 2, "apres une ecriture, l'attente reprend"


def test_l_arret_ecrit_ce_qui_attendait(creer):
    """Sans quoi l'ecriture differee d'un module arrete partirait plus tard, sur
    le fichier que le module recharge a deja reecrit."""
    b = creer()
    b.mesurer(paris(13, 40), 1950)
    b.attendre(paris(13, 41))
    b.mesurer(paris(13, 41, 10), 1900)
    b.p.async_arreter()
    b.p.hass.executer()
    assert b.depot.differee is None and b.depot.contenu[LV]["suivi"]["dernier"] == paris(13, 41, 10)
    ecritures = b.depot.ecritures
    b.p.async_arreter()
    b.p.hass.executer()
    assert b.depot.ecritures == ecritures, "rien n'attendait : rien a ecrire"


def test_rien_ne_s_ecrit_avant_que_la_memoire_soit_relue(creer):
    """Audit du 19/10 : `_sauver` n'ecartait qu'un demarrage RATE (`demarrage`
    False). Pendant le demarrage (None), un ecran ouvert abonne deja les prises,
    et une mesure ecrivait une memoire pas encore relue par-dessus le fichier."""
    b = creer()
    ecritures = b.depot.ecritures
    b.p.demarrage, b.p._relu = None, False
    lancer(b.p._sauver())
    b.mesurer(paris(13, 40), 1950)
    b.mesurer(paris(13, 41, 10), 1900)
    assert (b.depot.ecritures, b.depot.differees) == (ecritures, 0)


def test_le_rattrapage_ecrit_meme_avant_la_fin_du_demarrage(creer, horloge, monkeypatch):
    """Home Assistant demarre le rattrapage sur-le-champ (`async_at_started`, une
    tache « eager ») : il tourne encore DANS `_async_demarrer`, `demarrage` vaut
    None. La fin conclue pendant l'arret doit s'ecrire quand meme — sinon le
    demarrage suivant la conclurait une seconde fois."""
    attente = []
    monkeypatch.setattr(sys.modules["homeassistant.helpers.start"], "async_at_started",
                        lambda _hass, rappel: attente.append(rappel) or (lambda: None))
    horloge.t = paris(17, 30)
    suivi = {"en_cours": True, "debut": paris(13, 40), "dernier": paris(15, 0), "w": 3.0, "wh": 2000.0}
    b = creer(memoire={LV: {"suivi": suivi, "cycles": []}})
    b.p.demarrage = None
    lancer(attente[0](None))
    b.p.hass.executer()
    assert b.depot.contenu[LV]["suivi"]["en_cours"] is False and len(b.depot.contenu[LV]["cycles"]) == 1


def test_au_repos_une_veille_qui_fluctue_n_ecrit_rien(creer):
    """Relecture du 13/10, point 6 : la minute ne compte que pendant un cycle,
    ou un debut pressenti. Au repos, rien a garder."""
    b = creer()
    ecritures = b.depot.ecritures
    for i, w in enumerate((2, 3, 2, 4, 3, 2)):
        b.mesurer(paris(13, 31 + 2 * i, 30), w)
    assert b.depot.ecritures == ecritures


def test_l_arret_retire_l_ecoute_et_les_echeances(creer):
    b = creer()
    b.mesurer(paris(13, 40), 1950)
    assert b.rdv.armees()
    b.p.async_arreter()
    assert b.rdv.armees() == [] and b.p._ecoute is None


# ── L'alerte de fin de cycle (P6) ──────────────────────────────────────────

def test_l_alerte_de_fin_de_cycle_est_coupee_par_defaut(creer):
    """Elle passe deja avant le code de la tache : c'est la garde du defaut."""
    b = creer(partage={"loggia_alertes": {"service": "mobile"}})
    cycle_d_une_heure(b)
    assert b.p.hass.services.appels == []
    assert [quoi for quoi, _ in b.journal()] == ["cycle terminé", "cycle démarré"]


def test_la_fin_du_cycle_previent_le_telephone_choisi(creer):
    b = creer(config={"prevenir": {LV: True}}, partage={"loggia_alertes": {"service": "mobile"}})
    cycle_d_une_heure(b)
    assert b.p.hass.services.appels == [("notify", "mobile", {
        "title": "Loggia", "message": "Prise lave-vaisselle : cycle terminé à 14:40 (1,95 kWh)"})]
    ligne = lancer(b.p.regles.journal(module="prises"))[0]
    assert (ligne["regle"], ligne["quoi"], ligne["n"]) == ("cycle", "prevenir", 1)


def test_sans_telephone_la_fin_se_dit_au_journal(creer):
    """Rien ne part, et le journal le dit plutot que de laisser croire que la
    prise s'est tue (`regles.prevenir`)."""
    b = creer(config={"prevenir": {LV: True}})
    cycle_d_une_heure(b)
    assert b.p.hass.services.appels == []
    ligne = lancer(b.p.regles.journal(module="prises"))[0]
    assert (ligne["quoi"], ligne["n"]) == ("prevenir", 0)
    assert ligne["detail"].startswith("personne a qui parler")
    assert b.etat()["notifier"] is False, "l'ecran dit, en ambre, de choisir le telephone"


def test_pendant_les_heures_calmes_la_fin_ne_sonne_pas(creer, horloge):
    """Le regime normal (P6) : la notification part, silencieuse ; on la lira au
    reveil."""
    horloge.t = paris(22, 0)
    b = creer(config={"prevenir": {LV: True}},
              partage={"loggia_alertes": {"service": "mobile",
                                          "calme": {"actif": True, "debut": "22:00", "fin": "07:00"}}})
    tenir(b, paris(22, 10), paris(23, 10), 1950)
    b.mesurer(paris(23, 10), 2)
    b.attendre(paris(23, 20))
    (appel,) = b.p.hass.services.appels
    assert appel[2]["data"] == {"importance": "low", "push": {"sound": "none"}}
    assert appel[2]["message"] == "Prise lave-vaisselle : cycle terminé à 23:10 (1,95 kWh)"


def test_la_fin_parle_la_langue_du_serveur(creer):
    b = creer(config={"prevenir": {LV: True}}, partage={"loggia_alertes": {"service": "mobile"}})
    b.p.hass.config.language = "en"
    cycle_d_une_heure(b)
    assert b.p.hass.services.appels[0][2]["message"] == "Prise lave-vaisselle: cycle finished at 14:40 (1.95 kWh)"


def test_hors_des_sept_langues_la_virgule_suit_l_anglais_rendu(creer):
    """Relecture du 13/10, point 8 : un Home Assistant en suedois recoit
    l'anglais (le filet de `traduire`) ; ses kWh s'ecrivent donc a l'anglaise."""
    b = creer(config={"prevenir": {LV: True}}, partage={"loggia_alertes": {"service": "mobile"}})
    b.p.hass.config.language = "sv"
    cycle_d_une_heure(b)
    assert b.p.hass.services.appels[0][2]["message"] == "Prise lave-vaisselle: cycle finished at 14:40 (1.95 kWh)"


# ── Le journal du jour d'une prise (spec 8) ────────────────────────────────────

def test_le_journal_du_jour_d_une_prise_passe_par_les_manoeuvres_des_volets(creer, horloge):
    """`loggia/volets/manoeuvres` lit le journal de TOUS les modules pour l'entite
    qu'on lui nomme, volet ou non : les lignes de `prises` (le cycle), de
    `minuteurs` (la pose) et des autres modules (pour « Loggia, a 60 s pres »),
    depuis l'heure donnee. Rien a creer ; ce test garde la porte ouverte."""
    horloge.t = paris(23, 50, jour=12)
    b = creer()
    lancer(b.p.regles.noter("minuteurs", "minuteur", "poser", cibles=[LV], n=1, motif=("{n} min", {"n": 15})))
    cycle_d_une_heure(b)
    minuteurs = charger("minuteurs")
    m = minuteurs.LoggiaMinuteurs.__new__(minuteurs.LoggiaMinuteurs)
    m.hass, m.store, m.regles, m.table, m._rdv, m._ecoute = b.p.hass, b.p.store, b.p.regles, {}, {}, None
    lancer(m.async_poser(LV, 30))
    lancer(b.p.regles.noter("veilles", "creuses", "allumer", cibles=[LV, NAS], n=2))
    lancer(b.p.regles.noter("veilles", "creuses", "allumer", cibles=[NAS], n=1))
    volets = charger("volets")
    v = volets.LoggiaVolets.__new__(volets.LoggiaVolets)
    v.regles = b.p.regles
    reponse = lancer(v.async_manoeuvres(LV, paris(0, 0)))
    assert [(e["module"], e["quoi"]) for e in reponse["lignes"]] == [
        ("veilles", "allumer"), ("minuteurs", "poser"), ("prises", "cycle terminé"), ("prises", "cycle démarré")]
    assert reponse["couvre_depuis"] == paris(23, 50, jour=12), "la veille, avant minuit : hors du jour"
