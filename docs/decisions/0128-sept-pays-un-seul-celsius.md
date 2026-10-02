# 0128 — Sept pays, un seul Celsius

Date : 02/10/2026. Statut : appliqué. **Redémarrage de Home Assistant requis**
(mise à jour d'un composant personnalisé) ; le paquet est rebâti.

« C'est un dashboard utilisé dans plus de sept pays différents. » Un audit
ciblé sur °C en dur (suite de l'ADR 0127) en a trouvé bien plus large : partout
où Loggia affiche une température, une vitesse de vent, une pluie ou une
distance, le code supposait l'unité Celsius/km·h/mm/km, sans jamais regarder
`hass.config.unit_system` ni l'attribut réel du capteur. Sur une installation
Fahrenheit, les seuils de confort, l'alerte CPU, la jauge d'une plante et les
tuiles de pièce comparaient un nombre Fahrenheit à une table pensée en
Celsius : une maison à 21 °C (70 °F) se serait vue conseiller de mettre de la
crème solaire, et un CPU à 75 °C (167 °F, un seuil d'alerte réel) déclenchait
une alerte en permanence dès 2 °C.

**Décidé :** `src/unites.js`, miroir du nouveau module backend (ADR 0127). Un
principe simple, tenu partout : les SEUILS restent en Celsius/km·h en
interne — toutes les tables existantes (confort, alertes, protection solaire)
sont intactes — et la conversion n'a lieu qu'à l'AFFICHAGE, vers l'unité réelle
de l'entité ou, à défaut, celle de l'installation.

Fichiers touchés : `App.jsx` (jauges de pièce, fiche plante, cartes climat et
fil pilote, distance de localisation, modale météo extérieure), `confort.js`
(l'indice de confort, une seule table pour tout le dashboard), `systeme.js` et
`views/systeme.jsx` (seuil d'alerte CPU), `views/presence.jsx` et
`views/volets.jsx` (labels et bornes des réglages de température, la valeur
enregistrée elle-même n'est jamais convertie : elle part telle quelle vers
`climate.set_temperature` ou vers la comparaison au capteur choisi — vérifié en
lisant `presence.py` et `volets.py`), `cartemeteo.jsx` et `meteo.js` (pluie),
`ficherobot.jsx` (surface du robot), `robots.js` (durée).

Au passage, deux défauts cosmétiques du même ordre : la virgule décimale
française imposée même hors francophonie (`toFixed().replace('.', ',')`
partout, remplacé par `toLocaleString(locale())`), et des heures écrites à la
main en 24 h là où `toLocaleTimeString` existe déjà ailleurs dans le code.
Volontairement NON touchés, vérifiés avant d'écarter : les `<input
type="time">` (valeur ISO stricte, pas un affichage), le calcul interne de
minutes depuis minuit, et `heureVille()` dont le 24 h forcé est une décision
documentée et testée (plusieurs fuseaux à comparer d'un coup d'œil).

Deux relectures indépendantes ont trouvé ce qu'un premier passage manquait :
`verdictCartePlante`/`FichePlante` comparaient encore un `pl.temp` brut à des
seuils Celsius, `RoomGenericCard` passait la valeur brute d'un capteur
générique à une jauge qui attend du Celsius, et `RoomPilotCard`/`RoomPilotSheet`
(fil pilote, piloté par un `input_number` sans borne côté serveur) gardaient
des bornes 5-30 figées en Celsius alors que leur étiquette affichait déjà la
bonne unité.
