# ADR 0078 — Quatre dettes du plan, soldées

**Statut** : décidé et appliqué le 2026-09-24 ; gardé en local pour une mise à
jour groupée de correctifs.

Les quatre points les plus concrets qui restaient au plan d'évolution du 22/09 :
M3, M6, M5 et M8. Aucun ne demandait d'arbitrage, tous se voyaient à l'écran ou
dans la console.

## M3 — 339 Ko de police d'icônes chargés pour rien

`index.html` chargeait `uicons-solid-rounded.css` (151 Ko) et sa police
(188 Ko) en feuille **bloquante**. Or aucune classe `fi-sr-` n'existe dans
Loggia : les trois endroits qui rendent une icône (`icones.jsx`, `ui.jsx`,
`Onboarding.jsx`) la bâtissent tous en `'fi fi-rr-' + nom`. La seule mention de
`fi-sr-` était un commentaire qui met en garde contre elle.

- **La variante pleine n'est plus livrée** : ni la feuille, ni la police.
- **L'attente de celle qui reste est bornée** : `font-display: block`. Les deux
  `@font-face` d'UICons n'en avaient aucun, là où Manrope et Newsreader ont
  `swap` depuis toujours. `block` et non `swap` : le repli d'une police
  d'icônes dessine des carrés vides, mieux vaut un court instant sans rien.
- Un test tient les deux, et interdit d'écrire une classe `fi-sr-` qui ne
  s'afficherait plus (`tests/icones.test.mjs`).

## M6 — neuf requêtes en erreur à chaque affichage des ambiances

La vignette d'une ambiance posait `url('/local/hue_scenes/<uuid>.jpeg')`
par-dessus son dégradé, pour les 55 scènes du catalogue. Ces images sont
**facultatives** : il faut les déposer soi-même dans `www/hue_scenes/`, et
presque personne ne le fait. La vue Scénarios tirait donc neuf 404 à chaque
affichage, sur la démonstration en ligne comme sur toute installation sans ce
dossier. Le dégradé prenait le relais, la console se remplissait, et rien ne le
disait.

**L'image est demandée une fois par ambiance et par session**, hors du rendu
(`new Image()`), et n'est posée qu'une fois qu'elle a répondu. Une absence se
retient : la seconde visite ne redemande rien. Le dégradé reste ce qu'on voit
par défaut — jamais de carte grise vide.

## M5 — une vue inconnue montrait une maison qui n'existe pas

La vue courante survit dans `sessionStorage`. Un identifiant **inconnu** —
onglet d'une version antérieure, `?vue=home` tapé à la main, lien périmé — ne
correspondait à aucune branche du rendu et tombait sur le tableau de bord
**sans données** : sept pièces d'exemple avec des relevés inventés (18,1 °C,
412 ppm), « Tout va bien », et « Home Assistant n'est pas joignable » alors que
la connexion était là. Reproduit sur la démonstration en ligne.

- **Une vue inconnue revient à l'accueil** (`VUES_RENDUES`, `vueRendue`).
- **Une route qui désigne ce qui n'existe plus aussi** : une pièce renommée,
  une vue personnalisée supprimée ailleurs. On attend que la configuration soit
  là — sans quoi on renverrait à l'accueil pendant le chargement — puis on y
  revient.
- La maison d'exemple garde sa raison d'être : c'est l'écran d'**avant** la
  première connexion. Elle ne sert simplement plus de repli à une erreur de
  route.

## M8 — les six textes sous 4,5:1, et pourquoi la garde les manquait

L'ADR 0063 laissait six textes entre 3,8 et 4,4:1, tous dans la vue Sécurité de
trois thèmes : un nom de caméra, « TOUT EST CALME », les initiales d'une
personne. Le point commun n'était pas la vue, c'était le **mécanisme**.

Chacun de ces textes est écrit par un compagnon « r,g,b » posé sur un lavis de
**sa propre teinte** : la pastille d'état est `rgb(var(--o-ok-rgb))` sur
`rgba(var(--o-ok-rgb),.14)`. La garde (ADR 0060) traitait déjà ce cas pour la
teinte elle-même — « y compris sur LEUR PROPRE lavis » —, mais ne testait son
compagnon que contre la page et les cartes unies. Le jeton hexadécimal partait
donc assombri, et son compagnon restait vif.

**Le compagnon subit désormais le même test que la teinte** (`surSoi`). Un
thème qui tient déjà n'est pas touché : Loggia garde son vert.

Mesuré dans la démonstration, vue Sécurité, en clair : Frosted Glass 5,09,
GitHub 5,42, The Projekt 4,85, aucun texte sous son seuil. Restent hors mesure,
comme l'ADR 0063 le notait déjà, les textes posés sur le flux d'une caméra :
leur voile sombre dépend de l'image et ne se calcule pas d'avance.

## Conséquences

- **Aucun redémarrage de Home Assistant** : rien du composant ne change.
- Le premier rendu ne bloque plus sur 339 Ko inutiles.
- Un thème dont une teinte d'état est vive verra son compagnon légèrement
  assombri. C'est le seul changement visible sur une installation.
- La page Accessibilité du site et l'ADR 0063 ne parlent plus de six textes en
  suspens.

Tests : tests/icones.test.mjs (+1), tests/contraste.test.mjs (+1).
