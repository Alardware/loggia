"""Tests des trois veilles : l'air, les piles, le tarif.

Le point qui compte : ne pas crier deux fois. Une alerte repetee toutes les
trente secondes est pire que pas d'alerte — on l'apprend par coeur et on cesse
de la lire.
"""
from __future__ import annotations

import asyncio

import pytest

from conftest import FauxStore, charger


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
        return [e for e in self.table if e.startswith(domaine + '.')]


class FauxServices:
    def __init__(self, existants=('mobile',)):
        self.appels = []
        self.existants = set(existants)

    def has_service(self, domaine, service):
        return service in self.existants

    async def async_call(self, domaine, service, data, blocking=False):
        self.appels.append((domaine, service, dict(data)))


class FauxHass:
    def __init__(self, etats, services=None):
        self.states = FauxEtats(etats)
        self.services = services or FauxServices()
        self.taches = []

    def async_create_task(self, coro):
        self.taches.append(coro)
        return coro

    def abandonner(self):
        taches, self.taches = self.taches, []
        for coro in taches:
            coro.close()


@pytest.fixture
def module():
    return charger("veilles")


@pytest.fixture
def creer(module, store_module):
    faits = []

    def fabrique(config=None, etats=None, notify='mobile', services=None):
        partage = {"loggia_veilles": config or {}}
        if notify:
            partage["loggia_alertes"] = {"service": notify}
        magasin = store_module.LoggiaStore.__new__(store_module.LoggiaStore)
        magasin._store = FauxStore({"users": {}, "shared": partage, "migrated": True})
        magasin._ancien = FauxStore(None)
        magasin._data = None
        magasin._lock = asyncio.Lock()

        v = module.LoggiaVeilles.__new__(module.LoggiaVeilles)
        v.hass = FauxHass(etats or {}, services)
        v.store = magasin
        v.cfg = lancer(v.async_config())
        v.signales = set()
        v.creuses_en_cours = False
        v.journal = []
        v._defait = []
        faits.append(v)
        return v

    yield fabrique
    for v in faits:
        v.hass.abandonner()


# ── Lire une valeur ─────────────────────────────────────────────────────────

def test_une_valeur_muette_ne_vaut_rien(module):
    for mauvais in ('unavailable', 'unknown', '', 'beaucoup'):
        assert module.nombre(FauxEtat(mauvais)) is None
    assert module.nombre(None) is None
    assert module.nombre(FauxEtat('704')) == 704.0


def test_on_ne_devine_pas_au_nom(module):
    """Home Assistant dit lui-meme ce qu'une entite mesure : on lit sa
    `device_class`, on ne cherche pas « co2 » dans son nom."""
    etats = {
        'sensor.qualite_salon': FauxEtat('704', {'device_class': 'carbon_dioxide'}),
        'sensor.co2_dans_le_nom': FauxEtat('900', {'device_class': 'temperature'}),
        'sensor.pile_porte': FauxEtat('41', {'device_class': 'battery'}),
    }
    assert module.capteurs_de(etats, 'carbon_dioxide') == ['sensor.qualite_salon']
    assert module.capteurs_de(etats, 'battery') == ['sensor.pile_porte']


# ── Ne pas crier deux fois ──────────────────────────────────────────────────

def test_au_dessus_du_seuil(module):
    assert module.au_dessus(1300, 1200, False)
    assert not module.au_dessus(1100, 1200, False)


def test_on_ne_se_tait_qu_une_fois_franchement_redescendu(module):
    """Un capteur qui oscille autour du seuil sonnerait toute la journee."""
    # Deja signale a 1300 : a 1150 on considere que ca dure encore.
    assert module.au_dessus(1150, 1200, True)
    # Sous 90 % du seuil, c'est fini.
    assert not module.au_dessus(1000, 1200, True)


def test_une_pile_ne_remonte_pas_toute_seule(module):
    assert module.en_dessous(10, 15, False)
    assert not module.en_dessous(20, 15, False)
    # Deja signalee : il faut un vrai changement de pile pour se taire.
    assert module.en_dessous(16, 15, True)
    assert not module.en_dessous(90, 15, True)


def test_une_valeur_absente_ne_declenche_rien(module):
    assert not module.au_dessus(None, 1200, False)
    assert not module.en_dessous(None, 15, False)


# ── L'air ───────────────────────────────────────────────────────────────────

AIR_MAUVAIS = {'sensor.co2': FauxEtat('1450', {'device_class': 'carbon_dioxide',
                                               'friendly_name': 'CO2 chambre'})}


def test_le_co2_haut_previent(creer):
    v = creer({'co2': {'actif': True, 'seuil': 1200}}, AIR_MAUVAIS)
    lancer(v._async_co2())
    assert v.hass.services.appels[0][0] == 'notify'
    assert 'CO2 chambre' in v.hass.services.appels[0][2]['message']
    assert '1450' in v.hass.services.appels[0][2]['message']


def test_le_co2_ne_previent_qu_une_fois(creer):
    v = creer({'co2': {'actif': True, 'seuil': 1200}}, AIR_MAUVAIS)
    lancer(v._async_co2())
    lancer(v._async_co2())
    lancer(v._async_co2())
    assert len(v.hass.services.appels) == 1


def test_le_co2_previent_a_nouveau_apres_aeration(creer):
    v = creer({'co2': {'actif': True, 'seuil': 1200}}, AIR_MAUVAIS)
    lancer(v._async_co2())
    v.hass.states.table['sensor.co2'] = FauxEtat('600', {'device_class': 'carbon_dioxide'})
    lancer(v._async_co2())            # redescendu : on oublie
    v.hass.states.table['sensor.co2'] = FauxEtat('1400', {'device_class': 'carbon_dioxide'})
    lancer(v._async_co2())
    assert len(v.hass.services.appels) == 2


