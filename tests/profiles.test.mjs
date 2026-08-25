// ─────────────────────────────────────────────────────────────────────────────
// La base de connaissances.
//
// Ce qu'on vérifie ici tient en deux idées. Un profil doit s'appliquer chez
// quiconque possède le même matériel — donc jamais par identifiant d'entité. Et
// il doit rester inerte chez qui ne l'a pas : une installation sans caméra ne
// doit rien voir du profil des caméras.
//
// Les cas viennent d'une installation réelle : une caméra à trois flux, des
// enceintes qui acceptent le volume sans publier de titre, et l'inverse.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  profilesFor, mergedProfile, primaryEntity, profilesSummary, profiles,
} from '../src/profiles.js';
import { deviceCaps } from '../src/capabilities.js';

const et = (state, attributes = {}) => ({ state: String(state), attributes });
const app = (o) => ({
  id: 'd1', name: 'Appareil', manufacturer: null, model: null, integration: null,
  entryType: null, entities: [], domains: [], platforms: [], ...o,
});

const ids = (device, caps) => profilesFor(device, caps).map(p => p.id);

// ── Reconnaissance ──────────────────────────────────────────────────────────

test('une caméra à plusieurs flux est reconnue, quelle que soit sa marque', () => {
  // Relevé réel : une caméra publie trois flux, le dashboard en faisait trois
  // cartes. Aucune marque n'intervient dans la règle.
  const cam = app({
    entities: ['camera.entree_haute', 'camera.entree_basse', 'camera.entree_package'],
    domains: ['camera'],
  });
  assert.deepEqual(ids(cam), ['camera-multi-flux']);
});

test('… et une caméra à un seul flux ne l’est pas', () => {
  const cam = app({ entities: ['camera.jardin'], domains: ['camera'] });
  assert.deepEqual(ids(cam), []);
});

test('une enceinte qui règle son volume sans dire ce qu’elle joue', () => {
  // Sept lecteurs de l'installation sont dans ce cas : la carte restait vide et
  // laissait croire à une panne.
  const dev = app({ entities: ['media_player.enceinte'], domains: ['media_player'] });
  const states = { 'media_player.enceinte': et('playing', { supported_features: 4, volume_level: 0.3 }) };
  const caps = deviceCaps(dev, states);
  assert.deepEqual(ids(dev, caps), ['lecteur-sans-metadonnees']);
  assert.equal(mergedProfile(dev, caps).roles.metadata, null);
});

test('… et le cas inverse, titre sans volume', () => {
  const dev = app({ entities: ['media_player.boitier'], domains: ['media_player'] });
  const states = {
    'media_player.boitier': et('playing', { supported_features: 1, media_title: 'Un titre' }),
  };
  const caps = deviceCaps(dev, states);
  assert.deepEqual(ids(dev, caps), ['lecteur-sans-volume']);
  assert.equal(mergedProfile(dev, caps).roles.volume, null);
});

test('un lecteur complet ne relève d’aucun profil', () => {
  const dev = app({ entities: ['media_player.complet'], domains: ['media_player'] });
  const states = {
    'media_player.complet': et('playing', {
      supported_features: 4, volume_level: 0.4, media_title: 'Un titre',
    }),
  };
  assert.deepEqual(ids(dev, deviceCaps(dev, states)), []);
});

test('un robot qui accepte send_command sait nettoyer une pièce', () => {
  const dev = app({ entities: ['vacuum.robot'], domains: ['vacuum'] });
  const states = { 'vacuum.robot': et('docked', { supported_features: 13116 }) };
  const p = mergedProfile(dev, deviceCaps(dev, states));
  assert.equal(p.ids[0], 'robot-aspirateur-segments');
  // On ne prétend PAS connaître le découpage : il appartient à l'installation.
  assert.match(p.commands.clean_segment.note, /propre à chaque installation/);
});

test('un appareil de service est signalé comme n’ayant pas de matériel', () => {
  const dev = app({ entryType: 'service', entities: ['update.un_depot'], domains: ['update'] });
  assert.equal(mergedProfile(dev).presentation.physical, false);
});

// ── Le choix de l'entité à présenter ────────────────────────────────────────

test('le flux principal est retenu, les replis écartés', () => {
  const cam = app({
    entities: ['camera.entree_basse_def', 'camera.entree_haute_def', 'camera.entree_package'],
    domains: ['camera'],
  });
  const m = mergedProfile(cam).merge;
  assert.equal(primaryEntity(cam, m), 'camera.entree_haute_def');
});

test('sans mention reconnaissable, le choix reste stable', () => {
  // Aucun nom ne se distingue : on prend le premier de la liste, et les entités
  // d'un appareil étant triées, la réponse ne changera pas d'un rendu à l'autre.
  const cam = app({ entities: ['camera.a', 'camera.b'], domains: ['camera'] });
  const m = mergedProfile(cam).merge;
  assert.equal(primaryEntity(cam, m), 'camera.a');
});

test('le choix se fait sur le nom lisible quand on en fournit un', () => {
  // Les identifiants sont parfois opaques ; le nom donné par l'utilisateur, non.
  const cam = app({ entities: ['camera.x1', 'camera.x2'], domains: ['camera'] });
  const noms = (id) => (id === 'camera.x2' ? 'Entrée haute définition' : 'Entrée basse définition');
  assert.equal(primaryEntity(cam, mergedProfile(cam).merge, noms), 'camera.x2');
});

test('tout écarter ne doit pas rendre la caméra invisible', () => {
  // Si tous les flux portent une mention de repli, mieux vaut en montrer un que
  // de faire disparaître la caméra.
  const cam = app({ entities: ['camera.a_low', 'camera.b_sub'], domains: ['camera'] });
  assert.equal(primaryEntity(cam, mergedProfile(cam).merge), 'camera.a_low');
});

// ── Prudence ────────────────────────────────────────────────────────────────

test('aucun profil ne cite d’identifiant d’entité', () => {
  // La garantie centrale : ces règles doivent valoir chez un inconnu.
  const plat = JSON.stringify(profiles, (k, v) => (v instanceof RegExp ? v.source : v));
  assert.equal(/\b(light|switch|sensor|vacuum|camera|climate|cover)\.[a-z0-9_]+/.test(plat), false,
    'un identifiant d’entité s’est glissé dans la table');
});

test('un appareil sans rien ne déclenche aucun profil', () => {
  assert.deepEqual(profilesFor(null), []);
  assert.deepEqual(profilesFor(app({})), []);
  assert.equal(mergedProfile(app({})), null);
});

test('l’inventaire compte les appareils concernés, zéro compris', () => {
  const cam = app({ id: 'd1', entities: ['camera.a', 'camera.b'], domains: ['camera'] });
  const autre = app({ id: 'd2', entities: ['light.x'], domains: ['light'] });
  const r = profilesSummary(new Map([['d1', cam], ['d2', autre]]), () => null);
  assert.equal(r.get('camera-multi-flux').devices, 1);
  // Un profil sans appareil n'est pas une anomalie : c'est du matériel absent.
  assert.equal(r.get('robot-aspirateur-segments').devices, 0);
});
