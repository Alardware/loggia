/* Chantier G4, relecture indépendante du 30/10 (ADR 0303) : cinq points, chacun rejoué ici.
 *  1. L'UV se juge arrondi, comme il s'écrit : 2,3 et 2,1 ne demandent pas de protection.
 *  2. Seule la PREMIÈRE plage continue de protection s'annonce.
 *  3. Sans « day 0 », un « day 1 » d'AccuWeather ne passe jamais pour aujourd'hui.
 *  4. « sol » écarte un sol, jamais une pièce : « S/sol », « Ss-sol », « Entre-sol ».
 *  5. Le rang de l'EPA et du CAQI se juge sur la valeur arrondie, celle que la tuile écrit. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.TZ = 'Europe/Paris';
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
const C = await import('../src/confort.js');
const { airDuDehors } = await import('../src/airdehors.js');
const { tuilesMeteo, uvDuJour } = await import('../src/meteofiche.js');
const HA = await import('../src/horsair.js');

const base = new Date('2026-06-15T09:30:00+02:00').getTime();
const h = (H, uv) => ({ datetime: new Date(`2026-06-15T${String(H).padStart(2, '0')}:00:00+02:00`).toISOString(), uv_index: uv });
const ligne = (heures) => tuilesMeteo({ attributs: { uv_index: 1 }, heures, maintenant: base }).find(t => t.cle === 'uv').ligne;
const st = (s, a = {}) => ({ state: String(s), attributes: a });

test('relecture 1 : l’UV se juge arrondi — 2,3 et 2,1 font « Max 2 », sans protection ; 2,6 en demande une', () => {
  assert.deepEqual(uvDuJour([h(10, 1.2), h(12, 2.3), h(13, 2.1), h(15, 1)], base), { max: 2, de: null, a: null, deja: false });
  assert.equal(ligne([h(10, 1.2), h(12, 2.3), h(13, 2.1), h(15, 1)]), 'Max 2');
  assert.equal(ligne([h(12, 2.6), h(13, 2.4)]), 'Max 3 · protection de 12 h à 13 h');
});

test('relecture 2 : seule la première plage continue s’annonce — un creux, ou une heure qui manque, la ferme', () => {
  assert.equal(ligne([h(12, 4), h(13, 4), h(14, 1), h(15, 4), h(16, 1)]), 'Max 4 · protection de 12 h à 14 h', 'le creux de 14 h');
  assert.equal(ligne([h(12, 5), h(13, 5), h(15, 6)]), 'Max 6 · protection de 12 h à 14 h', 'l’heure de 14 h manque à la prévision');
  assert.equal(ligne([h(11, 3), h(12, 6), h(13, 6), h(14, 4), h(15, 2)]), 'Max 6 · protection de 11 h à 15 h', 'une plage d’un seul tenant');
});

test('relecture 3 : un AccuWeather qui n’a que son « day 1 » ne passe pas pour aujourd’hui', () => {
  const choix = { device_class: 'enum', options: ['good', 'moderate', 'unhealthy', 'very_unhealthy', 'hazardous'] };
  const meta = (id) => ({ deviceId: 'acc', platform: 'accuweather' });
  assert.equal(airDuDehors({ 'sensor.home_air_quality_day_1': st('hazardous', choix) }, meta), null);
  assert.equal(airDuDehors({ 'sensor.home_air_quality_day_1': st('hazardous', choix), 'sensor.home_air_quality_day_2': st('good', choix) }, meta), null);
  assert.equal(airDuDehors({ 'sensor.home_air_quality_day_0': st('good', choix) }, meta).rang.t, 'Bon', 'le jour 0 seul se lit');
});

test('relecture 4 : « sol » écarte un sol, jamais une pièce — S/sol, Ss-sol, Entre-sol, Sous-sol', () => {
  const T = (nom, id, piece = null) => HA.horsAir(id, { [id]: st(20, { friendly_name: nom, device_class: 'temperature' }) }, () => ({}), null, [], piece);
  assert.equal(T('S/sol température', 'sensor.s_sol_temperature'), false);
  assert.equal(T('S/sol température', 'sensor.ssol_temperature'), false);
  assert.equal(T('Ss-sol température', 'sensor.ss_sol_temperature'), false);
  assert.equal(T('Entre-sol température', 'sensor.entre_sol_temperature'), false);
  assert.equal(T('Entresol', 'sensor.entresol_temperature'), false);
  assert.equal(T('Sous-sol Température', 'sensor.sous_sol_temperature', 'Cave'), false);
  // Le sol, lui, reste écarté — au pluriel aussi, la négation ne vaut que pour des mots entiers.
  assert.equal(T('Température du sol', 'sensor.temperature_du_sol', 'Jardin'), true);
  assert.equal(T('Capteurs sol jardin', 'sensor.capteurs_sol_jardin', 'Jardin'), true);
  assert.equal(T('Soil temperature 1', 'sensor.soil_temperature_1', 'Jardin'), true);
});

test('relecture 5 : l’EPA et le CAQI se jugent sur la valeur arrondie, celle que la tuile écrit', () => {
  assert.deepEqual(['50.4', '50.5', '100.4', '300.6'].map(v => C.rangIndice('epa', v).t), ['Bon', 'Modéré', 'Modéré', 'Dangereux']);
  assert.deepEqual(['25.4', '25.5'].map(v => C.rangIndice('caqi', v).i), [0, 1]);
  assert.equal(C.rangIndice('atmo', '2.5'), null, 'l’ATMO, entier, ne s’arrondit pas');
  const un = airDuDehors({ 'sensor.airnow_aqi': st('50.4', { device_class: 'aqi' }) }, () => ({ platform: 'airnow', translationKey: 'aqi' }));
  assert.deepEqual([un.valeur, un.rang.t], ['50', 'Bon'], 'le chiffre et son mot disent la même chose');
});
