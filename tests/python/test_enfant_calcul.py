"""Le mode enfant sans Home Assistant (chantier Mode enfant, E1 a E14 ; spec 5, 7.1, 7.2).

Ce qui merite d'etre verrouille : la configuration refuse ce que l'ecran
n'envoie pas SANS rien ecrire ; les heures du jour (semaine, week-end, minuit
franchi) et la reprise du lendemain ; un volume ramene est toujours PLUS BAS
que le volume lu, jamais plus haut, et jamais deux fois en cinq secondes ni sur
le reflet de la jumelle ; le temps d'ecran compte, repart a minuit, s'arrete
au budget du jour plus le bonus ; la coupure et ses graces, l'insistance qui
previent une fois par heure ; une demande a la fois, trente minutes, le refus
du jour, le jeton a usage unique ; un etat abime relu propre.
"""
from __future__ import annotations

from datetime import datetime, timedelta

import pytest

from conftest import charger
from test_chauffage import FuseauParis

PARIS = FuseauParis()
# Le samedi 17/10/2026 a 17:40, a Paris (la maquette : « Il est 17:40 »).
SAMEDI = datetime(2026, 10, 17, 17, 40, tzinfo=PARIS)
# Le mardi 13/10/2026 a 17:40.
MARDI = datetime(2026, 10, 13, 17, 40, tzinfo=PARIS)
ECHO, HACS, TV = "media_player.chambre_echo_dot", "media_player.echo_dot_chambre", "media_player.apple_tv_chambre"


@pytest.fixture(scope="module")
def calc():
    return charger("enfant_calcul")


def a(dt, h, mi=0):
    return dt.replace(hour=h, minute=mi, second=0, microsecond=0)


def profil(calc, **champs):
    p = calc.profil_defaut("Lino", "chambre")
    p.update(champs)
    return p


def etat(calc, dt, **champs):
    e = calc.etat_defaut(calc.jour_de(dt))
    e.update(champs)
    return e


# ── La configuration (E5, spec 7.1) ─────────────────────────────────────────

def test_le_defaut_est_la_maquette(calc):
    p = calc.profil_defaut("Lino", "chambre")
    assert p == {"nom": "Lino", "zone": "chambre", "actif": True, "ajouts": [], "ecrans": None,
                 "volume_max": 40, "coucher_max": 20, "budget": {"semaine": 90, "weekend": 90},
                 "heures": {"semaine": ["07:30", "20:30"], "weekend": ["08:30", "21:00"]},
                 "dormir": True, "voix": True,
                 "phrases_dormir": ["joue du bruit blanc", "joue de la musique pour dormir"]}
    assert calc.config_defaut() == {"profils": {}, "simulation": {"actif": False}}
    assert calc.lire_config(None) == calc.config_defaut()
    assert calc.lire_config({"profils": "non"}) == calc.config_defaut()


def test_lire_config_ecarte_l_illisible_et_range_le_reste(calc):
    brut = {"profils": {
        "chambre": {"nom": "Lino", "zone": "chambre", "actif": "oui", "ajouts": [TV, "light.x", 3, TV],
                    "ecrans": [TV], "volume_max": 140, "coucher_max": -5, "budget": {"semaine": "90", "weekend": 45},
                    "heures": {"semaine": ["7:30", "20:30"], "weekend": ["08:30", "25:00"]}, "dormir": 0, "voix": None,
                    "phrases_dormir": ["joue du bruit blanc", 7]},
        "bureau": {"nom": "Sans zone"},
        12: {"zone": "salon"},
    }, "simulation": {"actif": 1}}
    cfg = calc.lire_config(brut)
    assert sorted(cfg["profils"]) == ["chambre"], "un profil sans zone, ou dont la cle n'est pas un texte, s'ecarte"
    p = cfg["profils"]["chambre"]
    assert p["actif"] is False and p["dormir"] is False and p["voix"] is False, "un drapeau est vrai ou faux, rien d'autre"
    assert p["ajouts"] == [TV], "des lecteurs, sans doublon"
    assert p["ecrans"] == [TV]
    assert p["volume_max"] == 40 and p["coucher_max"] == 20, "hors bornes : le defaut"
    assert p["budget"] == {"semaine": 90, "weekend": 45}, "un budget illisible : le defaut"
    assert p["heures"] == {"semaine": ["07:30", "20:30"], "weekend": ["08:30", "21:00"]}, "une heure illisible : le defaut"
    assert p["phrases_dormir"] == ["joue du bruit blanc"]
    assert cfg["simulation"] == {"actif": False}


