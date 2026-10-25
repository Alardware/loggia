"""Tests de la coupure du chauffage sur fenetre ouverte.

Ce qui merite d'etre verrouille ici tient en trois phrases : on ne coupe que
ce qui chauffait, on ne rend que ce qu'on a pris, et une piece a souvent
plusieurs fenetres. Le reste decoule.
"""
from __future__ import annotations

import asyncio

import pytest

from conftest import FauxStore, charger


def lancer(coro):
    return asyncio.run(coro)


class FauxEtat:
    def __init__(self, state, attributes=None):
        self.state = state
        self.attributes = attributes or {}


class FauxEtats:
    def __init__(self, table):
        self.table = dict(table)

    def get(self, haid):
        return self.table.get(haid)


class FauxServices:
    def __init__(self):
        self.appels = []

    async def async_call(self, domaine, service, data, blocking=False, context=None):
        self.appels.append((domaine, service, dict(data)))


class FauxHass:
    def __init__(self, etats):
        self.states = FauxEtats(etats)
        self.services = FauxServices()
        self.taches = []

    def async_create_task(self, coro):
        self.taches.append(coro)
        return coro

    def abandonner(self):
        taches, self.taches = self.taches, []
        for coro in taches:
            coro.close()


@pytest.fixture
def module():
    return charger("fenetres")


@pytest.fixture
def regles_module():
    return charger("regles")


@pytest.fixture
def creer(module, store_module, regles_module):
    faits = []

    def fabrique(config=None, etats=None):
        magasin = store_module.LoggiaStore.__new__(store_module.LoggiaStore)
        magasin._store = FauxStore({"users": {}, "shared": {"loggia_fenetres": config or {}}, "migrated": True})
        magasin._ancien = FauxStore(None)
        magasin._data = None
        magasin._lock = asyncio.Lock()

        f = module.LoggiaFenetres.__new__(module.LoggiaFenetres)
        f.hass = FauxHass(etats or {})
        f.store = magasin
        f.cfg = lancer(f.async_config())
        f.coupes = {}
        f._laisses = {}   # les coupures adoptees du moteur (audit du 19/10)
        f._minuteurs = {}
        # Le socle commun, un vrai : c'est lui qui tient, qui ecarte ce qu'une
        # main tient, et qui note.
        f.regles = regles_module.Regles(f.hass, magasin)
        f.regles._depot = FauxStore(None)
        f._defait = []
        faits.append(f)
        return f

    yield fabrique
    for f in faits:
        f.hass.abandonner()


OUVERTE = {"binary_sensor.fen_chambre": FauxEtat("on")}
FERMEE = {"binary_sensor.fen_chambre": FauxEtat("off")}
RADIATEUR = {"switch.rad_chambre": FauxEtat("on")}


def cfg(delai=0, **extra):
    c = {"actif": True, "delai": delai, "pieces": {
        "Chambre": {"actif": True, "ouvrants": ["binary_sensor.fen_chambre"],
                    "chauffages": ["switch.rad_chambre"]}}}
    c.update(extra)
    return c


# ── Lire l'etat d'un ouvrant ────────────────────────────────────────────────

def test_les_deux_vocabulaires_d_ouverture(module):
    """Un `binary_sensor` dit `on`, un `cover` dit `open` : les deux comptent."""
    etats = {"a": FauxEtat("on"), "b": FauxEtat("open"), "c": FauxEtat("off"), "d": FauxEtat("closed")}
    assert module.ouvrants_ouverts(etats, ["a", "b", "c", "d"]) == ["a", "b"]


def test_un_capteur_muet_ne_compte_pas(module):
    """Un capteur tombe ne doit ni couper le chauffage ni le rendre."""
    etats = {"a": FauxEtat("unavailable"), "b": FauxEtat("unknown"), "c": FauxEtat("on")}
    assert module.ouvrants_ouverts(etats, ["a", "b", "c"]) == ["c"]


def test_le_service_depend_du_domaine(module):
    assert module.eteint_pour("climate.salon") == ("climate", "set_hvac_mode", {"hvac_mode": "off"})
    assert module.eteint_pour("switch.rad") == ("switch", "turn_off", {})
    # Une prise, une vanne, ce qu'on n'a pas prevu : le service universel.
    assert module.eteint_pour("valve.rad")[0] == "homeassistant"


def test_rendre_remet_l_etat_d_avant(module):
    assert module.rend_pour("climate.salon", "heat") == ("climate", "set_hvac_mode", {"hvac_mode": "heat"})
    assert module.rend_pour("switch.rad", "on") == ("switch", "turn_on", {})


# ── Couper ──────────────────────────────────────────────────────────────────

def test_la_fenetre_ouverte_coupe_le_radiateur(creer):
    f = creer(cfg(), {**OUVERTE, **RADIATEUR})
    lancer(f._async_couper("Chambre"))
    assert f.hass.services.appels == [("switch", "turn_off", {"entity_id": ["switch.rad_chambre"]})]
    assert f.coupes == {"Chambre": {"switch.rad_chambre": "on"}}


def test_un_radiateur_deja_eteint_n_est_pas_touche(creer):
    """Sans cette garde, on le rallumerait a la fermeture — un chauffage qui
    s'allume tout seul parce qu'on a ouvert la fenetre."""
    f = creer(cfg(), {**OUVERTE, "switch.rad_chambre": FauxEtat("off")})
    lancer(f._async_couper("Chambre"))
    assert f.hass.services.appels == []
    assert f.coupes == {}


def test_la_fenetre_refermee_entre_temps_annule_la_coupure(creer):
    """Le delai a pu s'ecouler pendant qu'on refermait."""
    f = creer(cfg(), {**FERMEE, **RADIATEUR})
    lancer(f._async_couper("Chambre"))
    assert f.hass.services.appels == []


