/* TEST AJOUTÉ (chantier IoT, tâche 8, 18/10 ; sa maquette « Cartes IoT », 1b ; I15, I16, I2 A, I4 A, I17) — la fiche d'un robot :
 * le socle commun, l'Accueil « Où, puis go », la carte du logement dans une seconde feuille, la roue des réglages.
 *
 * Ces tests JOUENT la fiche (tests/crochets.mjs) : elle reçoit la VUE de la carte (`useVueRobot`, exportée d'App.jsx sous
 * `?fiche_robot`), comme dans l'application ; ses morceaux (l'Accueil, une puce, la seconde feuille) se lisent à leurs props, et se
 * montent à leur tour. Le serveur est doublé ; l'heure est celle de la maquette, samedi 17/10/2026, 18:20. Ce qui est garanti :
 *  - I15 : l'en-tête commun — la plaque, le nom, « Salon · robot aspirateur », l'épingle, la roue (I4 A) ; les onglets Accueil ·
 *    Planning (le composant répond) · Historique · Entretien (une pièce d'usure), leurs glyphes ; plus d'onglet Carte ;
 *  - I16 : le mot d'état et sa phrase ; « Où » — « Tout le logement » choisie tant qu'aucune pièce ne l'est, une puce par pièce,
 *    son point de couleur —, seulement si Loggia sait commander des pièces ; « Nettoyer 2 pièces » part par le serveur avec ses
 *    pièces ; au travail, les puces montrent ce qui se nettoie, inertes, et « Mettre en pause » ; la tondeuse : « Tondre tout le
 *    jardin » vise toutes ses aires, et sans serveur le départ allume les choisies et éteint les autres ; les tuiles, l'alerte ;
 *  - I2 A : « Voir la carte » ouvre le plan dans une seconde feuille, montée après le contenu, où l'on choisit comme dans « Où » ;
 *  - muet : le liseré sur le panneau de tête, un seul signal, rien à toucher ;
 *  - I17 : les pièces nouvelles prennent les jetons du thème. */
process.env.TZ = 'Europe/Paris';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';

import { monter, horlogeFausse, documentFaux, texteDe, parcourir } from './crochets.mjs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);
register('data:text/javascript,' + encodeURIComponent([
  'export async function load(url, ctx, next) {',
  "  if (!url.endsWith('/src/App.jsx?fiche_robot')) return next(url, ctx);",
  "  const r = await next(url.slice(0, -'?fiche_robot'.length), ctx);",
  "  return { ...r, source: String(r.source) + ';export { useVueRobot };' };",
  '}',
].join('\n')));
const { setLoggiaState, vacRooms } = await import('../src/state.js');
const F = await import(new URL('../src/App.jsx?fiche_robot', import.meta.url).href);
const FR = await import(new URL('../src/ficherobot.jsx', import.meta.url).href);
const RE = await import('../src/robotsetat.js');

const T = new Date(2026, 9, 17, 18, 20).getTime();
const S = T / 1000;
const ASP = 'vacuum.aspirateur', TOND = 'lawn_mower.tondeuse', CARTE = 'image.aspirateur_carte', FILTRE = 'sensor.aspirateur_filtre';
const AVANT = 'switch.tondeuse_zone_avant', ARRIERE = 'switch.tondeuse_zone_arriere';
const st = (id, state, attributes = {}, depuis = new Date(2026, 9, 17, 16, 40).toISOString()) => ({ entity_id: id, state, last_changed: depuis, last_updated: depuis, attributes });
function maison() {
  return {
    [ASP]: st(ASP, 'docked', { friendly_name: 'Aspirateur', battery_level: 92, supported_features: 8828, fan_speed: 'normal', fan_speed_list: ['quiet', 'normal', 'max'],
      rooms: { salon: 1, cuisine: 2, bureau: 3 } }),
    [CARTE]: st(CARTE, '2026-10-17T16:00:00+00:00', { friendly_name: 'Aspirateur Carte' }),
    [FILTRE]: st(FILTRE, '32', { friendly_name: 'Aspirateur Filtre', unit_of_measurement: '%' }),
    [TOND]: st(TOND, 'docked', { friendly_name: 'Tondeuse', battery_level: 64, supported_features: 7 }),
    [AVANT]: st(AVANT, 'off', { friendly_name: 'Tondeuse Zone Pelouse avant' }),
    [ARRIERE]: st(ARRIERE, 'on', { friendly_name: 'Tondeuse Zone Pelouse arrière' }),
  };
}
const META = new Map([
  [ASP, { deviceId: 'd1', device: 'Aspirateur', platform: 'ecovacs' }],
  [CARTE, { deviceId: 'd1', device: 'Aspirateur', platform: 'ecovacs' }],
  [FILTRE, { deviceId: 'd1', device: 'Aspirateur', platform: 'ecovacs', translationKey: 'lifespan_filter' }],
  [TOND, { deviceId: 'd2', device: 'Tondeuse', platform: 'mammotion' }],
  [AVANT, { deviceId: 'd2', device: 'Tondeuse', platform: 'mammotion', translationKey: 'area' }],
  [ARRIERE, { deviceId: 'd2', device: 'Tondeuse', platform: 'mammotion', translationKey: 'area' }],
]);
const ETAT = () => ({
  maintenant: S, meteo: null, journal: [], erreurs: {}, en_cours: {},
  passages: [
    { robot: ASP, debut: S - 86400, fin: S - 86400 + 3060, duree_min: 51, issue: 'termine', zones: [], tout: true, source: 'loggia', surface: 68, motif: null },
    { robot: ASP, debut: S - 3 * 86400, fin: S - 3 * 86400 + 2700, duree_min: 45, issue: 'interrompu', zones: [], tout: true, source: 'appareil', surface: 61, motif: 'Bloqué sous le canapé' },
    { robot: ASP, debut: S - 9 * 86400, fin: S - 9 * 86400 + 3000, duree_min: 50, issue: 'termine', zones: [], tout: true, source: 'loggia', surface: 70, motif: null },
  ],
  config: { plannings: [{ id: 'semaine', robot: ASP, heure: '09:30', jours: [0, 1, 2, 3, 4], zones: [], actif: true },
    { id: 'nuit', robot: ASP, heure: '23:00', jours: [5, 6], zones: [], actif: true }],
  robots: { [ASP]: { calme: { actif: true, debut: '22:00', fin: '07:00' }, pluie: { actif: false } } } },
});
const SALON_CUISINE = [{ id: 'seg:1', nom: 'Salon' }, { id: 'seg:2', nom: 'Cuisine' }];
/* La maison doublée, le serveur de Loggia doublé : `etat` rend ce que le test pose (`muet` : un composant d'avant ce chantier),
 * `lancer` attend la réponse du test. Le canal du toast se lit dans `rejets`. */
/* ASSERTION MODIFIÉE (tranche robots 2, 19/10) : la maison doublée dit sa version de Home Assistant (`hass.config.version`, celle de
 * la démo), note les DONNÉES de chaque service (`donnees` : la commande d'un départ direct se lit), et joue un compte ordinaire
 * (`ordinaire`) — ce qu'un administrateur lit sous « Où » n'est pas ce qu'un compte ordinaire lit. */
function poser({ retouche = null, etat = ETAT(), muet = false, ordinaire = false } = {}) {
  const courants = maison();
  if (retouche) retouche(courants);
  setLoggiaState({ index: { entityMeta: META, deviceMeta: new Map(), areaList: [{ name: 'Salon', entities: [ASP] }], areaNameOf: () => 'Salon', services: null }, ent: {}, cfg: {}, resolved: {} });
  const appels = [], ws = [], rejets = [];
  const serveur = {
    callWS: (msg) => {
      if (msg.type === 'loggia/robots/etat') { ws.push(msg); return muet ? Promise.reject({ code: 'unknown_command', message: 'Unknown command.' }) : Promise.resolve(JSON.parse(JSON.stringify(etat))); }
      return new Promise((ok, ko) => ws.push({ ...msg, ok, ko }));
    },
  };
  RE.reglerRobotsEtat({ hass: serveur, signaler: (e) => rejets.push(e) });
  /* ASSERTION MODIFIÉE (passe bis du 18/10, point 2) : la maison doublée répond au tour suivant, comme Home Assistant, et note ce qui
   * était FINI quand la tondeuse est partie (`attendus`) : sans serveur, chaque bascule d'aire doit finir avant `start_mowing`. */
  const faits = [], attendus = [], donnees = [];
  const hass = () => ({ ...serveur, states: Object.fromEntries(Object.entries(courants).map(([k, v]) => [k, { ...v, attributes: { ...v.attributes } }])),
    config: { version: '2026.10.1' }, user: { id: 'u1', is_admin: !ordinaire },
    callApi: () => Promise.resolve([]),
    callService: (d, s, data, cible) => {
      const ids = (cible && cible.entity_id) || (data && data.entity_id);
      appels.push(d + '.' + s + ' ' + [].concat(ids).join(','));
      donnees.push({ domaine: d, service: s, data: JSON.parse(JSON.stringify(data || {})) });
      if (d === 'lawn_mower' && s === 'start_mowing') attendus.push(...faits);
      return new Promise(r => setImmediate(() => { faits.push(d + '.' + s); r(); }));
    } });
  return { appels, ws, rejets, courants, hass, attendus, donnees };
}
async function dans(fn) {
  const h = horlogeFausse(), d = documentFaux();
  const vraiNow = Date.now;
  h.installer(); d.installer();
  globalThis.document.documentElement = { classList: { contains: () => false } };
  Date.now = () => T;
  try { return await fn({ h, d }); } finally { Date.now = vraiNow; h.restaurer(); d.restaurer(); setLoggiaState({ index: null, ent: {}, cfg: {}, resolved: null }); }
}
const attendre = () => new Promise(r => setImmediate(r));
const jusqua = async (f, n = 500) => { for (let i = 0; i < n && !f(); i++) await attendre(); };
const de = (m, nom) => m.trouver(e => e.type && e.type.name === nom)[0];
/* La fiche, sur la vue de sa carte : la vue est montée d'abord (sa valeur est ce que rend le crochet), puis la fiche la reçoit — et
 * on la redonne à chaque rendu, comme le fait la coquille. */
async function fiche(w, id = ASP) {
  const domaine = id.split('.')[0];
  const vue = monter((p) => F.useVueRobot(p.hass, p.id, null, true, { rapide: true }), { hass: w.hass(), id });
  await attendre();
  vue.rendre();
  const m = monter(FR.default, { hass: w.hass(), idRobot: id, domaine, vue: vue.arbre, plaque: { fond: 'var(--o-s1)', encre: 'var(--o-text1)', icone: 'robot' },
    sousNom: 'Salon · ' + (domaine === 'lawn_mower' ? 'robot tondeuse' : 'robot aspirateur'), epingle: null, onFiche: () => {} });
  const relire = () => { vue.rendre(); m.proprietes({ vue: vue.arbre, hass: w.hass() }); };
  return { m, vue, relire, accueil: () => de(m, 'OngletAccueil') };
}

test('I15 : le socle commun — la plaque, « Salon · robot aspirateur », l’épingle, la roue, les onglets de sa maquette ; plus d’onglet Carte', () => dans(async () => {
  const w = poser();
  const { m } = await fiche(w);
  const e = de(m, 'EnteteFiche');
  assert.deepEqual([e.props.nom, e.props.sousNom, e.props.reglages, e.props.enReglages], ['Aspirateur', 'Salon · robot aspirateur', true, false], 'la roue reste (I4 A)');
  const o = de(m, 'FicheOnglets');
  assert.deepEqual(o.props.onglets.map(x => [x[0], x[2]]), [['accueil', 'home'], ['planning', 'calendar-clock'], ['historique', 'time-past'], ['entretien', 'wrench-simple']]);
  assert.deepEqual(o.props.onglets.map(x => x[1]), ['Accueil', 'Planning', 'Historique', 'Entretien']);
  assert.equal(de(m, 'CroixFeuille'), undefined, 'UNE croix, celle de l’en-tête commun');
  // Le composant d'avant ce chantier ne répond pas : pas de Planning.
  const w2 = poser({ muet: true });
  const { m: m2 } = await fiche(w2);
  assert.deepEqual(de(m2, 'FicheOnglets').props.onglets.map(x => x[0]), ['accueil', 'historique', 'entretien']);
}));

