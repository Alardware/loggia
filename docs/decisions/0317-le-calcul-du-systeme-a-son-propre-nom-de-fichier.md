# 0317 — Le calcul du Système a son propre nom de fichier

*1er novembre 2026 — appliqué (v3.97.0) (lot 10 bis du rapport « Gladys comparé au catalogue » : correctif du lot 10, ADR 0314)*

*Corrige l'ADR [0314](0314-ce-que-l-administrateur-doit-savoir-sauvegardes-disque-plein-et-mises-a-jour.md) : le chargement à la demande de `systeme.js`.*

## Le problème

Le lot 10 a fait charger `src/systeme.js` à la demande par l'Accueil d'un
administrateur (`import('../systeme.js')`). La vue Système l'importe aussi.
Partagé par deux morceaux chargés à la demande, le module est devenu un
morceau à lui, nommé `systeme-*.js`, de la même famille que celui de la vue
(`views/systeme.jsx`).

Après la construction, le paquet en portait trois : deux vivants et un de la
compilation d'avant. Le test `tests/generique.test.mjs` (« le paquet livré ne
traîne pas les bundles des compilations passées ») l'a vu, mais seulement
APRÈS la construction. Plus grave : la retenue de `scripts/pack_frontend.py`
raisonne par famille, avec `GARDE = 2`. Elle aurait pu, un jour, effacer un des
deux morceaux vivants : la vue Système ou les lignes de l'administrateur
seraient alors tombées en 404.

## La décision

`src/systeme.js` devient `src/systemecalc.js`. Son contenu ne change pas ; seuls
ses deux importeurs (la vue Système, l'Accueil) et ses deux tests sont
renommés. Son morceau s'appelle désormais `systemecalc-*.js`, une famille à
lui.

Écarté : nommer le morceau dans `vite.config.js` (`manualChunks`). Une règle de
configuration de plus, pour un seul fichier, se perdrait au prochain
déplacement.

Vérifié après construction et empaquetage : la famille `systeme` ne garde que
deux fichiers, `systemecalc` en a un, et `generique.test.mjs` passe. Les
morceaux à la demande des lots 8, 11 et 12 (`sonnettegrand`, `courses`,
`nouveaurappel`, `voixmedia`) ont chacun leur famille.

## Les conséquences

- Pas de redémarrage de Home Assistant. Le paquet de l'écran est à
  reconstruire.
- Pour les lots suivants : les tests du paquet (`generique.test.mjs`) se
  lancent APRÈS la construction et l'empaquetage.
