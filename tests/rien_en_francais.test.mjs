/* Rien ne reste en français (23/09, retour d'un utilisateur polonais).
 *
 * Loggia parle sept langues, mais la traduction ne voit que ce qui passe par
 * `tr()`. Deux fuites, toutes deux invisibles jusqu'à ce que quelqu'un lise
 * l'interface dans sa langue :
 *
 *   1. un `tr('…')` dont la clé n'est PAS dans le catalogue anglais — la
 *      phrase sort alors en français partout. Sept cas, dont trois textes
 *      raccourcis dont l'ancienne version traînait encore au catalogue ;
 *   2. un texte écrit en clair dans le JSX, que `tr()` ne touche jamais —
 *      « Bonsoir, Seba » au-dessus d'une page polonaise.
 *
 * Les deux se cherchent ici, et les deux sont exacts. Le premier compare des
 * littéraux au catalogue anglais, `trN` compris — ses DEUX gabarits sont deux
 * clés. Le second refuse tout nœud de texte JSX écrit en clair, sur une ligne
 * ou sur cinq, sauf ceux d'une courte liste de symboles et d'unités : une
 * heuristique « ça ressemble à du français » laissait passer « Annuler ».
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(RACINE, 'src');

const fichiers = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) { if (f !== 'langues') walk(p); }
    else if (/\.jsx?$/.test(f)) fichiers.push(p);
  }
})(SRC);
const nom = (f) => relative(SRC, f).replace(/\\/g, '/');

const EN = (await import(new URL('../src/langues/en.js', import.meta.url))).default;

/* Les textes que Home Assistant traduit lui-même : `tr` les résout par son
 * vocabulaire (`CLES_HA` dans i18n.js), et ils n'ont donc rien à faire dans le
 * catalogue de Loggia. « Rechercher », « Nom », « Fermer » sont de ceux-là. */
const I18N = readFileSync(join(SRC, 'i18n.js'), 'utf8');
const BLOC_HA = I18N.slice(I18N.indexOf('const CLES_HA = {'), I18N.indexOf('export function langueDeHA'));
const CLES_HA = new Set([...BLOC_HA.matchAll(/^\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")\s*:/gm)]
  .map(m => (m[1] ?? m[2]).replace(/\\'/g, "'")));

test('chaque tr(«…») a sa clé, au catalogue ou chez Home Assistant', () => {
  /* La clé EST le texte français : une clé absente ne casse rien, la phrase
   * sort simplement en français — dans les sept langues. C'est pour cela que
   * personne ne le voyait.
   *
   * `trN` compte double : ses deux gabarits sont deux clés, et celle du
   * singulier manquait souvent à l'appel — un cas rare ne se voit pas. */
  assert.ok(CLES_HA.size > 50, 'la table du vocabulaire de Home Assistant est illisible');
  const LIT = String.raw`(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")`;
  const UN = new RegExp(String.raw`\btr\(\s*` + LIT, 'g');
  const DEUX = new RegExp(String.raw`\btrN\(\s*[^,()]+,\s*` + LIT + String.raw`\s*,\s*` + LIT, 'g');
  const propre = (b) => b.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  const manquantes = [];
  const voir = (f, brut) => {
    if (brut == null) return;
    const cle = propre(brut);
    if (!(cle in EN) && !CLES_HA.has(cle)) manquantes.push(`${nom(f)} : ${JSON.stringify(cle)}`);
  };
  for (const f of fichiers) {
    const s = readFileSync(f, 'utf8');
    for (const m of s.matchAll(UN)) voir(f, m[1] ?? m[2]);
    for (const m of s.matchAll(DEUX)) { voir(f, m[1] ?? m[2]); voir(f, m[3] ?? m[4]); }
  }
  assert.deepEqual(manquantes, [], 'des textes sortiraient en français dans toutes les langues');
});

/* Les textes que l'on écrit en clair SANS les traduire : un symbole, une unité,
 * un nom propre. La liste est courte exprès — tout le reste doit passer par
 * `tr()`. Ajouter une ligne ici, c'est affirmer que ce mot se lit pareil en
 * polonais comme en français. */
const NEUTRES = new Set([
  'Loggia', 'O', 'OK', 'LIVE', 'AUTO', '×', '+', '—', '·',
  '°C', '%', 'W', 'kWh', 'ppm', 'ppm CO₂', 'CO₂', 'm', 'm²', '24 h',
  'React + Vite', 'Manrope / Newsreader', 'Home Assistant', 'HACS',
]);

test('aucun texte écrit en clair dans le JSX', () => {
  /* Le premier filet ne voyait qu'un nœud de texte tenant sur UNE ligne, avec
   * un accent ou un mot-outil français. Il laissait donc passer « Annuler »,
   * « Continuer », « Bienvenue » — et la phrase de bienvenue de l'écran de
   * premier lancement, écrite sur trois lignes.
   *
   * La règle est maintenant l'inverse : TOUT nœud de texte contenant une
   * lettre est une fuite, sauf s'il figure dans `NEUTRES`. Les commentaires
   * sont blanchis d'abord, et les fragments de code coupés par un `>` de
   * comparaison sont écartés par `CODE`. */
  const blanc = (m) => m.replace(/[^\n]/g, ' ');
  /* Un `>` de comparaison ouvre un faux nœud : « if (y > last + 8) setHidden( »
   * se lit comme du texte entre ce `>` et le `<` suivant. Ce qui sépare ces
   * fragments d'une phrase, c'est la ponctuation du code — une parenthèse, un
   * point-virgule, un accès à une propriété, un mot-clé de JavaScript. */
  const CODE = /[=!<>]=|=>|\|\||&&|\?\?/;
  const JS = new RegExp([
    String.raw`[;()[\]{}=+*/%&|\\\`$@#]`,   // ponctuation qui n'existe pas dans un libellé
    String.raw`\.\w`,                        // un accès à une propriété
    String.raw`^[,:;?]|[,:?]$`,              // un fragment coupé au milieu d'une expression
    String.raw`\w:\s*\S`,                    // une clé d'objet littéral
    String.raw`\b(return|const|let|var|function|null|true|false|undefined|new|typeof|else|push|indexOf|length|map|filter|slice|concat|Math|String|Number|Boolean|Object|Array)\b`,
  ].join('|'));
  const fuites = [];
  for (const f of fichiers) {
    const s = readFileSync(f, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, blanc)
      .replace(/(^|[^:'"\\])\/\/[^\n]*/g, (m, a) => a + blanc(m.slice(a.length)));
    for (const m of s.matchAll(/>([^<>{}]*[A-Za-zÀ-ÿ][^<>{}]*)</g)) {
      if (CODE.test(m[0])) continue;
      const t = m[1].replace(/\s+/g, ' ').trim();
      if (!t || NEUTRES.has(t) || JS.test(t)) continue;
      const ligne = s.slice(0, m.index).split('\n').length;
      fuites.push(`${nom(f)}:${ligne}  ${JSON.stringify(t.slice(0, 80))}`);
    }
  }
  assert.deepEqual(fuites, [], 'ces textes ne passent pas par tr() : ils resteront en français');
});
