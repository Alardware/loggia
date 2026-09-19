# 0056 — Le scan de sécurité de GitHub

Date : 19/09/2026 (v3.56.1). Statut : acceptée. Demande : « sur GitHub,
niveau sécurité ? » — capture de CodeQL : « Could not process some files due
to syntax errors », avec `src/orbe.jsx`, ligne 952.

## Contexte

L'analyse CodeQL du dépôt (configuration par défaut de GitHub) relevait :

- un avertissement : un fichier qu'elle ne savait pas lire — `orbe.jsx`, à la
  ligne `import.meta.hot.accept(() => { window.location.reload(); });`, le
  garde-fou qui recharge la page en développement. Le fichier entier restait
  hors de son examen. `main.jsx`, qui lit `import.meta.env`, passait ;
- cinq alertes « moyenne » (`actions/missing-workflow-permissions`) : les
  travaux de `validate.yml` n'avaient pas de bloc `permissions` et
  recevaient les droits par défaut du jeton ;
- quinze alertes « haute » (`js/insecure-randomness`), toutes dans
  `frontend/assets/three-*.js` : la bibliothèque 3D, minifiée par le build et
  gardée en trois versions pour les caches des navigateurs.

Par ailleurs : aucun secret exposé ; `npm audit` ne trouve aucune
vulnérabilité ; les alertes Dependabot sont désactivées sur le dépôt.

## Décision

- **Le garde-fou de développement quitte le module** : `vite.config.js` le
  porte, dans un greffon du seul serveur de développement
  (`apply: 'serve'`, `handleHotUpdate` → `full-reload` pour `src/orbe.jsx`).
  `orbe.jsx` ne contient plus ni `import.meta` ni `location.reload`.
  Vérifié : un témoin posé sur `window` disparaît quand on modifie
  `orbe.jsx` — la page se recharge toujours.
- **`validate.yml` ne reçoit que le droit de lire** : `permissions:
  contents: read`, pour tous ses travaux. `demo.yml` avait déjà les siennes.
- **Les alertes de `three-*.js` ne sont pas des failles** : three.js tire au
  hasard les identifiants de ses objets 3D (`Math.random`), sans rôle de
  sécurité, et ce code n'est pas le nôtre. Les écarter relève des réglages
  de sécurité du dépôt — c'est à son propriétaire de le faire : les marquer
  « faux positif » dans l'onglet Security, ou passer CodeQL en configuration
  avancée pour exclure `custom_components/loggia/frontend/assets/`. De même
  pour l'activation des alertes Dependabot.

## Conséquences

Au prochain passage de CodeQL, l'avertissement et les cinq alertes
« moyenne » devraient disparaître ; les quinze de three.js restent tant
qu'elles ne sont pas écartées. Tests : tests/orbe.test.mjs (le garde-fou vit
dans `vite.config.js`, le module n'a plus d'`import.meta`),
tests/securite_github.test.mjs (les droits de `validate.yml`).
