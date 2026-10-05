"""Tests des tables de l'appareil du distributeur (ADR 0155, 05/10).

La fixture `tests/fixtures/distributeurs.json` est PARTAGEE avec le JS
(`src/distributeur.js`) : chaque cas y donne les entites d'un appareil typique
et ce qu'on doit en lire. Si le Python et le JS divergent, l'un des deux
rougit ici. Les tables du module sont comparees a `tables` cle par cle : une
vingtaine d'entrees ne decident d'aucun attendu, les cas seuls ne les figent
pas.

Le point qui compte : la commande ne sort JAMAIS de l'appareil designe, et un
script devine a son nom n'en est jamais une. Un aquarium dont le select
« feed » propose START ne nourrit pas le chat.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from conftest import charger

RACINE = Path(__file__).resolve().parents[2]
FIXTURE = json.loads((RACINE / "tests" / "fixtures" / "distributeurs.json").read_text(encoding="utf-8"))
CAS = {c["id"]: c for c in FIXTURE["cas"]}
SOURCE = (RACINE / "custom_components" / "loggia" / "distributeur_appareil.py")


@pytest.fixture(scope="module")
def da():
    return charger("distributeur_appareil")


# ── Doublures : le registre et les etats, comme Home Assistant les donne ────

class _Enum:
    """Comme `EntityCategory.CONFIG` : la valeur lisible est dans `.value`."""

    def __init__(self, valeur):
        self.value = valeur


class Entree:
    """Une entree du registre des entites (les seuls champs lus)."""

    def __init__(self, entity_id, device_id=None, plateforme=None, cle=None, categorie=None,
                 classe=None, masquee=False, desactivee=False):
        self.entity_id = entity_id
        self.device_id = device_id
        self.platform = plateforme
        self.translation_key = cle
        self.entity_category = _Enum(categorie) if categorie else None
        # Une integration pose original_device_class ; device_class est le
        # choix de l'utilisateur, vide le plus souvent.
        self.original_device_class = classe
        self.device_class = None
        self.hidden_by = _Enum("user") if masquee else None
        self.disabled_by = _Enum("user") if desactivee else None


class FauxRegistre:
    def __init__(self, entrees):
        self.entities = {e.entity_id: e for e in entrees}

    def async_get(self, entity_id):
        return self.entities.get(entity_id)


class FauxEtat:
    def __init__(self, state, attributes=None):
        self.state = state
        self.attributes = dict(attributes or {})


def monter(cas, inverse=False):
    """(registre, etats, services) d'un cas de la fixture. Une entite desactivee
    n'a pas d'etat ; la classe est posee dans le registre ET dans les attributs."""
    entites = list(reversed(cas["entites"])) if inverse else cas["entites"]
    registre = FauxRegistre([
        Entree(e["entity_id"], e.get("device_id"), e.get("plateforme"), e.get("cle"), e.get("categorie"),
               e.get("classe"), bool(e.get("masquee")), bool(e.get("desactivee")))
        for e in entites
    ])
    etats = {}
    for e in entites:
        if e.get("desactivee") or e.get("etat") is None:
            continue
        attributs = dict(e.get("attributs") or {})
        if e.get("classe"):
            attributs["device_class"] = e["classe"]
        etats[e["entity_id"]] = FauxEtat(e["etat"], attributs)
    return registre, etats, list(cas.get("services") or [])


def json_de(valeur):
    """Les tuples du module deviennent des listes, comme dans la fixture."""
    return json.loads(json.dumps(valeur))


# ── Les tables ──────────────────────────────────────────────────────────────

@pytest.mark.parametrize("nom", sorted(FIXTURE["tables"]))
def test_chaque_table_est_egale_a_la_fixture(da, nom):
    assert hasattr(da, nom), "constante absente : %s" % nom
    assert json_de(getattr(da, nom)) == FIXTURE["tables"][nom]


def test_le_module_est_pur_et_ne_decode_pas_tuya_local():
    """Pur : automatisations.py et distributeurs.py le chargent sans Home
    Assistant. Et AUCUN decodage tuya-local en v1 : une heure fausse est pire
    que rien (ADR 0155)."""
    texte = SOURCE.read_text(encoding="utf-8")
    assert "import homeassistant" not in texte and "from homeassistant" not in texte
    assert "base64" not in texte and "decoder_tuya" not in texte


# ── La fixture entiere ──────────────────────────────────────────────────────

CLES_DECRITES = ("appareil", "notes", "commande", "une_portion", "portion", "poids_portion",
                 "cibles_de_commande", "programme", "anomalies", "consommables", "en_ligne",
                 "en_cours", "prochain_capteur", "historique")


@pytest.mark.parametrize("cle", CLES_DECRITES)
@pytest.mark.parametrize("ident", sorted(CAS))
def test_chaque_cas_de_la_fixture(da, ident, cle):
    cas = CAS[ident]
    registre, etats, services = monter(cas)
    lu = da.decrire_appareil(cas["config"], registre, etats, services)
    assert json_de(lu[cle]) == cas["attendu"][cle], "%s > %s" % (ident, cle)


@pytest.mark.parametrize("ident", sorted(CAS))
def test_l_envoi_d_un_repas_de_deux_portions(da, ident):
    cas = CAS[ident]
    registre, etats, services = monter(cas)
    lu = da.decrire_appareil(cas["config"], registre, etats, services)
    assert json_de(da.envoi(lu["commande"], 2)) == cas["attendu"]["envoi_2_portions"]


@pytest.mark.parametrize("ident", sorted(CAS))
def test_les_signatures_du_contrat(da, ident):
    """Les signatures sur lesquelles les tranches s'accordent (ADR 0155) :
    appareil_de(cfg, registre), soeurs(registre, etats, device_id),
    commande_distribuer(soeurs, etats, cfg), programme_appareil(soeurs, etats,
    services) — et l'ordre du registre ne change rien (departage par entity_id)."""
    cas = CAS[ident]
    registre, etats, services = monter(cas, inverse=True)
    appareil, notes = da.appareil_de(cas["config"], registre)
    assert appareil == cas["attendu"]["appareil"]
    assert notes == cas["attendu"]["notes"]
    liste = da.soeurs(registre, etats, appareil, cas["config"])
    assert json_de(da.commande_distribuer(liste, etats, cas["config"])) == cas["attendu"]["commande"]
    assert json_de(da.programme_appareil(liste, etats, services)) == cas["attendu"]["programme"]


