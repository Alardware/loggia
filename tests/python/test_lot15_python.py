"""Lot 15 de l'audit du 03/10 — le composant : ce qui ne doit pas revenir.

Quatre constats, chacun sa contre-epreuve, rouge sur le code d'avant :
  - deux enregistrements partis ensemble, ou un import et un reglage : le
    second effacait le premier (la lecture se faisait hors du verrou) ;
  - la migration du code en clair hachait DANS la boucle d'evenements
    (une centaine de millisecondes mesurees, contre l'ADR 0045) ;
  - un entier dans les ouvrants d'une piece cassait l'ecoute des fenetres ;
  - deux constantes que rien ne lisait (ECOUTE_S, FAMILLES).
"""
from __future__ import annotations

import ast
import asyncio
import re
import sys

import pytest

from conftest import COMPOSANT, FauxStore, charger


def lancer(coro):
    return asyncio.run(coro)


def magasin_sur(store_module, commun=None):
    """Un vrai `LoggiaStore`, pose sur un fichier en memoire."""
    m = store_module.LoggiaStore.__new__(store_module.LoggiaStore)
    m._store = FauxStore({"users": {}, "shared": commun or {}, "migrated": True})
    m._ancien = FauxStore(None)
    m._data = None
    m._lock = asyncio.Lock()
    return m


class _Regles:
    """Le socle, reduit a ce que l'enregistrement appelle apres l'ecriture."""

    def relacher(self, *a, **k):
        return None

    def suivre(self, *a, **k):
        return None


class _Hass:
    def async_create_task(self, coro):
        coro.close()


async def _rien(*a, **k):
    return None


def module_sur(nom, classe, magasin, garder=()):
    """Un module de regles bati sans `__init__` : seul compte ici ce qu'il
    ECRIT. Ce qu'il fait ensuite (abonnements, rendez-vous) est neutralise,
    sauf ce que le test garde."""
    mod = charger(nom)
    obj = getattr(mod, classe).__new__(getattr(mod, classe))
    obj.store, obj.hass, obj.regles, obj.cfg = magasin, _Hass(), _Regles(), {}
    obj.coupes, obj.attente, obj._minuteurs, obj._defait = {}, {}, {}, []
    for meth in ("_async_reabonner", "_async_reprogrammer"):
        if meth not in garder:
            setattr(obj, meth, _rien)
    for meth in ("_reabonner", "_reabonner_etat", "_repartir_de_zero"):
        if meth not in garder:
            setattr(obj, meth, lambda *a, **k: None)
    return obj


# ── La primitive du magasin ────────────────────────────────────────────────

def test_vingt_modifications_ensemble_n_en_perdent_aucune(store_module):
    m = magasin_sur(store_module)

    async def scenario():
        await asyncio.gather(*(m.async_modifier_shared("loggia_compte", lambda v: (v or 0) + 1)
                               for _ in range(20)))
        return await m.async_get_shared("loggia_compte")

    assert lancer(scenario()) == 20, "une modification a relu l'etat d'avant la precedente"


def test_une_modification_qui_leve_n_ecrit_rien(store_module):
    m = magasin_sur(store_module, {"loggia_x": {"a": 1}})

    def casse(valeur):
        valeur["a"] = 2  # sur la COPIE : le cache n'en voit rien
        raise ValueError("refus")

    async def scenario():
        with pytest.raises(ValueError):
            await m.async_modifier_shared("loggia_x", casse)
        return await m.async_get_shared("loggia_x")

    assert lancer(scenario()) == {"a": 1}, "le refus a laisse une valeur a moitie changee"
    assert m._store.ecritures == 0


def test_une_modification_asynchrone_est_refusee(store_module):
    """Le verrou n'est pas reentrant : une coroutine qui rappellerait le
    magasin l'attendrait pour toujours. On refuse la forme, sans rien ecrire."""
    m = magasin_sur(store_module)

    async def asynchrone(_valeur):
        return 1

    with pytest.raises(TypeError):
        lancer(m.async_modifier_shared("loggia_x", asynchrone))
    assert m._store.ecritures == 0


def test_les_plafonds_valent_aussi_pour_la_primitive(store_module):
    m = magasin_sur(store_module)
    trop = "x" * (store_module.MAX_VALUE_BYTES + 1)
    with pytest.raises(ValueError):
        lancer(m.async_modifier_shared("loggia_x", lambda _v: trop))
    assert m._store.ecritures == 0


# ── Les modules : lire, changer, ecrire d'un seul tenant ────────────────────

