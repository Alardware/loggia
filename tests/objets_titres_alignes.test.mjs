/* LES TITRES D'OBJETS À LA MÊME HAUTEUR (19/10).
 *
 * « Chaque titre — Lumières, Ouvertures, Chauffage… — n'est pas à la même
 * hauteur : Chauffage, Prises, Capteurs et Tous sont un peu plus haut. »
 *
 * Mesuré en démonstration à 1440 px, sous la rangée des puces : Lumières,
 * Volets, Multimédia et IoT à 35 px, Tous, Chauffage, Prises et Capteurs à
 * 24 px. Les premiers vivent dans une rangée de 40 px (la hauteur de la puce
 * « Tout éteindre »), titre centré ; les seconds dans une rangée alignée sur
 * la ligne de base, sans hauteur — 19 px, le titre collé en haut. La règle
 * existait (« la hauteur des autres en-têtes, 40 px ») ; trois rangées ne la
 * suivaient pas. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(join(RACINE, 'src', f), 'utf8');
const css = lire('index.css');
const regle = (sel) => {
  const i = css.indexOf(sel + ' {');
  assert.ok(i >= 0, sel + ' existe');
  return css.slice(i, css.indexOf('}', i) + 1);
};
// Les rangées de 40 px, titre centré : celles qui étaient justes, et la commune.
const RANGEES = ['o-objets-entete', 'o-prises-entete', 'o-lumieres-entete', 'o-medias-entete', 'o-iot-entete'];

test('toutes les rangées de titre d’Objets ont 40 px, titre centré', () => {
  for (const c of RANGEES) {
    const r = regle('.' + c);
    assert.ok(r.includes('align-items: center'), c + ' centre son titre');
    assert.ok(r.includes('min-height: 40px'), c + ' a 40 px');
  }
});

test('chaque titre de filtre est posé dans une de ces rangées', () => {
  const app = lire('App.jsx');
  const titres = [...app.matchAll(/\{titreFiltre\}<\/h2>/g)].map(m => m.index);
  assert.ok(titres.length >= 10, 'le balayage voit les titres (' + titres.length + ')');
  for (const i of titres) {
    const avant = app.slice(0, i);
    const h2 = avant.lastIndexOf('<h2');
    const div = avant.lastIndexOf('<div', h2);
    const ouvrante = app.slice(div, h2);
    const juste = RANGEES.some(c => ouvrante.includes('className="' + c + '"')) || ouvrante.includes('minHeight: 40');
    assert.ok(juste, 'titre sans rangée de 40 px : ' + ouvrante.slice(0, 120).replace(/\s+/g, ' '));
  }
});

test('les Capteurs aussi, dans leur module', () => {
  const c = lire('capteurssections.jsx');
  assert.match(c, /<div className="o-objets-entete">\s*<h2 style=\{TITRE_FILTRE\}>\{titre\}<\/h2>/);
});