def test_poser_patch_cree_un_profil_du_nom_de_sa_piece_et_le_retire(calc):
    cfg = calc.config_defaut()
    neuf = calc.poser_patch(cfg, {"profils": {"chambre": {"nom": "Lino"}}})
    assert neuf["profils"]["chambre"] == calc.profil_defaut("Lino", "chambre"), "la zone est la cle du profil"
    assert cfg["profils"] == {}, "la configuration d'origine n'a pas bouge"
    retire = calc.poser_patch(neuf, {"profils": {"chambre": None}})
    assert retire["profils"] == {}
    # Un champ a la fois, les autres restent.
    second = calc.poser_patch(neuf, {"profils": {"chambre": {"volume_max": 60, "budget": {"weekend": 120}}}})
    assert second["profils"]["chambre"]["volume_max"] == 60
    assert second["profils"]["chambre"]["budget"] == {"semaine": 90, "weekend": 120}
    assert second["profils"]["chambre"]["nom"] == "Lino"
    sim = calc.poser_patch(neuf, {"simulation": {"actif": True}})
    assert sim["simulation"] == {"actif": True} and sim["profils"] == neuf["profils"]


@pytest.mark.parametrize("patch", [
    "tout", {"profils": []}, {"profils": {"chambre": "oui"}}, {"profils": {"chambre": {"volume_max": 5}}},
    {"profils": {"chambre": {"volume_max": 101}}}, {"profils": {"chambre": {"volume_max": 40.5}}},
    {"profils": {"chambre": {"coucher_max": -1}}}, {"profils": {"chambre": {"budget": {"semaine": -30}}}},
    {"profils": {"chambre": {"budget": {"semaine": 1500}}}}, {"profils": {"chambre": {"budget": 90}}},
    {"profils": {"chambre": {"heures": {"semaine": ["07:30"]}}}}, {"profils": {"chambre": {"heures": {"semaine": ["7h30", "20:30"]}}}},
    {"profils": {"chambre": {"heures": {"nuit": ["07:30", "20:30"]}}}}, {"profils": {"chambre": {"ajouts": TV}}},
    {"profils": {"chambre": {"ajouts": ["light.salon"]}}}, {"profils": {"chambre": {"ecrans": [3]}}},
    {"profils": {"chambre": {"actif": "oui"}}}, {"profils": {"chambre": {"nom": ""}}}, {"profils": {"chambre": {"nom": "x" * 65}}},
    {"profils": {"chambre": {"phrases_dormir": "joue"}}}, {"profils": {"chambre": {"phrases_dormir": ["a", "b", "c"]}}},
    {"profils": {"chambre": {"zone": "salon"}}}, {"profils": {"": {"nom": "Lino"}}}, {"simulation": True},
], ids=lambda p: str(p)[:60])
def test_poser_patch_refuse_une_valeur_que_l_ecran_n_envoie_pas_sans_rien_ecrire(calc, patch):
    cfg = calc.poser_patch(calc.config_defaut(), {"profils": {"chambre": {"nom": "Lino"}}})
    avant = calc.lire_config(cfg)
    with pytest.raises(ValueError):
        calc.poser_patch(cfg, patch)
    assert cfg == avant, "un patch refuse ne change rien"


def test_les_listes_arrivent_entieres_et_une_cle_inconnue_s_ignore(calc):
    cfg = calc.poser_patch(calc.config_defaut(), {"profils": {"chambre": {"nom": "Lino", "ajouts": [TV, HACS]}}})
    assert cfg["profils"]["chambre"]["ajouts"] == [TV, HACS]
    # Le piege des volets : la liste remplace, elle ne s'ajoute pas.
    assert calc.poser_patch(cfg, {"profils": {"chambre": {"ajouts": [HACS]}}})["profils"]["chambre"]["ajouts"] == [HACS]
    assert calc.poser_patch(cfg, {"profils": {"chambre": {"ajouts": []}}})["profils"]["chambre"]["ajouts"] == []
    # `ecrans` : None rend au defaut (la classe tv), une liste impose.
    assert calc.poser_patch(cfg, {"profils": {"chambre": {"ecrans": [TV]}}})["profils"]["chambre"]["ecrans"] == [TV]
    assert calc.poser_patch(cfg, {"profils": {"chambre": {"ecrans": None}}})["profils"]["chambre"]["ecrans"] is None
    assert calc.poser_patch(cfg, {"profils": {"chambre": {"inconnu": 1}}, "autre": 2}) == cfg


