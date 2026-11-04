// ─────────────────────────────────────────────────────────────────────────────
// Les dessins rares hors du boot (04/11) : `dessins.js` garde ceux que le code
// cite, `dessinsrares.js` reçoit les autres, chargé à part par `icones.jsx`.
// Un dessin CITÉ dans le code (une carte, une vue, une table d'icônes) ne doit
// jamais partir chez les rares : il attendrait, vide, au premier affichage.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const { DESSINS, NOMS_DESSINS } = await import('../src/dessins.js');
const { DESSINS_RARES } = await import('../src/dessinsrares.js');

const fichiers = [];
(function marcher(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) { if (f !== 'langues') marcher(p); } else if (/\.(jsx?|mjs)$/.test(f) && f !== 'dessins.js' && f !== 'dessinsrares.js') fichiers.push(p);
  }
})(join(RACINE, 'src'));
const SOURCE = fichiers.map(f => readFileSync(f, 'utf8')).join('\n');
const cite = (n) => ["'", '"', '`'].some(q => SOURCE.includes(q + n + q));

test('aucun dessin cité dans le code n’est parti chez les rares', () => {
  const partis = Object.keys(DESSINS_RARES).filter(cite);
  assert.deepEqual(partis, [], 'ces dessins sont cités dans le code : ramène-les dans dessins.js');
});

test('les deux fichiers font le catalogue entier, sans doublon ni oubli', () => {
  const ici = Object.keys(DESSINS), la = Object.keys(DESSINS_RARES);
  assert.deepEqual(ici.filter(n => la.includes(n)), [], 'un dessin dans les deux fichiers');
  assert.deepEqual([...ici, ...la].sort(), Object.keys(NOMS_DESSINS).sort(), 'un dessin sans nom, ou un nom sans dessin');
  assert.ok(la.length > 100 && ici.length > 40, 'le partage a changé du tout au tout');
});

test('Ico charge les rares dès son évaluation, et garde la place d’une icône qui attend', () => {
  const I = readFileSync(join(RACINE, 'src', 'icones.jsx'), 'utf8');
  assert.ok(I.includes("chargement = import('./dessinsrares.js')"));
  assert.ok(/\nchargerRares\(\);\n/.test(I), 'le chargement ne part pas à l’évaluation');
  assert.ok(I.includes('if (attendu) return <svg aria-hidden="true" width={size} height={size}'), 'une icône qui attend ne garde pas sa place');
  assert.ok(!/from '\.\/dessinsrares\.js'/.test(SOURCE), 'un import statique ramènerait les rares dans le boot');
});
