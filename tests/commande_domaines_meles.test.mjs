/* Ticket #34 (Gunther, 18/10) : « Si je clique sur l'interrupteur de la tuile
 * Salon, la lumière s'éteint bien. Par contre si je reclique pour allumer, rien
 * ne s'allume, malgré l'interrupteur qui passe en jaune. »
 *
 * La cause : un ordre groupé qui mêlait des `light.*` et des `switch.*` partait
 * en UN appel, celui du domaine de la première entité ; les autres étaient
 * écartées en silence (`planGroupe`, `ecartees` que personne ne lisait). La
 * prise restait allumée, la tuile la voyait encore « allumée », et l'appui
 * suivant renvoyait « éteindre ». Désormais : un appel par domaine, et ce qui
 * reste vraiment refusé se dit. On JOUE le moteur avec un faux Home Assistant. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true });
const A = await import('../src/actions.js');

const st = (state, attributes = {}) => ({ state, attributes });
const LAMPE = { supported_color_modes: ['brightness'], color_mode: 'brightness' };

function maison(states) {
  const appels = [];
  const hass = {
    states,
    services: { light: { turn_on: {}, turn_off: {} }, switch: { turn_on: {}, turn_off: {} }, homeassistant: { turn_on: {}, turn_off: {} } },
    callService: (d, s, data, cible) => { appels.push([d + '.' + s, ((cible && cible.entity_id) || (data && data.entity_id) || []).slice().sort()]); return Promise.resolve(); },
  };
  return { hass, appels };
}

const laisser = () => new Promise((r) => setTimeout(r, 20));
/* Le refus part par un `Promise.reject` laissé sans suite, que l'écoute globale
 * de l'application change en toast ; le lanceur de tests, lui, le prendrait
 * pour un échec. On le capte le temps d'un appel. */
function captant(fn) {
  const refus = [];
  const vrai = Promise.reject;
  Promise.reject = (e) => { refus.push(String(e && e.message)); return Promise.resolve(); };
  try { fn(); } finally { Promise.reject = vrai; }
  return refus;
}

test('#34 : une pièce qui mêle une lampe et une prise déclarée lumière s’éteint EN ENTIER', async () => {
  const { hass, appels } = maison({ 'light.salon': st('on', LAMPE), 'switch.lampadaire': st('on') });
  A.commanderService(hass, ['light.salon', 'switch.lampadaire'], 'homeassistant', 'turn_off', { entity_id: ['light.salon', 'switch.lampadaire'] });
  await laisser();
  assert.deepEqual(appels.sort(), [['light.turn_off', ['light.salon']], ['switch.turn_off', ['switch.lampadaire']]]);
});

test('#34 : l’ordre de la liste ne décide plus de qui est écarté', async () => {
  const { hass, appels } = maison({ 'switch.lampadaire': st('off'), 'light.salon': st('off', LAMPE) });
  A.commanderService(hass, ['switch.lampadaire', 'light.salon'], 'homeassistant', 'turn_on', { entity_id: ['switch.lampadaire', 'light.salon'] });
  await laisser();
  assert.deepEqual(appels.sort(), [['light.turn_on', ['light.salon']], ['switch.turn_on', ['switch.lampadaire']]]);
});

test('un seul domaine : un seul appel, comme avant', async () => {
  const { hass, appels } = maison({ 'light.a': st('on', LAMPE), 'light.b': st('on', LAMPE) });
  A.commanderService(hass, ['light.a', 'light.b'], 'homeassistant', 'turn_off', { entity_id: ['light.a', 'light.b'] });
  await laisser();
  assert.deepEqual(appels, [['light.turn_off', ['light.a', 'light.b']]]);
});

test('ce qui reste refusé ne part pas, mais se DIT — le reste part quand même', async () => {
  const { hass, appels } = maison({ 'light.salon': st('on', LAMPE) });
  const refus = captant(() => A.commanderService(hass, ['light.salon', 'light.fantome'], 'homeassistant', 'turn_off', { entity_id: ['light.salon', 'light.fantome'] }));
  await laisser();
  assert.deepEqual(appels, [['light.turn_off', ['light.salon']]]);
  assert.equal(refus.length, 1, 'un refus, dit une fois');
  assert.match(refus[0], /light\.fantome/);
});
