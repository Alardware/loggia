"""Le mode enfant : le module (chantier Mode enfant, E5 a E14, E22 ; spec 5, 7.2, 7.3, 7.5, 8).

Ce qui merite d'etre verrouille : le profil recense les lecteurs de sa zone
et ses ajouts, avec la jumelle d'une Echo, jamais un service ni une camera ;
un volume au-dessus du plafond REDESCEND au plafond, sur l'entite qui a
publie, jamais plus haut, jamais deux fois en cinq secondes ; le temps
d'ecran compte et l'ecran s'eteint a la fin, puis se reeteint s'il se
rallume, et le telephone n'est prevenu qu'a l'insistance ; l'Echo dit la fin
cinq minutes avant ; au coucher l'Echo se met en pause sauf le titre lance par
Loggia ; la demande part au telephone avec deux boutons et la reponse revient
par le jeton ; tout survit au redemarrage, rien ne se coupe pendant la fenetre
de demarrage ; « Observer sans agir » n'envoie rien ; le module ne connait ni
`turn_on` ni `media_play`.

Le temps est simule : `time.time` et `dt_util.now` suivent une horloge que le
test avance, les rendez-vous (`async_call_later`) et le tic de la minute
(`async_track_time_change`) partent quand il le dit. Jamais un vrai appareil.
"""
from __future__ import annotations

import asyncio
import logging
import re
import sys
import time
import types
from datetime import datetime

import pytest

from conftest import COMPOSANT, FauxStore, charger
from test_chauffage import FuseauParis

PARIS = FuseauParis()
Context = sys.modules["homeassistant.core"].Context
ZONE = "chambre_lino"
OFF, HACS, TV = "media_player.chambre_echo_dot", "media_player.echo_dot_chambre", "media_player.apple_tv_chambre"
PARLER, ANNONCES = "notify.chambre_echo_dot_parler", "switch.chambre_echo_dot_annonces"
SPOTIFY, CAM_HP = "media_player.spotify_demo", "media_player.sonnette_haut_parleur"


def lancer(coro):
    return asyncio.run(coro)


def paris(h, mi=0, s=0, jour=13):
    """Un instant d'octobre 2026 a Paris (le 13 est un mardi), en secondes depuis 1970."""
    return datetime(2026, 10, jour, h, mi, s, tzinfo=PARIS).timestamp()


class FauxEtat:
    def __init__(self, state, attributes=None, context=None):
        self.state = state
        self.attributes = attributes or {}
        self.context = context or Context()


class FauxEtats:
    def __init__(self, table):
        self.table = dict(table)

    def get(self, haid):
        return self.table.get(haid)

    def async_entity_ids(self, domaine):
        return [h for h in self.table if h.startswith(domaine + ".")]


class FauxServices:
    def __init__(self):
        self.appels = []

    def has_service(self, domaine, service):
        return (domaine, service) in (("notify", "mobile"), ("notify", "send_message"), ("media_player", "volume_set"),
                                      ("media_player", "turn_off"), ("media_player", "media_pause"), ("media_player", "media_stop"),
                                      ("media_player", "play_media"))

    async def async_call(self, domaine, service, data, blocking=False, context=None):
        self.appels.append((domaine, service, dict(data), getattr(context, "user_id", None)))


class FauxBus:
    def __init__(self, hass):
        self.hass = hass
        self.ecoutes = []

    def _ecouter(self, type_, rappel, une_fois):
        e = {"type": type_, "rappel": rappel, "une_fois": une_fois}
        self.ecoutes.append(e)

        def retirer():
            if e in self.ecoutes:
                self.ecoutes.remove(e)
        return retirer

    def async_listen(self, type_, rappel):
        return self._ecouter(type_, rappel, False)

    def async_listen_once(self, type_, rappel):
        return self._ecouter(type_, rappel, True)

    def tirer(self, type_, data=None, context=None):
        evenement = types.SimpleNamespace(event_type=type_, data=data or {}, context=context or Context())
        for e in [e for e in self.ecoutes if e["type"] == type_]:
            if e["une_fois"]:
                self.ecoutes.remove(e)
            retour = e["rappel"](evenement)
            if asyncio.iscoroutine(retour):
                self.hass.async_create_task(retour)
        self.hass.executer()


class FauxHass:
    def __init__(self, etats):
        self.states = FauxEtats(etats)
        self.services = FauxServices()
        self.bus = FauxBus(self)
        self.config = types.SimpleNamespace(language="fr")
        self.data = {}
        self.taches = []

    def async_create_task(self, coro):
        self.taches.append(coro)
        return coro

    def executer(self):
        while self.taches:
            lancer(self.taches.pop(0))

    def abandonner(self):
        taches, self.taches = self.taches, []
        for coro in taches:
            coro.close()


def entree(entity_id, device_id, platform, area_id=None, classe=None, cle=None, categorie=None, disabled_by=None):
    return types.SimpleNamespace(entity_id=entity_id, device_id=device_id, area_id=area_id, platform=platform,
                                 device_class=None, original_device_class=classe, translation_key=cle,
                                 entity_category=categorie, disabled_by=disabled_by)


def appareil(ident, area_id=None, identifiers=(), entry_type=None):
    return types.SimpleNamespace(id=ident, area_id=area_id, identifiers=set(identifiers), entry_type=entry_type,
                                 disabled_by=None)


def maison():
    """La chambre de Lino, a peu pres comme chez lui (spec 0) : l'Echo Dot exposee DEUX fois, deux appareils qui
    partagent la valeur d'un identifiant ; l'Apple TV dans une AUTRE zone, ajoutee par le parent ; un service
    (Spotify) et le haut-parleur d'une sonnette dans la zone, qui n'entrent jamais."""
    entites = {
        OFF: entree(OFF, "d_off", "alexa_devices", classe="speaker"),
        PARLER: entree(PARLER, "d_off", "alexa_devices", cle="speak"),
        "notify.chambre_echo_dot_annoncer": entree("notify.chambre_echo_dot_annoncer", "d_off", "alexa_devices", cle="announce"),
        ANNONCES: entree(ANNONCES, "d_off", "alexa_devices", cle="announcements", categorie="config"),
        HACS: entree(HACS, "d_hacs", "alexa_media"),
        TV: entree(TV, "d_atv", "apple_tv", classe="tv"),
        "remote.apple_tv_chambre": entree("remote.apple_tv_chambre", "d_atv", "apple_tv"),
        SPOTIFY: entree(SPOTIFY, "d_spotify", "spotify"),
        "camera.sonnette": entree("camera.sonnette", "d_cam", "demo"),
        CAM_HP: entree(CAM_HP, "d_cam", "demo"),
        "media_player.desactivee": entree("media_player.desactivee", "d_off", "alexa_devices", disabled_by="user"),
    }
    appareils = {
        "d_off": appareil("d_off", ZONE, [("alexa_devices", "SERIE-TEST-0001")]),
        "d_hacs": appareil("d_hacs", ZONE, [("alexa_media", "SERIE-TEST-0001")]),
        "d_atv": appareil("d_atv", "chambre", [("apple_tv", "ATV-TEST")]),
        "d_spotify": appareil("d_spotify", ZONE, [("spotify", "compte")], entry_type="service"),
        "d_cam": appareil("d_cam", ZONE, [("demo", "cam")]),
    }
    etats = {
        OFF: FauxEtat("playing", {"friendly_name": "Echo Dot - Chambre Lino", "supported_features": 5644, "volume_level": .3}),
        PARLER: FauxEtat("unknown", {"friendly_name": "Echo Dot - Chambre Lino Parler"}),
        ANNONCES: FauxEtat("on", {"friendly_name": "Echo Dot - Chambre Lino Annonces"}),
        HACS: FauxEtat("playing", {"friendly_name": "Echo Dot Chambre Lino", "supported_features": 318399, "volume_level": .3,
                                   "media_title": "Bin K’uchul Xibalba"}),
        TV: FauxEtat("off", {"friendly_name": "Apple TV Chambre", "supported_features": 450487, "device_class": "tv"}),
        SPOTIFY: FauxEtat("playing", {"friendly_name": "Spotify", "supported_features": 1572925, "volume_level": .9}),
        CAM_HP: FauxEtat("idle", {"friendly_name": "Sonnette", "supported_features": 136708, "volume_level": .9}),
    }
    registre = types.SimpleNamespace(entities=entites)
    return registre, types.SimpleNamespace(devices=appareils), etats


