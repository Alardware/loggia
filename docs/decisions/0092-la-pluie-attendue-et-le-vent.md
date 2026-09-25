# ADR 0092 — La pluie attendue et le vent

**Date** : 2026-09-25
**Statut** : décidé et appliqué ; gardé en local.

Deuxième des quatre points d'**A8**. Il solde le « non fait » de l'ADR 0038 :
« la pluie attendue (probabilité, cumul) et le vent, **que la capture ne montre
pas** ».

## Pourquoi ils avaient attendu

La carte météo du rail a été dessinée d'après une capture fournie le 17/09. Ce
que la capture ne montrait pas n'a pas été ajouté — c'était la bonne décision :
on ne complète pas une maquette par déduction.

Mais Home Assistant donne ces valeurs, la carte les avait sous la main, et
savoir s'il va pleuvoir est la deuxième question qu'on pose à une météo, après
la température.

## La décision

**Une ligne discrète sous l'en-tête**, avant la bande des heures. Jamais une
colonne de plus : la disposition de la capture ne bouge pas.

- La **probabilité** et le **cumul** viennent de la prévision du JOUR — la même
  entrée que `extremesDuJour`, avec la même règle de date locale : un service
  qui date ses jours à minuit UTC tomberait sinon la veille.
- Le **vent** vient des attributs de l'entité (`wind_speed`, `wind_speed_unit`).

**Rien n'est inventé.** Les trois valeurs sont facultatives et indépendantes :
un service qui ne donne pas la probabilité, ou pas le vent, laisse sa valeur à
`null` et la carte n'affiche que le reste. Sans aucune des deux, la ligne ne se
dessine pas.

## Le cumul ne sort pas seul

**Un cumul de zéro n'est pas rien** : c'est l'information « il ne pleuvra pas ».
Mais une ligne « 0 mm » sous une carte qui annonce « Ensoleillé » est du bruit,
pas un renseignement.

Le calcul rend donc les trois valeurs telles quelles, et c'est la carte qui
tranche : le cumul ne s'affiche qu'**à côté d'une probabilité**, et seulement
s'il est non nul. La règle est dans le module pur, écrite, pas devinée à la
lecture du JSX.

## Où vit le calcul

Dans `src/meteo.js`, comme tout le reste : `pluieEtVent(previsionsJour,
attributs, maintenant)` est pure, testée à sec, et `cartemeteo.jsx` ne garde
que le dessin. C'est la règle posée par l'ADR 0038, et elle tient.

## Vérifié à l'écran

Sur la démonstration : « 10 % » et « 9 km/h » sous « Max 26° · Min 16° ». Le
cumul ne s'affiche pas — la prévision du jour porte `precipitation: 0`, ce qui
est exactement le cas prévu.

Les deux icônes, `raindrops` et `wind`, existent dans la police livrée.

## Conséquences

- Un texte nouveau dans les sept langues : `{n} mm`. Le symbole est le même
  partout — c'est une unité SI, pas un mot ; la clé existe pour que le jeton
  `{n}` passe par le formateur de nombres de la langue.
- L'unité du vent est celle que Home Assistant annonce, jamais convertie : une
  installation en mph lit des mph.
- Rien côté serveur, aucun redémarrage.

Tests : `tests/accueil_meteo.test.mjs` pour le module pur ; la carte simple du
catalogue (`CvWeather`) n'est pas touchée.
