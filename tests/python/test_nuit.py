"""Tests de la veilleuse et de l'extinction du soir.

Deux points valent d'etre verrouilles : la plage horaire de la veilleuse
traverse minuit, et on ne demande une transition qu'a une lampe qui sait la
faire.
"""
from __future__ import annotations

import asyncio
from datetime import datetime

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
    def __init__(self):
        self.appels = []

    async def async_call(self, domaine, service, data, blocking=False, context=None):
        self.appels.append((domaine, service, dict(data)))


class FauxHass:
    def __init__(self, etats):
        self.states = FauxEtats(etats)
        self.services = FauxServices()
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
    return charger("nuit")


@pytest.fixture
def regles_module():
    return charger("regles")


@pytest.fixture
def creer(module, store_module, regles_module):
    faits = []

    def fabrique(config=None, etats=None, partage=None):
        magasin = store_module.LoggiaStore.__new__(store_module.LoggiaStore)
        magasin._store = FauxStore({"users": {}, "shared": {"loggia_nuit": config or {}, **(partage or {})},
                                    "migrated": True})
        magasin._ancien = FauxStore(None)
        magasin._data = None
        magasin._lock = asyncio.Lock()

        n = module.LoggiaNuit.__new__(module.LoggiaNuit)
        n.hass = FauxHass(etats or {})
        n.store = magasin
        n.cfg = lancer(n.async_config())
        n._minuteurs = {}
        # L'eclairage nocturne : le vrai constructeur les pose, la fabrique aussi.
        n._minuteurs_pieces = {}
        n.allumees = {}
        n._defait = []
        n.regles = regles_module.Regles(n.hass, magasin)
        n.regles._depot = FauxStore(None)
        n._defait_heure = []
        faits.append(n)
        return n

    yield fabrique
    for n in faits:
        n.hass.abandonner()


# ── Lire une heure ──────────────────────────────────────────────────────────

def test_une_heure_se_lit(module):
    assert module.lire_heure('19:00') == (19, 0)
    assert module.lire_heure('23:30') == (23, 30)
    assert module.lire_heure('07:05') == (7, 5)


def test_une_heure_illisible_garde_le_defaut(module):
    for mauvaise in ('', None, 'minuit', '25:00', '12:99', '12'):
        assert module.lire_heure(mauvaise, (23, 30)) == (23, 30)


# ── La plage du soir ────────────────────────────────────────────────────────

def test_la_soiree_commence_a_l_heure_dite(module):
    assert module.dans_la_soiree(datetime(2026, 9, 4, 19, 0), '19:00')
    assert module.dans_la_soiree(datetime(2026, 9, 4, 22, 30), '19:00')
    assert not module.dans_la_soiree(datetime(2026, 9, 4, 15, 0), '19:00')


def test_la_soiree_traverse_minuit(module):
    """Une veilleuse allumee a 2 h du matin est encore la soiree de la veille :
    sans cela, elle resterait allumee jusqu'au matin."""
    assert module.dans_la_soiree(datetime(2026, 9, 4, 2, 0), '19:00')
    assert module.dans_la_soiree(datetime(2026, 9, 4, 6, 30), '19:00')
    # Mais l'apres-midi, non.
    assert not module.dans_la_soiree(datetime(2026, 9, 4, 13, 0), '19:00')


def test_sans_heure_la_regle_vaut_toujours(module):
    """Mieux vaut une veilleuse qui s'eteint trop souvent qu'une qui reste
    allumee."""
    assert module.dans_la_soiree(datetime(2026, 9, 4, 15, 0), '')
    assert module.dans_la_soiree(datetime(2026, 9, 4, 15, 0), None)


# ── Les lampes a eteindre ───────────────────────────────────────────────────

def test_seules_les_allumees_comptent(module):
    etats = {"light.a": FauxEtat("on"), "light.b": FauxEtat("off"), "light.c": FauxEtat("on")}
    assert module.a_eteindre(etats, []) == ["light.a", "light.c"]


def test_les_epargnees_sont_epargnees(module):
    etats = {"light.a": FauxEtat("on"), "light.veilleuse": FauxEtat("on")}
    assert module.a_eteindre(etats, ["light.veilleuse"]) == ["light.a"]


def test_une_lampe_muette_n_est_pas_eteinte(module):
    etats = {"light.a": FauxEtat("unavailable"), "light.b": FauxEtat("on")}
    assert module.a_eteindre(etats, []) == ["light.b"]


# ── La veilleuse ────────────────────────────────────────────────────────────

def cfg_veilleuse(**extra):
    v = {"actif": True, "lampes": ["light.veilleuse"], "duree": 0, "fondu": 5, "depuis": ""}
    v.update(extra)
    return {"veilleuse": v}


AVEC_FONDU = {"light.veilleuse": FauxEtat("on", {"supported_features": 32})}
SANS_FONDU = {"light.veilleuse": FauxEtat("on", {"supported_features": 0})}


def test_la_veilleuse_s_eteint_en_fondu(creer):
    n = creer(cfg_veilleuse(), AVEC_FONDU)
    lancer(n._async_eteindre_veilleuse("light.veilleuse"))
    assert n.hass.services.appels == [
        ("light", "turn_off", {"entity_id": ["light.veilleuse"], "transition": 300})
    ]


def test_une_lampe_qui_ne_sait_pas_fondre_s_eteint_franchement(creer):
    """On ne simule pas le fondu par paliers : ce serait saccade, ca remplirait
    le journal de Home Assistant et ca userait la liaison Zigbee."""
    n = creer(cfg_veilleuse(), SANS_FONDU)
    lancer(n._async_eteindre_veilleuse("light.veilleuse"))
    assert n.hass.services.appels == [
        ("light", "turn_off", {"entity_id": ["light.veilleuse"]})
    ]


def test_sans_fondu_demande_pas_de_transition(creer):
    n = creer(cfg_veilleuse(fondu=0), AVEC_FONDU)
    lancer(n._async_eteindre_veilleuse("light.veilleuse"))
    assert "transition" not in n.hass.services.appels[0][2]


def test_une_veilleuse_deja_eteinte_n_est_pas_touchee(creer):
    n = creer(cfg_veilleuse(), {"light.veilleuse": FauxEtat("off", {})})
    lancer(n._async_eteindre_veilleuse("light.veilleuse"))
    assert n.hass.services.appels == []


