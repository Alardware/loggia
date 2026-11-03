// ─────────────────────────────────────────────────────────────────────────────
// Le mois en grand dans le calendrier de l'Énergie (31/10) — piste A de la
// planche Pinterest « Trade Echo » : sur un grand écran, le mois avec la
// valeur de chaque jour, le total de chaque semaine en huitième colonne, et une
// rangée de chiffres (total, moyenne par jour et son écart avec le mois
// d'avant, jour le plus haut). Le damier des douze mois reste à un clic.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);
const H = await import(new URL('../src/views/energiehisto.jsx', import.meta.url).href);
const G = await import(new URL('../src/engraphes.jsx', import.meta.url).href);
const SRC = readFileSync(new URL('../src/views/energiehisto.jsx', import.meta.url), 'utf8');

const JOUR = 24 * 3600 * 1000;
// Octobre 2026 : le 1er est un jeudi.
const cases = Array.from({ length: 31 }, (_, i) => ({ debut: new Date(2026, 9, i + 1, 0, 0).getTime(), titre: String(i + 1) }));

test('la moyenne ne compte que les journées finies, et se compare au mois d’avant', () => {
  const serie = cases.map(() => null);
  serie[0] = 10; serie[1] = 20; serie[2] = 30;   // trois journées finies : moyenne 20
  serie[3] = 1;                                   // aujourd'hui, à peine commencé
  const maintenant = cases[3].debut + 10 * 3600 * 1000;
  const r = H.resumeMois(cases, serie, [25, 25, null, 25], maintenant);
  assert.equal(r.total, 61, 'le total du mois oublie un jour');
  assert.equal(r.moyenne, 20, 'la journée en cours tire la moyenne vers le bas');
  assert.ok(Math.abs(r.ecart - (-0.2)) < 1e-9, 'l’écart avec le mois d’avant est faux : ' + r.ecart);
  assert.deepEqual(r.haut, { v: 30, debut: cases[2].debut }, 'le jour le plus haut n’est pas le bon');
});

test('sans mois d’avant, pas d’écart inventé ; sans données, pas de résumé', () => {
  const serie = cases.map((_, i) => (i < 5 ? 4 : null));
  const r = H.resumeMois(cases, serie, null, cases[30].debut + JOUR);
  assert.equal(r.ecart, null, 'un écart apparaît sans rien à comparer');
  assert.equal(H.resumeMois(cases, null), null, 'un résumé s’affiche sans aucune donnée');
});

test('le grand mois ferme chaque semaine par son total', () => {
  const serie = cases.map(() => 2);
  const html = renderToStaticMarkup(createElement(G.CalendrierMois, {
    cases, serie, formater: (v) => String(v), maintenant: cases[30].debut + JOUR, semaines: true, hauteur: 64,
  }));
  // Octobre 2026 : jeudi 1er → la première semaine compte 4 jours, puis 7, 7, 7, 6 (lundi 26 → samedi 31).
  const totaux = [...html.matchAll(/grid-column:8[^>]*><span[^>]*>([^<]+)<\/span>/g)].map(m => m[1]);
  assert.deepEqual(totaux, ['8', '14', '14', '14', '12'], 'les totaux de semaine sont faux : ' + totaux.join(', '));
  assert.ok(html.includes('height:64px'), 'les cases du grand mois restent carrées');
  const tel = renderToStaticMarkup(createElement(G.CalendrierMois, { cases, serie, maintenant: cases[30].debut + JOUR }));
  assert.ok(!tel.includes('grid-column:8'), 'le téléphone reçoit une huitième colonne');
});

test('à l’ordinateur, « Mois » d’abord ; le damier des douze mois reste à un clic', () => {
  assert.ok(SRC.includes("const [vue, setVue] = useState('mois');"), 'le grand écran n’ouvre plus sur le mois');
  assert.ok(SRC.includes("[['mois', tr('Mois')], ['annee', tr('Année')]]"), 'le choix Mois / Année a disparu');
  assert.ok(SRC.includes('<EnCalendrier mois={mois}'), 'le damier des douze mois a disparu');
  // Ses mots (31/10) : « 12,3 » plutôt que « 12 » — un total de semaine garde sa décimale.
  assert.ok(SRC.includes('formaterSemaine={(v) => dec(v, estCout ? 2 : 1)}'), 'les totaux de semaine perdent leur décimale');
  // Pas de cartes dans la carte : les chiffres sont séparés par un filet.
  const i = SRC.indexOf('function ChiffresMois(');
  const corps = SRC.slice(i, SRC.indexOf('\n}\n', i));
  assert.ok(corps.includes("borderLeft: k ? 'var(--o-bw,1px) solid var(--o-bd2)'") && !corps.includes('background:'),
    'les chiffres du mois sont redevenus des cartes dans la carte');
});
