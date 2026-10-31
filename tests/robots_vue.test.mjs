// v3.43.0 (ADR 0042) — « pour les robots aspirateur et tondeuse » : une vue par
// robot, en onglets (accueil, zones, historique, entretien, réglages), d'après
// quinze maquettes. Tout ce qui se calcule vit dans `src/robots.js` et se teste
// ici à sec ; le branchement se relit dans les sources.
//
// (tests/robots.test.mjs, lui, garde la FICHE des robots : le cadran, la
// couleur qui dit l'état. La même règle de couleur vaut pour l'anneau d'ici.)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MONOLITHE } from './monolithe.mjs'; // App.jsx et ce qui en sort (ADR 0282)
// La langue de la machine ne doit pas changer le résultat (garde-fou de la CI).
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true });
/* ASSERTION MODIFIÉE (chantier IoT, tâche 1, 18/10 ; § 12) : ce que la popup seule calcule — les sœurs, l'entretien, les sessions,
 * les réglages, la fiche technique — a quitté `robots.js` (au démarrage) pour `robotsfiche.js` (à la demande). Les deux modules
 * se lisent ensemble : chaque fonction est la même, à sa nouvelle adresse. */
const R = { ...(await import('../src/robots.js')), ...(await import('../src/robotsfiche.js')) };

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const NL = String.fromCharCode(10);
const bloc = (src, debut, fin) => { const d = src.indexOf(debut); assert.ok(d >= 0, debut + ' introuvable'); const f = src.indexOf(fin, d + 1); return src.slice(d, f < 0 ? undefined : f); };

/** Une sœur, telle que `decrireSoeurs` la rend. */
const soeur = (id, etat, x = {}) => ({
  id, domaine: id.split('.')[0], objet: id.split('.')[1], cle: x.cle || null, categorie: x.categorie || null, classe: x.classe || null,
  unite: x.unite || null, etat: String(etat), attributs: x.attributs || {}, plateforme: x.plateforme || null, nom: x.nom || id,
  texte: ((x.cle || '') + ' ' + id.split('.')[1]).toLowerCase(),
});

test('la phase, le mot et le geste d’un robot', () => {
  assert.equal(R.phaseRobot('vacuum', 'cleaning'), 'travail');
  assert.equal(R.phaseRobot('lawn_mower', 'mowing'), 'travail');
  assert.equal(R.phaseRobot('vacuum', 'paused'), 'pause');
  assert.equal(R.phaseRobot('vacuum', 'returning'), 'retour');
  assert.equal(R.phaseRobot('vacuum', 'docked'), 'base');
  assert.equal(R.phaseRobot('vacuum', 'error'), 'erreur');
  assert.equal(R.phaseRobot('vacuum', 'idle'), 'repos');
  for (const vide of ['unavailable', 'unknown', '', null, undefined]) assert.equal(R.phaseRobot('vacuum', vide), 'absent');
  /* ASSERTION MODIFIÉE (chantier IoT, tâche 8, 18/10 ; I16, § 7.6) : le mot d'état de la fiche et sa puce principale suivent sa maquette
   * (1b). `motEtatRobot` (« À la base », « Injoignable ») et `actionPrincipale` (« Démarrer · 1 zone ») partent : le mot et sa phrase
   * viennent d'`etatAccueil`, la puce principale nomme ce qu'elle fait (`libelleDepart`) ; la pause, la reprise et la base passent par
   * les puces de la carte (`commandesRobot`, tests/robots_carte.test.mjs). */
  const T = new Date(2026, 8, 17, 18, 0).getTime();
  const e = (x) => R.etatAccueil({ maintenant: T, ...x });
  // ASSERTION MODIFIÉE (passe bis du 18/10, point 13) : au repos, le mot d'état prend l'encre de sa maquette, `--o-text` (`stateInk`), pas `--o-text1`.
  assert.deepEqual(e({ phase: 'base', charge: true, choisir: true }), { mot: 'Sur la base · en charge', encre: 'var(--o-text)', phrase: 'Choisissez où, ou lancez tout.' });
  assert.equal(e({ phase: 'base' }).phrase, null, '« en charge » ne se dit que si un capteur le dit ; sans « Où », rien à choisir');
  const a1640 = new Date(2026, 8, 17, 16, 40).getTime();
  assert.deepEqual(e({ phase: 'travail', pieces: ['Salon', 'Cuisine'], surface: 42, depuis: a1640 }), { mot: 'Nettoyage en cours', encre: 'var(--o-accent-soft)', phrase: 'Salon, Cuisine · 42 m² depuis 16:40' });
  assert.equal(e({ phase: 'travail', pieces: ['Salon'], depuis: a1640 }).phrase, 'Salon · depuis 16:40', 'sans capteur de surface');
  assert.equal(e({ phase: 'travail', depuis: a1640 }).phrase, 'depuis 16:40', 'les pièces ne se savent pas : rien ne s’invente');
  assert.deepEqual(e({ domaine: 'lawn_mower', phase: 'travail', tout: true, surface: 140, depuis: a1640 }), { mot: 'Tonte en cours', encre: 'var(--o-ok)', phrase: 'Tout le jardin · 140 m² depuis 16:40' });
  assert.equal(e({ phase: 'pause', pieces: ['Salon', 'Cuisine'], surface: 42 }).phrase, 'Salon, Cuisine · 42 m² faits');
  assert.deepEqual(e({ phase: 'retour' }), { mot: 'Retour à la base', encre: 'var(--o-text)', phrase: 'Il rentre se recharger' }); // ASSERTION MODIFIÉE (passe bis du 18/10, point 13) : `--o-text`, sa maquette
  assert.deepEqual(e({ phase: 'base', bipe: true }), { mot: 'Il bipe', encre: 'var(--o-accent-soft)', phrase: 'Suivez le son' });
  assert.deepEqual(e({ phase: 'erreur', erreur: 'Brosse coincée' }), { mot: 'En erreur', encre: 'var(--o-bad)', phrase: 'Brosse coincée' });
  assert.deepEqual(e({ phase: 'absent', depuis: new Date(2026, 8, 17, 14, 20).getTime() }), { mot: 'Indisponible', encre: 'var(--o-text2)', phrase: 'Depuis 14:20' }, 'muet : sans rouge, le liseré le dit');
  assert.equal(e({ phase: 'repos', choisir: true }).mot, 'À l’arrêt');
  assert.deepEqual([R.libelleDepart('vacuum', 0), R.libelleDepart('vacuum', 1), R.libelleDepart('vacuum', 2)], ['Nettoyer tout le logement', 'Nettoyer 1 pièce', 'Nettoyer 2 pièces']);
  assert.deepEqual([R.libelleDepart('lawn_mower', 0), R.libelleDepart('lawn_mower', 1), R.libelleDepart('lawn_mower', 3)], ['Tondre tout le jardin', 'Tondre 1 zone', 'Tondre 3 zones']);
  assert.equal(R.serviceRetour('vacuum'), 'return_to_base');
  assert.equal(R.serviceRetour('lawn_mower'), 'dock');
});

