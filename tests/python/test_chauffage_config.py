"""La configuration du chauffage et ses reprises en main (chantier Chauffage, § 7).

Ce qui se CHARGE est relu avec indulgence : un fichier abime perd la ligne
illisible, pas le reste. Ce qui s'ECRIT est refuse au premier defaut, et le
refus NOMME la cle — « heure illisible : jeu[2].h » —, sinon il coute des
jours (ADR 0125).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from conftest import charger


@pytest.fixture(scope="module")
def cc():
    return charger("chauffage_config")


MAINTENANT = datetime(2026, 10, 12, 8, 0, tzinfo=timezone.utc)
FIL = {"entite": "select.radiateur_bureau_pilot_wire_mode", "famille": "fil_pilote",
       "permis": ["confort", "eco", "hors_gel", "arret"]}


def test_la_semaine_type_du_premier_allumage(cc):
    s = cc.semaine_type()
    assert s["lun"] == [{"h": "06:30", "mode": "confort"}, {"h": "08:30", "mode": "eco"},
                        {"h": "18:00", "mode": "confort"}, {"h": "22:30", "mode": "eco"}]
    assert s["ven"] == s["lun"]
    assert s["sam"] == s["dim"] == [{"h": "08:00", "mode": "confort"}, {"h": "22:30", "mode": "eco"}]


def test_une_reprise_sur_son_programme_se_garde_et_se_relit(cc):
    from datetime import datetime, timezone
    maintenant = datetime(2026, 10, 19, 15, tzinfo=timezone.utc)
    r = cc.nouvelle_reprise(None, 19, None, maintenant, programme=True)
    assert r["programme"] is True
    assert cc.lire_reprises({"x": r}, maintenant)["x"]["programme"] is True
    assert cc.nouvelle_reprise("eco", None, None, maintenant)["programme"] is False
    assert cc.lire_reprises({"x": {"mode": "eco"}}, maintenant)["x"]["programme"] is False


def test_les_defauts_eteignent_tout(cc):
    cfg = cc.config_defaut()
    assert cfg["chauffages"] == {} and cfg["simulation"] == {"actif": False}
    # ASSERTION MODIFIÉE (audit du 19/10) : `par_presence`, qui a posé l'Absence.
    assert cfg["maison"] == {"mode": "planning", "vacances_fin": None, "absence": "eco", "vacances": "hors_gel",
                             "par_presence": False}
    neuf = cc.chauffage_defaut("climate.poele", "thermostat")
    assert neuf["planning"] is False, "D5 : planning eteint par defaut"
    assert neuf["temperatures"] == {"confort": 20.0, "eco": 17.0, "hors_gel": 7.0}
    assert neuf["fenetre"] == "arret"


def test_les_defauts_de_la_maison_viennent_du_calcul(cc, monkeypatch):
    """Absence et Vacances sans reglage valent ce que le calcul en fait : une
    seule source, sinon les deux fichiers divergent sans que rien ne rougisse."""
    calcul = charger("chauffage_calcul")
    monkeypatch.setitem(calcul.MAISON_DEFAUT, "absence", "hors_gel")
    monkeypatch.setitem(calcul.MAISON_DEFAUT, "vacances", "arret")
    maison = cc.config_defaut()["maison"]
    assert (maison["absence"], maison["vacances"]) == ("hors_gel", "arret")
    lue = cc.lire_config({"maison": {"absence": "chaud", "vacances": 3}})["maison"]
    assert (lue["absence"], lue["vacances"]) == ("hors_gel", "arret"), "illisible : le meme defaut"


def test_au_chargement_l_illisible_s_ecarte(cc):
    cfg = cc.lire_config({
        "chauffages": {
            "id1": {"entite": "climate.poele", "famille": "thermostat", "planning": True,
                    "semaine": {"lun": [{"h": "7:00", "mode": "confort"}, {"h": "99:00", "mode": "eco"},
                                        {"h": "06:00", "mode": "arret"}]},
                    "temperatures": {"confort": 21, "eco": "froid", "hors_gel": 50}, "fenetre": "ouvrir"},
            "id2": {"entite": "select.x", "famille": "radiateur"},
            "id3": "rien",
        },
        "maison": {"mode": "hiver", "absence": "confort_2", "vacances": "chaud"},
        "simulation": {"actif": "oui"},
    })
    assert list(cfg["chauffages"]) == ["id1"]
    c = cfg["chauffages"]["id1"]
    assert c["semaine"]["lun"] == [{"h": "06:00", "mode": "arret"}, {"h": "07:00", "mode": "confort"}]
    assert c["semaine"]["mar"] == []
    assert c["temperatures"] == {"confort": 21.0, "eco": 17.0, "hors_gel": 7.0}
    assert c["fenetre"] == "arret"
    assert cfg["maison"]["mode"] == "planning" and cfg["maison"]["absence"] == "confort_2"
    assert cfg["maison"]["vacances"] == "hors_gel"
    assert cfg["simulation"]["actif"] is False
    assert cc.lire_config(None) == cc.config_defaut()


def test_au_chargement_une_semaine_sans_changement_redevient_la_semaine_type(cc):
    """Un planning allume sans aucun changement laisserait le chauffage dans son
    dernier mode (apres une fenetre, une Absence, l'Ete) : il ne doit jamais
    atteindre le moteur."""
    illisibles = (None, "x", {}, {"lun": []},
                  {"lun": [{"h": "99:00", "mode": "eco"}, {"h": "07:00", "mode": "chaud"}]})
    for brut in illisibles:
        assert cc.lire_semaine(brut) == cc.semaine_type(), brut
    cfg = cc.lire_config({"chauffages": {"id1": {"entite": "climate.poele", "famille": "thermostat",
                                                   "planning": True, "semaine": {"mar": []}}}})
    assert cfg["chauffages"]["id1"]["semaine"] == cc.semaine_type()
    # Un seul changement suffit : la semaine est lue telle qu'elle est ecrite.
    seule = cc.lire_semaine({"mer": [{"h": "7:00", "mode": "confort"}]})
    assert seule["mer"] == [{"h": "07:00", "mode": "confort"}] and seule["lun"] == []


def test_au_chargement_des_temperatures_en_desordre_reprennent_leurs_defauts(cc):
    """Hors-gel < Eco <= Confort : un Eco plus chaud que le Confort, ou au niveau
    du Hors-gel, n'a pas de sens. Un stockage abime ne refuse jamais de se
    charger : les trois reprennent leur defaut."""
    defauts = {"confort": 20.0, "eco": 17.0, "hors_gel": 7.0}
    for brut in ({"confort": 22, "eco": 23, "hors_gel": 8},   # Eco au-dessus du Confort
                 {"confort": 22, "eco": 9, "hors_gel": 9},    # Hors-gel au niveau de l'Eco
                 {"confort": 16, "eco": "froid"}):            # Eco illisible : 17, au-dessus du Confort (16)
        assert cc.lire_temperatures(brut) == defauts, brut
    # Un ordre tenu se relit tel quel, petit abaissement compris (Eco 21 pour un Confort 22).
    assert cc.lire_temperatures({"confort": 22, "eco": 21, "hors_gel": 8}) == {
        "confort": 22.0, "eco": 21.0, "hors_gel": 8.0}
    assert cc.lire_temperatures({"confort": 22.5, "eco": 18.25, "hors_gel": 6}) == {
        "confort": 22.5, "eco": 18.25, "hors_gel": 6.0}, "un ordre tenu se relit tel quel"
    cfg = cc.lire_config({"chauffages": {"id1": {"entite": "climate.poele", "famille": "thermostat",
                                                   "temperatures": {"confort": 22, "eco": 23, "hors_gel": 8}}}})
    assert cfg["chauffages"]["id1"]["temperatures"] == defauts


@pytest.mark.parametrize("semaine,code,nomme", [
    ({"jeu": [{"h": "06:30", "mode": "confort"}, {"h": "8:00", "mode": "eco"}, {"h": "midi", "mode": "eco"}]},
     "chauffage_heure_illisible", "jeu[2].h"),
    ({"jeu": [{"h": "06:30", "mode": "confort"}, {"h": "08:00", "mode": "eco"}, {"h": "09:00", "mode": "confort_1"}]},
     "chauffage_mode_inconnu", "jeu[2].mode"),
    ({"lun": [{"h": "%02d:00" % h, "mode": "eco"} for h in range(13)]},
     "chauffage_trop_de_changements", "lun"),
    ({"mar": [{"h": "06:30", "mode": "confort"}, {"h": "6:30", "mode": "eco"}]},
     "chauffage_heure_en_double", "mar[1].h"),
])
def test_un_planning_invalide_se_refuse_en_nommant_la_cle(cc, semaine, code, nomme):
    with pytest.raises(ValueError) as refus:
        cc.valider_semaine(semaine, FIL["permis"])
    assert getattr(refus.value, "code", None) == code
    assert str(refus.value).endswith(" : " + nomme), str(refus.value)


def test_une_semaine_valide_se_range_et_se_trie(cc):
    s = cc.valider_semaine({"lun": [{"h": "22:30", "mode": "eco"}, {"h": "6:30", "mode": "confort"}]})
    assert s["lun"] == [{"h": "06:30", "mode": "confort"}, {"h": "22:30", "mode": "eco"}]
    assert s["dim"] == []
    for mauvais in ("lundi", {"lundi": []}, {"lun": "x"}, {"lun": ["x"]}):
        with pytest.raises(ValueError):
            cc.valider_semaine(mauvais)


def test_une_semaine_sans_aucun_changement_ne_s_ecrit_pas(cc):
    """Une semaine vide n'a rien a dire au moteur : apres une fenetre, une
    Absence ou l'Ete, le chauffage resterait dans son dernier mode."""
    jours_vides = {jour: [] for jour in ("lun", "mar", "mer", "jeu", "ven", "sam", "dim")}
    for vide in ({}, {"lun": []}, jours_vides):
        with pytest.raises(ValueError) as refus:
            cc.valider_semaine(vide, FIL["permis"])
        assert getattr(refus.value, "code", None) == "chauffage_semaine_vide", vide
        assert str(refus.value).endswith(" : semaine"), str(refus.value)
    un_seul = cc.valider_semaine({"dim": [{"h": "20:00", "mode": "eco"}]})
    assert un_seul["dim"] == [{"h": "20:00", "mode": "eco"}], "un seul changement suffit"


def test_les_temperatures_restent_entre_5_et_30(cc):
    base = {"confort": 20.0, "eco": 17.0, "hors_gel": 7.0}
    assert cc.valider_temperatures({"confort": 21.3}, base) == {"confort": 21.5, "eco": 17.0, "hors_gel": 7.0}
    with pytest.raises(ValueError) as refus:
        cc.valider_temperatures({"eco": 31}, base)
    assert refus.value.code == "chauffage_temperature_hors_bornes" and str(refus.value).endswith(": temperatures.eco")
    with pytest.raises(ValueError):
        cc.valider_temperatures({"boost": 25}, base)


@pytest.mark.parametrize("patch,nomme", [
    ({"eco": 21}, "eco"),                 # l'Eco depasserait le Confort (20)
    ({"confort": 16}, "confort"),         # le Confort passerait sous l'Eco (17)
    ({"hors_gel": 17}, "hors_gel"),       # le Hors-gel rejoint l'Eco
    ({"eco": 7}, "eco"),                  # l'Eco rejoint le Hors-gel
    ({"eco": 6, "hors_gel": 8}, "eco"),   # les deux changent : l'Eco, que les deux regles partagent
], ids=["eco_haute", "confort_bas", "hors_gel_haut", "eco_basse", "les_deux"])
def test_les_temperatures_tiennent_l_ordre_du_froid_au_chaud(cc, patch, nomme):
    """Hors-gel < Eco <= Confort : un Eco plus chaud que le Confort, ou qui
    rejoint le Hors-gel, n'a pas de sens."""
    base = {"confort": 20.0, "eco": 17.0, "hors_gel": 7.0}
    with pytest.raises(ValueError) as refus:
        cc.valider_temperatures(patch, base)
    assert getattr(refus.value, "code", None) == "chauffage_temperatures_desordre"
    assert str(refus.value).endswith(" : temperatures." + nomme), str(refus.value)
    assert base == {"confort": 20.0, "eco": 17.0, "hors_gel": 7.0}, "le refus ne touche pas l'existant"


def test_l_ordre_des_temperatures_se_juge_sur_les_valeurs_gardees(cc):
    """Un petit abaissement est permis (Eco 19 pour un Confort 20, courant sur une
    pompe a chaleur), et l'Eco peut valoir le Confort ; le demi-degre se juge
    APRES l'arrondi, et sur le resultat du patch entier."""
    base = {"confort": 20.0, "eco": 17.0, "hors_gel": 7.0}
    assert cc.valider_temperatures({"eco": 19}, base) == {"confort": 20.0, "eco": 19.0, "hors_gel": 7.0}
    assert cc.valider_temperatures({"eco": 20}, base)["eco"] == 20.0
    assert cc.valider_temperatures({"eco": 20.2}, base)["eco"] == 20.0, "20,2 est garde a 20"
    assert cc.valider_temperatures({"hors_gel": 16.5}, base)["hors_gel"] == 16.5
    with pytest.raises(ValueError):
        cc.valider_temperatures({"eco": 20.3}, base)  # garde a 20,5 : au-dessus du Confort
    assert cc.valider_temperatures({"confort": 16, "eco": 15}, base) == {"confort": 16.0, "eco": 15.0, "hors_gel": 7.0}


def test_le_patch_allume_un_chauffage_reconnu_et_refuse_un_inconnu(cc):
    cfg = cc.config_defaut()
    cc.poser_patch(cfg, {"chauffages": {"id1": {"planning": True}}}, {"id1": FIL})
    c = cfg["chauffages"]["id1"]
    assert c["planning"] is True and c["entite"] == FIL["entite"] and c["famille"] == "fil_pilote"
    assert c["semaine"] == cc.semaine_type(), "au premier allumage, la semaine type"
    with pytest.raises(ValueError) as refus:
        cc.poser_patch(cfg, {"chauffages": {"fantome": {"planning": True}}}, {"id1": FIL})
    assert refus.value.code == "chauffage_inconnu" and str(refus.value).endswith(": fantome")
    # Un chauffage disparu garde son planning, et se modifie encore.
    cc.poser_patch(cfg, {"chauffages": {"id1": {"fenetre": "rien"}}}, {})
    assert cfg["chauffages"]["id1"]["fenetre"] == "rien"
    cc.poser_patch(cfg, {"chauffages": {"id1": None}}, {})
    assert cfg["chauffages"] == {}


VTHERM_SANS_ECO = {"entite": "climate.salon", "famille": "vtherm", "permis": ["confort", "hors_gel", "arret"]}


def test_le_premier_allumage_pose_la_semaine_type_dans_les_modes_du_chauffage(cc):
    """Relecture de la tache 9 (plan 2) : la semaine type posee au premier
    `{planning: true}` d'un chauffage jamais regle se pose dans SES modes, le
    plus proche qu'il comprend sans etre plus chaud. Un VTherm sans prereglage
    `eco` recevait l'Eco de la semaine type, puis refusait chaque modification
    de sa semaine (`chauffage_mode_inconnu`), l'ecran renvoyant la semaine
    entiere."""
    cfg = cc.config_defaut()
    cc.poser_patch(cfg, {"chauffages": {"id1": {"planning": True}}}, {"id1": VTHERM_SANS_ECO})
    s = cfg["chauffages"]["id1"]["semaine"]
    assert s["lun"] == [{"h": "06:30", "mode": "confort"}, {"h": "08:30", "mode": "hors_gel"},
                        {"h": "18:00", "mode": "confort"}, {"h": "22:30", "mode": "hors_gel"}]
    assert s["sam"] == s["dim"] == [{"h": "08:00", "mode": "confort"}, {"h": "22:30", "mode": "hors_gel"}]
    # Ce qui est pose se renvoie sans refus : rien que le chauffage ne comprenne.
    assert cc.valider_semaine(s, VTHERM_SANS_ECO["permis"]) == s
    # Un premier reglage qui n'allume rien (la fenetre) pose la meme semaine.
    cfg = cc.config_defaut()
    sans_confort = {**VTHERM_SANS_ECO, "permis": ["eco", "hors_gel", "arret"]}
    cc.poser_patch(cfg, {"chauffages": {"id1": {"fenetre": "rien"}}}, {"id1": sans_confort})
    assert cfg["chauffages"]["id1"]["semaine"]["lun"] == [
        {"h": "06:30", "mode": "eco"}, {"h": "08:30", "mode": "eco"},
        {"h": "18:00", "mode": "eco"}, {"h": "22:30", "mode": "eco"}], "sans Confort : l'Eco, jamais plus chaud"
    # Temoins : un chauffage qui comprend le Confort et l'Eco recoit la semaine type telle quelle ;
    # sans `permis` (un chauffage que le serveur ne voit pas), elle reste telle quelle aussi.
    assert cc.chauffage_defaut("climate.poele", "thermostat",
                               ["confort", "confort_1", "confort_2", "eco", "hors_gel", "arret"])["semaine"] == cc.semaine_type()
    assert cc.chauffage_defaut("climate.poele", "thermostat")["semaine"] == cc.semaine_type()


def test_adapter_aux_modes_jamais_plus_chaud(cc):
    """Le jumeau de `adapterAuxModes` (src/chauffageplanning.js), sur la meme
    regle que tests/chauffageplanning.test.mjs : un mode compris reste ; sinon
    le plus proche compris SANS etre plus chaud ; a defaut, le plus froid
    compris. Les heures ne bougent pas."""
    froid = charger("chauffage_calcul").FROID
    tout = [{"h": "%02d:00" % (6 + 2 * i), "mode": m} for i, m in enumerate(froid)]
    vtherm = ["confort", "eco", "hors_gel", "arret"]
    assert [c["mode"] for c in cc.adapter_aux_modes(tout, vtherm)] == ["arret", "hors_gel", "eco", "eco", "eco", "confort"]
    assert cc.adapter_aux_modes([{"h": "23:00", "mode": "arret"}], ["confort", "confort_1", "confort_2", "eco", "hors_gel"]) == [
        {"h": "23:00", "mode": "hors_gel"}], "un thermostat sans Arret : le plus froid qu'il comprend"
    assert cc.adapter_aux_modes([{"h": "09:00", "mode": "tiede"}], vtherm) == [{"h": "09:00", "mode": "arret"}]
    assert cc.adapter_aux_modes(tout, None) == tout and cc.adapter_aux_modes(tout, []) == tout, "rien a quoi s'adapter"
    assert cc.adapter_aux_modes(None, vtherm) == [] and cc.adapter_aux_modes(["x", None], vtherm) == []
    for masque in range(1, 64):
        modes = [m for i, m in enumerate(froid) if masque & (1 << i)]
        for avant, apres in zip(tout, cc.adapter_aux_modes(tout, modes)):
            rang = froid.index(avant["mode"])
            permis = [froid.index(m) for m in modes if froid.index(m) <= rang]
            attendu = froid[max(permis)] if permis else modes[0]
            assert apres == {"h": avant["h"], "mode": attendu}, (avant["mode"], modes)
    # Une semaine entiere : les sept jours, chacun adapte.
    semaine = cc.semaine_adaptee(cc.semaine_type(), VTHERM_SANS_ECO["permis"])
    assert list(semaine) == ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"]
    assert {c["mode"] for jour in semaine.values() for c in jour} == {"confort", "hors_gel"}


def test_le_patch_refuse_ce_que_le_chauffage_ne_comprend_pas(cc):
    cfg = cc.config_defaut()
    sans_eco = {**FIL, "permis": ["confort", "hors_gel", "arret"]}
    with pytest.raises(ValueError) as refus:
        cc.poser_patch(cfg, {"chauffages": {"id1": {"fenetre": "eco"}}}, {"id1": sans_eco})
    assert refus.value.code == "chauffage_mode_inconnu" and str(refus.value).endswith(": fenetre")
    for mauvais in ({"chauffages": {"id1": {"entite": "select.autre"}}}, {"maison": {"mode": "ete"}},
                    {"simulation": True}, {"autre": 1}, {"chauffages": []}):
        with pytest.raises(ValueError):
            cc.poser_patch(cc.config_defaut(), mauvais, {"id1": FIL})
    cc.poser_patch(cfg, {"maison": {"absence": "confort_2"}, "simulation": {"actif": True}}, {})
    assert cfg["maison"]["absence"] == "confort_2" and cfg["simulation"] == {"actif": True}


def test_le_patch_refuse_une_semaine_vide_et_des_temperatures_en_desordre_sans_rien_ecrire(cc):
    cfg = cc.config_defaut()
    cc.poser_patch(cfg, {"chauffages": {"id1": {"planning": True}}}, {"id1": FIL})
    for champ, code, nomme in (({"semaine": {}}, "chauffage_semaine_vide", "semaine"),
                               ({"temperatures": {"eco": 21}}, "chauffage_temperatures_desordre",
                                "temperatures.eco")):
        with pytest.raises(ValueError) as refus:
            cc.poser_patch(cfg, {"chauffages": {"id1": champ}}, {"id1": FIL})
        assert getattr(refus.value, "code", None) == code
        assert str(refus.value).endswith(" : " + nomme), str(refus.value)
    c = cfg["chauffages"]["id1"]
    assert c["semaine"] == cc.semaine_type(), "la semaine d'avant est intacte"
    assert c["temperatures"] == {"confort": 20.0, "eco": 17.0, "hors_gel": 7.0}


def test_le_mode_de_la_maison_et_la_fin_des_vacances(cc):
    cfg = cc.config_defaut()
    fin = (MAINTENANT + timedelta(days=5)).isoformat()
    cc.poser_maison(cfg, "vacances", fin, MAINTENANT)
    assert cfg["maison"]["mode"] == "vacances" and cfg["maison"]["vacances_fin"] == fin
    cc.poser_maison(cfg, "planning", None, MAINTENANT)
    assert cfg["maison"]["vacances_fin"] is None
    for mode, fin_mauvaise in (("vacances", "demain"), ("vacances", MAINTENANT.isoformat()),
                               ("absence", fin), ("vacances", "2026-10-20T10:00:00")):
        with pytest.raises(ValueError) as refus:
            cc.poser_maison(cfg, mode, fin_mauvaise, MAINTENANT)
        assert refus.value.code == "chauffage_date_illisible"
    with pytest.raises(ValueError):
        cc.poser_maison(cfg, "hiver", None, MAINTENANT)


def test_une_reprise_echue_pendant_la_coupure_est_abandonnee(cc):
    avant = MAINTENANT - timedelta(minutes=5)
    apres = MAINTENANT + timedelta(hours=2)
    lues = cc.lire_reprises({
        "id1": {"mode": "confort", "temperature": None, "fin": apres.isoformat(), "depuis": avant.isoformat(), "par": "u1"},
        "id2": {"mode": "eco", "fin": avant.isoformat()},
        "id3": {"mode": "hors_gel", "fin": None},
        "id4": {"mode": "confort", "fin": "pas une date"},
        "id5": "rien",
    }, MAINTENANT)
    assert sorted(lues) == ["id1", "id3"]
    assert lues["id1"]["fin"] == apres.isoformat() and lues["id1"]["par"] == "u1"
    assert lues["id3"]["fin"] is None, "jusqu'a relance"
    r = cc.nouvelle_reprise("confort", None, apres, MAINTENANT, "u2")
    # ASSERTION MODIFIÉE (19/10) : `programme`, un thermostat revenu à son programme.
    assert r == {"mode": "confort", "temperature": None, "fin": apres.isoformat(),
                 "depuis": MAINTENANT.isoformat(), "par": "u2", "programme": False}


def test_un_instant_sans_fuseau_ne_dit_pas_quand_il_tombe(cc):
    assert cc.lire_instant("2026-10-12T08:00:00+02:00") is not None
    assert cc.lire_instant("2026-10-12T06:00:00Z") == datetime(2026, 10, 12, 6, tzinfo=timezone.utc)
    for mauvais in ("2026-10-12T08:00:00", "", None, "demain", 12):
        assert cc.lire_instant(mauvais) is None
