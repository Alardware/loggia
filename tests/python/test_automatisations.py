"""Les automatisations qui COMMANDENT le distributeur (05/10, ADR 0155).

Decision de l'utilisateur : une automatisation se reconnait a ce qu'elle FAIT
— une action qui commande l'appareil, scripts suivis, l'heure lue dans le
declencheur —, jamais a son nom. Les points qui comptent ici :
  * l'alerte qui LIT le bac, le decompte du reservoir, la « portion d'hiver »
    et le mode ne sont PAS des repas : un faux repas retiendrait le planning
    de Loggia, donc un repas saute ;
  * une heure qu'on ne peut pas deduire ne s'invente pas ;
  * la sortie est un RESUME : jamais raw_config, message ni data — HA reserve
    `automation/config` aux administrateurs.

Le bloc `automatisations` de tests/fixtures/distributeurs.json (T0) porte les
cas et leurs attendus : la meme table sert aux tests de l'ecran.
"""
from __future__ import annotations

import datetime as dt
import json
import sys
import types
from pathlib import Path

import pytest

from conftest import charger
from doublures_ha import (
    FausseAutomatisation,
    FauxScriptEntite,
    automatisations_depuis_fixture,
    poser_automatisations,
)

RACINE = Path(__file__).resolve().parents[2]
FIXTURE = json.loads((RACINE / "tests" / "fixtures" / "distributeurs.json").read_text(encoding="utf-8"))
BLOC = FIXTURE["automatisations"]
CTX = BLOC["contexte"]
CAS = {c["id"]: c for c in BLOC["cas"]}
CLES_ELEMENT = {"entity_id", "nom", "etat", "dernier", "declencheurs", "heures", "jours",
                "conditionnel", "portions", "pilotable", "modifiable", "indice"}


@pytest.fixture
def module():
    return charger("automatisations")


class FauxEtat:
    def __init__(self, state, attributes=None):
        self.state = state
        self.attributes = attributes or {}


class FauxEtats:
    def __init__(self, table):
        self.table = {k: FauxEtat(*v) for k, v in table.items()}

    def get(self, haid):
        return self.table.get(haid)


class FauxHass:
    def __init__(self, etats):
        self.states = FauxEtats(etats)
        self.data = {}
        self.config = types.SimpleNamespace(time_zone=CTX["fuseau"])


class Compte:
    """Un compte HA : `is_admin`, et une politique d'entites facultative."""

    def __init__(self, admin=False, lire=None, piloter=None):
        self.is_admin = admin
        if lire is not None or piloter is not None:
            def check_entity(eid, sorte):
                regle = lire if sorte == "read" else piloter
                return True if regle is None else regle(eid)
            self.permissions = types.SimpleNamespace(check_entity=check_entity)


def maison(etats_en_plus=None, autos=None, scripts=None):
    a, s, etats = automatisations_depuis_fixture(BLOC)
    etats.update(etats_en_plus or {})
    hass = FauxHass(etats)
    poser_automatisations(hass, a if autos is None else autos, s if scripts is None else scripts)
    return hass


def resumer(module, hass, user=None, **k):
    """Le distributeur de reference : celui du cas aqara_z2m_manuel, plus le
    script designe."""
    designes = [c for c in CTX["cibles_repas"] if c.startswith("script.")]
    params = {"commande": CTX["commande"], "registre": CTX["registre_ids"]}
    params.update(k)
    indices = params.pop("indices", CTX["indices"])
    return module.resumer(hass, CTX["cibles"], CTX["appareils"], designes, indices, user, **params)


# ── Fonctions pures ─────────────────────────────────────────────────────────

@pytest.mark.parametrize("cas", BLOC["cas"], ids=lambda c: c["id"])
def test_declencheurs_de_la_fixture(module, cas):
    assert module.declencheurs(cas["raw_config"]) == cas["declencheurs_bruts"]


@pytest.mark.parametrize("cas", BLOC["cas"], ids=lambda c: c["id"])
def test_scripts_appeles_directement(module, cas):
    # script.turn_on vise par sa CIBLE (HA la releve) : ce n'est pas un appel direct.
    assert module.scripts_appeles(cas["raw_config"]) == cas.get("scripts_appeles", [])


@pytest.mark.parametrize("cas", [c for c in BLOC["cas"] if "jours" in c["attendu"]], ids=lambda c: c["id"])
def test_jours_et_conditionnel_de_la_fixture(module, cas):
    assert module.jours(cas["raw_config"]) == (cas["attendu"]["jours"], cas["attendu"]["conditionnel"])


