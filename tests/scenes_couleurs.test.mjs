/* La bibliothèque Hue applique ses couleurs sans script (chantier G5, ADR 0304).
 *
 * Sans script désigné (`hueScripts`, qu'aucun écran n'écrit plus depuis l'ADR 0103), une ambiance n'envoyait que sa
 * luminosité — et « Nightlight », dont la luminosité vaut 0 dans la bibliothèque, partait en `light.turn_on` avec
 * `brightness_pct: 0` : Home Assistant ÉTEINT une lampe qui reçoit une luminosité nulle. Le premier test le vérifie.
 *
 * Désormais, lampe par lampe, par le moteur (`commander`, donc `planAction` : la capacité déclarée, les bornes de la lampe) :
 *  - les cinq couleurs se répartissent sur les lampes COULEUR de la pièce (`xy_color` pour une lampe `xy`, `hs_color` sinon) ;
 *  - une lampe à blanc réglable prend le blanc le plus proche de l'ambiance, dans ses propres bornes ;
 *  - un simple variateur reçoit la luminosité seule ;
 *  - « Nightlight » : 1 % au blanc le plus chaud que la lampe sait faire, jamais éteinte ;
 *  - `transition: 1` à la lampe qui sait fondre ; les veilleuses épargnées ; un script désigné garde la priorité.
 * Les pièces sont les zones de Home Assistant ; un ancien `input_select` des pièces (`hueScripts.room`) garde ses options.
 * On JOUE la section (tests/crochets.mjs), comme tests/scenes_repli.test.mjs. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

import { monter, horlogeFausse, documentFaux } from './crochets.mjs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
globalThis.Image = class { set src(v) { this._src = v; } };
register('./jsx-hooks.mjs', import.meta.url);
const SC = await import(new URL('../src/scenes.jsx', import.meta.url).href);
const { setLoggiaState } = await import('../src/state.js');
const F = await import(new URL('../src/lumieresfiche.js', import.meta.url).href);

const st = (id, state, attributes = {}) => [id, { entity_id: id, state, last_changed: '2026-10-30T18:00:00.000Z', attributes }];
/* Une maison à trois pièces. La chambre : une ampoule blanche (2 200 à 6 500 K), une froide (3 000 K au plus chaud), un ruban
 * de couleur en `hs` qui sait fondre, le plafonnier variateur, et la veilleuse de la règle Nuit (blancs et couleurs). Le salon :
 * une Hue en `xy` et en blanc (2 000 à 6 535 K), qui sait fondre. Le bureau : un variateur. Et ce qui n'est pas une lampe
 * d'ambiance : la LED de la borne, le switch déclaré lumière, un groupe des deux premières. */
const maison = () => Object.fromEntries([
  st('light.bureau', 'on', { supported_color_modes: ['brightness'], brightness: 200 }),
  st('light.ampoule', 'on', { supported_color_modes: ['color_temp'], min_color_temp_kelvin: 2200, max_color_temp_kelvin: 6500 }),
  st('light.froide', 'off', { supported_color_modes: ['color_temp'], min_color_temp_kelvin: 3000, max_color_temp_kelvin: 6500 }),
  st('light.ruban', 'off', { supported_color_modes: ['hs'], supported_features: 32 }),
  st('light.chambre', 'off', { supported_color_modes: ['brightness'] }),
  st('light.veilleuse', 'on', { supported_color_modes: ['color_temp', 'xy'], min_color_temp_kelvin: 2000, max_color_temp_kelvin: 6535 }),
  st('light.hue', 'off', { supported_color_modes: ['color_temp', 'xy'], min_color_temp_kelvin: 2000, max_color_temp_kelvin: 6535, supported_features: 44 }),
  st('light.borne_voyant', 'on', { supported_color_modes: ['onoff'] }),
  st('light.groupe', 'on', { supported_color_modes: ['brightness'], entity_id: ['light.bureau', 'light.ampoule'] }),
  st('switch.applique', 'on'),
]);
const ZONE = { 'light.bureau': 'bureau', 'light.ampoule': 'chambre', 'light.froide': 'chambre', 'light.ruban': 'chambre', 'light.chambre': 'chambre',
  'light.veilleuse': 'chambre', 'light.hue': 'salon', 'light.borne_voyant': 'garage' };
