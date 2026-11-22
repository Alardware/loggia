// ─────────────────────────────────────────────────────────────────────────────
// Quatre thèmes retirés le 19/11 (sa demande : « supprime les thèmes givre, plume wine, lavande et the Projekt »).
//
// Un thème tient sur trois endroits : son preset (theme.js ou themes-bleus.js), sa carte du sélecteur (PRESET_META) et sa
// place dans NATIFS. Les trois partent ensemble. Un écran qui en gardait un retombe sur le thème par défaut, et Paramètres
// coche « Loggia » au lieu de ne rien cocher (`themeConnu`).
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MONOLITHE } from './monolithe.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');
const theme = lire('src', 'theme.js'), bleus = lire('src', 'themes-bleus.js');
const par = lire('src', 'views', 'parametres.jsx'), app = MONOLITHE;
const RETIRES = ['givre', 'plum', 'lavande', 'projekt'];

test('les quatre thèmes n’ont plus ni preset, ni carte, ni place dans les listes', () => {
  for (const id of RETIRES) {
    assert.ok(!theme.includes('\n  ' + id + ': {'), id + ' : son preset est encore dans theme.js');
    assert.ok(!bleus.includes('\n  ' + id + ': {'), id + ' : son preset est encore dans themes-bleus.js');
    assert.ok(!par.includes("{ id: '" + id + "'"), id + ' : sa carte est encore dans le sélecteur');
  }
  const l = (nom) => JSON.parse(par.match(new RegExp('const ' + nom + ' = (\\[[^\\]]*\\]);'))[1].replace(/'/g, '"'));
  assert.deepEqual(l('NATIFS'), ['', 'prisme', 'saphir', 'acier', 'atrium', 'ios', 'google', 'neumorphix']);
  assert.deepEqual(l('COMMU'), ['frosted', 'onedark', 'dracula', 'github', 'tokyo', 'nightowl', 'material']);
  // Les thèmes chargés à la demande : Givre n'en est plus.
  assert.match(theme, /const BLEUS = \['saphir', 'acier'\];/);
});

test('un écran qui gardait un thème retiré retombe sur Loggia, et Paramètres le coche', () => {
  const m = theme.match(/export const THEMES_RETIRES = (\[[^\]]*\]);\nexport const themeConnu = (\(t\) => [^\n]*);/);
  assert.ok(m, 'la garde des thèmes retirés a disparu de theme.js');
  const liste = JSON.parse(m[1].replace(/'/g, '"'));
  assert.deepEqual(liste.slice().sort(), RETIRES.slice().sort());
  const themeConnu = new Function('THEMES_RETIRES', 'return ' + m[2].replace(/;$/, ''))(liste);
  for (const id of RETIRES) assert.equal(themeConnu(id), '', id + ' n’est pas ramené au défaut');
  for (const id of ['', 'prisme', 'saphir', 'acier', 'dracula']) assert.equal(themeConnu(id), id, id + ' est touché à tort');
  assert.equal(themeConnu(null), '');
  // Les deux portes par où un thème enregistré entre dans l'état : le stockage de l'écran et l'apparence du profil.
  assert.ok(app.includes("const t = localStorage.getItem('loggia-theme'); return t != null ? themeConnu(t) : ''; }"), 'le stockage de l’écran');
  assert.ok(app.includes("if (typeof ap.theme === 'string') setLoggiaTheme(themeConnu(ap.theme));"), 'l’apparence du profil');
});
