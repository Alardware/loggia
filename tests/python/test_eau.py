"""Le carnet de l'eau, en temps reel (chantier IoT, etape 3 ; I28, I29, ADR 0217).

TEST AJOUTE (etape 3 IoT, 25/10). `eau.py` ecoute la maison et note ; il ne
commande RIEN (un test de source le tient). Ce qui est garanti :
  - une vanne d'eau qui se ferme note SA cause : la fuite que la regle a
    annoncee, une personne (le compte du contexte), une automatisation (le nom
    que son contexte porte), l'appareil ; une rouverture efface la cause ;
  - une annonce ne vaut que pour une fermeture, et une fois ;
  - un detecteur de fuite mouille puis sec se note ; un `moisture` de modele
    n'est pas suivi ;
  - le carnet se relit du disque au demarrage, et s'ecrit ;
  - `loggia/eau/etat` : sous les droits de lecture du compte ;
  - « Fermer en cas de fuite » (I29) : une ecriture ETROITE - seule
    `actions.vanne.actif` change, sous le verrou du magasin, la cle signalee aux
    ecrans ; un format refuse n'ecrit rien.
"""
from __future__ import annotations

import asyncio
import re
import sys
import types
from datetime import datetime

import pytest

from conftest import COMPOSANT, FauxStore, charger

eau = charger("eau")
calc = charger("eau_calcul")


def lancer(coro):
    return asyncio.run(coro)


class Ctx:
    def __init__(self, user_id=None, ident="c0", parent_id=None):
        self.user_id, self.id, self.parent_id = user_id, ident, parent_id


class Etat:
    def __init__(self, entity_id, state, attributes=None, ctx=None):
        self.entity_id, self.state, self.attributes = entity_id, state, attributes or {}
        self.context = ctx or Ctx()
        self.last_changed = None


class Etats:
    def __init__(self):
        self.table = {}

    def get(self, h):
        return self.table.get(h)

    def async_all(self, domaine=None):
        return [e for h, e in self.table.items() if domaine is None or h.startswith(domaine + ".")]


class Bus:
    def __init__(self):
        self.ecoutes = {}

    def async_listen(self, nom, f):
        self.ecoutes.setdefault(nom, []).append(f)
        return lambda: self.ecoutes[nom].remove(f)

    def async_listen_once(self, nom, f):
        return self.async_listen(nom, f)


class Hass:
    def __init__(self):
        self.states = Etats()
        self.bus = Bus()
        self.data = {}
        self.taches = []
        self.services = types.SimpleNamespace(appels=[])

    def async_create_task(self, coro):
        self.taches.append(coro)
        return coro

    async def vider(self):
        while self.taches:
            t = self.taches.pop(0)
            await t


class Ev:
    def __init__(self, new, event_type="state_changed", context=None, data=None):
        self.data = data if data is not None else {"entity_id": new.entity_id, "new_state": new}
        self.event_type = event_type
        self.context = context


VANNE = "valve.arrivee_eau"
EVIER = "binary_sensor.fuite_sous_evier"
PLANTE = "binary_sensor.ficus_soif"
T0 = datetime(2026, 10, 19, 14, 0).timestamp()


