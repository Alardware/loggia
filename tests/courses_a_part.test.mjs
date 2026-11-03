// La liste de courses à part des rappels (lot 11 Gladys, ADR 0315 ; D20, K1).
//
// Une liste d'achats n'a pas de dates : rangée avec les rappels, tout tombait
// dans « Plus tard ». Une liste de la plateforme `shopping_list` — reconnue à
// sa plateforme, jamais à son nom — a désormais sa carte : son nom, ce qui
// reste à acheter, un champ pour ajouter, la pastille pour cocher. Pas
// d'onglets. Ajouter et cocher ne partent que d'un geste.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { monter, horlogeFausse } from './crochets.mjs';

// La langue de la machine ne doit pas changer le résultat (garde-fou de la CI).
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);

const { setLoggiaState } = await import('../src/state.js');
const { listesTodo, lireTodo, rangerTodos, estCourses } = await import('../src/todos.js');
const R = await import('../src/rappelsrail.jsx');
const C = await import('../src/courses.jsx');
const { maisonCapteursDemo } = await import('../src/demo.js');
const lire = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const AUJ = new Date(2026, 10, 1, 14, 0, 0);
const ACHATS = 'todo.liste_achats';
const MAISON = 'todo.maison';
// Les plateformes, comme l'index du serveur les porte (`platform`).
const PLATEFORMES = { [ACHATS]: 'shopping_list', [MAISON]: 'local_todo' };
/* shopping_list : créer, supprimer, modifier, déplacer — jamais de date. */
const ETATS = {
  [ACHATS]: { state: '2', attributes: { friendly_name: 'Liste d’achats', supported_features: 1 | 2 | 4 | 8 } },
  [MAISON]: { state: '1', attributes: { friendly_name: 'Maison', supported_features: 1 | 2 | 4 | 16 | 32 } },
};

/** Pose l'index (plateformes), le temps de `f`. */
function avecIndex(plateformes, f) {
  const meta = new Map(Object.entries(plateformes).map(([id, platform]) => [id, { platform }]));
  setLoggiaState({ index: { entityMeta: meta } });
  try { return f(); } finally { setLoggiaState({ index: null }); }
}

const taches = (S) => {
  const L = Object.fromEntries(listesTodo(S).map(l => [l.id, l]));
  return [
    lireTodo({ uid: 'a1', summary: 'Lait', status: 'needs_action' }, L[ACHATS], AUJ),
    lireTodo({ uid: 'a2', summary: 'Pain', status: 'needs_action' }, L[ACHATS], AUJ),
    lireTodo({ uid: 'a3', summary: 'Café', status: 'completed' }, L[ACHATS], AUJ),
    lireTodo({ uid: 'm1', summary: 'Arroser les plantes', status: 'needs_action', due: '2026-11-01T18:00:00' }, L[MAISON], AUJ),
    lireTodo({ uid: 'm2', summary: 'Ranger le grenier', status: 'needs_action' }, L[MAISON], AUJ),
  ];
};
const hassDe = (S, appels = []) => ({ states: S, callService: (d, s, data) => { appels.push([d, s, data]); return Promise.resolve(); } });
const nomDe = (e) => e && e.type && (typeof e.type === 'function' ? e.type.name : e.type);

/* ════════════ QUELLE LISTE ════════════ */

