# 0068 — Le mode édition au clavier

Date : 22/09/2026 (v3.69.1). Statut : acceptée. Origine : l'audit du 22/09
(plan d'évolution, point A5), sur « passe à A5 » ; l'ADR 0063 laissait « le
mode édition non vérifié au clavier ».

## Contexte

Le kit d'édition commun (`EditableCard`, `useLayoutEditor`) savait déjà se
déplacer aux flèches : une carte a le focus, ← → la décalent d'un cran, Entrée
ouvre sa fiche. Trois rangements avaient leur propre glisser, sans clavier :
les sections de l'Accueil (colonne principale et rail), les tuiles des pièces,
les cartes d'une vue personnalisée. Et la barre de position d'un média ne se
cherchait qu'au pointeur, alors que la barre de volume voisine avait déjà son
curseur clavier (`kbSlider`).

## Décision

- **Une seule règle, celle du kit** : en édition, l'élément qu'on range prend
  le focus (`tabIndex`), porte son nom et « Déplacer avec les flèches »
  (`aria-label`), et ← → ↑ ↓ le déplacent d'un cran dans son ordre. Les
  touches ne comptent que si c'est l'élément lui-même qui a le focus : un
  bouton de son bandeau (Modifier, Supprimer, taille) garde les siennes.
- **Le même ordre que la souris** : `deplacerSec` écrit l'ordre de la zone
  (`saveGrille`), `deplacerPiece` l'ordre des pièces, `deplacerCv` la liste
  de la vue. Rien de nouveau n'est rangé, seul le geste change.
- **La barre de position est un curseur**, par l'aide déjà là (`kbSlider`) :
  ← → par 5 %, Début et Fin, et la valeur lue en temps plutôt qu'en pour
  cent. Le bouton lecture / pause dit ce qu'il fait.
- Pas de « monter / descendre » dans la fiche Modifier : la carte au focus
  suffit, et une fiche de plus n'aurait rien apporté que le kit n'offre déjà.

## Conséquences

- Frontend seul : un rechargement de page suffit.
- **Ajout du même jour (v3.69.2)** : rien ne se voit à la souris, et c'est
  voulu — mais le geste doit se dire quelque part. Le bandeau d'édition
  l'écrit selon l'appareil : « Au doigt : maintiens une carte, puis
  glisse-la. » ou « Au clavier : Tab jusqu'à une carte, puis les flèches. »
  Et l'appui long qui saisit ne sélectionne plus le texte ni n'ouvre le menu
  du téléphone (`user-select: none`, `-webkit-touch-callout: none` sur les
  trois enveloppes et la carte du kit) : c'était pénible au doigt.
- Reste, dit par l'ADR 0063 : aucun essai avec un vrai lecteur d'écran. Les
  cartes d'édition gardent des boutons dans un élément focalisable (le motif
  du kit), à revoir avec la carte pièce (plan, point M7).

Tests : tests/edition_clavier.test.mjs (4).
