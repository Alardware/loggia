// ─────────────────────────────────────────────────
// Ce qui trompe à l'usage, seconde moitié (audit du 12/11, lot 2b, « fiches et
// calculs ») : neuf points déjà vérifiés par un relecteur — B20 à B27, B29.
//
// Joués quand c'est possible : les fonctions pures importées, les composants
// montés par le harnais des crochets (tests/crochets.mjs). Le fuseau est celui
// de Paris (B27 : la semaine du passage à l'heure d'été) — déjà posé par
// tests/environnement.mjs, redit ici pour un lancement sans lui.
// ─────────────────────────────────────────────────
process.env.TZ = 'Europe/Paris';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { monter, horlogeFausse, documentFaux } from './crochets.mjs';
import { consigneVoisine } from '../src/chauffageecran.js';
import { useOptimiste } from '../src/optimiste.js';
import { verdictsPlante } from '../src/objets.js';
import { dernierReleve, conseilsPlante, vuePlante } from '../src/plantes.js';
import { vueEauChaude } from '../src/eauchaude.js';
import { autoFamille } from '../src/autos.js';
import { journeeMesure } from '../src/mesuresfiche.js';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);
// B22 : la fiche d'un robot se monte sur la vue de sa carte (`useVueRobot`, App.jsx), exportée pour ce test seulement.
register('data:text/javascript,' + encodeURIComponent([
  'export async function load(url, ctx, next) {',
  "  if (!url.endsWith('/src/App.jsx?lot2b_fiches')) return next(url, ctx);",
  "  const r = await next(url.slice(0, -'?lot2b_fiches'.length), ctx);",
  "  return { ...r, source: String(r.source) + ';export { useVueRobot };' };",
  '}',
].join('\n')));
const { libellePeriode } = await import('../src/stats.js');
const { setLoggiaState } = await import('../src/state.js');
const FICHES = await import('../src/appareils/fiches.jsx');
const GAL = await import('../src/cartescustom/galerie.jsx');
const CarteEau = (await import('../src/carteeau.jsx')).default;
const RangeeSpotify = (await import('../src/spotifymedias.jsx')).default;
const APP = await import(new URL('../src/App.jsx?lot2b_fiches', import.meta.url).href);
const FR = await import('../src/ficherobot.jsx');
const RE = await import('../src/robotsetat.js');

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => readFileSync(join(RACINE, p), 'utf8').replace(/\r\n/g, '\n');
const fois = (texte, motif) => texte.split(motif).length - 1;
const tours = async (n = 8) => { for (let i = 0; i < n; i++) await Promise.resolve(); };
const nomDe = (e) => e && e.type && (e.type.name || e.type.displayName);

// ── B20 : plus de huit options ──────────────────────────────────────────────

const PROG = 'select.lave_linge_programme';
function ligneSelect(options, etat) {
  const appels = [];
  const hass = { states: { [PROG]: { entity_id: PROG, state: etat, attributes: { friendly_name: 'Lave-linge Programme', options } } },
    callService: (...args) => { appels.push(JSON.stringify(args)); return Promise.resolve(); } };
  return { m: monter(FICHES.LigneEntite, { id: PROG, hass }), appels };
}

test('B20 — au-delà de huit options, une ListeChoix qui les offre TOUTES et montre celle en cours', () => {
  const douze = Array.from({ length: 12 }, (_, i) => 'Programme ' + (i + 1));
  const { m, appels } = ligneSelect(douze, 'Programme 10');
  const liste = m.trouver(e => nomDe(e) === 'ListeChoix');
  assert.equal(liste.length, 1, 'douze options : une liste, pas des puces coupées à huit');
  assert.equal(m.trouver(e => e.type === 'button' && e.props['aria-pressed'] !== undefined).length, 0, 'plus de puces');
  const p = liste[0].props;
  assert.equal(p.value, 'Programme 10', 'le programme en cours (le 10e) se voit');
  assert.deepEqual(p.options.map(o => o.id), douze, 'les douze options, la 9e à la 12e comprises');
  assert.equal(p.label, 'Lave-linge Programme');
  p.onChange('Programme 12');
  m.rendre();
  assert.equal(appels.length, 1);
  assert.ok(appels[0].includes('select_option') && appels[0].includes('Programme 12'), appels[0]);
  assert.equal(m.trouver(e => nomDe(e) === 'ListeChoix')[0].props.value, 'Programme 12', 'le choix se montre d’avance');
});

