# ADR 0024 — Le mode édition : une carte d'édition, un bandeau, un glisser libre — partout

**Statut** : appliqué (v3.20.0) — `BandeauEdition`, `EditableCard`, `CardEditSheet`, `useLayoutEditor`.

## Contexte

Chaque vue à grille (pièces, volets, l'ancienne vue Objets) avait son propre
bandeau d'édition, ses boutons, et une carte vivante sous un voile de saisie
avec un « × » en coin. Le déplacement posait un fantôme à côté de la carte
et ne rangeait les autres qu'à la dépose ; au doigt, il fallait tenir
380 ms, sans quoi le geste défilait la page. Retour user : « je dois pouvoir
la bouger n'importe où, dans tous les sens, tant que je la tiens ».

## Décision

**Un seul mode édition, celui de la maquette du 14/09, partout où l'on range
des cartes.**

- **Le bandeau** : le mot d'ordre, « Ajouter une entité », « Toutes les
  entités » (retour à la liste automatique) et « Terminer ». Titres de
  section et cartes libres vivent dans la feuille d'ajout, pas dans le
  bandeau.
- **La carte d'édition** remplace la carte vivante : même place, même teinte,
  l'icône, un crayon, le nom, « Domaine · identifiant », Modifier et
  Supprimer. Rien ne se pilote en édition : on range, on ne commande pas.
- **La fiche « Modifier l'entité »** : le nom (pour cette vue), le domaine
  (celui de Home Assistant — seule une prise peut se déclarer lumière), la
  pièce (déplacer l'entité d'une grille à l'autre, en une écriture pour
  toutes les pièces), l'identifiant, l'épingle de l'accueil ; puis la carte
  du catalogue et la largeur. **Pas d'« état de départ »** : Loggia n'affiche
  pas ce que Home Assistant n'a pas dit.
- **Le glisser** : on saisit la carte n'importe où ; à la souris tout de
  suite, au doigt après 200 ms. Le fantôme suit le pointeur partout, et les
  autres cartes se rangent **en direct** autour de la place visée (ordre
  temporaire pendant le geste, une seule écriture à la dépose).
- **La vue Objets** retrouve son éditeur (`loggia_objlayout`) : ordre,
  retraits, ajouts et noms, sous les filtres.

## Conséquences

- Une seule façon d'éditer, un seul dessin, un seul geste — quatre vues.
- Les anciennes clés d'agencement restent valables ; rien à migrer.
- Perdu, assumé : le champ « Entité » de l'ancienne fiche (remplacer une
  carte par une autre entité : retirer puis ajouter fait la même chose).