def test_formes_singulier_pluriel_et_cles_anciennes(module):
    ancien = {"trigger": {"platform": "time", "at": "8:05"},
              "action": [{"service": "button.press", "entity_id": "button.feed"}]}
    neuf = {"triggers": [{"trigger": "time", "at": "08:05:00"}],
            "actions": [{"action": "button.press", "target": {"entity_id": ["button.feed"]}}]}
    for raw in (ancien, neuf):
        assert module.declencheurs(raw) == [{"type": "heure", "heure": "08:05"}]
        (a,) = module.actions(raw)
        assert a["appel"] == "button.press" and a["entites"] == ["button.feed"]


def test_heures_decalages_et_declencheurs_ignores(module):
    raw = {"triggers": [
        {"trigger": "time", "at": ["07:00", "input_datetime.soir", {"entity_id": "sensor.reveil", "offset": 600}]},
        {"trigger": "time", "at": "03:00", "enabled": False},
        {"trigger": "sun", "event": "sunset", "offset": {"hours": -1, "minutes": -30}},
        {"trigger": "sun", "event": "sunrise", "offset": "{{ 5 }}"},
        {"trigger": "state", "entity_id": "binary_sensor.porte"},
        {"trigger": "state", "entity_id": "binary_sensor.fenetre"},
    ]}
    assert module.declencheurs(raw) == [
        {"type": "heure", "heure": "07:00"},
        {"type": "entite_heure", "entite": "input_datetime.soir", "decalage": 0},
        {"type": "entite_heure", "entite": "sensor.reveil", "decalage": 10},
        {"type": "soleil", "evenement": "sunset", "decalage": -90},
        {"type": "autre"},  # un decalage en gabarit : pas d'heure inventee ; doublons fondus
    ]
    assert module.decalage("-00:15:59") == -15  # les secondes tombent, vers zero
    assert module.decalage(None) == 0
    assert module.decalage("demain") is None


def test_motifs_horaires(module):
    def un(**t):
        (d,) = module.declencheurs({"trigger": [{"platform": "time_pattern", **t}]})
        return d
    assert un(hours="/8") == {"type": "periodique", "toutes": 8, "heures": ["00:00", "08:00", "16:00"]}
    assert un(hours="/12", minutes=30) == {"type": "periodique", "toutes": 12, "heures": ["00:30", "12:30"]}
    assert un(minutes=15)["toutes"] == 1 and len(un(minutes=15)["heures"]) == 24
    # Une heure entiere : HA met les minutes absentes a 0, c'est une heure fixe.
    assert un(hours=7) == {"type": "heure", "heure": "07:00"}
    assert un(minutes="/5") == {"type": "autre"}
    assert un(hours="*") == {"type": "autre"}
    assert un(seconds="/30") == {"type": "autre"}


def test_jours_par_declencheur_et_par_condition(module):
    j = module.jours
    assert j({"trigger": {"platform": "time", "at": "07:00", "weekday": "sun"}}) == ([6], False)
    # Un declencheur sans weekday part tous les jours : l'union n'est pas restreinte.
    assert j({"triggers": [{"trigger": "time", "at": "07:00", "weekday": "sat"},
                           {"trigger": "time", "at": "08:00"}]}) == (None, False)
    # Declencheur ET condition : l'intersection.
    assert j({"triggers": [{"trigger": "time", "at": "07:00", "weekday": ["mon", "sat"]}],
              "conditions": [{"condition": "time", "weekday": ["sat", "sun"]}]}) == ([5], False)
    # Une condition d'heure n'est pas « conditionnel » ; le reste l'est.
    assert j({"condition": [{"condition": "time", "after": "06:00"}]}) == (None, False)
    for c in ({"condition": "or", "conditions": []}, {"condition": "not", "conditions": []},
              {"condition": "state", "entity_id": "binary_sensor.travail", "state": "on"},
              {"condition": "numeric_state", "entity_id": "sensor.t", "above": 2},
              "{{ is_state('input_boolean.chat', 'on') }}", {"or": [{"condition": "template"}]},
              {"condition": "and", "conditions": [{"condition": "state"}]}):
        assert j({"conditions": [c]})[1] is True, c
    # Une condition desactivee ne compte pas ; la semaine entiere vaut « tous les jours ».
    assert j({"conditions": [{"condition": "state", "enabled": False},
                             {"condition": "time", "weekday": list(module.JOURS)}]}) == (None, False)


