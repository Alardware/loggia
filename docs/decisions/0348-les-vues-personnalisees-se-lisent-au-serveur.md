# 0348 — Les vues personnalisées se lisent au serveur

*12 novembre 2026 — appliqué (v3.100.0)*

## Le problème

La liste des vues personnalisées n'était lue qu'une fois, au démarrage, dans le
stockage de l'appareil. Sur une instance réelle, le serveur tenait une vue que
le navigateur de l'ordinateur n'affichait pas : elle avait été créée ailleurs.
Pire, un écran resté sur une vieille copie aurait effacé les vues des autres à
son premier enregistrement.

## La décision

Dès que le composant répond, la liste est celle du serveur
(`serverCfg.loggia_customviews`, filtrée par `vuesPersoValides`), et elle le
reste : une vue créée sur un autre écran arrive par le suivi de configuration
(ADR 0067), une écriture refusée revient en arrière avec lui.

Le filet de l'écran d'erreur, « Repartir sans les vues custom », tient pour
tout le chargement : la liste du serveur ne revient pas par ce chemin.

Sans composant, rien ne change : le stockage de l'appareil reste la seule
source.

## Les conséquences

Pas de redémarrage de Home Assistant. Un appareil qui gardait des vues jamais
envoyées au serveur les perd à l'écran s'il n'est pas administrateur ; un
administrateur les confie d'abord au serveur, comme ses autres réglages.
Test : `tests/installation_reelle.test.mjs`.
