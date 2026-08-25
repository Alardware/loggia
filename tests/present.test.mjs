// ─────────────────────────────────────────────────────────────────────────────
// Ce qu'une carte montre.
//
// Les cas viennent d'une installation réelle. Le plus instructif est celui de
// la caméra à trois flux : le seul « haute définition » y est hors service, et
// une règle qui privilégierait la qualité présenterait une image morte alors
// que deux autres flux fonctionnent.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  deviceCard, presentableDevices, cardsByArea, deviceStatus, isPhysical,
  presentationSummary,
} from '../src/present.js';

const et = (state, attributes = {}) => ({ state: String(state), attributes });
const app = (o) => ({
  id: 'd1', name: 'Appareil', manufacturer: null, model: null, integration: null,
  entryType: null, entities: [], domains: [], platforms: [], unavailable: 0,
  area: null, areaName: null, ...o,
});

const services = {
  homeassistant: { turn_on: {}, turn_off: {}, toggle: {} },
  light: { turn_on: {}, turn_off: {}, toggle: {} },
  cover: { open_cover: {}, close_cover: {}, stop_cover: {}, set_cover_position: {}, toggle: {} },
  climate: { set_temperature: {}, set_hvac_mode: {}, set_preset_mode: {} },
  camera: { turn_on: {}, turn_off: {} },
  update: { install: {} },
};

// ── L'état, en trois mots ───────────────────────────────────────────────────

test('une entité muette parmi plusieurs : dégradé, pas en panne', () => {
  assert.equal(deviceStatus(app({ entities: ['a.b', 'c.d'], unavailable: 1 })), 'degraded');
  assert.equal(deviceStatus(app({ entities: ['a.b', 'c.d'], unavailable: 0 })), 'ok');
  assert.equal(deviceStatus(app({ entities: ['a.b', 'c.d'], unavailable: 2 })), 'offline');
  assert.equal(deviceStatus(app({ entities: [] })), 'offline');
});

// ── Le flux présenté ────────────────────────────────────────────────────────

test('un flux qui répond passe avant un flux haute définition mort', () => {
  // Relevé réel : trois flux, le « high resolution » est unavailable, le
  // « package » est un flux secondaire. Reste le « medium », et c'est le bon.
  const cam = app({
    name: 'Entrée',
    entities: [
      'camera.entree_high_resolution_channel',
      'camera.entree_medium_resolution_channel',
      'camera.entree_package_camera',
    ],
    domains: ['camera'], unavailable: 1,
  });
  const states = {
    'camera.entree_high_resolution_channel': et('unavailable'),
    'camera.entree_medium_resolution_channel': et('recording'),
    'camera.entree_package_camera': et('recording'),
  };
  const c = deviceCard(cam, { states, services });
  assert.equal(c.primary, 'camera.entree_medium_resolution_channel');
  assert.equal(c.status, 'degraded');
  assert.equal(c.others.length, 2, 'les autres flux restent accessibles');
});

test('… mais si la haute définition répond, c’est elle', () => {
  const cam = app({
    entities: ['camera.x_high_resolution_channel', 'camera.x_medium_resolution_channel'],
    domains: ['camera'],
  });
  const states = {
    'camera.x_high_resolution_channel': et('recording'),
    'camera.x_medium_resolution_channel': et('recording'),
  };
  assert.equal(deviceCard(cam, { states, services }).primary, 'camera.x_high_resolution_channel');
});

test('l’entité mise en avant est celle du domaine le plus parlant', () => {
  // Un thermostat est une consigne avant d'être une batterie.
  const dev = app({
    entities: ['sensor.t_batterie', 'climate.t'], domains: ['climate', 'sensor'],
  });
  const states = {
    'climate.t': et('heat', { supported_features: 401, min_temp: 5, max_temp: 35, current_temperature: 20 }),
    'sensor.t_batterie': et('87', { device_class: 'battery' }),
  };
  const c = deviceCard(dev, { states, services });
  assert.equal(c.primary, 'climate.t');
  assert.equal(c.domain, 'climate');
  assert.deepEqual(c.readings, ['temperature', 'battery']);
});

// ── Les commandes proposées ─────────────────────────────────────────────────

test('un volet sans inclinaison ne propose pas de boutons d’inclinaison', () => {
  const dev = app({ entities: ['cover.x'], domains: ['cover'] });
  const states = { 'cover.x': et('open', { supported_features: 15, current_position: 40 }) };
  const caps = deviceCard(dev, { states, services }).controls.map(c => c.capability);
  assert.deepEqual(caps, ['close', 'open', 'set_position', 'stop', 'toggle']);
});