test('les sœurs d’un robot : celles de SON appareil, décrites une fois', () => {
  const meta = new Map([
    ['vacuum.robot', { deviceId: 'd1', device: 'Robot', platform: 'ecovacs' }],
    ['sensor.robot_temps_restant_filtre', { deviceId: 'd1', device: 'Robot', platform: 'ecovacs', translationKey: 'lifespan_filter', category: 'diagnostic' }],
    ['sensor.robot_cache', { deviceId: 'd1', device: 'Robot', hidden: true }],
    ['sensor.robot_eteint', { deviceId: 'd1', device: 'Robot', disabled: true }],
    ['sensor.robot_sans_etat', { deviceId: 'd1', device: 'Robot' }],
    ['sensor.autre_appareil', { deviceId: 'd2', device: 'Autre' }],
  ]);
  const states = {
    'vacuum.robot': { state: 'docked', attributes: {} },
    'sensor.robot_temps_restant_filtre': { state: '32', attributes: { friendly_name: 'Robot Temps restant filtre', unit_of_measurement: '%' } },
    'sensor.robot_cache': { state: '1', attributes: {} }, 'sensor.robot_eteint': { state: '1', attributes: {} }, 'sensor.autre_appareil': { state: '1', attributes: {} },
  };
  const s = R.decrireSoeurs({ entityMeta: meta }, states, 'vacuum.robot');
  assert.deepEqual(s.map(x => x.id), ['sensor.robot_temps_restant_filtre'], 'ni le robot lui-même, ni le caché, ni le désactivé, ni l’absent des états, ni l’autre appareil');
  assert.equal(s[0].nom, 'Temps restant filtre', 'le nom de l’appareil ne se répète pas');
  assert.equal(s[0].cle, 'lifespan_filter');
  assert.equal(s[0].texte, 'lifespan_filter robot_temps_restant_filtre', 'la clé et l’identifiant, sans accents : ce que les motifs regardent');
  assert.equal(s[0].unite, '%'); assert.equal(s[0].plateforme, 'ecovacs'); assert.equal(s[0].categorie, 'diagnostic');
  assert.deepEqual(R.decrireSoeurs({ entityMeta: meta }, states, 'vacuum.inconnu'), []);
  const sansAppareil = new Map([['vacuum.yaml', {}], ['sensor.yaml_aussi', {}]]);
  assert.deepEqual(R.decrireSoeurs({ entityMeta: sansAppareil }, { 'vacuum.yaml': { state: 'docked', attributes: {} }, 'sensor.yaml_aussi': { state: '1', attributes: {} } }, 'vacuum.yaml'), [],
    'une entité sans appareil n’a pas de sœurs — surtout pas toutes les autres entités sans appareil');
  assert.deepEqual(R.decrireSoeurs(null, states, 'vacuum.robot'), []);
});

test('la batterie et la charge : l’attribut d’abord, le capteur ensuite, rien sinon', () => {
  /* ASSERTION MODIFIÉE (chantier IoT, tâche 8, 18/10 ; I15) : la fiche reçoit la vue de la carte (`useVueRobot`, App.jsx), qui lit la
   * batterie et la charge — `batterieRobot` et `enCharge` partent avec la lecture que la fiche faisait d'elle-même. La règle ne change
   * pas : l'attribut d'abord, la sœur `battery` ensuite, la charge seulement si un capteur `battery_charging` le dit.
   * ASSERTION MODIFIÉE (passe bis du 18/10, point 8) : ce test lisait des CHAÎNES d'App.jsx, et la borne de 0 à 100 s'était perdue —
   * un attribut vide (« ») se lisait 0 %. Il redevient un test de COMPORTEMENT : `batterieRobot` (robots.js), ce que la vue lit. */
  assert.equal(R.batterieRobot({ battery_level: 92 }), 92, 'l’attribut d’abord');
  assert.equal(R.batterieRobot({ battery_level: '64.4' }), 64);
  assert.equal(R.batterieRobot({ battery_level: 92 }, '10'), 92, 'l’attribut passe avant la sœur');
  assert.deepEqual([R.batterieRobot({ battery_level: 130 }), R.batterieRobot({ battery_level: -4 })], [100, 0], 'bornée de 0 à 100');
  assert.equal(R.batterieRobot({ battery_level: '' }), null, 'vide : inconnue, pas 0 %');
  assert.equal(R.batterieRobot({ battery_level: 'abc' }), null, 'pas un nombre : inconnue');
  assert.equal(R.batterieRobot({}, '45.6'), 46, 'la sœur ensuite');
  assert.equal(R.batterieRobot({ battery_level: '' }, '45'), 45, 'un attribut illisible laisse parler la sœur');
  assert.deepEqual([R.batterieRobot({}, 'unavailable'), R.batterieRobot({}, ''), R.batterieRobot(null, null)], [null, null, null], 'rien sinon');
  // Que la carte la lise ainsi — sa sœur `battery`, sa charge — se JOUE dans tests/carte_robot.test.mjs (point 8).
});