test('B20 — huit options ou moins : les puces comme avant ; les préréglages gardent leurs puces', () => {
  const huit = Array.from({ length: 8 }, (_, i) => 'P' + (i + 1));
  const { m } = ligneSelect(huit, 'P3');
  assert.equal(m.trouver(e => nomDe(e) === 'ListeChoix').length, 0);
  const puces = m.trouver(e => e.type === 'button' && e.props['aria-pressed'] !== undefined);
  assert.deepEqual(puces.map(b => b.props.children), huit);
  assert.deepEqual(puces.filter(b => b.props['aria-pressed']).map(b => b.props.children), ['P3']);
  // Les préréglages d'un thermostat ne changent pas (tests/gladys_lot14_lecture.test.mjs épingle la chaîne).
  const f = lire('src/appareils/fiches.jsx');
  assert.ok(f.includes('<FichePuces options={presets.map('), 'les puces des préréglages sont parties');
  assert.ok(!f.includes('<select'), 'un <select> natif : tout menu est une ListeChoix');
});

// ── B21 : la courbe 24 h d'une mesure stable ────────────────────────────────

const H = 3600000;
const T0 = new Date(2026, 10, 13, 12, 0).getTime();
async function aMidi(f) {
  const vrai = Date.now;
  Date.now = () => T0;
  try { return await f(); } finally { Date.now = vrai; }
}

test('B21 — `jusquAMaintenant` prolonge la dernière valeur connue, au dessin', () => {
  const { jusquAMaintenant } = FICHES;
  assert.deepEqual(jusquAMaintenant([{ t: T0 - 24 * H, v: 100 }], T0), [{ t: T0 - 24 * H, v: 100 }, { t: T0, v: 100 }], 'un point : une ligne plate');
  const deux = [{ t: T0 - 24 * H, v: 100 }, { t: T0 - 9 * H, v: 99 }];
  assert.deepEqual(jusquAMaintenant(deux, T0).at(-1), { t: T0, v: 99 });
  assert.equal(deux.length, 2, 'la série lue n’est pas touchée');
  for (const x of [null, 'erreur', []]) assert.equal(jusquAMaintenant(x, T0), x, 'rien à prolonger : tel quel');
  const aJour = [{ t: T0, v: 3 }];
  assert.equal(jusquAMaintenant(aJour, T0), aJour, 'un dernier point à « maintenant » ne se double pas');
});

test('B21 — Courbe24 : un seul point se trace plat jusqu’au bord « maintenant » ; un changement à 3 h n’y est plus collé', () => aMidi(() => {
  const un = monter(FICHES.Courbe24, { points: [{ t: T0 - 24 * H, v: 100 }], unite: ' %' });
  const chemin = (m) => (m.trouver(e => e.type === 'path' && e.props.fill === 'none')[0] || { props: {} }).props.d;
  assert.equal(chemin(un), 'M0.0 21.0 L100.0 21.0', 'la ligne plate, au milieu');
  assert.ok(!un.texte().includes('Pas d'), un.texte());
  // 100 % jusqu'à 3 h du matin (9 h avant midi), puis 99 % : la chute aux 5/8 de l'axe, pas au bord droit.
  const deux = monter(FICHES.Courbe24, { points: [{ t: T0 - 24 * H, v: 100 }, { t: T0 - 9 * H, v: 99 }] });
  assert.equal(chemin(deux), 'M0.0 6.0 L62.5 36.0 L100.0 36.0');
  for (const [points, mot] of [[null, 'Chargement…'], ['erreur', 'Historique indisponible pour le moment'], [[], 'Pas d\'historique sur 24 h']]) {
    assert.ok(monter(FICHES.Courbe24, { points }).texte().includes(mot), mot);
  }
}));

