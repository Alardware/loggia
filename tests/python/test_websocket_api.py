"""Ce que les commandes WebSocket promettent, relu dans la source.

Le composant n'a pas de banc d'essai Home Assistant : ces tests relisent
`websocket_api.py` et verrouillent ce qu'un remaniement pourrait perdre en
silence — un `require_admin` qui disparait ne casse aucun autre test.
"""
from __future__ import annotations

import re
from pathlib import Path

from conftest import declaration

RACINE = Path(__file__).resolve().parents[2]
SOURCE = (RACINE / "custom_components" / "loggia" / "websocket_api.py").read_text(encoding="utf-8")

# Ce qui ECRIT la maison : administrateurs seulement.
ADMIN_SEULEMENT = [
    "WS_INT_AFFECTER", "WS_INT_ECOUTER", "WS_VOL_CONFIG", "WS_FEN_CONFIG", "WS_PRE_CONFIG",
    "WS_NUI_CONFIG", "WS_VEI_CONFIG", "WS_SCN_CONFIG", "WS_ROB_CONFIG", "WS_REG_DEGELER",
    "WS_PIN_DEFINIR",
    # Le planning de Loggia pour le distributeur (05/10, ADR 0155) : celui de
    # la maison, comme celui des robots.
    "WS_DIS_CONFIG",
    # Les plannings de chauffe, leurs temperatures, le reglage fenetre
    # (chantier Chauffage, § 8.2) : la configuration de la maison.
    "WS_CHA_CONFIG",
    # Proteger une prise, imposer son type, l'alerte de fin de cycle (chantier
    # Prises, P4) : la configuration de la maison.
    "WS_PRI_CONFIG",
    # Designer un script par role dans la roue de la popup du robot (passe bis 2
    # de la tranche robots 2, 20/10) : il s'ecrit dans la description de la
    # maison (`loggia_entities`), que seul un administrateur ecrit.
    "WS_ROB_SCRIPTS",
    # ASSERTION MODIFIEE (etape 3 IoT, 25/10 ; I29, I32) : « Fermer en cas de
    # fuite », dans la popup de la vanne - `actions.vanne.actif` de
    # `loggia_alertes`, une cle de la maison.
    "WS_EAU_REGLE",
    # ASSERTION MODIFIEE (29/10, versions ; ADR 0285) : les versions precedentes
    # de la configuration. Les lister montre qui a ecrit quand ; en rendre une
    # remplace la configuration de toute la maison, comme l'import.
    "WS_VER_LISTE", "WS_VER_RENDRE",
    # ASSERTION MODIFIÉE (30/10, G2-1 ; ADR 0301) : qui recoit quoi — les personnes, leurs telephones et
    # les corrections de `loggia_alertes`, que seuls les administrateurs corrigent.
    "WS_NOT_DESTINATAIRES",
]
# Ce qui se LIT, ou se fait, depuis tout compte connecte — a dessein.
OUVERTES = [
    "WS_GET", "WS_SET", "WS_DELETE", "WS_DISCOVERY", "WS_INT_ETAT", "WS_VOL_ETAT", "WS_FEN_ETAT",
    "WS_PRE_ETAT", "WS_NUI_ETAT", "WS_VEI_ETAT", "WS_REG_ETAT", "WS_SCN_ETAT", "WS_SCN_LANCER",
    "WS_ROB_ETAT", "WS_PIN_VERIFIER",
    # Le profil du compte connecte (ADR 0276) : chaque compte relie ou cree
    # SON profil, designe par la connexion — jamais par le message.
    "WS_PROF_MOI",
    # Le minuteur d'une lampe (21/09) : le geste d'une fiche, comme lancer un
    # scenario — ouvert a tout compte, mais filtre par ses droits de PILOTAGE.
    "WS_MIN_ETAT", "WS_MIN_POSER", "WS_MIN_ANNULER",
    # Le test d'une sirene (22/09) : meme geste, meme regime.
    "WS_SIR_TESTER",
    # Suivre la configuration (22/09) : des noms de cles, rien de la maison.
    "WS_CFG_SUIVRE",
    # Ranger les scenarios (audit du 03/10) : de l'agencement (ADR 0125),
    # comme ranger ses cartes — l'ordre seul, de scenarios que la maison a.
    "WS_SCN_ORDRE",
    # L'etat du distributeur (05/10, ADR 0155) : un RESUME des automatisations
    # qui le commandent, filtre par les droits du compte — jamais raw_config.
    "WS_DIS_ETAT",
    # Le chauffage (chantier Chauffage, § 8.2) : l'etat, la reprise en main et
    # le mode de la maison sont la vie de tous les jours. La reprise est
    # bornee a ce que le compte peut PILOTER ; Ete se garde DANS la commande.
    "WS_CHA_ETAT", "WS_CHA_MAIN", "WS_CHA_MAISON",
    # L'historique RESUME d'un chauffage (audit du 19/10) : sous les droits de
    # LECTURE du compte, comme `etat`.
    "WS_CHA_HISTORIQUE",
    # Les manoeuvres d'un volet (chantier Volets, spec 6.5) : des lignes du
    # journal, sous les droits de lecture du compte, comme `regles/etat`
    # depuis le 28/10 (ADR 0279).
    "WS_VOL_MANOEUVRES",
    # L'etat des prises (chantier Prises, spec 6.1) : la carte et la popup
    # d'une prise, de tout compte - comme l'etat des volets.
    "WS_PRI_ETAT",
    # Le carnet des lumieres (chantier Lumieres, spec 6.2) : deux lectures, de
    # tout compte, sous ses droits de LECTURE - comme l'etat du chauffage.
    "WS_LUM_ETAT", "WS_LUM_JOURNAL",
    # Le mode enfant (chantier Mode enfant, spec 7.4) : l'etat se lit de tout
    # compte sous ses droits de LECTURE ; la demande de l'enfant et le son pour
    # dormir sont les gestes de la chambre, bornes a ce que le compte PILOTE.
    "WS_ENF_ETAT", "WS_ENF_DEMANDER", "WS_ENF_DORMIR",
    # ASSERTION MODIFIEE (chantier IoT, tache 4, 18/10 ; I3 A) : le depart d'un
    # robot depuis l'ecran, le geste de tous les jours — comme lancer un
    # scenario, ouvert a tout compte et borne a ce qu'il PILOTE.
    "WS_ROB_LANCER",
    # ASSERTION MODIFIEE (etape 3 IoT, 25/10 ; I28) : le carnet de l'eau se lit
    # de tout compte, sous ses droits de LECTURE - comme celui des lumieres.
    "WS_EAU_ETAT",
    # ASSERTION MODIFIÉE (30/10, G2-1 ; ADR 0301) : « C'est sorti » depuis le bandeau de l'Accueil —
    # sortir les bacs n'est pas un privilege ; il n'ecrit que le jour, dans la partie commune.
    "WS_COL_SORTI",
]
# Ce qui s'ouvre au CODE DE LA MAISON (chantier Mode enfant, E2 B) : les gestes
# du parent. Pas de `require_admin` - une tablette de famille porte un compte
# ordinaire, et c'est le code qui dit que c'est le parent. Le code verifie
# (`loggia/pin/verifier`) vaut laissez-passer cinq minutes, le meme que pour le
# passage vers un profil Admin ; un administrateur s'en passe.
CODE_OU_ADMIN = [
    "WS_ENF_CONFIG", "WS_ENF_LEVER", "WS_ENF_REPONDRE",
]