# ── Ce que la fixture dit, redit en clair ───────────────────────────────────

@pytest.mark.parametrize("ident", ["localtuya_sans_cle", "esphome", "fontaine", "litiere",
                                   "script_devine_jamais",
                                   "appareil_sans_commande_et_commandes_etrangeres"])
def test_on_ne_devine_aucune_commande(da, ident):
    cas = CAS[ident]
    registre, etats, services = monter(cas)
    lu = da.decrire_appareil(cas["config"], registre, etats, services)
    assert lu["commande"] is None
    assert lu["cibles_de_commande"] == [] and lu["cibles_de_repas"] == []
    assert da.envoi(lu["commande"], 2) is None


def test_la_commande_ne_sort_jamais_de_l_appareil(da):
    """Deux distributeurs et l'aquarium : seul le select du SALON (l'appareil de
    la portion designee) commande ; la portion designee sur l'entree est
    signalee, pas suivie."""
    cas = CAS["deux_distributeurs_et_un_select_feed_etranger"]
    registre, etats, _ = monter(cas)
    lu = da.decrire_appareil(cas["config"], registre, etats)
    assert lu["commande"]["entity_id"] == "select.salon_feed"
    assert all(s["device_id"] == "dev_salon" for s in lu["soeurs"])
    assert lu["notes"] == [{"code": "appareil_divergent", "entity_id": "sensor.entree_portions_per_day"}]


def test_la_commande_de_l_appareil_passe_avant_le_script_designe(da):
    cas = CAS["appareil_et_script_designes"]
    registre, etats, _ = monter(cas)
    lu = da.decrire_appareil(cas["config"], registre, etats)
    assert lu["commande"]["domaine"] == "select"
    # Le script reste une cible de REPAS : ses automatisations sont reconnues.
    assert lu["cibles_de_repas"] == ["script.nourrir_le_chat", "select.distributeur_cuisine_feed"]


