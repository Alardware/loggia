// Le rail replié ne laisse aucune commande sans nom (audit du 03/10).
//
// Sur ORDINATEUR, le rail replié fait 72 px : `.loggia-aside.is-closed
// .o-side-text` passe en `display: none`, et le mot sort de l'arbre
// d'accessibilité avec lui. Les entrées de la liste portaient déjà leur
// `aria-label` (plan M7). Le bouton « Mode édition », lui, n'avait que ce mot
// et un crayon `aria-hidden` : une synthèse vocale annonçait « bouton bascule,
// enfoncé » — l'état, jamais ce qu'il bascule.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
const css = readFileSync(join(RACINE, 'src', 'index.css'), 'utf8');
const NL = String.fromCharCode(10);
const debut = src.indexOf('function Sidebar(');
const fin = src.indexOf(NL + '/* ── Recherche globale', debut);
const side = src.slice(debut, fin < 0 ? undefined : fin);

test('le rail replié masque bien ses mots : c’est la raison d’être des étiquettes', () => {
  assert.ok(debut >= 0, 'function Sidebar( introuvable');
  assert.ok(css.includes('.loggia-aside.is-closed .o-side-text { display: none !important; }'),
    'le rail replié ne masque plus ses mots : ce test ne garde plus rien');
  assert.ok(side.includes("(open ? 'is-open' : 'is-closed')"),
    'le rail ne se replie plus sur `open` : la condition de l’étiquette ne veut plus rien dire');
});

test('« Mode édition » porte son nom quand le rail est replié', () => {
  const i = side.indexOf('<button onClick={onToggleEdit}');
  assert.ok(i > 0, 'le bouton « Mode édition » du rail a disparu');
  const balise = side.slice(i, side.indexOf('<', i + 1));
  assert.match(balise, /aria-label=\{[^}]*tr\('Mode édition'\)\}/,
    'replié, le bouton n’a plus que son crayon aria-hidden : il s’annonce sans nom');
  assert.ok(balise.includes('aria-pressed={editMode}'), 'l’état du mode n’est plus dit');
  /* Déplié, le nom vient du mot AFFICHÉ, qui devient « Quitter l’édition » :
   * une étiquette fixe le contredirait (WCAG 2.5.3), et la commande vocale ne
   * trouverait plus le bouton par ce qu'elle lit à l'écran. */
  assert.match(balise, /aria-label=\{open \? undefined : /,
    'l’étiquette se pose aussi déplié : elle contredit le mot affiché « Quitter l’édition »');
});

test('aucune commande du rail sans nom', () => {
  /* Replié, TOUT mot du rail disparaît : une commande qui ne se nomme que par
   * son texte devient muette. On relève chaque `<button` et chaque
   * `role="button"` de la fonction Sidebar, balise ouvrante seule. */
  const balises = [];
  for (let i = side.indexOf('<button'); i >= 0; i = side.indexOf('<button', i + 1)) {
    balises.push(side.slice(i, side.indexOf('<', i + 1)));
  }
  for (let j = side.indexOf('role="button"'); j >= 0; j = side.indexOf('role="button"', j + 1)) {
    balises.push(side.slice(side.lastIndexOf('<', j), side.indexOf('<', j)));
  }
  assert.ok(balises.length >= 6, `seulement ${balises.length} commande(s) trouvée(s) dans le rail : le relevé ne voit plus rien`);
  const muettes = balises.filter(b => !b.includes('aria-label=')).map(b => b.replace(/\s+/g, ' ').slice(0, 70));
  assert.deepEqual(muettes, [], 'replié, ce mot disparaît et la commande s’annonce sans nom');
});
