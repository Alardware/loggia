/* Un nombre décimal s'écrit dans la langue de l'écran (audit du 03/10).
 *
 * La 3.82.0 avait retiré les vingt-trois remplacements du point par la virgule
 * qui faisaient lire « 21,5 °C » à un anglophone. Il restait l'inverse : des
 * `toFixed` et des arrondis faits à la main, qui posaient le POINT en
 * français — « 21.3° » sur le cadran du fil pilote, « actuel 20.6° » sur un
 * thermostat, « 4.2 mm » sur la carte météo, à côté de cartes en « 21,4° ».
 * Une seule fonction décide désormais : `nombre` (format.js), d'après
 * `locale()`.
 *
 * La langue est FIXÉE avant le premier import (voir tests/systeme_hoas) :
 * `i18n.js` la résout à l'import, d'après `navigator.language`. L'anglais se
 * demande ensuite comme l'application le fait, par `preparerLangue` — son
 * test vient donc en dernier.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true });
const { nombre } = await import('../src/format.js');
const { tr, langue, preparerLangue } = await import('../src/i18n.js');

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(RACINE, 'src');
const NL = String.fromCharCode(10);
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const app = lire('src', 'App.jsx');

test('nombre() en français : la virgule, les décimales demandées, jamais « -0 »', () => {
  assert.equal(langue(), 'fr');
  assert.equal(nombre(21.5, 1), '21,5');
  assert.equal(nombre(21.46, 1), '21,5', 'arrondi, pas tronqué');
  assert.equal(nombre(19, 1), '19,0', 'les décimales demandées s’écrivent, même nulles');
  assert.equal(nombre(19, 1, 0), '19', 'un entier reste entier quand on le demande');
  assert.equal(nombre(19.5, 1, 0), '19,5');
  assert.equal(nombre(1.234, 2), '1,23');
  assert.equal(nombre('21.5', 1), '21,5', 'un état de Home Assistant arrive en chaîne');
  assert.equal(nombre(-0.04, 1), '0,0', '« -0,0 » n’existe pas');
  assert.match(nombre(-3.26, 1), /^[-−]3,3$/);
  for (const rien of [null, undefined, '', NaN, Infinity, 'indisponible']) assert.equal(nombre(rien, 1), '—', String(rien));
  assert.equal(tr('actuel {n}°', { n: nombre(20.6, 1, 0) }), 'actuel 20,6°');
});

test('l’écran passe par nombre() : dec et decMax d’App.jsx, la pluie de la carte météo', () => {
  assert.ok(app.includes("import { fmtWatts, relTime, minutesDepuisHeure, nombre } from './format.js';"), 'App.jsx n’importe pas nombre');
  assert.ok(app.includes('const dec = (n, d) => nombre(n, d);') && app.includes('const decMax = (n, d) => nombre(n, d, 0);'), 'App.jsx formate encore les nombres à sa façon');
  assert.ok(app.includes('{target != null ? <>{dec(target, 1)}<span'), 'le cadran du fil pilote');
  assert.ok(app.includes("{tr('actuel {n}°', { n: decMax(z.current, 1) })}"), 'la mesure sous le cadran : traduite, et dans la convention de la langue');
  assert.ok(app.includes("tr('actuel {n}°', { n: decMax(a.current_temperature, 1) })"), 'la compacte d’un thermostat');
  assert.ok(app.includes("out.temp = r.temp != null ? dec(r.temp, 1) + '°' : '—';"), 'les pièces de l’Accueil');
  assert.ok(app.includes("{isNaN(v) ? '—' : decMax(v, 2)}"), 'la valeur d’une entité number dans la fiche générique');
  assert.ok(app.includes('(isNaN(n) ? String(brut) : decMax(n, 2))'), 'la valeur d’un capteur dans la fiche générique');
  assert.ok(lire('src', 'cartemeteo.jsx').includes("tr('{n} {u}', { n: nombre(pluie.cumul, 1, 0), u: pluie.uniteCumul })"), 'le cumul de pluie de la carte météo');
});

test('aucun nombre décimal formaté à la main dans src/', () => {
  /* Les commentaires sont blanchis d'abord, comme dans rien_en_francais : ils
   * racontent ces fautes, ils ne les commettent pas. Un `toFixed` qui place un
   * dessin — un chemin SVG, un pourcentage de CSS — n'est pas un nombre qu'on
   * lit : il reste permis.
   *
   * Un arrondi au dixième ou au centième n'est une faute que RENDU : collé à
   * l'accolade du JSX, ou concaténé à son unité. Suivi d'une espace et d'une
   * accolade, c'est la fin d'un littéral d'objet — les points de démo de la
   * Bibliothèque, qui sont des nombres et non du texte. */
  const fichiers = [];
  (function parcourir(d) {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) { if (f !== 'langues') parcourir(p); }
      else if (/\.jsx?$/.test(f)) fichiers.push(p);
    }
  })(SRC);
  const blanc = (m) => m.replace(/[^\n]/g, ' ');
  const A_LA_MAIN = [
    [/\.replace\(\s*(?:'\.'|"\."|`\.`|\/\\\.\/g?)\s*,\s*(?:','|","|`,`)\s*\)/g, 'la virgule posée à la main'],
    [/\.toFixed\(\d\)\s*\+\s*['"`]\s*(?:°|k?Wh?\b|mm\b|ppm\b|dB\b)/g, 'un toFixed suivi de son unité'],
    [/\.toFixed\(\d\)\}\s*</g, 'un toFixed écrit tel quel dans le JSX'],
    [/Math\.round\([^()]*\* ?(10|100)\) ?\/ ?\1\)?(?:\}|\s*\+\s*['"`][ °])/g, 'un arrondi fait à la main, affiché avec son point'],
    /* L'inverse, écrit d'avance : « 0,6 kWh » dans une prop de la
     * Bibliothèque, lu tel quel sur une page anglaise (relecture du 03/10).
     * Une clé de `tr()` qui porte sa virgule (« pas de 0,5° ») reste permise :
     * le catalogue donne à chaque langue la sienne. */
    [/(?<!\btr\()['"`][^'"`\n]*?\d,\d+ ?(?:°|k?Wh?\b|mm\b|ppm\b|dB\b)/g, 'un décimal écrit d’avance avec sa virgule'],
  ];
  const fautes = [];
  for (const f of fichiers) {
    const s = readFileSync(f, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, blanc)
      .replace(/(^|[^:'"\\])\/\/[^\n]*/g, (m, a) => a + blanc(m.slice(a.length)));
    for (const [re, quoi] of A_LA_MAIN) {
      for (const m of s.matchAll(re)) {
        fautes.push(relative(SRC, f).split('\\').join('/') + ':' + s.slice(0, m.index).split(NL).length + '  ' + quoi + ' : ' + m[0]);
      }
    }
  }
  assert.deepEqual(fautes, [], 'nombre() (format.js) écrit la virgule ou le point selon la langue');
});

test('nombre() laisse Intl arrondir : une demi-valeur s’éloigne de zéro, quel que soit son signe', () => {
  /* Relecture du 03/10 : un pré-arrondi `Math.round(n * k) / k` montait les
   * demi-valeurs vers +∞ et lisait le double binaire. Dans la fiche d'un
   * capteur (`decMax(n, 2)`, App.jsx), -1,125 se lisait « -1,12 » quand 1,125
   * donnait « 1,13 », et 1,005 kWh s'écrivait « 1,00 ». L'ancien `dec`
   * d'App.jsx laissait `toLocaleString` arrondir : « -1,13 » et « 1,01 ». */
  assert.match(nombre(-2.25, 1), /^[-−]2,3$/, 'la demi-valeur négative s’éloigne de zéro, comme la positive');
  assert.equal(nombre(2.25, 1), '2,3');
  assert.match(nombre(-1.125, 2), /^[-−]1,13$/, 'un capteur à -1,125 et un autre à 1,125 s’arrondissent au même chiffre');
  assert.equal(nombre(1.125, 2), '1,13');
  assert.equal(nombre(1.005, 2), '1,01', 'l’écriture décimale, pas le double binaire 1,00499…');
  assert.equal(nombre(0.145, 2), '0,15');
  assert.match(nombre(-0.05, 1), /^[-−]0,1$/, 'le demi-pas s’arrondit comme ailleurs, il ne devient pas zéro');
  assert.equal(nombre(-0.04, 1), '0,0', 'ce qui s’arrondit à zéro s’écrit sans signe');
  assert.equal(nombre(-0, 1), '0,0');
  assert.equal(nombre('-0.0', 1), '0,0', 'un état « -0.0 » de Home Assistant');
  assert.equal(nombre(-0.4, 0), '0');
  /* Le signe ne change rien d'autre : de 0,001 à 20, -x s'écrit x précédé du
   * moins, sauf quand x s'écrit zéro. */
  const ecarts = [];
  for (const d of [0, 1, 2]) {
    for (let i = 1; i <= 20000; i++) {
      const x = i / 1000, pos = nombre(x, d), neg = nombre(-x, d);
      const attendus = /[1-9]/.test(pos) ? ['-' + pos, '−' + pos] : [pos];
      if (!attendus.includes(neg)) ecarts.push(d + ' décimale(s) : ' + (-x) + ' → ' + neg + ', ' + x + ' → ' + pos);
    }
  }
  assert.deepEqual(ecarts.slice(0, 5), [], ecarts.length + ' écarts de signe');
});

test('aucune option d’Intl que la cible du build refuse', () => {
  /* `signDisplay: 'negative'` aurait effacé « -0,0 » dans nombre(), mais Intl
   * ne connaît cette valeur que depuis Chrome 106, Firefox 116 et Safari 15.4,
   * et la refuse avant par une RangeError. vite.config.js garde Safari 14 :
   * sur une tablette restée là, le premier nombre rendu ferait tomber l'écran
   * (relecture du 03/10). Les commentaires, qui en parlent, sont retirés avant
   * la recherche. */
  assert.ok(lire('vite.config.js').includes("'safari14'"), 'la cible du build a changé : ce garde-fou est à revoir');
  const fautes = [];
  (function parcourir(d) {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) { parcourir(p); continue; }
      if (!/\.jsx?$/.test(f)) continue;
      const s = readFileSync(p, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
      if (/signDisplay\s*:\s*['"`]negative/.test(s)) fautes.push(relative(SRC, p).split('\\').join('/'));
    }
  })(SRC);
  assert.deepEqual(fautes, [], 'nombre() (format.js) efface « -0 » sans signDisplay');
});

test('nombre() en anglais : le point, et la phrase entière dans la langue', async () => {
  /* Comme l'application : le catalogue se charge à part, et la langue bascule
   * quand il est là. */
  await import('../src/langues/en.js');
  for (let i = 0; i < 100 && langue() !== 'en'; i++) {
    preparerLangue({ language: 'en' });
    await new Promise(r => setTimeout(r, 10));
  }
  assert.equal(langue(), 'en', 'le catalogue anglais ne s’est pas chargé');
  assert.equal(nombre(21.5, 1), '21.5');
  assert.equal(nombre(19, 1), '19.0');
  assert.equal(nombre(19, 1, 0), '19');
  assert.equal(nombre(1.234, 2), '1.23');
  assert.match(nombre(-2.25, 1), /^[-−]2\.3$/, 'Intl arrondit dans toutes les langues : la demi-valeur négative s’éloigne de zéro');
  assert.equal(tr('actuel {n}°', { n: nombre(20.6, 1, 0) }), 'now 20.6°', 'plus de « 20,6 » au milieu de l’anglais');
});
