// ─────────────────────────────────────────────────────────────────────────────
// UNE CARTE, DEUX VUES (20/10).
//
// « Les cartes sont en double, dans Appareils et dans Pièces : si je supprime ou
// ajoute dans l'un ou l'autre, ça doit aussi se répercuter sur l'autre, c'est
// logique. »
//
// Objets range ses cartes dans `loggia_objlayout` (scope « objets »), chaque
// pièce dans `loggia_roomlayout` (un scope par pièce) — avec les MÊMES
// identifiants pour un appareil (`light.x`, `zone:…`). Rien ne les reliait.
// `refletCarte` dit ce qu'un geste dans l'une écrit dans l'autre.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { refletCarte } from '../src/refletcarte.js';

const PIECES = (Ls = {}) => [
  { nom: 'Bureau', derive: true, L: Ls.Bureau || {} },
  { nom: 'Salon', derive: false, L: Ls.Salon || {} },
];

test('retirer dans Objets retire de la pièce qui la propose', () => {
  const r = refletCarte({ source: 'objets', id: 'light.bureau', present: false, pieces: PIECES(), objets: {} });
  assert.deepEqual(r.pieces, { Bureau: { removed: ['light.bureau'] } });
  assert.equal(r.objets, undefined);
});

test('retirer dans Objets sort aussi la carte d’une pièce où on l’avait ajoutée à la main', () => {
  const r = refletCarte({ source: 'objets', id: 'light.bureau', present: false, pieces: PIECES({ Salon: { added: ['light.bureau', 'light.x'] } }), objets: {} });
  assert.deepEqual(r.pieces.Salon, { added: ['light.x'] });
  assert.deepEqual(r.pieces.Bureau, { removed: ['light.bureau'] });
});

test('retirer dans une pièce retire d’Objets', () => {
  const r = refletCarte({ source: 'piece', id: 'light.bureau', present: false, pieces: PIECES(), objets: { removed: ['switch.y'] } });
  assert.deepEqual(r.objets, { removed: ['switch.y', 'light.bureau'] });
  assert.equal(r.pieces, undefined);
});

test('une carte ajoutée à la main dans Objets et retirée d’une pièce quitte simplement `added`', () => {
  const r = refletCarte({ source: 'piece', id: 'sensor.z', present: false, pieces: PIECES(), objets: { added: ['sensor.z'] } });
  assert.deepEqual(r.objets, {});
});

test('remettre une carte proposée : elle revient dans l’autre vue', () => {
  const a = refletCarte({ source: 'objets', id: 'light.bureau', present: true, pieces: PIECES({ Bureau: { removed: ['light.bureau', 'light.k'] } }), objets: {} });
  assert.deepEqual(a.pieces, { Bureau: { removed: ['light.k'] } });
  const b = refletCarte({ source: 'piece', id: 'light.bureau', present: true, pieces: PIECES(), objets: { removed: ['light.bureau'] } });
  assert.deepEqual(b.objets, {});
});

test('rien à refléter : déjà dans le bon état, ou une carte qui n’existe que d’un côté', () => {
  assert.equal(refletCarte({ source: 'objets', id: 'light.bureau', present: true, pieces: PIECES(), objets: {} }), null);
  assert.equal(refletCarte({ source: 'piece', id: 'light.bureau', present: false, pieces: PIECES(), objets: { removed: ['light.bureau'] } }), null);
  for (const id of ['sect:123', 'groupe:piles', 'plant:abc', 'obj:feeder'])
    assert.equal(refletCarte({ source: 'piece', id, present: false, pieces: PIECES(), objets: {} }), null, id);
});

test('les zones de chauffage passent aussi', () => {
  const r = refletCarte({ source: 'piece', id: 'zone:select.radiateur', present: false, pieces: PIECES(), objets: {} });
  assert.deepEqual(r.objets, { removed: ['zone:select.radiateur'] });
});
