/* Lot 14 de l'audit du 03/10 : le fond météo et l'orbe, côté WebGL.
 *
 * Mesuré dans la démo (Chrome, écran à 130 Hz) avant la correction :
 *   - la boucle de wx3d demandait une image à CHAQUE rafraîchissement
 *     (130 rAF/s) pour en dessiner 27 ;
 *   - elle dessinait encore 22 images/s pour un canevas à top −1169, sous
 *     les cartes qu'on était descendu lire, et réclamait 138 rAF/s sous la
 *     veille ;
 *   - la compilation à froid du shader figeait l'interface 2,2 à 4,7 s au
 *     retour sur l'Accueil (et 2,3 à 8 s quand le cache des programmes
 *     manquait : quatre visites sur vingt dans une série) ;
 *   - chaque visite laissait son contexte WebGL au ramasse-miettes (jusqu'à
 *     5 encore vivants sur la vue suivante), et l'orbe de même (4 après 10
 *     ouvertures).
 *
 * Ces tests montent le VRAI hôte de wx3d.jsx — sa boucle, ses arrêts, son
 * nettoyage — sur un faux moteur de rendu : three est le vrai, sauf
 * WebGLRenderer ; React se réduit à ses deux crochets ; le temps est
 * virtuel (setTimeout simulé, rAF à 130 Hz, performance.now à la main). */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as VRAI_THREE from 'three';
import * as VRAI_REACT from 'react';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const NL = String.fromCharCode(10);

/* Un module qui reprend tous les noms d'un vrai, et prend chez `faux` ceux
 * qu'on remplace — lus au chargement, dans `globalThis.__lot14`. */
const doublure = (cle, vrai) => 'const { vrai, faux } = globalThis.__lot14.' + cle + ';' + NL
  + Object.keys(vrai).filter((n) => n !== 'default' && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(n))
    .map((n) => 'export const ' + n + " = ('" + n + "' in faux) ? faux." + n + ' : vrai.' + n + ';').join(NL);
const CROCHETS = `
let D;
export async function initialize(d) { D = d; }
export async function resolve(spec, ctx, suite) {
  if (ctx.parentURL && ctx.parentURL.endsWith('/src/wx3d.jsx') && D[spec]) return { url: 'data:text/javascript,' + encodeURIComponent(D[spec]), shortCircuit: true };
  return suite(spec, ctx);
}`;
register('./jsx-hooks.mjs', import.meta.url);
register('data:text/javascript,' + encodeURIComponent(CROCHETS), { data: { three: doublure('three', VRAI_THREE), react: doublure('react', VRAI_REACT) } });

/* ── Le banc : un navigateur réduit à ce que touche l'hôte ─────────────── */
const E = {};
let maintenant = 0, prochainVsync = 0;
const VSYNC = 1000 / 130;

class FauxRendu {
  constructor() {
    E.rendus.push(this);
    this.journal = [];
    this.domElement = { style: {} };
    this.compilation = new Promise((ok) => { this.compilee = ok; });
    // Le pilote compile-t-il en parallèle ? (`has` ne journalise rien, `get` si.)
    this.extensions = { has: (n) => FauxRendu.parallele && n === 'KHR_parallel_shader_compile' };
  }
  setPixelRatio() {}
  getPixelRatio() { return 1; }
  setSize() {}
  compileAsync() { this.journal.push('compileAsync'); return this.compilation; }
  render() { this.journal.push('render'); E.images++; }
  dispose() { this.journal.push('dispose'); }
  forceContextLoss() { this.journal.push('forceContextLoss'); }
}

function installe() {
  FauxRendu.parallele = true;
  Object.assign(E, { rendus: [], images: 0, demandes: 0, rafs: new Map(), io: [], mo: [], ecoutes: new Map(), classes: new Set(), refs: [], effets: [] });
  maintenant = 1000; prochainVsync = 1000 + VSYNC;
  globalThis.__lot14 = {
    three: { vrai: VRAI_THREE, faux: { WebGLRenderer: FauxRendu } },
    react: { vrai: VRAI_REACT, faux: { useRef: (v) => { const r = { current: v }; E.refs.push(r); return r; }, useEffect: (f) => { E.effets.push(f); } } },
  };
  Object.defineProperty(globalThis, 'performance', { value: { now: () => maintenant }, configurable: true, writable: true });
  globalThis.window = { devicePixelRatio: 1 };
  globalThis.document = {
    hidden: false,
    documentElement: { classList: { contains: (c) => E.classes.has(c) } },
    addEventListener: (t, f) => E.ecoutes.set(t, f),
    removeEventListener: (t, f) => { if (E.ecoutes.get(t) === f) E.ecoutes.delete(t); },
  };
  let n = 0;
  globalThis.requestAnimationFrame = (f) => { E.demandes++; E.rafs.set(++n, f); return n; };
  globalThis.cancelAnimationFrame = (id) => { E.rafs.delete(id); };
  globalThis.ResizeObserver = class { observe() {} disconnect() {} };
  globalThis.IntersectionObserver = class { constructor(cb) { this.cb = cb; this.cibles = []; E.io.push(this); } observe(c) { this.cibles.push(c); } disconnect() { this.coupe = true; } };
  globalThis.MutationObserver = class { constructor(cb) { this.cb = cb; this.cibles = []; E.mo.push(this); } observe(c, o) { this.cibles.push([c, o]); } disconnect() { this.coupe = true; } };
  mock.timers.enable({ apis: ['setTimeout'] });
}
function desinstalle() { mock.timers.reset(); }

