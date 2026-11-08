# 0326 — L'Accueil propose les gestes du moment

*4 novembre 2026 — appliqué (v3.98.0) (étape 1 du rapport sur l'usage du 04/11)*

## Le problème

Le bandeau de l'Accueil disait l'état de la maison, sans proposer quoi en
faire : le soir, il fallait encore aller chercher les volets ou le scénario
« Bonne nuit ».

## La décision

`src/momentaccueil.js`, une règle pure, propose au plus trois boutons sous
la phrase du bandeau (`accueil/actionsmoment.jsx`) :

- le matin (5 h – 11 h), « Ouvrir les volets » s'ils sont fermés ;
- le soir (dès 19 h, ou dès 16 h quand le soleil est couché) et la nuit,
  « Fermer les volets » s'ils sont ouverts ;
- dès 21 h, « Bonne nuit » quand des lumières restent allumées et qu'un
  scénario `nuit` existe ;
- en journée, rien.

Un bouton touché disparaît. Rien en mode édition.

## Les conséquences

Écran seulement. « Bonne nuit » passe par la feuille « Avant de dormir »
(ADR [0327](0327-je-pars-et-bonne-nuit-montrent-d-abord-ce-qui-reste-ouvert.md)),
et les volets se rattrapent par « Annuler »
(ADR [0330](0330-annuler-cinq-secondes-apres-un-geste-groupe.md)). Test
`actions_moment`.
