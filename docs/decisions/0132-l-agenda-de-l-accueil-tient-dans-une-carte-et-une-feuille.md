# 0132 — L'agenda de l'Accueil tient dans une carte et une feuille

Date : 02/10/2026. Statut : appliqué. **Redémarrage de Home Assistant requis**
(mise à jour d'un composant personnalisé) ; le paquet est rebâti.

L'Accueil portait **trois** objets qui disaient la même chose : la carte
« Agenda » du rail, la carte « Rappels », et le **widget « calendrier »** en
option (styles « semaine » et « mois »). Un dessin partagé — « on va remplacer
mes 2 cartes agenda de l'accueil par ceci » — les remplace par **une carte et
une feuille**, l'une pour un coup d'œil, l'autre pour tout le reste.

## La carte

`src/agendarail.jsx`, `CarteAgenda` : le jour choisi en sous-titre, le prochain
lever ou coucher **s'il existe un `sun.sun`**, la bande des sept jours avec un
point sous ceux qui portent un rendez-vous, puis **deux** événements et un
« + n autres ce jour-là ». Chaque événement prend la **teinte de son
calendrier** — une teinte tirée d'un hachage stable du nom d'entité, prise dans
une palette de six, pour que le même agenda garde sa couleur d'un rechargement
à l'autre.

L'événement porte son calendrier dans **`_cal`**, pas dans `calendar` : lire la
mauvaise clé donnait six teintes identiques et des noms vides, sans rien
signaler.

## La feuille

Deux dispositions, parce que le dessin en montrait deux et qu'une seule ne
suffisait pas — « tu n'as pas respecté ce que je t'ai partagé, la version
mobile et PC » :

- **Grand écran** : deux colonnes, `248px minmax(0,1fr)`. À gauche le mini-mois
  et la liste « Mes agendas » avec ses cases ; à droite les trois vues
  **mois · semaine · jour**, la grille des heures sur sept colonnes, et la
  fiche d'un événement en surimpression.
- **Téléphone** : la même matière, en une colonne.

**La feuille garde sa hauteur en changeant de vue** — « quand je passe en mois
ça change la taille, la taille ne doit pas changer ». Le contenu défile dans une
hauteur fixe (596 px sur grand écran, 58 vh au téléphone), au lieu de laisser
chaque vue imposer la sienne. C'est l'exception que la décision 0056 prévoit :
une feuille à onglets tient une hauteur, les autres suivent leur contenu.

**La vue « mois » demande sa propre plage.** La carte ne charge que sept jours ;
un mois affiché avec sept jours d'événements est un mois vide. La feuille
remonte donc la plage dont elle a besoin (`onPlage`), et la rend en se fermant.

## Un seul formulaire d'événement

Le bouton **« + Événement »** était l'occasion d'en écrire un deuxième. Le
formulaire existait déjà dans `App.jsx` : il est **déplacé** tel quel dans
`src/formevenement.jsx`, et les deux feuilles l'appellent. Deux formulaires,
c'est deux validations qui divergent au premier correctif.

## Et le widget « calendrier » s'en va

« Retire-la du coup elle ne sert plus à rien. » Il ne restait de lui qu'une
semaine sans ses événements et un mois sans ses rendez-vous, à côté d'une carte
qui dit les deux. Ce qui part avec lui :

- `CalendrierRail`, `CalendrierSemaine`, `CalendrierMois`, `FeuilleVilles`
  (`widgetsrail.jsx`) ;
- ses calculs dans `horloge.js` — `semaineDe`, `grilleMois`, `heureVille`,
  `fuseauValide`, `villesDe`, `villesDefaut`, `VILLES_MAX`,
  `resumeAgendaDuJour` ;
- `evenementsAVenir` (`agenda.js`), dont il était le seul lecteur : la carte
  montre le **jour entier**, passé compris, comme un agenda ;
- dix clés dans les catalogues de langue, et son entrée dans la bibliothèque
  des cartes.

Ce qui **reste** : `premierJourSemaine`, que la fiche d'un robot utilise pour
ranger son planning, et `prochainSoleil`, que la nouvelle carte affiche. La
**carte** `CvCalendrier`, posable sur une vue, n'est pas concernée : c'est un
autre objet, et il ne bouge pas.

**Les heures d'ailleurs disparaissent avec le mois.** Elles ne vivaient que dans
ce widget, et personne ne les a demandées ailleurs ; elles reviendront si elles
manquent, à leur place et pas en passagères d'un calendrier.

**Une vieille clé `villes` reste en base, inerte.** Le code ne la relit plus.
Rien ne la supprime : un agencement enregistré n'est pas réécrit pour retirer ce
qui ne gêne personne.

## Quatre défauts que seule la relecture à l'écran a montrés

Tous les tests passaient, le lint aussi. Il a fallu ouvrir la feuille.

- **« Journée » voulait dire « en journée ».** Un événement sur la journée
  entière empruntait `tr('Journée')`, la clé du réglage de veille jour/nuit :
  elle se traduit « Daytime », « Tagsüber », « De día ». La colonne de 42 px dit
  maintenant « Jour » ; « Toute la journée » reste en entier sous le titre.
- **« 1 événements ».** Trois comptes passaient par `tr()` sans forme
  singulière. Ils passent par `trN`, et les deux clés manquantes sont entrées
  dans les six catalogues.
- **Un jour qui ne pouvait jamais être choisi.** Dans la grille des heures,
  `sel` finissait par `&& false`, et la prop `jourSel` que les deux appelants
  passaient n'était même pas déclarée : l'en-tête de colonne ne marquait rien.
- **La barre de tête se disloquait au téléphone.** Sur 390 px, flèches, vues et
  bouton demandent 373 px pour 344 : la flèche « suivant » ouvrait une deuxième
  ligne et la croix tombait seule sur une troisième, à gauche. Deux rangées
  nommées — titre · « Aujourd'hui » · croix, puis flèches · vues · bouton —, et
  « + Événement » se réduit à son « + » au téléphone, son nom dans
  `aria-label`. Vérifié à 390 px et à 320 px, rien de coupé.

Et un défaut sans rapport, vu au passage : les repas du distributeur de la
**démonstration** n'avaient pas de libellé, si bien que la carte Rappels
affichait « undefined · 45g ».

## Et les flèches, qui ne défilaient pas

« Je ne peux pas faire défiler les jours et mois avec les flèches » — ni sur
ordinateur, ni sur téléphone. **Trois causes distinctes sous un seul symptôme**,
et aucune n'aurait suffi seule.

**La feuille ne sortait jamais de sept jours.** Le jour affiché se cherchait
dans les sept jours du rail (`joursAgenda(base).find(…)`) : au-delà, il n'y
était pas et retombait sur aujourd'hui. Les flèches changeaient bien la clé, le
rendu suivant l'annulait. Elle se **relit** maintenant depuis la clé —
`jourDeCle`, l'inverse de `cleJour`, qui vérifie ce qu'il construit (le 31
février n'existe pas).

**Au téléphone, la bande était figée** sur les sept jours à partir
d'aujourd'hui, et le titre ne disait que le mois : en vue Semaine, **rien ne
bougeait à l'écran** même quand la sélection avançait. Elle suit maintenant le
jour choisi — du lundi au dimanche, comme les sept colonnes de l'ordinateur —
et le titre affiche la semaine montrée.

**La vue Mois avançait de trente jours.** Depuis le 31 janvier, trente jours
tombent le 2 mars : février sauté. `moisPlus` franchit un **mois**, en ramenant
le jour au dernier qui existe — du 31 mars, un mois en arrière donne le 28
février, et non le 3 mars comme le ferait `setMonth` seul.

Vérifié dans le navigateur, aller **et** retour : les semaines du 28 sept. au
25 oct., les mois d'octobre à février, les jours un par un, et le chemin
inverse par les mêmes valeurs.

Au passage, la carte du rail marque désormais le jour qu'elle MONTRE : après
un aller jusqu'en décembre dans la feuille, sa bande ne marquait plus rien
pendant que son contenu parlait d'aujourd'hui.

`jourDeCle` et `moisPlus` sont nés dans `agendarail.jsx` et ont déménagé dans
`agenda.js` : Node ne charge pas les `.jsx`, et un calcul qui ne se teste pas à
sec n'a rien à faire dans une vue.

## Ce qu'on a appris

**Supprimer par préfixe de ligne ne supprime pas une fonction.** Un script qui
coupait les lignes commençant par `const pastilleJour` a retiré **la
déclaration** et laissé le corps : `Parsing error: Unexpected token )`. Le lint
l'a dit tout de suite ; un script qui annonce « fait » ne prouve rien.

**Un `tr()` retiré laisse ses clés derrière lui.** Dix clés sont restées dans
les catalogues, et c'est le test des clés dormantes qui les a nommées — pas une
relecture.

1087 tests JavaScript, 590 tests Python, lint et audit propres.
