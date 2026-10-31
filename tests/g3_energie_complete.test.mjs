// ─────────────────────────────────────────────────────────────────────────────
// Tout le tableau Énergie de Home Assistant (chantier G3, D3 et E1 ; ADR 0302).
//
// Loggia ne lisait que la PREMIÈRE source solaire et la PREMIÈRE batterie : avec
// deux onduleurs, la moitié de la production. Et les puissances que Home
// Assistant nomme lui-même (`stat_rate`) étaient ignorées au profit d'une
// déduction par voisinage. Les conventions de signe ne sont pas les mêmes :
//   — la BATTERIE de Home Assistant est positive en DÉCHARGE, celle de Loggia
//     (`batNow`) positive en charge : on inverse à la lecture ;
//   — le RÉSEAU de Home Assistant est positif en import, comme le flux net de
//     Loggia (`consoNow`).
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveEnergy } from '../src/resolve.js';
import { setLoggiaState, enHaids, enBatteries } from '../src/state.js';
import { idsDe, sommeLue } from '../src/energieparts.js';
import { puissanceBatterie, niveauBatterie, reserveBatterieKwh, autonomieBatterie, texteAutonomie } from '../src/energiebatterie.js';
import { area, device, entity, state, states, ctxOf } from './fixtures.mjs';

const maison = (sources, extra = {}) => ({
  areas: [area('garage', 'Garage')],
  devices: [device('d_ond1', 'Onduleur est', 'garage'), device('d_ond2', 'Onduleur ouest', 'garage'),
    device('d_bat', 'Batterie', 'garage'), device('d_cpt', 'Compteur', 'garage')],
  entities: [
    entity('sensor.ond1_energie', { device: 'd_ond1' }), entity('sensor.ond1_puissance', { device: 'd_ond1' }),
    entity('sensor.ond2_energie', { device: 'd_ond2' }), entity('sensor.ond2_puissance', { device: 'd_ond2' }),
    entity('sensor.bat_in', { device: 'd_bat' }), entity('sensor.bat_out', { device: 'd_bat' }),
    entity('sensor.bat_voisine_w', { device: 'd_bat' }), entity('sensor.bat_voisine_pct', { device: 'd_bat' }),
    entity('sensor.cpt_energie', { device: 'd_cpt' }), entity('sensor.cpt_voisine_w', { device: 'd_cpt' }),
  ],
  states: states(
    state('sensor.ond1_energie', '120', { device_class: 'energy', unit_of_measurement: 'kWh' }),
    state('sensor.ond1_puissance', '1200', { device_class: 'power', unit_of_measurement: 'W' }),
    state('sensor.ond2_energie', '80', { device_class: 'energy', unit_of_measurement: 'kWh' }),
    state('sensor.ond2_puissance', '800', { device_class: 'power', unit_of_measurement: 'W' }),
    state('sensor.bat_voisine_w', '-50', { device_class: 'power', unit_of_measurement: 'W' }),
    state('sensor.bat_voisine_pct', '40', { device_class: 'battery', unit_of_measurement: '%' }),
    state('sensor.cpt_voisine_w', '300', { device_class: 'power', unit_of_measurement: 'W' }),
  ),
  energyPrefs: { energy_sources: sources, device_consumption: extra.devices || [] },
});

const resoudre = (sources, extra) => resolveEnergy(ctxOf(maison(sources, extra)));

