"""Une seule idee de la lumiere de la maison (audit du 19/10, ADR 0260).

Ce qui vaut d'etre verrouille : la LED d'une borne Wi-Fi (`config`), une lampe
cachee ou desactivee ne sont pas des lumieres de la maison ; un interrupteur
declare lumiere en est une ; un groupe s'efface devant ses membres ; une
veilleuse est epargnee, et le groupe qui la contient avec elle ; un
interrupteur recoit l'ordre de SON domaine, jamais `light.turn_off`.
"""
from __future__ import annotations

import asyncio
import re
import types

import pytest

from conftest import charger


def lancer(coro):
    return asyncio.run(coro)


@pytest.fixture
def maison():
    return charger("lumieres_maison")


LED, SALON, CHAMBRE, LINO = "light.u6_lr_led", "light.salon", "light.chambre", "light.veilleuse_lino"
EXTERIEUR = "switch.lumiere_exterieur"


def entree(haid, categorie=None, cache=None, desactivee=None):
    """Une entree du registre des entites, comme Home Assistant la tient."""
    return types.SimpleNamespace(entity_id=haid, entity_category=categorie, hidden_by=cache, disabled_by=desactivee)


def registre_de_base(maison):
    return maison.lire_registre([entree(LED, categorie="config"), entree(SALON), entree(CHAMBRE), entree(LINO),
                                 entree("light.cachee", cache="user"), entree("light.ancienne", desactivee="user"),
                                 entree(EXTERIEUR), entree("switch.prise_nas")])


def test_le_registre_se_lit_sans_home_assistant(maison):
    r = registre_de_base(maison)
    assert r[LED] == {"categorie": "config", "cache": False, "desactivee": False}
    assert r["light.cachee"]["cache"] is True and r["light.ancienne"]["desactivee"] is True
    assert r[SALON] == {"categorie": None, "cache": False, "desactivee": False}
    # Une entree sans `hidden_by` (un registre d'avant), un objet qui n'en est pas une : rien ne leve.
    assert maison.lire_registre([types.SimpleNamespace(entity_id="light.x"), None, 5])["light.x"]["cache"] is False
    assert maison.lire_registre(None) == {}


def test_les_lumieres_de_la_maison_sans_la_led_ni_les_cachees_plus_l_interrupteur_declare(maison):
    attributs = {LED: {}, SALON: {}, CHAMBRE: {}, LINO: {}, "light.cachee": {}, "light.jardin": {},
                 EXTERIEUR: {}, "switch.prise_nas": {}}
    assert maison.lumieres_de_la_maison(attributs, registre_de_base(maison), [EXTERIEUR]) == [
        CHAMBRE, "light.jardin", SALON, LINO, EXTERIEUR]
    # Sans registre (illisible) : toutes les `light.*` qui ont un etat, et l'interrupteur declare.
    assert LED in maison.lumieres_de_la_maison(attributs, None, [EXTERIEUR])
    # Un interrupteur declare mais cache ou desactive n'en est pas une ; un `light.*` declare n'ajoute rien.
    r = dict(registre_de_base(maison), **{EXTERIEUR: {"categorie": None, "cache": True, "desactivee": False}})
    assert EXTERIEUR not in maison.lumieres_de_la_maison(attributs, r, [EXTERIEUR, SALON, 5, None])


def test_un_interrupteur_declare_doit_etre_connu(maison):
    """Declare mais sans etat ni entree au registre - retire de la maison -, il
    n'est plus une lumiere : rien ne le commanderait."""
    attributs = {SALON: {}}
    assert maison.lumieres_de_la_maison(attributs, registre_de_base(maison), [EXTERIEUR, "switch.parti"]) == [
        SALON, EXTERIEUR]
    assert maison.lumieres_de_la_maison(attributs, None, ["switch.parti"]) == [SALON]


def test_un_groupe_s_efface_devant_ses_membres(maison):
    attributs = {SALON: {}, CHAMBRE: {}, "light.tout": {"entity_id": [SALON, CHAMBRE]},
                 # Un groupe dont aucun membre n'est de la maison reste : c'est la seule prise qu'on ait.
                 "light.borne": {"entity_id": [LED]}, LED: {}}
    assert maison.lumieres_de_la_maison(attributs, registre_de_base(maison)) == ["light.borne", CHAMBRE, SALON]
    # Un groupe de groupes s'efface aussi ; un `entity_id` qui n'est pas une liste ne fait pas un groupe.
    attributs["light.maison"] = {"entity_id": ["light.tout"]}
    attributs["light.bizarre"] = {"entity_id": SALON}
    assert maison.lumieres_de_la_maison(attributs, registre_de_base(maison)) == [
        "light.bizarre", "light.borne", CHAMBRE, SALON]


def test_les_veilleuses_sont_epargnees_et_le_groupe_qui_en_contient_une(maison):
    attributs = {SALON: {}, LINO: {}, "light.chambre_tout": {"entity_id": [CHAMBRE, LINO]},
                 "light.etage": {"entity_id": ["light.chambre_tout"]}, "light.salon_tout": {"entity_id": [SALON]}}
    assert maison.a_epargner(attributs, [LINO]) == {LINO, "light.chambre_tout", "light.etage"}
    # Une veilleuse absente ou renommee dans la liste, une liste vide ou abimee : rien ne leve, rien de plus.
    assert maison.a_epargner(attributs, ["light.partie"]) == {"light.partie"}
    assert maison.a_epargner(attributs, []) == set()
    assert maison.a_epargner(attributs, [None, 5, ""]) == set()
    assert maison.a_epargner({}, [LINO]) == {LINO}


