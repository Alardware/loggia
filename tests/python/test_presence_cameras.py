"""Les capteurs d'une camera ne sont pas des indices de presence (31/10, ADR 0306).

Son cas : les indices sont actifs, et le depart arme Alarmo. Le mouvement des
cameras du dehors et la sonnette (`occupancy`) relancaient le delai du depart :
un passant devant la camera de l'entree, et l'armement reculait d'autant, sans
fin sur une rue passante. Un binaire porte par l'appareil d'une `camera` n'est
plus un indice ; le capteur de mouvement du couloir, si. Un registre illisible
n'ecarte rien.
"""
from __future__ import annotations

import sys
import types

import test_presence as base
from test_presence import DEHORS, MAISON, FauxEtat, cfg, lancer

# Les fixtures du banc de la presence, reprises telles quelles.
creer = base.creer
module = base.module
regles_module = base.regles_module

COULOIR = "binary_sensor.couloir"
MOUVEMENT_CAMERA = "binary_sensor.camera_entree_mouvement"
SONNETTE = "binary_sensor.camera_entree_sonnette"
PORTE = "binary_sensor.porte_entree"

ETATS = {
    COULOIR: FauxEtat("off", {"device_class": "motion", "friendly_name": "Couloir"}),
    MOUVEMENT_CAMERA: FauxEtat("off", {"device_class": "motion", "friendly_name": "Caméra entrée mouvement"}),
    SONNETTE: FauxEtat("off", {"device_class": "occupancy", "friendly_name": "Caméra entrée sonnette"}),
    PORTE: FauxEtat("off", {"device_class": "door", "friendly_name": "Porte d'entrée"}),
}


def entree(haid, appareil):
    return types.SimpleNamespace(entity_id=haid, device_id=appareil, platform="x")


class Registre:
    def __init__(self, entrees):
        self.entities = {e.entity_id: e for e in entrees}

    def async_get(self, haid):
        return self.entities.get(haid)


def registre(monkeypatch, casse=False):
    reg = Registre([entree(COULOIR, "pir"), entree("sensor.couloir_pile", "pir"),
                    entree(MOUVEMENT_CAMERA, "cam"), entree(SONNETTE, "cam"), entree("camera.entree", "cam"),
                    entree(PORTE, "contact")])

    def lire(_h):
        if casse:
            raise RuntimeError("registre indisponible")
        return reg

    monkeypatch.setattr(sys.modules["homeassistant.helpers.entity_registry"], "async_get", lire)


def test_les_capteurs_d_une_camera_ne_sont_pas_des_indices(creer, monkeypatch):
    registre(monkeypatch)
    p = creer(cfg(), {**DEHORS, **MAISON, **ETATS})
    assert p._capteurs_indices() == [COULOIR, PORTE]


def test_le_depart_n_ecoute_pas_la_camera(creer, monkeypatch):
    """Ce qui n'est pas ecoute ne relance pas le decompte : le delai du depart
    tient, et Alarmo s'arme a l'heure."""
    registre(monkeypatch)
    ecoutes = []
    monkeypatch.setattr(sys.modules["homeassistant.helpers.event"], "async_track_state_change_event",
                        lambda hass, ids, cb: ecoutes.append(sorted(ids)) or (lambda: None))
    p = creer(cfg(), {**DEHORS, **MAISON, **ETATS})
    lancer(p._async_reabonner())
    assert [COULOIR, PORTE] in ecoutes
    assert not any(MOUVEMENT_CAMERA in e or SONNETTE in e for e in ecoutes)


def test_l_ecran_voit_la_meme_liste(creer, monkeypatch):
    registre(monkeypatch)
    p = creer(cfg(), {**DEHORS, **MAISON, **ETATS})
    assert lancer(p.async_etat())["indices"]["capteurs"] == [COULOIR, PORTE]


def test_registre_illisible_rien_n_est_ecarte(creer, monkeypatch):
    registre(monkeypatch, casse=True)
    p = creer(cfg(), {**DEHORS, **MAISON, **ETATS})
    assert p._capteurs_indices() == sorted(ETATS)
