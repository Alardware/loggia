/* « Que des prises » (chantier Prises, P1, § 3.4 et 6.4).
 *
 * Une prise est un switch QUI MESURE. Objets et les pièces appliquent la règle
 * de prises.js (`estPrise`) sur ce que dit l'index de Loggia : un switch qui
 * ne mesure pas rejoint IoT ; le pont de Zigbee2MQTT (Paramètres ›
 * Interrupteurs) et la sirène (Sécurité) n'ont plus de carte, et la note en
 * pied du filtre Prises le dit, avec leurs noms.
 *
 * `objetsDeLaMaison`, `roomEntitiesBrutes`, `priseDe`… vivent dans App.jsx,
 * qui n'exporte que l'application : sous `?prises_objets`, un crochet de
 * chargement leur ajoute un export — le patron de tests/chauffage_zones.test.mjs. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';

import { resolveClimate } from '../src/resolve.js';
import { area, device, entity, state, states, ctxOf } from './fixtures.mjs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
const APP = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

/* Sa maison, telle que l'inventaire du 13/10 la décrit : trois prises Zigbee
 * qui mesurent (NAS, PC, lave-vaisselle), le poêle posé sur l'appareil qui
 * porte les puissances de la maison, la lumière extérieure déclarée lumière,
 * un switch sans appareil, le pont de Zigbee2MQTT et la sirène de l'alarme. */
function maison() {
  // La classe d'une mesure vit au registre : c'est là que la règle la lit, comme le serveur.
  const mesure = (id, dev, classe) => ({ ...entity(id, { device: dev }), device_class: classe });
  const prise = (id, nom, dev, piece) => [
    entity('switch.' + id, { device: dev }), mesure('sensor.' + id + '_power', dev, 'power'), mesure('sensor.' + id + '_energy', dev, 'energy'),
    entity('switch.' + id + '_child_lock', { device: dev, category: 'config' }),
  ];
  const etats = (id, nom, w) => [
    state('switch.' + id, 'on', { friendly_name: nom }),
    state('sensor.' + id + '_power', String(w), { friendly_name: nom + ' Power', device_class: 'power', unit_of_measurement: 'W' }),
    state('sensor.' + id + '_energy', '12.5', { friendly_name: nom + ' Energy', device_class: 'energy', unit_of_measurement: 'kWh' }),
    state('switch.' + id + '_child_lock', 'off', { friendly_name: nom + ' Child lock' }),
  ];
  return {
    areas: [area('bureau', 'Bureau'), area('cuisine', 'Cuisine'), area('salon', 'Salon')],
    devices: [
      device('d_nas', 'Prise NAS (Zephyr)', 'bureau', { manufacturer: 'Tuya', model: 'Smart plug (with power monitoring)' }),
      device('d_pc', 'Prise PC Bureau (Atlas)', 'bureau', { manufacturer: 'Tuya', model: 'Smart plug (with power monitoring)' }),
      device('d_lv', 'Prise lave-vaisselle', 'cuisine', { manufacturer: 'Tuya', model: 'Smart plug (with power monitoring)' }),
      device('d_ext', 'Lumière extérieur', 'salon', { manufacturer: 'Tuya', model: 'Smart plug (with power monitoring)' }),
      device('d_maison', 'Maison', 'salon', { manufacturer: 'Home', model: 'MQTT' }),
      device('d_pont', 'Zigbee2MQTT Bridge', null, { manufacturer: 'Zigbee2MQTT', model: 'Bridge' }),
      device('d_sirene', 'Alarme sirène', 'salon', { manufacturer: 'Heiman', model: 'Siren' }),
    ],
    entities: [
      ...prise('prise_nas_zephyr', 'Prise NAS (Zephyr)', 'd_nas'), ...prise('prise_pc_bureau_atlas', 'Prise PC Bureau (Atlas)', 'd_pc'),
      ...prise('prise_lave_vaisselle', 'Prise lave-vaisselle', 'd_lv'), ...prise('lumiere_exterieur', 'Lumière extérieur', 'd_ext'),
      entity('switch.poele', { device: 'd_maison' }), mesure('sensor.energie_maison_puissance', 'd_maison', 'power'),
      mesure('sensor.solaire_production_puissance', 'd_maison', 'power'),
      entity('switch.radiateur_salon', { area: 'salon' }),
      entity('switch.zigbee2mqtt_bridge_permit_join', { device: 'd_pont' }),
      entity('switch.alarme_sirene_siren_on', { device: 'd_sirene' }),
    ],
    floors: [],
    states: states(
      ...etats('prise_nas_zephyr', 'Prise NAS (Zephyr)', 4), ...etats('prise_pc_bureau_atlas', 'Prise PC Bureau (Atlas)', 146),
      ...etats('prise_lave_vaisselle', 'Prise lave-vaisselle', 0), ...etats('lumiere_exterieur', 'Lumière extérieur', 12),
      state('switch.poele', 'on', { friendly_name: 'Poêle' }),
      state('sensor.energie_maison_puissance', '1840', { friendly_name: 'Énergie maison puissance', device_class: 'power', unit_of_measurement: 'W' }),
      state('sensor.solaire_production_puissance', '2100', { friendly_name: 'Solaire production puissance', device_class: 'power', unit_of_measurement: 'W' }),
      state('switch.radiateur_salon', 'on', { friendly_name: 'Radiateur salon' }),
      state('switch.zigbee2mqtt_bridge_permit_join', 'off', { friendly_name: 'Zigbee2MQTT Bridge Permit join' }),
      state('switch.alarme_sirene_siren_on', 'off', { friendly_name: 'Alarme sirène Siren on' }),
    ),
    energyPrefs: null,
  };
}

