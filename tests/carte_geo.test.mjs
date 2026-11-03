// La carte des personnes et des traceurs (lot 16 du rapport Gladys ; ADR 0321).
//
// « reporter la map de home assistant dans loggia, avoir une page ou popup
// trackers » : une POPUP, la carte de Home Assistant redessinée avec Leaflet, son
// fond (le relais de tuiles du cœur), son mode sombre (un filtre CSS sur les
// tuiles). Elle pose les personnes SUIVIES (pas toutes), les traceurs d'objets,
// les zones, la maison en premier ; une entité sans coordonnées n'est pas posée.
// Elle lit, elle ne fait rien d'autre. Leaflet et sa feuille de style se chargent
// à la demande. Toutes les positions de ce fichier sont INVENTÉES, autour du point
// de la démo (Paris).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { monter } from './crochets.mjs';
import { device, entity, state, states, ctxOf } from './fixtures.mjs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);

const G = await import('../src/cartegeo.js');
const { setLoggiaState, estTraceur } = await import('../src/state.js');
const Fiche = (await import('../src/fichetraceur.jsx')).FicheTraceurContent;
const { maisonCapteursDemo } = await import('../src/demo.js');
const { buildIndex } = await import('../src/discovery.js');
const lire = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const ilYa = (min) => new Date(Date.now() - min * 60000).toISOString();
const ICI = { latitude: 48.8566, longitude: 2.3522 };      // le point de la démo
const LOIN = { latitude: 48.879, longitude: 2.329 };       // le « Travail » fictif

/* Une maison : deux personnes suivies (l'une avec position, l'autre sans), une troisième NON suivie qui en a une, le traceur
 * d'un vélo, un téléphone qui a aussi une position, et trois zones (dont une passive). */
function maison() {
  const ents = [
    entity('device_tracker.velo', { device: 'd_velo', platform: 'invoxia_biotracker' }),
    entity('device_tracker.telephone', { device: 'd_tel', platform: 'mobile_app' }),
  ];
  const S = states(
    state('person.camille', 'home', { friendly_name: 'Camille', ...ICI, entity_picture: '/api/image/serve/x/512x512' }),
    state('person.lea', 'home', { friendly_name: 'Léa' }),
    state('person.voisin', 'not_home', { friendly_name: 'Voisin', ...LOIN }),
    state('device_tracker.velo', 'Travail', { friendly_name: 'Vélo', source_type: 'gps', ...LOIN }),
    state('device_tracker.telephone', 'home', { friendly_name: 'Téléphone', source_type: 'gps', ...ICI }),
    state('zone.travail', '0', { friendly_name: 'Travail', ...LOIN, radius: 150 }),
    state('zone.ancienne', '0', { friendly_name: 'Ancienne', ...LOIN, radius: 50, passive: true }),
    state('zone.home', '2', { friendly_name: 'Maison', ...ICI, radius: 100 }),
  );
  S['person.camille'].last_changed = ilYa(5);
  return { areas: [], devices: [device('d_velo', 'Vélo', null, { integration: 'invoxia_biotracker' }), device('d_tel', 'Téléphone', null, { integration: 'mobile_app' })], entities: ents, floors: [], states: S };
}
const SUIVIES = [{ haid: 'person.camille', name: 'Camille' }, { haid: 'person.lea', name: 'Léa' }];
function avec(fx, f) {
  const ctx = ctxOf(fx, {});
  setLoggiaState({ index: ctx.index, ent: {}, cfg: {}, resolved: null });
  try { return f(ctx); } finally { setLoggiaState({ index: null, ent: {}, cfg: {}, resolved: null }); }
}
const poser = (fx, suivies = SUIVIES) => avec(fx, (ctx) => G.pointsCarte({ S: fx.states, suivies, estTraceur, index: ctx.index }));
const ids = (l) => l.map((m) => m.id);

/* ════════════ CE QUI SE POSE ════════════ */

test('seules les personnes SUIVIES se posent : une personne de la maison hors de la liste n’y est pas', () => {
  const { marqueurs, sansPosition } = poser(maison());
  assert.ok(ids(marqueurs).includes('person.camille'));
  assert.ok(!ids(marqueurs).includes('person.voisin') && !ids(sansPosition).includes('person.voisin'), 'une personne non suivie est posée');
});

test('un traceur d’objet se pose ; un téléphone, qui a pourtant une position, non', () => {
  const { marqueurs } = poser(maison());
  assert.ok(ids(marqueurs).includes('device_tracker.velo'));
  assert.ok(!ids(marqueurs).includes('device_tracker.telephone'), 'un téléphone passe pour un traceur');
  const v = marqueurs.find((m) => m.id === 'device_tracker.velo');
  assert.equal(v.genre, 'traceur');
  assert.equal(v.zone, 'Travail', 'le nom de la zone, tel quel');
});