# ── Les heures (E8, E9, spec 5.4) ──────────────────────────────────────────

def test_dans_les_heures_semaine_week_end_et_minuit_franchi(calc):
    p = profil(calc)
    assert calc.dans_les_heures(p, a(MARDI, 7, 30)) is True, "07:30 compris"
    assert calc.dans_les_heures(p, a(MARDI, 20, 30)) is False, "20:30 exclu : le coucher"
    assert calc.dans_les_heures(p, a(MARDI, 20, 29)) is True
    assert calc.dans_les_heures(p, a(MARDI, 7, 29)) is False
    assert calc.dans_les_heures(p, a(SAMEDI, 8, 0)) is False, "le week-end a ses heures : 08:30"
    assert calc.dans_les_heures(p, a(SAMEDI, 20, 45)) is True, "jusqu'a 21:00 le week-end"
    assert calc.est_weekend(a(SAMEDI, 12)) is True and calc.est_weekend(a(MARDI, 12)) is False
    assert calc.est_weekend(a(SAMEDI, 12) + timedelta(days=1)) is True, "le dimanche aussi"
    # Minuit franchi : « 21:00 – 02:00 » vaut de 21 h a 2 h du matin.
    nuit = profil(calc, heures={"semaine": ["21:00", "02:00"], "weekend": ["21:00", "02:00"]})
    assert calc.dans_les_heures(nuit, a(MARDI, 23, 0)) is True
    assert calc.dans_les_heures(nuit, a(MARDI, 1, 0)) is True
    assert calc.dans_les_heures(nuit, a(MARDI, 12, 0)) is False
    # Des heures egales : toujours dedans — aucune coupure, c'est ce que dit un reglage absurde.
    assert calc.dans_les_heures(profil(calc, heures={"semaine": ["07:30", "07:30"], "weekend": ["08:30", "21:00"]}), a(MARDI, 3)) is True


def test_la_reprise_est_le_debut_des_heures_du_jour_suivant(calc):
    p = profil(calc)
    # Le vendredi soir apres 20:30 : demain samedi, 08:30.
    vendredi = a(MARDI, 21, 0) + timedelta(days=3)
    assert calc.heure_hhmm(calc.reprise(p, vendredi)) == "08:30"
    assert calc.reprise(p, vendredi).date() == (vendredi + timedelta(days=1)).date()
    # Le dimanche soir : lundi, 07:30.
    dimanche = a(SAMEDI, 22, 0) + timedelta(days=1)
    assert calc.heure_hhmm(calc.reprise(p, dimanche)) == "07:30"
    # Avant les heures du matin : aujourd'hui.
    assert calc.reprise(p, a(MARDI, 6, 0)) == a(MARDI, 7, 30)
    # Dans les heures : la reprise est celle de demain quand meme (le temps ecoule « revient demain »).
    assert calc.reprise(p, a(MARDI, 18, 20)) == a(MARDI, 7, 30) + timedelta(days=1)
    assert calc.heure_hhmm(a(MARDI, 7, 5)) == "07:05"


def test_le_plafond_baisse_au_coucher_et_le_budget_suit_le_jour(calc):
    p = profil(calc, budget={"semaine": 60, "weekend": 120})
    assert calc.plafond(p, a(MARDI, 18, 0)) == 40
    assert calc.plafond(p, a(MARDI, 21, 0)) == 20, "hors des heures : min(plafond, coucher_max)"
    assert calc.plafond(profil(calc, volume_max=15), a(MARDI, 21, 0)) == 15, "jamais plus haut que le plafond"
    assert calc.budget_min(p, a(MARDI, 12)) == 60 and calc.budget_min(p, a(SAMEDI, 12)) == 120
    assert calc.budget_min(profil(calc, budget={"semaine": 0, "weekend": 0}), a(MARDI, 12)) == 0


# ── Le plafond qui ramene (E7, spec 5.1, 8) ─────────────────────────────────

