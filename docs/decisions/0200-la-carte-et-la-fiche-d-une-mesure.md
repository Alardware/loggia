# 0200 — La carte et la fiche d'une mesure

*15 octobre 2026 — accepté, à l'essai (chantier Capteurs, plan 1, rien de publié). Revu le 16 octobre, après la passe téléphone (ADR 0202) : la carte étroite, le nom (C13) et le dehors (C15) ; puis la passe de corrections « bis » (deux relectures) : aucun mot coupé sur la carte large, la famille du CO₂, les coquilles des fiches, la Bibliothèque, les glyphes, l'état brut, l'unité inconnue, les unités des statistiques ; puis la passe « bis 2 » : la famille que le nom dit déjà, le plancher du chiffre, le glyphe du CO₂.*

**16/10, passe 1 ter (C15 révisé — « les capteur exterieur il manque les jauges »)** : dehors a ses propres zones — la température (Gel, Froid, Frais, Doux, Chaud, Canicule) et l'humidité (Sec, Normal, Humide, Saturé), sur les échelles du dehors de `confort.js` (`dehors`) — ; la carte, la compacte et la fiche gardent la barre, le mot de la zone, les repères, la courbe et ses bandes, mais rien n'y est une alerte : ni teinte, ni lavis, ni « aérez », ni conseil, ni « depuis », un vent fort non plus — ce qui suit sur le dehors « neutre » ne vaut plus que pour le CO₂, le bruit, les COV et la luminosité (`docs/chantier-capteurs.md`, C15, § 6).

**16/10, passe 1 quater (C17, tranché)** : une mesure n'est JUGÉE — zone, barre, phrase de zone, teinte, lavis, conseil, « depuis » — que dans une pièce de Loggia, sa zone Home Assistant reconnue au nom d'une pièce (`pieceLoggiaDe`, App.jsx) : du dedans, l'échelle du confort ; du dehors, celle du dehors. Sans zone, ou dans une zone que Loggia ne compte pas, la carte, la compacte et la fiche sont NEUTRES (`horsPiece`, `vueMesure`) : le chiffre et sa famille, la courbe sans bandes, le dernier signal — son « Capteur Frigo » n'est plus « Trop froid » pour toujours. Le vent et les particules se jugent partout ; une entité que le registre ne connaît pas (la maison fictive de la Bibliothèque) garde la table (`docs/chantier-capteurs.md`, C17).

## Le problème

> « ensuite enchaine avec les cartes capteurs » — 15 octobre

La carte d'une mesure était la carte générique d'une pièce (`RoomGenericCard`) :
la valeur en 22 px en haut à droite, une ligne « Libellé · VERDICT » en capitales
— « Qualité d'air · CONFINÉ » —, puis une jauge (`JaugeMesure`) aux repères de la
table. Seul le CO₂ prenait la couleur de son palier ; le vert du « Bon » s'y lisait
comme une alerte de plus. Sa fiche (`SensorSheet`) montrait la valeur en 44 px et
une courbe de 24 heures, lue dans l'histoire, sans repère ni zone. Au démarrage,
il restait 9 242 octets sous la borne. Sa maquette « Cartes capteurs » (cadres 1a et 1b) dit
autre chose ; ses choix du 15/10 (C1 à C4) et les décisions annoncées le même jour
(C5 à C12) le tranchent. Le premier rejeu du plan a posé trois questions de plus :
des noms coupés (6 sur 19 à 1 440 px, 11 à 1 280, 18 à 390), une mesure du dehors
jugée sur la table du confort, un capteur sans pièce perdu. C13 à C15 y répondent.

## La décision

**Une seule table (C3).** `src/confort.js` lit toute mesure : les quatre familles
d'avant gardent leurs bornes, leurs mots et leurs couleurs ; la luminosité, les
particules, les COV et le vent arrivent (ADR 0201). Ce qui est BON : le bleu et le
vert de la table, et toute la luminosité (C5) — `zoneMesure` le dit (`bon`), avec
le compagnon « r,g,b » de sa couleur ; `barreMesure`, `phraseMesure`,
`chiffreMesure`, `nomMesure` et `zonesMesure` écrivent la carte et la fiche.
**Dehors (C15), la table ne juge que le vent et les particules** (`jugeeDehors`) :
ses zones de confort sont faites pour l'intérieur — un jardin à 5 °C n'est pas
« Trop froid ».

