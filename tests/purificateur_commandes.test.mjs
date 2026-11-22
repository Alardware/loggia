// ─────────────────────────────────────────────────────────────────────────────
// La fiche du purificateur ne montre que ce que l'appareil publie (ADR 0387 ; guide UX, règle 46).
//
// Sa remarque du 21/11 : « attention les commande doivent correspondre a l'entité, ecran par exemple, moi je l'ai mais pas
// tout le monde ». Ici, des purificateurs-types — le plus simple (marche et arrêt), des crans sans modes, des modes sans crans,
// le sien (VeSync LV-PUR131S, avec écran), un Xiaomi —, puis des « mutants » de son appareil : chaque commande qu'on retire de
// l'entité doit disparaître de la fiche, sans case vide ni bouton grisé, et les phrases cessent d'en parler.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);
const { setLoggiaState } = await import('../src/state.js');
const { poserMinuteurs } = await import('../src/prisesetat.js');
const { estPurificateur } = await import('../src/purificateurboot.js');
const P = await import('../src/purificateur.js');
const { default: FichePurificateurContent } = await import('../src/fichepurificateur.jsx');

// FanEntityFeature : 1 vitesse, 8 préréglages, 16 éteindre, 32 allumer.
const VITESSE = 1, PRESETS = 8, ETEINDRE = 16, ALLUMER = 32;

/** Un appareil : `[entity_id, état, attributs, fiche d'index]` ; rend `{ index, S }`. */
function appareil(lignes) {
  const entityMeta = new Map(lignes.map(([id, , , m]) => [id, { deviceId: 'app', ...(m || {}) }]));
  const S = Object.fromEntries(lignes.map(([id, state, attributes]) => [id, { entity_id: id, state, attributes: attributes || {} }]));
  return { index: { entityMeta }, S };
}

const SIMPLE = () => appareil([
  ['fan.p', 'on', { supported_features: ETEINDRE | ALLUMER }],
  ['sensor.p_filtre', '50', { unit_of_measurement: '%' }, { translationKey: 'filter_life' }],
]);
const CRANS = () => appareil([
  ['fan.p', 'on', { supported_features: VITESSE | ETEINDRE | ALLUMER, percentage_step: 25, percentage: 50 }],
  ['sensor.p_particules', '8', { unit_of_measurement: 'µg/m³', device_class: 'pm25' }, { deviceClass: 'pm25' }],
]);
const MODES = () => appareil([
  ['fan.p', 'on', { supported_features: PRESETS | ETEINDRE | ALLUMER, preset_modes: ['Auto', 'Silent', 'Favorite'], preset_mode: 'Auto' }],
  ['sensor.p_particules', '30', { unit_of_measurement: 'µg/m³', device_class: 'pm25' }, { deviceClass: 'pm25' }],
]);
// Le sien, tel que le registre et la base de Home Assistant le montrent (21/11) : ni verrou, ni minuterie, ni remise à zéro.
const VESYNC = (retouche = {}) => appareil([
  ['fan.p', 'on', { supported_features: VITESSE | PRESETS | ETEINDRE | ALLUMER, percentage_step: 100 / 3, preset_modes: ['auto', 'sleep'], preset_mode: 'auto', percentage: null, ...retouche }],
  ['sensor.p_air', 'good', {}, { translationKey: 'air_quality' }],
  ['sensor.p_filtre', '72', { unit_of_measurement: '%' }, { translationKey: 'filter_life', category: 'diagnostic' }],
  ['switch.p_affichage', 'on', {}, { translationKey: 'display', category: 'config' }],
]);
// Un Xiaomi (intégration xiaomi_miio) : préréglages Auto, Silent, Favorite, Fan, trois vitesses ; particules, filtre, voyant `led`
// et verrou enfant en `switch`, remise à zéro absente.
const XIAOMI = () => appareil([
  ['fan.p', 'on', { supported_features: VITESSE | PRESETS | ETEINDRE | ALLUMER, percentage_step: 100 / 3, preset_modes: ['Auto', 'Silent', 'Favorite', 'Fan'], preset_mode: 'Silent' }],
  ['sensor.p_pm25', '4', { unit_of_measurement: 'µg/m³', device_class: 'pm25' }, { deviceClass: 'pm25' }],
  ['sensor.p_filtre', '20', { unit_of_measurement: '%' }, { translationKey: 'filter_life_remaining' }],
  ['switch.p_led', 'off', {}, { translationKey: 'led' }],
  ['switch.p_verrou', 'on', {}, { translationKey: 'child_lock' }],
]);

