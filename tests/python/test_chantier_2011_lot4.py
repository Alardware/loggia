"""Lot 4 du chantier du 20/11 (ADR 0384) : la sauvegarde ratee aux
administrateurs (P9) et la fuite lente de nuit par le compteur d'eau (A1).

Ce qui est verrouille ici :
  * `sauvegarde_ratee`, le MIROIR de l'ecran (`etatSauvegarde`) : echec, reussite
    plus recente, sauvegarde en cours, jamais reussie ;
  * l'envoi UNE fois, aux administrateurs, la cle posee seulement si c'est parti,
    rearmee par une reussite plus recente, jamais par un etat muet ;
  * `fuite_nocturne` : quatre heures qui avancent, une heure plate, un compteur
    remis a zero, un releve par jour ;
  * la lecture du compteur d'eau dans les preferences du tableau Energie, l'heure
    du verdict, le message au bon nom ;
  * les deux prefixes gardes au redemarrage, et le passage horaire qui tourne.

Aucun appel a Home Assistant : des doublures, et un `prevenir` qui note ses appels.
"""
from __future__ import annotations

import logging
import sys
import types
from datetime import datetime, timedelta, timezone

import pytest

from conftest import FauxStore
from test_veilles import FauxEtat, creer, lancer, module, regles_module  # noqa: F401  (fixtures reutilisees)
from test_veilles_capteurs import Entree, notifications, registre

TZ = timezone(timedelta(hours=1))
TENTEE = "sensor.backup_last_attempted_automatic_backup"
REUSSIE = "sensor.backup_last_successful_automatic_backup"
GESTIONNAIRE = "sensor.backup_backup_manager_state"
COMPTEUR = "sensor.compteur_eau"


def instant(*args) -> float:
    """Un instant en secondes epoch, a l'heure de la maison (UTC + 1)."""
    return datetime(*args, tzinfo=TZ).timestamp()


@pytest.fixture(autouse=True)
def horodatages(monkeypatch):
    """`dt_util.parse_datetime` : la doublure de conftest n'a que `now`."""
    monkeypatch.setattr(sys.modules["homeassistant.util.dt"], "parse_datetime", datetime.fromisoformat, raising=False)


class Appels(list):
    """La liste des appels, et la reponse que le socle de doublure rend."""
    reponse: dict


def ecouter(v, parti=True):
    """Un `regles.prevenir` qui note ses appels (et rend `parti["oui"]`)."""
    reponse = {"oui": parti}
    appels = Appels()

    async def prevenir(module_, regle, message, **kw):
        appels.append((module_, regle, message, kw))
        return reponse["oui"]

    v.regles.prevenir = prevenir
    appels.reponse = reponse
    return appels


def a_l_heure(v, *args):
    v._maintenant = lambda: datetime(*args, tzinfo=TZ)


# ── P9 : la regle, en fonction pure ─────────────────────────────────────────

def test_une_tentative_plus_recente_que_la_reussite_est_un_echec(module):
    assert module.sauvegarde_ratee(200.0, 100.0, "idle") is True
    assert module.sauvegarde_ratee(200.0, 100.0, None) is True, "sans capteur du gestionnaire : au repos, comme l'ecran"


def test_une_reussite_plus_recente_ou_egale_n_est_pas_un_echec(module):
    assert module.sauvegarde_ratee(100.0, 200.0, "idle") is False
    # Home Assistant note la tentative AU DEPART : la reussite vient apres (ADR 0314).
    assert module.sauvegarde_ratee(100.0, 100.0, "idle") is False


def test_une_sauvegarde_en_cours_ne_dit_rien(module):
    for etat in ("create_backup", "receive_backup", "restore_backup", "unavailable"):
        assert module.sauvegarde_ratee(200.0, 100.0, etat) is False, etat