def test_le_co2_peut_lancer_la_ventilation(creer):
    v = creer({'co2': {'actif': True, 'seuil': 1200, 'ventilation': ['switch.vmc']}}, AIR_MAUVAIS)
    lancer(v._async_co2())
    assert ('homeassistant', 'turn_on', {'entity_id': ['switch.vmc']}) in v.hass.services.appels


def test_sans_service_de_notification_rien_ne_part(creer):
    """Ces veilles n'ont personne a qui parler tant qu'aucun service n'est
    choisi dans Parametres > Alertes."""
    v = creer({'co2': {'actif': True, 'seuil': 1200}}, AIR_MAUVAIS, notify=None)
    lancer(v._async_co2())
    assert v.hass.services.appels == []


def test_un_service_disparu_ne_plante_pas(creer):
    v = creer({'co2': {'actif': True, 'seuil': 1200}}, AIR_MAUVAIS,
              notify='telephone_vendu', services=FauxServices(existants=()))
    lancer(v._async_co2())
    assert v.hass.services.appels == []


# ── Les piles ───────────────────────────────────────────────────────────────

PILES = {
    'sensor.pile_porte': FauxEtat('9', {'device_class': 'battery', 'friendly_name': 'Porte'}),
    'sensor.pile_salon': FauxEtat('80', {'device_class': 'battery'}),
}


def test_seule_la_pile_faible_est_signalee(creer):
    v = creer({'batterie': {'actif': True, 'seuil': 15}}, PILES)
    lancer(v._async_batteries())
    assert len(v.hass.services.appels) == 1
    assert 'Porte' in v.hass.services.appels[0][2]['message']


def test_la_pile_faible_n_est_signalee_qu_une_fois(creer):
    v = creer({'batterie': {'actif': True, 'seuil': 15}}, PILES)
    lancer(v._async_batteries())
    lancer(v._async_batteries())
    assert len(v.hass.services.appels) == 1


def test_une_pile_changee_redevient_signalable(creer):
    v = creer({'batterie': {'actif': True, 'seuil': 15}}, PILES)
    lancer(v._async_batteries())
    v.hass.states.table['sensor.pile_porte'] = FauxEtat('100', {'device_class': 'battery'})
    lancer(v._async_batteries())      # pile changee : on oublie
    v.hass.states.table['sensor.pile_porte'] = FauxEtat('8', {'device_class': 'battery'})
    lancer(v._async_batteries())
    assert len(v.hass.services.appels) == 2


# ── Le tarif ────────────────────────────────────────────────────────────────

def cfg_creuses(**extra):
    c = {'actif': True, 'entite': 'sensor.tarif', 'valeur': 'HC'}
    c.update(extra)
    return {'creuses': c}


def test_le_passage_en_heures_creuses_previent(creer):
    v = creer(cfg_creuses(), {'sensor.tarif': FauxEtat('HC')})
    lancer(v._async_creuses())
    assert 'creuses' in v.hass.services.appels[0][2]['message'].lower()


def test_la_valeur_se_compare_sans_la_casse(creer):
    v = creer(cfg_creuses(valeur='hc'), {'sensor.tarif': FauxEtat('HC')})
    lancer(v._async_creuses())
    assert len(v.hass.services.appels) == 1


def test_les_heures_creuses_ne_previennent_qu_au_passage(creer):
    v = creer(cfg_creuses(), {'sensor.tarif': FauxEtat('HC')})
    lancer(v._async_creuses())
    lancer(v._async_creuses())
    assert len(v.hass.services.appels) == 1
    # Retour en heures pleines, puis a nouveau creuses : on previent encore.
    v.hass.states.table['sensor.tarif'] = FauxEtat('HP')
    lancer(v._async_creuses())
    v.hass.states.table['sensor.tarif'] = FauxEtat('HC')
    lancer(v._async_creuses())
    assert len(v.hass.services.appels) == 2


def test_les_heures_creuses_peuvent_allumer_une_prise(creer):
    v = creer(cfg_creuses(prises=['switch.lave_vaisselle']), {'sensor.tarif': FauxEtat('HC')})
    lancer(v._async_creuses())
    assert ('homeassistant', 'turn_on',
            {'entity_id': ['switch.lave_vaisselle']}) in v.hass.services.appels


def test_sans_valeur_attendue_on_ne_devine_pas(creer):
    v = creer(cfg_creuses(valeur=''), {'sensor.tarif': FauxEtat('HC')})
    lancer(v._async_creuses())
    assert v.hass.services.appels == []


# ── La configuration ────────────────────────────────────────────────────────

def test_les_defauts(creer):
    v = creer()
    assert v.cfg['co2']['seuil'] == 1200
    assert v.cfg['batterie']['seuil'] == 15
    assert v.cfg['creuses']['actif'] is False


def test_l_etat_propose_ce_que_la_decouverte_trouve(creer):
    v = creer({}, {**AIR_MAUVAIS, **PILES})
    etat = lancer(v.async_etat())
    assert etat['capteurs_co2'] == ['sensor.co2']
    assert etat['capteurs_batterie'] == ['sensor.pile_porte', 'sensor.pile_salon']
    assert etat['notification'] is True


def test_l_etat_dit_quand_personne_n_ecoute(creer):
    v = creer({}, {}, notify=None)
    assert lancer(v.async_etat())['notification'] is False
