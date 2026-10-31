"""Le refus d'un minuteur pose sur un appareil deja eteint, jusqu'a l'ecran (audit du 19/10).

`minuteurs.py` le refuse par son code (`minuteur_deja_eteint`, `RefusNomme`) ;
la commande `loggia/minuteurs/poser` doit le relayer tel quel (`_relayer`,
websocket_api.py) : sans quoi l'ecran recevait « invalid_format », le code d'un
message qu'il n'envoie pas de lui-meme.
"""
from __future__ import annotations

from conftest import charger
from test_websocket_api_execution import Connexion, Hass, envoyer, lancer


class Minuteurs:
    """Le module, vu de la commande : il refuse comme le vrai."""

    def __init__(self, refus):
        self.refus = refus

    async def async_poser(self, haid, minutes, par=None, controle=None):
        raise self.refus

    def async_etat(self, controle=None):
        return {"minuteurs": {}, "maintenant": 0}


def poser(creer_store, refus):
    module = charger("websocket_api")
    hass = Hass()
    module.async_register(hass, creer_store({"users": {}, "migrated": True, "shared": {}}), lambda nom: {"minuteurs": Minuteurs(refus)}.get(nom))
    cx = Connexion()
    lancer(envoyer(hass, cx, {"id": 7, "type": "loggia/minuteurs/poser", "entity_id": "switch.prise_cafe",
                              "minutes": 30}))
    return cx


def test_le_refus_d_un_appareil_eteint_arrive_avec_son_code(creer_store):
    refus = charger("refus").RefusNomme("minuteur_deja_eteint", "appareil deja eteint", "switch.prise_cafe")
    cx = poser(creer_store, refus)
    assert cx.erreurs == [(7, "minuteur_deja_eteint", "appareil deja eteint : switch.prise_cafe")]


def test_un_autre_refus_reste_un_format_invalide(creer_store):
    cx = poser(creer_store, ValueError("minutes : entre 1 et 1440"))
    assert [e[1] for e in cx.erreurs] == ["invalid_format"]
