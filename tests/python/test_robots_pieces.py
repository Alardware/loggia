"""TEST AJOUTE (chantier IoT, tranche robots 2, 19/10 ; conception R1 a R11, ses choix Q1 A, Q2 A, Q3 A) — les pieces d'un robot,
telles que Home Assistant les sait, sans rien configurer : `robots_pieces.py`, pur (ni Home Assistant, ni l'heure).

Ce qui est garanti :
  - la version de Home Assistant se lit (« 2026.10.1 ») et se compare a 2026.3, la version de `vacuum.clean_area` et de
    deebot-client 18 ; inconnue, elle vaut « recente » (le seul cas : un stub de test) ;
  - les pieces que le robot PUBLIE (`rooms` d'Ecovacs) deviennent des segments nommes, ranges par numero ; vides, rien (Q2 : un
    `rooms` intermittent ne fabrique aucune puce) ;
  - R4 : `commande_pieces` envoie une LISTE a `spot_area` sur HA >= 2026.3 (deebot-client 18), une chaine avant ; Q2 A : un
    Ecovacs qui publie `rooms` SANS le bit CLEAN_AREA part par la commande de ses scripts, `clean_V2` / `freeClean`, le nombre de
    passages en tete — l'exception NOMMEE, bornee a cette plateforme, a ce bit absent et a un `rooms` publie ; Roborock, Dreame et
    Xiaomi ne changent pas (R1 bornee a ce qui est verifie : le bit conditionne `clean_area` partout et `spot_area` chez Ecovacs) ;
  - R2 : l'ordre des sources — scripts, zones de Home Assistant, pieces publiees — et `aucune` ;
  - R3, R6, R11, R13 : les zones viennent de l'association du registre (`area_mapping`), nommees et rangees par le registre des
    zones (etage puis nom) ; une zone supprimee du registre n'est pas une puce ; une zone sans segment non plus ; les zones dont
    TOUS les segments sont sur une autre carte que la carte active sont comptees a part (`autres_cartes`) — « une autre carte »
    se prouve : le groupe du segment (ou son prefixe) est une AUTRE option de la soeur `select` de carte, dont l'etat est le NOM
    de la carte chez Ecovacs comme chez Roborock (passe bis du 20/10, point 1) ;
  - sa decision du 20/10 : un script de DEPART designe (`scripts` : "pieces", "depart") donne la source `scripts` — Loggia ne prend
    jamais la main sur les pieces derriere lui — et `script_pieces` dit si les puces peuvent etre ses interrupteurs ;
  - R9 : la reparation de Home Assistant pose `carte_changee` ;
  - R4, R5 : `verifier_zones` dit AVANT l'appel ce que Home Assistant refuserait apres — le bit, l'association, une zone sans
    piece, une autre carte ; Q2 : `segments_perimes` refuse une liste que le robot ne publie plus (Ecovacs seulement) ;
  - `clean_V2` ne s'ecrit QUE dans ce module cote serveur (et dans `robotsfiche.js` cote ecran) : l'exception a un seul endroit.
"""
from __future__ import annotations

from pathlib import Path

import pytest

from conftest import charger

RACINE = Path(__file__).resolve().parents[2]


@pytest.fixture
def module():
    return charger("robots_pieces")


ROOMS = {"salon": 1, "salle_de_bain": 10, "chambre": [3, 4], "cave": "x"}
ASSOCIATION = {"cuisine": ["m1_10"], "salon": ["m1_11", "m1_12"], "grenier": ["m1_20"], "etage": ["m2_30", "m2_31"], "vide": []}
SEGMENTS_VUS = [{"id": "m1_10", "name": "Cuisine", "group": "Maison"}, {"id": "m1_11", "name": "Salon", "group": "Maison"},
                {"id": "m1_12", "name": "Salle à manger", "group": "Maison"}, {"id": "m1_20", "name": "Grenier", "group": "Maison"},
                {"id": "m2_30", "name": "Chambre", "group": "Étage"}, {"id": "m2_31", "name": "Bureau", "group": "Étage"}]
OPTIONS = {"area_mapping": ASSOCIATION, "last_seen_segments": SEGMENTS_VUS}
REGISTRE = {"cuisine": {"nom": "Cuisine", "etage": "rdc", "niveau": 0}, "salon": {"nom": "Salon", "etage": "rdc", "niveau": 0},
            "etage": {"nom": "Étage", "etage": "haut", "niveau": 1}, "vide": {"nom": "Vide", "etage": None, "niveau": None}}
