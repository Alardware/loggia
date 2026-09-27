# 0095 — L'Ouverture s'ouvre comme les autres, l'icône se choisit, la prise dit ce qu'elle alimente

Date : 26/09/2026, poursuivie le 27. Statut : acceptée. Trois demandes d'un seul
message, un défaut trouvé en chemin, puis quatre allers-retours devant l'écran
qui ont corrigé le reste.

## 1. « Ouverture » ouvre Appareils, filtré

**Demande :** « la vue volets, je ne comprends pas pourquoi ça ne m'ouvre pas
comme pour les autres vues, le raccourci vers Appareils Ouverture ».

Lumières, Climat et Médias ouvrent `ObjetsView` avec un filtre. Ouverture, non :
elle ouvrait `VoletsView`, une vue à part — le 24/09, on l'avait même remise dans
la liste des vues secondaires *parce qu'elle* portait cette vue (ADR 0023). Vue
de l'écran, la cohérence est plus forte que la raison : quatre entrées voisines,
trois comportements identiques et un quatrième.

**Décision.** L'entrée du menu ouvre `ObjetsView filtre="volets"`. La vue à modes
et planning garde sa porte sous `voletsplan`, par un **lien d'en-tête**
« modes et planning → » — un lien, pas une fausse carte dans la grille.

## 2. Le mode d'un volet ne s'affiche plus en anglais

Vu sur la capture de l'utilisateur : « 2 volets · **unavailable** ». L'en-tête
recopiait l'état brut de l'entité de mode, indisponible chez lui. Il affiche
désormais le **nom** du mode dans la liste, ou rien : un état que la liste ne
connaît pas n'est pas un mode.

## 3. L'icône d'une carte se choisit, sans rien changer d'autre

**Demande :** « pouvoir modifier les icônes sans que ça change de catégorie, et
ce peu importe le type de carte ».

Le seul levier existant était de déclarer une prise « lumière » : elle changeait
d'icône, mais aussi de carte, de famille et de filtre. Trois effets pour une
envie d'un seul.

**Décision.** Une section **ICÔNE** dans la fiche d'entité : trente glyphes,
trois pages de dix, comme la fiche d'une pièce. Le choix se range par entité
dans la maison (`loggia_icones`, dans `LOGGIA_SYNC_KEYS`), passe **avant** toute
déduction dans `cvIcoEntite`, et vaut donc pour toutes les cartes qui montrent
cette entité. Un second appui sur la puce allumée rend le défaut. Le domaine, la
famille et le filtre ne bougent pas.

## 4. La prise dit ce qu'elle alimente

**Demande :** « modifie les cartes prises avec celles-ci, et de façon à ce que
l'appareil soit bien reconnu pour afficher la bonne carte » — avec une maquette
d'appareils animés.

Une prise commandée ne publie que `on`/`off`. Toutes portaient le même dessin et
le même mot, « Allumée » — qui ne veut rien dire seule : un NAS allumé travaille,
un lave-vaisselle allumé peut dormir à 1 W.

**Décision — `src/prises.js`**, pur et testé :

- **Treize appareils** reconnus au nom (NAS, ordinateur, lave-vaisselle,
  lave-linge, sèche-linge, réfrigérateur, TV, cafetière, radiateur, box, borne,
  sirène, prise), chacun avec sa couleur en **jetons** et son glyphe.
  Le nom est la seule source : Home Assistant ne publie ni marque ni modèle pour
  une prise, et sa `device_class` ne connaît que « outlet » et « switch ».
- **Quatre modes** : éteinte, veille (moins de 3 W), en marche, et *inconnu* —
  allumée sans capteur de puissance. On ne tranche pas ce qu'on ne mesure pas.
- **La couleur vive et le lavis sont réservés au travail.** Une prise en veille
  garde la surface ordinaire : sans quoi veille et marche se ressembleraient.
- **Les mots de l'appareil** quand il en a : un réfrigérateur a un compresseur,
  une cafetière chauffe, une borne charge.
- **L'animation ne parle que du travail** : tambour qui tourne, sirène qui
  tremble, lueur qui respire, témoins qui clignotent. Rien ne bouge en veille, et
  `prefers-reduced-motion` coupe tout.