**La carte (1a ; C6, C8, C11, C13, C15)**, `RoomMesureCard`, pour toute mesure de la
table (`estMesure`), dans une pièce comme dans Objets — la pièce n'en gagne aucune,
la carte d'avant change. Aux tailles de la maison (184) : la plaque seule en haut ;
14 px plus bas, le nom (15 / 700) et la phrase (12) à gauche, le chiffre (25 / 800,
l'unité en 13) à droite, aligné sur le bas de la phrase, et sa famille dessous en
petites capitales — le CO₂ compris (correction bis, point 8 : sa maquette la taisait
parce que le nom disait « CO₂ Chambre » ; dans Objets, la carte porte le nom de sa
pièce, et plus rien n'y disait le CO₂). **La famille se tait quand le nom affiché la
dit déjà** (correction bis 2, point 1) : « Chambre CO2 », « Chambre Lino CO2 » (Objets),
« Bureau CO2 » (Pièces) écrivaient « CO₂ » sous leur nom, et le lecteur d'écran le
disait deux fois. La règle (`nomDitFamille`, confort.js) vaut pour toutes les familles
(« Salle de bain température » sur TEMPÉRATURE) : le nom et la famille se comparent sans
casse ni accents, les indices ramenés à leurs chiffres (« CO2 » vaut « CO₂ »), la
ponctuation en espace (« PM2.5 » vaut « PM2,5 ») ; le nom la contient, mot entier ou non
(« Schlafzimmertemperatur »). Elle vaut sur la carte large, la carte étroite, la surface et
la fiche, qui lisent la même vue (`vueMesure`) ; au pied, la barre des
zones : une bande par zone et sa part de l'échelle, la zone où l'on est pleine, les
autres à 0,28, un repère de 4 px sur 16 à la valeur, les chiffres des repères
dessous, dans l'unité du capteur.
- **Le calme ne crie pas (C5).** Hors du bon, la plaque, la phrase et un lavis
  (0,1 en haut, 0,16 pour la dernière zone, 0,03 en bas) prennent la couleur de la
  zone ; une zone bonne s'écrit en neutre, sans teinte ni lavis.
- **La phrase (C8)** : le mot de la zone, « · aérez » quand la zone le demande (le
  CO₂ moyen et au-delà, l'humidité trop haute, les particules et les COV hors du
  bon) ; une température dit aussi l'humidité de son appareil (« Idéal · 52 %
  d'humidité »).
- **Le nom (C13)** passe sur deux lignes au plus, entre deux mots, jamais au milieu
  d'un mot ; ses lignes font 18 px, et la carte reste à 184. Dans Objets, la vue lui
  donne le nom de sa pièce (ADR 0201) : la surface dit donc la famille avec le
  chiffre — « Séjour, Température 21,4 °C, Idéal ».
- **Aucun mot coupé sur la carte large** (correction bis, point 6). La colonne du nom
  ne descend jamais sous son mot le plus long (`min-content`) : c'est le CHIFFRE qui
  cède — sa colonne rétrécit, et sa ligne, un conteneur large de sa taille estimée
  (`emLigne`, à 0,3 px près), l'écrit à la taille qui y tient, de 25 à 14 px. La phrase
  vit dans un cadre large comme la colonne : elle rétrécit de 12 à 10,5 px d'après sa
  largeur estimée (`emPhrase`, Manrope 600, à 1 % près, plus 3 % de marge), puis prend
  sa forme de repli — l'humidité sans son mot (« Idéal · 52 % »), le mot de la zone sans
  « aérez » (« Confiné ») —, écrite une seconde fois, tue au lecteur d'écran ; « … » en
  dernier recours, pour une phrase qui n'a pas de forme plus courte.
- **Le chiffre a un plancher** (correction bis 2, point 4). Avec un mot très long
  (« Schlafzimmerluftqualität CO2 » à 1 280 px), la colonne du chiffre tombait à 0 et
  « 1.659 ppm » sortait de la carte. Sa colonne ne descend plus sous le chiffre en 14 px,
  sa plus petite taille ; au-delà, en dernier recours, c'est le nom qui cède : sa colonne
  ne prend jamais plus que ce que le plancher et l'écart de 10 px lui laissent
  (`--o-plancher`, un plafond qui borne son `min-width: auto`), et son mot finit en « … ».
  La famille, plus large que la colonne, en prend 8 px de l'écart au plus, puis finit en
  « … » : elle passait sur la phrase. Vu dans la démo, la mesure renommée par l'éditeur
  (1 440, 1 280 et 390 px ; français, allemand, polonais) : rien ne sort de la carte, le
  chiffre ne descend pas sous 14 px, et les noms de la démo ne se coupent pas plus qu'avant.
- **Dehors (C15)**, une famille que la table ne juge pas est NEUTRE : le chiffre, sans
  zone, sans barre, sans teinte ; une température y garde l'humidité de son appareil
  (« 81 % d'humidité »). Une pièce du dehors se reconnaît à son nom, dans les sept
  langues et sans accents (`estDehors`) : « Tuin », « Giardino », « Jardín »,
  « Ogród » ou « Na zewnątrz » passaient pour des pièces.
- **Muette** : « Indisponible » en rouge et le liseré qui respire (ADR 0048), ni
  chiffre ni barre.
- **Une seule vue** (`vueMesure`, pure, et `useVueMesure`) pour la carte, la
  compacte, la fiche et les sections d'Objets : chaque carte s'abonne à SA mesure,
  et à l'hygromètre de son appareil pour une température. Un capteur en
  Fahrenheit, un vent en m/s se lisent dans la table en Celsius et en km/h ; leurs
  chiffres s'écrivent dans leur unité. Un vent dans une unité que la table ne connaît
  pas (le Beaufort) ne se lit plus en km/h : il est neutre, sans zone (point 11). Un état
  qui n'est pas un nombre (« erreur ») devient la phrase, que la surface lit (point 10).
  Le relevé vivant ne passe devant le `hass` reçu que s'il connaît l'entité : la
  Bibliothèque des cartes, qui passe une maison fictive, disait « Indisponible » ; les
  aperçus d'une lumière aussi (`hassQuiConnait`, point 7).
- **Le glyphe** d'une mesure de la table est celui de sa famille (`iconeMesure` :
  `volume`, `wind`, `smog`…) — le bruit, le vent et les COV portaient le générique ; une
  icône choisie l'emporte (point 9). **Le CO₂ porte `wind`**, comme le vent et comme sa
  maquette (dit à la passe « bis 2 », point 7) : un glyphe d'air qui circule, celui de
  l'aération que sa phrase demande ; c'est la famille qui les distingue, sous le chiffre.
- **Ce qui part (C11)** : la ligne « Libellé · VERDICT », `JaugeMesure`, la teinte
  du seul CO₂ (`TEINTE_PALIER`). La carte générique garde les mesures sans table
  (une pression, une puissance) et la pile en cinq barres.

**La carte ÉTROITE** (sous 188 px de contenu, le téléphone) est celle de la grille
commune (ADR 0202) : la carte porte `o-gabarit` ; en haut, la plaque, et à droite le
chiffre (`ChiffreHaut`, 22 px, jusqu'à 16 pour une valeur longue) et, dessous, sa
famille en minuscules, de 10 à 8 px ; le nom en entier, 14 px, deux lignes de 16 au
plus ; la phrase, de 12 à 10,5 px, sous sa forme courte — une température y dit son
mot sans l'humidité de son appareil, qui a sa carte ; la barre des zones à la place
de la ligne de commandes, ses chiffres en 9,5 px, et, sous 120 px de contenu, ceux qui
se toucheraient se taisent (le « 1 600 » du CO₂, le « 17 » d'une température, le
« 80 » d'une humidité). Ce qui change de place — le chiffre et sa famille, la phrase
courte — s'écrit deux fois, et la feuille n'en montre qu'une. La largeur du chiffre
du haut (`emChiffre`) connaît les unités d'une mesure, mesurées dans la démo.

**La compacte** garde sa disposition et prend la phrase, le chiffre — à la place
d'une commande qu'elle n'a pas — et, hors du bon, la teinte de la zone sur la
pastille et le lavis. Elle n'écrit la famille d'aucune mesure — le CO₂ pas plus que
les autres : dans Objets, elle garde son nom de Home Assistant.

**La fiche (1b ; C9, C12, C15)**, une feuille sans onglets, chargée à la demande
(`fichecapteur.jsx`, son calcul dans `mesuresfiche.js`) ; tout capteur qui n'est
pas daté l'ouvre. Ses trois coquilles — la fiche d'une mesure, celle d'un capteur
binaire, la fiche de confort d'une pièce — sont celle de `FicheMedia` (correction
bis, point 3) : la coquille garde la feuille, la frontière Suspense est DEDANS (repli
de 260 px), et les modules n'exportent que des contenus, sans `BottomSheet`. Un
morceau introuvable se dit dans la feuille ; il faisait tomber toute la vue Objets,
ou toute la vue d'une pièce.
- L'en-tête : la plaque teintée comme la carte, « {pièce} · {famille} »,
  l'épingle, une croix.
- Le panneau du haut, teinté à 0,08 hors du bon : le chiffre en 48 / 800 ; la barre
  en 10 px et, dessous, le nom des zones qui tiennent sous leur bande — celle où
  l'on est, toujours — puis les chiffres des repères ; la phrase ; le conseil et
  « depuis ».
- **Le conseil** : le CO₂ moyen, « Pensez à aérer avant la nuit. » ; élevé ou
  confiné, « Ouvrez la fenêtre 10 minutes. » ; l'humidité trop haute, « Aérez :
  l'air est trop humide. », trop basse, « L'air est sec. » ; les particules et les
  COV, « Aérez 5 minutes. ». Ni la température, ni le bruit, ni la lumière, ni le
  vent n'en ont.
- **« Depuis »** : l'heure où la courbe a franchi la borne de la zone, côté bon —
  « Au-dessus de 1 600 ppm depuis 21:30. », « Au-dessous de 63 °F depuis 06:10. » ;
  une phrase à part, pour toute zone hors du bon. Rien quand la courbe ne le dit
  pas : sa dernière tranche n'y est pas encore, ou toute la journée y était. Une
  moyenne se date au DÉBUT de sa tranche (`start`, correction bis, point 12).
- « Dernières 24 h » : « min · max », la courbe 400 × 120 — les moyennes sur
  5 minutes de Home Assistant (`recorder/statistics_during_period`), lues une fois,
  sinon l'histoire, comme avant —, les zones hors du bon en bandes de fond, les
  repères de la table sur l'axe, à 12 px au moins l'un de l'autre. Les moyennes sont
  demandées dans l'unité que la carte écrit (`units` : `temperature`, `speed` pour un
  vent, comme prisesetat.js ; point 5) — Home Assistant les rend sinon dans l'unité où
  la statistique est née, et 21 °C se relisaient 21 °F. La journée se calcule une fois
  par lecture (`journeeMesure`, dans un `useMemo`), et la zone de chaque point se lit
  dans les zones bâties une fois (point 13). Une lecture qui échoue laisse la fiche
  lisible : la courbe passe par l'histoire.
- Les faits : le dernier signal (le relevé le plus récent des entités de
  l'appareil), la pile s'il en a une, L'appareil.
- Un capteur sans table y garde son chiffre (une décimale) et sa courbe, sans barre
  ni conseil ; une mesure neutre du dehors (C15) aussi : sa courbe n'a ni bandes ni
  repères ; muette, « — » et « Indisponible » sur le panneau du liseré.

**La place d'abord (C12).** Avant que la carte n'entre au démarrage, les fiches
d'un capteur et la fiche de confort d'une pièce (`RoomComfortModal`, ADR 0039) le
quittent, telles quelles, pour des modules à la demande.

## Ce que cela coûte

Le démarrage, mesuré au rejeu du plan (16/10, après la passe téléphone) :
1 090 758 octets avant ; −7 739 quand les fiches partent ; puis la table, la
carte, la carte étroite, la compacte, la coquille de la fiche, les mesures d'Objets
et leur nom ; 1 091 108 octets à la fin du plan, +350 octets sur le chiffre
d'avant — ce que la carte étroite, le nom et le dehors (C13 à C15) coûtent de plus
que ce que les fiches ont rendu. La borne (1 100 000) ne bouge pas : il reste
8 892 octets. La fiche lit les statistiques une fois par ouverture. La passe de
corrections « bis » en prend 2 209 de plus (les sections vivantes et leur barrière, le
chiffre qui cède et la phrase de repli, les deux coquilles qui gardent leur feuille) :
1 093 317 octets, 6 683 sous la borne. La passe « bis 2 » en prend 610 de plus (la famille
que le nom dit déjà, le plancher du chiffre, l'abonnement des sections aux seules mesures
jugées) : 1 093 927 octets, 6 073 sous la borne.

**Aucun mot coupé au milieu sur la carte large** : c'était accepté au premier rejeu
(« Idéal · 47 % d'humid… » à 1 280 px, en polonais dès 1 440 ; « … · przewietrz » ;
« Schlafzim… » en allemand, à côté d'un CO₂ à quatre chiffres), et ce ne l'est plus
(correction bis, point 6). Mesuré dans la démo, Objets › Capteurs, à 1 440 et à
1 280 px, en français, en allemand et en polonais : aucun nom ni aucune phrase coupés.
À 1 280 px (226 px de carte), « Schlafzimmer CO2 » garde son mot, le CO₂ à quatre
chiffres passe de 25 à 20,6 px ; « Idéal · 47 % » (« Ideal · 47 % », « Idealnie · 47 % »)
remplace la phrase entière, « Duszno » remplace « Duszno · przewietrz » ; « Confiné ·
aérez » tient en 11,7 px. À 1 440 px (266 px), toutes les phrases entières, « Idealnie ·
wilgotność 47 % » en 11,1 px. La surface les dit en entier.
Au téléphone, rien : ni nom, ni phrase. Un CO₂ à quatre chiffres (« 1 659 ppm »)
descend à 16 px à 320 px et y prend 2 px de l'air devant la plaque — 5 dans une vue
personnelle —, sans jamais la toucher. Le nom des zones sous la barre de la fiche
est estimé (7 px par signe) : à la plus petite largeur, certains se taisent.

## Ce qu'on n'a pas fait

- L'appui long.
- La carte agrégat `CvAir` des vues personnalisées, et `airPalier`, que le bandeau
  de l'Accueil et l'attention lisent : la carte nouvelle n'en remplaçait rien.
  **Un écart connu, gardé à dessein (C11)** : l'Accueil dit encore « CO₂ élevé »
  (`airPalier`, trois paliers) quand la carte du même capteur dit « Confiné » (la
  table, cinq zones). À reprendre à l'étape 2.
- `jaugeMesure` reste dans `confort.js` sans client à l'écran : cinq tests la
  lisent. La retirer est un travail à part.
- La pression atmosphérique : aucune zone.

## Ce que les tests tiennent

`tests/mesures_table.test.mjs` (la table, ce qui est bon, la barre, la phrase, ce
qui se juge dehors), `tests/carte_mesure.test.mjs` (la carte : ses couleurs, sa
phrase, son chiffre, sa barre, le nom sur deux lignes, la surface, le dehors, la
panne, l'abonnement, la fabrique), `tests/carte_mesure_etroite.test.mjs` (la carte
étroite : la grille commune, les deux écritures, la phrase courte, les repères tus,
le chiffre du haut, le budget), `tests/compacte_mesure.test.mjs`,
`tests/fiche_mesure.test.mjs` (le conseil, « depuis », la courbe, les noms sous la
barre, les statistiques et l'histoire, les faits, la panne, le dehors),
`tests/demo_mesures.test.mjs` ; pour la passe de corrections « bis » : la carte large
qui ne coupe aucun mot, la Bibliothèque, les glyphes, l'état brut et l'unité inconnue
(`carte_mesure`), les unités des statistiques, une lecture qui échoue, la journée
calculée une fois (`fiche_mesure`), les trois coquilles jouées (`lot16_fiches_panne`),
la croix de chaque contenu lue dans son module (`feuilles`), la table
(`mesures_table`) ; pour la passe « bis 2 » : la famille que le nom dit déjà, sur la carte
large, la carte étroite, la surface (`carte_mesure`, `carte_mesure_etroite`) et la fiche
(`fiche_mesure`), le plancher du chiffre (`carte_mesure`) ; et, changés pour la carte nouvelle : `capteurs`,
`jauges`, `lot16_co2_ligne`, `lot16_verdicts_lignes`, `unites_fahrenheit`,
`lot13_generique_lampe`, `lot13_vues_perso`, `lot16_etat_unknown`,
`lot16_horodatages`, `lot16_fiches_panne`, `feuilles`.
