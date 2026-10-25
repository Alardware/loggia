# 0271 — Une carte, deux vues

*20 octobre 2026 — à l'essai (rien de publié)*

## Le problème

> « Les cartes sont en double, dans Appareils et dans Pièces, mais si je
> supprime ou ajoute dans l'un ou l'autre, ça doit aussi se répercuter sur
> l'autre, c'est logique. »

Un appareil a sa carte dans Objets et dans la vue de sa pièce, avec le même
identifiant (`light.x`, `zone:…`). Mais Objets range ses retraits dans
`loggia_objlayout` (scope « objets ») et chaque pièce dans `loggia_roomlayout`
(un scope par pièce) : rien ne les reliait. `deplacerDansPiece` lui-même
n'écrivait que du côté des pièces.

## Décidé

`refletCarte` (src/refletcarte.js, fonction pure) dit ce qu'un geste fait d'un
côté écrit de l'autre ; `refleterCarte` (App.jsx) l'appelle depuis `remove` et
`toggle` de l'éditeur des vues.

- **Retirer dans Objets** : la carte quitte chaque pièce qui la montre — un
  retrait si la pièce la propose, une sortie de `added` si on l'y avait ajoutée.
- **Retirer dans une pièce** : elle quitte Objets.
- **Remettre une carte proposée** (lever son retrait), d'un côté : elle revient
  de l'autre. On n'ajoute rien à la main : la découverte la propose déjà.

Seules les cartes d'**appareil** se reflètent : une entité ou une zone de
chauffage. Un intertitre de pièce (`sect:`), un groupe de capteurs, une plante,
le distributeur n'existent que d'un côté.

Les écritures passent par `cfgSet` : en admin, le reflet vaut aussi pour tous
les profils (ADR 0270) ; un profil ordinaire le fait chez lui seul.

## Ce que ça entraîne

- Aucun changement serveur, aucun redémarrage de Home Assistant.
- Ce qui avait été retiré d'un seul côté avant reste tel quel ; seuls les gestes
  suivants se reflètent.
- **Non fait** : une entité AJOUTÉE à la main dans une pièce sans y être
  proposée n'est pas ajoutée à Objets (Objets découvre déjà tous les appareils
  de la maison) ; remplacer l'entité d'une carte (`replace`) ne se reflète pas.

Tests : `tests/reflet_carte.test.mjs`. Vérifié en démonstration : supprimé dans
Objets → absent de la pièce Bureau ; supprimé dans Bureau → absent d'Objets.