const vue = ({ index, S }, opts) => P.vuePurificateur(index, S, 'fan.p', opts);
const cles = (v) => v.pilules.map(p => p.cle);
const modes = (v) => P.modesPlanning(v).map(m => m.cle);

/** La fiche rendue. `minuteurs` : le composant répond (la Minuterie peut paraître). */
function rendre({ index, S }, { minuteurs = true } = {}) {
  setLoggiaState({ index });
  poserMinuteurs(minuteurs ? { minuteurs: {}, maintenant: 1 } : { minuteurs: null });
  try {
    return renderToStaticMarkup(createElement(FichePurificateurContent, { hass: { states: S, callWS: () => new Promise(() => {}) }, id: 'fan.p', maintenant: Date.parse('2026-11-16T10:00:00') }));
  } finally { setLoggiaState({ index: null }); }
}
const onglets = (html) => [...html.matchAll(/role="tab"[^>]*>(?:<i[^>]*><\/i>)?<span>([^<]+)<\/span>/g)].map(m => m[1]);
const actions = (html) => ['Marche/', 'Écran', 'Verrou', 'Minuterie'].filter(a => html.includes('>' + a));

// ─── Les purificateurs-types ─────────────────────────────────────────────────

test('le plus simple — marche et arrêt, son filtre : rien d’autre', () => {
  const d = SIMPLE();
  assert.equal(estPurificateur(d.index, 'fan.p'), true, 'reconnu par son filtre');
  const v = vue(d);
  assert.deepEqual(cles(v), [], 'aucune pilule');
  assert.equal(v.mode, 'marche');
  assert.equal(v.air, false);
  assert.equal(v.motNiveau, 'En marche', 'sans mesure, la scène dit seulement qu’il tourne');
  assert.equal(v.bandeau, 'Purificateur en marche.');
  assert.equal(vue({ ...d, S: { ...d.S, 'fan.p': { ...d.S['fan.p'], state: 'off' } } }).bandeau, 'Purificateur à l’arrêt.', 'pas de « choisissez un mode » sans mode');
  assert.deepEqual(modes(v), ['arret', 'marche'], 'son planning : Arrêt et Marche');
  const html = rendre(d);
  assert.ok(!html.includes('role="group" aria-label="Mode"'), 'pas de rangée de pilules vide');
  assert.ok(!html.includes('QUALITÉ DE L’AIR'));
  assert.deepEqual(actions(html), ['Marche/', 'Minuterie']);
  assert.deepEqual(onglets(html), ['Accueil', 'Planning', 'Filtre', 'Historique']);
});

test('des crans sans modes : ses quatre vitesses, ni Auto ni Nuit', () => {
  const v = vue(CRANS());
  assert.deepEqual(cles(v), ['v1', 'v2', 'v3', 'v4']);
  assert.deepEqual(v.pilules.map(p => p.mot), ['1', '2', '3', '4']);
  assert.deepEqual(v.pilules.filter(p => p.on).map(p => p.cle), ['v2']);
  assert.equal(v.bandeau, 'Vitesse fixe.', 'pas de « Repassez en Auto » sans Auto');
  assert.deepEqual(modes(v), ['arret', 'v1', 'v2', 'v3', 'v4']);
  const html = rendre(CRANS());
  assert.ok(!html.includes('>Auto<') && !html.includes('>Nuit<'));
});

test('des modes sans crans : Auto, Nuit, Favori — et pas un mot de vitesse', () => {
  const v = vue(MODES());
  assert.deepEqual(cles(v), ['auto', 'nuit', 'preset:Favorite']);
  assert.equal(v.n, 0);
  assert.equal(v.niveau, 'poor');
  assert.equal(v.bandeau, 'Air mauvais : il accélère jusqu’à ce que ça redescende.');
  assert.ok(!/vitesse/i.test(v.bandeau + v.ligne), 'sans crans, aucune vitesse nommée');
  assert.deepEqual(modes(v), ['arret', 'auto', 'nuit']);
  // Air bon et pollué, sans crans non plus.
  for (const [pm, phrase] of [['8', 'Air bon : il le garde propre.'], ['80', 'Air pollué : il tourne au plus fort. Fermez la porte de la pièce pour qu’il soit plus efficace.']]) {
    const d = MODES();
    d.S['sensor.p_particules'] = { ...d.S['sensor.p_particules'], state: pm };
    assert.equal(vue(d).bandeau, phrase);
  }
});

