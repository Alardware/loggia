"""Tests de fumee contre un vrai Home Assistant (28/10, ADR 0281).

Peu de tests, et des gros : ils ne refont pas la suite ordinaire, ils verifient
que le composant DEMARRE dans la version de Home Assistant annoncee par
hacs.json, et que les cinq portes qu'il ouvre repondent :
  * l'ajout depuis l'interface (config_flow) ;
  * le demarrage et l'arret de l'entree ;
  * le panneau ;
  * un aller-retour WebSocket, sous les droits d'un administrateur ;
  * le magasin : ce qui est ecrit est dans le fichier, et relu au redemarrage.
"""
from __future__ import annotations

from homeassistant.config_entries import ConfigEntryState
from homeassistant.data_entry_flow import FlowResultType
from pytest_homeassistant_custom_component.common import MockConfigEntry

DOMAINE = "loggia"


async def _demarrer(hass):
    entree = MockConfigEntry(domain=DOMAINE, title="Loggia", data={}, unique_id=DOMAINE)
    entree.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entree.entry_id)
    await hass.async_block_till_done()
    return entree


async def _arreter(hass, entree):
    assert await hass.config_entries.async_unload(entree.entry_id)
    await hass.async_block_till_done()


async def test_l_ajout_depuis_l_interface_ne_demande_rien_et_reste_unique(hass):
    r = await hass.config_entries.flow.async_init(DOMAINE, context={"source": "user"})
    assert r["type"] is FlowResultType.FORM and r["step_id"] == "user"
    r = await hass.config_entries.flow.async_configure(r["flow_id"], {})
    assert r["type"] is FlowResultType.CREATE_ENTRY and r["title"] == "Loggia" and r["data"] == {}
    await hass.async_block_till_done()
    second = await hass.config_entries.flow.async_init(DOMAINE, context={"source": "user"})
    assert second["type"] is FlowResultType.ABORT and second["reason"] == "already_configured"
    for entree in hass.config_entries.async_entries(DOMAINE):
        await _arreter(hass, entree)


async def test_l_entree_demarre_ouvre_son_panneau_et_s_arrete(hass):
    entree = await _demarrer(hass)
    assert entree.state is ConfigEntryState.LOADED
    assert DOMAINE in hass.data.get("frontend_panels", {}), "le panneau Loggia n'est pas enregistre"
    await _arreter(hass, entree)
    assert entree.state is ConfigEntryState.NOT_LOADED
    assert DOMAINE not in hass.data.get("frontend_panels", {}), "le panneau survit a l'arret"


async def test_un_aller_retour_websocket_et_le_magasin(hass, hass_ws_client, hass_storage):
    entree = await _demarrer(hass)
    client = await hass_ws_client(hass)
    await client.send_json({"id": 1, "type": "loggia/config/set", "config": {"loggia_rooms": ["Salon", "Cuisine"]}})
    r = await client.receive_json()
    assert r["success"], r
    await client.send_json({"id": 2, "type": "loggia/config/get"})
    r = await client.receive_json()
    assert r["success"], r
    assert r["result"]["config"]["loggia_rooms"] == ["Salon", "Cuisine"], "la configuration ecrite ne se relit pas"
    assert r["result"]["user"]["is_admin"] is True, "le compte du banc n'est pas administrateur"
    await hass.async_block_till_done()
    fichier = hass_storage.get("loggia_dashboard_config")
    assert fichier and fichier["data"]["shared"]["loggia_rooms"] == ["Salon", "Cuisine"], "rien n'est arrive au fichier"
    # Le code administrateur jamais defini : le refus se nomme (ADR 0279).
    await client.send_json({"id": 3, "type": "loggia/pin/verifier", "pin": "0000"})
    r = await client.receive_json()
    assert not r["success"] and r["error"]["code"] == "code_non_defini", r
    await _arreter(hass, entree)
    # Redemarre : la configuration est relue du fichier.
    assert await hass.config_entries.async_setup(entree.entry_id)
    await hass.async_block_till_done()
    await client.send_json({"id": 4, "type": "loggia/config/get"})
    r = await client.receive_json()
    assert r["success"] and r["result"]["config"]["loggia_rooms"] == ["Salon", "Cuisine"], r
    await _arreter(hass, entree)
