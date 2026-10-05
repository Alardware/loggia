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
// L'analyseur d'ESLint (hissé par le lockfile) : le second filet lit l'ARBRE du source.
import { parse } from 'espree';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(RACINE, 'src');

const fichiers = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) { if (f !== 'langues') walk(p); }
    // `dessins.js` ne porte pas un mot d'interface : c'est du balisage SVG, des
    // `<rect>` et des `<path>` que le filet lit comme des noeuds de texte.
    else if (/\.jsx?$/.test(f) && f !== 'dessins.js') fichiers.push(p);
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

test('deux mots opposés viennent du MÊME domaine de Home Assistant', () => {
  /* Retour d'un utilisateur polonais sur la 3.73 (25/09), et c'est un vrai
   * défaut, pas une question de traduction :
   *
   *   'Ouvert': 'C:lock:state.open',
   *   'Fermé': 'C:group:state.closed',
   *
   * En français les deux se lisent pareil, donc personne ne le voyait. En
   * polonais, `lock:state.open` donne « Otwarte » — un adjectif — et
   * `group:state.closed` donne « zamknięto », une forme verbale (« on a
   * fermé »). Sur la MÊME carte, une porte disait donc « Otwarte » ouverte et
   * « zamknięto » fermée : deux registres.
   *
   * Corrigé en 3.74.0 : les deux viennent de `cover`. Ce test est là pour que
   * ça ne se reperde pas — le défaut est invisible en français, il ne se
   * rattrapera pas à l'œil.
   *
   * Chaque domaine traduit son vocabulaire dans SA table : deux mots qui se
   * répondent à l'écran doivent venir de la même, sinon rien ne garantit
   * qu'ils se répondent ailleurs qu'en français. */
  const domaine = (mot) => {
    const m = BLOC_HA.match(new RegExp(String.raw`^\s*'` + mot + String.raw`'\s*:\s*'C:([a-z_]+):`, 'm'));
    assert.ok(m, mot + ' a quitté le vocabulaire de Home Assistant');
    return m[1];
  };
  const PAIRES = [
    ['Ouvert', 'Fermé'],
    ['Allumé', 'Éteint'],
    ['MAISON', 'absent'],
    ['ACTIF', 'Inactif'],
  ];
  for (const [a, b] of PAIRES) {
    assert.equal(domaine(a), domaine(b),
      `« ${a} » et « ${b} » se répondent à l’écran : ils doivent venir du même domaine`);
  }
});

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

/* Le second filet : ce que la regex ne voit pas (audit du 03/10).
 *
 * Le test précédent lit le source comme du TEXTE — un nœud borné par `>` et
 * `<`, sans accolade. Quatre formes lui échappaient, et l'audit du 03/10 en a
 * relevé quarante-cinq dans App.jsx, Paramètres et le plan du robot :
 *
 *   1. le texte MÊLÉ d'expressions — « actuel {z.current}° », « Thème
 *      « {nom} » · mode {…} » : le nœud s'arrête à l'accolade ;
 *   2. les littéraux qu'un ternaire, un `||` ou un `+` RENDENT —
 *      `{on ? 'Pause' : tr('Lecture')}` : la moitié traduite cachait l'autre ;
 *   3. les attributs que l'on lit ou que l'on entend — `title`, `aria-label`,
 *      `placeholder`, `alt` ;
 *   4. les boîtes du navigateur — `alert()`, `confirm()`, `prompt()`.
 *
 * Ici le source est PARSÉ : ni faux nœud ouvert par un `>` de comparaison, ni
 * commentaire à blanchir. Un appel n'est jamais ouvert — ce qui passe par `tr`
 * ou `trN` est traduit, ce qui sort d'une autre fonction ne se juge pas ici —,
 * et une CONDITION ne se lit pas (`s === 'on'`, la gauche d'un `&&`) : seules
 * les branches d'un ternaire, les deux côtés d'un `||`, d'un `??` et d'un `+`,
 * les morceaux d'un gabarit `…${x}…` sont des textes rendus.
 *
 * Reste neutre ce que `NEUTRES` admet déjà, un texte dont chaque mot est une
 * unité (« 07h », « 12 ms », « 2 700 K », « 3,2 kW »), un identifiant
 * d'entité ou de service donné en exemple (`sensor.…`, `script.turn_on`), un
 * gabarit Jinja. Tout le reste passe par `tr()` — ou entre dans `EXCEPTIONS`
 * avec sa raison, et le test vérifie qu'elle sert encore.
 */
const UNITES = new Set(['g', 'h', 's', 'ms', 'K', 'W', 'kW', 'kWh', 'ppm', 'px', 'm', 'CO']);
const TECHNIQUE = /^(?:[a-z_]+\.(?:[a-z0-9_]+|…)(?:,\s*|$))+$|^\{\{[\s\S]*\}\}$/;
const EXCEPTIONS = new Set([
  /* L'exemple d'une VALEUR d'état, pas un libellé : ce qu'un compteur Linky
   * renvoie en heures creuses. On y tape ce que dit SON capteur, et un état
   * de Home Assistant ne se traduit pas. */
  'views/veilles.jsx "HC"',
]);
const ATTRIBUTS = new Set(['title', 'aria-label', 'placeholder', 'alt']);
const BOITES = new Set(['alert', 'confirm', 'prompt']);

