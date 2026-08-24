// Decouverte : lecture des registres et deduction des capacites.
//
// Ce que ces cas protegent, c'est la promesse centrale du dashboard : ce qui
// existe chez l'utilisateur apparait, le reste non — sans qu'un seul
// identifiant d'entite soit ecrit dans le code.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildIndex, capabilities, siblingsOf, pickSibling, deviceIndex } from '../src/discovery.js';
import {
  emptyHome, simpleHome, inheritedArea, threeVacuums, hiddenDisabled,
  energyHome, systemHome, cameraHome, indexOf, capsOf,
} from './fixtures.mjs';

// ── Index ────────────────────────────────────────────────────────────────────

test('installation vide : index coherent, aucun plantage', () => {
  const ix = indexOf(emptyHome());
  assert.deepEqual(ix.areaList, []);
  assert.deepEqual(ix.live, []);
  assert.deepEqual(ix.orphans, []);
  assert.equal(ix.areaOf('light.inexistante'), null);
  assert.equal(ix.areaNameOf('light.inexistante'), null);
  assert.equal(ix.nameOf('light.inexistante'), 'light.inexistante');
});

test('la zone de l’entite l’emporte sur celle de son appareil', () => {
  const ix = buildIndex({
    areas: [{ area_id: 'a', name: 'A' }, { area_id: 'b', name: 'B' }],
    devices: [{ id: 'd1', name: 'D', area_id: 'a' }],
    entities: [
      { entity_id: 'light.herite', device_id: 'd1' },
      { entity_id: 'light.impose', device_id: 'd1', area_id: 'b' },
    ],
    states: { 'light.herite': { state: 'on', attributes: {} }, 'light.impose': { state: 'on', attributes: {} } },
  });
  assert.equal(ix.areaOf('light.herite'), 'a');
  assert.equal(ix.areaOf('light.impose'), 'b');
});

test('zone heritee de l’appareil : le nom lisible suit', () => {
  const ix = indexOf(inheritedArea());
  assert.equal(ix.areaOf('light.cuisine'), 'cuisine');
  assert.equal(ix.areaNameOf('light.cuisine'), 'Cuisine');
});

test('entites masquees et desactivees : absentes des entites vivantes', () => {
  const ix = indexOf(hiddenDisabled());
  assert.ok(ix.live.includes('light.visible'));
  assert.ok(!ix.live.includes('light.masquee'), 'une entite masquee ne doit pas etre vivante');
  assert.ok(!ix.live.includes('light.desactivee'), 'une entite desactivee ne doit pas etre vivante');
});

test('entite sans registre (YAML, template) : gardee, mais sans zone', () => {
  const ix = buildIndex({
    areas: [{ area_id: 'a', name: 'A' }],
    devices: [],
    entities: [],
    states: { 'sensor.template_maison': { state: '1', attributes: {} } },
  });
  assert.ok(ix.live.includes('sensor.template_maison'));
  assert.deepEqual(ix.orphans, ['sensor.template_maison']);
});

test('nom lisible : friendly_name d’abord, identifiant en dernier recours', () => {
  const ix = indexOf(simpleHome());
  assert.equal(ix.nameOf('light.salon'), 'Lampe salon');
  assert.equal(ix.nameOf('binary_sensor.routeur'), 'binary_sensor.routeur');
});

// ── Capacites ────────────────────────────────────────────────────────────────

test('installation vide : aucune vue proposee', () => {
  const caps = capsOf(emptyHome());
  Object.keys(caps.views).forEach(v => assert.equal(caps.views[v], false, v + ' ne devrait pas etre proposee'));
  assert.equal(caps.totals.entities, 0);
  assert.deepEqual(caps.devices, {});
});

test('petite maison : les vues suivent les domaines presents', () => {
  const caps = capsOf(simpleHome());
  assert.equal(caps.views.lumieres, true);
  assert.equal(caps.views.climat, true);
  assert.equal(caps.views.volets, true);
  assert.equal(caps.views.aspirateur, false);
  assert.equal(caps.views.medias, false);
  assert.equal(caps.views.securite, false);
  assert.equal(caps.has.scene, true);
});

test('des capteurs sans classe energetique ne suffisent pas a proposer l’Energie', () => {
  // simpleHome a des capteurs, mais aucun de classe `energy` ou `power`.
  assert.equal(capsOf(simpleHome()).views.energie, false);
  assert.equal(capsOf(energyHome()).views.energie, true);
});

test('les entites de diagnostic ne figurent pas parmi les appareils presentables', () => {
  const states = {
    'cover.volet': { state: 'open', attributes: { friendly_name: 'Volet' } },
    'cover.calibration': { state: 'closed', attributes: { friendly_name: 'Calibration' } },
  };
  const caps = capabilities({
    states,
    index: buildIndex({
      areas: [], devices: [{ id: 'd', name: 'Volet roulant' }],
      entities: [
        { entity_id: 'cover.volet', device_id: 'd' },
        { entity_id: 'cover.calibration', device_id: 'd', entity_category: 'config' },
      ],
      states,
    }),
  });
  assert.deepEqual(caps.devices.cover.map(d => d.id), ['cover.volet']);
});

