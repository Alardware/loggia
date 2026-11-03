/* Les médias restants (lot 12 du rapport Gladys, M1, M2, M3 ; ADR 0316).
 *
 *  - M1 : Volume − et + sur le pavé de la télécommande, seulement si la table de CETTE intégration les a ; un geste, une touche.
 *  - M2 : l'annonce d'une enceinte Cast par `tts.speak`, avec un moteur de synthèse de la maison ; le premier, ou un menu s'il y en a
 *    plusieurs ; rien ne part sans le geste « Annoncer ».
 *  - M3 : « Écrire sur la TV » pendant que l'Apple TV attend du texte (son binaire `keyboard_focused`, rattaché par l'appareil, reconnu
 *    au drapeau `clavier` que pose le composant) ; le texte part par `apple_tv.set_keyboard_text`, sur « Envoyer » seulement.
 *
 * On JOUE la fiche comme tests/fiche_media.test.mjs : la vue de sa carte, ses briques, sur les lecteurs de la démo, avec un `hass`
 * dont les services appelés sont notés — jamais un service réel. */
process.env.TZ = 'Europe/Paris';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';

import { monter, horlogeFausse, documentFaux, texteDe } from './crochets.mjs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);
register('data:text/javascript,' + encodeURIComponent([
  'export async function load(url, ctx, next) {',
  "  if (!url.endsWith('/src/App.jsx?medias_restants')) return next(url, ctx);",
  "  const r = await next(url.slice(0, -'?medias_restants'.length), ctx);",
  "  return { ...r, source: String(r.source) + ';export { useVueLecteur, BRIQUES_MEDIA };' };",
  '}',
].join('\n')));
const { setLoggiaState } = await import('../src/state.js');
const F = await import(new URL('../src/App.jsx?medias_restants', import.meta.url).href);
const C = (await import(new URL('../src/fichemedia.jsx', import.meta.url).href)).default;
const E = await import('../src/lecteuretat.js');
const V = await import('../src/voixmedia.js');
const { TOUCHES_TV, telecommandePour } = await import('../src/telecommande.js');
const { maisonMediasDemo } = await import('../src/demo.js');
const { buildIndex, capabilities } = await import('../src/discovery.js');
const { resolveMedia } = await import('../src/resolve.js');
const lire = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const QUAND = new Date(2026, 9, 17, 20, 40, 0, 0).getTime();
const ATV = 'media_player.apple_tv_chambre', CLAVIER = 'binary_sensor.apple_tv_chambre_clavier', ENTREE = 'entree-atv-essai';
const CAST = 'media_player.enceinte_essai';
const SERVICE_CLAVIER = { apple_tv: { set_keyboard_text: { fields: ['config_entry_id', 'text'] } } };

/* La maison de la démo, appariée comme l'écran l'apparie. `plus` : des entités de registre en plus (le clavier, l'enceinte Cast),
 * `etats` : leurs états, `services` : ce que l'installation sait faire, `integrationAtv` : l'intégration de l'appareil de l'Apple TV. */
