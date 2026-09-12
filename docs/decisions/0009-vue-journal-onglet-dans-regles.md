# ADR 0009 — La vue Journal est un onglet de Règles

**Statut** : appliqué (v3.12.0) — `loggia/regles/etat`, `src/views/journal.jsx`.

## Contexte

Le journal commun (ADR 0001) est « le seul outil de débogage dont un
non-technicien dispose ». Chaque onglet montre déjà ses propres « Dernières
manœuvres » ; rien ne montre la maison entière dans l'ordre du temps.

## Décision

Un **onglet Journal** dans Règles : toutes les règles mêlées, la plus
récente en premier, filtrables par module. Les onglets gardent leurs
« Dernières manœuvres ». Pas de carte sur l'Accueil.

## Conséquences

- Une commande WebSocket `loggia/regles/etat` expose le journal complet, les
  tenues et les heures calmes.
- La liste « Derniers envois » de Paramètres › Alertes, doublon du journal,
  disparaît quand l'onglet existe.
- Ce que l'onglet montre exactement est précisé par l'ADR 0020.