def test_le_thermostat_passe_en_arret(creer):
    c = cfg()
    c["pieces"]["Chambre"]["chauffages"] = ["climate.chambre"]
    f = creer(c, {**OUVERTE, "climate.chambre": FauxEtat("heat")})
    lancer(f._async_couper("Chambre"))
    assert f.hass.services.appels == [
        ("climate", "set_hvac_mode", {"entity_id": ["climate.chambre"], "hvac_mode": "off"})
    ]


def test_une_piece_eteinte_est_ignoree(creer):
    c = cfg()
    c["pieces"]["Chambre"]["actif"] = False
    f = creer(c, {**OUVERTE, **RADIATEUR})
    lancer(f._async_couper("Chambre"))
    assert f.hass.services.appels == []


# ── Rendre ──────────────────────────────────────────────────────────────────

def test_la_fermeture_rend_le_chauffage(creer):
    f = creer(cfg(), {**OUVERTE, **RADIATEUR})
    lancer(f._async_couper("Chambre"))
    f.hass.states.table["binary_sensor.fen_chambre"] = FauxEtat("off")
    f.hass.states.table["switch.rad_chambre"] = FauxEtat("off")
    lancer(f._async_rendre("Chambre"))
    assert f.hass.services.appels[-1] == ("switch", "turn_on", {"entity_id": ["switch.rad_chambre"]})
    assert f.coupes == {}


def test_on_ne_rend_pas_par_dessus_un_geste_humain(creer):
    """LE point : si quelqu'un a rallume pendant l'aeration, son geste
    l'emporte. On ne rend que ce qu'on a pris."""
    f = creer(cfg(), {**OUVERTE, **RADIATEUR})
    lancer(f._async_couper("Chambre"))
    avant = len(f.hass.services.appels)
    f.hass.states.table["switch.rad_chambre"] = FauxEtat("on")   # rallume a la main
    lancer(f._async_rendre("Chambre"))
    assert len(f.hass.services.appels) == avant
    assert f.coupes == {}


def test_rendre_sans_avoir_coupe_ne_fait_rien(creer):
    f = creer(cfg(), {**FERMEE, **RADIATEUR})
    lancer(f._async_rendre("Chambre"))
    assert f.hass.services.appels == []


# ── Plusieurs fenetres ──────────────────────────────────────────────────────

def cfg_deux():
    return {"actif": True, "delai": 0, "pieces": {"Salon": {
        "actif": True,
        "ouvrants": ["binary_sensor.fen_a", "binary_sensor.fen_b"],
        "chauffages": ["switch.rad_salon"]}}}


def test_le_chauffage_ne_repart_qu_a_la_derniere_fenetre(creer):
    etats = {"binary_sensor.fen_a": FauxEtat("on"), "binary_sensor.fen_b": FauxEtat("on"),
             "switch.rad_salon": FauxEtat("on")}
    f = creer(cfg_deux(), etats)
    lancer(f._async_couper("Salon"))
    assert f.coupes["Salon"] == {"switch.rad_salon": "on"}

    # Une seule refermee : le chauffage reste coupe.
    f.hass.states.table["binary_sensor.fen_a"] = FauxEtat("off")
    f.hass.states.table["switch.rad_salon"] = FauxEtat("off")
    lancer(f._async_piece("Salon"))
    assert "Salon" in f.coupes

    # La seconde aussi : cette fois on rend.
    f.hass.states.table["binary_sensor.fen_b"] = FauxEtat("off")
    lancer(f._async_piece("Salon"))
    assert f.coupes == {}
    assert f.hass.services.appels[-1] == ("switch", "turn_on", {"entity_id": ["switch.rad_salon"]})


def test_un_delai_de_zero_coupe_tout_de_suite(creer):
    """Avec un delai, l'armement passe par un minuteur de Home Assistant que
    ces tests ne font pas tourner ; a zero, la coupure est immediate."""
    f = creer(cfg(delai=0), {**OUVERTE, **RADIATEUR})
    lancer(f._async_armer("Chambre"))
    assert f.hass.services.appels == [("switch", "turn_off", {"entity_id": ["switch.rad_chambre"]})]


# ── La configuration ────────────────────────────────────────────────────────

def test_les_defauts(creer):
    f = creer()
    assert f.cfg["actif"] is False
    assert f.cfg["delai"] == 3
    assert f.cfg["pieces"] == {}


def test_enregistrer_fusionne_une_piece(creer):
    f = creer(cfg())
    lancer(f.async_enregistrer({"delai": 7, "pieces": {"Chambre": {"actif": False}}}))
    assert f.cfg["delai"] == 7
    # Le reste de la piece survit au patch partiel.
    assert f.cfg["pieces"]["Chambre"]["ouvrants"] == ["binary_sensor.fen_chambre"]
    assert f.cfg["pieces"]["Chambre"]["actif"] is False


def test_enregistrer_none_retire_la_piece(creer):
    f = creer(cfg())
    lancer(f.async_enregistrer({"pieces": {"Chambre": None}}))
    assert f.cfg["pieces"] == {}

# ── Sur le socle ────────────────────────────────────────────────────────────

def test_la_coupure_est_une_question_de_surete(module):
    regles = charger("regles")
    assert module.PRIORITE >= regles.ECHELLE["surete"]
    assert module.PRIORITE > regles.niveau("presence", 19)


def test_la_coupure_tient_le_chauffage_contre_le_retour(creer):
    """Fenetre ouverte, le retour de presence — plus faible — ne rallume pas
    le radiateur : chauffer dehors n'est jamais voulu."""
    f = creer(cfg(), {**OUVERTE, **RADIATEUR})
    lancer(f._async_couper("Chambre"))
    regles = charger("regles")
    partis = lancer(f.regles.agir("presence", "retour", "switch", "turn_on", ["switch.rad_chambre"],
                                  priorite=regles.niveau("presence")))
    assert partis == [], "le retour a rallume un radiateur devant une fenetre ouverte"