test('B21 — la carte « Graphique 24 h » (CvHistory) aussi ; pas les barres de l’énergie', () => aMidi(() => {
  const st = (id, attributes) => ({ [id]: { entity_id: id, state: '99', attributes } });
  const pile = monter(GAL.CvHistory, { id: 'sensor.pile', hass: { states: st('sensor.pile', { unit_of_measurement: '%' }) }, demoPoints: [{ t: T0 - 24 * H, v: 99 }] });
  const ligne = pile.trouver(e => e.type === 'path' && e.props.fill === 'none')[0];
  assert.ok(ligne, 'un point : la courbe se trace');
  // La carte trace une valeur constante en bas de son cadre (34), comme avant : seule sa longueur change.
  assert.equal(ligne.props.d, 'M0.0 34.0 L100.0 34.0');
  assert.ok(pile.texte().includes('min 99 · max 99') && !pile.texte().includes('Pas d'), pile.texte());
  const kwh = monter(GAL.CvHistory, { id: 'sensor.compteur', hass: { states: st('sensor.compteur', { device_class: 'energy', unit_of_measurement: 'kWh' }) }, demoPoints: [{ t: T0 - 24 * H, v: 10 }] });
  assert.ok(kwh.texte().includes('Pas d\'historique sur 24 h'), 'l’énergie ne reçoit pas le point ajouté');
}));

test('B21 — `journeeMesure` : la courbe va jusqu’à maintenant ; « depuis » et « min · max » lisent les points tels quels', () => {
  const un = journeeMesure([{ t: T0 - 24 * H, v: 20 }], { cle: 'temp', uniteTable: 'C', ecrite: '°C', zi: -1, maintenant: T0 });
  assert.ok(un.courbe, 'un point : une courbe');
  assert.match(un.courbe.ligne, /^M0 [\d.]+L400 [\d.]+$/, un.courbe.ligne);
  assert.equal(un.minmax, null, '« min · max » sur les points lus : un seul, rien');
  const deux = journeeMesure([{ t: T0 - 24 * H, v: 20 }, { t: T0 - 9 * H, v: 21 }], { cle: 'temp', uniteTable: 'C', ecrite: '°C', zi: -1, maintenant: T0 });
  assert.match(deux.courbe.ligne, /L250 [\d.]+L400 [\d.]+$/, 'la ligne continue de 3 h à maintenant : ' + deux.courbe.ligne);
  assert.equal(journeeMesure([], { cle: 'temp', maintenant: T0 }).courbe, null, 'rien de lu : rien de dessiné');
});

// ── B22 : un planning de robot refusé ───────────────────────────────────────

const ASP = 'vacuum.aspirateur';
const TR = new Date(2026, 9, 17, 18, 20).getTime();
const SR = TR / 1000;
const ETAT_ROBOTS = () => ({
  maintenant: SR, meteo: null, journal: [], erreurs: {}, en_cours: {}, passages: [],
  config: { plannings: [{ id: 'semaine', robot: ASP, heure: '09:30', jours: [0, 1, 2, 3, 4], zones: [], actif: true }],
    robots: { [ASP]: { calme: { actif: true, debut: '22:00', fin: '07:00' }, pluie: { actif: false } } } },
});
function maisonRobot() {
  const depuis = new Date(2026, 9, 17, 16, 40).toISOString();
  setLoggiaState({ index: { entityMeta: new Map([[ASP, { deviceId: 'd1', device: 'Aspirateur', platform: 'ecovacs' }]]), deviceMeta: new Map(), areaList: [{ name: 'Salon', entities: [ASP] }], areaNameOf: () => 'Salon', services: null }, ent: {}, cfg: {}, resolved: {} });
  const ws = [], rejets = [];
  const w = { ws, rejets, lecture: () => Promise.resolve(ETAT_ROBOTS()) };
  const serveur = {
    callWS: (msg) => {
      if (msg.type === 'loggia/robots/etat') { ws.push(msg); return w.lecture(); }
      return new Promise((ok, ko) => ws.push({ ...msg, ok, ko }));
    },
  };
  RE.reglerRobotsEtat({ hass: serveur, signaler: (e) => rejets.push(e) });
  w.hass = () => ({ ...serveur, states: { [ASP]: { entity_id: ASP, state: 'docked', last_changed: depuis, last_updated: depuis, attributes: { friendly_name: 'Aspirateur', battery_level: 92, supported_features: 8828 } } },
    callApi: () => Promise.resolve([]), callService: () => Promise.resolve() });
  return w;
}
async function avecRobot(fn) {
  const h = horlogeFausse(), d = documentFaux();
  const vraiNow = Date.now;
  h.installer(); d.installer();
  globalThis.document.documentElement = { classList: { contains: () => false } };
  Date.now = () => TR;
  try { return await fn(); } finally { Date.now = vraiNow; h.restaurer(); d.restaurer(); setLoggiaState({ index: null, ent: {}, cfg: {}, resolved: null }); }
}
const attendre = () => new Promise(r => setImmediate(r));
async function planningRobot(w) {
  const vue = monter((p) => APP.useVueRobot(p.hass, p.id, null, true, { rapide: true }), { hass: w.hass(), id: ASP });
  await attendre();
  vue.rendre();
  const m = monter(FR.default, { hass: w.hass(), idRobot: ASP, domaine: 'vacuum', vue: vue.arbre, plaque: null, sousNom: null, epingle: null, onFiche: () => {} });
  await attendre();
  m.rendre();
  m.trouver(e => nomDe(e) === 'FicheOnglets')[0].props.onChoisir('planning'); m.rendre();
  const el = m.trouver(e => nomDe(e) === 'OngletPlanning')[0];
  assert.ok(el, 'l’onglet Planning ne se montre pas');
  return monter(el.type, el.props);
}
const pasHeure = (o, nom) => o.trouver(e => nomDe(e) === 'PasHeure' && e.props.nom === nom)[0];
const calmeDuMagasin = () => RE.lireEtatRobots().etat.config.robots[ASP].calme;
const lectures = (w) => w.ws.filter(x => x.type === 'loggia/robots/etat').length;