@pytest.fixture
def banc(creer_store, monkeypatch):
    """Une maison : une vanne d'eau ouverte, un detecteur sec, le besoin d'eau d'une plante en modele."""
    registre = types.SimpleNamespace(async_get=lambda h: types.SimpleNamespace(platform="template") if h == PLANTE else
                                     types.SimpleNamespace(platform="mqtt"))
    monkeypatch.setattr(sys.modules["homeassistant.helpers.entity_registry"], "async_get", lambda _h: registre, raising=False)
    hass = Hass()
    hass.states.table = {VANNE: Etat(VANNE, "open", {"device_class": "water", "friendly_name": "Arrivée d'eau"}),
                         EVIER: Etat(EVIER, "off", {"device_class": "moisture", "friendly_name": "Sous l'évier"}),
                         PLANTE: Etat(PLANTE, "off", {"device_class": "moisture"})}
    magasin = creer_store({"users": {}, "migrated": True,
                           "shared": {"loggia_alertes": {"service": "mobile_app_tel", "actions": {"actif": True, "lumieres": False, "vanne": {"actif": True, "entite": ""}}}}})
    signaux = []
    magasin.signaler_communes = lambda cles: signaux.append(list(cles))
    # Une horloge FIXE (passe bis, point 19) : `time.time()` vers minuit faisait tomber le journal d'hier, et deux assertions
    # devenaient vides. Lundi 19/10/2026, 14:00 ; « maintenant » pour le carnet comme pour `dt_util.now()`.
    temps = {"t": T0}
    monkeypatch.setattr(sys.modules["homeassistant.util.dt"], "now", lambda *a: datetime.fromtimestamp(temps["t"]), raising=False)
    e = eau.LoggiaEau(hass, magasin)
    e._depot = FauxStore(None)
    e._maintenant = lambda: temps["t"]
    lancer(hass.vider())
    yield types.SimpleNamespace(hass=hass, eau=e, store=magasin, signaux=signaux, temps=temps)
    # Une ecriture laissee en attente (une fermeture sur fuite s'ecrit tout de suite, passe bis) ne pend pas apres le test.
    for tache in hass.taches:
        tache.close()


def changer(b, haid, state, ctx=None, avance=1.0):
    b.temps["t"] += avance
    ancien = b.hass.states.table[haid]
    nouveau = Etat(haid, state, ancien.attributes, ctx)
    b.hass.states.table[haid] = nouveau
    for f in list(b.hass.bus.ecoutes.get("state_changed", [])):
        f(Ev(nouveau))


def test_il_ecoute_la_maison_et_les_automatismes(banc):
    assert set(banc.hass.bus.ecoutes) >= {"state_changed", "automation_triggered", "script_started", "homeassistant_stop"}
    # Au demarrage, l'etat de chacun est vu, sans ligne : on ne l'a pas vu arriver.
    assert banc.eau.carnet["vannes"][VANNE]["vu"] == "ouverte" and banc.eau.carnet["journal"] == []
    assert EVIER in banc.eau.carnet["detecteurs"] and PLANTE not in banc.eau.carnet["detecteurs"], "le modele d'une plante n'est pas un detecteur"


def test_la_fuite_annoncee_ferme_et_se_retient(banc):
    changer(banc, EVIER, "on")
    t_fuite = banc.temps["t"]
    banc.eau.annoncer_fermeture([VANNE], EVIER, "Sous l'évier")
    changer(banc, VANNE, "closing", avance=3)
    changer(banc, VANNE, "closed", avance=8)
    fiche = banc.eau.carnet["vannes"][VANNE]
    assert fiche["vu"] == "fermee" and fiche["cause"] == {"cause": "fuite", "detecteur": EVIER, "nom": "Sous l'évier", "user_id": None}
    assert [(l["quoi"], l["entity_id"]) for l in banc.eau.carnet["journal"]] == [("fuite", EVIER), ("fermee", VANNE)]
    assert banc.eau.carnet["detecteurs"][EVIER]["mouille_depuis"] == t_fuite
    # Le detecteur seche : la vanne reste fermee, et le dit.
    changer(banc, EVIER, "off", avance=2400)
    assert banc.eau.carnet["vannes"][VANNE]["cause"]["cause"] == "fuite"
    assert banc.eau.carnet["journal"][-1]["quoi"] == "sec"


