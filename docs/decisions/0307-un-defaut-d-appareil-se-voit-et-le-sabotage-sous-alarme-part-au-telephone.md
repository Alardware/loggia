# 0307 — Un défaut d'appareil se voit à l'Accueil et dans sa popup, et le sabotage sous alarme part au téléphone

*1er novembre 2026 — appliqué (v3.97.0) (lot 3 du rapport « Gladys comparé au catalogue », 31/10 : D13, P1, fin du S4 du 30/10)*

*Complète l'ADR [0305](0305-la-surete-lit-l-appareil-qui-porte-le-binaire.md) : `voisins.py` lit aussi le bouton qui réarme un appareil.*

## Le problème

- Un binaire de classe `problem` ne remontait nulle part : son seul effet
  était un « Détecté » rouge dans la fiche d'entités. Chez lui,
  l'alarme du poêle à granulés (MCZ Maestro, `binary_sensor.poele_alarm`) et
  le disque de la console UniFi. Un poêle en défaut ne se voyait que si l'on
  ouvrait sa fiche.
- Le poêle a un bouton de réarmement (`button.poele_alarm_reset`). Il fallait
  le trouver parmi les entités de l'appareil.
- Le sabotage (`tamper`) se voyait à l'écran, mais ne partait pas au
  téléphone, même alarme armée.

## La décision

- **À surveiller** (`pointsAttention`) : un `problem` allumé, porté par un
  appareil (il a un appareil au registre), fait un point ambre « Défaut
  signalé », au nom de l'appareil, qui ouvre Objets. Ni un modèle ni un
  groupe, qui calculent (« la plante a soif », `plantes_alerte`), ni le
  besoin d'eau d'une plante. Il reste rare : un appareil qui le dit
  lui-même, et seulement tant qu'il le dit.
- **La popup du chauffage** dit « L'appareil signale un défaut. » tant
  qu'un `problem` de son appareil est allumé (`entitesAppareilDe`, state.js).
  Elle propose « Réarmer » quand l'appareil a SON bouton de réarmement, un
  seul, joignable. Le composant le reconnaît à sa clé stable
  (`voisins.est_rearmement` : `reset_allarm`, `alarm_reset`, `reset_error`…
  dans l'`unique_id` ou la `translation_key`, jamais le nom). Il ne pose dans
  l'index que le drapeau `rearmer` ; l'identifiant reste au serveur. Rien ne
  réarme seul : `button.press`, sur le geste.
- **Le sabotage sous alarme armée** part au téléphone : « Sabotage pendant
  que l'alarme est armée : {nom} » (sept langues). Il va dans la catégorie de
  l'ouverture sous alarme (« portes ») et reçoit le même traitement : il
  attend les heures calmes, et il ne compte pas quand il apparaît déjà
  allumé. Alarme désarmée, rien : c'est quelqu'un qui change une pile.
  Paramètres › Alertes le dit sous la case (« Portes, fenêtres et garage ·
  Sabotage »), avec des textes déjà traduits.

Écarté :

- un `problem` au téléphone : le point d'attention suffit, il est rare et
  actionnable ; un défaut d'appareil n'est pas un danger ;
- réarmer tout seul, ou à l'Accueil : le réarmement relance un appareil qui
  brûle du granulé ; il se décide devant sa popup ;
- un bouton « reset » quelconque (filtre, compteur) : la règle est étroite
  exprès.

## Les conséquences

- Redémarrage de Home Assistant (composant : `alertes.py`, `discovery.py`,
  `voisins.py`), et le paquet de l'écran à reconstruire.
- Chez lui, à l'Accueil : un point « Défaut signalé · Poêle » à la prochaine
  alarme du poêle, et un pour le disque de la console tant qu'il est en
  défaut. Le pont Zigbee2MQTT, quand il demande un redémarrage, en fait
  un aussi.
- Tests : `tests/python/test_defauts_appareil.py` et
  `tests/defauts_appareil.test.mjs`.