def test_une_lampe_hors_liste_est_ignoree(creer):
    n = creer(cfg_veilleuse(), {**AVEC_FONDU, "light.salon": FauxEtat("on", {})})
    lancer(n._async_armer("light.salon"))
    assert n.hass.services.appels == []


def test_eteindre_a_la_main_annule_la_minuterie(creer):
    n = creer(cfg_veilleuse(duree=30), AVEC_FONDU)
    n._minuteurs["light.veilleuse"] = lambda: None
    n._desarmer("light.veilleuse")
    assert n._minuteurs == {}


# ── L'extinction du soir ────────────────────────────────────────────────────

def cfg_coucher(**extra):
    c = {"actif": True, "heure": "23:30", "sauf": [], "jours": []}
    c.update(extra)
    return {"coucher": c}


LAMPES = {"light.salon": FauxEtat("on"), "light.cuisine": FauxEtat("off"),
          "light.veilleuse": FauxEtat("on")}


def test_le_coucher_eteint_ce_qui_traine(creer):
    n = creer(cfg_coucher(), LAMPES)
    lancer(n._async_coucher())
    assert n.hass.services.appels == [
        ("light", "turn_off", {"entity_id": ["light.salon", "light.veilleuse"]})
    ]


def test_le_coucher_epargne_ce_qu_on_lui_dit(creer):
    n = creer(cfg_coucher(sauf=["light.veilleuse"]), LAMPES)
    lancer(n._async_coucher())
    assert n.hass.services.appels[0][2]["entity_id"] == ["light.salon"]


def test_le_coucher_eteint_ne_fait_rien(creer):
    n = creer({"coucher": {"actif": False}}, LAMPES)
    lancer(n._async_coucher())
    assert n.hass.services.appels == []


def test_rien_d_allume_rien_a_faire(creer):
    n = creer(cfg_coucher(), {"light.salon": FauxEtat("off")})
    lancer(n._async_coucher())
    assert n.hass.services.appels == []


# ── La configuration ────────────────────────────────────────────────────────

def test_les_defauts(creer):
    n = creer()
    assert n.cfg["veilleuse"]["actif"] is False
    assert n.cfg["veilleuse"]["duree"] == 30
    assert n.cfg["coucher"]["heure"] == "23:30"


def test_un_patch_partiel_garde_le_reste(creer):
    n = creer(cfg_veilleuse())
    lancer(n.async_enregistrer({"veilleuse": {"duree": 45}}))
    assert n.cfg["veilleuse"]["duree"] == 45
    assert n.cfg["veilleuse"]["lampes"] == ["light.veilleuse"]
    assert n.cfg["veilleuse"]["fondu"] == 5

# ── Sur le socle ────────────────────────────────────────────────────────────

def test_une_veilleuse_deja_allumee_est_reprise_au_demarrage(creer):
    """Audit du 27/09 : la veilleuse ne reagissait qu'a une TRANSITION vers
    « on ». Un redemarrage de Home Assistant pendant qu'elle brule n'en produit
    aucune — la minuterie n'etait jamais posee, et la lampe restait allumee
    jusqu'au matin. Ici `duree: 0`, donc la reprise eteint tout de suite ;
    c'est le geste qui prouve qu'elle a bien vu la lampe."""
    n = creer(cfg_veilleuse(), AVEC_FONDU)
    lancer(n._async_reabonner())
    assert [a[1] for a in n.hass.services.appels] == ["turn_off"]


def test_une_veilleuse_eteinte_n_est_pas_reprise(creer):
    """La reprise ne regarde que ce qui BRULE : une lampe eteinte n'a pas de
    minuterie a reposer."""
    n = creer(cfg_veilleuse(), {"light.veilleuse": FauxEtat("off")})
    lancer(n._async_reabonner())
    assert n.hass.services.appels == []


def test_la_veilleuse_eteinte_par_reglage_ne_reprend_rien(creer):
    """Module debraye : la reprise ne touche a rien, meme allumee."""
    n = creer(cfg_veilleuse(actif=False), AVEC_FONDU)
    lancer(n._async_reabonner())
    assert n.hass.services.appels == []


def test_la_veilleuse_eteint_ce_qu_une_main_a_allume(creer):
    """C'est sa definition : on l'allume au coucher, elle s'eteint seule. Le
    gel de cette main ne la retient pas — sinon une veilleuse de trente
    minutes ne s'eteindrait jamais, le gel durant trente minutes lui aussi."""
    from homeassistant.core import Context

    n = creer(cfg_veilleuse(), AVEC_FONDU)
    lancer(n._async_reabonner())
    # La fixture pose `duree: 0` sur une lampe DEJA allumee : la reprise des
    # veilleuses (audit du 27/09) l'eteint donc au montage, ce qui est bien son
    # role. Ce test-ci ne parle que du gel de la main — on repart de zero.
    n.hass.services.appels.clear()

    class Ev:
        data = {"entity_id": "light.veilleuse"}
        context = Context(user_id="u1")

    n.regles._sur_changement(Ev())
    assert n.regles.gele("light.veilleuse")
    lancer(n._async_eteindre_veilleuse("light.veilleuse"))
    assert [a[1] for a in n.hass.services.appels] == ["turn_off"]


def test_le_coucher_respecte_une_main(creer):
    """L'extinction du soir, elle, cede : une lampe touchee a la main dans la
    demi-heure reste allumee, et le journal le dit."""
    from homeassistant.core import Context

    n = creer(cfg_coucher(), LAMPES)
    lancer(n._async_reabonner())

    class Ev:
        data = {"entity_id": "light.salon"}
        context = Context(user_id="u1")

    n.regles._sur_changement(Ev())
    lancer(n._async_coucher())
    assert n.hass.services.appels[0][2]["entity_id"] == ["light.veilleuse"]
    assert "1 sous la main" in lancer(n.regles.journal())[0]["detail"]


