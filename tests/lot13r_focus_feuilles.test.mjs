// ─────────────────────────────────────────────────────────────────────────────
// Le focus des feuilles — relecture du lot 13 de l'audit du 03/10.
//
// Deux fuites du focus, laissées dans le périmètre du lot :
// - le piège de Tab de `BottomSheet` prenait pour « premier » un bouton
//   désactivé — le choix de l'assistant, figé pendant l'écoute. Un bouton
//   désactivé ne prend jamais le focus : Maj+Tab ne bouclait plus, il sortait
//   du document, tout le reste étant inerte. De même pour un « dernier »
//   désactivé (« Envoyer » sans texte), et depuis la feuille elle-même, qu'un
//   clic sur son texte focalise ;
// - « Supprimer » dans la feuille d'un profil retire la ligne, et avec elle le
//   « Modifier ce profil » qui l'avait ouverte : la feuille rendait le focus à
//   un nœud détaché, qui l'ignorait. Il tombait sur <body>, sans anneau, et le
//   lecteur d'écran perdait sa place sans un mot.
//
// Pas de navigateur : le piège se lit dans la source et se joue sur une
// fausse feuille ; `rendreFocus` (focus.js) se joue sur un faux document.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as FOCUS from '../src/focus.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const UI = lire('src', 'ui.jsx');
const FEUILLE = (() => {
  const i = UI.indexOf('export function BottomSheet(');
  assert.ok(i >= 0, 'BottomSheet introuvable dans ui.jsx');
  return UI.slice(i, UI.indexOf('\n}\n', i) + 2);
})();

/** Le bloc ouvert par `debut`, accolades équilibrées (ses chaînes n'en portent pas). */
const blocDe = (src, debut) => {
  const i = src.indexOf(debut);
  assert.ok(i >= 0, debut + ' introuvable dans BottomSheet');
  let n = 0;
  for (let p = src.indexOf('{', i); p < src.length; p += 1) {
    if (src[p] === '{') n += 1;
    else if (src[p] === '}' && --n === 0) return src.slice(i, p + 1);
  }
  throw new Error(debut + ' : bloc non refermé');
};

// Le piège de Tab tel qu'il est écrit, joué hors de React.
const PIEGE = blocDe(FEUILLE, "if (e.key === 'Tab') {");
assert.ok(PIEGE.includes('dernier.focus()') && PIEGE.includes('premier.focus()'), 'le piège de Tab a changé de forme');
const jouerPiege = new Function('e', 'sheetRef', 'document', PIEGE);

/** Une fausse feuille : ses éléments dans l'ordre du DOM, une NodeList (sans
 *  `filter`, comme la vraie), et un bouton désactivé qui refuse le focus. */
function feuille(noms, desactives = []) {
  const doc = { activeElement: null };
  const el = { nom: 'feuille', focus() { doc.activeElement = el; } };
  const noeuds = noms.map(nom => ({ nom, disabled: desactives.includes(nom), focus() { if (!this.disabled) doc.activeElement = this; } }));
  el.querySelectorAll = () => {
    const liste = { length: noeuds.length, item: (k) => noeuds[k], [Symbol.iterator]: () => noeuds[Symbol.iterator]() };
    noeuds.forEach((n, k) => { liste[k] = n; });
    return liste;
  };
  return {
    sur: (nom) => { doc.activeElement = nom === 'feuille' ? el : noeuds.find(n => n.nom === nom); },
    actif: () => doc.activeElement && doc.activeElement.nom,
    /** Tab (ou Maj+Tab) : rend vrai si la feuille a retenu la touche. */
    tab: (arriere = false) => {
      let retenu = false;
      jouerPiege({ key: 'Tab', shiftKey: arriere, preventDefault: () => { retenu = true; } }, { current: el }, doc);
      return retenu;
    },
  };
}

test('pendant l’écoute, Maj+Tab boucle dans la feuille de l’assistant au lieu d’en sortir', () => {
  // L'en-tête pendant l'écoute : le choix figé, la conversation, la croix ; puis le micro.
  const f = feuille(['choix', 'conversation', 'croix', 'micro'], ['choix']);
  f.sur('conversation');
  assert.equal(f.tab(true), true, 'Maj+Tab depuis le premier bouton ACTIF n’est pas retenu : le focus sort du document');
  assert.equal(f.actif(), 'micro', 'le focus ne repart pas du dernier élément actif');
  f.sur('micro');
  assert.equal(f.tab(), true, 'Tab depuis le dernier élément n’est pas retenu');
  assert.equal(f.actif(), 'conversation', 'le focus repart sur le choix figé, qui le refuse');
});

