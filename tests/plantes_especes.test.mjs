/* Les seuils d'une plante, ceux de son espèce (ADR 0390).
 *
 * Ce qui est garanti ici :
 *  - le jugement (objets.js, plantes.js) : une plante se juge sur SES plages — son espèce, sinon Plant Monitor, sinon la table
 *    générale, mesure par mesure ; sans espèce, rien ne change ; les conseils et la barre suivent ;
 *  - l'espèce gardée dans `loggia_plants` est relue sans confiance (plages lisibles seulement, image sûre seulement) ;
 *  - Open Plantbook (especes.js) : « Choisir l'espèce » n'existe que si l'intégration publie `search` ET `get` (règle 46) ; la
 *    recherche et la fiche passent par `call_service` avec `return_response` ; la fiche se relit dans l'entité à défaut ; une erreur
 *    se range en deux genres ; `poserEspece` n'écrit que la ligne de SA plante ;
 *  - Plant Monitor : sa copie des capteurs ne fait pas une plante de plus ; la plante prend son nom, sa pièce et ses seuils (ses
 *    `number`, à leur clé de traduction, la température en Celsius) ; si la sonde se cache, la plante de Plant Monitor la remplace ;
 *  - la configuration se lie d'abord à la plante de SA base : `sensor.ficus` ne prend pas celle de `sensor.ficus_2` ;
 *  - la fiche (choixespece.jsx) : la rangée « Espèce » — photo, nom, source —, absente sans rien à dire ; un compte ordinaire
 *    entend le refus ; la recherche, le choix, l'écriture, le retrait ;
 *  - la démo répond à `search` et `get` à la place de l'intégration, et son index les publie. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { area, device, entity, state, states } from './fixtures.mjs';
import { maisonPlantes, ctxDe } from './maison_capteurs.mjs';
import { monter, parcourir, texteDe } from './crochets.mjs';
import { plantesDecouvertes, plantesMaison, especeValide, plagesPlante, seuilsPlantMonitor, conseilsPlante, barrePlante, vuePlante, imageEspece } from '../src/plantes.js';
import { verdictsPlante, PLAGES_PLANTE } from '../src/objets.js';
import { plantbookDisponible, resultatsRecherche, especeDeOpb, chercherEspeces, lireEspece, poserEspece, genreErreur, CLE_PLANTES } from '../src/especes.js';

if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);
const { setLoggiaState, cfgVal } = await import('../src/state.js');
const { RangeeEspece, FeuilleEspece } = await import('../src/choixespece.jsx');
const { plantbookDemo } = await import('../src/demo.js');
const SRC = (f) => readFileSync(new URL('../src/' + f, import.meta.url), 'utf8');
const tic = () => new Promise(r => setTimeout(r, 0));

const MARGINATA = { pid: 'dracaena marginata', display_pid: 'Dracaena marginata', image_url: 'https://exemple.invalid/dracaena.jpg',
  min_soil_moist: 30, max_soil_moist: 60, min_temp: 12, max_temp: 30, min_light_lux: 1500, max_light_lux: 30000, min_soil_ec: 350, max_soil_ec: 1500 };
const ESPECE = especeDeOpb(MARGINATA);

/* ── Le jugement ──────────────────────────────────────────────────────────────────────────────────────────────────────── */

test('le jugement suit les plages de la plante ; sans elles, la table générale ne bouge pas', () => {
  assert.equal(verdictsPlante({ hum: 28 }).hum, 'ok', 'la table générale : 15 à 70 %');
  assert.equal(verdictsPlante({ hum: 28, plages: plagesPlante(ESPECE).plages }).hum, 'sec', 'son espèce : au moins 30 %');
  assert.deepEqual(plagesPlante(null).plages, PLAGES_PLANTE, 'sans espèce ni Plant Monitor : la table générale, entière');
  assert.equal(plagesPlante(null).source, null);
  const v = vuePlante({ hum: 28, plages: plagesPlante(ESPECE).plages });
  assert.equal(v.phrase, 'À arroser');
  assert.equal(v.ton, 'warn');
  assert.ok(v.regarder, 'une plante qui presse est à regarder (points d’attention)');
});

