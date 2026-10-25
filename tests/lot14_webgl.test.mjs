/* Lot 14 de l'audit du 03/10 : le fond météo et l'orbe, côté WebGL.
 *
 * Mesuré dans la démo (Chrome, écran à 130 Hz) avant la correction :
 *   - la boucle du ciel demandait une image à CHAQUE rafraîchissement
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
 * Le 17/10, le ciel a été remplacé par celui du handoff « Loggia themes
 * redesign » : un élément <loggia-ciel> en WebGL brut (src/ciel.js), sans
 * three. Son shader et ses particules viennent tels quels du handoff ; son
 * HÔTE garde tout ce qui précède, et ces tests le vérifient sur le vrai
 * élément, monté dans un navigateur réduit à ce qu'il touche : un faux
 * contexte WebGL qui compte ses images, un faux canevas 2D, le temps virtuel
 * (minuteurs simulés, rAF à 130 Hz, performance.now à la main). */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const NL = String.fromCharCode(10);

/* ── Le banc : un navigateur réduit à ce que touche le ciel ────────────── */
const E = {};
let maintenant = 0, prochainVsync = 0;
const VSYNC = 1000 / 130;

/** Un objet dont toute méthode inconnue ne fait rien ; les constantes GL valent leur nom. */
const souple = (connu) => new Proxy(connu, {
  get(t, k) {
    if (k in t) return t[k];
    if (typeof k === 'string' && /^[A-Z][A-Z0-9_]*$/.test(k)) return k;
    return () => undefined;
  },
  set(t, k, v) { t[k] = v; return true; },
});
const toile2d = () => souple({ createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }) });

function contexteGL() {
  const gl = souple({
    journal: [],
    getShaderPrecisionFormat: () => ({ precision: 23 }),
    getExtension: (n) => {
      if (n === 'WEBGL_lose_context') return { loseContext: () => gl.journal.push('loseContext') };
      if (n === 'KHR_parallel_shader_compile' && E.parallele) return { COMPLETION_STATUS_KHR: 'COMPLETION_STATUS_KHR' };
      return null;
    },
    getProgramParameter: (pr, p) => {
      gl.journal.push('programme:' + p);
      return p === 'COMPLETION_STATUS_KHR' ? E.compilee : true;
    },
    getShaderParameter: (s, p) => { gl.journal.push('shader:' + p); return true; },
    getUniformLocation: (pr, n) => n,
    getAttribLocation: () => 0,
    uniform1f: (u, v) => { E.uniformes[u] = v; },
    uniform3f: (u, x, y, z) => { E.uniformes[u] = [x, y, z]; },
    drawArrays: () => { E.images++; },
    deleteProgram: () => gl.journal.push('deleteProgram'),
    deleteBuffer: () => gl.journal.push('deleteBuffer'),
  });
  E.contextes.push(gl);
  return gl;
}

function canevas() {
  const c = { style: {}, width: 0, height: 0, retire: false };
  c.getContext = (t) => (t === 'webgl' ? contexteGL() : toile2d());
  c.remove = () => { c.retire = true; };
  return c;
}

class FauxElement {
  constructor() { this.attrs = new Map(); this.style = {}; this.dataset = {}; this.enfants = []; this.isConnected = false; this.clientWidth = 800; this.clientHeight = 400; }
  getAttribute(n) { return this.attrs.has(n) ? this.attrs.get(n) : null; }
  setAttribute(n, v) { const vieux = this.getAttribute(n); this.attrs.set(n, String(v)); if (this.attributeChangedCallback && this.constructor.observedAttributes.includes(n)) this.attributeChangedCallback(n, vieux, String(v)); }
  appendChild(c) { this.enfants.push(c); return c; }
  getBoundingClientRect() { return { top: 0, left: 0, right: 800, bottom: 400, width: 800, height: 400 }; }
}

