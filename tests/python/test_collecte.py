"""Le rappel de collecte, envoye par le SERVEUR (chantier G2, S2 ; ADR 0301).

La veille au soir, a l'heure reglee (19:00 par defaut), « Demain : Verre,
Recyclables » part aux personnes a la maison, avec un bouton « C'est sorti ».
Ce bouton, et celui du bandeau de l'Accueil, ecrivent au MEME endroit : la
partie commune du magasin (`loggia_collecte`). Tous les ecrans se taisent
ensemble.

Jamais deux fois, meme apres un redemarrage. Saute si le serveur demarre plus
de trois heures apres l'heure (l'idee vient d'Afvalbeheer). Eteint par defaut ;
« Observer sans agir » le simule.
"""
from __future__ import annotations

import asyncio
import re
import sys
from datetime import date, datetime
from types import SimpleNamespace

import pytest

from conftest import RACINE, FauxStore, charger


def lancer(coro):
    return asyncio.run(coro)


@pytest.fixture
def col():
    return charger("collecte")


# ── Le calendrier se reconnait a sa plateforme, puis a son nom ─────────────

def test_des_mots_entiers(col):
    """Relecture du 30/10, point 6 : des mots entiers, plus des morceaux."""
    for nom in ("Familie Müller", "Tonte des bordures", "Collectif parents CM2", "Sortie scolaire", "Abfahrt Zug"):
        assert not col.nom_de_collecte(nom), nom
    assert col.sources([("calendar.familie_muller", "Familie Müller", "google", {}, "off")])["calendriers"] == []
    for nom in ("Abfallkalender", "Restmüll", "Restafval", "Afvalkalender", "Biomüll"):
        assert col.nom_de_collecte(nom), nom


def test_les_composes_du_mull_contre_relecture(col):
    """Contre-relecture du 30/10 : les mots entiers perdaient « Müllabfuhr » et ses voisins."""
    for nom in ("Müllabfuhr", "Müllkalender", "Mülltermine", "Mülltermin", "Müllabholung", "Mülltonne", "Mülltonnen"):
        assert col.nom_de_collecte(nom), nom
    assert col.sources([("calendar.mullabfuhr", None, "local_calendar", {}, "off")])["calendriers"] == ["calendar.mullabfuhr"]
    assert not col.nom_de_collecte("Familie Müller")


def test_la_plateforme_passe_avant_un_calendrier_trouve_par_son_nom(col):
    entrees = [("calendar.dechets", "Déchets", "local_calendar", {}, "off"),
               ("sensor.afval_gft", "GFT", "afvalbeheer", {"Days_until": 3}, "x")]
    assert col.source(col.sources(entrees)) == (None, ["sensor.afval_gft"])
    entrees.append(("calendar.sivom", "SIVOM", "waste_collection_schedule", {}, "off"))
    assert col.source(col.sources(entrees)) == ("calendar.sivom", [])
    assert col.source(col.sources([("calendar.dechets", "Déchets", "x", {}, "off")])) == ("calendar.dechets", [])
    assert col.source(col.sources([])) == (None, [])


def test_les_capteurs_de_demain_seulement(col):
    """Relecture du 30/10, point 3 : lundi soir, le verre passait aujourd'hui
    et le papier demain — le papier n'etait jamais rappele."""
    auj = date(2026, 11, 2)
    lus = [("Verre", col.lire_capteur("2026-11-02", {"Days_until": 0}, auj)),
           ("Papier", col.lire_capteur("2026-11-03", {"Days_until": 1}, auj)), ("Muet", None)]
    assert col.types_des_capteurs(lus, date(2026, 11, 3)) == ["Papier"]


def test_les_mots_des_sept_langues_sans_accents(col):
    for nom in ("Collectes", "Waste collection", "Abfuhr", "Inzameling", "Raccolta", "Recogida", "Odbiór odpadów",
                "Déchets", "Poubelles", "Ordures ménagères", "Restmüll", "Abfalltermine", "Ophaling afval",
                "Rifiuti", "Residuos", "Basura", "Wywóz śmieci", "Ramassage"):
        assert col.nom_de_collecte(nom), nom
    for nom in ("Travail", "Anniversaires", "Vacances scolaires", "Football"):
        assert not col.nom_de_collecte(nom), nom


