/* Chantier G4 (30/10, ADR 0303), A3 : ce qui n'est pas l'air d'une pièce du dehors (`horsair.js`, `RACINES`).
 *
 * AccuWeather active par défaut son « RealFeel » ; ses températures ressenties, de refroidissement éolien, de thermomètre mouillé,
 * un indice de chaleur ou une sonde de sol, rangés dans « Jardin », devenaient LA température du jardin. Chacun est écarté, dans les
 * sept langues ; une vraie sonde « Jardin » reste jugée, et un thermomètre du « Sous-sol » aussi. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { area, device, entity, state, states, ctxOf } from './fixtures.mjs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
const HA = await import('../src/horsair.js');
const { resolveRooms } = await import('../src/resolve.js');

const hors = (nom, piece = 'Jardin', id = 'sensor.x') => HA.horsAir(id, { [id]: { state: '12', attributes: { friendly_name: nom, device_class: 'temperature' } } }, () => ({}), null, [], piece);
const tous = (noms, piece) => noms.filter(n => !hors(n, piece));

test('A3 : RealFeel (AccuWeather, actif par défaut), à l’ombre aussi', () => {
  assert.deepEqual(tous(['Maison RealFeel temperature', 'Maison RealFeel temperature shade', 'Maison Température RealFeel', 'Real feel']), []);
  assert.equal(hors('x', 'Jardin', 'sensor.maison_realfeel_temperature'), true, 'l’identifiant suffit');
});

test('A3 : le refroidissement éolien, dans les sept langues', () => {
  assert.deepEqual(tous(['Maison Wind chill temperature', 'Windchill', 'Température de refroidissement éolien', 'Windchill-Temperatur', 'Windkühle',
    'Temperatura di raffreddamento eolico', 'Enfriamiento por viento', 'Temperatura wychłodzenia']), []);
});

test('A3 : le thermomètre mouillé, dans les sept langues', () => {
  assert.deepEqual(tous(['Maison Wet bulb temperature', 'Wetbulb', 'Température du thermomètre mouillé', 'Bulbe humide', 'Feuchtkugeltemperatur',
    'Natteboltemperatuur', 'Temperatura di bulbo umido', 'Temperatura de bulbo húmedo', 'Temperatura termometru wilgotnego']), []);
});

test('A3 : l’indice de chaleur, dans les sept langues', () => {
  assert.deepEqual(tous(['Heat index', 'Heatindex', 'Indice de chaleur', 'Hitzeindex', 'Hitte-index', 'Indice di calore', 'Índice de calor', 'Indeks ciepła']), []);
});

test('A3 : la température apparente ou ressentie, dans les sept langues', () => {
  assert.deepEqual(tous(['Apparent temperature', 'Température apparente', 'Température ressentie', 'Feels like', 'Gefühlte Temperatur', 'Gevoelstemperatuur',
    'Temperatura percepita', 'Temperatura apparente', 'Sensación térmica', 'Temperatura odczuwalna']), []);
});

test('A3 : la sonde de sol — soil, sol (en mot entier), Boden, bodem, suolo, suelo, gleba', () => {
  assert.deepEqual(tous(['Soil temperature', 'Température du sol', 'Température sol', 'Sonde sol potager', 'Bodentemperatur', 'Boden Temperatur', 'Bodemtemperatuur',
    'Temperatura del suolo', 'Temperatura del suelo', 'Temperatura gleby', 'Gleba']), []);
  // « sol » en mot entier : ni un « Sous-sol », ni « solaire », ni « Console », ni « Dachboden ».
  assert.deepEqual(['Thermomètre sous-sol', 'Sous-sol', 'Panneau solaire température', 'Console température', 'Dachboden Temperatur', 'Isolation combles']
    .map(n => hors(n, 'Cave')), [false, false, false, false, false, false]);
});

test('A3 : une vraie sonde « Jardin » reste jugée', () => {
  assert.deepEqual(['Jardin Température', 'Température jardin', 'Station météo Jardin', 'Outdoor temperature', 'Garten Temperatur', 'Tuin temperatuur', 'Sonde abri']
    .map(n => hors(n, 'Jardin')), [false, false, false, false, false, false, false]);
  assert.equal(hors('Jardin Température', 'Jardin', 'sensor.jardin_temperature'), false);
});

test('A3 : la pièce du dehors prend sa vraie sonde — jamais le RealFeel d’AccuWeather ni la sonde de sol', () => {
  const t = (id, v, nom) => state(id, v, { device_class: 'temperature', unit_of_measurement: '°C', state_class: 'measurement', friendly_name: nom });
  const fx = (avecSonde) => ({
    areas: [area('jardin', 'Jardin')],
    devices: [device('d_aw', 'Maison', 'jardin', { entry_type: 'service', integration: 'accuweather' }), device('d_sol', 'Capteur potager', 'jardin'),
      ...(avecSonde ? [device('d_st', 'Station', 'jardin')] : [])],
    entities: [entity('sensor.maison_realfeel_temperature', { device: 'd_aw', platform: 'accuweather', key: 'realfeel_temperature' }),
      entity('sensor.capteur_potager_temperature_du_sol', { device: 'd_sol' }), ...(avecSonde ? [entity('sensor.station_temperature', { device: 'd_st' })] : [])],
    floors: [], energyPrefs: null,
    states: states(t('sensor.maison_realfeel_temperature', 31, 'Maison RealFeel temperature'), t('sensor.capteur_potager_temperature_du_sol', 9, 'Capteur potager Température du sol'),
      ...(avecSonde ? [t('sensor.station_temperature', 14, 'Station Température')] : [])),
  });
  const jardin = (f) => { const r = resolveRooms({ index: ctxOf(f).index, states: f.states }); return [...r.suggested, ...r.technical].find(z => z.name === 'Jardin'); };
  assert.equal(jardin(fx(true)).temp, 'sensor.station_temperature');
  assert.equal(jardin(fx(false)).temp, null, 'sans vraie sonde, pas de température plutôt qu’un RealFeel à 31 °C');
});
