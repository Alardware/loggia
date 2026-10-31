/* Chantier G1 (30/10), défauts D5 et D6 de la comparaison avec Gladys (audit/gladys-integrations-3010.md ; ADR 0300).
 *
 * D5 — la zone se jugeait sur la valeur BRUTE, le chiffre s'écrivait ARRONDI : 39,6 % s'affichait « 40 % · Bon » quand 40 est
 *      « Idéal » sur la jauge. La zone se juge sur le chiffre tel qu'il s'écrit, partout où le chiffre et son mot vont ensemble :
 *      la carte d'une mesure (et sa compacte, sa fiche, Objets), la fiche de confort d'une pièce et sa barre, l'Accueil (CO₂).
 * D6 — le monoxyde se lisait en ppm quelle que soit son unité. La famille `co` n'accepte que des ppm, ou convertit : mg/m³
 *      × 0,873 (24,45 / 28,01 à 25 °C), µg/m³ × 0,000873, ppb ÷ 1000. Le commentaire de `PALIERS.co` attribuait 9 et 35 ppm à
 *      l'OMS : ce sont les normes de l'EPA.
 * Le serveur suit la même règle (tests/python/test_g1_co_unites.py). */
process.env.TZ = 'Europe/Paris';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';

import { area, device, entity, state, states, ctxOf } from './fixtures.mjs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);
register('data:text/javascript,' + encodeURIComponent([
  'export async function load(url, ctx, next) {',
  "  if (!url.endsWith('/src/App.jsx?g1')) return next(url, ctx);",
  "  const r = await next(url.slice(0, -'?g1'.length), ctx);",
  "  return { ...r, source: String(r.source) + ';export { vueMesure };' };",
  '}',
].join('\n')));
const { setLoggiaState } = await import('../src/state.js');
const F = await import(new URL('../src/App.jsx?g1', import.meta.url).href);
const C = await import('../src/confort.js');
const U = await import('../src/unites.js');
const G = await import('../src/groupes.js');
const lire = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const mesure = (id, dev, classe) => ({ ...entity(id, { device: dev }), device_class: classe });
const m = (id, v, nom, classe, unite) => state(id, v, { friendly_name: nom, device_class: classe, ...(unite ? { unit_of_measurement: unite } : {}), state_class: 'measurement' });
/* Une maison d'une pièce, « Salon », et ses capteurs : chacun sur un appareil physique du salon. */
function salon(capteurs) {
  return {
    areas: [area('salon', 'Salon')],
    devices: capteurs.map(([id]) => device('d_' + id, 'Appareil ' + id, 'salon', { manufacturer: 'X', model: 'Y' })),
    entities: capteurs.map(([id, , , classe]) => mesure(id, 'd_' + id, classe)),
    floors: [], energyPrefs: null,
    states: states(...capteurs.map(([id, v, nom, classe, unite]) => m(id, v, nom, classe, unite))),
  };
}
function vue(capteurs, id) {
  const fx = salon(capteurs);
  setLoggiaState({ index: ctxOf(fx, {}).index, ent: {}, cfg: { loggia_rooms: [{ room: 'Salon' }] }, resolved: null });
  try { return F.vueMesure({ states: fx.states }, id); } finally { setLoggiaState({ index: null, ent: {}, cfg: {}, resolved: null }); }
}

/* ── D5 ────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */

test('D5 : l’arrondi est celui de l’écriture — une décimale pour une température, aucune ailleurs', () => {
  assert.equal(C.arrondiMesure('hum', 39.6), 40);
  assert.equal(C.arrondiMesure('hum', 39.4), 39);
  assert.equal(C.arrondiMesure('co2', 1149.5), 1150, 'la moitié monte, comme le chiffre écrit');
  assert.equal(C.arrondiMesure('temp', 22.96), 23);
  assert.equal(C.arrondiMesure('temp', 22.94), 22.9);
  assert.equal(C.arrondiMesure('temp', -2.35), -2.4, 'sous zéro, la moitié s’éloigne de zéro comme `toLocaleString`');
  assert.equal(C.arrondiMesure('hum', 'unavailable'), null);
  assert.equal(C.chiffreMesure('temp', 22.96), '23,0');
});

