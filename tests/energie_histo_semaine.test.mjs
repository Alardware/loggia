// ─────────────────────────────────────────────────────────────────────────────
// « SEMAINE NE FONCTIONNE PAS » (19/11).
//
// Dans l'historique de la vue Énergie, passer de Jour à Semaine faisait tomber
// la vue : « Cannot read properties of undefined (reading 'titre') ». Les
// cases se recalculaient sur la période demandée (7 jours) pendant que les
// séries restaient celles de la précédente (24 heures) jusqu'à la réponse de
// Home Assistant ; le résumé du graphe lisait la 20e case d'une semaine.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
register('./jsx-hooks.mjs', import.meta.url);
const { EnHistoBarres } = await import('../src/engraphes.jsx');

const cases = (n) => Array.from({ length: n }, (_, i) => ({ label: String(i + 1), titre: 'case ' + (i + 1), debut: i }));

test('plus de valeurs que de cases : le graphe se dessine, il ne tombe pas', () => {
  const heures = Array.from({ length: 24 }, (_, i) => (i === 20 ? 3 : 0.5));
  const html = renderToStaticMarkup(createElement(EnHistoBarres, { series: [{ nom: 'Réseau', couleur: 'red', valeurs: heures }], cases: cases(7) }));
  assert.ok(html.includes('Réseau'), 'le résumé est écrit');
});

test('les cases rendues sont celles des séries lues, pas de la période demandée', () => {
  const S = readFileSync(new URL('../src/stats.js', import.meta.url), 'utf8');
  assert.ok(S.includes('setCasesLues(cases);'), 'posées avec les séries');
  assert.ok(S.includes('return { cases: casesLues || casesStat(periode, bornesStat(periode, decalage)), series, pret };'));
});
