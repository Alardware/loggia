// ─────────────────────────────────────────────────
// « Alimentée par » : une ampoule derrière un interrupteur (audit du 12/11,
// lot X4 ; ADR 0369).
//
// Une ampoule connectée derrière un interrupteur mural n'a plus de courant
// quand il est éteint ; Home Assistant garde son dernier état, ou la dit
// injoignable. La maison le dit une fois (`loggia_alimentation`), et le RELEVÉ
// que l'écran lit montre l'ampoule éteinte, marquée de ce qui la coupe : chaque
// compteur lit `state`, aucun n'a à connaître la relation.
//
// Ici, le module pur (src/alimentation.js). Le côté serveur :
// tests/python/test_alimentation.py.
// ─────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CLE_ALIMENTATION, alimentationsDe, sourceCoupee, coupeePar, alimentees, etatsAlimentes, avecAlimentation, poserAlimentation } from '../src/alimentation.js';

const AMPOULE = 'light.ampoule_un', AUTRE = 'light.ampoule_deux', PLAFONNIER = 'light.plafonnier', PRISE = 'switch.prise_lampe';
const etat = (state, attributes = {}, quand = '2026-11-14T18:00:00.000Z') => ({ entity_id: 'x', state, attributes, last_changed: quand, last_updated: quand });

test('la clé de la configuration', () => {
  assert.equal(CLE_ALIMENTATION, 'loggia_alimentation');
});

// ── La relation, lue proprement ──────────────────────────────────────────────

test('la relation se lit proprement, quoi qu’on y ait écrit', () => {
  const brut = { [AMPOULE]: PLAFONNIER, [AUTRE]: PRISE, 'light.seule': 'light.seule', 'light.b': 5, 'sensor.x': PLAFONNIER, 'light.c': 'sensor.y', 'light.d': '' };
  assert.deepEqual(alimentationsDe(brut), { [AMPOULE]: PLAFONNIER, [AUTRE]: PRISE });
  for (const rien of [null, undefined, [], 'x', 3, {}]) assert.deepEqual(alimentationsDe(rien), {});
  // Un interrupteur déclaré lumière peut lui aussi être derrière un autre.
  assert.deepEqual(alimentationsDe({ 'switch.applique': PLAFONNIER }), { 'switch.applique': PLAFONNIER });
});

test('une source ne peut pas être elle-même alimentée : ni chaîne, ni boucle', () => {
  assert.deepEqual(alimentationsDe({ [AMPOULE]: PLAFONNIER, [PLAFONNIER]: PRISE }), { [PLAFONNIER]: PRISE });
  assert.deepEqual(alimentationsDe({ [AMPOULE]: AUTRE, [AUTRE]: AMPOULE }), {});
});

test('les ampoules qu’une source alimente', () => {
  const alim = { [AMPOULE]: PLAFONNIER, [AUTRE]: PLAFONNIER, 'light.x': PRISE };
  assert.deepEqual(alimentees(alim, PLAFONNIER), [AMPOULE, AUTRE]);
  assert.deepEqual(alimentees(alim, 'light.rien'), []);
  assert.deepEqual(alimentees(null, PLAFONNIER), []);
});

// ── Coupée : la source est éteinte, et seulement alors ───────────────────────

test('une ampoule est coupée quand SA source est éteinte', () => {
  const alim = { [AMPOULE]: PLAFONNIER, [AUTRE]: PRISE };
  const S = { [PLAFONNIER]: etat('off'), [PRISE]: etat('on'), [AMPOULE]: etat('on'), [AUTRE]: etat('on') };
  assert.equal(sourceCoupee(AMPOULE, S, alim), PLAFONNIER);
  assert.equal(sourceCoupee(AUTRE, S, alim), null);
  assert.equal(sourceCoupee(PLAFONNIER, S, alim), null, 'une lampe sans relation');
  assert.equal(sourceCoupee(AMPOULE, S, null), null);
});

test('une source muette ou absente ne dit rien', () => {
  const alim = { [AMPOULE]: PLAFONNIER };
  for (const muet of ['unavailable', 'unknown', '', undefined]) {
    assert.equal(sourceCoupee(AMPOULE, { [PLAFONNIER]: etat(muet) }, alim), null, String(muet));
  }
  assert.equal(sourceCoupee(AMPOULE, {}, alim), null);
  assert.equal(sourceCoupee(AMPOULE, null, alim), null);
});

