/* TEST AJOUTÉ (chantier IoT, tâche 5, 18/10 ; I35, I3 A, I7, I33) — ce que l'écran lit des robots, une fois pour tout l'écran
 * (src/robotsetat.js), le modèle de tests/enfantetat.test.mjs.
 *
 * Ce qui est garanti ici, source et horloge doublées :
 *  - rien ne part sans abonné ; `loggia/robots/etat` à 60 s tant qu'une carte est montée, 15 s fiche ouverte ; relu après une
 *    commande ; un serveur muet garde ce qu'on savait et le dit ;
 *  - ce que le carnet dit d'un robot pour sa carte : les pièces du passage en cours, « tout », sa dernière erreur, le prochain
 *    passage qui partira (« Ne pas déranger » compris) — et rien d'inventé sans serveur ;
 *  - un départ passe par le serveur, qui note les pièces, et l'état qu'il rend remplace le cache ; un serveur d'avant ce
 *    chantier : le départ part en direct ; un refus garde son code et sa phrase ; une coupure ne redouble pas le départ ;
 *  - « Il bipe » : trois secondes, dans cet onglet, ce robot seulement. */
process.env.TZ = 'Europe/Paris';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';

import { monter, horlogeFausse, documentFaux } from './crochets.mjs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
// La fiche se JOUE (passe bis du 18/10, point 10) : sous `?robotsetat_fiche`, App.jsx exporte la vue de la carte.
register('./jsx-hooks.mjs', import.meta.url);
register('data:text/javascript,' + encodeURIComponent([
  'export async function load(url, ctx, next) {',
  "  if (!url.endsWith('/src/App.jsx?robotsetat_fiche')) return next(url, ctx);",
  "  const r = await next(url.slice(0, -'?robotsetat_fiche'.length), ctx);",
  "  return { ...r, source: String(r.source) + ';export { useVueRobot };' };",
  '}',
].join('\n')));
const R = await import('../src/robotsetat.js');
const { texteRefus } = await import('../src/refus.js');
// Le « maintenant » de la maquette : samedi 17/10/2026, 18:20.
const T = new Date(2026, 9, 17, 18, 20).getTime();

function horlogeFactice() {
  const h = { minuteurs: new Map(), suivant: 1, t: T };
  const poser = (f, ms, rep) => { const id = h.suivant++; h.minuteurs.set(id, { f, ms, rep, a: h.t + ms }); return id; };
  return Object.assign(h, {
    repeter: (f, ms) => poser(f, ms, true), arreter: (id) => h.minuteurs.delete(id),
    plusTard: (f, ms) => poser(f, ms, false), annuler: (id) => h.minuteurs.delete(id), maintenant: () => h.t,
    repetitions: () => [...h.minuteurs.values()].filter(m => m.rep).map(m => m.ms).sort((a, b) => a - b),
    avancer(ms) {
      h.t += ms;
      for (const [id, m] of [...h.minuteurs]) {
        if (m.a > h.t) continue;
        if (m.rep) m.a += m.ms; else h.minuteurs.delete(id);
        m.f();
      }
    },
  });
}
function serveurFactice() {
  const appels = [];
  return { appels, hass: { callWS: (msg) => new Promise((ok, ko) => appels.push({ msg, ok, ko })) } };
}
const attendre = () => new Promise(r => setImmediate(r));
const S = T / 1000;
const ETAT = {
  maintenant: S, meteo: null, journal: [],
  config: {
    plannings: [
      { id: 'nuit', robot: 'vacuum.robot', heure: '23:00', jours: [5, 6], zones: [], actif: true },
      { id: 'semaine', robot: 'vacuum.robot', heure: '09:30', jours: [0, 1, 2, 3, 4], zones: [], actif: true },
    ],
    robots: { 'vacuum.robot': { calme: { actif: true, debut: '22:00', fin: '07:00' }, pluie: { actif: false } } },
  },
  passages: [],
  en_cours: {
    'vacuum.robot': { debut: S - 600, phase: 'travail', duree_min: 10, zones: [{ id: 'seg:1', nom: 'Salon' }, { id: 'seg:2', nom: 'Cuisine' }], tout: false, source: 'loggia', surface: 12 },
    'lawn_mower.tondeuse': { debut: S - 1800, phase: 'pause', duree_min: 28, zones: [], tout: true, source: 'loggia', surface: null },
  },
  erreurs: { 'lawn_mower.tondeuse': { texte: 'Lame bloquée', t: S - 60 } },
};
const SALON = [{ id: 'seg:1', nom: 'Salon', segments: [1] }];