def test_actions_descend_partout(module):
    raw = CAS["indisponible_repli_raw_config"]["raw_config"]
    appels = [a["appel"] for a in module.actions(raw)]
    assert appels == ["notify.notify", "select.select_option"]  # choose, default, if/then, parallel
    raw = {"actions": [{"sequence": [{"action": "light.turn_on", "target": {"entity_id": "light.a, light.b"}}]},
                       {"if": [], "then": [], "else": [{"action": "button.press", "entity_id": "button.x"}]},
                       {"action": "button.press", "target": {"entity_id": "{{ x }}"}},
                       {"action": "button.press", "entity_id": "button.y", "enabled": False},
                       {"delay": "00:00:05"}]}
    a = module.actions(raw)
    assert [x["entites"] for x in a] == [["light.a", "light.b"], ["button.x"], []]


def test_vise_entite_appel_direct_et_device_action(module):
    cibles, apps, reg = CTX["cibles_repas"], CTX["appareils"], CTX["registre_ids"]

    def v(cas):
        return any(module.vise(a, cibles, apps, reg) for a in module.actions(CAS[cas]["raw_config"]))
    assert v("matin_et_soir_pluriel") and v("midi_singulier_semaine") and v("periodique_sans_identifiant")
    assert v("script_appele_directement")
    assert v("device_action_qui_distribue")  # resolue par le registre : la commande
    assert not v("device_action_sur_la_portion")  # resolue : la portion est un reglage
    assert not v("device_action_sur_le_mode")  # non resolue, select sans START
    assert not v("lumiere_de_l_appareil_par_device_action")  # domaine light
    assert not v("reglage_de_la_portion_seulement") and not v("mode_programme_le_soir")
    # Non resolue, sur l'appareil, un select START : c'est un repas.
    sans_reg = {"appel": None, "entites": [], "appareils": ["dev_aqara_z2m"], "donnees": {},
                "repetition": None, "appareil": {"device_id": "dev_aqara_z2m", "domaine": "select",
                                                 "type": "select_option", "entite": "inconnu", "option": "start"}}
    assert module.vise(sans_reg, cibles, apps, reg)
    assert not module.vise(sans_reg, cibles, ["autre_appareil"], reg)
    # L'appareil entier vise par un service : seulement un appui.
    tout = {"appel": "select.select_option", "entites": [], "appareils": ["dev_aqara_z2m"],
            "donnees": {"option": "schedule"}, "repetition": None, "appareil": None}
    assert not module.vise(tout, cibles, apps)
    assert module.vise({**tout, "donnees": {"option": "START"}}, cibles, apps)


def test_portions_nombre_repetition_et_gabarit(module):
    def p(**k):
        base = {"appel": "number.set_value", "entites": ["number.feed"], "appareils": [], "donnees": {},
                "repetition": None, "appareil": None}
        base.update(k)
        return module.portions(base)
    for cle in module.CLES_PORTIONS:
        assert p(donnees={cle: 3}) == 3, cle
    assert p(donnees={"value": "2"}) == 2
    assert p(donnees={"value": "{{ states('input_number.x') }}"}) is None
    assert p(donnees={"value": 2, "portions": 3}) is None  # deux valeurs : ambigu
    assert p(appel="script.turn_on", donnees={"variables": {"portions": 4}}) == 4
    press = {"appel": "button.press", "donnees": {}}
    assert p(**press, repetition=3) == 3
    assert p(**press) is None  # un appui seul ne dit pas combien
    assert p(**press, repetition=module._GABARIT) is None
    # Un repeat autour d'autre chose qu'un appui ne compte pas.
    assert p(appel="light.toggle", repetition=3) is None


# ── resumer : avec Home Assistant ───────────────────────────────────────────

def test_resumer_la_fixture_entiere(module):
    sortie = {e["entity_id"]: e for e in resumer(module, maison(), Compte(admin=True))}
    for cas in BLOC["cas"]:
        att = cas["attendu"]
        if not att["commande"] and att["indice"] is None:
            assert cas["entity_id"] not in sortie, cas["id"]
            continue
        e = sortie[cas["entity_id"]]
        for cle in ("nom", "etat", "dernier", "declencheurs", "heures", "jours", "conditionnel",
                    "portions", "indice"):
            assert e[cle] == att[cle], (cas["id"], cle)
        assert e["modifiable"] is att["modifiable_si_admin"], cas["id"]
        assert ("id_config" in e) is e["modifiable"], cas["id"]
        assert e["pilotable"] is True
        assert set(e) == CLES_ELEMENT | ({"id_config"} if e["modifiable"] else set()), cas["id"]
    assert len(sortie) == sum(1 for c in BLOC["cas"] if c["attendu"]["commande"] or c["attendu"]["indice"])


