// Les petits correctifs de lecture (lot 14 du rapport Gladys : D15, D16, E1, Z1, D21 ; ADR 0319).
//
// Electricity Maps se lit à sa plateforme et à sa clé, et son intensité carbone s'affiche (D16, E1) ;
// un préréglage se dit avec les mots de Loggia, l'inconnu tel quel (D15) ; rien de l'application d'un
// téléphone (`mobile_app`) n'entre dans Objets ni dans la grille d'une pièce (Z1) ; le seuil d'un
// consommable n'a pas de plafond à 90 (D21) ; la progression de la tondeuse ne se cherche plus au nom.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { device, entity, area, state, states, ctxOf } from './fixtures.mjs';
import { MONOLITHE } from './monolithe.mjs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);

const { setLoggiaState } = await import('../src/state.js');
const { capteursCarbone, valeurCarbone, uniteCarbone } = await import('../src/carbone.js');
const { motPreset, modeDOption, GRAPHIES_MODES } = await import('../src/chauffageecran.js');
const { objetsDeLaMaison } = await import('../src/vues/objets.jsx');
const { roomEntitiesBrutes } = await import('../src/app/decouverte.jsx');
const { resolvePeople } = await import('../src/resolve.js');
const { plafondConso, seuilConso } = await import('../src/views/veilles.jsx');
const { maisonCapteursDemo } = await import('../src/demo.js');
const { buildIndex } = await import('../src/discovery.js');
const lire = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

function avec(fx, f) {
  const ctx = ctxOf(fx, {});
  setLoggiaState({ index: ctx.index, ent: {}, cfg: {}, resolved: null });
  try { return f(ctx); } finally { setLoggiaState({ index: null, ent: {}, cfg: {}, resolved: null }); }
}

/* ════════════ ELECTRICITY MAPS, À SA CLÉ (D16, E1) ════════════ */

/* Le réseau d'Electricity Maps : la part fossile et l'intensité, sous des identifiants qui ne disent rien (renommés), et un capteur
 * d'une autre intégration qui, lui, porte « fossil » dans son nom. */
function reseau({ cles = true, plateforme = 'co2signal' } = {}) {
  const ents = [
    entity('sensor.reseau_a', { platform: plateforme, key: cles ? 'fossil_fuel_percentage' : null }),
    entity('sensor.reseau_b', { platform: plateforme, key: cles ? 'carbon_intensity' : null }),
    entity('sensor.fossil_compteur', { platform: 'template' }),
  ];
  const S = states(
    state('sensor.reseau_a', 38.4, { unit_of_measurement: '%' }),
    state('sensor.reseau_b', 56.2, { unit_of_measurement: 'gCO2eq/kWh' }),
    state('sensor.fossil_compteur', 99, { unit_of_measurement: '%' }),
  );
  return { areas: [], devices: [], entities: ents, floors: [], states: S };
}

test('Electricity Maps : la part fossile et l’intensité se trouvent à leur plateforme et à leur clé, jamais au nom', () => {
  const fx = reseau();
  const c = avec(fx, (ctx) => capteursCarbone(fx.states, ctx.index.entityMeta));
  assert.deepEqual(c, { fossile: 'sensor.reseau_a', intensite: 'sensor.reseau_b' }, 'renommés, ils se trouvent encore');
  // Deux entrées d'Electricity Maps (deux zones) : la première du registre, pas la dernière lue.
  const deux = reseau();
  deux.entities.push(entity('sensor.reseau_c', { platform: 'co2signal', key: 'fossil_fuel_percentage' }));
  deux.states['sensor.reseau_c'] = { entity_id: 'sensor.reseau_c', state: '12', attributes: { unit_of_measurement: '%' } };
  assert.equal(avec(deux, (ctx) => capteursCarbone(deux.states, ctx.index.entityMeta)).fossile, 'sensor.reseau_a');
  assert.equal(valeurCarbone(fx.states, c.fossile), 38.4);
  assert.equal(valeurCarbone(fx.states, c.intensite), 56.2);
  // Une autre intégration, même avec « fossil » dans son identifiant et des pour-cent : rien.
  const autre = reseau({ plateforme: 'template' });
  assert.deepEqual(avec(autre, (ctx) => capteursCarbone(autre.states, ctx.index.entityMeta)), { fossile: null, intensite: null });
});

