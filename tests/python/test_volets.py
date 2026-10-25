"""Tests des regles de volets.

Deux choses valent d'etre verrouillees ici. La geometrie d'abord : « ce volet
est-il au soleil » se joue sur un ecart d'azimut, et un ecart d'azimut se
trompe au passage du nord si on le calcule naivement. La priorite ensuite : le
vent prime sur le soleil, sans quoi la protection solaire rabaisserait dans la
minute un volet qu'on vient de mettre a l'abri.
"""
from __future__ import annotations

import asyncio
import json
import logging
import sys
import time
import types
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import pytest

from conftest import FauxStore, charger
from test_chauffage import FuseauParis


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
        st = self.table.get(haid)
        # Les volets de ces tests sont des volets roulants : un volet se
        # reconnait a sa classe depuis le 03/10 (ouvrants.py). Un test qui veut
        # un ouvrant SANS classe l'ecrit : `{"device_class": None}`.
        if st is not None and haid.startswith("cover.") and "device_class" not in st.attributes:
            st.attributes["device_class"] = "shutter"
        return st

    def async_entity_ids(self, domaine):
        return [e for e in self.table if e.startswith(domaine + '.')]


class FauxServices:
    def __init__(self):
        self.appels = []

    async def async_call(self, domaine, service, data, blocking=False, context=None):
        # Le socle attache SON contexte a chaque ordre : c'est ce qui lui
        # permet de ne pas prendre son propre effet pour un geste humain.
        # On l'accepte et on garde la forme a trois elements, que trente-quatre
        # assertions lisent deja.
        self.appels.append((domaine, service, dict(data)))


class FauxUnites:
    def __init__(self, temperature_unit="°C"):
        self.temperature_unit = temperature_unit


class FauxConfig:
    def __init__(self, temperature_unit="°C"):
        self.units = FauxUnites(temperature_unit)


class FauxHass:
    def __init__(self, etats, temperature_unit="°C"):
        self.states = FauxEtats(etats)
        self.services = FauxServices()
        self.taches = []
        self.config = FauxConfig(temperature_unit)

    def async_create_task(self, coro):
        self.taches.append(coro)
        return coro

    def abandonner(self):
        taches, self.taches = self.taches, []
        for coro in taches:
            coro.close()


@pytest.fixture
def module():
    return charger("volets")


@pytest.fixture
def regles_module():
    return charger("regles")


@pytest.fixture
def creer(module, store_module, regles_module):
    faits = []

    def fabrique(config=None, etats=None, temperature_unit="°C"):
        magasin = store_module.LoggiaStore.__new__(store_module.LoggiaStore)
        magasin._store = FauxStore({"users": {}, "shared": {"loggia_volets": config or {}}, "migrated": True})
        magasin._ancien = FauxStore(None)
        magasin._data = None
        magasin._lock = asyncio.Lock()

        # `__new__` : le vrai constructeur pose des rendez-vous de lever et de
        # coucher, ce qu'aucun test ne veut declencher.
        v = module.LoggiaVolets.__new__(module.LoggiaVolets)
        v.hass = FauxHass(etats or {}, temperature_unit)
        v.store = magasin
        v.cfg = lancer(v.async_config())
        # Un dictionnaire : la protection retient AUSSI d'ou elle a pris
        # chaque volet, pour l'y remettre plutot que de tout ouvrir a 100.
        v.abaisses = {}
        v.a_l_abri = False
        v._defait = []
        v._defait_soleil = []
        # Le socle commun. Un vrai, pas une doublure : c'est lui qui ecarte
        # les entites sous la main et qui tient le journal, et les tests des
        # volets doivent voir exactement ce que verra l'installation.
        v.regles = regles_module.Regles(v.hass, magasin)
        v.regles._depot = FauxStore(None)
        # Les ordres qu'un volet indisponible n'a pas pu recevoir, et l'ecoute
        # qui les rattrape a son retour. Le vrai constructeur les pose ; ici on
        # les recree, sinon la fabrique ment sur l'objet qu'elle rend.
        v.attente = {}
        v._defait_attente = None
        # Les ordres partis qu'il reste a verifier (ADR 0007).
        v._verifs = {}
        # Ce que l'etat garde d'un sondage a l'autre : la fin de chaque
        # protection, les heures du soleil de la journee.
        v._fins = {}
        v._jours_soleil = None
        v.armes = {"ouverture": {}, "fermeture": {}}
        v.raison = ""
        faits.append(v)
        return v

    yield fabrique
    for v in faits:
        v.hass.abandonner()


# ── La geometrie ────────────────────────────────────────────────────────────

def test_l_ecart_d_azimut_passe_le_nord(module):
    """350° et 10° sont voisins de 20°, pas eloignes de 340° : sans cela, une
    facade plein nord ne serait jamais vue comme ensoleillee."""
    assert module.ecart_azimut(350, 10) == 20
    assert module.ecart_azimut(10, 350) == 20
    assert module.ecart_azimut(0, 180) == 180
    assert module.ecart_azimut(225, 225) == 0


def test_le_soleil_frappe_la_facade_qu_il_regarde(module):
    # Facade sud-ouest (225°), cone de 90° : de 135° a 315°.
    assert module.au_soleil(azimut=225, elevation=40, orientation=225)
    assert module.au_soleil(azimut=140, elevation=40, orientation=225)
    assert not module.au_soleil(azimut=90, elevation=40, orientation=225)


def test_un_soleil_trop_bas_ne_chauffe_pas(module):
    """Au ras de l'horizon il passe sous l'auvent et derriere les arbres :
    baisser les volets a ce moment-la ne protege de rien."""
    assert not module.au_soleil(azimut=225, elevation=5, orientation=225, elevation_min=15)
    assert module.au_soleil(azimut=225, elevation=16, orientation=225, elevation_min=15)


def test_la_marge_retarde_la_reouverture(module):
    """L'hysterese : au bord du cone, il faut sortir franchement pour rouvrir,
    sinon le volet battrait a chaque mise a jour du soleil."""
    assert module.au_soleil(315, 40, 225, 90)                 # on ferme
    assert not module.au_soleil(315, 40, 225, 90, 15, 8)      # mais on ne rouvre pas encore


def test_les_valeurs_manquantes_ne_font_rien(module):
    assert not module.au_soleil(None, 40, 225)
    assert not module.au_soleil(225, None, 225)
    assert not module.au_soleil(225, 40, None)
    assert not module.au_soleil('abc', 40, 225)


def test_les_jours_choisis(module):
    lundi = datetime(2026, 9, 7)
    dimanche = datetime(2026, 9, 13)
    assert module.jour_actif([0, 1, 2, 3, 4], lundi)
    assert not module.jour_actif([0, 1, 2, 3, 4], dimanche)
    # Absente, elle vaut « tous les jours » ; vide, « aucun » (audit du 19/10).
    assert not module.jour_actif([], dimanche)
    assert module.jour_actif(None, dimanche)


# ── Les trois modes ─────────────────────────────────────────────────────────

def test_auto_ouvre_et_ferme(module):
    assert module.planning_agit('auto', 'ouvrir')
    assert module.planning_agit('auto', 'fermer')


def test_nuit_ferme_mais_n_ouvre_pas(module):
    """Pour une chambre d'ami, un depart, une grasse matinee qui dure : les
    volets descendent le soir et restent bas au matin."""
    assert module.planning_agit('nuit', 'fermer')
    assert not module.planning_agit('nuit', 'ouvrir')


def test_manuel_ne_touche_a_rien(module):
    """Une pause, sans avoir a defaire les reglages."""
    assert not module.planning_agit('manuel', 'ouvrir')
    assert not module.planning_agit('manuel', 'fermer')


def test_un_mode_inconnu_vaut_auto(module):
    """Une valeur venue d'une version future, ou d'une main qui a glisse : on
    ne laisse pas les volets immobiles pour autant."""
    for valeur in ('AUTO', '', None, 'bidule'):
        assert module.planning_agit(valeur, 'ouvrir')


def test_le_mode_nuit_arrete_le_planning_du_matin(creer):
    v = creer({"planning": {"actif": True, "mode": "nuit"}}, VOLET)
    lancer(v._async_planifie("ouvrir"))
    assert v.hass.services.appels == []
    lancer(v._async_planifie("fermer"))
    assert [a[1] for a in v.hass.services.appels] == ["close_cover"]


def test_le_mode_manuel_arrete_les_deux(creer):
    v = creer({"planning": {"actif": True, "mode": "manuel"}}, VOLET)
    lancer(v._async_planifie("ouvrir"))
    lancer(v._async_planifie("fermer"))
    assert v.hass.services.appels == []


# ── Un horaire par volet ────────────────────────────────────────────────────

COVERS = ["cover.chambre", "cover.cuisine", "cover.salon"]


def test_sans_reglage_tout_le_monde_suit_l_heure_generale(module):
    plan = {"ouverture": {"decalage": 15}, "volets": {}}
    assert module.groupes_horaires(plan, COVERS, "ouverture") == {15: COVERS}


def test_un_volet_peut_ouvrir_plus_tard(module):
    """La demande d'origine : la chambre ne s'ouvre pas au lever du soleil
    comme le salon."""
    plan = {"ouverture": {"decalage": 15}, "volets": {"cover.chambre": {"ouverture": 90}}}
    groupes = module.groupes_horaires(plan, COVERS, "ouverture")
    assert groupes == {15: ["cover.cuisine", "cover.salon"], 90: ["cover.chambre"]}


def test_deux_volets_au_meme_horaire_partagent_leur_rendez_vous(module):
    """Un rendez-vous par valeur distincte, pas un par volet."""
    plan = {"ouverture": {"decalage": 0},
            "volets": {"cover.chambre": {"ouverture": 90}, "cover.cuisine": {"ouverture": 90}}}
    groupes = module.groupes_horaires(plan, COVERS, "ouverture")
    assert sorted(groupes) == [0, 90]
    assert groupes[90] == ["cover.chambre", "cover.cuisine"]


def test_le_decalage_propre_ne_vaut_que_pour_son_sens(module):
    """Ouvrir plus tard ne veut pas dire fermer plus tard : la chambre reprend
    l'heure generale pour la fermeture."""
    plan = {"ouverture": {"decalage": 0}, "fermeture": {"decalage": -20},
            "volets": {"cover.chambre": {"ouverture": 90}}}
    assert module.groupes_horaires(plan, COVERS, "fermeture") == {-20: COVERS}


def test_un_volet_exclu_ne_bouge_jamais(module):
    plan = {"ouverture": {"decalage": 0}, "volets": {"cover.chambre": {"exclu": True}}}
    groupes = module.groupes_horaires(plan, COVERS, "ouverture")
    assert groupes == {0: ["cover.cuisine", "cover.salon"]}


def test_un_reglage_illisible_retombe_sur_le_general(module):
    plan = {"ouverture": {"decalage": 10}, "volets": {"cover.chambre": {"ouverture": "plus tard"}}}
    assert module.groupes_horaires(plan, COVERS, "ouverture") == {10: COVERS}


def test_le_planning_prend_tous_les_volets_pas_seulement_les_orientes(creer):
    """Les deux notions etaient confondues : le planning ne suivait que les
    volets a qui on avait donne une orientation pour le soleil."""
    etats = {"cover.a": FauxEtat("open", {}), "cover.b": FauxEtat("open", {})}
    c = cfg_soleil()          # seul cover.salon y est oriente
    c["planning"] = {"actif": True}
    v = creer(c, etats)
    lancer(v._async_planifie("fermer"))
    assert v.hass.services.appels[0][2]["entity_id"] == ["cover.a", "cover.b"]


# ── La configuration ────────────────────────────────────────────────────────

def test_la_config_absente_prend_les_defauts(creer):
    v = creer()
    assert v.cfg["planning"]["actif"] is False
    assert v.cfg["soleil"]["position"] == 30
    assert v.cfg["vent"]["seuil"] == 50


def test_le_seuil_par_defaut_suit_l_unite_de_l_installation(creer):
    """25 est pense en Celsius. Une installation jamais configuree et reglee
    en Fahrenheit doit se voir proposer 77, sinon la regle croirait qu'il gele
    en permanence et remonterait tout (Task #20, 02/10)."""
    v = creer(temperature_unit="°C")
    assert v.cfg["soleil"]["temp_min"] == 25

    vf = creer(temperature_unit="°F")
    assert vf.cfg["soleil"]["temp_min"] == 77


def test_un_seuil_deja_enregistre_n_est_jamais_reconverti(creer):
    """Une valeur enregistree vient du magasin dans l'unite reelle du capteur
    choisi (le frontend l'a deja ecrite ainsi) : elle ne doit plus bouger."""
    v = creer({"soleil": {"temp_min": 80}}, temperature_unit="°F")
    assert v.cfg["soleil"]["temp_min"] == 80


def test_une_section_partielle_garde_le_reste(creer):
    """On enregistre un seul champ depuis l'interface : les autres ne doivent
    pas disparaitre au passage."""
    v = creer({"soleil": {"actif": True, "position": 20}})
    assert v.cfg["soleil"]["actif"] is True
    assert v.cfg["soleil"]["position"] == 20
    assert v.cfg["soleil"]["elevation_min"] == 15   # reste du defaut


# ── La protection solaire ───────────────────────────────────────────────────

SOLEIL_HAUT = {"sun.sun": FauxEtat("above_horizon", {"azimuth": 225, "elevation": 40})}
CHAUD = {"sensor.dehors": FauxEtat("29.0")}
VOLET = {"cover.salon": FauxEtat("open", {"supported_features": 15})}


def cfg_soleil(**extra):
    base = {"soleil": {"actif": True, "position": 30, "elevation_min": 15, "temp_min": 25,
                       "temp_entite": "sensor.dehors",
                       "volets": {"cover.salon": {"orientation": 225, "ouverture": 90}}}}
    base["soleil"].update(extra)
    return base


def test_le_volet_expose_descend(creer):
    v = creer(cfg_soleil(), {**SOLEIL_HAUT, **CHAUD, **VOLET})
    lancer(v._async_soleil())
    assert v.hass.services.appels == [
        ("cover", "set_cover_position", {"entity_id": ["cover.salon"], "position": 30})
    ]
    # `open` sans `current_position` : le volet est en haut, la protection
    # le baisse et retient 100.
    assert v.abaisses == {"cover.salon": 100}


def test_le_volet_ne_redescend_pas_deux_fois(creer):
    v = creer(cfg_soleil(), {**SOLEIL_HAUT, **CHAUD, **VOLET})
    lancer(v._async_soleil())
    lancer(v._async_soleil())
    assert len(v.hass.services.appels) == 1


def test_le_volet_remonte_quand_le_soleil_est_passe(creer):
    v = creer(cfg_soleil(), {**SOLEIL_HAUT, **CHAUD, **VOLET})
    lancer(v._async_soleil())
    v.hass.states.table["sun.sun"] = FauxEtat("above_horizon", {"azimuth": 60, "elevation": 30})
    lancer(v._async_soleil())
    assert v.hass.services.appels[-1] == (
        "cover", "set_cover_position", {"entity_id": ["cover.salon"], "position": 100}
    )
    assert v.abaisses == {}


# ── « Descendre a 30 % » ne doit jamais faire monter ────────────────────────
#
# Signale le 08/09 : le volet d une chambre s est OUVERT a 30 % vers midi,
# pendant que quelqu un dormait derriere.
#
# Il etait ferme, comme chaque nuit — son planning le ferme tous les jours et
# ne le rouvre aucun. La protection solaire, elle, envoyait sa consigne telle
# quelle : `set_cover_position` a 30 sur un volet a 0, c est une OUVERTURE. La
# regle promettait de proteger du soleil et laissait entrer le jour.
# ───────────────────────────────────────────────────────────────────────────

FERME = {"cover.salon": FauxEtat("closed", {"supported_features": 15, "current_position": 0})}


def test_un_volet_ferme_reste_ferme(creer):
    v = creer(cfg_soleil(), {**SOLEIL_HAUT, **CHAUD, **FERME})
    lancer(v._async_soleil())
    assert v.hass.services.appels == [], "la protection a ouvert un volet ferme"
    # Et il ne doit pas non plus etre COMPTE comme abaisse : sinon la sortie du
    # cone, le soir, le rouvrirait pour de bon.
    assert v.abaisses == {}


def test_un_volet_ferme_sans_position_publiee_reste_ferme(creer):
    """Tous les volets ne publient pas `current_position`.

    Pour ceux-la, l etat suffit : `closed` vaut 0, et un volet a 0 est deja plus
    bas que n importe quelle consigne. Sans cette lecture, la protection leur
    envoyait un `close_cover` qu ils avaient deja execute — sans dommage ici,
    mais sur la meme erreur de raisonnement que pour les autres.
    """
    simple = {"cover.salon": FauxEtat("closed", {"supported_features": 11})}
    v = creer(cfg_soleil(), {**SOLEIL_HAUT, **CHAUD, **simple})
    lancer(v._async_soleil())
    assert v.hass.services.appels == []
    assert v.abaisses == {}


def test_un_volet_deja_plus_bas_que_la_consigne_est_laisse_tranquille(creer):
    entrouvert = {"cover.salon": FauxEtat("open", {"supported_features": 15, "current_position": 20})}
    v = creer(cfg_soleil(), {**SOLEIL_HAUT, **CHAUD, **entrouvert})
    lancer(v._async_soleil())
    assert v.hass.services.appels == []


def test_un_volet_pile_a_la_consigne_ne_bouge_pas(creer):
    """Le cas limite : egal, ce n est ni descendre ni proteger davantage."""
    pile = {"cover.salon": FauxEtat("open", {"supported_features": 15, "current_position": 30})}
    v = creer(cfg_soleil(), {**SOLEIL_HAUT, **CHAUD, **pile})
    lancer(v._async_soleil())
    assert v.hass.services.appels == []


def test_un_volet_plus_haut_descend_bien(creer):
    """La contre-epreuve : sans elle, tout refuser passerait le test ci-dessus."""
    haut = {"cover.salon": FauxEtat("open", {"supported_features": 15, "current_position": 70})}
    v = creer(cfg_soleil(), {**SOLEIL_HAUT, **CHAUD, **haut})
    lancer(v._async_soleil())
    assert v.hass.services.appels == [
        ("cover", "set_cover_position", {"entity_id": ["cover.salon"], "position": 30})
    ]
    assert v.abaisses == {"cover.salon": 70}


def test_le_volet_retrouve_sa_hauteur_pas_le_grand_ouvert(creer):
    """La protection rendait plus qu elle n avait pris.

    Un volet entrouvert a 70 le matin, baisse a 30 le midi, se retrouvait grand
    ouvert le soir. Personne ne l avait demande.
    """
    haut = {"cover.salon": FauxEtat("open", {"supported_features": 15, "current_position": 70})}
    v = creer(cfg_soleil(), {**SOLEIL_HAUT, **CHAUD, **haut})
    lancer(v._async_soleil())
    v.hass.states.table["sun.sun"] = FauxEtat("above_horizon", {"azimuth": 60, "elevation": 30})
    lancer(v._async_soleil())
    assert v.hass.services.appels[-1] == (
        "cover", "set_cover_position", {"entity_id": ["cover.salon"], "position": 70}
    )
    assert v.abaisses == {}


def test_la_chaleur_retombee_rend_aussi_la_hauteur(creer):
    """Meme promesse par l autre chemin : la temperature repasse sous le seuil."""
    haut = {"cover.salon": FauxEtat("open", {"supported_features": 15, "current_position": 70})}
    v = creer(cfg_soleil(), {**SOLEIL_HAUT, **CHAUD, **haut})
    lancer(v._async_soleil())
    v.hass.states.table["sensor.dehors"] = FauxEtat("18.0")
    lancer(v._async_soleil())
    assert v.hass.services.appels[-1] == (
        "cover", "set_cover_position", {"entity_id": ["cover.salon"], "position": 70}
    )


