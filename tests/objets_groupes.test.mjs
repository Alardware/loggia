/* Objets › Capteurs, étapes 2 et 3 du chantier Capteurs : les groupes à la place des binaires, les plantes découvertes.
 *
 * Ce qui est garanti ici (tâche 2) :
 *  - C20, C21 : un binaire d'une famille de groupe qui ne peut pas y entrer — sans appareil, sur un service, une vigilance
 *    météo — ne fait plus de carte, ni sous « Tous » ni sous « Capteurs » ; un binaire d'aucune famille garde la sienne ;
 *  - C29 : une plante découverte a sa carte, `plant:{base}`, son nom et sa pièce ; ses capteurs n'en font pas d'autre ; le
 *    composeur et `nomDeCle` passent par la même liste.
 * `objetsDeLaMaison` et `nomDeCle` vivent dans App.jsx : sous `?objets_groupes`, un crochet de chargement leur ajoute un export. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';

import { indexOf } from './fixtures.mjs';
import { statsObjets, pucesObjets, compteObjets, poidsObjet, domaineEdition } from '../src/objets.js';
import { maisonGroupes, maisonPlantes, fusion } from './maison_capteurs.mjs';

import { MONOLITHE } from './monolithe.mjs'; // App.jsx et ce qui en sort (ADR 0282)
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);
register('data:text/javascript,' + encodeURIComponent([
  'export async function load(url, ctx, next) {',
  "  if (!url.endsWith('/src/App.jsx?objets_groupes')) return next(url, ctx);",
  "  const r = await next(url.slice(0, -'?objets_groupes'.length), ctx);",
  // Tâche 9 : ce que les sections jugent (`jugerObjet`), la vue d'une mesure et la règle du dehors, pour jouer les sections.
  // Passe bis (17/10, point 5) : l'enveloppe vivante, pour compter ses rendus.
  "  return { ...r, source: String(r.source) + ';export { objetsDeLaMaison, nomDeCle, jugerObjet, estDehors, vueMesure, SectionsCapteursVive };' };",
  '}',
].join('\n')));
const { monter, horlogeFausse, documentFaux } = await import('./crochets.mjs');
const { setLoggiaState } = await import('../src/state.js');
const F = await import(new URL('../src/App.jsx?objets_groupes', import.meta.url).href);
const CS = await import('../src/capteurssections.jsx');
const APP = MONOLITHE;

const PLANTES = [{ base: 'sensor.ficus', name: 'Ficus lyrata', room: 'Séjour', img: 'dracaena' }, { base: 'sensor.basilic', name: 'Basilic', room: 'Cuisine' }];
function avecMaison(f, { plantes = PLANTES } = {}) {
  const fx = fusion(maisonGroupes(), maisonPlantes());
  setLoggiaState({ index: indexOf(fx), ent: {}, cfg: { loggia_rooms: [{ room: 'Séjour' }, { room: 'Chambre' }, { room: 'Cuisine' }, { room: 'Bureau' }], loggia_plants: plantes }, resolved: null });
  try { return f(fx, F.objetsDeLaMaison({ states: fx.states }, [], new Set())); } finally { setLoggiaState({ index: null, ent: {}, cfg: {}, resolved: null }); }
}

test('C20, C21 : un binaire d’une famille de groupe qui ne peut pas y entrer ne fait plus de carte ; un binaire d’aucune famille garde la sienne', () => avecMaison((fx, objets) => {
  const ids = new Set(objets.map(o => o.id));
  for (const id of ['binary_sensor.porte_cave', 'binary_sensor.ficus_besoin_eau', 'binary_sensor.monstera_besoin_eau', 'binary_sensor.fumee_en_ligne'])
    assert.ok(!ids.has(id), id + ' : ni sous « Tous », ni sous « Capteurs »');
  // ASSERTION MODIFIÉE (chantier Capteurs, étapes 2 et 3, tâche 8 ; C28) : la vigilance météo garde sa carte, dans Dehors — MeteoAlarm sans appareil, une vigilance sur un appareil.
  assert.deepEqual(objets.filter(o => o.vigilance).map(o => o.cle), ['binary_sensor.meteoalarm', 'binary_sensor.vigilance_appareil'], 'la vigilance a sa carte, sous son identifiant');
  assert.ok(ids.has('binary_sensor.lave_linge_vibration'), 'une vibration, d’aucune famille, garde sa carte');
}));

test('C29 : une plante découverte a sa carte — plant:{base}, son nom, sa pièce ; ses capteurs n’en font pas d’autre', () => avecMaison((fx, objets) => {
  const plantes = objets.filter(o => o.type === 'plant').map(o => [o.cle, o.nom, o.piece, o.filtres[0]]);
  assert.deepEqual(plantes, [
    ['plant:sensor.basilic', 'Basilic', 'Cuisine', 'capteurs'],
    ['plant:sensor.ficus', 'Ficus lyrata', 'Séjour', 'capteurs'],
    ['plant:sensor.capteur_plante_7f3e', 'Monstera', 'Bureau', 'capteurs'],
    ['plant:sensor.orchidee', 'Orchidée', 'Séjour', 'capteurs'],
  ]);
  assert.ok(!objets.some(o => o.id && /^sensor\.(ficus|capteur_plante_7f3e|orchidee)_/.test(o.id)), 'ses capteurs restent à la plante');
  // Le composeur et nomDeCle passent par la même liste.
  assert.equal(F.nomDeCle(fx.states, 'plant:sensor.capteur_plante_7f3e'), 'Monstera');
  assert.equal(F.nomDeCle(fx.states, 'plant:sensor.ficus'), 'Ficus lyrata');
  const d = APP.indexOf('\nfunction ComposeurCartes(');
  const comp = APP.slice(d, APP.indexOf('\n}\n', d));
  assert.ok(comp.includes('plantesDeLaMaison(S).forEach(p => {') && !comp.includes('plantsCfg()'), 'le composeur propose les plantes découvertes');
}));

/* ── Tâche 9 : les groupes remplacent les binaires dans Objets ; Maison et son « à regarder » (C20, C25, § 6 ; § 19.1) ── */