class Horloge:
    def __init__(self, t):
        self.t = t

    def __call__(self):
        return self.t


class Rendezvous:
    """`async_call_later` : retient chaque echeance, qui sonne quand le test le dit."""

    def __init__(self, horloge):
        self.horloge = horloge
        self.poses = []

    def __call__(self, hass, delai, rappel):
        e = {"quand": self.horloge.t + delai, "rappel": rappel, "annule": False}
        self.poses.append(e)

        def annuler():
            e["annule"] = True
        return annuler

    def armees(self):
        return sorted((e for e in self.poses if not e["annule"]), key=lambda e: e["quand"])


class Banc:
    """Le mode enfant dans sa maison, et le temps que le test fait passer."""

    def __init__(self, m, hass, horloge, rdv, ecoutes, tics, depot, registre):
        self.m, self.hass, self.horloge, self.rdv = m, hass, horloge, rdv
        self.ecoutes, self.tics, self.depot, self.registre = ecoutes, tics, depot, registre

    def attendre(self, t):
        """Le temps passe jusqu'a `t` : chaque echeance due part, dans l'ordre."""
        while self.rdv.armees() and self.rdv.armees()[0]["quand"] <= t:
            e = self.rdv.armees()[0]
            self.horloge.t = max(self.horloge.t, e["quand"])
            e["annule"] = True
            e["rappel"](None)
            self.hass.executer()
        self.horloge.t = max(self.horloge.t, t)

    def publier(self, t, haid, state, attributes=None, context=None):
        """Le lecteur change a l'instant `t` : Home Assistant publie son etat."""
        self.attendre(t)
        vieux = self.hass.states.table.get(haid)
        attrs = dict(getattr(vieux, "attributes", {}) or {})
        attrs.update(attributes or {})
        neuf = FauxEtat(state, attrs, context)
        self.hass.states.table[haid] = neuf
        for e in [e for e in self.ecoutes if not e["retiree"] and haid in e["ids"]]:
            e["rappel"](types.SimpleNamespace(data={"entity_id": haid, "old_state": vieux, "new_state": neuf}))
        self.hass.executer()

    def tic(self, t):
        """La minute sonne a `t` (seconde 0) — ou maintenant, si l'horloge est deja plus loin."""
        self.attendre(t)
        for rappel in list(self.tics):
            rappel(datetime.fromtimestamp(self.horloge.t, PARIS))
        self.hass.executer()

    def minutes(self, t_depart, n):
        """`n` tics d'une minute a partir de `t_depart` (compris)."""
        for i in range(n):
            self.tic(t_depart + i * 60)

    def action(self, action):
        self.hass.bus.tirer("mobile_app_notification_action", {"action": action})

    def appels(self, domaine=None, service=None):
        return [(d, s, data) for d, s, data, _ in self.hass.services.appels
                if (domaine is None or d == domaine) and (service is None or s == service)]

    def journal(self):
        return [(e["quoi"], e["motif"], e["cibles"], e["simule"]) for e in lancer(self.m.regles.journal(module="enfant"))]

    def etat(self, user=None):
        return lancer(self.m.async_etat(user))

    def lecteur(self, haid, user=None):
        return self.etat(user)["lecteurs"][haid]

    def ecoutees(self):
        actives = [e["ids"] for e in self.ecoutes if not e["retiree"]]
        return actives[-1] if actives else []


@pytest.fixture
def horloge(monkeypatch):
    """`time.time` et `dt_util.now` sur une horloge que le test avance : le mardi 13/10/2026 a 17:38 - la fenetre
    de demarrage (deux minutes) se ferme a 17:40, et chaque test commence apres elle."""
    h = Horloge(paris(17, 38))
    monkeypatch.setattr(time, "time", h)
    monkeypatch.setattr(sys.modules["homeassistant.util.dt"], "now", lambda: datetime.fromtimestamp(h.t, PARIS))
    return h


@pytest.fixture
def creer(monkeypatch, store_module, horloge):
    """Fabrique le module dans sa maison, demarre comme Home Assistant le demarre, la fenetre de demarrage FERMEE
    (deux minutes passees) sauf `fenetre=True`. `profil` retouche le profil de la maquette ; `etat` : le fichier
    `.storage/loggia_enfant_etat` relu ; `partage` : d'autres cles communes ; `etats` : d'autres etats."""
    module = charger("enfant")
    calc = charger("enfant_calcul")
    regles_module = charger("regles")
    faits = []

    def fabrique(profil=None, etat=None, partage=None, etats=None, fenetre=False, sans_profil=False, simulation=False,
                 retoucher=None):
        registre, appareils, etats_maison = maison()
        if retoucher is not None:
            retoucher(registre, appareils)
        etats = etats if etats is not None else etats_maison
        ev = sys.modules["homeassistant.helpers.event"]
        monkeypatch.setattr(sys.modules["homeassistant.helpers.entity_registry"], "async_get", lambda _h: registre)
        monkeypatch.setattr(sys.modules["homeassistant.helpers.device_registry"], "async_get", lambda _h: appareils)
        depot = FauxStore(etat)
        monkeypatch.setattr(sys.modules["homeassistant.helpers.storage"], "Store", lambda _h, _v, _c: depot)
        rdv, ecoutes, tics = Rendezvous(horloge), [], []

        def suivre(_hass, ids, rappel):
            e = {"ids": list(ids), "rappel": rappel, "retiree": False}
            ecoutes.append(e)

            def retirer():
                e["retiree"] = True
            return retirer

        def chaque_minute(_hass, rappel, **_k):
            tics.append(rappel)
            return lambda: tics.remove(rappel)

        monkeypatch.setattr(ev, "async_call_later", rdv, raising=False)
        monkeypatch.setattr(ev, "async_track_state_change_event", suivre, raising=False)
        monkeypatch.setattr(ev, "async_track_time_change", chaque_minute, raising=False)
        p = calc.profil_defaut("Lino", ZONE)
        p["ajouts"] = [TV]
        p.update(profil or {})
        cfg = {"profils": {} if sans_profil else {ZONE: p}, "simulation": {"actif": simulation}}
        magasin = store_module.LoggiaStore.__new__(store_module.LoggiaStore)
        magasin._store = FauxStore({"users": {}, "migrated": True,
                                    "shared": {"loggia_enfant": cfg, "loggia_alertes": {"actif": True, "service": "mobile"},
                                               **(partage or {})}})
        magasin._ancien = FauxStore(None)
        magasin._data = None
        magasin._lock = asyncio.Lock()
        hass = FauxHass(etats)
        regles = regles_module.Regles(hass, magasin)
        regles._depot = FauxStore(None)
        m = module.LoggiaEnfant(hass, magasin, regles)
        hass.executer()
        b = Banc(m, hass, horloge, rdv, ecoutes, tics, depot, registre)
        if not fenetre:
            b.attendre(horloge.t + module.FENETRE_DEMARRAGE_S)
            hass.services.appels.clear()
        faits.append(b)
        return b

    yield fabrique
    for b in faits:
        b.hass.abandonner()


# ── Le recensement (E1, E6) ─────────────────────────────────────────────────