const registre = new Map();
globalThis.HTMLElement = FauxElement;
globalThis.customElements = { get: (n) => registre.get(n), define: (n, c) => registre.set(n, c) };
globalThis.window = { devicePixelRatio: 1, matchMedia: () => ({ matches: false }) };
globalThis.document = {
  hidden: false,
  documentElement: { classList: { contains: (c) => E.classes.has(c) } },
  createElement: () => canevas(),
  addEventListener: (t, f) => E.ecoutes.set(t, f),
  removeEventListener: (t, f) => { if (E.ecoutes.get(t) === f) E.ecoutes.delete(t); },
  querySelectorAll: () => [],
};
globalThis.getComputedStyle = () => ({ getPropertyValue: (p) => (p === '--o-bg' ? E.fond : '') });
const stock = new Map();
globalThis.localStorage = { getItem: (k) => (stock.has(k) ? stock.get(k) : null), setItem: (k, v) => stock.set(k, String(v)), removeItem: (k) => stock.delete(k) };
Object.defineProperty(globalThis, 'performance', { value: { now: () => maintenant }, configurable: true, writable: true });
let n = 0;
globalThis.requestAnimationFrame = (f) => { E.demandes++; E.rafs.set(++n, f); return n; };
globalThis.cancelAnimationFrame = (id) => { E.rafs.delete(id); };
globalThis.ResizeObserver = class { constructor(cb) { this.cb = cb; E.ro.push(this); } observe() {} disconnect() { this.coupe = true; } };
globalThis.IntersectionObserver = class { constructor(cb) { this.cb = cb; this.cibles = []; E.io.push(this); } observe(c) { this.cibles.push(c); } disconnect() { this.coupe = true; } };
globalThis.MutationObserver = class { constructor(cb) { this.cb = cb; this.cibles = []; E.mo.push(this); } observe(c, o) { this.cibles.push([c, o]); } disconnect() { this.coupe = true; } };

await import(new URL('../src/ciel.js', import.meta.url));
const Ciel = registre.get('loggia-ciel');

