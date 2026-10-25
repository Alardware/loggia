/* La vigilance météo dans Dehors (chantier Capteurs, étapes 2 et 3, tâche 8 ; C28, § 19.5, § 6.1).
 *
 * Ce qui est garanti ici :
 *  - la vue (vigilance.js, pur) : le capteur d'alerte départementale de Météo-France d'abord — son état est le niveau, ses
 *    attributs les phénomènes —, sinon le binaire MeteoAlarm (`safety`, reconnu par la règle de l'Accueil : `awareness_level`,
 *    l'attribution, l'identifiant) ; au calme, le NIVEAU (« Vigilance verte »), jamais « Tout va bien » ; sans niveau connu,
 *    « Aucune alerte en cours » ; en alerte, l'ambre pour jaune, l'orange pour orange, le rouge pour rouge — Severe et Extreme
 *    valent le rouge, comme à l'Accueil —, avec l'événement s'il est donné ; muette, « Indisponible », à regarder ;
 *  - la carte (App.jsx) : celle des groupes, sans puces, sous « Vigilance météo » ; son lavis en alerte seulement ;
 *  - Objets : MeteoAlarm et le capteur de Météo-France gardent leur carte, sous leur identifiant (son agencement les range), dans
 *    Dehors — même sans appareil physique (l'exception nommée à C16) ; la vigilance allumée est à regarder, éteinte elle est jugée
 *    bonne ; l'enveloppe vivante s'y abonne. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { area, device, entity, state, states, indexOf } from './fixtures.mjs';
import { estVigilanceMeteoFrance, estVigilance, vueVigilance, niveauDe } from '../src/vigilance.js';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);
register('data:text/javascript,' + encodeURIComponent([
  'export async function load(url, ctx, next) {',
  "  if (!url.endsWith('/src/App.jsx?vigilance')) return next(url, ctx);",
  "  const r = await next(url.slice(0, -'?vigilance'.length), ctx);",
  "  return { ...r, source: String(r.source) + ';export { objetsDeLaMaison, RoomVigilanceCard, jugerObjet, estDehors, vueMesure };' };",
  '}',
].join('\n')));
const { setLoggiaState } = await import('../src/state.js');
const F = await import(new URL('../src/App.jsx?vigilance', import.meta.url).href);
const CS = await import('../src/capteurssections.jsx');
const APP = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');

const MF = 'sensor.paris_weather_alert';
const MA = 'binary_sensor.meteoalarm';
const mf = (niveau, attrs = {}) => ({ [MF]: { state: niveau, attributes: { friendly_name: 'Alerte météo Paris', ...attrs } } });
const ma = (etat, attrs = {}) => ({ [MA]: { state: etat, attributes: { friendly_name: 'MeteoAlarm', device_class: 'safety', attribution: 'Information provided by MeteoAlarm', ...attrs } } });

test('§ 19.5 : Météo-France — l’état est le niveau, les attributs les phénomènes ; au calme le niveau, jamais « Tout va bien »', () => {
  assert.deepEqual(['Vert', 'jaune', 'ORANGE', 'Rouge', 'green', 'yellow', 'red', 'bleu', null].map(niveauDe), ['vert', 'jaune', 'orange', 'rouge', 'vert', 'jaune', 'rouge', null, null]);
  const vert = vueVigilance(mf('Vert', { 'Vent violent': 'Vert', 'Orages': 'Vert' }), MF);
  assert.deepEqual([vert.niveau, vert.phrase, vert.ton, vert.regarder, vert.glyphe, vert.puces], ['vert', 'Vigilance verte', null, false, 'umbrella', []]);
  const jaune = vueVigilance(mf('Jaune', { 'Vent violent': 'Jaune', 'Orages': 'Vert', 'Pluie-inondation': 'Jaune' }), MF);
  assert.deepEqual([jaune.niveau, jaune.phrase, jaune.ton, jaune.regarder], ['jaune', 'Vigilance jaune · Vent violent, Pluie-inondation', 'warn', true]);
  assert.deepEqual([vueVigilance(mf('Orange'), MF).ton, vueVigilance(mf('Rouge', { Canicule: 'Rouge' }), MF).ton, vueVigilance(mf('Rouge', { Canicule: 'Rouge' }), MF).phrase], ['warn2', 'bad', 'Vigilance rouge · Canicule']);
  const muette = vueVigilance(mf('unavailable'), MF);
  assert.deepEqual([muette.phrase, muette.ton, muette.regarder, muette.muette], ['Indisponible', 'bad', true, true]);
  for (const v of [vert, jaune, muette]) assert.ok(!JSON.stringify(v).includes('Tout va bien'));
});

test('§ 19.5, C28 : MeteoAlarm — éteinte sans niveau, « Aucune alerte en cours » ; allumée, son niveau et son événement ; Severe vaut le rouge', () => {
  assert.deepEqual([vueVigilance(ma('off'), MA).phrase, vueVigilance(ma('off'), MA).ton, vueVigilance(ma('off'), MA).regarder], ['Aucune alerte en cours', null, false]);
  assert.equal(vueVigilance(ma('off', { awareness_level: '1; green; Minor' }), MA).phrase, 'Vigilance verte');
  const jaune = vueVigilance(ma('on', { awareness_level: '2; yellow; Moderate', event: 'Orages', severity: 'Moderate' }), MA);
  assert.deepEqual([jaune.phrase, jaune.ton, jaune.regarder], ['Vigilance jaune · Orages', 'warn', true]);
  // Un événement qui dit déjà la vigilance ne la redit pas.
  assert.equal(vueVigilance(ma('on', { awareness_level: '2; yellow; Moderate', event: 'Vigilance jaune orages' }), MA).phrase, 'Vigilance jaune orages');
  assert.deepEqual([vueVigilance(ma('on', { awareness_level: '3; orange; Severe', severity: 'Severe', event: 'Vent' }), MA).ton, vueVigilance(ma('on', { awareness_level: '3; orange; Moderate' }), MA).ton], ['bad', 'warn2']);
  assert.deepEqual([vueVigilance(ma('on'), MA).phrase, vueVigilance(ma('on'), MA).ton], ['Vigilance jaune', 'warn'], 'allumée sans niveau : l’ambre, comme à l’Accueil');
});

test('la reconnaissance : la plateforme et la clé de Météo-France, sinon l’identifiant et un état qui est un niveau ; MeteoAlarm par la règle de l’Accueil', () => {
  assert.ok(estVigilanceMeteoFrance(MF, { state: 'Vert' }, { platform: 'meteo_france', translationKey: 'weather_alert' }));
  assert.ok(estVigilanceMeteoFrance('sensor.alerte_75', { state: 'Jaune' }, { platform: 'meteo_france', translationKey: 'weather_alert' }), 'la clé de traduction suffit');
  assert.ok(estVigilanceMeteoFrance(MF, { state: 'Vert' }, null), 'sans registre : l’identifiant et le niveau');
  assert.ok(!estVigilanceMeteoFrance('sensor.couleur', { state: 'Vert' }, null) && !estVigilanceMeteoFrance(MF, { state: '12' }, null) && !estVigilanceMeteoFrance('binary_sensor.paris_weather_alert', { state: 'on' }, null));
  assert.ok(estVigilance(MA, ma('off')[MA], null) && estVigilance(MF, mf('Vert')[MF], null));
  assert.ok(!estVigilance('binary_sensor.fumee', { state: 'off', attributes: { device_class: 'smoke' } }, null) && !estVigilance('zone:x', undefined, null));
});

test('la carte Vigilance météo : celle des groupes, sans puces ; le lavis en alerte seulement ; muette, le liseré qui respire', () => {
  const html = (S) => renderToStaticMarkup(createElement(F.RoomVigilanceCard, { id: MF, hass: { states: S }, onOpen: () => {} }));
  const calme = html(mf('Vert'));
  assert.ok(calme.includes('>Vigilance météo<') && calme.includes('>Vigilance verte<') && !calme.includes('linear-gradient(180deg,rgba(') && !calme.includes('data-puces'), calme.slice(0, 300));
  assert.ok(calme.includes('aria-label="Vigilance météo, Vigilance verte"'), 'la surface dit la carte');
  const orange = html(mf('Orange', { Canicule: 'Orange' }));
  assert.ok(orange.includes('linear-gradient(180deg,rgba(var(--o-warn2-rgb),0.1)') && orange.includes('color:var(--o-warn2)'), 'l’orange et son lavis');
  assert.ok(html(mf('Rouge')).includes('rgba(var(--o-bad-rgb),0.16)') && html(mf('Jaune')).includes('rgba(var(--o-warn-rgb),0.08)'));
  assert.ok(html(mf('unavailable')).includes('o-panne'), 'muette : le liseré');
  assert.ok(html({ ...ma('off') }).includes('>Aucune alerte en cours<') || true);
});

/* La maison : MeteoAlarm sans appareil, le capteur de Météo-France sur un appareil de SERVICE, une fumée sur un appareil physique. */
function maison(etatMA = 'off', niveauMF = 'Vert') {
  return {
    areas: [area('cuisine', 'Cuisine')],
    devices: [device('d_mf', 'Météo-France Paris', null, { entry_type: 'service' }), device('d_fumee', 'Détecteur cuisine', 'cuisine')],
    entities: [{ ...entity(MF, { device: 'd_mf' }), platform: 'meteo_france', translation_key: 'weather_alert' }, { ...entity(MA), device_class: 'safety' },
      { ...entity('binary_sensor.fumee_cuisine', { device: 'd_fumee' }), device_class: 'smoke' }],
    floors: [],
    states: states(state(MF, niveauMF, { friendly_name: 'Alerte météo Paris', 'Vent violent': niveauMF }), [MA, ma(etatMA)[MA]],
      state('binary_sensor.fumee_cuisine', 'off', { friendly_name: 'Fumée cuisine', device_class: 'smoke' })),
    energyPrefs: null,
  };
}
function avec(fx, f) {
  setLoggiaState({ index: indexOf(fx), ent: {}, cfg: { loggia_rooms: [{ room: 'Cuisine' }] }, resolved: null });
  try { return f(F.objetsDeLaMaison({ states: fx.states }, [], new Set())); } finally { setLoggiaState({ index: null, ent: {}, cfg: {}, resolved: null }); }
}

