// ─────────────────────────────────────────────────────────────────────────────
// La disposition des cartes suit le type d'écran ; le contenu suit la maison.
//
// Retour du 18/09 : « sur mobile, si je modifie, ça modifie sur PC, et si je
// modifie sur PC ça modifie sur mobile. Ça ne me va pas : chaque appareil a sa
// propre disposition, seul l'ajout ou modification, suppression d'entité,
// carte se synchronise. » Ces tests rejouent ce qu'il a fait.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatEcran, vueFormat, patchFormat, echangerPartout, CLES_DISPOSITION } from '../src/disposition.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');

// Ce que fait `setLayout` d'un patch : une valeur nulle efface la clé.
const ecrire = (L, patch) => {
  const n = { ...L };
  Object.keys(patch).forEach(k => { if (patch[k] == null) delete n[k]; else n[k] = patch[k]; });
  return n;
};
// L'éditeur : chaque écriture passe par `patchFormat`, comme dans `write`.
const geste = (L, format, patch) => ecrire(L, patchFormat(L, format, patch));

const MAISON = { order: ['lampe', 'volet', 'prise'], larges: ['volet'], labels: { lampe: 'Plafonnier' } };

test('le format : la souris fait l’ordinateur, le doigt la tablette ou le téléphone', () => {
  assert.equal(formatEcran(false, true), 'pc');
  assert.equal(formatEcran(false, false), 'pc');
  assert.equal(formatEcran(true, true), 'tablette');
  assert.equal(formatEcran(true, false), 'mobile');
  assert.deepEqual(CLES_DISPOSITION, ['order', 'larges', 'compacts']);
});

test('ranger sur le téléphone ne dérange pas l’ordinateur, et inversement', () => {
  let L = geste(MAISON, 'mobile', { order: ['prise', 'lampe', 'volet'] });
  assert.deepEqual(vueFormat(L, 'mobile').order, ['prise', 'lampe', 'volet']);
  assert.deepEqual(vueFormat(L, 'pc').order, ['lampe', 'volet', 'prise'], 'l’ordinateur a bougé');
  L = geste(L, 'pc', { order: ['volet', 'prise', 'lampe'] });
  assert.deepEqual(vueFormat(L, 'mobile').order, ['prise', 'lampe', 'volet'], 'le téléphone a bougé');
  // La taille aussi : compacte sur le téléphone, standard sur l'ordinateur.
  L = geste(L, 'mobile', { compacts: ['lampe'] });
  assert.deepEqual(vueFormat(L, 'mobile').compacts, ['lampe']);
  assert.equal(vueFormat(L, 'pc').compacts, undefined);
});

test('ajouter, retirer, renommer : partout', () => {
  let L = geste(MAISON, 'mobile', { order: ['prise', 'lampe', 'volet'] });
  L = geste(L, 'mobile', { added: ['camera'], labels: { lampe: 'Suspension' } });
  for (const f of ['pc', 'tablette', 'mobile']) {
    assert.deepEqual(vueFormat(L, f).added, ['camera'], f + ' ne voit pas la carte ajoutée');
    assert.equal(vueFormat(L, f).labels.lampe, 'Suspension', f + ' ne voit pas le nouveau nom');
  }
  L = geste(L, 'pc', { removed: ['prise'] });
  assert.deepEqual(vueFormat(L, 'mobile').removed, ['prise'], 'le retrait ne suit pas');
});

test('un format qui n’a rien rangé suit l’ordinateur ; sa première retouche part de ce qu’il montrait', () => {
  assert.deepEqual(vueFormat(MAISON, 'tablette'), MAISON, 'rien n’est dupliqué d’avance');
  const L = geste(MAISON, 'tablette', { compacts: ['prise'] });
  const t = vueFormat(L, 'tablette');
  assert.deepEqual(t.order, ['lampe', 'volet', 'prise'], 'la tablette a perdu l’ordre qu’elle montrait');
  assert.deepEqual(t.larges, ['volet'], 'et la largeur');
  assert.deepEqual(t.compacts, ['prise']);
  assert.deepEqual(L.order, MAISON.order, 'les clés de l’ordinateur n’ont pas bougé');
});

test('« Toutes les cartes » : le contenu partout, la disposition de CE format seulement', () => {
  let L = geste(MAISON, 'mobile', { order: ['prise', 'lampe'], compacts: ['lampe'] });
  L = geste(L, 'tablette', { order: ['volet', 'lampe', 'prise'] });
  // La remise à zéro de l'éditeur, depuis le téléphone.
  L = geste(L, 'mobile', { removed: null, added: null, order: null, labels: null, larges: null, compacts: null, types: null });
  assert.equal(L.labels, undefined, 'les noms reviennent partout');
  assert.deepEqual(L.formats.mobile, {}, 'le téléphone repart de la liste automatique, sans suivre l’ordinateur');
  assert.equal(vueFormat(L, 'mobile').order, undefined);
  assert.deepEqual(vueFormat(L, 'tablette').order, ['volet', 'lampe', 'prise'], 'la tablette garde sa disposition');
  assert.deepEqual(vueFormat(L, 'pc').order, MAISON.order, 'l’ordinateur garde la sienne');
});

test('changer l’entité d’une carte lui garde sa place sur tous les formats', () => {
  const L = geste(MAISON, 'mobile', { order: ['prise', 'lampe', 'volet'], larges: ['lampe'] });
  const p = echangerPartout(L, 'lampe', 'suspension');
  assert.deepEqual(p.order, ['suspension', 'volet', 'prise']);
  assert.deepEqual(p.formats.mobile.order, ['prise', 'suspension', 'volet']);
  assert.deepEqual(p.formats.mobile.larges, ['suspension']);
  assert.deepEqual(echangerPartout({}, 'a', 'b'), {}, 'un agencement vide reste vide');
});

test('l’éditeur des vues passe par ces règles, et l’Accueil par le même format', () => {
  const h = app.slice(app.indexOf('function useLayoutEditor('), app.indexOf('\n}\n', app.indexOf('function useLayoutEditor(')));
  assert.ok(h.includes('const format = formatEcran(useCoarse(), useWide(1180));'));
  assert.ok(h.includes('const layout = vueFormat(layoutOf(cfgKey, scope), format);'), 'l’éditeur lit l’agencement de tous les formats à la fois');
  assert.ok(h.includes('setLayout(cfgKey, scope, patchFormat(layoutOf(cfgKey, scope), format, patch))'), 'une écriture de disposition partirait pour toute la maison');
  assert.ok(h.includes('const partout = echangerPartout(tout, id, cible);'));
  assert.ok(app.includes('const formatGrille = formatEcran(tactile, wide);'), 'l’Accueil et les vues ne découpent plus les écrans pareil');
  // Les cinq vues rangeables passent par cet éditeur.
  for (const cle of ['ROOM_LAYOUT_KEY, room', "OBJ_LAYOUT_KEY, 'objets'", "'loggia_coverlayout', 'volets'", "EN_LAYOUT_KEY, 'energie'", "'loggia_seclayout', 'securite'"]) {
    assert.ok(app.includes('useLayoutEditor(' + cle), cle);
  }
});