// ── Le relevé que l'écran lit ────────────────────────────────────────────────

test('sans ampoule coupée, le relevé est rendu tel quel, sans copie', () => {
  const S = { [PLAFONNIER]: etat('on'), [AMPOULE]: etat('on') };
  assert.equal(etatsAlimentes(S, { [AMPOULE]: PLAFONNIER }), S);
  assert.equal(etatsAlimentes(S, {}), S);
  assert.equal(etatsAlimentes(S, null), S);
  assert.equal(etatsAlimentes(null, { [AMPOULE]: PLAFONNIER }), null);
});

test('une ampoule coupée est vue éteinte, marquée, sans son dernier réglage', () => {
  const coupure = '2026-11-14T19:30:00.000Z';
  const S = {
    [PLAFONNIER]: etat('off', { friendly_name: 'Plafonnier' }, coupure),
    [AMPOULE]: etat('on', { friendly_name: 'Ampoule', brightness: 200, color_mode: 'color_temp', color_temp_kelvin: 2700, supported_color_modes: ['color_temp'] }),
    'sensor.autre': etat('21'),
  };
  const vu = etatsAlimentes(S, { [AMPOULE]: PLAFONNIER });
  assert.notEqual(vu, S, 'une copie : le relevé de Home Assistant ne se touche pas');
  assert.equal(S[AMPOULE].state, 'on', 'l’état d’origine reste le sien');
  assert.equal(vu[AMPOULE].state, 'off');
  assert.equal(coupeePar(vu[AMPOULE]), PLAFONNIER);
  assert.equal(vu[AMPOULE].attributes.friendly_name, 'Ampoule');
  assert.deepEqual(vu[AMPOULE].attributes.supported_color_modes, ['color_temp'], 'ce qu’elle sait faire reste');
  for (const k of ['brightness', 'color_mode', 'color_temp_kelvin']) assert.equal(k in vu[AMPOULE].attributes, false, k);
  // Depuis que la source est éteinte : les abonnements de l'écran lisent `state` et `last_updated`.
  assert.equal(vu[AMPOULE].last_changed, coupure);
  assert.equal(vu[AMPOULE].last_updated, coupure);
  // Le reste du relevé est le même, au même objet.
  assert.equal(vu[PLAFONNIER], S[PLAFONNIER]);
  assert.equal(vu['sensor.autre'], S['sensor.autre']);
  assert.equal(coupeePar(S[AMPOULE]), null);
  assert.equal(coupeePar(null), null);
});

test('une ampoule injoignable derrière un interrupteur éteint n’est pas une panne', () => {
  const S = { [PLAFONNIER]: etat('off'), [AMPOULE]: etat('unavailable') };
  const vu = etatsAlimentes(S, { [AMPOULE]: PLAFONNIER });
  assert.equal(vu[AMPOULE].state, 'off');
  assert.equal(coupeePar(vu[AMPOULE]), PLAFONNIER);
});

test('une ampoule déjà éteinte est marquée elle aussi ; une ampoule sans état n’en reçoit pas', () => {
  const S = { [PLAFONNIER]: etat('off'), [AMPOULE]: etat('off') };
  const vu = etatsAlimentes(S, { [AMPOULE]: PLAFONNIER, [AUTRE]: PLAFONNIER });
  assert.equal(coupeePar(vu[AMPOULE]), PLAFONNIER);
  assert.equal(AUTRE in vu, false);
});

test('le même état est rendu tant que ni l’ampoule ni sa source n’ont bougé', () => {
  const alim = { [AMPOULE]: PLAFONNIER };
  const S = { [PLAFONNIER]: etat('off'), [AMPOULE]: etat('on') };
  const un = etatsAlimentes(S, alim)[AMPOULE];
  // Un autre relevé, les mêmes états : une autre entité a bougé.
  assert.equal(etatsAlimentes({ ...S, 'sensor.z': etat('1') }, alim)[AMPOULE], un);
  // La source bouge : un autre état.
  assert.notEqual(etatsAlimentes({ ...S, [PLAFONNIER]: etat('off', {}, '2026-11-14T20:00:00.000Z') }, alim)[AMPOULE], un);
});

