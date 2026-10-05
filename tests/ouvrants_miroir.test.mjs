// ─────────────────────────────────────────────────────────────────────────────
// Ce qu'est un volet, dit au même endroit des deux côtés (audit du 03/10).
//
// Le composant ne pilote que les ouvrants dont la classe est dans
// `ouvrants.py` ; l'écran des réglages ne montre que ceux-là. Si les deux
// listes divergeaient, l'écran proposerait de régler un portail que le
// planning ne bougera jamais — ou cacherait un volet qu'il bouge.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const classes = (texte) => (texte.match(/["']([a-z_]+)["']/g) || []).map((s) => s.slice(1, -1));

test('l’écran et le composant disent la même chose d’un volet', () => {
  const py = lire('custom_components', 'loggia', 'ouvrants.py').match(/CLASSES_VOLETS: tuple\[str, \.\.\.\] = \(([^)]*)\)/);
  const js = lire('src', 'views', 'volets.jsx').match(/const CLASSES_VOLETS = \[([^\]]*)\]/);
  assert.ok(py && js, 'une des deux listes a disparu ou changé de forme');
  assert.deepEqual(classes(js[1]), classes(py[1]));
  // Le choix du 03/10 : une classe absente n'est pas un volet, et une
  // fenêtre de toit n'en est pas un non plus (elle est à part, sur option).
  assert.ok(!classes(py[1]).includes('window') && !py[1].includes('None'));
});

test('la démonstration montre de vrais volets', () => {
  // Sans classe, ses trois volets disparaissaient de l'écran des réglages.
  const demo = lire('src', 'demo.js');
  for (const id of ['volet_salon', 'volet_cuisine', 'volet_chambre']) {
    const ligne = demo.split('\n').find((l) => l.includes(`'cover.${id}': s(`));
    assert.ok(ligne && ligne.includes("device_class: 'shutter'"), id + ' n’a pas de classe');
  }
});