test('les plages se prennent mesure par mesure : son espèce, puis Plant Monitor, puis la table', () => {
  const espece = especeValide({ pid: 'x', plages: { hum: [30, 60], lux: [null, 9] } });
  const r = plagesPlante(espece, { hum: [10, 20], temp: [5, 25], lux: [700, 9000], cond: [null, 1800] });
  assert.deepEqual(r.plages, { hum: [30, 60], temp: [5, 25], lux: [700, 9000], cond: [350, 2000] });
  assert.equal(r.source, 'espece');
  assert.equal(plagesPlante(null, { temp: [5, 25] }).source, 'plantmonitor');
  assert.equal(plagesPlante(null, { temp: [25, 5] }).source, null, 'un bas au-dessus du haut ne compte pas');
});

test('les conseils et la barre de la fiche suivent les plages de la plante', () => {
  const plages = plagesPlante(ESPECE).plages;
  const c = conseilsPlante({ hum: 28, lux: 84, luxJour: 84, plages });
  assert.equal(c[0], 'Arrosez-la : le sol est à 28 %, il lui en faut au moins 30 %.');
  assert.match(c[1], /^Rapprochez-la d’une fenêtre : 84 lx reçus, il lui en faut au moins 1\s500\.$/);
  assert.deepEqual(conseilsPlante({ hum: 28 }), [], 'sans plages : la table générale, le sol va bien');
  assert.deepEqual(barrePlante('hum', 28, plages).plage, [30, 60]);
  assert.deepEqual(barrePlante('hum', 28).plage, [15, 70], 'sans plages : la table');
});

/* ── L'espèce gardée ──────────────────────────────────────────────────────────────────────────────────────────────────── */

test('l’espèce gardée se relit sans confiance : un pid, des plages lisibles, une image sûre', () => {
  assert.equal(especeValide(null), null);
  assert.equal(especeValide({ nom: 'Sans pid' }), null);
  assert.equal(especeValide({ pid: '' }), null);
  // ASSERTION MODIFIÉE (ADR 0391) : `dessin`, nul sans dessin gardé.
  assert.deepEqual(especeValide({ pid: 'ficus', plages: { hum: [20, 60], temp: ['12', 30], lux: [9, 1], cond: [1, 2, 3] } }),
    { pid: 'ficus', nom: 'ficus', image: null, plages: { hum: [20, 60] }, dessin: null });
  assert.equal(imageEspece('https://exemple.invalid/a.jpg'), 'https://exemple.invalid/a.jpg');
  assert.equal(imageEspece('/local/images/plants/ficus.jpg'), '/local/images/plants/ficus.jpg');
  assert.equal(imageEspece('./plantes/dracaena.svg'), './plantes/dracaena.svg');
  ['javascript:alert(1)', '//exemple.invalid/a.jpg', 'data:image/png;base64,AAAA', 42, null].forEach(x => assert.equal(imageEspece(x), null, String(x)));
});

/* ── Open Plantbook ───────────────────────────────────────────────────────────────────────────────────────────────────── */

test('règle 46 : « Choisir l’espèce » n’existe que si l’intégration publie search ET get', () => {
  const avec = { openplantbook: { search: {}, get: {} } };
  assert.equal(plantbookDisponible({ services: { ...avec, light: {} } }), true);
  assert.equal(plantbookDisponible({ services: { light: {} } }, { services: avec }), false, 'les services vivants font foi');
  assert.equal(plantbookDisponible({ services: { openplantbook: { search: {} } } }), false, 'sans get');
  assert.equal(plantbookDisponible({}, { services: avec }), true, 'sans services vivants : ceux de l’index');
  assert.equal(plantbookDisponible(null, null), false);
});

test('la recherche et la fiche d’une espèce passent par call_service, réponse comprise', async () => {
  const envois = [];
  const hass = { states: {}, callWS: (m) => { envois.push(m); return Promise.resolve(m.service === 'search'
    ? { context: {}, response: { 'dracaena marginata': 'Dracaena marginata', 'dracaena fragrans': 'Dracaena fragrans', faux: 3 } }
    : { context: {}, response: MARGINATA }); } };
  assert.deepEqual(await chercherEspeces(hass, 'dracaena'), [{ pid: 'dracaena marginata', nom: 'Dracaena marginata' }, { pid: 'dracaena fragrans', nom: 'Dracaena fragrans' }]);
  assert.deepEqual(envois[0], { type: 'call_service', domain: 'openplantbook', service: 'search', service_data: { alias: 'dracaena' }, return_response: true });
  const e = await lireEspece(hass, 'dracaena marginata');
  assert.equal(envois[1].service, 'get');
  assert.deepEqual(envois[1].service_data, { species: 'dracaena marginata' });
  // ASSERTION MODIFIÉE (ADR 0391) : l'espèce lue porte aussi le dessin de son genre, pour la carte.
  assert.deepEqual(e, { pid: 'dracaena marginata', nom: 'Dracaena marginata', image: 'https://exemple.invalid/dracaena.jpg',
    plages: { hum: [30, 60], temp: [12, 30], lux: [1500, 30000], cond: [350, 1500] }, dessin: 'dracaena' });
});