test('deux onduleurs : les DEUX productions, du jour et du moment', () => {
  const e = resoudre([
    { type: 'solar', stat_energy_from: 'sensor.ond1_energie', stat_rate: 'sensor.pv1_w' },
    { type: 'solar', stat_energy_from: 'sensor.ond2_energie', stat_rate: 'sensor.pv2_w' },
  ]);
  assert.deepEqual(e.haids.prodJourParts, ['sensor.ond1_energie', 'sensor.ond2_energie']);
  assert.equal(e.haids.prodJour, null, 'aucun des deux ne vaut pour le tout (ADR 0030)');
  assert.deepEqual(e.haids.solarNowParts, ['sensor.pv1_w', 'sensor.pv2_w']);
  assert.equal(e.haids.solarNow, null);
  // La somme se lit : 1 200 + 800, et un onduleur muet ne fait pas tomber l'autre.
  const lire = (v) => (id) => (id in v ? v[id] : null);
  assert.equal(sommeLue(idsDe(e.haids, 'solarNow'), lire({ 'sensor.pv1_w': 1200, 'sensor.pv2_w': 800 })), 2000);
  assert.equal(sommeLue(idsDe(e.haids, 'solarNow'), lire({ 'sensor.pv1_w': 1200 })), 1200);
  assert.equal(sommeLue(idsDe(e.haids, 'solarNow'), lire({})), null, 'rien de lisible : null, jamais 0');
});

test('un onduleur sans `stat_rate` garde sa puissance voisine (ancien chemin)', () => {
  const e = resoudre([
    { type: 'solar', stat_energy_from: 'sensor.ond1_energie' },
    { type: 'solar', stat_energy_from: 'sensor.ond2_energie', stat_rate: 'sensor.pv2_w' },
  ]);
  assert.deepEqual(e.haids.solarNowParts, ['sensor.ond1_puissance', 'sensor.pv2_w']);
  const seul = resoudre([{ type: 'solar', stat_energy_from: 'sensor.ond1_energie' }]);
  assert.equal(seul.haids.solarNow, 'sensor.ond1_puissance');
  assert.equal(seul.haids.solarNowParts, null);
  assert.equal(seul.haids.prodJour, 'sensor.ond1_energie');
});

test('réseau : `stat_rate` est le flux NET, positif en import, comme `consoNow`', () => {
  const e = resoudre([{ type: 'grid', stat_energy_from: 'sensor.cpt_energie', stat_rate: 'sensor.reseau_net' }]);
  assert.equal(e.haids.consoNow, 'sensor.reseau_net');
  // Deux connexions (heures creuses, pleines) sur le MÊME compteur : une seule puissance, pas deux.
  const hchp = resoudre([
    { type: 'grid', stat_energy_from: 'sensor.cpt_hc', stat_rate: 'sensor.reseau_net' },
    { type: 'grid', stat_energy_from: 'sensor.cpt_hp', stat_rate: 'sensor.reseau_net' },
  ]);
  assert.equal(hchp.haids.consoNow, 'sensor.reseau_net');
  assert.equal(hchp.haids.consoNowParts, null);
  // Le format de 2025.12 : une liste `power` sur l'ancienne source unique.
  const liste = resoudre([{ type: 'grid', flow_from: [{ stat_energy_from: 'sensor.cpt_energie' }], flow_to: [], power: [{ stat_rate: 'sensor.reseau_net' }] }]);
  assert.equal(liste.haids.consoNow, 'sensor.reseau_net');
  // Sans `stat_rate` : l'ancien chemin, la puissance voisine du compteur.
  const vieux = resoudre([{ type: 'grid', stat_energy_from: 'sensor.cpt_energie' }]);
  assert.equal(vieux.haids.consoNow, null);
  assert.equal(vieux.haids.gridNow, 'sensor.cpt_voisine_w');
});

