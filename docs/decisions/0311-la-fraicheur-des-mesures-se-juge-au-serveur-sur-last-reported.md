# 0311 — La fraîcheur des mesures se juge au serveur, sur `last_reported`, et la carte dit « Dernier relevé il y a 7 h »

*1er novembre 2026 — appliqué (v3.97.0) (lot 7 du rapport « Gladys comparé au catalogue », 31/10 : A4 bis, F1)*

*Complète l'ADR [0303](0303-l-air-et-les-uv-dans-la-meteo.md), § A4 : ce qui n'y était pas fait.*

## Le problème

- **A4.** Une mesure figée depuis des heures s'affichait comme fraîche. Seul `unavailable` se voyait.
- Chez lui, ce manque compte : son Zigbee2MQTT ne suit pas la disponibilité des appareils (aucun bloc `availability`). Un
  capteur Zigbee dont la pile est morte garde sa dernière valeur, et ne devient jamais indisponible.
- L'écran ne peut pas en juger (ADR 0303). Il reçoit les états par `subscribe_entities`, qui porte `last_changed` et
  `last_updated`, jamais `last_reported`. Une valeur stable, 19,5 °C toute la nuit, passerait pour figée.

## La décision

**Le serveur juge** (`custom_components/loggia/fraicheur.py`). Il lit l'état de Home Assistant tel quel, et `last_reported`
y avance à chaque relevé, même identique au précédent.

- **Une mesure physique** : un `sensor` dont la classe dit une grandeur de l'air ou de la maison. Ce sont la température,
  l'humidité, le CO₂, le CO, la pression, l'humidité du sol, les particules, les COV, le NO₂ et l'ozone. Elle est portée par un
  appareil qui n'est pas un service : ni une météo en ligne, ni un moniteur système. Un calcul n'en est pas une (modèle, groupe,
  statistiques, dérivée, filtre, intégrale, compteur…), ni un téléphone (`mobile_app`). Un capteur désactivé, ou sans appareil,
  ne se juge pas.
- **Le dernier relevé est celui de l'appareil**, dans son intégration : le `last_reported` le plus récent de ses entités qui
  parlent. L'intégration MQTT n'écrit l'état d'une entité que si sa valeur change. Sur un capteur vivant, une température stable
  ne bouge donc pas, mais la qualité du lien ou la pile, si. Un appareil qui parle n'est pas figé. Une entité d'une autre
  intégration rattachée au même appareil (une dérivée) ne compte pas.
- **Les seuils** : plus de 6 h sans relevé, la mesure est figée. Pour une plante, plus de 24 h : un capteur de plante parle peu.
  Une plante se reconnaît comme ailleurs, à la base d'une plante de `loggia_plants` (`eau_calcul.est_plante`).
  Pour une plante, la lumière et l'engrais (`conductivity`) se jugent aussi.
- **On ne juge pas** sans `last_reported` (un Home Assistant d'avant 2024.3). On ne juge pas non plus une mesure muette : elle
  se dit déjà. Un registre illisible ne donne aucun verdict.
- **Écartés à dessein** : la lumière, le vent et le bruit, hors des plantes. Ils restent à 0 toute une nuit, et une intégration
  qui ne pousse que les changements (le pont Hue) n'en dit rien.

**Le canal** : l'état des veilles (`loggia/veilles/etat`) porte `figees`, `{entité: instant du dernier relevé, en secondes}`.
Il est calculé à chaque lecture : rien n'est gardé sur le disque, rien ne part au téléphone, rien ne se commande. Il n'y a
**aucun point d'attention** par capteur, ce serait du bruit.

**L'écran ne juge plus**, il lit le verdict (`src/fraicheur.js`). La racine le relit avec le seuil des piles, toutes les 30 s
(`useSeuilPile`). Elle le retient, et les cartes qui l'écoutent se redessinent quand il change, et seulement alors.

- **La carte d'une mesure** garde son chiffre. Elle perd sa zone, sa barre et sa teinte : une valeur d'il y a 7 h ne se juge
  pas. Sa phrase devient « Dernier relevé il y a 7 h », puis « … il y a 3 j » au-delà de 48 h. Une mesure muette reste
  « Indisponible ».
- **Sa fiche** dit la même phrase. Sa ligne « Dernier signal » prend le relevé du serveur, plus juste que le `last_updated`
  que l'écran reçoit.
- **La carte d'une plante** au sol figé dit son dernier relevé. Rien n'y presse plus : pas d'« À arroser » sur une valeur
  d'hier, et pas d'« à regarder » de plus.

**Zigbee2MQTT** : Loggia ne touche pas à sa configuration. Activer la disponibilité par appareil reste son choix ; ce verdict
ne le remplace pas, il le complète.

## Les conséquences

- **Redémarrage de Home Assistant nécessaire** : le verdict vient du composant.
- Après un redémarrage, chaque capteur repart d'un relevé neuf : le décompte des 6 h recommence.
- Un appareil dont une seule entité parle encore (sa pile, son lien) n'est pas figé, même si sa mesure s'est arrêtée. C'est
  le prix de l'absence de faux positifs avec MQTT.
- La démo porte un capteur figé : la température de l'entrée, relevée pour la dernière fois il y a 7 h.
- Deux mots nouveaux dans les sept langues. Rien au téléphone.
- Les tests : `tests/python/test_fraicheur.py` (11) et `tests/fraicheur_serveur.test.mjs` (9).
- Pas fait : une ligne d'information dans le rail (« 2 capteurs ne relèvent plus rien »). La carte et la fiche le disent déjà.
