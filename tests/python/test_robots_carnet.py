"""Le carnet des passages des robots, sans Home Assistant (chantier IoT, I3 A ; spec 9).

TEST AJOUTE (chantier IoT, tache 3, 18/10). Ce qui merite d'etre verrouille : une session s'ouvre quand le robot se met
au travail et prend les pieces, la source et le compte d'un depart demande dans les deux minutes — pas au-dela ; seul le
TRAVAIL se compte (la pause, le retour non) ; la base ferme « termine », une erreur « erreur » avec son motif, un arret
ailleurs « interrompu » ; moins d'une minute de travail est un faux depart ; la surface est le maximum publie ; un robot
muet ne ferme rien ; quatorze jours et deux cents passages au plus ; un fichier abime se relit propre ; l'ecran ne lit
que ce que le compte peut lire, et jamais qui a lance.
"""
from __future__ import annotations

import pytest

from conftest import charger

ASP, TOND, AUTRE = "vacuum.aspirateur", "lawn_mower.tondeuse", "vacuum.autre"
T0 = 1_800_000_000.0  # un instant quelconque, en secondes
ZONES = [{"id": "seg:1", "nom": "Salon", "segments": [1]}, {"id": "seg:2", "nom": "Cuisine", "segments": [2]}]


@pytest.fixture(scope="module")
def calc():
    return charger("robots_carnet")


def suite(calc, c, *pas):
    """Rejoue des phases : (instant relatif, robot, phase), dans l'ordre."""
    for dt, robot, ph in pas:
        c = calc.voir_phase(c, robot, ph, T0 + dt)
    return c


# ── Le carnet vide, et ce qui se relit ──────────────────────────────────────

def test_le_carnet_vide_et_un_fichier_illisible(calc):
    vide = {"version": 1, "passages": [], "en_cours": {}, "demandes": {}, "erreurs": {}}
    assert calc.carnet_vide() == vide
    for brut in (None, "rien", 3, [], {"passages": "x", "en_cours": [], "demandes": 2, "erreurs": None}):
        assert calc.lire_carnet(brut, T0) == vide


def test_un_fichier_abime_se_relit_propre(calc):
    bon = {"robot": ASP, "debut": T0 - 3600, "fin": T0 - 600, "duree_s": 2400, "issue": "termine",
           "zones": [{"id": "seg:1", "nom": "Salon"}], "tout": False, "source": "loggia", "par": "u1", "surface": 42, "motif": None}
    brut = {
        "passages": [bon, {**bon, "robot": "light.salon"}, {**bon, "issue": "fini"}, {**bon, "fin": "hier"},
                     {**bon, "zones": "Salon"}, "n'importe quoi", {**bon, "surface": -3}],
        "en_cours": {TOND: {"debut": T0 - 600, "depuis": T0 - 600, "phase": "travail", "travail_s": 0, "zones": [], "tout": True,
                            "source": "planning", "par": None, "surface": None, "motif": None},
                     "light.salon": {"debut": T0}, AUTRE: "rien"},
        "demandes": {ASP: {"t": T0 - 30, "zones": [{"id": "seg:1", "nom": "Salon"}], "tout": False, "source": "loggia", "par": "u1"},
                     AUTRE: {"t": "maintenant"}},
        "erreurs": {TOND: {"texte": "Pluie détectée", "t": T0 - 60}, ASP: {"texte": 7}},
    }
    c = calc.lire_carnet(brut, T0)
    # ASSERTION MODIFIEE (passe bis du 18/10, point A) : un passage garde aussi son `libelle` — le nom du script maison qui l'a
    # lance —, vide pour un passage d'avant.
    assert c["passages"] == [{**bon, "libelle": None}, {**bon, "zones": [], "libelle": None}, {**bon, "surface": None, "libelle": None}], \
        "sans robot, sans heures ou sans issue lisibles, le passage s'ecarte ; des zones ou une surface illisibles reprennent leur valeur vide"
    assert list(c["en_cours"]) == [TOND]
    assert list(c["demandes"]) == [ASP]
    # ASSERTION MODIFIEE (passe bis du 18/10, point 3) : l'erreur garde aussi l'heure que l'appareil lui donne (`date`), vide sans
    # capteur d'heure — une erreur datee d'avant un passage n'en est pas le motif.
    assert c["erreurs"] == {TOND: {"texte": "Pluie détectée", "t": T0 - 60, "date": None}}


