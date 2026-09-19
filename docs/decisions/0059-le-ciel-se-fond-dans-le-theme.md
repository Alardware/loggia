# 0059 — Le ciel se fond dans le thème

Date : 19/09/2026 (v3.59.1). Statut : acceptée. Retour de l'utilisateur,
captures du téléphone à l'appui (quatre thèmes, puis un zoom sur les
scénarios) : « avec les thèmes et la météo animée, ça devrait se fondre, se
marier parfaitement ; là la transition est brutale ; et les cartes scènes
pareil, le contour ça fait carré, pas propre ».

## Contexte

- Le fond météo de l'Accueil (`.o-wx3d` : un canvas WebGL sur 44vh, 36vh au
  téléphone) était recouvert d'un voile qui passait du bleu nuit de Loggia
  (`rgba(11,16,27,…)`) à `var(--o-bg)` tout en bas.
- Or la page est peinte de `var(--o-bggrad, var(--o-bg))` : un thème à fond
  dégradé (iOS, Neumorphix, The Projekt, Dracula, Tokyo Night…) ne finit pas
  sur `--o-bg`. Mesuré en démo au téléphone, bord gauche, à 36vh : iOS
  `0a0b0c` → `111115`, The Projekt `020b0e` → `020f15` ; Loggia, à fond uni,
  `090c14` → `090c15`. Une marche nette, pile au niveau des scénarios — et la
  même sur une photo de fond.
- Au téléphone, la rangée des scénarios (`.grid-qscenes`, `overflow-x: auto`)
  rognait l'ombre des cartes en haut, en bas et à droite : un rectangle autour
  des cartes arrondies, que la lueur claire de Neumorphix rendait très
  visible. Les favoris avaient quitté leur ombre pour la même raison (01/09).

## Décision

- Le ciel s'efface par un MASQUE (`mask-image`, doublé de `-webkit-`) :
  opaque jusqu'à 30 % de sa hauteur, puis une courbe douce jusqu'au
  transparent. Dessous, on voit le vrai fond de la page — dégradé, couleur
  unie ou photo : plus de marche possible.
- Le voile ne fait plus que foncer le ciel pour les textes posés dessus, et
  dans la teinte du thème (`color-mix` avec `--o-bg`, sous `@supports`) ; il
  ne finit plus sur une couleur opaque. La barre du haut posée sur le ciel
  (PC) prend la même teinte. Sans `color-mix`, le repli garde l'ancienne.
- Le ciel plein écran (`.o-sky-full`) n'est pas masqué.
- Au téléphone, la rangée des scénarios n'a plus d'ombre, comme les favoris.
  4 px de rembourrage, annulés par une marge négative, gardent entier
  l'anneau de focus. Sur PC, la rangée laissait déjà la place aux ombres :
  inchangée.

## Conséquences

- Tous les thèmes, clairs ou sombres, et la photo de fond : le ciel se fond
  sans couture. Vérifié en démo à 390 px (iOS, Neumorphix) : plus de saut à
  36vh, et plus de rectangle autour des scénarios.
- Le masque porte sur un calque animé : le compositeur l'applique au GPU,
  sans le recalcul par image du flou (`backdrop-filter`) qu'on évite
  au-dessus du ciel.

Tests : tests/accueil_ciel_fondu.test.mjs (3).