def test_on_ne_rend_pas_ce_qu_on_ne_tient_plus(creer):
    """Une main a pris le radiateur pendant l'aeration : le socle a repris la
    tenue, et la fermeture de la fenetre ne le remet pas ou il etait."""
    from homeassistant.core import Context

    f = creer(cfg(), {**OUVERTE, **RADIATEUR})
    lancer(f._async_reabonner())
    lancer(f._async_couper("Chambre"))

    class Ev:
        data = {"entity_id": "switch.rad_chambre"}
        context = Context(user_id="u1")

    f.regles._sur_changement(Ev())
    f.hass.states.table["switch.rad_chambre"] = FauxEtat("off")
    avant = len(f.hass.services.appels)
    lancer(f._async_rendre("Chambre"))
    assert len(f.hass.services.appels) == avant
    assert f.coupes == {}


def test_les_chauffages_sont_declares_au_socle(creer):
    f = creer(cfg(), {**OUVERTE, **RADIATEUR})
    lancer(f._async_reabonner())
    assert "switch.rad_chambre" in f.regles._pilotees.get("fenetres", set())


def test_en_simulation_rien_ne_coupe_mais_le_journal_le_dit(creer):
    c = cfg()
    c["simulation"] = True
    f = creer(c, {**OUVERTE, **RADIATEUR})
    lancer(f._async_couper("Chambre"))
    assert f.hass.services.appels == []
    ligne = lancer(f.regles.journal())[0]
    assert ligne["simule"] is True
    assert (ligne["module"], ligne["quoi"], ligne["motif"]) == ("fenetres", "couper", "Chambre")


def test_l_etat_montre_le_journal_commun(creer):
    f = creer(cfg(), {**OUVERTE, **RADIATEUR})
    lancer(f._async_couper("Chambre"))
    etat = lancer(f.async_etat())
    assert etat["journal"][0]["module"] == "fenetres"

def test_rendre_ce_qu_on_ne_tient_plus_ne_laisse_aucune_trace(creer):
    """Le socle ecarterait de toute facon l'entite gelee ; mais il en noterait
    une ligne « rendre · 0 », et le journal dirait que la regle a essaye."""
    from homeassistant.core import Context

    f = creer(cfg(), {**OUVERTE, **RADIATEUR})
    lancer(f._async_reabonner())
    lancer(f._async_couper("Chambre"))

    class Ev:
        data = {"entity_id": "switch.rad_chambre"}
        context = Context(user_id="u1")

    f.regles._sur_changement(Ev())
    f.hass.states.table["switch.rad_chambre"] = FauxEtat("off")
    lancer(f._async_rendre("Chambre"))
    assert all(l["quoi"] != "rendre" for l in lancer(f.regles.journal()))


def test_un_radiateur_sous_la_main_n_est_ni_coupe_ni_retenu(creer):
    """Quelqu'un tient le radiateur quand la fenetre s'ouvre : on ne le coupe
    pas — et on ne le retient pas non plus, sinon la fermeture de la fenetre
    le « rendrait » a un etat qu'on n'a jamais pris."""
    from homeassistant.core import Context

    f = creer(cfg(), {**OUVERTE, **RADIATEUR})
    lancer(f._async_reabonner())

    class Ev:
        data = {"entity_id": "switch.rad_chambre"}
        context = Context(user_id="u1")

    f.regles._sur_changement(Ev())
    lancer(f._async_couper("Chambre"))
    assert f.hass.services.appels == []
    assert f.coupes == {}


def test_un_chauffage_partage_attend_la_derniere_fenetre(creer, module):
    """Audit 18/09 : deux pieces sur le meme radiateur. La premiere fenetre
    refermee ne doit pas rallumer tant que l'autre reste ouverte ; c'est la
    seconde piece qui rend, quand SA fenetre se referme."""
    config = {"actif": True, "delai": 0, "pieces": {
        "Sejour": {"actif": True, "ouvrants": ["binary_sensor.fen_sejour"], "chauffages": ["switch.rad"]},
        "Cuisine": {"actif": True, "ouvrants": ["binary_sensor.fen_cuisine"], "chauffages": ["switch.rad"]},
    }}
    etats = {"binary_sensor.fen_sejour": FauxEtat("on"), "binary_sensor.fen_cuisine": FauxEtat("on"), "switch.rad": FauxEtat("on")}
    f = creer(config=config, etats=etats)
    lancer(f._async_couper("Sejour"))
    assert f.coupes == {"Sejour": {"switch.rad": "on"}}
    f.hass.states.table["switch.rad"] = FauxEtat("off")
    lancer(f._async_couper("Cuisine"))
    assert "Cuisine" not in f.coupes, "deja eteint : rien a noter pour la cuisine"
    f.hass.services.appels.clear()
    # La fenetre du sejour se referme : la cuisine est encore ouverte.
    f.hass.states.table["binary_sensor.fen_sejour"] = FauxEtat("off")
    lancer(f._async_rendre("Sejour"))
    assert f.hass.services.appels == [], "le radiateur reste coupe tant que la cuisine est ouverte"
    assert f.coupes == {"Cuisine": {"switch.rad": "on"}}, "la cuisine herite de ce qu'il faudra rendre"
    f.hass.states.table["binary_sensor.fen_cuisine"] = FauxEtat("off")
    lancer(f._async_rendre("Cuisine"))
    assert [(d, s, data["entity_id"]) for d, s, data in f.hass.services.appels] == [("switch", "turn_on", ["switch.rad"])]
    assert f.coupes == {}


# ── Audit du 03/10 : capteur muet, fenetre ouverte toute la journee ─────────

def test_un_capteur_muet_garde_la_coupure(creer):
    """La pile du capteur lache, la fenetre est toujours ouverte : le
    chauffage repartait. Un capteur muet ne dit pas « ferme »."""
    f = creer(cfg(), {**OUVERTE, **RADIATEUR})
    lancer(f._async_couper("Chambre"))
    f.hass.states.table["switch.rad_chambre"] = FauxEtat("off")
    f.hass.states.table["binary_sensor.fen_chambre"] = FauxEtat("unavailable")
    avant = list(f.hass.services.appels)
    lancer(f._async_piece("Chambre"))
    assert f.hass.services.appels == avant, "le chauffage est reparti sur un capteur muet"
    assert "Chambre" in f.coupes
    # Revenu, et franchement ferme : on rend.
    f.hass.states.table["binary_sensor.fen_chambre"] = FauxEtat("off")
    lancer(f._async_piece("Chambre"))
    assert f.hass.services.appels[-1] == ("switch", "turn_on", {"entity_id": ["switch.rad_chambre"]})


