"""Les doublures de Home Assistant qu'il faut pour EXECUTER le composant (03/10).

`conftest.py` pose le strict necessaire aux modules de regles. Ici, ce qu'il
faut en plus pour faire tourner les commandes WebSocket et le demarrage :
elles demandent `voluptuous` (installe en CI, `pytest.importorskip` sinon).

Chaque doublure fait ce que fait le vrai module, pas moins — c'est ce qui rend
ces tests capables de voir ce que la relecture du source ne voit pas.
"""
from __future__ import annotations

import sys
import types


def poser_websocket_api(vol) -> None:
    """`homeassistant.components.websocket_api`, comme decorators.py et connection.py."""
    if "homeassistant.components.websocket_api" in sys.modules:
        return
    mod = types.ModuleType("homeassistant.components.websocket_api")
    # messages.BASE_COMMAND_MESSAGE_SCHEMA : un numero de message entier positif.
    base = vol.Schema({vol.Required("id"): vol.All(int, vol.Range(min=1))})

    def websocket_command(schema):
        def decorer(func):
            # decorators.py : `BASE_COMMAND_MESSAGE_SCHEMA.extend(schema)`.
            func._ws_brut = schema
            func._ws_schema = base.extend(schema)
            func._ws_command = schema["type"]
            return func
        return decorer

    def async_response(func):
        return func

    def require_admin(func):
        def garde(hass, connection, msg):
            if not connection.user.is_admin:
                connection.send_error(msg["id"], "unauthorized", "Unauthorized")
                return None
            return func(hass, connection, msg)
        garde._exige_admin = True
        return garde

    def async_register_command(hass, handler):
        hass.commandes[handler._ws_command] = handler

    mod.websocket_command = websocket_command
    mod.async_response = async_response
    mod.require_admin = require_admin
    mod.async_register_command = async_register_command
    mod.ActiveConnection = object
    _composants().websocket_api = mod
    sys.modules["homeassistant.components.websocket_api"] = mod


def poser_demarrage() -> None:
    """Ce que `__init__.py` et `panel.py` importent en plus des modules de regles."""
    if "homeassistant.config_entries" in sys.modules:
        return

    def module(nom, **attrs):
        m = types.ModuleType(nom)
        for k, v in attrs.items():
            setattr(m, k, v)
        sys.modules[nom] = m
        return m

    cv = module("homeassistant.helpers.config_validation",
                empty_config_schema=lambda domaine: (lambda config: config), string=str)
    sys.modules["homeassistant.helpers"].config_validation = cv
    module("homeassistant.helpers.typing", ConfigType=dict)
    module("homeassistant.config_entries", ConfigEntry=object)

    class ServiceValidationError(Exception):
        """Comme la vraie : une cle de traduction et ses valeurs."""

        def __init__(self, *args, translation_domain=None, translation_key=None,
                     translation_placeholders=None, **kwargs):
            super().__init__(*args)
            self.translation_domain = translation_domain
            self.translation_key = translation_key
            self.translation_placeholders = translation_placeholders

    module("homeassistant.exceptions", ServiceValidationError=ServiceValidationError)

    # frontend/__init__.py : les panneaux vivent dans hass.data["frontend_panels"].
    def async_register_built_in_panel(hass, composant, titre=None, icone=None,
                                      frontend_url_path=None, config=None, require_admin=False, **kw):
        hass.data.setdefault("frontend_panels", {})[frontend_url_path or composant] = {
            "titre": titre, "config": config, "require_admin": require_admin}

    def async_remove_panel(hass, chemin, *args, **kwargs):
        hass.data.get("frontend_panels", {}).pop(chemin, None)

    _composants().frontend = module("homeassistant.components.frontend",
                                    async_register_built_in_panel=async_register_built_in_panel,
                                    async_remove_panel=async_remove_panel)

    class StaticPathConfig:
        def __init__(self, url_path, path, cache_headers=True):
            self.url_path, self.path, self.cache_headers = url_path, path, cache_headers

    _composants().http = module("homeassistant.components.http", StaticPathConfig=StaticPathConfig)


def _composants():
    if "homeassistant.components" not in sys.modules:
        sys.modules["homeassistant.components"] = types.ModuleType("homeassistant.components")
    return sys.modules["homeassistant.components"]
