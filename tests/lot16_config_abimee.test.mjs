// ─────────────────────────────────────────────────────────────────────────────
// Une configuration abîmée ne fait plus tomber l'écran, et ne perd rien en
// silence (lot 16, suite du point 10b de l'audit de Luna, 05/10).
//
// Le lot 16 avait gardé les lecteurs de `src/lectures.js`. Le contradicteur a
// trouvé trois trous de plus, tous rejoués dans la démo avant correction :
//  1. `useHass` fait `k.charAt(...)` sur chaque clé surveillée. `loggia_alarm:
//     7`, une caméra `haid: 5` : « k.charAt is not a function », levé dans un
//     effet — tout Loggia passe en page de secours, Paramètres compris ;
//  2. Paramètres relisait À LA MAIN `loggia_people`, `loggia_cameras`,
//     `loggia_climate` : `(cfgVal(...) || []).map(p => p.name)` sur un élément
//     `null`, et la vue d'où l'on répare tombait. En chemin, trois lecteurs
//     partagés faisaient tomber TOUT l'écran : `cfg.cams` et `secBaseKeys`
//     (une caméra `null`), `switchLightsCfg` (un objet à la place de la
//     liste), `medPlayers` (un `haid` qui n'est pas une chaîne) ;
//  3. `croqMeals` écarte, à raison pour la fiche, un repas dont seul `auto`
//     est abîmé. L'éditeur lisait par lui : le repas disparaissait du
//     formulaire, et le prochain « Enregistrer » l'effaçait — libellé et
//     grammes perdus sans un mot. Un repas sans heure aussi.
//     (05/10, ADR 0155 : l'éditeur de repas est parti avec la liste, qui n'est
//     plus un planning. La garantie reste : l'encart « Ancienne liste de
//     repas » montre le repas abîmé, et « Enregistrer » le RECOPIE tel quel.)
//
// Une configuration VALIDE rend et écrit exactement ce qu'elle rendait.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true });
const { composant, rendre } = await import('./rendu.mjs');
const { setLoggiaState, switchLightsCfg, medPlayers } = await import('../src/state.js');
const L = await import('../src/lectures.js');
const P = await import('../src/views/parametres.jsx');

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');

/** Serveur joignable : `cfgVal` ne descend pas dans le stockage local. */
const etat = (cfg = {}, ent = {}) => setLoggiaState({ cfg, ent, server: true });

/** Un morceau d'App.jsx, de `debut` jusqu'à `fin` compris, compilé et exécuté dans `portee`. */
function morceau(debut, fin, portee, rendu) {
  const d = APP.indexOf(debut);
  assert.ok(d >= 0, '« ' + debut + ' » introuvable');
  const f = APP.indexOf(fin, d);
  const js = transformSync(APP.slice(d, f + fin.length), { loader: 'jsx' }).code;
  const noms = Object.keys(portee);
  return new Function(...noms, js + '\nreturn ' + rendu + ';')(...noms.map(n => portee[n]));
}

/* ── 1. useHass : une garde unique ────────────────────────────────────────── */

/** `useHass` d'App.jsx, avec des crochets qui jouent l'effet tout de suite. */
function useHassJoue(hass) {
  const rendus = { force: 0, nettoie: null };
  const React = {
    useState: () => [0, () => { rendus.force++; }],
    useRef: () => ({ current: null }),
    useEffect: (fn) => { rendus.nettoie = fn(); },
  };
  const useHass = morceau('function useHass(', '\n}', {
    useState: React.useState, useRef: React.useRef, useEffect: React.useEffect,
    getHass: () => hass, HASS_POLL_MS: 2000, wattsDe: () => null,
    sigHash: (s) => s.length, setInterval: () => 1, clearInterval: () => {},
  }, 'useHass');
  return { useHass, rendus };
}

test('useHass : une clé qui n’est pas une chaîne ne fait plus tomber l’écran', () => {
  const hass = { connected: true, states: { 'light.salon': { state: 'on' }, 'automation.a': { state: 'on' } } };
  const { useHass, rendus } = useHassJoue(hass);
  // Ce que fabriquait `loggia_alarm: 7`, une caméra `haid: 5`, une personne
  // `haid: { … }` : des clés mêlées aux bonnes.
  assert.doesNotThrow(() => useHass([7, 'light.salon', null, { id: 'x' }, '', ['camera.a'], 'automation.', 5], [42, null]),
    'useHass lève sur une clé non chaîne : tout l’écran tombe');
  assert.equal(rendus.force, 1, 'le premier tic calcule sa signature et redessine, comme avant');
  assert.equal(typeof rendus.nettoie, 'function');
});