def test_le_script_designe_recoit_ses_portions(da):
    cas = CAS["script_seul"]
    registre, etats, _ = monter(cas)
    lu = da.decrire_appareil(cas["config"], registre, etats)
    assert da.envoi(lu["commande"], 3) == {"domaine": "script", "service": "turn_on",
                                          "data": {"entity_id": "script.nourrir_le_chat",
                                                   "variables": {"portions": 3}}}


def test_une_portion_est_un_pas_borne_par_l_entite(da):
    """PetKit en grammes au pas de 20 : 2 portions = 40 g, jamais « 2 » ; et la
    valeur ne depasse jamais le max de l'entite (Tuya : 20)."""
    petkit = {"domaine": "number", "service": "set_value", "entity_id": "number.d4_manual_feed",
              "donnees": {}, "quantite": True, "min": 0, "max": 400, "pas": 20}
    assert da.valeur_portions(petkit, 2) == 40
    assert da.valeur_portions(petkit, 30) == 400
    tuya = dict(petkit, min=1, max=20, pas=1)
    assert da.valeur_portions(tuya, 50) == 20
    assert da.valeur_portions(tuya, 0) == 1
    texte = dict(petkit, domaine="text", min=None, max=None, pas=None)
    assert da.envoi(texte, 3)["data"]["value"] == "3"
    bouton = {"domaine": "button", "service": "press", "entity_id": "button.x_feed", "donnees": {},
              "quantite": False, "min": None, "max": None, "pas": None}
    # Un bouton part UNE fois, quel que soit n : pas de quantite a ecrire.
    assert da.valeur_portions(bouton, 3) is None and da.une_portion(bouton) is None
    assert da.envoi(bouton, 3) == {"domaine": "button", "service": "press", "data": {"entity_id": "button.x_feed"}}


def test_un_bouton_d_annulation_ou_de_plan_n_est_jamais_la_commande(da):
    s = [{"entity_id": "button.d_cancel_manual_feed", "domaine": "button", "plateforme": "petkit",
          "cle": None, "suffixe": "d_cancel_manual_feed", "attributs": {}},
         {"entity_id": "button.d_enable_feed", "domaine": "button", "plateforme": "x",
          "cle": None, "suffixe": "d_enable_feed", "attributs": {}},
         {"entity_id": "button.d_reset_feed", "domaine": "button", "plateforme": "x",
          "cle": "feed", "suffixe": "d_reset_feed", "attributs": {}}]
    assert da.commande_distribuer(s, {}, None) is None
    s.append({"entity_id": "button.d_feed", "domaine": "button", "plateforme": "x", "cle": None,
              "suffixe": "d_feed", "attributs": {}})
    assert da.commande_distribuer(s, {}, None)["entity_id"] == "button.d_feed"


def test_un_number_de_reglage_n_est_jamais_une_commande(da):
    """Ecrire la quantite d'un Petlibro regle la portion, ne distribue rien."""
    s = [{"entity_id": "number.d_manual_feed_quantity", "domaine": "number", "plateforme": "tuya",
          "cle": "manual_feed_quantity", "suffixe": "d_manual_feed_quantity", "attributs": {}},
         {"entity_id": "number.d_feed", "domaine": "number", "plateforme": "zha",
          "cle": "feed", "suffixe": "d_feed", "attributs": {}}]
    assert da.commande_distribuer(s, {}, None) is None


def test_une_device_action_non_resolue_ne_vaut_repas_que_sur_une_commande(da):
    """Une lumiere du distributeur, ou son mode, ne sont pas des repas."""
    assert da.action_appareil_de_repas("button") and da.action_appareil_de_repas("number")
    assert da.action_appareil_de_repas("select", "START")
    assert not da.action_appareil_de_repas("select", "manual")
    assert not da.action_appareil_de_repas("light") and not da.action_appareil_de_repas(None)


