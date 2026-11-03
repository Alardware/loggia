// Les caméras qui disent quoi (lot 8 Gladys, ADR 0312) : D19, C1, C2.
//
//   - ce que la caméra a VU se trouve par la clé de traduction de l'intégration,
//     le nom n'étant qu'un repli pour une entité sans clé : l'alarme de voiture
//     (un son) n'est plus un véhicule, et l'animal existe ;
//   - le colis et l'appui sur la sonnette, des entités `event`, vont au journal
//     de l'écran et dans « En ce moment », jusqu'à « Vu » ou leur heure ;
//   - en option, décochée, la caméra de la sonnette s'ouvre en grand 60 s.
// Les identifiants ci-dessous sont inventés : aucun nom de l'installation.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { MONOLITHE } from './monolithe.mjs'; // App.jsx et ce qui en est sorti (ADR 0282)

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);

const { resolveCameras, CLES_DETECTION } = await import('../src/resolve.js');
const { buildIndex, capabilities } = await import('../src/discovery.js');
const E = await import('../src/evenement.js');
const { setLoggiaState } = await import('../src/state.js');
const { deriveNotifs } = await import('../src/app/derive.jsx');
const { etatJournal } = await import('../src/historique.jsx');
const G = await import('../src/sonnettegrand.jsx');
const lire = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

// Une caméra à sonnette à la UniFi Protect : ses binaires et ses `event`, avec leurs clés.
const ent = (entity_id, device_id, key = null, dc = null, extra = {}) => ({ entity_id, device_id, translation_key: key, device_class: dc, platform: 'unifiprotect', ...extra });
function maison({ entites = null, etats = {} } = {}) {
  const entities = entites || [
    ent('camera.porte_flux', 'd_porte'),
    ent('binary_sensor.porte_mouvement', 'd_porte', null, 'motion'),
    // L'alarme de voiture entendue VIENT AVANT le véhicule vu, dans l'ordre alphabétique comme dans le registre.
    ent('binary_sensor.porte_alarme_de_voiture_detectee', 'd_porte', 'car_alarm_detected'),
    ent('binary_sensor.porte_personne_detectee', 'd_porte', 'person_detected'),
    ent('binary_sensor.porte_vehicle_detected', 'd_porte', 'vehicle_detected'),
    ent('binary_sensor.porte_animal_detected', 'd_porte', 'animal_detected'),
    ent('binary_sensor.porte_barking_detected', 'd_porte', 'barking_detected'),
    ent('binary_sensor.porte_sonnette', 'd_porte', 'doorbell', 'occupancy'),
    ent('event.porte_doorbell', 'd_porte', 'doorbell', 'doorbell'),
    ent('event.porte_colis', 'd_porte', 'package'),
    // La détection intelligente sait dire « package » parmi d'autres : ce n'est pas l'entité du colis.
    ent('event.porte_detection_intelligente', 'd_porte', 'smart_detection'),
    ent('event.porte_vehicle', 'd_porte', 'vehicle'),
  ];
  const states = { 'camera.porte_flux': { entity_id: 'camera.porte_flux', state: 'idle', attributes: { friendly_name: 'Porte' } } };
  entities.forEach(e => { if (!states[e.entity_id]) states[e.entity_id] = { entity_id: e.entity_id, state: 'off', attributes: e.device_class ? { device_class: e.device_class } : {} }; });
  Object.assign(states, etats);
  const index = buildIndex({ devices: [{ id: 'd_porte', name: 'Porte' }, { id: 'd_bouton', name: 'Bouton' }], entities, states });
  return { index, states, caps: capabilities({ states, index }) };
}
const MAINTENANT = Date.parse('2026-11-01T14:30:00Z');
const iso = (minAvant) => new Date(MAINTENANT - minAvant * 60000).toISOString();
const ev = (id, quand) => ({ [id]: { entity_id: id, state: quand, attributes: {} } });

test('D19 : l’alarme de voiture entendue n’est plus un véhicule ; le véhicule se trouve à sa clé', () => {
  const m = maison();
  const cam = resolveCameras({ index: m.index, caps: m.caps, states: m.states }).list[0];
  assert.equal(cam.vehicle, 'binary_sensor.porte_vehicle_detected');
  assert.equal(cam.person, 'binary_sensor.porte_personne_detectee');
  assert.equal(cam.sonnette, 'binary_sensor.porte_sonnette');
  assert.equal(cam.motion, 'binary_sensor.porte_mouvement');
  assert.deepEqual(CLES_DETECTION.vehicle, ['vehicle_detected', 'vehicle']);
});