test('sans abonné rien ne part ; une carte lit l’état des robots, puis toutes les 60 s ; la fiche, 15 s ; plus d’abonné, plus de sondage', () => {
  const s = serveurFactice(), h = horlogeFactice();
  R.reglerRobotsEtat({ hass: s.hass, horloge: h });
  assert.equal(s.appels.length, 0);
  const carte = R.abonnerRobots();
  assert.deepEqual(s.appels.map(a => a.msg.type), ['loggia/robots/etat']);
  assert.deepEqual(h.repetitions(), [60000]);
  const autre = R.abonnerRobots();
  assert.equal(s.appels.length, 1, 'une seconde carte ne relit pas : le cache est partagé');
  const fiche = R.abonnerRobots({ rapide: true });
  assert.equal(s.appels.length, 2, 'la fiche qui s’ouvre relit aussitôt');
  assert.deepEqual(h.repetitions(), [15000]);
  fiche(); autre(); carte();
  assert.deepEqual(h.repetitions(), [], 'plus d’abonné : le sondage s’arrête');
});

test('le même objet tant que rien ne change ; un serveur muet garde ce qu’on savait, et le dit', async () => {
  const s = serveurFactice(), h = horlogeFactice();
  R.reglerRobotsEtat({ hass: s.hass, horloge: h });
  const fin = R.abonnerRobots();
  s.appels[0].ok(ETAT);
  await attendre();
  assert.equal(R.lireEtatRobots().erreur, false);
  /* ASSERTION MODIFIÉE (passe bis du 18/10, point 10) : `recu`, l'heure de réception que rien ne lisait, part — et le magasin tient ce
   * que son commentaire promettait : une réponse égale à la précédente rend le MÊME objet, et personne ne se redessine pour rien ;
   * une réponse qui change publie l'objet neuf. */
  const premier = R.lireEtatRobots();
  assert.equal('recu' in premier.etat, false, 'plus de champ mort');
  let vus = 0;
  const cesser = R.ecouterEtatRobots(() => { vus += 1; });
  R.apresCommandeRobot();
  s.appels.at(-1).ok(JSON.parse(JSON.stringify(ETAT)));
  await attendre();
  assert.equal(R.lireEtatRobots(), premier, 'la même réponse : le même objet');
  assert.equal(vus, 0, 'personne ne se redessine pour rien');
  R.poserEtatRobots(JSON.parse(JSON.stringify(ETAT)));
  assert.equal(R.lireEtatRobots(), premier, 'un état posé égal : le même objet');
  R.apresCommandeRobot();
  s.appels.at(-1).ok({ ...ETAT, erreurs: {} });
  await attendre();
  assert.notEqual(R.lireEtatRobots(), premier, 'une réponse qui change : l’objet neuf');
  assert.equal(vus, 1);
  cesser();
  h.avancer(60000);
  // ASSERTION MODIFIÉE (passe bis du 18/10, point 10) : la dernière lecture partie, quelles que soient celles d'avant.
  s.appels.at(-1).ko({ code: 'unknown_command', message: 'Unknown command.' });
  await attendre();
  assert.equal(R.lireEtatRobots().erreur, true, 'le serveur ne répond plus : on le dit');
  assert.equal(R.lireEtatRobots().etat.en_cours['vacuum.robot'].zones.length, 2, 'ce qu’on savait reste lu : périmé vaut mieux que rien');
  fin();
});

test('ce que le carnet dit d’un robot pour sa carte — et rien d’inventé sans serveur', () => {
  // ASSERTION MODIFIÉE (passe bis du 18/10, point A) : la vue du carnet dit aussi le nom du script maison qui a lancé (`libelle`), vide ici.
  assert.deepEqual(R.vueCarnetRobot(null, 'vacuum.robot', T), { pieces: null, tout: false, libelle: null, erreur: null, prochain: null },
    'serveur muet, ou pas encore lu : « Nettoyage en cours », « Sur la base »');
  const v = R.vueCarnetRobot(ETAT, 'vacuum.robot', T);
  assert.deepEqual([v.pieces, v.tout, v.erreur], [['Salon', 'Cuisine'], false, null], 'les pièces du passage en cours, au carnet');
  // 23:00 samedi et dimanche tombent dans « Ne pas déranger » (22:00–07:00) : ils ne partiront pas. Le prochain : lundi 09:30.
  assert.deepEqual([v.prochain.planning.id, v.prochain.date.getDate(), v.prochain.date.getHours(), v.prochain.date.getMinutes()], ['semaine', 19, 9, 30]);
  const t = R.vueCarnetRobot(ETAT, 'lawn_mower.tondeuse', T);
  assert.deepEqual([t.pieces, t.tout, t.erreur, t.prochain], [null, true, 'Lame bloquée', null], 'Loggia a tout lancé ; sa dernière erreur ; aucun planning');
  assert.deepEqual(R.vueCarnetRobot(ETAT, 'vacuum.autre', T), { pieces: null, tout: false, libelle: null, erreur: null, prochain: null }, 'un robot que le carnet ne connaît pas');
});

