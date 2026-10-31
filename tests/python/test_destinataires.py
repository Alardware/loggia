"""Les notifications PAR PERSONNE, sans reglage (chantier G2, S1 ; ADR 0301).

Avant : `regles.prevenir` envoyait tout a UN service `notify.*`, choisi dans
Parametres > Alertes. La surete reveillait un seul telephone, la demande de
l'enfant pouvait partir chez quelqu'un qui n'est pas parent, et la fin du
lave-linge sonnait chez qui etait au bureau.

Desormais chaque `person` est suivie jusqu'a son telephone : `user_id`, ses
`device_trackers`, l'appareil `mobile_app` du registre, puis le service
`notify.mobile_app_<appareil>` — verifie. Aucune liste de marques. Le service
choisi dans Parametres reste le REPLI : rien de decouvert, ou un envoi refuse.
"""
from __future__ import annotations

import ast
import asyncio
import logging
import sys
from types import SimpleNamespace

import pytest

from conftest import COMPOSANT, FauxStore, charger


def lancer(coro):
    return asyncio.run(coro)


# ── Les doublures : etats, services, comptes, registres ─────────────────────

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
    def __init__(self, existants, refuses=()):
        self.existants = set(existants)
        self.refuses = set(refuses)
        self.appels = []

    def has_service(self, domaine, service):
        return domaine == "notify" and service in self.existants

    async def async_call(self, domaine, service, data, blocking=False, context=None, return_response=False):
        if service in self.refuses:
            raise RuntimeError("service refuse")
        self.appels.append((domaine, service, dict(data)))


class Comptes:
    def __init__(self, admins):
        self.admins = set(admins)

    async def async_get_user(self, user_id):
        return SimpleNamespace(id=user_id, is_admin=user_id in self.admins)


class EntreesConfig:
    def __init__(self, entrees):
        self.entrees = {e.entry_id: e for e in entrees}

    def async_get_entry(self, eid):
        return self.entrees.get(eid)

    def async_entries(self, domaine=None):
        return [e for e in self.entrees.values() if domaine is None or e.domain == domaine]


class Hass:
    def __init__(self, etats, services, admins=(), entrees=()):
        self.states = Etats(etats)
        self.services = services
        self.auth = Comptes(admins)
        self.config_entries = EntreesConfig(entrees)
        self.taches = []

    def async_create_task(self, coro):
        self.taches.append(coro)
        return coro


class Registre:
    def __init__(self, fiches):
        self.fiches = {f.entity_id if hasattr(f, "entity_id") else f.id: f for f in fiches}

    def async_get(self, ident):
        return self.fiches.get(ident)


def entite(entity_id, platform, device_id=None, config_entry_id=None):
    return SimpleNamespace(entity_id=entity_id, platform=platform, device_id=device_id,
                           config_entry_id=config_entry_id)


def appareil(ident, name, *, name_by_user=None, identifiers=(), config_entries=()):
    return SimpleNamespace(id=ident, name=name, name_by_user=name_by_user,
                           identifiers=set(identifiers), config_entries=set(config_entries))


def entree_app(entry_id, device_name, user_id=None):
    return SimpleNamespace(entry_id=entry_id, domain="mobile_app",
                           data={"device_name": device_name, "user_id": user_id, "webhook_id": "w" + entry_id})


@pytest.fixture
def module():
    return charger("destinataires")


@pytest.fixture
def regles():
    return charger("regles")


def poser_registres(monkeypatch, entites, appareils):
    monkeypatch.setattr(sys.modules["homeassistant.helpers.entity_registry"], "async_get",
                        lambda _h: Registre(entites))
    monkeypatch.setattr(sys.modules["homeassistant.helpers.device_registry"], "async_get",
                        lambda _h: Registre(appareils))


