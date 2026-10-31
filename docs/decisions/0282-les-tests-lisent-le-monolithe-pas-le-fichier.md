# 0282 — Les tests lisent le monolithe, pas le fichier

*28 octobre 2026 — à l'essai (audit de consolidation du 28/10, lot 4 : H3 ; prépare le lot 5, le découpage d'`App.jsx`)*

## Le problème

`src/App.jsx` fait 16 776 lignes, et le lot 5 de l'audit doit le découper. Mais
236 fichiers de test lisaient son **texte** pour y chercher une fonction, un
motif, une tranche entre deux repères.

Ils le lisaient de onze façons différentes :
- `readFileSync(join(RACINE, 'src', 'App.jsx'))` ;
- `new URL('../src/App.jsx', …)` ;
- un `lire('src', 'App.jsx')` local ;
- des listes `['App.jsx', 'theme.js'].map(…)` ;
- des balayages qui mettaient `src/App.jsx` à part ;
- …

Seuls 32 passaient par `tests/monolithe.mjs`. Déplacer une fonction vers un
autre fichier aurait cassé des dizaines de tests sans que rien ne soit cassé
pour personne : le lot 5 était bloqué.

Une partie des tests épinglait aussi la **syntaxe exacte** d'une ligne : un
tableau de dépendances recopié tel quel, une expression ternaire, une
ponctuation. Un retour à la ligne les cassait.

## La décision

**Un seul helper, `tests/monolithe.mjs`.**

- `MONOLITHE` est le texte d'`App.jsx`, **puis** de tout ce qui en sort :
  - chaque fichier des dossiers `DOSSIERS_SORTIS` (`app`, `cartes`,
    `edition`, `appareils`, `vues`, `cartescustom`, `accueil`, `chrome`, ceux
    du plan du lot 5), dans l'ordre alphabétique de son chemin ;
  - chaque fichier de `FICHIERS_SORTIS`.
- Tant que rien n'est sorti, c'est exactement `App.jsx`, octet pour octet :
  les positions et les tranches restent où elles étaient.
- `PIECES_DU_MONOLITHE` en donne la liste, App.jsx en tête.
- `VUES_SORTIES` (ADR 0274) reste tel quel.

**Tous les tests lisent ce helper.**

- La migration est faite, sans toucher à `src/` ni à `custom_components/`.
- Une première passe automatique a remplacé les 241 lectures directes, dans
  195 fichiers.
- Une passe à la main a repris les cas qu'elle ne savait pas lire :
  - les listes de fichiers où `App.jsx` figurait (onze fichiers) ;
  - les balayages de `src/` qui mettaient `src/App.jsx` à part. Ils mettent
    désormais à part `PIECES_DU_MONOLITHE` (`lot14_animations`,
    `lot15_contraste_puces`, `lot16_boutons_compacts`,
    `rien_en_francais_expressions`, `parametres_entites`) ;
  - le relevé d'eslint de `dependances.test.mjs`, où une omission d'un module
    sorti compte sous `src/App.jsx`. Un déménagement n'y passe ni pour une
    omission nouvelle, ni pour une omission corrigée ;
  - la vérification de `cleJour`, qui accepte un import depuis `../agenda.js`.
- Chaque test vérifie ce qu'il vérifiait. Seul change l'endroit où il lit.
- 210 fichiers de test lisent désormais `MONOLITHE`.

**Un garde-fou, `tests/monolithe.test.mjs`.**

- Le helper dit vrai : App.jsx en tête, chaque fichier des dossiers sortis
  lu, et aucun lu deux fois.
- Plus aucun test ne lit App.jsx **seul** (les quatre formes de lecture
  directe sont refusées). Un test qui le ferait casserait au premier
  déplacement.
- Les imports d'App.jsx (`import('../src/App.jsx?…')`, dans 44 fichiers) ne
  sont pas des lectures du texte : ils testent ce que le module exporte.
  **Le lot 5 doit donc garder, dans App.jsx, un réexport de chaque nom qu'un
  test importe.**

**Quatre épingles syntaxiques remplacées par de la logique.**

- `dependances.test.mjs` : le tableau de dépendances du `useMemo` de l'Accueil
  se compare comme un **ensemble**, lu par équilibrage des parenthèses
  (`dependancesDe`), et non plus comme la ligne recopiée.
- `assistant.test.mjs`, « la miniature sort du bon côté » : son objet de style
  est **évalué** pour les deux sens. La miniature ne paraît qu'à l'appui, donc
  un rendu statique ne la voit pas.
- `assistant.test.mjs`, « le micro se referme toujours » : on vérifie ce qu'il
  fait (une session ouverte est annulée, sous garde), sans tenir compte des
  espaces.
- `lot16_config_abimee.test.mjs` : l'expression de `cfg.cams` est **évaluée**
  sur cinq configurations abîmées, au lieu d'en recopier la ligne.

## Ce qui reste

- **Environ 580 `assert.match` lisent encore une forme précise dans le
  source.** Beaucoup y sont à leur place : un nom de fonction, une clé, un
  appel. Les remplacer tous par des tests de rendu demande que le code
  testable sorte en modules purs, ce qui est précisément le lot 5. Les plus
  fragiles, celles qui recopient une ligne entière, se reprendront au fil du
  découpage, module par module.
- **Le lot 5 a deux contraintes :**
  - ranger ce qu'il sort d'App.jsx dans un dossier de `DOSSIERS_SORTIS`, ou
    l'ajouter à `FICHIERS_SORTIS` ;
  - garder les réexports d'App.jsx que les tests importent.

## Ce que cela coûte

Rien à l'exécution : le helper lit les mêmes fichiers une fois par fichier de
test, comme avant. Le nombre de tests passe de 3 783 à 3 787 : les quatre du
garde-fou. Aucun n'est retiré.
