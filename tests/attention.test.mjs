// Ce qui demande un regard (16/09, refonte de l'Accueil, étape 1) : la rangée
// sûreté et le centre d'attention, tirés d'états de synthèse — et la preuve
// que leurs règles de sûreté restent celles de `deriveNotifs` (App.jsx).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CLASSES_PORTE, CLASSES_FENETRE, CLASSES_MOUVEMENT, CLASSES_SURETE, SEUIL_CO2, NIVEAUX, ICONES_ATTENTION,
  familleOuvrant, comptesSecurite, tuilesSecurite, pointsAttention, niveauMax, resumeAttention, couleurNiveau, iconePoint,
} from '../src/attention.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const police = readFileSync(join(RACINE, 'public', 'fonts', 'uicons-regular-rounded.css'), 'utf8');
const app = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
const source = readFileSync(join(RACINE, 'src', 'attention.js'), 'utf8');

const dansPolice = (ic) => police.includes('.fi-rr-' + ic + ':before');
const et = (state, attributes = {}) => ({ state, attributes });
const bin = (dc, state = 'on', nom) => et(state, nom ? { device_class: dc, friendly_name: nom } : { device_class: dc });
const titres = (pts) => pts.map(p => p.titre);

/* Une maison de synthèse : deux portes (une ouverte), un garage muet, un
 * portail sans valeur, trois fenêtres closes, deux détecteurs (un actif). */
const MAISON = {
  'binary_sensor.porte_entree': bin('door', 'on', 'Porte entrée'),
  'binary_sensor.porte_garage': bin('garage_door', 'off', 'Porte garage'),
  'binary_sensor.portail': bin('gate', 'unknown', 'Portail'),
  'binary_sensor.porte_cave': bin('door', 'unavailable', 'Porte cave'),
  'binary_sensor.fenetre_salon': bin('window', 'off', 'Fenêtre salon'),
  'binary_sensor.fenetre_chambre': bin('window', 'off', 'Fenêtre chambre'),
  'binary_sensor.velux': bin('opening', 'off', 'Velux'),
  'binary_sensor.mouvement_salon': bin('motion', 'on', 'Salon'),
  'binary_sensor.presence_bureau': bin('occupancy', 'off', 'Bureau'),
  'cover.garage': et('open', { device_class: 'garage' }),
  'binary_sensor.casse': null,
  'binary_sensor.sans_attributs': { state: 'on' },
};
const CAMS = [{ nom: 'Entrée', online: true }, { nom: 'Jardin', online: false, haid: 'camera.jardin' }];

test('les constantes : classes, seuil et niveaux', () => {
  assert.deepEqual(CLASSES_PORTE, ['door', 'garage_door', 'gate']);
  assert.deepEqual(CLASSES_FENETRE, ['window', 'opening']);
  assert.deepEqual(CLASSES_MOUVEMENT, ['motion', 'occupancy', 'presence']);
  assert.deepEqual(CLASSES_SURETE, ['smoke', 'carbon_monoxide', 'gas', 'moisture', 'safety', 'tamper']);
  assert.equal(SEUIL_CO2, 1200);
  assert.deepEqual(NIVEAUX, ['danger', 'alerte', 'info']);
  assert.ok(app.includes('co2 < ' + SEUIL_CO2 + ' ? 1 : 2'), 'le seuil est le palier haut d’airPalier');
});

test('familleOuvrant : portes, fenêtres, rien', () => {
  for (const dc of ['door', 'garage_door', 'gate']) assert.equal(familleOuvrant(dc), 'portes', dc);
  for (const dc of ['window', 'opening']) assert.equal(familleOuvrant(dc), 'fenetres', dc);
  for (const dc of ['motion', 'smoke', '', null, undefined]) assert.equal(familleOuvrant(dc), null, String(dc));
});

test('comptesSecurite : les muets ne comptent pas, les noms sont ceux des ouverts, des actifs, des caméras coupées', () => {
  const c = comptesSecurite(MAISON, CAMS);
  assert.deepEqual(c.portes, { total: 2, ouverts: 1, noms: ['Porte entrée'] });
  assert.deepEqual(c.fenetres, { total: 3, ouverts: 0, noms: [] });
  assert.deepEqual(c.mouvement, { total: 2, actifs: 1, noms: ['Salon'] });
  assert.deepEqual(c.cameras, { total: 2, enLigne: 1, noms: ['Jardin'] });
  assert.equal(c.ok, false);
});