# ── La session : s'ouvrir, compter le travail, se fermer ────────────────────

def test_un_depart_demande_dans_les_deux_minutes_donne_ses_pieces(calc):
    c = calc.noter_demande(calc.carnet_vide(), ASP, ZONES, tout=False, source="loggia", par="u1", quand=T0)
    # ASSERTION MODIFIEE (passe bis du 18/10, point A) : la demande porte aussi le `libelle` d'un script maison, vide ici.
    assert c["demandes"][ASP] == {"t": T0, "zones": [{"id": "seg:1", "nom": "Salon"}, {"id": "seg:2", "nom": "Cuisine"}],
                                  "tout": False, "source": "loggia", "par": "u1", "libelle": None}, "les segments ne se gardent pas : les noms et les puces suffisent"
    c = suite(calc, c, (calc.DEMANDE_S, ASP, "travail"))
    s = c["en_cours"][ASP]
    assert (s["zones"], s["tout"], s["source"], s["par"], s["debut"]) == (
        [{"id": "seg:1", "nom": "Salon"}, {"id": "seg:2", "nom": "Cuisine"}], False, "loggia", "u1", T0 + calc.DEMANDE_S)
    assert ASP not in c["demandes"], "une demande ne sert qu'une fois"


def test_une_demande_trop_vieille_ne_donne_rien(calc):
    c = calc.noter_demande(calc.carnet_vide(), ASP, ZONES, tout=False, source="loggia", par="u1", quand=T0)
    c = suite(calc, c, (calc.DEMANDE_S + 1, ASP, "travail"))
    s = c["en_cours"][ASP]
    assert (s["zones"], s["tout"], s["source"], s["par"]) == ([], False, "appareil", None), "un depart de l'application du fabricant : les pieces ne se savent pas"
    assert ASP not in c["demandes"]


def test_la_demande_d_un_robot_ne_sert_pas_l_autre(calc):
    c = calc.noter_demande(calc.carnet_vide(), ASP, [], tout=True, source="planning", par=None, quand=T0)
    c = suite(calc, c, (10, TOND, "travail"))
    assert c["en_cours"][TOND]["source"] == "appareil" and ASP in c["demandes"]


def test_seul_le_travail_se_compte_et_la_base_termine(calc):
    c = calc.noter_demande(calc.carnet_vide(), ASP, [], tout=True, source="loggia", par="u1", quand=T0)
    c = suite(calc, c, (0, ASP, "travail"), (600, ASP, "pause"), (900, ASP, "travail"), (2100, ASP, "retour"), (2280, ASP, "base"))
    assert c["en_cours"] == {}
    p = c["passages"][-1]
    assert (p["duree_s"], p["issue"], p["debut"], p["fin"], p["tout"]) == (1800, "termine", T0, T0 + 2280, True), \
        "dix minutes, puis vingt : la pause et le retour ne comptent pas"


@pytest.mark.parametrize("phase,issue", [("repos", "interrompu"), ("erreur", "erreur"), ("base", "termine")])
def test_l_issue_suit_la_phase_qui_ferme(calc, phase, issue):
    c = suite(calc, calc.carnet_vide(), (0, ASP, "travail"), (300, ASP, phase))
    assert c["passages"][-1]["issue"] == issue


def test_un_faux_depart_ne_se_garde_pas(calc):
    c = suite(calc, calc.carnet_vide(), (0, ASP, "travail"), (calc.FAUX_DEPART_S - 1, ASP, "base"))
    assert c["passages"] == [] and c["en_cours"] == {}


def test_un_robot_muet_ne_ferme_rien(calc):
    c = suite(calc, calc.carnet_vide(), (0, ASP, "travail"), (300, ASP, "absent"), (600, ASP, "travail"), (900, ASP, "base"))
    assert len(c["passages"]) == 1 and c["passages"][0]["duree_s"] == 900, "muet, il travaillait peut-etre : le temps se compte jusqu'au retour"


