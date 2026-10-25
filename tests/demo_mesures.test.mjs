/* Les mesures de la démo (chantier Capteurs, § 9) : celles de sa maquette
 * « Cartes capteurs », à toute heure, avec 24 heures de statistiques sur 5
 * minutes — ce que lit la fiche d'une mesure.
 *
 * Ce qui est garanti ici, l'horloge de la démo réglée :
 *  - les valeurs et les zones de sa maquette, et la pièce de chacune ;
 *  - le thermomètre du salon porte l'hygromètre et une pile, sur le même appareil ;
 *  - 24 heures de moyennes sur 5 minutes, jamais la tranche en cours, qui
 *    finissent sur la valeur de la carte — à 00:30 comme à 23:50 ;
 *  - une autre mesure n'a pas de statistiques (la fiche lit son histoire), une
 *    prise garde les siennes ;
 *  - la station du jardin (C14, C15) : un appareil physique, et ses 24 heures ;
 *    sa température et son humidité ont leurs zones du dehors (C15, révisé le
 *    16/10) ; le jardin est une pièce du dehors de la démo (C17, 16/10) ;
 *  - C16 (16/10) : chaque mesure d'une pièce a son appareil physique ;
 *  - C17 (16/10) : chaque mesure de la démo est dans une pièce de Loggia. */
process.env.TZ = 'Europe/Paris';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
const { maisonMesuresDemo } = await import('../src/demo.js');
const DEMO = readFileSync(new URL('../src/demo.js', import.meta.url), 'utf8');
const { zoneMesure, cleMesure } = await import('../src/confort.js');

const CINQ = 5 * 60000;
const A = (h, m) => new Date(2026, 9, 15, h, m).getTime();
const MESURES = {
  'sensor.chambre_co2': ['1659', 'Confiné', 'chambre'],
  'sensor.chambre_lino_co2': ['1177', 'Moyen', 'chambre'],
  'sensor.salon_temperature': ['21.4', 'Idéal', 'salon'],
  'sensor.salle_de_bain_humidite': ['68', 'Humide', 'sdb'],
  'sensor.salon_bruit': ['34', 'Calme', 'salon'],
  'sensor.salon_luminosite': ['120', 'Tamisé', 'salon'],
  'sensor.salon_particules': ['8', 'Bon', 'salon'],
  'sensor.salon_cov': ['182', 'Moyen', 'salon'],
};
const demander = (m, ids, t) => m.statistiques({ type: 'recorder/statistics_during_period', start_time: new Date(t - 24 * 3600000).toISOString(), statistic_ids: ids, period: '5minute', types: ['mean'] });

test('§ 9 : les mesures de sa maquette, leur zone et leur pièce', () => {
  const m = maisonMesuresDemo({ quand: A(20, 40) });
  const pieces = new Map(m.index().entities.map(e => [e.id, e.area]));
  for (const [id, [valeur, mot, piece]] of Object.entries(MESURES)) {
    const st = m.states[id];
    assert.ok(st, id + ' manque');
    assert.equal(st.state, valeur, id);
    const a = st.attributes;
    assert.equal(a.state_class, 'measurement', id + ' : un capteur qui a des statistiques');
    assert.equal(zoneMesure(cleMesure(a.device_class, a.unit_of_measurement), Number(st.state)).t, mot, id);
    assert.equal(pieces.get(id), piece, id + ' : sa pièce');
  }
  assert.equal(m.states['sensor.salon_cov'].attributes.unit_of_measurement, undefined, 'un indice COV, sans unité');
});

test('le thermomètre du salon porte l’hygromètre et une pile, sur le même appareil', () => {
  const m = maisonMesuresDemo({ quand: A(20, 40) });
  const appareils = new Map(m.index().entities.map(e => [e.id, e.device]));
  assert.equal(appareils.get('sensor.salon_temperature'), 'thermo_salon');
  assert.equal(appareils.get('sensor.salon_humidite'), 'thermo_salon');
  assert.equal(appareils.get('sensor.salon_thermometre_pile'), 'thermo_salon');
  assert.equal(m.states['sensor.salon_thermometre_pile'].state, '81');
  assert.ok(m.index().devices.some(d => d.id === 'thermo_salon' && d.area === 'salon'));
});

test('24 h de moyennes sur 5 minutes, à toute heure : jamais la tranche en cours, et la fin rejoint la carte', () => {
  for (const t of [A(0, 30), A(7, 0), A(20, 40), A(23, 50)]) {
    const m = maisonMesuresDemo({ quand: t });
    const r = demander(m, Object.keys(MESURES), t);
    for (const [id, [valeur]] of Object.entries(MESURES)) {
      const l = r[id];
      assert.ok(Array.isArray(l) && l.length >= 287 && l.length <= 288, id + ' : ' + (l && l.length) + ' tranches');
      assert.ok(l.every(x => x.end - x.start === CINQ && x.end <= t && Number.isFinite(x.mean)), id + ' : des tranches finies, avant maintenant');
      assert.ok(l.every((x, i) => !i || x.start === l[i - 1].end), id + ' : bout à bout');
      const fin = l[l.length - 1].mean, v = Number(valeur);
      assert.ok(Math.abs(fin - v) <= Math.max(1, v * 0.06), id + ' : la dernière tranche (' + fin + ') rejoint la carte (' + v + ')');
    }
    const co2 = r['sensor.chambre_co2'].map(x => x.mean);
    assert.ok(Math.max(...co2) >= 1900, 'le pic de la nuit, vers 2 018 ppm');
    assert.ok(Math.min(...co2) <= 450, 'la chambre aérée dans la journée');
  }
});

