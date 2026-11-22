# 0347 — Un compteur du jour se reconnaît aussi à son état

*12 novembre 2026 — appliqué (v3.100.0)*

## Le problème

Sur une instance réelle, l'aperçu de la vue Énergie annonçait 15,7 kWh et
2,62 € pour la journée ; les capteurs disaient 7,5 kWh et 1,31 €, et le
calendrier 7,2 kWh. La démonstration ne montrait rien.

Un compteur qui ne déclare pas sa remise à zéro (`last_reset`) est lu comme un
index : sa journée est le `change` que tiennent les statistiques de Home
Assistant. Or deux capteurs « du jour » étaient la somme de deux compteurs,
heures creuses et heures pleines, remis à zéro l'un après l'autre. Home
Assistant voit alors le total retomber deux fois, et compte la valeur
intermédiaire comme une consommation : la tranche de minuit portait
+ 8,76 kWh et + 1,42 € que personne n'avait consommés.

## La décision

Un index ne fait que monter : il est toujours plus grand que ce qu'il a compté
dans la journée. Deux règles en découlent.

- **Dans l'aperçu** (`totalDuJour`, `jourstat.js`) : quand l'état du capteur
  est plus petit que le `change` du jour, c'est un compteur remis à zéro cette
  nuit, et son état est le total du jour. Sans statistiques, toujours rien.
- **Dans les graphes** (`repartir`, `stats.js`) : le relevé de fin de tranche
  (`state`) borne le `change`, à l'heure et au jour. La requête demande donc
  `change` et `state`. Au mois, la règle ne s'applique pas : le relevé d'un
  compteur journalier n'y vaut que son dernier jour.

Écarté : reconnaître ces capteurs à leur nom ou à leur clé de configuration
(« du jour ») — la même clé reçoit un index quand Loggia la déduit du tableau
de bord Énergie.

La monnaie s'écrit désormais par son symbole (`symboleMonnaie`, `format.js`) :
« 2,62 EUR » voisinait avec « 16,73 € » sur la même carte. Et une prévision
solaire de zéro sur une journée entière ne s'affiche plus.

## Les conséquences

Pas de redémarrage de Home Assistant. Le coût d'une année entière, lu au mois,
garde le défaut pour un capteur de ce genre : il faudrait le relire au jour.
Tests : `tests/installation_reelle.test.mjs`, et une assertion modifiée dans
`stats_periodes`, `total_du_jour` et `cout_energie`.
