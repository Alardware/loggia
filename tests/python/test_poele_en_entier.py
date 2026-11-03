"""Le poele en entier (01/11, ADR 0308 ; lot 4 du rapport Gladys : P2, P3, P4).

- Un poele se reconnait a la PLATEFORME de son integration (`maestro_mcz`,
  `palazzetti`) ; ses capteurs, a la fin de leur identifiant stable : l'integration
  MCZ n'a ni cle de traduction ni classe.
- P2 : le capteur qui dit ce que fait le poele porte le drapeau `etat_poele` dans
  l'index ; l'identifiant reste au serveur.
- P3 : le compteur d'heures avant l'entretien, sous SEUIL_ENTRETIEN deux passages
  horaires de suite, devient la cle `entretien:<capteur>` que le rail lit. Rien
  ne part au telephone.
- P4 : l'etat d'un chauffage dit `poele` (tests/python/test_chauffage.py).
"""
from __future__ import annotations

import test_discovery as banc_index
import test_veilles as banc_veilles
import test_veilles_capteurs as banc_capteurs

from conftest import charger

# Les fixtures et les aides des bancs, reprises telles quelles.
creer = banc_veilles.creer
module = banc_veilles.module
regles_module = banc_veilles.regles_module
decouverte = banc_index.decouverte
lancer = banc_veilles.lancer
FauxEtat = banc_veilles.FauxEtat
Entree = banc_capteurs.Entree
registre = banc_capteurs.registre
notifications = banc_capteurs.notifications

CODE = "0000000000001"
ENTRETIEN = "sensor.poele_next_maintenance"
ETAT = "sensor.poele_current_state"


def heures(v):
    return FauxEtat(str(v), {"friendly_name": "Poele Next Maintenance", "unit_of_measurement": "h"})


def poele(monkeypatch, *, plateforme="maestro_mcz", fin="-ore_prox_manut", desactive=None):
    registre(monkeypatch, [
        Entree(ENTRETIEN, platform=plateforme, unique_id=CODE + fin, device_id="poele", disabled_by=desactive),
        # Un capteur du meme nom ailleurs, sans la cle : jamais suivi.
        Entree("sensor.autre_next_maintenance", platform="zha", unique_id="x-ore_prox_manut", device_id="autre"),
    ])


# ── La reconnaissance ──────────────────────────────────────────────────────

def test_un_poele_se_reconnait_a_sa_plateforme():
    fam = charger("chauffage_familles")
    assert fam.est_poele("maestro_mcz") and fam.est_poele("palazzetti")
    assert not fam.est_poele("versatile_thermostat") and not fam.est_poele(None) and not fam.est_poele("")


def test_les_capteurs_du_poele_se_reconnaissent_a_leur_cle():
    fam = charger("chauffage_familles")
    assert fam.capteur_poele("sensor", "maestro_mcz", CODE + "-state") == "etat"
    assert fam.capteur_poele("sensor", "maestro_mcz", CODE + "-ore_prox_manut") == "entretien"
    assert fam.capteur_poele("sensor", "maestro_mcz", CODE + "-mode") is None
    assert fam.capteur_poele("sensor", "maestro_mcz", CODE + "-state_duration") is None
    assert fam.capteur_poele("sensor", "zha", CODE + "-state") is None, "une autre integration"
    assert fam.capteur_poele("binary_sensor", "maestro_mcz", CODE + "-state") is None
    assert fam.capteur_poele("sensor", "maestro_mcz", None) is None


def test_l_index_porte_le_drapeau_etat_poele_et_pas_l_identifiant(decouverte):
    hass = banc_index.poser(
        decouverte,
        entites=[banc_index.entite(ETAT, platform="maestro_mcz", unique_id=CODE + "-state"),
                 banc_index.entite("sensor.poele_current_mode", platform="maestro_mcz", unique_id=CODE + "-mode"),
                 banc_index.entite("sensor.autre_state", platform="zha", unique_id="y-state")],
        etats={ETAT: {}, "sensor.poele_current_mode": {}, "sensor.autre_state": {}},
    )
    index = decouverte.async_index(hass)
    drapeaux = {e["id"]: e.get("etat_poele") for e in index["entities"]}
    assert drapeaux == {ETAT: True, "sensor.poele_current_mode": None, "sensor.autre_state": None}
    assert CODE not in repr(index)


# ── P3 : la veille de l'entretien ──────────────────────────────────────────

