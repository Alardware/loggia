# 0165 — La maison prend la place de l'arc

*8 octobre 2026 — accepté*

## Le problème

> « Sur mobile, la maison est trop petite, et retire la trajectoire du soleil
> aussi. » puis « Et la maison est trop foncée en mode clair. »
> — 8 octobre.

Trois défauts qui n'en font qu'un et demi.

**La maison était petite parce que l'arc prenait la place.** Mesure sur un écran
de 375 px : **180 × 135**. Le cadre de la scène faisait 600 unités de large parce
que la courbe du soleil en occupait tout le pourtour ; le dessin de la maison,
lui, n'en prenait que le tiers central (133 → 467). Pour recoller les deux, la
feuille de style portait **trois réglages faits à la main** — un zoom de 118 %,
une largeur figée à 55,56 %, un rapport de cadre (600/420) différent de celui du
dessin — chacun à retenir et à retoucher dès que l'autre bougeait.

**La maison était un bloc noir en mode clair.** Les quatre calques (maison,
panneaux, voiture, batterie) sont des images anthracite sur fond transparent,
dessinées pour le thème sombre. Mesure : **toit à 59 de luminance** pour un puits
à 238. Sur une carte claire, un pavé noir.

## La décision

### L'arc s'en va, et le cadre se resserre sur ce qu'on dessine

`SunArc` dessinait une courbe du lever au coucher, le rond du soleil à l'heure
réelle, son halo, et deux repères d'horaires. Tout cela part. Ce qui reste a de
la valeur : les **quatre pastilles posées sur le dessin**, qui disent ce que
chaque partie fait à l'instant. Le composant s'appelle désormais
`PastillesEnergie` — un nom qui ne promet plus d'arc.

Le cadre est tiré d'une seule table, et non plus semé entre le composant et la
feuille de style :

```js
const CHIP_RESEAU_X = 452;   // la pastille du réseau, au bout de son câble
const SCENE_DEMI = CHIP_RESEAU_X + 46 + 6 - 300;
const SCENE = { x0: 300 - SCENE_DEMI, w: 2 * SCENE_DEMI, h: 250, mx: 133.33, mw: 333.33 };
```

Une seule pastille décide de la largeur : celle du réseau, la plus à droite. Son
libellé le plus long (« ↑ 12,3 kW ») lui donne 92 d'envergure et son halo
d'activité déborde encore de 6. Le reste s'en déduit, y compris le rapport de la
scène — le bloc de rattrapage mobile n'a plus rien à rattraper et disparaît.

### L'invariant n'est pas la symétrie, c'est le **rapport**

Premier essai : un cadre serré au plus juste, de 133 à 530. Il était **faux**.
Son milieu (331) ne tombe pas sur le centre de la maison (300), et dès que la
**hauteur** bride — le plafond de 340 px sur un ordinateur —, le SVG en `meet` se
centre dans la largeur qui reste : toutes les pastilles glissent d'une vingtaine
de pixels par rapport au dessin.

Deuxième essai : un cadre **symétrique** autour du centre de la maison. Juste,
mais cher — il réservait à gauche autant de vide que la pastille du réseau en
demandait à droite, soit un dixième du cadre perdu pour rien. D'où, une heure
plus tard : « c'est encore un peu petit la maison ».

La symétrie n'était qu'un **moyen**. Un SVG en `meet` ne se recentre que dans un
conteneur d'un autre rapport que le sien — c'est la seule chose qui décollait les
pastilles du dessin. Le plafond de la scène passe donc de la **hauteur** à la
**largeur** :

```css
.o-en-scene { max-width: calc(340px * var(--o-scene-ratio, 1.5)); }
```

Même hauteur maximale, mais le rapport ne se rompt **jamais**. Le cadre peut dès
lors coller au dessin, bord à bord à gauche, et la maison récupère ce dixième.

Reste la pastille du réseau, seule à dépasser à droite. Elle était posée
vingt-six unités après le bout de son câble : du temps de l'arc, ce vide était
occupé par la courbe. Elle revient sur le câble, où elle aurait toujours dû être.

**Le prix, dit clairement** : le dessin n'est plus centré dans son puits — il est
décalé de 21 px sur 634 (3 %) sur un ordinateur, la pastille du réseau et son
câble occupant le vide. C'est le choix assumé : plus grand plutôt que centré au
millimètre.

### Les retraits comptent, et pas qu'au téléphone

Sur 375 px : la page en prend 28, la carte 48, le puits 22 — il ne restait que
**275 px** de scène. Le puits déborde donc du retrait de la carte — c'est une
illustration, pas un texte, et elle a le droit d'aller presque bord à bord — et
son propre retrait tombe de 10 à 4. Il s'arrête maintenant à **5 px** du bord de
la carte : il n'y a plus rien à prendre sans en sortir.

