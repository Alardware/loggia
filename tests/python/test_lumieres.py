"""Le carnet des lumieres : ce qu'il suit, ce qu'il note, ce qu'il garde (chantier Lumieres, L1 et spec 6).

Ce qui merite d'etre verrouille : le serveur suit les lampes de la maison, et
elles seules (L11) ; il note chaque allumage, extinction et reglage avec son
niveau et son contexte - le compte, l'automatisation ou le script qui l'a
lance ; une lampe eteinte garde son dernier niveau ; le carnet survit au
redemarrage, et ce qui a change pendant l'arret se note au retour.

Le temps est simule : `time.time` et `dt_util.now` suivent une horloge que le
test avance, et les ecritures differees (`async_call_later`) partent quand il
le dit. Jamais une vraie lampe : des doublures.
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
CHAMBRE, LINO, BUREAU = "light.ampoule_chambre", "light.ampoule_veilleuse_chambre_lino", "light.bureau"
EXTERIEUR = "switch.lumiere_exterieur"
Context = sys.modules["homeassistant.core"].Context


def lancer(coro):
    return asyncio.run(coro)


def paris(h, mi=0, s=0, jour=14):
    """Un instant d'octobre 2026 a Paris (le 14 est un mercredi), en secondes depuis 1970."""
    return datetime(2026, 10, jour, h, mi, s, tzinfo=PARIS).timestamp()


def note(when, state, bri=None, reglage=False, user=None, type_=None, nom=None):
    """Une note telle que le carnet l'ecrit : le format du logbook, plus `bri` et `reglage`."""
    return {"when": when, "state": state, "bri": bri, "reglage": reglage,
            "context_user_id": user, "context_event_type": type_, "context_name": nom}


class FauxEtat:
    def __init__(self, state, attributes=None, context=None, last_changed=None):
        self.state = state
        self.attributes = attributes or {}
        self.context = context or Context()
        self.last_changed = last_changed


class FauxEtats:
    def __init__(self, table):
        self.table = dict(table)

    def get(self, haid):
        return self.table.get(haid)

    def async_entity_ids(self, domaine):
        return [h for h in self.table if h.startswith(domaine + ".")]


class FauxBus:
    """Le bus de Home Assistant : qui ecoute quoi, et l'evenement qu'on tire."""

    def __init__(self, hass):
        self.hass = hass
        self.ecoutes = []
        # Retirer une ecoute deja partie : Home Assistant l'ecrit en erreur.
        self.retraits_rates = 0

    def _ecouter(self, type_, rappel, une_fois):
        e = {"type": type_, "rappel": rappel, "une_fois": une_fois}
        self.ecoutes.append(e)

        def retirer():
            if e in self.ecoutes:
                self.ecoutes.remove(e)
            else:
                self.retraits_rates += 1
        return retirer

    def async_listen(self, type_, rappel):
        return self._ecouter(type_, rappel, False)

    def async_listen_once(self, type_, rappel):
        return self._ecouter(type_, rappel, True)

    def tirer(self, type_, data=None, context=None):
        evenement = types.SimpleNamespace(event_type=type_, data=data or {}, context=context or Context())
        for e in [e for e in self.ecoutes if e["type"] == type_]:
            if e["une_fois"]:
                self.ecoutes.remove(e)
            retour = e["rappel"](evenement)
            if asyncio.iscoroutine(retour):
                self.hass.async_create_task(retour)
        self.hass.executer()


class FauxHass:
    def __init__(self, etats):
        self.states = FauxEtats(etats)
        self.bus = FauxBus(self)
        self.taches = []
        # `hass.data` : ce que le dechargement de l'integration ne vide pas.
        self.data = {}

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


def entree(entity_id):
    """Une entree du registre des entites, comme Home Assistant la tient."""
    return types.SimpleNamespace(entity_id=entity_id, entity_category=None, disabled_by=None)


def maison():
    """Sa maison, a peu pres (spec 0) : (registre, etats). Des Hue, un variateur
    Legrand, la LED d'une borne Wi-Fi (`config`), une lampe desactivee, une
    lampe hors registre (YAML), la prise declaree lumiere et une prise qui ne
    l'est pas. Tout est eteint."""
    lampes = {CHAMBRE: "Ampoule chambre", LINO: "Ampoule veilleuse chambre Lino", BUREAU: "Bureau",
              "light.ampoule_s1": "Ampoule S1", "light.led": "LED", "light.ancienne": "Ancienne lampe"}
    registre = types.SimpleNamespace(entities={h: entree(h) for h in [*lampes, EXTERIEUR, "switch.prise_nas"]})
    registre.entities["light.led"].entity_category = "config"
    registre.entities["light.ancienne"].disabled_by = "user"
    etats = {h: FauxEtat("off", {"friendly_name": n}) for h, n in lampes.items() if h != "light.ancienne"}
    etats["light.guirlande"] = FauxEtat("off", {"friendly_name": "Guirlande"})
    etats[EXTERIEUR] = FauxEtat("off", {"friendly_name": "Lumière extérieur"})
    etats["switch.prise_nas"] = FauxEtat("on", {"friendly_name": "Prise NAS"})
    return registre, etats


class Horloge:
    def __init__(self, t):
        self.t = t

    def __call__(self):
        return self.t


class Rendezvous:
    """`async_call_later` : retient chaque echeance, qui part quand le test le dit."""

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
        return sorted((e for e in self.poses if not e["annule"]), key=lambda e: e["quand"])


class Banc:
    """Le carnet dans sa maison, et le temps que le test fait passer."""

    def __init__(self, lum, hass, horloge, rdv, ecoutes, depot, registre, lectures):
        self.l, self.hass, self.horloge, self.rdv = lum, hass, horloge, rdv
        self.ecoutes, self.depot, self.registre, self.lectures = ecoutes, depot, registre, lectures

    def attendre(self, t):
        """Le temps passe jusqu'a `t` : chaque echeance due part, dans l'ordre."""
        while self.rdv.armees() and self.rdv.armees()[0]["quand"] <= t:
            e = self.rdv.armees()[0]
            self.horloge.t = max(self.horloge.t, e["quand"])
            e["annule"] = True
            e["rappel"](None)
            self.hass.executer()
        self.horloge.t = max(self.horloge.t, t)

    def publier(self, t, haid, state, attributes=None, context=None):
        """La lampe change a l'instant `t` : Home Assistant publie son etat."""
        self.attendre(t)
        vieux = self.hass.states.table.get(haid)
        neuf = FauxEtat(state, attributes, context, datetime.fromtimestamp(t, PARIS))
        self.hass.states.table[haid] = neuf
        for e in [e for e in self.ecoutes if not e["retiree"] and haid in e["ids"]]:
            e["rappel"](types.SimpleNamespace(data={"entity_id": haid, "old_state": vieux, "new_state": neuf}))
        self.hass.executer()

    def automatisme(self, t, type_, nom, context):
        """Une automatisation (ou un script) part a l'instant `t`, dans `context`."""
        self.attendre(t)
        self.hass.bus.tirer(type_, {"name": nom, "entity_id": "automation.x"}, context)

    def ecoutees(self):
        """Les lampes dont le carnet ecoute les changements, en ce moment."""
        actives = [e["ids"] for e in self.ecoutes if not e["retiree"]]
        return actives[-1] if actives else []

    def journal(self, haid, user=None):
        return lancer(self.l.async_journal(haid, user))["evenements"]

    def etat(self, user=None):
        return lancer(self.l.async_etat(user))


@pytest.fixture
def horloge(monkeypatch):
    """`time.time` et `dt_util.now` sur une horloge que le test avance : le
    mercredi 14/10/2026 a 18:00, a Paris."""
    h = Horloge(paris(18))
    monkeypatch.setattr(time, "time", h)
    monkeypatch.setattr(sys.modules["homeassistant.util.dt"], "now", lambda: datetime.fromtimestamp(h.t, PARIS))
    return h


