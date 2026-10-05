/* Les autres formateurs de watts (trois d'App.jsx, un des Paramètres)
 * arrondissent AVANT de choisir l'unité (lot 16, 05/10).
 *
 * Le contradicteur du lot 16 a vu, ailleurs qu'à `fmtWatts`, le même défaut :
 * `fmtW` (sous-titre d'une prise mesurante), `fmtChipW` (pastilles voiture et
 * batterie du schéma de la maison) et `fmtKW` (pastilles de l'arc solaire)
 * choisissaient l'unité sur la valeur BRUTE puis l'arrondissaient. 999,6 W
 * s'écrivait « 1000 W » — et 1000 W « 1,0 kW » : la même puissance écrite de
 * deux façons. `fmtKW` coupe à 995 : chez lui, c'est 994,6 qui s'écrivait
 * « 995 W » quand 995 donne « 1,0 kW ». Le contradicteur en a trouvé un
 * quatrième, hors d'App.jsx : la tuile « Consommation » de l'aperçu des
 * Paramètres (views/parametres.jsx), même seuil à 995, même valeur brute de
 * `wattsDe` — visible, lui aussi.
 *
 * Aucun ne délègue à `fmtWatts` : tous écrivent UNE décimale en kilowatts
 * (« 1,4 kW », pas « 1,38 kW » — une prise ou une pastille de 22 px n'a pas la
 * place), et `fmtKW` garde son seuil à 995. Leur format reste donc le leur ;
 * seul l'ordre arrondi → unité change.
 *
 * « -0 W » : signalé pour `fmtKW`, il n'existe pas — `Math.round(-0,4)` donne
 * bien -0, mais `-0 + ' W'` s'écrit « 0 W » en JavaScript. Épinglé quand même,
 * pour qu'un passage à `Intl` (qui, lui, écrit « -0 ») ne le fasse pas naître.
 *
 * Les formateurs sont des flèches d'une ligne, locales à leur composant : on
 * lit leur texte dans App.jsx et on l'exécute (comme historique.test.mjs pour
 * `elaguerHisto`), avec le vrai `dec` (= `nombre` de format.js). La langue est
 * FIXÉE avant l'import (règle de la CI).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true });
const { nombre } = await import('../src/format.js');
const { locale } = await import('../src/i18n.js');
const dec = (n, d) => nombre(n, d);

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');

/** La flèche `const <nom> = …;` telle qu'écrite, rendue exécutable. */
function formateur(nom) {
  const debut = src.indexOf('const ' + nom + ' = (');
  assert.notEqual(debut, -1, nom + ' a disparu d’App.jsx');
  assert.equal(src.indexOf('const ' + nom + ' = (', debut + 1), -1, nom + ' est défini deux fois');
  const fin = src.indexOf(';\n', debut);
  assert.notEqual(fin, -1, nom + ' : fin introuvable');
  const corps = src.slice(debut + ('const ' + nom + ' = ').length, fin);
  return new Function('dec', 'return ' + corps + ';')(dec);
}

const fmtW = formateur('fmtW');
const fmtChipW = formateur('fmtChipW');
const fmtKW = formateur('fmtKW');

test('prise mesurante (fmtW) : 999,6 W est un kilowatt, pas « 1000 W »', () => {
  assert.equal(fmtW(999.6), '1,0 kW');
  assert.equal(fmtW(999.5), '1,0 kW');
  assert.equal(fmtW(999.4), '999 W', 'arrondi en dessous : on reste en watts');
  assert.equal(fmtW(999), '999 W');
  assert.equal(fmtW(1000), '1,0 kW', 'au seuil exact, rien ne change');
  assert.equal(fmtW(1250), '1,3 kW');
  assert.equal(fmtW(460), '460 W');
  assert.equal(fmtW(0), '0 W');
  assert.equal(fmtW(-0.4), '0 W', 'jamais « -0 W »');
});

test('schéma de la maison (fmtChipW) : 999,6 W est un kilowatt', () => {
  assert.equal(fmtChipW(999.6), '1,0 kW');
  assert.equal(fmtChipW(999.5), '1,0 kW');
  assert.equal(fmtChipW(999.4), '999 W');
  assert.equal(fmtChipW(1000), '1,0 kW');
  assert.equal(fmtChipW(1380), '1,4 kW');
  assert.equal(fmtChipW(7400), '7,4 kW', 'une borne de recharge');
  assert.equal(fmtChipW(47), '47 W');
  assert.equal(fmtChipW(-0.4), '0 W', 'jamais « -0 W »');
});

test('arc solaire (fmtKW) : l’unité se choisit après l’arrondi, à son seuil de 995', () => {
  assert.equal(fmtKW(994.6), '1,0 kW', '« 995 W » à côté de 995 écrit « 1,0 kW »');
  assert.match(fmtKW(-994.6), /^[-−]1,0 kW$/);
  assert.equal(fmtKW(994.4), '994 W');
  assert.equal(fmtKW(994), '994 W');
  assert.equal(fmtKW(995), '1,0 kW', 'au seuil exact, rien ne change');
  assert.equal(fmtKW(999.6), '1,0 kW');
  assert.equal(fmtKW(1380), '1,4 kW');
  assert.equal(fmtKW(907), '907 W');
  assert.equal(fmtKW(0), '0 W');
  assert.equal(fmtKW(-0.4), '0 W', 'jamais « -0 W »');
  assert.equal(fmtKW(-3), '-3 W', 'un onduleur qui consomme la nuit garde son signe');
});

test('aperçu des Paramètres : la consommation choisit son unité après l’arrondi', () => {
  const par = readFileSync(join(RACINE, 'src', 'views', 'parametres.jsx'), 'utf8');
  const tete = 'const conso = ';
  const debut = par.indexOf(tete + 'cw != null ? (');
  assert.notEqual(debut, -1, 'la tuile Consommation a changé de forme');
  assert.equal(par.indexOf(tete, debut + 1), -1, 'conso est défini deux fois');
  const fin = par.indexOf(';\n', debut);
  assert.notEqual(fin, -1);
  const conso = new Function('locale', 'return (cw) => ' + par.slice(debut + tete.length, fin) + ';')(locale);
  assert.equal(conso(994.6), '1,0 kW', '« 995 W » à côté de 995 écrit « 1,0 kW »');
  assert.equal(conso(-994.6), '1,0 kW', 'la tuile montre la valeur absolue');
  assert.equal(conso(994.4), '994 W');
  assert.equal(conso(995), '1,0 kW', 'au seuil exact, rien ne change');
  assert.equal(conso(2750), '2,8 kW');
  assert.equal(conso(460), '460 W');
  assert.equal(conso(-0.4), '0 W', 'jamais « -0 W »');
  assert.equal(conso(null), '—');
});
