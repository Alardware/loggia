/* Les mots du serveur des prises dans la vue Journal (chantier Prises, tâche 11 ;
 * le contrat du plan 1) : les modules `prises` et `minuteurs` ont leur nom, les
 * lignes d'un cycle et la pose d'un minuteur se lisent dans la langue de
 * l'écran — leurs kWh à virgule en français —, et la démo les écrit comme le
 * serveur : l'instant réel dans les parties, les kWh à part. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
const { mot, pourquoi } = await import('../src/journalmots.js');
const VUE = readFileSync(new URL('../src/views/journal.jsx', import.meta.url), 'utf8');

const CYCLE = { module: 'prises', regle: 'cycle', quoi: 'cycle terminé', cibles: ['switch.prise_lave_vaisselle'], n: 1, ts: 1760364840,
  motif: 'à 16:14 · 1.08 kWh', g: { motif: [['à {h}', { h: '16:14', ts: 1760364240 }], ['{kwh} kWh', { kwh: 1.08 }]] } };

test('une ligne de cycle : ses mots, ses kWh à la façon de la langue', () => {
  assert.equal(mot(CYCLE, 'quoi'), 'cycle terminé');
  assert.equal(mot(CYCLE, 'motif'), 'à 16:14 · 1,08 kWh', 'pas « 1.08 » en français');
  assert.equal(pourquoi(CYCLE), 'cycle · à 16:14 · 1,08 kWh');
  assert.equal(mot({ motif: '30 min', g: { motif: [['{n} min', { n: 30 }]] } }, 'motif'), '30 min', 'un entier reste tel quel');
});

test('la vue Journal nomme les modules des prises et du minuteur', () => {
  assert.ok(VUE.includes("prises: tr('Prises'), minuteurs: tr('Minuteurs'),"));
});

test('la démo écrit les cycles comme le serveur : « cycle démarré » une minute après, « cycle terminé » dix après la baisse', async () => {
  const { maisonPrisesDemo, reglesDemo } = await import('../src/demo.js');
  maisonPrisesDemo({ quand: new Date(2026, 9, 13, 20, 40).getTime() });
  const lignes = reglesDemo({}).journal.filter(l => l.module === 'prises' && l.regle === 'cycle');
  const fin = lignes.find(l => l.quoi === 'cycle terminé' && l.motif.startsWith('à 16:14'));
  assert.ok(fin, 'le cycle du jour, fini à 16:14');
  assert.equal(fin.ts - fin.g.motif[0][1].ts, 600, 'conclu dix minutes après la baisse ; l’instant réel est dans les parties');
  assert.ok(fin.g.motif[1][1].kwh > 1 && fin.g.motif[1][1].kwh < 1.2 && fin.motif === 'à 16:14 · ' + fin.g.motif[1][1].kwh + ' kWh');
  const debut = lignes.find(l => l.quoi === 'cycle démarré' && l.motif === 'à 13:40');
  assert.equal(debut.ts - debut.g.motif[0][1].ts, 60);
  assert.deepEqual(debut.cibles, ['switch.prise_lave_vaisselle']);
});