def test_jamais_reussie_toute_tentative_est_un_echec(module):
    assert module.sauvegarde_ratee(200.0, None, "idle") is True
    assert module.sauvegarde_ratee(None, None, "idle") is False, "ni tentative ni reussite : rien a dire"
    assert module.sauvegarde_ratee(None, 100.0, "idle") is False


def test_une_tentative_est_de_cette_nuit_comme_sur_l_ecran(module):
    maintenant = datetime(2026, 11, 21, 9, 0, tzinfo=TZ)
    assert module.tentee_de_nuit(instant(2026, 11, 21, 4, 55), maintenant) is True
    assert module.tentee_de_nuit(instant(2026, 11, 21, 8, 30), maintenant) is False, "partie apres 8 h"
    assert module.tentee_de_nuit(instant(2026, 11, 19, 4, 55), maintenant) is False, "vieille de plus de 24 h"
    assert module.tentee_de_nuit(None, maintenant) is False


# ── P9 : l'envoi ────────────────────────────────────────────────────────────

def sauvegardes(monkeypatch, v, tentee, reussie, gestionnaire="idle"):
    """Le registre `backup`, et les trois etats que Home Assistant en rend."""
    registre(monkeypatch, [
        Entree(TENTEE, platform="backup", translation_key="last_attempted_automatic_backup"),
        Entree(REUSSIE, platform="backup", translation_key="last_successful_automatic_backup"),
        Entree(GESTIONNAIRE, platform="backup", translation_key="backup_manager_state"),
        # Le meme nom ailleurs : une autre plateforme ne compte pas.
        Entree("sensor.autre_last_attempted_automatic_backup", platform="autre",
               translation_key="last_attempted_automatic_backup"),
    ])
    poser(v, tentee, reussie, gestionnaire)


def poser(v, tentee, reussie, gestionnaire="idle"):
    for haid, valeur in ((TENTEE, tentee), (REUSSIE, reussie), (GESTIONNAIRE, gestionnaire)):
        v.hass.states.table[haid] = FauxEtat(valeur)


ECHEC = ("2026-11-21T03:55:09+00:00", "2026-11-20T03:56:41+00:00")


def test_la_sauvegarde_ratee_part_une_fois_aux_administrateurs(creer, monkeypatch):
    v = creer({})
    appels = ecouter(v)
    sauvegardes(monkeypatch, v, *ECHEC)
    a_l_heure(v, 2026, 11, 21, 6, 10)
    lancer(v._async_sauvegarde())
    lancer(v._async_sauvegarde())
    lancer(v._async_sauvegarde())
    assert len(appels) == 1, "une seule fois"
    module_, regle, message, kw = appels[0]
    assert (module_, regle, message) == ("veilles", "sauvegarde", "La sauvegarde de cette nuit a échoué")
    assert kw["pour"] == "admins"
    assert kw["simuler"] is False
    assert v.signales == {"sauvegarde:" + TENTEE}
    assert v._depot.contenu["signales"] == ["sauvegarde:" + TENTEE], "gardee sur le disque"


def test_une_vieille_tentative_ne_dit_pas_cette_nuit(creer, monkeypatch):
    v = creer({})
    appels = ecouter(v)
    sauvegardes(monkeypatch, v, "2026-11-18T03:55:09+00:00", "2026-11-17T03:56:41+00:00")
    a_l_heure(v, 2026, 11, 21, 6, 10)
    lancer(v._async_sauvegarde())
    assert [a[2] for a in appels] == ["La dernière sauvegarde a échoué"]


def test_une_reussite_plus_recente_rearme_et_un_nouvel_echec_se_redit(creer, monkeypatch):
    v = creer({})
    appels = ecouter(v)
    sauvegardes(monkeypatch, v, *ECHEC)
    a_l_heure(v, 2026, 11, 21, 6, 10)
    lancer(v._async_sauvegarde())
    assert len(appels) == 1
    # La nuit suivante : tentative puis reussite.
    poser(v, "2026-11-22T03:55:09+00:00", "2026-11-22T03:56:41+00:00")
    lancer(v._async_sauvegarde())
    assert v.signales == set(), "rearmee"
    assert len(appels) == 1
    # Puis une nuit qui rate : on le redit.
    poser(v, "2026-11-23T03:55:09+00:00", "2026-11-22T03:56:41+00:00")
    lancer(v._async_sauvegarde())
    assert len(appels) == 2
    assert v.signales == {"sauvegarde:" + TENTEE}