def test_position_inconnue_on_ne_touche_a_rien(creer):
    """Ne pas savoir n est pas une raison d agir.

    Ce test disait l inverse il y a une heure : position inconnue, on baissait
    quand meme, quitte a rendre le grand ouvert ensuite. La mesure sur
    l installation reelle a tranche — les quatre volets y etaient
    `unavailable`, donc sans position connue, donc sur ce chemin-la. Le
    garde-fou pose contre l ouverture de la chambre ne mordait pas ou il
    fallait.

    Un volet indisponible ou en plein mouvement ne dit rien de sa hauteur. La
    regle repasse a chaque minute de soleil : on ne perd qu un peu d ombre.
    """
    for etat in ("unavailable", "unknown", "opening"):
        muet = {"cover.salon": FauxEtat(etat, {"supported_features": 15})}
        v = creer(cfg_soleil(), {**SOLEIL_HAUT, **CHAUD, **muet})
        lancer(v._async_soleil())
        assert v.hass.services.appels == [], "volet " + etat + " : commande envoyee a l aveugle"
        assert v.abaisses == {}


def test_le_repli_reste_le_grand_ouvert(creer):
    """La position d avant peut avoir ete perdue entre-temps.

    Elle est retenue au moment ou l on baisse. Un volet devenu indisponible
    depuis, ou une version anterieure qui n en retenait aucune, laisse un
    `None` : le grand ouvert reste alors le seul repli possible.
    """
    haut = {"cover.salon": FauxEtat("open", {"supported_features": 15, "current_position": 70})}
    v = creer(cfg_soleil(), {**SOLEIL_HAUT, **CHAUD, **haut})
    lancer(v._async_soleil())
    v.abaisses["cover.salon"] = None
    v.hass.states.table["sun.sun"] = FauxEtat("above_horizon", {"azimuth": 60, "elevation": 30})
    lancer(v._async_soleil())
    assert v.hass.services.appels[-1] == (
        "cover", "set_cover_position", {"entity_id": ["cover.salon"], "position": 100}
    )


def test_sans_chaleur_pas_de_protection(creer):
    """Le meme soleil en fevrier est le bienvenu : c'est la temperature
    exterieure qui decide, pas le mois."""
    v = creer(cfg_soleil(), {**SOLEIL_HAUT, "sensor.dehors": FauxEtat("12.0"), **VOLET})
    lancer(v._async_soleil())
    assert v.hass.services.appels == []


def test_un_volet_sans_position_s_ouvre_et_se_ferme(creer):
    """Tous les volets ne savent pas se placer a 30 % : ceux-la se contentent
    de l'ouvert et du ferme, plutot que d'ignorer la commande."""
    simple = {"cover.salon": FauxEtat("open", {"supported_features": 11})}   # sans SET_POSITION
    v = creer(cfg_soleil(), {**SOLEIL_HAUT, **CHAUD, **simple})
    lancer(v._async_soleil())
    assert v.hass.services.appels == [("cover", "close_cover", {"entity_id": ["cover.salon"]})]


def test_soleil_eteint_ne_touche_a_rien(creer):
    v = creer({"soleil": {"actif": False}}, {**SOLEIL_HAUT, **CHAUD, **VOLET})
    lancer(v._async_soleil())
    assert v.hass.services.appels == []


# ── La mise a l'abri ────────────────────────────────────────────────────────

def cfg_vent(seuil=50, **soleil):
    c = cfg_soleil(**soleil)
    c["vent"] = {"actif": True, "entite": "sensor.vent", "seuil": seuil}
    return c


def test_le_vent_remonte_tout(creer):
    etats = {**SOLEIL_HAUT, **CHAUD, **VOLET, "sensor.vent": FauxEtat("70")}
    v = creer(cfg_vent(), etats)
    assert lancer(v._async_vent()) is True
    assert v.hass.services.appels == [("cover", "open_cover", {"entity_id": ["cover.salon"]})]
    assert v.a_l_abri is True


def test_le_vent_prime_sur_le_soleil(creer):
    """LE point : sans cette priorite, la protection solaire rabaisserait dans
    la minute un volet qu'on vient de mettre a l'abri."""
    etats = {**SOLEIL_HAUT, **CHAUD, **VOLET, "sensor.vent": FauxEtat("70")}
    v = creer(cfg_vent(), etats)
    lancer(v._async_evaluer())
    assert [a[1] for a in v.hass.services.appels] == ["open_cover"]
    assert v.abaisses == {}


def test_le_calme_revenu_ne_suffit_pas_de_justesse(creer):
    """Une rafale qui oscille autour du seuil ferait battre les volets : on ne
    redescend qu'une fois nettement repasse dessous."""
    etats = {**SOLEIL_HAUT, **CHAUD, **VOLET, "sensor.vent": FauxEtat("70")}
    v = creer(cfg_vent(), etats)
    lancer(v._async_vent())
    v.hass.states.table["sensor.vent"] = FauxEtat("48")     # juste sous 50
    assert lancer(v._async_vent()) is True
    v.hass.states.table["sensor.vent"] = FauxEtat("40")     # sous 85 % du seuil
    assert lancer(v._async_vent()) is True, "le calme doit TENIR avant de lever l'abri"
    _calme_tenu(v)
    assert lancer(v._async_vent()) is False


def test_un_capteur_de_vent_muet_ne_declenche_rien(creer):
    etats = {**SOLEIL_HAUT, **CHAUD, **VOLET, "sensor.vent": FauxEtat("unavailable")}
    v = creer(cfg_vent(), etats)
    assert lancer(v._async_vent()) is False
    assert v.hass.services.appels == []


# ── Le planning ─────────────────────────────────────────────────────────────

def test_le_planning_ouvre_et_ferme(creer):
    v = creer({"planning": {"actif": True, "jours": [0, 1, 2, 3, 4, 5, 6]}}, VOLET)
    lancer(v._async_planifie("fermer"))
    lancer(v._async_planifie("ouvrir"))
    assert [a[1] for a in v.hass.services.appels] == ["close_cover", "open_cover"]


def test_le_planning_se_tait_pendant_la_mise_a_l_abri(creer):
    v = creer({"planning": {"actif": True}}, VOLET)
    v.a_l_abri = True
    lancer(v._async_planifie("fermer"))
    assert v.hass.services.appels == []


def test_sans_volet_regle_le_planning_prend_le_domaine(creer):
    """Un volet ajoute apres coup doit suivre le planning sans qu'on ait a le
    declarer : c'est la promesse de la decouverte."""
    etats = {"cover.a": FauxEtat("open", {}), "cover.b": FauxEtat("open", {}),
             "light.x": FauxEtat("on", {})}
    v = creer({"planning": {"actif": True}}, etats)
    lancer(v._async_planifie("fermer"))
    assert v.hass.services.appels[0][2]["entity_id"] == ["cover.a", "cover.b"]

def test_les_groupes_ne_filtrent_jamais_par_jour(module):
    """Les jours se jugent quand la cloche sonne (`volets_du_jour`), jamais en
    formant les groupes : sept jours decoches ne retirent pas le volet de son
    rendez-vous. Le filtre `quand`, que plus aucun appel ne passait, est parti
    le 19/10."""
    plan = {"ouverture": {"decalage": 0},
            "volets": {COVERS[0]: {"perso": True, "jours_ouverture": []}}}
    g = module.groupes_horaires(plan, COVERS, "ouverture")
    assert COVERS[0] in [x for v in g.values() for x in v], "les groupes se sont mis a filtrer par jour"

def test_le_rendez_vous_est_pose_meme_un_jour_ecarte(module):
    """Filtrer a la programmation aurait prive le volet de tout rendez-vous.

    `_async_reprogrammer` ne tourne qu'au demarrage et a l'enregistrement ; les
    rendez-vous poses, eux, sonnent tous les jours. Une chambre reglee sur le
    week-end et configuree un mardi n'aurait jamais recu de rendez-vous, et ne
    se serait plus ouverte du tout — pas meme le samedi.
    """
    plan = {"ouverture": {"decalage": 0},
            "volets": {COVERS[0]: {"perso": True, "jours_ouverture": [5, 6]}}}
    g = module.groupes_horaires(plan, COVERS, "ouverture")
    assert COVERS[0] in [x for v in g.values() for x in v],         "le volet n'a pas de rendez-vous : il ne s'ouvrira plus jamais"


def test_le_filtre_agit_quand_la_cloche_sonne(module):
    lundi, samedi = datetime(2026, 9, 7), datetime(2026, 9, 12)   # weekday 0 et 5
    plan = {"volets": {COVERS[0]: {"perso": True, "jours_ouverture": [5, 6]}}}
    assert COVERS[0] not in module.volets_du_jour(plan, COVERS, "ouverture", lundi),         "le volet s'ouvre un jour ecarte"
    assert COVERS[0] in module.volets_du_jour(plan, COVERS, "ouverture", samedi),         "le volet ne s'ouvre pas un jour retenu"
    assert COVERS[1] in module.volets_du_jour(plan, COVERS, "ouverture", lundi),         "les autres volets ont ete emportes"
    # La fermeture, sans liste propre, n'est pas concernee.
    assert COVERS[0] in module.volets_du_jour(plan, COVERS, "fermeture", lundi),         "les jours d'ouverture bloquent aussi la fermeture"


def test_tous_les_jours_decoches_veut_dire_jamais(module):
    """`[]` est un choix, pas une absence de choix.

    La liste vide vient de quelqu'un qui a decoche les sept cases : lui
    repondre « toujours » serait l'exact contraire de ce qu'il a demande. Les
    jours de la maison le lisent de meme depuis le 19/10 (`jour_actif`).
    """
    plan = {"volets": {COVERS[0]: {"perso": True, "jours_ouverture": []}}}
    for jour in (datetime(2026, 9, 7), datetime(2026, 9, 12)):
        assert COVERS[0] not in module.volets_du_jour(plan, COVERS, "ouverture", jour),             "sept jours decoches ouvrent le volet au lieu de le laisser tranquille"


def test_des_jours_en_chaines_restent_compris(module):
    """Le stockage n'oblige personne a ecrire des entiers.

    `weekday() in ["0","1"]` est faux tous les jours : le volet ne bougerait
    plus jamais, sans erreur ni journal pour le dire.
    """
    plan = {"volets": {COVERS[0]: {"perso": True, "jours_ouverture": ["5", "6"]}}}
    assert COVERS[0] in module.volets_du_jour(plan, COVERS, "ouverture", datetime(2026, 9, 12)),         "des jours ecrits en chaines excluent le volet pour toujours"

def test_le_declenchement_quotidien_applique_le_filtre():
    """Le filtre doit etre APPELE la ou la cloche sonne.

    Les tests ci-dessus verifient `volets_du_jour` isolement. Rien ne garantirait
    que `_async_planifie` s'en serve : la fonction pourrait etre juste, et le
    planning continuer de tout ouvrir. C'est ce chainon qui manquait quand le
    filtre vivait dans `groupes_horaires`.
    """
    from pathlib import Path
    src = Path(__file__).resolve().parents[2] / "custom_components" / "loggia" / "volets.py"
    texte = src.read_text(encoding="utf-8")
    debut = texte.index("async def _async_planifie")
    corps = texte[debut:texte.index("\n    # ", debut)]
    assert "volets_du_jour(" in corps,         "_async_planifie n'applique plus les jours propres : ils seront ignores chaque jour"
    assert "dt_util.now()" in corps,         "le filtre ne recoit plus la date du jour"
    # Et il ne doit PAS revenir a la programmation, sinon le rendez-vous
    # n'est jamais pose pour un volet ecarte le jour de l'enregistrement.
    prog = texte[texte.index("async def _async_reprogrammer"):debut]
    # La programmation ne doit filtrer NI par jour, NI par entite.
    #
    # Ce test exigeait auparavant `groupes_horaires(plan, covers, sens)` — sans
    # `quand`, donc sans filtre de jour. C'etait la bonne intention et la
    # mauvaise garde : elle imposait de lire la liste des volets a l'armement.
    #
    # Or Loggia demarre en meme temps que MQTT et Zigbee2MQTT. Ce jour-la les
    # `cover.*` peuvent ne pas exister encore : `groupes_horaires` rendait un
    # dictionnaire vide, la boucle qui pose les rendez-vous ne tournait pas une
    # seule fois, et plus rien ne se declenchait — ni le matin, ni le soir —
    # jusqu'au prochain enregistrement. Aucune erreur nulle part.
    #
    # L'armement se fait donc sur les DECALAGES, qui viennent de la
    # configuration et existent avant toute entite.
    assert "decalages_du_plan(plan, sens)" in prog,         "l'armement lit de nouveau les entites : il sera muet si les volets arrivent apres Loggia"
    assert "_tous_les_covers()" not in prog,         "l'armement ne doit dependre d'aucune entite"
    assert "groupes_horaires" not in prog,         "les groupes se resolvent au coup de cloche, pas a l'armement"
    # Et le cablage entre les deux : le rendez-vous doit PORTER son decalage.
    #
    # Sans lui, `_async_planifie` ne recoit ni liste ni horaire, tombe sur le
    # repli general, et chaque cloche commande TOUS les volets — celui de 8 h
    # comme celui de 9 h. Les tests qui appellent la fonction directement ne
    # voient pas ce chainon : il faut le lire ici. Constate en mutant.
    rdv = texte[texte.index("def _rendezvous"):texte.index("async def _async_planifie")]
    assert "self._async_planifie(quoi, decalage=decalage)" in rdv,         "le rendez-vous ne transmet plus son horaire : chaque cloche commanderait tout"

def test_une_section_de_planning_corrompue_ne_plante_pas(module):
    """La meme cle porte deux formes selon le niveau.

    Au niveau du plan, `ouverture` vaut `{"decalage": N}` ; au niveau d'un
    volet, un entier nu. Un patch qui applique la seconde forme au premier
    niveau remplacait le dict par un entier, et `.get` levait une
    `AttributeError` que le `except (TypeError, ValueError)` ne rattrapait pas.

    Pire : `async_enregistrer` persiste AVANT de reprogrammer. La configuration
    fautive etait donc deja ecrite quand le plantage survenait, et se
    reproduisait a chaque demarrage jusqu'a une correction a la main.
    """
    for mauvais in ("corrompu", 15, [1, 2], True):
        g = module.groupes_horaires({"ouverture": mauvais, "volets": {}}, COVERS, "ouverture")
        assert COVERS[0] in [x for v in g.values() for x in v],             f"une section {type(mauvais).__name__} fait disparaitre les volets"


# ─────────────────────────────────────────────────────────────────────────────
# Les decalages viennent de la configuration, pas des entites.
#
# Signale le 09/09/2026 : « les volets ne se ferment pas le soir et le salon ne
# s'ouvre pas le matin ». L'historique de quatre jours ne montrait aucun
# mouvement au lever ni au coucher, et rien dans aucun journal.
#
# La cause : l'armement lisait `hass.states.async_entity_ids("cover")`. Loggia
# demarre en meme temps que MQTT et Zigbee2MQTT — si les volets ne sont pas
# encore la, il n'y a aucun groupe, donc aucun rendez-vous, et les regles
# restent mortes jusqu'au prochain enregistrement de la configuration.
# ─────────────────────────────────────────────────────────────────────────────


def test_les_decalages_sortent_du_reglage_general(module):
    decalages_du_plan = module.decalages_du_plan
    plan = {"ouverture": {"decalage": 30}, "fermeture": {"decalage": -15}}
    assert decalages_du_plan(plan, "ouverture") == {30}
    assert decalages_du_plan(plan, "fermeture") == {-15}


def test_un_volet_avec_son_propre_decalage_ajoute_le_sien(module):
    decalages_du_plan = module.decalages_du_plan
    plan = {
        "ouverture": {"decalage": 30},
        "volets": {"cover.chambre": {"ouverture": 60}, "cover.salon": {"ouverture": 30}},
    }
    # Le general reste : un volet sans reglage propre le suit.
    assert decalages_du_plan(plan, "ouverture") == {30, 60}


def test_un_volet_exclu_n_arme_pas_son_decalage(module):
    decalages_du_plan = module.decalages_du_plan
    plan = {"ouverture": {"decalage": 0},
            "volets": {"cover.groupe": {"exclu": True, "ouverture": 90}}}
    assert decalages_du_plan(plan, "ouverture") == {0}


def test_les_decalages_ne_dependent_d_aucune_entite(module):
    """Le coeur de la correction : aucun volet en vue, et l'armement tient.

    Avec l'ancienne forme, une installation dont les volets arrivent apres
    Loggia n'armait RIEN. Ici la configuration suffit.
    """
    decalages_du_plan, groupes_horaires = module.decalages_du_plan, module.groupes_horaires
    plan = {"ouverture": {"decalage": 30},
            "volets": {"cover.salon": {"ouverture": 30}}}
    # Aucune entite connue au moment de l'armement.
    assert groupes_horaires(plan, [], "ouverture") == {}
    # Et pourtant le rendez-vous est arme.
    assert decalages_du_plan(plan, "ouverture") == {30}
    # Quand la cloche sonne, l'installation est chargee et le volet se retrouve.
    assert groupes_horaires(plan, ["cover.salon"], "ouverture") == {30: ["cover.salon"]}


def test_un_decalage_illisible_ne_fait_pas_tout_tomber(module):
    decalages_du_plan = module.decalages_du_plan
    plan = {"ouverture": {"decalage": "trente"},
            "volets": {"cover.a": {"ouverture": "tot"}, "cover.b": {"ouverture": 45}}}
    # Le general illisible retombe a zero, le volet illisible est ignore, et
    # celui qui est lisible garde le sien.
    assert decalages_du_plan(plan, "ouverture") == {0, 45}


def test_chaque_horaire_ne_commande_que_ses_volets(creer):
    """La cloche de 8 h ne doit pas ouvrir le volet regle sur 9 h.

    `_async_planifie` recoit un DECALAGE et non une liste : c'est lui qui
    resout les volets, au moment ou la cloche sonne. Sans cette resolution, le
    repli « tous les volets » s'applique — et chacun bouge a chaque horaire.
    Constate en mutant ce test le 09/09/2026 : retirer la resolution laissait
    tout passer.
    """
    etats = {
        "cover.tot": FauxEtat("open", {"supported_features": 15}),
        "cover.tard": FauxEtat("open", {"supported_features": 15}),
    }
    v = creer({"planning": {"actif": True, "mode": "auto",
                            "ouverture": {"decalage": 0},
                            "volets": {"cover.tard": {"ouverture": 60}}}}, etats)
    lancer(v._async_planifie("ouvrir", decalage=0))
    assert [a[2]["entity_id"] for a in v.hass.services.appels] == [["cover.tot"]],         "l'horaire general a emporte le volet regle plus tard"
    v.hass.services.appels.clear()
    lancer(v._async_planifie("ouvrir", decalage=60))
    assert [a[2]["entity_id"] for a in v.hass.services.appels] == [["cover.tard"]]


def test_un_horaire_sans_volet_ne_commande_rien(creer):
    """Un decalage arme dont plus aucun volet ne depend doit rester muet.

    Sans garde, le repli « tous les volets » ferait tout bouger a une heure
    que plus personne n'a demandee.
    """
    etats = {"cover.salon": FauxEtat("open", {"supported_features": 15})}
    v = creer({"planning": {"actif": True, "mode": "auto",
                            "ouverture": {"decalage": 0}}}, etats)
    lancer(v._async_planifie("ouvrir", decalage=120))
    assert v.hass.services.appels == []


# ─────────────────────────────────────────────────────────────────────────────
# Un ordre attend son volet.
#
# Mesure du 10/09/2026 : le rendez-vous du matin a sonne a la seconde exacte,
# `open_cover` est parti, et le volet n'a pas bouge — il etait `unavailable`
# depuis dix-neuf minutes et l'est reste cinq heures (integration Netatmo, qui
# decroche regulierement). Le journal notait pourtant « ouvrir 1 ».
#
# Une commande envoyee a une entite absente ne fait rien et ne dit rien. Elle
# est desormais mise en attente, et repart des que le volet revient — mais
# jamais au-dela du moment ou l'ordre INVERSE viendrait.
# ─────────────────────────────────────────────────────────────────────────────

