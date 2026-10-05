// ─────────────────────────────────────────────────────────────────────────────
// Où l'on est, dit au lecteur d'écran (audit du 03/10).
//
// La barre du bas du téléphone et les puces de pièce ne montraient la vue
// ouverte que par une couleur ; la barre latérale le disait déjà
// (`aria-current="page"`, plan M7). « Menu » ouvrait le tiroir sans dire s'il
// l'était, et ni la barre ni les puces n'avaient de nom.
//
// Les noms viennent de clés DÉJÀ traduites : rien de neuf dans les
// catalogues, et le polonais, relu par un Polonais, reste tel quel.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
const bloc = (debut, fin) => {
  const d = app.indexOf(debut);
  assert.ok(d >= 0, debut + ' introuvable');
  const f = app.indexOf(fin, d);
  return app.slice(d, f < 0 ? undefined : f);
};
const barre = bloc('function MobileNav(', '</nav>');
const pieces = bloc('function RoomNav(', '\n}');

test('la barre du bas porte un nom et dit la vue ouverte', () => {
  assert.ok(barre.includes(`<nav ref={navRef} className="loggia-mobilenav" aria-label={tr('Vues')}`), 'le <nav> de la barre du bas n’a pas de nom');
  assert.ok(barre.includes("<button onClick={() => onNav(it.id)} aria-current={on ? 'page' : undefined} style={cell(on)}>"), 'la vue ouverte n’est qu’une couleur');
});

test('« Menu » dit si le tiroir est ouvert, et l’état passé est celui du vrai tiroir', () => {
  assert.ok(barre.includes('function MobileNav({ view, onNav, onMenu, menuOuvert = false,'), 'la barre ne reçoit pas l’état du tiroir');
  assert.ok(barre.includes('<button onClick={onMenu} aria-expanded={menuOuvert} style={cell(false)}>'), '« Menu » ne dit pas si le tiroir est ouvert');
  assert.match(app, /<MobileNav [^\n]*onMenu=\{\(\) => setNavOpen\(o => !o\)\} menuOuvert=\{navOpen\} /, 'l’état passé n’est pas celui que « Menu » bascule');
});

test('les puces de pièce forment un groupe nommé et disent la pièce ouverte', () => {
  assert.ok(pieces.includes(`<div ref={wrapRef} className="o-room-scroll" role="group" aria-label={tr('Pièces')}`), 'la barre des pièces n’a pas de nom');
  assert.ok(pieces.includes("data-room-active={on ? '1' : undefined} aria-current={on ? 'page' : undefined}"), 'la pièce ouverte n’est qu’un fond d’accent');
});

test('les noms viennent de clés déjà traduites, et le polonais reste celui du traducteur', async () => {
  const cats = {};
  for (const l of ['en', 'de', 'nl', 'it', 'es', 'pl']) {
    cats[l] = (await import(pathToFileURL(join(RACINE, 'src', 'langues', l + '.js')).href)).default;
    for (const cle of ['Vues', 'Pièces', 'Menu']) assert.equal(typeof cats[l][cle], 'string', l + ' : « ' + cle + ' » manque');
  }
  assert.equal(cats.pl['Vues'], 'Widoki');
  assert.equal(cats.pl['Pièces'], 'Pokoje');
});