test('sans réponse, la fiche se relit dans l’entité openplantbook de l’espèce ; inconnue, rien', async () => {
  const S = { 'openplantbook.dracaena_marginata': { state: 'Dracaena marginata', attributes: MARGINATA } };
  const hass = { states: S, callWS: () => Promise.resolve({ context: {}, response: {} }) };
  assert.equal((await lireEspece(hass, 'dracaena marginata')).nom, 'Dracaena marginata');
  assert.equal(await lireEspece(hass, 'inconnue'), null);
});

test('la fiche d’Open Plantbook : des nombres en texte se lisent, un seuil manquant laisse la table', () => {
  const e = especeDeOpb({ pid: 'ficus', min_soil_moist: '20', max_soil_moist: '60', min_temp: null, max_temp: 30, image_url: 'javascript:x' });
  // ASSERTION MODIFIÉE (ADR 0391) : la fiche porte le dessin de son genre.
  assert.deepEqual(e, { pid: 'ficus', nom: 'ficus', image: null, plages: { hum: [20, 60] }, dessin: 'ficus' });
  assert.equal(especeDeOpb({ display_pid: 'Sans pid' }), null);
  assert.deepEqual(resultatsRecherche({ a: 'A', b: 'B' }), [{ pid: 'a', nom: 'A' }, { pid: 'b', nom: 'B' }], 'une réponse nue');
  assert.deepEqual(resultatsRecherche(null), []);
  assert.equal(resultatsRecherche({ response: Object.fromEntries(Array.from({ length: 40 }, (_, i) => ['p' + i, 'P' + i])) }).length, 30, 'trente au plus');
  assert.equal(genreErreur({ message: 'OpenPlantbook API rate limit exceeded. Please try again later.' }), 'limite');
  assert.equal(genreErreur({ code: 'home_assistant_error', message: 'Authentication failed' }), 'panne');
  assert.equal(genreErreur(null), 'panne');
});

test('poserEspece n’écrit que la ligne de SA plante ; la ligne qu’il a créée part avec l’espèce, celle écrite à la main reste', () => {
  const avant = [{ base: 'sensor.basilic', name: 'Basilic', room: 'Cuisine' }, { base: 'sensor.ficus', name: 'Ficus', espece: { pid: 'vieux' } }];
  const ajout = poserEspece(avant, 'sensor.dracaena', ESPECE);
  assert.deepEqual(ajout.slice(0, 2), avant, 'les autres lignes ne bougent pas');
  assert.deepEqual(ajout[2], { base: 'sensor.dracaena', decouverte: true, espece: ESPECE }, 'une plante découverte y entre par sa base seule, marquée');
  assert.deepEqual(poserEspece(avant, 'sensor.ficus', ESPECE)[1], { base: 'sensor.ficus', name: 'Ficus', espece: ESPECE }, 'son nom reste');
  assert.deepEqual(poserEspece(avant, 'sensor.ficus', null)[1], { base: 'sensor.ficus', name: 'Ficus' }, 'une ligne écrite à la main reste, sans espèce');
  assert.deepEqual(poserEspece(ajout, 'sensor.dracaena', null), avant, 'la ligne créée pour l’espèce part avec elle');
  assert.deepEqual(poserEspece(null, 'sensor.x', null), []);
  assert.equal(avant[1].espece.pid, 'vieux', 'rien n’est modifié en place');
});

