# 0197 — La carte et la fiche d'une lumière

*14 octobre 2026 — accepté, à l'essai (chantier Lumières, plan 2, rien de publié).*

## Le problème

> « c'est bon j'ai redémarré continu avec les lumieres » — 14 octobre

La carte d'une lampe disait « 45 % de luminosité ». Seules les lampes à couleurs
prenaient leur teinte : un blanc, chaud ou froid, restait or. Éteinte, elle ne
gardait rien de son dernier niveau ; sa barre allait jusqu'à 0 % et éteignait la
lampe ; son ampoule changeait de dessin d'après le nom de la lampe (plafonnier,
lampadaire, veilleuse). Sa fiche était celle du 14/09 : « Allumée · 71 % ·
teinte personnalisée », l'étiquette « LUMINOSITÉ », huit pastilles en
`rgb_color` et quatre blancs (Bougie, Blanc chaud, Blanc neutre, Blanc froid) qui
ignoraient les bornes de l'ampoule, « Bascule immédiate, réconciliée au prochain
état » et « Dernier changement ». Une lampe sans variateur n'avait pas de fiche à
elle : sa carte ouvrait celle de l'appareil. La LED d'une borne Wi-Fi comptait
parmi les lumières de la maison. Sa maquette « Cartes lumières » (cadres 1a à 1e)
dit autre chose ; ses choix du 14/10 (L1 à L3) et les décisions annoncées le même
jour (L4 à L12) le tranchent. Deux retours, sur la carte construite, les ont
précisées : l'ampoule, et le pourcentage.

## La décision

**Quelles lumières (L11).** Un `light.*` sans `entity_category`, ou un switch que
la maison déclare lumière (`estLumiere`, `src/lumieres.js`) : la LED d'une borne
(`config`) n'est plus une lumière de la maison. Un switch-lumière garde sa place,
sans barre, en or. La règle est aussi celle des compteurs (`lumieresDe`) : le chip
« n allumées » de l'en-tête et de l'écran de veille, le compte de l'Accueil —
quand aucune lumière n'y est choisie à la main —, l'aperçu des Paramètres et
l'en-tête d'Objets › Lumières disent le même nombre. Avant, le chip de l'en-tête
et le compte de l'Accueil comptaient tout `light.*`, la LED d'une borne comprise :
une lampe de plus qu'Objets.

**La carte (L4 à L7)**, aux tailles de la maison (184 ; 176 de large au
téléphone) : la plaque et la bascule en haut ; le nom, la phrase d'état et,
allumée et variable, le pourcentage en grand, une seule fois ; la barre au pied.
- **La phrase** (§ 4, `phraseLumiere`) : « Indisponible depuis 14:20 » en rouge,
  « S'éteint à 21:10 » (un minuteur), « Allumée depuis 18:05 », « Éteinte » ; le
  geste d'abord lui donne l'heure du geste.
- **La couleur de la VRAIE lumière** (L6, `teinteLumiere`) : un blanc par la table
  de sa maquette (2 200 à 6 500 K, interpolée), une couleur par son `rgb_color`,
  sinon l'or de la maison ; la plaque, la barre et le lavis la portent — en thème
  clair, un blanc de plus de 4 000 K prend celui de 4 000 K (R7, plus bas) —, et le
  lavis monte avec la luminosité (0,08 + 0,14 × la luminosité en haut, 0,03 en
  bas). Éteinte, la carte se tait.
- **La barre** (L7) : `RmJauge` y gagne quatre réglages, sans rien changer pour un
  volet ou un volume — `min` (1 % : on éteint par la bascule, plus par la barre),
  `eteinte` (pas de remplissage, le repère gris au dernier niveau que garde le
  carnet, ADR 0198 ; sans niveau connu, pas de repère), `zone` (la hauteur où le
  doigt la prend : 44 px sur une carte, 52 dans la fiche) et `piste` (24 px, 32
  dans la fiche). Glisser sur une lampe éteinte l'allume à ce niveau. Le point de
  fin ne paraît que sous 95 %.
- **Les gestes de Loggia restent** (L3) : un appui ouvre la fiche, la bascule
  envoie `turn_on` ou `turn_off` d'après l'état affiché — jamais `toggle` —, et la
  carte le montre tout de suite (`useOptimiste` : 6 s pour la marche, 4 s pour la
  luminosité, dont l'écho Zigbee rejoue l'ancienne valeur). Chaque carte s'abonne
  à SA lampe (`useVueLumiere`) : la vue qui la porte ne surveille pas toujours
  `light.`.