def test_jamais_le_brut_dans_la_sortie(module):
    sortie = resumer(module, maison(), Compte(admin=True))
    texte = json.dumps(sortie, ensure_ascii=False)
    for interdit in ('"raw_config"', '"message"', '"data"', '"donnees"', '"sequence"', "presque vide",
                     "zigbee2mqtt/", "{{"):
        assert interdit not in texte, interdit

    def cles(x):
        if isinstance(x, dict):
            for k, v in x.items():
                yield k
                yield from cles(v)
        elif isinstance(x, list):
            for v in x:
                yield from cles(v)
    assert set(cles(sortie)) <= CLES_ELEMENT | {"id_config", "type", "heure", "evenement", "decalage", "toutes"}


def test_alerte_decompte_reglages_ecartes(module):
    ids = {e["entity_id"] for e in resumer(module, maison(), Compte(admin=True))}
    for cas in ("alerte_bac_lit_seulement", "decremente_le_reservoir", "reglage_de_la_portion_seulement",
                "mode_programme_le_soir", "device_action_sur_le_mode", "device_action_sur_la_portion",
                "lumiere_de_l_appareil_par_device_action", "scripts_en_boucle"):
        assert CAS[cas]["entity_id"] not in ids, cas


def test_indisponible_trouvee_par_raw_config(module):
    # Sans action_script, HA ne la reference pas : automations_with_entity ne la rend pas.
    hass = maison()
    auto = sys.modules["homeassistant.components.automation"]
    assert CAS["indisponible_repli_raw_config"]["entity_id"] not in auto.automations_with_entity(hass, CTX["commande"])
    e = {x["entity_id"]: x for x in resumer(module, hass, Compte(admin=True))}
    assert e["automation.croquettes_cassee"]["etat"] == "unavailable"
    assert e["automation.croquettes_cassee"]["heures"] == ["08:15"]


def test_sans_commande_seul_le_script_designe_garde(module):
    """Prudence : sans `commande`, la portion et le mode ne deviennent jamais un
    repas, et la seule cible de repas est le script designe."""
    sortie = {e["entity_id"]: e for e in resumer(module, maison(), Compte(admin=True), commande=None)}
    ids = set(sortie)
    assert sortie["automation.croquettes_par_script"]["indice"] is None
    # Plus reconnue par ses actions : seul l'indice de l'ancienne liste la montre.
    assert sortie["automation.croquettes_matin_et_soir"]["indice"] == "ancienne_liste"
    assert "automation.croquettes_du_midi" not in ids
    assert "automation.portion_d_hiver" not in ids


def test_scripts_trois_niveaux_au_plus(module):
    def script(n, suivant):
        seq = ([{"action": suivant}] if suivant.startswith("script.")
               else [{"action": "select.select_option", "target": {"entity_id": suivant}, "data": {"option": "START"}}])
        return FauxScriptEntite(f"script.niveau_{n}", {"sequence": seq}, {"referenced_entities": [], "referenced_devices": []})

    def chaine(longueur):
        noms = [f"script.niveau_{i}" for i in range(1, longueur + 1)]
        scripts = [script(i, noms[i] if i < longueur else CTX["commande"]) for i in range(1, longueur + 1)]
        auto = FausseAutomatisation("automation.chaine", {"triggers": [{"trigger": "time", "at": "09:00"}],
                                                           "actions": [{"action": "script.niveau_1"}]},
                                    {"entities": [], "devices": []},
                                    {"referenced_entities": [], "referenced_devices": []})
        hass = maison(autos=[auto], scripts=scripts)
        return {e["entity_id"] for e in module.resumer(hass, [CTX["commande"]], [], [], {}, None,
                                                       commande=CTX["commande"], registre={})}
    assert "automation.chaine" in chaine(3)
    assert "automation.chaine" not in chaine(4)


def _une(eid, etapes, devices=()):
    """Une automatisation de 06:00 dont HA a releve `devices` dans les actions."""
    raw = {"id": "9", "alias": eid, "triggers": [{"trigger": "time", "at": "06:00"}], "actions": etapes}
    return FausseAutomatisation(eid, raw, {"entities": [], "devices": list(devices)},
                                {"referenced_entities": [], "referenced_devices": list(devices)})


def _ids_gardes(module, autos, commande, cibles=None):
    hass = maison(autos=autos, scripts=[])
    return {e["entity_id"] for e in module.resumer(hass, cibles or CTX["cibles"], CTX["appareils"], [], {}, None,
                                                   commande=commande, registre={})}


