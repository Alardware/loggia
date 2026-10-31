/* Objets › Capteurs en sections (chantier Capteurs, § 5 ; C5, C6, C7, C10).
 *
 * Ce qui est garanti ici :
 *  - C6, C7 : une carte PAR MESURE, pas par appareil, pour une mesure de la
 *    table qui est dans une pièce de Loggia et n'est ni la sonde d'un
 *    thermostat, ni celle d'une plante, ni un diagnostic ; les autres capteurs
 *    gardent leur règle ;
 *  - C14 : hors des pièces de Loggia — une zone qu'il ne compte pas, ou aucune
 *    zone —, une mesure entre par son appareil PHYSIQUE ; une température
 *    calculée, sans appareil, ou celle d'un service (la météo), n'entre pas ;
 *  - C13 : dans Objets, la carte d'une mesure porte le nom de sa pièce, sauf deux
 *    mesures de la même famille dans la même pièce, ou une mesure sans pièce ;
 *    un nom posé à la main l'emporte ; la compacte garde son nom ;
 *  - C15 (révisé le 16/10, passe 1 ter) : dehors a ses zones, mais rien n'y est
 *    une alerte — rien « à regarder », et Dehors ne dit jamais « Rien à
 *    signaler » ;
 *  - C16 (16/10) : une carte de mesure demande un appareil physique, dans une
 *    pièce de Loggia comme ailleurs — ni une prévision, ni un calcul ;
 *  - C17 (16/10, passe 1 quater) : une mesure n'est JUGÉE que dans une pièce de
 *    Loggia ; sans zone, elle entre, neutre ; dans une zone que Loggia ne compte
 *    pas parmi ses pièces (les sondes d'une carte mère, « network »), elle n'entre
 *    pas — le garage de cette maison non plus ;
 *  - C10 : les sections, dans l'ordre de sa maquette — Air, Confort, Maison,
 *    Dehors, Plantes et piles —, une section vide ne paraît pas ;
 *  - § 5 : l'en-tête « {n} cartes · {k} à regarder », et à côté du titre de
 *    chaque section de mesures « {k} à regarder » ou « Rien à signaler » ; Maison
 *    et Plantes et piles ne disent rien avant les étapes 2 et 3 ;
 *  - la vue : sous Capteurs, hors édition, les sections ; l'édition garde la
 *    grille ;
 *  - correction bis : les sections lisent les mesures EN DIRECT (point 1) ; une
 *    section ne dit son état que si elle juge ce qu'elle montre (point 2) ; un
 *    module introuvable rend la place à la grille ordinaire (point 4) ;
 *  - correction bis 2 : l'enveloppe ne suit que les mesures jugées, et la grille
 *    d'une section ne se redessine pas pour le décompte (point 2) ; « {k} à
 *    regarder » dès que k > 0, même quand la section ne sait pas tout juger
 *    (point 3).
 * `objetsDeLaMaison`, `vueMesure` et `estDehors` vivent dans App.jsx : sous
 * `?capteurs_sections`, un crochet de chargement leur ajoute un export. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';

import { area, device, entity, state, states, ctxOf } from './fixtures.mjs';
import { monter } from './crochets.mjs';

import { MONOLITHE } from './monolithe.mjs'; // App.jsx et ce qui en sort (ADR 0282)
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);
register('data:text/javascript,' + encodeURIComponent([
  'export async function load(url, ctx, next) {',
  "  if (!url.endsWith('/src/App.jsx?capteurs_sections')) return next(url, ctx);",
  "  const r = await next(url.slice(0, -'?capteurs_sections'.length), ctx);",
  "  return { ...r, source: String(r.source) + ';export { objetsDeLaMaison, vueMesure, estDehors, mesureJugee };' };",
  '}',
].join('\n')));
const { setLoggiaState } = await import('../src/state.js');
const F = await import(new URL('../src/App.jsx?capteurs_sections', import.meta.url).href);
const CS = await import('../src/capteurssections.jsx');
const APP = MONOLITHE;

/* Une maison : le capteur de la chambre (CO₂, température, humidité, bruit, et un
 * diagnostic), un second CO₂ dans la chambre, le thermostat du salon et sa sonde,
 * un capteur de plante, la station du jardin, une pression, une porte, une
 * température calculée sans pièce, celle d'un service météo, un garage que
 * Loggia ne compte pas parmi ses pièces, et un CO₂ nomade, sans zone.
 * Ajoutés à la passe 1 ter (16/10, C16), son cas : dans le jardin, une pièce de
 * Loggia, l'humidité d'une PRÉVISION (un appareil de service) et une humidité
 * CALCULÉE, sans appareil — à côté de l'hygromètre de la station.
 * Ajoutés à la passe 1 quater (16/10, C17), son cas encore : la sonde d'une carte
 * mère (Glances), dans la zone « network », et son « Capteur Frigo », un appareil
 * sans zone. */