const SUFFIXE = '?prises_objets';
let chargement = null;
function app() {
  if (!chargement) {
    chargement = (async () => {
      if (typeof globalThis.requestAnimationFrame !== 'function') {
        globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
        globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
      }
      register('./jsx-hooks.mjs', import.meta.url);
      register('data:text/javascript,' + encodeURIComponent([
        'export async function load(url, ctx, next) {',
        `  if (!url.endsWith('/src/App.jsx${SUFFIXE}')) return next(url, ctx);`,
        `  const r = await next(url.slice(0, -${SUFFIXE.length}), ctx);`,
        "  return { ...r, source: String(r.source) + ';export { objetsDeLaMaison, roomEntitiesBrutes, priseDe, ecartDe, switchsEcartes, noteEcartes };' };",
        '}',
      ].join('\n')));
      const { setLoggiaState } = await import('../src/state.js');
      const mod = await import(new URL('../src/App.jsx' + SUFFIXE, import.meta.url).href);
      return { setLoggiaState, ...mod };
    })();
  }
  return chargement;
}

async function avecMaison(fx, f) {
  const a = await app();
  const ctx = ctxOf(fx, {});
  a.setLoggiaState({ index: ctx.index, ent: { switchLights: ['switch.lumiere_exterieur'] }, cfg: {}, resolved: { climate: resolveClimate(ctx) } });
  try {
    return await f(a);
  } finally {
    a.setLoggiaState({ index: null, ent: {}, cfg: {}, resolved: null });
  }
}

test('P1 : une prise est un switch qui mesure — ses capteurs à elle, jamais ceux de la maison', async () => {
  const fx = maison();
  await avecMaison(fx, ({ priseDe }) => {
    assert.deepEqual(priseDe(fx.states, 'switch.prise_nas_zephyr'), { prise: true, puissance: 'sensor.prise_nas_zephyr_power', energie: 'sensor.prise_nas_zephyr_energy' });
    assert.deepEqual(priseDe(fx.states, 'switch.poele'), { prise: false, puissance: null, energie: null }, 'aucun capteur de son appareil ne partage un mot avec « Poêle »');
    assert.equal(priseDe(fx.states, 'switch.lumiere_exterieur').prise, false, 'déclarée lumière');
    assert.equal(priseDe(fx.states, 'switch.radiateur_salon').prise, false, 'sans appareil ni classe');
    assert.equal(priseDe(fx.states, 'switch.prise_nas_zephyr_child_lock').prise, false, 'un switch de configuration');
    assert.equal(priseDe(fx.states, 'switch.zigbee2mqtt_bridge_permit_join').prise, false);
    assert.equal(priseDe(fx.states, 'sensor.prise_nas_zephyr_power').prise, false, 'seul un switch');
  });
});

