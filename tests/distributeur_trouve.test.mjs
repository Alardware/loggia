// ─────────────────────────────────────────────────────────────────────────────
// Le distributeur se TROUVE (07/10).
//
// C'était le dernier appareil à n'exister que par sa fiche : sans une entité
// nommée à la main dans Paramètres, pas de carte, pas de vue, rien. Home
// Assistant n'a pourtant pas de domaine pour ces appareils — aucun `vacuum.`
// ne les désigne —, mais les intégrations qui en gèrent nomment leurs entités
// de la même façon, par une CLÉ DE TRADUCTION : le même mot dans toutes les
// langues, et c'est déjà sur elles que repose toute la lecture du distributeur.
//
// Deux familles de signaux au minimum : `portions` tout seul pourrait être
// autre chose, et poser une carte de croquettes sur un appareil qui n'en est
// pas un serait pire que de n'en poser aucune.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trouverDistributeur, appareilDistributeur } from '../src/distributeur.js';

/* Un index minimal : seules `translationKey`, `deviceId` et `disabled`
 * comptent. Tous les identifiants sont fictifs. */
const indexDe = (lignes) => ({
  entityMeta: new Map(lignes.map(([id, deviceId, translationKey, extra]) => [
    id, { deviceId, translationKey, disabled: false, hidden: false, ...(extra || {}) },
  ])),
});

test('un appareil à DEUX signaux est un distributeur', () => {
  const i = indexDe([
    ['number.x_portions', 'dev_croq', 'portions'],
    ['sensor.x_next', 'dev_croq', 'next_feed_time'],
    ['light.salon', 'dev_lampe', 'brightness'],
  ]);
  assert.equal(trouverDistributeur(i), 'dev_croq');
});

test('UN SEUL signal ne suffit pas', () => {
  const i = indexDe([
    ['number.x_portions', 'dev_peutetre', 'portions'],
    ['sensor.autre', 'dev_peutetre', 'temperature'],
  ]);
  assert.equal(trouverDistributeur(i), null);
});

test('une maison sans distributeur n’en invente pas', () => {
  const i = indexDe([
    ['light.salon', 'dev_lampe', 'brightness'],
    ['vacuum.robot', 'dev_robot', 'status'],
    ['sensor.conso', 'dev_linky', 'energy'],
  ]);
  assert.equal(trouverDistributeur(i), null);
  assert.equal(trouverDistributeur({ entityMeta: new Map() }), null);
  assert.equal(trouverDistributeur(null), null);
});

test('les signaux des différentes intégrations sont reconnus', () => {
  // petlibro : programme + niveau bas
  assert.equal(trouverDistributeur(indexDe([
    ['text.a', 'dev_petlibro', 'feeding_schedule'],
    ['binary_sensor.b', 'dev_petlibro', 'food_low'],
  ])), 'dev_petlibro');
  // tuya-local : plan de repas + poids de portion
  assert.equal(trouverDistributeur(indexDe([
    ['text.a', 'dev_tuya', 'meal_plan'],
    ['number.b', 'dev_tuya', 'portion_weight'],
  ])), 'dev_tuya');
  // zigbee2mqtt : un programme par suffixe + un compteur par jour
  assert.equal(trouverDistributeur(indexDe([
    ['text.a', 'dev_z2m', 'feeder_schedule'],
    ['sensor.b', 'dev_z2m', 'portions_per_day'],
  ])), 'dev_z2m');
  // petkit : consommable + dernier repas
  assert.equal(trouverDistributeur(indexDe([
    ['sensor.a', 'dev_petkit', 'desiccant_left_days'],
    ['sensor.b', 'dev_petkit', 'last_feed_time'],
  ])), 'dev_petkit');
});

test('une entité MASQUÉE compte, une DÉSACTIVÉE non', () => {
  /* tuya-local masque son `meal_plan` : l'écarter ferait croire à un appareil
   * sans programme. Une désactivée, elle, n'a pas d'état. */
  assert.equal(trouverDistributeur(indexDe([
    ['text.a', 'dev_m', 'meal_plan', { hidden: true }],
    ['number.b', 'dev_m', 'portion_weight'],
  ])), 'dev_m');
  assert.equal(trouverDistributeur(indexDe([
    ['text.a', 'dev_d', 'meal_plan', { disabled: true }],
    ['number.b', 'dev_d', 'portion_weight'],
  ])), null);
});

test('une entité SANS appareil ne désigne rien', () => {
  assert.equal(trouverDistributeur(indexDe([
    ['number.a', null, 'portions'],
    ['sensor.b', null, 'next_feed_time'],
  ])), null);
});

test('deux candidats : le plus fourni, et toujours le même', () => {
  const i = indexDe([
    ['number.a', 'dev_zz', 'portions'],
    ['sensor.b', 'dev_zz', 'next_feed_time'],
    ['number.c', 'dev_aa', 'portions'],
    ['sensor.d', 'dev_aa', 'next_feed_time'],
    ['sensor.e', 'dev_aa', 'desiccant_left_days'],
  ]);
  assert.equal(trouverDistributeur(i), 'dev_aa', 'celui qui a le plus de signaux');
  assert.equal(trouverDistributeur(i), 'dev_aa', 'et la réponse ne bouge pas');
});

test('ce qui est DÉSIGNÉ passe toujours devant ce qui est trouvé', () => {
  const i = indexDe([
    ['number.x', 'dev_trouve', 'portions'],
    ['sensor.y', 'dev_trouve', 'next_feed_time'],
    ['number.mien', 'dev_choisi', 'quelque_chose'],
  ]);
  assert.equal(appareilDistributeur(i, { appareil: 'dev_a_la_main' }), 'dev_a_la_main', 'l’appareil nommé');
  assert.equal(appareilDistributeur(i, { haids: { portionWeight: 'number.mien' } }), 'dev_choisi', 'l’appareil d’une entité désignée');
  assert.equal(appareilDistributeur(i, null), 'dev_trouve', 'et sinon, celui qu’on trouve');
});