test('D5 : 39,6 % d’humidité s’écrit « 40 » ET se dit « Idéal », comme sur la jauge', () => {
  const v = vue([['sensor.salon_humidite', 39.6, 'Salon humidité', 'humidity', '%']], 'sensor.salon_humidite');
  assert.equal(v.chiffre, '40');
  assert.equal(v.zone.t, 'Idéal', 'la zone du chiffre écrit, plus celle de la valeur brute (« Bon »)');
  assert.ok(v.phrase.indexOf('Idéal') === 0, v.phrase);
  assert.equal(v.barre.i, v.zone.i, 'la barre pleine est celle du mot');
});

test('D5 : en Fahrenheit, l’arrondi se fait dans l’unité du capteur, puis la valeur passe en Celsius', () => {
  // 73,44 °F = 23,02 °C (« Bon », au-delà de 23) ; il s'écrit « 73,4 °F » = 23,0 °C, « Idéal ».
  const v = vue([['sensor.salon_temperature', 73.44, 'Salon température', 'temperature', '°F']], 'sensor.salon_temperature');
  assert.equal(v.chiffre, '73,4');
  assert.equal(v.zone.t, 'Idéal');
});

test('D5 : la fiche de confort et sa barre — l’indice juge chaque mesure sur le chiffre qu’il écrit', () => {
  const h = C.indiceConfort({ hum: 39.6 });
  assert.deepEqual([h.mesures[0].valeur, h.mesures[0].verdict.t], ['40 %', 'Idéal']);
  const t = C.indiceConfort({ temp: U.versCelsius(73.44, 'F') }, 'F');
  assert.deepEqual([t.mesures[0].valeur, t.mesures[0].verdict.t], ['73,4 °F', 'Idéal']);
  const c = C.indiceConfort({ co2: 1149.6 });
  assert.deepEqual([c.mesures[0].valeur.replace(/\s/g, ' '), c.mesures[0].verdict.t], ['1 150 ppm', 'Moyen']);
  // La fiche de confort d'une pièce arrondit ses valeurs avant de les juger, de les écrire et de les noter.
  const fiche = lire('src/ficheconfort.jsx');
  assert.ok(fiche.includes("temp: valeurEcrite('temp', mesures.temp, uniteT),"), 'la température de la fiche, arrondie en °F puis en Celsius');
  assert.ok(fiche.includes("hum: arrondiMesure('hum', mesures.hum),") && fiche.includes("co2: arrondiMesure('co2', mesures.co2),"), 'l’humidité et le CO₂ de la fiche');
  assert.ok(fiche.includes("arrondiMesure('bruit', parseNum(hass.states[bruitId].state))"), 'le bruit de la fiche');
});

test('D5 : l’Accueil — le CO₂ d’une pièce et de la bannière se juge sur le chiffre écrit', () => {
  const galerie = lire('src/cartescustom/galerie.jsx');
  assert.ok(galerie.includes("const zoneCo2 = (co2) => (co2 == null ? null : zoneMesure('co2', arrondiMesure('co2', co2)));"));
});

/* ── D6 ────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */

test('D6 : les unités du monoxyde — ppm, ou ce qui se convertit, écrit à la main ou non', () => {
  assert.deepEqual(['ppm', 'PPM', ' ppm ', 'ppb', 'mg/m³', 'mg/m3', 'µg/m³', 'μg/m³', 'ug/m3', 'µg/m3'].map(U.uniteCo),
    ['ppm', 'ppm', 'ppm', 'ppb', 'mg/m³', 'mg/m³', 'µg/m³', 'µg/m³', 'µg/m³', 'µg/m³']);
  assert.deepEqual([null, '', '%', 'mg/L', 'ppt'].map(U.uniteCo), [null, null, null, null, null], 'une unité inconnue ne se devine pas');
  const proche = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, a + ' ≠ ' + b);
  proche(U.versPpmCo(10, 'mg/m³'), 10 * 24.45 / 28.01);
  proche(U.versPpmCo(10000, 'µg/m³'), 10 * 24.45 / 28.01);
  proche(U.versPpmCo(9000, 'ppb'), 9);
  proche(U.versPpmCo(12, 'ppm'), 12);
  proche(U.dePpmCo(U.versPpmCo(42, 'mg/m³'), 'mg/m³'), 42);
  assert.equal(U.versPpmCo(12, '%'), null, 'une unité inconnue ne se convertit pas');
});

