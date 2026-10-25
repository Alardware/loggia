/* La fiche d'une mesure (chantier Capteurs, § 4, § 6 et § 7 ; C5, C9, C12).
 *
 * Ce qui est garanti ici :
 *  - le conseil d'une zone hors du bon ; rien pour une zone bonne, ni pour une
 *    famille qui n'en a pas ;
 *  - « depuis » : l'heure où la courbe a franchi la borne de sa zone, au-dessus
 *    comme au-dessous du bon, le seuil dans l'unité du capteur ; rien quand la
 *    courbe ne le dit pas ;
 *  - la courbe : 24 heures en 400 × 120, les bandes des zones hors du bon, les
 *    repères de la table, la luminosité sur son échelle logarithmique ;
 *  - sous la barre, le nom de la zone où l'on est, toujours, et des autres
 *    quand ils tiennent ;
 *  - la fiche JOUÉE (tests/crochets.mjs ; sous `?fiche_mesure`, App.jsx exporte
 *    la vue d'une mesure et les briques de la fiche) : une seule lecture des
 *    statistiques sur 5 minutes, l'histoire quand il n'y en a pas ; le chiffre,
 *    la barre, la phrase, le conseil et « depuis » ; le dernier signal, la pile,
 *    L'appareil ; un capteur sans table garde son chiffre, sans barre ni
 *    conseil ; une mesure muette le dit ;
 *  - dehors (C15, révisé le 16/10) : la température et l'humidité ont leurs
 *    zones du dehors — la barre, la courbe et ses bandes —, sans teinte, ni
 *    conseil, ni « depuis » ; une famille que la table n'y juge pas garde son
 *    chiffre et sa courbe, sans barre ni bandes ;
 *  - correction bis : les moyennes demandées dans l'unité affichée (`units`,
 *    point 5) ; un point daté au début de sa tranche (point 12) ; la zone de
 *    chaque point lue sans rebâtir la table (point 13) ; une lecture qui échoue
 *    laisse la fiche lisible (point 14) ;
 *  - correction bis 2 : l'en-tête tait la famille que le nom dit déjà (point 1) ;
 *  - C17 (passe 1 quater) : sans zone, la fiche est neutre — le chiffre, la courbe
 *    et le dernier signal, ni barre, ni bandes, ni conseil, ni « depuis ». */
process.env.TZ = 'Europe/Paris';
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
register('./jsx-hooks.mjs', import.meta.url);
register('data:text/javascript,' + encodeURIComponent([
  'export async function load(url, ctx, next) {',
  "  if (!url.endsWith('/src/App.jsx?fiche_mesure')) return next(url, ctx);",
  "  const r = await next(url.slice(0, -'?fiche_mesure'.length), ctx);",
  "  return { ...r, source: String(r.source) + ';export { useVueMesure, BRIQUES_CAPTEUR };' };",
  '}',
].join('\n')));
const { setLoggiaState } = await import('../src/state.js');
const F = await import(new URL('../src/App.jsx?fiche_mesure', import.meta.url).href);
const FC = await import(new URL('../src/fichecapteur.jsx', import.meta.url).href);
const M = await import('../src/mesuresfiche.js');
const { zoneMesure, barreMesure } = await import('../src/confort.js');

const NBSP = String.fromCharCode(160);
const JOUR = 24 * 3600000;
const mille = (n) => n.toLocaleString('fr-FR');
const A = (h, m = 0) => new Date(2026, 9, 15, h, m).getTime();
const serie = (l) => l.map(([h, m, v]) => ({ t: A(h, m), v }));

test('§ 6, C9 : le conseil d’une zone hors du bon ; rien pour une zone bonne, ni pour la température, le bruit, le vent et la lumière', () => {
  const c = (cle, v) => M.conseilMesure(cle, zoneMesure(cle, v));
  assert.equal(c('co2', 1200), 'Pensez à aérer avant la nuit.');
  assert.equal(c('co2', 1500), 'Ouvrez la fenêtre 10 minutes.');
  assert.equal(c('co2', 1700), 'Ouvrez la fenêtre 10 minutes.');
  assert.equal(c('hum', 75), 'Aérez : l’air est trop humide.');
  assert.equal(c('hum', 25), 'L’air est sec.');
  assert.equal(c('pm25', 30), 'Aérez 5 minutes.');
  assert.equal(c('cov', 200), 'Aérez 5 minutes.');
  assert.deepEqual([c('co2', 600), c('hum', 45), c('temp', 30), c('bruit', 85), c('vent', 60), c('lux', 5)], [null, null, null, null, null, null]);
});

