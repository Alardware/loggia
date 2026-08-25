// ─────────────────────────────────────────────────────────────────────────────
// La santé : des incidents, pas des symptômes.
//
// Le cas fondateur vient d'une installation réelle : 109 entités locales
// devenues indisponibles à la même minute, deux minutes après l'écriture d'un
// fichier de panne. Les compter une par une donnait « 109 problèmes » ; les
// regrouper donne « un événement, côté Home Assistant, à telle heure ».
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { healthReport, healthText } from '../src/health.js';

/** Un état, daté : la minute compte, c'est tout le sujet. */
const et = (state, minutesAgo = 0, attributes = {}) => ({
  state: String(state),
  last_changed: new Date(Date.now() - minutesAgo * 60000).toISOString(),
  attributes,
});

const app = (o) => ({
  id: 'd1', name: 'Appareil', integration: null, via: null,
  entities: [], available: true, unavailable: 0, ...o,
});

const kinds = (r) => r.incidents.map(i => i.kind);

// ── unavailable n'est pas unknown ───────────────────────────────────────────

test('une entité sans valeur n’est pas une entité en panne', () => {
  // Une entité qui n'a rien reçu depuis le démarrage vaut `unknown`. La compter
  // comme une panne gonflerait les chiffres sans rien apprendre.
  const states = {
    'sensor.a': et('unknown'), 'sensor.b': et('unknown'), 'sensor.c': et('12'),
  };
  const r = healthReport(new Map(), { states });
  assert.equal(r.stats.unknown, 2);
  assert.equal(r.stats.unavailable, 0);
  assert.deepEqual(r.incidents, []);
});

// ── Une intégration entière ─────────────────────────────────────────────────

test('une intégration entièrement muette est un seul incident', () => {
  const states = {
    'sensor.a': et('unavailable'), 'sensor.b': et('unavailable'),
    'sensor.c': et('unavailable'), 'light.ok': et('on'),
  };
  const meta = new Map([
    ['sensor.a', { platform: 'exemple' }], ['sensor.b', { platform: 'exemple' }],
    ['sensor.c', { platform: 'exemple' }], ['light.ok', { platform: 'autre' }],
  ]);
  const r = healthReport(new Map(), { states, meta });
  assert.deepEqual(kinds(r), ['integration']);
  assert.equal(r.incidents[0].scope, 'exemple');
  assert.equal(r.incidents[0].count, 3);
});

test('… mais une intégration partiellement muette n’en est pas une', () => {
  // C'est le cas courant : une plateforme bavarde a toujours quelques entités
  // sans réponse, et ce n'est pas elle qui est tombée.
  const states = {
    'sensor.a': et('unavailable'), 'sensor.b': et('12'), 'sensor.c': et('13'),
  };
  const meta = new Map([['sensor.a', { platform: 'exemple' }],
    ['sensor.b', { platform: 'exemple' }], ['sensor.c', { platform: 'exemple' }]]);
  assert.equal(kinds(healthReport(new Map(), { states, meta })).indexOf('integration'), -1);
});

test('une intégration d’une ou deux entités ne déclenche rien', () => {
  // Trop peu pour distinguer une panne de plateforme d'un appareil éteint.
  const states = { 'sensor.a': et('unavailable'), 'sensor.b': et('unavailable') };
  const meta = new Map([['sensor.a', { platform: 'petite' }], ['sensor.b', { platform: 'petite' }]]);
  assert.equal(kinds(healthReport(new Map(), { states, meta })).indexOf('integration'), -1);
});

// ── La chute simultanée ─────────────────────────────────────────────────────

test('des entités tombées à la même minute forment un seul incident', () => {
  // Reproduction du cas réel, en réduit : des automatisations, des cases à
  // cocher et un minuteur, tous muets au même instant.
  const states = {
    'automation.a': et('unavailable', 93), 'automation.b': et('unavailable', 93),
    'automation.c': et('unavailable', 93), 'input_boolean.d': et('unavailable', 93),
    'input_boolean.e': et('unavailable', 93), 'timer.f': et('unavailable', 93),
    'light.normale': et('on', 5),
  };
  const r = healthReport(new Map(), { states });
  assert.deepEqual(kinds(r), ['simultane']);
  const i = r.incidents[0];
  assert.equal(i.count, 6);
  assert.equal(i.local, true, 'toutes locales : la cause est côté Home Assistant');
  assert.equal(i.core, true);
  assert.equal(i.coreCount, 6);
  assert.deepEqual(i.domains, { automation: 3, input_boolean: 2, timer: 1 });
});

test('des chutes éparpillées dans le temps ne sont pas un incident commun', () => {
  const states = {
    'sensor.a': et('unavailable', 5), 'sensor.b': et('unavailable', 40),
    'sensor.c': et('unavailable', 120), 'sensor.d': et('unavailable', 300),
  };
  assert.equal(kinds(healthReport(new Map(), { states })).indexOf('simultane'), -1);
});

