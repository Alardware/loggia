# 0127 — Des défauts de chauffage qui parlent Fahrenheit

Date : 02/10/2026. Statut : appliqué. **Redémarrage de Home Assistant requis**
(mise à jour d'un composant personnalisé) ; le paquet est rebâti.

Suite de l'audit d'internationalisation du 02/10 (unités, devise, formats) :
tout le frontend convertit désormais vers l'unité réelle de l'installation,
sauf deux valeurs par défaut qui vivent côté backend et n'avaient jamais été
regardées.

`presence.py` propose 17 pour la consigne d'absence et 20 pour le confort au
retour ; `volets.py` propose 25 comme seuil de température extérieure pour la
protection solaire. Les trois sont pensées en Celsius. Sur une installation
jamais configurée et réglée en Fahrenheit, ce sont des ordres absurdes : une
consigne de 17 °F revient à demander un chauffage à pleine puissance dans une
maison déjà tiède, et un seuil de 25 °F fait croire en permanence qu'il gèle
dehors, ce qui remonte systématiquement les volets que la protection solaire
venait de baisser.

**Décidé :** `custom_components/loggia/unites.py`, miroir réduit de
`src/unites.js` côté backend. `unite_temperature(hass)` lit
`hass.config.units.temperature_unit` (l'API du cœur de Home Assistant, pas
celle que le frontend reçoit par websocket) ; `depuis_celsius(valeur, unite)`
convertit. Les deux `async_config()` concernés convertissent ces trois valeurs
AVANT de fusionner ce que l'utilisateur a enregistré : une valeur déjà écrite
une fois vient du magasin dans l'unité réelle (le frontend l'a déjà fait) et
n'est donc plus jamais reconvertie.

Ce que ça ne change PAS : les tables de seuils du composant restent toutes en
Celsius, comme avant cette série de correctifs. Seule la proposition initiale,
jamais encore configurée, s'adapte.

Une doublure de test sans `hass.config` (il en existe dans la suite) retombe
sur le Celsius plutôt que d'échouer : la compatibilité Fahrenheit est un
service rendu, pas une exigence posée sur chaque test existant.
