/* L'audit des capteurs du 19/10, lot 3 : le CLASSEMENT et l'AFFICHAGE des capteurs (ADR 0251).
 *
 * Chaque test rejoue un défaut que les sondes de l'audit (scratchpad, audit-A et audit-E) ont montré sur le code d'avant :
 *  - H7 : le seuil CO₂ d'une pièce se perdait (`normRooms`) et l'Accueil le lisait comme une entité ;
 *  - H8, H9 (décision D5) : un frigo, une sonde d'appareil, un point de rosée étaient jugés sur le confort d'une pièce, et la
 *    découverte des pièces les prenait pour LA température ;
 *  - H10, M7 : le monoxyde en ppm, les COV en ppb, PM1, NO₂, l'ozone et la pression n'arrivaient nulle part ;
 *  - M6 : chaque nuit, chaque plante passait « Lumière faible » ;
 *  - M8 : un indice d'un service, une pression de « network » entraient sans appareil physique ;
 *  - M9 : la carte d'un appareil se choisissait par ordre alphabétique ;
 *  - M10, M11 (décision D3) : une plante de balcon tombait dans Dehors ; Dehors au calme disait « Rien à signaler » ;
 *  - M12 : une sœur Météo-France faisait disparaître la carte Vigilance ;
 *  - M13 : la carte Piles comptait les batteries rechargeables et un `min_max` sans appareil ;
 *  - M14 : l'Accueil comptait les groupes de Home Assistant et les entités masquées ;
 *  - M15 : `estDehors` ne connaissait ni la cour, ni le potager, et prenait le jardin d'hiver pour le dehors ;
 *  - M16 : la bannière gardait trois paliers de CO₂, « BON » pendant le chargement, et ignorait le seuil de la veille ;
 *  - les points bas (kelvins, lecture des nombres, sonde d'un thermostat, MeteoAlarm verte, glyphe du CO, piles, chiffres) ;
 *  - le code mort, la démo, la phrase « Bon · 68 % d'humidité ».
 * `objetsDeLaMaison` et ses voisines vivent dans App.jsx : sous `?lot3`, un crochet de chargement leur ajoute un export. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';

import { area, device, entity, state, states, ctxOf } from './fixtures.mjs';
import { VUES_SORTIES } from './monolithe.mjs'; // App.jsx + les vues sorties du boot (ADR 0274)

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);
register('data:text/javascript,' + encodeURIComponent([
  'export async function load(url, ctx, next) {',
  "  if (!url.endsWith('/src/App.jsx?lot3')) return next(url, ctx);",
  "  const r = await next(url.slice(0, -'?lot3'.length), ctx);",
  "  return { ...r, source: String(r.source) + ';export { objetsDeLaMaison, vueMesure, estDehors, mesureJugee, jugerObjet, roomEntitiesBrutes, lireNombre, cvIcoEntite, deriveAccueil, lirePlante };' };",
  '}',
].join('\n')));
const { setLoggiaState, normRooms, cfgVal } = await import('../src/state.js');
const F = await import(new URL('../src/App.jsx?lot3', import.meta.url).href);
const CS = await import('../src/capteurssections.jsx');
const C = await import('../src/confort.js');
const A = await import('../src/attention.js');
const P = await import('../src/piles.js');
const PL = await import('../src/plantes.js');
const G = await import('../src/groupes.js');
const { resolveRooms } = await import('../src/resolve.js');
const { maisonCapteursDemo } = await import('../src/demo.js');
const HA = await import('../src/horsair.js');
const U = await import('../src/unites.js');
const FIX = await import('./fixtures.mjs');
const lire = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const APP = (lire('src/App.jsx') + VUES_SORTIES);

const mesure = (id, dev, classe, opt = {}) => ({ ...entity(id, { device: dev, ...opt }), device_class: classe });
const m = (id, v, nom, classe, unite, plus = {}) => state(id, v, { friendly_name: nom, device_class: classe, ...(unite ? { unit_of_measurement: unite } : {}), state_class: 'measurement', ...plus });
function avec(fx, cfg, f) {
  setLoggiaState({ index: ctxOf(fx, {}).index, ent: {}, cfg, resolved: null });
  try { return f({ states: fx.states }); } finally { setLoggiaState({ index: null, ent: {}, cfg: {}, resolved: null }); }
}
const capteurs = (H) => F.objetsDeLaMaison(H, [], new Set()).filter(o => o.filtres.indexOf('capteurs') >= 0);
const sections = (H, objets) => CS.sectionsCapteurs(objets, { S: H.states, dehors: F.estDehors, lire: (id) => F.vueMesure(H, id), juger: (o) => F.jugerObjet(H, o) });

test('H7 : le seuil CO₂ d’une pièce survit à la normalisation, et l’Accueil le lit comme un nombre', () => {
  setLoggiaState({ index: null, ent: {}, cfg: { loggia_rooms: [{ room: 'Chambre', haid: { temp: 'sensor.t', co2: 'sensor.chambre_co2', co2seuil: 900, lights: [] } }] }, resolved: null });
  try {
    const r = normRooms(cfgVal('loggia_rooms', null));
    assert.equal(r[0].haid.co2seuil, 900, 'normRooms garde co2seuil');
    const S = { 'sensor.chambre_co2': { state: '1000', attributes: { device_class: 'carbon_dioxide' } } };
    const a = F.deriveAccueil({ states: S }, { rooms: r }, null);
    assert.deepEqual([a.rooms[0].co2, a.rooms[0].co2Seuil], [1000, 900]);
  } finally { setLoggiaState({ index: null, ent: {}, cfg: {}, resolved: null }); }
  // Le point « CO₂ élevé » : le seuil de la pièce, sinon celui de la veille, sinon 1 400.
  const pts = (pieces, veilles) => A.pointsAttention({ pieces, veilles }).map(p => p.cle);
  assert.deepEqual(pts([{ nom: 'Chambre', co2: 1000, seuil: 900 }]), ['co2:Chambre'], 'au-dessus du seuil de la pièce');
  assert.deepEqual(pts([{ nom: 'Chambre', co2: 1500 }], { config: { co2: { seuil: 1800 } }, signales: [] }), [], 'sous le seuil réglé dans la veille');
  assert.deepEqual(pts([{ nom: 'Chambre', co2: 1500 }]), ['co2:Chambre'], 'sans réglage, 1 400');
  // La fiche d'une pièce ne perd plus ce qu'elle n'édite pas.
  assert.ok(lire('src/fichepiece.jsx').includes('haid: { ...h, temp: temp.trim() || null'));
});

/* H8, H9 (décision D5) : la maison d'un frigo, d'une prise Shelly, d'un PC, d'une imprimante 3D et d'un point de rosée. */
function maisonHorsAir() {
  return {
    areas: [area('cuisine', 'Cuisine'), area('salon', 'Salon'), area('bureau', 'Bureau')],
    devices: [
      device('d_frigo', 'Thermomètre frigo', 'cuisine', { manufacturer: 'Sonoff', model: 'SNZB-02' }),
      device('d_th2', 'Thermo cuisine', 'cuisine', { manufacturer: 'Aqara', model: 'T1' }),
      device('d_prise', 'Prise Shelly', 'salon', { manufacturer: 'Shelly', model: 'Plug S' }),
      device('d_th', 'Station salon', 'salon', { manufacturer: 'Netatmo', model: 'Indoor' }),
      device('d_pc', 'PC bureau', 'bureau', { manufacturer: 'Glances', model: 'Linux' }),
      device('d_imp', 'Imprimante 3D', 'bureau', { manufacturer: 'Prusa', model: 'MK4' }),
    ],
    entities: [
      mesure('sensor.frigo_temperature', 'd_frigo', 'temperature'), mesure('sensor.cuisine_temperature', 'd_th2', 'temperature'),
      mesure('sensor.prise_shelly_temperature', 'd_prise', 'temperature'), entity('switch.prise_shelly', { device: 'd_prise' }),
      mesure('sensor.salon_temperature', 'd_th', 'temperature'), mesure('sensor.salon_point_de_rosee', 'd_th', 'temperature'),
      mesure('sensor.pc_cpu_temperature', 'd_pc', 'temperature'), mesure('sensor.imprimante_buse', 'd_imp', 'temperature'),
    ],
    floors: [], energyPrefs: null,
    states: states(
      m('sensor.frigo_temperature', 4, 'Frigo température', 'temperature', '°C'), m('sensor.cuisine_temperature', 20, 'Cuisine température', 'temperature', '°C'),
      m('sensor.prise_shelly_temperature', 47, 'Prise Shelly température', 'temperature', '°C'), state('switch.prise_shelly', 'on', { friendly_name: 'Prise Shelly' }),
      m('sensor.salon_temperature', 21, 'Salon température', 'temperature', '°C'), m('sensor.salon_point_de_rosee', 9.5, 'Salon point de rosée', 'temperature', '°C'),
      m('sensor.pc_cpu_temperature', 58, 'PC CPU température', 'temperature', '°C'), m('sensor.imprimante_buse', 215, 'Imprimante buse', 'temperature', '°C'),
    ),
  };
}