def maison(monkeypatch, *, paul="home", camille="not_home", refuses=(), en_plus=()):
    """Paul (administrateur, son iPhone), Camille (son Pixel, renomme dans
    Home Assistant), Lino (un enfant, sans application), Marie (un compte, son
    application, mais aucun traceur relie a sa personne)."""
    etats = {
        "person.paul": Etat(paul, {"friendly_name": "Paul", "user_id": "u-g",
                                             "device_trackers": ["device_tracker.iphone_g"]}),
        "person.camille": Etat(camille, {"friendly_name": "Camille", "user_id": "u-c",
                                         "device_trackers": ["device_tracker.pixel", "device_tracker.velo"]}),
        "person.lino": Etat("home", {"friendly_name": "Lino", "user_id": "u-l", "device_trackers": []}),
        "person.marie": Etat("not_home", {"friendly_name": "Marie", "user_id": "u-m"}),
    }
    entites = [
        entite("device_tracker.iphone_g", "mobile_app", "d-g", "e-g"),
        entite("device_tracker.pixel", "mobile_app", "d-c", "e-c"),
        # Un traceur GPS de velo : pas une application, pas un telephone.
        entite("device_tracker.velo", "gpslogger", "d-v", "e-v"),
    ]
    appareils = [
        appareil("d-g", "iPhone de Paul", identifiers={("mobile_app", "abc")}, config_entries={"e-g"}),
        appareil("d-c", "Pixel 7", name_by_user="Téléphone de Camille", identifiers={("mobile_app", "def")},
                 config_entries={"e-c"}),
        appareil("d-v", "Vélo", identifiers={("gpslogger", "x")}, config_entries={"e-v"}),
    ]
    entrees = [entree_app("e-g", "iPhone de Paul", "u-g"), entree_app("e-c", "Pixel 7", "u-c"),
               entree_app("e-m", "Galaxy de Marie", "u-m"),
               SimpleNamespace(entry_id="e-v", domain="gpslogger", data={})]
    services = Services({"mobile_app_iphone_de_paul", "mobile_app_pixel_7", "mobile_app_galaxy_de_marie",
                         "telegram", "repli", *en_plus}, refuses)
    poser_registres(monkeypatch, entites, appareils)
    return Hass(etats, services, admins={"u-g"}, entrees=entrees)


# ── La decouverte ───────────────────────────────────────────────────────────

def test_chaque_personne_est_suivie_jusqu_a_son_telephone(module, monkeypatch):
    hass = maison(monkeypatch)
    gens = {p["person"]: p for p in lancer(module.decouvrir(hass))}
    g = gens["person.paul"]
    assert (g["nom"], g["present"], g["admin"]) == ("Paul", True, True)
    assert g["appareils"] == [{"service": "mobile_app_iphone_de_paul", "nom": "iPhone de Paul"}]
    c = gens["person.camille"]
    assert (c["present"], c["admin"]) == (False, False)
    # Le service suit le nom d'ENREGISTREMENT (celui de l'application) ; l'ecran montre celui que la maison a donne.
    assert c["appareils"] == [{"service": "mobile_app_pixel_7", "nom": "Téléphone de Camille"}], \
        "le traceur du velo n'est pas une application : il ne recoit rien"
    assert gens["person.lino"]["appareils"] == [], "un enfant sans application ne recoit rien"
    # Aucun traceur relie : son compte suffit — l'application est enregistree sous son user_id.
    assert gens["person.marie"]["appareils"] == [{"service": "mobile_app_galaxy_de_marie", "nom": "Galaxy de Marie"}]


def test_un_service_qui_n_existe_pas_n_est_pas_un_destinataire(module, monkeypatch):
    hass = maison(monkeypatch)
    hass.services.existants.discard("mobile_app_pixel_7")
    gens = {p["person"]: p for p in lancer(module.decouvrir(hass))}
    assert gens["person.camille"]["appareils"] == [], "verifie : jamais un service devine"


