"""Les commandes WebSocket, EXECUTEES comme Home Assistant les execute (03/10).

`test_websocket_api.py` relit la source : il voit qu'un `require_admin` est la,
pas qu'il agit. L'audit du 03/10 l'a montre par deux mutations qui passaient
toute la suite — `is_admin=True` dans la configuration, et `if ok or True:`
dans la verification du code administrateur.

Et une collision que la relecture ne pouvait pas voir : le lancement d'un
scenario declarait un champ `id`. Home Assistant etend son schema de base
`{id: entier}` par celui de la commande — la cle de base etait remplacee par
`str` — pendant que la bibliotheque du navigateur ecrase `id` avec le numero du
message. Tout lancement depuis l'ecran etait refuse en « invalid_format ».

Ici, une doublure de `homeassistant.components.websocket_api` fait ce que fait
le vrai module (decorators.py, connection.py) : schema de base etendu, cles en
trop refusees, `require_admin` qui refuse « unauthorized ». Les gestionnaires
tournent sur le vrai magasin et le vrai code administrateur.
"""
from __future__ import annotations

import asyncio
import os
import types

import pytest

# En CI, ces tests ne se sautent JAMAIS : sans `voluptuous`, ils passeraient
# en silence. Ailleurs, une machine sans lui les saute.
if os.environ.get("CI"):
    import voluptuous as vol
else:
    vol = pytest.importorskip("voluptuous")

from conftest import charger  # noqa: E402
from doublures_ha import poser_websocket_api  # noqa: E402


# La doublure de `homeassistant.components.websocket_api` : doublures_ha.py.
poser_websocket_api(vol)


class Hass:
    def __init__(self):
        self.commandes = {}
        self.data = {}

    async def async_add_executor_job(self, fonction, *args):
        return fonction(*args)


class Connexion:
    def __init__(self, uid="u-lea", admin=False):
        self.user = types.SimpleNamespace(id=uid, name=uid, is_admin=admin, is_owner=False, permissions=None)
        self.resultats = []
        self.erreurs = []
        self.subscriptions = {}

    def send_result(self, mid, resultat=None):
        self.resultats.append((mid, resultat))

    def send_error(self, mid, code, message):
        self.erreurs.append((mid, code, message))


async def envoyer(hass, cx, message):
    """connection.py : un `id` ENTIER, puis le schema etendu, puis la commande."""
    if type(message.get("id")) is not int:
        cx.send_error(message.get("id"), "invalid_format", "id entier attendu")
        return
    commande = hass.commandes[message["type"]]
    try:
        msg = commande._ws_schema(message)
    except vol.Invalid as err:
        cx.send_error(message["id"], "invalid_format", str(err))
        return
    retour = commande(hass, cx, msg)
    if asyncio.iscoroutine(retour):
        await retour


def lancer(coro):
    return asyncio.run(coro)


class Scenarios:
    """Ce que le module des scenarios rend : on retient QUI a ete lance."""

    def __init__(self):
        self.lances = []

    async def async_lancer(self, ident, user_id=None, controle=None):
        self.lances.append((ident, user_id))
        return {"n": 3, "erreurs": 0, "refusees": 0} if ident == "cinema" else None


PROFILS = [{"name": "Papa", "role": "Admin"}, {"name": "Léa", "role": "Famille"}]


@pytest.fixture
def banc(creer_store):
    module = charger("websocket_api")
    magasin = creer_store({"users": {}, "migrated": True, "shared": {"loggia_users": PROFILS, "loggia_rooms": ["Salon"]}})
    hass = Hass()
    scenarios = Scenarios()
    module.async_register(hass, magasin, acces_scenarios=lambda: scenarios)
    return types.SimpleNamespace(hass=hass, store=magasin, scenarios=scenarios, module=module)


# ── Le schema : ce que Home Assistant accepte vraiment ──────────────────────

def test_toutes_les_commandes_sont_enregistrees(banc):
    assert len(banc.hass.commandes) == 32, sorted(banc.hass.commandes)


def test_aucune_commande_ne_declare_id(banc):
    """`id` est le numero du message : le declarer remplace la cle de base de
    Home Assistant, et la bibliotheque du navigateur l'ecrase de toute facon."""
    for nom, commande in banc.hass.commandes.items():
        assert "id" not in [str(k) for k in commande._ws_brut], nom + " declare un champ id"


