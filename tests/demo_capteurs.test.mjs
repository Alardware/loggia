/* Les capteurs binaires, les plantes et les piles de la démo (chantier Capteurs, étapes 2 et 3, tâche 3 ; § 12) : ce que les
 * groupes, la carte d'une plante et la carte Piles ont à montrer, à toute heure.
 *
 * Ce qui est garanti ici, l'horloge de la démo réglée :
 *  - Ouvertures : les six ouvrants, chacun sur son APPAREIL physique avec sa pile — la porte d'entrée à 9 %, la fenêtre de la
 *    chambre à 12 %, les autres au-dessus de 60 % — ; la baie vitrée et la fenêtre de la chambre ouvertes ; la porte d'entrée
 *    porte son sabotage ;
 *  - Sécurité : les deux fumées, le CO et la fuite, sur des appareils ; la fumée de l'entrée est MUETTE depuis 14:05 (C4) ;
 *  - Présence (§ 19.3) : un radar au bureau, allumé ; le mouvement du salon, vu par le journal il y a 3 minutes ; le mouvement de
 *    l'entrée ; et le mouvement de la caméra, sur l'appareil de la caméra ;
 *  - MeteoAlarm, éteinte, sans appareil ; un « Besoin eau » de modèle (`moisture`), sans appareil (C21, C28) ;
 *  - Plantes (C29) : le Dracaena Marginata découvert — sol 28 %, 84 lx, 19,5 °C, 784 µS/cm, pile 100 % — et le Schefflera,
 *    découvert et muet depuis samedi 14:05, dont les statistiques portent le dernier relevé (sol 12 %, pile 4 %) ; tous deux dans
 *    la zone « Technique », qui n'est pas une pièce ;
 *  - Piles : un bouton du salon à 14 % ; la batterie de la maison reste celle d'Énergie ;
 *  - l'histoire du jour des binaires, lue pour plusieurs d'un coup, et le journal des détecteurs de présence. */
process.env.TZ = 'Europe/Paris';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
const { maisonCapteursDemo } = await import('../src/demo.js');
const DEMO = readFileSync(new URL('../src/demo.js', import.meta.url), 'utf8');

const A = (h, m) => new Date(2026, 9, 15, h, m).getTime();
const MIN = 60000;
const minuit = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

const OUVRANTS = {
  'binary_sensor.porte_entree': ['off', 'contact_porte_entree', 'entree', 'sensor.pile_porte_entree', 9],
  'binary_sensor.baie_vitree': ['on', 'contact_baie_vitree', 'salon', 'sensor.baie_vitree_pile', 96],
  'binary_sensor.fenetre_salon': ['off', 'contact_fenetre_salon', 'salon', 'sensor.fenetre_salon_pile', 88],
  // ASSERTION MODIFIÉE (chantier Capteurs, étapes 2 et 3, tâche 11 ; C32, § 19.8) : 12 % — sous le seuil de la veille des piles (15 %), pour « 3 piles à changer ».
  'binary_sensor.fenetre_chambre': ['on', 'contact_fenetre_chambre', 'chambre', 'sensor.fenetre_chambre_pile', 12],
  'binary_sensor.porte_garage': ['off', 'contact_porte_garage', null, 'sensor.porte_garage_pile', 72],
  'binary_sensor.porte_service': ['off', 'contact_porte_service', null, 'sensor.porte_service_pile', 64],
};
const DETECTEURS = {
  'binary_sensor.detecteur_fumee': ['off', 'detecteur_fumee_cuisine', 'cuisine', 'sensor.detecteur_fumee_pile', 92],
  'binary_sensor.detecteur_fumee_entree': ['unavailable', 'detecteur_fumee_entree', 'entree', 'sensor.detecteur_fumee_entree_pile', 88],
  'binary_sensor.detecteur_co_salon': ['off', 'detecteur_co_salon', 'salon', 'sensor.detecteur_co_salon_pile', 76],
  'binary_sensor.fuite_evier': ['off', 'detecteur_fuite_evier', 'cuisine', null, null],
};
const PRESENCE = {
  'binary_sensor.radar_bureau': ['on', 'radar_bureau', 'bureau', 'occupancy'],
  'binary_sensor.mouvement_salon': ['off', 'mouvement_salon', 'salon', 'motion'],
  'binary_sensor.mouvement_entree': ['off', 'mouvement_entree', 'entree', 'motion'],
  'binary_sensor.camera_entree_mouvement': ['off', 'cam_entree', 'entree', 'motion'],
};

