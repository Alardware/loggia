"""Le clavier de l'Apple TV dans l'index (lot 12 du rapport Gladys, M3 ; ADR 0316).

Le service `apple_tv.set_keyboard_text` ne prend pas d'entite mais l'entree de
configuration. Le composant la pose sur le binaire `keyboard_focused` de
l'integration `apple_tv`, et sur lui seul : reconnu a sa cle, jamais au nom.
"""

from __future__ import annotations

import test_discovery as banc_index

# La fixture du banc de l'index, reprise telle quelle.
decouverte = banc_index.decouverte

ENTREE = "entree-atv-essai"
CLAVIER = "binary_sensor.tv_essai_keyboard_focus"


def _index(decouverte, entites):
    hass = banc_index.poser(decouverte, entites=entites, etats={e.entity_id: {} for e in entites})
    return {e["id"]: e.get("clavier") for e in decouverte.async_index(hass)["entities"]}


def test_le_binaire_du_clavier_porte_l_entree_de_configuration(decouverte):
    drapeaux = _index(decouverte, [
        banc_index.entite(CLAVIER, platform="apple_tv", translation_key="keyboard_focused", config_entry_id=ENTREE),
        banc_index.entite("media_player.tv_essai", platform="apple_tv", config_entry_id=ENTREE),
        banc_index.entite("remote.tv_essai", platform="apple_tv", config_entry_id=ENTREE),
    ])
    assert drapeaux == {CLAVIER: ENTREE, "media_player.tv_essai": None, "remote.tv_essai": None}


def test_ni_une_autre_integration_ni_une_autre_cle_ni_le_nom(decouverte):
    drapeaux = _index(decouverte, [
        banc_index.entite("binary_sensor.autre_keyboard_focus", platform="zha", translation_key="keyboard_focused", config_entry_id="x"),
        banc_index.entite("binary_sensor.atv_keyboard_focus", platform="apple_tv", translation_key=None, config_entry_id="y"),
        banc_index.entite("sensor.atv_clavier", platform="apple_tv", translation_key="keyboard_focused", config_entry_id="z"),
    ])
    assert drapeaux == {"binary_sensor.autre_keyboard_focus": None, "binary_sensor.atv_keyboard_focus": None, "sensor.atv_clavier": None}


def test_sans_entree_de_configuration_rien(decouverte):
    drapeaux = _index(decouverte, [
        banc_index.entite(CLAVIER, platform="apple_tv", translation_key="keyboard_focused", config_entry_id=None),
        banc_index.entite("binary_sensor.vieux_registre", platform="apple_tv", translation_key="keyboard_focused"),
    ])
    assert drapeaux == {CLAVIER: None, "binary_sensor.vieux_registre": None}
