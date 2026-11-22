# 0378 — Énergie : statistiques gardées, vue préparée, calendrier différé

*19 novembre 2026 — appliqué (v3.100.0)*

## Le problème

> « Vois pour optimiser, fluidifier un peu plus le dashboard » — rapport de
> fluidité du 19/11, points 4 et 5 retenus (« 1 à 5 », puis « fais le lot B »).

- La vue Énergie posait 7 à 8 questions de statistiques à Home Assistant à
  chaque ouverture, et rien n'était gardé : revenir sur Énergie refaisait tout.
  Le calendrier (douze mois de compteurs), tout en bas, partait aussitôt.
- Au premier tap, la vue chargeait son code, puis celui de son historique,
  chacun derrière un écran vide.

## Décidé

- `useStats` (stats.js) garde la réponse brute de chaque question (entités,
  période, recul), en mémoire, au plus 40 : affichée tout de suite à la visite
  suivante ; fraîche quatre minutes — le relevé de 5 min de la vue la trouve
  donc périmée et relit — ; plus vieille, montrée le temps de la relecture. Une
  relecture ratée garde l'affichage.
- `QuandVisible` (energie.jsx) : le calendrier ne se charge qu'à 400 px de
  l'écran ; à sa place, un bloc de sa hauteur, pour que rien ne saute.
- `energie.jsx` demande l'historique dès qu'il se charge ; `vues/simples.jsx`
  charge le code d'Énergie trois secondes après le démarrage, quand le
  navigateur est au calme — pas en mode « économie de données ».

## Conséquences

- Mesuré sur la démo : première ouverture d'Énergie 284 ms (0,8 à 1,8 s
  avant), seconde 129 ms. Chez lui, Home Assistant répond plus lentement que la
  démo : le gain du cache y est plus grand.
- Une fois chargée en fond, une page périmée par une mise à jour se recharge
  comme au premier tap (recharge.js, inchangé).
- Tests : `tests/fluidite_lot_b.test.mjs`.