test('H9 : la découverte des pièces prend l’air de la pièce — ni un frigo, ni la sonde d’une prise, ni un diagnostic ; une mesure d’abord', () => {
  const fx = maisonHorsAir();
  // La cuisine : le frigo vient AVANT le thermomètre dans la zone ; la prise du salon aussi, et le point de rosée ne compte pas.
  fx.entities.push({ ...entity('sensor.salon_wifi_temperature', { device: 'd_th', category: 'diagnostic' }), device_class: 'temperature' });
  fx.states['sensor.salon_wifi_temperature'] = { entity_id: 'sensor.salon_wifi_temperature', state: '41', attributes: { device_class: 'temperature' } };
  const r = resolveRooms({ index: ctxOf(fx).index, states: fx.states });
  const temp = Object.fromEntries([...r.suggested, ...r.technical].map(z => [z.name, z.temp]));
  // Le bureau n'a que la sonde d'un processeur et la buse d'une imprimante : pas de température de pièce.
  assert.deepEqual(temp, { Bureau: null, Cuisine: 'sensor.cuisine_temperature', Salon: 'sensor.salon_temperature' });
});

test('H8 (D5) : une mesure qui n’est pas l’air de la pièce reste visible, neutre, sous son nom ; « Ne pas juger » corrige dans les deux sens', () => {
  const fx = maisonHorsAir();
  const cfg = { loggia_rooms: [{ room: 'Cuisine' }, { room: 'Salon' }, { room: 'Bureau' }] };
  avec(fx, cfg, (H) => {
    const objets = capteurs(H);
    const o = (id) => objets.find(x => x.id === id);
    for (const id of ['sensor.frigo_temperature', 'sensor.prise_shelly_temperature', 'sensor.salon_point_de_rosee', 'sensor.pc_cpu_temperature', 'sensor.imprimante_buse']) {
      assert.ok(o(id), id + ' reste visible');
      assert.equal(o(id).nomCarte, null, id + ' : son nom de Home Assistant, pas celui de la pièce');
      const v = F.vueMesure(H, id);
      assert.deepEqual([v.neutre, v.zone, F.mesureJugee(H.states, id)], [true, null, false], id + ' : ni zone, ni jugement');
    }
    assert.equal(o('sensor.cuisine_temperature').nomCarte, 'Cuisine', 'le thermomètre de la cuisine garde le nom de sa pièce');
    assert.equal(F.vueMesure(H, 'sensor.cuisine_temperature').zone.t, 'Idéal');
    const s = sections(H, objets).find(x => x.id === 'confort');
    assert.equal(s.regarder, 0, 'Confort n’a plus rien « à regarder » pour toujours');
  });
  // La correction, à la main : le thermomètre de la cuisine n'est plus jugé, le frigo l'est.
  avec(fx, { ...cfg, loggia_mesures_nonjugees: { 'sensor.cuisine_temperature': true, 'sensor.frigo_temperature': false } }, (H) => {
    assert.equal(F.vueMesure(H, 'sensor.cuisine_temperature').neutre, true);
    assert.equal(F.vueMesure(H, 'sensor.frigo_temperature').zone.t, 'Trop froid');
  });
  // Le réglage vit dans la fiche d'une mesure, réservé à qui configure la maison.
  const fiche = lire('src/fichecapteur.jsx');
  assert.ok(fiche.includes("tr('Ne pas juger cette mesure')") && fiche.includes('j && j.possible && j.reglable') && fiche.includes('cfgSet({ [CLE_NON_JUGEES]:'));
});