def test_sans_registre_ni_personne_rien_n_est_decouvert(module):
    hass = Hass({}, Services({"repli"}))
    assert lancer(module.decouvrir(hass)) == []
    # Des registres illisibles (les doublures de conftest) : personne, et rien ne casse.
    hass2 = Hass({"person.x": Etat("home", {"device_trackers": ["device_tracker.t"]})}, Services({"repli"}))
    assert lancer(module.decouvrir(hass2))[0]["appareils"] == []


# ── Qui recoit quoi ─────────────────────────────────────────────────────────

def test_tous_admins_presents(module, monkeypatch):
    gens = lancer(module.personnes(maison(monkeypatch), None))
    # Dans l'ordre des personnes : camille, lino, marie, paul.
    assert module.choisir(gens, "tous") == ["mobile_app_pixel_7", "mobile_app_galaxy_de_marie",
                                            "mobile_app_iphone_de_paul"]
    assert module.choisir(gens, "admins") == ["mobile_app_iphone_de_paul"]
    assert module.choisir(gens, "presents") == ["mobile_app_iphone_de_paul"], "Lino est la, mais sans telephone"


def test_personne_a_la_maison_tout_le_monde(module, monkeypatch):
    gens = lancer(module.personnes(maison(monkeypatch, paul="not_home"), None))
    assert module.choisir(gens, "presents") == module.choisir(gens, "tous")


def test_les_admins_ne_s_elargissent_jamais(module, monkeypatch):
    """La demande de l'enfant ne part JAMAIS chez tout le monde : sans
    administrateur joignable, c'est le repli qui la recoit (regles.py)."""
    hass = maison(monkeypatch)
    hass.auth.admins = set()
    assert module.choisir(lancer(module.personnes(hass, None)), "admins") == []


def test_les_corrections_excluent_par_public_ou_choisissent(module, monkeypatch):
    """Relecture du 30/10, points 1 et 2 : une exclusion vaut pour UN public —
    le mode enfant, ou les notifications ordinaires. La surete ne s'exclut
    jamais."""
    hass = maison(monkeypatch)
    corr = {"person.paul": {"exclus": {"admins": ["mobile_app_iphone_de_paul"], "tous": ["mobile_app_iphone_de_paul"]}},
            "person.camille": {"service": "telegram"},
            "person.inconnu": {"service": "mobile_app_x"}, "pas une personne": {"service": "x"}}
    gens = {p["person"]: p for p in lancer(module.personnes(hass, corr))}
    p = gens["person.paul"]["recoit"]
    assert p["admins"] == [] and p["presents"] == ["mobile_app_iphone_de_paul"]
    assert p["tous"] == ["mobile_app_iphone_de_paul"], "la surete ne s'exclut jamais"
    assert gens["person.camille"]["recoit"]["tous"] == ["telegram"]
    assert gens["person.camille"]["service"] == "telegram"
    assert gens["person.marie"]["recoit"]["presents"] == ["mobile_app_galaxy_de_marie"]


def test_un_service_choisi_disparu_rend_la_main_a_la_decouverte(module, monkeypatch):
    """Relecture du 30/10, point 1 : jamais une personne muette."""
    hass = maison(monkeypatch)
    gens = {p["person"]: p for p in lancer(module.personnes(hass, {"person.paul": {"service": "disparu"}}))}
    assert gens["person.paul"]["recoit"]["tous"] == ["mobile_app_iphone_de_paul"]
    assert gens["person.paul"]["service_absent"] is True


def test_les_corrections_se_nettoient(module):
    assert module.corrections_de(None) == {}
    # La premiere forme, une liste : elle vaut pour les deux publics excluables, jamais pour la surete.
    assert module.corrections_de({"person.a": {"service": 3, "exclus": ["ok", 4, "", "ok"]}, "person.b": "x"}) == {
        "person.a": {"service": "", "exclus": {"admins": ["ok"], "presents": ["ok"]}}}
    assert module.corrections_de({"person.a": {"exclus": {"presents": ["x"], "tous": ["y"]}}}) == {
        "person.a": {"service": "", "exclus": {"admins": [], "presents": ["x"]}}}


# ── prevenir(pour=…) ────────────────────────────────────────────────────────