test('I16 : sur la base — le mot et sa phrase, la batterie ; « Où » et ses puces ; « Nettoyer 2 pièces » part par le serveur avec ses pièces', () => dans(async () => {
  const w = poser();
  const { m, accueil, relire } = await fiche(w);
  let a = accueil().props;
  assert.deepEqual([a.etat.mot, a.etat.phrase, a.choisir, a.toutChoisi], ['Sur la base', 'Choisissez où, ou lancez tout.', true, true]);
  assert.deepEqual(a.zones.map(z => [z.id, z.nom, z.choisie, !!z.couleur]), [['seg:1', 'Salon', false, true], ['seg:2', 'Cuisine', false, true], ['seg:3', 'Bureau', false, true]], 'une puce par pièce, son point de couleur');
  assert.deepEqual([a.principale.mot, a.seconde.mot], ['Nettoyer tout le logement', 'Localiser']);
  // Ce que l'Accueil dessine : « Où », les puces, la batterie.
  const ma = monter(accueil().type, accueil().props);
  assert.ok(ma.texte().includes('Où') && ma.texte().includes('92%') && ma.texte().includes('Batterie'), ma.texte());
  assert.deepEqual(ma.trouver(e => e.type && e.type.name === 'PuceOu').map(p => [texteDe(p), p.props.on]), [['Tout le logement', true], ['Salon', false], ['Cuisine', false], ['Bureau', false]]);
  // Deux pièces choisies : la puce le dit, et le départ les emporte.
  a.basculerZone(a.zones[0]); m.rendre();
  accueil().props.basculerZone(accueil().props.zones[1]); m.rendre();
  a = accueil().props;
  assert.deepEqual([a.principale.mot, a.toutChoisi, a.zones.filter(z => z.choisie).map(z => z.nom)], ['Nettoyer 2 pièces', false, ['Salon', 'Cuisine']]);
  a.principale.agir();
  const lancer = w.ws.find(x => x.type === 'loggia/robots/lancer');
  assert.deepEqual([lancer.robot, lancer.zones], [ASP, [{ id: 'seg:1', nom: 'Salon', segments: [1] }, { id: 'seg:2', nom: 'Cuisine', segments: [2] }]], 'par le serveur, qui les note au carnet');
  relire();
  assert.equal(accueil().props.etat.mot, 'Nettoyage en cours', 'le geste d’abord');
  assert.equal(accueil().props.etat.phrase, 'Salon, Cuisine · depuis 16:40', 'les pièces que cet onglet vient de lancer');
  assert.deepEqual(w.appels, [], 'rien ne part en direct');
}));

test('I16 : au travail — les puces montrent ce qui se nettoie, inertes ; « Mettre en pause », et la phrase du passage', () => dans(async () => {
  const etat = ETAT();
  etat.en_cours[ASP] = { debut: new Date(2026, 9, 17, 16, 40).getTime() / 1000, phase: 'travail', duree_min: 100, zones: SALON_CUISINE, tout: false, source: 'loggia', surface: 42 };
  const w = poser({ retouche: (c) => { c[ASP].state = 'cleaning'; }, etat });
  const { accueil } = await fiche(w);
  const a = accueil().props;
  assert.deepEqual([a.etat.mot, a.etat.phrase, a.etat.encre], ['Nettoyage en cours', 'Salon, Cuisine · 42 m² depuis 16:40', 'var(--o-accent-soft)']);
  assert.deepEqual([a.enRoute, a.toutChoisi, a.zones.filter(z => z.choisie).map(z => z.nom)], [true, false, ['Salon', 'Cuisine']], 'ce qui se nettoie');
  const ma = monter(accueil().type, accueil().props);
  assert.ok(ma.trouver(e => e.type && e.type.name === 'PuceOu').every(p => p.props.inerte), 'les puces ne se touchent plus');
  assert.deepEqual([a.principale.mot, a.seconde.mot], ['Mettre en pause', 'Base']);
  a.principale.agir();
  assert.deepEqual(w.appels, ['vacuum.pause ' + ASP]);
}));

/* ASSERTION MODIFIÉE (passe bis du 18/10, point 2 ; et point 10 pour la dernière) : une seule règle pour « où ». Jamais Loggia ne
 * rallume une aire que la personne n'a pas touchée : les puces partent PRÉ-SÉLECTIONNÉES selon les aires allumées (« Pelouse
 * arrière » l'est) — elles partaient vides, et « Tondre tout le jardin » rallumait toutes les aires ; « Tout le jardin » choisit
 * toutes les aires visibles, explicitement ; aucune aire choisie : la puce principale ne s'offre pas. Partir avec une sélection
 * allume les choisies et éteint les autres — un geste explicite —, et sans serveur, chaque bascule finie AVANT `start_mowing`.
 * L'assertion `m.rendus > 0`, qui ne vérifiait rien, devient celle des bascules attendues l'une après l'autre. */
test('I16 : la tondeuse — « Où » part des aires allumées ; « Tout le jardin » les choisit toutes ; aucune : pas de départ ; sans serveur, les bascules avant de tondre', () => dans(async () => {
  const w = poser();
  const { m, accueil } = await fiche(w, TOND);
  let a = accueil().props;
  assert.deepEqual(a.zones.map(z => [z.nom, z.choisie]), [['Pelouse arrière', true], ['Pelouse avant', false]], 'pré-choisies : les aires allumées');
  assert.deepEqual([a.toutChoisi, a.principale.mot, a.seconde], [false, 'Tondre 1 zone', null], 'pas de « Localiser » pour une tondeuse');
  a.toutPrendre(); m.rendre();
  a = accueil().props;
  assert.deepEqual([a.zones.map(z => z.choisie), a.toutChoisi, a.principale.mot], [[true, true], true, 'Tondre tout le jardin'], '« Tout le jardin » : toutes les aires visibles');
  a.basculerZone(a.zones[0]); m.rendre();
  a.basculerZone(accueil().props.zones[1]); m.rendre();
  a = accueil().props;
  assert.deepEqual([a.zones.filter(z => z.choisie).length, a.principale], [0, null], 'aucune aire choisie : la puce principale ne s’offre pas');
  a.toutPrendre(); m.rendre();
  accueil().props.principale.agir();
  assert.deepEqual(w.ws.find(x => x.type === 'loggia/robots/lancer').zones.map(z => z.id), [ARRIERE, AVANT], 'tout le jardin : toutes ses aires, nommées');
  assert.deepEqual(w.appels, [], 'rien n’est basculé d’ici : le serveur le fait');
  // Sans serveur : « Pelouse avant » seule — elle s'allume, l'autre s'éteint, PUIS la tondeuse part.
  const w2 = poser({ muet: true });
  const { m: m2, accueil: accueil2 } = await fiche(w2, TOND);
  accueil2().props.basculerZone(accueil2().props.zones.find(z => z.nom === 'Pelouse arrière')); m2.rendre();
  accueil2().props.basculerZone(accueil2().props.zones.find(z => z.nom === 'Pelouse avant')); m2.rendre();
  a = accueil2().props;
  assert.equal(a.principale.mot, 'Tondre 1 zone');
  a.principale.agir();
  w2.ws.find(x => x.type === 'loggia/robots/lancer').ko({ code: 'unknown_command', message: 'Unknown command.' });
  await jusqua(() => w2.appels.length >= 3);
  assert.deepEqual(w2.appels, ['switch.turn_on ' + AVANT, 'switch.turn_off ' + ARRIERE, 'lawn_mower.start_mowing ' + TOND], 'en direct, comme le planning');
  assert.deepEqual(w2.attendus, ['switch.turn_on', 'switch.turn_off'], 'chaque bascule finie avant la suivante, et avant de tondre');
}));

/* TEST AJOUTÉ (passe bis du 18/10, point 1) : la popup lit le MÊME geste en vol que la carte (robotsetat.js). Deux appuis sur « Mettre
 * en pause » n'envoient qu'une pause ; la puce principale reste « Mettre en pause », en cours, et ne devient « Reprendre » qu'une fois
 * Home Assistant confirmé ; deux appuis sur « Nettoyer 2 pièces » ne font qu'un départ. */
test('point 1 : deux appuis dans la popup — une seule pause, un seul départ ; la puce reste sur son geste', () => dans(async ({ h }) => {
  const w = poser({ retouche: (c) => { c[ASP].state = 'cleaning'; } });
  const { m, vue, accueil } = await fiche(w);
  // La maison a bougé : la vue de la carte relit son `hass`, la fiche la reçoit.
  const relire = () => { vue.proprietes({ hass: w.hass() }); m.proprietes({ vue: vue.arbre, hass: w.hass() }); };
  const pause = accueil().props.principale;
  assert.equal(pause.mot, 'Mettre en pause');
  pause.agir();
  pause.agir(); // le second appui, avant que l'écran ne se redessine
  relire();
  assert.deepEqual(w.appels, ['vacuum.pause ' + ASP], 'une seule pause, jamais `start` après elle');
  let a = accueil().props;
  assert.deepEqual([a.principale.mot, a.principale.enVol, a.principale.agir, a.etat.mot], ['Mettre en pause', true, null, 'En pause'], 'en cours : la puce garde son mot et ne fait rien');
  w.courants[ASP].state = 'paused';
  h.avancer(1500);
  relire();
  a = accueil().props;
  assert.deepEqual([a.principale.mot, !!a.principale.agir], ['Reprendre', true], 'Home Assistant confirmé : « Reprendre »');
  // Le départ : deux appuis, un seul `loggia/robots/lancer`.
  const w2 = poser();
  const f2 = await fiche(w2);
  f2.accueil().props.basculerZone(f2.accueil().props.zones[0]); f2.m.rendre();
  f2.accueil().props.basculerZone(f2.accueil().props.zones[1]); f2.m.rendre();
  const depart = f2.accueil().props.principale;
  assert.equal(depart.mot, 'Nettoyer 2 pièces');
  depart.agir();
  depart.agir();
  assert.equal(w2.ws.filter(x => x.type === 'loggia/robots/lancer').length, 1, 'un seul départ');
  f2.relire();
  assert.deepEqual([f2.accueil().props.principale.mot, f2.accueil().props.principale.enVol], ['Nettoyer 2 pièces', true], 'la puce garde le mot de son départ');
}));

/* TEST AJOUTÉ (passe bis du 18/10, point 6) : des pièces choisies sans segment retombaient sur « tout le logement » — Loggia ne sait
 * pas les viser, et le départ partait pour tout. Une pièce que Loggia ne sait pas viser n'est plus une puce : ni par la commande de
 * l'intégration (sans segment), ni par les interrupteurs d'un script maison (sans interrupteur). */
