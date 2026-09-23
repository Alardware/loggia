# 0071 — Les pluriels à trois formes, et le polonais

Date : 23/09/2026. Statut : acceptée. Origine : la PR #3 « Ajouter le
polonais (pl) » de Seba882 (22/09), reçue le lendemain du socle à six langues
(ADR 0070) ; « ok pour option 1 à 3 » — l'intégrer sur le nouveau socle,
avec les trois formes, en le créditant.

## Contexte

La PR apportait 2 371 clés traduites, calées sur la v3.69.2 : l'ancien
mécanisme (l'anglais écrit en dur, réécrit par le socle de l'ADR 0070), sans
les 156 clés arrivées depuis (les mots du serveur, les notifications, les
noms des langues). Et son auteur le disait lui-même : le polonais a trois
formes de pluriel — 1 / 2-4 (sauf 12-14) / 5+ —, `tr` en connaissait deux ;
il avait mis le génitif pluriel partout (« 2 pokoi » au lieu de « 2 pokoje »)
et « komend(y) » là où rien ne couvrait les deux. Le tchèque, le russe, le
croate posent la même question avec d'autres seuils.

## Décision

- **Une valeur de catalogue peut être un objet de formes**,
  `{ few, many, other }` (ou toute catégorie qu'`Intl.PluralRules` connaît
  pour la langue), et `tr` la départage d'après le nombre passé — `n`, sinon
  le premier repère numérique. Rien ne change pour les appelants : ils
  choisissent toujours la clé du singulier pour 1 et celle du pluriel sinon ;
  c'est cette clé-là qui porte les formes. Une chaîne reste une chaîne. Une
  catégorie absente retombe sur `other`, puis `many`.
- **Les langues à deux formes n'écrivent jamais d'objet** : le test des
  catalogues le refuse, comme il refuse un objet sans `other` ou avec une
  catégorie que la langue n'a pas.
- **Le polonais entre par la PR**, complété : les 156 clés manquantes
  traduites, les entrées qui varient avec le nombre passées en objets de
  formes, une relecture indépendante comme pour les quatre langues de la
  veille, `translations/pl.json`, la ligne dans les trois tables de
  `langues/index.js`. L'auteur est crédité dans le catalogue, ici, et dans le
  commit.

## Conséquences

- Aucun appelant converti : `trN` et les couples de clés singulier / pluriel
  existants suffisent. Le jour où une langue distingue aussi `two` (l'arabe,
  le slovène), c'est un objet de plus, pas du code.
- Un nombre écrit sans repère (« {n} h restantes » où `n` est déjà une
  chaîne) ne déclenche pas les formes : `other` sert. À surveiller dans les
  relectures, pas dans le code.
- La PR #3 sera close en la remerciant, son contenu étant repris ici.

Tests : tests/langues_socle.test.mjs (+1), tests/langues_catalogues.test.mjs
(objets de formes, langue à deux formes), tests/rendu_composants.test.mjs
(huit options).