def test_les_niveaux_sont_dans_le_palier_nuit(module):
    regles = charger("regles")
    for nom, niveau in module.PRIORITES.items():
        # L'eclairage nocturne est un confort (ADR 0014) : le depart, maison
        # vide, l'emporte sur lui. Le reste est la nuit.
        palier = "confort" if nom == "eclairage" else "nuit"
        assert regles.ECHELLE[palier] <= niveau < regles.ECHELLE[palier] + 20
    assert module.PRIORITES["veilleuse"] > module.PRIORITES["coucher"]
    assert module.PRIORITES["eclairage"] < module.PRIORITES["coucher"]


def test_les_lampes_sont_declarees_au_socle(creer):
    n = creer({**cfg_veilleuse(), **cfg_coucher()}, {**AVEC_FONDU, "light.salon": FauxEtat("on")})
    lancer(n._async_reabonner())
    assert {"light.veilleuse", "light.salon"} <= n.regles._pilotees.get("nuit", set())


def test_en_simulation_le_coucher_n_eteint_rien(creer):
    n = creer({**cfg_coucher(), "simulation": {"actif": True}}, LAMPES)
    lancer(n._async_coucher())
    assert n.hass.services.appels == []
    assert lancer(n.regles.journal())[0]["simule"] is True


def test_l_etat_montre_le_journal_commun(creer):
    n = creer(cfg_coucher(), LAMPES)
    lancer(n._async_coucher())
    etat = lancer(n.async_etat())
    assert etat["journal"][0]["module"] == "nuit"
    assert etat["journal"][0]["motif"] == "23:30"


# ─────────────────────────────────────────────────────────────────────────────
# L'eclairage nocturne (§14, ADR 0012).
#
# La nuit, un mouvement allume la piece a faible intensite ; sans mouvement,
# elle s'eteint seule. Une lampe deja allumee n'est pas touchee. Une lampe
# montee a la main reste allumee : la main l'emporte, la regle lache.
# ─────────────────────────────────────────────────────────────────────────────

NUIT = {"sun.sun": FauxEtat("below_horizon")}
JOUR = {"sun.sun": FauxEtat("above_horizon")}
ENTREE = {"binary_sensor.mouvement": FauxEtat("off", {"device_class": "motion"}),
          "light.entree": FauxEtat("off"), "light.miroir": FauxEtat("off")}


def cfg_eclairage(**extra):
    e = {"actif": True, "luminosite": 10, "duree": 3,
         "pieces": {"Entrée": {"actif": True, "capteurs": ["binary_sensor.mouvement"],
                               "lampes": ["light.entree", "light.miroir"]}}}
    e.update(extra)
    return {"eclairage": e}


class Mvt:
    def __init__(self, etat, avant="off", haid="binary_sensor.mouvement"):
        self.data = {"entity_id": haid, "new_state": FauxEtat(etat), "old_state": FauxEtat(avant)}


def minuteurs(monkeypatch):
    """Compte les decomptes armes ; le socle ecrit son journal par le meme
    helper (20 s), on ne garde que les vrais decomptes."""
    import sys as _sys
    armes = []

    def faux(hass, delai, rappel):
        if delai >= 60:
            armes.append(delai)
        return lambda: None
    monkeypatch.setattr(_sys.modules["homeassistant.helpers.event"], "async_call_later", faux)
    return armes


def test_le_soleil_dit_la_nuit(module):
    assert module.fait_nuit(FauxEtat("below_horizon")) is True
    assert module.fait_nuit(FauxEtat("above_horizon")) is False
    assert module.fait_nuit(None) is False, "sans soleil, on suppose le jour"


def test_les_capteurs_des_pieces_actives(module):
    e = cfg_eclairage()["eclairage"]
    assert module.capteurs_par_piece(e) == {"binary_sensor.mouvement": "Entrée"}
    e["pieces"]["Entrée"]["actif"] = False
    assert module.capteurs_par_piece(e) == {}
    assert module.capteurs_par_piece(None) == {}


def test_seules_les_lampes_eteintes_sont_a_allumer(module):
    etats = {"light.a": FauxEtat("off"), "light.b": FauxEtat("on"), "light.c": FauxEtat("unavailable")}
    assert module.a_allumer(etats, ["light.a", "light.b", "light.c", "light.absente"]) == ["light.a"]


def test_un_mouvement_la_nuit_allume_la_piece_a_dix_pour_cent(creer):
    n = creer(cfg_eclairage(), {**NUIT, **ENTREE})
    n._sur_mouvement(Mvt("on"))
    lancer(n.hass.taches.pop())
    assert n.hass.services.appels == [
        ("light", "turn_on", {"entity_id": ["light.entree", "light.miroir"], "brightness_pct": 10})]
    assert n.allumees == {"Entrée": ["light.entree", "light.miroir"]}
    ligne = lancer(n.regles.journal())[0]
    assert ligne["regle"] == "eclairage"
    assert ligne["quoi"] == "allumer"
    assert ligne["motif"] == "mouvement : Entrée"


def test_en_plein_jour_rien(creer):
    n = creer(cfg_eclairage(), {**JOUR, **ENTREE})
    n._sur_mouvement(Mvt("on"))
    lancer(n.hass.taches.pop())
    assert n.hass.services.appels == []
    assert n.allumees == {}


def test_sans_soleil_on_suppose_le_jour(creer):
    n = creer(cfg_eclairage(), ENTREE)
    n._sur_mouvement(Mvt("on"))
    lancer(n.hass.taches.pop())
    assert n.hass.services.appels == []


def test_une_lampe_deja_allumee_n_est_pas_touchee(creer):
    n = creer(cfg_eclairage(), {**NUIT, **ENTREE, "light.entree": FauxEtat("on")})
    n._sur_mouvement(Mvt("on"))
    lancer(n.hass.taches.pop())
    assert n.hass.services.appels[0][2]["entity_id"] == ["light.miroir"]
    # Et elle ne sera pas eteinte a la fin du decompte : elle n'est pas a nous.
    assert n.allumees == {"Entrée": ["light.miroir"]}


def test_sans_mouvement_le_decompte_s_arme_puis_eteint(creer, monkeypatch):
    armes = minuteurs(monkeypatch)
    n = creer(cfg_eclairage(), {**NUIT, **ENTREE})
    n._sur_mouvement(Mvt("on"))
    lancer(n.hass.taches.pop())
    n.hass.states.table["light.entree"] = FauxEtat("on")
    n.hass.states.table["light.miroir"] = FauxEtat("on")
    n._sur_mouvement(Mvt("off", avant="on"))
    assert armes == [180]
    assert "Entrée" in n._minuteurs_pieces
    lancer(n._async_eteindre_piece("Entrée"))
    assert n.hass.services.appels[-1] == ("light", "turn_off", {"entity_id": ["light.entree", "light.miroir"]})
    assert n.allumees == {}
    assert lancer(n.regles.journal())[0]["motif"] == "3 min sans mouvement"