test('B22 — un planning refusé : la configuration d’avant revient au magasin partagé, puis le serveur est relu', () => avecRobot(async () => {
  const w = maisonRobot();
  const o = await planningRobot(w);
  o.appuyer(pasHeure(o, 'Début plus tard'));
  assert.equal(calmeDuMagasin().debut, '22:30', 'l’avance est posée au magasin (la carte de l’Accueil la lit aussi)');
  // La relecture échoue elle aussi (une coupure) : seule la remise en place peut ramener 22:00.
  w.lecture = () => Promise.reject({ code: 'unknown_error', message: 'coupé' });
  const avant = lectures(w);
  w.ws.find(x => x.type === 'loggia/robots/config').ko({ code: 'invalid_format', message: 'non' });
  await attendre();
  assert.equal(calmeDuMagasin().debut, '22:00', 'la ligne refusée restait affichée comme enregistrée jusqu’au relevé suivant');
  assert.ok(lectures(w) > avant, 'le serveur n’est pas relu après le refus');
}));

test('B22 — une écriture plus récente que le refus n’est pas effacée', () => avecRobot(async () => {
  const w = maisonRobot();
  const o = await planningRobot(w);
  o.appuyer(pasHeure(o, 'Début plus tard'));
  o.appuyer(pasHeure(o, 'Fin plus tôt'));
  const ecrits = w.ws.filter(x => x.type === 'loggia/robots/config');
  assert.equal(ecrits.length, 2);
  assert.equal(calmeDuMagasin().fin, '06:30');
  w.lecture = () => Promise.reject({ code: 'unknown_error', message: 'coupé' });
  ecrits[0].ko({ code: 'invalid_format', message: 'non' });
  await attendre();
  assert.equal(calmeDuMagasin().fin, '06:30', 'le refus de la première écriture a effacé la seconde, encore en vol');
}));

// ── B23 : Spotify, « Ajouter par lien » refusé ──────────────────────────────

