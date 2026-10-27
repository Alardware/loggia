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
    # 34 depuis le 05/10 : l'etat et le planning du distributeur (ADR 0155).
    # 38 avec les quatre du chauffage (chantier Chauffage, § 8.2), 39 avec
    # les manoeuvres d'un volet (chantier Volets, spec 6.5), 41 avec les deux
    # des prises (chantier Prises, spec 6.1), 43 avec les deux du carnet des
    # lumieres (chantier Lumieres, spec 6.2), 49 avec les six du mode enfant
    # (chantier Mode enfant, spec 7.4), 50 avec le depart d'un robot (chantier
    # IoT, I3 A).
    # ASSERTION MODIFIEE (chantier Mode enfant, tache 3) : 43 -> 49.
    # ASSERTION MODIFIEE (chantier IoT, tache 4, 18/10) : 49 -> 50, `loggia/robots/lancer`.
    # ASSERTION MODIFIEE (passe bis 2 de la tranche robots 2, 20/10) : 50 -> 51, `loggia/robots/scripts` — la roue de la popup
    # envoie le role seul, le serveur le fond dans la description de la maison.
    # ASSERTION MODIFIEE (etape 3 IoT, 25/10 ; I28, I29) : 52 -> 54, `loggia/eau/etat` (ouverte) et `loggia/eau/regle` (admin).
    # 55 avec le profil du compte connecte (ADR 0276, 27/10).
    assert len(banc.hass.commandes) == 55, sorted(banc.hass.commandes)


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


def test_un_code_a_huit_chiffres_d_avant_apprend_sa_longueur(banc):
    """Ticket #38 (ADR 0278) : un code a huit chiffres, accepte par le reglage,
    ne se saisissait pas — le pave verifiait des le quatrieme. Un code range
    avant le 27/10 ne porte pas sa longueur : elle s'apprend a la premiere
    reussite, et l'ecran la lit ensuite. Un essai rate n'apprend rien."""
    code_admin = charger("code_admin")
    ancien = {k: v for k, v in code_admin.hacher("12345678").items() if k != "longueur"}
    lancer(banc.store.async_set_code_admin(ancien))
    assert "loggia_admin_pin_longueur" not in lancer(banc.store.async_get_user("u1"))
    cx = Connexion(admin=False)
    lancer(envoyer(banc.hass, cx, {"id": 60, "type": "loggia/pin/verifier", "pin": "1234"}))
    assert cx.resultats[-1][1]["ok"] is False
    assert code_admin.longueur_de(lancer(banc.store.async_get_code_admin())) is None, "un code faux a appris une longueur"
    lancer(envoyer(banc.hass, cx, {"id": 61, "type": "loggia/pin/verifier", "pin": "12345678"}))
    assert cx.resultats[-1] == (61, {"ok": True})
    assert lancer(banc.store.async_get_user("u1"))["loggia_admin_pin_longueur"] == 8
    assert code_admin.verifier("12345678", lancer(banc.store.async_get_code_admin())), "le code lui-meme n'a pas change"


def test_un_code_redefini_pendant_la_verification_reste_le_nouveau(banc):
    """La verification lit le code, puis passe des dizaines de millisecondes
    dans PBKDF2. Un administrateur qui definit un nouveau code entre-temps ne
    doit pas voir revenir l'ancien quand la longueur s'apprend : l'ancien
    rouvrirait l'Admin, et le nouveau ne marcherait plus (ADR 0278)."""
    code_admin = charger("code_admin")
    ancien = {k: v for k, v in code_admin.hacher("12345678").items() if k != "longueur"}
    lancer(banc.store.async_set_code_admin(ancien))
    lu = lancer(banc.store.async_get_code_admin())
    # Entre la lecture et l'apprentissage : un nouveau code, de cinq chiffres.
    lancer(banc.store.async_set_code_admin(code_admin.hacher("24680")))
    assert lancer(banc.store.async_apprendre_longueur_code(lu["sel"], lu["hache"], 8)) is False
    e = lancer(banc.store.async_get_code_admin())
    assert code_admin.verifier("24680", e) and not code_admin.verifier("12345678", e), "l'ancien code est revenu"
    assert code_admin.longueur_de(e) == 5
    # Le meme enregistrement, deja dote de sa longueur, ne se reecrit pas non plus.
    assert lancer(banc.store.async_apprendre_longueur_code(e["sel"], e["hache"], 8)) is False
    assert code_admin.longueur_de(lancer(banc.store.async_get_code_admin())) == 5


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


def test_le_depart_d_un_robot_passe_par_les_droits_du_compte(creer_store):
    """TEST AJOUTE (chantier IoT, tache 4, 18/10 ; I3 A). `loggia/robots/lancer` : ouvert a tout compte, borne a ce
    qu'il PILOTE — la session le dit (`controle_de`), jamais le message ; une PermissionError rend `unauthorized`,
    un refus nomme son code ; le robot se nomme `robot`, et des zones absentes valent tout."""
    module = charger("websocket_api")
    refus = charger("refus")

    class Robots:
        def __init__(self):
            self.departs = []

        async def async_lancer_depart(self, robot, zones, user=None, controle=None):
            if controle is not None and not controle(robot):
                raise PermissionError("pas le droit de piloter %s" % robot)
            if robot == "vacuum.loin":
                raise refus.RefusNomme("robot_injoignable", "robot injoignable", robot)
            self.departs.append((robot, zones, user.id))
            return {"maintenant": 1.0, "passages": [], "en_cours": {}, "erreurs": {}}

    robots = Robots()
    hass = Hass()
    module.async_register(hass, creer_store({"users": {}, "migrated": True, "shared": {}}), acces_robots=lambda: robots)
    lea = Connexion(uid="u-lea")
    salon = [{"id": "seg:1", "nom": "Salon", "segments": [1]}]
    lancer(envoyer(hass, lea, {"id": 80, "type": "loggia/robots/lancer", "robot": "vacuum.salon"}))
    lancer(envoyer(hass, lea, {"id": 81, "type": "loggia/robots/lancer", "robot": "vacuum.salon", "zones": salon}))
    assert robots.departs == [("vacuum.salon", [], "u-lea"), ("vacuum.salon", salon, "u-lea")]
    assert [r[0] for r in lea.resultats] == [80, 81] and "en_cours" in lea.resultats[0][1]
    # Une politique d'entites : ce compte-la ne pilote que la cuisine.
    invite = Connexion(uid="u-invite")
    invite.user.permissions = types.SimpleNamespace(check_entity=lambda haid, sorte: haid == "vacuum.cuisine")
    lancer(envoyer(hass, invite, {"id": 82, "type": "loggia/robots/lancer", "robot": "vacuum.salon"}))
    lancer(envoyer(hass, lea, {"id": 83, "type": "loggia/robots/lancer", "robot": "vacuum.loin"}))
    lancer(envoyer(hass, lea, {"id": 84, "type": "loggia/robots/lancer", "robot": "vacuum.salon", "piece": "x"}))
    assert [(e[0], e[1]) for e in invite.erreurs] == [(82, "unauthorized")]
    assert [(e[0], e[1]) for e in lea.erreurs] == [(83, "robot_injoignable"), (84, "invalid_format")]
    assert len(robots.departs) == 2, "un refus ne fait partir aucun robot"


