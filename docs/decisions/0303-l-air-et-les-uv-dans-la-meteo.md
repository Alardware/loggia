# 0303 — L'air et les UV dans la météo, seulement sur une échelle connue

*30 octobre 2026 — à l'essai, rien de publié (chantier G4, d'après la comparaison des intégrations Gladys du 30/10 : A1 à A6)*

*Complète l'ADR [0272](0272-la-meteo-repond-a-la-question-qu-on-se-pose.md) : la fiche météo de sa maquette « Cartes météo ».*

## Le problème

La comparaison des intégrations Gladys (`audit/gladys-integrations-3010.md`) a relevé six améliorations « Air et météo ». Il a
choisi « Air et UV dans la météo ». Il habite en France.

- **A1.** La qualité de l'air du dehors n'apparaissait nulle part. Un `aqi` de Home Assistant ne dit pas son échelle : 62 est
  « Modéré » pour l'EPA. Ce chiffre est hors de l'indice ATMO, qui va de 1 à 6. Pour l'indice universel de Google, il vaut
  « Bon », car cet indice va à l'envers (100 = le meilleur). En France, la source utile est Atmo France (HACS). Son indice global
  n'a **aucune** classe. Ses sous-indices et ses niveaux de pollen, eux, sont des `aqi` de 1 à 6.
- **A2.** La tuile UV ne disait que l'UV du moment. Il manquait le pic de la journée et les heures où il faut se protéger.
- **A3.** AccuWeather active par défaut son « RealFeel ». Rangé dans « Jardin », il devenait la température du jardin. Le
  refroidissement éolien, le thermomètre mouillé, l'indice de chaleur et une sonde de sol faisaient de même.
- **A4.** Une mesure figée depuis des heures restait jugée comme si elle était fraîche.
- **A5.** Les PM10, le NO₂ et l'ozone d'un capteur de la maison (air-Q, AirVisual Pro) n'avaient pas de zones.
- **A6.** Les pollens n'apparaissaient nulle part.

## La décision

**Une seule table.** Les échelles vont dans `src/confort.js`, avec les autres jauges, dans une table `INDICES` :

- ATMO, de 1 à 6 (arrêté du 10 juillet 2020) ;
- EPA (0–50, 51–100, 101–150, 151–200, 201–300, au-delà) ;
- CAQI (25, 50, 75, 100) ;
- les choix d'un capteur `enum` : AirVisual (les six catégories de l'EPA), AccuWeather (cinq), Google (cinq, du meilleur au
  pire) ;
- les pollens d'Atmo France (1 à 6) et le niveau d'AccuWeather (`level`).