test('comptesSecurite : une famille sans capteur vaut null, et ok ne dépend que du clos et du joignable', () => {
  const rien = comptesSecurite({}, []);
  assert.deepEqual(rien, { portes: null, fenetres: null, mouvement: null, cameras: null, ok: true });
  assert.equal(comptesSecurite(null).ok, true);
  assert.equal(comptesSecurite(undefined, null).cameras, null);
  // Du mouvement chez soi n'est pas un problème.
  const mouv = comptesSecurite({ 'binary_sensor.m': bin('motion', 'on', 'Salon'), 'binary_sensor.p': bin('door', 'off') });
  assert.equal(mouv.ok, true);
  assert.equal(mouv.fenetres, null);
  assert.deepEqual(mouv.mouvement, { total: 1, actifs: 1, noms: ['Salon'] });
  // Une porte ouverte, si.
  assert.equal(comptesSecurite({ 'binary_sensor.p': bin('door', 'on') }).ok, false);
  assert.equal(comptesSecurite({ 'binary_sensor.f': bin('opening', 'on') }).ok, false);
  // Une caméra coupée, aussi ; une caméra dont on ne sait rien est réputée en ligne.
  assert.equal(comptesSecurite({}, [{ nom: 'Jardin', online: false }]).ok, false);
  assert.deepEqual(comptesSecurite({}, [{ name: 'Sans avis' }, null, 'x']).cameras, { total: 1, enLigne: 1, noms: [] });
  assert.deepEqual(comptesSecurite({}, [{ haid: 'camera.x', online: false }]).cameras.noms, ['camera.x']);
  // Sans nom du tout, l'entité s'appelle par son id.
  assert.deepEqual(comptesSecurite({ 'binary_sensor.p': bin('door', 'on') }).portes.noms, ['binary_sensor.p']);
});

test('tuilesSecurite : quatre tuiles dans l’ordre, valeurs, libellés, alerte et actif', () => {
  const t = tuilesSecurite(comptesSecurite(MAISON, CAMS));
  assert.deepEqual(t.map(x => x.cle), ['portes', 'fenetres', 'mouvement', 'cameras']);
  assert.deepEqual(t.map(x => x.nom), ['Portes', 'Fenêtres', 'Mouvement', 'Caméras']);
  assert.deepEqual(t.map(x => x.valeur), ['1/2', '3/3', '1', '1/2']);
  assert.deepEqual(t.map(x => x.libelle), ['fermées', 'fermées', 'détecté', 'en ligne']);
  assert.deepEqual(t.map(x => x.alerte), [true, false, false, true]);
  assert.deepEqual(t.map(x => x.actif), [false, false, true, false]);
  assert.deepEqual(t.map(x => x.icone), ['door-closed', 'window-alt', 'eye', 'camera']);
  for (const x of t) {
    assert.ok(dansPolice(x.icone), x.icone + ' manque à la police');
    assert.deepEqual(Object.keys(x), ['cle', 'nom', 'icone', 'valeur', 'libelle', 'alerte', 'actif']);
  }
});

test('tuilesSecurite : le mouvement se conjugue, les familles absentes n’ont pas de tuile', () => {
  const deux = tuilesSecurite({ mouvement: { total: 3, actifs: 2, noms: ['a', 'b'] } });
  assert.equal(deux.length, 1);
  assert.deepEqual([deux[0].valeur, deux[0].libelle, deux[0].actif, deux[0].alerte], ['2', 'détectés', true, false]);
  const aucun = tuilesSecurite({ mouvement: { total: 3, actifs: 0, noms: [] }, cameras: { total: 1, enLigne: 1, noms: [] } });
  assert.deepEqual(aucun.map(x => x.cle), ['mouvement', 'cameras']);
  assert.deepEqual([aucun[0].valeur, aucun[0].libelle, aucun[0].actif], ['Aucun', 'mouvement', false]);
  assert.deepEqual([aucun[1].valeur, aucun[1].alerte], ['1/1', false]);
  assert.deepEqual(tuilesSecurite(null), []);
  assert.deepEqual(tuilesSecurite({ portes: null, fenetres: { total: 0 } }), []);
});

// ── Les points d'attention, règle par règle ─────────────────────────────────

