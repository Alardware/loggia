// ─────────────────────────────────────────────────────────────────────────────
// Les feuilles de `public/` portent la version de leur contenu (16/11).
//
// Constat, mesuré le 16/11 sur une installation réelle, dans Chrome : la feuille
// des polices chargée par la page était celle du 9 octobre (12 blocs), alors
// que Home Assistant servait celle du jour (17 blocs). La page la citait par
// une adresse qui ne change jamais (`./fonts/fonts.css`), et Home Assistant
// sert le paquet sans durée de cache : le navigateur garde alors le fichier un
// dixième de son âge — 3,6 jours ce jour-là. Outfit, la police de Prisme,
// n'était pas chargée deux jours après l'installation du thème ; Roboto et
// Mona Sans, installées le soir même, ne l'étaient pas non plus. Un
// rechargement forcé de la page (Ctrl + F5) n'y changeait rien.
//
// Le correctif : à la construction, chaque feuille de `public/` que la page
// cite reçoit `?v=<empreinte de son contenu>` (scripts/version_feuilles.mjs).
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { empreinte, greffonVersionDesFeuilles, versionnerFeuilles } from '../scripts/version_feuilles.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const PAQUET = join(RACINE, 'custom_components', 'loggia', 'frontend');
const DIST = join(RACINE, 'dist');
const sha8 = (octets) => createHash('sha256').update(octets).digest('hex').slice(0, 8);

