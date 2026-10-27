"""Le carnet de l'eau sans Home Assistant (chantier IoT, etape 3 ; I28, I30).

TEST AJOUTE (etape 3 IoT, 25/10 ; I28, I30, § 9 de la conception). Ce qui est
garanti ici, a sec :
  - quelle vanne est une vanne d'eau : une `valve` de classe `water`, ou la
    vanne designee (une prise comprise) ; sans designation, TOUTES (I30) ;
  - quel binaire est un detecteur de fuite : un `moisture` d'un appareil — ni
    un modele, ni un groupe, ni le besoin d'eau d'une plante (ADR 0022) ;
  - qui a ferme : la fuite annoncee par la regle (deux minutes), une
    automatisation, une personne, l'appareil lui-meme ;
  - ce que la vanne garde tant qu'elle reste fermee — la cause, depuis quand —,
    et ce que la rouverture efface ;
  - les detecteurs : mouille depuis, sec depuis ;
  - le journal du jour, elague a minuit, cent lignes au plus, et le carnet
    relu du disque, ce qui ne se lit pas ecarte ;
  - ce que l'ecran recoit, sous les droits de lecture du compte ;
  - la regle « Fermer en cas de fuite » : sa valeur, et sa SEULE valeur
    reecrite (I29).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from conftest import charger

c = charger("eau_calcul")

PARIS = timezone(timedelta(hours=2))
T = datetime(2026, 10, 19, 18, 20, tzinfo=PARIS).timestamp()
MINUIT = datetime(2026, 10, 19, 0, 0, tzinfo=PARIS).timestamp()
a = lambda h, m: datetime(2026, 10, 19, h, m, tzinfo=PARIS).timestamp()  # noqa: E731


# ── Quelle vanne, quel detecteur ───────────────────────────────────────────
def test_une_vanne_d_eau_est_une_valve_de_classe_water_ou_celle_qu_on_a_designee():
    etats = {"valve.arrivee": {"device_class": "water"}, "valve.arrosage": {"device_class": "water"},
             "valve.gaz": {"device_class": "gas"}, "valve.sans_classe": {}, "switch.prise_eau": {}}
    # Sans designation : TOUTES les vannes d'eau (I30), triees ; ni le gaz ni une vanne sans classe.
    assert c.vannes_de_la_maison(etats, "") == ["valve.arrivee", "valve.arrosage"]
    assert c.vannes_de_la_maison(etats, None) == ["valve.arrivee", "valve.arrosage"]
    # Designee : elle seule — une prise commandee sur l'arrivee comprise.
    assert c.vannes_de_la_maison(etats, "switch.prise_eau") == ["switch.prise_eau"]
    assert c.vannes_de_la_maison(etats, "valve.arrosage") == ["valve.arrosage"]
    assert c.vannes_de_la_maison({}, "") == []


def test_le_sens_d_une_vanne_et_d_une_prise_designee():
    assert [c.sens_vanne("valve.a", e) for e in ("open", "opening", "closed", "closing")] == \
        ["ouverte", "ouverte", "fermee", "fermee"]
    # Une prise designee : eteinte = eau coupee (la regle d'alertes.py, `turn_off`).
    assert [c.sens_vanne("switch.p", e) for e in ("on", "off")] == ["ouverte", "fermee"]
    assert [c.sens_vanne("valve.a", e) for e in ("unavailable", "unknown", None, "stopped")] == [None] * 4
    assert c.sens_vanne("light.a", "on") is None


def test_un_detecteur_de_fuite_est_un_appareil_pas_un_calcul_ni_une_plante():
    fuite = {"device_class": "moisture"}
    assert c.est_detecteur("binary_sensor.fuite_evier", fuite, "mqtt") is True
    assert c.est_detecteur("binary_sensor.fuite_evier", fuite, None) is True, "inconnu du registre : il reste un detecteur"
    assert c.est_detecteur("binary_sensor.plante_besoin_eau", fuite, "template") is False
    assert c.est_detecteur("binary_sensor.fuites", fuite, "group") is False
    assert c.est_detecteur("binary_sensor.ficus_soif", fuite, "threshold", ["binary_sensor.ficus"]) is False
    assert c.est_detecteur("binary_sensor.ficusx", fuite, "threshold", ["binary_sensor.ficus"]) is True
    assert c.est_detecteur("binary_sensor.porte", {"device_class": "door"}, "mqtt") is False
    assert c.est_detecteur("sensor.humidite", fuite, "mqtt") is False


# ── Qui a ferme ────────────────────────────────────────────────────────────
def test_la_cause_d_un_changement_la_fuite_annoncee_d_abord():
    annonce = {"quand": a(14, 2), "detecteur": "binary_sensor.fuite_evier", "nom": "Sous l'évier"}
    assert c.cause("u1", ("automation_triggered", "Matin"), annonce, a(14, 2) + 5) == \
        {"cause": "fuite", "detecteur": "binary_sensor.fuite_evier", "nom": "Sous l'évier", "user_id": None}
    # Au-dela de deux minutes, l'annonce ne vaut plus.
    assert c.cause(None, None, annonce, a(14, 2) + c.ANNONCE_S + 1)["cause"] == "appareil"
    assert c.cause(None, ("automation_triggered", "Arrosage du soir"), None, T) == \
        {"cause": "automatisme", "detecteur": None, "nom": "Arrosage du soir", "user_id": None}
    assert c.cause("u-camille", None, None, T) == {"cause": "personne", "detecteur": None, "nom": None, "user_id": "u-camille"}
    assert c.cause(None, None, None, T) == {"cause": "appareil", "detecteur": None, "nom": None, "user_id": None}


# ── La vanne ───────────────────────────────────────────────────────────────
def test_la_vanne_garde_sa_cause_tant_qu_elle_reste_fermee():
    fuite = c.cause(None, None, {"quand": a(14, 2), "detecteur": "binary_sensor.fuite_evier", "nom": "Sous l'évier"}, a(14, 2))
    f = c.fiche_vanne_neuve()
    # Le premier etat vu ne dit pas d'ou il vient : rien au journal.
    f, ev = c.noter_vanne(f, "valve.arrivee", "open", a(8, 0), c.cause(None, None, None, a(8, 0)))
    assert f == {"vu": "ouverte", "cause": None, "depuis": None} and ev is None
    f, ev = c.noter_vanne(f, "valve.arrivee", "closing", a(14, 2), fuite)
    assert f == {"vu": "fermee", "cause": fuite, "depuis": a(14, 2)}
    assert ev == {"when": a(14, 2), "quoi": "fermee", "entity_id": "valve.arrivee", **fuite}
    # `closed` apres `closing` : la meme fermeture, pas une seconde.
    f2, ev2 = c.noter_vanne(f, "valve.arrivee", "closed", a(14, 3), c.cause(None, None, None, a(14, 3)))
    assert f2 == f and ev2 is None
    # Muette : rien ne change, la cause reste.
    f3, ev3 = c.noter_vanne(f, "valve.arrivee", "unavailable", a(15, 0), c.cause(None, None, None, a(15, 0)))
    assert f3 == f and ev3 is None
    # Rouverte par une personne : la cause s'efface, le journal le dit.
    main = c.cause("u-camille", None, None, a(18, 0))
    f4, ev4 = c.noter_vanne(f, "valve.arrivee", "opening", a(18, 0), main)
    assert f4 == {"vu": "ouverte", "cause": None, "depuis": a(18, 0)}
    assert ev4 == {"when": a(18, 0), "quoi": "rouverte", "entity_id": "valve.arrivee", **main}


def test_une_prise_designee_se_note_comme_une_vanne():
    f, _ = c.noter_vanne(c.fiche_vanne_neuve(), "switch.prise_eau", "on", a(8, 0), c.cause(None, None, None, a(8, 0)))
    f, ev = c.noter_vanne(f, "switch.prise_eau", "off", a(9, 0), c.cause("u1", None, None, a(9, 0)))
    assert f["vu"] == "fermee" and ev["quoi"] == "fermee" and ev["cause"] == "personne"


# ── Les detecteurs ─────────────────────────────────────────────────────────
def test_un_detecteur_mouille_puis_sec():
    f = c.fiche_detecteur_neuve()
    f, ev = c.noter_detecteur(f, "binary_sensor.fuite_evier", "off", a(8, 0))
    assert f == {"vu": "off", "mouille_depuis": None, "sec_depuis": None} and ev is None
    f, ev = c.noter_detecteur(f, "binary_sensor.fuite_evier", "on", a(14, 2))
    assert f == {"vu": "on", "mouille_depuis": a(14, 2), "sec_depuis": None}
    assert ev == {"when": a(14, 2), "quoi": "fuite", "entity_id": "binary_sensor.fuite_evier",
                  "cause": None, "detecteur": None, "nom": None, "user_id": None}
    f, ev = c.noter_detecteur(f, "binary_sensor.fuite_evier", "unavailable", a(14, 10))
    assert f["vu"] == "on" and ev is None, "un silence n'est pas un detecteur sec"
    f, ev = c.noter_detecteur(f, "binary_sensor.fuite_evier", "off", a(14, 40))
    assert f == {"vu": "off", "mouille_depuis": a(14, 2), "sec_depuis": a(14, 40)}
    assert ev["quoi"] == "sec" and ev["when"] == a(14, 40)


def test_un_detecteur_deja_mouille_au_premier_etat_vu():
    f, ev = c.noter_detecteur(c.fiche_detecteur_neuve(), "binary_sensor.fuite_evier", "on", a(9, 0))
    assert f == {"vu": "on", "mouille_depuis": a(9, 0), "sec_depuis": None} and ev is None


# ── Le journal du jour ─────────────────────────────────────────────────────
def test_le_journal_du_jour_s_elague_a_minuit_cent_lignes_au_plus():
    hier = {"when": MINUIT - 60, "quoi": "sec", "entity_id": "binary_sensor.a"}
    lignes = [{"when": MINUIT + i, "quoi": "fuite", "entity_id": "binary_sensor.a"} for i in range(150)]
    garde = c.elaguer([hier] + lignes, MINUIT)
    assert len(garde) == c.JOURNAL_MAX
    assert garde[0]["when"] == MINUIT + 50 and garde[-1]["when"] == MINUIT + 149
    assert c.minuit(datetime(2026, 10, 19, 18, 20, tzinfo=PARIS)) == MINUIT


def test_le_carnet_relu_du_disque_ecarte_ce_qui_ne_se_lit_pas():
    brut = {
        "vannes": {"valve.arrivee": {"vu": "fermee", "cause": {"cause": "fuite", "detecteur": "binary_sensor.a", "nom": "Évier", "user_id": None}, "depuis": a(14, 2)},
                   "valve.casse": {"vu": "peut-etre"}, "light.pas_une_vanne": {"vu": "fermee"}, 7: {}},
        "detecteurs": {"binary_sensor.a": {"vu": "off", "mouille_depuis": a(14, 2), "sec_depuis": a(14, 40)},
                       "sensor.pas_un_detecteur": {"vu": "on"}},
        "journal": [{"when": a(14, 40), "quoi": "sec", "entity_id": "binary_sensor.a"},
                    {"when": a(14, 2), "quoi": "fuite", "entity_id": "binary_sensor.a"},
                    {"when": "hier", "quoi": "sec", "entity_id": "binary_sensor.a"},
                    {"when": a(15, 0), "quoi": "explosion", "entity_id": "binary_sensor.a"},
                    {"when": MINUIT - 1, "quoi": "fuite", "entity_id": "binary_sensor.a"}],
    }
    carnet = c.lire_carnet(brut, MINUIT)
    assert carnet["vannes"] == {"valve.arrivee": brut["vannes"]["valve.arrivee"], "valve.casse": c.fiche_vanne_neuve()}
    assert carnet["detecteurs"] == {"binary_sensor.a": brut["detecteurs"]["binary_sensor.a"]}
    assert [(l["when"], l["quoi"]) for l in carnet["journal"]] == [(a(14, 2), "fuite"), (a(14, 40), "sec")], \
        "rangees dans l'ordre du temps, d'aujourd'hui seulement"
    assert c.lire_carnet(None, MINUIT) == {"vannes": {}, "detecteurs": {}, "journal": []}
    assert c.lire_carnet("abime", MINUIT) == {"vannes": {}, "detecteurs": {}, "journal": []}


# ── La regle, et ce que l'ecran recoit ─────────────────────────────────────
def test_la_regle_se_lit_avec_ses_defauts():
    vannes = ["valve.arrivee", "valve.arrosage"]
    assert c.regle_de(None, vannes) == {"actif": True, "reagit": True, "entite": "", "toutes": True, "vannes": vannes}
    cfg = {"categories": {"fuite": False}, "actions": {"actif": True, "vanne": {"actif": False, "entite": "valve.arrivee"}}}
    assert c.regle_de(cfg, ["valve.arrivee"]) == {"actif": False, "reagit": False, "entite": "valve.arrivee", "toutes": False, "vannes": ["valve.arrivee"]}
    assert c.regle_de({"actions": {"actif": False}}, [])["reagit"] is False
    assert c.regle_de({"actions": {"vanne": "abime"}}, [])["actif"] is True


def test_fermer_en_cas_de_fuite_ne_reecrit_que_sa_valeur():
    cfg = {"actif": True, "service": "mobile_app_tel", "categories": {"fuite": True},
           "actions": {"actif": True, "lumieres": False, "vanne": {"actif": True, "entite": "switch.prise_eau"}}}
    suite = c.fusion_actif(cfg, False)
    assert suite == {**cfg, "actions": {**cfg["actions"], "vanne": {"actif": False, "entite": "switch.prise_eau"}}}
    assert cfg["actions"]["vanne"]["actif"] is True, "la valeur en place n'est pas touchee : une copie"
    # Une maison jamais configuree : la seule cle de la regle, les autres gardent leurs defauts a l'ecran.
    assert c.fusion_actif(None, True) == {"actions": {"vanne": {"actif": True}}}
    assert c.fusion_actif({"actions": "abime"}, True) == {"actions": {"vanne": {"actif": True}}}


def test_ce_que_l_ecran_recoit_sous_les_droits_du_compte():
    carnet = {"vannes": {"valve.arrivee": {"vu": "fermee", "cause": {"cause": "fuite", "detecteur": "binary_sensor.a", "nom": "Évier", "user_id": None}, "depuis": a(14, 2)},
                         "valve.cave": {"vu": "ouverte", "cause": None, "depuis": None}},
              "detecteurs": {"binary_sensor.a": {"vu": "off", "mouille_depuis": a(14, 2), "sec_depuis": a(14, 40)}},
              "journal": [{"when": a(14, 2), "quoi": "fuite", "entity_id": "binary_sensor.a", "cause": None, "detecteur": None, "nom": None, "user_id": None},
                          {"when": a(14, 2), "quoi": "fermee", "entity_id": "valve.arrivee", "cause": "fuite", "detecteur": "binary_sensor.a", "nom": "Évier", "user_id": None},
                          {"when": a(9, 0), "quoi": "fermee", "entity_id": "valve.cave", "cause": "personne", "detecteur": None, "nom": None, "user_id": "u1"}]}
    regle = c.regle_de(None, ["valve.arrivee", "valve.cave"])
    tout = c.etat_public(carnet, regle, T)
    assert tout["maintenant"] == T and tout["regle"] == regle
    assert tout["vannes"]["valve.arrivee"] == {"ferme": True, "cause": "fuite", "detecteur": "binary_sensor.a", "nom": "Évier", "user_id": None, "depuis": a(14, 2)}
    assert tout["vannes"]["valve.cave"] == {"ferme": False, "cause": None, "detecteur": None, "nom": None, "user_id": None, "depuis": None}
    assert tout["detecteurs"] == {"binary_sensor.a": {"mouille_depuis": a(14, 2), "sec_depuis": a(14, 40)}}
    assert [l["entity_id"] for l in tout["journal"]] == ["valve.cave", "binary_sensor.a", "valve.arrivee"], "dans l'ordre du temps"
    # Un compte qui ne lit pas la cave : ni sa vanne, ni ses lignes, ni dans la regle.
    lu = c.etat_public(carnet, regle, T, lambda h: h != "valve.cave")
    assert sorted(lu["vannes"]) == ["valve.arrivee"] and "valve.cave" not in [l["entity_id"] for l in lu["journal"]]
    assert lu["regle"]["vannes"] == ["valve.arrivee"]
    # Un detecteur que le compte ne lit pas ne se nomme pas dans la cause.
    cache = c.etat_public(carnet, regle, T, lambda h: h != "binary_sensor.a")
    assert cache["vannes"]["valve.arrivee"]["detecteur"] is None and cache["vannes"]["valve.arrivee"]["nom"] is None
    assert cache["detecteurs"] == {} and all(l["entity_id"] != "binary_sensor.a" and l["detecteur"] is None for l in cache["journal"])


# ── TESTS AJOUTES (passe bis de l'etape 3, 25/10 ; relectures, points 6 et 8) ──
def test_actif_et_fuite_se_lisent_pareil_que_la_regle():
    """Point 8 : la popup et la regle d'alertes.py lisent `actif` et `fuite` de la meme facon - `bool(valeur)`, vrai quand la
    cle manque. `None` passait pour « actif » dans la popup, et pour « coupe » dans la regle."""
    import asyncio
    import types

    alertes = charger("alertes")
    variantes = [None, {}, {"actions": "abime"}, {"actions": {"vanne": "abime"}}, {"actions": {"vanne": {}}},
                 {"actions": {"vanne": {"actif": None}}}, {"actions": {"vanne": {"actif": 0}}}, {"actions": {"vanne": {"actif": 1}}},
                 {"actions": {"actif": None}}, {"actions": {"actif": False}}, {"categories": {"fuite": None}},
                 {"categories": {"fuite": 0}}, {"categories": "abime"}, {"categories": {"fumee": False}}]
    for cfg in variantes:
        async def lire(_cle, _defaut=None, cfg=cfg):
            return cfg
        moi = types.SimpleNamespace(_store=types.SimpleNamespace(async_get_shared=lire))
        actions = asyncio.run(alertes.LoggiaAlertes._actions(moi))
        reagit = asyncio.run(alertes.LoggiaAlertes._categorie_reagit(moi, "fuite"))
        r = c.regle_de(cfg, [])
        assert r["actif"] is bool(actions["vanne"].get("actif")), cfg
        assert r["reagit"] is (bool(actions.get("actif")) and reagit), cfg


def test_parametres_ne_reecrit_jamais_fermer_en_cas_de_fuite():
    """Point 6 : `loggia/config/set` de `loggia_alertes` garde `actions.vanne.actif` du DISQUE - seule `loggia/eau/regle` le
    change. Le reste de la demande passe tel quel."""
    disque = {"service": "tel", "actions": {"actif": True, "vanne": {"actif": False, "entite": ""}}}
    demande = {"service": "autre", "actions": {"actif": True, "lumieres": False, "vanne": {"actif": True, "entite": "valve.cave"}}}
    assert c.garder_fermer_sur_fuite(disque, demande) == {"service": "autre", "actions": {"actif": True, "lumieres": False, "vanne": {"actif": False, "entite": "valve.cave"}}}
    assert demande["actions"]["vanne"]["actif"] is True, "une copie : la demande n'est pas touchee"
    # Une demande sans `actions` : la valeur du disque y est remise, sinon elle reviendrait a son defaut.
    assert c.garder_fermer_sur_fuite(disque, {"service": "x"}) == {"service": "x", "actions": {"vanne": {"actif": False}}}
    # Rien sur le disque : la valeur de la demande s'efface, le defaut (vrai) vaut.
    assert c.garder_fermer_sur_fuite(None, demande)["actions"]["vanne"] == {"entite": "valve.cave"}
    assert c.garder_fermer_sur_fuite({"actions": {"vanne": {"entite": ""}}}, demande)["actions"]["vanne"] == {"entite": "valve.cave"}
    # Une suppression (None) ou un format abime passent tels quels : le magasin les traite.
    assert c.garder_fermer_sur_fuite(disque, None) is None and c.garder_fermer_sur_fuite(disque, "abime") == "abime"