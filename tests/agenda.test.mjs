// ─────────────────────────────────────────────────────────────────────────────
// Créer un rendez-vous depuis le dashboard.
//
// Home Assistant expose `calendar.create_event`, mais tous les agendas ne
// l'acceptent pas : un flux d'anniversaires ou un abonnement iCal est en
// lecture seule et n'a pas le bit `CREATE_EVENT`. Le dashboard ne doit donc pas
// proposer le geste partout — c'est la première chose vérifiée ici.
//
// La seconde est une règle qui ne se voit pas et se paie cher : `end_date`
// d'une journée entière est EXCLUSIVE. Un rendez-vous du 10 va du 10 au 11.
// Écrire du 10 au 10 fabrique une durée nulle, que Home Assistant accepte sans
// broncher et que plus rien n'affiche ensuite. Un test plutôt qu'un commentaire.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entityCaps } from '../src/capabilities.js';
import { planAction, datesEvenement, finApresDebut } from '../src/actions.js';

const AGENDA = { state: 'off', attributes: { friendly_name: 'Maison', supported_features: 1 } };
const LECTURE = { state: 'off', attributes: { friendly_name: 'Jours fériés', supported_features: 0 } };
const CTX = {
  states: { 'calendar.maison': AGENDA, 'calendar.feries': LECTURE },
  services: { calendar: { create_event: {} } },
};

// ── Qui accepte qu'on y écrive ──────────────────────────────────────────────

test('un agenda qui déclare le bit sait créer', () => {
  assert.ok(entityCaps('calendar.maison', AGENDA, null).can.has('creer_evenement'));
});

test('un agenda en lecture seule ne le déclare pas', () => {
  // Sans cette distinction, le bouton s'afficherait partout et ouvrirait un
  // formulaire condamné d'avance.
  assert.ok(!entityCaps('calendar.feries', LECTURE, null).can.has('creer_evenement'));
});

test('le moteur refuse un agenda en lecture seule, et dit pourquoi', () => {
  const p = planAction('calendar.feries', 'creer_evenement', 'Dentiste', CTX,
    { start_date_time: '2026-09-10 09:00:00', end_date_time: '2026-09-10 10:00:00' });
  assert.equal(p.ok, false);
  assert.match(p.reason, /creer_evenement/);
});

// ── Ce qui part sur le fil ──────────────────────────────────────────────────

test('un rendez-vous avec heure passe par la paire horaire', () => {
  const p = planAction('calendar.maison', 'creer_evenement', 'Dentiste', CTX,
    { start_date_time: '2026-09-10 09:00:00', end_date_time: '2026-09-10 10:00:00' });
  assert.equal(p.ok, true);
  assert.equal(p.domain, 'calendar');
  assert.equal(p.service, 'create_event');
  assert.deepEqual(p.target, { entity_id: 'calendar.maison' });
  assert.deepEqual(p.data, {
    summary: 'Dentiste',
    start_date_time: '2026-09-10 09:00:00',
    end_date_time: '2026-09-10 10:00:00',
  });
});

test('une journée entière passe par l’autre paire', () => {
  const p = planAction('calendar.maison', 'creer_evenement', 'Vacances', CTX,
    { start_date: '2026-09-10', end_date: '2026-09-11' });
  assert.deepEqual(p.data, { summary: 'Vacances', start_date: '2026-09-10', end_date: '2026-09-11' });
});

test('un champ que le service ne connaît pas n’est pas envoyé', () => {
  // Le moteur ne laisse passer que ce que le plan déclare accepter. Sans cette
  // barrière, une faute de frappe partirait au serveur et reviendrait en erreur
  // illisible.
  const p = planAction('calendar.maison', 'creer_evenement', 'Dentiste', CTX,
    { start_date_time: '2026-09-10 09:00:00', end_date_time: '2026-09-10 10:00:00', couleur: 'rouge' });
  assert.ok(!('couleur' in p.data));
});

// ── La fin exclusive ────────────────────────────────────────────────────────

test('une journée entière finit le LENDEMAIN', () => {
  assert.deepEqual(datesEvenement(true, '2026-09-10', '09:00', '2026-09-10', '10:00'),
    { start_date: '2026-09-10', end_date: '2026-09-11' });
});

test('plusieurs jours : la fin dépasse toujours d’un jour', () => {
  assert.deepEqual(datesEvenement(true, '2026-09-10', '09:00', '2026-09-12', '10:00'),
    { start_date: '2026-09-10', end_date: '2026-09-13' });
});

test('la fin exclusive franchit les mois et les années', () => {
  // Ajouter 864e5 à un horodatage tomberait à côté aux changements d'heure :
  // une journée d'octobre dure vingt-cinq heures. On passe par le calendrier.
  assert.equal(datesEvenement(true, '2026-09-30', '', '2026-09-30', '').end_date, '2026-10-01');
  assert.equal(datesEvenement(true, '2026-12-31', '', '2026-12-31', '').end_date, '2027-01-01');
  assert.equal(datesEvenement(true, '2028-02-28', '', '2028-02-28', '').end_date, '2028-02-29');
});

test('avec une heure, rien n’est décalé', () => {
  assert.deepEqual(datesEvenement(false, '2026-09-10', '09:00', '2026-09-10', '10:30'),
    { start_date_time: '2026-09-10 09:00:00', end_date_time: '2026-09-10 10:30:00' });
});

// ── L'ordre des bornes ──────────────────────────────────────────────────────

test('une fin avant le début est refusée', () => {
  assert.equal(finApresDebut(false, '2026-09-10', '18:00', '2026-09-10', '08:00'), false);
  assert.equal(finApresDebut(true, '2026-09-12', '', '2026-09-10', ''), false);
});

test('une durée nulle est refusée aussi', () => {
  // Home Assistant l'accepte et ne montre rien : le refus doit venir d'ici.
  assert.equal(finApresDebut(false, '2026-09-10', '09:00', '2026-09-10', '09:00'), false);
});

test('une journée entière sur un seul jour est valide', () => {
  // C'est le cas le plus courant, et le seul où début et fin sont égaux sans
  // que ce soit une erreur.
  assert.equal(finApresDebut(true, '2026-09-10', '', '2026-09-10', ''), true);
});

test('un rendez-vous qui passe minuit est valide', () => {
  assert.equal(finApresDebut(false, '2026-09-10', '23:00', '2026-09-11', '01:00'), true);
});