def test_le_script_maison_d_un_robot_passe_par_lancer(creer_store):
    """TEST AJOUTE (passe bis du 18/10, point A ; sa reponse « Par le serveur ») : `loggia/robots/lancer` prend aussi le script maison
    d'un aspirateur (`script`), sous les memes droits ; sans `script`, l'appel reste celui d'avant — un depart.
    ASSERTION MODIFIEE (passe bis 2 du 18/10, points J et L) : le script part avec le ROLE que l'ecran demande (`role`, l'un des cinq
    de Parametres ; un autre ne se lit pas) ; l'exemple d'avant etait un script de SON installation — il devient
    « nettoyer_buanderie », qu'il n'a pas."""
    module = charger("websocket_api")

    class Robots:
        def __init__(self):
            self.departs = []

        async def async_lancer_depart(self, robot, zones, script=None, role=None, user=None, controle=None):
            self.departs.append((robot, zones, script, role, user.id))
            return {"passages": [], "en_cours": {}, "erreurs": {}}

    robots = Robots()
    hass = Hass()
    module.async_register(hass, creer_store({"users": {}, "migrated": True, "shared": {}}), acces_robots=lambda: robots)
    lea = Connexion(uid="u-lea")
    lancer(envoyer(hass, lea, {"id": 90, "type": "loggia/robots/lancer", "robot": "vacuum.salon", "script": "script.nettoyer_buanderie",
                               "role": "nettoyer_tout"}))
    lancer(envoyer(hass, lea, {"id": 91, "type": "loggia/robots/lancer", "robot": "vacuum.salon"}))
    lancer(envoyer(hass, lea, {"id": 92, "type": "loggia/robots/lancer", "robot": "vacuum.salon", "script": ""}))
    lancer(envoyer(hass, lea, {"id": 93, "type": "loggia/robots/lancer", "robot": "vacuum.salon", "script": "script.x", "role": "danser"}))
    assert robots.departs == [("vacuum.salon", [], "script.nettoyer_buanderie", "nettoyer_tout", "u-lea"), ("vacuum.salon", [], None, None, "u-lea")]
    assert [(e[0], e[1]) for e in lea.erreurs] == [(92, "invalid_format"), (93, "invalid_format")], "un script vide, un role inconnu ne se lisent pas"


# ── Le distributeur (05/10, ADR 0155) ───────────────────────────────────────
#
# `etat` est ouverte a tout compte, mais rend ce que CE compte a le droit de
# lire : c'est la session qui le dit (`connection.user`), jamais le message.
# `config` ecrit le planning de la maison : administrateurs seulement, et
# « trop de repas » se dit par son code.

class Distributeurs:
    def __init__(self):
        self.lus = []
        self.ecrits = []

    async def async_etat(self, user=None, detail=False):
        self.lus.append((user.id, user.is_admin, detail))
        return {"source": None, "vu_par": user.id}

    async def async_enregistrer(self, patch):
        refus = charger("refus")
        if len(patch.get("repas") or []) > 12:
            raise refus.RefusNomme("trop_de_repas", "trop de repas, au plus", 12)
        self.ecrits.append(patch)
        return {"appareil": None, "repas": patch.get("repas") or []}


@pytest.fixture
def banc_distributeurs(creer_store):
    module = charger("websocket_api")
    hass = Hass()
    dis = Distributeurs()
    module.async_register(hass, creer_store({"users": {}, "migrated": True, "shared": {}}),
                          acces_distributeurs=lambda: dis)
    return types.SimpleNamespace(hass=hass, dis=dis)


def test_l_etat_du_distributeur_se_lit_de_tout_compte_sous_ses_droits(banc_distributeurs):
    b = banc_distributeurs
    ordinaire, admin = Connexion(admin=False), Connexion(uid="u-papa", admin=True)
    lancer(envoyer(b.hass, ordinaire, {"id": 80, "type": "loggia/distributeurs/etat"}))
    lancer(envoyer(b.hass, admin, {"id": 81, "type": "loggia/distributeurs/etat", "detail": True}))
    assert ordinaire.erreurs == [] and admin.erreurs == []
    assert b.dis.lus == [("u-lea", False, False), ("u-papa", True, True)], "le compte ou le detail se perdent"
    assert ordinaire.resultats == [(80, {"source": None, "vu_par": "u-lea"})]
    # Le compte vient de la session : un champ du client est refuse.
    lancer(envoyer(b.hass, ordinaire, {"id": 82, "type": "loggia/distributeurs/etat", "user_id": "u-papa"}))
    assert [e[1] for e in ordinaire.erreurs] == ["invalid_format"]


def test_le_planning_du_distributeur_reste_aux_administrateurs(banc_distributeurs):
    b = banc_distributeurs
    patch = {"repas": [{"id": "r1", "heure": "07:30", "jours": [0], "portions": 1, "actif": True}]}
    ordinaire = Connexion(admin=False)
    lancer(envoyer(b.hass, ordinaire, {"id": 83, "type": "loggia/distributeurs/config", "patch": patch}))
    assert [e[1] for e in ordinaire.erreurs] == ["unauthorized"] and b.dis.ecrits == []
    admin = Connexion(uid="u-papa", admin=True)
    lancer(envoyer(b.hass, admin, {"id": 84, "type": "loggia/distributeurs/config", "patch": patch}))
    assert admin.erreurs == [] and b.dis.ecrits == [patch]
    mid, reponse = admin.resultats[-1]
    # L'etat avec, sous les droits de l'administrateur : l'ecran redessine.
    assert mid == 84 and reponse["config"]["repas"] == patch["repas"] and reponse["etat"]["vu_par"] == "u-papa"


