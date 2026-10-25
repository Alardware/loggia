/* Ce que l'écran lit des prises, une fois pour tout l'écran (chantier Prises,
 * § 6.1, 7) — le modèle de tests/voletsetat.test.mjs.
 *
 * Ce qui est garanti ici, source et horloge doublées, sans React :
 *  - rien ne part sans abonné ; l'état et les minuteurs à 60 s pour les
 *    cartes, 15 s pour la fiche ; un seul sondage pour toutes les cartes ;
 *  - serveur muet : `erreur`, sans effacer ce qu'on savait ; une réponse plus
 *    vieille ne recouvre pas ce qu'une écriture a posé ;
 *  - les mesures : UNE lecture pour toutes les cartes montées ensemble, sur
 *    5 minutes depuis minuit, moyennes et compteurs ; la courbe, les kWh du
 *    compteur, ou ceux de la courbe intégrée ;
 *  - les crochets rendent le cache tel qu'il est, sans rien lire au rendu. */
process.env.TZ = 'Europe/Paris';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const E = await import('../src/prisesetat.js');
const T = new Date(2026, 9, 13, 20, 40).getTime();

function horlogeFactice() {
  const h = { minuteurs: new Map(), suivant: 1 };
  const poser = (f, ms, rep) => { const id = h.suivant++; h.minuteurs.set(id, { f, ms, rep }); return id; };
  return Object.assign(h, {
    repeter: (f, ms) => poser(f, ms, true), arreter: (id) => h.minuteurs.delete(id),
    plusTard: (f, ms) => poser(f, ms, false), annuler: (id) => h.minuteurs.delete(id), maintenant: () => T,
    repetitions: () => [...h.minuteurs.values()].filter(m => m.rep).map(m => m.ms).sort((a, b) => a - b),
    attentes: () => [...h.minuteurs.values()].filter(m => !m.rep).map(m => m.ms),
    tic: () => { for (const [id, m] of [...h.minuteurs]) { if (!m.rep) h.minuteurs.delete(id); m.f(); } },
    // Les seules attentes (`plusTard`), sans les sondages qui se répètent.
    attente: () => { for (const [id, m] of [...h.minuteurs]) { if (!m.rep) { h.minuteurs.delete(id); m.f(); } } },
  });
}
function serveurFactice() {
  const appels = [];
  return { appels, hass: { callWS: (msg) => new Promise((ok, ko) => appels.push({ msg, ok, ko })) } };
}
const attendre = () => new Promise(r => setImmediate(r));
const etat = (n) => ({ maintenant: '2026-10-13T20:40:00+02:00', config: { protegees: [], types: {}, prevenir: {} }, notifier: true,
  prises: { ['switch.prise_' + n]: { type: 'prise', impose: false, protegee: false, prevenir: false, cycle: null, cycles: [] } } });

test('sans abonné rien ne part ; le premier lit l’état et les minuteurs, puis toutes les 60 s ; la fiche, 15 s', () => {
  const s = serveurFactice(), h = horlogeFactice();
  E.reglerPrisesEtat({ hass: s.hass, horloge: h });
  E.rafraichirPrises();
  assert.equal(s.appels.length, 0, 'une lecture sans abonné');
  const carte = E.abonnerPrises();
  assert.deepEqual(s.appels.map(a => a.msg.type), ['loggia/prises/etat', 'loggia/minuteurs/etat']);
  assert.deepEqual(h.repetitions(), [60000, 60000]);
  const autre = E.abonnerPrises();
  assert.equal(s.appels.length, 2, 'une seconde carte ne relit pas : le cache est partagé');
  const fiche = E.abonnerPrises({ rapide: true });
  assert.equal(s.appels.length, 4, 'la fiche qui s’ouvre relit aussitôt');
  assert.deepEqual(h.repetitions(), [15000, 15000]);
  fiche(); fiche();
  assert.deepEqual(h.repetitions(), [60000, 60000], 'désabonner deux fois ne fausse pas le compte');
  carte(); autre();
  assert.deepEqual(h.repetitions(), [], 'plus d’abonné : le sondage s’arrête');
});

