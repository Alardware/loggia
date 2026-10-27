/* TEST AJOUTÉ (étape 3 IoT, 25/10 ; I28, I29, I33) — l'état de l'eau à l'écran (`src/eauetat.js`, chargé à la demande).
 *
 * Ce qui est garanti, source et horloge doublées :
 *  - le cache de `loggia/eau/etat` : rien ne part sans abonné ; 60 s pour une carte, 15 s popup ouverte ; une réponse plus vieille
 *    n'écrase pas une plus fraîche ; le serveur muet se dit (`erreur`) et la réponse d'avant reste lue ;
 *  - le geste d'une vanne (I33) : PARTAGÉ — la carte large, l'étroite, la compacte et la popup lisent le même ; un second appui pendant
 *    le vol ne commande pas deux fois ; le service est explicite (`close_valve`, `open_valve`, `turn_off`, `turn_on`), jamais `toggle`,
 *    toujours un `entity_id` ; il tient 30 s plus un relevé, se lève quand la vanne atteint son sens, et tombe sur un refus ;
 *  - la question posée par une carte étroite, que la popup trouve en s'ouvrant (une fois) ;
 *  - « Fermer en cas de fuite » (I29) : la commande ÉTROITE `loggia/eau/regle {actif}` — jamais `loggia/config/set` —, l'état rendu
 *    posé ; un refus garde l'état d'avant et revient à l'appelant. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
const E = await import('../src/eauetat.js');
const { reglerPartage } = await import('../src/optimiste.js');

function horloge() {
  let t = 0; const taches = new Map(); let n = 1;
  const poser = (f, ms, rep) => { const id = n++; taches.set(id, { f, ms, rep, ech: t + ms }); return id; };
  return {
    repeter: (f, ms) => poser(f, ms, true), arreter: (id) => taches.delete(id), plusTard: (f, ms) => poser(f, ms, false), annuler: (id) => taches.delete(id),
    avancer(ms) { const but = t + ms; for (;;) { const p = [...taches.entries()].filter(([, x]) => x.ech <= but).sort((a, b) => a[1].ech - b[1].ech)[0]; if (!p) break; t = p[1].ech; if (p[1].rep) p[1].ech += p[1].ms; else taches.delete(p[0]); p[1].f(); } t = but; },
    periodes: () => [...taches.values()].filter(x => x.rep).map(x => x.ms),
  };
}
const attendre = () => new Promise(r => setImmediate(r));
const ETAT = (actif = true) => ({ vannes: {}, detecteurs: {}, journal: [], regle: { actif, reagit: true, entite: '', toutes: true, vannes: [] } });

test('le cache : rien sans abonné, 60 s pour une carte, 15 s popup ouverte, le serveur muet se dit', async () => {
  const h = horloge(); const lus = [];
  let repondre = (msg) => Promise.resolve(ETAT());
  E.reglerEauEtat({ hass: { callWS: (msg) => { lus.push(msg.type); return repondre(msg); } }, horloge: h });
  await E.rafraichirEau();
  assert.deepEqual(lus, [], 'aucun abonné : rien ne part');
  const carte = E.abonnerEau();
  await attendre();
  assert.deepEqual([lus, h.periodes()], [['loggia/eau/etat'], [60000]]);
  assert.equal(E.lireEtatEau().etat.regle.actif, true);
  const fiche = E.abonnerEau({ fiche: true });
  await attendre();
  assert.deepEqual([lus.length, h.periodes()], [2, [15000]], 'la popup relit aussitôt, puis toutes les 15 s');
  repondre = () => Promise.reject({ code: 'unknown_command' });
  h.avancer(15000); await attendre();
  assert.deepEqual([E.lireEtatEau().erreur, !!E.lireEtatEau().etat], [true, true], 'muet : on le dit, la réponse d’avant reste');
  fiche(); carte();
  assert.deepEqual(h.periodes(), [], 'plus d’abonné : plus de sondage');
});

test('I33 : le geste partagé — un second appui ne commande pas deux fois, des services explicites', async () => {
  const h = horloge();
  reglerPartage({ horloge: h });
  const appels = [];
  const hass = { callService: (d, s, data) => { appels.push([d, s, data.entity_id]); return Promise.resolve(); } };
  const st = { state: 'open', last_changed: '2026-10-19T12:00:00Z' };
  assert.equal(E.commanderVanne(hass, 'valve.arrivee_eau', 'fermer', st), true);
  assert.equal(E.commanderVanne(hass, 'valve.arrivee_eau', 'fermer', st), false, 'pendant le vol : rien ne part');
  assert.equal(E.commanderVanne(hass, 'valve.arrivee_eau', 'ouvrir', st), false, 'ni l’inverse');
  assert.deepEqual(appels, [['valve', 'close_valve', 'valve.arrivee_eau']]);
  assert.deepEqual(E.gesteVanne('valve.arrivee_eau', st), { sens: 'fermer' });
  /* ASSERTION MODIFIÉE (passe bis de l'étape 3, 25/10 ; point 2) : `closing` levait le geste, et la puce proposait aussitôt
   * « Rouvrir l'eau » d'un appui. Le geste tient pendant que la vanne TOURNE, et se lève quand elle a ATTEINT son sens. */
  assert.deepEqual(E.gesteVanne('valve.arrivee_eau', { state: 'closing', last_changed: '2026-10-19T12:00:03Z' }), { sens: 'fermer' }, 'elle tourne : le geste tient');
  assert.equal(E.commanderVanne(hass, 'valve.arrivee_eau', 'ouvrir', { state: 'closing', last_changed: '2026-10-19T12:00:03Z' }), false, 'pendant `closing`, rien ne part');
  assert.equal(E.gesteVanne('valve.arrivee_eau', { state: 'closed', last_changed: '2026-10-19T12:00:09Z' }), null, 'fermée : le geste se lève');
  // Une prise désignée : `turn_on`, son entité nommée.
  assert.equal(E.commanderVanne(hass, 'switch.prise_arrivee', 'ouvrir', { state: 'off', last_changed: '2026-10-19T12:00:00Z' }), true);
  assert.deepEqual(appels[1], ['switch', 'turn_on', 'switch.prise_arrivee']);
  // Sans réponse de la vanne, le geste tombe au bout de 30 s plus un relevé.
  h.avancer(E.VANNE_MS - 1);
  assert.deepEqual(E.gesteVanne('switch.prise_arrivee', { state: 'off', last_changed: '2026-10-19T12:00:00Z' }), { sens: 'ouvrir' });
  h.avancer(2);
  assert.equal(E.gesteVanne('switch.prise_arrivee', { state: 'off', last_changed: '2026-10-19T12:00:00Z' }), null);
  reglerPartage();
});