test('nettoyer des pièces : la commande de l’intégration, ou rien', () => {
  /* ASSERTION MODIFIÉE (tranche robots 2, 19/10 ; R1, R4) : deebot-client 18 (HA ≥ 2026.3) attend une LISTE — « 1,3 » y devenait
   * « 1,,,3 » — ; la chaîne reste pour un Home Assistant d'avant 2026.3 ; chez Ecovacs, le bit CLEAN_AREA conditionne `spot_area`. */
  assert.deepEqual(R.commandeZones({ plateforme: 'ecovacs', idRobot: 'vacuum.r', segments: [1, '3'], bits: 16384 }),
    { domaine: 'vacuum', service: 'send_command', data: { entity_id: 'vacuum.r', command: 'spot_area', params: { rooms: [1, 3], cleanings: 1 } } });
  assert.deepEqual(R.commandeZones({ plateforme: 'ecovacs', idRobot: 'vacuum.r', segments: [1, '3'], versionHa: '2026.2.0' }).data.params, { rooms: '1,3', cleanings: 1 });
  assert.deepEqual(R.commandeZones({ plateforme: 'roborock', idRobot: 'vacuum.r', segments: [16, 17] }).data, { entity_id: 'vacuum.r', command: 'app_segment_clean', params: [16, 17] });
  assert.deepEqual(R.commandeZones({ plateforme: 'dreame_vacuum', services: { dreame_vacuum: { vacuum_clean_segment: {} } }, idRobot: 'vacuum.r', segments: [2] }),
    { domaine: 'dreame_vacuum', service: 'vacuum_clean_segment', data: { entity_id: 'vacuum.r', segments: [2] } });
  assert.equal(R.commandeZones({ plateforme: 'dreame_vacuum', services: { dreame_vacuum: { autre: {} } }, idRobot: 'vacuum.r', segments: [2] }), null, 'le service n’existe pas chez lui : pas de commande au hasard');
  assert.equal(R.commandeZones({ plateforme: 'xiaomi_miio', services: null, idRobot: 'vacuum.r', segments: [2] }).service, 'vacuum_clean_segment', 'sans liste de services, on se fie à la plateforme');
  assert.equal(R.commandeZones({ plateforme: 'inconnue', idRobot: 'vacuum.r', segments: [1] }), null);
  assert.equal(R.commandeZones({ plateforme: 'ecovacs', idRobot: 'vacuum.r', segments: [] }), null);
  assert.equal(R.commandeZones({ plateforme: 'ecovacs', idRobot: 'vacuum.r', segments: ['x'] }), null);
  assert.equal(R.commandeZones({ plateforme: 'ecovacs', idRobot: null, segments: [1] }), null);
});

test('les zones d’une tondeuse sont des interrupteurs de son appareil', () => {
  const z = R.zonesTondeuse([
    soeur('switch.t_zone_pelouse_avant', 'off', { cle: 'area', nom: 'Zone Pelouse avant' }),
    soeur('switch.lawn_area_1_2', 'on', { nom: 'Area 1 2' }),
    soeur('switch.t_pluie', 'on', { cle: 'rain_detection', nom: 'Détection de pluie' }),
    soeur('switch.t_zone_morte', 'unavailable', { cle: 'area', nom: 'Zone morte' }),
    soeur('sensor.t_zone', 210, { cle: 'area', unite: 'm²' }),
  ]);
  assert.deepEqual(z, [{ id: 'switch.t_zone_pelouse_avant', nom: 'Pelouse avant', actif: false }, { id: 'switch.lawn_area_1_2', nom: '1 2', actif: true }]);
  assert.deepEqual(R.zonesTondeuse([]), []);
});

