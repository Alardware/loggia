# 0371 — Une cible qu'un doigt attrape, sans toucher au dessin

*14 novembre 2026 — appliqué (v3.100.0). Audit du 12/11, point E17, validé le 12/11 et repris seul après le lot 4. L'écran seul change : pas de redémarrage de Home Assistant.*

## Le problème

Mesurés au téléphone (375 px) et à la tablette, au doigt, des dizaines de
boutons restaient sous les 44 px visés : les puces des pièces et des actions
du moment (33 de haut), les filtres d'Objets (38 × 37), les onglets et les
périodes de l'Énergie (30), « Cartes / Plan » (37 × 30), les minis Volets et
Chauffage d'une carte de pièce (38 × 26), les − et + des scènes (24 × 24),
la croix des fiches (34 × 34), les puces des Paramètres (33), le bouton de
tout menu (27), les boutons de carte (40 à 43 de large).

Les agrandir à l'écran aurait défait des cartes de 184 px et des barres de
59 px réglées au pixel.

## La décision

**Le dessin ne change pas ; c'est la zone sensible qui s'étend, au doigt
seulement.** C'est la règle du 10/10 (`.o-tapzone`, la croix rouge de
l'édition) généralisée, sans son défaut — 9 px tout autour, quelle que soit
la taille :

- la zone va **jusqu'à 44 px dans chaque sens, et pas un pixel de plus** :
  un bouton de 152 × 33 ne gagne rien en largeur, un bouton de 44 × 44 ne
  gagne rien du tout ;
- elle ne vit que sous `pointer: coarse` : la souris n'en a pas besoin, et
  n'y gagnerait qu'un voisin cliqué par erreur ;
- **elle ne couvre jamais le dessin d'un voisin.** Entre deux boutons
  serrés, elle s'arrête au plus à la moitié de l'écart (`--o-doigt-x`,
  classe `o-doigt-serre`) : « Cartes / Plan » (3 px), « Blanc chaud » et
  « Éteindre » des scènes (4 px).

Une seule règle porte les familles qui ont déjà un nom dans la feuille
(boutons de carte, filtres, puces d'alarme, onglets, minis, puces des
Paramètres, croix des fiches, micro de la barre du bas) ; les boutons sans
nom prennent la classe `o-doigt` : les moitiés d'un segment, le bouton de
tout menu (`ListeChoix`), « Tout éteindre », « Enregistrer la maison »,
« Me prévenir », les flèches de période, « Comparer », les jours du
calendrier d'énergie.

Trois détails tiennent la promesse « rien ne bouge » :

- *Une rangée qui défile* rogne ce qui dépasse en hauteur, et y gagnerait
  un défilement vertical de quelques pixels. Les trois concernées (pièces,
  actions du moment, filtres d'Objets) s'épaississent de 6 px et le rendent
  en marge.
- *Un bouton qui rogne son texte* (`overflow: hidden` : onglets d'Énergie,
  modes de l'alarme) rognait aussi sa zone. `overflow-x: clip` ne rogne que
  dans le sens où le texte déborde ; un navigateur qui ne le connaît pas
  garde l'ancien comportement.
- *Un bouton déjà placé* (`absolute`, `sticky`) garde sa position : la règle
  qui place les autres pèse zéro (`:where`).

## Ce qui n'est pas fait

- **Les étages de l'Accueil, au téléphone** : 25 px de large, 2 px entre
  eux. Il n'y a rien à prendre sans couvrir le voisin ; les agrandir demande
  d'élargir le dessin, et la ligne (« Tout éteindre », étages, « Cartes /
  Plan ») est pleine à 375 px. Sa décision.
- **Trois familles restent sous 44 px en largeur**, bornées par leur
  voisin : « Cartes / Plan » (40 au lieu de 37), « Blanc chaud » et
  « Éteindre » (32 au lieu de 29). En hauteur, toutes sont à 44.
- **Les puces des Paramètres sur plusieurs rangées** : 6 px entre deux
  rangées, la zone monte à 39 au lieu de 33 ; la dernière rangée atteint 44.
- **Les Paramètres eux-mêmes** (`parametres.jsx`) : la barre des sections
  (36 de haut), la recherche (38), les pastilles de couleur (34 à 39 de
  large), « Aucun / Photo » (29). Fichier en cours de travail par la session
  des thèmes : à reprendre après elle.
- **L'intérieur des fiches** : seuls la croix et les menus sont étendus.
  Les puces d'une fiche (35 de haut dans la fiche d'un scénario) restent à
  mesurer fiche par fiche.
- **L'en-tête à la tablette** : ses boutons font 42 × 42 ; laissés.

## Les conséquences

Pas de redémarrage. Aucun texte neuf. Mesuré dans la démo, au doigt, à
375 × 812 et 767 × 1024 : sur les huit vues, aucun élément ne change de
place ni de taille (seules les trois rangées qui défilent s'épaississent,
sans rien déplacer), aucun bouton ne perd un bord au profit d'un voisin,
aucune rangée ne gagne de défilement vertical, la page ne déborde pas.
Test : `tests/audit_1211_e17_toucher.test.mjs`.