def test_deux_boutons_affectes_ensemble_restent_tous_les_deux(store_module):
    """La repetition A de l'audit : « on » et « off » affectes en parallele sur
    la meme telecommande, seul « off » restait."""
    inter = charger("interrupteurs")
    m = magasin_sur(store_module)
    ecouteur = inter.LoggiaInterrupteurs.__new__(inter.LoggiaInterrupteurs)
    ecouteur.store = m

    def geste(service):
        return [{"service": service, "data": {"entity_id": "light.salon"}}]

    async def scenario():
        await asyncio.gather(ecouteur.async_affecter("z2m/salon", "on", geste("light.turn_on")),
                             ecouteur.async_affecter("z2m/salon", "off", geste("light.turn_off")))
        return await ecouteur.async_affectations()

    table = lancer(scenario())
    assert sorted(table["z2m/salon"]["actions"]) == ["off", "on"], "la premiere affectation a ete perdue"


CAS = [
    ("nuit", "LoggiaNuit", "loggia_nuit",
     {"veilleuse": {"actif": True}}, {"coucher": {"heure": "22:15"}},
     lambda c: c["veilleuse"]["actif"] is True and c["coucher"]["heure"] == "22:15"),
    ("presence", "LoggiaPresence", "loggia_presence",
     {"delai_depart": 9}, {"retour": {"lumieres": True}},
     lambda c: c["delai_depart"] == 9 and c["retour"]["lumieres"] is True),
    ("veilles", "LoggiaVeilles", "loggia_veilles",
     {"batterie": {"actif": True}}, {"co2": {"actif": True}},
     lambda c: c["batterie"]["actif"] is True and c["co2"]["actif"] is True),
    ("volets", "LoggiaVolets", "loggia_volets",
     {"vent": {"actif": True}}, {"planning": {"volets": {"cover.a": {"exclu": True}}}},
     lambda c: c["vent"]["actif"] is True and c["planning"]["volets"] == {"cover.a": {"exclu": True}}),
    ("fenetres", "LoggiaFenetres", "loggia_fenetres",
     {"delai": 7}, {"pieces": {"Salon": {"actif": True, "ouvrants": ["binary_sensor.fen"]}}},
     lambda c: c["delai"] == 7 and c["pieces"]["Salon"]["ouvrants"] == ["binary_sensor.fen"]),
    ("robots", "LoggiaRobots", "loggia_robots",
     {"robots": {"vacuum.a": {"pluie": {"actif": True}}}}, {"robots": {"vacuum.b": {"pluie": {"actif": True}}}},
     lambda c: set(c["robots"]) == {"vacuum.a", "vacuum.b"}),
]


@pytest.mark.parametrize("nom,classe,cle,premier,second,garde", CAS, ids=[c[0] for c in CAS])
def test_deux_reglages_envoyes_ensemble_restent_tous_les_deux(store_module, nom, classe, cle,
                                                              premier, second, garde):
    """Deux bascules d'une meme page Regles, touchees dans la meme ecriture
    disque (envoi immediat, non serialise par l'ecran) : la seconde partait
    de la configuration d'avant la premiere, et l'effacait."""
    m = magasin_sur(store_module)
    obj = module_sur(nom, classe, m)

    async def scenario():
        await asyncio.gather(obj.async_enregistrer(premier), obj.async_enregistrer(second))
        return await m.async_get_shared(cle)

    ecrit = lancer(scenario())
    assert garde(ecrit), f"{nom} : un des deux reglages a ete perdu ({ecrit!r})"


def test_aucun_module_ne_relit_puis_ecrit_hors_du_verrou():
    """Les huit modules qui lisaient puis ecrivaient leur configuration passent
    par `async_modifier_shared`. Minuteurs et sirene tiennent leur table en
    memoire et ne relisent pas le magasin. Les scenarios en etaient ecartes
    pour leur verrou, qui ne voyait pas un import (relecture du lot 15)."""
    for nom in ("interrupteurs", "fenetres", "nuit", "presence", "robots", "scenarios",
                "veilles", "volets"):
        texte = (COMPOSANT / f"{nom}.py").read_text(encoding="utf-8")
        assert "async_set_shared" not in texte, f"{nom} ecrit encore hors de la primitive"
        assert "async_modifier_shared" in texte, nom


