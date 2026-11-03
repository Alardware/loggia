// ─────────────────────────────────────────────────────────────────────────────
// CHAQUE RÉGLAGE DANS LES DEUX FORMATS (03/11).
//
// Les Paramètres ont deux mises en page : l'ordinateur (maquette v3) et le
// téléphone (maquette v4), écrites chacune à part. La reprise « à la lettre »
// du 02/11 en a perdu trois réglages d'un coup (« Sa propre apparence »,
// « À jour / vX disponible », le refus des Alertes), sans que rien ne le dise.
//
// Ce test compare ce que chaque format ÉCRIT — `onLook({ accent })`,
// `onAmbient`, `save({ calme })`… —, pas ce qu'il affiche : le même réglage
// s'appelle « Accent » ici et « Couleur d'accent » là. Un réglage qu'un format
// sait changer et l'autre non fait échouer le test ; un écart voulu s'inscrit
// dans `ECARTS`, avec sa raison.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const PAR = lire('src', 'views', 'parametres.jsx');

/** Ce qu'un morceau de JSX écrit : les champs de `onLook`, de `save`, et les gestes nommés. */
function ecritures(s) {
  const r = new Set();
  for (const m of s.matchAll(/onLook\(\{\s*([a-zA-Z]+)\s*:/g)) r.add('look.' + m[1]);
  for (const m of s.matchAll(/save\(\{\s*([a-zA-Z]+)\s*:/g)) r.add('save.' + m[1]);
  for (const m of s.matchAll(/\b((?:on|choisir|toggle|basculer|mettre)[A-Z]\w*)\b/g)) r.add(m[1]);
  return r;
}
function comparer(pc, tel, ecarts, quoi) {
  const a = ecritures(pc), b = ecritures(tel);
  const seulPc = [...a].filter(x => !b.has(x) && !(ecarts.pc || []).includes(x));
  const seulTel = [...b].filter(x => !a.has(x) && !(ecarts.tel || []).includes(x));
  assert.ok(a.size > 0 && b.size > 0, quoi + ' : aucune écriture trouvée — le découpage du fichier a changé');
  assert.deepEqual(seulPc, [], quoi + ' : réglage(s) de l’ordinateur absent(s) du téléphone');
  assert.deepEqual(seulTel, [], quoi + ' : réglage(s) du téléphone absent(s) de l’ordinateur');
}

test('Apparence : l’ordinateur et le téléphone règlent les mêmes choses', () => {
  const debut = PAR.indexOf("{tab === 'apparence'");
  const tel = PAR.indexOf("/* Le téléphone (maquette v4) : d'autres groupes", debut);
  const fin = PAR.indexOf("{tab === '", tel + 10);
  assert.ok(debut > 0 && tel > debut && fin > tel, 'les deux versions de l’Apparence sont introuvables');
  comparer(PAR.slice(debut, tel), PAR.slice(tel, fin), {
    // Les marges : `MargesAvancees` reçoit sa remise à zéro sous le nom `onReset` ; le téléphone a ses propres pas (`onStep`).
    pc: ['onReset'], tel: ['onStep'],
  }, 'Apparence');
});

test('Alertes : l’ordinateur et le téléphone règlent les mêmes choses', () => {
  const a = PAR.indexOf('function AlertesTele(');
  const tel = PAR.indexOf('  if (tel) return (', a);
  const pc = PAR.indexOf('\n  return (', tel + 20);
  const fin = PAR.indexOf('\nfunction ', pc);
  assert.ok(a > 0 && tel > a && pc > tel && fin > pc, 'les deux versions des Alertes sont introuvables');
  comparer(PAR.slice(pc, fin), PAR.slice(tel, pc), {}, 'Alertes');
  // Un refus se dit dans les deux, près des bascules (relecture du 03/11).
  assert.equal((PAR.slice(tel, fin).match(/role="alert"/g) || []).length, 2, 'le bandeau de refus manque à l’un des formats');
});

test('Écrans : « Sa propre apparence » se règle dans les deux formats (ADR 0223)', () => {
  const APP = lire('src', 'views', 'appareils.jsx');
  assert.equal((APP.match(/poser\(\{ apparence: !fiche\.apparence \}\)/g) || []).length, 2, 'la bascule manque à l’un des formats');
});

test('À propos : « À jour / vX disponible » se voit dans les deux formats', () => {
  const debut = PAR.indexOf("{tab === 'about' && (() => {");
  assert.ok(debut > 0);
  const bloc = PAR.slice(debut);
  const coupe = bloc.indexOf(') : (', bloc.indexOf('return avecRail ? ('));
  assert.ok(coupe > 0, 'les deux versions d’À propos sont introuvables');
  assert.ok(bloc.slice(0, coupe).includes('{etatVersion}'), 'l’état de la version manque à l’ordinateur');
  assert.ok(/\{etatVersion &&/.test(bloc.slice(coupe, coupe + 4000)), 'l’état de la version manque au téléphone');
});