def test_un_envoi_qui_n_est_pas_parti_ne_pose_pas_la_cle(creer, monkeypatch):
    v = creer({})
    appels = ecouter(v, parti=False)
    sauvegardes(monkeypatch, v, *ECHEC)
    a_l_heure(v, 2026, 11, 21, 6, 10)
    lancer(v._async_sauvegarde())
    assert v.signales == set()
    appels.reponse["oui"] = True
    lancer(v._async_sauvegarde())
    assert len(appels) == 2, "retente au passage suivant"
    assert v.signales == {"sauvegarde:" + TENTEE}


def test_jamais_reussie_une_tentative_se_dit(creer, monkeypatch):
    v = creer({})
    appels = ecouter(v)
    sauvegardes(monkeypatch, v, ECHEC[0], "unknown")
    a_l_heure(v, 2026, 11, 21, 6, 10)
    lancer(v._async_sauvegarde())
    assert len(appels) == 1


@pytest.mark.parametrize("tentee, reussie, gestionnaire", [
    ("unavailable", ECHEC[1], "idle"),
    ("unknown", ECHEC[1], "idle"),
    (ECHEC[0], "unavailable", "idle"),
    (ECHEC[0], ECHEC[1], "unavailable"),
    (ECHEC[0], ECHEC[1], "create_backup"),
])
def test_un_etat_muet_ou_une_sauvegarde_en_cours_ne_dit_ni_ne_rearme(creer, monkeypatch, tentee, reussie, gestionnaire):
    v = creer({})
    appels = ecouter(v)
    sauvegardes(monkeypatch, v, tentee, reussie, gestionnaire)
    a_l_heure(v, 2026, 11, 21, 6, 10)
    v.signales = {"sauvegarde:" + TENTEE}
    lancer(v._async_sauvegarde())
    assert appels == []
    assert v.signales == {"sauvegarde:" + TENTEE}, "rien ne rearme sans une vraie reussite"


def test_un_muet_ne_dit_rien_non_plus_quand_rien_n_est_signale(creer, monkeypatch):
    v = creer({})
    appels = ecouter(v)
    sauvegardes(monkeypatch, v, "unavailable", "unavailable", "unavailable")
    lancer(v._async_sauvegarde())
    assert appels == [] and v.signales == set()


def test_sans_capteur_de_sauvegarde_ou_sans_registre_rien_ne_part(creer, monkeypatch):
    v = creer({})
    appels = ecouter(v)
    lancer(v._async_sauvegarde())  # registre illisible (fixture)
    registre(monkeypatch, [Entree("sensor.autre", platform="autre")])
    lancer(v._async_sauvegarde())
    assert appels == []


def test_la_sauvegarde_se_coupe_dans_la_configuration(creer, monkeypatch):
    v = creer({"sauvegarde": {"actif": False}})
    appels = ecouter(v)
    sauvegardes(monkeypatch, v, *ECHEC)
    lancer(v._async_sauvegarde())
    assert appels == []


def test_un_capteur_desactive_ne_compte_pas(creer, monkeypatch):
    v = creer({})
    appels = ecouter(v)
    sauvegardes(monkeypatch, v, *ECHEC)
    registre(monkeypatch, [Entree(TENTEE, platform="backup", translation_key="last_attempted_automatic_backup",
                                  disabled_by="user")])
    lancer(v._async_sauvegarde())
    assert appels == []


