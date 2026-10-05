/* Rien ne reste en français — les formes que le premier filet ne voit pas
 * (audit du 03/10).
 *
 * `rien_en_francais.test.mjs` lit le source comme du texte : un nœud JSX écrit
 * en clair d'un chevron à l'autre, ou un `tr('…')` dont la clé manque. Quatre
 * formes lui échappaient, et toutes sortaient en français dans les sept
 * langues :
 *
 *   1. un nœud de texte MÊLÉ d'expressions — « Thème « {nom} » · mode
 *      {mode}. » : aucun de ses morceaux n'est entre deux chevrons ;
 *   2. une chaîne rendue par un ternaire ou une concaténation —
 *      `{cv ? 'Modifier la vue' : 'Nouvelle vue'}`, `nombre(x) + ' Mo'` ;
 *   3. un attribut lu en info-bulle ou à voix haute — `title`, `aria-label`,
 *      `placeholder`, `alt` ;
 *   4. le texte d'une fenêtre `alert` ou `confirm`.
 *
 * Le source est donc ANALYSÉ, par espree — l'analyseur d'ESLint, déjà installé
 * pour le lint. Chaque chaîne est suivie jusqu'à ce qui la montre, en ne
 * traversant que ce qui la transmet telle quelle : un ternaire, un `||`, une
 * concaténation. Tout ce qui passe par `tr` est hors de cause.
 *
 * Une table de mots montrée plus loin par `tr(variable)` échappe à toute
 * analyse : le deuxième test vérifie que ses mots ont leur clé et que
 * l'affichage les traduit ; le troisième, les mots rangés dans une variable.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as espree from 'espree';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(RACINE, 'src');
const lire = (...p) => readFileSync(join(SRC, ...p), 'utf8');

/* `App.jsx` et `views.js` ont leur propre lot dans l'audit du 03/10 : ils
 * rejoindront ce filet quand il sera livré — il suffira de les retirer d'ici. */
const AILLEURS = new Set(['App.jsx', 'views.js']);

const fichiers = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) { if (f !== 'langues') walk(p); }
    // `dessins.js` ne porte que du balisage SVG.
    else if (/\.jsx?$/.test(f) && f !== 'dessins.js') fichiers.push(p);
  }
})(SRC);
const nom = (f) => relative(SRC, f).split(sep).join('/');