test('batterie : le `stat_rate` de Home Assistant est positif en DÉCHARGE — Loggia l’inverse', () => {
  const e = resoudre([{ type: 'battery', stat_energy_from: 'sensor.bat_out', stat_energy_to: 'sensor.bat_in', stat_rate: 'sensor.bat_ha_w' }]);
  assert.equal(e.haids.batRate, 'sensor.bat_ha_w');
  assert.equal(e.haids.batNow, null, 'la puissance voisine ne passe plus devant ce que Home Assistant nomme');
  const lire = (v) => (id) => (id in v ? v[id] : null);
  // + 600 W chez Home Assistant = la batterie REND 600 W = −600 W pour Loggia.
  assert.equal(puissanceBatterie(e.haids, lire({ 'sensor.bat_ha_w': 600 })), -600);
  assert.equal(puissanceBatterie(e.haids, lire({ 'sensor.bat_ha_w': -250 })), 250, 'négatif chez lui = en charge');
  // La puissance « inversée » de `power_config` est déjà au sens de Loggia.
  const inv = resoudre([{ type: 'battery', stat_energy_from: 'sensor.bat_out', stat_energy_to: 'sensor.bat_in', power_config: { stat_rate_inverted: 'sensor.bat_inv' } }]);
  assert.equal(inv.haids.batNow, 'sensor.bat_inv');
  assert.equal(puissanceBatterie(inv.haids, lire({ 'sensor.bat_inv': 400 })), 400);
  // `power_config.stat_rate` seul : la convention de Home Assistant, inversée elle aussi.
  const std = resoudre([{ type: 'battery', stat_energy_from: 'sensor.bat_out', stat_energy_to: 'sensor.bat_in', power_config: { stat_rate: 'sensor.bat_std' } }]);
  assert.equal(std.haids.batRate, 'sensor.bat_std');
});

test('batterie sans `stat_rate` : l’ancien chemin (voisin signé, deux sens)', () => {
  const e = resoudre([{ type: 'battery', stat_energy_from: 'sensor.bat_out', stat_energy_to: 'sensor.bat_in' }]);
  assert.equal(e.haids.batNow, 'sensor.bat_voisine_w');
  assert.equal(e.haids.batRate, null);
  assert.equal(e.haids.batSoc, 'sensor.bat_voisine_pct');
  const lire = (v) => (id) => (id in v ? v[id] : null);
  assert.equal(puissanceBatterie(e.haids, lire({ 'sensor.bat_voisine_w': -50 })), -50, 'déjà au sens de Loggia : pas d’inversion');
  const deux = resoudre([{ type: 'battery', stat_energy_from: 'sensor.bat_out', stat_energy_to: 'sensor.bat_in',
    power_config: { stat_rate_from: 'sensor.dech', stat_rate_to: 'sensor.ch' } }]);
  assert.equal(puissanceBatterie({ ...deux.haids, batNow: null }, lire({ 'sensor.dech': 300, 'sensor.ch': 0 })), -300);
});

test('deux batteries : les puissances et les niveaux s’additionnent', () => {
  const e = resoudre([
    { type: 'battery', stat_energy_from: 'sensor.b1_out', stat_energy_to: 'sensor.b1_in', stat_rate: 'sensor.b1_w', stat_soc: 'sensor.b1_pct', capacity: 10 },
    { type: 'battery', stat_energy_from: 'sensor.b2_out', stat_energy_to: 'sensor.b2_in', stat_rate: 'sensor.b2_w', stat_soc: 'sensor.b2_pct', capacity: 5 },
  ]);
  assert.deepEqual(e.haids.batRateParts, ['sensor.b1_w', 'sensor.b2_w']);
  assert.equal(e.haids.batRate, null);
  assert.deepEqual(e.haids.batSocParts, ['sensor.b1_pct', 'sensor.b2_pct']);
  assert.deepEqual(e.batteries, [{ soc: 'sensor.b1_pct', capacite: 10 }, { soc: 'sensor.b2_pct', capacite: 5 }]);
  const lire = (v) => (id) => (id in v ? v[id] : null);
  const l = lire({ 'sensor.b1_w': 400, 'sensor.b2_w': 200, 'sensor.b1_pct': 80, 'sensor.b2_pct': 20 });
  assert.equal(puissanceBatterie(e.haids, l), -600);
  // Pondéré par la capacité : (80 × 10 + 20 × 5) / 15 = 60.
  assert.equal(niveauBatterie({ EN: e.haids, batteries: e.batteries, lire: l }), 60);
  assert.equal(reserveBatterieKwh({ batteries: e.batteries, lire: l }), 9);
  // Sans capacité connue : la moyenne simple.
  assert.equal(niveauBatterie({ EN: e.haids, batteries: [], lire: l }), 50);
  assert.equal(reserveBatterieKwh({ batteries: [{ soc: 'sensor.b1_pct', capacite: null }], lire: l }), null);
});

