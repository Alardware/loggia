# ADR 0093 — Un point sous les jours qui portent un rendez-vous

**Date** : 2026-09-25
**Statut** : décidé et appliqué ; gardé en local.

Troisième des quatre points d'**A8**. Il solde deux « non faits » de l'ADR
0041 : « un point sous les jours qui portent un rendez-vous (seuls sept jours
d'agenda sont lus), choisir un jour dans la semaine ».

## Le constat

Le widget calendrier du rail montre sept jours et, au-dessus, une tuile
« Agenda » avec le prochain rendez-vous du jour. La semaine était donc
**muette** : rien ne distinguait un mardi vide d'un samedi chargé, et toucher
un jour ne faisait rien.

La cause était en amont, pas dans le dessin : le widget ne recevait que les
événements **d'aujourd'hui** (`evenementsJour`). Il n'avait pas de quoi compter
les autres jours.

## La décision

**Une prop de plus, facultative** : `evenements`, la bande des sept jours. Sans
elle — c'est le cas de la Bibliothèque — il n'y a ni point ni jour
sélectionnable, et le widget se comporte exactement comme avant.

**Le point ne prend pas de place.** Il vit dans un creux de 4 px, toujours
présent, coloré à l'accent quand le jour porte un rendez-vous, transparent
sinon. Sans ce creux, la rangée aurait deux hauteurs selon la semaine.

**Choisir un jour ne change QUE la tuile du dessus.** La grille ne bouge pas,
rien ne se replie. Retoucher le même jour revient à aujourd'hui : on ne reste
pas coincé sur un mardi sans comprendre pourquoi.

**Au clavier comme au doigt** : chaque jour est un bouton, tabulable, Entrée et
Espace l'ouvrent. Son `aria-label` dit la date en toutes lettres et, s'il y a
lieu, « 2 événements ».

## Ce qu'on ne promet pas

Le calendrier ne lit que **sept jours** (`JOURS_AGENDA`). Un point n'apparaît
donc que sur la semaine lue, jamais au-delà — et c'est mieux que d'afficher un
jour vide qui ne l'est pas. La limite était déjà notée dans l'ADR 0041 ; elle
reste, elle est juste dite.

## Vérifié à l'écran

Sur la démonstration, à 1 440 px : les sept jours sont des boutons, et leurs
étiquettes portent le compte — « vendredi 25 septembre · 1 événement »,
« samedi 26 septembre · 2 événements », « dimanche 27 septembre · 2 événements ».
Les jours 21 à 24 n'en ont pas.

Les points mesurés : `rgba(0,0,0,0)` sur 21-24, `rgb(97,151,255)` sur 25-27.

Toucher samedi fait passer la tuile de « 16:00 · Livraison colis » (aujourd'hui)
à « journée · Ramassage des poubelles · + 1 autre ». Retoucher samedi ramène le
rendez-vous du jour.

## Conséquences

- **Aucun texte nouveau** : `{n} événement` / `{n} événements` existaient déjà.
- Tout le calcul vient de `src/agenda.js`, qui savait déjà faire :
  `comptesParJour` et `evenementsDuJour` étaient écrits et testés, personne ne
  les appelait depuis ce widget.
- Le jour choisi est un état d'écran, pas un réglage : il ne se retient pas
  d'une visite à l'autre, et n'écrit rien.
- Rien côté serveur, aucun redémarrage.

Tests : `tests/accueil_widgets_temps.test.mjs` pour le branchement de la prop.
