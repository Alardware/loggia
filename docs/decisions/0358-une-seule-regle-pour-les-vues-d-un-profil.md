# 0358 — Une seule règle pour les vues d'un profil

*13 novembre 2026 — appliqué (v3.100.0)*

## Le problème

Un profil restreint ne voit que les vues qu'un administrateur lui a cochées.
La liste à cocher ne proposait pas Lumières, Climat, Volets ni Médias, alors
que l'Accueil les ouvre : toucher « 4 lumières allumées », un lecteur en
cours ou une zone qui chauffe renvoyait ce profil à l'Accueil, sans rien dire.
Le lien « modes et planning » des volets aussi. Et la règle était écrite
trois fois (la garde de la racine, la barre latérale, la barre du téléphone),
chacune à sa façon.

## La décision

Une seule fonction, `vuePermise(vid, vues)` (`views.js`), lue par la garde et
par les deux menus :

- Accueil et Paramètres sont toujours permis ; une pièce suit « Pièces ».
- **Lumières, Climat, Volets et Médias** se cochent maintenant dans la fiche
  d'un profil.
- Ces quatre vues sont la vue Objets avec un filtre : **cocher Objets les
  ouvre aussi**. Un profil déjà restreint à Objets n'est donc plus renvoyé à
  l'Accueil, sans qu'un administrateur ait à repasser sur sa fiche.
- Le **planning des volets** suit Volets (coché, ou couvert par Objets).

## Ce qui ne change pas

- Les libellés des vues : sur une vraie installation certains viennent de Home
  Assistant, et il n'y est pas touché.
- Un administrateur voit tout ; un profil sans aucune vue cochée aussi.
- Les vues d'un profil ne sont pas une barrière de sécurité : le serveur ne
  les vérifie pas. Les droits, eux, restent vérifiés côté serveur.

## Les limites connues

- Ouvrir Lumières à un profil lui ouvre en pratique tout Objets : les puces
  de filtre restent sur la vue. C'était déjà le cas d'Objets.
- La recherche propose encore des vues que le profil ne peut pas ouvrir ; elle
  le ramène alors à l'Accueil. Défaut à part, déjà présent.

Pas de redémarrage de Home Assistant. Tests :
`tests/audit_1211_lot2b_noyau.test.mjs` (B19),
`tests/navbar_suit_le_menu.test.mjs` (assertion modifiée).
