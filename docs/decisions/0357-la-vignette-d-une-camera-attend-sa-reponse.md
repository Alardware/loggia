# 0357 — La vignette d'une caméra attend sa réponse

*13 novembre 2026 — appliqué (v3.100.0)*

## Le problème

En mode image par image, la vignette d'une caméra se relit toutes les deux
secondes. Depuis l'audit de consolidation du 28/10 (son point B7), chaque
nouveau tour **abandonnait** la requête d'avant, pour qu'elles ne s'empilent
plus sur un appareil lent.

Sur une caméra qui met plus de deux secondes à répondre, chaque requête était
donc abandonnée avant d'aboutir : aucune image n'arrivait jamais, et la tuile
restait sur son fond.

## La décision

Une requête à la fois, et on l'**attend** : le tour qui tombe pendant une
requête passe son tour, comme le fait déjà la carte d'un robot (`vacplan.jsx`).

- Rien ne s'empile : il n'y a jamais plus d'une requête en cours.
- L'image qui arrive est toujours la dernière demandée ; elle ne peut plus
  reculer dans le temps.
- Une requête qui ne revient pas au bout de vingt secondes est abandonnée, pour
  que la suivante parte.
- Au démontage, la requête en cours est abandonnée, comme avant.

## Les conséquences

Une caméra lente montre une image dès qu'elle répond, puis la suivante à son
rythme : moins souvent que toutes les deux secondes, mais elle en montre. Une
caméra rapide se comporte comme avant.

Pas de redémarrage de Home Assistant. Tests :
`tests/requetes_qui_s_empilent.test.mjs` (assertions modifiées).