def test_planning_volets_garde_sa_semantique(store_module):
    """L'ecran envoie la table `planning.volets` ENTIERE, et « retirer un
    volet » envoie la table sans lui. La primitive ne change pas cette fusion
    au premier niveau : une fusion volet par volet ferait de ce retrait un
    retrait sans effet."""
    m = magasin_sur(store_module)
    v = module_sur("volets", "LoggiaVolets", m)

    async def scenario():
        await v.async_enregistrer({"planning": {"volets": {"cover.a": {"exclu": True}, "cover.b": {"decalage": 10}}}})
        await v.async_enregistrer({"planning": {"volets": {"cover.b": {"decalage": 10}}}})
        return await v.async_config()

    assert lancer(scenario())["planning"]["volets"] == {"cover.b": {"decalage": 10}}


def test_un_import_parti_avec_un_reglage_n_est_plus_defait(store_module):
    """Le meme trou par l'autre porte : `loggia/config/set` (un import, une
    remise a zero) ecrit sous le verrou, mais le module avait deja LU avant
    lui. Il ecrivait ensuite sa copie d'avant l'import, et la maison revenait
    a l'ancienne regle sans que personne le voie (contre-epreuve du lot 15)."""
    m = magasin_sur(store_module, {"loggia_nuit": {"veilleuse": {"actif": False}}})
    n = module_sur("nuit", "LoggiaNuit", m)

    async def scenario():
        await m._load()
        await asyncio.gather(
            m.async_set_user("admin", {"loggia_nuit": {"veilleuse": {"actif": True}}}, is_admin=True),
            n.async_enregistrer({"coucher": {"heure": "22:15"}}))
        return await m.async_get_shared("loggia_nuit")

    ecrit = lancer(scenario())
    assert ecrit["veilleuse"]["actif"] is True, "l'import a ete defait par l'enregistrement du module"
    assert ecrit["coucher"]["heure"] == "22:15"


# ── Les scenarios : la meme porte (relecture du lot 15) ─────────────────────

FILM = {"id": "perso_film", "nom": "Film", "actions": []}


def scenarios_sur(magasin):
    """Le module des scenarios bati sans `__init__` : seul compte ce qu'il ecrit."""
    scn = charger("scenarios")
    s = scn.LoggiaScenarios.__new__(scn.LoggiaScenarios)
    s.store = magasin
    return s


def _import_et(magasin, valeur, geste):
    """`loggia/config/set` (un import, une remise a zero) et un geste des
    scenarios partis ensemble ; rend ce que le magasin garde, et ce que le
    geste a leve."""

    async def scenario():
        await magasin._load()
        _, rendu = await asyncio.gather(
            magasin.async_set_user("admin", {"loggia_scenarios": valeur}, is_admin=True),
            geste, return_exceptions=True)
        return await magasin.async_get_shared("loggia_scenarios"), rendu

    return lancer(scenario())


GESTES_SCENARIOS = [
    ("ranger", lambda s: s.async_ordonner(["nuit", "reveil"]),
     lambda c: c["ordre"] == ["nuit", "reveil"]),
    ("enregistrer", lambda s: s.async_enregistrer({"enregistrer": {"id": "nuit", "nom": "Dodo"}}),
     lambda c: c["integres"]["nuit"]["nom"] == "Dodo"),
    ("reprendre", lambda s: s.async_migrer(), lambda c: True),
]


@pytest.mark.parametrize("geste,garde", [g[1:] for g in GESTES_SCENARIOS],
                         ids=[g[0] for g in GESTES_SCENARIOS])
def test_un_import_parti_avec_un_geste_des_scenarios_n_est_plus_defait(store_module, geste, garde):
    """Les scenarios etaient ecartes de la primitive parce qu'ils avaient
    leur verrou. Il ne voyait que leurs propres gestes : ranger (ouvert a
    tout compte), enregistrer ou la reprise du demarrage relisaient le
    cache d'avant l'import, puis ecrivaient cette copie — le scenario
    importe disparaissait sans un mot (relecture du lot 15)."""
    m = magasin_sur(store_module, {"loggia_scenarios": {"migre": False},
                                   "loggia_quickscenes": [{"name": "Xyz", "haid": "scene.xyz_abc"}]})
    s = scenarios_sur(m)
    ecrit, rendu = _import_et(m, {"persos": [FILM], "migre": True}, geste(s))
    assert not isinstance(rendu, BaseException), rendu
    assert [p["id"] for p in ecrit["persos"]] == ["perso_film"], f"l'import a ete defait ({ecrit!r})"
    assert ecrit["migre"] is True, "la reprise a ete rejouee par-dessus l'import"
    assert garde(ecrit), f"le geste a ete perdu ({ecrit!r})"


