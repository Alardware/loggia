"""Audit du 12/11, lot 3 (robustesse) : S4, S5, S6, S7c, S7d.

Chaque test montre qu'un defaut prouve par la relecture a disparu :

  * S4  - un test de sirene dont la sauvegarde echoue garde son arret programme ;
  * S5  - une ecriture du serveur sur une cle que les ecrans reecrivent eux-memes
          les previent (`signaler_communes`), et la fiche refusee d'un plan rend un
          refus nomme sans laisser de `.glb` orphelin ;
  * S6  - un planning de robot ne part pas deux fois la nuit du retour a l'heure
          d'hiver (la garde du distributeur) ;
  * S7c - un minuteur ou un rappel affiche est arme, meme si la sauvegarde echoue ;
  * S7d - les deux plafonds des rappels sont deux refus nommes, traduits a l'ecran.
"""
from __future__ import annotations

import asyncio
import datetime as dt
import json
import sys
import time

import pytest

from conftest import FauxStore, charger
import test_lumieres as tl
import test_minuteurs as tm
import test_rappels as trp
import test_robots as trb
import test_sirene as ts
from test_chauffage import FuseauParis
# Les bancs des lumieres et du plan, tels que leurs propres tests les montent.
from test_lumieres import horloge  # noqa: F401
from test_plan import Requete, glb, plan, vue  # noqa: F401

creer_lumieres = tl.creer

PARIS = FuseauParis()


def lancer(coro):
    return asyncio.run(coro)


def _refus(code="payload_too_large", motif="stockage commun trop volumineux (1100000 > 1048576 octets)"):
    return charger("refus").RefusNomme(code, motif)


async def _sauvegarde_refusee(*_a, **_k):
    raise _refus()


def _magasin(store_module, partage):
    magasin = store_module.LoggiaStore.__new__(store_module.LoggiaStore)
    magasin._store = FauxStore({"users": {}, "shared": dict(partage), "migrated": True})
    magasin._ancien = FauxStore(None)
    magasin._data = None
    magasin._lock = asyncio.Lock()
    return magasin


# ── S4 : le test de sirene ──────────────────────────────────────────────────

@pytest.fixture
def sirene(store_module, monkeypatch):
    module = charger("sirene")
    rdv = ts.Rendezvous()
    monkeypatch.setattr(sys.modules["homeassistant.helpers.event"], "async_call_later", rdv, raising=False)
    m = module.LoggiaSirene.__new__(module.LoggiaSirene)
    m.hass = ts.FauxHass({"switch.s": "off"})
    m.store = _magasin(store_module, {"loggia_sirene_test": {}})
    m.regles = charger("regles").Regles(m.hass, m.store)
    m.regles._depot = FauxStore(None)
    m.table = {}
    m._rdv = {}
    yield m, rdv
    m.hass.abandonner()


def test_s4_une_sauvegarde_ratee_a_l_allumage_laisse_l_arret_programme(sirene):
    """Avant : `_sauver` levait entre `turn_on` et `_armer` - la sirene sonnait
    sans arret programme, et l'ecran recevait l'erreur. Maintenant : l'arret est
    arme, la sauvegarde ratee se journalise, et l'echeance eteint bien."""
    m, rdv = sirene
    m.store.async_set_shared = _sauvegarde_refusee
    lancer(m.async_tester("switch.s", par="u1"))  # ne leve plus
    assert [a[1] for a in m.hass.services.appels] == ["turn_on"]
    armes = ts.rdv_du_module(rdv)
    assert len(armes) == 1 and 0 < armes[0][0] <= charger("sirene").DUREE
    assert "switch.s" in m._rdv
    assert [q for q, _mo, _c in ts.journal(m)] == ["sonner"], "le test se note, sauvegarde ou non"
    # L'echeance : la sirene s'eteint.
    m.hass.states.table["switch.s"] = ts.FauxEtat("on")
    (_d, rappel), = armes
    rappel(None)
    lancer(m.hass.taches.pop())
    assert [a[1] for a in m.hass.services.appels] == ["turn_on", "turn_off"]


# ── S5 : les ecritures du serveur previennent les ecrans ───────────────────

def _renommer_exterieur(b, neuf="switch.lumiere_dehors"):
    entree = b.registre.entities.pop(tl.EXTERIEUR)
    entree.entity_id = neuf
    b.registre.entities[neuf] = entree
    b.hass.states.table[neuf] = b.hass.states.table.pop(tl.EXTERIEUR)
    b.hass.bus.tirer("entity_registry_updated", {"action": "update", "entity_id": neuf, "old_entity_id": tl.EXTERIEUR})
    return neuf


