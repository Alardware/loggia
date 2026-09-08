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
import { planAction, runPlan, datesEvenement, finApresDebut, champsDepuisEvenement } from '../src/actions.js';

const AGENDA = { state: 'off', attributes: { friendly_name: 'Maison', supported_features: 7 } };
// Un agenda qui sait creer et RIEN d'autre : les trois bits sont independants.
const CREE_SEUL = { state: 'off', attributes: { friendly_name: 'Partagé', supported_features: 1 } };
const LECTURE = { state: 'off', attributes: { friendly_name: 'Jours fériés', supported_features: 0 } };
const CTX = {
  states: { 'calendar.maison': AGENDA, 'calendar.feries': LECTURE, 'calendar.partage': CREE_SEUL },
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

// ─────────────────────────────────────────────────────────────────────────────
// Modifier et supprimer : deux gestes qui ne sont PAS des services.
//
// Relevé sur une installation réelle plutôt que supposé. `hass.services.calendar`
// ne contient que `create_event` et `get_events` ; `calendar/event/update` et
// `calendar/event/delete` répondent « format invalide » là où une commande
// inconnue répond « unknown_command ». Le serveur a même dicté leur schéma :
// « required key not provided at 'uid' », puis « … at 'event' ».
//
// Le moteur les porte quand même — capacité vérifiée, refus expliqué, canal
// d'échec commun. Seul le dernier mètre change.
// ─────────────────────────────────────────────────────────────────────────────

test('les trois bits sont lus séparément', () => {
  const c = entityCaps('calendar.maison', AGENDA, null).can;
  assert.ok(c.has('creer_evenement') && c.has('supprimer_evenement') && c.has('modifier_evenement'));
  // Un agenda partagé en écriture peut n'autoriser que l'ajout.
  const seul = entityCaps('calendar.partage', CREE_SEUL, null).can;
  assert.ok(seul.has('creer_evenement'));
  assert.ok(!seul.has('supprimer_evenement') && !seul.has('modifier_evenement'));
});

test('un agenda qui ne sait qu’ajouter refuse la suppression', () => {
  const p = planAction('calendar.partage', 'supprimer_evenement', 'uid-1', CTX, {});
  assert.equal(p.ok, false);
  assert.match(p.reason, /supprimer_evenement/);
});

test('supprimer produit une commande WebSocket, pas un service', () => {
  const p = planAction('calendar.maison', 'supprimer_evenement', 'uid-42', CTX, {});
  assert.equal(p.ok, true);
  assert.equal(p.ws, 'calendar/event/delete');
  assert.equal(p.service, undefined);
  // L'entité voyage DANS le message, pas dans une cible à part : c'est ce que
  // `callWS` attend, et ce que le serveur a réclamé quand on l'a omise.
  assert.equal(p.target, null);
  assert.deepEqual(p.data, { entity_id: 'calendar.maison', uid: 'uid-42' });
});

test('modifier imbrique les nouvelles valeurs dans « event »', () => {
  // À plat, le serveur répond « required key not provided at 'event' ».
  const p = planAction('calendar.maison', 'modifier_evenement', 'uid-42', CTX,
    { event: { summary: 'Dentiste', start_date_time: '2026-09-10 09:00:00', end_date_time: '2026-09-10 10:00:00' } });
  assert.equal(p.ws, 'calendar/event/update');
  assert.deepEqual(p.data, {
    entity_id: 'calendar.maison',
    uid: 'uid-42',
    event: { summary: 'Dentiste', start_date_time: '2026-09-10 09:00:00', end_date_time: '2026-09-10 10:00:00' },
  });
});

test('une occurrence de série emporte son identifiant et sa portée', () => {
  // Sans `recurrence_id`, Home Assistant ne saurait pas de quelle occurrence on
  // parle ; sans `recurrence_range`, il n'en efface qu'une — son défaut.
  const p = planAction('calendar.maison', 'supprimer_evenement', 'uid-42', CTX,
    { recurrence_id: '20260910T090000', recurrence_range: 'THISANDFUTURE' });
  assert.deepEqual(p.data, {
    entity_id: 'calendar.maison', uid: 'uid-42',
    recurrence_id: '20260910T090000', recurrence_range: 'THISANDFUTURE',
  });
});

test('un plan WebSocket part par callWS, un plan de service par callService', async () => {
  const vus = [];
  const hass = {
    callWS: (m) => { vus.push(['ws', m.type]); return Promise.resolve({}); },
    callService: (d, s) => { vus.push(['service', d + '.' + s]); return Promise.resolve(); },
  };
  await runPlan(hass, planAction('calendar.maison', 'supprimer_evenement', 'uid-42', CTX, {}));
  await runPlan(hass, planAction('calendar.maison', 'creer_evenement', 'Dentiste', CTX,
    { start_date: '2026-09-10', end_date: '2026-09-11' }));
  assert.deepEqual(vus, [['ws', 'calendar/event/delete'], ['service', 'calendar.create_event']]);
});

test('un échec WebSocket revient à l’appelant, il ne se perd pas', () => {
  // Le formulaire doit pouvoir dire POURQUOI, sur place. Un `catch` muet ici
  // rendrait le bouton silencieux — le défaut que ce moteur existe pour éviter.
  const hass = { callWS: () => Promise.reject(new Error('not allowed')), callService: () => Promise.resolve() };
  return runPlan(hass, planAction('calendar.maison', 'supprimer_evenement', 'uid-42', CTX, {}))
    .then((r) => {
      assert.equal(r.ok, false);
      assert.match(r.reason, /not allowed/);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// L'aller-retour : lire un événement, le réécrire, retrouver le même.
//
// C'est le piège de la fin exclusive, pris à l'envers. L'API rend `end.date`
// exclusive : un rendez-vous du 10 revient « du 10 au 11 ». L'afficher tel quel
// ferait croire à deux jours — et le réenregistrer en ajouterait un à chaque
// passage, un événement qui s'allonge tout seul à chaque modification.
// ─────────────────────────────────────────────────────────────────────────────

test('une journée entière relue perd le jour ajouté à l’écriture', () => {
  assert.deepEqual(champsDepuisEvenement({ start: { date: '2026-09-10' }, end: { date: '2026-09-11' } }),
    { journee: true, dDebut: '2026-09-10', hDebut: '', dFin: '2026-09-10', hFin: '' });
});

test('l’aller-retour ne déplace rien, journée entière', () => {
  const avant = { start: { date: '2026-09-10' }, end: { date: '2026-09-13' } };
  const c = champsDepuisEvenement(avant);
  const apres = datesEvenement(c.journee, c.dDebut, c.hDebut, c.dFin, c.hFin);
  assert.deepEqual(apres, { start_date: '2026-09-10', end_date: '2026-09-13' });
});

test('l’aller-retour ne déplace rien, avec des heures', () => {
  const c = champsDepuisEvenement({
    start: { dateTime: '2026-09-10T09:00:00' }, end: { dateTime: '2026-09-10T10:30:00' },
  });
  assert.deepEqual(c, { journee: false, dDebut: '2026-09-10', hDebut: '09:00', dFin: '2026-09-10', hFin: '10:30' });
  assert.deepEqual(datesEvenement(c.journee, c.dDebut, c.hDebut, c.dFin, c.hFin),
    { start_date_time: '2026-09-10 09:00:00', end_date_time: '2026-09-10 10:30:00' });
});

test('une journée entière sans fin ne remonte pas avant son début', () => {
  // Un agenda qui omet `end` laisserait sinon une fin la veille du début, et le
  // formulaire s'ouvrirait sur des dates impossibles.
  const c = champsDepuisEvenement({ start: { date: '2026-09-10' }, end: {} });
  assert.equal(c.dFin, '2026-09-10');
});
