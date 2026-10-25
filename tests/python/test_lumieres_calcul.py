"""Le carnet des lumieres en pur (chantier Lumieres, L1 et spec 6.1) : le niveau, les notes, la fenetre, la relecture.

Ce qui merite d'etre verrouille : le niveau se lit comme Home Assistant le
calcule ; un allumage, une extinction, un reglage, le reseau font chacun UNE
note, et rien d'autre n'en fait ; des reglages rapproches n'en font qu'une ;
une lampe eteinte garde son dernier niveau.
"""
from __future__ import annotations

import json
from datetime import datetime

import pytest

from conftest import charger
from test_chauffage import FuseauParis

PARIS = FuseauParis()
# Le mardi 13/10/2026 a 20:10, a Paris.
T = datetime(2026, 10, 13, 20, 10, tzinfo=PARIS).timestamp()


@pytest.fixture(scope="module")
def calc():
    return charger("lumieres_calcul")


def note(when, state, bri=None, reglage=False, user=None, type_=None, nom=None):
    """Une note telle que le carnet l'ecrit : le format du logbook, plus `bri` et `reglage`."""
    return {"when": when, "state": state, "bri": bri, "reglage": reglage,
            "context_user_id": user, "context_event_type": type_, "context_name": nom}


def allumee(calc, b=115, t=T - 3600):
    """Une fiche qui a deja vu la lampe allumee - le tout premier etat vu ne se note pas."""
    return calc.noter(calc.fiche_neuve(), "on", {"brightness": b}, t, calc.contexte(None))


# ── Le niveau ───────────────────────────────────────────────────────────────

def test_le_pourcentage_se_calcule_comme_home_assistant(calc):
    """round(b / 255 * 100), et au moins 1 % : allumee, une lampe eclaire."""
    assert [calc.pourcentage(b) for b in (255, 204, 153, 128, 115, 38, 3, 1, 0)] == [
        100, 80, 60, 50, 45, 15, 1, 1, 1]
    assert calc.pourcentage(300) == 100
    for illisible in (None, "128", True, float("nan"), 10 ** 400):
        assert calc.pourcentage(illisible) is None


def test_le_niveau_d_un_blanc_d_une_couleur_d_un_variateur(calc):
    blanc = {"brightness": 115, "color_mode": "color_temp", "color_temp_kelvin": 2700, "hs_color": (30.5, 49.8)}
    assert calc.niveau(blanc) == {"bri": 45, "mode": "color_temp", "kelvin": 2700, "hs": None}
    # Une integration qui laisse sa temperature en couleur : elle ne vaut qu'en blanc.
    couleur = {"brightness": 38, "color_mode": "xy", "color_temp_kelvin": 2000, "hs_color": (275.04, 100.0)}
    assert calc.niveau(couleur) == {"bri": 15, "mode": "xy", "kelvin": None, "hs": [275.0, 100.0]}
    assert calc.niveau({"brightness": 255, "color_mode": "brightness"}) == {
        "bri": 100, "mode": "brightness", "kelvin": None, "hs": None}
    assert calc.niveau({"color_mode": "onoff"}) == {"bri": None, "mode": "onoff", "kelvin": None, "hs": None}


def test_un_niveau_illisible_ne_leve_pas(calc):
    rien = {"bri": None, "mode": None, "kelvin": None, "hs": None}
    for attributs in (None, [], "on", {"brightness": "x", "color_mode": 5, "hs_color": [1]}):
        assert calc.niveau(attributs) == rien
    assert calc.niveau({"color_mode": "hs", "hs_color": ["a", 3]})["hs"] is None
    assert calc.niveau({"color_mode": "color_temp", "color_temp_kelvin": "2700"})["kelvin"] is None


def test_le_contexte_s_ecrit_comme_dans_le_logbook(calc):
    assert calc.contexte("u-papa") == {"context_user_id": "u-papa", "context_event_type": None,
                                       "context_name": None}
    assert calc.contexte(None, ("automation_triggered", "Coucher de Lino")) == {
        "context_user_id": None, "context_event_type": "automation_triggered", "context_name": "Coucher de Lino"}
    assert calc.contexte("", ("script_started", None)) == {
        "context_user_id": None, "context_event_type": "script_started", "context_name": None}
    assert calc.contexte(5, "pas un lien") == calc.contexte(None)


# ── Les notes (spec 6.1) ────────────────────────────────────────────────────

def test_le_tout_premier_etat_vu_ne_fait_pas_de_note(calc):
    """Ce n'est pas un geste : le logbook de Home Assistant ne le montre pas non
    plus. Le niveau, lui, est deja connu."""
    f = calc.noter(calc.fiche_neuve(), "on", {"brightness": 204, "color_mode": "brightness"}, T,
                   calc.contexte(None))
    assert f["evenements"] == []
    assert f["vu"] == {"state": "on", "bri": 80}
    assert f["dernier"] == {"bri": 80, "mode": "brightness", "kelvin": None, "hs": None}


def test_un_allumage_se_note_avec_son_niveau(calc):
    f = calc.noter(calc.fiche_neuve(), "off", {}, T - 60, calc.contexte(None))
    f = calc.noter(f, "on", {"brightness": 115, "color_mode": "color_temp", "color_temp_kelvin": 2700}, T,
                   calc.contexte("u-papa"))
    assert f["evenements"] == [note(T, "on", 45, user="u-papa")]


def test_une_extinction_se_note_et_le_dernier_niveau_reste(calc):
    """« Se rallumera a 45 % » : Home Assistant efface `brightness` a
    l'extinction, le carnet non."""
    f = calc.noter(allumee(calc), "off", {"friendly_name": "Ampoule chambre"}, T, calc.contexte(None))
    assert f["evenements"] == [note(T, "off")]
    assert f["dernier"]["bri"] == 45 and f["vu"] == {"state": "off", "bri": None}


