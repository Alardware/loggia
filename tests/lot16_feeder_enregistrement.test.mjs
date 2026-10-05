// ─────────────────────────────────────────────────────────────────────────────
// « Enregistrer » ne perd plus le distributeur (relecture du lot 16, 05/10).
//
// La fiche « Entités de la vue » réécrit TOUTES les clés, depuis n'importe
// quelle vue : enregistrer la vue Sécurité réécrit `loggia_feeder`, qu'elle ne
// montre pas. Deux pertes, sans un mot :
//  1. la clé ne vivait que par le réservoir, la portion ou un repas. Un
//     distributeur désigné par son script ou son compteur, sans repas lisible
//     (liste abîmée, vide), s'effaçait EN ENTIER — script et compteur compris.
//     Rejoué dans la démo depuis la vue Sécurité ;
//  2. `haid`, l'entité qu'ouvre la fiche du distributeur (App.jsx), n'a pas de
//     champ dans l'éditeur : `readEnt` ne le lisait pas, `saveEnt` réécrivait
//     la clé sans lui — même une configuration VALIDE (préexistant).
// En chemin, la clé de rendu `_k` des lignes ne s'écrit plus dans
// `loggia_people` ni `loggia_medias`.
//
// Le test exécute la lecture et l'écriture TELLES QUE Paramètres les porte
// (des tranches de `useEntConfig`), pas une copie : il échoue sur le code
// d'avant pour ce qu'il perd, pas pour un nom qui manque.
// Une configuration valide sans `haid` s'écrit exactement comme avant.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true });
await import('./rendu.mjs');   // les crochets `.jsx`, avant le premier import d'une vue
const { setLoggiaState, cfgVal, loggiaEnt } = await import('../src/state.js');
const { croqRepasEdition, croqHaids, croqMeals } = await import('../src/lectures.js');
const P = await import('../src/views/parametres.jsx');

const PARAM = readFileSync(new URL('../src/views/parametres.jsx', import.meta.url), 'utf8');

/** Un morceau de parametres.jsx, de `debut` (compris) jusqu'à `fin` (exclu). */
const tranche = (debut, fin) => {
  const d = PARAM.indexOf(debut), f = PARAM.indexOf(fin, d + 1);
  assert.ok(d >= 0 && f > d, '« ' + debut.trim() + ' » introuvable dans useEntConfig');
  return PARAM.slice(d, f);
};

/* La lecture de `readEnt` et l'écriture de `saveEnt`, mot pour mot. */
const lire = new Function('cfgVal', 'loggiaEnt', 'feederEdition',
  'return ({' + tranche('    feeder: ', '\n    /* Par le lecteur') + '}).feeder;');
const ecrire = new Function('ent', 'repasAEcrire', 'feederAEcrire',
  'return ({' + tranche('        loggia_feeder: ', '\n      });') + '}).loggia_feeder;');
/* Les aides de `useEntConfig` (`avecCle`… jusqu'à `readEnt`), puis les deux
 * lignes qui écrivent les personnes et les lecteurs. */
const ecrireListes = new Function('ent', tranche('  const avecCle = ', '  const readEnt = () => ({')
  + 'return ({' + tranche('        loggia_people: ', '\n') + tranche('        loggia_medias: ', '\n') + '});');

/** Serveur joignable : `cfgVal` ne descend pas dans le stockage local. */
const etat = (cfg = {}) => setLoggiaState({ cfg, ent: {}, server: true });

/** Un aller-retour par l'éditeur, depuis n'importe quelle vue : ce que
 * `readEnt` lit du distributeur, puis ce que `saveEnt` en écrit. */
const lu = (feeder) => { etat({ loggia_feeder: feeder }); return lire(cfgVal, loggiaEnt, P.feederEdition); };
const tour = (feeder) => ecrire({ feeder: lu(feeder), repas: croqRepasEdition() }, P.repasAEcrire, P.feederAEcrire);

/** L'ancienne lecture et l'ancienne écriture, mot pour mot (lot 16). */
const avantLu = (f) => { const h = f.haids || {}; return { reservoir: h.reservoir || '', portionWeight: h.portionWeight || '', distribuees: h.distribuees || '', script: f.script || '' }; };
const avantEcrit = (ent) => (ent.feeder.reservoir || ent.feeder.portionWeight || P.repasAEcrire(ent.repas).length)
  ? {
    haids: { reservoir: ent.feeder.reservoir || null, portionWeight: ent.feeder.portionWeight || null, distribuees: ent.feeder.distribuees || null },
    ...(ent.feeder.script ? { script: ent.feeder.script } : {}),
    meals: P.repasAEcrire(ent.repas),
  }
  : null;

const HAIDS = { reservoir: 'input_number.croquettes_reservoir', portionWeight: 'number.distributeur_portion', distribuees: 'sensor.croquettes_du_jour' };
const MEALS = [
  { id: 'repas0', time: '07:30', label: 'Repas du matin', g: 45, auto: 'input_boolean.repas_matin' },
  { id: 'repas1', time: '19:00', label: 'Repas du soir', g: 45, auto: null },
];
const VIDES = { reservoir: null, portionWeight: null, distribuees: null };

/* ── 1. La clé vit tant qu'un champ désigne quelque chose ─────────────────── */

