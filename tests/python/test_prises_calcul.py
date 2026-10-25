"""Les prises en pur (chantier Prises, spec 5 et 6.1) : la configuration, ce que l'etat publie, le cycle."""
from __future__ import annotations

from datetime import timedelta, timezone

import pytest

from conftest import charger

PARIS_ETE = timezone(timedelta(hours=2))
LV, NAS, SEJOUR = "switch.prise_lave_vaisselle", "switch.prise_nas", "switch.prise_sejour"


@pytest.fixture(scope="module")
def calc():
    return charger("prises_calcul")


# ── La configuration `loggia_prises` ───────────────────────────────────────

def test_par_defaut_rien_n_est_protege_impose_ni_prevenu(calc):
    """P6 : l'alerte de fin de cycle est coupee par defaut."""
    assert calc.config_defaut() == {"protegees": [], "types": {}, "prevenir": {}}
    for brut in (None, [], "x", {"protegees": "switch.a", "types": [], "prevenir": None}):
        assert calc.lire_config(brut) == calc.config_defaut()


def test_la_configuration_relue_ecarte_l_illisible(calc):
    brut = {"protegees": [NAS, LV, NAS, "light.salon", 5, None],
            "types": {SEJOUR: "lv", NAS: "siren", "switch.x": "inconnu", "cover.y": "lv", "switch.z": ["lv"]},
            "prevenir": {LV: True, NAS: 1, SEJOUR: False, "switch.w": "oui"}}
    assert calc.lire_config(brut) == {"protegees": [LV, NAS], "types": {SEJOUR: "lv"}, "prevenir": {LV: True}}


def test_protegees_arrive_entiere_et_remplace_la_liste(calc):
    """Le piege des volets : l'ecran envoie la liste entiere ; une fusion prise
    par prise ferait d'un retrait un retrait sans effet."""
    cfg = calc.poser_patch(calc.config_defaut(), {"protegees": [NAS, LV]})
    assert cfg["protegees"] == [LV, NAS]
    assert calc.poser_patch(cfg, {"protegees": [NAS]})["protegees"] == [NAS]
    assert calc.poser_patch(cfg, {"types": {LV: "lv"}})["protegees"] == [LV, NAS], "sans protegees, rien ne change"


def test_types_et_alertes_se_posent_prise_par_prise(calc):
    cfg = calc.poser_patch(calc.config_defaut(), {"types": {SEJOUR: "ll", NAS: "pc"}, "prevenir": {LV: True}})
    cfg = calc.poser_patch(cfg, {"types": {NAS: None}, "prevenir": {SEJOUR: True}})
    assert cfg["types"] == {SEJOUR: "ll"}, "None rend la prise a son nom"
    assert cfg["prevenir"] == {LV: True, SEJOUR: True}
    assert calc.poser_patch(cfg, {"prevenir": {LV: False}})["prevenir"] == {SEJOUR: True}
    assert calc.poser_patch(cfg, {"inconnue": 1}) == cfg, "une cle inconnue s'ignore"


@pytest.mark.parametrize("patch", [
    None, [], {"protegees": NAS}, {"protegees": [NAS, "light.a"]}, {"types": [NAS]},
    {"types": {NAS: "siren"}}, {"types": {NAS: "frigidaire"}}, {"types": {"light.a": "lv"}},
    {"prevenir": {LV: 1}}, {"prevenir": {LV: "oui"}}, {"prevenir": True},
], ids=["rien", "liste", "protegees_texte", "protegees_lumiere", "types_liste", "sirene", "type_inconnu",
        "type_hors_switch", "prevenir_entier", "prevenir_texte", "prevenir_booleen"])
def test_un_patch_que_l_ecran_n_envoie_pas_est_refuse(calc, patch):
    with pytest.raises(ValueError):
        calc.poser_patch(calc.config_defaut(), patch)


# ── Ce que l'etat publie ────────────────────────────────────────────────────

def test_un_instant_s_ecrit_a_l_heure_de_la_maison(calc):
    assert calc.instant_iso(1791900840.7, PARIS_ETE) == "2026-10-13T16:14:00+02:00"
    assert calc.instant_iso(1791900840, timezone.utc) == "2026-10-13T14:14:00+00:00"
    for illisible in (None, "1791900840", True, float("nan"), float("inf"), 10 ** 400):
        assert calc.instant_iso(illisible, PARIS_ETE) is None