def test_les_mots_sont_les_memes_que_ceux_de_l_ecran(col):
    """Une seule liste, ecrite deux fois : src/collecte.js et collecte.py."""
    js = (RACINE / "src" / "collecte.js").read_text(encoding="utf-8")
    bloc = re.search(r"const MOTS_COLLECTE = \[([^\]]*)\]", js).group(1)
    assert tuple(re.findall(r"'([^']+)'", bloc)) == col.MOTS
    bloc = re.search(r"const PLATEFORMES_COLLECTE = \[([^\]]*)\]", js).group(1)
    assert tuple(re.findall(r"'([^']+)'", bloc)) == col.PLATEFORMES
    for nom_js, nom_py in (("DEBUTS_COLLECTE", "DEBUTS"), ("FINS_COLLECTE", "FINS")):
        bloc = re.search(r"const %s = \[([^\]]*)\]" % nom_js, js).group(1)
        assert tuple(re.findall(r"'([^']+)'", bloc)) == getattr(col, nom_py), nom_js


def test_la_plateforme_d_abord_puis_le_nom(col):
    entrees = [
        ("calendar.travail", "Travail", "caldav", {}, "off"),
        ("calendar.dechets", "Déchets", "local_calendar", {}, "off"),
        ("calendar.sivom", "SIVOM Vallée", "waste_collection_schedule", {}, "off"),
        ("sensor.afval_gft", "GFT", "afvalbeheer", {"Days_until": 3}, "03-11-2026"),
        # Un poids de dechets n'est pas un calendrier de ramassage.
        ("sensor.dechets_kg", "Déchets triés", "template", {"unit_of_measurement": "kg"}, "12"),
        ("sensor.poubelle_jaune", "Poubelle jaune", "template", {"daysTo": 2}, "2"),
    ]
    s = col.sources(entrees)
    assert s["calendriers"] == ["calendar.sivom", "calendar.dechets"], "SIVOM par sa plateforme, en tete"
    assert s["capteurs"] == ["sensor.afval_gft", "sensor.poubelle_jaune"]


# ── Lire un capteur ─────────────────────────────────────────────────────────

AUJ = date(2026, 10, 30)


def test_lire_les_capteurs_des_integrations(col):
    assert col.lire_capteur("in 1 days", {"daysTo": 1, "types": ["Verre"]}, AUJ) == {
        "jours": 1, "date": date(2026, 10, 31), "types": ["Verre"]}
    assert col.lire_capteur("31-10-2026", {"Days_until": 1}, AUJ)["date"] == date(2026, 10, 31), "Afvalbeheer"
    assert col.lire_capteur("x", {"jours_restants": 0}, AUJ)["jours"] == 0
    assert col.lire_capteur("2026-11-02", {}, AUJ)["jours"] == 3
    assert col.lire_capteur("x", {"date": "2026-11-01", "type": "Jaune, Verre"}, AUJ)["types"] == ["Jaune", "Verre"]
    assert col.lire_capteur("unknown", {}, AUJ) is None
    assert col.lire_capteur("16/10", {}, AUJ) is None


def test_plusieurs_capteurs_une_tournee(col):
    lus = [("GFT", col.lire_capteur("x", {"Days_until": 1}, AUJ)),
           ("Restafval", col.lire_capteur("x", {"Days_until": 4}, AUJ)),
           ("Papier", col.lire_capteur("x", {"Days_until": 1}, AUJ)),
           ("Muet", None)]
    assert col.types_des_capteurs(lus, date(2026, 10, 31)) == ["GFT", "Papier"]
    assert col.types_des_capteurs([("Passe", {"jours": -1, "date": date(2026, 10, 29), "types": []})],
                                  date(2026, 10, 31)) == []


def test_les_evenements_du_lendemain(col):
    ev = [{"summary": "Verre", "start": "2026-10-31", "end": "2026-11-01"},
          {"summary": "Jaune", "start": "2026-10-31T06:00:00+01:00", "end": "2026-10-31T07:00:00+01:00"},
          {"summary": "Ordures", "start": {"date": "2026-11-03"}},
          {"summary": "", "start": "2026-10-31"}, "pas un evenement"]
    assert col.types_du_jour(ev, date(2026, 10, 31)) == ["Verre", "Jaune"]


# ── L'heure, la fenetre de rattrapage, le bouton ───────────────────────────