def test_le_profil_recense_les_lecteurs_de_sa_zone_et_ses_ajouts_avec_la_jumelle(creer):
    """Les deux entites de l'Echo (la zone), l'Apple TV (ajoutee) ; ni Spotify (un service), ni le haut-parleur
    de la sonnette (une camera), ni une entite desactivee. L'Echo est UN appareil physique sous deux entites."""
    b = creer()
    membres = b.m.membres[ZONE]
    assert sorted(membres) == sorted([OFF, HACS, TV])
    assert membres[OFF]["appareil"] == membres[HACS]["appareil"], "deux appareils au registre, une enceinte : la meme empreinte"
    assert membres[OFF]["appareil"] != membres[TV]["appareil"]
    assert [membres[h]["ecran"] for h in (OFF, HACS, TV)] == [False, False, True], "l'Apple TV compte son temps (classe tv)"
    assert [membres[h]["ajoute"] for h in (OFF, HACS, TV)] == [False, False, True]
    assert b.m.soeurs[ZONE] == {"parler": PARLER, "annonces": ANNONCES, "hacs": HACS}
    assert b.ecoutees() == sorted([OFF, HACS, TV]), "le profil n'ecoute que ses lecteurs"
    assert b.m.demarrage is True


def test_la_jumelle_d_un_ajout_vient_avec_lui_et_les_ecrans_peuvent_s_imposer(creer):
    """Ajouter l'une des deux entites d'une Echo d'une autre piece amene l'autre ; `ecrans` impose."""
    b = creer(profil={"zone": "salon", "ajouts": [HACS], "ecrans": [HACS]})
    membres = b.m.membres[ZONE]
    assert sorted(membres) == sorted([OFF, HACS]), "la zone salon n'a rien ; l'ajout de la HACS amene l'officielle"
    assert membres[HACS]["ecran"] is True and membres[OFF]["ecran"] is False


def test_sans_profil_rien_n_ecoute_et_l_etat_le_dit(creer):
    b = creer(sans_profil=True)
    assert b.m.membres == {} and b.ecoutees() == [] and b.etat()["profils"] == {} and b.etat()["lecteurs"] == {}


def test_une_echo_qui_change_de_piece_quitte_le_profil(creer):
    b = creer()
    b.registre.entities[OFF].area_id = "salon"
    b.registre.entities[HACS].area_id = "salon"
    b.hass.bus.tirer("entity_registry_updated", {"action": "update", "entity_id": OFF, "changes": {"area_id": ZONE}})
    assert sorted(b.m.membres[ZONE]) == [TV]
    assert b.ecoutees() == [TV]


# ── Le plafond qui ramene (E7, E11) ─────────────────────────────────────────

def test_un_volume_monte_a_la_voix_redescend_au_plafond_sur_l_entite_qui_a_publie(creer):
    b = creer()
    b.publier(paris(17, 41), HACS, "playing", {"volume_level": .7})
    assert b.appels() == [("media_player", "volume_set", {"entity_id": HACS, "volume_level": .4})], "40 %, sur la HACS qui a publie"
    assert b.hass.services.appels[0][3] is None, "le propre contexte du serveur, sans compte : pas une main"
    assert b.journal()[0] == ("volume ramené", "de 70 à 40 % · à la voix ou sur l’appareil", [HACS], False)
    assert b.lecteur(HACS)["plafond"] == 40
    # L'officielle publie encore 70 % dix secondes plus tard (son sondage) : le reflet, rien.
    b.publier(paris(17, 41, 10), OFF, "playing", {"volume_level": .7})
    assert len(b.appels()) == 1
    # Une VRAIE montee a 80 % : ramenee, sur l'officielle cette fois.
    b.publier(paris(17, 41, 20), OFF, "playing", {"volume_level": .8})
    assert b.appels()[-1] == ("media_player", "volume_set", {"entity_id": OFF, "volume_level": .4})
    # A ou sous le plafond : rien. La maison ne monte jamais rien.
    b.publier(paris(17, 42), HACS, "playing", {"volume_level": .35})
    b.publier(paris(17, 43), HACS, "playing", {"volume_level": .4})
    assert len(b.appels()) == 2
    assert not any(s in ("volume_up", "turn_on", "media_play") for _, s, _ in b.appels())


def test_pas_deux_ordres_en_cinq_secondes_sur_la_meme_enceinte(creer):
    b = creer()
    b.publier(paris(17, 41), HACS, "playing", {"volume_level": .7})
    b.publier(paris(17, 41, 3), HACS, "playing", {"volume_level": .9}, )
    assert len(b.appels("media_player", "volume_set")) == 1, "trois secondes plus tard : on attend"
    b.publier(paris(17, 41, 6), HACS, "playing", {"volume_level": .9})
    assert len(b.appels("media_player", "volume_set")) == 2


def test_l_insistance_previent_le_telephone_une_fois_puis_le_journal_seul(creer):
    b = creer()
    for i in range(3):
        b.publier(paris(17, 41 + i), HACS, "playing", {"volume_level": .7 + i / 100})
    notifs = b.appels("notify", "mobile")
    assert len(notifs) == 1, "trois ramenes en dix minutes : UNE notification"
    assert notifs[0][2]["message"] == "Volume ramené trois fois en dix minutes sur Echo Dot Chambre Lino"
    assert notifs[0][2]["title"] == "Loggia — mode enfant"
    b.publier(paris(17, 45), HACS, "playing", {"volume_level": .8})
    assert len(b.appels("notify", "mobile")) == 1, "le silence d'une heure"
    assert len(b.appels("media_player", "volume_set")) == 4, "mais chaque volume est ramene"


def test_observer_sans_agir_note_sans_rien_envoyer(creer):
    b = creer(simulation=True)
    b.publier(paris(17, 41), HACS, "playing", {"volume_level": .7})
    assert b.appels() == []
    assert b.journal()[0] == ("volume ramené", "de 70 à 40 % · à la voix ou sur l’appareil", [HACS], True)
    assert b.etat()["simulation"] is True


def test_un_profil_eteint_ou_leve_laisse_le_volume(creer):
    b = creer(profil={"actif": False})
    b.publier(paris(17, 41), HACS, "playing", {"volume_level": .7})
    assert b.appels() == [] and b.lecteur(HACS)["plafond"] is None and b.lecteur(HACS)["actif"] is False
    b2 = creer()
    t0 = b2.horloge.t
    lancer(b2.m.async_lever(ZONE, 30))
    b2.publier(t0 + 60, HACS, "playing", {"volume_level": .7})
    assert b2.appels() == []
    assert b2.lecteur(HACS)["leve_jusqua"] == t0 + 1800 and b2.lecteur(HACS)["plafond"] is None
    assert b2.journal()[0][0] == "limites levées"
    lancer(b2.m.async_lever(ZONE, 0))
    assert b2.lecteur(HACS)["leve_jusqua"] is None and b2.journal()[0][0] == "limites rétablies"
    b2.publier(t0 + 120, HACS, "playing", {"volume_level": .7})
    assert len(b2.appels("media_player", "volume_set")) == 1
    with pytest.raises(ValueError):
        lancer(b2.m.async_lever("inconnu", 30))


# ── Le temps d'ecran (E8), la coupure (E9), la voix (E4 B) ──────────────────