def test_un_nouveau_mouvement_annule_le_decompte(creer, monkeypatch):
    armes = minuteurs(monkeypatch)
    n = creer(cfg_eclairage(), {**NUIT, **ENTREE})
    n._sur_mouvement(Mvt("on"))
    lancer(n.hass.taches.pop())
    # La doublure de services ne touche pas aux etats : on joue Home Assistant.
    n.hass.states.table["light.entree"] = FauxEtat("on")
    n.hass.states.table["light.miroir"] = FauxEtat("on")
    n._sur_mouvement(Mvt("off", avant="on"))
    assert armes == [180]
    n._sur_mouvement(Mvt("on"))
    lancer(n.hass.taches.pop())
    assert n._minuteurs_pieces == {}, "quelqu'un bouge : ce qu'on a allume reste allume"
    assert len(n.hass.services.appels) == 1, "rien a rallumer : les lampes sont deja a nous"


def test_le_decompte_n_eteint_que_ce_qui_est_encore_allume(creer, monkeypatch):
    minuteurs(monkeypatch)
    n = creer(cfg_eclairage(), {**NUIT, **ENTREE})
    n._sur_mouvement(Mvt("on"))
    lancer(n.hass.taches.pop())
    # Une des deux a ete eteinte a la main entre temps.
    n.hass.states.table["light.entree"] = FauxEtat("on")
    lancer(n._async_eteindre_piece("Entrée"))
    assert n.hass.services.appels[-1][2]["entity_id"] == ["light.entree"]


def test_la_main_l_emporte_et_la_regle_lache(creer, monkeypatch):
    """ADR 0012 : montee a la main, la lampe est gelee — le socle l'ecarte, le
    journal le dit, et la regle ne revient pas a la fin du gel."""
    from homeassistant.core import Context
    minuteurs(monkeypatch)
    n = creer(cfg_eclairage(), {**NUIT, **ENTREE})
    lancer(n._async_reabonner())
    n._sur_mouvement(Mvt("on"))
    lancer(n.hass.taches.pop())
    n.hass.states.table["light.entree"] = FauxEtat("on", {"brightness": 255})
    n.hass.states.table["light.miroir"] = FauxEtat("on")

    class Ev:
        data = {"entity_id": "light.entree"}
        context = Context(user_id="u1")

    n.regles._sur_changement(Ev())
    lancer(n._async_eteindre_piece("Entrée"))
    assert n.hass.services.appels[-1][2]["entity_id"] == ["light.miroir"]
    assert "1 sous la main" in lancer(n.regles.journal())[0]["detail"]
    assert n.allumees == {}, "la regle a lache : rien a rejouer a la fin du gel"


def test_une_lampe_sous_la_main_ne_s_allume_pas_et_ne_fait_pas_de_ligne(creer):
    from homeassistant.core import Context
    n = creer(cfg_eclairage(), {**NUIT, **ENTREE})
    lancer(n._async_reabonner())

    class Ev:
        data = {"entity_id": "light.entree"}
        context = Context(user_id="u1")

    n.regles._sur_changement(Ev())
    n._sur_mouvement(Mvt("on"))
    lancer(n.hass.taches.pop())
    assert n.hass.services.appels[0][2]["entity_id"] == ["light.miroir"]


def test_une_maison_vide_ne_s_allume_pas_sur_un_chat(creer):
    """Le depart tient les lampes (palier presence) : l'eclairage nocturne, un
    confort, ne les prend pas — et ne remplit pas le journal a chaque passage."""
    regles = charger("regles")
    n = creer(cfg_eclairage(), {**NUIT, **ENTREE})
    lancer(n.regles.agir("presence", "depart", "light", "turn_off",
                         ["light.entree", "light.miroir"], priorite=regles.niveau("presence"), tenir=True))
    n.hass.services.appels.clear()
    n._sur_mouvement(Mvt("on"))
    lancer(n.hass.taches.pop())
    assert n.hass.services.appels == []
    assert [l["regle"] for l in lancer(n.regles.journal())] == ["depart"]


def test_un_capteur_qui_reste_a_on_n_est_pas_un_nouveau_mouvement(creer):
    n = creer(cfg_eclairage(), {**NUIT, **ENTREE})
    n._sur_mouvement(Mvt("on", avant="on"))
    n._sur_mouvement(Mvt("off", avant="off"))
    n._sur_mouvement(Mvt("on", haid="binary_sensor.inconnu"))
    assert n.hass.taches == []


def test_la_regle_debrayee_n_ecoute_rien(creer, monkeypatch):
    import sys as _sys
    ecoutes = []
    monkeypatch.setattr(_sys.modules["homeassistant.helpers.event"], "async_track_state_change_event",
                        lambda hass, ids, cb: ecoutes.append(sorted(ids)) or (lambda: None))
    n = creer(cfg_eclairage(), {**NUIT, **ENTREE})
    lancer(n._async_reabonner())
    assert ["binary_sensor.mouvement"] in ecoutes
    assert {"light.entree", "light.miroir"} <= n.regles._pilotees.get("nuit", set())
    ecoutes.clear()
    n.cfg["eclairage"]["actif"] = False
    lancer(n._async_reabonner())
    assert ["binary_sensor.mouvement"] not in ecoutes


def test_les_pieces_s_enregistrent_une_a_la_fois(creer):
    n = creer(cfg_eclairage(), {**NUIT, **ENTREE})
    cfg = lancer(n.async_enregistrer({"eclairage": {"pieces": {"Couloir": {"actif": True, "capteurs": ["binary_sensor.c"], "lampes": ["light.c"]}}}}))
    assert set(cfg["eclairage"]["pieces"]) == {"Entrée", "Couloir"}
    cfg = lancer(n.async_enregistrer({"eclairage": {"pieces": {"Entrée": {"actif": False}}}}))
    assert cfg["eclairage"]["pieces"]["Entrée"]["actif"] is False
    assert cfg["eclairage"]["pieces"]["Entrée"]["lampes"] == ["light.entree", "light.miroir"]
    cfg = lancer(n.async_enregistrer({"eclairage": {"pieces": {"Couloir": None}}}))
    assert set(cfg["eclairage"]["pieces"]) == {"Entrée"}
    assert cfg["eclairage"]["luminosite"] == 10