function maison() {
  const mesure = (id, dev, classe, opt = {}) => ({ ...entity(id, { device: dev, ...opt }), device_class: classe });
  const m = (id, v, nom, classe, unite) => state(id, v, { friendly_name: nom, device_class: classe, unit_of_measurement: unite, state_class: 'measurement' });
  return {
    areas: [area('salon', 'Salon'), area('chambre', 'Chambre'), area('jardin', 'Jardin'), area('garage', 'Garage'), area('network', 'network')],
    devices: [
      device('d_chambre', 'Capteur chambre', 'chambre', { manufacturer: 'Netatmo', model: 'Healthy Home Coach' }),
      device('d_thermostat', 'Thermostat salon', 'salon', { manufacturer: 'Netatmo', model: 'Smart Thermostat' }),
      device('d_plante', 'Capteur ficus', 'salon', { manufacturer: 'Xiaomi', model: 'Flower care' }),
      device('d_station', 'Station jardin', 'jardin', { manufacturer: 'Netatmo', model: 'Wind gauge' }),
      device('d_garage', 'Capteur garage', 'garage', { manufacturer: 'Aqara', model: 'Temperature' }),
      device('d_lino', 'Capteur Lino', 'chambre', { manufacturer: 'Netatmo', model: 'Healthy Home Coach' }),
      device('d_nomade', 'CO₂ nomade', null, { manufacturer: 'Aranet', model: 'Aranet4' }),
      device('d_meteo', 'Météo', null, { manufacturer: 'Météo-France', entry_type: 'service' }),
      device('d_prevision', 'Prévision jardin', 'jardin', { manufacturer: 'Météo-France', entry_type: 'service' }),
      device('d_unraid', 'Serveur', 'network', { manufacturer: 'Glances', model: 'Linux' }),
      device('d_frigo', 'Capteur Frigo', null, { manufacturer: 'Sonoff', model: 'SNZB-02' }),
      // ASSERTION MODIFIÉE (audit du 19/10, M8) : C16 vaut pour TOUS les capteurs — la pression du salon a désormais son baromètre.
      device('d_barometre', 'Baromètre salon', 'salon', { manufacturer: 'Netatmo', model: 'Indoor' }),
    ],
    entities: [
      mesure('sensor.chambre_co2', 'd_chambre', 'carbon_dioxide'), mesure('sensor.chambre_temperature', 'd_chambre', 'temperature'),
      mesure('sensor.chambre_humidite', 'd_chambre', 'humidity'), mesure('sensor.chambre_bruit', 'd_chambre', 'sound_pressure'),
      mesure('sensor.chambre_wifi_temperature', 'd_chambre', 'temperature', { category: 'diagnostic' }),
      entity('climate.salon', { device: 'd_thermostat' }), mesure('sensor.salon_thermostat_temperature', 'd_thermostat', 'temperature'),
      mesure('sensor.ficus_lumiere', 'd_plante', 'illuminance'), mesure('sensor.ficus_conductivite', 'd_plante', 'conductivity'),
      mesure('sensor.jardin_vent', 'd_station', 'wind_speed'), mesure('sensor.jardin_temperature', 'd_station', 'temperature'),
      mesure('sensor.jardin_humidite', 'd_station', 'humidity'), mesure('sensor.prevision_humidite', 'd_prevision', 'humidity'),
      { ...entity('sensor.humidite_calculee', { area: 'jardin' }), device_class: 'humidity' },
      mesure('sensor.garage_temperature', 'd_garage', 'temperature'),
      mesure('sensor.lino_co2', 'd_lino', 'carbon_dioxide'), mesure('sensor.co2_nomade', 'd_nomade', 'carbon_dioxide'),
      mesure('sensor.meteo_temperature', 'd_meteo', 'temperature'),
      mesure('sensor.salon_pression', 'd_barometre', 'pressure'),
      { ...entity('binary_sensor.porte_entree', { area: 'salon' }), device_class: 'door' },
      { ...entity('sensor.temperature_max_aujourdhui'), device_class: 'temperature' },
      mesure('sensor.unraid_core_0_temperature', 'd_unraid', 'temperature'), mesure('sensor.capteur_frigo_temperature', 'd_frigo', 'temperature'),
    ],
    floors: [],
    states: states(
      m('sensor.chambre_co2', 1659, 'CO₂ Chambre', 'carbon_dioxide', 'ppm'), m('sensor.chambre_temperature', 21.4, 'Chambre température', 'temperature', '°C'),
      m('sensor.chambre_humidite', 68, 'Chambre humidité', 'humidity', '%'), m('sensor.chambre_bruit', 34, 'Chambre bruit', 'sound_pressure', 'dB'),
      m('sensor.chambre_wifi_temperature', 41, 'Chambre wifi température', 'temperature', '°C'),
      state('climate.salon', 'heat', { friendly_name: 'Thermostat salon', current_temperature: 20.5, temperature: 21 }),
      m('sensor.salon_thermostat_temperature', 20.5, 'Thermostat salon température', 'temperature', '°C'),
      m('sensor.ficus_lumiere', 840, 'Ficus lumière', 'illuminance', 'lx'), m('sensor.ficus_conductivite', 784, 'Ficus conductivité', 'conductivity', 'µS/cm'),
      m('sensor.jardin_vent', 32, 'Jardin vent', 'wind_speed', 'km/h'), m('sensor.jardin_temperature', 5, 'Jardin température', 'temperature', '°C'),
      m('sensor.jardin_humidite', 66, 'Jardin humidité', 'humidity', '%'), m('sensor.prevision_humidite', 75, 'Prévision humidité', 'humidity', '%'),
      m('sensor.humidite_calculee', 66, 'Humidité extérieure', 'humidity', '%'),
      m('sensor.garage_temperature', 9, 'Garage température', 'temperature', '°C'),
      m('sensor.lino_co2', 1177, 'CO₂ Chambre Lino', 'carbon_dioxide', 'ppm'), m('sensor.co2_nomade', 640, 'CO₂ nomade', 'carbon_dioxide', 'ppm'),
      m('sensor.meteo_temperature', 14, 'Météo température', 'temperature', '°C'),
      m('sensor.salon_pression', 1013, 'Salon pression', 'pressure', 'hPa'),
      state('binary_sensor.porte_entree', 'off', { friendly_name: 'Porte d’entrée', device_class: 'door' }),
      m('sensor.temperature_max_aujourdhui', 24, 'Température max aujourd’hui', 'temperature', '°C'),
      // Jugés sur le confort d'une pièce, la carte mère serait « Trop chaud » et le frigo « Trop froid », pour toujours.
      m('sensor.unraid_core_0_temperature', 58, 'Température Core 0', 'temperature', '°C'), m('sensor.capteur_frigo_temperature', 4.2, 'Capteur Frigo', 'temperature', '°C'),
    ),
    energyPrefs: null,
  };
}
function avecMaison(f) {
  const fx = maison();
  setLoggiaState({ index: ctxOf(fx, {}).index, ent: {}, cfg: { loggia_rooms: [{ room: 'Salon' }, { room: 'Chambre' }, { room: 'Jardin' }] }, resolved: null });
  try { return f(fx, F.objetsDeLaMaison({ states: fx.states }, [], new Set())); } finally { setLoggiaState({ index: null, ent: {}, cfg: {}, resolved: null }); }
}
const capteurs = (objets) => objets.filter(o => o.filtres.indexOf('capteurs') >= 0);

