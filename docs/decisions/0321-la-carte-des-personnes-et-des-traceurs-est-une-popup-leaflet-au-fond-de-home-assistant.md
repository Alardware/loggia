# 0321 — La carte des personnes et des traceurs est une popup, Leaflet sur le fond de Home Assistant

*1er novembre 2026 — appliqué (v3.97.0) (lot 16 du rapport « Gladys comparé au catalogue » : sa demande)*

*Complétée par l'ADR [0322](0322-la-demo-en-ligne-a-un-fond-de-carte-openstreetmap.md) (01/11) : la démo en ligne a un fond OpenStreetMap.*

*Complète l'ADR [0318](0318-un-traceur-d-objet-a-sa-carte-et-sa-popup-et-n-est-pas-une-personne.md) : le traceur a maintenant sa place sur une carte.*

## Le problème

Sa demande, mot pour mot : « ce qui pourrais etre bien de même que pour les users, c'est la map reporter la map de home
assistant dans loggia, avoir une page ou popup trackers ».

Loggia savait où étaient les gens en un mot (« À la maison », le nom d'une zone, ADR 0300) et le traceur d'un vélo en un mot
(ADR 0318). La carte « Localisation » de la bibliothèque place les gens par distance et cap autour de la maison, sans fond :
« AUCUNE tuile externe ». Rien ne montrait une vraie carte.

## La décision

**Une popup, pas une vue.** Il préfère les popups, et un appareil n'a jamais sa vue. `src/feuillecarte.jsx` est une feuille au
patron des autres : une ligne de titre (« Localisation »), une seule croix, la carte, puis la liste. Deux entrées :

- **la feuille Présence** (celle qui s'ouvre d'un toucher sur la carte Présence, dans Sécurité ou dans une vue où on l'a posée) : « Voir sur
  la carte ». C'est là que Loggia montre les personnes, et la seule liste de personnes qu'il suit (`peopleList`) ; la vue
  Présence de Paramètres règle le départ et le retour, elle ne montre personne ;
- **la popup d'un traceur** (`fichetraceur.jsx`) : « Voir sur la carte », seulement s'il donne une position. La carte s'ouvre
  centrée sur lui.

**Ce qu'elle pose** (`src/cartegeo.js`, pur) :

- les personnes **suivies** : la liste de la carte Présence (le choix de Paramètres, sinon la découverte), jamais toutes les
  `person` de la maison ;
- les traceurs d'objets (`estTraceur`, ADR 0318) ; un téléphone n'en est pas un ;
- les zones de Home Assistant (`zone.*` : latitude, longitude, `radius`), en cercles, **la maison d'abord** ; une zone passive
  est tue, comme sur la carte de HA ;
- une entité sans coordonnées lisibles (absentes, vides, hors de la Terre) n'est **pas posée** : la liste la nomme « Sans
  position ». Si personne n'en a, la popup le dit : « Aucune personne suivie ni aucun traceur n'a de position dans Home
  Assistant. »

Un toucher sur un marqueur (ou sur sa rangée) montre sa bulle : son nom, sa zone et « il y a N min » (`last_changed` d'une
personne ; le dernier signal d'un traceur, lu par `vueTraceur`). Les marqueurs : le visage de la personne (`entity_picture`) ou
ses initiales, une lettre par mot, trois au plus, comme HA ; l'icône du traceur. Des `divIcon` faits d'éléments du DOM, le nom
posé en `textContent` : jamais les images par défaut de Leaflet, jamais de HTML venu d'un nom.

**Le rendu de la carte de HA.** Lu dans `home-assistant/frontend`, au frontend `20260930.5` (celui de HA 2026.10.4, l'installation
de la maison) :

- `src/common/dom/setup-leaflet-map.ts` : Leaflet, `minZoom` 1, `maxZoom` 20, `attributionControl.setPrefix("")` ;
- `src/common/map/base-layer.ts` : la couche raster de Leaflet passe par le relais de tuiles du cœur,
  `/api/map_tiles/raster/{z}/{x}/{y}.png?token={token}`, `maxNativeZoom` 19, jeton demandé par le websocket
  (`map_tiles/access_token`, intégration `map_tiles`, `homeassistant/components/map_tiles/`, présente depuis HA 2026.9) ;
  attribution d'OpenStreetMap (celle de `map_tiles/const.py`, « contributors » compris), un lien qu'on clique ;
- `src/components/map/ha-map.ts` : le mode sombre du raster est un **filtre CSS sur les tuiles**,
  `invert(0.9) hue-rotate(170deg) brightness(1.5) contrast(1.2) saturate(0.3)` ; le zoom par défaut, 14, plafonne le cadrage.
  Loggia applique le filtre quand SON thème est sombre et le retire en clair (`loggia-light`, theme.js).

Source : https://github.com/home-assistant/frontend (fichiers ci-dessus, étiquette `20260930.5`) et
https://github.com/home-assistant/core/tree/2026.10.4/homeassistant/components/map_tiles.

Avant 2026.9, HA demandait ses tuiles à CARTO (`basemaps.cartocdn.com/rastertiles/voyager`). Loggia ne le fait **pas** : chez un
Home Assistant sans relais, la carte n'a pas de fond, et une ligne le dit. C'est la règle de la carte « Localisation » (« aucune
tuile externe ») qui tient : le navigateur ne parle qu'à Home Assistant.

**Vie privée.** Les coordonnées ne servent qu'à placer les marqueurs, dans la page. Seules les tuiles se demandent, à Home
Assistant, comme sa propre carte. Pas de géocodage, aucun service tiers, rien d'écrit au serveur de Loggia ni dans le navigateur,
rien au téléphone ni au journal. Le seul message au websocket est la demande du jeton. Rien ne se commande.

**Le démarrage.** Leaflet (1.9.4, BSD-2, version exacte dans `package.json`) et sa feuille de style (`?inline`, posée dans une
balise `<style>` à la première ouverture) vivent dans le morceau `feuillecarte-*.js`, chargé à la demande (`lazyRecharge`,
ADR 0145). La feuille Présence elle-même quitte le démarrage pour `cartescustom/feuillepresence.jsx`, chargée au premier toucher
de la carte, son texte inchangé : le boot passe de 1 058 108 à 1 056 823 octets (−1 285). La construction retire les
commentaires de licence : l'avis de Leaflet part avec le paquet dans `public/licences/leaflet.txt`.

**Sans réseau** (tuiles qui ne viennent pas) : le fond reste le gris des panneaux, les cercles et les marqueurs se posent, la
liste marche.

**La démo** : deux zones fictives, la maison au point de la démo (Paris) et « Travail » ; Camille à la maison, Alex au travail, le
vélo près de la maison ; Léa sans position, qui montre la règle. Toutes ces positions sont inventées. La démo n'a **pas de fond** :
la démo de HA demande ses tuiles à `tile.openstreetmap.org`, mais celle de Loggia est aussi le site en ligne, dont la politique
de confidentialité dit qu'aucune adresse tierce ne se charge (`tests/pages_legales.test.mjs`). L'y autoriser demande de réécrire
cette page : c'est sa décision. `www.openstreetmap.org` entre dans les adresses permises du test, comme lien d'attribution
seulement : il ne s'affiche qu'avec les tuiles du relais, donc jamais sur le site.

Écarté :

- une vue « Carte » : il préfère les popups, et « pas de vue par appareil » ;
- les tuiles de CARTO pour un Home Assistant d'avant 2026.9 : un tiers verrait la région de la maison ; c'est à lui d'en
  décider ;
- les tuiles d'OpenStreetMap dans la démo, pour la même raison, côté site ;
- les grappes de marqueurs de HA (`leaflet.markercluster`), les traînes d'historique et le cercle de précision : une maison suit
  peu de monde, et chaque ajout pèserait sur le morceau.

## Les conséquences

- **Pas de redémarrage de Home Assistant** : `latitude`, `longitude` et `radius` sont des attributs d'état, que l'écran lit
  déjà ; l'index n'a rien à porter. Aucun fichier Python.
- Une dépendance de plus : `leaflet` 1.9.4. Avant de construire ailleurs que dans le miroir du lot, `npm install` (le patch porte
  `package.json` et `package-lock.json`).
- La feuille Présence s'ouvre après le chargement de son module (2 Ko), la carte après celui du sien (171 Ko, Leaflet compris).
- Tests : `tests/carte_geo.test.mjs` (16). Vérifié par les tests et la construction seulement : rien vu dans un navigateur.