def test_lancer_un_scenario_comme_le_navigateur_l_envoie(banc):
    cx = Connexion()
    lancer(envoyer(banc.hass, cx, {"id": 12, "type": "loggia/scenarios/lancer", "scenario": "cinema"}))
    assert cx.erreurs == [], cx.erreurs
    assert cx.resultats == [(12, {"n": 3, "erreurs": 0, "refusees": 0})]
    assert banc.scenarios.lances == [("cinema", "u-lea")], "le scenario lance n'est pas celui demande"


def test_un_scenario_inconnu_se_dit(banc):
    cx = Connexion()
    lancer(envoyer(banc.hass, cx, {"id": 13, "type": "loggia/scenarios/lancer", "scenario": "inconnu"}))
    assert [e[1] for e in cx.erreurs] == ["not_found"]
    assert "inconnu" in cx.erreurs[0][2]


def test_l_ancien_message_est_refuse_comme_il_l_etait(banc):
    # Ce qu'envoyait l'ecran : le scenario dans `id`, ecrase par le numero.
    cx = Connexion()
    lancer(envoyer(banc.hass, cx, {"id": 14, "type": "loggia/scenarios/lancer"}))
    assert [e[1] for e in cx.erreurs] == ["invalid_format"]
    assert banc.scenarios.lances == []


# ── Les droits : un compte ordinaire et la maison ───────────────────────────

def test_un_compte_ordinaire_ne_reecrit_pas_la_maison(banc):
    cx = Connexion(admin=False)
    lancer(envoyer(banc.hass, cx, {"id": 20, "type": "loggia/config/set", "config": {"loggia_rooms": ["Grenier"]}}))
    assert [e[1] for e in cx.erreurs] == ["not_admin"], cx.erreurs
    assert "loggia_rooms" in cx.erreurs[0][2], "le refus doit NOMMER la cle"
    assert lancer(banc.store._load())["shared"]["loggia_rooms"] == ["Salon"]


def test_un_compte_ordinaire_range_ses_cartes(banc):
    # ADR 0125 : l'agencement n'est pas un privilege d'administrateur.
    cx = Connexion(admin=False)
    lancer(envoyer(banc.hass, cx, {"id": 21, "type": "loggia/config/set", "config": {"loggia_accueil": {"pc": ["meteo"]}}}))
    assert cx.erreurs == []
    assert lancer(banc.store._load())["shared"]["loggia_accueil"] == {"pc": ["meteo"]}


def test_un_administrateur_ecrit_la_maison(banc):
    cx = Connexion(uid="u-papa", admin=True)
    lancer(envoyer(banc.hass, cx, {"id": 22, "type": "loggia/config/set", "config": {"loggia_rooms": ["Grenier"]}}))
    assert cx.erreurs == []
    assert lancer(banc.store._load())["shared"]["loggia_rooms"] == ["Grenier"]


def test_une_commande_reservee_refuse_un_compte_ordinaire(banc):
    cx = Connexion(admin=False)
    lancer(envoyer(banc.hass, cx, {"id": 23, "type": "loggia/pin/definir", "pin": "4321"}))
    assert [e[1] for e in cx.erreurs] == ["unauthorized"]
    assert lancer(banc.store.async_get_code_admin()) is None, "un compte ordinaire a defini le code"


# ── Ranger les scenarios : de l'agencement, ouvert a tout compte (03/10) ──
#
# L'ordre passait par `scenarios/config`, reservee : refuse a un compte
# ordinaire, et l'ecran avalait le refus. Ici le VRAI module des scenarios, sur
# le vrai magasin — ce que la commande accepte se juge contre les scenarios de
# la maison, pas contre une doublure qui dirait oui a tout.

@pytest.fixture
def banc_scenarios(creer_store, monkeypatch):
    module = charger("websocket_api")
    scn = charger("scenarios")
    monkeypatch.setattr(scn, "async_index", lambda hass, user=None: {"areas": [], "devices": [], "entities": []})
    magasin = creer_store({"users": {}, "migrated": True, "shared": {
        "loggia_scenarios": {"persos": [{"id": "perso_apero", "nom": "Apéro", "actions": []}], "migre": True}}})
    hass = Hass()
    hass.states = types.SimpleNamespace(get=lambda haid: None, async_entity_ids=lambda domaine=None: [])
    s = scn.LoggiaScenarios.__new__(scn.LoggiaScenarios)
    s.hass, s.store, s.regles, s._derniers = hass, magasin, None, {}
    module.async_register(hass, magasin, acces_scenarios=lambda: s)
    return types.SimpleNamespace(hass=hass, store=magasin)