- **Faire défiler n'allume rien** (revue finale du 14/10, R1). La barre portait
  `touch-action: none` : le doigt posé dessus pour FAIRE DÉFILER la page ne la faisait
  pas défiler, et au relâcher `light.turn_on brightness_pct=<x>` partait — une lampe
  éteinte s'allumait. Elle porte `pan-y`, pour tous ses emplois (lumière, volet, volume),
  et les deux curseurs de la fiche aussi (`CurseurPeint`) : un geste vertical est celui de
  la page, le navigateur l'annule (`pointercancel`), la jauge rend son dessin d'avant et
  n'envoie aucun ordre ; seul un geste horizontal pilote la barre.

**Le pourcentage, plus bas.** Son retour, une carte de lumière à côté de celles
d'un volet et d'une clim : « le % de luminosité ca ne va pas, par rapport au
autre cartes il doit etre plus bas ». Il prend la disposition de la carte d'un
volet : en grand (25 px, « % » en 15), à droite du nom ET de la phrase, aligné
sur le bas de la phrase (`alignItems: 'flex-end'`) ; `ChiffreLumiere` ne remonte
plus dans l'air du dessus.
- Il s'écrit deux fois dans le DOM, en bas et dans la ligne de la plaque, et la
  feuille de style n'en montre qu'un : une requête de conteneur, jamais un
  `display` en ligne, que la requête ne battrait pas.
- Sous 188 px de contenu — le seuil des volets, du chauffage et des prises —,
  celui du bas se cache et celui du haut paraît, entre la plaque et la bascule,
  aligné à droite contre elle. À côté de lui, le nom et la phrase n'avaient plus
  que 40 à 55 px sur un téléphone de 320 px (« Allumé e… », « Plaf… ») ; ils
  retrouvent toute la largeur, la phrase passe sur deux lignes plutôt que d'être
  coupée, le nom en 14 px, les airs se resserrent.
- « 100 % » en 20 px (« % » en 12) demande 142 px de contenu entre la plaque et la
  bascule, 4 px d'air de chaque côté. Entre 125 et 142 px de contenu (le
  téléphone de 360 px : 131), sa taille suit la carte (`--o-chiffre-haut`, 15 px
  à 360 px, 18 px à 375 px, 20 px à 390 px) ; en dessous de 125 px (le téléphone
  de 320 px : 111), même 12 px ne rentre plus, et il passe SOUS la bascule, en
  11 px, dans les 12 px que la plaque laisse au-dessous d'elle (26 + 12 = 38 :
  la ligne du haut devient une grille de deux lignes, sa hauteur ne bouge pas).
- La carte garde ses 184 px. Mesuré dans la démo le 14/10, à 1440, 390, 360 et
  320 px, en français, en allemand et en polonais : toutes les cartes font 184 px
  de haut (266 à 268 de large à 1440 px, puis 176, 161 et 141), rien ne dépasse,
  le pourcentage se voit une seule fois par lampe allumée et variable.
- **Une carte moyenne a un pourcentage plus petit** (revue finale du 14/10, R6). À
  1280 px, des cartes de 226 px — 192 de contenu —, « Allumée depuis 18:05 » (123,6 px
  à 12 px) finissait en « Allumée depuis 18:… » à côté de « 100 % » : 25 px et « % » en
  15 font 61,5 px, et avec ses 10 px d'air il ne lui restait que 120,5 px. De 188 à
  200 px de contenu, le pourcentage du bas passe à 21 px, « % » à 60 % (52,1 px) — la
  taille se lit dans `--o-chiffre-bas`, jamais en ligne —, toujours en bas, aligné sur
  la phrase : 129,9 px libres. Dès 200 px de contenu — 1366 px d'écran et plus — la
  grande taille tient (128,5 px libres, 5 px de marge). Mesuré dans la démo à 1280,
  1366, 1440 et 1920 px, en français, en allemand et en polonais : aucune phrase en
  « … », le pourcentage en bas à toutes les largeurs, 184 px de haut. Sous 188 px il
  monte, comme avant. L'espagnol (« Encendido desde 18:05 », 134 px) demanderait
  197 px de contenu à côté de « 100 % » : à 1280 px il finit encore en « … ».