def test_une_pause_sans_session_n_en_ouvre_pas(calc):
    c = suite(calc, calc.carnet_vide(), (0, ASP, "pause"), (60, ASP, "retour"), (120, ASP, "base"))
    assert c == calc.carnet_vide()


def test_la_surface_est_le_maximum_et_le_motif_la_derniere_erreur(calc):
    c = suite(calc, calc.carnet_vide(), (0, TOND, "travail"))
    for v in (0, 35, "96", 80, "unknown", None, -4):
        c = calc.voir_surface(c, TOND, v)
    assert c["en_cours"][TOND]["surface"] == 96
    # ASSERTION MODIFIEE (passe bis du 18/10, point 3) : « unavailable » ne compte plus pour rien — ni une erreur, ni la fin d'une
    # erreur : `texte_erreur` le lit muet (None) ; et l'erreur garde son `date`, vide sans capteur d'heure.
    for texte in ("no_error", "Roue bloquée", "", None, "0", "Pluie détectée"):
        c = calc.voir_erreur(c, TOND, texte, T0 + 60)
    assert c["en_cours"][TOND]["motif"] == "Pluie détectée", "la derniere erreur publiee PENDANT le passage ; « no_error » n'en est pas une"
    assert c["erreurs"][TOND] == {"texte": "Pluie détectée", "t": T0 + 60, "date": None}
    c = suite(calc, c, (1200, TOND, "base"))
    assert (c["passages"][-1]["surface"], c["passages"][-1]["motif"]) == (96, "Pluie détectée")
    # Une erreur publiee hors session reste la derniere connue ; « tout va bien » l'efface.
    c = calc.voir_erreur(c, TOND, "Lame usée", T0 + 2000)
    assert c["erreurs"][TOND]["texte"] == "Lame usée" and c["passages"][-1]["motif"] == "Pluie détectée"
    c = calc.voir_erreur(c, TOND, "no_error", T0 + 2100)
    assert TOND not in c["erreurs"]
    # Hors session, une surface ne se garde pas.
    assert calc.voir_surface(c, TOND, 500) == c


def test_ce_que_dit_un_capteur_d_erreur(calc):
    """TEST AJOUTE (passe bis du 18/10, point 3) : le texte d'une erreur se lit au bon endroit, jamais un code nu. L'integration
    officielle Ecovacs publie un CODE en etat — 0, tout va bien — et son texte dans l'attribut `description` ; Mammotion (HACS),
    le texte en etat. Muet (`unavailable`, `unknown`) : il ne dit rien — None, ni une erreur ni la fin d'une erreur ; tout va bien :
    une chaine vide."""
    lire = calc.texte_erreur
    assert [lire(v) for v in ("unavailable", "unknown", None, " Unknown ")] == [None, None, None, None]
    assert [lire(v) for v in ("0", "no_error", "", "none", "NoError")] == ["", "", "", "", ""]
    assert lire("102", {"description": "Brosse principale bloquée"}) == "Brosse principale bloquée"
    assert lire("102", {}) is None and lire("102", {"description": "  "}) is None, "un code sans texte ne se montre pas"
    assert lire("0", {"description": "NoError: Robot is operational"}) == "", "le code 0 : tout va bien"
    assert lire("Roue bloquée") == "Roue bloquée"
    assert lire("x" * 300) == "x" * 120


