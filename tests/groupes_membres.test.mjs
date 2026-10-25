/* Les membres des groupes de capteurs binaires et leur nom (chantier Capteurs, étapes 2 et 3, tâche 2 ; C20, C21, § 3, § 19.3).
 *
 * Ce qui est garanti ici, sans écran (groupes.js est pur) :
 *  - C21 : la CLASSE dit le groupe, jamais le nom — Ouvertures (`door`, `window`, `garage_door`, `opening`), Sécurité (`smoke`,
 *    `carbon_monoxide`, `gas`, `moisture`, `safety`), Présence (`motion`, `occupancy`, `presence`) ; le sabotage et la
 *    vibration ne sont d'aucun groupe ;
 *  - C21 : un membre est porté par un APPAREIL PHYSIQUE, n'est ni masqué, ni désactivé, ni de catégorie ; un modèle sans
 *    appareil, un service, une vigilance météo (C28) n'entrent nulle part ;
 *  - § 19.3 (tranché le 16/10) : Présence prend les caméras — leur mouvement, et la sonnette en `occupancy` ;
 *  - MeteoAlarm se reconnaît par la règle de l'Accueil (attention.js) ;
 *  - § 3 : le nom d'un membre — sa pièce de Loggia s'il y est seul de son groupe, sinon son appareil, sinon son nom. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { maisonGroupes, ctxDe } from './maison_capteurs.mjs';
import { GROUPES, FAMILLES_GROUPES, groupeDeClasse, estMeteoAlarm, membresGroupes, nomsMembres } from '../src/groupes.js';
import { pointsAttention } from '../src/attention.js';

const PIECES = ['Séjour', 'Chambre', 'Cuisine'];

test('C21 : la classe dit le groupe, jamais le nom — le sabotage et la vibration ne sont d’aucun groupe', () => {
  assert.deepEqual(GROUPES, ['ouvertures', 'securite', 'presence']);
  // ASSERTION MODIFIÉE (audit du 19/10, point 14) : les familles viennent de LA table d'attention.js — les portes, puis les fenêtres.
  assert.deepEqual(FAMILLES_GROUPES, {
    ouvertures: ['door', 'garage_door', 'window', 'opening'],
    securite: ['smoke', 'carbon_monoxide', 'gas', 'moisture', 'safety'],
    presence: ['motion', 'occupancy', 'presence'],
  });
  assert.deepEqual(['door', 'opening', 'gas', 'moisture', 'occupancy', 'tamper', 'vibration', 'problem', 'battery', undefined].map(groupeDeClasse),
    ['ouvertures', 'ouvertures', 'securite', 'securite', 'presence', null, null, null, null, null]);
});

test('C21, § 19.3 : un appareil physique, ni masqué, ni désactivé, ni de catégorie — les caméras comprises ; ni modèle, ni service, ni vigilance', () => {
  const fx = maisonGroupes();
  const m = membresGroupes(fx.states, ctxDe(fx, PIECES));
  assert.deepEqual(m, {
    ouvertures: ['binary_sensor.baie_vitree', 'binary_sensor.fenetre_chambre', 'binary_sensor.garage_arriere', 'binary_sensor.garage_avant', 'binary_sensor.porte_entree'],
    securite: ['binary_sensor.camera_jardin_co', 'binary_sensor.camera_porte_co'],
    presence: ['binary_sensor.camera_jardin_mouvement', 'binary_sensor.camera_porte_mouvement', 'binary_sensor.camera_porte_sonnette', 'binary_sensor.enceinte_mouvement'],
  });
  const tous = Object.values(m).flat();
  for (const id of ['binary_sensor.porte_cave', 'binary_sensor.ficus_besoin_eau', 'binary_sensor.monstera_besoin_eau', 'binary_sensor.meteoalarm'])
    assert.ok(!tous.includes(id), id + ' : sans appareil, il n’entre nulle part');
  assert.ok(!tous.includes('binary_sensor.fumee_en_ligne'), 'l’appareil d’un service n’est pas physique (C14)');
  assert.ok(!tous.includes('binary_sensor.fuite_cuisine') && !tous.includes('binary_sensor.co_cuisine') && !tous.includes('binary_sensor.porte_diagnostic'), 'masqué, désactivé, de catégorie');
  assert.ok(!tous.includes('binary_sensor.vigilance_appareil'), 'une vigilance n’est pas un détecteur, même portée par un appareil (C28)');
  assert.ok(!tous.some(id => /sabotage|vibration/.test(id)), 'le sabotage se dit sur la ligne de sa porte');
});

test('MeteoAlarm : la règle de l’Accueil — l’attribut, l’attribution, à défaut l’identifiant', () => {
  const cas = [
    ['binary_sensor.meteoalarm', { device_class: 'safety' }, true],
    ['binary_sensor.vigilance', { device_class: 'safety', awareness_level: '2; yellow; Moderate' }, true],
    ['binary_sensor.alerte', { device_class: 'safety', attribution: 'Information provided by MeteoAlarm' }, true],
    ['binary_sensor.alerte', { device_class: 'safety' }, false],
    ['binary_sensor.meteoalarm', { device_class: 'moisture' }, false],
  ];
  for (const [id, a, attendu] of cas) {
    assert.equal(estMeteoAlarm(id, a), attendu, id + ' ' + JSON.stringify(a));
    // L'Accueil en fait une vigilance, et seulement d'elle : les deux règles disent la même chose.
    const points = pointsAttention({ S: { [id]: { state: 'on', attributes: a } } });
    assert.equal(points.some(p => p.cle.indexOf('meteo:') === 0), attendu, 'pointsAttention ' + id);
  }
});

test('§ 3 : le nom d’un membre — sa pièce s’il y est seul de son groupe, sinon son appareil, sinon son nom', () => {
  const fx = maisonGroupes();
  const ctx = ctxDe(fx, PIECES);
  const m = membresGroupes(fx.states, ctx);
  const noms = (g) => [...nomsMembres(m[g], fx.states, ctx).values()];
  // Deux portes au séjour : leurs appareils ; le garage n'est pas une pièce de Loggia : leurs appareils ; la fenêtre, seule dans la chambre : « Chambre ».
  assert.deepEqual(noms('ouvertures'), ['Contact baie vitrée', 'Chambre', 'Contact garage arrière', 'Contact garage avant', 'Contact porte entrée']);
  // L'enceinte, seule au séjour : « Séjour » ; les caméras, dans une zone qui n'est pas une pièce : leurs appareils.
  assert.deepEqual(noms('presence'), ['Caméra jardin', 'Caméra porte', 'Caméra porte', 'Séjour']);
  // Sans appareil connu ni pièce : son nom de Home Assistant.
  const seul = nomsMembres(['binary_sensor.porte_cave'], fx.states, { ...ctx, appareil: () => null });
  assert.equal(seul.get('binary_sensor.porte_cave'), 'Porte cave');
});