def test_une_lampe_sans_variateur_s_allume_sans_niveau(calc):
    f = calc.noter(calc.fiche_neuve(), "off", {}, T - 60, calc.contexte(None))
    f = calc.noter(f, "on", {"color_mode": "onoff"}, T, calc.contexte(None))
    assert f["evenements"] == [note(T, "on")]
    assert f["dernier"] == {"bri": None, "mode": "onoff", "kelvin": None, "hs": None}


def test_un_interrupteur_allume_n_a_pas_de_dernier_niveau(calc):
    """Un interrupteur declare lumiere : `on` sans rien - ni niveau, ni mode.
    Son dernier niveau est None, pas une table de None (audit du 19/10) ;
    l'ecran (`dernierDe`) lit les deux de la meme facon."""
    f = calc.noter(calc.fiche_neuve(), "off", {}, T - 60, calc.contexte(None))
    f = calc.noter(f, "on", {"friendly_name": "Lumiere exterieur"}, T, calc.contexte(None))
    assert f["evenements"] == [note(T, "on")] and f["dernier"] is None


def test_un_on_sans_niveau_garde_le_dernier_niveau_connu(calc):
    """Audit du 19/10 : une lampe dite `on` sans `brightness` - une integration
    qui publie l'etat avant ses attributs, un retour de panne - ecrasait le
    dernier niveau par {bri: None}, et la carte perdait son « se rallumera a
    60 % ». Le dernier niveau connu reste, tant qu'un vrai niveau ne le
    remplace pas."""
    f = calc.noter(allumee(calc, 153), "off", {}, T - 60, calc.contexte(None))
    assert f["dernier"]["bri"] == 60
    f = calc.noter(f, "on", {}, T, calc.contexte(None))
    assert f["evenements"][-1] == note(T, "on") and f["dernier"]["bri"] == 60
    f = calc.noter(f, "on", {"brightness": 204}, T + 5, calc.contexte(None))
    assert f["dernier"]["bri"] == 80


def test_un_dernier_niveau_relu_sans_rien_est_none(calc):
    assert calc._lire_dernier({"bri": None, "mode": None, "kelvin": None, "hs": None}) is None
    assert calc._lire_dernier({}) is None and calc._lire_dernier("x") is None
    assert calc._lire_dernier({"bri": 45}) == {"bri": 45, "mode": None, "kelvin": None, "hs": None}
    assert calc._lire_dernier({"mode": "onoff"}) == {"bri": None, "mode": "onoff", "kelvin": None, "hs": None}


def test_la_vue_d_un_etat_ne_se_calcule_qu_une_fois_par_note(calc, monkeypatch):
    """Menage de l'audit du 19/10 : `noter` et `_noter` calculaient chacun
    `vue()` du meme etat."""
    f = allumee(calc)
    appels = []
    vraie = calc.vue

    def comptee(etat, attributs):
        appels.append(etat)
        return vraie(etat, attributs)

    monkeypatch.setattr(calc, "vue", comptee)
    calc.noter(f, "on", {"brightness": 204}, T, calc.contexte(None))
    assert appels == ["on"]


def test_la_meme_valeur_publiee_de_nouveau_ne_fait_pas_de_note(calc):
    """Une reprise au meme etat n'est pas un geste (la lecon du 14/10 sur les
    prises) ; une couleur seule non plus - mais le dernier niveau la retient."""
    f = calc.noter(allumee(calc), "on", {"brightness": 115}, T, calc.contexte("u-papa"))
    f = calc.noter(f, "on", {"brightness": 115, "color_mode": "hs", "hs_color": (275.0, 100.0)}, T + 5,
                   calc.contexte(None))
    assert f["evenements"] == []
    assert f["dernier"]["hs"] == [275.0, 100.0]


def test_un_reglage_se_note(calc):
    f = calc.noter(allumee(calc), "on", {"brightness": 153}, T, calc.contexte("u-papa"))
    assert f["evenements"] == [note(T, "on", 60, reglage=True, user="u-papa")]


def test_des_reglages_a_moins_de_30_s_l_un_de_l_autre_ne_font_qu_une_note(calc):
    """La glissiere qu'on promene : une note, a la derniere valeur, a l'heure de
    la premiere - « l'un de l'autre » : la chaine continue tant qu'ils se
    suivent de pres."""
    f = allumee(calc)
    for dt, b in ((0, 153), (12, 178), (36, 204), (60, 230)):
        f = calc.noter(f, "on", {"brightness": b}, T + dt, calc.contexte("u-papa"))
    assert f["evenements"] == [note(T, "on", 90, reglage=True, user="u-papa")]


def test_trente_secondes_sans_reglage_ouvrent_une_autre_note(calc):
    f = calc.noter(allumee(calc), "on", {"brightness": 153}, T, calc.contexte(None))
    f = calc.noter(f, "on", {"brightness": 204}, T + 30, calc.contexte(None))
    assert f["evenements"] == [note(T, "on", 60, reglage=True), note(T + 30, "on", 80, reglage=True)]


def test_un_reglage_juste_apres_l_allumage_s_y_fond(calc):
    """L'echo d'une ampoule qui monte a son niveau : « Allumee a 45 % », pas
    « Allumee a 1 % » puis « Reglee a 45 % »."""
    f = calc.noter(calc.fiche_neuve(), "off", {}, T - 60, calc.contexte(None))
    f = calc.noter(f, "on", {"brightness": 3}, T, calc.contexte("u-papa"))
    f = calc.noter(f, "on", {"brightness": 115}, T + 2, calc.contexte(None))
    assert f["evenements"] == [note(T, "on", 45, user="u-papa")]