test('une ligne créée pour l’espèce ne fait que compléter : sans sa plante, elle se tait', () => {
  const fx = maisonPlantes();
  const p = plantesMaison(fx.states, ctxDe(fx, ['Bureau', 'Séjour']), [{ base: 'sensor.ficus', decouverte: true, espece: { pid: 'ficus lyrata' } },
    { base: 'sensor.disparue', decouverte: true, espece: { pid: 'x' } }]);
  assert.equal(p.find(x => x.base === 'sensor.ficus').nom, 'Ficus', 'le nom reste celui de l’appareil');
  assert.equal(p.find(x => x.base === 'sensor.ficus').espece.pid, 'ficus lyrata');
  assert.ok(!p.some(x => x.base === 'sensor.disparue'), 'pas de plante fantôme');
});

test('Open Plantbook muet : passé 20 s, la recherche dit que l’intégration ne répond pas', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const attente = chercherEspeces({ callWS: () => new Promise(() => {}) }, 'ficus').then(() => 'réponse', (e) => genreErreur(e));
  await Promise.resolve();
  t.mock.timers.tick(20000);
  assert.equal(await attente, 'panne');
});

/* ── Plant Monitor ────────────────────────────────────────────────────────────────────────────────────────────────────── */

/* Une Mi Flora dans la zone « Technique », et la plante que Plant Monitor en a faite au Séjour : ses copies des capteurs
 * (`external_sensor`), ses seuils (`number`, clés de traduction ; la température en °F), son entité `plant`. */
function maisonPlantMonitor({ sondeCachee = false } = {}) {
  const cap = (id, dev, classe, opt = {}) => ({ ...entity(id, { device: dev, ...opt }), device_class: classe });
  const m = (id, v, nom, classe, unite, extra = {}) => state(id, v, { friendly_name: nom, ...(classe ? { device_class: classe } : {}), unit_of_measurement: unite, ...extra });
  const seuil = (id, cle, v, unite) => [entity(id, { device: 'd_pm', key: cle }), state(id, v, { unit_of_measurement: unite })];
  const seuils = [
    seuil('number.monstera_min_soil_moisture', 'min_moisture', 25, '%'), seuil('number.monstera_max_soil_moisture', 'max_moisture', 65, '%'),
    seuil('number.monstera_min_temperature', 'min_temperature', 50, '°F'), seuil('number.monstera_max_temperature', 'max_temperature', 86, '°F'),
    seuil('number.monstera_min_illuminance', 'min_illuminance', 800, 'lx'), seuil('number.monstera_max_illuminance', 'max_illuminance', 20000, 'lx'),
    seuil('number.monstera_min_conductivity', 'min_conductivity', 400, 'µS/cm'), seuil('number.monstera_max_conductivity', 'max_conductivity', 1800, 'µS/cm'),
  ];
  return {
    areas: [area('technique', 'Technique'), area('sejour', 'Séjour')],
    devices: [device('d_flora', 'Flower care', 'technique', { manufacturer: 'Xiaomi', model: 'HHCCJCY01' }), device('d_pm', 'Monstera du salon', 'sejour', { manufacturer: 'OpenPlantbook', model: 'Monstera deliciosa' })],
    entities: [
      cap('sensor.flower_care_moisture', 'd_flora', 'moisture', { hidden: sondeCachee }), cap('sensor.flower_care_conductivity', 'd_flora', 'conductivity'),
      cap('sensor.flower_care_temperature', 'd_flora', 'temperature'), cap('sensor.flower_care_battery', 'd_flora', 'battery', { category: 'diagnostic' }),
      entity('plant.monstera', { device: 'd_pm' }),
      cap('sensor.monstera_soil_moisture', 'd_pm', 'moisture', { key: 'moisture' }), cap('sensor.monstera_conductivity', 'd_pm', 'conductivity', { key: 'conductivity' }),
      cap('sensor.monstera_temperature', 'd_pm', 'temperature', { key: 'temperature' }),
      ...seuils.map(s => s[0]),
    ],
    floors: [],
    states: states(
      m('sensor.flower_care_moisture', 22, 'Flower care humidité', 'moisture', '%'), m('sensor.flower_care_conductivity', 640, 'Flower care conductivité', 'conductivity', 'µS/cm'),
      m('sensor.flower_care_temperature', 21, 'Flower care température', 'temperature', '°C'), m('sensor.flower_care_battery', 80, 'Flower care pile', 'battery', '%'),
      state('plant.monstera', 'ok', { friendly_name: 'Monstera du salon', species: 'Monstera deliciosa', entity_picture: 'https://exemple.invalid/monstera.jpg' }),
      m('sensor.monstera_soil_moisture', 22, 'Monstera du salon humidité', 'moisture', '%', { external_sensor: 'sensor.flower_care_moisture' }),
      m('sensor.monstera_conductivity', 640, 'Monstera du salon conductivité', 'conductivity', 'µS/cm', { external_sensor: 'sensor.flower_care_conductivity' }),
      m('sensor.monstera_temperature', 21, 'Monstera du salon température', 'temperature', '°C', { external_sensor: 'sensor.flower_care_temperature' }),
      ...seuils.map(s => s[1]),
    ),
  };
}
const PM_SEUILS = { hum: ['number.monstera_min_soil_moisture', 'number.monstera_max_soil_moisture'], temp: ['number.monstera_min_temperature', 'number.monstera_max_temperature'],
  lux: ['number.monstera_min_illuminance', 'number.monstera_max_illuminance'], cond: ['number.monstera_min_conductivity', 'number.monstera_max_conductivity'] };

