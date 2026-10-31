// ─────────────────────────────────────────────────────────────────────────────
// L'eau chaude et la borne de recharge (chantier G3, E2 et E3 ; ADR 0302).
//
//  — Un `water_heater` a sa carte et sa popup : la température de l'eau, la
//    consigne dans ses bornes, le mode TRADUIT (les sept états standard ; un
//    mode du fabricant reste tel quel), marche et arrêt.
//  — La borne se trouve SANS réglage, par famille : une puissance, un courant
//    réglable, un indice de recharge, confirmés par une ligne des appareils
//    mesurés du tableau Énergie. Un seul candidat, sinon rien. Elle alimente
//    `evNow`, que seul un réglage remplissait.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { vueEauChaude, bornerConsigne, ordreMarche } from '../src/eauchaude.js';
// Les mots et la phrase de la carte générique (chantier G1) : la carte « Eau chaude » les reprend.
import { modeChauffeEau } from '../src/objets.js';
import { trouverBorne, borneEnCharge } from '../src/borne.js';
import { vueBorne, bornerCourant, kwhDepuis } from '../src/bornevue.js';
import { resolveEnergy } from '../src/resolve.js';
import { area, device, entity, state, states, ctxOf, indexOf } from './fixtures.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');

// ── L'eau chaude ────────────────────────────────────────────────────────────

const ballon = (etat, attrs = {}) => ({ 'water_heater.ballon': { state: etat, attributes: {
  friendly_name: 'Ballon', current_temperature: 52, temperature: 55, min_temp: 40, max_temp: 65,
  operation_mode: etat, operation_list: ['off', 'eco', 'heat_pump', 'boost_fabricant'], supported_features: 1 | 2 | 4, away_mode: 'off', ...attrs } } });

test('les modes : ceux de G1, traduits ; un mode du fabricant reste tel quel', () => {
  assert.equal(modeChauffeEau('heat_pump'), 'Pompe à chaleur');
  assert.equal(modeChauffeEau('boost_fabricant'), 'boost_fabricant');
  const v = vueEauChaude({ id: 'water_heater.ballon', S: ballon('eco') });
  assert.equal(v.motMode, 'Éco');
});

test('la carte : l’eau, la consigne, le mode', () => {
  const v = vueEauChaude({ id: 'water_heater.ballon', S: ballon('eco') });
  // La phrase de la carte générique (G1) : le mode, puis l'eau et la consigne.
  assert.equal(v.phrase.texte, 'Éco · 52° → 55°');
  assert.equal(v.marche, true);
  assert.equal(v.chauffe, false, 'rien ne dit qu’il chauffe : pas d’orange (G1)');
  assert.equal(vueEauChaude({ id: 'water_heater.ballon', S: ballon('eco', { hvac_action: 'heating' }) }).chauffe, true);
  assert.equal(v.chiffre, 52);
  assert.deepEqual([v.min, v.max], [40, 65]);
  assert.deepEqual(v.modes.map(m => m.label), ['Arrêt', 'Éco', 'Pompe à chaleur', 'boost_fabricant']);
  assert.equal(v.sait.absence, true);
  assert.equal(vueEauChaude({ id: 'water_heater.ballon', S: ballon('off') }).phrase.texte, 'Arrêt · 52°');
  assert.equal(vueEauChaude({ id: 'water_heater.ballon', S: ballon('unavailable') }).mort, true);
  assert.equal(vueEauChaude({ id: 'water_heater.ballon', S: ballon('eco', { away_mode: 'on' }) }).phrase.texte, 'Éco · 52° → 55° · Absence');
});

test('la consigne reste dans les bornes, au pas de l’appareil', () => {
  assert.equal(bornerConsigne(80, 40, 65), 65);
  assert.equal(bornerConsigne(30, 40, 65), 40);
  assert.equal(bornerConsigne(55.4, 40, 65, 0.5), 55.5);
  assert.equal(bornerConsigne('x', 40, 65), null);
});

test('marche et arrêt : le mode `off` de sa liste, sinon le service dédié', () => {
  const v = vueEauChaude({ id: 'water_heater.ballon', S: ballon('eco') });
  assert.deepEqual(ordreMarche('water_heater.ballon', v, false), ['water_heater', 'set_operation_mode', { entity_id: 'water_heater.ballon', operation_mode: 'off' }]);
  assert.deepEqual(ordreMarche('water_heater.ballon', v, true), ['water_heater', 'set_operation_mode', { entity_id: 'water_heater.ballon', operation_mode: 'eco' }]);
  const sansOff = vueEauChaude({ id: 'water_heater.b', S: { 'water_heater.b': { state: 'eco', attributes: { operation_list: ['eco', 'performance'], supported_features: 8 } } } });
  assert.deepEqual(ordreMarche('water_heater.b', sansOff, false), ['water_heater', 'turn_off', { entity_id: 'water_heater.b' }]);
  const muet = vueEauChaude({ id: 'water_heater.c', S: { 'water_heater.c': { state: 'eco', attributes: { supported_features: 1 } } } });
  assert.equal(ordreMarche('water_heater.c', muet, false), null, 'il ne sait pas s’arrêter : pas de bouton');
});

