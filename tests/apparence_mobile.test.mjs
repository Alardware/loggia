// ─────────────────────────────────────────────────────────────────────────────
// Apparence : les thèmes par trois au téléphone ; plus de second bleu.
//
// Retour du 19/09 : « dans Apparence, sur mobile, je pense qu'il y a moyen
// d'afficher par 3 les thèmes ; les couleurs d'accent, le 2e bleu pas la
// peine, je sais pas ce qu'il fait là ».
// - Une carte de thème par rangée au téléphone : six thèmes descendaient sur
//   650 px. Trois par rangée, la carte s'adapte ; deux sous 350 px.
// - « Bleu » (#4f8cff) était l'accent du thème d'origine, déjà offert par la
//   pastille « Couleur du thème ». Celle-ci montre maintenant l'accent DU
//   THÈME : elle lisait l'accent courant, et un choix la teintait aussi.
// L'ordinateur et la tablette ne changent pas. Voir l'ADR 0051 (v3.56.3).
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');
const PAR = lire('src', 'views', 'parametres.jsx');
const APP = lire('src', 'App.jsx');
const CSS = lire('src', 'index.css');
const fonction = (src, nom) => {
  const i = src.indexOf('\nfunction ' + nom + '(');
  return src.slice(i, src.indexOf('\n}\n', i) + 3);
};
// Le bloc des thèmes au téléphone (≤ 620 px).
const DEBUT_TEL = '@media (max-width: 620px) {\n  .grid-par-pal {';
const TEL = CSS.slice(CSS.indexOf(DEBUT_TEL), CSS.indexOf('\n}\n', CSS.indexOf(DEBUT_TEL)));

test('les couleurs d’accent : la couleur du thème, puis quatre teintes — plus de second bleu', () => {
  const m = PAR.match(/const ACCENTS = (\[.*\]);\n/);
  assert.ok(m, 'la liste des couleurs d’accent a changé de forme');
  const accents = JSON.parse(m[1].replace(/'/g, '"'));
  assert.deepEqual(accents.map(a => a[0]), ['', '#2dd4bf', '#a78bfa', '#f5a524', '#f87171']);
  assert.deepEqual(accents[0], ['', 'Couleur du thème']);
  // Un « Bleu » enregistré revient à la couleur du thème, comme les dégradés retirés du fond.
  assert.ok(fonction(APP, 'readLook').includes("if (L.accent === '#4f8cff') L.accent = '';"), 'un ancien « Bleu » resterait choisi sans pastille pour le dire');
});

test('la pastille « Couleur du thème » montre l’accent du thème, pas l’accent choisi', () => {
  assert.ok(PAR.includes("background: c || 'var(--o-accent-theme, var(--o-accent))'"), 'la pastille reprendrait la couleur choisie : deux pastilles pareilles');
  const look = fonction(APP, 'applyLook');
  const lu = look.indexOf("root.style.setProperty('--o-accent-theme', getComputedStyle(root).getPropertyValue('--o-accent').trim());");
  assert.ok(lu > 0, 'l’accent du thème n’est plus relevé');
  // Relevé AVANT que l'accent choisi ne le remplace, et après la purge du thème.
  assert.ok(lu < look.indexOf('  if (L.accent) {'), 'l’accent du thème est relevé après avoir été remplacé');
  assert.ok(APP.includes("'--o-accent', '--o-accent-rgb',"), '`--o-accent` n’est plus purgé au changement de thème');
});

test('au téléphone, les thèmes par trois — par deux sous 350 px ; ailleurs, rien ne change', () => {
  assert.ok(CSS.indexOf(DEBUT_TEL) > 0, 'le bloc des thèmes au téléphone a changé de forme');
  assert.ok(TEL.includes('.grid-par-pal { grid-template-columns: repeat(3, minmax(0, 1fr)) !important;'), 'les thèmes ne passent plus par trois au téléphone');
  assert.ok(CSS.includes('@media (max-width: 350px) { .grid-par-pal { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; } }'));
  assert.doesNotMatch(CSS, /\.grid-par-pal \{ grid-template-columns: 1fr/, 'une carte par rangée est revenue');
  // La carte s'adapte : le nom sur deux lignes au plus, la coche s'efface (le liseré suffit).
  assert.ok(TEL.includes('.o-theme-nom { white-space: normal !important;') && TEL.includes('-webkit-line-clamp: 2;'));
  assert.ok(TEL.includes('.o-theme-ok { display: none !important; }'));
  for (const classe of ['o-theme', 'o-theme-tete', 'o-theme-nom', 'o-theme-ok', 'o-theme-pts', 'o-theme-pt', 'o-theme-desc']) {
    assert.ok(PAR.includes('className="' + classe + '"'), classe + ' a disparu de la carte de thème');
  }
  // Toute règle des cartes vit dans le bloc du téléphone : l'ordinateur et la tablette gardent leurs cartes.
  assert.doesNotMatch(CSS.replace(TEL, ''), /\.o-theme(-[a-z]+)? \{/, 'une règle des cartes de thème touche l’ordinateur ou la tablette');
});