def test_une_remise_a_zero_partie_avec_un_rangement_n_est_plus_defaite(store_module):
    """La remise a zero (la cle a None) par la meme porte : le rangement
    reecrivait les scenarios qu'elle venait d'effacer. Il se juge
    maintenant sur ce qu'elle laisse — et nommer un scenario qu'elle
    vient d'effacer fait refuser l'ordre, sans rien ecrire."""
    m = magasin_sur(store_module, {"loggia_scenarios": {"persos": [FILM], "migre": True}})
    ecrit, _ = _import_et(m, None, scenarios_sur(m).async_ordonner(["nuit", "reveil"]))
    assert ecrit["persos"] == [], f"la remise a zero a ete defaite par le rangement ({ecrit!r})"
    assert ecrit["ordre"] == ["nuit", "reveil"]

    m = magasin_sur(store_module, {"loggia_scenarios": {"persos": [FILM], "migre": True}})
    scn = charger("scenarios")
    ecrit, rendu = _import_et(m, None, scenarios_sur(m).async_ordonner(["perso_film", "nuit"]))
    assert isinstance(rendu, scn.ScenariosInconnusError) and rendu.idents == ["perso_film"]
    assert ecrit is None, f"un ordre refuse a reecrit la cle effacee ({ecrit!r})"


# ── La migration du code administrateur en clair ────────────────────────────

def test_le_code_en_clair_se_hache_hors_de_la_boucle(store_module, monkeypatch):
    code_admin = charger("code_admin")
    fils = []
    vrai = store_module.hacher

    def espion(pin, *a, **k):
        try:
            asyncio.get_running_loop()
            fils.append("boucle")
        except RuntimeError:
            fils.append("executeur")
        return vrai(pin, *a, **k)

    monkeypatch.setattr(store_module, "hacher", espion)
    m = magasin_sur(store_module, {"loggia_admin_pin": "4271"})
    vu = lancer(m.async_get_user("u1"))
    assert fils == ["executeur"], "PBKDF2 tourne dans la boucle d'evenements (ADR 0045)"
    assert vu["loggia_admin_pin_defini"] is True
    enregistrement = lancer(m.async_get_code_admin())
    assert code_admin.verifier("4271", enregistrement) and not code_admin.verifier("0000", enregistrement)
    assert "loggia_admin_pin" not in m._store.contenu["shared"], "le clair est reste sur disque"


def test_la_migration_passe_par_l_executeur_de_home_assistant(store_module):
    class Hass:
        def __init__(self):
            self.travaux = []

        async def async_add_executor_job(self, fonction, *args):
            self.travaux.append(fonction.__name__)
            return await asyncio.get_running_loop().run_in_executor(None, fonction, *args)

    m = magasin_sur(store_module, {"loggia_admin_pin": "4271"})
    m.hass = Hass()
    lancer(m._load())
    assert m.hass.travaux == ["hacher"]


def test_rien_a_hacher_rien_a_l_executeur(store_module):
    """Un fichier deja migre, ou un clair illisible : pas de travail pour rien."""
    for commun in ({}, {"loggia_admin_pin": "12"}):
        m = magasin_sur(store_module, commun)
        m.hass = type("Hass", (), {"async_add_executor_job": None})()
        lancer(m._load())
        assert "loggia_admin_pin" not in m._data["shared"]


# ── Les fenetres : ce que la configuration accepte ──────────────────────────

@pytest.fixture
def suivis(monkeypatch):
    """Ce que la regle des fenetres demande a Home Assistant de suivre."""
    vus = []
    monkeypatch.setattr(sys.modules["homeassistant.helpers.event"], "async_track_state_change_event",
                        lambda hass, ids, rappel: vus.append(list(ids)) or (lambda: None))
    return vus


def test_un_ouvrant_qui_n_est_pas_un_texte_est_ecarte(store_module, suivis):
    m = magasin_sur(store_module)
    f = module_sur("fenetres", "LoggiaFenetres", m, garder=("_async_reabonner",))
    cfg = lancer(f.async_enregistrer({"actif": True, "pieces": {"Salon": {
        "actif": True, "ouvrants": ["binary_sensor.fen", 5, None, {"x": 1}], "chauffages": "climate.salon"}}}))
    salon = cfg["pieces"]["Salon"]
    assert salon["ouvrants"] == ["binary_sensor.fen"]
    assert salon["chauffages"] == [], "une chaine seule n'est pas une liste d'identifiants"
    assert suivis == [["binary_sensor.fen"]], "la regle n'ecoute plus ses ouvrants"
    assert lancer(m.async_get_shared("loggia_fenetres"))["pieces"]["Salon"]["ouvrants"] == ["binary_sensor.fen"]


