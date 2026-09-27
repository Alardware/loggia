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
    // `ChampSuggere` pose son `id` sur son propre <input> (ui.jsx).
    assert.match(src, new RegExp('<(input|ChampSuggere) id=\\{' + c + '\\}'),
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

// ── Le point 6 de l'audit du 27/09 : ce qui se lit et ce qui se vise ────────

test('une feuille ouverte rend le reste de la page INERTE', () => {
  // Le piège à focus ne retenait que Tab. Le curseur virtuel d'un lecteur
  // d'écran ne passe pas par le clavier : il lit le document. On sortait donc
  // de la feuille par en dessous, on atteignait une carte derrière le voile,
  // et on l'activait — sans code, dans le cas de la modale du code.
  //
  // Mesuré dans la démonstration après correction : 118 contrôles dans la
  // page, 5 joignables, 0 hors de la feuille. Et 0 élément inerte une fois
  // refermée — la page entière revient.
  const ui = readFileSync(join(RACINE, 'src', 'ui.jsx'), 'utf8');
  assert.match(ui, /export function inerterAutour\(noeud\)/, 'la mise en inertie a disparu');
  assert.match(ui, /frere\.hasAttribute\('inert'\)/,
    'un frère déjà inerte n’est plus épargné : une feuille sur une autre réveillerait ce que la première a éteint');
  // L'ORDRE compte : réveiller AVANT de rendre le focus, sinon on le rend à un
  // élément encore inerte, qui le refuse.
  for (const [nom, f] of [['ui.jsx', 'ui.jsx'], ['pinmodal.jsx', 'pinmodal.jsx']]) {
    const s = readFileSync(join(RACINE, 'src', f), 'utf8');
    assert.match(s, /const reveiller = inerterAutour\(voileRef\.current\)/, nom + ' : le fond ne devient plus inerte');
    assert.match(s, /reveiller\(\);[^\n]*focus\(\{ preventScroll: true \}\)/,
      nom + ' : le focus est rendu AVANT le réveil — l’élément inerte le refusera');
  }
});

test('une feuille dit son nom', () => {
  // `role="dialog"` sans nom fait annoncer « dialogue », et rien d'autre, à
  // l'ouverture de n'importe quelle fiche. Une seule feuille sur quatre-vingts
  // passait un `title` ; les autres bâtissent leur en-tête avec `TitreFeuille`
  // ou `FicheEntete`. C'est donc la ligne de titre qui nomme.
  const ui = readFileSync(join(RACINE, 'src', 'ui.jsx'), 'utf8');
  const app = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
  assert.match(ui, /aria-labelledby=\{idTitre\}/, 'la feuille ne se nomme plus par sa ligne de titre');
  assert.match(ui, /export function useIdTitreFeuille\(\)/, 'le crochet du nom a disparu');
  assert.match(ui, /prendre: \(jeton\) =>/,
    'sans jeton, deux lignes de titre porteraient le même id — et le double montage de React ferait passer la première pour une seconde');
  assert.match(ui, /export function TitreFeuille[\s\S]{0,400}id=\{idTitre \|\| undefined\}/, 'TitreFeuille ne porte plus l’id');
  assert.match(app, /function FicheEntete[\s\S]{0,700}id=\{idTitre \|\| undefined\}/, 'FicheEntete ne porte plus l’id');
});

test('le tiroir hors écran sort du parcours, le rail de l’ordinateur y reste', () => {
  // Au tactile, `is-closed` pousse le tiroir par `translateX(-100%)` : il reste
  // `display: flex`, et ses onze boutons restaient tabulables et lisibles à
  // l'aveugle. Sur ORDINATEUR, `is-closed` n'est qu'un rail de 72 px, bien
  // visible et bien utile — on n'y touche pas.
  const app = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
  assert.match(app, /inert=\{tactile && !open \? '' : undefined\}/,
    'le tiroir fermé n’est plus retiré du parcours, ou il l’est aussi sur ordinateur');
  const css = readFileSync(join(RACINE, 'src', 'index.css'), 'utf8');
  assert.match(css, /html\.loggia-tactile \.loggia-aside\.is-closed \{[^}]*translateX\(-100%\)/,
    'le tiroir tactile ne sort plus par la gauche : la condition de l’inertie ne veut plus rien dire');
});

test('rien ne se vise sous 24 px', () => {
  // WCAG 2.5.8. Sur une tablette murale, une main qui tremble ne vise pas un
  // point de 8 px — et ces points-là changent de page. Mesuré après
  // correction : zéro cible sous 24 px sur six vues, à 390 comme à 1280.
  const app = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
  // Les points de page : un seul composant pour les trois écrans qui les
  // posaient, 24 de zone pour 8 de dessin, et des centres à 24 — l'écart exact
  // que demande la règle quand les cibles se touchent.
  assert.match(app, /function PointsDePage\(\{ n, courant, onChoisir, couleur/, 'les points de page n’ont plus de composant');
  assert.match(app, /width: 24, height: 24, margin: '-8px 0'/, 'le point de page a reperdu sa zone de 24');
  assert.ok(!/width: 8, height: 8, padding: 0, borderRadius: 4/.test(app), 'un point de 8 px est revenu à découvert');
  // Les deux points de page de l'Accueil : gabarit 24, rangée toujours à 6.
  assert.match(app, /minWidth: 24, height: 24, margin: '-9px 0'/, 'les points de l’Accueil ont reperdu leur zone');
  // L'interrupteur d'une tuile pièce : zone de 24, pastille de 21.
  assert.match(app, /alignItems: 'center', height: 24, cursor: 'pointer', flexShrink: 0, margin: '-1\.5px 0'/,
    'l’interrupteur d’une tuile pièce a reperdu sa zone de 24');
  // Les boutons « − / + » : 22 avant, 24 depuis.
  assert.ok(!/width: 22, height: 22, borderRadius: 10/.test(app), 'un bouton « − / + » est retombé à 22 px');
});
