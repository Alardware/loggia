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
        # Sans registre, sa classe vient de l'etat. Elle COMPTE depuis le 03/10 :
        # une classe absente n'est plus un volet (ouvrants.py).
        "cover.volet_cuisine": FauxEtat("open", {"device_class": "shutter"}),
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


def test_ranger_n_accepte_que_des_scenarios_connus_et_rien_d_autre(creer, module):
    """La porte ouverte a tout compte (`loggia/scenarios/ordre`, audit du
    03/10). Un inconnu fait TOUT refuser en se nommant, un doublon aussi ; ce
    qui est accepte ne change que l'ordre."""
    s = creer({"persos": [{"id": "perso_apero", "nom": "Apéro", "actions": []}],
               "integres": {"nuit": {"nom": "Dodo"}}, "migre": True})
    avant = lancer(s.async_config())
    with pytest.raises(module.ScenariosInconnusError) as refus:
        lancer(s.async_ordonner(["cinema", "fantome", "nuit"]))
    assert refus.value.idents == ["fantome"] and "fantome" in str(refus.value)
    for mauvais in (["nuit", "cinema", "nuit"], "cinema", ["cinema", 3], None):
        with pytest.raises(ValueError):
            lancer(s.async_ordonner(mauvais))
    assert lancer(s.async_config()) == avant, "un ordre refuse a quand meme ete ecrit"
    assert lancer(s.async_ordonner(["perso_apero", "cinema"]))["ordre"] == ["perso_apero", "cinema"]
    apres = lancer(s.async_config())
    assert [x["id"] for x in module.effectifs(apres)][:2] == ["perso_apero", "cinema"]
    # Rien d'autre ne bouge : ni les scenarios de Loggia, ni les siens.
    assert {k: v for k, v in apres.items() if k != "ordre"} == {k: v for k, v in avant.items() if k != "ordre"}


def test_ranger_pendant_qu_un_administrateur_ajoute_ne_perd_rien(creer):
    """Ranger est ouvert a tout compte (audit du 03/10). Lu avant l'ajout et
    ecrit apres lui, l'ordre emportait le scenario qu'un administrateur venait
    de creer : le verrou du magasin ne couvrait que l'ecriture."""
    s = creer()

    async def ensemble():
        await asyncio.gather(s.async_enregistrer({"enregistrer": {"nom": "Apéro"}}),
                             s.async_ordonner(["cinema", "nuit"]))

    lancer(ensemble())
    cfg = lancer(s.async_config())
    assert [p["id"] for p in cfg["persos"]] == ["perso_apero"], "ranger a efface le scenario ajoute au meme moment"
    assert cfg["ordre"] == ["cinema", "nuit"]


# ── Resoudre au lancement ───────────────────────────────────────────────────

def test_les_lumieres_de_la_maison_moins_les_veilleuses_et_la_configuration(creer, module):
    s = creer(partage={"loggia_nuit": {"veilleuse": {"actif": True, "lampes": ["light.veilleuse"]}}})
    maison = s.inventaire()
    assert "light.borne_led" not in maison["entites"], "une entite de configuration n'est pas une lampe"
    action = {"famille": "lumieres", "geste": "eteindre", "portee": "maison", "sauf_veilleuses": True}
    assert module.cibles(action, maison, None, lancer(s._veilleuses())) == ["light.chambre", "light.jardin", "light.salon"]
    # Sans veilleuse CONNUE (la regle Nuit pas lue), la veilleuse y passe ; une lampe eteinte, jamais.
    # Connue, elle est epargnee que l'option soit cochee ou non (retouches du 19/10, R6 : voir plus bas).
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


def test_un_volet_qui_ne_fait_que_s_incliner_reste_hors_de_l_ordre_groupe(module):
    """Audit du 19/10 (point 11) : sans OPEN ni CLOSE dans `supported_features`,
    il ferait refuser l'appel groupe entier. Sans `supported_features`, on ne
    sait pas : il reste."""
    maison = {"entites": {
        "cover.salon": {"etat": "open", "classe": "shutter", "attrs": {"supported_features": 15}},
        "cover.lames": {"etat": "open", "classe": "blind", "attrs": {"supported_features": 16 | 32 | 128}},
        "cover.simple": {"etat": "open", "classe": "shutter", "attrs": {}},
    }}
    assert module.cibles({"famille": "volets", "geste": "fermer", "portee": "maison"}, maison, None) \
        == ["cover.salon", "cover.simple"]


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


