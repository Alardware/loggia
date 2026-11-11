# 0339 — Les liens du projet, deux boutons sous le titre d'À propos

*8 novembre 2026 — à l'essai (bêta v3.100.0-beta.1) (demande sur capture)*

## Le problème

« Le code » et « Signaler un problème » n'étaient que deux rangées finies par
un petit carré gris de 34 px, sous Installation et les sauvegardes, hors du
premier écran. GitHub n'était écrit nulle part en toutes lettres : « ça saute
pas aux yeux ».

## La décision

Un panneau « Le projet » juste sous le titre, aux deux formats, avec deux
boutons de 48 px qui portent leur mot : « Signaler un problème » en bleu plein,
« Voir le code sur GitHub » avec le logo. Vus en aperçu sur la démo, ces deux
boutons ont été préférés à deux grandes tuiles. Côte à côte tant qu'il y a la
place, l'un sous l'autre au téléphone. Diagnostics reste dans le panneau, sous
un filet, pour les administrateurs.

« Signaler » ouvre directement le formulaire de ticket
(`issues/new?template=probleme.yml`). Le logo est dessiné dans le code, comme
la tasse de Ko-fi : rien ne part vers GitHub avant le geste.

## Les conséquences

Écran seulement. La recherche des réglages trouve aussi « Voir le code sur
GitHub ». Test `parametres_maquettes`.
