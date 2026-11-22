# 0380 — Sur le téléphone aussi, la lumière a son interrupteur

*20 novembre 2026 — appliqué (v3.100.0) (gestion des lumières)*

## Le problème

Sur une carte étroite — le téléphone, une carte de moins de 188 px de
contenu —, la carte d'une lumière suivait depuis la passe téléphone le
modèle 1c de la grille commune (ADR 0202) : la plaque de l'ampoule ÉTAIT
l'interrupteur, sans rien qui le dise, et le pourcentage montait en haut à
droite. La bascule ambre de la carte large n'y paraissait que pour une lampe
sans variateur (ticket #43).

Un retour d'utilisateur demandait la bascule, comme sur le PC et la
tablette. Le 05/11, un premier essai — la bascule en bas, la barre
raccourcie — avait été refusé. Le 20/11, deux variantes lui ont été montrées
dans la démo, à 390 et 320 px :

- **A**, la disposition du PC telle quelle : elle tient en largeur, mais sur
  une lampe allumée le grand pourcentage, à côté du texte, coupe le nom et la
  phrase (« Plafonni… », « Allumée de… ») ;
- **B**, la bascule en haut à droite, à la place du pourcentage, et le
  pourcentage en tête de la phrase : les noms restent entiers, la phrase
  tient à 390 px, et rétrécit à 320 px comme elle le fait déjà.

Sa réponse : « variante B ».

## La décision

**La ligne du haut est la même sur toutes les cartes** : la plaque à gauche,
un dessin, et la bascule ambre à droite (`RmBascule`), d'après l'état
affiché — `turn_on` / `turn_off`, jamais `toggle`. La plaque n'est plus un
bouton : un appui y descend à la surface, qui ouvre la fiche, comme partout
ailleurs sur la carte — un seul interrupteur visible. `PlaqueBascule`, sa
zone de toucher de 44 × 44 (`.o-gab-plaque`) et le chiffre du haut de la
carte d'une lumière s'en vont.

**Le pourcentage ouvre la phrase de la carte étroite.** Allumée, avec un
pourcentage, `phraseLumiere` rend une forme courte (`court`), que seule la
carte étroite montre (`o-seul-etroit`) : « 45 % · depuis 18:05 »,
« 45 % · s'éteint à 21:10 ». Le mot « Allumée » tombe : le pourcentage le
dit. Sa longueur règle la taille de la phrase (`--o-n`, de 12 à 10,5 px),
comme avant. Éteinte sous le doigt, la phrase étroite dit le chiffre seul le
temps du glisser ; une lampe sans pourcentage (un interrupteur déclaré
lumière, une lampe allumée sans `brightness`) garde sa phrase. La carte
large, la barre, l'encre de la phrase (T8) et ce que la surface dit au
lecteur d'écran ne changent pas.

Deux textes nouveaux, dans les six catalogues : « {n} % · depuis {h} » et
« {n} % · s'éteint à {h} ».

## Ce que ça coûte

Sur un très petit téléphone (320 px), un nom long passe sur deux lignes et
une phrase de minuteur peut se couper au bout, comme aujourd'hui. Le geste
« toucher l'ampoule pour allumer », appris depuis le 15/10, ne marche plus :
toucher l'ampoule ouvre la fiche.

## Les tests

`tests/lumieres.test.mjs` (la forme courte), `tests/carte_lumiere.test.mjs`
(la ligne du haut, la bascule sur la carte étroite, la phrase courte, le
chiffre sous le doigt), `tests/icone_choisie.test.mjs` et
`tests/lot13_generique_lampe.test.mjs` (une seule plaque, plus de bouton).
