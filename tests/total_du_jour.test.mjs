// ─────────────────────────────────────────────────────────────────────────────
// Un INDEX de compteur n'est pas une journée (audit du 07/10).
//
// Le tableau de bord Énergie de Home Assistant ne désigne pas des compteurs
// journaliers : il désigne l'index du Linky, du Shelly, du P1 — un nombre qui
// ne fait que monter depuis le premier jour. L'aperçu de la vue Énergie le
// lisait tel quel et l'annonçait comme la consommation du jour.
//
// Sur l'installation qui a servi à écrire la vue, cela ne se voyait pas : sa
// fiche désigne des `utility_meter` remis à zéro chaque nuit. Chez quiconque
// n'avait jamais rempli la fiche à la main, le grand chiffre aurait annoncé
// l'index entier.
//
// Deux sortes de compteurs, deux lectures : celui qui dit s'être remis à zéro
// aujourd'hui se lit directement, les autres passent par les statistiques.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { minuitLocal, compteurDuJour, requeteJour, totauxRelus } from '../src/jourstat.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');

const LE_7_A_14H = new Date(2026, 9, 7, 14, 30, 0).getTime();
const MINUIT_DU_7 = new Date(2026, 9, 7, 0, 0, 0).getTime();
const etat = (attrs) => ({ state: '5.41', attributes: attrs });

test('minuit est celui de la MAISON, pas le temps universel', () => {
  assert.equal(minuitLocal(LE_7_A_14H), MINUIT_DU_7);
  const d = new Date(minuitLocal(LE_7_A_14H));
  assert.equal(d.getHours(), 0);
  assert.equal(d.getDate(), 7);
});

test('un compteur remis à zéro cette nuit se lit directement', () => {
  const lr = new Date(MINUIT_DU_7 + 9).toISOString();
  assert.equal(compteurDuJour(etat({ last_reset: lr }), LE_7_A_14H), true);
});

test('un INDEX, qui n’a pas de remise à zéro, ne se lit pas directement', () => {
  assert.equal(compteurDuJour(etat({ unit_of_measurement: 'kWh' }), LE_7_A_14H), false);
  assert.equal(compteurDuJour(etat({ last_reset: null }), LE_7_A_14H), false);
  assert.equal(compteurDuJour(null, LE_7_A_14H), false);
});

test('un compteur du MOIS ne passe pas pour un compteur du jour', () => {
  const premierDuMois = new Date(2026, 9, 1, 0, 0, 0).toISOString();
  assert.equal(compteurDuJour(etat({ last_reset: premierDuMois }), LE_7_A_14H), false);
});

test('le premier du mois, le compteur mensuel EST celui du jour', () => {
  /* Et il a raison : ce jour-là, son total est bien celui de la journée en
   * cours. Rien à corriger, c'est la même valeur. */
  const leUn = new Date(2026, 9, 1, 14, 0, 0).getTime();
  const reset = new Date(2026, 9, 1, 0, 0, 0).toISOString();
  assert.equal(compteurDuJour(etat({ last_reset: reset }), leUn), true);
});

test('un reset un peu AVANT minuit reste un compteur du jour', () => {
  // Une automatisation qui remet à zéro à 23 h 59 min 30 s.
  const reset = new Date(MINUIT_DU_7 - 30000).toISOString();
  assert.equal(compteurDuJour(etat({ last_reset: reset }), LE_7_A_14H), true);
});

test('une date illisible ne fait pas un compteur du jour', () => {
  assert.equal(compteurDuJour(etat({ last_reset: 'jamais' }), LE_7_A_14H), false);
});

test('la requête part de minuit, en jours, et ne demande que la variation', () => {
  const q = requeteJour(['sensor.a', 'sensor.b'], LE_7_A_14H);
  assert.equal(q.type, 'recorder/statistics_during_period');
  assert.equal(q.period, 'day');
  assert.deepEqual(q.types, ['change']);
  assert.deepEqual(q.statistic_ids, ['sensor.a', 'sensor.b']);
  assert.equal(Date.parse(q.start_time), MINUIT_DU_7);
  // Pas de fin : jusqu'à maintenant.
  assert.equal(q.end_time, undefined);
});

