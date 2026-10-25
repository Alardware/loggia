"""Le depart et le retour, audit des capteurs du 19/10 (lot 2).

Deux defauts : les indices (mouvement, ouverture) n'etaient lus qu'une fois,
a l'enregistrement — un capteur Zigbee arrive apres le setup n'etait jamais
ecoute, et rien ne le reposait (M4) ; et les listes recues s'ecrivaient
telles quelles — un entier parmi les personnes cassait l'abonnement, au
redemarrage aussi (M24).
"""
from __future__ import annotations

import sys
import types

from test_presence import FauxEtat, creer, lancer, module, regles_module  # noqa: F401  (fixtures reutilisees)


class FauxBus:
    def __init__(self):
        self.ecoutes = []

    def async_listen(self, evenement, rappel):
        entree = [evenement, rappel, True]
        self.ecoutes.append(entree)

        def retirer():
            entree[2] = False
        return retirer


def suivre_les_poses(monkeypatch):
    """Chaque abonnement pose, et chaque delai : ce que la presence demande."""
    ev = sys.modules["homeassistant.helpers.event"]
    poses, delais = [], []
    monkeypatch.setattr(ev, "async_track_state_change_event",
                        lambda h, ids, cb: poses.append(sorted(ids)) or (lambda: None))

    def plus_tard(_h, _d, rappel):
        entree = {"rappel": rappel, "annule": False}
        delais.append(entree)

        def annuler():
            entree["annule"] = True
        return annuler

    monkeypatch.setattr(ev, "async_call_later", plus_tard)
    return poses, delais


def test_un_indice_apparu_apres_le_demarrage_est_ecoute(creer, monkeypatch):
    poses, delais = suivre_les_poses(monkeypatch)
    p = creer({"actif": True, "personnes": ["person.a"]}, {"person.a": FauxEtat("home")})
    p.hass.bus = FauxBus()
    lancer(p._async_rattraper())          # Home Assistant demarre : Zigbee pas encore la
    assert poses == [["person.a"]]
    assert [e[0] for e in p.hass.bus.ecoutes] == ["entity_registry_updated"]
    # Le capteur du couloir arrive : le registre le dit, la presence se reabonne.
    p.hass.states.table["binary_sensor.couloir"] = FauxEtat("off", {"device_class": "motion"})
    rappel = p.hass.bus.ecoutes[0][1]
    rappel(types.SimpleNamespace(data={"action": "create", "entity_id": "binary_sensor.couloir"}))
    rappel(types.SimpleNamespace(data={"action": "create", "entity_id": "binary_sensor.entree"}))
    assert len(delais) == 1, "une rafale du registre ne pose qu'un reabonnement"
    delais[0]["rappel"](None)
    lancer(p.hass.taches.pop())
    assert poses[-1] == ["binary_sensor.couloir"], poses
    # Une lampe qui arrive ne change rien aux indices.
    rappel(types.SimpleNamespace(data={"action": "create", "entity_id": "light.salon"}))
    assert len(delais) == 1


def test_pas_de_fuite_d_abonnement(creer, monkeypatch):
    _poses, delais = suivre_les_poses(monkeypatch)
    p = creer({"actif": True, "personnes": ["person.a"]}, {"person.a": FauxEtat("home")})
    p.hass.bus = FauxBus()
    lancer(p._async_rattraper())
    lancer(p._async_rattraper())
    assert len(p.hass.bus.ecoutes) == 1, "un second demarrage a pose une seconde ecoute du registre"
    p.hass.bus.ecoutes[0][1](types.SimpleNamespace(data={"entity_id": "binary_sensor.couloir"}))
    p.async_arreter()
    assert p.hass.bus.ecoutes[0][2] is False and delais[0]["annule"] is True


def test_le_demarrage_attend_home_assistant(creer, monkeypatch):
    """`_async_demarrer` pose le rattrapage par `async_at_started`, comme les
    autres modules : avant, une integration n'a pas forcement cree ses
    capteurs."""
    start = sys.modules["homeassistant.helpers.start"]
    rappels = []
    monkeypatch.setattr(start, "async_at_started", lambda h, r: rappels.append(r.__name__) or (lambda: None))
    p = creer({"actif": True, "personnes": ["person.a"]}, {"person.a": FauxEtat("home")})
    lancer(p._async_demarrer())
    assert rappels == ["_async_rattraper"]


def test_seules_des_entites_s_ecrivent(creer):
    p = creer({}, {})
    cfg = lancer(p.async_enregistrer({
        "personnes": ["person.a", 3, None, "pas une entite", "person.b"],
        "invite": {"entite": {"x": 1}},
        "depart": {"alarme": {"entite": "Alarme Maison"}},
    }))
    assert cfg["personnes"] == ["person.a", "person.b"]
    assert cfg["invite"]["entite"] == ""
    assert cfg["depart"]["alarme"]["entite"] == ""
    garde = lancer(p.store.async_get_shared("loggia_presence"))
    assert garde["personnes"] == ["person.a", "person.b"], "une valeur invalide a ete ecrite"


def test_une_configuration_deja_abimee_se_relit_propre(creer):
    p = creer({"actif": True, "personnes": ["person.a", 3], "invite": {"entite": 7}}, {})
    assert p.cfg["personnes"] == ["person.a"]
    assert p.cfg["invite"]["entite"] == ""
    lancer(p._async_reabonner())


def test_pas_d_info_a_chaque_reabonnement(creer, caplog):
    """Relecture du lot 2, point 7 : une rafale du registre reabonne la
    presence ; le journal de Home Assistant n'a pas a l'ecrire a chaque fois."""
    p = creer({"actif": True, "personnes": ["person.a"]}, {"person.a": FauxEtat("home")})
    with caplog.at_level("INFO", logger=p.__module__):
        lancer(p._async_reabonner())
    assert [r for r in caplog.records if r.levelname == "INFO"] == []
