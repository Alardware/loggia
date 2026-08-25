// ─────────────────────────────────────────────────────────────────────────────
// Les capacités, telles que l'entité les déclare.
//
// Les masques utilisés ici ne sont pas inventés : ils ont été relevés sur une
// installation réelle. C'est ce qui donne leur valeur aux tests — un volet à 15
// n'a PAS d'inclinaison, même si le domaine `cover` publie les services qui
// vont avec, et une lampe à 44 peut très bien être une lampe de couleur.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { entityCaps, deviceCaps, capsSummary } from '../src/capabilities.js';

/** Un état, sans passer par les fabriques : ici seuls les attributs comptent. */
const et = (state, attributes = {}) => ({ state: String(state), attributes });

const liste = (s) => [...s].sort();

// ── Le masque dit ce que l'entité accepte ───────────────────────────────────

test('un volet à 15 ouvre, ferme, se positionne et s’arrête — sans inclinaison', () => {
  // Relevé réel. Le domaine `cover` publie pourtant set_cover_tilt_position :
  // c'est bien l'entité qui tranche, pas le service.
  const c = entityCaps('cover.x', et('open', { supported_features: 15, current_position: 40 }));
  assert.deepEqual(liste(c.can), ['close', 'open', 'set_position', 'stop', 'toggle']);
  assert.equal(c.can.has('set_tilt_position'), false);
  assert.equal(c.reads.has('position'), true);
});

test('un volet à 143 se règle en inclinaison sans l’ouvrir par crans', () => {
  // 143 = 128 + 15 : la position d'inclinaison est réglable, mais les
  // commandes open_tilt / close_tilt ne sont pas offertes. Une carte qui
  // afficherait les deux flèches proposerait un geste sans effet.
  const c = entityCaps('cover.y', et('open', { supported_features: 143 }));
  assert.equal(c.can.has('set_tilt_position'), true);
  assert.equal(c.can.has('open_tilt'), false);
  assert.equal(c.can.has('close_tilt'), false);
});

test('un volet à 255 a toute l’inclinaison', () => {
  const c = entityCaps('cover.z', et('open', { supported_features: 255 }));
  ['open_tilt', 'close_tilt', 'stop_tilt', 'set_tilt_position']
    .forEach(x => assert.equal(c.can.has(x), true, x + ' attendu'));
});

test('une clim à 401 : consigne et préréglages, pas de ventilation', () => {
  // Relevé réel : TURN_ON + TURN_OFF + PRESET_MODE + TARGET_TEMPERATURE.
  const c = entityCaps('climate.x', et('heat', {
    supported_features: 401,
    current_temperature: 19.5,
    hvac_modes: ['off', 'heat', 'cool'],
    preset_modes: ['eco', 'confort'],
  }));
  assert.equal(c.can.has('set_temperature'), true);
  assert.equal(c.can.has('set_preset_mode'), true);
  assert.equal(c.can.has('set_fan_mode'), false);
  assert.equal(c.can.has('set_humidity'), false);
  assert.deepEqual(c.options.modes, ['off', 'heat', 'cool']);
  assert.deepEqual(c.options.presets, ['eco', 'confort']);
  assert.equal(c.reads.has('temperature'), true);
  assert.equal(c.reads.has('humidity'), false);   // elle ne la publie pas
});

test('un robot à 13116 démarre, revient et règle son aspiration', () => {
  // Relevé réel. Le bit BATTERY n'y est pas : la batterie passe désormais par
  // une entité `sensor` séparée, et l'inventer serait faux.
  const c = entityCaps('vacuum.x', et('docked', { supported_features: 13116 }));
  ['start', 'stop', 'pause', 'return_home', 'set_fan_speed', 'locate', 'send_command', 'state']
    .forEach(x => assert.equal(c.can.has(x), true, x + ' attendu'));
  assert.equal(c.can.has('battery'), false);
  assert.equal(c.can.has('clean_spot'), false);
});