# ── Les permissions d'entite du compte qui lance (audit 18/09) ─────────────

class _Permissions:
    def __init__(self, refusees):
        self.refusees = set(refusees)

    def check_entity(self, entity_id, cle):
        assert cle == "control"
        return entity_id not in self.refusees


class _Compte:
    def __init__(self, is_admin=False, refusees=(), sans_politique=False):
        self.is_admin = is_admin
        self.permissions = None if sans_politique else _Permissions(refusees)


def test_controle_de_ne_filtre_que_les_comptes_restreints(module):
    assert module.controle_de(None) is None
    assert module.controle_de(_Compte(is_admin=True, refusees=["light.salon"])) is None, "un administrateur n'est jamais filtre"
    assert module.controle_de(_Compte(sans_politique=True)) is None, "sans politique d'entites, tout est permis"
    ctrl = module.controle_de(_Compte(refusees=["light.salon"]))
    assert ctrl("light.salon") is False and ctrl("light.chambre") is True
    assert module.filtrer_autorisees(["a", "b"], None) == (["a", "b"], [])
    assert module.filtrer_autorisees(["light.salon", "light.chambre"], ctrl) == (["light.chambre"], ["light.salon"])


def test_un_compte_restreint_ne_pilote_pas_par_scenario_ce_qu_on_lui_refuse(creer, module):
    s = creer()
    ctrl = module.controle_de(_Compte(refusees=["light.salon", "lock.entree", "alarm_control_panel.maison"]))
    r = lancer(s.async_lancer("depart", user_id="u2", controle=ctrl))
    touchees = [h for _, _, data, _ in s.hass.services.appels for h in data["entity_id"]]
    assert "light.salon" not in touchees and "lock.entree" not in touchees and "alarm_control_panel.maison" not in touchees
    assert "light.chambre" in touchees, "le reste part quand meme"
    assert r["refusees"] == 3 and r["n"] == 6
    journal = lancer(s.regles.journal(module="scenarios"))
    assert "3 cible(s) refusee(s)" in journal[0]["detail"], "le journal dit ce qui a ete retenu"
    # Sans restriction : rien ne change.
    s2 = creer()
    r2 = lancer(s2.async_lancer("depart", user_id="u1"))
    assert r2["n"] == 9 and r2["refusees"] == 0


def test_un_scenario_lie_refuse_ne_part_pas(creer, module):
    s = creer(config={"integres": {"nuit": {"lien": "scene.bonne_nuit"}}})
    ctrl = module.controle_de(_Compte(refusees=["scene.bonne_nuit"]))
    r = lancer(s.async_lancer("nuit", user_id="u2", controle=ctrl))
    assert s.hass.services.appels == [], "la scene n'est pas lancee"
    assert r["n"] == 0 and r["refusees"] == 1 and r["fait"] == [{"famille": "lien", "geste": "scene", "n": 0}]


# ─────────────────────────────────────────────────────────────────────────────
# Une seule idee de la lumiere de la maison (audit du 19/10, ADR 0260) : la
# famille « lumieres » d'un scenario, c'est la definition commune - l'interrupteur
# declare lumiere compris, par SON service -, et « sauf les veilleuses » epargne
# aussi le groupe qui en contient une.
# ─────────────────────────────────────────────────────────────────────────────

EXTERIEUR = "switch.lumiere_exterieur"
NUIT_LINO = {"loggia_nuit": {"veilleuse": {"actif": True, "lampes": ["light.veilleuse"]}}}


def etats_avec_groupe_et_interrupteur():
    return {**etats_de_base(),
            "light.chambre_tout": FauxEtat("on", {"entity_id": ["light.chambre", "light.veilleuse"]}),
            EXTERIEUR: FauxEtat("on"), "switch.prise_nas": FauxEtat("on")}


def test_sauf_les_veilleuses_epargne_aussi_le_groupe_qui_en_contient_une(creer, module):
    s = creer(partage=NUIT_LINO, etats=etats_avec_groupe_et_interrupteur())
    maison = s.inventaire()
    action = {"famille": "lumieres", "geste": "eteindre", "portee": "maison", "sauf_veilleuses": True}
    assert module.cibles(action, maison, None, lancer(s._veilleuses())) == ["light.chambre", "light.jardin", "light.salon"]
    # Sans epargne, le groupe y passe avec les autres - et le contexte complet l'efface devant ses membres.
    assert "light.chambre_tout" in module.cibles(dict(action, sauf_veilleuses=False), maison, None, [])
    c = lancer(s._contexte())
    assert "light.chambre_tout" not in c["maison"]["lumieres"]
    assert module.cibles(dict(action, sauf_veilleuses=False), c["maison"], None, []) == [
        "light.chambre", "light.jardin", "light.salon", "light.veilleuse"]