def test_la_fiche_d_une_prise(calc):
    cfg = calc.poser_patch(calc.config_defaut(), {"protegees": [NAS], "types": {NAS: "pc"}, "prevenir": {LV: True}})
    assert calc.fiche(NAS, cfg, "pc", None, [], PARIS_ETE) == {
        "type": "pc", "impose": True, "protegee": True, "prevenir": False, "cycle": None, "cycles": [],
        "suivi": False}
    assert calc.fiche(LV, cfg, "lv", None, None, PARIS_ETE, suivie=True) == {
        "type": "lv", "impose": False, "protegee": False, "prevenir": True, "cycle": None, "cycles": [],
        "suivi": True}


# ── Le cycle d'un electromenager (P3, spec 5) ──────────────────────────────

def rejouer(calc, mesures, suivi=None):
    """Des mesures [(t, w)], comme le module les rejoue : ce qui etait du avant
    chacune se conclut, puis elle compte. Rend (suivi, evenements)."""
    s, evenements = suivi or calc.suivi_neuf(), []
    for t, w in mesures:
        s, e = calc.conclure(s, t)
        if e:
            evenements.append(e)
        s = calc.avancer(s, t, w)
    return s, evenements


def test_une_minute_au_dessus_de_15_w_commence_le_cycle_a_son_premier_instant(calc):
    s, _ = rejouer(calc, [(0, 2.0), (100, 1950.0)])
    assert calc.echeance(s) == 160, "une minute apres le premier instant au-dessus"
    assert calc.conclure(s, 159) == (s, None)
    s, e = calc.conclure(s, 160)
    assert e == {"quoi": "debut", "debut": 100} and s["en_cours"] and s["debut"] == 100


def test_15_w_tout_juste_ne_commence_rien(calc):
    s, _ = rejouer(calc, [(0, 15.0), (300, 15.0)])
    assert s["haut"] is None and calc.echeance(s) is None


def test_une_retombee_avant_la_minute_efface_le_debut(calc):
    s, _ = rejouer(calc, [(100, 1950.0), (130, 10.0)])
    assert s["haut"] is None and calc.echeance(s) is None
    s, _ = rejouer(calc, [(200, 30.0)], s)
    assert s["haut"] == 200, "le debut se compte de nouveau depuis le premier instant"


def test_la_fin_est_datee_a_la_baisse(calc):
    # La meme valeur, republiee toutes les dix minutes (`state_reported`).
    tenue = [(160 + 600 * k, 1950.0) for k in range(1, 6)]
    s, evenements = rejouer(calc, [(100, 1950.0), (160, 1950.0)] + tenue + [(3700, 3.0), (3900, 1.0)])
    assert [e["quoi"] for e in evenements] == ["debut"]
    assert calc.echeance(s) == 3700 + 600
    s, e = calc.conclure(s, 4300)
    assert e["quoi"] == "fin" and (e["cycle"]["debut"], e["cycle"]["fin"]) == (100, 3700)
    assert e["cycle"]["wh"] == pytest.approx(1950.0 * 3600 / 3600), "l'energie s'arrete a la baisse"
    assert not s["en_cours"] and calc.echeance(s) is None


def test_le_sechage_a_14_w_n_est_pas_la_fin(calc):
    s, evenements = rejouer(calc, [(100, 1950.0), (160, 1950.0), (3700, 14.0), (5500, 14.0)])
    assert s["en_cours"] and s["bas"] is None and evenements == [{"quoi": "debut", "debut": 100}]
    s, _ = rejouer(calc, [(6000, 5.0)], s)
    assert s["bas"] == 6000, "5 W tout juste : la fin commence"


def test_un_pic_pendant_les_dix_minutes_relance_l_attente(calc):
    s, _ = rejouer(calc, [(100, 1950.0), (160, 1950.0), (1000, 2.0), (1300, 800.0), (1400, 2.0)])
    assert s["bas"] == 1400 and calc.echeance(s) == 2000


def test_deux_heures_sans_nouvelle_closent_le_cycle_a_la_derniere_mesure(calc):
    s, _ = rejouer(calc, [(100, 1950.0), (160, 1950.0), (1000, 1800.0)])
    assert calc.echeance(s) == 1000 + 7200
    s, e = calc.conclure(s, 8200)
    assert (e["cycle"]["debut"], e["cycle"]["fin"]) == (100, 1000) and not s["en_cours"]