def test_sous_le_seuil_deux_passages_de_suite_la_cle_se_pose_sans_telephone(creer, monkeypatch, module):
    assert module.SEUIL_ENTRETIEN == 100
    poele(monkeypatch)
    v = creer({}, {ENTRETIEN: heures(38), "sensor.autre_next_maintenance": heures(5)})
    lancer(v._async_entretien())
    assert v.signales == set(), "un seul passage : pas encore"
    lancer(v._async_entretien())
    assert v.signales == {"entretien:" + ENTRETIEN}
    assert notifications(v) == [] and v.hass.services.appels == [], "le rail seul : rien au telephone, rien ne se commande"
    assert "entretien:" + ENTRETIEN in lancer(v.async_etat())["signales"]


def test_un_zero_d_un_instant_ne_signale_rien(creer, monkeypatch):
    """Releve sur dix jours : le poele envoie parfois 0 entre deux vraies valeurs."""
    poele(monkeypatch)
    v = creer({}, {ENTRETIEN: heures(0)})
    lancer(v._async_entretien())
    v.hass.states.table[ENTRETIEN] = heures(806)
    lancer(v._async_entretien())
    v.hass.states.table[ENTRETIEN] = heures(0)
    lancer(v._async_entretien())
    assert v.signales == set()


def test_au_dessus_du_seuil_rien_et_au_seuil_compris(creer, monkeypatch):
    poele(monkeypatch)
    v = creer({}, {ENTRETIEN: heures(101)})
    lancer(v._async_entretien())
    lancer(v._async_entretien())
    assert v.signales == set()
    v.hass.states.table[ENTRETIEN] = heures(100)
    lancer(v._async_entretien())
    lancer(v._async_entretien())
    assert v.signales == {"entretien:" + ENTRETIEN}


def test_l_entretien_fait_la_cle_s_en_va_et_un_muet_ne_la_retire_pas(creer, monkeypatch):
    poele(monkeypatch)
    v = creer({}, {ENTRETIEN: heures(38)})
    lancer(v._async_entretien())
    lancer(v._async_entretien())
    v.hass.states.table[ENTRETIEN] = heures("unavailable")
    lancer(v._async_entretien())
    assert v.signales == {"entretien:" + ENTRETIEN}, "muet : rien ne change"
    v.hass.states.table[ENTRETIEN] = heures(105)
    lancer(v._async_entretien())
    assert v.signales == {"entretien:" + ENTRETIEN}, "105 h : pas franchement au-dessus (111)"
    v.hass.states.table[ENTRETIEN] = heures(1800)
    lancer(v._async_entretien())
    assert v.signales == set()


def test_jamais_d_apres_le_nom_ni_un_capteur_desactive(creer, monkeypatch):
    poele(monkeypatch, plateforme="zha")
    v = creer({}, {ENTRETIEN: heures(5)})
    lancer(v._async_entretien())
    lancer(v._async_entretien())
    assert v.signales == set()
    poele(monkeypatch, desactive="user")
    lancer(v._async_entretien())
    lancer(v._async_entretien())
    assert v.signales == set()


def test_la_cle_survit_au_redemarrage_et_au_passage_en_observation(creer, monkeypatch, module):
    assert "entretien:" in module.PREFIXES_SIGNALES
    poele(monkeypatch)
    v = creer({}, {ENTRETIEN: heures(38)})
    lancer(v._async_entretien())
    lancer(v._async_entretien())
    v._repartir_de_zero()
    assert v.signales == {"entretien:" + ENTRETIEN}, "rien de simule : le rail le dit toujours"


def test_le_passage_horaire_comprend_l_entretien(creer, monkeypatch):
    poele(monkeypatch)
    v = creer({}, {ENTRETIEN: heures(38)})
    lancer(v._async_horaire())
    lancer(v._async_horaire())
    assert v.signales == {"entretien:" + ENTRETIEN}


def test_un_poele_seul_suffit_au_passage_horaire(creer, monkeypatch):
    """Ni piles, ni consommables, ni monoxyde : le compteur du poele pose a lui
    seul le passage horaire, et sans lui il n'y en a pas."""
    import sys

    ev = sys.modules["homeassistant.helpers.event"]
    poses = []
    monkeypatch.setattr(ev, "async_track_time_interval", lambda _h, rappel, pas: poses.append(pas) or (lambda: None))
    v = creer({}, {ENTRETIEN: heures(38)})
    lancer(v._async_reabonner())
    assert poses == [], "un registre illisible : aucun compteur, aucun passage"
    poele(monkeypatch)
    lancer(v._async_reabonner())
    assert len(poses) == 1


def test_un_registre_illisible_ne_connait_aucun_compteur(creer):
    v = creer({}, {ENTRETIEN: heures(5)})
    lancer(v._async_entretien())
    lancer(v._async_entretien())
    assert v.signales == set()

