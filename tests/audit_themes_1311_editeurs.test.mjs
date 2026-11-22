// ─────────────────────────────────────────────────────────────────────────────
// Audit des thèmes du 13/11 — F5 : One Dark Pro, Tokyo Night, Night Owl refaits
// sur leurs sources (15/11).
//
// Sources, relues le 15/11 : Binaryify/OneDark-Pro (themes/OneDark-Pro.json) et
// atom/one-light-syntax (styles/colors.less) ; enkia/tokyo-night-vscode-theme
// (Night et Light) ; sdras/night-owl-vscode-theme (Night Owl et Light Owl).
// Ce qui s'écartait leur était commun : bordure translucide inventée, dégradé de
// fond, couleurs d'état de Loggia, verre, 18 px et grande ombre.
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
const blocDe = (nom) => { const d = theme.indexOf('\n  ' + nom + ': {'); assert.ok(d >= 0, nom + ' introuvable'); const b = theme.slice(d, theme.indexOf('\n  },', d));
  return { bloc: b, sombre: b.slice(b.indexOf('dark: {'), b.indexOf('\n    light: {')), clair: b.slice(b.indexOf('\n    light: {')) }; };
const val = (seg, cle) => { const m = seg.match(new RegExp("\\b" + cle + ": '([^']*)'")); assert.ok(m, cle + ' introuvable'); return m[1]; };
const T = { onedark: blocDe('onedark'), tokyo: blocDe('tokyo'), nightowl: blocDe('nightowl') };
const CLES = ['bg', 'surface', 'surfaceElevated', 'text', 'muted', 'border', 'accent'];

test('F5 — fond, carte, textes, bordure et accent de chaque palette', () => {
  assert.deepEqual(CLES.map(k => val(T.onedark.sombre, k)), ['#21252b', '#282c34', '#282c34', '#abb2bf', '#7f848e', '#3e4452', '#61afef']);
  assert.deepEqual(CLES.map(k => val(T.onedark.clair, k)), ['#eaeaeb', '#fafafa', '#fafafa', '#383a42', '#696c77', 'rgba(56,58,66,.2)', '#4078f2']);
  // Tokyo Night : le texte de la zone d'édition, l'atténué de l'interface, la bordure sombre ; en clair, le bleu de la source.
  assert.deepEqual(CLES.map(k => val(T.tokyo.sombre, k)), ['#16161e', '#1a1b26', '#1a1b26', '#a9b1d6', '#787c99', '#101014', '#7aa2f7']);
  assert.deepEqual(CLES.map(k => val(T.tokyo.clair, k)), ['#d6d8df', '#e6e7ed', '#e6e7ed', '#343b59', '#707280', '#c1c2c7', '#2959aa']);
  // Night Owl : tout l'éditeur est #011627 ; l'atténué est le gris-vert des commentaires ; en clair, la couleur d'action.
  assert.deepEqual(CLES.map(k => val(T.nightowl.sombre, k)), ['#011627', '#011627', '#011627', '#d6deeb', '#637777', '#1d3b53', '#82aaff']);
  assert.deepEqual(CLES.map(k => val(T.nightowl.clair, k)), ['#f0f0f0', '#fbfbfb', '#fbfbfb', '#403f53', '#989fb1', '#d9d9d9', '#2aa298']);
  for (const [nom, c] of [['onedark', '#2f343e'], ['onedark', '#2f5cc4'], ['tokyo', '#c0caf5'], ['tokyo', '#7982a9'], ['tokyo', '#2e7de9'], ['tokyo', '#1f2335'], ['nightowl', '#7e97b3'], ['nightowl', '#0a7c80']]) {
    assert.ok(!T[nom].bloc.includes(c), nom + ' : ' + c + ' est une valeur d’avant');
  }
});

test('F5 — les couleurs d’état de chaque palette', () => {
  assert.ok(T.onedark.sombre.includes("etats: { ok: '#98c379', warn: '#e5c07b', warn2: '#d19a66', bad: '#e06c75', purple: '#c678dd', cyan: '#56b6c2', gold: '#e5c07b' }"));
  assert.ok(T.onedark.clair.includes("etats: { ok: '#50a14f', warn: '#c18401', warn2: '#986801', bad: '#e45649', purple: '#a626a4', cyan: '#0184bc', gold: '#c18401' }"));
  assert.ok(T.tokyo.sombre.includes("etats: { ok: '#9ece6a', warn: '#e0af68', warn2: '#ff9e64', bad: '#f7768e', purple: '#bb9af7', cyan: '#7dcfff', gold: '#e0af68' }"));
  assert.ok(T.tokyo.clair.includes("etats: { ok: '#33635c', warn: '#8f5e15', warn2: '#965027', bad: '#8c4351', purple: '#7b43ba', cyan: '#006c86', gold: '#8f5e15' }"));
  assert.ok(T.nightowl.sombre.includes("etats: { ok: '#22da6e', warn: '#ecc48d', warn2: '#f78c6c', bad: '#ef5350', purple: '#c792ea', cyan: '#7fdbca', gold: '#ecc48d' }"));
  assert.ok(T.nightowl.clair.includes("etats: { ok: '#08916a', warn: '#e0af02', bad: '#de3d3b', purple: '#994cc3', cyan: '#0c969b', gold: '#e0af02', cold: '#4876d6' }"));
});