`rangIndice(échelle, valeur)` rend le rang, le mot et les couleurs. L'EPA et le CAQI se jugent sur la valeur **arrondie**, celle
que la tuile écrit (50,4 s'écrit « 50 » et vaut « Bon ») ; l'ATMO, entier, ne s'arrondit pas. Les couleurs sont les jetons du thème les plus proches des
couleurs officielles, dans l'ordre de gravité. Le bordeaux de l'EPA n'a pas de jeton : il reprend le violet. `indiceDesChoix`
reconnaît une échelle aux options exactes d'un `enum`, dans n'importe quel ordre.

**A1 — la tuile « Qualité de l'air ».** `src/airdehors.js` est chargé avec la fiche, jamais au démarrage. Il lit un indice
seulement si son échelle est connue, dans cet ordre :

1. **Par la plateforme**, en ce seul cas (chaque règle est commentée) :
   - `atmofrance` : « Qualité globale », ni pollen, ni J+1 ;
   - `airnow` : l'EPA ;
   - `ambient_station` : l'AQI PM2,5 du **dehors** (`pm25_aqi`, `pm25_aqi_24h_average`). La sonde intérieure et l'AQIN sont la
     maison ;
   - `airvisual` : l'AQI « U.S. » seulement ;
   - `airly` : le CAQI.
2. **Par un capteur à choix frère**, sur le même appareil, dont les options sont celles d'une échelle connue. La tuile prend
   son rang :
   - le chiffre s'écrit seulement quand l'appareil a un seul indice ;
   - sinon, le mot seul ;
   - des choix d'une même série (« day 0 », « day 1 ») donnent le lendemain ;
   - deux séries sur un appareil (l'indice US et le chinois) : on ne choisit pas ;
   - une série sans « day 0 » (muet ou désactivé) ne se lit pas : son « day 1 » ne passe jamais pour aujourd'hui.
3. Sinon : pas de tuile.

**Google UAQI est traité ainsi :** son rang vient de sa catégorie, jamais de son chiffre. Son chiffre ne s'écrit jamais. Sans sa
catégorie, il ne se lit pas.

Le lendemain vient de l'option J+1 d'Atmo France : « Demain : Dégradé ».

La tuile reprend exactement le dessin des six autres : petites capitales, le chiffre en 20 / 800, le mot du rang en dessous.
La barre des rangs a la même forme que celle de l'UV. Le rang du moment est plein, les autres sont à 28 %. Il n'y a pas de
lavis. C'est une **information** : jamais une alerte, jamais un point d'attention, jamais un « aérez ». Atmo France passe devant
les autres sources.

**A2 — l'UV du jour.** Sous la valeur et son mot, la tuile UV écrit « Max 6 · protection de 12 h à 16 h ». Une fois l'heure de
protection commencée, elle écrit « … protection jusqu'à 16 h ».

- Le calcul porte sur les `uv_index` de la prévision horaire du jour : les heures qui restent, l'heure en cours comprise.
- La protection commence au seuil 3 de l'OMS (*Global Solar UV Index : A Practical Guide*, 2002). C'est aussi la zone
  « Modéré » de la tuile. L'indice se juge **arrondi**, comme il s'écrit : 2,3 fait « Max 2 », sans protection.
- Seule la **première plage continue** s'annonce : de sa première heure à la fin de la dernière heure qui la suit sans trou.
  Un creux (14 h à 1) ou une heure absente de la prévision la ferme ; une seconde plage, l'après-midi, ne s'écrit pas.
- Sans UV dans la prévision, ou avec un maximum nul, rien ne s'écrit.

**A3 — `horsair.js`.** Une nouvelle liste de racines (`RESSENTI_SOL`), dans les sept langues :

- realfeel ;
- wind chill, refroidissement éolien ;
- wet bulb, thermomètre mouillé ;
- heat index, indice de chaleur ;
- apparent, gefühlt, percepita, sensación térmica, odczuwalna ;
- soil, Boden, bodem, suolo, suelo, gleba.

« sol » ne compte qu'en mot entier, et jamais dans une pièce : « Sous-sol », « S/sol », « Ss-sol », « Entre-sol ». Une vraie sonde « Jardin » reste jugée.

**A5 — les zones PM10, NO₂, O₃.** Elles suivent les valeurs limites de l'UE pour 2030 (directive (UE) 2024/2881) et les lignes
directrices de l'OMS (2021) :

| Mesure | Bon en dessous de | Mauvais à partir de |
|---|---|---|
| PM10 | 20 µg/m³ | 45 µg/m³ |
| NO₂ | 20 µg/m³ | 50 µg/m³ |
| O₃ (sur 8 h) | 100 µg/m³ | 100 µg/m³ |

- Entre les deux seuils, la mesure est « Moyen ». L'ozone n'a qu'un seuil.
- Le NO₂ et l'ozone ne se lisent qu'en µg/m³. Des ppb ne se lisent pas sur ces bornes.
- Les PM2,5 (10 / 25) ne changent pas.
- Le conseil « aérez » vaut pour les PM10 et le NO₂ (la cuisson au gaz). Il ne vaut pas pour l'ozone, qui vient du dehors.
- Dehors, ces trois mesures restent neutres, sans alerte.

**A6 — la tuile « Pollens ».** Elle n'apparaît que s'il existe un capteur de pollen à échelle connue :

- Atmo France, à sa plateforme et à ses noms : « Qualité globale Pollen », « Niveau <plante> » ;
- une concentration en p/m³ qui porte son `level` (AccuWeather), le jour 0.

La tuile montre le niveau du jour et les plantes qui le portent. Ce n'est jamais une alerte. Sans capteur, il n'y a pas de tuile.

**A4 — pas fait.** L'écran reçoit `hass.states` du frontend de Home Assistant (`getHass`, relu toutes les 2 s par `useHass`).
Ces états viennent de `subscribe_entities`. Leur forme compressée ne porte que `s`, `a`, `c`, `lc` et `lu` (`const.py` de Home
Assistant, `entities.ts` de home-assistant-js-websocket). `last_reported` n'y est pas. Un relevé identique au précédent n'y
change rien non plus : Home Assistant émet alors `state_reported`, et cet événement n'est pas relayé.

Seul `last_updated` arrive. Une valeur stable, comme 19,5 °C toute la nuit, passerait donc pour figée. Le point n'est pas fait.
La démo ne fournit pas `last_reported` non plus. Une piste pour plus tard : le composant, côté serveur, voit `last_reported` et
pourrait le transmettre.

## Les conséquences

- **Pas de redémarrage de Home Assistant.** Rien ne change côté serveur.
- La fiche météo reste chargée à la demande. `airdehors.js` voyage avec elle. Seuls la table `INDICES`, les zones A5 et les
  racines A3 entrent au démarrage.
- **La démo** porte :
  - un service « Atmo France » : l'indice du jour (2, « Moyen »), celui du lendemain (3), l'indice des pollens (3) et deux
    niveaux de pollen ;
  - l'UV de chaque heure de la prévision.

  L'indice de la station du jardin (62, sans échelle) ne fait pas de tuile.
- Les tests : `tests/g4_air_meteo.test.mjs`, `tests/g4_horsair.test.mjs`, `tests/g4_zones_air.test.mjs`, et
  `tests/g4_revue.test.mjs` pour les cinq points de la relecture indépendante du 30/10. Un test existant
  est adapté dans `mesures_table.test.mjs` : les PM10 ont désormais une famille.
- 22 mots nouveaux, dans les sept langues.
