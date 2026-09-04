"""Doublures de Home Assistant, pour tester le composant sans l'installer.

`store.py` n'importe de Home Assistant que deux noms : `HomeAssistant` (pour
l'annotation de type) et `Store` (le fichier de `.storage`). Aucun des deux ne
sert reellement a la logique testee — c'est du stockage, pas de la domotique.

Installer Home Assistant entier pour ces tests figerait une version, allongerait
la CI de plusieurs minutes et rendrait la suite fragile a chaque montee de
version. Ces doublures tiennent en vingt lignes et laissent les tests tourner
partout, y compris sur une machine sans Home Assistant.

Si un jour le composant depend vraiment du coeur (entites, services, boucle
d'evenements), il faudra passer a `pytest-homeassistant-custom-component`.
"""
from __future__ import annotations

import asyncio
import importlib.util
import json
import sys
import types
from pathlib import Path

import pytest

RACINE = Path(__file__).resolve().parents[2]
COMPOSANT = RACINE / "custom_components" / "loggia"


def _poser_doublures() -> None:
    """Declare les modules `homeassistant.*` dont le composant a besoin."""
    if "homeassistant.helpers.storage" in sys.modules:
        return
    for nom, attrs in (
        ("homeassistant", ()),
        ("homeassistant.core", ("HomeAssistant", "Event")),
        ("homeassistant.helpers", ()),
        ("homeassistant.helpers.storage", ("Store",)),
        # `discovery.py` lit les registres. Les doublures ci-dessous portent
        # juste `async_get`, que les tests remplacent par leurs propres donnees.
        ("homeassistant.helpers.area_registry", ("async_get",)),
        ("homeassistant.helpers.device_registry", ("async_get",)),
        ("homeassistant.helpers.entity_registry", ("async_get",)),
        ("homeassistant.helpers.floor_registry", ("async_get",)),
        # `volets.py` demande l'heure locale a Home Assistant plutot qu'au
        # systeme : la doublure renvoie l'heure du systeme, ce qui suffit a
        # decider d'un jour de la semaine.
        ("homeassistant.util", ()),
        ("homeassistant.util.dt", ("now",)),
        # `presence.py` et `volets.py` posent des abonnements et des rendez-vous
        # quand on enregistre leur configuration. Les doublures ne font rien :
        # aucun test ne veut declencher un vrai minuteur.
        ("homeassistant.helpers.event", ("async_track_state_change_event",
                                         "async_call_later", "async_track_sunrise",
                                         "async_track_sunset", "async_track_time_change",
                                         "async_track_time_interval")),
    ):
        module = types.ModuleType(nom)
        for attr in attrs:
            setattr(module, attr, type(attr, (), {}))
        sys.modules[nom] = module
    # `@callback` decore les fonctions du composant : sans lui, l'import echoue.
    sys.modules["homeassistant.core"].callback = lambda f: f
    # `from homeassistant.util import dt` va chercher un ATTRIBUT du paquet,
    # pas seulement une entree de `sys.modules` : il faut relier les deux.
    import datetime as _dt
    sys.modules["homeassistant.util.dt"].now = _dt.datetime.now
    # Ces helpers renvoient normalement une fonction de desabonnement : la
    # doublure en rend une qui ne fait rien, pour que le code de production
    # puisse la stocker et l'appeler comme d'habitude.
    _ev = sys.modules["homeassistant.helpers.event"]
    for _nom in ("async_track_state_change_event", "async_call_later",
                 "async_track_sunrise", "async_track_sunset",
                 "async_track_time_change", "async_track_time_interval"):
        setattr(_ev, _nom, lambda *a, **k: (lambda: None))
    sys.modules["homeassistant.helpers"].event = _ev
    sys.modules["homeassistant.util"].dt = sys.modules["homeassistant.util.dt"]


_poser_doublures()


def charger(nom: str):
    """Charge un module du composant, isole de tout paquet installe."""
    chemin = COMPOSANT / f"{nom}.py"
    spec = importlib.util.spec_from_file_location(f"loggia_{nom}", chemin)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class FauxStore:
    """Remplace le `Store` de Home Assistant : garde le JSON en memoire.

    Serialise a l'ecriture et deserialise a la lecture, comme le vrai : sans
    cela un test pourrait muter par erreur l'objet deja « ecrit » et croire a
    tort que la sauvegarde a fonctionne.
    """

    def __init__(self, depart=None):
        self.contenu = json.loads(json.dumps(depart)) if depart is not None else None
        self.ecritures = 0

    async def async_load(self):
        return json.loads(json.dumps(self.contenu)) if self.contenu is not None else None

    async def async_save(self, data):
        # Le vrai `Store` planifie la serialisation dans un executor : la boucle
        # continue de tourner pendant ce temps, et un autre appel peut muter le
        # MEME objet. On rend donc la main ici — sans quoi les ecritures ne
        # s'entrelacent jamais et le test de concurrence ne prouverait rien.
        instantane = json.loads(json.dumps(data))
        await asyncio.sleep(0)
        self.contenu = instantane
        self.ecritures += 1


@pytest.fixture
def store_module():
    """Le module `store.py` du composant."""
    return charger("store")


@pytest.fixture
def creer_store(store_module):
    """Fabrique un `LoggiaStore` pose sur un contenu de depart donne."""

    def fabrique(depart=None, ancien=None):
        magasin = store_module.LoggiaStore.__new__(store_module.LoggiaStore)
        magasin._store = FauxStore(depart)
        # Fichier ecrit sous l'ancien nom du projet. Vide par defaut : la
        # plupart des tests n'ont rien a reprendre.
        magasin._ancien = FauxStore(ancien)
        magasin._data = None
        magasin._lock = asyncio.Lock()
        return magasin

    return fabrique