test('Plant Monitor : sa copie ne fait pas une plante de plus ; la plante prend son nom, sa pièce, ses seuils', () => {
  const fx = maisonPlantMonitor();
  const p = plantesDecouvertes(fx.states, ctxDe(fx, ['Séjour']));
  assert.equal(p.length, 1, 'une plante, pas deux');
  assert.equal(p[0].capteurs.hum, 'sensor.flower_care_moisture', 'la sonde reste la plante');
  assert.equal(p[0].base, 'sensor.flower_care', 'sa clé ne bouge pas');
  assert.deepEqual([p[0].nom, p[0].piece], ['Monstera du salon', 'Séjour'], 'le nom et la pièce de la plante de Plant Monitor');
  assert.equal(p[0].pm.plante, 'plant.monstera');
  assert.deepEqual(p[0].pm.seuils, PM_SEUILS);
  assert.ok(p[0].pm.copies.includes('sensor.monstera_soil_moisture') && p[0].pm.copies.includes('sensor.monstera_conductivity'), 'ses copies, pour la configuration d’avant');
  const s = seuilsPlantMonitor(fx.states, p[0].pm);
  assert.deepEqual(s, { hum: [25, 65], temp: [10, 30], lux: [800, 20000], cond: [400, 1800] }, 'la température en Celsius');
  assert.equal(plagesPlante(null, s).source, 'plantmonitor');
});

test('Plant Monitor : une configuration posée sur la base de ses copies retrouve la plante, sans plante en double', () => {
  const fx = maisonPlantMonitor();
  const p = plantesMaison(fx.states, ctxDe(fx, ['Séjour']), [{ base: 'sensor.monstera', name: 'Ma monstera' }]);
  assert.deepEqual(p.map(x => [x.base, x.nom, !!x.capteurs]), [['sensor.monstera', 'Ma monstera', true]], 'sa clé plant:sensor.monstera et son nom tiennent');
});

test('Plant Monitor : la sonde cachée, la plante de Plant Monitor la remplace', () => {
  const fx = maisonPlantMonitor({ sondeCachee: true });
  const p = plantesDecouvertes(fx.states, ctxDe(fx, ['Séjour']));
  assert.equal(p.length, 1);
  assert.deepEqual([p[0].capteurs.hum, p[0].capteurs.cond, p[0].pm.plante], ['sensor.monstera_soil_moisture', 'sensor.monstera_conductivity', 'plant.monstera']);
});

test('sans Plant Monitor, rien ne change : pas de seuils, les plantes d’avant', () => {
  const fx = maisonPlantes();
  const p = plantesDecouvertes(fx.states, ctxDe(fx, ['Bureau', 'Séjour']));
  assert.deepEqual(p.map(x => [x.nom, x.pm]), [['Monstera', null], ['Ficus', null], ['Orchidée', null]]);
  assert.equal(seuilsPlantMonitor(fx.states, null), null);
});

/* ── La configuration ─────────────────────────────────────────────────────────────────────────────────────────────────── */

