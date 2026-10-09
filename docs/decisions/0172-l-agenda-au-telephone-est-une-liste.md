# 0172 — L'agenda au téléphone est une liste

*8 octobre 2026 — accepté*

## Le problème

> « Calendrier : sur mobile, en semaines n'affiche pas tout ; en mois si, par
> contre en mois je n'ai que des points, pas d'infos. » — 7 octobre.

Deux vues, deux manières de ne rien montrer.

**La semaine** posait une grille d'heures sur le **seul jour choisi**. Sept
colonnes sur 375 px ne se lisent pas — c'était un choix défendable — mais n'en
montrer qu'une cachait six jours derrière un onglet que rien ne désignait comme
tel. L'utilisateur demandait sa semaine ; il recevait un jour.

**Le mois** affichait une pastille par jour chargé, et rien d'autre. On voyait
*qu'il se passe quelque chose*, jamais *quoi*. Un calendrier qui ne dit pas ce
qu'il y a dedans ne sert à rien.

## La décision

Au téléphone, l'agenda est une **liste**, pas une grille.

- **En semaine**, les sept jours se suivent, chacun avec son en-tête de date et
  ses rendez-vous en clair. On fait défiler la semaine du pouce. Rien n'est
  caché derrière un onglet.
- **En mois**, la grille des pastilles reste — c'est elle qui donne la vue
  d'ensemble, et elle est juste pour cela — mais le jour choisi déroule **sous
  elle** la liste de ses rendez-vous. Un appui, et l'on sait.

Le composant commun est `ListeJours`, et `LigneEvenement` a été extrait pour que
la carte du rail, la liste de la semaine et celle du mois affichent un
rendez-vous **de la même façon**. Trois dessins pour une même chose, c'est trois
occasions de diverger.

La grille d'heures reste au large, où sept colonnes se lisent.

## Ce qu'on n'a pas fait

**Une grille d'heures compressée sur sept colonnes.** Mesuré : à 375 px, une
colonne fait 45 px. Un titre n'y tient pas, et l'heure non plus.

**Un sélecteur de jour en haut de la semaine.** C'est précisément ce qui
existait, sous une autre forme, et qui cachait six jours.

## Ce que les tests tiennent

`tests/agenda_rail.test.mjs` : la semaine liste bien les sept jours, le mois
déroule le jour choisi sous sa grille, et les trois endroits qui affichent un
rendez-vous passent par le même composant.