/* TEST AJOUTÉ (passe bis 2 du 18/10, point D) : une tondeuse sans aire allumée — le passage qu'elle annonce est celui qui PARTIRA : un
 * passage sans zone serait retenu au serveur (« aucune zone allumée »), il ne se propose pas ; un passage qui nomme ses zones, si. */
test('point D : sans aire allumée, le prochain passage d’une tondeuse est un passage qui nomme ses zones', () => {
  const etat = { ...ETAT, config: { robots: {}, plannings: [
    { id: 'nu', robot: 'lawn_mower.t', heure: '19:00', jours: [5], zones: [], actif: true },
    { id: 'avant', robot: 'lawn_mower.t', heure: '09:00', jours: [6], zones: [{ id: 'switch.t_zone_avant', nom: 'Avant', segments: [] }], actif: true },
  ] } };
  assert.equal(R.vueCarnetRobot(etat, 'lawn_mower.t', T).prochain.planning.id, 'nu', 'des aires allumées : le premier');
  assert.equal(R.vueCarnetRobot(etat, 'lawn_mower.t', T, null, { sansZone: true }).prochain.planning.id, 'avant', 'aucune : celui qui nomme ses zones');
});

test('un départ passe par le serveur : il note les pièces, l’état qu’il rend remplace le cache, et l’on relit quand le robot a répondu', async () => {
  const s = serveurFactice(), h = horlogeFactice();
  R.reglerRobotsEtat({ hass: s.hass, horloge: h });
  const fin = R.abonnerRobots();
  s.appels[0].ok({ ...ETAT, en_cours: {} });
  await attendre();
  let direct = 0;
  const p = R.lancerRobot(s.hass, 'vacuum.robot', SALON, { direct: () => { direct += 1; } });
  assert.deepEqual(s.appels.at(-1).msg, { type: 'loggia/robots/lancer', robot: 'vacuum.robot', zones: SALON });
  s.appels.at(-1).ok(ETAT);
  assert.equal((await p).en_cours['vacuum.robot'].zones[0].nom, 'Salon');
  assert.equal(direct, 0);
  assert.equal(R.lireEtatRobots().etat.en_cours['vacuum.robot'].zones[0].nom, 'Salon', 'la carte dit aussitôt « Nettoie · Salon, Cuisine »');
  const n = s.appels.length;
  h.avancer(11999);
  assert.equal(s.appels.length, n);
  h.avancer(1);
  assert.deepEqual(s.appels.slice(n).map(a => a.msg.type), ['loggia/robots/etat'], 'relu quand le robot a dû répondre : la session ouverte au carnet');
  // Une commande directe de la carte (pause, base, localiser) : relu tout de suite, et encore une fois après.
  R.apresCommandeRobot();
  assert.equal(s.appels.length, n + 2);
  h.avancer(12000);
  assert.equal(s.appels.length, n + 3);
  fin();
});

test('un serveur d’avant ce chantier : le départ part en direct ; un refus garde son code et sa phrase ; une coupure ne redouble rien', async () => {
  for (const code of ['unknown_command', 'not_available']) {
    const s = serveurFactice(), h = horlogeFactice();
    R.reglerRobotsEtat({ hass: s.hass, horloge: h });
    let direct = 0;
    const p = R.lancerRobot(s.hass, 'vacuum.robot', [], { direct: () => { direct += 1; } });
    s.appels.at(-1).ko({ code, message: 'x' });
    assert.equal(await p, null);
    assert.equal(direct, 1, code + ' : le départ part en direct, comme avant ce chantier');
  }
  const s = serveurFactice(), h = horlogeFactice();
  R.reglerRobotsEtat({ hass: s.hass, horloge: h });
  let direct = 0;
  const refus = { code: 'deja_en_route', message: 'deja en route : vacuum.robot' };
  assert.equal(texteRefus(refus), null, 'avant le premier refus, le démarrage ne porte pas ces phrases');
  const p = R.lancerRobot(s.hass, 'vacuum.robot', [], { direct: () => { direct += 1; } });
  s.appels.at(-1).ko(refus);
  await assert.rejects(p, (e) => e.code === 'deja_en_route');
  assert.equal(direct, 0, 'un refus ne part pas en direct');
  assert.equal(texteRefus(refus), 'Départ non lancé — le robot est déjà en route', 'sa phrase est chargée avant qu’il remonte au toast');
  const coupure = R.lancerRobot(s.hass, 'vacuum.robot', [], { direct: () => { direct += 1; } });
  s.appels.at(-1).ko({ error: 3 });
  await assert.rejects(coupure);
  assert.equal(direct, 0, 'une coupure : le départ est peut-être parti, on ne le redouble pas');
});

