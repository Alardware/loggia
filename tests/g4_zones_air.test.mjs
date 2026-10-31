/* Chantier G4 (30/10, ADR 0303), A5 : des zones pour les PM10, le NO₂ et l'ozone d'un capteur de la MAISON (air-Q, AirVisual Pro).
 *
 * Les seuils : les valeurs limites de l'UE pour 2030 (directive (UE) 2024/2881) et les lignes directrices de l'OMS (2021) —
 * PM10 20 / 45 µg/m³, NO₂ 20 / 50 µg/m³, O₃ 100 µg/m³ sur 8 h. Les PM2,5 (10 / 25) ne changent pas. Dehors, ces mesures restent
 * neutres : le chiffre et la courbe, sans zone ni alerte. Un NO₂ ou un ozone dans une autre unité que des µg/m³ ne se lit pas sur
 * ces bornes. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
const C = await import('../src/confort.js');
const MF = await import('../src/mesuresfiche.js');

test('A5 : la famille d’un capteur — PM10, NO₂ et O₃ en µg/m³ ; une autre unité, rien', () => {
  assert.equal(C.cleMesure('pm10', 'µg/m³'), 'pm10');
  assert.equal(C.cleMesure('pm10'), 'pm10');
  assert.equal(C.cleMesure('nitrogen_dioxide', 'µg/m³'), 'no2');
  assert.equal(C.cleMesure('nitrogen_dioxide', 'μg/m³'), 'no2', 'le mu grec que certaines intégrations écrivent');
  assert.equal(C.cleMesure('ozone', 'µg/m³'), 'o3');
  assert.equal(C.cleMesure('nitrogen_dioxide', 'ppb'), null, 'des ppb ne se lisent pas sur des bornes en µg/m³');
  assert.equal(C.cleMesure('ozone', 'ppm'), null);
  assert.equal(C.cleMesure('ozone'), null, 'sans unité, on ne sait pas');
  assert.equal(C.cleMesure('pm1', 'µg/m³'), null, 'les PM1 restent sans table');
});

test('A5 : les zones — UE 2030 et OMS 2021 ; les PM2,5 inchangées', () => {
  const t = (cle, l) => l.map(v => C.zoneMesure(cle, v).t);
  assert.deepEqual(t('pm10', [5, 19.9, 20, 44.9, 45, 120]), ['Bon', 'Bon', 'Moyen', 'Moyen', 'Mauvais', 'Mauvais']);
  assert.deepEqual(t('no2', [5, 19.9, 20, 49.9, 50, 200]), ['Bon', 'Bon', 'Moyen', 'Moyen', 'Mauvais', 'Mauvais']);
  assert.deepEqual(t('o3', [40, 99.9, 100, 180]), ['Bon', 'Bon', 'Mauvais', 'Mauvais']);
  assert.deepEqual(t('pm25', [9.9, 10, 24.9, 25]), ['Bon', 'Moyen', 'Moyen', 'Mauvais']);
  assert.deepEqual(['pm10', 'no2', 'o3'].map(c => C.zoneMesure(c, 1).bon), [true, true, true]);
  assert.deepEqual(C.echelleMesure('pm10').reperes.map(r => r.v), [20, 45]);
  assert.deepEqual(C.echelleMesure('no2').reperes.map(r => r.v), [20, 50]);
  assert.deepEqual(C.echelleMesure('o3').reperes.map(r => r.v), [100]);
  assert.deepEqual(['pm10', 'no2', 'o3'].map(C.nomMesure), ['Particules', 'NO₂', 'O₃']);
  assert.deepEqual(['pm10', 'no2', 'o3'].map(C.iconeMesure), ['smog', 'smog', 'smog']);
  assert.deepEqual(['pm10', 'nitrogen_dioxide', 'ozone'].map(dc => C.nomClasse(dc, 'µg/m³')), ['Particules', 'NO₂', 'O₃'], 'le même nom qu’avant');
  const src = readFileSync(new URL('../src/confort.js', import.meta.url), 'utf8');
  assert.ok(src.includes('2024/2881') && src.includes('OMS') && src.includes('2021'), 'la source est citée');
});

test('A5 : dans la maison, aérer pour les particules et le NO₂ ; pas pour l’ozone, qui vient du dehors', () => {
  const ph = (cle, v) => C.phraseMesure(cle, C.zoneMesure(cle, v));
  assert.equal(ph('pm10', 30), 'Moyen · aérez');
  assert.equal(ph('no2', 60), 'Mauvais · aérez');
  assert.equal(ph('o3', 120), 'Mauvais');
  assert.equal(MF.conseilMesure('pm10', C.zoneMesure('pm10', 30)), 'Aérez 5 minutes.');
  assert.equal(MF.conseilMesure('no2', C.zoneMesure('no2', 60)), 'Aérez 5 minutes.');
  assert.equal(MF.conseilMesure('o3', C.zoneMesure('o3', 120)), null);
});

test('A5 : la démo porte un NO₂ de la maison — la cuisine, 14 µg/m³, « Bon », sur son appareil', async () => {
  const { maisonMesuresDemo } = await import('../src/demo.js');
  const m = maisonMesuresDemo();
  const a = m.states['sensor.cuisine_no2'].attributes;
  const cle = C.cleMesure(a.device_class, a.unit_of_measurement);
  assert.equal(cle, 'no2');
  assert.equal(C.zoneMesure(cle, m.states['sensor.cuisine_no2'].state).t, 'Bon');
  const idx = m.index();
  const e = idx.entities.find(x => x.id === 'sensor.cuisine_no2');
  assert.deepEqual([e.area, idx.devices.find(d => d.id === e.device).entry_type], ['cuisine', null], 'un appareil physique, dans sa pièce');
});

test('A5 : dehors, ces mesures restent neutres — ni zone, ni alerte', () => {
  assert.deepEqual(['pm10', 'no2', 'o3'].map(C.jugeeDehors), [false, false, false]);
  assert.equal(C.jugeeDehors('pm25'), true, 'les PM2,5 gardent leurs zones du dehors');
});
