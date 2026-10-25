/* Le conseil de la fiche de confort suit la TABLE, jamais la couleur (audit du 19/10, H2).
 *
 * La fiche choisissait sa « pire » mesure par la couleur de son verdict, et rangeait `--o-cold` parmi les ennuis (« trop froid »).
 * Depuis que le bleu dit l'IDÉAL (v3.57.0, captures du 19/09), une pièce parfaite recevait « Il fait frais, un peu de chauffage ? ».
 * La pire mesure est désormais celle qui a la plus basse note (`scoreMesure`), et la pièce est « idéale » quand cette mesure est dans
 * une bonne zone (`zoneMesure(...).bon`). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);
const { monter } = await import('./crochets.mjs');
const FC = await import('../src/ficheconfort.jsx');

const conseil = (temp, hum, co2) => {
  const hass = { states: {}, callApi: () => new Promise(() => {}) };
  const piece = { name: 'Séjour', live: { temp, hum, co2, tempId: null, humId: null, co2Id: null } };
  return monter(FC.default, { piece, hass, briques: { Sparkline: () => null, hx: () => 'x' } }).texte();
};
const IDEAL = 'Conditions idéales dans cette pièce.';

test('H2 : une pièce idéale (20 °C, 45 %, 600 ppm) est dite idéale — plus « Il fait frais »', () => {
  const t = conseil(20, 45, 600);
  assert.ok(t.includes(IDEAL), t);
  assert.ok(!t.includes('Il fait frais'), 'le bleu de l’idéal n’est pas du froid');
});

test('H2 : des mesures « Bon » restent idéales — ni CO₂ élevé à 600 ppm, ni air sec à 45 %', () => {
  for (const [temp, hum, co2] of [[24.5, 55, 600], [24.5, 45, null]]) {
    const t = conseil(temp, hum, co2);
    assert.ok(t.includes(IDEAL), `${temp} °C, ${hum} %, ${co2} ppm → ${t}`);
  }
});

test('H2 : la mesure qui s’écarte le plus donne le conseil', () => {
  assert.ok(conseil(21, 45, 1200).includes('Niveau de CO2 élevé, pensez à aérer la pièce.'), 'CO₂ moyen à 1 200 ppm');
  assert.ok(conseil(16.5, 45, 600).includes('Il fait frais, un peu de chauffage ?'), '16,5 °C : frais');
  assert.ok(conseil(27.5, 45, 600).includes('Il fait chaud, pensez à ventiler ou rafraîchir.'), '27,5 °C : chaud');
  assert.ok(conseil(21, 75, 600).includes('Air humide, aérez pour assainir.'), '75 % : humide');
  assert.ok(conseil(21, 25, 600).includes('Air un peu sec, pensez à humidifier.'), '25 % : sec');
});