test('un « dernier » désactivé ne casse plus la boucle (« Envoyer » sans texte)', () => {
  const f = feuille(['choix', 'conversation', 'croix', 'champ', 'envoyer'], ['envoyer']);
  f.sur('champ');
  assert.equal(f.tab(), true, 'Tab depuis le champ, dernier élément actif, sort de la feuille');
  assert.equal(f.actif(), 'choix');
  f.sur('choix');
  assert.equal(f.tab(true), true);
  assert.equal(f.actif(), 'champ', 'Maj+Tab vise « Envoyer », qui refuse le focus');
});

test('depuis la feuille elle-même, Maj+Tab boucle aussi', () => {
  // Un clic sur le texte d'une feuille la focalise (tabIndex -1) : Maj+Tab partait de là vers la page inerte.
  const f = feuille(['nom', 'admin', 'famille', 'supprimer', 'enregistrer', 'croix']);
  f.sur('feuille');
  assert.equal(f.tab(true), true, 'Maj+Tab depuis la feuille n’est pas retenu');
  assert.equal(f.actif(), 'croix');
});

test('au milieu de la feuille, Tab garde son chemin natif', () => {
  const f = feuille(['choix', 'conversation', 'croix', 'micro'], ['choix']);
  f.sur('croix');
  assert.equal(f.tab(), false, 'Tab est retenu au milieu de la feuille');
  assert.equal(f.tab(true), false, 'Maj+Tab est retenu au milieu de la feuille');
  assert.equal(f.actif(), 'croix');
  const vide = feuille(['a'], ['a']);
  vide.sur('feuille');
  assert.equal(vide.tab(), false, 'une feuille sans élément actif retient Tab');
});

test('à l’ouverture, le focus ne vise pas un bouton désactivé', () => {
  const ligne = FEUILLE.split('\n').find(l => l.includes('const cible = '));
  assert.ok(ligne, 'la cible du focus d’entrée a changé de forme');
  const i = ligne.indexOf('.find(');
  assert.ok(i >= 0, 'la cible du focus d’entrée n’est plus un `.find`');
  // La garde du `.find`, telle qu'écrite : `n => …`.
  const retenir = new Function('return ' + ligne.slice(i + 6, ligne.lastIndexOf(')')))();
  assert.equal(typeof retenir, 'function', 'la garde du focus d’entrée ne se lit plus');
  const n = (attrs, disabled = false) => ({ disabled, hasAttribute: (a) => attrs.includes(a) });
  assert.equal(retenir(n([])), true, 'un bouton ordinaire n’est plus visé');
  assert.equal(retenir(n(['data-croix'])), false, 'la croix est visée d’abord');
  assert.equal(retenir(n([], true)), false, 'un bouton désactivé est visé : il refuse le focus, qui reste hors de la feuille');
});

/** Un document réduit à ce que `rendreFocus` touche (comme focus_vue.test.mjs). */
function maison() {
  const doc = { activeElement: null };
  const noeud = (tag, { dedans = true } = {}) => {
    const attrs = {};
    const el = {
      tagName: tag, tabIndex: tag === 'BUTTON' ? 0 : -1, isConnected: dedans, poses: [],
      hasAttribute: (a) => a in attrs,
      getAttribute: (a) => (a in attrs ? attrs[a] : null),
      setAttribute: (a, v) => { attrs[a] = String(v); },
      closest: () => null,
      matches: () => false,
      focus: (o) => { el.poses.push(o); if (el.isConnected) doc.activeElement = el; },
    };
    return el;
  };
  doc.body = noeud('BODY');
  doc.documentElement = noeud('HTML');
  doc.activeElement = doc.body;
  const h1 = noeud('H1');
  doc.querySelector = (s) => (s === 'main h1' || s === 'h1' ? h1 : null);
  return { doc, noeud, h1 };
}

test('à la fermeture, le focus revient au bouton qui a ouvert la feuille', () => {
  assert.equal(typeof FOCUS.rendreFocus, 'function', 'focus.js n’exporte pas `rendreFocus`');
  const { doc, noeud, h1 } = maison();
  const ouvreur = noeud('BUTTON');
  FOCUS.rendreFocus(ouvreur, null, doc);
  assert.equal(doc.activeElement, ouvreur);
  assert.deepEqual(ouvreur.poses, [{ preventScroll: true }], 'la page saute au retour du focus');
  assert.deepEqual(h1.poses, [], 'le titre est visé alors que le bouton est là');
});

