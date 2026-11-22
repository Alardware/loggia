// ─────────────────────────────────────────────────────────────────────────────
// Audit des thèmes et des effets du 13/11 — LOT 1 (validé le 14/11).
//
//  E1  un thème sans police de titre dessine ses titres droits : Manrope n'a
//      pas d'italique embarqué, le navigateur en penchait un faux ;
//  E7  le thème GitHub ne s'appelle plus « GitHub Dark » : il a un clair ;
//  V2  verre « Auto » : couper le ciel ne remet plus le flou le plus coûteux ;
//  V3  les boucles sans fin se taisent hors de l'écran et sous la veille ;
//  V4  « Ciel animé » coupe toute la météo animée, et « Animations réduites »
//      fige les boucles sans toucher aux feuilles ni à l'appui.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MONOLITHE } from './monolithe.mjs'; // App.jsx et ce qui en sort (ADR 0282)

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const css = lire('src', 'index.css');

// Un stockage d'appareil, une racine dont on lit les classes, un écran dont on choisit le pointeur.
const magasin = new Map();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: {
  getItem: (k) => (magasin.has(k) ? magasin.get(k) : null), setItem: (k, v) => { magasin.set(k, String(v)); }, removeItem: (k) => { magasin.delete(k); } } });
const classes = new Set();
Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value: { documentElement: { classList: {
  toggle: (c, on) => { if (on) classes.add(c); else classes.delete(c); return on; }, contains: (c) => classes.has(c) } } } });
let tactile = false;
Object.defineProperty(globalThis, 'matchMedia', { configurable: true, writable: true, value: (q) => ({ matches: /pointer: coarse/.test(q) && tactile }) });
const poser = (o) => { magasin.clear(); for (const [k, v] of Object.entries(o)) magasin.set(k, v); };

