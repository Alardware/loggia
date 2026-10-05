// ─────────────────────────────────────────────────────────────────────────────
// Audit du 03/10, « unités Fahrenheit » : ce que la v3.82.0 (ADR 0128, « sept
// pays, un seul Celsius ») avait laissé derrière elle. Les SEUILS étaient tous
// convertis — confort, processeur, plantes, jauge du capteur — mais trois
// endroits écrivaient encore l'unité de la France :
//   - les repères de la jauge d'une carte capteur : 15 · 17 · 23 · 26 · 29
//     sous « 72 °F » ;
//   - la salutation de l'Accueil : « 72.0°C » dans une maison en Fahrenheit,
//     sur une moyenne qui additionnait des nombres bruts ;
//   - la liste des sessions d'un robot : « 500 m² » pour des pieds carrés.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// La langue de la machine ne doit rien changer (garde-fou de la CI) : fixée AVANT l'import.
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true });
const { moyenneTemperatures } = await import('../src/unites.js');
const { jaugeMesure, echelleMesure } = await import('../src/confort.js');

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');
const arrondi = (n) => Math.round(n * 10) / 10;

test('la jauge d’un capteur en Fahrenheit écrit ses repères en Fahrenheit', () => {
  // 72 °F = 22,2 °C : le trait et le mot se calculent en Celsius, les chiffres se lisent en °F.
  const f = jaugeMesure('temp', 22.2, 'F');
  assert.deepEqual(f.reperes.map(r => r.t), [59, 63, 73, 79, 84]);
  assert.deepEqual(f.reperes.map(r => r.v), [15, 17, 23, 26, 29], 'la table reste celle des captures, en Celsius');
  const c = jaugeMesure('temp', 22.2);
  assert.deepEqual(c.reperes.map(r => r.t), [15, 17, 23, 26, 29], 'par défaut, le Celsius');
  assert.equal(f.pos, c.pos, 'le trait ne bouge pas avec l’unité affichée');
  assert.deepEqual(f.verdict, c.verdict, 'le mot non plus');
  assert.deepEqual(jaugeMesure('hum', 47, 'F').reperes.map(r => r.t), [15, 30, 40, 50, 60, 70, 80], 'l’unité de température ne touche que la température');
  assert.deepEqual(echelleMesure('temp', 'F').reperes.map(r => r.t), [59, 63, 73, 79, 84]);
});

test('les repères en Fahrenheit ne se chevauchent pas non plus (barre de 144 px)', () => {
  const r = jaugeMesure('temp', 22.2, 'F').reperes;
  for (let i = 1; i < r.length; i++) {
    const ecart = (r[i].pos - r[i - 1].pos) / 100 * 144;
    const place = (String(r[i].t).length + String(r[i - 1].t).length) * 3 + 2;
    assert.ok(ecart >= place, r[i - 1].t + ' et ' + r[i].t + ' se touchent (' + Math.round(ecart) + ' px)');
  }
});

test('moyenneTemperatures : une maison en Fahrenheit se lit en Fahrenheit', () => {
  assert.equal(arrondi(moyenneTemperatures([{ v: 72, unite: 'F' }, { v: 68, unite: 'F' }], 'F')), 70);
  assert.equal(arrondi(moyenneTemperatures([{ v: '72', unite: 'F' }], 'C')), 22.2, 'un état est une chaîne');
});

test('moyenneTemperatures : deux unités ne s’additionnent jamais brutes', () => {
  // 21 °C et 69,8 °F (= 21 °C) : la moyenne vaut 21 °C, pas (21 + 69,8) / 2 = 45,4.
  assert.equal(arrondi(moyenneTemperatures([{ v: 21, unite: 'C' }, { v: 69.8, unite: 'F' }], 'C')), 21);
  assert.equal(arrondi(moyenneTemperatures([{ v: 21, unite: 'C' }, { v: 69.8, unite: 'F' }], 'F')), 69.8);
  assert.equal(moyenneTemperatures([{ v: 19, unite: 'C' }, { v: 21, unite: 'C' }]), 20, 'par défaut, le Celsius');
});

test('moyenneTemperatures : rien de lisible, rien d’inventé (ADR 0030)', () => {
  assert.equal(moyenneTemperatures([], 'C'), null);
  assert.equal(moyenneTemperatures(null, 'F'), null);
  assert.equal(moyenneTemperatures([{ v: null, unite: 'C' }, { v: NaN, unite: 'F' }, { v: '', unite: 'C' }, { v: ' ', unite: 'C' }, { v: 'unknown', unite: 'C' }], 'C'), null, 'pas un zéro');
  assert.equal(moyenneTemperatures([{ v: null, unite: 'C' }, { v: 20, unite: 'C' }], 'C'), 20, 'une pièce sans capteur ne tire pas la moyenne vers zéro');
});

test('la carte capteur passe l’unité de son capteur à la jauge, qui écrit `t`', () => {
  const app = lire('src', 'App.jsx');
  assert.ok(app.includes("jauge = jaugeMesure(cle, cle === 'temp' ? versCelsius(n, uniteJauge) : n, uniteJauge);"), 'l’unité repart avec la jauge');
  const i = app.indexOf('\nfunction JaugeMesure(');
  const j = app.slice(i, app.indexOf('\n}\n', i));
  assert.ok(j.includes('>{r.t}</span>') && !j.includes('>{r.v}</span>'), 'le chiffre écrit est celui de l’unité du capteur');
});

test('la salutation de l’Accueil dit l’unité de la maison, pas « °C » en dur', () => {
  const app = lire('src', 'App.jsx');
  assert.ok(!app.includes('a.inTemp.toFixed(1)}°C'), 'le « °C » en dur est revenu dans la salutation');
  assert.ok(app.includes("{a && a.inTemp != null ? ` · ${dec(a.inTemp, 1)} °${a.inTempUnite}` : ''}"), 'la salutation lit l’unité calculée avec la moyenne');
  assert.ok(app.includes('const inTempUnite = uniteTemp(null, hass);') && app.includes('const inTemp = moyenneTemperatures(indoor.map(r => ({ v: r.temp, unite: uniteTemp(r.tempId && S[r.tempId] ? S[r.tempId].attributes : null, hass) })), inTempUnite);'), 'chaque pièce passe par le Celsius avant la moyenne');
  assert.ok(app.includes('rooms, inTemp, inTempUnite, inHum,'), 'l’unité voyage avec la valeur');
});

test('les sessions d’un robot disent l’unité de son capteur, pas « m² » en dur', () => {
  const robot = lire('src', 'ficherobot.jsx');
  assert.ok(!/\{s\.surface\} m²/.test(robot), '« 500 m² » pour des pieds carrés');
  assert.ok(robot.includes('{s.surface} {uniteSurface}'), 'la liste lit l’unité réelle, comme le résumé');
  assert.ok(robot.includes('/^(m²|m2|ft²|sq ft)$/'), 'les pieds carrés écrits « sq ft » sont reconnus, comme dans resolve.js');
});
