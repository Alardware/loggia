// ─────────────────────────────────────────────────────────────────────────────
// Ce qui se clique doit pouvoir s'atteindre au clavier.
//
// Le titre d'une vue personnalisée était un `<h1>` porteur d'un `onClick` : en
// mode édition, cliquer dessus ouvrait le renommage. C'était le SEUL chemin —
// aucun bouton ailleurs. Un titre ne reçoit pas le focus, ne répond ni à Entrée
// ni à Espace, et n'est annoncé que comme un titre : au clavier, une vue
// personnalisée n'était donc pas renommable du tout.
//
// Le crayon posé à côté du texte donnait l'indice visuel, ce qui a suffi à
// masquer le manque : à la souris, tout marchait.
//
// Le titre reste un titre. Ce qui se clique est devenu un vrai bouton.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Les sources JSX du produit — et elles seules : `src/` garde des copies de
 *  travail ignorées par git, qui ne sont pas du code livré. */
function sources() {
  const out = [];
  for (const [dossier, sous] of [[join(RACINE, 'src'), 'src'], [join(RACINE, 'src', 'views'), 'src/views']]) {
    for (const f of readdirSync(dossier)) {
      if (f.endsWith('.jsx')) out.push([sous + '/' + f, readFileSync(join(dossier, f), 'utf8')]);
    }
  }
  return out;
}

test('aucun titre ne porte de clic', () => {
  // Limite assumée : la fenêtre s'arrête au premier `>`, donc une flèche
  // (`=>`) placée AVANT le `onClick` dans la même balise passerait au travers.
  // Ce n'est pas la forme qui s'écrit, et c'est exactement celle qui avait
  // échappé à la relecture.
  const fautes = [];
  for (const [nom, src] of sources()) {
    for (const m of src.match(/<h[1-6][^>]*onClick/g) || []) fautes.push(`${nom} → ${m.slice(0, 60)}`);
  }
  assert.deepEqual(fautes, [],
    'un titre redevient cliquable : ce qu’il déclenche ne sera atteignable qu’à la souris');
});

test('le renommage d’une vue passe par un vrai bouton', () => {
  const src = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
  const i = src.indexOf('setRenaming(true)');
  assert.notEqual(i, -1, 'le renommage d’une vue personnalisée a disparu');
  // On remonte à la balise qui le porte : ce doit être un <button>, pas un
  // conteneur à qui on aurait rajouté un rôle à la main.
  const ouvre = src.lastIndexOf('<', i);
  assert.equal(src.slice(ouvre, ouvre + 7), '<button',
    'le renommage est de nouveau déclenché par autre chose qu’un bouton');
});

test('le bouton de renommage dit ce qu’il fait', () => {
  const src = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
  const i = src.indexOf('setRenaming(true)');
  const balise = src.slice(src.lastIndexOf('<', i), src.indexOf('>', i));
  // Son contenu est le nom de la vue : sans étiquette, une synthèse vocale
  // annoncerait « Chalet, bouton » — le nom, jamais l’action.
  assert.match(balise, /aria-label=\{tr\(/,
    'le bouton n’annonce que le nom de la vue, pas ce qu’un clic déclenche');
});

test('les étiquettes de la feuille d’édition désignent un champ existant', () => {
  const src = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
  const cibles = (src.match(/htmlFor=\{([A-Za-z0-9_]+)\}/g) || []).map(m => m.match(/\{(\w+)\}/)[1]);
  assert.ok(cibles.length >= 2, `seulement ${cibles.length} étiquette(s) reliée(s) : « NOM » et « ENTITÉ » l’étaient`);
  for (const c of cibles) {
    // Une étiquette qui désigne un identifiant que personne ne porte ne relie
    // rien : elle a l'air correcte et se comporte comme le `<div>` d'avant.
    assert.match(src, new RegExp('<input id=\\{' + c + '\\}'),
      `aucun champ ne porte l’identifiant « ${c} » : l’étiquette ne désigne rien`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Un nom passé n'est pas un nom reçu.
//
// Trois appels écrivaient `<Bascule nom={…} on={…} cb={…} />`. Le composant, lui,
// ne déclarait que `{ on, cb }` : le nom était accepté par JSX, ignoré par la
// fonction, et jeté sans un mot. À l'écran tout allait bien — c'est le libellé
// voisin qu'on lit. Une synthèse vocale, elle, annonçait « interrupteur, activé »
// sans jamais dire de quoi.
//
// C'est la forme la plus discrète d'un réglage manquant : le code de l'appelant
// a l'air correct, et il l'est.
// ─────────────────────────────────────────────────────────────────────────────

test('l’interrupteur des règles reçoit vraiment le nom qu’on lui passe', () => {
  const ui = readFileSync(join(RACINE, 'src', 'ui.jsx'), 'utf8');
  const i = ui.indexOf('export function Bascule(');
  assert.notEqual(i, -1, 'l’interrupteur partagé a disparu');
  const corps = ui.slice(i, ui.indexOf('\n}', i));
  assert.match(corps, /export function Bascule\(\{[^}]*\bnom\b/,
    'le composant ne déclare plus « nom » : les appels le passeront dans le vide');
  assert.match(corps, /aria-label=\{nom/,
    'le nom est déclaré mais jamais porté : l’interrupteur reste anonyme');
});

test('tous les appels nomment leur interrupteur', () => {
  const fautes = [];
  for (const [nom, src] of sources()) {
    for (const m of src.match(/<Bascule[\s\S]*?\/>/g) || []) {
      if (!/\bnom=/.test(m)) fautes.push(`${nom} → ${m.replace(/\s+/g, ' ').slice(0, 60)}`);
    }
  }
  assert.deepEqual(fautes, [],
    'un interrupteur s’annonce sans dire ce qu’il commande');
});

test('un résultat de recherche d’entité se choisit au clavier', () => {
  const ui = readFileSync(join(RACINE, 'src', 'ui.jsx'), 'utf8');
  const i = ui.indexOf('onPick(e.id)');
  assert.notEqual(i, -1, 'le choix d’une entité a disparu');
  // On pouvait taper la recherche, mais pas retenir un résultat : la
  // tabulation sautait la liste entière.
  const ouvre = ui.lastIndexOf('<', i);
  assert.equal(ui.slice(ouvre, ouvre + 7), '<button',
    'les résultats redeviennent des conteneurs cliquables : la liste sort du parcours clavier');
});