def test_la_fenetre_de_trois_heures(col):
    assert col.dans_la_fenetre(datetime(2026, 10, 30, 19, 0), "19:00")
    assert col.dans_la_fenetre(datetime(2026, 10, 30, 21, 59), "19:00")
    assert not col.dans_la_fenetre(datetime(2026, 10, 30, 22, 0), "19:00"), "plus de 3 h apres : saute"
    assert not col.dans_la_fenetre(datetime(2026, 10, 30, 18, 59), "19:00")
    assert not col.dans_la_fenetre(datetime(2026, 10, 31, 0, 30), "22:30"), "apres minuit, demain est devenu aujourd'hui"
    assert col.heure_de("7:05") == "07:05" and col.heure_de("25:00") is None and col.heure_de(None) is None


def test_le_bouton_porte_la_date(col):
    a = col.action_sorti("2026-10-31")
    assert col.lire_action(a) == "2026-10-31"
    for autre in (None, 3, "LOGGIA_ENFANT_x_OUI", "LOGGIA_COLLECTE_SORTI_2026-13-45", "LOGGIA_COLLECTE_SORTI_"):
        assert col.lire_action(autre) is None


def test_sorti_et_rappele_se_rangent(col):
    e = col.poser_sorti(None, "2026-10-31", True)
    assert e == {"sorti": "2026-10-31", "rappele": ""}
    assert col.poser_sorti(e, "2026-10-31", False)["sorti"] == ""
    assert col.poser_sorti(e, "2026-11-07", False)["sorti"] == "2026-10-31", "decocher un autre jour ne touche rien"
    assert col.poser_rappel(e, "2026-10-31") == {"sorti": "2026-10-31", "rappele": "2026-10-31"}
    assert col.etat_de({"sorti": "n'importe quoi", "rappele": 3}) == {"sorti": "", "rappele": ""}


# ── La veille, branchee au socle ────────────────────────────────────────────

class Etat:
    def __init__(self, state, attributes=None):
        self.state = state
        self.attributes = attributes or {}


class Etats:
    def __init__(self, table):
        self.table = dict(table)

    def get(self, haid):
        return self.table.get(haid)

    def async_entity_ids(self, domaine):
        return [e for e in self.table if e.startswith(domaine + ".")]


class Services:
    def __init__(self, evenements=None):
        self.appels = []
        self.evenements = evenements or {}

    def has_service(self, domaine, service):
        return domaine == "notify" and service == "mobile"

    async def async_call(self, domaine, service, data, blocking=False, context=None, return_response=False):
        self.appels.append((domaine, service, dict(data)))
        if (domaine, service) == ("calendar", "get_events"):
            assert blocking and return_response
            return {data["entity_id"]: {"events": self.evenements.get(data["entity_id"], [])}}
        return None


class Hass:
    def __init__(self, etats, services):
        self.states = Etats(etats)
        self.services = services
        self.taches = []

    def async_create_task(self, coro):
        self.taches.append(coro)
        return coro

    def abandonner(self):
        for c in self.taches:
            c.close()


def _illisible(_h):
    raise RuntimeError("registre illisible")


@pytest.fixture
def veille(store_module, monkeypatch):
    for nom in ("entity_registry", "device_registry"):
        monkeypatch.setattr(sys.modules["homeassistant.helpers." + nom], "async_get", _illisible)
    vmod, rmod = charger("veilles"), charger("regles")
    faits = []

    def fabrique(collecte=None, evenements=None, etats=None, quand=datetime(2026, 10, 30, 19, 0), simulation=False):
        partage = {"loggia_veilles": {"collecte": {"actif": True, **(collecte or {})},
                                      "simulation": {"actif": simulation}},
                   "loggia_alertes": {"service": "mobile"}}
        magasin = store_module.LoggiaStore.__new__(store_module.LoggiaStore)
        magasin._store = FauxStore({"users": {}, "shared": partage, "migrated": True})
        magasin._ancien = FauxStore(None)
        magasin._data = None
        magasin._lock = asyncio.Lock()
        signaux = []
        magasin.signaler_communes = lambda cles: signaux.append(list(cles))
        etats = etats if etats is not None else {
            "calendar.collectes": Etat("off", {"friendly_name": "Collectes"}),
            "calendar.travail": Etat("off", {"friendly_name": "Travail"}),
        }
        v = vmod.LoggiaVeilles.__new__(vmod.LoggiaVeilles)
        v.hass = Hass(etats, Services(evenements if evenements is not None else {
            "calendar.collectes": [{"summary": "Verre", "start": "2026-10-31", "end": "2026-11-01"},
                                   {"summary": "Recyclables", "start": "2026-10-31", "end": "2026-11-01"}]}))
        v.store = magasin
        v.cfg = lancer(v.async_config())
        v.signales = set()
        v.creuses_en_cours = False
        v._defait = []
        v.regles = rmod.Regles(v.hass, magasin)
        v.regles._depot = FauxStore(None)
        v._depot = FauxStore(None)
        v._maintenant = lambda: quand
        v.regles._maintenant = lambda: quand
        v.signaux = signaux
        faits.append(v)
        return v

    yield fabrique
    for v in faits:
        v.hass.abandonner()