test('F5 — la forme d’un éditeur : cartes pleines, un filet, aucune ombre, aucun dégradé ; 6 px, et 3 px pour Atom', () => {
  for (const [nom, t] of Object.entries(T)) for (const seg of [t.sombre, t.clair]) {
    assert.equal(val(seg, 'radius'), nom === 'onedark' ? '3px' : '6px', nom);
    assert.equal(val(seg, 'borderWidth'), '1px'); assert.equal(val(seg, 'shadow'), 'none');
    assert.equal(val(seg, 'matiere'), 'opaque'); assert.equal(val(seg, 'bggrad'), '', nom + ' : la source n’a pas de dégradé de fond');
    assert.ok(seg.includes("'--o-shadow-rangee': 'none'"));
    assert.ok(!/18px|radial-gradient|linear-gradient|accentText/.test(seg), nom + ' : la forme d’avant est revenue');
  }
  // Atom prescrit la police du système ; les deux autres sources ne disent rien : Manrope reste.
  for (const seg of [T.onedark.sombre, T.onedark.clair]) assert.ok(seg.includes('font: "system-ui,'));
  for (const seg of [T.tokyo.sombre, T.tokyo.clair, T.nightowl.sombre, T.nightowl.clair]) assert.ok(seg.includes(`font: "'Manrope',`));
  const p = lire('src', 'views', 'parametres.jsx');
  for (const id of ['onedark', 'tokyo', 'nightowl']) assert.ok(new RegExp("\\{ id: '" + id + "', name: [^\\n]*, opaque: true \\},").test(p), id + ' : sa fiche ne dit pas que ses cartes sont pleines');
});

test('F5 et D1a — en sombre, la garde ne retouche que le texte atténué, dans sa teinte ; accent et couleurs d’état restent ceux de la palette', () => {
  const teinte = (c) => { const [r, g, b] = lireCouleur(c); const mx = Math.max(r, g, b), mn = Math.min(r, g, b); if (mx === mn) return 0;
    const h = mx === r ? (g - b) / (mx - mn) + (g < b ? 6 : 0) : mx === g ? (b - r) / (mx - mn) + 2 : (r - g) / (mx - mn) + 4; return h * 60; };
  for (const [nom, t] of Object.entries(T)) {
    const seg = t.sombre, f = seg.match(/fonds: \['([^']+)', '([^']+)'/), e = (n) => seg.match(new RegExp("\\b" + n + ": '([^']+)'"))[1];
    const j = { '--o-bg': val(seg, 'bg'), '--o-surfA': val(seg, 'surfaceElevated'), '--o-surfB': val(seg, 'surface'), '--o-bw': '1px', '--o-s1': f[1], '--o-s2': f[2],
      '--o-text': val(seg, 'text'), '--o-text1': val(seg, 'text'), '--o-text2': val(seg, 'muted'), '--o-text3': val(seg, 'muted'),
      '--o-accent': val(seg, 'accent'), '--o-accent-soft': val(seg, 'accent'), '--o-ok': e('ok'), '--o-warn': e('warn'), '--o-cyan': e('cyan'), '--o-purple': e('purple') };
    const o = garde((k) => j[k] || '');
    // Le cyan de One Dark (#56b6c2) est un peu sombre pour s'écrire sur son propre lavis : la garde l'éclaircit d'un cran (#6fc1cb).
    for (const k of ['--o-accent', '--o-ok', '--o-warn'].concat(nom === 'onedark' ? [] : ['--o-cyan'])) assert.equal(o[k], undefined, nom + ' : ' + k + ' est retouché : ' + o[k]);
    const t2 = o['--o-text2'] || j['--o-text2'];
    assert.ok(Math.abs(teinte(t2) - teinte(j['--o-text2'])) < 12, nom + ' : le texte atténué a changé de teinte (' + j['--o-text2'] + ' → ' + t2 + ')');
    assert.ok(contraste(lireCouleur(t2), lireCouleur(j['--o-surfB'])) >= SEUILS.wcag, nom + ' : le texte atténué ne se lit pas sur la carte');
  }
});