def test_chaque_cloture_dit_sa_raison(calc):
    """Relecture du 13/10, point 3 : dix minutes basses, c'est la fin ; deux
    heures sans nouvelle, un silence ; six heures sans retomber, une
    interruption. Seule la fin previent (prises.py)."""
    s, _ = rejouer(calc, [(100, 1950.0), (160, 1950.0), (1000, 2.0)])
    assert calc.conclure(s, 1600)[1]["quoi"] == "fin"
    s, _ = rejouer(calc, [(100, 1950.0), (160, 1950.0), (1000, 1800.0)])
    assert calc.conclure(s, 8200)[1]["quoi"] == "silence"
    s, _ = rejouer(calc, [(100, 1950.0), (160, 1950.0)] + [(100 + 3600 * h, 1800.0) for h in range(1, 6)])
    assert calc.echeance(s) == 100 + 6 * 3600, "la sixieme heure vient avant le silence"
    assert calc.conclure(s, 100 + 6 * 3600)[1]["quoi"] == "interrompu"


def test_six_heures_sans_retomber_interrompent_le_cycle(calc):
    """Relecture du 13/10, point 3 : une veille a 16 W qui fluctue faisait un
    cycle sans fin. Il est interrompu a sa sixieme heure ; et le suivant attend
    que la puissance retombe a 5 W ou moins — sinon la veille referait un cycle
    toutes les six heures."""
    mesures = [(0, 20.0), (60, 20.0)] + [(3600 * h, 16.0 + 2 * (h % 2)) for h in range(1, 7)]
    s, evenements = rejouer(calc, mesures)
    assert [e["quoi"] for e in evenements] == ["debut", "interrompu"]
    assert (evenements[1]["cycle"]["debut"], evenements[1]["cycle"]["fin"]) == (0, 6 * 3600)
    assert not s["en_cours"] and s["veille"] and calc.echeance(s) is None
    s, _ = rejouer(calc, [(22000, 1950.0)], s)
    assert s["haut"] is None, "pas de retombee : rien ne recommence"
    retombee = calc.avancer(s, 22100, 5.0)
    assert not retombee["veille"] and calc.bascule(s, retombee), "la retombee s'ecrit tout de suite"
    s, _ = rejouer(calc, [(22200, 1950.0)], retombee)
    assert s["haut"] == 22200 and calc.echeance(s) == 22260, "apres la retombee, le suivant peut venir"
    relu = calc.lire_suivi({"veille": True, "dernier": 21600, "w": 16.0})
    assert relu["veille"] and calc.reprendre(relu, 30000)[0]["veille"], "la veille survit au redemarrage"


def test_au_redemarrage_un_cycle_reprend_et_ce_qui_est_du_se_conclut(calc):
    s, _ = rejouer(calc, [(100, 1950.0), (160, 1950.0), (1000, 1800.0)])
    repris, e = calc.reprendre(s, 2000)
    assert e is None and repris == dict(s, w=None, troue=True), \
        "moins de deux heures : il reprend, sans tenir la puissance d'avant a travers l'arret"
    _, e = calc.reprendre(s, 9000)
    assert e["cycle"]["fin"] == 1000, "sans nouvelle depuis deux heures : clos"
    s, _ = rejouer(calc, [(1100, 3.0)], s)
    _, e = calc.reprendre(s, 1800)
    assert e["cycle"]["fin"] == 1100, "les dix minutes basses sont passees pendant l'arret"
    pressenti, _ = rejouer(calc, [(100, 1950.0)])
    s, e = calc.reprendre(pressenti, 120)
    assert e is None and s["haut"] is None, "un debut pressenti s'oublie"


def test_l_energie_s_integre_sur_la_puissance_tenue(calc):
    """Un capteur publie au changement, et republie la meme valeur
    (`state_reported`) : la puissance d'avant tient jusqu'a la mesure suivante.
    2000 W pendant une demi-heure, puis 1000 W pendant une demi-heure, font
    1,5 kWh."""
    s, _ = rejouer(calc, [(0, 2000.0), (60, 2000.0), (600, 2000.0), (1200, 2000.0), (1800, 1000.0),
                          (2400, 1000.0), (3000, 1000.0), (3600, 2.0)])
    assert s["wh_bas"] == pytest.approx(1500.0)