def test_en_observation_la_sauvegarde_se_simule(creer, monkeypatch):
    v = creer({"simulation": {"actif": True}})
    appels = ecouter(v)
    sauvegardes(monkeypatch, v, *ECHEC)
    a_l_heure(v, 2026, 11, 21, 6, 10)
    lancer(v._async_sauvegarde())
    assert appels[0][3]["simuler"] is True


def test_le_vrai_socle_envoie_le_texte_de_la_sauvegarde(creer, monkeypatch):
    """Sans doublure du socle : sans telephone decouvert, le repli de Parametres
    > Alertes recoit le texte (les administrateurs sans telephone ne sont pas perdus)."""
    v = creer({})
    sauvegardes(monkeypatch, v, *ECHEC)
    a_l_heure(v, 2026, 11, 21, 6, 10)
    lancer(v._async_sauvegarde())
    assert [c["message"] for _, _, c in notifications(v)] == ["La sauvegarde de cette nuit a échoué"]


def test_les_reglages_sont_de_vrais_booleens(creer):
    v = creer({})
    assert v.cfg["sauvegarde"] == {"actif": True} and v.cfg["fuite_nuit"] == {"actif": True}
    sale = v._config_de({"sauvegarde": {"actif": "oui"}, "fuite_nuit": {"actif": 1}})
    assert sale["sauvegarde"] == {"actif": False} and sale["fuite_nuit"] == {"actif": False}
    coupe = lancer(v.async_enregistrer({"sauvegarde": {"actif": False}}))
    assert coupe["sauvegarde"] == {"actif": False} and coupe["fuite_nuit"] == {"actif": True}


# ── A1 : la regle, en fonction pure ─────────────────────────────────────────

DEBUT = instant(2026, 11, 21, 1, 0)


def serie(*valeurs, pas=1200.0):
    """Un compteur releve tous les `pas` secondes depuis 01:00."""
    return [(DEBUT + k * pas, v) for k, v in enumerate(valeurs)]


def test_quatre_heures_qui_avancent_sont_une_fuite(module):
    # Une valeur toutes les 20 minutes, qui monte toujours.
    points = serie(*[100 + 0.4 * k for k in range(13)])
    assert module.fuite_nocturne(points, DEBUT) is True


def test_une_heure_plate_n_est_pas_une_fuite(module):
    # 03:00 - 04:00 : le compteur ne bouge plus (de la sixieme a la dixieme valeur).
    points = serie(100, 100.4, 100.8, 101.2, 101.6, 101.9, 102.0, 102.0, 102.0, 102.0, 102.4, 102.8, 103.2)
    assert module.fuite_nocturne(points, DEBUT) is False


def test_un_compteur_remis_a_zero_n_est_pas_une_fuite(module):
    points = serie(100, 100.4, 100.8, 101.2, 1.0, 1.4, 1.8, 2.2, 2.6, 3.0, 3.4, 3.8, 4.2)
    assert module.fuite_nocturne(points, DEBUT) is False


def test_un_point_par_jour_ne_declenche_jamais(module):
    assert module.fuite_nocturne([(DEBUT - 3600 * 20, 100.0)], DEBUT) is None
    assert module.fuite_nocturne([(DEBUT - 3600 * 20, 100.0), (DEBUT + 3600 * 20, 105.0)], DEBUT) is None
    # Pas de verdict : sans point du tout, ni avant le debut.
    assert module.fuite_nocturne([], DEBUT) is None
    assert module.fuite_nocturne(None, DEBUT) is None
    assert module.fuite_nocturne(serie(*[100 + k for k in range(13)])[1:], DEBUT) is None


def test_un_releve_toutes_les_heures_suffit(module):
    # Cinq valeurs : 01:00, 02:00, 03:00, 04:00, 05:00 — l'avance de chaque heure se lit.
    assert module.fuite_nocturne(serie(1, 2, 3, 4, 5, pas=3600.0), DEBUT) is True
    assert module.fuite_nocturne(serie(1, 2, 3, 3, 5, pas=3600.0), DEBUT) is False