BIT = 16384


def test_la_version_de_home_assistant_se_lit_et_se_compare_a_2026_3(module):
    assert module.lire_version("2026.10.1") == (2026, 10)
    assert module.lire_version("2026.3.0b2") == (2026, 3)
    assert module.lire_version("x") is None and module.lire_version(None) is None
    assert module.version_recente((2026, 3)) is True and module.version_recente((2026, 10)) is True
    assert module.version_recente((2026, 2)) is False and module.version_recente((2025, 12)) is False
    assert module.version_recente(None) is True, "inconnue (un stub) : le monde d'aujourd'hui"


def test_les_pieces_publiees_deviennent_des_segments_nommes_ranges_par_numero(module):
    assert module.segments_publies({"rooms": ROOMS}) == [
        {"id": "seg:1", "nom": "Salon", "slug": "salon", "segments": [1]},
        {"id": "seg:3-4", "nom": "Chambre", "slug": "chambre", "segments": [3, 4]},
        {"id": "seg:10", "nom": "Salle de bain", "slug": "salle_de_bain", "segments": [10]},
    ], "une cle a plusieurs segments est une entree, comme a l'ecran ; une valeur qui n'est pas un nombre s'ecarte"
    for vide in ({"rooms": {}}, {"rooms": None}, {"rooms": "salon"}, {}, None):
        assert module.segments_publies(vide) == [], "un `rooms` intermittent ne fabrique aucune puce (Q2)"
    assert module.publie({"rooms": ROOMS}) is True and module.publie({"rooms": {}}) is False and module.publie(None) is False
    assert module.slug_en_nom("salle_de_bain") == "Salle de bain" and module.slug_en_nom("living-room") == "Living room"
    assert module.slug_en_nom("") == ""


def test_commande_pieces_spot_area_en_liste_sur_ha_recent_en_chaine_avant(module):
    # R4 : deebot-client 18 (HA >= 2026.3) attend une LISTE ; « 1,3 » y devenait « 1,,,3 ».
    assert module.commande_pieces("ecovacs", [1, 3], bits=BIT, version_ha=(2026, 10)) == (
        "vacuum", "send_command", {"command": "spot_area", "params": {"rooms": [1, 3], "cleanings": 1}})
    assert module.commande_pieces("ecovacs", [1, 3], bits=BIT, version_ha=None) == (
        "vacuum", "send_command", {"command": "spot_area", "params": {"rooms": [1, 3], "cleanings": 1}}), "version inconnue : la liste"
    assert module.commande_pieces("ecovacs", [1, 3], bits=BIT, version_ha=(2026, 2)) == (
        "vacuum", "send_command", {"command": "spot_area", "params": {"rooms": "1,3", "cleanings": 1}}), "avant 2026.3 : la chaine"
    assert module.commande_pieces("ecovacs", [1, 3], bits=0, version_ha=(2026, 2)) == (
        "vacuum", "send_command", {"command": "spot_area", "params": {"rooms": "1,3", "cleanings": 1}}), "avant 2026.3, pas de bit possible : la regle d'aujourd'hui"


def test_commande_pieces_l_exception_nommee_un_ecovacs_qui_publie_rooms_sans_le_bit(module):
    # Q2 A : la commande de ses scripts, lue dans son paquet — `clean_V2`, `freeClean`, « <passages>,<segment>,… ».
    assert module.commande_pieces("ecovacs", [1, 3], bits=0, version_ha=(2026, 10), publie=True) == (
        "vacuum", "send_command", {"command": "clean_V2", "params": {"act": "start", "content": {"type": "freeClean", "value": "1,1,3"}}})
    assert module.commande_pieces("ecovacs", [10], bits=0, version_ha=(2026, 10), publie=True, passages=2)[2]["params"]["content"]["value"] == "2,10", \
        "le PREMIER nombre est le nombre de passages"
    assert module.commande_pieces("ecovacs", [10], bits=0, version_ha=(2026, 10), publie=True, passages=0)[2]["params"]["content"]["value"] == "1,10", \
        "un compteur illisible vaut un passage"
    assert module.commande_pieces("ecovacs", [1, 3], bits=0, version_ha=(2026, 10), publie=False) is None, \
        "sans `rooms` publie, l'exception ne s'allume pas : jamais une commande devinee"
    assert module.commande_pieces("ecovacs", [1, 3], bits=BIT, version_ha=(2026, 10), publie=True)[2]["command"] == "spot_area", \
        "avec le bit, la commande de l'integration, pas l'exception"