def test_une_annonce_ne_vaut_que_pour_une_fermeture_et_une_fois(banc):
    banc.eau.annoncer_fermeture([VANNE], EVIER, "Sous l'évier")
    # Une main rouvre dans la minute : la rouverture est la sienne, pas la fuite.
    changer(banc, VANNE, "closed")
    changer(banc, VANNE, "open", ctx=Ctx(user_id="u-camille"))
    assert banc.eau.carnet["journal"][-1]["quoi"] == "rouverte" and banc.eau.carnet["journal"][-1]["cause"] == "personne"
    # L'annonce a servi : une seconde fermeture sans elle est celle de l'appareil.
    changer(banc, VANNE, "closed")
    assert banc.eau.carnet["vannes"][VANNE]["cause"]["cause"] == "appareil"


def test_une_personne_une_automatisation_l_appareil(banc):
    changer(banc, VANNE, "closed", ctx=Ctx(user_id="u-camille", ident="c1"))
    assert banc.eau.carnet["vannes"][VANNE]["cause"] == {"cause": "personne", "detecteur": None, "nom": None, "user_id": "u-camille"}
    changer(banc, VANNE, "open", ctx=Ctx(user_id="u-camille", ident="c2"))
    assert banc.eau.carnet["vannes"][VANNE]["cause"] is None
    # Une automatisation ouvre un contexte, qui porte son nom.
    for f in banc.hass.bus.ecoutes["automation_triggered"]:
        f(Ev(None, "automation_triggered", context=Ctx(ident="c3"), data={"name": "Coupure des vacances"}))
    changer(banc, VANNE, "closed", ctx=Ctx(ident="c3"))
    assert banc.eau.carnet["vannes"][VANNE]["cause"] == {"cause": "automatisme", "detecteur": None, "nom": "Coupure des vacances", "user_id": None}
    changer(banc, VANNE, "open", ctx=Ctx(ident="c4"))
    changer(banc, VANNE, "closed", ctx=Ctx(ident="c5"))
    assert banc.eau.carnet["vannes"][VANNE]["cause"]["cause"] == "appareil"


def test_le_carnet_s_ecrit_et_se_relit(banc, creer_store):
    changer(banc, VANNE, "closed", ctx=Ctx(user_id="u-camille"))
    lancer(banc.eau._async_ecrire())
    ecrit = banc.eau._depot.contenu
    assert ecrit["vannes"][VANNE]["cause"]["user_id"] == "u-camille"
    # Une instance neuve relit le fichier : la cause est la, sans ligne de plus.
    hass = Hass()
    hass.states.table = dict(banc.hass.states.table)
    autre = eau.LoggiaEau(hass, banc.store)
    # Le demarrage attend sa tache : le fichier se pose avant qu'elle ne parte.
    autre._depot = FauxStore(ecrit)
    autre._maintenant = lambda: banc.temps["t"]
    lancer(hass.vider())
    assert autre.carnet["vannes"][VANNE]["cause"]["user_id"] == "u-camille"
    assert autre.carnet["journal"] == banc.eau.carnet["journal"], "relu tel quel, sans ligne de plus"


def test_l_etat_sous_les_droits_du_compte(banc):
    changer(banc, EVIER, "on")
    tout = lancer(banc.eau.async_etat(None))
    assert sorted(tout["vannes"]) == [VANNE] and sorted(tout["detecteurs"]) == [EVIER]
    assert tout["regle"] == {"actif": True, "reagit": True, "entite": "", "toutes": True, "vannes": [VANNE]}
    perms = types.SimpleNamespace(check_entity=lambda h, _p: h != EVIER)
    ordinaire = types.SimpleNamespace(is_admin=False, permissions=perms)
    lu = lancer(banc.eau.async_etat(ordinaire))
    assert lu["detecteurs"] == {} and all(l["entity_id"] != EVIER for l in lu["journal"])


def test_fermer_en_cas_de_fuite_une_ecriture_etroite(banc):
    etat = lancer(banc.eau.async_regler(False))
    alertes = lancer(banc.store.async_get_shared("loggia_alertes"))
    assert alertes == {"service": "mobile_app_tel", "actions": {"actif": True, "lumieres": False, "vanne": {"actif": False, "entite": ""}}}, \
        "seule la bascule a change"
    assert banc.signaux == [["loggia_alertes"]], "les ecrans relisent la cle"
    assert etat["regle"]["actif"] is False
    with pytest.raises(ValueError):
        lancer(banc.eau.async_regler("non"))
    assert lancer(banc.store.async_get_shared("loggia_alertes"))["actions"]["vanne"]["actif"] is False