/* TEST AJOUTÉ (chantier IoT, tâche 6, 18/10 ; § 6, ligne 4 : « les pièces du carnet, ou de l'onglet qui a lancé ») : la carte
 * dit ce que CET onglet vient de lancer avant que le serveur ne l'ait au carnet — deux minutes au plus, la règle du carnet ; le
 * carnet passe devant dès qu'il a la session ; un départ refusé ne laisse rien. */
test('le départ que cet onglet vient de lancer se dit avant le carnet, deux minutes au plus', async () => {
  const s = serveurFactice(), h = horlogeFactice();
  R.reglerRobotsEtat({ hass: s.hass, horloge: h });
  const p = R.lancerRobot(s.hass, 'vacuum.robot', SALON, {});
  assert.deepEqual(R.departRobot('vacuum.robot'), { pieces: ['Salon'], tout: false, t: T }, 'noté avant même la réponse du serveur');
  assert.deepEqual(R.vueCarnetRobot({ ...ETAT, en_cours: {} }, 'vacuum.robot', T, R.departRobot('vacuum.robot')).pieces, ['Salon'], 'sans session au carnet : les pièces de cet onglet');
  assert.deepEqual(R.vueCarnetRobot(ETAT, 'vacuum.robot', T, R.departRobot('vacuum.robot')).pieces, ['Salon', 'Cuisine'], 'le carnet passe devant');
  s.appels.at(-1).ok({ ...ETAT, en_cours: {} });
  await p;
  h.avancer(120000);
  assert.ok(R.departRobot('vacuum.robot'), 'deux minutes pile : encore');
  h.avancer(1);
  assert.equal(R.departRobot('vacuum.robot'), null, 'au-delà : plus rien, comme au carnet');
  // Tout le logement : un aspirateur sans pièce ; une tondeuse sans aire choisie tond ses aires allumées, que l'onglet ne sait pas.
  R.lancerRobot(s.hass, 'vacuum.robot', [], {});
  assert.deepEqual(R.departRobot('vacuum.robot'), { pieces: null, tout: true, t: T + 120001 });
  R.lancerRobot(s.hass, 'lawn_mower.tondeuse', [], {});
  assert.deepEqual(R.departRobot('lawn_mower.tondeuse'), { pieces: null, tout: false, t: T + 120001 });
  // Refusé : rien ne reste.
  const refuse = R.lancerRobot(s.hass, 'vacuum.robot', SALON, {});
  s.appels.at(-1).ko({ code: 'deja_en_route', message: 'deja en route : vacuum.robot' });
  await assert.rejects(refuse);
  assert.equal(R.departRobot('vacuum.robot'), null);
});

test('« Il bipe » : trois secondes après un `locate` accepté, dans cet onglet, ce robot seulement', () => {
  const h = horlogeFactice();
  R.reglerRobotsEtat({ hass: serveurFactice().hass, horloge: h });
  let vus = 0;
  const fin = R.ecouterBipes(() => { vus += 1; });
  assert.equal(R.bipeEnCours('vacuum.robot'), false);
  R.bipeRobot('vacuum.robot');
  assert.equal(R.bipeEnCours('vacuum.robot'), true);
  assert.equal(R.bipeEnCours('lawn_mower.tondeuse'), false, 'ce robot seulement');
  h.avancer(2999);
  assert.equal(R.bipeEnCours('vacuum.robot'), true);
  h.avancer(1);
  assert.equal(R.bipeEnCours('vacuum.robot'), false);
  assert.equal(vus, 2, 'la carte, la compacte et la popup se redessinent au début et à la fin');
  // Un second `locate` repart pour trois secondes.
  R.bipeRobot('vacuum.robot');
  h.avancer(2000);
  R.bipeRobot('vacuum.robot');
  h.avancer(2000);
  assert.equal(R.bipeEnCours('vacuum.robot'), true);
  h.avancer(1000);
  assert.equal(R.bipeEnCours('vacuum.robot'), false);
  fin();
});

