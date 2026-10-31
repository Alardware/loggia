"""Le moteur du chauffage : un seul chef par chauffage (chantier Chauffage, § 5).

Ce qui merite d'etre verrouille : on n'envoie un ordre que s'il differe de
l'etat de l'appareil ; un geste fait ailleurs devient une reprise en main ; le
redemarrage rattrape ce qui doit etre en vigueur ; le changement d'heure ne
saute ni ne double rien ; « Observer sans agir » calcule et n'envoie rien.

Le fuseau de Paris est ecrit ICI, a la main (`FuseauParis`) : la machine de
developpement, sous Windows, n'a pas de base des fuseaux, et ces tests doivent
y tourner comme en CI. Ses bascules sont celles de l'Union europeenne.
"""
from __future__ import annotations

import asyncio
import sys
import types
from datetime import datetime, timedelta, timezone, tzinfo

import pytest

from conftest import FauxStore, charger

UTC = timezone.utc


class FuseauParis(tzinfo):
    """Europe/Paris sans base des fuseaux : UTC+1, et UTC+2 du dernier
    dimanche de mars au dernier dimanche d'octobre, a 01:00 UTC (PEP 495)."""

    @staticmethod
    def _bascules(annee):
        def dernier_dimanche(mois):
            d = datetime(annee, mois, 31)
            return d - timedelta(days=(d.weekday() + 1) % 7)
        return dernier_dimanche(3).replace(hour=1), dernier_dimanche(10).replace(hour=1)

    def utcoffset(self, dt):
        ete, hiver = self._bascules(dt.year)
        naif = dt.replace(tzinfo=None)
        heure = timedelta(hours=1)
        if naif < ete + heure:
            return heure
        if naif < ete + 2 * heure:
            return heure if dt.fold == 0 else 2 * heure
        if naif < hiver + heure:
            return 2 * heure
        if naif < hiver + 2 * heure:
            return 2 * heure if dt.fold == 0 else heure
        return heure

    def dst(self, dt):
        return self.utcoffset(dt) - timedelta(hours=1)

    def tzname(self, dt):
        return "CEST" if self.dst(dt) else "CET"

    def fromutc(self, dt):
        ete, hiver = self._bascules(dt.year)
        naif = dt.replace(tzinfo=None)
        if ete <= naif < hiver:
            return (naif + timedelta(hours=2)).replace(tzinfo=self)
        local = (naif + timedelta(hours=1)).replace(tzinfo=self)
        if hiver <= naif < hiver + timedelta(hours=1):
            return local.replace(fold=1)
        return local


PARIS = FuseauParis()


def paris(annee, mois, jour, h, mi=0, fold=0):
    """Une heure murale de Paris, en instant UTC."""
    return datetime(annee, mois, jour, h, mi, tzinfo=PARIS, fold=fold).astimezone(UTC)


# Lundi 12 octobre 2026, 07:00 a Paris.
LUNDI_0700 = paris(2026, 10, 12, 7)


def lancer(coro):
    return asyncio.run(coro)


class FauxEtat:
    def __init__(self, state, attributes=None):
        self.state = state
        self.attributes = attributes or {}


class FauxEtats:
    def __init__(self, table):
        self.table = dict(table)

    def get(self, haid):
        return self.table.get(haid)

    def async_entity_ids(self, domaine):
        return [e for e in self.table if e.startswith(domaine + ".")]


class FauxServices:
    def __init__(self):
        self.appels = []
        self.contextes = []
        self.refus = 0

    async def async_call(self, domaine, service, data, blocking=False, context=None):
        if self.refus:
            self.refus -= 1
            raise RuntimeError("refuse par l'integration")
        self.appels.append((domaine, service, dict(data)))
        self.contextes.append(context)


class FauxHass:
    def __init__(self, etats, temperature_unit="°C"):
        self.states = FauxEtats(etats)
        self.services = FauxServices()
        self.taches = []
        self.config = types.SimpleNamespace(units=types.SimpleNamespace(temperature_unit=temperature_unit),
                                            time_zone="Europe/Paris")

    def async_create_task(self, coro):
        self.taches.append(coro)
        return coro

    def executer(self):
        taches, self.taches = self.taches, []
        for coro in taches:
            lancer(coro)

    def abandonner(self):
        taches, self.taches = self.taches, []
        for coro in taches:
            coro.close()


class Entree:
    def __init__(self, entity_id, ident, platform="mqtt", unique_id=None, original_name=None,
                 device_id=None, disabled_by=None, entity_category=None):
        self.entity_id = entity_id
        self.id = ident
        self.platform = platform
        self.unique_id = unique_id
        self.original_name = original_name
        self.device_id = device_id
        self.disabled_by = disabled_by
        self.entity_category = entity_category


class FauxRegistre:
    def __init__(self, entrees):
        self.entities = {e.entity_id: e for e in entrees}


NODON = ["comfort", "eco", "frost_protection", "off", "comfort_-1", "comfort_-2"]
RAD = "select.radiateur_bureau_pilot_wire_mode"
POELE = "climate.poele"
VTH = "climate.salon_vtherm"
ATTRS_POELE = {"hvac_modes": ["off", "heat"], "min_temp": 5, "max_temp": 35}
ATTRS_VTH = {"hvac_modes": ["heat", "off"], "preset_modes": ["none", "frost", "eco", "comfort"]}
REGISTRE = [
    Entree(RAD, "id-rad", unique_id="0x00158d0001a2b3c4_pilot_wire_mode_zigbee2mqtt", device_id="d-rad"),
    Entree("switch.radiateur_bureau", "id-rad-sw", device_id="d-rad"),
    Entree(POELE, "id-poele", platform="maestro_mcz", unique_id="mcz-1", device_id="d-poele"),
    Entree(VTH, "id-vth", platform="versatile_thermostat", unique_id="vth-1", device_id="d-vth"),
]
SEMAINE = {"lun": [{"h": "06:30", "mode": "confort"}, {"h": "08:30", "mode": "eco"},
                   {"h": "18:00", "mode": "confort"}, {"h": "22:30", "mode": "eco"}],
           "mar": [], "mer": [], "jeu": [], "ven": [], "sam": [], "dim": []}


def chauffage(entite, fam, planning=True, **extra):
    c = {"entite": entite, "famille": fam, "planning": planning, "semaine": SEMAINE,
         "temperatures": {"confort": 20, "eco": 17, "hors_gel": 7}, "fenetre": "arret"}
    c.update(extra)
    return c


def config(*paires, maison=None, simulation=False):
    return {"chauffages": dict(paires), "maison": maison or {"mode": "planning"},
            "simulation": {"actif": simulation}}


def etats(rad="eco", poele="heat", poele_t=17, vth="heat", vth_preset="eco", sw="on"):
    return {RAD: FauxEtat(rad, {"options": NODON, "friendly_name": "Radiateur bureau"}),
            "switch.radiateur_bureau": FauxEtat(sw),
            POELE: FauxEtat(poele, {**ATTRS_POELE, "temperature": poele_t}),
            VTH: FauxEtat(vth, {**ATTRS_VTH, "preset_mode": vth_preset})}


@pytest.fixture
def module():
    return charger("chauffage")


@pytest.fixture
def regles_module():
    return charger("regles")


@pytest.fixture
def rdv(monkeypatch):
    """Les rendez-vous poses : le minuteur du prochain changement et les relances."""
    ev = sys.modules["homeassistant.helpers.event"]
    poses = {"point": [], "plus_tard": []}
    monkeypatch.setattr(ev, "async_track_point_in_time",
                        lambda hass, rappel, quand: poses["point"].append((rappel, quand)) or (lambda: None))
    monkeypatch.setattr(ev, "async_call_later",
                        lambda hass, delai, rappel: poses["plus_tard"].append((delai, rappel)) or (lambda: None))
    return poses


@pytest.fixture
def creer(module, store_module, regles_module):
    faits = []

    def fabrique(cfg=None, table=None, reprises=None, maintenant=LUNDI_0700, registre=REGISTRE,
                 temperature_unit="°C"):
        magasin = store_module.LoggiaStore.__new__(store_module.LoggiaStore)
        magasin._store = FauxStore({"users": {}, "shared": {"loggia_chauffage": cfg or {}}, "migrated": True})
        magasin._ancien = FauxStore(None)
        magasin._data = None
        magasin._lock = asyncio.Lock()

        m = module.LoggiaChauffage.__new__(module.LoggiaChauffage)
        m.hass = FauxHass(etats() if table is None else table, temperature_unit)
        m.store = magasin
        m.regles = regles_module.Regles(m.hass, magasin)
        m.regles._depot = FauxStore(None)
        m.cfg = lancer(m.async_config())
        m.reprises = dict(reprises or {})
        m.fenetres = {}
        m.fuseau = PARIS
        m.horloge = maintenant
        m._horloge = lambda: m.horloge
        m._pilotes, m._ordres, m._miens, m._notes, m._relances = {}, {}, [], {}, {}
        # La verification de chaque ordre parti (relecture finale du 12/10, point 1).
        m._verifications = {}
        # Le pas revele, les ordres defaits, les programmes ecoutes (30/10).
        m._pas, m._defaits, m._programmes = {}, {}, {}
        m._minuteur = m._ecoute = m._au_demarrage = None
        m._arrete = False
        m._depot = FauxStore(None)
        m._registre_dit = False
        m._verrou = asyncio.Lock()
        faux = FauxRegistre(list(registre))
        m._registre = lambda: faux
        m._reabonner()
        faits.append(m)
        return m

    yield fabrique
    for m in faits:
        m.hass.abandonner()


def journal(m):
    return [(e["regle"], e["quoi"], e["motif"], e["detail"]) for e in lancer(m.regles.journal(module="chauffage"))]


class Evenement:
    def __init__(self, entite, vieux, neuf, contexte=None):
        Context = sys.modules["homeassistant.core"].Context
        self.data = {"entity_id": entite, "old_state": vieux, "new_state": neuf}
        self.context = contexte or Context()


# ── Le temps ────────────────────────────────────────────────────────────────

def test_l_heure_murale_est_celle_de_la_maison(module):
    assert module.heure_murale(LUNDI_0700, PARIS) == (0, 420)
    assert module.heure_murale(paris(2026, 10, 18, 23, 59), PARIS) == (6, 1439)


def test_le_prochain_instant_d_une_heure_murale(module):
    assert module.instant_de(0, 510, LUNDI_0700, PARIS) == paris(2026, 10, 12, 8, 30)
    # Deja passee aujourd'hui : lundi prochain.
    assert module.instant_de(0, 390, LUNDI_0700, PARIS) == paris(2026, 10, 19, 6, 30)
    assert module.instant_de(0, 420, LUNDI_0700, PARIS) == paris(2026, 10, 19, 7, 0), "strictement apres"


def test_un_0230_qui_n_existe_pas_tombe_a_0300(module):
    """Le 28 mars 2027, on passe de 02:00 a 03:00 : 02:30 n'existe pas."""
    samedi = paris(2027, 3, 27, 22)
    assert module.instant_de(6, 150, samedi, PARIS) == paris(2027, 3, 28, 3, 0)


def test_un_0230_qui_existe_deux_fois_s_applique_une_fois(module):
    """Le 25 octobre 2026, 02:00-03:00 passe deux fois : la premiere compte ;
    deja passee, la seconde — l'appareil y est deja, rien ne repart."""
    samedi = paris(2026, 10, 24, 22)
    premier = module.instant_de(6, 150, samedi, PARIS)
    assert premier == datetime(2026, 10, 25, 0, 30, tzinfo=UTC)
    entre_deux = datetime(2026, 10, 25, 1, 15, tzinfo=UTC)          # 02:15, second passage
    assert module.instant_de(6, 165, entre_deux, PARIS) == datetime(2026, 10, 25, 1, 45, tzinfo=UTC)
    apres = datetime(2026, 10, 25, 1, 31, tzinfo=UTC)               # 02:31, second passage
    assert module.instant_de(6, 150, apres, PARIS) == paris(2026, 11, 1, 2, 30), "pas deux fois le meme jour"


def test_au_second_passage_d_une_heure_repetee_le_planning_ne_recule_pas(module):
    """Le 25 octobre 2026, 02:00-03:00 passe deux fois. Au second passage,
    l'horloge rendue est la derniere minute que le premier a deja vecue (02:59) :
    un changement de 02:45, deja applique, n'est pas defait par un « 02:15 »."""
    premier = datetime(2026, 10, 25, 0, 15, tzinfo=UTC)             # 02:15, premier passage
    assert module.heure_murale(premier, PARIS) == (6, 135)
    second = datetime(2026, 10, 25, 1, 15, tzinfo=UTC)              # 02:15, second passage
    assert module.heure_murale(second, PARIS) == (6, 179)
    debut = datetime(2026, 10, 25, 1, 0, tzinfo=UTC)                # 02:00, second passage
    fin = datetime(2026, 10, 25, 1, 59, 59, tzinfo=UTC)             # 02:59:59, second passage
    assert module.heure_murale(debut, PARIS) == module.heure_murale(fin, PARIS) == (6, 179)
    repart = datetime(2026, 10, 25, 2, 0, tzinfo=UTC)               # 03:00 : l'horloge repart
    assert module.heure_murale(repart, PARIS) == (6, 180)
    veille = datetime(2026, 10, 24, 22, 0, tzinfo=UTC)              # 00:00 du dimanche
    lues = [module.heure_murale(veille + timedelta(minutes=k), PARIS) for k in range(6 * 60)]
    assert lues == sorted(lues), "d'une minute a la suivante, l'horloge rendue ne recule jamais"


def test_un_fuseau_illisible_retombe_sur_l_utc(module):
    hass = types.SimpleNamespace(config=types.SimpleNamespace(time_zone="Nulle/Part"))
    assert module.fuseau_de(hass) is timezone.utc
    assert module.fuseau_de(types.SimpleNamespace()) is timezone.utc


# ── Un ordre, seulement s'il differe ────────────────────────────────────────

def test_le_planning_met_le_radiateur_en_confort(creer):
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote"))))
    lancer(m.async_evaluer())
    assert m.hass.services.appels == [("select", "select_option", {"entity_id": [RAD], "option": "comfort"})]
    assert journal(m)[0] == ("planning", "Confort", "planning 06:30", "")


def test_un_appareil_deja_dans_le_mode_ne_recoit_rien(creer):
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote"))), etats(rad="comfort"))
    lancer(m.async_evaluer())
    assert m.hass.services.appels == []
    assert journal(m) == []


def test_jamais_d_ordre_en_double_pendant_que_l_appareil_repond(creer):
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote"))))
    lancer(m.async_evaluer())
    lancer(m.async_evaluer())
    assert len(m.hass.services.appels) == 1, "l'appareil n'a pas encore repondu : rien ne repart"
    m.horloge = LUNDI_0700 + timedelta(seconds=91)
    lancer(m.async_evaluer())
    assert len(m.hass.services.appels) == 2, "passe la stabilisation, l'ordre se redonne"


def test_un_planning_eteint_ne_commande_rien(creer):
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote", planning=False))))
    lancer(m.async_evaluer())
    assert m.hass.services.appels == [] and m.pilote(RAD) is False


def test_le_poele_recoit_sa_consigne_et_le_vtherm_son_prereglage(creer):
    m = creer(config(("id-poele", chauffage(POELE, "thermostat")), ("id-vth", chauffage(VTH, "vtherm"))),
              etats(poele="off"))
    lancer(m.async_evaluer())
    assert sorted(m.hass.services.appels) == [
        ("climate", "set_hvac_mode", {"entity_id": [POELE], "hvac_mode": "heat"}),
        ("climate", "set_preset_mode", {"entity_id": [VTH], "preset_mode": "comfort"}),
        ("climate", "set_temperature", {"entity_id": [POELE], "temperature": 20.0})]
    # Le poele s'allume AVANT d'etre regle : le tri ci-dessus ne le dirait pas.
    assert [a[1] for a in m.hass.services.appels if a[2]["entity_id"] == [POELE]] == ["set_hvac_mode", "set_temperature"]


def test_un_appareil_injoignable_n_est_pas_commande_et_le_journal_le_dit_une_fois(creer):
    table = etats()
    table[RAD] = FauxEtat("unavailable", {"options": NODON})
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote"))), table)
    lancer(m.async_evaluer())
    lancer(m.async_evaluer())
    assert m.hass.services.appels == []
    assert journal(m) == [("planning", "retenu", "planning 06:30", "appareil injoignable")]
    # Il revient : on recalcule et on applique.
    m._sur_etat(Evenement(RAD, table[RAD], FauxEtat("eco", {"options": NODON})))
    m.hass.states.table[RAD] = FauxEtat("eco", {"options": NODON})
    m.hass.executer()
    assert m.hass.services.appels == [("select", "select_option", {"entity_id": [RAD], "option": "comfort"})]


def test_observer_sans_agir_calcule_note_et_n_envoie_rien(creer):
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote")), simulation=True))
    lancer(m.async_evaluer())
    lancer(m.async_evaluer())
    assert m.hass.services.appels == []
    lignes = lancer(m.regles.journal(module="chauffage"))
    assert len(lignes) == 1, "une ligne par decision, pas une par evenement"
    assert lignes[0]["simule"] is True and lignes[0]["quoi"] == "Confort"


def test_un_ordre_refuse_se_retente_une_fois_une_minute_plus_tard(creer, rdv):
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote"))))
    m.hass.services.refus = 2
    lancer(m.async_evaluer())
    # Le journal differe aussi son ecriture (20 s) : on ne regarde que les relances.
    relances = [r for d, r in rdv["plus_tard"] if d == 60]
    assert len(relances) == 1
    ligne = lancer(m.regles.journal(module="chauffage"))[0]
    assert ligne.get("echec") is True and ligne["detail"] == "commande refusee par Home Assistant"
    relances[0](None)
    m.hass.executer()
    assert len([r for d, r in rdv["plus_tard"] if d == 60]) == 1, "une seule relance : ensuite on attend"
    assert lancer(m.regles.journal(module="chauffage"))[0]["detail"] == "nouvel échec, on attend"
    # L'evenement suivant redonne sa chance, et l'ordre part.
    lancer(m.async_evaluer())
    assert m.hass.services.appels == [("select", "select_option", {"entity_id": [RAD], "option": "comfort"})]


# -- Un ordre accepte, jamais applique (relecture finale du 12/10, point 1) ----
#
# Home Assistant accepte un `select_option` que le module zigbee n'applique
# jamais : le journal disait « Planning · Confort », et le radiateur restait en
# Eco jusqu'au changement suivant. 95 s apres un ordre parti, le moteur regarde :
# pris, rien ; perdu, il le dit (« non confirmé ») et relance UNE fois
# l'evaluation, par la relance des ordres refuses.

CONFORT_RAD = ("select", "select_option", {"entity_id": [RAD], "option": "comfort"})


def verifications(rdv):
    """Les verifications posees, une par ordre parti, 95 s apres lui."""
    return [r for d, r in rdv["plus_tard"] if d == 95]


def lignes_de(m):
    """Le journal du moteur, du plus recent au plus ancien : (regle, quoi, motif, detail, echec)."""
    return [(e["regle"], e["quoi"], e["motif"], e["detail"], e.get("echec", False))
            for e in lancer(m.regles.journal(module="chauffage"))]


def test_un_ordre_perdu_se_dit_non_confirme_et_se_relance_une_fois(creer, rdv):
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote"))))        # le module reste en Eco
    lancer(m.async_evaluer())
    assert m.hass.services.appels == [CONFORT_RAD] and len(verifications(rdv)) == 1
    m.horloge = LUNDI_0700 + timedelta(seconds=95)
    verifications(rdv)[0](None)
    m.hass.executer()
    assert m.hass.services.appels == [CONFORT_RAD, CONFORT_RAD], "une nouvelle tentative"
    assert lignes_de(m) == [("planning", "Confort", "planning 06:30", "", False),
                            ("planning", "Confort", "planning 06:30", "non confirmé", True),
                            ("planning", "Confort", "planning 06:30", "", False)]
    # La nouvelle tentative a sa verification ; perdue elle aussi, on le dit, et on attend.
    assert len(verifications(rdv)) == 2
    m.horloge += timedelta(seconds=95)
    verifications(rdv)[1](None)
    m.hass.executer()
    assert m.hass.services.appels == [CONFORT_RAD, CONFORT_RAD], "une seule nouvelle tentative"
    assert lignes_de(m)[0] == ("planning", "Confort", "planning 06:30", "non confirmé · nouvel échec, on attend", True)
    assert len(verifications(rdv)) == 2, "rien de plus ne se programme"
    # L'evenement suivant redonne sa chance, et l'ordre repart.
    lancer(m.async_evaluer())
    assert m.hass.services.appels == [CONFORT_RAD] * 3