def test_reglage_sur_l_appareil_entier_n_est_pas_un_repas(module):
    """Contradicteur, 05/10 : la « portion d'hiver » que l'ADR ecarte revenait par
    `target.device_id` — `number.set_value` sur l'appareil entier ecrit SA
    portion, pas un repas ; elle aurait ete un repas de trois portions a 06:00,
    donc des automatisations ACTIVES et un planning Loggia retenu. De meme un
    `button.press` sur un appareil que commande un select ne distribue rien."""
    hiver = _une("automation.hiver_par_l_appareil", [{"action": "number.set_value", "data": {"value": 3},
                                                      "target": {"device_id": "dev_aqara_z2m"}}], ["dev_aqara_z2m"])
    boutons = _une("automation.boutons_de_l_appareil", [{"action": "button.press",
                                                         "target": {"device_id": "dev_aqara_z2m"}}], ["dev_aqara_z2m"])
    start = _une("automation.start_par_l_appareil", [{"action": "select.select_option", "data": {"option": "START"},
                                                      "target": {"device_id": "dev_aqara_z2m"}}], ["dev_aqara_z2m"])
    assert _ids_gardes(module, [hiver, boutons, start], CTX["commande"]) == {"automation.start_par_l_appareil"}
    # Le temoin : un distributeur que commande un number (Tuya) distribue bien
    # quand on ecrit les number de tout l'appareil.
    assert _ids_gardes(module, [hiver], "number.distributeur_cuisine_feed",
                       ["number.distributeur_cuisine_feed"]) == {"automation.hiver_par_l_appareil"}


def test_sans_commande_rien_par_l_appareil(module):
    """Sans `commande`, seuls les scripts designes gardent (la docstring le
    promettait) : une device action NON resolue ne devient pas un repas."""
    dev = _une("automation.appui_non_resolu", [{"device_id": "dev_aqara_z2m", "domain": "select", "type": "select_option",
                                                "entity_id": "inconnu", "option": "START"}], ["dev_aqara_z2m"])
    assert _ids_gardes(module, [dev], CTX["commande"]) == {"automation.appui_non_resolu"}
    assert _ids_gardes(module, [dev], None) == set()


def test_data_template_lu_dans_le_repli(module):
    """L'ancienne ecriture `data_template` : HA la releve, le repli sur
    raw_config d'une automatisation indisponible doit la lire aussi."""
    raw = {"triggers": [{"trigger": "time", "at": "07:10"}],
           "actions": [{"service": "select.select_option",
                        "data_template": {"entity_id": CTX["commande"], "option": "START"}}]}
    cassee = FausseAutomatisation("automation.ancienne_ecriture", raw)  # sans action_script
    assert _ids_gardes(module, [cassee], CTX["commande"]) == {"automation.ancienne_ecriture"}


def test_chaque_script_lu_une_fois(module, monkeypatch):
    """Contradicteur, 05/10 : sans memoire, chaque script reparcourait ses
    descendants sur trois niveaux — 0,4 s pour 100 scripts qui en appellent 3,
    5 s pour 300 qui en appellent 8, dans la boucle d'evenements de HA, a chaque
    sondage et a chaque depart de repas. Compte des lectures, pas du temps."""
    n = 60
    scripts = [FauxScriptEntite(f"script.s{i}", {"sequence": [{"action": f"script.s{(i * 7 + k) % n}"} for k in range(1, 5)]},
                                {"referenced_entities": [], "referenced_devices": []}) for i in range(n)]
    autos = [_une(f"automation.a{i}", [{"action": f"script.s{i}"}]) for i in range(20)]
    hass = maison(autos=autos, scripts=scripts)
    lectures = []
    vraie = module.actions
    monkeypatch.setattr(module, "actions", lambda raw: lectures.append(1) or vraie(raw))
    module.resumer(hass, CTX["cibles"], CTX["appareils"], [], {}, None, commande=CTX["commande"], registre={})
    assert len(lectures) <= 3 * n + 2 * len(autos), len(lectures)


def test_droits_lecture_controle_et_modification(module):
    hass = maison()
    cache = "automation.croquettes_du_midi"
    ordinaire = Compte(lire=lambda eid: eid != cache, piloter=lambda eid: eid != "automation.croquettes_matin_et_soir")
    sortie = {e["entity_id"]: e for e in resumer(module, hass, ordinaire)}
    assert cache not in sortie  # illisible pour le compte : absente
    assert sortie["automation.croquettes_matin_et_soir"]["pilotable"] is False
    assert sortie["automation.croquettes_par_script"]["pilotable"] is True
    assert all(e["modifiable"] is False and "id_config" not in e for e in sortie.values())
    # Les droits de la maison (depart d'un repas) : tout se lit et se pilote, rien ne se modifie.
    maison_ = resumer(module, hass, None)
    assert all(e["pilotable"] and not e["modifiable"] for e in maison_)
    admin = {e["entity_id"]: e for e in resumer(module, hass, Compte(admin=True))}
    assert admin["automation.croquettes_matin_et_soir"]["id_config"] == "1728000000001"