@pytest.fixture
def creer(monkeypatch, store_module, horloge):
    """Fabrique le carnet dans sa maison, demarre comme Home Assistant le demarre.
    `carnet` : `.storage/loggia_lumieres_etat` ; `depot` : un autre fichier ;
    `partage` : des cles communes ; `etats` : une autre maison."""
    module = charger("lumieres")
    faits = []

    def fabrique(carnet=None, depot=None, partage=None, etats=None):
        reg, etats_maison = maison()
        etats = etats if etats is not None else etats_maison
        lectures = []

        def registre(_hass):
            lectures.append(1)
            return reg

        ev = sys.modules["homeassistant.helpers.event"]
        monkeypatch.setattr(sys.modules["homeassistant.helpers.entity_registry"], "async_get", registre)
        depot = depot or FauxStore(carnet)
        monkeypatch.setattr(sys.modules["homeassistant.helpers.storage"], "Store", lambda _h, _v, _c: depot)
        rdv, ecoutes = Rendezvous(horloge), []

        def suivre(_hass, ids, rappel):
            e = {"ids": list(ids), "rappel": rappel, "retiree": False}
            ecoutes.append(e)

            def retirer():
                e["retiree"] = True
            return retirer

        monkeypatch.setattr(ev, "async_call_later", rdv, raising=False)
        monkeypatch.setattr(ev, "async_track_state_change_event", suivre, raising=False)
        magasin = store_module.LoggiaStore.__new__(store_module.LoggiaStore)
        magasin._store = FauxStore({"users": {}, "migrated": True,
                                    "shared": {"loggia_switchlights": [EXTERIEUR], **(partage or {})}})
        magasin._ancien = FauxStore(None)
        magasin._data = None
        magasin._lock = asyncio.Lock()
        hass = FauxHass(etats)
        b = Banc(module.LoggiaLumieres(hass, magasin), hass, horloge, rdv, ecoutes, depot, reg, lectures)
        hass.executer()
        faits.append(b)
        return b

    yield fabrique
    for b in faits:
        b.hass.abandonner()


# ── Les lampes que le carnet suit (L11) ─────────────────────────────────────

def test_il_suit_les_lumieres_de_la_maison_et_l_interrupteur_declare(creer):
    """Ni la LED de la borne Wi-Fi (`config`), ni une lampe desactivee, ni une
    prise qui n'est pas declaree lumiere. La lampe hors registre, oui."""
    b = creer()
    attendu = sorted([CHAMBRE, LINO, BUREAU, "light.ampoule_s1", "light.guirlande", EXTERIEUR])
    assert sorted(b.l.suivies) == attendu
    assert b.ecoutees() == attendu


def test_les_interrupteurs_declares_se_lisent_comme_les_prises_les_lisent(creer):
    """`loggia_switchlights` absente : `switchLights` de `loggia_entities` - des `switch.*` seulement."""
    b = creer(partage={"loggia_switchlights": None,
                       "loggia_entities": {"switchLights": ["switch.prise_nas", "sensor.x", 5]}})
    assert sorted(h for h in b.l.suivies if not h.startswith("light.")) == ["switch.prise_nas"]


def test_une_lampe_ajoutee_au_registre_se_suit_aussitot(creer):
    """Pas seulement ecoutee : le carnet la prend dans l'etat ou elle est (`vu`), et
    son PREMIER geste se note - sans cela il passait pour son premier etat vu."""
    b = creer()
    b.registre.entities["light.lampadaire"] = entree("light.lampadaire")
    b.hass.states.table["light.lampadaire"] = FauxEtat("off", {"friendly_name": "Lampadaire"})
    b.hass.bus.tirer("entity_registry_updated", {"action": "create", "entity_id": "light.lampadaire"})
    assert "light.lampadaire" in b.ecoutees()
    b.publier(paris(18, 30), "light.lampadaire", "on", {"brightness": 128})
    assert b.journal("light.lampadaire") == [note(paris(18, 30), "on", 50)]
    b.registre.entities["light.lampadaire"].entity_category = "diagnostic"
    b.hass.bus.tirer("entity_registry_updated", {"action": "update", "entity_id": "light.lampadaire",
                                                 "changes": {"entity_category": None}})
    assert "light.lampadaire" not in b.ecoutees() and "light.lampadaire" not in b.l.carnet


def test_une_ampoule_appairee_dont_l_etat_n_est_pas_encore_la_ne_fait_pas_de_faux_geste(creer):
    """Le registre la connait avant qu'elle ait un etat ; son entite nait
    `unavailable`, puis donne son vrai etat : c'est son premier etat vu, pas un
    geste. Le premier geste d'apres se note."""
    b = creer()
    b.registre.entities["light.neuve"] = entree("light.neuve")
    b.hass.bus.tirer("entity_registry_updated", {"action": "create", "entity_id": "light.neuve"})
    assert b.journal("light.neuve") == []
    b.publier(paris(18, 20), "light.neuve", "unavailable", {})
    b.publier(paris(18, 21), "light.neuve", "off", {})
    assert b.journal("light.neuve") == []
    b.publier(paris(18, 22), "light.neuve", "on", {"brightness": 255})
    assert b.journal("light.neuve") == [note(paris(18, 22), "on", 100)]


def test_une_lampe_renommee_emporte_sa_fiche(creer):
    """Son historique ne part pas avec son ancien nom : la fiche (notes, `vu`,
    dernier niveau) passe sous le nouveau, et le premier geste d'apres se note."""
    b = creer()
    b.publier(paris(18, 5), BUREAU, "on", {"brightness": 204, "color_mode": "brightness"})
    b.publier(paris(22), BUREAU, "off", {})
    neuf = "light.bureau_de_papa"
    entree_bureau = b.registre.entities.pop(BUREAU)
    entree_bureau.entity_id = neuf
    b.registre.entities[neuf] = entree_bureau
    b.hass.states.table[neuf] = b.hass.states.table.pop(BUREAU)
    b.hass.bus.tirer("entity_registry_updated", {"action": "update", "entity_id": neuf, "old_entity_id": BUREAU,
                                                 "changes": {"entity_id": BUREAU}})
    assert BUREAU not in b.l.carnet and neuf in b.ecoutees() and BUREAU not in b.ecoutees()
    assert b.journal(neuf) == [note(paris(18, 5), "on", 80), note(paris(22), "off")]
    assert b.etat()["lumieres"][neuf]["dernier"]["bri"] == 80
    b.publier(paris(23), neuf, "on", {"brightness": 255})
    assert b.journal(neuf)[-1] == note(paris(23), "on", 100)
    # Une autre mise a jour du registre (une piece, un nom) ne deplace rien.
    b.hass.bus.tirer("entity_registry_updated", {"action": "update", "entity_id": neuf,
                                                 "changes": {"area_id": None}})
    assert len(b.journal(neuf)) == 3


def test_le_registre_d_une_autre_entite_ne_fait_rien_relire(creer):
    b = creer()
    lus = len(b.lectures)
    b.hass.bus.tirer("entity_registry_updated", {"action": "create", "entity_id": "sensor.co2_salon"})
    assert len(b.lectures) == lus


def test_un_interrupteur_declare_lumiere_se_suit_des_le_rechargement(creer):
    """Parametres > Entites ecrit `loggia_switchlights` ; le rechargement
    (rechargement.py) appelle `async_enregistrer({})`, et l'interrupteur se suit
    tout de suite."""
    b = creer()
    lancer(b.l.store.async_set_shared("loggia_switchlights", [EXTERIEUR, "switch.prise_nas"]))
    lancer(b.l.async_enregistrer({}))
    assert "switch.prise_nas" in b.ecoutees()
    # La prise etait allumee depuis des semaines : le carnet la prend telle quelle
    # (`vu`), et son premier geste - l'extinction - se NOTE. Un interrupteur n'a
    # pas de niveau : son `dernier` est None, pas une table de None (audit du 19/10).
    assert b.etat()["lumieres"]["switch.prise_nas"] == {"dernier": None}
    b.publier(paris(18, 40), "switch.prise_nas", "off", {})
    assert b.journal("switch.prise_nas") == [note(paris(18, 40), "off")]
    lancer(b.l.store.async_set_shared("loggia_switchlights", []))
    lancer(b.l.async_enregistrer({}))
    assert EXTERIEUR not in b.l.suivies


def test_une_lampe_qui_n_est_plus_suivie_quitte_le_carnet(creer):
    b = creer()
    b.publier(paris(18, 5), BUREAU, "on", {"brightness": 255})
    del b.registre.entities[BUREAU]
    del b.hass.states.table[BUREAU]
    b.hass.bus.tirer("entity_registry_updated", {"action": "remove", "entity_id": BUREAU})
    assert BUREAU not in b.l.carnet and b.journal(BUREAU) == []


