// ─────────────────────────────────────────────────────────────────────────────
// Ce qui part avant l'écran (lot 14 de l'audit du 03/10).
//
// Trois constats de l'axe « Performance » :
//
// 1. Les polices de l'écran n'étaient demandées qu'au premier glyphe qui les
//    emploie, donc après le premier rendu de React. À froid en Slow 4G, celle
//    des icônes (225 Ko, `font-display: block` : rien plutôt qu'un carré vide)
//    ne partait qu'à 11,8 s (paquet servi comme par Home Assistant).
// 2. Hors français, le catalogue de langue PUIS le boot : l'amorce attend le
//    catalogue pour ÉVALUER le boot (des modules appellent tr() à l'import),
//    rien ne l'obligeait à le TÉLÉCHARGER après.
// 3. Le boot grossissait sans garde-fou : 913,89 Ko le 27/09, 999 220 octets
//    le 03/10, 1 050 154 avec les lots 1 à 13 de l'audit.
//
// Mesuré dans la démo à froid (médianes de 4 à 5 passages) : l'écran complet
// — Accueil, texte et icônes — passe, en Slow 4G et en anglais, de 15,7 s à
// 11,5 s sur le paquet servi sans compression comme par Home Assistant, de
// 9,4 s à 5,4 s compressé ; en français de 14,5 s à 10,9 s ; en Fast 4G de
// 3,3 s à 2,4 s ; sur un réseau local de 0,52 s à 0,42 s.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const PAQUET = join(RACINE, 'custom_components', 'loggia', 'frontend');
const DIST = join(RACINE, 'dist');

/** Les balises <link> d'une page, hors commentaires, attributs lus un à un. */
function liens(html) {
  return [...html.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<link\b([^>]*)>/g)].map(([, a]) => {
    const attrs = {};
    for (const m of a.matchAll(/([a-z-]+)(?:="([^"]*)")?/g)) attrs[m[1]] = m[2] ?? true;
    return attrs;
  });
}
/** Un `crossorigin` anonyme — celui d'une police chargée par une feuille. */
const anonyme = (v) => v === true || v === '' || v === 'anonymous';

/* Les deux fichiers que l'écran demande d'emblée, lus dans les feuilles
 * elles-mêmes : un fichier renommé ne laisse pas un préchargement mort. */
const FEUILLE_ICONES = lire('public', 'fonts', 'uicons-regular-rounded.css');
const ICONES = (FEUILLE_ICONES.match(/src:\s*url\("?\.\/([^")]+\.woff2)"?\)/) || [])[1];
const MANROPE_LATIN = [...new Set([...lire('public', 'fonts', 'fonts.css').matchAll(/@font-face\s*\{([^}]*)\}/g)]
  .map((m) => m[1])
  .filter((b) => /font-family:\s*'Manrope'/.test(b) && /unicode-range:\s*U\+0000-00FF/.test(b))
  .map((b) => (b.match(/url\(\.\/([^)]+\.woff2)\)/) || [])[1]))];

test('les deux polices de l’écran partent avec la page, à l’adresse de leur feuille', () => {
  assert.ok(ICONES, 'la feuille des icônes ne nomme plus sa police');
  /* Manrope tient TOUTES ses graisses dans un seul fichier latin : c'est ce
   * qui permet de n'en précharger qu'un. Si les graisses se séparent un jour,
   * précharger le seul fichier de la graisse du texte courant. */
  assert.equal(MANROPE_LATIN.length, 1, 'Manrope latin n’est plus un seul fichier : ' + MANROPE_LATIN.join(', '));
  const prech = liens(lire('index.html')).filter((l) => l.rel === 'preload' && l.as === 'font');
  /* `./fonts/<nom>` depuis la page, `./<nom>` depuis la feuille, qui vit dans
   * `fonts/` : la MÊME adresse, sinon le fichier part deux fois. */
  assert.deepEqual(prech.map((l) => l.href).sort(), ['./fonts/' + ICONES, './fonts/' + MANROPE_LATIN[0]].sort(),
    'la page doit précharger la police des icônes et Manrope latin, et rien d’autre : un préchargement '
    + 'qu’aucun glyphe de l’écran ne demande vole de la bande au boot');
  for (const l of prech) {
    assert.equal(l.type, 'font/woff2', l.href);
    assert.ok(anonyme(l.crossorigin), l.href + ' : sans `crossorigin` anonyme, une police préchargée est téléchargée une seconde fois');
    assert.ok(existsSync(join(RACINE, 'public', l.href.slice(2))), l.href + ' : fichier absent de public/');
  }
  // Et l'attente reste celle de l'ADR 0078 : `block`, jamais le carré vide d'un repli.
  assert.match(FEUILLE_ICONES, /font-display:\s*block/);
});

