// ─────────────────────────────────────────────────────────────────────────────
// La lecture de la réponse : où en est la voix, et la voix du pipeline.
//
// Exécuté pour de vrai, avec un élément audio et une liaison de théâtre.
// Relire `voix.js` ne dirait pas si un flux sans durée allume un mot au
// hasard, ni si un pipeline sans voix fige la conversation ; l'appeler, si.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';

/* Un élément audio de théâtre. `voix.js` en fabrique un et le garde ; on garde
 * la main dessus pour lui donner une durée, une position, un état. */
let dernier = null;
globalThis.Audio = class {
  constructor() {
    dernier = this;
    this.paused = true; this.ended = false; this.duration = Number.NaN; this.currentTime = 0;
  }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
};

const { jouer, couperLecture, positionLecture, synthese } = await import('../src/voix.js');

/** La réponse doit venir TOUT DE SUITE : le filet de quinze secondes de
 * `synthese` ne doit jamais être ce qui la rend. */
const vite = (p) => Promise.race([p, new Promise((r) => { setTimeout(() => r('trop lent'), 300); })]);

test('rien ne se lit : pas de position', () => {
  assert.equal(positionLecture(), null);
});

test('la position vient du fichier que l’on entend', async () => {
  assert.equal(await jouer('/api/tts_proxy/a.mp3'), true);
  dernier.duration = 4; dernier.currentTime = 1;
  assert.deepEqual(positionLecture(), { t: 1, d: 4 });
});

test('sans durée connue, aucun mot ne s’allume au hasard', async () => {
  await jouer('/api/tts_proxy/b.mp3');
  dernier.currentTime = 2;
  dernier.duration = Number.NaN;          // les métadonnées ne sont pas là
  assert.equal(positionLecture(), null);
  dernier.duration = Infinity;            // la voix arrive en flux
  assert.equal(positionLecture(), null);
});

test('coupée ou finie, la voix n’a plus de position', async () => {
  await jouer('/api/tts_proxy/c.mp3');
  dernier.duration = 3; dernier.currentTime = 1;
  couperLecture();
  assert.equal(positionLecture(), null);
  await jouer('/api/tts_proxy/d.mp3');
  dernier.duration = 3; dernier.currentTime = 3; dernier.ended = true;
  assert.equal(positionLecture(), null);
  dernier.ended = false;
});

/** Une liaison de théâtre : elle retient la demande et rend la main aux événements. */
function liaison() {
  const l = { demande: null, rappel: null, lache: 0 };
  l.connection = {
    subscribeMessage: (rappel, demande) => {
      l.rappel = rappel; l.demande = demande;
      return Promise.resolve(() => { l.lache += 1; return Promise.resolve(); });
    },
  };
  return l;
}

test('le pipeline ne fait que dire : l’étape tts, seule', async () => {
  const h = liaison();
  const p = synthese(h, 'Bonjour.');
  await Promise.resolve();
  assert.equal(h.demande.type, 'assist_pipeline/run');
  assert.equal(h.demande.start_stage, 'tts');
  assert.equal(h.demande.end_stage, 'tts');
  assert.deepEqual(h.demande.input, { text: 'Bonjour.' });
  h.rappel({ type: 'tts-end', data: { tts_output: { url: '/api/tts_proxy/x.mp3' } } });
  assert.deepEqual(await vite(p), { url: '/api/tts_proxy/x.mp3' }, 'la même forme que `speak`');
  assert.equal(h.lache, 1, 'l’abonnement doit être rendu une fois la voix obtenue');
});

test('un pipeline sans voix rend null, tout de suite : la réponse reste écrite', async () => {
  const h = liaison();
  const p = synthese(h, 'Bonjour.');
  await Promise.resolve();
  h.rappel({ type: 'error', data: { code: 'tts-not-supported' } });
  assert.equal(await vite(p), null);
});

test('un refus du serveur, ou pas de liaison : null, et aucune erreur', async () => {
  const refus = { connection: { subscribeMessage: () => Promise.reject(new Error('unknown_command')) } };
  assert.equal(await vite(synthese(refus, 'Bonjour.')), null);
  assert.equal(await synthese(null, 'Bonjour.'), null);
  assert.equal(await synthese({ connection: {} }, 'Bonjour.'), null);
  assert.equal(await synthese(liaison(), ''), null);
});