def _bloc(constante: str) -> str:
    """La ligne de la table `COMMANDES` d'une commande : son gestionnaire, son schema, son acces, son module.

    ASSERTION MODIFIEE (lot 8, 30/10 ; ADR 0291) : les commandes etaient declarees
    par leurs decorateurs (`websocket_command`, `require_admin`) ; elles sont
    desormais des lignes d'une table, et `acces=ADMIN` y tient lieu de
    `require_admin` - que la boucle d'inscription pose
    (`test_le_registre_pose_require_admin`). Le niveau EXECUTE de chaque
    commande est epingle par test_websocket_registre.py."""
    return declaration(SOURCE, "Commande(%s," % constante)


def _corps(nom: str, suivant: str) -> str:
    """Le corps d'un gestionnaire, jusqu'au suivant."""
    return SOURCE[SOURCE.index("async def " + nom):SOURCE.index(suivant)]


def test_le_registre_pose_require_admin():
    """TEST AJOUTE (lot 8, 30/10 ; ADR 0291) : la boucle d'inscription pose les
    memes decorateurs qu'avant, dans le meme ordre - `require_admin` en
    dehors, puis le module, puis la garde du code de la maison."""
    gestionnaire = SOURCE[SOURCE.index("def _gestionnaire("):SOURCE.index("def _code_ou_admin(")]
    assert "if commande.acces == ADMIN:\n        gestionnaire = websocket_api.require_admin(gestionnaire)" in gestionnaire
    assert gestionnaire.index("require_admin") < gestionnaire.index("websocket_api.websocket_command(")
    assert gestionnaire.index('"not_available"') < gestionnaire.index("_code_ou_admin(ctx, connection, msg)")
    assert "if commande.acces == CODE_OU_ADMIN and not _code_ou_admin(ctx, connection, msg):" in gestionnaire