test('useHass : des clés valides se surveillent comme avant', () => {
  const hass = { connected: true, states: { 'light.salon': { state: 'on' } } };
  const { useHass, rendus } = useHassJoue(hass);
  assert.equal(useHass(['light.salon', 'automation.'], ['sensor.w']), hass);
  assert.equal(rendus.force, 1);
});

/* ── Les lecteurs partagés qui faisaient tomber TOUT l'écran ──────────────── */

test('une caméra null ne fait plus lever les clés de la sécurité, calculées à chaque rendu', () => {
  const cams = [null, 'x', 3, { haid: 'camera.entree', motion: 'binary_sensor.entree_mouvement' }];
  const secBaseKeys = morceau('const secBaseKeys = () => {', '\n};', {
    loggiaEnt: () => cams, peopleList: () => [{ haid: 'person.camille' }], secAlarm: () => 'alarm_control_panel.maison',
  }, 'secBaseKeys');
  assert.deepEqual(secBaseKeys(), ['alarm_control_panel.maison', 'camera.entree', 'binary_sensor.entree_mouvement', 'person.camille']);
  // Les clés de l'Accueil lisent `cfg.cams` pour TOUTES les vues : même garde.
  assert.match(APP, /cams: \(Array\.isArray\(cm\) && cm\.length\) \? cm\.filter\(c => c && typeof c === 'object'\) : \[\],/,
    '`cfg.cams` garde une caméra null : `c.haid` fait tomber tout l’écran');
});

test('switchLightsCfg : un objet à la place de la liste rend [], une liste valide ne change pas', () => {
  for (const v of [{ 0: 'switch.x' }, 'switch.x', 42, true]) {
    etat({ loggia_switchlights: v });
    assert.deepEqual(switchLightsCfg(), [], JSON.stringify(v));
  }
  etat({ loggia_switchlights: ['switch.lampe', '', null, 'switch.guirlande'] });
  assert.deepEqual(switchLightsCfg(), ['switch.lampe', 'switch.guirlande']);
});

test('medPlayers : un identifiant qui n’est pas une chaîne ne fait plus lever `.replace`', () => {
  etat({ loggia_medias: [null, { haid: 7 }, 'y', { haid: { id: 'x' } }, { haid: 'media_player.salon_sonos' }] });
  const m = medPlayers();
  assert.equal(m.length, 1);
  assert.equal(m[0].haid, 'media_player.salon_sonos');
  assert.equal(m[0].name, 'salon sonos', 'le nom par défaut se tire de l’identifiant, comme avant');
});

/* ── 2. Paramètres : la vue d'où l'on répare se rend ──────────────────────── */