def test_le_temps_compte_sur_l_etat_et_l_ecran_s_eteint_a_la_fin(creer):
    b = creer()
    # 17:40 : rien n'est compte, la TV est eteinte. 17:42, elle s'allume ; la minute compte a chaque tic.
    b.publier(paris(17, 42), TV, "playing", {"app_name": "Disney+"})
    assert b.appels() == []
    b.minutes(paris(17, 43), 30)
    assert b.lecteur(TV)["ecran"] == {"budget_min": 90, "utilise_s": 30 * 60, "bonus_min": 0, "reste_s": 60 * 60}, "trente minutes comptees"
    assert b.lecteur(TV)["bloque"] is None and b.lecteur(TV)["reprise"] == "07:30"
    # Eteinte a 18:12, rien ne compte ; rallumee a 18:20.
    b.publier(paris(18, 12, 30), TV, "off")
    b.minutes(paris(18, 13), 7)
    assert b.lecteur(TV)["ecran"]["utilise_s"] == 30 * 60 + 30, "les trente secondes avant l'extinction, pas la pause"
    b.publier(paris(18, 20), TV, "playing")
    # La fin arrive a 19:19:30 : la minute d'avant, aucune coupure ; au tic de 19:20, le budget est use, la TV s'eteint.
    b.minutes(paris(18, 21), 59)
    assert b.appels("media_player", "turn_off") == [], "il reste trente secondes"
    b.tic(paris(19, 20))
    assert b.appels("media_player", "turn_off") == [("media_player", "turn_off", {"entity_id": TV})]
    assert b.lecteur(TV)["bloque"] == "temps" and b.lecteur(TV)["ecran"]["reste_s"] == 0
    assert ("écran éteint", "temps écoulé", [TV], False) in b.journal()
    # Le fichier porte le compteur : ecrit au plus toutes les 60 s, et a la coupure.
    assert b.depot.contenu[ZONE]["ecran_s"][TV] >= 90 * 60


def test_rallumee_la_tv_attend_vingt_secondes_puis_se_reeteint_et_la_troisieme_fois_previent(creer):
    b = creer(profil={"budget": {"semaine": 1, "weekend": 1}})
    b.publier(paris(17, 41), TV, "playing")
    b.tic(paris(17, 42))
    assert b.appels("media_player", "turn_off") == [("media_player", "turn_off", {"entity_id": TV})], "une minute de budget : eteinte au tic"
    b.publier(paris(17, 42, 30), TV, "off")
    # Rallumee : la grace de vingt secondes, puis `turn_off` ; eteinte entre-temps, rien.
    b.publier(paris(17, 43), TV, "playing")
    assert len(b.appels("media_player", "turn_off")) == 1
    b.publier(paris(17, 43, 10), TV, "off")
    b.attendre(paris(17, 43, 30))
    assert len(b.appels("media_player", "turn_off")) == 1, "eteinte avant la grace : rien a eteindre"
    b.publier(paris(17, 43, 40), TV, "playing")
    b.attendre(paris(17, 44, 5))
    assert len(b.appels("media_player", "turn_off")) == 2, "vingt secondes de grace, puis l'extinction"
    assert ("écran éteint", "rallumé", [TV], False) == b.journal()[0]
    assert b.appels("notify", "mobile") == []
    b.publier(paris(17, 44, 10), TV, "off")
    # Au plus une coupure par minute : rallumee tout de suite, elle attend la minute.
    b.publier(paris(17, 44, 15), TV, "playing")
    b.attendre(paris(17, 44, 40))
    assert len(b.appels("media_player", "turn_off")) == 2
    b.attendre(paris(17, 45, 10))
    assert len(b.appels("media_player", "turn_off")) == 3
    b.publier(paris(17, 45, 15), TV, "off")
    b.publier(paris(17, 46, 20), TV, "playing")
    b.attendre(paris(17, 46, 45))
    assert len(b.appels("media_player", "turn_off")) == 4
    notifs = b.appels("notify", "mobile")
    assert len(notifs) == 1 and notifs[0][2]["message"] == "Apple TV Chambre se rallume après l’heure", "trois rallumages en dix minutes : le telephone, une fois"
    assert not any(s == "turn_on" for _, s, _ in b.appels()), "la maison n'allume jamais rien"


# TEST AJOUTE (passe bis, 17/10, point 1) : un ecran bavard. Un Chromecast ou une Android TV publie sa position toutes les
# dix secondes ; chaque evenement recalait la grace de vingt secondes, le rendez-vous existait toujours, le tic se taisait, et
# l'ecran bloque n'etait JAMAIS reeteint — chaque evenement passait de plus pour un rallumage. La grace ne s'arme que sur la
# transition eteint → allume ; deja allume, le tic de la minute eteint de nouveau, une fois par minute.
def test_un_ecran_bavard_est_reeteint_une_fois_par_minute_et_seul_un_vrai_rallumage_compte(creer):
    b = creer(profil={"budget": {"semaine": 1, "weekend": 1}})
    b.publier(paris(17, 41), TV, "playing", {"media_position": 0})
    b.tic(paris(17, 42))
    assert len(b.appels("media_player", "turn_off")) == 1, "une minute de budget : eteinte au tic"
    # La TV ignore l'ordre et bavarde trois minutes : un attribut toutes les dix secondes, le tic entre deux.
    for minute in range(3):
        for dix in range(1, 6):
            t = paris(17, 42 + minute, 10 * dix)
            b.publier(t, TV, "playing", {"media_position": t - paris(17, 41)})
        b.tic(paris(17, 43 + minute))
    assert len(b.appels("media_player", "turn_off")) == 4, "reeteinte a chaque minute, malgre le bavardage"
    assert b.m.etats[ZONE]["rallumages"] == [] and b.appels("notify", "mobile") == [], "aucun evenement n'est un rallumage"
    assert all(ligne[1] == "temps écoulé" for ligne in b.journal() if ligne[0] == "écran éteint"), "le motif reste « temps écoulé »"
    # Un VRAI rallumage : eteinte, puis allumee — la grace, l'extinction, et le compteur d'insistance compte UNE fois.
    b.publier(paris(17, 45, 10), TV, "off")
    b.publier(paris(17, 45, 20), TV, "playing", {"media_position": 0})
    b.publier(paris(17, 45, 30), TV, "playing", {"media_position": 10})
    b.attendre(paris(17, 46, 5))
    assert len(b.appels("media_player", "turn_off")) == 5
    assert len(b.m.etats[ZONE]["rallumages"]) == 1 and b.journal()[0] == ("écran éteint", "rallumé", [TV], False)


# TEST AJOUTE (passe bis 2, 17/10, point 5) : un muet n'est pas un rallumage. `unavailable` ou `unknown` → allume, et un
# `old_state` absent (entite recreee) valaient un rallumage : une integration qui se reconnecte trois fois en dix minutes sur un
# ecran bloque aurait prevenu le telephone a tort. Seul « off » ou « standby » → allume en est un ; le tic de la minute tient le reste.
def test_un_etat_muet_n_est_pas_un_rallumage_seul_off_ou_standby_vers_allume_en_est_un(creer):
    b = creer(profil={"budget": {"semaine": 1, "weekend": 1}})
    b.publier(paris(17, 41), TV, "playing")
    b.tic(paris(17, 42))
    assert len(b.appels("media_player", "turn_off")) == 1, "une minute de budget : eteinte au tic"
    b.publier(paris(17, 42, 30), TV, "off")
    # L'integration se reconnecte trois fois en dix minutes : indisponible, puis de nouveau la. Aucune grace n'est armee.
    for minute in (44, 45, 46):
        b.publier(paris(17, minute), TV, "unavailable")
        b.publier(paris(17, minute, 10), TV, "playing")
        assert (ZONE, TV, "coupure") not in b.m._rdv, "un etat muet n'arme pas la grace de vingt secondes"
        b.attendre(paris(17, minute, 40))
        assert len(b.appels("media_player", "turn_off")) == 1, "et rien ne s'eteint avant le tic de la minute"
    assert b.m.etats[ZONE]["rallumages"] == [] and b.appels("notify", "mobile") == [], "trois reconnexions ne previennent pas le telephone"
    # Le tic de la minute eteint l'ecran bloque et encore allume, pour son motif — « temps ecoule », pas « rallume ».
    b.tic(paris(17, 47))
    assert len(b.appels("media_player", "turn_off")) == 2
    assert b.journal()[0] == ("écran éteint", "temps écoulé", [TV], False) and b.m.etats[ZONE]["rallumages"] == []
    # Une entite recreee (aucun etat avant) n'est pas un rallumage non plus.
    b.publier(paris(17, 47, 20), TV, "off")
    del b.hass.states.table[TV]
    # (la doublure n'a plus d'etat a copier : l'entite recreee arrive avec ses attributs)
    b.publier(paris(17, 49), TV, "playing", {"friendly_name": "Apple TV Chambre", "supported_features": 450487, "device_class": "tv"})
    assert (ZONE, TV, "coupure") not in b.m._rdv
    b.attendre(paris(17, 49, 40))
    assert len(b.appels("media_player", "turn_off")) == 2 and b.m.etats[ZONE]["rallumages"] == []
    # Un VRAI rallumage — « off », puis allume — arme la grace, eteint, et compte pour l'insistance (« standby » aussi).
    b.publier(paris(17, 50), TV, "standby")
    b.publier(paris(17, 51), TV, "playing")
    assert (ZONE, TV, "coupure") in b.m._rdv
    b.attendre(paris(17, 51, 25))
    assert len(b.appels("media_player", "turn_off")) == 3
    assert b.journal()[0] == ("écran éteint", "rallumé", [TV], False) and len(b.m.etats[ZONE]["rallumages"]) == 1