def test_un_volume_au_dessus_du_plafond_redescend_au_plafond_jamais_plus_haut(calc):
    p, e, t = profil(calc), etat(calc, MARDI), MARDI.timestamp()
    assert calc.decision_volume(p, e, MARDI, t, HACS, "echo", 70) == {"entite": HACS, "volume": 40, "lu": 70}
    assert calc.decision_volume(p, e, MARDI, t, HACS, "echo", 41) == {"entite": HACS, "volume": 40, "lu": 41}
    for lu in (40, 30, 0):
        assert calc.decision_volume(p, e, MARDI, t, HACS, "echo", lu) is None, "a ou sous le plafond : rien"
    assert calc.decision_volume(p, e, MARDI, t, HACS, "echo", None) is None, "muet, ou sans volume : rien"
    # La garantie : la cible est toujours strictement plus basse que la valeur lue.
    for lu in range(0, 101):
        d = calc.decision_volume(p, e, MARDI, t, HACS, "echo", lu)
        assert d is None or d["volume"] < lu
    # Au coucher : 20.
    assert calc.decision_volume(p, e, a(MARDI, 21), t, HACS, "echo", 30)["volume"] == 20
    assert calc.decision_volume(p, e, a(MARDI, 21), t, HACS, "echo", 20) is None


def test_un_profil_eteint_ou_leve_ne_ramene_rien(calc):
    e, t = etat(calc, MARDI), MARDI.timestamp()
    assert calc.decision_volume(profil(calc, actif=False), e, MARDI, t, HACS, "echo", 90) is None
    leve = calc.lever(e, 30, t)
    assert leve["leve_jusqua"] == t + 1800
    assert calc.decision_volume(profil(calc), leve, MARDI, t + 10, HACS, "echo", 90) is None, "les limites levees : rien"
    assert calc.decision_volume(profil(calc), leve, MARDI, t + 1801, HACS, "echo", 90) is not None, "trente minutes, pas une de plus"
    assert calc.lever(leve, 0, t + 10)["leve_jusqua"] is None, "retablir"
    assert calc.leve(leve, t + 10) is True and calc.leve(e, t) is False
    with pytest.raises(ValueError):
        calc.lever(e, 7, t)
    with pytest.raises(ValueError):
        calc.lever(e, "30", t)


def test_un_ordre_par_appareil_toutes_les_cinq_secondes_et_le_reflet_de_la_jumelle_ignore_une_minute(calc):
    p, t = profil(calc), MARDI.timestamp()
    e = calc.noter_ramene(etat(calc, MARDI), t, HACS, "echo", 70, 40)
    assert e["ramenes"] == [[t, HACS, "echo", 70, 40]]
    # Quatre secondes plus tard, la meme enceinte publie encore 70 : rien.
    assert calc.decision_volume(p, e, MARDI, t + 4, HACS, "echo", 70) is None, "pas deux ordres en cinq secondes"
    # Dix secondes plus tard, l'officielle (meme appareil) sonde encore l'ancien volume : le reflet, ignore.
    assert calc.decision_volume(p, e, MARDI, t + 10, ECHO, "echo", 70) is None, "le reflet de la jumelle"
    assert calc.decision_volume(p, e, MARDI, t + 59, ECHO, "echo", 65) is None, "un reflet plus bas que l'ancien volume aussi"
    # Mais une VRAIE montee au-dela de l'ancien volume est un geste : on ramene.
    assert calc.decision_volume(p, e, MARDI, t + 10, ECHO, "echo", 80) == {"entite": ECHO, "volume": 40, "lu": 80}
    # Une minute plus tard, le meme 70 n'est plus un reflet.
    assert calc.decision_volume(p, e, MARDI, t + 61, ECHO, "echo", 70) is not None
    # Un AUTRE appareil n'est pas tenu par la pause.
    assert calc.decision_volume(p, e, MARDI, t + 1, TV, "tv", 70) is not None
    # Vingt ramenes au plus, les plus recents.
    for i in range(30):
        e = calc.noter_ramene(e, t + 100 + i, HACS, "echo", 70, 40)
    assert len(e["ramenes"]) == 20 and e["ramenes"][-1][0] == t + 129