const ViewEntSheet = await composant('views/parametres.jsx', 'ViewEntSheet');
const valeurs = (html) => [...html.matchAll(/<input\b[^>]*\bvalue="([^"]*)"/g)].map(m => m[1].replace(/&(amp|quot|#x27);/g, (_, e) => ({ amp: '&', quot: '"', '#x27': "'" })[e]));
/** Les textes affichés, un par ligne : l'encart de l'ancienne liste n'a pas de champ. */
// Découpé aux balises, entités décodées en une passe (CodeQL, 05/10).
const textes = (html) => html.split(/<[^>]*>|\n/).map(s => s.replace(/&(amp|quot|#x27);/g, (_, e) => ({ amp: '&', quot: '"', '#x27': "'" })[e]).trim()).filter(Boolean);
const fiche = (view) => rendre(ViewEntSheet, { view, hass: null, onClose: () => {} });

const REPAS_VALIDES = [
  { id: 'matin', time: '07:30', label: 'Repas du matin', g: 45, auto: 'input_boolean.repas_matin' },
  { id: 'soir', time: '19:00', label: 'Repas du soir', g: 45, auto: null },
];
const VALIDE = {
  loggia_people: [{ name: 'Camille', haid: 'person.camille' }],
  loggia_cameras: [{ id: 'cam_0', name: 'Entrée', online: true, haid: 'camera.entree' }],
  loggia_climate: [{ id: 'salon', name: 'Salon', room: 'Salon', haid: 'climate.salon', type: 'thermostat' }],
  loggia_medias: [{ name: 'Sonos', haid: 'media_player.salon_sonos' }],
  loggia_switchlights: ['switch.guirlande'],
  loggia_feeder: { haids: { reservoir: 'input_number.croquettes_reservoir' }, meals: REPAS_VALIDES },
};

test('Paramètres → Entités se rend avec des listes abîmées, et montre ce qui reste lisible', () => {
  etat({
    loggia_people: [null, { name: 'Camille', haid: 'person.camille' }, 3],
    loggia_cameras: [null, { name: 'Entrée', haid: 'camera.entree' }, 'x'],
    loggia_climate: [null, 4, { name: 'Salon', haid: 'climate.salon' }],
    loggia_medias: [null, { haid: 7 }, 'y', { name: 'Sonos', haid: 'media_player.salon_sonos' }],
    loggia_switchlights: { 0: 'switch.x' },
  });
  let accueil = '', objets = '';
  assert.doesNotThrow(() => { accueil = fiche('accueil'); }, 'une personne ou une caméra null fait tomber Paramètres');
  assert.doesNotThrow(() => { objets = fiche('objets'); }, 'un thermostat null, un lecteur sans identifiant ou une liste en objet font tomber Paramètres');
  for (const v of ['Camille', 'person.camille', 'Entrée', 'camera.entree']) assert.ok(valeurs(accueil).includes(v), v);
  for (const v of ['Salon', 'climate.salon', 'Sonos', 'media_player.salon_sonos']) assert.ok(valeurs(objets).includes(v), v);
  // Une liste qui n'en est pas une : la vue se rend, vide.
  for (const v of [{ 0: 'x' }, 'abc', 42]) {
    etat({ loggia_people: v, loggia_cameras: v, loggia_climate: v, loggia_medias: v, loggia_switchlights: v });
    assert.doesNotThrow(() => { fiche('accueil'); fiche('objets'); }, JSON.stringify(v));
  }
});

test('Paramètres → Entités : une configuration valide se lit comme avant', () => {
  etat(VALIDE);
  assert.deepEqual(valeurs(fiche('accueil')).filter(v => /Camille|person\.|Entrée|camera\./.test(v)), ['Camille', 'person.camille', 'Entrée', 'camera.entree']);
  const html = fiche('objets');
  const objets = valeurs(html);
  for (const v of ['switch.guirlande', 'Sonos', 'media_player.salon_sonos', 'Salon', 'climate.salon', 'input_number.croquettes_reservoir']) assert.ok(objets.includes(v), v);
  // Les repas ne sont plus des champs (ADR 0155) : l'encart les montre, heure et libellé.
  for (const v of ['07:30 · Repas du matin', '19:00 · Repas du soir']) assert.ok(textes(html).includes(v), v);
});

/* ── 3. Un repas abîmé ne se perd pas ─────────────────────────────────────── */
/* 05/10, ADR 0155 : l'ancienne liste n'a plus d'éditeur. Les garanties qui
 * portaient sur `croqRepasEdition` et `repasAEcrire` portent maintenant sur
 * son lecteur (`croqAncienneListe`, l'encart) et sur sa recopie
 * (`feederAEcrire`) : le repas abîmé se MONTRE, et « Enregistrer » le garde
 * tel quel — plus fort qu'avant, où il était réécrit champs vidés. */

const ABIMES = [
  ...REPAS_VALIDES,
  { id: 'midi', time: '12:00', label: 'Midi', g: 30, auto: 5 },
  { id: 'gouter', label: 'Goûter', g: '15', auto: 'input_boolean.gouter' },
  { id: 'nuit', time: 2330, label: { fr: 'Nuit' }, g: { n: 3 }, auto: { id: 'input_boolean.nuit' } },
  null, 3, 'soir', [],
];

/** Ce que « Enregistrer » écrit du distributeur, la clé relue comme dans `saveEnt`. */
const ecrireFeeder = (feeder) => { etat({ loggia_feeder: feeder }); return P.feederAEcrire({ feeder: P.feederEdition(feeder) }, feeder); };

test('croqAncienneListe : un repas valide se lit tel qu’il est écrit', () => {
  etat({ loggia_feeder: { meals: REPAS_VALIDES } });
  assert.deepEqual(L.croqAncienneListe(), REPAS_VALIDES.map(m => ({ heure: m.time, label: m.label, auto: m.auto, relie: false })));
});

test('croqAncienneListe : le repas abîmé reste, ses champs illisibles vides ; ce qui n’est pas un repas part', () => {
  etat({ loggia_feeder: { meals: ABIMES } });
  assert.deepEqual(L.croqAncienneListe(), [
    { heure: '07:30', label: 'Repas du matin', auto: 'input_boolean.repas_matin', relie: false },
    { heure: '19:00', label: 'Repas du soir', auto: null, relie: false },
    { heure: '12:00', label: 'Midi', auto: null, relie: false },
    { heure: '', label: 'Goûter', auto: 'input_boolean.gouter', relie: false },
    { heure: '', label: '', auto: null, relie: false },
  ]);
  for (const v of [null, 42, 'x', {}, { meals: 'x' }, { meals: { 0: {} } }]) {
    etat({ loggia_feeder: v });
    assert.deepEqual(L.croqAncienneListe(), [], JSON.stringify(v));
  }
});

test('l’encart montre le repas abîmé : il ne disparaît pas de Paramètres', () => {
  etat({ loggia_feeder: { haids: { reservoir: 'input_number.r' }, meals: ABIMES } });
  const t = textes(fiche('objets'));
  for (const x of ['12:00 · Midi', 'Goûter', '5 repas non reliés : ils ne distribuaient rien par eux-mêmes']) assert.ok(t.includes(x), x + ' : le repas abîmé a disparu de Paramètres');
  // La ligne d'un repas illisible n'est jamais vide, ni « [object Object] ».
  assert.ok(t.includes('—') && !t.some(s => s.includes('[object Object]')));
});

test('feederAEcrire : une configuration valide garde ses repas EXACTEMENT', () => {
  const ecrit = ecrireFeeder({ haids: { reservoir: 'input_number.r' }, meals: REPAS_VALIDES });
  assert.deepEqual(ecrit.meals, REPAS_VALIDES);
  assert.equal(ecrit.meals[0], REPAS_VALIDES[0], 'le repas est recopié, pas reconstruit');
});

test('feederAEcrire : un repas sans heure ou abîmé n’est plus effacé, une ligne vide part', () => {
  const brut = [
    { id: 'repas0', time: '07:30', label: 'Matin', g: 45, auto: null },
    { id: 'repas1', time: '', label: '', g: 0, auto: null },
    { id: 'repas2', time: null, label: 'Goûter', g: 15, auto: 'input_boolean.gouter' },
    { id: 'repas3', time: '', label: '', g: '0', auto: '' },
  ];
  // Des grammes à zéro, en nombre ou en texte, ne portent rien : la ligne blanche part.
  assert.deepEqual(ecrireFeeder({ haids: { reservoir: 'input_number.r' }, meals: brut }).meals, [brut[0], brut[2]]);
  const ecrit = ecrireFeeder({ haids: { reservoir: 'input_number.r' }, meals: ABIMES });
  assert.deepEqual(ecrit.meals, ABIMES.slice(0, 5), 'un repas abîmé s’efface au premier « Enregistrer »');
  // Relu : l'encart le remontre. Rien de perdu.
  etat({ loggia_feeder: ecrit });
  assert.deepEqual(L.croqAncienneListe()[3], { heure: '', label: 'Goûter', auto: 'input_boolean.gouter', relie: false });
});

test('« Enregistrer » recopie l’ancienne liste du magasin, plus rien ne la réécrit depuis un formulaire', () => {
  const src = readFileSync(join(RACINE, 'src', 'views', 'parametres.jsx'), 'utf8');
  assert.match(src, /const meals = ancienneListeBrute\(brut\);/);
  assert.match(src, /f\.portionWeight \|\| f\.appareil \|\| meals\.length \|\| associees\.length\)/);
  assert.doesNotMatch(src, /ent\.repas\.filter\(r => r\.time\)/, 'l’écriture qui effaçait un repas sans heure est revenue');
  assert.doesNotMatch(src, /repasAEcrire|ent\.repas\b/, 'l’ancienne liste se réécrit encore depuis le formulaire');
});

/* ── Contradicteur (05/10) : trois trous de plus ──────────────────────────── */

test('les lumières de la configuration : un élément null ou un objet ne font plus tomber l’écran', () => {
  // La ligne `lights:` du `cfg` d'App, telle quelle.
  const d = APP.indexOf('      lights: (');
  assert.ok(d >= 0, '`cfg.lights` lit encore la configuration sans garde');
  const seg = APP.slice(d, APP.indexOf('})(),', d) + 5).trim();
  const lights = (v) => new Function('cfgVal', transformSync('const o = {' + seg + '}; return o.lights;', { loader: 'js' }).code)(() => v);
  // Ce que font ensuite les clés de l'Accueil, à chaque rendu.
  const cles = (v) => lights(v).map(l => l.haid).filter(Boolean);
  for (const v of [[null, { haid: 'light.salon' }], { a: 1 }, 'light.x', 42]) assert.doesNotThrow(() => cles(v), JSON.stringify(v));
  assert.deepEqual(cles([null, 3, 'x', { haid: 'light.salon' }]), ['light.salon']);
  assert.deepEqual(cles([{ haid: 'light.salon' }, { haid: 'light.cuisine' }]), ['light.salon', 'light.cuisine'], 'une liste valide ne change pas');
});

test('peopleList : sans hass, une personne à l’identifiant non chaîne ne fait plus lever `.replace`', () => {
  const lire = (raw, hass) => morceau('function peopleList() {', '\n}', {
    getHass: () => hass, cfgVal: () => raw, LOGGIA_RESOLVED: null, personPicture: () => null,
  }, 'peopleList')();
  const abime = [{ haid: 5 }, { name: 'X', haid: { id: 'person.x' } }, null, { haid: 'person.camille' }];
  assert.doesNotThrow(() => lire(abime, null), 'avant la connexion, `p.haid.replace` fait tomber tout l’écran');
  assert.deepEqual(lire(abime, null), [{ name: 'camille', haid: 'person.camille', img: null }]);
  const hass = { states: { 'person.camille': { state: 'home' } } };
  assert.deepEqual(lire([{ name: 'Camille', haid: 'person.camille' }, { haid: 'person.parti' }], hass),
    [{ name: 'Camille', haid: 'person.camille', img: null }], 'une configuration valide ne change pas');
});

/** Un morceau de parametres.jsx, de `debut` jusqu'à `fin` compris. */
const PARAM = readFileSync(join(RACINE, 'src', 'views', 'parametres.jsx'), 'utf8');
const tranche = (debut, fin) => { const d = PARAM.indexOf(debut); assert.ok(d >= 0, '« ' + debut + ' » introuvable'); return PARAM.slice(d, PARAM.indexOf(fin, d) + fin.length); };

test('une zone de chauffage abîmée ne rend plus « Enregistrer » impossible', () => {
  // La lecture de l'éditeur, puis l'écriture de « Enregistrer », telles quelles.
  // Les aides de `useEntConfig` (`lignes`, `texte`), juste avant `readEnt`.
  const d = PARAM.indexOf('  const lignes = '), f = PARAM.indexOf('  const readEnt = () => ({', d);
  assert.ok(d >= 0 && f > d, 'les aides de lecture de l’éditeur sont introuvables');
  const aides = PARAM.slice(d, f);
  const lecture = tranche('climate: avecCle(lignes(', '}))),');
  const ecriture = tranche('loggia_climate: ent.climate', '        })),');
  const js = transformSync(aides + 'const lu = {' + lecture + '}; const ent = { climate: lu.climate }; return {' + ecriture + '};', { loader: 'js' }).code;
  const tour = (zones) => new Function('avecCle', 'cfgVal', 'loggiaEnt', js)((a) => a, () => zones, () => null).loggia_climate;
  let ecrit = null;
  assert.doesNotThrow(() => { ecrit = tour([null, { name: 5, haid: 'climate.bureau' }, { name: 'Salon', haid: { id: 'climate.salon' } }, { name: 'Chambre', haid: 'climate.chambre' }]); },
    'un nom en nombre ou une entité en objet font lever l’enregistrement de TOUTE la configuration');
  assert.deepEqual(ecrit.map(z => [z.name, z.haid]), [['5', 'climate.bureau'], ['Chambre', 'climate.chambre']]);
  // Une configuration valide s'écrit comme avant.
  const valide = [{ name: 'Salon', room: 'Salon', haid: 'climate.salon' },
    { name: 'Bureau', haid: 'switch.radiateur_bureau', tempCible: 'input_number.bureau_cible', modeEnt: 'input_select.bureau_mode', autoEnt: 'input_boolean.bureau_auto', tempSensor: 'sensor.bureau_temperature' }];
  assert.deepEqual(tour(valide), [
    { id: 'salon', name: 'Salon', room: 'Salon', haid: 'climate.salon', type: 'thermostat', tempCible: null, modeEnt: null, autoEnt: null, hasAuto: false, tempSensor: null },
    { id: 'bureau', name: 'Bureau', room: null, haid: 'switch.radiateur_bureau', type: 'pilot_wire', tempCible: 'input_number.bureau_cible', modeEnt: 'input_select.bureau_mode', autoEnt: 'input_boolean.bureau_auto', hasAuto: true, tempSensor: 'sensor.bureau_temperature' },
  ]);
});

test('l’éditeur montre une zone abîmée en texte, sans « [object Object] »', () => {
  etat({ loggia_climate: [{ name: 5, haid: { id: 'climate.salon' } }, { name: 'Chambre', haid: 'climate.chambre' }] });
  const v = valeurs(fiche('objets'));
  assert.ok(v.includes('5') && v.includes('Chambre') && v.includes('climate.chambre'));
  assert.ok(!v.includes('[object Object]'), 'une entité en objet s’affiche « [object Object] »');
});