test('H10, M7 : le monoxyde en ppm est une famille de la table, en alerte dans la carte Sécurité au palier Danger ; les autres familles d’air entrent, neutres', () => {
  assert.equal(C.cleMesure('carbon_monoxide'), 'co');
  // ASSERTION MODIFIÉE (relecture du lot 3, point 6) : « jusqu'à 35 » est Moyen, le Danger commence AU-DELÀ.
  assert.deepEqual([2, 9, 20, 35, 35.1, 200].map(v => C.zoneMesure('co', v).t), ['Bon', 'Moyen', 'Moyen', 'Moyen', 'Danger', 'Danger']);
  assert.deepEqual([C.coDanger('34'), C.coDanger('35'), C.coDanger('35,1'), C.coDanger('unavailable')], [false, false, true, false]);
  const fx = {
    areas: [area('salon', 'Salon')],
    devices: ['co', 'voc', 'pm1', 'no2', 'o3', 'pr'].map(d => device('d_' + d, 'Appareil ' + d, 'salon', { manufacturer: 'X', model: 'Y' })),
    entities: [mesure('sensor.salon_co', 'd_co', 'carbon_monoxide'), mesure('sensor.salon_cov_ppb', 'd_voc', 'volatile_organic_compounds_parts'),
      mesure('sensor.salon_pm1', 'd_pm1', 'pm1'), mesure('sensor.salon_no2', 'd_no2', 'nitrogen_dioxide'), mesure('sensor.salon_ozone', 'd_o3', 'ozone'),
      mesure('sensor.salon_pression', 'd_pr', 'atmospheric_pressure')],
    floors: [], energyPrefs: null,
    states: states(m('sensor.salon_co', 200, 'Salon CO', 'carbon_monoxide', 'ppm'), m('sensor.salon_cov_ppb', 300, 'Salon COV', 'volatile_organic_compounds_parts', 'ppb'),
      m('sensor.salon_pm1', 5, 'Salon PM1', 'pm1', 'µg/m³'), m('sensor.salon_no2', 30, 'Salon NO2', 'nitrogen_dioxide', 'µg/m³'),
      m('sensor.salon_ozone', 40, 'Salon ozone', 'ozone', 'µg/m³'), m('sensor.salon_pression', 1013, 'Salon pression', 'atmospheric_pressure', 'hPa')),
  };
  avec(fx, { loggia_rooms: [{ room: 'Salon' }] }, (H) => {
    const objets = F.objetsDeLaMaison(H, [], new Set());
    const ids = objets.filter(o => o.id).map(o => o.id);
    for (const id of ['sensor.salon_co', 'sensor.salon_cov_ppb', 'sensor.salon_pm1', 'sensor.salon_no2', 'sensor.salon_ozone', 'sensor.salon_pression']) assert.ok(ids.includes(id), id + ' arrive dans Objets');
    const sec = Object.fromEntries(objets.filter(o => o.id).map(o => [o.id, CS.sectionDe(o, H.states, F.estDehors)]));
    assert.deepEqual([sec['sensor.salon_co'], sec['sensor.salon_cov_ppb'], sec['sensor.salon_no2'], sec['sensor.salon_ozone'], sec['sensor.salon_pm1'], sec['sensor.salon_pression']],
      ['air', 'air', 'air', 'air', 'air', 'confort']);
    assert.equal(F.vueMesure(H, 'sensor.salon_co').zone.t, 'Danger');
    // La carte Sécurité de Maison : le monoxyde y est un membre, et il sonne au palier Danger.
    const securite = objets.find(o => o.cle === 'groupe:securite');
    assert.deepEqual([securite.membres, securite.actifsMembres], [['sensor.salon_co'], 1]);
    const v = G.vueSecurite(securite.membres, H.states, new Map([['sensor.salon_co', 'Salon']]));
    // ASSERTION MODIFIÉE (audit des capteurs du 19/10, lot 4) : le mot du monoxyde, le même partout à l'écran.
    assert.deepEqual([v.phrase, v.ton, v.regarder], ['Monoxyde détecté · Salon', 'bad', true]);
    assert.ok(F.roomEntitiesBrutes(H, 'Salon').includes('sensor.salon_co'), 'la vue de la pièce le montre');
  });
});

test('M6 : la lumière d’une plante ne se juge pas la nuit — le maximum du jour s’il est connu, sinon le soleil levé', () => {
  const p = { hum: 40, lux: 0, temp: 21, cond: 600 };
  assert.equal(PL.vuePlante({ ...p, luxJour: null }).regarder, false, 'la nuit, sans maximum du jour : rien ne presse');
  assert.equal(PL.vuePlante({ ...p, luxJour: 3000 }).regarder, false, 'le maximum du jour dit qu’elle a eu sa lumière');
  assert.equal(PL.vuePlante({ ...p, lux: 84, luxJour: 84 }).phrase, 'Lumière faible', 'de jour, 84 lx presse');
  // `lirePlante` : soleil couché, le lux du moment ne compte plus (ASSERTION MODIFIÉE, relecture du lot 3 : midi solaire passé aussi).
  assert.ok(APP.includes("luxJour: maxJour != null ? maxJour : soleil ? lux : null"));
  assert.ok(APP.includes("const soleil = !!sun && lireNombre((sun.attributes || {}).elevation) >= 20;")); // ASSERTION MODIFIÉE (contre-relecture) : l'élévation.
});

