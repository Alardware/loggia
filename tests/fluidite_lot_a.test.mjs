// ─────────────────────────────────────────────────────────────────────────────
// FLUIDITÉ, LOT A (19/11 ; rapport de fluidité, points 1 à 3 retenus).
//
//  1. Objets ne relit la maison que si sa SIGNATURE change, plus à chaque `hass`.
//  2. Une carte ne se redessine que si son appareil a changé (`memeCarte`).
//  3. Une seule minuterie pour tout le pont, en pause écran caché.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);

const { abonnerPont } = await import('../src/app/noyau.jsx');
const { memeCarte } = await import('../src/appareils/fiches.jsx');
const { signatureMaison } = await import('../src/vues/objets.jsx');

const st = (state, attributes = {}) => ({ state, attributes });

// ── 3. La minuterie commune ─────────────────────────────────────────────────
test('une seule minuterie pour tous les abonnés, un seul relevé par tic', async (t) => {
  const vraie = globalThis.setInterval, vraieFin = globalThis.clearInterval;
  const minuteries = [];
  globalThis.setInterval = (fn) => { minuteries.push(fn); return minuteries.length; };
  globalThis.clearInterval = () => {};
  t.after(() => { globalThis.setInterval = vraie; globalThis.clearInterval = vraieFin; });
  const vus = [];
  const fin1 = abonnerPont((h) => vus.push(['a', h]));
  const fin2 = abonnerPont((h) => vus.push(['b', h]));
  assert.equal(minuteries.length, 1, 'deux abonnés, une minuterie');
  minuteries[0]();
  assert.deepEqual(vus.map(v => v[0]), ['a', 'b'], 'un tic sert tout le monde');
  assert.equal(vus[0][1], vus[1][1], 'le même relevé pour tous');
  fin1(); fin2();
});

test('écran caché, le pont se tait', async (t) => {
  const vraie = globalThis.setInterval, vraieFin = globalThis.clearInterval, doc = globalThis.document;
  const minuteries = [];
  globalThis.setInterval = (fn) => { minuteries.push(fn); return minuteries.length; };
  globalThis.clearInterval = () => {};
  globalThis.document = { hidden: true, addEventListener: () => {}, removeEventListener: () => {}, querySelector: () => null };
  t.after(() => { globalThis.setInterval = vraie; globalThis.clearInterval = vraieFin; globalThis.document = doc; });
  let n = 0;
  const fin = abonnerPont(() => { n++; });
  minuteries[minuteries.length - 1]();
  assert.equal(n, 0);
  fin();
});

// ── 2. memeCarte ────────────────────────────────────────────────────────────
test('une carte n’est pas redessinée quand seule une AUTRE entité change', () => {
  const lampe = st('on');
  const a = { id: 'light.salon', label: null, hass: { connected: true, states: { 'light.salon': lampe, 'sensor.puissance': st('120') } } };
  const b = { id: 'light.salon', label: null, hass: { connected: true, states: { 'light.salon': lampe, 'sensor.puissance': st('123') } } };
  assert.equal(memeCarte(a, b), true);
});

test('elle l’est quand son entité, ses propriétés ou la connexion changent', () => {
  const S = { 'light.salon': st('on') };
  const a = { id: 'light.salon', label: null, hass: { connected: true, states: S } };
  assert.equal(memeCarte(a, { ...a, hass: { connected: true, states: { 'light.salon': st('off') } } }), false, 'son état');
  assert.equal(memeCarte(a, { ...a, label: 'Lampe' }), false, 'son nom');
  assert.equal(memeCarte(a, { ...a, hass: { connected: false, states: S } }), false, 'la connexion');
  assert.equal(memeCarte(a, { ...a, minute: 2 }), false, 'la minute : un « il y a 3 min » se tient à jour');
});

test('un groupe suit ses membres', () => {
  const grp = st('on', { entity_id: ['light.a', 'light.b'] });
  const a = { id: 'light.grp', hass: { states: { 'light.grp': grp, 'light.a': st('on') } } };
  const b = { id: 'light.grp', hass: { states: { 'light.grp': grp, 'light.a': st('off') } } };
  assert.equal(memeCarte(a, b), false);
});

// ── 1. signatureMaison ──────────────────────────────────────────────────────
test('la signature ignore le bruit d’une puissance, pas une porte qui s’ouvre', () => {
  const base = { 'sensor.puissance': st('120', { device_class: 'power', unit_of_measurement: 'W' }), 'binary_sensor.porte': st('off', { device_class: 'door' }), 'light.salon': st('on') };
  const s0 = signatureMaison({ states: base });
  assert.equal(signatureMaison({ states: { ...base, 'sensor.puissance': st('123', { device_class: 'power', unit_of_measurement: 'W' }) } }), s0, '3 W de plus : rien à relire');
  assert.notEqual(signatureMaison({ states: { ...base, 'sensor.puissance': st('4', { device_class: 'power', unit_of_measurement: 'W' }) } }), s0, 'sous 10 W : la chauffe s’arrête');
  assert.notEqual(signatureMaison({ states: { ...base, 'binary_sensor.porte': st('on', { device_class: 'door' }) } }), s0, 'une porte s’ouvre');
  assert.notEqual(signatureMaison({ states: { ...base, 'light.cuisine': st('off') } }), s0, 'un appareil arrive');
  assert.notEqual(signatureMaison({ states: { ...base, 'sensor.puissance': st('unavailable', { device_class: 'power' }) } }), s0, 'un capteur tombe');
  assert.equal(signatureMaison(null), '');
});