// ── La lampe : le masque ne suffit pas ──────────────────────────────────────

test('une lampe à 44 sans modes de couleur ne se tamise pas', () => {
  const c = entityCaps('light.x', et('on', { supported_features: 44, supported_color_modes: ['onoff'] }));
  assert.equal(c.can.has('set_effect'), true);
  assert.equal(c.can.has('transition'), true);
  assert.equal(c.can.has('set_brightness'), false);
  assert.equal(c.can.has('set_color'), false);
  assert.equal(c.can.has('turn_on'), true);
});

test('la même lampe à 44, en xy, fait la couleur', () => {
  // C'est tout l'enjeu : le masque est identique, la capacité ne l'est pas.
  const c = entityCaps('light.y', et('on', {
    supported_features: 44, supported_color_modes: ['xy'], brightness: 180,
  }));
  assert.equal(c.can.has('set_color'), true);
  assert.equal(c.can.has('set_brightness'), true);
  assert.equal(c.can.has('set_color_temp'), false);
  assert.deepEqual(c.options.color_modes, ['xy']);
  assert.equal(c.reads.has('brightness'), true);
});

test('une lampe color_temp se tamise et règle sa température', () => {
  const c = entityCaps('light.z', et('on', { supported_color_modes: ['brightness', 'color_temp'] }));
  assert.equal(c.can.has('set_color_temp'), true);
  assert.equal(c.can.has('set_brightness'), true);
  assert.equal(c.can.has('set_color'), false);
});

// ── Les domaines sans masque ────────────────────────────────────────────────

test('un interrupteur, un bouton, un script : le domaine suffit', () => {
  assert.equal(entityCaps('switch.x', et('on')).can.has('toggle'), true);
  assert.equal(entityCaps('button.x', et('unknown')).can.has('press'), true);
  assert.equal(entityCaps('script.x', et('off')).can.has('turn_on'), true);
  const sel = entityCaps('select.x', et('a', { options: ['a', 'b'] }));
  assert.equal(sel.can.has('select_option'), true);
  assert.deepEqual(sel.options.options, ['a', 'b']);
});

test('un capteur ne commande rien, mais dit ce qu’il mesure', () => {
  const c = entityCaps('sensor.x', et('21.4', { device_class: 'temperature' }));
  assert.equal(c.can.size, 0);
  assert.equal(c.reads.has('temperature'), true);
});

// ── Prudence ────────────────────────────────────────────────────────────────

test('une entité muette garde ses capacités mais se signale', () => {
  // Ses attributs restent publiés : ce qu'elle sait faire ne change pas parce
  // qu'elle est momentanément injoignable.
  const c = entityCaps('cover.x', { state: 'unavailable', attributes: { supported_features: 15 } });
  assert.equal(c.available, false);
  assert.equal(c.can.has('open'), true);
});

test('une entité sans état ne fait rien deviner', () => {
  const c = entityCaps('climate.x', undefined);
  assert.equal(c.available, false);
  assert.equal(c.features, null);
  assert.equal(c.can.size, 0);
  assert.equal(c.reads.size, 0);
});

test('un domaine non chargé ne commande rien', () => {
  // Cas courant : l'intégration a été retirée, l'entité est restée dans le
  // registre. Proposer un bouton qui ne peut pas aboutir serait mentir.
  const services = { light: { turn_on: {} } };
  const avec = entityCaps('cover.x', et('open', { supported_features: 15 }), services);
  assert.equal(avec.can.size, 0);
  const sans = entityCaps('light.x', et('on', { supported_color_modes: ['xy'] }), services);
  assert.equal(sans.can.has('set_color'), true);
});

// ── Par appareil ────────────────────────────────────────────────────────────

