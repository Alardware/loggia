// ─────────────────────────────────────────────────
// Ce que seule une VRAIE installation montrait (audit du 12/11).
//
// La démonstration avait tout bon. Sur une instance réelle, le même code
// annonçait le double de la consommation du jour, écrivait « EUR » à côté de
// « € », affichait une prévision solaire de zéro, ne montrait pas une vue
// personnalisée que le serveur tenait, et gardait un réglage de menu rangé
// deux fois. Chaque cas reprend les valeurs relevées ce jour-là.
// ─────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MONOLITHE } from './monolithe.mjs'; // App.jsx et ce qui en sort (ADR 0282)
// La langue AVANT l'import, comme les autres suites qui chargent src/.
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true });
const { totalDuJour } = await import('../src/jourstat.js');
const { bornesStat, casesStat, repartir, sommeStat } = await import('../src/stats.js');
const { symboleMonnaie } = await import('../src/format.js');
const { totauxPrevision } = await import('../src/previsionsolaire.js');
const { vuesPersoValides } = await import('../src/views.js');
const { sansDoubleRangement } = await import('../src/state.js');

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const LE_12_A_16H25 = new Date(2026, 10, 12, 16, 25).getTime();

// ── L'énergie du jour (ADR 0347) ─────────────────────────────────────────────

test('un compteur du jour qui ne dit pas sa remise à zéro se lit à son état', () => {
  // État 7,5 kWh ; « change » du jour 15,71 : la tranche de minuit porte + 8,76 kWh jamais consommés.
  assert.equal(totalDuJour(7.5, 15.71), 7.5, 'la consommation du jour est restée doublée');
  assert.equal(totalDuJour(1.31, 2.62), 1.31, 'le coût du jour est resté doublé');
});

test('un index reste lu dans les statistiques', () => {
  assert.equal(totalDuJour(12450.3, 7.24), 7.24, 'un index a été pris pour une journée');
  // Un compteur du jour aux statistiques justes : l'état a une heure d'avance, le total calculé reste la référence.
  assert.equal(totalDuJour(7.55, 7.24), 7.24, 'l’état a pris le pas sur un total juste');
  assert.equal(totalDuJour(null, 7.24), 7.24, 'un état muet a effacé le total');
  assert.equal(totalDuJour(-1, 7.24), 7.24, 'un état négatif a été pris pour une journée');
});

test('sans statistiques, toujours rien', () => {
  assert.equal(totalDuJour(7.5, null), null, 'l’état est sorti sans statistiques : un index passerait pour une journée');
  assert.equal(totalDuJour(7.5, NaN), null, 'un total illisible a laissé passer l’état');
});

test('à l’heure, le relevé borne une tranche que Home Assistant a gonflée', () => {
  const b = bornesStat('jour', 0, LE_12_A_16H25);
  const cases = casesStat('jour', b);
  assert.equal(b.pas, 'hour', 'la journée ne se lit plus à l’heure');
  const lignes = [
    { start: cases[0].debut, change: 1.42, state: 0.05 }, // minuit : la retombée prise pour une dépense
    { start: cases[1].debut, change: 0.06, state: 0.11 },
    { start: cases[2].debut, change: 0.16, state: 0.27 },
  ];
  const serie = repartir(lignes, cases, 1, b.pas);
  assert.equal(serie[0], 0.05, 'la tranche de minuit a gardé le faux saut');
  assert.equal(serie[1], 0.06, 'une tranche juste a été touchée');
  assert.ok(Math.abs(sommeStat(serie) - 0.27) < 1e-9, 'le coût du jour ne retombe pas sur le relevé : ' + sommeStat(serie));
  // Sans pas, ou sans relevé : comme avant.
  assert.equal(repartir(lignes, cases)[0], 1.42, 'sans pas, la borne s’applique quand même');
  assert.equal(repartir([{ start: cases[0].debut, change: 1.42 }], cases, 1, b.pas)[0], 1.42, 'une ligne sans relevé a été bornée');
});

test('un index n’est jamais borné, et le mois non plus', () => {
  const b = bornesStat('jour', 0, LE_12_A_16H25);
  const cases = casesStat('jour', b);
  assert.equal(repartir([{ start: cases[3].debut, change: 0.95, state: 12450.3 }], cases, 1, b.pas)[3], 0.95, 'un index a été borné');
  // Au mois, le relevé d'un compteur journalier ne vaut que son dernier jour.
  const an = bornesStat('annee', 0, LE_12_A_16H25);
  const mois = casesStat('annee', an);
  assert.equal(an.pas, 'month', 'l’année ne se lit plus au mois');
  const k = mois.length - 1;
  assert.equal(repartir([{ start: mois[k].debut, change: 212.9, state: 7.5 }], mois, 1, an.pas)[k], 212.9, 'un mois a été ramené à un jour');
});