test('la réponse se publie ; muet, l’état d’avant reste et l’erreur se dit ; une vieille réponse ne recouvre rien', async () => {
  const s = serveurFactice(), h = horlogeFactice();
  E.reglerPrisesEtat({ hass: s.hass, horloge: h });
  E.abonnerPrises();
  const A = etat('nas');
  s.appels[0].ok(A);
  s.appels[1].ok({ minuteurs: { 'switch.prise_nas': { fin: T / 1000 + 1800, duree: 30 } }, maintenant: T / 1000 });
  await attendre();
  assert.equal(E.lireEtatPrises().etat, A);
  h.tic();
  s.appels[2].ko({ code: 'unknown_command' });
  await attendre();
  assert.deepEqual(E.lireEtatPrises(), { etat: A, erreur: true });
  h.tic();
  const enVol = s.appels.filter(a => a.msg.type === 'loggia/prises/etat').at(-1);
  const B = etat('posee');
  E.poserEtatPrises(B);
  enVol.ok(etat('vieux'));
  await attendre();
  assert.equal(E.lireEtatPrises().etat, B, 'une lecture partie avant l’écriture l’a recouverte');
});

test('prisesDe : l’entrée d’une prise ; finMinuteur : la fin en millisecondes ; rien pour un serveur d’avant', () => {
  const A = etat('nas');
  assert.equal(E.prisesDe(A, 'switch.prise_nas'), A.prises['switch.prise_nas']);
  assert.equal(E.prisesDe(A, 'switch.autre'), null);
  assert.equal(E.prisesDe({ config: {} }, 'switch.prise_nas'), null);
  assert.equal(E.prisesDe(null, 'switch.prise_nas'), null);
  const m = { minuteurs: { 'switch.prise_pc': { fin: 1800000000, duree: 30 } }, maintenant: 1799998200 };
  assert.equal(E.finMinuteur(m, 'switch.prise_pc'), 1800000000000);
  assert.equal(E.finMinuteur(m, 'switch.prise_nas'), null);
  assert.equal(E.finMinuteur(null, 'switch.prise_pc'), null);
});

test('les mesures : une lecture pour toutes les cartes montées ensemble, sur 5 minutes depuis minuit', async () => {
  const s = serveurFactice(), h = horlogeFactice();
  E.reglerPrisesEtat({ hass: s.hass, horloge: h });
  const a = E.suivreMesures(['sensor.nas_power', 'sensor.nas_energy']);
  const b = E.suivreMesures(['sensor.pc_power']);
  assert.equal(s.appels.length, 0, 'rien avant que le rendu ne soit fini');
  assert.deepEqual(h.attentes(), [50], 'une seule relecture, groupée');
  h.attente();
  assert.equal(s.appels.length, 1);
  assert.deepEqual(s.appels[0].msg, { type: 'recorder/statistics_during_period', start_time: new Date(2026, 9, 13).toISOString(),
    statistic_ids: ['sensor.nas_energy', 'sensor.nas_power', 'sensor.pc_power'], period: '5minute', types: ['mean', 'change'], units: { power: 'W', energy: 'kWh' } });
  assert.deepEqual(h.repetitions(), [300000], 'relue toutes les 5 minutes');
  const c = E.suivreMesures(['sensor.pc_power']);
  assert.deepEqual(h.attentes(), [], 'un capteur déjà suivi ne relit rien');
  a(); b(); c();
  assert.deepEqual(h.repetitions(), [], 'plus de carte : plus de lecture');
});

// Le minuit de ce mardi 13 octobre : le `debut` d'une lecture faite aujourd'hui (`T` est 20:40).
const MINUIT = new Date(2026, 9, 13).getTime();