const SPOTIFY = 'media_player.spotify';
const LIEN = 'https://open.spotify.com/playlist/0SlqjJVYUJSNpMjVfYmr7X';
function feuilleSpotify(issue, { ajoutees = null } = {}) {
  setLoggiaState({ index: { entityMeta: new Map([[SPOTIFY, { platform: 'spotify' }]]), deviceMeta: new Map() }, ent: {}, cfg: {}, resolved: null, save: () => issue });
  const hass = { states: { [SPOTIFY]: { entity_id: SPOTIFY, state: 'idle', attributes: {} } }, user: { is_admin: true } };
  const r = monter(RangeeSpotify, { hass });
  r.appuyer(r.trouver(e => e.props && e.props.className === 'o-spotify-ajout')[0]);
  const el = r.trouver(e => nomDe(e) === 'FeuilleAjoutSpotify')[0];
  assert.ok(el, 'la feuille « Ajouter par lien » ne s’ouvre pas');
  const fermetures = [];
  const f = monter(el.type, ajoutees ? { ...el.props, ajoutees } : el.props);
  const dedans = () => f.arbre.props.children(() => fermetures.push(1));
  const trouver = (pred) => { const out = []; const aller = (n) => { if (n == null || typeof n !== 'object') return; if (Array.isArray(n)) { n.forEach(aller); return; } if (pred(n)) out.push(n); aller(n.props && n.props.children); }; aller(dedans()); return out; };
  const champ = (nom) => trouver(e => e.type === 'input' && e.props['aria-label'] === nom)[0];
  return { f, fermetures, trouver, champ };
}
const finSpotify = () => setLoggiaState({ index: null, ent: {}, cfg: {}, resolved: null, save: null });
async function ajouter(s) {
  s.champ('Lien Spotify').props.onChange({ target: { value: LIEN } }); s.f.rendre();
  s.champ('Nom de la playlist').props.onChange({ target: { value: 'Dimanche' } }); s.f.rendre();
  s.trouver(e => e.type === 'button' && e.props.children === 'Ajouter')[0].props.onClick();
  await tours(); s.f.rendre();
}
const alerte = (s) => s.trouver(e => e.props && e.props.role === 'alert').map(e => e.props.children).join(' ');

test('B23 — un ajout refusé (`cfgSet` rend false) : l’erreur dans la feuille, qui reste ouverte', async () => {
  try {
    const s = feuilleSpotify(false);
    await ajouter(s);
    assert.equal(s.fermetures.length, 0, 'la feuille se fermait comme sur un succès');
    assert.equal(alerte(s), 'Enregistrement impossible.');
  } finally { finSpotify(); }
});

test('B23 — une coupure (`null`, le lot repartira) et un succès ferment la feuille, sans erreur', async () => {
  for (const issue of [null, true]) {
    try {
      const s = feuilleSpotify(issue);
      await ajouter(s);
      assert.equal(s.fermetures.length, 1, String(issue));
      assert.equal(alerte(s), '', String(issue));
    } finally { finSpotify(); }
  }
});

test('B23 — « Retirer » refusé le dit aussi', async () => {
  try {
    const s = feuilleSpotify(false, { ajoutees: [{ t: 'Ma liste', i: 'spotify:playlist:0SlqjJVYUJSNpMjVfYmr7X' }] });
    s.trouver(e => e.type === 'button' && e.props['aria-label'] === 'Retirer Ma liste')[0].props.onClick();
    await tours(); s.f.rendre();
    assert.equal(alerte(s), 'Enregistrement impossible.');
  } finally { finSpotify(); }
});

// ── B24 : les plantes ───────────────────────────────────────────────────────

test('B24 — le verdict juge la valeur ARRONDIE comme elle s’écrit', () => {
  assert.equal(verdictsPlante({ hum: 14.6 }).hum, 'ok', '« 15 % » à l’écran : pas « À arroser »');
  assert.equal(verdictsPlante({ hum: 14.4 }).hum, 'sec', '« 14 % » : à arroser');
  assert.equal(verdictsPlante({ hum: 70.4 }).hum, 'ok', '« 70 % » : pas « Sol très humide »');
  assert.equal(verdictsPlante({ hum: 70.6 }).hum, 'humide');
  assert.equal(verdictsPlante({ temp: 9.96 }).temp, 'ok', '« 10,0 °C » : pas froid');
  assert.equal(verdictsPlante({ temp: 9.94 }).temp, 'froid');
  assert.equal(verdictsPlante({ temp: 32.04 }).temp, 'ok');
  assert.equal(verdictsPlante({ lux: 499.6 }).lux, 'ok', '« 500 lx » : la lumière ne presse pas');
  assert.equal(verdictsPlante({ cond: 2000.4 }).cond, 'ok');
  // Les valeurs entières d'avant ne bougent pas.
  assert.deepEqual(verdictsPlante({ hum: 14, temp: 33, lux: 499, cond: 2001 }), { hum: 'sec', temp: 'chaud', lux: 'faible', cond: 'trop', presse: ['arroser', 'lumiere', 'temperature'] });
  // La phrase absurde n'existe plus : la carte, la fiche et les conseils sont alignés.
  const p = { hum: 14.6, temp: 9.96, lux: 499.6, luxJour: 499.6 };
  assert.deepEqual(conseilsPlante(p), []);
  assert.ok(!conseilsPlante({ hum: 14.6, lux: 84 }).some(c => c.includes('15 %, il lui en faut au moins 15 %')));
  assert.notEqual(vuePlante({ hum: 14.6 }).phrase, 'À arroser');
});

