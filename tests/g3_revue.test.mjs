// ─────────────────────────────────────────────────────────────────────────────
// Relecture indépendante du chantier G3 (30/10) : les points 2, 3, 4 et 6.
//
//  2. L'autonomie de la batterie divisait par une consommation qui oubliait ce
//     que la batterie rend : le soir, « ≈ 7 j » au lieu d'environ 9 h.
//  3. Sans `stat_rate`, un onduleur prenait la PREMIÈRE puissance de son
//     appareil : sur un micro-onduleur à batterie, la batterie à −300 W.
//  4. Plusieurs batteries s'additionnaient mal (deux puissances inversées, ou
//     un mélange des deux conventions).
//  6. La notification « Surplus solaire » ne lit que ce que la FICHE désigne :
//     la découverte ne la déclenche pas (rare et actionnable).
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveEnergy } from '../src/resolve.js';
import { puissanceBatterie, autonomieBatterie, consoPourAutonomie, texteAutonomie } from '../src/energiebatterie.js';
import { device, entity, state, states, ctxOf } from './fixtures.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (v) => (id) => (id in v ? v[id] : null);
const ctx = (sources) => ctxOf({ areas: [], floors: [], devices: [], entities: [], states: {}, energyPrefs: { energy_sources: sources, device_consumption: [] } });

test('2. l’autonomie divise par ce que la MAISON consomme, batterie comprise', () => {
  // Le soir : solaire 0, la batterie rend 800 W, le réseau 50 W — la maison consomme 850 W.
  assert.equal(consoPourAutonomie({ consoW: 50, batW: -800 }), 850);
  assert.equal(texteAutonomie(autonomieBatterie({ reserveKwh: 8, consoW: consoPourAutonomie({ consoW: 50, batW: -800 }) })), texteAutonomie(9));
  // En charge, ce qui entre dans la batterie n'est pas consommé par la maison.
  assert.equal(consoPourAutonomie({ consoW: 2500, batW: 2000 }), 500);
  // Un capteur de la maison fait foi tel quel.
  assert.equal(consoPourAutonomie({ consoW: 900, batW: -800, mesuree: true }), 900);
  // Ce qui n'a pas de sens ne s'affiche pas : rien de lisible, une maison à moins de 50 W.
  assert.equal(consoPourAutonomie({ consoW: null, batW: -800 }), null);
  assert.equal(consoPourAutonomie({ consoW: 20, batW: 0 }), null);
  const vue = readFileSync(join(RACINE, 'src', 'views', 'energie.jsx'), 'utf8');
  assert.match(vue, /consoPourAutonomie\(\{ consoW, batW, mesuree: avail\(EN\.consoMaison\) \}\)/);
});

test('3. sans `stat_rate`, la puissance voisine seulement si c’est la SEULE de l’appareil', () => {
  const W = { device_class: 'power', unit_of_measurement: 'W' };
  const e = resolveEnergy(ctxOf({
    areas: [], floors: [],
    devices: [device('d_toit', 'Toiture'), device('d_balcon', 'Balcon')],
    entities: [
      entity('sensor.toit_kwh', { device: 'd_toit' }), entity('sensor.toit_w', { device: 'd_toit' }),
      entity('sensor.balcon_kwh', { device: 'd_balcon' }), entity('sensor.balcon_batterie_w', { device: 'd_balcon' }),
      entity('sensor.balcon_pv1_w', { device: 'd_balcon' }), entity('sensor.balcon_pv2_w', { device: 'd_balcon' }),
    ],
    states: states(state('sensor.toit_w', '1900', W), state('sensor.balcon_batterie_w', '-300', W),
      state('sensor.balcon_pv1_w', '250', W), state('sensor.balcon_pv2_w', '240', W)),
    energyPrefs: { energy_sources: [
      { type: 'solar', stat_energy_from: 'sensor.toit_kwh' },
      { type: 'solar', stat_energy_from: 'sensor.balcon_kwh' }], device_consumption: [] },
  }));
  // Le toit a une seule puissance : elle compte. Le balcon en a trois : on ne sait pas laquelle, rien pour lui.
  assert.equal(e.haids.solarNow, 'sensor.toit_w');
  assert.equal(e.haids.solarNowParts, null);
});

test('4. deux batteries « inversées » : les deux comptent', () => {
  const e = resolveEnergy(ctx([
    { type: 'battery', stat_energy_from: 'sensor.a_out', power_config: { stat_rate_inverted: 'sensor.a_inv' } },
    { type: 'battery', stat_energy_from: 'sensor.b_out', power_config: { stat_rate_inverted: 'sensor.b_inv' } }]));
  assert.deepEqual(e.haids.batNowParts, ['sensor.a_inv', 'sensor.b_inv']);
  assert.equal(puissanceBatterie(e.haids, lire({ 'sensor.a_inv': 400, 'sensor.b_inv': 400 })), 800);
});