def test_une_fenetre_ouverte_toute_la_journee_rend_le_chauffage(creer, monkeypatch, regles_module):
    f = creer(cfg(), {**OUVERTE, **RADIATEUR})
    lancer(f._async_couper("Chambre"))
    vrai = regles_module.time.time
    monkeypatch.setattr(regles_module.time, "time", lambda: vrai() + 13 * 3600)
    f.hass.states.table["switch.rad_chambre"] = FauxEtat("off")
    f.hass.states.table["binary_sensor.fen_chambre"] = FauxEtat("off")
    lancer(f._async_piece("Chambre"))
    assert f.hass.services.appels[-1] == ("switch", "turn_on", {"entity_id": ["switch.rad_chambre"]}), \
        "au-dela de 12 h, la coupure n'etait plus rendue"


def test_couper_la_regle_lache_le_radiateur_coupe(creer):
    f = creer(cfg(), {**OUVERTE, **RADIATEUR})
    lancer(f._async_couper("Chambre"))
    assert f.regles.tient("fenetres", "fenetre", "switch.rad_chambre")
    lancer(f.async_enregistrer({"actif": False}))
    assert f.coupes == {}
    assert not f.regles.tient("fenetres", "fenetre", "switch.rad_chambre")


# ── Un seul chef par chauffage (chantier Chauffage, § 6) ────────────────────

NODON = ["comfort", "eco", "frost_protection", "off", "comfort_-1", "comfort_-2"]
SELECT = "select.radiateur_chambre_pilot_wire_mode"


class FauxChef:
    """Le moteur du chauffage, vu de la regle : qui il pilote, le `select`
    d'un module, et les faits qu'on lui donne."""

    def __init__(self, pilotes=(), modules=None):
        self.pilotes = set(pilotes)
        self.modules = dict(modules or {})
        self.faits = []

    def pilote(self, haid):
        return haid in self.pilotes

    def select_du_module(self, haid):
        return self.modules.get(haid)

    async def async_fenetre(self, haid, piece, ouverte):
        self.faits.append((haid, piece, ouverte))


def cfg_fil_pilote(chauffage=SELECT):
    return {"actif": True, "delai": 0, "pieces": {
        "Chambre": {"actif": True, "ouvrants": ["binary_sensor.fen_chambre"], "chauffages": [chauffage]}}}


def test_un_fil_pilote_se_coupe_par_son_ordre_arret(module):
    assert module.eteint_pour(SELECT, NODON) == ("select", "select_option", {"option": "off"})
    assert module.eteint_pour(SELECT, ["Confort", "Eco", "Hors-gel", "Arrêt"]) == (
        "select", "select_option", {"option": "Arrêt"})
    assert module.eteint_pour(SELECT, ["comfort", "eco"]) is None, "sans ordre Arret, on ne sait pas couper"
    assert module.rend_pour(SELECT, "frost_protection") == ("select", "select_option", {"option": "frost_protection"})


def test_planning_eteint_la_fenetre_coupe_le_select_et_rend_son_option(creer):
    f = creer(cfg_fil_pilote(), {**OUVERTE, SELECT: FauxEtat("frost_protection", {"options": NODON})})
    lancer(f._async_couper("Chambre"))
    assert f.hass.services.appels == [("select", "select_option", {"entity_id": [SELECT], "option": "off"})]
    assert f.coupes == {"Chambre": {SELECT: "frost_protection"}}
    f.hass.states.table[SELECT] = FauxEtat("off", {"options": NODON})
    f.hass.states.table["binary_sensor.fen_chambre"] = FauxEtat("off")
    lancer(f._async_piece("Chambre"))
    assert f.hass.services.appels[-1] == ("select", "select_option",
                                          {"entity_id": [SELECT], "option": "frost_protection"})


def test_un_select_deja_a_l_arret_ou_rallume_a_la_main_n_est_pas_touche(creer):
    f = creer(cfg_fil_pilote(), {**OUVERTE, SELECT: FauxEtat("off", {"options": NODON})})
    lancer(f._async_couper("Chambre"))
    assert f.hass.services.appels == [] and f.coupes == {}
    f = creer(cfg_fil_pilote(), {**OUVERTE, SELECT: FauxEtat("comfort", {"options": NODON})})
    lancer(f._async_couper("Chambre"))
    f.hass.states.table[SELECT] = FauxEtat("eco", {"options": NODON})       # change a la main
    avant = len(f.hass.services.appels)
    lancer(f._async_rendre("Chambre"))
    assert len(f.hass.services.appels) == avant, "on ne rend pas par-dessus un geste"


def test_l_interrupteur_du_module_n_est_jamais_coupe(creer):
    """Chez lui, la regle aurait coche l'interrupteur du NodOn : la coupure
    passe par le `select` du meme module, et l'interrupteur ne bouge pas."""
    f = creer(cfg_fil_pilote("switch.radiateur_chambre"),
              {**OUVERTE, "switch.radiateur_chambre": FauxEtat("on"), SELECT: FauxEtat("comfort", {"options": NODON})})
    f.hass.data = {"loggia": {"chauffage": FauxChef(modules={"switch.radiateur_chambre": SELECT})}}
    lancer(f._async_couper("Chambre"))
    assert f.hass.services.appels == [("select", "select_option", {"entity_id": [SELECT], "option": "off"})]
    assert all(d != "switch" for d, _, _ in f.hass.services.appels)


