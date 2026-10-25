/* Le repli des Scènes sans script (ADR 0261 ; L2, L11).
 *
 * Sans script Hue désigné, « Éteindre », « Blanc chaud » et la luminosité d'une
 * ambiance agissent sur les lumières de la maison (`lumieresDe` : ni la LED
 * d'une borne, ni un groupe en double, le switch déclaré compris), veilleuses
 * épargnées. « Blanc chaud » n'éteint plus : il allume en blanc chaud les
 * lampes qui savent le blanc, chacune bornée à son propre blanc, et n'envoie
 * rien aux autres. On JOUE la section (tests/crochets.mjs). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';

import { monter, horlogeFausse, documentFaux } from './crochets.mjs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
// La section demande les vignettes Hue par `new Image()` : Node n'en a pas, et rien ne doit partir.
globalThis.Image = class { set src(v) { this._src = v; } };
register('./jsx-hooks.mjs', import.meta.url);
const SC = await import(new URL('../src/scenes.jsx', import.meta.url).href);
const { setLoggiaState } = await import('../src/state.js');

const st = (id, state, attributes = {}) => [id, { entity_id: id, state, last_changed: '2026-10-14T18:00:00.000Z', attributes }];
/* Sa maison, en petit : un variateur, une ampoule blanche (2 200 à 6 500 K), une froide (3 000 K au plus chaud), la veilleuse
 * (blancs et couleurs), la LED de la borne Wi-Fi, le switch déclaré lumière, une prise ordinaire, un groupe des deux premières. */
const maison = () => Object.fromEntries([
  st('light.bureau', 'on', { supported_color_modes: ['brightness'], brightness: 200 }),
  st('light.ampoule', 'on', { supported_color_modes: ['color_temp'], min_color_temp_kelvin: 2200, max_color_temp_kelvin: 6500 }),
  st('light.froide', 'off', { supported_color_modes: ['color_temp'], min_color_temp_kelvin: 3000, max_color_temp_kelvin: 6500 }),
  st('light.veilleuse', 'on', { supported_color_modes: ['color_temp', 'xy'], min_color_temp_kelvin: 2000, max_color_temp_kelvin: 6535 }),
  st('light.borne_voyant', 'on', { supported_color_modes: ['onoff'] }),
  st('light.groupe', 'on', { supported_color_modes: ['brightness'], entity_id: ['light.bureau', 'light.ampoule'] }),
  st('switch.applique', 'on'), st('switch.prise_nas', 'on'),
]);
const NUIT = { config: { veilleuse: { actif: true, lampes: ['light.veilleuse'] } } };

function poser({ nuit = () => Promise.resolve(NUIT) } = {}) {
  setLoggiaState({ index: { entityMeta: new Map([['light.borne_voyant', { category: 'config' }]]) }, ent: { switchLights: ['switch.applique'] }, cfg: {}, resolved: null });
  const appels = [];
  const hass = { states: maison(), callWS: (m) => (m.type === 'loggia/nuit/etat' ? nuit() : Promise.resolve({})),
    callService: (d, s, data, cible) => { appels.push([d + '.' + s, (cible && cible.entity_id) || (data && data.entity_id), ...Object.entries(data || {}).filter(([k]) => k !== 'entity_id').map(([k, v]) => k + '=' + v)].join(' ')); return Promise.resolve(); } };
  return { appels, hass };
}
async function dans(fn) {
  const h = horlogeFausse(), d = documentFaux();
  h.installer(); d.installer();
  try { return await fn(d); } finally { h.restaurer(); d.restaurer(); setLoggiaState({ index: null, ent: {}, cfg: {}, resolved: null }); }
}
const attendre = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
const bouton = (m, nom) => m.trouver(e => e.type === 'button' && e.props['aria-label'] === nom)[0];

test('« Éteindre » sans script : les lumières de la maison, veilleuse épargnée — ni la LED, ni la prise, ni le groupe en double ; le switch déclaré par homeassistant', () => dans(async () => {
  const w = poser();
  const m = monter(SC.default, { hass: w.hass });
  await attendre();
  m.rendre();
  m.appuyer(bouton(m, 'Éteindre'));
  // Un ordre par domaine, les lampes ensemble ; le switch déclaré passe par `homeassistant`, que le moteur rend à son domaine.
  assert.deepEqual(w.appels, ['light.turn_off light.bureau,light.ampoule,light.froide', 'switch.turn_off switch.applique']);
  m.demonter();
}));

