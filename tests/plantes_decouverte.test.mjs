/* Une plante se découvre (chantier Capteurs, étapes 2 et 3, tâche 2 ; C29, § 7.1).
 *
 * Ce qui est garanti ici, sans écran (plantes.js est pur) :
 *  - une plante est un APPAREIL physique qui mesure le sol (`moisture`) ET la conductivité (`conductivity`, ou l'unité µS/cm) ;
 *    une sonde de sol seule, un service, une sonde masquée n'en sont pas ;
 *  - son nom est celui de l'appareil (le nom posé dans Home Assistant d'abord), sa base le début commun de ses capteurs, sa
 *    pièce celle de l'appareil si c'est une pièce de Loggia ;
 *  - `loggia_plants` complète la découverte : la clé, le nom, la pièce, le dessin ; une base sans appareil marche comme avant. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { maisonPlantes, ctxDe } from './maison_capteurs.mjs';
import { baseCommune, plantesDecouvertes, plantesMaison } from '../src/plantes.js';

const PIECES = ['Bureau', 'Séjour'];

test('C29 : une plante est un appareil qui mesure le sol ET la conductivité — ni une sonde de sol seule, ni un service, ni une sonde masquée', () => {
  const fx = maisonPlantes();
  const p = plantesDecouvertes(fx.states, ctxDe(fx, PIECES));
  assert.deepEqual(p.map(x => x.nom), ['Monstera', 'Ficus', 'Orchidée']);
  assert.deepEqual(p.find(x => x.nom === 'Ficus').capteurs, { hum: 'sensor.ficus_moisture', cond: 'sensor.ficus_conductivity', lux: 'sensor.ficus_illuminance',
    temp: 'sensor.ficus_temperature', bat: 'sensor.ficus_battery' }, 'ses capteurs, par l’appareil — la pile de diagnostic comprise');
  assert.equal(p.find(x => x.nom === 'Orchidée').capteurs.cond, 'sensor.orchidee_engrais', 'la conductivité reconnue à son unité, en second recours');
  assert.equal(p.find(x => x.nom === 'Orchidée').capteurs.bat, null, 'un sol en % n’est pas une pile : la pile se reconnaît à sa classe seule, et un capteur ne joue qu’un rôle');
});

test('C29 : son nom est celui de l’appareil, sa base le début commun de ses capteurs, sa pièce une pièce de Loggia ou rien', () => {
  const fx = maisonPlantes();
  const p = plantesDecouvertes(fx.states, ctxDe(fx, PIECES));
  assert.deepEqual(p.map(x => [x.nom, x.base, x.piece]), [
    ['Monstera', 'sensor.capteur_plante_7f3e', 'Bureau'],
    ['Ficus', 'sensor.ficus', ''],
    ['Orchidée', 'sensor.orchidee', 'Séjour'],
  ], '« Technique » n’est pas une pièce : rien sous le Ficus');
  assert.deepEqual([baseCommune(['sensor.a_b_sol', 'sensor.a_b_pile']), baseCommune(['sensor.seul']), baseCommune([])], ['sensor.a_b', 'sensor.seul', '']);
});

test('C29 : loggia_plants complète la découverte — la clé, le nom, la pièce, le dessin ; une base sans appareil marche comme avant', () => {
  const fx = maisonPlantes();
  const config = [{ base: 'sensor.ficus', name: 'Ficus lyrata', room: 'Séjour', img: 'dracaena' }, { base: 'sensor.basilic', name: 'Basilic', room: 'Cuisine' }, { name: 'sans base' }];
  const p = plantesMaison(fx.states, ctxDe(fx, PIECES), config);
  assert.deepEqual(p.map(x => [x.base, x.nom, x.piece, x.img, !!x.capteurs]), [
    ['sensor.basilic', 'Basilic', 'Cuisine', null, false],
    ['sensor.ficus', 'Ficus lyrata', 'Séjour', 'dracaena', true],
    ['sensor.capteur_plante_7f3e', 'Monstera', 'Bureau', null, true],
    ['sensor.orchidee', 'Orchidée', 'Séjour', null, true],
  ], 'par nom ; la plante configurée garde sa clé plant:{base}');
  // Une base configurée qui ne nomme rien : la découverte garde son nom et sa pièce.
  const sansNom = plantesMaison(fx.states, ctxDe(fx, PIECES), [{ base: 'sensor.capteur_plante_7f3e' }]);
  assert.deepEqual(sansNom.filter(x => x.base === 'sensor.capteur_plante_7f3e').map(x => [x.nom, x.piece]), [['Monstera', 'Bureau']]);
});
