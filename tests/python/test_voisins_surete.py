"""La surete lit l'APPAREIL qui porte un binaire, pas seulement sa classe (31/10, ADR 0305).

Deux cas de son installation :
- `binary_sensor.tondeuse_pluie_detectee` (Mammotion, classe `moisture`)
  vit sur l'appareil de la tondeuse : c'est la pluie, pas une fuite ;
- `binary_sensor.camera_entree_alarme_de_co_detectee` (UniFi Protect, classe
  `carbon_monoxide`) vit sur l'appareil d'une camera : elle ENTEND une alarme.
  Le telephone le dit ; la maison n'allume rien, ne remonte rien.

Les vrais detecteurs - une fuite Zigbee, un detecteur de monoxyde - ne changent
pas, et un registre illisible n'en perd aucun.
"""
from __future__ import annotations

import sys
import types

import pytest

from conftest import charger
import test_alertes as base
from test_alertes import FauxEtat, FauxEvenement, appels, lancer, maison

# Les fixtures du banc des alertes : la fabrique et le module, repris tels quels.
creer = base.creer
module = base.module

PLUIE = "binary_sensor.tondeuse_pluie_detectee"
CO_CAMERA = "binary_sensor.camera_entree_alarme_de_co_detectee"
FUMEE_CAMERA = "binary_sensor.camera_entree_fumee_entendue"
GAZ_CAMERA = "binary_sensor.camera_entree_gaz"
FUITE = "binary_sensor.sdb_fuite"
CO_VRAI = "binary_sensor.couloir_co"


def entree(haid, appareil, plateforme="mqtt"):
    return types.SimpleNamespace(entity_id=haid, device_id=appareil, platform=plateforme,
                                 entity_category=None, hidden_by=None, disabled_by=None)


# Son installation, reduite a ce qui compte : chaque appareil et ce qu'il porte.
# La tondeuse a aussi une camera : la regle de la pluie passe avant.
ENTREES = [
    entree(PLUIE, "tondeuse", "mammotion"), entree("lawn_mower.tondeuse", "tondeuse", "mammotion"),
    entree("camera.tondeuse", "tondeuse", "mammotion"),
    entree(CO_CAMERA, "camera_entree", "unifiprotect"), entree(FUMEE_CAMERA, "camera_entree", "unifiprotect"),
    entree(GAZ_CAMERA, "camera_entree", "unifiprotect"), entree("camera.entree", "camera_entree", "unifiprotect"),
    entree(FUITE, "aqara", "mqtt"), entree("sensor.sdb_fuite_batterie", "aqara", "mqtt"),
    entree(CO_VRAI, "nest", "nest"), entree("sensor.couloir_co_batterie", "nest", "nest"),
    entree("light.salon", None), entree("light.couloir", None), entree("cover.salon", None),
]


class Entrees(dict):
    """`registre.entities` : un dict, et l'index par appareil de Home Assistant."""

    def get_entries_for_device_id(self, appareil, _desactivees=False):
        return [e for e in self.values() if e.device_id == appareil]


class Registre:
    def __init__(self, entrees, index=True):
        self.entities = (Entrees if index else dict)({e.entity_id: e for e in entrees})

    def async_get(self, haid):
        return self.entities.get(haid)


@pytest.fixture(params=[True, False], ids=["index", "parcours"])
def registre(request, monkeypatch):
    reg = Registre(ENTREES, index=request.param)
    monkeypatch.setattr(sys.modules["homeassistant.helpers.entity_registry"], "async_get", lambda _h: reg)
    return reg


def binaire(haid, classe, etat="on"):
    return FauxEtat(haid, etat, {"device_class": classe, "friendly_name": haid})


def allumer(a, haid, classe):
    """Le binaire passe de « off » a « on » ; les taches lancees, executees."""
    a._on_state(FauxEvenement(binaire(haid, classe), binaire(haid, classe, "off")))
    taches, a._hass.taches = a._hass.taches, []
    noms = [t.cr_code.co_name for t in taches]
    for t in taches:
        lancer(t)
    return noms


def messages(a):
    return [c["message"] for d, _s, c in a._hass.services.appels if d == "notify"]


# ── La pluie de la tondeuse ───────────────────────────────────────────────

def test_la_pluie_de_la_tondeuse_n_est_pas_une_fuite(creer, registre):
    """Son cas : a chaque averse, « Fuite d'eau détectée » ; la vanne coupee si
    une vanne etait choisie. Plus rien : ni telephone, ni vanne."""
    a = creer(etats=maison())
    assert allumer(a, PLUIE, "moisture") == []
    assert a._hass.services.appels == [] and a._dangers == {}


def test_une_vraie_fuite_reste_une_fuite(creer, registre):
    """Un detecteur Zigbee, sur son propre appareil : telephone et vanne."""
    a = creer(etats=maison())
    assert sorted(allumer(a, FUITE, "moisture")) == ["_envoyer", "_reagir"]
    assert messages(a) == ["Fuite d’eau détectée : " + FUITE]
    assert ("valve", "close_valve", ["valve.eau"], {}) in appels(a)


def test_la_pluie_de_la_tondeuse_n_est_pas_un_detecteur_muet(creer, registre):
    a = creer(etats=maison())
    a._guetter_muet(binaire(PLUIE, "moisture", "unavailable"))
    assert a._muets == {}