def test_indice_seulement_si_non_reconnue(module):
    sortie = {e["entity_id"]: e for e in resumer(module, maison(), Compte(admin=True))}
    assert sortie["automation.croquettes_matin_et_soir"]["indice"] is None  # reconnue, meme nommee
    assert sortie["automation.croquettes_par_mqtt"]["indice"] == "ancienne_liste"
    assert sortie["automation.croquettes_par_zone"]["indice"] == "associee"
    # Un indice vers une automatisation qui n'existe plus ne fabrique rien.
    vide = resumer(module, maison(), Compte(admin=True), indices={"associee": ["automation.disparue"]})
    assert "automation.disparue" not in {e["entity_id"] for e in vide}


def test_sans_composant_automation_liste_vide(module, monkeypatch):
    hass = maison()
    monkeypatch.setitem(sys.modules, "homeassistant.components.automation", None)
    assert resumer(module, hass, Compte(admin=True)) == []


def test_sans_composant_script_le_reste_marche(module, monkeypatch):
    hass = maison()
    monkeypatch.setitem(sys.modules, "homeassistant.components.script", None)
    ids = {e["entity_id"] for e in resumer(module, hass, Compte(admin=True))}
    assert {"automation.croquettes_par_script", "automation.routine_du_matin"} <= ids


def test_horodatage_a_l_heure_de_la_maison(module, monkeypatch):
    paris = dt.timezone(dt.timedelta(hours=2))
    monkeypatch.setattr(sys.modules["homeassistant.util.dt"], "as_local",
                        lambda d: d.astimezone(paris), raising=False)
    hass = maison({"sensor.reveil_suivant": ("2026-10-06T04:10:00+00:00", {"device_class": "timestamp"})})
    e = {x["entity_id"]: x for x in resumer(module, hass, None)}
    assert e["automation.routine_du_matin"]["heures"] == ["06:20"]


def test_input_datetime_avec_date_n_est_pas_quotidien(module):
    hass = maison({"input_datetime.heure_repas_soir": ("2026-10-06 18:45:00", {
        "has_date": True, "has_time": True, "hour": 18, "minute": 45})})
    e = {x["entity_id"]: x for x in resumer(module, hass, None)}
    assert e["automation.croquettes_par_script"]["declencheurs"] == [{"type": "autre"}]
    assert e["automation.croquettes_par_script"]["heures"] == []


def test_ordre_stable(module):
    sortie = resumer(module, maison(), Compte(admin=True))
    heures = [(e["heures"] or ["~"])[0] for e in sortie]
    assert heures == sorted(heures)


def test_manifest_declare_automation_et_script():
    # hassfest refuse l'import d'une integration non declaree (validate.yml).
    manifest = json.loads((RACINE / "custom_components" / "loggia" / "manifest.json").read_text(encoding="utf-8"))
    assert {"mqtt", "automation", "script"} <= set(manifest.get("after_dependencies") or [])
    assert not {"automation", "script"} & set(manifest.get("dependencies") or [])


# ── Relecture du 05/10 ──────────────────────────────────────────────────────

def test_nommer_la_commande_n_est_pas_la_commander(module):
    """Sonde de relecture (05/10) : un appel qui porte l'entity_id de la
    commande dans ses donnees sans etre de son domaine (logbook.log,
    notify.*) ne distribue rien. `homeassistant.turn_on` d'un script, si."""
    cibles, apps = CTX["cibles_repas"], CTX["appareils"]

    def appel(service, eid):
        return {"appel": service, "entites": [eid], "appareils": [], "donnees": {}, "repetition": None,
                "appareil": None}
    assert not module.vise(appel("logbook.log", CTX["commande"]), cibles, apps)
    assert not module.vise(appel("notify.persistent_notification", CTX["commande"]), cibles, apps)
    assert module.vise(appel("select.select_option", CTX["commande"]), cibles, apps)
    assert module.vise(appel("script.turn_on", "script.nourrir_le_chat"), cibles, apps)
    assert module.vise(appel("homeassistant.turn_on", "script.nourrir_le_chat"), cibles, apps)
    # Liste FERMEE, a dessein : un service d'integration qui vise la commande
    # distribue peut-etre — un repas en double est le risque le plus grave.
    assert module.vise(appel("petkit.manual_feed", CTX["commande"]), cibles, apps)


