# 0104 — Le thème quitte le monolithe

Date : 27/09/2026. Statut : appliqué (local). **Redémarrage de Home Assistant requis** ; `src/` change — **le paquet est rebâti**. Neuvième et dernier point
de l'audit du 27/09, et première étape du découpage d'`App.jsx`.

## Ce qui part, et pourquoi celui-là d'abord

`src/theme.js`, 487 lignes. `App.jsx` : 14 486 → **14 035** lignes (−451).

Ce morceau passe en premier parce qu'il ne ressemble pas au reste : **aucune de
ses lignes n'est un composant, aucune n'appelle un hook, aucune ne rend de
JSX.** Il lit un réglage, calcule des couleurs, et écrit des propriétés CSS sur
la racine du document. C'est du calcul, pas de l'écran — et c'est exactement ce
qui rend son déplacement sûr.

Ce qui y vit : les quatorze préréglages (`LOGGIA_PRESETS`), les jetons qu'un
thème a le droit de surcharger (`THEME_KEYS`), la pose du plus précis au plus
général (`applyVars`, `applyLook`, `applyTheme`), le réglage d'apparence
(`readLook`), le miroir du thème de Home Assistant (`readComputedHaTheme`,
`signatureHaTheme`), deux calculs de couleur (`lum`, `cssToRgb`) et
l'intensité du lavis (`LAVIS`, `lav`).

## La frontière, mesurée avant d'être tracée

Le premier réflexe serait de faire confiance à `grep`. Il se trompe quatre fois
ici, et chaque erreur aurait fait échouer l'extraction :

- `contraste.js` exporte ses **propres** `LAVIS`, `TEINTES` et `JETONS_GARDE` —
  des homonymes, pas les mêmes choses ;
- `orbe.jsx`, `parcommun.jsx` et `interrupteurs.jsx` ont leurs propres
  `TEINTES` et un `lum` qui est une variable locale ;
- `main.jsx` et `contraste.js` ne citent `applyLook` qu'en **commentaire** ;
- dans la zone elle-même, `lireFondPhoto` et `PIECES` n'apparaissent QUE dans
  des commentaires — les compter comme dépendances aurait tiré deux imports
  inutiles, dont un vers un fichier qui n'a rien à voir.

Après tri : **trois dépendances réelles**, `garde` et `JETONS_GARDE` de
`contraste.js`, `cfgVal` de `state.js`, `LOOK_DEF` de `ui.jsx`.

Et l'import d'`App.jsx` s'est **séparé** : `garde` et `JETONS_GARDE` partent
avec le thème, `lisibleSurLavis` reste, parce que ce sont les cartes qui
l'appellent.

## Ce qui n'est PAS exporté

`lum` et `cssToRgb` restent internes : personne dehors ne les appelle, et une
porte publique sans personne derrière est une dette que
`tests/exports_sans_client.test.mjs` refuse. `App.jsx` n'importe que les sept
symboles qu'il lit vraiment — le lint l'a dit tout seul, en signalant `lum`
importé pour rien.

`LOOK_DEF` reste dans `ui.jsx`, d'où `views/parametres.jsx` le lit aussi : le
déplacer aurait élargi ce découpage à deux fichiers de plus, sans gain.

## `LAVIS` traverse la frontière, et c'est voulu

`LAVIS` est une variable de module que `applyLook` **réécrit**, et que les
cartes lisent à chaque rendu — `...((allume && LAVIS) ? { background: … })`.
Un `export let` mis à jour de l'intérieur reste vu à jour de l'extérieur : les
liaisons d'un module ES sont **vives**. `App.jsx` voit la valeur du moment, pas
celle de l'import.

## Sept tests repointés, et un défaut trouvé dans l'un d'eux

Cinq fichiers lisaient `src/App.jsx` **en texte** pour y chercher le thème. Ils
relisent maintenant le monolithe ET ce qui en est parti — la recette
qu'employait déjà `clair.test.mjs` pour trois fichiers : `themes`, `contraste`,
`apparence_mobile`, `clair`, `etats`.

Deux assertions ont dû changer, et c'est l'extraction qui a raison :
`contraste.test.mjs` figeait la ligne d'import entière, désormais séparée en
deux moitiés qui se vérifient séparément — `src` étant la concaténation des
deux fichiers, une seule recherche ne dirait pas laquelle porte quoi.

Et `apparence_mobile.test.mjs` portait une aide **cassée en silence** :

```js
const i = src.indexOf('\nfunction ' + nom + '(');
return src.slice(i, …);
```

Introuvable, `indexOf` rend `-1`, et `slice(-1)` rend le **dernier caractère du
fichier** — une assertion qui échoue sans dire pourquoi. Elle tolère
maintenant le préfixe `export`, et rend une chaîne vide quand elle ne trouve
rien.

## Le poids d'amorce ne bouge pas, et c'était attendu

`boot-*.js` : 911,92 → **913,89 Ko** (264,14 → 264,72 Ko compressés). Deux
kilo-octets de PLUS, ceux de l'en-tête de documentation.

Ce n'est pas un échec, c'est la nature de l'étape : `theme.js` reste importé
**statiquement** par `App.jsx`, et il doit l'être — le thème se pose avant le
premier pixel. Les kilo-octets viendront quand les VUES sortiront derrière
`React.lazy`, pas ici. Ce que cette étape achète, c'est de la lisibilité et le
chemin vers les quatre suivantes.

## Vérifié dans le navigateur, et pas seulement aux tests

C'est la leçon du 23/09 (`Ico` non exporté) et de l'ADR 0102 : **ni le lint ni
les tests ne voient un écran qui ne s'allume pas.** Serveur relancé, onglet
neuf, console vide :

| | `--o-bg` | `--o-surfA` | `--o-accent` | Signature |
|---|---|---|---|---|
| iOS clair | `#e5e5ea` | `rgba(255,255,255,.62)` | `#915200` | `loggia-light` posée |
| Neumorphix sombre | `#1e2128` | `rgba(44,50,62,.62)` | `#5de0d8` | `--o-shadow: 5px 5px 12px #13161c, -5px -5px 12px …` |

L'accent iOS arrive **assombri** par la garde de contraste, et les jetons
qu'elle pose (`--o-text2`, `--o-text3`, `--o-text-lavis`) sont là : la garde se
rejoue bien depuis son nouveau fichier. La double ombre de Neumorphix, sa
signature, est en place. Six cartes de pièce, trente-six boutons.

Un piège du panneau, noté pour la prochaine fois : après beaucoup de
réécritures, le HMR de Vite garde des erreurs mortes dans la console de
l'onglet — ici un `ReferenceError` et un « does not provide an export named
'lum' » qui datent d'un état intermédiaire. Un onglet **neuf** tranche en une
seconde.

## Les quatre étapes suivantes

Dans l'ordre de rentabilité décroissante, telles que l'audit les a établies :
les cartes `Cv*` vers `src/cartes/` (−2 270 lignes, le plus gros gain, et c'est
là que `React.memo` deviendra utile), Énergie vers `src/views/energie.jsx`
(−642), les Pièces (−1 900, après avoir sorti `useDomainCards` et
`useLayoutEditor`), puis l'Accueil (−1 800, en dernier : une dizaine de tests y
épinglent le texte).

1 001 tests JS, 579 pytest, lint propre (45 avertissements, inchangé), audit
propre. Paquet rebâti, second passage sans effet.
