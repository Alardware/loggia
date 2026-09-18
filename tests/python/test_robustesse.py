"""Ce que l'audit du 18/09 a corrige, verrouille : chaque panne trouvee a ici
sa contre-epreuve, pour qu'elle ne revienne pas en silence."""
from __future__ import annotations

import asyncio
import re
from pathlib import Path

import pytest

from conftest import FauxStore, charger

RACINE = Path(__file__).resolve().parents[2]


def lancer(coro):
    return asyncio.run(coro)


# ── Le magasin : copie avant ecriture, chargement sous verrou ─────────────

class StoreQuiRate(FauxStore):
    def __init__(self, depart=None, rates=1):
        super().__init__(depart)
        self.rates = rates

    async def async_save(self, data):
        if self.rates > 0:
            self.rates -= 1
            raise OSError("disque plein")
        await super().async_save(data)


def test_une_ecriture_refusee_n_empoisonne_pas_les_suivantes(creer_store):
    magasin = creer_store({"users": {}, "shared": {"loggia_rooms": ["Salon"]}, "migrated": True})
    magasin._store = StoreQuiRate({"users": {}, "shared": {"loggia_rooms": ["Salon"]}, "migrated": True}, rates=1)
    with pytest.raises(OSError):
        lancer(magasin.async_set_user("u1", {"loggia_rooms": ["Cuisine"]}, is_admin=True))
    assert lancer(magasin.async_get_user("u1"))["loggia_rooms"] == ["Salon"], "le cache garde ce que le disque a, pas ce qu'il a refuse"
    lancer(magasin.async_set_user("u1", {"loggia_look": "clair"}, is_admin=True))
    vu = lancer(magasin.async_get_user("u1"))
    assert vu["loggia_look"] == "clair" and vu["loggia_rooms"] == ["Salon"]
    assert magasin._store.contenu["shared"]["loggia_look"] == "clair", "l'ecriture suivante atteint bien le disque"


def test_une_valeur_non_serialisable_est_refusee_clairement(creer_store):
    magasin = creer_store({"users": {}, "shared": {}, "migrated": True})
    with pytest.raises(ValueError):
        lancer(magasin.async_set_shared("loggia_volets", {"quand": object()}))
    assert "loggia_volets" not in lancer(magasin._load())["shared"]


def test_un_seul_chargement_meme_a_plusieurs(creer_store):
    magasin = creer_store({"users": {}, "shared": {"loggia_rooms": ["Salon"]}, "migrated": True})
    charges = []
    original = magasin._store.async_load

    async def lent():
        charges.append(1)
        await asyncio.sleep(0)
        return await original()

    magasin._store.async_load = lent

    async def scenario():
        await asyncio.gather(magasin.async_get_shared("loggia_rooms"), magasin.async_set_shared("loggia_look", "clair"),
                             magasin.async_get_user("u1"))
        return await magasin.async_get_shared("loggia_look")

    assert lancer(scenario()) == "clair"
    assert len(charges) == 1, "lecteurs et ecrivains partagent le meme chargement"


# ── Les regles : un echec se dit, l'arret ecrit, la rafale ne gele pas ────

@pytest.fixture
def socle_module():
    return charger("regles")


class _FauxEtats:
    def get(self, haid):
        return None


class _ServicesQuiRatent:
    async def async_call(self, *a, **k):
        raise RuntimeError("service refuse")

    def has_service(self, d, s):
        return True


class _Bus:
    def __init__(self):
        self.ecoutes = []

    def async_listen_once(self, evt, rappel):
        self.ecoutes.append((evt, rappel))


class _Hass:
    def __init__(self, services):
        self.services = services
        self.states = _FauxEtats()
        self.bus = _Bus()

    def async_create_task(self, coro):
        return asyncio.ensure_future(coro)