function registre(m) {
  const idx = m.index();
  return { idx, ents: new Map(idx.entities.map(e => [e.id, e])), devs: new Map(idx.devices.map(d => [d.id, d])) };
}

test('§ 12 : les six ouvrants, chacun sur son appareil physique avec sa pile ; la baie et la fenêtre de la chambre ouvertes ; le sabotage de la porte d’entrée', () => {
  const m = maisonCapteursDemo({ quand: A(20, 40) });
  const { ents, devs } = registre(m);
  for (const [id, [etat, appareil, zone, pile, niveau]] of Object.entries(OUVRANTS)) {
    assert.equal(m.states[id].state, etat, id);
    const e = ents.get(id);
    assert.ok(e && e.device === appareil && e.area === zone && e.category === null, id + ' : son appareil, sa zone, sans catégorie');
    const d = devs.get(appareil);
    assert.ok(d && d.entry_type === null && d.area === zone && d.integration === 'mqtt' && d.via === 'pont_z2m', appareil + ' : un appareil physique, derrière le pont');
    assert.equal(m.states[pile].state, String(niveau), pile);
    assert.deepEqual([m.states[pile].attributes.device_class, ents.get(pile).device, ents.get(pile).category], ['battery', appareil, 'diagnostic'], pile + ' : la pile de l’appareil, de diagnostic');
  }
  const sabotage = ents.get('binary_sensor.porte_entree_sabotage');
  assert.deepEqual([m.states['binary_sensor.porte_entree_sabotage'].state, m.states['binary_sensor.porte_entree_sabotage'].attributes.device_class, sabotage.device, sabotage.category],
    ['off', 'tamper', 'contact_porte_entree', null], 'le sabotage, sur l’appareil de la porte, sans catégorie');
  // « Ouverte depuis » : la baie depuis 47 minutes, la fenêtre de la chambre depuis 2 h 10 — ce que la carte lit (`last_changed`).
  assert.equal(Date.parse(m.states['binary_sensor.baie_vitree'].last_changed), A(20, 40) - 47 * MIN);
  assert.equal(Date.parse(m.states['binary_sensor.fenetre_chambre'].last_changed), A(20, 40) - 130 * MIN);
  // La ligne de la fenêtre de la chambre reste celle d'avant : d'autres tests l'épinglent.
  assert.ok(DEMO.includes("'binary_sensor.fenetre_chambre': s('on', { friendly_name: 'Fenêtre chambre', device_class: 'window' })"));
});

test('§ 12, C4 : les quatre détecteurs sur leurs appareils ; la fumée de l’entrée est muette depuis 14:05, à toute heure', () => {
  for (const t of [A(9, 10), A(20, 40)]) {
    const m = maisonCapteursDemo({ quand: t });
    const { ents, devs } = registre(m);
    for (const [id, [etat, appareil, zone, pile, niveau]] of Object.entries(DETECTEURS)) {
      assert.equal(m.states[id].state, etat, id);
      assert.deepEqual([ents.get(id).device, ents.get(id).area, devs.get(appareil).entry_type], [appareil, zone, null], id);
      if (pile) assert.deepEqual([m.states[pile].state, ents.get(pile).device], [String(niveau), appareil], pile);
    }
    const muette = m.states['binary_sensor.detecteur_fumee_entree'];
    assert.equal(Date.parse(muette.last_changed), Math.min(A(14, 5), t - 60 * MIN), 'muette depuis 14:05 — une heure au moins avant la démo quand elle s’ouvre plus tôt');
    assert.equal(muette.attributes.device_class, 'smoke', 'muette, elle garde sa classe : la carte sait de quoi il s’agit');
  }
});