test('C9 : « depuis » — l’heure où la courbe a franchi la borne de sa zone, au-dessus comme au-dessous du bon', () => {
  const co2 = serie([[18, 0, 800], [20, 0, 1300], [21, 30, 1620], [22, 0, 1700], [23, 0, 1659]]);
  const d = M.depuisMesure(co2, 'co2', zoneMesure('co2', 1659));
  assert.deepEqual(d, { t: A(21, 30), borne: 1600, dessous: false });
  assert.equal(M.texteDepuis(d, 'co2', 'ppm', 'ppm'), 'Au-dessus de ' + mille(1600) + NBSP + 'ppm depuis 21:30.');
  // Au-dessous : une chambre fraîche (« Frais », de 16 à 17 °C) depuis 06:10 ; le seuil dans l'unité du capteur.
  const frais = serie([[0, 0, 19], [5, 0, 18.2], [6, 10, 16.8], [7, 0, 16.4]]);
  const f = M.depuisMesure(frais, 'temp', zoneMesure('temp', 16.4));
  assert.deepEqual(f, { t: A(6, 10), borne: 17, dessous: true });
  assert.equal(M.texteDepuis(f, 'temp', 'F', '°F'), 'Au-dessous de 63' + NBSP + '°F depuis 06:10.');
  // Rien quand la courbe ne le dit pas : toute la journée dans la zone, ou sa dernière tranche pas encore dedans.
  assert.equal(M.depuisMesure(serie([[0, 0, 1700], [12, 0, 1650]]), 'co2', zoneMesure('co2', 1659)), null);
  assert.equal(M.depuisMesure(serie([[0, 0, 800], [12, 0, 1500]]), 'co2', zoneMesure('co2', 1659)), null);
  assert.equal(M.depuisMesure(co2, 'co2', zoneMesure('co2', 1000)), null, 'une zone bonne n’a pas de « depuis »');
  assert.equal(M.texteDepuis(null, 'co2', 'ppm', 'ppm'), null);
});

test('§ 4 : la courbe — 24 heures en 400 × 120, les bandes hors du bon, les repères de la table', () => {
  const maintenant = A(20, 40);
  const pts = [[24, 1000], [18, 420], [12, 900], [6, 2018], [0, 1659]].map(([h, v]) => ({ t: maintenant - h * 3600000, v }));
  const c = M.courbeMesure(pts, { cle: 'co2', unite: 'ppm', maintenant });
  assert.ok(c.ligne.startsWith('M0 ') && c.ligne.includes('L400 '), 'de « il y a 24 h » à « maintenant »');
  assert.ok(c.aire.startsWith(c.ligne) && c.aire.endsWith('L400 120L0 120Z'), 'l’aire descend au pied du cadre');
  // Les zones hors du bon que l'axe traverse, de bas en haut — ni « Excellent » ni « Bon » (C5).
  assert.deepEqual(c.bandes.map(b => b.rgb), ['var(--o-warn-rgb)', 'var(--o-warn2-rgb)', 'var(--o-bad-rgb)']);
  assert.ok(c.bandes.every(b => b.y >= 0 && b.h > 0 && b.y + b.h <= 120));
  assert.deepEqual(c.reperes.map(r => r.t), ['900', mille(1150), mille(1400), mille(1600)]);
  assert.ok(c.reperes.every((r, k) => k === 0 || c.reperes[k - 1].y - r.y >= 12), 'les repères montent avec leur valeur, à 12 px au moins l’un de l’autre');
  // Une journée plus large serre les repères : celui qui serre le précédent se tait.
  const large = M.courbeMesure([{ t: maintenant - JOUR, v: 400 }, { t: maintenant, v: 2400 }], { cle: 'co2', unite: 'ppm', maintenant });
  assert.deepEqual(large.reperes.map(r => r.t), ['900', mille(1150), mille(1400)]);
  // La lumière, sur son échelle logarithmique : 50 lx au milieu de 5 et de 500 ; aucune bande, aucune lumière n'est une alerte.
  const lux = M.courbeMesure([{ t: maintenant - JOUR, v: 5 }, { t: maintenant, v: 500 }], { cle: 'lux', unite: 'lx', maintenant });
  assert.deepEqual(lux.bandes, []);
  const y50 = lux.reperes.find(r => r.t === '50').y;
  assert.ok(Math.abs(y50 - 63) < 0.5, 'au milieu de l’axe : ' + y50);
  // Dehors, une famille que la table ne juge pas (C15) : la même ligne, sans bande ni repère.
  const dehors = M.courbeMesure(pts, { cle: 'co2', unite: 'ppm', maintenant, zones: false });
  assert.deepEqual([dehors.bandes, dehors.reperes, dehors.ligne], [[], [], c.ligne]);
  // Sans table, ni bande ni repère ; sous deux points, pas de courbe.
  const brute = M.courbeMesure(pts, { maintenant });
  assert.deepEqual([brute.bandes, brute.reperes], [[], []]);
  assert.equal(M.courbeMesure(pts.slice(0, 1), { cle: 'co2', maintenant }), null);
});

