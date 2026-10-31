/* L'énergie d'un chauffage, dans l'Historique de sa fiche (30/10) : ce que
 * comptent `fusionStats`, `tranchesKwh` et `bilanEnergie` (src/chauffageenergie.js).
 * L'heure est celle de Paris (tests/environnement.mjs). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fusionStats, tranchesKwh, bilanEnergie } from '../src/chauffageenergie.js';

const H = 3600000;
// Vendredi 30 octobre 2026, 15:30 à Paris ; minuit, et la veille à minuit.
const MAINTENANT = new Date(2026, 9, 30, 15, 30).getTime();
const MINUIT = new Date(2026, 9, 30).getTime();
const VEILLE = new Date(2026, 9, 29).getTime();
const ligne = (start, o) => ({ start, end: start + H, ...o });

test('les deux lectures se cousent sans rien compter deux fois', () => {
  const coupe = MINUIT + 14 * H;
  const heures = { 'sensor.e': [ligne(MINUIT + 13 * H, { change: 1 }), ligne(coupe, { change: 9 })], 'sensor.x': 'pas une liste' };
  const cinq = { 'sensor.e': [{ start: coupe - 300000, change: 9 }, { start: coupe, end: coupe + 300000, change: 0.1 }] };
  assert.deepEqual(fusionStats(heures, cinq, coupe), { 'sensor.e': [heures['sensor.e'][0], cinq['sensor.e'][1]] });
  assert.deepEqual(fusionStats(null, undefined, coupe), {});
});

test('le compteur compte ; sans lui, la puissance moyenne fois la durée, dite estimée', () => {
  const stats = {
    'sensor.e': [ligne(MINUIT, { change: 0.4 }), ligne(MINUIT + H, { change: -12 })],
    'sensor.p': [ligne(MINUIT, { mean: 1500 }), { start: MINUIT + H, end: MINUIT + H + 300000, mean: 1200 }],
  };
  assert.deepEqual(tranchesKwh(stats, 'sensor.e', 'sensor.p'),
    { tranches: [{ debut: MINUIT, kwh: 0.4 }, { debut: MINUIT + H, kwh: 0 }], estime: false }, 'un compteur remis à zéro ne compte pas en négatif');
  const p = tranchesKwh(stats, null, 'sensor.p');
  assert.equal(p.estime, true);
  assert.deepEqual(p.tranches.map(x => Math.round(x.kwh * 1000) / 1000), [1.5, 0.1], '1 500 W une heure, 1 200 W cinq minutes');
  // Un compteur sans sommes (pas de `state_class`) laisse la puissance compter.
  assert.equal(tranchesKwh({ 'sensor.e': [ligne(MINUIT, { mean: 3 })], 'sensor.p': stats['sensor.p'] }, 'sensor.e', 'sensor.p').estime, true);
  assert.deepEqual(tranchesKwh({}, 'sensor.e', 'sensor.p'), { tranches: [], estime: false });
});

test('le bilan : aujourd’hui, hier, et les 24 barres jusqu’à l’heure en cours', () => {
  const tranches = [
    { debut: VEILLE + 3 * H, kwh: 2 },          // hier, hors des 24 dernières heures
    { debut: VEILLE + 20 * H, kwh: 0.5 },       // hier, dans les 24 dernières heures
    { debut: MINUIT + 7 * H, kwh: 1 }, { debut: MINUIT + 15 * H, kwh: 0.25 },
  ];
  const b = bilanEnergie(tranches, { maintenant: MAINTENANT, jours: 1 });
  assert.equal(b.aujourdhui, 1.25);
  assert.equal(b.hier, 2.5);
  assert.equal(b.barres.length, 24);
  assert.equal(b.barres[23].debut, MINUIT + 15 * H, 'la dernière barre : l’heure en cours');
  assert.equal(b.barres[0].debut, VEILLE + 16 * H);
  assert.equal(b.total, 1.75);
  assert.deepEqual(b.trancheJour.map(x => x.kwh), [1, 0.25], 'les tranches du jour, pour leur prix');
});

test('le bilan sur 7 jours : une barre par jour, jusqu’à aujourd’hui', () => {
  const tranches = [{ debut: new Date(2026, 9, 23, 12).getTime(), kwh: 9 }, { debut: new Date(2026, 9, 24, 12).getTime(), kwh: 3 },
    { debut: VEILLE + H, kwh: 2 }, { debut: MINUIT + H, kwh: 1 }];
  const b = bilanEnergie(tranches, { maintenant: MAINTENANT, jours: 7 });
  assert.deepEqual(b.barres.map(x => x.kwh), [3, 0, 0, 0, 0, 2, 1], 'le 23 est avant la semaine');
  assert.equal(b.barres[0].debut, new Date(2026, 9, 24).getTime());
  assert.equal(b.total, 6);
});

test('rien lu n’est pas zéro : sans tranche, ni aujourd’hui, ni hier, ni total', () => {
  const b = bilanEnergie([], { maintenant: MAINTENANT });
  assert.equal(b.aujourdhui, null);
  assert.equal(b.hier, null);
  assert.equal(b.total, null);
  assert.equal(b.barres.length, 24);
  // Une tranche hier seulement : aujourd'hui vaut zéro, il a été lu.
  assert.equal(bilanEnergie([{ debut: VEILLE + H, kwh: 1 }], { maintenant: MAINTENANT }).aujourdhui, 0);
});

test('le changement d’heure : la veille d’un dimanche de 25 heures se compte de minuit à minuit', () => {
  // Dimanche 25 octobre 2026 : on recule d'une heure à 3 h. Lundi 26, 10:00.
  const lundi = new Date(2026, 9, 26, 10).getTime();
  const dimanche = new Date(2026, 9, 25).getTime();
  const b = bilanEnergie([{ debut: dimanche, kwh: 1 }, { debut: new Date(2026, 9, 25, 23, 30).getTime(), kwh: 1 }], { maintenant: lundi });
  assert.equal(b.hier, 2);
  assert.equal(b.aujourdhui, 0);
});
