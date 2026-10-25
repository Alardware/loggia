# 0179 — Le corps d'une carte de pièce n'a pas de marge

*9 octobre 2026 — accepté, déployé chez lui (rien de publié)*

## Le problème

> « Il y a un souci au niveau de l'organisation, arrange la carte volet que ce
> soit au même niveau que l'Echo. » — 9 octobre

Mesuré sur les 38 cartes de la démonstration : **seules les cartes volet
débordaient**, de 12 px. Le titre du volet tombait à 69 px du haut de sa carte
quand celui du média était à 57, et ses boutons à 148 contre 136 — presque
collés au bord.

## La cause

Le corps de sept cartes de pièce portait `marginTop: 14`. Or leur parent est en
`space-between` : le corps est **déjà** collé en bas. La marge n'ajoute rien tant
qu'il reste de la place, et pousse le corps **dehors** dès que le contenu
remplit la carte.

Le volet est la seule à la remplir : titre, état, barre et trois boutons font
111 px pour 112 de place.

Ce n'est pas la cause qu'on voit en regardant : à l'œil, on aurait raboté les
boutons du volet ou aminci sa barre.

## La décision

La marge part des sept cartes : `RoomFeederCard`, `RoomPlantCard`,
`RoomCoverCard`, `RoomClimateCard`, `RoomPilotCard`, `EditableCard` et
`CartePieceEdition`.

Rien ne change là où elle ne servait pas, et le volet est réparé — mesuré
après : titre à 56 contre 57 pour le média, boutons à 135 contre 136. La raison
est écrite dans le code, au-dessus de chaque corps (« PAS DE MARGE SUR LE CORPS
(09/10) »), là où on la relira.

Les six autres auraient débordé au premier ajout de ligne. La barre du planning
de chauffe (plan 2 du chantier Chauffage) en est un : elle s'ajoute au corps de
`RoomClimateCard` et de `RoomPilotCard`.

## Ce qu'on n'a pas fait

**Toucher au pied du volet.** Son écart de 12 px entre la barre et les boutons
n'est pas la marge du corps : il reste.

## Ce que les tests tiennent

`tests/lot13_generique_lampe.test.mjs`, « le corps d'une carte de pièce n'a pas
de marge » : aucune carte ne reprend `marginTop: 14` juste avant son titre
(`RM_NAME`) ; la raison reste écrite dans le code ; les trois boutons du volet
n'ont pas changé.