test('mesuresDe : la courbe, les kWh du compteur, ceux de la courbe intégrée ; rien tant que ce n’est pas lu', () => {
  const m = { debut: MINUIT, ids: ['sensor.nas_energy', 'sensor.nas_power', 'sensor.sejour_power', 'sensor.sans_stats'],
    stats: {
      'sensor.nas_power': [{ start: 1000, end: 301000, mean: 4 }, { start: 301000, end: 601000, mean: 23 }],
      'sensor.nas_energy': [{ start: 1000, end: 301000, change: 0.001 }, { start: 301000, end: 601000, change: 0.002 }],
      'sensor.sejour_power': [{ start: 1000, end: 301000, mean: 120 }, { start: 301000, end: 601000, mean: 60 }],
    } };
  const nas = E.mesuresDe(m, 'sensor.nas_power', 'sensor.nas_energy', T);
  assert.deepEqual(nas.points, [{ t: 1000, w: 4 }, { t: 301000, w: 23 }]);
  assert.deepEqual([Math.round(nas.kwh * 1000) / 1000, nas.estime], [0.003, false], 'le compteur fait foi');
  const sejour = E.mesuresDe(m, 'sensor.sejour_power', null, T);
  assert.deepEqual([sejour.kwh, sejour.estime], [(120 + 60) * 5 / 60 / 1000, true], 'sans compteur : la courbe intégrée');
  assert.deepEqual(E.mesuresDe(m, 'sensor.sans_stats', null, T), { points: [], kwh: null, estime: false }, 'lu, sans statistiques : pas de courbe');
  assert.deepEqual(E.mesuresDe(m, 'sensor.pas_encore', null, T), { points: null, kwh: null, estime: false }, 'pas encore lu');
  assert.deepEqual(E.mesuresDe(null, null, null, T), { points: [], kwh: null, estime: false }, 'une prise sans mesure');
});

test('mesuresDe : un compteur sans somme ne fait pas foi — « 0,00 kWh » compté sur rien — ; la courbe intégrée prend le relais', () => {
  // Un capteur `state_class: measurement` : des moyennes, aucun `change` — ou un `change` nul de HA, qui n'est pas un nombre.
  const m = { debut: MINUIT, ids: ['sensor.pc_energy', 'sensor.pc_power', 'sensor.nu_energy'],
    stats: {
      'sensor.pc_power': [{ start: 1000, end: 301000, mean: 120 }, { start: 301000, end: 601000, mean: 60 }],
      'sensor.pc_energy': [{ start: 1000, end: 301000, mean: 846.1 }, { start: 301000, end: 601000, mean: 846.2, change: null }],
      'sensor.nu_energy': [{ start: 1000, end: 301000, mean: 12 }],
    } };
  const pc = E.mesuresDe(m, 'sensor.pc_power', 'sensor.pc_energy', T);
  assert.deepEqual([pc.kwh, pc.estime], [(120 + 60) * 5 / 60 / 1000, true], 'pas de somme : les kWh de la courbe, dits estimés — pas 0,00');
  assert.deepEqual(E.mesuresDe(m, null, 'sensor.nu_energy', T), { points: [], kwh: null, estime: false }, 'ni somme ni courbe : rien, plutôt qu’un zéro inventé');
  // Un compteur qui a vraiment compté zéro reste un zéro : il porte une somme.
  const zero = { debut: MINUIT, ids: ['sensor.e'], stats: { 'sensor.e': [{ start: 1000, end: 301000, change: 0 }] } };
  assert.deepEqual(E.mesuresDe(zero, null, 'sensor.e', T), { points: [], kwh: 0, estime: false });
});

test('mesuresDe : après minuit, la lecture de la veille ne dit rien d’aujourd’hui — « pas encore lu »', () => {
  const lue = (debut) => ({ debut, ids: ['sensor.nas_energy', 'sensor.nas_power'], stats: {
    'sensor.nas_power': [{ start: 1000, end: 301000, mean: 4 }], 'sensor.nas_energy': [{ start: 1000, end: 301000, change: 1.5 }] } });
  assert.equal(E.mesuresDe(lue(MINUIT), 'sensor.nas_power', 'sensor.nas_energy', T).kwh, 1.5, 'lue aujourd’hui : elle vaut');
  const veille = lue(new Date(2026, 9, 12).getTime());
  assert.deepEqual(E.mesuresDe(veille, 'sensor.nas_power', 'sensor.nas_energy', T), { points: null, kwh: null, estime: false }, 'lue hier : ni courbe ni kWh');
  assert.deepEqual(E.mesuresDe(veille, 'sensor.nas_power', null, new Date(2026, 9, 12, 23, 59).getTime()).points, [{ t: 1000, w: 4 }], 'avant minuit, la même lecture valait encore');
  assert.deepEqual(E.mesuresDe({ ids: ['sensor.nas_power'], stats: {} }, 'sensor.nas_power', null, T).points, null, 'une lecture sans date ne se date pas : non lue');
});

