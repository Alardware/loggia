/* Un `moisture` calculé n'est pas une fuite — l'écran suit la règle du serveur (chantier Capteurs, étapes 2 et 3, tâche 12 ; ADR 0022 du 16/10, § 19.4).
 *
 * Ce qui est garanti ici :
 *  - la règle (attention.js, pur) : `template` et `group` sont calculés, la même liste que `alertes.py` ; une plateforme inconnue reste une fuite ;
 *  - « À surveiller » (`pointsAttention`) : un « Besoin Eau » de modèle allumé ne fait pas de point ; un vrai détecteur de fuite, oui ; un
 *    binaire que le registre ne connaît pas garde la règle du préfixe de la base d'une plante ;
 *  - « En ce moment » (`deriveNotifs`, App.jsx) : la même exclusion, par la plateforme de l'index (`plateformeDe`, state.js) ;
 *  - Paramètres › Alertes compte les détecteurs de fuite sans les modèles ;
 *  - la démo : le « Besoin eau » du Basilic (un `template`) allumé ne dit jamais « Fuite », la fuite sous l'évier, si.
 * `deriveNotifs` vit dans App.jsx : sous `?fuite`, un crochet de chargement lui ajoute un export. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';

import { area, device, entity, state, states, indexOf } from './fixtures.mjs';
import { fuiteCalculee, pointsAttention } from '../src/attention.js';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);
register('data:text/javascript,' + encodeURIComponent([
  'export async function load(url, ctx, next) {',
  "  if (!url.endsWith('/src/App.jsx?fuite')) return next(url, ctx);",
  "  const r = await next(url.slice(0, -'?fuite'.length), ctx);",
  "  return { ...r, source: String(r.source) + ';export { deriveNotifs };' };",
  '}',
].join('\n')));
const { setLoggiaState, plateformeDe } = await import('../src/state.js');
const F = await import(new URL('../src/App.jsx?fuite', import.meta.url).href);
const { maisonCapteursDemo } = await import('../src/demo.js');
const { registresDuComposant } = await import('../src/discovery.js');
const { MONOLITHE } = await import('./monolithe.mjs');
const lire = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
// ASSERTION MODIFIÉE (ADR 0283) : App.jsx et ce qui en sort — l'Accueil n'est plus dans App.jsx.
const APP = MONOLITHE;
const PAR = lire('../src/views/parametres.jsx');
const ATT = lire('../src/attention.js');
const PY = lire('../custom_components/loggia/alertes.py');

/* Une cuisine : un vrai détecteur de fuite sous l'évier (Zigbee2MQTT), le « Besoin Eau » d'une plante en modèle, un groupe de fuites, et un binaire
 * de classe `moisture` écrit à la main (YAML sans `unique_id`), que le registre ne connaît pas. Tous allumés. */
function maisonFuites() {
  const bin = (id, dev, plus = {}) => ({ ...entity(id, { device: dev }), device_class: 'moisture', ...plus });
  const on = (id, nom) => state(id, 'on', { friendly_name: nom, device_class: 'moisture' });
  return {
    areas: [area('cuisine', 'Cuisine')],
    devices: [device('d_evier', 'Détecteur de fuite évier', 'cuisine')],
    entities: [bin('binary_sensor.fuite_evier', 'd_evier', { platform: 'mqtt' }), bin('binary_sensor.dracaena_besoin_eau', null, { platform: 'template' }), bin('binary_sensor.fuites_maison', null, { platform: 'group' })],
    floors: [],
    states: states(on('binary_sensor.fuite_evier', 'Fuite sous l’évier'), on('binary_sensor.dracaena_besoin_eau', 'Dracaena besoin eau'), on('binary_sensor.fuites_maison', 'Fuites de la maison'), on('binary_sensor.cave_humide', 'Cave humide')),
    energyPrefs: null,
  };
}
const avec = (fx, cfg, f) => {
  setLoggiaState({ index: indexOf(fx), ent: {}, cfg: { loggia_rooms: [{ room: 'Cuisine' }], ...cfg }, resolved: null });
  try { return f(fx.states); } finally { setLoggiaState({ index: null, ent: {}, cfg: {}, resolved: null }); }
};

