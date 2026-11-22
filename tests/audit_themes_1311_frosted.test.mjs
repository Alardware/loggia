// ─────────────────────────────────────────────────────────────────────────────
// Audit des thèmes du 13/11 — F1 : Frosted Glass refait sur sa source (14/11).
//
// Source : le thème Home Assistant de wessamlauf, v1.4.0, relu ligne à ligne.
// Carte presque transparente, flou court (8 / 10 px), bordure d'un demi-pixel,
// reflet intérieur, textes en opacité d'une même encre, accent sombre bleu
// acier, barre et en-tête à 10 %, fenêtres à 35 % et 18 px de flou. Le fond de
// la source est une photo : décision D2a, un dégradé redessiné, sans image.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { garde, contraste, lireCouleur } from '../src/contraste.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const theme = lire('src', 'theme.js'), css = lire('src', 'index.css');
const d = theme.indexOf('\n  frosted: {'), bloc = theme.slice(d, theme.indexOf('\n  },', d));
const clair = bloc.slice(bloc.indexOf('light: {'), bloc.indexOf('\n    dark: {')), sombre = bloc.slice(bloc.indexOf('\n    dark: {'));
const val = (seg, cle) => { const m = seg.match(new RegExp("\\b" + cle + ": '([^']*)'")); assert.ok(m, cle + ' introuvable'); return m[1]; };

test('F1 — les valeurs de la source, dans les deux variantes', () => {
  assert.ok(d >= 0 && clair.length > 200 && sombre.length > 200);
  // L'accent : le bleu acier en sombre (c'était une pervenche), le clair déjà juste.
  assert.equal(val(sombre, 'accent'), '#7aa2be');
  assert.equal(val(clair, 'accent'), '#6a74d3');
  assert.ok(!bloc.includes('#8f97de'), 'la pervenche d’avant est revenue');
  // Le fond du thème, pas celui de Loggia.
  assert.equal(val(sombre, 'bg'), '#02060b');
  assert.equal(val(clair, 'bg'), '#fef4f2');
  // Un verre court, une bordure d'un demi-pixel, 18 px de rayon.
  assert.equal(val(sombre, 'flou'), 'blur(10px) saturate(1.25)');
  assert.equal(val(clair, 'flou'), 'blur(8px) saturate(1.25)');
  for (const seg of [clair, sombre]) { assert.equal(val(seg, 'borderWidth'), '0.5px'); assert.equal(val(seg, 'radius'), '18px'); }
  assert.equal(val(sombre, 'border'), 'rgba(234,235,238,.22)');
  assert.equal(val(clair, 'border'), 'rgba(255,255,255,.3)');
  // Les textes : UNE encre, en opacité.
  assert.equal(val(sombre, 'text'), 'rgba(234,235,238,.98)'); assert.equal(val(sombre, 'muted'), 'rgba(234,235,238,.8)');
  assert.equal(val(clair, 'text'), 'rgba(19,21,54,.98)'); assert.equal(val(clair, 'muted'), 'rgba(19,21,54,.8)');
  // Le reflet intérieur, puis l'ombre portée.
  assert.ok(val(sombre, 'shadow').startsWith('3px 3px .5px -3.5px rgba(255,255,255,.3) inset, -2px -2px .5px -2px rgba(255,255,255,.2) inset,'));
  assert.ok(val(sombre, 'shadow').endsWith('0 14px 38px rgba(0,0,0,.34), 0 2px 10px rgba(0,0,0,.24)'));
  assert.ok(val(clair, 'shadow').endsWith('0 10px 32px rgba(21,25,45,.12), 0 2px 8px rgba(21,25,45,.08)'));
  // Barre latérale, en-tête, fenêtres, états.
  assert.equal(val(sombre, 'barre'), 'rgba(2,6,11,.1)'); assert.equal(val(sombre, 'entete'), 'rgba(2,6,11,.1)');
  assert.equal(val(clair, 'barre'), 'rgba(254,244,242,.1)');
  assert.equal(val(sombre, 'fenetre'), 'rgba(2,6,11,.35)'); assert.equal(val(clair, 'fenetre'), 'rgba(254,244,242,.35)');
  for (const seg of [clair, sombre]) { assert.equal(val(seg, 'flouFenetre'), 'blur(18px) saturate(1.2)'); assert.ok(seg.includes("etats: { ok: '#76d698', bad: '#ea7287', warn: '#ffdb75' }")); }
  // Pas d'image embarquée (D2a) : un dégradé.
  assert.ok(!/url\(/.test(bloc), 'le thème embarque une image');
});

test('F1 — la carte est presque transparente, et le moteur ne la rebouche pas', () => {
  const alpha = (v) => Number(v.match(/,\s*([\d.]+)\)$/)[1]);
  assert.ok(alpha(val(sombre, 'surfaceElevated')) <= 0.08 && alpha(val(sombre, 'surface')) <= 0.05, 'en sombre, la carte n’est plus un verre clair');
  assert.ok(alpha(val(clair, 'surfaceElevated')) <= 0.25 && alpha(val(clair, 'surface')) <= 0.16);
  // `applyLook` plafonne l'opacité à 62 % : il ne l'élève jamais.
  assert.ok(theme.includes("Math.min(isNaN(alpha) ? 1 : alpha, .62)"));
});

