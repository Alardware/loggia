/* Chantier G4 (30/10, ADR 0303) : l'air et les UV dans la fiche météo — A1, A2, A6.
 *
 *  - A1 : la qualité de l'air du DEHORS, une tuile de la fiche météo, seulement quand l'échelle de l'indice est CONNUE — par un
 *    capteur à choix frère (AirVisual, Google, AccuWeather), ou par la plateforme (Atmo France, AirNow, Ambient, AirVisual US,
 *    Airly) ; sinon, pas de tuile. Les pollens d'Atmo France, des `aqi` de 1 à 6, ne sont jamais l'indice de l'air. Le lendemain,
 *    quand l'intégration le donne. Une information : jamais une alerte.
 *  - A2 : l'UV du jour dans la tuile UV — « Max 6 · protection de 12 h à 16 h », sur la prévision horaire, au seuil 3 de l'OMS.
 *  - A6 : une tuile « Pollens », seulement s'il existe un capteur de pollen à échelle connue.
 * La démo porte un indice Atmo, ses pollens et l'UV de ses heures. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.TZ = 'Europe/Paris';
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
const { composant, rendre } = await import('./rendu.mjs');
const C = await import('../src/confort.js');
const { airDuDehors, pollensDuDehors } = await import('../src/airdehors.js');
const { tuilesMeteo, uvDuJour } = await import('../src/meteofiche.js');
const { setLoggiaState } = await import('../src/state.js');
const { maisonMesuresDemo, previsionsDemo } = await import('../src/demo.js');
const lire = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const st = (state, attributes = {}) => ({ state: String(state), attributes });
const metaDe = (t) => (id) => t[id] || null;
const iso = (t) => new Date(t).toISOString();
const heure = (h, j = 20) => new Date(2026, 9, j, h, 0).getTime();

/* Atmo France (HACS, sebcaps/atmofrance) tel qu'il se déclare : « Qualité globale-<ville> » SANS classe, son lendemain « -J+1 »,
 * ses sous-indices et ses niveaux de pollen en `aqi` de 1 à 6, ses concentrations de pollen en µg/m³. */
const ATMO = {
  'sensor.qualite_globale_paris': st(2, { friendly_name: 'Qualité globale-Paris', 'Libellé': 'Moyen', 'Couleur': '#50ccaa' }),
  'sensor.qualite_globale_paris_j_1': st(3, { friendly_name: 'Qualité globale-Paris-J+1', 'Libellé': 'Dégradé' }),
  'sensor.dioxyde_d_azote_paris': st(5, { friendly_name: "Dioxyde d'azote-Paris", device_class: 'aqi' }),
  'sensor.qualite_globale_pollen_paris': st(4, { friendly_name: 'Qualité globale Pollen-Paris', 'Libellé': 'Élevé' }),
  'sensor.qualite_globale_pollen_paris_j_1': st(6, { friendly_name: 'Qualité globale Pollen-Paris-J+1' }),
  'sensor.niveau_gramine_paris': st(4, { friendly_name: 'Niveau Graminé-Paris', device_class: 'aqi' }),
  'sensor.niveau_bouleau_paris': st(2, { friendly_name: 'Niveau Bouleau-Paris', device_class: 'aqi' }),
  'sensor.concentration_ambroisie_paris': st(12, { friendly_name: 'Concentration Ambroisie-Paris', device_class: 'volatile_organic_compounds', unit_of_measurement: 'µg/m³' }),
};
const metaAtmo = metaDe(Object.fromEntries(Object.keys(ATMO).map(id => [id, { platform: 'atmofrance', deviceId: 'atmo_paris' }])));
const sans = (S, ...ids) => Object.fromEntries(Object.keys(S).filter(id => !ids.includes(id)).map(id => [id, S[id]]));