test('les pièces d’usure : un % est une jauge ; des heures n’en sont une que si le total est connu', () => {
  // Un aspirateur dont les identifiants sont en FRANÇAIS : seule la clé de traduction les reconnaît.
  const asp = [
    soeur('sensor.r_duree_de_vie_de_la_brosse_laterale', 81, { cle: 'lifespan_side_brush', unite: '%' }),
    soeur('sensor.r_temps_restant_brosse_principale', 58, { cle: 'lifespan_brush', unite: '%' }),
    soeur('sensor.r_temps_restant_filtre', 32, { cle: 'lifespan_filter', unite: '%' }),
    soeur('sensor.r_round_mop_lifespan', 47, { cle: 'lifespan_round_mop', unite: '%' }),
    soeur('sensor.r_unit_care_lifespan', 'unavailable', { cle: 'lifespan_unit_care', unite: '%' }),
    soeur('button.r_reinitialiser_le_filtre', 'unknown', { cle: 'reset_lifespan_filter' }),
    soeur('button.r_reset_brosse', 'unavailable', { cle: 'reset_lifespan_brush' }),
    soeur('binary_sensor.r_serpilliere_fixee', 'on', { cle: 'water_mop_attached' }),
    soeur('number.r_seuil_du_filtre', 20, { cle: 'filter_alert_threshold', unite: '%' }), // un réglage, pas une mesure
  ];
  // ASSERTION MODIFIÉE (chantier IoT, tâche 9, 18/10 ; I20) : les seuils de sa maquette — bas sous 15 %, moyen sous 35 % : le filtre à 32 % est « moyen », 58 et 47 sont « bons ».
  assert.deepEqual(R.piecesUsure(asp).map(p => [p.role, p.nom, p.pct, p.niveau, p.reset]), [
    ['filtre', 'Filtre', 32, 'moyen', 'button.r_reinitialiser_le_filtre'],
    ['brosse_principale', 'Brosse principale', 58, 'bon', null],
    ['brosse_laterale', 'Brosse latérale', 81, 'bon', null],
    ['serpilliere', 'Serpillière', 47, 'bon', null],
  ], 'l’ordre de lecture des maquettes ; un bouton « unknown » compte (jamais pressé), un « unavailable » non ; un capteur indisponible ne se dessine pas');

  // Une tondeuse : les lames s’usent en HEURES, avec un seuil d’alerte.
  const tond = [
    soeur('sensor.t_duree_d_utilisation_de_la_lame', 43, { cle: 'blade_used_time', unite: 'h' }),
    soeur('sensor.t_temps_d_avertissement', 60, { cle: 'blade_used_warn_time', unite: 'h' }),
    soeur('sensor.t_hauteur_des_lames', 40, { cle: 'blade_height', unite: 'mm' }),
    soeur('number.t_hauteur_des_lames', 40, { cle: 'blade_height', unite: 'mm' }),
  ];
  // ASSERTION MODIFIÉE (chantier IoT, tâche 9, 18/10 ; I20) : des lames à 28 % sont « moyennes » (l'ambre), plus « basses ».
  assert.deepEqual(R.piecesUsure(tond), [{ id: 'sensor.t_duree_d_utilisation_de_la_lame', role: 'lames', nom: 'Lames', pct: 28, texte: '43 h sur 60 h', niveau: 'moyen', reset: null }], 'la hauteur de coupe n’est pas une usure');
  assert.equal(R.piecesUsure([soeur('sensor.t_usage', 70, { cle: 'blade_used_time', unite: 'h' }), soeur('sensor.t_seuil', 60, { cle: 'blade_used_warn_time', unite: 'h' })])[0].pct, 0, 'au-delà du seuil : 0 %, pas un négatif');
  assert.equal(R.piecesUsure([soeur('sensor.t_hauteur_lame', 40, { cle: 'blade_height_pct', unite: '%' })]).length, 0, 'une hauteur en % n’est pas une usure non plus');

  // Des heures RESTANTES : jauge si le fabricant documente la durée de vie, sinon le temps seul.
  const roborock = R.piecesUsure([soeur('sensor.r_filter_time_left', 270000, { cle: 'filter_time_left', unite: 's', plateforme: 'roborock' })]);
  assert.deepEqual([roborock[0].pct, roborock[0].texte], [50, '75 h restantes'], '75 h sur les 150 h d’un filtre');
  const laterale = R.piecesUsure([soeur('sensor.r_side_brush_time_left', 360000, { cle: 'side_brush_time_left', unite: 's', plateforme: 'roborock' })]);
  assert.deepEqual([laterale[0].role, laterale[0].pct], ['brosse_laterale', 50], '« side_brush » est la brosse LATÉRALE (100 h sur 200) : « brush » seul ne la prend pas');
  const inconnu = R.piecesUsure([soeur('sensor.x_filter_left', 75, { cle: 'filter_left', unite: 'h', plateforme: 'autre' })]);
  assert.deepEqual([inconnu[0].pct, inconnu[0].niveau, inconnu[0].texte], [null, null, '75 h restantes'], 'on ne devine pas un total');
  const usage = R.piecesUsure([soeur('sensor.m_cutting_blade_usage_time', 8.5, { cle: 'cutting_blade_usage_time', unite: 'h' })]);
  assert.deepEqual([usage[0].role, usage[0].pct, usage[0].texte], ['lames', null, '8,5 h d’utilisation']);
  assert.equal(R.piecesUsure([soeur('sensor.m_usage', 90, { cle: 'cutting_blade_usage_time', unite: 'min' })])[0].texte, '1,5 h d’utilisation', 'les minutes se lisent en heures');
  // Deux capteurs en % du même rôle gardent leur nom.
  const deux = R.piecesUsure([soeur('sensor.r_mop_a', 40, { cle: 'lifespan_round_mop', unite: '%', nom: 'Serpillière ronde' }), soeur('sensor.r_mop_b', 90, { cle: 'lifespan_mop_pad', unite: '%', nom: 'Patin' })]);
  assert.deepEqual(deux.map(p => p.nom), ['Serpillière ronde', 'Patin']);
  assert.deepEqual(R.piecesUsure([soeur('sensor.r_batterie', 80, { classe: 'battery', unite: '%' })]), [], 'une batterie n’est pas une pièce d’usure');
  assert.deepEqual(R.piecesUsure(null), []);
});

/* ASSERTION MODIFIÉE (chantier IoT, tâche 9, 18/10 ; I20) : les seuils de sa maquette (1d) — rouge sous 15 %, ambre sous 35 %,
 * neutre au-dessus (35 / 65 et la teinte du robot, avant) ; l'alerte de l'Accueil vaut sous 35 %, la rouge comme l'ambre. */
