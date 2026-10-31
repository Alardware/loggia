# 0290 — Finitions au téléphone

*30 octobre 2026 — à l'essai (audit de consolidation du 28/10, lot 7 : V1 à V7, et V9)*

## Le problème

L'audit a mesuré, dans la démo, ce qui gênait au doigt et à l'œil sur un
téléphone :

- **V1.** À 320 px, les six libellés de la barre du bas (10,8 px) n'étaient
  qu'à 4 px les uns des autres, et « Accueil » à 2 px du bord de l'écran. En
  polonais, 4 px aussi à 360 px.
- **V2.** 40 px de ciel vide entre la rangée de chiffres du héros et les points
  des pages (14 de rembourrage, 24 d'écart de section). À 320 px, le premier
  anneau des personnes à 15 px du nom, son halo dessus.
- **V3.** En thème clair, le texte du héros posé sur un ciel clair ne tenait que
  par le halo de son ombre : « Bonjour » à 3,35–4,79:1 de contraste moyen sur
  les pixels du ciel, selon le thème.
- **V4.** Des libellés à 9 et 10 px : les capitales du héros (« ALARME »,
  « CONSO MAISON »), les rubriques du menu, les jours du calendrier (« mer »,
  9 px à 80 % d'opacité, 3,69:1).
- **V5.** Des cibles sous 44 px au doigt : les points des pages (24 × 24),
  « Tous les scénarios » (85 × 25), les puces d'étage (30 de haut, rognées par
  leur puits).
- **V6.** L'état des pièces compactes coupé à 320 px (« 22,8° · Tout est ét… »,
  10 px de trop) ; le libellé de la recherche coupé dans l'en-tête de la
  tablette (90 px affichés pour 227).
- **V7.** Dans la fiche d'un volet, un lecteur d'écran annonçait deux
  « Fermer » : la croix, et « Fermer Volet salon », qui ferme le volet.
- **V9.** La pièce compacte animait `all` : la couleur de son texte, héritée,
  passait par le blanc du thème sombre au chargement en clair, et restait figée
  là dans un onglet en arrière-plan (1,08:1).

## La décision

- **V1.** Sous 360 px, la case de la barre garde 3 px de part et d'autre de son
  libellé au lieu de 2 (`marge`, navmobile.jsx), et le bouton de l'assistant
  passe de 62 à 54 px (`.o-nav-assist`). Le corps s'ajuste comme avant ; la
  largeur naturelle des libellés se lit enfin exacte (`scrollWidth` arrondissait
  à l'entier inférieur). À 320 px : 6 px entre deux libellés, 3 px au bord,
  10,6 px en français, 9,6 px en polonais, mots entiers.
- **V2.** Au téléphone (≤ 560 px), la bannière garde 4 px dessous au lieu de 14
  et les points remontent de 8 px : 22 px sous les chiffres. Sous 340 px, les
  avatars passent à 30 px, 6 px d'écart : 43 px entre le nom et le premier
  anneau. Le ciel garde sa hauteur.
- **V3.** En clair, sous un ciel qui n'est pas sombre, un voile passe derrière la
  bannière : `color-mix(in srgb, var(--o-bg) 40%, transparent)`, flou de 14 px,
  sans bord. Le fond du thème, jamais une couleur écrite. La bannière ne le rogne
  plus : sous le ciel, elle n'a pas de décor à rogner. « Bonjour » passe à
  4,96–7,12:1 de contraste moyen, la ligne d'état à 6,08–9,00:1.
- **V4.** 11 px : les sept capitales du héros, les rubriques du menu et ses deux
  lignes d'état, les jours du calendrier (en `--o-text2`, sans voile
  d'opacité).
- **V5.** 44 px au doigt, le dessin inchangé : chaque point des pages s'élargit
  vers l'extérieur, son point garde sa case de 24 du côté du voisin, et il passe
  au-dessus de la bannière, qui recouvrait son haut ; « Tous les scénarios »
  prend 44 de haut par une marge négative ; la puce d'étage devient un bouton de
  44 dont la pastille de 30 est le contenu, et son puits ne rogne plus. Les
  interrupteurs des cartes d'une pièce avaient déjà 46 × 50 réels (leur
  `::after`) : rien à faire.
- **V6.** Sous 340 px, la ligne d'état de la pièce compacte passe à 11 px et la
  carte serre ses bords de 3 px. Dans l'en-tête, le libellé court
  « Rechercher… » prend le relais sous 1 200 px d'en-tête (le long ne tient qu'au
  delà, l'espagnol compris) : à 1 024 et à 1 440 px, plus rien de coupé.
- **V7.** La croix commune (`CroixFeuille`) se nomme « Fermer la fiche », dans
  les sept langues. Les croix qui ferment un panneau DANS une feuille gardent
  « Fermer ».
- **V9.** La pièce compacte n'anime que `background`, `border-color` et
  `box-shadow` ; le point des pages, sa largeur et son fond.

## Ce qui n'est pas fait

- « 1 lumière · Rafraîchit » reste coupé dans la pièce compacte, à 320 comme à
  390 px : son nom le dit en entier.
- Les puces d'étage gardent leur largeur (25 px pour « 0 », « 1 ») : la rangée
  tient sur une ligne au téléphone, son choix du 25/10.
- Restent sous 11 px, hors du lot : les badges des caméras (« LIVE · JARDIN »,
  9 px), l'horloge (9,5 px), les axes des courbes, le compteur du menu.
- Le texte du héros en sombre, et en clair sous un ciel sombre : inchangés.
- V8 (la démo seulement) n'est pas dans ce lot.

## Les tailles sont des choix

L'audit les disait à valider sur ses maquettes. Chacune se défait seule :
`marge` et `.o-nav-assist` (V1), `.o-banniere` / `.o-pages-points` /
`.o-avatarin` (V2), le voile (V3), les 11 px (V4), les points à 44 (V5),
`.o-chip-etat` et `.o-recherche-court` (V6).

Tests : `tests/lot7_telephone.test.mjs` ; épingles mises à jour dans
`barre_mobile_courte`, `clavier`, `feuilles`, `lot14_cls`.
