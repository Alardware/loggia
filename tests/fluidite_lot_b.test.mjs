// ─────────────────────────────────────────────────────────────────────────────
// FLUIDITÉ, LOT B — LA VUE ÉNERGIE (19/11 ; rapport de fluidité, points 4 et 5).
//
//  4. Les statistiques déjà lues se gardent quatre minutes : revenir sur Énergie
//     affiche tout de suite ; plus vieilles, elles restent montrées le temps de
//     la relecture. Le calendrier, en bas, ne se charge qu'en approchant.
//  5. Le code d'Énergie se prépare après le démarrage, et l'historique dès que
//     la vue se charge : plus de second écran vide.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { statsGardees, garderStats, oublierStats } = await import('../src/stats.js');
const lire = (f) => readFileSync(new URL('../src/' + f, import.meta.url), 'utf8');

test('une réponse gardée est fraîche quatre minutes, puis montrée en attendant la relecture', () => {
  oublierStats();
  assert.equal(statsGardees('a#jour#0'), null, 'rien de gardé : on demande');
  garderStats('a#jour#0', { 'sensor.a': [{ change: 1 }] });
  const t = Date.now();
  assert.deepEqual(statsGardees('a#jour#0', t), { res: { 'sensor.a': [{ change: 1 }] }, fraiche: true });
  assert.equal(statsGardees('a#jour#0', t + 5 * 60000).fraiche, false, 'le relevé de 5 min la trouve périmée et relit');
  assert.equal(statsGardees('a#semaine#0', t), null, 'une autre période est une autre question');
});

test('au plus 40 questions : les plus anciennes s’en vont', () => {
  oublierStats();
  for (let i = 0; i < 41; i++) garderStats('q' + i, {});
  assert.equal(statsGardees('q0'), null);
  assert.ok(statsGardees('q40'));
  oublierStats();
});

test('useStats affiche ce qui est gardé, ne relit que s’il le faut, et garde l’affichage si la relecture rate', () => {
  const S = lire('stats.js');
  assert.ok(S.includes('const garde = statsGardees(k);') && S.includes('if (garde.fraiche) return () => { vivant = false; };'));
  assert.ok(S.includes('.then(res => { if (!vivant) return; garderStats(k, res); appliquer(res); })'));
  assert.ok(S.includes('if (garde) { setPret(true); return; }'), 'une relecture ratée n’efface pas le graphe');
});

test('le calendrier attend d’approcher de l’écran ; l’historique part avec la vue ; la vue se prépare au calme', () => {
  const E = lire('views/energie.jsx');
  assert.ok(E.includes('<QuandVisible hauteur={280}>') && E.includes("rootMargin: '400px 0px'"));
  assert.ok(E.includes("import('./energiehisto.jsx').catch(() => {});"));
  const V = lire('vues/simples.jsx');
  assert.ok(V.includes("import('../views/energie.jsx').catch(() => {});") && V.includes('c.saveData') && V.includes('requestIdleCallback'));
});