test('§ 4 : sous la barre, le nom de la zone où l’on est, toujours ; les autres s’ils tiennent sous leur bande', () => {
  const co2 = M.motsBarre(barreMesure('co2', 1659));
  assert.deepEqual(co2.map(m => [m.t, m.on]), [['Bon', false], ['Moyen', false], ['Confiné', true]]);
  assert.ok(co2.every(m => m.pos > 0 && m.pos < 100));
  const temp = M.motsBarre(barreMesure('temp', 21.4));
  assert.deepEqual(temp.map(m => [m.t, m.on]), [['Idéal', true], ['Bon', false]]);
  // La zone où l'on est se lit même quand sa bande est étroite : « Trop froid », au bord gauche.
  const froid = M.motsBarre(barreMesure('temp', 12));
  assert.equal(froid.find(m => m.on).t, 'Trop froid');
});

test('§ 7 : les statistiques lues, et le dernier signal de l’appareil', () => {
  /* ASSERTION MODIFIÉE (correction bis, point 12) : un point se date au DÉBUT de sa tranche (`start`) — la moyenne de 21:25 à 21:30 dit la mesure depuis
   * 21:25, et « depuis » le redit ; sans `start`, sa fin. */
  assert.deepEqual(M.lireStats({ 'sensor.x': [{ start: 0, end: 300000, mean: 12 }, { start: 300000, end: 600000, mean: null }, { start: '1970-01-01T00:10:00Z', end: '1970-01-01T00:15:00Z', mean: 14 }, { end: 1200000, mean: 15 }] }, 'sensor.x'),
    [{ t: 0, v: 12 }, { t: 600000, v: 14 }, { t: 1200000, v: 15 }]);
  assert.deepEqual([M.lireStats({}, 'sensor.x'), M.lireStats(null, 'sensor.x')], [[], []]);
  const S = { 'sensor.a': { last_updated: '2026-10-15T20:39:00+02:00' }, 'sensor.b': { last_updated: '2026-10-15T20:41:00+02:00' } };
  assert.equal(M.dernierSignal(S, ['sensor.a', 'sensor.b', 'sensor.absente']), Date.parse('2026-10-15T20:41:00+02:00'));
  assert.equal(M.dernierSignal(S, ['sensor.absente']), null);
});

/* ── La fiche, jouée ─────────────────────────────────────────────────────── */