def test_la_famille_lumieres_compte_l_interrupteur_declare_par_son_service(creer, module):
    s = creer(partage={**NUIT_LINO, "loggia_switchlights": [EXTERIEUR]}, etats=etats_avec_groupe_et_interrupteur())
    c = lancer(s._contexte())
    assert EXTERIEUR in c["maison"]["lumieres"] and "switch.prise_nas" not in c["maison"]["lumieres"]
    assert c["maison"]["entites"][EXTERIEUR]["etat"] == "on"
    action = {"famille": "lumieres", "geste": "eteindre", "portee": "maison", "sauf_veilleuses": True}
    haids = module.cibles(action, c["maison"], None, c["veilleuses"])
    assert haids == ["light.chambre", "light.jardin", "light.salon", EXTERIEUR]
    assert module.ordres(action, haids, c["maison"]) == [
        ("light", "turn_off", ["light.chambre", "light.jardin", "light.salon"], {}),
        ("homeassistant", "turn_off", [EXTERIEUR], {}),
    ]
    allumer = {"famille": "lumieres", "geste": "allumer", "portee": "maison", "valeur": 40}
    assert module.ordres(allumer, ["light.salon", EXTERIEUR], c["maison"]) == [
        ("light", "turn_on", ["light.salon"], {"brightness_pct": 40}),
        ("homeassistant", "turn_on", [EXTERIEUR], {}),
    ]
    # Lance : les deux ordres partent, le compte dit les vraies lampes.
    r = lancer(s.async_lancer("nuit", user_id="u1"))
    par_service = {(d, sv): data for d, sv, data, _ in s.hass.services.appels}
    assert par_service[("light", "turn_off")]["entity_id"] == ["light.chambre", "light.jardin", "light.salon"]
    assert par_service[("homeassistant", "turn_off")]["entity_id"] == [EXTERIEUR]
    assert next(f for f in r["fait"] if f["famille"] == "lumieres")["n"] == 4
    # Le resume de l'etat compte de meme.
    etat = lancer(s.async_etat())
    nuit = next(x for x in etat["scenarios"] if x["id"] == "nuit")
    assert nuit["resume"][0] == {"famille": "lumieres", "geste": "eteindre", "portee": "maison", "piece": None,
                                 "valeur": None, "si": None, "n": 4}


def test_une_veilleuse_absente_ou_une_liste_vide_ne_genent_pas_un_scenario(creer, module):
    action = {"famille": "lumieres", "geste": "eteindre", "portee": "maison", "sauf_veilleuses": True}
    s = creer(partage={"loggia_nuit": {"veilleuse": {"lampes": ["light.partie", 5]}}})
    c = lancer(s._contexte())
    assert module.cibles(action, c["maison"], None, c["veilleuses"]) == [
        "light.chambre", "light.jardin", "light.salon", "light.veilleuse"]
    s = creer(partage={"loggia_nuit": {"veilleuse": {"lampes": []}}})
    c = lancer(s._contexte())
    assert "light.veilleuse" in module.cibles(action, c["maison"], None, c["veilleuses"])


# ── Les veilleuses sont epargnees PARTOUT (retouches du 19/10, R6) ────────

