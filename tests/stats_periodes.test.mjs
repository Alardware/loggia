// ─────────────────────────────────────────────────────────────────────────────
// Les statistiques longue durée : jour, semaine, mois, année (06/10).
//
// La vue Énergie s'arrêtait aux dernières 24 heures, faute de lire les
// STATISTIQUES de Home Assistant — la seule source qui remonte au-delà de
// quelques jours. Ce qui se vérifie ici, à sec :
//
//   — les bornes d'une période sont LOCALES (minuit chez l'habitant) et sa
//     fin est exclusive, comme l'attend Home Assistant ;
//   — on avance de case en case par le CALENDRIER : le mois d'un changement
//     d'heure compte ses 31 jours, pas 30 jours et 23 heures ;
//   — une case sans ligne rend `null`, jamais 0 (ADR 0030) ;
//   — une lecture ratée ne vide pas le graphe affiché.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';

// `i18n.js` résout sa langue à l'import : la fixer AVANT (règle du dépôt).
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true });
const { bornesStat, casesStat, repartir, sommeStat, instantStat, requeteStat, statsRelues, graduations, damier, libellePeriode, suitesPleines, PAS_STAT } =
  await import('../src/stats.js');

test('le jour va de minuit à minuit, en heure locale', () => {
  const t = new Date(2026, 9, 6, 14, 33).getTime();
  const b = bornesStat('jour', 0, t);
  assert.equal(b.pas, 'hour');
  assert.equal(b.n, 24);
  assert.equal(b.debut.getHours(), 0);
  assert.equal(b.debut.getDate(), 6);
  assert.equal(b.fin.getDate(), 7);
  assert.equal(b.fin.getHours(), 0);
});

test('la semaine commence le lundi', () => {
  // Le 6 octobre 2026 est un mardi : sa semaine commence le lundi 5.
  const b = bornesStat('semaine', 0, new Date(2026, 9, 6, 14, 33).getTime());
  assert.equal(b.debut.getDay(), 1);
  assert.equal(b.debut.getDate(), 5);
  assert.equal(b.n, 7);
  // Un dimanche appartient à la semaine qui l'a commencé, pas à la suivante.
  const d = bornesStat('semaine', 0, new Date(2026, 9, 11, 23, 0).getTime());
  assert.equal(d.debut.getDate(), 5);
});

test('un mois compte ses jours, changement d’heure compris', () => {
  // Octobre 2026 : 31 jours, dont celui où l'on recule d'une heure. Compter en
  // tranches de 24 h aurait donné 31,04 jours — et une case de trop ou de moins.
  const b = bornesStat('mois', 0, new Date(2026, 9, 6).getTime());
  assert.equal(b.n, 31);
  assert.equal(casesStat('mois', b).length, 31);
  // Février 2027 n'est pas bissextile ; février 2028 l'est.
  assert.equal(bornesStat('mois', 0, new Date(2027, 1, 10).getTime()).n, 28);
  assert.equal(bornesStat('mois', 0, new Date(2028, 1, 10).getTime()).n, 29);
});

test('les cases d’un mois tombent chacune sur son jour', () => {
  const cases = casesStat('mois', bornesStat('mois', 0, new Date(2026, 9, 6).getTime()));
  // La case du 25 octobre 2026 (dimanche du changement d'heure) fait 25 heures
  // et commence bien le 25 à minuit.
  const c = cases[24];
  assert.equal(new Date(c.debut).getDate(), 25);
  assert.equal(new Date(c.debut).getHours(), 0);
  assert.equal(new Date(c.fin).getDate(), 26);
  assert.equal(c.label, '25');
  // Aucune case ne chevauche la suivante, et aucune ne laisse de trou.
  for (let i = 1; i < cases.length; i++) assert.equal(cases[i].debut, cases[i - 1].fin);
});

test('le décalage remonte d’une période à la fois', () => {
  const t = new Date(2026, 9, 6).getTime();
  assert.equal(bornesStat('jour', 1, t).debut.getDate(), 5);
  assert.equal(bornesStat('mois', 1, t).debut.getMonth(), 8);
  assert.equal(bornesStat('annee', 1, t).debut.getFullYear(), 2025);
  assert.equal(bornesStat('semaine', 1, t).debut.getDate(), 28);
  // Un décalage négatif ne part pas dans l'avenir.
  assert.equal(bornesStat('jour', -3, t).debut.getDate(), 6);
});