**15/10 — le pourcentage prend la place de la température d'un radiateur.** Son
retour, au téléphone : « pourquoi le % et en haut entre l'icone et le toggle, pour
le volet de la chambre aussi alors que les radiateur lui c'est bien placé ». Ce que
cette section dit de la variante HAUTE — le pourcentage entre la plaque et la
bascule sous 188 px, sa taille qui suivait la carte, sa grille de 26 + 12 px sous
125 px, la phrase sur deux lignes — est REMPLACÉ : la variante est partie, avec son
code (`haut`, `o-lumiere-chiffre-haut`, `o-lumiere-haut`, `--o-chiffre-haut`) et sa
feuille.
- Le pourcentage s'écrit UNE fois, à la première rangée, deuxième colonne de la
  grille du milieu (`RM_MILIEU`, celle du radiateur : `ChiffreLumiere` prend la
  cellule de `TemperaturePiece`). Une carte large ne change pas : en bas à droite,
  aligné sur la phrase (la demande du 14/10) ; une carte moyenne garde ses 21 px,
  dans une plage bornée des deux côtés (`188px <= width < 200px`) — la carte
  étroite pose ses 20 px, l'ordre des règles ne décide plus de rien. Sa taille et son
  écart se lisent dans la feuille (`--o-chiffre-taille`, `--o-chiffre-ecart`).