def test_une_prise_designee_est_suivie_comme_la_vanne(banc):
    banc.hass.states.table["switch.prise_arrivee"] = Etat("switch.prise_arrivee", "on", {"friendly_name": "Prise de l'arrivée"})
    lancer(banc.store.async_set_shared("loggia_alertes", {"actions": {"vanne": {"actif": True, "entite": "switch.prise_arrivee"}}}))
    lancer(banc.eau.async_enregistrer({}))
    lancer(banc.hass.vider())
    changer(banc, "switch.prise_arrivee", "off", ctx=Ctx(user_id="u1"))
    assert banc.eau.carnet["vannes"]["switch.prise_arrivee"]["cause"]["cause"] == "personne"
    etat = lancer(banc.eau.async_etat(None))
    assert etat["regle"]["vannes"] == ["switch.prise_arrivee"] and etat["regle"]["toutes"] is False


# ── TESTS AJOUTES (passe bis de l'etape 3, 25/10 ; relectures, points 7, 10, 12, 13, 14, 19) ──
def test_l_horloge_du_banc_est_fixe(banc):
    """Point 19 : le banc ne lit pas l'heure du jour - vers minuit, le journal tombait."""
    changer(banc, EVIER, "on")
    etat = lancer(banc.eau.async_etat(None))
    assert [l["quoi"] for l in etat["journal"]] == ["fuite"], "la ligne du jour est la, a toute heure"


def test_une_fermeture_sur_fuite_s_ecrit_tout_de_suite(banc):
    """Point 7 : une coupure de courant dans les 20 s perdait la cause - la plus importante a garder."""
    banc.eau.annoncer_fermeture([VANNE], EVIER, "Sous l'évier")
    changer(banc, VANNE, "closed")
    assert banc.hass.taches, "l'ecriture part sans attendre son delai"
    lancer(banc.hass.vider())
    assert banc.eau._depot.contenu["vannes"][VANNE]["cause"]["cause"] == "fuite"
    assert banc.eau._ecriture is None, "rien n'attend plus : l'ecriture differee est annulee"


def test_une_annonce_ne_vaut_que_pour_la_fermeture_de_loggia(banc):
    """Point 10 : une fermeture A LA MAIN dans les deux minutes ne se note pas « fuite »."""
    regles = types.SimpleNamespace(est_mien=lambda ident: ident == "ctx-loggia")
    banc.hass.data.setdefault("loggia", {})["regles"] = regles
    banc.eau.annoncer_fermeture([VANNE], EVIER, "Sous l'évier")
    changer(banc, VANNE, "closed", ctx=Ctx(user_id="u-camille", ident="ctx-main"))
    assert banc.eau.carnet["vannes"][VANNE]["cause"]["cause"] == "personne", "la main, pas la fuite"
    changer(banc, VANNE, "open", ctx=Ctx(user_id="u-camille", ident="ctx-main2"))
    changer(banc, VANNE, "closed", ctx=Ctx(ident="ctx-loggia"))
    assert banc.eau.carnet["vannes"][VANNE]["cause"]["cause"] == "appareil", "rouverte : l'annonce est tombee avec elle"


def test_l_annonce_de_la_regle_reste_celle_de_sa_fermeture(banc):
    """Point 10 : la fermeture que la regle commande (son contexte) est bien la fuite."""
    banc.hass.data.setdefault("loggia", {})["regles"] = types.SimpleNamespace(est_mien=lambda ident: ident == "ctx-loggia")
    banc.eau.annoncer_fermeture([VANNE], EVIER, "Sous l'évier")
    changer(banc, VANNE, "closed", ctx=Ctx(ident="ctx-loggia"))
    assert banc.eau.carnet["vannes"][VANNE]["cause"]["cause"] == "fuite"


