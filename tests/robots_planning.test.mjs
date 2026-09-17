// v3.44.0 (ADR 0043) — la Planification des maquettes des robots. Aucun robot
// ne publie son planning : c'est Loggia qui le tient côté serveur
// (custom_components/loggia/robots.py, testé dans tests/python/test_robots.py)
// et qui lance le robot à l'heure. Ici : ce que l'écran en calcule, et son
// branchement.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// La langue de la machine ne doit pas changer le résultat (garde-fou de la CI).
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true });
const R = await import('../src/robots.js');

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');

const P = (x = {}) => ({ id: 'p1', robot: 'vacuum.r', heure: '09:30', jours: [0, 1, 2, 3, 4], zones: [], actif: true, ...x });
// Jeudi 17/09/2026, 18 h.
const JEUDI_18H = new Date(2026, 8, 17, 18, 0).getTime();

test('lundi vaut 0, comme côté serveur', () => {
  assert.equal(R.jourPlanning(new Date(2026, 8, 14)), 0, 'lundi');
  assert.equal(R.jourPlanning(new Date(2026, 8, 17)), 3, 'jeudi');
  assert.equal(R.jourPlanning(new Date(2026, 8, 20)), 6, 'dimanche — le 0 du navigateur');
  assert.deepEqual(R.ordreJours(1), [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(R.ordreJours(7), [6, 0, 1, 2, 3, 4, 5], 'une semaine qui commence le dimanche');
  assert.deepEqual(R.ordreJours(6), [5, 6, 0, 1, 2, 3, 4]);
  assert.deepEqual(R.ordreJours(undefined), [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual([0, 2, 6].map(j => R.nomJour(j, 'fr-FR', 'narrow')), ['L', 'M', 'D']);
  assert.deepEqual([0, 5].map(j => R.nomJour(j, 'fr-FR', 'short')), ['Lun', 'Sam'], 'sans le point de l’abréviation');
  assert.equal(R.nomJour(6, 'fr-FR', 'long'), 'Dimanche');
});

test('une heure se valide avant de partir au serveur', () => {
  for (const ok of ['09:30', '9:05', '00:00', '23:59']) assert.equal(R.heureValide(ok), true, ok);
  for (const non of ['24:00', '12:60', '1230', 'midi', '', null, undefined, '12:5']) assert.equal(R.heureValide(non), false, String(non));
});

test('les jours se résument en mots', () => {
  assert.equal(R.resumeJours([0, 1, 2, 3, 4, 5, 6]), 'Tous les jours');
  assert.equal(R.resumeJours([4, 3, 2, 1, 0]), 'En semaine');
  assert.equal(R.resumeJours([6, 5]), 'Le week-end');
  assert.equal(R.resumeJours([0, 2, 4], 1, 'fr-FR'), 'Lun · Mer · Ven');
  assert.equal(R.resumeJours([6, 0], 7, 'fr-FR'), 'Dim · Lun', 'dans l’ordre de la langue');
  assert.equal(R.resumeJours([6, 0], 1, 'fr-FR'), 'Lun · Dim');
  assert.equal(R.resumeJours([]), 'Aucun jour');
  assert.equal(R.resumeJours(null), 'Aucun jour');
  assert.equal(R.resumeJours([9, -1, 1.5, 0]), 'Lun', 'ce qui n’est pas un jour ne compte pas');
  assert.equal(R.resumeJours([0, 1, 2, 3, 4, 5, 6, 9]), 'Tous les jours', '… ni dans le compte des sept');
});

test('ce qu’un planning vise', () => {
  assert.equal(R.resumeZones(P({ zones: [{ id: 'a', nom: 'Salon' }, { id: 'b', nom: 'Cuisine' }] })), 'Salon · Cuisine');
  assert.equal(R.resumeZones(P({ zones: [{ id: 'a', nom: 'Salon' }] })), 'Salon', 'une seule zone se nomme aussi');
  assert.equal(R.resumeZones(P()), 'Tout le logement');
  assert.equal(R.resumeZones(P(), { domaine: 'lawn_mower', aDesAires: false }), 'Tout le jardin');
  assert.equal(R.resumeZones(P(), { domaine: 'lawn_mower', aDesAires: true }), 'Les zones allumées', 'sans zone choisie, une tondeuse à aires tond celles qui sont allumées');
  assert.equal(R.resumeZones(null), 'Tout le logement');
  assert.deepEqual(R.zonePlanning({ id: 'salon', nom: 'Salon', couleur: '#fff', piece: { segments: ['1', 2, 'x'] } }), { id: 'salon', nom: 'Salon', segments: [1, 2] });
  assert.deepEqual(R.zonePlanning({ id: 'switch.t_zone_avant', nom: 'Avant' }), { id: 'switch.t_zone_avant', nom: 'Avant', segments: [] }, 'une aire de tonte n’a pas de segment');
});

test('un planning neuf : les jours ouvrés, neuf heures, un identifiant que le serveur accepte', () => {
  const n = R.nouveauPlanning('vacuum.r', 1789670000000);
  assert.deepEqual({ ...n, id: null }, { id: null, robot: 'vacuum.r', heure: '09:00', jours: [0, 1, 2, 3, 4], zones: [], actif: true });
  assert.match(n.id, /^[a-z0-9_-]{1,40}$/);
  assert.notEqual(n.id, R.nouveauPlanning('vacuum.r', 1789670001000).id);
});

test('le prochain passage est la première échéance STRICTEMENT à venir', () => {
  const de = (plannings, quand = JEUDI_18H, robot = 'vacuum.r') => { const r = R.prochainPassage(plannings, robot, quand); return r ? [r.planning.id, r.date.getDate(), r.date.getHours(), r.date.getMinutes()] : null; };
  assert.deepEqual(de([P()]), ['p1', 18, 9, 30], 'jeudi 18 h : 09:30 est passé, ce sera vendredi');
  assert.deepEqual(de([P({ heure: '18:30' })]), ['p1', 17, 18, 30], 'plus tard aujourd’hui');
  assert.deepEqual(de([P({ heure: '18:00' })]), ['p1', 18, 18, 0], 'l’heure pile est déjà partie');
  assert.deepEqual(de([P({ jours: [3], heure: '09:30' })]), ['p1', 24, 9, 30], 'le seul jour est aujourd’hui et l’heure est passée : dans sept jours');
  assert.deepEqual(de([P({ jours: [5, 6] })]), ['p1', 19, 9, 30], 'samedi');
  assert.deepEqual(de([P({ id: 'tard', heure: '20:00' }), P({ id: 'tot', heure: '19:00' }), P({ id: 'eteint', heure: '18:15', actif: false }), P({ id: 'autre', heure: '18:05', robot: 'vacuum.autre' })]),
    ['tot', 17, 19, 0], 'le plus proche, parmi les plannings ALLUMÉS de CE robot');
  assert.equal(de([P({ jours: [] })]), null);
  assert.equal(de([P({ heure: '25:00' })]), null);
  assert.equal(de([]), null);
  assert.equal(de(null), null);
  // Fin de mois : le lendemain du 30/09 est le 1er.
  assert.deepEqual(de([P({ jours: [3] })], new Date(2026, 8, 30, 12, 0).getTime()), ['p1', 1, 9, 30]);
});

test('le prochain passage se dit court', () => {
  assert.equal(R.etiquetteProchain(new Date(2026, 8, 17, 18, 30).getTime(), JEUDI_18H, 'fr-FR'), 'Auj. 18:30');
  assert.equal(R.etiquetteProchain(new Date(2026, 8, 18, 9, 30).getTime(), JEUDI_18H, 'fr-FR'), 'Demain 09:30');
  assert.equal(R.etiquetteProchain(new Date(2026, 8, 19, 9, 5).getTime(), JEUDI_18H, 'fr-FR'), 'Sam 09:05');
});

test('« Ne pas déranger » : la plage peut enjamber minuit', () => {
  const nuit = { actif: true, debut: '22:00', fin: '07:00' };
  assert.deepEqual(['21:59', '22:00', '23:30', '00:00', '06:59', '07:00', '12:00'].map(h => R.dansLaPlage(nuit, h)), [false, true, true, true, true, false, false]);
  const sieste = { actif: true, debut: '13:00', fin: '15:00' };
  assert.deepEqual(['12:59', '13:00', '14:59', '15:00'].map(h => R.dansLaPlage(sieste, h)), [false, true, true, false]);
  assert.equal(R.dansLaPlage({ ...nuit, actif: false }, '23:00'), false, 'plage éteinte');
  assert.equal(R.dansLaPlage({ actif: true, debut: '08:00', fin: '08:00' }, '08:00'), false, 'une plage vide ne retient rien');
  assert.equal(R.dansLaPlage({ actif: true, debut: 'x', fin: '07:00' }, '23:00'), false);
  assert.equal(R.dansLaPlage(nuit, 'x'), false);
  assert.equal(R.dansLaPlage(null, '23:00'), false);
});

test('le capteur de pluie de l’appareil, s’il en a un', () => {
  const s = (id, etat, cle) => ({ id, domaine: id.split('.')[0], etat, nom: 'Détection de pluie', texte: ((cle || '') + ' ' + id.split('.')[1]).toLowerCase() });
  assert.deepEqual(R.capteurPluie([s('switch.t_voix', 'on', 'voice'), s('switch.t_detection', 'on', 'rain_detection')]), { id: 'switch.t_detection', nom: 'Détection de pluie', actif: true });
  assert.deepEqual(R.capteurPluie([s('switch.t_detection_de_pluie', 'off', null)]), { id: 'switch.t_detection_de_pluie', nom: 'Détection de pluie', actif: false }, 'reconnu aussi à son identifiant');
  assert.equal(R.capteurPluie([s('switch.t_detection', 'unavailable', 'rain_detection')]), null);
  assert.equal(R.capteurPluie([s('sensor.t_pluie', '3', 'rain')]), null, 'un capteur n’est pas un interrupteur');
  assert.equal(R.capteurPluie(null), null);
});

test('l’onglet Planning : il n’existe que si le composant répond, et rien ne s’y invente', () => {
  const vue = lire('src', 'views', 'robot.jsx');
  assert.ok(vue.includes("const planning = useEtatServeur(hass, 'loggia/robots/etat', 15000, '');"), 'l’état vient du serveur');
  assert.ok(vue.includes("...(planning.etat ? [['planning', tr('Planning'), 'calendar-clock']] : []),"), 'sans réponse du composant, pas d’onglet');
  const o = vue.indexOf("['zones', idCarte"), p = vue.indexOf("['planning', tr('Planning')"), h = vue.indexOf("['historique', tr('Historique')");
  assert.ok(o < p && p < h, 'l’ordre des maquettes : Carte, Planning, Historique');
  assert.ok(vue.includes("const r = await h.callWS({ type: 'loggia/robots/config', patch });"));
  assert.ok(vue.includes("e.code === 'unauthorized' ? tr('Réservé aux administrateurs.')"), 'un refus du serveur se dit');
  assert.ok(vue.includes('const passage = prochain ? { ...prochain, nom: tr(\'Prochain passage\'), vers: \'planning\' } : derniere ?'), 'la tuile des maquettes, quand un passage est planifié ; sinon le dernier');
  assert.ok(vue.includes("const zonesPlanifiables = domaine === 'lawn_mower' ? zones : (commande([1]) ?"), 'un planning ne vise que ce que le SERVEUR sait commander');
  assert.ok(vue.includes("{domaine === 'lawn_mower' && !pluieNative && etat && etat.meteo && ("), 'la règle de pluie de Loggia : seulement sans capteur natif, et seulement avec une météo');
  assert.ok(vue.includes("{!neuf && <BoutonConfirme libelle={tr('Supprimer')}"), 'supprimer demande deux appuis');
  assert.ok(vue.includes("const retenu = p.actif && dansLaPlage(reglages.calme, p.heure);"), 'un passage pris dans « Ne pas déranger » le dit');
  assert.ok(!/planning[^\n]*#[0-9a-fA-F]{6}\b/.test(vue), 'aucune couleur en dur');
  const css = lire('src', 'index.css');
  assert.ok(css.includes('.rb-accueil, .rb-zones, .rb-histo, .rb-planning { display: grid;') && css.includes('.rb-planning { grid-template-columns: minmax(0, 1.3fr) minmax(300px, 1fr); align-items: start; }'));
});

test('la démo répond comme le serveur', () => {
  const demo = lire('src', 'demo.js');
  assert.ok(demo.includes("if (msg && msg.type === 'loggia/robots/etat') return Promise.resolve(robotsDemo(states));"));
  assert.ok(demo.includes("if (msg && msg.type === 'loggia/robots/config') return Promise.resolve({ config: robotsPatch(msg.patch) });"));
  assert.ok(demo.includes('if (Array.isArray(p.plannings)) ROB_CFG.plannings = p.plannings;'), 'la liste est REMPLACÉE, comme côté serveur');
});

test('les mots nouveaux sont traduits', () => {
  const en = lire('src', 'langues', 'en.js');
  for (const k of ['Planning', 'Prochain passage', 'Passages planifiés', 'Nouveau passage', 'Modifier le passage', 'Ne pas déranger', 'Capteur de pluie', 'Tous les jours', 'En semaine', 'Le week-end',
    'Tout le logement', 'Tout le jardin', 'Les zones allumées', 'Demain', 'Réservé aux administrateurs.', 'Dans la plage « Ne pas déranger » : ce passage ne partira pas.']) {
    assert.ok(en.includes("'" + k + "':"), k + ' manque à en.js');
  }
});