test('4. une batterie au sens de Home Assistant et une « inversée » : la somme des deux conventions', () => {
  const e = resolveEnergy(ctx([
    { type: 'battery', stat_energy_from: 'sensor.a_out', stat_rate: 'sensor.a_w' },
    { type: 'battery', stat_energy_from: 'sensor.b_out', power_config: { stat_rate_inverted: 'sensor.b_inv' } }]));
  // A rend 600 W (+600 chez Home Assistant), B se charge de 100 W : −500 au sens de Loggia.
  assert.equal(puissanceBatterie(e.haids, lire({ 'sensor.a_w': 600, 'sensor.b_inv': 100 })), -500);
  // Une seule des deux lisible : elle seule.
  assert.equal(puissanceBatterie(e.haids, lire({ 'sensor.a_w': 600 })), -600);
});

test('6. « Surplus solaire » ne lit que ce que la fiche désigne, jamais la découverte', () => {
  const derive = readFileSync(join(RACINE, 'src', 'app', 'derive.jsx'), 'utf8');
  const i = derive.indexOf('function deriveNotifs(');
  const corps = derive.slice(i, derive.indexOf('\n}\n', i));
  // Le flux net : la fiche seule. L'injection et le surplus : comme avant G3, par `enHaids` (contre-relecture du 30/10).
  assert.match(corps, /const net = sommeLue\(idsDe\(ficheEnergie\(\), 'consoNow'\), wattsOf\);/);
  assert.match(corps, /const EH = enHaids\(\);/);
  assert.match(corps, /wattsOf\(EH\.injectionNow \|\| EH\.surplusNow\)/);
  const adr = readFileSync(join(RACINE, 'docs', 'decisions', '0302-le-tableau-energie-en-entier.md'), 'utf8');
  assert.match(adr, /Surplus solaire/);
});

test('contre-relecture : UN SEUL onduleur à deux puissances (AC et DC) garde son solaire du moment, comme avant', () => {
  const W = { device_class: 'power', unit_of_measurement: 'W' };
  const e = resolveEnergy(ctxOf({
    areas: [], floors: [], devices: [device('d_ond', 'Onduleur')],
    entities: [entity('sensor.ond_kwh', { device: 'd_ond' }), entity('sensor.ond_ac_w', { device: 'd_ond' }), entity('sensor.ond_dc_w', { device: 'd_ond' })],
    states: states(state('sensor.ond_ac_w', '1800', W), state('sensor.ond_dc_w', '1900', W)),
    energyPrefs: { energy_sources: [{ type: 'solar', stat_energy_from: 'sensor.ond_kwh' }], device_consumption: [] },
  }));
  assert.equal(e.haids.solarNow, 'sensor.ond_ac_w');
});

test('contre-relecture : sans fiche, l’injection découverte (deux capteurs) déclenche « Surplus solaire » comme avant', () => {
  const src = [{ type: 'grid', stat_energy_from: 'sensor.imp', stat_energy_to: 'sensor.exp', power_config: { stat_rate_from: 'sensor.imp_w', stat_rate_to: 'sensor.exp_w' } }];
  assert.equal(resolveEnergy(ctx(src)).haids.injectionNow, 'sensor.exp_w');
  const derive = readFileSync(join(RACINE, 'src', 'app', 'derive.jsx'), 'utf8');
  const i = derive.indexOf('function deriveNotifs(');
  const corps = derive.slice(i, derive.indexOf('\n}\n', i));
  // Évalué : la fiche vide, l'injection découverte à 400 W — la notification part.
  const debut = corps.indexOf('  const EH = enHaids();');
  const fin = corps.indexOf('\n', corps.indexOf('  if (sur != null && sur > 100)'));
  // eslint-disable-next-line no-new-func
  const f = new Function('enHaids', 'ficheEnergie', 'idsDe', 'sommeLue', 'wattsOf', 'tr', 'out', corps.slice(debut, fin) + '\nreturn out;');
  const lu = (v) => (id) => (id in v ? v[id] : null);
  const idsDe = (E, c) => (typeof E[c] === 'string' ? [E[c]] : Array.isArray(E[c + 'Parts']) ? E[c + 'Parts'] : []);
  const sommeLue = (ids, l) => ids.reduce((s, id) => (l(id) == null ? s : (s || 0) + l(id)), null);
  const avec = (EH, fiche, w) => f(() => EH, () => fiche, idsDe, sommeLue, lu(w), (x) => x, []);
  assert.equal(avec({ injectionNow: 'sensor.exp_w', consoNow: 'sensor.net_w' }, {}, { 'sensor.exp_w': 400, 'sensor.net_w': -400 }).length, 1, 'l’injection découverte, comme avant');
  assert.equal(avec({ consoNow: 'sensor.net_w' }, {}, { 'sensor.net_w': -400 }).length, 0, 'le flux net découvert seul : rien (chez lui)');
});