def test_l_insistance_previent_une_fois_puis_se_tait_une_heure(calc):
    t = MARDI.timestamp()
    e = etat(calc, MARDI)
    for i in range(2):
        e = calc.noter_ramene(e, t + i * 60, HACS, "echo", 70, 40)
    assert calc.doit_prevenir(e, "volume", [r[0] for r in e["ramenes"]], t + 120) is False, "deux en dix minutes : pas encore"
    e = calc.noter_ramene(e, t + 120, HACS, "echo", 70, 40)
    assert calc.doit_prevenir(e, "volume", [r[0] for r in e["ramenes"]], t + 120) is True, "trois en dix minutes : le telephone"
    e = calc.noter_prevention(e, "volume", t + 120)
    assert e["preventions"]["volume"] == t + 120
    e = calc.noter_ramene(e, t + 180, HACS, "echo", 70, 40)
    assert calc.doit_prevenir(e, "volume", [r[0] for r in e["ramenes"]], t + 180) is False, "le journal seul pendant une heure"
    assert calc.doit_prevenir(e, "volume", [r[0] for r in e["ramenes"]], t + 120 + 3600) is False, "trois dans les DIX dernieres minutes, pas trois jamais"
    for i in range(3):
        e = calc.noter_ramene(e, t + 3800 + i, HACS, "echo", 70, 40)
    assert calc.doit_prevenir(e, "volume", [r[0] for r in e["ramenes"]], t + 3803) is True, "une heure passee : on previent de nouveau"
    assert calc.insistance([t, t + 500, t + 700], t + 700) == 2, "ceux des dix dernieres minutes"


# ── Le temps d'ecran (E8), la coupure et ses graces (E9) ────────────────────

def test_le_temps_d_ecran_compte_repart_a_minuit_et_s_arrete_au_budget_plus_le_bonus(calc):
    p = profil(calc)
    jour = calc.jour_de(MARDI)
    e = calc.avancer_ecran(etat(calc, MARDI), TV, 3300, jour)
    assert e["ecran_s"] == {TV: 3300}
    assert calc.reste_s(p, e, TV, MARDI) == 90 * 60 - 3300, "35 minutes restantes"
    e = calc.avancer_ecran(e, TV, 2100, jour)
    assert calc.reste_s(p, e, TV, MARDI) == 0
    assert calc.bloque(p, e, TV, True, MARDI, MARDI.timestamp()) == "temps"
    assert calc.bloque(p, e, ECHO, False, MARDI, MARDI.timestamp()) is None, "une enceinte n'a pas de temps d'ecran"
    # Le bonus de la demande accordee rend du temps.
    bonus = dict(e, bonus_min=15)
    assert calc.reste_s(p, bonus, TV, MARDI) == 900 and calc.bloque(p, bonus, TV, True, MARDI, MARDI.timestamp()) is None
    # Minuit : le jour change, tout repart.
    lendemain = calc.jour_de(MARDI + timedelta(days=1))
    e2 = calc.avancer_ecran(dict(bonus, refus_jour=jour), TV, 60, lendemain)
    assert e2["ecran_s"] == {TV: 60} and e2["bonus_min"] == 0 and e2["refus_jour"] is None and e2["jour"] == lendemain
    # Sans budget (0) : rien a compter de limite, jamais bloque par le temps.
    libre = profil(calc, budget={"semaine": 0, "weekend": 0})
    assert calc.reste_s(libre, e, TV, MARDI) is None and calc.bloque(libre, e, TV, True, MARDI, MARDI.timestamp()) is None
    # Hors des heures : le coucher, meme sans budget.
    assert calc.bloque(libre, e, TV, True, a(MARDI, 21), a(MARDI, 21).timestamp()) == "coucher"
    assert calc.bloque(libre, e, ECHO, False, a(MARDI, 21), a(MARDI, 21).timestamp()) == "coucher", "l'Echo aussi : ses sons pour dormir"
    # Les limites levees ou le profil eteint : rien n'est bloque.
    assert calc.bloque(p, calc.lever(e, 30, MARDI.timestamp()), TV, True, MARDI, MARDI.timestamp() + 1) is None
    assert calc.bloque(profil(calc, actif=False), e, TV, True, a(MARDI, 21), a(MARDI, 21).timestamp()) is None


