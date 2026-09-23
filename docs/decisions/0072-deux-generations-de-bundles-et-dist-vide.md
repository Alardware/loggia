# 0072 — Deux générations de bundles, et `dist` vidé

Date : 23/09/2026. Statut : acceptée. Origine : le plan d'évolution du 22/09,
point M2 (a), troisième du top 5 ; « ok pour option 1 à 3 » puis « continu avec
le top 5 ».

## Contexte

`custom_components/loggia/frontend/assets` est suivi par git — c'est le paquet
que HACS livre. `pack_frontend.py` y gardait **trois** générations de chaque
famille de bundle, pour qu'un navigateur au cache périmé retrouve l'ancien
`index-<hash>.js` au lieu d'un écran blanc. Le prix : 8,1 Mo en 77 fichiers
pour 1 Mo utile, et deux mégaoctets de plus dans l'historique à chaque version,
pour toujours. Le dépôt, né le 24 août, portait déjà 377 Mo de blobs dans ce
seul dossier.

En local, `dist/` n'était jamais purgé (`emptyOutDir: false`, « on garde les
anciens bundles pour les caches clients ») : 352 Mo, 3 331 fichiers, 354
générations d'`index.js`. Or la rétention qui protège ces caches vit dans le
paquet, pas dans `dist` — que personne ne sert.

## Décision

- **`GARDE = 2`** : la génération du jour, et celle d'avant. Un cache ne saute
  qu'une version à la fois ; celui qui en saute deux recharge la page, ce que
  l'`index.html` autonome (CSS inline) rend sans risque.
- **`emptyOutDir: true`** : `dist` est vidé à chaque compilation. Le pack ne
  copie de toute façon que ce que l'`index.html` atteint.
- Le test du poids du paquet **lit `GARDE`** dans `pack_frontend.py` au lieu de
  réciter le chiffre : il suivra le prochain changement sans qu'on y pense.

## Conséquences

- Paquet : 8,1 Mo / 77 fichiers → **5,8 Mo / 56**. `dist` : 352 Mo → **3,6 Mo**.
- La CI (« paquet embarqué = build du commit ») reproduit le même résultat :
  elle construit et packe avec le même `GARDE`.
- Dégonfler l'historique git déjà écrit est une opération à part, destructive,
  qui reste à la main de l'auteur — elle n'est pas faite ici.
- L'option (b) du plan — `zip_release` dans `hacs.json`, la CI qui attache une
  archive et un dépôt sans aucun bundle — n'est pas prise : elle change la
  livraison, et la garde du cache iOS demanderait à être rejouée autrement.

Tests : tests/generique.test.mjs (la borne devient `GARDE`, lu à la source).
