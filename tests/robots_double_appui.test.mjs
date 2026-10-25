/* TEST AJOUTÉ (passe bis 2 du 18/10, points B, D, E, F, G, H et N) — la relecture de contrôle de la passe bis, ses huit scénarios
 * (S1 à S8), joués sur la carte, la compacte, la popup et la fiche universelle d'un robot (tests/crochets.mjs). Ce qu'elle cherchait :
 * un chemin où deux appuis relancent encore, un geste qui ne se lève pas, un geste légitime bloqué. Ce qui est garanti :
 *  - S1 (point G) : un geste confirmé l'est pour de bon — la maison revenue à la phase d'avant ne le réarme pas ;
 *  - S2 (point H) : « Base » pendant le vol d'un départ ne laisse ni la carte ni la compacte sans puce ;
 *  - S3 (point F) : le refus tardif d'un départ ne fait pas tomber le geste qui l'a remplacé ;
 *  - S4 (point E) : tant que le serveur n'a pas répondu, la puce n'offre pas un second départ — au-delà du filet de 7 s ;
 *  - S5, S6, S8 : la popup — un départ, la carte et la popup ensemble, l'expiration popup fermée ;
 *  - S7 (point B) : la fiche universelle (« L'appareil ») passe par la vue de la carte — un seul service au double appui ;
 *  - point D : une tondeuse à aires dont aucune n'est allumée n'offre pas « Démarrer », sa phrase le dit, et rien ne part.
 * Sous `?robots_double_appui`, App.jsx exporte la carte, sa vue, la compacte et la fiche universelle — le fichier n'est pas touché. Le
 * serveur (`loggia/robots/etat`, `loggia/robots/lancer`) est doublé ; l'heure est celle de la maquette, samedi 17/10/2026, 18:20. La
 * sonde de la relecture (S4) appelait `.ko` sur le second départ qu'elle interdisait : corrigé ici, son assertion gardée. */
process.env.TZ = 'Europe/Paris';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

import { monter, horlogeFausse, documentFaux } from './crochets.mjs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);
register('data:text/javascript,' + encodeURIComponent([
  'export async function load(url, ctx, next) {',
  "  if (!url.endsWith('/src/App.jsx?robots_double_appui')) return next(url, ctx);",
  "  const r = await next(url.slice(0, -'?robots_double_appui'.length), ctx);",
  "  return { ...r, source: String(r.source) + ';export { RoomRobotCard, useVueRobot, CvCard, FicheMachineHero };' };",
  '}',
].join('\n')));
const { setLoggiaState } = await import('../src/state.js');
const F = await import(new URL('../src/App.jsx?robots_double_appui', import.meta.url).href);
const FR = await import(new URL('../src/ficherobot.jsx', import.meta.url).href);
const RE = await import('../src/robotsetat.js');
const { texteRefus } = await import('../src/refus.js');

const T = new Date(2026, 9, 17, 18, 20).getTime();
const ASP = 'vacuum.aspirateur', TOND = 'lawn_mower.tondeuse';
const AVANT = 'switch.tondeuse_zone_avant', ARRIERE = 'switch.tondeuse_zone_arriere';
const st = (id, state, attributes = {}) => ({ entity_id: id, state, last_changed: new Date(2026, 9, 17, 16, 40).toISOString(), last_updated: new Date(2026, 9, 17, 16, 40).toISOString(), attributes });
const META = new Map([
  [ASP, { deviceId: 'd1', device: 'Aspirateur', platform: 'ecovacs' }],
  [TOND, { deviceId: 'd2', device: 'Tondeuse', platform: 'mammotion' }],
  [AVANT, { deviceId: 'd2', device: 'Tondeuse', platform: 'mammotion', translationKey: 'area' }],
  [ARRIERE, { deviceId: 'd2', device: 'Tondeuse', platform: 'mammotion', translationKey: 'area' }],
]);
const ETAT = () => ({ meteo: null, journal: [], erreurs: {}, en_cours: {}, passages: [], config: { plannings: [], robots: {} } });
/* La maison doublée : chaque lecture de `hass` est un objet neuf, les services sont notés ; `loggia/robots/lancer` attend que le test
 * réponde (`ok`, `ko`) ; le canal du toast se lit dans `rejets`. */