test('§ 12, § 19.3 : Présence — le radar du bureau allumé, le salon vu par le journal il y a 3 minutes, l’entrée, et la caméra', () => {
  const t = A(20, 40);
  const m = maisonCapteursDemo({ quand: t });
  const { ents, devs } = registre(m);
  for (const [id, [etat, appareil, zone, classe]] of Object.entries(PRESENCE)) {
    assert.deepEqual([m.states[id].state, m.states[id].attributes.device_class, ents.get(id).device, ents.get(id).area], [etat, classe, appareil, zone], id);
    assert.equal(devs.get(appareil).entry_type, null, appareil + ' : physique');
  }
  const journal = m.journal();
  const salon = journal.filter(e => e.entity_id === 'binary_sensor.mouvement_salon');
  assert.deepEqual(salon.map(e => [e.state, Math.round((t / 1000 - e.when) / 6) / 10]), [['on', 2.9], ['off', 2.5]], 'le salon, il y a 3 minutes');
  assert.ok(journal.some(e => e.entity_id === 'binary_sensor.radar_bureau' && e.state === 'on' && Math.round(t / 1000 - e.when) === 47 * 60), 'le radar, depuis 47 minutes');
  assert.ok(journal.some(e => e.entity_id === 'binary_sensor.mouvement_entree' && e.state === 'off'), 'l’entrée, il y a deux heures');
  assert.ok(journal.every(e => typeof e.name === 'string' && e.name), 'chaque ligne porte son nom, traduit');
  // Le flux du journal de la démo garde les lignes de la caméra (ADR 0031) et y ajoute celles-ci.
  assert.ok(DEMO.includes("entity_id: 'binary_sensor.camera_entree_mouvement', state: 'on'") && DEMO.includes('...journalCapteursDemo(Date.now()),'));
});

test('C21, C28 : MeteoAlarm et le « Besoin eau » du basilic sont sans appareil — leur plateforme dite à l’index', () => {
  const m = maisonCapteursDemo({ quand: A(20, 40) });
  const { ents } = registre(m);
  const meteo = m.states['binary_sensor.meteoalarm'];
  assert.deepEqual([meteo.state, meteo.attributes.device_class, meteo.attributes.attribution], ['off', 'safety', 'Information provided by MeteoAlarm']);
  assert.deepEqual([ents.get('binary_sensor.meteoalarm').device, ents.get('binary_sensor.meteoalarm').area, ents.get('binary_sensor.meteoalarm').platform], [null, null, 'meteoalarm']);
  const eau = m.states['binary_sensor.basilic_besoin_eau'];
  assert.deepEqual([eau.state, eau.attributes.device_class], ['off', 'moisture']);
  assert.deepEqual([ents.get('binary_sensor.basilic_besoin_eau').device, ents.get('binary_sensor.basilic_besoin_eau').platform], [null, 'template']);
});

test('§ 12, C29 : le Dracaena Marginata, découvert — ses cinq capteurs sur son appareil, dans la zone « Technique », qui n’est pas une pièce', () => {
  const m = maisonCapteursDemo({ quand: A(20, 40) });
  const { idx, ents, devs } = registre(m);
  const CAPTEURS = { 'sensor.dracaena_marginata_humidite_du_sol': ['28', 'moisture', '%', null], 'sensor.dracaena_marginata_temperature': ['19.5', 'temperature', '°C', null],
    'sensor.dracaena_marginata_lumiere': ['84', 'illuminance', 'lx', null], 'sensor.dracaena_marginata_conductivite': ['784', 'conductivity', 'µS/cm', null],
    'sensor.dracaena_marginata_pile': ['100', 'battery', '%', 'diagnostic'] };
  for (const [id, [valeur, classe, unite, categorie]] of Object.entries(CAPTEURS)) {
    const a = m.states[id].attributes;
    assert.deepEqual([m.states[id].state, a.device_class, a.unit_of_measurement], [valeur, classe, unite], id);
    assert.deepEqual([ents.get(id).device, ents.get(id).area, ents.get(id).platform, ents.get(id).category], ['plante_dracaena', 'technique', 'xiaomi_ble', categorie], id + ' : son appareil');
  }
  const d = devs.get('plante_dracaena');
  assert.ok(d && d.entry_type === null && d.area === 'technique' && d.name === 'Dracaena Marginata', 'un appareil physique, nommé comme la plante');
  assert.ok(idx.areas.some(a => a.id === 'technique' && a.name === 'Technique'), 'la zone « Technique »');
  assert.ok(!m.pieces.some(p => p.room === 'Technique'), 'qui n’est pas une pièce de Loggia : rien ne s’affiche sous la plante');
  assert.ok(!DEMO.includes("['technique', 'Technique'"), 'pas une pièce de `PIECES` non plus');
});

