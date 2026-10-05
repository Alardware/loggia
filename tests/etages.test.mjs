// Les étages (05/10).
//
// La donnée était là depuis longtemps — le registre d'étages de Home Assistant,
// lu par `discovery.py`, normalisé par `discovery.js`, porté par l'index — et
// aucune vue ne s'en servait.
//
// Elle sert à FILTRER les pièces de l'Accueil, pas à les regrouper : leur
// grille porte un placement libre et des tailles par carte, rangés par format
// d'écran. La découper aurait défait tout cela.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true });
const { etagesDe, etageDuNom, etagesDesPieces, piecesDeLEtage } = await import('../src/etages.js');

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');

// Une maison à trois niveaux. `floor` sur une zone, `level` sur un étage :
// c'est la forme que `discovery.js` donne à l'index.
const MAISON = {
  floors: [
    { id: 'etage', name: 'Étage', level: 1 },
    { id: 'rdc', name: 'Rez-de-chaussée', level: 0 },
    { id: 'cave', name: 'Sous-sol', level: -1 },
  ],
  areaList: [
    { id: 'a1', name: 'Salon', floor: 'rdc' },
    { id: 'a2', name: 'Cuisine', floor: 'rdc' },
    { id: 'a3', name: 'Chambre', floor: 'etage' },
    { id: 'a4', name: 'Bureau', floor: 'etage' },
    { id: 'a5', name: 'Garage', floor: null },
  ],
};
const PLAIN_PIED = { floors: [], areaList: [{ id: 'a1', name: 'Salon', floor: null }] };

test('du plus bas au plus haut, jamais par ordre alphabétique', () => {
  assert.deepEqual(etagesDe(MAISON).map(e => e.nom), ['Sous-sol', 'Rez-de-chaussée', 'Étage'],
    'le sous-sol (−1) avant le rez-de-chaussée (0), avant l’étage (1)');
  assert.deepEqual(etagesDe(MAISON).map(e => e.niveau), [-1, 0, 1]);
  // Un étage sans niveau déclaré passe en dernier plutôt qu'au hasard.
  const bancal = { floors: [{ id: 'x', name: 'Combles' }, { id: 'rdc', name: 'Rez', level: 0 }] };
  assert.deepEqual(etagesDe(bancal).map(e => e.nom), ['Rez', 'Combles']);
  assert.deepEqual(etagesDe(bancal).map(e => e.niveau), [0, null]);
  // Le niveau 0 est une VRAIE valeur : il ne doit pas passer pour « absent ».
  assert.equal(etagesDe({ floors: [{ id: 'r', name: 'Rez', level: 0 }] })[0].niveau, 0);
  assert.deepEqual(etagesDe(PLAIN_PIED), [], 'pas d’étage déclaré : rien');
  assert.deepEqual(etagesDe(null), []);
  assert.deepEqual(etagesDe({}), []);
});

test('l’étage d’une pièce se trouve par son NOM — c’est tout ce que l’Accueil connaît', () => {
  assert.equal(etageDuNom(MAISON, 'Salon'), 'rdc');
  assert.equal(etageDuNom(MAISON, 'Chambre'), 'etage');
  assert.equal(etageDuNom(MAISON, 'Garage'), null, 'une zone sans étage n’en a pas');
  assert.equal(etageDuNom(MAISON, '  Salon  '), 'rdc', 'les espaces autour ne comptent pas');
  assert.equal(etageDuNom(MAISON, 'Grenier'), null, 'une pièce inconnue ne plante pas');
  assert.equal(etageDuNom(MAISON, ''), null);
  assert.equal(etageDuNom(null, 'Salon'), null);
});

test('on ne propose un filtre que s’il y a de quoi choisir', () => {
  const r = etagesDesPieces(MAISON, ['Salon', 'Cuisine', 'Chambre', 'Bureau', 'Garage']);
  assert.deepEqual(r.etages.map(e => e.nom), ['Rez-de-chaussée', 'Étage'],
    'le sous-sol n’a aucune pièce montrée : il ne s’affiche pas');
  assert.deepEqual(r.etages.map(e => e.n), [2, 2]);
  assert.equal(r.sansEtage, 1, 'le garage est compté à part');
  assert.equal(r.utile, true);

  // Un seul étage habité : « Tous » et lui diraient la même chose.
  const seul = etagesDesPieces(MAISON, ['Salon', 'Cuisine', 'Garage']);
  assert.equal(seul.utile, false, 'un bouton qui ne retire rien n’est pas un choix');
  assert.equal(etagesDesPieces(PLAIN_PIED, ['Salon']).utile, false, 'une maison de plain-pied ne voit rien');
  assert.equal(etagesDesPieces(MAISON, []).utile, false);
  assert.equal(etagesDesPieces(null, null).utile, false);
});