def test_toutes_les_commandes_sont_classees():
    # ASSERTION MODIFIEE (lot 8, 30/10 ; ADR 0291) : les commandes se lisent dans la table `COMMANDES`.
    declarees = set(re.findall(r"Commande\((WS_[A-Z_]+),", SOURCE))
    # ASSERTION MODIFIEE (chantier Mode enfant, tache 3) : un troisieme regime,
    # le code de la maison ou un administrateur.
    assert declarees == set(ADMIN_SEULEMENT) | set(OUVERTES) | set(CODE_OU_ADMIN), \
        "une commande nouvelle doit etre rangee ici, d'un cote ou de l'autre"


def test_ecrire_la_maison_reste_aux_administrateurs():
    # ASSERTION MODIFIEE (lot 8, 30/10 ; ADR 0291) : `acces=ADMIN` dans la table, au lieu du decorateur.
    for c in ADMIN_SEULEMENT:
        assert "acces=ADMIN" in _bloc(c), c + " a perdu son require_admin"
    for c in OUVERTES:
        assert "acces=" not in _bloc(c), c + " est devenue reservee : une tablette de famille ne l'atteint plus"


def test_le_mode_enfant_s_ouvre_au_code_de_la_maison():
    """Chantier Mode enfant, E2 B et spec 7.4. Les gestes du parent n'ont pas
    de `require_admin` : c'est `_code_ou_admin` qui les garde - administrateur,
    ou le code de la maison verifie il y a moins de cinq minutes - et le refus
    porte le code que l'ecran traduit deja (`code_admin_requis`). Les gestes de
    la chambre passent par les droits de PILOTAGE du compte, et l'etat par ses
    droits de LECTURE. Le profil se nomme `profil`, jamais `id`."""
    # ASSERTION MODIFIEE (lot 8, 30/10 ; ADR 0291) : la garde est posee par la boucle d'inscription pour chaque ligne
    # `acces=CODE_OU_ADMIN` de la table, au lieu d'un appel en tete de chaque gestionnaire ; l'etat passe par `_etat`.
    garde = SOURCE[SOURCE.index("def _code_ou_admin(ctx: Contexte, connection, msg)"):SOURCE.index("# ── Les gestionnaires communs")]
    assert "connection.user.is_admin" in garde and "laissez_passer.valide(connection.user.id)" in garde
    assert '"code_admin_requis"' in garde, "le refus nomme son code, l'ecran le traduit"
    for c in CODE_OU_ADMIN:
        assert "acces=CODE_OU_ADMIN" in _bloc(c), c + " a perdu la garde du code, ou est devenue reservee"
    assert "_etat(par_compte=True)" in _bloc("WS_ENF_ETAT")
    for nom, suivant in (("handle_enf_demander", "async def handle_enf_dormir"),
                         ("handle_enf_dormir", "# ── Les versions precedentes")):
        corps = _corps(nom, suivant)
        assert "controle=controle_de(connection.user)" in corps, nom + " ne respecte pas les droits de pilotage"
        assert '"unauthorized"' in corps and "_relayer(connection, msg, err)" in corps
    for c in ("WS_ENF_LEVER", "WS_ENF_REPONDRE", "WS_ENF_DEMANDER", "WS_ENF_DORMIR"):
        assert 'vol.Required("profil")' in _bloc(c), c + " : le profil se nomme `profil`, jamais `id`"
    assert 'vol.Required("minutes"): vol.In([0, 30])' in _bloc("WS_ENF_LEVER"), "lever : 30 min, ou 0 pour retablir (E14)"