def test_un_service_refuse_se_lit_au_journal(socle_module, creer_store):
    hass = _Hass(_ServicesQuiRatent())
    regles = socle_module.Regles(hass, creer_store({"users": {}, "shared": {}, "migrated": True}))
    regles._depot = FauxStore(None)
    partis = lancer(regles.agir("volets", "planning", "cover", "close_cover", ["cover.salon"], quoi="fermer"))
    assert partis == []
    journal = lancer(regles.journal(module="volets"))
    assert journal[0]["n"] == 0 and "commande refusee par Home Assistant" in journal[0]["detail"]


def test_l_arret_ecrit_ce_que_le_differe_retient(socle_module, creer_store):
    hass = _Hass(_ServicesQuiRatent())
    regles = socle_module.Regles(hass, creer_store({"users": {}, "shared": {}, "migrated": True}))
    regles._depot = FauxStore(None)
    assert [e for e, _ in hass.bus.ecoutes] == ["homeassistant_stop"]
    lancer(regles.noter("nuit", "coucher", "eteindre", cibles=["light.salon"]))
    assert regles._depot.ecritures == 0, "l'ecriture est differee"
    rappel = hass.bus.ecoutes[0][1]
    lancer(rappel(None))
    assert regles._depot.ecritures == 1 and regles._depot.contenu["entrees"][0]["quoi"] == "eteindre"


def test_mille_ordres_ne_passent_pas_pour_des_mains(socle_module):
    src = (RACINE / "custom_components" / "loggia" / "regles.py").read_text(encoding="utf-8")
    assert "del self._miens[:-1024]" in src


# ── Les scenarios : les commandes refusees sont comptees ───────────────────

def test_lancer_un_scenario_dit_les_commandes_refusees():
    src = (RACINE / "custom_components" / "loggia" / "scenarios.py").read_text(encoding="utf-8")
    assert src.count("erreurs += 1") == 2
    assert '"erreurs": erreurs' in src
    assert "commande(s) refusee(s) par Home Assistant" in src


# ── Les modules : plus de lecture muette ───────────────────────────────────

@pytest.mark.parametrize("fichier,attendu", [
    ("nuit.py", 2), ("presence.py", 4), ("volets.py", 1), ("veilles.py", 1), ("robots.py", 2), ("alertes.py", 1),
])
def test_chaque_lecture_qui_echoue_se_dit(fichier, attendu):
    src = (RACINE / "custom_components" / "loggia" / fichier).read_text(encoding="utf-8")
    assert src.count("illisible") >= attendu or src.count("impossible pendant l'alerte") >= attendu, fichier


def test_le_code_administrateur_s_essaie_un_compte_a_la_fois():
    src = (RACINE / "custom_components" / "loggia" / "websocket_api.py").read_text(encoding="utf-8")
    assert "async with verrous_pin.setdefault(uid, asyncio.Lock()):" in src


def test_la_version_ne_relit_plus_le_manifeste_a_chaque_decouverte():
    src = (RACINE / "custom_components" / "loggia" / "discovery.py").read_text(encoding="utf-8")
    assert 'read_text(encoding="utf-8")' not in src.split("def _valeur")[0].split("def _version_du_composant")[1]
    module = charger("discovery")

    class E:
        value = 0
    assert module._valeur(E()) == 0, "une valeur d'enum fausse est une valeur"


def test_zha_et_deconz_ne_sont_annonces_que_s_ils_existent():
    src = (RACINE / "custom_components" / "loggia" / "interrupteurs.py").read_text(encoding="utf-8")
    assert 'self.sources["zha"] = self._composant("zha")' in src
    assert 'self.sources["deconz"] = self._composant("deconz")' in src
    assert 'nom in self.hass.config.components' in src


def test_les_veilles_ont_un_rang():
    module = charger("veilles")
    regles = charger("regles")
    assert module.PRIORITES["co2"] == regles.niveau("nuit", 10)
    assert module.PRIORITES["creuses"] == regles.niveau("confort", 5)
    assert module.PRIORITES["co2"] > module.PRIORITES["creuses"] > 0
