// ─────────────────────────────────────────────────────────────────────────────
// La chaîne complète, sur des installations qui ne ressemblent pas à celle de
// l'auteur.
//
// Chaque moteur est testé à part ailleurs. Ici on vérifie qu'ils s'enchaînent :
// des registres bruts jusqu'à ce qu'une carte afficherait, en passant par ce
// que l'appareil sait faire et par l'appel de service que cela produit.
//
// Trois installations : une vide, une réduite à une lampe, une plus fournie.
// Aucune ne contient d'entité de l'installation d'origine — c'est tout l'objet
// de ces tests.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildIndex } from '../src/discovery.js';
import { buildDevices, devicesByArea } from '../src/devices.js';
import { deviceCaps, capsSummary } from '../src/capabilities.js';
import { planAction } from '../src/actions.js';
import { mergedProfile } from '../src/profiles.js';
import { deviceCard, presentableDevices, presentationSummary } from '../src/present.js';
import { healthReport } from '../src/health.js';

/** Enchaîne les six moteurs, comme le fait le dashboard au démarrage. */
function chaine({ areas = [], devices = [], entities = [], states = {}, services = {} }) {
  const index = buildIndex({ areas, devices, entities, floors: [], states, services });
  const appareils = buildDevices(index, states);
  const ctx = { states, services, meta: index.entityMeta, names: (id) => index.nameOf(id) };
  return {
    index,
    devices: appareils,
    ctx,
    cartes: presentableDevices(appareils, ctx),
    resume: presentationSummary(appareils, ctx),
    capacites: capsSummary(appareils, states, services, index.entityMeta),
    sante: healthReport(appareils, ctx),
  };
}

const et = (state, attributes = {}, minutesAgo = 0) => ({
  state: String(state), attributes,
  last_changed: new Date(Date.now() - minutesAgo * 60000).toISOString(),
});

// ── Une installation vide ───────────────────────────────────────────────────

test('une installation vierge ne produit ni carte, ni incident, ni erreur', () => {
  // Un dashboard qui plante sur une installation neuve serait inutilisable au
  // moment précis où l'on en a le plus besoin.
  const r = chaine({});
  assert.deepEqual(r.cartes, []);
  assert.deepEqual(r.sante.incidents, []);
  assert.equal(r.devices.size, 0);
  assert.equal(r.resume.total, 0);
  assert.equal(r.capacites.parCapacite.size, 0);
});

// ── Une installation réduite au minimum ─────────────────────────────────────

test('une seule lampe suffit à traverser toute la chaîne', () => {
  const r = chaine({
    areas: [{ area_id: 'cuisine', name: 'Cuisine' }],
    devices: [{ id: 'd1', name: 'Plafonnier', area_id: 'cuisine', manufacturer: 'Fabricant', model: 'A1' }],
    entities: [{ entity_id: 'light.plafonnier', device_id: 'd1', platform: 'demo' }],
    states: { 'light.plafonnier': et('on', { supported_color_modes: ['brightness'], brightness: 180 }) },
    services: { light: { turn_on: {}, turn_off: {}, toggle: {} }, homeassistant: { turn_on: {} } },
  });

  // L'appareil existe, avec son identité.
  const d = r.devices.get('d1');
  assert.equal(d.name, 'Plafonnier');
  assert.equal(d.manufacturer, 'Fabricant');
  assert.equal(d.areaName, 'Cuisine');

  // Il sait ce qu'il sait faire, et pas plus.
  const caps = deviceCaps(d, r.ctx.states, r.ctx.services);
  assert.equal(caps.can.has('set_brightness'), true);
  assert.equal(caps.can.has('set_color'), false, 'elle n’est pas de couleur');

  // La commande produite est correcte.
  const p = planAction('light.plafonnier', 'set_brightness', 60, r.ctx);
  assert.equal(p.ok, true);
  assert.equal(p.domain, 'light');
  assert.equal(p.service, 'turn_on');
  assert.deepEqual(p.data, { brightness_pct: 60 });

  // La carte la retient, dans sa pièce.
  assert.equal(r.cartes.length, 1);
  assert.equal(r.cartes[0].primary, 'light.plafonnier');
  assert.equal(r.cartes[0].status, 'ok');
  assert.deepEqual(devicesByArea(r.devices, 'cuisine').map(x => x.name), ['Plafonnier']);

  // Et rien ne va mal.
  assert.deepEqual(r.sante.incidents, []);
});