test('M8 : C16 et C17 pour tous les capteurs — un indice d’un service, une pression de « network », une mesure sans appareil n’entrent pas', () => {
  const fx = {
    areas: [area('salon', 'Salon'), area('network', 'network')],
    devices: [device('d_owm', 'OpenWeatherMap', null, { entry_type: 'service' }), device('d_srv', 'Serveur', 'network'), device('d_air', 'Purificateur', 'salon')],
    entities: [mesure('sensor.owm_pressure', 'd_owm', 'pressure'), { ...entity('sensor.waqi_aqi'), device_class: 'aqi' }, mesure('sensor.serveur_pression', 'd_srv', 'pressure'),
      { ...entity('sensor.pm10_calcule', { area: 'salon' }), device_class: 'pm10' }, mesure('sensor.purificateur_aqi', 'd_air', 'aqi')],
    floors: [], energyPrefs: null,
    states: states(m('sensor.owm_pressure', 1013, 'OWM pression', 'pressure', 'hPa'), m('sensor.waqi_aqi', 55, 'WAQI', 'aqi'), m('sensor.serveur_pression', 1000, 'Serveur', 'pressure', 'hPa'),
      m('sensor.pm10_calcule', 20, 'PM10', 'pm10', 'µg/m³'), m('sensor.purificateur_aqi', 40, 'Purificateur indice', 'aqi')),
  };
  avec(fx, { loggia_rooms: [{ room: 'Salon' }] }, (H) => {
    assert.deepEqual(capteurs(H).map(o => o.id), ['sensor.purificateur_aqi']);
  });
});

test('M9 : dans une pièce, la carte d’un appareil est celle de sa classe la plus importante — le CO₂ d’un purificateur, pas son indice', () => {
  const fx = {
    areas: [area('salon', 'Salon')], devices: [device('d_air', 'Purificateur', 'salon')],
    entities: [mesure('sensor.purificateur_air_quality_index', 'd_air', 'aqi'), mesure('sensor.purificateur_co2', 'd_air', 'carbon_dioxide'), mesure('sensor.purificateur_pm25', 'd_air', 'pm25')],
    floors: [], energyPrefs: null,
    states: states(m('sensor.purificateur_air_quality_index', 40, 'Indice', 'aqi'), m('sensor.purificateur_co2', 1500, 'CO2', 'carbon_dioxide', 'ppm'), m('sensor.purificateur_pm25', 8, 'PM2,5', 'pm25', 'µg/m³')),
  };
  avec(fx, { loggia_rooms: [{ room: 'Salon' }] }, (H) => {
    assert.deepEqual(F.roomEntitiesBrutes(H, 'Salon'), ['sensor.purificateur_co2']);
  });
});

test('M10, M11 (D3) : une plante du balcon reste dans Plantes et piles ; Dehors au calme se tait, une vigilance active est « à regarder »', () => {
  const o = { cle: 'plant:sensor.olivier', type: 'plant', domaine: 'plant', piece: 'Terrasse' };
  assert.equal(CS.sectionDe(o, {}, F.estDehors), 'plantes');
  assert.equal(CS.sectionDe({ cle: 'groupe:piles', type: 'groupe', domaine: 'groupe', piece: 'Balcon' }, {}, F.estDehors), 'plantes');
  const MA = 'binary_sensor.meteoalarm';
  const fx = {
    areas: [area('jardin', 'Jardin')], devices: [device('d_station', 'Station', 'jardin')],
    entities: [mesure('sensor.jardin_temperature', 'd_station', 'temperature'), { ...entity(MA), platform: 'meteoalarm' }],
    floors: [], energyPrefs: null,
    states: states(m('sensor.jardin_temperature', 12, 'Jardin température', 'temperature', '°C'),
      state(MA, 'off', { friendly_name: 'MeteoAlarm', device_class: 'safety', awareness_level: '1; green; Minor' })),
  };
  avec(fx, { loggia_rooms: [{ room: 'Jardin' }] }, (H) => {
    const d = sections(H, capteurs(H)).find(x => x.id === 'dehors');
    assert.deepEqual([d.regarder, d.statut], [0, false], 'au calme : ni « Rien à signaler », ni statut');
    const vig = capteurs(H).find(x => x.vigilance);
    assert.equal(F.jugerObjet(H, vig), 'neutre');
    const HJ = { states: { ...H.states, [MA]: { ...H.states[MA], state: 'on', attributes: { ...H.states[MA].attributes, awareness_level: '2; yellow; Moderate', event: 'Vent' } } } };
    const dj = sections(HJ, capteurs(H)).find(x => x.id === 'dehors');
    assert.deepEqual([dj.regarder, dj.statut], [1, true], 'une vigilance jaune : « 1 à regarder »');
  });
});

test('M12 : une sœur de son appareil Météo-France ne fait plus disparaître la carte Vigilance', () => {
  const MF = 'sensor.paris_weather_alert', PR = 'sensor.paris_pression';
  const fx = {
    areas: [area('cuisine', 'Cuisine')], devices: [device('d_mf', 'Météo-France Paris', null), device('d_st', 'Station', 'cuisine')],
    entities: [{ ...entity(MF, { device: 'd_mf' }), platform: 'meteo_france', translation_key: 'weather_alert' }, mesure(PR, 'd_mf', 'pressure')],
    floors: [], energyPrefs: null,
    states: states(state(MF, 'Vert', { friendly_name: 'Alerte météo Paris' }), m(PR, 1013, 'Paris pression', 'pressure', 'hPa')),
  };
  avec(fx, { loggia_rooms: [{ room: 'Cuisine' }] }, (H) => {
    const objets = capteurs(H);
    assert.ok(objets.some(o => o.id === MF && o.vigilance), 'la vigilance garde sa carte');
  });
});