def test_un_ordre_pris_ne_repart_pas(creer, rdv):
    """Aucun ordre en double : a l'echeance, l'appareil est dans le mode voulu."""
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote"))))
    lancer(m.async_evaluer())
    m.hass.states.table[RAD] = FauxEtat("comfort", {"options": NODON})     # pris, sans que l'echo soit passe
    m.horloge = LUNDI_0700 + timedelta(seconds=95)
    verifications(rdv)[0](None)
    m.hass.executer()
    assert m.hass.services.appels == [CONFORT_RAD]
    assert lignes_de(m) == [("planning", "Confort", "planning 06:30", "", False)], "rien a redire"


def test_un_vtherm_qui_a_confirme_puis_s_est_mis_en_securite_n_est_pas_non_confirme(creer, rdv):
    """L'appareil a confirme l'ordre entre-temps, puis VTherm s'est mis de lui-meme en
    securite (sa sonde s'est tue) : l'ordre a ete pris, il ne se redit ni ne repart."""
    m = creer(config(("id-vth", chauffage(VTH, "vtherm"))), etats(vth_preset="eco"))
    lancer(m.async_evaluer())
    assert m.hass.services.appels == [("climate", "set_preset_mode", {"entity_id": [VTH], "preset_mode": "comfort"})]
    eco, confort, securite = (FauxEtat("heat", {**ATTRS_VTH, "preset_mode": p}) for p in ("eco", "comfort", "safety"))
    m._sur_etat(Evenement(VTH, eco, confort, m.hass.services.contextes[0]))    # il l'a pris
    m._sur_etat(Evenement(VTH, confort, securite))                               # puis sa sonde s'est tue
    m.hass.states.table[VTH] = securite
    m.horloge = LUNDI_0700 + timedelta(seconds=95)
    verifications(rdv)[0](None)
    m.hass.executer()
    assert len(m.hass.services.appels) == 1 and [ligne[3] for ligne in lignes_de(m)] == [""]


def test_un_ordre_defait_a_la_main_ne_se_relance_pas(creer, rdv):
    """Pris, puis change a la main : la reprise en main a pris la suite de l'ordre."""
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote"))))
    confort_confirme_puis_eco_a_la_main(m, timedelta(seconds=40))
    m.horloge = LUNDI_0700 + timedelta(seconds=95)
    verifications(rdv)[0](None)
    m.hass.executer()
    assert m.hass.services.appels == [CONFORT_RAD] and m.reprises["id-rad"]["mode"] == "eco"
    assert "non confirmé" not in [ligne[3] for ligne in lignes_de(m)]


def test_un_ordre_remplace_ne_se_verifie_plus(creer, rdv):
    """Une fenetre s'ouvre avant l'echeance : l'Arret part, sa verification remplace celle
    du Confort — qui, tombee quand meme, ne dit rien et ne relance rien."""
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote"))))
    lancer(m.async_evaluer())
    m.horloge = LUNDI_0700 + timedelta(seconds=30)
    lancer(m.async_fenetre(RAD, "Bureau", True))
    arret = ("select", "select_option", {"entity_id": [RAD], "option": "off"})
    assert m.hass.services.appels == [CONFORT_RAD, arret] and len(verifications(rdv)) == 2
    m.hass.states.table[RAD] = FauxEtat("off", {"options": NODON})
    for i, echeance in enumerate((95, 125)):
        m.horloge = LUNDI_0700 + timedelta(seconds=echeance)
        verifications(rdv)[i](None)
        m.hass.executer()
    assert m.hass.services.appels == [CONFORT_RAD, arret]
    assert "non confirmé" not in [ligne[3] for ligne in lignes_de(m)]


@pytest.mark.parametrize("garde", ["arret", "observation"])
def test_arrete_ou_en_observation_avant_l_echeance_rien_ne_se_verifie(creer, rdv, garde):
    """Les gardes d'arret (un rechargement de l'integration) et « Observer sans agir », qui
    n'envoie rien : la verification se retire, et tombee quand meme elle ne fait rien."""
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote"))))
    lancer(m.async_evaluer())
    [verification] = verifications(rdv)
    if garde == "arret":
        m.async_arreter()
    else:
        lancer(m.async_enregistrer({"simulation": {"actif": True}}))
    assert m._verifications == {}, "la verification est retiree"
    avant = lignes_de(m)
    m.horloge = LUNDI_0700 + timedelta(seconds=95)
    verification(None)
    m.hass.executer()
    assert m.hass.services.appels == [CONFORT_RAD], "rien ne repart"
    assert lignes_de(m) == avant, "rien ne se dit"


def test_sans_ordre_parti_rien_ne_se_verifie(creer, rdv):
    """« Observer sans agir » n'envoie rien, donc ne verifie rien ; un ordre refuse a sa
    relance d'une minute (§ 5.6), pas de verification."""
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote")), simulation=True))
    lancer(m.async_evaluer())
    assert m.hass.services.appels == [] and verifications(rdv) == []
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote"))))
    m.hass.services.refus = 1
    lancer(m.async_evaluer())
    assert verifications(rdv) == [] and [d for d, _ in rdv["plus_tard"]].count(60) == 1


def test_une_reprise_echue_rend_la_main_au_planning(creer):
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote"))), etats(rad="eco"))
    m.reprises["id-rad"] = {"mode": "eco", "temperature": None, "fin": paris(2026, 10, 12, 6, 50).isoformat(),
                            "depuis": paris(2026, 10, 12, 6).isoformat(), "par": None}
    lancer(m.async_evaluer())
    assert m.reprises == {}
    assert m.hass.services.appels == [("select", "select_option", {"entity_id": [RAD], "option": "comfort"})]
    assert ("main", "reprendre le planning", "fin de la reprise en main", "") in journal(m)


def poele_sous_fenetre(creer, posee, fenetre="eco"):
    """Un poele laisse a la temperature `posee` a la main (une reprise sans
    mode), puis une fenetre s'ouvre dans sa piece : le moteur a juge."""
    m = creer(config(("id-poele", chauffage(POELE, "thermostat", fenetre=fenetre))), etats(poele_t=posee))
    m.reprises["id-poele"] = {"mode": None, "temperature": float(posee), "fin": None,
                              "depuis": LUNDI_0700.isoformat(), "par": None}
    m.fenetres[POELE] = {"salon"}
    lancer(m.async_evaluer())
    return m


def test_la_fenetre_ne_releve_pas_une_consigne_posee_a_la_main(creer):
    """15 degres poses a la main sont deja plus bas que l'Eco (17) : `mode_voulu`
    ne compare que des modes, et une reprise sans mode laisse la parole a la
    fenetre. Elle ne doit pourtant jamais rechauffer."""
    m = poele_sous_fenetre(creer, 15)
    assert m.hass.services.appels == []
    assert journal(m) == []


def test_la_fenetre_baisse_une_consigne_posee_a_la_main_plus_haute_que_l_eco(creer):
    m = poele_sous_fenetre(creer, 21)
    assert m.hass.services.appels == [("climate", "set_temperature", {"entity_id": [POELE], "temperature": 17.0})]
    assert journal(m)[0][0] == "fenetre"


def test_la_fenetre_qui_coupe_eteint_aussi_un_poele_regle_a_la_main(creer):
    m = poele_sous_fenetre(creer, 15, fenetre="arret")
    assert m.hass.services.appels == [("climate", "set_hvac_mode", {"entity_id": [POELE], "hvac_mode": "off"})]


# ── Le temps qui passe : un minuteur, et le rattrapage ──────────────────────

def test_un_seul_minuteur_pour_le_prochain_changement(creer, rdv):
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote")), ("id-poele", chauffage(POELE, "thermostat"))))
    lancer(m.async_evaluer())
    assert [q for _, q in rdv["point"]] == [paris(2026, 10, 12, 8, 30)]
    # Une reprise qui finit plus tot rapproche le reveil.
    m.reprises["id-poele"] = {"mode": "eco", "temperature": None, "fin": paris(2026, 10, 12, 7, 45).isoformat(),
                              "depuis": LUNDI_0700.isoformat(), "par": None}
    assert m.prochain_reveil(LUNDI_0700) == paris(2026, 10, 12, 7, 45)


def test_a_l_heure_dite_le_changement_s_applique(creer, rdv):
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote"))), etats(rad="comfort"))
    lancer(m.async_evaluer())
    rappel, quand = rdv["point"][-1]
    m.horloge = quand
    rappel(quand)
    m.hass.executer()
    assert m.hass.services.appels == [("select", "select_option", {"entity_id": [RAD], "option": "eco"})]
    assert journal(m)[0][:3] == ("planning", "Éco", "planning 08:30")


def test_le_redemarrage_rattrape_ce_qui_doit_etre_en_vigueur(creer):
    """Une coupure a 6 h 20 ne fait pas sauter le Confort de 6 h 30 (§ 5.3)."""
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote"))), maintenant=paris(2026, 10, 12, 6, 40))
    lancer(m._async_rattraper())
    assert m.hass.services.appels == [("select", "select_option", {"entity_id": [RAD], "option": "comfort"})]
    assert journal(m)[0] == ("planning", "Confort", "planning 06:30", "rattrapage au redémarrage")


def test_le_demarrage_abandonne_une_reprise_echue_pendant_la_coupure(creer):
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote"))))
    m._depot = FauxStore({"id-rad": {"mode": "hors_gel", "fin": (LUNDI_0700 - timedelta(minutes=1)).isoformat()},
                          "id-poele": {"mode": "eco", "fin": None}})
    lancer(m._async_demarrer())
    # ASSERTION MODIFIÉE (19/10) : `programme`, un thermostat revenu à son programme.
    assert m.reprises == {"id-poele": {"mode": "eco", "temperature": None, "fin": None,
                                       "depuis": LUNDI_0700.isoformat(), "par": None, "programme": False}}
    assert m._depot.contenu == m.reprises, "le fichier est remis au propre"
    m.hass.executer()
    assert m.hass.services.appels[0] == ("select", "select_option", {"entity_id": [RAD], "option": "comfort"})


def test_les_vacances_finissent_a_leur_date(creer, rdv):
    fin = paris(2026, 10, 12, 7, 30)
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote")),
                     maison={"mode": "vacances", "vacances_fin": fin.isoformat()}), etats(rad="frost_protection"))
    lancer(m.async_evaluer())
    assert m.hass.services.appels == []
    assert m.prochain_reveil(m.horloge) == fin
    m.horloge = fin
    lancer(m.async_evaluer())
    # ASSERTION MODIFIÉE (audit du 19/10) : `par_presence`, qui a posé l'Absence.
    assert m.cfg["maison"] == {"mode": "planning", "vacances_fin": None, "absence": "eco", "vacances": "hors_gel",
                               "par_presence": False}
    assert m.hass.services.appels == [("select", "select_option", {"entity_id": [RAD], "option": "comfort"})]
    assert ("maison", "Planning", "fin des vacances", "") in journal(m)


# ── Ce que le moteur sait des chauffages, et son arret ──────────────────────

def test_l_interrupteur_d_un_module_designe_son_select(creer):
    m = creer()
    assert m.select_du_module("switch.radiateur_bureau") == RAD
    assert m.select_du_module(RAD) is None
    assert m.select_du_module("switch.inconnu") is None


def test_l_arret_retire_tout(creer, rdv):
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote"))))
    retires = []
    m._ecoute = lambda: retires.append("ecoute")
    m._minuteur = lambda: retires.append("minuteur")
    m._relances["id-rad"] = lambda: retires.append("relance")
    m._verifications["id-rad"] = lambda: retires.append("verification")
    m.async_arreter()
    # ASSERTION MODIFIEE (relecture finale du 12/10, point 1) : la verification d'un ordre
    # parti se retire aussi — un rechargement ne laisse rien relancer derriere lui.
    assert sorted(retires) == ["ecoute", "minuteur", "relance", "verification"]
    assert m._ecoute is None and m._minuteur is None and m._relances == {} and m._verifications == {}


# -- Un moteur arrete ne reprend pas vie ; une panne ne le prive de rien -----

def test_un_moteur_arrete_en_plein_appel_ne_se_reveille_pas(creer, rdv):
    """Arrete pendant que l'integration d'un radiateur repond : l'ordre en vol va
    a son terme, mais le poele n'en recoit aucun et aucun reveil ne se programme
    (sinon, apres un rechargement, l'ancien moteur commande a cote du nouveau)."""
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote")), ("id-poele", chauffage(POELE, "thermostat"))))
    services = m.hass.services

    async def scenario():
        en_vol, libere = asyncio.Event(), asyncio.Event()

        async def lent(*args, **kwargs):
            en_vol.set()
            await libere.wait()
            await FauxServices.async_call(services, *args, **kwargs)

        services.async_call = lent
        evaluation = asyncio.ensure_future(m.async_evaluer())
        await asyncio.wait_for(en_vol.wait(), 5)
        m.async_arreter()
        libere.set()
        await asyncio.wait_for(evaluation, 5)

    lancer(scenario())
    assert services.appels == [("select", "select_option", {"entity_id": [RAD], "option": "comfort"})]
    assert rdv["point"] == [], "un moteur arrete ne programme plus de reveil"


def test_apres_l_arret_plus_rien_ne_reprend_vie(creer, rdv):
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote"))))
    m.async_arreter()
    m._reabonner()
    m._programmer()
    m._relancer("id-rad")
    m._sur_reveil(None)
    m._sur_etat(Evenement(RAD, None, FauxEtat("eco", {"options": NODON})))
    for coro in (m.async_evaluer(), m._async_rattraper(), m._async_relance("id-rad"), m._async_demarrer()):
        lancer(coro)
    assert m.hass.taches == [] and m.hass.services.appels == []
    assert rdv["point"] == [] and rdv["plus_tard"] == [], "ni reveil, ni relance"
    assert m._ecoute is None and m._minuteur is None and m._au_demarrage is None and m._relances == {}


def test_ce_qui_attendait_son_tour_ne_fait_rien_une_fois_le_moteur_arrete(creer):
    """Une evaluation et une relance attendent le verrou qu'un appel lent tient ;
    arrete entre-temps, le moteur n'ecrit plus rien et ne commande plus."""
    fin = paris(2026, 10, 12, 6, 30)                # les vacances ont fini avant 07:00
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote")), ("id-poele", chauffage(POELE, "thermostat")),
                     maison={"mode": "vacances", "vacances_fin": fin.isoformat()}), etats(rad="comfort", poele_t=20))
    services = m.hass.services

    async def scenario():
        en_vol, libere = asyncio.Event(), asyncio.Event()

        async def lent(*args, **kwargs):
            en_vol.set()
            await libere.wait()
            await FauxServices.async_call(services, *args, **kwargs)

        services.async_call = lent
        tenue = asyncio.ensure_future(m._async_relance("id-rad"))      # tient le verrou pendant son appel
        await asyncio.wait_for(en_vol.wait(), 5)
        attente = [asyncio.ensure_future(m.async_evaluer()), asyncio.ensure_future(m._async_relance("id-poele"))]
        for _ in range(3):
            await asyncio.sleep(0)                  # les deux font la queue au verrou
        m.async_arreter()
        libere.set()
        await asyncio.wait_for(asyncio.gather(tenue, *attente), 5)

    lancer(scenario())
    assert services.appels == [("select", "select_option", {"entity_id": [RAD], "option": "frost_protection"})]
    assert m.cfg["maison"]["mode"] == "vacances", "un moteur arrete n'ecrit pas la fin des vacances"


def test_un_moteur_arrete_pendant_le_chargement_du_demarrage_n_ecrit_pas_le_fichier_des_reprises(creer):
    """Arrete pendant que le fichier des reprises se charge : le moteur qui le
    remplace le tient peut-etre deja, l'ancien n'y reecrit pas sa copie nettoyee."""
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote"))))
    perimee = {"id-rad": {"mode": "hors_gel", "fin": (LUNDI_0700 - timedelta(minutes=1)).isoformat()}}
    m._depot = FauxStore(perimee)
    chargement = m._depot.async_load

    async def scenario():
        en_vol, libere = asyncio.Event(), asyncio.Event()

        async def lent():
            en_vol.set()
            await libere.wait()
            return await chargement()

        m._depot.async_load = lent
        demarrage = asyncio.ensure_future(m._async_demarrer())
        await asyncio.wait_for(en_vol.wait(), 5)
        m.async_arreter()
        libere.set()
        await asyncio.wait_for(demarrage, 5)

    lancer(scenario())
    assert m._depot.ecritures == 0 and m._depot.contenu == perimee, "le fichier des reprises n'est pas reecrit"


def test_une_ecriture_qui_echoue_a_la_fin_des_vacances_ne_prive_ni_du_minuteur_ni_des_autres(creer, rdv, caplog):
    fin = paris(2026, 10, 12, 6, 30)                # les vacances ont fini avant 07:00
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote")), ("id-poele", chauffage(POELE, "thermostat")),
                     maison={"mode": "vacances", "vacances_fin": fin.isoformat()}), etats(rad="comfort", poele_t=20))

    async def disque_plein(_donnees):
        raise OSError("disque plein")

    m.store._store.async_save = disque_plein
    lancer(m.async_evaluer())                       # la panne ne remonte pas
    assert {a[2]["entity_id"][0] for a in m.hass.services.appels} == {RAD, POELE}, "chaque chauffage est evalue"
    assert len(rdv["point"]) == 1, "le minuteur est reprogramme"
    assert "disque plein" in caplog.text


def test_un_chauffage_qui_echoue_n_arrete_ni_les_autres_ni_le_minuteur(creer, rdv, caplog):
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote")), ("id-poele", chauffage(POELE, "thermostat"))))
    evaluer = m._evaluer_un

    async def casse(cle, *args, **kwargs):
        if cle == "id-rad":
            raise RuntimeError("panne du radiateur")
        return await evaluer(cle, *args, **kwargs)

    m._evaluer_un = casse
    lancer(m.async_evaluer())
    assert m.hass.services.appels == [("climate", "set_temperature", {"entity_id": [POELE], "temperature": 20.0})]
    assert len(rdv["point"]) == 1 and "panne du radiateur" in caplog.text
    lancer(m._async_relance("id-rad"))              # une relance qui echoue reprogramme aussi le reveil
    assert len(rdv["point"]) == 2


def test_meme_si_l_evaluation_leve_le_minuteur_est_reprogramme(creer, rdv):
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote"))))

    def en_panne():
        raise RuntimeError("registre en panne")

    m._entrees_par_id = en_panne
    with pytest.raises(RuntimeError):
        lancer(m.async_evaluer())
    assert len(rdv["point"]) == 1, "le reveil est reprogramme quoi qu'il arrive"


def test_les_chauffages_pilotes_se_connaissent_des_le_demarrage(creer, monkeypatch):
    """La regle des fenetres et la presence demandent `pilote` pendant que Home
    Assistant demarre : la reponse n'attend pas le rattrapage."""
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote")),
                     ("id-poele", chauffage(POELE, "thermostat", planning=False))))
    m._pilotes, m._ecoute = {}, None                # un moteur qu'on vient de construire
    attendus = []
    monkeypatch.setattr(sys.modules["homeassistant.helpers.start"], "async_at_started",
                        lambda hass, rappel: attendus.append(rappel) or (lambda: None))
    lancer(m._async_demarrer())
    assert len(attendus) == 1 and m.hass.services.appels == [], "le rattrapage attend la fin du demarrage"
    assert m.pilote(RAD) is True and m.pilote(POELE) is False
    assert m._ecoute is None, "on ne s'abonne qu'au rattrapage"
    lancer(attendus[0](m.hass))
    assert m._ecoute is not None
    assert m.hass.services.appels == [("select", "select_option", {"entity_id": [RAD], "option": "comfort"})]


def test_en_observation_le_moteur_n_est_le_chef_de_personne(creer):
    """Observer sans agir : le moteur calcule et note, rien ne part. S'il se disait
    chef, la regle des fenetres et la presence lui laisseraient les chauffages au
    planning, et plus rien ne couperait pendant les jours d'observation."""
    paires = (("id-rad", chauffage(RAD, "fil_pilote")), ("id-poele", chauffage(POELE, "thermostat", planning=False)))
    reel, observe = creer(config(*paires)), creer(config(*paires, simulation=True))
    assert reel.pilote(RAD) is True and reel.pilote(POELE) is False, "le planning allume fait le chef"
    assert observe.pilote(RAD) is False and observe.pilote(POELE) is False, "mais pas en observation"


# -- Un demarrage rate a moitie (relecture finale du 12/10, point 3) -----------
#
# `_recenser` nomme les chauffages pilotes AVANT le chargement des reprises. Si
# ce chargement levait, `pilote()` restait vrai — la regle des fenetres et la
# presence laissaient les radiateurs au moteur — alors qu'il n'etait abonne a rien.

