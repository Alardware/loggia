# 0330 — « Annuler » cinq secondes après un geste groupé

*6 novembre 2026 — appliqué (v3.98.0) (étape 7 du rapport sur l'usage)*

## Le problème

« Tout éteindre » ou un scénario lancé par erreur : il fallait tout remettre
à la main, lampe par lampe.

## La décision

`annuler.js` photographie, avant le geste, les lumières, interrupteurs,
ventilateurs, volets et thermostats qu'il touche, puis prépare le retour de ce
qui a changé : une lampe retrouve son niveau et son blanc ou sa couleur, un
volet sa position (ou s'ouvre et se ferme quand il ne la donne pas), un
thermostat son mode, son préréglage ou sa consigne. Jamais l'alarme, les
serrures ni les médias.

`chrome/bandeauannuler.jsx` affiche « … · Annuler » cinq secondes en bas de
l'écran ; un nouveau geste le remplace. Branché sur les scénarios, les lumières
et volets d'une pièce, l'aération, « Tout éteindre », « Tout ouvrir / fermer »,
les ambiances Hue, les volets des gestes du moment, le mode de la maison
(renvoyé au serveur), une scène ou un script. À l'annulation, les cartes
oublient leur état optimiste (`OUBLIER_OPTIMISTES`).

## Les conséquences

Écran seulement. Test `annuler`.
