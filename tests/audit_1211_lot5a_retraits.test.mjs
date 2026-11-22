// ─────────────────────────────────────────────────
// Lot 5a de l'audit du 12/11 (ADR 0372) : du code mort retiré, rien d'autre.
//
// Neuf animations que plus rien ne jouait, une fonction sans appelant
// (`feederScript`), neuf exports que personne n'importait, une ligne
// redondante dans le verdict d'un volet, deux commentaires sans code, et un
// minuteur jamais armé dans l'en-tête. Ce test tient la règle générale — toute animation définie est
// jouée quelque part — et empêche chaque retrait de revenir en silence.
//
// Ne lit pas `src/App.jsx` : ce qui est retiré ici n'y a jamais vécu.
// ─────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const lire = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const CSS = lire('src/index.css');

/* Le reste de `src/`, en texte : les scripts et les autres feuilles, sans la
 * feuille principale (qui définit) ni `App.jsx`. */
const SRC = fileURLToPath(new URL('../src', import.meta.url));
const parcourir = (dir, sortie = []) => {
  for (const nom of readdirSync(dir)) {
    const p = join(dir, nom);
    if (statSync(p).isDirectory()) parcourir(p, sortie);
    else if (/\.(js|jsx|css)$/.test(nom) && !/[\\/]src[\\/](App\.jsx|index\.css)$/.test(p)) sortie.push(readFileSync(p, 'utf8'));
  }
  return sortie;
};
const AILLEURS = parcourir(SRC).join('\n');

const echapper = (s) => s.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
const mot = (n) => new RegExp('(^|[^A-Za-z0-9_-])' + echapper(n) + '([^A-Za-z0-9_-]|$)');

// ── Les animations ───────────────────────────────────────────────────────────

const NEUF = ['flowdash', 'floaty', 'm-pulse', 'm-wiggle', 'm-bounce', 'm-charge', 'o-popIn', 'np-pulse', 'o-avatarinK'];

test('les neuf animations que plus rien ne jouait ne sont plus définies', () => {
  for (const n of NEUF) assert.ok(!mot('@keyframes ' + n).test(CSS) && !CSS.includes('@keyframes ' + n + ' '), n + ' est revenue');
  assert.ok(!CSS.includes('ring pulsant du bouton play'), 'le commentaire de np-pulse est resté seul');
  assert.ok(CSS.includes('.o-avatarin { animation: none; }'), 'la classe de l’avatar reste');
  assert.ok(!/Classe et keyframes conserves/.test(CSS), 'le commentaire de l’avatar promet encore des keyframes');
});

test('règle générale : toute animation définie dans index.css est jouée quelque part', () => {
  const definies = [...CSS.matchAll(/@keyframes ([A-Za-z0-9_-]+)/g)].map(m => m[1]);
  assert.ok(definies.length >= 60, 'la feuille définit bien ses animations');
  assert.equal(new Set(definies).size, definies.length, 'une animation définie deux fois');
  // Une déclaration `animation` de la feuille, hors des définitions, ou une chaîne d'un autre fichier de src/.
  const declarations = [...CSS.replace(/@keyframes [A-Za-z0-9_-]+/g, '').matchAll(/animation(?:-name)?\s*:[^;}]*/g)].map(m => m[0]).join('\n');
  const muettes = definies.filter(n => !mot(n).test(declarations) && !mot(n).test(AILLEURS));
  assert.deepEqual(muettes, [], 'ces animations sont définies et rien ne les joue : retire-les, ou appelle-les');
});

// ── Le distributeur ──────────────────────────────────────────────────────────

test('`feederScript` n’existe plus ; `vacSlug`, qui a d’autres lecteurs, reste', () => {
  const state = lire('src/state.js');
  assert.ok(!state.includes('feederScript'), 'state.js');
  assert.ok(!AILLEURS.includes('feederScript('), 'un autre fichier de src/');
  assert.ok(state.includes('export const vacSlug = '), 'vacSlug');
});

