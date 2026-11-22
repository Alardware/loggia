// ─────────────────────────────────────────────────────────────────────────────
// Audit des thèmes du 13/11 — F6 : Neumorphix refait sur sa source (14/11).
//
// Source : le thème « NeuMorphix » de yakidd (themes/neumorphix.yaml), relu le
// 14/11. Le néomorphisme tient à une règle : la carte a la couleur du fond, et
// deux ombres la soulèvent. Loggia posait une carte bleutée, en verre, sur un
// dégradé — et sa garde de contraste écartait de force la carte du fond.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { garde } from '../src/contraste.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');
const theme = lire('src', 'theme.js');
const d = theme.indexOf('\n  neumorphix: {'), bloc = theme.slice(d, theme.indexOf('\n  },', d));
const clair = bloc.slice(bloc.indexOf('light: {'), bloc.indexOf('\n    dark: {')), sombre = bloc.slice(bloc.indexOf('\n    dark: {'));
const val = (seg, cle) => { const m = seg.match(new RegExp("\\b" + cle + ": '([^']*)'")); assert.ok(m, cle + ' introuvable'); return m[1]; };

test('F6 — en clair, la carte a la couleur du fond ; en sombre, celles de la source', () => {
  assert.ok(d >= 0 && clair.length > 200 && sombre.length > 200);
  assert.deepEqual(['bg', 'surface', 'surfaceElevated'].map(k => val(clair, k)), ['#f0f0f0', '#f0f0f0', '#f0f0f0']);
  assert.deepEqual(['bg', 'surface', 'surfaceElevated'].map(k => val(sombre, k)), ['#1e2128', '#262b35', '#262b35']);
  assert.deepEqual(['text', 'muted', 'accent'].map(k => val(clair, k)), ['#2c2f3a', '#606470', '#6c7ae0']);
  assert.deepEqual(['text', 'muted', 'accent'].map(k => val(sombre, k)), ['#e2e8f0', '#94a3b8', '#5de0d8']);
  for (const c of ['#e8eaf0', '#eef0f6', '#f3f5fb', '#d3d6e1', '#2c323e']) assert.ok(!bloc.includes(c), c + ' : une couleur d’avant, bleutée');
  for (const seg of [clair, sombre]) {
    assert.equal(val(seg, 'radius'), '20px'); assert.equal(val(seg, 'borderWidth'), '0px');
    assert.equal(val(seg, 'bggrad'), '', 'la source n’a pas de dégradé de fond');
    assert.equal(val(seg, 'matiere'), 'opaque');
    assert.ok(/relief: true/.test(seg));
  }
});

test('F6 — les deux ombres de la source et leur liseré intérieur ; en petit pour ce qui défile', () => {
  assert.equal(val(clair, 'shadow'), '4px 4px 12px #dedede, -4px -4px 12px #ffffff, inset 1px 1px 0px #ffffff');
  assert.equal(val(sombre, 'shadow'), '3px 3px 7px #13161c, -3px -3px 7px #2d3340, inset 1px 1px 0px #3a3f4d');
  assert.ok(clair.includes("'--o-shadow-rangee': '2px 2px 4px #dedede, -2px -2px 4px #ffffff'"));
  assert.ok(sombre.includes("'--o-shadow-rangee': '2px 2px 4px #13161c, -2px -2px 4px #2d3340'"));
});

test('F6 — la garde n’écarte plus la carte du fond tant que ses ombres la portent', () => {
  const j = { '--o-bg': '#f0f0f0', '--o-surfA': '#f0f0f0', '--o-surfB': '#f0f0f0', '--o-bw': '0px', '--o-text': '#2c2f3a', '--o-text2': '#606470', '--o-text3': '#606470',
    '--o-accent': '#6c7ae0', '--o-accent-soft': '#6c7ae0', '--o-relief': '1', '--o-shadow': val(clair, 'shadow') };
  const avec = garde((k) => j[k] || '');
  assert.equal(avec['--o-surfA'], undefined, 'la carte est écartée du fond : le néomorphisme est cassé');
  assert.equal(avec['--o-surfB'], undefined);
  assert.equal(avec['--o-accent'], undefined, 'l’accent du thème est retouché');
  // « Ombres portées » coupé : plus rien ne porte la carte, la séparation reprend.
  const sans = garde((k) => ({ ...j, '--o-shadow': 'none' })[k] || '');
  assert.ok(sans['--o-surfA'] && sans['--o-surfB'], 'sans ombre ni filet, la carte se confondrait avec la page');
  // Un thème sans relief déclaré garde la règle d'avant (iOS, Frosted Glass…).
  const autre = garde((k) => ({ ...j, '--o-relief': '' })[k] || '');
  assert.ok(autre['--o-surfA'], 'la séparation ne vaut plus pour les thèmes sans filet');
  const c = lire('src', 'contraste.js');
  assert.ok(c.includes("const relief = lire('--o-relief') === '1' && !/^(none)?$/.test((lire('--o-shadow') || '').trim());") && c.includes('if (!filet && !relief) {'));
});

test('F6 — le moteur pose le relief et le purge ; la fiche des Paramètres dit que le thème est plein', () => {
  assert.ok(theme.includes("set('--o-relief', v.relief ? '1' : '');"));
  const cles = theme.slice(theme.indexOf('const THEME_KEYS = ['), theme.indexOf('const LOGGIA_PRESETS'));
  assert.ok(cles.includes("'--o-relief'"), '--o-relief resterait posé au thème suivant');
  assert.ok(lire('src', 'views', 'parametres.jsx').includes("{ id: 'neumorphix', name: 'Neumorphix', desc: 'Doux, en relief', cols: ['#6c7ae0', '#1e2128', '#5de0d8'], opaque: true },"));
});