test('le bouton est parti avec sa ligne : le focus va au titre de la vue, pas sur <body>', () => {
  assert.equal(typeof FOCUS.rendreFocus, 'function', 'focus.js n’exporte pas `rendreFocus`');
  const { doc, noeud, h1 } = maison();
  // « Modifier ce profil », retiré du DOM avec la ligne du profil supprimé.
  const ouvreur = noeud('BUTTON', { dedans: false });
  FOCUS.rendreFocus(ouvreur, null, doc);
  assert.equal(doc.activeElement, h1, 'le focus reste sur <body>');
  assert.equal(h1.getAttribute('tabindex'), '-1', 'le titre devient un arrêt de Tab');
  assert.deepEqual(h1.poses, [{ preventScroll: true }], 'la page saute');
  // Sans ouvreur connu, même repli.
  const autre = maison();
  FOCUS.rendreFocus(null, null, autre.doc);
  assert.equal(autre.doc.activeElement, autre.h1);
});

test('une feuille dans une feuille : le repli va à la feuille hôte, le titre de la vue est inerte', () => {
  assert.equal(typeof FOCUS.rendreFocus, 'function', 'focus.js n’exporte pas `rendreFocus`');
  // Une feuille ouverte depuis une fiche (le planning du robot), dont l'ouvreur est parti.
  const { doc, noeud, h1 } = maison();
  const fiche = noeud('DIV');
  fiche.setAttribute('tabindex', '-1');
  FOCUS.rendreFocus(noeud('BUTTON', { dedans: false }), fiche, doc);
  assert.equal(doc.activeElement, fiche, 'Échap ne trouve plus la fiche : le focus est sur <body>');
  assert.deepEqual(h1.poses, []);
  // La fiche hôte refermée en même temps : le titre de la vue.
  const autre = maison();
  FOCUS.rendreFocus(autre.noeud('BUTTON', { dedans: false }), autre.noeud('DIV', { dedans: false }), autre.doc);
  assert.equal(autre.doc.activeElement, autre.h1);
});

test('un focus déjà repris ailleurs n’est pas déplacé', () => {
  assert.equal(typeof FOCUS.rendreFocus, 'function', 'focus.js n’exporte pas `rendreFocus`');
  const { doc, noeud, h1 } = maison();
  const ailleurs = noeud('BUTTON');
  doc.activeElement = ailleurs;
  FOCUS.rendreFocus(noeud('BUTTON', { dedans: false }), null, doc);
  assert.equal(doc.activeElement, ailleurs);
  assert.deepEqual(h1.poses, []);
  assert.doesNotThrow(() => FOCUS.rendreFocus(null, null, null), 'sans document, rien à rendre');
});

test('la feuille passe par `rendreFocus`, après avoir réveillé la page', () => {
  assert.ok(UI.includes("import { rendreFocus } from './focus.js';"), 'ui.jsx n’importe pas `rendreFocus`');
  /* L’hôte se cherche sur le BOUTON qui vient d’ouvrir, plus sur le voile : le
   * voile est posé dans <body> depuis le 07/10 (voir le test du portail,
   * ci-dessous) et ne descend donc d’aucune feuille. */
  assert.ok(FEUILLE.includes("const hote = (prev && prev.closest) ? prev.closest('.o-sheet') : null;"), 'la feuille hôte n’est plus retenue à l’ouverture');
  assert.ok(FEUILLE.includes('return () => { clearTimeout(t); reveiller(); try { rendreFocus(prev, hote); } catch {} };'),
    'le focus n’est plus rendu par `rendreFocus`, ou avant que la page soit réveillée — un élément inerte le refuserait');
  assert.ok(!FEUILLE.includes('prev.focus('), 'la feuille rend de nouveau le focus à un ouvreur peut-être détaché');
});

/* Retour du 07/10 : « il y a un souci avec la popup, que ce soit sur mobile ou
 * pc elle est trop haute », vu sur le détail d’un jour du calendrier d’Énergie.
 *
 * Un ancêtre flou, transformé ou animé devient le repère d’un `position: fixed`
 * : l’`inset: 0` du voile ne couvre alors plus l’écran mais cet ancêtre. En
 * thème givré CHAQUE carte porte un `backdrop-filter` — une feuille ouverte
 * depuis l’intérieur d’une carte se posait donc au bas de la carte, à moitié
 * hors de l’écran (mesuré : top 727 pour une fenêtre de 812).
 *
 * Dans <body>, le repère est toujours l’écran. Les menus (`ListeChoix`) ont la
 * même parade depuis le 18/09, et pour la même raison. */
test('la feuille se pose dans <body>, pas là où elle est écrite', () => {
  assert.ok(UI.includes("import { createPortal } from 'react-dom';"), 'ui.jsx n’importe plus `createPortal`');
  assert.ok(FEUILLE.includes('const feuille = ('), 'la feuille ne retient plus son arbre avant de le poser');
  assert.ok(FEUILLE.includes("return (typeof document !== 'undefined' && document.body) ? createPortal(feuille, document.body) : feuille;"),
    'la feuille ne passe plus par un portail vers <body> : un ancêtre flou ou transformé redeviendrait le repère de son `position: fixed`');
});
