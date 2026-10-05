# 0135 — Un jour n'a pas toujours vingt-quatre heures

Date : 03/10/2026. Statut : appliqué. **Redémarrage de Home Assistant requis**,
comme pour toute mise à jour du composant (décision 0126) ; aucun code Python
ne change ici.

Le dimanche 25 octobre 2026 compte **vingt-cinq heures** en France — on recule
d'une heure à 3 h. Le dimanche 28 mars 2027 en comptera vingt-trois. Partout où
Loggia calculait un jour en ajoutant `864e5` millisecondes à un minuit, le
calendrier se décalait. L'audit du 03/10 l'a vu dans la grille du mois ; le
balayage de tout `src/` en a trouvé sept, tous reproduits sur le code d'avant :

- **La grille du mois** montrait deux fois le 25 octobre, et toute la fin du
  mois tombait sous le mauvais jour de semaine — le lundi 26 sous le mardi.
  Minuit du 25 plus 24 heures, c'est le 25 à 23 h.
- **La fin de cette grille**, et la plage de sept jours que l'agenda demande
  aux calendriers, s'arrêtaient à 23 h la veille : les rendez-vous de la
  dernière heure n'étaient même pas demandés.
- **Un rendez-vous le 25 à 23 h 30** n'appartenait à aucun jour : pas de point
  dans la bande des sept jours, absent quand on choisissait le 25.
- **Au printemps**, un rendez-vous le 29 mars à 0 h 30 comptait sur deux jours.
- **« Demain »** s'affichait pour un rendez-vous du 25 à 23 h 30 vu le 25.
- **« hier »**, dans les journaux, visait l'avant-veille entre 0 h et 1 h, le
  lendemain du passage à l'heure d'été.

**Décidé :** un jour de calendrier se compte sur le **calendrier**. Deux
fonctions dans `agenda.js` — `jourPlus(d, n)`, minuit du jour `n` jours plus
loin par `setDate`, et `ecartJours(a, b)`, l'écart en jours heures ignorées —
servent à la grille, à sa fin, à la plage, à `toucheJour` et à `jourAgenda`.
La plage par défaut du rail et « hier » passent aussi par `setDate`.

Ce qui reste en millisecondes **et doit y rester** : les vraies durées.
« Il y a 24 h », un historique sur les dernières vingt-quatre heures, la
rétention du journal, l'angle du soleil — une heure de décalage par an n'y
change rien. Les écarts entre deux minuits arrondis (`Math.round`, dans
`collecte.js`, `robots.js`, `systeme.js`, `todos.js`) étaient déjà justes.

---

**Et le lave-vaisselle lancé avant minuit**, dans le même lot parce que c'est
la même famille — une heure qui franchit un jour. Son entité de départ donne
une heure seule, en secondes depuis minuit. Elle s'ajoutait au minuit du JOUR :
à 0 h 40, un départ à 23 h 30 tombait dans le futur, l'écart négatif était
ramené à zéro, et « En ce moment » affichait **« 0min »** jusqu'à la fin du
cycle. `minutesDepuisHeure` (`format.js`) prend une heure encore à venir pour
celle d'hier, compte sur l'heure de l'horloge plutôt qu'en millisecondes depuis
minuit, et lit tel quel un horodatage complet si l'entité porte aussi la date.

**Comment c'est vérifié.** `tests/heure_hiver.test.mjs` tourne dans le fuseau
de Paris **et le vérifie d'abord** — en UTC, comme sur la CI, sans cette garde,
il passerait sans rien prouver. Il prend octobre 2026 et mars 2027 : un seul 25,
chaque jour sous sa colonne, 31 jours en mars, une plage qui finit à minuit, le
rendez-vous de 23 h 30 sur son jour, celui de 0 h 30 sur le sien, « aujourd'hui »
le jour même ; le lave-vaisselle à 23 h 59, 0 h 01 et 1 h 20 ; « hier » le
29 mars à 0 h 30. Rejouées dans le même fuseau, les anciennes formules donnent
bien les sept défauts. Les deux épingles de `tests/calendrier.test.mjs` qui
recopiaient l'ancien calcul (`42 * 864e5`, `7 * 864e5`) suivent le nouveau.
