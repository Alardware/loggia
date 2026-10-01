# 0101 — Ce qui se lit, et ce qui se vise

Date : 27/09/2026. Statut : appliqué (local). **Redémarrage de Home Assistant requis** ; `index.html` ne change pas, mais `src/` oui — **le paquet est
rebâti**. Sixième point de l'audit du 27/09.

Quatre correctifs d'accessibilité. Les trois premiers ne se voient pas du tout
à l'écran ; le quatrième ne se voit presque pas.

## 1. Une feuille ouverte rend le reste de la page inerte

Le piège à focus des feuilles ne retenait que la touche **Tab**. Le curseur
virtuel d'un lecteur d'écran — flèches de NVDA, balayage de VoiceOver — ne
passe pas par le clavier : il lit le document. On sortait donc de la feuille
par en dessous, on atteignait une carte derrière le voile, et on l'activait.
Pour `pinmodal`, cela voulait dire agir **sans avoir saisi le code**.

**Mesuré dans la démonstration**, une fiche d'appareil ouverte : 118 contrôles
dans la page, **5 joignables, 0 hors de la feuille**. Refermée : **0 élément
inerte**, les 113 contrôles reviennent, et le focus retourne à la carte qui
l'avait ouverte.

### On ne déplace pas la feuille

La réponse habituelle est de rendre la feuille dans une couche à part, puis de
rendre inerte la racine de l'application. Refusé ici : la feuille est rendue là
où elle s'ouvre, et le thème dépoli en dépend — une carte dans une carte ne
refloute pas (`index.css`, règle du `[style*="--o-surfA"]` descendant). La
déplacer aurait changé le rendu de quatre-vingts feuilles sous ce thème.

`inerterAutour` marque donc inertes tous les **frères** de la feuille, de
proche en proche jusqu'au corps du document. Rien ne bouge dans l'arbre, et la
feuille comme ses ancêtres restent seuls joignables.

`inert` suffit seul : la spécification retire l'élément du parcours clavier ET
de l'arbre d'accessibilité. Y ajouter `aria-hidden` risquerait d'effacer, au
réveil, un `aria-hidden` posé là pour une autre raison. Un frère **déjà** inerte
n'est pas touché : une feuille ouverte par-dessus une autre ne doit pas, en se
fermant, réveiller ce que la première avait éteint.

**L'ordre compte** au démontage : on réveille la page AVANT de rendre le focus.
Sinon on le rendrait à un élément encore inerte, qui le refuse — et le clavier
repartirait du début du document. Les deux gestes vivent donc dans le même
effet.

Effet de bord heureux : le fond étant inerte, Tab n'a plus nulle part où aller.
Le piège à focus devient une ceinture de sécurité, et `pinmodal`, qui n'en avait
aucun, n'en a plus besoin.

## 2. Une feuille dit son nom

`role="dialog"` sans nom fait annoncer « dialogue », et rien d'autre, à
l'ouverture de **n'importe quelle** fiche.

Une seule feuille sur quatre-vingts passait un `title` ; les autres bâtissent
leur en-tête avec `TitreFeuille` (une vingtaine) ou `FicheEntete` (une dizaine).
C'est donc la ligne de titre qui nomme : la feuille tend un id, la **première**
ligne qui le demande le porte, et le dialogue le référence.

Le jeton évite deux écueils : deux lignes de titre dans une même feuille ne
peuvent pas porter le même id, et le double montage du mode strict de React ne
fait pas passer la ligne pour une seconde.

Vérifié à l'écran : la fiche d'une lampe s'annonce désormais **« Plafonnier
Bureau »**, la feuille d'ajout **« Ajouter une pièce »**.

## 3. Le tiroir hors écran sort du parcours

Au tactile, `is-closed` pousse le tiroir par `transform: translateX(-100%)` :
il reste `display: flex`, donc visible pour le navigateur. Ses **onze** boutons
restaient tabulables et lisibles, à l'aveugle, derrière le bord de l'écran.

Sur **ordinateur**, `is-closed` n'est pas la même chose du tout : c'est un rail
de 72 px, bien visible et bien utile. On n'y touche pas. L'inertie ne vaut donc
que pour `tactile && !open`.

Mesuré : fermé, 11 éléments focusables, **0 joignable** ; ouvert, les 11
reviennent.

`inert` est écrit en chaîne vide — React 18 ne le connaît pas comme booléen et
`inert={true}` écrirait `inert="true"` avec un avertissement.

## 4. Rien ne se vise sous 24 px

WCAG 2.5.8. Sur une tablette murale, une main qui tremble ne vise pas un point
de 8 px — et ces points-là changent de page.

| Ce qui était trop petit | Avant | Après |
|---|---|---|
| Points de page de l'Accueil | 18 × 6 et 6 × 6 | 24 × 24 |
| Points de pagination des icônes (×3 écrans) | 8 × 8 | 24 × 24 |
| Interrupteur d'une tuile pièce | 38 × 21 | 38 × 24 |
| Boutons « − / + » (×4) | 22 × 22 | 24 × 24 |

**Le dessin ne change pas.** On agrandit la zone autour, et une marge négative
rend les pixels empruntés : la rangée des points de l'Accueil mesure toujours
6 px de haut, l'interrupteur affiche toujours une pastille de 21. Les centres
des points sont posés à **24** les uns des autres — l'écart exact que demande
la règle quand des cibles se touchent.

Les trois écrans qui posaient des points de pagination le faisaient à
l'identique, deux d'entre eux à l'octet près : ils partagent désormais
`PointsDePage`.

Mesuré après correction : **zéro cible sous 24 px** sur six vues, à 390 comme à
1 280 px, feuilles ouvertes comprises.

## Ce que ce point ne fait PAS

L'audit relevait trois autres défauts d'accessibilité qui ne sont pas de cette
fournée : l'état de l'alarme et la carte « À surveiller » changent sans
`role="status"` (personne n'est prévenu si le focus est ailleurs), le menu
Notifications ne se ferme pas par Échap, et l'`aria-label` du curseur de
luminosité interpole une chaîne vide.

## Les garde-fous

Quatre tests dans `tests/clavier.test.mjs`, vérifiés dans les deux sens —
chacun échoue quand on retire son correctif : la mise en inertie et son ordre,
le nom porté par la ligne de titre, l'inertie du tiroir bornée au tactile, et
les quatre gabarits de cible.

Deux tests existants ont dû être ajustés, et c'est le correctif qui a raison :
`pieces.test.mjs` cherchait `marginLeft: 'auto'` dans le style de la pastille —
il vit maintenant sur l'enveloppe touchable — et `pieces_edition.test.mjs`
cherchait le nom des points de page dans `FichePiece`, d'où ils sont partis
pour `PointsDePage`.

1 001 tests JS, 579 pytest, lint et audit propres. Paquet rebâti, second
passage sans effet.