test('B24 — `dernierReleve` ne garde qu’une ligne dont la moyenne est un nombre', () => {
  const r = { 'sensor.sol': [{ start: 1, end: 2, mean: 31 }, { start: 2, end: 3, mean: null }, { start: 3, end: 4, mean: '' }], 'sensor.pile': [{ start: 1, end: 2, mean: 6 }, { start: 2, end: 3, mean: null }] };
  assert.deepEqual(dernierReleve(r, 'sensor.sol', 'sensor.pile'), { quand: 2, sol: 31, pile: 6 }, 'une heure sans relevé passait pour « sol 0 % »');
  assert.equal(dernierReleve({ 'sensor.sol': [{ start: 1, end: 2, mean: null }] }, 'sensor.sol', null), null, 'aucun relevé : rien ne se devine');
  assert.deepEqual(dernierReleve({ 'sensor.sol': [{ start: 1, end: 2, mean: 12.4 }] }, 'sensor.sol', null), { quand: 2, sol: 12, pile: null });
});

// ── B25 : un chauffe-eau sans mesure ────────────────────────────────────────

const BALLON = 'water_heater.ballon';
const ballon = (etat, attrs = {}) => ({ [BALLON]: { entity_id: BALLON, state: etat, attributes: {
  friendly_name: 'Ballon', temperature: 55, min_temp: 40, max_temp: 65, operation_mode: etat, operation_list: ['off', 'eco'], supported_features: 1 | 2, ...attrs } } });

test('B25 — sans mesure, la carte ne donne plus la consigne pour la température de l’eau', () => {
  assert.equal(vueEauChaude({ id: BALLON, S: ballon('eco') }).chiffre, null, 'la consigne passait pour « 55° Eau »');
  assert.equal(vueEauChaude({ id: BALLON, S: ballon('off') }).chiffre, null, 'à l’arrêt non plus');
  assert.equal(vueEauChaude({ id: BALLON, S: ballon('eco', { current_temperature: 52.4 }) }).chiffre, 52, 'mesurée : arrondie');
  for (const chip of [false, true]) {
    const html = renderToStaticMarkup(createElement(CarteEau, { id: BALLON, hass: { states: ballon('eco') }, chip, onOpen: () => {} }));
    assert.ok(!html.includes('eau 55°'), 'le nom lu dit encore « eau 55° »');
    assert.ok(!html.includes('>Eau<'), 'le chiffre nommé « Eau » est encore là');
    assert.ok(html.includes('→ 55°'), 'la consigne reste dite dans la phrase');
  }
  const mesuree = renderToStaticMarkup(createElement(CarteEau, { id: BALLON, hass: { states: ballon('eco', { current_temperature: 52 }) }, onOpen: () => {} }));
  assert.ok(mesuree.includes('eau 52°') && mesuree.includes('>Eau<'), 'témoin : une eau mesurée se dit');
});

// ── B26 : les automatisations rangées par mot entier ────────────────────────