test('les seuils : bas sous 15 %, moyen sous 35 % ; l’alerte est la pièce la plus usée sous 35 %', () => {
  assert.deepEqual([0, 14, 15, 34, 35, 100].map(R.niveauUsure), ['bas', 'bas', 'moyen', 'moyen', 'bon', 'bon']);
  assert.equal(R.niveauUsure(null), null);
  const pieces = [{ nom: 'Filtre', pct: 32, niveau: 'moyen' }, { nom: 'Lames', pct: 12, niveau: 'bas' }, { nom: 'Brosse', pct: 58, niveau: 'bon' }, { nom: 'Sans jauge', pct: null, niveau: null }];
  assert.equal(R.alerteEntretien(pieces).nom, 'Lames');
  assert.equal(R.alerteEntretien([{ nom: 'Filtre', pct: 32, niveau: 'moyen' }]).nom, 'Filtre', 'l’ambre presse aussi');
  assert.equal(R.alerteEntretien([{ nom: 'Brosse', pct: 58, niveau: 'bon' }]), null, 'rien ne presse : pas d’alerte');
  assert.equal(R.alerteEntretien([]), null);
});

test('les compteurs : ce que l’appareil totalise, tel qu’il le nomme', () => {
  const c = R.compteursRobot([
    soeur('sensor.r_surface_totale', 1843, { cle: 'total_stats_area', unite: 'm²', nom: 'Surface totale nettoyée' }),
    soeur('sensor.t_cycles_de_batterie', 86, { cle: 'maintenance_bat_cycles', unite: 'cycles', nom: 'Cycles de batterie' }),
    soeur('sensor.r_surface', 42, { cle: 'stats_area', unite: 'm²', nom: 'Surface nettoyée' }),
    soeur('sensor.r_total_filter', 12, { cle: 'total_filter_time', unite: 'h', nom: 'Filtre total' }),
    soeur('sensor.r_total_mort', 'unknown', { cle: 'total_stats_time', unite: 'h' }),
  ]);
  assert.deepEqual(c, [{ id: 'sensor.r_surface_totale', nom: 'Surface totale nettoyée', valeur: 1843, unite: 'm²' }, { id: 'sensor.t_cycles_de_batterie', nom: 'Cycles de batterie', valeur: 86, unite: 'cycles' }],
    'ni la surface de la session, ni une pièce d’usure, ni un capteur sans valeur');
});

const J = (n, h, m) => { const d = new Date(2026, 8, 17 - n, h, m, 0, 0); return d.toISOString(); };
const MAINTENANT = new Date(2026, 8, 17, 18, 0).getTime(); // jeudi 17/09/2026

test('les sessions se lisent dans l’historique de l’état du robot', () => {
  const etats = [
    { state: 'docked', last_changed: J(6, 12, 0) },
    // samedi : 94 min de travail, une pause au milieu qui ne compte pas
    { state: 'cleaning', last_changed: J(5, 14, 2) }, { state: 'paused', last_changed: J(5, 14, 32) }, { state: 'cleaning', last_changed: J(5, 14, 42) },
    { state: 'returning', last_changed: J(5, 15, 46) }, { state: 'docked', last_changed: J(5, 15, 49) },
    // lundi : arrêté à la main au bout de 22 min
    { state: 'cleaning', last_changed: J(3, 8, 30) }, { state: 'idle', last_changed: J(3, 8, 52) }, { state: 'docked', last_changed: J(3, 9, 0) },
    // mardi : faux départ de 40 s
    { state: 'cleaning', last_changed: J(2, 12, 0) }, { state: 'docked', last_changed: new Date(Date.parse(J(2, 12, 0)) + 40000).toISOString() },
    // mercredi : panne
    { state: 'cleaning', last_changed: J(1, 8, 30) }, { state: 'error', last_changed: J(1, 8, 45) }, { state: 'docked', last_changed: J(1, 9, 30) },
    // aujourd’hui : en cours depuis 17 h 30
    { state: 'cleaning', last_changed: J(0, 17, 30) },
  ];
  const surfaces = [
    { state: '0', last_changed: J(5, 14, 2) }, { state: '68', last_changed: J(5, 15, 46) },
    { state: '0', last_changed: J(3, 8, 30) }, { state: '19', last_changed: J(3, 8, 52) },
    { state: 'unavailable', last_changed: J(1, 8, 31) },
  ];
  const s = R.sessionsRobot(etats, { domaine: 'vacuum', maintenant: MAINTENANT, surfaces });
  assert.deepEqual(s.map(x => [x.issue, x.dureeMin, x.surface]), [['en_cours', 30, null], ['erreur', 15, null], ['interrompu', 22, 19], ['termine', 94, 68]],
    'la plus récente d’abord ; la durée est celle du TRAVAIL ; le faux départ ne compte pas ; la surface est le maximum atteint');
  assert.equal(s[3].debut, Date.parse(J(5, 14, 2)));
  assert.equal(s[3].fin, Date.parse(J(5, 15, 49)), 'une session finit quand le robot a regagné sa base');
  assert.deepEqual(R.sessionsRobot([...etats].reverse(), { domaine: 'vacuum', maintenant: MAINTENANT, surfaces }).map(x => x.dureeMin), [30, 15, 22, 94], 'l’ordre d’arrivée ne compte pas');
  assert.deepEqual(R.sessionsRobot([{ state: 'mowing', last_changed: J(2, 6, 0) }, { state: 'docked', last_changed: J(2, 8, 10) }], { domaine: 'lawn_mower', maintenant: MAINTENANT }).map(x => [x.issue, x.dureeMin, x.surface]), [['termine', 130, null]]);
  assert.deepEqual(R.sessionsRobot([{ state: 'returning', last_changed: J(2, 6, 0) }, { state: 'docked', last_changed: J(2, 6, 5) }], { maintenant: MAINTENANT }), [], 'un retour sans travail n’est pas une session');
  assert.deepEqual(R.sessionsRobot([{ state: 'paused', last_changed: J(2, 6, 0) }, { state: 'cleaning', last_changed: J(2, 6, 30) }, { state: 'docked', last_changed: J(2, 7, 0) }], { maintenant: MAINTENANT }).map(x => [x.debut, x.dureeMin]),
    [[Date.parse(J(2, 6, 30)), 30]], 'une fenêtre qui s’ouvre au milieu d’une pause : la session commence à la reprise du travail');
  assert.deepEqual(R.sessionsRobot([{ state: 'cleaning', last_changed: 'pas une date' }], { maintenant: MAINTENANT }), []);
  assert.deepEqual(R.sessionsRobot(null), []);
  assert.deepEqual(['termine', 'erreur', 'en_cours', 'interrompu'].map(R.motIssue), ['Terminé', 'Erreur', 'En cours', 'Interrompu']);
});

