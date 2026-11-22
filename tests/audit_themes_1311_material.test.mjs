// ─────────────────────────────────────────────────────────────────────────────
// Audit des thèmes du 13/11 — F4 : Material Theme refait sur sa source (15/11).
//
// Source : la palette publiée de Material Theme (material-theme.com, référence
// des couleurs), « Oceanic » pour le sombre, « Lighter » pour le clair, relue
// le 15/11. Loggia écrivait dans le blanc du CODE (#eeffff), avait en clair un
// accent qui n'est pas dans la palette, aucune bordure, 20 px de rayon, une
// grande ombre et un dégradé inventé.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { garde, contraste, lireCouleur, SEUILS } from '../src/contraste.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');
const theme = lire('src', 'theme.js');
const d = theme.indexOf('\n  material: {'), bloc = theme.slice(d, theme.indexOf('\n  },', d));
const sombre = bloc.slice(bloc.indexOf('dark: {'), bloc.indexOf('\n    light: {')), clair = bloc.slice(bloc.indexOf('\n    light: {'));
const val = (seg, cle) => { const m = seg.match(new RegExp("\\b" + cle + ": '([^']*)'")); assert.ok(m, cle + ' introuvable'); return m[1]; };
const CLES = ['bg', 'surface', 'surfaceElevated', 'text', 'muted', 'border', 'accent', 'accentText', 'barre'];

test('F4 — la palette : Oceanic en sombre, Lighter en clair ; le texte de l’INTERFACE, pas le blanc du code', () => {
  assert.ok(d >= 0 && sombre.length > 200 && clair.length > 200);
  // Contrast, Background, Foreground, Text, Border, Accent Color, Links.
  assert.deepEqual(CLES.map(k => val(sombre, k)), ['#1e272c', '#263238', '#263238', '#b0bec5', '#607d8b', '#2a373e', '#009688', '#80cbc4', '#1e272c']);
  assert.deepEqual(CLES.map(k => val(clair, k)), ['#eeeeee', '#fafafa', '#fafafa', '#546e7a', '#94a7b0', '#d3e1e8', '#00bcd4', '#39adb5', '#eeeeee']);
  for (const c of ['#eeffff', '#1e282d', '#7d97a5', '#00897b', '#00695c', '#37474f', '#eceff1']) assert.ok(!bloc.includes("'" + c + "'"), c + ' : une couleur d’avant');
  // Les creux : « Buttons » et « Second Background ».
  assert.ok(sombre.includes("'--o-well': '#2e3c43', '--o-well0': '#32424a'") && clair.includes("'--o-well': '#f3f4f5', '--o-well0': '#ffffff'"));
  // Vert, jaune, orange, rouge, violet, cyan, bleu de la palette.
  assert.ok(sombre.includes("etats: { ok: '#c3e88d', warn: '#ffcb6b', warn2: '#f78c6c', bad: '#f07178', purple: '#c792ea', cyan: '#89ddff', gold: '#ffcb6b', cold: '#82aaff' }"));
  assert.ok(clair.includes("etats: { ok: '#91b859', warn: '#f6a434', warn2: '#f76d47', bad: '#e53935', purple: '#7c4dff', cyan: '#39adb5', gold: '#f6a434', cold: '#6182b8' }"));
});

test('F4 — la forme de Material 3 : 12 px, une bordure d’un pixel, l’ombre d’élévation 1, des cartes pleines, aucun dégradé', () => {
  for (const seg of [sombre, clair]) {
    assert.equal(val(seg, 'radius'), '12px'); assert.equal(val(seg, 'borderWidth'), '1px');
    assert.equal(val(seg, 'shadow'), '0 1px 2px 0 rgba(0,0,0,.3), 0 1px 3px 1px rgba(0,0,0,.15)');
    assert.equal(val(seg, 'matiere'), 'opaque'); assert.equal(val(seg, 'bggrad'), '', 'la source n’a pas de dégradé de fond');
    assert.ok(seg.includes(`font: "'Roboto',`), 'Roboto vient en tête');
  }
  assert.ok(!/20px|0 12px 30px|linear-gradient/.test(bloc), 'la forme d’avant est revenue');
  assert.ok(lire('src', 'views', 'parametres.jsx').includes("{ id: 'material', name: 'Material Theme', desc: tr('Océan Material'), cols: ['#009688', '#263238', '#80cbc4'], opaque: true },"));
});

test('F4 et D1a — la garde remonte les textes DANS LEUR TEINTE, et laisse l’accent, les liens et le vert de la palette en sombre', () => {
  const jetons = (seg) => { const f = seg.match(/fonds: \['([^']+)', '([^']+)'/); const e = (n) => seg.match(new RegExp("\\b" + n + ": '([^']+)'"))[1];
    return { '--o-bg': val(seg, 'bg'), '--o-surfA': val(seg, 'surfaceElevated'), '--o-surfB': val(seg, 'surface'), '--o-bw': '1px', '--o-s1': f[1], '--o-s2': f[2],
      '--o-text': val(seg, 'text'), '--o-text1': val(seg, 'text'), '--o-text2': val(seg, 'muted'), '--o-text3': val(seg, 'muted'),
      '--o-accent': val(seg, 'accent'), '--o-accent-soft': val(seg, 'accentText'), '--o-ok': e('ok'), '--o-warn': e('warn'), '--o-cyan': e('cyan') }; };
  const teinte = (c) => { const [r, g, b] = lireCouleur(c); const mx = Math.max(r, g, b), mn = Math.min(r, g, b); if (mx === mn) return 0;
    const h = mx === r ? (g - b) / (mx - mn) + (g < b ? 6 : 0) : mx === g ? (b - r) / (mx - mn) + 2 : (r - g) / (mx - mn) + 4; return h * 60; };
  for (const [nom, seg] of [['sombre', sombre], ['clair', clair]]) {
    const j = jetons(seg), o = garde((k) => j[k] || '');
    const carte = lireCouleur(j['--o-surfB']);
    for (const t of ['--o-text', '--o-text2']) {
      const c = o[t] || j[t];
      assert.ok(Math.abs(teinte(c) - teinte(j[t])) < 8, nom + ' : ' + t + ' a changé de teinte (' + j[t] + ' → ' + c + ')');
    }
    assert.ok(contraste(lireCouleur(o['--o-text2'] || j['--o-text2']), carte) >= SEUILS.wcag, nom + ' : le texte atténué ne se lit pas sur la carte');
  }
  // En sombre, ce qui fait reconnaître la palette n'est pas retouché.
  const j = jetons(sombre), o = garde((k) => j[k] || '');
  for (const t of ['--o-accent', '--o-accent-soft', '--o-ok', '--o-warn', '--o-cyan']) assert.equal(o[t], undefined, t + ' est retouché : ' + o[t]);
  // Le « Text » d'origine ne se lit pas sur la carte : c'est bien la garde qui le remonte.
  assert.ok(contraste(lireCouleur('#607d8b'), lireCouleur('#263238')) < 4.5 && contraste(lireCouleur('#94a7b0'), lireCouleur('#fafafa')) < 4.5);
});