test('une entité sans coordonnées n’est pas posée : elle part dans la liste « sans position »', () => {
  const { marqueurs, sansPosition } = poser(maison());
  assert.ok(!ids(marqueurs).includes('person.lea'));
  assert.deepEqual(ids(sansPosition), ['person.lea']);
});

test('des coordonnées illisibles ou hors de la Terre ne se posent pas', () => {
  const c = (a) => G.coordDe({ attributes: a });
  assert.deepEqual(c({ latitude: 48.85, longitude: 2.35 }), { lat: 48.85, lon: 2.35 });
  assert.deepEqual(c({ latitude: '48.85', longitude: '2.35' }), { lat: 48.85, lon: 2.35 });
  for (const a of [{}, { latitude: null, longitude: null }, { latitude: '', longitude: '' }, { latitude: 'abc', longitude: 2 }, { latitude: 95, longitude: 2 }, { latitude: 48, longitude: 181 }]) {
    assert.equal(c(a), null, JSON.stringify(a));
  }
  assert.equal(G.coordDe(null), null);
});

test('une personne dit sa zone et depuis quand ; les personnes d’abord, dans l’ordre de la liste', () => {
  const { marqueurs } = poser(maison());
  assert.equal(marqueurs[0].id, 'person.camille');
  assert.equal(marqueurs[0].zone, 'À la maison');
  assert.equal(marqueurs[0].maison, true);
  assert.equal(marqueurs[0].img, '/api/image/serve/x/512x512', 'le visage de la personne');
  assert.ok(Math.abs(marqueurs[0].quand - (Date.now() - 5 * 60000)) < 5000, 'l’instant de son dernier changement');
});

test('les zones : la maison d’abord, une zone passive tue, comme sur la carte de HA', () => {
  const z = G.zonesCarte(maison().states);
  assert.deepEqual(z.map((x) => x.id), ['zone.home', 'zone.travail']);
  assert.equal(z[0].maison, true);
  assert.equal(z[0].rayon, 100);
  // La maison passe devant une zone dont le nom vient avant le sien.
  const S = { ...maison().states, 'zone.atelier': { entity_id: 'zone.atelier', state: '0', attributes: { friendly_name: 'Atelier', ...LOIN, radius: 40 } } };
  assert.deepEqual(G.zonesCarte(S).map((x) => x.id), ['zone.home', 'zone.atelier', 'zone.travail']);
  // Une zone sans coordonnées ne se dessine pas.
  assert.deepEqual(G.zonesCarte({ 'zone.vide': { attributes: { friendly_name: 'Vide' } } }), []);
});

test('le cadrage contient les marqueurs et la maison', () => {
  const fx = maison();
  const { marqueurs } = poser(fx);
  const pts = G.pointsCadre(marqueurs, G.zonesCarte(fx.states));
  assert.equal(pts.length, marqueurs.length + 2, 'deux coins pour la maison');
  assert.deepEqual(G.pointsCadre([], []), []);
});

test('les initiales d’un marqueur sans visage, comme HA : une lettre par mot, trois au plus', () => {
  assert.equal(G.initiales('Camille'), 'C');
  assert.equal(G.initiales('Jean Pierre Paul Marie'), 'JPP');
  assert.equal(G.initiales('  '), '');
});

/* ════════════ LE FOND ET LE MODE SOMBRE ════════════ */

test('le fond de carte : le relais de tuiles de HA avec son jeton ; sinon aucun, la démo comprise', () => {
  const ha = G.tuilesDe({ jeton: 'abc' });
  assert.equal(ha.url, '/api/map_tiles/raster/{z}/{x}/{y}.png?token={token}', 'l’adresse du relais, relative : le navigateur ne parle qu’à Home Assistant');
  assert.equal(ha.options.token, 'abc');
  assert.equal(ha.options.maxNativeZoom, 19);
  assert.match(ha.options.attribution, /openstreetmap\.org\/copyright/);
  /* ASSERTION MODIFIÉE (01/11, ADR 0322) : la démo EN LIGNE a désormais son fond (« Oui, tuiles OSM ») ; il passe par
   * `fondDemo`, que seule la construction `--mode demo` connaît. Sans lui, la démo d'une installation n'a toujours rien. */
  assert.equal(G.tuilesDe({ demo: true }), null, 'un `?demo` sur une installation demanderait ses tuiles à un tiers');
  assert.ok(lire('src/feuillecarte.jsx').includes("if (enDemo()) { const t = tuilesDe({ fondDemo: FOND_DEMO });"), 'la démo prend le fond de la démo');
  assert.ok(lire('src/feuillecarte.jsx').includes('else demanderJeton()'), 'hors démo, le relais de HA seul');
  assert.equal(G.tuilesDe({}), null, 'sans jeton, pas de fond : un fond neutre, rien d’ailleurs');
  assert.equal(G.tuilesDe({ jeton: '' }), null);
});

