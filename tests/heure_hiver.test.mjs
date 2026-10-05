// ─────────────────────────────────────────────────────────────────────────────
// Un jour n'a pas toujours vingt-quatre heures (audit du 03/10).
//
// Le dimanche 25 octobre 2026 en compte vingt-cinq en France, le dimanche
// 28 mars 2027 vingt-trois. Partout où un jour se calculait en ajoutant
// `864e5` à un minuit, le calendrier se décalait :
//  - la grille du mois montrait deux fois le 25 et toute la fin d'octobre
//    tombait sous le mauvais jour de semaine ;
//  - un rendez-vous le 25 à 23 h 30 n'appartenait à aucun jour ;
//  - au printemps, un rendez-vous à 0 h 30 comptait sur deux jours ;
//  - « Demain » s'affichait pour un rendez-vous du jour même.
// Et, sans changement d'heure cette fois : un lave-vaisselle lancé avant
// minuit affichait « 0min » jusqu'à la fin de son cycle.
//
// Ces tests tournent dans le fuseau de Paris, ET le vérifient : sur une
// machine en UTC (la CI), sans cette garde, ils passeraient sans rien prouver.
// ─────────────────────────────────────────────────────────────────────────────

process.env.TZ = 'Europe/Paris';

import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { jourPlus, ecartJours, plageSemaine, toucheJour, comptesParJour, joursAgenda, evenementsDuJour } from '../src/agenda.js';
import { minutesDepuisHeure } from '../src/format.js';
import { tr } from '../src/i18n.js';
import { composant } from './rendu.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

test('le fuseau de Paris est bien en place (sinon les tests suivants ne prouvent rien)', () => {
  assert.equal(new Date(2026, 9, 24, 12).getTimezoneOffset(), -120, 'heure d’été attendue le 24/10');
  assert.equal(new Date(2026, 9, 26, 12).getTimezoneOffset(), -60, 'heure d’hiver attendue le 26/10');
  assert.equal(new Date(2026, 9, 26).getTime() - new Date(2026, 9, 25).getTime(), 25 * 3600e3, 'le 25/10/2026 doit compter 25 h');
});

/** La grille du mois telle que la construit la feuille Calendrier. */
const grille = (premierDuMois) => {
  const d = new Date(premierDuMois); d.setDate(1 - ((premierDuMois.getDay() + 6) % 7)); d.setHours(0, 0, 0, 0);
  return Array.from({ length: 42 }, (_, i) => jourPlus(d, i));
};

test('la grille d’octobre 2026 n’a qu’un 25, et chaque jour sous sa colonne', () => {
  const jours = grille(new Date(2026, 9, 1));
  assert.equal(jours.filter((j) => j.getMonth() === 9 && j.getDate() === 25).length, 1, 'le 25 apparaît deux fois');
  jours.forEach((j, i) => {
    assert.equal((j.getDay() + 6) % 7, i % 7, `${j.toDateString()} n’est pas sous la bonne colonne`);
    assert.equal(j.getHours(), 0, `${j.toDateString()} ne commence pas à minuit`);
  });
  const lundi26 = jours.findIndex((j) => j.getMonth() === 9 && j.getDate() === 26);
  assert.equal(lundi26 % 7, 0, 'le lundi 26 n’est plus sous « L »');
});

test('la grille de mars 2027 garde ses 31 jours au passage à l’heure d’été', () => {
  const jours = grille(new Date(2027, 2, 1));
  const mars = jours.filter((j) => j.getMonth() === 2).map((j) => j.getDate());
  assert.deepEqual(mars, Array.from({ length: 31 }, (_, i) => i + 1));
  jours.forEach((j, i) => assert.equal((j.getDay() + 6) % 7, i % 7));
});

test('la fin de la grille est un minuit, pas 23 h la veille', () => {
  const fin = jourPlus(new Date(2026, 8, 28), 42);
  assert.deepEqual([fin.getDate(), fin.getMonth(), fin.getHours()], [9, 10, 0], 'six semaines après le 28/09 : le 9 novembre à minuit');
});

const rdv = (iso) => ({ summary: 'Rendez-vous', start: { dateTime: iso }, end: { dateTime: iso } });

test('un rendez-vous le 25 octobre à 23 h 30 appartient au 25', () => {
  const e = rdv('2026-10-25T23:30:00+01:00');
  assert.ok(toucheJour(e, new Date(2026, 9, 25)), 'il a disparu du 25');
  assert.ok(!toucheJour(e, new Date(2026, 9, 26)), 'il est passé au 26');
  const jours = joursAgenda(new Date(2026, 9, 20));
  const total = Object.values(comptesParJour([e], jours)).reduce((a, b) => a + b, 0);
  assert.equal(total, 1, 'la bande des sept jours ne le compte pas une fois exactement');
  assert.equal(evenementsDuJour([e], new Date(2026, 9, 25)).length, 1, 'choisir le 25 ne le liste pas');
});

test('au printemps, un rendez-vous à 0 h 30 ne compte que sur son jour', () => {
  const e = rdv('2027-03-29T00:30:00+02:00');
  assert.ok(!toucheJour(e, new Date(2027, 2, 28)), 'il déborde sur le 28');
  assert.ok(toucheJour(e, new Date(2027, 2, 29)));
});