def test_un_autre_auteur_ouvre_sa_propre_note(calc):
    """Le reglage d'un autre - une personne apres une automatisation - garde son
    auteur ; l'echo, qui n'en a pas, se fond."""
    soiree = calc.contexte(None, ("automation_triggered", "Soirée"))
    f = calc.noter(allumee(calc), "on", {"brightness": 128}, T, soiree)
    f = calc.noter(f, "on", {"brightness": 204}, T + 5, calc.contexte("u-papa"))
    f = calc.noter(f, "on", {"brightness": 191}, T + 8, calc.contexte(None))
    assert f["evenements"] == [note(T, "on", 50, reglage=True, type_="automation_triggered", nom="Soirée"),
                               note(T + 5, "on", 75, reglage=True, user="u-papa")]


def test_le_reseau_se_note_et_le_retour_aussi(calc):
    """« Ne repond plus », puis « De retour » : l'ecran les range (spec 8), le
    carnet note les deux - le retour avec son niveau."""
    f = calc.noter(allumee(calc), "unavailable", {}, T, calc.contexte(None))
    f = calc.noter(f, "unknown", {}, T + 10, calc.contexte(None))
    f = calc.noter(f, "on", {"brightness": 115}, T + 70, calc.contexte(None))
    assert f["evenements"] == [note(T, "unavailable"), note(T + 10, "unknown"), note(T + 70, "on", 45)]


def test_un_etat_qu_une_lampe_ne_prend_pas_ne_change_rien(calc):
    f = allumee(calc)
    for etat in ("heat", None, 5, "ON"):
        assert calc.noter(f, etat, {"brightness": 3}, T, calc.contexte(None)) is f


def test_un_etat_restaure_n_est_pas_une_panne(calc):
    """Quand une entite n'est pas (encore) recreee - au demarrage, ou quand on
    recharge son integration -, Home Assistant lui pose LUI-MEME un etat
    `unavailable` avec `restored: true`. Ce n'est pas la lampe qui ne repond plus :
    ni note, ni `vu`, ni `dernier` ne bougent (relecture du 14/10)."""
    f = allumee(calc)
    restauree = {"restored": True, "supported_features": 40, "friendly_name": "Ampoule chambre"}
    assert calc.noter(f, "unavailable", restauree, T, calc.contexte(None)) is f
    # Elle revient comme elle etait : rien a dire non plus.
    f = calc.noter(f, "on", {"brightness": 115}, T + 40, calc.contexte(None))
    assert f["evenements"] == [] and f["vu"] == {"state": "on", "bri": 45}
    # Une vraie panne, elle, se note : `restored` absent, ou autre chose que vrai.
    for panne in ({}, {"restored": False}):
        assert calc.noter(allumee(calc), "unavailable", panne, T, calc.contexte(None))["evenements"] == [
            note(T, "unavailable")]


def test_un_premier_etat_inconnu_n_est_pas_l_etat_de_la_lampe(calc):
    """Une lampe encore `unknown` (Zigbee2MQTT, jusqu'a ce que l'ampoule republie)
    ou `unavailable` quand le carnet la voit pour la premiere fois n'a pas d'etat a
    garder : son retour est son PREMIER etat vu, pas un allumage (relecture du
    14/10)."""
    for etat in ("unknown", "unavailable"):
        f = calc.noter(calc.fiche_neuve(), etat, {}, T, calc.contexte(None))
        assert f == calc.fiche_neuve(), "rien a garder"
        f = calc.noter(f, "on", {"brightness": 115}, T + 30, calc.contexte(None))
        assert f["evenements"] == [] and f["vu"] == {"state": "on", "bri": 45}
        f = calc.noter(f, "off", {}, T + 90, calc.contexte(None))
        assert f["evenements"] == [note(T + 90, "off")], "des qu'elle a un etat, ses gestes se notent"
    f = calc.noter(calc.fiche_neuve(), "unavailable", {"restored": True}, T, calc.contexte(None))
    assert f == calc.fiche_neuve()


def test_une_horloge_qui_recule_ne_range_pas_une_note_avant_la_precedente(calc):
    f = calc.noter(allumee(calc), "off", {}, T, calc.contexte(None))
    f = calc.noter(f, "on", {"brightness": 115}, T - 300, calc.contexte(None))
    assert [n["when"] for n in f["evenements"]] == [T, T]


# ── L'echo d'une extinction en fondu (doute D2, vu chez lui le 15/10) ──────

def quinze(h, mi, s=0):
    """Un instant du jeudi 15/10/2026 a Paris : le soir ou l'echo s'est vu chez lui."""
    return datetime(2026, 10, 15, h, mi, s, tzinfo=PARIS).timestamp()


# La veilleuse de Lino, une Hue couleur, dans son violet : a 22 % (56/255), et a 2 %
# (5/255), le niveau que l'ampoule a remonte au milieu du fondu.
VIOLET = {"color_mode": "xy", "hs_color": (305.0, 74.9)}
A_22, A_2 = dict(VIOLET, brightness=56), dict(VIOLET, brightness=5)


def eteinte_en_fondu(calc, ctx=None):
    """Sa fiche le 15/10 jusqu'a l'extinction : allumee a 22 % a 18:11:25, eteinte
    avec une transition a 18:31:45 (de contexte `ctx` ; aucun par defaut)."""
    sans = calc.contexte(None)
    f = calc.noter(calc.fiche_neuve(), "off", {}, quinze(18, 0), sans)
    f = calc.noter(f, "on", A_22, quinze(18, 11, 25), sans)
    return calc.noter(f, "off", {}, quinze(18, 31, 45), ctx or sans)