test('C20 : les trois groupes ont leur carte, et les binaires de leurs familles n’en ont plus — un binaire d’aucune famille, ou posé à la main, garde la sienne', () => avecMaison((fx, objets) => {
  const groupes = objets.filter(o => o.type === 'groupe');
  assert.deepEqual(groupes.map(o => [o.cle, o.nom, o.domaine, o.filtres, o.membres.length, o.actifsMembres, o.muetsMembres]), [
    // ASSERTION MODIFIÉE (chantier Capteurs, étapes 2 et 3, tâche 11 ; C32) : et Piles — les deux piles des plantes de la maison.
    ['groupe:ouvertures', 'Ouvertures', 'groupe', ['capteurs'], 5, 1, 0], ['groupe:securite', 'Sécurité', 'groupe', ['capteurs'], 2, 0, 0], ['groupe:presence', 'Présence', 'groupe', ['capteurs'], 4, 0, 0],
    ['groupe:piles', 'Piles', 'groupe', ['capteurs'], 2, 0, 0]]);
  for (const id of ['binary_sensor.porte_entree', 'binary_sensor.baie_vitree', 'binary_sensor.garage_avant', 'binary_sensor.fenetre_chambre', 'binary_sensor.enceinte_mouvement',
    'binary_sensor.camera_porte_co', 'binary_sensor.camera_porte_sonnette', 'binary_sensor.camera_jardin_mouvement'])
    assert.ok(!objets.some(o => o.id === id), id + ' : dans son groupe, plus de carte à lui');
  assert.ok(objets.some(o => o.id === 'binary_sensor.lave_linge_vibration'), 'une vibration, d’aucune famille, garde sa carte');
  assert.ok(!objets.some(o => o.id === 'binary_sensor.porte_entree_sabotage'), 'le sabotage ne fait pas de carte : il se dit sur la ligne de sa porte');
  // Posé à la main dans l'éditeur, un binaire d'un groupe garde sa carte dessinée (C20).
  const aLaMain = F.objetsDeLaMaison({ states: fx.states }, ['binary_sensor.porte_entree'], new Set());
  assert.ok(aLaMain.some(o => o.id === 'binary_sensor.porte_entree') && aLaMain.some(o => o.cle === 'groupe:ouvertures'), 'la porte posée à la main, et son groupe');
  // La vue : l'éditeur nomme et range une clé `groupe:` comme les autres cartes composées — et la grille la passe à la fabrique par sa CLÉ, jamais par
  // son identifiant (nul) : la vue tombait entière (revue de la démo, 16/10).
  const ov = APP.indexOf('\nfunction ObjetsView(');
  // ASSERTION MODIFIÉE (30/10, G3-E3) : la borne de recharge aussi se nomme par sa clé.
  assert.ok(APP.slice(ov, APP.indexOf('\n}\n', ov)).includes("const cle = (o.type === 'feeder' || o.type === 'plant' || o.type === 'groupe' || o.type === 'borne') ? o.cle : o.id;"), 'la carte d’un groupe se nomme par sa clé');
  assert.equal(F.nomDeCle(fx.states, 'groupe:securite'), 'Sécurité');
  assert.equal(domaineEdition('groupe:ouvertures'), 'capteur');
}));