@pytest.mark.parametrize("illisible", [["Salon"], [], "Salon", 5], ids=["liste", "vide", "texte", "nombre"])
def test_des_pieces_qui_ne_sont_pas_une_table_ne_cassent_plus_la_regle(store_module, suivis, illisible):
    """Le meme trou un niveau plus haut (relecture du lot 15) : `pieces` qui
    n'etait pas une table etait ecrit tel quel, puis `.values()` levait
    AttributeError au reabonnement — apres l'ecriture, et au redemarrage."""
    m = magasin_sur(store_module)
    f = module_sur("fenetres", "LoggiaFenetres", m, garder=("_async_reabonner",))
    lancer(f.async_enregistrer({"actif": True, "pieces": illisible}))
    assert lancer(m.async_get_shared("loggia_fenetres"))["pieces"] == {}, "la valeur illisible a ete ecrite"
    abime = magasin_sur(store_module, {"loggia_fenetres": {"actif": True, "pieces": illisible}})
    g = module_sur("fenetres", "LoggiaFenetres", abime, garder=("_async_reabonner",))
    lancer(g._async_demarrer())
    assert g.cfg["pieces"] == {}
    # Un patch illisible ne vide pas non plus les pieces deja reglees.
    salon = {"Salon": {"actif": True, "ouvrants": ["binary_sensor.fen"]}}
    garde = magasin_sur(store_module, {"loggia_fenetres": {"actif": True, "pieces": salon}})
    h = module_sur("fenetres", "LoggiaFenetres", garde, garder=("_async_reabonner",))
    assert lancer(h.async_enregistrer({"pieces": illisible}))["pieces"] == salon
    assert lancer(garde.async_get_shared("loggia_fenetres"))["pieces"] == salon
    assert suivis == [["binary_sensor.fen"]], "la regle n'ecoute plus ses ouvrants"


def test_une_configuration_abimee_ne_casse_plus_le_demarrage(store_module, suivis):
    """Ecrite avant ce correctif, une valeur non textuelle cassait aussi le
    redemarrage : la regle restait muette jusqu'a ce qu'on la reenregistre."""
    m = magasin_sur(store_module, {"loggia_fenetres": {"actif": True, "pieces": {
        "Salon": {"actif": True, "ouvrants": [5, "binary_sensor.fen"], "chauffages": ["switch.rad", 3]}}}})
    f = module_sur("fenetres", "LoggiaFenetres", m, garder=("_async_reabonner",))
    lancer(f._async_demarrer())
    assert suivis == [["binary_sensor.fen"]]
    assert f.cfg["pieces"]["Salon"]["chauffages"] == ["switch.rad"]


def test_une_piece_sans_listes_reste_sans_listes(store_module):
    """Le filtre ne fabrique rien : une piece qu'on allume sans toucher a ses
    listes garde la forme que l'ecran lui a donnee."""
    fen = charger("fenetres")
    assert fen.piece_propre({"actif": True}) == {"actif": True}


# ── Les constantes que rien ne lit ──────────────────────────────────────────

# Lus par Home Assistant lui-meme, par convention de nom.
LUS_PAR_HA = {"CONFIG_SCHEMA"}


def test_aucune_constante_que_rien_ne_lit():
    """Une constante sans lecteur ment au prochain lecteur : ECOUTE_S faisait
    croire a une duree tenue par le serveur, quand l'ecran la choisit ;
    FAMILLES doublait GESTES sans que personne ne la lise. Les tests ne
    comptent pas comme lecteurs. Lu = nom charge, attribut, ou import."""
    arbres = {f.name: ast.parse(f.read_text(encoding="utf-8")) for f in sorted(COMPOSANT.glob("*.py"))}
    lus = set()
    for arbre in arbres.values():
        for n in ast.walk(arbre):
            if isinstance(n, ast.Name) and isinstance(n.ctx, ast.Load):
                lus.add(n.id)
            elif isinstance(n, ast.Attribute):
                lus.add(n.attr)
            elif isinstance(n, ast.ImportFrom):
                lus.update(a.name for a in n.names)
    mortes = []
    for fichier, arbre in arbres.items():
        for n in arbre.body:
            if isinstance(n, ast.Assign):
                noms = [t.id for t in n.targets if isinstance(t, ast.Name)]
            elif isinstance(n, ast.AnnAssign) and isinstance(n.target, ast.Name):
                noms = [n.target.id]
            else:
                noms = []
            mortes += [f"{fichier}:{x}" for x in noms
                       if re.fullmatch(r"[A-Z][A-Z0-9_]*", x) and x not in LUS_PAR_HA and x not in lus]
    assert mortes == [], f"constantes que rien ne lit : {mortes}"