test('useMesuresPrise : minuit passe sans relecture, la carte retombe sur « pas encore lu », puis la relecture rend la journée', async () => {
  const s = serveurFactice();
  let maintenant = T;
  const h = Object.assign(horlogeFactice(), { maintenant: () => maintenant });
  E.reglerPrisesEtat({ hass: s.hass, horloge: h });
  E.suivreMesures(['sensor.nas_power', 'sensor.nas_energy']);
  h.attente();
  s.appels[0].ok({ 'sensor.nas_power': [{ start: MINUIT + 3600000, end: MINUIT + 3900000, mean: 4 }], 'sensor.nas_energy': [{ start: MINUIT + 3600000, end: MINUIT + 3900000, change: 0.4 }] });
  await attendre();
  const vus = [];
  const Sonde = () => { vus.push(E.useMesuresPrise('sensor.nas_power', 'sensor.nas_energy', false)); return null; };
  renderToStaticMarkup(createElement(Sonde));
  assert.deepEqual([vus[0].points.length, vus[0].kwh], [1, 0.4], 'le soir de la lecture : la journée');
  maintenant = new Date(2026, 9, 14, 0, 5).getTime();     // minuit est passé ; la relecture n'est pas revenue
  renderToStaticMarkup(createElement(Sonde));
  assert.deepEqual(vus[1], { points: null, kwh: null, estime: false }, 'hier n’est pas aujourd’hui');
  E.suivreMesures(['sensor.autre_power']);                 // une carte de plus : la lecture groupée repart
  h.attente();
  const debutJour = new Date(2026, 9, 14).getTime();
  assert.equal(s.appels[1].msg.start_time, new Date(debutJour).toISOString(), 'relue depuis le minuit d’aujourd’hui');
  s.appels[1].ok({ 'sensor.nas_power': [{ start: debutJour + 60000, end: debutJour + 360000, mean: 6 }], 'sensor.nas_energy': [{ start: debutJour + 60000, end: debutJour + 360000, change: 0.01 }] });
  await attendre();
  renderToStaticMarkup(createElement(Sonde));
  assert.deepEqual([vus[2].points.length, vus[2].kwh], [1, 0.01], 'la relecture rend la journée d’aujourd’hui');
});

test('gardeDePrise : protégée, ou protection inconnue — on demande ; le cadenas, lui, ne paraît que pour une protection CONNUE', () => {
  const lu = (o = {}) => ({ config: { protegees: [], types: {}, prevenir: {} }, prises: {}, ...o });
  // Rien lu (le chargement, un échec, un serveur d'avant) : inconnue, donc gardée, sans cadenas.
  for (const rien of [null, undefined, 'x', 0]) assert.deepEqual(E.gardeDePrise(rien, 'switch.nas'), { protegee: false, inconnu: true, garde: true }, String(rien));
  // Lu : ce que le serveur dit de CETTE prise.
  const NAS = 'switch.nas';
  const nue = { type: 'prise', impose: false, protegee: false, prevenir: false, cycle: null, cycles: [] };
  assert.deepEqual(E.gardeDePrise(lu({ prises: { [NAS]: { ...nue, protegee: true } } }), NAS), { protegee: true, inconnu: false, garde: true }, 'protégée : le cadenas et la garde');
  assert.deepEqual(E.gardeDePrise(lu({ prises: { [NAS]: nue } }), NAS), { protegee: false, inconnu: false, garde: false }, 'lue et libre : on coupe sans demander');
  assert.deepEqual(E.gardeDePrise(lu(), NAS), { protegee: false, inconnu: false, garde: false }, 'lue, jamais protégée : libre — la protection est connue');
  // La liste `protegees` suffit : une prise que l'index ne connaît pas encore n'a pas son entrée dans `prises`.
  assert.deepEqual(E.gardeDePrise(lu({ config: { protegees: [NAS], types: {}, prevenir: {} } }), NAS), { protegee: true, inconnu: false, garde: true }, 'nommée dans la liste');
  assert.equal(E.gardeDePrise(lu({ config: { protegees: [NAS] } }), 'switch.pc').garde, false, 'une autre prise n’est pas protégée pour autant');
  // Un serveur d'avant n'a ni `prises` ni `config` : l'état est lu, la prise libre.
  assert.deepEqual(E.gardeDePrise({ maintenant: 'x' }, NAS), { protegee: false, inconnu: false, garde: false });
  // Une réponse tombée entre-temps (`erreur`) ne rend pas la prise inconnue : le magasin garde l'état d'avant.
  const s = serveurFactice();
  E.reglerPrisesEtat({ hass: s.hass, horloge: horlogeFactice() });
  assert.equal(E.gardeDePrise(E.lireEtatPrises().etat, NAS).inconnu, true, 'avant la première réponse : inconnue');
  E.poserEtatPrises(lu({ prises: { [NAS]: { ...nue, protegee: true } } }));
  E.abonnerPrises();
  s.appels[0].ko({ code: 'unknown_command' });
  return attendre().then(() => {
    assert.equal(E.lireEtatPrises().erreur, true);
    assert.deepEqual(E.gardeDePrise(E.lireEtatPrises().etat, NAS), { protegee: true, inconnu: false, garde: true }, 'une lecture ratée après une réussie : la protection reste connue');
  });
});

