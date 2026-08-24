// Contexte d'execution : l'assemblage.
//
// `buildRuntime` est le seul endroit ou decouverte, configuration et resolution
// se rencontrent. Ce qui compte ici n'est pas la justesse de chaque resolveur —
// c'est que le dashboard reste utilisable quand quelque chose manque ou casse.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildRuntime } from '../src/runtime.js';
import { VIEW_IDS } from '../src/views.js';
import { simpleHome, energyHome, indexOf, capsOf } from './fixtures.mjs';

/** Ce que `useDiscovery` fournit une fois les registres lus. */
function discoveryOf(fx) {
  const index = indexOf(fx);
  return {
    ready: true,
    index,
    caps: capsOf(fx, index),
    raw: { energyPrefs: fx.energyPrefs, errors: [] },
  };
}

test('decouverte en cours : aucune vue masquee, aucune resolution', () => {
  const rt = buildRuntime({ discovery: { ready: false }, userCfg: {}, states: {} });
  assert.equal(rt.ready, false);
  assert.equal(rt.resolved, null);
  VIEW_IDS.forEach(v => assert.equal(rt.views[v].ok, true, v + ' ne doit pas clignoter au demarrage'));
});

test('decouverte en cours : la configuration deja lue est conservee', () => {
  const rt = buildRuntime({
    discovery: { ready: false },
    userCfg: { loggia_rooms: [{ room: 'Atelier' }] },
    states: { 'light.a': {} },
  });
  assert.equal(rt.userCfg.loggia_rooms[0].room, 'Atelier');
  assert.deepEqual(Object.keys(rt.states), ['light.a']);
});

test('assemblage complet : resolution faite, vues calculees', () => {
  const fx = simpleHome();
  const rt = buildRuntime({ discovery: discoveryOf(fx), userCfg: {}, states: fx.states });
  assert.equal(rt.ready, true);
  assert.equal(rt.resolved.climate.available, true);
  assert.equal(rt.views.lumieres.ok, true);
  assert.equal(rt.views.aspirateur.ok, false);
  assert.equal(rt.views.croquettes.ok, false);
});

test('les preferences Energie traversent jusqu’aux resolveurs', () => {
  const fx = energyHome();
  const rt = buildRuntime({ discovery: discoveryOf(fx), userCfg: {}, states: fx.states });
  assert.equal(rt.energyPrefs, fx.energyPrefs);
  assert.equal(rt.resolved.energy.available, true);
  assert.equal(rt.views.energie.ok, true);
});

test('sans preferences Energie, la vue se masque avec le bon motif', () => {
  const fx = energyHome();
  fx.energyPrefs = null;
  const rt = buildRuntime({ discovery: discoveryOf(fx), userCfg: {}, states: fx.states });
  assert.equal(rt.views.energie.ok, false);
  assert.match(rt.views.energie.reason, /tableau de bord Énergie/);
});

test('une resolution qui leve n’empeche pas le dashboard de s’afficher', () => {
  // `caps.devices` explose : c'est le pire cas, la resolution entiere echoue.
  const caps = { has: {}, views: {}, totals: {}, get devices() { throw new Error('registre corrompu'); } };
  const warn = console.warn;
  console.warn = () => {};
  try {
    const rt = buildRuntime({ discovery: { ready: true, index: null, caps, raw: {} }, userCfg: {}, states: {} });
    assert.equal(rt.ready, true);
    assert.equal(rt.resolved, null, 'la resolution est perdue, pas le dashboard');
    VIEW_IDS.forEach(v => assert.equal(rt.views[v].ok, true, 'en cas de doute, on affiche'));
  } finally {
    console.warn = warn;
  }
});

test('la configuration de l’utilisateur atteint bien les resolveurs', () => {
  const fx = simpleHome();
  const mine = [{ room: 'Atelier', haid: { temp: null, humidity: null, co2: null } }];
  const rt = buildRuntime({ discovery: discoveryOf(fx), userCfg: { loggia_rooms: mine }, states: fx.states });
  assert.equal(rt.resolved.rooms.source, 'utilisateur');
  assert.equal(rt.views.pieces.ok, true);
});
