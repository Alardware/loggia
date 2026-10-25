// ─────────────────────────────────────────────────────────────────────────────
// CE QUE LA MAISON CONSOMME, SUR L'ACCUEIL (25/10).
//
// « Il manque la conso en ce moment, savoir combien je consomme » — à mettre
// entre l'alarme et la qualité de l'air. La tuile existait (import / export
// réseau) mais ne lisait que `consoNow` : une fiche Énergie remplie avec
// `gridNow`, `consoMaison`, `injectionNow`, `solarNow` ne l'allumait jamais.
// On évalue ici le morceau de `deriveAccueil` qui lit les puissances.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'App.jsx'), 'utf8');
const debut = APP.indexOf('function deriveAccueil(');
const i = APP.indexOf('  const numW = ', debut);
const j = APP.indexOf('\n', APP.indexOf('  const consoW = ', i));
const morceau = APP.slice(i, j);
const lire = (E, etats) => {
  const S = Object.fromEntries(Object.entries(etats).map(([k, v]) => [k, { state: String(v) }]));
  const wattsDe = (st) => { const n = Number(st.state); return Number.isFinite(n) ? n : null; };
  // eslint-disable-next-line no-new-func
  return new Function('S', 'E', 'wattsDe', morceau + '\nreturn { consoW, exporting, gridVal };')(S, E, wattsDe);
};

test('la fiche Énergie (gridNow, consoMaison) allume la tuile', () => {
  const r = lire({ gridNow: 'sensor.p', consoMaison: 'sensor.m', injectionNow: 'sensor.i', solarNow: 'sensor.s' },
    { 'sensor.p': 820, 'sensor.m': 1240, 'sensor.i': 0, 'sensor.s': 420 });
  assert.equal(r.consoW, 1240, 'le capteur de la maison, quand il existe, fait foi');
  assert.equal(r.exporting, false);
  assert.equal(r.gridVal, 820);
});

test('sans capteur de la maison : soutirage + soleil − injection', () => {
  assert.equal(lire({ gridNow: 'sensor.p', solarNow: 'sensor.s' }, { 'sensor.p': 300, 'sensor.s': 500 }).consoW, 800);
  const r = lire({ gridNow: 'sensor.p', injectionNow: 'sensor.i', solarNow: 'sensor.s' }, { 'sensor.p': 0, 'sensor.i': 600, 'sensor.s': 1500 });
  assert.equal(r.consoW, 900);
  assert.equal(r.exporting, true, 'le surplus qui repart se voit');
});

test('l’ancien nom (net signé consoNow) se lit toujours', () => {
  assert.equal(lire({ consoNow: 'sensor.n', solarOutput: 'sensor.s' }, { 'sensor.n': -200, 'sensor.s': 1000 }).consoW, 800);
});

test('aucun compteur : pas de tuile, jamais un « 0 W » inventé', () => {
  assert.equal(lire({}, {}).consoW, null);
  assert.equal(lire({ gridNow: 'sensor.p' }, { 'sensor.p': 'unavailable' }).consoW, null);
});

test('la tuile se place entre l’alarme et l’air, et mène à l’Énergie', () => {
  const al = APP.indexOf('key="al"'), ex = APP.indexOf('key="ex"'), air = APP.indexOf('key="air"');
  assert.ok(al > 0 && al < ex && ex < air, 'ordre alarme, conso, air');
  assert.ok(APP.includes("ex: () => onNav && onNav('energie'),"), 'un appui ouvre la vue Énergie');
  assert.ok(APP.includes('if (!a || a.metricConso) cases.push('), 'sans compteur, la tuile part');
});
