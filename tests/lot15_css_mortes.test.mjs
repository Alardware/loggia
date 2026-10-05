/* Une classe CSS sans lecteur ne reste pas dans index.css (lot 15 de l'audit
 * du 03/10).
 *
 * L'audit en comptait 64 (73 règles, 7 772 octets) : l'héritage des vues
 * refaites — Sécurité et Système d'avant, Paramètres « façon Atrium », le
 * lecteur Médias et la carte climat d'avant —, du ciel étoilé plein écran que
 * plus rien n'allumait, de la pastille de pièce qui glissait. Recomptées sur le
 * code du lot : 71. Le calendrier du rail, parti en v3.84.0, avait laissé ses
 * cinq règles ; `loggia-sky` n'était plus cité que par un COMMENTAIRE de
 * config.js ; `o-prise-turn` attendait un type de prise qui le pose, et aucun
 * ne l'a jamais fait — le tambour tourne dans son dessin (`o-ic-spin`).
 *
 * Un lecteur, c'est le nom ENTIER de la classe dans le code qui fabrique le DOM
 * — src/, index.html, public/ —, commentaires retirés : `className`,
 * `classList`, `querySelector`… Une classe construite par morceaux ne s'y lit
 * pas d'un bloc : son préfixe est NOMMÉ ci-dessous, avec la liste exacte des
 * suffixes que le code peut poser. Un préfixe toléré « en gros » laisserait
 * passer `o-prise-turn`, justement. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TYPES_PRISE } from '../src/prises.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(RACINE, 'src', 'index.css'), 'utf8');
const fichiers = (dossier) => readdirSync(dossier).flatMap((n) => {
  const p = join(dossier, n);
  return statSync(p).isDirectory() ? fichiers(p) : [p];
});

/** Le texte sans ses commentaires. Les chaînes restent entières : le `//`
 *  d'une adresse ou le `/*` d'un type MIME n'ouvre rien. */
function sansCommentaires(t) {
  let out = '';
  for (let i = 0; i < t.length;) {
    const c = t[i], d = t[i + 1];
    if (c === '/' && d === '*') { const f = t.indexOf('*/', i + 2); i = f < 0 ? t.length : f + 2; out += ' '; continue; }
    if (c === '/' && d === '/') { const f = t.indexOf('\n', i); i = f < 0 ? t.length : f; continue; }
    if (c === '<' && t.startsWith('<!--', i)) { const f = t.indexOf('-->', i); i = f < 0 ? t.length : f + 3; out += ' '; continue; }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < t.length && t[j] !== c && !(c !== '`' && t[j] === '\n')) j += t[j] === '\\' ? 2 : 1;
      out += t.slice(i, j + 1); i = j + 1; continue;
    }
    out += c; i++;
  }
  return out;
}

/** Les classes que nomment les SÉLECTEURS d'une feuille — ni les déclarations,
 *  ni les étapes d'une @keyframes, ni le préambule d'une @-règle. */
function classesDe(feuille) {
  const t = feuille.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const noms = new Set();
  const pile = [];
  let tampon = '';
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < t.length && t[j] !== c) j += t[j] === '\\' ? 2 : 1;
      tampon += t.slice(i, j + 1); i = j; continue;
    }
    if (c === '{') {
      const p = tampon.trim();
      const dansKeyframes = pile.includes('@keyframes');
      pile.push(/^@(-webkit-)?keyframes/.test(p) ? '@keyframes' : p.startsWith('@') ? '@' : 'règle');
      if (!p.startsWith('@') && !dansKeyframes) {
        const sel = p.replace(/"[^"]*"|'[^']*'/g, '').replace(/\[[^\]]*\]/g, '');
        for (const m of sel.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) noms.add(m[1]);
      }
      tampon = ''; continue;
    }
    if (c === '}') { pile.pop(); tampon = ''; continue; }
    if (c === ';') { tampon = ''; continue; }
    tampon += c;
  }
  return [...noms];
}

/** Ce qui ne se lit pas d'un bloc. `construit` doit figurer tel quel dans le
 *  code ; `suffixes` dit ce que le code peut réellement coller derrière. */
