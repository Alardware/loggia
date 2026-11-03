// ─────────────────────────────────────────────────────────────────────────────
// Le rangement des pièces s'hérite tant qu'on ne l'a pas fait (ticket #43).
//
// « Le souci pour la disposition des vignettes des pièces est revenu avec la
// dernière version. J'ai un ordre personnalisé sur le PC et sur le téléphone,
// les vignettes se rangent par ordre alphabétique. »
//
// Depuis que chaque compte ouvre SON profil (ADR 0276), un écran a changé de
// profil sans rien demander, et l'ordre était resté dans l'ancien. Un ordre
// VIDE n'est pas un choix : le profil reprend celui de la maison.
// ─────────────────────────────────────────────────────────────────────────────

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true });
let stockage = {};
globalThis.localStorage = {
  getItem: (k) => (k in stockage ? stockage[k] : null),
  setItem: (k, v) => { stockage[k] = String(v); },
  removeItem: (k) => { delete stockage[k]; },
};

const S = await import('../src/state.js');
const { grilleDuFormat, poserGrille } = await import('../src/disposition.js');

const PROFILS = [
  { name: 'Maison', role: 'Admin' },
  { name: 'Moi', role: 'Admin' },
  { name: 'Enfant', role: 'Famille' },
];
const RANGE = { piecesOrdre: ['Salon', 'Cuisine'], places: { Salon: { c: 1, r: 1 } }, tailles: { Salon: 'c' } };

const poser = (parts, profil) => S.setLoggiaState({
  cfg: { loggia_users: PROFILS, loggia_accueil: { __profils: parts } }, server: true, profil, save: () => true,
});

beforeEach(() => { stockage = {}; });

test('un profil qui n’a rien rangé reprend le rangement du premier Admin', () => {
  // Le cas relevé chez nous : « Moi » a une part, mais rien d'y rangé.
  poser({ 0: { main: ['pieces'], ...RANGE }, 1: { main: ['meteo'], piecesOrdre: [], places: {}, tailles: {} } }, '1');
  const a = S.accueilDuProfil();
  assert.deepEqual(a.piecesOrdre, RANGE.piecesOrdre);
  assert.deepEqual(a.places, RANGE.places);
  assert.deepEqual(a.tailles, RANGE.tailles);
  assert.deepEqual(a.main, ['meteo'], 'le reste de sa grille reste à lui');
});

test('le rangement du téléphone s’hérite avec celui du PC', () => {
  const MOBILE = { piecesOrdre: ['Cuisine', 'Salon'], tailles: { Cuisine: 's' } };
  poser({ 0: { ...RANGE, formats: { mobile: MOBILE } }, 1: { main: ['meteo'] } }, '1');
  const a = S.accueilDuProfil();
  assert.deepEqual(grilleDuFormat(a, 'mobile').piecesOrdre, ['Cuisine', 'Salon'], 'le téléphone prend l’ordre que l’Admin y a rangé');
  assert.deepEqual(grilleDuFormat(a, 'pc').piecesOrdre, RANGE.piecesOrdre);
  // Un profil qui a rangé SON PC : son téléphone suit son PC, pas celui de l'Admin.
  poser({ 0: { ...RANGE, formats: { mobile: MOBILE } }, 1: { piecesOrdre: ['Chambre'] } }, '1');
  assert.deepEqual(grilleDuFormat(S.accueilDuProfil(), 'mobile').piecesOrdre, ['Chambre']);
});

test('la part commune passe avant les profils Admin', () => {
  poser({ '*': { piecesOrdre: ['Cuisine'] }, 0: RANGE }, '2');
  assert.deepEqual(S.accueilDuProfil().piecesOrdre, ['Cuisine']);
  assert.deepEqual(S.accueilDuProfil().places, RANGE.places, 'réglage par réglage');
});

test('ce qu’un profil a rangé lui reste', () => {
  poser({ 0: RANGE, 2: { piecesOrdre: ['Chambre'] } }, '2');
  assert.deepEqual(S.accueilDuProfil().piecesOrdre, ['Chambre']);
});

test('un profil Famille ne sert pas de source', () => {
  poser({ 2: RANGE }, '1');
  assert.equal(S.accueilDuProfil().piecesOrdre, undefined);
});

test('un ordre vide recopié dans la grille du téléphone ne masque plus celui du PC', () => {
  const acc = { main: ['pieces'], piecesOrdre: ['Salon', 'Cuisine'], formats: { mobile: { main: ['pieces'], piecesOrdre: [], places: {}, tailles: { Salon: 's' } } } };
  const g = grilleDuFormat(acc, 'mobile');
  assert.deepEqual(g.piecesOrdre, ['Salon', 'Cuisine']);
  assert.deepEqual(g.tailles, { Salon: 's' }, 'ce que le téléphone a rangé reste à lui');
  // Un geste sans rapport ne fige pas l'ordre du PC dans la part du téléphone.
  const apres = poserGrille(acc, 'mobile', { ...g, caches: [] });
  assert.equal('piecesOrdre' in apres.formats.mobile, false);
  assert.deepEqual(grilleDuFormat({ ...apres, piecesOrdre: ['Cuisine', 'Salon'] }, 'mobile').piecesOrdre, ['Cuisine', 'Salon'], 'le téléphone suit le PC');
});