test('C20 : un groupe compte ses membres dans les chiffres d’Objets — appareils reliés, actifs, entités absentes, la puce', () => avecMaison((fx, objets) => {
  const groupes = objets.filter(o => o.type === 'groupe');
  const membres = groupes.reduce((n, o) => n + o.membres.length, 0);
  // ASSERTIONS MODIFIÉES (chantier Capteurs, étapes 2 et 3, tâche 11 ; C32) : quatre groupes, Piles compte ses deux piles.
  assert.deepEqual(groupes.map(poidsObjet), [5, 2, 4, 2]);
  assert.equal(poidsObjet(objets.find(o => o.id === 'binary_sensor.lave_linge_vibration')), 1);
  assert.equal(statsObjets(objets).appareils, objets.length - 4 + membres, 'les appareils reliés comptent les membres');
  assert.equal(statsObjets(objets).actifs, statsObjets(objets.filter(o => o.type !== 'groupe')).actifs + 1, 'la baie vitrée, ouverte, est active — dans son groupe');
  assert.equal(pucesObjets(objets).find(p => p.id === 'capteurs').n, objets.filter(o => o.filtres[0] === 'capteurs').length - 4 + membres, 'la puce Capteurs compte les membres');
  assert.equal(pucesObjets(objets)[0].n, objets.length - 4 + membres, '« Tous » aussi');
  assert.equal(compteObjets(objets, 'capteurs'), pucesObjets(objets).find(p => p.id === 'capteurs').n);
  const muette = F.objetsDeLaMaison({ states: { ...fx.states, 'binary_sensor.porte_entree': { ...fx.states['binary_sensor.porte_entree'], state: 'unavailable' } } }, [], new Set());
  assert.equal(statsObjets(muette).absentes, statsObjets(objets).absentes + 1, 'une porte muette compte parmi les entités absentes');
  // La vue d'Objets compte ses puces par le même poids.
  const d = APP.indexOf('\nfunction ObjetsView(');
  assert.ok(APP.slice(d, APP.indexOf('\n}\n', d)).includes('const n = compteObjets(objets, f.id);'));
}));

