// Resolution : de ce que la decouverte a trouve, aux entites que les vues lisent.
//
// L'ordre est le meme partout, et c'est lui qu'on protege ici :
//   choix explicite de l'utilisateur → decouverte → rien.
// « Rien » compte autant que le reste : une resolution qui invente une entite
// ferait afficher des tirets a la place d'un aveu franc.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveVacuum, resolveAlarm, resolveCameras, resolvePeople, resolveCovers,
  resolveClimate, resolveEnergy, resolveSystem, resolveWeather, resolveRooms,
  resolveMedia, resolveAll, fmtDuration, fmtArea, VACUUM_STATE_FR,
} from '../src/resolve.js';
import {
  emptyHome, simpleHome, threeVacuums, energyHome, systemHome, cameraHome,
  mediaHome, ctxOf,
} from './fixtures.mjs';

// ── Mise en forme ────────────────────────────────────────────────────────────

test('durees : le capteur natif rend un nombre, la vue affiche un temps', () => {
  assert.equal(fmtDuration('55.0'), '55 min');
  assert.equal(fmtDuration('90'), '1 h 30');
  assert.equal(fmtDuration('120'), '2 h');
  assert.equal(fmtDuration('indisponible'), null);
  assert.equal(fmtDuration(null), null);
});

test('surfaces : l’unite est ajoutee, jamais inventee', () => {
  assert.equal(fmtArea('55'), '55 m²');
  assert.equal(fmtArea('54.6'), '55 m²');
  assert.equal(fmtArea(null), null);
});

test('etats d’aspirateur : traduits, et jamais inventes', () => {
  assert.equal(VACUUM_STATE_FR.docked, 'Sur la base');
  assert.equal(VACUUM_STATE_FR.cleaning, 'Nettoyage');
  assert.equal(VACUUM_STATE_FR.inconnu_de_ha, undefined);
});

// ── Installation vide : tout doit se taire proprement ────────────────────────

test('installation vide : chaque resolveur se declare indisponible avec un motif', () => {
  const r = resolveAll(ctxOf(emptyHome()));
  ['vacuum', 'alarm', 'cameras', 'people', 'covers', 'climate', 'energy', 'system', 'weather'].forEach(k => {
    assert.equal(r[k].available, false, k + ' devrait etre indisponible');
    assert.equal(typeof r[k].reason, 'string', k + ' : motif manquant');
  });
  assert.deepEqual(r.rooms.suggested, []);
});

// ── Aspirateur ───────────────────────────────────────────────────────────────

test('aspirateur : le premier trouve, avec les capteurs de SON appareil', () => {
  const v = resolveVacuum(ctxOf(threeVacuums()));
  assert.equal(v.available, true);
  assert.equal(v.main, 'vacuum.alpha');
  assert.equal(v.battery, 'sensor.alpha_batterie');
  assert.equal(v.area_cleaned, 'sensor.alpha_surface');
  assert.equal(v.duration, 'sensor.alpha_duree');
  assert.equal(v.map, 'image.alpha_carte');
  assert.equal(v.state, 'cleaning');
  assert.equal(v.batteryLevel, 90);
  assert.equal(v.choices.length, 3, 'les trois aspirateurs restent proposables');
});

test('aspirateur : le choix de l’utilisateur l’emporte, capteurs compris', () => {
  const v = resolveVacuum(ctxOf(threeVacuums(), { loggia_vacuum_entity: 'vacuum.gamma' }));
  assert.equal(v.main, 'vacuum.gamma');
  assert.equal(v.battery, 'sensor.gamma_batterie');
  assert.equal(v.batteryLevel, 70);
  assert.ok(v.map.indexOf('alpha') < 0, 'aucun capteur ne doit venir d’un autre appareil');
});

test('aspirateur : une surcharge explicite prime sur la decouverte', () => {
  const v = resolveVacuum(ctxOf(threeVacuums(), { loggia_vacuum: { battery: 'sensor.beta_batterie' } }));
  assert.equal(v.main, 'vacuum.alpha');
  assert.equal(v.battery, 'sensor.beta_batterie', 'la surcharge doit etre respectee telle quelle');
});

test('aspirateur : la mise en forme reste au frontend, pas au capteur', () => {
  const fx = threeVacuums();
  const v = resolveVacuum(ctxOf(fx));
  // Le capteur natif dit « 55 » ; c'est la vue qui en fait « 55 min ».
  assert.equal(fx.states[v.duration].state, '55');
  assert.equal(fmtDuration(fx.states[v.duration].state), '55 min');
  assert.equal(fmtArea(fx.states[v.area_cleaned].state), '40 m²');
});