/* ASSERTIONS MODIFIÉES ET AJOUTÉES (passe 1 ter, 16/10 ; C16) : une carte de mesure demande un appareil PHYSIQUE, dans une pièce de Loggia comme
 * ailleurs. Son cas : sous Dehors, la prévision de Météo-France et l'« Humidité extérieure » calculée entraient, parce qu'elles sont dans sa pièce
 * « Extérieur » — C14 ne filtrait que les mesures SANS pièce. */
/* ASSERTIONS MODIFIÉES (passe 1 quater, 16/10 ; C17) : le thermomètre du garage — une zone que Loggia ne compte pas parmi ses pièces — sort, comme la
 * sonde de la carte mère, dans « network » ; le Capteur Frigo, sans zone, entre. */
test('C6, C7, C14, C16, C17 : une carte par mesure, sur un appareil physique — dans une pièce de Loggia, ou sans zone ; ni sonde de thermostat, ni plante, ni diagnostic, ni calcul, ni service, ni zone inconnue', () => avecMaison((fx, objets) => {
  const ids = capteurs(objets).map(o => o.id).sort();
  // ASSERTION MODIFIÉE (chantier Capteurs, étapes 2 et 3, tâche 2 ; C20, C21) : la porte de cette maison n'a pas d'appareil — elle n'entre pas dans son groupe, et ne fait plus de carte.
  assert.ok(!ids.includes('binary_sensor.porte_entree'));
  assert.deepEqual(ids, ['sensor.capteur_frigo_temperature', 'sensor.chambre_bruit', 'sensor.chambre_co2', 'sensor.chambre_humidite',
    'sensor.chambre_temperature', 'sensor.co2_nomade', 'sensor.jardin_humidite', 'sensor.jardin_temperature', 'sensor.jardin_vent', 'sensor.lino_co2', 'sensor.salon_pression']);
  assert.ok(!ids.includes('sensor.garage_temperature'), 'C17 : le garage n’est pas une pièce de Loggia — son thermomètre n’entre pas');
  assert.ok(!ids.includes('sensor.unraid_core_0_temperature'), 'C17 : la sonde d’une carte mère, dans « network », non plus');
  assert.ok(ids.includes('sensor.co2_nomade'), 'C14 : un CO₂ sans zone, sur son appareil, n’est pas perdu');
  assert.ok(!ids.includes('sensor.meteo_temperature'), 'C14 : la température d’un service météo reste dehors');
  assert.ok(!ids.includes('sensor.temperature_max_aujourdhui'), 'une température calculée, sans appareil ni pièce, aussi');
  assert.ok(!ids.includes('sensor.prevision_humidite'), 'C16 : une prévision, sur un appareil de service, n’entre pas — même dans une pièce de Loggia');
  assert.ok(!ids.includes('sensor.humidite_calculee'), 'C16 : une humidité calculée, sans appareil, non plus');
  assert.ok(!objets.some(o => o.id === 'sensor.prevision_humidite' || o.id === 'sensor.humidite_calculee'), 'ni sous un autre filtre');
  assert.ok(objets.some(o => o.id === 'climate.salon'), 'le thermostat garde sa carte ; sa sonde, non');
  /* La règle, écrite une fois : l'appareil décide (C16), et la zone (C17) — une pièce de Loggia ou aucune.
   * ASSERTION MODIFIÉE (passe 1 quater, 16/10 ; C17) : la pièce de Loggia de la mesure, `null` dans une zone inconnue. */
  assert.ok(APP.includes('if (d === \'sensor\' && estMesure(S[id])) { const p = physique(id) && !sonde(id) ? pieceLoggiaDe(id) : null; if (p != null) mesures.push([id, p]); return; }'));
}));