def test_planning_allume_la_regle_donne_le_fait_et_ne_commande_rien(creer):
    chef = FauxChef(pilotes=[SELECT])
    f = creer(cfg_fil_pilote(), {**OUVERTE, SELECT: FauxEtat("comfort", {"options": NODON})})
    f.hass.data = {"loggia": {"chauffage": chef}}
    lancer(f._async_couper("Chambre"))
    assert f.hass.services.appels == [] and f.coupes == {}
    assert chef.faits == [(SELECT, "Chambre", True)]
    f.hass.states.table["binary_sensor.fen_chambre"] = FauxEtat("off")
    lancer(f._async_piece("Chambre"))
    assert chef.faits[-1] == (SELECT, "Chambre", False)
    assert f.hass.services.appels == []


# ── Le moteur lache un radiateur qu'il a coupe (audit du 19/10) ─────────────
# Planning eteint, observation, chauffage retire pendant qu'une fenetre est
# ouverte : la coupure du moteur n'etait a personne, le radiateur restait a
# l'Arret apres la fermeture. Le moteur la passe a la regle, qui la rend.

def test_une_coupure_adoptee_se_rend_a_la_fermeture(creer):
    f = creer(cfg_fil_pilote(), {**OUVERTE, SELECT: FauxEtat("off", {"options": NODON})})
    f.adopter("Chambre", SELECT, "comfort", "off")
    assert f.coupes == {"Chambre": {SELECT: "comfort"}}
    assert f.regles.tient("fenetres", "fenetre", SELECT), "tenue comme une coupure de la regle"
    assert f.hass.services.appels == [], "adopter n'envoie rien"
    f.hass.states.table["binary_sensor.fen_chambre"] = FauxEtat("off")
    lancer(f._async_piece("Chambre"))
    assert f.hass.services.appels == [("select", "select_option", {"entity_id": [SELECT], "option": "comfort"})]
    assert not f.regles.tient("fenetres", "fenetre", SELECT)


def test_une_consigne_adoptee_se_rend_a_la_fermeture_si_personne_n_y_a_touche(creer):
    """Le thermostat BAISSE par le moteur (fenetre en Eco), lache fenetre ouverte : la
    fermeture rend sa consigne (25/10). Reglee a la main entre-temps : rien."""
    clim = "climate.salon"
    reglage = {"actif": True, "delai": 0, "pieces": {"Chambre": {
        "actif": True, "ouvrants": ["binary_sensor.fen_chambre"], "chauffages": [clim]}}}
    f = creer(reglage, {**OUVERTE, clim: FauxEtat("heat", {"temperature": 17})})
    f.adopter("Chambre", clim, "consigne:20.0", "consigne:17.0")
    f.hass.states.table["binary_sensor.fen_chambre"] = FauxEtat("off")
    lancer(f._async_piece("Chambre"))
    assert f.hass.services.appels == [("climate", "set_temperature", {"entity_id": [clim], "temperature": 20.0})]
    assert not f.regles.tient("fenetres", "fenetre", clim)
    g = creer(reglage, {**OUVERTE, clim: FauxEtat("heat", {"temperature": 19})})
    g.adopter("Chambre", clim, "consigne:20.0", "consigne:17.0")
    g.hass.states.table["binary_sensor.fen_chambre"] = FauxEtat("off")
    lancer(g._async_piece("Chambre"))
    assert g.hass.services.appels == [], "reglee a 19 a la main : son geste l'emporte"
    assert not g.regles.tient("fenetres", "fenetre", clim)
    h = creer(reglage, {**OUVERTE, clim: FauxEtat("off", {"temperature": 17})})
    h.adopter("Chambre", clim, "consigne:20.0", "consigne:17.0")
    h.hass.states.table["binary_sensor.fen_chambre"] = FauxEtat("off")
    lancer(h._async_piece("Chambre"))
    assert h.hass.services.appels == [], "eteint a la main : on ne lui renvoie rien"


def test_une_coupure_adoptee_ne_se_rend_pas_par_dessus_un_geste(creer):
    f = creer(cfg_fil_pilote(), {**OUVERTE, SELECT: FauxEtat("eco", {"options": NODON})})
    f.adopter("Chambre", SELECT, "comfort", "eco")
    f.hass.states.table[SELECT] = FauxEtat("frost_protection", {"options": NODON})   # change a la main
    f.hass.states.table["binary_sensor.fen_chambre"] = FauxEtat("off")
    lancer(f._async_piece("Chambre"))
    assert f.hass.services.appels == [], "l'etat n'est plus celui que le moteur a laisse"


# ── Un ouvrant ou un radiateur renomme (audit du 19/10) ─────────────────────

class EvRegistre:
    def __init__(self, neuf, ancien, action="update"):
        self.data = {"action": action, "entity_id": neuf, "old_entity_id": ancien}


def test_la_regle_suit_un_ouvrant_et_un_radiateur_renommes(creer, module):
    """Renommes dans Home Assistant, ils disparaissaient de la piece en silence : la
    fenetre ne coupait plus, le radiateur n'etait plus coupe. La configuration suit,
    et une coupure en cours se rendra sous le nouveau nom."""
    f = creer(cfg_fil_pilote(), {**OUVERTE, SELECT: FauxEtat("comfort", {"options": NODON})})
    lancer(f._async_couper("Chambre"))
    neuf_rad, neuf_fen = "select.radiateur_chambre_2_pilot_wire_mode", "binary_sensor.fenetre_chambre_2"
    lancer(f._async_renommer(SELECT, neuf_rad))
    lancer(f._async_renommer("binary_sensor.fen_chambre", neuf_fen))
    piece = f.cfg["pieces"]["Chambre"]
    assert piece["chauffages"] == [neuf_rad] and piece["ouvrants"] == [neuf_fen]
    assert lancer(f.async_config())["pieces"]["Chambre"]["chauffages"] == [neuf_rad], "ecrit, et relu"
    assert f.coupes == {"Chambre": {neuf_rad: "comfort"}} and f.regles.tient("fenetres", "fenetre", neuf_rad)
    # La fermeture rend le radiateur, sous son nouveau nom.
    f.hass.states.table[neuf_rad] = FauxEtat("off", {"options": NODON})
    f.hass.states.table[neuf_fen] = FauxEtat("off")
    lancer(f._async_piece("Chambre"))
    assert f.hass.services.appels[-1] == ("select", "select_option", {"entity_id": [neuf_rad], "option": "comfort"})


