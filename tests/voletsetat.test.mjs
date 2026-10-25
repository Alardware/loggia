/* L'état des volets côté serveur : un cache compté par références (chantier
 * Volets, § 6.1) — le modèle de tests/chauffageetat.test.mjs.
 *
 * Ce qui est garanti ici, source et horloge doublées, sans React :
 *  - rien ne part sans abonné ; 60 s pour les cartes, 15 s pour la fiche ;
 *  - un seul sondage et un seul cache pour toutes les cartes ;
 *  - serveur muet : `erreur`, sans effacer ce qu'on savait ; une réponse
 *    plus vieille ne recouvre pas une plus fraîche, ni ce qu'on a posé ;
 *  - `voletDe` lit l'entrée d'un volet, rien pour un serveur d'avant ;
 *  - le crochet rend le cache tel qu'il est. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const E = await import('../src/voletsetat.js');

function horlogeFactice() {
  const h = { minuteurs: new Map(), suivant: 1 };
  const poser = (f, ms, rep) => { const id = h.suivant++; h.minuteurs.set(id, { f, ms, rep }); return id; };
  return Object.assign(h, {
    repeter: (f, ms) => poser(f, ms, true), arreter: (id) => h.minuteurs.delete(id),
    plusTard: (f, ms) => poser(f, ms, false), annuler: (id) => h.minuteurs.delete(id),
    repetitions: () => [...h.minuteurs.values()].filter(m => m.rep).map(m => m.ms),
    attentes: () => [...h.minuteurs.values()].filter(m => !m.rep).map(m => m.ms),
    tic: () => { for (const [id, m] of [...h.minuteurs]) { if (!m.rep) h.minuteurs.delete(id); m.f(); } },
  });
}
function serveurFactice() {
  const appels = [];
  return { appels, hass: { callWS: (msg) => new Promise((ok, ko) => appels.push({ msg, ok, ko })) } };
}
const attendre = () => new Promise(r => setImmediate(r));
const LIRE = { type: 'loggia/volets/etat' };
const etat = (n) => ({ config: { planning: { actif: true } }, maintenant: '2026-10-12T15:00:00+02:00', soleil_jours: [],
  volets: { ['cover.volet_' + n]: { regle: 'comme', a_venir: [], protection: null, abri: false, attente: null, porte: null, orientation: null, manoeuvre: null } } });

test('sans abonné rien ne part ; le premier abonné relit aussitôt, puis toutes les 60 s ; la fiche, 15 s', () => {
  const s = serveurFactice(), h = horlogeFactice();
  E.reglerVoletsEtat({ hass: s.hass, horloge: h });
  E.rafraichirVolets();
  assert.equal(s.appels.length, 0, 'une lecture sans abonné');
  const carte = E.abonnerVolets();
  assert.deepEqual([s.appels.length, s.appels[0].msg], [1, LIRE]);
  assert.deepEqual(h.repetitions(), [60000]);
  const autre = E.abonnerVolets();
  assert.equal(s.appels.length, 1, 'une seconde carte ne relit pas : le cache est partagé');
  const fiche = E.abonnerVolets({ rapide: true });
  assert.equal(s.appels.length, 2, 'la fiche qui s’ouvre relit aussitôt');
  assert.deepEqual(h.repetitions(), [15000]);
  fiche(); fiche();
  assert.deepEqual(h.repetitions(), [60000], 'désabonner deux fois ne fausse pas le compte');
  carte(); autre();
  assert.deepEqual(h.repetitions(), [], 'plus d’abonné : le sondage s’arrête');
});

test('la réponse se publie ; muet, l’état d’avant reste et l’erreur se dit ; une vieille réponse ne recouvre rien', async () => {
  const s = serveurFactice(), h = horlogeFactice();
  E.reglerVoletsEtat({ hass: s.hass, horloge: h });
  E.abonnerVolets();
  const A = etat('salon');
  s.appels[0].ok(A);
  await attendre();
  assert.equal(E.lireEtatVolets().etat, A);
  h.tic();
  s.appels[1].ko({ code: 'unknown_command' });
  await attendre();
  assert.deepEqual(E.lireEtatVolets(), { etat: A, erreur: true });
  h.tic();
  const enVol = s.appels.at(-1);
  const B = etat('posé');
  E.poserEtatVolets(B);
  enVol.ok(etat('vieux'));
  await attendre();
  assert.equal(E.lireEtatVolets().etat, B, 'une lecture partie avant l’écriture l’a recouverte');
});

test('voletDe : l’entrée d’un volet ; rien pour un serveur d’avant, ni pour un id vide', () => {
  const A = etat('salon');
  assert.equal(E.voletDe(A, 'cover.volet_salon'), A.volets['cover.volet_salon']);
  assert.equal(E.voletDe(A, 'cover.volet_bureau'), null);
  assert.equal(E.voletDe({ config: {} }, 'cover.volet_salon'), null, 'un serveur d’avant n’a pas `volets`');
  assert.equal(E.voletDe(null, 'cover.volet_salon'), null);
  assert.equal(E.voletDe(A, ''), null);
});

test('les écouteurs : prévenus quand l’état change, pas pour le même ; désabonnés, plus rien', () => {
  E.reglerVoletsEtat({ hass: null });
  let vus = 0;
  const arret = E.ecouterEtatVolets(() => { vus += 1; });
  const A = etat('salon');
  E.poserEtatVolets(A);
  E.poserEtatVolets(A);
  assert.equal(vus, 1, 'le même état a prévenu deux fois');
  arret();
  E.poserEtatVolets(etat('bureau'));
  assert.equal(vus, 1, 'un écouteur désabonné est encore prévenu');
});

test('le crochet : le cache tel qu’il est, sans rien relire au rendu', () => {
  const s = serveurFactice();
  E.reglerVoletsEtat({ hass: s.hass, horloge: horlogeFactice() });
  const A = etat('salon');
  E.poserEtatVolets(A);
  const vus = [];
  const Sonde = () => { vus.push(E.useEtatVolets(true, { rapide: true })); return null; };
  renderToStaticMarkup(createElement(Sonde));
  assert.equal(vus[0].etat, A);
  assert.equal(s.appels.length, 0, 'l’abonnement part après le rendu, jamais pendant');
});
