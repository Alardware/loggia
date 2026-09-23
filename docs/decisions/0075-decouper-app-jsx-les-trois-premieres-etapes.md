# 0075 — Découper App.jsx : les trois premières étapes

Date : 23/09/2026. Statut : acceptée. Origine : le plan d'évolution du 22/09,
point M1, quatrième du top 5 ; « continu avec le top 5 ».

## Contexte

`src/App.jsx` : un mégaoctet, 13 937 lignes, 162 composants, un seul export.
Le plan a mesuré ce que le découpage n'achète PAS : le bundle de production
est identique, et la désoptimisation Babel ne touche que le serveur de
développement — il faudrait en sortir la moitié pour repasser sous le seuil.
Ce qu'il achète, c'est la lecture, et des tests qui exercent le code au lieu
d'en relire le texte.

Bonne nouvelle relevée par l'audit : aucune fermeture sur l'état d'App. Tout
passe par des props, deux contextes et `state.js`. Le couplage est horizontal.

## Décision

Les trois premières étapes, celles que le plan donne « sans risque ».

**1. Les formats, les dates, les icônes.**
`src/format.js` prend `fmtWatts` et `relTime`, qui parlent désormais la langue
de l'écran — le séparateur décimal et « Il y a 3 min » étaient écrits en
français, ce qu'un commentaire d'App.jsx signalait sans le corriger.
`src/icones.jsx` prend `Ico` et sa table de tracés : c'est ce que quinze
régions appellent le plus, et un écran sorti du monolithe ne pouvait plus
l'atteindre. `src/styles.js` prend le gabarit des cartes de la maison, dont
`App.jsx` et la vue Système tenaient chacun une copie — un test comparait les
deux morceau par morceau ; il vérifie maintenant qu'elles partent de la même.

**2. Les lecteurs de configuration.**
`src/lectures.js` prend les huit lectures pures — les volets, le distributeur,
les scripts Hue, les notifications, les pièces masquées, les plantes. N'y
entrent que celles qui lisent UNE source ; celles qui se rabattent sur ce que
Home Assistant a découvert restent avec le reste.

**3. Deux écrans entiers.**
`src/pinmodal.jsx` (la modale du code administrateur) et
`src/ecranveille.jsx` (l'écran de veille) sortent tels quels. La veille ne
connaît plus le magasin des scénarios : elle reçoit la liste et de quoi en
lancer un, en props. C'est le découplage que le reste du fichier attend.

## Conséquences

- `App.jsx` : 13 937 → 13 661 lignes. Le gain n'est pas là : cinq modules
  lisibles, testables sans rendre l'application, et un kit partagé au lieu
  d'une copie.
- **Le coût est dans les tests, comme annoncé** : sept fichiers relisaient le
  texte d'App.jsx et ont dû être repointés. Ils lisent maintenant le monolithe
  ET ce qui en est sorti — la prochaine extraction ne les cassera pas.
- **Une leçon** : le lint et les 932 tests sont passés au vert alors que
  l'application ne démarrait plus — `Ico` n'était pas exporté là où l'écran de
  veille l'attendait. Seule l'ouverture de la démo l'a dit. Toute étape
  suivante se vérifie dans le navigateur, pas seulement en test.
- Les étapes 4 à 8 (kit d'édition, vues feuilles, pièces, catalogue de cartes,
  Accueil) restent à décider. Le seuil Babel ne tombe qu'en sortant deux des
  trois gros blocs.

Tests : icones, accueil_banniere, clair, etats, pages_legales,
robustesse_front, scenarios, systeme_hoas réalignés.