test('la configuration se lie à la plante de SA base : sensor.ficus ne prend pas celle de sensor.ficus_2', () => {
  const cap = (id, dev, classe) => ({ ...entity(id, { device: dev }), device_class: classe });
  const m = (id, v, classe, unite) => state(id, v, { device_class: classe, unit_of_measurement: unite });
  const fx = {
    areas: [], floors: [], devices: [device('d1', 'Ficus un'), device('d2', 'Ficus deux')],
    entities: [cap('sensor.ficus_moisture', 'd1', 'moisture'), cap('sensor.ficus_conductivity', 'd1', 'conductivity'),
      cap('sensor.ficus_2_moisture', 'd2', 'moisture'), cap('sensor.ficus_2_conductivity', 'd2', 'conductivity')],
    states: states(m('sensor.ficus_moisture', 30, 'moisture', '%'), m('sensor.ficus_conductivity', 500, 'conductivity', 'µS/cm'),
      m('sensor.ficus_2_moisture', 30, 'moisture', '%'), m('sensor.ficus_2_conductivity', 500, 'conductivity', 'µS/cm')),
  };
  const conf = [{ base: 'sensor.ficus', espece: { pid: 'ficus lyrata', plages: { hum: [20, 60] } } }, { base: 'sensor.ficus_2', espece: { pid: 'ficus benjamina' } }];
  const p = plantesMaison(fx.states, ctxDe(fx, []), conf);
  assert.deepEqual(p.map(x => [x.nom, x.base, x.espece && x.espece.pid]), [['Ficus deux', 'sensor.ficus_2', 'ficus benjamina'], ['Ficus un', 'sensor.ficus', 'ficus lyrata']]);
});

test('l’espèce suit la plante, découverte ou configurée sans appareil', () => {
  const fx = maisonPlantes();
  const conf = [{ base: 'sensor.ficus', espece: { pid: 'ficus lyrata', nom: 'Ficus lyrata', plages: { hum: [20, 60] }, image: 'javascript:x' } },
    { base: 'sensor.basilic', name: 'Basilic', espece: { pid: 'ocimum basilicum' } }];
  const p = plantesMaison(fx.states, ctxDe(fx, ['Bureau', 'Séjour']), conf);
  // ASSERTION MODIFIÉE (ADR 0391) : `dessin`, nul sans dessin gardé.
  assert.deepEqual(p.find(x => x.base === 'sensor.ficus').espece, { pid: 'ficus lyrata', nom: 'Ficus lyrata', image: null, plages: { hum: [20, 60] }, dessin: null });
  assert.equal(p.find(x => x.base === 'sensor.basilic').espece.pid, 'ocimum basilicum');
  assert.equal(p.find(x => x.base === 'sensor.orchidee').espece, null);
});

/* ── La fiche ─────────────────────────────────────────────────────────────────────────────────────────────────────────── */

const OPB = { openplantbook: { search: {}, get: {} } };
const PLANTE = { base: 'sensor.dracaena', name: 'Dracaena Marginata', espece: null, source: null };
const rangee = (pl, hass) => renderToStaticMarkup(createElement(RangeeEspece, { pl, hass, onChoisir: () => {} }));

test('la rangée Espèce : absente sans rien à dire ; « Choisir l’espèce » quand Open Plantbook est là ; photo, nom, source', () => {
  setLoggiaState({ index: null, ent: {}, cfg: {}, resolved: null });
  assert.equal(rangee(PLANTE, { services: { light: {} } }), '', 'ni espèce, ni Plant Monitor, ni Open Plantbook : rien (règle 46)');
  const choix = rangee(PLANTE, { services: OPB });
  assert.ok(choix.includes('Choisir l’espèce') && choix.includes('Ses seuils remplaceront les repères généraux') && choix.includes('aria-haspopup="dialog"'));
  const avec = rangee({ ...PLANTE, espece: ESPECE, source: 'espece' }, { services: OPB });
  assert.ok(avec.includes('Dracaena marginata') && avec.includes('Ses seuils viennent d’Open Plantbook'));
  assert.ok(avec.includes('src="https://exemple.invalid/dracaena.jpg"'), 'sa photo');
  assert.match(avec, /referrerpolicy="no-referrer"/i, 'sans référent');
  const lue = rangee({ ...PLANTE, espece: ESPECE, source: 'espece' }, { services: { light: {} } });
  assert.ok(lue.includes('Dracaena marginata') && !lue.includes('<button'), 'Open Plantbook parti : l’espèce gardée se lit, sans rien à choisir');
  const pm = rangee({ ...PLANTE, espece: { pid: null, nom: 'Monstera deliciosa', image: 'javascript:x' }, source: 'plantmonitor' }, {});
  assert.ok(pm.includes('Monstera deliciosa') && pm.includes('Ses seuils viennent de Plant Monitor') && !pm.includes('<img'), 'l’image de Plant Monitor se garde aussi');
});