def test_un_select_feed_en_minuscules_est_reconnu_avec_son_option(da):
    """Contradicteur, 05/10 : le JS et automatisations.py ignorent la casse de
    START. Ici aussi, sinon la carte montrait « Distribuer » et le serveur
    retenait chaque repas Loggia en « commande inconnue ». L'option envoyee est
    celle de l'ENTITE : select_option refuse une option qu'elle ne propose pas."""
    s = [{"entity_id": "select.d_feed", "domaine": "select", "plateforme": "mqtt", "cle": None,
          "suffixe": "d_feed", "attributs": {"options": ["start", "stop"]}}]
    c = da.commande_distribuer(s, {}, None)
    assert c["donnees"] == {"option": "start"}
    assert da.envoi(c, 2)["data"] == {"entity_id": "select.d_feed", "option": "start"}
    s[0]["attributs"]["options"] = ["stop", 3, None]
    assert da.commande_distribuer(s, {}, None) is None
    assert da.action_appareil_de_repas("select", "start") and da.action_appareil_de_repas("select", " START ")
    assert not da.action_appareil_de_repas("select", None)


def test_jamais_zero_portion_ni_portion_inventee(da):
    """Contradicteur, 05/10 : n = 0 ou negatif ecrivait 0 dans le number en
    grammes d'un PetKit (min 0) — un repas de 0 g note distribue —, et le
    script recevait `portions: 0` ou `None`. Une portion est un entier, au
    moins 1, arrondi comme `Math.round` du JS ; illisible, rien ne part."""
    petkit = {"domaine": "number", "service": "set_value", "entity_id": "number.d4_manual_feed",
              "donnees": {}, "quantite": True, "min": 0, "max": 400, "pas": 20}
    assert da.valeur_portions(petkit, 0) == 20 and da.valeur_portions(petkit, -3) == 20
    assert da.valeur_portions(petkit, 2.5) == 60 and da.valeur_portions(petkit, "2") == 40
    assert da.valeur_portions(petkit, None) is None and da.envoi(petkit, "beaucoup") is None
    script = {"domaine": "script", "service": "turn_on", "entity_id": "script.nourrir", "donnees": {},
              "quantite": False, "min": None, "max": None, "pas": None}
    assert da.envoi(script, 0)["data"]["variables"] == {"portions": 1}
    assert da.envoi(script, 1.4)["data"]["variables"] == {"portions": 1}
    assert da.envoi(script, None) is None and da.envoi(script, "abc") is None
    # Un bouton ne lit pas n : il part une fois, quoi qu'on lui passe.
    bouton = {"domaine": "button", "service": "press", "entity_id": "button.x_feed", "donnees": {},
              "quantite": False, "min": None, "max": None, "pas": None}
    assert da.envoi(bouton, None) == {"domaine": "button", "service": "press", "data": {"entity_id": "button.x_feed"}}


def _s(entity_id, cle=None, plateforme=None, etat=None, classe=None, **attributs):
    domaine, suffixe = entity_id.split(".", 1)
    return {"entity_id": entity_id, "domaine": domaine, "plateforme": plateforme, "cle": cle,
            "classe": classe, "suffixe": suffixe, "etat": etat, "attributs": attributs}


