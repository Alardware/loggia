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
    ("nuit.py", 2), ("presence.py", 4), ("volets.py", 2), ("veilles.py", 1), ("robots.py", 3), ("alertes.py", 1),
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


# ── M10 : les replis qui elargissaient, ou qui se taisaient ────────────────

def test_un_compte_illisible_fait_refuser_au_lieu_d_elargir():
    """Le coeur de M10 (24/09).

    `controle_de(None)` vaut « aucun filtre ». C'est juste pour une
    automatisation, qui n'a pas d'utilisateur. C'est le pire possible pour une
    personne dont le compte n'a pas pu etre lu : le scenario partait avec les
    droits de la maison entiere.
    """
    scn = charger("scenarios")
    # Sans identifiant : rien a resoudre, la maison agit sous ses droits.
    assert scn.compte_resolu(None, None) is True
    assert scn.compte_resolu("", None) is True
    # Un identifiant present et resolu : on continue.
    assert scn.compte_resolu("abc", object()) is True
    # Un identifiant present et IRRESOLU : on refuse.
    assert scn.compte_resolu("abc", None) is False

    # Et c'est bien cette regle qui garde le service.
    src = (RACINE / "custom_components" / "loggia" / "__init__.py").read_text(encoding="utf-8")
    assert "if not compte_resolu(uid, utilisateur):" in src
    assert "return" in src.split("if not compte_resolu(uid, utilisateur):")[1][:200]


def test_un_module_qui_rate_son_demarrage_le_dit_et_le_retient(caplog):
    """Une tache lancee et oubliee emporte son erreur avec elle : le module
    repondait ensuite a l'ecran comme si de rien n'etait."""
    regles = charger("regles")

    class FauxHass:
        def __init__(self):
            self.taches = []

        def async_create_task(self, coro):
            self.taches.append(coro)

    class Module:
        pass

    async def qui_rate():
        raise RuntimeError("magasin injoignable")

    async def qui_marche():
        return None

    for coro, attendu in ((qui_rate(), False), (qui_marche(), True)):
        h, m = FauxHass(), Module()
        regles.demarrer(h, m, coro, "essai")
        assert m.demarrage is None, "l'etat n'est connu qu'une fois la tache passee"
        lancer(h.taches[0])
        assert m.demarrage is attendu

    assert "demarrage impossible" in caplog.text
    assert "magasin injoignable" in caplog.text


def test_chaque_module_passe_par_le_demarrage_garde():
    """Neuf modules posaient la tache eux-memes, sans filet."""
    dossier = RACINE / "custom_components" / "loggia"
    for f in ("fenetres", "interrupteurs", "minuteurs", "nuit", "presence",
              "robots", "scenarios", "sirene", "veilles", "volets"):
        src = (dossier / (f + ".py")).read_text(encoding="utf-8")
        assert "hass.async_create_task(self._async_demarrer())" not in src, f
        assert 'demarrer(hass, self, self._async_demarrer(), "' in src, f


# ── S7 : ce qui ecoute finit par se taire ──────────────────────────────────

def test_chaque_module_vivant_sait_s_arreter():
    """Douze modules portaient une methode d'arret que personne n'appelait.

    Maintenant qu'`async_unload_entry` les appelle, la liste et la realite
    doivent rester d'accord : un module ajoute a `MODULES_VIVANTS` sans savoir
    se taire laisserait ses abonnements derriere lui.
    """
    dossier = RACINE / "custom_components" / "loggia"
    init = (dossier / "__init__.py").read_text(encoding="utf-8")
    bloc = init.split("MODULES_VIVANTS = (")[1].split(")")[0]
    noms = re.findall(r'"([a-z_]+)"', bloc)
    assert len(noms) == 12, noms
    for nom in noms:
        src = (dossier / (nom + ".py")).read_text(encoding="utf-8")
        assert "def async_arreter" in src or "def arreter" in src, nom


def test_le_dechargement_arrete_mais_ne_touche_pas_a_l_irreversible():
    """Les vues HTTP, les commandes WebSocket et le service ne se
    desenregistrent pas : les oublier ferait echouer le chargement suivant."""
    init = (RACINE / "custom_components" / "loggia" / "__init__.py").read_text(encoding="utf-8")
    # Borne a la fonction : sans cela on ramasse `_async_setup_common`, qui
    # suit et qui, lui, parle bien de "http" et de "ws".
    corps = init.split("async def async_unload_entry")[1]
    corps = re.split(r"\n(?:async )?def ", corps)[0]
    assert "for nom in MODULES_VIVANTS:" in corps
    assert 'data.pop(nom, None)' in corps
    assert 'getattr(module, "async_arreter", None) or getattr(module, "arreter", None)' in corps
    # Plus de drapeau "http" depuis le retrait du ping (24/09) : le panneau
    # pose ses chemins statiques par lui-meme, et ne se retire pas non plus.
    for garde in ('"ws"', '"service_scenario"', '"store"'):
        assert garde not in corps, garde + " ne doit pas etre retire au dechargement"


def test_les_alertes_savent_se_taire():
    """Elles ecoutaient TOUT le bus sans garder de quoi s'arreter : un
    rechargement posait une seconde ecoute par-dessus la premiere."""
    module = charger("alertes")
    a = module.LoggiaAlertes.__new__(module.LoggiaAlertes)
    retires = []
    a._defait = lambda: retires.append(1)
    a.async_arreter()
    assert retires == [1]
    assert a._defait is None
    a.async_arreter()  # deux fois de suite : sans effet, sans lever
    assert retires == [1]


def test_les_deux_replis_morts_ont_disparu():
    """Ils visaient des versions anterieures au minimum annonce, 2024.7."""
    dossier = RACINE / "custom_components" / "loggia"
    assert "register_static_path(" not in (dossier / "panel.py").read_text(encoding="utf-8").replace(
        "async_register_static_paths(", "")
    etages = (dossier / "discovery.py").read_text(encoding="utf-8").split("def _etages")[1].split("def ")[0]
    assert "except ImportError" not in etages



def test_les_deux_portes_que_personne_n_ouvrait_ont_disparu():
    """`loggia/config/stats` et `GET /api/loggia/ping` (24/09, plan S7).

    Aucune ligne de `src/` ne les appelait, le README ne les citait pas. Une
    porte que personne n'ouvre est une porte a tenir vraie pour rien : le
    diagnostic promettait des chiffres que nul n'a jamais lus, le ping ne
    repondait qu'a qui savait deja ou regarder.
    """
    dossier = RACINE / "custom_components" / "loggia"
    for fichier, interdits in (
        ("websocket_api.py", ("WS_STATS", "config/stats", "handle_stats")),
        ("store.py", ("async_stats",)),
        ("__init__.py", ("LoggiaPingView", "loggia/ping", "HomeAssistantView")),
    ):
        src = (dossier / fichier).read_text(encoding="utf-8")
        for mot in interdits:
            assert mot not in src, fichier + " parle encore de " + mot