test('gardeDeSwitch (F2) : la règle commune des switch que l’index ne classe pas — l’état les nomme, ou n’a pas répondu ; une erreur sans état, ou l’index lu, ne gardent rien', () => {
  const NAS = 'switch.nas';
  const lu = (o = {}) => ({ config: { protegees: [], types: {}, prevenir: {} }, prises: {}, ...o });
  const nomme = lu({ config: { protegees: [NAS], types: {}, prevenir: {} } });
  const G = E.gardeDeSwitch;
  // Une prise que l'index reconnaît : la garde de la prise (A3) — protégée, OU protection inconnue. Ni l'index, ni l'erreur n'y changent rien.
  for (const erreur of [false, true]) {
    assert.equal(G({ etat: null, erreur }, NAS, { reconnue: true, indexLu: true }), true, 'inconnue : dans le doute, on demande — erreur ou non');
    assert.equal(G({ etat: lu(), erreur }, NAS, { reconnue: true, indexLu: true }), false, 'lue et libre : on coupe sans demander');
    assert.equal(G({ etat: nomme, erreur }, NAS, { reconnue: true, indexLu: true }), true, 'protégée');
    assert.equal(G({ etat: null, erreur }, NAS, { reconnue: true, indexLu: true }), E.gardeDePrise(null, NAS).garde, 'c’est bien gardeDePrise');
  }
  // Un switch que l'index ne classe pas encore : (a) la liste `protegees` d'un état CONNU le nomme ; (b) l'état n'a encore reçu AUCUNE réponse, et aucune erreur.
  const avant = { reconnue: false, indexLu: false };
  assert.equal(G({ etat: nomme, erreur: false }, NAS, avant), true, '(a) nommé');
  assert.equal(G({ etat: nomme, erreur: true }, NAS, avant), true, '(a) nommé, la lecture suivante a échoué : le magasin garde l’état d’avant');
  assert.equal(G({ etat: lu(), erreur: false }, NAS, avant), false, 'lu, et ne le nomme pas : libre');
  assert.equal(G({ etat: nomme }, 'switch.autre', avant), false, 'un autre switch que celui que la liste nomme');
  assert.equal(G({ etat: lu({ prises: { [NAS]: { type: 'nas', protegee: true } } }) }, NAS, avant), true, 'protégé dans l’entrée même que le serveur donne à la prise');
  assert.equal(G({ etat: null, erreur: false }, NAS, avant), true, '(b) le chargement : ni état ni erreur');
  assert.equal(G(undefined, NAS, avant), true, '(b) pas même une lecture');
  // En cas d'erreur sans état, on ne garde PAS un switch que l'index ne connaît pas : un serveur trop vieux ne doit pas gêner indéfiniment.
  assert.equal(G({ etat: null, erreur: true }, NAS, avant), false);
  // L'index lu, un switch qu'il ne classe pas n'est pas une prise : (b) cesse — (a) vaut encore, la liste est la liste.
  const apres = { reconnue: false, indexLu: true };
  assert.equal(G({ etat: null, erreur: false }, NAS, apres), false, 'rien lu, mais l’index est là : un switch ordinaire');
  assert.equal(G({ etat: nomme, erreur: false }, NAS, apres), true);
  // Sans option, dans le doute : on demande.
  assert.equal(G({ etat: null, erreur: false }, NAS), true);
});