test('D19 : sans véhicule vu, l’alarme de voiture ne le remplace pas (une clé étrangère ne passe jamais par le nom)', () => {
  const m = maison({ entites: [ent('camera.porte_flux', 'd_porte'), ent('binary_sensor.porte_alarme_de_voiture_detectee', 'd_porte', 'car_alarm_detected')] });
  const cam = resolveCameras({ index: m.index, caps: m.caps, states: m.states }).list[0];
  assert.equal(cam.vehicle, null);
});

test('D19 : une entité nommée par son intégration n’est jamais reprise par le nom, même sans rien d’entendu', () => {
  // La clé `face_detected` n'est pas une des nôtres : son identifiant dit « personne », ce n'est pas la personne vue.
  const m = maison({ entites: [ent('camera.porte_flux', 'd_porte'), ent('binary_sensor.porte_personne_reconnue', 'd_porte', 'face_detected')] });
  assert.equal(resolveCameras({ index: m.index, caps: m.caps, states: m.states }).list[0].person, null);
});

test('C1 : l’animal existe, trouvé à sa clé ; l’aboiement entendu n’en est pas un', () => {
  const m = maison();
  assert.equal(resolveCameras({ index: m.index, caps: m.caps, states: m.states }).list[0].animal, 'binary_sensor.porte_animal_detected');
  const sans = maison({ entites: [ent('camera.porte_flux', 'd_porte'), ent('binary_sensor.porte_barking_detected', 'd_porte', 'barking_detected')] });
  assert.equal(resolveCameras({ index: sans.index, caps: sans.caps, states: sans.states }).list[0].animal, null);
});

test('repli : une intégration sans clé garde la reconnaissance par le nom, sauf ce qu’on entend', () => {
  const nu = (id) => ent(id, 'd_porte', null, null, { platform: 'autre' });
  // L'alarme « vehicle » vient AVANT la voiture dans l'index : seul le repli qui saute ce qu'on entend l'écarte.
  const m = maison({ entites: [nu('camera.porte_flux'), nu('binary_sensor.porte_car_alarm_vehicle'), nu('binary_sensor.porte_personne'), nu('binary_sensor.porte_voiture'),
    nu('binary_sensor.porte_animal'), nu('binary_sensor.porte_colis')] });
  const cam = resolveCameras({ index: m.index, caps: m.caps, states: m.states }).list[0];
  assert.equal(cam.person, 'binary_sensor.porte_personne');
  assert.equal(cam.vehicle, 'binary_sensor.porte_voiture', 'l’alarme « vehicle » est un son : le repli la saute');
  assert.equal(cam.animal, 'binary_sensor.porte_animal');
  assert.equal(cam.colis, 'binary_sensor.porte_colis');
});

test('C1 : la liste de l’utilisateur reçoit aussi l’animal du même appareil', () => {
  const m = maison();
  const cam = resolveCameras({ index: m.index, caps: m.caps, states: m.states, userCfg: { loggia_cameras: [{ haid: 'camera.porte_flux', name: 'Porte' }] } }).list[0];
  assert.equal(cam.animal, 'binary_sensor.porte_animal_detected');
});

test('C1 : l’animal se dit là où la personne et le véhicule se disent', () => {
  assert.deepEqual(E.detecteursDe({ person: 'binary_sensor.p', animal: 'binary_sensor.a' }).map(d => d.genre), ['person', 'animal']);
  assert.equal(E.ICONES_DETECTION.animal, 'paw');
  assert.equal(E.libelleDetection('animal', true), 'Animal détecté');
  assert.equal(E.libelleDetection('animal'), 'Animal');
  const S = { 'binary_sensor.a': { state: 'on', last_changed: iso(1) } };
  assert.equal(E.evenementCamera({ animal: 'binary_sensor.a', motion: 'binary_sensor.m' }, S, {}).genre, 'animal');
  // La vue Sécurité et les clés du sondage le transmettent.
  assert.ok(lire('src/views/securite.jsx').includes('animal: c.animal'));
  assert.ok(MONOLITHE.includes('c.vehicle, c.animal, c.sonnette, c.colis'));
});

test('C1 / C2 : les `event` de la porte — la sonnette à sa classe, le colis à sa clé, rien d’autre', () => {
  const m = maison();
  const evs = E.evenementsPorte(m.index);
  assert.deepEqual(evs.map(e => [e.id, e.genre, e.camera]), [
    ['event.porte_colis', 'colis', 'camera.porte_flux'],
    ['event.porte_doorbell', 'sonnette', 'camera.porte_flux'],
  ], 'ni la détection intelligente, ni le véhicule');
  assert.equal(evs[0].appareil, 'Porte');
  assert.equal(E.evenementsPorte(m.index), evs, 'calculé une fois par index');
  assert.deepEqual(E.evenementsPorte(null), []);
});

