/* Jouer un composant à la main, hooks compris (relecture finale du chantier Prises).
 *
 * `react-dom/server` (tests/rendu.mjs) donne le HTML d'un PREMIER rendu : ni
 * effets, ni gestes, ni second rendu. Impossible d'y appuyer sur une bascule et
 * de lire la question qui paraît, ni de voir une carte se redessiner quand son
 * capteur bouge. Ici, le composant est APPELÉ comme une fonction, avec un
 * répartiteur de hooks à nous — celui que posent les rendus « superficiels » :
 *  - l'état tient d'un rendu à l'autre, `useRef`, `useMemo` aussi ;
 *  - les effets se lancent après chaque rendu, dans l'ordre, avec leur nettoyage
 *    quand leurs dépendances changent (comme React) ;
 *  - un geste (`appuyer`) appelle le `onClick` / `onToggle` que l'arbre porte,
 *    puis rejoue rendus et effets jusqu'à ce que l'état se calme ;
 *  - un composant ENFANT n'est pas rendu : son élément reste dans l'arbre, avec
 *    ses props — on y lit ce qu'on lui passe, et on y appuie.
 * Les minuteurs et `document` se doublent par `horlogeFausse` et `documentFaux`.
 * Aucune dépendance de plus : le répartiteur est celui que React expose pour cet
 * usage, vérifié ci-dessous — si une version de React le retire, ce fichier le
 * dit tout de suite au lieu de laisser les tests promettre ce qu'ils ne tiennent plus. */
import React from 'react';

const INTERNES = React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
if (!INTERNES || !INTERNES.ReactCurrentDispatcher) {
  throw new Error('tests/crochets.mjs : React n’expose plus ReactCurrentDispatcher — réécrire ce harnais avant de lui faire confiance');
}

const memes = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => Object.is(x, b[i]));
let compteurId = 0;

/** Parcourt un arbre d'éléments — chaînes, tableaux, fragments, enfants de composants non rendus. */
export function parcourir(noeud, f) {
  if (noeud == null || typeof noeud !== 'object') return;
  if (Array.isArray(noeud)) { noeud.forEach(x => parcourir(x, f)); return; }
  f(noeud);
  parcourir(noeud.props && noeud.props.children, f);
}

/** Le texte d'un arbre, dans l'ordre (les composants enfants n'étant pas rendus, seuls leurs enfants comptent). */
export function texteDe(noeud) {
  let t = '';
  const aller = (n) => {
    if (n == null || typeof n === 'boolean') return;
    if (typeof n === 'string' || typeof n === 'number') { t += n; return; }
    if (Array.isArray(n)) { n.forEach(aller); return; }
    if (typeof n === 'object' && n.props) aller(n.props.children);
  };
  aller(noeud);
  return t;
}

/**
 * Monte `Comp` avec `props` : le rend, lance ses effets, et rend ce qu'ils ont changé.
 * Rend `{ arbre, trouver(pred), texte(), appuyer(el, geste = 'onClick', ...args), proprietes(props),
 * effets(), demonter(), rendus }`. `effets: false` : rien ne se lance de soi-même (`effets()` à la main).
 */
