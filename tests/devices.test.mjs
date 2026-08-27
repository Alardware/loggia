// ─────────────────────────────────────────────────────────────────────────────
// Le modèle d'appareil : ce que les registres savent, plus les entités qui lui
// appartiennent.
//
// Ces tests fixent surtout des règles de prudence : un appareil dont une seule
// entité se tait n'est pas hors ligne ; une entité sans appareil n'en invente
// pas un ; une zone posée sur l'entité vaut pour l'appareil qui n'en a pas.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildDevices, devicesByArea, byIntegration } from '../src/devices.js';
import { buildIndex } from '../src/discovery.js';
// `states` est renommé : les tests déstructurent une variable du même nom.
import { area, device, entity, state, states as etats, cameraHome, indexOf } from './fixtures.mjs';

/** Un index et des états, à partir d'une description compacte. */
function maison({ areas = [], devices = [], entities = [], states = {} }) {
  const index = buildIndex({ areas, devices, entities, floors: [], states });
  return { index, states };
}

const salon = area('salon', 'Salon');

test('un appareil rassemble ses entités, ses domaines et son identité', () => {
  const { index, states } = maison({
    areas: [salon],
    devices: [device('d1', 'Thermostat', 'salon', {
      manufacturer: 'Exemple', model: 'T-100', sw_version: '2.1', integration: 'demo',
    })],
    entities: [
      entity('climate.thermostat', { device: 'd1' }),
      entity('sensor.thermostat_batterie', { device: 'd1' }),
    ],
    states: etats(
      state('climate.thermostat', 'heat'),
      state('sensor.thermostat_batterie', 87),
    ),
  });
  const d = buildDevices(index, states).get('d1');
  assert.equal(d.name, 'Thermostat');
  assert.equal(d.manufacturer, 'Exemple');
  assert.equal(d.model, 'T-100');
  assert.equal(d.firmware, '2.1');
  // L'intégration est la clé qui permettra de choisir un profil de commandes :
  // deux appareils du même domaine n'obéissent pas forcément aux mêmes.
  assert.equal(d.integration, 'demo');
  assert.equal(d.areaName, 'Salon');
  assert.deepEqual(d.domains, ['climate', 'sensor']);
  assert.equal(d.entities.length, 2);
});

test('une entité sans appareil ne fabrique pas d’appareil', () => {
  // Entités YAML, template, groupes : elles existent sans appartenir à rien.
  const { index, states } = maison({
    entities: [entity('sensor.calcul', {})],
    states: etats(state('sensor.calcul', 12)),
  });
  assert.equal(buildDevices(index, states).size, 0);
});

test('une seule entité muette ne met pas l’appareil hors ligne', () => {
  // Le capteur de signal d'une caméra peut se taire alors que le flux marche :
  // déclarer l'appareil en panne serait faux, et alarmant pour rien.
  const { index, states } = maison({
    devices: [device('d1', 'Caméra')],
    entities: [
      entity('camera.entree', { device: 'd1' }),
      entity('sensor.entree_rssi', { device: 'd1' }),
    ],
    states: etats(
      state('camera.entree', 'idle'),
      state('sensor.entree_rssi', 'unavailable'),
    ),
  });
  const d = buildDevices(index, states).get('d1');
  assert.equal(d.available, true);
  assert.equal(d.unavailable, 1);
});

test('un appareil dont rien ne répond est hors ligne', () => {
  const { index, states } = maison({
    devices: [device('d1', 'Prise')],
    entities: [entity('switch.prise', { device: 'd1' })],
    states: etats(state('switch.prise', 'unavailable')),
  });
  assert.equal(buildDevices(index, states).get('d1').available, false);
});

test('la zone de l’entité rattrape l’appareil qui n’en a pas', () => {
  // Home Assistant autorise à ranger une entité sans ranger son appareil.
  const { index, states } = maison({
    areas: [salon],
    devices: [device('d1', 'Lampe', null)],
    entities: [entity('light.lampe', { device: 'd1', area: 'salon' })],
    states: etats(state('light.lampe', 'on')),
  });
  const d = buildDevices(index, states).get('d1');
  assert.equal(d.area, 'salon');
  assert.equal(d.areaName, 'Salon');
});

test('les appareils d’une zone sont rendus par ordre de nom', () => {
  const { index, states } = maison({
    areas: [salon],
    devices: [device('d2', 'Zèbre', 'salon'), device('d1', 'Ampoule', 'salon')],
    entities: [
      entity('light.a', { device: 'd1' }),
      entity('light.z', { device: 'd2' }),
    ],
    states: etats(state('light.a', 'on'), state('light.z', 'off')),
  });
  const noms = devicesByArea(buildDevices(index, states), 'salon').map(d => d.name);
  assert.deepEqual(noms, ['Ampoule', 'Zèbre']);
});

test('le résumé par intégration compte appareils, entités et pannes', () => {
  const { index, states } = maison({
    devices: [
      device('d1', 'A', null, { integration: 'demo' }),
      device('d2', 'B', null, { integration: 'demo' }),
      device('d3', 'C', null, {}),   // intégration inconnue : on ne l'invente pas
    ],
    entities: [
      entity('light.a', { device: 'd1' }),
      entity('light.b1', { device: 'd2' }),
      entity('light.b2', { device: 'd2' }),
      entity('light.c', { device: 'd3' }),
    ],
    states: etats(
      state('light.a', 'on'),
      state('light.b1', 'unavailable'),
      state('light.b2', 'unavailable'),
      state('light.c', 'off'),
    ),
  });
  const parInt = byIntegration(buildDevices(index, states));
  const demo = parInt.get('demo');
  assert.equal(demo.devices, 2);
  assert.equal(demo.entities, 3);
  assert.equal(demo.unavailable, 2);
  assert.equal(demo.offline, 1);          // seul d2 est totalement muet
  assert.equal(parInt.get('inconnue').devices, 1);
});

test('sur une maison complète : un appareil, toutes ses entités', () => {
  // Trois flux vidéo sur un seul appareil — c'est le cas qui a motivé ce
  // module : trois cartes pour une caméra, c'était le dashboard qui comptait
  // des entités au lieu de compter des appareils.
  const maisonCam = cameraHome();
  const cam = buildDevices(indexOf(maisonCam), maisonCam.states).get('d_cam');
  assert.ok(cam, 'l’appareil caméra doit apparaître');
  assert.equal(cam.name, 'Caméra entrée');
  assert.equal(cam.area, 'entree');
  assert.equal(cam.entities.filter(id => id.startsWith('camera.')).length, 3);
});

test('sans index, aucune supposition', () => {
  assert.equal(buildDevices(null).size, 0);
  assert.equal(buildDevices({}).size, 0);
});

test('une entité sans valeur publiée n’est pas une panne', () => {
  /* `unknown` dit qu'aucune valeur n'a encore été publiée — un bouton jamais
   * pressé, un événement qui n'a pas tiré. Le confondre avec `unavailable`
   * rendait « hors ligne » des appareils qui vont très bien, et déclarait la
   * moitié de l'installation en panne juste après un redémarrage. */
  const { index, states } = maison({
    devices: [device('d1', 'Sonnette')],
    entities: [
      entity('button.sonnette', { device: 'd1' }),
      entity('event.appui', { device: 'd1' }),
    ],
    states: etats(
      state('button.sonnette', 'unknown'),
      state('event.appui', 'unknown'),
    ),
  });
  const d = buildDevices(index, states).get('d1');
  assert.equal(d.unavailable, 0, 'aucune de ces entités n’est muette');
  assert.equal(d.available, true, 'l’appareil répond');
});