test('le sien : VeSync LV-PUR131S — Auto, trois vitesses, Nuit, l’écran ; ni verrou, ni remise à zéro', () => {
  const v = vue(VESYNC());
  assert.deepEqual(v.pilules.map(p => p.mot), ['Auto', 'Faible', 'Moyen', 'Fort', 'Nuit']);
  assert.equal(v.ent.ecran, 'switch.p_affichage');
  assert.equal(v.ent.verrou, null);
  assert.equal(v.ent.remiseFiltre, null);
  const html = rendre(VESYNC());
  assert.deepEqual(actions(html), ['Marche/', 'Écran', 'Minuterie']);
  assert.ok(html.includes('QUALITÉ DE L’AIR') && html.includes('Filtre 72 %'));
  assert.ok(!html.includes('Filtre remplacé'), 'pas de remise à zéro sans le bouton');
});

test('un Xiaomi : le voyant `led` est l’écran, le verrou enfant paraît, ses quatre préréglages', () => {
  const v = vue(XIAOMI());
  assert.deepEqual(cles(v), ['auto', 'v1', 'v2', 'v3', 'nuit', 'preset:Favorite', 'preset:Fan']);
  assert.equal(v.mode, 'nuit');
  assert.equal(v.ent.ecran, 'switch.p_led');
  assert.equal(v.ent.verrou, 'switch.p_verrou');
  assert.equal(v.niveau, 'excellent');
  assert.equal(v.filtre.niveau, 'moyen');
  assert.deepEqual(actions(rendre(XIAOMI())), ['Marche/', 'Écran', 'Verrou', 'Minuterie']);
});

test('un écran publié en `light` paraît, et se commande par `light`', () => {
  const d = SIMPLE();
  d.index.entityMeta.set('light.p_ecran', { deviceId: 'app', translationKey: 'display' });
  d.S['light.p_ecran'] = { entity_id: 'light.p_ecran', state: 'on', attributes: {} };
  assert.equal(vue(d).ent.ecran, 'light.p_ecran');
  assert.ok(actions(rendre(d)).includes('Écran'));
  // Une veilleuse (`night_light`) n'est pas un écran.
  const e = SIMPLE();
  e.index.entityMeta.set('light.p_veilleuse', { deviceId: 'app', translationKey: 'night_light' });
  e.S['light.p_veilleuse'] = { entity_id: 'light.p_veilleuse', state: 'on', attributes: {} };
  assert.equal(vue(e).ent.ecran, null);
});

test('une vitesse sans crans se règle pas à pas, sous les pilules', () => {
  const d = appareil([['fan.p', 'on', { supported_features: VITESSE | ETEINDRE | ALLUMER, percentage_step: 1, percentage: 40 }],
    ['sensor.p_filtre', '50', {}, { translationKey: 'filter_life' }]]);
  const v = vue(d);
  assert.deepEqual(cles(v), []);
  assert.ok(v.vitesseLibre);
  assert.equal(v.ligne, 'Manuel · 40 %');
  const html = rendre(d);
  assert.ok(html.includes('data-vitesse=""') && html.includes('40 %'));
  assert.deepEqual(modes(v), ['arret', 'marche'], 'une vitesse libre ne se planifie pas : Arrêt et Marche');
});

test('la minuterie : seulement quand le composant répond, et que l’appareil sait s’éteindre', () => {
  assert.ok(!actions(rendre(VESYNC(), { minuteurs: false })).includes('Minuterie'), 'sans le composant, pas de bouton');
  const d = VESYNC({ supported_features: VITESSE | PRESETS | ALLUMER });
  assert.ok(!actions(rendre(d)).includes('Minuterie'), 'elle éteint par fan.turn_off : sans le bit 16, rien');
});

// ─── Les mutants : chaque commande retirée de l'entité disparaît de la fiche ──

