# 0376 — L'historique ne change de cases qu'avec ses valeurs

*19 novembre 2026 — appliqué (v3.100.0)*

## Le problème

> « Ici Semaine ne fonctionne pas, de plus la vue Énergie a parfois du mal à
> se charger, je dois relancer l'app. »

Dans l'historique de la vue Énergie, passer de Jour à Semaine faisait tomber
la vue : « Cannot read properties of undefined (reading 'titre') ». `useStats`
rendait les cases de la période DEMANDÉE (7 jours) pendant que ses séries
restaient celles de la période précédente (24 heures), jusqu'à la réponse de
Home Assistant. Le résumé du graphe (`EnHistoBarres`) lisait la 20ᵉ case d'une
semaine. Une fois tombée, la vue restait sur l'écran d'erreur jusqu'à la
relance de l'appli : c'est le « parfois je dois relancer ». Rien à voir avec le
redémarrage de HA (ADR du 18/11, `recharge.js`), qui n'est pas touché.

## Décidé

- `useStats` (stats.js) pose les cases AVEC les séries lues : le graphe garde
  l'ancienne période, entière, jusqu'à l'arrivée de la nouvelle.
- `EnHistoBarres` (engraphes.jsx) ne lit plus une case absente dans son résumé
  (la bulle était déjà gardée).

## Conséquences

- Tests : `tests/energie_histo_semaine.test.mjs` (échoue sans le correctif).
