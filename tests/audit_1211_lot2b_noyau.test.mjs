// ─────────────────────────────────────────────────
// Ce qui trompe à l'usage, seconde moitié, le noyau (audit du 12/11, lot 2b) :
// B12, B14, B15, B16, B17, B18, B19, B30, B31.
//
// Joués quand un harnais le permet (fonctions pures, composants montés par
// tests/crochets.mjs) ; lus dans la source sinon. Le test de B16 change la
// langue de tout le fichier : il vient en DERNIER.
// ─────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { MONOLITHE } from './monolithe.mjs'; // App.jsx et ce qui en sort (ADR 0282)
import { monter, horlogeFausse, documentFaux } from './crochets.mjs';
import { ambiancePiece, phrasePiece } from '../src/ambiance.js';
import { vuePermise } from '../src/views.js';
import { cleJour } from '../src/agenda.js';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);
const { setLoggiaState } = await import('../src/state.js');
const ACC = await import('../src/accueil/briques.jsx');
const AGENDA = await import('../src/agendarail.jsx');
const { useDiscovery } = await import('../src/discovery.js');
const { AmbientOverlay } = await import('../src/ecranveille.jsx');
const { Fi } = await import('../src/ui.jsx');

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => readFileSync(join(RACINE, p), 'utf8').replace(/\r\n/g, '\n');
const fois = (texte, motif) => texte.split(motif).length - 1;
const tours = async (n = 40) => { for (let i = 0; i < n; i++) await Promise.resolve(); };

/* Le temps d'un test : de faux minuteurs, un faux `window` et l'état de Loggia vidé. */
async function dans(fn) {
  const h = horlogeFausse(), d = documentFaux();
  h.installer(); d.installer();
  setLoggiaState({ index: null, ent: {}, cfg: {}, resolved: null });
  try { return await fn(h, d); } finally { h.restaurer(); d.restaurer(); }
}

// ── B12 : la carte pièce juge le CO₂ au seuil de la pièce, sinon de la maison ──

test('B12 — la ligne d’une pièce suit le seuil qu’on lui donne ; sans lui, les 1 400 d’avant', () => {
  // La veille réglée à 1 000 : à 1 200, « À surveiller » et le rail parlaient, la carte disait « Tout est éteint ».
  assert.equal(ambiancePiece({ co2: 1200, seuil: 1000 }).texte, 'CO₂ élevé');
  assert.equal(ambiancePiece({ co2: 1200 }).niveau, 'calme', 'sans seuil, le palier d’avant');
  // Une pièce réglée à 1 800 : à 1 500, la carte criait seule.
  assert.equal(ambiancePiece({ co2: 1500, seuil: 1800 }).niveau, 'calme');
  assert.equal(phrasePiece({ co2: 1200, seuil: 1000 }).texte, 'CO₂ élevé · pensez à aérer', 'la phrase de la carte standard suit le même seuil');
  assert.equal(phrasePiece({ co2: 1500, seuil: 1800 }).niveau, 'calme');
  // Un seuil illisible ne fait pas crier la carte : `null` aurait donné `ppm >= 0`.
  for (const s of [null, undefined, 0, -5, 'abc']) assert.equal(ambiancePiece({ co2: 1200, seuil: s }).niveau, 'calme', 'seuil ' + String(s));
  assert.equal(ambiancePiece({ co2: 1450, seuil: null }).texte, 'CO₂ élevé');
});

const pieceCo2 = (live) => ({ name: 'Salon', room: 'Salon', status: { kind: 'calm', n: 0 }, live, tc: 'var(--o-accent)', rgb: '96,165,250', icon: createElement(Fi, { i: 'sofa' }) });
const eteinte = { id: 'light.salon', on: false };

for (const [nom, gabarit] of [['compacte', { chip: true }], ['standard', { compact: true }]]) {
  test('B12 (' + nom + ') — la carte montée lit le seuil de sa pièce, sinon celui de la maison', () => dans(() => {
    /* Ce que la carte dit : son texte, plus la phrase de la standard, confiée à `FlipText` (un enfant que le harnais ne rend
     * pas : on lit ce qu'on lui passe). */
    const carte = (live, seuilCo2) => {
      const m = monter(ACC.PieceCard, { ...gabarit, p: pieceCo2(live), lights: [eteinte], mains: [eteinte], onToggleLights: () => {}, onOpen: null, seuilCo2 });
      return m.texte() + ' ' + m.trouver(e => e.props && typeof e.props.text === 'string').map(e => e.props.text).join(' ');
    };
    assert.ok(carte({ co2: 1200, co2Seuil: null }, 1000).includes('CO₂ élevé'), 'la maison à 1 000 : 1 200 est élevé');
    assert.ok(!carte({ co2: 1200, co2Seuil: null }, null).includes('CO₂ élevé'), 'sans la veille : 1 400, comme avant');
    assert.ok(!carte({ co2: 1500, co2Seuil: 1800 }, 1000).includes('CO₂ élevé'), 'le seuil de la pièce passe avant celui de la maison');
    assert.ok(carte({ co2: 1900, co2Seuil: 1800 }, 3000).includes('CO₂ élevé'));
  }));
}

