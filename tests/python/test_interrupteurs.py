"""Tests de l'ecoute des interrupteurs sans fil.

Ce module a ete ecrit pour repondre a une panne precise : trois telecommandes
Hue dont AUCUN appui n'arrivait nulle part. La cause tenait a la forme des
messages de zigbee2mqtt — un seul JSON par appareil, ou l'action apparait puis
disparait — et non au modele de telecommande. Les contre-epreuves ci-dessous
verrouillent cette forme : c'est elle qui sera cassee le jour ou quelqu'un
« simplifiera » le filtre.
"""
from __future__ import annotations

import asyncio
import json

import pytest

from conftest import FauxStore, charger


def lancer(coro):
    return asyncio.run(coro)


class FauxServices:
    """Collecte les appels de service au lieu de les executer."""

    def __init__(self):
        self.appels = []

    async def async_call(self, domaine, service, data, blocking=False):
        self.appels.append((domaine, service, data))


class FauxHass:
    """Le strict necessaire : des services, et des taches qu'on lance a la main."""

    def __init__(self):
        self.services = FauxServices()
        self.taches = []

    def async_create_task(self, coro):
        self.taches.append(coro)
        return coro

    def vider(self):
        """Execute les taches en attente, dans l'ordre ou elles sont nees."""
        taches, self.taches = self.taches, []
        for coro in taches:
            lancer(coro)

    def abandonner(self):
        """Ferme ce qui n'a pas ete lance : une coroutine laissee en plan fait
        crier Python a la fin de la suite, et ce bruit masque les vrais avis."""
        taches, self.taches = self.taches, []
        for coro in taches:
            coro.close()


class FauxMessage:
    """Un message MQTT tel que Home Assistant le passe a l'abonne."""

    def __init__(self, topic, payload):
        self.topic = topic
        self.payload = payload if isinstance(payload, str) else json.dumps(payload)


@pytest.fixture
def module():
    return charger("interrupteurs")


@pytest.fixture
def creer(module, store_module):
    """Un ecouteur pose sur un magasin en memoire, sans rien brancher."""
    faits = []

    def fabrique(affectations=None):
        magasin = store_module.LoggiaStore.__new__(store_module.LoggiaStore)
        magasin._store = FauxStore({
            "users": {},
            "shared": {"loggia_interrupteurs": affectations or {}},
            "migrated": True,
        })
        magasin._ancien = FauxStore(None)
        magasin._data = None
        magasin._lock = asyncio.Lock()

        # `__new__` : l'objet reel s'abonne a MQTT dans son constructeur, ce
        # qu'aucun test ne veut declencher.
        ecouteur = module.LoggiaInterrupteurs.__new__(module.LoggiaInterrupteurs)
        ecouteur.hass = FauxHass()
        ecouteur.store = magasin
        ecouteur.journal = []
        ecouteur.vus = {}
        ecouteur._dernier = {}
        ecouteur._defait = []
        ecouteur.sources = {'mqtt_present': True, 'z2m': True, 'zha': True, 'deconz': True}
        faits.append(ecouteur)
        return ecouteur

    yield fabrique
    for ecouteur in faits:
        ecouteur.hass.abandonner()


# ── La forme des messages zigbee2mqtt ───────────────────────────────────────

def test_un_appui_est_capte(creer):
    ecouteur = creer()
    ecouteur._sur_mqtt(FauxMessage(
        "zigbee2mqtt/Interrupteur Exemple",
        {"action": "on_press_release", "battery": 41.5, "linkquality": 117},
    ))
    assert len(ecouteur.journal) == 1
    vu = ecouteur.journal[0]
    assert vu["action"] == "on_press_release"
    assert vu["nom"] == "Interrupteur Exemple"
    assert vu["cle"] == "z2m/Interrupteur Exemple"
    assert ecouteur.vus["z2m/Interrupteur Exemple"]["actions"] == ["on_press_release"]


def test_l_action_vide_n_est_pas_un_appui(creer):
    """LE point de la panne. Zigbee2mqtt republie l'etat apres l'appui, avec
    `action` remis a vide : prendre ces messages pour des appuis declencherait
    l'affectation une seconde fois, a chaque changement de niveau de batterie."""
    ecouteur = creer()
    ecouteur._sur_mqtt(FauxMessage("zigbee2mqtt/Exemple", {"action": "", "battery": 41.5}))
    ecouteur._sur_mqtt(FauxMessage("zigbee2mqtt/Exemple", {"battery": 41.0}))
    ecouteur._sur_mqtt(FauxMessage("zigbee2mqtt/Exemple", {"action": None}))
    assert ecouteur.journal == []
    assert ecouteur.vus == {}


