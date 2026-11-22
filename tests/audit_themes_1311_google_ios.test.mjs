// ─────────────────────────────────────────────────────────────────────────────
// Audit des thèmes du 13/11 — F7 : Google et iOS refaits sur leurs sources (15/11).
//
// Sources : le thème Home Assistant « Google Theme » de JuanMTech
// (themes/google_theme.yaml) et celui de basnijholt (themes/ios-themes.yaml,
// variante « blue-red »), relus le 15/11. Loggia ouvrait leurs cartes à 62 % et
// les floutait : Google a des cartes PLEINES, iOS un voile à 40 % SANS flou.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { garde, contraste, lireCouleur } from '../src/contraste.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');
const theme = lire('src', 'theme.js');
const blocDe = (nom) => { const d = theme.indexOf('\n  ' + nom + ': {'); assert.ok(d >= 0, nom + ' introuvable'); const b = theme.slice(d, theme.indexOf('\n  },', d));
  return { bloc: b, clair: b.slice(b.indexOf('light: {'), b.indexOf('\n    dark: {')), sombre: b.slice(b.indexOf('\n    dark: {')) }; };
const val = (seg, cle) => { const m = seg.match(new RegExp("\\b" + cle + ": '([^']*)'")); assert.ok(m, cle + ' introuvable'); return m[1]; };
const G = blocDe('google'), I = blocDe('ios');
const lum = (c) => contraste(lireCouleur(c).slice(0, 3), [0, 0, 0]) * 0.05 - 0.05;

test('F7, Google — des cartes pleines, un fond neutre, la bordure et les barres de la source', () => {
  assert.deepEqual(['bg', 'surface', 'surfaceElevated', 'text', 'muted', 'border', 'accent', 'barre', 'entete'].map(k => val(G.clair, k)),
    ['#f8f8f8', '#ffffff', '#ffffff', '#202124', '#5f6368', '#ebebeb', '#1a73e8', '#ffffff', '#f8f8f8']);
  assert.deepEqual(['bg', 'surface', 'surfaceElevated', 'text', 'muted', 'border', 'accent', 'barre', 'entete'].map(k => val(G.sombre, k)),
    ['#171717', '#202124', '#202124', '#f2f2f2', '#a6a6a6', '#2a2b2e', '#8ab4f8', '#202124', '#171717']);
  for (const c of ['#f6f8fc', '#e7e9ee', '#26282c', '#2c2d31']) assert.ok(!G.bloc.includes(c), c + ' : une couleur d’avant');
  for (const seg of [G.clair, G.sombre]) {
    assert.equal(val(seg, 'matiere'), 'opaque'); assert.equal(val(seg, 'radius'), '12px'); assert.equal(val(seg, 'borderWidth'), '1px'); assert.equal(val(seg, 'bggrad'), '');
    assert.ok(seg.includes(`font: "'Roboto',`), 'Roboto, la police de Home Assistant, vient en tête');
  }
  // En clair, les creux sont les gris de la source (fond secondaire, bordure, code, champs).
  assert.ok(G.clair.includes("fonds: ['#e6e6e6', '#ebebeb', '#f2f2f2', '#f5f5f5']"));
});

test('F7, Google — tout ce qui est actif prend l’accent : une lampe allumée, un volet, comme un interrupteur', () => {
  for (const [seg, accent] of [[G.clair, '#1a73e8'], [G.sombre, '#8ab4f8']]) {
    assert.ok(seg.includes(`etats: { lampe: '${accent}', purple: '${accent}' }`));
    assert.ok(seg.includes(`fine: { '--o-lampe-b': '${accent}', '--o-bascule-lampe': 'var(--o-accent-fond)' }`), 'l’interrupteur d’une lampe garderait son ambre');
  }
  assert.ok(theme.includes("const ETATS = ['ok', 'warn', 'warn2', 'bad', 'purple', 'cyan', 'gold', 'cold', 'lampe'];"));
});

test('F7, iOS — un voile à 40 % sans flou, 20 px, ni bordure ni ombre ; le fond de la source en sombre', () => {
  assert.deepEqual(['bg', 'surface', 'surfaceElevated', 'border', 'accent', 'barre', 'fenetre'].map(k => val(I.clair, k)),
    ['#e5e5ea', 'rgba(245,245,245,.4)', 'rgba(245,245,245,.4)', 'rgba(142,142,147,.3)', '#ff9409', '#e5e5ea', 'rgba(255,255,255,.9)']);
  assert.deepEqual(['bg', 'surface', 'surfaceElevated', 'text', 'muted', 'border', 'accent', 'barre', 'entete', 'fenetre'].map(k => val(I.sombre, k)),
    ['#2c2c2e', 'rgba(10,10,10,.4)', 'rgba(10,10,10,.4)', '#ffffff', '#d3d3d3', 'rgba(152,152,157,.3)', '#ff9f09', '#2c2c2e', 'rgba(30,2,61,.4)', 'rgba(25,25,25,.9)']);
  for (const c of ['#0d0d10', '#262629', '#fbfbfd', '22px', '0 10px 30px']) assert.ok(!I.bloc.includes("'" + c) && !I.bloc.includes(c + "'"), c + ' : une valeur d’avant');
  for (const seg of [I.clair, I.sombre]) {
    assert.equal(val(seg, 'radius'), '20px'); assert.equal(val(seg, 'borderWidth'), '0px'); assert.equal(val(seg, 'shadow'), 'none');
    assert.equal(val(seg, 'matiere'), 'opaque', 'le verre de Loggia (62 % et un flou) reviendrait sur la carte');
    assert.ok(seg.includes("'--o-shadow-rangee': 'none'"));
  }
  assert.equal(val(I.clair, 'bggrad'), '', 'en clair, le gris uni de la source : une photo sombre n’y tiendrait pas');
});