def test_un_interrupteur_recoit_l_ordre_de_son_domaine(maison):
    assert maison.service_de(SALON, False) == ("light", "turn_off")
    assert maison.service_de(SALON, True) == ("light", "turn_on")
    assert maison.service_de(EXTERIEUR, False) == ("homeassistant", "turn_off")
    assert maison.service_de(EXTERIEUR, True) == ("homeassistant", "turn_on")
    # Par service, les lampes d'abord, chaque lot trie ; rien pour rien.
    assert maison.par_service([EXTERIEUR, SALON, CHAMBRE], False) == [
        ("light", "turn_off", [CHAMBRE, SALON]), ("homeassistant", "turn_off", [EXTERIEUR])]
    assert maison.par_service([SALON], True) == [("light", "turn_on", [SALON])]
    assert maison.par_service([], True) == []


def test_les_interrupteurs_declares_se_lisent_comme_les_prises_les_lisent(maison):
    assert maison.interrupteurs_declares([EXTERIEUR, "light.x", 5], None) == {EXTERIEUR}
    # Le repli herite : `switchLights` de `loggia_entities`, seulement sans la cle neuve.
    assert maison.interrupteurs_declares(None, {"switchLights": [EXTERIEUR]}) == {EXTERIEUR}
    assert maison.interrupteurs_declares([], {"switchLights": [EXTERIEUR]}) == set()
    assert maison.interrupteurs_declares("switch.a", {"switchLights": "switch.b"}) == set()


def test_les_veilleuses_se_lisent_dans_la_regle_nuit(maison):
    assert maison.veilleuses_de({"veilleuse": {"actif": False, "lampes": [LINO, 5, ""]}}) == [LINO]
    assert maison.veilleuses_de({"veilleuse": {"lampes": "light.x"}}) == []
    assert maison.veilleuses_de(None) == [] and maison.veilleuses_de({"veilleuse": None}) == []


def test_le_magasin_donne_les_interrupteurs_et_les_veilleuses(maison, creer_store):
    magasin = creer_store({"users": {}, "migrated": True,
                           "shared": {"loggia_switchlights": [EXTERIEUR],
                                      "loggia_nuit": {"veilleuse": {"lampes": [LINO]}}}})
    assert lancer(maison.async_interrupteurs_declares(magasin)) == {EXTERIEUR}
    assert lancer(maison.async_veilleuses(magasin)) == [LINO]
    herite = creer_store({"users": {}, "migrated": True, "shared": {"loggia_entities": {"switchLights": [EXTERIEUR]}}})
    assert lancer(maison.async_interrupteurs_declares(herite)) == {EXTERIEUR}
    assert lancer(maison.async_veilleuses(herite)) == []


class FauxEtat:
    def __init__(self, state, attributes=None):
        self.state = state
        self.attributes = attributes or {}


class FauxEtats:
    def __init__(self, table):
        self.table = dict(table)

    def get(self, haid):
        return self.table.get(haid)

    def async_entity_ids(self, domaine):
        return [h for h in self.table if h.startswith(domaine + ".")]


def test_les_attributs_des_lumieres_viennent_des_etats(maison):
    hass = types.SimpleNamespace(states=FauxEtats({SALON: FauxEtat("on", {"brightness": 3}), EXTERIEUR: FauxEtat("off"),
                                                    "switch.prise_nas": FauxEtat("on"), "sensor.x": FauxEtat("1")}))
    assert maison.attributs_des_lumieres(hass, [EXTERIEUR, "switch.parti"]) == {SALON: {"brightness": 3}, EXTERIEUR: {}}
    assert maison.attributs_des_lumieres(hass) == {SALON: {"brightness": 3}}


def test_le_registre_de_home_assistant_ou_rien(maison, monkeypatch):
    import sys

    reg = types.SimpleNamespace(entities={LED: entree(LED, categorie="config"), SALON: entree(SALON)})
    er = sys.modules["homeassistant.helpers.entity_registry"]
    monkeypatch.setattr(er, "async_get", lambda _h: reg)
    assert maison.registre_de(object()) == {LED: {"categorie": "config", "cache": False, "desactivee": False},
                                            SALON: {"categorie": None, "cache": False, "desactivee": False}}

    def casse(_h):
        raise RuntimeError("registre indisponible")

    monkeypatch.setattr(er, "async_get", casse)
    assert maison.registre_de(object()) is None, "illisible : on ne filtre rien, et on ne leve pas"


def test_le_module_est_pur():
    from conftest import COMPOSANT

    texte = (COMPOSANT / "lumieres_maison.py").read_text(encoding="utf-8")
    tete = texte.split("# ── Le temps reel")[0]
    assert not re.search(r"^\s*(from|import) homeassistant", tete, re.M), "rien de Home Assistant avant le temps reel"
    assert not re.search(r"^(from|import) homeassistant", texte, re.M), "l'import du registre vit dans sa fonction"
    assert "async_call" not in texte, "il ne commande rien"