class Magasin:
    def __init__(self, alertes):
        self.alertes = alertes

    async def async_get_shared(self, cle, defaut=None):
        return self.alertes if cle == "loggia_alertes" else defaut


def socle(regles, hass, alertes=None):
    r = regles.Regles(hass, Magasin(alertes if alertes is not None else {"service": "repli"}))
    r._depot = FauxStore(None)
    from datetime import datetime
    r._maintenant = lambda: datetime(2026, 10, 30, 14, 0)
    return r


def test_la_surete_part_chez_tout_le_monde_et_au_repli(regles, monkeypatch):
    hass = maison(monkeypatch)
    r = socle(regles, hass)
    assert lancer(r.prevenir("alertes", "fumee", "Fumee", critique=True, pour="tous")) is True
    partis = [s for _, s, _ in hass.services.appels]
    assert sorted(partis) == ["mobile_app_galaxy_de_marie", "mobile_app_iphone_de_paul", "mobile_app_pixel_7", "repli"]
    assert all(c["data"]["push"]["sound"]["critical"] == 1 for _, _, c in hass.services.appels)
    # Un tag COMMUN : un telephone servi deux fois (lui-meme, et un groupe de repli) n'en garde qu'une.
    tags = {c["data"]["tag"] for _, _, c in hass.services.appels}
    assert len(tags) == 1 and next(iter(tags)).startswith("loggia-")
    assert lancer(r.journal())[0]["n"] == 4


# ── La surete n'atteint jamais moins de monde qu'avant (relecture du 30/10, point 1) ──

def envoyes(hass):
    return sorted(s for _, s, _ in hass.services.appels)


def test_surete_un_groupe_de_repli_part_toujours(regles, monkeypatch):
    """`notify.famille`, un groupe de trois telephones, dont un seul est relie a sa personne."""
    hass = maison(monkeypatch, en_plus={"famille"})
    hass.services.existants -= {"mobile_app_pixel_7", "mobile_app_galaxy_de_marie"}
    r = socle(regles, hass, {"service": "famille"})
    assert lancer(r.prevenir("alertes", "fumee", "Fumee", critique=True, pour="tous")) is True
    assert envoyes(hass) == ["famille", "mobile_app_iphone_de_paul"]


def test_surete_un_telephone_mort_n_eteint_pas_le_repli(regles, monkeypatch):
    """Un vieux telephone : son service existe, l'envoi ne leve rien, rien n'arrive."""
    hass = maison(monkeypatch, en_plus={"mobile_app_nouveau_telephone"})
    hass.services.existants -= {"mobile_app_pixel_7", "mobile_app_galaxy_de_marie"}
    r = socle(regles, hass, {"service": "mobile_app_nouveau_telephone"})
    lancer(r.prevenir("alertes", "co", "CO", critique=True, pour="tous"))
    assert envoyes(hass) == ["mobile_app_iphone_de_paul", "mobile_app_nouveau_telephone"]


def test_surete_un_repli_telegram_part_toujours(regles, monkeypatch):
    hass = maison(monkeypatch)
    r = socle(regles, hass, {"service": "telegram"})
    lancer(r.prevenir("alertes", "fumee", "Fumee", critique=True, pour="tous"))
    assert "telegram" in envoyes(hass)


def test_surete_une_exclusion_ne_la_coupe_jamais(regles, monkeypatch):
    hass = maison(monkeypatch)
    corr = {"person.paul": {"exclus": {"admins": ["mobile_app_iphone_de_paul"], "presents": ["mobile_app_iphone_de_paul"]}}}
    r = socle(regles, hass, {"service": "repli", "personnes": corr})
    lancer(r.prevenir("alertes", "fumee", "Fumee", critique=True, pour="tous"))
    assert {"mobile_app_iphone_de_paul", "repli"} <= set(envoyes(hass))
    hass.services.appels.clear()
    lancer(r.prevenir("prises", "cycle", "Fini", pour="presents"))
    assert "mobile_app_iphone_de_paul" not in envoyes(hass), "exclu des notifications ordinaires"