test('C1 : un colis reconnu au nom seul ne compte que sur l’appareil d’une caméra ; une entité cachée ne compte pas', () => {
  const m = maison({ entites: [
    ent('event.bouton_colis', 'd_bouton', null, null, { platform: 'autre' }),
    ent('camera.porte_flux', 'd_porte'), ent('event.porte_parcel', 'd_porte', null, null, { platform: 'autre' }),
    ent('event.porte_doorbell', 'd_porte', 'doorbell', 'doorbell', { hidden_by: 'user' }),
  ] });
  assert.deepEqual(E.evenementsPorte(m.index).map(e => e.id), ['event.porte_parcel']);
});

test('C1 / C2 : la ligne vit 30 min pour un appui, 12 h pour un colis, jusqu’à « Vu »', () => {
  const evs = [{ id: 'event.s', genre: 'sonnette', camera: 'camera.c' }, { id: 'event.c', genre: 'colis', camera: 'camera.c' }];
  const S = { ...ev('event.s', iso(29)), ...ev('event.c', iso(11 * 60)) };
  const l = E.lignesPorte(evs, S, {}, MAINTENANT);
  assert.deepEqual(l.map(x => x.genre), ['sonnette', 'colis'], 'le plus récent d’abord');
  assert.equal(l[0].cle, 'porte:event.s:' + Date.parse(iso(29)));
  assert.deepEqual(E.lignesPorte(evs, { ...ev('event.s', iso(31)), ...ev('event.c', iso(12 * 60 + 1)) }, {}, MAINTENANT), [], 'passé leur heure');
  // Vu : l'instant retenu ; un appui suivant revient.
  assert.deepEqual(E.lignesPorte(evs, S, { 'event.s': Date.parse(iso(29)) }, MAINTENANT).map(x => x.genre), ['colis']);
  assert.deepEqual(E.lignesPorte(evs, { ...S, ...ev('event.s', iso(2)) }, { 'event.s': Date.parse(iso(29)) }, MAINTENANT).map(x => x.genre), ['sonnette', 'colis']);
  // Muet, illisible ou dans le futur : rien.
  for (const st of ['unknown', 'unavailable', 'demain', iso(-5)]) assert.deepEqual(E.lignesPorte(evs.slice(0, 1), ev('event.s', st), {}, MAINTENANT), [], st);
});

test('C1 / C2 : « Un colis déposé à 14:12 », « On a sonné à 14:12 »', () => {
  const quand = Date.parse('2026-11-01T14:12:00');
  assert.equal(E.textePorte({ genre: 'colis', quand }, 'fr-FR'), 'Un colis déposé à 14:12');
  assert.equal(E.textePorte({ genre: 'sonnette', quand }, 'fr-FR'), 'On a sonné à 14:12');
  assert.deepEqual(E.marquerVu({ x: 1 }, { id: 'event.s', quand: 5 }), { x: 1, 'event.s': 5 });
  assert.deepEqual(E.lireVus(), {}, 'sans stockage : rien de vu');
});

test('journal : l’appui et le colis entrent au journal de l’écran, une entrée par événement', () => {
  const m = maison();
  setLoggiaState({ index: m.index });
  try {
    const maintenant = Date.now();
    const at = (min) => new Date(maintenant - min * 60000).toISOString();
    const notifs = deriveNotifs({ states: { ...ev('event.porte_doorbell', at(2)), ...ev('event.porte_colis', at(60)) } });
    const porte = notifs.filter(n => n.k.indexOf('porte:') === 0);
    assert.deepEqual(porte.map(n => n.t), ['Sonnette', 'Colis']);
    assert.ok(/^On a sonné à \d\d:\d\d · Porte$/.test(porte[0].m), porte[0].m);
    assert.ok(/^Un colis déposé à \d\d:\d\d · Porte$/.test(porte[1].m), porte[1].m);
    assert.equal(deriveNotifs({ states: ev('event.porte_doorbell', at(45)) }).filter(n => n.k.indexOf('porte:') === 0).length, 0, 'un appui de 45 min n’entre plus');
  } finally { setLoggiaState({ index: null }); }
  // Rien au téléphone : aucune clé de la porte parmi les textes du serveur.
  const tel = lire('scripts/textes_serveur.mjs');
  assert.ok(!tel.includes('On a sonné') && !tel.includes('Un colis déposé'));
});

test('journal de la sécurité : la sonnette et le colis y figurent, dits « Détecté »', () => {
  assert.equal(etatJournal('event.porte_doorbell', iso(2), {}), 'Détecté');
  const sec = lire('src/views/securite.jsx');
  assert.ok(sec.includes('...evenementsPorte(LOGGIA_INDEX).map(e => e.id)'));
});