def test_le_motif_d_un_passage(calc):
    """TEST AJOUTE (passe bis du 18/10, point 3) : le motif d'un passage, c'est une erreur NEUVE publiee pendant lui.
      * muet (None) : rien — ni une erreur, ni « plus d'erreur » ; une coupure Bluetooth ne fait pas revenir l'ancien texte en erreur
        neuve ;
      * on ne note qu'un texte DIFFERENT du dernier connu — une « derniere erreur » qui persiste n'est pas le motif de chaque passage ;
      * relue au demarrage de Home Assistant (`relue`), l'erreur devient la derniere connue, jamais le motif du passage en cours ;
      * datee par le capteur d'heure (`heure`) : une erreur d'avant le debut du passage n'en est pas le motif ; le meme texte a une
        heure neuve est une erreur neuve ;
      * publiee juste APRES que le robot s'est arrete (une minute au plus), elle est le motif du passage qu'il vient de clore."""
    c = calc.voir_erreur(calc.carnet_vide(), TOND, "Pluie détectée", T0 - 3600)
    c = suite(calc, c, (0, TOND, "travail"))
    for texte in (None, "unavailable", "Pluie détectée"):
        c = calc.voir_erreur(c, TOND, texte, T0 + 60)
    assert c["en_cours"][TOND]["motif"] is None, "le meme texte, revenu apres une coupure : pas une erreur neuve"
    assert c["erreurs"][TOND]["t"] == T0 - 3600, "la derniere connue ne bouge pas"
    c = calc.voir_erreur(c, TOND, "Lame bloquée", T0 + 120, relue=True)
    assert (c["en_cours"][TOND]["motif"], c["erreurs"][TOND]["texte"]) == (None, "Lame bloquée"), "relue au demarrage : la derniere connue, pas le motif"
    # Datee : d'avant le passage, pas son motif ; pendant, si.
    c = calc.voir_erreur(c, TOND, "Robot soulevé", T0 + 180, heure=T0 - 10)
    assert (c["en_cours"][TOND]["motif"], c["erreurs"][TOND]["date"]) == (None, T0 - 10)
    c = calc.voir_erreur(c, TOND, "Robot soulevé", T0 + 240, heure=T0 + 230)
    assert c["en_cours"][TOND]["motif"] == "Robot soulevé", "le meme texte, a une heure neuve : une erreur neuve"
    c2 = calc.voir_erreur(c, TOND, "Robot soulevé", T0 + 300, heure=T0 + 230)
    assert c2 is c, "la meme erreur, relue : rien ne change"
    # Juste apres l'arret : le motif du passage qu'il vient de clore.
    c = suite(calc, calc.carnet_vide(), (0, ASP, "travail"), (600, ASP, "erreur"))
    c = calc.voir_erreur(c, ASP, "Bloqué sous le canapé", T0 + 640)
    assert c["passages"][-1]["motif"] == "Bloqué sous le canapé"
    c = suite(calc, calc.carnet_vide(), (0, ASP, "travail"), (600, ASP, "erreur"))
    c = calc.voir_erreur(c, ASP, "Bloqué sous le canapé", T0 + 600 + calc.RETARD_MOTIF_S + 1)
    assert c["passages"][-1]["motif"] is None, "plus d'une minute apres : ce n'est plus le sien"
    c = suite(calc, calc.carnet_vide(), (0, ASP, "travail"), (600, ASP, "erreur"))
    c = calc.voir_erreur(c, ASP, "Bloqué sous le canapé", T0 + 640, relue=True)
    assert c["passages"][-1]["motif"] is None, "relue : jamais un motif"


def test_une_erreur_datee_dont_l_heure_manque_garde_sa_date(calc):
    """TEST AJOUTE (passe bis 2 du 18/10, point A) : une erreur que l'appareil DATE, relue sans son heure (le capteur d'heure muet, ou
    pas encore revenu apres une coupure), n'est pas une erreur neuve : le meme texte garde la date connue, et ne devient pas le motif
    du passage en cours. Un texte different, lui, est une erreur neuve — sans date, il est le motif."""
    c = calc.voir_erreur(calc.carnet_vide(), TOND, "Pluie détectée", T0 - 3600, heure=T0 - 3600, relue=True)
    c = suite(calc, c, (0, TOND, "travail"))
    c2 = calc.voir_erreur(c, TOND, "Pluie détectée", T0 + 60, heure=None)
    assert c2 is c, "le meme texte sans son heure : rien ne change"
    assert (c2["erreurs"][TOND]["date"], c2["en_cours"][TOND]["motif"]) == (T0 - 3600, None), "la date connue reste ; pas de motif"
    c3 = calc.voir_erreur(c, TOND, "Lame bloquée", T0 + 120, heure=None)
    assert (c3["en_cours"][TOND]["motif"], c3["erreurs"][TOND]["date"]) == ("Lame bloquée", None), "un texte different : une erreur neuve"


