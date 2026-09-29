/* Un réglage qui n'est jamais arrivé au serveur (28/09).
 *
 * « Parfois quand j'actualise la page, éventuellement après un redémarrage,
 * j'ai une organisation de cartes grande petite, masquer, démasquer. Et bien
 * ça réinitialise et revient en arrière, je suis obligé de remettre mes cartes
 * comme je les avais mises. »
 *
 * Ce n'est pas l'agencement qui était mal enregistré : c'est l'envoi qui se
 * perdait, sans que personne ne le reprenne. Voir `src/enattente.js`. */

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

/* Un stockage d'appareil, en mémoire. Le module ne connaît que `window` : il
 * doit exister AVANT le premier appel, pas avant l'import. */
const boite = new Map();
globalThis.window = {
  localStorage: {
    getItem: (k) => (boite.has(k) ? boite.get(k) : null),
    setItem: (k, v) => { boite.set(k, String(v)); },
    removeItem: (k) => { boite.delete(k); },
  },
};

const { poserEnAttente, purgerEnAttente, enAttente, renvoyerEnAttente } = await import('../src/enattente.js');

const CLE = 'loggia_enattente';
const AGENCEMENT = { Salon: { larges: ['light.plafonnier'], compacts: ['switch.prise'] } };

beforeEach(() => { boite.clear(); });

test('on inscrit AVANT d’envoyer, et l’on raye au succès', () => {
  const marques = poserEnAttente({ loggia_roomlayout: AGENCEMENT });
  assert.deepEqual(enAttente(), { loggia_roomlayout: AGENCEMENT }, 'le lot doit attendre dès maintenant');
  assert.equal(marques.loggia_roomlayout, 1, 'la première écriture d’une clé porte la marque 1');
  purgerEnAttente(marques);
  assert.equal(enAttente(), null, 'ce qui est arrivé ne doit plus attendre');
  assert.equal(boite.has(CLE), false, 'un carnet vide s’efface, il ne se garde pas');
});

test('une écriture faite PENDANT l’aller-retour ne se fait pas rayer', () => {
  const premier = poserEnAttente({ loggia_roomlayout: AGENCEMENT });
  // L'utilisateur range une autre carte avant que la première réponse arrive.
  const second = { Salon: { larges: [] } };
  poserEnAttente({ loggia_roomlayout: second });
  // La réponse du PREMIER envoi arrive enfin.
  purgerEnAttente(premier);
  assert.deepEqual(enAttente(), { loggia_roomlayout: second },
    'la dernière valeur serait celle qui se perdrait');
});

test('une suppression attend comme le reste', () => {
  poserEnAttente({ loggia_roomlayout: null });
  assert.deepEqual(enAttente(), { loggia_roomlayout: null },
    'effacer une clé est un réglage : il doit arriver au serveur lui aussi');
});

test('un carnet abîmé ne bloque rien', () => {
  boite.set(CLE, 'ceci n’est pas du JSON');
  assert.equal(enAttente(), null);
  const m = poserEnAttente({ loggia_seclayout: { a: 1 } });
  assert.deepEqual(enAttente(), { loggia_seclayout: { a: 1 } }, 'on repart d’un carnet propre');
  purgerEnAttente(m);
  boite.set(CLE, JSON.stringify(['une', 'liste']));
  assert.equal(enAttente(), null, 'une liste n’est pas un carnet');
});

test('au démarrage, ce qui attend repart — et le carnet se vide', async () => {
  poserEnAttente({ loggia_roomlayout: AGENCEMENT, loggia_seclayout: null });
  const envoyes = [];
  const hass = { callWS: async (msg) => { envoyes.push(msg); return {}; } };
  const r = await renvoyerEnAttente(hass);
  assert.equal(envoyes.length, 1, 'un seul envoi pour tout le carnet');
  assert.equal(envoyes[0].type, 'loggia/config/set');
  assert.deepEqual(envoyes[0].config, { loggia_roomlayout: AGENCEMENT, loggia_seclayout: null });
  assert.deepEqual(r.cles.sort(), ['loggia_roomlayout', 'loggia_seclayout']);
  assert.equal(enAttente(), null);
});

