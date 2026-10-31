/* Le monolithe que les tests lisent (ADR 0282).
 *
 * `tests/monolithe.mjs` rend `App.jsx` et tout ce qui en sort comme un seul
 * texte : c'est ce qui permet de découper App.jsx (lot 5 de l'audit du 28/10)
 * sans casser des dizaines de tests qui n'ont rien vu changer. Ce fichier
 * garde deux choses :
 *  - le helper dit vrai : App.jsx en tête, chaque module sorti ensuite ;
 *  - aucun test ne se remet à lire App.jsx DIRECTEMENT — il ne verrait plus
 *    ce qui en est sorti, et casserait au premier déplacement.
 * Les imports d'App.jsx (`import('../src/App.jsx?…')`) ne sont pas des
 * lectures du texte : ils testent ce que le module EXPORTE, et App.jsx garde
 * ses réexports au lot 5.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DOSSIERS_SORTIS, FICHIERS_SORTIS, MONOLITHE, PIECES_DU_MONOLITHE } from './monolithe.mjs';

const ICI = dirname(fileURLToPath(import.meta.url));
const SRC = join(ICI, '..', 'src');

test('le monolithe commence par App.jsx, tel que le disque le porte', () => {
  assert.equal(PIECES_DU_MONOLITHE[0], 'App.jsx', 'App.jsx n’est plus en tête : les positions que les tests lisent ont bougé');
  const app = readFileSync(join(SRC, 'App.jsx'), 'utf8');
  assert.ok(MONOLITHE.startsWith(app), 'le monolithe ne commence plus par App.jsx tel quel');
  if (PIECES_DU_MONOLITHE.length === 1) assert.equal(MONOLITHE, app, 'rien n’est sorti, et le monolithe n’est pourtant pas App.jsx');
});

test('chaque module sorti est lu, et lu une fois', () => {
  for (const p of PIECES_DU_MONOLITHE) assert.ok(existsSync(join(SRC, p)), p + ' : une pièce du monolithe qui n’existe pas');
  assert.equal(new Set(PIECES_DU_MONOLITHE).size, PIECES_DU_MONOLITHE.length, 'une pièce du monolithe est lue deux fois');
  for (const d of DOSSIERS_SORTIS) {
    const racine = join(SRC, d);
    if (!existsSync(racine)) continue;
    const dedans = readdirSync(racine, { recursive: true }).map(f => d + '/' + String(f).replace(/\\/g, '/')).filter(f => /\.(js|jsx)$/.test(f));
    for (const f of dedans) assert.ok(PIECES_DU_MONOLITHE.includes(f), f + ' est sorti d’App.jsx, et les tests ne le lisent pas');
  }
  for (const f of FICHIERS_SORTIS) assert.ok(PIECES_DU_MONOLITHE.includes(f), f + ' est déclaré sorti, et les tests ne le lisent pas');
});

/* Les formes d'une lecture DIRECTE du texte d'App.jsx. Un import, un crochet de
 * chargement (`url.endsWith('/src/App.jsx?…')`), un nom dans un message ne
 * sont pas des lectures. */
const LECTURES = [
  /readFileSync\([^)]*'App\.jsx'/,
  /readFileSync\(\s*new URL\(\s*'\.\.\/src\/App\.jsx'/,
  /\blire\w*\(\s*(?:'src'\s*,\s*'App\.jsx'|'src\/App\.jsx'|'App\.jsx')\s*\)/,
  /\[\s*'App\.jsx'\s*,[^\]]*\]\s*\.map\(/,
  // Le chemin relatif au test (ADR 0283) : `fuite_calculee` lisait ainsi App.jsx seul, et l'Accueil en était sorti.
  /\blire\w*\(\s*'\.\.\/src\/App\.jsx'\s*\)/,
];

test('aucun test ne lit App.jsx sans ce qui en est sorti', () => {
  const fautifs = [];
  for (const f of readdirSync(ICI).filter(n => n.endsWith('.mjs') && n !== 'monolithe.mjs' && n !== 'monolithe.test.mjs')) {
    readFileSync(join(ICI, f), 'utf8').split('\n').forEach((l, i) => {
      const t = l.trim();
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
      if (LECTURES.some(r => r.test(l))) fautifs.push(f + ':' + (i + 1));
    });
  }
  assert.deepEqual(fautifs, [], 'ce test lit App.jsx seul : lis MONOLITHE (tests/monolithe.mjs), sinon il cassera au premier code déplacé');
});

test('le garde-fou reconnaît bien une lecture directe', () => {
  for (const l of ["readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8')", "readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')",
    "lire('src', 'App.jsx')", "lire('src/App.jsx')", "['App.jsx', 'theme.js'].map(f => lire('src', f))", "const APP = lire('../src/App.jsx');"]) {
    assert.ok(LECTURES.some(r => r.test(l)), 'une lecture directe passe le garde-fou : ' + l);
  }
  for (const l of ["await import(new URL('../src/App.jsx?x', import.meta.url).href)", "if (!url.endsWith('/src/App.jsx?x')) return next(url, ctx);",
    "assert.ok(i >= 0, nom + ' a disparu d’App.jsx');"]) {
    assert.ok(!LECTURES.some(r => r.test(l)), 'le garde-fou refuse ce qui n’est pas une lecture : ' + l);
  }
});