test('A1 : les échelles connues de la table — ATMO de 1 à 6, l’EPA, le CAQI ; hors échelle, rien', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(v => C.rangIndice('atmo', v).t), ['Bon', 'Moyen', 'Dégradé', 'Mauvais', 'Très mauvais', 'Extrêmement mauvais']);
  assert.equal(C.rangIndice('atmo', '2').i, 1, 'un état est une chaîne');
  assert.equal(C.rangIndice('atmo', 0), null, '0 : « indisponible » chez Atmo France');
  assert.equal(C.rangIndice('atmo', 7), null, '7 : un « évènement », pas un rang');
  assert.equal(C.rangIndice('atmo', 2.5), null);
  assert.deepEqual([0, 50, 51, 100, 101, 150, 151, 200, 201, 300, 301].map(v => C.rangIndice('epa', v).i), [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5]);
  assert.deepEqual([0, 50, 51, 100, 101, 150, 151, 200, 201, 300, 301].map(v => C.rangIndice('epa', v).t).filter((x, i, l) => l.indexOf(x) === i),
    ['Bon', 'Modéré', 'Mauvais pour les sensibles', 'Mauvais', 'Très mauvais', 'Dangereux']);
  assert.deepEqual([10, 25, 26, 50, 75, 100, 101].map(v => C.rangIndice('caqi', v).i), [0, 0, 1, 1, 2, 3, 4]);
  for (const v of ['unavailable', 'unknown', '', ' ', null, -1]) assert.equal(C.rangIndice('epa', v), null, String(v));
  assert.equal(C.rangIndice('inconnue', 3), null);
  const r = C.rangIndice('atmo', 3);
  assert.equal(r.n, 6);
  assert.equal(r.couleurs.length, 6);
  assert.ok(r.couleurs.every(c => /^var\(--o-[a-z0-9]+-rgb\)$/.test(c)), 'les jetons du thème, jamais une couleur en dur');
  assert.equal(new Set(C.rangIndice('atmo', 1).couleurs).size, 6, 'six rangs, six teintes');
  assert.equal(r.rgb, r.couleurs[2]);
});

test('A1 : un capteur à choix — l’ensemble de ses options désigne son échelle, dans n’importe quel ordre', () => {
  assert.equal(C.indiceDesChoix(['good', 'moderate', 'unhealthy', 'unhealthy_sensitive', 'very_unhealthy', 'hazardous']), 'epa_choix', 'AirVisual les range dans cet ordre-là');
  assert.equal(C.indiceDesChoix(['good', 'moderate', 'unhealthy', 'very_unhealthy', 'hazardous']), 'accuweather');
  assert.equal(C.indiceDesChoix(['excellent_air_quality', 'good_air_quality', 'low_air_quality', 'moderate_air_quality', 'poor_air_quality']), 'uaqi');
  assert.equal(C.indiceDesChoix(['co', 'n2', 'o3', 'p1', 'p2', 's2']), null, 'le polluant principal n’est pas une échelle');
  assert.equal(C.indiceDesChoix(['low', 'moderate', 'high', 'very_high', 'extreme']), null, 'des niveaux de pollen ne sont pas l’air');
  assert.equal(C.indiceDesChoix(['good', 'moderate']), null, 'une partie ne suffit pas');
  assert.equal(C.indiceDesChoix(null), null);
  assert.equal(C.rangIndice('epa_choix', 'unhealthy_sensitive').t, 'Mauvais pour les sensibles');
  assert.equal(C.rangIndice('accuweather', 'unhealthy').i, 2, 'chez AccuWeather, « unhealthy » est le troisième de cinq');
  assert.equal(C.rangIndice('epa_choix', 'unhealthy').i, 3, 'chez l’EPA, le quatrième de six');
  assert.deepEqual(['excellent_air_quality', 'poor_air_quality'].map(v => C.rangIndice('uaqi', v).t), ['Excellent', 'Mauvais']);
});

