"""Le code administrateur de Loggia : hache, verifie par le composant, jamais renvoye.

Jusqu'au 18/09, le code (quatre chiffres) etait une cle de la configuration
commune, en clair, renvoyee a TOUT compte connecte par `loggia/config/get`, et
compare dans le navigateur. Un decor : il se lisait en deux clics. Il protege
un basculement de profil, pas un compte Home Assistant — mais un decor qui se
donne pour une barriere est pire que pas de barriere du tout.

Desormais :
  * le code est HACHE (PBKDF2-HMAC-SHA256, sel aleatoire) sous `CLE_HACHE`, et
    l'ancienne cle en clair est migree puis effacee au chargement (store.py) ;
  * aucune des deux cles ne sort du magasin : `async_get_user` les retire, et
    `FORBIDDEN_KEYS` refuse qu'un client les ecrive par la configuration ;
  * la verification se fait par une commande WebSocket dediee, avec une
    limitation d'essais par compte — quatre chiffres se devinent en dix mille
    coups sans elle ;
  * seul un administrateur Home Assistant le definit (commande a part) ;
  * il vit dans le magasin du composant, donc il est LE MEME sur chaque
    appareil et par chaque acces (local, distant) : c'est le code de la maison.
"""
from __future__ import annotations

import hashlib
import hmac
import os
import re
import time
from typing import Any

CLE_HACHE = "loggia_admin_pin_hache"
# L'ancienne cle, en clair : migree puis effacee. Restee refusee a l'ecriture.
CLE_CLAIR = "loggia_admin_pin"
CODE_DEFAUT = "0000"
ITERATIONS = 100_000
# `fullmatch`, pas `$` : ce dernier laisse passer un retour a la ligne final.
FORME = re.compile(r"[0-9]{4,8}")

# Cinq rates dans la fenetre : blocage d'une minute, doublee a chaque palier,
# plafonnee a quinze minutes. Une reussite remet tout a zero.
ESSAIS_LIBRES = 5
FENETRE = 600
BLOCAGE = 60
BLOCAGE_MAX = 900


def code_valide(pin: Any) -> bool:
    """Quatre a huit chiffres, rien d'autre."""
    return isinstance(pin, str) and FORME.fullmatch(pin) is not None


def hacher(pin: str, sel: bytes | None = None, iterations: int = ITERATIONS) -> dict[str, Any]:
    """L'enregistrement a stocker : sel, empreinte, nombre d'iterations (hex)."""
    if not code_valide(pin):
        raise ValueError("code invalide : de quatre a huit chiffres")
    sel = sel if sel is not None else os.urandom(16)
    empreinte = hashlib.pbkdf2_hmac("sha256", pin.encode("utf-8"), sel, int(iterations))
    return {"sel": sel.hex(), "hache": empreinte.hex(), "iterations": int(iterations)}


def enregistrement_valide(e: Any) -> bool:
    if not isinstance(e, dict):
        return False
    try:
        bytes.fromhex(str(e.get("sel")))
        bytes.fromhex(str(e.get("hache")))
    except (TypeError, ValueError):
        return False
    it = e.get("iterations")
    return isinstance(it, int) and not isinstance(it, bool) and 1000 <= it <= 10_000_000


def verifier(pin: Any, enregistrement: Any) -> bool:
    """Le code correspond-il a l'enregistrement ? Comparaison a temps constant."""
    if not code_valide(pin) or not enregistrement_valide(enregistrement):
        return False
    attendu = bytes.fromhex(enregistrement["hache"])
    calcule = hashlib.pbkdf2_hmac(
        "sha256", pin.encode("utf-8"), bytes.fromhex(enregistrement["sel"]), int(enregistrement["iterations"])
    )
    return hmac.compare_digest(attendu, calcule)


