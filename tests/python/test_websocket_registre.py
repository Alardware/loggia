"""Chaque commande WebSocket : son nom, son niveau d'acces, ses champs (lot 8, 30/10).

Le gros `async_register` est devenu un registre declaratif (ADR 0291). C'est
un rangement : memes commandes, memes droits, memes champs. Cette table a ete
relevee sur l'ANCIEN code, avant le registre, et ce test passait dessus ; il
doit passer a l'identique apres. Une commande nouvelle, retiree ou dont le
niveau change fait echouer ce test : c'est a dessein.

Le niveau se constate en EXECUTANT la commande, sous un compte ordinaire sans
laissez-passer, comme Home Assistant la ferait tourner :
  - `admin` : refusee en « unauthorized » (`require_admin`) ;
  - `code` : refusee en « code_admin_requis » (le code de la maison ou un
    administrateur, ADR du mode enfant) ;
  - `ouverte` : ni l'un ni l'autre.
Les champs sont ceux du schema (`?` = facultatif), hors `type`.
"""
from __future__ import annotations

import asyncio
import os
import types

import pytest

if os.environ.get("CI"):
    import voluptuous as vol
else:
    vol = pytest.importorskip("voluptuous")

from conftest import charger  # noqa: E402
from doublures_ha import poser_websocket_api  # noqa: E402

poser_websocket_api(vol)

# ASSERTION MODIFIÉE (30/10, G2-1) : deux commandes de plus (ADR 0301) — « C'est sorti » depuis le
# bandeau, ouvert a tout compte, et qui recoit quoi, pour Parametres > Alertes, aux administrateurs.
EPINGLE = {
    'loggia/chauffage/config': ('admin', 'patch'),
    'loggia/chauffage/etat': ('ouverte', ''),
    'loggia/chauffage/historique': ('ouverte', 'chauffage ?jours'),
    'loggia/chauffage/main': ('ouverte', 'chauffage ?fin ?mode ?reprendre ?temperature'),
    'loggia/chauffage/maison': ('ouverte', '?fin mode'),
    'loggia/collecte/sorti': ('ouverte', 'date sorti'),
    'loggia/config/delete': ('ouverte', ''),
    'loggia/config/get': ('ouverte', ''),
    'loggia/config/set': ('ouverte', 'config ?replace'),
    'loggia/config/suivre': ('ouverte', ''),
    'loggia/discovery': ('ouverte', ''),
    'loggia/distributeurs/config': ('admin', 'patch'),
    'loggia/distributeurs/etat': ('ouverte', '?detail'),
    'loggia/eau/etat': ('ouverte', ''),
    'loggia/eau/regle': ('admin', 'actif'),
    'loggia/enfant/config': ('code', 'patch'),
    'loggia/enfant/demander': ('ouverte', 'profil'),
    'loggia/enfant/dormir': ('ouverte', 'profil son'),
    'loggia/enfant/etat': ('ouverte', ''),
    'loggia/enfant/lever': ('code', 'minutes profil'),
    'loggia/enfant/repondre': ('code', 'accorder profil'),
    'loggia/fenetres/config': ('admin', 'patch'),
    'loggia/fenetres/etat': ('ouverte', ''),
    'loggia/interrupteurs/affecter': ('admin', 'action cle gestes ?nom'),
    'loggia/interrupteurs/ecouter': ('admin', 'duree'),
    'loggia/interrupteurs/etat': ('ouverte', ''),
    'loggia/lumieres/etat': ('ouverte', ''),
    'loggia/lumieres/journal': ('ouverte', 'entity_id'),
    'loggia/minuteurs/annuler': ('ouverte', 'entity_id'),
    'loggia/minuteurs/etat': ('ouverte', ''),
    'loggia/minuteurs/poser': ('ouverte', 'entity_id minutes'),
    'loggia/nuit/config': ('admin', 'patch'),
    'loggia/notifications/destinataires': ('admin', ''),
    'loggia/nuit/etat': ('ouverte', ''),
    'loggia/pin/definir': ('admin', 'pin'),
    'loggia/pin/verifier': ('ouverte', 'pin'),
    'loggia/presence/config': ('admin', 'patch'),
    'loggia/presence/etat': ('ouverte', ''),
    'loggia/prises/config': ('admin', 'patch'),
    'loggia/prises/etat': ('ouverte', ''),
    'loggia/profils/moi': ('ouverte', ''),
    'loggia/regles/degeler': ('admin', 'entity_id'),
    'loggia/regles/etat': ('ouverte', '?limite ?module'),
    'loggia/robots/config': ('admin', 'patch'),
    'loggia/robots/etat': ('ouverte', ''),
    'loggia/robots/lancer': ('ouverte', '?localiser robot ?role ?script ?zones'),
    'loggia/robots/scripts': ('admin', 'role script'),
    'loggia/scenarios/config': ('admin', 'patch'),
    'loggia/scenarios/etat': ('ouverte', ''),
    'loggia/scenarios/lancer': ('ouverte', 'scenario'),
    'loggia/scenarios/ordre': ('ouverte', 'ordre'),
    'loggia/sirene/tester': ('ouverte', 'entity_id'),
    'loggia/veilles/config': ('admin', 'patch'),
    'loggia/veilles/etat': ('ouverte', ''),
    'loggia/versions/liste': ('admin', ''),
    'loggia/versions/rendre': ('admin', 'version'),
    'loggia/volets/config': ('admin', 'patch'),
    'loggia/volets/etat': ('ouverte', ''),
    'loggia/volets/manoeuvres': ('ouverte', 'depuis entity_id'),
}