test('A1 : Atmo France, lu à sa plateforme — l’indice du jour, son lendemain ; ni un sous-indice, ni un pollen', () => {
  const air = airDuDehors(ATMO, metaAtmo);
  assert.equal(air.id, 'sensor.qualite_globale_paris');
  assert.equal(air.echelle, 'atmo');
  assert.equal(air.valeur, '2');
  assert.equal(air.rang.t, 'Moyen');
  assert.equal(air.demain.t, 'Dégradé', 'l’option J+1 d’Atmo France');
  assert.equal(airDuDehors(sans(ATMO, 'sensor.qualite_globale_paris_j_1'), metaAtmo).demain, null, 'sans J+1, pas de lendemain');
  assert.equal(airDuDehors(ATMO, () => null), null, 'sans plateforme connue, l’échelle ne l’est pas : pas de tuile');
  // Sans l'indice global : les sous-indices (NO₂ à 5) et les niveaux de pollen (Graminé à 4) sont des `aqi` de 1 à 6 — jamais l'air.
  assert.equal(airDuDehors(sans(ATMO, 'sensor.qualite_globale_paris', 'sensor.qualite_globale_paris_j_1'), metaAtmo), null);
  // Muet aujourd'hui, ou à 0 (« indisponible ») : rien, même si demain est connu.
  assert.equal(airDuDehors({ ...ATMO, 'sensor.qualite_globale_paris': st('unavailable') }, metaAtmo), null);
  assert.equal(airDuDehors({ ...ATMO, 'sensor.qualite_globale_paris': st(0, { friendly_name: 'Qualité globale-Paris' }) }, metaAtmo), null);
  // Masquée par l'utilisateur : il n'en veut pas.
  assert.equal(airDuDehors(ATMO, (id) => ({ ...metaAtmo(id), hidden: true })), null);
});

test('A1 : les autres plateformes dont l’échelle est écrite — AirNow, Ambient (dehors seulement), AirVisual US, Airly', () => {
  const un = (id, v, attrs, meta) => airDuDehors({ [id]: st(v, attrs) }, metaDe({ [id]: meta }));
  const airnow = un('sensor.airnow_aqi', 62, { device_class: 'aqi' }, { platform: 'airnow', translationKey: 'aqi', deviceId: 'an' });
  assert.deepEqual([airnow.echelle, airnow.valeur, airnow.rang.t], ['epa', '62', 'Modéré']);
  assert.equal(un('sensor.station_aqi_pm2_5', 160, { device_class: 'aqi' }, { platform: 'ambient_station', translationKey: 'pm25_aqi' }).rang.t, 'Mauvais');
  assert.equal(un('sensor.station_aqi_pm2_5_indoor', 160, { device_class: 'aqi' }, { platform: 'ambient_station', translationKey: 'pm25_indoor_aqi' }), null, 'la sonde intérieure est la maison');
  assert.equal(un('sensor.station_aqi_pm2_5_aqin', 160, { device_class: 'aqi' }, { platform: 'ambient_station', translationKey: 'pm25_aqi_aqin' }), null, 'l’AQIN aussi');
  const us = un('sensor.paris_u_s_air_quality_index', 151, { device_class: 'aqi', friendly_name: 'Paris U.S. Air quality index' }, { platform: 'airvisual', deviceId: 'av' });
  assert.deepEqual([us.echelle, us.rang.t], ['epa', 'Mauvais']);
  assert.equal(un('sensor.paris_chinese_air_quality_index', 40, { device_class: 'aqi', friendly_name: 'Paris Chinese Air quality index' }, { platform: 'airvisual', deviceId: 'av' }), null, 'l’indice chinois n’est pas celui de l’EPA');
  const airly = un('sensor.maison_caqi', 30, { unit_of_measurement: 'CAQI', friendly_name: 'Maison Common air quality index' }, { platform: 'airly', translationKey: 'caqi' });
  assert.deepEqual([airly.echelle, airly.valeur, airly.rang.t], ['caqi', '30', 'Bon']);
  // Un indice dont rien ne dit l'échelle : un purificateur, un service sans frère à choix — pas de tuile.
  assert.equal(un('sensor.purificateur_aqi', 40, { device_class: 'aqi' }, { platform: 'xiaomi_miio', deviceId: 'p' }), null);
  assert.equal(un('sensor.waqi_paris', 55, { device_class: 'aqi' }, { platform: 'waqi', deviceId: 'w' }), null);
  // Atmo France passe devant : en France, c'est l'indice officiel.
  const deux = airDuDehors({ ...ATMO, 'sensor.airnow_aqi': st(62, { device_class: 'aqi' }) }, (id) => (id === 'sensor.airnow_aqi' ? { platform: 'airnow', translationKey: 'aqi' } : metaAtmo(id)));
  assert.equal(deux.echelle, 'atmo');
});