def test_un_registre_illisible_garde_les_lampes_et_se_dit_une_fois(creer, monkeypatch, caplog):
    b = creer()
    avant = set(b.l.suivies)

    def casse(_hass):
        raise RuntimeError("registre indisponible")

    monkeypatch.setattr(sys.modules["homeassistant.helpers.entity_registry"], "async_get", casse)
    caplog.set_level(logging.WARNING)
    for _ in range(3):
        lancer(b.l.async_enregistrer({}))
    assert b.l.suivies == avant
    assert len([r for r in caplog.records if "registre illisible" in r.getMessage()]) == 1


# ── Ce que le carnet note, et qui (spec 6.1) ────────────────────────────────

def test_au_premier_demarrage_rien_ne_se_note(creer):
    """Le tout premier etat vu n'est pas un geste. Une lampe deja allumee donne
    pourtant son niveau."""
    _, etats = maison()
    etats[CHAMBRE] = FauxEtat("on", {"brightness": 204, "color_mode": "color_temp", "color_temp_kelvin": 4000})
    b = creer(etats=etats)
    assert all(f["evenements"] == [] for f in b.l.carnet.values())
    assert b.etat()["lumieres"][CHAMBRE] == {"dernier": {"bri": 80, "mode": "color_temp", "kelvin": 4000,
                                                         "hs": None}}


def test_un_allumage_depuis_l_application_porte_son_compte(creer):
    b = creer()
    b.publier(paris(20, 10), CHAMBRE, "on", {"brightness": 115, "color_mode": "color_temp",
                                             "color_temp_kelvin": 2700}, Context(user_id="u-papa"))
    assert b.journal(CHAMBRE) == [note(paris(20, 10), "on", 45, user="u-papa")]


def test_l_interrupteur_mural_ne_laisse_ni_compte_ni_nom(creer):
    b = creer()
    b.publier(paris(18, 5), BUREAU, "on", {"brightness": 255})
    assert b.journal(BUREAU) == [note(paris(18, 5), "on", 100)]


def test_une_automatisation_donne_son_nom(creer):
    """« Coucher de Lino » allume la veilleuse : le contexte qu'elle a ouvert la
    nomme (`automation_triggered`)."""
    b = creer()
    ctx = Context()
    b.automatisme(paris(20, 30), "automation_triggered", "Coucher de Lino", ctx)
    b.publier(paris(20, 30, 1), LINO, "on", {"brightness": 38, "color_mode": "xy", "hs_color": (275.0, 100.0)},
              ctx)
    assert b.journal(LINO) == [note(paris(20, 30, 1), "on", 15, type_="automation_triggered",
                                    nom="Coucher de Lino")]


def test_un_script_lance_par_une_automatisation_reste_l_automatisation(creer):
    """Le premier venu garde le contexte, comme dans le logbook. Un script seul se
    nomme (`script_started`), et le compte qui l'a lance reste."""
    b = creer()
    ctx = Context()
    b.automatisme(paris(20, 30), "automation_triggered", "Soirée", ctx)
    b.automatisme(paris(20, 30), "script_started", "Ambiance", ctx)
    b.publier(paris(20, 30, 1), BUREAU, "on", {"brightness": 255}, ctx)
    seul = Context(user_id="u-papa")
    b.automatisme(paris(21), "script_started", "Film", seul)
    b.publier(paris(21, 0, 2), CHAMBRE, "on", {"brightness": 51}, seul)
    assert b.journal(BUREAU)[0]["context_name"] == "Soirée"
    assert b.journal(CHAMBRE) == [note(paris(21, 0, 2), "on", 20, user="u-papa", type_="script_started",
                                       nom="Film")]


def test_le_parent_du_contexte_compte_aussi(creer):
    b = creer()
    ctx = Context()
    b.automatisme(paris(6, 45), "automation_triggered", "Réveil", ctx)
    b.publier(paris(6, 45, 1), BUREAU, "on", {"brightness": 255}, Context(parent_id=ctx.id))
    assert b.journal(BUREAU)[0]["context_name"] == "Réveil"


def test_un_lien_ne_vaut_qu_une_heure(creer):
    """Une automatisation qui attend (`delay`) moins d'une heure garde son nom ;
    au-dela, le contexte ne dit plus rien."""
    b = creer()
    ctx = Context()
    b.automatisme(paris(19), "automation_triggered", "Coucher du soleil", ctx)
    b.publier(paris(19, 59), EXTERIEUR, "on", {}, ctx)
    b.publier(paris(20, 1), EXTERIEUR, "off", {}, ctx)
    assert [(n["state"], n["context_name"]) for n in b.journal(EXTERIEUR)] == [
        ("on", "Coucher du soleil"), ("off", None)]


def test_le_dernier_niveau_reste_quand_la_lampe_s_eteint(creer):
    b = creer()
    b.publier(paris(18, 5), BUREAU, "on", {"brightness": 204, "color_mode": "brightness"})
    b.publier(paris(22), BUREAU, "off", {})
    assert b.etat()["lumieres"][BUREAU] == {"dernier": {"bri": 80, "mode": "brightness", "kelvin": None,
                                                        "hs": None}}


def test_recharger_une_integration_ne_fait_pas_taire_les_lampes(creer):
    """Quand on recharge MQTT, Home Assistant pose lui-meme sur chaque entite un
    etat `unavailable` avec `restored: true`, puis elle revient : les lampes ne
    « ne repondent plus » pas pour autant (relecture du 14/10)."""
    b = creer()
    clair = {"brightness": 204, "color_mode": "brightness"}
    b.publier(paris(18, 5), BUREAU, "on", clair)
    notes, niveau = b.journal(BUREAU), b.etat()["lumieres"][BUREAU]
    lampes = sorted(b.l.suivies)
    for haid in lampes:
        b.publier(paris(18, 10), haid, "unavailable", {"restored": True, "supported_features": 40})
    assert all(b.journal(h) == (notes if h == BUREAU else []) for h in lampes)
    assert b.etat()["lumieres"][BUREAU] == niveau, "le dernier niveau reste"
    # L'integration est revenue : chaque lampe retrouve son etat - la chambre a ete
    # allumee entre-temps, et cela, c'est un geste.
    for haid in lampes:
        if haid == BUREAU:
            b.publier(paris(18, 10, 40), haid, "on", clair)
        elif haid == CHAMBRE:
            b.publier(paris(18, 10, 40), haid, "on", {"brightness": 128})
        else:
            b.publier(paris(18, 10, 40), haid, "off", {})
    assert b.journal(BUREAU) == notes
    assert b.journal(CHAMBRE) == [note(paris(18, 10, 40), "on", 50)]
    assert all(b.journal(h) == [] for h in lampes if h not in (BUREAU, CHAMBRE))


def test_une_lampe_encore_inconnue_au_demarrage_ne_fait_pas_de_faux_geste(creer):
    """A l'installation : une ampoule Zigbee2MQTT est `unknown` jusqu'a ce qu'elle
    republie (une trentaine de secondes). Le carnet ne prend pas `unknown` pour
    son etat : son retour est le premier etat qu'il voit d'elle, pas un
    allumage."""
    _, etats = maison()
    etats[CHAMBRE] = FauxEtat("unknown", {"friendly_name": "Ampoule chambre"})
    etats[LINO] = FauxEtat("unavailable", {"friendly_name": "Veilleuse"})
    etats[BUREAU] = FauxEtat("unavailable", {"restored": True, "friendly_name": "Bureau"})
    b = creer(etats=etats)
    b.publier(paris(18, 0, 30), CHAMBRE, "on", {"brightness": 115})
    b.publier(paris(18, 0, 31), LINO, "off", {})
    b.publier(paris(18, 0, 32), BUREAU, "on", {"brightness": 255})
    assert [b.journal(h) for h in (CHAMBRE, LINO, BUREAU)] == [[], [], []]
    assert b.etat()["lumieres"][CHAMBRE]["dernier"]["bri"] == 45
    # Elles ont maintenant un etat : leurs gestes se notent.
    b.publier(paris(18, 5), CHAMBRE, "off", {})
    b.publier(paris(18, 6), LINO, "on", {"brightness": 38})
    assert b.journal(CHAMBRE) == [note(paris(18, 5), "off")]
    assert b.journal(LINO) == [note(paris(18, 6), "on", 15)]


# ── L'echo d'une extinction en fondu (doute D2, vu chez lui le 15/10) ───────

# La veilleuse de Lino, une Hue couleur, dans son violet.
VIOLET = {"color_mode": "xy", "hs_color": (305.0, 74.9)}
VIOLET_22 = {"bri": 22, "mode": "xy", "kelvin": None, "hs": [305.0, 74.9]}


