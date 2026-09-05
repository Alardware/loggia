// ─────────────────────────────────────────────────────────────────────────────
// Configuration et apparence ne se lisent pas de la même façon.
//
// `LOGGIA_SYNC_KEYS` mélange les deux, et c'est justifié pour ce qu'il fait :
// thème, marges et langue suivent la maison au même titre que les pièces, et
// l'export/import doit tout emporter.
//
// Mais les préférences d'apparence sont écrites EN CLAIR — `loggia-mode` vaut
// `dark`, pas `"dark"`. Le balayage qui décide de la disponibilité des vues les
// relisait avec `readLS`, qui attend du JSON : il annonçait « config corrompue »
// à chaque ouverture, sur une valeur parfaitement valide.
//
// Le risque en corrigeant est l'inverse : restreindre trop, oublier une clé que
// le moteur lit, et masquer une vue que quelqu'un vient de configurer. C'est
// pourquoi le test ci-dessous relit les sources du moteur plutôt que de faire
// confiance à une liste écrite à la main.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOGGIA_CONFIG_KEYS, LOGGIA_SYNC_KEYS, estPersonnelle } from '../src/state.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const app = lire('src', 'App.jsx');

test('le moteur reçoit toutes les clés qu’il lit', () => {
  // Extraites des sources, pas recopiées : une clé ajoutée au moteur sans être
  // ajoutée ici ferait disparaître une vue déjà configurée, en silence.
  const sources = ['resolve.js', 'views.js', 'runtime.js'].map(f => lire('src', f)).join('\n');
  const lues = new Set((sources.match(/userCfg\.(loggia_[a-zA-Z]+)/g) || []).map(m => m.split('.')[1]));
  assert.ok(lues.size >= 8, `seulement ${lues.size} clés repérées : l’extraction ne marche plus`);
  for (const k of lues) {
    // `loggia_covers`, `loggia_energy`, `loggia_system`, `loggia_vacuum` et
    // `loggia_entities` viennent du serveur ou de l'héritage, pas du stockage
    // local — elles n'ont donc pas à être dans la liste balayée. Mais toute clé
    // que le stockage local sait produire doit y être.
    if (LOGGIA_SYNC_KEYS.indexOf(k) < 0) continue;
    assert.ok(LOGGIA_CONFIG_KEYS.indexOf(k) >= 0,
      `${k} est lue par le moteur et synchronisée, mais absente du balayage : la vue qui en dépend restera masquée`);
  }
});

test('aucune préférence d’apparence dans les clés de configuration', () => {
  // Ce sont elles qui sont écrites en clair, et donc elles qui faisaient
  // crier `readLS`.
  for (const k of LOGGIA_CONFIG_KEYS) {
    assert.ok(k.indexOf('loggia_') === 0,
      `${k} n’est pas une clé de configuration : si elle est écrite en clair, « config corrompue » reviendra`);
  }
});

test('les clés écrites en clair ne sont jamais relues comme du JSON', () => {
  // La liste vient du code : tout `setItem` dont la valeur n'est pas passée par
  // JSON.stringify écrit une chaîne nue.
  const brutes = (app.match(/localStorage\.setItem\('([a-z-]+)', [a-zA-Z][a-zA-Z0-9_.]*\)/g) || [])
    .map(m => m.match(/'([a-z-]+)'/)[1]);
  assert.ok(brutes.length >= 3, `seulement ${brutes.length} écritures en clair repérées : l’extraction ne marche plus`);
  for (const k of brutes) {
    assert.ok(LOGGIA_CONFIG_KEYS.indexOf(k) < 0,
      `${k} est écrite en clair mais relue avec readLS : « config corrompue » à chaque ouverture`);
  }
});

test('le balayage de disponibilité passe par les clés de configuration', () => {
  assert.match(app, /LOGGIA_CONFIG_KEYS\.forEach\(k => \{ const v = readLS\(k, null\)/,
    'le balayage relit de nouveau toute la liste de synchronisation, apparence comprise');
});

test('l’export garde tout, lui', () => {
  // Restreindre le balayage ne doit pas amputer l'export : une sauvegarde qui
  // oublierait le thème et la langue les perdrait au réimport.
  const state = lire('src', 'state.js');
  assert.match(state, /exportLoggiaConfig = \(\) => \{ const o = \{\}; LOGGIA_SYNC_KEYS\.forEach/,
    'l’export ne couvre plus toutes les clés synchronisées');
  assert.ok(LOGGIA_SYNC_KEYS.length > LOGGIA_CONFIG_KEYS.length,
    'la liste de synchronisation a été amputée au lieu d’être filtrée à la lecture');
  for (const k of LOGGIA_CONFIG_KEYS) {
    assert.ok(LOGGIA_SYNC_KEYS.indexOf(k) >= 0, `${k} n’est plus synchronisée`);
  }
});

test('rester sur l’appareil est une liste nommée, pas une question de tiret', () => {
  // Miroir de `est_personnelle` (store.py). On pourrait croire que le
  // séparateur tranche — `loggia-x` local, `loggia_x` partagé — mais non : le
  // thème et la langue portent un tiret et suivent pourtant la maison.
  assert.ok(estPersonnelle('loggia-navoffset'), 'les marges d’écran ont quitté l’appareil');
  assert.ok(estPersonnelle('loggia-secpanel'), 'les panneaux repliés ont quitté l’appareil');
  assert.ok(!estPersonnelle('loggia-mode'), 'le thème est redevenu propre à un appareil');
  assert.ok(!estPersonnelle('loggia-langue'), 'la langue est redevenue propre à un appareil');
  assert.ok(!estPersonnelle('loggia_accueil'), 'l’agencement est redevenu propre à un appareil');
});