def demarrage_rate(m, regles_module, monkeypatch):
    """Le vrai demarrage (`regles.demarrer`), le fichier des reprises illisible. Rend
    ce qui s'est pose : les abonnements, les rattrapages attendus."""
    poses = {"abonnements": [], "rattrapages": []}
    monkeypatch.setattr(sys.modules["homeassistant.helpers.event"], "async_track_state_change_event",
                        lambda hass, ids, rappel: poses["abonnements"].append(list(ids)) or (lambda: None))
    monkeypatch.setattr(sys.modules["homeassistant.helpers.start"], "async_at_started",
                        lambda hass, rappel: poses["rattrapages"].append(rappel) or (lambda: None))

    async def illisible():
        raise OSError("fichier des reprises illisible")

    m._pilotes, m._ecoute = {}, None                # un moteur qu'on vient de construire
    m._depot.async_load = illisible
    regles_module.demarrer(m.hass, m, m._async_demarrer(), "chauffage")
    m.hass.executer()
    return poses


def test_un_demarrage_rate_ne_laisse_le_moteur_chef_de_rien(creer, regles_module, monkeypatch, caplog):
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote")), ("id-poele", chauffage(POELE, "thermostat"))))
    poses = demarrage_rate(m, regles_module, monkeypatch)
    assert m.pilote(RAD) is False and m.pilote(POELE) is False, "la regle des fenetres et la presence reprennent la main"
    assert poses == {"abonnements": [], "rattrapages": []} and m._ecoute is None, "abonne a rien, rien a rattraper"
    assert lancer(m.async_etat())["demarrage"] is False, "l'etat le publie"
    assert "fichier des reprises illisible" in caplog.text, "le journal de Home Assistant le dit"


def test_apres_un_demarrage_rate_rien_ne_le_rebranche_et_la_regle_des_fenetres_coupe(creer, regles_module, monkeypatch):
    """Jusqu'au prochain demarrage (un rechargement de l'integration, un redemarrage de Home
    Assistant) : ni une configuration, ni un depart, ni une demande ne le rebranchent ni ne le
    font commander ; le fichier qu'il n'a pas pu lire n'est pas ecrase. La maison, elle,
    suit encore la presence : le moteur suivant la trouvera juste."""
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote")), ("id-poele", chauffage(POELE, "thermostat"))),
              etats(rad="comfort"))
    poses = demarrage_rate(m, regles_module, monkeypatch)
    for actif in (True, False):                     # l'aller-retour par l'observation
        lancer(m.async_enregistrer({"simulation": {"actif": actif}}))
    lancer(m.async_evaluer())
    assert lancer(m.async_presence(True)) is True and m.cfg["maison"]["mode"] == "absence"
    lancer(m.async_reprendre_la_main("id-rad", mode="eco"))
    assert m.pilote(RAD) is False and poses["abonnements"] == [] and m._minuteur is None
    assert m.hass.services.appels == [] and m.reprises == {} and m._depot.ecritures == 0
    f = regle_des_fenetres(m)
    lancer(f._async_couper("Bureau"))
    assert m.hass.services.appels == [("select", "select_option", {"entity_id": [RAD], "option": "off"})]
    assert f.coupes == {"Bureau": {RAD: "comfort"}}, "la regle l'a coupe, c'est elle qui le rendra"


# ── La reprise en main ──────────────────────────────────────────────────────

def test_reprendre_la_main_jusqu_au_prochain_changement(creer):
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote"))), etats(rad="comfort"))
    lancer(m.async_reprendre_la_main("id-rad", mode="eco", par="u-lea", nom="Léa"))
    r = m.reprises["id-rad"]
    assert (r["mode"], r["fin"], r["par"]) == ("eco", paris(2026, 10, 12, 8, 30).isoformat(), "u-lea")
    assert m._depot.contenu["id-rad"]["mode"] == "eco", "la reprise survit a un redemarrage"
    assert m.hass.services.appels == [("select", "select_option", {"entity_id": [RAD], "option": "eco"})]
    assert m.hass.services.contextes[0].user_id == "u-lea", "l'ordre est le geste de qui l'a demande"
    assert ("main", "reprise en main", "jusqu’à 08:30", "Léa") in journal(m)
    # Le planning dit Confort a 07:00 : la reprise tient.
    lancer(m.async_evaluer())
    assert len(m.hass.services.appels) == 1


@pytest.mark.parametrize("fin,attendu", [(60, paris(2026, 10, 12, 8)), (240, paris(2026, 10, 12, 11)),
                                         ("relance", None)])
def test_les_autres_fins_d_une_reprise(creer, fin, attendu):
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote"))))
    lancer(m.async_reprendre_la_main("id-rad", mode="hors_gel", fin=fin))
    assert m.reprises["id-rad"]["fin"] == (attendu.isoformat() if attendu else None)


def test_sans_prochain_changement_une_reprise_par_defaut_dure_24_h(creer):
    """Un planning qui ne change jamais de mode n'a pas de prochain changement :
    la fin par defaut est 24 h plus tard, jamais l'absence de fin par oubli. Seule
    la demande explicite, "relance", n'a pas de fin."""
    constant = {"lun": [{"h": "06:30", "mode": "confort"}], "mar": [], "mer": [], "jeu": [], "ven": [],
                "sam": [], "dim": []}
    m = creer(config(("id-poele", chauffage(POELE, "thermostat", semaine=constant))), etats(poele_t=17))
    demain = (LUNDI_0700 + timedelta(hours=24)).isoformat()
    vieux = FauxEtat("heat", {**ATTRS_POELE, "temperature": 17})
    neuf = FauxEtat("heat", {**ATTRS_POELE, "temperature": 22})
    m.hass.states.table[POELE] = neuf
    m._sur_etat(Evenement(POELE, vieux, neuf))
    m.hass.executer()
    assert m.reprises["id-poele"]["fin"] == demain, "un geste fait ailleurs"
    lancer(m.async_reprendre_la_main("id-poele", temperature=21))
    assert m.reprises["id-poele"]["fin"] == demain, "la demande par defaut"
    lancer(m.async_reprendre_la_main("id-poele", temperature=21, fin="relance"))
    assert m.reprises["id-poele"]["fin"] is None, "demandee a Loggia, la relance reste sans fin"


# ── Une trame fausse : MCZ qui se reconnecte (25/10) ────────────────────────
# Chez lui, le 25/10 a 01:16, 04:11 et 09:30 : « reprise en main · geste fait
# ailleurs », 6 s plus tard « 0 °C » ENVOYE au poele, puis un second faux geste a
# son vrai retour. Le planning restait suspendu jusqu'au changement suivant.

TRAME_MCZ = {"current_temperature": 0, "temperature": 0, "hvac_action": "idle", "preset_mode": "unknown"}


def test_une_trame_fausse_n_est_ni_un_geste_ni_un_ordre(creer):
    m = creer(config(("id-poele", chauffage(POELE, "thermostat"))), etats(poele_t=20))
    juste = FauxEtat("heat", {**ATTRS_POELE, "temperature": 20, "preset_mode": "auto"})
    fausse = FauxEtat("heat", {**ATTRS_POELE, **TRAME_MCZ})
    m.hass.states.table[POELE] = fausse
    m._sur_etat(Evenement(POELE, juste, fausse))
    m.hass.executer()
    assert m.hass.services.appels == [], "rien n'est envoye au poele"
    assert m.reprises == {}, "la trame fausse n'est pas un geste"
    lancer(m.async_evaluer())
    assert m.hass.services.appels == [], "ni une raison de lui envoyer quoi que ce soit"
    m.hass.states.table[POELE] = juste
    m._sur_etat(Evenement(POELE, fausse, juste))
    m.hass.executer()
    assert m.reprises == {} and m.hass.services.appels == [], "son vrai retour n'est pas un geste non plus"
    assert not any(e[1] == "reprise en main" for e in journal(m))


def test_un_geste_hors_des_bornes_est_respecte_sans_etre_renvoye(creer):
    """La boucle elle-meme : une consigne lue sous le minimum de l'appareil (3 pour
    5) devenait une reprise que le moteur renvoyait, ramenee a 5 — un ordre que
    personne n'avait donne."""
    m = creer(config(("id-poele", chauffage(POELE, "thermostat"))), etats(poele_t=20))
    vieux = FauxEtat("heat", {**ATTRS_POELE, "temperature": 20})
    neuf = FauxEtat("heat", {**ATTRS_POELE, "temperature": 3})
    m.hass.states.table[POELE] = neuf
    m._sur_etat(Evenement(POELE, vieux, neuf))
    m.hass.executer()
    assert m.hass.services.appels == [], "jamais renvoyee"
    r = m.reprises["id-poele"]
    assert (r["mode"], r["temperature"]) == (None, None), "respectee comme la personne l'a laissee"


def test_reprendre_le_planning_avant_l_heure(creer):
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote"))), etats(rad="eco"))
    m.reprises["id-rad"] = {"mode": "eco", "temperature": None, "fin": None, "depuis": LUNDI_0700.isoformat(),
                            "par": None}
    lancer(m.async_rendre_au_planning("id-rad"))
    assert m.reprises == {} and m._depot.contenu == {}
    assert m.hass.services.appels == [("select", "select_option", {"entity_id": [RAD], "option": "comfort"})]


# ── Le decalage du capteur d'un thermostat (30/10) ─────────────────────────
# Chez lui, le poele lit en moyenne 1,5 °C de moins que le capteur du sejour (7
# jours, 842 releves) : Confort 20 donnait une piece a 21,5.

def test_le_decalage_corrige_ce_qui_part_et_ce_qui_se_relit(creer):
    m = creer(config(("id-poele", chauffage(POELE, "thermostat", decalage=-1.5))), etats(poele_t=17))
    lancer(m.async_evaluer())
    assert m.hass.services.appels == [("climate", "set_temperature", {"entity_id": [POELE], "temperature": 18.5})], \
        "Confort 20 pour la piece : 18,5 pour le poele"
    poele = next(c for c in lancer(m.async_etat())["chauffages"] if c["cle"] == "id-poele")
    assert poele["decalage"] == -1.5, "l'ecran montre la consigne de la piece"
    # Le poele prend l'ordre : 18,5 confirme le Confort (le decalage compte aussi la).
    m.hass.services.appels.clear()
    avant = FauxEtat("heat", {**ATTRS_POELE, "temperature": 17})
    pris = FauxEtat("heat", {**ATTRS_POELE, "temperature": 18.5})
    m.hass.states.table[POELE] = pris
    m._sur_etat(Evenement(POELE, avant, pris))
    m.hass.executer()
    assert m.reprises == {} and m.hass.services.appels == [], "son ordre confirme n'est pas un geste"
    # Puis un geste sur le poele, a 21,5 : 23 pour la piece, et rien ne repart.
    vieux = FauxEtat("heat", {**ATTRS_POELE, "temperature": 18.5})
    neuf = FauxEtat("heat", {**ATTRS_POELE, "temperature": 21.5})
    m.hass.states.table[POELE] = neuf
    m._sur_etat(Evenement(POELE, vieux, neuf))
    m.hass.executer()
    assert m.reprises["id-poele"]["temperature"] == 23.0
    assert m.hass.services.appels == [], "l'appareil est deja ou la personne l'a mis"
    # Une consigne demandee a Loggia, pour la piece : 21 → 19,5 pour le poele.
    lancer(m.async_reprendre_la_main("id-poele", temperature=21))
    assert m.hass.services.appels[-1] == ("climate", "set_temperature", {"entity_id": [POELE], "temperature": 19.5})


# ── Un ordre qui tient (30/10) ──────────────────────────────────────────────
# Chez lui, le 30/10 : 17,5 °C envoyes au poele (Confort 19, decalage -1,5), 17 lus —
# le MCZ est au degre sans le dire —, puis 19 trente secondes plus tard, remis par le
# Timer du poele. Loggia relancait, perdait encore, et ne disait rien a l'ecran.

def test_un_poele_au_degre_revele_son_pas_et_l_ordre_suivant_le_respecte(creer):
    m = creer(config(("id-poele", chauffage(POELE, "thermostat", decalage=-1.5))), etats(poele_t=17))
    lancer(m.async_evaluer())
    assert m.hass.services.appels[-1][2]["temperature"] == 18.5
    assert m._ordres["id-poele"]["envoye"] == 18.5, "la consigne partie est retenue"
    avant, pris = FauxEtat("heat", {**ATTRS_POELE, "temperature": 17}), FauxEtat("heat", {**ATTRS_POELE, "temperature": 18})
    m.hass.states.table[POELE] = pris
    m._sur_etat(Evenement(POELE, avant, pris))
    m.hass.executer()
    assert m._pas == {POELE: 1.0} and m._ordres["id-poele"]["vu"] is True, "pris a son pas : confirme"
    assert m.reprises == {}, "pas un geste"
    # L'ordre suivant part au degre (18,5 arrondi vers le haut), et se confirme.
    m.hass.services.appels.clear()
    m._ordres.clear()
    lancer(m.async_evaluer())
    assert m.hass.services.appels == [("climate", "set_temperature", {"entity_id": [POELE], "temperature": 19.0})]
    m.hass.states.table[POELE] = FauxEtat("heat", {**ATTRS_POELE, "temperature": 19})
    lancer(m.async_evaluer())
    assert len(m.hass.services.appels) == 1, "deja a 19 : rien ne repart"


def test_un_appareil_qui_annonce_son_pas_n_apprend_rien(creer):
    attrs = {**ATTRS_POELE, "target_temp_step": 0.5}
    m = creer(config(("id-poele", chauffage(POELE, "thermostat", decalage=-1.5))),
              {**etats(), POELE: FauxEtat("heat", {**attrs, "temperature": 17})})
    lancer(m.async_evaluer())
    assert m._avec_pas(POELE, attrs) == attrs and m._pas == {}


def test_avec_son_programme_allume_le_moteur_se_retient_et_reprend_quand_il_s_eteint(creer):
    table = etats(poele_t=17)
    table["switch.poele_timer"] = FauxEtat("on")
    m = creer(config(("id-poele", chauffage(POELE, "thermostat"))), table, registre=REGISTRE_TIMER)
    assert m._programmes == {"switch.poele_timer": "id-poele"}, "son Timer est ecoute"
    lancer(m.async_evaluer())
    lancer(m.async_evaluer())
    assert m.hass.services.appels == [], "chaque ordre serait defait : rien ne part"
    assert [x[:2] + x[3:] for x in lignes_de(m)] == [("planning", "retenu", "son programme commande", False)], \
        "dit une fois"
    # Son programme change la consigne : ce n'est pas un geste.
    vieux, neuf = FauxEtat("heat", {**ATTRS_POELE, "temperature": 17}), FauxEtat("heat", {**ATTRS_POELE, "temperature": 19})
    m.hass.states.table[POELE] = neuf
    m._sur_etat(Evenement(POELE, vieux, neuf))
    m.hass.executer()
    assert m.reprises == {} and m.hass.services.appels == []
    # Le Timer s'eteint : le planning reprend tout de suite.
    m.hass.states.table["switch.poele_timer"] = FauxEtat("off")
    m._sur_etat(Evenement("switch.poele_timer", FauxEtat("on"), FauxEtat("off")))
    m.hass.executer()
    assert m.hass.services.appels == [("climate", "set_temperature", {"entity_id": [POELE], "temperature": 20})]
    assert all(a[0] != "switch" for a in m.hass.services.appels), "son programme n'est jamais commande"


def test_avec_son_programme_allume_l_arret_passe_encore(creer):
    """La fenetre ouverte, l'Ete : l'Arret part, son programme ou pas."""
    table = etats(poele_t=17)
    table["switch.poele_timer"] = FauxEtat("on")
    m = creer(config(("id-poele", chauffage(POELE, "thermostat")), maison={"mode": "ete"}), table,
              registre=REGISTRE_TIMER)
    lancer(m.async_evaluer())
    assert m.hass.services.appels == [("climate", "set_hvac_mode", {"entity_id": [POELE], "hvac_mode": "off"})]


def test_un_ordre_perdu_deux_fois_se_dit_jusqu_a_ce_qu_un_ordre_tienne(creer, rdv):
    m = creer(config(("id-poele", chauffage(POELE, "thermostat"))), etats(poele_t=17))
    lancer(m.async_evaluer())
    for i in (0, 1):
        m.horloge += timedelta(seconds=95)
        verifications(rdv)[i](None)
        m.hass.executer()
    poele = next(c for c in lancer(m.async_etat())["chauffages"] if c["cle"] == "id-poele")
    assert "ordre_defait" in poele["avertissements"]
    assert (poele["defait"]["mode"], poele["defait"]["temperature"]) == (None, 17.0), "il est reste a 17"
    # Il prend enfin l'ordre : plus rien a dire.
    vieux, pris = FauxEtat("heat", {**ATTRS_POELE, "temperature": 17}), FauxEtat("heat", {**ATTRS_POELE, "temperature": 20})
    m.hass.states.table[POELE] = pris
    m._sur_etat(Evenement(POELE, vieux, pris))
    poele = next(c for c in lancer(m.async_etat())["chauffages"] if c["cle"] == "id-poele")
    assert "ordre_defait" not in poele["avertissements"] and poele["defait"] is None


def test_sans_decalage_l_etat_dit_zero(creer):
    m = creer(config(("id-poele", chauffage(POELE, "thermostat")), ("id-rad", chauffage(RAD, "fil_pilote"))))
    etat = {c["cle"]: c for c in lancer(m.async_etat())["chauffages"]}
    assert (etat["id-poele"]["decalage"], etat["id-rad"]["decalage"]) == (0.0, 0.0)


def test_une_consigne_a_la_main_pour_le_poele(creer):
    m = creer(config(("id-poele", chauffage(POELE, "thermostat"))))
    lancer(m.async_reprendre_la_main("id-poele", temperature=21.5, fin=120))
    assert m.hass.services.appels == [("climate", "set_temperature", {"entity_id": [POELE], "temperature": 21.5})]


@pytest.mark.parametrize("cle,k,code", [
    ("id-rad", {"mode": "boost"}, "chauffage_mode_inconnu"),
    ("id-rad", {"temperature": 21}, None),
    ("id-poele", {"temperature": 35}, "chauffage_temperature_hors_bornes"),
    ("fantome", {"mode": "eco"}, "chauffage_inconnu"),
    ("id-vth", {"mode": "eco"}, "chauffage_sans_planning"),
])
def test_une_reprise_impossible_se_refuse_en_nommant(creer, cle, k, code):
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote")), ("id-poele", chauffage(POELE, "thermostat")),
                     ("id-vth", chauffage(VTH, "vtherm", planning=False))))
    with pytest.raises(ValueError) as refus:
        lancer(m.async_reprendre_la_main(cle, **k))
    assert getattr(refus.value, "code", None) == code
    assert m.reprises == {} and m.hass.services.appels == []


def test_une_reprise_respecte_les_droits_et_sa_fin(creer):
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote"))))
    with pytest.raises(PermissionError):
        lancer(m.async_reprendre_la_main("id-rad", mode="eco", controle=lambda haid: False))
    for fin in ("demain", 30, True):
        with pytest.raises(ValueError):
            lancer(m.async_reprendre_la_main("id-rad", mode="eco", fin=fin))
    with pytest.raises(ValueError):
        lancer(m.async_reprendre_la_main("id-rad"))
    assert m.reprises == {}


# ── Un geste fait ailleurs ──────────────────────────────────────────────────

def test_un_geste_fait_ailleurs_devient_une_reprise_en_main(creer):
    m = creer(config(("id-poele", chauffage(POELE, "thermostat"))), etats(poele_t=17))
    vieux = FauxEtat("heat", {**ATTRS_POELE, "temperature": 17})
    neuf = FauxEtat("heat", {**ATTRS_POELE, "temperature": 22})
    m.hass.states.table[POELE] = neuf
    m._sur_etat(Evenement(POELE, vieux, neuf))
    m.hass.executer()
    r = m.reprises["id-poele"]
    assert (r["mode"], r["temperature"], r["fin"]) == (None, 22.0, paris(2026, 10, 12, 8, 30).isoformat())
    assert m.hass.services.appels == [], "on ne se bat pas : l'appareil est deja ou la personne l'a mis"
    assert ("main", "reprise en main", "jusqu’à 08:30", "geste fait ailleurs") in journal(m)


def test_notre_propre_ordre_n_est_pas_un_geste(creer):
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote"))))
    lancer(m.async_evaluer())
    ctx = m.hass.services.contextes[0]
    m._sur_etat(Evenement(RAD, FauxEtat("eco", {"options": NODON}), FauxEtat("comfort", {"options": NODON}), ctx))
    # L'echo de zigbee2mqtt arrive avec un AUTRE contexte, mais dit ce qu'on a demande.
    m.horloge = LUNDI_0700 + timedelta(minutes=5)
    m._sur_etat(Evenement(RAD, FauxEtat("eco", {"options": NODON}), FauxEtat("comfort", {"options": NODON})))
    m.hass.executer()
    assert m.reprises == {}