ABSENT = {"cover.salon": FauxEtat("unavailable", {"supported_features": 15})}


def test_un_volet_indisponible_ne_recoit_rien_et_n_est_pas_perdu(creer):
    v = creer({"planning": {"actif": True, "mode": "auto"}}, ABSENT)
    lancer(v._async_planifie("fermer"))
    assert v.hass.services.appels == [], "on a commande une entite absente"
    assert "cover.salon" in v.attente
    assert v.attente["cover.salon"]["sens"] == "fermer"


def test_le_journal_ne_compte_pas_ce_qui_n_est_pas_parti(creer):
    """« ouvrir 1 » alors que rien n'a bouge : c'est ce qui a masque le defaut
    pendant des jours."""
    v = creer({"planning": {"actif": True, "mode": "auto"}}, ABSENT)
    lancer(v._async_planifie("ouvrir"))
    ligne = lancer(v.regles.journal())[0]
    assert ligne["n"] == 0
    assert "attente" in ligne["detail"]


def test_l_ordre_repart_quand_le_volet_revient(creer):
    v = creer({"planning": {"actif": True, "mode": "auto"}}, ABSENT)
    lancer(v._async_planifie("fermer"))
    assert v.hass.services.appels == []
    # Le volet revient.
    v.hass.states.table["cover.salon"] = FauxEtat("open", {"supported_features": 15})
    lancer(v._async_rattraper())
    assert [a[1] for a in v.hass.services.appels] == ["close_cover"]
    assert v.attente == {}, "l'ordre doit etre consomme, pas rejoue a chaque retour"


def test_un_ordre_perime_est_jete_plutot_qu_applique(creer):
    """Ouvrir a vingt-trois heures parce que l'integration est enfin revenue
    serait pire que de n'avoir rien fait."""
    import time as _t
    v = creer({"planning": {"actif": True, "mode": "auto"}}, ABSENT)
    lancer(v._async_planifie("ouvrir"))
    v.attente["cover.salon"]["expire"] = _t.time() - 1
    v.hass.states.table["cover.salon"] = FauxEtat("open", {"supported_features": 15})
    lancer(v._async_rattraper())
    assert v.hass.services.appels == [], "un ordre perime a ete applique"
    assert v.attente == {}


def test_les_volets_joignables_partent_quand_meme(creer):
    """Un seul volet absent ne doit pas retenir les autres."""
    etats = {
        "cover.la": FauxEtat("open", {"supported_features": 15}),
        "cover.absent": FauxEtat("unavailable", {"supported_features": 15}),
    }
    v = creer({"planning": {"actif": True, "mode": "auto"}}, etats)
    lancer(v._async_planifie("fermer"))
    assert [a[2]["entity_id"] for a in v.hass.services.appels] == [["cover.la"]]
    assert list(v.attente) == ["cover.absent"]


# ─────────────────────────────────────────────────────────────────────────────
# Le socle commun.
#
# Les volets sont le premier module a passer dessus. Ce qui suit verifie le
# BRANCHEMENT, pas le socle lui-meme — `test_regles.py` s'en charge.
# ─────────────────────────────────────────────────────────────────────────────


def test_une_main_sur_un_volet_arrete_la_regle(creer):
    """Le premier motif d'abandon : on remonte un volet, le dashboard le
    redescend, on le remonte encore, et l'on finit par tout debrancher."""
    from homeassistant.core import Context
    etats = {"cover.salon": FauxEtat("open", {"supported_features": 15})}
    v = creer({"planning": {"actif": True, "mode": "auto"}}, etats)

    class Evt:
        data = {"entity_id": "cover.salon"}
        context = Context(user_id="quelqu-un")

    v.regles.suivre("volets", ["cover.salon"])
    v.regles._sur_changement(Evt())
    lancer(v._async_planifie("fermer"))
    assert v.hass.services.appels == [], "la regle a bouscule une main"


def test_le_journal_dit_POURQUOI(creer):
    """La colonne qui manquait : « ferme » sans motif ne s'explique pas."""
    etats = {"cover.salon": FauxEtat("open", {"supported_features": 15})}
    v = creer({"planning": {"actif": True, "mode": "auto",
                            "fermeture": {"decalage": 30}}}, etats)
    lancer(v._async_planifie("fermer", decalage=30))
    ligne = lancer(v.regles.journal())[0]
    assert ligne["module"] == "volets"
    assert ligne["regle"] == "planning"
    assert ligne["motif"] == "coucher du soleil +30 min"
    assert ligne["cibles"] == ["cover.salon"]


def test_le_module_declare_ses_volets_au_socle(creer):
    """Sans declaration, aucune main n'est vue et le gel ne s'arme jamais.

    Elle se fait a l'evaluation du soleil et non a la programmation : les
    entites peuvent ne pas exister au demarrage.
    """
    etats = {"cover.salon": FauxEtat("open", {"supported_features": 15})}
    v = creer({"soleil": {"actif": False}}, etats)
    lancer(v._async_evaluer())
    assert v.regles._pilotees.get("volets") == {"cover.salon"}


def test_l_etat_montre_le_journal_commun(creer):
    """`async_etat` doit rendre le journal PARTAGE, pas une liste vide.

    Sans cette verification, remplacer la lecture du socle par `[]` passait
    inapercu — et l'ecran des volets serait muet sans que rien ne le dise.
    """
    etats = {"cover.salon": FauxEtat("open", {"supported_features": 15})}
    v = creer({"planning": {"actif": True, "mode": "auto",
                            "fermeture": {"decalage": 30}}}, etats)
    lancer(v._async_planifie("fermer", decalage=30))
    etat = lancer(v.async_etat())
    assert etat["journal"], "l'etat ne montre plus rien de ce que la regle a fait"
    assert etat["journal"][0]["regle"] == "planning"
    assert etat["journal"][0]["motif"] == "coucher du soleil +30 min"


def test_le_composant_transmet_le_socle_aux_volets():
    """Le cablage, lu dans la source.

    `__init__.py` importe le coeur de Home Assistant : il ne s'execute pas
    dans ces doublures. Mais un socle qu'on oublie de transmettre laisse
    `self.regles` a None, et la premiere commande leve une AttributeError en
    pleine nuit — vu qu'aucun test ne l'exercait, autant le lire.
    """
    from pathlib import Path
    src = Path(__file__).resolve().parents[2] / "custom_components" / "loggia" / "__init__.py"
    texte = src.read_text(encoding="utf-8")
    # La GARDE aussi, pas seulement la ligne : desarmee, le socle n'est jamais
    # cree, la ligne reste pourtant lisible dans le fichier, et le test passe.
    assert 'if not data.get("regles") and data.get("store"):' in texte, \
        "la garde du socle a saute : il ne serait plus cree"
    assert 'data["regles"] = Regles(hass, data["store"])' in texte, \
        "le socle n'est plus cree"
    assert 'LoggiaVolets(hass, data["store"], data.get("regles"))' in texte,         "les volets ne recoivent plus le socle"
    # Et il naît AVANT eux, sinon ils recevraient None.
    assert texte.index('data["regles"] = Regles') < texte.index("LoggiaVolets(hass"),         "le socle est cree apres les volets : ils recevraient None"


PLAN = {"actif": True, "jours": [0, 1, 2, 3, 4, 5, 6]}


# ── Les priorites declarees ─────────────────────────────────────────────────

def test_les_priorites_sont_declarees_une_fois_dans_cet_ordre(module):
    p = module.PRIORITES
    assert p["vent"] > p["coucher"] > p["soleil"] > p["lever"]


def test_la_nuit_ferme_ce_que_le_soleil_tenait_et_rien_ne_le_rouvre(creer):
    """Le defaut : le soleil baisse un volet l'apres-midi ; la fermeture du
    soir, decalee tot, le ferme ; puis le soleil quitte la facade et la
    protection le « rendait » a sa position d'avant — a la nuit tombee."""
    v = creer({**cfg_soleil(), "planning": PLAN}, {**SOLEIL_HAUT, **CHAUD, **VOLET})
    lancer(v._async_soleil())
    lancer(v._async_planifie("fermer"))
    assert v.hass.services.appels[-1][1] == "close_cover"
    v.hass.states.table["sun.sun"] = FauxEtat("above_horizon", {"azimuth": 60, "elevation": 30})
    lancer(v._async_soleil())
    assert v.hass.services.appels[-1][1] == "close_cover", "la protection a rouvert un volet ferme pour la nuit"


def test_la_protection_ne_rend_pas_ce_qu_elle_ne_tient_plus(creer):
    """Une main, ou plus fort, a pris le volet depuis : la protection ne le
    remet pas ou elle l'avait trouve."""
    v = creer(cfg_soleil(), {**SOLEIL_HAUT, **CHAUD, **VOLET})
    lancer(v._async_soleil())
    v.regles._tenues.pop("cover.salon", None)
    v.hass.states.table["sun.sun"] = FauxEtat("above_horizon", {"azimuth": 60, "elevation": 30})
    avant = len(v.hass.services.appels)
    lancer(v._async_soleil())
    assert len(v.hass.services.appels) == avant, "la protection a rendu un volet qu'elle ne tenait plus"
    assert v.abaisses == {}


def test_le_matin_n_ouvre_pas_un_volet_que_le_soleil_protege(creer):
    v = creer({**cfg_soleil(), "planning": PLAN}, {**SOLEIL_HAUT, **CHAUD, **VOLET})
    lancer(v._async_soleil())
    avant = len(v.hass.services.appels)
    lancer(v._async_planifie("ouvrir"))
    assert len(v.hass.services.appels) == avant, "le matin a ouvert face au soleil"
    assert v.abaisses == {"cover.salon": 100}, "la protection a oublie ce qu'elle tient"
    assert "1 tenu par soleil" in lancer(v.regles.journal())[0]["detail"]


def test_le_vent_tient_les_volets_puis_les_rend(creer):
    etats = {**SOLEIL_HAUT, **CHAUD, **VOLET, "sensor.vent": FauxEtat("70")}
    v = creer({**cfg_vent(), **cfg_soleil()}, etats)
    lancer(v._async_vent())
    assert v.regles.tenues("volets") == {"cover.salon": "vent"}
    v.hass.states.table["sensor.vent"] = FauxEtat("30")
    _calme_tenu(v)
    lancer(v._async_vent())
    assert v.regles.tenues("volets") == {}, "calme revenu, le vent retient encore les volets"


# ── Observer sans agir ──────────────────────────────────────────────────────

def test_en_simulation_rien_ne_bouge_mais_tout_est_note(creer):
    v = creer({"planning": PLAN, "simulation": {"actif": True}}, VOLET)
    lancer(v._async_planifie("fermer"))
    assert v.hass.services.appels == [], "la simulation a ferme un volet"
    ligne = lancer(v.regles.journal())[0]
    assert ligne["simule"] is True
    assert ligne["n"] == 1


def test_changer_de_mode_repart_de_la_maison_reelle(creer):
    """Une mise a l'abri simulee laissait `a_l_abri` vrai : le vrai vent,
    ensuite, ne remontait rien — la regle croyait l'avoir fait."""
    etats = {**SOLEIL_HAUT, **CHAUD, **VOLET, "sensor.vent": FauxEtat("70")}
    v = creer({**cfg_vent(), "simulation": {"actif": True}}, etats)
    lancer(v._async_vent())
    assert v.a_l_abri is True
    assert v.hass.services.appels == []
    v._repartir_de_zero()
    assert v.a_l_abri is False
    assert v.regles.tenues("volets") == {}
    v.cfg["simulation"]["actif"] = False
    lancer(v._async_vent())
    assert [a[1] for a in v.hass.services.appels] == ["open_cover"], "le vrai vent n'a rien remonte"


def test_basculer_la_simulation_remet_les_regles_a_zero(module):
    import inspect
    texte = inspect.getsource(module.LoggiaVolets.async_enregistrer)
    assert "!= simulait" in texte
    assert "self._repartir_de_zero()" in texte


def test_l_etat_dit_qui_l_emporte(creer):
    v = creer({}, VOLET)
    etat = lancer(v.async_etat())
    assert etat["priorites"] == ["vent", "coucher", "soleil", "lever"]
    assert etat["tenues"] == {}

def test_le_vent_est_une_question_de_surete(module):
    """Sur l'echelle de la maison, le vent est au palier surete : au-dessus
    de la presence et de la nuit, pas seulement des autres regles de volets."""
    regles = charger("regles")
    assert module.PRIORITES["vent"] >= regles.ECHELLE["surete"]
    for autre in ("coucher", "soleil", "lever"):
        assert module.PRIORITES[autre] < regles.ECHELLE["surete"]


# ─────────────────────────────────────────────────────────────────────────────
# Volet bloque (§1, ADR 0010) : on ne ferme pas sur une baie ouverte.
#
# Une porte-fenetre ouverte, quelqu'un sur la terrasse, et le coucher du
# soleil qui ferme le volet dessus. La regle retient la fermeture tant que la
# baie est ouverte et la rejoue quand elle se referme — jamais au-dela du
# matin. Un capteur muet ne vaut ni ouvert ni ferme : on ferme, et on le dit.
# ─────────────────────────────────────────────────────────────────────────────

BAIE = {"binary_sensor.baie": FauxEtat("on", {"device_class": "window"})}
CFG_BAIE = {"planning": {"actif": True, "mode": "auto"},
            "baies": {"actif": True, "volets": {"cover.salon": "binary_sensor.baie"}}}


def test_la_fermeture_attend_que_la_baie_se_referme(creer):
    v = creer(CFG_BAIE, {**VOLET, **BAIE})
    lancer(v._async_planifie("fermer"))
    assert v.hass.services.appels == [], "on a ferme un volet sur une baie ouverte"
    assert v.attente["cover.salon"]["sens"] == "fermer"
    assert v.attente["cover.salon"]["motif"] == "baie ouverte"
    ligne = lancer(v.regles.journal())[0]
    assert ligne["n"] == 0
    assert "baie ouverte" in ligne["detail"]


def test_la_baie_refermee_ferme_le_volet(creer):
    v = creer(CFG_BAIE, {**VOLET, **BAIE})
    lancer(v._async_planifie("fermer"))
    v.hass.states.table["binary_sensor.baie"] = FauxEtat("off", {})
    lancer(v._async_rattraper())
    assert [a[1] for a in v.hass.services.appels] == ["close_cover"]
    assert v.attente == {}
    ligne = lancer(v.regles.journal())[0]
    assert ligne["regle"] == "rattrapage"
    assert ligne["motif"] == "baie refermee"


def test_une_baie_encore_ouverte_retient_l_ordre(creer):
    v = creer(CFG_BAIE, {**VOLET, **BAIE})
    lancer(v._async_planifie("fermer"))
    # Quelque chose a bouge — pas la baie, toujours ouverte.
    lancer(v._async_rattraper())
    assert v.hass.services.appels == []
    assert "cover.salon" in v.attente


def test_un_capteur_muet_ne_bloque_pas_et_se_dit(creer):
    """ADR 0010 : dans le doute, on ferme — et le journal nomme le capteur."""
    v = creer(CFG_BAIE, {**VOLET, "binary_sensor.baie": FauxEtat("unavailable")})
    lancer(v._async_planifie("fermer"))
    assert [a[1] for a in v.hass.services.appels] == ["close_cover"]
    assert v.attente == {}
    assert any("capteur indisponible : binary_sensor.baie" in l["detail"]
               for l in lancer(v.regles.journal()))


def test_un_capteur_devenu_muet_libere_l_ordre(creer):
    """La baie etait ouverte au coucher ; la pile du capteur lache dans la
    nuit. Muet n'est pas ouvert : l'ordre part, et dit pourquoi."""
    v = creer(CFG_BAIE, {**VOLET, **BAIE})
    lancer(v._async_planifie("fermer"))
    v.hass.states.table["binary_sensor.baie"] = FauxEtat("unavailable")
    lancer(v._async_rattraper())
    assert [a[1] for a in v.hass.services.appels] == ["close_cover"]
    assert lancer(v.regles.journal())[0]["motif"] == "capteur indisponible"


def test_la_regle_debrayee_ne_retient_rien(creer):
    cfg = {"planning": {"actif": True, "mode": "auto"},
           "baies": {"actif": False, "volets": {"cover.salon": "binary_sensor.baie"}}}
    v = creer(cfg, {**VOLET, **BAIE})
    lancer(v._async_planifie("fermer"))
    assert [a[1] for a in v.hass.services.appels] == ["close_cover"]
    assert v.attente == {}


def test_l_ouverture_du_matin_ignore_la_baie(creer):
    """La regle retient les FERMETURES : ouvrir sur une baie ouverte ne bloque
    personne dehors."""
    v = creer(CFG_BAIE, {**VOLET, **BAIE})
    lancer(v._async_planifie("ouvrir"))
    assert [a[1] for a in v.hass.services.appels] == ["open_cover"]
    assert v.attente == {}


def test_le_volet_revenu_attend_encore_sa_baie(creer):
    """Un ordre retenu par la baie ne repart pas parce que le volet a bouge."""
    v = creer(CFG_BAIE, {**VOLET, **BAIE})
    lancer(v._async_planifie("fermer"))
    v.hass.states.table["cover.salon"] = FauxEtat("open", {"supported_features": 15, "current_position": 60})
    lancer(v._async_rattraper())
    assert v.hass.services.appels == []
    assert v.attente["cover.salon"]["motif"] == "baie ouverte"


def test_le_soleil_ne_baisse_pas_sur_une_baie_ouverte(creer):
    v = creer({**cfg_soleil(), "baies": CFG_BAIE["baies"]}, {**SOLEIL_HAUT, **CHAUD, **VOLET, **BAIE})
    lancer(v._async_evaluer())
    assert v.hass.services.appels == []
    assert v.abaisses == {}
    # La baie se referme : au prochain passage du soleil, la protection baisse.
    v.hass.states.table["binary_sensor.baie"] = FauxEtat("off", {})
    lancer(v._async_evaluer())
    assert [a[1] for a in v.hass.services.appels] == ["set_cover_position"]
    assert "cover.salon" in v.abaisses


def test_le_soleil_baisse_sur_un_capteur_muet_et_le_dit(creer):
    v = creer({**cfg_soleil(), "baies": CFG_BAIE["baies"]},
              {**SOLEIL_HAUT, **CHAUD, **VOLET, "binary_sensor.baie": FauxEtat("unavailable")})
    lancer(v._async_evaluer())
    assert [a[1] for a in v.hass.services.appels] == ["set_cover_position"]
    assert "capteur de baie indisponible" in lancer(v.regles.journal())[0]["motif"]


def test_l_attente_ecoute_aussi_la_baie(creer, monkeypatch):
    """Sans l'ecoute du capteur, la baie refermee ne rejouerait rien avant que
    le volet lui-meme ne bouge — peut-etre jamais de la soiree."""
    import sys as _sys
    suivis = []
    monkeypatch.setattr(_sys.modules["homeassistant.helpers.event"], "async_track_state_change_event",
                        lambda hass, ids, cb: suivis.append(list(ids)) or (lambda: None))
    v = creer(CFG_BAIE, {**VOLET, **BAIE})
    lancer(v._async_planifie("fermer"))
    assert suivis[-1] == ["binary_sensor.baie", "cover.salon"]


