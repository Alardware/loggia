// ─────────────────────────────────────────────────────────────────────────────
// Un mode se MÉMORISE, il ne se déduit pas de ses valeurs.
//
// « Heures à lui », dans le détail par volet, était déduit de la présence d'un
// décalage : `ouverture != null || fermeture != null`. Vider le dernier champ
// rendait donc le mode faux, le bloc entier se démontait, et le volet
// retombait sur « Comme les autres ». Le champ disparaissait sous les doigts
// de qui essayait simplement de corriger un nombre.
//
// C'était d'autant plus faux que la ligne d'aide, juste en dessous, annonce
// l'inverse : « Vide = suit l'heure générale pour ce sens. » Vider est un
// choix, pas une sortie du mode.
//
// La leçon vaut au-delà des volets : dès qu'un réglage a un mode ET des
// valeurs, l'un ne doit pas se lire dans les autres.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(RACINE, 'src', 'views', 'volets.jsx'), 'utf8');

test('« Heures à lui » survit à des champs vides', () => {
  const m = src.match(/const propre = !!\(r && !r\.exclu && \(([^)]*)\)\);/);
  assert.ok(m, 'la règle du mode « Heures à lui » a disparu ou changé de forme');
  const cond = m[1];
  assert.match(cond, /r\.perso/,
    'le mode redevient déduit des valeurs : vider les deux champs le fera disparaître');
  // Le bouton doit poser le drapeau, sinon la lecture ne trouvera jamais rien.
  assert.match(src, /poser\(\{ perso: true, ouverture: 60, fermeture: null \}\)/,
    'le bouton « Heures à lui » ne pose plus le mode');
});

test('les réglages écrits avant le drapeau restent reconnus', () => {
  const m = src.match(/const propre = !!\(r && !r\.exclu && \(([^)]*)\)\);/);
  const cond = m[1];
  // Une installation configurée avant ce correctif n'a que ses décalages :
  // ne lire que le drapeau ferait retomber tous ses volets sur « Comme les
  // autres » à la première ouverture de la page.
  assert.match(cond, /r\.ouverture != null \|\| r\.fermeture != null/,
    'les anciennes configurations perdraient leur mode');
});

test('vider un champ écrit null, pas zéro', () => {
  // `Number('')` vaut 0 : sans le test explicite du vide, effacer le contenu
  // enregistrerait un décalage de zéro minute — un réglage actif — au lieu de
  // rendre le volet à l'heure générale.
  const champs = src.match(/e\.target\.value === '' \? null :/g) || [];
  assert.equal(champs.length, 2,
    'les deux champs de minutes doivent distinguer « vide » de « zéro »');
});
