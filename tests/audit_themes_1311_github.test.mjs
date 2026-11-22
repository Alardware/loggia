// ─────────────────────────────────────────────────────────────────────────────
// Audit des thèmes du 13/11 — F3 : GitHub refait sur sa source (14/11).
//
// Source : Primer, le système de design de GitHub — ses jetons publiés (thèmes
// sombre et clair, rayons, police), relus le 14/11. Rayon 6 px, cartes opaques,
// ombre au repos en deux traits d'un pixel, palette à jour, page blanche en
// clair, vert / ambre / rouge / violet de Primer.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { garde, contraste, lireCouleur } from '../src/contraste.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');
const theme = lire('src', 'theme.js');
const d = theme.indexOf('\n  github: {'), bloc = theme.slice(d, theme.indexOf('\n  },', d));
const sombre = bloc.slice(bloc.indexOf('dark: {'), bloc.indexOf('\n    light: {')), clair = bloc.slice(bloc.indexOf('\n    light: {'));
const val = (seg, cle) => { const m = seg.match(new RegExp("\\b" + cle + ": '([^']*)'")); assert.ok(m, cle + ' introuvable'); return m[1]; };

test('F3 — la forme de Primer : 6 px, une bordure d’un pixel, des cartes opaques, l’ombre au repos', () => {
  assert.ok(d >= 0 && sombre.length > 200 && clair.length > 200);
  for (const seg of [sombre, clair]) {
    assert.equal(val(seg, 'radius'), '6px', 'le rayon de 14 px n’existe pas chez GitHub');
    assert.equal(val(seg, 'borderWidth'), '1px');
    assert.equal(val(seg, 'matiere'), 'opaque');
    assert.equal(val(seg, 'bggrad'), '');
    assert.equal(val(seg, 'surface'), val(seg, 'surfaceElevated'), 'une carte de Primer est plate');
  }
  // `shadow-resting-small` : deux traits d'un pixel — pas l'ombre des couches flottantes.
  assert.equal(val(sombre, 'shadow'), '0 1px 1px 0 rgba(1,4,9,.6), 0 1px 3px 0 rgba(1,4,9,.6)');
  assert.equal(val(clair, 'shadow'), '0 1px 1px 0 rgba(31,35,40,.04), 0 1px 2px 0 rgba(31,35,40,.03)');
  // L'ombre de survol n'a PAS d'anneau d'un pixel : avec le liseré de la carte il ferait 2 px.
  assert.ok(!/0 0 0 1px/.test(bloc), 'un anneau fixe s’ajouterait au liseré');
});

test('F3 — la palette de Primer, sombre et clair', () => {
  assert.deepEqual(['bg', 'surface', 'text', 'muted', 'border', 'accent'].map(k => val(sombre, k)), ['#0d1117', '#151b23', '#f0f6fc', '#9198a1', '#3d444d', '#4493f8']);
  // En clair la PAGE est blanche (Loggia la posait en #f6f8fa) ; ce gris sert aux creux.
  assert.deepEqual(['bg', 'surface', 'text', 'muted', 'border', 'accent'].map(k => val(clair, k)), ['#ffffff', '#ffffff', '#1f2328', '#59636e', '#d1d9e0', '#0969da']);
  assert.ok(clair.includes("'--o-well': '#f6f8fa'"));
  // La palette d'avant ne revient pas.
  for (const c of ['#e6edf3', '#8b949e', '#30363d', '#58a6ff', '#656d76', '#d0d7de', '#161b22', '#1c2129']) assert.ok(!bloc.includes(c), c + ' : une couleur de l’ancienne palette');
  // Vert, ambre, rouge, violet : fgColor-success / attention / danger / done.
  assert.ok(sombre.includes("etats: { ok: '#3fb950', warn: '#d29922', warn2: '#d29922', bad: '#f85149', purple: '#ab7df8' }"));
  assert.ok(clair.includes("etats: { ok: '#1a7f37', warn: '#9a6700', warn2: '#9a6700', bad: '#d1242f', purple: '#8250df' }"));
  // La police de Primer d'abord, celle du système ensuite ; plus Manrope.
  for (const seg of [sombre, clair]) { assert.ok(/font: "'Mona Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI'/.test(seg)); assert.ok(!/Manrope/.test(seg)); }
});

test('F3 — ces couleurs tiennent leurs seuils : la garde laisse le texte et l’accent, et n’ajuste les états que d’un cran', () => {
  const jetons = (seg) => ({ '--o-bg': val(seg, 'bg'), '--o-surfA': val(seg, 'surfaceElevated'), '--o-surfB': val(seg, 'surface'), '--o-bw': '1px',
    '--o-s1': seg.match(/fonds: \['([^']+)', '([^']+)'/)[1], '--o-s2': seg.match(/fonds: \['([^']+)', '([^']+)'/)[2],
    '--o-text': val(seg, 'text'), '--o-text1': val(seg, 'text'), '--o-text2': val(seg, 'muted'), '--o-text3': val(seg, 'muted'),
    '--o-accent': val(seg, 'accent'), '--o-accent-soft': val(seg, 'accent'),
    '--o-ok': seg.match(/ok: '([^']+)'/)[1], '--o-ok-rgb': '0,0,0', '--o-purple': seg.match(/purple: '([^']+)'/)[1], '--o-purple-rgb': '0,0,0' });
  for (const [nom, seg] of [['sombre', sombre], ['clair', clair]]) {
    const j = jetons(seg), o = garde((k) => j[k] || '');
    for (const k of ['--o-text', '--o-accent']) assert.equal(o[k], undefined, nom + ' : ' + k + ' est retouché (' + o[k] + ')');
    // Le texte atténué, le vert et le violet restent dans un mouchoir : la garde les ajuste d'un cheveu pour qu'ils se lisent
    // sur leur propre lavis (sombre : violet #ab7df8 → #b186f8 ; clair : vert #1a7f37 → #177031, violet #8250df → #733bdb).
    for (const k of ['--o-text2', '--o-ok', '--o-purple']) {
      const c = lireCouleur(o[k] || j[k]), src = lireCouleur(j[k]);
      assert.ok(Math.max(...[0, 1, 2].map(i => Math.abs(c[i] - src[i]))) <= 24, nom + ' : ' + k + ' s’éloigne de Primer : ' + o[k]);
    }
    assert.ok(contraste(lireCouleur(o['--o-accent-fond']), [255, 255, 255]) >= 4.6, nom + ' : le blanc ne tient pas sur la puce choisie');
  }
});

test('F3 — la fiche des Paramètres dit que le thème est plein, et montre son accent', () => {
  const p = lire('src', 'views', 'parametres.jsx');
  assert.ok(p.includes("{ id: 'github', name: 'GitHub', desc: tr('Sobre, façon GitHub'), cols: ['#4493f8', '#0d1117', '#3fb950'], opaque: true },"));
});