test('§ 12, § 7.3 : le Schefflera, découvert et muet depuis samedi 14:05 ; ses statistiques portent le dernier relevé — sol à 12 %, pile à 4 %', () => {
  for (const t of [A(20, 40), new Date(2026, 9, 17, 9, 0).getTime()]) {
    const m = maisonCapteursDemo({ quand: t });
    const { ents } = registre(m);
    const samedi = new Date(t); samedi.setDate(samedi.getDate() - (((samedi.getDay() + 1) % 7) || 7)); samedi.setHours(14, 5, 0, 0);
    assert.equal(samedi.getDay(), 6, 'un samedi');
    assert.ok(samedi.getTime() < t, 'dans le passé');
    for (const id of ['sensor.schefflera_humidite_du_sol', 'sensor.schefflera_temperature', 'sensor.schefflera_lumiere', 'sensor.schefflera_conductivite', 'sensor.schefflera_pile']) {
      assert.equal(m.states[id].state, 'unavailable', id);
      assert.equal(Date.parse(m.states[id].last_changed), samedi.getTime(), id + ' : muet depuis samedi 14:05');
      assert.equal(ents.get(id).device, 'plante_schefflera', id);
    }
    assert.deepEqual([m.states['sensor.schefflera_humidite_du_sol'].attributes.device_class, m.states['sensor.schefflera_conductivite'].attributes.device_class], ['moisture', 'conductivity'],
      'muet, il garde ses classes : la plante se découvre encore');
    // Les statistiques à l'heure, dix jours : des relevés jusqu'à samedi 14:05, plus rien après ; le dernier dit le sol et la pile.
    const r = m.statistiques({ type: 'recorder/statistics_during_period', start_time: new Date(t - 10 * 86400000).toISOString(), statistic_ids: ['sensor.schefflera_humidite_du_sol', 'sensor.schefflera_pile'], period: 'hour', types: ['mean'] });
    const sol = r['sensor.schefflera_humidite_du_sol'], pile = r['sensor.schefflera_pile'];
    assert.ok(Array.isArray(sol) && sol.length > 24 && Array.isArray(pile) && pile.length === sol.length, 'des relevés à l’heure');
    assert.ok(sol.every(x => x.end <= samedi.getTime() && x.end - x.start === 3600000), 'rien après samedi 14:05');
    assert.deepEqual([sol[sol.length - 1].mean, pile[pile.length - 1].mean], [12, 4], 'le dernier relevé : sol 12 %, pile 4 %');
    assert.ok(sol[0].mean > sol[sol.length - 1].mean, 'le sol a séché');
  }
});

test('§ 12 : les piles — le bouton du salon à 14 % ; la batterie de la maison est celle d’Énergie ; le Basilic reste configuré, sans appareil', () => {
  const m = maisonCapteursDemo({ quand: A(20, 40) });
  const { ents, devs } = registre(m);
  assert.deepEqual([m.states['sensor.bouton_salon_pile'].state, m.states['sensor.bouton_salon_pile'].attributes.device_class, ents.get('sensor.bouton_salon_pile').device, devs.get('bouton_salon').area],
    ['14', 'battery', 'bouton_salon', 'salon']);
  assert.equal(m.states['sensor.batterie_niveau'].state, '78');
  /* ASSERTION MODIFIÉE (30/10, G3-E1) : la batterie de la maison vient du tableau Énergie de la démo — son niveau est le `stat_soc`
   * que Home Assistant nomme, et `resolveEnergy` en fait le rôle `batSoc`. */
  assert.ok(DEMO.includes("stat_soc: 'sensor.batterie_niveau'"), 'la batterie de la maison, le rôle `batSoc` d’Énergie');
  assert.ok(!ents.has('sensor.basilic_humidite_du_sol') && !ents.has('sensor.basilic_moisture'), 'le Basilic : une plante configurée (`loggia_plants`), sans appareil connu');
  assert.ok(DEMO.includes("loggia_plants: [{ base: 'sensor.basilic', name: etiquette('Basilic'), room: lieu('Cuisine') }],"));
});