def test_le_carnet_de_l_eau_ne_suit_pas_la_pluie(registre):
    """eau.py suit les detecteurs de fuite : la pluie de la tondeuse n'en est pas un."""
    eau = charger("eau")
    banc = types.SimpleNamespace(hass=object(), _designee="", _plantes=[])
    banc._est_vanne = lambda h, at: False
    banc._entree = registre.async_get
    assert eau.LoggiaEau._suivi(banc, PLUIE, {"device_class": "moisture"}) is False
    assert eau.LoggiaEau._suivi(banc, FUITE, {"device_class": "moisture"}) is True


# ── L'alarme qu'une camera entend ─────────────────────────────────────────

def test_le_co_entendu_par_une_camera_previent_sans_rien_allumer(creer, registre):
    """Son cas : le son d'un detecteur, chez un voisin ou a la television,
    allumait toutes les lampes a 100 % et remontait les volets. Le telephone
    le dit, avec ce qu'on sait ; la maison ne bouge pas."""
    a = creer(etats=maison())
    assert allumer(a, CO_CAMERA, "carbon_monoxide") == ["_envoyer"]
    assert messages(a) == ["Alarme entendue par une caméra : " + CO_CAMERA]
    assert [d for d, _s, _c in a._hass.services.appels] == ["notify"]
    assert a._dangers == {}


def test_l_alarme_entendue_part_comme_un_danger(creer, registre):
    """Un detecteur autonome sonne peut-etre dans l'entree : le telephone
    passe les heures calmes, comme pour un detecteur."""
    a = creer(etats=maison())
    allumer(a, CO_CAMERA, "carbon_monoxide")
    charge = a._hass.services.appels[0][2]
    assert charge["data"]["push"]["sound"]["critical"] == 1


def test_la_fumee_entendue_aussi(creer, registre):
    a = creer(etats=maison())
    assert allumer(a, FUMEE_CAMERA, "smoke") == ["_envoyer"]
    assert [d for d, _s, _c in a._hass.services.appels] == ["notify"]


def test_reagir_ne_bouge_rien_pour_une_alarme_entendue(creer, registre):
    """Le dernier filet : quel que soit le chemin (un retour apres un silence,
    une revue), `_reagir` ne fait rien pour ce que la camera entend."""
    a = creer(etats=maison())
    lancer(a._reagir(binaire(CO_CAMERA, "carbon_monoxide"), "co"))
    assert a._hass.services.appels == [] and a._dangers == {}


def test_un_vrai_detecteur_de_co_fait_toujours_reagir_la_maison(creer, registre):
    a = creer(etats=maison())
    assert sorted(allumer(a, CO_VRAI, "carbon_monoxide")) == ["_envoyer", "_reagir"]
    assert messages(a) == ["Monoxyde de carbone détecté : " + CO_VRAI]
    assert ("light", "turn_on", ["light.couloir", "light.salon"], {"brightness_pct": 100}) in appels(a)
    assert ("cover", "open_cover", ["cover.salon"], {}) in appels(a)


def test_le_gaz_d_une_camera_reste_un_detecteur(creer, registre):
    """Une camera n'entend pas le gaz : un `gas` sur son appareil reste ce qu'il dit."""
    a = creer(etats=maison())
    assert sorted(allumer(a, GAZ_CAMERA, "gas")) == ["_envoyer", "_reagir"]


def test_la_camera_qui_se_tait_n_est_pas_un_detecteur_muet(creer, registre):
    """Elle est deja « Caméra hors ligne » a l'Accueil."""
    a = creer(etats=maison())
    a._guetter_muet(binaire(CO_CAMERA, "carbon_monoxide", "unavailable"))
    assert a._muets == {}


def test_au_demarrage_l_alarme_entendue_garde_son_texte(creer, registre):
    a = creer(etats={**maison(), CO_CAMERA: binaire(CO_CAMERA, "carbon_monoxide")})
    a._demarre = False
    lancer(a._async_revoir())
    assert messages(a) == ["Alarme entendue par une caméra : " + CO_CAMERA]


# ── Sans registre, rien ne se perd ────────────────────────────────────────

def test_registre_illisible_les_detecteurs_restent_des_detecteurs(creer, monkeypatch):
    def casse(_h):
        raise RuntimeError("registre indisponible")

    monkeypatch.setattr(sys.modules["homeassistant.helpers.entity_registry"], "async_get", casse)
    a = creer(etats=maison())
    assert sorted(allumer(a, PLUIE, "moisture")) == ["_envoyer", "_reagir"]
    b = creer(etats=maison())
    assert sorted(allumer(b, CO_CAMERA, "carbon_monoxide")) == ["_envoyer", "_reagir"]


def test_les_regles_pures():
    v = charger("voisins")
    assert v.pluie_de_robot({"binary_sensor", "lawn_mower", "camera"}) is True
    assert v.pluie_de_robot({"binary_sensor", "vacuum"}) is True
    assert v.pluie_de_robot({"binary_sensor", "sensor"}) is False
    assert v.entendue("carbon_monoxide", {"camera", "binary_sensor"}) is True
    assert v.entendue("smoke", {"camera"}) is True
    assert v.entendue("gas", {"camera"}) is False
    assert v.entendue("carbon_monoxide", {"binary_sensor", "sensor"}) is False
    e = charger("eau_calcul")
    fuite = {"device_class": "moisture"}
    assert e.est_detecteur(PLUIE, fuite, "mammotion", (), {"lawn_mower", "binary_sensor"}) is False
    assert e.est_detecteur(FUITE, fuite, "mqtt", (), {"binary_sensor", "sensor"}) is True
    assert e.est_detecteur(FUITE, fuite, "mqtt") is True, "sans voisins connus, un detecteur reste un detecteur"