def test_commande_pieces_les_autres_integrations_ne_changent_pas(module):
    assert module.commande_pieces("roborock", [16, 17]) == ("vacuum", "send_command", {"command": "app_segment_clean", "params": [16, 17]})
    assert module.commande_pieces("roborock", [16, 17], bits=0, version_ha=(2026, 10)) is not None, "R1 bornee : le bit ne conditionne pas app_segment_clean"
    assert module.commande_pieces("dreame_vacuum", [2]) == ("dreame_vacuum", "vacuum_clean_segment", {"segments": [2]})
    assert module.commande_pieces("xiaomi_miio", [2]) == ("xiaomi_miio", "vacuum_clean_segment", {"segments": [2]})
    assert module.commande_pieces("inconnue", [1]) is None and module.commande_pieces(None, [1]) is None
    assert module.commande_pieces("ecovacs", []) is None and module.commande_pieces("ecovacs", [True, "2"]) is None


def test_commande_zones_est_vacuum_clean_area(module):
    zones = [{"id": "zone:cuisine", "nom": "Cuisine", "zone": "cuisine"}, {"id": "zone:salon", "nom": "Salon", "zone": "salon"}]
    assert module.commande_zones(zones) == ("vacuum", "clean_area", {"cleaning_area_id": ["cuisine", "salon"]})
    assert module.commande_zones([]) is None and module.commande_zones([{"id": "seg:1", "nom": "Salon"}]) is None


def test_les_zones_viennent_de_l_association_nommees_et_rangees_par_le_registre(module):
    p = module.pieces_du_robot(BIT, {"rooms": ROOMS}, OPTIONS, REGISTRE, plateforme="ecovacs", version_ha=(2026, 10))
    # ASSERTION MODIFIEE (passe bis de la tranche robots 2, 20/10 ; point 11) : plus de `commande`, de `passages`, d'`etage` ni de
    # `noms_segments` dans l'etat — personne ne les lisait a l'ecran.
    assert (p["source"], p["capable"], p["association"], p["carte_changee"]) == ("zones", True, True, False)
    assert p["zones"] == [
        # Par etage (son niveau) puis par nom ; le grenier n'est plus dans le registre (R13) ; « vide » n'a pas de segment.
        {"id": "zone:cuisine", "nom": "Cuisine", "zone": "cuisine", "segments": ["m1_10"]},
        {"id": "zone:salon", "nom": "Salon", "zone": "salon", "segments": ["m1_11", "m1_12"]},
        {"id": "zone:etage", "nom": "Étage", "zone": "etage", "segments": ["m2_30", "m2_31"]},
    ]
    assert p["autres_cartes"] == [] and p["autres_zones"] == []
    # Les pieces publiees restent lisibles (la source 3 ne se montre pas : les zones gagnent).
    assert [s["id"] for s in p["segments"]] == ["seg:1", "seg:3-4", "seg:10"]
    # Sans niveau d'etage, les zones d'un etage se rangent apres celles qui en ont un, par le nom de l'etage puis le leur.
    registre = {"a": {"nom": "B", "etage": None, "niveau": None}, "b": {"nom": "A", "etage": "x", "niveau": None}, "c": {"nom": "C", "etage": "y", "niveau": 2}}
    p = module.pieces_du_robot(BIT, {}, {"area_mapping": {"a": ["1"], "b": ["2"], "c": ["3"]}}, registre, plateforme="roborock", version_ha=(2026, 10))
    assert [z["zone"] for z in p["zones"]] == ["c", "b", "a"]


