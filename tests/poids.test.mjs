// ─────────────────────────────────────────────────────────────────────────────
// Ce qu'on télécharge avant de pouvoir lire l'écran.
//
// Le fond météo 3D est chargé « à la demande » : `lazy(() => import('./wx3d'))`.
// Mais il était monté dès le premier rendu du tableau de bord, ce qui
// déclenchait aussitôt son import — 448 ko de Three.js, 113 ko compressés, en
// concurrence avec le contenu qu'on est venu lire. La paresse ne servait à
// rien : elle décalait le téléchargement de quelques millisecondes, pas d'une
// peinture.
//
// Mesuré dans la démo, après correction : première peinture à 23 548 ms (la
// page était masquée jusque-là), `wx3d` demandé à 24 156, `three` à 24 169 —
// six cents millisecondes APRÈS le contenu, et le décor s'affiche quand même.
//
// L'autre défaut de cette famille échappe à `no-unused-vars` : un fichier
// ENTIER que personne n'importe. La règle raisonne à l'intérieur d'un module,
// jamais entre eux. `src/ciel3d.jsx` — un ciel étoilé de 284 lignes, avec sa
// propre copie de Three.js — était là depuis le premier commit sans qu'aucune
// ligne ne l'appelle. Il ne pesait rien dans le bundle, puisque le bundler ne
// l'atteignait pas non plus ; il pesait sur qui lit le dossier.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(RACINE, 'src');
const ANTISLASH = String.fromCharCode(92);

/** Tous les modules du dossier `src`. */
function modules(dossier = SRC) {
  const out = [];
  for (const f of readdirSync(dossier)) {
    const p = join(dossier, f);
    if (statSync(p).isDirectory()) { out.push(...modules(p)); continue; }
    if (/\.(js|jsx)$/.test(f)) out.push(p);
  }
  return out;
}

/** Résout une cible relative vers un fichier existant, ou null. */
function resoudre(base, cible) {
  const brut = resolve(base, cible);
  for (const suff of ['', '.js', '.jsx', '/index.js', '/index.jsx']) {
    try { if (statSync(brut + suff).isFile()) return brut + suff; } catch (e) { /* essai suivant */ }
  }
  return null;
}

/* Deux motifs, jamais un seul.
 *
 * Une première version les mêlait : `import` puis un « ... from » facultatif.
 * Sur `import('./wx3d.jsx')` il n'y a pas de `from`, alors le moteur étendait
 * la partie facultative jusqu'au `from` suivant — trois cents lignes plus bas —
 * et capturait la chaîne de CET import-là. Les imports à la demande
 * disparaissaient tous, et les fichiers qu'ils seuls atteignent passaient pour
 * orphelins. Le `[^;]*?` du motif statique borne la recherche à l'instruction. */
