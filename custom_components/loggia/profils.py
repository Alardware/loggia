"""Un compte Home Assistant = son profil Loggia (ADR 0276, 27/10).

« Si sur son téléphone il est connecté à Home Assistant avec son compte, ça
doit charger son profil, point. Il n'y a pas de nom pas reconnu : Loggia se
connecte au même profil que celui avec lequel il est connecté à HA. »

Avant, un profil Loggia n'etait relie a un compte (`haId`) que si son NOM
etait identique a celui du compte, et seul un compte administrateur pouvait
enregistrer ce lien — `loggia_users` appartient a la maison. Une epouse au
compte ordinaire ne reliait donc jamais son profil ; un administrateur dont le
profil s'appelait « Administrateur » non plus. Ticket #38 : depuis la v3.94.0,
il s'ouvrait sur le profil de son epouse et ne pouvait plus rien modifier.

C'est donc le SERVEUR qui relie, a partir du compte de la connexion — jamais
d'un nom ou d'un identifiant envoye par l'ecran. Un compte ne peut ainsi
relier ou creer que SON profil. Dans l'ordre :

1. le profil deja relie a ce compte ;
2. sinon, un profil libre du meme nom (la reprise d'une installation
   existante : ses reglages restent) ;
3. sinon, pour un administrateur de Home Assistant, le profil Admin libre s'il
   n'y en a qu'un (le profil « Administrateur » d'une installation neuve) ;
4. sinon, un profil NEUF, a son nom, Admin si et seulement si le compte l'est.

Un profil n'est jamais Admin pour un compte qui ne l'est pas : un compte
ordinaire relie a un profil Admin du meme nom n'est PAS repris (etape 2), il
recoit le sien.
"""
from __future__ import annotations

from typing import Any

CLE_PROFILS = "loggia_users"
ADMIN = "Admin"
ORDINAIRE = "Famille"
MAX_PROFILS = 32

# La pastille d'un profil cree d'office : les jetons du theme, jamais une
# couleur en dur — le mode clair et les themes d'utilisateur les redefinissent.
COULEURS = (
    "var(--o-accent)", "var(--o-purple)", "var(--o-cyan)",
    "var(--o-warn)", "var(--o-ok)", "var(--o-warn2)",
)


def _norme(nom: Any) -> str:
    return str(nom or "").strip().casefold()


def _admin(profil: dict[str, Any]) -> bool:
    return str(profil.get("role") or "").strip().casefold() == ADMIN.casefold()


def profil_du_compte(profils: Any, compte: str, nom: str, is_admin: bool
                     ) -> tuple[int, list[dict[str, Any]], bool]:
    """L'index du profil de ce compte, la liste (peut-etre changee), et si elle
    a change. `compte` vient TOUJOURS de la connexion authentifiee."""
    if not compte:
        raise ValueError("compte inconnu")
    liste = [dict(p) for p in profils if isinstance(p, dict)] if isinstance(profils, list) else []

    # 1. Deja relie. Un profil Admin relie a un compte qui ne l'est plus n'est
    #    pas rendu : le compte a perdu son role dans Home Assistant.
    for i, p in enumerate(liste):
        if p.get("haId") == compte and (is_admin or not _admin(p)):
            return i, liste, False

    libre = [i for i, p in enumerate(liste) if not p.get("haId")]

    # 2. Un profil libre du meme nom.
    cible = _norme(nom)
    if cible:
        for i in libre:
            if _norme(liste[i].get("name")) == cible and (is_admin or not _admin(liste[i])):
                liste[i]["haId"] = compte
                return i, liste, True

    # 3. Le profil Admin libre d'une installation, pour un administrateur.
    if is_admin:
        admins_libres = [i for i in libre if _admin(liste[i])]
        if len(admins_libres) == 1:
            i = admins_libres[0]
            liste[i]["haId"] = compte
            return i, liste, True

    # 4. Un profil neuf.
    if len(liste) >= MAX_PROFILS:
        raise ValueError("trop de profils")
    role = ADMIN if is_admin else ORDINAIRE
    propre = str(nom or "").strip()[:40] or "Profil"
    liste.append({
        "name": propre,
        "role": role,
        "c": COULEURS[len(liste) % len(COULEURS)],
        "sub": role + " · " + propre.lower().replace(" ", "."),
        "vues": [],
        "droits": [],
        "haId": compte,
    })
    return len(liste) - 1, liste, True
