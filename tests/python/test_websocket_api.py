"""Ce que les commandes WebSocket promettent, relu dans la source.

Le composant n'a pas de banc d'essai Home Assistant : ces tests relisent
`websocket_api.py` et verrouillent ce qu'un remaniement pourrait perdre en
silence — un `require_admin` qui disparait ne casse aucun autre test.
"""
from __future__ import annotations

import re
from pathlib import Path

RACINE = Path(__file__).resolve().parents[2]
SOURCE = (RACINE / "custom_components" / "loggia" / "websocket_api.py").read_text(encoding="utf-8")

# Ce qui ECRIT la maison : administrateurs seulement.
ADMIN_SEULEMENT = [
    "WS_STATS", "WS_INT_AFFECTER", "WS_INT_ECOUTER", "WS_VOL_CONFIG", "WS_FEN_CONFIG", "WS_PRE_CONFIG",
    "WS_NUI_CONFIG", "WS_VEI_CONFIG", "WS_SCN_CONFIG", "WS_ROB_CONFIG", "WS_REG_DEGELER",
    "WS_PIN_DEFINIR",
]
# Ce qui se LIT, ou se fait, depuis tout compte connecte — a dessein.
OUVERTES = [
    "WS_GET", "WS_SET", "WS_DELETE", "WS_DISCOVERY", "WS_INT_ETAT", "WS_VOL_ETAT", "WS_FEN_ETAT",
    "WS_PRE_ETAT", "WS_NUI_ETAT", "WS_VEI_ETAT", "WS_REG_ETAT", "WS_SCN_ETAT", "WS_SCN_LANCER",
    "WS_ROB_ETAT", "WS_PIN_VERIFIER",
    # Le minuteur d'une lampe (21/09) : le geste d'une fiche, comme lancer un
    # scenario — ouvert a tout compte, mais filtre par ses droits de PILOTAGE.
    "WS_MIN_ETAT", "WS_MIN_POSER", "WS_MIN_ANNULER",
]


def _bloc(constante: str) -> str:
    """Les lignes entre la declaration `websocket_command` d'une commande et son `async def`."""
    debut = SOURCE.index('vol.Required("type"): ' + constante)
    fin = SOURCE.index("async def ", debut)
    return SOURCE[debut:fin]


def test_toutes_les_commandes_sont_classees():
    declarees = set(re.findall(r'vol\.Required\("type"\): (WS_[A-Z_]+)', SOURCE))
    assert declarees == set(ADMIN_SEULEMENT) | set(OUVERTES), "une commande nouvelle doit etre rangee ici, d'un cote ou de l'autre"


def test_ecrire_la_maison_reste_aux_administrateurs():
    for c in ADMIN_SEULEMENT:
        assert "@websocket_api.require_admin" in _bloc(c), c + " a perdu son require_admin"
    for c in OUVERTES:
        assert "@websocket_api.require_admin" not in _bloc(c), c + " est devenue reservee : une tablette de famille ne l'atteint plus"


def test_chaque_commande_est_enregistree():
    for c in ADMIN_SEULEMENT + OUVERTES:
        nom = "handle_" + c[3:].lower()
        assert f"websocket_api.async_register_command(hass, {nom})" in SOURCE, nom + " n'est pas enregistree"


def test_le_code_administrateur_ne_sort_jamais_du_serveur():
    assert "await store.async_get_code_admin()" in SOURCE
    assert "hass.async_add_executor_job(verifier, pin, enregistrement)" in SOURCE, "PBKDF2 hors de la boucle"
    assert "hmac.compare_digest(pin.encode(\"utf-8\"), CODE_DEFAUT.encode(\"utf-8\"))" in SOURCE, "le code par defaut se compare a temps constant"
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