const MAINTENANT = Date.parse('2026-10-15T23:00:00+02:00');
const capteur = (id, state, attributes, maj = '2026-10-15T20:39:00+02:00') => ({ entity_id: id, state: String(state), last_changed: '2026-10-15T20:00:00+02:00', last_updated: maj, attributes });
function maison() {
  return {
    'sensor.chambre_co2': capteur('sensor.chambre_co2', 1659, { friendly_name: 'CO₂ Chambre', device_class: 'carbon_dioxide', unit_of_measurement: 'ppm', state_class: 'measurement' }),
    'sensor.chambre_bruit': capteur('sensor.chambre_bruit', 34, { friendly_name: 'Chambre bruit', device_class: 'sound_pressure', unit_of_measurement: 'dB' }, '2026-10-15T20:41:00+02:00'),
    'sensor.chambre_pile': capteur('sensor.chambre_pile', 81, { friendly_name: 'Chambre pile', device_class: 'battery', unit_of_measurement: '%' }),
    'sensor.pression': capteur('sensor.pression', 1013.4, { friendly_name: 'Pression', device_class: 'atmospheric_pressure', unit_of_measurement: 'hPa' }),
    'sensor.morte': capteur('sensor.morte', 'unavailable', { friendly_name: 'CO₂ mort', device_class: 'carbon_dioxide', unit_of_measurement: 'ppm' }),
    // La station du jardin (C15) : 5 °C, que la table ne juge pas dehors.
    'sensor.jardin_temperature': capteur('sensor.jardin_temperature', 5, { friendly_name: 'Jardin température', device_class: 'temperature', unit_of_measurement: '°C', state_class: 'measurement' }),
    // Son frigo (C17, passe 1 quater) : un appareil, sans zone — neutre.
    'sensor.frigo_temperature': capteur('sensor.frigo_temperature', 4.2, { friendly_name: 'Capteur Frigo', device_class: 'temperature', unit_of_measurement: '°C', state_class: 'measurement' }),
  };
}
/* Le capteur de la chambre porte le CO₂, le bruit et une pile : le dernier signal est le plus récent des trois. Le jardin est dehors.
 * FIXTURE MODIFIÉE (passe 1 quater, 16/10 ; C17) : une mesure n'est jugée que dans une pièce de Loggia — la chambre et le jardin en sont deux. */
const INDEX = { entityMeta: new Map([...['sensor.chambre_co2', 'sensor.chambre_bruit', 'sensor.chambre_pile'].map(id => [id, { deviceId: 'netatmo_chambre' }]),
  ['sensor.frigo_temperature', { deviceId: 'frigo' }]]), deviceMeta: new Map(), areaList: [],
  areaNameOf: (id) => (id === 'sensor.jardin_temperature' ? 'Jardin' : String(id).indexOf('sensor.chambre_') === 0 ? 'Chambre' : null) };
// La journée du CO₂, en tranches de 5 minutes : 1 300 ppm, puis 1 700 depuis 21:30 — la tranche qui COMMENCE à 21:30 (correction bis, point 12).
const STATS = Array.from({ length: 288 }, (_, k) => {
  const end = MAINTENANT - (287 - k) * 300000;
  return { start: end - 300000, end, mean: end - 300000 < Date.parse('2026-10-15T21:30:00+02:00') ? 1300 : 1700 };
});
const tic = () => new Promise((r) => setImmediate(r));
async function dans(fn) {
  const h = horlogeFausse(), d = documentFaux();
  const vrai = Date.now;
  h.installer(); d.installer();
  Date.now = () => MAINTENANT;
  setLoggiaState({ index: INDEX, ent: {}, cfg: { loggia_rooms: [{ room: 'Chambre' }, { room: 'Jardin' }] }, resolved: null });
  try { return await fn(); } finally { Date.now = vrai; h.restaurer(); d.restaurer(); setLoggiaState({ index: null, ent: {}, cfg: {}, resolved: null }); }
}
const hassDe = (extra = {}) => ({ states: maison(), config: { unit_system: { temperature: '°C' } }, ...extra });
const fiche = (id, hass, props = {}) => monter((p) => FC.default({ ...p, vue: F.useVueMesure(p.hass, p.id), briques: F.BRIQUES_CAPTEUR, piece: 'Chambre', maintenant: MAINTENANT }), { id, hass, onFiche: () => {}, ...props });
const de = (m, nom) => m.trouver(e => e.type && e.type.name === nom)[0];