// ── Une installation fournie, et qui n'est pas celle de l'auteur ────────────

/**
 * Une maison inventée : un ventilateur, un portail, une serrure, un chauffe-eau
 * — aucun de ces objets n'existe sur l'installation de développement.
 */
function maisonInventee() {
  return {
    areas: [
      { area_id: 'atelier', name: 'Atelier' },
      { area_id: 'garage', name: 'Garage' },
    ],
    devices: [
      { id: 'v1', name: 'Ventilateur plafond', area_id: 'atelier', manufacturer: 'X', model: 'V-2' },
      { id: 'p1', name: 'Portail', area_id: 'garage', manufacturer: 'Y', model: 'P-9' },
      { id: 's1', name: 'Serrure atelier', area_id: 'atelier' },
      { id: 'c1', name: 'Chauffe-eau', area_id: 'garage' },
      { id: 'x1', name: 'Gestionnaire de modules', entry_type: 'service' },
    ],
    entities: [
      { entity_id: 'fan.plafond', device_id: 'v1', platform: 'demo' },
      { entity_id: 'sensor.plafond_conso', device_id: 'v1', platform: 'demo', device_class: 'power' },
      { entity_id: 'cover.portail', device_id: 'p1', platform: 'demo' },
      { entity_id: 'lock.atelier', device_id: 's1', platform: 'demo' },
      { entity_id: 'water_heater.ballon', device_id: 'c1', platform: 'demo' },
      { entity_id: 'update.module', device_id: 'x1', platform: 'gestionnaire' },
    ],
    states: {
      'fan.plafond': et('on', { supported_features: 1, percentage: 40 }),
      'sensor.plafond_conso': et('35', { device_class: 'power' }),
      'cover.portail': et('closed', { supported_features: 3 }),   // ouvre et ferme, sans position
      'lock.atelier': et('locked'),
      'water_heater.ballon': et('eco', {
        supported_features: 3, min_temp: 35, max_temp: 65,
        operation_list: ['eco', 'performance'], current_temperature: 52,
      }),
      'update.module': et('off', { supported_features: 1 }),
    },
    services: {
      homeassistant: { turn_on: {}, turn_off: {}, toggle: {} },
      fan: { turn_on: {}, turn_off: {}, toggle: {}, set_percentage: {} },
      cover: { open_cover: {}, close_cover: {}, set_cover_position: {}, toggle: {} },
      lock: { lock: {}, unlock: {} },
      water_heater: { set_temperature: {}, set_operation_mode: {} },
      update: { install: {} },
    },
  };
}