class _Hass:
    def __init__(self):
        self.commandes = {}
        self.data = {}

    async def async_add_executor_job(self, fonction, *args):
        return fonction(*args)


class _Connexion:
    def __init__(self):
        self.user = types.SimpleNamespace(id="u-registre", name="u-registre", is_admin=False, is_owner=False,
                                          permissions=None)
        self.erreurs = []
        self.resultats = []
        self.subscriptions = {}

    def send_result(self, mid, resultat=None):
        self.resultats.append((mid, resultat))

    def send_error(self, mid, code, message):
        self.erreurs.append((mid, code, message))

    def send_message(self, message):
        pass


class _Enfant:
    """Le mode enfant present : sa garde du code passe apres sa disponibilite."""

    async def async_etat(self, user=None):
        return {}


def _champs(gestionnaire) -> str:
    noms = []
    for cle in gestionnaire._ws_brut:
        if str(cle) == "type":
            continue
        noms.append(("?" if isinstance(cle, vol.Optional) else "") + str(cle))
    return " ".join(sorted(noms, key=lambda n: n.lstrip("?")))


def _niveau(hass, gestionnaire, nom) -> str:
    cx = _Connexion()
    try:
        retour = gestionnaire(hass, cx, {"id": 1, "type": nom})
        if asyncio.iscoroutine(retour):
            asyncio.run(retour)
    except Exception:  # noqa: BLE001 - la garde est passee, le reste n'importe pas ici
        pass
    codes = [code for _, code, _ in cx.erreurs]
    if "unauthorized" in codes:
        return "admin"
    if "code_admin_requis" in codes:
        return "code"
    return "ouverte"


@pytest.fixture
def inscrites(creer_store):
    module = charger("websocket_api")
    hass = _Hass()
    magasin = creer_store({"users": {}, "migrated": True, "shared": {}})
    module.async_register(hass, magasin, lambda nom: {"enfant": _Enfant()}.get(nom))
    return hass


def test_chaque_commande_garde_son_nom_son_niveau_et_ses_champs(inscrites):
    assert sorted(inscrites.commandes) == sorted(EPINGLE), "une commande est apparue ou a disparu"
    # ASSERTION MODIFIÉE (30/10, G2-1) : 57 + « C'est sorti » + qui recoit quoi (ADR 0301).
    assert len(inscrites.commandes) == 59
    for nom, gestionnaire in sorted(inscrites.commandes.items()):
        niveau, champs = EPINGLE[nom]
        assert _niveau(inscrites, gestionnaire, nom) == niveau, nom + " a change de niveau d'acces"
        assert bool(getattr(gestionnaire, "_exige_admin", False)) == (niveau == "admin"), nom
        assert _champs(gestionnaire) == champs, nom + " a change de champs"