# TEST AJOUTE (passe bis, 17/10, point 5) : la minute a cheval sur minuit. `nouveau_jour` passait avant `avancer_ecran` : une
# TV allumee de 23:58 a 00:02 comptait 180 s le jour nouveau au lieu de 120. Ce qui precede minuit va au jour d'avant.
def test_la_minute_a_cheval_sur_minuit_va_au_jour_d_avant(creer):
    heures = {"semaine": ["07:30", "02:00"], "weekend": ["08:30", "02:00"]}
    b = creer(profil={"heures": heures})
    b.publier(paris(23, 58), TV, "playing")
    b.tic(paris(23, 59))
    assert b.lecteur(TV)["ecran"]["utilise_s"] == 60
    b.tic(paris(0, 0, jour=14))
    assert b.lecteur(TV)["ecran"]["utilise_s"] == 0, "la minute de 23:59 a 00:00 appartient au 13"
    assert b.m.etats[ZONE]["jour"] == "2026-10-14"
    b.tic(paris(0, 1, jour=14))
    b.tic(paris(0, 2, jour=14))
    assert b.lecteur(TV)["ecran"]["utilise_s"] == 120, "deux minutes le jour nouveau, pas trois"
    # Eteinte a 00:02:30 : les trente secondes vont au 14 ; et une extinction a cheval sur minuit se partage aussi.
    b.publier(paris(0, 2, 30, jour=14), TV, "off")
    assert b.m.etats[ZONE]["ecran_s"][TV] == 150
    b.publier(paris(23, 59, 30, jour=14), TV, "playing")
    b.publier(paris(0, 0, 20, jour=15), TV, "off")
    assert b.m.etats[ZONE]["jour"] == "2026-10-15" and b.m.etats[ZONE]["ecran_s"][TV] == 20, "les trente secondes d'avant minuit ne comptent pas le 15"


# TEST AJOUTE (passe bis 2, 17/10, point 3) : le partage de minuit vaut pour CHAQUE ecran allume, pas seulement le premier. Le
# premier ecran du tic faisait basculer le jour ; le second ne trouvait plus de jour a changer et recevait tout l'intervalle sur le
# jour neuf — deux ecrans allumes a 23:58 comptaient 0 et 60 s a minuit, au lieu de 0 et 0 (la sonde de la relecture).
@pytest.mark.parametrize("retard", [0, 30])
def test_la_minute_a_cheval_sur_minuit_vaut_pour_chaque_ecran_allume(creer, retard):
    heures = {"semaine": ["07:30", "02:00"], "weekend": ["08:30", "02:00"]}
    eteinte = FauxEtat("off", {"friendly_name": "Echo Dot - Chambre Lino", "supported_features": 5644, "volume_level": .3})
    b = creer(profil={"heures": heures, "ecrans": [OFF, TV]}, etats={**maison()[2], OFF: eteinte})
    assert [h for h, info in b.m.membres[ZONE].items() if info["ecran"]] == [OFF, TV], "deux ecrans dans le profil, l'Echo d'abord"
    b.publier(paris(23, 58), OFF, "playing")
    b.publier(paris(23, 58), TV, "playing")
    b.tic(paris(23, 59))
    assert b.m.etats[ZONE]["ecran_s"] == {OFF: 60, TV: 60}
    # Minuit passe — a l'heure, ou avec `retard` secondes (Home Assistant occupe) : la minute de 23:59 est celle du 13 pour les deux ;
    # chacun ne compte que ce qui suit minuit sur le 14, pas la minute entiere pour le second.
    b.tic(paris(0, 0, retard, jour=14))
    assert b.m.etats[ZONE]["jour"] == "2026-10-14"
    assert b.m.etats[ZONE]["ecran_s"] == {OFF: retard, TV: retard}, "les deux ecrans, a egalite"
    assert b.lecteur(TV)["ecran"]["utilise_s"] == retard and b.lecteur(OFF)["ecran"]["utilise_s"] == retard
    # La minute suivante compte pleinement pour chacun : `retard` + ce qui reste de la minute = une minute le 14.
    b.tic(paris(0, 1, jour=14))
    assert b.m.etats[ZONE]["ecran_s"] == {OFF: 60, TV: 60}


# TEST AJOUTE (passe bis 2, 17/10, point 3) : l'autre chemin. Un EVENEMENT apres minuit (l'ecran qui s'eteint) fait basculer le jour
# avant le tic ; le tic suivant ne rend pas alors a l'autre ecran la minute d'avant minuit.
def test_un_evenement_apres_minuit_fait_basculer_le_jour_sans_donner_la_veille_a_l_autre_ecran(creer):
    heures = {"semaine": ["07:30", "02:00"], "weekend": ["08:30", "02:00"]}
    eteinte = FauxEtat("off", {"friendly_name": "Echo Dot - Chambre Lino", "supported_features": 5644, "volume_level": .3})
    b = creer(profil={"heures": heures, "ecrans": [OFF, TV]}, etats={**maison()[2], OFF: eteinte})
    b.publier(paris(23, 58), OFF, "playing")
    b.publier(paris(23, 58), TV, "playing")
    b.tic(paris(23, 59))
    b.publier(paris(0, 0, 20, jour=14), TV, "off")
    assert b.m.etats[ZONE]["jour"] == "2026-10-14" and b.m.etats[ZONE]["ecran_s"] == {TV: 20}, "la TV s'eteint : vingt secondes le 14"
    b.tic(paris(0, 1, jour=14))
    assert b.m.etats[ZONE]["ecran_s"] == {TV: 20, OFF: 60}, "l'Echo : la minute apres minuit, pas deux (le tic ne lui rend pas la veille)"


# TEST AJOUTE (passe bis, 17/10, point 6) : le decompte qui saute. `utilise_s` etait celui du dernier tic : l'ecran, qui sonde
# toutes les 15 s fiche ouverte, voyait le temps avancer d'une minute d'un coup. L'etat lu ajoute le temps depuis le tic, pour
# un ecran allume — sans toucher au compteur, que le tic tient.
def test_l_etat_lu_entre_deux_tics_compte_le_temps_depuis_le_tic(creer):
    b = creer()
    b.publier(paris(17, 42), TV, "playing")
    b.tic(paris(17, 43))
    assert b.lecteur(TV)["ecran"]["utilise_s"] == 60
    b.attendre(paris(17, 43, 40))
    assert b.lecteur(TV)["ecran"] == {"budget_min": 90, "utilise_s": 100, "bonus_min": 0, "reste_s": 90 * 60 - 100}
    assert b.m.etats[ZONE]["ecran_s"][TV] == 60, "la lecture ne touche pas au compteur"
    b.tic(paris(17, 44))
    assert b.lecteur(TV)["ecran"]["utilise_s"] == 120
    # Eteinte, rien ne s'ajoute entre deux tics.
    b.publier(paris(17, 44, 10), TV, "off")
    b.attendre(paris(17, 44, 50))
    assert b.lecteur(TV)["ecran"]["utilise_s"] == 130


