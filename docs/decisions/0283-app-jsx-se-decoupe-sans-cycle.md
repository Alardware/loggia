# 0283 — App.jsx se découpe sans cycle

*29 octobre 2026 — à l'essai (audit de consolidation du 28/10, lot 5 : le découpage d'`App.jsx`)*

## Le problème

`src/App.jsx` faisait 16 777 lignes : 556 déclarations de haut niveau, les
cartes, les fiches, l'édition, les vues, l'Accueil et l'application, dans un
seul fichier. Le lot 5 le découpe en cinq étapes, chacune livrée à part :

- (a) les cartes ;
- (b) l'édition, en chargement différé ;
- (c) les fiches et les vues ;
- (d) `Dashboard` en hooks et sous-composants ;
- (e) `App()` en hooks, avec `Sidebar`, `Header` et `MobileNav` à part.

Rien ne doit changer pour personne : même rendu, même comportement, mêmes
textes, aucune clé de langue en plus ni en moins.

## Le piège : un import circulaire avec App.jsx

Les cartes lisent 36 noms d'App.jsx, éparpillés sur tout le fichier (`useHass`,
`FicheAppareil`, `Segment`, `lavisCarte`, `readZone`…). Les sortir seules
voulait dire qu'elles importent `../App.jsx`, qui les importe : un cycle.

Un cycle d'ES modules ne tient que si aucun des deux côtés ne lit un nom de
l'autre **au chargement**. Or cinq objets « briques » le font
(`BRIQUES_MEDIA = { RmBascule, Segment, … }`, et `BRIQUES_SWITCH`,
`BRIQUES_GROUPE`, `BRIQUES_PIECE`, `BRIQUES_SCENARIO`).

Et les tests aggravaient le piège : 44 fichiers chargent `App.jsx?suffixe`, une
SECONDE instance du module. La carte, elle, aurait importé `../App.jsx` sans
suffixe : deux App vivantes, deux `useHass`, et l'ordre de chargement inversé
par rapport à la production.

## La décision

**Aucun module sorti n'importe App.jsx.**

Ce qui sort, sort avec tout ce qu'il lit. Pour les cartes, la fermeture fait
136 déclarations de plus, soit environ 2 200 lignes. Le graphe reste orienté :
App.jsx importe les modules sortis, jamais l'inverse.

- Plus de seconde instance dans les tests : un module sorti n'a pas de
  suffixe, App?lot3 et App?lot4 partagent le même.
- Plus de lecture au chargement à surveiller entre App.jsx et ses modules :
  ils sont évalués avant lui.
- Entre modules sortis, des cycles restent possibles (une carte ouvre sa
  fiche, une fiche rend sa carte). Ils ne passent que par des fonctions :
  l'outil de déplacement refuse toute lecture au chargement qui traverse un
  cycle, sauf vers une déclaration `function`, initialisée dès l'instanciation
  du module.

**Le texte se déplace à l'identique.** Chaque déclaration part avec ses
commentaires de tête, octet pour octet. Seuls changent :

- les imports en tête de chaque module, recalculés depuis ceux d'App.jsx ;
- les chemins relatifs, d'un cran plus haut (`'./theme.js'` → `'../theme.js'`,
  `import('./ficheprise.jsx')` → `import('../ficheprise.jsx')`) ;
- un `export { … }` final par module ;
- dans App.jsx, les imports qui ne servaient qu'au code parti.

Un contrôle compare les lignes d'avant et d'après, imports mis à part : aucune
ligne en plus, aucune en moins.

**App.jsx garde les noms que les tests exportent.** Les crochets de chargement
des tests ajoutent `;export { RoomLightCard, … }` au texte d'`App.jsx?suffixe`
(ADR 0282). Réexporter un nom IMPORTÉ est valide : App.jsx importe donc chacun
de ces noms, y compris ceux qu'il ne lit plus. Ces imports-là portent un
`eslint-disable-next-line no-unused-vars` qui dit pourquoi.