def test_un_script_qui_lit_la_commande_dans_un_choose_ne_commande_pas(module):
    """Le faux positif du choose (relecture du 05/10), cote SCRIPTS : HA releve
    la condition dans `script.referenced_entities`, et le script passait pour
    un script qui commande — l'automatisation qui l'appelle aussi."""
    lit = FauxScriptEntite("script.eclairer_si_repos", {"sequence": [
        {"choose": [{"conditions": [{"condition": "state", "entity_id": CTX["commande"], "state": "STOP"}],
                     "sequence": [{"action": "light.turn_on", "target": {"entity_id": "light.cuisine"}}]}]}]},
        {"referenced_entities": [CTX["commande"], "light.cuisine"], "referenced_devices": []})
    auto = _une("automation.appelle_le_script", [{"action": "script.eclairer_si_repos"}])
    hass = maison(autos=[auto], scripts=[lit])
    assert module.resumer(hass, CTX["cibles"], CTX["appareils"], [], {}, None,
                          commande=CTX["commande"], registre={}) == []


def test_sans_raw_config_les_references_de_ha_tranchent_encore(module):
    """Une automatisation de blueprint n'a pas d'actions dans `raw_config` : la
    seule chose qu'on sache d'elle est ce que HA a releve — elle reste vue."""
    plan = FausseAutomatisation("automation.par_blueprint",
                                {"id": "77", "use_blueprint": {"path": "x.yaml", "input": {}}},
                                {"entities": [CTX["commande"]], "devices": []},
                                {"referenced_entities": [CTX["commande"]], "referenced_devices": []})
    hass = maison(autos=[plan], scripts=[])
    ids = {e["entity_id"] for e in module.resumer(hass, CTX["cibles"], CTX["appareils"], [], {}, None,
                                                  commande=CTX["commande"], registre={})}
    assert ids == {"automation.par_blueprint"}


def test_les_actions_d_une_automatisation_inchangee_ne_se_relisent_pas(module, monkeypatch):
    """Sonde de relecture (05/10) : `actions()` faisait 85 % du temps de
    `resumer`, relu a chaque sondage (60 s par carte, 15 s par fiche ouverte,
    chaque client). Une `raw_config` qui n'a pas change — le MEME objet, HA en
    cree un neuf a chaque rechargement — n'est lue qu'une fois."""
    module._MEMOIRE_ACTIONS.clear()  # l'ordre des tests ne decide de rien
    hass = maison()
    lectures = []
    vraie = module.actions
    monkeypatch.setattr(module, "actions", lambda raw: lectures.append(id(raw)) or vraie(raw))
    premier = resumer(module, hass, Compte(admin=True))
    assert lectures, "rien n'a ete lu"
    lectures.clear()
    assert resumer(module, hass, Compte(admin=True)) == premier
    assert lectures == [], "une automatisation inchangee a ete relue"
    # Rechargee (un objet NEUF, meme contenu modifie) : relue, et lue juste.
    ent = hass.data["automation"].get_entity("automation.croquettes_du_midi")
    ent.raw_config = json.loads(json.dumps(ent.raw_config))
    ent.raw_config["actions"] = [{"action": "light.turn_on", "target": {"entity_id": "light.cuisine"}}]
    del ent.action_script  # rechargee indisponible : seul raw_config parle
    apres = {e["entity_id"] for e in resumer(module, hass, Compte(admin=True))}
    assert set(lectures) == {id(ent.raw_config)}, "seule la configuration rechargee se relit"
    assert "automation.croquettes_du_midi" not in apres


def test_la_memoire_des_actions_ne_garde_que_le_dernier_passage(module):
    """La memoire tient les `raw_config` vues au dernier passage, pas toutes
    celles d'avant : un rechargement ne laisse pas l'ancienne en vie."""
    hass = maison()
    resumer(module, hass, Compte(admin=True))
    ent = hass.data["automation"].get_entity("automation.croquettes_du_midi")
    ancienne = ent.raw_config
    ent.raw_config = json.loads(json.dumps(ancienne))
    resumer(module, hass, Compte(admin=True))
    assert all(raw is not ancienne for raw, _ in module._MEMOIRE_ACTIONS.values())