def test_chaque_commande_est_enregistree():
    # ASSERTION MODIFIEE (lot 8, 30/10 ; ADR 0291) : une seule boucle inscrit toute la table ; chaque commande y a UNE
    # ligne. L'inscription EXECUTEE des 57 est epinglee par test_websocket_registre.py.
    assert "for commande in COMMANDES:\n        websocket_api.async_register_command(hass, _gestionnaire(ctx, commande))" in SOURCE
    # ASSERTION MODIFIEE (chantier Mode enfant, tache 3) : les trois regimes.
    attendus = ADMIN_SEULEMENT + OUVERTES + CODE_OU_ADMIN
    # ET DANS L'AUTRE SENS (24/09, plan S7) : une commande retiree laissait son
    # enregistrement derriere elle, et le composant levait un NameError au
    # demarrage — que ce fichier ne voyait pas, faute d'appeler la fonction.
    lignes = re.findall(r"Commande\((WS_[A-Z_]+),", SOURCE)
    assert sorted(lignes) == sorted(attendus), "ligne orpheline ou en double : " + repr(sorted(set(lignes) ^ set(attendus)))


def test_le_code_administrateur_ne_sort_jamais_du_serveur():
    # ASSERTION MODIFIEE (lot 8, 30/10 ; ADR 0291) : le magasin est celui du contexte des gestionnaires.
    assert "await ctx.store.async_get_code_admin()" in SOURCE
    assert "hass.async_add_executor_job(verifier, pin, enregistrement)" in SOURCE, "PBKDF2 hors de la boucle"
    # ASSERTION MODIFIEE (audit du 28/10, H1 ; ADR 0279) : il n'y a plus de code par defaut a comparer. Jamais defini, rien ne
    # passe, et le refus se nomme.
    assert "CODE_DEFAUT" not in SOURCE, "un code par defaut ouvre encore le laissez-passer"
    assert '"code_non_defini"' in SOURCE, "un code jamais defini se refuse sans dire pourquoi"
    assert 'connection.send_result(msg["id"], {"ok": False, "bloque": attente})' in SOURCE, "un compte bloque apprend combien de temps, pas pourquoi il a rate"
    assert "limiteur.rate(uid)" in SOURCE and "limiteur.reussi(uid)" in SOURCE
    corps = SOURCE[SOURCE.index("async def handle_pin_verifier"):SOURCE.index("async def handle_pin_definir")]
    reponses = re.findall(r'send_result\(msg\["id"\], (\{[^\n]*\})', corps)
    assert len(reponses) == 3 and all("pin" not in r for r in reponses), "la reponse ne renvoie jamais le code"


def test_l_identite_vient_de_la_connexion():
    assert 'vol.Required("user_id")' not in SOURCE and 'vol.Optional("user_id")' not in SOURCE, "aucune commande n'accepte un user_id du client"
    assert "connection.user.id" in SOURCE and "connection.user.is_admin" in SOURCE


