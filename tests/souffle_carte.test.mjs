// Objets au repos (29/10) : le souffle d'une carte muette ne fait plus
// recalculer ses enfants à chaque image.
//
// Mesuré dans la démo (1440 × 900, rien touché) : Objets passait 300 à 360 ms
// par seconde à recalculer des styles, pour deux cartes muettes à l'écran. Le
// souffle (`o-souffle`, une `box-shadow` que le compositeur ne prend pas)
// anime la carte à chaque image ; Chrome recalcule alors aussi tout enfant qui
// HÉRITE EXPLICITEMENT d'elle une propriété qui ne s'hérite pas — ici le
// bouton de surface, `borderRadius: 'inherit'`. Le même arrondi donné par sa
// valeur (`--o-radius`) : 180 ms par seconde, et pas un pixel de changé
// (animations figées à 0 ; 0,4 ; 1 ; 1,43 et 2,2 s, 1440 et 390 px, sombre et
// clair, survol, liserés coupés, lampe muette au téléphone).
//
// Un souffle déplacé sur `::after` coûtait moins encore, mais se peignait
// au-dessus du fond de la carte : les pixels lissés des coins changeaient
// (jusqu'à 11/255). Écarté.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const css = lire('src', 'index.css');
const RAYON = 'var(--o-radius,18px)';

/** Les .jsx de `src`, sous-dossiers compris. */
const fichiers = (dir = 'src') => readdirSync(join(RACINE, dir), { withFileTypes: true })
  .flatMap(e => e.isDirectory() ? fichiers(join(dir, e.name)) : /\.jsx$/.test(e.name) ? [join(dir, e.name)] : []);

test('dans une carte muette, la surface prend l’arrondi par sa valeur, sans inherit', () => {
  assert.ok(css.includes('\n.o-rmcard.o-panne > .o-surface { border-radius: var(--o-radius, 18px) !important; }'),
    'la surface d’une carte muette hérite de nouveau son arrondi : chaque image du souffle recalcule aussi les enfants de la carte');
  // `!important` : la surface pose `borderRadius: 'inherit'` en style en ligne.
  assert.ok(/borderRadius: 'inherit'/.test(lire('src', 'ui.jsx').slice(lire('src', 'ui.jsx').indexOf('export function Surface('))),
    'Surface n’hérite plus son arrondi : la règle de index.css est-elle encore utile ?');
});

test('l’arrondi d’une carte de la grille est toujours --o-radius : la valeur donnée à la surface est la sienne', () => {
  // Sinon, la surface d'une carte muette prendrait un autre arrondi que sa
  // carte, et son anneau de focus le montrerait.
  assert.ok(lire('src', 'styles.js').includes("borderRadius: '" + RAYON + "'"), 'CARTE_MAISON n’arrondit plus par --o-radius');
  assert.ok(/\bconst RM_CARD = \{ \.\.\.CARTE_MAISON, transition: 'all \.3s' \};/.test(lire('src', 'cartes', 'briques.jsx')), 'RM_CARD ne part plus de CARTE_MAISON');
  let vues = 0;
  for (const f of fichiers()) {
    for (const m of lire(f).matchAll(/className=\{'[^']*o-rmcard[^']*'[^}]*o-panne[^}]*\}[\s\S]{0,40}?style=\{\{([\s\S]*?)\}\}>/g)) {
      vues++;
      for (const r of m[1].matchAll(/\bborderRadius:\s*([^,\n]+)/g)) assert.equal(r[1].trim(), "'" + RAYON + "'", f + ' : une carte muette arrondie autrement (' + r[1] + ')');
    }
  }
  assert.ok(vues >= 10, 'les cartes qui soufflent ne se trouvent plus (' + vues + ')');
  // Dans la feuille : seule `.o-light-card`, au téléphone, redonne un arrondi à une carte — le même.
  for (const m of css.matchAll(/([^{}]*\.(?:o-rmcard|o-gabarit|o-light-card)[^{},]*)\{([^}]*)\}/g)) {
    const r = m[2].match(/border-radius:\s*([^;!]+)/);
    if (!r || /::/.test(m[1])) continue;
    assert.equal(r[1].trim().replace(/\s+/g, ''), RAYON, m[1].trim() + ' arrondit une carte autrement que --o-radius');
  }
});

test('aucun enfant de carte n’hérite explicitement d’une propriété qui ne s’hérite pas', () => {
  // `color`, `font`, `fontFamily` s'héritent d'eux-mêmes : leur `inherit` ne
  // coûte rien. Un `inherit` sur une autre propriété ferait recalculer
  // l'enfant à chaque image du souffle de sa carte.
  const HERITEES = new Set(['color', 'font', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'textAlign', 'cursor', 'visibility', 'whiteSpace']);
  const sites = [];
  for (const f of [...fichiers('src/cartes'), join('src', 'cartevanne.jsx'), join('src', 'ui.jsx')]) {
    for (const m of lire(f).matchAll(/\b([a-zA-Z]+):\s*'inherit'/g)) if (!HERITEES.has(m[1])) sites.push(f + ' : ' + m[1]);
  }
  assert.deepEqual(sites, [join('src', 'ui.jsx') + ' : borderRadius'], 'un nouvel héritage explicite dans une carte : la règle `.o-rmcard.o-panne > …` doit le couvrir');
});