test('abonnesPrises (F5) : combien de composants suivent l’état — 0, et personne ne relit le cache', () => {
  const s = serveurFactice(), h = horlogeFactice();
  E.reglerPrisesEtat({ hass: s.hass, horloge: h });
  assert.equal(E.abonnesPrises(), 0);
  E.poserEtatPrises(etat('nas'));
  assert.equal(E.abonnesPrises(), 0, 'un état posé n’est pas suivi : il peut dater de la dernière fois');
  const carte = E.abonnerPrises(), fiche = E.abonnerPrises({ rapide: true });
  assert.equal(E.abonnesPrises(), 2);
  carte(); carte();
  assert.equal(E.abonnesPrises(), 1, 'désabonner deux fois ne fausse pas le compte');
  fiche();
  assert.equal(E.abonnesPrises(), 0, 'plus d’abonné : plus personne ne le relit');
  E.abonnerPrises();
  E.reglerPrisesEtat({ hass: s.hass, horloge: h });
  assert.equal(E.abonnesPrises(), 0, 'les tests repartent de zéro');
});

test('les crochets : le cache tel qu’il est, sans rien lire au rendu', () => {
  const s = serveurFactice();
  E.reglerPrisesEtat({ hass: s.hass, horloge: horlogeFactice() });
  const A = etat('nas');
  E.poserEtatPrises(A);
  E.poserMinuteurs({ minuteurs: {}, maintenant: 0 });
  const vus = [];
  const Sonde = () => { vus.push(E.useEtatPrises(true, { rapide: true }), E.useMesuresPrise('sensor.nas_power', null)); return null; };
  renderToStaticMarkup(createElement(Sonde));
  assert.equal(vus[0].etat, A);
  assert.deepEqual(vus[0].minuteurs, { minuteurs: {}, maintenant: 0 });
  assert.deepEqual(vus[1], { points: null, kwh: null, estime: false });
  assert.equal(s.appels.length, 0, 'l’abonnement part après le rendu, jamais pendant');
});

/* TEST AJOUTÉ (audit de l'écran des prises, 19/10, point 6) : le magasin ne republie pas un relevé identique. Le serveur
 * renvoie à chaque lecture un objet neuf, et `maintenant` — son horloge — change toujours : sans comparaison, chaque relevé
 * (60 s, 15 s fiche ouverte) redessinait tout ce qui le suit, et `lireEtatPrises` ne rendait pas « le même objet tant que
 * rien ne change ». Un changement de la configuration, d'une prise ou d'un minuteur, lui, se publie. */
test('point 6 : un relevé identique — `maintenant` mis à part — ne se republie pas ; un changement, si', async () => {
  const s = serveurFactice(), h = horlogeFactice();
  E.reglerPrisesEtat({ hass: s.hass, horloge: h });
  E.abonnerPrises();
  let vus = 0;
  const { lireEtatPrises, lireMinuteurs, ecouterMinuteurs } = E;
  const fin = E.abonnerMinuteurs();
  ecouterMinuteurs(() => { vus += 1; });
  const A = etat('nas');
  s.appels[0].ok(A);
  s.appels[1].ok({ minuteurs: { 'switch.prise_nas': { fin: T / 1000 + 1800, duree: 30 } }, maintenant: T / 1000 });
  await attendre();
  const m0 = lireMinuteurs();
  assert.equal(vus, 1);
  h.tic();
  const relus = s.appels.slice(-2);
  relus.find(a => a.msg.type === 'loggia/prises/etat').ok({ ...etat('nas'), maintenant: '2026-10-13T20:41:00+02:00' });
  relus.find(a => a.msg.type === 'loggia/minuteurs/etat').ok({ minuteurs: { 'switch.prise_nas': { fin: T / 1000 + 1800, duree: 30 } }, maintenant: T / 1000 + 60 });
  await attendre();
  assert.equal(lireEtatPrises().etat, A, 'le même objet : rien n’a changé');
  assert.equal(lireMinuteurs(), m0, 'les minuteurs non plus');
  assert.equal(vus, 1, 'personne n’est réveillé pour rien');
  h.tic();
  const B = { ...etat('nas'), config: { protegees: ['switch.prise_nas'], types: {}, prevenir: {} } };
  const encore = s.appels.slice(-2);
  encore.find(a => a.msg.type === 'loggia/prises/etat').ok(B);
  encore.find(a => a.msg.type === 'loggia/minuteurs/etat').ok({ minuteurs: {}, maintenant: T / 1000 + 120 });
  await attendre();
  assert.equal(lireEtatPrises().etat, B, 'la configuration a changé : elle se publie');
  assert.equal(vus, 2, 'le minuteur annulé aussi');
  fin();
});

