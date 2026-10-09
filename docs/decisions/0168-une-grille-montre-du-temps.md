# 0168 — Une grille montre du temps

*9 octobre 2026 — accepté*

## Le problème

> « Regarde ça va pas, c'est coupé. » — 8 octobre, deux captures : un bloc
> orange où il ne restait du titre que le bas des lettres, et un
> « 21:30 – 05:39 » écrasé dans un rectangle minuscule.

Un même symptôme, trois causes.

**La grille s'arrêtait au soir.** `H0 = 6`, `H1 = 23`. Un poste de nuit de
21 h 30 à 5 h 39 n'avait **nulle part** où se dessiner le matin, et se faisait
couper à 23 h le soir. Or l'utilisateur travaille de nuit : c'est précisément
son agenda que Loggia ne savait pas montrer.

**Un rendez-vous n'appartenait qu'à son jour de début.** `toucheJour` rend
`d >= j0 && d < j1` pour un événement à l'heure — et c'est **juste** pour la
carte du rail, qui ne doit pas annoncer deux fois un dîner commencé à 23 h 30.
Un test l'épingle depuis septembre.

**La fin tombait avant le début.** `haut()` ne regardait que `getHours()` :
5 h 39 se ramenait au même jour, sous `H0`, donc `haut(fin) = 0`. La hauteur
retombait sur son plancher de 30 px — trop court pour deux lignes, qui se
comprimaient (`flex-shrink` vaut 1 par défaut) et débordaient de leur propre
boîte. D'où les lettres coupées en deux.

## La décision

### Deux questions, deux fonctions

`toucheJour` ne bouge pas. On ajoute `traverseJour` à côté, et le commentaire
dit pourquoi les deux sont justes :

- *« à quel jour appartient ce rendez-vous ? »* → celui de son **début**. C'est
  ce que demandent la carte du rail, le mini-mois et les compteurs.
- *« quelle part de ce rendez-vous se dessine dans cette colonne ? »* → une
  grille montre du **temps** : un poste de nuit occupe la fin d'un jour et le
  début du suivant.

`bornesDuJour` ramène l'événement aux heures qu'il occupe **ici** : 0 pour ce
qui a commencé hier, 24 pour ce qui finit demain.

### La grille couvre les vingt-quatre heures

`H0 = 0`, `H1 = 24`. La zone défilait déjà ; elle s'ouvre maintenant sur une
heure utile — l'heure courante moins une, jamais plus bas que 7 h — et **une
seule fois**, à l'ouverture : refaire le calcul à chaque rendu annulerait le
geste de celui qui lit.

### Le bloc ne coupe plus son texte

Deux lignes réclament 40 px (padding 10, titre 15, écart 1, heures 13). En
dessous, l'heure s'en va — elle se lit déjà dans la position du bloc — et le
titre seul tient dans 24. `flexShrink: 0` sur les deux lignes : sans lui, elles
se compriment et le texte sort de sa boîte.

### Les journées entières ont leur bande

Elles se posaient **dans** la grille, à l'heure zéro : « Repos — toute la
journée » recouvrait le début d'un poste de nuit, et son propre titre se faisait
couper. Une journée entière n'a pas d'heure : sa place est en haut, avec les
jours, dans une bande collante qui ne paraît que s'il y en a. Au téléphone, où
la vue est une liste et non une grille, elles restent où elles sont.

## La démonstration portait le trou

Aucun de ses rendez-vous ne franchissait minuit : elle ne pouvait **ni montrer
le défaut, ni le protéger**. Un « Poste de nuit » de 21 h 30 à 5 h 39 s'y ajoute.
Mesuré après correction : **deux** blocs, 120 px le soir (21 h 30 → minuit) et
**271 px** le matin (minuit → 5 h 39).

## Ce qu'on n'a pas fait

**Changer `toucheJour`.** Un test de septembre l'épingle, et pour la carte du
rail il a raison : « 23 h 30 appartient à son jour, même s'il déborde après
minuit ». Deux questions différentes méritent deux fonctions, pas un drapeau.

**Replier la nuit.** Montrer 24 heures coûte 1 152 px de hauteur dans une zone
qui en montre 596 — mais un agenda qui cache la nuit ne sert pas celui qui y
travaille.

## Ce que les tests tiennent

Un test dans `tests/agenda_rail.test.mjs` : `toucheJour` inchangé,
`traverseJour` vrai sur les deux jours et faux sur le troisième, les bornes du
soir (21,5 → 24) et du matin (0 → 5,65), les bornes horaires de la grille,
le placement à l'ouverture **une seule fois**, le seuil des deux lignes, le
`flexShrink`, la bande des journées entières, et le poste de nuit de la
démonstration.
