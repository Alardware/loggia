"""Ce que les regles ont le droit de bouger (audit du 03/10, lot 4).

Le vent fort et le lever du soleil prenaient TOUS les `cover.*` : une nuit de
tempete, Loggia ouvrait la porte de garage et le portail, puis les rouvrait
s'ils ne bougeaient pas. Le scenario Reveil ouvrait un portail sans classe.

Choix de l'utilisateur du 03/10 : une classe absente n'est PAS un volet
(« option b »), et les fenetres de toit (velux) sont une OPTION — que Loggia ne
fait que fermer, jamais ouvrir. Au vent, un store banne se replie.
"""
from __future__ import annotations

import sys
import time

from conftest import charger
from test_volets import (  # noqa: F401  (fixtures reutilisees)
    CHAUD, SOLEIL_HAUT, FauxEtat, cfg_vent, creer, lancer, module, regles_module,
)

ouvrants = charger("ouvrants")


def etats_maison(**plus):
    """Un volet, un store banne, une fenetre de toit, un garage, un portail sans
    classe et une porte : tout ce qu'une maison range sous `cover.*`."""
    base = {
        "cover.salon": FauxEtat("closed", {"device_class": "shutter", "supported_features": 15}),
        "cover.terrasse": FauxEtat("open", {"device_class": "awning"}),
        "cover.velux": FauxEtat("open", {"device_class": "window"}),
        "cover.garage": FauxEtat("closed", {"device_class": "garage"}),
        "cover.portail": FauxEtat("closed", {"device_class": None}),
        "cover.porte": FauxEtat("closed", {"device_class": "door"}),
    }
    base.update(plus)
    return base


def appels(v):
    return {(service, tuple(data["entity_id"])) for (_d, service, data) in v.hass.services.appels}


# ── La liste ────────────────────────────────────────────────────────────────

def test_un_volet_se_reconnait_a_sa_classe_et_a_rien_d_autre():
    for classe in ("shutter", "blind", "shade", "curtain", "awning"):
        assert ouvrants.est_volet(classe), classe
    for classe in (None, "", "garage", "gate", "door", "window", "damper"):
        assert not ouvrants.est_volet(classe), classe


def test_ce_que_le_vent_fait_de_chacun():
    assert ouvrants.geste_au_vent("shutter") == "open_cover"
    assert ouvrants.geste_au_vent("awning") == "close_cover", "un store deploye dans la rafale se dechire"
    assert ouvrants.geste_au_vent("window") is None, "sans l'option, la fenetre n'est pas touchee"
    assert ouvrants.geste_au_vent("window", velux=True) == "close_cover", "jamais ouvrir une fenetre au vent"
    for classe in (None, "garage", "gate", "door"):
        assert ouvrants.geste_au_vent(classe, velux=True) is None, classe


# ── Le vent ─────────────────────────────────────────────────────────────────

def test_le_vent_n_ouvre_ni_garage_ni_portail_ni_porte(creer):
    v = creer(cfg_vent(), etats_maison(**SOLEIL_HAUT, **CHAUD, **{"sensor.vent": FauxEtat("70")}))
    assert lancer(v._async_vent()) is True
    assert appels(v) == {("open_cover", ("cover.salon",)), ("close_cover", ("cover.terrasse",))}


def test_avec_l_option_le_vent_ferme_la_fenetre_de_toit(creer):
    c = cfg_vent()
    c["velux"] = {"actif": True}
    v = creer(c, etats_maison(**SOLEIL_HAUT, **CHAUD, **{"sensor.vent": FauxEtat("70")}))
    lancer(v._async_vent())
    assert appels(v) == {("open_cover", ("cover.salon",)),
                         ("close_cover", ("cover.terrasse", "cover.velux"))}


# ── Le planning ─────────────────────────────────────────────────────────────

def test_le_lever_n_ouvre_que_les_volets(creer):
    c = {"planning": {"actif": True}, "velux": {"actif": True}}
    v = creer(c, etats_maison())
    lancer(v._async_planifie("ouvrir"))
    ouverts = {h for (s, hs) in appels(v) if s == "open_cover" for h in hs}
    assert ouverts == {"cover.salon", "cover.terrasse"}, "le lever a ouvert autre chose que des volets"