def test_pour_compte_filtre_sans_recalculer(module):
    """`resumer_maison` calcule une fois sous les droits de la maison ;
    `pour_compte` applique ceux du compte — la meme sortie que `resumer`."""
    hass = maison()
    designes = [c for c in CTX["cibles_repas"] if c.startswith("script.")]
    maison_ = module.resumer_maison(hass, CTX["cibles"], CTX["appareils"], designes, CTX["indices"],
                                    commande=CTX["commande"], registre=CTX["registre_ids"])
    for compte in (None, Compte(admin=True), Compte(admin=False),
                   Compte(lire=lambda eid: eid != "automation.croquettes_du_midi", piloter=lambda eid: False)):
        assert module.pour_compte(maison_, compte) == resumer(module, hass, compte)
    # Le calcul de la maison ne porte rien qui sorte tel quel : `pour_compte`
    # rend des copies, un appel ne deteint pas sur le suivant.
    module.pour_compte(maison_, Compte(admin=True))[0]["nom"] = "abime"
    assert module.pour_compte(maison_, None)[0]["nom"] != "abime"


# ── Contradicteur de C2 (05/10) : ce que HA releve et que le parcours ne lit pas ─

def _referencee(eid, etapes):
    """Une automatisation dont HA a releve la commande dans ses actions."""
    raw = {"id": "9", "alias": eid, "triggers": [{"trigger": "time", "at": "06:00"}], "actions": etapes}
    return FausseAutomatisation(eid, raw, {"entities": [CTX["commande"]], "devices": []},
                                {"referenced_entities": [CTX["commande"]], "referenced_devices": []})


_NOTIF = {"action": "notify.notify", "data": {"message": "repas"}}
_DONNE = {"target": {"entity_id": "select.distributeur_cuisine_feed"}, "data": {"option": "START"}}


@pytest.mark.parametrize("etape", [
    {"service_template": "select.select_option", **_DONNE},
    {"action": "{{ 'select.select_option' }}", **_DONNE},
    {"sequence": {"action": "select.select_option", **_DONNE}},
], ids=["service_template", "service_en_gabarit", "sequence_sans_liste"])
def test_une_commande_que_le_parcours_ne_lit_pas_reste_vue_par_ha(module, etape):
    """Contradicteur de C2 (05/10) : « quand raw_config se lit, le parcours
    tranche seul » perdait ce que HA releve et que `actions()` ne lit pas —
    l'ancienne cle `service_template`, un service en gabarit a cible fixe, une
    `sequence` ecrite sans liste. Des qu'une AUTRE action se lisait (une
    notification), l'automatisation qui distribue n'etait plus vue : le repas
    de Loggia partait a cote du sien, une double ration. Seules tombent les
    references que le parcours SAIT muettes (condition, journal de bord…)."""
    assert _ids_gardes(module, [_referencee("automation.x", [_NOTIF, etape])], CTX["commande"]) \
        == {"automation.x"}


def test_ce_que_le_parcours_voit_muet_ne_retient_rien(module):
    """Ce qui tombe des references de HA : une entite que les actions TESTENT
    (choose, or imbrique, if, etape `condition`) ou NOMMENT sans la commander
    (journal de bord). Limite assumee : une entite a la fois testee et
    commandee par une forme que le parcours ne lit pas tombe aussi."""
    nomme = {"action": "logbook.log", "data": {"name": "Bac", "message": "x",
                                               "entity_id": CTX["commande"]}}
    assert _ids_gardes(module, [_referencee("automation.x", [nomme])], CTX["commande"]) == set()
    choose = {"choose": [{"conditions": [{"condition": "or", "conditions": [
        {"condition": "state", "entity_id": [CTX["commande"]], "state": "STOP"}]}],
        "sequence": [{"action": "light.turn_on", "target": {"entity_id": "light.cuisine"}}]}]}
    assert _ids_gardes(module, [_referencee("automation.y", [choose])], CTX["commande"]) == set()
    si = {"if": [{"condition": "state", "entity_id": CTX["commande"], "state": "STOP"}],
          "then": [_NOTIF]}
    assert _ids_gardes(module, [_referencee("automation.z", [si])], CTX["commande"]) == set()
    etape = {"condition": "state", "entity_id": CTX["commande"], "state": "STOP"}
    assert _ids_gardes(module, [_referencee("automation.w", [etape, _NOTIF])], CTX["commande"]) == set()
    tant_que = {"repeat": {"while": [{"condition": "state", "entity_id": CTX["commande"], "state": "STOP"}],
                           "sequence": [_NOTIF]}}
    attente = {"wait_for_trigger": [{"trigger": "state", "entity_id": CTX["commande"]}]}
    assert _ids_gardes(module, [_referencee("automation.v", [tant_que]), _referencee("automation.u", [attente])],
                       CTX["commande"]) == set()