def test_l_etat_montre_ce_que_la_regle_a_allume(creer):
    n = creer(cfg_eclairage(), {**NUIT, **ENTREE})
    n._sur_mouvement(Mvt("on"))
    lancer(n.hass.taches.pop())
    etat = lancer(n.async_etat())
    assert etat["eclairees"] == {"Entrée": ["light.entree", "light.miroir"]}
    assert etat["config"]["eclairage"]["duree"] == 3


def test_les_defauts_de_l_eclairage(creer):
    n = creer({}, {})
    assert n.cfg["eclairage"] == {"actif": False, "luminosite": 10, "duree": 3, "pieces": {}}


def test_un_capteur_qui_reste_a_off_ne_relance_pas_le_decompte(creer, monkeypatch):
    """Un attribut qui bouge sur un capteur deja retombe n'est pas un nouveau
    « plus de mouvement » : le decompte en cours ne repart pas."""
    armes = minuteurs(monkeypatch)
    n = creer(cfg_eclairage(), {**NUIT, **ENTREE})
    n._sur_mouvement(Mvt("on"))
    lancer(n.hass.taches.pop())
    n._sur_mouvement(Mvt("off", avant="on"))
    assert armes == [180]
    n._sur_mouvement(Mvt("off", avant="off"))
    assert armes == [180], "le decompte a ete relance par un capteur qui n'a pas bouge"


def test_sans_rien_d_allume_pas_de_decompte(creer, monkeypatch):
    """En plein jour la regle n'a rien allume : la fin du mouvement n'arme
    rien — un decompte pour rien se lirait a l'ecran."""
    armes = minuteurs(monkeypatch)
    n = creer(cfg_eclairage(), {**JOUR, **ENTREE})
    n._sur_mouvement(Mvt("on"))
    lancer(n.hass.taches.pop())
    n._sur_mouvement(Mvt("off", avant="on"))
    assert armes == []
    assert n._minuteurs_pieces == {}


# ── Le mode invite (ADR 0016) : le coucher attend ───────────────────────────

def test_le_coucher_attend_quand_un_invite_garde_la_maison(creer):
    n = creer(cfg_coucher(), {**LAMPES, "input_boolean.invite": FauxEtat("on")})
    # `actif` : le mode invite est une piece de la regle de presence, et c'est
    # elle qui arme la coupure des trente minutes.
    lancer(n.store.async_set_shared("loggia_presence", {"actif": True, "invite": {"entite": "input_boolean.invite"}}))
    lancer(n._async_coucher())
    assert n.hass.services.appels == [], "on n'eteint pas tout sur la tete de l'invite"
    j = lancer(n.regles.journal(module="nuit"))[0]
    assert (j["regle"], j["quoi"], j["motif"]) == ("coucher", "retenir", "mode invite")
    # Mode eteint : le coucher reprend.
    n.hass.states.table["input_boolean.invite"] = FauxEtat("off")
    lancer(n._async_coucher())
    assert len(n.hass.services.appels) == 1


def test_la_regle_de_presence_eteinte_le_coucher_ne_se_retient_plus(creer):
    """Sans la regle, PERSONNE ne coupe le mode invite au bout de trente
    minutes : `presence.py` sort avant d'armer quoi que ce soit. L'honorer
    quand meme retenait le coucher pour toujours, sans un mot (audit 23/09)."""
    n = creer(cfg_coucher(), {**LAMPES, "input_boolean.invite": FauxEtat("on")})
    lancer(n.store.async_set_shared("loggia_presence", {"actif": False, "invite": {"entite": "input_boolean.invite"}}))
    lancer(n._async_coucher())
    assert len(n.hass.services.appels) == 1, "le coucher doit eteindre : rien ne rendrait la main"
    assert not [j for j in lancer(n.regles.journal(module="nuit")) if j["quoi"] == "retenir"]


# ── Audit du 03/10 : capteur qui decroche, maison vide ──────────────────────

def test_un_capteur_qui_decroche_arme_quand_meme_l_extinction(creer, monkeypatch):
    """on, puis unavailable, puis off : la transition unavailable → off
    n'armait rien, et la lampe restait allumee jusqu'au matin."""
    armes = minuteurs(monkeypatch)
    n = creer(cfg_eclairage(), {**NUIT, **ENTREE})
    n._sur_mouvement(Mvt("on"))
    lancer(n.hass.taches.pop())
    n.hass.states.table["light.entree"] = FauxEtat("on")
    n.hass.states.table["light.miroir"] = FauxEtat("on")
    n._sur_mouvement(Mvt("unavailable", avant="on"))
    assert armes == [180], armes
    assert "Entrée" in n._minuteurs_pieces


def test_maison_vide_un_mouvement_n_allume_rien(creer):
    """Le chat passe devant le capteur, maison declaree vide (ADR 0014)."""
    import types

    n = creer(cfg_eclairage(), {**NUIT, **ENTREE})
    n.hass.data = {"loggia": {"presence": types.SimpleNamespace(dehors=True)}}
    n._sur_mouvement(Mvt("on"))
    lancer(n.hass.taches.pop())
    assert [a for a in n.hass.services.appels if a[1] == "turn_on"] == []


# ─────────────────────────────────────────────────────────────────────────────
# Une seule idee de la lumiere de la maison (audit du 19/10, ADR 0260) : le
# coucher epargne TOUJOURS les veilleuses, ignore la LED d'une borne et une
# lampe cachee, eteint l'interrupteur declare lumiere par SON service, et le
# journal compte les vraies lampes.
# ─────────────────────────────────────────────────────────────────────────────

import sys as _sys  # noqa: E402
import time as _time  # noqa: E402
import types as _types  # noqa: E402

EXTERIEUR = "switch.lumiere_exterieur"
LED = "light.u6_lr_led"


