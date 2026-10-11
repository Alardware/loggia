# 0181 — Le thème v2 : un seul lavis, et une règle perdue

*10 octobre 2026 — accepté*

## Le problème

> « Applique moi tout le thème correctement. » — 10 octobre, après plusieurs
> allers-retours.

Un dossier de refonte (`loggia-themes-redesign`) apportait un thème v2 : trois
blocs de jetons pour Loggia — sombre, clair, îlot sombre. Il a été posé, et le
rendu ne ressemblait toujours pas aux maquettes.

## Ce qui a coûté la journée : une règle avalée

**`body { … color: var(--o-text) … }` avait disparu de `index.css`.**

Elle vivait ENTRE `html.loggia-light` et `.o-sombre` — exactement au milieu des
trois blocs remplacés d'un coup. Elle est partie avec eux, sans que rien ne le
signale.

Sans `color: var(--o-text)`, tout le texte retombe sur le **noir par défaut du
navigateur**. D'où, après une journée de recherches ailleurs :

> « Mais bordel, tu vas modifier la couleur du texte ? Tu vois bien que c'est
> noir en thème sombre. […] C'est noir partout depuis tout à l'heure. »

Il l'avait signalé dès le premier rendu — « le rendu n'est pas du tout le
même » — pendant que le lavis, les bordures, les polices et les contrastes
étaient passés au crible. **Un `git diff` sur le fichier modifié l'aurait montré
en trente secondes.**

**Règle de méthode** : après un remplacement de BLOC dans un fichier existant,
lire le `git diff` en entier — pas seulement vérifier que ce qu'on voulait poser
est là.

`tests/clair.test.mjs` tient désormais cette règle : `body` doit poser le fond,
la police et la couleur du texte.

## Un seul lavis, pour toutes les cartes

Douze familles de cartes posaient leur teinte chacune à sa façon : six la
faisaient monter du BAS (« transparent 28 % »), une traversait en biais, une
autre descendait sans s'arrêter. Les cartes de pièce et les scénarios la
portaient **même au repos**.

La maquette n'en connaît qu'une, et elle vaut pour toutes :

```
teinte à .2 en haut  →  la même à .05 à 72 %,  sur la surface
bordure rgba(teinte,.26)
et RIEN quand la carte est au repos
```

Ce dernier point saute aux yeux sur ses captures : Bureau, Entrée et Salle de
bain étaient teintés alors qu'ils affichent « tout est éteint ». La couleur
redevient un **signal**. **17 cartes repeintes**, zéro ancien motif restant. La
bordure d'une pièce passe à l'ambre d'alerte quand `amb.niveau === 'probleme'`.

Le réglage « Lavis » de l'Apparence module toujours tout (`lav`), et « Sans »
rend les cartes neutres.

## Les puces segmentées se creusent dans le puits

Le thème v2 fait passer `--o-well` de `#1b2230` à `#10141c` : le puits **creuse**
au lieu de saillir. Ça a révélé que **treize groupes de puces portaient trois
gris différents** — `--o-well` (vue Énergie), `--o-s2` (sept), `--o-s1` (le
composant commun `Segment`, pris quatre fois).

> « Si on laisse comme ça, il faut l'appliquer partout. »

Le puits partout. Un groupe segmenté est un rail dans lequel la pastille glisse ;
le creux le dit, et le bleu plein y ressort. **Ne pas confondre** avec les barres
de FILTRES (`.o-bar`), qui défilent et dont les puces sont posées à nu.

## Les titres suivaient le thème : non

Mesuré : **39 endroits** écrivaient `fontFamily: "'Newsreader',serif"` en dur,
2 seulement passaient par `var(--o-serif, …)` — un jeton **défini nulle part**,
qui ne marchait que par son repli.

Les thèmes posent pourtant leur police (`applyVars` → `--o-font`). Sur iOS, tout
le corps de texte changeait et **les titres restaient en Newsreader**.

`--o-serif` existe maintenant sur `:root` ; un preset le pose avec
`v.serif || v.font` ; il rejoint `THEME_KEYS` pour être purgé comme `--o-font`.
Vérifié : sur `?theme=ios`, le titre passe à `-apple-system / SF Pro Display`.

## Ce qui n'était PAS un trou, vérifié avant d'y toucher

