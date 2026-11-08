// ─────────────────────────────────────────────────────────────────────────────
// Les actions du moment, en tête de l'Accueil (04/11, étape 1 du rapport sur l'usage).
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DASHBOARD } from './monolithe.mjs'; // l'Accueil en entier (ADR 0283)

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
const M = await import('../src/momentaccueil.js');

const volet = (state, pos) => ({ state, attributes: pos == null ? {} : { current_position: pos } });
const S = (extra = {}) => ({ 'sun.sun': { state: 'above_horizon', attributes: {} }, ...extra });
const V = [{ haid: 'cover.a' }, { haid: 'cover.b' }];
const NUIT = { id: 'nuit', nom: 'Bonne nuit', icone: 'moon' };

test('le moment de la journée, et le soir qui avance quand le soleil est couché', () => {
  assert.equal(M.momentDeLaJournee(7), 'matin');
  assert.equal(M.momentDeLaJournee(14), 'jour');
  assert.equal(M.momentDeLaJournee(20), 'soir');
  assert.equal(M.momentDeLaJournee(17), 'jour');
  assert.equal(M.momentDeLaJournee(17, true), 'soir', 'en hiver, le soir commence au coucher');
  assert.equal(M.momentDeLaJournee(23), 'nuit');
  assert.equal(M.momentDeLaJournee(3), 'nuit');
});

test('le matin, des volets fermés s’ouvrent — seulement ceux qui le sont', () => {
  const r = M.actionsDuMoment({ heure: 7, S: S({ 'cover.a': volet('closed', 0), 'cover.b': volet('open', 100) }), volets: V });
  assert.deepEqual(r.map(a => a.cle), ['ouvrir']);
  assert.deepEqual(r[0].volets, ['cover.a']);
  assert.equal(r[0].service, 'open_cover');
  assert.deepEqual(M.actionsDuMoment({ heure: 7, S: S({ 'cover.a': volet('open', 100), 'cover.b': volet('open', 60) }), volets: V }), [], 'tout est déjà ouvert : rien');
});

test('le soir, les volets ouverts se ferment ; un volet injoignable ne compte pas', () => {
  const r = M.actionsDuMoment({ heure: 20, S: S({ 'cover.a': volet('open', 100), 'cover.b': volet('unavailable') }), volets: V });
  assert.deepEqual(r.map(a => a.cle), ['fermer']);
  assert.deepEqual(r[0].volets, ['cover.a']);
});

test('tard, des lumières allumées appellent « Bonne nuit » — si le scénario existe', () => {
  const r = M.actionsDuMoment({ heure: 22, S: S({ 'cover.a': volet('closed', 0) }), volets: V.slice(0, 1), lumieres: 3, scenarios: [NUIT] });
  assert.deepEqual(r.map(a => a.cle), ['nuit']);
  assert.equal(r[0].scenario, 'nuit');
  assert.deepEqual(M.actionsDuMoment({ heure: 22, S: S(), lumieres: 3, scenarios: [] }), [], 'sans scénario « nuit », rien');
  assert.deepEqual(M.actionsDuMoment({ heure: 22, S: S(), lumieres: 0, scenarios: [NUIT] }), [], 'tout est éteint : rien');
});

test('en journée, rien : pas de bouton qui ne servirait à rien', () => {
  assert.deepEqual(M.actionsDuMoment({ heure: 14, S: S({ 'cover.a': volet('closed', 0) }), volets: V, lumieres: 4, scenarios: [NUIT] }), []);
  assert.deepEqual(M.actionsDuMoment({ heure: 7, S: null, volets: V }), []);
});

test('trois actions au plus, et le soir les volets avant « Bonne nuit »', () => {
  const r = M.actionsDuMoment({ heure: 21, S: S({ 'cover.a': volet('open', 100) }), volets: V.slice(0, 1), lumieres: 2, scenarios: [NUIT] });
  assert.deepEqual(r.map(a => a.cle), ['fermer', 'nuit']);
  assert.ok(r.length <= M.MAX_ACTIONS);
});

test('le bandeau les montre sous sa phrase, hors du mode édition', () => {
  assert.ok(DASHBOARD.includes("{!editMode && <ActionsMoment hass={a && a.hass} lumieres={(faits && faits.lum) || 0} />}"));
  assert.ok(DASHBOARD.includes('return { txt: out, alerte, lum };'), 'le nombre de lumières allumées ne sort plus du calcul des faits');
});