def test_la_baie_se_lit_en_pur(module):
    etats = FauxEtats({"binary_sensor.a": FauxEtat("on"), "binary_sensor.b": FauxEtat("off"),
                       "cover.porte": FauxEtat("open"), "binary_sensor.m": FauxEtat("unavailable")})
    assert module.etat_baie(etats, "binary_sensor.a") == "ouverte"
    assert module.etat_baie(etats, "binary_sensor.b") == "fermee"
    assert module.etat_baie(etats, "cover.porte") == "ouverte"
    assert module.etat_baie(etats, "binary_sensor.m") == "muette"
    assert module.etat_baie(etats, "binary_sensor.absent") == "muette"
    assert module.etat_baie(etats, "") == "aucune"
    assert module.etat_baie(etats, None) == "aucune"


def test_la_section_baies_a_ses_defauts(creer):
    v = creer({"planning": {"actif": True}}, VOLET)
    assert v.cfg["baies"] == {"actif": False, "volets": {}}


# ── Ordre non abouti (ADR 0007) ─────────────────────────────────────────────
# Deux minutes apres un ordre, un volet joignable doit avoir bouge. Sinon on
# redemande, `tentatives` fois, puis le journal le dit en rouge. Injoignable,
# il rejoint l'attente : une seule mecanique pour un seul defaut.

class Rendezvous:
    """Remplace `async_call_later` : garde le delai et le rappel, sans attendre."""

    def __init__(self):
        self.poses = []

    def __call__(self, hass, delai, rappel):
        entree = {"delai": delai, "rappel": rappel, "annule": False}
        self.poses.append(entree)

        def annuler():
            entree["annule"] = True
        return annuler

    def verifs(self):
        """Les verifications encore armees (le journal pose son ecriture a 20 s, pas ici)."""
        return [p for p in self.poses if p["delai"] == 120 and not p["annule"]]


@pytest.fixture
def rdv(monkeypatch):
    import sys as _sys
    r = Rendezvous()
    monkeypatch.setattr(_sys.modules["homeassistant.helpers.event"], "async_call_later", r, raising=False)
    return r


CFG_PLAN = {"planning": {"actif": True, "mode": "auto"}}


def _fermer(v):
    lancer(v._async_planifie("fermer"))


def _echoir(v, rdv):
    """Les deux minutes passent : le rendez-vous sonne, une fois."""
    (p,) = rdv.verifs()
    p["annule"] = True
    p["rappel"](None)
    lancer(v.hass.taches.pop())


def _rouges(v):
    return [e for e in lancer(v.regles.journal(module="volets")) if e.get("regle") == "non abouti"]


def test_les_cibles_et_les_tentatives_se_lisent_en_pur(module):
    assert module.cible_de("open_cover") == 100 and module.cible_de("close_cover") == 0
    assert module.cible_de("set_cover_position", {"position": 30}) == 30
    assert module.cible_de("set_cover_position", {"position": "haut"}) is None
    assert module.cible_de("stop_cover") is None
    assert module.atteint(0, 0) and module.atteint(96, 100) and module.atteint(34, 30)
    assert not module.atteint(50, 0) and not module.atteint(None, 0) and not module.atteint(0, None)
    for bon in (1, 2, 3):
        assert module.tentatives_valides(bon) == bon
    for mauvais in (0, 4, "2", 2.0, True, None):
        with pytest.raises(ValueError):
            module.tentatives_valides(mauvais)


def test_un_ordre_parti_se_verifie_deux_minutes_plus_tard_et_se_redemande(creer, rdv):
    v = creer(CFG_PLAN, {"cover.salon": FauxEtat("open", {"supported_features": 15, "current_position": 100})})
    _fermer(v)
    assert v.hass.services.appels == [("cover", "close_cover", {"entity_id": ["cover.salon"]})]
    (p,) = rdv.verifs()
    assert p["delai"] == 120 and set(v._verifs) == {"cover.salon"}
    # Deux minutes plus tard, rien n'a bouge : on redemande, et on reverifiera.
    _echoir(v, rdv)
    assert v.hass.services.appels[-1] == ("cover", "close_cover", {"entity_id": ["cover.salon"]})
    assert len(rdv.verifs()) == 1 and v._verifs["cover.salon"]["essais"] == 1
    j = lancer(v.regles.journal(module="volets"))
    assert j[0]["motif"] == "coucher du soleil · immobile, essai 1/2" and "echec" not in j[0]
    # Cette fois le volet est ferme : plus rien a redire.
    v.hass.states.table["cover.salon"] = FauxEtat("closed", {"supported_features": 15, "current_position": 0})
    _echoir(v, rdv)
    assert rdv.verifs() == [] and v._verifs == {} and _rouges(v) == []


def test_apres_les_tentatives_le_journal_le_dit_en_rouge(creer, rdv):
    v = creer({**CFG_PLAN, "verification": {"tentatives": 1}},
              {"cover.salon": FauxEtat("open", {"supported_features": 15, "current_position": 100})})
    _fermer(v)
    _echoir(v, rdv)   # essai 1/1
    _echoir(v, rdv)   # toujours immobile : la ligne rouge
    (rouge,) = _rouges(v)
    assert rouge["echec"] is True and rouge["detail"] == "cover.salon" and rouge["n"] == 0
    assert rouge["quoi"] == "fermer" and rouge["motif"] == "immobile apres 1 essai"
    assert rdv.verifs() == [] and v._verifs == {}
    assert len([a for a in v.hass.services.appels if a[1] == "close_cover"]) == 2, "l'ordre, une reprise, puis on s'arrete"
    # Les autres lignes n'ont pas le drapeau : il ne marque que l'echec.
    assert all("echec" not in e for e in lancer(v.regles.journal(module="volets")) if e.get("regle") != "non abouti")


def test_un_volet_sans_position_ni_etat_clair_ne_se_verifie_pas(creer, rdv):
    v = creer(CFG_PLAN, {"cover.salon": FauxEtat("open", {"supported_features": 15})})
    _fermer(v)
    # En mouvement au moment de verifier : on ne sait pas, on ne se trompe pas.
    v.hass.states.table["cover.salon"] = FauxEtat("closing", {"supported_features": 15})
    _echoir(v, rdv)
    assert len(v.hass.services.appels) == 1 and rdv.verifs() == [] and _rouges(v) == []
    # Un volet sans position se juge par ouvert / ferme : ferme, c'est atteint.
    w = creer(CFG_PLAN, {"cover.salon": FauxEtat("open", {"supported_features": 3})})
    _fermer(w)
    w.hass.states.table["cover.salon"] = FauxEtat("closed", {"supported_features": 3})
    _echoir(w, rdv)
    assert len(w.hass.services.appels) == 1 and _rouges(w) == []


def test_un_volet_devenu_injoignable_rejoint_l_attente(creer, rdv):
    v = creer(CFG_PLAN, {"cover.salon": FauxEtat("open", {"supported_features": 15})})
    _fermer(v)
    v.hass.states.table["cover.salon"] = FauxEtat("unavailable", {})
    _echoir(v, rdv)
    assert v.attente["cover.salon"]["sens"] == "fermer"
    assert len(v.hass.services.appels) == 1 and _rouges(v) == []


def test_une_main_posee_entre_temps_arrete_les_reprises_en_silence(creer, rdv):
    v = creer(CFG_PLAN, {"cover.salon": FauxEtat("open", {"supported_features": 15, "current_position": 100})})
    _fermer(v)
    lancer(v.regles.geler("interrupteurs", "bouton", ["cover.salon"]))
    _echoir(v, rdv)
    assert len(v.hass.services.appels) == 1, "le socle ecarte ce que quelqu'un tient"
    assert rdv.verifs() == [] and v._verifs == {} and _rouges(v) == []


def test_un_nouvel_ordre_remplace_la_verification_la_simulation_n_en_pose_pas(creer, rdv):
    v = creer(CFG_PLAN, {"cover.salon": FauxEtat("open", {"supported_features": 15, "current_position": 100})})
    _fermer(v)
    _fermer(v)
    assert len(rdv.verifs()) == 1
    assert len([p for p in rdv.poses if p["delai"] == 120 and p["annule"]]) == 1, "la premiere est annulee"
    s = creer({**CFG_PLAN, "simulation": {"actif": True}}, {"cover.salon": FauxEtat("open", {"supported_features": 15})})
    lancer(s._async_planifie("fermer"))
    assert s._verifs == {} and len(rdv.verifs()) == 1, "en simulation, rien n'est parti : rien a verifier"
    # Du simule au reel : ce qui restait a verifier s'oublie.
    v._repartir_de_zero()
    assert v._verifs == {} and rdv.verifs() == []


def test_le_reglage_des_tentatives_a_son_defaut_et_ses_bornes(creer):
    v = creer(CFG_PLAN, VOLET)
    assert v.cfg["verification"] == {"tentatives": 2}
    assert lancer(v.async_enregistrer({"verification": {"tentatives": 3}}))["verification"]["tentatives"] == 3
    for mauvais in (0, 4, "2"):
        with pytest.raises(ValueError):
            lancer(v.async_enregistrer({"verification": {"tentatives": mauvais}}))


# ── Le calcul suit le moteur (chantier Volets, spec 6.2) ────────────────────
# `volets_calcul.py` dit a l'ecran quand chaque volet bougera ; c'est le MOTEUR
# qui le fait bouger. Ici le vrai `_async_planifie`, cloche par cloche, sur
# chaque plan de la fixture partagee et chaque jour d'une semaine : ce qu'il
# commande doit etre ce que le calcul annonce - le jour, et le decalage.

PARITE = json.loads((Path(__file__).resolve().parents[2] / "tests" / "fixtures"
                     / "volets_parite.json").read_text(encoding="utf-8"))


def _commande_du_moteur(module, creer, plan, haid, sens):
    """Les decalages auxquels `_async_planifie` commande ce volet ce jour-la, un
    par ordre : une LISTE, pour qu'un moteur qui le commanderait deux fois se
    voie - et le plan tel que le moteur le lit (les defauts compris)."""
    court = "ouvrir" if sens == "ouverture" else "fermer"
    etats = {h: FauxEtat("open", {"supported_features": 15, "current_position": 50}) for h in PARITE["volets"]}
    v = creer({"planning": plan}, etats)
    commandes = []
    for decalage in sorted(module.decalages_du_plan(v.cfg["planning"], sens)):
        v.hass.services.appels.clear()
        lancer(v._async_planifie(court, decalage=decalage))
        commandes += [decalage for a in v.hass.services.appels if haid in a[2]["entity_id"]]
    return commandes, v.cfg["planning"]


@pytest.mark.parametrize("nom", sorted(PARITE["plans"]))
@pytest.mark.parametrize("haid", PARITE["volets"])
def test_le_calcul_suit_le_moteur(module, creer, monkeypatch, nom, haid):
    calc = charger("volets_calcul")
    for jour in range(7):
        quand = datetime(2026, 10, 19 + jour, 12, 0)       # lundi 19/10, puis la semaine
        monkeypatch.setattr(sys.modules["homeassistant.util.dt"], "now", lambda q=quand: q)
        for sens in ("ouverture", "fermeture"):
            commandes, plan = _commande_du_moteur(module, creer, PARITE["plans"][nom], haid, sens)
            annonce = [calc.decalage_de(plan, haid, sens)] if calc.bouge(plan, haid, sens, jour) else []
            assert commandes == annonce, (nom, haid, sens, jour)


# ── Ce que l'etat publie pour chaque volet (chantier Volets, spec 6.1) ──────
# Les doublures de Home Assistant n'ont ni `helpers.sun` ni `const` : on les
# pose le temps d'un test. L'heure de la maison est figee au mercredi
# 21/10/2026 a 12:00, a Paris (+02:00) - le vrai fuseau de Paris, changements
# d'heure compris (`FuseauParis`, ecrit a la main dans test_chauffage.py : la
# machine de developpement n'a pas de base des fuseaux). L'heure d'hiver revient
# le dimanche 25/10.

PARIS = FuseauParis()
MIDI = datetime(2026, 10, 21, 12, 0, tzinfo=PARIS)


@pytest.fixture
def maintenant(monkeypatch):
    monkeypatch.setattr(sys.modules["homeassistant.util.dt"], "now", lambda: MIDI)
    return MIDI


@pytest.fixture
def soleil_ha(monkeypatch):
    """`homeassistant.helpers.sun` et `homeassistant.const`, comme les vrais :
    `get_astral_event_date` rend l'evenement de la date UTC qu'on lui donne, en
    instant UTC, ou None quand il n'a pas lieu. Ici le lever a 06:14:10 UTC et le
    coucher a 16:58:40 UTC chaque jour (`heures` les change) ; `sans` : les dates
    sans soleil ; `panne` : une erreur qui passe - le vrai avale ValueError, et
    rend alors None comme pour un jour sans lever ; `appels` : ce qu'on lui a
    demande."""
    etat = types.SimpleNamespace(sans=set(), panne=False, appels=0,
                                 heures={"sunrise": (6, 14, 10), "sunset": (16, 58, 40)})

    def get_astral_event_date(hass, evenement, jour):
        etat.appels += 1
        if etat.panne:
            raise RuntimeError("emplacement illisible")
        if jour in etat.sans:
            return None
        h, m, s = etat.heures[evenement]
        return datetime(jour.year, jour.month, jour.day, h, m, s, tzinfo=timezone.utc)

    sun = types.ModuleType("homeassistant.helpers.sun")
    sun.get_astral_event_date = get_astral_event_date
    const = types.ModuleType("homeassistant.const")
    const.SUN_EVENT_SUNRISE, const.SUN_EVENT_SUNSET = "sunrise", "sunset"
    monkeypatch.setitem(sys.modules, "homeassistant.helpers.sun", sun)
    monkeypatch.setitem(sys.modules, "homeassistant.const", const)
    return etat


# Sa configuration du 12/10 : la chambre ne s'ouvre jamais seule, le salon
# garde l'ancienne forme, le groupe est exclu ; le garage n'est pas un volet.
CHEZ_LUI = {"planning": {"actif": True, "mode": "auto", "ouverture": {"decalage": 30},
                         "fermeture": {"decalage": 30}, "volets": {
                             "cover.chambre": {"perso": True, "ouverture": None, "fermeture": 30,
                                               "jours_ouverture": []},
                             "cover.salon": {"ouverture": 30, "fermeture": 30},
                             "cover.groupe": {"exclu": True}}}}
TROIS = {"cover.chambre": FauxEtat("closed", {"supported_features": 15, "current_position": 1}),
         "cover.salon": FauxEtat("open", {"supported_features": 15, "current_position": 100}),
         "cover.groupe": FauxEtat("open", {"supported_features": 15}),
         "cover.garage": FauxEtat("closed", {"device_class": "garage"})}


def test_l_etat_dit_l_heure_de_la_maison_et_le_soleil_de_la_semaine(creer, maintenant, soleil_ha):
    etat = lancer(creer(CHEZ_LUI, TROIS).async_etat())
    assert etat["maintenant"] == "2026-10-21T12:00:00+02:00"
    jours = etat["soleil_jours"]
    # Du lundi de la semaine en cours a aujourd'hui + 7 jours : 19/10 -> 28/10.
    assert [j["date"] for j in jours] == ["2026-10-%02d" % d for d in range(19, 29)]
    assert jours[0] == {"date": "2026-10-19", "lever": "2026-10-19T08:14:10+02:00",
                        "coucher": "2026-10-19T18:58:40+02:00"}


def test_un_jour_sans_lever_ni_coucher_se_dit_par_none(creer, maintenant, soleil_ha):
    soleil_ha.sans = {date(2026, 10, 22)}
    jours = lancer(creer(CHEZ_LUI, TROIS).async_etat())["soleil_jours"]
    assert jours[3] == {"date": "2026-10-22", "lever": None, "coucher": None}


def test_le_soleil_illisible_vide_la_semaine_et_se_dit_une_fois(creer, maintenant, soleil_ha, caplog, monkeypatch):
    caplog.set_level(logging.WARNING)
    v = creer(CHEZ_LUI, TROIS)
    soleil_ha.panne = True
    for _ in range(3):
        etat = lancer(v.async_etat())
        assert etat["soleil_jours"] == [] and etat["volets"]["cover.salon"]["a_venir"] == []
    dits = [r for r in caplog.records if "heures du soleil illisibles" in r.getMessage()]
    assert len(dits) == 1, "le sondage de l'ecran remplirait le journal"
    # Revenu, il se lit, et ses heures se gardent pour la journee : reparti le
    # meme jour, il ne se voit pas. Le lendemain, il se redit - une fois.
    soleil_ha.panne = False
    assert lancer(v.async_etat())["soleil_jours"]
    soleil_ha.panne = True
    assert lancer(v.async_etat())["soleil_jours"], "les heures de la journee sont gardees"
    monkeypatch.setattr(sys.modules["homeassistant.util.dt"], "now", lambda: MIDI + timedelta(days=1))
    lancer(v.async_etat())
    lancer(v.async_etat())
    assert len([r for r in caplog.records if "heures du soleil illisibles" in r.getMessage()]) == 2


def test_l_heure_d_hiver_se_dit_par_son_decalage(creer, maintenant, soleil_ha):
    """Paris repasse a l'heure d'hiver le dimanche 25/10 a 03:00 : un lever a
    06:14:10 UTC s'ecrit 08:14:10+02:00 le samedi, 07:14:10+01:00 le lundi."""
    jours = {j["date"]: j for j in lancer(creer(CHEZ_LUI, TROIS).async_etat())["soleil_jours"]}
    assert jours["2026-10-24"]["lever"] == "2026-10-24T08:14:10+02:00"
    assert jours["2026-10-26"] == {"date": "2026-10-26", "lever": "2026-10-26T07:14:10+01:00",
                                   "coucher": "2026-10-26T17:58:40+01:00"}


def test_le_lundi_apres_minuit_la_fermeture_du_dimanche_est_encore_a_venir(creer, soleil_ha, monkeypatch):
    """Le coucher du dimanche 14/06 a 21:57:22, +240 min : la fermeture sonne le
    lundi a 01:57:22, et la maison ferme le lundi. A 00:30, elle est encore a
    venir. `soleil_jours` publie pourtant la semaine A PARTIR du lundi : la
    veille ne sert qu'au calcul (cas « veille_du_lundi » de la fixture)."""
    lundi = datetime(2026, 6, 15, 0, 30, tzinfo=PARIS)
    monkeypatch.setattr(sys.modules["homeassistant.util.dt"], "now", lambda: lundi)
    soleil_ha.heures = {"sunrise": (3, 46, 2), "sunset": (19, 57, 22)}
    tard = {"planning": {"actif": True, "mode": "auto", "ouverture": {"decalage": 0},
                         "fermeture": {"decalage": 240}, "jours": [0, 1, 2, 3, 4]}}
    etat = lancer(creer(tard, TROIS).async_etat())
    assert [j["date"] for j in etat["soleil_jours"]] == ["2026-06-%02d" % d for d in range(15, 23)]
    assert etat["volets"]["cover.salon"]["a_venir"][:2] == [
        {"sens": "fermeture", "heure": "2026-06-15T01:57:22+02:00", "source": "coucher", "decalage": 240},
        {"sens": "ouverture", "heure": "2026-06-15T05:46:02+02:00", "source": "lever", "decalage": 0}]


@pytest.mark.parametrize("decalage,heures,premier", [
    (9, {"sunrise": (20, 30, 0), "sunset": (8, 0, 0)},
     {"date": "2026-10-19", "lever": "2026-10-19T05:30:00+09:00", "coucher": "2026-10-19T17:00:00+09:00"}),
    (-7, {"sunrise": (14, 0, 0), "sunset": (2, 30, 0)},
     {"date": "2026-10-19", "lever": "2026-10-19T07:00:00-07:00", "coucher": "2026-10-19T19:30:00-07:00"}),
], ids=["tokyo", "los_angeles"])
def test_loin_de_l_utc_chaque_evenement_se_range_sous_sa_date_locale(creer, soleil_ha, monkeypatch,
                                                                    decalage, heures, premier):
    """`get_astral_event_date` rend l'evenement de la DATE UTC qu'on lui donne. A
    Tokyo, le lever de 05:30 tombe a 20:30 UTC la veille ; a Los Angeles l'ete, le
    coucher de 19:30 tombe a 02:30 UTC le lendemain. Chaque ligne porte les
    heures de SA date, a l'heure de la maison."""
    fuseau = timezone(timedelta(hours=decalage))
    monkeypatch.setattr(sys.modules["homeassistant.util.dt"], "now",
                        lambda: datetime(2026, 10, 21, 12, 0, tzinfo=fuseau))
    soleil_ha.heures = heures
    jours = lancer(creer(CHEZ_LUI, TROIS).async_etat())["soleil_jours"]
    assert [j["date"] for j in jours] == ["2026-10-%02d" % d for d in range(19, 29)]
    assert jours[0] == premier
    for j in jours:
        assert j["lever"].startswith(j["date"] + "T") and j["coucher"].startswith(j["date"] + "T"), j