def _entree(haid, categorie=None, cache=None):
    return _types.SimpleNamespace(entity_id=haid, entity_category=categorie, hidden_by=cache, disabled_by=None)


def registre(monkeypatch, *entrees):
    reg = _types.SimpleNamespace(entities={e.entity_id: e for e in entrees})
    monkeypatch.setattr(_sys.modules["homeassistant.helpers.entity_registry"], "async_get", lambda _h: reg)


def cfg_nuit(**extra):
    c = {"veilleuse": {"actif": True, "lampes": ["light.veilleuse"], "duree": 30, "fondu": 0, "depuis": ""},
         "coucher": {"actif": True, "heure": "23:30", "sauf": [], "jours": []}}
    c.update(extra)
    return c


MAISON = {"light.salon": FauxEtat("on"), "light.cuisine": FauxEtat("off"), "light.veilleuse": FauxEtat("on"),
          "light.chambre_tout": FauxEtat("on", {"entity_id": ["light.chambre", "light.veilleuse"]}),
          "light.chambre": FauxEtat("on"), LED: FauxEtat("on"), "light.cachee": FauxEtat("on"),
          EXTERIEUR: FauxEtat("on"), "switch.prise_nas": FauxEtat("on")}


def test_le_coucher_epargne_toujours_les_veilleuses_et_le_groupe_qui_en_contient_une(creer):
    """Sa decision : « les veilleuses sont epargnees » partout - meme sans les
    nommer dans `sauf`. Le groupe de la chambre contient la veilleuse : son
    `turn_off` l'eteindrait, il est epargne ; la chambre, elle, s'eteint."""
    n = creer(cfg_nuit(), MAISON)
    lancer(n._async_coucher())
    assert n.hass.services.appels[0] == ("light", "turn_off", {"entity_id": ["light.cachee", "light.chambre",
                                                                              "light.salon", LED]})
    # Meme la regle de la veilleuse eteinte : la liste dit ce qu'est une veilleuse.
    n = creer(cfg_nuit(veilleuse={"actif": False, "lampes": ["light.veilleuse"]}), MAISON)
    lancer(n._async_coucher())
    assert "light.veilleuse" not in n.hass.services.appels[0][2]["entity_id"]


def test_le_coucher_ignore_la_led_et_la_cachee_et_eteint_l_interrupteur_declare(creer, monkeypatch):
    """La LED de la borne (`config`) et une lampe cachee ne sont pas des lumieres
    de la maison ; l'interrupteur declare lumiere en est une, et recoit
    `homeassistant.turn_off` - `light.turn_off`, Home Assistant le refuserait.
    Le journal compte les vraies lampes, par ordre."""
    registre(monkeypatch, _entree(LED, categorie="config"), _entree("light.cachee", cache="user"),
             _entree("light.salon"), _entree(EXTERIEUR), _entree("switch.prise_nas"))
    n = creer(cfg_nuit(), MAISON, partage={"loggia_switchlights": [EXTERIEUR]})
    lancer(n._async_coucher())
    assert n.hass.services.appels == [
        ("light", "turn_off", {"entity_id": ["light.chambre", "light.salon"]}),
        ("homeassistant", "turn_off", {"entity_id": [EXTERIEUR]}),
    ]
    lignes = lancer(n.regles.journal(module="nuit"))
    assert [(l["quoi"], l["n"], l["cibles"]) for l in lignes] == [
        ("eteindre", 1, [EXTERIEUR]), ("eteindre", 2, ["light.chambre", "light.salon"])]
    # Le socle suit ce que le coucher peut toucher : les lumieres de la maison, l'interrupteur compris.
    assert n.regles._pilotees["nuit"] == {"light.veilleuse", "light.chambre", "light.salon", "light.cuisine",
                                          EXTERIEUR}


def test_le_coucher_sous_le_repli_herite_des_interrupteurs(creer):
    n = creer(cfg_nuit(), {"light.salon": FauxEtat("on"), EXTERIEUR: FauxEtat("on")},
              partage={"loggia_entities": {"switchLights": [EXTERIEUR]}})
    lancer(n._async_coucher())
    assert n.hass.services.appels[1] == ("homeassistant", "turn_off", {"entity_id": [EXTERIEUR]})


def test_une_veilleuse_absente_ou_une_liste_vide_ne_genent_pas_le_coucher(creer):
    n = creer(cfg_nuit(veilleuse={"actif": True, "lampes": ["light.partie", None, 5]}), {"light.salon": FauxEtat("on")})
    lancer(n._async_coucher())
    assert n.hass.services.appels == [("light", "turn_off", {"entity_id": ["light.salon"]})]
    n = creer(cfg_nuit(veilleuse={"actif": True, "lampes": []}), {"light.salon": FauxEtat("on")})
    lancer(n._async_coucher())
    assert n.hass.services.appels == [("light", "turn_off", {"entity_id": ["light.salon"]})]


def test_l_eclairage_nocturne_commande_un_interrupteur_par_son_service(creer):
    """Une piece dont une « lampe » est un interrupteur : il s'allume sans
    niveau, par `homeassistant`, et s'eteint de meme."""
    piece = {"actif": True, "capteurs": ["binary_sensor.mouvement"], "lampes": ["light.entree", EXTERIEUR]}
    n = creer(cfg_eclairage(pieces={"Entrée": piece}),
              {**NUIT, "binary_sensor.mouvement": FauxEtat("off"), "light.entree": FauxEtat("off"),
               EXTERIEUR: FauxEtat("off")})
    lancer(n._async_allumer("Entrée"))
    assert n.hass.services.appels == [
        ("light", "turn_on", {"entity_id": ["light.entree"], "brightness_pct": 10}),
        ("homeassistant", "turn_on", {"entity_id": [EXTERIEUR]}),
    ]
    assert n.allumees == {"Entrée": ["light.entree", EXTERIEUR]}
    n.hass.states.table["light.entree"] = FauxEtat("on")
    n.hass.states.table[EXTERIEUR] = FauxEtat("on")
    lancer(n._async_eteindre_piece("Entrée"))
    assert n.hass.services.appels[2:] == [
        ("light", "turn_off", {"entity_id": ["light.entree"]}),
        ("homeassistant", "turn_off", {"entity_id": [EXTERIEUR]}),
    ]


# ── La minuterie de la veilleuse face a une panne (audit du 19/10) ──────────

