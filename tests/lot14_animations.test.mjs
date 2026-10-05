// Lot 14 de l'audit du 03/10 — les animations sans fin ne repeignent plus la
// page pour rien.
//
// Mesuré dans la démo (1440 × 900, fond météo coupé, trace de 5 s) avant le
// correctif : au repos sur l'Accueil, sept animations tournaient — le point
// LIVE ×5 (la cloche, quatre caméras), le souffle et la bordure qui tourne de
// la tuile caméra en panne — alors que SEUL le point de la cloche était à
// l'écran. Toutes en `box-shadow` ou en propriété (`--o-tour`) : le
// compositeur n'en prend aucune, chaque image recalculait les styles et
// repeignait. Défilé en bas de page, tout hors de l'écran : 694 recalculs de
// style et 5 557 peintures en 5 s (après : 0 et 10). Sous la veille, pareil.
//
// Le signal ne change pas (ADR 0048 : le liseré rouge qui tourne), ni son
// dessin. Trois gestes :
//  - le point LIVE passe au compositeur (`transform` + `opacity`), son halo
//    redessiné à l'identique par deux pseudo-éléments ;
//  - un observateur partagé (horsecran.js) pose `data-o-hors` sur ce qui sort
//    de l'écran, et la feuille de style y suspend les animations ;
//  - la veille (`loggia-ambient-on`) les suspend toutes, cloche comprise.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const css = lire('src', 'index.css');
const NL = String.fromCharCode(10);

/** Le bloc `@keyframes nom { … }`, accolades comprises. */
function keyframes(nom) {
  const d = css.indexOf('@keyframes ' + nom + ' {');
  assert.ok(d >= 0, '@keyframes ' + nom + ' introuvable');
  let prof = 0;
  for (let i = css.indexOf('{', d); i < css.length; i++) {
    if (css[i] === '{') prof++;
    else if (css[i] === '}' && --prof === 0) return css.slice(d, i + 1);
  }
  throw new Error('@keyframes ' + nom + ' non fermé');
}

/** Les déclarations de la règle dont le sélecteur est exactement `sel`. */
function regle(sel) {
  const d = css.indexOf(NL + sel + ' {');
  assert.ok(d >= 0, 'règle ' + sel + ' introuvable');
  return css.slice(css.indexOf('{', d) + 1, css.indexOf('}', d));
}

/** Les noms d'animation posés sur `sel` (raccourci `animation:`). */
const animations = (sel) => [...regle(sel).matchAll(/animation:\s*([a-z0-9-]+)/g)].map(m => m[1]);

test('le point LIVE ne s’anime plus qu’en transform et opacity', () => {
  for (const nom of ['o-livedot', 'o-livehalo']) {
    const props = new Set([...keyframes(nom).matchAll(/([a-z-]+)\s*:/g)].map(m => m[1]));
    assert.deepEqual([...props].sort(), ['opacity', 'transform'],
      nom + ' anime autre chose que transform et opacity : le compositeur le rend au fil principal, qui repeint à chaque image');
  }
  assert.deepEqual(animations('.o-livedot'), ['o-livedot']);
  assert.deepEqual(animations('.o-livedot::before'), ['o-livehalo']);
});

test('le halo garde le dessin de l’ancienne ombre : 5 px de plus, même rouge, même souffle', () => {
  // Avant : `box-shadow: 0 0 0 0 rgba(248,113,113,.55)` → `0 0 0 5px` transparent,
  // à mi-cycle de 1,8 s ease-in-out. Un disque de cette couleur, sous le point,
  // dont le rayon passe de r à r + 5 : l'échelle vaut 1 + 5 / r.
  const halo = keyframes('o-livehalo');
  assert.ok(halo.includes('0%,100% { transform: scale(1); opacity: 1; }'), 'le halo ne part plus du bord du point, opaque');
  assert.ok(halo.includes('50% { transform: scale(calc(1 + 5 / var(--o-point-r, 3.5))); opacity: 0; }'), 'le halo ne s’étale plus de 5 px');
  assert.ok(regle('.o-livedot::before').includes('background: rgba(248,113,113,.55); opacity: 0;'), 'le halo a changé de couleur, ou se voit sans tourner');
  assert.ok(regle('.o-livedot::before').includes('animation: o-livehalo 1.8s ease-in-out infinite;'), 'le halo ne bat plus avec le point');
  assert.ok(regle('.o-livedot').includes('animation: o-livedot 1.8s ease-in-out infinite;'));
  assert.ok(keyframes('o-livedot').includes('50% { transform: scale(1.15); opacity: .85; }'), 'le point ne respire plus comme avant');
  // Le point est redessiné PAR-DESSUS le halo, à la taille de sa boîte bordure.
  const calques = regle('.o-livedot::before, .o-livedot::after');
  assert.ok(calques.includes('inset: calc(50% - var(--o-point-r, 3.5) * 1px);') && calques.includes('border-radius: inherit;'));
  assert.ok(calques.includes('visibility: visible;') && regle('.o-livedot').includes('visibility: hidden;'),
    'la boîte d’origine se peint encore : deux fois peinte, elle fonce son bord lissé');
  assert.ok(regle('.o-livedot::after').includes('background: inherit; border: inherit;'), 'le point redessiné n’est plus le point');
  assert.ok(css.includes('@media (prefers-reduced-motion: reduce) { .o-livedot::before { animation: none; } }'),
    'en mouvement réduit, le halo continue de battre');
});

