/* La sûreté lit l'APPAREIL qui porte un binaire, pas seulement sa classe — l'écran suit le serveur (31/10, ADR 0305).
 *
 * Ce qui est garanti ici :
 *  - la règle (attention.js, pur) : la pluie d'une tondeuse ou d'un aspirateur n'est pas une fuite ; une fumée ou un monoxyde porté
 *    par une caméra est une alarme ENTENDUE ; les deux listes sont celles de `voisins.py` ;
 *  - `voisinsDe` (state.js) : les domaines de l'appareil, lus dans l'index ; [] sans appareil ;
 *  - « À surveiller » (`pointsAttention`) : pas de « Fuite » pour la pluie ; « Alarme entendue par une caméra », ambre, pour le CO
 *    entendu ; le vrai détecteur de fuite et le vrai détecteur de monoxyde, inchangés ;
 *  - « En ce moment » (`deriveNotifs`) : la même chose ;
 *  - le carnet de l'eau (`detecteursEau`) ne compte pas la pluie de la tondeuse.
 * `deriveNotifs` vit dans App.jsx : sous `?voisins`, un crochet de chargement lui ajoute un export. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';

import { area, device, entity, state, states, indexOf } from './fixtures.mjs';
import { pluieDeRobot, entendueParCamera, pointsAttention } from '../src/attention.js';
import { detecteursEau } from '../src/eau.js';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);
register('data:text/javascript,' + encodeURIComponent([
  'export async function load(url, ctx, next) {',
  "  if (!url.endsWith('/src/App.jsx?voisins')) return next(url, ctx);",
  "  const r = await next(url.slice(0, -'?voisins'.length), ctx);",
  "  return { ...r, source: String(r.source) + ';export { deriveNotifs };' };",
  '}',
].join('\n')));
const { setLoggiaState, plateformeDe, voisinsDe } = await import('../src/state.js');
const F = await import(new URL('../src/App.jsx?voisins', import.meta.url).href);
const PY = readFileSync(new URL('../custom_components/loggia/voisins.py', import.meta.url), 'utf8');
const ATT = readFileSync(new URL('../src/attention.js', import.meta.url), 'utf8');

const PLUIE = 'binary_sensor.tondeuse_pluie_detectee';
const CO_CAMERA = 'binary_sensor.camera_entree_alarme_de_co_detectee';
const FUITE = 'binary_sensor.fuite_evier';
const CO_VRAI = 'binary_sensor.couloir_co';
const GAZ_CAMERA = 'binary_sensor.camera_entree_gaz';

/* Son installation, réduite à ce qui compte : la tondeuse (qui a aussi une caméra), la caméra de l'entrée, un détecteur de fuite Zigbee
 * et un détecteur de monoxyde. Tous allumés. */
function maison() {
  const ent = (id, dev, plus = {}) => ({ ...entity(id, { device: dev }), ...plus });
  const on = (id, dc) => state(id, 'on', { friendly_name: id, device_class: dc });
  return {
    areas: [area('dehors', 'Dehors')],
    devices: [device('tondeuse', 'Tondeuse', 'dehors'), device('camera_entree', 'Caméra de l’entrée', 'dehors'), device('aqara', 'Fuite évier', 'dehors'), device('nest', 'CO couloir', 'dehors')],
    entities: [
      ent(PLUIE, 'tondeuse', { platform: 'mammotion', device_class: 'moisture' }), ent('lawn_mower.tondeuse', 'tondeuse'), ent('camera.tondeuse', 'tondeuse'),
      ent(CO_CAMERA, 'camera_entree', { platform: 'unifiprotect', device_class: 'carbon_monoxide' }), ent(GAZ_CAMERA, 'camera_entree', { platform: 'unifiprotect' }),
      ent('camera.entree', 'camera_entree'),
      ent(FUITE, 'aqara', { platform: 'mqtt', device_class: 'moisture' }), ent('sensor.fuite_evier_batterie', 'aqara'),
      ent(CO_VRAI, 'nest', { platform: 'nest', device_class: 'carbon_monoxide' }),
    ],
    floors: [],
    states: states(on(PLUIE, 'moisture'), on(CO_CAMERA, 'carbon_monoxide'), on(GAZ_CAMERA, 'gas'), on(FUITE, 'moisture'), on(CO_VRAI, 'carbon_monoxide'),
      state('lawn_mower.tondeuse', 'docked'), state('camera.entree', 'idle')),
    energyPrefs: null,
  };
}
const avec = (f) => {
  const fx = maison();
  setLoggiaState({ index: indexOf(fx), ent: {}, cfg: { loggia_plants: [] }, resolved: null });
  try { return f(fx.states); } finally { setLoggiaState({ index: null, ent: {}, cfg: {}, resolved: null }); }
};
/* Les noms d'une liste écrite `NOM = [...]` (l'écran) ou `NOM = (...)` (le composant). */
const liste = (src, motif) => motif.exec(src)[1].match(/["'](\w+)["']/g).map(x => x.slice(1, -1));

test('la règle : la pluie d’un robot, l’alarme entendue — les mêmes listes que le serveur', () => {
  assert.equal(pluieDeRobot(['binary_sensor', 'lawn_mower', 'camera']), true);
  assert.equal(pluieDeRobot(['binary_sensor', 'vacuum']), true);
  assert.equal(pluieDeRobot(['binary_sensor', 'sensor']), false);
  assert.equal(pluieDeRobot(undefined), false, 'sans voisins connus, rien ne se perd');
  assert.equal(entendueParCamera('carbon_monoxide', ['camera']), true);
  assert.equal(entendueParCamera('smoke', ['camera']), true);
  assert.equal(entendueParCamera('gas', ['camera']), false, 'une caméra n’entend pas le gaz');
  assert.equal(entendueParCamera('carbon_monoxide', ['sensor']), false);
  assert.deepEqual(liste(ATT, /const ROBOTS = \[([^\]]*)\]/), liste(PY, /ROBOTS = \(([^)]*)\)/), 'les robots : l’écran et le composant lisent la même liste');
  assert.deepEqual(liste(ATT, /const CLASSES_ENTENDUES = \[([^\]]*)\]/), liste(PY, /CLASSES_ENTENDUES = \(([^)]*)\)/), 'ce qu’une caméra entend : la même liste');
});

