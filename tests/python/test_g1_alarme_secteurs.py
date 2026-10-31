"""Chantier G1 (30/10), D9 : NON corrige, cote serveur (ADR 0300, decision finale de G1b).

D9 disait : avec plusieurs `alarm_control_panel`, « armee » veut dire
« n'importe quel panneau arme » (`_porte_ouverte`). Quatre regles de
rattachement ont ete essayees (zone, etage, appareil) : chacune perdait une
intrusion. Home Assistant ne dit JAMAIS quel secteur couvre quel ouvrant ;
tout filtrage peut taire une vraie intrusion. La regle d'avant G1 revient : un
panneau arme, n'importe quel ouvrant previent. Une alerte de trop vaut mieux
qu'une intrusion perdue. La regle de l'ecran est la meme
(tests/g1_alarme_secteurs.test.mjs).
"""
from __future__ import annotations

from conftest import RACINE
from test_alertes import FauxEtat, creer, lancer, module  # noqa: F401  (fixtures reutilisees)

P = "alarm_control_panel."


def ouvrir(a, haid):
    lancer(a._porte_ouverte(FauxEtat(haid, "on", {"device_class": "door", "friendly_name": haid})))
    envois = [c for d, _, c in a._hass.services.appels if d == "notify"]
    a._hass.services.appels.clear()
    return len(envois)


def panneaux(**kv):
    return {P + k: FauxEtat(P + k, v) for k, v in kv.items()}


def test_deux_panneaux_un_seul_arme_n_importe_quelle_porte_previent(creer):
    portes = ["binary_sensor.porte_entree", "binary_sensor.porte_garage", "binary_sensor.fenetre_salon"]
    a = creer(etats=panneaux(maison="disarmed", garage="armed_away"))
    assert [ouvrir(a, h) for h in portes] == [1, 1, 1], "le garage seul arme"
    a = creer(etats=panneaux(maison="armed_custom_bypass", garage="disarmed"))
    assert [ouvrir(a, h) for h in portes] == [1, 1, 1], "la maison seule armee"
    a = creer(etats=panneaux(maison="disarmed", garage="disarmed"))
    assert [ouvrir(a, h) for h in portes] == [0, 0, 0], "tout desarme : rien"


def test_cave_et_entree_la_porte_de_l_entree_previent(creer):
    """La centrale principale armee, rangee dans « Cave » ; un second panneau desarme, range dans « Entree »."""
    a = creer(etats=panneaux(principale="armed_away", second="disarmed"))
    assert ouvrir(a, "binary_sensor.porte_entree") == 1


def test_centrale_passerelle_desarmee_et_alarmo_arme_la_porte_previent(creer):
    """Une centrale filaire desarmee, simple passerelle de ses capteurs ; Alarmo, sur son propre appareil, arme. La regle
    « par appareil » taisait la porte, capteur de la centrale."""
    a = creer(etats=panneaux(centrale_filaire="disarmed", alarmo="armed_away"))
    assert ouvrir(a, "binary_sensor.centrale_filaire_zone_3") == 1


def test_un_panneau_muet_ne_compte_jamais_comme_arme(creer):
    """Rien de nouveau, rien de perdu : un panneau `unavailable` ou `unknown` n'est pas dans ARMEE — avant G1 non plus."""
    for muet in ("unavailable", "unknown"):
        a = creer(etats=panneaux(maison="disarmed", ancienne=muet))
        assert ouvrir(a, "binary_sensor.porte_entree") == 0, muet
    a = creer(etats=panneaux(maison="armed_away", ancienne="unavailable"))
    assert ouvrir(a, "binary_sensor.porte_entree") == 1


def test_plus_aucun_code_de_rattachement(module):
    assert not hasattr(module, "panneaux_couvrants")
    assert not hasattr(module.LoggiaAlertes, "_lieux")
    texte = (RACINE / "custom_components" / "loggia" / "alertes.py").read_text(encoding="utf-8")
    assert "panneaux_couvrants" not in texte and "_lieux" not in texte
