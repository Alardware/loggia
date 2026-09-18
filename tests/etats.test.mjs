// ─────────────────────────────────────────────────────────────────────────────
// Trois niveaux, une seule voix (v3.49.0, ADR 0047).
//
// Normal : discret, dans la couleur du texte. Attention : visible, en ambre,
// sans battre. Action : rouge, et le point bat. Le vocabulaire est celui de
// `attention.js` (danger / alerte / info) ; ces tests tiennent les deux bouts :
// les seuils d'une pile et du CO₂ ne vivent qu'à un endroit, et l'écran
// n'écrit plus une couleur d'état en dur — un thème clair doit pouvoir la
// redéfinir.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEUILS_PILE, SEUIL_CO2, niveauPile, niveauCo2, animationNiveau, couleurNiveau } from '../src/attention.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const compter = (s, motif) => s.split(motif).length - 1;
const app = lire('src', 'App.jsx');

test('une pile : rien tant qu’elle tient, attention à 20 %, action à 5 %', () => {
  assert.deepEqual(SEUILS_PILE, { alerte: 20, danger: 5 });
  assert.equal(niveauPile(null), null);
  assert.equal(niveauPile('abc'), null);
  assert.equal(niveauPile(100), null);
  assert.equal(niveauPile(21), null);
  assert.equal(niveauPile(20), 'alerte');
  assert.equal(niveauPile('14'), 'alerte');
  assert.equal(niveauPile(6), 'alerte');
  assert.equal(niveauPile(5), 'danger');
  assert.equal(niveauPile(0), 'danger');
});

test('le CO₂ : une attention au palier « chargé », le même chiffre partout', () => {
  assert.equal(niveauCo2(null), null);
  assert.equal(niveauCo2(SEUIL_CO2 - 1), null);
  assert.equal(niveauCo2(SEUIL_CO2), 'alerte');
  assert.equal(niveauCo2(4000), 'alerte');
  // Le badge d'une carte pièce lit le palier d'airPalier — plus de seconde échelle 600 / 900.
  assert.ok(app.includes("function co2Style(co2) { return airPalier(co2) === 2 ? { bc: 'var(--o-warn)'"));
  assert.ok(!app.includes('co2 < 600 ?'));
});

test('le point qui bat est réservé à l’action', () => {
  assert.equal(animationNiveau('danger'), 'pulse 1.2s infinite');
  assert.equal(animationNiveau('alerte'), 'none');
  assert.equal(animationNiveau('info'), 'none');
  assert.equal(animationNiveau(null), 'none');
  const lignes = app.split('\n').filter(l => /animation: [^}]*'pulse/.test(l));
  // Home Assistant perdu, alarme déclenchée : les deux seules actions qui battent en dur.
  assert.equal(lignes.length, 2, lignes.map(l => l.trim().slice(0, 80)).join('\n'));
  assert.ok(lignes.every(l => /ha && !ha\.online|triggered \?/.test(l)));
  assert.ok(app.includes('animation: animationNiveau(niveauMax(points))'), 'la bannière bat seulement en danger');
});

test('les piles de l’écran passent par la même table', () => {
  assert.equal(compter(app, 'couleurPile('), 3, 'la plante, l’aspirateur, la tondeuse');
  assert.ok(app.includes("const couleurPile = (pct) => { const n = niveauPile(pct); if (n) return couleurNiveau(n).col;"));
  assert.deepEqual(couleurNiveau('danger'), { col: 'var(--o-bad)', rgb: 'var(--o-bad-rgb)' });
});

test('plus de couleur d’état en dur : les jetons du thème, lisibles en clair', () => {
  // Les hex qui disaient un état (rouge, ambre, jaune, orange, bleu, gris)
  // ne restent que là où ils sont une identité : dégradés, palettes, LIVE.
  // Ce qui reste : la palette du flux d'énergie (#fbbf24), celle du thème
  // « dark » (#94a3b8), le bleu de la vignette Pièces (#60a5fa) — des identités.
  for (const [hex, n] of [['#fbbf24', 1], ['#ef4444', 0], ['#fb923c', 0], ['#94a3b8', 1], ['#60a5fa', 1]]) {
    assert.equal(compter(app, "'" + hex + "'"), n, hex);
  }
  assert.equal(compter(app, "'#ffb347'"), 0, '#ffb347');
  assert.equal(compter(app, "'#34d399'"), 0, '#34d399');
  assert.equal(compter(app, "'#f87171'"), 0, '#f87171');
  assert.equal(compter(app, "248,113,113"), 0, 'rgb rouge en dur');
  // Les notifications disent leur niveau par le jeton, et l’ambiance les relit ainsi.
  assert.ok(app.includes("filter(n => n && n[0] === 'var(--o-bad)')"));
  assert.ok(app.includes("out.push(['var(--o-bad)', tr('Alarme'), tr('Intrusion détectée'), rel(id)]);"));
  // La barre latérale : l'alarme en jetons rgb.
  assert.ok(app.includes("{ t: tr('ALARME DÉCLENCHÉE'), c: 'var(--o-bad-rgb)' }"));
  assert.ok(app.includes("{ t: tr('Alarme désarmée'), c: 'var(--o-ok-rgb)' }"));
  const ui = lire('src', 'ui.jsx');
  assert.ok(ui.includes("color: 'var(--o-bad)', marginTop: 3"));
  const param = lire('src', 'views', 'parametres.jsx');
  assert.ok(param.includes("background: 'rgba(var(--o-bad-rgb),.12)', border: '1px solid rgba(var(--o-bad-rgb),.4)', color: 'var(--o-bad)'"));
});

test('la tondeuse porte son nom, comme l’aspirateur', () => {
  assert.ok(!app.includes("label: 'Luba'"));
  assert.ok(app.includes("machines.luba = { label: (lm && lm.attributes && lm.attributes.friendly_name) || tr('Tondeuse')"));
});

test('les styles partagés vivent une fois, dans styles.js', () => {
  const styles = lire('src', 'styles.js');
  for (const nom of ['export const CARTE_RAIL', 'export const petitesCapitales', 'export const puce']) assert.ok(styles.includes(nom), nom);
  assert.equal(compter(styles, '#'), 1, 'aucune couleur en dur — sauf le blanc de la puce');
  for (const [f, attendu] of [
    ['src/cartemeteo.jsx', "import { CARTE_RAIL } from './styles.js';"],
    ['src/widgetsrail.jsx', "import { CARTE_RAIL, petitesCapitales } from './styles.js';"],
    ['src/ficherobot.jsx', "import { petitesCapitales } from './styles.js';"],
    ['src/views/journal.jsx', "import { puce } from '../styles.js';"],
    ['src/views/veilles.jsx', "import { puce } from '../styles.js';"],
  ]) {
    const s = lire(...f.split('/'));
    assert.ok(s.includes(attendu), f);
    assert.ok(!s.includes('const CARTE_RAIL = {') && !s.includes('const puce = (on) =>') && !s.includes("const PETITES_CAPITALES = { fontSize"), f + ' : plus de copie locale');
  }
});