test('B12 — l’Accueil passe aux cartes le seuil de la maison qu’il calculait déjà pour le rail, une seule fois', () => {
  const d = lire('src/accueil/dashboard.jsx');
  assert.equal(fois(d, 'seuilCo2(veillesEtat)'), 1, 'un second calcul du seuil de la maison');
  assert.ok(d.includes('onOpen={() => onOpenRoom && onOpenRoom(p.name)} seuilCo2={co2Maison} />'), 'la carte ne reçoit plus le seuil de la maison');
  assert.ok(d.indexOf('const co2Maison = seuilCo2(veillesEtat);') < d.indexOf('const piecesGrid = ('), 'le seuil est calculé après la grille qui le lit');
  assert.ok(d.includes('a.rooms.filter(r => r.co2Id).map(r => ({ id: r.co2Id, piece: r.name, valeur: r.co2, seuil: r.co2Seuil })) : [], co2Maison);'), 'le rail ne lit plus le même seuil');
  const b = lire('src/accueil/briques.jsx');
  assert.ok(b.includes('const seuilPiece = (p.live && p.live.co2Seuil) || seuilCo2 || undefined;'));
  assert.equal(fois(b, 'co2: p.live && p.live.co2, seuil: seuilPiece })'), 3, 'compacte, standard et sa phrase');
});

// ── B14 : l'agenda du rail passe minuit ─────────────────────────────────────

test('B14 — la carte de l’agenda restée ouverte passe au lendemain à minuit', () => dans(() => {
  const VraieDate = Date;
  let maintenant = new VraieDate(2026, 10, 12, 23, 59).getTime();
  class DateFausse extends VraieDate {
    constructor(...a) { if (a.length) super(...a); else super(maintenant); }
    static now() { return maintenant; }
  }
  globalThis.Date = DateFausse;
  try {
    const m = monter(AGENDA.CarteAgenda, { evenements: [] });
    const bande = () => m.trouver(e => e.type === AGENDA.BandeJours)[0].props;
    assert.ok(m.texte().includes('Jeudi 12 novembre'), m.texte());
    assert.equal(bande().jours[0].getDate(), 12);
    maintenant = new VraieDate(2026, 10, 13, 0, 5).getTime();
    m.rendre(); // l'Accueil se redessine au moins chaque minute
    assert.ok(m.texte().includes('Vendredi 13 novembre'), 'le titre est resté sur la veille : ' + m.texte());
    assert.equal(bande().jours[0].getDate(), 13, 'la bande commence encore la veille');
    assert.equal(bande().choisi, cleJour(new VraieDate(2026, 10, 13)), 'le jour retenu n’est plus aujourd’hui');
  } finally { globalThis.Date = VraieDate; }
}));

test('B14 — la feuille de l’agenda et son mini-mois suivent la date, pas leur montage', () => {
  const f = lire('src/feuilleagenda.jsx');
  assert.equal(fois(f, 'const jourAuj = new Date().toDateString();'), 2);
  assert.ok(f.includes('const base = useMemo(() => new Date(jourAuj), [jourAuj]);'));
  assert.ok(f.includes('const jours = useMemo(() => joursAgenda(new Date(jourAuj)), [jourAuj]);'));
  assert.ok(!f.includes('new Date(new Date().toDateString())'), 'une date figée au montage est revenue');
  assert.ok(!lire('src/agendarail.jsx').includes('new Date(new Date().toDateString())'));
});

// ── B15 : la recherche, deux appareils du même nom ──────────────────────────