def _scenarios_ranges(banc):
    return lancer(banc.store._load())["shared"]["loggia_scenarios"]


def test_un_compte_ordinaire_range_les_scenarios(banc_scenarios):
    cx = Connexion(admin=False)
    lancer(envoyer(banc_scenarios.hass, cx, {"id": 60, "type": "loggia/scenarios/ordre",
                                             "ordre": ["cinema", "perso_apero", "nuit"]}))
    assert cx.erreurs == [], cx.erreurs
    assert _scenarios_ranges(banc_scenarios)["ordre"] == ["cinema", "perso_apero", "nuit"]
    mid, reponse = cx.resultats[-1]
    assert mid == 60 and reponse["ordre"] == ["cinema", "perso_apero", "nuit"]
    # L'etat revient avec, deja range : l'ecran redessine sans attendre son sondage.
    assert [x["id"] for x in reponse["etat"]["scenarios"]][:3] == ["cinema", "perso_apero", "nuit"]


def test_ranger_n_ouvre_pas_le_reste(banc_scenarios):
    cx = Connexion(admin=False)
    # Creer, modifier, supprimer restent aux administrateurs...
    lancer(envoyer(banc_scenarios.hass, cx, {"id": 61, "type": "loggia/scenarios/config",
                                             "patch": {"supprimer": "perso_apero"}}))
    # ... et rien ne se glisse par l'ordre : une cle de plus est refusee.
    lancer(envoyer(banc_scenarios.hass, cx, {"id": 62, "type": "loggia/scenarios/ordre",
                                             "ordre": ["nuit"], "supprimer": "perso_apero"}))
    assert [e[1] for e in cx.erreurs] == ["unauthorized", "invalid_format"], cx.erreurs
    cfg = _scenarios_ranges(banc_scenarios)
    assert [p["id"] for p in cfg["persos"]] == ["perso_apero"] and not cfg.get("ordre")


def test_un_scenario_inconnu_fait_refuser_et_se_nomme(banc_scenarios):
    cx = Connexion(admin=False)
    lancer(envoyer(banc_scenarios.hass, cx, {"id": 63, "type": "loggia/scenarios/ordre",
                                             "ordre": ["cinema", "perso_fantome", "nuit"]}))
    assert [e[1] for e in cx.erreurs] == ["not_found"], cx.erreurs
    assert "perso_fantome" in cx.erreurs[0][2], "le refus doit NOMMER l'identifiant"
    assert not _scenarios_ranges(banc_scenarios).get("ordre"), "un ordre refuse a ete ecrit"


@pytest.mark.parametrize("ordre", [
    "cinema",                    # pas une liste
    ["cinema", 3],               # pas que du texte
    ["cinema", ""],              # un identifiant vide
    ["x" * 65],                  # un identifiant demesure
    ["cinema"] * 65,             # une liste demesuree
    ["nuit", "cinema", "nuit"],  # un doublon
])
def test_ce_qu_on_range_est_borne(banc_scenarios, ordre):
    cx = Connexion(admin=False)
    lancer(envoyer(banc_scenarios.hass, cx, {"id": 64, "type": "loggia/scenarios/ordre", "ordre": ordre}))
    assert [e[1] for e in cx.erreurs] == ["invalid_format"], cx.erreurs
    assert not _scenarios_ranges(banc_scenarios).get("ordre")


# ── Le code administrateur ──────────────────────────────────────────────────

def test_un_mauvais_code_ne_passe_pas_et_finit_par_bloquer(banc):
    code_admin = charger("code_admin")
    cx = Connexion(admin=False)
    reponses = []
    for i in range(code_admin.ESSAIS_LIBRES + 1):
        lancer(envoyer(banc.hass, cx, {"id": 30 + i, "type": "loggia/pin/verifier", "pin": "9999"}))
        reponses.append(cx.resultats[-1][1])
    assert all(r["ok"] is False for r in reponses), "un mauvais code est passe"
    assert reponses[-1]["bloque"] > 0, "les essais rates ne bloquent jamais"


