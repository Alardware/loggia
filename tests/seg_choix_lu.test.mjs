// ─────────────────────────────────────────────────────────────────────────────
// Les sélecteurs segmentés des Paramètres disent leur choix (audit du 03/10).
//
// `Seg` ne montrait l'option choisie qu'en bleu plein : un lecteur d'écran
// lisait « Auto, bouton », « Clair, bouton »… sans dire laquelle était prise,
// ni de quoi il s'agissait. `Segment` (App.jsx) le faisait déjà : un groupe
// nommé, `aria-pressed` sur chaque option. Seg suit le même contrat, et chaque
// appel nomme son groupe — par `tr`, comme tout ce qui se lit.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAR = readFileSync(join(RACINE, 'src', 'views', 'parametres.jsx'), 'utf8');

const debut = PAR.indexOf('const Seg = (');
const SEG = debut < 0 ? '' : PAR.slice(debut, PAR.indexOf('\n);\n', debut));

test('le groupe a un nom, et chaque option dit si elle est choisie', () => {
  assert.ok(SEG, 'le composant Seg a disparu');
  assert.ok(SEG.includes('({ value, opts, onPick, label,'), 'Seg ne reçoit plus le nom de son groupe');
  assert.ok(SEG.includes('<div role="group" aria-label={label}'), 'le conteneur n’est plus un groupe nommé');
  assert.ok(SEG.includes('aria-pressed={value === v}'), 'l’option choisie ne se dit plus qu’en couleur');
  // Le bleu plein ne bouge pas : seul le lecteur d'écran y gagne.
  assert.ok(SEG.includes("background: value === v ? 'var(--o-accent-fond)' : 'transparent', color: value === v ? '#fff' : 'var(--o-text2)'"), 'la puce choisie n’est plus en bleu plein');
});

test('chaque sélecteur des Paramètres nomme son groupe, traduit', () => {
  const appels = [...PAR.matchAll(/<Seg\b/g)].map(m => PAR.slice(m.index, PAR.indexOf('/>', m.index)));
  assert.ok(appels.length > 0, 'aucun appel trouvé : le balayage est cassé');
  const NOM = /\blabel=\{tr\((?:'[^']+'|"[^"]+")\)\}/;
  const sansNom = appels.filter(a => !NOM.test(a)).map(a => a.replace(/\s+/g, ' ').slice(0, 70));
  assert.deepEqual(sansNom, [], 'ces sélecteurs se liraient sans nom');
});
