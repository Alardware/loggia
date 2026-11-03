/* ── La carte des personnes et des traceurs : ce qu'elle pose (lot 16 du rapport Gladys ; ADR 0321) ──
 *
 * « Reporter la map de Home Assistant dans Loggia » : une popup, la carte de HA
 * redessinée avec Leaflet (feuillecarte.jsx, chargée à la demande). Ce module
 * dit ce qu'elle montre, sans React, sans Leaflet, sans Home Assistant :
 *  - les ZONES de Home Assistant (`zone.*` : latitude, longitude, rayon), la
 *    maison (`zone.home`) en premier ; une zone passive est tue, comme sur la
 *    carte de HA (`ha-map.ts` : `if (passive && !renderPassive) return`) ;
 *  - les PERSONNES suivies par Loggia (la liste de la carte Présence,
 *    `peopleList`), jamais toutes les `person` de la maison ;
 *  - les TRACEURS d'objets (`estTraceur`, lot 13), passés en fonction ;
 *  - une entité sans coordonnées lisibles n'est PAS posée : elle part dans
 *    `sansPosition`, que la feuille nomme sous la carte.
 * Le fond de carte est celui de Home Assistant (voir `tuilesDe`) : rien d'autre
 * ne sort du navigateur. Pas de géocodage, rien d'écrit nulle part. */
import { tr, comparerTextes } from './i18n.js';
import { lieuPresence, motPresence } from './presence.js';
import { vueTraceur } from './traceur.js';

/* ── Le fond de carte de Home Assistant (frontend 20260930.5, celui de HA 2026.10) ──
 * `src/common/map/base-layer.ts` : la couche raster de secours de Leaflet passe
 * par le relais de tuiles du cœur (`/api/map_tiles/raster/{z}/{x}/{y}.png?token=`,
 * intégration `map_tiles`, depuis HA 2026.9), jeton demandé par le websocket
 * (`map_tiles/access_token`). Le relais va chercher les tuiles chez OpenStreetMap ;
 * le navigateur ne parle qu'à Home Assistant.
 *
 * La démo EN LIGNE (la construction `--mode demo`, lot 17, ADR 0322 : « Oui,
 * tuiles OSM ») prend les siennes chez OpenStreetMap, comme la démo de HA :
 * `fondDemo`, l'adresse que feuillecarte.jsx ne connaît QUE dans cette
 * construction — le paquet de Home Assistant ne la contient pas. Sa politique
 * de confidentialité le dit (site/legal/confidentialite.html). Un `?demo` sur
 * une installation reste sans fond. */
const TUILES_HA = '/api/map_tiles/raster/{z}/{x}/{y}.png?token={token}';
// L'attribution du relais (`ATTRIBUTION`, homeassistant/components/map_tiles/const.py) : un lien qu'on clique, rien ne s'y charge.
const ATTRIBUTION_OSM = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
// `MAP_MIN_ZOOM`, `MAP_MAX_ZOOM`, `RASTER_MAX_NATIVE_ZOOM` de base-layer.ts ; 14 : le `zoom` par défaut de `ha-map`, plafond du cadrage.
export const ZOOMS = { min: 1, max: 20, natif: 19, cadre: 14, focus: 16 };

/**
 * Le fond de carte : `{ url, options }`, ou null quand il n'y en a pas.
 *  - un jeton du relais : les tuiles de Home Assistant ;
 *  - `fondDemo` (la démo en ligne seulement) : les tuiles d'OpenStreetMap, avec
 *    son attribution, sans rien demander au-delà du zoom 19 qu'il sert ; ni
 *    préchargement, ni cache à nous, et le Referer part (règles d'usage d'OSM) ;
 *  - sinon (un `?demo` sur une installation, un Home Assistant d'avant 2026.9,
 *    hors ligne) : rien, un fond neutre ; les cercles et les marqueurs se posent
 *    quand même.
 */
