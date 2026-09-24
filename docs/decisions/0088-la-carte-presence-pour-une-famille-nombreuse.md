# ADR 0088 — La carte Présence pour une famille nombreuse

**Date** : 2026-09-24
**Statut** : décidé et appliqué ; gardé en local pour la mise à jour groupée de
correctifs.

> « la carte présences est limitée à 3 en affichage il me semble, pour des
> familles plus nombreuses comment je fais ? »

Puis, sur trois options proposées : « je suis d'accord avec A et C ».

## Contexte

`CvPresence` coupait à `liste.slice(0, 3)`, avec ce commentaire :

> Trois lignes au plus : le FORMAT STANDARD (2 rangées de 88 px) est une règle
> dure — une quatrième personne déborderait la carte.

Le commentaire disait vrai, et la règle du gabarit ne se discute pas. Mais le
compteur du coin affichait quand même « 2 / 5 » : **la carte savait compter
cinq personnes et n'en montrait que trois, sans le dire.** Une famille de six
n'avait aucun moyen de voir les trois derniers.

Ce qui existait déjà : la bannière de l'Accueil montre TOUS les avatars, sans
limite, et la carte d'une personne seule (`CvPerson`) existe aussi. Le trou
était entre les deux.

## Décision

**Option A — la grille.** Jusqu'à trois personnes, rien ne change : une ligne
chacune, avatar, nom, « · À la maison ». À partir de **quatre**, la carte passe
en grille d'avatars, **quatre par rangée, deux rangées** — huit tiennent. Au-delà
de huit, sept personnes et une case « +n ».

**Option C — la feuille.** La carte devient ouvrable (souris, tabulation,
Entrée et Espace) et rend `FeuillePresence` : toute la maisonnée, **sans
limite**, chacun avec où il est et depuis quand, comme la carte d'une personne
seule. Même patron que les autres feuilles (ADR 0055) : hauteur au contenu, une
croix en bout de ligne d'en-tête.

**Option B écartée** : une carte large en deux colonnes aurait demandé un
troisième format. Le gabarit 88 / 184 ne bouge pas.

**L'ordre reste celui de la configuration.** Pas de tri « présents d'abord » :
une famille connaît les places, et l'avatar estompé dit déjà l'absence. Le
« +n » cache donc les derniers de la liste — le compteur du coin et la feuille
disent le reste.

**« Ouvrants » ne change pas**, alors qu'elle a la même coupe à trois : elle
trie les ouverts en premier, ceux qui comptent sont déjà visibles.

**Sous 230 px, les prénoms s'effacent**, exactement comme le « · À la maison »
le fait déjà (la carte du téléphone fait 176 px). L'avatar et sa pastille
disent l'essentiel ; le nom reste au survol et au lecteur d'écran, porté par
`title` et `aria-label` sur chaque case.

## Ce que la mesure a corrigé

Le plan prévoyait une grille de 92 px et un seuil d'acceptation : **la grille
doit finir au moins 12 px au-dessus du bas de la carte**, pour ne pas manger
sa marge. Mesuré dans le navigateur, à neuf personnes et 280 px de large :

| | avant réglage | après |
|---|---|---|
| hauteur de la grille | 94 px | **88 px** |
| marge sous la grille | **3 px** | **13 px** |
| débordement dans la marge basse (16 px) | 13 px | 3 px |

Rien n'était rogné — mais la carte était à l'étroit. Trois ajustements :
l'écart de la grille passe de `6px 4px` à `4px 4px`, sa marge haute de 6 à 2,
et les avatars de 28 à 26 px. Le critère est tenu.

Au téléphone (390 × 844), la carte fait **176 × 184**, les prénoms sont en
`display: none`, et neuf personnes tiennent en 56 px de grille — 48 px de marge.

## Conséquences

- **Rien côté serveur**, aucune nouvelle clé de configuration, aucun
  redémarrage de Home Assistant.
- Trois textes nouveaux dans les sept langues : `{n} autre personne`,
  `{n} autres personnes` (trois formes en polonais, ADR 0071), `Famille
  nombreuse`.
- La Bibliothèque gagne une entrée « Famille nombreuse » — neuf personnes,
  présents et absents mêlés — parce qu'une carte qui change de forme au-delà
  d'un seuil doit pouvoir se regarder aux deux états.
- En mode édition de la vue Sécurité, un clic sur la carte peut ouvrir la
  feuille au lieu de la saisir. `CvCamera` a la même limite ; c'est accepté.
- Le test `securite_dimensions` épinglait la coupe à trois. Son sujet — la carte
  tient dans 184 px — reste vrai ; ses cibles ont été réécrites, et il vérifie
  désormais aussi que la grille ne dépasse jamais huit cases.

## Tests

`tests/carte_presence.test.mjs`, écrit **avant** le code et rouge cinq fois sur
cinq. Vérifié à l'écran sur la démonstration : les deux cas (deux personnes en
lignes, neuf en grille), le téléphone, la feuille et ses neuf lignes, Escape et
la croix qui ferment, Entrée qui ouvre depuis le clavier, l'arbre
d'accessibilité (`button "Ouvrir Présence"`, « Camille · À la maison »,
« 2 autres personnes ») et `?lang=en` (« Large family », « Camille · Home »,
« 2 other people »).

965 tests au vert côté JS, 573 côté Python, lint propre, audit propre.

### Une erreur du plan, corrigée

Le plan d'exécution demandait que la feuille ne contienne aucun `slice(` — mais
son propre code en contient un, `p.name.slice(0, 2)`, les initiales d'un avatar
sans photo. L'assertion visait la maisonnée, pas les prénoms : elle porte
maintenant sur `liste.slice(`.

### Le numéro

Le plan tablait sur l'ADR 0087. Elle a été prise entre-temps par le point M15
(épinglage des actions de la CI par leur commit), d'où **0088**.