// ── Securite ─────────────────────────────────────────────────────────────────

test('cameras : un appareil, trois flux, une seule fiche', () => {
  const c = resolveCameras(ctxOf(cameraHome()));
  assert.equal(c.available, true);
  assert.equal(c.list.length, 1, 'les flux secondaires du meme appareil sont ecartes');
  assert.equal(c.list[0].name, 'Caméra entrée');
});

test('cameras : un flux hors service n est pas celui qu on presente', () => {
  // Releve sur une installation reelle : des trois flux d'une camera, le seul
  // « haute definition » etait indisponible pendant que les deux autres
  // enregistraient. Retenir le premier venu affichait donc une image morte.
  const maison = cameraHome();
  maison.states['camera.entree_high'] = {
    entity_id: 'camera.entree_high', state: 'unavailable',
    attributes: { friendly_name: 'Caméra entrée haute définition' },
  };
  const c = resolveCameras(ctxOf(maison));
  assert.equal(c.list.length, 1);
  assert.notEqual(c.list[0].id, 'camera.entree_high', 'un flux muet ne doit pas etre retenu');
  assert.equal(c.list[0].streams.length, 3, 'les autres flux restent accessibles');
});

test('cameras : les detecteurs viennent des binary_sensor du meme appareil', () => {
  const cam = resolveCameras(ctxOf(cameraHome())).list[0];
  assert.equal(cam.motion, 'binary_sensor.entree_motion');
  assert.equal(cam.person, 'binary_sensor.entree_personne_detectee');
  assert.equal(cam.sonnette, 'binary_sensor.entree_sonnette');
  assert.equal(cam.vehicle, null, 'un detecteur absent vaut null, pas un identifiant invente');
  assert.equal(cam.colis, null);
});

test('cameras : la liste de l’utilisateur fait foi, et reçoit ses détecteurs', () => {
  // Le formulaire ne demande qu'un nom et une entité. Sans complément, la
  // caméra choisie arriverait sans détecteurs ni libellé — et la vue
  // l'ignorerait au profit d'une autre source. C'est ce qui se passait.
  const mine = [{ id: 'cam_0', name: 'Mon entrée', online: true, haid: 'camera.entree_high' }];
  const c = resolveCameras(ctxOf(cameraHome(), { loggia_cameras: mine }));
  assert.equal(c.source, 'utilisateur');
  assert.equal(c.list.length, 1);
  const cam = c.list[0];
  assert.equal(cam.haid, 'camera.entree_high');
  assert.equal(cam.label, 'Mon entrée', 'le nom saisi sert aussi de libellé');
  assert.equal(cam.motion, 'binary_sensor.entree_motion');
  assert.equal(cam.sonnette, 'binary_sensor.entree_sonnette');
  assert.equal(cam.vehicle, null, 'un détecteur absent reste null');
});

test('cameras : un détecteur désigné à la main n’est jamais écrasé', () => {
  const mine = [{ haid: 'camera.entree_high', label: 'Entrée', motion: 'binary_sensor.a_moi' }];
  const cam = resolveCameras(ctxOf(cameraHome(), { loggia_cameras: mine })).list[0];
  assert.equal(cam.motion, 'binary_sensor.a_moi');
});

test('cameras : une liste vidée ne ressuscite pas une ancienne configuration', () => {
  const c = resolveCameras(ctxOf(cameraHome(), { loggia_cameras: [] }));
  assert.equal(c.source, 'decouverte');
});

test('alarme : trouvee par domaine, avec ses autres candidats', () => {
  const a = resolveAlarm(ctxOf(cameraHome()));
  assert.equal(a.available, true);
  assert.equal(a.main, 'alarm_control_panel.maison');
  assert.equal(a.choices.length, 1);
});

test('presence : le domaine person suffit, aucune configuration', () => {
  const p = resolvePeople(ctxOf(cameraHome()));
  assert.equal(p.available, true);
  assert.deepEqual(p.list.map(x => x.name).sort(), ['Alex', 'Sam']);
  assert.ok(p.list.every(x => x.haid.indexOf('person.') === 0));
});

// ── Lecteurs multimedia ──────────────────────────────────────────────────────