def test_pendant_la_stabilisation_un_etat_intermediaire_n_est_pas_un_geste(creer):
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote"))))
    lancer(m.async_evaluer())
    m.horloge = LUNDI_0700 + timedelta(seconds=30)
    m._sur_etat(Evenement(RAD, FauxEtat("eco", {"options": NODON}), FauxEtat("off", {"options": NODON})))
    assert m.hass.taches == []
    m.horloge = LUNDI_0700 + timedelta(seconds=120)
    m._sur_etat(Evenement(RAD, FauxEtat("comfort", {"options": NODON}), FauxEtat("off", {"options": NODON})))
    m.hass.states.table[RAD] = FauxEtat("off", {"options": NODON})
    m.hass.executer()
    assert m.reprises["id-rad"]["mode"] == "arret"


@pytest.mark.parametrize("confirmation", ["sous_notre_contexte", "sous_un_autre_contexte"])
def test_un_geste_apres_la_confirmation_de_l_appareil_compte_meme_dans_les_90_secondes(creer, confirmation):
    """07:00 : le planning met Confort et l'appareil le confirme. A 07:00:40 une
    personne passe en Eco : l'appareil ne se cherche plus, c'est un geste. Il n'est
    ni ignore ni defait, meme une fois les 90 secondes ecoulees."""
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote"))))
    lancer(m.async_evaluer())
    contexte = m.hass.services.contextes[0]
    confort, eco = FauxEtat("comfort", {"options": NODON}), FauxEtat("eco", {"options": NODON})
    m.hass.states.table[RAD] = confort
    m._sur_etat(Evenement(RAD, eco, confort, contexte if confirmation == "sous_notre_contexte" else None))
    m.horloge = LUNDI_0700 + timedelta(seconds=40)
    m.hass.states.table[RAD] = eco
    m._sur_etat(Evenement(RAD, confort, eco))
    m.hass.executer()
    assert m.reprises["id-rad"]["mode"] == "eco"
    m.horloge = LUNDI_0700 + timedelta(seconds=100)
    lancer(m.async_evaluer())
    assert len(m.hass.services.appels) == 1, "la main de la personne n'est pas defaite"


def confort_confirme_puis_eco_a_la_main(m, apres):
    """Lundi 07:00 : le planning met Confort et l'appareil le confirme. `apres` plus
    tard, une personne passe en Eco et le geste est enregistre. Rend (confort, eco)."""
    lancer(m.async_evaluer())
    contexte = m.hass.services.contextes[0]
    confort, eco = FauxEtat("comfort", {"options": NODON}), FauxEtat("eco", {"options": NODON})
    m.hass.states.table[RAD] = confort
    m._sur_etat(Evenement(RAD, eco, confort, contexte))
    m.horloge = LUNDI_0700 + apres
    m.hass.states.table[RAD] = eco
    m._sur_etat(Evenement(RAD, confort, eco))
    m.hass.executer()
    return confort, eco


def test_reprendre_le_planning_juste_apres_un_geste_renvoie_le_mode_du_planning(creer):
    """Confort a 07:00, confirme ; Eco a la main a 07:00:40 ; "Reprendre le planning" a
    07:01:00, dans les 90 secondes de l'ordre. Cet ordre est perime : Confort repart."""
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote"))))
    confort_confirme_puis_eco_a_la_main(m, timedelta(seconds=40))
    assert m.reprises["id-rad"]["mode"] == "eco"
    m.horloge = LUNDI_0700 + timedelta(seconds=60)
    lancer(m.async_rendre_au_planning("id-rad"))
    assert m.reprises == {}
    assert len(m.hass.services.appels) == 2
    assert m.hass.services.appels[-1] == ("select", "select_option", {"entity_id": [RAD], "option": "comfort"})


def test_revenir_a_la_main_a_l_etat_ordonne_est_un_geste(creer):
    """Apres un geste, la personne revient a l'etat que nous avions ordonne : ce n'est pas
    l'echo d'un ordre vieux de vingt minutes, c'est un nouveau geste."""
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote"))))
    confort, eco = confort_confirme_puis_eco_a_la_main(m, timedelta(minutes=10))
    assert m.reprises["id-rad"]["mode"] == "eco"
    m.horloge = LUNDI_0700 + timedelta(minutes=20)
    m.hass.states.table[RAD] = confort
    m._sur_etat(Evenement(RAD, eco, confort))
    m.hass.executer()
    assert m.reprises["id-rad"]["mode"] == "confort"
    assert len(m.hass.services.appels) == 1, "on ne se bat pas"


def test_la_piece_qui_se_rechauffe_n_est_pas_un_geste(creer):
    m = creer(config(("id-poele", chauffage(POELE, "thermostat"))))
    vieux = FauxEtat("heat", {**ATTRS_POELE, "temperature": 17, "current_temperature": 18})
    neuf = FauxEtat("heat", {**ATTRS_POELE, "temperature": 17, "current_temperature": 18.5})
    m._sur_etat(Evenement(POELE, vieux, neuf))
    assert m.hass.taches == []


def test_un_poele_qui_se_met_en_veille_puis_repart_n_est_pas_un_geste(creer):
    """Audit du 19/10, mesure chez lui : apres chaque ordre, le poele MCZ passe seul
    `heat` → `off` (`hvac_action: idle`) quand la piece a sa consigne, puis repart.
    Chaque passage devenait « reprise en main · geste fait ailleurs » : le planning ne
    le pilotait plus. Ni l'un ni l'autre n'est un geste, et on ne le rallume pas."""
    m = creer(config(("id-poele", chauffage(POELE, "thermostat"))), etats(poele_t=17))
    lancer(m.async_evaluer())
    assert m.hass.services.appels == [("climate", "set_temperature", {"entity_id": [POELE], "temperature": 20.0})]
    ctx = m.hass.services.contextes[0]
    avant = FauxEtat("heat", {**ATTRS_POELE, "temperature": 17, "hvac_action": "heating"})
    allume = FauxEtat("heat", {**ATTRS_POELE, "temperature": 20, "hvac_action": "heating"})
    m.hass.states.table[POELE] = allume
    m._sur_etat(Evenement(POELE, avant, allume, ctx))
    endormi = FauxEtat("off", {**ATTRS_POELE, "temperature": 20, "hvac_action": "idle"})
    for vieux, neuf, minutes in ((allume, endormi, 40), (endormi, allume, 70)):
        m.horloge = LUNDI_0700 + timedelta(minutes=minutes)
        m.hass.states.table[POELE] = neuf
        m._sur_etat(Evenement(POELE, vieux, neuf))
        m.hass.executer()
        assert m.reprises == {}, "%s → %s : sa veille, pas un geste" % (vieux.state, neuf.state)
    m.hass.states.table[POELE] = endormi
    lancer(m.async_evaluer())
    assert len(m.hass.services.appels) == 1, "endormi a sa consigne : rien a lui envoyer"


PAC = "climate.pac_sejour"
ATTRS_PAC = {"hvac_modes": ["off", "heat", "cool", "dry", "fan_only"], "min_temp": 16, "max_temp": 30}
REGISTRE_PAC = REGISTRE + [Entree(PAC, "id-pac", platform="daikin", unique_id="pac-1", device_id="d-pac")]


@pytest.mark.parametrize("maison", ["planning", "ete", "absence"])
def test_une_pompe_a_chaleur_passee_en_froid_n_est_ni_remise_en_chauffe_ni_coupee(creer, maison):
    """Audit du 19/10, critique : planning allume, on passe la PAC en froid a 24 °C.
    Loggia y voyait un geste et renvoyait `set_hvac_mode heat` + 24 °C — meme en Ete.
    Elle refroidit : le planning de chauffe attend, il ne commande rien, et le dit."""
    table = etats()
    table[PAC] = FauxEtat("heat", {**ATTRS_PAC, "temperature": 20})
    m = creer(config(("id-pac", chauffage(PAC, "thermostat")), maison={"mode": maison}), table, registre=REGISTRE_PAC)
    chaud, froid = table[PAC], FauxEtat("cool", {**ATTRS_PAC, "temperature": 24})
    m.hass.states.table[PAC] = froid
    m.horloge = LUNDI_0700 + timedelta(minutes=10)
    m._sur_etat(Evenement(PAC, chaud, froid))
    m.hass.executer()
    lancer(m.async_evaluer())
    lancer(m.async_evaluer())
    assert m.reprises == {}, "refroidir n'est pas reprendre la main sur le chauffage"
    assert m.hass.services.appels == [], "ni chauffe, ni Arret : elle refroidit"
    assert sum(1 for e in journal(m) if e[1:4:2] == ("retenu", "il refroidit")) == 1, "dit une fois : %s" % journal(m)
    pac = next(c for c in lancer(m.async_etat())["chauffages"] if c["cle"] == "id-pac")
    assert "refroidit" in pac["avertissements"]


def test_repasser_la_pompe_a_chaleur_en_chauffe_a_la_main_est_un_geste(creer):
    table = etats()
    table[PAC] = FauxEtat("cool", {**ATTRS_PAC, "temperature": 24})
    m = creer(config(("id-pac", chauffage(PAC, "thermostat"))), table, registre=REGISTRE_PAC)
    chaud = FauxEtat("heat", {**ATTRS_PAC, "temperature": 21})
    m.hass.states.table[PAC] = chaud
    m._sur_etat(Evenement(PAC, FauxEtat("cool", {**ATTRS_PAC, "temperature": 24}), chaud))
    m.hass.executer()
    assert m.reprises["id-pac"]["temperature"] == 21.0


def test_un_poele_vraiment_eteint_reste_un_geste(creer):
    m = creer(config(("id-poele", chauffage(POELE, "thermostat"))), etats(poele_t=20))
    allume = FauxEtat("heat", {**ATTRS_POELE, "temperature": 20, "hvac_action": "heating"})
    eteint = FauxEtat("off", {**ATTRS_POELE, "temperature": 20, "hvac_action": "off"})
    m.hass.states.table[POELE] = eteint
    m._sur_etat(Evenement(POELE, allume, eteint))
    m.hass.executer()
    assert m.reprises["id-poele"]["mode"] == "arret"


@pytest.mark.parametrize("automatique", ["safety", "security", "power"])
def test_un_vtherm_qui_se_met_de_lui_meme_en_securite_ou_en_delestage_n_est_pas_un_geste(creer, automatique):
    """VTherm change seul de prereglage : `safety` (`security` dans ses anciennes versions)
    quand sa sonde se tait, `power` quand la puissance est delestee. L'aller et le retour
    ne sont pas des mains."""
    m = creer(config(("id-vth", chauffage(VTH, "vtherm"))), etats(vth_preset="comfort"))
    normal = FauxEtat("heat", {**ATTRS_VTH, "preset_mode": "comfort"})
    seul = FauxEtat("heat", {**ATTRS_VTH, "preset_mode": automatique})
    m._sur_etat(Evenement(VTH, normal, seul))
    m._sur_etat(Evenement(VTH, seul, normal))
    m.hass.executer()
    assert m.reprises == {}
    assert m.hass.services.appels == [], "revenu a Confort, VTherm est deja ce que veut le planning"


@pytest.mark.parametrize("automatique", ["safety", "security", "power"])
def test_un_vtherm_en_securite_ou_en_delestage_n_est_pas_commande(creer, automatique):
    """Tant que VTherm est en `safety` (ou `security`) ou en `power`, c'est lui qui decide :
    le moteur ne lui envoie rien. Des qu'il rend la main, le planning s'applique."""
    m = creer(config(("id-vth", chauffage(VTH, "vtherm"))), etats(vth_preset=automatique))
    lancer(m.async_evaluer())
    assert m.hass.services.appels == [], "VTherm decide seul"
    assert journal(m) == []
    seul = m.hass.states.table[VTH]
    normal = FauxEtat("heat", {**ATTRS_VTH, "preset_mode": "eco"})
    m.hass.states.table[VTH] = normal
    m._sur_etat(Evenement(VTH, seul, normal))
    m.hass.executer()
    assert m.hass.services.appels == [("climate", "set_preset_mode", {"entity_id": [VTH], "preset_mode": "comfort"})]
    assert m.reprises == {}, "aucune main n'a touche VTherm"


@pytest.mark.parametrize("cause", ["fenetre", "ete"])
def test_un_vtherm_en_securite_s_eteint_toujours(creer, cause):
    """L'Arret passe : un VTherm en `safety` chauffe a un taux fixe, et seule une fenetre
    ouverte (ou l'Ete) peut encore le couper."""
    maison = {"mode": "ete"} if cause == "ete" else None
    m = creer(config(("id-vth", chauffage(VTH, "vtherm", fenetre="arret")), maison=maison),
              etats(vth_preset="safety"))
    if cause == "fenetre":
        m.fenetres[VTH] = {"salon"}
    lancer(m.async_evaluer())
    assert m.hass.services.appels == [("climate", "set_hvac_mode", {"entity_id": [VTH], "hvac_mode": "off"})]


def test_un_vtherm_en_securite_ne_recoit_que_l_arret_d_une_fenetre(creer):
    """Seul l'Arret passe : une fenetre reglee sur Eco ne dit rien a un VTherm en `safety`."""
    m = creer(config(("id-vth", chauffage(VTH, "vtherm", fenetre="eco"))), etats(vth_preset="safety"))
    m.fenetres[VTH] = {"salon"}
    lancer(m.async_evaluer())
    assert m.hass.services.appels == []


def test_un_vtherm_change_a_la_main_reste_un_geste(creer):
    m = creer(config(("id-vth", chauffage(VTH, "vtherm"))), etats(vth_preset="comfort"))
    eco = FauxEtat("heat", {**ATTRS_VTH, "preset_mode": "eco"})
    m.hass.states.table[VTH] = eco
    m._sur_etat(Evenement(VTH, FauxEtat("heat", {**ATTRS_VTH, "preset_mode": "comfort"}), eco))
    m.hass.executer()
    assert m.reprises["id-vth"]["mode"] == "eco"
    assert m.hass.services.appels == [], "on ne se bat pas"


def test_la_fenetre_passe_devant_un_geste(creer):
    """§ 5.1 : fenetre ouverte, puis reprise en main. Rallume a la main, le
    radiateur repart en Arret — c'est la surete."""
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote"))), etats(rad="off"))
    m.fenetres[RAD] = {"Bureau"}
    m.horloge += timedelta(minutes=5)
    m.hass.states.table[RAD] = FauxEtat("comfort", {"options": NODON})
    m._sur_etat(Evenement(RAD, FauxEtat("off", {"options": NODON}), FauxEtat("comfort", {"options": NODON})))
    m.hass.executer()
    assert "id-rad" in m.reprises
    assert m.hass.services.appels == [("select", "select_option", {"entity_id": [RAD], "option": "off"})]


# -- Un moteur arrete ne prend plus la main ----------------------------------

@pytest.mark.parametrize("demande", ["reprise", "planning"])
def test_une_demande_deja_partie_ne_fait_rien_quand_le_moteur_s_arrete(creer, demande):
    """Apres un rechargement, l'ancien moteur et le nouveau lisent le meme
    fichier des reprises : une demande partie avant l'arret, mais qui n'a pas
    encore tourne, n'enregistre rien, n'ecrit rien et ne commande rien."""
    m = creer(config(("id-poele", chauffage(POELE, "thermostat"))), etats(poele_t=17))
    m.reprises["id-poele"] = {"mode": "eco", "temperature": None, "fin": None, "depuis": LUNDI_0700.isoformat(),
                              "par": None}
    avant = {cle: dict(r) for cle, r in m.reprises.items()}
    demandes = {"reprise": lambda: m.async_reprendre_la_main("id-poele", temperature=22.0),
                "planning": lambda: m.async_rendre_au_planning("id-poele")}

    async def scenario():
        tache = asyncio.ensure_future(demandes[demande]())
        m.async_arreter()                           # la tache est creee, elle n'a pas encore tourne
        await asyncio.wait_for(tache, 5)

    lancer(scenario())
    assert m.reprises == avant, "ni reprise remplacee, ni reprise rendue au planning"
    assert m._depot.ecritures == 0 and m._depot.contenu is None, "le fichier des reprises n'est pas touche"
    assert m.hass.services.appels == [] and journal(m) == []


def test_un_geste_deja_reconnu_ne_fait_rien_quand_le_moteur_s_arrete(creer):
    m = creer(config(("id-poele", chauffage(POELE, "thermostat"))), etats(poele_t=17))
    vieux = FauxEtat("heat", {**ATTRS_POELE, "temperature": 17})
    neuf = FauxEtat("heat", {**ATTRS_POELE, "temperature": 22})
    m.hass.states.table[POELE] = neuf
    m._sur_etat(Evenement(POELE, vieux, neuf))
    assert len(m.hass.taches) == 1, "le geste est reconnu : sa tache attend son tour"
    m.async_arreter()
    m.hass.executer()
    assert m.reprises == {} and m._depot.ecritures == 0
    assert m.hass.services.appels == [] and journal(m) == []


def test_apres_l_arret_un_geste_n_est_pas_reconnu(creer):
    m = creer(config(("id-poele", chauffage(POELE, "thermostat"))), etats(poele_t=17))
    m.async_arreter()
    m._sur_etat(Evenement(POELE, FauxEtat("heat", {**ATTRS_POELE, "temperature": 17}),
                          FauxEtat("heat", {**ATTRS_POELE, "temperature": 22})))
    assert m.hass.taches == []


def test_une_demande_arretee_en_pleine_ecriture_va_au_bout_sans_rien_commander(creer):
    """Le moteur s'arrete pendant que la reprise s'ecrit : elle est gardee (le
    moteur suivant la retrouve dans le fichier), mais aucun ordre ne part."""
    m = creer(config(("id-poele", chauffage(POELE, "thermostat"))), etats(poele_t=20))
    ecrire = m._depot.async_save

    async def scenario():
        en_vol, libere = asyncio.Event(), asyncio.Event()

        async def lent(donnees):
            en_vol.set()
            await libere.wait()
            await ecrire(donnees)

        m._depot.async_save = lent
        demande = asyncio.ensure_future(m.async_reprendre_la_main("id-poele", temperature=22.0))
        await asyncio.wait_for(en_vol.wait(), 5)
        m.async_arreter()
        libere.set()
        await asyncio.wait_for(demande, 5)

    lancer(scenario())
    assert m._depot.contenu["id-poele"]["temperature"] == 22.0, "l'ecriture en cours va a son terme"
    assert m.hass.services.appels == [], "mais le moteur arrete ne commande plus"


# ── Les faits des autres regles ─────────────────────────────────────────────

def test_la_fenetre_ouverte_coupe_et_la_fermeture_rend_le_planning(creer):
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote"))), etats(rad="comfort"))
    lancer(m.async_fenetre(RAD, "Bureau", True))
    assert m.hass.services.appels == [("select", "select_option", {"entity_id": [RAD], "option": "off"})]
    assert journal(m)[0][:3] == ("fenetre", "Arrêt", "Bureau")
    m.hass.states.table[RAD] = FauxEtat("off", {"options": NODON})
    m.horloge += timedelta(minutes=10)
    lancer(m.async_fenetre(RAD, "Bureau", False))
    assert m.hass.services.appels[-1] == ("select", "select_option", {"entity_id": [RAD], "option": "comfort"})


def test_une_fenetre_sans_nom_de_piece_se_dit_fenetre_ouverte(creer):
    """Le motif nomme les pieces ; sans nom, il dit « fenêtre ouverte » — accentue :
    la cle du catalogue est le francais que l'ecran montre (plan 2, choix 18)."""
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote"))), etats(rad="comfort"))
    lancer(m.async_fenetre(RAD, "", True))
    assert journal(m)[0][:3] == ("fenetre", "Arrêt", "fenêtre ouverte")


def test_renomme_et_injoignable_le_radiateur_nomme_encore_la_piece_de_sa_fenetre(creer):
    """La configuration garde l'entity_id d'avant un renommage tant que ce chauffage
    n'est pas reenregistre ; la regle des fenetres parle avec celui d'aujourd'hui. La
    ligne « retenu » d'un appareil injoignable nomme la piece, comme celle d'un ordre."""
    table = etats()
    table[RAD] = FauxEtat("unavailable", {"options": NODON})
    m = creer(config(("id-rad", chauffage("select.ancien_nom", "fil_pilote"))), table)
    lancer(m.async_fenetre(RAD, "Bureau", True))
    assert journal(m) == [("fenetre", "retenu", "Bureau", "appareil injoignable")]


def test_deux_pieces_sur_un_radiateur_attendent_la_derniere_fenetre(creer):
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote"))), etats(rad="comfort"))
    lancer(m.async_fenetre(RAD, "Bureau", True))
    lancer(m.async_fenetre(RAD, "Couloir", True))
    m.hass.states.table[RAD] = FauxEtat("off", {"options": NODON})
    lancer(m.async_fenetre(RAD, "Bureau", False))
    assert m.fenetre_ouverte(RAD) is True
    assert len(m.hass.services.appels) == 1