test('M13 : la carte Piles exige un appareil physique et ne compte pas les batteries rechargeables', () => {
  const st = (s, a) => ({ state: String(s), attributes: a });
  const pile = (n, nom) => st(n, { device_class: 'battery', unit_of_measurement: '%', friendly_name: nom });
  const S = {
    'sensor.capteur_porte_battery': pile(12, 'Porte'), 'sensor.pile_la_plus_basse': pile(12, 'Pile la plus basse'),
    'sensor.model_3_battery_level': pile(14, 'Model 3'), 'sensor.model_3_charger_power': st(0, { device_class: 'power' }),
    'sensor.ups_battery_charge': pile(10, 'Onduleur'), 'sensor.tablette_battery': pile(9, 'Tablette'), 'binary_sensor.tablette_plugged_in': st('off', { device_class: 'plug' }),
  };
  const dev = { 'sensor.capteur_porte_battery': 'd1', 'sensor.model_3_battery_level': 'car', 'sensor.model_3_charger_power': 'car', 'sensor.ups_battery_charge': 'ups',
    'sensor.tablette_battery': 'tab', 'binary_sensor.tablette_plugged_in': 'tab' };
  const ctx = { meta: (id) => ({ deviceId: dev[id] || null, platform: id.includes('basse') ? 'min_max' : id.includes('ups') ? 'nut' : 'x' }), physique: () => true,
    soeurs: (id) => Object.keys(dev).filter(e => e !== id && dev[e] === dev[id]), piece: () => '', appareil: () => null };
  assert.deepEqual(P.pilesDeLaMaison(S, ctx).map(p => p.id), ['sensor.capteur_porte_battery']);
  assert.ok(lire('custom_components/loggia/veilles.py').includes('classes.get(h) in ("battery_charging", "plug")'), 'le serveur suit la même règle');
});

test('M14 : l’Accueil ne compte ni un groupe de Home Assistant, ni une entité masquée — « Fumée détectée » une seule fois', () => {
  const st = (s, a) => ({ state: s, attributes: a });
  const S = {
    'binary_sensor.fenetre_salon': st('on', { device_class: 'window', friendly_name: 'Fenêtre salon' }),
    'binary_sensor.fenetre_chambre': st('off', { device_class: 'window', friendly_name: 'Fenêtre chambre' }),
    'binary_sensor.toutes_les_fenetres': st('on', { device_class: 'window', friendly_name: 'Toutes', entity_id: ['binary_sensor.fenetre_salon', 'binary_sensor.fenetre_chambre'] }),
    'binary_sensor.fenetre_cachee': st('on', { device_class: 'window', friendly_name: 'Cachée' }),
    'binary_sensor.fumee_cuisine': st('on', { device_class: 'smoke', friendly_name: 'Fumée cuisine' }),
    'binary_sensor.detecteurs_fumee': st('on', { device_class: 'smoke', friendly_name: 'Détecteurs' }),
  };
  const ctx = { plateforme: (id) => (id.includes('detecteurs') ? 'group' : 'zha'), masque: (id) => id.includes('cachee') };
  const c = A.comptesSecurite(S, [], ctx);
  assert.deepEqual([c.fenetres.total, c.fenetres.ouverts], [2, 1]);
  assert.deepEqual(A.pointsAttention({ S, ...ctx }).map(p => p.titre), ['Fumée détectée']);
  assert.ok(APP.includes('comptesSecurite(S, camsInfoSec, { plateforme: plateformeDe, masque: masqueDe })') && APP.includes('plateforme: plateformeDe, masque: masqueDe,'));
});

test('M15 (D5) : la cour, le potager, la piscine, « Backyard », « Hof » sont dehors ; un jardin d’hiver, un couloir, non — et « Pièce du dehors » l’emporte', () => {
  setLoggiaState({ index: null, ent: {}, cfg: {}, resolved: null });
  const dehors = ['Backyard', 'Front yard', 'Porch', 'Cour', 'Potager', 'Piscine', 'Allée', 'Hof', 'Vorgarten', 'Oprit', 'Cortile', 'Huerto', 'Podwórko', 'Terrasse', 'Balcon'];
  for (const n of dehors) assert.equal(F.estDehors(n), true, n);
  for (const n of ['Jardin d’hiver', 'Wintergarten', 'Couloir', 'Salon', 'Véranda', 'Chambre côté jardin', 'Garage']) assert.equal(F.estDehors(n), false, n);
  setLoggiaState({ index: null, ent: {}, cfg: { loggia_rooms: [{ room: 'Atelier', dehors: true }, { room: 'Terrasse', dehors: false }] }, resolved: null });
  try { assert.deepEqual([F.estDehors('Atelier'), F.estDehors('Terrasse')], [true, false]); } finally { setLoggiaState({ index: null, ent: {}, cfg: {}, resolved: null }); }
});

test('M16 : la bannière et le badge lisent la table du CO₂ ; pas de « BON » sans mesure', () => {
  assert.ok(!APP.includes('function airPalier') && !APP.includes('function airLabel') && !APP.includes('function co2Style'));
  assert.ok(!APP.includes(": tr('BON')"), 'plus de « BON » au chargement');
  assert.ok(APP.includes("const motCo2 = (co2) => { const z = zoneCo2(co2); return z ? z.t.toLocaleUpperCase(locale()) : ''; };"));
});

