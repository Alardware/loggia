"""Audit du 12/11, lot 3 (confidentialite) : S3, S7a, S7b.

Trois fuites de lecture, chacune entre comptes Home Assistant :

  * S3  - `config/get` rendait les tables brutes des rappels et des minuteurs
          (auteur `par`, entites hors des droits du compte). Elles se lisent
          desormais par leur commande seulement.
  * S7a - l'etat des volets, des fenetres, de la presence, des veilles, des
          scenarios et des robots rendait sa part du journal en entier, quand
          `regles/etat` la filtre (ADR 0279). Meme filtre, a la sortie.
  * S7b - `config/suivre` disait a tout ecran abonne QUEL compte venait
          d'ecrire, et le nom de ses cles personnelles. Seuls les ecrans du
          compte qui ecrit l'apprennent desormais.

Ce sont des changements de DROITS : chaque refus a son test, et chaque cas qui
doit continuer de marcher aussi (administrateur, compte non restreint, meme
compte sur un autre ecran). Les commandes tournent comme Home Assistant les
execute (doublure de `websocket_api`, vrai magasin).
"""
from __future__ import annotations

import asyncio
import os
import sys
import time
import types

import pytest

if os.environ.get("CI"):
    import voluptuous as vol
else:
    vol = pytest.importorskip("voluptuous")

from conftest import charger  # noqa: E402
from doublures_ha import poser_websocket_api  # noqa: E402

poser_websocket_api(vol)


class Hass:
    def __init__(self):
        self.commandes = {}
        self.data = {}

    async def async_add_executor_job(self, fonction, *args):
        return fonction(*args)


class Connexion:
    def __init__(self, uid="u-lea", admin=False, lecture=None):
        # `lecture` : le test d'entite de Home Assistant pour un compte
        # RESTREINT ; None, un compte sans politique (presque toutes les
        # installations).
        permissions = types.SimpleNamespace(check_entity=lecture) if lecture else None
        self.user = types.SimpleNamespace(id=uid, name=uid, is_admin=admin, is_owner=False, permissions=permissions)
        self.resultats = []
        self.erreurs = []
        self.messages = []
        self.subscriptions = {}

    def send_result(self, mid, resultat=None):
        self.resultats.append((mid, resultat))

    def send_error(self, mid, code, message):
        self.erreurs.append((mid, code, message))

    def send_message(self, message):
        self.messages.append(message)


async def envoyer(hass, cx, message):
    commande = hass.commandes[message["type"]]
    msg = commande._ws_schema(message)
    retour = commande(hass, cx, msg)
    if asyncio.iscoroutine(retour):
        await retour


def lancer(coro):
    return asyncio.run(coro)


def sans_chambre(entite, _quoi):
    """Un compte que Home Assistant restreint : tout, sauf la chambre."""
    return "chambre" not in entite


def tout_permis(_entite, _quoi):
    """Un compte avec une politique qui permet tout."""
    return True


def banc(creer_store, shared=None, modules=None):
    ws = charger("websocket_api")
    hass = Hass()
    magasin = creer_store({"users": {}, "migrated": True, "shared": shared or {}})
    ws.async_register(hass, magasin, lambda nom: (modules or {}).get(nom))
    return ws, hass, magasin


# ── S3 : rappels et minuteurs hors de la lecture de la configuration ──────────

def _tables():
    fin = time.time() + 3600
    return {
        "loggia_rappels": {"a1b2c3d4e5f6": {"quand": fin, "par": "u-papa", "entite": "switch.lave_vaisselle", "sorte": "hc"}},
        "loggia_minuteurs": {"light.chambre_test": {"fin": fin, "duree": 30, "par": "u-papa"}},
        "loggia_collecte": {"sorti": {"2026-11-14": True}},
        "loggia_rooms": ["Salon"],
    }


def test_S3_les_cles_ecartees_sont_celles_des_deux_modules():
    store = charger("store")
    assert store.HORS_LECTURE == {charger("rappels").CLE, charger("minuteurs").CLE}
    # L'Accueil lit le rappel de collecte dans la configuration : il reste.
    assert "loggia_collecte" not in store.HORS_LECTURE


@pytest.mark.parametrize("admin", [False, True])
def test_S3_config_get_ne_rend_plus_rappels_ni_minuteurs(creer_store, admin):
    _ws, hass, _m = banc(creer_store, _tables())
    cx = Connexion(uid="u-papa" if admin else "u-lea", admin=admin, lecture=None if admin else sans_chambre)
    lancer(envoyer(hass, cx, {"id": 1, "type": "loggia/config/get"}))
    assert cx.erreurs == []
    config = cx.resultats[-1][1]["config"]
    assert "loggia_rappels" not in config and "loggia_minuteurs" not in config
    # Le reste de la maison, lui, se lit comme avant.
    assert config["loggia_rooms"] == ["Salon"]
    assert config["loggia_collecte"] == {"sorti": {"2026-11-14": True}}