export function tuilesDe({ jeton = null, fondDemo = null } = {}) {
  if (typeof fondDemo === 'string' && fondDemo) return { url: fondDemo, options: { attribution: ATTRIBUTION_OSM, maxZoom: ZOOMS.max, maxNativeZoom: ZOOMS.natif } };
  if (typeof jeton !== 'string' || !jeton) return null;
  return { url: TUILES_HA, options: { attribution: ATTRIBUTION_OSM, maxZoom: ZOOMS.max, maxNativeZoom: ZOOMS.natif, token: jeton } };
}

/* Le mode sombre de la carte de HA : ses tuiles raster n'ont pas de variante
 * sombre, elles s'inversent en CSS (`ha-map.ts`, `#map.forced-dark` :
 * `--map-filter`, appliqué à `.leaflet-tile-pane .leaflet-tile`). Loggia suit SON
 * thème : sombre par défaut, `loggia-light` sur la racine en clair (theme.js). */
export const FILTRE_SOMBRE = 'invert(0.9) hue-rotate(170deg) brightness(1.5) contrast(1.2) saturate(0.3)';

/* Ce que la feuille ajoute à la feuille de style de Leaflet. Couleurs : les
 * jetons du thème seulement (le noir des ombres est permis). Une zone, un
 * marqueur, la bulle : la classe porte la couleur, l'attribut SVG ne lit pas
 * les variables CSS. Sans tuiles, le fond neutre est celui des panneaux. */
export const CSS_CARTE = [
  '.o-geo{position:relative;z-index:0;height:min(56vh,420px);min-height:240px;border-radius:14px;overflow:hidden;background:var(--o-s1);border:var(--o-bw,1px) solid var(--o-bd2)}',
  '.o-geo .leaflet-container{height:100%;background:var(--o-s1);font-family:inherit}',
  '.o-geo .leaflet-tile-pane .leaflet-tile{filter:' + FILTRE_SOMBRE + '}',
  '.loggia-light .o-geo .leaflet-tile-pane .leaflet-tile{filter:none}',
  '.o-geo .leaflet-bar a{background:var(--o-surfA);color:var(--o-text1);border-color:var(--o-bd2)}',
  '.o-geo .leaflet-control-attribution{background:var(--o-surfA);color:var(--o-text2)}',
  '.o-geo .leaflet-control-attribution a{color:var(--o-accent-soft)}',
  '.o-geo-z{stroke:var(--o-accent);fill:var(--o-accent);stroke-opacity:.7;fill-opacity:.12;stroke-width:2}',
  '.o-geo-z.o-geo-maison{stroke:var(--o-ok);fill:var(--o-ok)}',
  '.o-geo-i{background:none;border:none}',
  '.o-geo-m{box-sizing:border-box;width:100%;height:100%;border-radius:50%;display:flex;align-items:center;justify-content:center;overflow:hidden;background:var(--o-surfA);color:var(--o-text1);font-size:13px;font-weight:800;border:2px solid var(--o-bd1);box-shadow:0 2px 6px rgba(0,0,0,.35)}',
  '.o-geo-m img{width:100%;height:100%;object-fit:cover;display:block}',
  '.o-geo-m.o-geo-ici{border-color:var(--o-ok)}',
  '.o-geo-m.o-geo-choisi{border-color:var(--o-accent);box-shadow:0 0 0 3px var(--o-accent),0 2px 8px rgba(0,0,0,.45)}',
  '.o-geo .leaflet-tooltip{background:var(--o-surfA);color:var(--o-text);border:var(--o-bw,1px) solid var(--o-bd2);border-radius:10px;font-weight:700;font-size:12px;box-shadow:0 4px 14px rgba(0,0,0,.3)}',
  '.o-geo .leaflet-tooltip-top:before{border-top-color:var(--o-surfA)}',
].join('\n');

/** Les initiales d'un marqueur sans visage, comme la carte de HA (`ha-map.ts`) : la première lettre de chaque mot, trois au plus. */
export function initiales(nom) {
  return String(nom || '').trim().split(/\s+/).filter(Boolean).map((m) => Array.from(m)[0]).join('').slice(0, 3);
}

const nombre = (v) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);