test('media : une enceinte exposee deux fois n’apparait qu’une, avec son compagnon', () => {
  const m = resolveMedia(ctxOf(mediaHome()));
  assert.equal(m.available, true);
  assert.equal(m.list.length, 2, 'deux appareils, pas trois entites');
  const echo = m.list.find(x => x.haid.indexOf('echo') >= 0);
  assert.equal(echo.ma, 'media_player.sejour_echo_salon', 'le compagnon est l’entite du meme appareil');
});

test('media : un lecteur seul n’invente pas de compagnon', () => {
  const ampli = resolveMedia(ctxOf(mediaHome())).list.find(x => x.haid === 'media_player.ampli');
  assert.equal(ampli.ma, null);
  assert.equal(ampli.area, 'Bureau');
});

test('media : une configuration ancienne se voit completer son compagnon', () => {
  // Cas reel : le suffixe `_2` ecrit autrefois en dur ne correspond plus a rien.
  const mine = [{ id: 'echo', name: 'Echo', haid: 'media_player.echo_salon', ma: null }];
  const m = resolveMedia(ctxOf(mediaHome(), { loggia_medias: mine }));
  assert.equal(m.source, 'utilisateur');
  assert.equal(m.list[0].ma, 'media_player.sejour_echo_salon');
});

test('media : aucun lecteur, aucune invention', () => {
  const m = resolveMedia(ctxOf(emptyHome()));
  assert.equal(m.available, false);
  assert.match(m.reason, /media_player/);
});

// ── Volets et chauffage ──────────────────────────────────────────────────────

test('volets : tout le domaine cover, nomme par Home Assistant', () => {
  const c = resolveCovers(ctxOf(simpleHome()));
  assert.equal(c.available, true);
  assert.equal(c.list.length, 1);
  assert.equal(c.list[0].id, 'cover.salon');
  assert.equal(c.list[0].name, 'Volet séjour');
});

test('chauffage : le thermostat porte le NOM de sa piece, pas son identifiant', () => {
  const z = resolveClimate(ctxOf(simpleHome())).list[0];
  assert.equal(z.haid, 'climate.chambre');
  assert.equal(z.room, 'Chambre', 'un area_id ne correspondrait a aucune piece configuree');
  assert.equal(z.type, 'thermostat');
  assert.equal(z.hasAuto, false);
});

test('chauffage : le capteur de temperature vient de l’appareil', () => {
  assert.equal(resolveClimate(ctxOf(simpleHome())).list[0].tempSensor, 'sensor.chambre_temperature');
});

test('chauffage : une configuration decrit ce qu’aucune convention ne devine', () => {
  // Un radiateur fil pilote n'est pas un thermostat : switch + consigne + mode.
  const mine = [{ id: 'pilote', haid: 'switch.radiateur', tempCible: 'input_number.consigne', hasAuto: true }];
  const c = resolveClimate(ctxOf(simpleHome(), { loggia_climate: mine }));
  assert.equal(c.source, 'utilisateur');
  assert.deepEqual(c.list, mine);
});

// ── Energie ──────────────────────────────────────────────────────────────────

test('energie : sans tableau de bord natif, on le dit au lieu de deviner', () => {
  const fx = energyHome();
  fx.energyPrefs = null;
  const e = resolveEnergy(ctxOf(fx));
  assert.equal(e.available, false);
  assert.match(e.reason, /Energie/);
  assert.deepEqual(e.haids, {});
});

test('energie : le tableau de bord natif nomme compteur, injection et solaire', () => {
  const e = resolveEnergy(ctxOf(energyHome()));
  assert.equal(e.available, true);
  assert.equal(e.haids.consoJour, 'sensor.compteur_energie');
  assert.equal(e.haids.coutJour, 'sensor.compteur_cout');
  assert.equal(e.haids.injectionJour, 'sensor.compteur_injection');
  assert.equal(e.haids.prodJour, 'sensor.pv_energie');
});

test('energie : la puissance instantanee vient du meme appareil que la statistique', () => {
  const e = resolveEnergy(ctxOf(energyHome()));
  assert.equal(e.haids.gridNow, 'sensor.compteur_puissance');
  assert.equal(e.haids.solarNow, 'sensor.pv_puissance');
});