def test_les_regles_qui_ne_tenaient_a_aucun_cas(da):
    """Contradicteur, 05/10 : neuf mutants survivaient a la fixture. Chaque
    ligne ci-dessous en tue un."""
    # Un identifiant TRADUIT (HA les fabrique depuis le nom traduit) : seule la
    # CLE dit que ce bouton distribue.
    assert da.commande_distribuer([_s("button.futterspender_futter_ausgeben", cle="manual_feed")],
                                  {}, None)["entity_id"] == "button.futterspender_futter_ausgeben"
    # Le text qu'on ecrit est celui de PetKit, pas un text d'une autre plateforme.
    assert da.commande_distribuer([_s("text.d_manual_feed", cle="manual_feed", plateforme="tuya_local")],
                                  {}, None) is None
    # Le mode Z2M exige manual ET schedule : un select « _mode » quelconque
    # n'est pas le mode du distributeur.
    p = da.programme_appareil([_s("select.d_mode", plateforme="mqtt", etat="manual",
                                  options=["manual", "auto"])], {}, [])
    assert (p["source"], p["mode"]) == (None, None)
    # PetSafe : la plateforme seule ne suffit pas, il faut ses services.
    sp = [_s("sensor.d_next_feeding", plateforme="petsafe", etat="2026-10-05T18:00:00+00:00")]
    assert da.programme_appareil(sp, {}, [])["source"] is None
    assert da.programme_appareil(sp, {}, ["petsafe.add_schedule"])["note"] == "tenu_par_appareil"
    # tuya-local muet ou sans valeur : on ne sait pas — jamais « vide, connu ».
    for etat in ("unknown", "unavailable"):
        p = da.programme_appareil([_s("text.d_meal_plan", cle="meal_plan", plateforme="tuya_local", etat=etat)],
                                  {}, [])
        assert (p["source"], p["connu"], p["presente"]) == ("tuya_local", False, False), etat
    # PetKit muet : sa derniere liste n'est plus vraie.
    p = da.programme_appareil([_s("sensor.d_raw", cle="raw_distribution_data", plateforme="petkit",
                                  etat="unavailable",
                                  feed_daily_list=[{"repeats": 1, "suspended": 0,
                                                    "items": [{"time": 25200, "amount": 1}]}])], {}, [])
    assert (p["source"], p["connu"], p["repas"]) == ("petkit", False, [])
    # Une heure Petlibro qui n'en est pas une : liste tenue, jamais une panne.
    p = da.programme_appareil([_s("binary_sensor.g_feeding_schedule", cle="feeding_schedule",
                                  plateforme="petlibro", etat="on",
                                  schedule=[{"time": "matin", "amount_raw": 1, "repeat_days": [1]}])], {}, [])
    assert (p["presente"], p["lisible"], p["note"]) == (True, False, "tenu_par_appareil")
    # Connectivite : par la CLE online sans classe, et seulement a « off » — un
    # capteur muet n'est pas un appareil debranche (la commande le dirait).
    hors = [_s("binary_sensor.d_online", cle="online", etat="off")]
    assert da.en_ligne(hors, {}, None) == {"mort": True, "raison": "connectivite"}
    muet = [_s("binary_sensor.d_connexion", classe="connectivity", etat="unavailable")]
    assert da.en_ligne(muet, {}, None) == {"mort": False, "raison": None}
    # Les entites `event` de l'appareil comptent dans l'historique (aucun cas
    # de la fixture n'en a).
    assert da.historique([_s("event.d_repas"), _s("sensor.d_last_feeding_source", cle="last_feeding_source")]) \
        ["evenements"] == ["event.d_repas", "sensor.d_last_feeding_source"]
    # La portion designee est un NUMBER (comme `portionDistributeur` du JS) : un
    # input_number designe la n'est pas la portion de l'appareil.
    reg = _registre(("input_number.portion", None), ("number.a_serving_size", "dev_a"))
    etats = {e: FauxEtat("2", {"min": 1, "max": 5, "step": 1}) for e in reg.entities}
    cfg = {"appareil": "dev_a", "haids": {"portionWeight": "input_number.portion"}}
    assert da.portion(da.soeurs(reg, etats, "dev_a"), etats, cfg, reg, "dev_a")["entity_id"] == "number.a_serving_size"
    # Sans appareil, une entite designee DESACTIVEE n'est pas une soeur.
    reg = FauxRegistre([Entree("number.portion", None, "template", desactivee=True)])
    assert da.soeurs(reg, {}, None, {"haids": {"portionWeight": "number.portion"}}) == []


def test_departage_par_entity_id(da):
    s = [{"entity_id": "button.b_feed", "domaine": "button", "cle": None, "suffixe": "b_feed", "attributs": {}},
         {"entity_id": "button.a_feed", "domaine": "button", "cle": None, "suffixe": "a_feed", "attributs": {}}]
    assert da.commande_distribuer(s, {}, None)["entity_id"] == "button.a_feed"