test('§ 4 : la fiche — une lecture des statistiques ; le chiffre, la barre, la phrase, le conseil et « depuis »', () => dans(async () => {
  const appels = [];
  const m = fiche('sensor.chambre_co2', hassDe({ callWS: (msg) => { appels.push(msg); return Promise.resolve({ 'sensor.chambre_co2': STATS }); } }));
  await tic();
  m.effets();
  assert.deepEqual(appels.map(a => [a.type, a.statistic_ids, a.period, a.types]), [['recorder/statistics_during_period', ['sensor.chambre_co2'], '5minute', ['mean']]], 'une seule lecture, à l’ouverture');
  const e = de(m, 'EnteteFiche').props;
  // ASSERTION MODIFIÉE (correction bis 2, point 1) : « CO₂ Chambre » dit sa famille — « Chambre · CO₂ » la redisait ; la fiche ne garde que sa pièce.
  assert.deepEqual([e.nom, e.sousNom, e.plaque.fond, e.plaque.encre], ['CO₂ Chambre', 'Chambre', 'rgba(var(--o-bad-rgb),.16)', 'var(--o-bad)']);
  // Témoin : un nom qui ne la dit pas — la fiche l'écrit après sa pièce.
  const autre = hassDe();
  autre.states['sensor.chambre_co2'] = { ...autre.states['sensor.chambre_co2'], attributes: { ...autre.states['sensor.chambre_co2'].attributes, friendly_name: 'Netatmo' } };
  assert.equal(de(fiche('sensor.chambre_co2', autre), 'EnteteFiche').props.sousNom, 'Chambre · CO₂');
  const texte = m.texte();
  assert.ok(texte.includes(mille(1659) + 'ppm'), 'le chiffre et son unité');
  assert.ok(texte.includes('Confiné · aérez'), 'la phrase de la carte');
  assert.ok(texte.includes('Ouvrez la fenêtre 10 minutes. Au-dessus de ' + mille(1600) + NBSP + 'ppm depuis 21:30.'), 'le conseil, et depuis quand');
  assert.ok(texte.includes('min ' + mille(1300) + ' · max ' + mille(1700)), 'le plus bas et le plus haut de la journée');
  assert.equal(de(m, 'BarreFiche').props.barre.i, 4, 'la barre de la carte, sur la zone « Confiné »');
  const c = de(m, 'CourbeFiche').props;
  assert.equal(c.points.length, 288, 'les tranches de 5 minutes');
  assert.deepEqual(c.courbe.bandes.map(b => b.rgb), ['var(--o-warn-rgb)', 'var(--o-warn2-rgb)', 'var(--o-bad-rgb)']);
  assert.equal(c.teinte.c, 'var(--o-bad)', 'la ligne dans la couleur de la zone');
  assert.ok(texte.includes('Dernier signalIl y a 2 h'), 'le relevé le plus récent de l’appareil : le bruit, à 20:41');
  assert.ok(texte.includes('Pile81' + NBSP + '%'), 'la pile de l’appareil');
}));

test('§ 7 : sans statistiques, la fiche lit l’histoire, comme avant', () => dans(async () => {
  const lus = [];
  const histoire = [[{ state: '1200', last_changed: '2026-10-14T23:00:00+02:00' }, { state: '1650', last_changed: '2026-10-15T22:10:00+02:00' }]];
  const m = fiche('sensor.chambre_co2', hassDe({ callWS: () => Promise.resolve({}), callApi: (methode, chemin) => { lus.push(chemin); return Promise.resolve(histoire); } }));
  await tic();
  m.effets();
  await tic();
  m.effets();
  assert.equal(lus.length, 1, 'une lecture de l’histoire');
  assert.ok(lus[0].startsWith('history/period/') && lus[0].includes('filter_entity_id=sensor.chambre_co2'));
  assert.deepEqual(de(m, 'CourbeFiche').props.points.map(p => p.v), [1200, 1650]);
  assert.ok(m.texte().includes('Au-dessus de ' + mille(1600) + NBSP + 'ppm depuis 22:10.'));
}));

test('un capteur sans table garde son chiffre et sa courbe, sans barre, ni phrase, ni conseil', () => dans(async () => {
  const m = fiche('sensor.pression', hassDe({ callWS: () => Promise.resolve({}) }));
  await tic();
  m.effets();
  const e = de(m, 'EnteteFiche').props;
  assert.deepEqual([e.sousNom, e.plaque.fond, e.plaque.encre], ['Chambre', 'var(--o-s1)', 'var(--o-text1)']);
  assert.ok(m.texte().includes(mille(1013.4) + 'hPa'), 'une décimale utile');
  assert.equal(de(m, 'BarreFiche'), undefined);
  assert.ok(!m.texte().includes('Aérez') && !m.texte().includes('depuis'));
}));

/* ASSERTIONS MODIFIÉES (passe 1 ter, 16/10 ; C15 révisé — « les capteur exterieur il manque les jauges »). Dehors a ses propres zones : la fiche
 * garde la barre et le nom des zones, la courbe et ses bandes — celles du dehors, le doux seul sans fond — et les repères de l'axe. Rien n'y est une
 * alerte : ni teinte, ni encre de couleur, ni conseil, ni « depuis ». */