test('§ 9 : l’histoire du jour des binaires, plusieurs d’un coup — chaque liste commence à minuit, avec son identifiant, et finit avant maintenant', () => {
  for (const t of [A(0, 30), A(9, 10), A(20, 40)]) {
    const m = maisonCapteursDemo({ quand: t });
    const ids = Object.keys(OUVRANTS);
    const r = m.historique('history/period/' + new Date(minuit(t)).toISOString() + '?filter_entity_id=' + encodeURIComponent(ids.join(',')) + '&minimal_response&no_attributes');
    assert.equal(r.length, ids.length, 'une liste par ouvrant');
    for (const l of r) {
      assert.ok(ids.includes(l[0].entity_id) && Date.parse(l[0].last_changed) === minuit(t), l[0].entity_id + ' : la première ligne, à minuit, nommée');
      assert.ok(l.every((p, i) => !i || !p.entity_id), 'les suivantes, sans identifiant (la forme minimale)');
      assert.ok(l.every(p => Date.parse(p.last_changed) <= t), 'rien dans le futur');
      assert.ok(l.every((p, i) => !i || p.state !== l[i - 1].state), 'chaque ligne est un changement');
      // La dernière ligne dit l'état du moment.
      assert.equal(l[l.length - 1].state, m.states[l[0].entity_id].state, l[0].entity_id + ' : l’histoire rejoint l’état');
    }
    const baie = r.find(l => l[0].entity_id === 'binary_sensor.baie_vitree');
    if (t === A(20, 40)) assert.deepEqual(baie.map(p => p.state), ['off', 'on', 'off', 'on'], 'la baie, ouverte ce matin, puis depuis 19:53');
    // La fumée de l'entrée : « off », puis muette à 14:05 — ou une heure avant la démo.
    const f = m.historique('history/period/' + new Date(minuit(t)).toISOString() + '?filter_entity_id=binary_sensor.detecteur_fumee_entree&minimal_response&no_attributes')[0];
    assert.deepEqual(f.map(p => p.state), t > A(1, 30) ? ['off', 'unavailable'] : ['unavailable'], 'muette depuis 14:05');
    // Les détecteurs de présence : le salon il y a 3 minutes, le radar depuis 47 minutes.
    const p = m.historique('history/period/' + new Date(minuit(t)).toISOString() + '?filter_entity_id=' + encodeURIComponent(Object.keys(PRESENCE).join(',')) + '&minimal_response&no_attributes');
    const salon = p.find(l => l[0].entity_id === 'binary_sensor.mouvement_salon');
    assert.equal(Date.parse(salon[salon.length - 1].last_changed), t - 2.5 * MIN, 'le salon, retombé il y a deux minutes et demie');
    // Le radar, allumé depuis 47 minutes — ou depuis minuit, quand la démo s'ouvre dans la nuit : rien avant le début du jour.
    const radar = p.find(l => l[0].entity_id === 'binary_sensor.radar_bureau');
    assert.deepEqual([radar[radar.length - 1].state, Date.parse(radar[radar.length - 1].last_changed)], ['on', Math.max(minuit(t), t - 47 * MIN)]);
  }
});

test('les noms de la démo : les appareils nouveaux parlent les six langues (aucun identifiant de l’installation d’origine : c’est `npm run audit` qui le garde)', () => {
  const noms = ['Contact porte entrée', 'Contact baie vitrée', 'Contact fenêtre salon', 'Contact fenêtre chambre', 'Contact porte de garage', 'Contact porte de service',
    'Détecteur de fuite évier', 'Radar bureau', 'Détecteur de mouvement salon', 'Détecteur de mouvement entrée', 'Bouton salon', 'Dracaena Marginata', 'Schefflera', 'MeteoAlarm',
    'Basilic besoin eau', 'pile', 'sabotage', 'humidité du sol', 'conductivité', 'lumière', 'Technique'];
  for (const n of noms) assert.ok(new RegExp("^  '" + n + "': \\{ en: '", 'm').test(DEMO), n + ' : son entrée dans les tables de la démo');
});