test('une autre mesure n’a pas de statistiques — la fiche lit son histoire ; une prise garde les siennes', () => {
  const t = A(20, 40);
  const m = maisonMesuresDemo({ quand: t });
  const r = demander(m, ['sensor.cuisine_temperature', 'sensor.bureau_co2'], t);
  assert.deepEqual(Object.keys(r), [], 'un capteur sans courbe : rien, comme un capteur sans `state_class`');
  const p = demander(m, ['sensor.prise_nas_zephyr_power'], t);
  assert.ok(p['sensor.prise_nas_zephyr_power'] && p['sensor.prise_nas_zephyr_power'].length > 0, 'la prise du NAS');
});

test('C14, C15, C17 : la station du jardin — un appareil physique, dans une pièce du dehors de la démo', () => {
  const t = A(20, 40);
  const m = maisonMesuresDemo({ quand: t });
  const idx = m.index();
  const ents = new Map(idx.entities.map(e => [e.id, e]));
  const JARDIN = { 'sensor.jardin_temperature': ['12.4', 'temperature'], 'sensor.jardin_humidite': ['81', 'humidity'], 'sensor.jardin_vent': ['9', 'wind_speed'] };
  for (const [id, [valeur, classe]] of Object.entries(JARDIN)) {
    const a = m.states[id].attributes;
    assert.deepEqual([m.states[id].state, a.device_class, a.state_class], [valeur, classe, 'measurement'], id);
    assert.deepEqual([ents.get(id).area, ents.get(id).device], ['jardin', 'station_jardin'], id + ' : sa zone et son appareil');
  }
  assert.equal(zoneMesure('vent', 9).t, 'Calme', 'le vent, que la table juge dehors');
  // ASSERTION AJOUTÉE (passe 1 ter, 16/10 ; C15 révisé) : la température et l'humidité de la station ont leurs zones du dehors — ses jauges.
  assert.deepEqual([zoneMesure('temp', 12.4, true).t, zoneMesure('hum', 81, true).t], ['Frais', 'Humide']);
  const station = idx.devices.find(d => d.id === 'station_jardin');
  assert.ok(station && station.area === 'jardin' && station.entry_type === null, 'un appareil physique, pas un service');
  assert.ok(idx.areas.some(a => a.id === 'jardin' && a.name === 'Jardin'), 'la zone du jardin');
  /* ASSERTION MODIFIÉE (passe 1 quater, 16/10 ; C17) : une mesure n'est jugée que dans une pièce de Loggia — hors d'elle, la station perdait ses jauges
   * du dehors, et sortait d'Objets › Capteurs. Le jardin devient une pièce du DEHORS de la démo, comme son « Extérieur » : sa zone porte son nom, et la
   * pièce lit la température et l'humidité de la station. Il ne prend pas de plafonnier (`PIECES`) : une pièce de la configuration, seulement. */
  assert.ok(!DEMO.includes("['jardin', 'Jardin'"), 'pas une pièce de `PIECES` : ni plafonnier, ni thermomètre de plus');
  assert.deepEqual(m.pieces.find(p => p.room === 'Jardin'), { room: 'Jardin', haid: { temp: 'sensor.jardin_temperature', humidity: 'sensor.jardin_humidite', co2: null } },
    'une pièce de Loggia, du nom de sa zone');
  const r = demander(m, Object.keys(JARDIN), t);
  for (const [id, [valeur]] of Object.entries(JARDIN)) {
    const l = r[id], v = Number(valeur);
    assert.ok(Array.isArray(l) && l.length >= 287 && l.length <= 288, id + ' : ses 24 heures');
    assert.ok(Math.abs(l[l.length - 1].mean - v) <= Math.max(1, v * 0.06), id + ' : la dernière tranche rejoint la carte');
  }
});

/* TEST AJOUTÉ (passe 1 ter, 16/10 ; C16) : une carte de mesure demande un appareil PHYSIQUE. Les mesures des pièces de la démo n'en avaient pas — sauf
 * le thermomètre du salon — : elles auraient quitté Objets › Capteurs. Chacune a son capteur, comme chez lui : un par pièce, qui porte la
 * température, l'humidité et le CO₂ ; le CO₂ de Lino a le sien. Au salon, la luminosité, les particules et les COV ont chacun le leur : une
 * pièce montre une carte par APPAREIL, et sa vue garde ainsi les mêmes cartes qu'avant. */