test('la requête de l’aperçu et celle des graphes vont au même chiffre', () => {
  const ENERGIE = readFileSync(join(RACINE, 'src', 'views', 'energie.jsx'), 'utf8');
  assert.ok(ENERGIE.includes('const v = totalDuJour(avail(id) ? num(id, null) : null, totauxJour[id]);'), 'l’aperçu relit le « change » sans regarder l’état');
  const STATS = readFileSync(join(RACINE, 'src', 'stats.js'), 'utf8');
  assert.ok(STATS.includes("repartir(lignes, cases, (f && f[id]) || 1, bornes.pas)"), 'les graphes ne donnent plus leur pas à `repartir`');
});

// ── La monnaie et la prévision ───────────────────────────────────────────────

test('la monnaie s’écrit par son symbole', () => {
  assert.equal(symboleMonnaie('EUR'), '€', '« EUR » est resté écrit en toutes lettres');
  assert.equal(symboleMonnaie('EUR/kWh'), '€/kWh', 'l’unité composée a gardé le code');
  assert.equal(symboleMonnaie('€'), '€');
  assert.equal(symboleMonnaie('CHF'), 'CHF', 'un code sans symbole courant a changé');
  assert.equal(symboleMonnaie('kWh'), 'kWh', 'une unité qui n’est pas une monnaie a été touchée');
  assert.equal(symboleMonnaie(null), '', 'une unité absente a planté');
  const HISTO = readFileSync(join(RACINE, 'src', 'views', 'energiehisto.jsx'), 'utf8');
  assert.equal(HISTO.split('const uniteDe = (id) => symboleMonnaie(unite(id) || devise);').length - 1, 2, 'la carte du Tarif ou les bilans écrivent encore l’unité brute');
});

test('une prévision solaire de zéro ne s’affiche pas', () => {
  const iso = (j, h) => new Date(2026, 10, j, h).toISOString();
  const zeros = { a: { wh_hours: { [iso(12, 10)]: 0, [iso(12, 12)]: 0, [iso(13, 12)]: 0 } } };
  assert.deepEqual(totauxPrevision(zeros, ['a'], LE_12_A_16H25), { aujourdhui: null, demain: null }, 'un zéro passe encore pour une prévision');
  const vraie = { a: { wh_hours: { [iso(12, 12)]: 1500, [iso(13, 12)]: 0 } } };
  assert.deepEqual(totauxPrevision(vraie, ['a'], LE_12_A_16H25), { aujourdhui: 1.5, demain: null }, 'une vraie prévision a disparu');
});

// ── Les vues personnalisées (ADR 0348) ───────────────────────────────────────

test('les vues personnalisées se lisent au serveur', () => {
  assert.deepEqual(vuesPersoValides([{ id: 'a', name: 'Test' }, null, { id: 'b' }, { name: 'sans identifiant' }]), [{ id: 'a', name: 'Test' }], 'une vue illisible est passée');
  assert.deepEqual(vuesPersoValides(undefined), [], 'une liste absente a planté');
  assert.deepEqual(vuesPersoValides('x'), [], 'une valeur qui n’est pas une liste est passée');
  assert.ok(MONOLITHE.includes('const vuesPersoServeur = serverOk ? serverCfg.loggia_customviews : undefined;'), 'la liste ne vient plus du serveur');
  assert.ok(MONOLITHE.includes('setCustomViews(avant => (JSON.stringify(avant) === JSON.stringify(servies) ? avant : servies));'), 'la liste n’est plus remise sur celle du serveur');
  assert.ok(MONOLITHE.includes('if (!serverOk || sansVuesPerso.current) return;'), 'le filet « Repartir sans les vues custom » ne tient plus');
});

// ── Le menu rangé deux fois (ADR 0349) ───────────────────────────────────────

test('un réglage de menu rangé deux fois redevient une liste', () => {
  const double = { __profils: { 0: ['biblio'], '*': { 0: ['medias', 'volets'], 1: [], 3: ['climat'], '*': ['lumieres', 'climat'] } } };
  assert.deepEqual(sansDoubleRangement('loggia-shownviews', double), { __profils: { 0: ['biblio'], '*': ['lumieres', 'climat'] } }, 'l’ancien découpage est resté dans la part commune');
  assert.deepEqual(sansDoubleRangement('loggia-vueordre', { __profils: { 0: [], '*': { 0: [], 1: [] } } }), { __profils: { 0: [] } }, 'une part commune sans liste est restée');
});

test('une valeur saine, ou une autre clé, ne bouge pas', () => {
  const saine = { __profils: { 0: ['biblio'], '*': ['lumieres'] } };
  assert.equal(sansDoubleRangement('loggia-shownviews', saine), saine, 'une valeur saine a été réécrite');
  // La part commune d'une grille est légitimement un objet : une disposition par format.
  const grille = { __profils: { '*': { pc: [1], mobile: [2] } } };
  assert.equal(sansDoubleRangement('loggia_accueil', grille), grille, 'une grille par format a été prise pour un double rangement');
  const liste = ['lumieres'];
  assert.equal(sansDoubleRangement('loggia-shownviews', liste), liste, 'une liste d’avant la bascule a été touchée');
  assert.equal(sansDoubleRangement('loggia-shownviews', null), null);
});