test('B15 — chaque résultat de la recherche porte sa clé, et la liste se range par elle', () => {
  const e = lire('src/chrome/entete.jsx');
  const debut = e.indexOf('function SearchSheet(');
  const corps = e.slice(debut, e.indexOf('\n}\n', debut));
  assert.ok(corps.includes('<div key={r.cle}>') && !e.includes("key={r.group + ':' + r.label}"), 'la clé de rendu est encore « groupe:libellé »');
  // Chaque `results.push` de la feuille commence par sa clé : un oubli rendrait `key={undefined}`.
  assert.ok(fois(corps, 'results.push({') >= 7);
  assert.equal(fois(corps, 'results.push({'), fois(corps, 'results.push({ cle: '), 'un résultat sans clé');
  for (const c of ["cle: 'piece:' + r,", "cle: 'vue:' + vid,", "cle: 'vue:' + h.vid,", "cle: 'cv:' + cv.id,", "cle: 'sc:' + s.id,", "cle: 'sec:' + id,", "cle: 'reg:' + o.id,"]) assert.ok(corps.includes(c), c);
  // Deux lampes « Plafonnier » : l'entity_id les sépare.
  assert.ok(e.includes("cle: 'ent:' + id, group: tr('Appareils'), label: nom, sub: id,"));
});

// ── B17 : un appareil ajouté pendant que la tablette reste ouverte ──────────

/* `useDiscovery` monté seul. Chaque chargement commence par `loggia/discovery` : on les compte. `rate` fait échouer
 * le chargement en entier (son `catch`), comme une découverte interrompue. */
function faussesInstallations({ rate = false } = {}) {
  const appels = [];
  const callWS = (m) => {
    appels.push(m.type);
    if (m.type === 'loggia/discovery') return rate ? Promise.resolve({ get index() { throw new Error('coupé'); } }) : Promise.reject(new Error('pas de composant'));
    return Promise.resolve([]);
  };
  const etats = (n) => { const S = {}; for (let i = 0; i < n; i++) S['sensor.s' + i] = { entity_id: 'sensor.s' + i, state: '1', attributes: {} }; return S; };
  return { chargements: () => appels.filter(t => t === 'loggia/discovery').length, hass: (n) => ({ states: etats(n), callWS }) };
}
const Sonde = ({ hass }) => useDiscovery(hass);

test('B17 — un nombre d’entités qui change relance la découverte 10 s plus tard ; un relevé ordinaire, jamais', () => dans(async (h) => {
  const f = faussesInstallations();
  const m = monter(Sonde, { hass: f.hass(3) });
  await tours();
  m.rendre();
  assert.equal(f.chargements(), 1, 'le chargement du départ');
  assert.equal(m.arbre.ready, true);
  // `hass` change d'identité toutes les 2 s, pas de nombre : rien ne se relit.
  for (let i = 0; i < 10; i++) { m.proprietes({ hass: f.hass(3) }); h.avancer(2000); }
  await tours();
  assert.equal(f.chargements(), 1, 'une découverte à chaque relevé');
  // Un appareil arrive : 10 s plus tard, et pas avant — les relevés suivants, au même nombre, ne réarment pas le délai.
  m.proprietes({ hass: f.hass(4) });
  for (let i = 0; i < 4; i++) { h.avancer(2000); m.proprietes({ hass: f.hass(4) }); }
  await tours();
  assert.equal(f.chargements(), 1, 'relu avant 10 s');
  h.avancer(2000);
  await tours();
  assert.equal(f.chargements(), 2, 'l’appareil ajouté n’a pas été découvert');
  // Le nouveau nombre est retenu : plus rien à relire.
  for (let i = 0; i < 10; i++) { m.proprietes({ hass: f.hass(4) }); h.avancer(2000); }
  await tours();
  assert.equal(f.chargements(), 2, 'la relance boucle');
  // Par vagues (Home Assistant qui démarre) : chaque nouveau nombre réarme le délai.
  m.proprietes({ hass: f.hass(5) });
  h.avancer(6000);
  m.proprietes({ hass: f.hass(6) });
  h.avancer(6000);
  await tours();
  assert.equal(f.chargements(), 2, 'une vague n’a pas réarmé le délai');
  h.avancer(4000);
  await tours();
  assert.equal(f.chargements(), 3);
  // Revenu au nombre chargé avant l'échéance : rien à relire.
  m.proprietes({ hass: f.hass(7) });
  h.avancer(3000);
  m.proprietes({ hass: f.hass(6) });
  h.avancer(20000);
  await tours();
  assert.equal(f.chargements(), 3, 'revenu au nombre chargé, la relecture est partie quand même');
  // Démontée, la carte n'attend plus rien.
  m.proprietes({ hass: f.hass(8) });
  m.demonter();
  assert.equal(h.attentes().length, 0, 'le minuteur survit au démontage');
  h.avancer(20000);
  await tours();
  assert.equal(f.chargements(), 3);
}));