test('1. l’alarme déclenchée : un danger, par panneau', () => {
  const S = { 'alarm_control_panel.maison': et('triggered', { friendly_name: 'Alarme maison' }), 'alarm_control_panel.garage': et('armed_away') };
  const pts = pointsAttention({ S });
  assert.equal(pts.length, 1);
  assert.deepEqual(pts[0], { cle: 'alarme:alarm_control_panel.maison', niveau: 'danger', icone: 'bell-ring', titre: 'Alarme déclenchée', sous: 'Alarme maison', vue: 'securite', haid: 'alarm_control_panel.maison' });
  assert.deepEqual(pointsAttention({ S: { 'alarm_control_panel.maison': et('disarmed') } }), []);
});

test('2. la sûreté : les mots et la table de deriveNotifs, mot pour mot', () => {
  const d = app.indexOf('const SURETE = {');
  assert.ok(d >= 0, 'la table SURETE de deriveNotifs a disparu');
  const blocApp = app.slice(d, app.indexOf('};', d));
  assert.deepEqual([...blocApp.matchAll(/^\s*([a-z_]+): \[/gm)].map(m => m[1]), CLASSES_SURETE, 'mêmes classes, même ordre');
  for (const dc of CLASSES_SURETE) {
    const ligne = blocApp.match(new RegExp('^\\s*' + dc + ": \\[(\"|')(.+?)\\1, '(.+?)'\\],?$", 'm'));
    assert.ok(ligne, dc + ' : ligne introuvable dans deriveNotifs');
    assert.ok(source.includes(ligne[0].trim()), dc + ' : la ligne du module diffère de deriveNotifs');
    const pts = pointsAttention({ S: { ['binary_sensor.' + dc]: bin(dc, 'on', 'Capteur ' + dc) } });
    assert.equal(pts.length, 1, dc);
    assert.equal(pts[0].titre, ligne[3], dc + ' : le titre est « ce qui s’est passé »');
    assert.equal(pts[0].sous, 'Capteur ' + dc);
    assert.equal(pts[0].vue, 'securite');
    assert.equal(pts[0].haid, 'binary_sensor.' + dc);
    assert.equal(pts[0].cle, 'surete:' + dc + ':binary_sensor.' + dc);
  }
});

test('2. la sûreté : ce qui brûle est un danger, l’eau et le sabotage une alerte ; off et muet ne disent rien', () => {
  const S = {
    'binary_sensor.fumee': bin('smoke', 'on', 'Fumée cuisine'), 'binary_sensor.co': bin('carbon_monoxide'), 'binary_sensor.gaz': bin('gas'),
    'binary_sensor.fuite': bin('moisture', 'on', 'Sous évier'), 'binary_sensor.secu': bin('safety'), 'binary_sensor.sabot': bin('tamper'),
    'binary_sensor.fumee_off': bin('smoke', 'off'), 'binary_sensor.fumee_muette': bin('smoke', 'unavailable'), 'binary_sensor.vibr': bin('vibration', 'on'),
  };
  const pts = pointsAttention({ S });
  assert.deepEqual(pts.map(p => [p.titre, p.niveau]), [
    ['CO détecté', 'danger'], ['Fumée détectée', 'danger'], ['Gaz détecté', 'danger'],
    ['Alerte de sécurité', 'alerte'], ['Boîtier ouvert ou déplacé', 'alerte'], ['Fuite détectée', 'alerte'],
  ]);
  assert.deepEqual(pts.map(p => p.icone), ['flame', 'fire-smoke', 'flame', 'shield-exclamation', 'shield-exclamation', 'water']);
  assert.equal(pts.find(p => p.titre === 'Fuite détectée').sous, 'Sous évier');
  assert.equal(pts.find(p => p.titre === 'Gaz détecté').sous, 'binary_sensor.gaz', 'sans friendly_name, l’id');
});

test('2. la sûreté : la plante assoiffée n’est pas une fuite — mais seulement pour moisture, et à la frontière près', () => {
  const S = {
    'binary_sensor.dracaena_besoin_eau': bin('moisture', 'on', 'Dracaena'),
    'binary_sensor.dracaenax_fuite': bin('moisture', 'on', 'Pas une plante'),
    'binary_sensor.dracaena_fumee': bin('smoke', 'on', 'Fumée sous la plante'),
    'binary_sensor.ficus': bin('moisture', 'on', 'Ficus'),
  };
  const pts = pointsAttention({ S, plantes: ['binary_sensor.dracaena', 'binary_sensor.ficus', null, 42, ''] });
  assert.deepEqual(titres(pts).sort(), ['Fuite détectée', 'Fumée détectée']);
  assert.equal(pts.find(p => p.titre === 'Fuite détectée').sous, 'Pas une plante');
  assert.equal(pointsAttention({ S }).length, 4, 'sans plantes configurées, tout se dit');
});

test('2. la sûreté : MeteoAlarm est une vigilance, rouge seulement en Severe ou Extreme', () => {
  const jaune = pointsAttention({ S: { 'binary_sensor.meteo': bin('safety', 'on', 'Vigilance') } });
  assert.equal(jaune[0].titre, 'Alerte de sécurité', 'sans indice MeteoAlarm, c’est un capteur de sécurité');
  const S = { 'binary_sensor.vigilance': et('on', { device_class: 'safety', awareness_level: '2; yellow; Moderate', event: 'Vigilance jaune orages', severity: 'Moderate' }) };
  const pts = pointsAttention({ S });
  assert.deepEqual(pts, [{ cle: 'meteo:binary_sensor.vigilance', niveau: 'alerte', icone: 'umbrella', titre: 'Vigilance météo', sous: 'Vigilance jaune orages', vue: 'securite', haid: 'binary_sensor.vigilance' }]);
  S['binary_sensor.vigilance'].attributes.severity = 'Severe';
  assert.equal(pointsAttention({ S })[0].niveau, 'danger');
  S['binary_sensor.vigilance'].attributes.severity = 'Extreme';
  assert.equal(pointsAttention({ S })[0].niveau, 'danger');
  const parId = pointsAttention({ S: { 'binary_sensor.meteoalarm_paris': et('on', { device_class: 'safety', headline: 'Orages' }) } });
  assert.deepEqual([parId[0].titre, parId[0].sous, parId[0].niveau], ['Vigilance météo', 'Orages', 'alerte']);
  const parAttribution = pointsAttention({ S: { 'binary_sensor.alerte': et('on', { device_class: 'safety', attribution: 'Information provided by MeteoAlarm' }) } });
  assert.deepEqual([parAttribution[0].titre, parAttribution[0].sous], ['Vigilance météo', 'Alerte météo en cours']);
});

test('3. un ouvrant ouvert pendant que l’alarme est armée — et seulement alors', () => {
  const S = {
    'binary_sensor.porte': bin('door', 'on', 'Porte entrée'), 'binary_sensor.fenetre': bin('window', 'on', 'Fenêtre'),
    'binary_sensor.fermee': bin('door', 'off'), 'binary_sensor.mouv': bin('motion', 'on'),
    'alarm_control_panel.maison': et('disarmed'),
  };
  assert.deepEqual(pointsAttention({ S }), [], 'désarmée : une porte ouverte n’est qu’une porte ouverte');
  assert.deepEqual(pointsAttention({ S: { 'binary_sensor.porte': S['binary_sensor.porte'] } }), [], 'sans alarme non plus');
  S['alarm_control_panel.maison'] = et('armed_away');
  const pts = pointsAttention({ S });
  assert.deepEqual(pts.map(p => [p.cle, p.niveau, p.icone, p.titre, p.sous, p.vue, p.haid]), [
    ['ouvrant:binary_sensor.fenetre', 'alerte', 'door-open', 'Ouvert, alarme armée', 'Fenêtre', 'securite', 'binary_sensor.fenetre'],
    ['ouvrant:binary_sensor.porte', 'alerte', 'door-open', 'Ouvert, alarme armée', 'Porte entrée', 'securite', 'binary_sensor.porte'],
  ]);
  S['alarm_control_panel.maison'] = et('armed_home');
  assert.equal(pointsAttention({ S }).length, 2);
});

test('4. le CO₂ d’une pièce au palier « chargé », seuil compris', () => {
  const pieces = [{ nom: 'Chambre', co2: 1310.4 }, { nom: 'Salon', co2: 900 }, { nom: 'Bureau', co2: 1200, haid: 'sensor.co2_bureau' },
    { nom: 'Cave', co2: 1199.6 }, { nom: 'Vide', co2: null }, { nom: 'Texte', co2: 'abc' }, { co2: 2000 }, null, 'x', { name: 'Grenier', co2: 1500 }];
  const pts = pointsAttention({ pieces });
  assert.deepEqual(pts.map(p => [p.cle, p.niveau, p.icone, p.titre, p.sous, p.vue, p.haid]), [
    ['co2:Bureau', 'alerte', 'wind', 'CO₂ élevé', 'Bureau · 1200 ppm', 'room:Bureau', 'sensor.co2_bureau'],
    ['co2:Chambre', 'alerte', 'wind', 'CO₂ élevé', 'Chambre · 1310 ppm', 'room:Chambre', null],
    ['co2:Grenier', 'alerte', 'wind', 'CO₂ élevé', 'Grenier · 1500 ppm', 'room:Grenier', null],
  ]);
});

test('5. une caméra hors ligne', () => {
  const pts = pointsAttention({ cams: [{ nom: 'Entrée', online: true }, { nom: 'Jardin', online: false, haid: 'camera.jardin' }, { name: 'Garage', online: false }, { nom: 'Muette' }, null] });
  assert.deepEqual(pts.map(p => [p.cle, p.niveau, p.icone, p.titre, p.sous, p.vue, p.haid]), [
    ['camera:Garage', 'alerte', 'camera', 'Caméra hors ligne', 'Garage', 'securite', null],
    ['camera:Jardin', 'alerte', 'camera', 'Caméra hors ligne', 'Jardin', 'securite', 'camera.jardin'],
  ]);
});

test('6. le chauffage coupé par une fenêtre ouverte : une info par pièce coupée', () => {
  const pts = pointsAttention({ fenetres: { coupes: { Chambre: ['switch.radiateur_chambre'], Salon: [], Bureau: 'x' } } });
  assert.deepEqual(pts, [{ cle: 'fenetre:Chambre', niveau: 'info', icone: 'flame', titre: 'Chauffage coupé', sous: 'Chambre · fenêtre ouverte', vue: 'room:Chambre', haid: null }]);
  assert.deepEqual(pointsAttention({ fenetres: null }), []);
  assert.deepEqual(pointsAttention({ fenetres: { coupes: null } }), []);
  assert.deepEqual(pointsAttention({ fenetres: { coupes: [] } }), []);
});

test('7. les veilles : la pile faible est une info, le CO₂ signalé une alerte sauf si la pièce l’a déjà dit', () => {
  const S = {
    'sensor.capteur_porte_batterie': et('14', { device_class: 'battery', friendly_name: 'Capteur porte' }),
    'sensor.telecommande_batterie': et('unavailable', { device_class: 'battery', friendly_name: 'Télécommande' }),
    'sensor.co2_bureau': et('1300', { device_class: 'carbon_dioxide', friendly_name: 'CO2 bureau' }),
    'sensor.co2_chambre': et('1250.6', { device_class: 'carbon_dioxide', friendly_name: 'CO2 chambre' }),
  };
  const veilles = { signales: ['bat:sensor.capteur_porte_batterie', 'bat:sensor.telecommande_batterie', 'bat:sensor.inconnue', 'co2:sensor.co2_bureau', 'co2:sensor.co2_chambre', 'creuses', 'xyz:1', 'bat:', null, 42] };
  const pts = pointsAttention({ S, veilles, pieces: [{ nom: 'Bureau', co2: 1300, haid: 'sensor.co2_bureau' }] });
  assert.deepEqual(pts.map(p => [p.cle, p.niveau, p.icone, p.titre, p.sous, p.vue, p.haid]), [
    ['co2:Bureau', 'alerte', 'wind', 'CO₂ élevé', 'Bureau · 1300 ppm', 'room:Bureau', 'sensor.co2_bureau'],
    ['co2:sensor.co2_chambre', 'alerte', 'wind', 'CO₂ élevé', 'CO2 chambre · 1251 ppm', null, 'sensor.co2_chambre'],
    // 14 % : sous le seuil « attention » (20 %) — visible, en ambre (v3.49.0).
    ['pile:sensor.capteur_porte_batterie', 'alerte', 'battery-quarter', 'Pile faible', 'Capteur porte · 14 %', 'objets', 'sensor.capteur_porte_batterie'],
    ['pile:sensor.inconnue', 'info', 'battery-quarter', 'Pile faible', 'sensor.inconnue', 'objets', 'sensor.inconnue'],
    ['pile:sensor.telecommande_batterie', 'info', 'battery-quarter', 'Pile faible', 'Télécommande', 'objets', 'sensor.telecommande_batterie'],
  ]);
  // Sans la pièce, la veille parle seule.
  const seule = pointsAttention({ S, veilles: { signales: ['co2:sensor.co2_bureau'] } });
  assert.deepEqual(seule.map(p => [p.cle, p.sous]), [['co2:sensor.co2_bureau', 'CO2 bureau · 1300 ppm']]);
  // Même clé (une pièce nommée comme le capteur) : une seule fois.
  assert.equal(pointsAttention({ S, veilles: { signales: ['co2:sensor.co2_bureau'] }, pieces: [{ nom: 'sensor.co2_bureau', co2: 1300 }] }).length, 1);
  assert.deepEqual(pointsAttention({ veilles: { signales: 'non' } }), []);
});

test('8. la santé : des incidents, pas des symptômes ; les résidus sont du bruit', () => {
  const sante = { stats: {}, incidents: [
    { kind: 'integration', scope: 'zha', count: 12, entities: [] },
    { kind: 'passerelle', scope: 'Pont Hue', deviceId: 'd1', count: 3, devices: ['a', 'b', 'c'] },
    { kind: 'appareils', count: 3, devices: [{ id: 'x', name: 'Prise salon' }, { id: 'y', name: 'Lampe' }, { id: 'z', name: 'Trois' }] },
    { kind: 'simultane', count: 109, at: '2026-09-16T10:00:00.000Z', domains: { automation: 80, sensor: 29 }, entities: [] },
    { kind: 'residus', count: 89, domains: { automation: 89 }, entities: [] },
    { kind: 'inconnu', count: 5 }, null, 'x',
  ] };
  const pts = pointsAttention({ sante });
  assert.deepEqual(pts.map(p => [p.cle, p.niveau, p.icone, p.titre, p.sous, p.vue, p.haid]), [
    ['sante:integration:zha', 'alerte', 'exclamation', 'Intégration muette', 'zha · 12 entités', 'systeme', null],
    ['sante:passerelle:d1', 'alerte', 'exclamation', 'Passerelle hors service', 'Pont Hue', 'systeme', null],
  ], 'appareils tombés et chute simultanée ne sont plus des points (16/09, « prend de la place pour rien »)');
  assert.deepEqual(pointsAttention({ sante: { incidents: [{ kind: 'appareils', count: 1, devices: [{ id: 'x' }] }] } }), []);
  assert.equal(pointsAttention({ sante: { incidents: [{ kind: 'integration', scope: 'mqtt', entities: ['a', 'b'] }] } })[0].sous, 'mqtt · 2 entités', 'sans count, les entités');
  assert.deepEqual(pointsAttention({ sante: { incidents: 'non' } }), []);
});

test('un ctx vide, absent ou malformé donne une liste vide, jamais une erreur', () => {
  assert.deepEqual(pointsAttention({}), []);
  assert.deepEqual(pointsAttention(), []);
  assert.deepEqual(pointsAttention(null), []);
  assert.deepEqual(pointsAttention({ S: null, cams: 'x', pieces: {}, sante: { incidents: 'no' }, veilles: { signales: 'no' }, fenetres: { coupes: 7 }, plantes: 'no' }), []);
  assert.deepEqual(pointsAttention({ S: { 'binary_sensor.a': null, 'binary_sensor.b': { state: 'on' }, 'alarm_control_panel.c': { state: null }, 'sensor.d': 5 } }), []);
});

test('l’ordre : danger, alerte, info — puis le titre ; les clés sont uniques et les icônes existent', () => {
  const S = {
    'alarm_control_panel.maison': et('triggered', { friendly_name: 'Alarme' }),
    'binary_sensor.fumee': bin('smoke', 'on', 'Cuisine'),
    'binary_sensor.fuite': bin('moisture', 'on', 'Évier'),
    'sensor.pile': et('9', { friendly_name: 'Pile' }),
  };
  const ctx = {
    S, cams: [{ nom: 'Jardin', online: false }], pieces: [{ nom: 'Chambre', co2: 1400 }],
    fenetres: { coupes: { Salon: ['switch.r'] } }, veilles: { signales: ['bat:sensor.pile'] },
    sante: { incidents: [{ kind: 'appareils', count: 2, devices: [{ name: 'a' }, { name: 'b' }] }, { kind: 'integration', scope: 'zha', count: 4 }] },
  };
  const pts = pointsAttention(ctx);
  assert.deepEqual(pts.map(p => [p.niveau, p.titre]), [
    ['danger', 'Alarme déclenchée'], ['danger', 'Fumée détectée'],
    ['alerte', 'Caméra hors ligne'], ['alerte', 'CO₂ élevé'], ['alerte', 'Fuite détectée'], ['alerte', 'Intégration muette'],
    ['alerte', 'Pile faible'], ['info', 'Chauffage coupé'],
  ]);
  assert.equal(new Set(pts.map(p => p.cle)).size, pts.length, 'clés uniques');
  for (const p of pts) {
    assert.equal(p.icone, iconePoint(p));
    assert.ok(dansPolice(p.icone), p.icone + ' manque à la police');
    assert.deepEqual(Object.keys(p), ['cle', 'niveau', 'icone', 'titre', 'sous', 'vue', 'haid']);
  }
  assert.equal(niveauMax(pts), 'danger');
  assert.equal(resumeAttention(pts), '8 points à surveiller');
});

test('toutes les icônes du module existent dans la police regular', () => {
  for (const [genre, ic] of Object.entries(ICONES_ATTENTION)) assert.ok(dansPolice(ic), genre + ' → ' + ic + ' manque à la police');
  assert.equal(iconePoint({ cle: 'surete:smoke:binary_sensor.x' }), 'fire-smoke');
  assert.equal(iconePoint({ cle: 'surete:inconnue:binary_sensor.x' }), 'shield-exclamation');
  assert.equal(iconePoint({ cle: 'fenetre:Salon' }), 'flame');
  assert.equal(iconePoint({ cle: 'sante:integration:zha' }), 'exclamation');
  assert.equal(iconePoint({ cle: 'alarme:alarm_control_panel.x' }), 'bell-ring');
  assert.equal(iconePoint(null), 'exclamation');
});

test('niveauMax, resumeAttention, couleurNiveau', () => {
  assert.equal(niveauMax([]), null);
  assert.equal(niveauMax(null), null);
  assert.equal(niveauMax([{ niveau: 'info' }, { niveau: 'alerte' }, null]), 'alerte');
  assert.equal(niveauMax([{ niveau: 'info' }, { niveau: 'danger' }, { niveau: 'alerte' }]), 'danger');
  assert.equal(niveauMax([{ niveau: 'info' }]), 'info');
  assert.equal(resumeAttention([]), 'Tout va bien');
  assert.equal(resumeAttention(undefined), 'Tout va bien');
  assert.equal(resumeAttention([{ niveau: 'info' }]), '1 point à surveiller');
  assert.equal(resumeAttention([{ niveau: 'info' }, { niveau: 'alerte' }, { niveau: 'danger' }]), '3 points à surveiller');
  assert.deepEqual(couleurNiveau('danger'), { col: 'var(--o-bad)', rgb: 'var(--o-bad-rgb)' });
  assert.deepEqual(couleurNiveau('alerte'), { col: 'var(--o-warn)', rgb: 'var(--o-warn-rgb)' });
  assert.deepEqual(couleurNiveau('info'), { col: 'var(--o-accent)', rgb: 'var(--o-accent-rgb)' });
  assert.deepEqual(couleurNiveau(null), { col: 'var(--o-ok)', rgb: 'var(--o-ok-rgb)' });
  assert.deepEqual(couleurNiveau('autre'), { col: 'var(--o-ok)', rgb: 'var(--o-ok-rgb)' });
});

test('le module est pur : son seul import est i18n', () => {
  // Le code seul : l'en-tête dit justement « pas de React ».
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const imports = [...code.matchAll(/^\s*import\s[^;]*?\sfrom\s*['"]([^'"]+)['"]/gm), ...code.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm)].map(m => m[1]);
  assert.deepEqual(imports, ['./i18n.js']);
  // `window.` avec le point : `window-alt` est une icône, pas le navigateur.
  assert.ok(!/\bReact\b|\bwindow\.|\bdocument\.|getHass/.test(code), 'ni React, ni navigateur, ni Home Assistant');
});