def test_S3_la_reponse_d_une_ecriture_ne_les_rend_pas_non_plus(creer_store):
    _ws, hass, _m = banc(creer_store, _tables())
    cx = Connexion(uid="u-lea")
    lancer(envoyer(hass, cx, {"id": 2, "type": "loggia/config/set", "config": {"loggia-navoffset": 12}}))
    assert cx.erreurs == []
    config = cx.resultats[-1][1]["config"]
    assert "loggia_rappels" not in config and "loggia_minuteurs" not in config
    assert config["loggia-navoffset"] == 12


def test_S3_le_magasin_les_garde_pour_les_modules_et_les_versions(creer_store):
    """Rien n'est efface : les modules les lisent par `async_get_shared`, une
    ecriture d'un autre reglage ne les touche pas, et la copie gardee avant
    une ecriture (versions.py) les contient comme avant."""
    versions = charger("versions")
    _ws, hass, magasin = banc(creer_store, _tables())
    cx = Connexion(uid="u-papa", admin=True)
    lancer(envoyer(hass, cx, {"id": 3, "type": "loggia/config/set", "config": {"loggia_rooms": ["Salon", "Cuisine"]}}))
    assert cx.erreurs == []
    assert lancer(magasin.async_get_shared("loggia_rappels"))["a1b2c3d4e5f6"]["par"] == "u-papa"
    assert "light.chambre_test" in lancer(magasin.async_get_shared("loggia_minuteurs"))
    copie = versions.instantane(lancer(magasin._load()))
    assert "loggia_rappels" in copie["shared"]
    # Les minuteurs restent hors des copies, comme avant (GARDEES_AU_RETOUR).
    assert "loggia_minuteurs" not in copie["shared"]


# ── S7a : le journal d'un etat de module, sous les droits du compte ──────────

class Regles:
    """Le contrat de Regles.journal (regles.py) : des lignes avec leurs cibles."""

    LIGNES = [{"module": "fenetres", "regle": "ouverte", "cibles": ["climate.chambre_test"], "n": 1,
               "quoi": "Chauffage coupe", "motif": "fenetre ouverte", "detail": ""}]

    async def journal(self, limite=100, module=None):
        return [e for e in self.LIGNES if not module or e["module"] == module][:limite]

    def gels(self):
        return {}

    def tenues_toutes(self):
        return {}

    async def calme(self):
        return False


def _fenetres():
    fen_mod = charger("fenetres")
    fen = fen_mod.LoggiaFenetres.__new__(fen_mod.LoggiaFenetres)
    fen.cfg, fen.coupes, fen._minuteurs, fen.regles = {"actif": True}, {"chambre": {"climate.chambre_test"}}, {}, Regles()
    return fen


def test_S7a_fenetres_etat_tait_ce_que_regles_etat_tait(creer_store):
    fen = _fenetres()
    _ws, hass, _m = banc(creer_store, modules={"fenetres": fen, "regles": fen.regles})
    invite = Connexion(uid="u-invite", lecture=sans_chambre)
    lancer(envoyer(hass, invite, {"id": 1, "type": "loggia/regles/etat", "module": "fenetres"}))
    lancer(envoyer(hass, invite, {"id": 2, "type": "loggia/fenetres/etat"}))
    assert invite.erreurs == []
    assert invite.resultats[0][1]["journal"] == []
    assert invite.resultats[1][1]["journal"] == [], "le meme journal, par un autre chemin"


@pytest.mark.parametrize("cx", [
    Connexion(uid="u-papa", admin=True, lecture=sans_chambre),
    Connexion(uid="u-lea"),
    Connexion(uid="u-lea", lecture=tout_permis),
], ids=["administrateur", "sans_politique", "politique_qui_permet_tout"])
def test_S7a_fenetres_etat_inchange_pour_qui_lit_tout(creer_store, cx):
    fen = _fenetres()
    attendu = lancer(fen.async_etat())
    _ws, hass, _m = banc(creer_store, modules={"fenetres": fen, "regles": fen.regles})
    lancer(envoyer(hass, cx, {"id": 3, "type": "loggia/fenetres/etat"}))
    assert cx.erreurs == []
    assert cx.resultats[-1][1] == attendu
    assert cx.resultats[-1][1]["journal"][0]["cibles"] == ["climate.chambre_test"]


