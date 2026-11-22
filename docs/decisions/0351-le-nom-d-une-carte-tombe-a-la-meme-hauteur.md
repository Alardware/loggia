# 0351 — Le nom d'une carte tombe à la même hauteur

*12 novembre 2026 — appliqué (v3.100.0)*

## Le problème

Dans une pièce, au PC, le nom des cartes ne tombait pas à la même hauteur. Sur
des cartes de 184 px, il était à 69 px du haut pour une lumière, un chauffage
ou un volet ; à 65 pour une TV ou une enceinte ; à 72 pour des particules ou
des COV ; et à 129, au pied, sous un grand vide, pour une carte sans
commandes : un interrupteur, un détecteur, un ouvrant, une borne, un
chauffe-eau. Sur le téléphone, « Porte de garage motorisée » ou « Détecteur de
monoxyde salon » finissaient en « … » sur une carte qui avait la place d'une
deuxième ligne.

## La décision

Sur l'aperçu validé le 12/11 : le nom de toutes les cartes sous l'icône, à
69 px du haut. Trois pièces du gabarit (`cartes/briques.jsx`) le fixent, sans
nombre posé carte par carte :

- `RM_CARD_HAUT` : la carte range son contenu depuis le haut. Le pied d'une
  carte qui en a un (commandes, barre, jauge, « Voir le flux ») descend par sa
  marge automatique ; le dessin d'une porte ou d'une fenêtre ne bouge pas.
- `RM_SOUS_PLAQUE` : le nom part 14 px sous l'icône, 10 sur la carte étroite.
- `RM_GAUCHE` : la colonne du nom reste en haut de sa rangée quand le chiffre
  voisin est plus haut qu'elle.

La carte générique et celle d'un portail ou d'un garage entrent dans la grille
commune (`o-gabarit`) : sur la carte étroite du téléphone seulement, leur nom
prend deux lignes au plus. « Qualité de l'air » écrit son chiffre sur la ligne
du nom, comme les autres mesures, et la plante écrit son « % » en petit.

## Les conséquences

Mesuré dans la démonstration, au PC : les 89 cartes de la vue Objets ont leur
nom à 69 px. Une TV ou une enceinte en lecture gardait 8 px au-dessus de sa
barre de progression : elle n'en garde que 4, pour que son pied reste à la
hauteur de celui de ses voisines (le nom descend de 4 px, la barre ne bouge
pas). Un garage avec jauge reste plein : son nom ne descend pas.

Sur le téléphone, rien ne change pour les cartes qui avaient déjà leur nom
sous l'icône (63 px pour une lumière, 65 pour les autres, 66 pour une
mesure) ; celles qui le posaient au pied le remontent à 65. Tests :
`tests/audit_1211_lot1b.test.mjs`.