/* ASSERTION MODIFIÉE (chantier IoT, tâche 9, 18/10 ; I19) : l'Historique ne compte plus la semaine du calendrier, un jour par barre
 * (`resumeSemaine`, parti avec ses barres) ; il compte les sept jours GLISSANTS (`septJours`) — les 7 × 24 h qui finissent
 * maintenant, la session en cours comprise : un passage compte s'il finit dans la fenêtre. */
test('les sept derniers jours : glissants, la session en cours comprise', () => {
  const sessions = [
    { debut: new Date(2026, 8, 17, 17, 30).getTime(), fin: null, dureeMin: 30, surface: 12, issue: 'en_cours' },
    { debut: new Date(2026, 8, 16, 8, 30).getTime(), fin: new Date(2026, 8, 16, 9, 21).getTime(), dureeMin: 51, surface: 42, issue: 'termine' },
    { debut: new Date(2026, 8, 10, 17, 30).getTime(), fin: new Date(2026, 8, 10, 18, 10).getTime(), dureeMin: 40, surface: 30, issue: 'termine' }, // fini dans la fenêtre
    { debut: new Date(2026, 8, 10, 16, 0).getTime(), fin: new Date(2026, 8, 10, 17, 0).getTime(), dureeMin: 60, surface: 50, issue: 'termine' }, // fini avant
  ];
  const r = R.septJours(sessions, MAINTENANT);
  assert.deepEqual([r.n, r.dureeMin, r.surface, r.sessions.length], [3, 121, 84, 3]);
  const sansSurface = R.septJours(sessions.map(s => ({ ...s, surface: null })), MAINTENANT);
  assert.equal(sansSurface.surface, null, 'un robot qui ne publie pas sa surface n’affiche pas « 0 m² »');
  assert.equal(sansSurface.dureeMin, 121);
  assert.deepEqual([R.septJours([], MAINTENANT).n, R.septJours(null, MAINTENANT).surface], [0, null]);
  assert.equal(R.resumeSemaine, undefined, 'la semaine du calendrier est partie avec ses barres');
});

test('les durées et les jours se disent court', () => {
  assert.deepEqual([0, 48, 60, 135, 61].map(R.dureeLisible), ['0 min', '48 min', '1 h', '2 h 15', '1 h 01']);
  assert.equal(R.etiquetteJour(new Date(2026, 8, 17, 8, 0).getTime(), MAINTENANT, 'fr-FR'), 'Auj.');
  assert.equal(R.etiquetteJour(new Date(2026, 8, 16, 23, 59).getTime(), MAINTENANT, 'fr-FR'), 'Hier');
  assert.equal(R.etiquetteJour(new Date(2026, 8, 14, 8, 0).getTime(), MAINTENANT, 'fr-FR'), 'Lun');
});

test('les réglages : ceux qui changent le travail d’abord, le reste replié', () => {
  const s = [
    soeur('switch.t_zone_avant', 'on', { cle: 'area', nom: 'Zone avant' }),
    soeur('number.t_hauteur_des_lames', 40, { cle: 'blade_height', unite: 'mm', nom: 'Hauteur des lames', attributs: { min: 20, max: 70, step: 5 } }),
    soeur('number.t_hauteur_en_pouces', 1.6, { cle: 'blade_height_inches', unite: 'in', nom: 'Hauteur en pouces' }),
    soeur('switch.t_detection_de_pluie', 'on', { cle: 'rain_detection', nom: 'Détection de pluie' }),
    soeur('select.t_securite_faune', 'high', { cle: 'wildlife_safety', nom: 'Sécurité faune', attributs: { options: ['off', 'low', 'high'] } }),
    soeur('select.t_seul', 'a', { cle: 'work_mode', nom: 'Un seul choix', attributs: { options: ['a'] } }),
    soeur('switch.t_voix', 'off', { cle: 'voice_on_off', nom: 'Voix' }),
    soeur('switch.t_eclairage_de_nuit', 'off', { cle: 'night_light', nom: 'Éclairage de nuit' }),
    soeur('switch.t_niveau_bureau', 'off', { cle: 'office_level', nom: 'Niveau bureau' }),
    soeur('number.t_sans_valeur', 'unknown', { cle: 'blade_height', nom: 'Sans valeur' }),
    soeur('sensor.t_batterie', 64, { classe: 'battery' }),
  ];
  const r = R.reglagesRobot(s);
  assert.deepEqual(r.principaux.map(x => [x.id, x.type]), [['number.t_hauteur_des_lames', 'nombre'], ['switch.t_detection_de_pluie', 'bascule'], ['select.t_securite_faune', 'choix']],
    'ni la zone (un choix de départ), ni la liste à un seul choix, ni le nombre sans valeur');
  assert.deepEqual(r.autres.map(x => x.id), ['number.t_hauteur_en_pouces', 'switch.t_voix', 'switch.t_eclairage_de_nuit', 'switch.t_niveau_bureau'],
    'les pouces, la voix et un éclairage ne changent pas le travail ; « niveau » et « bureau » ne contiennent pas « eau »');
  assert.deepEqual(r.principaux[0], { id: 'number.t_hauteur_des_lames', type: 'nombre', nom: 'Hauteur des lames', texte: 'blade_height t_hauteur_des_lames', valeur: 40, min: 20, max: 70, pas: 5, unite: 'mm' });
  assert.equal(r.principaux[1].actif, true);
  assert.deepEqual([r.principaux[2].valeur, r.principaux[2].options], ['high', ['off', 'low', 'high']]);
  assert.equal(R.reglagesRobot([soeur('select.r_debit_d_eau', 'low', { cle: 'water_amount', nom: 'Débit d’eau', attributs: { options: ['low', 'high'] } })]).principaux.length, 1, 'le débit d’eau, lui, en est un');
  const beaucoup = Array.from({ length: 12 }, (_, i) => soeur('switch.r_tapis_' + i, 'on', { cle: 'carpet_' + i }));
  assert.equal(R.reglagesRobot(beaucoup).principaux.length, 8, 'huit au plus en tête');
  assert.equal(R.reglagesRobot(beaucoup).autres.length, 4);
});