const DYNAMIQUES = {
  // App.jsx, carte de prise : `'o-prise-' + anim`, où anim = animationPrise()
  // = le `fx` de son type (prises.js) — `bob` pour le VE, `shake` pour la sirène.
  'o-prise-': { construit: "'o-prise-' + anim", suffixes: Object.values(TYPES_PRISE).map((t) => t.fx).filter(Boolean) },
};

/** Les classes de `feuille` que rien ne lit dans `code`. */
function sansLecteur(feuille, code, dynamiques = DYNAMIQUES) {
  const net = sansCommentaires(code);
  const lue = (nom) => new RegExp('(^|[^\\w-])' + nom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w-])').test(net);
  const construite = (nom) => Object.entries(dynamiques).some(([p, d]) => nom.startsWith(p) && d.suffixes.includes(nom.slice(p.length)));
  return classesDe(feuille).filter((nom) => !lue(nom) && !construite(nom)).sort();
}

const CODE = [
  ...fichiers(join(RACINE, 'src')).filter((p) => /\.(jsx?|mjs)$/.test(p)),
  join(RACINE, 'index.html'),
  ...fichiers(join(RACINE, 'public')).filter((p) => /\.m?js$/.test(p)),
].map((p) => readFileSync(p, 'utf8')).join('\n');

test('le filet voit ce qu’il doit voir : un commentaire ne lit rien, un préfixe ne vaut que pour ses suffixes', () => {
  const feuille = '.o-a { color: red } @media (max-width: 9px) { .o-b .o-c, [data-x=".o-z"] { gap: 0 } } @keyframes k { from { opacity: 0 } }'
    + ' .o-p-un, .o-p-deux:hover { gap: 1px }';
  const code = "<div className='o-a' /> /* o-b */ // o-c\nconst u = 'https://exemple.test/o-x'; el.className = 'o-p-' + fx;";
  assert.deepEqual(classesDe(feuille).sort(), ['o-a', 'o-b', 'o-c', 'o-p-deux', 'o-p-un'], 'ni l’attribut, ni la keyframes, ni le préambule du media');
  assert.deepEqual(sansLecteur(feuille, code, { 'o-p-': { suffixes: ['un'] } }), ['o-b', 'o-c', 'o-p-deux']);
  assert.ok(sansCommentaires("const u = 'https://exemple.test'; // fin").includes("'https://exemple.test'"), 'une adresse n’est pas un commentaire');
});

test('les préfixes tolérés sont vraiment construits, et seulement avec leurs suffixes', () => {
  const net = sansCommentaires(CODE);
  for (const [prefixe, d] of Object.entries(DYNAMIQUES)) {
    assert.ok(net.includes(d.construit), prefixe + ' : « ' + d.construit + ' » n’est plus dans le code — la tolérance n’a plus lieu d’être');
    assert.ok(d.suffixes.length > 0, prefixe + ' : aucun suffixe posé');
  }
  // Et dans l'autre sens : un `fx` posé sans sa règle ne bougerait pas.
  for (const fx of DYNAMIQUES['o-prise-'].suffixes) assert.ok(css.includes('.o-prise-' + fx + ' { '), '.o-prise-' + fx + ' : posée par un type de prise, sans règle');
});

test('aucune classe de index.css sans lecteur', () => {
  const morts = sansLecteur(css, CODE);
  assert.deepEqual(morts, [], morts.length + ' classe(s) que rien ne pose — à retirer avec leurs règles : ' + morts.join(' '));
});

test('les keyframes qui ne servaient qu’à une classe morte sont parties avec elle', () => {
  for (const k of ['o-doneIn', 'o-indIn', 'o-radarK', 'o-prise-turn']) {
    assert.ok(!css.includes('@keyframes ' + k + ' '), '@keyframes ' + k + ' : plus personne ne l’anime');
  }
  // Celles de la plaque qui travaille, elles, restent : le VE et la sirène les posent.
  assert.ok(css.includes('.o-prise-bob { animation: o-prise-bob 1.8s ease-in-out infinite; }'));
  assert.ok(css.includes('.o-prise-shake { transform-origin: 50% 10%; animation: o-prise-shake .9s ease-in-out infinite; }'));
});
