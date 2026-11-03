# 0322 — La démo en ligne a un fond de carte OpenStreetMap, et sa politique de confidentialité le dit

*1er novembre 2026 — à l'essai (rien de publié) (lot 17 du rapport « Gladys comparé au catalogue » : sa réponse au point 1 du lot 16)*

*Complète l'ADR [0321](0321-la-carte-des-personnes-et-des-traceurs-est-une-popup-leaflet-au-fond-de-home-assistant.md) : le fond de la carte, dans la démo en ligne.*

## Le problème

La carte du lot 16 n'avait pas de fond dans la démo. La démo est aussi le site en ligne, et sa politique de confidentialité
promettait qu'aucune image ne venait d'un autre site, à une exception près (les logos des intégrations). Sa réponse, mot pour
mot : « Oui, tuiles OSM ».

## La décision

- **La démo EN LIGNE seulement** — la construction `npm run build:demo` (`--mode demo`) — prend ses tuiles chez OpenStreetMap :
  `https://tile.openstreetmap.org/{z}/{x}/{y}.png`, avec l'attribution « © OpenStreetMap contributors » et son lien.
  - L'adresse vit dans `src/feuillecarte.jsx`, derrière `import.meta.env.MODE === 'demo'`. La construction remplace cette
    condition ; dans le paquet de Home Assistant (« production »), elle vaut faux et l'adresse disparaît du morceau.
  - `tuilesDe({ fondDemo })` (`src/cartegeo.js`) en fait la couche ; sans `fondDemo`, rien ne change.
- **L'installation réelle** garde le relais `map_tiles` de Home Assistant, sans repli vers OpenStreetMap direct ni vers CARTO.
  Un `?demo` sur une installation reste sans fond.
- **Les règles d'usage des tuiles d'OSM** (operations.osmfoundation.org/policies/tiles) :
  - l'attribution est visible ;
  - rien n'est préchargé : Leaflet ne demande que les tuiles affichées ;
  - rien n'est demandé au-delà du zoom 19, qu'OSM sert (`maxNativeZoom`) ;
  - le Referer part : aucun `referrerPolicy` n'est posé ;
  - nous ne gardons aucune tuile en cache.
- **Le mode sombre** est le filtre de l'installation réelle (`FILTRE_SOMBRE`, celui de HA). Il n'y a aucun filtre en clair.
- **La politique de confidentialité** (`site/legal/confidentialite.html`, en français seulement, comme toutes les pages légales)
  le dit :
  - le résumé compte deux exceptions ;
  - un paragraphe « La carte » dit ce qui part : l'adresse IP, ce que le navigateur dit de lui, l'adresse du site, la zone
    affichée (Paris, ou là où l'on déplace la carte), et rien d'autre ;
  - ce paragraphe renvoie à la politique de confidentialité de l'OSMF ;
  - la section « Le logiciel installé chez vous » dit d'où vient le fond de la vraie carte.
- **Les mentions légales** créditent Leaflet (BSD à deux clauses) et les données d'OpenStreetMap (ODbL).
- Il n'y a pas de Content-Security-Policy : ni en `meta`, ni dans `demo.yml` (GitHub Pages ne pose pas d'en-têtes). Rien à
  ouvrir.

Vérifié dans un navigateur, sur la construction de la démo servie en local, en ouvrant « Voir sur la carte » (Sécurité ›
Présence) :
- six tuiles au zoom 13 ;
- l'attribution affichée ;
- le filtre sombre appliqué, aucun filtre en clair ;
- aucun autre hôte que `tile.openstreetmap.org` et le site lui-même ;
- aucune erreur en console.

Le paquet de Home Assistant construit ne contient pas l'adresse.

## Les conséquences

- Pas de redémarrage de Home Assistant. Le démarrage ne bouge pas (1 056 823 octets).
- Tests :
  - `tests/carte_geo.test.mjs` : un test neuf. L'adresse ne vit que derrière la condition de la démo, et le paquet n'en
    contient aucune. Une assertion modifiée.
  - `tests/pages_legales.test.mjs` : une assertion modifiée. `tile.openstreetmap.org` est permis seulement dans
    `feuillecarte.jsx`, et la politique doit le nommer et lier celle de l'OSMF.
- Les pages légales ne sont pas dans le paquet HACS : elles ne partent qu'avec le site.