test('point 6 : une pièce que Loggia ne sait pas viser n’est pas une puce — jamais « tout le logement » à sa place', () => dans(async () => {
  const { LoggiaContext } = await import('../src/runtime.js');
  const avant = LoggiaContext._currentValue;
  // Un robot qui n'annonce pas ses pièces : celles de sa configuration, l'une sans segment.
  LoggiaContext._currentValue = { ...avant, userCfg: { loggia_entities: { vacuumRooms: [{ id: 'salon', name: 'Salon', segments: [1] }, { id: 'bureau', name: 'Bureau' }] } } };
  /* ASSERTION MODIFIÉE (passe bis du 20/10, point 7) : un Ecovacs qui ne publie pas `rooms` n'a plus de puce par commande — le
   * serveur refuserait (`pieces_perimees`) ; ce robot-ci est un Roborock, qui ne publie pas sa liste : la règle d'aujourd'hui. */
  const metaAvant = META.get(ASP);
  META.set(ASP, { ...metaAvant, platform: 'roborock' });
  try {
    const w = poser({ retouche: (c) => { delete c[ASP].attributes.rooms; c[ASP].attributes.supported_features = 8828 + 16384; } });
    const { m, accueil } = await fiche(w);
    assert.deepEqual(accueil().props.zones.map(z => z.nom), ['Salon'], 'Bureau, sans segment, ne s’offre pas');
    accueil().props.basculerZone(accueil().props.zones[0]); m.rendre();
    accueil().props.principale.agir();
    assert.deepEqual(w.ws.find(x => x.type === 'loggia/robots/lancer').zones, [{ id: 'salon', nom: 'Salon', segments: [1] }], 'la pièce qu’il sait viser, seule');
    // Le même, Ecovacs, sans `rooms` publié : aucune puce — rien d'inerte (point 7).
    META.set(ASP, metaAvant);
    const w2 = poser({ retouche: (c) => { delete c[ASP].attributes.rooms; c[ASP].attributes.supported_features = 8828 + 16384; } });
    const { accueil: accueil2 } = await fiche(w2);
    assert.deepEqual([accueil2().props.choisir, accueil2().props.zones], [false, []]);
  } finally { LoggiaContext._currentValue = avant; META.set(ASP, metaAvant); }
}));

/* TEST AJOUTÉ (passe bis du 18/10, point 8) : la batterie de l'Accueil de la popup suit la règle unique des piles (`couleurPile`,
 * ADR 0206), comme la carte : neutre, sauf sous le seuil. */
test('point 8 : la batterie de l’Accueil prend la couleur des piles — neutre, sauf sous le seuil', () => dans(async () => {
  const { couleurPile } = await import('../src/attention.js');
  for (const [pct, neutre] of [[92, true], [4, false]]) {
    const w = poser({ retouche: (c) => { c[ASP].attributes.battery_level = pct; } });
    const { accueil } = await fiche(w);
    const ma = monter(accueil().type, accueil().props);
    const chiffre = ma.trouver(e => e.props && e.props.style && e.props.style.fontSize === 25)[0];
    const ligne = ma.trouver(e => e.props && Array.isArray(e.props.children) && e.props.children.includes(chiffre))[0];
    assert.equal(ligne.props.style.color, couleurPile(pct, 'var(--o-text)'));
    assert.equal(ligne.props.style.color === 'var(--o-text)', neutre, pct + ' %');
  }
}));

test('I2 A : « Voir la carte » ouvre le plan dans une seconde feuille, montée après le contenu, où l’on choisit comme dans « Où »', () => dans(async () => {
  const w = poser();
  const { m, accueil } = await fiche(w);
  assert.equal(accueil().props.aUneCarte, true, 'le robot publie une carte');
  assert.equal(de(m, 'BottomSheet'), undefined, 'fermée');
  accueil().props.ouvrirCarte(); m.rendre();
  const enfants = [].concat(m.arbre.props.children).filter(Boolean);
  assert.equal(enfants[enfants.length - 1].type.name, 'BottomSheet', 'montée après le contenu : au-dessus, sans z-index');
  const feuille = enfants[enfants.length - 1].props.children(() => {});
  const plans = [];
  const chercher = (n) => { if (!n || typeof n !== 'object') return; if (Array.isArray(n)) { n.forEach(chercher); return; } if (n.props && n.props.haid === CARTE) plans.push(n); chercher(n.props && n.props.children); };
  chercher(feuille);
  assert.equal(plans.length, 1, 'le plan du logement');
  plans[0].props.onToggle({ id: 'seg:3' }); m.rendre();
  assert.deepEqual(accueil().props.zones.filter(z => z.choisie).map(z => z.nom), ['Bureau'], 'le choix se retrouve dans les puces');
}));

/* TEST AJOUTÉ (passe bis du 18/10, point A ; sa réponse « Par le serveur ») : les scripts maison de l'aspirateur (`vacuumScripts`,
 * Paramètres) partent par le serveur — `loggia/robots/lancer` avec `script` —, et plus en direct ; sans serveur, en direct, comme
 * avant. Le départ par un script dit son nom (« Nettoyer partout ») ; celui des pièces choisies par leurs interrupteurs emporte leurs
 * noms ; la pause d'un script part de même, et le geste en vol vaut pour lui. */
/* ASSERTION MODIFIÉE (passe bis 2 du 18/10, points C et J) : les scripts maison sont ceux de l'aspirateur PRINCIPAL (`resolved.vacuum.main`)
 * — la popup le nomme ici —, et chacun part avec le RÔLE qu'on lui demande (`role`). */
const PRINCIPAL = { vacuum: { available: true, main: ASP } };
test('point A : les scripts maison partent par le serveur — départ, pièces par interrupteurs, pause ; en direct sans lui', () => dans(async () => {
  const { LoggiaContext } = await import('../src/runtime.js');
  const avant = LoggiaContext._currentValue;
  LoggiaContext._currentValue = { ...avant, resolved: PRINCIPAL };
  const scripts = { nettoyer_tout: 'script.robot_partout', pieces_selectionnees: 'script.robot_pieces', pause: 'script.robot_pause' };
  const avecScripts = (c) => {
    c['script.robot_partout'] = st('script.robot_partout', 'off', { friendly_name: 'Aspirateur - Nettoyer partout' });
    c['script.robot_pieces'] = st('script.robot_pieces', 'off', { friendly_name: 'Nettoyer les pièces' });
    c['script.robot_pause'] = st('script.robot_pause', 'off', { friendly_name: 'Pause douce' });
  };
  // ASSERTION MODIFIÉE (25/10, petit paquet robots) : l'aspirateur principal est celui que le SERVEUR retient (`principal` de son état).
  const ouvrir = async (opts) => {
    const w = poser({ etat: { ...ETAT(), principal: ASP }, ...opts });
    setLoggiaState({ ent: { vacuumScripts: scripts } });
    return { w, ...(await fiche(w)) };
  };
  try {
    // Tout le logement, par son script : au serveur, avec son nom.
    let f = await ouvrir({ retouche: avecScripts });
    f.accueil().props.principale.agir();
    assert.deepEqual(f.w.ws.filter(x => x.type === 'loggia/robots/lancer').map(x => [x.script, x.role, x.zones]), [['script.robot_partout', 'nettoyer_tout', []]]);
    assert.deepEqual(f.w.appels, [], 'plus de `script.turn_on` direct');
    f.relire();
    assert.equal(f.vue.arbre.carnet.libelle, 'Nettoyer partout', 'le nom du script, sans celui du robot');
    // Sans serveur : en direct, comme avant.
    f = await ouvrir({ retouche: avecScripts, muet: true });
    f.accueil().props.principale.agir();
    f.w.ws.find(x => x.type === 'loggia/robots/lancer').ko({ code: 'unknown_command', message: 'Unknown command.' });
    await jusqua(() => f.w.appels.length > 0);
    assert.deepEqual(f.w.appels, ['script.turn_on script.robot_partout']);
    // La pause d'un script : au serveur aussi ; deux appuis, un seul envoi.
    f = await ouvrir({ retouche: (c) => { avecScripts(c); c[ASP].state = 'cleaning'; } });
    const pause = f.accueil().props.principale;
    pause.agir(); pause.agir();
    assert.deepEqual(f.w.ws.filter(x => x.type === 'loggia/robots/lancer').map(x => [x.script, x.role]), [['script.robot_pause', 'pause']]);
    assert.deepEqual(f.w.appels, [], 'ni `vacuum.pause` ni `script.turn_on` d’ici');
    // Les pièces choisies par leurs interrupteurs : le script des pièces, avec leurs noms.
    LoggiaContext._currentValue = { ...avant, resolved: PRINCIPAL, userCfg: { loggia_entities: { vacuumRooms: [{ id: 'salon', name: 'Salon', toggle: 'input_boolean.robot_salon' }] } } };
    f = await ouvrir({ retouche: (c) => { avecScripts(c); c['input_boolean.robot_salon'] = st('input_boolean.robot_salon', 'on', {}); } });
    const a = f.accueil().props;
    assert.deepEqual([a.zones.map(z => [z.nom, z.choisie]), a.principale.mot], [[['Salon', true]], 'Nettoyer 1 pièce'], 'une pièce sans interrupteur ne s’offre pas (point 6)');
    a.principale.agir();
    assert.deepEqual(f.w.ws.filter(x => x.type === 'loggia/robots/lancer').map(x => [x.script, x.role, x.zones.map(z => z.nom)]), [['script.robot_pieces', 'pieces_selectionnees', ['Salon']]]);
  } finally { LoggiaContext._currentValue = avant; }
}));

/* TEST AJOUTÉ (passe bis 2 du 18/10, point C) : avec deux aspirateurs, les scripts maison (`vacuumScripts`) sont ceux du PRINCIPAL —
 * celui que l'écran résout (`resolved.vacuum.main`). La popup de l'autre ne les montre pas : son départ est le service standard, par
 * le serveur, sans script ; sa pause, `vacuum.pause`. */
test('point C : les scripts maison n’appartiennent qu’à l’aspirateur principal — la popup d’un autre ne les montre pas', () => dans(async () => {
  const { LoggiaContext } = await import('../src/runtime.js');
  const avant = LoggiaContext._currentValue;
  LoggiaContext._currentValue = { ...avant, resolved: { vacuum: { available: true, main: 'vacuum.principal' } } };
  try {
    const avecScripts = (c) => {
      c['script.robot_partout'] = st('script.robot_partout', 'off', { friendly_name: 'Nettoyer partout' });
      c['script.robot_pause'] = st('script.robot_pause', 'off', { friendly_name: 'Pause douce' });
    };
    // ASSERTION MODIFIÉE (25/10, petit paquet robots) : le principal se lit dans l'état du serveur (`principal`), qui nomme l'autre.
    const ouvrir = async (opts) => {
      const w = poser({ etat: { ...ETAT(), principal: 'vacuum.principal' }, ...opts });
      setLoggiaState({ ent: { vacuumScripts: { nettoyer_tout: 'script.robot_partout', pause: 'script.robot_pause' } } });
      return { w, ...(await fiche(w)) };
    };
    let f = await ouvrir({ retouche: avecScripts });
    f.accueil().props.principale.agir();
    assert.deepEqual(f.w.ws.filter(x => x.type === 'loggia/robots/lancer').map(x => [x.robot, 'script' in x, x.zones]), [[ASP, false, []]], 'le service standard, par le serveur');
    f = await ouvrir({ retouche: (c) => { avecScripts(c); c[ASP].state = 'cleaning'; } });
    f.accueil().props.principale.agir();
    assert.deepEqual([f.w.appels, f.w.ws.filter(x => x.type === 'loggia/robots/lancer').length], [['vacuum.pause ' + ASP], 0], 'sa pause : la sienne, pas le script de l’autre');
  } finally { LoggiaContext._currentValue = avant; }
}));

/* TEST AJOUTÉ (passe bis du 18/10, point B) : sa réponse du 18/10, « Elle part de la popup » — la caméra de l'aspirateur quitte la
 * seconde feuille de la carte du logement, même désignée ; elle reste dans Sécurité. */
test('point B : la seconde feuille montre le plan du logement, sans la caméra du robot — elle reste dans Sécurité', () => dans(async () => {
  const { LoggiaContext } = await import('../src/runtime.js');
  const avant = LoggiaContext._currentValue;
  LoggiaContext._currentValue = { ...avant, userCfg: { loggia_entities: { vacuum: { camera: 'camera.aspirateur' } } } };
  try {
    const w = poser({ retouche: (c) => { c['camera.aspirateur'] = st('camera.aspirateur', 'idle', { friendly_name: 'Aspirateur Caméra' }); } });
    const { m, accueil } = await fiche(w);
    accueil().props.ouvrirCarte(); m.rendre();
    const enfants = [].concat(m.arbre.props.children).filter(Boolean);
    const feuille = enfants[enfants.length - 1].props.children(() => {});
    const noms = [];
    parcourir(feuille, (e) => { if (e.type && e.type.name) noms.push(e.type.name); if (e.props && e.props.haid) noms.push(e.props.haid); });
    assert.ok(noms.includes(CARTE), 'le plan du logement');
    assert.ok(!noms.includes('CamLive') && !noms.includes('camera.aspirateur'), 'pas de caméra dans la popup');
  } finally { LoggiaContext._currentValue = avant; }
}));