test('A1 : un capteur à choix frère, sur le même appareil — son rang ; l’indice universel de Google, à l’envers, ne se lit jamais au chiffre', () => {
  // Un appareil, un indice, un choix : le chiffre et le mot de son rang.
  const S1 = { 'sensor.lieu_aqi': st(120, { device_class: 'aqi' }), 'sensor.lieu_niveau': st('unhealthy_sensitive', { device_class: 'enum', options: ['good', 'moderate', 'unhealthy_sensitive', 'unhealthy', 'very_unhealthy', 'hazardous'] }) };
  const a1 = airDuDehors(S1, metaDe({ 'sensor.lieu_aqi': { platform: 'x', deviceId: 'd' }, 'sensor.lieu_niveau': { platform: 'x', deviceId: 'd' } }));
  assert.deepEqual([a1.echelle, a1.valeur, a1.rang.t], ['epa_choix', '120', 'Mauvais pour les sensibles']);
  // Google : deux indices (universel et local), un seul choix connu — le mot, pas un chiffre qu'on ne sait pas apparier.
  const G = {
    'sensor.maison_universal_air_quality_index': st(85, { device_class: 'aqi' }),
    'sensor.maison_french_aqi': st(2, { device_class: 'aqi' }),
    'sensor.maison_uaqi_category': st('excellent_air_quality', { device_class: 'enum', options: ['excellent_air_quality', 'good_air_quality', 'moderate_air_quality', 'low_air_quality', 'poor_air_quality'] }),
    'sensor.maison_french_aqi_category': st('2_fair', { device_class: 'enum', options: ['1_good', '2_fair', '3_moderate'] }),
    'sensor.maison_uaqi_dominant_pollutant': st('pm25', { device_class: 'enum', options: ['co', 'no2', 'o3', 'pm10', 'pm25', 'so2'] }),
  };
  const metaG = metaDe(Object.fromEntries(Object.keys(G).map(id => [id, { platform: 'google_air_quality', deviceId: 'g' }])));
  const g = airDuDehors(G, metaG);
  assert.deepEqual([g.echelle, g.rang.i, g.rang.t, g.valeur], ['uaqi', 0, 'Excellent', 'Excellent'], '85 sur l’échelle de l’EPA serait « Modéré » : le rang vient de la catégorie');
  // Sans sa catégorie, l'indice de Google ne se lit pas : 85 y est excellent, ailleurs moyen.
  assert.equal(airDuDehors(sans(G, 'sensor.maison_uaqi_category'), metaG), null);
  // AccuWeather : un choix seul, un par jour (« day 0 », « day 1 ») — aujourd'hui et demain.
  const choix = { device_class: 'enum', options: ['good', 'moderate', 'unhealthy', 'very_unhealthy', 'hazardous'] };
  const AW = { 'sensor.maison_air_quality_day_0': st('moderate', choix), 'sensor.maison_air_quality_day_1': st('good', choix), 'sensor.maison_air_quality_day_2': st('unhealthy', choix) };
  const aw = airDuDehors(AW, metaDe(Object.fromEntries(Object.keys(AW).map(id => [id, { platform: 'accuweather', deviceId: 'aw' }]))));
  assert.deepEqual([aw.echelle, aw.valeur, aw.rang.t, aw.demain.t], ['accuweather', 'Modéré', 'Modéré', 'Bon']);
  const awMuet = { ...AW, 'sensor.maison_air_quality_day_0': st('unavailable', choix) };
  assert.equal(airDuDehors(awMuet, metaDe(Object.fromEntries(Object.keys(AW).map(id => [id, { platform: 'accuweather', deviceId: 'aw' }])))), null, 'le jour 0 muet : demain ne passe pas pour aujourd’hui');
  // Deux choix connus qui ne sont pas les jours d'une même série (AirVisual sans sa plateforme, US et chinois) : on ne choisit pas.
  const av = { 'sensor.p_u_s_air_pollution_level': st('good', { device_class: 'enum', options: choix.options.concat('unhealthy_sensitive') }),
    'sensor.p_chinese_air_pollution_level': st('moderate', { device_class: 'enum', options: choix.options.concat('unhealthy_sensitive') }) };
  assert.equal(airDuDehors(av, metaDe(Object.fromEntries(Object.keys(av).map(id => [id, { platform: 'autre', deviceId: 'av' }])))), null);
  // Sans appareil, pas de frère.
  assert.equal(airDuDehors(S1, metaDe({ 'sensor.lieu_aqi': { platform: 'x' }, 'sensor.lieu_niveau': { platform: 'x' } })), null);
});

