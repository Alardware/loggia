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

## Audit du 03/10 : la génération d'avant n'existait pas

Le filet promis plus haut — « la génération du jour, et celle d'avant » — ne
tenait pas. Mesuré sur les releases elles-mêmes : sur les huit derniers
passages d'une release à la suivante (v3.77.0 → v3.84.0), **sept** ont fait
perdre à la page précédente 10 à 17 de ses 28 fichiers, dont son `boot` et
son entrée. Un client resté sur la page d'avant pendant une mise à jour HACS
avait un écran cassé — exactement ce que `GARDE = 2` devait éviter.

Trois causes, qui s'additionnent :

- la retenue « les deux plus récents » triait par **date**, et un checkout git
  pose tous les fichiers à la même seconde : entre N-1 et N-2, c'était un
  tirage au sort, famille par famille ;
- la règle 4 (ADR 0106) rasait ensuite, à juste titre, toute page trouée : il
  suffisait qu'un seul de ses fichiers ait perdu le tirage ;
- la retenue comptait les **passages du pack**, pas les releases : deux packs
  dans une même branche poussaient dehors la génération que les clients
  avaient vraiment.

Il en restait des feuilles orphelines : dans le paquet de travail du 03/10,
onze fichiers, 1,4 Mo (`three`, `vendor`, six langues, la démo, `voix`, un
`index-*.css`), cités par aucun fichier.

**Correctif** (`scripts/pack_frontend.py`) : la page N-1 est **nommée**, plus
devinée — celle de la dernière release dont la page diffère de celle du jour
(le tag `v*` le plus récent atteignable depuis HEAD) ; sans git ni tags,
l'`index.html` en place ; au re-pack du même build (la CI clone à plat, sans
tags), l'autre entrée que le paquet porte et que la page du jour n'atteint
pas. Tout ce qu'elle atteint est protégé de **toutes** les règles — la
génération du jour aussi, dont seule l'entrée l'était —, et ce qui manque au
dossier est restauré depuis le tag. Une page précédente trouée n'est pas
protégée. Les règles 2 à 4 jugent le reste ; une règle 5 retire, quand la page
N-1 est connue, ce qu'aucune des deux pages n'atteint : le paquet est alors
exactement deux pages, et ne dépend plus d'aucune date.

**Prémisse non vérifiée** : HACS vide-t-il `custom_components/loggia/` à la
mise à jour ? Son option `persistent_directory` (un dossier à préserver d'une
mise à jour à l'autre) le laisse penser ; ce n'est pas mesuré ici. S'il le
vide, le client n'a QUE ce que la release livre : le filet est exactement ce
paquet, et ce correctif est ce qui le rend réel. S'il ne le vide pas, les
fichiers d'avant restent de toute façon sur son disque : le correctif n'y
change rien, il ne retire rien de chez lui.

Prérequis : packer dans un clone qui a les tags (`git fetch --tags`). Un tag
manquant ferait protéger une release plus ancienne ; le pack affiche la page
qu'il protège, et prévient quand la page en place n'est pas protégée.

Tests : tests/python/test_pack_frontend.py (la page d'avant garde tous ses
fichiers, l'avant-veille part, un second passage ne touche à rien, la release
l'emporte sur un pack de travail, un dossier vide est restauré depuis le tag,
une page trouée n'est pas protégée) ; tests/generique.test.mjs (le paquet
livré porte une page d'avant entière, et rien d'autre que les deux pages).
