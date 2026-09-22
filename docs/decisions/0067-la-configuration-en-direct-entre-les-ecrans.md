# 0067 — La configuration en direct entre les écrans

Date : 22/09/2026 (v3.66.0). Statut : acceptée. Origine : l'audit du 22/09
(plan d'évolution, point A3), sur « go » de l'auteur.

## Contexte

La configuration vit sur le serveur, par compte, avec une partie commune à
la maison (ADR 0045, 0052). Mais un écran ne l'apprenait qu'au chargement :
une pièce renommée sur le téléphone n'arrivait sur l'ordinateur qu'au
rechargement de la page. Le HANDOFF le notait comme limite de la v3.59.0
(« recharger Loggia ailleurs »), et le README promettait déjà « ses pièces,
son thème et ses vues, sur tous ses appareils ».

Un abonnement aux événements du bus n'était pas la bonne voie : Home
Assistant réserve `subscribe_events` aux administrateurs pour les événements
qui ne sont pas les siens, une tablette de famille n'y aurait rien reçu, et
un événement de bus finit dans l'enregistreur.

## Décision

- **Le magasin signale ce qui change** (`store.py`, `_signaler`) : après
  chaque écriture, le compte et les clés qui ont VRAIMENT changé, séparées en
  personnelles et communes — jamais les valeurs. Par le répartiteur interne
  de Home Assistant (`async_dispatcher_send`), pas par le bus.
- **Un flux ouvert à tout compte** (`loggia/config/suivre`) : l'écran
  s'abonne une fois ; il reçoit les signaux tant qu'il vit. Il n'y transite
  que des noms de clés.
- **Chaque écran décide, puis relit sous ses droits** (`doitRelire`,
  `src/config.js`) : une clé commune concerne tout le monde ; une clé
  personnelle, le seul compte qui l'a écrite, sur un autre de ses écrans. La
  relecture passe par `loggia/config/get`, donc par les droits de ce compte.
- **Groupée, et jamais pendant l'édition** : les relectures sont regroupées
  (300 ms, un rangement écrit plusieurs fois de suite) ; en mode édition,
  elles attendent la sortie du mode — on ne bouscule pas un rangement en
  cours, et la disposition par format (ADR 0052) reste celle de l'écran.
- **Sans le flux, rien ne change** : un composant pas encore redémarré
  refuse l'abonnement, l'écran continue comme avant.

## Conséquences

- **Redémarrer Home Assistant** après la mise à jour : la commande
  s'enregistre au démarrage.
- L'écran qui écrit reçoit aussi son propre signal et relit : une relecture
  de plus, sans effet visible.
- La démo tient l'abonnement, muet : un seul écran, rien n'y change
  d'ailleurs.

Tests : tests/python/test_store.py (signal), tests/config_direct.test.mjs (3).
