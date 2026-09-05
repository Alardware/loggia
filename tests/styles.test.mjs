// ─────────────────────────────────────────────────────────────────────────────
// Ne pas mélanger un raccourci CSS et sa propriété détaillée.
//
// Loggia construit ses styles par surcharge : une base (`hbtn`, `chip`,
// `entInp`) pose le cadre, et chaque usage l'étend avec `{ ...base, … }`. Les
// bases posent le RACCOURCI — `border: '1px solid …'`. Une surcharge qui ajoute
// `borderColor` fait donc coexister les deux sur le même élément.
//
// React n'en garantit pas l'ordre. Au retour à l'état normal, il retire
// `borderColor` en laissant `border` posé, et la bordure peut garder la couleur
// de l'état d'exception. Trois endroits le faisaient :
//
//   • le bouton d'édition de l'en-tête, qui pouvait rester accentué ;
//   • la puce rouge du bilan ;
//   • le champ d'entité des Paramètres — le plus visible : on corrigeait une
//     entité introuvable et le champ pouvait rester bordé de rouge.
//
// Seul le premier se signalait dans la console. Les deux autres attendaient.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Chaque source JSX du produit, avec son nom. */
function sources() {
  const out = [['src/App.jsx', readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8')]];
  const vues = join(RACINE, 'src', 'views');
  for (const f of readdirSync(vues)) {
    if (f.endsWith('.jsx')) out.push(['src/views/' + f, readFileSync(join(vues, f), 'utf8')]);
  }
  out.push(['src/ui.jsx', readFileSync(join(RACINE, 'src', 'ui.jsx'), 'utf8')]);
  return out;
}

// Les détaillées dont le raccourci est massivement employé dans ce code :
// `border:` et `background:` s'y comptent par centaines, donc toute base
// susceptible d'être étendue en pose un.
const DETAILLEES = ['borderColor', 'borderWidth', 'borderStyle', 'backgroundColor', 'backgroundImage'];

test('aucune surcharge n’ajoute une propriété détaillée à une base', () => {
  const motif = new RegExp(`\\.\\.\\.[A-Za-z_$][\\w$]*,[^}]*\\b(${DETAILLEES.join('|')})\\s*:`, 'g');
  const fautes = [];
  for (const [nom, src] of sources()) {
    for (const m of src.match(motif) || []) fautes.push(`${nom} → ${m.slice(0, 78)}`);
  }
  assert.deepEqual(fautes, [],
    'une surcharge mélange raccourci et détaillée : au retour à l’état normal, la valeur d’exception peut rester');
});

test('le bouton d’édition colore sa bordure par le raccourci', () => {
  const src = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
  const i = src.indexOf('const editBtn = editMode ?');
  assert.notEqual(i, -1, 'le bouton d’édition de l’en-tête a disparu');
  const ligne = src.slice(i, src.indexOf('\n', i));
  // Mesuré dans la démo : au repos rgba(255,255,255,.07), en édition
  // rgba(79,140,255,.45), et de retour au repos ensuite. Le raccourci est ce
  // qui rend ce retour fiable.
  assert.match(ligne, /border: 'var\(--o-bw,1px\) solid rgba\(var\(--o-accent-rgb\),\.45\)'/,
    'le bouton recolore sa bordure autrement que par le raccourci');
});

test('le champ d’entité retrouve sa bordure quand l’entité redevient valide', () => {
  const src = readFileSync(join(RACINE, 'src', 'views', 'parametres.jsx'), 'utf8');
  const i = src.indexOf("st === 'bad' ?");
  assert.notEqual(i, -1, 'le marquage des entités introuvables a disparu');
  const bloc = src.slice(i - 20, i + 130);
  // Le repli DOIT être la bordure de la base, pas `undefined` : la clé est
  // posée dans tous les cas, et `undefined` effacerait la bordure normale
  // héritée du spread au lieu de la rétablir.
  assert.match(bloc, /: entInp\.border/,
    'le champ retombe sur undefined : il perdrait sa bordure au lieu de retrouver la normale');
  assert.ok(!/borderColor/.test(bloc), 'le champ recolore de nouveau par la propriété détaillée');
});
