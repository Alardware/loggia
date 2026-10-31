// ─────────────────────────────────────────────────────────────────────────────
// La ligne du CO₂ cède son libellé, jamais son verdict (lot 16, 05/10).
//
// Le lot 16 a mis des mots de QUALITÉ sous « Qualité de l'air ». Au téléphone,
// la carte d'un capteur de CO₂ fait 141 à 176 px (320 à 390 px d'écran), et sa
// ligne « Qualité d'air · X » est une seule ligne à ellipse : c'était le MOT
// DU PALIER qui tombait. Mesuré dans la démonstration, carte de 161 px
// (360 px) : « SCHLECHT » perdait 5 px, « SCARSA » 11 (et 3 dès 375 px),
// « SLECHT » 2 ; « WYSOKI » 19 et « DUSZNO » 23 se coupaient déjà, et
// « CONFINÉ » à 320 px.
// La mise en page cède, pas les mots : le libellé se réduit (ellipse), le
// verdict garde toute sa place. Le nom accessible ne change pas (`subLu`).
//
// Et l'accord du dernier palier : « Viziato », masculin, ne s'accordait ni à
// « qualità » ni à « aria » ; « Cargado » allait à « aire », pas à « calidad »
// comme « Buena » et « Mala ». Une clé de contexte, comme « Bon · air » : les
// autres langues reprennent leur mot tel quel — le polonais de Seba882 aussi.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { MONOLITHE } from './monolithe.mjs'; // App.jsx et ce qui en sort (ADR 0282)
const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const APP = MONOLITHE;
const PUR = lire('src', 'confort.js');
const NL = String.fromCharCode(10);
const LANGUES = ['en', 'de', 'nl', 'it', 'es', 'pl'];
const CATS = Object.fromEntries(await Promise.all(LANGUES.map(async l =>
  [l, (await import(pathToFileURL(join(RACINE, 'src', 'langues', l + '.js')).href)).default])));

/* L'écran en ITALIEN, fixé avant le premier import (la langue se résout au
 * chargement d'i18n.js, l'amorce y dépose le catalogue). */
Object.defineProperty(globalThis, 'navigator', { value: { language: 'it-IT' }, configurable: true });
globalThis.window = { __loggiaCatalogue: { code: 'it', cat: CATS.it } };
// ASSERTION MODIFIÉE (audit du 19/10, point 14) : `jaugeMesure` est parti — la barre des cartes (`barreMesure`) lit le même mot.
const { verdictMesure, barreMesure } = await import('../src/confort.js');
const { langue } = await import('../src/i18n.js');

function fonction(nom) {
  const d = APP.indexOf(NL + 'function ' + nom + '(');
  assert.ok(d >= 0, nom + ' introuvable');
  return APP.slice(d, APP.indexOf(NL + '}' + NL, d) + 2);
}

/* ASSERTIONS MODIFIÉES (chantier Capteurs, tâche 4 ; C8, C11) : la ligne « Qualité d'air · VERDICT » est partie avec la
 * carte d'avant. La carte d'une mesure écrit la PHRASE de sa zone, le mot EN TÊTE — « Confiné · aérez » : si la place
 * manque, c'est la fin qui cède, jamais le mot. */
test('la ligne du CO₂ : le mot de la zone en tête de la phrase, jamais coupé', () => {
  const f = fonction('RoomMesureCard');
  assert.ok(!APP.includes('ligneVerdict'), 'la ligne « Libellé · VERDICT » est restée');
  /* ASSERTION MODIFIÉE (chantier Capteurs, tâche 4 bis) : la phrase porte la classe de la grille commune et sa longueur (`--o-n`) ; son encre
   * se calcule une fois, pour elle et pour sa forme courte. Ce qu'elle dit ne change pas. */
  /* ASSERTION MODIFIÉE (correction bis, point 6) : sur la carte large, la phrase vit dans son cadre, avec sa largeur estimée (`--o-larg`) ; sa forme
   * de repli — « Confiné », sans « aérez » — garde le mot en tête (`phraseMesure(…, true)`). Ce qu'elle dit ne change pas. */
  assert.ok(f.includes("<div className=\"o-mesure-phrase\" data-longue={v.phraseRepli ? '' : undefined} style={{ ...RM_SUB, color: encre, '--o-larg': emPhrase(v.phrase) }}>{v.phrase}</div>")
    && f.includes("const encre = v.muette ? 'var(--o-bad)' : teinte ? teinte.c : 'var(--o-text2)';"), 'la phrase de la zone');
  assert.ok(f.includes("label={nomCarte(v.nom, valeur && famille ? famille + ' ' + valeur : valeur, v.phrase)}"), 'le nom accessible dit ce que la carte affiche, sa famille comprise');
  assert.ok(PUR.includes('const morceaux = z ? [z.t] : [];'), 'le mot de la zone vient en tête');
});

test('en italien, l’air confiné est « Viziata », accordé à « Qualità dell’aria »', () => {
  assert.equal(langue(), 'it', 'le test ne tourne pas en italien');
  assert.equal(verdictMesure('co2', 1700).t, 'Viziata');
  const b = barreMesure('co2', 2000);
  assert.equal(b.zones[b.i].t, 'Viziata', 'la jauge des cartes lit le même mot');
  assert.equal(verdictMesure('co2', 1500).t, 'Scarsa', 'le palier d’avant ne bouge pas');
});

test('« Confiné · air » : féminin en italien et en espagnol, le mot de chacun ailleurs', () => {
  assert.ok(PUR.includes("[null, trSens('Confiné · air'), ROUGE]"), 'la table du CO₂ ne lit pas sa clé de contexte');
  assert.ok(!PUR.includes("tr('Confiné')"), 'le dernier palier repasse par la clé nue');
  assert.equal(CATS.it['Confiné · air'], 'Viziata');
  assert.equal(CATS.es['Confiné · air'], 'Cargada');
  // Les autres langues recopient leur mot ; le polonais de Seba882 tel quel.
  for (const l of ['en', 'de', 'nl', 'pl']) assert.equal(CATS[l]['Confiné · air'], CATS[l]['Confiné'], l);
  // Les valeurs existantes ne bougent pas.
  assert.deepEqual(LANGUES.map(l => CATS[l]['Confiné']), ['Stuffy', 'Stickig', 'Bedompt', 'Viziato', 'Cargado', 'Duszno']);
});