test('C13 : dans Objets, la carte d’une mesure porte le nom de sa pièce — sauf deux mesures de la même famille dans la même pièce, ou sans pièce', () => avecMaison((fx, objets) => {
  const nom = (id) => objets.find(o => o.id === id).nomCarte;
  /* ASSERTION MODIFIÉE (passe 1 ter, C16) : la prévision sortie, l'hygromètre de la station est seul de sa famille dans le jardin — il prend son nom.
   * ASSERTION MODIFIÉE (passe 1 quater, 16/10 ; C17) : le garage, une zone inconnue, ne nomme plus aucune carte — son thermomètre est sorti. */
  assert.deepEqual(['sensor.chambre_temperature', 'sensor.chambre_humidite', 'sensor.chambre_bruit', 'sensor.jardin_temperature', 'sensor.jardin_vent', 'sensor.jardin_humidite'].map(nom),
    ['Chambre', 'Chambre', 'Chambre', 'Jardin', 'Jardin', 'Jardin'], 'la famille, écrite sous le chiffre, dit le reste');
  assert.deepEqual([nom('sensor.chambre_co2'), nom('sensor.lino_co2')], [null, null], 'deux CO₂ dans la chambre : leurs noms de Home Assistant');
  assert.deepEqual([nom('sensor.co2_nomade'), nom('sensor.capteur_frigo_temperature')], [null, null], 'sans pièce : leur nom de Home Assistant');
  assert.equal(objets.find(o => o.id === 'sensor.chambre_temperature').nom, 'Chambre température', 'le nom de Home Assistant reste celui de l’objet (l’édition, le tri)');
  // ASSERTION MODIFIÉE (chantier Capteurs, étapes 2 et 3, tâche 2 ; C20, C21) : la porte, sans appareil, n'a plus de carte.
  assert.ok(!objets.some(o => o.id === 'binary_sensor.porte_entree'), 'une porte sans appareil n’a plus de carte');
  // La vue : un nom posé à la main l'emporte ; la compacte, qui n'écrit pas la famille, garde le nom de Home Assistant.
  const d = APP.indexOf('\nfunction ObjetsView(');
  const vue = APP.slice(d, APP.indexOf('\n}\n', d));
  assert.ok(vue.includes('return compacte ? dc.compact(cle, ed.labelOf(o.cle) || null) : dc.card(cle, ed.labelOf(o.cle) || o.nomCarte || null);'));
}));

test('C10 : les sections dans l’ordre de sa maquette, une section vide ne paraît pas ; § 5 : ce qui est à regarder', () => avecMaison((fx, objets) => {
  const lire = (id) => F.vueMesure({ states: fx.states }, id);
  const s = CS.sectionsCapteurs(capteurs(objets), { S: fx.states, dehors: F.estDehors, lire });
  /* C15 : le jardin à 5 °C serait « Trop froid » dans une pièce ; le garage, lui, n'est pas dehors.
   * ASSERTIONS MODIFIÉES (passe 1 ter, 16/10 ; C15 révisé) : dehors a ses zones — 5 °C y est « Froid » —, mais rien n'y est une alerte : Dehors n'a
   * jamais rien « à regarder », et ne dit donc jamais « Rien à signaler » — il le dirait toujours, pour rien (sa règle : jamais de « Tout va bien »
   * permanent).
   * ASSERTION MODIFIÉE (passe 1 quater, 16/10 ; C17) : le garage à 9 °C, « Trop froid », est sorti ; le frigo, sans zone, est neutre — Confort n'a plus
   * qu'une mesure à regarder, l'humidité de la chambre. */
  assert.deepEqual(s.map(x => [x.id, x.objets.map(o => o.id).sort(), x.regarder, x.statut]), [
    ['air', ['sensor.chambre_co2', 'sensor.co2_nomade', 'sensor.lino_co2'], 2, true],
    ['confort', ['sensor.capteur_frigo_temperature', 'sensor.chambre_bruit', 'sensor.chambre_humidite', 'sensor.chambre_temperature', 'sensor.salon_pression'], 1, true],
    // ASSERTION MODIFIÉE (chantier Capteurs, étapes 2 et 3, tâche 2 ; C20, C21) : la porte, sans appareil, n'a plus de carte — Maison n'a rien à montrer, elle ne paraît pas.
    ['dehors', ['sensor.jardin_humidite', 'sensor.jardin_temperature', 'sensor.jardin_vent'], 0, false],
  ]);
  const z = lire('sensor.jardin_temperature').zone;
  assert.deepEqual([z.t, z.bon, z.dehors, lire('sensor.jardin_temperature').dehors], ['Froid', false, true, true], 'dehors, une température a sa zone du dehors, sans alerte');
  // Hors du bon, et pourtant rien à regarder : une canicule, un vent fort.
  const chaud = { ...fx.states, 'sensor.jardin_temperature': { ...fx.states['sensor.jardin_temperature'], state: '35' }, 'sensor.jardin_vent': { ...fx.states['sensor.jardin_vent'], state: '70' } };
  const sc = CS.sectionsCapteurs(capteurs(objets), { S: chaud, dehors: F.estDehors, lire: (id) => F.vueMesure({ states: chaud }, id) });
  assert.deepEqual(sc.find(x => x.id === 'dehors').regarder + ' ' + sc.find(x => x.id === 'dehors').statut, '0 false', 'une canicule et un vent fort : ni « à regarder », ni « Rien à signaler »');
  assert.deepEqual(s.map(x => x.titre), ['Air', 'Confort', 'Dehors']); // ASSERTION MODIFIÉE (chantier Capteurs, étapes 2 et 3, tâche 2 ; C20, C21) : Maison vide, elle ne paraît pas.
  // Le vent est du dehors, quelle que soit sa pièce ; une pile et une plante vont aux plantes et piles.
  const o = (id, extra = {}) => ({ id, domaine: id.split('.')[0], piece: 'Salon', ...extra });
  const S = { 'sensor.vent': { attributes: { device_class: 'wind_speed', unit_of_measurement: 'km/h' } }, 'sensor.pile': { attributes: { device_class: 'battery', unit_of_measurement: '%' } } };
  assert.deepEqual([CS.sectionDe(o('sensor.vent'), S, F.estDehors), CS.sectionDe(o('sensor.pile'), S, F.estDehors), CS.sectionDe({ type: 'plant', domaine: 'plant', piece: 'Salon' }, S, F.estDehors)],
    ['dehors', 'plantes', 'plantes']);
}));