test('`stat_soc` passe AVANT la recherche par appareil voisin', () => {
  const e = resoudre([{ type: 'battery', stat_energy_from: 'sensor.bat_out', stat_energy_to: 'sensor.bat_in', stat_soc: 'sensor.bat_soc_ha' }]);
  assert.equal(e.haids.batSoc, 'sensor.bat_soc_ha');
  assert.deepEqual(e.batteries, [{ soc: 'sensor.bat_soc_ha', capacite: null }]);
});

test('les appareils mesurés : leur `stat_rate` d’abord', () => {
  const e = resoudre([], { devices: [
    { stat_consumption: 'sensor.ond1_energie', stat_rate: 'sensor.app_w', name: 'Chauffe-eau' },
    { stat_consumption: 'sensor.ond2_energie', name: 'Pompe' },
  ] });
  assert.equal(e.devices[0].power, 'sensor.app_w');
  assert.equal(e.devices[1].power, 'sensor.ond2_puissance', 'sans `stat_rate`, la puissance voisine comme avant');
});

test('l’autonomie : niveau × capacité ÷ consommation', () => {
  assert.equal(autonomieBatterie({ reserveKwh: 6, consoW: 2000 }), 3);
  assert.equal(autonomieBatterie({ reserveKwh: 6, consoW: 0 }), null, 'rien ne se consomme : pas de durée');
  assert.equal(autonomieBatterie({ reserveKwh: null, consoW: 500 }), null);
  assert.match(texteAutonomie(3), /3 h/);
  assert.match(texteAutonomie(0.5), /30 min/);
  assert.match(texteAutonomie(50), /2 j/);
});

test('la FICHE reste prioritaire, famille par famille', () => {
  const e = resoudre([
    { type: 'solar', stat_energy_from: 'sensor.ond1_energie', stat_rate: 'sensor.pv1_w' },
    { type: 'solar', stat_energy_from: 'sensor.ond2_energie', stat_rate: 'sensor.pv2_w' },
    { type: 'battery', stat_energy_from: 'sensor.bat_out', stat_energy_to: 'sensor.bat_in', stat_rate: 'sensor.bat_ha_w', stat_soc: 'sensor.bat_soc_ha', capacity: 9 },
  ]);
  setLoggiaState({ resolved: { energy: e }, cfg: { loggia_energyHaids: { solarOutput: 'sensor.mon_pv', batNow: 'sensor.ma_bat' } } });
  try {
    const EN = enHaids();
    assert.equal(EN.solarOutput, 'sensor.mon_pv');
    assert.equal(EN.solarNowParts, undefined, 'la famille solaire appartient à la fiche');
    assert.equal(EN.batNow, 'sensor.ma_bat');
    assert.equal(EN.batRate, undefined, 'la famille batterie aussi');
    assert.equal(EN.batSoc, undefined);
    assert.deepEqual(enBatteries(), [], 'la capacité de Home Assistant ne vaut plus pour la batterie de la fiche');
    // La production du JOUR n'est pas dans une famille : la fiche ne la nomme pas, le tableau la garde.
    assert.deepEqual(EN.prodJourParts, ['sensor.ond1_energie', 'sensor.ond2_energie']);
  } finally {
    setLoggiaState({ resolved: null, cfg: {} });
  }
  setLoggiaState({ resolved: { energy: e }, cfg: {} });
  try {
    assert.deepEqual(enBatteries(), [{ soc: 'sensor.bat_soc_ha', capacite: 9 }]);
  } finally {
    setLoggiaState({ resolved: null, cfg: {} });
  }
});

test('`idsDe` : la clé seule l’emporte sur ses parts', () => {
  assert.deepEqual(idsDe({ prodJour: 'a', prodJourParts: ['b', 'c'] }, 'prodJour'), ['a']);
  assert.deepEqual(idsDe({ prodJourParts: ['b', 'c'] }, 'prodJour'), ['b', 'c']);
  assert.deepEqual(idsDe({}, 'prodJour'), []);
});
