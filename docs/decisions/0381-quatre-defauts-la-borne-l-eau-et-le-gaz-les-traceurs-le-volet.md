# 0381 — Quatre défauts : la borne en panne, l'eau et le gaz du jour, les traceurs, le volet supposé

*21 novembre 2026 — appliqué (v3.100.0) (chantier du 20/11, lot 1 : F1 à F4)*

## Le problème

Le 20/11, une revue de Loggia a cherché ce qui manquait pour des maisons
équipées autrement que la sienne. En relisant le code, quatre cas
affichaient quelque chose d'inexact.
L'utilisateur les a validés le 21/11 (« Je valide : F1, F2, F3, F4, … »).

- **F1, la borne en panne.** Une borne qui publie un statut d'erreur
  (`error`, `faulted`, `Faulted` chez OCPP) se disait « Branchée » ou
  « Débranchée » selon la prise : le calcul connaissait la charge, la pause,
  branchée, débranchée et muette, pas la panne. On croyait la voiture en
  attente ; elle ne chargeait pas de la nuit. Reproduit dans la démo.
- **F2, l'eau et le gaz du jour.** La tuile « Eau » et la tuile « Gaz »
  d'Énergie lisaient l'état du compteur. Le tableau Énergie de Home Assistant
  désigne un INDEX (Gazpar, Suez, Veolia comptent depuis la pose) : « Eau
  1 235 m³ » pour la journée. L'électricité lit sa journée dans les
  statistiques depuis le 07/10 ; l'eau et le gaz n'étaient pas dans la liste.
  L'eau, arrondie à l'unité, écrivait en plus 0,35 m³ « 0 ». C'était le
  point X7 de la comparaison Gladys, resté en réserve.
- **F3, les traceurs d'objets.** Seules les deux plateformes d'Invoxia
  étaient reconnues (ADR 0318) : chez un utilisateur de Tile ou de Tractive,
  la carte et la popup du traceur n'apparaissaient pas.
- **F4, le volet supposé.** Un moteur radio sans retour (Somfy RTS), ou une
  course calculée au temps, fait SUPPOSER sa position par Home Assistant
  (`assumed_state`). S'il publiait une position, Loggia la croyait mesurée :
  baissé à la télécommande, le volet restait « en haut » et Monter était
  inerte.

## La décision

**F1.** Le statut de la borne se lit en minuscules (`statutBorne`, borne.js).
`error`, `faulted` et `fault` font l'état `defaut`, avant la charge : la
carte et la popup disent « En défaut » dans la couleur d'alerte du thème
(`--o-bad`), la plaque aussi. L'Accueil et l'écran de veille posent un point
« Borne en défaut », au nom de l'appareil, niveau « alerte » (règle 11 de
`pointsAttention`) : rare et actionnable. L'écran lui passe le capteur de
statut de la borne en panne (`statutEnPanne`) ; `attention.js` garde i18n
pour seul import. La pause et la reprise
restent offertes. Lire le statut sans la casse fait aussi compter
« Charging » d'OCPP comme une charge. Le texte exact du constructeur n'est
pas repris : son statut est un mot de machine.

**F2.** Le gaz et l'eau entrent en tête de `CPT_JOUR`, les compteurs du
jour : leur journée se lit comme
celle de l'électricité (un compteur remis à zéro cette nuit se lit tel quel,
un index dans les statistiques). `energievolumes.js`, chargé avec la vue,
décide de l'écriture : l'eau en litres sous 1 m³, en m³ à deux décimales
au-dessus, en litres entiers si le compteur compte en litres ; le gaz en kWh
s'il est une énergie (Wh, MJ…), dans son unité s'il est un volume. Sans
chiffre du jour, un tiret, jamais l'index.

**F3.** `tile`, `tractive` et `traccar_server` rejoignent la liste. Les noms
sont les domaines lus dans les manifestes publics de Home Assistant, pas
devinés. Restent dehors `traccar` (Traccar Client, une application de
téléphone) et `bermuda` (il suit aussi les téléphones, à la pièce près) :
un téléphone n'est pas un traceur d'objet.

**F4.** Une position publiée avec `assumed_state: true` n'est plus « sûre »
(`positionSure`, voletecran.js) : Monter et Descendre restent offerts aux
deux bouts. La position affichée ne change pas : c'est celle que Home
Assistant publie (une course au temps que l'utilisateur a réglée). Sans
position publiée, rien n'était inventé et rien ne change : « Ouvert »,
jamais un pourcentage.

## Les conséquences

Écran seul : aucun fichier Python, pas de redémarrage de Home Assistant.
Deux textes nouveaux dans les six catalogues : « En défaut », « Borne en
défaut » (pl.js : deux ajouts, rien de réécrit).

Les tests : `tests/chantier_2011_lot1.test.mjs` (12 tests).

Pas fait : la démo n'a ni compteur d'eau ni compteur de gaz, F2 n'y est pas
visible ; il n'a été vérifié que par les tests. Chez l'utilisateur, F2, F3
et F4 ne se présentent pas aujourd'hui (pas de compteur d'eau ni de gaz,
des traceurs Invoxia, des volets Netatmo qui publient leur position) : rien
ne change à son écran pour eux.