const EN = (await import(new URL('../src/langues/en.js', import.meta.url))).default;
// Les mots que Home Assistant traduit lui-même (`CLES_HA`, i18n.js), relevés
// comme le fait le premier filet.
const I18N = lire('i18n.js');
const BLOC_HA = I18N.slice(I18N.indexOf('const CLES_HA = {'), I18N.indexOf('export function langueDeHA'));
const CLES_HA = new Set([...BLOC_HA.matchAll(/^\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")\s*:/gm)]
  .map(m => (m[1] ?? m[2]).replace(/\\'/g, "'")));
const connue = (k) => k in EN || CLES_HA.has(k);

/* Ce qui s'écrit pareil dans toutes les langues : les neutres du premier
 * filet, plus trois unités — kelvins, millisecondes, pixels. */
const NEUTRES = new Set([
  'Loggia', 'O', 'OK', 'LIVE', 'AUTO', '×', '+', '—', '·',
  '°C', '%', 'W', 'kWh', 'ppm', 'ppm CO₂', 'CO₂', 'm', 'm²', '24 h',
  'React + Vite', 'Manrope / Newsreader', 'Home Assistant', 'HACS',
  'K', 'ms', 'px',
  // L'état que publie le tarif « heures creuses » d'un compteur Linky : un
  // exemple à recopier tel quel, pas un mot.
  'HC',
]);
// Ce que Home Assistant lit tel quel : un identifiant d'entité, un gabarit.
const TECHNIQUE = /^[a-z_]+\.\S*$|\{\{/;
const aMontrer = (t) => /\p{L}/u.test(t) && !NEUTRES.has(t) && !TECHNIQUE.test(t);

const TEXTE = new Set(['title', 'aria-label', 'placeholder', 'alt']);
const TRADUIT = new Set(['tr', 'trN', 'trCourt', 'trHA', 'nomProfil']);
const nomAppel = (c) => (c.type === 'Identifier' ? c.name : c.type === 'MemberExpression' && !c.computed ? c.property.name : '');
const nomAttribut = (a) => (typeof a.name.name === 'string' ? a.name.name : a.name.name.name);

/* Où une chaîne finit-elle ? On remonte tant que le parent la transmet telle
 * quelle, puis l'on regarde où l'on est arrivé. Une clé d'objet, un argument,
 * une comparaison arrêtent la remontée : ce n'est plus ce qui s'affiche. */
function destination(pile, noeud) {
  let enfant = noeud;
  for (let i = pile.length - 1; i >= 0; i--) {
    const p = pile[i];
    if (p.type === 'ConditionalExpression' && enfant !== p.test) { enfant = p; continue; }
    if (p.type === 'LogicalExpression' && (p.operator !== '&&' || enfant === p.right)) { enfant = p; continue; }
    if ((p.type === 'BinaryExpression' && p.operator === '+') || p.type === 'TemplateLiteral') { enfant = p; continue; }
    if (p.type === 'JSXAttribute') return TEXTE.has(nomAttribut(p)) ? 'attribut ' + nomAttribut(p) : null;
    if (p.type === 'JSXExpressionContainer') {
      const a = pile[i - 1];
      if (a && a.type === 'JSXAttribute') return TEXTE.has(nomAttribut(a)) ? 'attribut ' + nomAttribut(a) : null;
      return 'enfant';
    }
    if (p.type === 'CallExpression' && p.arguments[0] === enfant && /^(alert|confirm|prompt)$/.test(nomAppel(p.callee))) return 'fenêtre ' + nomAppel(p.callee);
    return null;
  }
  return null;
}

function parcourir(n, pile, f, fuites) {
  if (!n || typeof n.type !== 'string') return;
  if (n.type === 'CallExpression' && TRADUIT.has(nomAppel(n.callee))) return;
  let t = null;
  if (n.type === 'JSXText' || (n.type === 'Literal' && typeof n.value === 'string')) t = n.value;
  else if (n.type === 'TemplateLiteral') t = n.quasis.map(q => q.value.cooked).join('…');
  if (t != null) {
    t = t.replace(/\s+/g, ' ').trim();
    const ou = !t || !aMontrer(t) ? null : n.type === 'JSXText' ? 'texte' : destination(pile, n);
    if (ou) fuites.push(`${nom(f)}:${n.loc.start.line}  ${ou} ${JSON.stringify(t.slice(0, 80))}`);
  }
  const suite = pile.concat([n]);
  for (const k of Object.keys(n)) {
    if (k === 'loc' || k === 'range' || k === 'parent') continue;
    const v = n[k];
    if (Array.isArray(v)) v.forEach(c => parcourir(c, suite, f, fuites));
    else if (v && typeof v.type === 'string') parcourir(v, suite, f, fuites);
  }
}

test('aucune chaîne montrée en clair : nœud mêlé, ternaire, attribut lu, alerte', () => {
  const fuites = [];
  for (const f of fichiers) {
    if (AILLEURS.has(nom(f))) continue;
    const ast = espree.parse(readFileSync(f, 'utf8'), { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true }, loc: true });
    parcourir(ast, [], f, fuites);
  }
  assert.deepEqual(fuites, [], 'ces textes s’affichent sans passer par tr() : ils resteront en français');
});

test('les mots d’une table, montrés par tr(variable) : chacun a sa clé, et l’affichage traduit', async () => {
  const bloc = (fichier, debut, fin) => {
    const s = lire(fichier);
    const i = s.indexOf(debut);
    assert.ok(i >= 0, fichier + ' : « ' + debut + ' » introuvable');
    return s.slice(i, s.indexOf(fin, i));
  };
  // Les options du robot : state.js ne peut pas importer i18n.js, qui l'importe.
  const vac = [...bloc('state.js', 'const VAC_MOTS = {', '};').matchAll(/:\s*'([^']*)'/g)].map(m => m[1]);
  // Les familles d'automatisations ; un mot repris du nom, lui, reste tel quel.
  const { FAMILLES_AUTO } = await import(new URL('../src/autos.js', import.meta.url));
  // Les teintes d'accent : la liste reste une donnée que d'autres tests relisent.
  const PAR = lire('views', 'parametres.jsx');
  const accents = JSON.parse(PAR.match(/const ACCENTS = (\[.*\]);\n/)[1].replace(/'/g, '"')).map(a => a[1]);
  assert.ok(vac.length > 10 && Array.isArray(FAMILLES_AUTO) && FAMILLES_AUTO.length > 10 && accents.length === 5, 'une table a changé de forme');
  const sansCle = [...new Set([...vac, ...FAMILLES_AUTO, ...accents])].filter(k => !connue(k));
  assert.deepEqual(sansCle, [], 'ces mots passent par tr(variable) : sans clé, ils restent en français');

  const robot = lire('ficherobot.jsx');
  // Une puissance a sa clé à sens (« Moyen · réglage »), lue par `trSens`
  // (relecture du 03/10).
  assert.equal((robot.match(/vacOption\(/g) || []).length, (robot.match(/\btrSens\(vacOption\(/g) || []).length, 'une option du robot s’affiche sans trSens()');
  assert.ok(PAR.includes('const nomTeinte = tr(lb);') && PAR.includes('title={nomTeinte} aria-label={nomTeinte}'), 'le nom d’une teinte d’accent ne se traduit plus');
  /* Le titre d'une famille d'automatisations. L'en-tête des MISES À JOUR
   * affiche aussi `{gr.g}`, mais ses groupes sont déjà traduits ou des noms
   * propres (ESPHome, Home Assistant) : on vise le seul titre des familles. */
  assert.ok(PAR.includes('fontWeight: 800 }}>{nomFam(gr.g)}</span>') && !PAR.includes('fontWeight: 800 }}>{gr.g}</span>'), 'la famille d’automatisations s’affiche sans tr()');
});

test('les mots en clair rangés dans une variable, puis montrés', () => {
  const PAR = lire('views', 'parametres.jsx');
  // Le journal d'une pièce : « RAS » et « Absent » à côté de mots traduits.
  assert.ok(!/:\s*'(RAS|Absent)'/.test(lire('historique.jsx')), 'le journal dit « RAS » ou « Absent » en français');
  // Le mode d'accès, sous « Connexion HA ».
  assert.ok(!/[^(]'accès distant'/.test(PAR), '« accès distant » s’affiche en clair');
  // Le rôle d'un profil : une VALEUR (« Admin », « Famille ») traduite à l'affichage.
  assert.ok(!PAR.includes("{u.role || tr('Famille')}"), 'le rôle d’un profil s’affiche en clair');
  // Une caméra enregistrée sans nom.
  assert.ok(!PAR.includes("'Caméra ' +"), 'une caméra sans nom s’appelle « Caméra 1 » dans toutes les langues');
  // Les points cardinaux : « O » est l'Ouest en français, l'Est en allemand.
  const volets = lire('views', 'volets.jsx');
  const debut = volets.indexOf('const CARDINAUX = () => [');
  const cardinaux = volets.slice(debut, volets.indexOf('];', debut));
  assert.equal((cardinaux.match(/court: tr\('/g) || []).length, 8, 'un point cardinal s’affiche sans tr()');
  // La machine en attente de découverte.
  assert.ok(!/'Machine \d'/.test(lire('sysconf.js')), '« Machine 1 » s’affiche en clair');
  // La source de l'énergie, au premier lancement : un mot français DANS une phrase traduite.
  assert.ok(!lire('Onboarding.jsx').includes('src: energy.source'), 'la source d’énergie se glisse en français dans la phrase');
  // Le titre de l'onglet de la démonstration, posé avant que `tr` n'existe.
  assert.ok(lire('main.jsx').includes("cat['Loggia — démonstration']") && connue('Loggia — démonstration'), 'le titre de la démo reste en français');
});