test('D6 : la famille `co` n’accepte que des ppm, ou ce qui se convertit', async () => {
  assert.equal(C.cleMesure('carbon_monoxide', 'ppm'), 'co');
  assert.equal(C.cleMesure('carbon_monoxide', 'µg/m³'), 'co');
  assert.equal(C.cleMesure('carbon_monoxide', 'mg/m³'), 'co');
  assert.equal(C.cleMesure('carbon_monoxide', 'ppb'), 'co');
  assert.equal(C.cleMesure('carbon_monoxide', '%'), null, 'un pourcentage n’est pas des ppm');
  assert.equal(C.cleMesure('carbon_monoxide', null), null, 'sans unité, rien ne dit des ppm');
  assert.equal(C.nomClasse('carbon_monoxide', '%'), 'CO', 'hors de la table, il garde son nom');
  // Et sa section d'Objets › Capteurs : Air, neutre — pas Confort.
  const CS = await import('../src/capteurssections.jsx');
  const S = { 'sensor.x': { state: '200', attributes: { device_class: 'carbon_monoxide', unit_of_measurement: '%' } } };
  assert.equal(CS.sectionDe({ domaine: 'sensor', id: 'sensor.x' }, S, () => false), 'air');
});

test('D6 : un monoxyde en µg/m³ (Airly) se juge en ppm et s’écrit dans son unité', () => {
  const air = vue([['sensor.salon_co', 300, 'Salon CO', 'carbon_monoxide', 'µg/m³']], 'sensor.salon_co');
  assert.deepEqual([air.chiffre, air.unite, air.zone.t], ['300', 'µg/m³', 'Bon'], '300 µg/m³ = 0,26 ppm');
  const danger = vue([['sensor.salon_co', 45000, 'Salon CO', 'carbon_monoxide', 'µg/m³']], 'sensor.salon_co');
  assert.equal(danger.zone.t, 'Danger', '45 000 µg/m³ = 39 ppm');
  const mg = vue([['sensor.salon_co', 0.32, 'Salon CO', 'carbon_monoxide', 'mg/m³']], 'sensor.salon_co');
  assert.deepEqual([mg.chiffre, mg.zone.t], ['0,4', 'Bon'], 'une décimale en mg/m³, arrondie vers le haut');
  // Les repères de la barre, dans l'unité du capteur : 9 et 35 ppm, 10 et 40 mg/m³.
  assert.deepEqual(C.echelleMesure('co', 'mg/m³').reperes.map(r => r.t), [10, 40]);
  // Une unité inconnue : une mesure sans table — ni zone, ni barre, ni « Danger » à 200 %.
  const inconnu = vue([['sensor.salon_co', 200, 'Salon CO', 'carbon_monoxide', '%']], 'sensor.salon_co');
  assert.deepEqual([inconnu.cle, inconnu.zone, inconnu.barre], [null, null, null]);
});

test('D6 + D5 : le danger du monoxyde ne s’arrondit jamais à la baisse — l’écran dit ce que dit le téléphone', () => {
  // La veille du serveur prévient AU-DELÀ de 35 ppm et écrit le chiffre arrondi VERS LE HAUT (veilles.py, `math.ceil`).
  const v = (x) => vue([['sensor.salon_co', x, 'Salon CO', 'carbon_monoxide', 'ppm']], 'sensor.salon_co');
  assert.deepEqual([v(35.4).chiffre, v(35.4).zone.t], ['36', 'Danger']);
  assert.deepEqual([v(35).chiffre, v(35).zone.t], ['35', 'Moyen']);
  assert.deepEqual([v(8.2).chiffre, v(8.2).zone.t], ['9', 'Moyen'], 'le chiffre écrit est celui qu’on juge');
  assert.deepEqual([C.coDanger('35,4'), C.coDanger('35'), C.coDanger('45000', 'µg/m³'), C.coDanger('30000', 'µg/m³'), C.coDanger('200', '%')],
    [true, false, true, false, false]);
});

