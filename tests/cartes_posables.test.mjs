// Une carte du catalogue doit pouvoir etre POSEE (06/10).
//
// C'est arrive DEUX FOIS. `chips` d'abord : « la carte se rendait toujours,
// ses outils d'edition etaient branches (crayon → Composer les pastilles),
// mais plus rien ne permettait de la POSER — on ne pouvait l'obtenir que par
// un agencement herite » (20/09). Puis `lovelace`, posee au catalogue le 05/10
// avec son rendu, son editeur, son nom et six tests — et absente de la galerie
// comme de `cvTypesPour`. L'utilisateur a colle son YAML dans le formulaire
// « carte template », le seul endroit qui proposait d'ecrire du texte, et a
// obtenu sa configuration affichee en clair : « l'utilisation de carte yaml ne
// fonctionne pas ». Elle n'avait jamais pu commencer.
//
// Ce test ferme la porte pour toutes les suivantes : rendre, editer et nommer
// une carte ne suffit pas, il faut un CHEMIN pour l'ajouter.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');

/** Le bloc de code entre deux reperes, le second exclu. */
const entre = (texte, debut, fin) => {
  const i = texte.indexOf(debut);
  assert.ok(i >= 0, 'repere introuvable : ' + debut);
  const j = texte.indexOf(fin, i + debut.length);
  assert.ok(j > i, 'fin introuvable apres : ' + debut);
  return texte.slice(i, j);
};

/* Les types que le catalogue NOMME : c'est la liste de reference. */
const nommes = new Set(
  [...entre(APP, 'const CV_TYPE_NOMS = () => ({', '});').matchAll(/(\w+): tr\(/g)].map((m) => m[1]),
);

/* Les deux chemins d'ajout : la galerie « Par carte », et les cartes
 * proposees pour une entite choisie. */
const galerie = new Set(
  [...entre(APP, 'const CV_GALERIE = () => [', '\n];').matchAll(/\{ t: '(\w+)'/g)].map((m) => m[1]),
);
const parEntite = new Set(
  [...entre(APP, 'function cvTypesPour(id) {', '\n}').matchAll(/'(\w+)'/g)].map((m) => m[1]),
);

/* Deux cartes ont QUITTE le catalogue sur un retour d'essai (31/08) : « le
 * gros interrupteur » et « la jauge » (« il est moche »). Elles se rendent
 * encore pour les agencements qui les portent, mais ne se posent plus — c'est
 * voulu, et c'est ecrit dans `cvTypesPour`. */
const RETIREES = new Set(['gros', 'jauge']);

test('le catalogue nomme bien toutes les cartes attendues', () => {
  for (const t of ['compacte', 'riche', 'chip', 'chips']) {
    assert.ok(nommes.has(t), 'le catalogue ne nomme plus ' + t);
  }
  assert.ok(nommes.size >= 20, 'le catalogue a fondu : ' + nommes.size);
});

test('CHAQUE carte nommee peut etre POSEE — rendre et editer ne suffit pas', () => {
  const orphelines = [...nommes].filter((t) => !RETIREES.has(t) && !galerie.has(t) && !parEntite.has(t));
  assert.deepEqual(orphelines, [],
    'ces cartes se rendent et s’editent mais rien ne permet de les ajouter : ' + orphelines.join(', '));
});

test('les cartes retirees le sont VRAIMENT, et pas par oubli', () => {
  // Si l'une revient dans un chemin d'ajout, c'est une decision : qu'elle
  // sorte alors de cette liste, pour que le test du dessus la couvre.
  for (const t of RETIREES) {
    assert.ok(!galerie.has(t) && !parEntite.has(t), t + ' est reproposee : la retirer de RETIREES');
    assert.ok(nommes.has(t), t + ' ne se rend plus : retirer aussi son nom du catalogue');
  }
});

/* La carte Home Assistant est partie le 06/10 : les cartes de Lovelace sont
 * des composants Lit, et Lit pose ses styles par `adoptedStyleSheets` — une
 * feuille construite appartient a UN document. Fabriquee par les aides dans la
 * page de Home Assistant, puis connectee dans l'iframe de Loggia, la carte
 * levait « Sharing constructed stylesheets in multiple documents is not
 * allowed » et restait vide. Voir l ADR 0158. */