def test_la_valeur_a_un_instant_est_la_derniere_connue(module):
    # Le compteur s'est mis a jour avant 01:00 : c'est sa valeur a 01:00.
    points = [(DEBUT - 600, 100.0), (DEBUT + 1800, 101.0), (DEBUT + 5400, 102.0), (DEBUT + 9000, 103.0),
              (DEBUT + 12600, 104.0)]
    assert module.fuite_nocturne(points, DEBUT) is True
    # Un point qui ne bouge qu'a 04:30 laisse 02:00 -> 03:00 et 03:00 -> 04:00 plates.
    assert module.fuite_nocturne([(DEBUT - 600, 100.0), (DEBUT + 1800, 101.0), (DEBUT + 5400, 101.0),
                                  (DEBUT + 7200, 101.0), (DEBUT + 16200, 106.0)], DEBUT) is False


def test_les_valeurs_illisibles_sont_ecartees(module):
    points = serie(*[100 + 0.4 * k for k in range(13)])
    points.insert(3, (DEBUT + 700, "unavailable"))
    points.insert(5, (DEBUT + 1500, float("nan")))
    assert module.fuite_nocturne(points, DEBUT) is True


# ── A1 : le compteur d'eau du tableau Energie ──────────────────────────────

def tableau_energie(monkeypatch, prefs):
    """`homeassistant.components.energy.data.async_get_manager` (motif : test_veilles_capteurs)."""
    async def gestionnaire(_hass):
        return types.SimpleNamespace(data=prefs)

    energy = types.ModuleType("homeassistant.components.energy.data")
    energy.async_get_manager = gestionnaire
    monkeypatch.setitem(sys.modules, "homeassistant.components", types.ModuleType("homeassistant.components"))
    monkeypatch.setitem(sys.modules, "homeassistant.components.energy", types.ModuleType("homeassistant.components.energy"))
    monkeypatch.setitem(sys.modules, "homeassistant.components.energy.data", energy)


def test_le_compteur_d_eau_se_lit_dans_les_preferences_du_tableau_energie(creer, monkeypatch):
    tableau_energie(monkeypatch, {"energy_sources": [
        {"type": "grid", "stat_energy_from": "sensor.reseau"},
        {"type": "water", "stat_energy_from": COMPTEUR},
        {"type": "water", "stat_energy_from": COMPTEUR},
        {"type": "water", "stat_energy_from": "pas une entite"},
        {"type": "water"},
        {"type": "battery", "stat_energy_from": "sensor.batterie"},
        "bizarre",
    ]})
    v = creer({})
    assert lancer(v._compteurs_eau()) == [COMPTEUR]


def test_sans_tableau_energie_aucun_compteur(creer, monkeypatch):
    v = creer({})
    monkeypatch.delitem(sys.modules, "homeassistant.components.energy.data", raising=False)
    assert lancer(v._compteurs_eau()) == []

    async def casse(_hass):
        raise RuntimeError("tableau illisible")

    tableau_energie(monkeypatch, {})
    sys.modules["homeassistant.components.energy.data"].async_get_manager = casse
    assert lancer(v._compteurs_eau()) == []


# ── A1 : l'historique et l'envoi ────────────────────────────────────────────