/* ASSERTION MODIFIÉE (passe bis du 18/10, point 10) : ce test épinglait des chaînes de ficherobot.jsx — il ne voyait pas ce que la
 * fiche FAIT. Il la JOUE maintenant (tests/crochets.mjs), sur la vue de sa carte : un passage nouveau part par le serveur avec ses
 * pièces et leurs segments, et la vue avance aussitôt ; un refus fait retomber l'avance, son code au toast ; sans serveur, la commande
 * de l'intégration part en direct ; au retour, la puce principale est « Reprendre », qui reprend en direct (`vacuum.start`). */
test('la fiche d’un robot lance un passage nouveau par le serveur, et en direct sans lui', async () => {
  const { setLoggiaState } = await import('../src/state.js');
  const F = await import(new URL('../src/App.jsx?robotsetat_fiche', import.meta.url).href);
  const FR = await import(new URL('../src/ficherobot.jsx', import.meta.url).href);
  const ASP = 'vacuum.aspirateur';
  const st = (state) => ({ entity_id: ASP, state, last_changed: new Date(T - 600000).toISOString(), last_updated: new Date(T - 600000).toISOString(),
    attributes: { friendly_name: 'Aspirateur', battery_level: 92, supported_features: 8828, rooms: { salon: 1, cuisine: 2 } } });
  const h = horlogeFausse(), d = documentFaux();
  const vraiNow = Date.now;
  h.installer(); d.installer();
  globalThis.document.documentElement = { classList: { contains: () => false } };
  Date.now = () => T;
  const attendreFiche = () => new Promise(r => setImmediate(r));
  const jouer = async ({ etat = 'docked', reponse = 'attend' } = {}) => {
    setLoggiaState({ index: { entityMeta: new Map([[ASP, { deviceId: 'd1', device: 'Aspirateur', platform: 'ecovacs' }]]), deviceMeta: new Map(), areaList: [], areaNameOf: () => null, services: null }, ent: {}, cfg: {}, resolved: {} });
    const appels = [], ws = [], rejets = [];
    const serveur = { callWS: (msg) => {
      if (msg.type === 'loggia/robots/etat') return Promise.resolve({ config: { plannings: [], robots: {} }, passages: [], en_cours: {}, erreurs: {}, journal: [], meteo: null });
      ws.push(msg);
      return reponse === 'muet' ? Promise.reject({ code: 'unknown_command', message: 'Unknown command.' }) : reponse === 'refus' ? Promise.reject({ code: 'deja_en_route', message: 'deja en route : ' + ASP }) : new Promise(() => {});
    } };
    R.reglerRobotsEtat({ hass: serveur, signaler: (e) => rejets.push(e) });
    const hass = () => ({ ...serveur, states: { [ASP]: st(etat) }, callApi: () => Promise.resolve([]),
      callService: (dd, s, data) => { appels.push(dd + '.' + s + (data && data.command ? ' ' + data.command : '')); return Promise.resolve(); } });
    const vue = monter((p) => F.useVueRobot(p.hass, p.id, null, true, { rapide: true }), { hass: hass(), id: ASP });
    await attendreFiche();
    vue.rendre();
    const m = monter(FR.default, { hass: hass(), idRobot: ASP, domaine: 'vacuum', vue: vue.arbre, plaque: null, sousNom: null, epingle: null, onFiche: () => {} });
    const accueil = () => m.trouver(e => e.type && e.type.name === 'OngletAccueil')[0].props;
    const relire = () => { vue.rendre(); m.proprietes({ vue: vue.arbre, hass: hass() }); };
    return { appels, ws, rejets, vue, m, accueil, relire };
  };
  try {
    // Deux pièces choisies : le départ part au serveur, avec leurs segments ; la vue avance aussitôt.
    const j = await jouer();
    j.accueil().basculerZone(j.accueil().zones[0]); j.m.rendre();
    j.accueil().basculerZone(j.accueil().zones[1]); j.m.rendre();
    j.accueil().principale.agir();
    assert.deepEqual(j.ws.map(x => [x.type, x.robot, x.zones]), [['loggia/robots/lancer', ASP, [{ id: 'seg:1', nom: 'Salon', segments: [1] }, { id: 'seg:2', nom: 'Cuisine', segments: [2] }]]]);
    j.relire();
    assert.equal(j.vue.arbre.phase, 'travail', 'le geste d’abord');
    assert.deepEqual(j.appels, [], 'le serveur envoie la commande : rien ne part d’ici');
    // Refusé : l'avance retombe, et le refus va au toast, son code avec.
    const k = await jouer({ reponse: 'refus' });
    k.accueil().principale.agir();
    for (let i = 0; i < 50 && !k.rejets.length; i++) await attendreFiche();
    k.relire();
    assert.deepEqual([k.vue.arbre.phase, k.rejets.map(e => e.code)], ['base', ['deja_en_route']]);
    // Sans serveur (un composant d'avant ce chantier) : la commande de l'intégration, en direct.
    /* ASSERTION MODIFIÉE (tranche robots 2, 19/10 ; R1, Q2 A) : ce robot n'a pas le bit CLEAN_AREA — sur un Home Assistant récent,
     * l'intégration refuse `spot_area` ; comme il publie ses pièces, c'est l'exception nommée de ses scripts (`clean_V2`) qui part. */
    const l = await jouer({ reponse: 'muet' });
    l.accueil().basculerZone(l.accueil().zones[0]); l.m.rendre();
    l.accueil().principale.agir();
    for (let i = 0; i < 50 && !l.appels.length; i++) await attendreFiche();
    assert.deepEqual(l.appels, ['vacuum.send_command clean_V2']);
    // Au retour, « Reprendre » reprend en direct.
    const r = await jouer({ etat: 'returning' });
    assert.equal(r.accueil().principale.mot, 'Reprendre');
    r.accueil().principale.agir();
    assert.deepEqual([r.appels, r.ws.length], [['vacuum.start'], 0]);
  } finally {
    Date.now = vraiNow; h.restaurer(); d.restaurer();
    setLoggiaState({ index: null, ent: {}, cfg: {}, resolved: null });
  }
});