test('une journée entière reste sur son seul jour, de part et d’autre du changement', () => {
  const j = { summary: 'Fête', start: { date: '2026-10-25' }, end: { date: '2026-10-26' } };
  assert.ok(toucheJour(j, new Date(2026, 9, 25)));
  assert.ok(!toucheJour(j, new Date(2026, 9, 24)));
  assert.ok(!toucheJour(j, new Date(2026, 9, 26)));
});

test('la plage de sept jours demandée aux calendriers finit à minuit', () => {
  const { debut, fin } = plageSemaine(new Date(2026, 9, 20, 15, 42));
  assert.deepEqual([debut.getDate(), debut.getHours()], [20, 0]);
  assert.deepEqual([fin.getDate(), fin.getMonth(), fin.getHours()], [27, 9, 0], 'la plage s’arrêtait le 26 à 23 h : la dernière heure n’était pas demandée');
});

test('aujourd’hui, demain : des jours de calendrier', () => {
  assert.equal(ecartJours(new Date(2026, 9, 25, 8), new Date(2026, 9, 25, 23, 30)), 0, '« Demain » pour un rendez-vous du jour');
  assert.equal(ecartJours(new Date(2026, 9, 24, 23), new Date(2026, 9, 25, 23, 30)), 1);
  assert.equal(ecartJours(new Date(2027, 2, 28, 0, 15), new Date(2027, 2, 29, 0, 30)), 1);
  assert.equal(ecartJours(new Date(2026, 9, 26), new Date(2026, 9, 25, 23)), -1);
});

test('« Demain » ne se calcule plus en heures dans jourAgenda', () => {
  const app = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
  const debut = app.indexOf('function jourAgenda(e)');
  const corps = app.slice(debut, app.indexOf('\n}\n', debut));
  assert.ok(corps.includes('ecartJours(new Date(), d)'), 'jourAgenda ne compte plus en jours de calendrier');
  assert.ok(!/864e5|86400000/.test(corps));
});

test('aucun jour de calendrier compté en 24 h dans l’agenda et la feuille Calendrier', () => {
  // Les endroits qui avaient le défaut. Une durée réelle (« il y a 24 h »,
  // un historique) reste en millisecondes, et c'est juste.
  const agenda = readFileSync(join(RACINE, 'src', 'agenda.js'), 'utf8');
  assert.ok(!/getTime\(\) \+ (n \* )?864e5/.test(agenda), 'agenda.js ajoute encore 24 h à un minuit');
  const app = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
  const debut = app.indexOf('function FeuilleCalendrier(');
  const feuille = app.slice(debut, app.indexOf('\nfunction ', debut + 10));
  assert.ok(!/864e5/.test(feuille), 'la feuille Calendrier compte encore ses jours en 24 h');
  const lecture = app.slice(app.indexOf('const lire = async () => {'), app.indexOf('const lire = async () => {') + 600);
  assert.ok(!/\* 864e5/.test(lecture), 'la plage de l’agenda compte encore sept fois 24 h');
});

// ── Le lave-vaisselle lancé avant minuit ─────────────────────────────────────

const H = (h, m = 0) => h * 3600 + m * 60;

test('un départ à 23 h 30 se compte encore après minuit', () => {
  const depart = H(23, 30);
  assert.equal(minutesDepuisHeure(depart, new Date(2026, 9, 3, 23, 59)), 29);
  assert.equal(minutesDepuisHeure(depart, new Date(2026, 9, 4, 0, 1)), 31, '« 0min » après minuit');
  assert.equal(minutesDepuisHeure(depart, new Date(2026, 9, 4, 1, 20)), 110);
  assert.equal(minutesDepuisHeure(depart, new Date(2026, 9, 3, 23, 30)), 0);
});

test('un départ du jour se compte normalement, et l’absence de départ se dit', () => {
  assert.equal(minutesDepuisHeure(H(8, 15), new Date(2026, 9, 3, 9, 45)), 90);
  assert.equal(minutesDepuisHeure(0, new Date()), null, 'pas de départ connu');
  assert.equal(minutesDepuisHeure(undefined, new Date()), null);
  assert.equal(minutesDepuisHeure('abc', new Date()), null);
});

test('un horodatage complet (date et heure) se lit tel quel', () => {
  const lance = new Date(2026, 9, 3, 23, 30);
  assert.equal(minutesDepuisHeure(lance.getTime() / 1000, new Date(2026, 9, 4, 0, 40)), 70);
});

test('la ligne Lave-vaisselle passe par minutesDepuisHeure', () => {
  const app = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
  assert.ok(app.includes('const elapsedMin = minutesDepuisHeure(ts);'));
  assert.ok(!app.includes('todayStart + ts'), 'le calcul qui donnait « 0min » après minuit est revenu');
});

// ── « hier » dans les journaux ───────────────────────────────────────────────

test('« hier » reste la veille entre 0 h et 1 h, le lendemain du passage à l’heure d’été', async () => {
  const quandCourt = await composant('views/parcommun.jsx', 'quandCourt');
  const veille = new Date(2027, 2, 28, 10, 0).getTime() / 1000;
  mock.timers.enable({ apis: ['Date'], now: new Date(2027, 2, 29, 0, 30).getTime() });
  try {
    assert.ok(quandCourt(veille).startsWith(tr('hier') + ' '), 'l’événement de la veille a perdu son « hier » : ' + quandCourt(veille));
  } finally {
    mock.timers.reset();
  }
});
