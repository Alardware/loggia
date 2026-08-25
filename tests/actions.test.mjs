// ─────────────────────────────────────────────────────────────────────────────
// De la capacité à l'appel de service.
//
// Ces tests fixent surtout ce que le moteur REFUSE. Le code appelait jusqu'ici
// les services à l'aveugle, dans un `try { … } catch (e) {}` : un volet sans
// position recevait `set_cover_position`, une consigne de 34° était rabotée à 30
// par une constante, et un refus de permission ne laissait aucune trace.
//
// Les bornes utilisées ici viennent d'une installation réelle : la clim monte à
// 35°, un `number` va de -180 à 180.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { planAction, runAction, availableActions } from '../src/actions.js';

const et = (state, attributes = {}) => ({ state: String(state), attributes });

/** Les services de l'installation, tels que la découverte les rend. */
const services = {
  homeassistant: { turn_on: {}, turn_off: {}, toggle: {} },
  light: { turn_on: {}, turn_off: {}, toggle: {} },
  cover: {
    open_cover: {}, close_cover: {}, stop_cover: {}, set_cover_position: {},
    set_cover_tilt_position: {}, toggle: {},
  },
  climate: { set_temperature: {}, set_hvac_mode: {}, set_preset_mode: {} },
  vacuum: { start: {}, stop: {}, return_to_base: {}, set_fan_speed: {}, locate: {} },
  media_player: { volume_set: {}, media_play: {}, select_source: {}, turn_on: {}, turn_off: {}, toggle: {} },
  number: { set_value: {} },
};

// ── La traduction ───────────────────────────────────────────────────────────

test('une position de volet devient set_cover_position', () => {
  const states = { 'cover.x': et('open', { supported_features: 15 }) };
  const p = planAction('cover.x', 'set_position', 40, { states, services });
  assert.equal(p.ok, true);
  assert.equal(p.domain, 'cover');
  assert.equal(p.service, 'set_cover_position');
  assert.deepEqual(p.data, { position: 40 });
  assert.deepEqual(p.target, { entity_id: 'cover.x' });
});

test('la luminosité passe par light.turn_on, pas par un service dédié', () => {
  const states = { 'light.x': et('on', { supported_color_modes: ['brightness'] }) };
  const p = planAction('light.x', 'set_brightness', 60, { states, services });
  assert.equal(p.service, 'turn_on');
  assert.deepEqual(p.data, { brightness_pct: 60 });
});

test('le volume est un rapport, pas un pourcentage', () => {
  const states = { 'media_player.x': et('playing', { supported_features: 4 }) };
  const p = planAction('media_player.x', 'set_volume', 0.35, { states, services });
  assert.equal(p.service, 'volume_set');
  assert.deepEqual(p.data, { volume_level: 0.35 });
});

test('allumer passe par le domaine quand il sait le faire', () => {
  // `light.turn_on` accepte la luminosité, `homeassistant.turn_on` non : le
  // service du domaine vaut mieux dès qu'il existe.
  const states = { 'light.x': et('off') };
  assert.equal(planAction('light.x', 'turn_on', null, { states, services }).domain, 'light');
});

test('… et retombe sur homeassistant quand le domaine n’en a pas', () => {
  // Un domaine chargé peut n'offrir aucun `turn_on` : `homeassistant.turn_on`
  // agit alors sur n'importe quelle entité, et c'est le seul recours.
  const states = { 'humidifier.x': et('on', { supported_features: 1 }) };
  const svc = { ...services, humidifier: { set_mode: {} } };
  const p = planAction('humidifier.x', 'turn_on', null, { states, services: svc });
  assert.equal(p.domain, 'homeassistant');
  assert.equal(p.service, 'turn_on');
});

test('une scène s’active par son propre service', () => {
  const states = { 'scene.x': et('on') };
  const svc = { ...services, scene: { turn_on: {} } };
  assert.equal(planAction('scene.x', 'turn_on', null, { states, services: svc }).domain, 'scene');
});

// ── Les bornes viennent de l'entité ─────────────────────────────────────────

test('une consigne de 34° passe sur une clim qui monte à 35', () => {
  // Le code plafonnait à 30 par une constante. C'est l'entité qui sait.
  const states = { 'climate.x': et('heat', { supported_features: 401, min_temp: 5, max_temp: 35 }) };
  const p = planAction('climate.x', 'set_temperature', 34, { states, services });
  assert.deepEqual(p.data, { temperature: 34 });
  assert.equal(p.clamped, false);
  assert.deepEqual(p.bounds, { min: 5, max: 35, step: null });
});

test('… et 42° est ramené à 35, en le signalant', () => {
  const states = { 'climate.x': et('heat', { supported_features: 401, min_temp: 5, max_temp: 35 }) };
  const p = planAction('climate.x', 'set_temperature', 42, { states, services });
  assert.deepEqual(p.data, { temperature: 35 });
  assert.equal(p.clamped, true, 'l’appelant doit pouvoir le montrer');
});

test('la consigne se cale sur le pas publié', () => {
  const states = {
    'climate.x': et('heat', {
      supported_features: 401, min_temp: 5, max_temp: 35, target_temp_step: 0.5,
    }),
  };
  assert.deepEqual(planAction('climate.x', 'set_temperature', 20.3, { states, services }).data,
    { temperature: 20.5 });
});

test('un number garde ses propres bornes, même négatives', () => {
  // Relevé réel : un `number` de -180 à 180. Les borner à 0–100 le casserait.
  const states = { 'number.x': et('0', { min: -180, max: 180, step: 1 }) };
  assert.deepEqual(planAction('number.x', 'set_value', -175, { states, services }).data, { value: -175 });
  assert.deepEqual(planAction('number.x', 'set_value', 500, { states, services }).data, { value: 180 });
});