def test_un_binaire_qui_n_est_pas_de_l_humidite_ne_lit_pas_le_registre(banc, monkeypatch):
    """Point 12 : chaque `state_changed` d'une porte lisait le registre."""
    lus = []
    registre = types.SimpleNamespace(async_get=lambda h: lus.append(h) or types.SimpleNamespace(platform="mqtt"))
    monkeypatch.setattr(sys.modules["homeassistant.helpers.entity_registry"], "async_get", lambda _h: registre, raising=False)
    banc.hass.states.table["binary_sensor.porte"] = Etat("binary_sensor.porte", "off", {"device_class": "door"})
    changer(banc, "binary_sensor.porte", "on")
    assert lus == []
    changer(banc, EVIER, "on")
    assert lus == [EVIER], "un detecteur d'humidite, lui, se verifie"


def test_les_plantes_rechargent_le_carnet():
    """Point 13 : une plante ajoutee (son besoin d'eau n'est pas une fuite) se suit sans redemarrage."""
    rech = charger("rechargement")
    assert rech.modules_a_recharger(["loggia_plants"]) == ["eau"]


def test_une_prise_designee_puis_retiree_n_a_plus_de_fiche(banc):
    """Point 14 : la prise rendue a ses prises ne reste ni dans le carnet ni dans `loggia/eau/etat`."""
    banc.hass.states.table["switch.prise_arrivee"] = Etat("switch.prise_arrivee", "on", {"friendly_name": "Prise de l'arrivée"})
    lancer(banc.store.async_set_shared("loggia_alertes", {"actions": {"vanne": {"actif": True, "entite": "switch.prise_arrivee"}}}))
    lancer(banc.eau.async_enregistrer({}))
    changer(banc, "switch.prise_arrivee", "off", ctx=Ctx(user_id="u1"))
    assert "switch.prise_arrivee" in banc.eau.carnet["vannes"]
    lancer(banc.store.async_set_shared("loggia_alertes", {"actions": {"vanne": {"actif": True, "entite": ""}}}))
    lancer(banc.eau.async_enregistrer({}))
    assert "switch.prise_arrivee" not in banc.eau.carnet["vannes"]
    assert "switch.prise_arrivee" not in lancer(banc.eau.async_etat(None))["vannes"]
    assert VANNE in banc.eau.carnet["vannes"], "la vraie vanne reste suivie"


def test_la_configuration_generale_garde_fermer_en_cas_de_fuite(banc):
    """Point 6 : Parametres ecrit `loggia_alertes` ENTIERE, depuis ce qu'il a lu a l'ouverture ; « Fermer en cas de fuite » change
    entre-temps dans la popup. Le magasin, sous son verrou, garde la valeur du disque - seule `loggia/eau/regle` la change."""
    lancer(banc.eau.async_regler(False))
    perime = {"service": "mobile_app_autre", "actions": {"actif": True, "lumieres": True, "vanne": {"actif": True, "entite": ""}}}
    lancer(banc.store.async_set_user("u-admin", {"loggia_alertes": perime}, is_admin=True))
    alertes = lancer(banc.store.async_get_shared("loggia_alertes"))
    assert alertes["actions"]["vanne"]["actif"] is False, "la bascule de la popup tient"
    assert alertes["service"] == "mobile_app_autre" and alertes["actions"]["lumieres"] is True, "le reste du reglage passe"


def test_le_carnet_ne_commande_rien():
    source = (COMPOSANT / "eau.py").read_text(encoding="utf-8") + (COMPOSANT / "eau_calcul.py").read_text(encoding="utf-8")
    assert not re.search(r"\.async_call\(|\.services\b|\bagir\(", source), "le carnet note ; il ne commande jamais une vanne"
    assert not re.search(r"open_valve|turn_on|close_valve", source)