test('l’année fait douze mois, nommés', () => {
  const b = bornesStat('annee', 0, new Date(2026, 9, 6).getTime());
  assert.equal(b.pas, 'month');
  const cases = casesStat('annee', b, 'fr-FR');
  assert.equal(cases.length, 12);
  assert.equal(cases[0].label, 'janv');
  assert.equal(new Date(cases[11].debut).getMonth(), 11);
});

test('une case sans ligne rend null, pas zéro', () => {
  const cases = casesStat('jour', bornesStat('jour', 0, new Date(2026, 9, 6).getTime()));
  const serie = repartir([{ start: cases[7].debut, change: 0.42 }], cases);
  assert.equal(serie.length, 24);
  assert.equal(serie[7], 0.42);
  assert.equal(serie[8], null, 'une heure sans ligne reste null');
  // Un zéro MESURÉ reste un zéro : il se distingue de l'absence.
  const z = repartir([{ start: cases[3].debut, change: 0 }], cases);
  assert.equal(z[3], 0);
  assert.notEqual(z[3], null);
});

test('plusieurs lignes dans une case s’additionnent', () => {
  const cases = casesStat('mois', bornesStat('mois', 0, new Date(2026, 9, 6).getTime()));
  const j = cases[5];
  const serie = repartir([
    { start: j.debut, change: 1 },
    { start: j.debut + 3600e3, change: 2 },
    { start: j.fin - 1, change: 0.5 },
  ], cases);
  assert.equal(serie[5], 3.5);
});

test('une ligne hors période s’écarte', () => {
  const cases = casesStat('jour', bornesStat('jour', 0, new Date(2026, 9, 6).getTime()));
  const serie = repartir([
    { start: cases[0].debut - 7200e3, change: 9 },
    { start: cases[23].fin + 1, change: 9 },
  ], cases);
  assert.equal(sommeStat(serie), null, 'rien ne tombe dans la période');
});

test('le facteur ramène une série à son repère', () => {
  // Une statistique arrive dans l'unité du capteur : un compteur en Wh vaut
  // mille fois moins en kWh, et les deux ne se tracent pas sur la même échelle.
  const cases = casesStat('jour', bornesStat('jour', 0, new Date(2026, 9, 6).getTime()));
  const serie = repartir([{ start: cases[1].debut, change: 2500 }], cases, 0.001);
  assert.equal(serie[1], 2.5);
});

test('la somme ignore les cases vides sans les compter pour zéro', () => {
  assert.equal(sommeStat([null, null]), null);
  assert.equal(sommeStat([null, 2, null, 3]), 5);
  assert.equal(sommeStat([0, null]), 0);
  assert.equal(sommeStat(null), null);
});

test('l’instant d’une ligne se lit en millisecondes ou en ISO', () => {
  assert.equal(instantStat(1759708800000), 1759708800000);
  assert.equal(instantStat('2026-10-06T00:00:00+00:00'), Date.parse('2026-10-06T00:00:00+00:00'));
  assert.equal(instantStat('n’importe quoi'), null);
  assert.equal(instantStat(undefined), null);
  assert.equal(instantStat(NaN), null);
});

test('la requête demande le changement, pas le cumul', () => {
  const b = bornesStat('semaine', 0, new Date(2026, 9, 6).getTime());
  const q = requeteStat(['sensor.un', 'sensor.deux'], b);
  assert.equal(q.type, 'recorder/statistics_during_period');
  assert.deepEqual(q.types, ['change'], 'sum est un cumul : il ne s’additionne pas');
  assert.equal(q.period, 'day');
  assert.deepEqual(q.statistic_ids, ['sensor.un', 'sensor.deux']);
  // Les bornes partent en ISO, fin exclusive.
  assert.equal(q.end_time, b.fin.toISOString());
});

test('chaque période demande son pas', () => {
  assert.deepEqual(PAS_STAT, { jour: 'hour', semaine: 'day', mois: 'day', annee: 'month', calendrier: 'day' });
  for (const p of Object.keys(PAS_STAT)) assert.equal(bornesStat(p).pas, PAS_STAT[p], p);
  // Une période inconnue retombe sur le jour plutôt que de rendre des bornes
  // vides : la vue affiche quelque chose, jamais un graphe mort.
  assert.equal(bornesStat('n’importe quoi').pas, 'hour');
  assert.equal(bornesStat(undefined).n, 24);
});