function neutre(texte) {
  /* Un « s » COLLÉ, rendu par une expression, est le pluriel à la française
   * (`n > 1 ? 's' : ''`), pas l'unité des secondes — celle-ci s'écrit avec
   * son espace (`cpt.reste + ' s'`). */
  if (texte === 's') return false;
  const t = texte.replace(/\s+/g, ' ').trim();
  if (!/\p{L}/u.test(t) || NEUTRES.has(t) || TECHNIQUE.test(t)) return true;
  return t.match(/\p{L}+/gu).every(w => UNITES.has(w));
}

/* Les littéraux qu'une expression RENDRAIT, sans jamais entrer dans un appel. */
function rendus(n, acc = []) {
  if (!n) return acc;
  if (n.type === 'Literal' && typeof n.value === 'string') acc.push([n, n.value]);
  else if (n.type === 'TemplateLiteral') {
    acc.push([n, n.quasis.map(q => q.value.cooked).join(' ')]);
    n.expressions.forEach(e => rendus(e, acc));
  } else if (n.type === 'ConditionalExpression') { rendus(n.consequent, acc); rendus(n.alternate, acc); }
  else if (n.type === 'LogicalExpression') { if (n.operator !== '&&') rendus(n.left, acc); rendus(n.right, acc); }
  else if (n.type === 'BinaryExpression' && n.operator === '+') { rendus(n.left, acc); rendus(n.right, acc); }
  else if (n.type === 'SequenceExpression') rendus(n.expressions[n.expressions.length - 1], acc);
  return acc;
}

function relever(source) {
  const arbre = parse(source, { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true }, loc: true });
  const trouves = [];
  const voir = (forme, noeud, texte) => {
    if (!neutre(texte)) trouves.push({ ligne: noeud.loc.start.line, forme, texte: texte.replace(/\s+/g, ' ').trim() });
  };
  const enfants = (liste) => {
    for (const c of liste) {
      if (c.type === 'JSXText') voir('texte', c, c.value);
      else if (c.type === 'JSXExpressionContainer') for (const [m, t] of rendus(c.expression)) voir('rendu', m, t);
    }
  };
  (function marcher(n) {
    if (n.type === 'JSXElement') {
      const el = n.openingElement;
      for (const a of el.attributes) {
        if (a.type !== 'JSXAttribute' || !a.value || !ATTRIBUTS.has(a.name.name)) continue;
        const v = a.value.type === 'JSXExpressionContainer' ? a.value.expression : a.value;
        for (const [m, t] of rendus(v)) voir(a.name.name, m, t);
      }
      // Le contenu d'un `<style>` est du CSS, pas une phrase.
      if (el.name.name !== 'style') enfants(n.children);
    } else if (n.type === 'JSXFragment') enfants(n.children);
    else if (n.type === 'CallExpression') {
      const c = n.callee;
      const qui = c.type === 'Identifier' ? c.name : c.type === 'MemberExpression' && !c.computed ? c.property.name : null;
      if (BOITES.has(qui)) for (const [m, t] of rendus(n.arguments[0])) voir(qui + '()', m, t);
    }
    for (const k in n) {
      const v = n[k];
      if (Array.isArray(v)) { for (const x of v) if (x && typeof x.type === 'string') marcher(x); }
      else if (v && typeof v.type === 'string') marcher(v);
    }
  })(arbre);
  return trouves;
}

test('le second filet voit les quatre formes, et laisse passer ce qui est traduit', () => {
  /* Sans cette épingle, un filet affaibli resterait vert sans rien voir. */
  const vus = relever([
    "const A = () => <div title=\"Fermer la fiche\">actuel {x}°",
    "  <span>{on ? 'Pause' : tr('Lecture')}</span>",
    "  <input placeholder=\"sensor.…\" aria-label={tr('Nom')} />",
    "  <i>{n + ' ms'}</i><b>{trN(n, '{n} repas', '{n} repas')}{n > 1 ? 's' : ''}</b></div>;",
    "alert(ok ? tr('Fait') : 'Échec de l’envoi');",
    "window.confirm(err || 'Tout effacer ?');",
  ].join('\n')).map(x => x.forme + ' ' + x.texte);
  assert.deepEqual(vus, [
    'title Fermer la fiche', 'texte actuel', 'rendu Pause', 'rendu s',
    'alert() Échec de l’envoi', 'confirm() Tout effacer ?',
  ]);
});

test('aucun texte rendu en clair : mêlé, ternaire, attribut, alert()', () => {
  const fuites = [];
  const servies = new Set();
  for (const f of fichiers) {
    for (const x of relever(readFileSync(f, 'utf8'))) {
      const cle = nom(f) + ' ' + JSON.stringify(x.texte);
      if (EXCEPTIONS.has(cle)) { servies.add(cle); continue; }
      fuites.push(`${nom(f)}:${x.ligne}  [${x.forme}] ${JSON.stringify(x.texte.slice(0, 80))}`);
    }
  }
  assert.deepEqual(fuites, [], 'ces textes ne passent pas par tr() : ils resteront en français');
  assert.deepEqual([...EXCEPTIONS].filter(e => !servies.has(e)), [], 'une exception ne sert plus : la retirer');
});
