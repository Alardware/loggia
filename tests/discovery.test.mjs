// Decouverte : lecture des registres et deduction des capacites.
//
// Ce que ces cas protegent, c'est la promesse centrale du dashboard : ce qui
// existe chez l'utilisateur apparait, le reste non — sans qu'un seul
// identifiant d'entite soit ecrit dans le code.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildIndex, capabilities, siblingsOf, pickSibling, cameraModes } from '../src/discovery.js';
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

// ── Machines supervisees ─────────────────────────────────────────────────────

test('systeme : les capteurs d’une machine tiennent sur un seul appareil', () => {
  const fx = systemHome();
  const ix = indexOf(fx);
  const sib = siblingsOf(ix, 'sensor.processor_use');
  assert.ok(sib.includes('sensor.memory_use_percent'));
  assert.ok(sib.includes('binary_sensor.hote_en_ligne'));
  assert.equal(pickSibling(ix, fx.states, 'sensor.processor_use', { domain: 'binary_sensor', deviceClass: 'connectivity' }), 'binary_sensor.hote_en_ligne');
});

// ── Modes d'une camera ───────────────────────────────────────────────────────
// Les reglages d'une camera sont les interrupteurs de son appareil. On les
// reconnait a leur identifiant ou a leur nom, jamais a une liste ecrite ici.

/** Une camera et ses entites, toutes sur le meme appareil ; renvoie ses modes. */
function modesDe(ents, { hidden = [], disabled = [], appareil = 'Caméra entrée' } = {}) {
  const states = {};
  ents.forEach(([id, nom]) => { states[id] = { state: id.startsWith('switch.') ? 'on' : 'idle', attributes: { friendly_name: nom } }; });
  const index = buildIndex({
    areas: [{ area_id: 'entree', name: 'Entrée' }],
    devices: [{ id: 'cam', name: appareil, area_id: 'entree' }],
    entities: ents.map(([id]) => ({ entity_id: id, device_id: 'cam', hidden_by: hidden.includes(id) ? 'user' : null, disabled_by: disabled.includes(id) ? 'user' : null })),
    states,
  });
  return cameraModes(index, states, ents[0][0]);
}
const TAPO = [
  ['camera.entree', 'Caméra entrée'],
  ['switch.camera_entree_privacy_mode', 'Caméra entrée Privacy mode'],
  ['switch.camera_entree_baby_cry_detection', 'Caméra entrée Baby cry detection'],
  ['switch.camera_entree_indicator_led', 'Caméra entrée Indicator LED'],
  ['switch.camera_entree_motion_tracking', 'Caméra entrée Motion tracking'],
  ['switch.camera_entree_motion_detection', 'Caméra entrée Motion detection'],
  ['sensor.camera_entree_signal', 'Caméra entrée Signal'],
];

test('les modes d’une camera : reconnus, dans l’ordre des rangees, le reste apres', () => {
  const modes = modesDe(TAPO);
  assert.deepEqual(modes.map(m => m.cle), ['mouvement', 'suivi', 'pleurs', 'prive', null]);
  assert.deepEqual(modes.map(m => m.id), [
    'switch.camera_entree_motion_detection', 'switch.camera_entree_motion_tracking',
    'switch.camera_entree_baby_cry_detection', 'switch.camera_entree_privacy_mode',
    'switch.camera_entree_indicator_led',
  ]);
  assert.ok(!modes.some(m => m.id.startsWith('sensor.')), 'un capteur n’est pas une bascule');
});

test('un interrupteur inconnu garde son nom, sans celui de l’appareil', () => {
  const led = modesDe(TAPO).find(m => m.cle === null);
  assert.equal(led.nom, 'Indicator LED');
});

test('cache ou desactive : pas un reglage', () => {
  const ids = modesDe(TAPO, { hidden: ['switch.camera_entree_privacy_mode'], disabled: ['switch.camera_entree_indicator_led'] }).map(m => m.id);
  assert.ok(!ids.includes('switch.camera_entree_privacy_mode'), 'cache');
  assert.ok(!ids.includes('switch.camera_entree_indicator_led'), 'desactive');
  assert.equal(ids.length, 3);
});

test('les noms en francais, majuscules et accents compris, suffisent', () => {
  const modes = modesDe([
    ['camera.cam', 'Cam'], ['switch.cam_1', 'Cam Détection de MOUVEMENT'], ['switch.cam_2', 'Cam Mode privé'],
    ['switch.cam_3', 'Cam Pleurs de bébé'], ['switch.cam_4', 'Cam Suivi du sujet'],
  ], { appareil: 'Cam' });
  assert.deepEqual(modes.map(m => [m.id, m.cle]), [
    ['switch.cam_1', 'mouvement'], ['switch.cam_4', 'suivi'], ['switch.cam_3', 'pleurs'], ['switch.cam_2', 'prive'],
  ]);
});

test('une cle n’est donnee qu’une fois : le second passe sous son nom', () => {
  const modes = modesDe([
    ['camera.c', 'C'], ['switch.c_motion_detection', 'C Motion detection'], ['switch.c_motion_notifications', 'C Motion notifications'],
  ], { appareil: 'C' });
  assert.deepEqual(modes.map(m => [m.cle, m.nom]), [['mouvement', 'Motion detection'], [null, 'Motion notifications']]);
});

test('« encryption » n’est pas un pleur, « lens mask » est un mode prive', () => {
  const modes = modesDe([
    ['camera.c', 'C'], ['switch.c_encryption', 'C Encryption'], ['switch.c_lens_mask', 'C Lens mask'],
  ], { appareil: 'C' });
  assert.deepEqual(modes.map(m => [m.id, m.cle]), [['switch.c_lens_mask', 'prive'], ['switch.c_encryption', null]]);
});

test('les inconnus se rangent par nom', () => {
  const modes = modesDe([['camera.c', 'C'], ['switch.c_b', 'C Zeta'], ['switch.c_a', 'C Alpha']], { appareil: 'C' });
  assert.deepEqual(modes.map(m => m.nom), ['Alpha', 'Zeta']);
});

test('une camera sans appareil, ou sans index, n’a pas de modes', () => {
  const states = { 'camera.seule': { state: 'idle', attributes: {} }, 'switch.motion': { state: 'on', attributes: {} } };
  const index = buildIndex({ entities: [{ entity_id: 'camera.seule' }, { entity_id: 'switch.motion' }], states });
  assert.deepEqual(cameraModes(index, states, 'camera.seule'), []);
  assert.deepEqual(cameraModes(null, states, 'camera.seule'), []);
});

test('l’interrupteur d’un autre appareil n’est pas un mode de cette camera', () => {
  const states = {
    'camera.a': { state: 'idle', attributes: { friendly_name: 'A' } },
    'switch.b_motion_detection': { state: 'on', attributes: { friendly_name: 'B Motion detection' } },
  };
  const index = buildIndex({
    devices: [{ id: 'da', name: 'A' }, { id: 'db', name: 'B' }],
    entities: [{ entity_id: 'camera.a', device_id: 'da' }, { entity_id: 'switch.b_motion_detection', device_id: 'db' }],
    states,
  });
  assert.deepEqual(cameraModes(index, states, 'camera.a'), []);
});