- Sous 188 px de contenu, la carte prend la disposition étroite du radiateur, règle
  pour règle : le texte s'efface dans la grille (`o-lumiere-texte`, `display:
  contents`) ; le nom, en 13 px sur deux lignes au plus, passe à la ligne entre deux
  mots — un mot qui ne tient pas dans sa colonne finit en « … », comme
  « Climatisati… » sur le radiateur — ; le pourcentage à sa droite, en 20 px et « % »
  en 12, à 4 px du nom ; la phrase dessous, sur toute la largeur, en UNE ligne ; la
  ligne du haut ne porte plus que la plaque et la bascule. Budget en hauteur,
  celui du radiateur : 38 + 10 + 32 + 2 + 15 + 9 + 44 = 150 px.
- La phrase : 12 px, puis 11 d'après sa longueur (`--o-n`, que la carte pose ;
  `clamp(11px, 100cqi / (0,58 × n), 12px)` — 0,58 em par lettre majore Manrope en
  600, mesuré de 0,43 à 0,56 sur les phrases des sept langues, chiffres tabulaires),
  « … » si elle ne tient toujours pas à 11 px.
- Mesuré dans la démo le 15/10 — 390, 360 et 320 px, en français, en allemand et en
  polonais, sur Objets › Lumières, Objets › Volets, Pièces › Bureau et Pièces ›
  Chambre, 36 relevés : toutes les cartes font 184 px, rien ne dépasse, aucun mot
  n'est coupé dans le mot, le pourcentage se voit une seule fois, son bord droit sur
  celui du contenu. Dans une pièce, comparé à la température d'un radiateur de la même
  grille (`getBoundingClientRect`), à nom de même nombre de lignes : 0 px d'écart au bord
  droit, en haut et en bas — 74 px du haut de la carte et 90 du bas pour un nom sur
  deux lignes, 62 et 102 pour un nom sur une ligne. Un nom d'une ligne place son
  chiffre 12 px plus haut qu'un nom de deux lignes, sur une lumière comme sur un radiateur.
  Le rembourrage change d'un écran à l'autre : le contenu d'une carte de 141 px fait 113 px
  dans une pièce, 111 dans Objets › Lumières, 107 dans Objets › Volets.
- Ce qui finit encore en « … » : à 320 px, la phrase d'une lampe en français —
  « Allumée depuis hh:mm » fait 113,3 px à 11 px, pour 113 dans une pièce (0,3 px de
  trop) et 111 dans Objets — et plusieurs phrases de volet : « Ouvre demain à hh:mm »
  (114 px), « Öffnet morgen um hh:mm » (127,9 px, et à 360 px dans Objets),
  « Ochrona przeciwsłoneczna » (142,9 px, et à 360 px, et à 390 px dans Objets) et
  « Otworzy się jutro o hh:mm » (131 px, et à 360 px dans Objets). « Indisponible depuis
  hh:mm » (134,9 px) finit en « … » à 320 et 360 px, « Indisponible depuis le 12 oct. »
  (152,3 px) aux trois largeurs ; « Allumée depuis le 12 oct. » (130,7 px) tient dès
  360 px. Aucune autre phrase française à 360 et 390 px. Le nom : à 320 px sa colonne
  ne fait que 53 à 59 px à côté de « 100 % » ; son premier mot finit en « … » quand il
  est plus long (« Plafonn… », « Deckenleuchte », « Schlafzimmer », « Wohnzimmer »),
  comme « Climatisati… », « Klimaanlage » et « Heizkörper » sur les radiateurs.
- Le boot : 1 098 877 octets avant, 1 098 820 après, pour une borne de 1 100 000.
  `tests/chiffre_carte_etroite.test.mjs` tient la parité avec le radiateur, règle par
  règle, le budget et la phrase rejouée sur les phrases des sept langues ;
  `tests/carte_lumiere.test.mjs` et `tests/carte_volet.test.mjs` tiennent chacune sa
  carte.

**15/10, le soir — la carte étroite suit la grille commune (passe téléphone, ADR 0202 ;
sa décision, « ok pour 1c »).** Ce que la section précédente dit de la carte ÉTROITE est
REMPLACÉ ; la carte large et la carte moyenne ne changent pas. Sous 188 px de contenu,
la plaque est l'interrupteur (un `<button role="switch">`, nommé comme la bascule, 44 ×
44 de toucher ; muette, inerte) et la bascule du haut se tait ; le pourcentage monte en
haut à droite, face à la plaque (`ChiffreHaut`, 22 px) ; le nom passe EN ENTIER, en
14 px sur deux lignes au plus ; la phrase d'une lampe allumée s'écrit à son encre,
lisible comme un texte sur son lavis ; la barre reste la ligne du bas.

**L'encre d'une ampoule blanche.** La glyphe de la plaque et le repère de la barre
sont la teinte vraie rendue lisible sur le fond VRAI de la glyphe (`encreLumiere`,
lumieres.js) : la plaque (0,22) posée sur le lavis de la carte — 0,22 en haut à
100 % de luminosité, fois le réglage « Teinte » du thème —, l'une sur l'autre ;
la garde (`lisibleSurLavis`) reçoit leur opacité composée, et la teinte vraie pour
couleur du lavis. Elle se tire du blanc plafonné à 4 000 K (`ENCRE_BLANC_MAX`).
- Le défaut mesuré : la garde assombrit en gardant la teinte ET la saturation, et
  un blanc froid est légèrement rosé, à 100 % de saturation. Sur un lavis clair,
  l'encre d'une ampoule « Froide » virait au rouge (#d81400 à 6 200 K) ou au
  magenta (#d2008c à 6 500 K), le rouge des pannes. Le blanc de 4 000 K tire sur
  l'orange : assombri, il reste un brun — en thème clair, `#ae5700` à 6 500 K et
  `#9a4b00` à 2 700 K. Une couleur n'est pas un blanc : elle ne bouge pas ; l'or
  de la maison est un jeton, déjà gardé par le thème.
- La barre se peint de la teinte vraie en thème sombre ; en thème clair, de
  l'encre gardée : la teinte vraie d'un blanc froid, presque blanche, ne se voyait
  pas sur la piste claire (1,2:1 à 6 500 K).
- Contrastes lus sur le DOM de la démo le 14/10, contre le vrai fond, de 2 200 à
  6 500 K et pour un rouge et un bleu. Glyphe : de 5,0 à 5,8:1 en thème sombre, de
  4,8 à 5,7:1 en thème clair. Repère de la barre contre sa piste : de 5,8 à
  13,1:1 en sombre, de 4,2 à 7,9:1 en clair. Les tests tiennent le plancher, à
  100 % de luminosité — le lavis le plus dense —, sur les jetons d'`index.css` :
  la glyphe à 4,2:1 au moins, le repère à 3:1 (le seuil d'un glyphe et d'un
  repère, WCAG 1.4.11).