def test_le_bon_code_ouvre_le_passage_vers_un_profil_admin(banc):
    cx = Connexion(admin=False)
    vers_papa = {"id": 40, "type": "loggia/config/set", "config": {"loggia_active_user": 0}}
    # Sans code : refuse, et le refus le dit — par SON code (audit du 03/10).
    # `not_admin` est celui des reglages de la maison ; l'ecran departageait
    # les deux par une expression sur le motif francais. Le motif reste, pour
    # le journal.
    lancer(envoyer(banc.hass, cx, vers_papa))
    assert [e[1] for e in cx.erreurs] == ["code_admin_requis"], cx.erreurs
    assert "code administrateur" in cx.erreurs[0][2]
    # Le code par defaut (jamais defini), puis le meme passage : accepte.
    lancer(envoyer(banc.hass, cx, {"id": 41, "type": "loggia/pin/verifier", "pin": "0000"}))
    assert cx.resultats[-1] == (41, {"ok": True})
    lancer(envoyer(banc.hass, cx, {**vers_papa, "id": 42}))
    assert len(cx.erreurs) == 1, cx.erreurs
    # Le laissez-passer est a CE compte : un autre compte ordinaire ne passe pas.
    autre = Connexion(uid="u-invite", admin=False)
    lancer(envoyer(banc.hass, autre, {**vers_papa, "id": 43}))
    assert [e[1] for e in autre.erreurs] == ["code_admin_requis"]


def test_un_code_defini_se_verifie_et_l_ancien_ne_passe_plus(banc):
    admin = Connexion(uid="u-papa", admin=True)
    lancer(envoyer(banc.hass, admin, {"id": 50, "type": "loggia/pin/definir", "pin": "4321"}))
    assert admin.resultats[-1] == (50, {"defini": True})
    cx = Connexion(admin=False)
    lancer(envoyer(banc.hass, cx, {"id": 51, "type": "loggia/pin/verifier", "pin": "0000"}))
    assert cx.resultats[-1][1]["ok"] is False, "le code par defaut passe encore"
    lancer(envoyer(banc.hass, cx, {"id": 52, "type": "loggia/pin/verifier", "pin": "4321"}))
    assert cx.resultats[-1] == (52, {"ok": True})


# ── Un refus previsible se dit par son CODE (audit du 03/10) ────────────────
#
# Le composant refusait en francais sans accents — « trop de scenarios (24 au
# plus) » —, et l'ecran l'affichait tel quel, dans les sept langues. Chaque
# refus qu'un geste ordinaire peut provoquer porte un code a lui ; ce qu'il
# nomme — une cle, une limite — suit les deux-points, seul repere que l'ecran
# lise (src/refus.js, tests/refus_codes.test.mjs). Le reste est au journal.

def _nomme(message: str) -> str:
    """Ce que l'ecran lit d'un refus : ce qui suit les premiers deux-points."""
    assert ":" in message, "le refus ne nomme rien : " + message
    return message.split(":", 1)[1].strip()


def test_un_scenario_de_trop_se_refuse_par_son_code(banc_scenarios):
    persos = [{"id": "perso_%d" % i, "nom": "S%d" % i, "actions": []} for i in range(24)]
    lancer(banc_scenarios.store.async_set_shared("loggia_scenarios", {"persos": persos, "migre": True}))
    cx = Connexion(uid="u-papa", admin=True)
    lancer(envoyer(banc_scenarios.hass, cx, {"id": 70, "type": "loggia/scenarios/config",
                                             "patch": {"enregistrer": {"nom": "Vingt-cinq"}}}))
    assert [e[1] for e in cx.erreurs] == ["trop_de_scenarios"], cx.erreurs
    assert _nomme(cx.erreurs[0][2]) == "24", "la limite doit etre NOMMEE"
    assert len(_scenarios_ranges(banc_scenarios)["persos"]) == 24, "un scenario de trop a ete ecrit"


def test_une_action_de_trop_se_refuse_par_son_code(banc_scenarios):
    cx = Connexion(uid="u-papa", admin=True)
    actions = [{"famille": "lumieres", "geste": "eteindre", "portee": "maison"}] * 13
    lancer(envoyer(banc_scenarios.hass, cx, {"id": 71, "type": "loggia/scenarios/config",
                                             "patch": {"enregistrer": {"nom": "Tout", "actions": actions}}}))
    assert [e[1] for e in cx.erreurs] == ["trop_d_actions"], cx.erreurs
    assert _nomme(cx.erreurs[0][2]) == "12"