def notifs(v):
    return [c for d, _, c in v.hass.services.appels if d == "notify"]


def test_eteint_par_defaut(store_module):
    v = charger("veilles")
    assert v.DEFAUT["collecte"] == {"actif": False, "heure": "19:00", "source": ""}


def test_la_veille_au_soir_demain_et_son_bouton(veille):
    v = veille()
    assert lancer(v._async_collecte()) is True
    (charge,) = notifs(v)
    assert charge["message"] == "Demain : Verre, Recyclables"
    (bouton,) = charge["data"]["actions"]
    assert bouton == {"action": "LOGGIA_COLLECTE_SORTI_2026-10-31", "title": "C’est sorti"}
    # Le calendrier est lu par `calendar.get_events`, sur la journee de demain seulement.
    (_, _, demande), = [a for a in v.hass.services.appels if a[0] == "calendar"]
    assert demande["entity_id"] == "calendar.collectes"
    assert demande["start_date_time"].startswith("2026-10-31T00:00")
    ligne = lancer(v.regles.journal())[0]
    assert (ligne["module"], ligne["regle"], ligne["quoi"]) == ("veilles", "collecte", "prevenir")


def test_jamais_deux_fois_meme_apres_un_redemarrage(veille):
    v = veille()
    assert lancer(v._async_collecte()) is True
    contenu = v.store._store.contenu
    assert contenu["shared"]["loggia_collecte"]["rappele"] == "2026-10-31", "persiste dans la partie commune"
    assert lancer(v._async_collecte()) is False
    # Une autre instance, comme apres un redemarrage, relit le magasin.
    v2 = veille()
    v2.store._store.contenu = contenu
    v2.store._data = None
    assert lancer(v2._async_collecte(rattrapage=True)) is False
    assert notifs(v2) == []


def test_deja_sorti_rien_ne_part(veille):
    v = veille()
    lancer(v.async_sorti("2026-10-31", True))
    assert lancer(v._async_collecte()) is False
    assert notifs(v) == []


def test_rattrapage_dans_les_trois_heures_seulement(veille):
    assert lancer(veille(quand=datetime(2026, 10, 30, 21, 30))._async_collecte(rattrapage=True)) is True
    v = veille(quand=datetime(2026, 10, 30, 22, 5))
    assert lancer(v._async_collecte(rattrapage=True)) is False
    assert notifs(v) == [], "le serveur demarre plus de 3 h apres l'heure : saute"


def test_rien_demain_rien_ne_part(veille):
    v = veille(evenements={"calendar.collectes": [{"summary": "Verre", "start": "2026-11-03"}]})
    assert lancer(v._async_collecte()) is False
    assert notifs(v) == []


def test_eteint_rien_ne_part(veille):
    v = veille(collecte={"actif": False})
    assert lancer(v._async_collecte()) is False
    assert v.hass.services.appels == []


def test_observer_sans_agir_le_simule(veille):
    v = veille(simulation=True)
    assert lancer(v._async_collecte()) is True
    assert notifs(v) == []
    assert lancer(v.regles.journal())[0]["simule"] is True


def test_par_les_capteurs_sans_calendrier(veille):
    etats = {"sensor.afval_gft": Etat("31-10-2026", {"friendly_name": "GFT", "Days_until": 1}),
             "sensor.afval_papier": Etat("31-10-2026", {"friendly_name": "Papier", "Days_until": 1}),
             "sensor.afval_rest": Etat("03-11-2026", {"friendly_name": "Restafval", "Days_until": 4}),
             "sensor.afval_gft_kg": Etat("4", {"friendly_name": "Afval kg"})}
    v = veille(etats=etats, evenements={})
    assert lancer(v._async_collecte()) is True
    assert notifs(v)[0]["message"] == "Demain : GFT, Papier"