const STATIQUE = /import\s[^;]*?\sfrom\s*['"](\.[^'"]+)['"]/g;
const NU = /import\s*['"](\.[^'"]+)['"]/g;
const DYNAMIQUE = /import\s*\(\s*['"](\.[^'"]+)['"]/g;

/** Les cibles importées par un fichier. `dynamiques` inclut `import('./x')`. */
function importsDe(chemin, dynamiques) {
  const src = readFileSync(chemin, 'utf8');
  const base = dirname(chemin);
  const motifs = dynamiques ? [STATIQUE, NU, DYNAMIQUE] : [STATIQUE, NU];
  const cibles = motifs.flatMap(m => [...src.matchAll(m)].map(x => x[1]));
  return [...new Set(cibles)].map(c => resoudre(base, c)).filter(Boolean);
}

/** Tout ce qu'on atteint depuis `depart`. */
function atteignables(dynamiques, depart = join(SRC, 'main.jsx')) {
  const vus = new Set();
  const file = [depart];
  while (file.length) {
    const p = file.pop();
    if (vus.has(p)) continue;
    vus.add(p);
    file.push(...importsDe(p, dynamiques));
  }
  return vus;
}

const court = (p) => relative(RACINE, p).split(ANTISLASH).join('/');

test('aucun module de src n’est injoignable depuis l’entrée', () => {
  // `no-unused-vars` raisonne DANS un module ; il ne voit jamais qu'un fichier
  // entier n'est appelé par personne. C'est le seul filet contre cette famille.
  const vus = atteignables(true);
  const orphelins = modules().filter(p => !vus.has(p)).map(court).sort();
  assert.deepEqual(orphelins, [],
    'ces fichiers ne sont atteints par aucun import : soit on les branche, soit on les retire');
});

test('Three.js n’est jamais atteint sans passer par un import à la demande', () => {
  /* On part de `boot.jsx`, pas de `main.jsx`.
   *
   * `main.jsx` n'importe RIEN statiquement, et c'est voulu : la démo doit
   * s'installer avant que l'application ne s'évalue, donc tout y passe par
   * `await import(...)`. Une première version de ce test partait de là — le
   * graphe direct était vide, et il passait sans rien vérifier. Il a fallu le
   * casser exprès, en rendant `wx3d` statique, pour s'apercevoir qu'il restait
   * muet.
   *
   * `boot.jsx` est le morceau qui part en premier chez l'utilisateur : 702 ko.
   * C'est lui qui ne doit pas tirer Three.js avec lui. */
  const eager = atteignables(false, join(SRC, 'boot.jsx'));
  const lourds = [...eager].filter(p => /from ['"]three['"]/.test(readFileSync(p, 'utf8'))).map(court);
  assert.deepEqual(lourds, [],
    'Three.js entre dans le premier chargement : 448 ko qui retardent l’écran qu’on vient lire');
});

test('le fond météo attend la première peinture', () => {
  const app = readFileSync(join(SRC, 'App.jsx'), 'utf8');
  const i = app.indexOf('<WeatherGL');
  assert.notEqual(i, -1, 'le fond météo a disparu');
  // La garde de montage, juste au-dessus de la balise.
  const garde = app.slice(app.lastIndexOf('{!REDUCE_MOTION', i), i);
  assert.match(garde, /fondPret/,
    'le fond météo se monte de nouveau au premier rendu : son import repart avant la peinture');
  assert.match(app, /onPaintReady\(\(\) => \{ if \(vivant\) setFondPret\(true\); \}\);/,
    'plus rien ne relâche le fond après la peinture : il ne s’afficherait jamais');
});

// ─────────────────────────────────────────────────────────────────────────────
// Rien d'étranger dans `src/`.
//
// `src/App.jsx.avant-atrium` — 552 ko, une copie de travail du 19 août — y a
// dormi des semaines. Rien ne la voyait : le linter ne lit que `.js` et `.jsx`,
// le test des modules injoignables aussi, et le bundler ne l'atteignait pas.
// Son extension la faisait passer entre toutes les mailles. Elle ne se
// signalait qu'en polluant les recherches — une requête sur le code tombait
// dessus, et sur du code qui n'existe plus.
//
// Elle n'a pas été supprimée : le dépôt commence le 24 août, elle date du 19,
// et elle diffère du premier commit par 6845 lignes. C'était le seul exemplaire
// d'un état qui n'est dans aucun commit. Elle vit maintenant hors de `src/`.
// ─────────────────────────────────────────────────────────────────────────────

const EXTENSIONS = new Set(['js', 'jsx', 'css', 'svg', 'webp']);

test('src ne contient que du code et ses ressources', () => {
  const etrangers = [];
  const parcourir = (dossier) => {
    for (const f of readdirSync(dossier)) {
      const p = join(dossier, f);
      if (statSync(p).isDirectory()) { parcourir(p); continue; }
      const ext = f.split('.').pop();
      if (!EXTENSIONS.has(ext)) etrangers.push(court(p));
    }
  };
  parcourir(SRC);
  assert.deepEqual(etrangers.sort(), [],
    'un fichier étranger dort dans src : aucun outil ne le lit, et il ne se signalera qu’en polluant les recherches');
});