def quinze(h, mi=0, s=0):
    """Le jeudi 15/10, le soir ou l'echo s'est vu chez lui."""
    return paris(h, mi, s, jour=15)


def eteindre_en_fondu(b):
    """Sa veilleuse le 15/10 : allumee a 22 % a 18:11:25, eteinte avec une transition
    a 18:31:45 ; deux secondes plus tard, l'ampoule remonte un etat du milieu du
    fondu, `on` a 2 %."""
    b.publier(quinze(18, 11, 25), LINO, "on", dict(VIOLET, brightness=56))
    b.publier(quinze(18, 31, 45), LINO, "off", {})
    b.publier(quinze(18, 31, 47), LINO, "on", dict(VIOLET, brightness=5))


def test_l_echo_d_une_extinction_en_fondu_ne_se_note_pas(creer):
    """Son carnet du 15/10 : `off`, `on` a 2 % deux secondes plus tard, `off` sept
    secondes apres. Le journal ne garde qu'UNE extinction, sans « Allumee a 2 % »,
    et la lampe se rallumera a 22 %. Pendant le doute deja, l'ecran ne lit ni
    l'allumage ni ses 2 % ; et le fichier n'en garde rien."""
    b = creer()
    eteindre_en_fondu(b)
    avant = [note(quinze(18, 11, 25), "on", 22), note(quinze(18, 31, 45), "off")]
    assert b.journal(LINO) == avant and b.etat()["lumieres"][LINO] == {"dernier": VIOLET_22}
    b.publier(quinze(18, 31, 54), LINO, "off", {})
    assert b.journal(LINO) == avant and b.etat()["lumieres"][LINO] == {"dernier": VIOLET_22}
    b.attendre(quinze(18, 33))
    assert b.depot.contenu[LINO]["evenements"] == avant and b.depot.contenu[LINO]["dernier"] == VIOLET_22


def test_un_vrai_rallumage_se_dit_passe_le_doute(creer):
    """Rallumee deux secondes apres l'extinction, elle RESTE allumee : passe le doute
    (ECHO_S), le journal dit l'allumage a son heure, le fichier le garde, et son
    niveau devient le dernier."""
    b = creer()
    eteindre_en_fondu(b)
    b.attendre(quinze(18, 31, 57))
    assert b.journal(LINO)[-1] == note(quinze(18, 31, 47), "on", 2)
    assert b.etat()["lumieres"][LINO]["dernier"]["bri"] == 2
    b.attendre(quinze(18, 32, 5))
    assert b.depot.contenu[LINO]["evenements"][-1] == note(quinze(18, 31, 47), "on", 2)
    b.publier(quinze(19), LINO, "off", {})
    assert [n["state"] for n in b.journal(LINO)] == ["on", "off", "on", "off"]
    assert b.etat()["lumieres"][LINO]["dernier"]["bri"] == 2


@pytest.mark.parametrize("ecriture", ["differee", "dechargement", "arret_de_home_assistant"])
def test_un_echo_en_cours_a_l_ecriture_ne_laisse_pas_de_faux_dernier(creer, horloge, ecriture):
    """Le fichier s'ecrit en plein echo : l'ecriture differee d'une autre note, le
    dechargement, l'arret de Home Assistant. Il ne garde ni « Allumee a 2 % » ni
    2 % pour dernier niveau. Au redemarrage, la veilleuse passe par l'etat que Home
    Assistant pose lui-meme (`restored`, ignore : passe 6 bis), puis revient
    eteinte, bien plus de ECHO_S apres - l'echo ne s'y reconnaitrait plus : rien de
    plus a noter, et elle se rallumera a 22 %."""
    b = creer()
    b.publier(quinze(18, 11, 25), LINO, "on", dict(VIOLET, brightness=56))
    if ecriture == "differee":
        # Le bureau s'allume juste avant : l'ecriture de sa note part a 18:31:50.
        b.publier(quinze(18, 31, 30), BUREAU, "on", {"brightness": 255})
    b.publier(quinze(18, 31, 45), LINO, "off", {})
    b.publier(quinze(18, 31, 47), LINO, "on", dict(VIOLET, brightness=5))
    ecrites = b.depot.ecritures
    if ecriture == "differee":
        b.attendre(quinze(18, 31, 50))
    elif ecriture == "dechargement":
        b.l.async_arreter()
        b.hass.executer()
    else:
        b.hass.bus.tirer("homeassistant_stop")
    assert b.depot.ecritures == ecrites + 1
    eteinte = note(quinze(18, 31, 45), "off")
    ecrit = b.depot.contenu[LINO]
    assert ecrit["evenements"][-1] == eteinte and ecrit["vu"] == {"state": "off", "bri": None}
    assert ecrit["dernier"] == VIOLET_22
    etats = dict(b.hass.states.table)
    etats[LINO] = FauxEtat("unavailable", {"restored": True, "supported_features": 44}, None,
                           datetime.fromtimestamp(quinze(18, 33), PARIS))
    horloge.t = quinze(18, 33, 10)
    relu = creer(carnet=b.depot.contenu, etats=etats)
    relu.publier(quinze(18, 33, 30), LINO, "off", {})
    assert relu.journal(LINO) == [note(quinze(18, 11, 25), "on", 22), eteinte]
    assert relu.etat()["lumieres"][LINO]["dernier"] == VIOLET_22


# ── La fenetre de demarrage (doute D1, vu chez lui le 16/10) ────────────────

# Allumee a 100 %, comme ses cinq lampes allumees au redemarrage du 16/10.
PLEIN = {"brightness": 255, "color_mode": "brightness"}


def seize(h, mi=0, s=0):
    """Le vendredi 16/10, le jour de son redemarrage de 14:28."""
    return paris(h, mi, s, jour=16)


def avant_le_redemarrage(creer, horloge):
    """Sa maison le 16/10 jusqu'au redemarrage de 14:28 : le bureau allume a 07:00 et
    eteint a 08:00, la chambre allumee a 100 % a 12:00, le reste eteint ; le carnet est
    ecrit. Rend les notes de chaque lampe suivie, le carnet ecrit et les etats."""
    horloge.t = seize(6)
    b = creer()
    b.publier(seize(7), BUREAU, "on", {"brightness": 128})
    b.publier(seize(8), BUREAU, "off", {})
    b.publier(seize(12), CHAMBRE, "on", PLEIN)
    b.attendre(seize(12, 1))
    return {h: b.journal(h) for h in b.l.suivies}, b.depot.contenu, dict(b.hass.states.table)


def muettes(etats, haids):
    """Au demarrage, leur integration n'a pas encore parle : `unknown` depuis 14:28:21,
    sans `restored`."""
    etats = dict(etats)
    for haid in haids:
        etats[haid] = FauxEtat("unknown", {"friendly_name": haid}, None,
                               datetime.fromtimestamp(seize(14, 28, 21), PARIS))
    return etats


class Demarrage:
    """`async_at_started` pendant que Home Assistant demarre : le rappel attend que le
    test dise `homeassistant_started` (`dire`)."""

    def __init__(self):
        self.rappels = []

    def __call__(self, hass, rappel):
        e = (hass, rappel)
        self.rappels.append(e)

        def annuler():
            if e in self.rappels:
                self.rappels.remove(e)
        return annuler

    def dire(self):
        rappels, self.rappels = self.rappels, []
        for hass, rappel in rappels:
            retour = rappel(hass)
            if asyncio.iscoroutine(retour):
                hass.async_create_task(retour)
            hass.executer()


def test_le_redemarrage_du_16_10_ne_fait_plus_de_fausses_notes(creer, horloge):
    """Son redemarrage du 16/10 : au demarrage de Loggia, ses lampes existaient,
    `unknown` depuis 14:28:21 et sans `restored` - leur integration n'avait pas encore
    parle -, et leur vrai etat, celui d'avant, est arrive a 14:29:50. Le carnet notait
    « unknown » puis l'etat d'avant : vingt-huit fausses notes, a chaque redemarrage.
    Ici pas une : ni pendant la fenetre de demarrage - le fichier, ecrit entre-temps,
    n'en garde rien -, ni apres. La chambre, allumee a 100 %, se rallumera a 100 %."""
    notes, ecrit, etats = avant_le_redemarrage(creer, horloge)
    lampes = sorted(notes)
    horloge.t = seize(14, 28, 21)
    relu = creer(carnet=ecrit, etats=muettes(etats, lampes))
    relu.attendre(seize(14, 29, 49))
    assert {h: relu.journal(h) for h in lampes} == notes
    assert relu.depot.ecritures == 1 and relu.depot.contenu == ecrit, "ecrit pendant le doute, sans rien de lui"
    for haid in lampes:
        relu.publier(seize(14, 29, 50), haid, "on" if haid == CHAMBRE else "off", PLEIN if haid == CHAMBRE else {})
    relu.attendre(seize(14, 40))
    assert {h: relu.journal(h) for h in lampes} == notes
    assert relu.depot.contenu == ecrit
    assert relu.etat()["lumieres"][CHAMBRE]["dernier"]["bri"] == 100