export function monter(Comp, props = {}, { effets: auto = true } = {}) {
  const crochets = [];
  let rang = 0;
  let sale = false;
  let arbre = null;
  let courantes = props;
  const m = { rendus: 0 };
  const emplacement = () => { const i = rang++; if (!crochets[i]) crochets[i] = {}; return crochets[i]; };
  const planifier = (c, f, deps) => { if (!('commite' in c) || !deps || !memes(c.commite, deps)) c.attente = { f, deps }; };
  const repartiteur = {
    useState(init) {
      const c = emplacement();
      if (!('v' in c)) c.v = typeof init === 'function' ? init() : init;
      if (!c.set) c.set = (x) => { const n = typeof x === 'function' ? x(c.v) : x; if (!Object.is(n, c.v)) { c.v = n; sale = true; } };
      return [c.v, c.set];
    },
    useReducer(reducteur, init, ini) {
      const c = emplacement();
      if (!('v' in c)) c.v = ini ? ini(init) : init;
      if (!c.set) c.set = (a) => { const n = reducteur(c.v, a); if (!Object.is(n, c.v)) { c.v = n; sale = true; } };
      return [c.v, c.set];
    },
    useRef(v) { const c = emplacement(); if (!c.ref) c.ref = { current: v }; return c.ref; },
    useMemo(f, deps) { const c = emplacement(); if (!c.deps || !deps || !memes(c.deps, deps)) { c.valeur = f(); c.deps = deps; } return c.valeur; },
    useCallback(f, deps) { const c = emplacement(); if (!c.deps || !deps || !memes(c.deps, deps)) { c.valeur = f; c.deps = deps; } return c.valeur; },
    useEffect(f, deps) { planifier(emplacement(), f, deps); },
    useLayoutEffect(f, deps) { planifier(emplacement(), f, deps); },
    useInsertionEffect() { emplacement(); },
    useImperativeHandle() { emplacement(); },
    useDebugValue() {},
    useContext(ctx) { return ctx._currentValue; },
    readContext(ctx) { return ctx._currentValue; },
    /* Un magasin extérieur (l'avance partagée d'optimiste.js, les carnets) : le composant s'y ABONNE, comme sous React, et une
     * publication le marque à redessiner — `appuyer` et `rendre` rejouent alors le rendu (seconde tranche des lumières, B2 :
     * la carte et la fiche lisent la même avance, posée hors de tout `useState`). Le même abonneur ne s'inscrit qu'une fois. */
    useSyncExternalStore(abonner, lire) {
      const c = emplacement();
      if (c.abonne !== abonner) {
        if (typeof c.cesser === 'function') c.cesser();
        c.abonne = abonner;
        c.cesser = typeof abonner === 'function' ? abonner(() => { sale = true; }) : null;
      }
      return lire();
    },
    useId() { const c = emplacement(); return c.id || (c.id = ':t' + (++compteurId) + ':'); },
    useTransition() { emplacement(); return [false, (f) => f()]; },
    useDeferredValue(v) { emplacement(); return v; },
  };

  const rendreUneFois = () => {
    const avant = INTERNES.ReactCurrentDispatcher.current;
    INTERNES.ReactCurrentDispatcher.current = repartiteur;
    rang = 0; sale = false;
    try { arbre = Comp(courantes); } finally { INTERNES.ReactCurrentDispatcher.current = avant; }
    m.rendus += 1;
  };
  const lancer = () => {
    for (const c of crochets) {
      if (!c.attente) continue;
      const { f, deps } = c.attente;
      c.attente = null;
      if (typeof c.nettoyage === 'function') c.nettoyage();
      c.nettoyage = f();
      c.commite = deps;
    }
  };
  // Rendus et effets rejoués jusqu'à ce que plus rien ne change — React fait de même, sans qu'on le voie.
  const stabiliser = () => {
    for (let tour = 0; tour < 25; tour++) {
      const aLancer = crochets.some(c => c.attente);
      if (sale) rendreUneFois();
      else if (aLancer) lancer();
      else return;
    }
    throw new Error('tests/crochets.mjs : le composant ne se calme pas (un effet qui change son propre état, sans fin ?)');
  };

  rendreUneFois();
  if (auto) stabiliser();
  // `arbre` est un accesseur : `Object.assign` en aurait copié la valeur d'alors, et l'arbre ne bougerait plus.
  Object.defineProperty(m, 'arbre', { get: () => arbre, enumerable: true });
  return Object.assign(m, {
    trouver(pred) { const out = []; parcourir(arbre, (e) => { if (pred(e)) out.push(e); }); return out; },
    texte() { return texteDe(arbre); },
    /** Appuie : appelle le geste de l'élément (avec un évènement de clic factice), puis laisse l'état se calmer. */
    appuyer(el, geste = 'onClick') {
      if (!el || !el.props || typeof el.props[geste] !== 'function') throw new Error('pas de ' + geste + ' sur cet élément');
      el.props[geste]({ stopPropagation() {}, preventDefault() {}, key: 'Enter' });
      stabiliser();
    },
    /** Le parent redessine la carte avec d'autres props. */
    proprietes(nouvelles) { courantes = { ...courantes, ...nouvelles }; rendreUneFois(); if (auto) stabiliser(); },
    /** Rendre de nouveau — un état extérieur a changé, un tic est passé. */
    rendre() { rendreUneFois(); if (auto) stabiliser(); },
    effets() { stabiliser(); },
    demonter() { for (const c of crochets) { if (typeof c.nettoyage === 'function') c.nettoyage(); c.nettoyage = null; if (typeof c.cesser === 'function') c.cesser(); c.cesser = null; c.abonne = null; } },
  });
}

