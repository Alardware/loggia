// ─────────────────────────────────────────────────────────────────────────────
// Mouvement reduit : aucun defilement ne glisse quand le systeme demande moins
// d'animation.
//
// Audit du 03/10 : la barre des pieces et la rangee des scenarios lisaient deja
// `REDUCE_MOTION` (ui.jsx) avant de faire glisser — mais deux defilements
// l'ignoraient : les fleches de la bande d'icones (ChoixIcone) et la tuile
// « appareils actifs » de l'Accueil, qui fait descendre la page jusqu'au
// panneau En ce moment. Un glissement ecrit en dur anime quoi que dise
// `prefers-reduced-motion`.
//
// La regle tient en une ligne : dans `src/`, la chaine smooth ne s'ecrit QUE
// derriere `REDUCE_MOTION ? 'auto' :`. Elle attrape aussi la forme passee par
// une variable et le style en ligne `scrollBehavior`. Les shaders (smoothstep)
// ne sont pas des chaines : ils passent.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Les fichiers de `src/` dont le nom repond a `motif`, sous-dossiers compris.
 *  Les copies de travail (`src/*.avant-*`) n'ont pas une extension de source :
 *  elles restent dehors. */
const fichiers = (motif) => {
  const out = [];
  const parcourir = (d) => readdirSync(join(RACINE, d), { withFileTypes: true }).forEach(e => {
    if (e.isDirectory()) parcourir(join(d, e.name));
    else if (motif.test(e.name)) out.push(join(d, e.name));
  });
  parcourir('src');
  return out.map(f => [f.replace(/\\/g, '/'), readFileSync(join(RACINE, f), 'utf8')]);
};
const ligne = (src, i) => src.slice(0, i).split('\n').length;

test('aucun defilement doux en dur : la chaine smooth ne vit que derriere REDUCE_MOTION', () => {
  const garde = /REDUCE_MOTION\s*\?\s*(['"])auto\1\s*:\s*$/;
  const sources = fichiers(/\.(m?js|jsx|tsx?)$/);
  const fautes = [];
  let gardes = 0;
  for (const [nom, src] of sources) {
    for (const m of src.matchAll(/(['"])smooth\1/g)) {
      if (garde.test(src.slice(Math.max(0, m.index - 60), m.index))) gardes += 1;
      else fautes.push(nom + ':' + ligne(src, m.index));
    }
  }
  // Un test qui ne trouve rien ne garde rien : le parcours doit voir les
  // sources, et au moins un defilement doux deja bien ecrit.
  assert.ok(sources.length > 50 && gardes > 0, 'le parcours de src/ ne trouve plus rien : le motif a du changer');
  assert.deepEqual(fautes, [],
    "un defilement glisse sans lire prefers-reduced-motion : ecrire behavior: REDUCE_MOTION ? 'auto' : 'smooth'");
});

test('aucune feuille de style ne fait glisser tous les defilements d’office', () => {
  const feuilles = fichiers(/\.css$/);
  const fautes = [];
  for (const [nom, css] of feuilles) {
    for (const m of css.matchAll(/(?<![-\w])scroll-behavior\s*:\s*smooth/g)) fautes.push(nom + ':' + ligne(css, m.index));
  }
  assert.ok(feuilles.length > 0, 'aucune feuille de style trouvee dans src/ : le parcours a du changer');
  assert.deepEqual(fautes, [],
    'scroll-behavior: smooth anime aussi en mouvement reduit : le poser sous @media (prefers-reduced-motion: no-preference), et adapter ce test');
});

test('les deux defilements de l’audit lisent la preference', () => {
  const app = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
  assert.ok(app.includes("if (el) el.scrollBy({ left: sens * el.clientWidth * 0.8, behavior: REDUCE_MOTION ? 'auto' : 'smooth' });"),
    'les fleches de la bande d’icones');
  assert.ok(app.includes("if (el && el.scrollIntoView) el.scrollIntoView({ behavior: REDUCE_MOTION ? 'auto' : 'smooth', block: 'start' });"),
    'la tuile « appareils actifs » vers En ce moment');
});