def test_surete_un_service_choisi_disparu(regles, monkeypatch):
    hass = maison(monkeypatch)
    r = socle(regles, hass, {"service": "repli", "personnes": {"person.paul": {"service": "disparu"}}})
    lancer(r.prevenir("alertes", "fumee", "Fumee", critique=True, pour="tous"))
    assert {"mobile_app_iphone_de_paul", "repli"} <= set(envoyes(hass))


def test_surete_registre_illisible_ou_personne_sans_compte(regles, monkeypatch):
    hass = Hass({"person.x": Etat("home", {"device_trackers": ["device_tracker.t"]})}, Services({"repli"}))
    lancer(socle(regles, hass).prevenir("alertes", "fumee", "Fumee", critique=True, pour="tous"))
    assert envoyes(hass) == ["repli"]
    # Une personne sans compte, a cote d'une autre trouvee : le repli part quand meme.
    hass2 = maison(monkeypatch)
    hass2.states.table["person.sans_compte"] = Etat("home", {"friendly_name": "Invite"})
    lancer(socle(regles, hass2).prevenir("alertes", "fumee", "Fumee", critique=True, pour="tous"))
    assert "repli" in envoyes(hass2)


def test_surete_le_repli_deja_trouve_ne_part_pas_deux_fois(regles, monkeypatch):
    hass = maison(monkeypatch)
    r = socle(regles, hass, {"service": "mobile_app_iphone_de_paul"})
    lancer(r.prevenir("alertes", "fumee", "Fumee", critique=True, pour="tous"))
    assert envoyes(hass).count("mobile_app_iphone_de_paul") == 1
    assert all("tag" not in c["data"] for _, _, c in hass.services.appels), "pas de doublon : pas de tag"


def test_hors_surete_le_repli_reste_un_repli(regles, monkeypatch):
    hass = maison(monkeypatch)
    r = socle(regles, hass)
    lancer(r.prevenir("prises", "cycle", "Fini", pour="presents"))
    lancer(r.prevenir("enfant", "demande", "Lino", pour="admins"))
    assert "repli" not in envoyes(hass)


def test_une_tablette_sous_le_compte_d_un_parent_s_exclut_du_mode_enfant(regles, monkeypatch):
    """Relecture du 30/10, point 2 : l'application ajoute a la personne le
    traceur de chaque appareil enregistre sous son compte. Une tablette murale
    devient un « telephone » du parent ; on l'exclut du mode enfant, la surete
    la garde."""
    hass = maison(monkeypatch, en_plus={"mobile_app_tablette_salon"})
    hass.states.table["person.paul"].attributes["device_trackers"] = ["device_tracker.iphone_g", "device_tracker.tablette"]
    poser_registres(monkeypatch,
                    [entite("device_tracker.iphone_g", "mobile_app", "d-g", "e-g"),
                     entite("device_tracker.pixel", "mobile_app", "d-c", "e-c"),
                     entite("device_tracker.tablette", "mobile_app", "d-t", "e-t")],
                    [appareil("d-g", "iPhone de Paul", identifiers={("mobile_app", "a")}, config_entries={"e-g"}),
                     appareil("d-c", "Pixel 7", identifiers={("mobile_app", "b")}, config_entries={"e-c"}),
                     appareil("d-t", "Tablette salon", identifiers={("mobile_app", "t")}, config_entries={"e-t"})])
    hass.config_entries.entrees["e-t"] = entree_app("e-t", "Tablette salon", "u-g")
    r = socle(regles, hass)
    lancer(r.prevenir("enfant", "demande", "Lino demande", pour="admins"))
    assert envoyes(hass) == ["mobile_app_iphone_de_paul", "mobile_app_tablette_salon"], "rien n'est devine"
    hass.services.appels.clear()
    corr = {"person.paul": {"exclus": {"admins": ["mobile_app_tablette_salon"]}}}
    r2 = socle(regles, hass, {"service": "repli", "personnes": corr})
    lancer(r2.prevenir("enfant", "demande", "Lino demande", pour="admins"))
    assert envoyes(hass) == ["mobile_app_iphone_de_paul"]
    hass.services.appels.clear()
    lancer(r2.prevenir("alertes", "fumee", "Fumee", critique=True, pour="tous"))
    assert "mobile_app_tablette_salon" in envoyes(hass)