test('B26 — chaque famille se cherche comme MOT entier, ses pluriels compris (46 cas du relecteur)', () => {
  const attendus = [
    // tests/autos.test.mjs, à l'identique
    ['Lumière salon', 'Lumières'], ['Lumières cuisine', 'Lumières'], ['LUMIERE couloir', 'Lumières'], ['Force veilleuse Lino', 'Lumières'],
    ['Allume lampe entrée', 'Lumières'], ['Coupe le chauffage la nuit', 'Climat'], ['Le soir, fermeture des volets', 'Volets'],
    ['Départ maison → alarme', 'Sécurité'], ['Notification si la porte du garage reste ouverte', 'Ouvrants'], ['Alarme déclenchée : lumières à fond', 'Sécurité'],
    ['Poubelles jaunes', 'Poubelle'], ['Poubelle verte', 'Poubelle'], ['Lance le café', 'Café'], ['', 'Divers'], ['   ', 'Divers'], [null, 'Divers'],
    // les pièges : une sous-chaîne n'est plus une famille
    ['Spotify le matin', 'Médias'], ['Importe les relevés', 'Importe'], ['Importer les relevés', 'Importer'], ['Portail', 'Sécurité'], ['Spot du jardin', 'Lumières'],
    ['Porte du garage', 'Ouvrants'], ['Transport', 'Transport'], ['Rapport du matin', 'Réveil'], ['Restore les scènes', 'Restore'], ['Supporte la charge', 'Supporte'],
    // pluriels, élisions, tirets, accents
    ['Spots terrasse', 'Lumières'], ['Rideaux salon', 'Volets'], ['Panneaux solaires', 'Énergie'], ['Heures creuses ballon', 'Énergie'], ['Heure creuse ballon', 'Énergie'],
    ['Préviens-moi', 'Notifications'], ['Prévenir si fuite', 'Notifications'], ['Rentrée maison', 'Présence'], ['Absente longtemps', 'Présence'], ['L’éclairage du jardin', 'Lumières'],
    ['Brise-soleil sud', 'Volets'], ['Pompe à chaleur nuit', 'Climat'], ['TV du salon', 'Médias'], ['LED escalier', 'Lumières'], ['Fenêtres ouvertes', 'Ouvrants'],
    ['Clim bureau', 'Climat'], ['Granulés poêle', 'Climat'], ['Arrivées', 'Présence'], ['Goutte-à-goutte potager', 'Arrosage'], ['Bonne nuit', 'Réveil'],
  ];
  assert.equal(attendus.length, 46);
  const ecarts = attendus.filter(([nom, att]) => autoFamille(nom) !== att).map(([nom, att]) => `« ${nom} » : ${autoFamille(nom)} au lieu de ${att}`);
  assert.deepEqual(ecarts, []);
});

test('B26 — les formes dérivées que la sous-chaîne rangeait juste le restent (relecture du 13/11)', () => {
  /* Le mot entier corrigeait « Spotify » et « Importe », mais perdait ce que l'ancienne recherche attrapait à raison :
   * comparés un à un sur une centaine de noms, six écarts de ce genre. Ils s'écrivent en clair. */
  const derives = [
    ['Verrouiller la porte la nuit', 'Sécurité'], ['Verrouillage automatique', 'Sécurité'], ['Déverrouillage au retour', 'Sécurité'],
    ['Climatiseur du salon', 'Climat'], ['Climat du salon', 'Climat'], ['Vanne thermostatique', 'Climat'],
    ['Réveiller la maison', 'Réveil'], ['Réveille les enfants', 'Réveil'], ['Matinée tranquille', 'Réveil'],
    ['Alerter si fuite', 'Notifications'], ['Rappeler les poubelles', 'Notifications'], ['Notifier le voisin', 'Notifications'],
    ['Ils rentrent du travail', 'Présence'], ['Le lave-linge consomme trop', 'Énergie'],
  ];
  for (const [nom, famille] of derives) assert.equal(autoFamille(nom), famille, '« ' + nom + ' »');
  // Et les faux amis restent dehors.
  for (const nom of ['Portefeuille crypto', 'Console de jeux', 'Storekeeper']) assert.notEqual(['Ouvrants', 'Énergie', 'Volets'].indexOf(autoFamille(nom)) >= 0, true, '« ' + nom + ' »');
});

// ── B27 : la semaine du changement d'heure ──────────────────────────────────

test('B27 — la fin d’une semaine se compte en jour civil : « 23 – 29 mars », pas « 23 – 28 mars »', () => {
  // Le fuseau est bien celui de Paris : le 29/03/2026 passe à l'heure d'été.
  assert.notEqual(new Date(2026, 2, 28, 12).getTimezoneOffset(), new Date(2026, 2, 30, 12).getTimezoneOffset(), 'le test ne tourne pas à l’heure de Paris');
  assert.equal(libellePeriode('semaine', 0, new Date(2026, 2, 25, 12).getTime(), 'fr-FR'), '23 – 29 mars');
  assert.equal(libellePeriode('semaine', 0, new Date(2026, 9, 21, 12).getTime(), 'fr-FR'), '19 – 25 octobre', 'l’automne, déjà juste');
  assert.equal(libellePeriode('semaine', 0, new Date(2026, 8, 30, 12).getTime(), 'fr-FR'), '28 sept. – 4 oct.', 'une semaine à cheval sur deux mois');
  assert.equal(libellePeriode('semaine', 1, new Date(2026, 3, 1, 12).getTime(), 'fr-FR'), '23 – 29 mars', 'la semaine d’avant, vue d’après');
});

