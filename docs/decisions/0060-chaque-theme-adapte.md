# 0060 — Chaque thème adapté : la garde de contraste

Date : 19/09/2026 (v3.60.0). Statut : acceptée. Demande : « vérifie chaque
thème que tout soit bien adapté, chaque carte ».

## Contexte

Audit automatisé des quinze thèmes en clair et en sombre — trente variantes —
sur sept vues au téléphone, dans la démo : le contraste de chaque texte
(4,5:1 ; 3:1 pour les grands corps), de chaque icône (3:1), et les cartes qui
se confondent avec leur fond. Au départ :

- jusqu'à 103 textes sous 3:1 (Atrium clair) et 229 sous 4,5:1 (Material
  clair) ; 53 icônes sous 3:1 ; 42 cartes invisibles ;
- Loggia, la référence, en avait 1 sous 3:1 et 38 sous 4,5:1.

Trois causes.

1. **Les surfaces des thèmes étaient perdues.** `applyLook` retirait
   `--o-surfA` et `--o-surfB` AVANT de les relire pour les rendre
   translucides : elle relisait donc celles écrites dans le CSS, c'est-à-dire
   celles de Loggia. Les quatorze autres thèmes dessinaient leurs cartes dans
   le bleu nuit de Loggia — d'où des cartes qui disparaissaient (iOS sombre et
   Neumorphix sombre : 1,02:1 avec la page).
2. **Les palettes venues d'ailleurs** — éditeurs de code, iOS, Material —
   donnent un gris « muted » et des accents pensés pour un autre usage : un
   texte secondaire à 3,4:1, du blanc sur un accent turquoise à 2,4:1.
3. **Des couleurs écrites en dur** dans les composants : le bleu de Loggia
   pour le badge « n EN COURS », le jaune #FFCC44 des ampoules, le rose des
   médias.

## Décision

- **La surface lue est celle du thème.** `applyLook` la lit avant de la
  retoucher, et garde l'opacité du thème si elle est plus basse — Frosted
  Glass est un verre par conception.
- **Une garde de contraste** (`src/contraste.js`), appliquée après chaque
  thème. Elle relit les couleurs RÉELLES — surfaces composées sur le fond,
  remplissages neutres, arrêts du dégradé de page — et ne retouche que ce qui
  manque son seuil, du plus petit pas qui suffit, en gardant la teinte : seule
  la luminosité bouge. Sont gardés : le texte, les deux gris, les teintes
  d'état et leur compagnon « r,g,b », l'accent (3:1, y compris sur son propre
  disque), le fond d'accent qui porte du blanc, les deux fonds du bouton de
  l'assistant, et — pour un thème sans filet — la clarté des cartes et des
  puits. Un thème qui tient ses seuils n'est pas touché : Loggia ne bouge pas.
- **Atrium** retrouve son filet d'un pixel, porté par son ombre : le gabarit
  interdit une bordure aux cartes, l'anneau la remplace.
- **Composants** : le badge « en cours » prend l'accent du thème ; l'ampoule
  prend `--o-lampe` (ambre en clair) ; la couleur réelle d'une ampoule habille
  toujours sa carte, mais son icône et sa jauge en prennent la version lisible
  sur ce lavis ; les médias prennent `--o-rose-rgb` ; la température d'une
  puce choisie passe au blanc plein ; les initiales d'un absent restent
  lisibles (l'estompage ne vaut que pour une photo) ; la piste d'une jauge en
  anneau ne dépend plus d'un remplissage qui peut être blanc.

## Conséquences

- Sur les trente variantes, après correction : **aucun texte sous 3:1**
  (contre 103), **aucune carte confondue** sauf trois tuiles internes de
  Frosted clair, et **au plus deux icônes** par variante sous 3:1.
- Ce qui reste est à parité avec Loggia : le petit texte gris posé sur une
  carte teintée (3,7 à 4,3:1) et la piste décorative d'un anneau.
- Le mécanisme vaut aussi pour « Suivre Home Assistant » et pour tout thème
  futur : il lit ce qui est posé, il ne connaît aucun thème par son nom.

Tests : tests/contraste.test.mjs (6).
