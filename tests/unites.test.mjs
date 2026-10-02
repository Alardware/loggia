// ─────────────────────────────────────────────────────────────────────────────
// La bonne unité, jamais une supposition (02/10, suite d'un signalement
// public : les vues climat affichaient °C même quand Home Assistant fournit
// déjà la valeur en Fahrenheit).
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uniteTemp, versCelsius, deCelsius, uniteVent, versKmh } from '../src/unites.js';

test('uniteTemp lit temperature_unit en priorité', () => {
  assert.equal(uniteTemp({ temperature_unit: '°F' }, { config: { unit_system: { temperature: '°C' } } }), 'F');
});

test('uniteTemp lit unit_of_measurement pour un capteur ordinaire (pas une entité weather)', () => {
  assert.equal(uniteTemp({ unit_of_measurement: '°F', device_class: 'temperature' }, null), 'F');
});

test('uniteTemp se replie sur hass.config.unit_system si l’entité ne le dit pas', () => {
  assert.equal(uniteTemp({}, { config: { unit_system: { temperature: '°F' } } }), 'F');
});

test('uniteTemp se replie sur le Celsius sans aucune source', () => {
  assert.equal(uniteTemp({}, null), 'C');
  assert.equal(uniteTemp(null, undefined), 'C');
});

test('versCelsius ne touche pas un Celsius déjà', () => {
  assert.equal(versCelsius(21, 'C'), 21);
});

test('versCelsius convertit depuis le Fahrenheit', () => {
  assert.equal(Math.round(versCelsius(35.6, 'F') * 10) / 10, 2);
  assert.equal(versCelsius(32, 'F'), 0);
  assert.equal(versCelsius(212, 'F'), 100);
});

test('versCelsius laisse passer null', () => {
  assert.equal(versCelsius(null, 'F'), null);
});

test('deCelsius et versCelsius sont réciproques', () => {
  const f = deCelsius(21, 'F');
  assert.equal(Math.round(versCelsius(f, 'F') * 10) / 10, 21);
});

test('uniteVent ne connaît que km/h et mph', () => {
  assert.equal(uniteVent({ wind_speed_unit: 'mph' }), 'mph');
  assert.equal(uniteVent({ wind_speed_unit: 'km/h' }), 'km/h');
  assert.equal(uniteVent({}), 'km/h');
});

test('versKmh convertit depuis le mph', () => {
  assert.equal(Math.round(versKmh(30, 'mph')), 48);
  assert.equal(versKmh(30, 'km/h'), 30);
});