class Volets:
    """Ce que rend `volets/etat` : un journal, des tenues, des ordres en attente."""

    async def async_etat(self):
        return {
            "journal": [{"module": "volets", "cibles": ["cover.chambre", "cover.salon"], "n": 2},
                        {"module": "volets", "cibles": ["cover.chambre"], "n": 1},
                        {"module": "volets", "regle": "maison", "n": 1}],
            "tenues": {"cover.chambre": "soleil", "cover.salon": "nuit"},
            "attente": {"cover.chambre": {"sens": "fermer"}, "cover.salon": {"sens": "ouvrir"}},
            "abaisses": ["cover.chambre"],
        }


def test_S7a_volets_etat_filtre_journal_tenues_et_attente(creer_store):
    _ws, hass, _m = banc(creer_store, modules={"volets": Volets()})
    invite = Connexion(uid="u-invite", lecture=sans_chambre)
    lancer(envoyer(hass, invite, {"id": 4, "type": "loggia/volets/etat"}))
    assert invite.erreurs == []
    vu = invite.resultats[-1][1]
    # La ligne aux deux cibles garde la lisible ; celle de la chambre seule
    # disparait ; une ligne sans cible reste (ADR 0279).
    assert vu["journal"] == [{"module": "volets", "cibles": ["cover.salon"], "n": 2},
                             {"module": "volets", "regle": "maison", "n": 1}]
    assert vu["tenues"] == {"cover.salon": "nuit"}
    assert vu["attente"] == {"cover.salon": {"sens": "ouvrir"}}
    # Le reste de l'etat n'est pas l'objet de S7a : il part tel quel.
    assert vu["abaisses"] == ["cover.chambre"]


@pytest.mark.parametrize("cx", [
    Connexion(uid="u-papa", admin=True, lecture=sans_chambre),
    Connexion(uid="u-lea"),
    Connexion(uid="u-lea", lecture=tout_permis),
], ids=["administrateur", "sans_politique", "politique_qui_permet_tout"])
def test_S7a_volets_etat_inchange_pour_qui_lit_tout(creer_store, cx):
    _ws, hass, _m = banc(creer_store, modules={"volets": Volets()})
    lancer(envoyer(hass, cx, {"id": 5, "type": "loggia/volets/etat"}))
    assert cx.erreurs == []
    assert cx.resultats[-1][1] == lancer(Volets().async_etat())


class Robots:
    """`robots/etat` passe le compte au module (par_compte) ; son journal ne se
    filtrait pas pour autant."""

    def __init__(self):
        self.lus = []

    async def async_etat(self, user=None):
        self.lus.append(getattr(user, "id", None))
        return {"robots": [], "journal": [{"module": "robots", "cibles": ["vacuum.chambre"], "n": 1}]}


def test_S7a_robots_etat_filtre_et_garde_le_compte(creer_store):
    robots = Robots()
    _ws, hass, _m = banc(creer_store, modules={"robots": robots})
    invite = Connexion(uid="u-invite", lecture=sans_chambre)
    lancer(envoyer(hass, invite, {"id": 6, "type": "loggia/robots/etat"}))
    assert invite.erreurs == [] and robots.lus == ["u-invite"]
    assert invite.resultats[-1][1]["journal"] == []
    papa = Connexion(uid="u-papa", admin=True)
    lancer(envoyer(hass, papa, {"id": 7, "type": "loggia/robots/etat"}))
    assert len(papa.resultats[-1][1]["journal"]) == 1


class Scenarios:
    """`scenarios/ordre` rend l'etat avec l'ordre : son journal aussi."""

    async def async_ordonner(self, ordre):
        return {"ordre": list(ordre)}

    async def async_etat(self):
        return {"scenarios": [], "journal": [{"module": "scenarios", "cibles": ["light.chambre"], "n": 1},
                                             {"module": "scenarios", "cibles": ["light.salon"], "n": 1}]}


def test_S7a_scenarios_ordre_filtre_le_journal_rendu(creer_store):
    _ws, hass, _m = banc(creer_store, modules={"scenarios": Scenarios()})
    invite = Connexion(uid="u-invite", lecture=sans_chambre)
    lancer(envoyer(hass, invite, {"id": 8, "type": "loggia/scenarios/ordre", "ordre": ["cinema"]}))
    assert invite.erreurs == []
    rendu = invite.resultats[-1][1]
    assert rendu["ordre"] == ["cinema"]
    assert rendu["etat"]["journal"] == [{"module": "scenarios", "cibles": ["light.salon"], "n": 1}]
    # `scenarios/etat`, la meme chose.
    lancer(envoyer(hass, invite, {"id": 9, "type": "loggia/scenarios/etat"}))
    assert invite.resultats[-1][1]["journal"] == [{"module": "scenarios", "cibles": ["light.salon"], "n": 1}]