def test_l_echo_d_une_extinction_en_fondu_n_est_pas_un_rallumage(calc):
    """Son carnet du 15/10 : eteinte avec une transition a 18:31:45, l'ampoule a
    remonte deux secondes plus tard un etat du milieu du fondu - `on` a 2 % -, puis
    le `off` final, sept secondes apres. Ni « Allumee a 2 % » ni deux extinctions :
    UNE, a l'heure du geste ; et elle se rallumera a 22 %, pas a 2 %. La fiche est
    celle d'avant l'echo."""
    sans = calc.contexte(None)
    eteinte = eteinte_en_fondu(calc)
    f = calc.noter(eteinte, "on", A_2, quinze(18, 31, 47), sans)
    f = calc.noter(f, "off", {}, quinze(18, 31, 54), sans)
    assert f["evenements"] == [note(quinze(18, 11, 25), "on", 22), note(quinze(18, 31, 45), "off")]
    assert f["dernier"] == {"bri": 22, "mode": "xy", "kelvin": None, "hs": [305.0, 74.9]}
    assert f == eteinte, "comme si l'echo n'avait pas eu lieu"


def test_les_paliers_de_l_echo_restent_l_echo(calc):
    """L'ampoule peut d'abord redire son niveau d'avant, puis remonter des paliers du
    fondu, ou une couleur seule : ils se fondent dans le rallumage (FONDRE_S), et le
    tout reste l'echo - eteint neuf secondes apres son debut."""
    sans = calc.contexte(None)
    eteinte = eteinte_en_fondu(calc)
    f = eteinte
    for s, attributs in ((46, A_22), (47, dict(VIOLET, brightness=8)),
                         (48, dict(VIOLET, brightness=8, hs_color=(300.0, 70.0))), (49, A_2)):
        f = calc.noter(f, "on", attributs, quinze(18, 31, s), sans)
    f = calc.noter(f, "off", {}, quinze(18, 31, 55), sans)
    assert f == eteinte


def test_un_vrai_rallumage_reste_un_allumage(calc):
    """Rallumee deux secondes apres l'extinction : le carnet note l'allumage tout de
    suite, et son niveau devient le dernier. Eteinte a ECHO_S tout juste de ce
    rallumage, c'est un geste ; rallumee a ECHO_S tout juste de l'extinction aussi."""
    sans = calc.contexte(None)
    f = calc.noter(eteinte_en_fondu(calc), "on", A_2, quinze(18, 31, 47), sans)
    assert f["evenements"][-1] == note(quinze(18, 31, 47), "on", 2) and f["dernier"]["bri"] == 2
    f = calc.noter(f, "off", {}, quinze(18, 31, 57), sans)
    assert f["evenements"][1:] == [note(quinze(18, 31, 45), "off"), note(quinze(18, 31, 47), "on", 2),
                                   note(quinze(18, 31, 57), "off")]
    assert f["dernier"]["bri"] == 2
    f = calc.noter(eteinte_en_fondu(calc), "on", A_2, quinze(18, 31, 55), sans)
    f = calc.noter(f, "off", {}, quinze(18, 31, 56), sans)
    assert [n["state"] for n in f["evenements"]] == ["on", "off", "on", "off"]


@pytest.mark.parametrize("qui", ["un_compte_rallume", "un_compte_eteint", "une_autre_automatisation_rallume"])
def test_le_geste_d_un_humain_ne_s_efface_jamais(calc, qui):
    """Un rallumage qui porte un compte est un geste, a quelque niveau que ce soit :
    il reste, l'extinction qui le suit aussi, et son niveau devient le dernier. De
    meme quand c'est la seconde extinction qui porte un compte, ou quand une AUTRE
    automatisation que celle qui a eteint rallume : rien ne s'efface."""
    sans, papa = calc.contexte(None), calc.contexte("u-papa")
    reveil = calc.contexte(None, ("automation_triggered", "Réveil"))
    rallume = {"un_compte_rallume": papa, "une_autre_automatisation_rallume": reveil}.get(qui, sans)
    eteint = papa if qui == "un_compte_eteint" else sans
    f = calc.noter(eteinte_en_fondu(calc), "on", A_2, quinze(18, 31, 47), rallume)
    f = calc.noter(f, "off", {}, quinze(18, 31, 54), eteint)
    assert f["evenements"][1:] == [note(quinze(18, 31, 45), "off"),
                                   dict(note(quinze(18, 31, 47), "on", 2), **rallume),
                                   dict(note(quinze(18, 31, 54), "off"), **eteint)]
    assert f["dernier"]["bri"] == 2


def test_l_echo_garde_le_nom_de_l_automatisation_qui_a_eteint(calc):
    """Home Assistant prete le contexte d'un ordre a ce qui le suit de pres : l'echo
    d'une extinction qu'une automatisation a lancee porte son nom. C'est l'echo
    quand meme, et l'extinction garde son nom."""
    coucher = calc.contexte(None, ("automation_triggered", "Coucher de Lino"))
    eteinte = eteinte_en_fondu(calc, coucher)
    f = calc.noter(eteinte, "on", A_2, quinze(18, 31, 47), coucher)
    f = calc.noter(f, "off", {}, quinze(18, 31, 54), calc.contexte(None))
    assert f == eteinte
    assert f["evenements"][-1] == note(quinze(18, 31, 45), "off", type_="automation_triggered",
                                       nom="Coucher de Lino")