test('une commande à liste est proposée avec ses options', () => {
  // Choisir un mode n'a de sens que si l'entité publie les modes qu'elle
  // accepte : c'est la vue qui présente la liste, pas le moteur qui devine.
  const dev = app({ entities: ['climate.x'], domains: ['climate'] });
  const states = {
    'climate.x': et('heat', {
      supported_features: 401, min_temp: 5, max_temp: 35, hvac_modes: ['off', 'heat'],
    }),
  };
  const c = deviceCard(dev, { states, services });
  const mode = c.controls.find(x => x.capability === 'set_hvac_mode');
  assert.ok(mode, 'le choix de mode doit être proposé');
  assert.deepEqual(mode.options, ['off', 'heat']);
  // La consigne, elle, vient avec ses bornes réelles.
  const temp = c.controls.find(x => x.capability === 'set_temperature');
  assert.deepEqual(temp.bounds, { min: 5, max: 35, step: null });
});

test('un domaine non chargé ne propose aucun bouton', () => {
  const dev = app({ entities: ['cover.x'], domains: ['cover'] });
  const states = { 'cover.x': et('open', { supported_features: 15 }) };
  const c = deviceCard(dev, { states, services: { light: { turn_on: {} } } });
  assert.deepEqual(c.controls, []);
});

// ── Qui mérite une carte ────────────────────────────────────────────────────

test('une entrée de service n’est pas un objet de la maison', () => {
  const depot = app({ entryType: 'service', entities: ['update.depot'], domains: ['update'] });
  assert.equal(isPhysical(depot), false);
  assert.equal(deviceCard(depot, { services }).physical, false);
});

test('la sélection écarte le service et garde ce qui a quelque chose à montrer', () => {
  const devices = new Map([
    ['d1', app({ id: 'd1', name: 'Lampe', entities: ['light.a'], domains: ['light'] })],
    ['d2', app({ id: 'd2', name: 'Dépôt', entryType: 'service', entities: ['update.d'], domains: ['update'] })],
    ['d3', app({ id: 'd3', name: 'Rien', entities: ['sensor.muet'], domains: ['sensor'] })],
  ]);
  const states = {
    'light.a': et('on', { supported_color_modes: ['brightness'], brightness: 200 }),
    'update.d': et('off', { supported_features: 1 }),
    'sensor.muet': et('12'),   // ni device_class, ni commande : rien à dire
  };
  const noms = presentableDevices(devices, { states, services }).map(c => c.name);
  assert.deepEqual(noms, ['Lampe']);
  // Le diagnostic, lui, doit pouvoir tout voir.
  assert.equal(presentableDevices(devices, { states, services, all: true }).length, 3);
});

test('les cartes d’une zone, triées par nom', () => {
  const devices = new Map([
    ['d1', app({ id: 'd1', name: 'Zèbre', area: 'salon', entities: ['light.z'], domains: ['light'] })],
    ['d2', app({ id: 'd2', name: 'Ampoule', area: 'salon', entities: ['light.a'], domains: ['light'] })],
    ['d3', app({ id: 'd3', name: 'Ailleurs', area: 'cuisine', entities: ['light.c'], domains: ['light'] })],
  ]);
  const states = { 'light.z': et('on'), 'light.a': et('off'), 'light.c': et('on') };
  assert.deepEqual(cardsByArea(devices, 'salon', { states, services }).map(c => c.name),
    ['Ampoule', 'Zèbre']);
});

test('une entité de réglage ne suffit pas à mériter une carte', () => {
  const dev = app({ id: 'd1', name: 'Réglage', entities: ['switch.debug'], domains: ['switch'] });
  const meta = new Map([['switch.debug', { category: 'config' }]]);
  const states = { 'switch.debug': et('off') };
  assert.deepEqual(presentableDevices(new Map([['d1', dev]]), { states, services, meta }), []);
});

// ── L'inventaire ────────────────────────────────────────────────────────────

test('le résumé mesure ce qui est écarté, et pourquoi', () => {
  const devices = new Map([
    ['d1', app({ id: 'd1', entities: ['light.a'], domains: ['light'] })],
    ['d2', app({ id: 'd2', entryType: 'service', entities: ['update.d'], domains: ['update'] })],
    ['d3', app({ id: 'd3', entities: ['sensor.t'], domains: ['sensor'] })],
    ['d4', app({ id: 'd4', entities: ['light.b'], domains: ['light'], unavailable: 1 })],
  ]);
  const states = {
    'light.a': et('on'), 'update.d': et('off', { supported_features: 1 }),
    'sensor.t': et('20', { device_class: 'temperature' }), 'light.b': et('unavailable'),
  };
  const r = presentationSummary(devices, { states, services });
  assert.equal(r.total, 4);
  assert.equal(r.physiques, 3);
  assert.equal(r.retenus, 3);          // les deux lampes et le capteur
  assert.equal(r.parStatut.offline, 1);
  assert.equal(r.parStatut.ok, 3);
});

test('sans rien, aucune supposition', () => {
  assert.deepEqual(presentableDevices(new Map()), []);
  const c = deviceCard(app({}), {});
  assert.equal(c.primary, null);
  assert.deepEqual(c.controls, []);
  assert.equal(c.status, 'offline');
});
