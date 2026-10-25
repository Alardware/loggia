"""Les piles du serveur, audit des capteurs du 19/10 (lot 3, M13).

La carte Piles de l'ecran (`pilesDeLaMaison`, piles.js) exige desormais un
APPAREIL PHYSIQUE et ne compte pas une batterie rechargeable ; la veille des
piles du serveur suit la meme regle :
  * un capteur `min_max` « pile la plus basse », sans appareil, ne redit pas
    une pile deja comptee ;
  * la batterie d'un onduleur (`nut`, `apcupsd`), d'une tablette branchee (un
    `plug` sur l'appareil) ou d'une voiture qui mesure sa puissance de charge
    n'est pas une pile a changer ;
  * une pile portee par un appareil de SERVICE non plus.
"""
from __future__ import annotations

import types

from test_veilles import creer, lancer, module, regles_module  # noqa: F401  (fixtures reutilisees)
from test_veilles_capteurs import Entree, FauxEtat, notifications, pile, registre


def test_une_pile_sans_appareil_ni_rechargeable_ne_se_dit_pas(creer, monkeypatch):
    registre(monkeypatch, [
        Entree("sensor.pile_la_plus_basse", platform="min_max"),
        Entree("sensor.ups_battery_charge", platform="nut", device_id="ups"),
        Entree("sensor.tablette_battery", device_id="tab"),
        Entree("binary_sensor.tablette_plugged_in", device_id="tab", original_device_class="plug"),
        Entree("sensor.model_3_battery_level", device_id="car"),
        Entree("sensor.model_3_charger_power", device_id="car", original_device_class="power"),
        Entree("sensor.service_batterie", device_id="svc"),
        Entree("sensor.porte", device_id="d1"),
    ], {"svc": types.SimpleNamespace(entry_type="service"), "d1": types.SimpleNamespace(entry_type=None)})
    etats = {"sensor.pile_la_plus_basse": pile(9), "sensor.ups_battery_charge": pile(9), "sensor.tablette_battery": pile(9),
             "binary_sensor.tablette_plugged_in": FauxEtat("off", {"device_class": "plug"}),
             "sensor.model_3_battery_level": pile(9), "sensor.model_3_charger_power": FauxEtat("0", {"device_class": "power"}),
             "sensor.service_batterie": pile(9), "sensor.porte": pile(9, "Porte")}
    v = creer({"batterie": {"actif": True, "seuil": 15}}, etats)
    lancer(v._async_batteries())
    assert [c["message"] for _, _, c in notifications(v)] == ["Porte : pile a 9 %"]


def test_un_registre_illisible_garde_toutes_les_piles(creer):
    """Le repli ne change pas : sans registre lisible, mieux vaut une pile de
    trop qu'une de moins."""
    v = creer({"batterie": {"actif": True, "seuil": 15}}, {"sensor.pile_la_plus_basse": pile(9, "Pile")})
    lancer(v._async_batteries())
    assert len(notifications(v)) == 1


# ── Le monoxyde de carbone chiffre (decision du 19/10 : « Telephone, sans reaction ») ──

def co(v, unite="ppm", nom="Cuisine CO"):
    return FauxEtat(str(v), {"device_class": "carbon_monoxide", "unit_of_measurement": unite, "friendly_name": nom})


def maison_co(monkeypatch, appareils=None):
    registre(monkeypatch, [Entree("sensor.cuisine_co", device_id="d1"), Entree("sensor.service_co", device_id="svc"),
                           Entree("sensor.modele_co")],
             appareils or {"d1": types.SimpleNamespace(entry_type=None), "svc": types.SimpleNamespace(entry_type="service")})


def test_le_seuil_du_monoxyde_est_celui_de_la_table(module):
    assert module.SEUIL_CO == 35