def test_les_zones_d_une_autre_carte_ne_sont_pas_des_puces_par_prefixe_ou_par_groupe(module):
    # ASSERTION MODIFIEE (passe bis de la tranche robots 2, 20/10 ; point 1) : une zone n'est « sur une autre carte » que si son
    # groupe ou son prefixe est une AUTRE option de la soeur `select` (`cartes`) — pas des que son groupe differe de l'etat.
    # Ecovacs : l'etat de `active_map` est le NOM de la carte (ecovacs/select.py, dev), le groupe des segments.
    p = module.pieces_du_robot(BIT, {}, OPTIONS, REGISTRE, carte_active="Maison", cartes=["Maison", "Étage"], plateforme="ecovacs", version_ha=(2026, 10))
    assert [z["zone"] for z in p["zones"]] == ["cuisine", "salon"] and p["autres_cartes"] == [{"carte": "Étage", "n": 1}]
    # Roborock : l'etat de `selected_map` est le nom de la carte aussi (roborock/select.py : `name or f"Map {flag}"`).
    p = module.pieces_du_robot(BIT, {}, OPTIONS, REGISTRE, carte_active="Étage", cartes=["Maison", "Étage"], plateforme="roborock", version_ha=(2026, 10))
    assert [z["zone"] for z in p["zones"]] == ["etage"] and p["autres_cartes"] == [{"carte": "Maison", "n": 2}]
    # Un `select` dont l'etat serait l'identifiant de carte : le prefixe des segments repond, s'il est une autre option.
    p = module.pieces_du_robot(BIT, {}, OPTIONS, REGISTRE, carte_active="m1", cartes=["m1", "m2"], plateforme="ecovacs", version_ha=(2026, 10))
    assert [z["zone"] for z in p["zones"]] == ["cuisine", "salon"] and p["autres_cartes"] == [{"carte": "Étage", "n": 1}], "la carte se nomme par son groupe"
    # Sans soeur de carte reconnue : toutes les zones sont des puces.
    p = module.pieces_du_robot(BIT, {}, OPTIONS, REGISTRE, carte_active=None, plateforme="ecovacs", version_ha=(2026, 10))
    assert len(p["zones"]) == 3 and p["autres_cartes"] == []
    # Une zone a cheval sur deux cartes reste une puce : Home Assistant nettoie ce qui est sur la carte active.
    options = {"area_mapping": {"salon": ["m1_11", "m2_30"]}, "last_seen_segments": SEGMENTS_VUS}
    p = module.pieces_du_robot(BIT, {}, options, REGISTRE, carte_active="Maison", cartes=["Maison", "Étage"], plateforme="ecovacs", version_ha=(2026, 10))
    assert [z["zone"] for z in p["zones"]] == ["salon"] and p["autres_cartes"] == []
    # Un segment dont le groupe est inconnu (pas de `last_seen_segments`) se nomme par son prefixe de carte — quand ce prefixe
    # est une autre option du `select` ; sinon rien ne dit qu'il est ailleurs : il est sur la carte active.
    options = {"area_mapping": {"salon": ["m9_1"]}}
    p = module.pieces_du_robot(BIT, {}, options, REGISTRE, carte_active="m1", cartes=["m1", "m9"], plateforme="ecovacs", version_ha=(2026, 10))
    assert p["zones"] == [] and p["autres_cartes"] == [{"carte": "m9", "n": 1}]
    p = module.pieces_du_robot(BIT, {}, options, REGISTRE, carte_active="m1", cartes=["m1", "m2"], plateforme="ecovacs", version_ha=(2026, 10))
    assert [z["zone"] for z in p["zones"]] == ["salon"] and p["autres_cartes"] == []


