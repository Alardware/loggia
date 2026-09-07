// ─────────────────────────────────────────────────────────────────────────────
// Le même dashboard sur le PC, la tablette et le téléphone.
//
// La configuration vit sur le serveur, par utilisateur Home Assistant, avec une
// partie commune à toute la maison. C'était déjà l'intention ; trois défauts la
// démentaient, chacun invisible depuis l'écran où on le subissait.
//
//  1. Le serveur fusionnait `{...commun, ...perso}` SANS FILTRE. N'importe
//     quelle clé restée dans la section d'un compte l'emportait sur la maison,
//     définitivement. Voir tests/python/test_store.py.
//
//  2. Un compte non administrateur voyait ses écritures REROUTÉES vers sa
//     propre section au lieu d'être refusées. Comme le dashboard écrit
//     `loggia_users` de lui-même — il y grave le lien entre un profil et son
//     compte Home Assistant — une tablette connectée sous un compte ordinaire
//     se fabriquait une liste de profils privée dès le premier chargement, puis
//     s'y tenait. Vider le cache du navigateur n'y changeait rien : l'ombre
//     était sur le serveur.
//
//  3. Et quand la liste arrivait vraiment, le dashboard comparait sept champs
//     sur neuf. Un rôle changeait bien ; une restriction de vues ou une
//     autorisation, non — la signature ne bougeait pas, la liste locale
//     restait. C'est ce fichier qui tient ce troisième point.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { usersSig, estPersonnelle } from '../src/state.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');

const LUNA = { name: 'Luna', role: 'Famille', c: '#fff', vues: [], droits: [], _k: 'u1' };

test('un changement de rôle change la signature', () => {
  assert.notEqual(usersSig([LUNA]), usersSig([{ ...LUNA, role: 'Admin' }]));
});

test('une autorisation accordée change la signature', () => {
  // Le champ manquait. Cocher « Automatisations » sur le PC ne parvenait donc
  // jamais à la tablette : elle recevait la liste et la jugeait identique.
  assert.notEqual(usersSig([LUNA]), usersSig([{ ...LUNA, droits: ['auto'] }]));
});

test('une restriction de vues change la signature', () => {
  assert.notEqual(usersSig([LUNA]), usersSig([{ ...LUNA, vues: ['pieces'] }]));
});

test('un champ ajouté demain compte aussi', () => {
  // La signature énumérait ses champs, et en oubliait deux. Elle prend
  // maintenant l'objet entier : un champ ajouté plus tard est couvert sans
  // que personne ait à y penser.
  assert.notEqual(usersSig([LUNA]), usersSig([{ ...LUNA, horaires: '8h-20h' }]));
});

test('la clé de rendu ne compte pas', () => {
  // `_k` est tirée au hasard à chaque chargement. La faire compter rendrait
  // toute liste distante différente de la locale, et le dashboard se
  // resynchroniserait en boucle.
  assert.equal(usersSig([LUNA]), usersSig([{ ...LUNA, _k: 'u9_zzzz' }]));
});

test('l’ordre des champs ne compte pas', () => {
  // Le serveur renvoie du JSON : rien ne garantit l'ordre des clés d'un objet
  // d'un aller-retour à l'autre.
  const a = { name: 'Clara', role: 'Famille', droits: ['auto'] };
  const b = { droits: ['auto'], role: 'Famille', name: 'Clara' };
  assert.equal(usersSig([a]), usersSig([b]));
});

test('deux listes identiques donnent la même signature', () => {
  // Sinon le dashboard remplacerait sa liste à chaque réponse du serveur, et
  // toute saisie en cours sauterait sous les doigts.
  assert.equal(usersSig([LUNA]), usersSig([{ ...LUNA }]));
  assert.equal(usersSig([]), usersSig(null));
});

// ─────────────────────────────────────────────────────────────────────────────
// Les deux listes de clés personnelles doivent dire la même chose.
//
// `estPersonnelle` côté navigateur décide où lire un réglage ; `est_personnelle`
// côté composant décide où l'écrire et s'il a le droit de couvrir le commun.
// Si elles divergent, un réglage est cherché là où il n'est pas — et le second
// défaut ci-dessus redevient possible, pour cette clé-là.
// ─────────────────────────────────────────────────────────────────────────────

test('le navigateur et le composant s’accordent sur ce qui est personnel', () => {
  const py = lire('custom_components', 'loggia', 'store.py');
  const bloc = py.slice(py.indexOf('PERSONAL_KEYS: frozenset'), py.indexOf('PERSONAL_SUFFIXES'));
  const cotePython = [...bloc.matchAll(/"([a-zA-Z_-]+)"/g)].map(m => m[1]).sort();
  assert.ok(cotePython.length >= 3, 'la liste du composant n’a pas été relue correctement');
  for (const cle of cotePython) {
    assert.ok(estPersonnelle(cle),
      `« ${cle} » est personnelle pour le composant et commune pour le navigateur`);
  }
  // Et le suffixe, qui porte les panneaux repliés de chaque écran.
  assert.ok(py.indexOf('PERSONAL_SUFFIXES: tuple[str, ...] = ("panel",)') >= 0,
    'le suffixe des panneaux a changé côté composant');
  assert.ok(estPersonnelle('loggia-secpanel') && !estPersonnelle('loggia_users'),
    'le navigateur ne reconnaît plus les panneaux, ou range les profils du mauvais côté');
});

test('les profils et le code admin appartiennent à la maison des deux côtés', () => {
  // Ils ont rejoint le commun le 03/09 : ils différaient d'un appareil à
  // l'autre, et même entre l'accès local et l'accès distant, faute d'origine
  // partagée. Les redéclarer personnels ramènerait exactement ce symptôme.
  for (const cle of ['loggia_users', 'loggia_admin_pin', 'loggia_active_user']) {
    assert.ok(!estPersonnelle(cle), `« ${cle} » est redevenue propre à l’appareil`);
  }
  const py = lire('custom_components', 'loggia', 'store.py');
  const bloc = py.slice(py.indexOf('PERSONAL_KEYS: frozenset'), py.indexOf('PERSONAL_SUFFIXES'));
  for (const cle of ['loggia_users', 'loggia_admin_pin', 'loggia_active_user']) {
    assert.ok(bloc.indexOf(cle) < 0, `« ${cle} » est redevenue personnelle côté composant`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Ce que le dashboard n'a plus le droit de tenter tout seul.
// ─────────────────────────────────────────────────────────────────────────────

test('aucune écriture automatique de la maison depuis un compte ordinaire', () => {
  const app = lire('src', 'App.jsx');
  // La liaison profil ↔ compte Home Assistant se déclenche au chargement, sans
  // que personne ne clique. C'est elle qui semait l'ombre sur la tablette.
  assert.match(app, /if \(haAdmin && hu\.id && users\[i\]\.haId !== hu\.id\)/,
    'la liaison profil ↔ compte repart depuis n’importe quel compte : elle sera refusée à chaque ouverture');
  assert.match(app, /if \(haAdmin && !usersPousses\.current/,
    'le semis de la liste des profils repart depuis n’importe quel compte');
  assert.match(app, /setHaAdmin\(!!\(state\.available && state\.user && state\.user\.is_admin\)\)/,
    'le rôle Home Assistant n’est plus relevé : le dashboard ne peut plus savoir ce qu’il a le droit d’écrire');
});
