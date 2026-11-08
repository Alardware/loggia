# 0332 — Un appareil qui ne répond plus dit pourquoi, et où regarder

*6 novembre 2026 — appliqué (v3.98.0) (étape 9 du rapport sur l'usage)*

## Le problème

Une carte disait « Indisponible », sans plus : ni la cause probable, ni où
aller voir.

## La décision

`pannes.js`, une règle pure, donne la piste selon le réseau de l'appareil :
maille Zigbee, Z-Wave ou Thread (l'alimentation, un appareil sur secteur pas
trop loin), Wi-Fi, Bluetooth, service en ligne du fabricant, sinon
l'intégration nommée ; une intégration entière qui se tait se dit telle.
`aidepanne.jsx` place « … ne répond plus » sous l'en-tête de la fiche et, pour
un administrateur, « Ouvrir dans Home Assistant » (la page de l'appareil, sinon
celle de l'intégration). La fiche d'une prise garde ses mots et gagne le lien.

« À surveiller » nomme l'intégration : « Zigbee2MQTT ne répond plus ·
5 appareils » plutôt que « Intégration muette · mqtt · 12 entités ». Son
choix : seulement l'intégration entière, jamais les pannes isolées.

## Les conséquences

Écran seulement. Test `pannes`.