test('un distributeur désigné par son script ou son compteur survit à « Enregistrer », sans repas lisible', () => {
  for (const [feeder, attendu] of [
    // Le cas de la relecture, réduit à ce que la suite config_abimee laisse
    // perdre : aucun repas lisible, ni réservoir ni portion.
    [{ haids: { distribuees: 'sensor.croquettes_du_jour' }, script: 'script.distribuer', meals: [null, 5, 'matin', []] },
      { haids: { ...VIDES, distribuees: 'sensor.croquettes_du_jour' }, script: 'script.distribuer', meals: [] }],
    [{ script: 'script.distribuer', meals: 'matin' }, { haids: VIDES, script: 'script.distribuer', meals: [] }],
    [{ script: 'script.distribuer', meals: { 0: { time: '07:30' } } }, { haids: VIDES, script: 'script.distribuer', meals: [] }],
    // Une liste VIDE : déjà perdu avant le lot 16.
    [{ haids: { distribuees: 'sensor.d' }, meals: [] }, { haids: { ...VIDES, distribuees: 'sensor.d' }, meals: [] }],
    // Le seul `haid`, sans champ dans l'éditeur.
    [{ haid: 'number.distributeur_portion' }, { haids: VIDES, haid: 'number.distributeur_portion', meals: [] }],
  ]) {
    const ecrit = tour(feeder);
    assert.deepEqual(ecrit, attendu, JSON.stringify(feeder) + ' : la clé du distributeur s’est effacée, ou a perdu un champ');
    // Relu : ce qu'en tirent la fiche et l'Accueil est là.
    etat({ loggia_feeder: ecrit });
    assert.equal(loggiaEnt('feeder', null).script, feeder.script);
    assert.equal(croqHaids().distribuees, feeder.haids && feeder.haids.distribuees);
    assert.deepEqual(croqMeals(), []);
  }
});

test('rien de désigné : la clé s’efface, comme avant', () => {
  for (const feeder of [null, 42, 'abc', true, [], {}, { haids: {}, meals: [] },
    { haids: { reservoir: '', portionWeight: '', distribuees: '' }, script: '', haid: '', meals: [null, { time: '', label: '' }] }]) {
    assert.equal(tour(feeder), null, JSON.stringify(feeder));
  }
  // Tout vidé dans l'éditeur, une ligne « + Ajouter » restée blanche.
  assert.equal(ecrire({ feeder: { reservoir: '', portionWeight: '', distribuees: '', script: '', haid: '' }, repas: [{ time: '', label: '', g: '', auto: '', _k: 'r1' }] },
    P.repasAEcrire, P.feederAEcrire), null);
});

/* ── 2. `haid` de premier niveau ──────────────────────────────────────────── */

test('une configuration VALIDE garde son `haid` de premier niveau', () => {
  const valide = { haid: 'number.distributeur_portion', haids: HAIDS, script: 'script.distribuer', meals: MEALS };
  const ecrit = tour(valide);
  assert.deepEqual(ecrit, valide, '`haid` — l’entité qu’ouvre la fiche du distributeur — part à l’enregistrement');
  // Ce que lit la fiche (App.jsx) après l'aller-retour.
  etat({ loggia_feeder: ecrit });
  assert.equal((loggiaEnt('feeder', null) || {}).haid, 'number.distributeur_portion');
});

test('l’éditeur porte `haid`, et ne lève sur aucune forme reçue', () => {
  assert.deepEqual(lu({ haid: 'number.distributeur_portion', haids: HAIDS, script: 'script.distribuer' }),
    { ...HAIDS, script: 'script.distribuer', haid: 'number.distributeur_portion' });
  for (const v of [null, 42, 'abc', true, [], { haids: 'x' }, { haids: null }, { haids: [1] }]) {
    assert.doesNotThrow(() => tour(v), JSON.stringify(v));
  }
});

/* ── 3. Une configuration valide s'écrit comme avant ──────────────────────── */

test('sans `haid`, une configuration valide se lit et s’écrit exactement comme avant', () => {
  for (const feeder of [
    { haids: HAIDS, meals: [{ id: 'matin', time: '07:30', label: 'Repas du matin', g: 45, auto: 'input_boolean.repas_matin' }, { id: 'soir', time: '19:00', label: 'Repas du soir', g: 45, auto: 'input_boolean.repas_soir' }] },
    { haids: { reservoir: 'input_number.r' }, script: 'script.distribuer', meals: MEALS },
    { haids: { portionWeight: 'number.p' }, meals: [] },
    { haids: { reservoir: 'input_number.r', portionWeight: null, distribuees: null }, meals: [{ id: 'repas0', time: '08:00', label: '', g: 0, auto: null }] },
  ]) {
    const { haid, ...l } = lu(feeder);
    assert.ok(!haid);
    assert.deepEqual(l, avantLu(feeder), JSON.stringify(feeder));
    assert.deepEqual(tour(feeder), avantEcrit({ feeder: avantLu(feeder), repas: croqRepasEdition() }), JSON.stringify(feeder));
  }
});

/* ── 4. La clé de rendu ne s'écrit pas ────────────────────────────────────── */

test('« Enregistrer » n’écrit plus la clé de rendu `_k` des personnes et des lecteurs', () => {
  const ecrit = ecrireListes({
    people: [{ name: 'Camille', haid: 'person.camille', _k: 'k0_dwpd' }, { name: 'Vide', haid: '', _k: 'k1_a' }],
    medias: [{ name: 'Sonos', haid: 'media_player.salon_sonos', ma: '', _k: 'r17' }],
  });
  assert.deepEqual(ecrit, {
    loggia_people: [{ name: 'Camille', haid: 'person.camille' }],
    loggia_medias: [{ name: 'Sonos', haid: 'media_player.salon_sonos', ma: '' }],
  });
  // Aucune autre liste éditée ne s'écrit brute, `_k` compris.
  assert.doesNotMatch(PARAM, /loggia_\w+: ent\.\w+\.filter\(\w+ => \w+\.\w+\),/);
});