@pytest.fixture
def historique(monkeypatch):
    """`homeassistant.components.recorder`, comme le vrai (modele : test_prises.py) :
    `state_changes_during_period(hass, debut, fin, entity_id, ...)` rend
    {entity_id: [etats]}. `points` : [(t_epoch, valeur)] ; `panne` : il leve."""
    h = types.SimpleNamespace(points=[], panne=False, demandes=[])

    def state_changes_during_period(hass, debut, fin, entity_id, no_attributes=False, include_start_time_state=True):
        if h.panne:
            raise RuntimeError("enregistreur arrete")
        h.demandes.append((debut, fin, entity_id, no_attributes, include_start_time_state))
        etats = []
        for t, valeur in h.points:
            e = FauxEtat(str(valeur))
            e.last_updated = datetime.fromtimestamp(t, timezone.utc)
            etats.append(e)
        return {entity_id: etats}

    class Instance:
        async def async_add_executor_job(self, cible, *args):
            return cible(*args)

    recorder = types.ModuleType("homeassistant.components.recorder")
    recorder.get_instance = lambda _hass: Instance()
    recorder.history = types.SimpleNamespace(state_changes_during_period=state_changes_during_period)
    monkeypatch.setitem(sys.modules, "homeassistant.components", types.ModuleType("homeassistant.components"))
    monkeypatch.setitem(sys.modules, "homeassistant.components.recorder", recorder)
    return h


@pytest.fixture
def maison_eau(creer, monkeypatch, historique):
    """Une maison au compteur d'eau « Compteur eau » ; `v` et le journal des appels du socle."""
    tableau_energie(monkeypatch, {"energy_sources": [{"type": "water", "stat_energy_from": COMPTEUR}]})
    v = creer({}, {COMPTEUR: FauxEtat("103.6", {"friendly_name": "Compteur eau"})})
    historique.points = serie(*[100 + 0.4 * k for k in range(13)])
    return v, historique


def test_une_fuite_de_nuit_part_une_fois_aux_presents(maison_eau):
    v, historique = maison_eau
    appels = ecouter(v)
    a_l_heure(v, 2026, 11, 21, 5, 47)
    lancer(v._async_fuite())
    lancer(v._async_fuite())
    assert len(appels) == 1, "une fois par nuit"
    module_, regle, message, kw = appels[0]
    assert (module_, regle) == ("veilles", "fuite")
    assert message == ("{nom} : de l’eau a coulé toute la nuit, une fuite ?", {"nom": "Compteur eau"})
    assert kw["pour"] == "presents"
    assert v.signales == {"fuite:" + COMPTEUR}
    # La fenetre lue : de 01:00 a 05:00 heure de la maison, en UTC, valeur de depart comprise.
    debut, fin, haid, sans_attributs, depart = historique.demandes[0]
    assert (debut, fin) == (datetime(2026, 11, 21, 0, 0, tzinfo=timezone.utc), datetime(2026, 11, 21, 4, 0, tzinfo=timezone.utc))
    assert (haid, sans_attributs, depart) == (COMPTEUR, True, True)


def test_le_message_de_fuite_porte_le_nom_du_compteur(maison_eau):
    """Le vrai socle, sans doublure : le texte arrive au telephone, au bon nom."""
    v, _ = maison_eau
    a_l_heure(v, 2026, 11, 21, 5, 47)
    lancer(v._async_fuite())
    assert [c["message"] for _, _, c in notifications(v)] == [
        "Compteur eau : de l’eau a coulé toute la nuit, une fuite ?"]


def test_une_nuit_sans_fuite_rearme_la_cle(maison_eau):
    v, historique = maison_eau
    appels = ecouter(v)
    a_l_heure(v, 2026, 11, 21, 5, 47)
    lancer(v._async_fuite())
    historique.points = serie(100, 100, 100, 100, 100.4, 100.4, 100.4, 100.4, 100.8, 100.8, 100.8, 100.8, 101.2)
    a_l_heure(v, 2026, 11, 22, 5, 47)
    lancer(v._async_fuite())
    assert v.signales == set()
    assert v._depot.contenu["signales"] == []
    assert len(appels) == 1


def test_sans_verdict_la_cle_reste(maison_eau):
    """Un compteur trop peu releve : ni envoi, ni rearmement."""
    v, historique = maison_eau
    appels = ecouter(v)
    v.signales = {"fuite:" + COMPTEUR}
    historique.points = [(DEBUT - 7200, 100.0)]
    a_l_heure(v, 2026, 11, 21, 5, 47)
    lancer(v._async_fuite())
    assert appels == [] and v.signales == {"fuite:" + COMPTEUR}


