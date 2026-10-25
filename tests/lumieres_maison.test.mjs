/* L'écran a UNE seule idée de la lumière (ADR 0261 ; L11, L2) : src/lumieres.js, pur.
 *
 * Une lumière de la maison est un `light.*` sans catégorie — la LED d'une borne
 * Wi-Fi (`config`) n'en est pas une —, ni caché ni désactivé dans le registre,
 * ou un switch que la maison déclare lumière ; un groupe de lumières dont des
 * membres sont déjà là ne compte pas deux fois : on garde les membres. Et ce
 * qu'on ÉPARGNE partout — « Tout éteindre », la tuile d'une pièce, le repli
 * des Scènes — : les veilleuses de la règle Nuit, et les groupes qui en
 * contiennent une. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
const L = await import('../src/lumieres.js');

const st = (id, state = 'on', attributes = {}) => [id, { entity_id: id, state, attributes }];
/* Sa maison, en petit : deux lampes, la LED de la borne, une lampe cachée et une désactivée, un switch déclaré,
 * une prise ordinaire, un groupe des deux lampes, un groupe dont le membre n'est pas dans le relevé. */
const S = Object.fromEntries([
  st('light.bureau'), st('light.chambre', 'off'), st('light.borne_voyant'), st('light.cachee'), st('light.desactivee'),
  st('switch.applique'), st('switch.prise_nas'),
  st('light.groupe_chambres', 'on', { entity_id: ['light.chambre', 'light.bureau'] }),
  st('light.groupe_orphelin', 'on', { entity_id: ['light.ailleurs'] }),
]);
const META = new Map([
  ['light.borne_voyant', { category: 'config' }],
  ['light.cachee', { hidden: true }],
  ['light.desactivee', { disabled: true }],
  ['light.bureau', {}],
]);
const CTX = { meta: META, switchsLumiere: ['switch.applique'] };

test('L11 : les lumières de la maison — sans la LED de configuration, ni ce que le registre cache ou désactive, avec le switch déclaré', () => {
  assert.deepEqual(L.lumieresDe(S, CTX).sort(), ['light.bureau', 'light.chambre', 'light.groupe_orphelin', 'switch.applique']);
  assert.ok(!L.lumieresDe(S, CTX).includes('light.borne_voyant'), 'la LED d’une borne Wi-Fi : sa catégorie le dit');
  assert.ok(!L.lumieresDe(S, CTX).includes('switch.prise_nas'), 'une prise ordinaire n’est pas une lumière');
  assert.deepEqual(L.lumieresDe(S, { switchsLumiere: ['switch.applique'] }).sort(), ['light.borne_voyant', 'light.bureau', 'light.cachee', 'light.chambre', 'light.desactivee', 'light.groupe_orphelin', 'switch.applique'],
    'avant que l’index soit lu, tout light.* compte — rien ne manque à l’écran pendant la première seconde');
  assert.deepEqual(L.lumieresDe(S, { ...CTX, ids: ['light.bureau', 'light.borne_voyant', 'switch.prise_nas', 'light.absente'] }), ['light.bureau'], '`ids` restreint, et une entité absente du relevé n’est pas inventée');
  assert.deepEqual(L.lumieresDe(null, CTX), []);
});

test('les groupes dédoublonnés : un groupe dont un membre est déjà là s’efface, on garde les membres', () => {
  assert.ok(!L.lumieresDe(S, CTX).includes('light.groupe_chambres'), 'ses deux membres sont dans l’ensemble');
  assert.ok(L.lumieresDe(S, CTX).includes('light.groupe_orphelin'), 'son membre n’est pas dans l’ensemble : le groupe est la seule carte de cette lampe');
  assert.deepEqual(L.membresDuGroupe(S['light.groupe_chambres']), ['light.chambre', 'light.bureau']);
  assert.deepEqual(L.membresDuGroupe(S['light.bureau']), [], 'une lampe seule n’a pas de membres');
  assert.deepEqual(L.membresDuGroupe(null), []);
  // Un groupe de groupes : le groupe du dessus contient le groupe du dessous, qui reste ; le dessus s'efface.
  const S2 = { ...S, 'light.tout': { state: 'on', attributes: { entity_id: ['light.groupe_chambres'] } } };
  assert.deepEqual(L.sansGroupesDoubles(['light.tout', 'light.groupe_chambres', 'light.chambre'], S2), ['light.chambre'], 'chaque groupe dont un membre est là s’efface, de proche en proche');
  assert.deepEqual(L.sansGroupesDoubles(['light.tout', 'light.groupe_chambres'], S2), ['light.groupe_chambres']);
});

test('L2 : les veilleuses de la règle Nuit, lues dans `loggia/nuit/etat` ; null tant qu’elle n’est pas lue', () => {
  assert.deepEqual(L.veilleusesDe({ config: { veilleuse: { lampes: ['light.veilleuse', 3, null] } } }), ['light.veilleuse']);
  assert.deepEqual(L.veilleusesDe({ config: {} }), []);
  assert.equal(L.veilleusesDe(null), null);
  assert.equal(L.veilleusesDe('x'), null);
});

test('L2 : ce qu’on épargne — une veilleuse, et tout groupe qui en contient une, de proche en proche, sans boucler', () => {
  const V = ['light.veilleuse'];
  const S3 = Object.fromEntries([
    st('light.veilleuse'), st('light.chambre'),
    st('light.groupe_chambre', 'on', { entity_id: ['light.chambre', 'light.veilleuse'] }),
    st('light.groupe_tout', 'on', { entity_id: ['light.groupe_chambre', 'light.bureau'] }),
    st('light.bureau'),
    st('light.boucle_a', 'on', { entity_id: ['light.boucle_b'] }), st('light.boucle_b', 'on', { entity_id: ['light.boucle_a'] }),
  ]);
  assert.equal(L.estEpargnee('light.veilleuse', S3, V), true);
  assert.equal(L.estEpargnee('light.groupe_chambre', S3, V), true, 'son turn_off éteindrait la veilleuse');
  assert.equal(L.estEpargnee('light.groupe_tout', S3, V), true, 'un groupe de groupes aussi');
  assert.equal(L.estEpargnee('light.chambre', S3, V), false);
  assert.equal(L.estEpargnee('light.boucle_a', S3, V), false, 'une configuration en boucle ne fige rien');
  assert.equal(L.estEpargnee('light.veilleuse', S3, null), false, 'veilleuses inconnues : rien n’est épargné ici — l’appelant décide d’attendre');
  assert.equal(L.estEpargnee('light.veilleuse', S3, []), false, 'sans veilleuse (module Nuit absent) : rien à épargner');
  assert.deepEqual(L.sansEpargnees(['light.veilleuse', 'light.groupe_chambre', 'light.chambre', 'light.bureau'], S3, V), ['light.chambre', 'light.bureau']);
  assert.deepEqual(L.sansEpargnees(['light.veilleuse', 'light.chambre'], S3, null), ['light.veilleuse', 'light.chambre']);
});
