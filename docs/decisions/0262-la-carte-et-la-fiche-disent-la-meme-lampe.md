# 0262 — La carte et la fiche disent la même lampe

*19 octobre 2026 — accepté (gestion des lumières, seconde tranche : la carte et la fiche, d'après l'audit qu'il a validé)*

## Le problème

L'audit du 19/10 a relu la carte et la fiche d'une lumière (ADR 0197) sur son
installation — ses Hue en `xy` et `color_temp`, dix-huit à vingt effets par
ampoule, une veilleuse qui s'éteint en un fondu de cinq minutes — et sur ce
que d'autres installations ont et que la sienne n'a pas : des rubans
`hs + white`, des `rgbww`, un vieux Home Assistant en mireds.

- **La saturation était ignorée.** Un pastel réglé depuis l'application Home
  Assistant (`hs [30, 12]`) donnait « Allumée · orange », la puce Orange
  cerclée ; éteinte, sa plaque redevenait saturée (la saturation 0,8 des puces
  était forcée sur tout `hs`).
- **La carte et la fiche n'avaient pas le même état optimiste.** Chacune
  appelait son `useVueLumiere`, donc ses deux `useOptimiste` et son doigt : la
  fiche disait « Éteinte », la carte derrière « Allumée » jusqu'au relevé. Et
  deux appuis rapides sur la bascule — allumée → off → on — laissaient l'écho
  du premier ordre (`off`, son `last_changed` avancé) effacer l'avance du
  second : la carte retombait sur « Éteinte » le temps d'un relevé. Le même
  défaut faisait sauter le chiffre pendant un fondu (60 → 48 → 60).
- **Les effets n'existaient pas** ; sa décision : oui.
- **Le journal disait « Loggia » pour tout geste fait depuis un compte**, même
  depuis l'application Home Assistant ou un assistant vocal.
- Le mode `white` n'était pas pilotable (une fois en couleur, un ruban ne
  revenait plus au blanc) ; une `rgbww` sans `color_temp` n'avait pas de
  blancs ; les mireds d'un ancien Home Assistant n'étaient pas lus ; la barre
  paraissait sur une lampe dont `planAction` aurait refusé l'ordre ; la fiche
  relisait son journal (trois appels) à chaque palier d'un fondu ; « S'éteint
  à … » survivait une minute à un minuteur annulé ; une flèche tenue au
  clavier envoyait un ordre par répétition ; une lampe allumée sans
  `brightness` disait « 100 % » ; la fiche d'une lampe éteinte s'ouvrait
  toujours sur les blancs ; et un refus du serveur (`verifier_patch`, nuit.py)
  portait le code générique `invalid_format`, que l'écran ne sait pas dire.
- Les veilleuses, enfin : l'ADR 0261 laissait la tuile d'une pièce et le
  repli des Scènes agir pendant la seconde où la règle Nuit n'est pas lue. Sa
  décision : **épargnées partout**.

## La décision

**Une seule avance par lampe, pour tout l'écran (B2, B3).** `useVueLumiere`
passe à la variante PARTAGÉE d'optimiste.js (`useOptimistePartage`, celle des
robots), par clé — `lumiere:<id>` pour la marche, `lumiere:bri:<id>` pour la
luminosité, `lumiere:doigt:<id>` pour le doigt sur la barre : la carte, la
compacte et la fiche d'une même lampe lisent et posent la même. Et la
variante gagne une `cible` : l'état réel ne répond qu'en l'ATTEIGNANT. L'écho
d'un ordre plus ancien (`off` quand on a demandé `on`), les paliers d'un
fondu (48 quand on a posé 60) ne lèvent plus l'avance ; une valeur jamais
atteinte tombe au filet, comme avant (6 s, 4 s). C'est l'idée de
`useDemandes` ; les robots, sans `cible`, ne changent pas. Le harnais des
tests (`crochets.mjs`) s'abonne désormais aux magasins extérieurs, comme
React : une avance posée hors de tout `useState` redessine le composant joué.