test('le libellé d’une période ne dit que des dates', () => {
  const t = new Date(2026, 9, 6, 14, 0).getTime();
  assert.equal(libellePeriode('annee', 0, t, 'fr-FR'), '2026');
  assert.equal(libellePeriode('annee', 1, t, 'fr-FR'), '2025');
  assert.equal(libellePeriode('mois', 0, t, 'fr-FR'), 'octobre 2026');
  assert.match(libellePeriode('jour', 0, t, 'fr-FR'), /mardi 6 octobre/);
  // « Aujourd'hui » et « Hier » sont des mots : ils restent à la vue.
  assert.ok(!/ujourd/.test(libellePeriode('jour', 0, t, 'fr-FR')));
});

test('une semaine à cheval sur deux mois les nomme tous les deux', () => {
  // Semaine du lundi 5 au dimanche 11 octobre : un seul mois.
  assert.equal(libellePeriode('semaine', 0, new Date(2026, 9, 6).getTime(), 'fr-FR'), '5 – 11 octobre');
  // Celle d'avant enjambe septembre et octobre : lundi 28 → dimanche 4.
  assert.equal(libellePeriode('semaine', 1, new Date(2026, 9, 6).getTime(), 'fr-FR'), '28 sept. – 4 oct.');
});

test('le calendrier couvre douze mois glissants, bornés au mois', () => {
  const t = new Date(2026, 9, 6, 14, 0).getTime();
  const b = bornesStat('calendrier', 0, t);
  assert.equal(b.pas, 'day');
  // Du 1er novembre 2025 au 1er novembre 2026 : douze lignes, la dernière en cours.
  assert.equal(b.debut.getFullYear(), 2025);
  assert.equal(b.debut.getMonth(), 10);
  assert.equal(b.debut.getDate(), 1);
  assert.equal(b.fin.getMonth(), 10);
  assert.equal(b.fin.getFullYear(), 2026);
  assert.equal(b.n, 365);
  assert.equal(casesStat('calendrier', b).length, 365);
});

test('le damier range les jours en douze lignes de trente-et-une cases', () => {
  const t = new Date(2026, 9, 6, 14, 0).getTime();
  const cases = casesStat('calendrier', bornesStat('calendrier', 0, t), 'fr-FR');
  const serie = cases.map((c, i) => (i % 3 === 0 ? i / 10 : null));
  const lignes = damier(cases, serie, t, 'fr-FR');
  assert.equal(lignes.length, 12);
  for (const l of lignes) assert.equal(l.jours.length, 31, l.label);
  assert.equal(lignes[0].label, 'nov 25');
  assert.equal(lignes[11].label, 'oct 26');
  // Novembre a trente jours : sa trente-et-unième case n'existe pas.
  assert.equal(lignes[0].jours[30].hors, true);
  assert.equal(lignes[0].jours[29].hors, false);
  // Octobre en a trente-et-un : aucune case hors.
  assert.equal(lignes[11].jours[30].hors, false);
});

test('le damier marque le jour en cours, et lui seul', () => {
  const t = new Date(2026, 9, 6, 14, 0).getTime();
  const cases = casesStat('calendrier', bornesStat('calendrier', 0, t), 'fr-FR');
  const lignes = damier(cases, cases.map(() => 1), t, 'fr-FR');
  const marques = lignes.flatMap(l => l.jours).filter(j => j.aujourdhui);
  assert.equal(marques.length, 1);
  assert.equal(lignes[11].jours[5].aujourdhui, true, 'le 6 octobre, sixième case de la dernière ligne');
});

test('une journée sans mesure reste vide dans le damier, pas à zéro', () => {
  const t = new Date(2026, 9, 6).getTime();
  const cases = casesStat('calendrier', bornesStat('calendrier', 0, t), 'fr-FR');
  const lignes = damier(cases, cases.map(() => null), t, 'fr-FR');
  const dedans = lignes.flatMap(l => l.jours).filter(j => !j.hors);
  assert.equal(dedans.length, 365);
  assert.ok(dedans.every(j => j.valeur === null), 'aucune case ne vaut 0 par défaut');
  // Un zéro MESURÉ se distingue toujours de l'absence.
  const avecZero = damier(cases, cases.map((c, i) => (i === 10 ? 0 : null)), t, 'fr-FR');
  assert.equal(avecZero.flatMap(l => l.jours).filter(j => j.valeur === 0).length, 1);
});

