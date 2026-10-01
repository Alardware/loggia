/* Le journal des notifications (01/10).
 *
 * « Je ne trouve pas qu'elles servent à grand-chose, il n'y a rien ou presque
 * qui remonte ici. »
 *
 * Le défaut n'était pas la liste des sources : c'étaient des ÉTATS COURANTS
 * recalculés à chaque passage. Une notification naît d'un événement, survit à
 * sa fin, et se marque lue. Aucune des trois n'était vraie.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fondre, nonLues, marquerLues, JOURNAL_MAX, JOURNAL_JOURS } from '../src/journal.js';

const T0 = Date.UTC(2026, 9, 1, 8, 0, 0);
const MIN = 60 * 1000;
const JOUR = 24 * 60 * MIN;
const ev = (k, m) => ({ k, c: 'var(--o-bad)', t: 'Fuite d’eau', m: m || 'Fuite détectée' });

test('un événement entre une fois, pas à chaque passage', () => {
  /* Sans clé stable, une fuite d'eau rentrerait dans le journal toutes les
   * deux secondes — c'est la cadence du sondage. */
  let j = fondre([], [ev('fuite:capteur')], T0);
  assert.equal(j.length, 1);
  assert.equal(j[0].lu, false);
  assert.equal(j[0].ts, T0);

  j = fondre(j, [ev('fuite:capteur')], T0 + 2000);
  assert.equal(j.length, 1, 'le même événement est entré deux fois');
  assert.equal(j[0].ts, T0, 'son heure a bougé : ce n’est plus l’heure où c’est arrivé');
});

test('il SURVIT à la fin de l’événement', () => {
  /* Le défaut d'origine : le lave-vaisselle qui finit pendant qu'on est sorti
   * n'a jamais été signalé. La ligne apparaissait et disparaissait sans
   * témoin. */
  let j = fondre([], [ev('lv:cycle', 'Cycle en cours')], T0);
  j = fondre(j, [], T0 + 30 * MIN);
  assert.equal(j.length, 1, 'la notification a disparu avec son état');
  assert.equal(j[0].m, 'Cycle en cours');
});

test('le texte d’une entrée connue ne se réécrit pas', () => {
  /* Le journal raconte le passé : une alerte qui change de formulation en
   * cours de route raconterait le présent. */
  let j = fondre([], [ev('fuite:capteur', 'Fuite détectée · Cuisine')], T0);
  j = fondre(j, [ev('fuite:capteur', 'Fuite détectée · Cuisine · 3 L')], T0 + MIN);
  assert.equal(j[0].m, 'Fuite détectée · Cuisine');
});

test('marquer lu, et ne plus revenir', () => {
  let j = fondre([], [ev('a'), ev('b')], T0);
  assert.equal(nonLues(j), 2);
  j = marquerLues(j);
  assert.equal(nonLues(j), 0);
  // L'evenement dure encore : il ne redevient pas non lu.
  j = fondre(j, [ev('a'), ev('b')], T0 + MIN);
  assert.equal(nonLues(j), 0, 'un événement qui dure redevient non lu à chaque passage');
  // Un nouveau, lui, se signale.
  j = fondre(j, [ev('a'), ev('b'), ev('c')], T0 + 2 * MIN);
  assert.equal(nonLues(j), 1);
  assert.equal(j[0].k, 'c', 'la plus récente n’est pas en tête');
});

test('marquerLues rend le MÊME tableau quand il n’y a rien à marquer', () => {
  // Sans cela, ouvrir la feuille reecrivait le stockage et redessinait l'ecran.
  const j = marquerLues(fondre([], [ev('a')], T0));
  assert.equal(marquerLues(j), j);
});

test('le journal vieillit et reste borné', () => {
  const vieille = { k: 'vieux', c: null, t: 'x', m: 'y', ts: T0 - (JOURNAL_JOURS + 1) * JOUR, lu: true };
  const recente = { k: 'recent', c: null, t: 'x', m: 'y', ts: T0 - JOUR, lu: true };
  const j = fondre([vieille, recente], [], T0);
  assert.deepEqual(j.map(e => e.k), ['recent'], 'une entrée de plus de sept jours reste');

  let plein = [];
  for (let n = 0; n < JOURNAL_MAX + 10; n++) plein = fondre(plein, [ev('e' + n)], T0 + n * MIN);
  assert.equal(plein.length, JOURNAL_MAX);
  assert.equal(plein[0].k, 'e' + (JOURNAL_MAX + 9), 'la plus récente est tombée au lieu de la plus ancienne');
});

test('rien d’abîmé n’entre, et rien d’abîmé ne fait tomber', () => {
  // Une entree sans cle ni horodatage ne sait ni se reconnaitre ni vieillir.
  assert.deepEqual(fondre(null, null, T0), []);
  assert.deepEqual(fondre([{ sans: 'cle' }], [], T0), []);
  assert.deepEqual(fondre([], [{ pas: 'de cle' }, null], T0), []);
  assert.equal(nonLues(null), 0);
  assert.equal(nonLues([{ sans: 'cle' }]), 0);
  // Deux fois la meme cle dans le meme passage : une seule entre.
  assert.equal(fondre([], [ev('a'), ev('a')], T0).length, 1);
});

test('rien n’a bougé : le MÊME tableau revient', () => {
  /* L'écran appelle `fondre` à chaque passage du sondage — toutes les deux
   * secondes. Une copie neuve à chaque fois redessinerait la page et
   * réécrirait le stockage pour rien. */
  const j = fondre([], [ev('a')], T0);
  assert.equal(fondre(j, [ev('a')], T0 + 2000), j, 'une copie a été rendue alors que rien n’a changé');
  // Mais un ajout, une purge ou un nettoyage rendent bien du neuf.
  assert.notEqual(fondre(j, [ev('a'), ev('b')], T0 + 2000), j);
  assert.notEqual(fondre([...j, { sans: 'cle' }], [ev('a')], T0 + 2000), j);
});