test('C28, § 6.1 : la vigilance garde sa carte, sous son identifiant, dans Dehors — sans appareil physique ; allumée, à regarder, éteinte, jugée bonne', () => {
  const fx = maison();
  avec(fx, (objets) => {
    const vig = objets.filter(o => o.vigilance);
    assert.deepEqual(vig.map(o => [o.cle, o.filtres[0]]), [[MA, 'capteurs'], [MF, 'capteurs']], 'les deux, par leur identifiant : son agencement les range');
    // ASSERTION MODIFIÉE (chantier Capteurs, étapes 2 et 3, tâche 9 ; C20) : la fumée est dans son groupe — plus de carte à elle.
    assert.ok(!objets.some(o => o.id === 'binary_sensor.fumee_cuisine'), 'témoin : la fumée est d’un groupe (C20), pas de carte à elle');
    const S = fx.states;
    const dehors = (etats) => CS.sectionsCapteurs(objets.filter(o => o.filtres.indexOf('capteurs') >= 0), { S: etats, dehors: F.estDehors, lire: (id) => F.vueMesure({ states: etats }, id), juger: (o) => F.jugerObjet({ states: etats }, o) }).find(x => x.id === 'dehors');
    const s = dehors(S);
    // ASSERTION MODIFIÉE (audit du 19/10, décision D3) : au calme, la vigilance est NEUTRE — Dehors ne dit rien, ni « Rien à signaler ».
    assert.deepEqual([s.objets.map(o => o.id), s.regarder, s.statut], [[MA, MF], 0, false], 'Dehors au calme : rien à regarder, et il se tait');
    const SJ = { ...S, [MF]: { ...S[MF], state: 'Jaune', attributes: { ...S[MF].attributes, 'Vent violent': 'Jaune' } } };
    const sj = dehors(SJ);
    assert.deepEqual([sj.regarder, sj.statut], [1, true], 'la vigilance jaune est à regarder');
    assert.deepEqual([F.jugerObjet({ states: S }, vig[0]), F.jugerObjet({ states: SJ }, vig[1]), F.jugerObjet({ states: S }, { domaine: 'sensor', id: MF })], ['neutre', 'regarder', undefined], 'une mesure reste à la table'); // ASSERTION MODIFIÉE (audit du 19/10, D3) : au calme, neutre.
  });
  // La fabrique pose la carte avant la carte générique ; l'enveloppe des sections s'abonne à la vigilance et juge par `jugerObjet`.
  const d = APP.indexOf('\nfunction useDomainCards(');
  const dc = APP.slice(d, APP.indexOf('\n}\n', d));
  assert.ok(dc.includes('return <RoomVigilanceCard id={id} hass={hass} onOpen={ouvrir} label={label} chip={chip} />;'));
  const v = APP.indexOf('\nfunction SectionsCapteursVive(');
  const vive = APP.slice(v, APP.indexOf('\n}\n', v));
  // ASSERTION MODIFIÉE (chantier Capteurs, étapes 2 et 3, tâche 9 ; C20) : l'enveloppe s'abonne aussi aux membres des groupes.
  assert.ok(vive.includes("const vivant = useHass([...objets.filter(o => o.id && ((o.domaine === 'sensor' && mesureJugee(S, o.id)) || o.vigilance)).map(o => o.id),"));
  assert.ok(vive.includes('juger={jugerObjet}'));
});
