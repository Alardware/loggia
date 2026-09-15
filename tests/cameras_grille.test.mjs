// Les cameras sur telephone : UNE par ligne — la grille de deux (v3.24.2) n'a
// pas plu (retour user du 15/09 : « pas fan finalement la grille de 2 »).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(RACINE, 'src', 'index.css'), 'utf8');
const NL = String.fromCharCode(10);

test('sur telephone, les grilles de cameras reviennent a une colonne', () => {
  const uneColonne = css.split(NL).find(l => l.includes('.grid-rappels, .grid-scenes') && l.includes('grid-template-columns: 1fr !important'));
  assert.ok(uneColonne, 'la liste « une colonne » du media mobile existe');
  assert.ok(uneColonne.includes('.grid-cams,') && uneColonne.includes('.grid-sec-cams,'), 'les cameras y sont de nouveau');
  assert.ok(!css.includes('.grid-cams, .grid-sec-cams { grid-template-columns: 1fr 1fr'), 'plus de grille de deux');
  assert.ok(!css.includes('.grid-cams .o-campied'), 'plus de tuile resserree');
});