test('un compte ordinaire lit la rangée ; un appui lui dit le refus, qui nomme la clé', () => {
  setLoggiaState({ index: null, ent: {}, cfg: {}, resolved: null });
  let ouvert = 0;
  const m = monter(RangeeEspece, { pl: PLANTE, hass: { services: OPB, user: { is_admin: false } }, onChoisir: () => { ouvert++; } });
  const [bouton] = m.trouver(e => e.type === 'button');
  assert.equal(bouton.props['aria-disabled'], 'true');
  m.appuyer(bouton);
  assert.equal(ouvert, 0, 'la recherche ne s’ouvre pas');
  assert.match(m.texte(), /loggia_plants/);
});

// La feuille : le harnais ne rend pas `BottomSheet` ; son contenu est la fonction qu'elle reçoit.
const feuille = (props) => {
  const m = monter(FeuilleEspece, props);
  const dedans = () => m.arbre.props.children();
  const tous = (pred) => { const r = []; parcourir(dedans(), (e) => { if (pred(e)) r.push(e); }); return r; };
  const taper = async (q) => {
    tous(e => e.type === 'input')[0].props.onChange({ target: { value: q } });
    m.effets();
    tous(e => e.type === 'form')[0].props.onSubmit({ preventDefault() {} });
    m.effets();
  };
  return { m, dedans, tous, taper };
};

test('la recherche : « Chercher », la liste ; un choix lit ses seuils et les garde', async () => {
  setLoggiaState({ index: null, ent: {}, cfg: { [CLE_PLANTES]: [{ base: 'sensor.basilic', name: 'Basilic' }] }, resolved: null });
  const envois = [];
  const hass = { states: {}, services: OPB, callWS: (msg) => { envois.push(msg); return Promise.resolve({ response: plantbookDemo(msg.service, msg.service_data) }); } };
  let fini = 0, ferme = 0;
  const f = feuille({ pl: PLANTE, hass, onClose: () => { ferme++; }, onFini: () => { fini++; } });
  assert.equal(f.tous(e => e.type === 'button' && e.props.type === 'submit')[0].props.disabled, true, 'rien tapé : rien à chercher');
  await f.taper('dragonnier');
  assert.match(texteDe(f.dedans()), /Recherche…/);
  await tic();
  f.m.effets();
  const lignes = f.tous(e => e.type === 'button' && e.props.type === 'button' && e.props.onClick && !e.props['data-croix']);
  assert.deepEqual(lignes.map(b => texteDe(b.props.children)), ['Dracaena marginata', 'Dracaena fragrans', 'Dracaena reflexa'], 'dans l’ordre de la réponse');
  assert.deepEqual(envois.map(x => [x.service, x.service_data]), [['search', { alias: 'dragonnier' }]], 'une recherche par « Chercher », pas par frappe');
  lignes[0].props.onClick();
  f.m.effets();
  await tic();
  await tic();
  f.m.effets();
  assert.deepEqual(envois[1], { type: 'call_service', domain: 'openplantbook', service: 'get', service_data: { species: 'dracaena marginata' }, return_response: true });
  const garde = cfgVal(CLE_PLANTES, null);
  assert.deepEqual(garde[0], { base: 'sensor.basilic', name: 'Basilic' }, 'l’autre plante ne bouge pas');
  assert.equal(garde[1].base, 'sensor.dracaena');
  assert.deepEqual(garde[1].espece.plages, { hum: [15, 60], temp: [12, 32], lux: [1500, 30000], cond: [350, 1500] });
  assert.equal(garde[1].espece.image, './plantes/dracaena.svg');
  assert.deepEqual([fini, ferme], [1, 1], 'la coquille relit la plante, la feuille se ferme');
  f.m.demonter();
});