/** Le temps passe, à la milliseconde : minuteurs, puis l'écran à 130 Hz. */
function avance(ms) {
  for (let i = 0; i < ms; i++) {
    maintenant += 1;
    mock.timers.tick(1);
    if (maintenant >= prochainVsync) {
      prochainVsync += VSYNC;
      const dus = [...E.rafs.values()]; E.rafs.clear();
      dus.forEach((f) => f(maintenant));
    }
  }
}
const microtaches = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

let WeatherGL;
/** Monte l'hôte comme React le ferait : rendu, ref posée, effet lancé. */
async function monte() {
  WeatherGL ??= (await import(new URL('../src/wx3d.jsx', import.meta.url))).default;
  WeatherGL({ condition: 'rainy', hourEq: 12, intensity: 1 });
  const hote = { clientWidth: 800, clientHeight: 400, appendChild() {}, removeChild() {} };
  E.refs[0].current = hote;
  const nettoie = E.effets[0]();
  return { hote, nettoie, rendu: E.rendus[0] };
}
/** Monte, et laisse la compilation finir. */
async function monteCompile() {
  const m = await monte();
  if (m.rendu.journal.includes('compileAsync')) { m.rendu.compilee(); await microtaches(); }
  return m;
}
const voit = (oui) => { E.io.forEach((o) => o.cb([{ isIntersecting: oui, target: o.cibles[0] }])); };
/** La veille pose ou retire sa classe sur <html> : seuls ceux qui y regardent l'apprennent. */
const classeChange = () => {
  E.mo.filter((o) => !o.coupe && o.cibles.some(([c, opt]) => c === document.documentElement && opt?.attributes))
    .forEach((o) => o.cb([{ type: 'attributes', attributeName: 'class', target: document.documentElement }]));
};

/* ── wx3d ──────────────────────────────────────────────────────────────── */

test('sans compilation parallèle, pas de compileAsync : three le journaliserait à chaque affichage', async () => {
  /* Relecture du lot 14 : sans KHR_parallel_shader_compile (rendu logiciel,
   * GPU écarté), compileAsync n'apporte rien — le gel se reporte au premier
   * rendu — et three écrit « extension not supported » à CHAQUE montage. */
  installe();
  try {
    FauxRendu.parallele = false;
    const { rendu } = await monte();
    await microtaches();
    assert.ok(!rendu.journal.includes('compileAsync'), 'compileAsync sans l’extension : un avertissement de three par affichage de l’Accueil');
    avance(200);
    assert.ok(E.images >= 4, 'sans compilation à attendre, le ciel paraît aussitôt (' + E.images + ' image(s) en 200 ms)');
  } finally { desinstalle(); }
});

test('le shader se compile hors du fil principal AVANT la première image', async () => {
  installe();
  try {
    const { rendu } = await monte();
    assert.ok(rendu.journal.includes('compileAsync'), 'aucun compileAsync : le premier rendu compile, et fige l’interface à froid (2,2 à 4,7 s mesurés)');
    avance(300);
    assert.equal(E.images, 0, 'une image avant la fin de la compilation : c’est elle qui attend le pilote, sur le fil principal');
    rendu.compilee(); await microtaches();
    avance(200);
    assert.ok(E.images >= 4, 'la compilation finie, le ciel doit paraître (' + E.images + ' image(s) en 200 ms)');
  } finally { desinstalle(); }
});

test('la boucle demande une image par image dessinée, plus une au plus, et garde son plafond de 30/s', async () => {
  installe();
  try {
    await monteCompile();
    avance(200);
    const i0 = E.images, d0 = E.demandes;
    avance(3000);
    const images = E.images - i0, demandes = E.demandes - d0;
    assert.ok(images >= 75 && images <= 90, images + ' images en 3 s : le rythme d’origine (une par 33 ms au moins) a changé');
    assert.ok(demandes <= images * 2, demandes + ' rAF pour ' + images + ' images : la boucle réveille encore le navigateur à chaque rafraîchissement');
  } finally { desinstalle(); }
});

