# 0069 — Les composants se testent par rendu

Date : 22/09/2026. Statut : acceptée. Origine : l'audit du 22/09 (plan
d'évolution, point A6), sur « go A6 ».

## Contexte

Aucun composant `.jsx` n'était exécuté par un test : Node ne lit pas le JSX,
et la suite relisait le texte des sources — 48 % des assertions, des épingles
sur des lignes de code qui cassent à chaque reformulation et ne prouvent pas
ce que l'écran montre. Là où la logique vit dans un `.js`, les tests sont
comportementaux ; l'écran, lui, n'avait pas de chemin.

## Décision

- **Un crochet de chargement, rien de plus** (`tests/jsx-hooks.mjs`) : un
  fichier `.jsx` passe par esbuild — celui que Vite embarque, aucune
  dépendance nouvelle —, une image importée devient son chemin, une feuille de
  style une chaîne vide. Il s'enregistre par `module.register` depuis
  `tests/rendu.mjs` : seuls les tests qui rendent un composant l'emportent,
  `npm test` et la CI ne changent pas.
- **Le rendu statique de React** (`react-dom/server`) : ce qu'un premier rendu
  montre, sans navigateur ni effets. On affirme sur un rôle, un nom, un texte,
  une classe — jamais sur la forme du code.
- **Les premiers rendus** : la barre de confort, la carte météo du rail,
  l'en-tête d'une règle. Les composants sortis d'App.jsx sont prêts ; ceux qui
  y restent le deviendront avec le découpage (plan, point M1).
- Les épingles de texte existantes ne sont pas converties d'un coup : chaque
  extraction ou retouche d'un composant est l'occasion de remplacer la sienne.

## Conséquences

- Tests seulement : rien ne change pour l'installation, pas de version.
- Un effet, un abonnement, une mesure de DOM ne se testent pas ainsi ; c'est
  la logique pure qu'on continue de sortir dans des `.js`.

Tests : tests/rendu_composants.test.mjs (4).
