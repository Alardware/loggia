/* La démo des prises (chantier Prises, § 10) : les quatre prises de la
 * maquette, leurs appareils et leurs capteurs, l'état du § 6.1, leurs
 * statistiques sur 5 min et à l'heure, le logbook et ses contextes, le pont de
 * Zigbee2MQTT et la sirène — qui ne sont pas des prises.
 *
 * L'horloge est réglée (`maisonPrisesDemo({ quand })`) : mardi 13 octobre
 * 2026 à la maison, à l'heure de Paris. */
process.env.TZ = 'Europe/Paris';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
const { maisonPrisesDemo } = await import('../src/demo.js');
const { buildIndex } = await import('../src/discovery.js');
const { estPrise, typeDePrise, kwhPrise, ligneDePrise, phrasePrise } = await import('../src/prises.js');
const { ligneCycle } = await import('../src/prisesfiche.js');
const DEMO = readFileSync(new URL('../src/demo.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const A = (h, m, d = 13) => new Date(2026, 9, d, h, m, 0, 0).getTime();
const PRISES = ['switch.prise_nas_zephyr', 'switch.prise_pc_bureau_atlas', 'switch.prise_lave_vaisselle', 'switch.poele'];
const heure = (ms) => new Date(ms).toTimeString().slice(0, 5);

/* Ce que l'écran lirait : la règle de prises.js sur l'index de la démo. */
function verdict(m, id) {
  const r = m.index();
  const ix = buildIndex({ areas: r.areas.map(a => ({ area_id: a.id, name: a.name })), devices: r.devices.map(d => ({ ...d, area_id: d.area })),
    entities: r.entities.map(e => ({ entity_id: e.id, device_id: e.device, area_id: e.area, entity_category: e.category, name: e.name, device_class: e.device_class })), states: m.states });
  const meta = (e) => ix.entityMeta.get(e) || {};
  // Les entrées de la règle, comme l'écran les lit (le contrat du plan 1) : la classe du registre, le nom affiché.
  const decrire = (e) => ({ entity_id: e, device_class: (ix.entityMeta.has(e) ? meta(e).deviceClass : (m.states[e] || { attributes: {} }).attributes.device_class) || null,
    entity_category: meta(e).category || null, nom: (m.states[e] && m.states[e].attributes.friendly_name) || meta(e).name || '' });
  const dev = meta(id).deviceId ? ix.deviceMeta.get(meta(id).deviceId) : null;
  const soeurs = [...ix.entityMeta.entries()].filter(([e, x]) => e !== id && dev && x.deviceId === dev.id).map(([e]) => decrire(e));
  return estPrise({ entite: decrire(id), appareil: dev ? { fabricant: dev.manufacturer, modele: dev.model } : null, soeurs, sirene: /siren/.test(id) });
}

test('les quatre prises de la maquette, chacune son appareil, sa puissance et son compteur ; le poêle muet', () => {
  const m = maisonPrisesDemo({ quand: A(20, 40) });
  for (const id of PRISES) {
    const v = verdict(m, id);
    assert.deepEqual(v, { prise: true, puissance: 'sensor.' + id.slice(7) + '_power', energie: 'sensor.' + id.slice(7) + '_energy' }, id);
  }
  assert.deepEqual(PRISES.map(id => m.states[id].state), ['on', 'on', 'on', 'unavailable']);
  assert.equal(m.states['sensor.prise_nas_zephyr_power'].attributes.device_class, 'power');
  assert.ok(Number(m.states['sensor.prise_nas_zephyr_power'].state) >= 3.4 && Number(m.states['sensor.prise_nas_zephyr_power'].state) <= 4.8, 'le NAS vers 4 W');
  const pc = Number(m.states['sensor.prise_pc_bureau_atlas_power'].state);
  assert.ok(pc >= 95 && pc <= 165, 'le PC de 95 à 165 W : ' + pc);
  assert.equal(m.states['sensor.prise_lave_vaisselle_power'].state, '0');
  assert.equal(m.states['sensor.poele_power'].state, 'unavailable');
  assert.equal(m.states['sensor.prise_lave_vaisselle_energy'].attributes.state_class, 'total_increasing');
  assert.equal(heure(Date.parse(m.states['switch.poele'].last_changed)), '14:20', 'muet depuis 14:20');
  assert.equal(heure(Date.parse(m.states['switch.prise_pc_bureau_atlas'].last_changed)), '08:50');
  assert.equal(new Date(m.states['switch.prise_nas_zephyr'].last_changed).toDateString(), new Date(2026, 8, 2).toDateString(), 'allumé depuis le 2 sept.');
});

test('ni le pont de Zigbee2MQTT, ni la sirène, ni le radiateur sans appareil ne sont des prises', () => {
  const m = maisonPrisesDemo({ quand: A(20, 40) });
  const r = m.index();
  const pont = r.devices.find(d => d.id === 'pont_z2m');
  assert.deepEqual([pont.manufacturer, pont.model], ['Zigbee2MQTT', 'Bridge'], 'le pont se reconnaît à son appareil');
  assert.equal(verdict(m, 'switch.zigbee2mqtt_bridge_permit_join').prise, false);
  assert.equal(verdict(m, 'switch.alarme_sirene_siren_on').prise, false);
  assert.equal(verdict(m, 'switch.radiateur_salon').prise, false, 'sans appareil ni mesure : IoT');
  assert.ok(r.entities.some(e => e.id === 'switch.zigbee2mqtt_bridge_permit_join' && e.category === null), 'sans catégorie : la règle des prises l’aurait pris');
});

test('l’état du § 6.1 : le NAS protégé, le poêle imposé en radiateur, le lave-vaisselle qui prévient et ses cycles', () => {
  const m = maisonPrisesDemo({ quand: A(20, 40) });
  const e = m.etat();
  assert.deepEqual(Object.keys(e).sort(), ['config', 'maintenant', 'notifier', 'prises']);
  assert.equal(e.maintenant.slice(0, 19), '2026-10-13T20:40:00');
  assert.deepEqual(e.config, { protegees: ['switch.prise_nas_zephyr'], types: { 'switch.poele': 'radia' }, prevenir: { 'switch.prise_lave_vaisselle': true } });
  assert.deepEqual(Object.keys(e.prises).sort(), [...PRISES].sort());
  for (const id of PRISES) assert.deepEqual(Object.keys(e.prises[id]).sort(), ['cycle', 'cycles', 'impose', 'prevenir', 'protegee', 'suivi', 'type'], id);   // `suivi` : le contrat du serveur (19/10)
  assert.deepEqual(PRISES.map(id => e.prises[id].type), ['nas', 'pc', 'lv', 'radia']);
  assert.deepEqual([e.prises['switch.poele'].impose, e.prises['switch.prise_nas_zephyr'].protegee, e.prises['switch.prise_lave_vaisselle'].prevenir], [true, true, true]);
  // Du plus ancien au plus récent (le contrat du plan 1) : « Terminé à » lit le dernier.
  const cycles = e.prises['switch.prise_lave_vaisselle'].cycles;
  const cycle = cycles.at(-1);
  assert.deepEqual([cycle.debut.slice(11, 16), cycle.fin.slice(11, 16)], ['13:40', '16:14']);
  assert.ok(cycle.kwh > 1 && cycle.kwh < 1.2, 'deux pics à 1 950 W : ' + cycle.kwh);
  assert.ok(cycles.length >= 2 && cycles.every((c, i) => !i || cycles[i - 1].fin < c.debut), 'les cycles des jours d’avant précèdent celui du jour');
  // Le type deviné que la démo écrit est celui de la règle (`typeDePrise`) : le poêle, rendu à son nom, ne serait qu'une prise.
  m.ecrire({ types: { 'switch.poele': null } });
  for (const id of PRISES) assert.equal(m.etat().prises[id].type, typeDePrise(m.states[id].attributes.friendly_name, null, id), id);
});

test('à toute heure : la démo ouverte à 09:00 garde ses quatre états', () => {
  const m = maisonPrisesDemo({ quand: A(9, 0) });
  assert.equal(heure(Date.parse(m.states['switch.prise_pc_bureau_atlas'].last_changed)), '08:30', 'le PC allumé une demi-heure avant');
  assert.equal(m.states['switch.poele'].state, 'unavailable');
  assert.equal(heure(Date.parse(m.states['switch.poele'].last_changed)), '08:00', 'muet depuis une heure');
  const cycle = m.etat().prises['switch.prise_lave_vaisselle'].cycles.at(-1);
  assert.equal(cycle.fin.slice(0, 16), '2026-10-13T08:40', 'le cycle du jour, fini vingt minutes avant');
});

/* Tâche 12 bis — B8 : la démo à TOUTE heure. La nuit, le cycle du lave-vaisselle (fini vingt minutes avant la démo) passe minuit : à 00:30 il
 * va de 21:36 à 00:10, et chaque instant se lisait dans l'histoire de SON jour — la partie d'avant minuit valait 0 W, et la carte disait
 * « Terminé à 00:10 · 0,00 kWh ». L'histoire, elle, suivait l'horloge : « Terminé à » avançait d'une minute à chaque relecture. */
const LV = 'switch.prise_lave_vaisselle', LV_W = 'sensor.prise_lave_vaisselle_power', LV_E = 'sensor.prise_lave_vaisselle_energy';
const HEURES = [[0, 30], [2, 0], [9, 0], [16, 20], [20, 40], [23, 50]];
const hhmm = (h, m) => String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
/** Ce que dit la carte du lave-vaisselle : la règle de prises.js, sur l'état du § 6.1 et les états de la démo. */
function carteLv(m, maintenant) {
  const e = m.etat().prises[LV];
  const ligne = ligneDePrise({ st: m.states[LV], mesure: true, watts: Number(m.states[LV_W].state), cycle: e.cycle, cycles: e.cycles, type: e.type, maintenant });
  return { cycles: e.cycles, phrase: phrasePrise(ligne, { maintenant }) };
}
const statsLv = (m, period, debut, ids = [LV_E]) => m.statistiques({ type: 'recorder/statistics_during_period', statistic_ids: ids, period, types: ['mean', 'change'],
  start_time: new Date(debut).toISOString(), units: { power: 'W', energy: 'kWh' } });
const somme = (lignes) => lignes.reduce((s, x) => s + x.change, 0);
const logbooks = (m) => JSON.stringify(['switch.prise_pc_bureau_atlas', 'switch.poele'].map(id => m.logbook({ type: 'logbook/get_events', start_time: new Date(A(0, 0)).toISOString(), entity_ids: [id] })));

test('B8 : à 00:30, 02:00, 09:00, 16:20, 20:40 et 23:50 — le cycle fait 1,08 kWh, la carte ne dit jamais « 0,00 kWh »', () => {
  for (const [h, mn] of HEURES) {
    const quand = A(h, mn), nom = hhmm(h, mn);
    const m = maisonPrisesDemo({ quand });
    const { cycles, phrase } = carteLv(m, quand);
    const cycle = cycles.at(-1);
    assert.equal(kwhPrise(cycle.kwh), '1,08 kWh', nom + ' : le cycle ENTIER, minuit franchi ou non (' + cycle.kwh + ')');
    assert.ok(cycle.kwh > 1.075 && cycle.kwh < 1.085, nom + ' : ' + cycle.kwh + ' ne frôle ni 1,075 ni 1,085');
    assert.ok(!/0,00\skWh/.test(phrase), nom + ' : ' + phrase);       // `\s` : l'espace insécable de la phrase (F7) compte
    assert.equal(phrase, 'Terminé à ' + heure(Date.parse(cycle.fin)) + ' · 1,08\u00A0kWh', nom);
    // La ligne de la fiche, sous la courbe du jour : le même cycle, les mêmes kWh.
    assert.equal(ligneCycle(cycles, quand), 'Cycle de ' + heure(Date.parse(cycle.debut)) + ' à ' + heure(Date.parse(cycle.fin)) + ' · 1,08\u00A0kWh', nom);
    // Le cycle a toujours la même durée et la même forme : 154 minutes, à toute heure.
    assert.equal(Date.parse(cycle.fin) - Date.parse(cycle.debut), 154 * 60000, nom);
    // Fini vingt minutes avant la démo si elle est plus matinale que 16:34, à 16:14 sinon.
    assert.equal(heure(Date.parse(cycle.fin)), heure(Math.min(A(16, 14), quand - 20 * 60000)), nom);
  }
});

test('B8 : la démo relue à une minute d’écart ne bouge pas — « Terminé à », les cycles, le logbook et les heures de l’histoire restent fixés', () => {
  for (const [h, mn] of HEURES) {
    const quand = A(h, mn), nom = hhmm(h, mn);
    const m = maisonPrisesDemo({ quand });
    const avant = { carte: carteLv(m, quand), etat: JSON.stringify(m.etat().prises), logbook: logbooks(m) };
    m.avancer(60000);
    const apres = carteLv(m, quand + 60000);
    assert.equal(apres.phrase, avant.carte.phrase, nom + ' : « Terminé à » n’a pas avancé d’une minute');
    assert.deepEqual(apres.cycles, avant.carte.cycles, nom);
    assert.equal(JSON.stringify(m.etat().prises), avant.etat, nom + ' : l’état du § 6.1 est le même');
    assert.equal(logbooks(m), avant.logbook, nom + ' : le logbook aussi');
    // Trois heures plus tard, tant qu'on reste dans le jour : l'histoire est toujours celle de l'ouverture.
    m.avancer(3 * 3600000);
    if (new Date(quand + 3 * 3600000 + 60000).getDate() === new Date(quand).getDate()) assert.deepEqual(carteLv(m, quand + 3 * 3600000 + 60000).cycles, avant.carte.cycles, nom + ' : trois heures plus tard');
  }
});

test('B8 : la courbe du jour ne montre que la partie d’après minuit d’un cycle qui passe minuit ; la veille garde le reste — l’énergie est la même', () => {
  for (const [h, mn] of HEURES) {
    const quand = A(h, mn), nom = hhmm(h, mn);
    const m = maisonPrisesDemo({ quand });
    const cycle = carteLv(m, quand).cycles.at(-1);
    const jour = somme(statsLv(m, '5minute', A(0, 0))[LV_E]);
    const veille = somme(statsLv(m, 'hour', A(0, 0, 12))[LV_E].filter(x => x.start < A(0, 0)));
    const w = statsLv(m, '5minute', A(0, 0), [LV_W])[LV_W];
    assert.ok(w.every(x => x.start >= A(0, 0)), nom + ' : la courbe du jour commence à minuit');
    if (Date.parse(cycle.debut) >= A(0, 0)) {
      assert.ok(Math.abs(jour - cycle.kwh) < 0.004, nom + ' : tout le cycle est d’aujourd’hui — ' + jour + ' kWh du compteur, ' + cycle.kwh + ' du cycle');
    } else {
      assert.ok(jour > 0 && jour < cycle.kwh, nom + ' : le jour ne compte que la partie d’après minuit — ' + jour + ' sur ' + cycle.kwh);
      assert.ok(Math.abs(jour + veille - cycle.kwh) < 0.004, nom + ' : la veille au soir (' + veille + ') et la nuit (' + jour + ') font le cycle (' + cycle.kwh + ')');
      assert.ok(w[0].mean > 0, nom + ' : et le cycle y est déjà en cours, à minuit — pas 0 W');
    }
  }
});

test('B8 : à 00:30, le cycle va de 21:36 à 00:10 — et vaut 1,08 kWh, jamais « Terminé à 00:10 · 0,00 kWh »', () => {
  const quand = A(0, 30);
  const m = maisonPrisesDemo({ quand });
  const { cycles, phrase } = carteLv(m, quand);
  const cycle = cycles.at(-1);
  assert.deepEqual([cycle.debut.slice(0, 16), cycle.fin.slice(0, 16)], ['2026-10-12T21:36', '2026-10-13T00:10']);
  assert.equal(phrase, 'Terminé à 00:10 · 1,08\u00A0kWh');
  // Les puissances d'avant minuit : le lavage à 66 W à 23:00 (la veille), le séchage à 14 W à minuit, plus rien à 00:10.
  const watts = (debut, fin) => m.statistiques({ type: 'recorder/statistics_during_period', statistic_ids: [LV_W], period: '5minute', types: ['mean'],
    start_time: new Date(debut).toISOString(), end_time: new Date(fin).toISOString() })[LV_W][0].mean;
  assert.equal(watts(A(23, 0, 12), A(23, 5, 12)), 66, 'hier à 23:00 : le lavage, dans le cycle commencé à 21:36');
  assert.equal(watts(A(0, 0), A(0, 5)), 14, 'à minuit : le séchage');
  assert.equal(watts(A(0, 10), A(0, 15)), 0, 'à 00:10 : fini');
});

test('B8 : une démo laissée ouverte passé minuit fixe l’histoire du nouveau jour sans défaire celle de la veille', () => {
  const m = maisonPrisesDemo({ quand: A(23, 50) });
  const veille = carteLv(m, A(23, 50)).cycles.at(-1);
  assert.deepEqual([veille.debut.slice(11, 16), veille.fin.slice(11, 16)], ['13:40', '16:14']);
  m.avancer(40 * 60000);                                           // 00:30 du lendemain
  const lendemain = A(0, 30, 14);
  const { cycles, phrase } = carteLv(m, lendemain);
  assert.deepEqual(cycles.at(-2), veille, 'le cycle de la veille reste tel qu’on le lisait');
  assert.deepEqual([cycles.at(-1).debut.slice(0, 16), cycles.at(-1).fin.slice(0, 16)], ['2026-10-13T21:36', '2026-10-14T00:10'], 'celui du jour qui commence est fixé à sa première lecture');
  assert.equal(phrase, 'Terminé à 00:10 · 1,08\u00A0kWh');
  m.avancer(60000);
  assert.equal(carteLv(m, lendemain + 60000).phrase, phrase, 'et ne bouge plus');
});

test('B4 : les lignes du journal de la démo portent `simule`, comme `regles.noter` — vrai pour ce que Loggia n’a pas fait, faux pour les cycles et les minuteurs', async () => {
  const { reglesDemo } = await import('../src/demo.js');
  const m = maisonPrisesDemo({ quand: A(20, 40) });
  const lignes = reglesDemo(m.states).journal;
  assert.ok(lignes.length > 0 && lignes.every(l => typeof l.simule === 'boolean'), 'chaque ligne dit si elle a agi');
  assert.ok(lignes.some(l => l.simule === true), 'la démo garde une ligne simulée (la fermeture de la chambre) : le « qui » de la fiche d’une prise ne doit pas s’y tromper');
  const duJour = lignes.filter(l => l.module === 'prises');
  assert.ok(duJour.length >= 2 && duJour.every(l => l.simule === false), 'les cycles sont des mesures, jamais une simulation');
});

test('les statistiques : 5 min depuis minuit, à l’heure depuis le 1er — la sauvegarde, la pause, les pics, le silence', () => {
  const m = maisonPrisesDemo({ quand: A(20, 40) });
  const lire = (ids, period, debut) => m.statistiques({ type: 'recorder/statistics_during_period', statistic_ids: ids, period, types: ['mean', 'change'],
    start_time: new Date(debut).toISOString(), units: { power: 'W', energy: 'kWh' } });
  const r = lire(['sensor.prise_nas_zephyr_power', 'sensor.prise_pc_bureau_atlas_power', 'sensor.prise_lave_vaisselle_power', 'sensor.poele_power', 'sensor.prise_lave_vaisselle_energy'], '5minute', A(0, 0));
  const a = (id, h, mn) => (r[id].find(x => x.start === A(h, mn)) || {}).mean;
  assert.ok(a('sensor.prise_nas_zephyr_power', 2, 10) > 20 && a('sensor.prise_nas_zephyr_power', 4, 0) < 5, 'la sauvegarde de 02:00 à 02:45');
  assert.ok(a('sensor.prise_pc_bureau_atlas_power', 12, 45) < 40 && a('sensor.prise_pc_bureau_atlas_power', 10, 0) > 90, 'la pause de midi');
  assert.equal(a('sensor.prise_pc_bureau_atlas_power', 7, 0), 0, 'coupé avant 08:50');
  assert.equal(a('sensor.prise_lave_vaisselle_power', 14, 0), 1950);
  assert.equal(a('sensor.prise_lave_vaisselle_power', 15, 40), 1950, 'deux pics');
  assert.equal(r['sensor.poele_power'].at(-1).start, A(14, 15), 'muet depuis 14:20 : plus rien');
  assert.equal(r['sensor.prise_nas_zephyr_power'].at(-1).end, A(20, 40), 'jamais la tranche en cours');
  const cycle = r['sensor.prise_lave_vaisselle_energy'].filter(x => x.start >= A(13, 40) && x.start < A(16, 14)).reduce((s, x) => s + x.change, 0);
  assert.equal(Math.round(cycle * 100) / 100, Math.round(m.etat().prises['switch.prise_lave_vaisselle'].cycles.at(-1).kwh * 100) / 100, 'le compteur et le cycle disent la même énergie');
  const h = lire(['sensor.prise_pc_bureau_atlas_energy'], 'hour', A(0, 0, 1));
  assert.equal(h['sensor.prise_pc_bureau_atlas_energy'][0].start, A(0, 0, 1), 'le mois depuis le 1er à 0 h');
  assert.equal(h['sensor.prise_pc_bureau_atlas_energy'].at(-1).start, A(19, 0), 'les heures finies');
});

test('le logbook d’une prise depuis minuit : le bouton, l’automatisation « Matin » et son contexte, le silence', () => {
  const m = maisonPrisesDemo({ quand: A(20, 40) });
  const lire = (id) => m.logbook({ type: 'logbook/get_events', start_time: new Date(A(0, 0)).toISOString(), entity_ids: [id] });
  const pc = lire('switch.prise_pc_bureau_atlas');
  assert.deepEqual(pc.map(e => [heure(e.when * 1000), e.state, e.context_user_id || null, e.context_event_type || null]), [['08:50', 'on', null, null]]);
  const poele = lire('switch.poele');
  assert.deepEqual(poele.map(e => [heure(e.when * 1000), e.state]), [['06:30', 'on'], ['14:20', 'unavailable']]);
  assert.deepEqual([poele[0].context_event_type, poele[0].context_name], ['automation_triggered', 'Matin']);
  assert.deepEqual(lire('switch.prise_nas_zephyr'), [], 'le NAS n’a rien fait depuis minuit');
});

test('la configuration s’écrit comme au serveur : les protégées ENTIÈRES, le type et l’alerte prise par prise', () => {
  const m = maisonPrisesDemo({ quand: A(20, 40) });
  const r = m.ecrire({ protegees: ['switch.prise_pc_bureau_atlas', 'switch.prise_nas_zephyr'] });
  assert.deepEqual(r.config.protegees, ['switch.prise_nas_zephyr', 'switch.prise_pc_bureau_atlas'], 'la liste remplace l’ancienne, triée');
  assert.equal(r.etat.prises['switch.prise_pc_bureau_atlas'].protegee, true);
  assert.deepEqual(r.config.types, { 'switch.poele': 'radia' }, 'une clé absente du patch ne bouge pas');
  const t = m.ecrire({ types: { 'switch.prise_pc_bureau_atlas': 'tv' }, prevenir: { 'switch.prise_lave_vaisselle': false } });
  assert.deepEqual(t.config.types, { 'switch.poele': 'radia', 'switch.prise_pc_bureau_atlas': 'tv' }, 'un type se pose prise par prise');
  assert.deepEqual(t.config.prevenir, {}, '« false » coupe');
  assert.deepEqual(m.ecrire({ types: { 'switch.poele': null } }).config.types, { 'switch.prise_pc_bureau_atlas': 'tv' }, '« null » rend la prise à son nom');
  assert.ok(DEMO.includes("if (msg && msg.type === 'loggia/prises/config') {\n        if (ordinaire) return Promise.reject({ code: 'unauthorized', message: 'Unauthorized' });"),
    'le compte ordinaire est refusé, comme require_admin');
  assert.ok(DEMO.includes("if (msg && msg.type === 'logbook/get_events') return Promise.resolve(logbookPrisesDemo(msg, states));"));
  assert.ok(DEMO.includes("PRISES_JOURNAL.push(ligneJournal({ module: 'minuteurs', regle: 'minuteur', quoi: 'poser', cibles: [x], n: 1, motif: [['{n} min', { n }]]"),
    'la pose du minuteur se note au journal');
});

/* TEST AJOUTÉ (audit de l'écran des prises, 19/10, point 1) : la démo dit, comme le serveur, quelles prises il suit — le
 * lave-vaisselle seul ; la fiche n'y propose « Prévenir à la fin du cycle » que pour lui. */
test('`suivi` : le lave-vaisselle est suivi ; le NAS, le PC et le poêle (imposé radiateur) ne le sont pas', () => {
  const e = maisonPrisesDemo({ quand: A(20, 40) }).etat();
  assert.deepEqual(PRISES.map(id => e.prises[id].suivi), [false, false, true, false]);
});