def test_S7a_scenarios_ordre_inchange_pour_un_compte_sans_restriction(creer_store):
    _ws, hass, _m = banc(creer_store, modules={"scenarios": Scenarios()})
    for cx in (Connexion(uid="u-papa", admin=True, lecture=sans_chambre), Connexion(uid="u-lea")):
        lancer(envoyer(hass, cx, {"id": 10, "type": "loggia/scenarios/ordre", "ordre": ["cinema"]}))
        assert cx.erreurs == []
        assert cx.resultats[-1][1]["etat"] == lancer(Scenarios().async_etat())


# ── S7b : config/suivre ne dit le compte qu'a ses propres ecrans ─────────────

@pytest.fixture
def dispatcher(monkeypatch):
    """Un vrai aiguillage : le signal du magasin atteint chaque abonne."""
    disp = sys.modules["homeassistant.helpers.dispatcher"]
    abonnes = []

    def connecter(_hass, _signal, rappel):
        abonnes.append(rappel)
        return lambda: abonnes.remove(rappel)

    def envoyer_signal(_hass, _signal, charge):
        for rappel in list(abonnes):
            rappel(charge)

    monkeypatch.setattr(disp, "async_dispatcher_connect", connecter)
    monkeypatch.setattr(disp, "async_dispatcher_send", envoyer_signal)
    return abonnes


@pytest.fixture
def suivi(creer_store, dispatcher, monkeypatch):
    ws, hass, magasin = banc(creer_store, {"loggia_users": [{"name": "Papa", "role": "Admin"}]})
    magasin.hass = hass
    monkeypatch.setattr(ws.websocket_api, "event_message",
                        lambda mid, ev: {"id": mid, "type": "event", "event": ev}, raising=False)

    def abonner(cx, mid=7):
        lancer(envoyer(hass, cx, {"id": mid, "type": "loggia/config/suivre"}))
        assert cx.erreurs == []
        return cx

    def ecrire(cx, config):
        lancer(envoyer(hass, cx, {"id": 1, "type": "loggia/config/set", "config": config}))
        assert cx.erreurs == []

    return types.SimpleNamespace(hass=hass, magasin=magasin, abonner=abonner, ecrire=ecrire)


def _evenements(cx):
    return [m["event"] for m in cx.messages]


def test_S7b_un_autre_compte_ne_recoit_ni_le_compte_ni_ses_cles_personnelles(suivi):
    papa = suivi.abonner(Connexion(uid="u-papa", admin=True))
    suivi.ecrire(Connexion(uid="u-lea"), {"loggia-navoffset": 12, "loggia_accueil": {"x": 1}})
    assert _evenements(papa) == [{"user_id": None, "perso": [], "communes": ["loggia_accueil"]}]


def test_S7b_une_ecriture_seulement_personnelle_ne_part_pas_chez_les_autres(suivi):
    papa = suivi.abonner(Connexion(uid="u-papa", admin=True))
    suivi.ecrire(Connexion(uid="u-lea"), {"loggia-navoffset": 12})
    assert papa.messages == [], "rien a relire pour lui : rien ne part"


def test_S7b_un_autre_ecran_du_meme_compte_recoit_tout_comme_avant(suivi):
    """Le client relit ses cles personnelles sur ce signe (`doitRelire`)."""
    autre_ecran = suivi.abonner(Connexion(uid="u-lea"))
    suivi.ecrire(Connexion(uid="u-lea"), {"loggia-navoffset": 12, "loggia_accueil": {"x": 1}})
    suivi.ecrire(Connexion(uid="u-lea"), {"loggia-navoffset": 13})
    assert _evenements(autre_ecran) == [
        {"user_id": "u-lea", "perso": ["loggia-navoffset"], "communes": ["loggia_accueil"]},
        {"user_id": "u-lea", "perso": ["loggia-navoffset"], "communes": []},
    ]


def test_S7b_un_signal_de_la_maison_part_chez_tous_comme_avant(suivi):
    """Les ecritures sans compte (un module, le profil, un retour de version)
    portaient deja `user_id: None` : rien ne change."""
    papa = suivi.abonner(Connexion(uid="u-papa", admin=True))
    lea = suivi.abonner(Connexion(uid="u-lea"))
    suivi.magasin.signaler_communes(["loggia_entities"])
    attendu = [{"user_id": None, "perso": [], "communes": ["loggia_entities"]}]
    assert _evenements(papa) == attendu and _evenements(lea) == attendu


def test_S7b_le_signal_interne_garde_le_compte(suivi, dispatcher):
    """`rechargement.py` et les autres abonnes du composant lisent le signal
    du magasin, pas ce que `transmettre` envoie : il ne change pas."""
    recu = []
    dispatcher.append(recu.append)
    suivi.ecrire(Connexion(uid="u-lea"), {"loggia-navoffset": 12})
    assert recu == [{"user_id": "u-lea", "perso": ["loggia-navoffset"], "communes": []}]
