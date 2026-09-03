"""Tests des regles de volets.

Deux choses valent d'etre verrouillees ici. La geometrie d'abord : « ce volet
est-il au soleil » se joue sur un ecart d'azimut, et un ecart d'azimut se
trompe au passage du nord si on le calcule naivement. La priorite ensuite : le
vent prime sur le soleil, sans quoi la protection solaire rabaisserait dans la
minute un volet qu'on vient de mettre a l'abri.
"""
from __future__ import annotations

import asyncio
from datetime import datetime

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

    def async_entity_ids(self, domaine):
        return [e for e in self.table if e.startswith(domaine + '.')]


class FauxServices:
    def __init__(self):
        self.appels = []

    async def async_call(self, domaine, service, data, blocking=False):
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
    return charger("volets")


@pytest.fixture
def creer(module, store_module):
    faits = []

    def fabrique(config=None, etats=None):
        magasin = store_module.LoggiaStore.__new__(store_module.LoggiaStore)
        magasin._store = FauxStore({"users": {}, "shared": {"loggia_volets": config or {}}, "migrated": True})
        magasin._ancien = FauxStore(None)
        magasin._data = None
        magasin._lock = asyncio.Lock()

        # `__new__` : le vrai constructeur pose des rendez-vous de lever et de
        # coucher, ce qu'aucun test ne veut declencher.
        v = module.LoggiaVolets.__new__(module.LoggiaVolets)
        v.hass = FauxHass(etats or {})
        v.store = magasin
        v.cfg = lancer(v.async_config())
        v.abaisses = set()
        v.a_l_abri = False
        v.journal = []
        v._defait = []
        v._defait_soleil = []
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
    # Une liste vide ou absente vaut « tous les jours ».
    assert module.jour_actif([], dimanche)
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
    assert v.abaisses == {"cover.salon"}


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
    assert v.abaisses == set()


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
    assert v.abaisses == set()


def test_le_calme_revenu_ne_suffit_pas_de_justesse(creer):
    """Une rafale qui oscille autour du seuil ferait battre les volets : on ne
    redescend qu'une fois nettement repasse dessous."""
    etats = {**SOLEIL_HAUT, **CHAUD, **VOLET, "sensor.vent": FauxEtat("70")}
    v = creer(cfg_vent(), etats)
    lancer(v._async_vent())
    v.hass.states.table["sensor.vent"] = FauxEtat("48")     # juste sous 50
    assert lancer(v._async_vent()) is True
    v.hass.states.table["sensor.vent"] = FauxEtat("40")     # sous 85 % du seuil
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
