# 0099 — Deux défauts qu'on voit : des mots coupés, et un éclair sombre

Date : 27/09/2026. Statut : appliqué (local). **Redémarrage de Home Assistant requis** — le composant ne change pas, mais `index.html` change, donc **le
paquet est rebâti** (`npm run build` + `pack_frontend.py`). Quatrième point de
l'audit du 27/09.

## 1. Les pastilles de scénario coupées en plein mot

La rangée de pastilles d'une carte de scénario n'était bornée qu'à **gauche**
(`left: 15`, pas de `right`), chaque pastille en `white-space: nowrap`. La
carte, elle, coupe ce qui dépasse (`overflow: hidden`).

Sur téléphone, `index.css` impose deux colonnes sous 620 px. Mesuré : la carte
fait **141 px à 320**, 161 à 360, 176 à 390 — et la rangée, **192 px**. Elle
débordait donc de 66, 46 et 31 px, et ce qui dépassait était tranché en plein
mot : « scène H », « Loggi ». Le défaut tenait sur TOUS les téléphones, en
clair comme en sombre, et disparaissait seulement à partir de 768 px.

### Pas de seuil en pixels

La première idée — masquer la troisième pastille sous une largeur donnée —
tombe sur un mur : la rangée ne mesure pas la même chose selon la langue.
Mesuré avec la vraie police, pire cas par langue :

| | 3 pastilles | 2 pastilles |
|---|---|---|
| polonais | 204 px | 130 px |
| français | 220 px | 146 px |
| italien | 246 px | 172 px |
| espagnol | **249 px** | 169 px |

Un nombre écrit d'avance aurait servi le français et trahi l'espagnol.

La rangée s'arrête donc à la marge de droite (`right: 15`), passe à la ligne
(`flexWrap: 'wrap'`) et ne montre qu'**une seule ligne** (`height`, `overflow:
hidden`). Ce qui ne tient pas descend hors du cadre visible et disparaît
**entier** — jamais un mot coupé. La dernière pastille cède la première :
l'origine du scénario pèse moins que ce qu'il fait.

C'est la règle de la maison, « le contenu s'adapte à la carte », appliquée sans
rien avoir à régler. Mesuré après : **1 pastille sur une carte de 141 px, 2 sur
176, 3 sur 236** — et zéro débordement sur les six vues à 320 px, là où la
vue Scénarios en comptait cinq.

La hauteur d'une ligne est **calculée, pas devinée** : `lineHeight: '15px'`
écrit dans la pastille, plus 4 et 4 de rembourrage, font les 23 px de
`H_PUCE_SCN`. Laissée au défaut de la police, cette hauteur aurait varié avec
la langue et laissé dépasser un bout de seconde ligne.

## 2. Le thème arrivait après la première peinture

Dans `index.css`, le sombre est `:root` et le clair `html.loggia-light` ;
`html` prend `var(--o-bg)`. La classe n'était posée que par `applyTheme`, donc
par React. **Tout écran réglé en clair s'allumait sombre** une fraction de
seconde, à chaque chargement — visible sur une tablette murale, plusieurs fois
par jour.

Un script en ligne dans `<head>` la pose avant, en lisant les mêmes clés et les
mêmes défauts qu'`App.jsx` : `loggia-mode` (`light` / `dark` / `auto`, défaut
`dark`), et le système pour « auto ».

### Il s'abstient quand il ne peut pas savoir

« Suivre Home Assistant » (`loggia-ha` à `FOLLOW`) ne se tranche qu'une fois HA
joignable : le script ne devine pas, il ne fait rien, et l'écran se comporte
comme avant. **Se tromper coûterait plus cher que s'abstenir** — un éclair
CLAIR sur un écran sombre, la nuit. Même raison pour un stockage refusé : on
garde le sombre.

Vérifié dans le navigateur, les trois cas, en regardant l'état de la page
**avant que React ait monté quoi que ce soit** (`#root` encore vide) :

| Réglage | Classe posée | Fond de `html` |
|---|---|---|
| clair | `loggia-light` | `rgb(238, 242, 248)` |
| sombre | aucune | `rgb(11, 16, 27)` |
| clair + suit HA | aucune (s'abstient) | `rgb(11, 16, 27)` |

## Les garde-fous

Deux tests, vérifiés dans les deux sens — chacun échoue quand on retire son
correctif :

- `tests/scenarios.test.mjs` : la rangée est bornée à droite, passe à la ligne
  et tient sur une seule ; `H_PUCE_SCN` et `lineHeight` restent nommés, sans
  quoi 23 px ne voudrait plus rien dire ;
- `tests/clair.test.mjs` : le script d'amorce existe, lit `loggia-mode` avec le
  repli `dark`, interroge le système pour « auto », s'abstient sur `FOLLOW`,
  encaisse un stockage refusé — et `App.jsx` lit toujours la même clé de la
  même façon, pour que les deux restent d'accord.

995 tests JS, 579 pytest, lint et audit propres. Paquet rebâti et repacké, le
second passage du pack ne change plus rien.
