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
/* `Ico`, `CUSTOM_SVG` et `FI_MAP` ont quitte App.jsx le 23/09 (plan M1) :
 * un ecran sorti du monolithe ne pouvait plus appeler l'icone. Les noms
 * d'icones, eux, sont cites des deux cotes — on relit donc les deux. */
const src = ['icones.jsx', 'App.jsx'].map(x => readFileSync(join(RACINE, 'src', x), 'utf8')).join(String.fromCharCode(10));
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

test('chaque icône proposée dans la fiche d’une pièce est rendable', () => {
  const m = src.match(/const ICONES_PIECE = \[([^\]]+)\]/);
  assert.ok(m, 'la liste ICONES_PIECE doit exister');
  const noms = [...m[1].matchAll(/'([a-z0-9-]+)'/g)].map(x => x[1]);
  assert.ok(noms.length >= 10, 'la grille de la maquette compte dix icônes');
  const absentes = noms.filter(n => !rendable(n));
  assert.deepEqual(absentes, [], 'ces icônes n’afficheraient rien dans la fiche :\n  ' + absentes.join('\n  '));
});

test('chaque icône de pièce est rendable', () => {
  // Les icônes par défaut des pièces, écrites en JSX dans la table `PIECES`.
  const noms = [...new Set([...bloc('PIECES').matchAll(/<Ico name="([a-z0-9-]+)"/g)].map(m => m[1]))];
  assert.ok(noms.length >= 5, 'les pièces d’exemple doivent être trouvées');
  const absentes = noms.filter(n => !rendable(n));
  assert.deepEqual(absentes, [], 'ces icônes de pièce n’afficheraient rien :\n  ' + absentes.join('\n  '));
});

test('la police PLEINE n’est ni chargée ni employée, et l’attente est bornée', () => {
  /* 151 Ko de CSS et 188 Ko de police, en feuille BLOQUANTE, pour zéro classe
   * utilisée : toutes les icones de Loggia sont baties en `fi fi-rr-`. Retirée
   * le 23/09 (plan M3). Ce test empêche de la remettre par distraction — et
   * d’écrire une classe `fi-sr-` qui ne s’afficherait plus. */
  const index = readFileSync(join(RACINE, 'index.html'), 'utf8');
  /* On cherche la BALISE, pas le mot : la remarque qui explique le retrait
   * nomme la police, et se faisait prendre pour elle. */
  const feuilles = [...index.matchAll(/<link[^>]+href="([^"]+)"/g)].map(m => m[1]);
  assert.ok(!feuilles.some(f => /uicons-solid/.test(f)), 'la police pleine est à nouveau chargée');
  assert.ok(feuilles.some(f => /uicons-regular-rounded\.css/.test(f)), 'la police des icones a disparu');
  assert.ok(!/fi-sr-/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')),
    'une classe `fi-sr-` est apparue : sa police n’est plus là');

  /* `block` et non `swap` : le repli d’une police d’icones dessine des carrés
   * vides. Sans cette ligne, l’attente n’était bornée par rien. */
  assert.match(css, /font-display:\s*block/, 'l’attente de la police n’est plus bornée');
});
