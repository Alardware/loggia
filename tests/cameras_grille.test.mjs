// Les cameras sur telephone : deux par ligne, la tuile resserree (retour user
// du 15/09 : « une grille de 2 egalement, la popup l'agrandit de toute facon »).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
const css = readFileSync(join(RACINE, 'src', 'index.css'), 'utf8');
const NL = String.fromCharCode(10);

test('sur telephone, les grilles de cameras gardent deux colonnes', () => {
  const uneColonne = css.split(NL).find(l => l.includes('.grid-rappels, .grid-scenes') && l.includes('grid-template-columns: 1fr !important'));
  assert.ok(uneColonne, 'la liste « une colonne » du media mobile existe toujours');
  assert.ok(!uneColonne.includes('.grid-cams') && !uneColonne.includes('.grid-sec-cams'), 'les cameras n’y sont plus');
  assert.ok(css.includes('.grid-cams, .grid-sec-cams { grid-template-columns: 1fr 1fr !important; gap: 10px !important; }'), 'deux colonnes, gap serre');
});

test('la tuile se resserre a mi-largeur : badge, heure, pied, nom et bouton', () => {
  ['.grid-cams .o-livebadge, .grid-sec-cams .o-livebadge', '.grid-cams .o-camheure, .grid-sec-cams .o-camheure', '.grid-cams .o-campied, .grid-sec-cams .o-campied',
    '.grid-cams .o-campied .o-camnom', '.grid-cams .o-campied .o-camsous', '.grid-cams .o-campied button, .grid-sec-cams .o-campied button { width: 28px !important; height: 28px !important; }']
    .forEach(r => assert.ok(css.includes(r), r));
  const d = src.indexOf('function CameraTile(');
  const tuile = src.slice(d, src.indexOf(NL + '}', d));
  ['className="o-camheure"', 'className="o-campied"', 'className="o-camnom"', 'className="o-camsous"', 'className="o-livebadge"'].forEach(c => assert.ok(tuile.includes(c), c + ' sur la tuile'));
  assert.ok(tuile.includes("whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.label}"), 'un nom long se coupe au lieu de deborder');
});