def test_un_autre_renommage_ne_touche_pas_a_la_regle(creer, module):
    f = creer(cfg_fil_pilote(), {**OUVERTE})
    assert module.renommer_dans(f.cfg["pieces"], "light.salon", "light.salon_2") is False
    f._sur_registre(EvRegistre("light.salon_2", "light.salon"))
    f._sur_registre(EvRegistre(SELECT, None, action="create"))
    assert f.hass.taches == [] and f.cfg["pieces"]["Chambre"]["chauffages"] == [SELECT]


def test_un_capteur_muet_ne_dit_pas_refermee_au_moteur(creer):
    chef = FauxChef(pilotes=[SELECT])
    f = creer(cfg_fil_pilote(), {**OUVERTE, SELECT: FauxEtat("off", {"options": NODON})})
    f.hass.data = {"loggia": {"chauffage": chef}}
    lancer(f._async_couper("Chambre"))
    f.hass.states.table["binary_sensor.fen_chambre"] = FauxEtat("unavailable")
    lancer(f._async_piece("Chambre"))
    assert chef.faits == [(SELECT, "Chambre", True)]


def test_passe_au_planning_pendant_l_aeration_la_regle_ne_le_rend_pas(creer):
    chef = FauxChef()
    f = creer(cfg_fil_pilote(), {**OUVERTE, SELECT: FauxEtat("comfort", {"options": NODON})})
    f.hass.data = {"loggia": {"chauffage": chef}}
    lancer(f._async_couper("Chambre"))
    assert f.coupes == {"Chambre": {SELECT: "comfort"}}
    chef.pilotes.add(SELECT)                                  # le planning s'allume
    f.hass.states.table[SELECT] = FauxEtat("off", {"options": NODON})
    f.hass.states.table["binary_sensor.fen_chambre"] = FauxEtat("off")
    avant = len(f.hass.services.appels)
    lancer(f._async_piece("Chambre"))
    assert len(f.hass.services.appels) == avant, "c'est au moteur de le reprendre"
    assert not f.regles.tient("fenetres", "fenetre", SELECT), "la tenue est lachee"
    assert chef.faits[-1] == (SELECT, "Chambre", False)


def test_couper_la_regle_dit_au_moteur_que_tout_est_referme(creer):
    chef = FauxChef(pilotes=[SELECT])
    f = creer(cfg_fil_pilote(), {**OUVERTE, SELECT: FauxEtat("comfort", {"options": NODON})})
    f.hass.data = {"loggia": {"chauffage": chef}}
    lancer(f._async_couper("Chambre"))
    lancer(f.async_enregistrer({"actif": False}))
    assert chef.faits[-1] == (SELECT, "Chambre", False)


# -- Ce que la regle surveille, pour l'ecran du chauffage (plan 2, tache 10 bis B) --
#
# Une fenetre que la regle ne suit pas reste « fermee » pour toujours : la fiche du
# chauffage promettait une protection qui n'existait pas. Le moteur demande donc a
# la regle ce qu'elle surveille (`veille`), et l'ecran se tait ailleurs.
#
# TESTS RETIRES (relecture finale du 12/10, point 5) : la question isolee
# `surveille`, avec `surveilles` et `_table_des_modules`, n'avait plus que ces tests
# pour appelants. Ce qu'ils tenaient, `veille` le tient dessous : piece active avec
# un ouvrant, chauffage qu'aucune piece ne compte, regle coupee, interrupteur qui
# vaut son `select` (`maison_a_veiller`) ; le cas des deux pieces est reecrit ici.

def test_une_piece_inactive_ou_sans_ouvrant_ne_surveille_rien(creer):
    """REECRIT sur `veille` (relecture finale du 12/10, point 5) : il interrogeait `surveille`."""
    inactive = cfg()
    inactive["pieces"]["Chambre"]["actif"] = False
    assert creer(inactive, RADIATEUR).veille({}) == {}
    sans_ouvrant = cfg()
    sans_ouvrant["pieces"]["Chambre"]["ouvrants"] = []
    assert creer(sans_ouvrant, RADIATEUR).veille({}) == {}
    # Une autre piece, active, avec son ouvrant, qui compte le meme chauffage : il est surveille.
    deux = cfg()
    deux["pieces"]["Chambre"]["actif"] = False
    deux["pieces"]["Couloir"] = {"actif": True, "ouvrants": ["binary_sensor.fen_couloir"], "chauffages": ["switch.rad_chambre"]}
    assert creer(deux, {**RADIATEUR, "binary_sensor.fen_couloir": FauxEtat("off")}).veille({}) == {"switch.rad_chambre": False}


# -- Une question par etat du moteur (relecture du 12/10) ---------------------
#
# L'etat du moteur demandait `surveille` pour CHAQUE chauffage ; chaque question
# rebatissait les chauffages de chaque piece, et le `select` de chaque
# interrupteur se redemandait au moteur, qui refaisait toute sa reconnaissance.
# Il pose maintenant UNE question (`veille`), avec la table {interrupteur:
# select} qu'il a faite d'un seul passage ; la reponse dit aussi l'ouvrant
# MAINTENANT — le fait n'arrive qu'apres le delai, et se perd au redemarrage.

