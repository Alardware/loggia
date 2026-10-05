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


# ── Automatisations et scripts (05/10, ADR 0155) ────────────────────────────
# `automatisations.py` lit les automatisations par ce que Home Assistant en a
# DEJA releve, comme le vrai : `automations_with_entity` / `_device` parcourent
# `hass.data["automation"].entities` (un EntityComponent) et testent
# `referenced_entities` / `referenced_devices` de chacune — l'UNION des
# declencheurs, des conditions et des actions. `action_script` porte la meme
# chose pour les seules ACTIONS (helpers/script.py). Une automatisation
# INDISPONIBLE (UnavailableAutomationEntity) n'a pas d'`action_script`, et ses
# `referenced_*` sont VIDES : `automations_with_entity` ne la trouve jamais.
# La doublure fait pareil, sinon le repli sur `raw_config` ne serait pas prouve.


class FauxScriptHA:
    """`helpers/script.py > Script` : ce que HA releve dans les seules actions."""

    def __init__(self, entites=(), appareils=()):
        self.referenced_entities = set(entites or ())
        self.referenced_devices = set(appareils or ())


class FausseAutomatisation:
    """Une entite d'automatisation, telle que le composant `automation` la tient.

    `action_script` None = UnavailableAutomationEntity : PAS d'attribut du tout
    (le code de production le lit par `getattr`), references vides.
    """

    def __init__(self, entity_id, raw_config=None, references=None, action_script=None,
                 unique_id=None):
        self.entity_id = entity_id
        self.raw_config = raw_config
        self.unique_id = unique_id
        refs = references or {}
        if action_script is None:
            self.referenced_entities, self.referenced_devices = set(), set()
        else:
            self.referenced_entities = set(refs.get("entities") or ())
            self.referenced_devices = set(refs.get("devices") or ())
            self.action_script = FauxScriptHA(action_script.get("referenced_entities"),
                                              action_script.get("referenced_devices"))


class FauxScriptEntite:
    """Une entite `script.*` : `raw_config`, et `script` (le Script de HA).

    Sans `script` (UnavailableScriptEntity), ses references sont vides.
    """

    def __init__(self, entity_id, raw_config=None, action_script=None):
        self.entity_id = entity_id
        self.raw_config = raw_config
        if action_script is None:
            self.referenced_entities, self.referenced_devices = set(), set()
        else:
            self.script = FauxScriptHA(action_script.get("referenced_entities"),
                                       action_script.get("referenced_devices"))
            self.referenced_entities = set(self.script.referenced_entities)
            self.referenced_devices = set(self.script.referenced_devices)


class FauxComposant:
    """`EntityComponent` : `entities` et `get_entity(entity_id)`, rien de plus."""

    def __init__(self, entites=()):
        self._par_id = {e.entity_id: e for e in entites}

    @property
    def entities(self):
        return list(self._par_id.values())

    def get_entity(self, entity_id):
        return self._par_id.get(entity_id)


def _avec(hass, cle, attribut, valeur):
    composant = (getattr(hass, "data", None) or {}).get(cle)
    if composant is None:
        return []
    return [e.entity_id for e in composant.entities if valeur in getattr(e, attribut, ())]


def poser_automatisations(hass, automatisations=(), scripts=()) -> None:
    """Les composants `automation` et `script`, et leurs entites dans `hass.data`.

    Les modules sont poses une fois (comme `poser_websocket_api`) : leurs
    fonctions relisent `hass.data` a chaque appel, chaque test pose ses entites.
    Un test qui veut le composant ABSENT pose `None` dans `sys.modules` par
    `monkeypatch.setitem` : l'import leve alors `ImportError`, comme sans lui.
    """
    if "homeassistant.components.automation" not in sys.modules:
        auto = types.ModuleType("homeassistant.components.automation")
        auto.automations_with_entity = lambda h, eid: _avec(h, "automation", "referenced_entities", eid)
        auto.automations_with_device = lambda h, did: _avec(h, "automation", "referenced_devices", did)
        sys.modules["homeassistant.components.automation"] = auto
        _composants().automation = auto
    if "homeassistant.components.script" not in sys.modules:
        scr = types.ModuleType("homeassistant.components.script")
        scr.scripts_with_entity = lambda h, eid: _avec(h, "script", "referenced_entities", eid)
        scr.scripts_with_device = lambda h, did: _avec(h, "script", "referenced_devices", did)
        sys.modules["homeassistant.components.script"] = scr
        _composants().script = scr
    if getattr(hass, "data", None) is None:
        hass.data = {}
    hass.data["automation"] = FauxComposant(automatisations)
    hass.data["script"] = FauxComposant(scripts)


def automatisations_depuis_fixture(bloc):
    """(automatisations, scripts, etats) depuis le bloc `automatisations` de
    tests/fixtures/distributeurs.json. `etats` : {entity_id: (etat, attributs)},
    les automatisations ET les entites d'heure du contexte."""
    ctx = bloc["contexte"]
    autos = [FausseAutomatisation(c["entity_id"], c.get("raw_config"), c.get("references"),
                                  c.get("action_script"), unique_id=(c.get("attributs") or {}).get("id"))
             for c in bloc["cas"]]
    scripts = [FauxScriptEntite(eid, s.get("raw_config"), s.get("action_script"))
               for eid, s in (ctx.get("scripts") or {}).items()]
    etats = {c["entity_id"]: (c["etat"], dict(c.get("attributs") or {})) for c in bloc["cas"]}
    for eid, e in (ctx.get("etats") or {}).items():
        etats[eid] = (e["etat"], dict(e.get("attributs") or {}))
    return autos, scripts, etats


def _composants():
    if "homeassistant.components" not in sys.modules:
        sys.modules["homeassistant.components"] = types.ModuleType("homeassistant.components")
    return sys.modules["homeassistant.components"]