**La saturation se lit (B1).** Sous `SEUIL_BLANC` = 20 % (`hs_color[1]`), une
lampe en mode couleur est « Blanc » (le mot existe) : l'étiquette, la phrase,
et aucune puce de couleur n'est cerclée (ni jamais quand la teinte est
inconnue). 20 % : en HSV à pleine valeur, un rouge à 20 % est `[255, 204,
204]`, un blanc à peine teinté ; au-dessus la teinte se voit. Éteinte, la
plaque reprend la couleur que la lampe avait (`rgbDeHs`, la conversion de
Home Assistant, HSV à pleine valeur) : un pastel reste un pastel, un violet
plein reste `[149, 0, 255]` — la saturation 0,8 ne sert plus qu'aux puces.

**Les effets (B4).** Une lampe qui publie `effect_list` a une rangée
« Effet » dans le panneau des rangées, avant le Minuteur : une `ListeChoix`
(la règle des menus) des effets tels que l'intégration les nomme — jamais
traduits —, « Aucun » en tête quand la liste nomme l'arrêt (`off`, la
constante `EFFECT_OFF` de Home Assistant ; `none`, `None`, `stop_effect`),
rien de tel sinon. Choisir part par le moteur (`set_effect`, `light.turn_on`
avec `effect`) et allume une lampe éteinte, le geste d'abord. La phrase du
panneau du haut nomme l'effet en cours (« · effet Candle »). La carte ne
change pas : sa phrase n'a pas la place (« Allumée depuis hh:mm » tient à
0,3 px près à 320 px, ADR 0197).

**Le journal nomme qui (B5, L12 — commun aux prises et aux lumières).** Un
geste porté par un compte (`context_user_id`) que Loggia n'a pas fait (pas
de ligne `acte` à ± 60 s) ne dit plus « Loggia » : la pastille dit le NOM de
la personne — la `person.*` dont `attributes.user_id` est ce compte, son
`friendly_name`, un nom venu de Home Assistant qui ne se traduit pas —, ou
« Un compte » quand aucune personne ne répond du compte. La fiche d'une
lumière et celle d'une prise passent les `person.*` du relevé
(`personnesDe`). « Loggia » reste pour ce que Loggia fait elle-même : la
veilleuse, le minuteur, une règle. Un geste fait depuis Loggia par un compte
est aussi celui de la personne.

**Le blanc du mode `white`, les blancs d'une `rgbww`, les mireds (B6, B7).**
`capacitesLumiere` rend `blanc` (le mode `white`) ; la fiche montre alors une
puce « Blanc » dans sa palette des couleurs, qui envoie `light.turn_on` avec
`white: <luminosité 0-255>` par le moteur (`set_white`, actions.js ; Home
Assistant accepte un entier depuis 2021.4, `true` seulement depuis 2023 — on
envoie l'entier : la luminosité de la lampe, sinon le dernier niveau du
carnet, sinon plein, jamais 0 qui éteindrait). Une `rgbww` sans `color_temp`
a des blancs (Home Assistant convertit `color_temp_kelvin`), aux bornes de
sa maquette quand elle n'en publie pas. `color_temp` en mireds et
`min_` / `max_mireds` se lisent en kelvins (K = 1 000 000 / mireds ;
min_kelvin vient de max_mireds).