test('C25, § 6.1, § 19.1 : Maison — Ouvertures, Sécurité, Présence d’abord, puis ce qui est à part ; « à regarder » compte une muette, jamais une porte ouverte ni Présence', () => avecMaison((fx, objets) => {
  const S = fx.states;
  const sections = (etats, liste = objets.filter(o => o.filtres[0] === 'capteurs')) => CS.sectionsCapteurs(liste, { S: etats, dehors: F.estDehors, lire: (id) => F.vueMesure({ states: etats }, id), juger: (o) => F.jugerObjet({ states: etats }, o) });
  const maison = sections(S).find(x => x.id === 'maison');
  assert.deepEqual(maison.objets.map(o => o.cle), ['groupe:ouvertures', 'groupe:securite', 'groupe:presence', 'binary_sensor.lave_linge_vibration'], 'les groupes d’abord, dans leur ordre, puis ce qui est à part');
  // La baie vitrée est ouverte : de l'ambre sur la carte, mais rien « à regarder » (§ 19.1 : un état choisi) ; la vibration, à part, fait taire « Rien à signaler ».
  assert.deepEqual([maison.regarder, maison.statut], [0, false]);
  const seuls = sections(S, objets.filter(o => o.type === 'groupe')).find(x => x.id === 'maison');
  assert.deepEqual([seuls.regarder, seuls.statut], [0, true], 'les trois groupes seuls : tout est jugé — « Rien à signaler »');
  const SM = { ...S, 'binary_sensor.porte_entree': { ...S['binary_sensor.porte_entree'], state: 'unavailable' } };
  assert.deepEqual([sections(SM).find(x => x.id === 'maison').regarder, sections(SM).find(x => x.id === 'maison').statut], [1, true], 'une porte muette : « 1 à regarder »');
  const SC = { ...S, 'binary_sensor.camera_porte_co': { ...S['binary_sensor.camera_porte_co'], state: 'on' } };
  assert.equal(sections(SC).find(x => x.id === 'maison').regarder, 1, 'un détecteur qui sonne : à regarder');
  const juger = (cle, etats = S) => F.jugerObjet({ states: etats }, objets.find(o => o.cle === cle));
  assert.deepEqual([juger('groupe:ouvertures'), juger('groupe:securite'), juger('groupe:presence'), juger('groupe:ouvertures', SM), juger('groupe:securite', SC)], ['bonne', 'bonne', 'neutre', 'regarder', 'regarder'], 'Présence ne juge pas : neutre, comme une pression');
  assert.equal(F.jugerObjet({ states: S }, objets.find(o => o.id === 'binary_sensor.lave_linge_vibration')), undefined, 'un binaire à part : rien à en dire ici — la section, qui ne sait pas le juger, se tait (null)');
  // L'enveloppe vivante s'abonne aux membres des groupes — sauf ceux de Présence, qu'elle ne juge pas (ASSERTION MODIFIÉE, passe bis du 17/10, point 5).
  const v = APP.indexOf('\nfunction SectionsCapteursVive(');
  assert.ok(APP.slice(v, APP.indexOf('\n}\n', v)).includes("...objets.filter(o => o.type === 'groupe' && o.cle !== 'groupe:presence').flatMap(o => o.membres || [])"), 'les membres des groupes jugés, en direct');
}));

/* TEST AJOUTÉ (passe bis du 17/10, point 5) : l'enveloppe des sections ne s'abonne plus aux membres de Présence, qu'elle ne juge pas (toujours
 * neutre, § 19.1) : abonnée à eux, chaque mouvement d'une caméra la redessinait, et avec elle l'en-tête et l'état de chaque section. Mesuré ici au
 * tic du relevé (`useHass`, 2 s) : AVANT, un rendu de l'enveloppe par mouvement de caméra ; APRÈS, aucun — et une porte qui s'ouvre la redessine
 * toujours, comme un détecteur qui se tait. */
test('passe bis, point 5 : un mouvement de caméra ne redessine plus les sections ; une porte qui s’ouvre, si', () => avecMaison((fx, objets) => {
  const h = horlogeFausse(), d = documentFaux();
  h.installer(); d.installer();
  try {
    const courants = { ...fx.states };
    d.suivre(() => ({ states: courants }));
    const visibles = objets.filter(o => o.filtres[0] === 'capteurs');
    const m = monter(F.SectionsCapteursVive, { hass: { states: fx.states }, titre: 'Capteurs', objets: visibles, cellule: (o) => o.cle });
    assert.deepEqual(h.intervalles().map(x => x.ms), [2000], 'un seul sondage, celui de l’enveloppe');
    const avant = m.rendus;
    const bouge = (id, etat, quand) => { courants[id] = { ...courants[id], state: etat, last_changed: quand, last_updated: quand }; h.avancer(2000); m.effets(); };
    bouge('binary_sensor.camera_jardin_mouvement', 'on', '2026-10-17T10:00:00Z');
    bouge('binary_sensor.camera_porte_sonnette', 'on', '2026-10-17T10:00:02Z');
    bouge('binary_sensor.enceinte_mouvement', 'on', '2026-10-17T10:00:04Z');
    assert.equal(m.rendus - avant, 0, 'trois mouvements, Présence neutre : rien à redessiner (avant : un rendu chacun)');
    bouge('binary_sensor.porte_entree', 'on', '2026-10-17T10:00:06Z');
    assert.equal(m.rendus - avant, 1, 'une porte qui s’ouvre : un rendu — Ouvertures est jugée');
    bouge('binary_sensor.camera_jardin_co', 'unavailable', '2026-10-17T10:00:08Z');
    assert.equal(m.rendus - avant, 2, 'un détecteur qui se tait : un rendu — Sécurité est jugée');
    m.demonter();
  } finally { h.restaurer(); d.restaurer(); }
}));
