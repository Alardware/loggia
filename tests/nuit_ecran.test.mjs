/* « Nuit de l'écran » : Non ou Soleil, réglage de l'appareil (ADR 0287).
 *
 * Une tablette murale qui n'éclaire pas la pièce la nuit. Ce qui se vérifie :
 *  1. le choix : Non par défaut, retenu par l'APPAREIL, et l'intensité ;
 *  2. la nuit : `sun.sun` d'abord, puis le soleil calculé à la position de la
 *     maison, puis 21 h à 7 h ;
 *  3. les classes et le niveau posés au démarrage, avant le rendu, et le suivi
 *     de la minute qui ne part que sur Soleil ;
 *  4. les deux lignes des Paramètres : sous « Verre des cartes », alignées,
 *     sans `retrait`, et « Assombrir » grisée tant que la nuit est sur Non ;
 *  5. le CSS : un voile qui laisse passer les clics, la photo plus sombre, un
 *     passage doux, et rien sur l'écran de veille.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { composant, rendre } from './rendu.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');

// Un stockage d'appareil, une racine dont on lit les classes, et un Home Assistant que l'on règle.
const magasin = new Map();
const stockage = {
  getItem: (k) => (magasin.has(k) ? magasin.get(k) : null),
  setItem: (k, v) => { magasin.set(k, String(v)); },
  removeItem: (k) => { magasin.delete(k); },
  clear: () => magasin.clear(),
  key: (i) => [...magasin.keys()][i] ?? null,
  get length() { return magasin.size; },
};
Object.defineProperty(globalThis, 'localStorage', { value: stockage, configurable: true, writable: true });
const classes = new Set();
const attributs = new Map();
const racine = {
  classList: { toggle: (c, on) => { if (on) classes.add(c); else classes.delete(c); return on; }, contains: (c) => classes.has(c), add: (c) => classes.add(c), remove: (c) => classes.delete(c) },
  setAttribute: (k, v) => attributs.set(k, String(v)),
  getAttribute: (k) => attributs.get(k) ?? null,
};
const ha = { hass: null };
Object.defineProperty(globalThis, 'document', { value: { documentElement: racine, querySelector: (s) => (s === 'home-assistant' ? ha : null) }, configurable: true, writable: true });
const session = { getItem: () => 'apparence', setItem: () => {}, removeItem: () => {} };
const rien = () => {};
const fenetre = {
  localStorage: stockage, sessionStorage: session, location: { search: '', href: 'http://loggia.test/', pathname: '/' },
  addEventListener: rien, removeEventListener: rien, dispatchEvent: () => true, innerWidth: 1280, innerHeight: 800,
  matchMedia: () => ({ matches: false, addEventListener: rien, removeEventListener: rien }),
};
fenetre.top = fenetre; // la page directe : `getHass` lit le document lui-même
Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: fenetre });
globalThis.sessionStorage = session;

const N = await import('../src/nuitecran.js');
const S = await import('../src/soleilcalc.js');

const poser = (o) => { magasin.clear(); for (const [k, v] of Object.entries(o)) magasin.set(k, v); };
const soleil = (etat, attrs = {}) => ({ states: { 'sun.sun': { state: etat, attributes: attrs } } });
const PARIS = { config: { latitude: 48.85, longitude: 2.35 }, states: {} };
const a = (h, m = 0, mois = 9, jour = 29) => new Date(2026, mois, jour, h, m);

test('sans réglage, Non : rien ne change pour qui ne touche à rien', async () => {
  const P = await import('../src/views/parametres.jsx');
  poser({});
  assert.equal(N.lireNuit(), 'non');
  assert.equal(P.lireAssombrir(), 'moyen', 'l’intensité par défaut');
  classes.clear();
  N.poserNuit(racine, soleil('below_horizon'));
  assert.equal(classes.has('loggia-nuit'), false, 'Non : pas de nuit, même soleil couché');
  assert.equal(classes.has('loggia-nuit-sol'), false, 'Non : pas même la transition armée');
  poser({ 'loggia-nuit': 'toujours', 'loggia-nuit-assombrir': 'enorme' });
  assert.equal(N.lireNuit(), 'non', 'une valeur inconnue retombe sur Non');
  assert.equal(P.lireAssombrir(), 'moyen', 'une intensité inconnue retombe sur Moyen');
  // Sur la racine, une valeur inconnue passe telle quelle : les variables CSS retombent sur Moyen (leur repli).
  N.poserNuit(racine, null);
  assert.equal(attributs.get('data-nuit'), 'enorme');
});

test('la nuit se lit sur `sun.sun` quand Home Assistant le donne, quelle que soit l’heure', () => {
  assert.equal(N.soleilCouche(soleil('below_horizon'), a(12)), true);
  assert.equal(N.soleilCouche(soleil('above_horizon'), a(23)), false);
  // `sun.sun` prime sur la position et sur les heures fixes.
  assert.equal(N.soleilCouche({ ...PARIS, ...soleil('above_horizon') }, a(2)), false);
});

test('sans `sun.sun`, le soleil calculé à la position de la maison — chargé à la demande', async () => {
  // Avant que le calcul n'arrive : les heures fixes, et le chargement part.
  assert.equal(N.soleilCouche(PARIS, a(19, 30)), false, 'en attendant, 21 h – 7 h');
  await N.chargerCalcul(PARIS);
  for (const h of [PARIS, { ...PARIS, states: { 'sun.sun': { state: 'unavailable' } } }]) {
    assert.equal(N.soleilCouche(h, a(13)), false, '13 h à Paris, fin octobre : jour');
    assert.equal(N.soleilCouche(h, a(3)), true, '3 h : nuit');
    assert.equal(N.soleilCouche(h, a(19, 30)), true, '19 h 30 fin octobre : nuit — les heures fixes diraient jour');
    assert.equal(N.soleilCouche(h, a(7, 30)), true, '7 h 30 fin octobre : pas encore levé à Paris');
  }
  // Le calcul est celui de `sunInfo` (App.jsx) : Paris, 21 juin, lever vers 3 h 47 et coucher vers 19 h 58 en temps universel.
  const d = a(12, 0, 5, 21), c = S.coursSoleil(PARIS, d), tu = d.getTimezoneOffset() / 60;
  assert.ok(Math.abs(c.lever + tu - 3.78) < 0.5, 'lever ' + (c.lever + tu));
  assert.ok(Math.abs(c.coucher + tu - 19.96) < 0.5, 'coucher ' + (c.coucher + tu));
  assert.equal(S.coursSoleil({ config: {} }), null, 'sans position, pas de course du soleil');
  assert.equal(S.coursSoleil(null), null);
  assert.equal(N.chargerCalcul({ config: {} }) !== null, true, 'déjà chargé : la même promesse');
});

test('sans soleil ni position, de 21 h à 7 h', () => {
  for (const h of [null, { states: {} }, { config: { latitude: '48' }, states: {} }]) {
    assert.equal(N.soleilCouche(h, a(20, 59)), false);
    assert.equal(N.soleilCouche(h, a(21)), true);
    assert.equal(N.soleilCouche(h, a(6, 59)), true);
    assert.equal(N.soleilCouche(h, a(7)), false);
  }
});

test('Soleil : les classes et le niveau sur la racine, la nuit seulement', () => {
  classes.clear(); attributs.clear();
  poser({ 'loggia-nuit': 'soleil', 'loggia-nuit-assombrir': 'beaucoup' });
  N.poserNuit(racine, soleil('below_horizon'));
  assert.equal(classes.has('loggia-nuit-sol'), true);
  assert.equal(classes.has('loggia-nuit'), true);
  assert.equal(attributs.get('data-nuit'), 'beaucoup');
  N.poserNuit(racine, soleil('above_horizon'));
  assert.equal(classes.has('loggia-nuit'), false, 'le jour, plus de voile');
  assert.equal(classes.has('loggia-nuit-sol'), true, 'mais la transition reste armée : le retour sera doux');
  // Sans argument, c'est le Home Assistant de la page qu'elle lit (`getHass`, state.js).
  ha.hass = soleil('below_horizon');
  N.poserNuit();
  assert.equal(classes.has('loggia-nuit'), true);
  ha.hass = null;
});

/* Avant tout appel de `suivreNuit` : le minuteur du module n'existe pas encore. */
test('le démarrage pose la nuit à l’import du thème, avant tout rendu, et suit la minute sur Soleil seulement', async () => {
  poser({ 'loggia-nuit': 'soleil', 'loggia-nuit-assombrir': 'peu' });
  classes.clear(); attributs.clear();
  ha.hass = soleil('below_horizon');
  const delais = [];
  const vrai = globalThis.setTimeout;
  globalThis.setTimeout = (f, ms) => { delais.push(ms); const t = vrai(f, ms); t.unref(); return t; };
  try { await composant('theme.js'); } finally { globalThis.setTimeout = vrai; ha.hass = null; }
  assert.equal(classes.has('loggia-nuit'), true, 'theme.js n’a pas posé la nuit en se chargeant');
  assert.equal(attributs.get('data-nuit'), 'peu');
  assert.deepEqual(delais.filter(d => d === 6e4), [6e4], 'une relecture dans la minute');
  const theme = lire('src', 'theme.js');
  assert.match(theme, /\nsuivreNuit\(\);\n/, 'l’appel est au niveau du module');
  assert.ok(theme.indexOf('suivreNuit();') < theme.indexOf('function applyLook'), 'avant applyLook');
  // Le module ne tire que state.js, déjà au démarrage : ni React, ni le ciel.
  assert.deepEqual([...lire('src', 'nuitecran.js').matchAll(/^import .* from '([^']+)';$/gm)].map(m => m[1]), ['./state.js']);
  assert.ok(lire('src', 'nuitecran.js').includes("import('./soleilcalc.js')"), 'le calcul du soleil reste hors du démarrage');
  // Le thème n'est pas forcé en foncé : son clair / foncé se décide dans App.jsx (ADR 0287).
  assert.ok(!/nuit/i.test(theme.slice(theme.indexOf('export function applyTheme'))), 'applyTheme ne lit pas la nuit');
});

test('le choix est retenu par l’APPAREIL, et la racine suit sur-le-champ', async () => {
  const ecrireNuit = await composant('views/parametres.jsx', 'ecrireNuit');
  const ecrireAssombrir = await composant('views/parametres.jsx', 'ecrireAssombrir');
  poser({}); classes.clear(); attributs.clear();
  ha.hass = soleil('below_horizon');
  ecrireNuit('soleil');
  assert.equal(magasin.get('loggia-nuit'), 'soleil', 'dans le stockage local, comme le « Verre des cartes »');
  assert.equal(classes.has('loggia-nuit'), true);
  ecrireAssombrir('peu');
  assert.equal(magasin.get('loggia-nuit-assombrir'), 'peu');
  assert.equal(attributs.get('data-nuit'), 'peu');
  ecrireAssombrir('moyen');
  assert.equal(magasin.has('loggia-nuit-assombrir'), false, 'Moyen efface la clé : le défaut n’est pas écrit');
  assert.equal(attributs.get('data-nuit'), 'moyen');
  ecrireNuit('non');
  assert.equal(magasin.has('loggia-nuit'), false, 'Non efface la clé');
  assert.equal(classes.has('loggia-nuit') || classes.has('loggia-nuit-sol'), false);
  ha.hass = null;
  // Ni le profil ni la configuration commune : les clés ne sont écrites que là.
  const src = lire('src', 'views', 'parametres.jsx') + lire('src', 'nuitecran.js');
  assert.ok(!/cfgSet\([^)]*(CLE_NUIT|CLE_ASSOMBRIR|loggia-nuit)/.test(src) && !/poserApparence\([^)]*nuit/.test(src));
  assert.ok(!/LOGGIA_SYNC_KEYS = \[[^\]]*loggia-nuit/.test(lire('src', 'state.js')), 'la clé ne voyage pas avec la maison');
});

test('Non : aucun minuteur ; il s’arrête de lui-même quand on repasse à Non', async () => {
  // Le module, chargé à neuf : le minuteur du démarrage ci-dessus n'existe pas ici.
  const M = await import('../src/nuitecran.js?neuf');
  const delais = [];
  const vrai = globalThis.setTimeout;
  globalThis.setTimeout = (f, ms) => { delais.push([f, ms]); return { unref: rien }; };
  try {
    poser({});
    M.suivreNuit();
    assert.equal(delais.length, 0, 'Non : rien ne tourne');
    poser({ 'loggia-nuit': 'soleil' });
    M.suivreNuit();
    assert.deepEqual(delais.map(d => d[1]), [6e4], 'Soleil : une relecture par minute');
    M.suivreNuit();
    assert.equal(delais.length, 1, 'un seul minuteur à la fois');
    poser({});
    delais[0][0]();
    assert.equal(delais.length, 1, 'repassé à Non : le minuteur ne se relance pas');
  } finally { globalThis.setTimeout = vrai; }
});

test('les lignes des Paramètres : sous « Verre des cartes », alignées, Non / Soleil, « Assombrir » grisée sur Non', async () => {
  const PAR = lire('src', 'views', 'parametres.jsx');
  const verre = PAR.indexOf("<OptRow title={tr('Verre des cartes')} desc={descVerre}>");
  const nuit = PAR.indexOf("<OptRow title={tr('Nuit de l’écran')} desc={descNuit(nuit, hass)}>");
  const asb = PAR.indexOf("<OptRow eteint={nuit !== 'soleil'} title={tr('Assombrir')}");
  const veille = PAR.indexOf("<OptRow title={tr('Écran de veille')}");
  assert.ok(verre > 0 && nuit > verre && asb > nuit && veille > asb, 'sous « Verre des cartes », avant l’écran de veille');
  assert.ok(!/<OptRow[^>]*retrait[^>]*title=\{tr\('(Nuit de l’écran|Assombrir)'\)\}/.test(PAR), 'sans `retrait` : alignées sur les autres');

  poser({});
  const { setLoggiaState } = await import('../src/state.js');
  setLoggiaState({ cfg: {} });
  const Par = await composant('views/parametres.jsx', 'ParametresContent');
  const rendu = () => rendre(Par, { hass: { states: {}, user: { is_admin: true } }, isAdmin: true, onLook: () => {} });
  const ligne = (html, titre) => {
    const i = html.indexOf('>' + titre + '</div>');
    assert.ok(i > 0, titre + ' absent du rendu');
    const d = html.lastIndexOf('<div class="o-optrow"', i);
    const f = html.indexOf('<div class="o-optrow"', i);
    return html.slice(d, f > 0 ? f : undefined);
  };
  const style = (s) => s.slice(0, s.indexOf('>')).replace(/opacity:[^;"]*;?/, '');
  const opacite = (s) => (s.slice(0, s.indexOf('>')).match(/opacity:([^;"]*)/) || [])[1];
  const choix = (s) => [...s.matchAll(/<button[^>]*aria-pressed="(true|false)"[^>]*>([^<]*)<\/button>/g)].map(m => [m[2], m[1]]);

  let html = rendu();
  const n = ligne(html, 'Nuit de l’écran'), s = ligne(html, 'Assombrir'), v = ligne(html, 'Verre des cartes'), plage = ligne(html, 'Plage horaire');
  assert.equal(style(n), style(v), 'la ligne n’a pas l’alignement de « Verre des cartes »');
  assert.equal(style(s), style(v), '« Assombrir » n’a pas l’alignement de « Verre des cartes »');
  assert.notEqual(style(n), style(plage), 'témoin : une ligne en retrait se distingue');
  assert.ok(n.includes('role="group" aria-label="Nuit de l’écran"') && s.includes('role="group" aria-label="Assombrir"'), 'les groupes portent leur nom');
  assert.deepEqual(choix(n), [['Non', 'true'], ['Soleil', 'false']]);
  assert.deepEqual(choix(s), [['Un peu', 'false'], ['Moyen', 'true'], ['Beaucoup', 'false']]);
  assert.equal(opacite(s), '0.5', 'Non : « Assombrir » grisée');
  assert.equal(opacite(n), '1');
  assert.ok(n.includes('Assombrit cet écran la nuit, pour ne pas éclairer la pièce'));

  poser({ 'loggia-nuit': 'soleil', 'loggia-nuit-assombrir': 'beaucoup' });
  html = rendu();
  assert.deepEqual(choix(ligne(html, 'Nuit de l’écran')), [['Non', 'false'], ['Soleil', 'true']]);
  assert.deepEqual(choix(ligne(html, 'Assombrir')), [['Un peu', 'false'], ['Moyen', 'false'], ['Beaucoup', 'true']]);
  assert.equal(opacite(ligne(html, 'Assombrir')), '1', 'Soleil : « Assombrir » se rallume');
});

test('la ligne dit l’heure : le coucher de ce soir, le lever s’il fait nuit, sinon 21 h–7 h', async () => {
  const descNuit = await composant('views/parametres.jsx', 'descNuit');
  assert.equal(descNuit('non', null), 'Assombrit cet écran la nuit, pour ne pas éclairer la pièce');
  const jour = soleil('above_horizon', { next_setting: new Date(2026, 9, 29, 17, 41).toISOString(), next_rising: new Date(2026, 9, 30, 7, 12).toISOString() });
  assert.equal(descNuit('soleil', jour, a(12)), 'Du coucher au lever du soleil · ce soir dès 17:41');
  const nuit = soleil('below_horizon', { next_setting: new Date(2026, 9, 30, 17, 40).toISOString(), next_rising: new Date(2026, 9, 30, 7, 12).toISOString() });
  assert.equal(descNuit('soleil', nuit, a(22)), 'Du coucher au lever du soleil · cette nuit jusqu’à 07:12');
  // Sans `sun.sun`, le calcul ; sans rien, les heures fixes.
  assert.match(descNuit('soleil', PARIS, a(12)), /^Du coucher au lever du soleil · ce soir dès 1[78]:\d\d$/);
  assert.equal(descNuit('soleil', null, a(12)), 'Sans soleil connu : de 21:00 à 07:00');
  for (const lg of ['en', 'de', 'nl', 'it', 'es', 'pl']) {
    const cat = lire('src', 'langues', lg + '.js');
    for (const k of ['Nuit de l’écran', 'Assombrit cet écran la nuit, pour ne pas éclairer la pièce', 'Du coucher au lever du soleil · cette nuit jusqu’à {h}',
      'Du coucher au lever du soleil · ce soir dès {h}', 'Du coucher au lever du soleil', 'Sans soleil connu : de {debut} à {fin}', 'Assombrir',
      'Un voile sur tout l’écran ; la photo de fond baisse aussi', 'Un peu', 'Beaucoup', 'Non', 'Soleil', 'Moyen']) {
      assert.ok(cat.includes("  '" + k + "': "), lg + ' : « ' + k + ' » manque');
    }
  }
});

test('en CSS : un voile qui laisse passer les clics, la photo plus sombre, un passage doux, rien sur la veille', () => {
  const css = lire('src', 'index.css');
  const regles = css.split('\n').filter(l => /^html(\.loggia-nuit|\[data-nuit)/.test(l));
  const de = (sel) => regles.find(l => l.startsWith(sel + ' {')) || '';
  const voile = (n) => +(de(`html[data-nuit="${n}"]`).match(/--o-nuit-voile: ([.\d]+)/) || [])[1];
  assert.deepEqual(['peu', 'moyen', 'beaucoup'].map(voile), [.15, .3, .45], 'environ 15, 30 et 45 %');
  const pseudo = de('html.loggia-nuit-sol body::after');
  for (const p of ['position: fixed', 'inset: 0', 'pointer-events: none', 'opacity: 0', 'transition: opacity 4s']) assert.ok(pseudo.includes(p), 'le voile : ' + p);
  assert.match(de('html.loggia-nuit body::after'), /opacity: var\(--o-nuit-voile/);
  assert.match(de('html.loggia-nuit-sol .o-fond-photo'), /transition: filter 4s/);
  assert.match(de('html.loggia-nuit .o-fond-photo'), /filter: brightness\(var\(--o-nuit-photo/);
  // En verre Léger, la photo garde son flou : l'assombrissement s'y ajoute, il ne le remplace pas.
  assert.match(de('html.loggia-nuit.loggia-verre-leger .o-fond-photo'), /filter: blur\(16px\) saturate\(1\.35\) brightness\(var\(--o-nuit-photo/);
  // L'écran de veille a son propre voile de nuit : le nôtre s'en retire, sans transition (le pseudo-élément disparaît).
  assert.match(de('html.loggia-nuit-sol body:has(.o-sombre[style*="position: fixed"])::after'), /content: none/);
  assert.ok(lire('src', 'ecranveille.jsx').includes('<div className="o-sombre" style={{ position: \'fixed\', inset: 0, zIndex: 500,'), 'la racine de la veille n’est plus l’îlot sombre fixe que le CSS reconnaît');
  // Aucune couleur hors du noir du voile ; aucune règle hors des classes de nuit.
  assert.ok(!regles.some(l => /#[0-9a-f]{3,8}\b|rgba?\(/i.test(l.split('background: #000;').join(''))), 'une couleur en dur dans les règles de la nuit');
  assert.ok(!/^(body|\.o-fond-photo)[^\n]*--o-nuit/m.test(css));
});
