// ─────────────────────────────────────────────────────────────────────────────
// Une reconnexion à Home Assistant ne rejoue rien (audit du 03/10).
//
// La bibliothèque WebSocket de Home Assistant RÉABONNE tout ce qui est ouvert
// quand la liaison revient — un redémarrage, une coupure Wi-Fi. Mesuré avec la
// vraie bibliothèque (home-assistant-js-websocket 9.5) :
//  - l'assistant renvoyait sa dernière question, et rejouait l'action ;
//  - le journal d'activité s'affichait en double ;
//  - une notification retirée pendant la coupure restait affichée.
// Après correction, la même mesure donne : une question, deux lignes, la
// notification partie. La bibliothèque n'est pas une dépendance du dépôt :
// ce fichier épingle les trois corrections et les commandes ponctuelles.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');

test('une question à l’assistant n’est jamais rejouée, et son flux se ferme', () => {
  const src = lire('src', 'views', 'assistant.jsx');
  assert.ok(src.includes('subscribeMessage(surEvenement, message, { resubscribe: false })'));
  const done = src.slice(src.indexOf("case 'done':"), src.indexOf("case 'error':"));
  const erreur = src.slice(src.indexOf("case 'error':"), src.indexOf('default:', src.indexOf("case 'error':")));
  assert.ok(done.includes('fermerFlux();'), 'le flux reste ouvert après la réponse');
  assert.ok(erreur.includes('fermerFlux();'), 'le flux reste ouvert après une erreur');
});

test('les écoutes ponctuelles ne sont pas rejouées non plus', () => {
  assert.match(lire('src', 'camera.jsx'), /type: 'camera\/webrtc\/offer'[^\n]*\n[^\n]*\n[^\n]*\n\s*\{ resubscribe: false \}\)/);
  const voix = lire('src', 'voix.js');
  assert.equal((voix.match(/\{ resubscribe: false \}/g) || []).length, 2, 'les deux appels à assist_pipeline/run');
});

test('le journal d’activité se dédoublonne', () => {
  const src = lire('src', 'historique.jsx');
  assert.ok(src.includes('const vus = new Set(prev.map(cle));'));
  assert.ok(src.includes('!vus.has(cle(e))'));
});

test('« current » remplace les notifications au lieu de s’y ajouter', () => {
  const app = lire('src', 'App.jsx');
  const i = app.indexOf("{ type: 'persistent_notification/subscribe' }");
  const rappel = app.slice(app.lastIndexOf('conn.subscribeMessage((msg) => {', i), i);
  assert.ok(rappel.includes("if (msg.type === 'current') table.clear();"));
});
