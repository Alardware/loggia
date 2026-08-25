// ─────────────────────────────────────────────────────────────────────────────
// Les pièces, telles que la configuration les décrit.
//
// `normRooms` reconstruit `haid` champ par champ. C'est volontaire — cela
// répare les configurations anciennes — mais tout champ oublié y disparaît
// SILENCIEUSEMENT. Ces tests existent pour que la liste des lampes du bouton,
// ajoutée après coup, ne se perde pas au prochain remaniement.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';

// Le module lit le stockage local au chargement : sans lui, l'import échoue.
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.window = globalThis;

const { normRooms } = await import('../src/state.js');

test('les lampes choisies pour le bouton survivent à la normalisation', () => {
  const r = normRooms([{ room: 'Chambre', haid: { temp: 'sensor.t', lights: ['light.a', 'light.b'] } }]);
  assert.deepEqual(r[0].haid.lights, ['light.a', 'light.b']);
  assert.equal(r[0].haid.temp, 'sensor.t');
});

test('une pièce sans choix explicite a une liste vide, jamais indéfinie', () => {
  // Vide veut dire « toutes les lumières de la pièce ». C'est l'appelant qui en
  // décide, mais il doit pouvoir compter sur un tableau.
  const r = normRooms([{ room: 'Séjour', haid: { temp: 'sensor.s' } }]);
  assert.deepEqual(r[0].haid.lights, []);
});

test('une pièce déclarée par son seul nom reste utilisable', () => {
  // Forme héritée : une liste de chaînes plutôt que d'objets.
  const r = normRooms(['Cuisine']);
  assert.equal(r[0].room, 'Cuisine');
  assert.deepEqual(r[0].haid.lights, []);
});

test('une valeur mal formée ne casse rien', () => {
  // Une configuration éditée à la main peut contenir n'importe quoi ; on ne
  // veut pas d'un tableau qui n'en est pas un.
  const r = normRooms([{ room: 'Bureau', haid: { lights: 'light.a' } }]);
  assert.deepEqual(r[0].haid.lights, []);
});