test('energie : les appareils suivis viennent des preferences, avec leur puissance', () => {
  const e = resolveEnergy(ctxOf(energyHome()));
  assert.equal(e.devices.length, 1);
  assert.deepEqual(e.devices[0], { name: 'Prise bureau', kwh: 'sensor.prise_energie', power: 'sensor.prise_puissance' });
});

test('energie : une configuration explicite court-circuite les preferences', () => {
  const mine = { consoJour: 'sensor.a_moi' };
  const e = resolveEnergy(ctxOf(energyHome(), { loggia_energy: mine }));
  assert.equal(e.source, 'utilisateur');
  assert.deepEqual(e.haids, mine);
});

// ── Systeme ──────────────────────────────────────────────────────────────────

test('systeme : une machine se reconnait a sa charge processeur en pourcentage', () => {
  const s = resolveSystem(ctxOf(systemHome()));
  assert.equal(s.available, true);
  assert.equal(s.hosts.length, 1);
  const h = s.hosts[0];
  assert.equal(h.name, 'Serveur maison');
  assert.equal(h.cpu, 'sensor.processor_use');
  assert.equal(h.memPct, 'sensor.memory_use_percent');
  assert.equal(h.disk, 'sensor.disk_use_percent_data');
  assert.equal(h.temp, 'sensor.processor_temperature');
  assert.equal(h.uptime, 'sensor.last_boot');
  assert.equal(h.online, 'binary_sensor.hote_en_ligne');
});

test('systeme : une maison sans serveur ne fabrique pas de machine', () => {
  const s = resolveSystem(ctxOf(simpleHome()));
  assert.equal(s.available, false);
  assert.deepEqual(s.hosts, []);
});

// ── Meteo et pieces ──────────────────────────────────────────────────────────

test('meteo : aucune entite weather, aucune invention', () => {
  assert.equal(resolveWeather(ctxOf(simpleHome())).available, false);
});

test('pieces : une zone n’est proposee que si elle est habitee', () => {
  const r = resolveRooms(ctxOf(simpleHome()));
  assert.equal(r.source, 'decouverte');
  assert.deepEqual(r.suggested.map(a => a.name).sort(), ['Chambre', 'Séjour']);
  assert.deepEqual(r.technical.map(a => a.name), ['Réseau']);
});

test('pieces : les capteurs d’ambiance de la zone accompagnent la proposition', () => {
  const salon = resolveRooms(ctxOf(simpleHome())).suggested.find(a => a.name === 'Séjour');
  assert.equal(salon.temp, 'sensor.salon_temperature');
  assert.equal(salon.hum, 'sensor.salon_humidite');
  assert.equal(salon.co2, null);
});

test('pieces : un choix explicite fait foi, mais les zones restent proposees', () => {
  // Les propositions ne disparaissent pas : l'ecran de premier lancement doit
  // pouvoir cocher, et une configuration ancienne — de simples noms — y
  // retrouve ses capteurs d'ambiance.
  const mine = [{ room: 'Atelier', haid: { temp: null, humidity: null, co2: null } }];
  const r = resolveRooms(ctxOf(simpleHome(), { loggia_rooms: mine }));
  assert.equal(r.source, 'utilisateur');
  assert.deepEqual(r.rooms, mine);
  assert.deepEqual(r.suggested.map(a => a.name).sort(), ['Chambre', 'Séjour']);
});

test('pieces : sans registre de zones, la configuration survit quand meme', () => {
  const mine = [{ room: 'Atelier', haid: { temp: null, humidity: null, co2: null } }];
  const r = resolveRooms({ index: null, states: {}, userCfg: { loggia_rooms: mine } });
  assert.equal(r.source, 'utilisateur');
  assert.deepEqual(r.rooms, mine);
  assert.deepEqual(r.suggested, []);
});

// ── Vue d'ensemble ───────────────────────────────────────────────────────────

test('resolveAll couvre tous les domaines', () => {
  const r = resolveAll(ctxOf(simpleHome()));
  assert.deepEqual(Object.keys(r).sort(),
    ['alarm', 'cameras', 'climate', 'covers', 'energy', 'media', 'people', 'rooms', 'system', 'vacuum', 'weather']);
});

test('contexte vide ou incomplet : rien ne plante', () => {
  assert.equal(resolveVacuum().available, false);
  assert.equal(resolveAlarm({}).available, false);
  assert.equal(resolveCameras({ caps: {} }).available, false);
  assert.equal(resolveSystem({ states: {} }).available, false);
  assert.equal(resolveEnergy({}).available, false);
});