const MUTANTS = [
  ['sans écran', (d) => { delete d.S['switch.p_affichage']; }, (v, html) => !v.ent.ecran && !actions(html).includes('Écran')],
  ['écran muet', (d) => { d.S['switch.p_affichage'] = { ...d.S['switch.p_affichage'], state: 'unavailable' }; }, (v, html) => !actions(html).includes('Écran')],
  ['écran désactivé', (d) => { d.index.entityMeta.set('switch.p_affichage', { deviceId: 'app', translationKey: 'display', disabled: true }); }, (v, html) => !actions(html).includes('Écran')],
  ['sans le bit des préréglages', (d) => { d.S['fan.p'].attributes.supported_features = VITESSE | ETEINDRE | ALLUMER; },
    (v, html) => !cles(v).includes('auto') && !cles(v).includes('nuit') && !html.includes('>Auto<') && !html.includes('>Nuit<') && !modes(v).includes('auto')],
  ['sans le bit de vitesse', (d) => { d.S['fan.p'].attributes.supported_features = PRESETS | ETEINDRE | ALLUMER; },
    (v, html) => !cles(v).some(c => /^v\d/.test(c)) && !html.includes('>Faible<') && !/vitesse/.test(v.bandeau + v.ligne)],
  ['sans mode nuit', (d) => { d.S['fan.p'].attributes.preset_modes = ['auto']; }, (v, html) => !cles(v).includes('nuit') && !modes(v).includes('nuit') && !html.includes('>Nuit<')],
  ['sans le bit pour éteindre', (d) => { d.S['fan.p'].attributes.supported_features = VITESSE | PRESETS | ALLUMER; },
    (v, html) => !modes(v).includes('arret') && !actions(html).includes('Minuterie')],
  ['sans allumer ni éteindre', (d) => { d.S['fan.p'].attributes.supported_features = VITESSE | PRESETS; }, (v, html) => !actions(html).includes('Marche/')],
  ['sans mesure de l’air', (d) => { delete d.S['sensor.p_air']; }, (v, html) => !v.air && !html.includes('QUALITÉ DE L’AIR') && !html.includes('DERNIÈRES 24 H')],
  ['sans filtre', (d) => { delete d.S['sensor.p_filtre']; }, (v, html) => !v.filtre && !onglets(html).includes('Filtre') && !/Filtre \d+ %/.test(html)],
  ['filtre muet', (d) => { d.S['sensor.p_filtre'] = { ...d.S['sensor.p_filtre'], state: 'unknown' }; }, (v, html) => !onglets(html).includes('Filtre')],
];

for (const [nom, muter, absent] of MUTANTS) {
  test('mutant « ' + nom + ' » : la commande n’apparaît plus', () => {
    const d = VESYNC();
    d.S['fan.p'] = { ...d.S['fan.p'], attributes: { ...d.S['fan.p'].attributes } };
    muter(d);
    const v = vue(d);
    assert.ok(absent(v, rendre(d)), nom);
    // Le témoin : sans la mutation, la commande était là.
    assert.ok(!absent(vue(VESYNC()), rendre(VESYNC())), nom + ' : le témoin ne la montre pas non plus');
  });
}

test('le planning disparaît quand il n’y a pas deux modes à planifier', () => {
  // Un appareil qui ne sait que s'allumer, sans s'éteindre : un seul mode, pas d'onglet Planning.
  const d = appareil([['fan.p', 'on', { supported_features: ALLUMER }], ['sensor.p_filtre', '50', {}, { translationKey: 'filter_life' }]]);
  assert.deepEqual(modes(vue(d)), ['marche']);
  assert.ok(!onglets(rendre(d)).includes('Planning'));
});

test('la semaine type ne propose que les modes de l’appareil', () => {
  for (const d of [SIMPLE(), CRANS(), MODES(), VESYNC(), XIAOMI()]) {
    const m = P.modesPlanning(vue(d));
    const connus = new Set(m.map(x => x.cle));
    for (const jour of P.semaineType(m)) for (const p of jour) assert.ok(connus.has(p.mode), p.mode + ' proposé à un appareil qui ne le sait pas');
  }
});

test('l’historique ne nomme que ce que l’appareil sait', () => {
  const t0 = Date.parse('2026-11-20T00:00:00Z');
  const h = (min) => new Date(t0 + min * 60000).toISOString();
  const fan = [{ state: 'off', last_changed: h(0), attributes: {} }, { state: 'on', last_changed: h(60), attributes: { preset_mode: null, percentage: null } },
    { state: 'off', last_changed: h(120), attributes: {} }];
  const v = vue(SIMPLE());
  const ev = P.evenementsJour(fan, [], { presetAuto: v.presetAuto, presetNuit: v.presetNuit, n: v.n, vitesse: v.vitesse });
  assert.deepEqual(ev.map(e => e.texte), ['Éteint', 'Allumé'], 'ni « Manuel », ni « mode Auto » pour un appareil qui n’en a pas');
  // Un appareil sans vitesse qui publie quand même un pourcentage (100 % allumé) : toujours « Allumé », jamais « Manuel ».
  const plein = [{ state: 'off', last_changed: h(0), attributes: {} }, { state: 'on', last_changed: h(60), attributes: { percentage: 100 } }];
  assert.deepEqual(P.evenementsJour(plein, [], { presetAuto: null, presetNuit: null, n: 0, vitesse: v.vitesse }).map(e => e.texte), ['Allumé']);
});
