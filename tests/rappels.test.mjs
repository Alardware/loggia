// Les rappels de l'Accueil (maquette du 03/10) et la carte Collecte.
//
// « Vois pour la photo 2 s'il te plaît » : une carte Rappels avec son compte,
// trois onglets — Aujourd'hui · Demain · Plus tard —, une pastille de couleur
// par catégorie, l'heure à droite, « En retard » en rouge.
//
// « Il faut que ce soit adapté a tous pas juste a moi » : les catégories sont
// les listes `todo.*` de CHACUN, et le capteur de collecte se lit sous les
// formes qu'on rencontre — attributs écrits à la main, intégration répandue,
// un simple état, ou un calendrier de ramassage.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// La langue de la machine ne doit pas changer le résultat (garde-fou de la CI).
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true });

const {
  listesTodo, teinteListe, echeanceDe, lireTodo, rangerTodos, ONGLETS_RAPPELS,
  peutCreer, peutCocher, peutSupprimer, peutDater, peutHeurer,
} = await import('../src/todos.js');
const { lireCollecte, dateDe } = await import('../src/collecte.js');

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');

// Samedi 3 octobre 2026, 14 h — l'heure de la maquette.
const AUJ = new Date(2026, 9, 3, 14, 0, 0);
const MAISON = { id: 'todo.maison', nom: 'Maison', rgb: teinteListe('todo.maison') };
const t = (summary, due, status = 'needs_action') => ({ uid: summary, summary, due, status });

/* ════════════ LES LISTES ════════════ */

test('les catégories sont les listes de CHACUN, pas une table écrite ici', () => {
  const S = {
    'todo.maison': { state: '4', attributes: { friendly_name: 'Maison' } },
    'todo.sante': { state: '1', attributes: { friendly_name: 'Santé' } },
    'todo.boodschappen': { state: '0', attributes: {} },
    'light.salon': { state: 'on', attributes: { friendly_name: 'Salon' } },
  };
  const l = listesTodo(S);
  assert.deepEqual(l.map(x => x.nom), ['boodschappen', 'Maison', 'Santé'], 'par ordre alphabétique, et rien que des `todo.`');
  assert.equal(l.find(x => x.id === 'todo.boodschappen').nom, 'boodschappen', 'sans nom déclaré, celui de l’entité');
  assert.deepEqual(listesTodo({}), [], 'pas de liste chez vous : pas de carte');
  assert.deepEqual(listesTodo(null), []);
  // Aucun nom de catégorie n'est écrit dans le code : ils viennent tous de HA.
  const src = lire('src', 'todos.js');
  for (const mot of ['Maison', 'Santé', 'Voiture', 'Courses']) {
    assert.ok(!src.includes("'" + mot + "'"), mot + ' ne doit pas être écrit en dur : c’est la maison de quelqu’un');
  }
});

test('la teinte d’une liste ne bouge pas d’un rechargement à l’autre', () => {
  assert.equal(teinteListe('todo.maison'), teinteListe('todo.maison'));
  assert.notEqual(teinteListe('todo.maison'), teinteListe('todo.sante'));
  assert.match(teinteListe('todo.quoi'), /^\d+,\d+,\d+$/, 'un triplet, posé tel quel dans un rgba()');
  assert.ok(teinteListe(null), 'même sans identifiant, une couleur plutôt qu’un trou');
});

/* ════════════ L'ÉCHÉANCE ════════════ */

test('l’échéance : une date seule n’est pas une heure', () => {
  assert.deepEqual(echeanceDe(t('x', '2026-10-03')), { date: new Date(2026, 9, 3), avecHeure: false });
  assert.equal(echeanceDe(t('x', '2026-10-03T18:00:00')).avecHeure, true);
  assert.deepEqual(echeanceDe(t('x', '2026-10-03T18:00:00')).date, new Date(2026, 9, 3, 18));
  assert.equal(echeanceDe(t('x', '2026-10-03')).date.getHours(), 0, 'une date nue est LOCALE, à minuit');
  assert.equal(echeanceDe(t('x', '')), null);
  assert.equal(echeanceDe(t('x', 'bientôt')), null, 'une date illisible n’en est pas une');
  assert.equal(echeanceDe({ summary: 'sans date' }), null);
  assert.equal(echeanceDe(null), null);
});

