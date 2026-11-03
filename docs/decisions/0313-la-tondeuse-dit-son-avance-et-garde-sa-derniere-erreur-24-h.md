# 0313 — La tondeuse dit son avance, et sa dernière erreur reste visible 24 h

*1er novembre 2026 — à l'essai (rien de publié) (lot 9 du rapport « Gladys comparé au catalogue », 31/10 : R2, R3)*

*Complète l'ADR [0042](0042-une-vue-par-robot-aspirateur-et-tondeuse.md) : ce que la carte et la popup d'un robot disent.*

## Le problème

- **R2.** Une tondeuse Mammotion publie l'avance de sa tonte : un capteur de progression (clé `progress`, en %) et un capteur de
  temps restant (clé `left_time`, en minutes). La carte et la popup de la tondeuse n'en disaient rien : « Tond · Pelouse arrière »,
  « Tonte en cours ». Le rapport demande « Tond · 45 % · 20 min restantes ».
- **R3.** La dernière erreur d'un robot ne se disait que pendant la phase d'erreur (`robots.js`, `phraseRobot`). Dès que la
  tondeuse rentrait à sa base, plus rien : on ne savait pas pourquoi elle s'était arrêtée.

Son registre (lecture seule, 01/11), sur l'appareil de la `lawn_mower` (plateforme `mammotion`) : `progress`, `left_time`,
`elapsed_time`, `total_time`, `error_1_message` (le texte), `error_1_time` (horodatage), `error_1_code` (le code), et le
binaire de pluie `rain_detected` (classe `moisture`). Le carnet des robots (`loggia_robots_etat`) garde déjà la dernière erreur
de la tondeuse : son texte, l'instant où le serveur l'a vue (`t`) et l'heure que l'appareil publie (`date`).

## La décision

**L'avance d'une tonte se lit à la clé** de deux capteurs de SON appareil, `progress` et `left_time`, jamais à leur nom
(`avanceTonte`, `robots.js`).

- **La carte** s'abonne à ces deux capteurs (`pickSibling` avec `cles`) ; au travail, sa phrase dit
  « Tond · 45 % · 20 min restantes », devant ses aires. Sans ces capteurs, rien ne change.
- **La popup** (`avanceeRobot`, `robotsfiche.js`) ajoute sous le mot d'état une barre fine (un `progressbar` lu par le lecteur
  d'écran) et la même phrase, au travail comme en pause. Sans pourcentage, pas de barre.
- Le temps restant suit l'unité que l'on a choisie dans Home Assistant (minutes, heures ou secondes). Une valeur qui ne se lit
  pas, un pourcentage hors de 0 à 100 ou zéro minute restante ne se disent pas.

**La dernière erreur reste dans la popup 24 heures, avec son heure** (`lignesEtat`, `robotsfiche.js`) :
« Dernière erreur à 14:12 : Lame bloquée », « Dernière erreur hier à 22:40 : … ».

- La mémoire est celle du **serveur** : le carnet des robots (`robots_carnet.py`, `voir_erreur`) la gardait déjà. Rien ne
  change au serveur, et rien n'est gardé à l'écran.
- L'heure est celle que l'appareil publie (`date`), sinon l'instant où le serveur l'a vue (`t`). Une erreur relue au démarrage
  de Home Assistant mais datée par l'appareil d'il y a trois jours ne se dit donc pas. Une heure de plus de cinq minutes dans le
  futur (une horloge fausse) non plus.
- En erreur, le mot d'état la dit déjà : la ligne ne se répète pas. Un robot muet n'affiche aucune ligne.
- Le code d'erreur (`error_1_code`) ne se dit pas : seul le texte compte, comme avant.

**En option, « Pluie en cours »** dans la popup d'une tondeuse dont l'appareil porte un binaire `moisture` allumé (la règle de
`pluieDeRobot`, ADR 0305). L'interrupteur de détection de pluie reste un réglage : il n'est pas la pluie.

**Aucune commande nouvelle.** La carte et la popup ne font que lire.

**La place au démarrage.** La logique de la popup vit dans `robotsfiche.js`, chargé avec elle. Pour la carte, il ne restait
que 300 octets : `resumeJours`, que seules les fiches lisent, passe de `robots.js` à `robotsfiche.js`. Le démarrage passe de
1 062 797 à 1 062 837 octets (+40).

Écarté :

- Un rôle posé par le serveur depuis l'`unique_id` : la clé de traduction est déjà dans l'index de l'écran, et c'est elle que
  la découverte lit pour les aires et la surface.
- Une ligne dans le rail ou un point d'attention pour l'erreur gardée : elle n'appelle aucun geste. Elle reste dans la popup.

## Les conséquences

- Pas de redémarrage de Home Assistant : rien ne change au serveur.
- La démo porte une tonte en cours (« Tond · 45 % · 20 min restantes ») et une erreur de l'aspirateur, il y a deux heures.
- 2 clés neuves × 6 langues. « Pluie en cours » et « {t} restantes » existaient déjà.
- Tests : `tests/tondeuse_au_travail.test.mjs` (13 tests) et un test monté dans `tests/fiche_robot.test.mjs` ; 23 mutants tués.
- Une intégration qui publie l'avance sous d'autres clés n'est pas lue. Le temps écoulé (`elapsed_time`) et le temps total
  (`total_time`) ne le sont pas non plus.
- Une erreur sans heure publiée par l'appareil, et relue au démarrage de Home Assistant avec un texte neuf, prend l'heure du
  démarrage.
- La compacte, « En ce moment » et l'en-tête d'Objets ne disent pas l'avance : seules la carte et la popup la disent.
- Vérifié dans les tests seulement : rien n'a été vu en démo ni chez lui.