def test_trop_de_repas_se_refuse_par_son_code(banc_distributeurs):
    b = banc_distributeurs
    admin = Connexion(uid="u-papa", admin=True)
    trop = [{"id": "r%d" % i, "heure": "07:00", "jours": [0]} for i in range(13)]
    lancer(envoyer(b.hass, admin, {"id": 85, "type": "loggia/distributeurs/config", "patch": {"repas": trop}}))
    assert [e[1] for e in admin.erreurs] == ["trop_de_repas"], admin.erreurs
    assert _nomme(admin.erreurs[0][2]) == "12"


def test_sans_module_le_distributeur_le_dit(creer_store):
    module = charger("websocket_api")
    hass = Hass()
    module.async_register(hass, creer_store({"users": {}, "migrated": True, "shared": {}}))
    cx = Connexion(uid="u-papa", admin=True)
    lancer(envoyer(hass, cx, {"id": 86, "type": "loggia/distributeurs/etat"}))
    lancer(envoyer(hass, cx, {"id": 87, "type": "loggia/distributeurs/config", "patch": {}}))
    assert [e[1] for e in cx.erreurs] == ["not_available", "not_available"], cx.erreurs


# ── Le chauffage (chantier Chauffage, § 8.2) ────────────────────────────────
#
# `etat`, `main` et `maison` sont ouvertes a tout compte : c'est la vie de tous
# les jours. La reprise en main recoit le compte et ses droits de PILOTAGE de
# la session ; l'Ete reste aux administrateurs, et le refus nomme sa cle.
# `config` ecrit la maison : administrateurs seulement.

class Chauffage:
    """Le moteur, vu des commandes : ce qu'on lui demande, et ses refus."""

    def __init__(self):
        self.appels = []

    async def async_etat(self, user=None):
        self.appels.append(("etat", user.id))
        return {"chauffages": [], "vu_par": user.id}

    async def async_reprendre_la_main(self, cle, *, mode=None, temperature=None, fin="prochain",
                                      par=None, nom="", controle=None):
        if cle == "interdit":
            raise PermissionError("pas le droit de piloter select.radiateur")
        if mode == "confort_2":
            raise charger("refus").RefusNomme("chauffage_mode_inconnu",
                                              "mode confort_2 inconnu de ce chauffage", "mode")
        self.appels.append(("main", cle, mode, temperature, fin, par))

    async def async_rendre_au_planning(self, cle, controle=None):
        self.appels.append(("rendre", cle))

    async def async_maison(self, mode, fin=None, *, admin=False, nom=""):
        if mode == "ete" and not admin:
            raise charger("store").MaisonReserveeError(
                "reglages reserves aux administrateurs Home Assistant : maison.ete")
        self.appels.append(("maison", mode, fin, admin))

    async def async_enregistrer(self, patch):
        if (patch.get("chauffages") or {}).get("id-rad") == "abime":
            raise charger("refus").RefusNomme("chauffage_heure_illisible", "heure illisible", "jeu[2].h")
        self.appels.append(("config", patch))
        return {"chauffages": {}}


@pytest.fixture
def banc_chauffage(creer_store):
    module = charger("websocket_api")
    hass = Hass()
    cha = Chauffage()
    module.async_register(hass, creer_store({"users": {}, "migrated": True, "shared": {}}),
                          acces_chauffage=lambda: cha)
    return types.SimpleNamespace(hass=hass, cha=cha)


def test_l_etat_du_chauffage_se_lit_de_tout_compte(banc_chauffage):
    b = banc_chauffage
    cx = Connexion(admin=False)
    lancer(envoyer(b.hass, cx, {"id": 90, "type": "loggia/chauffage/etat"}))
    assert cx.erreurs == [] and cx.resultats == [(90, {"chauffages": [], "vu_par": "u-lea"})]


def test_reprendre_la_main_est_ouvert_a_tout_compte(banc_chauffage):
    b = banc_chauffage
    cx = Connexion(admin=False)
    lancer(envoyer(b.hass, cx, {"id": 91, "type": "loggia/chauffage/main", "chauffage": "id-rad", "mode": "eco"}))
    lancer(envoyer(b.hass, cx, {"id": 92, "type": "loggia/chauffage/main", "chauffage": "id-poele",
                                "temperature": 21.5, "fin": 120}))
    lancer(envoyer(b.hass, cx, {"id": 93, "type": "loggia/chauffage/main", "chauffage": "id-rad", "reprendre": True}))
    assert cx.erreurs == [], cx.erreurs
    assert b.cha.appels == [("main", "id-rad", "eco", None, "prochain", "u-lea"), ("etat", "u-lea"),
                            ("main", "id-poele", None, 21.5, 120, "u-lea"), ("etat", "u-lea"),
                            ("rendre", "id-rad"), ("etat", "u-lea")]


@pytest.mark.parametrize("message", [
    {"chauffage": "id-rad", "mode": "boost"},
    {"chauffage": "id-rad", "mode": "eco", "fin": 30},
    {"chauffage": "id-rad", "mode": "eco", "fin": "demain"},
    {"chauffage": "id-rad", "mode": "eco", "user_id": "u-papa"},
    {"mode": "eco"},
])
def test_une_reprise_mal_formee_est_refusee(banc_chauffage, message):
    cx = Connexion(admin=False)
    lancer(envoyer(banc_chauffage.hass, cx, {"id": 94, "type": "loggia/chauffage/main", **message}))
    assert [e[1] for e in cx.erreurs] == ["invalid_format"], cx.erreurs
    assert banc_chauffage.cha.appels == []


def test_une_reprise_refusee_se_dit_par_son_code(banc_chauffage):
    cx = Connexion(admin=False)
    lancer(envoyer(banc_chauffage.hass, cx, {"id": 95, "type": "loggia/chauffage/main",
                                             "chauffage": "interdit", "mode": "eco"}))
    lancer(envoyer(banc_chauffage.hass, cx, {"id": 96, "type": "loggia/chauffage/main",
                                             "chauffage": "id-rad", "mode": "confort_2"}))
    assert [e[1] for e in cx.erreurs] == ["unauthorized", "chauffage_mode_inconnu"], cx.erreurs
    assert _nomme(cx.erreurs[1][2]) == "mode"