def test_les_cibles_ne_sont_jamais_un_capteur_ni_le_reservoir(da):
    """Une automatisation qui LIT le bac ne commande rien : meme designee comme
    portion par erreur, une entite sensor n'est pas une cible."""
    cas = CAS["aqara_z2m_manuel"]
    registre, etats, _ = monter(cas)
    cfg = json.loads(json.dumps(cas["config"]))
    cfg["haids"]["portionWeight"] = "sensor.distributeur_cuisine_weight_per_day"
    lu = da.decrire_appareil(cfg, registre, etats)
    assert all(not c.startswith(("sensor.", "binary_sensor.", "input_number.")) for c in lu["cibles_de_commande"])
    assert "input_number.croquettes_reservoir" not in lu["cibles_de_commande"]
    # Un reservoir tenu dans un number, designe AUSSI comme portion : il reste
    # le reservoir, pas une cible (une automatisation qui le decremente ne
    # distribue rien).
    cfg["haids"]["portionWeight"] = cfg["haids"]["reservoir"] = "number.distributeur_cuisine_serving_size"
    lu = da.decrire_appareil(cfg, registre, etats)
    assert lu["portion"]["entity_id"] == "number.distributeur_cuisine_serving_size"
    assert "number.distributeur_cuisine_serving_size" not in lu["cibles_de_commande"]


# ── Aqara : manuel, programme, liste ────────────────────────────────────────

def _programme(da, ident, **retouches):
    cas = json.loads(json.dumps(CAS[ident]))
    for eid, etat in retouches.items():
        for e in cas["entites"]:
            if e["entity_id"] == eid.replace("__", "."):
                e["etat"] = etat
    registre, etats, services = monter(cas)
    return da.decrire_appareil(cas["config"], registre, etats, services)["programme"]


def test_aqara_manuel_n_est_pas_une_source(da):
    p = _programme(da, "aqara_z2m_manuel")
    assert (p["presente"], p["active"], p["mode"], p["note"]) == (False, False, "manuel", "mode_manuel")


def test_aqara_programme_sans_liste_est_present_illisible_et_non_actif(da):
    for ident in ("aqara_z2m_sans_liste", "aqara_z2m_liste_format_python", "aqara_zha_programme"):
        p = _programme(da, ident)
        assert (p["presente"], p["active"], p["lisible"], p["note"]) == (True, False, False, "tenu_par_appareil"), ident


def test_aqara_liste_vide_n_est_pas_presente(da):
    p = _programme(da, "aqara_z2m_liste_vide")
    assert (p["presente"], p["active"], p["lisible"]) == (False, False, True)


def test_aqara_jours_inconnus_rendent_toute_la_liste_illisible(da):
    p = _programme(da, "aqara_z2m_liste", sensor__distributeur_cuisine_schedule=json.dumps(
        [{"days": "everyday", "hour": 7, "minute": 30, "size": 2},
         {"days": "lundi", "hour": 12, "minute": 0, "size": 1}]))
    assert (p["presente"], p["lisible"], p["repas"]) == (True, False, [])


def test_aqara_mode_illisible_ne_se_dit_ni_manuel_ni_tenu(da):
    p = _programme(da, "aqara_z2m_liste", select__distributeur_cuisine_mode="unknown")
    assert (p["source"], p["connu"], p["presente"], p["mode"], p["note"]) == ("aqara", False, False, None, None)


# ── Les autres programmes ───────────────────────────────────────────────────

def test_tuya_officielle_lue_seulement_en_detail(da):
    """Au sondage de la carte : rien n'est appele (« a_lire »). Fiche ouverte :
    la reponse se lit ; une erreur n'est jamais une panne."""
    cas = CAS["tuya_cwwsq_service"]
    registre, etats, services = monter(cas)
    liste = da.soeurs(registre, etats, "dev_tuya")
    assert da.tuya_a_lire(liste, services) is True
    assert da.tuya_a_lire(liste, []) is False
    assert json_de(da.programme_appareil(liste, etats, services, tuya=cas["reponse_tuya"])) \
        == cas["attendu"]["programme_detail"]
    for erreur in (RuntimeError("delai"), None, {"autre": []}, {"meal_plan": [{"days": ["lundi"], "time": "07:00",
                                                                                "portion": 1}]}):
        assert json_de(da.programme_appareil(liste, etats, services, tuya=erreur)) \
            == cas["attendu"]["programme_detail_erreur"], erreur
    # Sans le service (2024.7), on ne l'appelle jamais : on ne sait pas.
    autre = CAS["tuya_cwwsq"]
    r2, e2, s2 = monter(autre)
    assert da.tuya_a_lire(da.soeurs(r2, e2, "dev_tuya"), s2) is False