def test_la_fenetre_reglee_sur_eco_ou_sur_rien(creer):
    m = creer(config(("id-poele", chauffage(POELE, "thermostat", fenetre="eco"))), etats(poele_t=20))
    lancer(m.async_fenetre(POELE, "Salon", True))
    assert m.hass.services.appels == [("climate", "set_temperature", {"entity_id": [POELE], "temperature": 17.0})]
    m = creer(config(("id-poele", chauffage(POELE, "thermostat", fenetre="rien"))), etats(poele_t=20))
    lancer(m.async_fenetre(POELE, "Salon", True))
    assert m.hass.services.appels == []


def test_une_fenetre_qui_ne_coupe_rien_ne_parle_pas(creer):
    """La fenetre ne repond que si elle BAISSE vraiment (plan 2, tache 2 bis) : en Ete, le
    radiateur est deja a l'Arret — c'est l'Ete qui parle, a l'ecran comme au journal ; sinon
    « Fenetre ouverte · Arret » se lirait tout l'ete. Le fait, lui, reste su."""
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote")), maison={"mode": "ete"}), etats(rad="comfort"))
    lancer(m.async_fenetre(RAD, "Bureau", True))
    assert m.hass.services.appels == [("select", "select_option", {"entity_id": [RAD], "option": "off"})]
    assert journal(m)[0][:3] == ("maison", "Arrêt", "Été"), "l'Ete l'eteint, pas la fenetre"
    rad = chauffages_de(m)["id-rad"]
    assert (rad["mode"], rad["source"], rad["fenetre_ouverte"]) == ("arret", "maison", True)


def test_le_depart_met_la_maison_en_absence_et_le_retour_la_rend(creer):
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote"))), etats(rad="comfort"))
    assert lancer(m.async_presence(True)) is True
    assert m.cfg["maison"]["mode"] == "absence"
    assert lancer(m.store.async_get_shared("loggia_chauffage"))["maison"]["mode"] == "absence"
    assert m.hass.services.appels == [("select", "select_option", {"entity_id": [RAD], "option": "eco"})]
    assert lancer(m.async_presence(True)) is False, "deja en absence : rien"
    assert lancer(m.async_presence(False)) is True
    assert m.cfg["maison"]["mode"] == "planning"


def test_une_presence_qui_observe_ne_change_pas_la_maison(creer):
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote"))), etats(rad="comfort"))
    assert lancer(m.async_presence(True, simuler=True)) is False
    assert m.cfg["maison"]["mode"] == "planning" and m.hass.services.appels == []
    ligne = lancer(m.regles.journal(module="chauffage"))[0]
    assert (ligne["quoi"], ligne["motif"], ligne["simule"]) == ("Absence", "maison vide", True)


def test_vacances_et_ete_ne_se_touchent_qu_a_la_main(creer):
    for mode in ("vacances", "ete"):
        m = creer(config(("id-rad", chauffage(RAD, "fil_pilote")), maison={"mode": mode}))
        assert lancer(m.async_presence(True)) is False
        assert lancer(m.async_presence(False)) is False
        assert m.cfg["maison"]["mode"] == mode


def test_sans_planning_allume_la_presence_ne_touche_pas_la_maison(creer):
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote", planning=False))))
    assert lancer(m.async_presence(True)) is False
    assert m.cfg["maison"]["mode"] == "planning"


# ── Le mode de la maison ────────────────────────────────────────────────────

def test_l_ete_est_reserve_aux_administrateurs(creer):
    store = charger("store")
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote"))))
    with pytest.raises(store.MaisonReserveeError) as refus:
        lancer(m.async_maison("ete"))
    assert str(refus.value).endswith(": maison.ete")
    lancer(m.async_maison("ete", admin=True))
    assert m.hass.services.appels[-1] == ("select", "select_option", {"entity_id": [RAD], "option": "off"})
    with pytest.raises(store.MaisonReserveeError):
        lancer(m.async_maison("planning"))
    lancer(m.async_maison("absence", admin=True))
    lancer(m.async_maison("vacances", paris(2026, 10, 20, 18).isoformat()))
    assert m.cfg["maison"]["mode"] == "vacances"
    assert m.cfg["maison"]["vacances_fin"] == paris(2026, 10, 20, 18).isoformat()


def test_une_date_seule_finit_les_vacances_a_minuit_de_la_maison(creer):
    """L'ecran envoie le JOUR choisi, seul (« 2026-10-20 », son champ date) : ou
    qu'il soit, c'est minuit de ce jour a l'heure de la MAISON (plan 2, relecture
    des taches 11 et 12). A minuit de Paris, un navigateur a Athenes envoyait
    23:00 la veille — « jusqu'au 19 » — et chaque validation reculait d'un jour."""
    refus = charger("refus")
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote"))))
    lancer(m.async_maison("vacances", "2026-10-20"))
    # ASSERTION MODIFIÉE (audit du 19/10) : `par_presence`, qui a posé l'Absence.
    assert m.cfg["maison"] == {"mode": "vacances", "vacances_fin": "2026-10-20T00:00:00+02:00", "absence": "eco",
                               "vacances": "hors_gel", "par_presence": False}
    assert lancer(m.async_etat())["maison"]["vacances_fin"] == "2026-10-20T00:00:00+02:00", "l'ecran lit le 20"
    # Une seconde validation du meme jour ne le deplace pas.
    lancer(m.async_maison("vacances", "2026-10-20"))
    assert m.cfg["maison"]["vacances_fin"] == "2026-10-20T00:00:00+02:00"
    # A l'heure d'hiver, le decalage suit la maison.
    lancer(m.async_maison("vacances", " 2026-11-02 "))
    assert m.cfg["maison"]["vacances_fin"] == "2026-11-02T00:00:00+01:00"
    # Un instant avec son decalage reste accepte tel quel.
    lancer(m.async_maison("vacances", "2026-11-01T23:00:00.000Z"))
    assert m.cfg["maison"]["vacances_fin"] == "2026-11-01T23:00:00+00:00"
    # Refuses, sans rien ecrire : une date passee — aujourd'hui compris, son minuit est passe —,
    # un jour qui n'existe pas, une date hors des Vacances.
    for mode, fin in (("vacances", "2026-10-12"), ("vacances", "2026-10-11"), ("vacances", "2026-02-31"),
                      ("vacances", "2026-1-5"), ("absence", "2026-10-20")):
        with pytest.raises(refus.RefusNomme) as e:
            lancer(m.async_maison(mode, fin))
        assert (e.value.code, e.value.nomme) == ("chauffage_date_illisible", "maison.vacances_fin"), fin
    assert m.cfg["maison"]["vacances_fin"] == "2026-11-01T23:00:00+00:00", "un refus n'ecrit rien"


# ── Le moteur lache un radiateur coupe pour une fenetre (audit du 19/10) ────

class FauxFenetres:
    def __init__(self):
        self.adoptes = []

    def adopter(self, piece, haid, rendre, laisse):
        self.adoptes.append((piece, haid, rendre, laisse))


@pytest.mark.parametrize("lacher", ["planning_eteint", "observation", "retire"])
def test_lacher_un_radiateur_coupe_pour_une_fenetre_le_passe_a_la_regle(creer, lacher):
    """Planning eteint (ou observation, ou chauffage retire) pendant que le moteur tient
    un radiateur coupe pour une fenetre encore ouverte : personne ne le rendait a la
    fermeture. Le moteur le passe a la regle des fenetres, avec ce que le planning
    aurait mis sans la fenetre — ici Confort, lundi 07:00."""
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote"))))
    regle = FauxFenetres()
    m.hass.data = {"loggia": {"fenetres": regle}}
    lancer(m.async_fenetre(RAD, "Chambre", True))
    assert m.hass.services.appels[-1] == ("select", "select_option", {"entity_id": [RAD], "option": "off"})
    m.hass.states.table[RAD] = FauxEtat("off", {"options": NODON})
    patch = {"chauffages": {"id-rad": {"planning": False}}} if lacher == "planning_eteint" else (
        {"simulation": {"actif": True}} if lacher == "observation" else {"chauffages": {"id-rad": None}})
    lancer(m.async_enregistrer(patch))
    assert regle.adoptes == [("Chambre", RAD, "comfort", "off")]


def test_un_thermostat_seulement_baisse_se_rend_par_sa_consigne(creer):
    """Fenetre reglee en Eco : le moteur BAISSE le poele (17 au lieu de 20), il ne le
    coupe pas. Lache (planning eteint) fenetre ouverte, sa consigne restait basse apres
    la fermeture (limite du 19/10). Le moteur passe la consigne a rendre (25/10)."""
    m = creer(config(("id-poele", chauffage(POELE, "thermostat", fenetre="eco"))), etats(poele_t=20))
    regle = FauxFenetres()
    m.hass.data = {"loggia": {"fenetres": regle}}
    lancer(m.async_fenetre(POELE, "Salon", True))
    assert m.hass.services.appels[-1] == ("climate", "set_temperature", {"entity_id": [POELE], "temperature": 17.0})
    m.hass.states.table[POELE] = FauxEtat("heat", {**ATTRS_POELE, "temperature": 17})
    lancer(m.async_enregistrer({"chauffages": {"id-poele": {"planning": False}}}))
    assert regle.adoptes == [("Salon", POELE, "consigne:20.0", "consigne:17.0")]


def test_sans_fenetre_ouverte_rien_n_est_passe(creer):
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote"))))
    regle = FauxFenetres()
    m.hass.data = {"loggia": {"fenetres": regle}}
    lancer(m.async_evaluer())
    lancer(m.async_enregistrer({"chauffages": {"id-rad": {"planning": False}}}))
    assert regle.adoptes == []


def test_un_thermostat_coupe_se_rend_en_chauffe(creer):
    m = creer(config(("id-poele", chauffage(POELE, "thermostat"))))
    regle = FauxFenetres()
    m.hass.data = {"loggia": {"fenetres": regle}}
    lancer(m.async_fenetre(POELE, "Salon", True))
    m.hass.states.table[POELE] = FauxEtat("off", {**ATTRS_POELE, "temperature": 17})
    lancer(m.async_enregistrer({"chauffages": {"id-poele": {"planning": False}}}))
    assert regle.adoptes == [("Salon", POELE, "heat", "off")]


# ── Un radiateur renomme (audit du 19/10) ───────────────────────────────────

class EvRegistre:
    def __init__(self, neuf, ancien, action="update"):
        self.data = {"action": action, "entity_id": neuf, "old_entity_id": ancien, "changes": {"entity_id": ancien}}


def test_un_radiateur_renomme_reste_pilote_par_le_moteur_seul(creer):
    """Audit du 19/10 : le moteur n'ecoutait pas le registre. Renomme, le radiateur
    restait abonne sous son ANCIEN nom : `pilote(nouveau)` repondait faux — la regle
    des fenetres et la presence le commandaient aussi —, ses gestes et ses retours
    n'etaient plus vus, jusqu'au prochain rechargement."""
    rad = Entree(RAD, "id-rad", unique_id="0x00158d0001a2b3c4_pilot_wire_mode_zigbee2mqtt", device_id="d-rad")
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote"))), registre=[rad] + REGISTRE[1:])
    lancer(m.async_fenetre(RAD, "Chambre", True))
    nouveau = "select.radiateur_chambre_2_pilot_wire_mode"
    rad.entity_id = nouveau
    m.hass.states.table[nouveau] = m.hass.states.table.pop(RAD)
    m._sur_registre(EvRegistre(nouveau, RAD))
    m.hass.executer()
    assert m.pilote(nouveau) and not m.pilote(RAD), "un seul chef, sous son nouveau nom"
    assert m.fenetre_ouverte(nouveau) and not m.fenetre_ouverte(RAD), "la fenetre ouverte le suit"
    # Un geste sous le nouveau nom est vu.
    m.horloge = LUNDI_0700 + timedelta(minutes=10)
    off, eco = FauxEtat("off", {"options": NODON}), FauxEtat("eco", {"options": NODON})
    m.hass.states.table[nouveau] = eco
    m._sur_etat(Evenement(nouveau, off, eco))
    m.hass.executer()
    assert m.reprises["id-rad"]["mode"] == "eco"


def test_un_autre_renommage_ne_touche_a_rien(creer):
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote"))))
    ecoute = m._ecoute
    m._sur_registre(EvRegistre("light.salon_2", "light.salon"))
    m._sur_registre(EvRegistre(RAD, None, action="create"))
    assert m._ecoute is ecoute and m.hass.taches == []


# ── Un thermostat qui revient a son propre programme (Tado, Netatmo ; 19/10) ─

TADO = "climate.salon_tado"
ATTRS_TADO = {"hvac_modes": ["off", "auto", "heat"], "min_temp": 5, "max_temp": 25}
REGISTRE_TADO = REGISTRE + [Entree(TADO, "id-tado", platform="tado", unique_id="tado-1", device_id="d-tado")]


def test_un_thermostat_qui_revient_a_son_programme_n_est_pas_force_en_manuel(creer):
    """Tado ou Netatmo : notre consigne est un reglage manuel TEMPORAIRE ; a son
    echeance, l'appareil revient seul a son programme (`auto`). Le moteur y voyait un
    geste, puis renvoyait `heat` + la consigne : il le remettait en manuel, en boucle.
    Desormais : « il suit son programme » jusqu'au prochain changement, rien n'est
    envoye ; les consignes de son programme ne sont pas des gestes."""
    table = etats()
    table[TADO] = FauxEtat("heat", {**ATTRS_TADO, "temperature": 20})
    m = creer(config(("id-tado", chauffage(TADO, "thermostat"))), table, registre=REGISTRE_TADO)
    chaud, auto = table[TADO], FauxEtat("auto", {**ATTRS_TADO, "temperature": 18})
    m.hass.states.table[TADO] = auto
    m.horloge = LUNDI_0700 + timedelta(minutes=30)
    m._sur_etat(Evenement(TADO, chaud, auto))
    m.hass.executer()
    r = m.reprises["id-tado"]
    assert r["programme"] is True and r["fin"] == paris(2026, 10, 12, 8, 30).isoformat()
    lancer(m.async_evaluer())
    assert m.hass.services.appels == [], "on ne le remet pas en manuel"
    # Son programme change sa consigne : pas un nouveau geste.
    plus_tard = FauxEtat("auto", {**ATTRS_TADO, "temperature": 21})
    m.hass.states.table[TADO] = plus_tard
    m._sur_etat(Evenement(TADO, auto, plus_tard))
    assert m.hass.taches == []
    # Au prochain changement du planning, le planning reprend la main.
    m.horloge = paris(2026, 10, 12, 8, 30)
    lancer(m.async_evaluer())
    assert m.reprises == {}
    assert m.hass.services.appels == [("climate", "set_hvac_mode", {"entity_id": [TADO], "hvac_mode": "heat"}),
                                      ("climate", "set_temperature", {"entity_id": [TADO], "temperature": 17.0})]


def test_une_reprise_sur_son_programme_laisse_passer_la_fenetre(creer):
    table = etats()
    table[TADO] = FauxEtat("auto", {**ATTRS_TADO, "temperature": 19})
    m = creer(config(("id-tado", chauffage(TADO, "thermostat"))), table, registre=REGISTRE_TADO)
    m.reprises["id-tado"] = {"mode": None, "temperature": 19.0, "fin": None, "depuis": LUNDI_0700.isoformat(),
                             "par": None, "programme": True}
    lancer(m.async_fenetre(TADO, "Salon", True))
    assert m.hass.services.appels == [("climate", "set_hvac_mode", {"entity_id": [TADO], "hvac_mode": "off"})]


# ── Ce qu'un VTherm commande n'est pas un chauffage de plus (audit du 19/10) ─

TRV = "climate.trv_salon"


def test_ce_qu_un_vtherm_commande_n_est_pas_un_chauffage_de_plus(creer):
    """Un VTherm « over_climate » et la vanne qu'il commande sortaient comme DEUX
    chauffages : planning allume sur les deux, deux chefs — et le « jamais son module »
    de VTherm n'etait pas tenu. La vanne n'est plus proposee ; un planning deja allume
    sur elle ne commande plus rien, et l'etat le dit en nommant le VTherm."""
    table = etats()
    table[VTH] = FauxEtat("heat", {**ATTRS_VTH, "preset_mode": "eco",
                                   "vtherm_over_climate": {"underlying_entities": [TRV]}})
    table[TRV] = FauxEtat("heat", {"hvac_modes": ["off", "heat"], "temperature": 19})
    registre = REGISTRE + [Entree(TRV, "id-trv", platform="zha", unique_id="trv-1", device_id="d-trv")]
    m = creer(config(("id-trv", chauffage(TRV, "thermostat"))), table, registre=registre)
    assert "id-trv" not in m.candidats() and "id-vth" in m.candidats()
    assert not m.pilote(TRV), "son planning passe par le VTherm"
    lancer(m.async_evaluer())
    assert all(a[2].get("entity_id") != [TRV] for a in m.hass.services.appels), "on ne commande pas sa vanne"
    trv = next(c for c in lancer(m.async_etat())["chauffages"] if c["cle"] == "id-trv")
    assert "commande_par" in trv["avertissements"] and trv["commande_par"] == VTH


# ── L'historique resume par le serveur (audit du 19/10) ─────────────────────

@pytest.fixture
def enregistreur(monkeypatch):
    """`homeassistant.components.recorder`, comme le vrai (modele : test_prises.py)."""
    h = types.SimpleNamespace(etats=[], demandes=[])

    def state_changes_during_period(hass, debut, fin, entity_id, no_attributes=False, descending=False,
                                    limit=None, include_start_time_state=True):
        h.demandes.append((debut, fin, entity_id, no_attributes, include_start_time_state))
        return {entity_id: list(h.etats)}

    class Instance:
        async def async_add_executor_job(self, cible, *args):
            return cible(*args)

    recorder = types.ModuleType("homeassistant.components.recorder")
    recorder.get_instance = lambda _hass: Instance()
    recorder.history = types.SimpleNamespace(state_changes_during_period=state_changes_during_period)
    monkeypatch.setitem(sys.modules, "homeassistant.components.recorder", recorder)
    return h


def test_l_historique_d_un_chauffage_se_lit_resume(creer, enregistreur):
    m = creer(config(("id-poele", chauffage(POELE, "thermostat"))))
    lourd = {**ATTRS_POELE, "preset_modes": ["auto"] * 30, "friendly_name": "Poele"}
    e1 = types.SimpleNamespace(state="heat", last_updated=LUNDI_0700, attributes={**lourd, "temperature": 20})
    e2 = types.SimpleNamespace(state="heat", last_updated=LUNDI_0700 + timedelta(minutes=1), attributes={**lourd, "temperature": 20})
    e3 = types.SimpleNamespace(state="off", last_updated=LUNDI_0700 + timedelta(minutes=9), attributes={**lourd, "temperature": 20})
    enregistreur.etats = [e1, e2, e3]
    r = lancer(m.async_historique("id-poele", 7))
    debut, fin, entite, sans_attributs, depart = enregistreur.demandes[0]
    assert (entite, sans_attributs, depart) == (POELE, False, True) and fin - debut == timedelta(days=7)
    assert r["entite"] == POELE and [p["state"] for p in r["points"]] == ["heat", "off"]
    assert r["points"][0] == {"state": "heat", "last_updated": LUNDI_0700.isoformat(), "attributes": {"temperature": 20}}


def test_l_historique_se_refuse_a_qui_ne_peut_pas_lire_et_se_nomme_inconnu(creer, enregistreur, monkeypatch):
    m = creer(config(("id-poele", chauffage(POELE, "thermostat"))))
    with pytest.raises(charger("refus").RefusNomme) as e:
        lancer(m.async_historique("id-perdu", 1))
    assert e.value.code == "chauffage_inconnu"
    discovery = charger("discovery")
    monkeypatch.setattr(discovery, "_lecture_autorisee", lambda user: (lambda haid: False))
    with pytest.raises(PermissionError):
        lancer(m.async_historique("id-poele", 1, types.SimpleNamespace(is_admin=False)))
    assert enregistreur.demandes == [], "rien n'est lu pour qui n'a pas le droit"


# ── « injoignable » au demarrage : pas de bruit (audit du 19/10) ────────────

def test_juste_apres_le_demarrage_un_module_injoignable_ne_s_ecrit_pas(creer):
    """Chez lui, a chaque redemarrage de HA : une ligne « retenu · appareil injoignable »
    par radiateur, le temps que zigbee2mqtt revienne (~2 min). Pendant 5 min apres le
    demarrage, rien au journal — et toujours aucun ordre ; ensuite, comme avant."""
    table = etats(rad="unavailable")
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote"))), table)
    lancer(m._async_rattraper())
    assert m.hass.services.appels == [] and not [e for e in journal(m) if e[3] == "appareil injoignable"]
    m.horloge = LUNDI_0700 + timedelta(minutes=6)
    lancer(m.async_evaluer())
    assert [e for e in journal(m) if e[3] == "appareil injoignable"], "toujours injoignable apres 5 min : il se dit"
    assert m.hass.services.appels == []


