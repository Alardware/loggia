// ─────────────────────────────────────────────────────────────────────────────
// La barre du bas suit le MENU (10/10).
//
// « La nav barre mobile, actuellement elle n'est pas personnalisable. »
//
// Elle portait cinq entrées ÉCRITES EN DUR, filtrées seulement par ce que
// l'installation sait remplir : masquer Objets dans le menu ne l'en retirait
// pas, et remettre Climatisation ne l'y mettait pas.
//
// Elle reprend la règle de la barre latérale, à la lettre — les droits du
// profil, les masquées retirées, les secondaires remises admises, l'ordre
// choisi —, puis s'arrête à cinq cases.
//
// Vérifié en démo avant d'être épinglé ici : Pièces visible donne
// « Accueil · Pièces · Scénarios · Objets · Énergie » ; Pièces masquée donne
// « Accueil · Scénarios · Objets · Énergie · Sécurité », sans rechargement.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8').replace(/\r\n/g, '\n');

/** Le corps de `MobileNav`, jusqu'à sa liste d'entrées. */
const corpsNav = () => {
  const i = APP.indexOf('function MobileNav({');
  assert.ok(i > 0, 'MobileNav a disparu');
  const f = APP.indexOf('.slice(0, BARRE_MAX);', i);
  assert.ok(f > i, 'la barre ne s’arrête plus à un nombre de cases : elle déborderait');
  return APP.slice(i, f);
};

test('la barre du bas lit les vues du menu, et pas une liste figée', () => {
  const c = corpsNav();
  assert.ok(c.includes('useState(readViewsCfg)'), 'la barre ne lit plus les vues choisies');
  assert.ok(c.includes('viewsCfg.hidden.has(it.id)'), 'une vue masquée reste dans la barre');
  assert.ok(c.includes('viewsCfg.shown.has(h.vid)'), 'une vue secondaire remise n’entre pas dans la barre');
  assert.ok(/\(viewsCfg\.order \|\| \[\]\)\.indexOf\(vid\)/.test(c), 'la barre ne suit plus l’ordre du menu');
  // Et elle se relit quand le menu change, sans rechargement.
  assert.ok(c.includes("window.addEventListener('loggia-views-changed'"), 'la barre ne se relit plus quand le menu change');
});

test('elle respecte les droits du profil, comme la barre latérale', () => {
  const c = corpsNav();
  const entete = APP.slice(APP.indexOf('function MobileNav({'), APP.indexOf(') {', APP.indexOf('function MobileNav({')));
  assert.ok(/vuesAutorisees = null/.test(entete), 'la barre ne reçoit plus les droits du profil');
  assert.ok(c.includes("!vuesAutorisees || vid === 'accueil' || vuesAutorisees.has(vid)"),
    'une vue interdite au profil pourrait entrer dans la barre');
  assert.ok(c.includes('permis(it.id) && isViewAvailable(avail, it.id)'),
    'la barre ne filtre plus sur les droits ET la disponibilité');
  // L'appelant doit les lui passer, sinon le filtre ne voit jamais rien.
  assert.ok(APP.includes('<MobileNav vuesAutorisees={vuesAutorisees}'), 'les droits ne sont plus passés à la barre');
});

test('Accueil garde sa place, et la barre s’arrête à cinq cases', () => {
  const c = corpsNav();
  assert.ok(c.includes("vues.filter(it => it.id === 'accueil')") && c.includes('[...accueil, ...rangees]'),
    'Accueil a rejoint le rangement : il pourrait sortir de la barre');
  assert.match(APP, /const BARRE_MAX = 5;/, 'le plafond de la barre a changé : relire pourquoi (largeur des libellés)');
  /* Le plafond n'est pas un caprice : le corps du texte a déjà son plancher
   * — 9,5 px — et c'est la SOMME des libellés qui doit tenir dans la largeur. */
  assert.ok(APP.includes('9,5 px'), 'la raison du plafond a disparu du code : le corps du texte a son plancher');
});