def test_une_coupure_de_home_assistant_ne_compte_pas_comme_du_travail(calc):
    """TEST AJOUTE (passe bis du 18/10, point 5) : Home Assistant s'arrete en plein passage (`voir_arret`) — la session note
    l'instant de la coupure, et son travail s'arrete la. Au retour, le temps de la coupure ne compte pas : un robot qui travaille
    encore reprend a l'instant ou il est revu ; un robot rentre pendant la coupure clot son passage a l'instant de la coupure — ce
    qu'on en sait ; un robot muet ne ferme rien, la coupure reste notee, et le disque la garde."""
    c = suite(calc, calc.carnet_vide(), (0, ASP, "travail"), (0, TOND, "travail"), (300, TOND, "pause"))
    c = calc.voir_arret(c, T0 + 600)
    s = c["en_cours"][ASP]
    assert (s["travail_s"], s["depuis"], s["coupure"]) == (600, T0 + 600, T0 + 600)
    assert (c["en_cours"][TOND]["travail_s"], c["en_cours"][TOND]["coupure"]) == (300, T0 + 600), "en pause : rien de plus a compter"
    # Une heure plus tard, il travaille encore : dix minutes avant la coupure, dix apres.
    r = calc.voir_phase(c, ASP, "travail", T0 + 4200)
    assert "coupure" not in r["en_cours"][ASP] or r["en_cours"][ASP]["coupure"] is None
    r = calc.voir_phase(r, ASP, "base", T0 + 4800)
    assert r["passages"][-1]["duree_s"] == 1200, "l'heure de la coupure ne compte pas"
    # Rentre pendant la coupure : clos a l'instant de la coupure.
    f = calc.voir_phase(c, ASP, "base", T0 + 4200)
    p = f["passages"][-1]
    assert (p["duree_s"], p["fin"], p["issue"]) == (600, T0 + 600, "termine")
    # La tondeuse, en pause a l'arret, retravaille au retour : le temps de la coupure ne compte pas non plus.
    t = calc.voir_phase(c, TOND, "travail", T0 + 4200)
    t = calc.voir_phase(t, TOND, "base", T0 + 4500)
    assert t["passages"][-1]["duree_s"] == 600
    # Muet au retour : rien ne se ferme, la coupure reste notee — et le disque la garde.
    m = calc.voir_phase(c, ASP, "absent", T0 + 4200)
    assert m["en_cours"][ASP]["coupure"] == T0 + 600
    assert calc.lire_carnet(c, T0 + 700)["en_cours"][ASP]["coupure"] == T0 + 600


def test_un_script_maison_donne_son_nom_au_passage(calc):
    """TEST AJOUTE (passe bis du 18/10, point A) : un depart par un script maison de l'aspirateur (`vacuumScripts`, Parametres)
    note le NOM du script (`libelle`) : l'Historique dit « Nettoyer la buanderie », la carte « Nettoie · Nettoyer la buanderie », au
    lieu de « Nettoyage ». Il se relit du disque, et un fichier d'avant n'en a pas.
    ASSERTION MODIFIEE (passe bis 2 du 18/10, point L) : l'exemple d'avant etait le nom d'un script de SON
    installation ; « Nettoyer la buanderie » n'existe pas chez lui (verifie contre la copie de son registre)."""
    c = calc.noter_demande(calc.carnet_vide(), ASP, [], tout=False, source="loggia", par="u1", quand=T0, libelle="Nettoyer la buanderie")
    c = suite(calc, c, (10, ASP, "travail"))
    assert calc.vue(c, T0 + 70)["en_cours"][ASP]["libelle"] == "Nettoyer la buanderie"
    c = suite(calc, c, (1210, ASP, "base"))
    p = c["passages"][-1]
    assert (p["libelle"], p["zones"], p["tout"]) == ("Nettoyer la buanderie", [], False)
    assert calc.vue(c, T0 + 1300)["passages"][0]["libelle"] == "Nettoyer la buanderie"
    assert calc.lire_carnet(c, T0 + 1300)["passages"][0]["libelle"] == "Nettoyer la buanderie"
    assert calc.noter_demande(calc.carnet_vide(), ASP, [], tout=False, source="loggia", par=None, quand=T0, libelle="x" * 200)["demandes"][ASP]["libelle"] == "x" * 120