def test_l_echeance_dit_dans_combien_de_temps_l_ecran_se_coupe(calc):
    p = profil(calc)
    e = calc.avancer_ecran(etat(calc, MARDI), TV, 3300, calc.jour_de(MARDI))
    assert calc.echeance_s(p, e, TV, True, MARDI, MARDI.timestamp()) == 35 * 60, "le budget avant le coucher"
    tard = a(MARDI, 20, 27)
    assert calc.echeance_s(p, e, TV, True, tard, tard.timestamp()) == 3 * 60, "le coucher avant le budget"
    assert calc.echeance_s(p, e, ECHO, False, tard, tard.timestamp()) == 3 * 60, "une enceinte aussi : son coucher"
    plein = calc.avancer_ecran(e, TV, 2100, calc.jour_de(MARDI))
    assert calc.echeance_s(p, plein, TV, True, MARDI, MARDI.timestamp()) is None, "deja bloque : rien a annoncer"
    assert calc.echeance_s(p, e, TV, True, a(MARDI, 21), a(MARDI, 21).timestamp()) is None
    assert calc.echeance_s(profil(calc, actif=False), e, TV, True, tard, tard.timestamp()) is None


def test_la_coupure_une_fois_par_minute_et_le_rallumage_compte(calc):
    p, t = profil(calc), a(MARDI, 21).timestamp()
    e = etat(calc, MARDI)
    assert calc.coupure_due(p, e, TV, True, True, a(MARDI, 21), t) is True, "hors des heures, allumee : a eteindre"
    assert calc.coupure_due(p, e, TV, True, False, a(MARDI, 21), t) is False, "eteinte : rien"
    assert calc.coupure_due(p, e, TV, True, True, MARDI, MARDI.timestamp()) is False, "dans les heures, du temps : rien"
    assert calc.peut_couper(e, TV, t) is True
    e = calc.noter_coupure(e, TV, t, rallumage=False)
    assert e["coupures"] == {TV: t} and e["rallumages"] == []
    assert calc.peut_couper(e, TV, t + 30) is False, "une coupure par minute"
    assert calc.peut_couper(e, TV, t + 60) is True
    e = calc.noter_coupure(e, TV, t + 60, rallumage=True)
    e = calc.noter_coupure(e, TV, t + 120, rallumage=True)
    assert e["rallumages"] == [t + 60, t + 120]
    assert calc.doit_prevenir(e, "rallumage", e["rallumages"], t + 120) is False
    e = calc.noter_coupure(e, TV, t + 180, rallumage=True)
    assert calc.doit_prevenir(e, "rallumage", e["rallumages"], t + 180) is True, "trois rallumages en dix minutes"
    for i in range(30):
        e = calc.noter_coupure(e, TV, t + 300 + i * 60, rallumage=True)
    assert len(e["rallumages"]) == 20


# ── La demande et sa reponse (E13), les sons pour dormir (E10) ──────────────

def test_une_demande_a_la_fois_trente_minutes_le_refus_du_jour_et_le_jeton(calc):
    t, jour = MARDI.timestamp(), calc.jour_de(MARDI)
    e = calc.demander(etat(calc, MARDI), TV, t, "jeton-1")
    assert e["demande"] == {"appareil": TV, "quand": t, "jeton": "jeton-1", "reponse": None}
    assert calc.demande_en_cours(e, t + 100) == e["demande"]
    with pytest.raises(ValueError):
        calc.demander(e, TV, t + 10, "jeton-2")
    # Trente minutes sans reponse : expiree, et une nouvelle est possible.
    assert calc.demande_en_cours(e, t + 1801) is None
    assert calc.purger_demande(e, t + 1801)["demande"] is None
    assert calc.demander(e, TV, t + 1801, "jeton-3")["demande"]["jeton"] == "jeton-3"
    # Accordee : quinze minutes de plus, la demande se souvient de sa reponse.
    oui = calc.repondre(e, True, t + 60, jour)
    assert oui["bonus_min"] == 15 and oui["demande"]["reponse"] == "accordee" and oui["refus_jour"] is None
    deux = calc.repondre(calc.demander(oui, TV, t + 120, "jeton-4"), True, t + 130, jour)
    assert deux["bonus_min"] == 30, "deux demandes accordees : trente minutes"
    # Refusee : plus de demande jusqu'au lendemain.
    non = calc.repondre(e, False, t + 60, jour)
    assert non["bonus_min"] == 0 and non["demande"]["reponse"] == "refusee" and non["refus_jour"] == jour
    with pytest.raises(ValueError):
        calc.demander(non, TV, t + 120, "jeton-5")
    assert calc.demander(calc.nouveau_jour(non, calc.jour_de(MARDI + timedelta(days=1))), TV, t + 86400, "jeton-6")["demande"]["jeton"] == "jeton-6"
    # Sans demande, rien a repondre ; une demande deja repondue non plus.
    with pytest.raises(ValueError):
        calc.repondre(etat(calc, MARDI), True, t, jour)
    with pytest.raises(ValueError):
        calc.repondre(oui, False, t + 61, jour)
    # Le jeton du telephone : a usage unique, dans l'identifiant de l'action.
    assert calc.action_telephone("jeton-1", True) == "LOGGIA_ENFANT_jeton-1_OUI"
    assert calc.lire_action("LOGGIA_ENFANT_jeton-1_NON") == ("jeton-1", False)
    assert calc.lire_action("LOGGIA_ENFANT_jeton-1_OUI") == ("jeton-1", True)
    for faux in ("LOGGIA_ENFANT_jeton-1_PEUTETRE", "AUTRE_jeton-1_OUI", "", None, 3):
        assert calc.lire_action(faux) is None
    assert calc.repondre_au_jeton(e, "jeton-1", True, t + 60, jour)["bonus_min"] == 15
    assert calc.repondre_au_jeton(e, "jeton-9", True, t + 60, jour) is None, "un jeton inconnu ne fait rien"
    assert calc.repondre_au_jeton(oui, "jeton-1", True, t + 61, jour) is None, "a usage unique"