test('rail : « En ce moment » montre la porte avec « Vu », et l’écran sonde ces entités partout', () => {
  const dash = lire('src/accueil/dashboard.jsx');
  assert.ok(dash.includes('lignesPorte(evenementsPorte(LOGGIA_INDEX), S0, vusPorte)'));
  assert.ok(dash.includes("action={tr('Vu')} actionIcone=\"check\" onAction={() => setVusPorte(v => marquerVu(v, p))}"));
  assert.ok(MONOLITHE.includes('...evenementsPorte(loggiaRuntime.index).flatMap(e => [e.id, cameraPorte('), 'les clés globales du sondage');
});

test('C2 : un appui NEUF seulement — la première lecture apprend, un rechargement ne rejoue rien', () => {
  const evs = [{ id: 'event.s', genre: 'sonnette', camera: 'camera.c', deviceId: 'd' }];
  const t = (s) => MAINTENANT - s * 1000;
  let r = G.appuiNeuf(evs, ev('event.s', new Date(t(5)).toISOString()), null, MAINTENANT);
  assert.equal(r.appui, null, 'première lecture');
  r = G.appuiNeuf(evs, ev('event.s', new Date(t(5)).toISOString()), r.connus, MAINTENANT);
  assert.equal(r.appui, null, 'même instant');
  const neuf = G.appuiNeuf(evs, ev('event.s', new Date(t(3)).toISOString()), r.connus, MAINTENANT);
  assert.equal(neuf.appui.id, 'event.s');
  assert.equal(neuf.appui.camera, 'camera.c');
  assert.equal(G.appuiNeuf(evs, ev('event.s', new Date(t(61)).toISOString()), r.connus, MAINTENANT).appui, null, 'plus de 60 s');
  assert.equal(G.appuiNeuf([{ ...evs[0], camera: null }], ev('event.s', new Date(t(3)).toISOString()), r.connus, MAINTENANT).appui, null, 'sans caméra');
  // Une sonnette absente des états n'apprend rien : sa première apparition ne s'ouvre pas.
  const vide = G.appuiNeuf(evs, {}, null, MAINTENANT);
  assert.equal(G.appuiNeuf(evs, ev('event.s', new Date(t(3)).toISOString()), vide.connus, MAINTENANT).appui, null);
  // Le colis n'ouvre jamais la caméra.
  assert.equal(G.appuiNeuf([{ ...evs[0], genre: 'colis' }], ev('event.s', new Date(t(3)).toISOString()), { 'event.s': null }, MAINTENANT).appui, null);
});

test('C2 : l’option est décochée par défaut, par écran, et tout ce qu’elle fait se charge à la demande', () => {
  assert.equal(E.sonnetteEnGrand(), false);
  assert.equal(G.DUREE_EN_GRAND, 60000);
  const app = MONOLITHE;
  assert.ok(app.includes("const SonnetteGrand = lazyRecharge(() => import('./sonnettegrand.jsx'));"));
  assert.ok(app.includes('{sonnetteEnGrand() && <Suspense fallback={null}><SonnetteGrand hass={hass} onAppui={setAppuiSonnette} /></Suspense>}'), 'montée sur l’écran qui l’a cochée, et lui seul');
  assert.ok(app.includes('{idle && ambient > 0 && plageOk && !appuiSonnette && '), 'la veille s’efface pendant ses 60 s');
  const grand = lire('src/sonnettegrand.jsx');
  assert.ok(grand.includes("if (r.appui && document.visibilityState !== 'hidden') setAppui(r.appui);"), 'un écran caché ne s’ouvre pas');
  assert.ok(grand.includes('<CamSheet haid={cam}') && !grand.includes('commanderService') && !grand.includes('callService'), 'la fiche telle quelle, aucune commande');
  const par = lire('src/views/parametres.jsx');
  assert.ok(par.includes('const [camSonnette, setCamSonnette] = useState(sonnetteEnGrand);'));
  assert.ok(par.includes("{aSonnette && ("), 'proposée seulement s’il y a une sonnette à caméra');
});

test('démo : un appui de sonnette et un colis sur la caméra de l’entrée', async () => {
  const demo = lire('src/demo.js');
  assert.ok(demo.includes("'event.camera_entree_sonnette': s(PORTE_DEMO.sonnette(), { friendly_name: 'Caméra entrée Sonnette', device_class: 'doorbell'"));
  assert.ok(demo.includes("'event.camera_entree_colis': s(PORTE_DEMO.colis()"));
  assert.ok(demo.includes("id === 'event.camera_entree_colis' ? { key: 'package' }"));
  assert.ok(demo.includes('event\\.camera_entree_)/.test(id) ? \'cam_entree\''));
});