def test_le_carnet_ne_change_pas_ce_qu_on_lui_donne(calc):
    c0 = calc.carnet_vide()
    c1 = calc.voir_phase(c0, ASP, "travail", T0)
    assert c0 == calc.carnet_vide() and c1 is not c0


# ── L'elagage : quatorze jours, deux cents passages ─────────────────────────

def test_l_elagage(calc):
    passage = lambda i, fin: {"robot": ASP, "debut": fin - 600, "fin": fin, "duree_s": 600, "issue": "termine", "zones": [], "tout": False,
                              "source": "appareil", "par": None, "surface": None, "motif": None}
    vieux = passage(0, T0 - calc.GARDE_S - 1)
    recent = [passage(i, T0 - 3600 * (i + 1)) for i in range(calc.MAX_PASSAGES + 5)]
    c = calc.carnet_vide()
    c["passages"] = [vieux] + list(reversed(recent))
    c["demandes"] = {ASP: {"t": T0 - calc.DEMANDE_S - 1, "zones": [], "tout": True, "source": "loggia", "par": None}}
    # Une session ouverte il y a plus d'un jour, en pause depuis : trente minutes de travail, puis plus rien.
    debut = T0 - calc.SESSION_MAX_S - 1
    c["en_cours"] = {TOND: {"debut": debut, "depuis": debut + 1800, "phase": "pause", "travail_s": 1800,
                            "zones": [], "tout": False, "source": "appareil", "par": None, "surface": None, "motif": None}}
    e = calc.elaguer(c, T0)
    assert len(e["passages"]) == calc.MAX_PASSAGES
    assert e["passages"][-1]["fin"] == T0 - 3600, "les plus recents restent, dans l'ordre du temps"
    assert all(p["fin"] >= T0 - calc.GARDE_S for p in e["passages"])
    assert e["demandes"] == {}, "une demande de plus de deux minutes ne sert plus"
    assert e["en_cours"] == {}, "une session que plus rien n'a fermee en un jour se clot"
    clos = [p for p in calc.elaguer({**c, "passages": []}, T0)["passages"]]
    assert [(p["robot"], p["issue"], p["fin"], p["duree_s"]) for p in clos] == [(TOND, "interrompu", debut + 1800, 1800)], \
        "close a sa derniere phase, avec le travail qu'on lui sait"


# ── Ce que l'ecran lit ──────────────────────────────────────────────────────

def test_la_vue_du_carnet(calc):
    c = calc.noter_demande(calc.carnet_vide(), ASP, ZONES, tout=False, source="loggia", par="u1", quand=T0)
    c = suite(calc, c, (0, ASP, "travail"), (3060, ASP, "base"), (4000, TOND, "travail"), (4600, TOND, "pause"))
    c = calc.voir_surface(c, TOND, 140)
    v = calc.vue(c, T0 + 5000)
    # ASSERTION MODIFIEE (passe bis du 18/10, point A) : un passage et la session en cours disent aussi le `libelle` d'un script
    # maison — le nom que l'Historique et la carte disent à la place des pièces ; vide ici.
    assert v["passages"] == [{"robot": ASP, "debut": T0, "fin": T0 + 3060, "duree_min": 51, "issue": "termine",
                              "zones": [{"id": "seg:1", "nom": "Salon"}, {"id": "seg:2", "nom": "Cuisine"}], "tout": False,
                              "source": "loggia", "surface": None, "motif": None, "libelle": None}], "le compte qui a lance ne sort pas du serveur"
    assert v["en_cours"] == {TOND: {"debut": T0 + 4000, "phase": "pause", "duree_min": 10, "zones": [], "tout": False,
                                    "source": "appareil", "surface": 140, "libelle": None}}
    assert v["erreurs"] == {}
    # Un compte qui ne lit pas l'aspirateur ne voit ni ses passages ni sa session.
    lit = lambda haid: haid != ASP
    assert calc.vue(c, T0 + 5000, lit)["passages"] == [] and list(calc.vue(c, T0 + 5000, lit)["en_cours"]) == [TOND]
    # Le plus recent d'abord.
    c = suite(calc, c, (5000, TOND, "travail"), (6000, TOND, "base"))
    assert [p["robot"] for p in calc.vue(c, T0 + 7000)["passages"]] == [TOND, ASP]