/** Les coordonnées d'un état : `{ lat, lon }`, ou null si elles manquent ou ne tiennent pas sur la Terre. */
export function coordDe(st) {
  const a = (st && st.attributes) || null;
  if (!a) return null;
  const lat = nombre(a.latitude), lon = nombre(a.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

/** Les zones de Home Assistant à dessiner : la maison d'abord, puis les autres dans l'ordre de leur nom. */
export function zonesCarte(S = {}) {
  const out = [];
  for (const id of Object.keys(S || {})) {
    if (id.indexOf('zone.') !== 0) continue;
    const st = S[id];
    const a = (st && st.attributes) || {};
    if (a.passive === true) continue;
    const c = coordDe(st);
    if (!c) continue;
    const r = nombre(a.radius);
    out.push({ id, nom: a.friendly_name || id.slice(5), lat: c.lat, lon: c.lon, rayon: Number.isFinite(r) && r > 0 ? r : 0, maison: id === 'zone.home' });
  }
  return out.sort((x, y) => (x.maison !== y.maison ? (x.maison ? -1 : 1) : comparerTextes(String(x.nom), String(y.nom))));
}

const instant = (v) => {
  const t = v == null || v === '' ? NaN : new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
};

/**
 * Ce que la carte pose. `suivies` : les `person` suivies (`[{ haid, name, img }]`) ;
 * `estTraceur(id)` : la reconnaissance du lot 13 ; `index` : l'index de Loggia,
 * pour les capteurs d'un traceur (son dernier signal).
 *
 * `{ marqueurs, sansPosition }` — un marqueur : `{ id, genre, nom, img, lat, lon,
 * maison, zone, quand }` ; `genre` : 'personne' ou 'traceur' ; `zone` : son mot
 * (« À la maison », le nom de la zone…) ; `quand` : l'instant à dire « il y a »,
 * en millisecondes, ou null. Les personnes d'abord, dans l'ordre de la liste.
 */
export function pointsCarte({ S = {}, suivies = [], estTraceur = () => false, index = null } = {}) {
  const marqueurs = [], sansPosition = [];
  const pris = new Set();
  for (const p of suivies || []) {
    const id = p && typeof p.haid === 'string' ? p.haid : null;
    if (!id || id.indexOf('person.') !== 0 || pris.has(id)) continue;
    pris.add(id);
    const st = S[id];
    const a = (st && st.attributes) || {};
    const lieu = lieuPresence(st).cle;
    const point = {
      id, genre: 'personne', nom: p.name || a.friendly_name || id.slice(7), img: p.img || a.entity_picture || null,
      maison: lieu === 'maison',
      // Le mot de la carte Présence : « À la maison », « Absent », le nom de la zone, « Inconnu » (G1-D8).
      zone: motPresence(st, tr('À la maison')),
      quand: instant(st && st.last_changed),
    };
    const c = coordDe(st);
    if (c) marqueurs.push({ ...point, ...c }); else sansPosition.push(point);
  }
  for (const id of Object.keys(S || {})) {
    if (id.indexOf('device_tracker.') !== 0 || pris.has(id) || !estTraceur(id)) continue;
    pris.add(id);
    const v = vueTraceur({ id, S, index });
    const point = { id, genre: 'traceur', nom: v.nom, img: null, maison: v.lieu === 'maison', zone: v.zone, quand: v.signal };
    const c = coordDe(S[id]);
    if (c) marqueurs.push({ ...point, ...c }); else sansPosition.push(point);
  }
  return { marqueurs, sansPosition };
}

/**
 * Les points que le cadrage doit contenir : les marqueurs, et la maison (son
 * centre et son rayon, en degrés approchés) — le repère de toute carte de HA.
 * `[[lat, lon], …]` ; vide s'il n'y a rien à cadrer.
 */
export function pointsCadre(marqueurs = [], zones = []) {
  const pts = marqueurs.map((m) => [m.lat, m.lon]);
  const maison = zones.find((z) => z.maison);
  if (maison) {
    const dLat = maison.rayon / 111320;
    const dLon = maison.rayon / (111320 * Math.max(0.01, Math.cos(maison.lat * Math.PI / 180)));
    pts.push([maison.lat - dLat, maison.lon - dLon], [maison.lat + dLat, maison.lon + dLon]);
  }
  return pts;
}