def test_ce_qui_n_est_pas_un_fondu_n_en_est_pas_l_echo(calc):
    """Un fondu descend : un rallumage plus haut que le niveau d'avant l'extinction,
    ou qui y remonte pendant le doute, n'en est pas l'echo. Une lampe sans
    variateur n'a pas de fondu : son rallumage n'en est jamais un."""
    sans = calc.contexte(None)
    f = calc.noter(eteinte_en_fondu(calc), "on", dict(VIOLET, brightness=255), quinze(18, 31, 47), sans)
    f = calc.noter(f, "off", {}, quinze(18, 31, 54), sans)
    assert [n["bri"] for n in f["evenements"]] == [22, None, 100, None] and f["dernier"]["bri"] == 100
    f = calc.noter(eteinte_en_fondu(calc), "on", A_2, quinze(18, 31, 47), sans)
    f = calc.noter(f, "on", dict(VIOLET, brightness=128), quinze(18, 31, 49), sans)
    f = calc.noter(f, "off", {}, quinze(18, 31, 54), sans)
    assert [n["bri"] for n in f["evenements"]] == [22, None, 50, None] and f["dernier"]["bri"] == 50
    f = calc.noter(calc.fiche_neuve(), "on", {"color_mode": "onoff"}, T - 60, sans)
    for dt, etat in ((0, "off"), (2, "on"), (9, "off")):
        f = calc.noter(f, etat, {"color_mode": "onoff"} if etat == "on" else {}, T + dt, sans)
    assert [n["state"] for n in f["evenements"]] == ["off", "on", "off"]


def test_un_rallumage_en_doute_ne_se_dit_pas_encore(calc):
    """Tant que dure le doute (ECHO_S), le carnet dit la lampe telle qu'avant le
    rallumage, a l'ecran comme sur le disque : un arret de Home Assistant au milieu
    de l'echo n'ecrit ni « Allumee a 2 % » ni un faux dernier niveau, que le
    redemarrage ne saurait plus reconnaitre. Passe le doute, il dit le rallumage
    tel qu'il a ete note ; une fiche sans doute se dit telle quelle."""
    eteinte = eteinte_en_fondu(calc)
    f = calc.noter(eteinte, "on", A_2, quinze(18, 31, 47), calc.contexte(None))
    for s in (47, 50, 56):
        assert calc.sans_rallumage_en_doute(f, quinze(18, 31, s)) == eteinte
    assert calc.sans_rallumage_en_doute(f, quinze(18, 31, 57)) == dict(
        eteinte, vu={"state": "on", "bri": 2}, niveau_a=quinze(18, 31, 47), dernier=dict(eteinte["dernier"], bri=2),
        evenements=eteinte["evenements"] + [note(quinze(18, 31, 47), "on", 2)])
    assert calc.sans_rallumage_en_doute(eteinte, quinze(18, 31, 50)) is eteinte


# ── La fenetre de demarrage (doute D1, vu chez lui le 16/10) ───────────────

def seize(h, mi, s=0):
    """Un instant du vendredi 16/10/2026 a Paris : le jour de son redemarrage de 14:28."""
    return datetime(2026, 10, 16, h, mi, s, tzinfo=PARIS).timestamp()


# Allumee a 100 %, comme ses cinq lampes allumees au redemarrage du 16/10.
PLEIN = {"brightness": 255, "color_mode": "brightness"}


def avant_le_redemarrage(calc, etat):
    """Une lampe le 16/10 jusqu'au redemarrage de 14:28 : allumee a 07:00, eteinte a
    08:00 - et rallumee a 100 % a 13:00 si `etat` vaut `on`."""
    sans = calc.contexte(None)
    f = calc.noter(calc.fiche_neuve(), "off", {}, seize(6, 0), sans)
    f = calc.noter(f, "on", {"brightness": 128}, seize(7, 0), sans)
    f = calc.noter(f, "off", {}, seize(8, 0), sans)
    return calc.noter(f, "on", PLEIN, seize(13, 0), sans) if etat == "on" else f


@pytest.mark.parametrize("etat", ["off", "on"])
def test_au_redemarrage_l_inconnu_puis_l_etat_d_avant_ne_font_aucune_note(calc, etat):
    """Son redemarrage du 16/10 : a 14:28:21, ses quatorze lampes existaient deja,
    `unknown` - leur integration n'avait pas encore parle, et rien ne disait
    `restored` -, et leur vrai etat est arrive 89 s plus tard. Le carnet notait
    « unknown », puis l'etat d'avant : vingt-huit fausses notes. Dans la fenetre de
    demarrage, l'inconnu ne fait pas de note - `vu` le suit, et la fiche garde un
    doute : son heure, l'etat d'avant -, et le vrai etat, celui d'avant, n'en fait pas
    non plus : rien ne s'est passe. Eteinte comme allumee a 100 %."""
    sans = calc.contexte(None)
    avant = avant_le_redemarrage(calc, etat)
    f = calc.noter(avant, "unknown", {"friendly_name": "Bureau"}, seize(14, 28, 21), sans, demarrage=True)
    assert f["evenements"] == avant["evenements"] and f["dernier"] == avant["dernier"]
    assert f["vu"] == {"state": "unknown", "bri": None}
    assert f["doute_demarrage"] == {"when": seize(14, 28, 21), "avant": avant["vu"]}
    f = calc.noter(f, etat, PLEIN if etat == "on" else {}, seize(14, 29, 50), sans, demarrage=True)
    assert f == avant, "comme si elle ne s'etait jamais tue"