test('A6 : les pollens — Atmo France (« Qualité globale Pollen », « Niveau … ») ; ni le lendemain, ni les concentrations', () => {
  const p = pollensDuDehors(ATMO, metaAtmo);
  assert.equal(p.rang.t, 'Élevé', 'l’indice global du jour, pas celui de J+1 (6)');
  assert.deepEqual(p.plantes, ['Graminées'], 'ce qui le fait monter');
  // Sans l'indice global : le plus haut des niveaux.
  const sansGlobal = pollensDuDehors(sans(ATMO, 'sensor.qualite_globale_pollen_paris'), metaAtmo);
  assert.deepEqual([sansGlobal.rang.t, sansGlobal.plantes], ['Élevé', ['Graminées']]);
  // Tout est très faible : le mot, sans plante.
  const calme = pollensDuDehors({ 'sensor.qualite_globale_pollen_paris': st(1, { friendly_name: 'Qualité globale Pollen-Paris' }), 'sensor.niveau_bouleau_paris': st(1, { friendly_name: 'Niveau Bouleau-Paris', device_class: 'aqi' }) }, metaAtmo);
  assert.deepEqual([calme.rang.t, calme.plantes], ['Très faible', []]);
  // Sans plateforme, un « Niveau Bouleau » à 4 ne dit pas son échelle.
  assert.equal(pollensDuDehors(ATMO, () => null), null);
  assert.equal(pollensDuDehors(sans(ATMO, 'sensor.qualite_globale_pollen_paris', 'sensor.niveau_gramine_paris', 'sensor.niveau_bouleau_paris'), metaAtmo), null, 'le lendemain et les concentrations seuls : rien');
});

test('A6 : les pollens en p/m³ qui portent leur niveau (AccuWeather) — le jour 0 ; sans niveau connu, rien', () => {
  const p = (v, level, plus = {}) => st(v, { unit_of_measurement: 'p/m³', ...(level ? { level } : {}), ...plus });
  const S = { 'sensor.maison_grass_pollen_day_0': p(48, 'high'), 'sensor.maison_tree_pollen_day_0': p(5, 'low'), 'sensor.maison_grass_pollen_day_1': p(400, 'extreme'),
    'sensor.maison_ragweed_pollen_day_0': p(60, 'high'), 'sensor.maison_mold_pollen_day_0': p(900, 'moderate') };
  const cles = { grass: 'grass_pollen', tree: 'tree_pollen', ragweed: 'ragweed_pollen', mold: 'mold_pollen' };
  const meta = (id) => ({ platform: 'accuweather', deviceId: 'aw', translationKey: cles[id.split('_')[1]] });
  const r = pollensDuDehors(S, meta);
  assert.equal(r.rang.t, 'Élevé', 'le jour 1 (« extreme ») ne compte pas aujourd’hui');
  assert.deepEqual(r.plantes, ['Ambroisie', 'Graminées']);
  // Sans clé de traduction, le nom suffit.
  assert.deepEqual(pollensDuDehors(S, (id) => ({ platform: 'accuweather', deviceId: 'aw' })).plantes, ['Ambroisie', 'Graminées']);
  assert.equal(pollensDuDehors({ 'sensor.maison_grass_pollen_day_0': p(48, null) }, meta), null, 'sans niveau, pas d’échelle');
  assert.equal(pollensDuDehors({ 'sensor.maison_grass_pollen_day_0': p(48, 'beaucoup') }, meta), null, 'un niveau inconnu non plus');
  assert.equal(pollensDuDehors({ 'sensor.x': st(48, { level: 'high' }) }, meta), null, 'sans unité de pollen, ce n’en est pas un');
  assert.equal(pollensDuDehors({}, meta), null);
});