test('E1 — un thème sans police de titre pose la classe, et la retire au thème suivant', () => {
  const t = lire('src', 'theme.js');
  assert.ok(t.includes("root.classList.toggle('loggia-titres-droits', !v.serif);"), 'la classe ne suit plus le thème');
  assert.ok(t.includes("root.classList.remove('loggia-titres-droits');"), 'la classe resterait en revenant à Loggia');
  assert.match(css, /html\.loggia-titres-droits \[style\*="--o-serif"\] \{ font-style: normal !important; font-weight: 700 !important;/,
    'les titres d’un thème sans italique seraient de nouveau penchés par le navigateur');
  // Loggia n'a pas de preset : ses titres gardent Newsreader et son italique.
  assert.ok(lire('public', 'fonts', 'fonts.css').includes("font-family: 'Newsreader'"));
});

test('E7 — « GitHub », pas « GitHub Dark » : le thème a une variante claire', () => {
  const p = lire('src', 'views', 'parametres.jsx');
  assert.ok(p.includes("{ id: 'github', name: 'GitHub', desc: tr('Sobre, façon GitHub'),"));
  assert.ok(!p.includes('GitHub Dark'));
});

test('V2 — verre Auto, ciel coupé : la dernière mesure, sinon Léger au doigt', async () => {
  const V = await import('../src/verre.js');
  tactile = false;
  poser({ 'loggia-wxfx': '0', 'loggia-ciel-actuel': 'fixe' });
  assert.equal(V.verreLeger(), true, 'une tablette mesurée lente qui coupe le ciel retrouvait le flou de toutes ses cartes');
  poser({ 'loggia-wxfx': '0' });
  assert.equal(V.verreLeger(), false, 'un ordinateur jamais mesuré reste en Plein');
  tactile = true;
  assert.equal(V.verreLeger(), true, 'un écran tactile jamais mesuré, ciel coupé, passe en Léger');
  poser({ 'loggia-wxfx': '0', 'loggia-ciel-actuel': 'plein' });
  assert.equal(V.verreLeger(), false, 'une mesure fluide l’emporte sur le pointeur');
  poser({ 'loggia-wxfx': '0', 'loggia-verre': 'plein' });
  assert.equal(V.verreLeger(), false, 'un choix explicite passe avant Auto');
  tactile = false;
});

test('V3 — l’observateur suit aussi les icônes, la météo, les vagues, les flux et la pulsation', async () => {
  const H = await import('../src/horsecran.js');
  assert.deepEqual([...H.PREFIXES_SUSPENDUS], ['o-ic-', 'o-wxm-']);
  assert.deepEqual([...H.BOUCLES_SUSPENDUES], ['lgWave', 'loggia-energy-flow', 'pulse']);
  // Un faux document : un tracé de dessin part, c'est son <svg> qui est suivi.
  const ecoutes = {}; const suivis = [];
  const doc = { addEventListener: (n, f) => { ecoutes[n] = f; }, removeEventListener: () => {} };
  class Obs { constructor(cb) { this.cb = cb; } observe(el) { suivis.push(el); } unobserve() {} disconnect() {} }
  H.ecouterHorsEcran(doc, Obs);
  const svg = { isConnected: true }, trace = { isConnected: true, ownerSVGElement: svg }, autre = { isConnected: true };
  ecoutes.animationstart({ animationName: 'o-ic-spin', target: trace });
  ecoutes.animationstart({ animationName: 'o-sheetIn', target: autre });
  ecoutes.animationstart({ animationName: 'pulse', target: autre });
  assert.deepEqual(suivis, [svg, autre], 'une entrée de feuille n’est pas une boucle ; un tracé se suit par son <svg>');
  assert.ok(css.includes('[data-o-hors], [data-o-hors]::before, svg[data-o-hors] *,'), 'la feuille de style ne lit plus l’attribut');
});

test('V3 et V4 — sous la veille les boucles du tableau de bord sont en pause, la veille garde les siennes', () => {
  const boucles = ':is([style*="o-ic-"], [style*="o-wxm-"], [style*="lgWave"], [style*="loggia-energy-flow"], [style*="pulse 1.2s"])';
  // Dans le tableau de bord seulement : la veille est montée à côté de `.loggia-main`, son halo continue de respirer.
  assert.ok(css.includes('.loggia-ambient-on :is(.loggia-main, .loggia-aside) ' + boucles + ' { animation-play-state: paused !important; }'));
  assert.ok(css.includes('html.loggia-calme ' + boucles + ','));
  assert.ok(MONOLITHE.includes('className="loggia-main"'), 'le conteneur visé par la pause a changé de nom');
  // Les noms que la feuille vise sont bien ceux que le code pose en ligne.
  assert.ok(lire('src', 'attention.js').includes("'pulse 1.2s infinite'"));
  assert.ok(lire('src', 'anneau.jsx').includes("animation: 'lgWave '"));
  assert.ok(lire('src', 'views', 'energie.jsx').includes('animation: `loggia-energy-flow '));
});

test('V4 — « Animations réduites » : un réglage de l’appareil, lu avant le premier rendu', async () => {
  const C = await import('../src/calme.js');
  poser({});
  assert.equal(C.lireCalme(), false);
  assert.equal(C.meteoAnimee(), true, 'sans réglage, la météo bouge comme avant');
  C.ecrireCalme(true);
  assert.equal(magasin.get('loggia-calme'), '1');
  assert.ok(classes.has('loggia-calme'), 'la classe suit sur-le-champ');
  assert.equal(C.meteoAnimee(), false, 'animations réduites : la météo se tait aussi');
  C.ecrireCalme(false);
  assert.ok(!magasin.has('loggia-calme') && !classes.has('loggia-calme'));
  poser({ 'loggia-wxfx': '0' });
  assert.equal(C.meteoAnimee(), false, '« Ciel animé » coupé : les icônes et la mini-scène ne bougent plus non plus');
  const t = lire('src', 'theme.js');
  assert.ok(t.includes("import { poserCalme } from './calme.js';") && t.includes('\nposerCalme();\n'), 'la classe arriverait après le premier rendu');
});

test('V4 — l’icône météo et la mini-scène lisent le réglage ; l’Apparence l’écrit aux deux formats', () => {
  const w = lire('src', 'wxutil.jsx');
  assert.ok(w.includes('if (!anime || REDUCE_MOTION || !meteoAnimee()) return <IcoFigee'));
  assert.ok(w.includes('if (!on || REDUCE_MOTION || !meteoAnimee()) return null;'));
  const p = lire('src', 'views', 'parametres.jsx');
  assert.equal((p.match(/cb=\{basculerCalme\}/g) || []).length, 2, 'un interrupteur sur ordinateur, un au téléphone');
  assert.ok(p.includes("<Tgl on={calme} cb={basculerCalme} label={tr('Animations réduites')} />"));
  assert.ok(p.includes("<BasculeTel on={calme} cb={basculerCalme} nom={tr('Animations réduites')} />"));
});