test('un transport coupé GARDE, un refus applicatif ABANDONNE', async () => {
  poserEnAttente({ loggia_roomlayout: AGENCEMENT });

  // Home Assistant redémarre : la connexion tombe, l'erreur n'a pas de `code`.
  const coupe = { callWS: async () => { throw new Error('Connection lost'); } };
  const r1 = await renvoyerEnAttente(coupe);
  assert.deepEqual(r1.cles, [], 'rien n’est parti');
  assert.deepEqual(enAttente(), { loggia_roomlayout: AGENCEMENT },
    'le carnet doit garder : c’est tout l’intérêt, on retentera');

  // Le serveur REFUSE (clé de la maison depuis un compte ordinaire) : retenter
  // à chaque ouverture ne donnerait rien de plus.
  const warn = console.warn; console.warn = () => {};
  const refus = { callWS: async () => { const e = new Error('reserve'); e.code = 'not_admin'; throw e; } };
  const r2 = await renvoyerEnAttente(refus);
  console.warn = warn;
  assert.ok(r2.refus, 'un refus se distingue d’une panne de transport');
  assert.equal(enAttente(), null, 'un refus applicatif ne se retente pas indéfiniment');
});

test('sans composant, le carnet attend sans rien perdre', async () => {
  poserEnAttente({ loggia_roomlayout: AGENCEMENT });
  const r = await renvoyerEnAttente(null);
  assert.deepEqual(r.cles, []);
  assert.deepEqual(enAttente(), { loggia_roomlayout: AGENCEMENT });
});

test('le câblage dans App, et la clé qui ne doit pas voyager', () => {
  const app = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
  assert.ok(app.includes("from './enattente.js'"), 'App n’importe plus le carnet');
  assert.ok(app.includes('const marques = poserEnAttente(patch);'),
    'le lot doit être inscrit AVANT l’envoi — sinon actualiser pendant l’aller-retour le perd');
  assert.ok(app.indexOf('const marques = poserEnAttente(patch);') < app.indexOf("h.callWS({ type: 'loggia/config/set', config: patch })"),
    'inscrit APRÈS l’envoi, le carnet ne servirait à rien');
  assert.ok(app.includes('.then(() => purgerEnAttente(marques))'), 'ce qui arrive doit être rayé');
  assert.ok(app.includes('renvoyerEnAttente(h)'), 'rien ne repart au démarrage');

  const cfg = readFileSync(join(RACINE, 'src', 'config.js'), 'utf8');
  assert.ok(cfg.includes("LOCAL_ONLY_KEYS = new Set(['loggia_enattente'])"),
    'le carnet décrit un incident de CET appareil : ni export, ni configuration de la maison');
});

test('ce qui rendait la perte définitive est toujours là — et c’est voulu', () => {
  const etat = readFileSync(join(RACINE, 'src', 'state.js'), 'utf8');
  const cfg = readFileSync(join(RACINE, 'src', 'config.js'), 'utf8');
  /* Ces deux règles sont justes : le serveur fait autorité sur ce qui est
   * commun, et `completerDepuisLocal` ne doit jamais écraser une valeur
   * serveur par une vieille copie locale. C'est leur RENCONTRE qui perdait le
   * réglage, faute de quiconque pour le renvoyer. Si l'une des deux change, ce
   * test doit être relu — pas supprimé. */
  assert.ok(etat.includes('if (LOGGIA_SERVER && !estPersonnelle(key)) return fallback;'),
    'le serveur ne fait plus autorité : le carnet n’a plus la même raison d’être');
  assert.ok(cfg.includes('if (dejaLa !== undefined && dejaLa !== null) return;'),
    'completerDepuisLocal ne pousse plus seulement les clés absentes');
});