Les pastilles du schéma Énergie (`fill="rgba(8,13,22,.9)"` + `#eaf0fb`) sont
posées **sur des images** (`home.webp`, `solar.webp`) : même traitement que le
bandeau « Live » d'une caméra. Le graphique 24 h utilise `--o-s1` plus une aire
à 12 % — son rendu normal.

## Les icônes météo, invisibles en clair

> « On distingue mal en clair. »

Les icônes sont des **fichiers SVG importés comme images** : leurs couleurs sont
figées dedans. Leurs nuages y sont peints `#deeafb`, `#e6effc`, `#f3f7fe` — des
bleus quasi blancs. **Mesuré sur les pixels : 1,12:1 sur une carte claire.** Le
soleil, orange, restait visible : d'où un défaut déroutant.

On ne peut que FILTRER une image. Cinq candidats mesurés en dessinant l'icône
sur un canvas :

| filtre | contraste moyen | pixels ≥ 3:1 |
|---|---|---|
| aucun | 1,12 | — |
| `brightness(.65) saturate(1.7)` | 2,56 | 8 % |
| **`brightness(.58) saturate(1.8)`** | **3,12** | **85 %** |
| contour (drop-shadow) | 1,22 | 0 % |

Retenu le troisième, sous `html.loggia-light` — le sombre n'en a pas besoin.

## Deux choses que la maquette montrait et qu'il a tranchées

**Les fonds du calendrier.** Premier réflexe faux : le creux avait été
*renforcé*. Il voulait l'inverse — « on voit les fonds, enlève-moi ça » : la
colonne et la grille se lisaient comme trois rectangles empilés. La feuille
porte maintenant le fond (`<BottomSheet large opaque>`), et les blocs n'en ont
plus. Seul l'en-tête collé garde le sien — il masque les heures qui défilent —
et il prend EXACTEMENT celui de la feuille.

**L'ombre au survol.** Elle avait été retirée en septembre (« enlève s'il te
plaît »), mais :

> « À l'époque elle était trop prononcée, là je t'avoue que c'est pas mal, c'est
> léger. »

`--o-shadow-hover` était déjà posé par le thème v2 et ne servait plus qu'à la
bulle d'un événement. Rebranché sur les cartes, sous
`@media (hover: hover) and (pointer: fine)` : au doigt, un survol reste collé
après l'appui — c'est ce qui l'avait fait retirer.

## Deux alignements mesurés

| vue | titre, depuis le haut du contenu |
|---|---|
| Objets, Sécurité, Énergie | **26 px** — la norme |
| Accueil | 39 → **26** |
| Pièce | 40 → **26** |

Ces 14 px étaient VOULUS : le 01/10, « il n'est pas aligné avec Bonjour, bonsoir
de l'accueil », dit deux fois. Ils rendaient Pièce et Accueil **égaux**. Les
retirer **des deux** concilie les deux demandes : l'égalité tient, et descend à
la norme.

Au téléphone, le titre Énergie faisait 28 px contre 36 ailleurs — une règle CSS
posée pour qu'« L'énergie » ne mange pas l'écran. Mais « Scénarios », aussi long,
tenait à 36. Retirée : 215 px sur 375, une seule ligne.

## Une cible qu'un doigt attrape

> « La croix rouge, c'est difficile de masquer, ça a du mal à prendre, comme si
> le rayon du toucher est très faible. »

Deux causes. **La taille** : 25 boutons sur 31 sous 40 px en édition tablette,
certains 24 × 24 — le minimum strict de WCAG 2.5.8, loin des 44 recommandés. Et
**le glisser** : le bouton n'arrêtait pas le `pointerdown`, donc le déplacement
de section l'avalait, contrairement aux boutons des cartes de pièce.

Le dessin ne change pas (26 × 26, pour tenir dans une carte de 88 px) : une zone
sensible de 9 px tout autour porte la cible à **44 × 44**, et seulement au doigt.

## Conséquences

- **0 écart de jeton** avec le thème v2 (92 + 66 + 57).
- Garde-fous suivis sans être affaiblis : la garde de contraste repère les
  cartes teintées par un nouveau marqueur ; `tests/liseres.test.mjs` vérifie les
  deux bouts de `bordPiece` ; `tests/puces_segmentees.test.mjs` (neuf) refuse
  qu'un groupe reparte sur un autre gris ; `tests/titre_piece_hauteur.test.mjs`
  vérifie l'égalité plutôt qu'une valeur.