test('§ 5 : l’en-tête compte les cartes et ce qui est à regarder ; chaque section de mesures dit son état', () => avecMaison((fx, objets) => {
  const vus = capteurs(objets);
  const m = monter(CS.default, { hass: { states: fx.states }, titre: 'Capteurs', objets: vus, cellule: (x) => createElement('div', { key: x.cle }, x.cle), dehors: F.estDehors, lire: F.vueMesure });
  const texte = m.texte();
  /* ASSERTIONS MODIFIÉES (passe 1 ter, 16/10) : l'hygromètre de la station, une carte de plus ; Dehors ne dit plus rien (C15 révisé).
   * ASSERTIONS MODIFIÉES (passe 1 quater, 16/10 ; C17) : le garage sort, le frigo entre, neutre — douze cartes, trois à regarder. */
  // ASSERTION MODIFIÉE (chantier Capteurs, étapes 2 et 3, tâche 2 ; C20, C21) : la porte, sans appareil, n'a plus de carte — onze cartes, et plus de section Maison.
  assert.ok(texte.startsWith('Capteurs11 cartes · 3 à regarder'), texte.slice(0, 60));
  const sections = m.trouver(e => e.type === 'section');
  assert.deepEqual(sections.map(e => e.props['data-section']), ['air', 'confort', 'dehors']);
  const etat = (e) => (e.props.children[0].props.children[1] || null);
  assert.deepEqual(sections.map(e => { const x = etat(e); return x ? x.props.children : null; }), ['2 à regarder', '1 à regarder', null]);
  assert.equal(etat(sections[0]).props.style.color, 'var(--o-warn)');
}));

test('la vue : sous Capteurs, hors édition, les sections du module ; l’édition garde la grille', () => {
  const d = APP.indexOf('\nfunction ObjetsView(');
  const vue = APP.slice(d, APP.indexOf('\n}\n', d));
  assert.ok(APP.includes("const SectionsCapteurs = lazyRecharge(() => import('./capteurssections.jsx'));"));
  assert.ok(vue.includes("const enSections = actuel === 'capteurs' && !edit;"));
  /* ASSERTION MODIFIÉE (correction bis, point 1) : la vue ne surveille pas `sensor.` — « Air · 3 à regarder » restait celui de son dernier rendu. Les
   * sections passent par une enveloppe VIVANTE, sur le modèle de l'en-tête des prises : `useHass` sur les mesures visibles, et seulement elles. */
  assert.ok(vue.includes('<SectionsCapteursVive hass={hass} titre={titreFiltre} objets={visibles} cellule={cellule} />'));
  const d2 = APP.indexOf('\nfunction SectionsCapteursVive(');
  const vive = APP.slice(d2, APP.indexOf('\n}\n', d2));
  // ASSERTION MODIFIÉE (correction bis 2, point 2) : l'enveloppe ne s'abonne qu'aux mesures visibles que la table JUGE — elles seules changent le décompte.
  // ASSERTION MODIFIÉE (chantier Capteurs, étapes 2 et 3, tâche 8 ; C28) : l'enveloppe s'abonne aussi à la vigilance météo, et les sections jugent par `jugerObjet` ce qui n'est pas une mesure.
  // ASSERTION MODIFIÉE (chantier Capteurs, étapes 2 et 3, tâche 9 ; C20) : et aux membres des groupes.
  // ASSERTION MODIFIÉE (chantier Capteurs, étapes 2 et 3, tâche 10 ; C29) : et aux capteurs des plantes.
  // ASSERTION MODIFIÉE (passe bis du 17/10, point 5) : sauf aux membres de Présence, qu'elle ne juge pas — un mouvement de caméra redessinait les en-têtes.
  assert.ok(vive.includes("const vivant = useHass([...objets.filter(o => o.id && ((o.domaine === 'sensor' && mesureJugee(S, o.id)) || o.vigilance)).map(o => o.id),") && vive.includes("...objets.filter(o => o.type === 'groupe' && o.cle !== 'groupe:presence').flatMap(o => o.membres || []), ...objets.filter(o => o.type === 'plant').flatMap(o => o.capteurs || [])]);"), 'l’enveloppe s’abonne aux mesures jugées, à la vigilance, aux membres des groupes qu’elle juge et aux capteurs des plantes');
  assert.ok(vive.includes('<SectionsCapteurs hass={vivant || hass} titre={titre} objets={objets} cellule={cellule} dehors={estDehors} lire={vueMesure} juger={jugerObjet} />'), 'et les sections lisent ce relevé');
  /* TEST AJOUTÉ (correction bis, point 4) : un module introuvable ne fait plus tomber Objets, puces comprises — et « Réessayer » ne retombe plus sur le
   * filtre gardé en `sessionStorage` : une barrière LOCALE rend la place à la grille ordinaire, les mêmes cellules. */
  const b = vue.indexOf('<Barriere repli={<>');
  assert.ok(b >= 0 && vue.indexOf('{visibles.map(cellule)}</div>', b) > b && vue.indexOf('<SectionsCapteursVive', b) > vue.indexOf('{visibles.map(cellule)}</div>', b), 'la barrière, son repli (la grille), puis les sections');
  assert.ok(vue.indexOf('</Barriere>', b) > vue.indexOf('</Suspense>', vue.indexOf('<SectionsCapteursVive', b)), 'la frontière Suspense est dans la barrière');
  assert.ok(vue.includes('{enSections ? null : (visibles.length || edit)'), 'la grille ne se dessine pas deux fois');
  assert.ok(vue.includes(': cellule(o)))}'), 'une cellule, la même dans la grille et dans les sections');
});