function poser({ plus = [], etats = {}, services = {}, integrationAtv = null } = {}) {
  const m = maisonMediasDemo({ quand: QUAND });
  const courants = { ...m.states, ...etats };
  const r = m.index();
  const devices = r.devices.map(d => ({ ...d, area_id: d.area, entry_type: d.entry_type, integration: integrationAtv && d.id === 'apple_tv_chambre' ? integrationAtv : d.integration }));
  const entities = [...r.entities.map(e => ({ entity_id: e.id, device_id: e.device, area_id: e.area, entity_category: e.category, name: e.name, device_class: e.device_class, platform: integrationAtv && e.device === 'apple_tv_chambre' ? integrationAtv : e.platform, translation_key: e.key || null })), ...plus];
  const ix = buildIndex({ areas: r.areas.map(a => ({ area_id: a.id, name: a.name })), devices, entities, states: courants, services });
  const media = resolveMedia({ index: ix, caps: capabilities({ states: courants, index: ix }), states: courants });
  setLoggiaState({ index: ix, ent: {}, cfg: {}, resolved: { media } });
  E.reglerLecteurs();
  const appels = [];
  let refuser = false;
  const hass = () => ({ states: Object.fromEntries(Object.entries(courants).map(([k, v]) => [k, { ...v, attributes: { ...v.attributes } }])),
    callService: (d, s, data) => { appels.push({ s: d + '.' + s, data }); return refuser ? Promise.reject(new Error('refusé')) : Promise.resolve(); } });
  return { appels, courants, hass, refuser: (x) => { refuser = x; } };
}
async function dans(fn) {
  const h = horlogeFausse(), d = documentFaux();
  h.installer(); d.installer();
  globalThis.document.documentElement = { classList: { contains: () => false } };
  const memoire = new Map();
  const avant = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: { getItem: (k) => (memoire.has(k) ? memoire.get(k) : null), setItem: (k, v) => { memoire.set(k, String(v)); }, removeItem: (k) => { memoire.delete(k); } } });
  const maintenant = Date.now;
  Date.now = () => QUAND;
  try { return await fn({ h, d }); } finally {
    Date.now = maintenant;
    h.restaurer(); d.restaurer();
    if (avant) Object.defineProperty(globalThis, 'localStorage', avant); else delete globalThis.localStorage;
  }
}
const Fiche = ({ hass, id }) => C({ id, vue: F.useVueLecteur(hass, id), briques: F.BRIQUES_MEDIA, onFiche: () => {}, glyphe: null, epingle: null, maintenant: QUAND });
const fiche = (w, id) => monter(Fiche, { hass: w.hass(), id });
const de = (m, nom) => m.trouver(e => e.type && e.type.name === nom);
const sous = (m, nom) => { const el = de(m, nom)[0]; assert.ok(el, nom + ' : le panneau manque'); return monter(el.type, el.props); };
const bouton = (m, nom) => m.trouver(e => e.type === 'button' && (e.props['aria-label'] === nom || e.props.title === nom || texteDe(e) === nom))[0];
const champ = (m) => m.trouver(e => e.type === 'input')[0];
const taper = (m, t) => { champ(m).props.onChange({ target: { value: t } }); m.rendre(); };
const touche = (el, key) => el.props.onKeyDown({ key, preventDefault() {}, stopPropagation() {} });
const reponse = async (m) => { for (let i = 0; i < 4; i++) await Promise.resolve(); m.rendre(); };
// Le pavé : le panneau de la TV, ouvert sur la télécommande.
const pave = (m) => { const pt = sous(m, 'PanneauTv'); const [seg] = de(pt, 'Segment'); if (seg) { seg.props.onChange('tele'); pt.rendre(); } return pt; };

/* ── M1 : Volume − et + ─────────────────────────────────────────────────── */

test('M1 : le pavé de l’Apple TV a Volume − et Volume + ; un geste envoie UNE touche, `volume_down` ou `volume_up`, par sa télécommande', () => dans(() => {
  const w = poser();
  const pt = pave(fiche(w, ATV));
  assert.ok(bouton(pt, 'Volume −') && bouton(pt, 'Volume +'), 'les deux touches');
  w.appels.length = 0;
  pt.appuyer(bouton(pt, 'Volume −'));
  assert.deepEqual(w.appels, [{ s: 'remote.send_command', data: { entity_id: 'remote.apple_tv_chambre', command: 'volume_down' } }]);
  w.appels.length = 0;
  pt.appuyer(bouton(pt, 'Volume +'));
  assert.deepEqual(w.appels, [{ s: 'remote.send_command', data: { entity_id: 'remote.apple_tv_chambre', command: 'volume_up' } }]);
}));

test('M1 : une télécommande dont la table n’a pas le volume (LG) n’a ni Volume − ni Volume + ; les autres touches restent', () => dans(() => {
  assert.equal(TOUCHES_TV.webostv.vol_plus, null, 'témoin : LG n’a pas de touche de volume');
  assert.ok(telecommandePour('webostv', null).gestes.indexOf('vol_plus') < 0);
  const w = poser({ integrationAtv: 'webostv' });
  const pt = pave(fiche(w, ATV));
  assert.ok(bouton(pt, 'Retour') && bouton(pt, 'Accueil'), 'témoin : la télécommande de LG est bien dessinée');
  assert.ok(!bouton(pt, 'Volume −') && !bouton(pt, 'Volume +'));
}));