test('les tuiles : le prochain passage qui partira ouvre le Planning ; les 7 derniers jours du carnet ouvrent l’Historique ; l’entretien sous 35 %', () => dans(async () => {
  const w = poser();
  const { m, accueil } = await fiche(w);
  const a = accueil().props;
  // ASSERTION MODIFIÉE (passe bis du 18/10, point 13) : « Lun. 09:30 », avec le point, comme sa maquette (« Mar. 09:30 ») — l'abréviation de la langue.
  assert.deepEqual([a.prochain.titre, a.prochain.sous, a.prochain.onglet], ['Lun. 09:30', 'Tout le logement', 'planning'], '23:00 ce soir tombe dans « Ne pas déranger »');
  assert.deepEqual([a.semaine.titre, a.semaine.sous], ['129 m²', '2 passages · 1 h 36'], 'sept jours glissants : le passage d’il y a neuf jours n’en est plus');
  assert.deepEqual([a.alerte.nom, a.alerte.pct], ['Filtre', 32]);
  const ma = monter(accueil().type, accueil().props);
  assert.ok(ma.texte().includes('Filtre à 32 % · à changer bientôt'), ma.texte());
  a.allerA('historique'); m.rendre();
  assert.equal(de(m, 'PanneauOnglet').props.actuel, 'historique');
  // Sans carnet ni planning (un composant d'avant ce chantier) : « Aucun » · « Rien de planifié ».
  const w2 = poser({ muet: true });
  const { accueil: accueil2 } = await fiche(w2);
  assert.deepEqual([accueil2().props.prochain.titre, accueil2().props.prochain.sous, accueil2().props.prochain.onglet], ['Aucun', 'Rien de planifié', null]);
}));

test('muet : le liseré sur le panneau de tête, un seul signal ; ni départ ni base', () => dans(async () => {
  const w = poser({ retouche: (c) => { c[ASP] = st(ASP, 'unavailable', { friendly_name: 'Aspirateur', supported_features: 8828 }, new Date(2026, 9, 17, 14, 20).toISOString()); } });
  const { accueil } = await fiche(w);
  const a = accueil().props;
  assert.deepEqual([a.etat.mot, a.etat.phrase, a.etat.encre], ['Indisponible', 'Depuis 14:20', 'var(--o-text2)'], 'sans rouge : le liseré le dit');
  /* ASSERTION MODIFIÉE (passe bis du 18/10, point 12) : une puce sans geste possible ne se DESSINE pas — comme sur la carte. Muet, la
   * popup posait deux puces inertes, à demi effacées ; elle n'en pose plus aucune, ni « Où ». */
  assert.deepEqual([a.principale, a.seconde], [null, null], 'rien à toucher, rien de dessiné');
  const ma = monter(accueil().type, accueil().props);
  const hero = ma.trouver(e => e.props && typeof e.props.className === 'string' && e.props.className.includes('rb-a-hero'))[0];
  assert.ok(hero.props.className.includes('o-panne'), 'le liseré qui respire, sur le panneau de tête');
  assert.deepEqual([ma.trouver(e => e.type === 'button' && /rb-a-puce/.test(e.props.className || '')).length, ma.trouver(e => e.type && e.type.name === 'PuceOu').length], [0, 0]);
}));

/* TEST AJOUTÉ (passe bis du 18/10, point 12) : un bit qui manque à l'appareil, c'est une puce qui n'existe pas — jamais une puce inerte
 * à demi effacée (la règle de la carte, I9). */
test('point 12 : un bit qui manque — la puce ne se dessine pas, ni la principale, ni la seconde', () => dans(async () => {
  // Au travail sans PAUSE (4) ni RETURN_HOME (16) : rien à offrir.
  const w = poser({ retouche: (c) => { c[ASP].state = 'cleaning'; c[ASP].attributes.supported_features = 8828 - 4 - 16; } });
  const { accueil } = await fiche(w);
  assert.deepEqual([accueil().props.principale, accueil().props.seconde], [null, null]);
  // Sur la base sans START (8192) ni LOCATE (512).
  const w2 = poser({ retouche: (c) => { c[ASP].attributes.supported_features = 8828 - 8192 - 512; } });
  const { accueil: a2 } = await fiche(w2);
  assert.deepEqual([a2().props.principale, a2().props.seconde], [null, null]);
  const ma = monter(a2().type, a2().props);
  assert.equal(ma.trouver(e => e.type === 'button' && /rb-a-puce/.test(e.props.className || '')).length, 0, 'ni puce inerte, ni rangée vide');
}));

test('I4 A : la roue ouvre les réglages — la puissance d’aspiration en tête ; Retour revient à l’Accueil', () => dans(async () => {
  const w = poser();
  const { m } = await fiche(w);
  de(m, 'EnteteFiche').props.onReglages(); m.rendre();
  const p = de(m, 'PageReglagesAppareil');
  assert.ok(p && p.props.avant, 'la puissance, avant les réglages de l’appareil');
  assert.equal(p.props.libelleNom, 'Nom du robot');
  p.props.retour(); m.rendre();
  assert.equal(de(m, 'PageReglagesAppareil'), undefined);
}));

/* TEST AJOUTÉ (chantier IoT, tâche 13, 18/10) : vue au navigateur à 375 px, la fiche coupait « Nettoyer tout l… » et posait
 * « Demain » au-dessus de « 09:30 ». Sa maquette dessine la popup à 520 px ; au téléphone, la seconde puce ne garde que son glyphe
 * (son mot reste dans son nom), la principale passe en 13 px, et la valeur d'une tuile tient sur une ligne. Le corps et la marge
 * des puces et des tuiles vivent dans index.css — le téléphone les change sans `!important`, que la feuille du robot refuse
 * (tests/distributeur_finition.test.mjs). */
test('au téléphone : la seconde puce garde son glyphe et son nom ; la principale et les tuiles tiennent sur une ligne', () => dans(async () => {
  const w = poser();
  const { accueil } = await fiche(w);
  const ma = monter(accueil().type, accueil().props);
  const classe = (c) => (e) => e.props && typeof e.props.className === 'string' && e.props.className.split(' ').includes(c);
  const seconde = ma.trouver(classe('rb-a-seconde'))[0];
  assert.deepEqual([seconde.props['aria-label'], seconde.props.title], ['Localiser', 'Localiser'], 'le mot caché reste son nom');
  const principale = ma.trouver(classe('rb-a-principale'))[0];
  assert.ok(principale && principale.props.className.includes('rb-a-puce') && principale.props.style.fontSize === undefined && principale.props.style.padding === undefined,
    'le corps et la marge de la puce : index.css, pas le style en ligne');
  assert.equal(ma.trouver(classe('rb-a-libelle')).length, 1);
  const tuiles = ma.trouver(e => e.type && e.type.name === 'Tuile');
  assert.equal(tuiles.length, 2);
  for (const t of tuiles) {
    const mt = monter(t.type, t.props);
    assert.ok(mt.arbre.props.className === 'rb-a-tuile' && mt.arbre.props.style.padding === undefined, 'la marge de la tuile : index.css');
    const titre = mt.trouver(classe('rb-a-tuile-titre'))[0];
    assert.ok(titre && !titre.props.style, 'la valeur de la tuile : index.css (20 / 800, une ligne)');
  }
  const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
  // ASSERTION MODIFIÉE (passe bis du 18/10, point 13) : les puces de l'Accueil en 13 px, comme sa maquette (la principale 0 12px, la seconde 0 14px).
  for (const r of ['.rb-a-hero, .rb-a-tuiles { container-type: inline-size; }', '.rb-a-puce { font-size: 13px; padding: 0 14px; }', '.rb-a-principale { padding: 0 12px; }',
    '.rb-a-libelle { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }', '.rb-a-tuile { padding: 14px 16px; }',
    '.rb-a-tuile-titre { display: block; font-size: 20px; font-weight: 800; letter-spacing: -.01em; margin-top: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
    '@container (max-width: 360px) {', '.rb-a-seconde .rb-a-mot { display: none; }', '.rb-a-seconde { width: 48px; padding: 0; }',
    '.rb-a-principale { font-size: 13px; padding: 0 12px; }', '@container (max-width: 270px) { .rb-a-libelle { white-space: normal; line-height: 1.15; } }',
    '@container (max-width: 340px) { .rb-a-tuile-titre { font-size: 17px; } }',
    '@container (max-width: 290px) { .rb-a-tuile-titre { font-size: 15px; } .rb-a-tuile { padding: 14px 12px; } }']) assert.ok(css.includes(r), r + ' manque à index.css');
}));

/* TEST AJOUTÉ (passe bis du 18/10, point 13) : les valeurs de sa maquette (cadre 1b ; § 7 de la conception) — la puce de sa maquette
 * (`ChipButton`) a le rayon 10 : les puces de « Où » (12,5 px, 0 12px, le point à 7 px), la principale et la seconde ; au repos, le
 * mot d'état en `--o-text`. */
test('point 13 : les puces de l’Accueil ont le rayon de sa maquette, et le mot d’état au repos son encre', () => dans(async () => {
  const w = poser();
  const { accueil } = await fiche(w);
  const a = accueil().props;
  assert.equal(a.etat.encre, 'var(--o-text)');
  const ma = monter(accueil().type, a);
  const ou = monter(PuceOu(ma), ma.trouver(e => e.type && e.type.name === 'PuceOu')[1].props).arbre;
  // ASSERTION MODIFIEE (26/10, grille des pièces) : 44 px de haut au lieu de 40 — une cible tactile au téléphone, la même hauteur
  // pour « Tout » et pour chaque case de la grille ; le rayon, le corps, la marge et l'écart du point restent ceux de sa maquette.
  assert.deepEqual([ou.props.style.borderRadius, ou.props.style.fontSize, ou.props.style.padding, ou.props.style.gap, ou.props.style.height], [10, 12.5, '0 12px', 7, 44]);
  const puces = ma.trouver(e => e.type === 'button' && /rb-a-puce/.test(e.props.className || ''));
  assert.deepEqual(puces.map(b => b.props.style.borderRadius), [10, 10], 'la principale et la seconde');
}));
const PuceOu = (m) => m.trouver(e => e.type && e.type.name === 'PuceOu')[0].type;

/* TEST AJOUTÉ (26/10, grille des pièces ; son choix « Grille régulière ») : « Tout le logement » (« Tout le jardin ») est À PART, seul
 * sur sa ligne, au-dessus ; la grille, sans cadre, aux colonnes de largeur égale (`auto-fill`, `minmax(…, 1fr)`), ne contient QUE les
 * pièces, dans leur ordre ; chaque puce prend toute sa case, 44 px de haut, et garde son nom entier en `title` et en `aria-label`,
 * le texte coupé en points de suspension sur une ligne. La tondeuse passe par le même composant. */