test('chaque point LIVE déclare son rayon, bordure comprise', () => {
  const sites = [];
  const fichiers = ['App.jsx', ...readdirSync(join(RACINE, 'src')).filter(f => /\.jsx?$/.test(f) && f !== 'App.jsx')];
  for (const f of fichiers) {
    for (const m of lire('src', f).matchAll(/className="o-livedot"[^>]*?style=\{\{([^}]*)\}\}/g)) sites.push([f, m[1]]);
  }
  assert.equal(sites.length, 3, 'la cloche, la tuile caméra, la carte caméra d’une pièce');
  for (const [f, st] of sites) {
    const w = Number(st.match(/width: ([\d.]+)/)[1]);
    const r = st.match(/'--o-point-r': ([\d.]+)/);
    assert.ok(r, f + ' : un point LIVE sans --o-point-r prend le rayon par défaut, et son halo ne s’étale plus de 5 px');
    // `* { box-sizing: border-box }` : la largeur inclut la bordure (la cloche).
    assert.equal(Number(r[1]), w / 2, f + ' : --o-point-r doit valoir la moitié de la largeur (' + w + ' px)');
  }
});

test('hors de l’écran et sous la veille, le liseré et le point LIVE sont en pause', () => {
  const d = css.indexOf('animation-play-state: paused; }');
  assert.ok(d >= 0, 'plus aucune règle ne suspend les animations');
  const tete = css.slice(css.lastIndexOf('*/', d) + 2, css.lastIndexOf('{', d)).split(',').map(s => s.trim());
  for (const sel of ['.o-panne[data-o-hors]', '.o-panne[data-o-hors]::before', '.o-livedot[data-o-hors]', '.o-livedot[data-o-hors]::before',
    '.loggia-ambient-on .o-panne', '.loggia-ambient-on .o-panne::before', '.loggia-ambient-on .o-livedot', '.loggia-ambient-on .o-livedot::before']) {
    assert.ok(tete.includes(sel), sel + ' n’est plus suspendu');
  }
  // Spécificité (0,2,0) au moins : à (0,1,0), le raccourci `animation` de
  // `.o-livedot`, plus bas dans la feuille, remettrait `running`.
  for (const sel of tete) assert.ok(/\[data-o-hors\]|^\.loggia-ambient-on /.test(sel), sel + ' : sa spécificité ne bat plus le raccourci `animation`');
  // Le signal lui-même ne change pas (ADR 0048).
  assert.ok(regle('.o-panne').includes('animation: o-souffle 2.6s ease-in-out infinite;'));
  assert.ok(regle('.o-panne::before').includes('animation: o-tour 3.4s linear infinite;'));
});

test('l’observateur suit toutes les animations sans fin du liseré et du point', async () => {
  const { ANIMATIONS_SUSPENDUES, ATTRIBUT_HORS } = await import('../src/horsecran.js');
  assert.ok(css.includes('.o-panne[' + ATTRIBUT_HORS + ']'), 'l’observateur pose un attribut que la feuille de style ne lit pas');
  for (const sel of ['.o-panne', '.o-panne::before', '.o-livedot', '.o-livedot::before']) {
    for (const nom of animations(sel)) assert.ok(ANIMATIONS_SUSPENDUES.includes(nom), nom + ' (' + sel + ') tourne hors de l’écran : l’observateur ne la connaît pas');
  }
});

