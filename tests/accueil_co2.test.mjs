// v3.46.0 (ADR 0044) — « j'aime beaucoup cette carte CO₂ » (18/09) : un widget
// EN OPTION du rail de l'Accueil — la pièce la plus chargée, la règle
// d'aération, l'étendue de la journée, une barre par heure, le geste pour
// aérer. Ce qui se calcule est testé à sec ; le branchement se relit.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true });
const A = await import('../src/air.js');
const { WIDGETS_OPTION } = await import('../src/horloge.js');

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const H = 3600000;
const FIN = Date.parse('2026-09-18T18:00:00Z');
const pt = (h, v) => ({ t: FIN - h * H, v });

test('les points d’un historique : triés, sans les états muets', () => {
  const brut = [[{ state: '620', last_changed: '2026-09-18T10:00:00Z' }, { state: 'unavailable', last_changed: '2026-09-18T11:00:00Z' }, { state: '580', last_changed: '2026-09-18T09:00:00Z' }, { state: '700', last_updated: '2026-09-18T12:00:00Z' }, { state: '1', last_changed: 'hier' }]];
  assert.deepEqual(A.pointsHistorique(brut).map(p => [new Date(p.t).getUTCHours(), p.v]), [[9, 580], [10, 620], [12, 700]]);
  assert.deepEqual(A.pointsHistorique(brut[0]), A.pointsHistorique(brut), 'avec ou sans la liste par entité');
  assert.deepEqual(A.pointsHistorique(null), []);
  assert.deepEqual(A.pointsHistorique({}), []);
});

test('une barre par heure, moyenne pondérée par le temps ; avant le premier point on ne sait rien', () => {
  const b = A.barresJournee([pt(23.5, 600), pt(1.5, 900), pt(0.25, 1200)], FIN);
  assert.equal(b.length, 24);
  assert.equal(b[0], 600, 'la première heure : une demi-heure connue, à 600');
  assert.equal(b[1], 600);
  assert.equal(b[21], 600, 'une heure sans changement vaut la dernière valeur');
  assert.equal(b[22], 750, 'l’heure du changement : une demi-heure à 600, une demi-heure à 900');
  assert.equal(b[23], Math.round((900 * 0.75 + 1200 * 0.25)), 'la dernière heure : 45 min à 900, 15 min à 1200');
  assert.deepEqual(A.barresJournee([pt(22.5, 600)], FIN).slice(0, 3), [null, 600, 600], 'avant le premier point on ne sait rien : nul, pas zéro');
  assert.deepEqual(A.barresJournee([], FIN), Array(24).fill(null));
  assert.deepEqual(A.barresJournee(null, FIN), Array(24).fill(null));
  assert.equal(A.barresJournee([pt(30, 500)], FIN).every(v => v === 500), true, 'un point plus vieux que la journée porte toute la journée');
  assert.deepEqual(A.barresJournee([pt(0.5, 800)], FIN, { heures: 2, n: 4 }), [null, null, null, 800]);
  assert.deepEqual(A.barresJournee([pt(1, 400), pt(1, NaN), { t: NaN, v: 9 }], FIN, { heures: 2, n: 2 }), [null, 400]);
  assert.deepEqual(A.barresJournee([pt(1.5, 1000), pt(2.5, 500)], FIN, { heures: 4, n: 2 }), [500, 875], 'l’ordre d’arrivée ne compte pas ; le changement à mi-tranche pèse sa demi-heure');
});

test('l’étendue de la journée comprend le moment', () => {
  assert.deepEqual(A.etendue([520, null, 900, 1240], 640), { min: 520, max: 1240 });
  assert.deepEqual(A.etendue([700, 800], 1300), { min: 700, max: 1300 });
  assert.deepEqual(A.etendue([null, null], 640), { min: 640, max: 640 });
  assert.deepEqual(A.etendue([], null), { min: null, max: null });
  assert.deepEqual(A.etendue(null, '812.6'), { min: 813, max: 813 });
});

test('la pièce la plus chargée, la seule qui compte', () => {
  const c = [{ id: 'sensor.a', piece: 'Salon', valeur: 640 }, { id: 'sensor.b', piece: 'Chambre', valeur: '1240' }, { id: 'sensor.c', piece: 'Bureau', valeur: null }, { id: '', piece: 'Sans', valeur: 9000 }];
  assert.deepEqual(A.pireCapteur(c), { id: 'sensor.b', piece: 'Chambre', valeur: 1240 });
  assert.deepEqual(A.pireCapteur([{ id: 'sensor.a', valeur: 5 }]), { id: 'sensor.a', piece: null, valeur: 5 });
  assert.equal(A.pireCapteur([{ id: 'sensor.c', piece: 'Bureau', valeur: 'unknown' }]), null);
  assert.equal(A.pireCapteur([]), null);
  assert.equal(A.pireCapteur(null), null);
});