test('A1, A6 : deux tuiles de plus, à la suite des six — le chiffre, le mot du rang, le lendemain, la barre des rangs', () => {
  const air = airDuDehors(ATMO, metaAtmo);
  const pollens = pollensDuDehors(ATMO, metaAtmo);
  const t = tuilesMeteo({ attributs: { humidity: 50 }, jours: null, heures: null, maintenant: heure(14), soleil: null, air, pollens });
  assert.deepEqual(t.map(x => x.cle), ['humidite', 'air', 'pollens']);
  assert.deepEqual(t[1], { cle: 'air', titre: 'Qualité de l\'air', valeur: '2', sous: 'Moyen', ligne: 'Demain : Dégradé', rangs: { i: 1, couleurs: air.rang.couleurs } });
  assert.deepEqual(t[2], { cle: 'pollens', titre: 'Pollens', valeur: 'Élevé', sous: 'Graminées', ligne: null, rangs: { i: 3, couleurs: pollens.rang.couleurs } });
  // Un mot seul (AccuWeather, Google) : la valeur est le mot, il ne se redit pas dessous.
  const mot = tuilesMeteo({ attributs: {}, air: { valeur: 'Bon', rang: C.rangIndice('accuweather', 'good'), demain: null } })[0];
  assert.deepEqual([mot.valeur, mot.sous, mot.ligne], ['Bon', null, null]);
  assert.deepEqual(tuilesMeteo({ attributs: {}, air: null, pollens: null }), [], 'rien de connu : pas de tuile');
  // Une information, jamais une alerte : aucun ton, aucun lavis.
  for (const x of t) assert.ok(!('ton' in x) && !('alerte' in x));
});

test('A2 : l’UV du jour — le maximum des heures qui restent, et la protection dès 3 (OMS)', () => {
  const h = (hh, uv, j = 20) => ({ datetime: iso(heure(hh, j)), uv_index: uv });
  const heures = [h(10, 1), h(11, 2), h(12, 4), h(13, 6), h(14, 6), h(15, 3), h(16, 2), h(17, 1), h(12, 9, 21)];
  assert.deepEqual(uvDuJour(heures, heure(9) + 20 * 60000), { max: 6, de: heure(12), a: heure(16), deja: false }, 'demain (9) ne compte pas');
  const tuile = (m, hs = heures) => tuilesMeteo({ attributs: { uv_index: 2 }, heures: hs, maintenant: m }).find(x => x.cle === 'uv');
  assert.equal(tuile(heure(9) + 20 * 60000).ligne, 'Max 6 · protection de 12 h à 16 h');
  assert.equal(tuile(heure(14) + 40 * 60000).ligne, 'Max 6 · protection jusqu’à 16 h', 'l’heure en cours compte : la protection a commencé');
  assert.equal(tuile(heure(16) + 10 * 60000).ligne, 'Max 2', 'passé le pic, le maximum de ce qui reste, sans protection');
  assert.equal(tuile(heure(18) + 10 * 60000).ligne, undefined, 'plus aucune heure du jour : rien');
  assert.equal(tuile(heure(9), heures.map(x => ({ datetime: x.datetime }))).ligne, undefined, 'sans UV dans la prévision : rien');
  assert.equal(tuile(heure(9), heures.map(x => ({ ...x, uv_index: 0 }))).ligne, undefined, 'un maximum nul (la nuit) : rien');
  assert.equal(tuile(heure(9), null).ligne, undefined);
  assert.equal(tuile(heure(9)).sous, 'Faible', 'le mot de l’UV du moment reste');
  // Le seuil est celui des zones de la tuile (zoneUV) : 2,6 est déjà « Modéré ».
  assert.deepEqual(uvDuJour([h(12, 2.6), h(13, 2)], heure(9)), { max: 3, de: heure(12), a: heure(13), deja: false });
});