/* Un document et un IntersectionObserver de poche : de quoi rejouer ce que
 * fait le navigateur, sans navigateur. */
function bac() {
  const ecouteurs = new Map();
  const doc = {
    addEventListener: (t, f, c) => ecouteurs.set(t, { f, c }),
    removeEventListener: (t, f) => { if (ecouteurs.get(t) && ecouteurs.get(t).f === f) ecouteurs.delete(t); },
  };
  const io = { observes: [], retires: [], coupe: false, rappel: null, options: null };
  class FauxIO {
    constructor(rappel, options) { io.rappel = rappel; io.options = options; }
    observe(el) { io.observes.push(el); }
    unobserve(el) { io.retires.push(el); }
    disconnect() { io.coupe = true; }
  }
  const element = () => {
    const attrs = new Map();
    return { isConnected: true, attrs, setAttribute: (k, v) => attrs.set(k, v), removeAttribute: (k) => attrs.delete(k), hasAttribute: (k) => attrs.has(k) };
  };
  const depart = (target, animationName) => ecouteurs.get('animationstart').f({ target, animationName });
  return { doc, io, FauxIO, element, depart, ecouteurs };
}

test('un seul observateur pour la page : il apprend chaque élément par son animationstart', async () => {
  const { ecouterHorsEcran, ATTRIBUT_HORS } = await import('../src/horsecran.js');
  const b = bac();
  const lacher = ecouterHorsEcran(b.doc, b.FauxIO);
  assert.equal(b.ecouteurs.get('animationstart').c, true, 'écoute en capture : un arrêt de propagation ne la priverait de rien');
  // Le halo déborde de 7 px (souffle) : la marge ne suspend qu'une fois tout sorti.
  assert.ok(parseFloat(b.io.options.rootMargin) >= 7, 'la marge de l’observateur coupe le souffle encore visible');
  const carte = b.element(), point = b.element(), autre = b.element();
  b.depart(carte, 'o-souffle');
  b.depart(carte, 'o-tour');
  b.depart(point, 'o-livedot');
  b.depart(point, 'o-livehalo');
  b.depart(autre, 'o-liveIn');
  assert.deepEqual(b.io.observes, [carte, point], 'chaque élément suivi une fois, et rien d’autre');
  b.io.rappel([{ target: carte, isIntersecting: false }, { target: point, isIntersecting: true }]);
  assert.ok(carte.hasAttribute(ATTRIBUT_HORS) && !point.hasAttribute(ATTRIBUT_HORS));
  b.io.rappel([{ target: carte, isIntersecting: true }]);
  assert.ok(!carte.hasAttribute(ATTRIBUT_HORS), 'revenue à l’écran, la carte ne repart pas');
  // React retire une carte : on cesse de la suivre.
  point.isConnected = false;
  b.io.rappel([{ target: point, isIntersecting: false }]);
  assert.deepEqual(b.io.retires, [point]);
  assert.ok(!point.hasAttribute(ATTRIBUT_HORS));
  // Et celles retirées hors de l'écran, au passage d'une nouvelle.
  carte.isConnected = false;
  b.depart(b.element(), 'o-tour');
  assert.deepEqual(b.io.retires, [point, carte]);
  lacher();
  assert.ok(b.io.coupe && !b.ecouteurs.has('animationstart'), 'le nettoyage laisse l’écoute ou l’observateur');
});

test('sans IntersectionObserver, rien ne change : tout tourne comme avant', async () => {
  const { ecouterHorsEcran } = await import('../src/horsecran.js');
  const b = bac();
  const lacher = ecouterHorsEcran(b.doc, null);
  assert.equal(typeof lacher, 'function');
  assert.ok(!b.ecouteurs.has('animationstart'));
});

test('l’amorce pose l’observateur avant le premier rendu', () => {
  const boot = lire('src', 'boot.jsx');
  assert.ok(boot.includes("import { ecouterHorsEcran } from './horsecran.js';"));
  const i = boot.indexOf(NL + 'ecouterHorsEcran(document);' + NL);
  assert.ok(i > 0, 'plus personne ne pose l’observateur : le liseré tourne de nouveau hors de l’écran');
  assert.ok(i < boot.indexOf('createRoot('), 'posé après le premier rendu, il manque les premiers animationstart');
});