// ── Les exports sans client ──────────────────────────────────────────────────

const INTERNES = [
  ['src/config.js', 'report', /^function report\(/m],
  ['src/config.js', 'LOCAL_ONLY_KEYS', /^const LOCAL_ONLY_KEYS = /m],
  ['src/fichecommune.jsx', 'FOND', /^const FOND = /m],
  ['src/minuteurmedia.js', 'finTexte', /^const finTexte = /m],
  ['src/plan3dmodele.js', 'ENTITE', /^const ENTITE = /m],
  ['src/plan3dmodele.js', 'norm', /^const norm = /m],
  ['src/sysconf.js', 'SYS_SLOTS', /^const SYS_SLOTS = /m],
  ['src/robotsfiche.js', 'CLEAN_AREA', /^const CLEAN_AREA = /m],
  ['src/demo.js', 'eauEtatDemo', /^function eauEtatDemo\(/m],
];

test('neuf symboles ne sont plus exportés, et existent toujours', () => {
  for (const [f, nom, definition] of INTERNES) {
    const t = lire(f);
    assert.ok(!new RegExp('^export\\s+(?:async\\s+)?(?:function|const|let|class)\\s+' + nom + '\\b', 'm').test(t), nom + ' est de nouveau exporté (' + f + ')');
    assert.ok(definition.test(t), nom + ' a disparu de ' + f);
  }
});

test('`GlypheHaut` reste exporté : tests/carte_media.test.mjs le monte par son nom', () => {
  assert.ok(lire('src/carteenfant.jsx').includes('export function GlypheHaut('));
});

// ── Deux commentaires sans code ──────────────────────────────────────────────
//
// La troisième variante de la carte de pièce (N5) RESTE : sa poignée clavier
// compte parmi les vingt que tests/clavier.test.mjs exige de lire.

test('les briques de l’Accueil ne décrivent plus un lecteur média qui n’y est pas', () => {
  assert.ok(!lire('src/accueil/briques.jsx').includes('Détail média : lecteur complet'), 'le commentaire sans code est revenu');
});

test('la fiche du chauffage ne décrit plus un `motPreset` local : il est importé', () => {
  const f = lire('src/fichechauffage.jsx');
  assert.ok(!f.includes('Le mot d\'un préréglage (`motPreset`'), 'le commentaire orphelin');
  assert.ok(/import \{[^}]*\bmotPreset\b[^}]*\} from '\.\/chauffageecran\.js'/.test(f), 'l’import de chauffageecran.js');
});

// ── Le verdict d'un volet ────────────────────────────────────────────────────

test('« fermé » : la ligne redondante est partie, le verdict n’a pas bougé', async () => {
  const v = lire('src/voletecran.js');
  assert.ok(!v.includes("st.state === 'open' && pos >= 100"), 'la ligne redondante');
  const { coverFerme } = await import('../src/voletecran.js');
  const st = (state) => ({ state });
  assert.equal(coverFerme(st('open'), 100), false);
  assert.equal(coverFerme(st('open'), 120), false);
  assert.equal(coverFerme(st('open'), '100'), false, 'une position écrite en texte');
  assert.equal(coverFerme(st('open'), 2), true);
  assert.equal(coverFerme(st('closed'), 100), true, 'Home Assistant dit closed : il fait foi');
  assert.equal(coverFerme(null, 0), true);
  assert.equal(coverFerme(st('opening'), 100), false);
});

// ── L'en-tête ────────────────────────────────────────────────────────────────

test('l’en-tête n’a plus de minuteur jamais armé', () => {
  const e = lire('src/chrome/entete.jsx');
  assert.ok(!e.includes('chipTimer'), 'chipTimer');
  assert.ok(e.includes("const menu = { position: 'absolute', top: 'calc(100% + 8px)'"), 'le menu de l’en-tête n’a pas bougé');
});