def test_une_lampe_touchee_pendant_l_arret_fait_une_seule_note(calc):
    """Pendant l'arret, quelqu'un l'a allumee a l'interrupteur mural : son vrai etat,
    quand il arrive, n'est plus celui d'avant. UNE note du nouvel etat, a l'heure ou il
    arrive, avec son niveau ; `dernier` le prend. Eteinte au demarrage par une
    automatisation : la note porte son nom. Reglee a un autre niveau : « Reglee »."""
    sans = calc.contexte(None)
    avant = avant_le_redemarrage(calc, "off")
    f = calc.noter(avant, "unknown", {}, seize(14, 28, 21), sans, demarrage=True)
    f = calc.noter(f, "on", {"brightness": 115}, seize(14, 29, 50), sans, demarrage=True)
    assert f["evenements"] == avant["evenements"] + [note(seize(14, 29, 50), "on", 45)]
    assert f["vu"] == {"state": "on", "bri": 45} and f["dernier"]["bri"] == 45
    assert "doute_demarrage" not in f
    allumee = avant_le_redemarrage(calc, "on")
    auto = calc.contexte(None, ("automation_triggered", "Démarrage"))
    f = calc.noter(allumee, "unavailable", {}, seize(14, 28, 21), sans, demarrage=True)
    f = calc.noter(f, "off", {}, seize(14, 29, 50), auto, demarrage=True)
    assert f["evenements"] == allumee["evenements"] + [
        note(seize(14, 29, 50), "off", type_="automation_triggered", nom="Démarrage")]
    assert f["dernier"] == allumee["dernier"]
    f = calc.noter(allumee, "unknown", {}, seize(14, 28, 21), sans, demarrage=True)
    f = calc.noter(f, "on", {"brightness": 128}, seize(14, 29, 50), sans, demarrage=True)
    assert f["evenements"] == allumee["evenements"] + [note(seize(14, 29, 50), "on", 50, reglage=True)]


def test_une_lampe_encore_muette_a_la_fermeture_ne_repond_plus(calc):
    """La fenetre se ferme et la lampe n'a toujours rien dit : ce n'etait pas son
    integration qui tardait, elle ne repond plus. UNE note, de l'etat ou elle est, a
    l'heure ou elle s'est tue - republiee, ou passee de `unknown` a `unavailable`
    entre-temps, elle garde cette heure. Son retour se note ensuite comme apres toute
    panne. Sans doute, la fermeture ne change rien."""
    sans = calc.contexte(None)
    avant = avant_le_redemarrage(calc, "on")
    muette = calc.noter(avant, "unknown", {}, seize(14, 28, 21), sans, demarrage=True)
    muette = calc.noter(muette, "unknown", {}, seize(14, 29, 0), sans, demarrage=True)
    fermee = calc.clore_demarrage(muette)
    assert fermee["evenements"] == avant["evenements"] + [note(seize(14, 28, 21), "unknown")]
    assert fermee["vu"] == {"state": "unknown", "bri": None} and fermee["dernier"] == avant["dernier"]
    assert "doute_demarrage" not in fermee
    f = calc.noter(muette, "unavailable", {}, seize(14, 29, 30), sans, demarrage=True)
    assert calc.clore_demarrage(f)["evenements"][-1] == note(seize(14, 28, 21), "unavailable")
    f = calc.noter(fermee, "on", PLEIN, seize(14, 45), sans)
    assert f["evenements"][-1] == note(seize(14, 45), "on", 100)
    assert calc.clore_demarrage(avant) is avant


def test_hors_de_la_fenetre_une_lampe_qui_decroche_se_note_tout_de_suite(calc):
    """La fenetre fermee, rien ne change : `unavailable` ou `unknown`, sur une lampe qui
    a un etat, se note a son heure. Un doute que la fermeture n'aurait pas clos se clot
    d'abord : la lampe muette se note, puis son retour - rien ne se perd."""
    sans = calc.contexte(None)
    avant = avant_le_redemarrage(calc, "on")
    for etat in ("unavailable", "unknown"):
        for f in (calc.noter(avant, etat, {}, seize(16, 0), sans),
                  calc.noter(avant, etat, {}, seize(16, 0), sans, demarrage=False)):
            assert f["evenements"] == avant["evenements"] + [note(seize(16, 0), etat)]
            assert "doute_demarrage" not in f
    muette = calc.noter(avant, "unknown", {}, seize(14, 28, 21), sans, demarrage=True)
    f = calc.noter(muette, "on", PLEIN, seize(14, 45), sans)
    assert f["evenements"] == avant["evenements"] + [note(seize(14, 28, 21), "unknown"),
                                                     note(seize(14, 45), "on", 100)]


def test_la_fenetre_de_demarrage_ne_change_rien_au_reste(calc):
    """`restored` reste ecarte, doute ouvert ou non ; une lampe jamais vue ne garde
    toujours pas `unknown`, et son premier etat ne fait pas de note ; un vrai geste se
    note a son heure ; l'echo d'une extinction en fondu (D2) reste l'echo."""
    sans = calc.contexte(None)
    avant = avant_le_redemarrage(calc, "on")
    restauree = {"restored": True, "supported_features": 40}
    assert calc.noter(avant, "unavailable", restauree, seize(14, 28, 0), sans, demarrage=True) is avant
    muette = calc.noter(avant, "unknown", {}, seize(14, 28, 21), sans, demarrage=True)
    assert calc.noter(muette, "unavailable", restauree, seize(14, 28, 30), sans, demarrage=True) is muette
    neuve = calc.noter(calc.fiche_neuve(), "unknown", {}, seize(14, 28, 21), sans, demarrage=True)
    assert neuve == calc.fiche_neuve()
    neuve = calc.noter(neuve, "on", PLEIN, seize(14, 29, 50), sans, demarrage=True)
    assert neuve["evenements"] == [] and neuve["vu"] == {"state": "on", "bri": 100}
    f = calc.noter(avant, "off", {}, seize(14, 28, 30), calc.contexte("u-papa"), demarrage=True)
    assert f["evenements"][-1] == note(seize(14, 28, 30), "off", user="u-papa")
    eteinte = eteinte_en_fondu(calc)
    f = calc.noter(eteinte, "on", A_2, quinze(18, 31, 47), sans, demarrage=True)
    f = calc.noter(f, "off", {}, quinze(18, 31, 54), sans, demarrage=True)
    assert f == eteinte