def test_une_lampe_touchee_pendant_l_arret_fait_une_seule_note(creer, horloge):
    """Pendant l'arret, quelqu'un a allume le bureau a l'interrupteur mural ; au
    demarrage, une automatisation eteint la chambre. Leur vrai etat, quand il arrive
    apres le `unknown`, n'est plus celui d'avant : UNE note chacune, a l'heure ou il
    arrive, avec son niveau et son contexte. Le bureau se rallumera a 45 %."""
    notes, ecrit, etats = avant_le_redemarrage(creer, horloge)
    horloge.t = seize(14, 28, 21)
    relu = creer(carnet=ecrit, etats=muettes(etats, [BUREAU, CHAMBRE]))
    relu.publier(seize(14, 29, 50), BUREAU, "on", {"brightness": 115})
    ctx = Context()
    relu.automatisme(seize(14, 29, 55), "automation_triggered", "Démarrage", ctx)
    relu.publier(seize(14, 29, 56), CHAMBRE, "off", {}, ctx)
    relu.attendre(seize(14, 40))
    assert relu.journal(BUREAU) == notes[BUREAU] + [note(seize(14, 29, 50), "on", 45)]
    assert relu.journal(CHAMBRE) == notes[CHAMBRE] + [
        note(seize(14, 29, 56), "off", type_="automation_triggered", nom="Démarrage")]
    assert relu.etat()["lumieres"][BUREAU]["dernier"]["bri"] == 45
    assert relu.depot.contenu[BUREAU]["evenements"] == relu.journal(BUREAU)


def test_une_lampe_encore_muette_a_la_fermeture_ne_repond_plus(creer, horloge):
    """Deux minutes apres le demarrage, la chambre n'a toujours rien dit : ce n'est pas
    son integration qui tarde, elle ne repond plus. UNE note, a l'heure ou elle s'est
    tue, a la fermeture de la fenetre - pas avant -, et le fichier la garde. Son retour
    se note ensuite comme apres toute panne."""
    notes, ecrit, etats = avant_le_redemarrage(creer, horloge)
    horloge.t = seize(14, 28, 21)
    relu = creer(carnet=ecrit, etats=muettes(etats, [CHAMBRE]))
    relu.attendre(seize(14, 30, 20))
    assert relu.journal(CHAMBRE) == notes[CHAMBRE]
    relu.attendre(seize(14, 30, 21))
    muette = notes[CHAMBRE] + [note(seize(14, 28, 21), "unknown")]
    assert relu.journal(CHAMBRE) == muette
    relu.attendre(seize(14, 30, 41))
    assert relu.depot.contenu[CHAMBRE]["evenements"] == muette
    relu.publier(seize(15), CHAMBRE, "on", PLEIN)
    assert relu.journal(CHAMBRE) == muette + [note(seize(15), "on", 100)]


def test_hors_de_la_fenetre_une_lampe_qui_decroche_se_note_comme_avant(creer, horloge):
    """Deux minutes apres le demarrage, la fenetre est fermee : une lampe qui decroche
    se note a son heure, et son retour aussi."""
    horloge.t = seize(9)
    b = creer()
    b.publier(seize(9, 2), BUREAU, "unavailable", {})
    assert b.journal(BUREAU) == [note(seize(9, 2), "unavailable")]
    b.publier(seize(9, 3), BUREAU, "off", {})
    assert b.journal(BUREAU) == [note(seize(9, 2), "unavailable"), note(seize(9, 3), "off")]


def test_un_arret_en_pleine_fenetre_reprend_proprement(creer, horloge):
    """Home Assistant s'arrete en pleine fenetre de demarrage, la chambre encore
    `unknown`. Le fichier, ecrit pendant la fenetre puis a l'arret, garde la chambre
    telle qu'avant son silence, et le geste du bureau. Au redemarrage suivant, la
    chambre passe par l'etat que Home Assistant pose lui-meme (`restored`), puis
    `unknown`, puis revient comme elle etait : pas une fausse note."""
    notes, ecrit, etats = avant_le_redemarrage(creer, horloge)
    horloge.t = seize(14, 28, 21)
    relu = creer(carnet=ecrit, etats=muettes(etats, [CHAMBRE]))
    relu.attendre(seize(14, 28, 41))
    assert relu.depot.ecritures == 1 and relu.depot.contenu[CHAMBRE] == ecrit[CHAMBRE]
    relu.publier(seize(14, 29, 10), BUREAU, "on", {"brightness": 128}, Context(user_id="u-papa"))
    relu.hass.bus.tirer("homeassistant_stop")
    garde = relu.depot.contenu
    assert relu.depot.ecritures == 2 and garde[CHAMBRE] == ecrit[CHAMBRE], "rien du doute"
    assert garde[BUREAU]["evenements"][-1] == note(seize(14, 29, 10), "on", 50, user="u-papa")
    etats = dict(relu.hass.states.table)
    etats[CHAMBRE] = FauxEtat("unavailable", {"restored": True, "supported_features": 44}, None,
                              datetime.fromtimestamp(seize(14, 31), PARIS))
    horloge.t = seize(14, 31, 20)
    rerelu = creer(carnet=garde, etats=etats)
    rerelu.publier(seize(14, 31, 40), CHAMBRE, "unknown", {})
    rerelu.publier(seize(14, 33), CHAMBRE, "on", PLEIN)
    rerelu.attendre(seize(14, 40))
    assert rerelu.journal(CHAMBRE) == notes[CHAMBRE]
    assert rerelu.depot.contenu[CHAMBRE]["evenements"] == notes[CHAMBRE]
    assert rerelu.journal(BUREAU) == notes[BUREAU] + [note(seize(14, 29, 10), "on", 50, user="u-papa")]


@pytest.mark.parametrize("started, fermeture", [(41, 161), (250, 300), (360, 300), (None, 300)])
def test_la_fenetre_se_ferme_deux_minutes_apres_started_cinq_au_plus_apres_la_naissance(
        creer, horloge, monkeypatch, started, fermeture):
    """Loggia nait pendant que Home Assistant demarre. La fenetre se ferme deux minutes
    apres `homeassistant_started` - pas deux minutes apres la naissance du carnet -, et
    jamais plus de cinq minutes apres elle : un demarrage qui tarde (250 s), ou qui ne
    se dit jamais, ne la tient pas ouverte. Un `started` qui arrive apres (360 s) la
    trouve fermee : la lampe muette se note aussitot, comme avant."""
    notes, ecrit, etats = avant_le_redemarrage(creer, horloge)
    demarrage = Demarrage()
    monkeypatch.setattr(sys.modules["homeassistant.helpers.start"], "async_at_started", demarrage)
    naissance = horloge.t = seize(14, 28)
    relu = creer(carnet=ecrit, etats=muettes(etats, [CHAMBRE]))
    muette = notes[CHAMBRE] + [note(seize(14, 28, 21), "unknown")]
    a_temps = started is not None and started < fermeture
    if a_temps:
        relu.attendre(naissance + started)
        demarrage.dire()
    relu.attendre(naissance + fermeture - 1)
    assert relu.journal(CHAMBRE) == notes[CHAMBRE]
    assert [e["quand"] for e in relu.rdv.armees()] == [naissance + fermeture]
    relu.attendre(naissance + fermeture)
    assert relu.journal(CHAMBRE) == (muette if a_temps else notes[CHAMBRE])
    if started is not None and not a_temps:
        relu.attendre(naissance + started)
        demarrage.dire()
        assert relu.journal(CHAMBRE) == muette, "la fenetre etait fermee : elle se note aussitot"


# ── Ce que l'ecran lit (spec 6.2) ───────────────────────────────────────────

def test_l_etat_dit_l_heure_et_chaque_lampe_suivie(creer, horloge):
    b = creer()
    etat = b.etat()
    assert etat["maintenant"] == horloge.t == paris(18)
    assert sorted(etat["lumieres"]) == sorted(b.l.suivies)
    assert etat["lumieres"][CHAMBRE] == {"dernier": None}, "jamais vue allumee : rien a dire"