test('la fiche technique : ce que l’appareil dit de lui, rien de plus', () => {
  const f = R.ficheTechnique({ manufacturer: 'Démo', model: 'Meadow M2', firmware: null }, [
    soeur('update.t_micrologiciel', 'off', { attributs: { installed_version: '1.14.0' } }),
    soeur('sensor.t_qualite_du_signal_bluetooth', -40, { cle: 'ble_rssi', classe: 'signal_strength', unite: 'dBm' }),
    soeur('sensor.t_qualite_du_signal_wi_fi', -58.4, { cle: 'wifi_rssi', classe: 'signal_strength', unite: 'dBm' }),
  ]);
  assert.deepEqual(f, [{ cle: 'modele', nom: 'Modèle', valeur: 'Démo Meadow M2' }, { cle: 'micrologiciel', nom: 'Micrologiciel', valeur: '1.14.0' }, { cle: 'wifi', nom: 'Wi-Fi', valeur: '-58 dBm · excellent' }],
    'le Bluetooth n’est pas le Wi-Fi');
  assert.deepEqual(R.ficheTechnique(null, []), []);
  assert.deepEqual([-50, -60, -61, -70, -71, -80, -81].map(R.qualiteSignal), ['excellent', 'excellent', 'bon', 'bon', 'moyen', 'moyen', 'faible']);
  assert.equal(R.qualiteSignal('inconnu'), null);
});

test('la fiche : une feuille pour les deux robots, ouverte depuis leur carte — partout, le même rendu', () => {
  const app = MONOLITHE;
  assert.ok(app.includes("const FicheRobotContent = lazyRecharge(() => import('./ficherobot.jsx'));"), 'chargée à la demande, derrière le rechargement unique (audit du 03/10)');
  assert.ok(!existsSync(join(RACINE, 'src', 'views', 'robot.jsx')) && !existsSync(join(RACINE, 'src', 'views', 'aspirateur.jsx')), 'plus de vue : une fiche, comme les autres appareils (18/09)');
  const f = bloc(app, 'function FicheRobot(', NL + '}');
  /* ASSERTION MODIFIÉE (chantier IoT, tâche 8, 18/10 ; I15) : la coquille passe à la fiche la VUE de sa carte (15 s fiche ouverte), la
   * plaque de la carte et « {pièce} · robot aspirateur ». */
  assert.ok(f.includes('<BottomSheet onClose={onClose} onglets>') && f.includes('<Suspense fallback=') && f.includes('<FicheRobotContent hass={H} idRobot={id} domaine={domaine} vue={vue} plaque={plaque} sousNom={sousNom} onFiche={setFiche} epingle={<BoutonEpingle id={id} />} />'),
    'une feuille, le contenu chargé DANS une frontière, l’épingle dans l’en-tête');
  assert.ok(f.includes('const vue = useVueRobot(H, id, null, true, { rapide: true });'), 'la fiche lit ce que lit la carte');
  assert.ok(f.includes('useHass([id, ...siblingsOf(LOGGIA_INDEX, id)])'), 'la fiche suit en direct les sœurs du robot : le poll de la vue derrière ne les connaît pas');
  assert.ok(f.includes('{fiche && <FicheAppareil id={fiche} hass={H} onClose={() => setFiche(null)} />}'), 'la fiche universelle (Stop, Localiser, entités) s’ouvre par-dessus');
  assert.ok(app.includes('else if (DOMAINES_ROBOT.indexOf(d) >= 0) setRobotPop(id);'), 'la carte d’un robot ouvre sa fiche, partout — plus de condition sur la navigation');
  assert.ok(app.includes('{robotPop && <FicheRobot id={robotPop} hass={hass} onClose={() => setRobotPop(null)} />}'));
  assert.ok(!app.includes('RobotView') && !app.includes("'Tondeuse': 'tondeuse'") && !app.includes("robotKeys(") && !app.includes('loggia-robot-'), 'la vue, ses routes et son poll ont disparu');
  assert.ok(app.includes("vacuum: 'objets', lawn_mower: 'objets' }"), 'la recherche mène à Objets, où la carte du robot ouvre la fiche');
  const vues = lire('src', 'views.js');
  assert.ok(!vues.includes("'aspirateur'") && !vues.includes("'tondeuse'"), 'plus d’identifiant de vue');
  const ui = lire('src', 'ui.jsx');
  assert.ok(!ui.includes("vid: 'aspirateur'") && !ui.includes("vid: 'tondeuse'"), 'plus rien à activer dans le menu');
  const fiche = lire('src', 'ficherobot.jsx');
  /* ASSERTION MODIFIÉE (chantier IoT, tâche 8, 18/10 ; I15) : la page des réglages est celle du socle commun (`PageReglagesAppareil`) —
   * sa rangée « L’appareil » ouvre la fiche universelle — et l'en-tête aussi (`EnteteFiche`, qui pose l'épingle avant la roue). */
  assert.ok(fiche.includes("onFiche={onFiche ? () => onFiche(idRobot) : null}") && fiche.includes('<PageReglagesAppareil hass={hass} nom={nom} libelleNom={tr(\'Nom du robot\')}'), 'la fiche universelle par les réglages du robot');
  assert.ok(fiche.includes("export default function FicheRobotContent({ hass, idRobot, domaine = 'vacuum', vue, plaque = null, sousNom = null, onFiche = null, epingle = null }) {"), 'le robot est celui de la carte tapée');
  assert.ok(!fiche.includes('useLarge') && !fiche.includes('sessionStorage'), 'un seul agencement, celui du téléphone ; plus de robot mémorisé');
  assert.ok(fiche.includes('<EnteteFiche nom={nom} plaque={plaque} sousNom={sousNom} epingle={epingle} reglages'), 'l’épingle dans l’en-tête, comme sur la fiche universelle');
});

