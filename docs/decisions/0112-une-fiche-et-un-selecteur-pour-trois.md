# 0112 — Une fiche, et un sélecteur pour trois

Date : 30/09/2026. Statut : appliqué. Aucun redémarrage de Home Assistant ;
`src/` change — **le paquet est rebâti**.

« Il y a la nouvelle interface de personnalisation des entités, plus les
icônes. » La fiche « Modifier l'entité » a été refaite d'après les maquettes, et
ce qu'elle a gagné, les deux autres fiches le gagnent aussi.

## Un seul sélecteur d'icône, posé à trois endroits

Jusqu'ici la fiche d'une entité avait une grille paginée, la fiche d'une pièce
avait ses trente icônes à elle, et un scénario n'avait rien. Trois écrans, trois
façons de choisir la même chose.

`ChoixIcone` est maintenant un composant unique : une recherche qui fouille
**toute** la bibliothèque (« lave » trouve le lave-vaisselle, dont la clé est
`dishwasher`), une bande de familles qui défile, et les dernières choisies en
tête. La fiche d'une pièce garde ses trente icônes — mais comme **suggérées**,
la bibliothèque entière derrière.

Les dernières choisies sont notées **par le sélecteur lui-même** : les trois
fiches en profitent sans avoir à y penser.

## Un segment, pas deux boutons

« Pourquoi tu veux pas mettre comme ça », deux fois de suite, avec la capture.
Deux boutons côte à côte, chacun avec son liseré et un écart entre eux, se
lisent comme deux réglages indépendants. Un segment, c'est **un** rail, et la
moitié choisie posée dedans en accent plein.

**Décidé :** `Segment` rend ce rail, et toute paire exclusive y passe — la
largeur d'une carte, les onglets d'un appareil.

## L'aperçu montre le mouvement

Un appareil dessiné porte son animation, mais la grille les fige : sans aperçu,
on choisit une icône sans jamais voir ce qu'elle fait. La fiche montre donc le
dessin **en mouvement** en tête, avec un interrupteur qui n'allume que l'aperçu.
Il ne commande rien, et il le dit.

## Ce qui a été écarté

Un bouton de veille dans l'en-tête de la fiche, commencé puis retiré en entier —
« non c'est bon j'avais pas vu le bouton ». La reconstruction a produit un
paquet à l'empreinte identique, ce qui prouve que le retrait était propre.
