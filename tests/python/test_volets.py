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
        # Un dictionnaire : la protection retient AUSSI d'ou elle a pris
        # chaque volet, pour l'y remettre plutot que de tout ouvrir a 100.
        v.abaisses = {}
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

def test_jours_propres_par_sens_ANCIEN(module):
    """Un volet peut ne pas s'ouvrir certains jours, et fermer quand meme.

    Le cas qui l'a demande : travailler de nuit. La chambre ne doit pas
    s'ouvrir le matin les jours ou l'on dort, mais doit s'ouvrir les jours de
    repos — et la fermeture du soir, elle, ne change pas. Une seule liste de
    jours pour les deux sens ne saurait pas dire cela.
    """
    lundi, samedi = datetime(2026, 9, 7), datetime(2026, 9, 12)   # weekday 0 et 5
    plan = {"ouverture": {"decalage": 0}, "fermeture": {"decalage": 0},
            "volets": {COVERS[0]: {"perso": True, "jours_ouverture": [5, 6]}}}

    # Lundi : le volet ne s'ouvre pas, les autres si.
    g = module.groupes_horaires(plan, COVERS, "ouverture", lundi)
    assert COVERS[0] not in [x for v in g.values() for x in v], "le volet s'ouvre un jour ecarte"
    assert COVERS[1] in [x for v in g.values() for x in v], "les autres volets ont ete emportes"

    # Samedi : il s'ouvre.
    g = module.groupes_horaires(plan, COVERS, "ouverture", samedi)
    assert COVERS[0] in [x for v in g.values() for x in v], "le volet ne s'ouvre pas un jour retenu"

    # La FERMETURE ignore les jours d'ouverture : sans liste propre, elle suit
    # les jours generaux, tous les jours de la semaine.
    g = module.groupes_horaires(plan, COVERS, "fermeture", lundi)
    assert COVERS[0] in [x for v in g.values() for x in v], "les jours d'ouverture bloquent aussi la fermeture"


def test_sans_date_aucun_filtre(module):
    """`quand` absent : la fonction reste ce qu'elle etait.

    Ses appels d'origine ne passent pas de date. S'ils se mettaient a filtrer,
    ils ecarteraient des volets sans que rien ne l'ait demande.
    """
    plan = {"ouverture": {"decalage": 0},
            "volets": {COVERS[0]: {"perso": True, "jours_ouverture": []}}}
    g = module.groupes_horaires(plan, COVERS, "ouverture")
    assert COVERS[0] in [x for v in g.values() for x in v], "un appel sans date s'est mis a filtrer"

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
    plan = {"volets": {COVERS[0]: {"jours_ouverture": [5, 6]}}}
    assert COVERS[0] not in module.volets_du_jour(plan, COVERS, "ouverture", lundi),         "le volet s'ouvre un jour ecarte"
    assert COVERS[0] in module.volets_du_jour(plan, COVERS, "ouverture", samedi),         "le volet ne s'ouvre pas un jour retenu"
    assert COVERS[1] in module.volets_du_jour(plan, COVERS, "ouverture", lundi),         "les autres volets ont ete emportes"
    # La fermeture, sans liste propre, n'est pas concernee.
    assert COVERS[0] in module.volets_du_jour(plan, COVERS, "fermeture", lundi),         "les jours d'ouverture bloquent aussi la fermeture"


def test_tous_les_jours_decoches_veut_dire_jamais(module):
    """`[]` est un choix, pas une absence de choix.

    `jour_actif([])` repond « tous les jours » — juste pour les jours GENERAUX,
    ou l'absence de liste dit « aucune restriction ». Pour un volet, la liste
    vide vient de quelqu'un qui a decoche les sept cases : lui repondre
    « toujours » serait l'exact contraire de ce qu'il a demande.
    """
    plan = {"volets": {COVERS[0]: {"jours_ouverture": []}}}
    for jour in (datetime(2026, 9, 7), datetime(2026, 9, 12)):
        assert COVERS[0] not in module.volets_du_jour(plan, COVERS, "ouverture", jour),             "sept jours decoches ouvrent le volet au lieu de le laisser tranquille"


def test_des_jours_en_chaines_restent_compris(module):
    """Le stockage n'oblige personne a ecrire des entiers.

    `weekday() in ["0","1"]` est faux tous les jours : le volet ne bougerait
    plus jamais, sans erreur ni journal pour le dire.
    """
    plan = {"volets": {COVERS[0]: {"jours_ouverture": ["5", "6"]}}}
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