test('grille des pièces : « Tout » à part, la grille ne tient que les pièces, chaque puce garde son nom entier', () => dans(async () => {
  for (const [robot, tout, noms] of [[ASP, 'Tout le logement', ['Salon', 'Cuisine', 'Bureau']], [TOND, 'Tout le jardin', ['Pelouse arrière', 'Pelouse avant']]]) {
    const w = poser();
    const { accueil } = await fiche(w, robot);
    const ma = monter(accueil().type, accueil().props);
    const [aPart] = ma.trouver(e => e.type === 'div' && e.props.className === 'rb-a-ou-tout');
    const [grille] = ma.trouver(e => e.type === 'div' && e.props.className === 'rb-a-pieces');
    assert.ok(aPart && grille, robot + ' : « Tout » à part et la grille');
    const puces = (n) => { const out = []; parcourir(n.props.children, e => { if (e.type && e.type.name === 'PuceOu') out.push(e); }); return out; };
    assert.deepEqual(puces(aPart).map(p => texteDe(p)), [tout], robot + ' : « Tout » seul sur sa ligne');
    assert.deepEqual(puces(grille).map(p => texteDe(p)), noms, robot + ' : la grille ne tient que les pièces, dans leur ordre');
    if (robot === ASP) assert.ok(puces(grille).every(p => p.props.couleur), 'chaque pièce garde son point de couleur');
    const g = grille.props.style;
    assert.equal(g.display, 'grid');
    assert.match(g.gridTemplateColumns, /^repeat\(auto-fill, minmax\(\d+px, 1fr\)\)$/, 'des colonnes de largeur égale');
    assert.ok(g.marginTop > 0, 'un peu d’air entre « Tout » et la grille');
    assert.ok(!g.border && !g.background && !g.boxShadow, 'pas de boîte dans une boîte : la grille n’a pas de cadre');
    // L'ordre du DOM : « Tout », puis la grille — la tabulation suit l'ordre visuel.
    const ordre = ma.trouver(e => e.type && e.type.name === 'PuceOu').map(p => texteDe(p));
    assert.deepEqual(ordre, [tout, ...noms]);
    for (const p of puces(grille)) {
      const b = monter(p.type, p.props).arbre;
      assert.deepEqual([b.props.title, b.props['aria-label']], [texteDe(p), texteDe(p)], 'le nom entier, en title et en aria-label');
      assert.deepEqual([b.props.style.width, b.props.style.minWidth, b.props.style.height], ['100%', 0, 44], 'toute sa case, 44 px');
      const [mot] = b.props.children.filter(x => x && x.props && !x.props['aria-hidden']);
      assert.deepEqual([mot.props.style.overflow, mot.props.style.textOverflow, mot.props.style.whiteSpace], ['hidden', 'ellipsis', 'nowrap'], 'coupé sur une ligne');
    }
  }
}));

test('I17 : les pièces nouvelles prennent les jetons du thème, jamais une couleur en dur', () => {
  const pieces = vacRooms({ states: { [ASP]: { state: 'docked', attributes: { rooms: { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7, h: 8 } } } } }, ASP, []);
  assert.equal(pieces.length, 8);
  assert.ok(pieces.every(p => /^var\(--o-[a-z-]+\)$/.test(p.color)), pieces.map(p => p.color).join(', '));
});

/* ── Les pièces sans rien configurer (chantier IoT, tranche robots 2, 19/10 ; ADR 0218) ─────────────────────────────────────────
 *
 * TESTS AJOUTÉS (conception R1 à R11 ; ses choix Q1 A, Q2 A, Q3 A) : les zones de Home Assistant, lues par le serveur
 * (`etat.pieces`), sont les puces de « Où » et partent par `vacuum.clean_area` — par le serveur, en direct sans lui ; les lignes de
 * § 3.1 (l'association à faire, pour un administrateur et pour un compte ordinaire ; ses scripts qui gardent la main ; la carte
 * refaite ; une autre carte) ; l'exception d'un Ecovacs sans le bit (`clean_V2`, le compteur de passages), et un `rooms` vide qui ne
 * fabrique rien ; sans association, les pièces publiées par `spot_area` en liste ; le Planning et la seconde feuille reçoivent les
 * zones. */
const PIECES_ZONES = () => ({
  source: 'zones', capable: true, association: true, carte_changee: false, commande: 'clean_area', passages: 1, autres_cartes: [], autres_zones: [],
  zones: [
    { id: 'zone:cuisine', nom: 'Cuisine', zone: 'cuisine', etage: 'rdc', segments: ['m1_2'], noms_segments: ['Cuisine'] },
    { id: 'zone:salon', nom: 'Salon', zone: 'salon', etage: 'rdc', segments: ['m1_1'], noms_segments: ['Salon'] },
    { id: 'zone:bureau', nom: 'Bureau', zone: 'bureau', etage: 'haut', segments: ['m1_3'], noms_segments: ['Bureau'] },
  ],
  segments: [{ id: 'seg:1', nom: 'Salon', slug: 'salon', segments: [1] }, { id: 'seg:2', nom: 'Cuisine', slug: 'cuisine', segments: [2] }, { id: 'seg:3', nom: 'Bureau', slug: 'bureau', segments: [3] }],
});
/* ASSERTION MODIFIÉE (25/10, petit paquet robots) : l'état d'un serveur de cette tranche dit aussi l'aspirateur principal qu'il retient
 * (`principal`) — ici le seul de la maison ; la popup ne prend plus celui que l'écran résout pour ses scripts. */
const avecPieces = (pieces, etat = ETAT()) => ({ principal: ASP, ...etat, pieces: { [ASP]: pieces } });
const BIT = 16384;

test('R2, R3, R4 : les zones de Home Assistant sont les puces de « Où » ; « Nettoyer 2 pièces » part par le serveur avec ses zones, jamais un segment', () => dans(async () => {
  const w = poser({ etat: avecPieces(PIECES_ZONES()) });
  const { m, accueil, relire } = await fiche(w);
  let a = accueil().props;
  assert.deepEqual(a.zones.map(z => [z.id, z.nom, z.choisie, z.couleur]), [['zone:cuisine', 'Cuisine', false, 'var(--o-cyan)'], ['zone:salon', 'Salon', false, 'var(--o-cold)'], ['zone:bureau', 'Bureau', false, 'var(--o-purple)']],
    'les zones dans l’ordre du serveur, la palette des pièces — devant ce que le robot publie');
  assert.deepEqual([a.choisir, a.toutChoisi, a.lignes, a.principale.mot], [true, true, [], 'Nettoyer tout le logement']);
  a.basculerZone(a.zones[1]); m.rendre();
  accueil().props.basculerZone(accueil().props.zones[0]); m.rendre();
  a = accueil().props;
  assert.deepEqual([a.principale.mot, a.zones.filter(z => z.choisie).map(z => z.nom)], ['Nettoyer 2 pièces', ['Cuisine', 'Salon']]);
  a.principale.agir();
  const lancer = w.ws.find(x => x.type === 'loggia/robots/lancer');
  assert.deepEqual([lancer.robot, lancer.zones], [ASP, [{ id: 'zone:cuisine', nom: 'Cuisine', segments: [], zone: 'cuisine' }, { id: 'zone:salon', nom: 'Salon', segments: [], zone: 'salon' }]], 'par le serveur, la zone de Home Assistant');
  assert.deepEqual(w.appels, [], 'rien en direct');
  relire();
  assert.equal(accueil().props.etat.phrase, 'Cuisine, Salon · depuis 16:40', 'les zones que cet onglet vient de lancer');
  // Le Planning propose les mêmes zones ; la feuille d'un passage garde la ZONE (R5), jamais un segment.
  de(m, 'FicheOnglets').props.onChoisir('planning'); m.rendre();
  const planning = de(m, 'OngletPlanning').props.zones;
  assert.deepEqual(planning.map(z => z.id), ['zone:cuisine', 'zone:salon', 'zone:bureau']);
  assert.deepEqual((await import('../src/robotsfiche.js')).zonePlanning(planning[0]), { id: 'zone:cuisine', nom: 'Cuisine', segments: [], zone: 'cuisine' });
}));

test('R4 : sans `lancer` au serveur, le départ par zones part en direct par `vacuum.clean_area` — le bit est là', () => dans(async () => {
  const w = poser({ etat: avecPieces(PIECES_ZONES()) });
  const { m, accueil } = await fiche(w);
  accueil().props.basculerZone(accueil().props.zones[2]); m.rendre();
  accueil().props.principale.agir();
  w.ws.find(x => x.type === 'loggia/robots/lancer').ko({ code: 'unknown_command', message: 'Unknown command.' });
  await jusqua(() => w.appels.length > 0);
  assert.deepEqual(w.donnees, [{ domaine: 'vacuum', service: 'clean_area', data: { entity_id: ASP, cleaning_area_id: ['bureau'] } }]);
}));

test('§ 3.1 : le bit sans association — le chemin exact à un administrateur, la phrase sobre à un compte ordinaire ; ni « Où » ni puce', () => dans(async () => {
  const sans = { ...PIECES_ZONES(), source: 'aucune', association: false, zones: [], segments: [], commande: null };
  const retouche = (c) => { delete c[ASP].attributes.rooms; c[ASP].attributes.supported_features = 8828 + BIT; };
  const w = poser({ etat: avecPieces(sans), retouche });
  const { accueil } = await fiche(w);
  const a = accueil().props;
  assert.deepEqual([a.choisir, a.zones, a.principale.mot], [false, [], 'Nettoyer tout le logement']);
  assert.deepEqual(a.lignes.map(l => [l.cle, l.glyphe]), [['association', 'info']]);
  assert.equal(a.lignes[0].texte, 'Associez une fois les pièces du robot aux zones de Home Assistant : Paramètres › Appareils et services › Entités › Aspirateur › roue › « Associer les segments aux zones ».');
  const ma = monter(accueil().type, accueil().props);
  assert.ok(ma.texte().includes('Associez une fois') && !ma.texte().includes('Où'), ma.texte());
  // Un compte ordinaire : la phrase sobre, sans chemin — comme le dialogue de Home Assistant, qui ne lui montre pas « Configurer ».
  const w2 = poser({ etat: avecPieces(sans), retouche, ordinaire: true });
  const { accueil: accueil2 } = await fiche(w2);
  assert.deepEqual(accueil2().props.lignes.map(l => l.texte), ['Les pièces du robot ne sont pas encore associées aux zones de Home Assistant.']);
  // Muet : rien à lire non plus — le liseré est le seul signal.
  const w3 = poser({ etat: avecPieces(sans), retouche: (c) => { retouche(c); c[ASP].state = 'unavailable'; } });
  const { accueil: accueil3 } = await fiche(w3);
  const ma3 = monter(accueil3().type, accueil3().props);
  assert.ok(!ma3.texte().includes('Associez'), 'muet : aucune ligne');
}));

test('Q1 A : ses scripts gardent la main — les puces sont ses interrupteurs, et la ligne le dit', () => dans(async () => {
  const { LoggiaContext } = await import('../src/runtime.js');
  const avant = LoggiaContext._currentValue;
  /* Les scripts se lisent dans la description de la maison que l'écran tient (`loggia_entities.vacuumScripts`), comme ses pièces — la
   * table du serveur (`setLoggiaState({ ent })`) reste un repli : la démo, sans serveur, n'a que la description. */
  LoggiaContext._currentValue = { ...avant, resolved: PRINCIPAL, userCfg: { loggia_entities: { vacuumRooms: [{ id: 'salon', name: 'Salon', toggle: 'input_boolean.robot_salon' }],
    vacuumScripts: { pieces_selectionnees: 'script.robot_pieces' } } } };
  try {
    const w = poser({ etat: avecPieces({ ...PIECES_ZONES(), source: 'scripts', commande: null }), retouche: (c) => {
      c['script.robot_pieces'] = st('script.robot_pieces', 'off', { friendly_name: 'Nettoyer les pièces' });
      c['input_boolean.robot_salon'] = st('input_boolean.robot_salon', 'off', {});
    } });
    const { accueil } = await fiche(w);
    const a = accueil().props;
    assert.deepEqual([a.zones.map(z => z.nom), a.lignes.map(l => [l.cle, l.texte])], [['Salon'], [['scripts', 'Vos scripts gardent la main pour les pièces.']]]);
    const ma = monter(accueil().type, accueil().props);
    assert.ok(ma.texte().includes('Vos scripts gardent la main pour les pièces.'), ma.texte());
  } finally { LoggiaContext._currentValue = avant; }
}));

test('R9, R11 : la carte refaite se dit en ambre, les puces restent ; les pièces d’une autre carte se comptent', () => dans(async () => {
  const w = poser({ etat: avecPieces({ ...PIECES_ZONES(), carte_changee: true, autres_cartes: [{ carte: 'Étage', n: 2 }], autres_zones: ['chambre', 'sdb'] }) });
  const { accueil } = await fiche(w);
  const a = accueil().props;
  assert.equal(a.zones.length, 3, 'Home Assistant nettoie ce qui existe encore');
  assert.deepEqual(a.lignes.map(l => [l.cle, l.encre, l.texte]), [
    ['carte', 'var(--o-warn)', 'La carte du robot a changé : refaites l’association dans Home Assistant.'],
    ['ailleurs', 'var(--o-text2)', '2 pièces sur une autre carte (Étage) — changez de carte dans les réglages du robot.'],
  ]);
}));