def test_capteurs_verre_aujourd_hui_papier_demain(veille):
    etats = {"sensor.afval_glas": Etat("30-10-2026", {"friendly_name": "Glas", "Days_until": 0}),
             "sensor.afval_papier": Etat("31-10-2026", {"friendly_name": "Papier", "Days_until": 1})}
    v = veille(etats=etats, evenements={})
    assert lancer(v._async_collecte()) is True
    assert notifs(v)[0]["message"] == "Demain : Papier"


def test_observer_puis_agir_le_meme_soir(veille):
    """Relecture du 30/10, point 4 : le rappel simule n'est pas ecrit, et le
    vrai part si l'observation est coupee le meme soir."""
    v = veille(simulation=True)
    assert lancer(v._async_collecte()) is True and notifs(v) == []
    assert "loggia_collecte" not in v.store._store.contenu["shared"]
    assert lancer(v._async_collecte()) is False, "simule deux fois : non plus"
    v.cfg["simulation"]["actif"] = False
    assert lancer(v._async_collecte(rattrapage=True)) is True
    assert len(notifs(v)) == 1


def test_deux_declenchements_ensemble_un_seul_rappel(veille):
    """Relecture du 30/10, point 5 : le rendez-vous de 19 h et le rattrapage du demarrage."""
    v = veille()

    async def deux():
        return await asyncio.gather(v._async_collecte(), v._async_collecte(rattrapage=True))
    assert sorted(lancer(deux())) == [False, True]
    assert len(notifs(v)) == 1


def test_la_source_choisie_corrige_la_decouverte(veille):
    etats = {"calendar.collectes": Etat("off", {"friendly_name": "Collectes"}),
             "calendar.sivom": Etat("off", {"friendly_name": "SIVOM"})}
    v = veille(collecte={"source": "calendar.sivom"}, etats=etats,
               evenements={"calendar.sivom": [{"summary": "Bac vert", "start": "2026-10-31"}]})
    assert lancer(v._async_collecte()) is True
    assert notifs(v)[0]["message"] == "Demain : Bac vert"


def test_le_bouton_du_telephone_fait_taire_tous_les_ecrans(veille):
    v = veille()
    lancer(v._sur_action(SimpleNamespace(data={"action": "LOGGIA_COLLECTE_SORTI_2026-10-31"})))
    assert v.store._store.contenu["shared"]["loggia_collecte"]["sorti"] == "2026-10-31"
    assert ["loggia_collecte"] in v.signaux, "les ecrans relisent la partie commune"
    lancer(v._sur_action(SimpleNamespace(data={"action": "LOGGIA_ENFANT_jeton_OUI"})))
    assert v.store._store.contenu["shared"]["loggia_collecte"]["sorti"] == "2026-10-31"


def test_le_bouton_du_bandeau_ecrit_au_meme_endroit(veille):
    v = veille()
    assert lancer(v.async_sorti("2026-10-31", True)) == {"sorti": "2026-10-31", "rappele": ""}
    assert lancer(v.async_sorti("2026-10-31", False))["sorti"] == ""
    with pytest.raises(ValueError):
        lancer(v.async_sorti("demain", True))


def test_la_configuration_se_nettoie(veille):
    v = veille(collecte={"heure": "99:00", "source": "light.salon"})
    assert v.cfg["collecte"]["heure"] == "19:00"
    assert v.cfg["collecte"]["source"] == ""
    cfg = lancer(v.async_enregistrer({"collecte": {"heure": "18:30", "source": "calendar.sivom"}}))
    assert cfg["collecte"] == {"actif": True, "heure": "18:30", "source": "calendar.sivom"}


def test_l_etat_dit_ce_qui_est_sorti(veille):
    v = veille()
    lancer(v.async_sorti("2026-10-31", True))
    assert lancer(v.async_etat())["collecte"] == {"sorti": "2026-10-31", "rappele": ""}


def test_la_cle_reste_au_serveur():
    """Ni dans un fichier exporte, ni rendue par « revenir a la version d'avant »."""
    versions = charger("versions")
    assert "loggia_collecte" in versions.GARDEES_AU_RETOUR
    js = (RACINE / "src" / "config.js").read_text(encoding="utf-8")
    assert "'loggia_collecte'" in js.split("const CLES_SERVEUR = new Set([", 1)[1].split("]);", 1)[0]
