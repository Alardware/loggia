// ─────────────────────────────────────────────────────────────────────────────
// Ce que l'ADMIN ajoute ou retire sur une VUE vaut pour TOUS les profils (20/10).
// Pas les Favoris ni l'Accueil : « l'interface est propre à chacun » (ticket #43).
//
// « Sur PC ou mobile, en admin, si je supprime une carte ou en ajoute une, ça
// ne se répète pas sur les autres profils et appareils : je suis obligé, pour
// chacun, de reproduire l'opération. »
//
// L'ADR 0185 rangeait tout par profil — le rangement, juste, mais aussi le
// CONTENU : quelles cartes existent sur une vue. Désormais, un geste de contenu
// fait par un profil Admin part dans la part de CHAQUE profil (la part commune
// « * » comprise) ; l'ordre, les tailles et les places de chacun restent les
// siens. Un profil ordinaire range toujours chez lui seul (tests/
// reglages_par_profil.test.mjs). Cette suite vérifie le COMPORTEMENT : l'admin
// agit, on regarde ce que l'autre profil voit.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true });
const S = await import('../src/state.js');

const USERS = [{ name: 'Guillaume', role: 'Admin' }, { name: 'Luna', role: 'Utilisateur' }, { name: 'Lino', role: 'Utilisateur' }];
const regarde = (id, cfg = {}) =>
  S.setLoggiaState({ cfg: { loggia_users: USERS, loggia_active_user: String(id), ...cfg }, server: true });
const part = (k, id) => S.LOGGIA_CFG[k].__profils[id];

test('l’admin retire une carte d’une vue : elle part chez tous, chacun garde son ordre', () => {
  const avant = { __profils: {
    0: { objets: { order: ['a', 'b', 'c'] } },
    1: { objets: { order: ['c', 'b', 'a'], compacts: ['a'] } },
    '*': { objets: {} },
  } };
  regarde(0, { loggia_objlayout: avant });
  S.cfgSet({ loggia_objlayout: { objets: { order: ['a', 'c'], removed: ['b'] } } });
  assert.deepEqual(part('loggia_objlayout', 0).objets.removed, ['b']);
  assert.deepEqual(part('loggia_objlayout', 1).objets.removed, ['b'], 'Luna voit encore la carte retirée');
  assert.deepEqual(part('loggia_objlayout', 1).objets.order, ['c', 'b', 'a'], 'l’ordre de Luna a été touché');
  assert.deepEqual(part('loggia_objlayout', 1).objets.compacts, ['a'], 'les tailles de Luna ont été touchées');
  assert.deepEqual(part('loggia_objlayout', '*').objets.removed, ['b'], 'un profil sans part (Lino) la verrait encore');
});

/* Le cas d'une maison où personne n'a encore rien rangé (vu en démonstration le
 * 20/10) : il n'y a ni part des autres ni part commune « * ». Sans elle, le
 * retrait de l'admin restait dans sa seule part, et l'Invité voyait la carte. */
test('premier geste de la maison : un profil qui n’a jamais rien rangé suit l’admin', () => {
  regarde(0, { loggia_objlayout: null });
  S.cfgSet({ loggia_objlayout: { objets: { removed: ['light.bureau'] } } });
  assert.deepEqual(part('loggia_objlayout', '*').objets.removed, ['light.bureau'], 'pas de part commune créée');
  regarde(1, { loggia_objlayout: S.LOGGIA_CFG.loggia_objlayout });
  assert.deepEqual(S.cfgVal('loggia_objlayout', null), { objets: { removed: ['light.bureau'] } }, 'l’Invité voit encore la carte');
});

test('l’admin ajoute une carte : elle arrive chez tous, avec son nom et son type', () => {
  regarde(0, { loggia_seclayout: { __profils: { 0: { securite: {} }, 1: { securite: { removed: ['x'] } } } } });
  S.cfgSet({ loggia_seclayout: { securite: { added: ['sensor.porte'], labels: { 'sensor.porte': 'Porte' }, types: { 'sensor.porte': 'ouverture' } } } });
  const l = part('loggia_seclayout', 1).securite;
  assert.deepEqual(l.added, ['sensor.porte'], 'la carte ajoutée n’arrive pas chez Luna');
  assert.equal(l.labels['sensor.porte'], 'Porte');
  assert.equal(l.types['sensor.porte'], 'ouverture');
  assert.deepEqual(l.removed, ['x'], 'ce que Luna avait retiré elle-même est perdu');
});