def test_petkit_un_creneau_suspendu_tous_ses_jours_garde_ses_jours_et_s_eteint(da):
    s = {"entity_id": "sensor.d_raw_distribution_data", "domaine": "sensor", "plateforme": "petkit",
         "cle": "raw_distribution_data", "suffixe": "d_raw_distribution_data", "etat": "ok",
         "attributs": {"feed_daily_list": [
             {"repeats": 6, "suspended": 1, "items": [{"time": 36000, "amount": 10}]},
             {"repeats": 7, "suspended": 1, "items": [{"time": 36000, "amount": 10}]}]}}
    p = da.programme_appareil([s], {}, [])
    assert p["repas"] == [{"heure": "10:00", "jours": [5, 6], "portions": 10, "actif": False, "etat_jour": None}]
    assert (p["presente"], p["active"]) == (True, False)


def test_petlibro_un_creneau_illisible_rend_le_programme_tenu(da):
    """Une liste qu'on ne sait pas lire en entier n'est pas lue a moitie : elle
    est presente (elle bloque l'ajout d'un repas Loggia), jamais inventee."""
    s = {"entity_id": "binary_sensor.g_feeding_schedule", "domaine": "binary_sensor", "plateforme": "petlibro",
         "cle": "feeding_schedule", "suffixe": "g_feeding_schedule", "etat": "on",
         "attributs": {"schedule": [{"time": "07:00", "amount_raw": 2, "enabled": True, "repeat_days": [1]},
                                    {"time": "25:00", "amount_raw": 1, "enabled": True, "repeat_days": [2]}]}}
    p = da.programme_appareil([s], {}, [])
    assert (p["source"], p["presente"], p["active"], p["lisible"], p["repas"]) == ("petlibro", True, False, False, [])
    s["etat"] = "off"
    s["attributs"]["schedule"].pop()
    p = da.programme_appareil([s], {}, [])
    assert (p["presente"], p["active"], p["lisible"]) == (True, False, True)


def test_petkit_sans_commande_n_est_pas_invite_au_capteur_de_diagnostic(da):
    p = _programme(da, "litiere")
    assert p["note"] is None and p["source"] is None


# ── L'appareil et ses soeurs ────────────────────────────────────────────────

def _registre(*entrees):
    return FauxRegistre([Entree(*e) for e in entrees])


def test_appareil_de_suit_l_ordre_haid_portion_distribuees_reservoir(da):
    reg = _registre(("button.a_feed", "dev_a"), ("number.b_serving_size", "dev_b"),
                    ("sensor.c_portions_per_day", "dev_c"), ("sensor.d_niveau", "dev_d"))
    cfg = {"haid": None, "haids": {"portionWeight": "number.b_serving_size",
                                   "distribuees": "sensor.c_portions_per_day", "reservoir": "sensor.d_niveau"}}
    appareil, notes = da.appareil_de(cfg, reg)
    assert appareil == "dev_b"
    assert notes == [{"code": "appareil_divergent", "entity_id": "sensor.c_portions_per_day"},
                     {"code": "appareil_divergent", "entity_id": "sensor.d_niveau"}]
    cfg["haid"] = "button.a_feed"
    assert da.appareil_de(cfg, reg)[0] == "dev_a"


def test_appareil_designe_passe_devant_et_un_helper_n_est_pas_une_divergence(da):
    reg = _registre(("number.b_serving_size", "dev_b"), ("input_number.reservoir", None))
    cfg = {"appareil": "dev_x", "haids": {"portionWeight": "number.b_serving_size",
                                          "reservoir": "input_number.reservoir"}}
    assert da.appareil_de(cfg, reg) == ("dev_x", [{"code": "appareil_divergent",
                                                   "entity_id": "number.b_serving_size"}])
    cfg["haids"]["portionWeight"] = None
    assert da.appareil_de(cfg, reg) == ("dev_x", [])
    assert da.appareil_de({"haids": {"reservoir": "input_number.reservoir"}}, reg) == (None, [])


