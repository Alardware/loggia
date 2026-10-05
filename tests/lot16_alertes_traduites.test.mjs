/* Le generateur du catalogue du telephone ne recopie que des chaines (05/10).
 *
 * `scripts/textes_serveur.mjs` recopiait `cat[cle]` tel quel. Un pluriel
 * polonais {few, many, other} (ADR 0071) aurait atterri dans
 * textes_catalogue.py, et remplir() du serveur aurait envoye son str() au
 * telephone — « {'few': … } » en guise d'alerte. Il s'arrete maintenant et
 * nomme la langue et la cle. Le lien entre les messages du code et ce
 * catalogue est teste cote Python : tests/python/test_lot16_alertes_traduites.py. */
import test from 'node:test';
import assert from 'node:assert/strict';

import { clesTelephone, CLES_TELEPHONE } from '../scripts/textes_serveur.mjs';

const FUMEE = 'Fumée détectée : {nom}';

test('une valeur qui n’est pas une chaine arrete le generateur, et dit ou', () => {
  assert.ok(CLES_TELEPHONE.includes(FUMEE));
  const pluriel = { [FUMEE]: { few: 'a', many: 'b', other: 'c' } };
  assert.throws(() => clesTelephone(pluriel, 'pl'), (e) => e.message.includes('pl.js') && e.message.includes(FUMEE));
  assert.throws(() => clesTelephone({ [FUMEE]: 7 }, 'de'), /de\.js/);
});

test('les chaines passent, l’absent et le vide restent dehors', () => {
  const cat = { [FUMEE]: 'Rauch erkannt: {nom}', 'Loggia — sûreté': '', 'autre chose': 'x' };
  assert.deepEqual(clesTelephone(cat, 'de'), [[FUMEE, 'Rauch erkannt: {nom}']]);
  assert.deepEqual(clesTelephone({}, 'de'), []);
});
