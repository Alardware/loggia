// ─────────────────────────────────────────────────────────────────────────────
// Les icônes désignées existent-elles vraiment ?
//
// `Ico` consulte TROIS sources, dans cet ordre : `CUSTOM_SVG` (des dessins
// maison), `FI_MAP` (des alias), puis la police REGULAR — `fi-rr-`. Une cible
// absente des trois n'affiche RIEN : pas de carré, pas de point
// d'interrogation, rien. L'erreur est donc invisible en lecture de code et ne
// se voit qu'à l'écran.
//
// Ce test est né d'une bévue : `couch` cherché dans le seul CSS de la police
// SOLIDE, conclu absent, et remplacé par une chaise — alors qu'il vivait dans
// `CUSTOM_SVG` et s'affichait très bien.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
const css = readFileSync(join(RACINE, 'public', 'fonts', 'uicons-regular-rounded.css'), 'utf8');

/** Le contenu d'un objet littéral nommé, sans l'évaluer.
 *
 * Un objet écrit sur UNE seule ligne (`const FI_MAP = { … };`) n'a pas de
 * `\n};` à lui : la recherche filait alors jusqu'à la fin d'un objet situé
 * des centaines de lignes plus bas et ramassait au passage des paires qui
 * n'ont rien à voir. Le test se mettait à échouer au gré des déplacements de
 * code, sans qu'aucune icône ait bougé. On s'arrête donc à la fin de la ligne
 * quand la déclaration s'y termine. */
function bloc(nom) {
  const i = src.indexOf('const ' + nom);
  if (i < 0) return '';
  const finLigne = src.indexOf('\n', i);
  const uneLigne = src.slice(i, finLigne);
  if (uneLigne.includes('};')) return uneLigne;
  return src.slice(i, src.indexOf('\n};', i));
}

const cles = (texte) => new Set([...texte.matchAll(/^\s+'?([a-zA-Z0-9_-]+)'?\s*:/gm)].map(m => m[1]));

const CUSTOM = cles(bloc('CUSTOM_SVG'));
const ALIAS = Object.fromEntries(
  [...bloc('FI_MAP').matchAll(/'?([a-zA-Z0-9_-]+)'?\s*:\s*'([a-zA-Z0-9_-]+)'/g)].map(m => [m[1], m[2]]));
const POLICE = new Set([...css.matchAll(/\.fi-rr-([a-z0-9-]+):before/g)].map(m => m[1]));

/** Une icône est rendable si l'une des trois sources la connaît. */
const rendable = (nom) => CUSTOM.has(nom) || POLICE.has(ALIAS[nom] || nom);

test('les trois sources d’icônes sont bien lisibles', () => {
  // Si ce test échoue, c'est que la structure du fichier a changé et que les
  // suivants ne vérifient plus rien.
  assert.ok(CUSTOM.size >= 5, 'CUSTOM_SVG doit contenir les dessins maison');
  assert.ok(POLICE.size > 1000, 'la police regular doit être chargée');
  assert.equal(CUSTOM.has('couch'), true, '`couch` est un dessin maison, pas un glyphe de police');
  assert.equal(POLICE.has('couch'), false, '… et il n’est PAS dans la police : c’est tout le piège');
});

test('chaque icône traduite depuis Home Assistant est rendable', () => {
  const cibles = [...new Set([...bloc('MDI_VERS_UICON').matchAll(/:\s*'([a-z0-9-]+)'/g)].map(m => m[1]))];
  assert.ok(cibles.length > 10, 'la table doit être trouvée et non vide');
  const absentes = cibles.filter(c => !rendable(c));
  assert.deepEqual(absentes, [], 'ces icônes n’afficheraient rien :\n  ' + absentes.join('\n  '));
});

test('chaque icône de pièce est rendable', () => {
  // Les icônes par défaut des pièces, écrites en JSX dans la table `PIECES`.
  const noms = [...new Set([...bloc('PIECES').matchAll(/<Ico name="([a-z0-9-]+)"/g)].map(m => m[1]))];
  assert.ok(noms.length >= 5, 'les pièces d’exemple doivent être trouvées');
  const absentes = noms.filter(n => !rendable(n));
  assert.deepEqual(absentes, [], 'ces icônes de pièce n’afficheraient rien :\n  ' + absentes.join('\n  '));
});
