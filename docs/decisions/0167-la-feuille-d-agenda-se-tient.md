# 0167 — La feuille d'agenda se tient

*8 octobre 2026 — accepté*

## Le problème

> « L'affichage est pas top, c'est rogné. De plus l'affichage ne me plaît pas
> trop, regarde je t'ai partagé les images de l'agenda de Google pour
> inspiration. Et moi les jours en haut doivent être fixes quand je descends, et
> non cachés. Autre chose : quand je suis sur le planning, l'arrière-plan suit
> aussi le mouvement, c'est pénible. » — 8 octobre, avec une capture de Loggia
> et cinq de Google Agenda.

Quatre reproches sur une même vue. Trois sont des défauts mesurables, le
quatrième est une question d'allure.

**C'est rogné.** La fiche d'un événement s'ouvrait **toujours à droite**
(`left: '100%'`). Pour les derniers jours de la semaine, elle sortait de la
feuille : mesuré à **1571 px** quand la feuille s'arrête à 1327 — 244 px dehors.
Le conteneur se mettait alors à défiler horizontalement (1161 contre 894 de
large), d'où la barre en bas de sa capture.

**Les jours défilaient.** L'en-tête était le premier enfant de la zone qui
défile : passé huit heures de descente, on ne savait plus quelle colonne était
quel jour.

**Le fond suivait.** `overscroll-behavior` valait `auto` : arrivé en bout de
course, le navigateur passait la molette à la page derrière la feuille.

**L'allure.** De grosses tuiles pleines « Lun 5 » sur une ligne, sept colonnes
espacées de 6 px chacune dans son fond arrondi, des événements en fond
translucide sous un liseré — la semaine se lisait comme sept cartes, pas comme
une grille d'heures.

## La décision

### La fiche s'ouvre du côté où il y a de la place

```js
const ficheAGauche = i > (colonnes.length - 1) / 2;
…{...(aGauche ? { right: '100%', marginRight: 8 } : { left: '100%', marginLeft: 8 })}
```

Passé la moitié de la semaine, elle bascule à gauche, où il reste au moins
quatre colonnes. Mesuré après : plus rien ne sort de la feuille, et plus de
défilement horizontal.

### Les jours restent en haut

`position: sticky; top: 0` dans la zone qui défile, avec un fond **opaque** —
sans quoi les heures passent au travers. Mesuré : l'en-tête reste à 302 px après
400 px de descente.

### Le défilement s'arrête dans la feuille

`overscroll-behavior: contain`, sur les deux formats — celui d'ordinateur et
celui de téléphone.

### L'allure, d'après les captures

- Le **jour** part au-dessus, en petit ; le **chiffre** dessous, dans une
  pastille ronde qui ne se remplit que pour le jour choisi — aujourd'hui garde
  son liseré. Les grosses tuiles pesaient plus que la grille qu'elles coiffent.
- Les **colonnes sont jointives**, séparées d'un trait d'un pixel, au lieu de
  six pixels d'écart et d'un fond arrondi chacune.
- Les **événements sont des blocs pleins** de la couleur de leur agenda, texte
  blanc. À 18 % d'opacité sous un liseré, tous se ressemblaient de loin et la
  couleur de l'agenda ne se lisait plus.
- La grille et la colonne latérale prennent un **fond opaque** : à travers le
  verre de la feuille, on lisait les cartes de l'Accueil sous le mois, les
  agendas et les heures.

## Ce qu'on n'a pas fait

**Reprendre la mise en page de Google à l'identique.** Les captures servaient
d'inspiration, pas de modèle : la colonne latérale de Loggia garde son mini-mois
et sa liste d'agendas, et l'en-tête garde ses trois vues et son bouton
d'ajout.

**Sortir l'en-tête de la zone défilante.** Collé dedans, l'alignement des
colonnes est garanti sans calcul ; posé au-dessus, il faudrait compenser à la
main la largeur de la barre de défilement.

## Ce que les tests tiennent

Un test dans `tests/agenda_rail.test.mjs` : l'en-tête collant et son fond
opaque, le choix du côté de la fiche et sa transmission, les **deux**
`overscroll-behavior: contain`, la pastille ronde, les colonnes jointives et
leur trait, les blocs pleins.