def test_le_journal_part_de_la_veille_et_garde_l_etat_d_avant(creer, horloge):
    """Depuis la veille a 00:00, dans l'ordre du temps, et la derniere note
    d'avant : l'etat de la lampe quand la fenetre s'ouvre."""
    horloge.t = paris(9, jour=11)
    b = creer()
    for jour, h, etat in ((11, 18, "on"), (11, 23, "off"), (12, 7, "on"), (13, 18, "off"), (14, 7, "on")):
        b.publier(paris(h, jour=jour), BUREAU, etat, {"brightness": 255} if etat == "on" else {})
    assert [(n["when"], n["state"]) for n in b.journal(BUREAU)] == [
        (paris(7, jour=12), "on"), (paris(18, jour=13), "off"), (paris(7, jour=14), "on")]
    assert b.journal("light.inconnue") == []


def test_un_compte_restreint_ne_lit_que_ses_lampes(creer):
    """La garde de lecture de l'etat du chauffage (`_lecture_autorisee`) : l'etat
    tait les lampes que le compte ne lit pas, le journal les refuse."""
    b = creer()
    b.publier(paris(18, 5), BUREAU, "on", {"brightness": 255})
    lea = types.SimpleNamespace(id="u-lea", is_admin=False, permissions=types.SimpleNamespace(
        check_entity=lambda haid, quoi: quoi == "read" and haid == CHAMBRE))
    assert list(b.etat(lea)["lumieres"]) == [CHAMBRE]
    with pytest.raises(PermissionError):
        b.journal(BUREAU, lea)
    assert b.journal(CHAMBRE, lea) == []
    papa = types.SimpleNamespace(id="u-papa", is_admin=True, permissions=None)
    assert len(b.journal(BUREAU, papa)) == 1


def test_l_arret_se_tait(creer):
    b = creer()
    b.l.async_arreter()
    assert b.ecoutees() == [] and b.hass.bus.ecoutes == []
    assert b.rdv.armees() == [], "ni l'ecriture, ni la fermeture de la fenetre de demarrage (D1)"
    b.publier(paris(19), BUREAU, "on", {"brightness": 255})
    assert b.journal(BUREAU) == []


# ── Le carnet garde ce qu'il a vu (spec 6.1) ────────────────────────────────

def test_le_carnet_s_ecrit_vingt_secondes_apres_la_premiere_note(creer):
    b = creer()
    b.attendre(paris(18, 1))
    ecrites = b.depot.ecritures
    b.publier(paris(18, 5), BUREAU, "on", {"brightness": 255})
    b.publier(paris(18, 5, 10), BUREAU, "on", {"brightness": 128})
    assert b.depot.ecritures == ecrites, "pas a chaque note"
    b.attendre(paris(18, 5, 20))
    assert b.depot.ecritures == ecrites + 1
    assert b.depot.contenu[BUREAU]["evenements"] == [note(paris(18, 5), "on", 50)]


def blanc(kelvin):
    """Une lampe allumee a 80 %, en blanc."""
    return {"brightness": 204, "color_mode": "color_temp", "color_temp_kelvin": kelvin}


def test_un_blanc_qui_glisse_ne_reecrit_pas_le_fichier_toutes_les_vingt_secondes(creer):
    """Un eclairage adaptatif fait glisser la temperature de 10 K toutes les 20 s,
    toute la journee : ni note, ni changement de `vu`, seulement `dernier`. Reecrire
    tout le fichier (0,3 Mo) a chaque fois n'a pas de sens : cinq minutes suffisent
    (relecture du 14/10)."""
    b = creer()
    b.attendre(paris(18, 1))
    t0 = paris(18, 5)
    b.publier(t0, BUREAU, "on", blanc(2700))
    b.attendre(t0 + 20)
    ecrites = b.depot.ecritures
    for i in range(1, 15):
        b.publier(t0 + 20 * i, BUREAU, "on", blanc(2700 + 10 * i))
    assert b.depot.ecritures == ecrites, "pres de cinq minutes de blanc qui glisse : pas une ecriture"
    b.attendre(t0 + 20 + 299)
    assert b.depot.ecritures == ecrites
    b.attendre(t0 + 20 + 300)
    assert b.depot.ecritures == ecrites + 1
    assert b.depot.contenu[BUREAU]["dernier"]["kelvin"] == 2840, "et le fichier a la derniere valeur"
    assert b.rdv.armees() == []


def test_une_note_double_l_ecriture_lente(creer):
    """Le delai long ne retient pas un geste : une note qui arrive pendant qu'il
    attend ramene l'ecriture a vingt secondes."""
    b = creer()
    b.attendre(paris(18, 1))
    t0 = paris(18, 5)
    b.publier(t0, BUREAU, "on", blanc(2700))
    b.attendre(t0 + 20)
    b.publier(t0 + 30, BUREAU, "on", blanc(2800))
    assert b.rdv.armees()[0]["quand"] == t0 + 30 + 300
    ecrites = b.depot.ecritures
    b.publier(t0 + 100, BUREAU, "off", {})
    assert [e["quand"] for e in b.rdv.armees()] == [t0 + 100 + 20], "une seule echeance, la courte"
    b.attendre(t0 + 100 + 19)
    assert b.depot.ecritures == ecrites
    b.attendre(t0 + 100 + 20)
    assert b.depot.ecritures == ecrites + 1
    assert b.depot.contenu[BUREAU]["evenements"][-1] == note(t0 + 100, "off")
    assert b.rdv.armees() == []


def test_un_blanc_qui_glisse_ne_retarde_pas_une_note_qui_attend(creer):
    """L'echeance courte d'une note reste la sienne : le blanc qui glisse ensuite
    ne la repousse pas, et ne s'ajoute pas."""
    b = creer()
    b.attendre(paris(18, 1))
    t0 = paris(18, 5)
    b.publier(t0, BUREAU, "on", blanc(2700))
    b.publier(t0 + 10, BUREAU, "on", blanc(2710))
    assert [e["quand"] for e in b.rdv.armees()] == [t0 + 20]


@pytest.mark.parametrize("arret", ["dechargement", "arret_de_home_assistant"])
def test_ce_qui_attend_lentement_part_quand_meme_a_l_arret(creer, arret):
    """Le delai long ne vaut que pour la routine : au dechargement de l'integration
    et a l'arret de Home Assistant, ce qui attend part tout de suite, comme avant."""
    b = creer()
    b.attendre(paris(18, 1))
    t0 = paris(18, 5)
    b.publier(t0, BUREAU, "on", blanc(2700))
    b.attendre(t0 + 20)
    b.publier(t0 + 30, BUREAU, "on", blanc(2800))
    ecrites = b.depot.ecritures
    if arret == "dechargement":
        b.l.async_arreter()
        b.hass.executer()
    else:
        b.hass.bus.tirer("homeassistant_stop")
    assert b.depot.ecritures == ecrites + 1 and b.depot.contenu[BUREAU]["dernier"]["kelvin"] == 2800
    assert b.rdv.armees() == []


def test_le_carnet_survit_au_redemarrage(creer):
    b = creer()
    b.publier(paris(18, 5), BUREAU, "on", {"brightness": 204}, Context(user_id="u-papa"))
    b.publier(paris(22), BUREAU, "off", {})
    b.attendre(paris(22, 1))
    relu = creer(carnet=b.depot.contenu, etats=b.hass.states.table)
    assert relu.journal(BUREAU) == [note(paris(18, 5), "on", 80, user="u-papa"), note(paris(22), "off")]
    assert relu.etat()["lumieres"][BUREAU]["dernier"]["bri"] == 80


def test_ce_qui_a_change_pendant_l_arret_se_note_au_retour(creer, horloge):
    """Eteinte avant l'arret, allumee au retour : l'allumage se note a l'heure de
    son etat (`last_changed`). Muette au retour, et encore a la fermeture de la
    fenetre de demarrage (D1) : « Ne repond plus », a l'heure ou elle s'est tue."""
    b = creer()
    b.publier(paris(18, 5), BUREAU, "on", {"brightness": 204})
    b.publier(paris(22), BUREAU, "off", {})
    b.attendre(paris(22, 1))
    etats = dict(b.hass.states.table)
    etats[BUREAU] = FauxEtat("on", {"brightness": 102}, None, datetime.fromtimestamp(paris(22, 30), PARIS))
    etats[CHAMBRE] = FauxEtat("unavailable", {}, None, datetime.fromtimestamp(paris(22, 40), PARIS))
    horloge.t = paris(23)
    relu = creer(carnet=b.depot.contenu, etats=etats)
    assert relu.journal(BUREAU)[-1] == note(paris(22, 30), "on", 40)
    relu.attendre(paris(23, 2))
    assert relu.journal(CHAMBRE) == [note(paris(22, 40), "unavailable")]