test('la carte et la popup se chargent à la demande, et la carte générique cède', () => {
  const fiches = lire('src', 'cartes', 'eauborne.jsx');
  assert.match(fiches, /lazyRecharge\(\(\) => import\('\.\.\/carteeau\.jsx'\)\)/);
  assert.match(fiches, /lazyRecharge\(\(\) => import\('\.\.\/ficheeau\.jsx'\)\)/);
  assert.doesNotMatch(fiches, /^import .*from '\.\.\/(carteeau|ficheeau|carteborne|ficheborne)\.jsx'/m, 'jamais au démarrage');
  assert.match(lire('src', 'appareils', 'fiches.jsx'), /from '\.\.\/cartes\/eauborne\.jsx'/);
  const cartes = lire('src', 'cartescustom', 'cartes.jsx');
  assert.match(cartes, /water_heater/);
  assert.match(cartes, /CarteEauChaude/);
  const fiche = lire('src', 'ficheeau.jsx');
  assert.match(fiche, /water_heater', 'set_temperature'/);
  assert.match(fiche, /'set_operation_mode'/);
  assert.match(fiche, /<ListeChoix/);
  assert.doesNotMatch(fiche, /<select/);
  assert.match(fiche, /eau_chaude/, 'l’option du mode absence pendant les vacances');
});

// ── La borne ────────────────────────────────────────────────────────────────

const garage = (extra = {}) => ({
  areas: [area('garage', 'Garage')],
  devices: [device('d_borne', 'Wallbox', 'garage'), device('d_pac', 'Pompe à chaleur', 'garage')],
  entities: [
    entity('sensor.borne_puissance', { device: 'd_borne' }), entity('sensor.borne_energie', { device: 'd_borne' }),
    entity('number.borne_courant_max', { device: 'd_borne', category: 'config' }),
    entity('binary_sensor.borne_branchee', { device: 'd_borne' }), entity('sensor.borne_statut', { device: 'd_borne' }),
    entity('switch.borne_charge', { device: 'd_borne' }),
    // Une pompe à chaleur à courant limité : puissance + courant, mais aucun indice de recharge.
    entity('sensor.pac_puissance', { device: 'd_pac' }), entity('number.pac_courant', { device: 'd_pac' }),
    entity('sensor.pac_energie', { device: 'd_pac' }),
    ...(extra.entities || []),
  ],
  states: states(
    state('sensor.borne_puissance', '7200', { device_class: 'power', unit_of_measurement: 'W', friendly_name: 'Wallbox Puissance' }),
    state('sensor.borne_energie', '1520.4', { device_class: 'energy', unit_of_measurement: 'kWh' }),
    state('number.borne_courant_max', '16', { device_class: 'current', unit_of_measurement: 'A', min: 6, max: 32, step: 1 }),
    state('binary_sensor.borne_branchee', 'on', { device_class: 'plug' }),
    state('sensor.borne_statut', 'charging', { device_class: 'enum', options: ['disconnected', 'connected', 'charging'] }),
    state('switch.borne_charge', 'on', {}),
    state('sensor.pac_puissance', '900', { device_class: 'power', unit_of_measurement: 'W' }),
    state('number.pac_courant', '10', { device_class: 'current', unit_of_measurement: 'A', min: 6, max: 16 }),
    state('sensor.pac_energie', '300', { device_class: 'energy', unit_of_measurement: 'kWh' }),
  ),
  energyPrefs: { energy_sources: [], device_consumption: extra.mesures || [{ stat_consumption: 'sensor.borne_energie' }, { stat_consumption: 'sensor.pac_energie' }] },
});

test('la borne se reconnaît à sa famille, et le tableau Énergie la confirme', () => {
  const fx = garage();
  const b = trouverBorne({ index: indexOf(fx), states: fx.states, energyPrefs: fx.energyPrefs });
  assert.deepEqual(b, { appareil: 'd_borne', puissance: 'sensor.borne_puissance', courant: 'number.borne_courant_max',
    prise: 'binary_sensor.borne_branchee', statut: 'sensor.borne_statut', interrupteur: 'switch.borne_charge', energie: 'sensor.borne_energie' });
});

test('sans ligne des appareils mesurés, pas de borne', () => {
  const fx = garage({ mesures: [{ stat_consumption: 'sensor.pac_energie' }] });
  assert.equal(trouverBorne({ index: indexOf(fx), states: fx.states, energyPrefs: fx.energyPrefs }), null);
});

test('deux bornes : rien', () => {
  const fx = garage();
  fx.devices.push(device('d_borne2', 'Seconde', 'garage'));
  fx.entities.push(entity('sensor.b2_p', { device: 'd_borne2' }), entity('number.b2_a', { device: 'd_borne2' }), entity('binary_sensor.b2_plug', { device: 'd_borne2' }), entity('sensor.b2_e', { device: 'd_borne2' }));
  Object.assign(fx.states, states(state('sensor.b2_p', '0', { device_class: 'power' }), state('number.b2_a', '16', { device_class: 'current', min: 6, max: 32 }),
    state('binary_sensor.b2_plug', 'off', { device_class: 'plug' }), state('sensor.b2_e', '1', { device_class: 'energy' })));
  fx.energyPrefs.device_consumption.push({ stat_consumption: 'sensor.b2_e' });
  assert.equal(trouverBorne({ index: indexOf(fx), states: fx.states, energyPrefs: fx.energyPrefs }), null);
});

test('elle alimente `evNow`, et la fiche garde la main', () => {
  const fx = garage();
  const e = resolveEnergy(ctxOf(fx));
  assert.equal(e.haids.evNow, 'sensor.borne_puissance');
  assert.equal(e.borne.puissance, 'sensor.borne_puissance');
});

test('ce que montre la borne : l’état, la puissance, le courant, la pause', () => {
  const fx = garage();
  const b = trouverBorne({ index: indexOf(fx), states: fx.states, energyPrefs: fx.energyPrefs });
  const v = vueBorne({ borne: b, S: fx.states });
  assert.equal(v.etat, 'charge');
  assert.equal(v.phrase.texte, 'En charge');
  assert.equal(v.watts, 7200);
  assert.deepEqual(v.courant, { valeur: 16, min: 6, max: 32, pas: 1, unite: 'A' });
  assert.equal(v.pause, 'pause');
  const S2 = { ...fx.states, 'switch.borne_charge': { state: 'off', attributes: {} }, 'sensor.borne_puissance': { state: '0', attributes: { device_class: 'power', unit_of_measurement: 'W' } },
    'sensor.borne_statut': { state: 'connected', attributes: {} } };
  assert.equal(vueBorne({ borne: b, S: S2 }).etat, 'pause');
  assert.equal(vueBorne({ borne: b, S: S2 }).pause, 'reprise');
  const S3 = { ...S2, 'binary_sensor.borne_branchee': { state: 'off', attributes: {} }, 'sensor.borne_statut': { state: 'disconnected', attributes: {} } };
  assert.equal(vueBorne({ borne: b, S: S3 }).etat, 'debranchee');
  assert.equal(vueBorne({ borne: b, S: S3 }).pause, null, 'sans voiture, ni pause ni reprise');
  assert.equal(vueBorne({ borne: { ...b, interrupteur: null }, S: fx.states }).pause, null, 'sans interrupteur, jamais');
});

test('le courant dans ses bornes, les kWh depuis le branchement', () => {
  assert.equal(bornerCourant(40, { min: 6, max: 32, pas: 1 }), 32);
  assert.equal(bornerCourant(3, { min: 6, max: 32, pas: 1 }), 6);
  assert.equal(kwhDepuis([{ state: '1510.0' }, { state: '1515.2' }], { state: '1520.4', attributes: { unit_of_measurement: 'kWh' } }).toFixed(1), '10.4');
  assert.equal(kwhDepuis([{ state: '2000' }], { state: '1520.4', attributes: {} }), null, 'un index remis à zéro : on ne sait pas');
  assert.equal(kwhDepuis(null, { state: '1' }), null);
});

test('la popup de la borne demande avant la pause, et se charge à la demande', () => {
  const fiches = lire('src', 'cartes', 'eauborne.jsx');
  assert.match(fiches, /lazyRecharge\(\(\) => import\('\.\.\/carteborne\.jsx'\)\)/);
  assert.match(fiches, /lazyRecharge\(\(\) => import\('\.\.\/ficheborne\.jsx'\)\)/);
  const fiche = lire('src', 'ficheborne.jsx');
  assert.match(fiche, /'number', 'set_value'/);
  assert.match(fiche, /Mettre la charge en pause \?/);
  assert.match(fiche, /Reprendre la charge \?/);
});

test('Objets compte la borne « active » quand elle charge', () => {
  const b = { puissance: 'sensor.p', statut: 'sensor.s' };
  assert.equal(borneEnCharge(b, { 'sensor.p': { state: '7200', attributes: { unit_of_measurement: 'W' } } }), true);
  assert.equal(borneEnCharge(b, { 'sensor.p': { state: '0', attributes: {} }, 'sensor.s': { state: 'charging', attributes: {} } }), true);
  assert.equal(borneEnCharge(b, { 'sensor.p': { state: 'unavailable', attributes: {} } }), false);
  assert.equal(borneEnCharge(null, {}), false);
});