**Le monolithe se relit comme s'il était resté dans `src/`.**
`tests/monolithe.mjs` recale les chemins relatifs des modules sortis sur
`src/`. Un test qui cherche `import('./ficheprise.jsx')` le trouve, où que la
coquille soit rangée. Le reste du texte ne bouge pas.

Quand un test recopiait une ligne d'import entière, cette ligne est maintenant
répartie entre App.jsx et ses modules. Il en vérifie donc les NOMS, toutes
lignes réunies (`importsDe(texte, './attention.js')`). `themes.test.mjs` garde
son exigence : App.jsx et ses modules importent du thème, ensemble, exactement
ce qu'ils lisent.

## Étape (a) : les cartes et leur socle

| Module | Contenu |
|---|---|
| `app/noyau.jsx` | Le pont Home Assistant (`useHass`), `dec`/`decMax`, `useFlash`, le lavis (`SURF_CARTE`, `lavisCarte`), les prises (`soeursDe`, `lirePrise`…), `Segment`, les épingles, le dehors, les plantes, les zones de chauffage (`readZone`), `useAgenda` |
| `cartes/briques.jsx` | Les pièces au gabarit : `RM_*`, `RmBascule`, `RmJauge`, les chiffres, les binaires, `IlluOuvrant`, les piles, `GlypheCarte` |
| `cartes/*.jsx` | Une carte par famille : générique, mesure, groupe (et vigilance, piles), prise, lumière, robot, distributeur (et vanne), plante, volet, chauffage (climat, fil pilote), lecteur (et mode enfant) |
| `appareils/fiches.jsx` | Le squelette des fiches, la fiche appareil universelle, `useDomainCards`, les épingles, l'historique 24 h, et les coquilles des fiches chargées à la demande |
| `cartescustom/cartes.jsx` | Ce que cartes et fiches empruntent aux vues personnalisées : `CvCard`, les caméras, l'alarme, `MenuDeroulant` |

- `noyau.jsx` et `briques.jsx` ne dépendent d'aucun autre module sorti.
- App.jsx passe de 16 777 à 10 946 lignes.
- L'historique des mises en page (`FeuilleHistorique`, l. 4455-4578), rangé
  entre les cartes, reste pour l'étape (b) : c'est de l'édition.
- Les en-têtes d'Objets, `SectionsCapteurs` et la fiche de confort restent
  avec leur vue, pour l'étape (c).

## Étape (b) : l'édition, chargée à la demande

**Ce qui part du boot** (`lazyRecharge`) :

| Module | Contenu | Morceau |
|---|---|---|
| `edition/feuilles.jsx` | La feuille d'une carte (`CardEditSheet`), le composeur (`ComposeurCartes`), l'historique des mises en page (`FeuilleHistorique`), et ce qu'eux seuls lisent | 18,7 Ko |
| `edition/biblio.jsx` | La Bibliothèque des cartes | 13,6 Ko |
| `cartescustom/vue.jsx` | Une vue personnalisée (`CustomView`) | 6,1 Ko |

