"""La robustesse du serveur (audit de consolidation du 28/10, lot 2 ; ADR 0280).

Les minuteurs et la sirene ont leurs tests a cote des leurs (test_minuteurs.py,
test_sirene.py). Ici le reste du lot :

  * M3 - un fichier de configuration illisible ne bloque plus tout : le magasin
    repart vide, apres avoir COPIE le fichier a cote ; tant que la copie n'est
    pas faite, rien ne s'ecrit par-dessus. Les reprises d'un fichier ancien
    sont versionnees (`schema`) ;
  * M4 - les reprises du chauffage partent au disque en copie ;
  * B1 - un vent a « nan » ne se lit pas comme un nombre ;
  * B2 - les alertes et l'eau filtrent `state_changed` avant leur rappel.
"""
from __future__ import annotations

import asyncio
import re
import types
from pathlib import Path

import pytest

from conftest import FauxStore, charger

RACINE = Path(__file__).resolve().parents[2]


def lancer(coro):
    return asyncio.run(coro)


class StoreCasse(FauxStore):
    """Un `Store` dont la lecture leve - droits, disque, version inconnue."""

    def __init__(self, depart=None, path=None):
        super().__init__(depart)
        if path is not None:
            self.path = path

    async def async_load(self):
        raise OSError("lecture impossible")


def magasin(store_module, interne, ancien=None):
    m = store_module.LoggiaStore.__new__(store_module.LoggiaStore)
    m._store = interne
    m._ancien = FauxStore(ancien)
    m._data = None
    m._lock = asyncio.Lock()
    return m


# ── M3 : un fichier illisible ───────────────────────────────────────────────

def test_illisible_le_fichier_est_copie_puis_le_magasin_repart_vide(store_module, tmp_path):
    fichier = tmp_path / "loggia_dashboard_config"
    fichier.write_bytes(b'{"data": {"shared": {"loggia_rooms": ["Salon"]}}}')
    interne = StoreCasse(path=str(fichier))
    m = magasin(store_module, interne)
    assert lancer(m.async_get_shared("loggia_rooms")) is None, "le magasin ne repart pas vide"
    copies = list(tmp_path.glob("loggia_dashboard_config.corrupt.*"))
    assert len(copies) == 1, "le fichier illisible n'a pas ete mis de cote"
    assert copies[0].read_bytes() == fichier.read_bytes(), "la copie n'est pas le fichier"
    # Copie faite : ecrire redevient possible.
    lancer(m.async_set_shared("loggia_rooms", ["Cuisine"]))
    assert interne.ecritures == 1


def test_illisible_et_impossible_a_copier_rien_ne_s_ecrit_par_dessus(store_module):
    interne = StoreCasse({"users": {}, "shared": {"loggia_rooms": ["Salon"]}})
    m = magasin(store_module, interne)
    assert lancer(m.async_get_shared("loggia_rooms")) is None
    with pytest.raises(store_module.MagasinIllisibleError):
        lancer(m.async_set_shared("loggia_rooms", ["Cuisine"]))
    assert interne.ecritures == 0
    assert interne.contenu == {"users": {}, "shared": {"loggia_rooms": ["Salon"]}}, "l'original a ete touche"


def test_illisible_sans_fichier_il_n_y_a_rien_a_garder(store_module, tmp_path):
    interne = StoreCasse(path=str(tmp_path / "absent"))
    m = magasin(store_module, interne)
    lancer(m.async_set_shared("loggia_rooms", ["Cuisine"]))
    assert interne.ecritures == 1
    assert list(tmp_path.iterdir()) == []


# ── M3 : les reprises versionnees ───────────────────────────────────────────

def test_un_fichier_ancien_est_repris_une_fois_et_garde_sa_version(store_module):
    code_admin = charger("code_admin")
    interne = FauxStore({"users": {}, "shared": {code_admin.CLE_CLAIR: "4321"}, "migrated": True})
    m = magasin(store_module, interne)
    lancer(m.async_get_shared("loggia_rooms"))
    assert interne.ecritures == 1
    assert interne.contenu["schema"] == store_module.SCHEMA
    assert code_admin.CLE_CLAIR not in interne.contenu["shared"]
    assert code_admin.verifier("4321", interne.contenu["shared"][code_admin.CLE_HACHE])