def test_le_mode_de_la_maison_est_ouvert_sauf_l_ete(banc_chauffage):
    b = banc_chauffage
    cx = Connexion(admin=False)
    for i, mode in enumerate(("absence", "vacances", "planning")):
        lancer(envoyer(b.hass, cx, {"id": 100 + i, "type": "loggia/chauffage/maison", "mode": mode}))
    lancer(envoyer(b.hass, cx, {"id": 103, "type": "loggia/chauffage/maison", "mode": "ete"}))
    assert [e[1] for e in cx.erreurs] == ["not_admin"], cx.erreurs
    assert _nomme(cx.erreurs[0][2]) == "maison.ete"
    admin = Connexion(uid="u-papa", admin=True)
    lancer(envoyer(b.hass, admin, {"id": 104, "type": "loggia/chauffage/maison", "mode": "ete"}))
    assert admin.erreurs == []
    assert [a for a in b.cha.appels if a[0] == "maison"] == [
        ("maison", "absence", None, False), ("maison", "vacances", None, False),
        ("maison", "planning", None, False), ("maison", "ete", None, True)]
    lancer(envoyer(b.hass, cx, {"id": 105, "type": "loggia/chauffage/maison", "mode": "hiver"}))
    assert cx.erreurs[-1][1] == "invalid_format"


def test_les_plannings_restent_aux_administrateurs(banc_chauffage):
    b = banc_chauffage
    patch = {"chauffages": {"id-rad": {"planning": True}}}
    ordinaire = Connexion(admin=False)
    lancer(envoyer(b.hass, ordinaire, {"id": 106, "type": "loggia/chauffage/config", "patch": patch}))
    assert [e[1] for e in ordinaire.erreurs] == ["unauthorized"] and b.cha.appels == []
    admin = Connexion(uid="u-papa", admin=True)
    lancer(envoyer(b.hass, admin, {"id": 107, "type": "loggia/chauffage/config", "patch": patch}))
    assert admin.erreurs == [] and admin.resultats[-1] == (107, {"config": {"chauffages": {}},
                                                               "etat": {"chauffages": [], "vu_par": "u-papa"}})
    lancer(envoyer(b.hass, admin, {"id": 108, "type": "loggia/chauffage/config",
                                   "patch": {"chauffages": {"id-rad": "abime"}}}))
    assert [e[1] for e in admin.erreurs] == ["chauffage_heure_illisible"]
    assert _nomme(admin.erreurs[0][2]) == "jeu[2].h", "le refus nomme la cle"


def test_sans_moteur_le_chauffage_le_dit(creer_store):
    module = charger("websocket_api")
    hass = Hass()
    module.async_register(hass, creer_store({"users": {}, "migrated": True, "shared": {}}))
    cx = Connexion(uid="u-papa", admin=True)
    for i, message in enumerate(({"type": "loggia/chauffage/etat"},
                                 {"type": "loggia/chauffage/main", "chauffage": "x", "mode": "eco"},
                                 {"type": "loggia/chauffage/maison", "mode": "planning"},
                                 {"type": "loggia/chauffage/config", "patch": {}})):
        lancer(envoyer(hass, cx, {"id": 110 + i, **message}))
    assert [e[1] for e in cx.erreurs] == ["not_available"] * 4, cx.erreurs


# ── Les manoeuvres d'un volet (chantier Volets, spec 6.5) ───────────────────

class Volets:
    """Ce que le module des volets rend : on retient ce qu'on lui a demande."""

    def __init__(self):
        self.demandes = []

    async def async_manoeuvres(self, haid, depuis, user=None):
        if haid == "cover.interdit":
            raise PermissionError("pas le droit de lire cover.interdit")
        self.demandes.append((haid, depuis, getattr(user, "id", None)))
        return {"lignes": [{"ts": 1.0, "module": "volets", "cibles": [haid]}], "couvre_depuis": 1.0}


@pytest.fixture
def banc_volets(creer_store):
    module = charger("websocket_api")
    hass = Hass()
    volets = Volets()
    module.async_register(hass, creer_store({"users": {}, "migrated": True, "shared": {}}),
                          acces_volets=lambda: volets)
    return types.SimpleNamespace(hass=hass, volets=volets)


def test_les_manoeuvres_d_un_volet_se_lisent_de_tout_compte(banc_volets):
    cx = Connexion(admin=False)
    lancer(envoyer(banc_volets.hass, cx, {"id": 40, "type": "loggia/volets/manoeuvres",
                                          "entity_id": "cover.salon", "depuis": 1760000000}))
    assert cx.erreurs == []
    assert cx.resultats == [(40, {"lignes": [{"ts": 1.0, "module": "volets", "cibles": ["cover.salon"]}],
                                  "couvre_depuis": 1.0})]
    assert banc_volets.volets.demandes == [("cover.salon", 1760000000.0, "u-lea")], "le compte vient de la session"


def test_les_manoeuvres_d_un_volet_qu_on_ne_lit_pas_sont_refusees(banc_volets):
    """Audit du 19/10 : comme le journal d'une lampe, `unauthorized`."""
    cx = Connexion(admin=False)
    lancer(envoyer(banc_volets.hass, cx, {"id": 46, "type": "loggia/volets/manoeuvres",
                                          "entity_id": "cover.interdit", "depuis": 0}))
    assert [e[1] for e in cx.erreurs] == ["unauthorized"] and cx.resultats == []


def test_les_manoeuvres_veulent_un_volet_et_une_heure_de_depart(banc_volets):
    cx = Connexion(admin=True)
    for mid, message in ((41, {"entity_id": "cover.salon"}), (42, {"depuis": 0}),
                         (43, {"entity_id": "cover.salon", "depuis": -5}),
                         (44, {"entity_id": "cover.salon", "depuis": "hier"})):
        lancer(envoyer(banc_volets.hass, cx, {"id": mid, "type": "loggia/volets/manoeuvres", **message}))
    assert [e[1] for e in cx.erreurs] == ["invalid_format"] * 4
    assert banc_volets.volets.demandes == []