test('relecture R3 : en mg/m³, la carte juge le ppm arrondi vers le haut — elle dit ce que disent la carte Sécurité et le serveur', () => {
  /* 40,01 à 40,09 mg/m³ valent 34,92 à 34,99 ppm : ni `coDanger`, ni le serveur (au-delà de 35 ppm) ne disent « Danger ». La carte
   * jugeait le chiffre ÉCRIT dans l'unité du capteur (40,1 mg/m³ = 35,003 ppm) : elle disait « Danger ». Elle juge désormais
   * `Math.ceil` du ppm, et garde son chiffre dans l'unité du capteur. */
  for (const brut of [40.01, 40.05, 40.09]) {
    const v = vue([['sensor.salon_co', brut, 'Salon CO', 'carbon_monoxide', 'mg/m³']], 'sensor.salon_co');
    assert.deepEqual([v.chiffre, v.unite, v.zone.t], ['40,1', 'mg/m³', 'Moyen'], brut + ' mg/m³');
    assert.equal(C.coDanger(brut, 'mg/m³'), false);
  }
  // Au-delà de 35 ppm, les trois disent « Danger » : 40,11 mg/m³ = 35,01 ppm.
  assert.equal(vue([['sensor.salon_co', 40.11, 'Salon CO', 'carbon_monoxide', 'mg/m³']], 'sensor.salon_co').zone.t, 'Danger');
  assert.equal(C.coDanger(40.11, 'mg/m³'), true);
  // Le juge, pour chaque unité : `ceil(ppm)` — 35 000 ppb valent 35 ppm, « Moyen » ; 35 001 ppb, « Danger ».
  assert.deepEqual([C.valeurEcrite('co', 35000, 'ppb'), C.valeurEcrite('co', 35001, 'ppb'), C.valeurEcrite('co', 35.4, 'ppm'), C.valeurEcrite('co', 300, 'µg/m³')], [35, 36, 36, 1]);
  for (const [n, u] of [[40.09, 'mg/m³'], [40.11, 'mg/m³'], [35000, 'ppb'], [35001, 'ppb'], [40000, 'µg/m³'], [40100, 'µg/m³'], [35, 'ppm'], [35.2, 'ppm']]) {
    assert.equal(C.zoneMesure('co', C.valeurEcrite('co', n, u)).i === 2, C.coDanger(n, u), n + ' ' + u + ' : la carte et la Sécurité');
    assert.equal(C.coDanger(n, u), U.versPpmCo(n, u) > 35, n + ' ' + u + ' : la Sécurité et le serveur (au-delà de 35 ppm)');
  }
});

test('D6 : la carte Sécurité de Maison — un monoxyde d’une unité inconnue n’y entre pas, un µg/m³ y sonne en ppm', () => {
  const S = {
    'sensor.co_ug': { state: '45000', attributes: { device_class: 'carbon_monoxide', unit_of_measurement: 'µg/m³' } },
    'sensor.co_calme': { state: '30000', attributes: { device_class: 'carbon_monoxide', unit_of_measurement: 'µg/m³' } },
    'sensor.co_pct': { state: '200', attributes: { device_class: 'carbon_monoxide', unit_of_measurement: '%' } },
  };
  const ctx = { meta: () => ({ deviceId: 'd' }), physique: () => true, piece: () => '', appareil: () => '' };
  assert.deepEqual(G.membresGroupes(S, ctx).securite, ['sensor.co_calme', 'sensor.co_ug']);
  assert.deepEqual([G.sonne(S, 'sensor.co_ug'), G.sonne(S, 'sensor.co_calme')], [true, false]);
  // La popup Sécurité écrit le chiffre dans l'unité du capteur, plus « ppm » collé à des µg/m³.
  const fg = lire('src/fichegroupe.jsx');
  assert.ok(fg.includes("chiffre ? chiffreMesure('co', st.state, unite) + '\\u00a0' + unite"), 'le chiffre et son unité');
});

test('D6 : les normes de 9 et 35 ppm sont celles de l’EPA ; l’OMS dit 10 mg/m³ sur 8 h et 35 mg/m³ sur 1 h', () => {
  const src = lire('src/confort.js');
  const bloc = src.slice(src.indexOf('Le monoxyde de carbone en ppm'), src.indexOf("co: () => [[9,"));
  assert.ok(bloc.includes('EPA') && bloc.includes('10 mg/m³') && bloc.includes('35 mg/m³'), bloc);
  assert.ok(!/OMS sur huit heures|valeur guide de l'OMS/.test(bloc), 'l’OMS ne dit pas 9 ppm');
  // Les seuils ne changent pas.
  assert.deepEqual(C.zonesMesure('co').map(z => [z.a, z.inclus]), [[9, false], [35, true], [Infinity, false]]);
});