def test_un_monoxyde_dangereux_previent_une_fois_par_le_canal_critique_sans_reaction(creer, monkeypatch):
    maison_co(monkeypatch)
    v = creer({}, {"sensor.cuisine_co": co(200), "sensor.service_co": co(200), "sensor.modele_co": co(200),
                   "sensor.cuisine_co_mg": co(200, unite="mg/m³")})
    lancer(v._async_co())
    envois = notifications(v)
    assert [c["message"] for _, _, c in envois] == ["Cuisine CO : monoxyde de carbone à 200 ppm, aérez et sortez"]
    assert envois[0][2].get("data"), "le canal critique : il passe les heures calmes"
    assert [a for a in v.hass.services.appels if a[0] != "notify"] == [], "la maison ne reagit pas"
    lancer(v._async_co())
    assert len(notifications(v)) == 1, "une seule fois"
    # Muet : rien ne se rearme ; au calme (sous 31,5 ppm), il redevient signalable.
    v.hass.states.table["sensor.cuisine_co"] = co("unavailable")
    lancer(v._async_co())
    assert v.signales == {"co:sensor.cuisine_co"}
    v.hass.states.table["sensor.cuisine_co"] = co(35)
    lancer(v._async_co())
    assert v.signales == {"co:sensor.cuisine_co"}, "35 ppm : encore au-dessus du retour au calme"
    v.hass.states.table["sensor.cuisine_co"] = co(10)
    lancer(v._async_co())
    assert v.signales == set()
    v.hass.states.table["sensor.cuisine_co"] = co(36)
    lancer(v._async_co())
    assert len(notifications(v)) == 2


def test_35_ppm_pile_n_est_pas_un_danger(creer, monkeypatch):
    maison_co(monkeypatch)
    v = creer({}, {"sensor.cuisine_co": co(35)})
    lancer(v._async_co())
    assert notifications(v) == []


def test_sans_telephone_la_cle_ne_se_pose_pas(creer, monkeypatch):
    maison_co(monkeypatch)
    v = creer({}, {"sensor.cuisine_co": co(200)}, notify=None)
    lancer(v._async_co())
    assert v.signales == set(), "rien n'est parti : on redira"


def test_observer_sans_agir_et_categorie_decochee(creer, monkeypatch):
    maison_co(monkeypatch)
    v = creer({"simulation": {"actif": True}}, {"sensor.cuisine_co": co(200)})
    lancer(v._async_co())
    assert notifications(v) == []
    lignes = lancer(v.regles.journal(module="veilles"))
    assert [(l["regle"], l["simule"]) for l in lignes] == [("co", True)]
    v = creer({}, {"sensor.cuisine_co": co(200)})
    v.store._store.contenu["shared"]["loggia_alertes"] = {"service": "mobile", "categories": {"co": False}}
    v.store._data = None
    lancer(v._async_co())
    assert notifications(v) == []


# ── Contre-relecture du lot 3 ─────────────────────────────────────────────

def test_un_co_deja_dangereux_au_demarrage_se_dit_une_fois(creer, monkeypatch):
    maison_co(monkeypatch)
    v = creer({}, {"sensor.cuisine_co": co(200)})
    lancer(v._async_rattraper())
    assert len(notifications(v)) == 1, "le premier passage du demarrage complet"
    lancer(v._async_horaire())
    assert len(notifications(v)) == 1, "le passage horaire ne le redit pas"


def test_un_envoi_rate_se_retente_au_passage_horaire(creer, monkeypatch):
    maison_co(monkeypatch)
    v = creer({}, {"sensor.cuisine_co": co(200)}, notify=None)
    lancer(v._async_horaire())
    assert v.signales == set()
    v.store._store.contenu["shared"]["loggia_alertes"] = {"service": "mobile"}
    v.store._data = None
    lancer(v._async_horaire())
    assert len(notifications(v)) == 1


def test_revenu_au_reel_un_co_dangereux_se_dit(creer, monkeypatch):
    maison_co(monkeypatch)
    v = creer({"simulation": {"actif": True}}, {"sensor.cuisine_co": co(200)})
    lancer(v._async_co())
    assert notifications(v) == []
    lancer(v.async_enregistrer({"simulation": {"actif": False}}))
    assert len(notifications(v)) == 1


def test_nan_ne_rearme_pas(creer, monkeypatch):
    maison_co(monkeypatch)
    v = creer({}, {"sensor.cuisine_co": co(200)})
    lancer(v._async_co())
    v.hass.states.table["sensor.cuisine_co"] = co("nan")
    lancer(v._async_co())
    assert v.signales == {"co:sensor.cuisine_co"}
    v.hass.states.table["sensor.cuisine_co"] = co(200)
    lancer(v._async_co())
    assert len(notifications(v)) == 1


def test_35_4_ppm_s_ecrit_36(creer, monkeypatch):
    maison_co(monkeypatch)
    v = creer({}, {"sensor.cuisine_co": co(35.4)})
    lancer(v._async_co())
    assert [c["message"] for _, _, c in notifications(v)] == ["Cuisine CO : monoxyde de carbone à 36 ppm, aérez et sortez"]
