# 0389 — Le robot a son dessin, animé au travail, dans sa fiche

*22 novembre 2026 — appliqué (v3.100.0) (sa demande du 22/11 : « pour les robots j'aimerais bien retrouver comme sur
Home Assistant le dessin de l'appareil en question animé en activité »)*

*Complète l'ADR [0042](0042-une-vue-par-robot-aspirateur-et-tondeuse.md) (la fiche d'un robot).*

## Le problème

Le 22/11, quatre captures : la fiche de Home Assistant d'un aspirateur « À la station d'accueil » et d'une tondeuse « En
pause » — l'appareil dessiné vu de dessus, dans un disque, au milieu de la fiche, au-dessus des commandes —, puis l'Accueil de
la fiche Loggia des deux mêmes robots, « Sur la base » et « En pause » : le mot d'état, la batterie, « Où » et les puces, aucun
dessin. Ses mots : « pour les robots j'aimerais bien retrouver comme sur Home Assistant le dessin de l'appareil en question animé
en activité ».

Home Assistant (frontend récent, `ha-state-control-vacuum-status` et `ha-state-control-lawn_mower-status`) dessine en SVG,
dans un disque teinté par l'état : l'aspirateur rond qui erre, sa brosse qui tourne, la poussière aspirée ; la tondeuse en
« D » qui erre, ses lames, l'herbe éjectée ; le retour (demi-tour, flèche), la base (le socle, une lueur qui respire), l'erreur
(une lueur rouge) ; `prefers-reduced-motion` coupe tout. Le code et les dessins ne sont pas repris : seulement l'esprit.

## La décision

**Un dessin par famille** (`src/dessinrobot.jsx`, `DessinRobot`), vu de dessus, dans un disque de 176 px — 132 au téléphone —,
posé au milieu du panneau de tête de l'Accueil, entre l'état et « Où ». Nos dessins : l'aspirateur rond, son pare-chocs, ses
deux brosses latérales, son capot et son témoin, la trappe du bac ; la tondeuse en « D », ses deux grandes roues crantées, la
fenêtre de ses trois lames, sa poignée.

**Il suit la phase de la fiche** (`vue.phase`, celle de la carte, l'avance d'un geste comprise — « Nettoyer » touché, il part
aussitôt) :
- au travail, c'est le SOL qui défile sous lui, à 20 px/s — le parquet et sa poussière, la pelouse rayée et ses touffes, qui
  passent sous la coque —, les brosses ou les lames tournent, il louvoie autour de son cap ; la tondeuse rejette ses brins ;
- en pause, la même scène, figée, au gris ; à l'arrêt hors de sa base, seul, au gris ; muet, à demi effacé ;
- au retour, sa base paraît en pointillé et deux chevrons l'y mènent : l'aspirateur fait demi-tour (il y rentre à reculons), la
  tondeuse y va tout droit (elle y entre en avançant, la borne devant elle) ;
- sur la base, il y est posé ;
- en erreur, de travers, au rouge, une pastille « ! », le disque qui pulse.

**Rien ne prétend ce que l'appareil ne publie pas** (règle 46 du guide) : le témoin de la base ne s'allume, en vert et en
respirant, que si sa sœur `battery_charging` dit qu'il charge — Home Assistant, lui, fait respirer toute base ; les ondes de
« Il bipe » n'existent que pour l'aspirateur, après « Localiser » ; ni serpillière, ni station de vidage, ni télémètre ne se
dessinent — le capot est un capot.

**Les couleurs sont celles du mot d'état** : l'accent pour l'aspirateur au travail, le vert pour la tondeuse, le rouge en
erreur, le gris sinon ; tout passe par deux variables posées par la fiche (`--rbd-c`, l'appareil ; `--rbd-a`, ce qui bouge)
et des opacités, pas `color-mix`, qu'une vieille tablette murale ne lit pas. La coque est au `--o-well` du thème, opaque, pour
que le sol passe dessous ; le disque est translucide, il se fond dans le fond de la feuille. Vérifié sur Loggia clair et
sombre, Dracula, iOS, Neumorphix et Material.

**« Réduire les animations » fige tout**, celui du système (`prefers-reduced-motion`) comme celui de l'appareil
(`html.loggia-calme`) ; la scène du travail reste lisible : la poussière posée devant lui, les brins de part et d'autre. Chaque
animation est tenue par son état : rien ne bouge en pause, à l'arrêt, muet, ni sur une base qui ne dit pas qu'elle charge.

Écarté : faire errer le robot dans son disque comme Home Assistant (le sol qui défile dit le mouvement sans le faire sortir du
disque) ; le dessin sur la carte (la carte garde sa plaque, ADR 0042) ; un dessin dans la fiche universelle « L'appareil »
(elle garde son image) ; un témoin de charge sans capteur de charge.

## Les conséquences

- Pas de redémarrage de Home Assistant : rien côté serveur, aucun `.py`.
- Le dessin part avec la fiche, chargée à la demande (`ficherobot.jsx`) : le démarrage n'en porte rien ; ses styles vivent
  dans `index.css`.
- La feuille garde ses onglets et sa hauteur fixe (760 px au PC) : l'Accueil défile un peu plus. Au PC, le départ reste à
  l'écran (son bas à 709 px sur 760 avec les cinq pièces de la démo). Au téléphone, le disque passe à 132 px ; au-delà de six
  pièces, le départ passe sous le bord et se rejoint d'un glissement.
- Aucun texte neuf : le dessin est décoratif (`aria-hidden`), le mot d'état le dit.
- La démo le montre : « Nettoyer », « Pause », « Base » de l'aspirateur et de la tondeuse font passer par le travail, la pause et
  le retour.
- Tests : `tests/dessin_robot.test.mjs`. Le guide de l'interface cite le dessin à sa règle 8 (« un état qui se dessine se
  dessine »).