def test_une_soeur_masquee_reste_une_desactivee_sort(da):
    reg = FauxRegistre([Entree("text.catit_meal_plan", "dev", "tuya_local", "meal_plan", masquee=True),
                        Entree("sensor.raw", "dev", "petkit", "raw_distribution_data", desactivee=True),
                        Entree("button.ailleurs_feed", "autre")])
    etats = {"text.catit_meal_plan": FauxEtat("abc")}
    assert [s["entity_id"] for s in da.soeurs(reg, etats, "dev")] == ["text.catit_meal_plan"]


def test_sans_appareil_les_soeurs_sont_les_entites_designees(da):
    reg = _registre(("input_number.reservoir", None, "input_number"), ("script.autre", None, "script"))
    etats = {"input_number.reservoir": FauxEtat("62"), "script.nourrir": FauxEtat("off"),
             "script.autre": FauxEtat("off")}
    cfg = {"script": "script.nourrir", "haids": {"reservoir": "input_number.reservoir",
                                                 "portionWeight": "number.absent"}}
    assert [s["entity_id"] for s in da.soeurs(reg, etats, None, cfg)] == ["input_number.reservoir",
                                                                          "script.nourrir"]


def test_la_portion_designee_sur_un_autre_appareil_est_ignoree(da):
    reg = _registre(("button.a_feed", "dev_a"), ("number.a_serving_size", "dev_a"),
                    ("number.b_serving_size", "dev_b"), ("number.portion_libre", None))
    etats = {e: FauxEtat("2", {"min": 1, "max": 5, "step": 1}) for e in reg.entities}
    liste = da.soeurs(reg, etats, "dev_a")
    cfg = {"appareil": "dev_a", "haids": {"portionWeight": "number.b_serving_size"}}
    assert da.portion(liste, etats, cfg, reg, "dev_a")["entity_id"] == "number.a_serving_size"
    cfg["haids"]["portionWeight"] = "number.portion_libre"
    assert da.portion(liste, etats, cfg, reg, "dev_a")["entity_id"] == "number.portion_libre"


# ── Hors ligne ──────────────────────────────────────────────────────────────

def test_un_reservoir_sans_valeur_n_est_pas_une_panne_un_reservoir_absent_si(da):
    cas = CAS["reservoir_sans_valeur"]
    registre, etats, _ = monter(cas)
    assert da.decrire_appareil(cas["config"], registre, etats)["en_ligne"] == {"mort": False, "raison": None}
    del etats["sensor.croquettes_niveau"]
    assert da.decrire_appareil(cas["config"], registre, etats)["en_ligne"] == {"mort": True, "raison": "reservoir"}


def test_une_commande_absente_est_une_panne(da):
    cas = CAS["aqara_z2m_liste"]
    registre, etats, _ = monter(cas)
    liste = da.soeurs(registre, etats, "dev_aqara_z2m")
    commande = da.commande_distribuer(liste, etats, cas["config"])
    del etats["select.distributeur_cuisine_feed"]
    assert da.en_ligne(liste, etats, cas["config"], commande) == {"mort": True, "raison": "commande"}


# ── Rien ne casse sur une entree abimee ─────────────────────────────────────

@pytest.mark.parametrize("cfg", [None, {}, {"haids": None}, {"haid": 3, "haids": {"reservoir": ["x"]}},
                                 {"appareil": "", "script": "light.pas_un_script"}])
def test_une_configuration_abimee_ne_casse_rien(da, cfg):
    lu = da.decrire_appareil(cfg, None, None)
    assert (lu["appareil"], lu["commande"], lu["soeurs"]) == (None, None, [])
    assert lu["programme"]["source"] is None and lu["en_ligne"] == {"mort": False, "raison": None}
    assert da.programme_appareil(None, None, None)["connu"] is False
    assert da.anomalies(None) == [] and da.consommables(None) == [] and da.historique(None)["compteurs"] == []


def test_les_modules_du_distributeur_sont_en_lf():
    """Relecture du 05/10 : distributeur_appareil.py etait le seul fichier du
    chantier en CRLF, contre `* text=auto eol=lf` (.gitattributes) — le commit
    l'aurait normalise avec un avertissement, et un diff entier pour rien."""
    for nom in ("distributeur_appareil.py", "distributeurs.py", "automatisations.py"):
        assert b"\r\n" not in (SOURCE.parent / nom).read_bytes(), nom + " porte des fins de ligne CRLF"