test('Q2 A : un Ecovacs qui publie ses pièces sans le bit — l’exception nommée, le compteur de passages en tête ; rien sans `rooms`', () => dans(async () => {
  const COMPTEUR = 'number.aspirateur_compteur';
  META.set(COMPTEUR, { deviceId: 'd1', device: 'Aspirateur', platform: 'ecovacs', translationKey: 'clean_count' });
  try {
    const exception = { ...PIECES_ZONES(), source: 'segments', capable: false, association: false, zones: [], commande: 'clean_V2', passages: 2 };
    const w = poser({ etat: avecPieces(exception), retouche: (c) => { c[COMPTEUR] = st(COMPTEUR, '2', { friendly_name: 'Aspirateur Compteur de nettoyage', min: 1, max: 4 }); } });
    const { m, accueil } = await fiche(w);
    let a = accueil().props;
    assert.deepEqual([a.choisir, a.zones.map(z => z.nom), a.lignes], [true, ['Salon', 'Cuisine', 'Bureau'], []], 'ses pièces publiées, sans ligne : Home Assistant n’offre rien à associer');
    a.basculerZone(a.zones[0]); m.rendre();
    accueil().props.principale.agir();
    const lancer = w.ws.find(x => x.type === 'loggia/robots/lancer');
    assert.deepEqual(lancer.zones, [{ id: 'seg:1', nom: 'Salon', segments: [1] }], 'par le serveur, qui connaît l’exception');
    lancer.ko({ code: 'unknown_command', message: 'Unknown command.' });
    await jusqua(() => w.appels.length > 0);
    assert.deepEqual(w.donnees, [{ domaine: 'vacuum', service: 'send_command', data: { entity_id: ASP, command: 'clean_V2', params: { act: 'start', content: { type: 'freeClean', value: '2,1' } } } }],
      'sans serveur : la commande de ses scripts, deux passages puis le segment');
    // Un `rooms` vide (son cas, un jour sans carte) : ni puce, ni ligne — « Nettoyer tout le logement ».
    const vide = { ...exception, source: 'aucune', segments: [], commande: null };
    const w2 = poser({ etat: avecPieces(vide), retouche: (c) => { c[ASP].attributes.rooms = {}; } });
    const { accueil: accueil2 } = await fiche(w2);
    a = accueil2().props;
    assert.deepEqual([a.choisir, a.zones, a.lignes, a.principale.mot], [false, [], [], 'Nettoyer tout le logement']);
  } finally { META.delete(COMPTEUR); }
}));

test('§ 3.1 : le bit sans association, le robot publie ses pièces — elles s’offrent par `spot_area` en liste, et un administrateur lit comment les nommer', () => dans(async () => {
  const publie = { ...PIECES_ZONES(), source: 'segments', association: false, zones: [], commande: 'spot_area' };
  const w = poser({ etat: avecPieces(publie), retouche: (c) => { c[ASP].attributes.supported_features = 8828 + BIT; } });
  const { m, accueil } = await fiche(w);
  const a = accueil().props;
  assert.deepEqual([a.zones.map(z => z.nom), a.lignes.map(l => l.texte)], [['Salon', 'Cuisine', 'Bureau'], ['Associez les pièces aux zones de Home Assistant pour les nommer comme vos pièces.']]);
  a.basculerZone(a.zones[1]); m.rendre();
  accueil().props.principale.agir();
  w.ws.find(x => x.type === 'loggia/robots/lancer').ko({ code: 'unknown_command', message: 'Unknown command.' });
  await jusqua(() => w.appels.length > 0);
  assert.deepEqual(w.donnees[0].data, { entity_id: ASP, command: 'spot_area', params: { rooms: [2], cleanings: 1 } }, 'une LISTE (R4)');
  // Un compte ordinaire n'a rien à faire : la ligne ne se dit pas.
  const w2 = poser({ etat: avecPieces(publie), retouche: (c) => { c[ASP].attributes.supported_features = 8828 + BIT; }, ordinaire: true });
  const { accueil: accueil2 } = await fiche(w2);
  assert.deepEqual(accueil2().props.lignes, []);
}));

test('§ 3.4 : la seconde feuille reçoit les zones de Home Assistant, et y choisir se retrouve dans « Où »', () => dans(async () => {
  const w = poser({ etat: avecPieces(PIECES_ZONES()) });
  const { m, accueil } = await fiche(w);
  accueil().props.ouvrirCarte(); m.rendre();
  const enfants = [].concat(m.arbre.props.children).filter(Boolean);
  const feuille = enfants[enfants.length - 1].props.children(() => {});
  const plans = [];
  const chercher = (n) => { if (!n || typeof n !== 'object') return; if (Array.isArray(n)) { n.forEach(chercher); return; } if (n.props && n.props.haid === CARTE) plans.push(n); chercher(n.props && n.props.children); };
  chercher(feuille);
  assert.deepEqual(plans[0].props.zones.map(z => [z.id, z.name, z.color, z.segments]), [['zone:cuisine', 'Cuisine', 'var(--o-cyan)', ['m1_2']], ['zone:salon', 'Salon', 'var(--o-cold)', ['m1_1']], ['zone:bureau', 'Bureau', 'var(--o-purple)', ['m1_3']]]);
  plans[0].props.onToggle({ id: 'zone:bureau' }); m.rendre();
  assert.deepEqual(accueil().props.zones.filter(z => z.choisie).map(z => z.nom), ['Bureau']);
}));

/* ── Passe bis de la tranche robots 2 (20/10) : sa décision « Mon script garde la main » ──────────────────────────────────────────
 *
 * TESTS AJOUTÉS : son cas AVANT de désigner (ses scripts sans `pieces_selectionnees`, son Ecovacs sans le bit qui publie `rooms`) —
 * aucune puce, la ligne qui dit où désigner (administrateur), « Nettoyer tout le logement » par son `nettoyer_tout` ; APRÈS — les
 * puces sont ses interrupteurs, rien ne bascule même quand Home Assistant a une association ; la roue : « Scripts de la maison », une
 * rangée par rôle en `ListeChoix`, qui envoie le RÔLE seul au serveur (`loggia/robots/scripts` — passe bis 2 du 20/10 : la description
 * entière ne quitte plus l'onglet), lit l'état rendu, attend tant que le composant n'a pas répondu, chaque refus disant sa raison, un
 * compte ordinaire qui lit sans régler, pas de panneau pour un robot qui n'est pas l'aspirateur principal ; « Localiser » par son
 * script, le geste de la carte sans garde ; la feuille d'un passage d'avant (point 2) ; `invalid_format` dit d'une phrase traduite ;
 * le plan reçoit le nombre de pièces du robot. */
const SCRIPTS_SON_CAS = { nettoyer_tout: 'script.robot_partout', pause: 'script.robot_pause', reprendre: 'script.robot_reprise', retour_base: 'script.robot_base', localiser: 'script.robot_ou' };
const ROOMS_SON_CAS = [{ id: 'salon', name: 'Salon', toggle: 'input_boolean.robot_salon', segments: [1] }, { id: 'cuisine', name: 'Cuisine', toggle: 'input_boolean.robot_cuisine', segments: [2] }];
const sonCas = (c) => {
  ['script.robot_partout', 'script.robot_pause', 'script.robot_reprise', 'script.robot_base', 'script.robot_ou', 'script.robot_pieces', 'script.arroser']
    .forEach(id => { c[id] = st(id, 'off', { friendly_name: id.slice(7).split('_').map(m => m.charAt(0).toUpperCase() + m.slice(1)).join(' ') }); });
  c['input_boolean.robot_salon'] = st('input_boolean.robot_salon', 'off', {});
  c['input_boolean.robot_cuisine'] = st('input_boolean.robot_cuisine', 'off', {});
  c[ASP].attributes.supported_features = 8828; // pas le bit : son robot
};
const PIECES_SON_CAS = (script_pieces) => ({ source: 'scripts', capable: false, association: false, carte_changee: false, script_pieces, zones: [], autres_cartes: [], autres_zones: [],
  segments: [{ id: 'seg:1', nom: 'Salon', slug: 'salon', segments: [1] }, { id: 'seg:2', nom: 'Cuisine', slug: 'cuisine', segments: [2] }, { id: 'seg:3', nom: 'Bureau', slug: 'bureau', segments: [3] }] });
async function chezLui(entites, fn) {
  const { LoggiaContext } = await import('../src/runtime.js');
  const avant = LoggiaContext._currentValue;
  LoggiaContext._currentValue = { ...avant, resolved: PRINCIPAL, userCfg: { loggia_entities: entites } };
  try { return await fn(); } finally { LoggiaContext._currentValue = avant; }
}

test('sa décision : AVANT de désigner son script des pièces — aucune puce (l’exception ne s’allume pas derrière ses scripts), la ligne à un administrateur, « tout » par son script', () => dans(() => chezLui({ vacuumRooms: ROOMS_SON_CAS, vacuumScripts: SCRIPTS_SON_CAS }, async () => {
  const w = poser({ etat: avecPieces(PIECES_SON_CAS(false)), retouche: sonCas });
  const { accueil } = await fiche(w);
  const a = accueil().props;
  assert.deepEqual([a.choisir, a.zones, a.principale.mot], [false, [], 'Nettoyer tout le logement'], 'ni ses pièces publiées, ni rien : rien ne bascule');
  assert.deepEqual(a.lignes.map(l => [l.cle, l.glyphe, l.texte]), [['designer', 'info', 'Désignez votre script des pièces sélectionnées dans la roue : les puces de « Où » seront vos interrupteurs.']]);
  const ma = monter(accueil().type, accueil().props);
  assert.ok(ma.texte().includes('Désignez votre script') && ma.trouver(e => e.type && e.type.name === 'PuceOu').length === 0, ma.texte());
  a.principale.agir();
  const lancer = w.ws.find(x => x.type === 'loggia/robots/lancer');
  assert.deepEqual([lancer.script, lancer.role, lancer.zones], ['script.robot_partout', 'nettoyer_tout', []], '« tout le logement » part par son script, par le serveur');
  assert.deepEqual(w.appels, [], 'rien en direct, jamais `clean_V2`');
  // Un compte ordinaire : rien à régler, aucune ligne.
  const w2 = poser({ etat: avecPieces(PIECES_SON_CAS(false)), retouche: sonCas, ordinaire: true });
  const { accueil: accueil2 } = await fiche(w2);
  assert.deepEqual([accueil2().props.zones, accueil2().props.lignes], [[], []]);
})));

test('sa décision : son `nettoyer_tout` seul, et le bit venu d’une mise à jour avec une association dans Home Assistant — toujours rien ne bascule', () => dans(() => chezLui({ vacuumRooms: ROOMS_SON_CAS, vacuumScripts: SCRIPTS_SON_CAS }, async () => {
  const w3 = poser({ etat: avecPieces({ ...PIECES_ZONES(), source: 'scripts', script_pieces: false }), retouche: (c) => { sonCas(c); c[ASP].attributes.supported_features = 8828 + BIT; } });
  const { accueil: accueil3 } = await fiche(w3);
  assert.deepEqual([accueil3().props.zones, accueil3().props.lignes.map(l => l.cle)], [[], ['designer']]);
})));