def test_une_bascule_s_ecrit_tout_de_suite(calc):
    s0 = calc.suivi_neuf()
    s1 = calc.avancer(s0, 0, 1950.0)
    assert calc.bascule(s0, s1), "un debut pressenti"
    assert not calc.bascule(s1, calc.avancer(s1, 10, 1900.0)), "une mesure de plus"


def test_la_memoire_garde_sept_jours_et_trente_cycles(calc):
    jour = 86400
    cycles = [{"debut": i * 3600.0, "fin": i * 3600.0 + 1800, "kwh": 1.0} for i in range(40)]
    gardes = calc.garder(cycles, 39 * 3600.0)
    assert len(gardes) == 30 and gardes[0]["debut"] == 10 * 3600.0 and gardes[-1]["debut"] == 39 * 3600.0
    vieux = [{"debut": 0.0, "fin": 100.0, "kwh": 1.0}, {"debut": 7 * jour, "fin": 7 * jour + 100, "kwh": 2.0}]
    assert calc.garder(vieux, 7 * jour + 200) == [vieux[1]], "plus vieux que sept jours : oublie"


def test_l_etat_relu_ecarte_l_illisible(calc):
    brut = {
        "switch.lv": {"suivi": {"en_cours": True, "debut": 100, "bas": 900, "dernier": 950, "w": 2, "wh": 800},
                      "cycles": [{"debut": 10, "fin": 50, "kwh": 0.5}, {"debut": 60, "fin": 40},
                                 {"debut": "hier", "fin": 70}, "x"]},
        "switch.abime": {"suivi": {"en_cours": True}, "cycles": None},
        "light.salon": {"suivi": {}},
        "switch.x": "rien",
    }
    memoire = calc.lire_etat(brut, 100)
    assert sorted(memoire) == ["switch.abime", "switch.lv"]
    assert memoire["switch.lv"]["suivi"]["wh_bas"] == 800, "une baisse sans son energie prend l'energie connue"
    assert memoire["switch.lv"]["cycles"] == [{"debut": 10, "fin": 50, "kwh": 0.5}]
    assert memoire["switch.abime"] == {"suivi": calc.suivi_neuf(), "cycles": []}, "en cours sans debut : au repos"
    assert calc.lire_etat(None, 0) == {} and calc.lire_etat([], 0) == {}


def test_un_debut_pressenti_s_oublie_des_la_relecture(calc):
    """Relecture du 13/10, point 4 : relu, `haut` armait une echeance perimee
    avant `reprendre` — un faux cycle date d'avant l'arret. La prise le redira."""
    s = calc.lire_suivi({"haut": 100, "dernier": 100, "w": 1950.0, "wh": 5.0})
    assert s["haut"] is None and s["wh"] == 0.0 and calc.echeance(s) is None
    assert (s["dernier"], s["w"]) == (100, 1950.0), "la derniere mesure reste"


def test_une_puissance_se_lit_en_watts(calc):
    assert calc.watts("1950.4", "W") == 1950.4
    assert calc.watts("1.95", "kW") == 1950.0
    assert calc.watts("12", None) == 12.0, "sans unite : des watts"
    for etat, unite in (("unavailable", "W"), ("unknown", "W"), ("nan", "W"), (None, "W")):
        assert calc.watts(etat, unite) is None, (etat, unite)


@pytest.mark.parametrize("unite,attendu", [
    ("mW", 0.001), ("GW", 1e9), ("TW", 1e12), ("BTU/h", 0.29307107), ("VA", 1.0), ("kVA", 1000.0),
    ("w", 1.0), ("KW", 1000.0), ("va", 1.0), ("KVA", 1000.0), (" kW ", 1000.0), ("Watt", 1.0), ("mw", 1.0),
])
def test_une_puissance_se_lit_dans_les_unites_de_l_ecran(calc, unite, attendu):
    """Les unites de src/unites.js (`facteurWatts`) : celles de Home Assistant,
    les casses ecrites a la main ; une unite inconnue se lit telle quelle, comme
    a l'ecran — « mw » reste ambigu (milli ou mega) et ne se devine pas."""
    assert calc.watts("1", unite) == pytest.approx(attendu)