def maison_a_veiller():
    c = cfg()
    c["pieces"]["Chambre"]["chauffages"] = ["switch.radiateur_chambre", "switch.rad_chambre"]
    c["pieces"]["Salon"] = {"actif": True, "ouvrants": ["cover.baie_salon", "binary_sensor.fen_salon"],
                            "chauffages": ["climate.salon"]}
    c["pieces"]["Cuisine"] = {"actif": True, "ouvrants": ["binary_sensor.fen_cuisine"], "chauffages": ["climate.cuisine"]}
    c["pieces"]["Grenier"] = {"actif": False, "ouvrants": ["binary_sensor.fen_grenier"], "chauffages": ["climate.grenier"]}
    c["pieces"]["Cave"] = {"actif": True, "ouvrants": [], "chauffages": ["climate.cave"]}
    # Deux pieces sur le meme radiateur : ouvert si l'une l'est.
    c["pieces"]["Couloir"] = {"actif": True, "ouvrants": ["binary_sensor.fen_couloir"], "chauffages": ["climate.salon"]}
    etats = {**FERMEE, "cover.baie_salon": FauxEtat("opening"), "binary_sensor.fen_salon": FauxEtat("off"),
             "binary_sensor.fen_cuisine": FauxEtat("unavailable"), "binary_sensor.fen_grenier": FauxEtat("on"),
             "binary_sensor.fen_couloir": FauxEtat("off")}
    return c, etats


def test_la_veille_dit_ce_que_la_regle_surveille_et_ce_qu_elle_voit_maintenant(creer):
    """Surveille : piece active, avec des ouvrants, l'interrupteur d'un module valant son
    `select`. Ouvert comme pour couper (`ouvrants_ouverts`) : `opening` d'une baie compte, un
    capteur muet non. Avec la table du moteur, la regle ne lui redemande rien."""
    c, etats = maison_a_veiller()
    f = creer(c, etats)
    chef = FauxChef(modules={"switch.radiateur_chambre": SELECT})
    demandes = []
    vrai = chef.select_du_module
    chef.select_du_module = lambda haid: demandes.append(haid) or vrai(haid)
    f.hass.data = {"loggia": {"chauffage": chef}}
    attendu = {SELECT: False, "switch.rad_chambre": False, "climate.salon": True, "climate.cuisine": False}
    assert f.veille({"switch.radiateur_chambre": SELECT}) == attendu
    assert demandes == [], "la table du moteur suffit : rien ne se redemande, chauffage par chauffage"
    # ASSERTIONS RETIREES (relecture finale du 12/10, point 5) : `surveilles`, `veille()` sans
    # table — qui redemandait au moteur le `select` de chaque interrupteur (`_table_des_modules`)
    # — et `surveille` chauffage par chauffage. Plus rien hors des tests ne les appelait ; le
    # moteur passe toujours sa table. L'egalite ci-dessus dit deja ce que la boucle sur
    # `surveille` disait : le grenier (piece inactive), la cave (sans ouvrant) et
    # l'interrupteur n'y sont pas.
    f.hass.states.table["binary_sensor.fen_cuisine"] = FauxEtat("on")
    f.hass.states.table["cover.baie_salon"] = FauxEtat("closed")
    assert f.veille({"switch.radiateur_chambre": SELECT}) == {**attendu, "climate.salon": False, "climate.cuisine": True}


def test_regle_coupee_rien_a_veiller(creer):
    c, etats = maison_a_veiller()
    c["actif"] = False
    f = creer(c, etats)
    chef = FauxChef(modules={"switch.radiateur_chambre": SELECT})
    f.hass.data = {"loggia": {"chauffage": chef}}
    # ASSERTION MODIFIEE (relecture finale du 12/10, point 5) : `veille()` sans table et
    # `surveilles()` sont partis ; reste la question que pose le moteur, avec sa table.
    assert f.veille({"switch.radiateur_chambre": SELECT}) == {}


def test_la_regle_dit_si_elle_observe_sans_agir(creer):
    """Le moteur du chauffage publie ce drapeau (`fenetres_observe`) : hors planning, c'est la
    regle qui coupe — en observation, elle ne coupe rien."""
    assert creer(cfg()).observe() is False
    f = creer(cfg(simulation=True))
    assert f.observe() is True
    lancer(f.async_enregistrer({"simulation": False}))
    assert f.observe() is False


# -- Une fenetre deja ouverte quand l'integration demarre (relecture du 10/10) ----
#
# La regle ne reagit qu'aux CHANGEMENTS des ouvrants, et tout ce qu'elle sait
# (delais en cours, coupures, faits du moteur) vit en memoire : apres un
# rechargement de l'integration ou un redemarrage de Home Assistant, une fenetre
# restee ouverte etait oubliee, et le rattrapage du moteur rechauffait la piece.
# Une fois Home Assistant demarre, et apres chaque enregistrement, la regle
# revoit donc chaque piece comme si son ouvrant venait de changer.

@pytest.fixture
def demarrage(monkeypatch):
    """Home Assistant demarre encore : `async_at_started` garde les rappels."""
    import sys

    attendus = []
    monkeypatch.setattr(sys.modules["homeassistant.helpers.start"], "async_at_started",
                        lambda hass, rappel: attendus.append(rappel) or (lambda: None))
    return attendus


@pytest.fixture
def delais(monkeypatch):
    """Les delais que la regle demande a Home Assistant : [(secondes, rappel)]."""
    import sys

    poses = []
    monkeypatch.setattr(sys.modules["homeassistant.helpers.event"], "async_call_later",
                        lambda hass, delai, rappel: poses.append((delai, rappel)) or (lambda: None))
    return poses


def au_demarrage(f, demarrage):
    """Le module demarre, puis Home Assistant a fini de demarrer."""
    lancer(f._async_demarrer())
    attendus, demarrage[:] = list(demarrage), []
    for rappel in attendus:
        lancer(rappel(f.hass))


def ecouler(f, delais):
    """Le premier delai passe : son rappel part, et la coupure qu'il lance tourne."""
    _, rappel = delais.pop(0)
    rappel(None)
    taches, f.hass.taches = f.hass.taches, []
    for coro in taches:
        lancer(coro)