# ── Les programmes d'ailleurs (D5 ; audit du 19/10) ─────────────────────────

def test_un_programme_d_ailleurs_se_dit_et_bloque_l_allumage_du_planning(creer):
    """Velair, un Scheduler allume, une automatisation allumee qui le commande : allume
    avec eux, le planning aurait deux chefs. Ils se DISENT (l'etat les nomme) et
    l'allumage est refuse en nommant le premier. Loggia ne les coupe jamais."""
    import types as _t
    table = etats()
    table["switch.schedule_poele"] = FauxEtat("on", {"entities": [POELE], "friendly_name": "Chauffe du matin"})
    registre = REGISTRE + [Entree("switch.schedule_poele", "id-sch", platform="scheduler", unique_id="sch-1")]
    m = creer(table=table, registre=registre)
    m.hass.config_entries = _t.SimpleNamespace(async_entries=lambda d: [
        _t.SimpleNamespace(title="Velair", options={"climate_entities": [POELE]}, data={})] if d == "velair" else [])
    poele = next(c for c in lancer(m.async_etat())["chauffages"] if c["cle"] == "id-poele")
    assert "programme_concurrent" in poele["avertissements"]
    assert [(c["type"], c["nom"]) for c in poele["concurrents"]] == [("velair", "Velair"), ("scheduler", "Chauffe du matin")]
    with pytest.raises(charger("refus").RefusNomme) as e:
        lancer(m.async_enregistrer({"chauffages": {"id-poele": {"planning": True}}}))
    assert e.value.code == "chauffage_programme_concurrent"
    assert all(a[0] not in ("switch", "automation") for a in m.hass.services.appels), "jamais coupes par Loggia"
    rad = next(c for c in lancer(m.async_etat())["chauffages"] if c["cle"] == "id-rad")
    assert "programme_concurrent" not in rad["avertissements"] and rad["concurrents"] == []


# ── Qui a pose l'Absence (audit du 19/10) ───────────────────────────────────

def test_l_absence_posee_par_la_presence_se_retient_et_se_relit(creer):
    """La presence oublie son depart a un redemarrage ; le chauffage, lui, garde
    l'Absence. Il retient donc QUI l'a posee : la presence, ou une personne."""
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote"))))
    assert m.absence_par_presence() is False
    lancer(m.async_presence(True))
    assert m.cfg["maison"]["mode"] == "absence" and m.absence_par_presence() is True
    relu = lancer(m.async_config())
    assert relu["maison"]["par_presence"] is True, "ecrit, et relu apres un redemarrage"
    lancer(m.async_presence(False))
    assert m.cfg["maison"]["mode"] == "planning" and m.absence_par_presence() is False
    lancer(m.async_maison("absence"))
    assert m.absence_par_presence() is False, "posee a la main : pas par la presence"
    lancer(m.async_maison("planning"))
    assert m.cfg["maison"]["par_presence"] is False


# ── Vacances et Ete effacent les reprises (audit du 19/10, son choix) ───────

@pytest.mark.parametrize("mode", ["vacances", "ete"])
def test_partir_en_vacances_ou_passer_en_ete_efface_les_reprises_en_main(creer, mode):
    """Une reprise « jusqu'a relance » passait par-dessus Vacances et Ete : parti avec
    Confort a la main, la maison chauffait en Confort tout le sejour. SON CHOIX
    (19/10) : passer en Vacances ou en Ete efface les reprises en cours ; une reprise
    faite PENDANT les vacances compte encore, jusqu'a sa fin."""
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote")), ("id-poele", chauffage(POELE, "thermostat"))))
    lancer(m.async_reprendre_la_main("id-rad", mode="confort", fin="relance"))
    lancer(m.async_reprendre_la_main("id-poele", temperature=22))
    lancer(m.async_maison(mode, admin=True))
    assert m.reprises == {} and m._depot.contenu == {}, "effacees, et le fichier des reprises aussi"
    rad = next(c for c in lancer(m.async_etat())["chauffages"] if c["cle"] == "id-rad")
    assert rad["source"] == "maison" and rad["mode"] == ("hors_gel" if mode == "vacances" else "arret")
    lignes = [e for e in journal(m) if e[1] == "reprendre le planning"]
    assert len(lignes) == 2 and {e[2] for e in lignes} == {"Vacances" if mode == "vacances" else "Été"}, lignes
    # Pendant le sejour, quelqu'un passe et reprend la main : elle compte.
    lancer(m.async_reprendre_la_main("id-rad", mode="confort", fin="relance"))
    assert m.reprises["id-rad"]["mode"] == "confort"
    # Changer la date de retour, ou repasser par le meme mode, ne l'efface pas.
    lancer(m.async_maison(mode, "2026-10-25" if mode == "vacances" else None, admin=True))
    assert m.reprises["id-rad"]["mode"] == "confort"


@pytest.mark.parametrize("mode", ["planning", "absence"])
def test_planning_et_absence_n_effacent_rien(creer, mode):
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote"))))
    lancer(m.async_reprendre_la_main("id-rad", mode="confort", fin="relance"))
    lancer(m.async_maison(mode))
    assert m.reprises["id-rad"]["mode"] == "confort"


# ── La configuration et l'etat ──────────────────────────────────────────────

def test_allumer_un_planning_le_branche_et_l_applique(creer):
    m = creer()
    lancer(m.async_enregistrer({"chauffages": {"id-rad": {"planning": True}}}))
    assert m.pilote(RAD) is True
    assert m.cfg["chauffages"]["id-rad"]["entite"] == RAD
    assert m.hass.services.appels == [("select", "select_option", {"entity_id": [RAD], "option": "comfort"})]
    lancer(m.async_reprendre_la_main("id-rad", mode="hors_gel"))
    lancer(m.async_enregistrer({"chauffages": {"id-rad": {"planning": False}}}))
    assert m.reprises == {} and m.pilote(RAD) is False, "un planning coupe emporte sa reprise"


REGISTRE_TIMER = REGISTRE + [Entree("switch.poele_timer", "id-timer", platform="maestro_mcz",
                                    unique_id="mcz-1-crono_enabled", original_name="Timer", device_id="d-poele")]


@pytest.mark.parametrize("timer", ["on", "off"])
def test_le_programme_de_l_appareil_allume_est_dit_et_bloque_le_planning(creer, timer):
    """Audit du 19/10 (D5, § 3.4) : chez lui, `switch.poele_timer` est reste allume avec
    le planning du poele — le chrono du MCZ changeait la consigne, chaque changement
    passait pour un geste. Allume, il se DIT (un avertissement qui le nomme) et le
    planning ne s'allume pas : deux chefs. Eteint, rien ne change. Loggia ne le coupe
    jamais lui-meme."""
    table = etats()
    table["switch.poele_timer"] = FauxEtat(timer)
    m = creer(table=table, registre=REGISTRE_TIMER)
    poele = next(c for c in lancer(m.async_etat())["chauffages"] if c["cle"] == "id-poele")
    if timer == "on":
        assert "programme_appareil" in poele["avertissements"] and poele["programme"] == "switch.poele_timer"
        with pytest.raises(charger("refus").RefusNomme) as e:
            lancer(m.async_enregistrer({"chauffages": {"id-poele": {"planning": True}}}))
        assert (e.value.code, e.value.nomme) == ("chauffage_programme_appareil", "switch.poele_timer")
        assert not (m.cfg["chauffages"].get("id-poele") or {}).get("planning"), "un refus n'ecrit rien"
        # Le reste de sa configuration s'ecrit : seul l'allumage attend.
        lancer(m.async_enregistrer({"chauffages": {"id-poele": {"fenetre": "eco"}}}))
        assert m.cfg["chauffages"]["id-poele"]["fenetre"] == "eco"
    else:
        assert "programme_appareil" not in poele["avertissements"] and poele["programme"] is None
        lancer(m.async_enregistrer({"chauffages": {"id-poele": {"planning": True}}}))
        assert m.cfg["chauffages"]["id-poele"]["planning"] is True
    assert all(a[0] != "switch" for a in m.hass.services.appels), "son programme n'est jamais commande"


def test_un_fil_pilote_sous_zha_est_reconnu_et_recoit_ses_ordres(creer):
    """Audit du 19/10 : sous ZHA, le NodOn publie « Comfort », « FrostProtection »,
    « ComfortMinus1 »… et son `unique_id` ne dit pas « pilot wire » — seule sa cle de
    traduction (`pilot_wire_mode`) le dit. Il etait ecarte en silence."""
    zha = "select.radiateur_salon_pilot_wire_mode"
    options = ["Off", "Comfort", "Eco", "FrostProtection", "ComfortMinus1", "ComfortMinus2"]
    entree = Entree(zha, "id-zha", platform="zha", unique_id="00:15:8d:00:01:a2:b3:c4-1", device_id="d-zha")
    entree.translation_key = "pilot_wire_mode"
    table = etats()
    table[zha] = FauxEtat("Eco", {"options": options})
    m = creer(table=table, registre=REGISTRE + [entree])
    salon = next(c for c in lancer(m.async_etat())["chauffages"] if c["cle"] == "id-zha")
    assert salon["famille"] == "fil_pilote" and salon["options"]["hors_gel"] == "FrostProtection"
    lancer(m.async_enregistrer({"chauffages": {"id-zha": {"planning": True}}}))
    assert m.hass.services.appels[-1] == ("select", "select_option", {"entity_id": [zha], "option": "Comfort"})


def test_un_poele_mcz_en_manuel_le_dit_sans_y_toucher(creer):
    """19/10 : en `manual`, le MCZ chauffe a puissance fixe ; la consigne du planning
    n'a plus d'effet. Loggia le DIT (`puissance_fixe`) et ne change pas son mode."""
    table = etats(poele_t=17)
    table[POELE] = FauxEtat("heat", {**ATTRS_POELE, "temperature": 17, "preset_mode": "manual"})
    m = creer(config(("id-poele", chauffage(POELE, "thermostat"))), table)
    lancer(m.async_evaluer())
    poele = next(c for c in lancer(m.async_etat())["chauffages"] if c["cle"] == "id-poele")
    assert "puissance_fixe" in poele["avertissements"]
    assert all(a[1] != "set_preset_mode" for a in m.hass.services.appels), "son mode est son choix"
    m.hass.states.table[POELE] = FauxEtat("heat", {**ATTRS_POELE, "temperature": 17, "preset_mode": "auto"})
    poele = next(c for c in lancer(m.async_etat())["chauffages"] if c["cle"] == "id-poele")
    assert "puissance_fixe" not in poele["avertissements"]


def test_un_planning_deja_allume_avec_le_programme_reste_allume_et_le_dit(creer):
    """Son cas : les deux etaient deja allumes. Le planning n'est pas coupe en silence ;
    l'avertissement le dit, et le reste de la configuration s'ecrit encore."""
    table = etats()
    table["switch.poele_timer"] = FauxEtat("on")
    m = creer(config(("id-poele", chauffage(POELE, "thermostat"))), table, registre=REGISTRE_TIMER)
    lancer(m.async_enregistrer({"chauffages": {"id-poele": {"planning": True, "fenetre": "eco"}}}))
    assert m.cfg["chauffages"]["id-poele"]["planning"] is True
    poele = next(c for c in lancer(m.async_etat())["chauffages"] if c["cle"] == "id-poele")
    assert "programme_appareil" in poele["avertissements"]


def test_passer_au_reel_applique_tout_de_suite(creer):
    """L'essai chez lui (§ 11) : pendant l'observation, l'ancien systeme
    commande encore — ses changements passent pour des gestes. A la bascule,
    on repart de ce que la maison EST : ces reprises-la tombent."""
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote")), simulation=True))
    m.reprises["id-rad"] = {"mode": "eco", "temperature": None, "fin": None,
                            "depuis": LUNDI_0700.isoformat(), "par": None}
    lancer(m.async_evaluer())
    lancer(m.async_enregistrer({"simulation": {"actif": False}}))
    assert m.reprises == {} and m._depot.contenu == {}
    assert m.hass.services.appels == [("select", "select_option", {"entity_id": [RAD], "option": "comfort"})]


def test_l_etat_dit_le_mode_la_source_la_fin_et_les_avertissements(creer):
    table = etats(sw="off")
    del table[VTH]
    # Deux `climate` hors registre (YAML sans unique_id) : celui qui recoit une consigne
    # est un thermostat, l'autre (des prereglages seuls) n'est pas un chauffage de Loggia.
    table["climate.cuisine"] = FauxEtat("heat", {"hvac_modes": ["heat", "off"], "supported_features": 1})
    table["climate.couloir"] = FauxEtat("heat", {"hvac_modes": ["heat", "off"], "supported_features": 16})
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote")), ("disparu", chauffage("climate.ancien", "thermostat"))),
              table)
    etat = lancer(m.async_etat())
    par_cle = {c["cle"]: c for c in etat["chauffages"]}
    rad = par_cle["id-rad"]
    assert (rad["mode"], rad["source"], rad["puis"]) == ("confort", "planning", "eco")
    assert rad["fin"] == "2026-10-12T08:30:00+02:00", "a l'heure de la maison, comme l'ecran la lit"
    assert rad["modes"] == ["confort", "confort_1", "confort_2", "eco", "hors_gel", "arret"]
    assert "module_coupe" in rad["avertissements"]
    assert par_cle["disparu"]["avertissements"] == ["introuvable"]
    assert par_cle["id-poele"]["planning"] is False and par_cle["id-poele"]["famille"] == "thermostat"
    assert par_cle["id-vth"]["avertissements"] == ["injoignable"], "au registre, sans etat : injoignable"
    assert par_cle["climate.cuisine"]["famille"] == "thermostat" and par_cle["climate.cuisine"]["planning"] is False
    assert "climate.couloir" not in par_cle, "des prereglages seuls : Home Assistant refuserait la consigne"
    assert etat["maison"]["mode"] == "planning" and etat["simulation"] is False


def test_l_etat_ecrit_ses_instants_a_l_heure_de_la_maison(creer):
    """L'ecran lit « jusqu'a 08:30 » dans la partie MURALE de la chaine, sans conversion
    (plan 2, choix 5) : l'etat ecrit donc ses instants dans le fuseau de la maison — en
    UTC, l'ecran dirait « 06:30 ». Les quatre sortes : maintenant, la fin d'un chauffage,
    la fin et le debut d'une reprise en main, la fin des vacances ; +02:00 en octobre,
    +01:00 a l'heure d'hiver. Le stockage, lui, ne change pas."""
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote")), ("id-poele", chauffage(POELE, "thermostat"))))
    lancer(m.async_reprendre_la_main("id-poele", temperature=21.5, fin=60))
    etat = lancer(m.async_etat())
    par_cle = {c["cle"]: c for c in etat["chauffages"]}
    assert etat["maintenant"] == "2026-10-12T07:00:00+02:00"
    assert par_cle["id-rad"]["fin"] == "2026-10-12T08:30:00+02:00", "la fin du creneau du planning"
    poele = par_cle["id-poele"]
    assert poele["fin"] == "2026-10-12T08:00:00+02:00", "la fin de la reprise en main"
    assert (poele["reprise"]["fin"], poele["reprise"]["depuis"]) == ("2026-10-12T08:00:00+02:00",
                                                                     "2026-10-12T07:00:00+02:00")
    assert (m.reprises["id-poele"]["fin"], m._depot.contenu["id-poele"]["depuis"]) == (
        "2026-10-12T06:00:00+00:00", "2026-10-12T05:00:00+00:00"), "les reprises se gardent telles quelles"
    # Les vacances, que l'ecran envoie en UTC (`toISOString`) : le 2 novembre a minuit, l'heure d'hiver.
    lancer(m.async_maison("vacances", "2026-11-01T23:00:00.000Z"))
    etat = lancer(m.async_etat())
    assert etat["maison"]["vacances_fin"] == "2026-11-02T00:00:00+01:00"
    assert m.cfg["maison"]["vacances_fin"] == "2026-11-01T23:00:00+00:00", "la configuration aussi"
    # Une chaine illisible (un etat abime en memoire) passe telle quelle.
    m.reprises["id-rad"] = {"mode": "eco", "temperature": None, "fin": "bientot", "depuis": "hier", "par": None}
    rad = chauffages_de(m)["id-rad"]
    assert (rad["fin"], rad["reprise"]["fin"], rad["reprise"]["depuis"]) == ("bientot", "bientot", "hier")


def test_un_chauffage_introuvable_se_nomme_par_l_entite_que_garde_sa_configuration(creer):
    """Renomme ou retire, un chauffage n'a plus de nom affiche : a defaut, l'entite que sa
    configuration retient. Deux chauffages perdus ne s'appellent plus « Chauffage » tous les
    deux — l'ecran les montre dans « En ce moment », pour qu'on supprime leur planning (§ 10)."""
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote")), ("disparu", chauffage("climate.ancien", "thermostat")),
                     ("fp-disparu", chauffage("select.ancien_module_pilot_wire_mode", "fil_pilote", planning=False))))
    par_cle = chauffages_de(m)
    assert [par_cle[k]["nom"] for k in ("disparu", "fp-disparu")] == ["climate.ancien", "select.ancien_module_pilot_wire_mode"]
    assert [par_cle[k]["entite"] for k in ("disparu", "fp-disparu")] == [None, None]
    assert [par_cle[k]["avertissements"] for k in ("disparu", "fp-disparu")] == [["introuvable"], ["introuvable"]]
    # Temoin : un chauffage present garde son nom.
    assert par_cle["id-rad"]["nom"] == "Radiateur bureau"


def test_un_compte_restreint_ne_voit_que_ses_chauffages(creer):
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote"))))
    user = types.SimpleNamespace(is_admin=False, permissions=types.SimpleNamespace(
        check_entity=lambda haid, quoi: haid == RAD))
    assert [c["entite"] for c in lancer(m.async_etat(user))["chauffages"]] == [RAD]


def test_un_compte_restreint_ne_lit_que_le_journal_de_ses_chauffages(creer):
    """Relecture finale du 12/10, point 4 — comme le distributeur (`_journal_pour`) : un compte
    restreint ne lit que les lignes des chauffages qu'il peut LIRE, et leurs seules cibles ; ni
    la maison (le nom de qui l'a changee), ni la fenetre d'une piece d'ailleurs, ni le nom de
    qui a repris la main. Un administrateur lit tout ; le journal du socle n'est pas touche."""
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote")), ("id-poele", chauffage(POELE, "thermostat"))),
              etats(rad="comfort"))
    lancer(m.async_reprendre_la_main("id-rad", mode="eco", par="u-lea", nom="Léa"))
    vieux = FauxEtat("heat", {**ATTRS_POELE, "temperature": 17})
    neuf = FauxEtat("heat", {**ATTRS_POELE, "temperature": 22})
    m.hass.states.table[POELE] = neuf
    m._sur_etat(Evenement(POELE, vieux, neuf))      # le poele, regle a la main
    m.hass.executer()
    lancer(m.async_fenetre(POELE, "Salon", True))
    lancer(m.async_maison("absence", nom="Léa"))
    socle = [dict(e) for e in lancer(m.regles.journal(module="chauffage"))]
    tout = lancer(m.async_etat())["journal"]
    assert tout == socle, "un administrateur lit tout"
    assert {"Léa", "geste fait ailleurs"} <= {e["detail"] for e in tout} and "Salon" in {e["motif"] for e in tout}

    def lu_par(*lisibles):
        user = types.SimpleNamespace(is_admin=False, permissions=types.SimpleNamespace(
            check_entity=lambda haid, quoi: haid in lisibles))
        return [(e["regle"], e["quoi"], e["motif"], e["detail"], e["cibles"])
                for e in lancer(m.async_etat(user))["journal"]]

    assert lu_par(RAD) == [("main", "Éco", "jusqu’à 08:30", "", [RAD]),
                           ("main", "reprise en main", "jusqu’à 08:30", "", [RAD])], "ses lignes, sans le nom de Léa"
    assert lu_par(POELE) == [("fenetre", "Arrêt", "Salon", "", [POELE]),
                             ("main", "reprise en main", "jusqu’à 08:30", "geste fait ailleurs", [POELE])], \
        "la piece de SON chauffage ; un geste fait ailleurs n'est le nom de personne"
    assert lu_par() == [], "qui ne lit aucun chauffage ne lit rien"
    assert lancer(m.regles.journal(module="chauffage")) == socle, "le journal du socle n'est pas touche"