**Le reste, dans le même sens.** `variable` dit ce que `planAction` accepte :
un mode qui varie, jamais un simple `brightness` (B8). Le journal de la fiche
se relit tout de suite si la lampe s'allume ou s'éteint, au plus toutes les
10 s sur un réglage — un palier arrivé pendant la garde se relit à sa fin
(B9). Un changement d'état réel de la lampe relit les minuteurs
(`relireMinuteurs`, coalescés dans le tour ; B10). Les curseurs des lumières
— la barre de la carte et de la fiche, le blanc, la teinte — sont en rafale
au clavier : le dessin suit la touche, UN ordre part au relâcher ou 500 ms
après la dernière touche ; les autres curseurs ne changent pas (B11).
Allumée sans `brightness`, la carte tait son chiffre et la fiche dit
« Allumée » — ou le dernier niveau que le carnet garde, celui de son dernier
allumage avec un niveau (B12). La fiche d'une lampe éteinte s'ouvre sur le
mode que le carnet connaît (`dernierMode` ; B13). Le refus d'un patch Nuit
mal formé porte le code `nuit_format`, nommé, dit dans les sept langues
(B14).

**Les veilleuses sont épargnées partout (B15).** Tant que la règle Nuit
n'est pas lue, l'interrupteur de la tuile d'une pièce est dessiné à sa
place, grisé et inerte (`attente`) — pendant cette lecture, on ne sait pas
encore quelles lampes épargner, et la tuile compte toutes les siennes —,
`toggleRoomLights` ne commande rien, et le repli des Scènes sans script
n'envoie rien ; le module Nuit absent lève l'attente. La règle lue, une
pièce qui a d'autres lampes que ses veilleuses garde son interrupteur, à la
même place, actif ; une pièce qui n'a QUE sa veilleuse n'a plus rien à
commander : son interrupteur grisé disparaît alors, et la tuile se dit
éteinte (ADR 0261). L'ADR 0261 est corrigée d'une phrase.

**Le minuteur se décompte (sa demande du 20/10).** « S'éteint à 13:21 · dans
15 min » restait figé : la fiche ne recalculait l'heure qu'au relevé des
minuteurs et n'écrivait que des minutes. Le temps qu'il reste se dit à la
SECONDE sous l'heure — « dans 14 min 32 s », « dans 32 s », « dans 30 min »
quand elle tombe pile —, à la minute au-delà — « dans 1 h 30 » —
(`decompte`, prises.js), et la fiche bat la seconde tant qu'un minuteur
tourne, jamais sans lui ni quand l'heure est fixée (`useHorloge`,
prisesetat.js). La fiche d'une prise, même panneau, suit : « Se coupe à
13:21 · dans 14 min 32 s » ; sa carte garde la forme courte. Deux mots
nouveaux dans les six catalogues, les unités étant les mêmes partout :
« {m} min {s} s » et « {n} s » ; le polonais est à faire relire.

## Ce que ça coûte

Un compte Home Assistant qui ne peut pas lire `loggia/nuit/etat` sur un
serveur d'avant l'ADR 0260 garde des tuiles inertes : c'est le prix de la
décision. Les textes nouveaux — « Effet », « effet {nom} », « Un compte »,
les deux phrases de `nuit_format` — sont des propositions dans six langues ;
le polonais est à faire relire. `white: <entier>` plutôt que `true` : le
choix le plus ancien que Home Assistant accepte.

## Ce qu'on n'a pas fait

Les transitions des ampoules ; l'effet sur la carte ; une relecture du
carnet des lumières au changement d'état (le repère gris suit son sondage).

## Les tests

`tests/lumieres.test.mjs`, `tests/lumieresfiche.test.mjs` (le pur : B1, B4,
B6, B7, B8), `tests/optimiste.test.mjs` (la `cible`, B3),
`tests/carte_lumiere.test.mjs` (B3 joué, B10, B11, B12),
`tests/fiche_lumiere.test.mjs` (B1, B2, B4, B6, B7, B9, B11, B13),
`tests/journal_lumiere.test.mjs` et `tests/prisesfiche.test.mjs` (B5),
`tests/lumieresetat.test.mjs` (B10), `tests/tuile_veilleuse.test.mjs` et
`tests/scenes_repli.test.mjs` (B15), `tests/refus_codes.test.mjs` et
`tests/python/test_nuit.py` (B14).