def test_une_extinction_par_un_scenario_epargne_toujours_les_veilleuses(creer, module):
    """Sa decision : une EXTINCTION de la famille lumieres epargne la veilleuse
    de la regle Nuit - et le groupe qui en contient une -, que l'option « sauf
    les veilleuses » soit cochee ou non. Un ALLUMAGE n'est pas concerne."""
    s = creer(partage=NUIT_LINO, etats=etats_avec_groupe_et_interrupteur())
    c = lancer(s._contexte())
    sans_option = {"famille": "lumieres", "geste": "eteindre", "portee": "maison"}
    assert module.cibles(sans_option, c["maison"], None, c["veilleuses"]) == ["light.chambre", "light.jardin", "light.salon"]
    assert module.cibles(dict(sans_option, sauf_veilleuses=False), c["maison"], None, c["veilleuses"]) == [
        "light.chambre", "light.jardin", "light.salon"], "l'option a faux ne change rien"
    # Sur l'inventaire seul, le groupe qui contient la veilleuse est epargne lui aussi.
    maison = s.inventaire()
    haids = module.cibles(sans_option, maison, None, lancer(s._veilleuses()))
    assert "light.veilleuse" not in haids and "light.chambre_tout" not in haids
    # Un allumage : la veilleuse est une cible comme une autre.
    allumer = {"famille": "lumieres", "geste": "allumer", "portee": "maison", "valeur": 20}
    assert "light.veilleuse" in module.cibles(allumer, c["maison"], None, c["veilleuses"])
    # Lance : « Je pars » (sans l'option) n'eteint pas la veilleuse, et le resume compte de meme.
    r = lancer(s.async_lancer("depart", user_id="u1"))
    eteints = [h for d, sv, data, _ in s.hass.services.appels if sv == "turn_off" for h in data["entity_id"]]
    assert "light.veilleuse" not in eteints and "light.chambre" in eteints
    assert next(f for f in r["fait"] if f["famille"] == "lumieres")["n"] == 3
    etat = lancer(s.async_etat())
    depart = next(x for x in etat["scenarios"] if x["id"] == "depart")
    assert depart["resume"][0]["n"] == 3, "le resume dit ce qui partira vraiment"


def test_ouvrir_ou_fermer_selon_la_position_pas_seulement_l_etat(module):
    """Audit du 19/10 : un scenario « ouvrir » sautait tout volet publie
    `open` — meme a 30 % (baisse par la protection solaire) ou a 1 % (sa
    chambre qui bute). Le verdict est celui de l'ecran (V12) : deux pour cent
    aux deux bouts, et `closed` fait foi."""
    def v(etat, pos=None, classe="shutter"):
        attrs = {} if pos is None else {"current_position": pos}
        return {"piece": None, "classe": classe, "etat": etat, "attrs": attrs, "nom": "x"}
    maison = {"zones": {}, "entites": {
        "cover.a_30": v("open", 30),
        "cover.b_1": v("open", 1),
        "cover.c_100": v("open", 100),
        "cover.d_99": v("open", 99),
        "cover.e_sans_position": v("open"),
        "cover.f_ferme": v("closed", 0),
        "cover.g_ferme_perime": v("closed", 100),   # Netatmo : l'etat bascule, la position suit 1 a 3 min apres
        "cover.h_garage": v("open", 40, "garage"),
    }}
    ouvrir = {"famille": "volets", "geste": "ouvrir", "portee": "maison"}
    fermer = {"famille": "volets", "geste": "fermer", "portee": "maison"}
    assert module.cibles(ouvrir, maison, None) == ["cover.a_30", "cover.b_1", "cover.f_ferme", "cover.g_ferme_perime"]
    assert module.cibles(fermer, maison, None) == ["cover.a_30", "cover.c_100", "cover.d_99", "cover.e_sans_position"]


# ── Fondu et blanc dans les scenarios (chantier G5, ADR 0304) ───────────────

class FauxCarnet:
    """Le carnet des lumieres (`lumieres.py`) : ce qu'on lui annonce."""

    def __init__(self):
        self.annonces = []
        self.origines = []

    def annoncer_fondu(self, haids, duree, eteindre, qui=None, origine=None):
        self.annonces.append((sorted(haids), duree, eteindre, qui))
        self.origines.append(origine)


def etats_fondu():
    """Le salon : une Hue qui sait fondre et le blanc (2 000 a 6 535 K) ; la
    chambre : un variateur sans fondu, une ampoule blanche bornee (2 700 a 4 000 K)
    qui sait fondre ; le jardin : un ruban couleur, sans bornes ; l'interrupteur
    declare lumiere. Tout est allume."""
    return {**etats_de_base(),
            "light.salon": FauxEtat("on", {"supported_features": 44, "supported_color_modes": ["color_temp", "xy"],
                                           "min_color_temp_kelvin": 2000, "max_color_temp_kelvin": 6535}),
            "light.chambre": FauxEtat("on", {"supported_color_modes": ["brightness"]}),
            "light.sdb": FauxEtat("on", {"supported_features": 32, "supported_color_modes": ["color_temp"],
                                         "min_color_temp_kelvin": 2700, "max_color_temp_kelvin": 4000}),
            "light.jardin": FauxEtat("on", {"supported_color_modes": ["hs"]}),
            EXTERIEUR: FauxEtat("on")}