function installe() {
  Object.assign(E, { parallele: true, compilee: false, contextes: [], images: 0, demandes: 0, rafs: new Map(), io: [], mo: [], ro: [], ecoutes: new Map(), classes: new Set(), uniformes: {}, fond: '#0b101b' });
  stock.clear();
  document.hidden = false;
  maintenant = 1000; prochainVsync = 1000 + VSYNC;
  mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
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

/** Monte le ciel comme le navigateur le ferait : attributs posés, puis branché. */
function monte(attrs = {}) {
  const el = new Ciel();
  const tous = { meteo: 'rainy', qualite: 'plein', ...attrs };
  for (const k in tous) el.attrs.set(k, tous[k]);
  el.isConnected = true;
  el.connectedCallback();
  return { el, gl: E.contextes[E.contextes.length - 1] };
}
/** Monte, et laisse la compilation finir. */
function monteCompile(attrs) { const m = monte(attrs); E.compilee = true; avance(40); return m; }
const demonte = (el) => { el.isConnected = false; el.disconnectedCallback(); };
const voit = (oui) => { E.io.forEach((o) => o.cb([{ isIntersecting: oui, target: o.cibles[0] }])); };
/** La veille pose ou retire sa classe sur <html> : seuls ceux qui y regardent l'apprennent. */
const classeChange = () => {
  E.mo.filter((o) => !o.coupe && o.cibles.some(([c, opt]) => c === document.documentElement && opt?.attributes))
    .forEach((o) => o.cb([{ type: 'attributes', attributeName: 'class', target: document.documentElement }]));
};

/* ── Le ciel ───────────────────────────────────────────────────────────── */

test('sans compilation parallèle, le ciel paraît aussitôt', () => {
  installe();
  try {
    E.parallele = false;
    monte();
    avance(200);
    assert.ok(E.images >= 8, 'sans compilation à attendre, le ciel paraît aussitôt (' + E.images + ' image(s) en 200 ms)');
  } finally { desinstalle(); }
});

test('le shader se compile hors du fil principal AVANT la première image', () => {
  installe();
  try {
    const { gl } = monte();
    avance(300);
    assert.equal(E.images, 0, 'une image avant la fin de la compilation : c’est elle qui attend le pilote, sur le fil principal');
    const bloquants = gl.journal.filter((j) => j === 'programme:LINK_STATUS' || j.startsWith('shader:'));
    assert.deepEqual(bloquants, [], 'une question au programme pendant sa compilation le fait attendre : ' + bloquants.join(', '));
    assert.ok(gl.journal.includes('programme:COMPLETION_STATUS_KHR'), 'personne ne demande si la compilation est finie');
    E.compilee = true;
    avance(200);
    assert.ok(E.images >= 8, 'la compilation finie, le ciel doit paraître (' + E.images + ' image(s) en 200 ms)');
  } finally { desinstalle(); }
});

test('la boucle demande UNE image à l’écran par image dessinée, et garde son plafond', () => {
  installe();
  try {
    monteCompile();
    avance(200);
    const i0 = E.images, d0 = E.demandes;
    avance(3000);
    const images = E.images - i0, demandes = E.demandes - d0;
    // « plein » : 60 images/s au plus (le handoff) ; l'écran en offre 130.
    assert.ok(images >= 120 && images <= 200, images + ' images en 3 s : le plafond de 60/s du niveau « plein » a changé');
    // À 60 images sur 130 Hz, « deux rAF par image » laisserait passer une boucle qui
    // demande CHAQUE rafraîchissement : le seuil est donc une demande par image.
    assert.ok(demandes <= images * 1.1, demandes + ' rAF pour ' + images + ' images : la boucle réveille encore le navigateur à chaque rafraîchissement');
  } finally { desinstalle(); }
});

test('« Léger » dessine moitié moins', () => {
  installe();
  try {
    monteCompile({ qualite: 'leger' });
    avance(200);
    const i0 = E.images;
    avance(3000);
    const images = E.images - i0;
    assert.ok(images >= 60 && images <= 100, images + ' images en 3 s : le niveau « léger » plafonne à 30/s');
  } finally { desinstalle(); }
});

test('hors du cadre, plus rien ne se dessine ni ne se demande ; au retour, le ciel repart', () => {
  installe();
  try {
    const { el } = monteCompile();
    assert.ok(E.io.some((o) => o.cibles.includes(el)), 'personne n’observe le ciel : il défile hors de l’écran et continue de dessiner (22 images/s à top −1169)');
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

test('sous la veille et onglet caché, la boucle dort ; la fin de l’arrêt la relance', () => {
  installe();
  try {
    monteCompile();
    avance(100);
    E.classes.add('loggia-ambient-on'); classeChange();
    avance(50);
    let d0 = E.demandes, i0 = E.images;
    avance(2000);
    assert.equal(E.demandes - d0, 0, (E.demandes - d0) + ' rAF sous la veille : la boucle tourne à vide (138/s mesurés)');
    assert.equal(E.images - i0, 0, 'des images sous la veille');
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

test('le démontage rend le contexte, après avoir tout libéré, et coupe ses écoutes', () => {
  installe();
  try {
    const { el, gl } = monteCompile();
    avance(200);
    demonte(el);
    const j = gl.journal;
    assert.ok(j.includes('loseContext'), 'le contexte reste au ramasse-miettes : jusqu’à 5 encore vivants sur la vue suivante');
    assert.ok(j.lastIndexOf('deleteProgram') < j.indexOf('loseContext') && j.lastIndexOf('deleteBuffer') < j.indexOf('loseContext'), 'programme et tampon doivent partir avant le contexte');
    assert.ok([...E.io, ...E.mo, ...E.ro].every((o) => o.coupe), 'un observateur survit au démontage');
    assert.equal(E.ecoutes.has('visibilitychange'), false, 'l’écoute de visibilité survit au démontage');
    assert.ok(el.enfants.every((c) => c.retire), 'les canevas restent dans l’élément démonté');
    const i0 = E.images, d0 = E.demandes;
    avance(1000);
    assert.equal(E.images - i0 + E.demandes - d0, 0, 'la boucle tourne encore après le démontage');
  } finally { desinstalle(); }
});

test('démonté pendant la compilation : rien ne se dessine, l’attente s’arrête, le contexte est rendu', () => {
  installe();
  try {
    const { el, gl } = monte();
    avance(100);
    demonte(el);
    const questions = gl.journal.filter((j) => j === 'programme:COMPLETION_STATUS_KHR').length;
    E.compilee = true;
    avance(500);
    assert.equal(gl.journal.filter((j) => j === 'programme:COMPLETION_STATUS_KHR').length, questions, 'l’attente de la compilation continue après le démontage');
    assert.ok(gl.journal.includes('loseContext'), 'le contexte n’est jamais rendu');
    assert.equal(E.images, 0, 'un ciel démonté a dessiné');
  } finally { desinstalle(); }
});

/* ── Ce que Loggia lui passe ───────────────────────────────────────────── */

test('le soleil suit le VRAI lever : à 7 h 48, levé si le jour commence à 7 h 30', () => {
  installe();
  try {
    // Le handoff a figé le 9 octobre (lever 8 h 06) : à 7 h 48, le soleil y serait encore couché.
    const a = monteCompile({ heure: '7.8' });
    assert.ok(E.uniformes.uSun[2] < 0, 'sans lever donné, le repli du handoff (8 h 06) : soleil couché');
    demonte(a.el);
    const { el } = monteCompile({ heure: '7.8', lever: '7.5', coucher: '19.2' });
    avance(100);
    assert.ok(E.uniformes.uSun[2] > 0, 'lever donné à 7 h 30 : à 7 h 48 le soleil doit être levé');
    el.setAttribute('lever', 'n’importe quoi');
    assert.deepEqual(el.soleil(), [], 'un lever illisible doit retomber sur le repli, pas sur NaN');
  } finally { desinstalle(); }
});

test('la couleur du fond se lit aussi en rgb() : le thème « Suivre HA » ne donne pas toujours #rrggbb', () => {
  installe();
  try {
    E.fond = 'rgb(240, 242, 245)';
    monteCompile();
    avance(100);
    const [r, g, b] = E.uniformes.uFond;
    assert.ok(r > 0.9 && g > 0.9 && b > 0.9, 'un fond clair en rgb() lu comme le bleu nuit de repli : le ciel se fondrait dans la mauvaise couleur');
  } finally { desinstalle(); }
});

test('quand personne ne regarde, le vent repart de presque rien (ticket #25)', () => {
  installe();
  try {
    const { el } = monteCompile();
    avance(100);
    el.drift = 5000; // une tablette murale après des jours de vent
    voit(false);
    assert.ok(el.drift < 10, 'la coordonnée du vent grandit sans fin : le float finit par manquer (voir wx3d_hash)');
    voit(true);
    const i0 = E.images;
    avance(200);
    assert.ok(E.images > i0, 'le ciel ne repart pas après la remise à zéro');
  } finally { desinstalle(); }
});

test('au téléphone, le fondu garde les proportions du bandeau de 440 px', () => {
  installe();
  try {
    /* Le handoff garde 250 px de ciel pur : à 304 px de haut (36vh d'un
     * téléphone), il ne restait que ~97 px pour fondre, contre ~213 avec
     * l'ancien ciel. « En bas c'est moins fondu qu'avant » (17/10). */
    const a = monte(); a.el.clientHeight = 304; E.compilee = true; avance(60);
    assert.ok(Math.abs(E.uniformes.uZone - (1 - 250 / 440)) < 1e-6, 'au téléphone, la zone du fondu se tasse sous 250 px de ciel pur (uZone = ' + E.uniformes.uZone + ')');
    demonte(a.el);
    const b = monte(); b.el.clientHeight = 528; avance(60);
    assert.ok(Math.abs(E.uniformes.uZone - (1 - 250 / 528)) < 1e-6, 'au-delà de 440 px, le ciel du handoff tel quel');
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