test('points bas : kelvins, nombres lus strictement, sonde d’un thermostat, MeteoAlarm verte, glyphe du CO, chiffres', () => {
  const fx = {
    areas: [area('salon', 'Salon')], devices: [device('d1', 'Capteur', 'salon'), device('d_eco', 'Ecobee', 'salon')],
    entities: [mesure('sensor.k', 'd1', 'temperature'), mesure('sensor.co2_virgule', 'd1', 'carbon_dioxide'), mesure('sensor.t_nan', 'd1', 'temperature'),
      entity('climate.ecobee', { device: 'd_eco' }), mesure('sensor.ecobee_co2', 'd_eco', 'carbon_dioxide'), mesure('sensor.ecobee_temperature', 'd_eco', 'temperature')],
    floors: [], energyPrefs: null,
    states: states(m('sensor.k', 294.15, 'Kelvin', 'temperature', 'K'), m('sensor.co2_virgule', '1,659', 'CO2', 'carbon_dioxide', 'ppm'), m('sensor.t_nan', 'nan', 'T', 'temperature', '°C'),
      state('climate.ecobee', 'heat', { friendly_name: 'Ecobee' }), m('sensor.ecobee_co2', 900, 'Ecobee CO2', 'carbon_dioxide', 'ppm'), m('sensor.ecobee_temperature', 21, 'Ecobee température', 'temperature', '°C')),
  };
  avec(fx, { loggia_rooms: [{ room: 'Salon' }] }, (H) => {
    const k = F.vueMesure(H, 'sensor.k');
    assert.deepEqual([k.zone.t, k.unite], ['Idéal', 'K'], '294,15 K = 21 °C, plus « Trop chaud »');
    assert.equal(F.vueMesure(H, 'sensor.co2_virgule').chiffre, '2', '« 1,659 » se lit 1,659 — plus 1');
    assert.deepEqual([F.vueMesure(H, 'sensor.t_nan').chiffre, F.vueMesure(H, 'sensor.t_nan').phrase], [null, 'Valeur illisible']);
    assert.deepEqual([F.lireNombre('21,5'), F.lireNombre('21.4abc'), F.lireNombre(' '), F.lireNombre('nan')], [21.5, null, null, null]);
    const ids = capteurs(H).map(o => o.id);
    assert.ok(ids.includes('sensor.ecobee_co2') && !ids.includes('sensor.ecobee_temperature'), 'le CO₂ d’un thermostat a sa carte ; sa température reste au thermostat');
  });
  const S = { 'binary_sensor.meteoalarm': { state: 'on', attributes: { device_class: 'safety', awareness_level: '1; green; Minor', attribution: 'MeteoAlarm' } } };
  assert.deepEqual(A.pointsAttention({ S }), [], 'MeteoAlarm au vert : pas de « Vigilance météo »');
  assert.equal(F.cvIcoEntite('binary_sensor', 'binary_sensor.co', { state: 'off', attributes: { device_class: 'carbon_monoxide' } }, 'CO'), 'flame', 'la glyphe de Sécurité, plus le radar');
  assert.ok(APP.includes("out.badge = nombre(r.co2, 0) + '\\u00a0ppm'"), 'le badge écrit « 1 480 ppm »');
  // Une seule règle de pile : les barres et la fiche d'une plante lisent la même.
  assert.ok(!lire('src/ficheplante.jsx').includes('<= 20'), 'la fiche plante lit seuilsPile()');
});

test('code mort : jaugeMesure, barresPile, TONS_GROUPE.accent, `gate` des binaires, MESURES_NOMS sont partis', () => {
  assert.equal(C.jaugeMesure, undefined);
  assert.equal(C.barresPile, undefined);
  assert.ok(!APP.includes("accent: ['var(--o-accent-soft)', 'var(--o-accent-rgb)', 0]"));
  assert.ok(!A.CLASSES_PORTE.includes('gate') && !APP.includes("'opening', 'gate'"));
  assert.ok(!APP.includes('MESURES_NOMS'));
  assert.deepEqual(G.FAMILLES_GROUPES.ouvertures, A.CLASSES_OUVRANT, 'UNE table des classes');
});

test('la démo porte les cas : une mesure muette dans Air, une vigilance active, un binaire à part, un monoxyde en ppm ; l’indice ne passe pas sous 0', async () => {
  const d = maisonCapteursDemo({ quand: Date.UTC(2026, 9, 14, 18, 40) });
  const S = d.states;
  assert.equal(S['sensor.bureau_particules'].state, 'unavailable');
  assert.deepEqual([S['sensor.paris_weather_alert'].state, S['sensor.paris_weather_alert'].attributes['Vent violent']], ['Jaune', 'Jaune']);
  assert.equal(S['binary_sensor.lave_linge_vibration'].attributes.device_class, 'vibration');
  assert.deepEqual([S['sensor.cuisine_monoxyde'].attributes.device_class, S['sensor.cuisine_monoxyde'].attributes.unit_of_measurement], ['carbon_monoxide', 'ppm']);
  assert.ok(lire('src/demo.js').includes("if (!reseau && cur >= 0 && attrs.device_class !== 'temperature') v = Math.max(0, v);"));
  // Un seul nom pour l'indice : « Qualité de l'air », l'apostrophe droite du capteur.
  assert.equal(C.nomClasse('aqi'), "Qualité de l'air");
});

test('« Bon · 68 % d’humidité » : la température ne redit l’humidité que si celle-ci est bonne', () => {
  const z = C.zoneMesure('temp', 20);
  assert.equal(C.phraseMesure('temp', z, 68), 'Idéal', 'une humidité « Humide » : sa carte la dit, la température se tait');
  assert.equal(C.phraseMesure('temp', z, 45), 'Idéal · 45 % d’humidité');
  assert.equal(C.phraseMesure('temp', C.zoneMesure('temp', 5, true), 92), 'Froid · 92 % d’humidité', 'dehors, rien n’est un jugement');
});