test('« en retard » : à l’heure près quand il y a une heure, au jour près sinon', () => {
  const q = (due) => lireTodo(t('x', due), MAISON, AUJ).quand;
  assert.equal(q('2026-10-03T13:00:00'), 'retard', '13 h est passé, il est 14 h');
  assert.equal(q('2026-10-03T18:00:00'), 'aujourdhui');
  assert.equal(q('2026-10-03'), 'aujourdhui', 'une tâche du jour sans heure ne rougit pas dès minuit une');
  assert.equal(q('2026-10-02'), 'retard', '… mais son lendemain, oui');
  assert.equal(q('2026-10-02T23:59:00'), 'retard');
  assert.equal(q('2026-10-04'), 'demain');
  assert.equal(q('2026-10-04T08:00:00'), 'demain');
  assert.equal(q('2026-10-05'), 'plustard');
  assert.equal(q('2027-01-01'), 'plustard');
  assert.equal(q(undefined), 'sansdate');
});

test('une tâche prête à montrer porte sa liste, sa teinte et son état', () => {
  const x = lireTodo(t('Arroser les plantes', '2026-10-03T18:00:00'), MAISON, AUJ);
  assert.equal(x.titre, 'Arroser les plantes');
  assert.equal(x.categorie, 'Maison');
  assert.equal(x.listeId, 'todo.maison');
  assert.equal(x.rgb, teinteListe('todo.maison'));
  assert.equal(x.avecHeure, true);
  assert.equal(x.fait, false);
  assert.ok(x.cle.startsWith('todo.maison|'), 'la clé porte la liste : deux listes peuvent avoir le même uid');
  assert.equal(lireTodo(t('Fait', '2026-10-03', 'completed'), MAISON, AUJ).fait, true);
  assert.equal(lireTodo({ summary: '  Espaces  ' }, MAISON, AUJ).titre, 'Espaces');
  assert.equal(lireTodo({}, null, AUJ).categorie, '', 'sans liste, pas de catégorie — et pas de plantage');
});

/* ════════════ LES TROIS ONGLETS ════════════ */

test('les onglets de la maquette, et le retard en tête d’Aujourd’hui', () => {
  assert.deepEqual(ONGLETS_RAPPELS, ['aujourdhui', 'demain', 'plustard']);
  const taches = [
    t('Arroser les plantes', '2026-10-03T18:00:00'),
    t('Prendre les médicaments', '2026-10-03T20:00:00'),
    t('Recharger la voiture', '2026-10-03T22:00:00'),
    t('Fermer les volets du bureau', '2026-10-03T09:00:00'),   // passée : en retard
    t('Courses', '2026-10-04T10:00:00'),
    t('Vidange', '2026-10-20'),
    t('Déjà fait', '2026-10-03T08:00:00', 'completed'),
    t('Un jour', undefined),
  ].map(x => lireTodo(x, MAISON, AUJ));

  const r = rangerTodos(taches, AUJ);
  assert.deepEqual(r.aujourdhui.map(x => x.titre),
    ['Fermer les volets du bureau', 'Arroser les plantes', 'Prendre les médicaments', 'Recharger la voiture'],
    'le retard d’abord, puis l’ordre des heures — comme la maquette');
  assert.deepEqual(r.demain.map(x => x.titre), ['Courses']);
  assert.deepEqual(r.plustard.map(x => x.titre), ['Vidange', 'Un jour'],
    'sans date, la tâche attend dans « Plus tard » — derrière celles qui ont un jour dit');
  assert.ok(!r.aujourdhui.some(x => x.titre === 'Déjà fait'), 'une tâche cochée ne compte plus');
  assert.equal(r.aujourdhui.length, 4, '« 4 à faire aujourd’hui » de la maquette');

  assert.deepEqual(rangerTodos([], AUJ), { aujourdhui: [], demain: [], plustard: [] });
  assert.deepEqual(rangerTodos(null, AUJ), { aujourdhui: [], demain: [], plustard: [] });
  assert.deepEqual(rangerTodos([lireTodo({ summary: '   ' }, MAISON, AUJ)], AUJ).plustard, [], 'une tâche sans titre n’est pas une ligne');
});

test('deux tâches à la même heure gardent un ordre stable', () => {
  const a = lireTodo(t('Bêta', '2026-10-03T18:00:00'), MAISON, AUJ);
  const b = lireTodo(t('Alpha', '2026-10-03T18:00:00'), MAISON, AUJ);
  assert.deepEqual(rangerTodos([a, b], AUJ).aujourdhui.map(x => x.titre), ['Alpha', 'Bêta']);
});

/* ════════════ LES DROITS D'UNE LISTE ════════════ */