def test_les_heures_du_soleil_se_gardent_pour_la_journee(creer, maintenant, soleil_ha, monkeypatch):
    """L'ecran sonde toutes les cinq secondes : les heures du soleil ne se
    redemandent qu'a un autre jour, un autre fuseau ou un autre emplacement de
    la maison - ce dont elles dependent."""
    v = creer(CHEZ_LUI, TROIS)
    premier = lancer(v.async_etat())["soleil_jours"]
    demandes = soleil_ha.appels
    assert demandes > 0
    assert lancer(v.async_etat())["soleil_jours"] == premier
    assert soleil_ha.appels == demandes, "le second sondage a tout redemande"
    monkeypatch.setattr(sys.modules["homeassistant.util.dt"], "now", lambda: MIDI + timedelta(days=1))
    assert lancer(v.async_etat())["soleil_jours"][-1]["date"] == "2026-10-29", "le lendemain, la semaine avance"
    lendemain = soleil_ha.appels
    assert lendemain > demandes
    v.hass.config.latitude = 43.3
    lancer(v.async_etat())
    assert soleil_ha.appels > lendemain, "la maison a change de place"


def test_chaque_volet_dit_sa_regle_et_ses_prochains_mouvements(creer, maintenant, soleil_ha):
    volets = lancer(creer(CHEZ_LUI, TROIS).async_etat())["volets"]
    assert sorted(volets) == ["cover.chambre", "cover.groupe", "cover.salon"], "un garage n'est pas un volet"
    assert {h: v["regle"] for h, v in volets.items()} == {
        "cover.chambre": "perso", "cover.groupe": "jamais", "cover.salon": "perso"}
    assert volets["cover.salon"]["a_venir"][:2] == [
        {"sens": "fermeture", "heure": "2026-10-21T19:28:40+02:00", "source": "coucher", "decalage": 30},
        {"sens": "ouverture", "heure": "2026-10-22T08:44:10+02:00", "source": "lever", "decalage": 30}]
    assert len(volets["cover.salon"]["a_venir"]) == 14
    assert {m["sens"] for m in volets["cover.chambre"]["a_venir"]} == {"fermeture"}, "la chambre ne s'ouvre jamais seule"
    assert volets["cover.groupe"]["a_venir"] == []


def test_la_porte_devant_se_lit_meme_quand_la_regle_est_coupee(creer, maintenant, soleil_ha):
    cfg = {**CHEZ_LUI, "baies": {"actif": False, "volets": {"cover.salon": "binary_sensor.baie",
                                                             "cover.chambre": "binary_sensor.fenetre"}}}
    etats = {**TROIS, "binary_sensor.baie": FauxEtat("on", {"device_class": "door"}),
             "binary_sensor.fenetre": FauxEtat("unavailable", {})}
    volets = lancer(creer(cfg, etats).async_etat())["volets"]
    assert volets["cover.salon"]["porte"] == {"entite": "binary_sensor.baie", "etat": "ouverte"}
    assert volets["cover.chambre"]["porte"] == {"entite": "binary_sensor.fenetre", "etat": "muette"}
    assert volets["cover.groupe"]["porte"] is None


def test_l_attente_l_abri_et_la_facade_se_lisent_volet_par_volet(creer, maintenant, soleil_ha, monkeypatch):
    # L'horloge du module, figee au meme midi que `dt_util.now` (MIDI, le 21/10) :
    # la publication de l'etat purge les attentes expirees sur `time.time()` - la
    # vraie heure -, et l'attente du 22/10 ci-dessous disparaissait des que ce
    # jour etait passe (vu le 25/10). Le test ne depend plus du jour ou il tourne.
    monkeypatch.setattr(time, "time", lambda: maintenant.timestamp())
    cfg = {**CHEZ_LUI, "soleil": {"volets": {"cover.salon": {"orientation": 225},
                                             "cover.chambre": {"orientation": "-45"}}}}
    v = creer(cfg, TROIS)
    expire = datetime(2026, 10, 22, 8, 14, 10, tzinfo=PARIS).timestamp()
    v.attente["cover.salon"] = {"sens": "fermer", "expire": expire, "motif": "baie ouverte"}
    v.a_l_abri = True
    volets = lancer(v.async_etat())["volets"]
    assert volets["cover.salon"]["attente"] == {"sens": "fermer", "motif": "baie ouverte",
                                                "expire": "2026-10-22T08:14:10+02:00"}
    assert volets["cover.chambre"]["attente"] is None
    assert all(x["abri"] is True for x in volets.values())
    assert volets["cover.salon"]["orientation"] == 225
    assert volets["cover.chambre"]["orientation"] == 315
    assert volets["cover.groupe"]["orientation"] is None


# ── Quand la protection relache (chantier Volets, spec 6.3) ─────────────────

class SoleilQuiTourne:
    """Un soleil de test : plein sud (180) a 12:00 UTC le 21/10/2026, qui tourne
    de 15 degres par heure, a 40 degres de haut jusqu'a midi puis descend de 5
    degres par heure. Il sert de `position_soleil` et d'emplacement astral
    (`solar_azimuth`, `solar_elevation`), et compte ce qu'on lui demande."""

    MIDI_UTC = datetime(2026, 10, 21, 12, 0, tzinfo=timezone.utc)

    def __init__(self):
        self.appels = 0

    def _heures(self, instant):
        return (instant - self.MIDI_UTC).total_seconds() / 3600

    def __call__(self, instant):
        self.appels += 1
        return self.solar_azimuth(instant, 0), self.solar_elevation(instant, 0)

    def solar_azimuth(self, instant, altitude):
        return 180.0 + 15.0 * self._heures(instant)

    def solar_elevation(self, instant, altitude):
        return 40.0 - 5.0 * max(0.0, self._heures(instant))


def test_la_protection_relache_quand_le_soleil_descend_sous_la_hauteur_minimale(module):
    """A 17:00 UTC il est a 15 degres pile - encore au soleil (`au_soleil` veut
    moins de 15 pour sortir) ; a 17:05 il est dessous : la grille le dit."""
    fin = module.fin_protection(SoleilQuiTourne(), 225, 90, 15, MIDI)
    assert fin == datetime(2026, 10, 21, 17, 5, tzinfo=timezone.utc)


def test_la_protection_relache_avec_l_hysterese_de_la_regle(module):
    """Facade 225, cone de 90 : le soleil a 310 y est encore SANS hysterese
    (310 <= 315), plus AVEC (310 > 307) - et c'est avec elle que la regle rend
    le volet. La premiere case de la grille le dit."""
    def fixe(instant):
        return 310.0, 40.0
    assert module.fin_protection(fixe, 225, 90, 15, MIDI) == datetime(2026, 10, 21, 10, 5, tzinfo=timezone.utc)


def test_vingt_quatre_heures_au_plus_par_pas_de_cinq_minutes(module):
    soleil = SoleilQuiTourne()

    def toujours_en_face(instant):
        soleil(instant)
        return 225.0, 40.0
    assert module.fin_protection(toujours_en_face, 225, 90, 15, MIDI) is None
    assert soleil.appels == 288, "24 h par pas de 5 min"


def test_une_position_illisible_ne_dit_rien(module):
    def panne(instant):
        raise ValueError("astral")
    assert module.fin_protection(panne, 225, 90, 15, MIDI) is None
    assert module.fin_protection(lambda instant: (None, 40.0), 225, 90, 15, MIDI) is None


@pytest.fixture
def lieu_ha(soleil_ha, monkeypatch):
    """`get_astral_location`, comme le vrai : (l'emplacement astral, l'altitude)."""
    lieu = SoleilQuiTourne()
    monkeypatch.setattr(sys.modules["homeassistant.helpers.sun"], "get_astral_location",
                        lambda hass: (lieu, 35), raising=False)
    return lieu


def _tenu_au_soleil(v, haid, avant):
    """Ce que laisse la protection quand elle baisse un volet (`_async_soleil`) :
    elle le TIENT, par le socle, et retient d'ou elle l'a pris."""
    lancer(v.regles.agir("volets", "soleil", "cover", "set_cover_position", [haid], {"position": 30},
                         quoi="proteger", priorite=charger("volets").PRIORITES["soleil"], tenir=True))
    v.abaisses[haid] = avant


PROTEGE = {**CHEZ_LUI, "soleil": {"actif": True, "elevation_min": 15,
                                  "volets": {"cover.salon": {"orientation": 225, "ouverture": 90}}}}


def test_un_volet_protege_dit_jusqu_a_quand_et_ou_il_reviendra(creer, maintenant, lieu_ha):
    cfg = {**CHEZ_LUI, "soleil": {"actif": True, "elevation_min": 15,
                                  "volets": {"cover.salon": {"orientation": 225, "ouverture": 90}}}}
    v = creer(cfg, TROIS)
    _tenu_au_soleil(v, "cover.salon", 70)
    volets = lancer(v.async_etat())["volets"]
    assert volets["cover.salon"]["protection"] == {"jusqu_a": "2026-10-21T19:05:00+02:00",
                                                   "position": 70, "orientation": 225}
    assert volets["cover.chambre"]["protection"] is None
    # Une position d'avant inconnue : elle le rendra grand ouvert (`_async_rendre`).
    v.abaisses = {"cover.salon": None}
    assert lancer(v.async_etat())["volets"]["cover.salon"]["protection"]["position"] == 100


def test_sans_la_position_du_soleil_la_protection_ne_dit_pas_d_heure(creer, maintenant, soleil_ha, caplog):
    caplog.set_level(logging.WARNING)
    cfg = {**CHEZ_LUI, "soleil": {"actif": True, "volets": {"cover.salon": {"orientation": 225}}}}
    v = creer(cfg, TROIS)
    _tenu_au_soleil(v, "cover.salon", 70)
    for _ in range(2):
        assert lancer(v.async_etat())["volets"]["cover.salon"]["protection"] == {
            "jusqu_a": None, "position": 70, "orientation": 225}
    assert len([r for r in caplog.records if "position du soleil illisible" in r.getMessage()]) == 1


def test_la_protection_ne_promet_que_ce_qu_elle_rendra(creer, maintenant, lieu_ha):
    """Releve a la main, un volet reste dans `abaisses`, mais la protection ne le
    rendra pas : `_async_rendre` exige qu'elle le tienne encore. Coupee, elle ne
    rend plus rien : `_async_soleil` s'arrete. L'etat ne promet pas une remontee
    qui n'arrivera pas."""
    from homeassistant.core import Context

    class Main:
        data = {"entity_id": "cover.salon"}
        context = Context(user_id="quelqu-un")

    v = creer(PROTEGE, TROIS)
    _tenu_au_soleil(v, "cover.salon", 70)
    assert lancer(v.async_etat())["volets"]["cover.salon"]["protection"]["position"] == 70
    v.regles._sur_changement(Main())
    assert v.abaisses == {"cover.salon": 70}, "il reste baisse aux yeux de la regle"
    assert lancer(v.async_etat())["volets"]["cover.salon"]["protection"] is None
    coupee = creer({**PROTEGE, "soleil": {**PROTEGE["soleil"], "actif": False}}, TROIS)
    _tenu_au_soleil(coupee, "cover.salon", 70)
    assert lancer(coupee.async_etat())["volets"]["cover.salon"]["protection"] is None


def test_la_fin_de_la_protection_se_garde_tant_qu_elle_n_est_pas_passee(creer, maintenant, lieu_ha, monkeypatch):
    """Chercher la fin coute jusqu'a 288 pas de cinq minutes, et l'ecran sonde
    toutes les cinq secondes : on la garde, par volet et par reglages, tant
    qu'elle n'est pas passee - la grille est fixe. Mesure : les positions du
    soleil demandees, sur deux sondages."""
    positions = []
    vraie = lieu_ha.solar_azimuth
    lieu_ha.solar_azimuth = lambda instant, altitude: positions.append(instant) or vraie(instant, altitude)
    v = creer(PROTEGE, TROIS)
    _tenu_au_soleil(v, "cover.salon", 70)
    premier = lancer(v.async_etat())["volets"]["cover.salon"]["protection"]
    assert premier["jusqu_a"] == "2026-10-21T19:05:00+02:00"
    assert len(positions) == 85, "de 10:05 a 17:05 UTC, par pas de cinq minutes"
    assert lancer(v.async_etat())["volets"]["cover.salon"]["protection"] == premier
    assert len(positions) == 85, "le second sondage a tout recalcule"
    # La fin passee - le soleil sous la hauteur minimale -, on cherche la suivante.
    monkeypatch.setattr(sys.modules["homeassistant.util.dt"], "now", lambda: MIDI + timedelta(hours=7, minutes=6))
    assert lancer(v.async_etat())["volets"]["cover.salon"]["protection"]["jusqu_a"] == "2026-10-21T19:10:00+02:00"
    assert len(positions) == 86
    # D'autres reglages, ou une maison qui change de place : on recalcule.
    v.cfg["soleil"]["volets"]["cover.salon"]["ouverture"] = 60
    lancer(v.async_etat())
    assert len(positions) == 87
    v.hass.config.latitude = 43.3
    lancer(v.async_etat())
    assert len(positions) == 88
    # Un volet qui n'est plus baisse sort de ce qu'on garde.
    v.abaisses.clear()
    lancer(v.async_etat())
    assert v._fins == {}


# ── Le journal plus precis, et la manoeuvre en cours (spec 6.4 et 6.1) ──────

def test_la_protection_note_sa_facade_et_la_temperature_du_dehors(creer):
    haut = {"cover.salon": FauxEtat("open", {"supported_features": 15, "current_position": 70})}
    v = creer(cfg_soleil(), {**SOLEIL_HAUT, **CHAUD, **haut})
    lancer(v._async_soleil())
    proteger = lancer(v.regles.journal(module="volets"))[0]
    assert (proteger["quoi"], proteger["cible"], proteger["orientation"], proteger["dehors"]) == (
        "proteger", 30, 225, 29.0)
    v.hass.states.table["sun.sun"] = FauxEtat("above_horizon", {"azimuth": 60, "elevation": 30})
    lancer(v._async_soleil())
    rouvrir = lancer(v.regles.journal(module="volets"))[0]
    assert (rouvrir["quoi"], rouvrir["cible"], rouvrir["orientation"], rouvrir["dehors"]) == (
        "rouvrir", 70, 225, 29.0)


def test_le_planning_note_sa_cible_sans_facade(creer):
    v = creer(CFG_PLAN, {"cover.salon": FauxEtat("open", {"supported_features": 15})})
    _fermer(v)
    ligne = lancer(v.regles.journal(module="volets"))[0]
    assert ligne["cible"] == 0 and "orientation" not in ligne and "dehors" not in ligne


def test_la_reprise_d_une_protection_garde_sa_facade(creer, rdv):
    haut = {"cover.salon": FauxEtat("open", {"supported_features": 15, "current_position": 70})}
    v = creer(cfg_soleil(), {**SOLEIL_HAUT, **CHAUD, **haut})
    lancer(v._async_soleil())
    _echoir(v, rdv)                       # 120 s : une position ne bascule rien, premier tour
    _echoir(v, rdv)                       # 240 s : toujours a 70, on redemande
    reprise = lancer(v.regles.journal(module="volets"))[0]
    assert reprise["motif"].endswith("essai 1/2")
    assert (reprise["cible"], reprise["orientation"], reprise["dehors"]) == (30, 225, 29.0)


def test_la_manoeuvre_en_cours_est_publiee_puis_effacee(creer, rdv, maintenant, monkeypatch):
    ordre = datetime(2026, 10, 21, 11, 58, 30, tzinfo=PARIS).timestamp()
    monkeypatch.setattr(time, "time", lambda: ordre)
    v = creer(CFG_PLAN, {"cover.salon": FauxEtat("open", {"supported_features": 15, "current_position": 100})})
    _fermer(v)
    assert lancer(v.async_etat())["volets"]["cover.salon"]["manoeuvre"] == {
        "cible": 0, "depuis": "2026-10-21T11:58:30+02:00", "regle": "planning"}
    v.hass.states.table["cover.salon"] = FauxEtat("closed", {"supported_features": 15, "current_position": 0})
    _echoir(v, rdv)
    assert lancer(v.async_etat())["volets"]["cover.salon"]["manoeuvre"] is None


def test_une_main_efface_la_manoeuvre_en_cours(creer, rdv, maintenant):
    """Le planning ferme le salon, puis quelqu'un le rouvre depuis l'appli : la
    descente n'est plus ce que fait le volet. La verification attend encore,
    mais l'ecran ne doit plus jouer cette course."""
    from homeassistant.core import Context

    class Main:
        data = {"entity_id": "cover.salon"}
        context = Context(user_id="quelqu-un")

    v = creer(CFG_PLAN, {"cover.salon": FauxEtat("open", {"supported_features": 15, "current_position": 100})})
    _fermer(v)
    assert lancer(v.async_etat())["volets"]["cover.salon"]["manoeuvre"]["cible"] == 0
    v.regles._sur_changement(Main())
    assert "cover.salon" in v._verifs, "la verification attend encore"
    assert lancer(v.async_etat())["volets"]["cover.salon"]["manoeuvre"] is None


def test_une_regle_qui_reprend_le_volet_efface_la_manoeuvre(creer, rdv, maintenant):
    """Le planning ferme le salon ; une alerte le remonte, et le TIENT : ce n'est
    plus la regle de l'ordre qui le tient, la descente n'est plus a jouer. Une
    regle des volets qui tient elle-meme son volet - la protection - garde sa
    manoeuvre."""
    v = creer(CFG_PLAN, {"cover.salon": FauxEtat("open", {"supported_features": 15, "current_position": 100})})
    _fermer(v)
    lancer(v.regles.agir("alertes", "danger", "cover", "open_cover", ["cover.salon"], quoi="remonter",
                         priorite=charger("alertes").PRIORITE, tenir=True))
    assert "cover.salon" in v._verifs and v.regles.tenues_toutes()["cover.salon"]["module"] == "alertes"
    assert lancer(v.async_etat())["volets"]["cover.salon"]["manoeuvre"] is None
    haut = {"cover.salon": FauxEtat("open", {"supported_features": 15, "current_position": 70})}
    w = creer(cfg_soleil(), {**SOLEIL_HAUT, **CHAUD, **haut})
    lancer(w._async_soleil())
    assert lancer(w.async_etat())["volets"]["cover.salon"]["manoeuvre"]["regle"] == "soleil"


def test_la_forme_publiee_est_celle_du_contrat(creer, maintenant, soleil_ha):
    """Spec 6.1 : l'ecran lit ces noms-la. Ceux d'avant restent, sauf
    `prochains`, que plus aucun ecran ne lisait (audit du 19/10)."""
    etat = lancer(creer(CHEZ_LUI, TROIS).async_etat())
    for cle in ("config", "soleil", "abaisses", "a_l_abri", "journal", "priorites", "tenues", "armes",
                "attente", "raison", "maintenant", "soleil_jours", "volets"):
        assert cle in etat, cle
    for haid, volet in etat["volets"].items():
        assert set(volet) == {"regle", "a_venir", "protection", "abri", "attente", "porte",
                              "orientation", "manoeuvre"}, haid