test('le dessin : les teintes de Loggia, la couleur qui dit l’état, rien sans source', () => {
  const vue = lire('src', 'ficherobot.jsx');
  assert.ok(!/#[0-9a-fA-F]{6}\b/.test(vue), 'aucune couleur en dur : les maquettes donnent une disposition, pas une palette (seul le blanc du texte posé sur l’accent y est)');
  /* ASSERTION MODIFIÉE (chantier IoT, tâche 8, 18/10 ; I16, I2 A) : l'anneau de batterie part — la batterie s'écrit à droite du mot
   * d'état, son glyphe à la règle des piles (`glyphePile`), et ne s'écrit pas sans batterie publiée ni pour un robot muet ; l'onglet
   * Carte part — « Voir la carte » ouvre le plan dans une seconde feuille, seulement s'il y a une image (tests/fiche_robot.test.mjs). */
  assert.ok(vue.includes('{vue.batterie != null && !vue.panne && (') && vue.includes('<Fi i={glyphePile(vue.batterie)} size={14} color="var(--o-text3)"'), 'sans batterie publiée, pas de chiffre');
  assert.ok(!vue.includes("['zones',") && vue.includes("...(usure.length || compteurs.length ? [['entretien', tr('Entretien'), 'wrench-simple']] : []),"), 'un onglet sans donnée n’existe pas');
  // ASSERTION MODIFIÉE (chantier IoT, tâche 9, 18/10 ; I20) : « Remplacé » n'existe pas à 100 %, et il DEMANDE sur sa rangée (« Remettre Filtre à 100 % ? ») au lieu de deux appuis.
  // ASSERTION MODIFIÉE (passe bis de l'étape 2 IoT, 19/10 ; point G) : l'Entretien est une brique du socle commun (`OngletEntretien`,
  // fichecommune.jsx), que la fiche du distributeur reprend telle quelle ; le robot lui passe ses pièces, ses compteurs et sa phrase.
  const commune = lire('src', 'fichecommune.jsx');
  assert.ok(commune.includes('const remplacer = p.reset && p.pct !== 100;') && commune.includes("{remplacer && !demande && <button type=\"button\" onClick={() => setQuestion(p.id)} style={PUCE_RANGEE}>{tr('Remplacé')}</button>}"),
    '« Remplacé » seulement si l’appareil a le bouton, et pas à 100 %');
  assert.ok(vue.includes("<OngletEntretien hass={hass} pieces={usure} compteurs={compteurs} phrase={phraseEntretien(usure)} />") && !vue.includes('function OngletEntretien('), 'le robot reprend la brique commune');
  assert.ok(vue.includes('{carteOuverte && idCarte && (') && !vue.includes('carte={idCarte && large'), 'la carte, dans sa seconde feuille, sur tous les écrans');
  /* ASSERTION MODIFIÉE (passe bis du 18/10, point A ; sa réponse « Par le serveur ») : le script maison garde la main quand il existe,
   * mais il part par le serveur (`loggia/robots/lancer`, `script`) — plus de `script.turn_on` direct ; le geste se JOUE dans
   * tests/fiche_robot.test.mjs (point A).
   * ASSERTION MODIFIÉE (passe bis 2 du 18/10, points J et E) : il part avec le RÔLE qu'on lui demande, et le jeton de son geste. */
  assert.ok(vue.includes("parScript(scripts.pieces_selectionnees, 'pieces_selectionnees', jeton, {") && !vue.includes("appel('script', 'turn_on', { entity_id: scripts.pieces_selectionnees })"), 'le script maison garde la main quand il existe');
  const css = lire('src', 'index.css');
  for (const r of ['.rb-aspirateur { --rb-rgb: var(--o-accent-rgb); --rb-doux: var(--o-accent-soft); --rb-fond: var(--o-accent-fond); }', '.rb-tondeuse { --rb-fond: color-mix(in srgb, var(--o-ok) 62%, #000); }', '.rb-onglet { flex: 1 1 0; min-width: 0; flex-direction: column;']) {
    assert.ok(css.includes(r), r + ' manque à index.css');
  }
});

test('la clé de traduction voyage du registre jusqu’à l’index', () => {
  const py = lire('custom_components', 'loggia', 'discovery.py');
  assert.ok(py.includes('"key": getattr(e, "translation_key", None),'), 'le composant la transmet');
  const d = lire('src', 'discovery.js');
  assert.ok(d.includes('translation_key: e.key || null,') && d.includes('translationKey: e.translation_key || null,'), 'le front la garde');
});