# TEST AJOUTE (passe bis, 17/10, point 8) : un ecran sans le bit TURN_OFF notait « sans interrupteur » a chaque tic et a chaque
# evenement ; une ligne par blocage, et une nouvelle quand il se rallume.
def test_un_ecran_sans_interrupteur_se_note_une_fois_par_blocage(creer):
    sans_bouton = FauxEtat("off", {"friendly_name": "Apple TV Chambre", "supported_features": 450487 & ~256, "device_class": "tv"})
    b = creer(profil={"budget": {"semaine": 1, "weekend": 1}}, etats={**maison()[2], TV: sans_bouton})
    b.publier(paris(17, 41), TV, "playing")
    for minute in range(4):
        b.publier(paris(17, 41, 30) + 60 * minute, TV, "playing", {"media_position": minute})
        b.tic(paris(17, 42 + minute))
    assert b.appels("media_player", "turn_off") == [], "sans le bit, rien ne part"

    def lignes():
        return [ligne for ligne in b.journal() if ligne[1] == "sans interrupteur"]
    assert lignes() == [("écran éteint", "sans interrupteur", [], False)], "une ligne, pas une par tic ni par evenement"
    b.publier(paris(17, 45, 30), TV, "off")
    b.publier(paris(17, 46), TV, "playing")
    b.attendre(paris(17, 46, 30))
    assert len(lignes()) == 2, "rallume : un nouveau blocage, une nouvelle ligne"


# TEST AJOUTE (passe bis 2, 17/10, point 7) : un ecran qui quitte le profil emporte sa ligne « sans interrupteur ». Sinon son entree
# restait dans l'ensemble, et s'il revenait plus tard, son premier blocage ne serait pas dit.
def test_un_ecran_qui_quitte_le_profil_emporte_sa_ligne_sans_interrupteur(creer):
    sans_bouton = FauxEtat("off", {"friendly_name": "Apple TV Chambre", "supported_features": 450487 & ~256, "device_class": "tv"})
    b = creer(profil={"budget": {"semaine": 1, "weekend": 1}}, etats={**maison()[2], TV: sans_bouton})
    b.publier(paris(17, 41), TV, "playing")
    b.tic(paris(17, 42))
    assert b.m._sans_bouton == {TV}, "le blocage est dit une fois"
    # Le parent retire l'Apple TV du profil (un ajout) : elle n'en est plus, et sa ligne s'efface avec elle.
    lancer(b.m.async_enregistrer({"profils": {ZONE: {"ajouts": []}}}))
    assert TV not in b.m.membres[ZONE] and b.m._sans_bouton == set()


def test_cinq_minutes_avant_la_fin_l_echo_le_dit_une_fois(creer):
    b = creer(profil={"budget": {"semaine": 10, "weekend": 10}})
    b.publier(paris(17, 41), TV, "playing")
    b.minutes(paris(17, 42), 4)
    assert b.appels("notify", "send_message") == []
    b.tic(paris(17, 46))
    assert b.appels("notify", "send_message") == [("notify", "send_message", {"entity_id": PARLER, "message": "Lino, l’écran s’éteint dans cinq minutes"})]
    b.minutes(paris(17, 47), 3)
    assert len(b.appels("notify", "send_message")) == 1, "une fois par echeance"
    assert ("voix", "l’écran s’éteint dans cinq minutes", [PARLER], False) in b.journal()
    # Sans la bascule, ou en allemand : rien, ou la langue de la maison.
    b2 = creer(profil={"budget": {"semaine": 10, "weekend": 10}, "voix": False})
    b2.publier(paris(17, 41), TV, "playing")
    b2.minutes(paris(17, 42), 6)
    assert b2.appels("notify", "send_message") == []


def test_la_voix_parle_la_langue_de_la_maison(creer):
    b = creer(profil={"budget": {"semaine": 10, "weekend": 10}})
    b.hass.config.language = "de"
    b.publier(paris(17, 41), TV, "playing")
    b.minutes(paris(17, 42), 5)
    assert b.appels("notify", "send_message")[0][2]["message"] == "Lino, der Bildschirm geht in fünf Minuten aus"


# ── Le coucher (E10) ───────────────────────────────────────────────────────

def test_au_coucher_le_plafond_baisse_et_l_echo_se_met_en_pause_sauf_le_son_pour_dormir(creer):
    b = creer()
    b.tic(paris(20, 30))
    assert b.lecteur(HACS)["bloque"] == "coucher" and b.lecteur(HACS)["plafond"] == 20 and b.lecteur(HACS)["reprise"] == "07:30"
    assert ("coucher", "", [], False) in b.journal(), "le journal dit le coucher"
    b.publier(paris(20, 31), HACS, "playing", {"volume_level": .3})
    assert b.appels("media_player", "volume_set")[-1][2] == {"entity_id": HACS, "volume_level": .2}
    # Un titre lance a la voix : vingt secondes, puis la pause, sur l'entite qui a le bit (la HACS).
    b.publier(paris(20, 32), HACS, "playing", {"media_title": "Du metal"})
    b.attendre(paris(20, 32, 25))
    assert b.appels("media_player", "media_pause") == [("media_player", "media_pause", {"entity_id": HACS})]
    assert ("mis en pause", "coucher", [HACS], False) == b.journal()[0]
    # La puce « Bruit blanc » : la phrase part a la jumelle HACS, et le titre qui suit est garde jusqu'au matin.
    lancer(b.m.async_dormir(ZONE, 0))
    assert b.appels("media_player", "play_media")[-1] == ("media_player", "play_media", {"entity_id": HACS, "media_content_type": "custom", "media_content_id": "joue du bruit blanc"})
    b.publier(paris(20, 33), HACS, "playing", {"media_title": "Bruit blanc"})
    b.attendre(paris(20, 34))
    assert len(b.appels("media_player", "media_pause")) == 1, "le son pour dormir reste"
    assert b.lecteur(HACS)["dormir"]["titres"] == ["Bruit blanc"]
    b.publier(paris(20, 40), HACS, "playing", {"media_title": "Bruit blanc"})
    b.attendre(paris(20, 41))
    assert len(b.appels("media_player", "media_pause")) == 1, "garde jusqu'au matin"
    # Le matin : le journal dit la reprise, le plafond remonte, rien n'est envoye.
    envoyes = len(b.hass.services.appels)
    b.tic(paris(7, 30, jour=14))
    assert b.lecteur(HACS)["bloque"] is None and b.lecteur(HACS)["plafond"] == 40
    assert ("autorisé", "07:30", [], False) in b.journal()
    assert len(b.hass.services.appels) == envoyes, "la maison n'allume rien a la reprise"
    with pytest.raises(ValueError):
        lancer(b.m.async_dormir(ZONE, 5))