const ZONES = [{ id: 'bureau', name: 'Bureau', entities: [] }, { id: 'chambre', name: 'Chambre', entities: [] }, { id: 'garage', name: 'Garage', entities: [] },
  { id: 'salon', name: 'Salon', entities: [] }];
const NUIT = { config: { veilleuse: { actif: true, lampes: ['light.veilleuse'] } } };

function poser({ ent = {}, etats = {} } = {}) {
  setLoggiaState({ index: { entityMeta: new Map([['light.borne_voyant', { category: 'config' }]]), areaList: ZONES, areaOf: (id) => ZONE[id] || null },
    ent: { switchLights: ['switch.applique'], ...ent }, cfg: {}, resolved: null });
  const appels = [];
  const hass = { states: { ...maison(), ...etats }, callWS: (m) => (m.type === 'loggia/nuit/etat' ? Promise.resolve(NUIT) : Promise.resolve({})),
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
const choix = (m, label) => m.trouver(e => e.props && e.props.label === label && Array.isArray(e.props.options))[0];
async function section(w) {
  const m = monter(SC.default, { hass: w.hass });
  await attendre();
  m.rendre();
  return m;
}

test('L1 : « Nightlight » sans script n’éteint plus rien — 1 % au blanc le plus chaud de chaque lampe, jamais `brightness_pct: 0`', () => dans(async () => {
  const w = poser();
  const m = await section(w);
  m.appuyer(bouton(m, 'Appliquer Nightlight'));
  assert.ok(!w.appels.some(x => /brightness_pct=0\b/.test(x)), 'une luminosité nulle ÉTEINT la lampe chez Home Assistant : ' + w.appels.join(' | '));
  assert.ok(!w.appels.some(x => x.includes('turn_off')), 'rien ne s’éteint');
  assert.deepEqual(w.appels.sort(), [
    'light.turn_on light.ampoule color_temp_kelvin=2200 brightness_pct=1',
    'light.turn_on light.bureau brightness_pct=1',
    'light.turn_on light.chambre brightness_pct=1',
    'light.turn_on light.froide color_temp_kelvin=3000 brightness_pct=1',
    'light.turn_on light.hue color_temp_kelvin=2000 brightness_pct=1 transition=1',
    // Un ruban sans blanc : la couleur du blanc le plus chaud que Loggia connaît (2 200 K).
    'light.turn_on light.ruban hs_color=29.3,82.7 brightness_pct=1 transition=1',
  ].sort(), 'la veilleuse, la LED de la borne, le switch et le groupe ne reçoivent rien');
  m.demonter();
}));

test('les pièces sont les zones de Home Assistant qui ont une lampe d’ambiance — plus de pièces écrites en dur', () => dans(async () => {
  const w = poser();
  const m = await section(w);
  const liste = choix(m, 'Pièce');
  assert.ok(liste, 'la pièce se choisit dans une liste (jamais un <select> natif)');
  assert.deepEqual(liste.props.options.map(o => o.label), ['Tout', 'Bureau', 'Chambre', 'Salon'], 'le garage n’a que la LED de la borne : il n’y est pas');
  assert.equal(liste.props.value, '*', 'toute la maison, au départ');
  m.demonter();
}));

test('une ambiance dans la chambre : la couleur au ruban, le blanc le plus proche aux ampoules (bornées), la luminosité seule au variateur, la veilleuse épargnée', () => dans(async () => {
  const w = poser();
  const m = await section(w);
  choix(m, 'Pièce').props.onChange('chambre');
  m.rendre();
  m.appuyer(bouton(m, 'Appliquer Rest'));
  assert.deepEqual(w.appels.sort(), [
    'light.turn_on light.ampoule color_temp_kelvin=2200 brightness_pct=35',
    'light.turn_on light.chambre brightness_pct=35',
    'light.turn_on light.froide color_temp_kelvin=3000 brightness_pct=35',
    'light.turn_on light.ruban hs_color=33.7,86 brightness_pct=35 transition=1',
  ].sort());
  m.demonter();
}));

test('une lampe `xy` reçoit `xy_color`, une lampe `hs` reçoit `hs_color` ; le curseur de luminosité renvoie l’ambiance choisie', () => dans(async () => {
  const w = poser();
  const m = await section(w);
  choix(m, 'Pièce').props.onChange('salon');
  choix(m, 'Collection de scènes').props.onChange('party');
  m.rendre();
  m.appuyer(bouton(m, 'Appliquer Tokyo'));
  assert.deepEqual(w.appels, ['light.turn_on light.hue xy_color=0.562,0.405 brightness_pct=47 transition=1']);
  w.appels.length = 0;
  m.appuyer(bouton(m, 'Monter la luminosité'));
  assert.deepEqual(w.appels, ['light.turn_on light.hue xy_color=0.562,0.405 brightness_pct=52 transition=1'], 'la même couleur, plus forte');
  m.demonter();
}));

test('un script désigné garde la priorité : il reçoit l’ambiance entière, aucune lampe n’est commandée une à une', () => dans(async () => {
  const w = poser({ ent: { hueScripts: { apply: 'script.hue_appliquer' } } });
  const m = await section(w);
  m.appuyer(bouton(m, 'Appliquer Rest'));
  assert.equal(w.appels.length, 1);
  assert.ok(w.appels[0].startsWith('script.hue_appliquer '), w.appels[0]);
  assert.ok(w.appels[0].includes('scene_name=Rest') && w.appels[0].includes('color1=215,134,30') && w.appels[0].includes('brightness_pct=35'), w.appels[0]);
  m.demonter();
}));

test('compatibilité : un ancien `input_select` des pièces (`hueScripts.room`) garde ses options, et la pièce choisie le règle', () => dans(async () => {
  const etats = Object.fromEntries([st('input_select.hue_piece', 'Chambre', { options: ['Séjour', 'Chambre', 'Chambre enfant', 'Toute la maison'] })]);
  const w = poser({ ent: { hueScripts: { room: 'input_select.hue_piece' } }, etats });
  const m = await section(w);
  const liste = choix(m, 'Pièce');
  assert.deepEqual(liste.props.options.map(o => o.id), ['Séjour', 'Chambre', 'Chambre enfant', 'Toute la maison']);
  assert.equal(liste.props.value, 'Chambre', 'la pièce que l’input_select retient');
  // Sans script d'application, l'ambiance part quand même, dans la zone du même nom.
  m.appuyer(bouton(m, 'Appliquer Rest'));
  assert.ok(w.appels.length && w.appels.every(x => /light\.(ampoule|chambre|froide|ruban) /.test(x)), w.appels.join(' | '));
  w.appels.length = 0;
  liste.props.onChange('Séjour');
  m.rendre();
  assert.deepEqual(w.appels, ['input_select.select_option input_select.hue_piece option=Séjour']);
  m.demonter();
}));

test('« Blanc chaud », « Éteindre » et la luminosité seule suivent la pièce choisie', () => dans(async () => {
  const w = poser();
  const m = await section(w);
  choix(m, 'Pièce').props.onChange('bureau');
  m.rendre();
  m.appuyer(bouton(m, 'Éteindre'));
  assert.deepEqual(w.appels, ['light.turn_off light.bureau']);
  m.demonter();
}));

/* ── Les calculs, à sec (lumieresfiche.js) ─────────────────────────────────── */

test('les cinq couleurs se répartissent sur les lampes couleur, dans l’ordre de leurs noms', () => {
  const sc = { name: 'X', brightness: 50, colors: [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0], [255, 0, 255]] };
  const lampe = (id) => ({ id, a: { supported_color_modes: ['hs'] } });
  const teintes = (n) => F.ordresAmbiance(sc, Array.from({ length: n }, (_, i) => lampe('light.l' + i))).map(o => o.valeur[0]);
  assert.deepEqual(teintes(5), [0, 120, 240, 60, 300]);
  assert.deepEqual(teintes(2), [0, 240], 'deux lampes : la première et la troisième, pour que l’ambiance se voie');
  assert.deepEqual(teintes(7), [0, 120, 240, 60, 300, 0, 120], 'plus de cinq : on recommence');
});

test('le blanc le plus proche d’une couleur, borné à la lampe', () => {
  const b = { min: 2200, max: 6500 };
  assert.equal(F.blancDeRgb([215, 134, 30], b), 2200, 'un orange : le plus chaud');
  assert.equal(F.blancDeRgb([249, 255, 255], b), 6500, 'un blanc bleuté : le plus froid');
  const lu = F.blancDeRgb([255, 242, 149], b);
  assert.ok(lu >= 3500 && lu <= 4500, 'un blanc jaune : neutre (' + lu + ')');
  assert.equal(F.blancDeRgb([215, 134, 30], { min: 3000, max: 6500 }), 3000, 'jamais sous la borne de la lampe');
});

test('les conversions suivent celles de Home Assistant', () => {
  assert.deepEqual(F.hsDeRgb([255, 0, 0]), [0, 100]);
  assert.deepEqual(F.hsDeRgb([215, 134, 30]), [33.7, 86]);
  const [x, y] = F.xyDeRgb([255, 0, 0]);
  assert.ok(Math.abs(x - 0.7006) < 0.001 && Math.abs(y - 0.2993) < 0.001, 'rouge : ' + x + ', ' + y);
  assert.deepEqual(F.xyDeRgb([0, 0, 0]), [0, 0], 'le noir ne divise pas par zéro');
});

test('une lampe qui ne fait que s’allumer (tout ou rien, un switch) ne reçoit rien ; jamais une luminosité nulle', () => {
  const sc = { name: 'Nightlight', brightness: 0, colors: [[21, 8, 0], [21, 8, 0], [21, 8, 0], [21, 8, 0], [21, 8, 0]] };
  const o = F.ordresAmbiance(sc, [{ id: 'light.onoff', a: { supported_color_modes: ['onoff'] } }, { id: 'switch.x', a: {} }, { id: 'light.v', a: { supported_color_modes: ['brightness'] } }]);
  assert.deepEqual(o, [{ id: 'light.v', capacite: 'set_brightness', valeur: 1, options: {} }]);
  assert.equal(F.luminositeAmbiance(sc), 1);
});

/* ── Le moteur (actions.js) : la couleur d'une ambiance est une commande VÉRIFIÉE ── */

test('`set_hs` et `set_xy` : la capacité vient des modes couleur, la valeur reste dans son domaine, la luminosité et le fondu partent avec', async () => {
  const { planAction } = await import('../src/actions.js');
  const states = { 'light.hs': { state: 'off', attributes: { supported_color_modes: ['hs'] } }, 'light.v': { state: 'off', attributes: { supported_color_modes: ['brightness'] } } };
  const p = planAction('light.hs', 'set_hs', [33.74, 86.04], { states }, { brightness_pct: 35, transition: 1, bidon: 2 });
  assert.equal(p.ok, true, p.reason);
  assert.deepEqual(p.data, { hs_color: [33.7, 86], brightness_pct: 35, transition: 1 }, 'rien d’autre que ce que le service déclare');
  assert.equal(planAction('light.hs', 'set_hs', [400, 50], { states }).ok, false, 'une teinte hors du cercle');
  assert.equal(planAction('light.hs', 'set_xy', [0.7, 1.2], { states }).ok, false, 'un point hors du diagramme');
  assert.equal(planAction('light.v', 'set_hs', [30, 50], { states }).ok, false, 'un variateur n’a pas de couleur');
  const v = planAction('light.v', 'set_brightness', 40, { states }, { transition: 1 });
  assert.deepEqual(v.data, { brightness_pct: 40, transition: 1 });
});

test('la démo porte le cas : dans la chambre, une lampe couleur qui sait fondre, une à blanc réglable, un variateur — et la veilleuse, épargnée', async () => {
  const D = await import('../src/demo.js');
  const m = D.maisonLumieresDemo();
  const index = m.index();
  const chambre = index.entities.filter(e => e.area === 'chambre' && /^light\./.test(e.id)).map(e => e.id).sort();
  const genres = Object.fromEntries(chambre.map(id => [id, F.genreAmbiance(id, m.states[id].attributes)]));
  assert.deepEqual(Object.values(genres).sort(), ['blanc', 'couleur', 'couleur', 'variateur'], JSON.stringify(genres));
  assert.ok(m.nuit().veilleuse.lampes.includes('light.veilleuse_chambre_lino'), 'la seconde lampe couleur est la veilleuse de la règle Nuit');
  assert.equal(F.saitFondre(m.states['light.ruban_chambre'].attributes), true);
  // Le geste de la démo pose la couleur, comme Home Assistant.
  const [o] = F.ordresAmbiance({ colors: [[255, 67, 82], [255, 67, 82], [255, 67, 82], [255, 67, 82], [255, 67, 82]], brightness: 40 }, [{ id: 'light.ruban_chambre', a: m.states['light.ruban_chambre'].attributes }]);
  m.geste('light.ruban_chambre', 'turn_on', { hs_color: o.valeur, ...o.options });
  const a = m.states['light.ruban_chambre'].attributes;
  assert.equal(m.states['light.ruban_chambre'].state, 'on');
  assert.deepEqual([a.color_mode, a.hs_color, Math.round(a.brightness / 2.55)], ['hs', o.valeur, 40]);
});

/* TEST AJOUTÉ (31/10, relecture de G5, défaut 1) : avec un ancien `input_select`, une pièce qui ne correspond à AUCUNE zone
 * ayant une lampe d'ambiance — « Séjour » face à « Salon », une chambre qui n'a que sa veilleuse, l'`input_select` muet —
 * envoyait l'ambiance à TOUTE la maison : « Nightlight » allumait à 1 % des lampes éteintes hors de la pièce. Désormais rien
 * ne part, et la section le dit ; toute la maison seulement pour l'option « Toute la maison ». */
test('une pièce d’un ancien `input_select` sans zone d’ambiance : rien ne part, et la section le dit ; « Toute la maison » reste toute la maison', () => dans(async () => {
  const lampes = Object.fromEntries([
    st('light.salon', 'off', { supported_color_modes: ['brightness'] }),
    st('light.chambre', 'off', { supported_color_modes: ['color_temp'], min_color_temp_kelvin: 2200, max_color_temp_kelvin: 6500 }),
    st('light.cuisine', 'off', { supported_color_modes: ['brightness'] }),
    st('light.veilleuse_lino', 'on', { supported_color_modes: ['color_temp', 'xy'] }),
  ]);
  const zone = { 'light.salon': 'salon', 'light.chambre': 'chambre', 'light.cuisine': 'cuisine', 'light.veilleuse_lino': 'chambre_enfant' };
  const zones = [{ id: 'chambre', name: 'Chambre' }, { id: 'chambre_enfant', name: 'Chambre enfant' }, { id: 'cuisine', name: 'Cuisine' }, { id: 'salon', name: 'Salon' }];
  const essai = async (piece, geste) => {
    const etats = { ...lampes, ...Object.fromEntries([st('input_select.hue_piece', piece, { options: ['Séjour', 'Chambre', 'Chambre enfant', 'Toute la maison'] })]) };
    const w = poser({ ent: { hueScripts: { room: 'input_select.hue_piece' } }, etats });
    setLoggiaState({ index: { entityMeta: new Map(), areaList: zones, areaOf: (id) => zone[id] || null }, ent: { hueScripts: { room: 'input_select.hue_piece' } }, cfg: {}, resolved: null });
    w.hass.states = { ...etats };
    w.hass.callWS = (m) => (m.type === 'loggia/nuit/etat' ? Promise.resolve({ config: { veilleuse: { lampes: ['light.veilleuse_lino'] } } }) : Promise.resolve({}));
    const m = await section(w);
    m.appuyer(bouton(m, geste));
    const texte = m.texte();
    m.demonter();
    return { lampes: w.appels.filter(x => /^light\./.test(x)).map(x => x.split(' ')[1]).sort(), texte };
  };
  for (const [piece, geste] of [['Séjour', 'Appliquer Rest'], ['Chambre enfant', 'Appliquer Nightlight'], ['Séjour', 'Blanc chaud'], ['Séjour', 'Monter la luminosité'],
    ['Séjour', 'Éteindre'], ['unavailable', 'Appliquer Nightlight']]) {
    const r = await essai(piece, geste);
    assert.deepEqual(r.lampes, [], piece + ' · ' + geste + ' : ' + r.lampes.join(', '));
    assert.ok(r.texte.includes('Aucune lampe d’ambiance dans ' + piece), piece + ' : la section le dit');
  }
  assert.deepEqual((await essai('Chambre', 'Appliquer Rest')).lampes, ['light.chambre'], 'la zone du même nom');
  const tout = await essai('Toute la maison', 'Appliquer Rest');
  assert.deepEqual(tout.lampes, ['light.chambre', 'light.cuisine', 'light.salon'], 'l’option explicite : toute la maison, veilleuse épargnée');
  assert.ok(!tout.texte.includes('Aucune lampe'), 'rien à dire');
}));
