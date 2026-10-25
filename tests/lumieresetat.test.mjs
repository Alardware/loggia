/* Ce que l'écran lit des lumières, une fois pour tout l'écran (chantier
 * Lumières, § 6.2, § 7) — le modèle de tests/prisesetat.test.mjs.
 *
 * Ce qui est garanti ici, source et horloge doublées :
 *  - rien ne part sans abonné ; le carnet à 60 s pour les cartes, 15 s pour la
 *    fiche ; un seul sondage pour toutes les cartes ;
 *  - les minuteurs sont ceux des prises : une carte de prise et une carte de
 *    lumière ne lisent `loggia/minuteurs/etat` qu'une fois ;
 *  - un serveur d'avant ce chantier ne répond pas : rien n'est su, et rien ne
 *    casse — pas de dernier niveau ;
 *  - l'avance de « Tout éteindre » : elle tient tant que la lampe n'a pas
 *    répondu, 6 s au plus. */
process.env.TZ = 'Europe/Paris';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const L = await import('../src/lumieresetat.js');
const P = await import('../src/prisesetat.js');
const T = new Date(2026, 9, 14, 20, 40).getTime();

function horlogeFactice() {
  const h = { minuteurs: new Map(), suivant: 1 };
  const poser = (f, ms, rep) => { const id = h.suivant++; h.minuteurs.set(id, { f, ms, rep }); return id; };
  return Object.assign(h, {
    repeter: (f, ms) => poser(f, ms, true), arreter: (id) => h.minuteurs.delete(id),
    plusTard: (f, ms) => poser(f, ms, false), annuler: (id) => h.minuteurs.delete(id), maintenant: () => T,
    repetitions: () => [...h.minuteurs.values()].filter(m => m.rep).map(m => m.ms).sort((a, b) => a - b),
    tic: () => { for (const [id, m] of [...h.minuteurs]) { if (!m.rep) h.minuteurs.delete(id); m.f(); } },
  });
}
function serveurFactice() {
  const appels = [];
  return { appels, hass: { callWS: (msg) => new Promise((ok, ko) => appels.push({ msg, ok, ko })) } };
}
const attendre = () => new Promise(r => setImmediate(r));
const ETAT = { maintenant: '2026-10-14T20:40:00+02:00', lumieres: { 'light.chambre': { dernier: { bri: 80, mode: 'brightness', kelvin: null, hs: null } } } };

test('sans abonné rien ne part ; une carte lit le carnet et les minuteurs, puis toutes les 60 s ; la fiche, 15 s', () => {
  const s = serveurFactice(), h = horlogeFactice();
  L.reglerLumieresEtat({ hass: s.hass, horloge: h });
  assert.equal(s.appels.length, 0);
  const desabonner = [];
  // Le crochet `useEtatLumieres` s'abonne dans un effet : on appelle ici ce qu'il appelle.
  desabonner.push(L.abonnerLumieres());
  assert.deepEqual(s.appels.map(a => a.msg.type), ['loggia/lumieres/etat', 'loggia/minuteurs/etat']);
  assert.deepEqual(h.repetitions(), [60000, 60000]);
  desabonner.push(L.abonnerLumieres());
  assert.equal(s.appels.length, 2, 'une seconde carte ne relit pas : le cache est partagé');
  const fiche = L.abonnerLumieres({ rapide: true });
  assert.equal(s.appels.length, 4, 'la fiche qui s’ouvre relit aussitôt');
  assert.deepEqual(h.repetitions(), [15000, 15000]);
  fiche();
  desabonner.forEach(f => f());
  assert.deepEqual(h.repetitions(), [], 'plus d’abonné : le sondage s’arrête');
});

test('les minuteurs sont ceux des prises : une carte de prise et une carte de lumière ne les lisent qu’une fois', () => {
  const s = serveurFactice(), h = horlogeFactice();
  L.reglerLumieresEtat({ hass: s.hass, horloge: h });
  const prise = P.abonnerPrises();
  const lumiere = L.abonnerLumieres();
  assert.deepEqual(s.appels.map(a => a.msg.type).sort(), ['loggia/lumieres/etat', 'loggia/minuteurs/etat', 'loggia/prises/etat']);
  prise(); lumiere();
});

test('le dernier niveau d’une lampe ; un serveur d’avant ne répond pas : rien n’est su, rien ne casse', async () => {
  const s = serveurFactice(), h = horlogeFactice();
  L.reglerLumieresEtat({ hass: s.hass, horloge: h });
  const fin = L.abonnerLumieres();
  s.appels[0].ok(ETAT);
  await attendre();
  assert.deepEqual(L.dernierDe(L.lireEtatLumieres().etat, 'light.chambre'), { bri: 80, mode: 'brightness', kelvin: null, hs: null });
  assert.equal(L.dernierDe(L.lireEtatLumieres().etat, 'light.bureau'), null, 'une lampe sans entrée');
  assert.deepEqual(L.dernierDe({ lumieres: { 'light.x': { dernier: { bri: 0, mode: 'xy', kelvin: 'a', hs: [275, 100] } } } }, 'light.x'), { bri: null, mode: 'xy', kelvin: null, hs: [275, 100] }, 'un niveau hors de 1 à 100 n’est pas un niveau');
  assert.equal(L.dernierDe(null, 'light.chambre'), null);
  fin();
  L.reglerLumieresEtat({ hass: s.hass, horloge: h });
  const fin2 = L.abonnerLumieres();
  s.appels.at(-2).ko({ code: 'unknown_command', message: 'Unknown command.' });
  await attendre();
  assert.deepEqual(L.lireEtatLumieres(), { etat: null, erreur: true }, 'un composant d’avant ce chantier : rien n’est su, l’erreur se dit');
  fin2();
});

test('l’avance de « Tout éteindre » tient tant que la lampe n’a pas répondu, 6 s au plus', () => {
  L.reglerLumieresEtat({});
  const S = { 'light.a': { state: 'on', last_changed: 't1' }, 'light.b': { state: 'on', last_changed: 't2' } };
  L.avancerLumieres(['light.a', 'light.b'], false, S, 1000);
  assert.equal(L.avanceDe('light.a', S['light.a'], 2000), false, 'tout de suite : éteinte');
  assert.equal(L.avanceDe('light.a', { state: 'off', last_changed: 't3' }, 2000), null, 'la lampe a répondu : sa vérité');
  assert.equal(L.avanceDe('light.b', S['light.b'], 6999), false);
  assert.equal(L.avanceDe('light.b', S['light.b'], 7000), null, '6 s : la carte redit ce que la maison dit');
  assert.equal(L.avanceDe('light.c', { state: 'on', last_changed: 't' }, 2000), null, 'une lampe qu’on n’a pas touchée');
});

test('B10 : une relecture des minuteurs demandée hors sondage — coalescée dans le tour, rien sans abonné', async () => {
  const s = serveurFactice(), h = horlogeFactice();
  L.reglerLumieresEtat({ hass: s.hass, horloge: h });
  P.relireMinuteurs(); P.relireMinuteurs();
  await attendre();
  assert.equal(s.appels.length, 0, 'sans abonné, rien ne part');
  const carte = L.abonnerLumieres();
  assert.equal(s.appels.filter(a => a.msg.type === 'loggia/minuteurs/etat').length, 1);
  P.relireMinuteurs(); P.relireMinuteurs(); P.relireMinuteurs();
  await attendre();
  assert.equal(s.appels.filter(a => a.msg.type === 'loggia/minuteurs/etat').length, 2, 'trois demandes dans le même tour : UNE lecture');
  carte();
});