def test_un_scenario_illisible_reste_un_format_invalide(banc_scenarios):
    # Ce que l'ecran n'envoie pas de lui-meme garde le code d'avant.
    cx = Connexion(uid="u-papa", admin=True)
    lancer(envoyer(banc_scenarios.hass, cx, {"id": 72, "type": "loggia/scenarios/config",
                                             "patch": {"enregistrer": {"nom": "X", "teinte": "fuchsia"}}}))
    assert [e[1] for e in cx.erreurs] == ["invalid_format"], cx.erreurs


def test_un_plafond_du_magasin_se_dit_aussi_en_rangeant(banc_scenarios, monkeypatch):
    # `handle_scn_ordre` repondait `invalid_format` a tout `ValueError`, quand
    # ses voisines passaient par `_relayer` (relecture du 03/10) : le plafond
    # perdait son code et la cle qu'il nomme, et l'ecran disait une panne. Le
    # plafond est pose au poids d'aujourd'hui : l'ordre de plus le depasse,
    # dans le VRAI magasin.
    magasin = charger("store")
    scn = charger("scenarios")
    actuel = scn.lire_config(lancer(banc_scenarios.store.async_get_shared(scn.CLE)))
    monkeypatch.setattr(magasin, "MAX_VALUE_BYTES", magasin._taille({scn.CLE: actuel}))
    cx = Connexion(admin=False)
    lancer(envoyer(banc_scenarios.hass, cx, {"id": 77, "type": "loggia/scenarios/ordre",
                                             "ordre": ["cinema", "perso_apero", "nuit"]}))
    assert [e[1] for e in cx.erreurs] == ["payload_too_large"], cx.erreurs
    assert _nomme(cx.erreurs[0][2]) == "loggia_scenarios", "l'ecran nomme la cle par ce qui suit les deux-points"
    assert not _scenarios_ranges(banc_scenarios).get("ordre"), "un ordre refuse a ete ecrit"


def test_une_valeur_trop_lourde_se_refuse_et_nomme_sa_cle(banc):
    magasin = charger("store")
    cx = Connexion(uid="u-papa", admin=True)
    lourd = {"loggia_rooms": ["x" * magasin.MAX_VALUE_BYTES]}
    lancer(envoyer(banc.hass, cx, {"id": 73, "type": "loggia/config/set", "config": lourd}))
    assert [e[1] for e in cx.erreurs] == ["payload_too_large"], cx.erreurs
    assert _nomme(cx.erreurs[0][2]) == "loggia_rooms", "l'ecran nomme la cle par ce qui suit les deux-points"
    assert lancer(banc.store._load())["shared"]["loggia_rooms"] == ["Salon"]


def test_un_plafond_de_module_se_dit_et_une_valeur_illisible_n_en_est_pas_un(creer_store):
    module = charger("websocket_api")
    store = charger("store")
    magasin = creer_store({"users": {}, "migrated": True, "shared": {}})

    class Volets:
        async def async_enregistrer(self, patch):
            if "verification" in patch:
                raise ValueError("tentatives : entre 1 et 3")
            await magasin.async_set_shared("loggia_volets", {"x": "x" * store.MAX_VALUE_BYTES})
            return {}

    hass = Hass()
    module.async_register(hass, magasin, acces_volets=lambda: Volets())
    cx = Connexion(uid="u-papa", admin=True)
    lancer(envoyer(hass, cx, {"id": 74, "type": "loggia/volets/config", "patch": {"planning": {}}}))
    lancer(envoyer(hass, cx, {"id": 75, "type": "loggia/volets/config", "patch": {"verification": {"tentatives": 9}}}))
    # Tout `ValueError` partait en `payload_too_large` : une valeur illisible
    # se serait dite « trop volumineuse ».
    assert [e[1] for e in cx.erreurs] == ["payload_too_large", "invalid_format"], cx.erreurs
    assert _nomme(cx.erreurs[0][2]) == "loggia_volets"


def test_un_planning_de_trop_se_refuse_par_son_code(creer_store):
    module = charger("websocket_api")
    refus = charger("refus")

    class Robots:
        async def async_enregistrer(self, patch):
            raise refus.RefusNomme("trop_de_plannings", "trop de plannings, au plus", 24)

    hass = Hass()
    module.async_register(hass, creer_store({"users": {}, "migrated": True, "shared": {}}),
                          acces_robots=lambda: Robots())
    cx = Connexion(uid="u-papa", admin=True)
    lancer(envoyer(hass, cx, {"id": 76, "type": "loggia/robots/config", "patch": {"plannings": []}}))
    assert cx.erreurs == [(76, "trop_de_plannings", "trop de plannings, au plus : 24")], cx.erreurs
