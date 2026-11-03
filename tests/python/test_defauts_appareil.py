"""Les defauts d'appareil et le sabotage sous alarme (01/11, ADR 0307).

- Le sabotage (`tamper`) PENDANT que l'alarme est armee part au telephone, dans
  la categorie de l'ouverture sous alarme (« portes ») : l'ecran le disait, le
  telephone non (fin du S4 du 30/10). Desarmee, c'est quelqu'un qui change une
  pile : rien. Un sabotage qui APPARAIT allume n'est pas un evenement.
- Le bouton qui rearme un appareil en defaut se reconnait a sa cle stable : chez
  lui, le poele MCZ Maestro (`…-m1_com_reset_allarm`). Le composant pose le
  drapeau `rearmer` dans l'index ; l'identifiant reste au serveur.
"""
from __future__ import annotations

import test_alertes as base
import test_discovery as banc_index
from test_alertes import FauxEtat, FauxEvenement, lancer
from test_discovery import entite, poser

from conftest import charger

# Les fixtures des bancs, reprises telles quelles.
creer = base.creer
module = base.module
decouverte = banc_index.decouverte

SABOTAGE = "binary_sensor.capteur_porte_entree_tamper"
ARMEE = {"alarm_control_panel.maison": FauxEtat("alarm_control_panel.maison", "armed_away")}
DESARMEE = {"alarm_control_panel.maison": FauxEtat("alarm_control_panel.maison", "disarmed")}


def binaire(etat):
    return FauxEtat(SABOTAGE, etat, {"device_class": "tamper", "friendly_name": "Porte d'entrée"})


def basculer(a, old="off"):
    a._on_state(FauxEvenement(binaire("on"), None if old is None else binaire(old)))
    taches, a._hass.taches = a._hass.taches, []
    for t in taches:
        lancer(t)
    return [c["message"] for d, _s, c in a._hass.services.appels if d == "notify"]


def test_le_sabotage_sous_alarme_armee_part_au_telephone(creer):
    a = creer(etats=dict(ARMEE))
    assert basculer(a) == ["Sabotage pendant que l’alarme est armée : Porte d'entrée"]


def test_le_sabotage_attend_les_heures_calmes_comme_l_ouverture(creer, module):
    """La categorie « portes » : ni danger, ni critique."""
    assert "portes" not in module.DANGER
    a = creer(etats=dict(ARMEE))
    basculer(a)
    charge = a._hass.services.appels[0][2]
    assert "critical" not in str(charge.get("data", {}))


def test_alarme_desarmee_le_sabotage_ne_dit_rien(creer):
    a = creer(etats=dict(DESARMEE))
    assert basculer(a) == []


def test_la_categorie_decochee_le_fait_taire(creer):
    a = creer({"categories": {"portes": False}}, etats=dict(ARMEE))
    assert basculer(a) == []


def test_un_sabotage_qui_apparait_allume_n_est_pas_un_evenement(creer):
    a = creer(etats=dict(ARMEE))
    assert basculer(a, old=None) == []


def test_le_bouton_de_rearmement_se_reconnait_a_sa_cle():
    v = charger("voisins")
    assert v.est_rearmement("button", "0000000000001-m1_com_reset_allarm", None) is True
    assert v.est_rearmement("button", None, "alarm_reset") is True
    assert v.est_rearmement("button", "abc_reset_error", None) is True
    assert v.est_rearmement("button", "0000000000001-m1_giorno", None) is False
    assert v.est_rearmement("button", "aspirateur_reset_filter", "reset_filter") is False, "un reset de filtre n'est pas un rearmement"
    assert v.est_rearmement("button", "x_restart", "restart") is False
    assert v.est_rearmement("switch", "0000000000001-m1_com_reset_allarm", None) is False


def test_l_index_porte_le_drapeau_rearmer_et_pas_l_identifiant(decouverte):
    hass = poser(
        decouverte,
        entites=[entite("button.poele_alarm_reset", platform="maestro_mcz", unique_id="0000000000001-m1_com_reset_allarm"),
                 entite("button.poele_set_system_date_time", platform="maestro_mcz", unique_id="0000000000001-m1_giorno")],
        etats={"button.poele_alarm_reset": {}, "button.poele_set_system_date_time": {}},
    )
    index = decouverte.async_index(hass)
    drapeaux = {e["id"]: e.get("rearmer") for e in index["entities"]}
    assert drapeaux == {"button.poele_alarm_reset": True, "button.poele_set_system_date_time": None}
    assert "m1_com_reset_allarm" not in repr(index)