def _espionner_signaux(store):
    signaux = []
    vrai = store._signaler

    def espion(user_id, perso=(), communes=()):
        signaux.append(list(communes))
        return vrai(user_id, perso, communes)

    store._signaler = espion
    return signaux


def test_s5_un_interrupteur_renomme_previent_les_ecrans(creer_lumieres):
    """Avant : `loggia_switchlights` reecrite sans signal - un ecran au cache
    perime redeclarait l'ancien nom a sa prochaine ecriture."""
    b = creer_lumieres()
    signaux = _espionner_signaux(b.l.store)
    neuf = _renommer_exterieur(b)
    assert lancer(b.l.store.async_get_shared("loggia_switchlights")) == [neuf]
    assert signaux == [["loggia_switchlights"]]


def test_s5_sous_le_repli_herite_c_est_loggia_entities_qui_se_signale(creer_lumieres):
    b = creer_lumieres(partage={"loggia_switchlights": None, "loggia_entities": {"switchLights": [tl.EXTERIEUR], "rooms": 1}})
    signaux = _espionner_signaux(b.l.store)
    neuf = _renommer_exterieur(b)
    assert lancer(b.l.store.async_get_shared("loggia_entities")) == {"switchLights": [neuf], "rooms": 1}
    assert signaux == [["loggia_entities"]]


def test_s5_un_renommage_refuse_ne_signale_rien(creer_lumieres):
    b = creer_lumieres()
    signaux = _espionner_signaux(b.l.store)

    async def refuser(cle, f):
        raise _refus()

    b.l.store.async_modifier_shared = refuser
    _renommer_exterieur(b)
    assert signaux == []


def _signaux_du_plan(vue):
    signaux = []
    vue.magasin.signaler_communes = lambda cles: signaux.append(list(cles))
    return signaux


def test_s5_deposer_et_retirer_un_plan_previennent_les_ecrans(vue):
    """Avant : un ecran au cache perime reecrivait `loggia_plan3d` ENTIERE (une
    liaison) et effacait la fiche du plan qu'un autre venait de deposer."""
    signaux = _signaux_du_plan(vue)
    assert lancer(vue.post(Requete(corps=glb(b"plan"), query={"nom": "m.glb"}), "rdc")).status == 200
    assert signaux == [["loggia_plan3d"]]
    assert lancer(vue.delete(Requete(), "rdc")).status == 200
    assert signaux == [["loggia_plan3d"], ["loggia_plan3d"]]


def test_s5_une_fiche_refusee_rend_un_refus_nomme_sans_plan_orphelin(vue, tmp_path):
    """Avant : le refus du magasin sortait de `post` en exception, et `rdc.glb`
    restait sur le disque, servi par GET sans fiche."""
    signaux = _signaux_du_plan(vue)

    async def refuser(cle, f):
        raise _refus()

    vue.magasin.async_modifier_shared = refuser
    r = lancer(vue.post(Requete(corps=glb(b"plan"), query={"nom": "m.glb"}), "rdc"))
    assert r.status == 413 and json.loads(r.body) == {"code": "payload_too_large"}
    assert not (tmp_path / "rdc.glb").exists(), "le plan cree par ce depot ne reste pas sans fiche"
    assert lancer(vue.get(Requete(admin=False), "rdc")).status == 404
    assert signaux == []


def test_s5_un_remplacement_refuse_garde_la_fiche_d_avant(vue, plan, tmp_path):
    """Un depot qui REMPLACAIT un plan : le fichier a deja ete remplace d'un seul
    tenant, l'ancien ne peut pas revenir ; il n'est pas retire (la fiche d'avant
    le nomme encore), et le refus se dit."""
    premier = glb(b"premier")
    assert lancer(vue.post(Requete(corps=premier, query={"nom": "a.glb"}), "rdc")).status == 200
    avant = json.loads(json.dumps(vue.magasin.valeur))

    async def refuser(cle, f):
        raise _refus()

    vue.magasin.async_modifier_shared = refuser
    r = lancer(vue.post(Requete(corps=glb(b"second"), query={"nom": "b.glb"}), "rdc"))
    assert r.status == 413 and json.loads(r.body)["code"] == "payload_too_large"
    assert vue.magasin.valeur == avant
    assert (tmp_path / "rdc.glb").exists()


def test_s5_un_retrait_refuse_se_nomme(vue):
    assert lancer(vue.post(Requete(corps=glb(b"plan")), "rdc")).status == 200

    async def refuser(cle, f):
        raise _refus("trop_de_cles", "trop de cles communes")

    vue.magasin.async_modifier_shared = refuser
    r = lancer(vue.delete(Requete(), "rdc"))
    assert r.status == 400 and json.loads(r.body) == {"code": "trop_de_cles"}