def test_la_fenetre_se_ferme_deux_minutes_apres_le_demarrage_et_jamais_plus_de_cinq(calc):
    """FENETRE_DEMARRAGE_S apres que Home Assistant a demarre - des la naissance du
    carnet quand il tournait deja (un rechargement de l'integration) -, et jamais plus
    de FENETRE_DEMARRAGE_MAX_S apres la naissance, meme si le demarrage ne se dit
    jamais."""
    n = seize(14, 27, 50)
    assert (calc.FENETRE_DEMARRAGE_S, calc.FENETRE_DEMARRAGE_MAX_S) == (120, 300)
    assert calc.fin_demarrage(n, n + 31) == n + 151
    assert calc.fin_demarrage(n, n) == n + 120, "Home Assistant tournait deja"
    assert calc.fin_demarrage(n, n + 250) == n + 300
    assert calc.fin_demarrage(n, n + 400) == n + 300, "deja fermee quand il le dit"
    assert calc.fin_demarrage(n, None) == n + 300, "il ne le dit jamais"


def test_un_doute_de_demarrage_ne_s_ecrit_pas(calc):
    """Le fichier garde la lampe telle qu'elle etait avant de se taire, et rien du
    doute : relu apres un redemarrage en pleine fenetre, l'inconnu passerait pour son
    etat, et son retour pour un geste. Une fiche sans doute s'ecrit telle quelle."""
    sans = calc.contexte(None)
    avant = avant_le_redemarrage(calc, "on")
    muette = calc.noter(avant, "unknown", {}, seize(14, 28, 21), sans, demarrage=True)
    assert calc.sans_doute_demarrage(muette) == avant
    assert calc.sans_doute_demarrage(avant) is avant
    depuis = calc.veille_a_minuit(datetime(2026, 10, 16, 14, 29, tzinfo=PARIS))
    ecrit = json.loads(json.dumps({"light.bureau": calc.sans_doute_demarrage(muette)}))
    assert calc.lire_carnet(ecrit, depuis) == {"light.bureau": avant}


# ── La fenetre : depuis la veille a 00:00 (spec 6.2) ───────────────────────

def paris(jour, h=0, mi=0):
    return datetime(2026, 10, jour, h, mi, tzinfo=PARIS)


def test_la_veille_a_minuit_se_compte_a_l_heure_de_la_maison(calc):
    assert calc.veille_a_minuit(paris(13, 20, 40)) == paris(12).timestamp()
    assert calc.veille_a_minuit(paris(13)) == paris(12).timestamp()
    # Le 25/10 a 03:00, Paris repasse a l'heure d'hiver : le lendemain, la
    # veille a 00:00 est encore a l'heure d'ete, et la journee a 25 heures.
    assert calc.veille_a_minuit(paris(26, 8)) == paris(25).timestamp()
    assert paris(26).timestamp() - paris(25).timestamp() == 25 * 3600


def test_l_elagage_garde_la_fenetre_et_l_etat_d_avant(calc):
    """La duree allumee se compte « depuis l'etat d'avant minuit » (spec 8) : une
    lampe allumee il y a trois jours le dit encore."""
    depuis = paris(12).timestamp()
    notes = [note(paris(9, 18).timestamp(), "on", 80), note(paris(10, 7).timestamp(), "off"),
             note(paris(12, 6).timestamp(), "on", 45), note(paris(13, 7, 50).timestamp(), "off")]
    assert calc.elaguer(notes, depuis) == notes[1:]
    assert calc.elaguer(notes[:2], depuis) == notes[1:2], "des jours sans changement : l'etat d'avant reste"
    assert calc.elaguer([], depuis) == []


def test_une_lampe_bavarde_garde_cent_notes_et_ses_reglages_partent_d_abord(calc):
    """Un eclairage adaptatif la regle toutes les minutes et demie : les plus
    vieux reglages partent, l'allumage et l'extinction restent."""
    depuis, t0 = paris(12).timestamp(), paris(13, 6).timestamp()
    notes = ([note(t0, "on", 50)] + [note(t0 + 90 * i, "on", 50 + i % 40, reglage=True) for i in range(1, 150)]
             + [note(t0 + 90 * 150, "off")])
    gardees = calc.elaguer(notes, depuis)
    assert len(gardees) == 100
    assert gardees[0] == notes[0] and gardees[-1] == notes[-1], "l'allumage et l'extinction restent"
    assert gardees[1:-1] == notes[-99:-1], "les reglages les plus recents"
    # Une ampoule qui decroche sans cesse : les cent plus recentes.
    pannes = [note(t0 + i, "unavailable") if i % 2 else note(t0 + i, "on", 50) for i in range(130)]
    assert calc.elaguer(pannes, depuis) == pannes[-100:]