// ── B29 : appuis rapides sur + / − du chauffage ─────────────────────────────

/* La chronologie du relecteur (preuve_b29.mjs), dans le motif EXACT des cartes et fiches de chauffage :
 * le cran suivant part de la valeur AFFICHÉE, l'avance d'abord. HA dit 20 ; trois appuis sur « + ». */
function jouer(etapes, avecAtteint) {
  const h = horlogeFausse(); h.installer();
  try {
    const envoyes = [], ecrans = [];
    function Carte({ reel, etat }) {
      const atteinte = avecAtteint ? (v) => Number(v) === Number(reel) : null;
      const [ov, setOv] = useOptimiste([reel, etat].join('|'), undefined, atteinte);
      const target = ov != null ? ov : reel;
      const setT = (d) => { const v = consigneVoisine(target, d, {}, 'C') ?? target + d; envoyes.push(v); setOv(v); };
      return { type: 'div', props: { 'data-affiche': target, children: [{ type: 'button', props: { id: 'plus', onClick: () => setT(1) } }] } };
    }
    const m = monter(Carte, { reel: 20, etat: 'heat' });
    const affiche = () => m.trouver(e => e.props && e.props['data-affiche'] !== undefined)[0].props['data-affiche'];
    for (const [geste, x] of etapes) {
      if (geste === '+') m.appuyer(m.trouver(e => e.props && e.props.id === 'plus')[0]);
      if (geste === 'ha') m.proprietes({ reel: x });
      if (geste === 'ms') { h.avancer(x); m.rendre(); }
      ecrans.push(affiche());
    }
    return { envoyes, ecrans };
  } finally { h.restaurer(); }
}

test('B29 — trois appuis, deux échos entre eux : on finit à 21,5, l’écran ne recule pas', () => {
  const chrono = [['+'], ['+'], ['ha', 20.5], ['+'], ['ha', 21], ['ha', 21.5]];
  const r = jouer(chrono, true);
  assert.deepEqual(r.envoyes, [20.5, 21, 21.5], 'le troisième appui repartait de l’écho du premier');
  assert.deepEqual(r.ecrans, [20.5, 21, 21, 21.5, 21.5, 21.5], 'l’écran revenait à 20,5 entre deux appuis');
  // Témoin : sans `atteint`, le hook fait exactement ce qu'il faisait — 21 part deux fois.
  assert.deepEqual(jouer(chrono, false).envoyes, [20.5, 21, 21]);
});

test('B29 — une avance jamais atteinte tombe au filet de 6 s ; atteinte, elle tombe tout de suite', () => {
  const jamais = jouer([['+'], ['ha', 20.4], ['ms', 5999], ['ms', 1]], true);
  assert.deepEqual(jamais.ecrans, [20.5, 20.5, 20.5, 20.4], 'un appareil qui arrondit autrement : la vérité au filet');
  const atteinte = jouer([['+'], ['ha', 20.5], ['ha', 19]], true);
  assert.deepEqual(atteinte.ecrans, [20.5, 20.5, 19], 'une fois atteinte, la maison reprend la main');
});

test('B29 — les six consignes de température passent leur juge à `useOptimiste`', () => {
  const opt = lire('src/optimiste.js');
  assert.ok(opt.includes('export function useOptimiste(reel, delai = OPTIMISTE_MS, atteint = null) {'));
  const parFichier = { 'src/cartes/chauffage.jsx': 3, 'src/appareils/fiches.jsx': 1, 'src/fichechauffage.jsx': 2 };
  for (const [f, n] of Object.entries(parFichier)) {
    assert.equal((lire(f).match(/useOptimiste\([^;]*, undefined, \w+\);/g) || []).length, n, f);
  }
  const ch = lire('src/fichechauffage.jsx');
  assert.ok(ch.includes('const [ovT, poserOvT] = useOptimiste(consigneLue, undefined, avanceAtteinte);'));
  assert.ok(ch.includes('const [ovT, poserOvT] = useOptimiste(JSON.stringify(tLues), undefined, tAtteintes);'));
  assert.equal(fois(lire('src/cartes/chauffage.jsx'), 'undefined, zoneAtteinte);'), 2, 'la carte ET la fiche d’une zone décrite');
});
