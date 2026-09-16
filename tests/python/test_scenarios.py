"""Tests des scenarios : ce que la maison fait d'un seul geste.

Ce qui vaut d'etre verrouille : les huit de Loggia et leur ordre, aucun geste
qui desarme ou deverrouille, la resolution au lancement (veilleuses
epargnees, entites de configuration ignorees, portees par piece et par
pieces de vie, un garage n'est pas un volet), le lancement qui part avec la
main de l'utilisateur, la reprise des scenes rapides d'avant, et les
mots-cles qui ne se trompent pas de scenario.
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

    def async_entity_ids(self, domaine=None):
        if domaine is None:
            return list(self.table)
        return [e for e in self.table if e.startswith(domaine + '.')]


class FauxServices:
    def __init__(self):
        self.appels = []

    async def async_call(self, domaine, service, data, blocking=False, context=None):
        self.appels.append((domaine, service, dict(data), context))


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


INDEX = {
    "areas": [{"id": "a_salon", "name": "Salon"}, {"id": "a_chambre", "name": "Chambre"},
              {"id": "a_sdb", "name": "Salle de bain"}],
    "devices": [{"id": "d_tv", "area": "a_salon"}],
    "entities": [
        {"id": "light.salon", "area": "a_salon"},
        {"id": "light.chambre", "area": "a_chambre"},
        {"id": "light.veilleuse", "area": "a_chambre"},
        {"id": "light.sdb", "area": "a_sdb"},
        # La diode d'une borne : entite de configuration, jamais une lampe.
        {"id": "light.borne_led", "area": None, "category": "config"},
        {"id": "cover.volet_salon", "area": "a_salon", "device_class": "shutter"},
        {"id": "cover.garage", "area": None, "device_class": "garage"},
        # La television n'a pas de zone : c'est son APPAREIL qui en a une.
        {"id": "media_player.tv", "device": "d_tv", "device_class": "tv"},
        {"id": "media_player.enceinte", "area": "a_salon", "device_class": "speaker"},
        {"id": "climate.salon", "area": "a_salon"},
        {"id": "climate.chambre", "area": "a_chambre"},
        {"id": "lock.entree", "area": None},
    ],
}


def etats_de_base(nuit=True):
    return {
        "sun.sun": FauxEtat("below_horizon" if nuit else "above_horizon"),
        "light.salon": FauxEtat("on"), "light.chambre": FauxEtat("on"),
        "light.veilleuse": FauxEtat("on"), "light.sdb": FauxEtat("off"),
        "light.borne_led": FauxEtat("on"),
        # Sans zone ni registre : une lampe de jardin ajoutee en YAML.
        "light.jardin": FauxEtat("on"),
        "cover.volet_salon": FauxEtat("open"), "cover.garage": FauxEtat("open"),
        "cover.volet_cuisine": FauxEtat("open"),
        "media_player.tv": FauxEtat("off", {"device_class": "tv"}),
        "media_player.enceinte": FauxEtat("playing"),
        "climate.salon": FauxEtat("heat", {"preset_modes": ["eco", "comfort"], "temperature": 21}),
        "climate.chambre": FauxEtat("heat", {"temperature": 19}),
        "lock.entree": FauxEtat("unlocked"),
        "alarm_control_panel.maison": FauxEtat("disarmed"),
        "scene.bonne_nuit": FauxEtat("2026-09-15T22:00:00+00:00", {"friendly_name": "Bonne nuit"}),
        "script.leaving_home": FauxEtat("off", {"friendly_name": "Leaving home"}),
        "script.kid_bedtime": FauxEtat("off", {"friendly_name": "Kid bedtime"}),
    }


@pytest.fixture
def module(monkeypatch):
    m = charger("scenarios")
    monkeypatch.setattr(m, "async_index", lambda hass, user=None: INDEX)
    return m


@pytest.fixture
def regles_module():
    return charger("regles")


@pytest.fixture
def creer(module, store_module, regles_module):
    faits = []

    def fabrique(config=None, etats=None, partage=None):
        magasin = store_module.LoggiaStore.__new__(store_module.LoggiaStore)
        shared = {"loggia_scenarios": config or {}}
        shared.update(partage or {})
        magasin._store = FauxStore({"users": {}, "shared": shared, "migrated": True})
        magasin._ancien = FauxStore(None)
        magasin._data = None
        magasin._lock = asyncio.Lock()

        s = module.LoggiaScenarios.__new__(module.LoggiaScenarios)
        s.hass = FauxHass(etats if etats is not None else etats_de_base())
        s.store = magasin
        s._derniers = {}
        s.regles = regles_module.Regles(s.hass, magasin)
        s.regles._depot = FauxStore(None)
        faits.append(s)
        return s

    yield fabrique
    for s in faits:
        s.hass.abandonner()


# ── Les huit de Loggia ──────────────────────────────────────────────────────

def test_les_huit_de_loggia_dans_l_ordre(module):
    liste = module.effectifs(module.config_vide())
    assert [s["id"] for s in liste] == ["reveil", "depart", "retour", "nuit", "cinema",
                                        "musique", "invites", "tout_eteindre"]
    for s in liste:
        assert s["integre"] and s["accueil"] and not s["masque"] and not s["modifie"]
        assert s["actions"], s["id"]
        assert s["lien"] is None


def test_aucun_geste_ne_desarme_ni_ne_deverrouille(module):
    tous = [g for gestes in module.GESTES.values() for g in gestes]
    assert "desarmer" not in tous and "deverrouiller" not in tous
    assert set(module.GESTES["alarme"]) == {"absent", "nuit", "maison"}
    assert module.GESTES["serrures"] == ("verrouiller",)
    for s in module.INTEGRES:
        for a in s["actions"]:
            assert a["geste"] in module.GESTES[a["famille"]]


def test_je_rentre_ne_touche_pas_a_l_alarme(module):
    retour = next(s for s in module.INTEGRES if s["id"] == "retour")
    assert all(a["famille"] != "alarme" for a in retour["actions"])


# ── Valider ce que l'ecran envoie ───────────────────────────────────────────

def test_une_action_inconnue_est_refusee(module):
    with pytest.raises(ValueError):
        module.valider_action({"famille": "piscine", "geste": "vider"})
    with pytest.raises(ValueError):
        module.valider_action({"famille": "alarme", "geste": "desarmer"})
    with pytest.raises(ValueError):
        module.valider_action({"famille": "lumieres", "geste": "eteindre", "portee": "rue"})
    with pytest.raises(ValueError):
        module.valider_action({"famille": "lumieres", "geste": "allumer", "si": "pluie"})


def test_une_valeur_reste_dans_ses_bornes(module):
    a = module.valider_action({"famille": "lumieres", "geste": "allumer", "valeur": 250})
    assert a["valeur"] == 100
    b = module.valider_action({"famille": "chauffage", "geste": "eco", "valeur": 2, "piece": " Salon "})
    assert b["valeur"] == 5 and b["piece"] == "Salon"
    c = module.valider_action({"famille": "volets", "geste": "fermer", "valeur": 3})
    assert "valeur" not in c


def test_un_scenario_se_nettoie(module):
    s = module.valider_scenario({"nom": "  Apéro  ", "icone": "Glass-Cheers", "teinte": "tendre",
                                 "lien": None, "actions": [{"famille": "medias", "geste": "lecture"}]})
    assert s == {"nom": "Apéro", "icone": "glass-cheers", "teinte": "tendre", "lien": None,
                 "actions": [{"famille": "medias", "geste": "lecture", "portee": "maison"}]}
    with pytest.raises(ValueError):
        module.valider_scenario({"teinte": "fuchsia"})
    with pytest.raises(ValueError):
        module.valider_scenario({"lien": "light.salon"})
    with pytest.raises(ValueError):
        module.valider_scenario({"id": "Pas Un Slug"})
    with pytest.raises(ValueError):
        module.valider_scenario({"actions": [{"famille": "volets", "geste": "fermer"}] * 13})


# ── Enregistrer, supprimer, remettre d'origine, ordonner ────────────────────

def test_un_scenario_de_loggia_se_modifie_et_se_remet_d_origine(creer, module):
    s = creer()
    lancer(s.async_enregistrer({"enregistrer": {"id": "nuit", "nom": "Dodo", "teinte": "vert",
                                                "actions": [{"famille": "volets", "geste": "fermer"}]}}))
    nuit = next(x for x in module.effectifs(lancer(s.async_config())) if x["id"] == "nuit")
    assert nuit["nom"] == "Dodo" and nuit["teinte"] == "vert" and nuit["modifie"]
    assert nuit["actions"] == [{"famille": "volets", "geste": "fermer", "portee": "maison"}]
    # Les actions remises a None : celles d'origine, le nom reste.
    lancer(s.async_enregistrer({"enregistrer": {"id": "nuit", "actions": None}}))
    nuit = next(x for x in module.effectifs(lancer(s.async_config())) if x["id"] == "nuit")
    assert nuit["nom"] == "Dodo" and len(nuit["actions"]) == 5
    lancer(s.async_enregistrer({"reinitialiser": "nuit"}))
    nuit = next(x for x in module.effectifs(lancer(s.async_config())) if x["id"] == "nuit")
    assert nuit["nom"] is None and nuit["teinte"] == "chambre" and not nuit["modifie"]


def test_un_scenario_personnel_a_un_identifiant_unique(creer, module):
    s = creer()
    lancer(s.async_enregistrer({"enregistrer": {"nom": "Apéro", "icone": "glass-cheers",
                                                "actions": [{"famille": "medias", "geste": "lecture"}]}}))
    lancer(s.async_enregistrer({"enregistrer": {"nom": "Apéro", "lien": "scene.bonne_nuit"}}))
    ids = [x["id"] for x in module.effectifs(lancer(s.async_config()))]
    assert ids[-2:] == ["perso_apero", "perso_apero_2"]
    lancer(s.async_enregistrer({"enregistrer": {"id": "perso_apero", "nom": "Apéro du soir"}}))
    perso = next(x for x in module.effectifs(lancer(s.async_config())) if x["id"] == "perso_apero")
    assert perso["nom"] == "Apéro du soir" and not perso["integre"]
    lancer(s.async_enregistrer({"supprimer": "perso_apero"}))
    assert "perso_apero" not in [x["id"] for x in module.effectifs(lancer(s.async_config()))]
    with pytest.raises(ValueError):
        lancer(s.async_enregistrer({"supprimer": "nuit"}))


def test_l_ordre_choisi_s_applique_et_ignore_l_inconnu(creer, module):
    s = creer()
    lancer(s.async_enregistrer({"ordre": ["cinema", "fantome", "nuit"]}))
    ids = [x["id"] for x in module.effectifs(lancer(s.async_config()))]
    assert ids[:2] == ["cinema", "nuit"] and len(ids) == 8
    assert lancer(s.async_config())["ordre"] == ["cinema", "nuit"]


# ── Resoudre au lancement ───────────────────────────────────────────────────

def test_les_lumieres_de_la_maison_moins_les_veilleuses_et_la_configuration(creer, module):
    s = creer(partage={"loggia_nuit": {"veilleuse": {"actif": True, "lampes": ["light.veilleuse"]}}})
    maison = s.inventaire()
    assert "light.borne_led" not in maison["entites"], "une entite de configuration n'est pas une lampe"
    action = {"famille": "lumieres", "geste": "eteindre", "portee": "maison", "sauf_veilleuses": True}
    assert module.cibles(action, maison, None, lancer(s._veilleuses())) == ["light.chambre", "light.jardin", "light.salon"]
    # Sans epargne, la veilleuse y passe ; une lampe eteinte, jamais.
    assert module.cibles({"famille": "lumieres", "geste": "eteindre", "portee": "maison"}, maison, None) \
        == ["light.chambre", "light.jardin", "light.salon", "light.veilleuse"]


def test_la_piece_suit_la_zone_de_l_entite_ou_de_son_appareil(creer, module):
    s = creer()
    maison = s.inventaire()
    cinema = next(x for x in module.effectifs(module.config_vide()) if x["id"] == "cinema")
    assert module.piece_de(cinema, maison) == "Salon", "la piece de la television, via son appareil"
    assert module.cibles({"famille": "medias", "geste": "allumer_tv", "portee": "piece"}, maison, "Salon") \
        == ["media_player.tv"]
    assert module.cibles({"famille": "lumieres", "geste": "allumer", "portee": "piece", "valeur": 10}, maison, "salon") \
        == ["light.salon"], "la piece se compare sans casse"
    musique = next(x for x in module.effectifs(module.config_vide()) if x["id"] == "musique")
    assert module.piece_de(musique, maison) == "Salon"
    assert module.piece_de({**musique, "piece": "Chambre"}, maison) == "Chambre", "le choix de l'utilisateur prime"


def test_les_pieces_de_vie_excluent_chambre_bain_et_sans_piece(creer, module):
    s = creer()
    maison = s.inventaire()
    action = {"famille": "lumieres", "geste": "allumer", "portee": "vie", "valeur": 60, "si": "nuit"}
    assert module.cibles(action, maison, None, nuit=True) == ["light.salon"]
    assert module.cibles(action, maison, None, nuit=False) == [], "« s'il fait nuit » : en plein jour, rien"


def test_un_garage_n_est_pas_un_volet(creer, module):
    s = creer()
    maison = s.inventaire()
    assert module.cibles({"famille": "volets", "geste": "fermer", "portee": "maison"}, maison, None) \
        == ["cover.volet_cuisine", "cover.volet_salon"]


def test_les_medias_selon_le_geste(creer, module):
    s = creer()
    maison = s.inventaire()

    def c(geste, piece=None):
        return module.cibles({"famille": "medias", "geste": geste,
                              "portee": "piece" if piece else "maison"}, maison, piece)

    assert c("pause") == ["media_player.enceinte"], "on ne met en pause que ce qui joue"
    assert c("eteindre") == ["media_player.enceinte"], "la television est deja eteinte"
    assert c("lecture", "Salon") == [], "l'enceinte joue deja, la television n'est pas une enceinte"
    assert c("allumer_tv", "Salon") == ["media_player.tv"]


# ── Lancer ──────────────────────────────────────────────────────────────────

def test_lancer_un_scenario_compose_part_avec_la_main_de_l_utilisateur(creer):
    s = creer()
    r = lancer(s.async_lancer("depart", user_id="u1"))
    appels = s.hass.services.appels
    assert all(ctx is not None and ctx.user_id == "u1" for *_, ctx in appels), "une main, pas une regle"
    par_service = {(d, sv): data for d, sv, data, _ in appels}
    assert par_service[("light", "turn_off")]["entity_id"] == ["light.chambre", "light.jardin", "light.salon", "light.veilleuse"]
    assert par_service[("media_player", "turn_off")]["entity_id"] == ["media_player.enceinte"]
    assert par_service[("climate", "set_preset_mode")] == {"entity_id": ["climate.salon"], "preset_mode": "eco"}
    assert par_service[("climate", "set_temperature")] == {"entity_id": ["climate.chambre"], "temperature": 17.0}
    assert par_service[("alarm_control_panel", "alarm_arm_away")]["entity_id"] == ["alarm_control_panel.maison"]
    assert par_service[("lock", "lock")]["entity_id"] == ["lock.entree"]
    assert r["id"] == "depart" and r["n"] == 9
    assert [f["famille"] for f in r["fait"]] == ["lumieres", "medias", "chauffage", "alarme", "serrures"]
    journal = lancer(s.regles.journal(module="scenarios"))
    assert journal and journal[0]["regle"] == "depart" and journal[0]["n"] == 9 and journal[0]["motif"] == "compose"
    assert s._derniers["depart"] > 0


def test_lancer_un_scenario_lie_ne_lance_que_la_scene(creer):
    s = creer(config={"integres": {"nuit": {"lien": "scene.bonne_nuit"}}})
    r = lancer(s.async_lancer("nuit", user_id="u1"))
    assert [(d, sv, data) for d, sv, data, _ in s.hass.services.appels] == \
        [("scene", "turn_on", {"entity_id": ["scene.bonne_nuit"]})]
    assert r["fait"] == [{"famille": "lien", "geste": "scene", "n": 1}] and r["n"] == 1


def test_en_plein_jour_les_lumieres_du_reveil_ne_s_allument_pas(creer):
    etats = etats_de_base(nuit=False)
    etats["cover.volet_salon"] = FauxEtat("closed")
    s = creer(etats=etats)
    lancer(s.async_lancer("reveil"))
    services = [(d, sv) for d, sv, _, _ in s.hass.services.appels]
    assert ("cover", "open_cover") in services and ("light", "turn_on") not in services


def test_un_scenario_inconnu_ne_fait_rien(creer):
    s = creer()
    assert lancer(s.async_lancer("fantome")) is None
    assert s.hass.services.appels == []


# ── Ce que l'ecran lit ──────────────────────────────────────────────────────

def test_l_etat_resume_suggere_et_liste(creer):
    s = creer(partage={"loggia_nuit": {"veilleuse": {"actif": True, "lampes": ["light.veilleuse"]}}})
    etat = lancer(s.async_etat())
    par_id = {x["id"]: x for x in etat["scenarios"]}
    nuit = par_id["nuit"]
    assert [(r["famille"], r["n"]) for r in nuit["resume"]] == \
        [("lumieres", 3), ("volets", 2), ("medias", 1), ("alarme", 1), ("serrures", 1)]
    assert nuit["suggestion"] == "scene.bonne_nuit", "good_night bat bedtime"
    assert par_id["depart"]["suggestion"] == "script.leaving_home"
    assert par_id["retour"]["suggestion"] is None, "« home » seul n'est le mot de personne"
    assert par_id["cinema"]["piece_effective"] == "Salon"
    assert [x["haid"] for x in etat["liens"]] == ["scene.bonne_nuit", "script.kid_bedtime", "script.leaving_home"]
    assert etat["pieces"] == ["Chambre", "Salle de bain", "Salon"]
    assert etat["alarme"] == "alarm_control_panel.maison"
    assert "piece_auto" not in nuit


def test_l_alarme_choisie_dans_parametres_prime(creer):
    etats = etats_de_base()
    etats["alarm_control_panel.autre"] = FauxEtat("disarmed")
    s = creer(etats=etats, partage={"loggia_alarm": "alarm_control_panel.autre"})
    assert lancer(s._alarme(s.inventaire())) == "alarm_control_panel.autre"
    t = creer(partage={"loggia_presence": {"depart": {"alarme": {"entite": "alarm_control_panel.maison"}}}})
    assert lancer(t._alarme(t.inventaire())) == "alarm_control_panel.maison"


def test_le_dernier_lancement_vient_du_lien_ou_de_la_memoire(creer):
    s = creer(config={"integres": {"nuit": {"lien": "scene.bonne_nuit"}}})
    etat = lancer(s.async_etat())
    par_id = {x["id"]: x for x in etat["scenarios"]}
    assert par_id["nuit"]["dernier"] == 1789509600.0, "l'etat ISO de la scene, en secondes"
    assert par_id["depart"]["dernier"] is None
    lancer(s.async_lancer("depart"))
    assert lancer(s.async_etat())["scenarios"][1]["dernier"] > 1789509600.0


# ── La reprise des scenes rapides ───────────────────────────────────────────

def test_les_scenes_rapides_d_avant_deviennent_des_scenarios_lies(creer, module):
    anciennes = [
        {"name": "Nuit", "haid": "scene.bonne_nuit", "icon": "moon"},
        {"name": "Départ", "haid": "script.leaving_home"},
        {"name": "Arrosage", "haid": "scene.arrosage", "icon": "leaf"},
        {"name": "Cassée", "haid": "light.salon"},
    ]
    s = creer(partage={"loggia_quickscenes": anciennes})
    cfg = lancer(s.async_migrer())
    assert cfg["integres"]["nuit"] == {"lien": "scene.bonne_nuit"}
    assert cfg["integres"]["depart"] == {"lien": "script.leaving_home"}
    assert cfg["persos"] == [{"id": "perso_arrosage", "nom": "Arrosage", "icone": "leaf", "teinte": "accent",
                              "lien": "scene.arrosage", "actions": []}]
    assert cfg["migre"]
    # Une seule fois : relancer ne recree rien.
    lancer(s.async_enregistrer({"supprimer": "perso_arrosage"}))
    assert lancer(s.async_migrer())["persos"] == []


def test_les_mots_cles_ne_se_trompent_pas_de_scenario(module):
    m = module.meilleur_integre
    assert m("script.leaving_home") == "depart"
    assert m("script.coming_home") == "retour"
    assert m("script.good_night") == "nuit"
    assert m("script.movie_mode") == "cinema"
    assert m("script.morning_routine") == "reveil"
    assert m("scene.x", "Soirée film") == "cinema"
    assert m("scene.arrosage") is None
    assert m("script.good_night", exclus={"nuit"}) is None
    nuit = next(s for s in module.INTEGRES if s["id"] == "nuit")
    assert module.score_integre(nuit, "good_night") > module.score_integre(nuit, "kid_bedtime")
    assert module.normaliser("Bonne nuit !") == "bonne_nuit" and module.slug("Apéro du soir") == "apero_du_soir"