# ── Les manoeuvres d'un volet (chantier Volets, spec 6.5) ───────────────────

def test_les_lignes_d_un_volet_viennent_de_tous_les_modules(creer):
    v = creer(CFG_PLAN, VOLET)
    r = v.regles
    lignes = [
        lancer(r.noter("volets", "planning", "fermer", cibles=["cover.salon"])),
        lancer(r.noter("alertes", "danger", "ouvrir", cibles=["cover.cuisine", "cover.salon"])),
        lancer(r.noter("volets", "non abouti", "fermer", n=0, detail="cover.salon", echec=True)),
        lancer(r.noter("volets", "non abouti", "fermer", n=0, detail="cover.salon_2")),
        lancer(r.noter("volets", "planning", "ouvrir", cibles=["cover.cuisine"])),
        lancer(r.noter("scenarios", "cinema", "Cinema", cibles=["light.a", "cover.salon"])),
    ]
    for i, e in enumerate(lignes):
        e["ts"] = 1000.0 + i                     # une seconde d'ecart, la plus vieille d'abord
    lignes[0]["ts"] = 900.0                      # avant `depuis`
    rep = lancer(v.async_manoeuvres("cover.salon", 950.0))
    assert [(e["module"], e["regle"]) for e in rep["lignes"]] == [
        ("scenarios", "cinema"), ("volets", "non abouti"), ("alertes", "danger")]
    assert rep["couvre_depuis"] == 900.0, "la plus vieille ligne du journal entier"


def test_au_plus_deux_cents_lignes_les_plus_recentes(creer):
    v = creer(CFG_PLAN, VOLET)
    for i in range(250):
        e = lancer(v.regles.noter("volets", "planning", "fermer", cibles=["cover.salon"]))
        e["ts"] = 2000.0 + i
    rep = lancer(v.async_manoeuvres("cover.salon", 0))
    assert len(rep["lignes"]) == 200
    assert rep["lignes"][0]["ts"] == 2249.0 and rep["lignes"][-1]["ts"] == 2050.0


def test_coupee_a_deux_cents_la_reponse_ne_couvre_que_ce_qu_elle_montre(creer):
    """Le journal garde 250 lignes de ce volet, la reponse en montre 200 : avant
    la plus vieille montree, elle ne sait plus rien, meme si le journal, lui,
    remonte plus loin. L'ecran ne dit pas « a la main » sans le savoir."""
    v = creer(CFG_PLAN, VOLET)
    for i in range(250):
        e = lancer(v.regles.noter("volets", "planning", "fermer", cibles=["cover.salon"]))
        e["ts"] = 2000.0 + i
    rep = lancer(v.async_manoeuvres("cover.salon", 0))
    assert rep["lignes"][-1]["ts"] == 2050.0 and rep["couvre_depuis"] == 2050.0
    # Sans coupe, c'est le journal entier qui dit jusqu'ou il remonte.
    assert lancer(v.async_manoeuvres("cover.salon", 2100.0))["couvre_depuis"] == 2000.0


def test_un_journal_vide_ne_couvre_rien(creer):
    v = creer(CFG_PLAN, VOLET)
    assert lancer(v.async_manoeuvres("cover.salon", 0)) == {"lignes": [], "couvre_depuis": None}


def test_un_volet_se_nomme_par_son_identifiant_entier(module):
    assert module.nomme("cover.salon", "cover.salon")
    assert module.nomme("capteur indisponible : cover.salon, cover.cuisine", "cover.salon")
    assert not module.nomme("cover.salon_2", "cover.salon")
    assert not module.nomme("xcover.salon", "cover.salon")
    assert not module.nomme(None, "cover.salon") and not module.nomme("cover.salon", "")


# ── La verification attend un volet qui a repondu (nuance de l'ADR 0007) ────
# Netatmo bascule l'etat tout de suite apres l'ordre et ne publie la position
# qu'une a trois minutes apres. A deux minutes, l'ancienne regle redonnait
# l'ordre : 83 ordres redonnes sur 119, du 22/09 au 12/10, sur une installation.

def _bascule(position):
    """Ce que Netatmo publie apres `close_cover` : `closed` tout de suite, la
    position d'avant tant que la vraie n'est pas arrivee."""
    return FauxEtat("closed", {"supported_features": 15, "current_position": position})


OUVERT = {"cover.salon": FauxEtat("open", {"supported_features": 15, "current_position": 100})}


def test_le_cas_netatmo_n_est_pas_redemande(creer, rdv):
    v = creer(CFG_PLAN, dict(OUVERT))
    _fermer(v)
    v.hass.states.table["cover.salon"] = _bascule(100)       # la bascule, aussitot
    _echoir(v, rdv)                                           # 120 s : il a repondu
    assert len(v.hass.services.appels) == 1, "l'ordre a ete redonne a un volet qui obeissait"
    assert (v._verifs["cover.salon"]["essais"], v._verifs["cover.salon"]["attentes"]) == (0, 1)
    # 150 s : la position arrive - la chambre s'arrete a 1 %, publiee `open`.
    v.hass.states.table["cover.salon"] = FauxEtat("open", {"supported_features": 15, "current_position": 1})
    _echoir(v, rdv)                                           # 240 s : arrive
    assert len(v.hass.services.appels) == 1 and v._verifs == {} and rdv.verifs() == []
    assert _rouges(v) == []
    assert not any("immobile" in (e.get("motif") or "") for e in lancer(v.regles.journal(module="volets")))


def test_un_volet_vraiment_immobile_est_redemande_a_deux_minutes_comme_avant(creer, rdv):
    v = creer(CFG_PLAN, dict(OUVERT))
    _fermer(v)
    _echoir(v, rdv)                                           # 120 s : rien n'a change
    assert [a[1] for a in v.hass.services.appels] == ["close_cover", "close_cover"]
    assert (v._verifs["cover.salon"]["essais"], v._verifs["cover.salon"]["attentes"]) == (1, 0)


def test_un_volet_en_mouvement_a_deux_minutes_merite_un_tour(creer, rdv):
    """Deja `closing` a l'ordre, et toujours `closing` a deux minutes : sa
    signature n'a pas change, c'est le mouvement SEUL qui dit qu'il repond."""
    v = creer(CFG_PLAN, {"cover.salon": FauxEtat("closing", {"supported_features": 15, "current_position": 100})})
    _fermer(v)
    assert v._verifs["cover.salon"]["signature"] == ["closing", 100]
    _echoir(v, rdv)
    assert len(v.hass.services.appels) == 1 and v._verifs["cover.salon"]["attentes"] == 1


@pytest.mark.parametrize("avant,retour,services,tours", [
    ("unavailable", "closed", ["open_cover", "open_cover"], (1, 0)),
    ("unknown", "closed", ["open_cover", "open_cover"], (1, 0)),
    ("unavailable", "opening", ["open_cover"], (0, 1)),
], ids=["injoignable_revenu_immobile", "inconnu_revenu_immobile", "injoignable_revenu_en_mouvement"])
def test_un_volet_injoignable_a_l_ordre_ne_repond_pas_en_revenant(creer, rdv, avant, retour, services, tours):
    """Le vent remonte tout, meme un volet injoignable. Il revient sans avoir
    bouge : sa signature change, mais ce n'est pas une reponse - on redemande a
    deux minutes, au lieu d'attendre deux tours. Revenu EN MOUVEMENT, il repond."""
    etats = {**SOLEIL_HAUT, **CHAUD, "sensor.vent": FauxEtat("70"),
             "cover.salon": FauxEtat(avant, {"supported_features": 15})}
    v = creer(cfg_vent(), etats)
    lancer(v._async_vent())
    assert v._verifs["cover.salon"]["signature"] == [avant, None]
    v.hass.states.table["cover.salon"] = FauxEtat(retour, {"supported_features": 15, "current_position": 0})
    _echoir(v, rdv)
    assert [a[1] for a in v.hass.services.appels] == services
    assert (v._verifs["cover.salon"]["essais"], v._verifs["cover.salon"]["attentes"]) == tours


def test_une_position_demandee_merite_un_premier_tour_sans_bascule(creer, rdv):
    """La protection demande 30 a un volet a 100 : il reste `open`, rien ne
    bascule, et Netatmo ne publie la position qu'une a trois minutes apres. Le
    premier tour s'accorde sans reponse ; le second en exige une."""
    haut = {"cover.salon": FauxEtat("open", {"supported_features": 15, "current_position": 100})}
    v = creer(cfg_soleil(), {**SOLEIL_HAUT, **CHAUD, **haut})
    lancer(v._async_soleil())
    assert [a[1] for a in v.hass.services.appels] == ["set_cover_position"]
    _echoir(v, rdv)                                           # 120 s : rien n'a change, on attend
    assert len(v.hass.services.appels) == 1 and v._verifs["cover.salon"]["attentes"] == 1
    _echoir(v, rdv)                                           # 240 s : toujours rien, on redemande
    assert len(v.hass.services.appels) == 2
    assert (v._verifs["cover.salon"]["essais"], v._verifs["cover.salon"]["attentes"]) == (1, 0)


def test_ouvrir_un_volet_deja_ouvert_merite_un_premier_tour(creer, rdv):
    """La chambre s'arrete a 1 % le soir, publiee `open` : l'ouverture du matin
    ne fait rien basculer. Premier tour sans reponse ; la position arrive, c'est
    fini - sans ordre redonne ni ligne « immobile »."""
    v = creer(CFG_PLAN, {"cover.chambre": FauxEtat("open", {"supported_features": 15, "current_position": 1})})
    lancer(v._async_planifie("ouvrir"))
    _echoir(v, rdv)                                           # 120 s : rien encore
    assert len(v.hass.services.appels) == 1 and v._verifs["cover.chambre"]["attentes"] == 1
    v.hass.states.table["cover.chambre"] = FauxEtat("open", {"supported_features": 15, "current_position": 100})
    _echoir(v, rdv)                                           # 240 s : arrivee
    assert len(v.hass.services.appels) == 1 and v._verifs == {} and _rouges(v) == []
    assert not any("immobile" in (e.get("motif") or "") for e in lancer(v.regles.journal(module="volets")))


def test_un_volet_qui_bascule_sans_jamais_arriver_finit_en_rouge(creer, rdv):
    """Deux tours d'attente au plus pour chaque ordre ; ensuite la regle de
    l'ADR 0007 : on redemande, puis la ligne rouge."""
    v = creer(CFG_PLAN, dict(OUVERT))
    _fermer(v)
    v.hass.states.table["cover.salon"] = _bascule(100)        # la bascule, et plus rien
    _echoir(v, rdv)                                           # 120 s : on attend
    _echoir(v, rdv)                                           # 240 s : on attend encore
    assert len(v.hass.services.appels) == 1 and v._verifs["cover.salon"]["attentes"] == 2
    _echoir(v, rdv)                                           # 360 s : essai 1/2
    assert len(v.hass.services.appels) == 2 and v._verifs["cover.salon"]["attentes"] == 0
    _echoir(v, rdv)                                           # rien n'a change depuis : essai 2/2
    assert len(v.hass.services.appels) == 3
    _echoir(v, rdv)                                           # la ligne rouge
    (rouge,) = _rouges(v)
    assert rouge["motif"] == "immobile apres 2 essais"
    assert v._verifs == {} and rdv.verifs() == []


def test_la_manoeuvre_reste_publiee_pendant_les_tours_d_attente(creer, rdv, maintenant, monkeypatch):
    horloge = [datetime(2026, 10, 21, 11, 58, 30, tzinfo=PARIS).timestamp()]
    monkeypatch.setattr(time, "time", lambda: horloge[0])
    v = creer(CFG_PLAN, dict(OUVERT))
    _fermer(v)
    v.hass.states.table["cover.salon"] = _bascule(100)
    horloge[0] += 120
    _echoir(v, rdv)
    assert lancer(v.async_etat())["volets"]["cover.salon"]["manoeuvre"] == {
        "cible": 0, "depuis": "2026-10-21T11:58:30+02:00", "regle": "planning"}, "l'heure de l'ordre ne bouge pas"


# ── V5 : les jours d'un volet « Heures a lui » remplacent ceux de la maison ──

def test_les_jours_propres_remplacent_ceux_de_la_maison(creer, monkeypatch):
    """La maison du lundi au vendredi, la chambre le samedi et le dimanche : elle
    s'ouvre le week-end, et plus en semaine. Le salon suit la maison."""
    plan = {"actif": True, "mode": "auto", "jours": [0, 1, 2, 3, 4], "ouverture": {"decalage": 0},
            "volets": {"cover.chambre": {"perso": True, "ouverture": 30, "jours_ouverture": [5, 6]}}}
    etats = {"cover.chambre": FauxEtat("closed", {"supported_features": 15, "current_position": 0}),
             "cover.salon": FauxEtat("closed", {"supported_features": 15, "current_position": 0})}
    ouverts = {}
    for jour in range(7):
        quand = datetime(2026, 10, 19 + jour, 9, 0)
        monkeypatch.setattr(sys.modules["homeassistant.util.dt"], "now", lambda q=quand: q)
        v = creer({"planning": plan}, etats)
        for decalage in (0, 30):
            lancer(v._async_planifie("ouvrir", decalage=decalage))
        ouverts[jour] = sorted(h for a in v.hass.services.appels for h in a[2]["entity_id"])
    assert ouverts == {0: ["cover.salon"], 1: ["cover.salon"], 2: ["cover.salon"], 3: ["cover.salon"],
                       4: ["cover.salon"], 5: ["cover.chambre"], 6: ["cover.chambre"]}


def test_sans_heures_a_lui_des_jours_propres_ne_comptent_pas(module):
    """Des jours sans « Heures a lui » - une forme que l'ecran n'ecrit pas : le
    volet suit la maison, comme la fiche le montre (« Comme les autres »)."""
    lundi, samedi = datetime(2026, 10, 19), datetime(2026, 10, 24)
    plan = {"jours": [0, 1, 2, 3, 4], "volets": {COVERS[0]: {"jours_ouverture": [5, 6]}}}
    assert COVERS[0] in module.volets_du_jour(plan, COVERS, "ouverture", lundi)
    assert COVERS[0] not in module.volets_du_jour(plan, COVERS, "ouverture", samedi)


def test_un_volet_heures_a_lui_sans_jours_suit_la_maison(module):
    dimanche = datetime(2026, 10, 25)
    plan = {"jours": [0, 1, 2, 3, 4], "volets": {COVERS[0]: {"perso": True, "ouverture": 30}}}
    assert module.volets_du_jour(plan, COVERS, "ouverture", dimanche) == []


# ── Les manoeuvres se lisent sous les droits du compte (audit du 19/10) ─────

def test_les_manoeuvres_d_un_volet_qu_on_ne_lit_pas_sont_refusees(creer):
    """Comme `loggia/lumieres/journal` : c'est le compte - jamais un champ du
    client - qui dit ce qu'il peut lire ; un volet qu'il ne lit pas se refuse."""
    import types as _types

    class Permissions:
        def check_entity(self, haid, sorte):
            return sorte == "read" and haid == "cover.salon"

    v = creer(CFG_PLAN, VOLET)
    lancer(v.regles.noter("volets", "planning", "fermer", cibles=["cover.salon"]))
    lancer(v.regles.noter("volets", "planning", "fermer", cibles=["cover.cuisine"]))
    restreint = _types.SimpleNamespace(id="u-lea", is_admin=False, permissions=Permissions())
    assert len(lancer(v.async_manoeuvres("cover.salon", 0, restreint))["lignes"]) == 1
    with pytest.raises(PermissionError):
        lancer(v.async_manoeuvres("cover.cuisine", 0, restreint))
    admin = _types.SimpleNamespace(id="u-papa", is_admin=True, permissions=Permissions())
    assert len(lancer(v.async_manoeuvres("cover.cuisine", 0, admin))["lignes"]) == 1
    assert len(lancer(v.async_manoeuvres("cover.cuisine", 0))["lignes"]) == 1


# ── Audit du 19/10 : un geste hors de Home Assistant n'est pas « immobile » ──
#
# L'appli Netatmo et l'interrupteur mural n'ont pas d'utilisateur dans Home
# Assistant : rien ne gele le volet. La verification, qui ne regardait qu'a ses
# rendez-vous de 120 s, prenait un volet arrive PUIS rouvert a la main pour un
# volet immobile, et le refermait.


class _Evt:
    def __init__(self, haid):
        self.data = {"entity_id": haid}


def _publier(v, etat, position):
    v.hass.states.table["cover.salon"] = FauxEtat(etat, {"supported_features": 15, "current_position": position})
    v._sur_verif(_Evt("cover.salon"))
    while v.hass.taches:
        lancer(v.hass.taches.pop())


def test_arrive_la_verification_s_arrete_aussitot_et_une_main_n_est_pas_contredite(creer, rdv):
    v = creer(CFG_PLAN, dict(OUVERT))
    _fermer(v)
    _publier(v, "closed", 100)            # la bascule : il repond
    assert set(v._verifs) == {"cover.salon"}
    _publier(v, "closed", 0)              # ~135 s : la position arrive, il est en bas
    assert v._verifs == {} and rdv.verifs() == [], "arrive : plus rien a verifier"
    v.hass.states.table["cover.salon"] = FauxEtat("open", {"supported_features": 15, "current_position": 100})
    assert [a[1] for a in v.hass.services.appels] == ["close_cover"], "rouvert a la main : Loggia ne le referme pas"


def test_reparti_dans_l_autre_sens_c_est_une_main(creer, rdv):
    v = creer(CFG_PLAN, dict(OUVERT))
    _fermer(v)
    _publier(v, "closing", 40)            # il descend…
    _publier(v, "opening", 80)            # … et quelqu'un le remonte depuis l'appli
    assert v._verifs == {} and rdv.verifs() == []
    assert [a[1] for a in v.hass.services.appels] == ["close_cover"]
    (ligne,) = [e for e in lancer(v.regles.journal(module="volets")) if e.get("regle") == "repris a la main"]
    assert ligne["detail"] == "cover.salon" and ligne["n"] == 0 and "echec" not in ligne
    assert ligne["motif"] == "reparti dans l'autre sens"


def test_arrete_en_chemin_il_n_est_pas_redemande(creer, rdv):
    v = creer(CFG_PLAN, dict(OUVERT))
    _fermer(v)
    v.hass.states.table["cover.salon"] = _bascule(100)
    _echoir(v, rdv)                                           # 120 s : il a repondu
    v.hass.states.table["cover.salon"] = FauxEtat("open", {"supported_features": 15, "current_position": 40})
    _echoir(v, rdv)                                           # 240 s : arrete a 40
    v.hass.states.table["cover.salon"] = FauxEtat("open", {"supported_features": 15, "current_position": 40})
    _echoir(v, rdv)                                           # 360 s : toujours 40, il ne bougera plus
    assert [a[1] for a in v.hass.services.appels] == ["close_cover"], "arrete a la main a 40 : pas d'ordre redonne"
    assert v._verifs == {} and rdv.verifs() == [] and _rouges(v) == []
    (ligne,) = [e for e in lancer(v.regles.journal(module="volets")) if e.get("regle") == "repris a la main"]
    assert ligne["motif"] == "arrete en chemin"


def test_une_position_perimee_qui_ne_bouge_pas_reste_redemandee(creer, rdv):
    """Le cas Netatmo d'avant reste vrai : la bascule sans position n'est pas un
    volet arrete en chemin — sa position est encore celle de l'ordre."""
    v = creer(CFG_PLAN, dict(OUVERT))
    _fermer(v)
    v.hass.states.table["cover.salon"] = _bascule(100)
    _echoir(v, rdv)
    _echoir(v, rdv)
    assert v._verifs["cover.salon"]["attentes"] == 2
    _echoir(v, rdv)                                           # toujours rien : la regle de l'ADR 0007
    assert [a[1] for a in v.hass.services.appels] == ["close_cover", "close_cover"]