test('la fiche : les tuiles Qualité de l’air et Pollens, rendues, quand l’index connaît Atmo France ; sinon, rien', async () => {
  const Fiche = await composant('fichemeteo.jsx');
  const meteo = { entity_id: 'weather.maison', state: 'cloudy', last_updated: iso(heure(14)), attributes: { friendly_name: 'Maison', temperature: 19, humidity: 70, uv_index: 2 } };
  const S = { 'weather.maison': meteo, ...ATMO };
  // React écrit l'apostrophe « &#x27; » : le texte affiché, lui, la porte.
  const texte = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, '\'').replace(/\s+/g, ' ');
  const hass = { states: S, connection: { subscribeMessage: () => Promise.resolve(() => {}) } };
  setLoggiaState({ index: { entityMeta: new Map(Object.keys(ATMO).map(id => [id, metaAtmo(id)])) } });
  try {
    const t = texte(rendre(Fiche, { id: 'weather.maison', hass, maintenant: heure(14) }));
    for (const x of ['Qualité de l\'air', 'Moyen', 'Demain : Dégradé', 'Pollens', 'Élevé', 'Graminées']) assert.ok(t.includes(x), x + ' manque');
  } finally { setLoggiaState({ index: null }); }
  const sansIndex = texte(rendre(Fiche, { id: 'weather.maison', hass, maintenant: heure(14) }));
  assert.ok(!sansIndex.includes('Qualité de l\'air') && !sansIndex.includes('Pollens'), 'sans plateforme connue, aucune tuile');
  // La fiche ne teinte rien : la barre des rangs, aux jetons du thème.
  const src = lire('src/fichemeteo.jsx');
  assert.ok(src.includes('tl.rangs') && src.includes('tl.ligne'));
});

test('la démo porte un indice Atmo, ses pollens et l’UV de ses heures — l’indice de la station du jardin reste muet', () => {
  const m = maisonMesuresDemo();
  const idx = m.index();
  const meta = new Map(idx.entities.map(e => [e.id, { platform: e.platform, deviceId: e.device, translationKey: e.key || null, name: e.name }]));
  const air = airDuDehors(m.states, (id) => meta.get(id) || null);
  assert.deepEqual([air.echelle, air.rang.t, air.demain && air.demain.t], ['atmo', 'Moyen', 'Dégradé']);
  const pollens = pollensDuDehors(m.states, (id) => meta.get(id) || null);
  assert.ok(pollens && pollens.plantes.length > 0);
  assert.equal(idx.devices.find(d => d.id === meta.get(air.id).deviceId).entry_type, 'service', 'un service : il n’entre pas dans Objets');
  // Sans Atmo France, l'indice de la station du jardin (62, aucune échelle) ne fait pas de tuile.
  const seuls = Object.fromEntries(Object.keys(m.states).filter(id => (meta.get(id) || {}).platform !== 'atmofrance').map(id => [id, m.states[id]]));
  assert.ok(seuls['sensor.qualite_air_exterieur']);
  assert.equal(airDuDehors(seuls, (id) => meta.get(id) || null), null);
  // L'UV des heures : la tuile dit son maximum quand il fait jour.
  const midi = new Date(); midi.setHours(9, 0, 0, 0);
  const prev = previsionsDemo('hourly', midi.getTime());
  assert.ok(prev.every(p => typeof p.uv_index === 'number'), 'chaque heure a son UV');
  assert.ok(uvDuJour(prev, midi.getTime()).max >= 3, 'le matin, la journée a son pic');
});

test('les mots nouveaux sont dans les sept langues', async () => {
  const { CHARGEURS } = await import('../src/langues/index.js');
  const cles = ['Dégradé · air', 'Très mauvais · air', 'Extrêmement mauvais · air', 'Modéré · air', 'Mauvais pour les sensibles · air', 'Dangereux · air', 'Excellent · air',
    'Médiocre · air', 'Très faible', 'Extrêmement élevé', 'Pollens', 'Ambroisie', 'Armoise', 'Aulne', 'Bouleau', 'Graminées', 'Olivier', 'Arbres', 'Moisissures',
    'Demain : {mot}', 'protection de {a} à {b}', 'protection jusqu’à {b}'];
  for (const code of Object.keys(CHARGEURS)) {
    const cat = (await CHARGEURS[code]()).default;
    assert.deepEqual(cles.filter(k => !(k in cat)), [], code);
  }
});