/* TEST AJOUTÉ (audit du 19/10, point 5) : un minuteur dont la fin est passée — le serveur ne l'a pas encore retiré, le
 * sondage ne le sait qu'au tour suivant — n'est plus un minuteur : « Se coupe à 20:40 · dans 0 min » ne se dit pas. */
test('point 5 : finMinuteur avec l’heure — une fin passée vaut « pas de minuteur »', () => {
  const m = { minuteurs: { 'switch.prise_pc': { fin: T / 1000, duree: 30 } } };
  assert.equal(E.finMinuteur(m, 'switch.prise_pc'), T, 'sans l’heure, la règle d’avant');
  assert.equal(E.finMinuteur(m, 'switch.prise_pc', T), null, 'à l’heure dite : fini');
  assert.equal(E.finMinuteur(m, 'switch.prise_pc', T + 1), null, 'passée : fini');
  assert.equal(E.finMinuteur(m, 'switch.prise_pc', T - 60000), T, 'encore une minute : il tourne');
});

/* TEST AJOUTÉ (audit du 19/10, point 2) : les cycles que le serveur suit, pour l'Accueil et les notifications. `null` tant
 * qu'il ne dit rien — module muet, aucune prise d'électroménager suivie : l'Accueil garde alors son ancien chemin. */
test('point 2 : cyclesElectromenager — ceux en cours ; null sans lecture ou sans électroménager suivi', () => {
  const entree = (o) => ({ type: 'prise', impose: false, protegee: false, prevenir: false, cycle: null, cycles: [], ...o });
  const avec = (prises) => ({ maintenant: '2026-10-13T20:40:00+02:00', config: {}, notifier: true, prises });
  const mesure = () => true;
  assert.equal(E.cyclesElectromenager(null, mesure), null, 'rien lu');
  assert.equal(E.cyclesElectromenager({ config: {} }, mesure), null, 'un serveur sans `prises`');
  assert.equal(E.cyclesElectromenager(avec({ 'switch.nas': entree({ type: 'nas' }) }), mesure), null, 'pas d’électroménager');
  assert.deepEqual(E.cyclesElectromenager(avec({ 'switch.lv': entree({ type: 'lv', suivi: true }) }), mesure), [], 'suivi, au repos : rien en cours');
  assert.equal(E.cyclesElectromenager(avec({ 'switch.lv': entree({ type: 'lv', suivi: false }) }), mesure), null, 'le serveur dit qu’il ne le suit pas');
  // Un serveur d'avant `suivi` : la prise qui mesure est suivie, l'autre non.
  assert.deepEqual(E.cyclesElectromenager(avec({ 'switch.lv': entree({ type: 'lv' }) }), () => true), []);
  assert.equal(E.cyclesElectromenager(avec({ 'switch.lv': entree({ type: 'lv' }) }), () => false), null);
  const deux = avec({ 'switch.ll': entree({ type: 'll', suivi: true, cycle: { debut: '2026-10-13T19:05:00+02:00' } }),
    'switch.lv': entree({ type: 'lv', suivi: true, cycle: { debut: '2026-10-13T20:10:00+02:00' } }), 'switch.sl': entree({ type: 'sl', suivi: true }) });
  assert.deepEqual(E.cyclesElectromenager(deux, mesure), [{ id: 'switch.ll', type: 'll', debut: '2026-10-13T19:05:00+02:00' }, { id: 'switch.lv', type: 'lv', debut: '2026-10-13T20:10:00+02:00' }]);
});

test('point 2 : CYCLES_SUIVIS est l’électroménager de prises.js', async () => {
  Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
  const { ELECTROMENAGER } = await import('../src/prises.js');
  assert.deepEqual(E.CYCLES_SUIVIS, ELECTROMENAGER);
});