test('un pas très fin ne produit pas de flottant sale', () => {
  const states = { 'number.x': et('0', { min: 0, max: 1, step: 0.0001 }) };
  const v = planAction('number.x', 'set_value', 0.30000000000000004, { states, services }).data.value;
  assert.equal(v, 0.3);
});

// ── Ce que le moteur refuse ─────────────────────────────────────────────────

test('un volet sans inclinaison refuse l’inclinaison', () => {
  // Le service `cover.set_cover_tilt_position` EXISTE — il appartient au
  // domaine. C'est l'entité qui ne le supporte pas, et l'appel était perdu.
  const states = { 'cover.x': et('open', { supported_features: 15 }) };
  const p = planAction('cover.x', 'set_tilt_position', 50, { states, services });
  assert.equal(p.ok, false);
  assert.match(p.reason, /ne déclare pas/);
});

test('une lampe sans couleur refuse la couleur', () => {
  const states = { 'light.x': et('on', { supported_color_modes: ['brightness'] }) };
  assert.equal(planAction('light.x', 'set_color', [255, 0, 0], { states, services }).ok, false);
});

test('un mode absent de la liste est refusé', () => {
  const states = {
    'climate.x': et('heat', { supported_features: 401, hvac_modes: ['off', 'heat'] }),
  };
  assert.equal(planAction('climate.x', 'set_hvac_mode', 'heat', { states, services }).ok, true);
  const p = planAction('climate.x', 'set_hvac_mode', 'cool', { states, services });
  assert.equal(p.ok, false);
  assert.match(p.reason, /option inconnue/);
});

test('une couleur mal formée est refusée plutôt qu’envoyée', () => {
  const states = { 'light.x': et('on', { supported_color_modes: ['xy'] }) };
  assert.equal(planAction('light.x', 'set_color', [255, 0], { states, services }).ok, false);
  assert.equal(planAction('light.x', 'set_color', [255, 0, 300], { states, services }).ok, false);
  assert.equal(planAction('light.x', 'set_color', [255, 0, 40], { states, services }).ok, true);
});

test('un service absent de l’installation est refusé', () => {
  // L'intégration a été retirée, l'entité est restée dans le registre.
  const states = { 'vacuum.x': et('docked', { supported_features: 13116 }) };
  const p = planAction('vacuum.x', 'start', null, { states, services: { light: { turn_on: {} } } });
  assert.equal(p.ok, false);
});

test('une entité inconnue ne fait rien deviner', () => {
  assert.equal(planAction('', 'turn_on', null, {}).ok, false);
  assert.equal(planAction('light.absente', 'turn_on', null, { states: {}, services }).ok, false);
});

test('une entité muette garde un plan valide', () => {
  // Elle est peut-être injoignable à l'instant ; la commande reste correcte, et
  // l'appelant décide s'il la propose ou non.
  const states = { 'cover.x': { state: 'unavailable', attributes: { supported_features: 15 } } };
  const p = planAction('cover.x', 'open', null, { states, services });
  assert.equal(p.ok, true);
  assert.equal(p.available, false);
});

// ── L'envoi rapporte l'échec ────────────────────────────────────────────────

test('un appel qui réussit rend ok et le plan', async () => {
  const envois = [];
  const hass = { callService: (d, s, data, target) => { envois.push([d, s, data, target]); } };
  const states = { 'light.x': et('off') };
  const r = await runAction(hass, 'light.x', 'turn_on', null, { states, services });
  assert.equal(r.ok, true);
  assert.deepEqual(envois, [['light', 'turn_on', {}, { entity_id: 'light.x' }]]);
});

test('un refus de Home Assistant remonte au lieu d’être avalé', async () => {
  // C'est le point de tout le module : le `catch (e) {}` du code actuel laisse
  // l'utilisateur croire qu'il a agi.
  const hass = { callService: () => { throw new Error('non autorisé'); } };
  const states = { 'light.x': et('off') };
  const r = await runAction(hass, 'light.x', 'turn_on', null, { states, services });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'non autorisé');
  assert.equal(r.plan.service, 'turn_on', 'le plan reste lisible pour le diagnostic');
});

test('sans Home Assistant, on ne prétend pas avoir agi', async () => {
  const states = { 'light.x': et('off') };
  const r = await runAction(null, 'light.x', 'turn_on', null, { states, services });
  assert.equal(r.ok, false);
});

test('une capacité refusée n’envoie rien', async () => {
  let appele = false;
  const hass = { callService: () => { appele = true; } };
  const states = { 'cover.x': et('open', { supported_features: 15 }) };
  const r = await runAction(hass, 'cover.x', 'set_tilt_position', 50, { states, services });
  assert.equal(r.ok, false);
  assert.equal(appele, false);
});

// ── Ce qu'une carte peut proposer ───────────────────────────────────────────

test('les actions réellement possibles, avec leurs bornes', () => {
  const states = {
    'climate.x': et('heat', {
      supported_features: 401, min_temp: 5, max_temp: 35,
      hvac_modes: ['off', 'heat'], preset_modes: ['eco'],
    }),
  };
  const a = availableActions('climate.x', { states, services });
  assert.equal(a.has('set_temperature'), true);
  assert.deepEqual(a.get('set_temperature').bounds, { min: 5, max: 35, step: null });
  // Sans valeur plausible, une commande à option ne peut pas être planifiée :
  // c'est à la vue de proposer la liste, pas au moteur de choisir.
  assert.equal(a.has('set_hvac_mode'), false);
  // Le domaine ne publie pas set_fan_mode, et l'entité ne le déclare pas.
  assert.equal(a.has('set_fan_mode'), false);
});