def test_un_chauffage_introuvable_ne_se_publie_qu_aux_administrateurs(creer):
    """Relecture finale du 12/10, point 4 : renomme ou retire, un chauffage n'a d'autre geste
    que « Supprimer son planning », reserve aux administrateurs (spec § 10) — l'ecran ne le
    montrait deja qu'a eux (`lignesMoment`) ; le serveur ne le publie plus a personne d'autre."""
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote")), ("disparu", chauffage("climate.ancien", "thermostat"))))
    tout_lire = types.SimpleNamespace(check_entity=lambda haid, quoi: True)

    def cles(user):
        return [c["cle"] for c in lancer(m.async_etat(user))["chauffages"]]

    assert "disparu" not in cles(types.SimpleNamespace(is_admin=False, permissions=tout_lire))
    assert "id-rad" in cles(types.SimpleNamespace(is_admin=False, permissions=tout_lire)), "le reste se lit"
    assert "disparu" in cles(types.SimpleNamespace(is_admin=True, permissions=tout_lire))
    assert "disparu" in cles(None), "l'etat sans compte (les tests, le serveur lui-meme) le garde"


def test_un_planning_allume_se_compte_avant_les_droits(creer):
    """`plannings_allumes` se compte sur la configuration, AVANT le filtre des droits de
    lecture : un compte qui ne voit aucun chauffage au planning lirait sinon « aucun
    planning allume » a tort, quand la presence change bien la maison."""
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote")),
                     ("id-poele", chauffage(POELE, "thermostat", planning=False))))
    user = types.SimpleNamespace(is_admin=False, permissions=types.SimpleNamespace(
        check_entity=lambda haid, quoi: haid == POELE))
    etat = lancer(m.async_etat(user))
    assert [(c["cle"], c["planning"]) for c in etat["chauffages"]] == [("id-poele", False)]
    assert etat["plannings_allumes"] is True, "le radiateur au planning ne se voit pas, il compte"
    assert lancer(m.async_etat())["plannings_allumes"] is True
    eteints = creer(config(("id-rad", chauffage(RAD, "fil_pilote", planning=False))))
    assert lancer(eteints.async_etat())["plannings_allumes"] is False
    assert lancer(creer().async_etat())["plannings_allumes"] is False, "rien de configure"


def test_un_fil_pilote_se_nomme_comme_son_appareil(creer, monkeypatch):
    """Sous zigbee2mqtt, le `select` d'un module s'affiche « Radiateur Bureau Pilot
    wire mode » : le chauffage prend le nom de son APPAREIL (`name_by_user`, sinon
    `name`), comme sa zone a l'ecran (`resolve.js`, decision du 10/10). Un
    thermostat garde le sien."""
    table = etats()
    table[RAD] = FauxEtat("eco", {"options": NODON, "friendly_name": "Radiateur Bureau Pilot wire mode"})
    table[POELE] = FauxEtat("heat", {**ATTRS_POELE, "temperature": 17, "friendly_name": "Poêle"})
    fiches = {"d-rad": types.SimpleNamespace(name="SIN-4-FP-21", name_by_user="Radiateur Bureau"),
              "d-poele": types.SimpleNamespace(name="Maestro", name_by_user="Poêle du séjour")}
    reg = types.SimpleNamespace(async_get=fiches.get)
    dr = sys.modules["homeassistant.helpers.device_registry"]
    monkeypatch.setattr(dr, "async_get", lambda hass: reg, raising=False)
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote"))), table)
    par_cle = chauffages_de(m)
    assert par_cle["id-rad"]["nom"] == "Radiateur Bureau", "le nom donne a l'appareil, pas celui de son select"
    assert par_cle["id-poele"]["nom"] == "Poêle", "un thermostat garde son nom affiche"
    fiches["d-rad"].name_by_user = None
    assert chauffages_de(m)["id-rad"]["nom"] == "SIN-4-FP-21", "jamais renomme : le nom de l'appareil"
    del fiches["d-rad"]
    assert chauffages_de(m)["id-rad"]["nom"] == "Radiateur Bureau Pilot wire mode", \
        "un appareil que le registre ne connait pas : le nom affiche"

    def illisible(hass):
        raise RuntimeError("registre des appareils illisible")

    monkeypatch.setattr(dr, "async_get", illisible, raising=False)
    assert chauffages_de(m)["id-rad"]["nom"] == "Radiateur Bureau Pilot wire mode", \
        "un registre illisible ne prive pas l'etat de son nom"


# -- La journee du planning : le serveur la donne (plan 2, choix 4) -----------
#
# L'ecran n'embarque pas le calcul du planning dans son paquet de demarrage :
# l'etat lui donne les bandes d'aujourd'hui (`jour`) — la fiche y lit le mode que
# le planning a maintenant (« Reprendre le planning · Confort ») —, la minute
# murale de maintenant (`minute`) et, pour un fil pilote, ses options
# (`options`). La carte n'a plus de barre depuis sa maquette du 11/10 (cartes
# 1a) : la reprise en main bornee a aujourd'hui (`main`), que seule sa barre
# lisait, a quitte l'etat (relecture finale du 12/10, point 5).

OUVRES = [{"h": "06:30", "mode": "confort"}, {"h": "08:30", "mode": "eco"},
          {"h": "18:00", "mode": "confort"}, {"h": "22:30", "mode": "eco"}]
REPOS = [{"h": "08:00", "mode": "confort"}, {"h": "22:30", "mode": "eco"}]
SEMAINE_TYPE = {j: list(REPOS if j in ("sam", "dim") else OUVRES)
                for j in ("lun", "mar", "mer", "jeu", "ven", "sam", "dim")}
# Lundi 12 octobre 2026, 10:00 a Paris.
LUNDI_1000 = paris(2026, 10, 12, 10)


def chauffages_de(m):
    """Les chauffages de l'etat, par cle, tels que l'ecran les recoit."""
    return {c["cle"]: c for c in lancer(m.async_etat())["chauffages"]}


def test_l_etat_donne_la_journee_du_planning_en_minutes_murales(creer):
    """Contigues de 0 a 1440 ; le mode de minuit est la fin de la veille (l'Eco de dimanche 22:30)."""
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote", semaine=SEMAINE_TYPE))), maintenant=LUNDI_1000)
    assert chauffages_de(m)["id-rad"]["jour"] == [
        {"de": 0, "a": 390, "mode": "eco"}, {"de": 390, "a": 510, "mode": "confort"},
        {"de": 510, "a": 1080, "mode": "eco"}, {"de": 1080, "a": 1350, "mode": "confort"},
        {"de": 1350, "a": 1440, "mode": "eco"}]


@pytest.mark.parametrize("maison,mode", [({"mode": "ete"}, "arret"),
                                         ({"mode": "absence", "absence": "eco"}, "eco"),
                                         ({"mode": "vacances", "vacances": "hors_gel"}, "hors_gel")])
def test_la_journee_applique_le_mode_de_la_maison(creer, maison, mode):
    """Ete, Absence, Vacances : deux bandes voisines du meme mode n'en font qu'une
    (en Absence, les Confort baissent a l'Eco et toutes les bandes se fondent)."""
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote", semaine=SEMAINE_TYPE)), maison=maison),
              maintenant=LUNDI_1000)
    assert chauffages_de(m)["id-rad"]["jour"] == [{"de": 0, "a": 1440, "mode": mode}]


def test_sans_planning_allume_pas_de_journee(creer):
    """ASSERTIONS MODIFIEES (relecture finale du 12/10, point 5) : elles disaient aussi « ni
    reprise du jour » (`main`) ; ce champ a quitte l'etat — aucun chauffage ne le porte plus."""
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote", planning=False))), maintenant=LUNDI_1000)
    m.reprises["id-rad"] = {"mode": "eco", "temperature": None, "fin": None,
                            "depuis": LUNDI_0700.isoformat(), "par": None}
    par_cle = chauffages_de(m)
    assert par_cle["id-rad"]["jour"] is None
    assert par_cle["id-poele"]["jour"] is None, "connu, jamais configure"
    assert not any("main" in c for c in par_cle.values())


def test_la_journee_reste_celle_du_planning_pendant_une_reprise(creer):
    """Une reprise en main en cours ne change pas la journee (`jour`) : c'est celle du
    planning, ou la fiche lit ce que « Reprendre le planning » remettra. REMPLACE (relecture
    finale du 12/10, point 5) les quatre cas de la reprise bornee a aujourd'hui (`main`),
    retiree de l'etat ; reste ici sa derniere assertion, celle de la journee."""
    m = creer(config(("id-poele", chauffage(POELE, "thermostat"))), maintenant=paris(2026, 10, 12, 18))
    m.reprises["id-poele"] = {"mode": None, "temperature": 21.5, "fin": paris(2026, 10, 12, 21).isoformat(),
                              "depuis": paris(2026, 10, 12, 17).isoformat(), "par": None}
    poele = chauffages_de(m)["id-poele"]
    assert poele["source"] == "main"
    assert poele["jour"][3] == {"de": 1080, "a": 1350, "mode": "confort"}, "la journee reste celle du planning"


def test_l_etat_dit_la_minute_murale_de_maintenant(creer):
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote"))), maintenant=LUNDI_1000)
    assert lancer(m.async_etat())["minute"] == [0, 600]
    # Le second passage de 02:00-03:00, le 25 octobre : l'horloge du planning, qui ne recule pas.
    m.horloge = datetime(2026, 10, 25, 1, 15, tzinfo=UTC)
    assert lancer(m.async_etat())["minute"] == [6, 179]


def test_l_etat_donne_les_options_du_module_telles_qu_il_les_ecrit(creer):
    """Planning eteint, la carte commande le `select` elle-meme : `select_option`
    refuse une option que le module ne propose pas sous cette graphie."""
    m = creer(config(("id-poele", chauffage(POELE, "thermostat")),
                     ("disparu", chauffage("select.ancien_pilot_wire_mode", "fil_pilote"))))
    par_cle = chauffages_de(m)
    assert par_cle["id-rad"]["options"] == {"confort": "comfort", "confort_1": "comfort_-1",
                                            "confort_2": "comfort_-2", "eco": "eco",
                                            "hors_gel": "frost_protection", "arret": "off"}
    assert par_cle["id-poele"]["options"] is None and par_cle["id-vth"]["options"] is None
    assert par_cle["disparu"]["options"] is None, "introuvable : rien a commander"


# -- La fenetre, et le mode reellement applique (plan 2, tache 10 bis B) ---------
#
# L'ecran disait « Fenetre : fermee » pour une piece que la regle des fenetres ne
# suit pas — une protection qui n'existait pas —, et « Arret » quand le moteur
# appliquait le Hors-gel d'un thermostat sans `off`. Le serveur dit la verite.

class FausseRegle:
    """La regle des fenetres, vue du moteur : les chauffages qu'elle surveille, ceux dont
    un ouvrant est ouvert maintenant, et si elle observe sans agir. Elle garde les tables
    {interrupteur: select} qu'on lui passe. DOUBLURE MODIFIEE (relecture du 12/10, point 1) :
    le moteur lui pose UNE question par etat (`veille`), plus une par chauffage (`surveille`)."""

    def __init__(self, suivis=(), ouverts=(), observe=False):
        self.suivis = set(suivis)
        self.ouverts = set(ouverts)
        self.simulation = observe
        self.tables = []

    def veille(self, table):
        self.tables.append(table)
        return {haid: haid in self.ouverts for haid in self.suivis}

    def observe(self):
        return self.simulation


def test_la_fenetre_ne_se_dit_que_si_la_regle_surveille_ce_chauffage(creer):
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote")), ("id-poele", chauffage(POELE, "thermostat"))))
    par_cle = chauffages_de(m)
    assert (par_cle["id-rad"]["fenetre_ouverte"], par_cle["id-poele"]["fenetre_ouverte"]) == (None, None), \
        "sans regle des fenetres, aucune fenetre a dire"
    m.hass.data = {"loggia": {"chauffage": m, "fenetres": FausseRegle([RAD])}}
    par_cle = chauffages_de(m)
    assert par_cle["id-rad"]["fenetre_ouverte"] is False, "surveille, et fermee"
    assert par_cle["id-poele"]["fenetre_ouverte"] is None, "une piece que la regle ne suit pas : pas de protection promise"
    # Un fait d'ouverture se dit toujours : le moteur agit dessus.
    lancer(m.async_fenetre(RAD, "Bureau", True))
    assert chauffages_de(m)["id-rad"]["fenetre_ouverte"] is True
    # Une regle qui ne repond pas ne surveille rien.

    class Cassee:
        # DOUBLURE MODIFIEE (relecture du 12/10, point 1) : la question est `veille`, une par etat.
        def veille(self, table):
            raise RuntimeError("panne")

        def observe(self):
            raise RuntimeError("panne")

    m.hass.data["loggia"]["fenetres"] = Cassee()
    assert chauffages_de(m)["id-poele"]["fenetre_ouverte"] is None


def test_la_fenetre_avec_la_vraie_regle_surveillee_puis_coupee(creer):
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote"))), etats(rad="comfort"))
    f = regle_des_fenetres(m)
    m.hass.data["loggia"]["fenetres"] = f
    m.hass.states.table[FENETRE] = FauxEtat("off")
    par_cle = chauffages_de(m)
    assert par_cle["id-rad"]["fenetre_ouverte"] is False, "la piece du Bureau le surveille"
    assert par_cle["id-poele"]["fenetre_ouverte"] is None, "aucune piece ne compte le poele"
    f.cfg["actif"] = False
    assert chauffages_de(m)["id-rad"]["fenetre_ouverte"] is None, "la regle coupee ne coupera rien"


def test_l_etat_dit_le_mode_reellement_applique_et_celui_d_une_ouverture(creer):
    """`mode` reste le mode VOULU, que la logique lit ; `applique` est celui que le moteur
    envoie (`mode_applicable`), `fenetre_mode` celui qu'une ouverture appliquerait."""
    # Un thermostat sans `off` : a l'ouverture, l'Arret voulu devient son Hors-gel.
    table = etats()
    table[POELE] = FauxEtat("heat", {"hvac_modes": ["heat"], "min_temp": 5, "max_temp": 35, "temperature": 20})
    m = creer(config(("id-poele", chauffage(POELE, "thermostat"))), table)
    lancer(m.async_fenetre(POELE, "Salon", True))
    poele = chauffages_de(m)["id-poele"]
    assert (poele["mode"], poele["source"], poele["applique"], poele["fenetre_mode"]) == ("arret", "fenetre", "hors_gel", "hors_gel")
    # Un module qui a perdu son option Eco : son Hors-gel, au planning comme a l'ouverture.
    table = etats()
    table[RAD] = FauxEtat("comfort", {"options": ["comfort", "frost_protection", "off"]})
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote", fenetre="eco"))), table, maintenant=LUNDI_1000)
    rad = chauffages_de(m)["id-rad"]
    assert (rad["mode"], rad["applique"], rad["fenetre_mode"]) == ("eco", "hors_gel", "hors_gel")
    # Ce qu'il comprend passe tel quel ; « ne rien faire » n'a pas de mode ; une consigne a la
    # main non plus ; un chauffage jamais configure n'a aucun mode en cours.
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote", fenetre="rien")),
                     ("id-poele", chauffage(POELE, "thermostat"))), maintenant=LUNDI_1000)
    m.reprises["id-poele"] = {"mode": None, "temperature": 21.5, "fin": None, "depuis": LUNDI_0700.isoformat(), "par": None}
    par_cle = chauffages_de(m)
    assert (par_cle["id-rad"]["mode"], par_cle["id-rad"]["applique"], par_cle["id-rad"]["fenetre_mode"]) == ("eco", "eco", None)
    assert (par_cle["id-poele"]["mode"], par_cle["id-poele"]["applique"], par_cle["id-poele"]["fenetre_mode"]) == (None, None, "arret")
    assert (par_cle["id-vth"]["mode"], par_cle["id-vth"]["applique"], par_cle["id-vth"]["fenetre_mode"]) == (None, None, "arret")


# -- Relecture du 12/10 ----------------------------------------------------------
#
# Point 3 : sans etat, les modes d'un chauffage ne sont qu'une supposition tiree de
# sa famille — un thermostat introuvable en Ete disait `applique: hors_gel`, quand le
# moteur ne lui envoie rien. Point 1 : la regle des fenetres, interrogee chauffage par
# chauffage, refaisait `candidats` pour chaque interrupteur de chaque piece. Point 2 :
# son « Observer sans agir ». Point 4 : l'ouvrant MAINTENANT, avant le delai.

SEPT_JOURS = ("lun", "mar", "mer", "jeu", "ven", "sam", "dim")


def test_sans_etat_ni_mode_applique_ni_mode_d_ouverture(creer):
    table = etats()
    del table[VTH]                                  # au registre, sans etat : injoignable
    m = creer(config(("disparu", chauffage("climate.disparu", "thermostat")),
                     ("fp-disparu", chauffage("select.disparu_pilot_wire_mode", "fil_pilote")),
                     ("id-vth", chauffage(VTH, "vtherm")), maison={"mode": "ete"}), table)
    par_cle = chauffages_de(m)
    for cle, avertissement in (("disparu", "introuvable"), ("fp-disparu", "introuvable"), ("id-vth", "injoignable")):
        c = par_cle[cle]
        assert c["avertissements"] == [avertissement], cle
        assert (c["mode"], c["applique"], c["fenetre_mode"]) == ("arret", None, None), \
            cle + " : le mode voulu reste, rien n'est applique ni ne le serait a l'ouverture"
    # Temoin : injoignable mais encore decrit — Home Assistant garde les capacites d'une entite
    # indisponible (`hvac_modes`) —, il dit ce qu'il recevra a son retour : l'Arret d'un
    # thermostat sans `off` est son Hors-gel.
    table = etats()
    table[POELE] = FauxEtat("unavailable", {"hvac_modes": ["heat"], "min_temp": 5, "max_temp": 35})
    poele = chauffages_de(creer(config(("id-poele", chauffage(POELE, "thermostat")), maison={"mode": "ete"}),
                                table))["id-poele"]
    assert poele["avertissements"] == ["injoignable"]
    assert (poele["mode"], poele["applique"], poele["fenetre_mode"]) == ("arret", "hors_gel", "hors_gel")


def test_un_vtherm_dit_le_repli_qu_il_recoit(creer):
    """Confort −1 n'existe pas pour un VTherm : il recoit le Confort. Sans prereglage `eco`,
    l'Eco lui arrive en Hors-gel (`mode_applicable`) ; sans `off`, l'Arret d'une ouverture aussi."""
    semaine = {j: [{"h": "06:00", "mode": "confort_1"}, {"h": "22:00", "mode": "eco"}] for j in SEPT_JOURS}
    vth = chauffages_de(creer(config(("id-vth", chauffage(VTH, "vtherm", semaine=semaine)))))["id-vth"]
    assert vth["modes"] == ["confort", "eco", "hors_gel", "arret"]
    assert (vth["mode"], vth["applique"], vth["fenetre_mode"]) == ("confort_1", "confort", "arret")
    table = etats()
    table[VTH] = FauxEtat("heat", {"hvac_modes": ["heat"], "preset_modes": ["none", "frost", "comfort"],
                                   "preset_mode": "comfort"})
    eco = {j: [{"h": "06:00", "mode": "eco"}] for j in SEPT_JOURS}
    vth = chauffages_de(creer(config(("id-vth", chauffage(VTH, "vtherm", semaine=eco))), table))["id-vth"]
    assert vth["modes"] == ["confort", "hors_gel"]
    assert (vth["mode"], vth["applique"], vth["fenetre_mode"]) == ("eco", "hors_gel", "hors_gel")


def maison_de_modules(n):
    """`n` modules fil pilote, chacun dans sa piece : la piece compte le module par son
    INTERRUPTEUR, a cote d'une prise « Radiateur » qui a son propre appareil — le chemin
    qui refaisait `candidats`. Une fenetre sur deux est ouverte. Rend (registre, etats,
    pieces de la regle des fenetres, chauffages configures)."""
    registre, table, pieces, paires = list(REGISTRE), etats(), {}, []
    for i in range(n):
        sel, sw, prise = "select.rad_%d_pilot_wire_mode" % i, "switch.rad_%d" % i, "switch.prise_radiateur_%d" % i
        registre += [Entree(sel, "id-m%d" % i, unique_id="0x%d_pilot_wire_mode" % i, device_id="d-m%d" % i),
                     Entree(sw, "id-m%d-sw" % i, device_id="d-m%d" % i),
                     Entree(prise, "id-p%d" % i, device_id="d-p%d" % i)]
        table.update({sel: FauxEtat("eco", {"options": NODON}), sw: FauxEtat("on"), prise: FauxEtat("on"),
                      "binary_sensor.fenetre_%d" % i: FauxEtat("on" if i % 2 else "off")})
        pieces["Piece %d" % i] = {"actif": True, "ouvrants": ["binary_sensor.fenetre_%d" % i], "chauffages": [prise, sw]}
        paires.append(("id-m%d" % i, chauffage(sel, "fil_pilote")))
    return registre, table, pieces, paires


