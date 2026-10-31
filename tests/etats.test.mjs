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
import { MONOLITHE, VUES_SORTIES, importsDe } from './monolithe.mjs'; // App.jsx + les vues sorties du boot (ADR 0274)

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const compter = (s, motif) => s.split(motif).length - 1;
  /* + l'ecran de veille et la modale du code : sortis d'App.jsx le 23/09
   * (plan M1). Ce que ce fichier verifie n'a pas bouge, seulement son
   * adresse — on relit donc le monolithe ET ce qui en est sorti. */
const app = ([MONOLITHE, ...['ecranveille.jsx', 'pinmodal.jsx', 'theme.js'].map(f => lire('src', f))].join(String.fromCharCode(10)) + VUES_SORTIES);

/* ASSERTION MODIFIÉE (chantier Capteurs, étapes 2 et 3, tâche 11 ; C32, § 19.8) : UN seul seuil, celui de la veille des piles — 15 % par défaut, relu
 * avec les veilles (`reglerSeuilPile`) ; le critique ne bouge pas. */
test('une pile : rien tant qu’elle tient, attention à 15 % (le seuil de la veille des piles), action à 5 %', () => {
  assert.deepEqual(SEUILS_PILE, { alerte: 15, danger: 5 });
  assert.equal(niveauPile(null), null);
  assert.equal(niveauPile('abc'), null);
  assert.equal(niveauPile(100), null);
  assert.equal(niveauPile(16), null);
  assert.equal(niveauPile(15), 'alerte');
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
  // ASSERTION MODIFIÉE (audit du 19/10, M16) : le badge d'une carte pièce lit la table (`zoneCo2` → `zoneMesure('co2')`), plus `co2Style`.
  assert.ok(!app.includes('function co2Style') && app.includes("out.bc = z && !z.bon ? z.c : 'var(--o-text2)'"));
  assert.equal(niveauCo2(1500, 1800), null, 'le seuil réglé dans la veille');
  assert.equal(niveauCo2(1800, 1800), 'alerte');
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
  // ASSERTION MODIFIÉE (chantier Capteurs, étapes 2 et 3, tâche 10 ; C30, C31) : la carte et la fiche d'une plante lisent la pile à la source
  // (`niveauPile`, `couleurNiveau` — ficheplante.jsx) ; restent l'aspirateur et la tondeuse.
  // ASSERTION MODIFIÉE (chantier Capteurs, étapes 2 et 3, tâche 11 ; C32) : `couleurPile` vit dans attention.js — la seule règle — et sert aussi au coin
  // d'un capteur, à la rangée Pile des fiches et à la valeur d'une pile dans la fiche universelle.
  // ASSERTION MODIFIÉE (chantier IoT, tâche 6, 18/10 ; I8, I12) : la batterie de la carte d'un robot et de sa compacte suit la même règle.
  // ASSERTION MODIFIÉE (audit du 19/10, point 13) : les cinq barres d'une pile prennent elles aussi `couleurPile` (`barresPile` est parti).
  assert.equal(compter(app, 'couleurPile('), 8, 'l’aspirateur, la tondeuse, le coin d’un capteur, les barres d’une pile, la rangée Pile, la fiche universelle, la carte d’un robot et sa compacte');
  // ASSERTION MODIFIÉE (ADR 0283) : les cartes sorties d'App.jsx importent elles-mêmes ce qu'elles lisent ; la ligne recopiée se lit par ses noms (`importsDe`).
  assert.ok(['couleurPile', 'reglerSeuilPile'].every(n => importsDe(app, './attention.js').has(n)) && !app.includes('const couleurPile ='), 'la règle vient d’attention.js');
  assert.deepEqual(couleurNiveau('danger'), { col: 'var(--o-bad)', rgb: 'var(--o-bad-rgb)' });
});

test('plus de couleur d’état en dur : les jetons du thème, lisibles en clair', () => {
  // Les hex qui disaient un état (rouge, ambre, jaune, orange, bleu, gris)
  // ne restent que là où ils sont une identité : dégradés, palettes, LIVE.
  // Ce qui reste : la palette du thème « dark » (#94a3b8) et le bleu de la
  // vignette Pièces (#60a5fa) — des identités ; le flux d'énergie a ses
  // jetons depuis la v3.50.0.
  for (const [hex, n] of [['#fbbf24', 0], ['#ef4444', 0], ['#fb923c', 0], ['#94a3b8', 1], ['#60a5fa', 1]]) {
    assert.equal(compter(app, "'" + hex + "'"), n, hex);
  }
  assert.equal(compter(app, "'#ffb347'"), 0, '#ffb347');
  assert.equal(compter(app, "'#34d399'"), 0, '#34d399');
  assert.equal(compter(app, "'#f87171'"), 0, '#f87171');
  assert.equal(compter(app, "248,113,113"), 0, 'rgb rouge en dur');
  // Les notifications disent leur niveau par le jeton, et l’ambiance les relit ainsi.
  assert.ok(app.includes("c: 'var(--o-bad)', t: tr('Alarme'), m: tr('Intrusion détectée')"));
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
  /* ASSERTION MODIFIÉE (chantier IoT, passe bis 2 du 18/10, point L) : les clés de ces deux machines portaient les surnoms des
   * robots de l'installation d'origine ; elles disent leur nature (`machines.aspirateur`, `machines.tondeuse`). */
  assert.ok(app.includes("machines.tondeuse = { label: (lm && lm.attributes && lm.attributes.friendly_name) || tr('Tondeuse')"));
  assert.ok(app.includes("machines.aspirateur = { label: (rVac && rVac.name) || tr('Aspirateur')"), 'la clé de l’aspirateur dit sa nature');
});

test('les styles partagés vivent une fois, dans styles.js', () => {
  const styles = lire('src', 'styles.js');
  for (const nom of ['export const CARTE_RAIL', 'export const petitesCapitales', 'export const puce']) assert.ok(styles.includes(nom), nom);
  assert.equal(compter(styles, '#'), 1, 'aucune couleur en dur — sauf le blanc de la puce');
  for (const [f, attendu] of [
    ['src/cartemeteo.jsx', "import { CARTE_RAIL } from './styles.js';"],
    ['src/widgetsrail.jsx', "import { CARTE_RAIL, petitesCapitales } from './styles.js';"],
    ['src/ficherobot.jsx', "import { petitesCapitales, LISERE } from './styles.js';"],
    ['src/views/journal.jsx', "import { puce } from '../styles.js';"],
    ['src/views/veilles.jsx', "import { puce } from '../styles.js';"],
  ]) {
    const s = lire(...f.split('/'));
    assert.ok(s.includes(attendu), f);
    assert.ok(!s.includes('const CARTE_RAIL = {') && !s.includes('const puce = (on) =>') && !s.includes("const PETITES_CAPITALES = { fontSize"), f + ' : plus de copie locale');
  }
});