test('C16 : chaque mesure d’une pièce de la démo a son appareil physique ; la vue d’une pièce garde ses cartes', () => {
  const m = maisonMesuresDemo({ quand: A(20, 40) });
  const idx = m.index();
  const devs = new Map(idx.devices.map(d => [d.id, d]));
  const mesures = idx.entities.filter(e => e.area && m.states[e.id] && cleMesure(m.states[e.id].attributes.device_class, m.states[e.id].attributes.unit_of_measurement));
  assert.ok(mesures.length >= 20, mesures.length + ' mesures dans des pièces');
  assert.deepEqual(mesures.filter(e => !e.device || !devs.get(e.device) || devs.get(e.device).entry_type === 'service').map(e => e.id), [], 'aucune sans appareil physique');
  for (const e of mesures) assert.equal(devs.get(e.device).area, e.area, e.id + ' : son appareil est dans sa pièce');
  const app = new Map(idx.entities.map(e => [e.id, e.device]));
  assert.deepEqual(['sensor.chambre_temperature', 'sensor.chambre_humidite', 'sensor.chambre_co2'].map(id => app.get(id)), ['capteur_chambre', 'capteur_chambre', 'capteur_chambre'], 'un capteur par pièce');
  assert.notEqual(app.get('sensor.chambre_lino_co2'), app.get('sensor.chambre_co2'), 'le CO₂ de Lino a le sien');
  // Une pièce montre une carte par appareil : ses mesures d'air (CO₂, particules, COV, luminosité) gardent chacune le leur.
  const AIR = ['carbon_dioxide', 'pm25', 'pm10', 'aqi', 'illuminance', 'pressure', 'volatile_organic_compounds'];
  for (const zone of new Set(mesures.map(e => e.area))) {
    const air = mesures.filter(e => e.area === zone && AIR.includes(m.states[e.id].attributes.device_class));
    assert.equal(new Set(air.map(e => e.device)).size, air.length, zone + ' : deux mesures d’air sur un même appareil — la pièce en perdrait une carte');
  }
  for (const d of new Set(mesures.map(e => e.device))) assert.ok(devs.get(d).name, d + ' : un nom');
});

/* TEST AJOUTÉ (passe 1 quater, 16/10 ; C17) : une mesure n'est jugée — zones, phrase, lavis, « à regarder » — que dans une pièce de Loggia. Chaque mesure
 * de la démo sur un appareil est dans une zone qui porte le nom d'une pièce de sa configuration — la station du jardin comprise —, sauf le frigo, SANS
 * zone, comme son « Capteur Frigo » : la démo porte la carte neutre. Aucune n'est dans une zone inconnue : aucune ne sort d'Objets. */
test('C17 : chaque mesure de la démo est dans une pièce de Loggia — la station du jardin comprise ; le frigo, sans zone, est neutre', () => {
  const m = maisonMesuresDemo({ quand: A(20, 40) });
  const idx = m.index();
  const zones = new Map(idx.areas.map(a => [a.id, a.name]));
  const pieces = new Set(m.pieces.map(p => p.room));
  // Celles qui entrent dans Objets › Capteurs : sur un appareil physique (C16), ni réglage ni diagnostic — la sonde du processeur, un service, non.
  const physique = new Set(idx.devices.filter(d => d.entry_type !== 'service').map(d => d.id));
  /* ASSERTION MODIFIÉE (chantier Capteurs, étapes 2 et 3, tâche 3 ; C29) : les capteurs d'une PLANTE ne sont pas des mesures — ils sont à la
   * plante (C7), quelle que soit sa zone ; les deux capteurs de plante de la démo sont dans « Technique », qui n'est pas une pièce. */
  const mesures = idx.entities.filter(e => physique.has(e.device) && !/^plante_/.test(e.device) && !e.category && m.states[e.id]
    && cleMesure(m.states[e.id].attributes.device_class, m.states[e.id].attributes.unit_of_measurement));
  assert.ok(mesures.length >= 20, mesures.length + ' mesures');
  assert.deepEqual(mesures.filter(e => !pieces.has(zones.get(e.area))).map(e => [e.id, e.area]), [['sensor.capteur_frigo_temperature', null]],
    'hors des pièces, le frigo seul — sans zone');
  assert.ok(mesures.some(e => e.id === 'sensor.jardin_temperature') && pieces.has('Jardin'));
  // Le frigo : un appareil sans zone, à 4,2 °C — « Trop froid » s'il était jugé ; ses 24 heures, pour sa fiche.
  assert.deepEqual([m.states['sensor.capteur_frigo_temperature'].state, idx.devices.find(d => d.id === 'capteur_frigo').area], ['4.2', null]);
  const l = demander(m, ['sensor.capteur_frigo_temperature'], A(20, 40))['sensor.capteur_frigo_temperature'];
  assert.ok(l.length >= 287 && Math.abs(l[l.length - 1].mean - 4.2) <= 1, 'ses 24 heures rejoignent la carte');
});
