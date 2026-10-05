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

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const APP = lire('src', 'App.jsx');
const PUR = lire('src', 'confort.js');
const NL = String.fromCharCode(10);
const LANGUES = ['en', 'de', 'nl', 'it', 'es', 'pl'];
const CATS = Object.fromEntries(await Promise.all(LANGUES.map(async l =>
  [l, (await import(pathToFileURL(join(RACINE, 'src', 'langues', l + '.js')).href)).default])));

/* L'écran en ITALIEN, fixé avant le premier import (la langue se résout au
 * chargement d'i18n.js, l'amorce y dépose le catalogue). */
Object.defineProperty(globalThis, 'navigator', { value: { language: 'it-IT' }, configurable: true });
globalThis.window = { __loggiaCatalogue: { code: 'it', cat: CATS.it } };
const { verdictMesure, jaugeMesure } = await import('../src/confort.js');
const { langue } = await import('../src/i18n.js');

function fonction(nom) {
  const d = APP.indexOf(NL + 'function ' + nom + '(');
  assert.ok(d >= 0, nom + ' introuvable');
  return APP.slice(d, APP.indexOf(NL + '}' + NL, d) + 2);
}

test('la ligne du CO₂ : le libellé se réduit, le verdict ne se coupe jamais', () => {
  const f = fonction('RoomGenericCard');
  // Les deux morceaux, posés là où la carte calcule sa ligne.
  assert.ok(f.includes("ligneVerdict = [libMesure, jauge.verdict.t.toLocaleUpperCase(locale())];"), 'le CO₂ ne garde pas son libellé et son verdict à part');
  const i = f.indexOf('{ligneVerdict ? ');
  assert.ok(i > 0, 'la ligne du CO₂ ne se dessine pas à part');
  const ligne = f.slice(i, f.indexOf(NL, i));
  // Une rangée : le libellé peut rétrécir jusqu'à zéro, avec son ellipse…
  assert.ok(ligne.includes("<div style={{ ...RM_SUB, color: couleur, display: 'flex' }}>"), 'la ligne n’est pas une rangée');
  assert.ok(ligne.includes("<span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{ligneVerdict[0]}</span>"), 'le libellé ne cède pas');
  // … le verdict jamais : il garde sa largeur, séparateur compris.
  assert.ok(ligne.includes("<span style={{ flexShrink: 0, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'pre' }}>{' · ' + ligneVerdict[1]}</span>"), 'le verdict peut encore se couper');
  // Le libellé AVANT le verdict : c'est lui qui cède, l'ordre de lecture ne change pas.
  assert.ok(ligne.indexOf('{ligneVerdict[0]}') < ligne.indexOf('ligneVerdict[1]'));
  // Les autres cartes gardent la ligne d'avant, et le nom accessible ne bouge pas.
  assert.ok(ligne.includes(': <div style={{ ...RM_SUB, color: couleur }}>{sub}</div>}'), 'les autres cartes ont perdu leur ligne');
  assert.ok(f.includes("sub = libMesure + ' · ' + jauge.verdict.t.toLocaleUpperCase(locale());") && f.includes("subLu = libMesure + ' · ' + jauge.verdict.t;"));
  assert.ok(f.includes('label={nomCarte(nom, valeur, subLu || sub)}'));
  // La rangée ne vaut plus pour le seul CO₂ (05/10, suite) : la température,
  // l'humidité et le bruit coupaient leur verdict aussi — voir
  // tests/lot16_verdicts_lignes.test.mjs. Une seule affectation, pour toutes.
  assert.equal(f.split('ligneVerdict = [').length - 1, 1, 'une seule affectation, pour toute mesure à verdict');
});

test('en italien, l’air confiné est « Viziata », accordé à « Qualità dell’aria »', () => {
  assert.equal(langue(), 'it', 'le test ne tourne pas en italien');
  assert.equal(verdictMesure('co2', 1700).t, 'Viziata');
  assert.equal(jaugeMesure('co2', 2000).verdict.t, 'Viziata', 'la jauge des cartes lit le même mot');
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