def passage_admin(patch: Any, profils: Any) -> bool:
    """Ce patch fait-il basculer vers un profil Admin ? (24/09, plan M14)

    Vrai seulement si `loggia_active_user` y figure ET designe un profil dont
    le role est « Admin ». Un index hors liste, une liste illisible, un autre
    role : faux — il n'y a rien a garder. C'est l'appelant qui decide quoi
    faire d'une liste de profils qu'il n'a pas pu lire.
    """
    if not isinstance(patch, dict) or "loggia_active_user" not in patch:
        return False
    try:
        rang = int(str(patch.get("loggia_active_user")))
    except (TypeError, ValueError):
        return False
    if not isinstance(profils, list) or not 0 <= rang < len(profils):
        return False
    vise = profils[rang]
    if not isinstance(vise, dict):
        return False
    return str(vise.get("role") or "").strip().lower() == "admin"


# Combien de temps un code verifie vaut laissez-passer. Assez pour taper le
# code puis choisir le profil, trop court pour qu'un ecran laisse ouvert des
# heures serve a quelqu'un d'autre.
LAISSEZ_PASSER = 300


class LaissezPasser:
    """Qui a prouve le code, et jusqu'a quand (24/09, plan M14).

    L'ecran annoncait « Requis pour basculer vers un profil Admin », et rien
    ne le verifiait : `loggia_active_user` est ouverte a tout compte, un appel
    direct suffisait a se donner l'affichage administrateur. La maison restait
    protegee — `loggia_users` refuse toujours l'ecriture, personne ne se donne
    un role — mais la phrase, elle, etait fausse.

    EN MEMOIRE seulement, comme le limiteur : un redemarrage l'oublie, et
    c'est voulu. Un laissez-passer qui survit a un redemarrage est un
    laissez-passer qu'on a oublie de retirer.
    """

    def __init__(self, duree: int = LAISSEZ_PASSER, horloge=time.monotonic) -> None:
        self._duree = duree
        self._horloge = horloge
        self._jusqua: dict[str, float] = {}

    def accorder(self, cle: str) -> None:
        self._jusqua[cle] = self._horloge() + self._duree

    def valide(self, cle: str) -> bool:
        fin = self._jusqua.get(cle)
        if fin is None:
            return False
        if fin <= self._horloge():
            del self._jusqua[cle]
            return False
        return True

    def retirer(self, cle: str) -> None:
        self._jusqua.pop(cle, None)


class Limiteur:
    """Les essais rates, par compte : au-dela de `ESSAIS_LIBRES` dans la fenetre,
    un blocage qui double a chaque palier. En memoire : un redemarrage l'oublie,
    ce qui suffit — dix mille codes ne se devinent pas en un redemarrage."""

    def __init__(self, horloge=time.monotonic) -> None:
        self._horloge = horloge
        self._rates: dict[str, list[float]] = {}
        self._verrous: dict[str, float] = {}
        self._paliers: dict[str, int] = {}

    def bloque_pendant(self, cle: str) -> int:
        """Secondes de blocage restantes ; 0 si l'on peut essayer."""
        fin = self._verrous.get(cle)
        if fin is None:
            return 0
        restant = fin - self._horloge()
        if restant <= 0:
            del self._verrous[cle]
            return 0
        return int(restant) + 1

    def rate(self, cle: str) -> int:
        """Un essai rate. Rend la duree du blocage qu'il declenche, 0 sinon."""
        maintenant = self._horloge()
        liste = [t for t in self._rates.get(cle, []) if maintenant - t < FENETRE]
        liste.append(maintenant)
        if len(liste) < ESSAIS_LIBRES:
            self._rates[cle] = liste
            return 0
        palier = self._paliers.get(cle, 0)
        duree = min(BLOCAGE_MAX, BLOCAGE * (2 ** palier))
        self._paliers[cle] = palier + 1
        self._verrous[cle] = maintenant + duree
        self._rates[cle] = []
        return duree

    def reussi(self, cle: str) -> None:
        self._rates.pop(cle, None)
        self._verrous.pop(cle, None)
        self._paliers.pop(cle, None)