test('l’admin remet une carte proposée qu’il avait retirée : elle revient chez tous', () => {
  regarde(0, { loggia_enlayout: { __profils: { 0: { energie: { removed: ['solaire'] } }, 1: { energie: { removed: ['solaire', 'pac'] } } } } });
  S.cfgSet({ loggia_enlayout: { energie: {} } });
  assert.deepEqual(part('loggia_enlayout', 1).energie.removed, ['pac'], 'seule la carte remise doit revenir chez Luna');
});

test('un profil ordinaire range chez lui seul — y compris un retrait', () => {
  regarde(1, { loggia_objlayout: { __profils: { 0: { objets: {} }, 1: { objets: {} } } } });
  S.cfgSet({ loggia_objlayout: { objets: { removed: ['b'] } } });
  assert.deepEqual(part('loggia_objlayout', 0).objets, {}, 'le retrait de Luna a touché l’admin');
  assert.deepEqual(part('loggia_objlayout', 1).objets.removed, ['b']);
});

test('un changement d’ordre de l’admin reste à lui', () => {
  regarde(0, { loggia_objlayout: { __profils: { 0: { objets: { order: ['a', 'b'] } }, 1: { objets: { order: ['b', 'a'] } } } } });
  S.cfgSet({ loggia_objlayout: { objets: { order: ['b', 'a'] } } });
  S.cfgSet({ loggia_objlayout: { objets: { order: ['a', 'b'], larges: ['a'] } } });
  assert.deepEqual(part('loggia_objlayout', 1).objets, { order: ['b', 'a'] });
});

/* ASSERTION MODIFIÉE (ticket #43, 02/11) : les Favoris ne passent plus d'un profil à l'autre — « je modifie sur mobile en tant
 * que Guillaume, ça modifie aussi sur PC en Admin, et vice versa ». Chacun garde les siens, même quand c'est un Admin qui épingle. */
test('les Favoris restent à chaque profil, même épinglés par un Admin', () => {
  regarde(0, { loggia_epingles: { __profils: { 0: ['light.a', 'light.b'], 1: ['light.b', { id: 'light.a', w: 2 }] } } });
  S.cfgSet({ loggia_epingles: ['light.b', 'switch.c'] });
  assert.deepEqual(part('loggia_epingles', 0), ['light.b', 'switch.c']);
  assert.deepEqual(part('loggia_epingles', 1), ['light.b', { id: 'light.a', w: 2 }], 'Luna garde ses favoris');
});

/* ASSERTION MODIFIÉE (ticket #43, 02/11) : « l'interface est propre à chacun ». Une section masquée, un widget ajouté par un Admin
 * restent chez lui ; les autres profils gardent leur Accueil tel quel. */
test('l’Accueil : une section masquée ou un widget ajouté par un Admin reste chez lui', () => {
  regarde(0, { loggia_accueil: { __profils: {
    0: { main: ['scenes', 'pieces'], caches: [], ajoutees: ['heure'], formats: { mobile: { caches: [] } } },
    1: { main: ['pieces', 'scenes'], caches: ['cameras'], rail: ['meteo'], formats: { tablette: { caches: ['cameras'] } } },
  } } });
  S.cfgSet({ loggia_accueil: { main: ['scenes', 'pieces'], caches: [], ajoutees: ['heure', 'agenda'], formats: { mobile: { caches: ['scenes'] } } } });
  assert.deepEqual(part('loggia_accueil', 0).formats.mobile.caches, ['scenes']);
  assert.deepEqual(part('loggia_accueil', 1), { main: ['pieces', 'scenes'], caches: ['cameras'], rail: ['meteo'], formats: { tablette: { caches: ['cameras'] } } }, 'l’Accueil de Luna a été touché');
});