test('deux minutes voisines décrivent le même événement', () => {
  // Une chute ne se propage pas en une seule seconde : quelques minutes
  // d'écart appartiennent au même incident.
  const states = {};
  for (let i = 0; i < 4; i++) states['automation.a' + i] = et('unavailable', 93);
  for (let i = 0; i < 3; i++) states['script.b' + i] = et('unavailable', 91);
  const r = healthReport(new Map(), { states });
  assert.deepEqual(kinds(r), ['simultane']);
  assert.equal(r.incidents[0].count, 7);
});

test('une chute mixte met quand meme Home Assistant en cause', () => {
  // Releve reel : 859 entites tombees ensemble, dont 711 capteurs d'une
  // integration et 70 automatisations. Une integration qui tombe ne peut pas
  // faire taire les automatisations d'une autre — la cause est donc en dessous.
  const states = {};
  for (let i = 0; i < 3; i++) states['automation.a' + i] = et('unavailable', 30);
  for (let i = 0; i < 3; i++) states['light.b' + i] = et('unavailable', 30);
  const i = healthReport(new Map(), { states }).incidents[0];
  assert.equal(i.local, false, 'elle ne touche pas QUE des entites locales');
  assert.equal(i.core, true, 'mais des entites locales sont tombees');
  assert.equal(i.coreCount, 3);
});

// ── La passerelle ───────────────────────────────────────────────────────────

test('un pont tombé explique le silence de ce qu’il porte', () => {
  const devices = new Map([
    ['pont', app({ id: 'pont', name: 'Passerelle', entities: ['sensor.pont'], available: false })],
    ['a', app({ id: 'a', via: 'pont', entities: ['sensor.a'], available: false })],
    ['b', app({ id: 'b', via: 'pont', entities: ['sensor.b'], available: false })],
  ]);
  const states = {
    'sensor.pont': et('unavailable', 10), 'sensor.a': et('unavailable', 10),
    'sensor.b': et('unavailable', 10),
  };
  const r = healthReport(devices, { states });
  assert.equal(r.incidents[0].kind, 'passerelle');
  assert.equal(r.incidents[0].scope, 'Passerelle');
  assert.equal(r.incidents[0].count, 2);
  // Les entités du pont sont expliquées : pas de second incident redondant.
  assert.equal(kinds(r).filter(k => k === 'simultane').length, 0);
});

test('un pont qui répond n’explique rien', () => {
  const devices = new Map([
    ['pont', app({ id: 'pont', entities: ['sensor.pont'], available: true })],
    ['a', app({ id: 'a', via: 'pont', entities: ['sensor.a'], available: false })],
  ]);
  const states = { 'sensor.pont': et('on'), 'sensor.a': et('unavailable', 10) };
  const r = healthReport(devices, { states });
  assert.equal(kinds(r).indexOf('passerelle'), -1);
  assert.equal(kinds(r).indexOf('appareils') >= 0, true);
});

// ── Ce qu'on n'alarme pas ───────────────────────────────────────────────────

test('les entités de diagnostic et de réglage ne déclenchent rien', () => {
  // Elles sont nombreuses et souvent muettes par nature : personne ne veut être
  // alerté pour une case « activer les journaux détaillés ».
  const states = {};
  const meta = new Map();
  for (let i = 0; i < 8; i++) {
    states['sensor.diag' + i] = et('unavailable', 20);
    meta.set('sensor.diag' + i, { platform: 'x', category: 'diagnostic' });
  }
  const r = healthReport(new Map(), { states, meta });
  assert.deepEqual(r.incidents, []);
  assert.equal(r.stats.unavailable, 0);
});

test('une installation saine ne signale rien', () => {
  const states = { 'light.a': et('on'), 'sensor.b': et('21') };
  const devices = new Map([['d1', app({ entities: ['light.a', 'sensor.b'] })]]);
  const r = healthReport(devices, { states });
  assert.deepEqual(r.incidents, []);
  assert.match(healthText(r), /Aucun incident/);
});

test('sans rien, aucune supposition', () => {
  const r = healthReport(new Map(), {});
  assert.deepEqual(r.incidents, []);
  assert.equal(r.stats.entities, 0);
  assert.equal(healthText(null), 'Aucun diagnostic');
});

// ── Le rendu ────────────────────────────────────────────────────────────────

test('le texte dit l’incident, pas le décompte des symptômes', () => {
  const states = {};
  for (let i = 0; i < 6; i++) states['automation.a' + i] = et('unavailable', 93);
  const t = healthText(healthReport(new Map(), { states }));
  assert.match(t, /6 entités tombées ensemble/);
  assert.match(t, /Home Assistant lui-même/);
  assert.match(t, /6 automation/);
});