test('les lumieres ne sont pas listees en appareils : la vue balaie les etats', () => {
  // Choix assume : `capabilities` ne construit `devices` que pour les domaines
  // ou l'on presente des fiches. La vue Lumieres, elle, decouvre `light.*`
  // directement, avec les modes de couleur — d'ou son absence ici.
  const caps = capsOf(simpleHome());
  assert.equal(caps.devices.light, undefined);
  assert.equal(caps.has.light, true);
  assert.equal(caps.views.lumieres, true);
});

test('chaque appareil porte l’identifiant ET le nom de sa zone', () => {
  const therm = capsOf(simpleHome()).devices.climate[0];
  assert.equal(therm.area, 'chambre');
  assert.equal(therm.areaName, 'Chambre');
  assert.equal(therm.device, 'Thermostat');
});

test('totaux : zones utilisees et orphelins comptes a part', () => {
  const caps = capsOf(simpleHome());
  assert.equal(caps.totals.areas, 3);
  assert.equal(caps.totals.areasUsed, 3);
  assert.equal(caps.totals.orphans, 1); // scene.soiree n'est dans aucune zone
  assert.ok(caps.totals.domains >= 5);
});

// ── Entites soeurs : le mecanisme qui remplace les identifiants en dur ───────

test('les soeurs d’une entite sont celles du meme appareil, elle exclue', () => {
  const ix = indexOf(threeVacuums());
  const sib = siblingsOf(ix, 'vacuum.alpha');
  assert.ok(sib.includes('sensor.alpha_batterie'));
  assert.ok(sib.includes('image.alpha_carte'));
  assert.ok(!sib.includes('vacuum.alpha'), 'une entite n’est pas sa propre soeur');
  assert.ok(!sib.some(id => id.includes('beta')), 'aucune soeur ne doit venir d’un autre appareil');
});

test('entite sans appareil : aucune soeur, et pas d’erreur', () => {
  const ix = indexOf(simpleHome());
  assert.deepEqual(siblingsOf(ix, 'scene.soiree'), []);
  assert.deepEqual(siblingsOf(null, 'scene.soiree'), []);
});

test('choix d’une soeur : par classe, par unite, par motif', () => {
  const fx = threeVacuums();
  const ix = indexOf(fx);
  assert.equal(pickSibling(ix, fx.states, 'vacuum.beta', { domain: 'sensor', deviceClass: 'battery' }), 'sensor.beta_batterie');
  assert.equal(pickSibling(ix, fx.states, 'vacuum.beta', { domain: 'sensor', unit: 'm²' }), 'sensor.beta_surface');
  assert.equal(pickSibling(ix, fx.states, 'vacuum.beta', { domain: 'image' }), 'image.beta_carte');
  assert.equal(pickSibling(ix, fx.states, 'vacuum.beta', { domain: 'sensor', deviceClass: 'pressure' }), null);
});

test('une entite principale est preferee a une entite de diagnostic', () => {
  const st = {
    'vacuum.x': { state: 'docked', attributes: {} },
    'sensor.diag': { state: '1', attributes: { device_class: 'battery' } },
    'sensor.normal': { state: '2', attributes: { device_class: 'battery' } },
  };
  const ix = buildIndex({
    areas: [], devices: [{ id: 'd', name: 'D' }],
    entities: [
      { entity_id: 'sensor.diag', device_id: 'd', entity_category: 'diagnostic' },
      { entity_id: 'sensor.normal', device_id: 'd' },
      { entity_id: 'vacuum.x', device_id: 'd' },
    ],
    states: st,
  });
  assert.equal(pickSibling(ix, st, 'vacuum.x', { domain: 'sensor', deviceClass: 'battery' }), 'sensor.normal');
});

test('regroupement par appareil : un appareil, ses entites', () => {
  // deviceIndex rend une Map device_id → { name, area, entities }.
  const di = deviceIndex(indexOf(cameraHome()));
  const cam = di.get('d_cam');
  assert.ok(cam, 'l’appareil camera doit apparaitre');
  assert.equal(cam.name, 'Caméra entrée');
  assert.equal(cam.area, 'entree');
  assert.equal(cam.entities.filter(id => id.indexOf('camera.') === 0).length, 3);
  assert.deepEqual(deviceIndex(null).size, 0);
});

// ── Machines supervisees ─────────────────────────────────────────────────────

test('systeme : les capteurs d’une machine tiennent sur un seul appareil', () => {
  const fx = systemHome();
  const ix = indexOf(fx);
  const sib = siblingsOf(ix, 'sensor.processor_use');
  assert.ok(sib.includes('sensor.memory_use_percent'));
  assert.ok(sib.includes('binary_sensor.hote_en_ligne'));
  assert.equal(pickSibling(ix, fx.states, 'sensor.processor_use', { domain: 'binary_sensor', deviceClass: 'connectivity' }), 'binary_sensor.hote_en_ligne');
});