test('filtrer garde les pièces sans étage — sinon elles se perdraient', () => {
  const noms = ['Salon', 'Cuisine', 'Chambre', 'Bureau', 'Garage'];
  assert.deepEqual(piecesDeLEtage(MAISON, noms, 'rdc'), ['Salon', 'Cuisine', 'Garage'],
    'le garage n’appartient à aucun étage : le cacher reviendrait à le perdre');
  assert.deepEqual(piecesDeLEtage(MAISON, noms, 'etage'), ['Chambre', 'Bureau', 'Garage']);
  assert.deepEqual(piecesDeLEtage(MAISON, noms, null), noms, 'sans choix, tout');
  assert.deepEqual(piecesDeLEtage(MAISON, noms, 'inconnu'), ['Garage'], 'un étage vidé ne montre que l’orphelin');
  // L'ORDRE donné aux pièces est conservé : l'agencement de l'Accueil le fixe.
  const inverse = ['Bureau', 'Chambre', 'Salon'];
  assert.deepEqual(piecesDeLEtage(MAISON, inverse, 'etage'), ['Bureau', 'Chambre']);
  assert.deepEqual(piecesDeLEtage(MAISON, null, 'rdc'), []);
});

test('le module calcule, il n’écrit rien à l’écran', () => {
  const s = lire('src', 'etages.js');
  assert.ok(!s.includes('tr(') && !s.includes('toLocaleDateString'),
    'aucun texte ici : les noms d’étages viennent de Home Assistant et ne se traduisent pas');
  assert.ok(!/['"](sensor|light|area)\.[a-z0-9_]+['"]/.test(s), 'aucune entité en dur');
});

test('le branchement : un filtre, et surtout PAS un découpage de la grille', () => {
  const APP = lire('src', 'App.jsx');
  assert.ok(APP.includes("import { etagesDesPieces, piecesDeLEtage } from './etages.js';"), 'les calculs viennent du module testé à sec');
  assert.ok(APP.includes('const infosEtages = etagesDesPieces(LOGGIA_INDEX, inner.map(p => p.name));'));
  /* La grille garde son placement libre, ses tailles par carte et son
   * glisser-déposer : on lui donne moins de pièces, on ne la redécoupe pas. */
  assert.ok(APP.includes('{ordrePieces(piecesVues.map(p => p.name)).map(n => piecesVues.find(p => p.name === n))'),
    'la grille dessine les pièces filtrées, dans l’ordre que l’agencement leur donne');
  assert.ok(APP.includes("{tr('{n} pièces', { n: piecesVues.length })}"), 'le compte suit le filtre');
  assert.ok(APP.includes('const etagesPuces = infosEtages.utile ? ('), 'aucune puce quand il n’y a rien à choisir');
  /* Au TELEPHONE les puces faisaient deborder l'en-tete : titre tronque,
   * compte disparu, « Cartes / Plan » coupe. Deux rangees alors, comme la
   * barre des ambiances — rien a faire glisser. */
  assert.ok(APP.includes('{!etroitPieces && etagesPuces}'), 'sur grand ecran, les puces restent sur la ligne du titre');
  assert.ok(APP.includes('{etroitPieces && etagesPuces && <div style={{ marginTop: 10 }}>{etagesPuces}</div>}'),
    'au telephone, elles passent sur leur propre rangee');
  /* Les positions enregistrees valent pour la maison ENTIERE : appliquees a
   * un sous-ensemble, elles laissaient les trous des pieces masquees. */
  assert.ok(APP.includes('disposer(piecesNoms, piecesTailles, etageChoisi ? {} : grille.places, piecesCols);'),
    'un filtre REALIGNE les cartes ; sans filtre, l’agencement reprend tous ses droits');
  assert.ok(APP.includes('const piecesNoms = ordrePieces(piecesVues.map(p => p.name));'),
    'le placement se calcule sur les pieces VISIBLES, pas sur toutes');
  // La puce choisie se remplit d'accent, comme toutes les puces de Loggia.
  assert.ok(APP.includes("background: on ? 'var(--o-accent-fond)' : 'transparent', color: on ? '#fff' : 'var(--o-text1)' }}>{e.nom}</button>"),
    'puce choisie = accent plein, texte blanc');
});

test('la démonstration a deux étages, et un garage qui n’en a aucun', () => {
  const DEMO = lire('src', 'demo.js');
  assert.ok(DEMO.includes("{ id: 'rdc', name: etiquette('Rez-de-chaussée'), level: 0 },"),
    'l’index du composant fournit `id` — `floor_id` est ce que la normalisation en fait ensuite');
  assert.ok(DEMO.includes("{ id: 'etage', name: etiquette('Étage'), level: 1 },"));
  assert.ok(DEMO.includes("floor: ETAGE_DE[id] || null"), 'chaque zone porte le sien');
  assert.ok(!/ETAGE_DE = \{[^}]*garage/.test(DEMO), 'le garage reste sans étage : il doit survivre à tous les filtres');
});