test('M1 : rien ne part sans geste — ouvrir la fiche et la télécommande n’appelle aucun service', () => dans(() => {
  const w = poser();
  pave(fiche(w, ATV));
  assert.deepEqual(w.appels, []);
}));

/* ── M3 : écrire sur la TV ──────────────────────────────────────────────── */

const avecClavier = (etat = 'on', { services = SERVICE_CLAVIER, appareil = 'apple_tv_chambre', clavier = ENTREE } = {}) => ({
  plus: [{ entity_id: CLAVIER, device_id: appareil, area_id: null, entity_category: null, name: 'Clavier', device_class: null, platform: 'apple_tv', translation_key: 'keyboard_focused', clavier }],
  etats: { [CLAVIER]: { state: etat, attributes: { friendly_name: 'Clavier' } } },
  services,
});

test('M3 : pendant que l’Apple TV attend du texte, « Écrire sur la TV » ; « Envoyer » écrit par `apple_tv.set_keyboard_text` et son entrée de configuration', async () => dans(async () => {
  const w = poser(avecClavier('on'));
  const pt = sous(fiche(w, ATV), 'PanneauTv');
  const ecr = sous(pt, 'EcrireTv');
  assert.ok(ecr.texte().includes('Écrire sur la TV'));
  // Taper n'envoie rien : seulement « Envoyer » ou Entrée.
  taper(ecr, 'Le bureau des légendes');
  assert.deepEqual(w.appels, [], 'rien ne part à la frappe');
  ecr.appuyer(bouton(ecr, 'Envoyer'));
  assert.deepEqual(w.appels, [{ s: 'apple_tv.set_keyboard_text', data: { config_entry_id: ENTREE, text: 'Le bureau des légendes' } }]);
  await reponse(ecr);
  assert.ok(ecr.texte().includes('Écrit sur la TV : « Le bureau des légendes »'));
  assert.equal(champ(ecr).props.value, '', 'le champ se vide une fois écrit');
  // Entrée envoie aussi ; un champ vide n'envoie rien.
  w.appels.length = 0;
  touche(champ(ecr), 'Enter');
  assert.deepEqual(w.appels, [], 'vide : rien');
  taper(ecr, 'Arte');
  touche(champ(ecr), 'Enter');
  assert.equal(w.appels.length, 1);
}));

test('M3 : un refus se dit, et le texte reste dans le champ', async () => dans(async () => {
  const w = poser(avecClavier('on'));
  w.refuser(true);
  const ecr = sous(sous(fiche(w, ATV), 'PanneauTv'), 'EcrireTv');
  taper(ecr, 'Arte');
  ecr.appuyer(bouton(ecr, 'Envoyer'));
  await reponse(ecr);
  assert.ok(ecr.texte().includes('Home Assistant a refusé.'));
  assert.equal(champ(ecr).props.value, 'Arte');
}));

test('M3 : sans focus, sans le service, sur un autre appareil ou sans le drapeau du composant, pas de champ', () => dans(() => {
  const cas = {
    'focus à off': avecClavier('off'),
    'service absent (Home Assistant d’avant le printemps 2026)': avecClavier('on', { services: {} }),
    'autre appareil': avecClavier('on', { appareil: 'echo_cuisine' }),
    'sans drapeau': avecClavier('on', { clavier: null }),
  };
  for (const [nom, x] of Object.entries(cas)) {
    const pt = sous(fiche(poser(x), ATV), 'PanneauTv');
    assert.equal(de(pt, 'EcrireTv').length, 0, nom);
  }
  // Témoin : tout réuni, le champ est là.
  assert.equal(de(sous(fiche(poser(avecClavier('on')), ATV), 'PanneauTv'), 'EcrireTv').length, 1);
}));