def test_un_envoi_qui_n_est_pas_parti_ne_pose_pas_la_cle_de_fuite(maison_eau):
    v, _ = maison_eau
    appels = ecouter(v, parti=False)
    a_l_heure(v, 2026, 11, 21, 5, 47)
    lancer(v._async_fuite())
    assert v.signales == set()
    appels.reponse["oui"] = True
    lancer(v._async_fuite(rattrapage=True))
    assert len(appels) == 2 and v.signales == {"fuite:" + COMPTEUR}


@pytest.mark.parametrize("heure, minute, rattrapage, attendu", [
    (4, 30, False, 0),   # la nuit n'est pas finie
    (4, 59, True, 0),
    (5, 0, False, 1),    # le passage de cinq heures
    (5, 47, False, 1),
    (6, 10, False, 0),   # un passage horaire plus tard ne juge plus
    (6, 10, True, 1),    # un demarrage entre 05:00 et 08:00 rattrape
    (7, 59, True, 1),
    (8, 0, True, 0),     # trop tard
    (14, 0, True, 0),
])
def test_la_fuite_ne_se_juge_qu_a_l_heure_du_verdict(maison_eau, heure, minute, rattrapage, attendu):
    v, historique = maison_eau
    appels = ecouter(v)
    a_l_heure(v, 2026, 11, 21, heure, minute)
    lancer(v._async_fuite(rattrapage=rattrapage))
    assert len(appels) == attendu
    if not attendu:
        assert historique.demandes == [], "pas meme une lecture hors de l'heure"


def test_un_historique_illisible_se_dit_une_fois_et_ne_previent_pas(maison_eau, caplog):
    v, historique = maison_eau
    appels = ecouter(v)
    historique.panne = True
    a_l_heure(v, 2026, 11, 21, 5, 47)
    with caplog.at_level(logging.WARNING):
        lancer(v._async_fuite())
        lancer(v._async_fuite())
    assert appels == []
    assert len([r for r in caplog.records if "historique du compteur" in r.getMessage()]) == 1
    historique.panne = False
    lancer(v._async_fuite())
    assert len(appels) == 1, "l'historique revenu, la veille reprend"


def test_la_fuite_se_coupe_dans_la_configuration(creer, monkeypatch, historique):
    tableau_energie(monkeypatch, {"energy_sources": [{"type": "water", "stat_energy_from": COMPTEUR}]})
    v = creer({"fuite_nuit": {"actif": False}}, {COMPTEUR: FauxEtat("1")})
    appels = ecouter(v)
    historique.points = serie(*[100 + 0.4 * k for k in range(13)])
    a_l_heure(v, 2026, 11, 21, 5, 47)
    lancer(v._async_fuite())
    assert appels == []


def test_sans_compteur_d_eau_rien_ne_part(creer, monkeypatch, historique):
    tableau_energie(monkeypatch, {"energy_sources": [{"type": "grid", "stat_energy_from": "sensor.reseau"}]})
    v = creer({})
    appels = ecouter(v)
    a_l_heure(v, 2026, 11, 21, 5, 47)
    lancer(v._async_fuite())
    assert appels == [] and historique.demandes == []


def test_une_nuit_de_changement_d_heure_trop_courte_ne_juge_pas_le_futur(maison_eau):
    """Si 05:00 locale tombe avant la fin des quatre heures lues (le passage a
    l'heure d'ete saute une heure), la veille attend : pas de verdict sur ce qui
    n'a pas eu lieu."""
    v, historique = maison_eau
    appels = ecouter(v)
    # Un « maintenant » dont l'heure locale est 5, mais a 3 h 59 de 01:00 locale.
    faux = datetime(2026, 11, 21, 5, 10, tzinfo=TZ)
    v._maintenant = lambda: types.SimpleNamespace(
        hour=5, replace=faux.replace, timestamp=lambda: faux.timestamp() - 3600)
    lancer(v._async_fuite())
    assert appels == [] and historique.demandes == []