def test_sans_module_des_volets_les_manoeuvres_le_disent(creer_store):
    module = charger("websocket_api")
    hass = Hass()
    module.async_register(hass, creer_store({"users": {}, "migrated": True, "shared": {}}))
    cx = Connexion()
    lancer(envoyer(hass, cx, {"id": 45, "type": "loggia/volets/manoeuvres", "entity_id": "cover.a", "depuis": 0}))
    assert [e[1] for e in cx.erreurs] == ["not_available"]


# ── Les prises (chantier Prises, spec 6.1) ───────────────────────────────────

class Prises:
    """Ce que le module des prises rend : on retient les patchs recus."""

    def __init__(self):
        self.patchs = []

    async def async_etat(self):
        return {"prises": {}, "notifier": False}

    async def async_enregistrer(self, patch):
        if not isinstance(patch.get("protegees", []), list):
            raise ValueError("prises : protegees est une liste d'interrupteurs")
        self.patchs.append(patch)
        return {"protegees": patch.get("protegees", []), "types": {}, "prevenir": {}}


@pytest.fixture
def banc_prises(creer_store):
    module = charger("websocket_api")
    hass = Hass()
    prises = Prises()
    module.async_register(hass, creer_store({"users": {}, "migrated": True, "shared": {}}),
                          acces_prises=lambda: prises)
    return types.SimpleNamespace(hass=hass, prises=prises)


def test_l_etat_des_prises_se_lit_de_tout_compte(banc_prises):
    cx = Connexion(admin=False)
    lancer(envoyer(banc_prises.hass, cx, {"id": 50, "type": "loggia/prises/etat"}))
    assert cx.erreurs == []
    assert cx.resultats == [(50, {"prises": {}, "notifier": False})]


def test_regler_les_prises_reste_aux_administrateurs(banc_prises):
    """P4 : un compte ordinaire voit le cadenas, il ne retire pas la protection."""
    patch = {"protegees": ["switch.prise_nas"]}
    cx = Connexion(admin=False)
    lancer(envoyer(banc_prises.hass, cx, {"id": 51, "type": "loggia/prises/config", "patch": patch}))
    assert [e[1] for e in cx.erreurs] == ["unauthorized"]
    assert banc_prises.prises.patchs == []
    admin = Connexion(admin=True)
    lancer(envoyer(banc_prises.hass, admin, {"id": 52, "type": "loggia/prises/config", "patch": patch}))
    assert admin.erreurs == []
    assert admin.resultats == [(52, {"config": {"protegees": ["switch.prise_nas"], "types": {}, "prevenir": {}},
                                     "etat": {"prises": {}, "notifier": False}})]


def test_un_reglage_des_prises_illisible_se_dit(banc_prises):
    cx = Connexion(admin=True)
    lancer(envoyer(banc_prises.hass, cx, {"id": 53, "type": "loggia/prises/config",
                                          "patch": {"protegees": "switch.prise_nas"}}))
    assert [e[1] for e in cx.erreurs] == ["invalid_format"]
    lancer(envoyer(banc_prises.hass, cx, {"id": 54, "type": "loggia/prises/config", "patch": "tout"}))
    assert [e[1] for e in cx.erreurs] == ["invalid_format", "invalid_format"]
    assert banc_prises.prises.patchs == []


def test_sans_module_des_prises_les_commandes_le_disent(creer_store):
    module = charger("websocket_api")
    hass = Hass()
    module.async_register(hass, creer_store({"users": {}, "migrated": True, "shared": {}}))
    cx = Connexion(admin=True)
    lancer(envoyer(hass, cx, {"id": 55, "type": "loggia/prises/etat"}))
    lancer(envoyer(hass, cx, {"id": 56, "type": "loggia/prises/config", "patch": {}}))
    assert [e[1] for e in cx.erreurs] == ["not_available", "not_available"]


# ── Le carnet des lumieres (chantier Lumieres, spec 6.2) ────────────────────

class Lumieres:
    """Ce que le carnet rend : on retient qui le lit, et quoi."""

    def __init__(self):
        self.lus = []

    async def async_etat(self, user=None):
        self.lus.append(("etat", user.id))
        return {"maintenant": 1.0, "lumieres": {"light.bureau": {"dernier": None}}}

    async def async_journal(self, haid, user=None):
        if haid == "light.interdite":
            raise PermissionError("pas le droit de lire light.interdite")
        self.lus.append(("journal", haid, user.id))
        return {"evenements": []}


@pytest.fixture
def banc_lumieres(creer_store):
    module = charger("websocket_api")
    hass = Hass()
    lumieres = Lumieres()
    module.async_register(hass, creer_store({"users": {}, "migrated": True, "shared": {}}),
                          acces_lumieres=lambda: lumieres)
    return types.SimpleNamespace(hass=hass, lumieres=lumieres)


def test_le_carnet_des_lumieres_se_lit_de_tout_compte_sous_ses_droits(banc_lumieres):
    b = banc_lumieres
    cx = Connexion(admin=False)
    lancer(envoyer(b.hass, cx, {"id": 120, "type": "loggia/lumieres/etat"}))
    lancer(envoyer(b.hass, cx, {"id": 121, "type": "loggia/lumieres/journal", "entity_id": "light.bureau"}))
    assert cx.erreurs == []
    assert cx.resultats == [(120, {"maintenant": 1.0, "lumieres": {"light.bureau": {"dernier": None}}}),
                            (121, {"evenements": []})]
    assert b.lumieres.lus == [("etat", "u-lea"), ("journal", "light.bureau", "u-lea")], "le compte vient de la session"


def test_le_journal_d_une_lampe_qu_on_ne_lit_pas_est_refuse(banc_lumieres):
    cx = Connexion(admin=False)
    lancer(envoyer(banc_lumieres.hass, cx, {"id": 122, "type": "loggia/lumieres/journal",
                                            "entity_id": "light.interdite"}))
    assert [e[1] for e in cx.erreurs] == ["unauthorized"]


@pytest.mark.parametrize("message", [{}, {"entity_id": 5}, {"entity_id": "light.bureau", "user_id": "u-papa"}],
                         ids=["sans_lampe", "pas_un_texte", "un_compte_du_client"])
def test_le_journal_veut_une_lampe_et_rien_d_autre(banc_lumieres, message):
    cx = Connexion(admin=False)
    lancer(envoyer(banc_lumieres.hass, cx, {"id": 123, "type": "loggia/lumieres/journal", **message}))
    assert [e[1] for e in cx.erreurs] == ["invalid_format"]
    assert banc_lumieres.lumieres.lus == []