test('la construction précharge le boot et ce qu’il importe, jamais l’entrée ni un catalogue', async () => {
  const { default: fabrique } = await import(pathToFileURL(join(RACINE, 'vite.config.js')).href);
  for (const mode of ['production', 'demo']) {
    const config = typeof fabrique === 'function' ? fabrique({ mode, command: 'build' }) : fabrique;
    assert.ok(config.plugins.flat().some((p) => p && p.name === 'loggia-precharger-boot'),
      'le greffon de préchargement du boot manque à la construction « ' + mode + ' »');
  }
  const greffon = fabrique({ mode: 'production', command: 'build' }).plugins.flat().find((p) => p && p.name === 'loggia-precharger-boot');
  assert.equal(greffon.apply, 'build', 'le serveur de développement n’a pas de morceaux hachés');
  assert.equal(greffon.transformIndexHtml.order, 'post', 'le nom haché n’existe qu’une fois le paquet produit');
  greffon.configResolved({ base: './' });
  const morceau = (fileName, name, imports = [], isEntry = false) => ({ type: 'chunk', fileName, name, imports, isEntry });
  const bundle = {
    'assets/index-AAAAAAAA.js': morceau('assets/index-AAAAAAAA.js', 'index', [], true),
    'assets/boot-BBBBBBBB.js': morceau('assets/boot-BBBBBBBB.js', 'boot', ['assets/index-AAAAAAAA.js', 'assets/vendor-CCCCCCCC.js']),
    'assets/vendor-CCCCCCCC.js': morceau('assets/vendor-CCCCCCCC.js', 'vendor'),
    'assets/en-DDDDDDDD.js': morceau('assets/en-DDDDDDDD.js', 'en'),
    'assets/index-EEEEEEEE.css': { type: 'asset', fileName: 'assets/index-EEEEEEEE.css' },
  };
  const balises = greffon.transformIndexHtml.handler('<html></html>', { bundle });
  /* Le catalogue de langue n'y est pas : il dépend de la langue résolue au
   * démarrage, et un francophone n'en charge aucun. */
  assert.deepEqual(balises.map((b) => [b.tag, b.attrs.rel, b.attrs.href, anonyme(b.attrs.crossorigin), b.injectTo]), [
    ['link', 'modulepreload', './assets/boot-BBBBBBBB.js', true, 'head'],
    ['link', 'modulepreload', './assets/vendor-CCCCCCCC.js', true, 'head'],
  ]);
  assert.throws(() => greffon.transformIndexHtml.handler('', { bundle: { 'assets/index-AAAAAAAA.js': bundle['assets/index-AAAAAAAA.js'] } }),
    /boot/, 'un boot renommé ferait perdre le préchargement en silence');
});

test('l’amorce évalue toujours le catalogue AVANT le boot', () => {
  /* Le préchargement ne change que le TÉLÉCHARGEMENT. Des modules du boot
   * appellent tr() à l'import : évalué avant le catalogue, l'écran
   * démarrerait en français pour tous. */
  const main = lire('src', 'main.jsx');
  const cat = main.indexOf('(await CHARGEURS[probable]()).default');
  const boot = main.indexOf("await import('./boot.jsx');");
  assert.ok(cat > 0 && boot > cat, 'main.jsx n’attend plus le catalogue avant d’importer le boot');
});

/* `dist/` n'est pas versionné : il ne compte que s'il est plus récent que
 * toutes les sources — la règle de `verifier_fraicheur` (pack_frontend.py).
 * Périmé, il faisait rougir ces tests alors que le paquet était bon, avec un
 * message qui poussait à refaire le paquet (relecture du lot 14). */
const recent = (rep) => readdirSync(rep, { withFileTypes: true }).reduce((t, e) => Math.max(t,
  e.isDirectory() ? recent(join(rep, e.name)) : /\.(jsx?|css)$/.test(e.name) ? statSync(join(rep, e.name)).mtimeMs : 0), 0);