**« Et sur tablette pareil. »** Elle gardait les mêmes retraits *et* un plafond
plus bas que l'ordinateur — 290 px contre 340, sans raison. Mesure à 834 : le
dessin tenait dans 387 × 290 pour un puits de **456 × 639**. Les deux sautent :
le plafond s'unifie, et le puits déborde du retrait de la carte dès 1180 px.

Le vide **vertical** du puits sur tablette (639 px pour une scène de 314) n'est
pas touché : il vient de l'autre face de la carte, la Synthèse, plus haute. Le
réduire ferait sauter la page à chaque changement d'onglet.

### Sans position déclarée, les pastilles restent

Le composant rendait `null` dès que Home Assistant n'avait pas de latitude. Cela
se tenait quand il ne dessinait qu'un arc solaire. Sans arc, ce renvoi emportait
aussi la consommation de la maison et le sens du réseau, qui n'ont rien à voir
avec le soleil : chez quelqu'un qui n'a pas déclaré sa position, le schéma
perdait ses chiffres. Seule l'irradiance dépend désormais du jour.

### La maison s'éclaircit, et la valeur est mesurée

```css
html.loggia-light .o-en-house img { filter: brightness(2.1) saturate(.85); }
```

On ne redessine pas les images — on les éclaircit. Le réglage a été **mesuré sur
les pixels réels**, pas choisi : `brightness(2.1)` porte le toit à 124 et le mur à
168. Quarante-quatre points d'écart, donc le relief tient. Une baisse de
contraste (`contrast(.72) brightness(1.72)`) donnait un toit à peine plus clair
mais seulement 25 points d'écart : le volume s'aplatissait. Les fenêtres
éclairées saturent vers le blanc — sur une maison grise, une fenêtre claire se
lit encore comme une fenêtre allumée.

Le sélecteur vise `html.loggia-light`, donc **tous** les thèmes clairs, et les
images seules : le SVG des flux garde ses couleurs.

## Les erreurs commises en chemin

Deux, toutes deux attrapées à la mesure et non à l'œil.

**La maison étirée.** En posant `width` à côté de `height` et de `aspectRatio`, le
rapport est ignoré : elle est sortie à **664 × 340**, soit 1,95 au lieu de 1,333.
La hauteur et le rapport suffisent.

**Le cadre de travers**, décrit plus haut. Les deux n'étaient visibles que sur
l'ordinateur, où la hauteur bride — jamais sur le téléphone, qui était pourtant
le sujet de la demande.

## Le résultat, mesuré

| | avant | après |
|---|---|---|
| Maison sur un téléphone (375) | 180 × 135 | **283 × 212** (+147 % de surface) |
| Maison sur une tablette (834) | 387 × 290 | **419 × 314** |
| Maison sur une tablette large (1100) | 387 × 290 | **453 × 340** |
| Maison sur un ordinateur (1440) | 453 × 340 | 453 × 340 |
| Rapport du dessin | 1,333 | 1,333 partout |
| Écart entre le repère et le dessin | — | **0 px** à tout écran |
| Toit en mode clair | 59 de luminance | **124** |
| Réglages à tenir à la main dans le CSS | 3 | **0** |

En trois temps sur le téléphone : 225 × 169 avec le cadre symétrique, 276 × 207
une fois la symétrie remplacée par l'invariant de rapport, 283 × 212 en reprenant
les derniers retraits. L'ordinateur, lui, ne bouge pas : la hauteur y bride dans
tous les cas.

## Ce qu'on n'a pas fait

**Redessiner les images pour le thème clair.** Un filtre mesuré suffit, et quatre
images de plus seraient quatre images à tenir à jour.

**Déplacer les pastilles de la maison et de la production.** Elles ne débordent
pas ; seule celle du réseau le faisait, et pour une raison nommée.

## Ce que les tests tiennent

Quatre tests dans `tests/piles_energie.test.mjs` remplacent les deux qui
protégeaient l'arc (02/10 : la pastille d'irradiance qui se superposait, le rond
qui se posait la nuit sur le repère de lever). Ces deux défauts sont devenus
**impossibles**, mais leur histoire reste écrite :

- la trajectoire est partie et ne revient pas — ni `SunArc`, ni `SunMark`, ni
  `sunGrad`, ni `o-sunmark` ; les quatre pastilles, elles, sont toujours là ;
- sans position déclarée, les pastilles de la maison restent ;
- la scène tient son rapport (le plafond est une **largeur**, jamais une
  hauteur), le cadre colle au bord gauche du dessin, sa largeur se **déduit** de
  la pastille du réseau, la maison tient sa taille de sa hauteur et de son
  rapport seuls, et aucun des trois réglages de rattrapage n'est revenu dans le
  CSS ;
- en mode clair, le filtre est posé sur les images et sur elles seules.
