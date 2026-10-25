/* Le prix de chaque heure (chantier Prises, P7 ; ADR 0173 heure par heure).
 *
 * Les kWh d'une prise se paient au prix du tarif qui tournait CETTE heure-là :
 * celui dont le compteur a avancé. Un tarif : son prix. Creuses et pleines :
 * le compteur qui a bougé, au prorata quand les deux ont bougé, l'heure d'avant
 * quand aucun n'a bougé. Aucun prix : aucun euro. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prixParHeure, coutHoraire } from '../src/tarif.js';

const h = (n) => new Date(2026, 9, 13, n, 0).getTime();   // le 13/10, à l'heure de la maison
const proche = (a, b) => Math.abs(a - b) < 1e-9;

test('un seul tarif : son prix, à toute heure — ses compteurs n’y changent rien', () => {
  const prix = prixParHeure([{ prix: 0.2516, heures: {} }]);
  assert.equal(prix(h(3)), 0.2516);
  assert.equal(prix(h(18)), 0.2516);
  assert.ok(proche(coutHoraire([{ debut: h(10), kwh: 1 }, { debut: h(11), kwh: 0.5 }], [{ prix: 0.2516, heures: {} }]), 0.3774));
  assert.equal(prixParHeure([{ prix: 0.2, heures: {} }, { prix: 0.2, heures: {} }])(h(5)), 0.2, 'deux tarifs au même prix n’en font qu’un');
});

test('creuses et pleines : le prix du compteur qui a avancé, heure par heure', () => {
  const HC = { prix: 0.1605, heures: { [h(13)]: 0.4, [h(14)]: 0.6, [h(15)]: 0.5, [h(16)]: 0.1 } };
  const HP = { prix: 0.2092, heures: { [h(12)]: 0.3, [h(16)]: 0.3, [h(17)]: 0.8, [h(18)]: 0.7 } };
  const prix = prixParHeure([HC, HP]);
  assert.equal(prix(h(14)), 0.1605, '14 h : les creuses ont tourné');
  assert.equal(prix(h(17)), 0.2092, '17 h : les pleines');
  assert.ok(proche(prix(h(16)), (0.1 * 0.1605 + 0.3 * 0.2092) / 0.4), '16 h, la bascule : au prorata de ce que chacun a compté');
  assert.equal(prix(h(20)), 0.2092, 'aucun compteur n’a bougé : le prix de l’heure d’avant');
  assert.equal(prix(h(9)), 0.2092, 'avant la première heure connue : celui de la suivante');
  // Le cycle d'un lave-vaisselle de 13:40 à 16:14 : 0,2 + 0,5 + 0,3 kWh en creuses, 0,02 à la bascule.
  const cycle = [{ debut: h(13), kwh: 0.2 }, { debut: h(14), kwh: 0.5 }, { debut: h(15), kwh: 0.3 }, { debut: h(16), kwh: 0.02 }];
  assert.ok(proche(coutHoraire(cycle, [HC, HP]), 1 * 0.1605 + 0.02 * prix(h(16))));
});

test('aucun prix : aucun euro ; plusieurs prix sans compteur qui bouge : on ne devine pas', () => {
  assert.equal(prixParHeure([]), null);
  assert.equal(prixParHeure(null), null);
  assert.equal(prixParHeure([{ prix: null, heures: { [h(10)]: 1 } }]), null, 'une connexion sans prix déclaré');
  assert.equal(coutHoraire([{ debut: h(10), kwh: 1 }], []), null);
  assert.equal(prixParHeure([{ prix: 0.16, heures: {} }, { prix: 0.21, heures: {} }]), null, 'deux tarifs, aucun compteur lu');
  assert.equal(coutHoraire([], [{ prix: 0.25, heures: {} }]), 0, 'rien consommé : zéro, pas « inconnu »');
});