/* TEST AJOUTÉ (passe bis du 18/10, point A ; sa réponse « Par le serveur ») : un script maison de l'aspirateur part par
 * `loggia/robots/lancer` (`script`). Un script qui lance un passage se note pour la carte de cet onglet avec son nom (`libelle`) ;
 * un script de geste (la pause) ne note rien ; sans serveur, il part en direct ; un script refusé dit sa phrase. */
/* ASSERTION MODIFIÉE (passe bis 2 du 18/10, points J et L) : le script part avec le RÔLE que l'écran lui demande (`role`) — c'est lui,
 * et non sa place dans une liste, qui dit au serveur s'il lance un passage ; l'exemple d'avant était un script de SON
 * installation : « Nettoyer la buanderie », qu'il n'a pas. */
test('un script maison part par le serveur ; son nom dit le passage ; sans serveur, en direct', async () => {
  const s = serveurFactice(), h = horlogeFactice();
  R.reglerRobotsEtat({ hass: s.hass, horloge: h });
  R.lancerRobot(s.hass, 'vacuum.robot', [], { script: 'script.nettoyer_buanderie', role: 'nettoyer_tout', libelle: 'Nettoyer la buanderie' });
  assert.deepEqual(s.appels.at(-1).msg, { type: 'loggia/robots/lancer', robot: 'vacuum.robot', zones: [], script: 'script.nettoyer_buanderie', role: 'nettoyer_tout' });
  assert.deepEqual(R.departRobot('vacuum.robot'), { pieces: null, tout: false, libelle: 'Nettoyer la buanderie', t: T }, 'son nom, pas « tout le logement »');
  assert.equal(R.vueCarnetRobot({ ...ETAT, en_cours: {} }, 'vacuum.robot', T, R.departRobot('vacuum.robot')).libelle, 'Nettoyer la buanderie');
  assert.equal(R.vueCarnetRobot({ ...ETAT, en_cours: { 'vacuum.robot': { ...ETAT.en_cours['vacuum.robot'], zones: [], libelle: 'Nettoyer la buanderie' } } }, 'vacuum.robot', T).libelle, 'Nettoyer la buanderie', 'au carnet');
  // Un script de geste : il part au serveur, sans rien noter.
  R.reglerRobotsEtat({ hass: s.hass, horloge: h });
  R.lancerRobot(s.hass, 'vacuum.robot', [], { script: 'script.pause_douce', role: 'pause', depart: false });
  assert.deepEqual([s.appels.at(-1).msg.script, s.appels.at(-1).msg.role], ['script.pause_douce', 'pause']);
  assert.equal(R.departRobot('vacuum.robot'), null, 'un geste n’est pas un départ');
  // Sans serveur, en direct ; refusé, sa phrase.
  let direct = 0;
  const p = R.lancerRobot(s.hass, 'vacuum.robot', [], { script: 'script.x', direct: () => { direct += 1; } });
  s.appels.at(-1).ko({ code: 'unknown_command', message: 'x' });
  await p;
  assert.equal(direct, 1);
  const refus = { code: 'script_inconnu', message: 'script inconnu de ce robot : vacuum.robot' };
  const q = R.lancerRobot(s.hass, 'vacuum.robot', [], { script: 'script.x' });
  s.appels.at(-1).ko(refus);
  await assert.rejects(q, (e) => e.code === 'script_inconnu');
  assert.equal(texteRefus(refus), 'Script non lancé — ce n’est pas un script de ce robot');
});