def test_le_mode_enfant_part_chez_les_administrateurs(regles, monkeypatch):
    hass = maison(monkeypatch)
    r = socle(regles, hass)
    lancer(r.prevenir("enfant", "demande", "Lino demande", pour="admins", data={"actions": [{"action": "A"}]}))
    assert [s for _, s, _ in hass.services.appels] == ["mobile_app_iphone_de_paul"]
    assert hass.services.appels[0][2]["data"] == {"actions": [{"action": "A"}]}


def test_la_fin_de_machine_part_chez_qui_est_la(regles, monkeypatch):
    hass = maison(monkeypatch)
    r = socle(regles, hass)
    lancer(r.prevenir("prises", "cycle", "Lave-linge termine", pour="presents"))
    assert [s for _, s, _ in hass.services.appels] == ["mobile_app_iphone_de_paul"]


def test_rien_de_decouvert_le_repli_suffit(regles, caplog):
    """Chez qui n'a pas d'application mobile : exactement comme avant."""
    hass = Hass({}, Services({"repli"}))
    r = socle(regles, hass)
    with caplog.at_level(logging.DEBUG):
        assert lancer(r.prevenir("veilles", "co2", "CO2", pour="presents")) is True
    assert hass.services.appels == [("notify", "repli", {"title": "Loggia", "message": "CO2"})]
    assert any("repli" in m for m in caplog.messages), "le repli se dit au journal, en debug"


def test_les_admins_injoignables_le_repli(regles, monkeypatch):
    hass = maison(monkeypatch)
    hass.auth.admins = set()
    r = socle(regles, hass)
    lancer(r.prevenir("enfant", "demande", "Lino demande", pour="admins"))
    assert [s for _, s, _ in hass.services.appels] == ["repli"]


def test_un_envoi_refuse_passe_par_le_repli(regles, monkeypatch, caplog):
    hass = maison(monkeypatch, refuses={"mobile_app_iphone_de_paul"})
    r = socle(regles, hass)
    with caplog.at_level(logging.DEBUG):
        assert lancer(r.prevenir("prises", "cycle", "Fini", pour="presents")) is True
    assert [s for _, s, _ in hass.services.appels] == ["repli"]
    assert any("repli" in m for m in caplog.messages)


def test_le_repli_ne_part_qu_une_fois(regles, monkeypatch):
    hass = maison(monkeypatch, refuses={"mobile_app_iphone_de_paul", "mobile_app_pixel_7"})
    r = socle(regles, hass)
    lancer(r.prevenir("alertes", "fumee", "Fumee", critique=True, pour="tous"))
    assert sorted(s for _, s, _ in hass.services.appels) == ["mobile_app_galaxy_de_marie", "repli"]


def test_le_son_critique_reste_aux_applications(regles, monkeypatch):
    """Un service choisi a la main pour une personne (Telegram) recoit le
    texte, jamais `push.critical` ni `alarm_stream` : ce sont des cles de
    l'application compagnon. Le repli, lui, garde ce qu'il recevait : il peut
    etre un groupe de telephones."""
    hass = maison(monkeypatch)
    r = socle(regles, hass, {"service": "repli", "personnes": {"person.camille": {"service": "telegram"}}})
    lancer(r.prevenir("alertes", "fumee", "Fumee", critique=True, pour="tous"))
    par = {s: c for _, s, c in hass.services.appels}
    assert "data" not in par["telegram"]
    assert par["mobile_app_iphone_de_paul"]["data"]["channel"] == "alarm_stream"
    hass2 = Hass({}, Services({"repli"}))
    lancer(socle(regles, hass2).prevenir("alertes", "fumee", "Fumee", critique=True))
    assert hass2.services.appels[0][2]["data"]["channel"] == "alarm_stream"