test('M3 : `clavierDe` rattache par l’appareil et lit le drapeau, jamais le nom ; `appelClavier` refuse un texte vide', () => {
  const meta = new Map([
    ['media_player.tv', { deviceId: 'd1' }],
    ['binary_sensor.tv_keyboard_focus', { deviceId: 'd2', clavier: 'e2' }],
    ['binary_sensor.x', { deviceId: 'd1', clavier: 'e1' }],
  ]);
  const ix = { entityMeta: meta, services: SERVICE_CLAVIER };
  const S = { 'binary_sensor.x': { state: 'on' }, 'binary_sensor.tv_keyboard_focus': { state: 'on' } };
  assert.deepEqual(V.clavierDe('media_player.tv', S, ix), { capteur: 'binary_sensor.x', entree: 'e1' });
  assert.equal(V.clavierDe('media_player.tv', { 'binary_sensor.x': { state: 'off' } }, ix), null);
  assert.equal(V.clavierDe('media_player.inconnu', S, ix), null);
  assert.equal(V.appelClavier('e1', '   '), null);
  assert.equal(V.appelClavier(null, 'a'), null);
});

test('M3 : le composant pose le drapeau ; l’index de l’écran le garde, et seulement lui', () => {
  const py = lire('custom_components/loggia/discovery.py');
  assert.ok(/e\.platform == "apple_tv"[\s\S]{0,120}"keyboard_focused"[\s\S]{0,120}entree\["clavier"\] = e\.config_entry_id/.test(py));
  const ix = buildIndex({ entities: [{ entity_id: CLAVIER, platform: 'apple_tv', clavier: ENTREE }, { entity_id: 'media_player.x', platform: 'apple_tv' }], states: {} });
  assert.equal(ix.entityMeta.get(CLAVIER).clavier, ENTREE);
  assert.equal(ix.entityMeta.get('media_player.x').clavier, null);
});

/* ── M2 : l'annonce d'une enceinte Cast ─────────────────────────────────── */

const enceinte = (moteurs = ['tts.piper'], { plateforme = 'cast', bits = 21437 } = {}) => ({
  plus: [{ entity_id: CAST, device_id: null, area_id: null, entity_category: null, name: 'Enceinte', device_class: 'speaker', platform: plateforme, translation_key: null }],
  etats: {
    [CAST]: { state: 'idle', attributes: { friendly_name: 'Enceinte', supported_features: bits, volume_level: 0.3, device_class: 'speaker' } },
    ...Object.fromEntries(moteurs.map((id, i) => [id, { state: i === 0 ? 'unknown' : '2026-10-01T10:00:00+00:00', attributes: { friendly_name: { 'tts.piper': 'piper', 'tts.home_assistant_cloud': 'Home Assistant Cloud', 'tts.panne': 'En panne' }[id] || id } }])),
  },
});

test('M2 : une enceinte Cast et un moteur — le panneau « Annonce », sans menu ; « Annoncer » envoie `tts.speak` sur CE lecteur', async () => dans(async () => {
  const w = poser(enceinte(['tts.piper']));
  const m = fiche(w, CAST);
  const pv = sous(m, 'PanneauVoix');
  assert.equal(de(pv, 'ListeChoix').length, 0, 'un seul moteur : pas de menu');
  taper(pv, 'Le repas est prêt');
  assert.deepEqual(w.appels, [], 'rien ne part à la frappe');
  pv.appuyer(bouton(pv, 'Annoncer'));
  assert.deepEqual(w.appels, [{ s: 'tts.speak', data: { entity_id: 'tts.piper', media_player_entity_id: CAST, message: 'Le repas est prêt' } }]);
  await reponse(pv);
  assert.ok(pv.texte().includes('Annoncé sur Enceinte : « Le repas est prêt »'));
  assert.equal(E.annonceDe(CAST), 'Le repas est prêt', 'la carte l’écrit six secondes');
}));

test('M2 : une annonce toute prête part sur son geste ; une seule en vol', async () => dans(async () => {
  const w = poser(enceinte(['tts.piper']));
  const pv = sous(fiche(w, CAST), 'PanneauVoix');
  pv.appuyer(bouton(pv, 'À table !'));
  pv.appuyer(bouton(pv, 'Je rentre bientôt'));
  assert.deepEqual(w.appels.map(a => a.data.message), ['À table !'], 'la seconde attend la réponse de la première');
}));