/* TEST AJOUTÉ (correction bis, point 2) : sa règle, jamais de « Tout va bien » permanent. Une section ne dit son état — « {k} à regarder » ou « Rien à
 * signaler » — que si elle JUGE ce qu'elle montre : au moins une mesure jugée, et rien qu'elle ne sache pas juger. Des thermomètres du dehors, neutres
 * (C15) — son cas : il n'a pas d'anémomètre —, ne jugent rien ; un portail du jardin, une mesure muette, un vent en Beaufort lui échappent. Une mesure sans
 * table (une pression) ou neutre à dessein n'a jamais rien à signaler : elle ne la fait pas taire.
 * Correction bis 2, point 3 : ce qu'elle tait, c'est son « Rien à signaler » — « {k} à regarder » se dit dès que k > 0 (test plus bas). */
test('correction bis, point 2 : une section se tait quand elle ne juge rien, ou que quelque chose lui échappe', () => avecMaison((fx, objets) => {
  const par = (S) => (liste) => Object.fromEntries(CS.sectionsCapteurs(liste, { S, dehors: F.estDehors, lire: (id) => F.vueMesure({ states: S }, id) }).map(x => [x.id, [x.regarder, x.statut]]));
  const de = (...ids) => capteurs(objets).filter(o => ids.includes(o.id));
  const S = fx.states;
  // Ses thermomètres du dehors, seuls : rien n'est jugé, la section se tait.
  assert.deepEqual(par(S)(de('sensor.jardin_temperature')), { dehors: [0, false] });
  /* ASSERTION MODIFIÉE (passe 1 ter, 16/10 ; C15 révisé) : un vent à côté ne la fait plus parler. Dehors, rien n'est une alerte : « Rien à signaler »
   * y serait permanent — dit pour rien. */
  assert.deepEqual(par(S)(de('sensor.jardin_temperature', 'sensor.jardin_vent', 'sensor.jardin_humidite')), { dehors: [0, false] });
  /* Témoin : ailleurs, une section qui juge tout ce qu'elle montre le dit toujours.
   * ASSERTION MODIFIÉE (passe 1 quater, 16/10 ; C17) : le CO₂ nomade, sans zone, est neutre — il ne juge rien ; le témoin est une mesure d'une pièce. */
  assert.deepEqual(par(S)(de('sensor.chambre_temperature')), { confort: [0, true] });
  assert.deepEqual(par(S)(de('sensor.co2_nomade')), { air: [0, false] }, 'C17 : sans zone, neutre — rien à juger');
  // Un portail du jardin, ouvert : la section ne sait pas le juger avant l'étape 2 — elle se tait.
  const portail = { cle: 'binary_sensor.portail', id: 'binary_sensor.portail', domaine: 'binary_sensor', piece: 'Jardin', filtres: ['capteurs'] };
  const SP = { ...S, 'binary_sensor.portail': { entity_id: 'binary_sensor.portail', state: 'on', attributes: { friendly_name: 'Portail', device_class: 'opening' } } };
  assert.deepEqual(par(SP)([...de('sensor.jardin_vent'), portail]), { dehors: [0, false] });
  // Un vent en Beaufort : la table ne sait pas le lire — ni zone, ni état de section.
  const SB = { ...S, 'sensor.jardin_vent': { ...S['sensor.jardin_vent'], attributes: { ...S['sensor.jardin_vent'].attributes, unit_of_measurement: 'Bft' } } };
  assert.equal(F.vueMesure({ states: SB }, 'sensor.jardin_vent').zone, null);
  assert.deepEqual(par(SB)(de('sensor.jardin_vent', 'sensor.jardin_temperature')), { dehors: [0, false] });
  /* Un CO₂ muet : il pourrait cacher un air confiné — la section ne compte que ce qu'elle voit.
   * ASSERTION MODIFIÉE (correction bis 2, point 3) : elle dit « 2 à regarder », comme l'en-tête les compte ; elle ne tait que son « Rien à signaler ». */
  const SM = { ...S, 'sensor.co2_nomade': { ...S['sensor.co2_nomade'], state: 'unavailable' } };
  assert.deepEqual(par(SM)(de('sensor.chambre_co2', 'sensor.co2_nomade', 'sensor.lino_co2')).air, [2, true]);
  // Une pression (sans table) n'a jamais rien à signaler : Confort garde son état.
  assert.deepEqual(par(S)(de('sensor.chambre_temperature', 'sensor.salon_pression')).confort, [0, true]);
  // Rendu : une section qui se tait n'écrit rien à côté de son titre.
  const m = monter(CS.default, { hass: { states: S }, titre: 'Capteurs', objets: de('sensor.jardin_temperature'), cellule: (x) => createElement('div', { key: x.cle }, x.cle), dehors: F.estDehors, lire: F.vueMesure });
  const section = m.trouver(e => e.type === 'section')[0];
  assert.equal(section.props.children[0].props.children[1], false, 'ni « Rien à signaler », ni « à regarder »');
}));

/* TEST AJOUTÉ (correction bis, point 4) : la barrière locale d'Objets › Capteurs. Ce qu'elle garde casse — le module des sections introuvable — : elle
 * rend son repli, la grille ordinaire, au lieu de la carte de panne qui prenait la vue entière. Sans repli, elle reste la barrière d'une vue. */