# ── Audit du 19/10 : ce que le redemarrage effacait ─────────────────────────
#
# Les 11/10 et 18/10, Netatmo etait injoignable au lever : l'ordre est parti en
# attente, en MEMOIRE seulement. Le redemarrage qui a ramene Netatmo l'a efface,
# et le salon est reste ferme jusqu'a ce qu'on l'ouvre a la main. Et une
# sonnerie qui tombe pendant que Home Assistant redemarre n'etait jamais
# rattrapee.

FERME = {"cover.salon": FauxEtat("closed", {"supported_features": 15, "current_position": 0})}
PARIS = FuseauParis()
LUNDI_0820 = datetime(2026, 10, 19, 8, 20, tzinfo=PARIS)
JOURS = [{"date": "2026-10-18", "lever": "2026-10-18T07:58:00+02:00", "coucher": "2026-10-18T19:02:00+02:00"},
         {"date": "2026-10-19", "lever": "2026-10-19T08:00:00+02:00", "coucher": "2026-10-19T19:00:00+02:00"}]


def _ts(texte):
    return datetime.fromisoformat(texte).timestamp()


def _vider(v):
    while v.hass.taches:
        lancer(v.hass.taches.pop())


def test_l_attente_survit_au_redemarrage(creer):
    v = creer(CFG_PLAN, {"cover.salon": FauxEtat("unavailable", {"supported_features": 15})})
    v._depot_memoire = FauxStore(None)
    lancer(v._async_planifie("ouvrir"))
    _vider(v)
    assert set(v._depot_memoire.contenu["attente"]) == {"cover.salon"}
    # Home Assistant redemarre ; Netatmo revient avec lui.
    w = creer(CFG_PLAN, dict(FERME))
    w._depot_memoire = FauxStore(v._depot_memoire.contenu)
    lancer(w._async_charger_memoire())
    _vider(w)
    assert w.hass.services.appels == [("cover", "open_cover", {"entity_id": ["cover.salon"]})]
    assert w.attente == {} and w._depot_memoire.contenu["attente"] == {}


def test_une_attente_perimee_ne_revient_pas(creer):
    w = creer(CFG_PLAN, dict(FERME))
    w._depot_memoire = FauxStore({"attente": {"cover.salon": {"sens": "ouvrir", "expire": time.time() - 60, "motif": "volet injoignable"}}})
    lancer(w._async_charger_memoire())
    _vider(w)
    assert w.hass.services.appels == [] and w.attente == {}


def _redemarre(creer, derniere, maintenant=LUNDI_0820, etats=None, cfg=None):
    w = creer(cfg or CFG_PLAN, dict(etats or FERME))
    w._depot_memoire = FauxStore({"attente": {}, "derniere": derniere})
    w._soleil_jours = lambda _m: JOURS
    lancer(w._async_charger_memoire(maintenant))
    _vider(w)
    return w


def test_le_lever_manque_pendant_le_redemarrage_se_rattrape(creer):
    w = _redemarre(creer, {"ouvrir": _ts("2026-10-18T07:58:00+02:00"), "fermer": _ts("2026-10-18T19:02:00+02:00")})
    assert w.hass.services.appels == [("cover", "open_cover", {"entity_id": ["cover.salon"]})]
    (ligne,) = [e for e in lancer(w.regles.journal(module="volets")) if e.get("quoi") == "ouvrir"]
    assert "rattrape au demarrage" in json.dumps(ligne["motif"])


def test_rien_a_rattraper(creer):
    # La sonnerie du matin est passee, Loggia tournait : rien.
    w = _redemarre(creer, {"ouvrir": _ts("2026-10-19T08:00:05+02:00"), "fermer": _ts("2026-10-18T19:02:00+02:00")})
    assert w.hass.services.appels == []
    # Premier demarrage, rien de note : Loggia ne devine pas.
    assert _redemarre(creer, {}).hass.services.appels == []
    # Trop tard : passe trois heures, la journee a continue sans lui.
    tard = datetime(2026, 10, 19, 11, 30, tzinfo=PARIS)
    assert _redemarre(creer, {"ouvrir": _ts("2026-10-18T07:58:00+02:00")}, tard).hass.services.appels == []
    # En « Manuel », le planning ne touche a rien, rattrapage compris.
    manuel = {"planning": {"actif": True, "mode": "manuel"}}
    assert _redemarre(creer, {"ouvrir": _ts("2026-10-18T07:58:00+02:00")}, cfg=manuel).hass.services.appels == []


def test_une_sonnerie_note_son_heure(creer):
    v = creer(CFG_PLAN, dict(FERME))
    v._depot_memoire = FauxStore(None)
    avant = time.time()
    lancer(v._async_planifie("ouvrir", decalage=0))
    _vider(v)
    assert v._depot_memoire.contenu["derniere"]["ouvrir"] >= avant


# ── Audit du 19/10, les points restants ─────────────────────────────────────
#
# Le vent (anemometre muet, fermeture du soir jamais rejouee), la verification
# qui mettait en attente l'ordre de n'importe quelle regle, l'hysterese de la
# protection solaire, son journal noye, la position perimee de Netatmo, la
# configuration (protection coupee, bornes), l'attente perimee publiee, le
# volet « tilt seul », les courses au dechargement, les rafales, les fenetres de
# toit sur une alerte, les jours de la maison vides et le code mort.

OUVERT_100 = {"cover.salon": FauxEtat("open", {"supported_features": 15, "current_position": 100})}
DIX_NEUF_TRENTE = datetime(2026, 10, 19, 19, 30, tzinfo=PARIS)


def _lignes(v, **filtre):
    return [e for e in lancer(v.regles.journal(module="volets"))
            if all(e.get(k) == x for k, x in filtre.items())]


def test_un_anemometre_muet_relache_l_abri_apres_trente_minutes(creer):
    """Point 1. Un capteur de vent qui se tait laissait `a_l_abri` vrai pour
    toujours : le planning se taisait sans fin."""
    v = creer(cfg_vent(), {**OUVERT_100, "sensor.vent": FauxEtat("70")})
    assert lancer(v._async_vent()) is True and v.a_l_abri
    v.hass.states.table["sensor.vent"] = FauxEtat("unavailable")
    # Muet depuis moins de trente minutes : l'abri tient, et il prime encore.
    assert lancer(v._async_vent()) is True and v.a_l_abri
    debut = v._vent_muet_depuis
    assert debut is not None
    assert lancer(v._async_vent()) is True and v._vent_muet_depuis == debut, "le silence garde son debut"
    v._vent_muet_depuis = debut - 31 * 60
    assert lancer(v._async_vent()) is False
    assert v.a_l_abri is False and "cover.salon" not in v.regles.tenues("volets")
    (ligne,) = _lignes(v, regle="vent", quoi="abri relache")
    assert ligne["motif"] == "anemometre muet" and ligne["n"] == 0


def test_un_anemometre_qui_reparle_remet_le_silence_a_zero(creer):
    v = creer(cfg_vent(), {**OUVERT_100, "sensor.vent": FauxEtat("70")})
    lancer(v._async_vent())
    v.hass.states.table["sensor.vent"] = FauxEtat("unknown")
    lancer(v._async_vent())
    v.hass.states.table["sensor.vent"] = FauxEtat("60")
    assert lancer(v._async_vent()) is True and v._vent_muet_depuis is None


def test_une_sonnerie_retenue_par_l_abri_se_note_une_fois(creer):
    """Point 1. Le planning se taisait pendant l'abri sans rien noter."""
    v = creer(CFG_PLAN, dict(OUVERT_100))
    v.a_l_abri = True
    lancer(v._async_planifie("fermer", decalage=0))
    assert v.hass.services.appels == []
    (ligne,) = _lignes(v, regle="planning")
    assert ligne["n"] == 0 and ligne["quoi"] == "fermer" and "a l'abri du vent" in ligne["detail"]


def test_la_fermeture_manquee_pendant_l_abri_se_rejoue_a_sa_levee(creer, monkeypatch):
    """Point 2. Le coucher passe pendant l'abri n'etait jamais rejoue : les
    volets restaient ouverts toute la nuit."""
    monkeypatch.setattr(sys.modules["homeassistant.util.dt"], "now", lambda: DIX_NEUF_TRENTE)
    cfg = {**CFG_PLAN, "vent": {"actif": True, "entite": "sensor.vent", "seuil": 50}}
    w = creer(cfg, {**OUVERT_100, "sensor.vent": FauxEtat("70")})
    w._soleil_jours = lambda _m: JOURS
    lancer(w._async_vent())
    w._abri_depuis = _ts("2026-10-19T18:50:00+02:00")    # avant le coucher de 19:00
    w.hass.services.appels.clear()
    w.hass.states.table["sensor.vent"] = FauxEtat("20")
    _calme_tenu(w)
    assert lancer(w._async_vent()) is False
    assert w.hass.services.appels == [("cover", "close_cover", {"entity_id": ["cover.salon"]})]
    (ligne,) = _lignes(w, quoi="fermer", regle="planning")
    assert "apres le vent" in ligne["motif"]


def test_un_coup_de_vent_apres_le_coucher_referme_a_sa_levee(creer, monkeypatch):
    """Sa decision du 19/10 : le vent a rouvert les volets apres le coucher ; une
    fois retombe, la nuit les veut fermes - le dernier mouvement prevu se rejoue,
    meme s'il precede l'abri."""
    monkeypatch.setattr(sys.modules["homeassistant.util.dt"], "now", lambda: DIX_NEUF_TRENTE)
    cfg = {**CFG_PLAN, "vent": {"actif": True, "entite": "sensor.vent", "seuil": 50}}
    w = creer(cfg, {**OUVERT_100, "sensor.vent": FauxEtat("70")})
    w._soleil_jours = lambda _m: JOURS
    lancer(w._async_vent())
    w._abri_depuis = _ts("2026-10-19T19:10:00+02:00")    # apres le coucher
    w.hass.services.appels.clear()
    w.hass.states.table["sensor.vent"] = FauxEtat("20")
    _calme_tenu(w)
    lancer(w._async_vent())
    assert w.hass.services.appels == [("cover", "close_cover", {"entity_id": ["cover.salon"]})]


def test_un_ordre_du_vent_injoignable_ne_part_pas_en_attente(creer, rdv):
    """Point 3. Seuls le planning et son rattrapage s'attendent : le vent et le
    soleil se reevaluent d'eux-memes."""
    v = creer(cfg_vent(), {"cover.salon": FauxEtat("open", {"supported_features": 15, "current_position": 40}),
                           "sensor.vent": FauxEtat("70")})
    lancer(v._async_vent())
    v.hass.states.table["cover.salon"] = FauxEtat("unavailable", {})
    _echoir(v, rdv)
    assert v.attente == {}


def test_la_protection_ne_rend_qu_un_degre_sous_le_seuil(creer):
    """Point 4. A 25 °C pile, la protection battait a chaque dixieme."""
    haut = {"cover.salon": FauxEtat("open", {"supported_features": 15, "current_position": 70})}
    v = creer(cfg_soleil(), {**SOLEIL_HAUT, **CHAUD, **haut})
    lancer(v._async_soleil())
    assert v.abaisses == {"cover.salon": 70}
    v.hass.states.table["sensor.dehors"] = FauxEtat("24.5")
    lancer(v._async_soleil())
    assert len(v.hass.services.appels) == 1 and v.abaisses == {"cover.salon": 70}, "rendu a 24,5 °C"
    v.hass.states.table["sensor.dehors"] = FauxEtat("23.9")
    lancer(v._async_soleil())
    assert v.hass.services.appels[-1] == ("cover", "set_cover_position",
                                          {"entity_id": ["cover.salon"], "position": 70})
    # Sous le seuil mais dans la marge : un volet qui n'est pas baisse ne l'est pas.
    w = creer(cfg_soleil(), {**SOLEIL_HAUT, "sensor.dehors": FauxEtat("24.5"), **haut})
    lancer(w._async_soleil())
    assert w.hass.services.appels == [] and w.abaisses == {}


def test_un_volet_gele_ou_tenu_par_plus_fort_ne_se_retente_pas(creer):
    """Point 5. « proteger 0 · sous la main » a chaque mise a jour du soleil."""
    haut = {"cover.salon": FauxEtat("open", {"supported_features": 15, "current_position": 70})}
    v = creer(cfg_soleil(), {**SOLEIL_HAUT, **CHAUD, **haut})
    lancer(v.regles.geler("interrupteurs", "bouton", ["cover.salon"]))
    lancer(v._async_soleil())
    lancer(v._async_soleil())
    assert v.hass.services.appels == [] and _lignes(v, quoi="proteger") == []
    w = creer(cfg_soleil(), {**SOLEIL_HAUT, **CHAUD, **haut})
    lancer(w.regles.agir("alertes", "danger", "cover", "open_cover", ["cover.salon"], quoi="remonter",
                         priorite=charger("alertes").PRIORITE, tenir=True))
    lancer(w._async_soleil())
    assert len(w.hass.services.appels) == 1 and _lignes(w, quoi="proteger") == []


def test_une_position_perimee_de_netatmo_ne_se_protege_pas(creer):
    """Point 6. `closed` publie avec la position d'avant (100) : la protection
    croyait le volet en haut, et l'aurait OUVERT a 30 %."""
    perime = {"cover.salon": FauxEtat("closed", {"supported_features": 15, "current_position": 100})}
    v = creer(cfg_soleil(), {**SOLEIL_HAUT, **CHAUD, **perime})
    lancer(v._async_soleil())
    assert v.hass.services.appels == [] and v.abaisses == {}
    # La verification, elle, garde la position publiee.
    assert v._position_actuelle("cover.salon") == 100
    # Ferme a 1 % (sa chambre) : rien a dire, c'est en bas.
    bas = {"cover.salon": FauxEtat("closed", {"supported_features": 15, "current_position": 2})}
    assert creer(cfg_soleil(), bas)._position_pour_proteger("cover.salon") == 2


# ASSERTION MODIFIEE (25/10, fusion volet par volet) : une facade se retire par `None`, plus par omission.
@pytest.mark.parametrize("patch", [{"soleil": {"actif": False}}, {"soleil": {"volets": {"cover.salon": None}}},
                                   {"soleil": {"volets": {"cover.salon": {"orientation": None}}}}])
def test_couper_la_protection_rend_les_volets_baisses(creer, patch):
    """Point 7. Coupee, ou la facade retiree, la protection ne rendait plus
    jamais ce qu'elle avait baisse."""
    haut = {"cover.salon": FauxEtat("open", {"supported_features": 15, "current_position": 70})}
    v = creer(cfg_soleil(), {**SOLEIL_HAUT, **CHAUD, **haut})
    lancer(v._async_soleil())
    lancer(v.async_enregistrer(patch))
    assert v.hass.services.appels[-1] == ("cover", "set_cover_position",
                                          {"entity_id": ["cover.salon"], "position": 70})
    assert v.abaisses == {} and v.regles.tenues("volets") == {}
    (ligne,) = _lignes(v, quoi="rouvrir")
    assert ligne["motif"] == "protection coupee"


def test_garder_la_protection_ne_rend_rien(creer):
    haut = {"cover.salon": FauxEtat("open", {"supported_features": 15, "current_position": 70})}
    v = creer(cfg_soleil(), {**SOLEIL_HAUT, **CHAUD, **haut})
    lancer(v._async_soleil())
    lancer(v.async_enregistrer({"soleil": {"position": 20}}))
    assert len(v.hass.services.appels) == 1 and v.abaisses == {"cover.salon": 70}


@pytest.mark.parametrize("patch,code,nomme", [
    ({"planning": {"ouverture": {"decalage": 241}}}, "volets_decalage_hors_bornes", "planning.ouverture.decalage"),
    ({"planning": {"fermeture": {"decalage": -121}}}, "volets_decalage_hors_bornes", "planning.fermeture.decalage"),
    ({"planning": {"ouverture": {"decalage": "tot"}}}, "volets_decalage_hors_bornes", "planning.ouverture.decalage"),
    ({"planning": {"ouverture": 15}}, "volets_decalage_hors_bornes", "planning.ouverture"),
    ({"planning": {"volets": {"cover.salon": {"fermeture": 300}}}}, "volets_decalage_hors_bornes",
     "planning.volets.cover.salon.fermeture"),
    ({"planning": {"volets": {"cover.salon": {"ouverture": True}}}}, "volets_decalage_hors_bornes",
     "planning.volets.cover.salon.ouverture"),
    ({"vent": {"seuil": 0}}, "volets_seuil_vent", "vent.seuil"),
    ({"vent": {"seuil": -5}}, "volets_seuil_vent", "vent.seuil"),
    ({"vent": {"seuil": "fort"}}, "volets_seuil_vent", "vent.seuil"),
    ({"vent": {"seuil": None}}, "volets_seuil_vent", "vent.seuil"),
    ({"vent": {"seuil": True}}, "volets_seuil_vent", "vent.seuil"),
    ({"vent": {"seuil": float("nan")}}, "volets_seuil_vent", "vent.seuil"),
])
def test_les_bornes_du_planning_et_du_vent_se_refusent_par_leur_nom(creer, patch, code, nomme):
    """Point 8. Un decalage de 3 000 min ou un seuil de vent nul passaient : le
    second mettait la maison a l'abri pour toujours."""
    refus = charger("refus")
    v = creer(CFG_PLAN, dict(VOLET))
    with pytest.raises(refus.RefusNomme) as err:
        lancer(v.async_enregistrer(patch))
    assert err.value.code == code and err.value.nomme == nomme
    assert lancer(v.async_config())["planning"]["ouverture"] == {"decalage": 0}, "rien n'est ecrit"


def test_les_bornes_admettent_ce_que_l_ecran_ecrit(creer):
    v = creer(CFG_PLAN, dict(VOLET))
    cfg = lancer(v.async_enregistrer({"planning": {"ouverture": {"decalage": -120}, "fermeture": {"decalage": 240},
                                                   "volets": {"cover.salon": {"perso": True, "ouverture": None,
                                                                              "fermeture": "15"}}},
                                      "vent": {"seuil": 12.5}}))
    assert cfg["planning"]["ouverture"]["decalage"] == -120 and cfg["vent"]["seuil"] == 12.5


def test_une_valeur_deja_enregistree_hors_bornes_se_borne_a_la_lecture(creer):
    v = creer({"planning": {"actif": True, "ouverture": {"decalage": 400}, "fermeture": {"decalage": -300},
                            "volets": {"cover.salon": {"ouverture": 999, "fermeture": "tard"}}},
               "vent": {"seuil": 0}})
    assert v.cfg["planning"]["ouverture"]["decalage"] == 240
    assert v.cfg["planning"]["fermeture"]["decalage"] == -120
    assert v.cfg["planning"]["volets"]["cover.salon"] == {"ouverture": 240, "fermeture": "tard"}
    assert v.cfg["vent"]["seuil"] == 50, "un seuil nul mettrait la maison a l'abri pour toujours"
    # Et un enregistrement voisin passe : la table relue est dans les bornes.
    lancer(v.async_enregistrer({"planning": {"volets": dict(v.cfg["planning"]["volets"])}}))


def test_l_etat_ne_publie_pas_une_attente_perimee(creer, maintenant, soleil_ha):
    """Point 9. Une attente expiree restait publiee tant qu'aucun volet ne
    bougeait."""
    v = creer(CHEZ_LUI, TROIS)
    v.attente["cover.salon"] = {"sens": "fermer", "expire": time.time() - 60, "motif": "volet injoignable"}
    v.attente["cover.chambre"] = {"sens": "fermer", "expire": time.time() + 3600, "motif": "baie ouverte"}
    etat = lancer(v.async_etat())
    assert set(etat["attente"]) == {"cover.chambre"} and etat["volets"]["cover.salon"]["attente"] is None
    assert set(v.attente) == {"cover.chambre"}
    (ligne,) = _lignes(v, regle="attente expiree")
    assert ligne["detail"] == "cover.salon"