test('Electricity Maps sans clé de traduction (une version ancienne) : l’unité départage ses deux capteurs', () => {
  const fx = reseau({ cles: false });
  assert.deepEqual(avec(fx, (ctx) => capteursCarbone(fx.states, ctx.index.entityMeta)), { fossile: 'sensor.reseau_a', intensite: 'sensor.reseau_b' });
});

test('Electricity Maps : un capteur muet ne vaut rien, sans index rien n’est trouvé, l’unité s’écrit avec son indice', () => {
  assert.equal(valeurCarbone({ 'sensor.x': { state: 'unavailable' } }, 'sensor.x'), null);
  assert.equal(valeurCarbone({}, null), null);
  assert.deepEqual(capteursCarbone(reseau().states, null), { fossile: null, intensite: null });
  assert.equal(uniteCarbone('gCO2eq/kWh'), 'gCO₂eq/kWh');
  assert.equal(uniteCarbone(null), 'gCO₂eq/kWh');
});

test('la vue Énergie lit Electricity Maps par carbone.js, et pose l’intensité à côté de la part bas-carbone', () => {
  const en = lire('src/views/energie.jsx');
  assert.ok(!en.includes('/fossil/') && !en.includes("Object.keys(S).find(k => k.indexOf('sensor.') === 0"), 'plus aucune recherche au nom');
  assert.ok(en.includes('const carbone = capteursCarbone(S, LOGGIA_INDEX && LOGGIA_INDEX.entityMeta);'));
  assert.ok(en.includes("intensite != null && { caption: tr('Intensité carbone'), value: String(Math.round(intensite)), unit: uniteCarbone(uniteDe(carbone.intensite))"));
  const i = en.indexOf("caption: tr('Électricité bas-carbone')"), j = en.indexOf("caption: tr('Intensité carbone')");
  assert.ok(i > 0 && j > i && en.slice(i, j).split('\n').length <= 3, 'la tuile de l’intensité suit celle de la part bas-carbone');
});

test('la démo porte Electricity Maps : ses deux capteurs se trouvent à leur clé', () => {
  const m = maisonCapteursDemo();
  const r = m.index();
  const ix = buildIndex({ areas: r.areas.map(a => ({ area_id: a.id, name: a.name })), devices: r.devices.map(d => ({ ...d, area_id: d.area })),
    entities: r.entities.map(e => ({ entity_id: e.id, device_id: e.device, area_id: e.area, entity_category: e.category, name: e.name, device_class: e.device_class, platform: e.platform, translation_key: e.key || null })), states: m.states });
  const c = capteursCarbone(m.states, ix.entityMeta);
  assert.equal(valeurCarbone(m.states, c.fossile), 38);
  assert.equal(valeurCarbone(m.states, c.intensite), 56);
});

/* ════════════ LES PRÉRÉGLAGES (D15) ════════════ */

test('un préréglage d’ordre fil pilote se dit avec les mots de Loggia ; un inconnu, tel que l’appareil l’écrit', () => {
  assert.equal(motPreset('frost_protection'), 'Hors-gel');
  assert.equal(motPreset('comfort-1'), 'Confort −1');
  assert.equal(motPreset('comfort_-2'), 'Confort −2');
  assert.equal(motPreset('FrostProtection'), 'Hors-gel', 'un nom collé de ZHA');
  assert.equal(motPreset('eco'), 'Éco');
  assert.equal(motPreset('turbo'), 'turbo');
  assert.equal(motPreset('overnight'), 'overnight');
  assert.equal(modeDOption('Hors-gel'), 'hors_gel');
  assert.equal(modeDOption(null), null);
});