@pytest.mark.parametrize("unite,attendu", [
    ("mWh", 1e-6), ("Wh", 0.001), ("GWh", 1e6), ("TWh", 1e9), ("J", 1 / 3.6e6), ("kJ", 1 / 3600),
    ("MJ", 1 / 3.6), ("GJ", 1000 / 3.6), ("kcal", 4.184 / 3600), ("Gcal", 4184 / 3.6), ("wh", 0.001),
    ("KWH", 1.0), ("", 1.0), (None, 1.0), ("kWh/j", 1.0),
])
def test_une_energie_se_lit_dans_les_unites_de_l_ecran(calc, unite, attendu):
    """`facteurKwh` de src/unites.js, entree par entree."""
    assert calc.kwh_par_unite(unite) == pytest.approx(attendu)


def test_l_energie_du_compteur_ne_retranche_jamais(calc):
    assert calc.kwh_du_compteur(["10.00", "10.52", "11.08"], "kWh") == 1.08
    assert calc.kwh_du_compteur(["10.0", "10.5", "0.1", "0.4"], "kWh") == 0.8, "une remise a zero"
    assert calc.kwh_du_compteur(["1000", "unavailable", "2080"], "Wh") == 1.08
    assert calc.kwh_du_compteur(["10.0"], "kWh") is None, "une seule lecture"
    assert calc.kwh_du_compteur(["0", "3888000"], "J") == 1.08, "des joules"
    assert calc.kwh_du_compteur(["1000000", "2080000"], "mWh") == 1.08


def test_le_compteur_ne_vaut_que_s_il_dit_a_peu_pres_ce_que_dit_la_puissance(calc):
    """Relecture du 13/10, point 2 : la puissance integree (`wh`) est toujours
    calculee ; le compteur qui s'en ecarte de plus du simple au double cede."""
    assert calc.kwh_du_cycle(1.08, 1950.0) == 1.08, "1,8 fois : le compteur reste"
    assert calc.kwh_du_cycle(120.95, 550.0) == 0.55, "une lecture parasite (120,40 -> 0 -> 120,95)"
    assert calc.kwh_du_cycle(0.0, 1950.0) == 1.95, "un compteur immobile"
    assert calc.kwh_du_cycle(2.0, 1000.0) == 2.0 and calc.kwh_du_cycle(0.5, 1000.0) == 0.5, "le double tout juste"
    assert calc.kwh_du_cycle(2.001, 1000.0) == 1.0 and calc.kwh_du_cycle(0.499, 1000.0) == 1.0
    assert calc.kwh_du_cycle(None, 1950.0) == 1.95, "sans compteur"
    assert calc.kwh_du_cycle(1.08, None) == 1.08 and calc.kwh_du_cycle(None, None) is None


def test_le_compteur_se_compare_avant_d_arrondir(calc):
    """2,0007 kWh face a 1000,4 Wh : moins du double. Arrondie d'abord a 1,000,
    l'integree faisait croire a un ecart, et l'emportait."""
    assert calc.kwh_du_cycle(2.0007, 1000.4) == 2.001
    assert calc.kwh_du_cycle(1.0, 0.0) == 1.0, "une integree nulle ne dit rien : le compteur"


def test_une_integree_trouee_cede_au_compteur(calc):
    """Un trou de mesure (une prise muette, un redemarrage) laisse l'integree
    sous l'energie vraie : le compteur l'emporte alors, meme a plus du double —
    sauf s'il dit moins de la moitie de ce qu'on a vu passer (un compteur fige)."""
    assert calc.kwh_du_cycle(1.10, 333.3, troue=True) == 1.10
    assert calc.kwh_du_cycle(1.10, 333.3) == 0.333, "sans trou, la regle du double tient"
    assert calc.kwh_du_cycle(0.0, 333.3, troue=True) == 0.333, "un compteur immobile ne passe toujours pas"
    assert calc.kwh_du_cycle(None, 333.3, troue=True) == 0.333, "sans compteur, l'integree, meme trouee"


# ── Les trous de mesure ─────────────────────────────────────────────────────