test('B17 — un chargement raté retient son nombre : pas de boucle, et la découverte d’avant reste', () => dans(async (h) => {
  const erreur = console.error; console.error = () => {};
  try {
    const f = faussesInstallations({ rate: true });
    const m = monter(Sonde, { hass: f.hass(3) });
    await tours();
    m.rendre();
    assert.equal(f.chargements(), 1);
    assert.equal(m.arbre.echec, true, 'l’échec ne se dit plus');
    for (let i = 0; i < 10; i++) { m.proprietes({ hass: f.hass(3) }); h.avancer(2000); }
    await tours();
    assert.equal(f.chargements(), 1, 'un échec relance sans fin');
    m.proprietes({ hass: f.hass(4) });
    h.avancer(10000);
    await tours();
    assert.equal(f.chargements(), 2, 'un nouvel appareil relance aussi après un échec');
    for (let i = 0; i < 10; i++) { m.proprietes({ hass: f.hass(4) }); h.avancer(2000); }
    await tours();
    assert.equal(f.chargements(), 2, 'le second échec boucle');
    m.demonter();
  } finally { console.error = erreur; }
}));

test('B17 — la relance passe par le dernier `load`, sans s’abonner aux registres', () => {
  const s = lire('src/discovery.js');
  assert.ok(s.includes('loadRef.current = load;') && s.includes('if (aliveRef.current && loadRef.current) loadRef.current();'));
  assert.ok(s.includes('}, 10000);'));
  assert.ok(!/subscribeEvents|_registry_updated/.test(s), 'abonnement aux registres : non vérifié pour un compte ordinaire');
  // Les deux lectures de la source que d'autres tests épinglent restent.
  assert.ok(s.includes("console.error('Loggia : découverte interrompue', e);") && s.includes('ready: false, echec: true'));
});

// ── B18 : Apparence s'ouvre sur l'onglet du thème actif ─────────────────────