test('F7, iOS — le dégradé du sombre vient de la photo HomeKit, et ne coûte rien aux couleurs d’état', () => {
  const grad = val(I.sombre, 'bggrad');
  const pleines = grad.match(/#[0-9a-f]{6}/g);
  assert.deepEqual(pleines, ['#212857', '#4a1844', '#3e1638', '#1c0240', '#26064b', '#19052f']);
  // Aucune de ses couleurs n'est plus claire que le gris de la source : c'est ce qui laisse la garde tranquille.
  for (const c of pleines) assert.ok(lum(c) <= lum('#2c2c2e') + 0.002, c + ' est plus clair que #2c2c2e');
  const j = { '--o-bg': '#2c2c2e', '--o-surfA': 'rgba(10,10,10,.4)', '--o-surfB': 'rgba(10,10,10,.4)', '--o-bw': '0px', '--o-shadow': 'none',
    '--o-s1': 'rgba(255,255,255,.08)', '--o-s2': 'rgba(255,255,255,.08)', '--o-text': '#ffffff', '--o-text1': '#ffffff', '--o-text2': '#d3d3d3', '--o-text3': '#d3d3d3',
    '--o-accent': '#ff9f09', '--o-accent-soft': '#ff9f09', '--o-ok': '#34d399', '--o-warn': '#ffce73', '--o-warn2': '#f59e0b', '--o-bad': '#f26666', '--o-cyan': '#54c8f0', '--o-gold': '#ffd166', '--o-lampe': '#ffce73' };
  const avec = garde((k) => ({ ...j, '--o-bggrad': grad })[k] || ''), sans = garde((k) => j[k] || '');
  assert.deepEqual(avec, sans, 'le dégradé fait retoucher une couleur');
  for (const k of ['--o-ok', '--o-warn', '--o-warn2', '--o-cyan', '--o-gold', '--o-lampe', '--o-accent', '--o-text2']) assert.equal(avec[k], undefined, k + ' est retouché : ' + avec[k]);
});

test('F7, iOS — en clair la carte se voit encore : sans bordure ni ombre, la garde l’écarte du fond', () => {
  const j = { '--o-bg': '#e5e5ea', '--o-surfA': 'rgba(245,245,245,.4)', '--o-surfB': 'rgba(245,245,245,.4)', '--o-bw': '0px', '--o-shadow': 'none', '--o-text': '#1c1c1e', '--o-text2': '#6c6c70', '--o-accent': '#ff9409' };
  const o = garde((k) => j[k] || '');
  assert.ok(o['--o-surfA'] && o['--o-surfB'], 'la carte se confondrait avec la page');
});

test('F7, iOS — un interrupteur allumé est vert, quel que soit l’accent ; la règle ne vise que la piste d’un interrupteur', () => {
  assert.ok(I.clair.includes("'--o-bascule-on': '#34c759'") && I.sombre.includes("'--o-bascule-on': '#30d158'"));
  const css = lire('src', 'index.css');
  const regle = css.split('\n').find(l => l.startsWith('html[style*="--o-bascule-on"]'));
  assert.ok(regle && regle.endsWith('{ background: var(--o-bascule-on) !important; }'));
  assert.ok(regle.includes(':is([style*="var(--o-accent-fond)"], [style*="var(--o-bascule-lampe)"])'), 'elle teindrait autre chose qu’un interrupteur allumé');
  // Toutes les pistes d'interrupteur du dashboard ont une taille que la règle connaît : une cinquième resterait à l'accent.
  const connues = [...regle.matchAll(/width: (\d+)px"\]\[style\*="height: (\d+)px/g)].map(m => m[1] + 'x' + m[2]);
  assert.deepEqual(connues, ['46x26', '44x25', '42x24', '34x20']);
  const fichiers = []; const parcourir = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) parcourir(p); else if (/\.jsx?$/.test(n)) fichiers.push(p); } };
  parcourir(join(RACINE, 'src'));
  const pistes = [];
  for (const f of fichiers) for (const m of readFileSync(f, 'utf8').matchAll(/width: (\d+), height: (\d+), borderRadius: (?:14|999),[^}\n]*?background: \w+ \? (?:'var\(--o-accent-fond\)'|'var\(--o-bascule-lampe\)'|couleur\b)/g)) pistes.push([f.slice(RACINE.length + 1), m[1] + 'x' + m[2]]);
  assert.ok(pistes.length >= 4, 'les pistes d’interrupteur ne se lisent plus : ' + pistes.length);
  for (const [f, t] of pistes) assert.ok(connues.includes(t), f + ' : un interrupteur de ' + t + ' resterait à l’accent sous iOS');
});

test('F7 — ce que ces thèmes posent est purgé au thème suivant ; leurs fiches disent qu’ils ne sont plus en verre', () => {
  const cles = theme.slice(theme.indexOf('const THEME_KEYS = ['), theme.indexOf('const LOGGIA_PRESETS'));
  for (const k of ['--o-lampe', '--o-lampe-rgb', '--o-lampe-b', '--o-bascule-lampe', '--o-bascule-on']) assert.ok(cles.includes("'" + k + "'"), k + ' resterait posé au thème suivant');
  const p = lire('src', 'views', 'parametres.jsx');
  assert.ok(p.includes("{ id: 'google', name: 'Google', desc: tr('Material épuré'), cols: ['#1a73e8', '#171717', '#8ab4f8'], opaque: true },"));
  assert.ok(p.includes("{ id: 'ios', name: 'iOS', desc: 'Apple, arrondi', cols: ['#ff9409', '#2c2c2e', '#ff9f09'], opaque: true },"));
});
