// ─────────────────────────────────────────────────────────────────────────────
// Aucune porte publique sans personne derrière (24/09, plan S4).
//
// Un `export` est un engagement : le symbole doit survivre aux remaniements,
// garder son nom, garder sa forme. Quand plus rien ne l'importe, l'engagement
// tient dans le vide — et surtout, plus rien ne dit qu'il est mort. Un symbole
// interne, lui, se fait retirer par le premier qui voit qu'il ne sert plus.
//
// Huit symboles étaient morts pour de bon, sept `export default` ne doublaient
// qu'un export nommé, et trente portes s'ouvraient sur un symbole que seul son
// propre fichier utilisait.
//
// UN TEST EST UN CLIENT LÉGITIME. Sortir une fonction pure pour la vérifier
// sans monter d'écran est exactement ce que le plan demande ailleurs (M11) :
// ces exports-là restent, et ce test les accepte.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const racine = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const parcourir = (dir, sortie = []) => {
  for (const nom of readdirSync(dir)) {
    const p = join(dir, nom);
    if (statSync(p).isDirectory()) parcourir(p, sortie);
    else if (/\.(js|jsx)$/.test(nom)) sortie.push(p);
  }
  return sortie;
};

const lire = (p) => readFileSync(p, 'utf8');
const relatif = (p) => p.slice(racine.length).replace(/\\/g, '/');

const SOURCES = parcourir(join(racine, 'src')).map(p => [relatif(p), lire(p)]);
const TESTS = readdirSync(join(racine, 'tests'))
  .filter(f => f.endsWith('.mjs'))
  .map(f => lire(join(racine, 'tests', f)));

/* Les langues sont des catalogues : un objet par fichier, jamais de symbole
 * à importer un par un. Elles n'entrent pas dans le compte. */
const HORS = /^src\/langues\//;

const DECL = /^export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm;

test('aucun export que personne n’importe', () => {
  const orphelins = [];
  for (const [chemin, texte] of SOURCES) {
    if (HORS.test(chemin)) continue;
    for (const [, nom] of texte.matchAll(DECL)) {
      const mot = new RegExp(`\\b${nom}\\b`);
      const ailleurs = SOURCES.some(([c, t]) => c !== chemin && mot.test(t));
      const enTest = TESTS.some(t => mot.test(t));
      if (!ailleurs && !enTest) orphelins.push(`${nom} (${chemin})`);
    }
  }
  assert.deepEqual(orphelins, [],
    'ces symboles sont exportés et personne ne les importe : retire le mot `export`, ou retire le symbole');
});

test('aucun export default qui double un export nommé', () => {
  const doublons = [];
  for (const [chemin, texte] of SOURCES) {
    const m = texte.match(/^export default ([A-Za-z_$][\w$]*);?\s*$/m);
    if (!m) continue;
    const nom = m[1];
    if (new RegExp(`^export\\s+(?:async\\s+)?(?:function|const|let|class)\\s+${nom}\\b`, 'm').test(texte)) {
      doublons.push(`${nom} (${chemin})`);
    }
  }
  assert.deepEqual(doublons, [],
    'un défaut qui répète un export nommé donne deux noms au même symbole, et personne n’importe le défaut');
});