test('un appareil réunit les capacités de ses entités', () => {
  // Le thermostat porte sa consigne sur `climate` et sa batterie sur `sensor` :
  // l'appelant ne doit pas avoir à parcourir les entités lui-même.
  const appareil = { id: 'd1', entities: ['climate.t', 'sensor.t_batterie'], domains: ['climate', 'sensor'] };
  const states = {
    'climate.t': et('heat', { supported_features: 401, current_temperature: 20 }),
    'sensor.t_batterie': et('87', { device_class: 'battery' }),
  };
  const c = deviceCaps(appareil, states);
  assert.equal(c.can.has('set_temperature'), true);
  assert.equal(c.reads.has('battery'), true);
  assert.equal(c.reads.has('temperature'), true);
  // Le détail survit à l'union.
  assert.equal(c.byEntity.get('sensor.t_batterie').can.size, 0);
  assert.deepEqual(c.domains, ['climate', 'sensor']);
});

test('un appareil sans entités ne fait rien deviner', () => {
  assert.equal(deviceCaps(null).can.size, 0);
  assert.equal(deviceCaps({ id: 'd' }).can.size, 0);
});

test('installer une mise à jour n’est pas piloter la maison', () => {
  // Cas le plus courant d'une installation reelle : un depot HACS cree un
  // appareil dont la seule entite est une mise a jour. Ils sont des dizaines,
  // et ils ecraseraient tout classement des appareils par capacite.
  const depot = { id: 'd1', entities: ['update.un_depot'], domains: ['update'] };
  const c = deviceCaps(depot, { 'update.un_depot': et('off', { supported_features: 21 }) });
  assert.equal(c.can.has('install'), true, 'la capacité existe bel et bien');
  assert.equal(c.controls.size, 0, 'mais ce n’est pas du pilotage');
  assert.equal(c.controllable, false);
});

test('une entité de réglage ne rend pas un appareil pilotable', () => {
  // « Activer les logs de debug » est commandable, et n'a rien a faire sur la
  // carte d'un appareil.
  const appareil = { id: 'd1', entities: ['switch.debug'], domains: ['switch'] };
  const states = { 'switch.debug': et('off') };
  const meta = new Map([['switch.debug', { category: 'config' }]]);
  assert.equal(deviceCaps(appareil, states, null, meta).controllable, false);
  // Sans la categorie, rien ne permet de le savoir : l'appareil reste pilotable.
  assert.equal(deviceCaps(appareil, states).controllable, true);
});

test('un appareil mixte reste pilotable malgré sa maintenance', () => {
  const appareil = { id: 'd1', entities: ['light.a', 'update.a'], domains: ['light', 'update'] };
  const c = deviceCaps(appareil, {
    'light.a': et('on', { supported_color_modes: ['brightness'] }),
    'update.a': et('off', { supported_features: 1 }),
  });
  assert.equal(c.controllable, true);
  assert.equal(c.controls.has('set_brightness'), true);
  assert.equal(c.controls.has('install'), false);
  assert.equal(c.can.has('install'), true);
});

test('l’inventaire compte les appareils par capacité', () => {
  const devices = new Map([
    ['d1', { id: 'd1', entities: ['light.a'], domains: ['light'] }],
    ['d2', { id: 'd2', entities: ['light.b'], domains: ['light'] }],
    ['d3', { id: 'd3', entities: ['sensor.c'], domains: ['sensor'] }],
  ]);
  const states = {
    'light.a': et('on', { supported_color_modes: ['xy'] }),
    'light.b': et('off', { supported_color_modes: ['onoff'] }),
    'sensor.c': et('5', { device_class: 'humidity' }),
  };
  const { parCapacite, parDomaine } = capsSummary(devices, states);
  assert.equal(parCapacite.get('set_color'), 1);      // seule la lampe xy
  assert.equal(parCapacite.get('turn_on'), 2);        // les deux lampes
  assert.equal(parDomaine.get('light').entities, 2);
  assert.equal(parDomaine.get('sensor').entities, 1);
  assert.equal(parDomaine.get('sensor').reads.has('humidity'), true);
});