def test_le_pont_n_est_pas_un_interrupteur(creer):
    ecouteur = creer()
    ecouteur._sur_mqtt(FauxMessage("zigbee2mqtt/bridge", {"action": "restart"}))
    assert ecouteur.journal == []


def test_une_charge_illisible_ne_casse_rien(creer):
    ecouteur = creer()
    ecouteur._sur_mqtt(FauxMessage("zigbee2mqtt/Exemple", "pas du json"))
    ecouteur._sur_mqtt(FauxMessage("zigbee2mqtt/Exemple", "[1, 2, 3]"))
    ecouteur._sur_mqtt(FauxMessage("zigbee2mqtt/Exemple", ""))
    assert ecouteur.journal == []


def test_deux_messages_pour_un_appui_comptent_pour_un(creer):
    """Un appui arrive souvent en double : l'action, puis la republication."""
    ecouteur = creer()
    for _ in range(3):
        ecouteur._sur_mqtt(FauxMessage("zigbee2mqtt/Exemple", {"action": "on_press"}))
    assert len(ecouteur.journal) == 1


def test_deux_boutons_differents_passent_tous_les_deux(creer):
    """L'anti-rebond porte sur le couple appareil + bouton, pas sur l'appareil :
    monter puis descendre le variateur ne doit pas perdre le second geste."""
    ecouteur = creer()
    ecouteur._sur_mqtt(FauxMessage("zigbee2mqtt/Exemple", {"action": "up_press"}))
    ecouteur._sur_mqtt(FauxMessage("zigbee2mqtt/Exemple", {"action": "down_press"}))
    assert [v["action"] for v in ecouteur.journal] == ["down_press", "up_press"]


def test_le_journal_ne_grossit_pas_sans_fin(creer, module):
    ecouteur = creer()
    for i in range(module.JOURNAL_MAX + 15):
        ecouteur._sur_mqtt(FauxMessage("zigbee2mqtt/Exemple", {"action": f"appui_{i}"}))
    assert len(ecouteur.journal) == module.JOURNAL_MAX


# ── L'execution ─────────────────────────────────────────────────────────────

AFFECTATION = {
    "z2m/Interrupteur Exemple": {
        "nom": "Interrupteur Exemple",
        "source": "z2m",
        "actions": {
            "on_press_release": [
                {"service": "light.turn_on", "data": {"entity_id": "light.exemple"}}
            ],
        },
    },
}


def test_le_bouton_affecte_appelle_son_service(creer):
    ecouteur = creer(AFFECTATION)
    ecouteur._sur_mqtt(FauxMessage(
        "zigbee2mqtt/Interrupteur Exemple", {"action": "on_press_release"}
    ))
    ecouteur.hass.vider()
    assert ecouteur.hass.services.appels == [
        ("light", "turn_on", {"entity_id": "light.exemple"})
    ]


def test_un_bouton_sans_affectation_n_appelle_rien(creer):
    ecouteur = creer(AFFECTATION)
    ecouteur._sur_mqtt(FauxMessage(
        "zigbee2mqtt/Interrupteur Exemple", {"action": "off_press_release"}
    ))
    ecouteur.hass.vider()
    assert ecouteur.hass.services.appels == []


def test_un_service_mal_forme_ne_passe_pas(creer):
    """Sans le point, `split` donnerait n'importe quoi : on refuse plutot que
    d'appeler un service devine."""
    ecouteur = creer({
        "z2m/Exemple": {"source": "z2m", "nom": "Exemple", "actions": {
            "on_press": [{"service": "turn_on"}, {"service": "a.b.c"}, {"service": ""}],
        }},
    })
    ecouteur._sur_mqtt(FauxMessage("zigbee2mqtt/Exemple", {"action": "on_press"}))
    ecouteur.hass.vider()
    assert ecouteur.hass.services.appels == []


def test_plusieurs_gestes_pour_un_seul_bouton(creer):
    ecouteur = creer({
        "z2m/Exemple": {"source": "z2m", "nom": "Exemple", "actions": {
            "on_press": [
                {"service": "light.turn_on", "data": {"entity_id": "light.a"}},
                {"service": "scene.turn_on", "data": {"entity_id": "scene.b"}},
            ],
        }},
    })
    ecouteur._sur_mqtt(FauxMessage("zigbee2mqtt/Exemple", {"action": "on_press"}))
    ecouteur.hass.vider()
    assert [a[0] for a in ecouteur.hass.services.appels] == ["light", "scene"]