def test_le_titre_garde_au_coucher(calc):
    t = a(MARDI, 20, 45).timestamp()
    e = calc.commencer_dormir(etat(calc, MARDI), t)
    assert e["dormir"] == {"depuis": t, "titres": []}
    assert calc.titre_a_garder(e, "Bruit blanc", t + 30) is True, "le premier titre dans les 90 s"
    e = calc.garder_titre(e, "Bruit blanc", t + 30)
    assert e["dormir"]["titres"] == ["Bruit blanc"]
    assert calc.titre_garde(e, "Bruit blanc") is True and calc.titre_garde(e, "Autre chose") is False
    assert calc.titre_a_garder(e, "Autre chose", t + 40) is False, "un second titre n'est pas garde"
    assert calc.titre_a_garder(calc.commencer_dormir(e, t + 100), "Tard", t + 200) is False, "passe 90 s : rien"
    assert calc.titre_garde(etat(calc, MARDI), "Bruit blanc") is False


# ── La relecture du disque (spec 7.2) ───────────────────────────────────────

def test_normaliser_repart_propre_d_un_etat_abime(calc):
    t, jour = MARDI.timestamp(), calc.jour_de(MARDI)
    brut = {
        "chambre": {"jour": jour, "ecran_s": {TV: 3300.0, "light.x": 5, HACS: "beaucoup"}, "bonus_min": "15",
                    "leve_jusqua": t - 1, "demande": {"appareil": TV, "quand": t - 2000, "jeton": "j", "reponse": None},
                    "refus_jour": jour, "ramenes": [[t, HACS, "echo", 70, 40], "non", [t, HACS]],
                    "rallumages": [t, "x"], "preventions": {"volume": t, "autre": 1}, "dormir": {"depuis": t, "titres": ["Bruit blanc", 3]},
                    "coupures": {TV: t, 3: t}},
        "hier": {"jour": "2026-10-12", "ecran_s": {TV: 100}, "bonus_min": 15, "refus_jour": "2026-10-12"},
        "casse": "non", 5: {},
    }
    e = calc.normaliser(brut, t, jour)
    assert sorted(e) == ["chambre", "hier"]
    c = e["chambre"]
    assert c["ecran_s"] == {TV: 3300} and c["bonus_min"] == 0, "un bonus illisible repart a zero"
    assert c["leve_jusqua"] is None, "une levee passee s'efface"
    assert c["demande"] is None, "une demande expiree se purge"
    assert c["refus_jour"] == jour
    assert c["ramenes"] == [[t, HACS, "echo", 70, 40]] and c["rallumages"] == [t]
    assert c["preventions"] == {"volume": t} and c["dormir"] == {"depuis": t, "titres": ["Bruit blanc"]}
    assert c["coupures"] == {TV: t}
    # Un jour d'avant : les compteurs du jour repartent, le refus d'hier ne tient plus.
    assert e["hier"]["jour"] == jour and e["hier"]["ecran_s"] == {} and e["hier"]["bonus_min"] == 0 and e["hier"]["refus_jour"] is None
    assert calc.normaliser(None, t, jour) == {} and calc.normaliser([1], t, jour) == {}
    # Un etat relu est un etat complet : chaque champ est la.
    assert set(c) == set(calc.etat_defaut(jour))