# ── S6 : un robot ne part pas deux fois a l'heure d'hiver ───────────────────

# Le dimanche 25/10/2026 : 02:00-02:59 se joue deux fois (CEST, puis CET).
ETE = dt.datetime(2026, 10, 25, 2, 30, tzinfo=PARIS, fold=0)
HIVER = dt.datetime(2026, 10, 25, 2, 30, tzinfo=PARIS, fold=1)


@pytest.fixture
def robots(store_module):
    module = charger("robots")
    regles_module = charger("regles")
    faits = []

    def fabrique(plannings):
        r = module.LoggiaRobots.__new__(module.LoggiaRobots)
        r.hass = trb.FauxHass({"vacuum.robot": trb.FauxEtat("docked")})
        r.store = _magasin(store_module, {"loggia_robots": {"plannings": plannings}})
        r._defait = []
        r.regles = regles_module.Regles(r.hass, r.store)
        r.regles._depot = FauxStore(None)
        r.cfg = lancer(r.async_config())
        faux = trb.FauxRegistre([])
        r._registre = lambda: faux
        r._poser_carnet()
        r._depot = FauxStore(None)
        r._maintenant = lambda: trb.T0
        faits.append(r)
        return r

    yield fabrique
    for r in faits:
        r.hass.abandonner()


def test_s6_la_meme_instance_ne_relance_pas_le_robot_a_02_30_cet(robots):
    """Avant : le passage de 02:30 partait a 02:30 CEST puis a 02:30 CET - un
    robot revenu a sa base en moins d'une heure repartait."""
    r = robots([trb.planning(heure="02:30", jours=[6])])
    assert lancer(r.async_minute(ETE)) == ["p1"]
    # Une heure plus tard, en temps reel : le robot est rentre, plus rien n'est « recent » ni « en vol ».
    r._maintenant = lambda: trb.T0 + 3600
    assert lancer(r.async_minute(HIVER)) == []
    assert [a[:2] for a in r.hass.services.appels] == [("vacuum", "start")]


def test_s6_apres_un_redemarrage_le_journal_retient_la_seconde_occurrence(robots):
    """`_tentes` ne vit qu'en memoire : apres un redemarrage entre les deux
    02:30, c'est la ligne du journal (premiere occurrence) qui retient."""
    avant = robots([trb.planning(heure="02:30", jours=[6])])
    assert lancer(avant.async_minute(ETE)) == ["p1"]
    lignes = lancer(avant.regles.journal(module="robots"))
    for e in lignes:  # l'horloge de ce moment-la, pas celle du test
        e["ts"] = ETE.timestamp() + 1
    apres = robots([trb.planning(heure="02:30", jours=[6])])
    apres.regles._charge = True
    apres.regles._entrees = lignes
    apres._maintenant = lambda: trb.T0 + 3600
    assert lancer(apres.async_minute(HIVER)) == []
    assert apres.hass.services.appels == []


def test_s6_un_planning_jamais_tente_part_a_la_seconde_occurrence(robots):
    """Sans ligne a la premiere occurrence (le planning ajoute entre-temps), le
    passage de 02:30 CET part : il n'a pas eu lieu."""
    r = robots([trb.planning(heure="02:30", jours=[6])])
    assert lancer(r.async_minute(HIVER)) == ["p1"]


def test_s6_un_jour_ordinaire_rien_ne_change(robots):
    r = robots([trb.planning(heure="02:30", jours=[0])])
    assert lancer(r.async_minute(dt.datetime(2026, 10, 26, 2, 30, tzinfo=PARIS))) == ["p1"]


# ── S7c : ce qui s'affiche est arme ─────────────────────────────────────────

@pytest.fixture
def minuteurs(store_module, monkeypatch):
    ev = sys.modules["homeassistant.helpers.event"]
    rdv, ecoutes = tm.Rendezvous(), []

    def ecouter(hass, ids, rappel):
        ecoutes.append(list(ids))
        return lambda: None

    monkeypatch.setattr(ev, "async_call_later", rdv, raising=False)
    monkeypatch.setattr(ev, "async_track_state_change_event", ecouter, raising=False)
    module = charger("minuteurs")
    m = module.LoggiaMinuteurs.__new__(module.LoggiaMinuteurs)
    m.hass = tm.FauxHass({"light.salon": "on"})
    m.store = _magasin(store_module, {"loggia_minuteurs": {}})
    m.regles = charger("regles").Regles(m.hass, m.store)
    m.regles._depot = FauxStore(None)
    m.table = {}
    m._rdv = {}
    m._ecoute = None
    yield m, rdv, ecoutes
    m.hass.abandonner()


