# 0354 — La vue Appareils compte comme l'Accueil

*13 novembre 2026 — appliqué (v3.100.0)*

## Le problème

Sur une vraie installation, la vue Appareils annonçait « 93 appareils répartis
dans 11 pièces » quand l'Accueil montre 7 pièces. La vue comptait les zones de
Home Assistant où se trouvent les appareils, dont quatre zones de service
(le réseau, l'énergie, la sécurité, un couloir) qui ne sont pas des pièces de
la maison dans Loggia.

Sur le même écran, à droite de « Tous », la liste disait « 64 appareils » à
côté d'une puce « Tous 93 » et d'un en-tête « 93 appareils ». Ce nombre-là
était celui des cartes : un groupe de capteurs tient plusieurs appareils sur
une seule carte.

## La décision

- **Les pièces** de l'en-tête sont celles de Loggia, les mêmes que sur
  l'Accueil (`loggia_rooms`, rapprochées par `rmNorm` comme la pièce d'une
  mesure). `statsObjets` (`objets.js`) reçoit cette liste : une zone qui n'est
  pas une pièce de Loggia ne compte plus pour une pièce. Ses appareils restent
  dans le total. Une pièce de Loggia sans appareil ne compte pas non plus : la
  phrase dit « répartis dans ».
- **Un seul total** : à droite du titre de la liste (« Tous », « Chauffage »,
  « Favoris »), le compte est celui de la puce (`compteObjets` : un groupe pèse
  ses membres), plus le nombre de cartes. En tête, sur la tuile, sur la puce et
  à droite de la liste, « appareils » compte la même chose.

## Ce qui ne change pas

- Sous « Capteurs », l'en-tête dit « 38 cartes » : il nomme ce qu'il compte
  (audit du 19/10), à côté d'une puce qui compte 70 appareils.
- La somme des familles reste plus petite que « Tous » : une serrure, une
  sirène, une caméra n'ont pas de famille et ne se voient que sous « Tous ».
  C'est voulu (14/09 et 17/09 : ni puce « Sécurité » ni puce « Caméras »).
- La tuile « scènes » compte les scènes de Home Assistant, pas les scénarios de
  Loggia.

## Les conséquences

Pas de redémarrage de Home Assistant. Dans la démonstration, les zones sont
les pièces : l'en-tête ne change pas (7 pièces), la liste passe de « 89 » à
« 121 appareils ». Calculé en lecture seule sur l'installation réelle avant de
livrer : 11 zones portent des appareils, 7 sont des pièces de Loggia. Tests :
`tests/audit_1211_lot1c.test.mjs`.