# ── Le carnet de l'eau (chantier IoT, etape 3 ; I28, I29) ──────────────────
# TESTS AJOUTES (etape 3 IoT, 25/10). L'etat se lit de tout compte, sous ses
# droits de lecture ; « Fermer en cas de fuite » s'ecrit par une commande
# ETROITE, aux administrateurs, qui ne prend qu'un booleen.
class Eau:
    def __init__(self):
        self.lus, self.ecrits = [], []

    async def async_etat(self, user=None):
        self.lus.append(getattr(user, "id", None))
        return {"vannes": {}, "regle": {"actif": True}}

    async def async_regler(self, actif, *, user=None):
        self.ecrits.append((actif, getattr(user, "id", None)))
        return {"vannes": {}, "regle": {"actif": actif}}


@pytest.fixture
def banc_eau(creer_store):
    module = charger("websocket_api")
    hass = Hass()
    e = Eau()
    module.async_register(hass, creer_store({"users": {}, "migrated": True, "shared": {}}), acces_eau=lambda: e)
    return types.SimpleNamespace(hass=hass, eau=e)


def test_le_carnet_de_l_eau_se_lit_de_tout_compte(banc_eau):
    cx = Connexion(admin=False)
    lancer(envoyer(banc_eau.hass, cx, {"id": 140, "type": "loggia/eau/etat"}))
    assert cx.erreurs == [] and cx.resultats == [(140, {"vannes": {}, "regle": {"actif": True}})]
    assert banc_eau.eau.lus == ["u-lea"], "le compte vient de la session"


def test_fermer_en_cas_de_fuite_reste_aux_administrateurs(banc_eau):
    ordinaire, admin = Connexion(admin=False), Connexion(uid="u-papa", admin=True)
    lancer(envoyer(banc_eau.hass, ordinaire, {"id": 141, "type": "loggia/eau/regle", "actif": False}))
    assert [e[1] for e in ordinaire.erreurs] == ["unauthorized"] and banc_eau.eau.ecrits == []
    lancer(envoyer(banc_eau.hass, admin, {"id": 142, "type": "loggia/eau/regle", "actif": False}))
    assert admin.resultats == [(142, {"vannes": {}, "regle": {"actif": False}})]
    assert banc_eau.eau.ecrits == [(False, "u-papa")]


@pytest.mark.parametrize("message", [{}, {"actif": "non"}, {"actif": True, "entite": "valve.cave"}, {"actif": True, "user_id": "u-papa"}],
                         ids=["sans_valeur", "pas_un_booleen", "une_autre_cle", "un_compte_du_client"])
def test_fermer_en_cas_de_fuite_ne_prend_que_sa_valeur(banc_eau, message):
    cx = Connexion(admin=True)
    lancer(envoyer(banc_eau.hass, cx, {"id": 143, "type": "loggia/eau/regle", **message}))
    assert [e[1] for e in cx.erreurs] == ["invalid_format"] and banc_eau.eau.ecrits == []


def test_sans_carnet_l_eau_le_dit(creer_store):
    module = charger("websocket_api")
    hass = Hass()
    module.async_register(hass, creer_store({"users": {}, "migrated": True, "shared": {}}))
    cx = Connexion(admin=True)
    lancer(envoyer(hass, cx, {"id": 144, "type": "loggia/eau/etat"}))
    lancer(envoyer(hass, cx, {"id": 145, "type": "loggia/eau/regle", "actif": True}))
    assert [e[1] for e in cx.erreurs] == ["not_available", "not_available"]


def test_sans_carnet_les_lumieres_le_disent(creer_store):
    module = charger("websocket_api")
    hass = Hass()
    module.async_register(hass, creer_store({"users": {}, "migrated": True, "shared": {}}))
    cx = Connexion(admin=True)
    lancer(envoyer(hass, cx, {"id": 124, "type": "loggia/lumieres/etat"}))
    lancer(envoyer(hass, cx, {"id": 125, "type": "loggia/lumieres/journal", "entity_id": "light.bureau"}))
    assert [e[1] for e in cx.erreurs] == ["not_available", "not_available"]


# ── Le mode enfant (chantier Mode enfant, spec 7.4) ─────────────────────────
#
# Trois regimes. L'etat se lit de tout compte, sous ses droits de LECTURE. La
# demande de l'enfant et le son pour dormir sont les gestes de la chambre,
# bornes a ce que le compte PILOTE. Les reglages, la levee des limites et la
# reponse a une demande sont les gestes du PARENT (E2 B) : le code de la maison
# les ouvre cinq minutes - le meme laissez-passer que le passage vers un profil
# Admin -, un administrateur s'en passe. Ici le vrai code administrateur (celui
# par defaut, jamais defini) et une doublure du module qui retient qui demande
# quoi, pour quel compte.

ETAT_ENFANT = {"maintenant": 1.0, "demarre": True, "simulation": False, "profils": {}, "lecteurs": {}}


class Enfant:
    def __init__(self):
        self.appels = []

    async def async_etat(self, user=None):
        self.appels.append(("etat", user.id))
        return dict(ETAT_ENFANT)

    async def async_enregistrer(self, patch):
        if "casse" in patch:
            raise ValueError("mode enfant : casse")
        self.appels.append(("config", patch))
        return {"profils": {}, "simulation": {"actif": False}}

    async def async_lever(self, ident, minutes, user=None):
        if ident == "inconnu":
            raise ValueError("mode enfant : profil inconnu : 'inconnu'")
        self.appels.append(("lever", ident, minutes, user.id))
        return dict(ETAT_ENFANT)

    async def async_repondre(self, ident, accorder, user=None):
        self.appels.append(("repondre", ident, accorder, user.id))
        return dict(ETAT_ENFANT)

    async def async_demander(self, ident, controle=None, user=None):
        if ident == "interdit":
            raise PermissionError("pas le droit de piloter media_player.tv_interdite")
        if ident == "au_coucher":
            raise ValueError("mode enfant : aucun écran n'est bloqué par le temps")
        self.appels.append(("demander", ident, controle is not None, user.id))
        return dict(ETAT_ENFANT)

    async def async_dormir(self, ident, son, controle=None, user=None):
        if son == 7:
            raise ValueError("mode enfant : son inconnu : 7")
        self.appels.append(("dormir", ident, son, controle is not None, user.id))
        return dict(ETAT_ENFANT)


