// ─────────────────────────────────────────────────────────────────────────────
// Glisser une carte au doigt (07/10).
//
// « Il est difficile sur tactile de déplacer les cartes : c'est la barre de
// défilement qui prend le dessus, plutôt que ce soit la carte en déplacement
// et la barre qui suive le geste. »
//
// Deux manques. Le navigateur gardait le défilement vertical (`touch-action:
// pan-y`) même APRÈS que l'appui long ait saisi la carte ; et une fois la carte
// attrapée, rien ne faisait suivre la page, donc une cellule hors écran était
// hors d'atteinte.
//
// Le blocage ne vaut QUE pendant le glisser : le poser plus tôt casserait le
// défilement en mode édition, où les cartes couvrent l'écran.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pasDefilement, conteneurDefilant, bloquerDefilement, defileurAuto } from '../src/glisser.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');

/* Une fenêtre de 0 à 800 px de haut. */
const HAUT = 0, BAS = 800;

test('au milieu de l’écran, la page ne bouge pas', () => {
  assert.equal(pasDefilement(400, HAUT, BAS), 0);
  assert.equal(pasDefilement(200, HAUT, BAS), 0);
  assert.equal(pasDefilement(600, HAUT, BAS), 0);
});

test('près du haut la page remonte, près du bas elle descend', () => {
  assert.ok(pasDefilement(10, HAUT, BAS) < 0, 'vers le haut');
  assert.ok(pasDefilement(790, HAUT, BAS) > 0, 'vers le bas');
});

test('plus on s’enfonce dans la bande, plus ça va vite', () => {
  /* Un seuil sec ferait partir la page d'un coup : le pas croît du bord de la
   * bande jusqu'au bord de l'écran. */
  const a = Math.abs(pasDefilement(70, HAUT, BAS));
  const b = Math.abs(pasDefilement(40, HAUT, BAS));
  const c = Math.abs(pasDefilement(0, HAUT, BAS));
  assert.ok(a < b && b < c, `${a} < ${b} < ${c}`);
  assert.ok(c <= 16.001, 'la vitesse est bornée au bord');
});

test('un doigt sorti de l’écran ne va pas plus vite que le bord', () => {
  assert.equal(pasDefilement(-500, HAUT, BAS), pasDefilement(0, HAUT, BAS));
  assert.equal(pasDefilement(5000, HAUT, BAS), pasDefilement(BAS, HAUT, BAS));
});

test('une zone plus courte que deux bandes ne tire pas des deux côtés', () => {
  /* Les deux bandes se recouvriraient : on les rétrécit. Le milieu exact reste
   * immobile, et les deux bords tirent chacun dans son sens. */
  assert.equal(pasDefilement(50, 0, 100), 0, 'le milieu reste immobile');
  assert.ok(pasDefilement(5, 0, 100) < 0);
  assert.ok(pasDefilement(95, 0, 100) > 0);
});

test('une zone vide ou retournée ne fait rien', () => {
  assert.equal(pasDefilement(10, 0, 0), 0);
  assert.equal(pasDefilement(10, 800, 0), 0);
});

/* ── Le conteneur qui défile ─────────────────────────────────────────────── */

const elt = (overflowY, scrollHeight, clientHeight, parent = null) => ({
  nodeType: 1, parentElement: parent, scrollHeight, clientHeight,
  ownerDocument: { defaultView: { getComputedStyle: (n) => ({ overflowY: n.overflowY }) } },
  overflowY,
});

test('le conteneur retenu est celui qui déborde VRAIMENT', () => {
  /* Un cadre en `overflow: auto` sans débordement ne défile pas : s'y arrêter
   * laisserait la carte prisonnière de l'écran. */
  const vrai = elt('auto', 2000, 600);
  const faux = elt('auto', 600, 600, vrai);
  const carte = elt('visible', 100, 100, faux);
  assert.equal(conteneurDefilant(carte), vrai);
});

test('sans conteneur qui défile, c’est la fenêtre', () => {
  const dehors = elt('visible', 100, 100);
  assert.equal(conteneurDefilant(elt('visible', 50, 50, dehors)), null);
  assert.equal(conteneurDefilant(null), null);
});

/* ── Le blocage du doigt ─────────────────────────────────────────────────── */

test('le défilement du doigt se coupe en NON PASSIF, et se rend', () => {
  /* `passive: false` est indispensable : sans lui le navigateur ignore
   * `preventDefault` et défile quand même. */
  const poses = [];
  const retires = [];
  const doc = {
    addEventListener: (t, f, o) => poses.push([t, f, o]),
    removeEventListener: (t, f, o) => retires.push([t, f, o]),
  };
  const rendre = bloquerDefilement(doc);
  assert.equal(poses.length, 1);
  assert.equal(poses[0][0], 'touchmove');
  assert.deepEqual(poses[0][2], { passive: false });
  // Un événement annulable est bien arrêté ; un autre est laissé tranquille.
  let arrete = false;
  poses[0][1]({ cancelable: true, preventDefault: () => { arrete = true; } });
  assert.equal(arrete, true);
  assert.doesNotThrow(() => poses[0][1]({ cancelable: false }));
  rendre();
  assert.equal(retires.length, 1);
  assert.equal(retires[0][1], poses[0][1], 'le même écouteur doit être retiré');
});

test('sans document, rien ne casse', () => {
  assert.doesNotThrow(() => bloquerDefilement({})());
  const d = defileurAuto(null);
  assert.doesNotThrow(() => { d.viser(10); d.arreter(); });
});

/* ── Le branchement ──────────────────────────────────────────────────────── */

test('c’est le FANTÔME qui coupe et entraîne, pas la carte', () => {
  /* Le fantôme est posé par les cinq démarrages de glisser, et seulement quand
   * la carte est vraiment prise. Poser le blocage plus tôt — au `pointerdown` —
   * casserait le défilement en mode édition, où les cartes couvrent l'écran. */
  assert.ok(APP.includes("import { bloquerDefilement, defileurAuto } from './glisser.js';"), 'App.jsx n’importe plus le secours du glisser');
  const i = APP.indexOf('function poserFantome(');
  const j = APP.indexOf('\nfunction ', i + 1);
  const f = APP.slice(i, j < 0 ? undefined : j);
  assert.ok(f.includes('const rendre = bloquerDefilement('), 'le fantôme ne coupe plus le défilement du doigt');
  assert.ok(f.includes('const defileur = defileurAuto(el);'), 'la page ne suit plus le geste');
  assert.ok(f.includes('defileur.viser(y);'), 'le défileur ne sait plus où est le doigt');
  assert.ok(f.includes('defileur.arreter();') && f.includes('rendre();'), 'le défilement doit être rendu au lâcher');
  // Et rien de tout cela ne doit traîner dans le `pointerdown`.
  assert.ok(!/bloquerDefilement\(/.test(APP.replace(f, '')), 'le blocage ne doit exister qu’au moment de la prise');
});
