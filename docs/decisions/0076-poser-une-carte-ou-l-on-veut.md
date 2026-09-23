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
- **Un trou voulu reste vide.** La tuile « Ajouter une pièce » se met à la
  première case libre *après* tout le monde, jamais dans un creux choisi.
- **Au clavier**, une flèche déplace la carte d'une case dans son sens — même
  geste que le doigt, même résultat.
- **Le nombre de colonnes est mesuré**, pas supposé : `auto-fill` en met autant
  que la largeur permet. Une place choisie sur un écran large se rabat sur la
  dernière colonne quand la fenêtre rétrécit, sans jamais superposer deux
  cartes.
- **Par type d'écran**, comme le reste des dispositions (ADR 0053) : `places`
  vit dans `loggia_accueil`, décliné par format.

`piecesOrdre` reste : il donne l'ordre de repli tant qu'aucune carte n'a été
posée à la main — une installation existante retrouve son Accueil inchangé — et
c'est lui qui décide encore de la taille par défaut.

## Conséquences

- L'ancienne colonne imposée de la tablette disparaît : la cellule la remplace,
  sur tous les écrans.
- Trois tests qui épinglaient l'ordre ou la mosaïque disent maintenant la
  cellule ; les comportements, eux, sont couverts par `tests/placement.test.mjs`.

Tests : tests/placement.test.mjs (10).