# ── Les autres sources ──────────────────────────────────────────────────────

class FauxEvenement:
    def __init__(self, data):
        self.data = data


def test_zha_distingue_les_boutons_par_leur_argument(creer):
    """Une telecommande ZHA envoie parfois la meme commande pour deux boutons,
    seul l'argument change. Sans lui, les deux boutons n'en feraient qu'un."""
    ecouteur = creer()
    ecouteur._sur_zha(FauxEvenement(
        {"device_ieee": "00:11:22", "command": "on", "args": [1]}
    ))
    ecouteur._sur_zha(FauxEvenement(
        {"device_ieee": "00:11:22", "command": "on", "args": [2]}
    ))
    assert [v["action"] for v in ecouteur.journal] == ["on_2", "on_1"]
    assert ecouteur.journal[0]["cle"] == "zha/00:11:22"


def test_deconz_capte_le_code_du_bouton(creer):
    ecouteur = creer()
    ecouteur._sur_deconz(FauxEvenement(
        {"unique_id": "00:aa:bb", "id": "bouton_salon", "event": 1002}
    ))
    assert ecouteur.journal[0]["action"] == "1002"
    assert ecouteur.journal[0]["nom"] == "bouton_salon"


def test_un_evenement_incomplet_est_ignore(creer):
    ecouteur = creer()
    ecouteur._sur_zha(FauxEvenement({"command": "on"}))
    ecouteur._sur_zha(FauxEvenement({"device_ieee": "00:11:22"}))
    ecouteur._sur_deconz(FauxEvenement({"unique_id": "00:aa:bb"}))
    assert ecouteur.journal == []


# ── Les affectations ────────────────────────────────────────────────────────

def test_affecter_puis_retirer_efface_l_appareil(creer):
    """Un appareil dont on a retire le dernier bouton ne doit pas rester en
    coquille vide dans la configuration."""
    ecouteur = creer()
    lancer(ecouteur.async_affecter(
        "z2m/Exemple", "on_press", [{"service": "light.toggle"}], "Exemple"
    ))
    table = lancer(ecouteur.async_affectations())
    assert table["z2m/Exemple"]["actions"]["on_press"][0]["service"] == "light.toggle"
    assert table["z2m/Exemple"]["nom"] == "Exemple"

    lancer(ecouteur.async_affecter("z2m/Exemple", "on_press", []))
    assert lancer(ecouteur.async_affectations()) == {}


def test_affecter_garde_les_autres_boutons(creer):
    ecouteur = creer()
    lancer(ecouteur.async_affecter("z2m/Exemple", "up", [{"service": "light.turn_on"}]))
    lancer(ecouteur.async_affecter("z2m/Exemple", "down", [{"service": "light.turn_off"}]))
    lancer(ecouteur.async_affecter("z2m/Exemple", "up", []))
    table = lancer(ecouteur.async_affectations())
    assert list(table["z2m/Exemple"]["actions"]) == ["down"]


def test_l_etat_montre_l_affecte_et_le_vu(creer):
    """Un appareil affecte doit apparaitre meme si personne n'a appuye dessus
    depuis le demarrage — sinon on ne pourrait plus retirer son affectation."""
    ecouteur = creer(AFFECTATION)
    ecouteur._sur_mqtt(FauxMessage("zigbee2mqtt/Autre", {"action": "toggle"}))
    etat = lancer(ecouteur.async_etat())
    par_cle = {a["cle"]: a for a in etat["appareils"]}
    assert par_cle["z2m/Interrupteur Exemple"]["affectees"] == ["on_press_release"]
    assert par_cle["z2m/Interrupteur Exemple"]["vues"] == []
    assert par_cle["z2m/Autre"]["vues"] == ["toggle"]
    assert par_cle["z2m/Autre"]["affectees"] == []
    assert len(etat["journal"]) == 1
    # Ce que la page affiche pour dire si quelqu'un ecoute vraiment : sans lui,
    # une liste vide ne distinguait pas « personne n'appuie » de « rien n'est
    # branche » (retour 03/09).
    assert etat["sources"] == {"mqtt_present": True, "z2m": True, "zha": True, "deconz": True}
