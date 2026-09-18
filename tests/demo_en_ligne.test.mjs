// ─────────────────────────────────────────────────────────────────────────────
// La démo en ligne (GitHub Pages).
//
// Une construction à part (`npm run build:demo`, mode Vite « demo ») qui
// démarre TOUJOURS dans la maison de démonstration : pas de `?demo` à ajouter,
// pas de Home Assistant derrière, aucune adresse à saisir. Ces tests tiennent
// la frontière dans les deux sens : la démo se construit et se publie à part,
// et le paquet que HACS livre ne peut pas s'y retrouver.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const main = lire('src', 'main.jsx');

test('la construction « demo » démarre toujours dans la démo, la normale jamais sans ?demo', () => {
  assert.ok(main.includes("const DEMO_SEULE = import.meta.env.MODE === 'demo';"));
  assert.ok(main.includes('if (DEMO_SEULE) return true;'));
  // Hors mode « demo », rien ne change : `?demo` ET la page directe.
  assert.ok(main.includes("return new URLSearchParams(window.location.search).has('demo') && window === window.top;"));
});

test('la démo se construit à part : dist-demo, jamais dist', () => {
  const pkg = JSON.parse(lire('package.json'));
  assert.equal(pkg.scripts['build:demo'], 'vite build --mode demo --outDir dist-demo --emptyOutDir');
  assert.equal(pkg.scripts.build, 'vite build', 'la construction livrée ne change pas de mode');
  assert.ok(lire('.gitignore').includes('dist-demo/'), 'la démo construite ne se versionne pas');
  assert.ok(!lire('scripts', 'pack_frontend.py').includes('dist-demo'), 'le paquet HACS ne lit jamais la démo');
});

test('GitHub Pages publie la démo depuis main', () => {
  const w = lire('.github', 'workflows', 'demo.yml');
  for (const m of ['branches: [main]', 'npm run build:demo', 'path: dist-demo', 'actions/upload-pages-artifact@', 'actions/deploy-pages@', 'pages: write', 'id-token: write']) {
    assert.ok(w.includes(m), m);
  }
});

test('la démo ne nomme pas un serveur qu’elle n’a pas', () => {
  const app = lire('src', 'App.jsx');
  assert.ok(main.includes('window.__loggiaDemo = true;'));
  assert.ok(app.includes("if (typeof window !== 'undefined' && window.__loggiaDemo) return tr('maison de démonstration');"));
  assert.ok(lire('src', 'langues', 'en.js').includes("'maison de démonstration': 'demo home',"));
});

test('le README mène à la démo en ligne une seule fois, sans captures par appareil', () => {
  const r = lire('README.md');
  // Un seul lien, dans « Essayer sans rien installer » : ni doublon sous le
  // bandeau, ni liste d'entrées directes (retirés le 18/09 à la demande).
  assert.ok(r.includes('**[La démo en ligne](https://alardware.github.io/loggia/)**'));
  assert.equal(r.split('alardware.github.io/loggia').length - 1, 1, 'le lien de la démo, une seule fois');
  assert.ok(!r.includes('docs/captures/'), 'les captures ordinateur / tablette / téléphone sont retirées');
  assert.ok(!existsSync(join(RACINE, 'docs', 'captures')));
  assert.ok(r.includes('## Essayer sans rien installer'));
});