test('sa décision : APRÈS — les puces sont ses interrupteurs, le départ passe par son script ; une association dans Home Assistant n’y change rien', () => dans(() => chezLui({ vacuumRooms: ROOMS_SON_CAS, vacuumScripts: { ...SCRIPTS_SON_CAS, pieces_selectionnees: 'script.robot_pieces' } }, async () => {
  const w = poser({ etat: avecPieces(PIECES_SON_CAS(true)), retouche: sonCas });
  const { m, accueil } = await fiche(w);
  let a = accueil().props;
  assert.deepEqual([a.choisir, a.zones.map(z => z.nom), a.lignes], [true, ['Salon', 'Cuisine'], []], 'ses interrupteurs ; sans association dans Home Assistant, rien à dire');
  a.basculerZone(a.zones[0]);
  assert.deepEqual(w.appels, ['input_boolean.turn_on input_boolean.robot_salon'], 'une puce est son interrupteur');
  w.courants['input_boolean.robot_salon'].state = 'on'; m.proprietes({ hass: w.hass() });
  a = accueil().props;
  assert.deepEqual([a.principale.mot, a.zones.filter(z => z.choisie).map(z => z.nom)], ['Nettoyer 1 pièce', ['Salon']]);
  a.principale.agir();
  const lancer = w.ws.find(x => x.type === 'loggia/robots/lancer');
  assert.deepEqual([lancer.script, lancer.role, lancer.zones.map(z => z.nom)], ['script.robot_pieces', 'pieces_selectionnees', ['Salon']]);
})));

test('sa décision : APRÈS, le bit et une association venus d’une mise à jour — les puces restent ses interrupteurs, et la ligne dit pourquoi', () => dans(() => chezLui({ vacuumRooms: ROOMS_SON_CAS, vacuumScripts: { ...SCRIPTS_SON_CAS, pieces_selectionnees: 'script.robot_pieces' } }, async () => {
  const w2 = poser({ etat: avecPieces({ ...PIECES_ZONES(), source: 'scripts', script_pieces: true }), retouche: (c) => { sonCas(c); c[ASP].attributes.supported_features = 8828 + BIT; } });
  const { accueil: accueil2 } = await fiche(w2);
  assert.deepEqual([accueil2().props.zones.map(z => z.nom), accueil2().props.lignes.map(l => l.cle)], [['Salon', 'Cuisine'], ['scripts']]);
})));

/* ASSERTION MODIFIÉE (passe bis 2 du 20/10, relecture de contrôle — le BLOQUANT) : la roue n'écrit plus la description de la maison
 * depuis l'onglet (`cfgSet` depuis un cache vide ou périmé effaçait les dix-neuf autres clés) ; le RÔLE seul part (`loggia/robots/scripts`),
 * le serveur rend l'état et la roue y lit les rôles désignés. */
const scriptsDe = (p) => { const out = []; parcourir(p.props.avant, n => { if (n.type && n.type.name === 'PanneauScripts') out.push(n); }); return out[0]; };
test('la roue : « Scripts de la maison » — une rangée par rôle ; le RÔLE seul part au serveur, qui rend l’état ; chaque refus dit sa raison ; un compte ordinaire lit', () => dans(() => chezLui({ vacuumRooms: ROOMS_SON_CAS, vacuumScripts: SCRIPTS_SON_CAS }, async () => {
  const { cfgVal, setLoggiaState: poserEtat } = await import('../src/state.js');
  const w = poser({ etat: avecPieces(PIECES_SON_CAS(false)), retouche: sonCas });
  const { m, relire } = await fiche(w);
  de(m, 'EnteteFiche').props.onReglages(); m.rendre();
  // Des rangées du panneau des réglages de l'appareil (l'emplacement `avant`), sous la puissance : rien de neuf au démarrage.
  const elem = scriptsDe(de(m, 'PageReglagesAppareil'));
  assert.ok(elem, 'les scripts de la maison, parmi les réglages de l’appareil');
  assert.equal(elem.props.pret, true, 'le composant a répondu : les rangées se règlent');
  const panneau = monter(elem.type, elem.props);
  assert.ok(panneau.texte().includes('Scripts de la maison') && panneau.texte().includes('Désignez vos scripts par rôle'), panneau.texte());
  const listes = panneau.trouver(e => e.type && e.type.name === 'ListeChoix');
  assert.deepEqual(listes.map(l => [l.props.label, l.props.value, !!l.props.disabled]), [
    ['Nettoyer tout le logement', 'script.robot_partout', false], ['Pièces sélectionnées', '', false], ['Mettre en pause', 'script.robot_pause', false],
    ['Reprendre', 'script.robot_reprise', false], ['Retour à la base', 'script.robot_base', false], ['Localiser', 'script.robot_ou', false],
  ], 'six rôles, une ListeChoix chacun — jamais un <select>');
  assert.deepEqual(listes[1].props.options.slice(0, 2).map(o => [o.id, o.label, o.groupe || null]), [['', 'Aucun', null], ['script.robot_base', 'Robot Base', 'Scripts du robot']], '« Aucun », puis les scripts du robot (le préfixe des siens)');
  assert.equal(listes[1].props.options.find(o => o.id === 'script.arroser').groupe, 'Autres scripts');
  // Désigner son script des pièces : le RÔLE seul part — rien de la description, que cet onglet la connaisse ou non.
  poserEtat({ cfg: { loggia_entities: { vacuumRooms: ROOMS_SON_CAS, vacuumScripts: SCRIPTS_SON_CAS, alarm: 'alarm_control_panel.maison' } } });
  listes[1].props.onChange('script.robot_pieces');
  const demande = w.ws.find(x => x.type === 'loggia/robots/scripts');
  assert.ok(demande, 'la commande dédiée, étroite');
  assert.deepEqual([demande.role, demande.script, Object.keys(demande).filter(k => k !== 'ok' && k !== 'ko').sort()], ['pieces_selectionnees', 'script.robot_pieces', ['role', 'script', 'type']], 'le rôle et le script, rien d’autre');
  assert.equal(w.ws.filter(x => x.type === 'loggia/config/set').length, 0, 'plus jamais la description entière par config/set');
  // Le serveur rend l'état, les rôles désignés compris : la roue le lit sur-le-champ ; la description de l'onglet n'a pas bougé.
  const designes = { ...SCRIPTS_SON_CAS, pieces_selectionnees: 'script.robot_pieces' };
  demande.ok(avecPieces({ ...PIECES_SON_CAS(true), scripts: designes }));
  await attendre(); relire();
  assert.deepEqual(scriptsDe(de(m, 'PageReglagesAppareil')).props.scripts, designes, 'la vérité du serveur, dans l’état qu’il rend');
  assert.deepEqual(cfgVal('loggia_entities', null), { vacuumRooms: ROOMS_SON_CAS, vacuumScripts: SCRIPTS_SON_CAS, alarm: 'alarm_control_panel.maison' }, 'l’onglet n’a rien réécrit de son côté');
  // « Aucun » retire le rôle : `script: null`.
  listes[5].props.onChange('');
  const retrait = w.ws.filter(x => x.type === 'loggia/robots/scripts')[1];
  assert.deepEqual([retrait.role, retrait.script], ['localiser', null]);
  // Chaque refus dit SA raison : un compte qui n'est pas administrateur nomme la clé ; un plafond dit « trop volumineux » ; un composant
  // d'avant cette passe « ne répond pas » — plus jamais « réservé aux administrateurs » pour tout.
  for (const [refus, attendu] of [
    [{ code: 'unauthorized', message: 'Unauthorized' }, '« loggia_entities » non enregistré — ce réglage appartient à la maison'],
    [{ code: 'payload_too_large', message: 'valeur trop volumineuse (300000 > 262144 octets) : loggia_entities' }, '« loggia_entities » non enregistré — trop volumineux'],
    [{ code: 'unknown_command', message: 'Unknown command.' }, 'Enregistrement impossible — le composant ne répond pas.'],
  ]) {
    listes[0].props.onChange('script.arroser');
    w.ws.filter(x => x.type === 'loggia/robots/scripts').at(-1).ko(refus);
    await attendre(); await attendre(); panneau.rendre();
    assert.ok(panneau.texte().includes(attendu), refus.code + ' : ' + panneau.texte());
  }
  // Un compte ordinaire lit les rangées, sans ListeChoix (ADR 0144).
  const w2 = poser({ etat: avecPieces(PIECES_SON_CAS(false)), retouche: sonCas, ordinaire: true });
  const { m: m2 } = await fiche(w2);
  de(m2, 'EnteteFiche').props.onReglages(); m2.rendre();
  const elem2 = scriptsDe(de(m2, 'PageReglagesAppareil'));
  const lecture = monter(elem2.type, elem2.props);
  assert.equal(lecture.trouver(e => e.type && e.type.name === 'ListeChoix').length, 0);
  assert.ok(lecture.texte().includes('Robot Partout') && lecture.texte().includes('Aucun'), lecture.texte());
})));

/* TEST AJOUTÉ (passe bis 2 du 20/10, relecture de contrôle — point 1 b) : tant que le composant n'a pas répondu, la roue ATTEND — les
 * rangées désactivées, `aria-disabled`, « … » et non un « Aucun » qui mentirait ; rien ne part. La notion est celle de l'onglet
 * Planning : l'état des robots est là. */
test('la roue en attente : tant que le composant n’a pas répondu, les rangées sont désactivées, disent « … », et rien ne part', () => dans(() => chezLui({ vacuumRooms: ROOMS_SON_CAS, vacuumScripts: SCRIPTS_SON_CAS }, async () => {
  const w = poser({ etat: avecPieces(PIECES_SON_CAS(false)), retouche: sonCas, muet: true });
  const { m } = await fiche(w);
  de(m, 'EnteteFiche').props.onReglages(); m.rendre();
  const elem = scriptsDe(de(m, 'PageReglagesAppareil'));
  assert.equal(elem.props.pret, false);
  const panneau = monter(elem.type, elem.props);
  const listes = panneau.trouver(e => e.type && e.type.name === 'ListeChoix');
  assert.deepEqual(listes.map(l => [l.props.disabled, l.props.value, l.props.options.length, l.props.vide]), Array(6).fill([true, '', 0, '…']), 'désactivées, sans « Aucun »');
  assert.equal(panneau.trouver(e => e.type === 'div' && e.props && e.props['aria-disabled'] === 'true').length, 6, 'chaque rangée se dit en attente');
  listes[1].props.onChange('script.robot_pieces');
  await attendre();
  assert.equal(w.ws.filter(x => x.type === 'loggia/robots/scripts').length, 0, 'rien ne part');
  panneau.rendre();
  assert.ok(panneau.texte().includes('le composant ne répond pas'), panneau.texte());
  // Un compte ordinaire en attente : « … » aussi, jamais un « Aucun » ni un nom qu'on ne sait pas.
  const w2 = poser({ etat: avecPieces(PIECES_SON_CAS(false)), retouche: sonCas, muet: true, ordinaire: true });
  const { m: m2 } = await fiche(w2);
  de(m2, 'EnteteFiche').props.onReglages(); m2.rendre();
  const elem2 = scriptsDe(de(m2, 'PageReglagesAppareil'));
  const lecture = monter(elem2.type, elem2.props);
  assert.ok(lecture.texte().includes('…') && !lecture.texte().includes('Aucun') && !lecture.texte().includes('Robot Partout'), lecture.texte());
})));

test('la roue : pas de scripts de la maison pour un robot qui n’est pas l’aspirateur principal', () => dans(async () => {
  const w = poser();
  const { m } = await fiche(w);
  de(m, 'EnteteFiche').props.onReglages(); m.rendre();
  const out = []; parcourir(de(m, 'PageReglagesAppareil').props.avant, n => { if (n.type && n.type.name === 'PanneauScripts') out.push(n); });
  assert.equal(out.length, 0);
}));

/* TEST AJOUTÉ (petit paquet du 25/10, point 2) : l'aspirateur principal est celui que le SERVEUR retient (`principal` de son état).
 * Deux aspirateurs et rien de nommé : le serveur n'en retient aucun, et ses scripts ne valent pour personne — l'écran, qui prenait le
 * premier aspirateur découvert (`LOGGIA_RESOLVED.vacuum.main`), proposait la roue et partait par des scripts que le serveur ignorait. */