def test_un_fichier_a_jour_n_est_pas_reecrit_pour_une_etiquette(store_module):
    interne = FauxStore({"users": {}, "shared": {"loggia_rooms": ["Salon"]}, "migrated": True})
    m = magasin(store_module, interne)
    assert lancer(m.async_get_shared("loggia_rooms")) == ["Salon"]
    assert interne.ecritures == 0
    lancer(m.async_set_shared("loggia_rooms", ["Cuisine"]))
    assert interne.contenu["schema"] == store_module.SCHEMA, "la version part avec la prochaine ecriture"


def test_un_fichier_d_une_version_plus_recente_n_est_pas_repris(store_module):
    plus_tard = {"users": {"u1": {"loggia_rooms": ["Salon"]}}, "shared": {}, "schema": store_module.SCHEMA + 1}
    interne = FauxStore(plus_tard)
    m = magasin(store_module, interne)
    assert lancer(m.async_get_shared("loggia_rooms")) is None, "une reprise a tourne sur un fichier plus recent"
    assert interne.ecritures == 0
    assert "migrated" not in interne.contenu


def test_le_chargement_n_a_plus_de_if_true():
    src = (RACINE / "custom_components" / "loggia" / "store.py").read_text(encoding="utf-8")
    assert not re.search(r"^\s+if True:\s*$", src, re.M), "le bloc sans version est revenu"
    assert src.count("self._store.async_save(") == 1, "une ecriture contourne `_ecrire`"


# ── M4 : les reprises du chauffage partent en copie ────────────────────────

def test_les_reprises_du_chauffage_partent_au_disque_en_copie():
    chauffage = charger("chauffage")
    m = chauffage.LoggiaChauffage.__new__(chauffage.LoggiaChauffage)
    recus = []

    class Depot:
        async def async_save(self, data):
            recus.append(data)

    m._depot = Depot()
    m.reprises = {"climate.salon": {"jusqua": 123.0, "consigne": 20.5}}
    m._rate = lambda: False
    lancer(m._sauver_reprises())
    assert recus == [m.reprises] and recus[0] is not m.reprises
    assert recus[0]["climate.salon"] is not m.reprises["climate.salon"]


# ── B1 : un vent a « nan » ──────────────────────────────────────────────────

@pytest.mark.parametrize("brut,attendu", [("12.5", 12.5), ("nan", None), ("inf", None), ("-inf", None),
                                          ("unavailable", None), ("0", 0.0)])
def test_un_nombre_qui_n_en_est_pas_un_ne_se_lit_pas(brut, attendu):
    volets = charger("volets")
    v = volets.LoggiaVolets.__new__(volets.LoggiaVolets)
    v.hass = types.SimpleNamespace(states=types.SimpleNamespace(
        get=lambda h: types.SimpleNamespace(state=brut) if h == "sensor.vent" else None))
    assert v._nombre("sensor.vent") == attendu
    assert v._nombre("sensor.absent") is None and v._nombre(None) is None


# ── B2 : les ecoutes filtrees ──────────────────────────────────────────────

def test_les_alertes_n_ecoutent_que_binaires_et_alarmes():
    alertes = charger("alertes")
    assert alertes.etat_ecoute({"entity_id": "binary_sensor.fumee"})
    assert alertes.etat_ecoute({"entity_id": "alarm_control_panel.maison"})
    assert not alertes.etat_ecoute({"entity_id": "sensor.temperature"})
    assert not alertes.etat_ecoute({"entity_id": "light.salon"})
    assert not alertes.etat_ecoute({}) and not alertes.etat_ecoute(None)
    src = (RACINE / "custom_components" / "loggia" / "alertes.py").read_text(encoding="utf-8")
    assert 'async_listen("state_changed", self._on_state, event_filter=etat_ecoute)' in src


def test_l_eau_n_ecoute_que_vannes_prises_et_binaires():
    eau = charger("eau")
    for haid in ("valve.arrivee", "switch.vanne", "binary_sensor.fuite"):
        assert eau.etat_ecoute({"entity_id": haid}), haid
    for haid in ("sensor.debit", "light.salon", ""):
        assert not eau.etat_ecoute({"entity_id": haid}), haid
    src = (RACINE / "custom_components" / "loggia" / "eau.py").read_text(encoding="utf-8")
    assert 'async_listen("state_changed", self._sur_etat, event_filter=etat_ecoute)' in src


def test_le_filtre_est_un_callback_comme_home_assistant_l_exige():
    """Home Assistant refuse un `event_filter` qui n'est pas marque `@callback`."""
    for nom in ("alertes", "eau"):
        src = (RACINE / "custom_components" / "loggia" / (nom + ".py")).read_text(encoding="utf-8")
        assert "@callback\ndef etat_ecoute(" in src, nom
