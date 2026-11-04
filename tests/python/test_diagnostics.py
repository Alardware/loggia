"""Les diagnostics de Loggia (04/11, ADR 0325).

Le fichier se joint à un ticket : il dit la FORME de la configuration et ce que
la découverte a trouvé, compté, et jamais un nom, une entité, un identifiant,
une adresse ou le code administrateur. Ces tests le vérifient sur une
configuration qui contient tout cela.
"""
from __future__ import annotations

import asyncio
import json
import sys
import types

from conftest import PAQUET, charger


def module():
    return charger("diagnostics")


CONFIG = {
    "schema": 3,
    "migrated": True,
    "shared": {
        "loggia_admin_pin_hache": {"sel": "abcdef0123456789", "hache": "f00d" * 16, "longueur": 6},
        "loggia_users": [
            {"name": "Prénom Secret", "role": "Admin", "haId": "0123456789abcdef0123456789abcdef"},
            {"name": "Autre Personne", "role": "Famille"},
        ],
        "loggia_haCfg": {"url": "https://maison-secrete.ui.nabu.casa", "pollMs": 2000},
        "loggia_alertes": {"service": "mobile_app_telephone_de_prenom", "actif": True},
        "loggia_icones": {"light.salon_de_prenom": "bulb", "cover.chambre_enfant": "blinds"},
        "loggia_accueil": {"__profils": {
            "0": {"piecesOrdre": ["Chambre de Prénom", "Salon"], "places": {"Chambre de Prénom": {"c": 1}}},
            "1": {"piecesOrdre": [], "main": ["pieces"]},
        }},
        "loggia-mode": "dark",
        "loggia_climate": [{"mode": "input_select.mode_de_prenom", "name": "Radiateur de Prénom"}],
        "loggia_appareils": {"k3j9x0q2m5n8p1r4s7t0": {"format": "tablette", "nom": "Tablette de Prénom"}},
    },
    "users": {"fedcba9876543210fedcba9876543210": {"loggia_active_user": 0, "loggia-theme": "atrium"}},
}

INTERDITS = ("Prénom", "Secret", "Personne", "nabu.casa", "mobile_app", "light.", "cover.", "input_select.",
             "0123456789abcdef", "fedcba9876543210", "k3j9x0q2", "f00d", "abcdef0123456789", "Salon", "Chambre")


def test_la_forme_ne_dit_ni_nom_ni_entite_ni_identifiant_ni_code():
    m = module()
    texte = json.dumps({"communes": m.forme(CONFIG["shared"]), "comptes": [m.forme(v) for v in CONFIG["users"].values()]}, ensure_ascii=False)
    for mot in INTERDITS:
        assert mot not in texte, f"« {mot} » sort dans les diagnostics"
    f = m.forme(CONFIG["shared"])
    assert f["loggia_admin_pin_hache"] == "masqué"
    assert f["loggia_icones"] == {"<entités>": 2}
    assert f["loggia_appareils"] == {"<identifiants>": 1}


def test_la_forme_garde_ce_qui_sert_a_comprendre_un_ticket():
    m = module()
    f = m.forme(CONFIG["shared"])
    # Le ticket #43 : un profil sans ordre, l'autre avec.
    profils = f["loggia_accueil"]["__profils"]
    assert profils["0"]["piecesOrdre"]["liste"] == 2
    assert profils["1"]["piecesOrdre"] == {"liste": 0, "elements": []}
    assert profils["0"]["places"] == {"<autres clés>": 1}, "un nom de pièce passe pour une clé"
    # Les rôles et les réglages qui ne disent rien de la maison.
    assert [u["role"] for u in f["loggia_users"]["elements"]] == ["Admin", "Famille"]
    assert f["loggia-mode"] == "dark"
    assert f["loggia_haCfg"]["pollMs"] == "nombre"
    # Une entité dans un réglage « sûr » ne sort pas : seule une valeur d'un mot passe.
    assert f["loggia_climate"]["elements"][0]["mode"] == "texte"


def test_l_index_se_compte_sans_un_nom():
    m = module()
    r = m.resume_index({
        "version": 1,
        "areas": [{"id": "salon", "name": "Salon"}], "floors": [],
        "devices": [{"id": "d1", "name": "Poêle de Prénom"}],
        "entities": [
            {"id": "light.salon_de_prenom", "name": "Plafonnier", "platform": "hue", "hidden": False},
            {"id": "sensor.poele_etat", "name": "État", "platform": "maestro_mcz", "etat_poele": True},
            {"id": "light.cachee", "platform": "hue", "hidden": True},
        ],
        "services": {"light": {"turn_on": {}, "turn_off": {}}},
    })
    assert r["entites"] == 3 and r["entites_masquees"] == 1 and r["appareils"] == 1 and r["zones"] == 1
    assert r["par_domaine"] == {"light": 2, "sensor": 1}
    assert r["par_integration"] == {"hue": 2, "maestro_mcz": 1}
    assert r["drapeaux"] == {"etat_poele": 1}
    assert r["services"] == {"light": 2}
    texte = json.dumps(r, ensure_ascii=False)
    for mot in ("Prénom", "Plafonnier", "Salon", "salon_de"):
        assert mot not in texte


def test_le_fichier_entier_contre_un_faux_home_assistant(monkeypatch):
    m = module()
    monkeypatch.setitem(sys.modules, "homeassistant.const", types.SimpleNamespace(__version__="2026.11.0"))
    decouverte = types.ModuleType(PAQUET + ".discovery")
    decouverte.async_index = lambda hass: {"version": 1, "areas": [], "floors": [], "devices": [],
                                           "entities": [{"id": "light.salon_de_prenom", "platform": "hue"}], "services": {}}
    monkeypatch.setitem(sys.modules, PAQUET + ".discovery", decouverte)

    class Magasin:
        async def async_pour_diagnostics(self):
            return CONFIG

    async def executeur(f, *a):
        return f(*a)

    hass = types.SimpleNamespace(data={"loggia": {"store": Magasin(), "regles": object()}}, async_add_executor_job=executeur)
    r = asyncio.run(m.async_get_config_entry_diagnostics(hass, object()))
    assert r["loggia"]["home_assistant"] == "2026.11.0"
    assert r["loggia"]["modules"] == ["regles", "store"]
    assert r["configuration"]["comptes"] == 1 and list(r["configuration"]["par_compte"]) == ["compte 1"]
    assert r["decouverte"]["par_domaine"] == {"light": 1}
    texte = json.dumps(r, ensure_ascii=False)
    for mot in INTERDITS:
        assert mot not in texte, f"« {mot} » sort dans le fichier"


def test_le_magasin_rend_son_contenu_pour_les_diagnostics():
    assert hasattr(charger("store").LoggiaStore, "async_pour_diagnostics")