@pytest.fixture
def banc_enfant(creer_store):
    module = charger("websocket_api")
    hass = Hass()
    enfant = Enfant()
    module.async_register(hass, creer_store({"users": {}, "migrated": True, "shared": {}}),
                          acces_enfant=lambda: enfant)
    return types.SimpleNamespace(hass=hass, enfant=enfant)


def test_l_etat_du_mode_enfant_se_lit_de_tout_compte_sous_ses_droits(banc_enfant):
    cx = Connexion(admin=False)
    lancer(envoyer(banc_enfant.hass, cx, {"id": 130, "type": "loggia/enfant/etat"}))
    assert cx.erreurs == []
    assert cx.resultats == [(130, ETAT_ENFANT)]
    assert banc_enfant.enfant.appels == [("etat", "u-lea")], "le compte vient de la session"


def test_les_gestes_du_parent_veulent_le_code_ou_un_administrateur(banc_enfant):
    b = banc_enfant
    patch = {"profils": {"chambre_lino": {"nom": "Lino", "zone": "chambre_lino"}}}
    cx = Connexion(admin=False)
    lancer(envoyer(b.hass, cx, {"id": 131, "type": "loggia/enfant/config", "patch": patch}))
    lancer(envoyer(b.hass, cx, {"id": 132, "type": "loggia/enfant/lever", "profil": "chambre_lino", "minutes": 30}))
    lancer(envoyer(b.hass, cx, {"id": 133, "type": "loggia/enfant/repondre", "profil": "chambre_lino", "accorder": True}))
    assert [e[1] for e in cx.erreurs] == ["code_admin_requis"] * 3, cx.erreurs
    assert b.enfant.appels == [], "un refus ne touche pas au module"
    admin = Connexion(uid="u-papa", admin=True)
    lancer(envoyer(b.hass, admin, {"id": 134, "type": "loggia/enfant/config", "patch": patch}))
    lancer(envoyer(b.hass, admin, {"id": 135, "type": "loggia/enfant/lever", "profil": "chambre_lino", "minutes": 0}))
    lancer(envoyer(b.hass, admin, {"id": 136, "type": "loggia/enfant/repondre", "profil": "chambre_lino", "accorder": False}))
    assert admin.erreurs == []
    assert [r[0] for r in admin.resultats] == [134, 135, 136]
    # Le reglage rend la configuration ET l'etat : l'ecran redessine sans attendre son sondage.
    assert admin.resultats[0][1] == {"config": {"profils": {}, "simulation": {"actif": False}}, "etat": ETAT_ENFANT}
    assert b.enfant.appels == [("config", patch), ("etat", "u-papa"),
                               ("lever", "chambre_lino", 0, "u-papa"), ("repondre", "chambre_lino", False, "u-papa")]


def test_le_code_de_la_maison_ouvre_les_gestes_du_parent_a_ce_compte(banc_enfant):
    """E2 B : la tablette de famille porte un compte ordinaire ; le parent tape
    le code de la maison (jamais defini : celui par defaut) et la commande
    passe - pour CE compte. Un autre compte, ou un code faux, reste dehors."""
    b = banc_enfant
    cx = Connexion(uid="u-tablette", admin=False)
    lancer(envoyer(b.hass, cx, {"id": 140, "type": "loggia/pin/verifier", "pin": "0000"}))
    assert cx.resultats == [(140, {"ok": True})]
    lancer(envoyer(b.hass, cx, {"id": 141, "type": "loggia/enfant/lever", "profil": "chambre_lino", "minutes": 30}))
    assert cx.erreurs == [], cx.erreurs
    assert b.enfant.appels == [("lever", "chambre_lino", 30, "u-tablette")]
    autre = Connexion(uid="u-max", admin=False)
    lancer(envoyer(b.hass, autre, {"id": 142, "type": "loggia/pin/verifier", "pin": "1234"}))
    assert autre.resultats == [(142, {"ok": False, "bloque": 0})]
    lancer(envoyer(b.hass, autre, {"id": 143, "type": "loggia/enfant/lever", "profil": "chambre_lino", "minutes": 30}))
    assert [e[1] for e in autre.erreurs] == ["code_admin_requis"]
    assert len(b.enfant.appels) == 1


# TEST AJOUTE (passe bis, 17/10, point 7) : le laissez-passer du code ouvre les PROFILS du mode enfant, pas « Observer sans
# agir » — `patch: {simulation: {actif: true}}` passait avec le seul code de la maison —, et rien d'autre que ces deux cles.
def test_le_laissez_passer_n_ouvre_pas_observer_sans_agir_ni_une_autre_cle(banc_enfant):
    b = banc_enfant
    cx = Connexion(uid="u-tablette", admin=False)
    lancer(envoyer(b.hass, cx, {"id": 180, "type": "loggia/pin/verifier", "pin": "0000"}))
    assert cx.resultats == [(180, {"ok": True})]
    lancer(envoyer(b.hass, cx, {"id": 181, "type": "loggia/enfant/config", "patch": {"simulation": {"actif": True}}}))
    lancer(envoyer(b.hass, cx, {"id": 182, "type": "loggia/enfant/config", "patch": {"profils": {}, "simulation": {"actif": True}}}))
    lancer(envoyer(b.hass, cx, {"id": 183, "type": "loggia/enfant/config", "patch": {"zorglub": 1}}))
    assert [e[1] for e in cx.erreurs] == ["unauthorized", "unauthorized", "invalid_format"], cx.erreurs
    assert "zorglub" in cx.erreurs[2][2]
    assert b.enfant.appels == [], "rien n'atteint le module"
    # Les profils, eux, passent avec le code ; un administrateur ecrit aussi `simulation`.
    patch = {"profils": {"chambre_lino": {"nom": "Lino", "zone": "chambre_lino"}}}
    lancer(envoyer(b.hass, cx, {"id": 184, "type": "loggia/enfant/config", "patch": patch}))
    admin = Connexion(uid="u-papa", admin=True)
    lancer(envoyer(b.hass, admin, {"id": 185, "type": "loggia/enfant/config", "patch": {"simulation": {"actif": True}}}))
    lancer(envoyer(b.hass, admin, {"id": 186, "type": "loggia/enfant/config", "patch": {"zorglub": 1}}))
    assert len(cx.erreurs) == 3 and [e[1] for e in admin.erreurs] == ["invalid_format"], "une cle inconnue se refuse meme a un administrateur"
    assert [a for a in b.enfant.appels if a[0] == "config"] == [("config", patch), ("config", {"simulation": {"actif": True}})]