def test_sans_repli_ni_personne_rien_ne_part(regles):
    hass = Hass({}, Services(set()))
    r = socle(regles, hass, {})
    assert lancer(r.prevenir("veilles", "co2", "CO2")) is False
    assert lancer(r.journal())[0]["detail"].startswith("personne a qui parler")


def test_en_simulation_personne_ne_recoit_rien(regles, monkeypatch):
    hass = maison(monkeypatch)
    r = socle(regles, hass)
    assert lancer(r.prevenir("veilles", "co2", "CO2", pour="tous", simuler=True)) is True
    assert hass.services.appels == []
    ligne = lancer(r.journal())[0]
    assert ligne["simule"] is True and ligne["n"] == 4, "trois telephones, et le repli"


def test_un_pour_inconnu_est_une_erreur(regles):
    with pytest.raises(ValueError):
        lancer(socle(regles, Hass({}, Services({"repli"}))).prevenir("v", "r", "x", pour="voisins"))


def test_qui_recevra_quoi_pour_parametres(regles, monkeypatch):
    hass = maison(monkeypatch)
    corr = {"person.paul": {"exclus": {"admins": ["mobile_app_iphone_de_paul"]}}}
    r = socle(regles, hass, {"service": "repli", "personnes": corr})
    d = lancer(r.async_destinataires())
    assert d["repli"] == "repli"
    noms = [p["nom"] for p in d["personnes"]]
    assert noms == ["Camille", "Lino", "Marie", "Paul"]
    g = next(p for p in d["personnes"] if p["nom"] == "Paul")
    assert g["exclus"] == {"admins": ["mobile_app_iphone_de_paul"], "presents": []}
    assert g["recoit"]["admins"] == [] and g["recoit"]["tous"] == ["mobile_app_iphone_de_paul"]
    assert d["routes"]["admins"] == [], "Paul s'est exclu du mode enfant : le repli recevra la demande"
    assert "mobile_app_iphone_de_paul" in d["routes"]["tous"]
    assert lancer(r.a_qui_parler()) is True


def test_a_qui_parler_pour_les_ecrans(regles, monkeypatch):
    """Relecture du 30/10, point 7 : sans repli, un telephone trouve suffit —
    la fiche d'une prise ne dit plus « choisissez le telephone » a tort."""
    hass = maison(monkeypatch)
    assert lancer(socle(regles, hass, {}).a_qui_parler("presents")) is True
    assert lancer(socle(regles, Hass({}, Services(set())), {}).a_qui_parler("presents")) is False


# ── Chaque module dit a qui il parle ────────────────────────────────────────

ATTENDU = {
    # La surete : tout le monde.
    "alertes": {"tous"},
    # La demande de l'enfant, et l'insistance au volume et au rallumage : les parents.
    "enfant": {"admins"},
    # La fin d'un cycle : qui est a la maison.
    "prises": {"presents"},
    # Les veilles ordinaires et la collecte : qui est la ; le monoxyde : tout le monde.
    "veilles": {"presents", "tous"},
}


@pytest.mark.parametrize("nom", sorted(ATTENDU))
def test_chaque_envoi_dit_pour_qui(nom):
    arbre = ast.parse((COMPOSANT / f"{nom}.py").read_text(encoding="utf-8"))
    vus = set()
    for n in ast.walk(arbre):
        if isinstance(n, ast.Call) and getattr(n.func, "attr", None) == "prevenir":
            pour = [k.value.value for k in n.keywords if k.arg == "pour" and isinstance(k.value, ast.Constant)]
            assert pour, f"{nom}.py ligne {n.lineno} : prevenir sans pour="
            vus.update(pour)
    assert vus == ATTENDU[nom], (nom, vus)