test('C15 révisé : dehors, la barre et ses zones, la courbe et ses bandes ; ni teinte, ni conseil, ni « depuis »', () => dans(async () => {
  // Une journée qui serait « Trop froid » dans une pièce : 12 °C, puis 5 °C depuis midi — dehors, « Frais », puis « Froid ».
  const froid = Array.from({ length: 288 }, (_, k) => { const end = MAINTENANT - (287 - k) * 300000; return { start: end - 300000, end, mean: k < 144 ? 12 : 5 }; });
  const m = fiche('sensor.jardin_temperature', hassDe({ callWS: () => Promise.resolve({ 'sensor.jardin_temperature': froid }) }));
  await tic();
  m.effets();
  const e = de(m, 'EnteteFiche').props;
  assert.deepEqual([e.plaque.fond, e.plaque.encre], ['var(--o-s1)', 'var(--o-text1)'], 'ni teinte');
  const barre = de(m, 'BarreFiche');
  const b = barre.props.barre;
  assert.deepEqual([b.zones.map(z => z.t), b.i, barre.props.teinte], [['Gel', 'Froid', 'Frais', 'Doux', 'Chaud', 'Canicule'], 1, null], 'la barre du dehors, sans teinte');
  const ici = monter(barre.type, barre.props).trouver(x => x.props && x.props['data-mot'] != null && x.props.style.fontWeight === 800)[0];
  assert.deepEqual([ici.props.children, ici.props.style.color], ['Froid', 'var(--o-text)'], 'le nom de sa zone, en neutre');
  const c = de(m, 'CourbeFiche').props;
  assert.deepEqual([c.courbe.bandes.map(x => x.rgb), c.courbe.reperes.map(r => r.t), c.teinte], [['var(--o-cold-rgb)', 'var(--o-cold-rgb)'], ['10'], null],
    'les bandes du froid et du frais que l’axe traverse, le repère de 10 °C, la ligne au neutre');
  const t = m.texte();
  assert.ok(t.includes('5,0°C') && t.includes('min 5,0 · max 12,0'), 'le chiffre et la journée');
  assert.ok(t.includes('Froid') && !t.includes('Trop froid') && !t.includes('depuis') && !t.includes('Au-dessous'), 'le mot du dehors, sans « depuis »');
  // Le calcul : pas de conseil pour une zone du dehors ; la journée du dehors, sans « depuis ».
  assert.equal(M.conseilMesure('hum', zoneMesure('hum', 20, true)), null, 'l’air sec du dehors : rien à conseiller');
  // 16 °C, puis 5 °C depuis midi : « Frais » puis « Froid » dehors ; « Froid », puis « Trop froid » dans une pièce.
  const pts = froid.map(x => ({ t: x.start, v: x.mean === 12 ? 16 : 5 }));
  const j = M.journeeMesure(pts, { cle: 'temp', uniteTable: 'C', ecrite: '°C', dehors: true, zi: 1, maintenant: MAINTENANT });
  assert.deepEqual([j.depuis, j.courbe.bandes.length], [null, 2]);
  assert.equal(M.journeeMesure(pts, { cle: 'temp', uniteTable: 'C', ecrite: '°C', zi: 0, maintenant: MAINTENANT }).depuis, 'Au-dessous de 15' + NBSP + '°C depuis 11:00.',
    'témoin : dans une pièce, « Trop froid » se date');
}));

/* TEST AJOUTÉ (passe 1 quater, 16/10 ; C17) : hors d'une pièce de Loggia, une mesure est neutre. La fiche de son frigo, sans zone : le chiffre, la courbe
 * et le dernier signal ; ni barre, ni bandes, ni conseil, ni « depuis » — dans une pièce, une journée à 4 °C serait « Trop froid » depuis minuit. */
test('C17 : sans zone, la fiche est neutre — le chiffre, la courbe, le dernier signal ; ni barre, ni bandes, ni conseil, ni « depuis »', () => dans(async () => {
  const froid = Array.from({ length: 288 }, (_, k) => { const end = MAINTENANT - (287 - k) * 300000; return { start: end - 300000, end, mean: k < 144 ? 6 : 4 }; });
  const m = fiche('sensor.frigo_temperature', hassDe({ callWS: () => Promise.resolve({ 'sensor.frigo_temperature': froid }) }));
  await tic();
  m.effets();
  const e = de(m, 'EnteteFiche').props;
  assert.deepEqual([e.nom, e.plaque.fond, e.plaque.encre], ['Capteur Frigo', 'var(--o-s1)', 'var(--o-text1)'], 'son nom, ni teinte');
  assert.equal(de(m, 'BarreFiche'), undefined, 'ni barre');
  const c = de(m, 'CourbeFiche').props;
  assert.deepEqual([c.courbe.bandes, c.courbe.reperes, c.teinte], [[], [], null], 'la courbe, sans bandes ni repères');
  const t = m.texte();
  assert.ok(t.includes('4,2°C') && t.includes('min 4,0 · max 6,0') && t.includes('Dernier signal'), 'le chiffre, la journée, le dernier signal');
  assert.ok(!t.includes('Trop froid') && !t.includes('depuis') && !t.includes('Au-dessous'), 'ni zone, ni « depuis »');
}));