test('rouverte : l’espèce de la plante en bleu plein (la puce choisie) ; « Revenir aux repères généraux » la retire', async () => {
  setLoggiaState({ index: null, ent: {}, cfg: { [CLE_PLANTES]: [{ base: 'sensor.dracaena', espece: ESPECE }] }, resolved: null });
  const hass = { states: {}, services: OPB, callWS: (msg) => Promise.resolve({ response: plantbookDemo(msg.service, msg.service_data) }) };
  const f = feuille({ pl: { ...PLANTE, espece: ESPECE }, hass, onClose: () => {} });
  await f.taper('dracaena');
  await tic();
  f.m.effets();
  const choisie = f.tous(e => e.type === 'button' && e.props['aria-current'] === 'true');
  assert.equal(choisie.length, 1);
  assert.match(texteDe(choisie[0].props.children), /Dracaena marginata/);
  assert.equal(choisie[0].props.style.background, 'var(--o-accent-fond)');
  const retirer = f.tous(e => e.type === 'button' && /Revenir aux repères généraux/.test(texteDe(e.props.children)))[0];
  retirer.props.onClick();
  await tic();
  assert.deepEqual(cfgVal(CLE_PLANTES, null), [{ base: 'sensor.dracaena' }], 'la ligne reste, sans espèce');
  f.m.demonter();
});

test('une erreur d’Open Plantbook se dit : la limite du compte, ou l’intégration qui ne répond pas', async () => {
  setLoggiaState({ index: null, ent: {}, cfg: {}, resolved: null });
  for (const [message, attendu] of [['OpenPlantbook API rate limit exceeded. Please try again later.', 'Open Plantbook limite les recherches'], ['Authentication failed', 'Open Plantbook ne répond pas']]) {
    const hass = { states: {}, services: OPB, callWS: () => Promise.reject({ code: 'home_assistant_error', message }) };
    const f = feuille({ pl: PLANTE, hass, onClose: () => {} });
    await f.taper('ficus');
    await tic();
    f.m.effets();
    assert.ok(texteDe(f.dedans()).includes(attendu), attendu);
    f.m.demonter();
  }
});

test('la fiche pose la rangée entre le panneau du sol et les mesures, et juge sur les plages de la plante', () => {
  const f = SRC('ficheplante.jsx');
  const ici = f.indexOf('<RangeeEspece pl={pl} hass={hass} onChoisir={() => setChoix(true)} />');
  assert.ok(ici > f.indexOf('{conseils.map(') && ici < f.indexOf('{mesures.map('), 'après les conseils, avant les mesures');
  assert.ok(f.includes('{choix && <FeuilleEspece pl={pl} hass={hass} onClose={() => setChoix(false)} onFini={onEspece} />}'));
  assert.ok(f.includes('const P = pl.plages || PLAGES_PLANTE;') && f.includes('{barre(m.cle, v.muette ? null : m.valeur, P)}'));
  const lire = SRC('appareils/fiches.jsx');
  const i = lire.indexOf('\nfunction lirePlante(');
  assert.ok(lire.slice(i, lire.indexOf('\n}\n', i)).includes('const { plages, source } = plagesPlante(p.espece, seuilsPlantMonitor(S, p.pm, hass));'), 'la lecture de la plante porte ses plages');
  assert.ok(!/['"]#fff['"]/.test(SRC('choixespece.jsx')), 'le blanc de la puce choisie, jamais écrit ici');
});

test('la démo répond à la place d’Open Plantbook, et son index publie search et get', () => {
  assert.deepEqual(plantbookDemo('search', { alias: ' Basilic ' }), { 'ocimum basilicum': 'Ocimum basilicum' }, 'sans majuscules, par son nom commun');
  assert.deepEqual(plantbookDemo('search', { alias: '' }), {});
  const d = plantbookDemo('get', { species: 'schefflera arboricola' });
  assert.equal(d.display_pid, 'Schefflera arboricola');
  assert.equal(d.image_url, './plantes/schefflera.svg');
  assert.ok(especeDeOpb(d).plages.hum, 'ses plages se lisent comme celles de l’intégration');
  assert.deepEqual(plantbookDemo('get', { species: 'inconnue' }), {});
  const demo = SRC('demo.js');
  assert.ok(demo.includes("services: { openplantbook: { search: { fields: ['alias'] }, get: { fields: ['cache', 'include', 'species'] } } },"));
  assert.ok(demo.includes("msg.domain === 'openplantbook' && (msg.service === 'search' || msg.service === 'get')"));
});
