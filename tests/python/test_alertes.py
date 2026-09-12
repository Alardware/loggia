"""Les alertes de surete, sur le socle des regles.

Ce qui compte ici tient en une phrase : le DANGER reveille, le reste attend.
Fumee, gaz, monoxyde, fuite, alarme partent en critique — par-dessus les
heures calmes et par-dessus le mode silencieux du telephone. L'ouverture
pendant que l'alarme est armee, elle, attend son heure comme les autres.
"""
from __future__ import annotations

import asyncio
from datetime import datetime

import pytest

from conftest import FauxStore, charger


def lancer(coro):
    return asyncio.run(coro)


class FauxEtat:
    def __init__(self, entity_id, state, attributes=None):
        self.entity_id = entity_id
        self.state = state
        self.attributes = attributes or {}


class FauxEtats:
    def __init__(self, table):
        self.table = dict(table)

    def get(self, haid):
        return self.table.get(haid)

    def async_all(self, domaine):
        return [s for h, s in self.table.items() if h.startswith(domaine + '.')]


class FauxServices:
    def __init__(self, existants=('mobile',)):
        self.appels = []
        self.existants = set(existants)

    def has_service(self, domaine, service):
        return service in self.existants

    async def async_call(self, domaine, service, data, blocking=False, context=None):
        self.appels.append((domaine, service, dict(data)))


class FauxBus:
    def async_listen(self, *_a, **_k):
        return lambda: None


class FauxHass:
    def __init__(self, etats):
        self.states = FauxEtats(etats)
        self.services = FauxServices()
        self.bus = FauxBus()
        self.taches = []

    def async_create_task(self, coro):
        self.taches.append(coro)
        return coro

    def abandonner(self):
        taches, self.taches = self.taches, []
        for coro in taches:
            coro.close()


@pytest.fixture
def module():
    return charger("alertes")


@pytest.fixture
def creer(module, store_module):
    regles_module = charger("regles")
    faits = []

    def fabrique(config=None, etats=None, quand=None):
        cfg = {"actif": True, "service": "mobile",
               "categories": {"fumee": True, "gaz": True, "co": True, "fuite": True,
                              "alarme": True, "portes": True},
               "cooldown_min": 5}
        cfg.update(config or {})
        magasin = store_module.LoggiaStore.__new__(store_module.LoggiaStore)
        magasin._store = FauxStore({"users": {}, "shared": {"loggia_alertes": cfg}, "migrated": True})
        magasin._ancien = FauxStore(None)
        magasin._data = None
        magasin._lock = asyncio.Lock()

        a = module.LoggiaAlertes.__new__(module.LoggiaAlertes)
        a._hass = FauxHass(etats or {})
        a._store = magasin
        a._dernier = {}
        a._regles = regles_module.Regles(a._hass, magasin)
        a._regles._depot = FauxStore(None)
        if quand is not None:
            a._regles._maintenant = lambda: quand
        faits.append(a)
        return a

    yield fabrique
    for a in faits:
        a._hass.abandonner()


FUMEE = FauxEtat("binary_sensor.cuisine_fumee", "on",
                 {"device_class": "smoke", "friendly_name": "Fumée cuisine"})
PORTE = FauxEtat("binary_sensor.entree", "on",
                 {"device_class": "door", "friendly_name": "Porte d'entrée"})
CALME = {"actif": True, "debut": "22:00", "fin": "07:00"}
NUIT = datetime(2026, 9, 12, 3, 0)


def test_la_fumee_reveille_meme_la_nuit(creer):
    """Le seul canal qui contourne les heures calmes — et le mode silencieux du
    telephone avec."""
    a = creer({"calme": CALME}, quand=NUIT)
    lancer(a._envoyer(FUMEE, "fumee", "Fumée détectée"))
    assert len(a._hass.services.appels) == 1
    domaine, service, charge = a._hass.services.appels[0]
    assert (domaine, service) == ("notify", "mobile")
    assert charge["message"] == "Fumée détectée : Fumée cuisine"
    assert charge["title"] == "Loggia — sûreté"
    assert charge["data"]["channel"] == "alarm_stream"
    assert charge["data"]["push"]["sound"]["critical"] == 1


def test_chaque_danger_est_critique(module):
    for cat in ("fumee", "gaz", "co", "fuite", "alarme"):
        assert cat in module.DANGER, cat
    assert "portes" not in module.DANGER


def test_une_porte_attend_son_heure(creer):
    """L'ouverture pendant que l'alarme est armee n'est pas un danger : la
    nuit, elle arrive en silence."""
    a = creer({"calme": CALME}, quand=NUIT)
    lancer(a._envoyer(PORTE, "portes", "Ouverture pendant que l'alarme est armée"))
    charge = a._hass.services.appels[0][2]
    assert charge["data"] == {"importance": "low", "push": {"sound": "none"}}


def test_une_porte_le_jour_sonne_normalement(creer):
    a = creer({"calme": CALME}, quand=datetime(2026, 9, 12, 15, 0))
    lancer(a._envoyer(PORTE, "portes", "Ouverture pendant que l'alarme est armée"))
    assert "data" not in a._hass.services.appels[0][2]


def test_le_journal_commun_garde_l_alerte(creer):
    a = creer()
    lancer(a._envoyer(FUMEE, "fumee", "Fumée détectée"))
    ligne = lancer(a._regles.journal())[0]
    assert (ligne["module"], ligne["regle"], ligne["quoi"]) == ("alertes", "fumee", "alerter")
    assert ligne["motif"] == "binary_sensor.cuisine_fumee"
    assert ligne["detail"].startswith("critique")


def test_alertes_coupees_rien_ne_part(creer):
    a = creer({"actif": False})
    lancer(a._envoyer(FUMEE, "fumee", "Fumée détectée"))
    assert a._hass.services.appels == []


def test_une_categorie_decochee_ne_part_pas(creer):
    a = creer({"categories": {"fumee": False}})
    lancer(a._envoyer(FUMEE, "fumee", "Fumée détectée"))
    assert a._hass.services.appels == []


def test_l_anti_rafale_tient_sauf_pour_l_alarme(creer):
    a = creer()
    lancer(a._envoyer(FUMEE, "fumee", "Fumée détectée"))
    lancer(a._envoyer(FUMEE, "fumee", "Fumée détectée"))
    assert len(a._hass.services.appels) == 1, "un capteur qui bat a mitraille le telephone"
    alarme = FauxEtat("alarm_control_panel.maison", "triggered", {"friendly_name": "Maison"})
    lancer(a._envoyer(alarme, "alarme", "Alarme déclenchée", urgent=True))
    lancer(a._envoyer(alarme, "alarme", "Alarme déclenchée", urgent=True))
    assert len(a._hass.services.appels) == 3, "l'alarme passe toujours, sans delai"


def test_sans_telephone_rien_ne_part_et_le_journal_le_dit(creer):
    a = creer({"service": ""})
    lancer(a._envoyer(FUMEE, "fumee", "Fumée détectée"))
    assert a._hass.services.appels == []
    assert lancer(a._regles.journal())[0]["detail"].startswith("personne a qui parler")
