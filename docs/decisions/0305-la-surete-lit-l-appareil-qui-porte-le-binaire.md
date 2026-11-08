# 0305 — La sûreté lit l'appareil qui porte le binaire : la pluie d'un robot n'est pas une fuite, ce qu'une caméra entend ne fait pas réagir la maison

*31 octobre 2026 — appliqué (v3.97.0) (lot 1 du rapport « Gladys comparé au catalogue », 31/10 : D10, D11)*

*Complète l'ADR [0022](0022-sur-un-danger-la-maison-reagit.md), § 16/10 (un `moisture` calculé n'est pas une fuite).*

## Le problème

La classe d'un binaire dit ce qu'il mesure, pas qui le mesure. Deux capteurs de
son installation, vérifiés dans son registre le 31/10 :

- `binary_sensor.tondeuse_pluie_detectee` (Mammotion, classe
  `moisture`). C'est le capteur de pluie de la tondeuse. Pour `alertes.py`,
  c'était une **fuite** : « Fuite d'eau détectée » à chaque averse, un point de
  sûreté à l'Accueil, et la vanne coupée si une vanne était choisie ;
- `binary_sensor.camera_entree_alarme_de_co_detectee` (UniFi
  Protect, classe `carbon_monoxide`). La caméra **entend** le son d'un
  détecteur de monoxyde. Le réglage de la maison a `actions.actif` et
  `lumieres` cochés : le son d'un détecteur chez un voisin, ou à la
  télévision, allumait toutes les lampes à 100 % et remontait les volets.
  C'est contraire à sa règle des lumières.

## La décision

Le registre des entités dit, sans rien configurer, quel **appareil** porte un
binaire, et ce que cet appareil porte d'autre. Jamais un nom (ADR 0164).

- `voisins.py` (neuf) : `domaines_voisins(hass, haid)`, les domaines des
  entités du même appareil (l'index `get_entries_for_device_id` de Home
  Assistant, sinon le registre entier) ; `pluie_de_robot` (une `lawn_mower` ou
  un `vacuum` sur l'appareil) ; `entendue` (une `smoke` ou une
  `carbon_monoxide` sur l'appareil d'une `camera`). Le gaz ne s'entend pas : un
  `gas` sur une caméra reste un détecteur.
- **La pluie d'un robot n'est pas une fuite**, partout où une fuite se juge :
  `alertes._danger_reel` (ni téléphone, ni vanne, ni détecteur muet),
  `eau_calcul.est_detecteur` (le carnet de l'eau), et à l'écran
  `pluieDeRobot` (attention.js) dans « À surveiller », « En ce moment »,
  Paramètres › Alertes et la carte de la vanne. La règle de la pluie passe
  avant celle de la caméra : sa tondeuse porte aussi une caméra.
- **Ce qu'une caméra entend part au téléphone, jamais dans la maison.** Le
  texte dit ce qu'on sait : « Alarme entendue par une caméra : {nom} » (sept
  langues). Il part comme un danger, en critique : un détecteur autonome sonne
  peut-être dans l'entrée. `_reagir` ne fait rien pour un binaire entendu,
  quel que soit le chemin (le dernier filet). Une caméra qui se tait n'est pas
  un « Détecteur muet » : elle est déjà « Caméra hors ligne ». À l'écran, un
  point ambre « Alarme entendue par une caméra », icône caméra, qui ouvre la
  vue Sécurité ; jamais le mot rouge d'un détecteur.
- Un registre illisible, ou une entité qu'il ne connaît pas : aucune voisine.
  Les deux capteurs redeviennent alors ce qu'ils étaient : on ne perd aucun
  vrai détecteur.

Écarté :

- reconnaître la fumée entendue (`smoke_alarm_detected` d'UniFi Protect, sans
  classe chez lui). Il faudrait la clé d'une intégration, et elle donnerait
  une notification critique qu'il ne reçoit pas aujourd'hui. Le reste de C3
  (bris de verre, sirène) attend aussi ;
- retirer le binaire entendu de Paramètres › Alertes : il y reste compté sous
  « Monoxyde », puisqu'il prévient toujours le téléphone dans cette catégorie.

## Les conséquences

- Redémarrage de Home Assistant (composant), et le paquet de l'écran à
  reconstruire (`src/`, sept catalogues, `textes_catalogue.py` régénéré).
- Chez lui, les alertes au téléphone sont désactivées (`loggia_alertes.actif`
  à `false`) : il verra le point ambre à l'Accueil, et la maison ne réagira
  plus au son.
- Tests : `tests/python/test_voisins_surete.py` (chaque cas, avec et sans
  l'index du registre, et le registre illisible) et
  `tests/voisins_surete.test.mjs` (l'écran, et les listes identiques au
  serveur).
- Le lot 2 (les capteurs d'une caméra ne sont plus des indices de présence)
  reprendra `voisins.py`.
