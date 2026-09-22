/* Ce qui attend ne meurt pas avec l'onglet (ADR 0066, 22/09).
 *
 * Deux choses attendaient leur calme avant de partir : les ecritures groupees
 * de `createConfig` (400 ms) et la consigne d'un champ numerique (450 ms).
 * Fermer la fiche ou l'onglet pendant ce temps les perdait sans un mot. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createConfig, brancherVidage } from '../src/config.js';

class Fenetre extends EventTarget {}
class Document extends EventTarget {
  constructor() { super(); this.visibilityState = 'visible'; }
}
const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));

test('brancherVidage : la page qui se cache ou se ferme vide ; revenir ne vide pas ; debrancher arrete tout', () => {
  const win = new Fenetre();
  const doc = new Document();
  let n = 0;
  const debrancher = brancherVidage(() => { n += 1; }, win, doc);
  doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(n, 0, 'visible : rien a faire');
  doc.visibilityState = 'hidden';
  doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(n, 1, 'cachee : on vide');
  win.dispatchEvent(new Event('pagehide'));
  assert.equal(n, 2, 'fermee : dernier filet');
  debrancher();
  win.dispatchEvent(new Event('pagehide'));
  doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(n, 2, 'debranche : plus rien');
  // Sans fenetre (un test, un rendu hors navigateur) : rien ne casse.
  assert.doesNotThrow(() => brancherVidage(() => {}, null, null)());
  // Un vidage qui echoue ne fait pas tomber la page qui se ferme.
  const casse = brancherVidage(() => { throw new Error('boum'); }, win, doc);
  assert.doesNotThrow(() => win.dispatchEvent(new Event('pagehide')));
  casse();
});

test('createConfig : une ecriture groupee part quand la page se cache, et une seule fois', async () => {
  const appels = [];
  const hass = { callWS: async (m) => { appels.push(m); return {}; } };
  const win = new Fenetre();
  const doc = new Document();
  const cfg = createConfig({ hass, serverConfig: {}, user: null, win, doc });
  cfg.set('loggia_x', 1);
  cfg.set('loggia_y', 2);
  assert.equal(appels.length, 0, 'groupee : rien ne part tout de suite');
  doc.visibilityState = 'hidden';
  doc.dispatchEvent(new Event('visibilitychange'));
  await tick();
  assert.deepEqual(appels, [{ type: 'loggia/config/set', config: { loggia_x: 1, loggia_y: 2 } }]);
  await tick(450);
  assert.equal(appels.length, 1, 'le minuteur de 400 ms ne rejoue pas ce qui est parti');
  // Rien en attente : se cacher n'ecrit rien.
  doc.dispatchEvent(new Event('visibilitychange'));
  await tick();
  assert.equal(appels.length, 1);
  cfg.detacher();
  cfg.set('loggia_z', 3);
  win.dispatchEvent(new Event('pagehide'));
  await tick();
  assert.equal(appels.length, 1, 'detache : la page ne vide plus');
  await tick(450);
  assert.equal(appels.length, 2, 'mais le minuteur, lui, ecrit toujours');
});

test('createConfig en mode local : ni file, ni ecouteur — detacher existe et ne fait rien', () => {
  const win = new Fenetre();
  const doc = new Document();
  const cfg = createConfig({ hass: null, serverConfig: null, user: null, win, doc });
  assert.equal(cfg.mode, 'local');
  assert.doesNotThrow(() => cfg.detacher());
});

test('la consigne d’un champ numerique en attente part au demontage de la fiche et quand la page se cache', () => {
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const i = app.indexOf('\nfunction LigneEntite(');
  const c = app.slice(i, app.indexOf('\nfunction ', i + 1));
  assert.ok(c.includes("attenteRef.current = () => call(dom, 'set_value', { value: nv });") && c.includes('commitRef.current = setTimeout(viderAttente, 450);'), 'ce qui attend est nomme, et le calme l’envoie');
  assert.ok(c.includes('const debrancher = brancherVidage(viderAttente);') && c.includes('return () => { debrancher(); viderAttente(); clearTimeout(filetRef.current); };'), 'vide au demontage et au depart de la page');
  assert.ok(/import \{[^}]*brancherVidage[^}]*\} from '\.\/config\.js';/.test(app), 'importe de config.js');
});