test('la réponse se résume à une somme par compteur', () => {
  const res = {
    'sensor.a': [{ change: 2.5 }, { change: 1.5 }],
    'sensor.b': [{ change: 7 }],
  };
  assert.deepEqual(totauxRelus(res, ['sensor.a', 'sensor.b']), { 'sensor.a': 4, 'sensor.b': 7 });
});

test('un compteur MUET est absent du résultat, jamais à zéro', () => {
  /* Zéro dirait « rien consommé » ; absent dit « on ne sait pas », et l'aperçu
   * n'affiche alors aucun chiffre. */
  const res = { 'sensor.a': [{ change: 3 }], 'sensor.b': null };
  const out = totauxRelus(res, ['sensor.a', 'sensor.b', 'sensor.c']);
  assert.deepEqual(out, { 'sensor.a': 3 });
  assert.equal('sensor.b' in out, false);
  assert.equal('sensor.c' in out, false);
  assert.deepEqual(totauxRelus(null, ['sensor.a']), {});
});

test('une ligne sans variation lisible ne compte pas', () => {
  const res = { 'sensor.a': [{ change: 2 }, { change: null }, {}, { change: NaN }] };
  assert.deepEqual(totauxRelus(res, ['sensor.a']), { 'sensor.a': 2 });
});

test('un compteur qui n’a rien compté rend bien zéro', () => {
  assert.deepEqual(totauxRelus({ 'sensor.a': [{ change: 0 }] }, ['sensor.a']), { 'sensor.a': 0 });
});

test('l’aperçu ne lit plus l’état brut pour ce qui se compte par jour', () => {
  /* Les six valeurs du jour passent par `kwhJour` / `euroJour`. Les reprendre
   * en `numKwh(EN.…)` ramènerait l'index entier. */
  assert.ok(APP.includes("import { compteurDuJour, useTotauxJour } from './jourstat.js';"),
    'App.jsx n’importe plus le lecteur du jour');
  assert.ok(APP.includes('const prodJour = kwhJour(EN.prodJour);'), 'la production du jour');
  assert.ok(APP.includes('const injJour = kwhJour(EN.injectionJour);'), 'l’injection du jour');
  assert.ok(APP.includes('const coutJour = euroJour(EN.coutJour);'), 'le coût du jour');
  assert.ok(APP.includes('jour: kwhJour(EN.consoJour)'), 'le total du jour');
  assert.ok(APP.includes('reseau: kwhJour(EN.consoReseauToday)'), 'le compteur réseau');
  assert.ok(/const hcToday = EN\.consoJourHc \? kwhJour\(/.test(APP), 'les heures creuses');
  assert.ok(/const hpToday = EN\.consoJourHp \? kwhJour\(/.test(APP), 'les heures pleines');
});

test('la carte du Tarif dit le MÊME coût que l’aperçu', () => {
  /* Elle lisait `num(EN.coutJour)` de son côté : deux chiffres différents sur
   * le même écran, dont un faux. */
  const HISTO = readFileSync(join(RACINE, 'src', 'views', 'energiehisto.jsx'), 'utf8');
  assert.ok(HISTO.includes("coutJour = null, revenuJour = null }"), 'CarteTarif ne reçoit plus le coût');
  assert.ok(!HISTO.includes('num(EN.coutJour)'), 'CarteTarif relit l’état brut du coût');
  /* La carte recoit aussi la revente depuis le 07/10 : on epingle le seul
   * couple qui compte ici, le cout, sans figer l'ordre des autres props. */
  assert.ok(APP.includes('coutJour={coutJour}'), 'l’aperçu ne lui passe plus le coût');
});

test('seuls les compteurs qu’on ne sait pas lire sont demandés au recorder', () => {
  /* Un compteur journalier n'a rien à demander : son état suffit. Les lister
   * tous ferait une requête plus lourde à chaque relecture. */
  assert.ok(APP.includes('const cumulatifs = CPT_JOUR.filter(id => id && S && S[id] && !compteurDuJour(S[id]));'),
    'la liste envoyée au recorder n’écarte plus les compteurs journaliers');
});