def test_un_ecart_trop_long_ne_s_integre_pas_au_dela_de_dix_minutes(calc):
    """2000 W a 0 s, plus rien jusqu'a 6060 s : la puissance d'avant n'a tenu
    que dix minutes au plus, et l'integree est trouee."""
    s, _ = rejouer(calc, [(0, 2000.0), (60, 2000.0), (6060, 2.0)])
    assert s["wh"] == pytest.approx(2000.0 * (60 + 600) / 3600) and s["troue"]
    assert s["wh_bas"] == pytest.approx(s["wh"])
    s, _ = rejouer(calc, [(0, 2000.0), (60, 2000.0), (660, 2000.0), (1260, 2.0)])
    assert s["wh"] == pytest.approx(2000.0 * 1260 / 3600) and not s["troue"], "dix minutes tout juste"


def test_une_prise_muette_apres_la_baisse_ne_troue_pas_le_cycle(calc):
    """A 5 W ou moins, ce qui manque ne compte pas : l'energie du cycle s'arrete a
    la baisse (`wh_bas`), et une prise qui decroche ensuite n'y retire rien."""
    s, _ = rejouer(calc, [(0, 2000.0), (60, 2000.0), (600, 3.0)])
    s = calc.couper(s, 700)
    assert not s["troue"] and s["bas"] == 600
    _, e = calc.conclure(s, 1200)
    assert e["quoi"] == "fin" and e["cycle"]["troue"] is False


def test_une_mesure_muette_coupe_l_integration(calc):
    """« unavailable » en pleine chauffe : la puissance d'avant tient jusqu'a lui,
    pas au-dela ; la mesure suivante repart de zero, et le silence se compte
    toujours depuis la derniere mesure lisible."""
    s, _ = rejouer(calc, [(0, 2000.0), (60, 2000.0)])
    s = calc.couper(s, 600)
    assert s["wh"] == pytest.approx(2000.0 * 600 / 3600) and s["w"] is None and s["troue"]
    assert s["dernier"] == 60, "le silence ne bouge pas"
    s, _ = rejouer(calc, [(6000, 1900.0), (6060, 1900.0)], s)
    assert s["wh"] == pytest.approx(2000.0 * 600 / 3600 + 1900.0 * 60 / 3600)
    _, e = calc.conclure(calc.avancer(s, 6100, 2.0), 6700)
    assert e["quoi"] == "fin" and e["cycle"]["troue"] is True


def test_au_repos_une_mesure_muette_ne_trouve_rien(calc):
    s = calc.couper(calc.avancer(calc.suivi_neuf(), 0, 2.0), 100)
    assert not s["troue"] and s["w"] is None and s["dernier"] == 0
    s, _ = rejouer(calc, [(200, 1950.0), (260, 1950.0)], s)
    assert s["en_cours"] and not s["troue"], "le cycle suivant part entier"


def test_un_cycle_sans_trou_le_dit(calc):
    s, _ = rejouer(calc, [(0, 2000.0), (60, 2000.0), (600, 2.0)])
    _, e = calc.conclure(s, 1200)
    assert e["cycle"]["troue"] is False


def test_le_trou_survit_au_redemarrage(calc):
    relu = calc.lire_suivi({"en_cours": True, "debut": 100, "dernier": 900, "w": 1950.0, "wh": 400.0,
                            "troue": True})
    assert relu["troue"] is True
    assert calc.lire_suivi({"veille": True, "troue": True})["troue"] is False, "au repos, rien de troue"


def test_l_heure_d_une_fin(calc):
    assert calc.heure_de(1791900840.7, PARIS_ETE) == "16:14"


# ── L'alerte de fin de cycle (P6) ──────────────────────────────────────────

def test_l_alerte_est_coupee_par_defaut_et_se_regle_prise_par_prise(calc):
    cfg = calc.config_defaut()
    assert not calc.doit_dire_la_fin(cfg, LV)
    assert calc.doit_dire_la_fin(calc.poser_patch(cfg, {"prevenir": {LV: True}}), LV)


def test_les_kwh_du_telephone_s_ecrivent_dans_la_langue_du_serveur(calc):
    assert calc.kwh_ecrit(1.083, "fr") == "1,08" and calc.kwh_ecrit(1.083, "pl") == "1,08"
    assert calc.kwh_ecrit(1.083, "en") == "1.08"
    assert calc.kwh_ecrit(0.0, "de") == "0,00"