/**
 * Des minuteurs qui ne tournent que sur demande : `installer()` remplace
 * `setTimeout`, `setInterval` et leurs `clear…` ; `avancer(ms)` fait passer le temps ;
 * `intervalles()` liste ceux qui tournent (`{ ms, f }`) ; `restaurer()` rend les vrais.
 */
export function horlogeFausse() {
  const vrais = { st: globalThis.setTimeout, ct: globalThis.clearTimeout, si: globalThis.setInterval, ci: globalThis.clearInterval };
  const taches = new Map();
  let suivant = 1, maintenant = 0;
  const poser = (f, ms, repete) => { const id = suivant++; taches.set(id, { f, ms: Math.max(0, Number(ms) || 0), repete, echeance: maintenant + Math.max(0, Number(ms) || 0) }); return id; };
  return {
    installer() {
      globalThis.setTimeout = (f, ms) => poser(f, ms, false);
      globalThis.setInterval = (f, ms) => poser(f, ms, true);
      globalThis.clearTimeout = globalThis.clearInterval = (id) => { taches.delete(id); };
    },
    restaurer() { globalThis.setTimeout = vrais.st; globalThis.clearTimeout = vrais.ct; globalThis.setInterval = vrais.si; globalThis.clearInterval = vrais.ci; },
    avancer(ms) {
      const but = maintenant + ms;
      for (;;) {
        const prochaine = [...taches.entries()].filter(([, t]) => t.echeance <= but).sort((a, b) => a[1].echeance - b[1].echeance)[0];
        if (!prochaine) break;
        const [id, t] = prochaine;
        maintenant = t.echeance;
        if (t.repete) t.echeance += Math.max(1, t.ms); else taches.delete(id);
        t.f();
      }
      maintenant = but;
    },
    intervalles() { return [...taches.values()].filter(t => t.repete).map(t => ({ ms: t.ms, f: t.f })); },
    attentes() { return [...taches.values()].filter(t => !t.repete).map(t => ({ ms: t.ms, f: t.f })); },
  };
}

/**
 * Un `window` et un `document` minimaux, le temps d'un test : ce que `getHass()` lit (l'élément
 * `home-assistant` et son `hass`, que `hass()` renvoie à chaque lecture — `suivre(f)` choisit d'où
 * il vient, le test le fait bouger), et les écouteurs du clavier (`emettre('keydown', { key: 'Escape' })`).
 * `restaurer()` retire tout.
 */
export function documentFaux({ hass = () => null } = {}) {
  const ecouteurs = new Map();
  let source = hass;
  const memoire = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, clear: () => m.clear() }; };
  const avant = { window: globalThis.window, document: globalThis.document };
  const doc = {
    activeElement: null,
    addEventListener: (type, f) => { if (!ecouteurs.has(type)) ecouteurs.set(type, new Set()); ecouteurs.get(type).add(f); },
    removeEventListener: (type, f) => { if (ecouteurs.has(type)) ecouteurs.get(type).delete(f); },
    querySelector: (s) => (s === 'home-assistant' ? { get hass() { return source(); } } : null),
  };
  return {
    /** Le `hass` que lira `getHass()` : une fonction, appelée à chaque lecture. */
    suivre(f) { source = f; },
    installer() {
      globalThis.window = { localStorage: memoire(), sessionStorage: memoire(), addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
        matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }), innerWidth: 1280, innerHeight: 800 };
      globalThis.document = doc;
    },
    restaurer() {
      if (avant.window === undefined) delete globalThis.window; else globalThis.window = avant.window;
      if (avant.document === undefined) delete globalThis.document; else globalThis.document = avant.document;
    },
    emettre(type, ev = {}) { [...(ecouteurs.get(type) || [])].forEach(f => f({ key: '', ...ev })); },
    ecouteurs: (type) => (ecouteurs.get(type) || new Set()).size,
  };
}