def test_s7c_un_minuteur_pose_sans_sauvegarde_est_arme_et_ecoute(minuteurs):
    """Avant : la table etait changee, la sauvegarde levait, et ni le rendez-vous
    ni l'ecoute n'etaient poses - un decompte affiche que rien n'executait."""
    m, rdv, ecoutes = minuteurs
    m.store.async_set_shared = _sauvegarde_refusee
    with pytest.raises(ValueError):
        lancer(m.async_poser("light.salon", 30, par="u1"))
    assert "light.salon" in m.table and "light.salon" in m._rdv
    (delai, _r), = rdv.poses.values()
    assert 1790 < delai <= 1800
    assert ecoutes and ecoutes[-1] == ["light.salon"]


def test_s7c_une_prolongation_sans_sauvegarde_eteint_a_l_heure_affichee(minuteurs):
    """Avant : 40 min affichees, l'extinction restee armee a 10 min."""
    m, rdv, _ecoutes = minuteurs
    lancer(m.async_poser("light.salon", 10, par="u1"))
    m.store.async_set_shared = _sauvegarde_refusee
    with pytest.raises(ValueError):
        lancer(m.async_poser("light.salon", 30, par="u1"))
    affiche = m.table["light.salon"]["fin"] - time.time()
    (delai, _r), = rdv.poses.values()
    assert 2390 < affiche <= 2400
    assert abs(delai - affiche) < 5, "le rendez-vous arme est celui de l'heure affichee"


@pytest.fixture
def rappels(store_module, monkeypatch):
    rdv = trp.Rendezvous()
    monkeypatch.setattr(sys.modules["homeassistant.helpers.event"], "async_call_later", rdv, raising=False)
    module = charger("rappels")
    m = module.LoggiaRappels.__new__(module.LoggiaRappels)
    m.hass = trp.FauxHass(trp.LV)
    m.store = _magasin(store_module, {"loggia_rappels": {}})
    m.regles = trp.FauxRegles(("mobile_app_x",))
    m.table = {}
    m._rdv = {}
    m._au_demarrage = None
    yield m, rdv
    m.hass.abandonner()


def test_s7c_un_rappel_pose_sans_sauvegarde_est_arme(rappels):
    """Avant : l'ancien rendez-vous desarme, la sauvegarde levait avant d'armer
    le nouveau - le rappel affiche ne partait jamais."""
    m, rdv = rappels
    lancer(m.async_poser(time.time() + 3600, "hc", "switch.lv", par="u1"))
    m.store.async_set_shared = _sauvegarde_refusee
    with pytest.raises(ValueError):
        lancer(m.async_poser(time.time() + 7200, "hc", "switch.lv", par="u1"))
    (rid,) = m.table
    assert list(m._rdv) == [rid]
    (delai, _r), = rdv.poses.values()
    assert 7190 < delai <= 7200


# ── S7d : les deux plafonds des rappels ─────────────────────────────────────

T = 1_000_000.0


def _remplir(module, comptes, par_compte):
    table = {}
    for c in range(comptes):
        for i in range(par_compte):
            table = module.poser(table, T + 3600, "hc", "switch.p%d" % i, "u%d" % c, T, "r%d_%d" % (c, i))
    return table


def test_s7d_le_plafond_du_compte_est_un_refus_nomme():
    module = charger("rappels")
    table = _remplir(module, 1, module.MAX_PAR_COMPTE)
    with pytest.raises(charger("refus").RefusNomme) as err:
        module.poser(table, T + 3600, "hc", "switch.autre", "u0", T, "x")
    assert err.value.code == "trop_de_rappels"
    assert str(err.value).endswith(": %d" % module.MAX_PAR_COMPTE), "la limite suit les deux-points (refus.py)"
    assert isinstance(err.value, ValueError), "les commandes l'attrapent toujours"


def test_s7d_la_maison_pleine_ne_se_dit_plus_comme_le_compte():
    """Avant : « 10 rappels au plus » a un compte qui n'en avait AUCUN."""
    module = charger("rappels")
    comptes = module.MAX_RAPPELS // module.MAX_PAR_COMPTE
    table = _remplir(module, comptes, module.MAX_PAR_COMPTE)
    assert len(table) == module.MAX_RAPPELS
    with pytest.raises(charger("refus").RefusNomme) as err:
        module.poser(table, T + 3600, "hc", None, "u_nouveau", T, "x")
    assert err.value.code == "trop_de_rappels_maison"
    assert str(err.value).endswith(": %d" % module.MAX_RAPPELS)
    # Remplacer le rappel d'un meme appareil passe toujours, maison pleine.
    assert len(module.poser(table, T + 7200, "hc", "switch.p3", "u0", T, "y")) == module.MAX_RAPPELS