test('un trou coupe le tracé au lieu de le traverser', () => {
  /* Une installation jeune n'a que quelques points dans la journée. Sauter les
   * cases vides et relier ce qui reste tirait une diagonale de dix-huit heures
   * entre minuit et dix-huit heures : un relief inventé. */
  const j = [0.2, null, null, null, null, 0.4, 0.5, null, 0.1];
  assert.deepEqual(suitesPleines(j), [[0], [5, 6], [8]]);
  // Rien de mesuré : aucune suite, donc aucun trait.
  assert.deepEqual(suitesPleines([null, null]), []);
  assert.deepEqual(suitesPleines([]), []);
  assert.deepEqual(suitesPleines(null), []);
});

test('une journée pleine ne fait qu’une seule suite', () => {
  const pleine = Array.from({ length: 24 }, (_, i) => i / 10);
  const s = suitesPleines(pleine);
  assert.equal(s.length, 1, 'un seul tracé, pas vingt-quatre');
  assert.equal(s[0].length, 24);
});

test('un zéro MESURÉ ne coupe pas le tracé', () => {
  // La nuit, le solaire vaut zéro : c'est une mesure, pas un trou. Le trait
  // doit descendre à zéro et continuer, pas s'interrompre.
  assert.deepEqual(suitesPleines([0, 0, 1.2, 0]), [[0, 1, 2, 3]]);
  // Ce qui n'est PAS un nombre coupe, lui.
  assert.deepEqual(suitesPleines([1, NaN, 2]), [[0], [2]]);
  assert.deepEqual(suitesPleines([1, undefined, 2]), [[0], [2]]);
});

test('l’axe se gradue sur un pas rond', () => {
  // 0 / 0,73 / 1,46 ne se lit pas : on cherche 1, 2 ou 5 fois une puissance de dix.
  assert.equal(graduations(2.9).pas, 1);
  assert.equal(graduations(2.9).haut, 3);
  assert.equal(graduations(18).pas, 5);
  assert.equal(graduations(18).haut, 20);
  assert.equal(graduations(410).pas, 200);
  assert.equal(graduations(410).haut, 600);
  // Le haut couvre toujours le plus grand point, jamais en dessous.
  for (const v of [0.3, 1, 7.7, 23.4, 99, 1234]) assert.ok(graduations(v).haut >= v, 'haut >= ' + v);
});

test('un graphe vide garde une échelle debout', () => {
  for (const v of [0, null, undefined, NaN, -5]) {
    const g = graduations(v);
    assert.ok(g.haut > 0, 'pas d’axe écrasé sur zéro');
    assert.ok(g.vals.length >= 2);
  }
});

test('les étiquettes de l’axe n’ont pas de décimales fantômes', () => {
  // `0,1 + 0,1 + 0,1` vaut 0,30000000000000004 : l'axe l'écrivait. Cinq lignes
  // sur un demi-kilowattheure donnent justement ce pas de 0,1.
  const g = graduations(0.5, 5);
  assert.equal(g.pas, 0.1);
  assert.deepEqual(g.vals, [0, 0.1, 0.2, 0.3, 0.4, 0.5]);
  for (const v of g.vals) assert.equal(v, Math.round(v * 1e6) / 1e6, String(v));
  assert.equal(g.vals[0], 0, 'l’axe part de zéro');
  assert.equal(g.vals[g.vals.length - 1], g.haut);
  // Le plancher d'un demi-kilowattheure remonte les toutes petites journées :
  // 0,4 kWh se gradue jusqu'à 0,6 plutôt que de serrer l'axe sur rien.
  assert.deepEqual(graduations(0.4).vals, [0, 0.2, 0.4, 0.6]);
});

test('une lecture ratée garde la série affichée, une lecture vide l’efface', () => {
  const avant = { 'sensor.un': [1, 2, 3], 'sensor.deux': [4, 5] };
  // Raté du réseau (`arr` nul) et série encore fraîche : on garde.
  let apres = statsRelues(avant, [{ id: 'sensor.un', arr: null }], () => true);
  assert.deepEqual(apres['sensor.un'], [1, 2, 3]);
  // Raté et série périmée : elle disparaît plutôt que de mentir.
  apres = statsRelues(avant, [{ id: 'sensor.un', arr: null }], () => false);
  assert.equal(apres['sensor.un'], undefined);
  // Home Assistant répond « rien sur cette période » : la nouvelle réponse gagne.
  apres = statsRelues(avant, [{ id: 'sensor.un', arr: [null, null] }], () => true);
  assert.deepEqual(apres['sensor.un'], [null, null]);
  // Une entité absente de la lecture ne revient pas par la porte de derrière.
  assert.equal(apres['sensor.deux'], undefined);
});