class Ev:
    def __init__(self, etat, avant, haid="light.veilleuse"):
        self.data = {"entity_id": haid, "new_state": FauxEtat(etat) if etat else None,
                     "old_state": FauxEtat(avant) if avant else None}


class Horloge:
    def __init__(self, t):
        self.t = t

    def __call__(self):
        return self.t


def rendezvous(monkeypatch, horloge):
    """`async_call_later` : chaque echeance, qui part quand le test le dit."""
    poses = []

    def faux(hass, delai, rappel):
        e = {"quand": horloge.t + delai, "delai": delai, "rappel": rappel, "annule": False}
        poses.append(e)

        def annuler():
            e["annule"] = True
        return annuler
    monkeypatch.setattr(_sys.modules["homeassistant.helpers.event"], "async_call_later", faux)
    return poses


def armees(poses):
    """Les echeances de la veilleuse encore armees - pas celle du journal (20 s)."""
    return [e for e in poses if not e["annule"] and e["delai"] >= 60]


def test_une_veilleuse_qui_se_tait_puis_revient_garde_son_echeance(creer, monkeypatch):
    """Une Hue qui decroche deux minutes : `on` → `unavailable` → `on`. La
    minuterie n'est pas desarmee par le silence, et le retour ne repose pas
    une duree pleine - l'echeance d'origine reste."""
    h = Horloge(1000.0)
    monkeypatch.setattr(_time, "time", h)
    poses = rendezvous(monkeypatch, h)
    n = creer(cfg_nuit(), {"light.veilleuse": FauxEtat("on")})
    n._sur_lampe(Ev("on", "off"))
    lancer(n.hass.taches.pop())
    assert [e["quand"] for e in armees(poses)] == [1000.0 + 1800]
    h.t = 1600.0
    n.hass.states.table["light.veilleuse"] = FauxEtat("unavailable")
    n._sur_lampe(Ev("unavailable", "on"))
    assert [e["quand"] for e in armees(poses)] == [2800.0], "le silence ne desarme pas"
    h.t = 1700.0
    n.hass.states.table["light.veilleuse"] = FauxEtat("on")
    n._sur_lampe(Ev("on", "unavailable"))
    for t in list(n.hass.taches):
        lancer(t)
    n.hass.taches.clear()
    assert [e["quand"] for e in armees(poses)] == [2800.0], "le retour ne repose pas une duree pleine"
    assert n.hass.services.appels == []


def test_une_echeance_passee_pendant_le_silence_eteint_au_retour(creer, monkeypatch):
    """La lampe s'est tue avant l'echeance, et revient apres elle : elle aurait
    du etre eteinte, elle l'est au retour - pas trente minutes plus tard."""
    h = Horloge(1000.0)
    monkeypatch.setattr(_time, "time", h)
    poses = rendezvous(monkeypatch, h)
    n = creer(cfg_nuit(), {"light.veilleuse": FauxEtat("on")})
    n._sur_lampe(Ev("on", "off"))
    lancer(n.hass.taches.pop())
    n.hass.states.table["light.veilleuse"] = FauxEtat("unavailable")
    n._sur_lampe(Ev("unavailable", "on"))
    h.t = 2800.0
    e = armees(poses)[0]
    e["annule"] = True
    e["rappel"](None)
    lancer(n.hass.taches.pop())
    assert n.hass.services.appels == [], "muette a l'echeance : rien a eteindre"
    h.t = 2900.0
    n.hass.states.table["light.veilleuse"] = FauxEtat("on")
    n._sur_lampe(Ev("on", "unavailable"))
    lancer(n.hass.taches.pop())
    assert [a[:2] for a in n.hass.services.appels] == [("light", "turn_off")]
    assert armees(poses) == [] and n._minuteurs == {}


def test_un_reglage_de_luminosite_n_arme_pas_une_lampe_allumee_avant_la_plage(creer, monkeypatch):
    """Allumee a 15 h, hors de la plage : pas de minuterie. A 20 h on baisse sa
    luminosite - un evenement `on` → `on` - : ce n'est pas un allumage, la
    minuterie ne s'arme pas. Un vrai allumage, si."""
    h = Horloge(1000.0)
    monkeypatch.setattr(_time, "time", h)
    poses = rendezvous(monkeypatch, h)
    n = creer(cfg_nuit(), {"light.veilleuse": FauxEtat("on", {"brightness": 100})})
    n._sur_lampe(Ev("on", "on"))
    assert n.hass.taches == [] and armees(poses) == []
    n._sur_lampe(Ev("on", "off"))
    lancer(n.hass.taches.pop())
    assert len(armees(poses)) == 1
    # Eteinte a la main : la minuterie et son echeance s'en vont.
    n._sur_lampe(Ev("off", "on"))
    assert armees(poses) == [] and n._minuteurs == {} and "light.veilleuse" not in (n._echeances or {})


def test_une_veilleuse_revenue_sans_echeance_s_arme(creer, monkeypatch):
    """Eteinte, muette, puis `on` : personne n'a vu l'allumage - on arme, mieux
    vaut une veilleuse qui s'eteint trop tot qu'une qui brule toute la nuit."""
    h = Horloge(1000.0)
    monkeypatch.setattr(_time, "time", h)
    poses = rendezvous(monkeypatch, h)
    n = creer(cfg_nuit(), {"light.veilleuse": FauxEtat("on")})
    n._sur_lampe(Ev("on", "unavailable"))
    lancer(n.hass.taches.pop())
    assert [e["quand"] for e in armees(poses)] == [2800.0]


# ── Ce que l'ecran lit, sous les droits du compte (audit du 19/10) ──────────

class _Permissions:
    def __init__(self, lisibles):
        self.lisibles = set(lisibles)

    def check_entity(self, haid, sorte):
        return sorte == "read" and haid in self.lisibles


def compte(lisibles=None, admin=False):
    return _types.SimpleNamespace(id="u-lea", is_admin=admin,
                                  permissions=None if lisibles is None else _Permissions(lisibles))