test('le seuil est celui de la veille du serveur, sinon celui de la maison', () => {
  assert.equal(A.seuilCo2({ config: { co2: { seuil: 1000 } } }), 1000);
  assert.equal(A.seuilCo2({ config: { co2: { seuil: '1100.4' } } }), 1100);
  // Sans seuil au serveur : celui de la maison, le palier « Élevé » (19/09).
  assert.equal(A.seuilCo2({ config: { co2: { seuil: 0 } } }), 1400);
  assert.equal(A.seuilCo2({ config: { co2: {} } }), 1400);
  assert.equal(A.seuilCo2(null), 1400);
});

test('le geste pour aérer : la ventilation de la veille, sinon les volets de la zone, sinon rien', () => {
  const S = { 'fan.vmc': { state: 'on' }, 'switch.extracteur': { state: 'unavailable' }, 'cover.chambre': { state: 'closed', attributes: { supported_features: 15 } }, 'cover.fixe': { state: 'closed', attributes: { supported_features: 8 } }, 'cover.mort': { state: 'unavailable', attributes: { supported_features: 15 } }, 'light.chambre': { state: 'on', attributes: { supported_features: 1 } }, 'sensor.chambre_co2': { state: '1240' } };
  assert.deepEqual(A.ventilationVeille({ config: { co2: { ventilation: ['fan.vmc', 'switch.extracteur', 'fan.absent', 42] } } }, S), ['fan.vmc'], 'ce qui existe et répond');
  assert.deepEqual(A.ventilationVeille(null, S), []);
  const index = { areaOf: (id) => (id === 'sensor.chambre_co2' ? 'chambre' : null), areaList: [{ id: 'chambre', entities: ['cover.chambre', 'cover.fixe', 'cover.mort', 'light.chambre', 'cover.absent'] }] };
  assert.deepEqual(A.voletsDeLaZone(index, S, 'sensor.chambre_co2'), ['cover.chambre'], 'ceux qui savent s’ouvrir et répondent');
  assert.deepEqual(A.voletsDeLaZone(index, S, 'sensor.ailleurs'), []);
  assert.deepEqual(A.voletsDeLaZone(null, S, 'sensor.chambre_co2'), []);
  assert.deepEqual(A.actionAerer({ ventilation: ['fan.vmc'], volets: ['cover.chambre'] }), { type: 'ventiler', ids: ['fan.vmc'], domaine: 'homeassistant', service: 'turn_on', libelle: 'Ventiler' });
  assert.deepEqual(A.actionAerer({ volets: ['cover.chambre'] }), { type: 'volets', ids: ['cover.chambre'], domaine: 'cover', service: 'open_cover', libelle: 'Ouvrir les volets · aérer' });
  assert.equal(A.actionAerer({}), null);
  assert.equal(A.actionAerer(), null);
  assert.deepEqual(A.reperesAxe(24), ['−24 h', '−12 h', 'maintenant']);
});

test('le branchement : en option dans le rail, rien sans capteur, la couleur dit l’état', () => {
  assert.deepEqual(WIDGETS_OPTION, ['heure', 'calendrier', 'co2']);
  const app = lire('src', 'App.jsx');
  assert.ok(app.includes("const ACC_RAIL = ['attention', 'heure', 'meteo', 'co2', 'moment', 'calendrier', 'rappels', 'agenda'];"));
  assert.ok(app.includes("co2: co2Pire ? <Co2Rail hass={dashHass} capteur={co2Pire} seuil={seuilCo2(veillesEtat)} action={co2Action} onAgir={aerer} /> : null,"), 'sans capteur, pas de section — même en option');
  assert.ok(app.includes("a.rooms.filter(r => r.co2Id).map(r => ({ id: r.co2Id, piece: r.name, valeur: r.co2 }))"), 'les capteurs sont ceux des pièces');
  assert.ok(app.includes("const aerer = (act) => commanderService(dashHass, act.ids, act.domaine, act.service, { entity_id: act.ids });"));
  const vue = lire('src', 'widgetsrail.jsx');
  const carte = vue.slice(vue.indexOf('export function Co2Rail('));
  assert.ok(!/#[0-9a-fA-F]{6}\b/.test(carte.replace(/#fff\b/g, '')), 'les teintes du rail, pas celles de la capture');
  assert.ok(carte.includes("dernier ? (haut ? 'var(--o-warn)' : 'var(--o-accent-fond)') : (haut ? 'rgba(var(--o-warn-rgb),.45)' : 'rgba(var(--o-accent-rgb),.22)')"), 'la dernière barre est le moment ; au-dessus du seuil, l’ambre');
  assert.ok(carte.includes("{action && (") && carte.includes('useHistoriqueJour(hass, capteur ? capteur.id : null)'), 'le bouton seulement s’il y a un geste ; l’historique relu toutes les cinq minutes');
  const en = lire('src', 'langues', 'en.js');
});