- **Ce qui reste au démarrage.** `useLayoutEditor` est un hook, et il ne sert
  pas qu'en édition : c'est lui qui range les cartes d'une pièce, d'Objets,
  des Volets, d'Énergie et de Sécurité, à chaque affichage. Il sort d'App.jsx
  (`edition/disposition.jsx`, avec l'agencement enregistré : `layoutOf`,
  `setLayout`, `applyLayout`…), mais il reste dans le boot. Son socle part avec
  lui : `app/ecran.jsx` (`useWide`, `useCoarse`) et `app/decouverte.jsx`
  (les entités d'une pièce, les lumières, les volets).
- **Des coquilles du même nom.** App.jsx garde, pour chacun des cinq
  composants, une coquille qui porte son nom et pose sa frontière Suspense.
  Aucun appel ne change, y compris ceux des vues Énergie, Sécurité et Volets,
  qui les reçoivent par `OUTILS_VUES`.
  - Ce sont des flèches (`const CardEditSheet = (props) => …`), pas des
    fonctions déclarées : la déclaration du vrai composant reste la seule que
    les tests trouvent sous `function CardEditSheet(`.
  - Repli : rien pour une feuille ; pour une vue, la surface vide qu'App
    montre déjà avant la découverte.
- **Ce que l'édition lit encore d'App.jsx lui est prêté** par `OUTILS_VUES`,
  posé en fin de fichier, comme pour Énergie et Sécurité (ADR 0274). Ce sont
  37 noms partagés avec l'affichage : `Header`, `PieceCard`, `EditableCard`,
  les cartes `Cv*`…
  - Les trois listes-fonctions (`CV_TYPE_NOMS`, `DOMAINES_EDITION`,
    `OBJ_FILTRES`) se prêtent appelées.
  - Aucune variable qui change (`let`) n'est prêtée : un prêt la figerait.
  - Les modules à la demande n'importent jamais App.jsx.
- **La borne du boot** (`tests/lot14_chargement.test.mjs`) passe de
  1 100 000 à 1 065 000 octets. Le boot fait 1 020 585 octets, contre
  1 055 710 après (a), soit −35 125. La marge reste celle d'avant, environ
  44 Ko.
- **Un test rend la Bibliothèque** (`biblio_plante`). Il la charge désormais
  depuis son module, après App.jsx qui pose `OUTILS_VUES` : la coquille, elle,
  ne se déplie pas dans un rendu statique.
- **L'élagage des imports d'App.jsx garde les noms que les tests exportent.**
  `RoomPlantCard` et `filtresEntite` n'étaient plus lus que par la
  Bibliothèque et la feuille d'une carte ; ils passent sur une ligne
  d'import « pour les tests ».

## Étape (c) : les vues, et ce qu'elles tirent

Tout reste au démarrage, comme avant : rien ne se charge plus tard qu'avant.

| Module | Contenu |
|---|---|
| `vues/piece.jsx` | La vue d'une pièce (`RoomView`), sa navigation, ses fiches de confort et du dehors |
| `vues/objets.jsx` | La vue Objets : ses filtres, ses en-têtes chargés à la demande, `objetsDeLaMaison`, `jugerObjet` |
| `vues/scenarios.jsx` | La vue Scénarios et la fiche d'un scénario |
| `vues/volets.jsx` | La vue Volets et ses barres (`ViewHead`, `ViewBar`…) |
| `vues/simples.jsx` | Énergie, Sécurité, Système, Paramètres (des coquilles chargées à la demande depuis l'ADR 0274), et la vue indisponible |
| `chrome/entete.jsx` | L'en-tête de chaque vue (`Header`), la recherche, le bouton de l'assistant |
| `edition/briques.jsx` | La carte éditable, le bandeau d'édition, le choix d'une icône |
| `edition/coquilles.jsx` | Les coquilles de l'étape (b) |
| `app/pieces.jsx` | L'habillage d'une pièce |
| `app/scenarios.jsx` | L'état et le lancement des scénarios, et leur carte |

- **`Header` sort ici, et non à l'étape (e).** Toutes les vues le rendent, et
  un module sorti n'importe jamais App.jsx : les vues ne pouvaient pas sortir
  sans lui. L'étape (e) garde `Sidebar`, `MobileNav` et `App()`.
- App.jsx passe de ~9 410 à 6 791 lignes. Le boot fait 1 020 621 octets
  (+36 : les imports).
- `VIEW_TITLES` est évalué à l'import, ce que `listes_fonctions` tolère comme
  un reste ancien. Il a changé de fichier : le reste le suit, comme
  `HUE_SCENES` le 11/10.

## Étape (d) : `Dashboard` en hooks et sous-composants

`Dashboard` faisait 1 759 lignes : 162 instructions, puis un rendu de 599
lignes. Un second outil le découpe sans toucher au texte.

**Un hook est un groupe CONTIGU d'instructions du corps.**
- Il est posé tel quel dans `function useX({ entrées }) { … return { sorties }; }`.
- Il est appelé à la même place : `const { sorties } = useX({ entrées });`.
- L'ordre des hooks ne change donc pas.
- L'outil refuse un groupe :
  - qui lit une variable déclarée APRÈS lui (une fermeture la lirait plus tard) ;
  - qui écrit une variable de l'extérieur ;
  - dont un `let` serait lu dehors ;
  - qui contient un `return`.

**Un sous-composant est un élément JSX, ou une fonction appelée sur place dans
le rendu** (`{(() => { … })()}`).
- Il devient `function X({ props }) { … }` au même corps.
- Ses props sont les variables locales qu'il lit, sous leur nom.
- La racine ne doit porter aucune `key`, le bloc aucun hook.

**Ce qui en sort.**
- Onze hooks :
  - `useAgendaAccueil`, `useRappelsAccueil` ;
  - `useAgencementAccueil` : l'agencement, la grille du format, défaire / refaire et l'historique, réunis parce qu'ils partagent la pile ;
  - `useGlisserSections`, `useGlisserPieces` ;
  - `useCielAccueil`, `useCamerasAccueil`, `useAttentionAccueil` ;
  - `useRailAccueil`, `useLumieresAccueil`, `useMomentAccueil`.
- Deux sous-composants : `BanniereAccueil` (22 props) et `SectionsAccueil` (57
  props, l'ancien bloc des sections appelé sur place).
- `Dashboard` garde son état propre, le rendu de ses sections (`Sec`) et ses
  feuilles.

**Le lint ne bouge pas.**
- Une fonction `set…` reçue en paramètre n'est plus reconnue stable par
  `react-hooks/exhaustive-deps`.
- Les groupes sont donc choisis pour que la liste des avertissements reste
  la même, mot pour mot.

**L'Accueil sort ensuite d'App.jsx**, avec tout ce qu'il tire :

| Module | Contenu |
|---|---|
| `accueil/dashboard.jsx` | `Dashboard`, ses hooks, ses deux sous-composants |
| `accueil/briques.jsx` | La carte d'une pièce, les favoris, les onglets, « En ce moment », le ciel |
| `cartescustom/galerie.jsx` | Les cartes des vues personnalisées et de l'Accueil, leur catalogue et leurs feuilles |

- App.jsx passe de 6 791 à 2 559 lignes.
- Le boot grandit de 4 164 octets (1 024 785). C'est le prix des entrées et
  sorties nommées, des hooks et des sous-composants : une fois minifiées,
  elles s'écrivent deux fois. La borne de (b) garde sa marge, 40 Ko.
- **`DASHBOARD`** (`tests/monolithe.mjs`) est le texte entier de l'Accueil.
  Vingt-quatre tests découpaient `function Dashboard(` jusqu'à la fonction
  suivante, et n'en verraient plus que le corps : ils lisent ce texte-ci.
- `fuite_calculee` lisait App.jsx SEUL (`lire('../src/App.jsx')`), une forme
  que le garde-fou de l'ADR 0282 ne connaissait pas. Il lit `MONOLITHE`, et
  le garde-fou refuse désormais cette forme aussi.
- L'outil de déplacement laissait partir, avec un import devenu inutile, le
  commentaire posé au-dessus de lui. Deux commentaires (sur three.js, sur le
  formulaire d'un rendez-vous) se perdaient. L'outil corrigé les garde ; les
  étapes (a) à (c) n'en avaient perdu aucun (vérifié dans leurs contrôles).

## Étape (e) : `App()` en hooks, la coque à part

**Neuf hooks**, sortis par le même outil qu'en (d) :
`useConnexionApp`, `useToastApp`, `useMeteoApp`, `useAccueilApp`,
`useJournalApp`, `useReglagesEcran`, `useAssistantApp`, `useComptesApp`,
`useOnboardingApp`. Ils vivent dans `app/hooks.jsx`.

**Ce qui reste dans `App()` : le bloc configuration, thème, vue courante, vues
personnalisées et `hass`, et deux groupes.**
- Le bloc ne peut pas se couper. La sauvegarde de la configuration lit
  `cfgRef`, déclaré bien plus bas : le hook lirait une variable déclarée
  après lui, et l'outil le refuse.
- Le bloc ne peut pas non plus sortir d'un tenant. Ses fonctions `set…`
  (`setView`, `setEditMode`, `setThemeMode`…) servent aux effets d'`App()`.
  Rendues par un hook, `exhaustive-deps` ne les reconnaît plus stables : trois
  avertissements de plus, au-delà de la borne de 48.
- Les deux groupes qui écrivent dans ces fonctions (l'apparence, les profils)
  restent avec lui, pour la même raison.

**La coque.**
- `chrome/barrelaterale.jsx` : `Sidebar`, ses profils et ses notifications au
  tactile.
- `chrome/navmobile.jsx` : `MobileNav`.
- `Header` était sorti en (c).
- `app/derive.jsx` : `deriveAccueil` et `deriveNotifs`.

**Résultat.**
- App.jsx passe de 2 559 à 1 402 lignes : `App()`, ses imports, ses
  coquilles et le prêt à `OUTILS_VUES`.
- Le boot fait 1 027 376 octets (+2 591, les entrées et sorties des hooks).
- Le lint reste le même, mot pour mot.
- Un test suit l'appel : `piles_carte` lit la relecture du seuil des piles
  dans `useConnexionApp`, qu'`App()` appelle après son relevé.

## Ce que cela coûte

Rien pour personne :

- même code, à l'octet près, ailleurs ;
- à l'étape (a), le boot ne change pas : le code reste au démarrage,
  1 055 730 octets avant, 1 055 710 après (les imports, regroupés) ;
- à l'étape (b), le boot maigrit de 35 125 octets ; il reprend 4 164 octets en
  (d) et 2 591 en (e), pour les entrées et sorties des hooks et sous-composants.
  Bilan : 1 055 730 → 1 027 376 octets, soit −28 354 ;
- la première ouverture d'une feuille d'édition, de la Bibliothèque ou d'une
  vue personnalisée attend désormais son morceau : quelques Ko, servis par
  Home Assistant sur le réseau local ;
- le lint garde ses 48 avertissements, déplacés avec leur code.

Côté tests :

- des fichiers retouchés à chaque étape. Ils vérifient la même chose, à
  l'endroit où le code vit désormais :
  - (a) : 12 ;
  - (b) : 4 de plus (`edition_en_tete`, `biblio_plante`, `couleurs_en_dur`,
    `lot14_chargement`) ;
  - (c) : 3 de plus (`listes_fonctions`, `barre_laterale_nom`,
    `rail_defilant`) ;
  - (d) : les 24 qui lisaient `Dashboard`, puis `fuite_calculee`, `nombres_langue`,
    `titre_piece_hauteur`, `couleurs_en_dur` et `monolithe.test` ;
  - (e) : `piles_carte` ;
- les plafonds de `couleurs_en_dur` suivent leurs couleurs :
  - App.jsx passe de 28 à 20 en (a), à 16 en (b), à 12 en (c), puis à 0 en
    (d), où il sort de la table ;
  - les modules sortis en reçoivent :
    - `accueil/briques.jsx` 10, `cartescustom/cartes.jsx` 8 ;
    - `vues/piece.jsx` 4, `edition/biblio.jsx` 3 ;
    - `cartescustom/galerie.jsx` 2, `edition/feuilles.jsx` 1.