test('I33 : un refus de Home Assistant fait tomber le geste tout de suite', async () => {
  reglerPartage();
  const hass = { callService: () => Promise.reject(new Error('refusé')) };
  const st = { state: 'closed', last_changed: '2026-10-19T12:00:00Z' };
  const refus = [];
  // Sans `surRefus`, le rejet est relancé, orphelin : c'est lui que l'écoute globale de l'écran attend (le toast « Commande non exécutée »).
  assert.equal(E.commanderVanne(hass, 'valve.arrivee_eau', 'ouvrir', st, { surRefus: (e) => refus.push(e.message) }), true);
  await attendre(); await attendre();
  assert.equal(E.gesteVanne('valve.arrivee_eau', st), null);
  assert.deepEqual(refus, ['refusé']);
  reglerPartage();
});

test('la question d’une carte étroite : la popup la trouve, une fois', () => {
  E.poserQuestion('valve.arrivee_eau');
  assert.equal(E.prendreQuestion('valve.cave'), false);
  assert.equal(E.prendreQuestion('valve.arrivee_eau'), true);
  assert.equal(E.prendreQuestion('valve.arrivee_eau'), false);
});

test('I29 : « Fermer en cas de fuite » part par sa commande étroite, et un refus garde l’état', async () => {
  const h = horloge(); const envoyes = [];
  let refus = null;
  E.reglerEauEtat({ hass: null, horloge: h });
  E.poserEtatEau(ETAT(true));
  const hass = { callWS: (msg) => { envoyes.push(msg); return refus ? Promise.reject(refus) : Promise.resolve(ETAT(msg.actif)); } };
  const etat = await E.reglerFermerSurFuite(hass, false);
  assert.deepEqual(envoyes, [{ type: 'loggia/eau/regle', actif: false }], 'la valeur seule : jamais `loggia/config/set`');
  assert.equal(etat.regle.actif, false);
  assert.equal(E.lireEtatEau().etat.regle.actif, false, 'l’état rendu est posé');
  refus = { code: 'unauthorized', message: 'Unauthorized' };
  await assert.rejects(E.reglerFermerSurFuite(hass, true), (e) => e.code === 'unauthorized');
  assert.equal(E.lireEtatEau().etat.regle.actif, false, 'rien n’a changé');
  await assert.rejects(E.reglerFermerSurFuite(null, true), (e) => e.code === 'not_available');
});