test('voisinsDe : les domaines de l’appareil, lus dans l’index ; [] sans appareil', () => avec(() => {
  assert.deepEqual([...voisinsDe(PLUIE)].sort(), ['binary_sensor', 'camera', 'lawn_mower']);
  assert.deepEqual([...voisinsDe(CO_CAMERA)].sort(), ['binary_sensor', 'camera']);
  assert.deepEqual([...voisinsDe(FUITE)].sort(), ['binary_sensor', 'sensor']);
  assert.deepEqual(voisinsDe('binary_sensor.inconnu'), []);
  assert.equal(plateformeDe(PLUIE), 'mammotion');
}));

test('« À surveiller » : pas de fuite pour la pluie, une alarme entendue pour le CO de la caméra, les vrais détecteurs inchangés', () => avec((S) => {
  const pts = pointsAttention({ S, plateforme: plateformeDe, voisins: voisinsDe });
  const par = (h) => pts.filter(p => p.haid === h).map(p => [p.cle.split(':')[0], p.niveau, p.titre]);
  assert.deepEqual(par(PLUIE), [], 'son cas : à chaque averse, « Fuite détectée »');
  assert.deepEqual(par(CO_CAMERA), [['entendue', 'alerte', 'Alarme entendue par une caméra']], 'ce que la caméra entend : ambre, et dit tel quel');
  assert.deepEqual(par(FUITE), [['surete', 'alerte', 'Fuite détectée']]);
  assert.deepEqual(par(CO_VRAI).map(x => x[0]), ['surete']);
  assert.deepEqual(par(GAZ_CAMERA).map(x => x[0]), ['surete'], 'un gaz sur une caméra reste un détecteur');
  assert.equal(pts.find(p => p.haid === CO_CAMERA).icone, 'camera');
  // Sans `voisins` (un appelant qui ne le passe pas) : comme avant.
  const avant = pointsAttention({ S, plateforme: plateformeDe });
  assert.ok(avant.some(p => p.haid === PLUIE) && avant.some(p => p.cle === 'surete:carbon_monoxide:' + CO_CAMERA));
}));

test('« En ce moment » (deriveNotifs) : la même règle', () => avec((S) => {
  const notifs = F.deriveNotifs({ states: S });
  const k = notifs.map(n => n.k);
  assert.ok(!k.includes('surete:' + PLUIE), 'la pluie de la tondeuse');
  assert.ok(!k.includes('surete:' + CO_CAMERA) && k.includes('entendue:' + CO_CAMERA), 'le CO entendu, à part');
  const n = notifs.find(x => x.k === 'entendue:' + CO_CAMERA);
  assert.deepEqual([n.c, n.t, n.m], ['var(--o-warn)', 'Alarme entendue par une caméra', CO_CAMERA]);
  assert.ok(k.includes('surete:' + FUITE) && k.includes('surete:' + CO_VRAI), 'les vrais détecteurs');
}));

test('le carnet de l’eau ne compte pas la pluie de la tondeuse', () => avec((S) => {
  assert.deepEqual(detecteursEau(S, { plateforme: plateformeDe, voisins: voisinsDe }), [FUITE]);
  assert.deepEqual(detecteursEau(S, { plateforme: plateformeDe }).sort(), [PLUIE, FUITE].sort(), 'sans voisins : comme avant');
}));