const distAJour = () => existsSync(join(DIST, 'index.html'))
  && statSync(join(DIST, 'index.html')).mtimeMs >= recent(join(RACINE, 'src'));
const pagesConstruites = () => [pageConstruite(PAQUET), distAJour() ? pageConstruite(DIST) : null].filter(Boolean);

/** L'entrée et le boot qu'une page construite demande, ou null sans page. */
function pageConstruite(dossier) {
  const page = join(dossier, 'index.html');
  if (!existsSync(page)) return null;
  const html = readFileSync(page, 'utf8');
  const entree = (html.match(/<script type="module"[^>]*\ssrc="\.\/assets\/([A-Za-z0-9._-]+\.js)"/) || [])[1];
  assert.ok(entree, page + ' ne nomme plus son entrée');
  const code = readFileSync(join(dossier, 'assets', entree), 'utf8');
  const boots = [...new Set([...code.matchAll(/\.\/(boot-[A-Za-z0-9_-]+\.js)/g)].map((m) => m[1]))];
  assert.equal(boots.length, 1, entree + ' devrait importer UN boot : ' + boots.join(', '));
  return { dossier, html, boot: boots[0], octets: statSync(join(dossier, 'assets', boots[0])).size };
}

test('la page LIVRÉE précharge son boot et ses polices, aux bonnes adresses', () => {
  /* Le paquet (et `dist`, s'il existe) : c'est là que se voit ce que le pack
   * garde de la page construite. Les adresses sont relatives — la page est
   * servie sous /loggia-static/ par Home Assistant, sous /loggia/ par GitHub
   * Pages. Rouge tant que le paquet n'est pas reconstruit (`npm run build`
   * puis `python scripts/pack_frontend.py`). */
  for (const p of pagesConstruites()) {
    const l = liens(p.html);
    const mp = l.filter((x) => x.rel === 'modulepreload');
    assert.ok(mp.some((x) => x.href === './assets/' + p.boot && anonyme(x.crossorigin)),
      p.dossier + ' : la page ne précharge pas ' + p.boot + ' — reconstruire puis repacker');
    for (const x of mp) assert.ok(existsSync(join(p.dossier, x.href.slice(2))), p.dossier + ' : ' + x.href + ' préchargé mais absent');
    const fontes = l.filter((x) => x.rel === 'preload' && x.as === 'font').map((x) => x.href).sort();
    assert.deepEqual(fontes, ['./fonts/' + ICONES, './fonts/' + MANROPE_LATIN[0]].sort(), p.dossier + ' : préchargements de polices perdus');
    for (const f of fontes) assert.ok(existsSync(join(p.dossier, f.slice(2))), p.dossier + ' : ' + f + ' absent');
  }
});

/* Le budget du boot, le morceau que CHAQUE écran télécharge et évalue avant
 * d'afficher quoi que ce soit (Home Assistant le sert sans compression).
 *
 * 1 100 000 octets : la construction du 03/10, lots 1 à 13 compris, pesait
 * 1 050 154 octets ; la marge est la croissance d'une journée d'audit
 * (999 220 → 1 050 154, +50 934). De quoi corriger, pas de quoi ajouter une
 * vue ni un catalogue de dessins (dessins.js : +58 866 octets d'un seul
 * commit, ADR 0113). */
const BUDGET_BOOT = 1_100_000;

test('le boot tient son budget', () => {
  const pages = pagesConstruites();
  assert.ok(pages.length, 'aucune page construite : ni le paquet ni dist');
  for (const p of pages) {
    assert.ok(p.octets <= BUDGET_BOOT,
      `${p.dossier} : ${p.boot} pèse ${p.octets} octets, au-delà du budget de ${BUDGET_BOOT}. `
      + 'Ne pas relever la borne pour passer : sortir du boot ce que l’Accueil n’affiche pas — les vues '
      + 'chargées à la demande (ADR 0104) derrière `lazyRecharge` (ADR 0145) : l’édition, l’Énergie, le '
      + 'Calendrier, les Scènes ; HUE_SCENES chargé à la demande, jamais retiré —, vérifier chaque étape dans le navigateur, puis abaisser la '
      + 'borne d’autant. La relever est une décision : elle se dit dans un ADR.');
  }
});
