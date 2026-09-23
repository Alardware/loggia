# 0076 — Poser une carte où l'on veut, sans que rien d'autre ne bouge

Date : 23/09/2026. Statut : acceptée. Demande : « admettons que sur cette image
je veuille placer une pièce sous la salle de bain, je ne peux pas, j'aimerais
pouvoir déplacer et mettre les cartes comme je veux », puis « je veux juste
pouvoir placer une carte où je veux sans que tout bouge ».

## Contexte

Les cartes de pièces de l'Accueil étaient une **liste ordonnée**. Chacune a une
taille — compacte, une rangée de 88 px ; standard, deux — et le navigateur les
posait lui-même, en `grid-auto-flow: row dense` : chaque carte tombait dans le
premier creux où elle tenait.

Trois conséquences :

- un trou n'était pas un endroit qu'on vise, seulement un reste — on ne pouvait
  pas décider de poser une carte sous une autre ;
- glisser une carte **réordonnait toute la liste** : les voisines bougeaient
  sous le doigt ;
- `dense` rebouchait tout : un vide voulu se remplissait tout seul.

Seule la tablette imposait la colonne (`gridColumn: (i % 3) + 1`), pour éviter
que sa mosaïque ne parte en escalier — un pansement sur le même problème.

## Décision

Une carte n'a plus un rang : elle a une **cellule**, colonne et rangée.

- **`src/placement.js`**, pur et testé : `disposer` dit où chaque carte se pose,
  `poser` déplace une carte sur une cellule, `cellulePointee` lit la case sous
  le doigt, `colonnesDe` compte les colonnes que la grille montre vraiment.
- **Déposer sur une case vide ne déplace que la carte déposée.** Déposer sur une
  carte **échange les deux**, et personne d'autre. Une standard lâchée sur deux
  compactes en touche deux : la première prend la place libérée, la seconde
  repart au premier creux — seul cas où une troisième carte bouge, et il n'a pas
  d'autre issue.
- **Rien ne bouge pendant le geste** : la grille reste immobile, seule la case
  visée s'allume, et l'échange se fait au lâcher. C'est la demande, mot pour
  mot.
- **Poser une carte fige la grille telle qu'elle est.** `poser` écrit la place
  de tout le monde, pas seulement celle de la carte déplacée. Sans cela, les
  autres — qui n'avaient encore aucune place enregistrée — se recalaient au
  premier creux et venaient combler le trou qu'on venait de faire : tout
  bougeait, exactement ce qu'il ne fallait pas (vu en démonstration le 23/09,
  au tout premier geste).
- **Un trou voulu reste vide.** La tuile « Ajouter une pièce » se met à la
  première case libre *après* tout le monde — le balayage part de la rangée de
  la carte la plus basse, sinon la tuile remontait se loger dans le creux.
- **Au clavier**, une flèche déplace la carte d'une case dans son sens — même
  geste que le doigt, même résultat.
- **Le nombre de colonnes se décide, il ne se lit pas.** `colonnesPour` le tire
  de la largeur mesurée (deux au téléphone, trois pour la mosaïque de la
  tablette, sinon autant de cartes de 210 px que la place permet), et la grille
  le reçoit : `repeat(n, minmax(0,1fr))`. Le lire sur le style calculé se
  mordait la queue — une carte posée hors du modèle y ajoute une colonne
  *implicite*, comptée comme une vraie à la lecture suivante. Avec la règle CSS
  qui imposait deux colonnes au téléphone (`!important`), la grille annonçait
  quatre colonnes pour deux vraies et les cartes des deux premières
  s'écrasaient à zéro pixel de large : deux pièces invisibles. Cette règle CSS
  est donc partie — c'est le calcul qui décide, comme pour les caméras.
  Une place choisie sur un écran large se rabat sur la dernière colonne quand
  la fenêtre rétrécit, sans jamais superposer deux cartes.
- **Par type d'écran**, comme le reste des dispositions (ADR 0053) : `places`
  vit dans `loggia_accueil`, décliné par format.

`piecesOrdre` reste : il donne l'ordre de repli tant qu'aucune carte n'a été
posée à la main — une installation existante retrouve son Accueil inchangé — et
c'est lui qui décide encore de la taille par défaut.

## Conséquences

- L'ancienne colonne imposée de la tablette disparaît : la cellule la remplace,
  sur tous les écrans.
- Plus une seule ligne de CSS ne fixe les colonnes des pièces. Une règle que le
  calcul ne voit pas lui ferait poser des cartes dans des colonnes qui
  n'existent pas — un test le dit, à côté de celui des caméras.
- Trois tests qui épinglaient l'ordre ou la mosaïque disent maintenant la
  cellule ; les comportements, eux, sont couverts par `tests/placement.test.mjs`.
- Vérifié dans le navigateur, sur la démonstration : déposer sur une case vide,
  échanger deux cartes, et la grille rétrécie de trois colonnes à deux sans
  qu'aucune carte ne se superpose ni ne disparaisse.

Tests : tests/placement.test.mjs (12).