def test_un_demarrage_ou_la_lampe_passe_par_un_etat_restaure(creer, horloge):
    """Au demarrage, l'integration d'une lampe peut ne pas avoir fini de charger :
    Home Assistant lui laisse alors l'etat qu'il pose lui-meme (`unavailable`,
    `restored`). Le rattrapage ne le note pas, et la lampe qui revient comme elle
    etait non plus (relecture du 14/10)."""
    b = creer()
    b.publier(paris(18, 5), BUREAU, "on", {"brightness": 204})
    b.attendre(paris(18, 6))
    etats = dict(b.hass.states.table)
    etats[BUREAU] = FauxEtat("unavailable", {"restored": True, "supported_features": 40}, None,
                             datetime.fromtimestamp(paris(19), PARIS))
    horloge.t = paris(19, 1)
    relu = creer(carnet=b.depot.contenu, etats=etats)
    assert relu.journal(BUREAU) == [note(paris(18, 5), "on", 80)]
    relu.publier(paris(19, 2), BUREAU, "on", {"brightness": 204})
    assert relu.journal(BUREAU) == [note(paris(18, 5), "on", 80)], "elle revient comme elle etait : rien a dire"
    assert relu.etat()["lumieres"][BUREAU]["dernier"]["bri"] == 80
    # Revenue autrement, elle se note comme n'importe quel geste.
    relu.publier(paris(19, 3), BUREAU, "off", {})
    assert relu.journal(BUREAU)[-1] == note(paris(19, 3), "off")


def test_le_fichier_ne_garde_que_la_fenetre(creer, horloge):
    horloge.t = paris(9, jour=11)
    b = creer()
    for jour, h, etat in ((11, 18, "on"), (11, 23, "off"), (12, 7, "on"), (13, 18, "off"), (14, 7, "on")):
        b.publier(paris(h, jour=jour), BUREAU, etat, {"brightness": 255} if etat == "on" else {})
    b.attendre(paris(7, 1, jour=14))
    assert [n["when"] for n in b.depot.contenu[BUREAU]["evenements"]] == [
        paris(7, jour=12), paris(18, jour=13), paris(7, jour=14)]


def test_un_carnet_illisible_repart_a_vide_et_le_dit(creer, caplog):
    class Abime(FauxStore):
        async def async_load(self):
            raise ValueError("fichier abime")

    caplog.set_level(logging.ERROR)
    b = creer(depot=Abime(None))
    assert "carnet illisible" in caplog.text
    b.publier(paris(18, 5), BUREAU, "on", {"brightness": 255})
    assert len(b.journal(BUREAU)) == 1, "un carnet abime ne vaut pas qu'on cesse de noter"


def test_un_demarrage_rate_n_ecrase_pas_le_fichier(creer, monkeypatch):
    """`regles.demarrer` retient l'echec : le carnet n'a pas ete relu, l'ecrire
    effacerait celui du fichier."""
    def casse(*_a):
        raise RuntimeError("relecture impossible")

    monkeypatch.setattr(charger("lumieres"), "lire_carnet", casse)
    garde = {BUREAU: {"vu": {"state": "off", "bri": None}, "dernier": None, "niveau_a": None,
                      "evenements": [note(paris(7), "off")]}}
    b = creer(carnet=garde)
    assert b.l.demarrage is False
    lancer(b.l.async_enregistrer({}))
    b.publier(paris(18, 5), BUREAU, "on", {"brightness": 255})
    b.attendre(paris(19))
    assert b.depot.ecritures == 0 and b.depot.contenu == garde


def test_l_arret_ecrit_ce_qui_attendait(creer):
    b = creer()
    b.attendre(paris(18, 1))
    ecrites = b.depot.ecritures
    b.publier(paris(18, 5), BUREAU, "on", {"brightness": 255})
    b.l.async_arreter()
    b.hass.executer()
    assert b.depot.ecritures == ecrites + 1 and b.depot.contenu[BUREAU]["evenements"] == [
        note(paris(18, 5), "on", 100)]
    assert b.rdv.armees() == []
    b.l.async_arreter()
    assert b.hass.bus.retraits_rates == 0, "arrete deux fois : sans effet"


def test_l_arret_de_home_assistant_ecrit_le_carnet(creer):
    b = creer()
    b.attendre(paris(18, 1))
    ecrites = b.depot.ecritures
    b.publier(paris(18, 5), BUREAU, "on", {"brightness": 255})
    b.hass.bus.tirer("homeassistant_stop")
    assert b.depot.ecritures == ecrites + 1
    b.l.async_arreter()
    assert b.hass.bus.retraits_rates == 0, "l'ecoute `once` deja partie ne se retire pas une seconde fois"


# ── Le rechargement de l'integration : l'ecriture finale (relecture du 14/10) ─

def ecriture_gardee(b):
    """L'ecriture finale que l'instance retiree laisse a la suivante, dans `hass.data[DOMAIN]`."""
    return b.hass.data.get(charger("const").DOMAIN, {}).get(charger("lumieres").CLE_ECRITURE_FINALE)


def recharger(b, sans_attendre_l_ancienne=False):
    """Le rechargement de l'integration, sur UNE boucle et de VRAIES taches (celles de
    `FauxHass` se jouent l'une apres l'autre et ne s'entrelacent jamais) : l'ancienne
    instance s'arrete - son ecriture finale part -, la suivante nait dans le meme Home
    Assistant et demarre. Rend la nouvelle instance, une fois ce qui pouvait finir fini.
    `sans_attendre_l_ancienne` : l'ecriture finale ne finira pas, on ne l'attend pas."""
    module = charger("lumieres")
    lancees = []

    def tache(coro):
        t = asyncio.get_running_loop().create_task(coro)
        lancees.append(t)
        return t

    async def scenario():
        b.hass.async_create_task = tache
        b.l.async_arreter()
        ancienne = list(lancees)
        nouveau = module.LoggiaLumieres(b.hass, b.l.store)
        while True:
            en_cours = [t for t in lancees if not t.done() and not (sans_attendre_l_ancienne and t in ancienne)]
            if not en_cours:
                return nouveau
            # Un test qui attend pour toujours echoue au bout de cinq secondes, il ne bloque pas la suite.
            await asyncio.wait_for(asyncio.gather(*en_cours), timeout=5)

    return lancer(scenario())


def test_le_rechargement_attend_l_ecriture_de_l_ancienne_instance_avant_de_relire(creer):
    """Le dechargement lance l'ecriture de ce qui attendait, et plus personne ne
    l'attendait : la nouvelle instance relisait le fichier PENDANT l'ecriture, puis
    l'ecrasait de ce qu'elle avait lu - les notes des vingt dernieres secondes se
    perdaient. Ici trois gestes que ni le fichier ni l'etat de la lampe ne
    redisent (allumee, eteinte, rallumee) : seul ce qui s'ecrit les garde."""
    b = creer()
    b.attendre(paris(18, 1))
    papa = Context(user_id="u-papa")
    b.publier(paris(18, 5), BUREAU, "on", {"brightness": 204}, papa)
    b.publier(paris(18, 5, 10), BUREAU, "off", {}, papa)
    b.publier(paris(18, 5, 15), BUREAU, "on", {"brightness": 128}, papa)
    assert b.depot.contenu[BUREAU]["evenements"] == [], "elles attendent leurs vingt secondes"
    attendues = [note(paris(18, 5), "on", 80, user="u-papa"), note(paris(18, 5, 10), "off", user="u-papa"),
                 note(paris(18, 5, 15), "on", 50, user="u-papa")]
    nouveau = recharger(b)
    assert nouveau.demarrage is True
    assert nouveau.carnet[BUREAU]["evenements"] == attendues
    assert b.depot.contenu[BUREAU]["evenements"] == attendues
    assert ecriture_gardee(b) is None, "attendue une fois, elle s'oublie"