test('ADR 0022 : la règle — template et group sont calculés, la même liste que le serveur ; une plateforme inconnue reste une fuite', () => {
  assert.deepEqual(['template', 'group', 'mqtt', 'zha', null, undefined, ''].map(fuiteCalculee), [true, true, false, false, false, false, false]);
  const serveur = /PLATEFORMES_CALCULEES = \(([^)]*)\)/.exec(PY)[1].match(/"(\w+)"/g).map(x => x.replace(/"/g, ''));
  const ecran = /const PLATEFORMES_CALCULEES = \[([^\]]*)\];/.exec(ATT)[1].match(/'(\w+)'/g).map(x => x.replace(/'/g, ''));
  assert.deepEqual(ecran, serveur, 'l’écran et le composant lisent la même liste');
});

test('« À surveiller » : un « Besoin Eau » de modèle ou un groupe ne fait pas de point ; le vrai détecteur, si ; sans plateforme connue, la règle du préfixe de la plante', () => {
  const fx = maisonFuites();
  const S = fx.states;
  const points = (ctx) => pointsAttention({ S, ...ctx }).filter(p => p.cle.indexOf('surete:moisture:') === 0).map(p => p.haid);
  assert.deepEqual(points({}), ['binary_sensor.cave_humide', 'binary_sensor.dracaena_besoin_eau', 'binary_sensor.fuite_evier', 'binary_sensor.fuites_maison'], 'sans index ni plantes, toute classe moisture allumée est une fuite — comme avant');
  avec(fx, {}, () => {
    assert.deepEqual(points({ plateforme: plateformeDe }), ['binary_sensor.cave_humide', 'binary_sensor.fuite_evier'], 'le modèle et le groupe sont calculés ; le YAML sans registre reste une fuite');
    assert.deepEqual(points({ plateforme: plateformeDe, plantes: ['binary_sensor.cave'] }), ['binary_sensor.fuite_evier'], 'et la base d’une plante configurée l’écarte encore');
  });
  assert.deepEqual(pointsAttention({ S, plateforme: 'x' }).filter(p => p.cle.indexOf('surete:moisture:') === 0).length, 4, 'une plateforme qui n’est pas une fonction : ignorée');
  const vrai = pointsAttention({ S, plateforme: () => 'mqtt' }).find(p => p.haid === 'binary_sensor.fuite_evier');
  assert.deepEqual([vrai.niveau, vrai.titre, vrai.sous, vrai.vue], ['alerte', 'Fuite détectée', 'Fuite sous l’évier', 'securite']);
});

test('« En ce moment » (deriveNotifs) et l’Accueil : la même exclusion, par la plateforme de l’index', () => avec(maisonFuites(), {}, (S) => {
  const notifs = F.deriveNotifs({ states: S }).filter(n => n.k.indexOf('surete:') === 0).map(n => n.k.slice(7));
  assert.deepEqual(notifs, ['binary_sensor.fuite_evier', 'binary_sensor.cave_humide'], 'le modèle et le groupe ne sont pas des fuites ; le YAML inconnu du registre, si (l’ordre des états)');
  assert.ok(APP.includes("    if (a.device_class === 'moisture' && (estPlante(id) || fuiteCalculee(plateformeDe(id)))) continue;"), '« En ce moment »');
  // ASSERTION MODIFIÉE (audit du 19/10, M14) : l'Accueil passe aussi les entités masquées — un groupe et une entité masquée n'y comptent pas.
  // ASSERTION MODIFIÉE (30/10, G3-E4) : l'Accueil passe aussi la couleur Tempo du lendemain, après la plateforme et le masque.
  assert.ok(APP.includes("    plantes: plantsCfg().map(p => p.base).filter(Boolean),\n    // Un `moisture` calculé n'est pas une fuite (ADR 0022, 16/10) : la plateforme, lue dans l'index ; un groupe, une entité masquée n'y comptent pas (M14).\n    plateforme: plateformeDe, masque: masqueDe,\n"), 'l’Accueil passe la plateforme à « À surveiller »');
  assert.equal(plateformeDe('binary_sensor.fuite_evier'), 'mqtt');
  assert.equal(plateformeDe('binary_sensor.cave_humide'), null, 'inconnue du registre : null');
}));

test('Paramètres › Alertes compte les détecteurs de fuite sans les modèles — le compte dit ce qui alerte', () => {
  assert.ok(PAR.includes("import { fuiteCalculee } from '../attention.js';") && PAR.includes('LOGGIA_INDEX, enHaids, plateformeDe, medCompanion,'), 'la règle et la plateforme, importées');
  /* ASSERTION MODIFIÉE (audit du 19/10, M1) : le compte passe par `detecteursAlertes`, qui écarte aussi le besoin d'eau d'une plante
   * de `loggia_plants` — la règle du serveur et de l'Accueil. Le moisture calculé y est toujours écarté par `fuiteCalculee`. */
  assert.ok(PAR.includes("  const capteurs = (classes) => detecteursAlertes(S, classes, { plateforme: plateformeDe, plantes });"), 'le compte des détecteurs ne passe plus par la règle commune');
  assert.ok(PAR.includes("    return !(dc === 'moisture' && (fuiteCalculee(plateforme(id)) || estPlante(id)));"), 'le compte des détecteurs écarte un moisture calculé');
  assert.ok(PAR.includes("const ALERTES_CLASSES = { fumee: ['smoke'], gaz: ['gas'], co: ['carbon_monoxide'], fuite: ['moisture'] };"), 'la table des classes ne bouge pas');
});

test('la démo : le « Besoin eau » du Basilic (un template) allumé ne dit jamais « Fuite » ; la fuite sous l’évier, si', async () => {
  const m = maisonCapteursDemo({ quand: new Date(2026, 9, 15, 20, 40).getTime() });
  const registres = await registresDuComposant({ callWS: async () => ({ index: m.index() }) });
  const S = { ...m.states, 'binary_sensor.basilic_besoin_eau': { ...m.states['binary_sensor.basilic_besoin_eau'], state: 'on' }, 'binary_sensor.fuite_evier': { ...m.states['binary_sensor.fuite_evier'], state: 'on' } };
  setLoggiaState({ index: indexOf({ ...registres, states: S }), ent: {}, cfg: { loggia_rooms: [{ room: 'Cuisine' }], loggia_plants: [] }, resolved: null });
  try {
    assert.equal(plateformeDe('binary_sensor.basilic_besoin_eau'), 'template');
    const points = pointsAttention({ S, plateforme: plateformeDe }).filter(p => p.cle.indexOf('surete:moisture:') === 0).map(p => p.haid);
    assert.deepEqual(points, ['binary_sensor.fuite_evier']);
    assert.deepEqual(F.deriveNotifs({ states: S }).filter(n => n.k.indexOf('surete:') === 0).map(n => n.m), ['Fuite détectée · Fuite sous l’évier']);
  } finally { setLoggiaState({ index: null, ent: {}, cfg: {}, resolved: null }); }
});
