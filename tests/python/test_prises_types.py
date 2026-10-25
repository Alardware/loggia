"""Le type d'une prise, et ce qu'est une prise (chantier Prises, spec 6.2 et 6.4) - en deux langues.

`tests/fixtures/prises_parite.json` est lue ici ET par les tests de l'ecran :
`types` rejoue `typeDePrise` de src/prises.js, `prises` le jumeau de la regle
« est une prise ». Le serveur suit le cycle des prises qu'il reconnait comme
de l'electromenager ; l'ecran dessine les cartes des prises qu'il reconnait.
S'ils divergeaient, une carte dirait « Terminé à 16:14 » d'un cycle que le
serveur n'a jamais suivi, ou se tairait sur un cycle qu'il a vu.
"""
from __future__ import annotations

import json
import re

import pytest

from conftest import RACINE, charger

PARITE = json.loads((RACINE / "tests" / "fixtures" / "prises_parite.json").read_text(encoding="utf-8"))
ECRAN = (RACINE / "src" / "prises.js").read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def types():
    return charger("prises_types")


def test_la_fixture_a_ses_cas():
    assert len(PARITE["types"]) >= 20 and len(PARITE["prises"]) >= 15, "la fixture a perdu des cas"
    cas = [c["cas"] for c in PARITE["prises"]]
    assert len(cas) == len(set(cas)), "deux cas portent le meme nom"
    for c in PARITE["prises"]:
        assert set(c) - {"compteurs"} == {"cas", "entite", "appareil", "soeurs", "lumiere", "fil_pilote", "sirene",
                                          "attendu"}, c["cas"]
        assert set(c["attendu"]) == {"prise", "puissance", "energie"}, c["cas"]
    for c in PARITE["types"]:
        assert set(c) == {"nom", "indice", "impose", "attendu"}, c
    assert PARITE["compteurs"] and all(set(c) == {"cas", "prefs", "attendu"} for c in PARITE["compteurs"])


@pytest.mark.parametrize("cas", PARITE["types"], ids=lambda c: "%s|%s" % (c["nom"], c["impose"]))
def test_chaque_type(types, cas):
    assert types.type_de_prise(cas["nom"], cas["impose"], cas["indice"]) == cas["attendu"]


@pytest.mark.parametrize("cas", PARITE["prises"], ids=lambda c: c["cas"])
def test_chaque_prise(types, cas):
    lu = types.est_prise(cas["entite"], cas["appareil"], cas["soeurs"], cas["lumiere"], cas["fil_pilote"],
                         cas["sirene"], cas.get("compteurs"))
    assert lu == cas["attendu"]


@pytest.mark.parametrize("cas", PARITE["compteurs"], ids=lambda c: c["cas"])
def test_les_compteurs_de_la_maison(types, cas):
    """Les capteurs que le tableau de bord Energie declare sources (reseau,
    solaire, batterie, gaz) : leur appareil n'a pas de prise (decision du 19/10)."""
    assert types.compteurs_maison(cas["prefs"]) == cas["attendu"]


# ── Les deux tables : celles de l'ecran, lues dans son texte ────────────────

def mots_de_l_ecran() -> tuple:
    """`MOTS_PRISE` de src/prises.js, lue dans le TEXTE : la table n'est pas
    exportee (tests/exports_sans_client.test.mjs refuse un export que rien
    n'importe), et ce test doit voir ce que l'ecran ecrit, pas une copie."""
    debut = ECRAN.index("MOTS_PRISE = [")
    bloc = ECRAN[debut:ECRAN.index("\n];", debut)]
    entrees = re.findall(r"\[\s*'(\w+)'\s*,\s*\[([^\]]*)\]\s*\]", bloc)
    return tuple((t, tuple(re.findall(r"'((?:[^'\\]|\\.)*)'", mots))) for t, mots in entrees)


def types_de_l_ecran() -> tuple:
    """Les cles de `TYPES_PRISE`, dans l'ordre ou l'ecran les ecrit."""
    debut = ECRAN.index("TYPES_PRISE = {")
    bloc = ECRAN[debut:ECRAN.index("\n};", debut)]
    return tuple(re.findall(r"^  (\w+): \{", bloc, re.M))