def regle_sur(m, pieces, delai=3, simulation=False):
    """La VRAIE regle des fenetres, branchee sur le moteur `m` : ses pieces, son delai."""
    module = charger("fenetres")
    f = module.LoggiaFenetres.__new__(module.LoggiaFenetres)
    f.hass, f.store, f.regles = m.hass, m.store, m.regles
    f.cfg = {"actif": True, "delai": delai, "simulation": simulation, "pieces": pieces}
    f.coupes, f._minuteurs, f._defait = {}, {}, []
    m.hass.data = {"loggia": {"chauffage": m, "fenetres": f}}
    return f


@pytest.mark.parametrize("n", [1, 6])
def test_l_etat_reconnait_les_chauffages_une_seule_fois_quel_que_soit_leur_nombre(creer, n):
    """IMPORTANT (point 1) : `_fenetre_dite` demandait `surveille` pour CHAQUE chauffage, qui
    refaisait `candidats` pour chaque interrupteur de chaque piece — 43 fois par etat pour
    2 000 entites et six pieces, un quart de seconde sur la boucle d'evenements. L'etat pose
    UNE question a la regle, avec la table {interrupteur: select} faite d'un seul passage."""
    registre, table, pieces, paires = maison_de_modules(n)
    m = creer(config(*paires), table, registre=registre)
    f = regle_sur(m, pieces)
    appels, questions = [], []
    reconnaitre, veiller = m.candidats, f.veille
    m.candidats = lambda: appels.append(1) or reconnaitre()
    f.veille = lambda table=None: questions.append(table) or veiller(table)
    par_cle = chauffages_de(m)
    assert len(appels) == 1, "un seul passage sur les chauffages par etat, quel que soit leur nombre"
    assert len(questions) == 1, "une seule question a la regle des fenetres par etat"
    assert questions[0] == {"switch.radiateur_bureau": RAD,
                            **{"switch.rad_%d" % i: "select.rad_%d_pilot_wire_mode" % i for i in range(n)}}, \
        "la table des modules : chaque interrupteur vers son select, les prises n'y sont pas"
    for i in range(n):
        c = par_cle["id-m%d" % i]
        # ASSERTION RETIREE (relecture finale du 12/10, point 5) : `f.surveille(...)`, la
        # question isolee, est partie avec `surveilles` et `_table_des_modules` — plus
        # rien, hors des tests, ne la posait.
        assert (c["fenetre_ouverte"], c["ouvrant_ouvert"]) == (False, bool(i % 2)), \
            "compte par son interrupteur, le module est surveille sous son select"
    assert (par_cle["id-rad"]["fenetre_ouverte"], par_cle["id-rad"]["ouvrant_ouvert"]) == (None, None), \
        "un module qu'aucune piece ne compte"
    m.hass.data = {"loggia": {"chauffage": m}}
    appels.clear()
    chauffages_de(m)
    assert len(appels) == 1, "sans regle des fenetres, pas davantage"


def test_la_table_des_modules_dit_ce_que_dit_select_du_module(creer, module):
    """Une seule regle pour l'interrupteur d'un module : la table d'un etat
    (`select_par_interrupteur`) et la question isolee (`select_du_module`) disent pareil —
    prise sans module, interrupteur sans appareil, appareil a deux `select` fil pilote."""
    registre, table, _, paires = maison_de_modules(3)
    registre += [Entree("switch.sans_appareil", "id-sa"),
                 Entree("select.double_a_pilot_wire_mode", "id-da", unique_id="da_pilot_wire_mode", device_id="d-double"),
                 Entree("select.double_b_pilot_wire_mode", "id-db", unique_id="db_pilot_wire_mode", device_id="d-double"),
                 Entree("switch.double", "id-dsw", device_id="d-double")]
    table.update({"select.double_a_pilot_wire_mode": FauxEtat("eco", {"options": NODON}),
                  "select.double_b_pilot_wire_mode": FauxEtat("eco", {"options": NODON})})
    m = creer(config(*paires), table, registre=registre)
    t = module.select_par_interrupteur(m.candidats(), m._entrees())
    for e in registre:
        assert t.get(e.entity_id) == m.select_du_module(e.entity_id), e.entity_id
    assert t["switch.double"] == "select.double_a_pilot_wire_mode", "le premier reconnu"
    assert "switch.prise_radiateur_0" not in t and "switch.sans_appareil" not in t
    assert module.select_par_interrupteur({}, m._entrees()) == {}, "aucun module : rien a parcourir"


def test_l_etat_dit_l_ouvrant_ouvert_avant_le_delai_et_apres_un_redemarrage(creer):
    """IMPORTANT (point 4) : le fait d'ouverture n'arrive au moteur qu'APRES le delai de la
    regle (3 min par defaut, jusqu'a 60), et se perd au redemarrage — fenetre grande ouverte,
    la fiche disait « Fermee » en vert. `ouvrant_ouvert` dit l'ouvrant MAINTENANT ;
    `fenetre_ouverte` garde le fait (la regle coupe, ou le moteur coupe)."""
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote")), ("id-poele", chauffage(POELE, "thermostat"))),
              etats(rad="comfort"))
    f = regle_des_fenetres(m)                       # le Bureau : sa fenetre ouverte, le radiateur
    f.cfg["delai"] = 3
    m.hass.data["loggia"]["fenetres"] = f
    lancer(f._async_piece("Bureau"))                # le delai s'arme : le fait attend
    assert f._minuteurs and m.fenetre_ouverte(RAD) is False
    par_cle = chauffages_de(m)
    assert (par_cle["id-rad"]["ouvrant_ouvert"], par_cle["id-rad"]["fenetre_ouverte"]) == (True, False), \
        "ouverte, le delai court : pas encore coupee"
    assert (par_cle["id-poele"]["ouvrant_ouvert"], par_cle["id-poele"]["fenetre_ouverte"]) == (None, None), \
        "une piece que la regle ne suit pas"
    lancer(f._async_couper("Bureau"))               # le delai passe : le fait arrive, le moteur coupe
    assert (chauffages_de(m)["id-rad"]["ouvrant_ouvert"], chauffages_de(m)["id-rad"]["fenetre_ouverte"]) == (True, True)
    m.fenetres.clear()                              # un redemarrage : les faits vivent en memoire
    assert (chauffages_de(m)["id-rad"]["ouvrant_ouvert"], chauffages_de(m)["id-rad"]["fenetre_ouverte"]) == (True, False)
    m.hass.states.table[FENETRE] = FauxEtat("off")
    assert chauffages_de(m)["id-rad"]["ouvrant_ouvert"] is False, "refermee, ce qu'il voit tout de suite"
    # « Ouvert » comme pour couper : `open` d'un cover compte, un capteur muet non.
    m.hass.states.table[FENETRE] = FauxEtat("open")
    assert chauffages_de(m)["id-rad"]["ouvrant_ouvert"] is True
    m.hass.states.table[FENETRE] = FauxEtat("unavailable")
    assert chauffages_de(m)["id-rad"]["ouvrant_ouvert"] is False
    f.cfg["actif"] = False
    assert chauffages_de(m)["id-rad"]["ouvrant_ouvert"] is None, "la regle coupee ne surveille rien"


def test_l_etat_dit_si_la_regle_des_fenetres_observe_sans_agir(creer):
    """IMPORTANT (point 2) : hors planning, la fiche promet « A l'ouverture : Arret » ; en
    « Observer sans agir », la regle des fenetres ne coupe rien — elle a son propre drapeau,
    que `surveille` ignorait. Le moteur le publie a la racine de son etat."""
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote", planning=False))), etats(rad="comfort"))
    assert lancer(m.async_etat())["fenetres_observe"] is False, "sans regle des fenetres"
    f = regle_des_fenetres(m)
    m.hass.data["loggia"]["fenetres"] = f
    assert lancer(m.async_etat())["fenetres_observe"] is False, "la regle agit"
    f.cfg["simulation"] = True
    etat = lancer(m.async_etat())
    assert etat["fenetres_observe"] is True, "elle observe : hors planning, rien ne coupera"
    assert etat["simulation"] is False, "le drapeau du moteur reste le sien"
    rad = next(c for c in etat["chauffages"] if c["cle"] == "id-rad")
    assert (rad["fenetre_ouverte"], rad["ouvrant_ouvert"]) == (False, True), "elle surveille et voit toujours"
    lancer(f._async_couper("Bureau"))
    assert m.hass.services.appels == [], "et ne coupe rien"
    m.hass.data["loggia"]["fenetres"] = FausseRegle(observe=True)
    assert lancer(m.async_etat())["fenetres_observe"] is True

    class Cassee:
        def veille(self, table):
            raise RuntimeError("panne")

        def observe(self):
            raise RuntimeError("panne")

    m.hass.data["loggia"]["fenetres"] = Cassee()
    assert lancer(m.async_etat())["fenetres_observe"] is False, "une regle en panne ne promet rien"


# -- Un moteur arrete ne prend plus de demande de la maison ------------------

@pytest.mark.parametrize("demande", ["depart", "depart_observe", "retour", "maison", "ete_sans_droit",
                                     "configuration"])
def test_une_demande_de_la_maison_deja_partie_ne_fait_rien_quand_le_moteur_s_arrete(creer, demande):
    """Apres un rechargement, l'ancien moteur et le nouveau lisent le meme magasin : une
    presence, un mode de la maison ou une configuration partis avant l'arret, mais qui n'ont
    pas encore tourne, n'ecrivent rien, ne journalisent rien, ne commandent rien et ne levent
    aucune erreur -- pas meme le refus nomme d'Ete."""
    absente = {"mode": "absence"} if demande == "retour" else None
    depart = None if demande == "configuration" else config(("id-rad", chauffage(RAD, "fil_pilote")), maison=absente)
    m = creer(depart, etats(rad="eco" if demande in ("retour", "configuration") else "comfort"))
    avant = m.cfg
    demandes = {"depart": lambda: m.async_presence(True),
                "depart_observe": lambda: m.async_presence(True, simuler=True),
                "retour": lambda: m.async_presence(False),
                "maison": lambda: m.async_maison("absence", admin=True),
                "ete_sans_droit": lambda: m.async_maison("ete"),
                "configuration": lambda: m.async_enregistrer({"chauffages": {"id-rad": {"planning": True}}})}
    attendu = {"depart": False, "depart_observe": False, "retour": False, "maison": None, "ete_sans_droit": None,
               "configuration": avant}

    async def scenario():
        tache = asyncio.ensure_future(demandes[demande]())
        m.async_arreter()                           # la demande est partie, elle n'a pas encore tourne
        return await asyncio.wait_for(tache, 5)

    assert lancer(scenario()) == attendu[demande]
    assert m.cfg is avant, "ni le mode de la maison ni la configuration ne bougent"
    assert m.store._store.ecritures == 0 and m._depot.ecritures == 0, "rien n'est ecrit"
    assert m.hass.services.appels == [] and journal(m) == [], "rien n'est commande ni journalise"


def test_apres_l_arret_un_fait_de_fenetre_ne_commande_rien(creer):
    """Un fait de fenetre n'est que de la memoire : l'evaluation qu'il declenche a ses gardes."""
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote"))), etats(rad="comfort"))
    m.async_arreter()
    lancer(m.async_fenetre(RAD, "Bureau", True))
    assert m.hass.services.appels == [] and journal(m) == []


def test_une_configuration_arretee_en_pleine_ecriture_va_au_bout_sans_rien_commander(creer):
    """Le moteur s'arrete pendant que le magasin ecrit la configuration : elle est gardee (le
    moteur suivant la relit), mais ni ecoute ni ordre ne partent."""
    m = creer()
    ecrire = m.store._store.async_save

    async def scenario():
        en_vol, libere = asyncio.Event(), asyncio.Event()

        async def lent(donnees):
            en_vol.set()
            await libere.wait()
            await ecrire(donnees)

        m.store._store.async_save = lent
        demande = asyncio.ensure_future(m.async_enregistrer({"chauffages": {"id-rad": {"planning": True}}}))
        await asyncio.wait_for(en_vol.wait(), 5)
        m.async_arreter()
        libere.set()
        await asyncio.wait_for(demande, 5)

    lancer(scenario())
    assert lancer(m.store.async_get_shared("loggia_chauffage"))["chauffages"]["id-rad"]["planning"] is True
    assert m.hass.services.appels == [] and m._ecoute is None, "mais le moteur arrete ne commande ni n'ecoute plus"


def test_une_configuration_arretee_en_pleine_ecriture_ecrit_quand_meme_la_purge_des_reprises(creer):
    """Le moteur s'arrete pendant que la configuration s'ecrit : couper un planning
    emporte sa reprise, et cette purge s'ecrit aussi (le moteur suivant relit le fichier)."""
    m = creer(config(("id-poele", chauffage(POELE, "thermostat"))), etats(poele_t=17))
    reprise = {"mode": "eco", "temperature": None, "fin": None, "depuis": LUNDI_0700.isoformat(), "par": None}
    m.reprises["id-poele"] = dict(reprise)
    m._depot = FauxStore({"id-poele": dict(reprise)})
    ecrire = m.store._store.async_save

    async def scenario():
        en_vol, libere = asyncio.Event(), asyncio.Event()

        async def lent(donnees):
            en_vol.set()
            await libere.wait()
            await ecrire(donnees)

        m.store._store.async_save = lent
        demande = asyncio.ensure_future(m.async_enregistrer({"chauffages": {"id-poele": {"planning": False}}}))
        await asyncio.wait_for(en_vol.wait(), 5)
        m.async_arreter()
        libere.set()
        await asyncio.wait_for(demande, 5)

    lancer(scenario())
    assert lancer(m.store.async_get_shared("loggia_chauffage"))["chauffages"]["id-poele"]["planning"] is False
    assert m._depot.contenu == {} and m._depot.ecritures == 1, "la reprise du planning coupe quitte le fichier"
    assert m.hass.services.appels == [] and m._ecoute is None, "mais le moteur arrete ne commande ni n'ecoute plus"


# ── Le branchement ──────────────────────────────────────────────────────────

def test_le_moteur_est_branche_dans_le_composant():
    from conftest import COMPOSANT

    from conftest import declaration

    init = (COMPOSANT / "__init__.py").read_text(encoding="utf-8")
    # ASSERTION MODIFIEE (lot 8, 30/10 ; ADR 0291) : les modules naissent d'une table (`MODULES`),
    # les commandes sont des lignes de `COMMANDES`, et un seul `acces(nom)` amene les modules au WebSocket.
    assert 'Module("chauffage", "LoggiaChauffage", _REGLES, _REGLES,' in init
    assert "async_register_ws(hass, store, lambda nom: hass.data.get(DOMAIN, {}).get(nom))" in init
    assert init.index('Module("chauffage",') < init.index('Module("fenetres",'), \
        "le moteur nait avant les regles qui lui donnent leurs faits"
    bloc = init.split("MODULES_VIVANTS = (")[1].split(")")[0]
    assert '"chauffage"' in bloc and bloc.rstrip().endswith('"regles",'), "regles reste le dernier a s'arreter"
    ws = (COMPOSANT / "websocket_api.py").read_text(encoding="utf-8")
    for c in ("WS_CHA_ETAT", "WS_CHA_MAIN", "WS_CHA_MAISON", "WS_CHA_CONFIG"):
        assert 'module="chauffage"' in declaration(ws, "Commande(%s," % c), c


# -- L'observation laisse la main a la fenetre et a la presence ---------------
#
# Observer sans agir : le moteur calcule et note, rien ne part. S'il se disait chef
# des chauffages au planning, la regle des fenetres et la presence les lui
# laisseraient, et plus personne ne couperait pendant les jours d'observation.
# Ici le VRAI moteur avec les VRAIES regles, sur un meme Home Assistant et un meme socle.

FENETRE = "binary_sensor.fenetre_bureau"


def regle_des_fenetres(m):
    module = charger("fenetres")
    f = module.LoggiaFenetres.__new__(module.LoggiaFenetres)
    f.hass, f.store, f.regles = m.hass, m.store, m.regles
    f.cfg = {"actif": True, "delai": 0, "pieces": {
        "Bureau": {"actif": True, "ouvrants": [FENETRE], "chauffages": [RAD]}}}
    f.coupes, f._minuteurs, f._defait = {}, {}, []
    m.hass.data = {"loggia": {"chauffage": m}}
    m.hass.states.table[FENETRE] = FauxEtat("on")
    return f


def presence_sur(m):
    module = charger("presence")
    p = module.LoggiaPresence.__new__(module.LoggiaPresence)
    p.hass, p.store, p.regles = m.hass, m.store, m.regles
    p.cfg = {"actif": True, "delai_depart": 0, "personnes": ["person.a"],
             "depart": {"lumieres": False, "chauffage": {"actif": True, "consigne": 16}}}
    p.eteintes, p.consignes, p.dehors = {}, {}, False
    p._minuteur = p._minuteur_invite = p._absents_avant = p.dernier_indice = None
    p._indice_note, p._defait = False, []
    m.hass.data = {"loggia": {"chauffage": m}}
    m.hass.states.table["person.a"] = FauxEtat("not_home")
    return p


def test_en_observation_la_regle_des_fenetres_coupe_elle_meme_le_fil_pilote_au_planning(creer):
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote")), simulation=True), etats(rad="comfort"))
    f = regle_des_fenetres(m)
    lancer(f._async_couper("Bureau"))
    assert m.pilote(RAD) is False
    assert m.hass.services.appels == [("select", "select_option", {"entity_id": [RAD], "option": "off"})]
    assert f.coupes == {"Bureau": {RAD: "comfort"}}, "la regle l'a coupe, et c'est elle qui le rendra"
    assert m.fenetre_ouverte(RAD) is True, "le moteur la sait ouverte quand meme : un fait ne se simule pas"


def test_en_reel_la_regle_des_fenetres_laisse_le_fil_pilote_au_moteur(creer):
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote"))), etats(rad="comfort"))
    f = regle_des_fenetres(m)
    lancer(f._async_couper("Bureau"))
    assert m.pilote(RAD) is True
    assert f.coupes == {}, "la regle n'a rien pris : le moteur est le seul chef"
    assert m.hass.services.appels == [("select", "select_option", {"entity_id": [RAD], "option": "off"})]
    assert journal(m)[0][0] == "fenetre", "et c'est le moteur qui l'a coupe"


def test_en_observation_la_presence_baisse_elle_meme_le_thermostat_au_planning(creer):
    m = creer(config(("id-poele", chauffage(POELE, "thermostat")), simulation=True), etats(poele_t=20))
    p = presence_sur(m)
    lancer(p._async_depart())
    assert m.pilote(POELE) is False
    assert m.hass.services.appels == [("climate", "set_temperature", {"entity_id": [POELE, VTH], "temperature": 16.0})]
    assert p.consignes == {POELE: 20.0}, "la presence l'a baisse, et le remettra au retour"


def test_en_reel_la_presence_laisse_le_thermostat_au_planning_au_moteur(creer):
    m = creer(config(("id-poele", chauffage(POELE, "thermostat"))), etats(poele_t=20))
    p = presence_sur(m)
    lancer(p._async_depart())
    assert m.pilote(POELE) is True
    assert m.hass.services.appels == [
        ("climate", "set_temperature", {"entity_id": [POELE], "temperature": 17.0}),      # le moteur, en Absence
        ("climate", "set_temperature", {"entity_id": [VTH], "temperature": 16.0})]        # la presence, le reste
    assert p.consignes == {}, "la presence n'a pas touche au poele"


def test_au_passage_au_reel_le_moteur_rend_ce_que_la_regle_avait_coupe(creer):
    """Fenetre ouverte pendant l'observation : la regle a coupe le radiateur. On passe
    au reel : a la fermeture, c'est le moteur qui le rend, par le fait de la fermeture."""
    m = creer(config(("id-rad", chauffage(RAD, "fil_pilote")), simulation=True), etats(rad="comfort"))
    f = regle_des_fenetres(m)
    lancer(f._async_couper("Bureau"))
    assert f.coupes == {"Bureau": {RAD: "comfort"}}
    m.hass.states.table[RAD] = FauxEtat("off", {"options": NODON})
    lancer(m.async_enregistrer({"simulation": {"actif": False}}))
    assert m.pilote(RAD) is True
    avant = len(m.hass.services.appels)
    m.hass.states.table[FENETRE] = FauxEtat("off")
    lancer(f._async_piece("Bureau"))
    assert m.hass.services.appels[avant:] == [("select", "select_option", {"entity_id": [RAD], "option": "comfort"})]
    assert ("planning", "Confort") in [ligne[:2] for ligne in journal(m)], "c'est le moteur qui l'a rendu"
    assert f.coupes == {} and not m.regles.tient("fenetres", "fenetre", RAD), "la tenue de la regle est lachee"