- **La plaque et le lavis d'un blanc, en thème clair** (revue finale du 14/10, R7).
  La teinte vraie d'un blanc froid — `[255, 249, 253]` à 6 500 K —, posée à 0,22 sur la
  carte claire, ne s'y voyait pas : lavis à 1,003:1, plaque à 1,006:1, la carte d'une
  lampe allumée était « toute blanche ». En thème clair, la plaque et le lavis prennent
  le blanc de l'encre, plafonné à 4 000 K (`teinteDeCarte`, `rgbDuBlanc(Math.min(k,
  4000))` : `[255, 209, 163]`) — ceux d'un blanc de 4 000 K : lavis à 1,066:1, plaque à
  1,121:1 —, et l'encre se lit contre ce fond-là. Une couleur, l'or de la maison et le
  thème sombre ne bougent pas. Lus sur le DOM de la démo en thème clair, glyphe /
  repère : 2 200 K 4,76 / 5,51 ; 2 700 K 4,67 / 5,08 ; 4 000 K 4,88 / 4,76 ; 6 500 K
  4,88 / 4,76 — le 3:1 tient partout.

**Une seule ampoule.** Sa demande, une capture à l'appui : « par defaut pour les
lumieres met leur cette icone d'ampoule ». Toute lumière — un `light.*`, un switch
déclaré lumière, quel que soit son nom — porte `<Fi i="bulb" />` sur sa carte, sa
compacte (`cvIcoEntite`) et la plaque de sa fiche. Une icône choisie à la main
passe toujours devant (`GlypheCarte`, `iconeChoisie`). Les dessins par type
(`LightIcon`, `LIGHT_ICONS`, `LIGHT_TYPE_ICON`) sont partis ; `lightType`, qui
devine un type d'après le nom, ne sert plus qu'à RANGER les lampes d'une pièce
(`LT_ORDER`, dans `roomEntitiesBrutes`).

**Un curseur dit où il en est.** `kbSlider` (ui.jsx) pose toujours
`aria-valuenow` — la valeur, sinon le minimum : ARIA 1.2 l'exige d'un
`role="slider"`, et une lampe éteinte dont le serveur ne sait pas le niveau, ou
un blanc que la lampe n'a pas réglé, en restaient sans. Il prend un `etat`
facultatif : `aria-valuetext` dit « Éteinte · 80 % » (le dernier niveau connu),
« Éteinte » sans niveau, jamais « 80 % » seul, qui l'annoncerait allumée. La
barre (`RmJauge`), le curseur du blanc et celui de la teinte (`CurseurPeint`) en
profitent ; les autres emplois (volets, volume, scènes, thermostats) n'ont ni
état ni valeur de repli, leur sortie est celle d'avant.

**La compacte** garde sa disposition et prend la phrase, le pourcentage (à partir
de 140 px de contenu, comme la puissance d'une prise) et la teinte réelle de la
pastille et du lavis. Pas de barre. Elle lit sa panne dans SA vue — celle de sa
phrase et de sa bascule —, non dans le `hass` de son parent, qui peut avoir un
tic de retard : une lampe qui revient en ligne perd son liseré et retrouve sa
bascule, une lampe qui tombe perd la sienne.

**La fiche (L8 à L10)** : une feuille sans onglets, chargée à la demande
(`fichelumiere.jsx`, son calcul dans `lumieresfiche.js`), que TOUTE lumière ouvre
— une lampe tout ou rien et un switch-lumière compris : le minuteur, le journal
et l'appareil y sont. La coquille d'`App.jsx` lui passe la vue de la carte
(`useVueLumiere`) : la fiche et la carte disent la même chose au même instant, le
geste d'abord compris.
- Le panneau du haut : « 45 % » en 48 px, ou « Allumée » / « Éteinte » /
  « Indisponible » ; la phrase longue — « S'éteint à 21:10 · blanc doux »,
  « Depuis 07:50 · se rallumera à 80 % » ; la bascule ; la barre (une zone de
  52 px, une piste de 32), « 1 % » et « 100 % » dessous.
- **Couleur** (une lampe qui a des blancs ou des couleurs) : « Douce · 2 700 K » ou
  « Violet » à droite du titre ; les puces Blancs / Couleurs, ouvertes sur le mode
  du moment, les deux palettes dans la même case (la leçon du 19/09 : la fiche ne
  change pas de hauteur d'un mode à l'autre) ; le curseur du blanc, peint de la
  couleur de chaque température entre les bornes de l'ampoule (`min_` et
  `max_color_temp_kelvin`), « Plus chaud », « Plus froid », et quatre blancs
  nommés — Chaude, Douce, Neutre, Froide — bornés à ceux de l'ampoule, leur encre
  calculée (le brun de sa maquette, jamais écrit en dur) ; le curseur de teinte et
  six couleurs nommées, que le lecteur d'écran lit par leur nom. Choisir allume la
  lampe, par `color_temp_kelvin` ou `hs_color` [teinte, 100] ; un curseur commande
  au relâcher. Sous 300 px de rangée (le téléphone de 360 px et moins), l'écart des
  blancs passe à 4 px et le mot à 11 px : « Łagodna » et « Neutralna » se coupaient
  dans des puces de 53 px.
- **Le minuteur de la fiche des prises**, tel quel : les mêmes durées (15 min,
  30 min, 1 h, 2 h), les mêmes puces, une demande à la fois — le serveur AJOUTE le
  temps. Il ne se montre actif qu'allumée. À la réponse, la fiche pose le minuteur
  dans l'état partagé (`poserMinuteurs`) : la carte dit « S'éteint à » tout de
  suite, sans attendre son sondage de 60 s. Sa rangée est à 18 px de chaque côté,
  comme le contenu des autres panneaux (revue finale du 14/10, R10) : avec les 14 px
  à droite des lignes à chevron, ses puces et « Annuler » à leur bout finissaient
  4 px plus à droite que tout le reste, à 360 et à 1440 px ; la ligne de
  « L'appareil » garde son chevron à 14 px. **L'appareil** ouvre la fiche
  universelle. **Aujourd'hui** : ADR 0198 ; il se relit sur l'état RÉEL de la lampe
  (son `last_updated`), non sur le geste d'abord (revue finale du 14/10, R2) :
  la lecture partait avant que le serveur n'ait noté le réglage, rendait le carnet
  d'avant, et « Réglée à 60 % » n'arrivait qu'à la minute suivante.
- **Muette** : « Indisponible », le liseré sur le panneau de l'appareil, et rien
  n'y commande plus — ni bascule, ni barre (ni son « 1 % » et son « 100 % »), ni
  palette, ni minuteur (lot 16 de l'audit) : un dessin qui ne répond pas laisserait
  croire à une commande. « L'appareil » reste, il ouvre sans commander.

**Ce qui part (L10)** : de la carte, « {n} % de luminosité », « Allumé » et
« Éteint » ; de la fiche d'avant, « Bascule immédiate, réconciliée au prochain
état », « Dernier changement », l'étiquette « LUMINOSITÉ », les huit pastilles
(`LIGHT_PALETTE`), les noms Bougie / Blanc chaud / Blanc neutre / Blanc froid
(`WHITE_TEMPS`) et la rangée « +30 min ». Dans les catalogues, deux clés que plus
rien n'appelle s'en vont — « Entité absente · vérifie l'appairage » (la carte
d'avant) et « teinte personnalisée » (la fiche d'avant) ; les autres mots restent
aux catalogues, dans les sept langues.

**17/10 — le pourcentage suit le doigt (passe bis 3 du chantier Mode enfant, point 3).**
Sa demande pour le volume — « quand je regle le volume, le pourcentage ne suis pas
comme sur la maquette » — vaut pour la luminosité : la barre peignait le doigt à la
main, et « 45 % » restait figé jusqu'au relâcher. `RmJauge` annonce le doigt
(`onGlisse`, ADR 0207) ; `useVueLumiere` le garde (`glisse`, exposé par `suivre`) et
le passe dans `bri` : le chiffre de la carte large, celui de la carte étroite, ce que
dit la surface et le grand pourcentage de la fiche le suivent — le lavis d'une lampe
allumée aussi, qui lit `bri`. L'ordre `turn_on` (`brightness_pct`) part toujours au
relâcher, UNE fois, et le geste d'abord (4 s) garde la valeur posée. Éteinte (L7), le
chiffre paraît dès le glisser — la phrase dit encore « Éteinte », la barre garde son
repère gris — et rien ne part avant le relâcher ; un geste annulé n'allume rien. Une
lampe muette oublie la valeur glissée, et sa barre devenue inerte lâche le doigt.
`tests/carte_lumiere.test.mjs` et `tests/fiche_lumiere.test.mjs` le tiennent.

## Ce que cela coûte

La borne du démarrage ne se relève pas : la fiche d'avant quitte le démarrage
(tâche 2), la carte, la compacte et l'état des lumières y entrent. Rejoué le
14/10 : 1 094 821 octets avant, 1 098 803 après, pour une borne de 1 100 000 — il
reste 1 197 octets. Le prochain chantier qui touche le démarrage devra d'abord en
sortir quelque chose. Leviers repérés, non pris : la glissière de la carte
générique d'une lampe (`CvCard`, en standard), et une fabrique commune pour les
magasins de `prisesetat.js`, `voletsetat.js` et `chauffageetat.js`, qui toucherait
au chauffage et aux volets, en essai.

À 320 px (111 px de contenu), le nom d'une lampe longue finit en « … », comme
celui d'un radiateur à côté de sa température ; la phrase y tient sur UNE ligne,
de 12 à 11 px, « … » quand elle ne tient pas (retours du 15/10, plus haut : elle
passait sur deux lignes).

Les textes nouveaux sont des propositions : l'allemand, le néerlandais, l'italien
et l'espagnol ; le polonais est marqué pour la relecture de Seba882. « Allumée
depuis » est une clé d'avant, partagée avec les prises : elle ne se réécrit pas.

## Ce qu'on n'a pas fait

L'appui long (L3), sur toutes les cartes ; les effets et les transitions des
ampoules ; les scènes par pièce ; le gros interrupteur (`CvBigToggle`) et la tuile
d'une pièce (§ 13). La carte générique d'une lampe, dans la fiche d'un appareil ou
une vue personnalisée, garde sa glissière.

## Ce qui reste à voir chez lui

Rien de cela n'a tourné chez lui : les `color_mode` réels de ses Hue (`xy` en
couleur, `color_temp` en blanc), leurs bornes (2 000 à 6 535 K) et le fondu de
ses veilleuses ne se sont vus que dans la démo. Le premier essai, sur son « go »
et sans toucher à ses lampes sans lui, dira si le contrat tient avec le vrai
serveur.

## Ce que les tests tiennent

`tests/lumieres.test.mjs` et `tests/lumieresfiche.test.mjs` (le pur : L11, la
teinte, le lavis, la phrase, les blancs et les couleurs, les bornes, l'encre — sa
base à 4 000 K, le brun du thème clair, la glyphe et le repère sur le vrai fond,
sombre et clair) ; `tests/lumieres_objets.test.mjs` (la LED écartée, le
switch-lumière gardé, les compteurs) ; `tests/jauge_lumiere.test.mjs` (la barre,
`aria-valuenow` et `aria-valuetext`) ; `tests/carte_lumiere.test.mjs`,
`tests/compacte_lumiere.test.mjs` et `tests/fiche_lumiere.test.mjs` (joués : la
teinte, le repère, les gestes, la place du pourcentage à chaque largeur, les
palettes, le minuteur, la panne lue dans la vue, la fiche muette sans barre,
l'ampoule par défaut et l'icône choisie) ; `tests/icone_choisie.test.mjs` ;
`tests/demo_lumieres.test.mjs` (la démo).

La revue finale du 14/10 (« Tâche 11 bis ») ajoute : `touch-action: pan-y` sur la barre
et les curseurs, et un geste annulé qui n'envoie rien (`jauge_lumiere`, `fiche_lumiere`) ;
le journal relu sur le `last_updated` (`fiche_lumiere`) ; la bascule d'une lampe ÉTEINTE
qui envoie `turn_on` (`carte_lumiere`, `compacte_lumiere`) ; la démo qui fond un réglage
dans l'allumage et garde l'heure du premier changement (`demo_lumieres`) ; les deux
tailles du pourcentage du bas et l'arithmétique de la phrase à chaque largeur
(`carte_lumiere`) ; `teinteDeCarte`, la plaque et le lavis d'un blanc en thème clair
(`lumieres`, `carte_lumiere`, `compacte_lumiere`, `fiche_lumiere`) ; le bord droit du
minuteur (`fiche_lumiere`) ; ailleurs, les mots que la carte du chauffage ne coupe plus
(`carte_chauffage`) et les tuiles d'Objets à 320 px (`objets`).