test('correction bis, point 4 : la barrière rend son repli quand ce qu’elle garde casse', async () => {
  const { Barriere } = await import('../src/ui.jsx');
  const repli = createElement('div', { className: 'grid-objets' }, 'la grille');
  const b = new Barriere({ repli, children: createElement('span', null, 'les sections') });
  assert.equal(b.render().type, 'span', 'témoin : sans erreur, ce qu’elle garde');
  b.state = Barriere.getDerivedStateFromError(new Error('module introuvable'));
  assert.equal(b.render(), repli, 'en panne : la grille ordinaire');
  const sans = new Barriere({ children: createElement('span') });
  sans.state = Barriere.getDerivedStateFromError(new Error('panne'));
  assert.notEqual(sans.render(), null, 'sans repli : la carte de panne, comme avant');
});

/* TEST AJOUTÉ (correction bis 2, point 2) : le coût. L'enveloppe s'abonnait à toutes les mesures visibles et redessinait toutes les cartes : dans la démo,
 * un CO₂ qui change en redessinait 23, contre une avant elle. Elle ne s'abonne plus qu'aux mesures que la table JUGE — elles seules changent le décompte —,
 * et la grille de chaque section est mémoïsée : tant que la vue ne s'est pas redessinée, une section garde ses objets et sa cellule, et sa grille ne se
 * redessine pas ; chaque carte garde son propre abonnement. Mesuré dans la démo après : une carte. */
test('correction bis 2, point 2 : l’enveloppe ne suit que les mesures jugées ; la grille d’une section ne se redessine pas pour le décompte', () => avecMaison((fx, objets) => {
  const S = fx.states;
  const jugees = capteurs(objets).filter(o => o.domaine === 'sensor' && F.mesureJugee(S, o.id)).map(o => o.id).sort();
  /* ASSERTION MODIFIÉE (passe 1 ter, 16/10 ; C15 révisé) : dehors, rien n'est « à regarder » — le vent du jardin ne change plus le décompte.
   * ASSERTION MODIFIÉE (passe 1 quater, 16/10 ; C17) : hors d'une pièce de Loggia non plus — ni le CO₂ nomade ni le frigo, sans zone, ni le garage. */
  assert.deepEqual(jugees, ['sensor.chambre_bruit', 'sensor.chambre_co2', 'sensor.chambre_humidite', 'sensor.chambre_temperature', 'sensor.lino_co2'],
    'rien du jardin (C15), rien hors des pièces (C17), ni la pression (sans table)');
  assert.deepEqual(['sensor.co2_nomade', 'sensor.capteur_frigo_temperature', 'sensor.garage_temperature'].map(id => F.mesureJugee(S, id)), [false, false, false]);
  assert.deepEqual([F.mesureJugee({ 'sensor.v': { attributes: { device_class: 'wind_speed', unit_of_measurement: 'Bft' } } }, 'sensor.v'),
    F.mesureJugee({ 'sensor.p': { attributes: { device_class: 'battery', unit_of_measurement: '%' } } }, 'sensor.p'), F.mesureJugee(S, 'sensor.absente')], [false, false, false],
    'ni un vent en Beaufort, ni une pile, ni une entité absente');
  // La grille d'une section : mémoïsée, comparée sur ses objets et sa cellule.
  const cellule = (x) => createElement('div', { key: x.cle }, x.cle);
  const m = monter(CS.default, { hass: { states: S }, titre: 'Capteurs', objets: capteurs(objets), cellule, dehors: F.estDehors, lire: F.vueMesure });
  const grilles = () => m.trouver(e => e.type === 'section').map(s => s.props.children[1]);
  const avant = grilles();
  const memo = avant[0].type;
  assert.equal(typeof memo.compare, 'function', 'une grille mémoïsée');
  m.rendre(); // un relevé : l'enveloppe redessine le décompte, la vue non
  const apres = grilles();
  // ASSERTION MODIFIÉE (chantier Capteurs, étapes 2 et 3, tâche 2 ; C20, C21) : trois sections — la porte, sans appareil, n'a plus de carte, et Maison ne paraît pas.
  assert.ok(avant.length === 3 && avant.every((e, i) => e.type === memo && memo.compare(e.props, apres[i].props)), 'mêmes objets, même cellule : aucune grille ne se redessine');
  assert.equal(memo.compare(avant[0].props, { ...avant[0].props, cellule: (x) => cellule(x) }), false, 'la vue redessinée, une cellule neuve : la grille suit');
  assert.equal(memo.compare(avant[0].props, { ...avant[0].props, objets: avant[0].props.objets.slice(1) }), false, 'un objet de moins : la grille suit');
}));

/* TEST AJOUTÉ (correction bis 2, point 3) : tranché — « {k} à regarder » dès que k > 0. Un CO₂ muet faisait taire Air quand l'en-tête disait « · 3 à
 * regarder ». Une section qui ne sait pas tout juger ne tait que son « Rien à signaler ». */