test('une liste en lecture seule ne montre ni « + », ni case, ni corbeille', () => {
  // TodoListEntityFeature : CREATE 1, DELETE 2, UPDATE 4, SET_DUE_DATE 16, SET_DUE_DATETIME 32
  const complet = { attributes: { supported_features: 1 | 2 | 4 | 16 | 32 } };
  const lecture = { attributes: { supported_features: 0 } };
  for (const [f, nom] of [[peutCreer, 'créer'], [peutSupprimer, 'supprimer'], [peutCocher, 'cocher'], [peutDater, 'dater'], [peutHeurer, 'heurer']]) {
    assert.equal(f(complet), true, nom + ' sur une liste complète');
    assert.equal(f(lecture), false, nom + ' sur une liste en lecture seule');
    assert.equal(f(null), false, nom + ' sans entité');
    assert.equal(f({}), false, nom + ' sans attributs');
  }
  assert.equal(peutCreer({ attributes: { supported_features: 4 } }), false, 'pouvoir modifier ne donne pas le droit de créer');
  assert.equal(peutCocher({ attributes: { supported_features: 4 } }), true, 'cocher, c’est modifier');
});

/* ════════════ LA COLLECTE, CHEZ TOUT LE MONDE ════════════ */

test('le capteur écrit à la main : ses attributs font foi', () => {
  const c = lireCollecte({
    state: '16/10/2026',
    attributes: { jours_restants: 13, est_aujourd_hui: false, est_demain: false, date_formatee: '16 Oct', jour_semaine: 'Vendredi' },
  }, AUJ);
  assert.equal(c.jours, 13);
  assert.equal(c.aujourdhui, false);
  assert.equal(c.demain, false);
  assert.deepEqual(c.date, new Date(2026, 9, 16), 'treize jours après le 3 octobre');

  const auj = lireCollecte({ state: 'x', attributes: { jours_restants: 0, est_aujourd_hui: 'True' } }, AUJ);
  assert.equal(auj.aujourdhui, true, 'un gabarit mal cité rend « True », pas true');
  const dem = lireCollecte({ state: 'x', attributes: { jours_restants: 1, est_demain: true } }, AUJ);
  assert.equal(dem.demain, true);
  assert.equal(dem.aujourdhui, false);
  assert.equal(lireCollecte({ state: 'x', attributes: { jours_restants: 2, decale_samedi: 'True' } }, AUJ).decale, true);
});

test('une intégration répandue : `daysTo`, `date` et les types', () => {
  const c = lireCollecte({ state: 'in 2 days', attributes: { daysTo: 2, date: '2026-10-05', types: ['Jaune', 'Verre'] } }, AUJ);
  assert.equal(c.jours, 2);
  assert.deepEqual(c.date, new Date(2026, 9, 5));
  assert.deepEqual(c.types, ['Jaune', 'Verre']);
  assert.equal(c.aujourdhui, false);
  assert.equal(lireCollecte({ state: '', attributes: { days_to: 1, date: '2026-10-04' } }, AUJ).demain, true,
    'sans `est_demain`, un jour d’écart VAUT demain');
  assert.equal(lireCollecte({ state: '', attributes: { daysTo: 0, date: '2026-10-03' } }, AUJ).aujourdhui, true);
  assert.deepEqual(lireCollecte({ state: '', attributes: { daysTo: 3, type: 'Ordures ménagères' } }, AUJ).types,
    ['Ordures ménagères'], 'un seul type, en texte');
  assert.deepEqual(lireCollecte({ state: '', attributes: { daysTo: 3, types: 'Jaune, Verre' } }, AUJ).types, ['Jaune', 'Verre']);
});

test('rien que l’état : une date, ou un nombre de jours', () => {
  const parDate = lireCollecte({ state: '2026-10-16', attributes: {} }, AUJ);
  assert.equal(parDate.jours, 13, 'le nombre de jours se déduit de la date');
  assert.deepEqual(parDate.date, new Date(2026, 9, 16));
  const parJours = lireCollecte({ state: '5', attributes: {} }, AUJ);
  assert.equal(parJours.jours, 5);
  assert.deepEqual(parJours.date, new Date(2026, 9, 8), 'et la date se reconstruit — une carte sans date ne dirait rien');
  assert.equal(lireCollecte({ state: '0', attributes: {} }, AUJ).aujourdhui, true, 'zéro jour, c’est aujourd’hui — pas « rien »');
  assert.equal(lireCollecte({ state: '2026-10-16T06:30:00', attributes: {} }, AUJ).jours, 13, 'une date avec heure compte en JOURS');
});