def test_un_ordre_du_planning_efface_l_attente_du_sens_oppose(creer):
    """Point 10. Une ouverture attendue depuis le matin partait le soir, juste
    apres la fermeture."""
    v = creer(CFG_PLAN, dict(OUVERT_100))
    loin = time.time() + 3600
    v.attente["cover.salon"] = {"sens": "ouvrir", "expire": loin, "motif": "volet injoignable"}
    v.attente["cover.absent"] = {"sens": "ouvrir", "expire": loin, "motif": "volet injoignable"}
    lancer(v._async_planifie("fermer"))
    assert "cover.salon" not in v.attente and "cover.absent" in v.attente


TILT_SEUL = 16 | 32 | 128       # OPEN_TILT, CLOSE_TILT, SET_TILT_POSITION


def test_un_volet_qui_ne_fait_que_s_incliner_reste_hors_des_ordres_groupes(creer, module):
    """Point 11. Un volet « tilt seul » faisait refuser l'appel groupe entier."""
    etats = {**OUVERT_100, "cover.lames": FauxEtat("open", {"supported_features": TILT_SEUL}),
             "sensor.vent": FauxEtat("70")}
    v = creer({**CFG_PLAN, **cfg_vent()}, etats)
    lancer(v._async_planifie("fermer"))
    assert v.hass.services.appels == [("cover", "close_cover", {"entity_id": ["cover.salon"]})]
    v.hass.services.appels.clear()
    lancer(v._async_vent())
    assert v.hass.services.appels == [("cover", "open_cover", {"entity_id": ["cover.salon"]})]
    ouvrants = charger("ouvrants")
    assert ouvrants.ouvre_et_ferme(15) and ouvrants.ouvre_et_ferme(1) and ouvrants.ouvre_et_ferme(2)
    assert not ouvrants.ouvre_et_ferme(TILT_SEUL)
    # Sans `supported_features` publie, on ne sait pas : il reste.
    assert ouvrants.ouvre_et_ferme(None) and ouvrants.ouvre_et_ferme(0)


def test_un_module_arrete_ne_rearme_plus_rien(creer, rdv, monkeypatch):
    """Point 12. Une tache en vol apres le dechargement reposait une ecoute ou
    un rendez-vous que plus personne ne retirerait."""
    ev = sys.modules["homeassistant.helpers.event"]
    poses = []
    for nom in ("async_track_state_change_event", "async_track_sunrise", "async_track_sunset"):
        monkeypatch.setattr(ev, nom, lambda *a, _n=nom, **k: poses.append(_n) or (lambda: None))
    v = creer({"planning": {"actif": True, "mode": "auto"}, "vent": {"actif": True, "entite": "sensor.vent"}},
              {"cover.salon": FauxEtat("unavailable", {"supported_features": 15}), **OUVERT_100})
    v.async_arreter()
    poses.clear()
    lancer(v._async_reprogrammer())
    v._reabonner_etat()
    v._mettre_en_attente(["cover.salon"], "fermer")
    v._programmer_verif(["cover.salon"], "close_cover", None, regle="planning", quoi="fermer", motif="",
                        priorite=0, tenir=False, essai=0)
    assert poses == [] and rdv.verifs() == [] and v._verifs == {}
    # Et plus rien ne part d'un module arrete.
    assert lancer(v._async_service("close_cover", ["cover.salon"], regle="planning")) == []
    assert v.hass.services.appels == []


def test_une_seconde_rafale_ne_renvoie_pas_les_ordres(creer):
    """Point 13. Deux mises a jour du vent rapprochees envoyaient deux fois
    l'ordre : l'abri n'etait pose qu'apres."""
    v = creer(cfg_vent(), {**OUVERT_100, "sensor.vent": FauxEtat("70")})
    appels = v.hass.services.appels

    async def lent(domaine, service, data, blocking=False, context=None):
        await asyncio.sleep(0)
        appels.append((domaine, service, dict(data)))
    v.hass.services.async_call = lent

    async def deux():
        await asyncio.gather(v._async_vent(), v._async_vent())
    lancer(deux())
    assert [a[1] for a in appels] == ["open_cover"]


def test_des_jours_de_la_maison_vides_ne_bougent_rien(creer, module):
    """Point 15. Parametres dit « aucun jour » ; le moteur lisait « tous »."""
    calc = charger("volets_calcul")
    lundi = datetime(2026, 9, 7)
    assert not module.jour_actif([], lundi) and module.jour_actif(None, lundi)
    assert not calc.jour_de_la_maison({"jours": []}, 0) and calc.jour_de_la_maison({}, 0)
    v = creer({"planning": {"actif": True, "jours": []}}, dict(OUVERT_100))
    lancer(v._async_planifie("fermer"))
    assert v.hass.services.appels == []
    # Un volet « Heures a lui » qui porte ses jours les garde.
    w = creer({"planning": {"actif": True, "jours": [],
                            "volets": {"cover.salon": {"perso": True, "jours_fermeture": [0, 1, 2, 3, 4, 5, 6]}}}},
              dict(OUVERT_100))
    lancer(w._async_planifie("fermer"))
    assert [a[1] for a in w.hass.services.appels] == ["close_cover"]


def test_le_code_mort_est_parti(module, creer, maintenant, soleil_ha):
    """Point 16. `groupes_horaires` ne filtre plus par jour, et l'etat ne
    publie plus `prochains`, que plus aucun ecran ne lit."""
    import inspect
    assert list(inspect.signature(module.groupes_horaires).parameters) == ["plan", "covers", "sens"]
    assert not hasattr(module.LoggiaVolets, "_prochains")
    assert "prochains" not in lancer(creer(CHEZ_LUI, TROIS).async_etat())



# ── Relecture du 19/10 : la levee de l'abri ne bouge que ce que le vent a bouge ──


def _calme_tenu(v):
    """Le calme dure depuis plus de CALME_S (15 min)."""
    v._calme_depuis = time.time() - 15 * 60 - 1


def test_des_rafales_qui_oscillent_ne_font_pas_battre_les_volets(creer):
    etats = {**SOLEIL_HAUT, **CHAUD, **VOLET, "sensor.vent": FauxEtat("70")}
    v = creer(cfg_vent(), etats)
    lancer(v._async_vent())
    ordres = len(v.hass.services.appels)
    for vent in ("40", "55", "40", "60", "41"):
        v.hass.states.table["sensor.vent"] = FauxEtat(vent)
        assert lancer(v._async_vent()) is True, vent
    assert len(v.hass.services.appels) == ordres, "les volets ont battu"


def _ids(appel):
    return (appel[2] or {}).get("entity_id", [])


def test_un_store_banne_replie_ne_se_redeploie_pas_a_la_levee(creer, monkeypatch):
    monkeypatch.setattr(sys.modules["homeassistant.util.dt"], "now",
                        lambda: datetime(2026, 10, 19, 12, 0, tzinfo=PARIS))
    store = FauxEtat("open", {"supported_features": 15, "current_position": 100, "device_class": "awning"})
    cfg = {**CFG_PLAN, "vent": {"actif": True, "entite": "sensor.vent", "seuil": 50}}
    w = creer(cfg, {**OUVERT_100, "cover.store": store, "sensor.vent": FauxEtat("70")})
    w._soleil_jours = lambda _m: JOURS
    lancer(w._async_vent())
    assert any(a[1] == "close_cover" and "cover.store" in _ids(a) for a in w.hass.services.appels), "le vent replie le store"
    w.hass.services.appels.clear()
    w.hass.states.table["sensor.vent"] = FauxEtat("20")
    _calme_tenu(w)
    lancer(w._async_vent())
    assert not any("cover.store" in _ids(a) for a in w.hass.services.appels), \
        "le store s'est redeploye a la levee de l'abri"


def test_un_volet_sous_la_main_n_est_pas_rouvert_a_la_levee(creer, monkeypatch):
    monkeypatch.setattr(sys.modules["homeassistant.util.dt"], "now",
                        lambda: datetime(2026, 10, 19, 12, 0, tzinfo=PARIS))
    chambre = FauxEtat("closed", {"supported_features": 15, "current_position": 0})
    cfg = {**CFG_PLAN, "vent": {"actif": True, "entite": "sensor.vent", "seuil": 50}}
    w = creer(cfg, {**OUVERT_100, "cover.chambre": chambre, "sensor.vent": FauxEtat("70")})
    w._soleil_jours = lambda _m: JOURS
    w.regles._gel["cover.chambre"] = time.time() + 1800     # fermee a la main : la sieste
    lancer(w._async_vent())
    assert "cover.chambre" not in w._abrites
    w.regles._gel.pop("cover.chambre")                      # le gel expire pendant l'abri
    w.hass.services.appels.clear()
    w.hass.states.table["sensor.vent"] = FauxEtat("20")
    _calme_tenu(w)
    lancer(w._async_vent())
    assert not any("cover.chambre" in _ids(a) for a in w.hass.services.appels), \
        "Loggia a ouvert un volet que le vent n'avait pas touche"


def test_un_volet_qui_ne_sait_que_se_placer_recoit_sa_position(creer):
    """Relecture du 19/10 : SET_POSITION sans OPEN ni CLOSE (features 4 ou 12).
    Ecarte des ordres groupes, il etait oublie en silence ; il recoit sa
    position a part, et les autres volets leur ordre groupe."""
    v = creer(CFG_PLAN, {**OUVERT_100,
                         "cover.place": FauxEtat("open", {"supported_features": 4, "current_position": 100})})
    lancer(v._async_planifie("fermer"))
    appels = sorted(v.hass.services.appels, key=lambda a: a[1])
    assert appels == [("cover", "close_cover", {"entity_id": ["cover.salon"]}),
                      ("cover", "set_cover_position", {"entity_id": ["cover.place"], "position": 0})]


# ── Le store banne au soleil (sa demande du 25/10) ──────────────────────────
#
# La protection « baissait » tout ouvrant a 30 % : un store banne deploye se
# repliait donc a moitie en plein soleil, la ou il protege justement en se
# deployant. Il se deploie en entier, et revient d'ou il etait (replie, s'il
# n'en disait rien) quand le soleil quitte la facade.

def _store(etat="closed", position=0, features=15):
    return {"cover.salon": FauxEtat(etat, {"supported_features": features, "current_position": position,
                                           "device_class": "awning"})}


def test_au_soleil_un_store_banne_se_deploie(creer):
    v = creer(cfg_soleil(), {**SOLEIL_HAUT, **CHAUD, **_store()})
    lancer(v._async_evaluer())
    assert v.hass.services.appels == [("cover", "set_cover_position", {"entity_id": ["cover.salon"], "position": 100})]
    assert v.abaisses == {"cover.salon": 0}


def test_un_store_deja_deploye_ne_bouge_pas(creer):
    v = creer(cfg_soleil(), {**SOLEIL_HAUT, **CHAUD, **_store("open", 100)})
    lancer(v._async_evaluer())
    assert v.hass.services.appels == [] and v.abaisses == {}


def test_le_soleil_parti_le_store_revient_replie(creer):
    v = creer(cfg_soleil(), {**SOLEIL_HAUT, **CHAUD, **_store()})
    lancer(v._async_evaluer())
    v.hass.services.appels.clear()
    v.hass.states.table["sun.sun"] = FauxEtat("above_horizon", {"azimuth": 60, "elevation": 40})
    lancer(v._async_evaluer())
    assert v.hass.services.appels == [("cover", "set_cover_position", {"entity_id": ["cover.salon"], "position": 0})]


def test_un_store_qui_ne_sait_pas_se_placer_s_ouvre(creer):
    v = creer(cfg_soleil(), {**SOLEIL_HAUT, **CHAUD, **_store(features=3)})
    lancer(v._async_evaluer())
    assert v.hass.services.appels == [("cover", "open_cover", {"entity_id": ["cover.salon"]})]


def test_un_store_rendu_sans_position_connue_se_replie(creer):
    """Sans position d'avant, un volet se rouvre (100) ; un store banne, lui, se
    replie (0) : le deployer, c'est exposer la toile."""
    v = creer(cfg_soleil(), {**SOLEIL_HAUT, **CHAUD, **_store("open", 100)})
    v.abaisses["cover.salon"] = None
    v.regles.tenir("volets", "soleil", ["cover.salon"])
    lancer(v._async_rendre("cover.salon"))
    assert v.hass.services.appels == [("cover", "set_cover_position", {"entity_id": ["cover.salon"], "position": 0})]


def test_un_volet_au_soleil_se_baisse_toujours_a_30(creer):
    v = creer(cfg_soleil(), {**SOLEIL_HAUT, **CHAUD,
                             "cover.salon": FauxEtat("open", {"supported_features": 15, "current_position": 100})})
    lancer(v._async_evaluer())
    assert v.hass.services.appels == [("cover", "set_cover_position", {"entity_id": ["cover.salon"], "position": 30})]


# ── Un volet renomme (sa demande du 25/10) ──────────────────────────────────
#
# Les reglages d'un volet sont ranges par son entity_id. Renomme dans Home
# Assistant, il les perdait en silence et suivait la maison : sa chambre, reglee
# pour ne jamais s'ouvrir seule, se serait mise a s'ouvrir chaque matin. La
# configuration et ce que le module tient en memoire suivent le renommage, comme
# pour les fenetres (fenetres.py, audit du 19/10).

class _EvRenomme:
    def __init__(self, neuf, ancien, action="update"):
        self.data = {"action": action, "entity_id": neuf, "old_entity_id": ancien}


CFG_RENOMME = {
    "planning": {"actif": True, "volets": {"cover.chambre": {"perso": True, "ouverture": None, "jours_ouverture": []},
                                           "cover.salon": {"ouverture": 30}}},
    "soleil": {"actif": True, "temp_entite": "sensor.dehors", "volets": {"cover.chambre": {"orientation": 135}}},
    "baies": {"actif": True, "volets": {"cover.chambre": "binary_sensor.porte_chambre"}},
    "vent": {"actif": True, "entite": "sensor.vent", "seuil": 50},
}


def test_renommer_dans_la_configuration_des_volets(module):
    cfg = json.loads(json.dumps(CFG_RENOMME))
    assert module.renommer_dans_volets(cfg, "cover.chambre", "cover.chambre_parents") is True
    assert "cover.chambre" not in cfg["planning"]["volets"]
    assert cfg["planning"]["volets"]["cover.chambre_parents"] == {"perso": True, "ouverture": None, "jours_ouverture": []}
    assert cfg["soleil"]["volets"] == {"cover.chambre_parents": {"orientation": 135}}
    assert cfg["baies"]["volets"] == {"cover.chambre_parents": "binary_sensor.porte_chambre"}
    # Le capteur d'une porte, le thermometre et l'anemometre suivent aussi.
    assert module.renommer_dans_volets(cfg, "binary_sensor.porte_chambre", "binary_sensor.baie") is True
    assert cfg["baies"]["volets"] == {"cover.chambre_parents": "binary_sensor.baie"}
    assert module.renommer_dans_volets(cfg, "sensor.vent", "sensor.anemometre") is True
    assert cfg["vent"]["entite"] == "sensor.anemometre"
    assert module.renommer_dans_volets(cfg, "sensor.dehors", "sensor.exterieur") is True
    assert cfg["soleil"]["temp_entite"] == "sensor.exterieur"
    # Ce qu'il ne connait pas ne change rien.
    assert module.renommer_dans_volets(cfg, "light.salon", "light.sejour") is False


def test_un_volet_renomme_garde_ses_reglages_et_sa_memoire(creer):
    v = creer(CFG_RENOMME, {"cover.chambre": FauxEtat("closed", {"supported_features": 15, "current_position": 0})})
    v._depot_memoire = FauxStore(None)
    v.attente["cover.chambre"] = {"sens": "fermer", "expire": time.time() + 3600, "motif": "baie ouverte"}
    v.abaisses["cover.chambre"] = 100
    v.regles.tenir("volets", "soleil", ["cover.chambre"])
    v._sur_registre(_EvRenomme("cover.chambre_parents", "cover.chambre"))
    while v.hass.taches:
        lancer(v.hass.taches.pop())
    assert "cover.chambre_parents" in v.cfg["planning"]["volets"] and "cover.chambre" not in v.cfg["planning"]["volets"]
    enregistre = lancer(v.async_config())
    assert enregistre["planning"]["volets"]["cover.chambre_parents"]["jours_ouverture"] == []
    assert enregistre["baies"]["volets"] == {"cover.chambre_parents": "binary_sensor.porte_chambre"}
    assert set(v.attente) == {"cover.chambre_parents"} and set(v.abaisses) == {"cover.chambre_parents"}
    assert v.regles.tient("volets", "soleil", "cover.chambre_parents")
    assert not v.regles.tient("volets", "soleil", "cover.chambre")
    assert set(v._depot_memoire.contenu["attente"]) == {"cover.chambre_parents"}


def test_un_renommage_sans_rapport_ne_touche_a_rien(creer):
    v = creer(CFG_RENOMME, {})
    avant = json.dumps(v.cfg, sort_keys=True)
    v._sur_registre(_EvRenomme("light.sejour", "light.salon"))
    v._sur_registre(_EvRenomme("cover.neuf", None, action="create"))
    v._sur_registre(_EvRenomme("cover.chambre", "cover.chambre"))
    assert v.hass.taches == [] and json.dumps(v.cfg, sort_keys=True) == avant


# ── La fusion volet par volet (sa demande du 25/10) ─────────────────────────
#
# Les tables `planning.volets`, `soleil.volets` et `baies.volets` arrivaient
# ENTIERES de l'ecran, et le serveur les remplacait : deux ecrans qui reglent
# deux volets presque ensemble, et le second effacait le reglage du premier. Le
# serveur fusionne desormais volet par volet ; `None` retire un volet.

def test_deux_volets_regles_de_deux_ecrans_survivent_tous_les_deux(creer):
    v = creer({"planning": {"actif": True}}, {})
    lancer(v.async_enregistrer({"planning": {"volets": {"cover.salon": {"perso": True, "ouverture": 30}}}}))
    lancer(v.async_enregistrer({"planning": {"volets": {"cover.chambre": {"exclu": True}}}}))
    assert v.cfg["planning"]["volets"] == {"cover.salon": {"perso": True, "ouverture": 30}, "cover.chambre": {"exclu": True}}
    lancer(v.async_enregistrer({"soleil": {"volets": {"cover.salon": {"orientation": 225, "ouverture": 90}}}}))
    lancer(v.async_enregistrer({"soleil": {"volets": {"cover.bureau": {"orientation": 135, "ouverture": 90}}}}))
    assert set(v.cfg["soleil"]["volets"]) == {"cover.salon", "cover.bureau"}
    lancer(v.async_enregistrer({"baies": {"volets": {"cover.salon": "binary_sensor.baie"}}}))
    lancer(v.async_enregistrer({"baies": {"volets": {"cover.chambre": "binary_sensor.porte"}}}))
    assert v.cfg["baies"]["volets"] == {"cover.salon": "binary_sensor.baie", "cover.chambre": "binary_sensor.porte"}
    # Ce qui est ENREGISTRE, pas seulement le cache.
    assert lancer(v.async_config())["planning"]["volets"]["cover.salon"] == {"perso": True, "ouverture": 30}


def test_none_retire_un_volet_et_seulement_lui(creer):
    v = creer({"planning": {"actif": True, "volets": {"cover.salon": {"ouverture": 30}, "cover.chambre": {"exclu": True}}},
               "soleil": {"volets": {"cover.salon": {"orientation": 225}}}}, {})
    lancer(v.async_enregistrer({"planning": {"volets": {"cover.salon": None}, "actif": False},
                                "soleil": {"volets": {"cover.salon": None}}}))
    assert v.cfg["planning"]["volets"] == {"cover.chambre": {"exclu": True}}
    assert v.cfg["planning"]["actif"] is False, "le reste de la section suit toujours le patch"
    assert v.cfg["soleil"]["volets"] == {}