test('les graphies de l’écran et de la démo sont celles du serveur (OPTIONS, chauffage_familles.py)', () => {
  const py = lire('custom_components/loggia/chauffage_familles.py');
  const bloc = py.slice(py.indexOf('OPTIONS: dict[str, frozenset[str]] = {'), py.indexOf('}\n', py.indexOf('OPTIONS: dict')));
  const serveur = {};
  for (const m of bloc.matchAll(/"([a-z_0-9]+)": frozenset\(\{([^}]*)\}\)/g)) serveur[m[1]] = [...m[2].matchAll(/"([^"]+)"/g)].map(x => x[1]).sort();
  const ecran = Object.fromEntries(Object.entries(GRAPHIES_MODES).map(([k, v]) => [k, [...v].sort()]));
  assert.deepEqual(ecran, serveur);
  // La démo garde sa copie (l'importer scinderait le démarrage) : la même.
  const demo = lire('src/demo.js');
  const copie = demo.slice(demo.indexOf('const GRAPHIES_CHA = {'), demo.indexOf('};', demo.indexOf('const GRAPHIES_CHA = {')));
  for (const [mode, graphies] of Object.entries(serveur)) {
    const m = copie.match(new RegExp('\\b' + mode + ': \\[([^\\]]*)\\]'));
    assert.ok(m, 'la démo : ' + mode);
    assert.deepEqual([...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]).sort(), graphies, 'la démo : ' + mode);
  }
});

test('les deux feuilles d’avant disent leurs préréglages par motPreset, et la fiche de chauffage aussi', () => {
  assert.ok(lire('src/appareils/fiches.jsx').includes('<FichePuces options={presets.map(p => ({ id: p, nom: motPreset(p) }))}'));
  assert.ok(lire('src/cartes/chauffage.jsx').includes('options={at.preset_modes.slice(0, 10)} rendre={motPreset}'));
  const fc = lire('src/fichechauffage.jsx');
  assert.ok(fc.includes('label: motPreset(p)') && !fc.includes('const motPreset'), 'une seule règle, celle de chauffageecran.js');
});

/* ════════════ RIEN D'UN TÉLÉPHONE DANS OBJETS (Z1) ════════════ */

/* Un téléphone (dans le salon, ou sans zone) : son baromètre et sa tension (l'application Home Assistant), sa personne ; une station météo,
 * physique, à côté de lui, avec sa pression. */
function maison({ zone = 'salon' } = {}) {
  const ents = [
    entity('sensor.telephone_pression', { device: 'd_tel', platform: 'mobile_app', area: zone }),
    entity('sensor.telephone_tension', { device: 'd_tel', platform: 'mobile_app', area: zone }),
    entity('device_tracker.telephone', { device: 'd_tel', platform: 'mobile_app' }),
    entity('sensor.station_pression', { device: 'd_station', platform: 'mqtt', area: zone }),
    entity('person.alex', { platform: 'person' }),
  ];
  const S = states(
    state('sensor.telephone_pression', 1013, { friendly_name: 'Téléphone Pression', device_class: 'pressure', unit_of_measurement: 'hPa' }),
    state('sensor.telephone_tension', 121, { friendly_name: 'Téléphone Tension', device_class: 'pressure', unit_of_measurement: 'mmHg' }),
    state('device_tracker.telephone', 'home', { friendly_name: 'Téléphone', source_type: 'gps' }),
    state('sensor.station_pression', 1012, { friendly_name: 'Station Pression', device_class: 'pressure', unit_of_measurement: 'hPa' }),
    state('person.alex', 'home', { friendly_name: 'Alex', device_trackers: ['device_tracker.telephone'] }),
  );
  return { areas: [area('salon', 'Salon')], devices: [device('d_tel', 'Téléphone', zone, { integration: 'mobile_app' }), device('d_station', 'Station', zone, { integration: 'mqtt' })],
    entities: ents, floors: [], states: S };
}