def test_une_action_lumieres_prend_un_fondu_et_un_blanc_facultatifs(module):
    a = module.valider_action({"famille": "lumieres", "geste": "allumer", "valeur": 30, "fondu": 180, "blanc": 2700})
    assert a == {"famille": "lumieres", "geste": "allumer", "portee": "maison", "valeur": 30, "fondu": 180, "blanc": 2700}
    # Rien, zero, nul : pas de fondu ni de blanc - un scenario d'avant reste tel quel.
    for vide in ({}, {"fondu": 0, "blanc": None}, {"fondu": None, "blanc": ""}):
        assert module.valider_action({"famille": "lumieres", "geste": "allumer", **vide}) == {
            "famille": "lumieres", "geste": "allumer", "portee": "maison"}
    # Bornes : une heure de fondu au plus ; un blanc entre 1 500 et 10 000 K.
    a = module.valider_action({"famille": "lumieres", "geste": "allumer", "fondu": 99999, "blanc": 50000})
    assert a["fondu"] == 3600 and a["blanc"] == 10000
    # Une extinction prend un fondu, pas de blanc ; une autre famille, ni l'un ni l'autre.
    assert module.valider_action({"famille": "lumieres", "geste": "eteindre", "fondu": 10, "blanc": 2700}) == {
        "famille": "lumieres", "geste": "eteindre", "portee": "maison", "fondu": 10}
    assert "fondu" not in module.valider_action({"famille": "volets", "geste": "fermer", "fondu": 10})
    for illisible in ({"fondu": "long"}, {"blanc": "chaud"}, {"fondu": True}):
        with pytest.raises(ValueError):
            module.valider_action({"famille": "lumieres", "geste": "allumer", **illisible})


def test_les_fondus_des_scenarios_de_loggia(module):
    """« Bonne nuit » s'eteint en 10 s, « Reveil » monte a 30 % en 3 min,
    « Cinema » se regle en 3 s ; les autres n'ont pas de fondu."""
    lum = {s["id"]: next((a for a in s["actions"] if a["famille"] == "lumieres"), None) for s in module.INTEGRES}
    assert lum["nuit"]["fondu"] == 10 and lum["nuit"]["geste"] == "eteindre"
    assert (lum["reveil"]["fondu"], lum["reveil"]["valeur"]) == (180, 30)
    assert lum["cinema"]["fondu"] == 3
    assert all("fondu" not in a and "blanc" not in a for i, a in lum.items() if i not in ("nuit", "reveil", "cinema") and a)
    # Chaque action de Loggia passe sa propre validation.
    for s in module.INTEGRES:
        for a in s["actions"]:
            assert module.valider_action(a) == a, (s["id"], a)


def test_le_fondu_et_le_blanc_ne_partent_qu_aux_lampes_qui_savent(creer, module):
    s = creer(etats=etats_fondu(), partage={"loggia_switchlights": [EXTERIEUR]})
    c = lancer(s._contexte())
    haids = ["light.chambre", "light.jardin", "light.salon", "light.sdb", EXTERIEUR]
    allumer = {"famille": "lumieres", "geste": "allumer", "valeur": 60, "fondu": 3, "blanc": 6500}
    assert module.ordres(allumer, haids, c["maison"]) == [
        ("light", "turn_on", ["light.chambre"], {"brightness_pct": 60}),
        ("light", "turn_on", ["light.jardin"], {"brightness_pct": 60, "color_temp_kelvin": 6500}),
        ("light", "turn_on", ["light.salon"], {"brightness_pct": 60, "transition": 3, "color_temp_kelvin": 6500}),
        ("light", "turn_on", ["light.sdb"], {"brightness_pct": 60, "transition": 3, "color_temp_kelvin": 4000}),
        ("homeassistant", "turn_on", [EXTERIEUR], {}),
    ]
    eteindre = {"famille": "lumieres", "geste": "eteindre", "fondu": 10}
    assert module.ordres(eteindre, haids, c["maison"]) == [
        ("light", "turn_off", ["light.chambre", "light.jardin"], {}),
        ("light", "turn_off", ["light.salon", "light.sdb"], {"transition": 10}),
        ("homeassistant", "turn_off", [EXTERIEUR], {}),
    ]
    # Sans fondu ni blanc : l'ordre d'avant, un seul appel pour les lampes.
    assert module.ordres({"famille": "lumieres", "geste": "allumer", "valeur": 40}, haids[:4], c["maison"]) == [
        ("light", "turn_on", haids[:4], {"brightness_pct": 40})]