test('hors du cadre, plus rien ne se dessine ni ne se demande ; au retour, le ciel repart', async () => {
  installe();
  try {
    const { hote } = await monteCompile();
    assert.ok(E.io.some((o) => o.cibles.includes(hote)), 'personne n’observe l’hôte : le canevas défile hors de l’écran et continue de dessiner (22 images/s à top −1169)');
    avance(100);
    voit(false);
    avance(50); // une image déjà demandée peut tomber
    const i0 = E.images, d0 = E.demandes;
    avance(2000);
    assert.equal(E.images - i0, 0, 'des images dessinées hors du cadre');
    assert.equal(E.demandes - d0, 0, 'des rAF demandés hors du cadre');
    voit(true);
    avance(300);
    assert.ok(E.images - i0 >= 7, 'revenu dans le cadre, le ciel ne repart pas');
  } finally { desinstalle(); }
});

test('sous la veille et onglet caché, la boucle dort ; la fin de l’arrêt la relance', async () => {
  installe();
  try {
    await monteCompile();
    avance(100);
    E.classes.add('loggia-ambient-on'); classeChange();
    avance(50);
    let d0 = E.demandes, i0 = E.images;
    avance(2000);
    assert.equal(E.demandes - d0, 0, (E.demandes - d0) + ' rAF sous la veille : la boucle tourne à vide (138/s mesurés)');
    E.classes.delete('loggia-ambient-on'); classeChange();
    avance(300);
    assert.ok(E.images - i0 >= 7, 'la veille partie, le ciel ne repart pas : rien ne regarde la classe de <html>');

    document.hidden = true; E.ecoutes.get('visibilitychange')?.();
    avance(50);
    d0 = E.demandes; i0 = E.images;
    avance(2000);
    assert.equal(E.demandes - d0, 0, 'des rAF onglet caché');
    document.hidden = false;
    assert.equal(typeof E.ecoutes.get('visibilitychange'), 'function', 'rien n’écoute le retour de l’onglet : la boucle ne repartirait pas');
    E.ecoutes.get('visibilitychange')();
    avance(300);
    assert.ok(E.images - i0 >= 7, 'l’onglet revenu, le ciel ne repart pas');
  } finally { desinstalle(); }
});

test('le démontage rend le contexte, après avoir tout libéré, et coupe ses écoutes', async () => {
  installe();
  try {
    const { nettoie, rendu } = await monteCompile();
    avance(200);
    nettoie();
    const j = rendu.journal;
    assert.ok(j.includes('forceContextLoss'), 'le contexte reste au ramasse-miettes : jusqu’à 5 encore vivants sur la vue suivante');
    assert.ok(j.lastIndexOf('dispose') < j.indexOf('forceContextLoss'), 'perdu avant dispose(), le contexte ferait écrire « Context Lost » à three');
    assert.ok(E.io.every((o) => o.coupe) && E.mo.every((o) => o.coupe), 'un observateur survit au démontage');
    assert.equal(E.ecoutes.has('visibilitychange'), false, 'l’écoute de visibilité survit au démontage');
    const i0 = E.images, d0 = E.demandes;
    avance(1000);
    assert.equal(E.images - i0 + E.demandes - d0, 0, 'la boucle tourne encore après le démontage');
  } finally { desinstalle(); }
});

test('démonté pendant la compilation : rien ne se libère sous elle, tout part à sa fin', async () => {
  installe();
  try {
    const { nettoie, rendu } = await monte();
    assert.ok(rendu.journal.includes('compileAsync'), 'pas de compilation asynchrone');
    avance(100);
    nettoie();
    // three relit ses programmes toutes les 10 ms jusqu'à la fin : les libérer
    // ou perdre le contexte sous lui lèverait une erreur dans son minuteur.
    assert.deepEqual(rendu.journal, ['compileAsync'], 'libéré sous la compilation : ' + rendu.journal.join(', '));
    rendu.compilee(); await microtaches();
    avance(500);
    assert.ok(rendu.journal.includes('dispose') && rendu.journal.includes('forceContextLoss'), 'la compilation finie, le contexte n’est jamais rendu');
    assert.equal(E.images, 0, 'un hôte démonté a dessiné');
  } finally { desinstalle(); }
});

/* ── L'orbe : le même nettoyage, rien d'autre ──────────────────────────── */

test('l’orbe rend aussi son contexte, après dispose()', () => {
  const src = readFileSync(join(RACINE, 'src', 'orbe.jsx'), 'utf8');
  const d = src.indexOf('    dispose() {');
  assert.ok(d > 0, 'dispose() de l’orbe introuvable');
  const corps = src.slice(d, src.indexOf(NL + '    },', d));
  assert.ok(corps.includes('renderer.forceContextLoss();'), 'une ouverture de l’assistant, un contexte laissé au ramasse-miettes (4 vivants après 10 ouvertures)');
  assert.ok(corps.indexOf('renderer.dispose();') < corps.indexOf('renderer.forceContextLoss();'), 'le contexte se perd après dispose(), pas avant');
});
