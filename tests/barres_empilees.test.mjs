// ─────────────────────────────────────────────────────────────────────────────
// Les barres d'un graphe : empilées, et pas plates (08/10).
//
// « Ça ne me plaît pas trop, le fait que ce soit coupé comme ça, mets en barres
// plutôt » — la journée se traçait en aires lissées, et la courbe s'arrêtait net
// à l'heure courante.
//
// Puis : « tes barres n'ont pas d'âme, elles sont moches ». Elles étaient justes
// mais rangées CÔTE À CÔTE : trois séries sur vingt-quatre heures faisaient 72
// barres, la plus fine à 2,54 px réels sur un téléphone — des traits. Et d'un
// aplat uni, là où tout le reste du tableau de bord est en lavis.
//
// Empilées : une barre par heure, 11 px au téléphone. Avec le vocabulaire de
// la maison — un dégradé, un rail d'assise, une pousse à l'arrivée.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const G = lire('src', 'engraphes.jsx');
const CSS = lire('src', 'index.css');
const HISTO = lire('src', 'views', 'energiehisto.jsx');

test('les quatre périodes se lisent en barres', () => {
  /* La journée seule passait en aires : la courbe tombait dans le vide à
   * l'heure courante, alors qu'une barre absente dit simplement que l'heure
   * n'est pas passée. */
  assert.ok(!/mode=\{periode === 'jour' \? 'aires' : 'barres'\}/.test(HISTO), 'la journée repasse en aires');
  assert.ok(HISTO.includes('hauteur={etroit ? 190 : 290} mode="barres"'), 'l’historique n’est plus en barres');
  assert.ok(!HISTO.includes('mode="aires"'), 'un graphe de la vue Énergie est encore en aires');
});

test('l’échelle d’un graphe empilé se mesure sur les SOMMES', () => {
  /* « Ça déborde » (08/10) : les barres sortaient du cadre par le haut en
   * semaine, en mois et en année. L'échelle prenait le maximum d'UNE série,
   * alors qu'une colonne empilée vaut la somme des trois — trois séries de
   * 8 kWh font une colonne de 24 sur un axe gradué jusqu'à 10.
   *
   * Le défaut est arrivé AVEC l'empilement : côte à côte, le maximum d'une
   * série était bien la plus haute barre. */
  assert.ok(G.includes('const sommes = cases.map((_, i) => vraies.reduce((s, serie) => {'), 'les sommes par case ne se calculent plus');
  assert.ok(G.includes("const tous = (mode === 'aires' ? vraies.flatMap(s => s.valeurs) : sommes)"),
    'l’échelle ne suit plus ce qu’on dessine : une barre empilée dépassera le cadre');
  // Une valeur nulle, absente ou négative ne gonfle pas la somme.
  assert.ok(G.includes('return s + (v != null && isFinite(v) && v > 0 ? v : 0);'), 'une case vide fausserait la somme');
});

test('les AIRES gardent le maximum par série', () => {
  /* Elles se superposent sans s'additionner : leur plafond est bien la plus
   * grande valeur, pas la somme. Les mesurer comme une pile écraserait les
   * courbes dans le bas du cadre. */
  assert.ok(/mode === 'aires' \? vraies\.flatMap\(s => s\.valeurs\)/.test(G), 'les aires se mesureraient comme une pile');
});

test('UNE barre par case, pas une par série', () => {
  /* Le calcul d'avant divisait la colonne par le nombre de séries. Avec trois
   * séries, chaque barre tombait à 2,54 px réels sur un téléphone. */
  assert.ok(G.includes('const large = Math.min(34, Math.max(3, pas * 0.82));'), 'la barre ne prend plus toute sa colonne');
  assert.ok(!/\(pas \* 0\.82 - \(k - 1\) \* 3\) \/ k/.test(G), 'la largeur se redivise par le nombre de séries');
});

test('les séries s’empilent, du bas vers le haut', () => {
  assert.ok(G.includes('pile.push({ j, s, bas: cumul, haut: cumul + v });'), 'les séries ne s’empilent plus');
  assert.ok(G.includes('cumul += v;'), 'le cumul ne monte plus');
  // Et les barres ne se décalent plus autour d'un centre.
  assert.ok(!/centre - \(k \* large/.test(G), 'les barres se rangent de nouveau côte à côte');
});

test('seul le SOMMET de la pile est arrondi', () => {
  /* Le bas d'un segment pose sur celui d'en dessous, ou sur la ligne de base :
   * un coin rond l'en décollerait. Un `rx` de <rect> arrondirait les quatre. */
  assert.ok(G.includes('const haussee = (x, y, w, h, r) => {'), 'le tracé à sommet arrondi a disparu');
  assert.ok(G.includes('haussee(x, yHaut, large, h, dernier ? 4 : 0)'), 'le rayon ne suit plus le dernier segment');
  // Le rayon se réduit pour un segment plus court que lui, sinon le tracé se replie.
  assert.ok(G.includes('const a = Math.max(0, Math.min(r, w / 2, h));'), 'un segment court replierait son tracé');
});

test('deux segments voisins ne se touchent pas', () => {
  /* Sans cet écart, deux teintes voisines se collent et la pile se lit comme
   * un seul bloc. Le segment du bas garde son pied sur la ligne de base. */
  assert.ok(G.includes('const ecart = rang > 0 ? 2 : 0;'), 'les segments se touchent de nouveau');
  assert.ok(G.includes('const h = Math.max(0.5, yBas - yHaut - ecart);'), 'un segment peut devenir négatif');
});

test('le vocabulaire de la maison : dégradé, rail, pousse', () => {
  /* « Tes barres n'ont pas d'âme » : un aplat uni dans un tableau de bord qui
   * est en lavis d'un bout à l'autre. */
  assert.ok(G.includes("id={'lgB' + idGraphe + j}"), 'les barres n’ont plus leur dégradé');
  assert.ok(G.includes("fill: 'url(#lgB' + idGraphe + p.j + ')'"), 'les barres sont repassées en aplat');
  assert.ok(G.includes("fill: 'var(--o-s2)'"), 'le rail d’assise a disparu');
  assert.ok(G.includes('className="o-barre"'), 'la pousse n’est plus posée');
  assert.ok(CSS.includes('@keyframes o-barre-pousse { from { transform: scaleY(0); } to { transform: scaleY(1); } }'), 'la pousse n’existe plus');
});

test('la pousse part du PIED, et reste courte', () => {
  /* `transform-origin` au centre ferait grandir la barre vers le bas aussi, à
   * travers l'axe. Et sur une année, la dernière colonne ne doit pas arriver
   * une seconde après la première. */
  assert.ok(G.includes("transformOrigin: (x + large / 2).toFixed(1) + 'px ' + H + 'px'"), 'la pousse ne part plus du pied');
  assert.ok(G.includes('animationDelay: Math.min(400, i * 14)'), 'le décalage n’est plus plafonné');
  assert.ok(CSS.includes('@media (prefers-reduced-motion: reduce) { .o-barre { animation: none; } }'),
    'la pousse doit se taire quand on demande moins d’animation');
});