test('Objets : les prises sous Prises, les switch qui ne mesurent pas sous IoT ; ni pont ni sirène', async () => {
  const fx = maison();
  await avecMaison(fx, ({ objetsDeLaMaison }) => {
    const objets = objetsDeLaMaison({ states: fx.states }, [], new Set());
    const filtre = (id) => (objets.find(o => o.cle === id) || { filtres: null }).filtres;
    for (const id of ['switch.prise_nas_zephyr', 'switch.prise_pc_bureau_atlas', 'switch.prise_lave_vaisselle']) assert.deepEqual(filtre(id), ['prises'], id);
    assert.deepEqual(filtre('switch.poele'), ['iot'], 'le poêle ne mesure pas : IoT');
    assert.deepEqual(filtre('switch.radiateur_salon'), ['iot']);
    assert.deepEqual(filtre('switch.lumiere_exterieur'), ['lumieres']);
    const cles = objets.map(o => o.cle);
    assert.ok(!cles.includes('switch.zigbee2mqtt_bridge_permit_join'), 'le pont vit dans Paramètres › Interrupteurs');
    assert.ok(!cles.includes('switch.alarme_sirene_siren_on'), 'la sirène vit dans Sécurité');
    assert.ok(!cles.some(c => c.endsWith('_child_lock')), 'les switch de configuration restent écartés');
  });
});

test('Objets : un pont ajouté à la main reste — l’éditeur a le dernier mot —, sous IoT', async () => {
  const fx = maison();
  await avecMaison(fx, ({ objetsDeLaMaison }) => {
    const o = objetsDeLaMaison({ states: fx.states }, ['switch.zigbee2mqtt_bridge_permit_join'], new Set()).find(x => x.cle === 'switch.zigbee2mqtt_bridge_permit_join');
    assert.ok(o);
    assert.deepEqual(o.filtres, ['iot']);
  });
});

test('Pièce : le pont et la sirène n’y ont pas de carte ; les prises et les autres switch gardent la leur', async () => {
  const fx = maison();
  await avecMaison(fx, ({ roomEntitiesBrutes }) => {
    assert.ok(roomEntitiesBrutes({ states: fx.states }, 'Bureau').includes('switch.prise_nas_zephyr'));
    const salon = roomEntitiesBrutes({ states: fx.states }, 'Salon');
    assert.ok(!salon.includes('switch.alarme_sirene_siren_on'), 'la sirène');
    assert.ok(salon.includes('switch.radiateur_salon') && salon.includes('switch.poele'), 'un switch qui ne mesure pas garde sa carte de pièce');
  });
});

test('la note en pied : les noms réels, le pont d’abord, où les trouver', async () => {
  const fx = maison();
  await avecMaison(fx, ({ switchsEcartes, noteEcartes, ecartDe }) => {
    assert.equal(ecartDe(fx.states, 'switch.zigbee2mqtt_bridge_permit_join'), 'pont');
    assert.equal(ecartDe(fx.states, 'switch.alarme_sirene_siren_on'), 'sirene');
    assert.equal(ecartDe(fx.states, 'switch.poele'), null);
    const e = switchsEcartes(fx.states);
    assert.deepEqual(e.map(x => [x.id, x.ou]), [['switch.zigbee2mqtt_bridge_permit_join', 'pont'], ['switch.alarme_sirene_siren_on', 'sirene']]);
    assert.equal(noteEcartes(e), 'Plus ici : Zigbee2MQTT Bridge Permit join (Paramètres › Interrupteurs) et Alarme sirène Siren on (Sécurité).');
    assert.equal(noteEcartes(e.slice(1)), 'Plus ici : Alarme sirène Siren on (Sécurité).');
  });
  // Seulement sous le filtre Prises, et seulement s'il y a des switch écartés.
  assert.ok(APP.includes("const ecartes = actuel === 'prises' ? switchsEcartes(S) : [];"));
  assert.ok(APP.includes("{actuel === 'prises' && ecartes.length > 0 && ("));
  assert.ok(APP.includes('<Fi i="triangle-warning" size={12} /><span>{noteEcartes(ecartes)}</span>'));
});
