// ─────────────────────────────────────────────────────────────────────────────
// Tempo complet (chantier G3, E4 ; ADR 0302).
//
//  — Le créneau d'heures creuses de `rtetempo` n'a pas de clé de traduction :
//    le serveur le reconnaît à son identifiant stable (`_off_peak`) et pose son
//    RÔLE dans l'index (`tarif: 'creneau'`). Toujours un seul candidat ; la clé
//    de traduction garde la priorité — une maison où elle trouvait déjà son
//    créneau ne perd rien.
//  — « Demain : jour rouge » dans le rail de l'Accueil, seulement si demain est
//    rouge : rare et actionnable. La couleur du lendemain est un `enum` dont
//    les options disent bleu, blanc et rouge, marqué par le serveur.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { trouverCreneau, trouverCouleurDemain } from '../src/creneau.js';
import { pointsAttention, jourRouge } from '../src/attention.js';
import { registresDuComposant, buildIndex } from '../src/discovery.js';
import { resolveEnergy } from '../src/resolve.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const DASH = readFileSync(join(RACINE, 'src', 'accueil', 'dashboard.jsx'), 'utf8');

test('le créneau par la clé de traduction d’abord, par le rôle du serveur ensuite', () => {
  const tempo = { id: 'binary_sensor.rte_tempo_heures_creuses', cle: '', tarif: 'creneau' };
  assert.equal(trouverCreneau([tempo, { id: 'binary_sensor.porte', cle: '' }]), 'binary_sensor.rte_tempo_heures_creuses');
  // La clé de traduction trouve déjà le sien : rien ne change pour cette maison.
  assert.equal(trouverCreneau([{ id: 'binary_sensor.linky_hc', cle: 'hc_active' }, tempo]), 'binary_sensor.linky_hc');
  // Deux rôles : on se tait.
  assert.equal(trouverCreneau([tempo, { ...tempo, id: 'binary_sensor.autre' }]), null);
  // Désactivé : ne compte pas.
  assert.equal(trouverCreneau([{ ...tempo, desactive: true }]), null);
  assert.equal(trouverCreneau([{ id: 'sensor.x', cle: '', tarif: 'creneau' }]), null, 'un créneau est un capteur binaire');
});

test('la couleur du lendemain : un seul candidat', () => {
  const demain = { id: 'sensor.rte_tempo_prochaine_couleur', tarif: 'couleur_demain' };
  assert.equal(trouverCouleurDemain([demain, { id: 'sensor.rte_tempo_couleur_actuelle', tarif: 'couleur' }]), 'sensor.rte_tempo_prochaine_couleur');
  assert.equal(trouverCouleurDemain([demain, { ...demain, id: 'sensor.autre' }]), null);
  assert.equal(trouverCouleurDemain([]), null);
});

test('rouge, red, TEMPO_ROUGE : rouge ; le reste non', () => {
  assert.equal(jourRouge('Rouge'), true);
  assert.equal(jourRouge('red'), true);
  assert.equal(jourRouge('TEMPO_ROUGE'), true);
  assert.equal(jourRouge('Blanc'), false);
  assert.equal(jourRouge('unknown'), false);
  assert.equal(jourRouge(null), false);
});

test('l’index garde le rôle que le serveur pose', async () => {
  const hass = { callWS: async () => ({ index: { version: 1, areas: [], devices: [], floors: [], entities: [
    { id: 'sensor.rte_tempo_prochaine_couleur', tarif: 'couleur_demain' },
    { id: 'binary_sensor.rte_tempo_heures_creuses', tarif: 'creneau' },
  ] } }) };
  const r = await registresDuComposant(hass);
  const ix = buildIndex({ ...r, states: {} });
  assert.equal(ix.entityMeta.get('sensor.rte_tempo_prochaine_couleur').tarif, 'couleur_demain');
  // Avec ou sans tableau Énergie, la couleur du lendemain se trouve ; le créneau, avec.
  const sans = resolveEnergy({ index: ix, states: {}, energyPrefs: null, userCfg: {} });
  assert.equal(sans.haids.tempoDemain, 'sensor.rte_tempo_prochaine_couleur');
  const avec = resolveEnergy({ index: ix, states: {}, energyPrefs: { energy_sources: [] }, userCfg: {} });
  assert.equal(avec.haids.hcActive, 'binary_sensor.rte_tempo_heures_creuses');
  assert.equal(avec.haids.tempoDemain, 'sensor.rte_tempo_prochaine_couleur');
});

test('« Demain : jour rouge » dans le rail, et seulement si demain est rouge', () => {
  const S = (etat) => ({ 'sensor.demain': { state: etat, attributes: { options: ['Bleu', 'Blanc', 'Rouge'], friendly_name: 'Prochaine couleur' } } });
  const rouge = pointsAttention({ S: S('Rouge'), tempoDemain: 'sensor.demain' });
  assert.equal(rouge.length, 1);
  assert.equal(rouge[0].titre, 'Demain : jour rouge');
  assert.equal(rouge[0].vue, 'energie', 'actionnable : il mène à l’Énergie');
  assert.equal(rouge[0].niveau, 'info');
  assert.deepEqual(pointsAttention({ S: S('Blanc'), tempoDemain: 'sensor.demain' }), []);
  assert.deepEqual(pointsAttention({ S: S('unknown'), tempoDemain: 'sensor.demain' }), []);
  assert.deepEqual(pointsAttention({ S: S('Rouge') }), [], 'sans rôle désigné, rien');
  assert.match(DASH, /tempoDemain:/, 'l’Accueil passe la couleur du lendemain au centre d’attention');
});
