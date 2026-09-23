/* Le catalogue du telephone est genere, jamais ecrit a la main (ADR 0070).
 *
 * `custom_components/loggia/textes_catalogue.py` recopie, depuis les
 * catalogues du frontend, les seules cles que le serveur envoie au telephone.
 * S'il est en retard sur `src/langues/`, une alerte partirait en anglais chez
 * un Allemand : ce test le dit avant. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { catalogueTelephone, rendrePython, CLES_TELEPHONE } from '../scripts/textes_serveur.mjs';
import { CHARGEURS } from '../src/langues/index.js';

test('textes_catalogue.py est a jour sur src/langues', async () => {
  const attendu = rendrePython(await catalogueTelephone());
  const actuel = readFileSync(new URL('../custom_components/loggia/textes_catalogue.py', import.meta.url), 'utf8');
  assert.equal(actuel, attendu, 'relancer : node scripts/textes_serveur.mjs');
});

test('chaque cle du telephone existe dans le catalogue anglais', async () => {
  const en = (await CHARGEURS.en()).default;
  for (const k of CLES_TELEPHONE) assert.ok(en[k], 'absente d’en.js : ' + k);
});