def test_une_fenetre_deja_ouverte_au_demarrage_donne_son_fait_au_moteur_apres_le_delai(creer, demarrage, delais):
    chef = FauxChef(pilotes=[SELECT])
    c = cfg_fil_pilote()
    c["delai"] = 3
    f = creer(c, {**OUVERTE, SELECT: FauxEtat("comfort", {"options": NODON})})
    f.hass.data = {"loggia": {"chauffage": chef}}
    lancer(f._async_demarrer())
    assert len(demarrage) == 1 and delais == [], "la revue attend la fin du demarrage de Home Assistant"
    lancer(demarrage[0](f.hass))
    assert [d for d, _ in delais] == [180] and chef.faits == [], "le delai recompte, le fait attend"
    ecouler(f, delais)
    assert chef.faits == [(SELECT, "Chambre", True)], "le moteur sait que la fenetre est ouverte"
    assert f.hass.services.appels == [] and f.coupes == {}, "la regle ne commande pas : c'est au moteur"


def test_une_fenetre_deja_ouverte_au_demarrage_coupe_ce_que_le_moteur_ne_pilote_pas(creer, demarrage):
    chef = FauxChef(pilotes=[SELECT])
    c = cfg()
    c["pieces"]["Chambre"]["chauffages"] = [SELECT, "switch.rad_chambre"]
    f = creer(c, {**OUVERTE, **RADIATEUR, SELECT: FauxEtat("comfort", {"options": NODON})})
    f.hass.data = {"loggia": {"chauffage": chef}}
    au_demarrage(f, demarrage)
    assert f.hass.services.appels == [("switch", "turn_off", {"entity_id": ["switch.rad_chambre"]})]
    assert f.coupes == {"Chambre": {"switch.rad_chambre": "on"}}
    assert (SELECT, "Chambre", True) in chef.faits, "le chauffage au planning, lui, est laisse au moteur"


def test_une_fenetre_fermee_au_demarrage_ne_fait_rien(creer, demarrage, delais):
    chef = FauxChef(pilotes=[SELECT])
    f = creer(cfg_fil_pilote(), {**FERMEE, SELECT: FauxEtat("comfort", {"options": NODON})})
    f.hass.data = {"loggia": {"chauffage": chef}}
    au_demarrage(f, demarrage)
    assert delais == [] and f._minuteurs == {} and f.coupes == {}
    assert f.hass.services.appels == []
    assert not any(ouverte for _, _, ouverte in chef.faits), "jamais 'ouverte' pour une fenetre fermee"


def test_la_regle_coupee_ne_revoit_rien_au_demarrage(creer, demarrage, delais):
    f = creer(cfg(actif=False), {**OUVERTE, **RADIATEUR})
    au_demarrage(f, demarrage)
    assert delais == [] and f.hass.services.appels == [] and f.coupes == {}, "une regle coupee ne coupe rien"


def test_revoir_plusieurs_fois_ne_double_arme_ni_ne_recoupe_rien(creer, demarrage, delais):
    c = cfg_fil_pilote()
    c["delai"] = 3
    f = creer(c, {**OUVERTE, SELECT: FauxEtat("comfort", {"options": NODON})})
    f.hass.data = {"loggia": {"chauffage": FauxChef(pilotes=[SELECT])}}
    au_demarrage(f, demarrage)
    lancer(f.async_enregistrer({"delai": 3}))
    lancer(f._async_revoir())
    assert [d for d, _ in delais] == [180], "un seul delai arme, quel que soit le nombre de revues"
    g = creer(cfg(), {**OUVERTE, **RADIATEUR})
    au_demarrage(g, demarrage)
    lancer(g.async_enregistrer({}))
    lancer(g._async_revoir())
    assert g.hass.services.appels == [("switch", "turn_off", {"entity_id": ["switch.rad_chambre"]})], \
        "ce qui est deja coupe ne l'est pas deux fois"


def test_enregistrer_revoit_les_pieces_une_fois_reabonne(creer, delais):
    c = cfg_fil_pilote()
    c["delai"] = 3
    c["pieces"]["Chambre"]["actif"] = False                   # la piece n'est pas encore suivie
    f = creer(c, {**OUVERTE, SELECT: FauxEtat("comfort", {"options": NODON})})
    f.hass.data = {"loggia": {"chauffage": FauxChef(pilotes=[SELECT])}}
    lancer(f.async_enregistrer({"pieces": {"Chambre": {"actif": True}}}))
    assert [d for d, _ in delais] == [180], "la fenetre deja ouverte est comptee des qu'on suit la piece"


def test_arreter_annule_l_attente_du_demarrage(creer, monkeypatch):
    import sys

    annules = []
    monkeypatch.setattr(sys.modules["homeassistant.helpers.start"], "async_at_started",
                        lambda hass, rappel: lambda: annules.append(rappel))
    f = creer(cfg(), {**OUVERTE, **RADIATEUR})
    lancer(f._async_demarrer())
    assert annules == []
    f.async_arreter()
    f.async_arreter()
    assert len(annules) == 1, "la revue du demarrage ne doit pas partir apres l'arret, ni etre annulee deux fois"


def test_une_piece_qui_echoue_ne_prive_ni_les_autres_ni_l_enregistrement(creer, delais, caplog):
    c = cfg_fil_pilote()
    c["delai"] = 3
    c["pieces"]["Salon"] = {"actif": True, "ouvrants": ["binary_sensor.fen_salon"], "chauffages": ["switch.rad_salon"]}
    f = creer(c, {**OUVERTE, "binary_sensor.fen_salon": FauxEtat("on"), "switch.rad_salon": FauxEtat("on"),
                  SELECT: FauxEtat("comfort", {"options": NODON})})
    vraie = f._async_piece

    async def piece(nom):
        if nom == "Chambre":
            raise RuntimeError("panne")
        await vraie(nom)

    f._async_piece = piece
    lancer(f.async_enregistrer({}))                           # ne leve pas : la configuration est ecrite
    assert [d for d, _ in delais] == [180], "le Salon est revu malgre la panne de la Chambre"
    assert "Chambre" in caplog.text, "la panne est ecrite au journal de Home Assistant"