def test_un_rechargement_sans_ecriture_en_attente_ne_garde_rien_a_attendre(creer):
    b = creer()
    # Passe la fenetre de demarrage (D1, deux minutes) : son echeance est partie aussi.
    b.attendre(paris(18, 2))
    assert b.rdv.armees() == []
    ecrites = b.depot.ecritures
    b.l.async_arreter()
    assert ecriture_gardee(b) is None, "rien n'attendait : rien a garder"
    nouveau = recharger(b)
    assert nouveau.demarrage is True and b.depot.ecritures == ecrites


def test_une_ecriture_qui_ne_finit_pas_n_empeche_pas_le_carnet_de_demarrer(creer, monkeypatch, caplog):
    """Un disque qui s'etrangle : la nouvelle instance n'attend pas plus
    longtemps qu'elle ne le doit, le dit, et demarre."""
    monkeypatch.setattr(charger("lumieres"), "ATTENTE_ECRITURE_S", 0.05)
    b = creer()
    b.attendre(paris(18, 1))
    b.publier(paris(18, 5), BUREAU, "on", {"brightness": 204})

    async def ne_finit_pas(_data):
        await asyncio.Event().wait()

    b.depot.async_save = ne_finit_pas
    caplog.set_level(logging.WARNING)
    nouveau = recharger(b, sans_attendre_l_ancienne=True)
    assert nouveau.demarrage is True
    assert "n'a pas fini" in caplog.text


# ── Une seule idee de la lumiere de la maison (audit du 19/10, ADR 0260) ────

def test_une_lampe_cachee_et_un_groupe_ne_se_suivent_pas(creer):
    """Le carnet lit la definition commune (`lumieres_maison`) : une lampe
    cachee n'est pas une lumiere de la maison, et un groupe s'efface devant ses
    membres - ses notes feraient double emploi avec les leurs."""
    b = creer()
    b.registre.entities["light.cachee"] = entree("light.cachee")
    b.registre.entities["light.cachee"].hidden_by = "user"
    b.hass.states.table["light.cachee"] = FauxEtat("off", {"friendly_name": "Cachee"})
    b.registre.entities["light.tout"] = entree("light.tout")
    b.hass.states.table["light.tout"] = FauxEtat("off", {"friendly_name": "Tout", "entity_id": [CHAMBRE, BUREAU]})
    lancer(b.l.async_enregistrer({}))
    assert "light.cachee" not in b.l.suivies and "light.tout" not in b.l.suivies
    assert CHAMBRE in b.l.suivies and BUREAU in b.l.suivies


def test_un_interrupteur_declare_renomme_emporte_sa_fiche_et_sa_declaration(creer):
    """Audit du 19/10 : le registre ne faisait relire le carnet que pour un
    `light.*`. Un interrupteur declare lumiere renomme gardait son ancien nom au
    carnet - et dans `loggia_switchlights`, ou l'ancien nom ne designait plus
    rien. Sa fiche passe sous le nouveau nom, et la declaration le suit."""
    b = creer()
    b.publier(paris(18, 5), EXTERIEUR, "on", {})
    b.publier(paris(18, 30), EXTERIEUR, "off", {})
    neuf = "switch.lumiere_dehors"
    entree_switch = b.registre.entities.pop(EXTERIEUR)
    entree_switch.entity_id = neuf
    b.registre.entities[neuf] = entree_switch
    b.hass.states.table[neuf] = b.hass.states.table.pop(EXTERIEUR)
    b.hass.bus.tirer("entity_registry_updated", {"action": "update", "entity_id": neuf, "old_entity_id": EXTERIEUR,
                                                 "changes": {"entity_id": EXTERIEUR}})
    assert lancer(b.l.store.async_get_shared("loggia_switchlights")) == [neuf]
    assert neuf in b.l.suivies and EXTERIEUR not in b.l.suivies and EXTERIEUR not in b.l.carnet
    assert b.journal(neuf) == [note(paris(18, 5), "on"), note(paris(18, 30), "off")]


def test_un_interrupteur_declare_renomme_sous_le_repli_herite(creer):
    """Le meme renommage quand la declaration vit encore dans `switchLights`
    de `loggia_entities` : c'est la qu'elle suit."""
    b = creer(partage={"loggia_switchlights": None, "loggia_entities": {"switchLights": [EXTERIEUR], "rooms": 1}})
    neuf = "switch.lumiere_dehors"
    entree_switch = b.registre.entities.pop(EXTERIEUR)
    entree_switch.entity_id = neuf
    b.registre.entities[neuf] = entree_switch
    b.hass.states.table[neuf] = b.hass.states.table.pop(EXTERIEUR)
    b.hass.bus.tirer("entity_registry_updated", {"action": "update", "entity_id": neuf, "old_entity_id": EXTERIEUR})
    assert lancer(b.l.store.async_get_shared("loggia_entities")) == {"switchLights": [neuf], "rooms": 1}
    assert neuf in b.l.suivies and EXTERIEUR not in b.l.suivies


def test_un_interrupteur_declare_retire_quitte_le_carnet(creer):
    b = creer()
    b.publier(paris(18, 5), EXTERIEUR, "on", {})
    del b.registre.entities[EXTERIEUR]
    del b.hass.states.table[EXTERIEUR]
    b.hass.bus.tirer("entity_registry_updated", {"action": "remove", "entity_id": EXTERIEUR})
    assert EXTERIEUR not in b.l.suivies and EXTERIEUR not in b.l.carnet
    # Un autre interrupteur, qui n'est pas declare : rien a relire.
    lus = len(b.lectures)
    b.hass.bus.tirer("entity_registry_updated", {"action": "remove", "entity_id": "switch.prise_nas"})
    assert len(b.lectures) == lus


def test_une_ecriture_deja_partie_a_l_arret_est_laissee_a_l_instance_suivante(creer):
    """La course de l'audit du 19/10 : l'echeance de l'ecriture differee vient
    de sonner - la tache d'ecriture est lancee, plus rien n'est « en attente » -
    quand `async_arreter` arrive. Il ne deposait rien, et l'instance suivante
    relisait le fichier PENDANT cette ecriture. La tache en vol se depose aussi."""
    b = creer()
    b.attendre(paris(18, 1))
    b.publier(paris(18, 5), BUREAU, "on", {"brightness": 255})
    echeance = b.rdv.armees()[0]
    lancees = []

    def tache(coro):
        t = asyncio.get_running_loop().create_task(coro)
        lancees.append(t)
        return t

    async def scenario():
        b.hass.async_create_task = tache
        echeance["annule"] = True
        echeance["rappel"](None)
        assert b.l._ecriture is None and len(lancees) == 1 and not lancees[0].done()
        b.l.async_arreter()
        gardee = ecriture_gardee(b)
        assert gardee is lancees[0], "la tache en vol est deposee pour l'instance suivante"
        await gardee
        return b.depot.contenu[BUREAU]["evenements"]

    assert lancer(scenario()) == [note(paris(18, 5), "on", 100)]


# ── Les lignes de Loggia d'une lumiere (spec 7) ─────────────────────────────

def test_les_lignes_de_loggia_d_une_lumiere_passent_par_les_manoeuvres_des_volets(store_module, horloge):
    """La popup lit aussi le journal de Loggia : la veilleuse de la nuit, la pose
    d'un minuteur, un scenario. `loggia/volets/manoeuvres` le rend deja pour
    toute entite qu'on lui nomme : rien a creer ; ce test garde la porte ouverte."""
    regles_module = charger("regles")
    magasin = store_module.LoggiaStore.__new__(store_module.LoggiaStore)
    magasin._store = FauxStore({"users": {}, "shared": {}, "migrated": True})
    magasin._ancien = FauxStore(None)
    magasin._data = None
    magasin._lock = asyncio.Lock()
    regles = regles_module.Regles(FauxHass({}), magasin)
    regles._depot = FauxStore(None)
    lancer(regles.noter("nuit", "veilleuse", "eteindre", cibles=[LINO], n=1, motif=("{n} min", {"n": 60})))
    lancer(regles.noter("minuteurs", "minuteur", "poser", cibles=[CHAMBRE], n=1, motif=("{n} min", {"n": 60})))
    lancer(regles.noter("scenarios", "soiree", "Soirée", cibles=[LINO, CHAMBRE], n=2))
    volets = charger("volets")
    v = volets.LoggiaVolets.__new__(volets.LoggiaVolets)
    v.regles = regles
    reponse = lancer(v.async_manoeuvres(LINO, paris(0)))
    assert [(e["module"], e["quoi"]) for e in reponse["lignes"]] == [("scenarios", "Soirée"), ("nuit", "eteindre")]
