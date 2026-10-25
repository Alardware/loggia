/* La vue Nuit (ADR 0261 ; A2, A7).
 *
 *  - un réglage refusé REVIENT : la puce avançait avant l'appel et restait sur
 *    le réglage refusé jusqu'au sondage suivant — le patron d'`ecrireRegle(…,
 *    { annuler })` (refus.js) ; le refus se dit, et nomme sa clé ;
 *  - les lampes proposées sont les lumières de la maison (`lumieresDe`) :
 *    le switch déclaré lumière compris, sans la LED d'une borne Wi-Fi.
 * On JOUE la vue (tests/crochets.mjs). */
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
const N = await import(new URL('../src/views/nuit.jsx', import.meta.url).href);
const { setLoggiaState } = await import('../src/state.js');

const st = (id, state, attributes = {}) => [id, { entity_id: id, state, attributes }];
const maison = () => Object.fromEntries([
  st('light.bureau', 'on', { friendly_name: 'Bureau', supported_color_modes: ['brightness'], supported_features: 32 }),
  st('light.borne_voyant', 'on', { friendly_name: 'Voyant', supported_color_modes: ['onoff'] }),
  st('switch.applique', 'on', { friendly_name: 'Applique' }),
  st('switch.prise_nas', 'on', { friendly_name: 'NAS' }),
]);
const NUIT = () => ({ config: { veilleuse: { actif: true, lampes: ['light.bureau'], duree: 60, fondu: 5, depuis: '19:00' }, coucher: { actif: false }, eclairage: { actif: false } }, en_cours: [], eclairees: {} });

function poser({ config = () => Promise.resolve({ config: NUIT().config }) } = {}) {
  setLoggiaState({ index: { entityMeta: new Map([['light.borne_voyant', { category: 'config' }]]), areaList: [] }, ent: { switchLights: ['switch.applique'] }, cfg: {}, resolved: null });
  const ecrits = [];
  const hass = { states: maison(), callWS: (m) => {
    if (m.type === 'loggia/nuit/etat') return Promise.resolve(NUIT());
    if (m.type === 'loggia/nuit/config') { ecrits.push(m.patch); return config(m.patch); }
    return Promise.resolve({});
  } };
  return { ecrits, hass };
}
async function dans(fn) {
  const h = horlogeFausse(), d = documentFaux();
  h.installer(); d.installer();
  try { return await fn(d); } finally { h.restaurer(); d.restaurer(); setLoggiaState({ index: null, ent: {}, cfg: {}, resolved: null }); }
}
const attendre = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
const entete = (m, nom) => m.trouver(e => e.type && e.type.name === 'RegleEntete' && e.props.nom === nom)[0];

test('A7 : un réglage refusé revient tout de suite, et le refus nomme sa clé', () => dans(async () => {
  const w = poser({ config: () => Promise.reject({ code: 'unauthorized', message: 'Unauthorized' }) });
  const m = monter(N.NuitReglages, { hass: w.hass, cardSt: {} });
  await attendre();
  m.rendre();
  assert.equal(entete(m, 'Veilleuse').props.on, true, 'la règle lue : la veilleuse est active');
  m.appuyer(entete(m, 'Veilleuse'), 'cb');
  assert.equal(entete(m, 'Veilleuse').props.on, false, 'l’écran avance avant la réponse');
  assert.deepEqual(w.ecrits, [{ veilleuse: { actif: false } }]);
  await attendre();
  m.rendre();
  assert.equal(entete(m, 'Veilleuse').props.on, true, 'refusé : l’écran revient, sans attendre le sondage');
  assert.ok(m.texte().includes('« loggia_nuit » non enregistré'), 'le refus se dit et nomme sa clé : ' + m.texte().slice(-160));
  m.demonter();
}));

test('A7 : une écriture qui prend garde ce que le serveur rend', () => dans(async () => {
  const w = poser({ config: (patch) => Promise.resolve({ config: { ...NUIT().config, veilleuse: { ...NUIT().config.veilleuse, ...patch.veilleuse } } }) });
  const m = monter(N.NuitReglages, { hass: w.hass, cardSt: {} });
  await attendre();
  m.rendre();
  m.appuyer(entete(m, 'Veilleuse'), 'cb');
  await attendre();
  m.rendre();
  assert.equal(entete(m, 'Veilleuse').props.on, false);
  assert.ok(!m.texte().includes('non enregistré'));
  m.demonter();
}));

test('A2 : les lampes proposées sont les lumières de la maison — le switch déclaré y est, la LED de la borne et la prise n’y sont pas', () => dans(async () => {
  const w = poser();
  const m = monter(N.NuitReglages, { hass: w.hass, cardSt: {} });
  await attendre();
  m.rendre();
  const puces = m.trouver(e => e.type === 'button' && typeof e.props.title === 'string' && /fondu/.test(e.props.title));
  assert.deepEqual(puces.map(p => p.props.children), ['Applique', 'Bureau']);
  assert.deepEqual(puces.map(p => p.props.title), ['Ne sait pas faire de fondu', 'Sait faire un fondu'], 'un switch ne sait pas le fondu');
  m.demonter();
}));