test('correction bis 2, point 3 : « {k} à regarder » dès qu’une mesure est hors du bon, même quand la section ne sait pas tout juger', () => avecMaison((fx, objets) => {
  const de = (...ids) => capteurs(objets).filter(o => ids.includes(o.id));
  const muet = (id) => ({ ...fx.states, [id]: { ...fx.states[id], state: 'unavailable' } });
  const rendre = (S, liste) => monter(CS.default, { hass: { states: S }, titre: 'Capteurs', objets: liste, cellule: (x) => createElement('div', { key: x.cle }, x.cle), dehors: F.estDehors, lire: F.vueMesure });
  const etats = (m) => m.trouver(e => e.type === 'section').map(s => { const x = s.props.children[0].props.children[1]; return x ? x.props.children : null; });
  // Deux CO₂ hors du bon, un troisième muet : la section dit ce que l'en-tête compte.
  const air = rendre(muet('sensor.co2_nomade'), de('sensor.chambre_co2', 'sensor.co2_nomade', 'sensor.lino_co2'));
  assert.ok(air.texte().startsWith('Capteurs3 cartes · 2 à regarder'), air.texte().slice(0, 40));
  assert.deepEqual(etats(air), ['2 à regarder']);
  // Rien hors du bon, et un muet : ni « Rien à signaler » ni « à regarder ».
  assert.deepEqual(etats(rendre(muet('sensor.chambre_co2'), de('sensor.chambre_co2', 'sensor.co2_nomade'))), [null]);
  /* Témoin : tout est jugé et bon — « Rien à signaler ».
   * ASSERTION MODIFIÉE (passe 1 quater, 16/10 ; C17) : le CO₂ nomade, sans zone, ne juge plus rien ; le témoin est la température de la chambre. */
  assert.deepEqual(etats(rendre(fx.states, de('sensor.chambre_temperature'))), ['Rien à signaler']);
}));

/* TEST AJOUTÉ (passe 1 quater, 16/10 ; C17). Chez lui, 25 sondes de cartes mères (Glances, zone « network ») et 4 températures d'une passerelle (zone
 * « technique ») entraient dans Confort, jugées sur le confort d'une pièce : « Trop chaud » pour toujours ; son « Capteur Frigo », sans zone, « Trop
 * froid ». Du bruit permanent, que sa règle refuse. Une mesure n'est JUGÉE — zones, phrase, lavis, « à regarder » — que dans une pièce de Loggia : du
 * dedans, sur l'échelle du confort ; du dehors, sur celle du dehors. Sans zone, elle entre, neutre : le chiffre, la courbe, le dernier signal, son nom de
 * Home Assistant. Dans une zone que Loggia ne compte pas, elle n'entre pas ; montrée ailleurs (une vue personnelle), elle est neutre. Le vent et les
 * particules se jugent partout. */
test('C17 : une mesure n’est jugée que dans une pièce de Loggia — sans zone, neutre ; dans une zone inconnue, elle n’entre pas', () => avecMaison((fx, objets) => {
  const lire = (id) => F.vueMesure({ states: fx.states }, id);
  const frigo = lire('sensor.capteur_frigo_temperature');
  assert.deepEqual([frigo.neutre, frigo.zone, frigo.barre, frigo.dehors, frigo.chiffre, frigo.unite, frigo.famille, frigo.phrase],
    [true, null, null, false, '4,2', '°C', 'Température', ''], 'le Capteur Frigo : « Capteur Frigo · 4,2 °C · TEMPÉRATURE », ni zone, ni barre, ni phrase');
  assert.equal(objets.find(o => o.id === 'sensor.capteur_frigo_temperature').nomCarte, null, 'son nom de Home Assistant');
  // Montrées ailleurs, celles d'une zone inconnue sont neutres : la carte mère n'est pas « Trop chaud », le garage pas « Trop froid ».
  assert.deepEqual(['sensor.unraid_core_0_temperature', 'sensor.garage_temperature'].map(id => [lire(id).neutre, lire(id).zone]), [[true, null], [true, null]]);
  // Témoins : dans une pièce du dedans, l'échelle du confort ; du dehors, celle du dehors.
  assert.deepEqual([lire('sensor.chambre_humidite').zone.t, lire('sensor.jardin_temperature').zone.t, lire('sensor.jardin_temperature').dehors], ['Humide', 'Froid', true]);
  // Les sections : le frigo, neutre, ne fait taire ni ne compte rien.
  const s = CS.sectionsCapteurs(capteurs(objets).filter(o => ['sensor.capteur_frigo_temperature', 'sensor.chambre_temperature'].includes(o.id)), { S: fx.states, dehors: F.estDehors, lire });
  assert.deepEqual(s.map(x => [x.id, x.regarder, x.statut]), [['confort', 0, true]], 'Confort juge la chambre, et le dit');
  // Le vent et les particules se jugent partout, sans zone comme dans une zone inconnue.
  const S = { ...fx.states,
    'sensor.co2_nomade': { ...fx.states['sensor.co2_nomade'], attributes: { friendly_name: 'Vent nomade', device_class: 'wind_speed', unit_of_measurement: 'km/h' }, state: '60' },
    'sensor.garage_temperature': { ...fx.states['sensor.garage_temperature'], attributes: { friendly_name: 'PM2,5 garage', device_class: 'pm25', unit_of_measurement: 'µg/m³' }, state: '30' } };
  const vent = F.vueMesure({ states: S }, 'sensor.co2_nomade'), pm = F.vueMesure({ states: S }, 'sensor.garage_temperature');
  assert.deepEqual([vent.zone.t, vent.dehors, pm.zone.t, pm.neutre], ['Fort', true, 'Mauvais', false]);
  // Une entité que le registre ne connaît pas — la maison fictive de la Bibliothèque — garde la table : rien ne dit où elle est.
  const fictive = F.vueMesure({ states: { 'sensor.biblio_co2': { state: '1700', attributes: { device_class: 'carbon_dioxide', unit_of_measurement: 'ppm' } } } }, 'sensor.biblio_co2');
  assert.deepEqual([fictive.neutre, fictive.zone.t], [false, 'Confiné']);
}));
