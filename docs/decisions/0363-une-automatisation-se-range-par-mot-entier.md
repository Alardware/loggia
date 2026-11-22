# 0363 — Une automatisation se range par mot entier

*13 novembre 2026 — appliqué (v3.100.0)*

## Le problème

Paramètres › Automatisations range chaque automatisation dans une famille
(Lumières, Volets, Sécurité…) d'après son nom. La famille se cherchait comme
un morceau de mot, n'importe où : « Spotify le matin » partait dans les
Lumières à cause de « spot », « Importe les relevés » dans les Ouvrants à
cause de « porte », « Restore les scènes » dans les Volets à cause de
« store ». À l'inverse, « Heures creuses » ratait l'Énergie.

## La décision

Chaque famille se cherche comme un **mot entier**, son pluriel en -s ou -x
compris, après retrait des accents et des majuscules.

Les formes dérivées que l'ancienne recherche attrapait à raison s'écrivent en
clair : « verrouiller », « verrouillage », « déverrouillage », « climatiseur »,
« climat », « thermostatique », « réveiller », « matinée », « alerter »,
« rappeler », « notifier », « rentrent », « consomme ». L'ancien et le nouveau
rangement ont été comparés sur une centaine de noms plausibles : il ne reste
que les écarts voulus.

## Les limites connues

Un nom qui emploie une forme dérivée absente de la liste (« éclairer »,
« arroser ») tombe dans la famille tirée de son premier mot, comme avant :
l'ancienne recherche ne les attrapait pas non plus.

Pas de redémarrage de Home Assistant. Tests :
`tests/audit_1211_lot2b_fiches.test.mjs` (B26), `tests/autos.test.mjs`
(inchangé, toujours vert).
