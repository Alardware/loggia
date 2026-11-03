/* Le poêle en entier (01/11, ADR 0308 ; lot 4 du rapport Gladys : P2, P3, P4).
 *
 * Ce qui est garanti ici :
 *  - P2 : ce que fait un poêle MCZ, envoyé en italien (« Start 1 a Freddo », « Potenza 3 »), se lit dans la langue de l'écran,
 *    dans la fiche de son appareil — seulement pour le capteur que le composant a reconnu (`etat_poele`), jamais d'après un
 *    nom ; une valeur inconnue s'écrit telle quelle ;
 *  - le drapeau `etat_poele` du composant arrive jusqu'à l'index de l'écran ;
 *  - P3 : l'entretien du poêle, que la veille du serveur signale (`entretien:<capteur>`), fait un point dans le rail :
 *    « Entretien du poêle dans 38 h », une info ; dû, une alerte ;
 *  - P4 (le conseil Éco réservé au poêle) : tests/fichechauffage.test.mjs et tests/demo_chauffage.test.mjs. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { area, device, entity, state, states, indexOf } from './fixtures.mjs';
import { pointsAttention, iconePoint, ICONES_ATTENTION } from '../src/attention.js';
import { texteEtatPoele } from '../src/poele.js';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);
const { LigneEntite } = await import(new URL('../src/appareils/fiches.jsx', import.meta.url).href);
const { setLoggiaState, estEtatPoele } = await import('../src/state.js');
const { registresDuComposant } = await import('../src/discovery.js');

const ETAT = 'sensor.poele_current_state';
const MODE = 'sensor.poele_current_mode';
const ENTRETIEN = 'sensor.poele_next_maintenance';

function maison({ etat = 'Potenza 3', mode = 'auto', drapeau = true } = {}) {
  const ent = (id, plus = {}) => ({ ...entity(id, { device: 'poele' }), platform: 'maestro_mcz', entity_category: 'diagnostic', ...plus });
  return {
    areas: [area('salon', 'Salon')],
    devices: [device('poele', 'Poêle', 'salon')],
    entities: [ent(ETAT, drapeau ? { etat_poele: true } : {}), ent(MODE), ent(ENTRETIEN, { unit_of_measurement: 'h' })],
    floors: [],
    states: states(
      state(ETAT, etat, { friendly_name: 'Poêle Current State' }),
      state(MODE, mode, { friendly_name: 'Poêle Current Mode' }),
      state(ENTRETIEN, '38', { friendly_name: 'Poêle Next Maintenance', unit_of_measurement: 'h' }),
    ),
  };
}
function avec(fx, f) {
  setLoggiaState({ index: indexOf(fx), ent: {}, cfg: {}, resolved: null });
  try { return f(fx.states); } finally { setLoggiaState({ index: null, ent: {}, cfg: {}, resolved: null }); }
}
const ligne = (fx, id) => avec(fx, (S) => renderToStaticMarkup(createElement(LigneEntite, { id, hass: { states: S, callService: () => {} } })));

test('P2 : chaque état relevé d’un poêle MCZ se dit en français', () => {
  const attendus = {
    'StandBy': 'En veille', 'Spegnimento': 'Extinction', 'Raffreddamento': 'Refroidissement', 'Stabilizzazione': 'Allumage',
    'Load a Freddo': 'Allumage', 'Start 1 a Freddo': 'Allumage', 'Start 2 a Freddo': 'Allumage',
    'Load a Caldo': 'Allumage', 'Start 1 a Caldo': 'Allumage',
    'Clean a Freddo': 'Nettoyage', 'Clean a Caldo': 'Nettoyage', 'Pulizia High': 'Nettoyage',
    'Potenza 1': 'Chauffe · puissance 1', 'Potenza 5': 'Chauffe · puissance 5',
    'A01 - Mancata Accensione': 'Alarme A01', 'Spento': 'Éteint',
  };
  for (const [brut, mot] of Object.entries(attendus)) assert.equal(texteEtatPoele(brut), mot, brut);
});

test('P2 : une valeur inconnue s’écrit telle quelle', () => {
  for (const brut of ['Scarico Coclea', 'Diagnostica', 'Potenza 12', '42']) assert.equal(texteEtatPoele(brut), brut);
  assert.equal(texteEtatPoele('  Spegnimento  '), 'Extinction', 'les blancs autour ne comptent pas');
  assert.equal(texteEtatPoele(null), '');
});

test('P2 : la fiche de l’appareil traduit le capteur reconnu, et lui seul', () => {
  const fx = maison();
  assert.ok(avec(fx, () => estEtatPoele(ETAT)));
  assert.ok(!avec(fx, () => estEtatPoele(MODE)));
  assert.match(ligne(fx, ETAT), />Chauffe · puissance 3</);
  assert.ok(!ligne(fx, ETAT).includes('Potenza'));
  // Un autre capteur du même poêle, au texte brut : rien ne change.
  assert.match(ligne(maison({ mode: 'Potenza 3' }), MODE), />Potenza 3</);
  // Sans le drapeau du composant (un serveur d'avant), la valeur reçue, telle quelle : jamais d'après un nom.
  assert.match(ligne(maison({ drapeau: false }), ETAT), />Potenza 3</);
  // Une valeur inconnue, telle quelle, même reconnue.
  assert.match(ligne(maison({ etat: 'Scarico Coclea' }), ETAT), />Scarico Coclea</);
});

test('le drapeau etat_poele du composant arrive jusqu’à l’index', async () => {
  const reg = await registresDuComposant({ callWS: async () => ({ index: { version: 1,
    areas: [], floors: [], devices: [{ id: 'poele', name: 'Poêle' }],
    entities: [{ id: ETAT, device: 'poele', etat_poele: true }, { id: MODE, device: 'poele' }],
  } }) });
  const ents = Object.fromEntries(reg.entities.map(e => [e.entity_id, e.etat_poele]));
  assert.deepEqual(ents, { [ETAT]: true, [MODE]: false });
});

/* P3 : le rail. */
const rail = (S, signales, nomAppareil = () => 'Poêle') => pointsAttention({ S, veilles: { signales }, nomAppareil })
  .filter(p => p.cle.indexOf('entretien:') === 0);