def test_lancer_un_scenario_respecte_les_permissions_du_compte():
    assert "controle=controle_de(connection.user)" in SOURCE, "un compte restreint ne pilote pas par scenario ce que Home Assistant lui refuse"


def test_ranger_les_scenarios_ne_mene_qu_a_l_ordre():
    """Audit du 03/10 : la commande ouverte ne touche qu'a l'ordre. Si elle
    appelait `async_enregistrer`, un compte ordinaire creerait, modifierait ou
    supprimerait des scenarios par ce detour (execute dans
    test_websocket_api_execution.py)."""
    corps = SOURCE[SOURCE.index("async def handle_scn_ordre"):SOURCE.index("async def handle_scn_lancer")]
    assert 'await scenarios.async_ordonner(msg["ordre"])' in corps
    assert "async_enregistrer" not in corps, "la porte ouverte mene a la configuration des scenarios"
    # Relecture du 03/10 : un plafond du magasin y repartait en `invalid_format`.
    assert "_relayer(connection, msg, err)" in corps, "un refus nomme du magasin perd son code en rangeant"


def test_l_etat_du_distributeur_passe_le_compte_et_le_detail():
    """05/10 (ADR 0155) : `etat` est ouverte, mais ce qu'elle rend est filtre
    par les droits du compte — c'est `connection.user` qui le porte, jamais un
    champ du client. `detail` (la fiche ouverte) est le seul cas ou la Tuya
    officielle est interrogee."""
    corps = SOURCE[SOURCE.index("async def handle_dis_etat"):SOURCE.index("# ── Le chauffage")]
    assert re.search(r"distributeurs\.async_etat\(\s*connection\.user, detail=bool\(msg\.get\(\"detail\"\)\)\)", corps)
    assert 'vol.Optional("detail", default=False): bool' in _bloc("WS_DIS_ETAT")
    # ASSERTION MODIFIEE (lot 8, 30/10 ; ADR 0291) : `config` passe par le gestionnaire commun `_config`, qui relaie le
    # refus et rend l'etat sous les droits du compte.
    assert '_config(etat="compte")' in _bloc("WS_DIS_CONFIG")
    config = SOURCE[SOURCE.index("def _config("):SOURCE.index("# ── La configuration")]
    assert "_relayer(connection, msg, err)" in config, "trop de repas perd son code"
    assert 'await module.async_enregistrer(msg["patch"])' in config


def test_le_chauffage_borne_la_main_et_garde_l_ete():
    """Chantier Chauffage, § 8.2 et § 8.3. La reprise en main est ouverte a
    tout compte mais bornee a ce qu'il peut PILOTER, et c'est la session qui
    dit qui la pose. Le mode de la maison est ouvert, sauf l'Ete : le role
    vient de la connexion, et le refus nomme sa cle (`not_admin`)."""
    main = SOURCE[SOURCE.index("async def handle_cha_main"):SOURCE.index("async def handle_cha_maison")]
    assert "controle = controle_de(connection.user)" in main
    assert "par=connection.user.id" in main
    assert "_relayer(connection, msg, err)" in main, "un mode refuse perd son code"
    # ASSERTION MODIFIEE (lot 8, 30/10 ; ADR 0291) : `config` est une ligne de la table ; le corps suivant est l'historique.
    maison = SOURCE[SOURCE.index("async def handle_cha_maison"):SOURCE.index("# L'historique d'un chauffage")]
    assert "admin=bool(connection.user.is_admin)" in maison
    assert '"not_admin"' in maison
    assert 'vol.Required("chauffage")' in _bloc("WS_CHA_MAIN"), "le chauffage se nomme `chauffage`, jamais `id`"


# Le carnet des lumieres sous les droits du compte (chantier Lumieres, spec 6.2)
# se verifie en EXECUTANT les commandes, pas en relisant la source :
# tests/python/test_websocket_api_execution.py, `banc_lumieres` (menage de
# l'audit du 19/10).