/* ── La relecture indépendante du lot 3 (19/10) : ses preuves, scratchpad/revue-lot3 ─────────────────────────────────────────── */

test('relecture 1 : une pièce équipée d’un seul thermostat (tado, Nest) garde sa température — repli sur sa sonde ; jugée comme l’air', () => {
  const fx = { areas: [area('salon', 'Salon')], devices: [device('d_tado', 'Salon', 'salon', { model: 'VA02' })],
    entities: [entity('climate.salon', { device: 'd_tado' }), entity('sensor.salon_temperature', { device: 'd_tado' }), entity('sensor.salon_humidity', { device: 'd_tado' })],
    floors: [], energyPrefs: null,
    states: states(state('climate.salon', 'heat', {}), m('sensor.salon_temperature', 20.5, 'Salon Temperature', 'temperature', '°C'), m('sensor.salon_humidity', 48, 'Salon Humidity', 'humidity', '%')) };
  const r = resolveRooms({ index: ctxOf(fx).index, states: fx.states });
  assert.deepEqual([r.suggested[0].temp, r.suggested[0].hum], ['sensor.salon_temperature', 'sensor.salon_humidity']);
  // Un thermomètre à part passe devant la sonde du thermostat.
  fx.devices.push(device('d_th', 'Thermo', 'salon'));
  fx.entities.push(entity('sensor.zz_thermo', { device: 'd_th' }));
  fx.states['sensor.zz_thermo'] = { entity_id: 'sensor.zz_thermo', state: '21', attributes: { device_class: 'temperature', unit_of_measurement: '°C' } };
  assert.equal(resolveRooms({ index: ctxOf(fx).index, states: fx.states }).suggested[0].temp, 'sensor.zz_thermo');
  const { simpleHome } = FIX;
  const h = simpleHome();
  const rs = resolveRooms({ index: ctxOf(h).index, states: h.states });
  assert.equal([...rs.suggested, ...rs.technical].find(z => z.name === 'Chambre').temp, 'sensor.chambre_temperature', 'la fixture du dépôt retrouve la Chambre');
  const horsAir = HA.horsAir('sensor.salon_temperature', fx.states, () => ({}), null, ['climate.salon']);
  assert.equal(horsAir, false, 'la sonde d’un thermostat est l’air de la pièce');
});

test('relecture 2 : la popup Sécurité dit un monoxyde chiffré dangereux, et un membre capteur ouvre la fiche d’une mesure', async () => {
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const FG = await import('../src/fichegroupe.jsx');
  const S = { 'sensor.cuisine_co': { state: '200', attributes: { device_class: 'carbon_monoxide', unit_of_measurement: 'ppm' } } };
  const briques = { etatsBinaires: () => ({ carbon_monoxide: ['Monoxyde détecté', 'Pas de monoxyde', true] }), pileDe: () => null, soeursDe: () => [] };
  const rendu = (etats) => renderToStaticMarkup(createElement(FG.Securite, { ids: ['sensor.cuisine_co'], S: etats, noms: new Map([['sensor.cuisine_co', 'Cuisine']]), briques, journee: null, onMembre: () => {} }));
  const html = rendu(S);
  assert.ok(!html.includes('Pas de monoxyde') && html.includes('Monoxyde détecté'));
  assert.ok(rendu({ 'sensor.cuisine_co': { ...S['sensor.cuisine_co'], state: '3' } }).includes('3\u00a0ppm'), 'au calme, le chiffre');
  assert.ok(APP.includes("membre.indexOf('sensor.') === 0 ? <FicheCapteur id={membre} hass={H} onClose={() => setMembre(null)} />"));
});

test('relecture 3 : « couvert » ne rentre que la piscine', () => {
  setLoggiaState({ index: null, ent: {}, cfg: {}, resolved: null });
  for (const n of ['Terrasse couverte', 'Balcon couvert', 'Patio couvert', 'Cour couverte', 'Innenhof']) assert.equal(F.estDehors(n), true, n);
  assert.equal(F.estDehors('Piscine couverte'), false);
});

test('relecture 4 : la lumière d’une plante ne presse ni la nuit, ni le matin ; `max_brightness: null` n’est pas 0', () => {
  const fx = { areas: [area('salon', 'Salon')], devices: [device('d_pl', 'Ficus', 'salon', { model: 'Flower care' })],
    entities: [mesure('sensor.ficus_moisture', 'd_pl', 'moisture'), mesure('sensor.ficus_conductivity', 'd_pl', 'conductivity'), mesure('sensor.ficus_illuminance', 'd_pl', 'illuminance')],
    floors: [], energyPrefs: null,
    states: states(m('sensor.ficus_moisture', 40, 'Ficus sol', 'moisture', '%'), m('sensor.ficus_conductivity', 600, 'Ficus engrais', 'conductivity', 'µS/cm'),
      m('sensor.ficus_illuminance', 150, 'Ficus lumière', 'illuminance', 'lx')) };
  /* ASSERTIONS MODIFIÉES (contre-relecture du lot 3) : plus `rising` — à 18 h en octobre, 150 lx ne disent rien non plus. Le lux du
   * moment ne compte qu'avec le soleil à 20° au moins. */
  const juge = (soleil) => avec({ ...fx, states: { ...fx.states, ...(soleil ? { 'sun.sun': { state: soleil[0], attributes: soleil[1] } } : {}) } }, { loggia_rooms: [{ room: 'Salon' }] },
    (H) => { const base = capteurs(H).find(o => o.type === 'plant').cle.slice(6); return PL.vuePlante(F.lirePlante(H, base)).presse; });
  assert.deepEqual(juge(['above_horizon', { elevation: 8, rising: true }]), [], 'le matin, soleil bas');
  assert.deepEqual(juge(['above_horizon', { elevation: 12, rising: false }]), [], '18 h en octobre, soleil bas');
  assert.deepEqual(juge(['above_horizon', {}]), [], 'sans élévation');
  assert.deepEqual(juge(['below_horizon', { elevation: -10 }]), [], 'la nuit');
  assert.deepEqual(juge(null), [], 'sans sun.sun');
  assert.deepEqual(juge(['above_horizon', { elevation: 35 }]), ['lumiere'], 'soleil haut, 150 lx sont faibles');
  assert.ok(APP.includes('lireNombre(S[base].attributes.max_brightness)'), 'null n’est pas 0');
});

