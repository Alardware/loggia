# 0350 — La vue Sécurité dit une seule chose

*12 novembre 2026 — appliqué (v3.100.0)*

## Le problème

Dans la démonstration, la vue Sécurité se contredisait. Son compteur annonçait
« Caméras 3/4 en ligne » et nommait la caméra du jardin, mais ses tuiles
montraient trois caméras, dont deux « HORS LIGNE » que l'Accueil disait en
direct, et pas celle du jardin. Sa pastille disait « Tout est calme » à côté de
« 2 ouvrants ouverts » et de « Mouvement : 1 détecté ». Sur l'Accueil, la
caméra en panne portait la pastille « LIVE ».

Le compteur et les tuiles ne lisaient ni la même liste (celle de
l'utilisateur, celle de la découverte) ni la même règle (un état `unknown`
comptait en ligne d'un côté, hors ligne de l'autre).

## La décision

- **Une liste** (`camerasDeLaMaison`, `attention.js`) : celle de l'utilisateur
  quand il en a une, complétée par ce que la découverte sait de chaque caméra ;
  sinon celle de la découverte. Une caméra sans entité y reste, et s'affiche en
  panne.
- **Une règle** (`cameraEnLigne`) pour l'Accueil, le compteur et les tuiles :
  hors ligne sans entité, ou à l'état `unavailable` ou `unknown` — ce que la
  fiche d'une caméra disait déjà. La pastille d'une tuile dit « HORS LIGNE »
  dès que la caméra ne répond pas, sur l'Accueil comme dans la vue.
- **La pastille de la vue** (`etatSecurite`) dit le fait le plus important :
  état inconnu, alarme déclenchée, mouvement (caméras ou détecteurs), ouvrants
  ouverts, et « Tout est calme » seulement quand rien de tout cela. Ambre dès
  qu'il y a un mouvement ou un ouvrant ouvert ; au calme, vert alarme désarmée
  et ambre alarme armée, comme avant.

## Les conséquences

Pas de redémarrage de Home Assistant. Sur l'Accueil, une caméra à l'état
`unknown` compte désormais hors ligne. Sans liste de l'utilisateur, l'Accueil
ne montre toujours aucune caméra alors que la vue Sécurité prend celles de la
découverte : non traité ici. Tests : `tests/audit_1211_lot1.test.mjs`,
`tests/cameras.test.mjs`.