test('muette : « — » et « Indisponible » sur le panneau du liseré, ni unité, ni barre', () => dans(async () => {
  const m = fiche('sensor.morte', hassDe());
  await tic();
  m.effets();
  const panneau = m.trouver(e => e.props && e.props.className === 'o-panne')[0];
  assert.ok(panneau, 'le liseré qui respire');
  const t = m.texte();
  assert.ok(t.includes('—') && t.includes('Indisponible') && !t.includes('ppm'));
  assert.equal(de(m, 'BarreFiche'), undefined);
  assert.equal(de(m, 'EnteteFiche').props.plaque.encre, 'var(--o-text3)');
}));

test('L’appareil ouvre la fiche universelle ; la coquille passe la vue de la carte', () => dans(async () => {
  const ouvertes = [];
  const m = fiche('sensor.chambre_co2', hassDe(), { onFiche: (id) => ouvertes.push(id) });
  const bouton = m.trouver(e => e.type === 'button' && typeof e.props.onClick === 'function')[0];
  m.appuyer(bouton);
  assert.deepEqual(ouvertes, ['sensor.chambre_co2']);
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const i = app.indexOf('\nfunction FicheCapteur(');
  const coquille = app.slice(i, app.indexOf('\n}\n', i));
  assert.ok(coquille.includes('const vue = useVueMesure(hass, id);') && coquille.includes('<FicheCapteurContent id={id} vue={vue}') && coquille.includes('<FicheAppareil id={fiche}'));
}));

/* TEST AJOUTÉ (correction bis, points 5 et 14) : Home Assistant rend les moyennes dans l'unité où la statistique est NÉE — sans `units`, une température
 * relevée en °C et affichée en °F se relisait « 21 °F ». La fiche demande celle qu'elle écrit, comme prisesetat.js : `temperature` pour une température,
 * `speed` pour un vent ; rien pour une famille que Home Assistant ne convertit pas. */
test('correction bis, point 5 : les moyennes demandées dans l’unité que la carte écrit — `temperature`, `speed` ; rien pour le reste', () => dans(async () => {
  const appels = [];
  const S = {
    ...maison(),
    'sensor.bureau_f': capteur('sensor.bureau_f', 70.5, { friendly_name: 'Bureau', device_class: 'temperature', unit_of_measurement: '°F', state_class: 'measurement' }),
    'sensor.vent_ms': capteur('sensor.vent_ms', 4, { friendly_name: 'Vent', device_class: 'wind_speed', unit_of_measurement: 'm/s', state_class: 'measurement' }),
    'sensor.vent_bft': capteur('sensor.vent_bft', 4, { friendly_name: 'Vent', device_class: 'wind_speed', unit_of_measurement: 'Bft', state_class: 'measurement' }),
  };
  const hass = { states: S, config: { unit_system: { temperature: '°C' } }, callWS: (msg) => { appels.push(msg); return Promise.resolve({}); } };
  for (const id of ['sensor.bureau_f', 'sensor.jardin_temperature', 'sensor.vent_ms', 'sensor.vent_bft', 'sensor.chambre_co2']) { fiche(id, hass); await tic(); }
  assert.deepEqual(appels.map(a => [a.statistic_ids[0], a.units || null]), [
    ['sensor.bureau_f', { temperature: '°F' }], ['sensor.jardin_temperature', { temperature: '°C' }], ['sensor.vent_ms', { speed: 'm/s' }],
    ['sensor.vent_bft', null], ['sensor.chambre_co2', null]]);
}));

/* TEST AJOUTÉ (correction bis, point 14) : une lecture des statistiques qui ÉCHOUE — un `callWS` qui rejette, ou qui lève avant de répondre — laisse
 * la fiche lisible : le chiffre, la phrase et le conseil restent, et la courbe se lit dans l'histoire, comme sans statistiques. */