// ── Le `hass` que l'écran lit ────────────────────────────────────────────────

test('sans relation, ou sans ampoule coupée, le hass est rendu tel quel', () => {
  const hass = { states: { [PLAFONNIER]: etat('on'), [AMPOULE]: etat('on') }, callService() {} };
  assert.equal(avecAlimentation(hass, null), hass);
  assert.equal(avecAlimentation(hass, {}), hass);
  assert.equal(avecAlimentation(hass, { [AMPOULE]: PLAFONNIER }), hass);
  assert.equal(avecAlimentation(null, { [AMPOULE]: PLAFONNIER }), null);
  assert.equal(avecAlimentation({ connected: false }, { [AMPOULE]: PLAFONNIER }).connected, false, 'un hass sans relevé');
});

test('une ampoule coupée : un double du hass, au relevé corrigé, le même à chaque lecture', () => {
  const appels = [];
  const hass = { states: { [PLAFONNIER]: etat('off'), [AMPOULE]: etat('on') }, user: { is_admin: true }, callService: (...a) => { appels.push(a); } };
  const brut = { [AMPOULE]: PLAFONNIER };
  const vu = avecAlimentation(hass, brut);
  assert.notEqual(vu, hass);
  assert.equal(vu.states[AMPOULE].state, 'off');
  assert.equal(hass.states[AMPOULE].state, 'on', 'le hass de Home Assistant ne se touche pas');
  assert.equal(vu.user, hass.user);
  vu.callService('light', 'turn_on', {});
  assert.equal(appels.length, 1, 'le double commande comme l’original');
  // La même lecture rend le même objet : ce qui compare deux hass ne voit pas un changement.
  assert.equal(avecAlimentation(hass, brut), vu);
  // Une autre relation, un autre hass : une autre lecture.
  assert.equal(avecAlimentation(hass, {}), hass);
  const suivant = { ...hass, states: { ...hass.states, [PLAFONNIER]: etat('on') } };
  assert.equal(avecAlimentation(suivant, brut), suivant, 'le courant revient : le hass tel quel');
});

test('un hass d’une classe garde ses méthodes', () => {
  class Faux { constructor() { this.states = { [PLAFONNIER]: etat('off'), [AMPOULE]: etat('on') }; } combien() { return Object.keys(this.states).length; } }
  const vu = avecAlimentation(new Faux(), { [AMPOULE]: PLAFONNIER });
  assert.equal(vu.combien(), 2);
  assert.equal(vu.states[AMPOULE].state, 'off');
});

// ── Ce qui s'écrit ───────────────────────────────────────────────────────────

test('poser une relation, la changer, la retirer', () => {
  assert.deepEqual(poserAlimentation(null, AMPOULE, PLAFONNIER), { [AMPOULE]: PLAFONNIER });
  assert.deepEqual(poserAlimentation({ [AUTRE]: PRISE }, AMPOULE, PLAFONNIER), { [AUTRE]: PRISE, [AMPOULE]: PLAFONNIER });
  assert.deepEqual(poserAlimentation({ [AMPOULE]: PRISE }, AMPOULE, PLAFONNIER), { [AMPOULE]: PLAFONNIER });
  assert.deepEqual(poserAlimentation({ [AMPOULE]: PLAFONNIER, [AUTRE]: PRISE }, AMPOULE, null), { [AUTRE]: PRISE });
  // La dernière relation retirée : la clé s'efface (`cfgSet` efface sur null).
  assert.equal(poserAlimentation({ [AMPOULE]: PLAFONNIER }, AMPOULE, ''), null);
  // Sa propre source, ou autre chose qu'une lampe ou un interrupteur : rien ne s'écrit pour elle.
  assert.equal(poserAlimentation(null, AMPOULE, AMPOULE), null);
  assert.equal(poserAlimentation(null, AMPOULE, 'sensor.x'), null);
  // Ce qui était écrit ne se perd pas en chemin.
  const avant = { [AUTRE]: PRISE };
  poserAlimentation(avant, AMPOULE, PLAFONNIER);
  assert.deepEqual(avant, { [AUTRE]: PRISE });
});