# ── Le passage horaire, les prefixes gardes ────────────────────────────────

def test_le_passage_horaire_juge_les_deux_veilles(creer, monkeypatch):
    v = creer({})
    vus = []

    async def sauvegarde():
        vus.append("sauvegarde")

    async def fuite(rattrapage=False):
        vus.append(("fuite", rattrapage))

    v._async_sauvegarde, v._async_fuite = sauvegarde, fuite
    lancer(v._async_horaire())
    lancer(v._async_horaire(rattrapage=True))
    assert vus == ["sauvegarde", ("fuite", False), "sauvegarde", ("fuite", True)]


def test_une_panne_de_la_sauvegarde_ne_coupe_pas_la_fuite(creer, caplog):
    v = creer({})
    vus = []

    async def casse():
        raise RuntimeError("registre en panne")

    async def fuite(rattrapage=False):
        vus.append("fuite")

    v._async_sauvegarde, v._async_fuite = casse, fuite
    with caplog.at_level(logging.ERROR):
        lancer(v._async_horaire())
    assert vus == ["fuite"]
    assert any("sauvegarde ratee" in r.getMessage() for r in caplog.records)


def test_le_demarrage_complet_rattrape_la_nuit(creer):
    v = creer({})
    vus = []

    async def horaire(rattrapage=False):
        vus.append(rattrapage)

    async def collecte(rattrapage=False):
        return False

    v._async_horaire, v._async_collecte = horaire, collecte
    lancer(v._async_rattraper())
    assert vus == [True]


def test_le_minuteur_horaire_tourne_pour_la_sauvegarde_et_la_fuite(creer):
    pose = []
    ev = sys.modules["homeassistant.helpers.event"]
    ancien = ev.async_track_time_interval
    ev.async_track_time_interval = lambda hass, action, delai: (pose.append(delai) or (lambda: None))
    try:
        v = creer({})
        lancer(v._async_reabonner())
        assert pose == [timedelta(hours=1)] and v._horaire is not None, "allumees par defaut"
        v2 = creer({"sauvegarde": {"actif": False}, "fuite_nuit": {"actif": True}})
        lancer(v2._async_reabonner())
        assert v2._horaire is not None, "la fuite suffit"
        v3 = creer({"sauvegarde": {"actif": False}, "fuite_nuit": {"actif": False}})
        lancer(v3._async_reabonner())
        assert v3._horaire is None, "rien ne le demande"
    finally:
        ev.async_track_time_interval = ancien


def test_les_prefixes_sont_gardes_au_redemarrage(creer):
    v = creer({})
    v._depot = FauxStore({"signales": ["sauvegarde:" + TENTEE, "fuite:" + COMPTEUR, "bat:sensor.pile",
                                       "co2:sensor.air", "inconnu:sensor.x", 42, None]})
    lancer(v._async_lire_etat())
    assert v.signales == {"sauvegarde:" + TENTEE, "fuite:" + COMPTEUR, "bat:sensor.pile", "co2:sensor.air"}


def test_le_prefixe_n_est_pas_vide_au_passage_au_reel_hors_regle_commune(creer):
    """`_repartir_de_zero` vide `sauvegarde:` et `fuite:` comme les autres : une alerte
    simulee n'est jamais partie, revenu au reel on doit pouvoir la dire pour de vrai."""
    v = creer({})
    v.signales = {"sauvegarde:" + TENTEE, "fuite:" + COMPTEUR, "entretien:sensor.poele"}
    v._repartir_de_zero()
    assert v.signales == {"entretien:sensor.poele"}


def test_les_signales_sont_lus_par_l_ecran_sans_changer_d_etat(creer):
    v = creer({})
    v.signales = {"sauvegarde:" + TENTEE, "fuite:" + COMPTEUR}
    etat = lancer(v.async_etat())
    assert etat["signales"] == sorted(v.signales)