test('ce qui ne se lit pas ne donne pas de carte', () => {
  for (const etat of [null, undefined, {}, { state: 'unavailable', attributes: {} }, { state: 'unknown', attributes: {} }, { state: '', attributes: {} }]) {
    assert.equal(lireCollecte(etat, AUJ), null, 'pas de carte vaut mieux qu’une carte qui invente');
  }
  assert.equal(lireCollecte({ state: '16/10', attributes: {} }, AUJ), null, 'deux nombres ne font pas un nombre de jours');
  assert.equal(dateDe('pas une date'), null);
  assert.equal(dateDe(null), null);
  assert.equal(dateDe('2026-13-45'), null, 'le 45 du mois 13 n’existe pas');
  assert.deepEqual(dateDe('2026-10-16'), new Date(2026, 9, 16), 'une date nue est LOCALE : sinon la veille au soir, elle recule d’un jour');
});

test('aucun identifiant d’entité en dur, et pas d’heure formatée à la main', () => {
  for (const f of ['todos.js', 'collecte.js']) {
    const s = lire('src', f);
    assert.ok(!/['"](todo|sensor|calendar)\.[a-z0-9_]+['"]/.test(s), f + ' : une entité en dur ne vaut que chez une personne');
    assert.ok(!s.includes('toLocaleTimeString') && !s.includes('toLocaleDateString'),
      f + ' : ces modules CALCULENT, ils n’écrivent pas — la langue se décide à l’affichage');
  }
});

test('un calendrier de ramassage : « j’ai créé dans HAOS les calendriers Collectes et Rappels »', async () => {
  const { collecteDuCalendrier } = await import('../src/collecte.js');
  const ev = (summary, date) => ({ summary, start: { date } });

  /* Beaucoup de communes publient un .ics : un calendrier suffit alors, sans
   * capteur à écrire. Le prochain jour fait foi, et ce qui tombe le MÊME jour
   * se rassemble — « Jaune » et « Verre » un matin, c’est une tournée. */
  const c = collecteDuCalendrier([
    ev('Verre', '2026-10-16'),
    ev('Jaune', '2026-10-16'),
    ev('Ordures', '2026-10-09'),
    ev('Passé', '2026-09-25'),
  ], AUJ);
  assert.equal(c.jours, 6, 'le 9 octobre, six jours après le 3');
  assert.deepEqual(c.date, new Date(2026, 9, 9));
  assert.deepEqual(c.types, ['Ordures'], 'seuls les événements de CE jour-là');

  const deux = collecteDuCalendrier([ev('Verre', '2026-10-16'), ev('Jaune', '2026-10-16')], AUJ);
  assert.deepEqual(deux.types, ['Verre', 'Jaune'], 'deux bacs le même matin : une tournée, deux types');

  assert.equal(collecteDuCalendrier([ev('Ce matin', '2026-10-03')], AUJ).aujourdhui, true,
    'la tournée du jour reste affichée — on n’a pas forcément sorti le bac');
  assert.equal(collecteDuCalendrier([ev('Demain', '2026-10-04')], AUJ).demain, true);
  assert.equal(collecteDuCalendrier([ev('Hier', '2026-10-02')], AUJ), null, 'la tournée d’hier est passée');
  assert.equal(collecteDuCalendrier([], AUJ), null, 'pas d’événement : pas de carte');
  assert.equal(collecteDuCalendrier(null, AUJ), null);
  assert.equal(collecteDuCalendrier([{ summary: 'sans date' }], AUJ), null);
  // Un rendez-vous à l'heure près compte quand même en JOURS.
  assert.equal(collecteDuCalendrier([{ summary: 'Tournée', start: { dateTime: '2026-10-06T06:30:00' } }], AUJ).jours, 3);
});

test('les deux ecritures de l’heure que Home Assistant emploie', () => {
  /* « 2026-10-03 19:30:00 » et « 2026-10-03T19:30:00 » disent la meme chose ;
   * selon l'integration, l'une ou l'autre revient. Lue a la lettre, la forme a
   * espace passait pour une date SANS heure, et la tache ajoutee pour ce soir
   * atterrissait dans « Plus tard ». */
  const avecT = echeanceDe({ due: '2026-10-03T19:30:00' });
  const avecEspace = echeanceDe({ due: '2026-10-03 19:30:00' });
  assert.deepEqual(avecEspace, avecT);
  assert.equal(avecEspace.avecHeure, true);
  assert.deepEqual(avecEspace.date, new Date(2026, 9, 3, 19, 30));
  assert.equal(lireTodo({ summary: 'Ce soir', due: '2026-10-03 19:30:00' }, MAISON, AUJ).quand, 'aujourdhui');
});