/* TEST AJOUTÉ (passe bis du 18/10, point 1) : deux appuis rapprochés sur « Pause » relançaient le robot — la puce basculait sur
 * l'avance du geste, propre à chaque carte, et le second appui envoyait `start`. Le geste en vol vit dans UN magasin, par robot,
 * pour la carte, la compacte et la popup : il est en vol tant que Home Assistant ne l'a pas confirmé (la phase réelle est encore
 * celle d'avant lui), et au moins 1,5 s quoi qu'il arrive ; son filet passé, il s'en va et la carte redit ce que la maison dit.
 * ASSERTION MODIFIÉE (passe bis 2 du 18/10, points N, G, F et E) : le magasin des gestes passe par la variante PARTAGÉE d'optimiste.js
 * — la règle de la maison tient à la lettre. Un geste confirmé (la phase réelle a quitté celle d'avant lui, ou son `last_changed` a
 * avancé) l'est POUR DE BON : la maison revenue à la phase d'avant ne le réarme pas — il se réarmait (S1). Un refus n'oublie que SON
 * geste, par son jeton : un refus tardif faisait tomber le geste suivant (S3). Un départ par le serveur GARDE son geste tant que la
 * réponse n'est pas venue, borné : il retombait à 7 s, et un second départ partait (S4). On écoute les gestes d'un robot. */
test('le geste en cours d’un robot : posé, tenu, confirmé pour de bon, expiré, oublié par son jeton, gardé — un magasin pour tout l’écran', () => {
  const h = horlogeFactice();
  R.reglerRobotsEtat({ hass: serveurFactice().hass, horloge: h });
  let vus = 0;
  const fin = R.ecouterGestes('vacuum.robot', () => { vus += 1; });
  assert.equal(R.gesteEnVol('vacuum.robot', 'travail'), null);
  R.poserGeste('vacuum.robot', { cle: 'pause', phase: 'pause', depuis: 'travail' }, 7000);
  const g = R.gesteEnVol('vacuum.robot', 'travail');
  assert.deepEqual([g.cle, g.phase, g.depuis, g.t], ['pause', 'pause', 'travail', T]);
  assert.equal(R.gesteEnVol('lawn_mower.tondeuse', 'travail'), null, 'ce robot seulement');
  h.avancer(1500);
  assert.ok(R.gesteEnVol('vacuum.robot', 'travail'), 'pas encore confirmé : il tient');
  h.avancer(5499);
  assert.ok(R.gesteEnVol('vacuum.robot', 'travail'));
  h.avancer(1);
  assert.equal(R.gesteEnVol('vacuum.robot', 'travail'), null, 'le filet passé, la carte redit ce que la maison dit');
  assert.equal(vus, 2, 'posé, parti : la carte, la compacte et la popup se redessinent ensemble');
  assert.deepEqual(R.lireGestes(), {});
  // Confirmé tout de suite : tenu 1,5 s quand même, puis confirmé POUR DE BON.
  R.poserGeste('vacuum.robot', { cle: 'pause', phase: 'pause', depuis: 'travail' }, 7000);
  assert.ok(R.gesteEnVol('vacuum.robot', 'pause'), 'Home Assistant répond tout de suite : le geste reste tenu 1,5 s, un second appui ne relance rien');
  h.avancer(1500);
  assert.equal(R.gesteEnVol('vacuum.robot', 'pause'), null, 'confirmé, passé 1,5 s : la puce peut dire « Reprendre »');
  assert.equal(R.gesteEnVol('vacuum.robot', 'travail'), null, 'un autre écran le relance : la maison fait foi, le geste ne se réarme pas (S1)');
  // Confirmé aussi par son `last_changed`, qui avance — un relevé plus vieux ne compte pas.
  R.poserGeste('vacuum.robot', { cle: 'pause', phase: 'pause', depuis: 'travail', change: '2026-10-17T16:40:00.000Z' }, 7000);
  h.avancer(1500);
  assert.ok(R.gesteEnVol('vacuum.robot', 'travail', '2026-10-17T16:40:00.000Z'));
  assert.ok(R.gesteEnVol('vacuum.robot', 'base', '2026-10-17T16:30:00.000Z'), 'un relevé d’avant l’appui ne répond pas');
  assert.equal(R.gesteEnVol('vacuum.robot', 'travail', '2026-10-17T16:40:05.000Z'), null, 'son `last_changed` a avancé : confirmé');
  // Un refus n'oublie que SON geste (S3) ; un geste neuf remplace l'ancien.
  const depart = R.poserGeste('vacuum.robot', { cle: 'demarrer', phase: 'travail', depuis: 'base', mot: 'Nettoyer 2 pièces' }, 7000);
  assert.equal(R.gesteEnVol('vacuum.robot', 'base').mot, 'Nettoyer 2 pièces', 'le mot que la puce portait');
  const pause = R.poserGeste('vacuum.robot', { cle: 'pause', phase: 'pause', depuis: 'travail' }, 7000);
  R.oublierGeste('vacuum.robot', depart);
  assert.equal(R.gesteEnVol('vacuum.robot', 'travail').cle, 'pause', 'le refus tardif du départ laisse la pause');
  R.oublierGeste('vacuum.robot', pause);
  assert.equal(R.gesteEnVol('vacuum.robot', 'travail'), null, 'son propre refus la fait retomber aussitôt');
  // Un départ par le serveur : gardé au-delà du filet tant que la réponse n'est pas venue (S4) ; relâché, son filet.
  const garde = R.poserGeste('vacuum.robot', { cle: 'demarrer', phase: 'travail', depuis: 'base' }, 7000, { garde: R.GARDE_DEPART_MS });
  h.avancer(7100);
  assert.ok(R.gesteEnVol('vacuum.robot', 'base'), 'le serveur n’a pas répondu : la puce reste « Démarrer », en cours');
  R.relacherGeste('vacuum.robot', garde);
  h.avancer(6999);
  assert.ok(R.gesteEnVol('vacuum.robot', 'base'));
  h.avancer(1);
  assert.equal(R.gesteEnVol('vacuum.robot', 'base'), null, 'relâché : le filet, compté depuis la réponse');
  assert.equal(R.GARDE_DEPART_MS, 30000, 'au-delà des 20 s que le serveur attend son intégration (ATTENTE_DEPART_S)');
  assert.equal(h.minuteurs.size, 0, 'ses minuteurs partent avec lui');
  fin();
});

