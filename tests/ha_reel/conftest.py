"""Le banc « vrai Home Assistant » (28/10, ADR 0281).

La suite ordinaire (tests/python) tourne sur des doublures de Home Assistant
ecrites a la main : elle ne voit pas une derive de l'API de Home Assistant.
Ce banc demarre le VRAI Home Assistant de `pytest-homeassistant-custom-component`
(la version de tests/ha_reel/requirements.txt, celle du minimum de hacs.json)
et y charge le composant tel que HACS le livre.

Sans le paquet (une machine ordinaire, la suite ordinaire), rien n'est collecte.
"""
from __future__ import annotations

import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parents[2]

try:
    import pytest_homeassistant_custom_component  # noqa: F401
except ImportError:  # pas de banc ici : rien a collecter
    collect_ignore_glob = ["test_*.py"]
else:
    import pytest

    # `custom_components/` se trouve depuis la racine du depot, comme dans
    # le dossier de configuration d'une installation.
    if str(RACINE) not in sys.path:
        sys.path.insert(0, str(RACINE))
    # IMPORTE ICI, avant tout Home Assistant : le paquet de test porte son
    # propre `custom_components/__init__.py` (testing_config), que le chargeur
    # monterait en premier et qui masquerait celui du depot. Deja importe, le
    # notre est celui que le chargeur parcourt.
    import custom_components  # noqa: F401, E402

    @pytest.fixture(autouse=True)
    def integrations_du_depot(enable_custom_integrations):
        """Le chargeur de Home Assistant lit `custom_components/`."""
        yield