def test_la_note_d_avant_la_fenetre_ne_part_jamais(calc):
    """C'est la seule qui dit l'etat a minuit. Quand la lampe est bavarde, un
    reglage d'avant la fenetre partait le PREMIER (c'est le plus ancien) : elle reste,
    et fait partie des cent (relecture du 14/10)."""
    depuis, t0 = paris(12).timestamp(), paris(13, 6).timestamp()
    avant = note(paris(10, 22).timestamp(), "on", 60, reglage=True)
    dedans = ([note(t0, "on", 50)] + [note(t0 + 90 * i, "on", 50 + i % 40, reglage=True) for i in range(1, 150)]
              + [note(t0 + 90 * 150, "off")])
    gardees = calc.elaguer([avant] + dedans, depuis)
    assert len(gardees) == 100
    assert gardees[0] == avant, "l'etat d'avant minuit reste, meme quand c'est un reglage"
    assert gardees[1] == dedans[0] and gardees[-1] == dedans[-1], "l'allumage et l'extinction restent"
    assert gardees[2:-1] == dedans[-98:-1], "puis les reglages les plus recents"
    # Une ampoule qui decroche sans cesse - rien a retirer que des pannes : la
    # tranche des cent plus recentes coupait l'etat d'avant elle aussi.
    pannes = [note(t0 + i, "unavailable") if i % 2 else note(t0 + i, "on", 50) for i in range(130)]
    gardees = calc.elaguer([avant] + pannes, depuis)
    assert len(gardees) == 100 and gardees[0] == avant and gardees[1:] == pannes[-99:]
    # Le carnet relu du disque s'elague de la meme facon.
    relu = calc.lire_carnet({"light.bavarde": {"evenements": [avant] + dedans}}, depuis)
    assert relu["light.bavarde"]["evenements"][0] == avant and len(relu["light.bavarde"]["evenements"]) == 100


# ── La relecture du disque ──────────────────────────────────────────────────

def test_le_carnet_se_relit_tel_qu_il_s_est_ecrit(calc):
    f = calc.noter(allumee(calc, t=T - 120), "off", {}, T - 60, calc.contexte(None))
    f = calc.noter(f, "on", {"brightness": 38, "color_mode": "xy", "hs_color": (275.0, 100.0)}, T,
                   calc.contexte("u-papa", ("automation_triggered", "Coucher de Lino")))
    ecrit = json.loads(json.dumps({"light.veilleuse": f}))
    assert calc.lire_carnet(ecrit, paris(12).timestamp()) == {"light.veilleuse": f}


def test_ce_qui_ne_se_relit_pas_s_ecarte(calc):
    depuis = paris(12).timestamp()
    bonne = note(T, "on", 45, user="u-papa")
    brut = {
        "light.bonne": {"vu": {"state": "on", "bri": 45},
                        "dernier": {"bri": 45, "mode": "brightness", "kelvin": None, "hs": None},
                        "niveau_a": T, "evenements": [bonne, {"when": "hier", "state": "on"},
                                                      {"when": T, "state": "heat"}, "x"]},
        "light.abimee": {"vu": "on", "dernier": {"bri": 450, "mode": 5, "kelvin": "2700", "hs": [1]},
                         "niveau_a": "x", "evenements": "rien"},
        "sensor.pas_une_lampe": {"vu": None, "evenements": []},
        "light.pas_une_fiche": [],
    }
    relu = calc.lire_carnet(brut, depuis)
    assert set(relu) == {"light.bonne", "light.abimee"}
    assert relu["light.bonne"]["evenements"] == [bonne]
    # Un dernier niveau dont rien ne se lit n'en est pas un : None, pas une table de None (audit du 19/10).
    assert relu["light.abimee"] == {"vu": None, "dernier": None, "niveau_a": None, "evenements": []}
    for illisible in (None, [], "carnet", {5: {}}):
        assert calc.lire_carnet(illisible, depuis) == {}


def test_le_carnet_relu_se_range_et_s_elague(calc):
    depuis = paris(12).timestamp()
    notes = [note(paris(13, 7).timestamp(), "off"), note(paris(9).timestamp(), "on", 80),
             note(paris(12, 6).timestamp(), "on", 45), note(paris(10).timestamp(), "off")]
    relu = calc.lire_carnet({"light.a": {"evenements": notes}}, depuis)
    assert relu["light.a"]["evenements"] == [notes[3], notes[2], notes[0]]


# ── Qui a ouvert un contexte (spec 6.1) ─────────────────────────────────────

def test_un_lien_se_garde_une_heure_et_mille_au_plus(calc):
    liens = {"vieux": (T - 3600, "automation_triggered", "Matin"), "frais": (T - 60, "script_started", "Film")}
    assert calc.garder_liens(liens, T) == {"frais": (T - 60, "script_started", "Film")}
    beaucoup = {"c%d" % i: (T, "automation_triggered", "A%d" % i) for i in range(1005)}
    gardes = calc.garder_liens(beaucoup, T)
    assert len(gardes) == 1000 and "c4" not in gardes and "c1004" in gardes


def test_un_contexte_se_reconnait_par_son_identifiant_puis_son_parent(calc):
    liens = {"ctx-auto": (T, "automation_triggered", "Coucher de Lino")}
    assert calc.lien_de(liens, "ctx-auto", None, T + 5) == ("automation_triggered", "Coucher de Lino")
    assert calc.lien_de(liens, "ctx-enfant", "ctx-auto", T + 5) == ("automation_triggered", "Coucher de Lino")
    assert calc.lien_de(liens, "ctx-main", None, T + 5) is None
    assert calc.lien_de(liens, None, None, T + 5) is None
    assert calc.lien_de(liens, "ctx-auto", None, T + 3600) is None, "une heure apres, le lien ne dit plus rien"