# TEST AJOUTE (passe bis, 17/10, point 4) : le plafond relu au coucher et apres un reglage. Une Echo qui joue a 30 % gardait 30 %
# au debut du coucher jusqu'a son prochain evenement, et de meme quand le parent baissait `volume_max` : la maison regarde ou
# elle en est (`_regarder`), et ne fait que RAMENER vers le bas — un ordre par enceinte, le reflet de la jumelle ignore.
def test_le_plafond_est_relu_au_coucher_et_apres_un_reglage_du_parent(creer):
    b = creer()
    # 17:41 : le parent baisse le plafond a 25. L'Echo, a 30 % sous ses deux entites, redescend sans avoir rien publie —
    # UN ordre pour l'enceinte (deux entites, une cle physique), jamais une montee.
    b.attendre(paris(17, 41))
    lancer(b.m.async_enregistrer({"profils": {ZONE: {"volume_max": 25}}}))
    b.hass.executer()  # l'ordre part dans une tache, comme sur un evenement
    ordres = b.appels("media_player", "volume_set")
    assert len(ordres) == 1 and ordres[0][2]["volume_level"] == .25 and ordres[0][2]["entity_id"] in (OFF, HACS)
    assert b.lecteur(HACS)["plafond"] == 25
    # Un reglage qui MONTE le plafond ne touche a rien : la maison ne monte jamais rien.
    lancer(b.m.async_enregistrer({"profils": {ZONE: {"volume_max": 60}}}))
    b.hass.executer()
    assert len(b.appels("media_player", "volume_set")) == 1
    # Le coucher, a 20:30 : le plafond passe a 20, et l'Echo — toujours a 30 % — redescend au tic, sans evenement.
    b.tic(paris(20, 30))
    ordres = b.appels("media_player", "volume_set")
    assert len(ordres) == 2 and ordres[-1][2]["volume_level"] == .2 and ordres[-1][2]["entity_id"] in (OFF, HACS)
    ramenes = [ligne for ligne in b.journal() if ligne[0] == "volume ramené"]
    assert ramenes and ramenes[0][1].startswith("de 30 à 20 %") and ramenes[0][2] == [ordres[-1][2]["entity_id"]], "le journal dit le ramene du coucher"
    # Le tic suivant ne redit rien : la relecture tient au passage du coucher, pas a chaque minute.
    b.tic(paris(20, 31))
    assert len(b.appels("media_player", "volume_set")) == 2
    assert not any(s == "volume_set" and data["volume_level"] > .3 for _, s, data in b.appels()), "jamais plus haut que lu"


def test_sons_coupes_tout_ce_qui_joue_se_met_en_pause_et_une_officielle_seule_s_arrete(creer):
    b = creer(profil={"dormir": False})
    b.tic(paris(20, 30))
    assert b.appels("media_player", "media_pause") == [], "ce qui jouait deja n'est pas coupe par le tic : la regle agit sur ce qui COMMENCE"
    b.publier(paris(20, 31), HACS, "playing", {"media_title": "Bruit blanc"})
    b.attendre(paris(20, 32))
    assert b.appels("media_player", "media_pause") == [("media_player", "media_pause", {"entity_id": HACS})], "sons coupes : meme un son pour dormir"
    # Sans jumelle HACS, l'officielle n'a que STOP. (L'horloge est partagee : la suite se compte depuis maintenant, apres 20:30.)
    b2 = creer(profil={"zone": "salon", "ajouts": [OFF]}, retoucher=lambda reg, _apps: reg.entities.pop(HACS),
               etats={OFF: FauxEtat("playing", {"friendly_name": "Echo seule", "supported_features": 5644, "volume_level": .3})})
    t0 = b2.horloge.t
    b2.tic(t0)
    b2.publier(t0 + 60, OFF, "playing", {"media_title": "Du metal"})
    b2.attendre(t0 + 120)
    assert b2.appels("media_player", "media_stop") == [("media_player", "media_stop", {"entity_id": OFF})]
    assert b2.m.soeurs[ZONE]["hacs"] is None
    with pytest.raises(ValueError):
        lancer(b2.m.async_dormir(ZONE, 0))


# ── La demande et la reponse (E13), les droits ──────────────────────────────

def test_la_demande_part_au_telephone_avec_deux_boutons_et_la_reponse_revient_par_le_jeton(creer):
    b = creer(profil={"budget": {"semaine": 1, "weekend": 1}})
    b.publier(paris(17, 41), TV, "playing")
    b.minutes(paris(17, 42), 2)
    assert b.lecteur(TV)["bloque"] == "temps"
    etat = lancer(b.m.async_demander(ZONE))
    notif = b.appels("notify", "mobile")[-1][2]
    assert notif["message"] == "Lino demande 15 min de plus (Apple TV Chambre)" and notif["title"] == "Loggia — mode enfant"
    boutons = notif["data"]["actions"]
    assert [x["title"] for x in boutons] == ["Accorder 15 min", "Refuser"]
    jeton = b.m.etats[ZONE]["demande"]["jeton"]
    assert len(jeton) >= 16 and boutons[0]["action"] == "LOGGIA_ENFANT_" + jeton + "_OUI" and boutons[1]["action"].endswith("_NON")
    assert etat["lecteurs"][TV]["demande"] == {"appareil": TV, "quand": paris(17, 43), "reponse": None}, "l'ecran : la demande, jamais le jeton"
    assert "jeton" not in str(etat)
    with pytest.raises(ValueError):
        lancer(b.m.async_demander(ZONE))
    # Un jeton inconnu ne fait rien et n'est pas note ; le bon accorde 15 minutes, une fois.
    lignes = len(b.journal())
    b.action("LOGGIA_ENFANT_inconnu_OUI")
    assert len(b.journal()) == lignes and b.m.etats[ZONE]["bonus_min"] == 0
    b.action("LOGGIA_ENFANT_" + jeton + "_OUI")
    assert b.m.etats[ZONE]["bonus_min"] == 15 and b.lecteur(TV)["bloque"] is None
    assert b.journal()[0] == ("15 min accordées", "depuis le téléphone", [TV], False)
    b.action("LOGGIA_ENFANT_" + jeton + "_OUI")
    assert b.m.etats[ZONE]["bonus_min"] == 15, "a usage unique"
    assert not any(s == "turn_on" for _, s, _ in b.appels()), "la TV peut se rallumer : jamais par la maison"


def test_refusee_depuis_l_ecran_plus_de_demande_du_jour_et_une_demande_expire(creer):
    # L'horloge est partagee par les bancs d'un meme test : les cas courts d'abord, le long ensuite.
    # Sur ce que le compte ne pilote pas : refuse, demande et son pour dormir.
    b3 = creer(profil={"budget": {"semaine": 1, "weekend": 1}})
    t3 = b3.horloge.t
    b3.publier(t3 + 60, TV, "playing")
    b3.minutes(t3 + 120, 2)
    assert b3.lecteur(TV)["bloque"] == "temps"
    with pytest.raises(PermissionError):
        lancer(b3.m.async_demander(ZONE, controle=lambda _h: False))
    with pytest.raises(PermissionError):
        lancer(b3.m.async_dormir(ZONE, 0, controle=lambda _h: False))
    # Rien de bloque : pas de demande.
    b2 = creer()
    with pytest.raises(ValueError):
        lancer(b2.m.async_demander(ZONE))
    b = creer(profil={"budget": {"semaine": 1, "weekend": 1}})
    t0 = b.horloge.t
    b.publier(t0 + 60, TV, "playing")
    b.minutes(t0 + 120, 2)
    lancer(b.m.async_demander(ZONE))
    lancer(b.m.async_repondre(ZONE, False))
    assert b.lecteur(TV)["demande"]["reponse"] == "refusee" and b.journal()[0] == ("demande refusée", "depuis l’écran", [TV], False)
    with pytest.raises(ValueError):
        lancer(b.m.async_demander(ZONE))
    with pytest.raises(ValueError):
        lancer(b.m.async_repondre(ZONE, True))
    # Le lendemain : une demande de nouveau possible ; sans reponse, elle expire au bout de trente minutes.
    b.tic(paris(7, 30, jour=14))
    b.publier(paris(7, 31, jour=14), TV, "playing")
    b.minutes(paris(7, 32, jour=14), 2)
    lancer(b.m.async_demander(ZONE))
    b.tic(paris(8, 4, jour=14))
    assert b.lecteur(TV)["demande"] is None and ("demande expirée", "", [TV], False) in b.journal()
    # Pas de demande au coucher : l'ecran reviendra demain.
    b.tic(paris(21, 0, jour=14))
    assert b.lecteur(TV)["bloque"] == "coucher"
    with pytest.raises(ValueError):
        lancer(b.m.async_demander(ZONE))