test('F1 — sur ce fond, l’accent et les couleurs du thème tiennent sans être délavés', () => {
  const bg = (seg) => ({ '--o-bg': val(seg, 'bg'), '--o-bggrad': val(seg, 'bggrad'), '--o-surfA': val(seg, 'surfaceElevated'), '--o-surfB': val(seg, 'surface'),
    '--o-s1': seg.match(/fonds: \['([^']+)', '([^']+)'/)[1], '--o-s2': seg.match(/fonds: \['([^']+)', '([^']+)'/)[2], '--o-bw': '0.5px',
    '--o-text': val(seg, 'text'), '--o-text1': val(seg, 'text1'), '--o-text2': val(seg, 'muted'), '--o-text3': val(seg, 'text3'),
    '--o-accent': val(seg, 'accent'), '--o-accent-soft': seg.includes('accentText') ? val(seg, 'accentText') : val(seg, 'accent'),
    '--o-ok': '#76d698', '--o-ok-rgb': '118,214,152', '--o-bad': '#ea7287', '--o-bad-rgb': '234,114,135', '--o-warn': '#ffdb75', '--o-warn-rgb': '255,219,117' });
  const s = bg(sombre), os = garde((j) => s[j] || '');
  // En sombre : l'accent, le vert, le jaune et le texte secondaire sont ceux de la source. Des halos plus forts les délavaient.
  for (const j of ['--o-accent', '--o-ok', '--o-warn', '--o-text', '--o-text2']) assert.equal(os[j], undefined, j + ' est retouché en sombre : ' + os[j]);
  const c = bg(clair), oc = garde((j) => c[j] || '');
  // En clair : l'encre et son second niveau tiennent ; l'accent reste dans un mouchoir (il doit se voir sur le bleu du coin).
  for (const j of ['--o-text', '--o-text2']) assert.equal(oc[j], undefined, j + ' est retouché en clair : ' + oc[j]);
  const a = lireCouleur(oc['--o-accent'] || c['--o-accent']), src = lireCouleur('#6a74d3');
  assert.ok(Math.max(...[0, 1, 2].map(i => Math.abs(a[i] - src[i]))) <= 12, 'l’accent clair s’éloigne de la source : ' + oc['--o-accent']);
  assert.ok(contraste(lireCouleur(oc['--o-accent-fond']), [255, 255, 255]) >= 4.6 && contraste(lireCouleur(os['--o-accent-fond']), [255, 255, 255]) >= 4.6);
});

test('F1 — le moteur pose le flou et les fenêtres du thème, et les purge', () => {
  assert.ok(theme.includes("set('--o-flou', v.flou); set('--o-fenetre', v.fenetre); set('--o-flou-fenetre', v.flouFenetre);"));
  const cles = theme.slice(theme.indexOf('const THEME_KEYS = ['), theme.indexOf('const LOGGIA_PRESETS'));
  for (const j of ['--o-flou', '--o-fenetre', '--o-flou-fenetre']) assert.ok(cles.includes("'" + j + "'"), j + ' resterait posé au thème suivant');
  // Le verre des cartes lit le flou du thème, celui de Loggia pour repli : les autres thèmes ne bougent pas.
  assert.ok(css.includes('html.loggia-frosted [style*="--o-surfA"] { -webkit-backdrop-filter: var(--o-flou, blur(16px) saturate(1.35)); backdrop-filter: var(--o-flou, blur(16px) saturate(1.35)); }'));
  // Les fenêtres : seulement pour un thème qui les déclare, et pas en verre « Léger ».
  assert.ok(css.includes('html[style*="--o-fenetre"]:not(.loggia-verre-leger) .o-sheet:not(.o-sheet-opaque),\nhtml[style*="--o-fenetre"] .loggia-hdr [style*="top: calc(100% + 8px)"][style*="--o-surfA"] {\n  background: var(--o-fenetre) !important;'));
  assert.ok(css.includes('html[style*="--o-fenetre"]:not(.loggia-verre-leger) .o-voile { -webkit-backdrop-filter: var(--o-flou-fenetre, blur(4px)) !important;'), 'sans le flou du voile, la page se lit à travers la fiche');
  // Ce que ces règles visent existe tel quel.
  assert.ok(lire('src', 'ui.jsx').includes("className={'o-sheet' + (opaque ? ' o-sheet-opaque' : '')"));
  assert.ok(lire('src', 'chrome', 'entete.jsx').includes("const menu = { position: 'absolute', top: 'calc(100% + 8px)', background: 'var(--o-surfA)'"));
});
