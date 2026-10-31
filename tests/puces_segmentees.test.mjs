// ─────────────────────────────────────────────────────────────────────────────
// Un groupe de puces segmenté se creuse, et partout pareil (thème v2).
//
// Treize groupes portaient TROIS gris différents pour le même rôle : le puits
// dans la vue Énergie, `--o-s2` dans sept autres, `--o-s1` dans le composant
// commun `Segment` — lui-même pris quatre fois. Personne ne le voyait tant que
// le puits restait plus clair que les cartes ; le thème v2 le fait creuser
// (#1b2230 → #10141c), et l'écart a sauté aux yeux sur la vue Énergie.
//
// Un groupe segmenté est un RAIL dans lequel la pastille choisie glisse. Le
// creux le dit, et le bleu plein (`--o-accent-fond`, règle des puces choisies)
// y ressort. Ce test refuse qu'un nouveau groupe reparte sur un autre gris.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MONOLITHE } from './monolithe.mjs'; // App.jsx et ce qui en sort (ADR 0282)
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

/** Tous les .js / .jsx de src/, sous-dossiers compris. */
function sources(dir = SRC, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) sources(p, acc);
    else if (/\.(jsx?|mjs)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

/* Ce qui fait un groupe segmenté à l'œil : des enfants collés dans un cadre
 * arrondi, séparés d'un ou deux pixels — « padding: 3 » ou « padding: 4 » avec
 * « borderRadius: 12 ». Une carte, un champ ou un encart ne ressemblent pas à
 * ça : leur rembourrage se compte en dizaines de pixels (« padding: '10px
 * 12px' »), et ils sortent donc d'eux-mêmes du filet. */
const FORMES = [
  /padding: [34], (?:gap: \d+, )?borderRadius: 12, background: '([^']+)'/g,
  /(?:gap: \d+, )?padding: [34], borderRadius: 12, background: '([^']+)'/g,
];

test('tous les groupes de puces segmentées se creusent dans le même puits', () => {
  const fautifs = [];
  const vus = new Set();
  for (const f of sources()) {
    const src = readFileSync(f, 'utf8');
    const nom = f.split(/[\\/]/).pop();
    for (const re of FORMES) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(src)) !== null) {
        vus.add(nom + '@' + m.index);   // les deux formes peuvent voir le même
        if (m[1] !== 'var(--o-well)') fautifs.push(nom + ' : ' + m[1]);
      }
    }
  }
  // Sans ce compte, une réécriture du style ferait passer le test à vide.
  assert.ok(vus.size >= 8, 'les groupes segmentés ont changé de forme : ' + vus.size + ' trouvés, le test ne voit plus rien');
  assert.deepEqual([...new Set(fautifs)], [], 'un groupe de puces ne se creuse pas dans le puits');
});

test('le composant commun porte bien le puits, et la puce choisie le bleu plein', () => {
  const app = MONOLITHE;
  const i = app.indexOf('function Segment({ value, options, onChange');
  assert.ok(i > 0, 'Segment a disparu');
  const corps = app.slice(i, app.indexOf('\n}\n', i));
  assert.ok(corps.includes("borderRadius: 12, background: 'var(--o-well)'"), 'Segment ne se creuse plus');
  assert.ok(corps.includes('--o-accent-fond'), 'la puce choisie a perdu son bleu plein');
});