test('petit paquet, point 2 : le principal est celui du serveur — aucun retenu, ni roue ni scripts ; retenu, les deux', () => dans(() => chezLui({ vacuumRooms: ROOMS_SON_CAS, vacuumScripts: SCRIPTS_SON_CAS }, async () => {
  const sansScripts = { ...PIECES_SON_CAS(false), source: 'segments', scripts: {} };
  const w = poser({ etat: { ...avecPieces(sansScripts), principal: null }, retouche: sonCas });
  const { m, accueil } = await fiche(w);
  accueil().props.principale.agir();
  const lancer = w.ws.find(x => x.type === 'loggia/robots/lancer');
  assert.deepEqual([lancer.robot, 'script' in lancer], [ASP, false], 'le service standard, par le serveur : pas le script que le serveur ignorerait');
  de(m, 'EnteteFiche').props.onReglages(); m.rendre();
  assert.equal(scriptsDe(de(m, 'PageReglagesAppareil')), undefined, 'pas de roue des scripts : ils ne seraient à personne');
  // Le serveur le retient : la roue, et son départ par son script.
  const w2 = poser({ etat: { ...avecPieces(PIECES_SON_CAS(false)), principal: ASP }, retouche: sonCas });
  const f2 = await fiche(w2);
  f2.accueil().props.principale.agir();
  assert.deepEqual(w2.ws.filter(x => x.type === 'loggia/robots/lancer').map(x => [x.script, x.role]), [['script.robot_partout', 'nettoyer_tout']]);
  de(f2.m, 'EnteteFiche').props.onReglages(); f2.m.rendre();
  assert.ok(scriptsDe(de(f2.m, 'PageReglagesAppareil')), 'la roue des scripts de la maison');
})));

/* ASSERTION MODIFIÉE (passe bis 2 du 20/10, relecture de contrôle — point 3) : « Localiser » est le geste de la CARTE (`localiserRobot`),
 * partagé et SANS garde — un script gardé bloquait « Nettoyer tout le logement » sept secondes, la puce inerte ; un second appui ne
 * relance pas le script ; « Il bipe » revient à la réponse ; un serveur d'avant (`invalid_format`) ou un script indisponible : `locate`. */
/* ASSERTION MODIFIÉE (25/10, petit paquet robots) : « Localiser » se décide au SERVEUR (`localiser: true`) — son script s'il en désigne un
 * qui répond, sinon `locate` —, d'après la description de la maison sur le disque : l'écran ne lit plus son cache (`cfgVal`) ni
 * l'aspirateur que la découverte prend. Le script indisponible se juge donc au serveur ; un refus du serveur va au toast. */
test('« Localiser » passe par son script quand il en désigne un qui répond — le geste de la carte, sans garde : un seul appui, « Nettoyer tout » reste, « Il bipe » à la réponse ; sinon `locate`', () => dans(() => chezLui({ vacuumRooms: ROOMS_SON_CAS, vacuumScripts: SCRIPTS_SON_CAS }, async () => {
  const { setLoggiaState: poserEtat } = await import('../src/state.js');
  // Le cache de l'onglet ne dit plus rien : vide, « Localiser » part pareil au serveur.
  const chezLuiCarte = () => poserEtat({ cfg: {}, resolved: {} });
  const w = poser({ etat: avecPieces(PIECES_SON_CAS(false)), retouche: sonCas });
  chezLuiCarte();
  const { vue, accueil, relire } = await fiche(w);
  const a = accueil().props;
  assert.equal(a.seconde.mot, 'Localiser');
  a.seconde.agir();
  const lancer = w.ws.find(x => x.type === 'loggia/robots/lancer');
  assert.deepEqual([lancer.localiser, 'script' in lancer, 'role' in lancer, lancer.zones], [true, false, false, []], 'le serveur décide, d’un seul message');
  assert.deepEqual(w.appels, [], 'pas de `vacuum.locate` en plus');
  relire();
  const b = accueil().props;
  assert.deepEqual([b.seconde.enVol, b.seconde.agir, b.principale.mot, !!b.principale.agir, !!b.principale.enVol], [true, null, 'Nettoyer tout le logement', true, false],
    'en vol : la puce ne fait rien, et « Nettoyer tout le logement » reste offert — plus de garde de sept secondes');
  assert.equal(w.ws.filter(x => x.type === 'loggia/robots/lancer').length, 1, 'un second appui ne relance pas le script');
  lancer.ok(avecPieces(PIECES_SON_CAS(false)));
  await attendre(); relire();
  assert.equal(vue.arbre.bipe, true, '« Il bipe : suivez le son » à la réponse');
  assert.equal(accueil().props.etat.mot, 'Il bipe');
  // Un serveur d'avant ce paquet (son schéma refuse `localiser`) : `invalid_format` — `locate` d'ici, sans toast.
  const w2 = poser({ etat: avecPieces(PIECES_SON_CAS(false)), retouche: sonCas });
  chezLuiCarte();
  const f2 = await fiche(w2);
  f2.accueil().props.seconde.agir();
  w2.ws.find(x => x.type === 'loggia/robots/lancer').ko({ code: 'invalid_format', message: 'extra keys not allowed' });
  // Le repli passe par un module charge a la demande : borne, pas deux tours fixes (CI, 25/10).
  await jusqua(() => w2.appels.length > 0);
  assert.deepEqual([w2.appels, w2.rejets], [['vacuum.locate ' + ASP], []], '`locate` à sa place, rien au toast');
  // Un refus du serveur (Home Assistant a refusé `locate`) : au toast, et rien ne part d'ici en plus.
  const w3 = poser({ etat: avecPieces(PIECES_SON_CAS(false)), retouche: sonCas });
  chezLuiCarte();
  const f3 = await fiche(w3);
  f3.accueil().props.seconde.agir();
  w3.ws.find(x => x.type === 'loggia/robots/lancer').ko({ code: 'geste_refuse', message: 'geste refuse par Home Assistant : ' + ASP });
  // Le toast passe par un module charge a la demande : borne, pas deux tours fixes (CI, 25/10).
  await jusqua(() => w3.rejets.length > 0);
  assert.deepEqual([w3.appels, w3.rejets.map(e => e.code)], [[], ['geste_refuse']], 'le refus au toast, pas de `locate` en douce');
})));

test('point 2 : un passage d’avant s’édite — ses zones d’alors se montrent, et une puce d’une autre forme remplace l’ancienne ; `invalid_format` se dit traduit', () => dans(async () => {
  const etat = ETAT();
  etat.config.plannings.push({ id: 'ancien', robot: ASP, heure: '18:00', jours: [5], zones: [{ id: 'seg:3', nom: 'Bureau d’alors', segments: [3] }], actif: true });
  const w = poser({ etat: avecPieces(PIECES_ZONES(), etat) });
  const { m } = await fiche(w);
  de(m, 'FicheOnglets').props.onChoisir('planning'); m.rendre();
  const onglet = de(m, 'OngletPlanning');
  const mp = monter(onglet.type, onglet.props);
  const bouton = mp.trouver(e => e.type === 'button' && typeof e.props['aria-label'] === 'string' && e.props['aria-label'].includes('Bureau d’alors'))[0];
  assert.ok(bouton, 'le passage d’avant s’ouvre');
  mp.appuyer(bouton);
  const feuille = mp.trouver(e => e.type && e.type.name === 'FeuillePlanning')[0];
  const mf = monter(feuille.type, feuille.props);
  const puces = () => { const inner = mf.arbre.props.children(() => {}); const out = []; parcourir(inner, n => { if (n.type && n.type.name === 'Puce') out.push(n); }); return out; };
  assert.deepEqual(puces().map(p => [texteDe(p), p.props.on]), [['Cuisine', false], ['Salon', false], ['Bureau', false], ['Bureau d’alors', true]], 'les zones de Home Assistant, puis la zone d’alors, choisie');
  mf.appuyer(puces()[0]);
  assert.deepEqual(puces().map(p => [texteDe(p), p.props.on]), [['Cuisine', true], ['Salon', false], ['Bureau', false]], 'une zone de Home Assistant REMPLACE la forme d’avant — plus de mélange');
  // Le serveur refuse quand même une forme (`invalid_format`) : une phrase traduite, jamais le motif brut.
  onglet.props.planning.setErr('');
  const boutons = []; parcourir(mf.arbre.props.children(() => {}), n => { if (n.type === 'button' && texteDe(n) === 'Enregistrer') boutons.push(n); });
  boutons[0].props.onClick(); mp.rendre(); m.rendre();
  const config = w.ws.find(x => x.type === 'loggia/robots/config');
  assert.ok(config, 'l’enregistrement part au serveur');
  config.ko({ code: 'invalid_format', message: 'un passage vise des zones de Home Assistant ou des segments, pas les deux' });
  await jusqua(() => { m.rendre(); return !!de(m, 'OngletPlanning').props.planning.err; });
  assert.equal(de(m, 'OngletPlanning').props.planning.err, 'Passage non enregistré — sa forme n’est pas celle que le composant attend.');
}));

test('point 6 : le plan reçoit le nombre de pièces du ROBOT, pas le nombre de zones', () => dans(async () => {
  const pieces = PIECES_ZONES();
  pieces.zones[1].segments = ['m1_1', 'm1_7'];
  const w = poser({ etat: avecPieces(pieces) });
  const { m, accueil } = await fiche(w);
  accueil().props.ouvrirCarte(); m.rendre();
  const enfants = [].concat(m.arbre.props.children).filter(Boolean);
  const feuille = enfants[enfants.length - 1].props.children(() => {});
  const plans = [];
  parcourir(feuille, n => { if (n.props && n.props.haid === CARTE) plans.push(n); });
  assert.deepEqual([plans[0].props.zones.length, plans[0].props.nPieces], [3, 4], 'trois zones, quatre pièces sur la carte');
}));

test('R7 : le plan coloré reprend de lui-même une association écrite par segment, quand une seule zone y répond — un administrateur, une fois', () => dans(async () => {
  const VP = await import('../src/vacplan.jsx');
  const { cfgVal } = await import('../src/state.js');
  const zones = [{ id: 'zone:cuisine', name: 'Cuisine', color: 'var(--o-cyan)', segments: ['m1_2'] }, { id: 'zone:salon', name: 'Salon', color: 'var(--o-cold)', segments: ['m1_1'] }];
  const w = poser();
  setLoggiaState({ cfg: { loggia_vacplan: { aabbcc: 'seg:1', ddeeff: 'seg:9', 112233: 'zone:cuisine' } } });
  monter(VP.default, { hass: w.hass(), haid: CARTE, zones, selection: {}, onToggle: () => {} });
  await attendre();
  // ASSERTION MODIFIÉE (passe bis du 20/10, point 6) : `seg:9`, sans zone (un autre étage, un autre aspirateur), RESTE.
  assert.deepEqual(cfgVal('loggia_vacplan', null), { aabbcc: 'zone:salon', ddeeff: 'seg:9', 112233: 'zone:cuisine' }, '`seg:1` → la zone du segment « m1_1 » ; `seg:9`, sans zone, reste ; une zone reste');
  // Un compte ordinaire ne peut pas écrire la configuration de la maison : rien ne bouge.
  setLoggiaState({ cfg: { loggia_vacplan: { aabbcc: 'seg:1' } } });
  const w2 = poser({ ordinaire: true });
  setLoggiaState({ cfg: { loggia_vacplan: { aabbcc: 'seg:1' } } });
  monter(VP.default, { hass: w2.hass(), haid: CARTE, zones, selection: {}, onToggle: () => {} });
  await attendre();
  assert.deepEqual(cfgVal('loggia_vacplan', null), { aabbcc: 'seg:1' });
  // Sans zones de Home Assistant — ce que le robot publie, un serveur d'avant — : rien ne bouge non plus.
  const w3 = poser();
  setLoggiaState({ cfg: { loggia_vacplan: { aabbcc: 'seg:1' } } });
  monter(VP.default, { hass: w3.hass(), haid: CARTE, zones: [{ id: 'seg:1', name: 'Salon', segments: [1] }], selection: {}, onToggle: () => {} });
  await attendre();
  assert.deepEqual(cfgVal('loggia_vacplan', null), { aabbcc: 'seg:1' });
}));