def test_la_lecture_de_l_ecran_trouve_ses_tables():
    """Sans ce garde-fou, une lecture cassee rendrait la comparaison vide - et verte."""
    mots = dict(mots_de_l_ecran())
    assert len(mots) == 14 and "zmywarka" in mots["lv"] and "stacja ladowania" in mots["ve"]
    assert mots_de_l_ecran()[0][0] == "prise", "les faux amis se lisent avant tout le reste"
    assert len(types_de_l_ecran()) == 14 and types_de_l_ecran()[-1] == "prise"
    assert len(reglages_de_l_ecran()) > 20 and "led" in reglages_de_l_ecran()


def test_les_mots_sont_ceux_de_l_ecran(types):
    """La table recopiee TELLE QUELLE, ordre compris - mots polonais de Seba882
    compris. Un mot ajoute d'un seul cote rougit ici."""
    assert types.MOTS_PRISE == mots_de_l_ecran()


def test_les_types_sont_ceux_de_l_ecran(types):
    assert types.TYPES == types_de_l_ecran()


def reglages_de_l_ecran() -> tuple:
    """`MOTS_REGLAGE` de src/prises.js, une chaine coupee sur « | »."""
    debut = ECRAN.index("const MOTS_REGLAGE = '") + len("const MOTS_REGLAGE = '")
    return tuple(ECRAN[debut:ECRAN.index("'.split('|')", debut)].split("|"))


def test_les_reglages_sont_ceux_de_l_ecran(types):
    assert types.MOTS_REGLAGE == reglages_de_l_ecran()


def test_les_mots_polonais_de_seba882_sont_intacts(types):
    """REGLE DURE : on ajoute, on ne reecrit jamais un mot polonais de Seba882 (PR #14)."""
    mots = dict(types.MOTS_PRISE)
    seba = {"lv": ("zmywarka",), "sl": ("suszarka",), "ll": ("pralka",), "fer": ("zelazko",),
            "frigo": ("lodowka", "zamrazarka", "chlodziarka"), "cafe": ("ekspres",), "ve": ("stacja ladowania",),
            "nas": ("serwer",), "pc": ("komputer",), "tv": ("telewizor",),
            "radia": ("grzejnik", "kaloryfer", "ogrzewanie"), "siren": ("syrena",)}
    for type_, polonais in seba.items():
        assert all(m in mots[type_] for m in polonais), type_
    assert mots["sl"].index("suszarka") < 5 and list(mots).index("sl") < list(mots).index("ll"), "suszarka avant pralka"


# ── Les regles, ecrites a la main (la fixture ne s'evalue pas elle-meme) ────

def test_le_poele_n_emprunte_pas_la_puissance_de_la_maison(types):
    """Son appareil porte tous les capteurs d'energie de la maison : aucun nom
    ne partage un mot avec « Poele », il n'en prend aucun."""
    soeurs = [{"entity_id": "sensor.energie_puissance_kw", "device_class": "power", "nom": "Energie puissance kW"},
              {"entity_id": "sensor.solaire_production_totale", "device_class": "power",
               "nom": "Solaire production totale"}]
    poele = {"entity_id": "switch.poele", "nom": "Poêle"}
    assert types.capteur("power", poele, soeurs) is None
    assert types.capteur("power", poele, soeurs[:1]) == "sensor.energie_puissance_kw", "un seul capteur : lui"
    assert types.capteur("power", None, soeurs) is None


def test_la_multiprise_ne_donne_pas_son_compteur_commun(types):
    """Audit du 19/10 : Home Assistant prefixe chaque entite du nom de l'appareil ;
    ce mot-la ne fait plus gagner le compteur commun a une sortie."""
    sortie = lambda n: {"entity_id": f"switch.multi_{n}", "nom": f"Multiprise sortie {n}"}
    total = {"entity_id": "sensor.multi_power", "device_class": "power", "nom": "Multiprise puissance"}
    assert types.capteur("power", sortie(1), [sortie(2), total]) is None
    assert types.est_prise(sortie(1), None, [sortie(2), total], False, False, False) == {
        "prise": True, "puissance": None, "energie": None}, "l'appareil mesure : ses sorties sont des prises"
    canal = {"entity_id": "sensor.multi_1_power", "device_class": "power", "nom": "Multiprise puissance 1"}
    assert types.capteur("power", sortie(1), [sortie(2), total, canal]) == "sensor.multi_1_power"
    assert types.capteur("power", sortie(2), [sortie(1), total, canal]) is None
    assert types.capteur("power", sortie(1), [sortie(2), total], "Multiprise") is None