def test_une_zone_n_est_sur_une_autre_carte_que_si_sa_carte_est_une_autre_option_du_select(module):
    """TEST AJOUTE (passe bis de la tranche robots 2, 20/10 ; point 1 ; relecture qualite D2, D3) : « sur une autre carte » ne se
    declare pas sans preuve. Roborock V1 : segments « <drapeau>_<segment> », groupe vide quand la carte n'a pas de nom, et le
    `select` dit « Map 0 » — tout est sur la carte active. Ecovacs a carte renommee dans l'application : `last_seen_segments` garde
    l'ancien nom (« Maison ») tant que l'association n'est pas reenregistree, et le `select` dit le nouveau (« Rez ») — une seule
    option : rien n'est ailleurs."""
    z = lambda zone: {"id": "zone:" + zone, "nom": zone, "zone": zone}  # noqa: E731
    options = {"area_mapping": {"cuisine": ["0_16"], "salon": ["0_17"]},
               "last_seen_segments": [{"id": "0_16", "name": "Kitchen", "group": ""}, {"id": "0_17", "name": "Living", "group": ""}]}
    registre = {"cuisine": {"nom": "Cuisine", "etage": None, "niveau": None}, "salon": {"nom": "Salon", "etage": None, "niveau": None}}
    p = module.pieces_du_robot(BIT, {}, options, registre, carte_active="Map 0", cartes=["Map 0"], plateforme="roborock", version_ha=(2026, 10))
    assert [x["zone"] for x in p["zones"]] == ["cuisine", "salon"] and p["autres_cartes"] == [], p
    assert module.verifier_zones([z("cuisine")], p) is None
    # Deux cartes chez Roborock, le groupe vide : le prefixe « 0 » n'est pas une option (« Map 0 » l'est) — rien d'ailleurs non plus.
    p = module.pieces_du_robot(BIT, {}, options, registre, carte_active="Map 1", cartes=["Map 0", "Map 1"], plateforme="roborock", version_ha=(2026, 10))
    assert len(p["zones"]) == 2 and p["autres_cartes"] == [], "sans preuve, la zone reste une puce ; l'integration dira ce qu'elle fait"
    options = {"area_mapping": {"cuisine": ["m1_10"]}, "last_seen_segments": [{"id": "m1_10", "name": "Cuisine", "group": "Maison"}]}
    p = module.pieces_du_robot(BIT, {}, options, {"cuisine": registre["cuisine"]}, carte_active="Rez", cartes=["Rez"], plateforme="ecovacs", version_ha=(2026, 10))
    assert [x["zone"] for x in p["zones"]] == ["cuisine"] and p["autres_cartes"] == [], p
    # Sans la liste des options (une soeur sans attribut `options`) : rien ne prouve une autre carte.
    p = module.pieces_du_robot(BIT, {}, options, {"cuisine": registre["cuisine"]}, carte_active="Rez", cartes=None, plateforme="ecovacs", version_ha=(2026, 10))
    assert [x["zone"] for x in p["zones"]] == ["cuisine"] and p["autres_cartes"] == []


def test_l_etat_ne_porte_que_ce_que_l_ecran_lit(module):
    """TEST AJOUTE (passe bis de la tranche robots 2, 20/10 ; point 11) : `etage`, `noms_segments`, `commande` et `passages` ne se
    lisaient nulle part a l'ecran — ils sortent de l'etat. Une zone : `{id, nom, zone, segments}` ; les pieces : `source`, `capable`,
    `association`, `carte_changee`, `zones`, `autres_cartes`, `autres_zones`, `segments`, `script_pieces`."""
    p = module.pieces_du_robot(BIT, {"rooms": ROOMS}, OPTIONS, REGISTRE, plateforme="ecovacs", version_ha=(2026, 10))
    # ASSERTION MODIFIEE (passe bis 2 du 20/10, relecture de controle) : `scripts`, les roles designes de ce robot — la roue de la
    # popup lit la verite du serveur, plus la description que l'ecran tient.
    assert sorted(p) == ["association", "autres_cartes", "autres_zones", "capable", "carte_changee", "script_pieces", "scripts", "segments", "source", "zones"]
    assert p["zones"][0] == {"id": "zone:cuisine", "nom": "Cuisine", "zone": "cuisine", "segments": ["m1_10"]}
    assert sorted(p["segments"][0]) == ["id", "nom", "segments", "slug"]
    assert p["scripts"] == {}
    designes = {"nettoyer_tout": "script.r_tout", "localiser": "script.r_ou"}
    p = module.pieces_du_robot(BIT, {"rooms": ROOMS}, OPTIONS, REGISTRE, designes=designes, plateforme="ecovacs", version_ha=(2026, 10))
    assert p["scripts"] == designes and p["scripts"] is not designes, "une copie : l'etat ne partage pas la description"
    assert module.pieces_du_robot(BIT, {}, OPTIONS, REGISTRE, designes="x", version_ha=(2026, 10))["scripts"] == {}, "illisible : aucun"