test('la liste d’achats se reconnaît à sa plateforme `shopping_list`, jamais à son nom', () => {
  avecIndex(PLATEFORMES, () => {
    assert.equal(estCourses(ACHATS), true);
    assert.equal(estCourses(MAISON), false, 'une liste `local_todo` reste une liste de rappels');
    assert.deepEqual(listesTodo(ETATS).map(l => [l.id, l.courses]), [[ACHATS, true], [MAISON, false]]);
  });
  // Le même nom, une autre plateforme : ce n'est pas une liste d'achats.
  avecIndex({ [ACHATS]: 'local_todo' }, () => assert.equal(estCourses(ACHATS), false));
  // Sans index (avant la première réponse du serveur) : rien n'est une liste d'achats.
  assert.equal(estCourses(ACHATS), false);
  assert.ok(!/'todo\.|"todo\./.test(lire('src/courses.jsx')) && !lire('src/todos.js').includes("'todo.liste"), 'aucun identifiant en dur');
});

test('les articles ne tombent plus dans « Plus tard » : les onglets ne gardent que les rappels', () => {
  avecIndex(PLATEFORMES, () => {
    const r = rangerTodos(taches(ETATS), AUJ);
    assert.deepEqual(r.aujourdhui.map(t => t.titre), ['Arroser les plantes']);
    assert.deepEqual(r.plustard.map(t => t.titre), ['Ranger le grenier'], 'une tâche ordinaire sans date reste dans « Plus tard »');
    assert.deepEqual(r.demain, []);
  });
  // Sans plateforme connue, rien ne change par rapport à avant.
  assert.deepEqual(rangerTodos(taches(ETATS), AUJ).plustard.map(t => t.titre), ['Lait', 'Pain', 'Ranger le grenier']);
});

/* ════════════ LA CARTE DES RAPPELS ════════════ */

test('la carte des rappels pose les deux cartes, et chacune seulement si sa liste existe', () => {
  avecIndex(PLATEFORMES, () => {
    const props = { hass: hassDe(ETATS), taches: [], onFait: () => {}, onAjouter: () => {} };
    let m = monter(R.CarteRappels, props);
    assert.deepEqual(m.trouver(e => nomDe(e) === 'Rappels').length, 1);
    const cc = m.trouver(e => e.props && e.props.taches === props.taches && e.type && e.type.$$typeof);
    assert.equal(cc.length, 1, 'la carte des courses, chargée à la demande');
    assert.equal(cc[0].props.onAjouter, props.onAjouter, 'avec les gestes des rappels, qui relisent les listes');
    // Une maison sans autre liste : seulement celle des courses.
    m = monter(R.CarteRappels, { ...props, hass: hassDe({ [ACHATS]: ETATS[ACHATS] }) });
    assert.equal(m.trouver(e => nomDe(e) === 'Rappels').length, 0);
    assert.equal(m.trouver(e => e.type && e.type.$$typeof && e.props && e.props.taches).length, 1);
  });
  // Sans liste d'achats : la carte des rappels, et rien d'autre à charger.
  const m = monter(R.CarteRappels, { hass: hassDe(ETATS), taches: [] });
  assert.equal(m.trouver(e => nomDe(e) === 'Rappels').length, 1);
  assert.equal(m.trouver(e => e.type && e.type.$$typeof && e.props && 'taches' in e.props).length, 0);
});

test('le « + » des rappels n’écrit plus dans la liste d’achats', () => {
  // La carte relit l'heure chaque minute : des minuteurs à nous, sinon le test ne finirait pas.
  const h = horlogeFausse();
  h.installer();
  try { avecIndex(PLATEFORMES, () => {
    const m0 = monter(R.CarteRappels, { hass: hassDe(ETATS), taches: taches(ETATS), onAjouter: () => {} });
    const el = m0.trouver(e => nomDe(e) === 'Rappels')[0];
    const m = monter(el.type, el.props, { effets: false });
    assert.match(m.texte(), /1 à faire aujourd’hui/, 'le compte ne compte que les rappels');
    m.appuyer(m.trouver(e => e.props && e.props['aria-label'] === 'Nouveau rappel')[0]);
    const form = m.trouver(e => e.props && Array.isArray(e.props.listes))[0];
    assert.deepEqual(form.props.listes.map(l => l.id), [MAISON]);
  }); } finally { h.restaurer(); }
});

/* ════════════ LA CARTE DES COURSES ════════════ */

const carte = (S, extra = {}) => avecIndex(PLATEFORMES, () => {
  const L = listesTodo(S).find(l => l.id === ACHATS);
  return monter(C.CarteCourses, { hass: hassDe(S), liste: L, taches: taches(ETATS), onFait: () => {}, onAjouter: () => Promise.resolve(true), ...extra });
});

test('la carte des courses : son nom, ce qui reste à acheter, une pastille par article, pas d’onglets', () => {
  const m = carte(ETATS);
  const t = m.texte();
  assert.match(t, /Liste d’achats/, 'le nom que Home Assistant lui donne');
  assert.match(t, /2 articles à acheter/, 'l’article coché ne compte pas');
  assert.ok(!/Plus tard|Demain|Aujourd’hui/.test(t), 'pas d’onglets de dates');
  assert.equal(m.trouver(e => e.props && 'aria-pressed' in e.props).length, 0);
  const lignes = m.trouver(e => nomDe(e) === 'LigneRappel');
  assert.deepEqual(lignes.map(l => [l.props.t.titre, l.props.t.categorie, l.props.cochable]), [['Lait', '', true], ['Pain', '', true]],
    'la catégorie (le nom de la liste) n’est pas répétée sous chaque article');
  assert.deepEqual(C.articlesDe(taches(ETATS), MAISON).map(x => x.titre), ['Arroser les plantes', 'Ranger le grenier'], 'chaque carte ses articles');
});

test('rien à acheter : la carte le dit, et garde son champ', () => {
  const m = carte(ETATS, { taches: [] });
  assert.match(m.texte(), /Rien à acheter/);
  assert.equal(m.trouver(e => e.type === 'form').length, 1);
  assert.equal(m.trouver(e => nomDe(e) === 'LigneRappel').length, 0);
});

test('ajouter un article : le geste part sans date, le champ se vide ; un refus se dit', async () => {
  const recus = [];
  let reponse = true;
  const m = carte(ETATS, { onAjouter: (...a) => { recus.push(a); return Promise.resolve(reponse); } });
  const champ = () => m.trouver(e => e.type === 'input')[0];
  const form = () => m.trouver(e => e.type === 'form')[0];
  assert.equal(champ().props['aria-label'], 'Ajouter un article');
  // Un champ vide n'envoie rien.
  m.appuyer(form(), 'onSubmit');
  assert.deepEqual(recus, []);
  champ().props.onChange({ target: { value: '  Lait  ' } }); m.rendre();
  m.appuyer(form(), 'onSubmit');
  assert.deepEqual(recus, [[ACHATS, 'Lait']], 'deux arguments : ni jour ni heure');
  await new Promise(r => setImmediate(r)); m.rendre();
  assert.equal(champ().props.value, '', 'le champ se vide après l’ajout');
  reponse = false;
  champ().props.onChange({ target: { value: 'Pain' } }); m.rendre();
  m.appuyer(form(), 'onSubmit');
  await new Promise(r => setImmediate(r)); m.rendre();
  assert.match(m.texte(), /Home Assistant a refusé\./);
  assert.equal(champ().props.value, 'Pain', 'le texte refusé reste, pour réessayer');
});

test('une liste en lecture seule : ni champ, ni case', () => {
  const S = { ...ETATS, [ACHATS]: { ...ETATS[ACHATS], attributes: { ...ETATS[ACHATS].attributes, supported_features: 0 } } };
  const m = carte(S);
  assert.equal(m.trouver(e => e.type === 'form').length, 0);
  assert.ok(m.trouver(e => nomDe(e) === 'LigneRappel').every(l => l.props.cochable === false));
});

test('sous la carte des rappels, l’écart du rail ; seule, aucun', () => {
  avecIndex(PLATEFORMES, () => {
    const p = { taches: [], onFait: () => {}, onAjouter: () => {} };
    assert.deepEqual(C.default({ ...p, hass: hassDe(ETATS) }).map(e => e.props.ecart), [true]);
    assert.deepEqual(C.default({ ...p, hass: hassDe({ [ACHATS]: ETATS[ACHATS] }) }).map(e => e.props.ecart), [false]);
    assert.equal(C.default({ ...p, hass: hassDe(ETATS) })[0].props.onAjouter, p.onAjouter);
  });
});

test('aucune commande d’elle-même ; cocher et ajouter passent par `todo.update_item` et `todo.add_item`', async () => {
  const appels = [];
  const hass = hassDe(ETATS, appels);
  avecIndex(PLATEFORMES, () => {
    const L = listesTodo(ETATS).find(l => l.id === ACHATS);
    monter(C.CarteCourses, { hass, liste: L, taches: taches(ETATS), onFait: (t) => R.marquerFait(hass, t), onAjouter: (l, x) => R.ajouterTache(hass, l, x) });
  });
  assert.deepEqual(appels, [], 'monter la carte n’appelle rien');
  await R.ajouterTache(hass, ACHATS, 'Lait');
  await R.marquerFait(hass, taches(ETATS)[0]);
  assert.deepEqual(appels, [
    ['todo', 'add_item', { entity_id: ACHATS, item: 'Lait' }],
    ['todo', 'update_item', { entity_id: ACHATS, item: 'a1', status: 'completed' }],
  ]);
});

/* ════════════ LE DÉMARRAGE ET LA DÉMO ════════════ */

test('la carte des courses et le formulaire d’un rappel se chargent à la demande', () => {
  const rap = lire('src/rappelsrail.jsx');
  assert.ok(rap.includes("const CartesCourses = lazyRecharge(() => import('./courses.jsx'));"));
  assert.ok(rap.includes("const NouveauRappel = lazyRecharge(() => import('./nouveaurappel.jsx'));"));
  assert.ok(!/^import .*courses\.jsx/m.test(rap) && !/^import .*nouveaurappel\.jsx/m.test(rap), 'aucun import statique');
});

test('la démo porte une liste de courses : sa plateforme, des articles sans date, et « Demain » garde un rappel', () => {
  // Les listes sont posées à l'installation de la démo : on en pose une, l'index de la démo dit sa plateforme.
  const d = maisonCapteursDemo();
  d.states['todo.courses'] = { state: '2', attributes: { friendly_name: 'Courses' } };
  const e = d.index().entities.filter(x => x.id === 'todo.courses');
  assert.deepEqual(e.map(x => x.platform), ['shopping_list']);
  const src = lire('src/demo.js');
  assert.ok(src.includes("states['todo.courses'] = s('2', { friendly_name: etiquette('Courses'), supported_features: 1 | 2 | 4 | 8 });"),
    'une liste d’achats ne se date pas : ni 16 ni 32');
  assert.ok(src.includes("states['todo.maison'] = s('4',"), 'le compte suit les tâches de la liste');
  const bloc = src.slice(src.indexOf("    'todo.courses': ["), src.indexOf("    'todo.partagee': ["));
  assert.equal((bloc.match(/due: null/g) || []).length, 2, bloc);
  assert.match(src, /summary: etiquette\('Rappeler le garage'\), status: 'needs_action', due: h\(1, 10\)/);
});

test('les textes neufs ont leurs six langues', async () => {
  for (const l of ['en', 'de', 'es', 'it', 'nl', 'pl']) {
    const T = (await import('../src/langues/' + l + '.js')).default;
    for (const k of ['1 article à acheter', '{n} articles à acheter', 'Rien à acheter', 'Ajouter un article']) assert.ok(T[k], l + ' : ' + k);
  }
  assert.deepEqual(Object.keys((await import('../src/langues/pl.js')).default['{n} articles à acheter']), ['few', 'many', 'other']);
});