/** Les feuilles qu'une page cite, hors commentaires : l'adresse entière, telle qu'écrite. */
const feuilles = (html) => [...html.matchAll(/<!--[\s\S]*?-->|<link\b([^>]*)>/g)]
  .filter(([t, a]) => !t.startsWith('<!--') && /\brel="stylesheet"/.test(a))
  .map(([, a]) => (a.match(/\bhref="([^"]*)"/) || [])[1]);
const publiques = (html) => feuilles(html).filter((h) => !h.startsWith('./assets/'));

test('la page source cite ses feuilles de public/ sans version : c’est la construction qui la pose', () => {
  const cites = publiques(lire('index.html'));
  assert.deepEqual(cites, ['./fonts/fonts.css', './fonts/uicons-regular-rounded.css'],
    'les feuilles de public/ citées par index.html ont changé : vérifier que chacune reçoit sa version');
  for (const h of cites) assert.ok(existsSync(join(RACINE, 'public', h.slice(2))), h + ' : absent de public/');
});

test('la version est l’empreinte du contenu : feuille inchangée, même adresse ; feuille modifiée, adresse nouvelle', () => {
  const page = [
    '<head>',
    '  <!-- <link rel="stylesheet" href="./fonts/commentee.css" /> -->',
    '  <link rel="stylesheet" href="./fonts/fonts.css" />',
    '  <link rel="stylesheet" crossorigin href="./assets/index-AAAAAAAA.css">',
    '  <link rel="preload" href="./fonts/police.woff2" as="font" type="font/woff2" crossorigin />',
    '  <link rel="modulepreload" crossorigin href="./assets/boot-BBBBBBBB.js">',
    '</head>',
  ].join('\n');
  const avec = (contenu) => versionnerFeuilles(page, (chemin) => (chemin === 'fonts/fonts.css' ? Buffer.from(contenu) : null));
  const un = avec('@font-face { font-family: A; }');
  assert.equal(empreinte(Buffer.from('@font-face { font-family: A; }')), sha8(Buffer.from('@font-face { font-family: A; }')));
  assert.ok(un.includes('<link rel="stylesheet" href="./fonts/fonts.css?v=' + sha8(Buffer.from('@font-face { font-family: A; }')) + '" />'),
    'la feuille de public/ ne reçoit pas l’empreinte de son contenu');
  assert.match(un, /\?v=[0-9a-f]{8}"/);
  assert.equal(avec('@font-face { font-family: A; }'), un, 'même contenu : la même adresse, sinon le cache ne sert plus jamais');
  assert.notEqual(avec('@font-face { font-family: A; } @font-face { font-family: B; }'), un,
    'contenu modifié : l’adresse doit changer, sinon un navigateur garde l’ancienne feuille');
  /* Tout le reste de la page sort tel quel : le commentaire, la feuille hachée par Vite, les préchargements. */
  const sansLaFeuille = (html) => html.replace(/href="\.\/fonts\/fonts\.css[^"]*"/, '');
  assert.equal(sansLaFeuille(un), sansLaFeuille(page));
  assert.ok(un.includes('<!-- <link rel="stylesheet" href="./fonts/commentee.css" /> -->'), 'une balise en commentaire ne se lit pas');
  /* Une feuille citée mais absente, ou plus aucune feuille : la construction s'arrête, elle ne repart pas sans version. */
  assert.throws(() => versionnerFeuilles(page, () => null), /absent de public/);
  assert.throws(() => versionnerFeuilles('<head><link rel="stylesheet" href="./assets/index-AAAAAAAA.css"></head>', () => Buffer.from('x')), /aucune feuille de public/);
});

test('les deux constructions versionnent les feuilles, une fois la page passée par Vite', async () => {
  const { default: fabrique } = await import(pathToFileURL(join(RACINE, 'vite.config.js')).href);
  for (const mode of ['production', 'demo']) {
    const config = typeof fabrique === 'function' ? fabrique({ mode, command: 'build' }) : fabrique;
    assert.equal(config.plugins.flat().filter((p) => p && p.name === 'loggia-version-des-feuilles').length, 1,
      'le greffon des versions manque, ou est en double, à la construction « ' + mode + ' »');
  }
  const greffon = greffonVersionDesFeuilles();
  assert.equal(greffon.apply, 'build', 'le serveur de développement sert public/ lui-même, sans cache à déjouer');
  assert.equal(greffon.transformIndexHtml.order, 'post', 'après Vite : il ne doit jamais voir une adresse de public/ avec sa version');
  greffon.configResolved({ root: RACINE });
  const page = greffon.transformIndexHtml.handler(lire('index.html'));
  assert.deepEqual(publiques(page), ['fonts/fonts.css', 'fonts/uicons-regular-rounded.css']
    .map((f) => './' + f + '?v=' + sha8(readFileSync(join(RACINE, 'public', f)))));
});

/* `dist/` ne compte que s'il est plus récent que les sources — la même règle que tests/lot14_chargement.test.mjs. */
const recent = (rep) => readdirSync(rep, { withFileTypes: true }).reduce((t, e) => Math.max(t,
  e.isDirectory() ? recent(join(rep, e.name)) : /\.(jsx?|css)$/.test(e.name) ? statSync(join(rep, e.name)).mtimeMs : 0), 0);
const distAJour = () => existsSync(join(DIST, 'index.html'))
  && statSync(join(DIST, 'index.html')).mtimeMs >= recent(join(RACINE, 'src'));

test('la page LIVRÉE cite chaque feuille de public/ à la version du fichier livré avec elle', () => {
  /* Rouge tant que le paquet n'est pas reconstruit (`npm run build` puis `python scripts/pack_frontend.py`). C'est ici que
   * se voit ce que le pack garde de la page construite : une version perdue en route, ou qui n'est plus celle du fichier
   * posé à côté, et un navigateur garderait de nouveau une vieille feuille. */
  const dossiers = [PAQUET, distAJour() ? DIST : null].filter((d) => d && existsSync(join(d, 'index.html')));
  assert.ok(dossiers.length, 'aucune page construite : ni le paquet ni dist');
  for (const d of dossiers) {
    const cites = publiques(readFileSync(join(d, 'index.html'), 'utf8'));
    assert.equal(cites.length, 2, d + ' : deux feuilles de public/ attendues, trouvé ' + cites.join(', '));
    for (const h of cites) {
      const m = h.match(/^\.\/([^?#]+\.css)\?v=([0-9a-f]{8})$/);
      assert.ok(m, d + ' : ' + h + ' est citée sans version — reconstruire puis repacker');
      assert.ok(existsSync(join(d, m[1])), d + ' : ' + m[1] + ' cité mais absent');
      assert.equal(m[2], sha8(readFileSync(join(d, m[1]))), d + ' : la version de ' + m[1] + ' n’est pas celle du fichier livré');
    }
  }
});