/* TEST AJOUTÉ (passe bis 2 du 18/10, point E) : un départ par le serveur RELÂCHE son geste quand `loggia/robots/lancer` répond — accepté
 * ou refusé —, jamais avant ; le geste d'un autre appui n'en est pas touché. */
test('point E : le geste d’un départ tient tant que le serveur n’a pas répondu, puis prend son filet', async () => {
  const s = serveurFactice(), h = horlogeFactice();
  R.reglerRobotsEtat({ hass: s.hass, horloge: h });
  const geste = R.poserGeste('vacuum.robot', { cle: 'demarrer', phase: 'travail', depuis: 'base' }, 7000, { garde: R.GARDE_DEPART_MS });
  const p = R.lancerRobot(s.hass, 'vacuum.robot', [], { geste });
  h.avancer(12000);
  assert.ok(R.gesteEnVol('vacuum.robot', 'base'), 'douze secondes sans réponse : il tient');
  s.appels.find(a => a.msg.type === 'loggia/robots/lancer').ok({ ...ETAT, en_cours: {} });
  await p;
  h.avancer(6999);
  assert.ok(R.gesteEnVol('vacuum.robot', 'base'), 'la réponse venue : son filet commence');
  h.avancer(1);
  assert.equal(R.gesteEnVol('vacuum.robot', 'base'), null);
  // Refusé : le geste du départ tombe, par son jeton.
  const g2 = R.poserGeste('vacuum.robot', { cle: 'demarrer', phase: 'travail', depuis: 'base' }, 7000, { garde: R.GARDE_DEPART_MS });
  const q = R.lancerRobot(s.hass, 'vacuum.robot', [], { geste: g2 });
  s.appels.at(-1).ko({ code: 'deja_en_route', message: 'deja en route : vacuum.robot' });
  await assert.rejects(q);
  h.avancer(7000);
  assert.equal(R.gesteEnVol('vacuum.robot', 'base'), null);
});

test('robotsetat.js reste au démarrage sans ses refus, sans identifiant d’entité en dur, sans `toggle`', () => {
  const src = readFileSync(new URL('../src/robotsetat.js', import.meta.url), 'utf8');
  assert.ok(!src.includes("from './refusrobots.js'"), 'les refus d’un départ se chargent au premier refus, pas au démarrage');
  assert.ok(!/['"](vacuum|lawn_mower|sensor|switch|button)\.[a-z0-9_]+['"]/.test(src), 'un entity_id en dur');
  assert.ok(!/toggle/.test(src), 'un robot se commande par un service explicite');
});