def test_un_reglage_sans_categorie_n_est_pas_une_sortie(types):
    relais = {"entity_id": "switch.athom_plug_relay", "nom": "Athom Plug Relay"}
    led = {"entity_id": "switch.athom_plug_led", "nom": "Athom Plug LED"}
    puissance = {"entity_id": "sensor.athom_plug_power", "device_class": "power", "nom": "Athom Plug Power"}
    assert types.est_prise(led, None, [relais, puissance], False, False, False)["prise"] is False
    assert types.est_prise(relais, None, [led, puissance], False, False, False)["puissance"] == "sensor.athom_plug_power"
    seule = {"entity_id": "switch.bandeau_led", "nom": "Bandeau LED"}
    assert types.est_prise(seule, None, [puissance], False, False, False)["prise"], "seule sur son appareil : une prise"
    for nom in ("Kindersicherung", "Blocco bambini", "Bloqueo infantil", "Kinderslot", "Blokada rodzicielska",
                "Child lock", "Verrou enfant", "Indicator light"):
        assert types._reglage({"entity_id": "switch.x", "nom": nom}), nom
    assert not types._reglage({"entity_id": "switch.x", "nom": "Chambre enfant"}), "un enfant n'est pas un verrou"


def test_les_mots_se_comptent_sans_accents_ni_casse(types):
    soeurs = [{"entity_id": "sensor.a", "device_class": "power", "nom": "Compteur general"},
              {"entity_id": "sensor.b", "device_class": "power", "nom": "PRISE SÉJOUR puissance"}]
    assert types.capteur("power", {"entity_id": "switch.prise_sejour", "nom": "Prise séjour"}, soeurs) == "sensor.b"


def test_la_sirene_se_lit_comme_a_l_ecran(types):
    assert types.est_sirene("switch.alarme_sirene_siren_on", "Alarme")
    assert types.est_sirene("switch.prise_3", "Sirène extérieure"), "le nom compte, accents a plat"
    assert not types.est_sirene("switch.prise_nas", "Prise NAS")
    assert not types.est_sirene(None, None)
    # Les mots du type `siren` de MOTS_PRISE, entiers (audit du 19/10).
    assert types.est_sirene("switch.prise_3", "Alarme sonore garage")
    assert types.est_sirene("switch.syrena_ogrod", "Ogród")
    assert types.est_sirene("switch.x", "Sirena giardino")
    assert not types.est_sirene("switch.alarme", "Alarme"), "une alarme seule n'est pas une sirene"
    assert types.MOTS_SIRENE == dict(types.MOTS_PRISE)["siren"]


def test_les_mots_de_la_sirene_sont_ceux_de_l_ecran(types):
    """`estSirene` (src/attention.js) recopie les mots du type `siren` : ce module
    n'importe que i18n. Les trois listes disent la meme chose."""
    texte = (RACINE / "src" / "attention.js").read_text(encoding="utf-8")
    debut = texte.index("const MOTS_SIRENE = [")
    bloc = texte[debut:texte.index("];", debut)]
    assert tuple(re.findall(r"'([^']*)'", bloc)) == types.MOTS_SIRENE


def test_le_pont_est_un_appareil_exact(types):
    assert types.est_pont({"fabricant": "Zigbee2MQTT", "modele": "Bridge"})
    assert not types.est_pont({"fabricant": "Zigbee2MQTT", "modele": "Group"})
    assert not types.est_pont({"fabricant": "zigbee2mqtt", "modele": "bridge"}), "la graphie de Zigbee2MQTT, exacte"
    assert not types.est_pont(None)


def test_aplati_suit_l_ecran(types):
    assert types.aplati("Chłodziarka ŁÓDŹ") == "chlodziarka lodz"
    assert types.en_mots("Prise lave-vaisselle (cuisine)") == " prise lave vaisselle cuisine "
    assert types.aplati(None) == "" and types.aplati(0) == ""


def test_rien_ne_leve_sur_une_entree_abimee(types):
    rien = {"prise": False, "puissance": None, "energie": None}
    for entite in (None, [], "switch.x", {"entity_id": 5}, {"entity_id": None}):
        assert types.est_prise(entite, None, None, False, False, False) == rien
    lu = types.est_prise({"entity_id": "switch.x", "nom": "x"}, "pas un appareil", "pas une liste",
                         False, False, False)
    assert lu == rien
    assert types.type_de_prise(None, None, None) == "prise"