test('correction bis, point 14 : une lecture qui échoue laisse la fiche lisible — la courbe passe par l’histoire', () => dans(async () => {
  const histoire = [[{ state: '1200', last_changed: '2026-10-14T23:00:00+02:00' }, { state: '1650', last_changed: '2026-10-15T22:10:00+02:00' }]];
  // Deux capteurs neufs : l'histoire d'un capteur déjà lu se garde en cache (`useHistorique24`).
  for (const [id, callWS] of [['sensor.co2_rejet', () => Promise.reject(new Error('recorder indisponible'))], ['sensor.co2_leve', () => { throw new Error('connexion perdue'); }]]) {
    const lus = [];
    const S = { ...maison(), [id]: { ...maison()['sensor.chambre_co2'], entity_id: id } };
    const m = fiche(id, { states: S, config: { unit_system: { temperature: '°C' } }, callWS, callApi: (methode, chemin) => { lus.push(chemin); return Promise.resolve(histoire); } });
    await tic();
    m.effets();
    await tic();
    m.effets();
    const t = m.texte();
    assert.ok(t.includes(mille(1659) + 'ppm') && t.includes('Confiné · aérez') && t.includes('Ouvrez la fenêtre 10 minutes.'), 'le chiffre, la phrase et le conseil restent');
    assert.equal(lus.length, 1, 'l’histoire, à la place');
    assert.deepEqual(de(m, 'CourbeFiche').props.points.map(p => p.v), [1200, 1650]);
  }
}));

/* TEST AJOUTÉ (correction bis, points 10 et 13) : la journée se calcule UNE fois par lecture (`journeeMesure`, gardée dans un `useMemo`), la zone de
 * chaque point se lit dans les zones bâties une fois ; un état qui n'est pas un nombre ne s'écrit qu'une fois dans la fiche. */
test('correction bis, points 10 et 13 : la journée calculée une fois ; l’état brut écrit une fois', () => dans(async () => {
  const src = readFileSync(new URL('../src/fichecapteur.jsx', import.meta.url), 'utf8');
  // ASSERTION MODIFIÉE (passe 1 ter, 16/10) : la journée d'une mesure du dehors se lit sur les zones du dehors (`dehors`).
  assert.ok(src.includes('useMemo(() => journeeMesure(brut, { cle, uniteTable, ecrite, neutre, dehors, zi, maintenant }), [brut, cle, uniteTable, ecrite, neutre, dehors, zi, maintenant])'));
  const mf = readFileSync(new URL('../src/mesuresfiche.js', import.meta.url), 'utf8');
  const d = mf.slice(mf.indexOf('export function depuisMesure('), mf.indexOf('\n}\n', mf.indexOf('export function depuisMesure(')));
  assert.ok(!d.includes('zoneMesure(') && d.includes('rangDans(zones, p.v)'), 'aucune table rebâtie à chaque point');
  // Les mêmes « depuis » qu'avant, au-dessus comme au-dessous du bon, avec des bornes comprises (l'idéal d'une température va jusqu'à 23 inclus).
  const chaud = serie([[0, 0, 22], [6, 0, 23], [7, 0, 27.5], [8, 0, 28]]);
  assert.deepEqual(M.depuisMesure(chaud, 'temp', zoneMesure('temp', 28)), { t: A(7, 0), borne: 27, dessous: false });
  const j = M.journeeMesure(STATS.map(x => ({ t: x.start, v: x.mean })), { cle: 'co2', uniteTable: 'ppm', ecrite: 'ppm', zi: 4, maintenant: MAINTENANT });
  assert.equal(j.depuis, 'Au-dessus de ' + mille(1600) + NBSP + 'ppm depuis 21:30.');
  assert.equal(j.minmax, 'min ' + mille(1300) + ' · max ' + mille(1700));
  const S = { ...maison(), 'sensor.co2_erreur': capteur('sensor.co2_erreur', 'erreur', { friendly_name: 'CO₂ cave', device_class: 'carbon_dioxide', unit_of_measurement: 'ppm' }) };
  const m = fiche('sensor.co2_erreur', { states: S, config: { unit_system: { temperature: '°C' } } });
  assert.equal(m.texte().split('erreur').length - 1, 1, 'l’état brut, une seule fois');
}));