def test_le_coucher_ferme_la_fenetre_de_toit_seulement_avec_l_option(creer):
    salon_ouvert = {"cover.salon": FauxEtat("open", {"device_class": "shutter"})}
    sans = creer({"planning": {"actif": True}}, etats_maison(**salon_ouvert))
    lancer(sans._async_planifie("fermer"))
    fermes = {h for (s, hs) in appels(sans) if s == "close_cover" for h in hs}
    assert "cover.velux" not in fermes and "cover.garage" not in fermes and "cover.portail" not in fermes
    avec = creer({"planning": {"actif": True}, "velux": {"actif": True}}, etats_maison(**salon_ouvert))
    lancer(avec._async_planifie("fermer"))
    fermes = {h for (s, hs) in appels(avec) if s == "close_cover" for h in hs}
    assert "cover.velux" in fermes and "cover.garage" not in fermes and "cover.portail" not in fermes


# ── Le rattrapage ───────────────────────────────────────────────────────────

def _en_attente(v, haid="cover.salon", sens="fermer"):
    v.attente[haid] = {"sens": sens, "expire": time.time() + 3600, "motif": "baie ouverte"}


def test_le_rattrapage_ne_ferme_plus_en_mode_manuel(creer):
    """La fermeture du coucher etait retenue par une baie ouverte ; on passe
    en « Manuel » pour garder le salon ouvert ; a la fermeture de la baie,
    Loggia fermait quand meme le volet."""
    v = creer({"planning": {"actif": True, "mode": "manuel"}},
              etats_maison(**{"cover.salon": FauxEtat("open", {"device_class": "shutter"})}))
    _en_attente(v)
    lancer(v._async_rattraper())
    assert v.hass.services.appels == []
    assert v.attente == {}, "l'ordre perime est reste en attente"


def test_le_rattrapage_agit_toujours_en_mode_auto(creer):
    v = creer({"planning": {"actif": True, "mode": "auto"}},
              etats_maison(**{"cover.salon": FauxEtat("open", {"device_class": "shutter"})}))
    _en_attente(v)
    lancer(v._async_rattraper())
    assert ("close_cover", ("cover.salon",)) in appels(v)


def test_passer_en_manuel_vide_les_ordres_en_attente(creer):
    v = creer({"planning": {"actif": True, "mode": "auto"}}, etats_maison())
    _en_attente(v)
    lancer(v.async_enregistrer({"planning": {"mode": "manuel"}}))
    assert v.attente == {}
    v.hass.abandonner()


# ── L'anemometre ────────────────────────────────────────────────────────────

def test_un_anemometre_change_est_suivi_tout_de_suite(creer, monkeypatch):
    evenement = sys.modules["homeassistant.helpers.event"]
    suivies = []

    def suivre(_hass, entites, _rappel):
        suivies.append(list(entites))
        return lambda: None

    monkeypatch.setattr(evenement, "async_track_state_change_event", suivre)
    v = creer(cfg_vent(), etats_maison())
    lancer(v.async_enregistrer({"vent": {"entite": "sensor.anemometre_toit"}}))
    assert suivies and suivies[-1] == ["sun.sun", "sensor.anemometre_toit"], suivies
    assert len(v._defait) == 1, "l'ancien abonnement est reste en place"
    v.hass.abandonner()


# ── Les scenarios ───────────────────────────────────────────────────────────

def _maison(velux=False):
    entites = {
        "cover.salon": {"classe": "shutter", "etat": "closed", "piece": "Salon"},
        "cover.portail": {"classe": None, "etat": "closed", "piece": None},
        "cover.garage": {"classe": "garage", "etat": "closed", "piece": None},
        "cover.velux": {"classe": "window", "etat": "closed", "piece": "Combles"},
    }
    return {"zones": [], "entites": entites, "velux": velux}


def test_le_reveil_n_ouvre_ni_portail_ni_garage_ni_velux():
    scn = charger("scenarios")
    ouvrir = {"famille": "volets", "geste": "ouvrir", "portee": "maison"}
    assert scn.cibles(ouvrir, _maison(velux=True), None) == ["cover.salon"]


def test_un_scenario_qui_ferme_prend_le_velux_seulement_avec_l_option():
    scn = charger("scenarios")
    m = _maison()
    for e in m["entites"].values():
        e["etat"] = "open"
    fermer = {"famille": "volets", "geste": "fermer", "portee": "maison"}
    assert scn.cibles(fermer, m, None) == ["cover.salon"]
    m["velux"] = True
    assert scn.cibles(fermer, m, None) == ["cover.salon", "cover.velux"]