test('M2 : plusieurs moteurs — un `ListeChoix` « Voix », le premier par ordre de nom choisi ; le choix change le moteur', () => dans(() => {
  const w = poser(enceinte(['tts.piper', 'tts.home_assistant_cloud']));
  const pv = sous(fiche(w, CAST), 'PanneauVoix');
  const [liste] = de(pv, 'ListeChoix');
  assert.ok(liste, 'le menu de la maison, jamais un <select>');
  assert.equal(liste.props.label, 'Voix');
  assert.deepEqual(liste.props.options.map(o => o.label), ['Home Assistant Cloud', 'piper']);
  assert.equal(liste.props.value, 'tts.home_assistant_cloud');
  liste.props.onChange('tts.piper'); pv.rendre();
  taper(pv, 'Bonsoir');
  pv.appuyer(bouton(pv, 'Annoncer'));
  assert.equal(w.appels[0].data.entity_id, 'tts.piper');
}));

test('M2 : un refus se dit', async () => dans(async () => {
  const w = poser(enceinte(['tts.piper']));
  w.refuser(true);
  const pv = sous(fiche(w, CAST), 'PanneauVoix');
  taper(pv, 'Bonsoir');
  pv.appuyer(bouton(pv, 'Annoncer'));
  await reponse(pv);
  assert.ok(pv.texte().includes('Home Assistant a refusé.'));
}));

test('M2 : pas de panneau sans moteur, sur une autre plateforme, sans le bit PLAY_MEDIA, ni sur une Echo ou l’Apple TV', () => dans(() => {
  const cas = {
    'aucun moteur': enceinte([]),
    'moteur indisponible': (() => { const x = enceinte(['tts.panne']); x.etats['tts.panne'].state = 'unavailable'; return x; })(),
    'autre plateforme': enceinte(['tts.piper'], { plateforme: 'sonos_essai' }),
    'sans PLAY_MEDIA': enceinte(['tts.piper'], { bits: 21437 & ~512 }),
  };
  for (const [nom, x] of Object.entries(cas)) assert.equal(de(fiche(poser(x), CAST), 'PanneauVoix').length, 0, nom);
  assert.equal(de(fiche(poser(enceinte(['tts.piper'])), ATV), 'PanneauVoix').length, 0, 'l’Apple TV');
  assert.equal(de(fiche(poser(enceinte(['tts.piper'])), 'media_player.echo_cuisine'), 'PanneauVoix').length, 0, 'une Echo garde Alexa');
  assert.equal(de(fiche(poser(enceinte(['tts.piper'])), CAST), 'PanneauVoix').length, 1, 'témoin');
}));

test('M2 : `moteursVoix` garde un moteur `unknown` (il n’a encore rien dit), retire `unavailable` ; `appelVoix` refuse un texte vide', () => {
  const S = { 'tts.a': { state: 'unknown', attributes: { friendly_name: 'B' } }, 'tts.b': { state: 'unavailable', attributes: {} }, 'tts.c': { state: '2026-01-01', attributes: { friendly_name: 'A' } }, 'media_player.x': { state: 'on' } };
  assert.deepEqual(V.moteursVoix(S).map(m => m.id), ['tts.c', 'tts.a']);
  assert.equal(V.appelVoix('tts.a', CAST, '  '), null);
  assert.equal(V.litUneVoix('cast'), true);
  assert.equal(V.litUneVoix('apple_tv'), false);
});

/* ── Le poids : tout se charge avec la fiche ─────────────────────────────── */

test('ADR 0316 : voixmedia.js n’est importé que par la fiche du lecteur, chargée à la demande', () => {
  const fiches = lire('src/appareils/fiches.jsx');
  assert.ok(/lazyRecharge\(\(\) => import\('\.\.\/fichemedia\.jsx'\)\)/.test(fiches), 'la fiche est à la demande');
  assert.ok(lire('src/fichemedia.jsx').includes("from './voixmedia.js'"));
  for (const f of ['src/App.jsx', 'src/resolve.js', 'src/state.js', 'src/cartes/media.jsx', 'src/telecommande.js']) assert.ok(!lire(f).includes('voixmedia'), f);
});
