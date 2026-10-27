"""Un identifiant se valide EN ENTIER (petit paquet du 26/10).

En Python, `$` accepte un `\\n` final : `REGEX.match("valeur\\n")` passe avec un
motif `^...$`. Le defaut a ete corrige le 25/10 dans robots.py,
robots_carnet.py, robots_pieces.py et distributeurs.py, par `fullmatch`. Ces
tests verrouillent les modules qui restaient : chaque cas etait ACCEPTE avant
le passage a `fullmatch`, et doit etre refuse.
"""
from __future__ import annotations

import pytest

from conftest import charger


def _leve(fonction, *args):
    """Vrai si l'appel refuse sa valeur par ValueError."""
    try:
        fonction(*args)
    except ValueError:
        return True
    return False


# (nom du cas, module, fonction qui dit si la valeur a saut de ligne est REFUSEE)
CAS = [
    ("appareils.MOTIF_ID a la lecture", "appareils",
     lambda m: m._fiches({"abcdefgh\n": {"nom": "x"}}) == {}),
    ("appareils.MOTIF_ID a l'ecriture", "appareils",
     lambda m: _leve(m._demande_valide, "abcdefgh\n", {})),
    ("appareils.MOTIF_PROFIL", "appareils",
     lambda m: _leve(m._demande_valide, "abcdefgh", {"profil": "1\n"})),
    ("enfant_calcul.LECTEUR", "enfant_calcul",
     lambda m: m.valide("media_player.salon\n") is False),
    ("enfant_calcul.HEURE", "enfant_calcul",
     lambda m: m.minutes("07:30\n") is None),
    ("prises_calcul.INTERRUPTEUR", "prises_calcul",
     lambda m: m._interrupteur("switch.prise\n") is False),
    ("minuteurs.ENTITE", "minuteurs",
     lambda m: m.valide("light.lampe\n") is False),
    ("sirene.ENTITE", "sirene",
     lambda m: m.valide("siren.alarme\n") is False),
    ("scenarios.SLUG", "scenarios",
     lambda m: _leve(m.valider_scenario, {"id": "soiree\n"})),
    ("plan._ETAGE", "plan",
     lambda m: m.etage_valide("rdc\n") is False),
    ("chauffage_familles.SOUS_JACENT_A_PLAT", "chauffage_familles",
     lambda m: m.sous_jacents_vtherm({"underlying_climate_1\n": "climate.vanne"}) == []),
]


@pytest.mark.parametrize("nom,module,refuse", CAS, ids=[c[0] for c in CAS])
def test_un_saut_de_ligne_final_est_refuse(nom, module, refuse):
    assert refuse(charger(module)), nom + " laisse passer une valeur suivie de \\n"


# La forme propre passe toujours : le passage a `fullmatch` ne refuse rien d'autre.
PROPRES = [
    ("appareils", lambda m: m._fiches({"abcdefgh": {"nom": "x"}}) == {"abcdefgh": {"nom": "x"}}),
    ("appareils", lambda m: m._demande_valide("abcdefgh", {"profil": "1"}) == {"profil": "1"}),
    ("enfant_calcul", lambda m: m.valide("media_player.salon") and m.minutes("07:30") == 450),
    ("prises_calcul", lambda m: m._interrupteur("switch.prise")),
    ("minuteurs", lambda m: m.valide("light.lampe")),
    ("sirene", lambda m: m.valide("siren.alarme")),
    ("scenarios", lambda m: m.valider_scenario({"id": "soiree"})["id"] == "soiree"),
    ("plan", lambda m: m.etage_valide("rdc")),
    ("chauffage_familles",
     lambda m: m.sous_jacents_vtherm({"underlying_climate_1": "climate.vanne"}) == ["climate.vanne"]),
]


@pytest.mark.parametrize("module,accepte", PROPRES, ids=[p[0] for p in PROPRES])
def test_la_forme_propre_passe_toujours(module, accepte):
    assert accepte(charger(module))


def test_icone_de_scenario_nettoyee_avant_lecture():
    """L'icone est `strip()`-ee avant le motif : « maison\\n » devient
    « maison », comme avant. `fullmatch` n'y change rien, il aligne la forme."""
    m = charger("scenarios")
    assert m.valider_scenario({"icone": "maison\n"})["icone"] == "maison"
    assert _leve(m.valider_scenario, {"icone": "mai son"})