const compteur = (v) => ({ [ENTRETIEN]: { entity_id: ENTRETIEN, state: String(v), attributes: { friendly_name: 'Poêle Next Maintenance', unit_of_measurement: 'h' } } });

test('P3 : l’entretien signalé par la veille fait un point dans le rail, au nom de l’appareil', () => {
  const [p] = rail(compteur(38), ['entretien:' + ENTRETIEN]);
  assert.deepEqual({ ...p, icone: undefined }, { cle: 'entretien:' + ENTRETIEN, niveau: 'info', icone: undefined, titre: 'Entretien du poêle dans 38 h',
    sous: 'Poêle', vue: 'objets', haid: ENTRETIEN });
  assert.equal(iconePoint(p), ICONES_ATTENTION.entretien);
  // Dû (0 h ou moins), une alerte ; muet, le point reste — le serveur l'a signalé —, sans chiffre.
  assert.deepEqual(rail(compteur(0), ['entretien:' + ENTRETIEN]).map(x => [x.niveau, x.titre]), [['alerte', 'Entretien du poêle à faire']]);
  assert.deepEqual(rail(compteur('unavailable'), ['entretien:' + ENTRETIEN]).map(x => [x.niveau, x.titre]), [['info', 'Entretien du poêle à faire']]);
  // Sans appareil connu, le nom du capteur.
  assert.equal(rail(compteur(38), ['entretien:' + ENTRETIEN], () => null)[0].sous, 'Poêle Next Maintenance');
});

test('P3 : sans signal du serveur, pas de point — le rail ne juge pas le compteur lui-même', () => {
  assert.deepEqual(rail(compteur(12), []), []);
  assert.deepEqual(rail(compteur(12), ['conso:' + ENTRETIEN]), []);
});