test('le fond de la démo en ligne : OpenStreetMap, attribué, jamais au-delà du zoom 19, et nulle part hors démo', () => {
  const osm = G.tuilesDe({ fondDemo: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', jeton: 'abc' });
  assert.equal(osm.url, 'https://tile.openstreetmap.org/{z}/{x}/{y}.png');
  assert.match(osm.options.attribution, /&copy; <a href="https:\/\/www\.openstreetmap\.org\/copyright">OpenStreetMap<\/a> contributors/, 'l’attribution visible qu’OSM exige');
  assert.equal(osm.options.maxNativeZoom, 19, 'OSM sert jusqu’au zoom 19 : au-delà, Leaflet agrandit sans rien demander');
  assert.equal(osm.options.token, undefined, 'le jeton du relais ne part pas chez un tiers');
  for (const k of ['referrerPolicy', 'crossOrigin', 'keepBuffer']) assert.ok(!(k in osm.options), k + ' : le Referer part, ni préchargement ni réglage à nous');
  const feuille = lire('src/feuillecarte.jsx');
  // L'adresse ne vit QUE derrière la condition que la construction remplace : le paquet de HA ne la contient pas.
  const lignes = feuille.split('\n').filter((l) => l.includes('tile.openstreetmap.org'));
  assert.deepEqual(lignes, ["const FOND_DEMO = import.meta.env.MODE === 'demo' ? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png' : null;"]);
  assert.ok(!/referrerPolicy|prefetch|caches\.open|localStorage/.test(feuille), 'pas de cache, pas de préchargement, le Referer par défaut');
  // Le paquet servi par Home Assistant (construit en « production ») : aucune adresse d'OpenStreetMap à charger.
  const dossier = new URL('../custom_components/loggia/frontend/assets/', import.meta.url);
  const morceaux = readdirSync(dossier).filter((n) => n.endsWith('.js'));
  assert.ok(morceaux.length > 10, 'le paquet est introuvable');
  for (const n of morceaux) assert.ok(!readFileSync(new URL(n, dossier), 'utf8').includes('tile.openstreetmap.org'), n + ' : le paquet de HA demanderait ses tuiles à un tiers');
});

test('le mode sombre : les tuiles s’inversent par le filtre de HA, sauf quand Loggia est en clair', () => {
  assert.equal(G.FILTRE_SOMBRE, 'invert(0.9) hue-rotate(170deg) brightness(1.5) contrast(1.2) saturate(0.3)');
  assert.ok(G.CSS_CARTE.includes('.o-geo .leaflet-tile-pane .leaflet-tile{filter:' + G.FILTRE_SOMBRE + '}'), 'le filtre sombre manque');
  assert.ok(G.CSS_CARTE.includes('.loggia-light .o-geo .leaflet-tile-pane .leaflet-tile{filter:none}'), 'le mode clair garde ses tuiles inversées');
  // La classe que le thème pose en clair (theme.js) est celle que la règle lit.
  assert.ok(lire('src/theme.js').includes("root.classList.toggle('loggia-light', light);"));
  // Sans couleur en dur : les jetons du thème, et le noir des ombres.
  assert.ok(!/#[0-9a-f]{3,8}\b/i.test(G.CSS_CARTE), 'une couleur en dur');
});

/* ════════════ LA POPUP ════════════ */

test('la popup d’un traceur propose « Voir sur la carte » s’il a une position, et seulement alors', () => {
  const fx = maison();
  avec(fx, () => {
    const vu = [];
    const m = monter(Fiche, { id: 'device_tracker.velo', hass: { states: fx.states }, onCarte: () => vu.push(1) });
    assert.ok(m.texte().includes('Voir sur la carte'));
    m.demonter();
  });
  const sans = maison();
  delete sans.states['device_tracker.velo'].attributes.latitude;
  avec(sans, () => assert.ok(!monter(Fiche, { id: 'device_tracker.velo', hass: { states: sans.states }, onCarte: () => {} }).texte().includes('Voir sur la carte')));
});

test('Leaflet et sa feuille de style se chargent à la demande ; le démarrage n’en porte que l’adresse', () => {
  const carte = lire('src/feuillecarte.jsx');
  assert.ok(carte.includes("import * as L from 'leaflet';") && carte.includes("import cssLeaflet from 'leaflet/dist/leaflet.css?inline';"));
  assert.ok(lire('src/cartescustom/feuillepresence.jsx').includes("const FeuilleCarte = lazyRecharge(() => import('../feuillecarte.jsx'));"));
  assert.ok(lire('src/fichetraceur.jsx').includes("const FeuilleCarte = lazyRecharge(() => import('./feuillecarte.jsx'));"));
  // La feuille Présence elle-même quitte le démarrage : elle s'ouvre au premier toucher.
  const galerie = lire('src/cartescustom/galerie.jsx');
  assert.ok(galerie.includes("const FeuillePresence = lazyRecharge(() => import('./feuillepresence.jsx'));"));
  assert.ok(galerie.includes('<Suspense fallback={null}>\n      {ouvert && <FeuillePresence liste={liste} onClose={() => setOuvert(false)} />}\n    </Suspense>'));
  assert.ok(!/from 'leaflet'|feuillecarte\.jsx'\)/.test(galerie), 'Leaflet entre au démarrage');
  // Une version EXACTE.
  const pkg = JSON.parse(lire('package.json'));
  assert.match(pkg.dependencies.leaflet, /^\d+\.\d+\.\d+$/, 'leaflet sans version exacte');
  // Son avis de licence part avec le paquet (la construction retire les commentaires).
  assert.ok(lire('public/licences/leaflet.txt').includes('BSD 2-Clause License'));
});

test('la carte lit et ne fait rien d’autre : ni commande, ni écriture, ni service tiers', () => {
  const src = lire('src/feuillecarte.jsx') + lire('src/cartegeo.js');
  for (const interdit of ['callService', 'commander(', 'localStorage', 'sessionStorage', 'indexedDB', 'fetch(', 'XMLHttpRequest', 'innerHTML', 'console.']) {
    assert.ok(!src.includes(interdit), 'la carte contient ' + interdit);
  }
  // Le seul message au websocket : le jeton des tuiles.
  assert.deepEqual([...src.matchAll(/callWS\(\{ type: '([^']+)'/g)].map((m) => m[1]), ['map_tiles/access_token']);
  // Les noms se posent en texte, jamais en HTML.
  assert.ok(src.includes('el.textContent = initiales(m.nom)') && src.includes('bulle.textContent = texte;'));
});

test('la popup a le patron des feuilles : une ligne de titre, une seule croix', () => {
  const carte = lire('src/feuillecarte.jsx');
  assert.equal((carte.match(/<TitreFeuille/g) || []).length, 1);
  assert.ok(!carte.includes('<CroixFeuille'), 'une seconde croix');
  assert.ok(carte.includes("tr('Aucune personne suivie ni aucun traceur n’a de position dans Home Assistant.')"), 'sans aucune position, la popup le dit');
});

/* ════════════ LA DÉMO ════════════ */

test('la démo : deux personnes posées, une sans position, le vélo près de la maison, les zones — tout autour de Paris', () => {
  const m = maisonCapteursDemo();
  const r = m.index();
  const ix = buildIndex({ areas: r.areas.map(a => ({ area_id: a.id, name: a.name })), devices: r.devices.map(d => ({ ...d, area_id: d.area })),
    entities: r.entities.map(e => ({ entity_id: e.id, device_id: e.device, area_id: e.area, entity_category: e.category, name: e.name, device_class: e.device_class, platform: e.platform, translation_key: e.key || null })), states: m.states });
  setLoggiaState({ index: ix, ent: {}, cfg: {}, resolved: null });
  try {
    const suivies = [{ haid: 'person.camille', name: 'Camille' }, { haid: 'person.alex', name: 'Alex' }, { haid: 'person.lea', name: 'Léa' }];
    const { marqueurs, sansPosition } = G.pointsCarte({ S: m.states, suivies, estTraceur, index: ix });
    assert.deepEqual(ids(marqueurs), ['person.camille', 'person.alex', 'device_tracker.velo']);
    assert.deepEqual(ids(sansPosition), ['person.lea']);
    assert.equal(marqueurs[1].zone, 'Travail');
    for (const p of marqueurs) assert.ok(Math.abs(p.lat - 48.8566) < 0.1 && Math.abs(p.lon - 2.3522) < 0.1, p.id + ' loin du point de la démo');
    assert.deepEqual(G.zonesCarte(m.states).map((z) => z.id), ['zone.home', 'zone.travail']);
  } finally { setLoggiaState({ index: null, ent: {}, cfg: {}, resolved: null }); }
});

test('les textes neufs, dans les six autres langues', async () => {
  const K = ['Voir sur la carte', 'Sans position', 'Aucune personne suivie ni aucun traceur n’a de position dans Home Assistant.',
    'Fond de carte indisponible : Home Assistant le fournit à partir de la version 2026.9.', 'Zoom avant', 'Zoom arrière'];
  for (const l of ['en', 'de', 'es', 'it', 'nl', 'pl']) {
    const T = (await import('../src/langues/' + l + '.js')).default;
    for (const k of K) assert.ok(typeof T[k] === 'string' && T[k] && T[k] !== k, l + ' : ' + k);
  }
});