def test_la_vue_d_un_lecteur_dit_ce_que_l_ecran_lit(calc):
    p = profil(calc)
    e = calc.avancer_ecran(etat(calc, MARDI), TV, 3300, calc.jour_de(MARDI))
    v = calc.vue_lecteur("chambre", p, e, TV, True, MARDI, MARDI.timestamp())
    assert v == {"profil": "chambre", "nom": "Lino", "actif": True, "leve_jusqua": None, "plafond": 40, "bloque": None, "reprise": "07:30",
                 "ecran": {"budget_min": 90, "utilise_s": 3300, "bonus_min": 0, "reste_s": 2100}, "dormir": None, "demande": None}
    v2 = calc.vue_lecteur("chambre", p, e, ECHO, False, a(MARDI, 21), a(MARDI, 21).timestamp())
    assert v2["plafond"] == 20 and v2["bloque"] == "coucher" and v2["reprise"] == "07:30" and v2["ecran"] is None
    d = calc.demander(e, TV, MARDI.timestamp(), "secret")
    v3 = calc.vue_lecteur("chambre", p, d, TV, True, MARDI, MARDI.timestamp() + 1)
    assert v3["demande"] == {"appareil": TV, "quand": MARDI.timestamp(), "reponse": None}, "jamais le jeton"
    # Le profil eteint : rien n'est bloque, le plafond ne tient plus.
    v4 = calc.vue_lecteur("chambre", profil(calc, actif=False), e, TV, True, a(MARDI, 21), a(MARDI, 21).timestamp())
    assert v4["actif"] is False and v4["plafond"] is None and v4["bloque"] is None
    leve = calc.lever(e, 30, MARDI.timestamp())
    v5 = calc.vue_lecteur("chambre", p, leve, TV, True, a(MARDI, 21), MARDI.timestamp() + 1)
    assert v5["leve_jusqua"] == MARDI.timestamp() + 1800 and v5["plafond"] is None and v5["bloque"] is None


# TEST AJOUTE (audit du 28/10, H1 ; ADR 0279) : la phrase pour dormir part a l'Echo en `custom`, que l'integration Alexa joue
# comme une phrase PRONONCEE. Elle se valide au serveur : longueur, caracteres imprimables, une lettre au moins, pas de
# balisage. Les blancs du bord s'en vont ; une phrase illisible relue du magasin s'ecarte.
@pytest.mark.parametrize("phrase", [
    "", " ", "a", "x" * 121, "joue\nde la pluie", "joue\tdu bruit", "joue\u200bdu bruit", "<speak>joue</speak>",
    "joue {x}", "joue \\ x", "123 456", "!!!", 7, None,
], ids=repr)
def test_une_phrase_pour_dormir_illisible_se_refuse(calc, phrase):
    cfg = calc.poser_patch(calc.config_defaut(), {"profils": {"chambre": {"nom": "Lino"}}})
    with pytest.raises(ValueError, match="phrases_dormir"):
        calc.poser_patch(cfg, {"profils": {"chambre": {"phrases_dormir": [phrase]}}})


def test_une_phrase_pour_dormir_se_range_sans_ses_blancs(calc):
    cfg = calc.poser_patch(calc.config_defaut(), {"profils": {"chambre": {"nom": "Lino"}}})
    neuf = calc.poser_patch(cfg, {"profils": {"chambre": {"phrases_dormir": ["  joue des sons de pluie ", "mets l'océan, s'il te plaît"]}}})
    assert neuf["profils"]["chambre"]["phrases_dormir"] == ["joue des sons de pluie", "mets l'océan, s'il te plaît"]
    relu = calc.lire_config({"profils": {"chambre": {"zone": "chambre", "phrases_dormir": ["joue\nla pluie", " joue du vent "]}}})
    assert relu["profils"]["chambre"]["phrases_dormir"] == ["joue du vent"]