test('« Blanc chaud » sans script n’éteint plus : 2 700 K aux lampes qui savent le blanc, bornés par chacune ; rien au variateur, rien à la veilleuse', () => dans(async () => {
  const w = poser();
  const m = monter(SC.default, { hass: w.hass });
  await attendre();
  m.rendre();
  m.appuyer(bouton(m, 'Blanc chaud'));
  assert.deepEqual(w.appels.sort(), ['light.turn_on light.ampoule color_temp_kelvin=2700', 'light.turn_on light.froide color_temp_kelvin=3000'].sort(),
    'la froide ne descend pas sous 3 000 K ; le variateur ne reçoit rien ; aucun turn_off');
  m.demonter();
}));

test('la luminosité d’une ambiance sans script : les lampes variables de la maison, veilleuse épargnée', () => dans(async () => {
  const w = poser();
  const m = monter(SC.default, { hass: w.hass });
  await attendre();
  m.rendre();
  m.appuyer(bouton(m, 'Monter la luminosité'));
  assert.deepEqual(w.appels, ['light.turn_on light.bureau,light.ampoule,light.froide brightness_pct=65'], 'les lampes variables ensemble, hors veilleuse');
  m.demonter();
}));

test('la règle Nuit absente (`not_available`) : aucune veilleuse n’existe, « Éteindre » éteint tout ce qui est une lumière de la maison', () => dans(async () => {
  const w = poser({ nuit: () => Promise.reject({ code: 'not_available' }) });
  const m = monter(SC.default, { hass: w.hass });
  await attendre();
  m.rendre();
  m.appuyer(bouton(m, 'Éteindre'));
  assert.ok(w.appels.some(x => x.indexOf('light.turn_off ') === 0 && x.includes('light.veilleuse')), 'ce nom n’est pas une veilleuse de la règle : ' + w.appels);
  assert.ok(!w.appels.some(x => x.includes('light.borne_voyant')), 'la LED reste hors de portée');
  m.demonter();
}));

/* TEST AJOUTÉ (audit du 19/10, seconde tranche ; B15) : tant que la règle Nuit n'est pas lue, le repli sans script ne touche
 * aucune lampe — « Éteindre », « Blanc chaud », la luminosité d'une ambiance — : on ne sait pas quelles veilleuses épargner. Un
 * script désigné, lui, part toujours (c'est à lui d'épargner). */
test('B15 : la règle Nuit pas encore lue — le repli sans script n’envoie rien ; lue, il repart', () => dans(async () => {
  let repondre = null;
  const w = poser({ nuit: () => new Promise((ok) => { repondre = ok; }) });
  const m = monter(SC.default, { hass: w.hass });
  await attendre();
  m.rendre();
  m.appuyer(bouton(m, 'Éteindre'));
  m.appuyer(bouton(m, 'Blanc chaud'));
  assert.deepEqual(w.appels, [], 'on ne sait pas quoi épargner : rien ne part');
  repondre(NUIT);
  await attendre();
  m.rendre();
  m.appuyer(bouton(m, 'Éteindre'));
  assert.deepEqual(w.appels, ['light.turn_off light.bureau,light.ampoule,light.froide', 'switch.turn_off switch.applique'], 'la règle lue : le repli repart, veilleuse épargnée');
  m.demonter();
}));


/* TEST AJOUTÉ (retouches du 19/10, R7). « Blanc chaud » sans script passe par `commander` — donc `planAction` —, et non par un
 * `light.turn_on` écrit à la main : 2 700 K est borné aux `min_` / `max_color_temp_kelvin` de chaque lampe, en haut comme en bas
 * (ce que l'ADR 0261 affirmait). Le code le dit, et une bougie qui ne monte pas à 2 700 K reçoit son plafond. */
test('R7 : « Blanc chaud » part par `commander` (`set_color_temp`) — borné en haut comme en bas par chaque lampe', () => dans(async () => {
  const SCENES = readFileSync(new URL('../src/scenes.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.ok(SCENES.includes("commander(hass, id, 'set_color_temp', BLANC_CHAUD_K)"), 'le code le dit : par le moteur, pas un `light.turn_on` à la main');
  const w = poser();
  w.hass.states['light.bougie'] = st('light.bougie', 'off', { supported_color_modes: ['color_temp'], min_color_temp_kelvin: 2000, max_color_temp_kelvin: 2500 })[1];
  const m = monter(SC.default, { hass: w.hass });
  await attendre();
  m.rendre();
  m.appuyer(bouton(m, 'Blanc chaud'));
  assert.deepEqual(w.appels.sort(), ['light.turn_on light.ampoule color_temp_kelvin=2700', 'light.turn_on light.bougie color_temp_kelvin=2500', 'light.turn_on light.froide color_temp_kelvin=3000'].sort(),
    'la bougie ne monte pas au-dessus de 2 500 K, la froide pas sous 3 000 K');
  m.demonter();
}));