test('relecture 5 : un lit, un plateau, « interne », la piscine de la pièce', () => {
  const hors = (nom, piece = null, soeurs = []) => HA.horsAir('sensor.x', { 'sensor.x': { state: '20', attributes: { friendly_name: nom, device_class: 'temperature' } } }, () => ({}), null, soeurs, piece);
  assert.deepEqual(['Master Bed Temperature', 'Plateau Température', 'Internet box temperature', 'Sonde salon'].map(n => hors(n)), [false, false, false, false]);
  assert.deepEqual(['OctoPrint actual bed temp', 'Prusa heatbed', 'Plateau chauffant', 'Sonde interne'].map(n => hors(n)), [true, true, true, true]);
  assert.equal(hors('Bed temperature', null, ['sensor.mk4_nozzle_temperature']), true, 'une imprimante chez ses sœurs');
  assert.deepEqual([hors('Piscine Température', 'Piscine'), hors('Piscine eau', 'Jardin')], [false, true], 'le nom de la pièce ne compte pas');
});

test('relecture 6 et décision A : le seuil du téléphone est celui de la table', () => {
  const py = lire('custom_components/loggia/veilles.py');
  const seuil = Number(py.match(/^SEUIL_CO = (\d+)$/m)[1]);
  const table = C.zonesMesure('co');
  assert.equal(table[1].a, seuil, 'Moyen finit au seuil du serveur');
  assert.equal(table[1].inclus, true, 'le seuil lui-même est Moyen');
  assert.ok(lire('scripts/textes_serveur.mjs').includes("'{nom} : monoxyde de carbone à {v} ppm, aérez et sortez'"), 'le texte part dans les sept langues');
});

test('relecture 7 : un kelvin s’écrit « K », jamais « °K »', () => {
  assert.equal(U.signeTemp('K'), 'K');
  assert.equal(U.signeTemp('C'), '°C');
  assert.equal(PL.vuePlante({ hum: 40, temp: 21, uniteTemp: 'K' }, { deCelsius: U.deCelsius }).mesures.find(x => x.cle === 'temp').valeur, '294,2\u00a0K');
  assert.ok(!PL.conseilsPlante({ hum: 40, temp: 5, uniteTemp: 'K' }, { deCelsius: U.deCelsius }).join(' ').includes('°K'));
  for (const f of ['src/ficheplante.jsx', 'src/ficheconfort.jsx', 'src/plantes.js']) assert.ok(lire(f).includes('signeTemp('), f);
});

/* ── La contre-relecture du lot 3 : scratchpad/revue-lot3/preuve2.mjs ─────────────────────────────────────────────────────── */

test('contre-relecture 1 : la sonde d’un thermostat qui dit la pièce — celle qu’il affiche, jamais l’eau ni le dehors', () => {
  const t = (id, v, nom) => state(id, v, { device_class: 'temperature', unit_of_measurement: '°C', state_class: 'measurement', friendly_name: nom });
  const cas = (ents, sts) => {
    const fx = { areas: [area('z', 'Cellier')], devices: [device('d', 'Chaudière', 'z')], entities: ents.map(e => entity(e, { device: 'd' })), floors: [], energyPrefs: null, states: states(...sts) };
    const r = resolveRooms({ index: ctxOf(fx).index, states: fx.states });
    return [...r.suggested, ...r.technical][0].temp;
  };
  assert.equal(cas(['climate.chaudiere', 'sensor.chaudiere_eau', 'sensor.chaudiere_piece'],
    [state('climate.chaudiere', 'heat', {}), t('sensor.chaudiere_eau', 62, 'Boiler water temperature'), t('sensor.chaudiere_piece', 19, 'Room temperature')]), 'sensor.chaudiere_piece', 'OpenTherm : pas l’eau à 62 °C');
  assert.equal(cas(['climate.th', 'sensor.th_exterieur', 'sensor.th_temperature'],
    [state('climate.th', 'heat', {}), t('sensor.th_exterieur', 3, 'Outside temperature'), t('sensor.th_temperature', 20, 'Temperature')]), 'sensor.th_temperature', 'pas le dehors');
  assert.equal(cas(['climate.vitodens', 'water_heater.vitodens', 'sensor.vitodens_depart'],
    [state('climate.vitodens', 'heat', {}), state('water_heater.vitodens', 'eco', {}), t('sensor.vitodens_depart', 45, 'Supply temperature')]), null, 'un départ de chaudière : rien');
  // Ce que le thermostat AFFICHE passe devant tout : sa sonde à 21,4, pas la première de l'appareil.
  assert.equal(cas(['climate.th', 'sensor.th_a', 'sensor.th_b'],
    [state('climate.th', 'heat', { current_temperature: 21.4 }), t('sensor.th_a', 18, 'Sonde A'), t('sensor.th_b', 21.4, 'Sonde B')]), 'sensor.th_b');
  // Le nom d'une pièce s'efface en MOTS entiers : une pièce « A » n'efface pas les « a » de « frigo ».
  const S2 = { 'sensor.x': { state: '4', attributes: { friendly_name: 'A frigo', device_class: 'temperature' } } };
  assert.equal(HA.horsAir('sensor.x', S2, () => ({}), null, [], 'A'), true);
});