def test_l_etat_se_lit_sous_les_droits_du_compte_et_le_profil_dit_ses_appareils(creer):
    b = creer()
    e = b.etat()
    assert sorted(e["lecteurs"]) == sorted([OFF, HACS, TV])
    assert e["profils"][ZONE]["nom"] == "Lino" and e["profils"][ZONE]["zone"] == ZONE and e["profils"][ZONE]["actif"] is True
    assert e["profils"][ZONE]["appareils"] == [
        {"entite": OFF, "ajoute": False, "ecran": False, "parler": PARLER, "annonces": ANNONCES, "hacs": HACS},
        {"entite": TV, "ajoute": True, "ecran": True, "parler": None, "annonces": None, "hacs": None},
    ], "un appareil physique par ligne : l'Echo une fois, avec ses soeurs ; l'Apple TV ajoutee"
    assert e["demarre"] is True and e["simulation"] is False and isinstance(e["maintenant"], float)
    restreint = types.SimpleNamespace(is_admin=False, permissions=types.SimpleNamespace(check_entity=lambda h, _droit: h != TV))
    e2 = b.etat(restreint)
    assert sorted(e2["lecteurs"]) == sorted([OFF, HACS]) and [a["entite"] for a in e2["profils"][ZONE]["appareils"]] == [OFF]


# ── Le redemarrage et la fenetre de demarrage (spec 5.7 ; ADR 0198, D1) ─────

def test_l_etat_relu_reprend_et_le_temps_de_l_arret_ne_compte_pas(creer, horloge):
    jour = datetime.fromtimestamp(paris(17, 40), PARIS).date().isoformat()
    etat = {ZONE: {"jour": jour, "ecran_s": {TV: 80 * 60}, "bonus_min": 0, "leve_jusqua": None, "demande": None, "refus_jour": None,
                   "ramenes": [], "rallumages": [], "preventions": {}, "dormir": None, "coupures": {}}}
    etats = {**maison()[2], TV: FauxEtat("playing", {"friendly_name": "Apple TV Chambre", "supported_features": 450487, "device_class": "tv"})}
    b = creer(etat=etat, etats=etats)
    assert b.lecteur(TV)["ecran"]["utilise_s"] == 80 * 60, "les compteurs reprennent"
    b.minutes(paris(17, 41), 2)
    assert b.lecteur(TV)["ecran"]["utilise_s"] == 80 * 60 + 120, "allumee depuis la fin de la fenetre (17:40) : deux minutes, pas le temps de l'arret"


def test_pendant_la_fenetre_de_demarrage_rien_ne_se_coupe_ni_se_ramene_puis_la_maison_regarde_ou_elle_en_est(creer):
    jour = datetime.fromtimestamp(paris(17, 40), PARIS).date().isoformat()
    etat = {ZONE: {"jour": jour, "ecran_s": {TV: 90 * 60}, "bonus_min": 0, "leve_jusqua": None, "demande": None, "refus_jour": None,
                   "ramenes": [], "rallumages": [], "preventions": {}, "dormir": None, "coupures": {}}}
    etats = {**maison()[2], TV: FauxEtat("playing", {"friendly_name": "Apple TV Chambre", "supported_features": 450487, "device_class": "tv"}),
             HACS: FauxEtat("playing", {"friendly_name": "Echo Dot Chambre Lino", "supported_features": 318399, "volume_level": .7})}
    b = creer(etat=etat, etats=etats, fenetre=True)
    assert b.appels() == [], "au demarrage, un etat relu n'est pas un geste"
    b.publier(paris(17, 38, 30), HACS, "playing", {"volume_level": .8})
    assert b.appels() == [], "pendant la fenetre non plus"
    b.attendre(paris(17, 40, 5))
    assert b.appels("media_player", "turn_off") == [("media_player", "turn_off", {"entity_id": TV})], "la fenetre fermee : la coupure due pendant l'arret s'execute"
    assert b.appels("media_player", "volume_set") == [("media_player", "volume_set", {"entity_id": HACS, "volume_level": .4})], "et ce qui depasse redescend"


def test_un_fichier_abime_repart_a_vide_et_le_dit(creer, caplog):
    caplog.set_level(logging.ERROR)
    b = creer(etat={ZONE: "n'importe quoi"})
    assert b.m.etats[ZONE]["ecran_s"] == {}
    b2 = creer(etat=[1, 2])
    assert b2.m.etats[ZONE]["ecran_s"] == {}


def test_un_demarrage_rate_se_dit_et_n_ecrit_rien(creer, monkeypatch):
    b = creer()
    assert b.etat()["demarre"] is True
    b.m.demarrage = False
    ecritures = b.depot.ecritures
    b.publier(paris(17, 41), HACS, "playing", {"volume_level": .7})
    assert b.depot.ecritures == ecritures, "rien ne s'ecrit apres un demarrage rate"
    assert b.etat()["demarre"] is False


# ── La configuration, le rechargement, l'arret ──────────────────────────────

def test_enregistrer_pose_le_patch_recense_et_un_profil_retire_perd_son_etat(creer):
    b = creer()
    cfg = lancer(b.m.async_enregistrer({"profils": {ZONE: {"volume_max": 60}}}))
    assert cfg["profils"][ZONE]["volume_max"] == 60 and b.m.cfg["profils"][ZONE]["volume_max"] == 60
    b.publier(paris(17, 41), HACS, "playing", {"volume_level": .7})
    assert b.appels("media_player", "volume_set")[-1][2]["volume_level"] == .6
    with pytest.raises(ValueError):
        lancer(b.m.async_enregistrer({"profils": {ZONE: {"volume_max": 200}}}))
    assert b.m.cfg["profils"][ZONE]["volume_max"] == 60, "un patch refuse ne change rien"
    lancer(b.m.async_enregistrer({"profils": {ZONE: None}}))
    assert b.m.membres == {} and b.m.etats == {} and b.ecoutees() == []
    assert b.depot.contenu == {}
    # Le rechargement apres un import : un patch vide relit la cle.
    lancer(b.m.store.async_set_shared("loggia_enfant", {"profils": {"salon": {"nom": "Salon", "zone": "salon", "ajouts": [TV]}}}))
    lancer(b.m.async_enregistrer({}))
    assert sorted(b.m.membres["salon"]) == [TV]


def test_l_arret_retire_les_ecoutes_et_ecrit_ce_qui_attend(creer):
    b = creer()
    b.publier(paris(17, 41), TV, "playing")
    b.tic(paris(17, 42))
    ecritures = b.depot.ecritures
    b.m.async_arreter()
    b.hass.executer()
    assert b.ecoutees() == [] and b.tics == [] and all(e["annule"] for e in b.rdv.poses)
    assert not any(e["type"] == "mobile_app_notification_action" for e in b.hass.bus.ecoutes), "le bus aussi"
    assert b.depot.ecritures >= ecritures
    assert b.depot.contenu[ZONE]["ecran_s"][TV] == 60


# ── La surete (spec 8) et le cablage ───────────────────────────────────────

def test_le_module_ne_connait_ni_turn_on_ni_media_play_ni_volume_up():
    src = (COMPOSANT / "enfant.py").read_text(encoding="utf-8")
    # `is_volume_muted`, l'attribut lu, porte le mot du service : c'est le service entre guillemets qui est interdit.
    for mot in ("turn_on", "media_play\"", "media_play'", "volume_up", "toggle", "media_play_pause", "\"volume_mute\""):
        assert mot not in src, mot + " : la maison ne monte jamais rien et n'allume jamais rien"
    assert '"volume_set"' in src and '"turn_off"' in src and '"media_pause"' in src and '"media_stop"' in src
    # Les services sont appeles par le module lui-meme, avec son contexte, jamais par `agir` : la main de l'enfant
    # sur la barre gelerait precisement l'Echo que la regle doit ramener (E11).
    assert "regles.agir(" not in src and "Context()" in src
    assert re.search(r'^MSG_\w+ = "', src, re.M) and 'TITRE = "Loggia — mode enfant"' in src