def test_l_etat_ne_dit_a_un_compte_restreint_que_ce_qu_il_lit(creer):
    cfg = cfg_nuit(veilleuse={"actif": True, "lampes": ["light.veilleuse", "light.secret"]},
                   coucher={"actif": True, "heure": "23:30", "sauf": ["light.secret"], "jours": []},
                   eclairage={"actif": True, "luminosite": 10, "duree": 3,
                              "pieces": {"Entrée": {"actif": True, "capteurs": ["binary_sensor.m", "binary_sensor.s"],
                                                    "lampes": ["light.entree", "light.secret"]}}})
    n = creer(cfg, {"light.salon": FauxEtat("on"), "light.secret": FauxEtat("on")})
    lancer(n._async_coucher())
    lancer(n.regles.noter("nuit", "coucher", "retenir", n=0, motif="mode invite"))
    lancer(n.regles.noter("nuit", "veilleuse", "eteindre", cibles=["light.secret"], motif="30 min"))
    n._minuteurs = {"light.veilleuse": lambda: None, "light.secret": lambda: None}
    n.allumees = {"Entrée": ["light.entree", "light.secret"]}
    lisibles = ["light.salon", "light.veilleuse", "light.entree", "binary_sensor.m"]
    etat = lancer(n.async_etat(compte(lisibles)))
    assert etat["config"]["veilleuse"]["lampes"] == ["light.veilleuse"], "la liste reste, filtree"
    assert etat["config"]["coucher"]["sauf"] == []
    assert etat["config"]["eclairage"]["pieces"]["Entrée"] == {"actif": True, "capteurs": ["binary_sensor.m"],
                                                                "lampes": ["light.entree"]}
    assert etat["en_cours"] == ["light.veilleuse"] and etat["eclairees"] == {"Entrée": ["light.entree"]}
    # Le journal : la ligne de la veilleuse vise `light.secret` - elle ne se rend pas ; la ligne sans
    # cible et celle du coucher (`light.salon`), si.
    assert [(l["regle"], l["quoi"]) for l in etat["journal"]] == [("coucher", "retenir"), ("coucher", "eteindre")]
    # Un administrateur, ou un compte sans restriction : tout.
    assert lancer(n.async_etat(compte(admin=True)))["config"]["veilleuse"]["lampes"] == ["light.veilleuse", "light.secret"]
    assert len(lancer(n.async_etat(compte()))["journal"]) == 3
    assert len(lancer(n.async_etat())["journal"]) == 3
    assert n.cfg["coucher"]["sauf"] == ["light.secret"], "la configuration en memoire ne bouge pas"


# ── Un patch mal forme se refuse avant d'ecrire (audit du 19/10) ────────────

@pytest.mark.parametrize("patch", [
    {"veilleuse": {"lampes": "light.veilleuse"}},
    {"veilleuse": {"lampes": ["light.veilleuse", 5]}},
    {"coucher": {"sauf": {"light.a": True}}},
    {"coucher": {"jours": ["lundi"]}},
    {"coucher": {"jours": [0, 9]}},
    {"eclairage": {"pieces": {"Entrée": {"lampes": [None]}}}},
    {"eclairage": {"pieces": {"Entrée": {"capteurs": "binary_sensor.m"}}}},
], ids=["lampes_texte", "lampe_nombre", "sauf_table", "jour_texte", "jour_hors_semaine", "lampe_none", "capteurs_texte"])
def test_un_patch_mal_forme_est_refuse_sans_rien_ecrire(creer, patch):
    refus = charger("refus")
    n = creer(cfg_veilleuse())
    with pytest.raises(refus.RefusNomme) as err:
        lancer(n.async_enregistrer(patch))
    # ASSERTION MODIFIEE (seconde tranche, B14) : un code NOMME, que l'ecran sait dire ; `invalid_format` reste le refus generique.
    assert err.value.code == "nuit_format"
    assert lancer(n.store.async_get_shared("loggia_nuit"))["veilleuse"]["lampes"] == ["light.veilleuse"]
    assert n.cfg["veilleuse"]["lampes"] == ["light.veilleuse"]


def test_un_patch_bien_forme_passe(creer):
    n = creer(cfg_veilleuse())
    cfg = lancer(n.async_enregistrer({"veilleuse": {"lampes": ["light.a", "light.b"]}, "coucher": {"jours": [0, 6], "sauf": []},
                                      "eclairage": {"pieces": {"Entrée": {"actif": True, "capteurs": ["binary_sensor.m"],
                                                                           "lampes": ["light.e"]}, "Vide": None}}}))
    assert cfg["veilleuse"]["lampes"] == ["light.a", "light.b"] and cfg["coucher"]["jours"] == [0, 6]
    assert cfg["eclairage"]["pieces"] == {"Entrée": {"actif": True, "capteurs": ["binary_sensor.m"], "lampes": ["light.e"]}}


# ── Une veilleuse qui est un interrupteur (retouches du 19/10, R5) ─────────

def test_une_veilleuse_interrupteur_s_eteint_par_homeassistant_sans_transition(creer):
    """Un interrupteur declare lumiere peut etre une veilleuse (la vue Nuit le
    propose) : `light.turn_off` sur un `switch.*`, Home Assistant le refuse -
    on passe par `service_de` (lumieres_maison), comme le coucher. Et un
    interrupteur n'a pas de transition, meme avec un fondu regle et un
    `supported_features` qui pretendrait le contraire."""
    n = creer(cfg_veilleuse(lampes=["switch.veilleuse"]),
              {"switch.veilleuse": FauxEtat("on", {"supported_features": 32})})
    lancer(n._async_eteindre_veilleuse("switch.veilleuse"))
    assert n.hass.services.appels == [("homeassistant", "turn_off", {"entity_id": ["switch.veilleuse"]})]


def test_une_veilleuse_interrupteur_s_arme_et_s_eteint_comme_une_lampe(creer):
    """Allume a la main, l'interrupteur arme sa minuterie comme un `light.*` ;
    a duree nulle il s'eteint tout de suite, par son service."""
    n = creer(cfg_veilleuse(lampes=["switch.veilleuse"], duree=0, fondu=5),
              {"switch.veilleuse": FauxEtat("on")})
    n._sur_lampe(Ev("on", "off", haid="switch.veilleuse"))
    lancer(n.hass.taches.pop())
    assert n.hass.services.appels == [("homeassistant", "turn_off", {"entity_id": ["switch.veilleuse"]})]
    assert "switch.veilleuse" not in n._minuteurs
