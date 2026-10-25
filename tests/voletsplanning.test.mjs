// ─────────────────────────────────────────────────────────────────────────────
// Le planning des volets, côté écran (chantier Volets, § 6.2 et § 11).
//
// `src/voletsplanning.js` est le jumeau de `custom_components/loggia/volets_calcul.py` :
// l'onglet Planning d'un volet dessine sa semaine avec le MÊME calcul que celui
// qui publie `a_venir` côté serveur. Une seule fixture,
// tests/fixtures/volets_parite.json, lue ici ET par
// tests/python/test_volets_calcul.py : si l'un bouge, l'autre rougit.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { SENS, epoque, regleDe, bouge, decalageDe, aVenir, semaine } from '../src/voletsplanning.js';

const PARITE = JSON.parse(readFileSync(new URL('./fixtures/volets_parite.json', import.meta.url), 'utf8'));
const PLANS = PARITE.plans;

test('les deux sens, dans l’ordre du serveur', () => {
  assert.deepEqual(SENS, ['ouverture', 'fermeture']);
});

test('un instant se lit comme le serveur le lit', () => {
  assert.ok(PARITE.instants.length >= 20, 'la fixture a perdu ses instants');
  for (const [texte, attendu] of PARITE.instants) assert.equal(epoque(texte), attendu, JSON.stringify(texte));
});

test('la règle de chaque volet : parité avec le serveur', () => {
  assert.ok(PARITE.regles.length >= 12, 'la fixture a perdu ses règles');
  for (const cas of PARITE.regles) assert.equal(regleDe(cas.plan, 'cover.x'), cas.attendu, cas.id);
});

test('le décalage de chaque volet : parité avec le serveur', () => {
  assert.ok(PARITE.decalages.length >= 4, 'la fixture a perdu ses décalages');
  for (const cas of PARITE.decalages) assert.equal(decalageDe(cas.plan, 'cover.x', cas.sens), cas.attendu, cas.id);
  /* Au-delà de neuf chiffres, un entier est illisible des deux côtés : Python
   * levait sur plus de 4 300 chiffres, et `Number` rendait Infinity. */
  const demesure = { ouverture: { decalage: 15 }, volets: { 'cover.x': { ouverture: '9'.repeat(5000) } } };
  assert.equal(decalageDe(demesure, 'cover.x', 'ouverture'), 15, 'le décalage de la maison reprend');
});

test('les prochains mouvements : parité avec le serveur, cas par cas', () => {
  assert.ok(PARITE.a_venir.length >= 15, 'la fixture a perdu des cas');
  for (const cas of PARITE.a_venir) {
    const lu = aVenir(PLANS[cas.plan], cas.volet, PARITE.soleils[cas.soleil], cas.maintenant);
    assert.deepEqual(lu, cas.attendu, cas.id);
  }
});

test('la semaine : parité avec le serveur, cas par cas', () => {
  assert.ok(PARITE.semaine.length >= 15, 'la fixture a perdu des cas');
  for (const cas of PARITE.semaine) {
    const lu = semaine(PLANS[cas.plan], cas.volet, PARITE.soleils[cas.soleil], cas.lundi);
    assert.deepEqual(lu, cas.attendu, cas.id);
  }
});

test('les jours et les décalages, plan par plan : parité avec le serveur', () => {
  /* Ce que `bouge` et `decalageDe` disent de chaque volet de chaque plan est ce
   * que tests/python/test_volets.py rejoue sur le VRAI moteur. Ici, deux cas
   * écrits à la main, qui ne se déduisent pas de la fixture. */
  const maison = PLANS.semaine_maison;
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map(j => bouge(maison, 'cover.chambre', 'ouverture', j)),
    [false, false, false, false, false, true, true], 'les jours d’un volet « Heures à lui » remplacent ceux de la maison (V5)');
  assert.equal(decalageDe(PLANS.ancienne_forme, 'cover.salon', 'ouverture'), 45, 'l’ancienne forme garde son décalage');
  assert.equal(decalageDe(PLANS.abime, 'cover.salon', 'fermeture'), 0, 'un décalage illisible vaut zéro');
});

test('rien ne lève sur un plan ou un soleil abîmés', () => {
  for (const plan of [null, [], 'x', { volets: 'x', jours: { 0: 1 }, ouverture: [], actif: true }]) {
    for (const soleil of [null, 'x', [null, 3, { date: null }], [{ date: '2026-10-21', lever: 5 }]]) {
      assert.ok(Array.isArray(aVenir(plan, 'cover.salon', soleil, '2026-10-21T00:00:00+02:00')));
      assert.equal(semaine(plan, 'cover.salon', soleil, '2026-10-19').length, 7);
    }
  }
});

test('voletsplanning.js reste pur : ni React, ni Home Assistant, ni entité en dur', () => {
  const src = readFileSync(new URL('../src/voletsplanning.js', import.meta.url), 'utf8');
  assert.ok(!/from 'react'|callService|callWS|hass\./.test(src));
  assert.ok(!/['"`](cover|binary_sensor|sensor|sun)\.[a-z0-9_]{2,}['"`]/.test(src));
  assert.ok(!/new Date\(\)|Date\.now\(\)|\bget(FullYear|Month|Date|Day|Hours|Minutes|Seconds)\(|toLocale/.test(src),
    'le fuseau du navigateur n’a rien à dire ici : les lectures en UTC seulement');
});
