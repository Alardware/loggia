# 0261 — L'écran a une seule idée de la lumière

*19 octobre 2026 — accepté (gestion des lumières, première tranche : l'audit qu'il a validé)*

## Le problème

L'audit de la gestion des lumières, mesuré sur son installation — quatorze
`light.*`, aucun groupe, la LED d'une borne Wi-Fi en `entity_category:
config`, un `switch` déclaré lumière, une veilleuse dans la règle Nuit —,
relevait que l'écran n'avait pas UNE idée de ce qu'est une lumière de la
maison, mais six, qui divergeaient :

| Où | Ce qui comptait comme lumière |
|---|---|
| la découverte (`discoverLights`) | un `light.*` sans catégorie, **moins un motif de nom UniFi** (`u6`, `g6`, `unifi`…) hérité d'une seule installation, que l'audit de la CI refuse d'ailleurs comme un identifiant en dur ; plus les switch déclarés |
| les compteurs (`lumieresDe`) | un `light.*` sans catégorie, plus les switch déclarés — **sans** regarder ce que le registre cache ou désactive |
| les lampes variables des Scènes (`dimmableLights`) | tout `light.*` qui varie, LED comprise |
| la vue Nuit | tout `light.*`, LED comprise, **sans** les switch déclarés |
| l'en-tête d'une pièce | les `light.*` de la pièce, **sans** les switch déclarés — la tuile de l'Accueil, elle, les comptait |
| la signature des tuiles (`lightsSig`) | les `light.*` seuls : un switch déclaré lumière qui bougeait ne redessinait pas la tuile |

Et un groupe de lumières de Home Assistant — un `light.*` dont
`attributes.entity_id` liste les membres — comptait **deux fois** : le groupe
et chacun de ses membres.

Les veilleuses, ensuite. Sa décision : **« les veilleuses sont épargnées »**,
partout. Elles ne l'étaient qu'à « Tout éteindre » de l'en-tête d'Objets ›
Lumières. La tuile d'une pièce les éteignait et les allumait avec le reste,
et une veilleuse seule allumée faisait une tuile « allumée ». Le repli des
Scènes sans script (« Éteindre », la luminosité d'une ambiance) les touchait
aussi — et « Blanc chaud » sans script **éteignait** (il envoyait `turn_off`).
Et « Tout éteindre » ne paraissait jamais si `loggia/nuit/etat` échouait, même
quand le module Nuit est simplement absent : aucune veilleuse ne peut alors
exister.

Enfin, la carte générique standard d'une lampe (`CvCard`, les vues
personnelles) parlait une autre langue que la carte d'une lumière :
« Allumé · 45% » au lieu d'« Allumée depuis 18:05 · 45 % », un pourcentage
qui pouvait tomber à 0 %, la teinte brute du `rgb_color` au lieu de la règle
de la carte (un blanc par la table, plafonné à 4 000 K en thème clair), un
curseur qui n'apparaissait que sur le mot `brightness` et remontait à chaque
écho Zigbee ; et une pastille en or pour **toute** prise. La vue Nuit, elle,
avançait son réglage avant l'appel et ne revenait pas sur un refus.

## La décision

**Une seule définition, dans `lumieres.js`, et tout le monde la lit.**

- `lumieresDe(S, { meta, switchsLumiere, ids })` : un `light.*` sans
  catégorie, **ni caché ni désactivé** dans le registre (`entityMeta`),
  plus les switch déclarés lumière, les **groupes dédoublonnés**
  (`sansGroupesDoubles` : un groupe dont un membre est déjà là s'efface, on
  garde les membres ; un groupe dont aucun membre n'est dans le relevé reste,
  c'est la seule carte de ces lampes). Avant que l'index soit lu, tout
  `light.*` compte : rien ne manque pendant la première seconde. **Aucun
  motif de nom** : la LED d'une borne se reconnaît à sa catégorie seule.
- La lisent : `discoverLights` (donc Objets › Lumières et les tuiles),
  `dimmableLights`, la vue Nuit (les lampes proposées, switch compris, et les
  lampes d'une pièce à éclairage nocturne), l'aperçu des Paramètres, les
  compteurs de l'Accueil, du header et de l'écran de veille, l'en-tête d'une
  pièce (`RoomView`), le repli des Scènes. Un `light.*` que la découverte n'a
  pas retenu n'entre plus dans Objets par « le reste du registre ».
- `switchLights()` et `ctxLumieres()` vivent dans state.js, à côté du
  réglage : App.jsx et Paramètres en avaient chacun une copie.
- **Ce qu'on épargne** est aussi une seule règle : `veilleusesDe`,
  `estEpargnee(id, S, veilleuses)` (une veilleuse de la règle Nuit, ou un
  groupe qui en contient une, de proche en proche, sans boucler),
  `sansEpargnees`. L'en-tête, la tuile d'une pièce et les Scènes la lisent.

**Les veilleuses sont épargnées partout.**

- La tuile d'une pièce : `roomMainsOf` retire les veilleuses des lampes du
  bouton. Un appui ne les allume ni ne les éteint, et l'état de la tuile ne
  les lit pas : une veilleuse seule allumée fait une tuile **éteinte**, sans
  bouton. Le compte, lui, dit toujours toutes les lampes. Les switch déclarés
  signent la tuile (`lightsSig`).
- Le repli des Scènes sans script : « Éteindre » éteint les lumières de la
  maison, veilleuses épargnées — `light.turn_off` aux `light.*`,
  `homeassistant.turn_off` aux switch déclarés, jamais `toggle` ; la
  luminosité d'une ambiance ne va qu'aux lampes variables de la maison, hors
  veilleuses ; « Blanc chaud » **allume** en blanc chaud (2 700 K, borné par
  chaque lampe à son propre blanc, par `planAction`) les lampes qui savent le
  blanc, et n'envoie rien aux autres. La bibliothèque `HUE_SCENES` et
  `ScenesContent` ne bougent pas.
- Le module Nuit **absent** (`not_available`) : aucune veilleuse ne peut
  exister, `veilleusesLues` rend `[]`, et « Tout éteindre » paraît. Sur toute
  autre erreur, ou tant que la règle n'est pas lue, il reste caché : on ne
  sait pas quoi épargner. `useEtatServeur` expose désormais le `codeErr` de
  sa dernière lecture.
- La tuile d'une pièce et les Scènes attendent aussi (seconde tranche, ADR
  0262, B15 — sa décision : épargnées partout) : tant que la règle Nuit n'est
  pas lue, l'interrupteur de la tuile reste dessiné à sa place, grisé et
  inerte, et le repli des Scènes ne touche aucune lampe ; le module Nuit
  absent lève l'attente. Lue, le bouton reste à sa place — sauf dans une
  pièce qui n'a que sa veilleuse, où il n'y a plus rien à commander : il
  disparaît, et la tuile se dit éteinte (ADR 0262, corrigée le 19/10).

**La carte générique parle comme la carte d'une lumière.** `phraseLumiere`
et `luminosite` (plancher à 1 %, les pastilles aussi), `teinteDeCarte` sur le
sous-titre, un curseur pour toute lampe variable (`capacitesLumiere`), qui
tient 4 s le geste d'abord (`useOptimiste`) et laisse défiler la page
(`touch-action: pan-y`). L'or des pastilles n'est qu'aux vraies lumières
(`cvEstLumiere`). `unknown` est muet pour le gros interrupteur et la
recherche (`enPanne`), comme pour toutes les cartes. Les comptes de la
bannière et de l'en-tête d'une pièce passent par `trN`.

**La vue Nuit revient sur un refus** : le patron d'`ecrireRegle(…, { annuler })`
— l'écran avance, et redit la configuration d'avant si l'écriture ne prend
pas, refus ou coupure, sans attendre le sondage suivant.

**Le ménage** : les clés orphelines des six catalogues (« Bascule immédiate,
réconciliée au prochain état », « LUMINOSITÉ », « Blanc neutre », « Blanc
froid », « {n} % de luminosité »), les commentaires qui les citaient et ceux
des filtres retirés (« Ampoule », « plafonnier »), le `geste: 'niveau'` de
la vitrine (un geste qui n'existe pas), « Autres » de `LIGHT_ROOM` traduit,
la démo qui respecte « sauf les veilleuses », `lightKeys` qui ne s'abonne
plus à tous les `switch.`.

## Ce que ça change pour lui

Sur son installation : la LED de la borne ne compte nulle part, l'applique
déclarée lumière compte partout (en-tête de pièce compris) et redessine sa
tuile ; la tuile de la chambre ne touche plus la veilleuse de Lino et ne
s'allume pas pour elle seule ; « Blanc chaud » des Scènes n'éteint plus rien ;
un réglage de la nuit refusé revient tout de suite en le disant.

## Les tests

`tests/lumieres_maison.test.mjs` (la définition, les groupes, l'épargne),
`tests/entete_lumieres.test.mjs` (A5), `tests/scenes_repli.test.mjs`,
`tests/nuit_refus.test.mjs`, `tests/carte_generique_lumiere.test.mjs`,
`tests/tuile_veilleuse.test.mjs`, et des cas joués de plus dans
`tests/lumieres_objets.test.mjs` et `tests/demo_lumieres.test.mjs`. La carte
et la fiche d'une lumière (`useVueLumiere`, `FicheLumiere`, lumieresfiche.js)
ne bougent pas : une seconde tranche s'en occupe.