test('B18 — Apparence s’ouvre sur « Natifs » pour tout thème natif, « Communauté » pour les siens', () => {
  const p = lire('src/views/parametres.jsx');
  const liste = (nom) => JSON.parse(p.match(new RegExp('const ' + nom + ' = (\\[[^\\]]*\\]);'))[1].replace(/'/g, '"'));
  const NATIFS = liste('NATIFS'), COMMU = liste('COMMU');
  const ligne = "const [themeTab, setThemeTab] = useState(() => (COMMU.indexOf(loggiaTheme || '') >= 0 ? 'commu' : 'natifs'));";
  assert.ok(p.includes(ligne), 'l’onglet de départ ne lit plus `COMMU`');
  assert.ok(!p.includes("['', 'atrium', 'ios', 'google', 'neumorphix'].indexOf"), 'la liste écrite en dur est revenue');
  // La même expression, jouée sur chaque thème.
  const onglet = (loggiaTheme) => (COMMU.indexOf(loggiaTheme || '') >= 0 ? 'commu' : 'natifs');
  for (const t of NATIFS) assert.equal(onglet(t), 'natifs', t);
  for (const t of COMMU) assert.equal(onglet(t), 'commu', t);
  for (const t of ['projekt', 'saphir', 'acier', 'givre', null, 'theme-retire']) assert.equal(onglet(t), 'natifs', String(t));
});

// ── B19 : un profil restreint garde les vues que l'Accueil ouvre ────────────

test('B19 — `vuePermise` : Objets couvre ses quatre filtres, Volets son planning, Pièces chaque pièce', () => {
  const objets = new Set(['objets']);
  for (const v of ['objets', 'lumieres', 'climat', 'volets', 'medias', 'voletsplan', 'accueil', 'parametres']) assert.equal(vuePermise(v, objets), true, v);
  for (const v of ['pieces', 'room:Salon', 'scenes', 'energie', 'securite', 'systeme', 'cv:abc', 'biblio']) assert.equal(vuePermise(v, objets), false, v);
  const lumieres = new Set(['lumieres']);
  assert.equal(vuePermise('lumieres', lumieres), true, 'cochée seule');
  assert.equal(vuePermise('objets', lumieres), false, 'Lumières n’ouvre pas Objets');
  assert.equal(vuePermise('medias', lumieres), false);
  assert.equal(vuePermise('voletsplan', lumieres), false);
  assert.equal(vuePermise('voletsplan', new Set(['volets'])), true, 'le planning suit Volets');
  assert.equal(vuePermise('room:Cuisine', new Set(['pieces'])), true, 'une pièce suit Pièces');
  assert.equal(vuePermise('cv:abc', new Set(['cv:abc'])), true, 'une vue perso, cochée');
  assert.equal(vuePermise('scenes', null), true, 'sans restriction, tout');
  assert.equal(vuePermise(undefined, new Set(['objets'])), false);
});

test('B19 — l’admin peut accorder les quatre vues ; la garde et les deux menus lisent la même règle', () => {
  const p = lire('src/views/parametres.jsx');
  assert.ok(p.includes("['lumieres', tr('Lumières')], ['climat', tr('Climat')], ['volets', tr('Volets')], ['medias', tr('Médias')],"), 'les quatre vues manquent au choix de l’admin');
  const app = MONOLITHE; // App.jsx et ce qui en est sorti (tests/monolithe.mjs)
  assert.ok(app.includes('if (!vuePermise(view, vuesAutorisees)) setView(\'accueil\');'), 'la garde de la racine');
  assert.ok(!app.includes("base !== 'accueil' && base !== 'parametres' && !vuesAutorisees.has(base)"), 'l’ancienne garde est revenue');
  for (const f of ['src/chrome/barrelaterale.jsx', 'src/chrome/navmobile.jsx']) {
    const s = lire(f);
    assert.ok(s.includes('const permis = (vid) => vuePermise(vid, vuesAutorisees);'), f);
    assert.ok(!s.includes('vuesAutorisees.has('), f + ' : une seconde écriture de la règle');
  }
});

// ── B30 : l'écran de veille ne relit pas la maison à chaque seconde ─────────

test('B30 — la veille montée : un tic d’horloge ne relit ni les pièces ni le point ; un relevé, oui', () => dans(() => {
  const lectures = { n: 0 };
  const etats = (temp) => new Proxy({ 'sensor.ts': { entity_id: 'sensor.ts', state: temp, attributes: {} } }, {
    get(cible, cle) { if (cle === 'sensor.ts') lectures.n += 1; return cible[cle]; },
  });
  const rooms = [{ room: 'Salon', haid: { temp: 'sensor.ts' } }];
  const notifs = [];
  const m = monter(AmbientOverlay, { wx: 'clouds', wxFx: false, weatherTemp: 12, weatherLabel: '', ast: null, notifs, rooms, hass: { states: etats('21.4') } }, { effets: false });
  assert.ok(m.texte().includes('21,4°'), m.texte());
  const avant = lectures.n;
  assert.ok(avant > 0);
  for (let i = 0; i < 5; i++) m.rendre(); // cinq secondes d'horloge
  assert.equal(lectures.n, avant, 'chaque tic relit les états');
  m.proprietes({ hass: { states: etats('22.8') } });
  assert.ok(lectures.n > avant, 'un nouveau relevé n’est plus lu');
  assert.ok(m.texte().includes('22,8°'), m.texte());
  // L'alarme et les notifications entrent dans le point.
  m.proprietes({ ast: 'triggered' });
  assert.ok(m.texte().includes('Alarme déclenchée'));
  m.proprietes({ ast: null, notifs: [{ c: 'var(--o-bad)', t: 'Fuite', m: 'Cuisine' }] });
  assert.ok(m.texte().includes('Fuite · Cuisine') && !m.texte().includes('Alarme déclenchée'), m.texte());
}));

// ── B31 : un favori ne redessine plus l'application toutes les 2 s ──────────

test('B31 — un favori « chips » suit ses entités, un favori « air » ses capteurs d’air ; le reste ne bouge pas', () => {
  const app = MONOLITHE; // App.jsx et ce qui en est sorti (tests/monolithe.mjs)
  const debut = app.indexOf('  const cvAggKeys = (x) => {');
  const corps = app.slice(debut, app.indexOf('\n  };', debut) + 5);
  const CLASSES_AIR = JSON.parse(app.match(/const CLASSES_AIR = (\[[^\]]*\]);/)[1].replace(/'/g, '"'));
  let hass = null;
  const cvAggKeys = new Function('croqKeys', 'clesDeLaBorne', 'plantKeys', 'climateKeys', 'enKeys', 'cvId', 'getHass', 'CLASSES_AIR', corps + '\nreturn cvAggKeys;')(
    () => ['croq'], () => ['borne'], () => ['plante'], () => ['zone'], () => ['energie'], (x) => (typeof x === 'string' ? x : x && x.id), () => hass, CLASSES_AIR);
  assert.deepEqual(cvAggKeys({ t: 'chips', ids: ['light.salon', 'sensor.co2'] }), ['light.salon', 'sensor.co2'], 'la rangée suit encore toute la maison');
  assert.deepEqual(cvAggKeys({ t: 'chips' }), [], 'sans entités, rien à suivre');
  hass = { states: {
    'sensor.co2_salon': { state: '700', attributes: { device_class: 'carbon_dioxide' } },
    'sensor.cov': { state: '80', attributes: { device_class: 'volatile_organic_compounds' } },
    'sensor.cov_ppb': { state: '80', attributes: { device_class: 'volatile_organic_compounds_parts' } },
    'sensor.pm': { state: '6', attributes: { device_class: 'pm25' } },
    'sensor.hum': { state: '47', attributes: { device_class: 'humidity' } },
    'sensor.puissance': { state: '120', attributes: { device_class: 'power' } },
    'sensor.sans_classe': { state: '1', attributes: {} },
    'binary_sensor.co2': { state: 'on', attributes: { device_class: 'carbon_dioxide' } },
  } };
  assert.deepEqual(cvAggKeys({ t: 'air' }), ['sensor.co2_salon', 'sensor.cov', 'sensor.cov_ppb', 'sensor.pm', 'sensor.hum'], 'la qualité d’air suit tout `sensor.`');
  hass = null;
  assert.deepEqual(cvAggKeys({ t: 'air' }), [], 'sans Home Assistant, rien');
  // Ce que B31 ne touche pas.
  assert.deepEqual(cvAggKeys({ t: 'presence' }), ['person.']);
  assert.deepEqual(cvAggKeys({ t: 'ouvrants' }), ['binary_sensor.']);
  assert.deepEqual(cvAggKeys({ t: 'activite' }), ['binary_sensor.', 'cover.', 'vacuum.', 'lawn_mower.', 'lock.']);
  assert.deepEqual(cvAggKeys('obj:feeder'), ['croq']);
  assert.deepEqual(cvAggKeys('light.salon'), ['light.salon']);
  // Les classes suivies sont exactement celles que la carte lit (`airDe`).
  const g = lire('src/cartescustom/galerie.jsx');
  const air = g.slice(g.indexOf('const airDe = (S) => {'), g.indexOf('\n};', g.indexOf('const airDe = (S) => {')));
  const lues = [...air.matchAll(/par\(\[([^\]]*)\]\)/g)].flatMap(x => JSON.parse('[' + x[1].replace(/'/g, '"') + ']'));
  assert.deepEqual([...new Set(lues)].sort(), [...CLASSES_AIR].sort(), 'la carte Qualité air lit une classe que le poll ne suit pas');
});

// ── B16 : changer de langue (EN DERNIER : la langue change pour tout le fichier) ──

test('B16 — l’arrivée du catalogue demandé redessine la racine, sans attendre un relevé', () => dans(async (h, d) => {
  h.restaurer(); // le chargement du catalogue est un vrai import
  const recus = [];
  globalThis.window.dispatchEvent = (e) => { recus.push({ type: e.type, langue: e.detail && e.detail.langue }); return true; };
  const I18N = await import('../src/i18n.js');
  assert.equal(I18N.langue(), 'fr');
  I18N.preparerLangue({ language: 'de' }); // UN seul appel : c'est l'arrivée du fichier qui doit parler
  assert.equal(I18N.langue(), 'fr', 'le catalogue n’est pas encore là : le français en attendant');
  for (let i = 0; i < 200 && !recus.length; i++) await new Promise(r => setTimeout(r, 10));
  assert.deepEqual(recus.filter(e => e.type === 'loggia-langue-prete'), [{ type: 'loggia-langue-prete', langue: 'de' }], 'aucune annonce à l’arrivée du catalogue');
  assert.equal(I18N.langue(), 'de');
  const s = lire('src/i18n.js');
  assert.equal(fois(s, "window.dispatchEvent(new CustomEvent('loggia-langue-prete'"), 3, 'l’annonce, chaque fois dans un `try`');
  assert.ok(MONOLITHE.includes("window.addEventListener('loggia-langue-prete', f);"), 'la racine n’écoute plus l’annonce');
}));