def test_un_script_de_depart_designe_la_source_le_dit_et_loggia_ne_prend_pas_la_main(module):
    """TEST AJOUTE (passe bis de la tranche robots 2, 20/10 ; sa decision « Mon script garde la main ») : `scripts` dit quel script de
    DEPART est designe — `"pieces"` (`pieces_selectionnees`), `"depart"` (`nettoyer_tout` seul), None (aucun). Des que l'un est
    designe, la source est `scripts` : ni zones de Home Assistant, ni exception, ni `spot_area` ; `script_pieces` dit si les puces
    peuvent etre ses interrupteurs. Les zones et les pieces publiees restent lisibles (la ligne « Vos scripts gardent la main »)."""
    for scripts, script_pieces in (("pieces", True), ("depart", False), (True, True)):
        p = module.pieces_du_robot(BIT, {"rooms": ROOMS}, OPTIONS, REGISTRE, scripts=scripts, plateforme="ecovacs", version_ha=(2026, 10))
        assert (p["source"], p["script_pieces"], len(p["zones"]), len(p["segments"])) == ("scripts", script_pieces, 3, 3), scripts
        # Sans association ni bit, `rooms` publie : l'exception ne s'allume pas derriere un script de depart.
        p = module.pieces_du_robot(0, {"rooms": ROOMS}, {}, REGISTRE, scripts=scripts, plateforme="ecovacs", version_ha=(2026, 10))
        assert (p["source"], p["script_pieces"]) == ("scripts", script_pieces), scripts
    for scripts in (None, False):
        p = module.pieces_du_robot(BIT, {"rooms": ROOMS}, OPTIONS, REGISTRE, scripts=scripts, plateforme="ecovacs", version_ha=(2026, 10))
        assert (p["source"], p["script_pieces"]) == ("zones", False)
    # `verifier_zones` : un depart par zones derriere un script de depart se refuse par son code — serveur et ecran, memes mots.
    p = module.pieces_du_robot(BIT, {}, OPTIONS, REGISTRE, scripts="depart", plateforme="ecovacs", version_ha=(2026, 10))
    assert module.verifier_zones([{"id": "zone:cuisine", "nom": "Cuisine", "zone": "cuisine"}], p) == "scripts_gardent_la_main"


def test_l_ordre_des_sources_scripts_zones_segments_aucune(module):
    # ASSERTION MODIFIEE (passe bis de la tranche robots 2, 20/10 ; point 11) : `commande` et `passages` ne sont plus dans l'etat.
    # Q1 A : ses scripts gardent la main tant qu'ils sont designes — les zones restent lisibles, pour que la ligne le dise.
    p = module.pieces_du_robot(BIT, {"rooms": ROOMS}, OPTIONS, REGISTRE, scripts=True, plateforme="ecovacs", version_ha=(2026, 10))
    assert p["source"] == "scripts" and len(p["zones"]) == 3
    # Le bit sans association : les pieces publiees, par `spot_area` (une liste).
    p = module.pieces_du_robot(BIT, {"rooms": ROOMS}, {}, REGISTRE, plateforme="ecovacs", version_ha=(2026, 10))
    assert (p["source"], p["capable"], p["association"], p["zones"]) == ("segments", True, False, [])
    # Sans bit, `rooms` publie : l'exception (Q2 A).
    p = module.pieces_du_robot(0, {"rooms": ROOMS}, {}, REGISTRE, plateforme="ecovacs", version_ha=(2026, 10))
    assert (p["source"], p["capable"], p["association"]) == ("segments", False, False)
    # Sans bit, `rooms` vide (son cas, un jour sans carte) : rien — ni puce, ni ligne.
    p = module.pieces_du_robot(0, {"rooms": {}}, {}, REGISTRE, plateforme="ecovacs", version_ha=(2026, 10))
    assert (p["source"], p["segments"]) == ("aucune", [])
    # Le bit, l'association, mais `rooms` vide : les zones gagnent quand meme.
    p = module.pieces_du_robot(BIT, {"rooms": {}}, OPTIONS, REGISTRE, plateforme="ecovacs", version_ha=(2026, 10))
    assert p["source"] == "zones"
    # Une autre integration sans bit : ses pieces configurees ne sont pas publiees ici — `aucune`, et la commande d'integration
    # reste a l'ecran (`vacuumRooms`, la regle d'aujourd'hui).
    p = module.pieces_du_robot(0, {}, {}, REGISTRE, plateforme="roborock", version_ha=(2026, 10))
    assert p["source"] == "aucune"
    # Avant 2026.3 : pas de bit possible, l'association n'existe pas ; les pieces publiees par la chaine.
    p = module.pieces_du_robot(BIT, {"rooms": ROOMS}, OPTIONS, REGISTRE, plateforme="ecovacs", version_ha=(2026, 2))
    assert (p["source"], p["capable"], p["association"], p["zones"]) == ("segments", False, False, [])
    # Des options illisibles ne cassent rien.
    p = module.pieces_du_robot(BIT, {"rooms": ROOMS}, {"area_mapping": "x", "last_seen_segments": 3}, None, plateforme="ecovacs")
    assert (p["source"], p["association"], p["zones"]) == ("segments", False, [])