- **L'étiquette ne se répète pas** : « RADIATEUR » au-dessus de « Radiateur
  chambre » prend une ligne pour ne rien apprendre.

**Ce que la maquette proposait et qui n'est pas repris :** la barre de cycle
(phase, pourcentage, temps restant) et l'état « terminé ». Loggia ne connaît pas
la progression d'un lave-vaisselle branché sur une prise : la maquette la
simulait. L'inventer d'une moyenne serait un chiffre faux affiché comme vrai.
Elle reviendra le jour où la donnée existe.

## 5. Le catalogue entier, dessiné — et rangé par catégorie (27/09)

Aucune fonte d'icônes n'a d'électroménager. Ni lave-linge, ni réfrigérateur, ni
volet roulant, ni VMC : j'ai vérifié la nôtre nom par nom. « Dans les icônes il
manque les appareils électroménager, par exemple j'ai un lave-vaisselle. » Ça ne
se réglait pas en cherchant mieux — il fallait les dessiner.

L'utilisateur a composé un catalogue et l'a envoyé. **156 dessins** y sont repris
tels quels dans `src/dessins.js`, écrit par un script à partir de sa source :

- des **traits**, pas des aplats — une épaisseur, `currentColor`, donc la teinte
  de la carte ;
- chacun porte **son** mouvement : le tambour tourne, la goutte tombe, la flamme
  vacille. `Ico` les **fige par défaut** et ne les laisse courir que là où
  quelque chose travaille — une grille de choix n'est pas une fête foraine ;
- le tracé est **agrandi de 18 %** dans sa boîte : un appareil du catalogue tient
  dans 16 à 19 unités sur 24, là où un glyphe de police remplit son cadratin. La
  mise en page, elle, ne bouge pas.

**La grille suit la catégorie de la carte.** « Pour chaque catégorie, il faudrait
filtrer et mettre en avant d'abord les icônes liées à sa catégorie, puis passer
aux autres. » Une lampe propose les ampoules, un volet les volets, une prise
l'électroménager, un capteur les détecteurs — puis le reste, sans rien perdre.
Chaque groupe donne ses dessins, puis ses glyphes de police. Au-delà de huit
pages, les points cèdent la place à un compte.

**Ce qui est parti :** la lueur et les témoins clignotants que la première
maquette posait DERRIÈRE le glyphe (`fx: 'glow'`, `fx: 'leds'`). « Derrière
l'icône il y a un pulse lumineux, j'en veux pas. » Ils venaient du premier envoi,
avant que les appareils ne soient dessinés ; un dessin porte son mouvement, rien
n'a à s'allumer autour.

## 6. Deux défauts que seul l'écran pouvait dire

**Le choix ne s'appliquait pas.** Chaque famille de carte dessinait son glyphe
sans jamais demander s'il y en avait un de choisi — une ampoule pour la lumière,
un volet pour le volet, une flamme pour le climat, un écran pour le média. Le
choix se rangeait bien et ne se voyait nulle part. Tout passe désormais par
`GlypheCarte` : le choix d'abord, le dessin de la famille en défaut. Et la fiche
demande un redessin, sans quoi rien ne bougeait jusqu'au rechargement — le choix
ne vit dans aucun état de React, il se lit au moment du rendu.

**Les radiateurs n'avaient pas l'option du tout.** Un radiateur en fil pilote est
une ZONE : sa carte porte une clé `zone:…`, pas un `entity_id`. La section ICÔNE
vivait sous la condition des entités. Elle en sort : toute carte à clé stable
peut choisir son dessin, et une zone part du groupe chauffage.

## Conséquences

- `VoletsView` n'est plus la route de `volets` : trois tests le disaient, ils
  disent maintenant le filtre et le lien.
- Un choix d'icône voyage avec la maison, comme les autres réglages communs, et
  vaut pour une entité comme pour une zone.
- `src/dessins.js` est ÉCRIT par un script : on le relit, on ne le retouche pas.
  Le catalogue d'origine reste la référence.
- La démonstration ne peut pas prouver le choix d'icône : sans composant serveur,
  elle refuse toute écriture de réglage et remet sa configuration à chaque tour.
  Ce qui s'y vérifie, c'est la grille ; l'enregistrement se vérifie chez soi.

Tests : tests/prises.test.mjs (9), tests/icone_choisie.test.mjs (7).