def test_le_lancement_annonce_le_fondu_au_carnet_avant_l_ordre(creer, module):
    """Le carnet ne note pas les paliers d'un fondu qu'il sait en cours
    (lumieres_calcul) : le scenario le lui dit, pour les lampes qui l'ont recu, au
    nom de qui l'a lance - et rien sans fondu."""
    s = creer(etats=etats_fondu(), partage=NUIT_LINO)
    carnet = FauxCarnet()
    s.hass.data = {"loggia": {"lumieres": carnet}}
    lancer(s.async_lancer("nuit", user_id="u-papa"))
    assert carnet.annonces == [(["light.salon", "light.sdb"], 10, True, "u-papa")]
    # Le contexte de l'ordre, celui que portent ses premiers paliers : le carnet reconnait ainsi le fondu lui-meme.
    assert carnet.origines == [next(c.id for d, sv, data, c in s.hass.services.appels if d == "light" and data.get("transition"))]
    par_lot = [(sv, sorted(data["entity_id"]), data.get("transition")) for d, sv, data, _ in s.hass.services.appels if d == "light"]
    assert ("turn_off", ["light.salon", "light.sdb"], 10) in par_lot
    carnet.annonces.clear()
    lancer(s.async_lancer("invites", user_id="u-papa"))
    assert carnet.annonces == [], "« Invites » n'a pas de fondu"
    # Sans carnet (le module absent), le scenario part quand meme.
    s.hass.data = {}
    assert lancer(s.async_lancer("nuit", user_id="u-papa"))["erreurs"] == 0


def test_l_etat_dit_ou_le_fondu_et_le_blanc_sont_possibles(creer):
    """L'ecran ne montre les puces du fondu et du blanc que si une lampe visee sait
    le faire : l'etat le dit pour toute la maison, les pieces de vie et chaque piece."""
    s = creer(etats=etats_fondu())
    lampes = lancer(s.async_etat())["lampes"]
    assert lampes["maison"] == {"fondu": True, "blanc": True}
    assert lampes["pieces"]["Chambre"] == {"fondu": False, "blanc": False}, "un variateur seul"
    assert lampes["pieces"]["Salle de bain"] == {"fondu": True, "blanc": True}
    assert lampes["vie"] == {"fondu": True, "blanc": True}, "le salon"


def test_seul_l_ordre_du_fondu_porte_le_contexte_annonce_au_carnet(creer):
    """Contre-relecture du 31/10 (C4) : « eteindre la maison en 10 s », puis « allumer
    le salon a 20 % » sans fondu. Un seul contexte pour tout le lancement : l'allumage
    portait l'identifiant annonce au carnet, et, plus bas que le niveau d'avant, il
    etait avale. Chaque ordre de fondu a desormais SON contexte, enfant de celui du
    lancement, au nom du meme compte ; seul celui-la est annonce."""
    perso = {"id": "perso_soiree", "nom": "Soirée", "actions": [
        {"famille": "lumieres", "geste": "eteindre", "portee": "maison", "fondu": 10},
        {"famille": "lumieres", "geste": "allumer", "portee": "piece", "piece": "Salon", "valeur": 20}]}
    s = creer(config={"persos": [perso]}, etats=etats_fondu(), partage=NUIT_LINO)
    carnet = FauxCarnet()
    s.hass.data = {"loggia": {"lumieres": carnet}}
    lancer(s.async_lancer("perso_soiree", user_id="u-papa"))
    appels = [(sv, sorted(data["entity_id"]), data.get("transition"), c) for d, sv, data, c in s.hass.services.appels if d == "light"]
    fondu = next(c for sv, ids, tr, c in appels if tr)
    allumage = next(c for sv, ids, tr, c in appels if sv == "turn_on")
    lancement = next(c for sv, ids, tr, c in appels if sv == "turn_off" and not tr)
    assert carnet.origines == [fondu.id]
    assert allumage.id != fondu.id, "l'allumage n'est pas le fondu : le carnet le note"
    assert fondu.parent_id == lancement.id and fondu.user_id == "u-papa" == allumage.user_id