test('Objets : aucun capteur de l’application d’un téléphone ; la station météo, elle, garde sa carte', () => {
  // Sans zone : Objets les montre, neutres (C16) — le baromètre d'un iPhone y entrait ainsi.
  const fx = maison({ zone: null });
  const ids = avec(fx, () => objetsDeLaMaison({ states: fx.states }, [], new Set()).map(o => o.id));
  assert.ok(ids.includes('sensor.station_pression'), 'la pression d’un appareil de la maison');
  assert.ok(!ids.includes('sensor.telephone_pression'), 'le baromètre du téléphone');
  assert.ok(!ids.includes('sensor.telephone_tension'), 'sa tension');
});

test('la grille d’une pièce : rien du téléphone posé dans la pièce, la station y reste', () => {
  const fx = maison();
  const ids = avec(fx, () => roomEntitiesBrutes({ states: fx.states }, 'Salon'));
  assert.ok(ids.includes('sensor.station_pression'));
  assert.ok(!ids.some(id => id.indexOf('sensor.telephone_') === 0));
});

test('le téléphone reste ailleurs : la personne qu’il suit compte toujours dans la présence', () => {
  const ctx = ctxOf(maison(), {});
  assert.deepEqual(resolvePeople(ctx).list.map(p => p.haid), ['person.alex']);
  // Les piles d'un téléphone étaient déjà écartées à leur plateforme ; les notifications passent par le service `notify`.
  assert.ok(lire('src/piles.js').includes("m.platform === 'mobile_app'"));
});

/* ════════════ LE SEUIL DES CONSOMMABLES (D21) ════════════ */

test('le seuil d’un consommable : pas de plafond à 90 ; 100 au plus quand tous ses capteurs sont en pour-cent', () => {
  const S = { 'sensor.reservoir': { state: '420', attributes: { unit_of_measurement: 'mL' } }, 'sensor.filtre': { state: '60', attributes: { unit_of_measurement: '%' } } };
  assert.equal(plafondConso(['sensor.reservoir'], S), null, 'des millilitres : pas de borne haute, comme au serveur');
  assert.equal(plafondConso(['sensor.reservoir', 'sensor.filtre'], S), null, 'un seul capteur qui n’est pas en pour-cent suffit');
  assert.equal(plafondConso(['sensor.filtre'], S), 100);
  assert.equal(plafondConso([], S), null);
  assert.equal(seuilConso('150', null), 150, 'un réservoir en millilitres reçoit 150');
  assert.equal(seuilConso('150', 100), 100);
  assert.equal(seuilConso('0', null), 10, 'zéro ou vide : le défaut');
  assert.equal(seuilConso('', null), 10);
  assert.equal(seuilConso('-4', null), 1, 'jamais sous 1');
  assert.equal(seuilConso('2.5', null), 2.5, 'le serveur garde une décimale');
  assert.equal(seuilConso('1e400', null), 10, 'l’infini n’est pas un seuil');
  const v = lire('src/views/veilles.jsx');
  assert.ok(!v.includes('max={90}') && !v.includes('Math.min(90'), 'le plafond de 90 est parti');
  assert.ok(lire('custom_components/loggia/veilles.py').includes('("consommables", 1, None)'), 'le serveur, lui, n’a toujours pas de borne haute');
});

/* ════════════ LA TONDEUSE (demande ajoutée) ════════════ */

test('la progression de la tondeuse ne se cherche plus au nom : l’objet que rien n’affichait est parti', () => {
  const d = lire('src/app/derive.jsx').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.ok(!d.includes('machines.tondeuse') && !d.includes('progress'), 'derive.jsx, hors commentaires');
  assert.ok(!MONOLITHE.includes("mowerSensor(S, 'progress')"), 'la coquille ne la suit plus');
  // La carte du robot, elle, lit la progression à sa clé, et s'abonne elle-même.
  assert.ok(lire('src/cartes/robot.jsx').includes("const idPct = soeur('sensor', 0, ['progress'])"));
});

test('le texte neuf, dans les six autres langues', async () => {
  for (const l of ['en', 'de', 'es', 'it', 'nl', 'pl']) {
    const T = (await import('../src/langues/' + l + '.js')).default;
    assert.ok(typeof T['Intensité carbone'] === 'string' && T['Intensité carbone'] && T['Intensité carbone'] !== 'Intensité carbone', l);
  }
});