test('une maison inventée est comprise sans qu’on lui ait rien appris', () => {
  const r = chaine(maisonInventee());

  // Cinq appareils, dont un sans matériel : quatre cartes.
  assert.equal(r.devices.size, 5);
  assert.equal(r.resume.physiques, 4);
  assert.deepEqual(r.cartes.map(c => c.name),
    ['Chauffe-eau', 'Portail', 'Serrure atelier', 'Ventilateur plafond']);

  // Le portail ouvre et ferme, mais n'a pas de position : pas de curseur.
  const portail = r.cartes.find(c => c.name === 'Portail');
  const capsPortail = portail.controls.map(c => c.capability);
  assert.equal(capsPortail.indexOf('open') >= 0, true);
  assert.equal(capsPortail.indexOf('set_position'), -1, 'aucune position déclarée');

  // Le chauffe-eau porte ses propres bornes, qui ne sont celles de personne
  // d'autre : 35 à 65 degrés.
  const ballon = r.cartes.find(c => c.name === 'Chauffe-eau');
  const consigne = ballon.controls.find(c => c.capability === 'set_temperature');
  assert.deepEqual(consigne.bounds, { min: 35, max: 65, step: null });
  assert.equal(planAction('water_heater.ballon', 'set_temperature', 90, r.ctx).data.temperature, 65);

  // Le mode se choisit dans la liste que l'appareil publie, pas ailleurs.
  const mode = ballon.controls.find(c => c.capability === 'set_operation_mode');
  assert.deepEqual(mode.options, ['eco', 'performance']);
  assert.equal(planAction('water_heater.ballon', 'set_operation_mode', 'turbo', r.ctx).ok, false);

  // Le ventilateur publie sa vitesse : la carte le sait.
  const ventilo = r.cartes.find(c => c.name === 'Ventilateur plafond');
  assert.equal(ventilo.readings.indexOf('speed') >= 0, true);

  // La serrure se déverrouille sans avoir de masque de capacités.
  const serrure = r.cartes.find(c => c.name === 'Serrure atelier');
  assert.equal(serrure.controls.map(c => c.capability).indexOf('unlock') >= 0, true);

  // Le gestionnaire de modules n'est pas un objet de la maison.
  assert.equal(r.cartes.find(c => c.name === 'Gestionnaire de modules'), undefined);
  assert.equal(deviceCard(r.devices.get('x1'), r.ctx).physical, false);

  // Rien ne va mal : tout répond.
  assert.deepEqual(r.sante.incidents, []);
});

test('la même maison, une intégration tombée', () => {
  // On coupe la plateforme du portail, du ventilateur et du reste : un seul
  // incident doit sortir, pas cinq.
  const m = maisonInventee();
  ['fan.plafond', 'sensor.plafond_conso', 'cover.portail', 'lock.atelier', 'water_heater.ballon']
    .forEach(id => { m.states[id] = et('unavailable', {}, 12); });
  const r = chaine(m);

  const incidents = r.sante.incidents;
  assert.equal(incidents.length, 1, 'une cause, un message');
  assert.equal(incidents[0].kind, 'integration');
  assert.equal(incidents[0].scope, 'demo');
  assert.equal(incidents[0].count, 5);

  // Les appareils sont hors ligne, et les cartes le disent au lieu d'afficher
  // un dernier état figé.
  assert.equal(r.resume.parStatut.offline, 4);
});

test('la même maison, sans aucun service disponible', () => {
  // Home Assistant a démarré, les registres répondent, mais aucun domaine n'est
  // encore chargé. Rien ne doit être proposé — et rien ne doit casser.
  const m = maisonInventee();
  m.services = {};
  const r = chaine(m);
  presentableDevices(r.devices, { ...r.ctx, all: true }).forEach(c =>
    assert.deepEqual(c.controls, [], c.name + ' ne devrait rien proposer'));
  assert.equal(r.capacites.pilotables, 0);
});

test('des entités sans appareil traversent la chaîne sans en inventer un', () => {
  // Entités YAML, template, groupes : elles existent hors de tout appareil.
  const r = chaine({
    entities: [{ entity_id: 'sensor.calcul', platform: 'template' }],
    states: { 'sensor.calcul': et('42', { device_class: 'power' }) },
    services: { sensor: {} },
  });
  assert.equal(r.devices.size, 0);
  assert.deepEqual(r.cartes, []);
  assert.deepEqual(r.sante.incidents, []);
});

// ── Ce que les profils apportent, et seulement quand il le faut ─────────────

test('un profil ne s’applique qu’à qui le mérite', () => {
  const r = chaine(maisonInventee());
  // Aucun de ces appareils n'est une caméra multi-flux ni un robot.
  assert.equal(mergedProfile(r.devices.get('p1'), null), null);
  // Le gestionnaire, lui, est bien reconnu comme entrée de service.
  assert.deepEqual(mergedProfile(r.devices.get('x1')).ids, ['appareil-de-service']);
});