def test_la_reparation_de_home_assistant_pose_carte_changee(module):
    p = module.pieces_du_robot(BIT, {}, OPTIONS, REGISTRE, reparation=True, plateforme="ecovacs", version_ha=(2026, 10))
    assert p["carte_changee"] is True and len(p["zones"]) == 3, "les puces restent : Home Assistant nettoie ce qui existe encore"


def test_verifier_zones_dit_avant_l_appel_ce_que_home_assistant_refuserait_apres(module):
    # ASSERTION MODIFIEE (passe bis de la tranche robots 2, 20/10 ; point 1) : la carte active se dit par son nom, et ses options.
    pieces = module.pieces_du_robot(BIT, {}, OPTIONS, REGISTRE, carte_active="Maison", cartes=["Maison", "Étage"], plateforme="ecovacs", version_ha=(2026, 10))
    z = lambda zone: {"id": "zone:" + zone, "nom": zone, "zone": zone}  # noqa: E731
    assert module.verifier_zones([z("cuisine"), z("salon")], pieces) is None
    assert module.verifier_zones([z("cuisine"), z("vide")], pieces) == "zone_sans_piece", "une zone sans segment retient tout le depart"
    assert module.verifier_zones([z("cuisine"), z("grenier")], pieces) == "zone_sans_piece", "une zone qui n'est plus au registre non plus"
    assert module.verifier_zones([z("etage")], pieces) == "autre_carte"
    assert module.verifier_zones([z("cuisine"), z("etage")], pieces) == "autre_carte", "une zone entierement sur une autre carte retient le depart"
    sans = module.pieces_du_robot(BIT, {}, {}, REGISTRE, plateforme="ecovacs", version_ha=(2026, 10))
    assert module.verifier_zones([z("cuisine")], sans) == "association_absente"
    muet = module.pieces_du_robot(0, {}, OPTIONS, REGISTRE, plateforme="ecovacs", version_ha=(2026, 10))
    assert module.verifier_zones([z("cuisine")], muet) == "pieces_inconnues", "sans le bit, Home Assistant refuse clean_area"
    assert module.verifier_zones([], pieces) is None


def test_segments_perimes_chez_ecovacs_la_liste_du_robot_fait_foi(module):
    assert module.segments_perimes([1, 3], {"rooms": ROOMS}, "ecovacs") is False
    assert module.segments_perimes([1, 5], {"rooms": ROOMS}, "ecovacs") is True
    assert module.segments_perimes([1], {"rooms": {}}, "ecovacs") is True, "une liste vide a l'instant du depart : on ne part pas sur une liste perimee"
    assert module.segments_perimes([1], {}, "ecovacs") is True
    assert module.segments_perimes([1, 5], {"rooms": {}}, "roborock") is False, "ailleurs, le robot ne publie pas sa liste : la regle d'aujourd'hui"
    assert module.segments_perimes([], {"rooms": {}}, "ecovacs") is False


def test_clean_v2_ne_s_ecrit_qu_a_un_endroit_cote_serveur(module):
    """L'exception de Q2 A est NOMMEE et bornee : `clean_V2` n'apparait que dans `robots_pieces.py` cote serveur — jamais ailleurs
    dans le composant (cote ecran, `tests/robots_pieces.test.mjs` tient la meme promesse pour `robotsfiche.js`)."""
    serveur = [p.name for p in (RACINE / "custom_components" / "loggia").glob("*.py") if "clean_V2" in p.read_text(encoding="utf-8")]
    assert serveur == ["robots_pieces.py"], serveur