def test_un_reglage_du_mode_enfant_refuse_se_dit(banc_enfant):
    admin = Connexion(uid="u-papa", admin=True)
    lancer(envoyer(banc_enfant.hass, admin, {"id": 144, "type": "loggia/enfant/config", "patch": {"casse": 1}}))
    lancer(envoyer(banc_enfant.hass, admin, {"id": 145, "type": "loggia/enfant/lever", "profil": "inconnu", "minutes": 30}))
    assert [e[1] for e in admin.erreurs] == ["invalid_format", "invalid_format"]
    assert "casse" in admin.erreurs[0][2] and "inconnu" in admin.erreurs[1][2]
    assert banc_enfant.enfant.appels == []


def test_la_demande_et_le_son_passent_par_les_droits_du_compte(banc_enfant):
    b = banc_enfant
    # Un compte sous une politique d'entites : `controle_de` rend le test de
    # PILOTAGE de ce compte, et c'est lui que le module recoit. (Sans politique
    # - presque toutes les installations -, il rend None : tout lui est permis.)
    cx = Connexion(admin=False)
    cx.user.permissions = types.SimpleNamespace(check_entity=lambda haid, categorie: categorie == "control")
    lancer(envoyer(b.hass, cx, {"id": 150, "type": "loggia/enfant/demander", "profil": "chambre_lino"}))
    lancer(envoyer(b.hass, cx, {"id": 151, "type": "loggia/enfant/dormir", "profil": "chambre_lino", "son": 1}))
    assert cx.erreurs == [], cx.erreurs
    assert cx.resultats == [(150, ETAT_ENFANT), (151, ETAT_ENFANT)]
    assert b.enfant.appels == [("demander", "chambre_lino", True, "u-lea"), ("dormir", "chambre_lino", 1, True, "u-lea")], \
        "le controle des droits de pilotage et le compte viennent de la session"
    # Un ecran que le compte ne pilote pas : refuse en `unauthorized`. Aucun
    # ecran bloque par le temps, un son inconnu : le refus du module, nomme.
    lancer(envoyer(b.hass, cx, {"id": 152, "type": "loggia/enfant/demander", "profil": "interdit"}))
    lancer(envoyer(b.hass, cx, {"id": 153, "type": "loggia/enfant/demander", "profil": "au_coucher"}))
    lancer(envoyer(b.hass, cx, {"id": 154, "type": "loggia/enfant/dormir", "profil": "chambre_lino", "son": 7}))
    assert [e[1] for e in cx.erreurs] == ["unauthorized", "invalid_format", "invalid_format"]
    assert "temps" in cx.erreurs[1][2] and "son" in cx.erreurs[2][2]


@pytest.mark.parametrize("message", [
    {"type": "loggia/enfant/lever", "minutes": 30},
    {"type": "loggia/enfant/lever", "profil": "chambre_lino", "minutes": 15},
    {"type": "loggia/enfant/repondre", "profil": "chambre_lino", "accorder": "oui"},
    {"type": "loggia/enfant/demander", "profil": ""},
    {"type": "loggia/enfant/dormir", "profil": "chambre_lino", "son": "1"},
    {"type": "loggia/enfant/dormir", "profil": "chambre_lino", "son": -1},
    {"type": "loggia/enfant/etat", "user_id": "u-papa"},
], ids=["sans_profil", "quinze_minutes", "accorder_en_texte", "profil_vide", "son_en_texte", "son_negatif", "un_compte_du_client"])
def test_le_mode_enfant_refuse_ce_que_l_ecran_n_envoie_pas(banc_enfant, message):
    admin = Connexion(uid="u-papa", admin=True)
    lancer(envoyer(banc_enfant.hass, admin, {"id": 160, **message}))
    assert [e[1] for e in admin.erreurs] == ["invalid_format"], admin.erreurs
    assert banc_enfant.enfant.appels == []


def test_sans_module_du_mode_enfant_les_commandes_le_disent(creer_store):
    module = charger("websocket_api")
    hass = Hass()
    module.async_register(hass, creer_store({"users": {}, "migrated": True, "shared": {}}))
    admin = Connexion(uid="u-papa", admin=True)
    lancer(envoyer(hass, admin, {"id": 170, "type": "loggia/enfant/etat"}))
    lancer(envoyer(hass, admin, {"id": 171, "type": "loggia/enfant/config", "patch": {}}))
    lancer(envoyer(hass, admin, {"id": 172, "type": "loggia/enfant/lever", "profil": "chambre_lino", "minutes": 30}))
    lancer(envoyer(hass, admin, {"id": 173, "type": "loggia/enfant/repondre", "profil": "chambre_lino", "accorder": True}))
    lancer(envoyer(hass, admin, {"id": 174, "type": "loggia/enfant/demander", "profil": "chambre_lino"}))
    lancer(envoyer(hass, admin, {"id": 175, "type": "loggia/enfant/dormir", "profil": "chambre_lino", "son": 0}))
    assert [e[1] for e in admin.erreurs] == ["not_available"] * 6


# ── L'etat de la nuit se lit sous les droits du compte (audit du 19/10) ──────

class Nuit:
    def __init__(self):
        self.lus = []

    async def async_etat(self, user=None):
        self.lus.append(getattr(user, "id", None))
        return {"config": {}, "en_cours": [], "eclairees": {}, "journal": []}


def test_l_etat_de_la_nuit_porte_le_compte_de_la_session(creer_store):
    module = charger("websocket_api")
    hass = Hass()
    nuit = Nuit()
    module.async_register(hass, creer_store({"users": {}, "migrated": True, "shared": {}}), acces_nuit=lambda: nuit)
    cx = Connexion(admin=False)
    lancer(envoyer(hass, cx, {"id": 47, "type": "loggia/nuit/etat"}))
    assert cx.erreurs == [] and nuit.lus == ["u-lea"], "le compte vient de la session, jamais du message"