function poser({ retouche = null } = {}) {
  const courants = {
    [ASP]: st(ASP, 'docked', { friendly_name: 'Aspirateur', battery_level: 92, supported_features: 8828 }),
    [TOND]: st(TOND, 'docked', { friendly_name: 'Tondeuse', battery_level: 64, supported_features: 7 }),
    [AVANT]: st(AVANT, 'off', { friendly_name: 'Tondeuse Zone Pelouse avant' }),
    [ARRIERE]: st(ARRIERE, 'on', { friendly_name: 'Tondeuse Zone Pelouse arrière' }),
  };
  if (retouche) retouche(courants);
  setLoggiaState({ index: { entityMeta: META, deviceMeta: new Map(), areaList: [], areaNameOf: () => null, services: null }, ent: {}, cfg: {}, resolved: {} });
  const appels = [], ws = [], rejets = [];
  const serveur = {
    callWS: (msg) => {
      if (msg.type === 'loggia/robots/etat') { ws.push(msg); return Promise.resolve(ETAT()); }
      return new Promise((ok, ko) => ws.push({ ...msg, ok, ko }));
    },
  };
  RE.reglerRobotsEtat({ hass: serveur, signaler: (e) => rejets.push(e) });
  const hass = () => ({ ...serveur, states: Object.fromEntries(Object.entries(courants).map(([k, v]) => [k, { ...v, attributes: { ...v.attributes } }])),
    callApi: () => Promise.resolve([]),
    callService: (d, s, data, cible) => { appels.push(d + '.' + s + ' ' + [].concat((cible && cible.entity_id) || (data && data.entity_id)).join(',')); return Promise.resolve(); } });
  return { appels, ws, rejets, courants, hass };
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
const puces = (m) => m.trouver(e => e.type === 'button' && /^(Démarrer|Localiser|Pause|Reprendre|Base) /.test(e.props['aria-label'] || ''));
const puce = (m, mot) => puces(m).find(b => b.props['aria-label'].startsWith(mot + ' '));
const etat = (m) => puces(m).map(b => b.props.title + (b.props['aria-disabled'] ? '·en vol' : ''));
const carte = async (w, id) => { const m = monter(F.RoomRobotCard, { id, hass: w.hass(), onOpen: () => {} }); await attendre(); m.rendre(); return m; };
const compacte = async (w, id) => { const m = monter(F.CvCard, { id, hass: w.hass(), onOpen: () => {}, dense: true }); await attendre(); m.rendre(); return m; };
const mini = (m) => m.trouver(e => e.type === 'button' && /^(Démarrer|Pause|Reprendre|Base|Localiser) /.test(e.props['aria-label'] || '')).map(b => b.props['aria-label'] + (b.props['aria-disabled'] ? '·en vol' : ''));
const phrase = (m) => m.trouver(e => e.props && typeof e.props.className === 'string' && e.props.className.split(' ').indexOf('o-gab-phrase') >= 0)[0].props.children;
async function fiche(w, id) {
  const domaine = id.split('.')[0];
  const vue = monter((p) => F.useVueRobot(p.hass, p.id, null, true, { rapide: true }), { hass: w.hass(), id });
  await attendre(); vue.rendre();
  const m = monter(FR.default, { hass: w.hass(), idRobot: id, domaine, vue: vue.arbre, plaque: { fond: 'x', encre: 'y' }, sousNom: 'x', epingle: null, onFiche: () => {} });
  const relire = () => { vue.proprietes({ hass: w.hass() }); m.proprietes({ vue: vue.arbre, hass: w.hass() }); };
  return { m, vue, relire, accueil: () => m.trouver(e => e.type && e.type.name === 'OngletAccueil')[0].props };
}

test('S1 (point G) : confirmé, puis relancé ailleurs — le geste ne se réarme pas, la carte dit ce que la maison dit', () => dans(async ({ h }) => {
  const w = poser({ retouche: (c) => { c[TOND].state = 'mowing'; } });
  const m = await carte(w, TOND);
  m.appuyer(puce(m, 'Pause'));
  w.courants[TOND].state = 'paused'; // Home Assistant confirme
  h.avancer(1600); m.proprietes({ hass: w.hass() });
  assert.deepEqual(etat(m), ['Reprendre', 'Base'], 'confirmé, sa tenue passée');
  w.courants[TOND].state = 'mowing'; // l'application du fabricant, ou un autre écran, la relance
  h.avancer(1400); m.proprietes({ hass: w.hass() });
  assert.deepEqual([etat(m), phrase(m)], [['Pause', 'Base'], 'Tonte en cours'], 'elle tond : « Pause », pas une pause en vol réarmée');
  m.appuyer(puce(m, 'Pause'));
  assert.deepEqual(w.appels, ['lawn_mower.pause ' + TOND, 'lawn_mower.pause ' + TOND], 'une seconde pause, légitime, part');
}));

test('S2 (point H) : « Base » pendant le vol d’un départ, le robot encore sur sa base — la carte et la compacte gardent une puce', () => dans(async () => {
  const w = poser();
  const m = await carte(w, ASP);
  m.appuyer(puce(m, 'Démarrer')); m.rendre();
  assert.deepEqual(etat(m), ['Démarrer·en vol', 'Base']);
  m.appuyer(puce(m, 'Base')); await attendre(); m.rendre();
  assert.deepEqual(etat(m), ['Base·en vol'], 'la base, en vol, à sa place');
  assert.deepEqual(w.appels, ['vacuum.return_to_base ' + ASP]);
  const c = await compacte(w, ASP);
  assert.deepEqual(mini(c), ['Base Aspirateur·en vol'], 'la compacte aussi : son geste en vol, choisi, qui ne fait rien');
  c.appuyer(c.trouver(e => e.type === 'button' && /^Base /.test(e.props['aria-label'] || ''))[0]);
  assert.equal(w.appels.length, 1, 'la puce en vol ne fait rien');
}));

test('S3 (point F) : le refus TARDIF d’un départ ne fait pas tomber la pause posée après lui', () => dans(async ({ h }) => {
  const w = poser();
  const m = await carte(w, ASP);
  m.appuyer(puce(m, 'Démarrer'));
  const lancer = w.ws.find(x => x.type === 'loggia/robots/lancer');
  w.courants[ASP].state = 'cleaning'; // le robot est parti, la réponse du serveur traîne
  h.avancer(1600); m.proprietes({ hass: w.hass() });
  m.appuyer(puce(m, 'Pause')); m.rendre();
  assert.deepEqual(etat(m), ['Pause·en vol', 'Base']);
  lancer.ko({ code: 'commande_refusee', message: 'commande refusee' });
  await jusqua(() => w.rejets.length > 0); m.rendre();
  assert.deepEqual(w.rejets.map(e => e.code), ['commande_refusee'], 'le refus va au toast');
  m.appuyer(puce(m, 'Pause'));
  assert.deepEqual(etat(m), ['Pause·en vol', 'Base'], 'la pause, posée après le départ, reste en vol');
  assert.deepEqual(w.appels, ['vacuum.pause ' + ASP], 'une seule pause');
}));

test('S4 (point E) : au-delà du filet de 7 s, tant que le serveur n’a pas répondu, la puce n’offre pas un second départ', () => dans(async ({ h }) => {
  const w = poser();
  const m = await carte(w, ASP);
  m.appuyer(puce(m, 'Démarrer'));
  h.avancer(7100); m.rendre();
  assert.deepEqual(etat(m), ['Démarrer·en vol', 'Base'], 'le serveur n’a pas répondu : le départ est toujours en vol');
  m.appuyer(puce(m, 'Démarrer'));
  const departs = w.ws.filter(x => x.type === 'loggia/robots/lancer');
  assert.equal(departs.length, 1, 'tant que le premier départ n’a pas répondu, la puce n’en offre pas un second');
  // Il répond enfin : la garde lâche, et son filet — la latence du robot et un relevé — commence là.
  departs[0].ok(ETAT());
  await attendre(); await attendre();
  h.avancer(6999); m.rendre();
  assert.deepEqual(etat(m), ['Démarrer·en vol', 'Base']);
  h.avancer(1); m.rendre();
  assert.deepEqual(etat(m), ['Démarrer', 'Localiser'], 'le filet passé, sans réponse du robot : la maison fait foi');
  // Jamais de réponse : la garde est bornée.
  const w2 = poser();
  const m2 = await carte(w2, ASP);
  m2.appuyer(puce(m2, 'Démarrer'));
  h.avancer(RE.GARDE_DEPART_MS - 1); m2.rendre();
  assert.deepEqual(etat(m2), ['Démarrer·en vol', 'Base']);
  h.avancer(1); m2.rendre();
  assert.deepEqual(etat(m2), ['Démarrer', 'Localiser'], 'bornée : elle lâche quand même');
}));

test('S5 : la popup de la tondeuse — « Tondre tout le jardin » deux fois, un seul départ ; refusé, la puce revient', () => dans(async () => {
  const w = poser();
  const f = await fiche(w, TOND);
  f.accueil().toutPrendre(); f.m.rendre();
  const p = f.accueil().principale;
  assert.equal(p.mot, 'Tondre tout le jardin');
  p.agir(); p.agir();
  f.relire();
  assert.deepEqual([f.accueil().principale.mot, f.accueil().principale.enVol, f.accueil().principale.agir], ['Tondre tout le jardin', true, null]);
  const l = w.ws.filter(x => x.type === 'loggia/robots/lancer');
  assert.equal(l.length, 1, 'un seul départ');
  l[0].ko({ code: 'deja_en_route', message: 'x' });
  await jusqua(() => w.rejets.length > 0); f.relire();
  assert.ok(f.accueil().principale && typeof f.accueil().principale.agir === 'function', 'refusé : la puce revient');
}));

test('S6 : la carte et la popup ouvertes ensemble — la pause de la carte fige la principale de la popup ; la base reste permise', () => dans(async () => {
  const w = poser({ retouche: (c) => { c[TOND].state = 'mowing'; } });
  const m = await carte(w, TOND);
  const f = await fiche(w, TOND);
  m.appuyer(puce(m, 'Pause'));
  f.relire();
  const a = f.accueil();
  assert.deepEqual([a.principale.mot, a.principale.enVol, a.principale.agir], ['Mettre en pause', true, null]);
  a.seconde.agir();
  assert.deepEqual(w.appels, ['lawn_mower.pause ' + TOND, 'lawn_mower.dock ' + TOND]);
}));

test('S7 (point B) : la fiche universelle (« L’appareil ») passe par la vue de la carte — Home Assistant rapide, un seul service', () => dans(async () => {
  const w = poser({ retouche: (c) => { c[TOND].state = 'mowing'; } });
  const m = monter(F.FicheMachineHero, { id: TOND, hass: w.hass() });
  await attendre(); m.rendre();
  const bouton = () => m.trouver(e => e.type === 'button' && /^(Pause|Lancer la tonte)$/.test(e.props['aria-label'] || ''))[0];
  assert.deepEqual(m.trouver(e => e.type === 'button' && e.props['aria-label']).map(b => b.props['aria-label']), ['Pause', 'Renvoyer au dock']);
  m.appuyer(bouton());
  w.courants[TOND].state = 'paused'; // une intégration locale qui répond en 200 ms
  m.proprietes({ hass: w.hass() });
  assert.equal(bouton().props['aria-disabled'], 'true', 'la puce reste « Pause », en cours');
  m.appuyer(bouton());
  assert.deepEqual(w.appels, ['lawn_mower.pause ' + TOND], 'deux appuis rapprochés, un seul service');
  // Le départ de la fiche universelle part par le serveur, gardé, plus jamais en direct.
  const w2 = poser();
  const m2 = monter(F.FicheMachineHero, { id: ASP, hass: w2.hass() });
  await attendre(); m2.rendre();
  assert.deepEqual(m2.trouver(e => e.type === 'button' && e.props['aria-label']).map(b => b.props['aria-label']), ['Démarrer le nettoyage', 'Localiser']);
  const demarrer = m2.trouver(e => e.type === 'button' && e.props['aria-label'] === 'Démarrer le nettoyage')[0];
  m2.appuyer(demarrer); m2.appuyer(demarrer);
  assert.deepEqual([w2.ws.filter(x => x.type === 'loggia/robots/lancer').length, w2.appels], [1, []], 'un seul départ, par le serveur');
  // Sa batterie se lit comme ailleurs : bornée, vide = inconnue — pas de cadran.
  const w3 = poser({ retouche: (c) => { c[ASP].attributes.battery_level = ''; } });
  const m3 = monter(F.FicheMachineHero, { id: ASP, hass: w3.hass() });
  await attendre(); m3.rendre();
  assert.equal(m3.trouver(e => e.type && e.type.name === 'CadranGradue').length, 0, 'une batterie vide est inconnue : pas de cadran à zéro');
  const w4 = poser({ retouche: (c) => { c[ASP].attributes.battery_level = 130; } });
  const m4 = monter(F.FicheMachineHero, { id: ASP, hass: w4.hass() });
  await attendre(); m4.rendre();
  assert.equal(m4.trouver(e => e.type && e.type.name === 'CadranGradue')[0].props.valeur, 100, 'bornée à 100');
}));

test('S8 : le geste expire aussi popup fermée et robot muet — rien ne reste au magasin passé le filet', () => dans(async ({ h }) => {
  const w = poser({ retouche: (c) => { c[ASP].state = 'cleaning'; } });
  const f = await fiche(w, ASP);
  f.accueil().principale.agir();
  f.m.demonter(); f.vue.demonter(); // la popup se ferme
  w.courants[ASP].state = 'unavailable';
  h.avancer(7000);
  assert.deepEqual(RE.lireGestes(), {}, 'le magasin est vide');
}));

test('point D : la tondeuse sans aire allumée — ni « Démarrer » ni départ, sa phrase le dit ; une aire allumée, « Démarrer » revient', () => dans(async () => {
  const w = poser({ retouche: (c) => { c[ARRIERE].state = 'off'; } });
  const m = await carte(w, TOND);
  assert.deepEqual([etat(m), phrase(m)], [[], 'Aucune zone allumée'], 'rien d’inerte : la ligne de commandes ne garde que ce qui reste possible');
  const c = await compacte(w, TOND);
  assert.deepEqual(mini(c), [], 'la compacte non plus');
  assert.ok(c.texte().includes('Aucune zone allumée'));
  const hero = monter(F.FicheMachineHero, { id: TOND, hass: w.hass() });
  await attendre(); hero.rendre();
  assert.equal(hero.trouver(e => e.type === 'button' && e.props['aria-label'] === 'Lancer la tonte').length, 0, 'ni la fiche universelle');
  assert.deepEqual([w.appels, w.ws.filter(x => x.type === 'loggia/robots/lancer').length], [[], 0]);
  // Une aire s'allume : « Démarrer » revient, et il part par le serveur.
  w.courants[AVANT].state = 'on';
  m.proprietes({ hass: w.hass() });
  assert.deepEqual([etat(m), phrase(m)], [['Démarrer'], 'Sur la base']);
  m.appuyer(puce(m, 'Démarrer'));
  assert.equal(w.ws.filter(x => x.type === 'loggia/robots/lancer').length, 1);
  // Le serveur la refuse si un autre écran l'a éteinte entre-temps : sa phrase.
  w.ws.find(x => x.type === 'loggia/robots/lancer').ko({ code: 'aucune_aire', message: 'aucune zone allumee : ' + TOND });
  await jusqua(() => w.rejets.length > 0);
  assert.equal(texteRefus(w.rejets[0]), 'Départ non lancé — aucune zone allumée : choisissez-en une dans la fiche');
  // Arrêtée dans le jardin : rentrer reste possible.
  const w2 = poser({ retouche: (k) => { k[ARRIERE].state = 'off'; k[TOND].state = 'idle'; } });
  assert.deepEqual(etat(await carte(w2, TOND)), ['Base']);
}));
