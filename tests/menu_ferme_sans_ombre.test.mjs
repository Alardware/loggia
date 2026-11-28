// Le menu latéral FERMÉ ne projette plus d'ombre sur la page (23/11).
//
// Au téléphone et à la tablette (`html.loggia-tactile`), comme dans une fenêtre
// de 820 px au plus, le menu devient un tiroir : fermé, il est poussé hors de
// l'écran par `translateX(-100%)`, à x = −264. Il gardait pourtant son ombre
// `0 0 50px rgba(0,0,0,.55)` : le halo débordait sur les dix premiers pixels de
// toute la page, sur toute la hauteur — un bord gris bien visible en thème clair
// (démo `?demo&vue=objets&theme=ios&mode=light`, 390 px).
//
// Ce test relève chaque règle qui donne une ombre au tiroir et exige, juste
// après dans le même contexte, sa règle « fermé » sans ombre. Ouvert, le tiroir
// garde la sienne : elle le détache de la page qu'il recouvre.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
// Sans les commentaires : certains citent des accolades, qui fausseraient le relevé.
const css = readFileSync(join(RACINE, 'src', 'index.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

// Les blocs les plus intérieurs : `sélecteur { déclarations }`, dans l'ordre du fichier.
const blocs = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({ sel: m[1].trim(), decl: m[2] }));
const valeur = (decl, prop) => {
  const m = new RegExp('(?:^|;)\\s*' + prop + '\\s*:\\s*([^;]+)').exec(decl);
  return m ? m[1].trim() : null;
};

// Le tiroir lui-même (ni ouvert ni fermé), quand il porte une ombre.
const ombres = blocs
  .map((b, i) => ({ ...b, i }))
  .filter(b => /(^|\s)\.loggia-aside$/.test(b.sel) && valeur(b.decl, 'box-shadow') && !/^none\b/.test(valeur(b.decl, 'box-shadow')));

test('le relevé voit bien les deux tiroirs ombrés (tactile et fenêtre étroite)', () => {
  assert.deepEqual(ombres.map(b => b.sel), ['html.loggia-tactile .loggia-aside', '.loggia-aside'],
    'les règles du tiroir ont changé : ce test ne garde plus ce qu’il croit garder');
});

test('ouvert, le tiroir garde son ombre', () => {
  for (const b of ombres) {
    assert.equal(valeur(b.decl, 'box-shadow'), '0 0 50px rgba(0,0,0,.55)', b.sel + ' : l’ombre du tiroir ouvert a changé');
    const prefixe = b.sel.slice(0, -'.loggia-aside'.length);
    const ouvert = blocs.slice(b.i + 1).find(x => x.sel === prefixe + '.loggia-aside.is-open');
    assert.ok(ouvert, prefixe + '.loggia-aside.is-open introuvable après ' + b.sel);
    assert.equal(valeur(ouvert.decl, 'box-shadow'), null, ouvert.sel + ' : le tiroir ouvert ne doit pas perdre son ombre');
  }
});

test('fermé, le tiroir n’a plus d’ombre : rien ne bave sur la gauche de la page', () => {
  for (const b of ombres) {
    const prefixe = b.sel.slice(0, -'.loggia-aside'.length);
    // La règle « fermé » du MÊME contexte : la première qui suit (celle du rail de
    // 72 px, sur ordinateur, est plus haut dans le fichier et ne compte pas).
    const ferme = blocs.slice(b.i + 1).find(x => x.sel === prefixe + '.loggia-aside.is-closed');
    assert.ok(ferme, prefixe + '.loggia-aside.is-closed introuvable après ' + b.sel);
    assert.match(ferme.decl, /translateX\(-100%\)/, ferme.sel + ' : le tiroir fermé n’est plus poussé hors de l’écran');
    assert.equal(valeur(ferme.decl, 'box-shadow'), 'none',
      ferme.sel + ' : poussé à x = −264, le tiroir fermé laisse son halo de 50 px sur le bord gauche de la page');
  }
});

test('l’ombre ne part qu’une fois le tiroir sorti : la fermeture ne change pas à l’œil', () => {
  for (const b of ombres) {
    const duree = /transform\s+([\d.]+m?s)/.exec(valeur(b.decl, 'transition') || '');
    assert.ok(duree, b.sel + ' : le glissement du tiroir n’a plus de durée lisible');
    const prefixe = b.sel.slice(0, -'.loggia-aside'.length);
    const ferme = blocs.slice(b.i + 1).find(x => x.sel === prefixe + '.loggia-aside.is-closed');
    const transition = valeur(ferme.decl, 'transition') || '';
    assert.ok(transition.includes('transform ' + duree[1]), ferme.sel + ' : le glissement ne garde pas sa durée (' + transition + ')');
    assert.ok(transition.includes('box-shadow 0s ' + duree[1]),
      ferme.sel + ' : l’ombre doit tomber à la fin du glissement, pas au début (' + transition + ')');
  }
});
