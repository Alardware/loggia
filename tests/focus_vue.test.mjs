// ─────────────────────────────────────────────────────────────────────────────
// Le focus suit la vue (audit du 03/10).
//
// Une vue se remonte en entier quand on en change (`key={view}`). Le bouton
// qui venait de servir — « Ouvrir la pièce Salon », une tuile des Paramètres,
// un retour — partait avec elle : `document.activeElement` valait <body>, la
// tabulation repartait du haut de la page, et un lecteur d'écran n'annonçait
// rien. Le focus se pose maintenant sur le titre de la nouvelle vue — et dans
// les Paramètres, au retour au sommaire, sur la tuile d'où l'on venait.
//
// Le module se vérifie sur un faux document : pas de navigateur dans les
// tests, et ce qui compte se résume à « qui a le focus, et quand ».
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { focusPerdu, titreDeVue, poserFocus, reposerFocus } from '../src/focus.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const NL = String.fromCharCode(10);
const bloc = (src, debut, fin) => { const d = src.indexOf(debut); assert.ok(d >= 0, debut + ' introuvable'); const f = src.indexOf(fin, d + 1); return src.slice(d, f < 0 ? undefined : f); };
const attendre = (ms) => new Promise(r => setTimeout(r, ms));

/** Un document réduit à ce que le module touche. */
function maison() {
  const doc = { activeElement: null };
  const noeud = (tag, { tabIndex = -1, dedans = true, inerte = false, visible = false } = {}) => {
    const attrs = {};
    const el = {
      tagName: tag, tabIndex, isConnected: dedans, poses: [], vus: [],
      hasAttribute: (n) => n in attrs,
      getAttribute: (n) => (n in attrs ? attrs[n] : null),
      setAttribute: (n, v) => { attrs[n] = String(v); },
      closest: (sel) => (sel === '[inert]' && inerte ? {} : null),
      matches: (sel) => sel === ':focus-visible' && visible,
      scrollIntoView: (o) => { el.vus.push(o); },
      focus: (o) => { el.poses.push(o); doc.activeElement = el; },
    };
    return el;
  };
  doc.body = noeud('BODY');
  doc.documentElement = noeud('HTML');
  doc.activeElement = doc.body;
  return { doc, noeud };
}

test('le focus est tombé : sur <body>, sur rien, hors du document, ou dans un morceau inerte', () => {
  const { doc, noeud } = maison();
  assert.equal(focusPerdu(doc), true, '<body>');
  doc.activeElement = null;
  assert.equal(focusPerdu(doc), true, 'rien');
  doc.activeElement = noeud('BUTTON', { tabIndex: 0, dedans: false });
  assert.equal(focusPerdu(doc), true, 'le bouton est parti avec l’ancienne vue');
  doc.activeElement = noeud('BUTTON', { tabIndex: 0, inerte: true });
  assert.equal(focusPerdu(doc), true, 'le tiroir refermé au téléphone est inerte');
  doc.activeElement = noeud('BUTTON', { tabIndex: 0 });
  assert.equal(focusPerdu(doc), false, 'un bouton du menu latéral garde sa place');
  assert.equal(focusPerdu(null), false, 'sans document, rien à reprendre');
});

test('un titre devient focalisable par script, jamais à la tabulation', () => {
  const { doc, noeud } = maison();
  const h1 = noeud('H1');
  assert.equal(poserFocus(h1), true);
  assert.equal(h1.getAttribute('tabindex'), '-1', 'tabindex="-1" : focalisable par script, hors du parcours Tab');
  assert.deepEqual(h1.poses, [{ preventScroll: true }], 'la page ne saute pas');
  assert.equal(doc.activeElement, h1);
  const tuile = noeud('BUTTON', { tabIndex: 0 });
  poserFocus(tuile);
  assert.equal(tuile.hasAttribute('tabindex'), false, 'un bouton garde sa place dans le parcours');
  assert.equal(poserFocus(null), false);
});

test('voir : la cible revient à l’écran au clavier seulement', () => {
  const { noeud } = maison();
  const clavier = noeud('BUTTON', { tabIndex: 0, visible: true });
  poserFocus(clavier, true);
  assert.deepEqual(clavier.vus, [{ block: 'nearest' }], 'au clavier, la tuile retrouvée se montre');
  const doigt = noeud('BUTTON', { tabIndex: 0, visible: false });
  poserFocus(doigt, true);
  assert.deepEqual(doigt.vus, [], 'au doigt, la page ne bouge pas sous la main');
  const titre = noeud('H1', { visible: true });
  poserFocus(titre);
  assert.deepEqual(titre.vus, [], 'sans `voir`, rien ne défile');
});

test('le titre d’une vue : le premier <h1> de son <main>', () => {
  const h1 = { id: 'titre' };
  const autre = { id: 'autre' };
  const racine = { querySelector: (s) => (s === 'main h1' ? h1 : s === 'h1' ? autre : null) };
  assert.equal(titreDeVue(racine), h1);
  const sansMain = { querySelector: (s) => (s === 'h1' ? autre : null) };
  assert.equal(titreDeVue(sansMain), autre, 'faute de <main>, le premier titre venu');
  assert.equal(titreDeVue(null), null);
});

test('reposer le focus : seulement s’il est tombé', () => {
  const { doc, noeud } = maison();
  const menu = noeud('BUTTON', { tabIndex: 0 });
  const h1 = noeud('H1');
  doc.activeElement = menu;
  let cherche = 0;
  reposerFocus(() => { cherche += 1; return h1; }, { doc });
  assert.equal(doc.activeElement, menu, 'le menu latéral garde son bouton');
  assert.equal(cherche, 0, 'on ne cherche même pas le titre');
  doc.activeElement = doc.body;
  reposerFocus(() => h1, { doc });
  assert.equal(doc.activeElement, h1, 'le titre de la nouvelle vue, tout de suite');
});

test('une vue chargée à la demande : on attend son titre, sans reprendre un focus parti ailleurs', async () => {
  const { doc, noeud } = maison();
  const h1 = noeud('H1');
  let pret = false;
  reposerFocus(() => (pret ? h1 : null), { doc, pas: 2, essais: 50 });
  assert.equal(doc.activeElement, doc.body, 'le titre n’existe pas encore');
  pret = true;
  await attendre(30);
  assert.equal(doc.activeElement, h1, 'le titre arrive : il reçoit le focus');

  const deux = maison();
  const tard = deux.noeud('H1');
  let la = false;
  reposerFocus(() => (la ? tard : null), { doc: deux.doc, pas: 2, essais: 50 });
  const lien = deux.noeud('A', { tabIndex: 0 });
  deux.doc.activeElement = lien;
  la = true;
  await attendre(30);
  assert.equal(deux.doc.activeElement, lien, 'qui a déjà tabulé n’est pas ramené en arrière');
  assert.deepEqual(tard.poses, []);
});

test('annuler : la vue quittée ne vole pas le focus de la suivante', async () => {
  const { doc, noeud } = maison();
  const h1 = noeud('H1');
  let la = false;
  const annuler = reposerFocus(() => (la ? h1 : null), { doc, pas: 2, essais: 50 });
  annuler();
  la = true;
  await attendre(30);
  assert.deepEqual(h1.poses, [], 'la recherche du titre d’une vue quittée a continué');
});

test('App : le titre de la vue reçoit le focus après un changement de vue', () => {
  const app = lire('src', 'App.jsx');
  assert.match(app, /import \{ reposerFocus, titreDeVue \} from '\.\/focus\.js';/);
  assert.ok(app.includes('<div key={view} ref={vueRef} className="o-view"'), 'le conteneur de la vue est la racine où chercher le titre');
  const eff = bloc(app, 'const vueFocus = useRef(view);', '}, [view]);');
  assert.ok(eff.includes('if (vueFocus.current === view) return undefined;'), 'le premier rendu ne prend pas le focus à une page qui s’ouvre');
  assert.ok(eff.includes('return reposerFocus(() => titreDeVue(vueRef.current), { voir: true });'), 'le titre, ramené à l’écran au clavier (le changement de vue ne remonte pas la page), et le nettoyage au changement suivant');
  // setView reste nu : les vues et l'en-tête le reçoivent tel quel.
  assert.ok(app.includes('onNav: setView,'), 'l’en-tête reçoit setView tel quel');
  assert.ok((app.match(/onNav=\{setView\}/g) || []).length >= 10, 'les vues reçoivent setView tel quel');
});

test('chaque vue a un titre où poser le focus', () => {
  const app = lire('src', 'App.jsx');
  const VUES = ['function RoomView(', 'function ObjetsView(', 'function Dashboard(', 'function ScenariosView(',
    'function VoletsContent(', 'function EnergieContent(', 'function ViewEmpty(',
    'function SecuriteContent(', 'function BiblioView(', 'function CustomView('];
  for (const debut of VUES) {
    const vue = bloc(app, debut, NL + 'function ');
    assert.ok(vue.includes('<h1') || vue.includes('<ViewHead'), debut + ' : pas de titre, le focus retomberait sur <body>');
  }
  assert.ok(bloc(app, 'function ViewHead(', NL + 'function ').includes('<h1'), 'ViewHead porte le titre des Volets');
  assert.ok(lire('src', 'views', 'systeme.jsx').includes('<h1'), 'Système');
  assert.equal((lire('src', 'views', 'parametres.jsx').match(/<h1 /g) || []).length >= 2, true, 'Paramètres : le sommaire et chaque section');
});

test('Paramètres : la section ouverte prend le focus, le retour le rend à sa tuile', () => {
  const par = lire('src', 'views', 'parametres.jsx');
  assert.match(par, /import \{ reposerFocus \} from '\.\.\/focus\.js';/);
  assert.ok(par.includes('<div ref={racineRef} className="loggia-content"'), 'la racine où chercher');
  assert.ok(par.includes('<button key={sec.id} data-section={sec.id} onClick={() => setTab(sec.id)}'), 'chaque tuile se retrouve par sa section');
  const eff = bloc(par, 'const tabFocus = useRef(tab);', '}, [tab]);');
  assert.ok(eff.includes('if (avant === tab) return undefined;'), 'la section retrouvée au rechargement ne vole pas le focus');
  assert.ok(eff.includes("b.getAttribute('data-section') === avant"), 'au retour au sommaire : la tuile d’où l’on venait');
  // Pas de sélecteur fabriqué : la section précédente peut venir de la
  // session, et une apostrophe ferait lever querySelector au milieu d'un effet.
  assert.ok(!eff.includes("'[data-section=\"' + avant"), 'un sélecteur construit depuis une valeur de session est revenu');
  assert.ok(eff.includes("r.querySelector('h1')"), 'à l’entrée dans une section : son titre');
  assert.ok(eff.includes('}, { voir: true });'), 'la tuile comme le titre de section reviennent à l’écran au clavier');
});

test('le titre ramené à l’écran passe SOUS l’en-tête collant', () => {
  // Au ras du haut, il se cachait sous l'en-tête dès que celui-ci reparaissait.
  assert.ok(lire('src', 'index.css').includes('h1[tabindex="-1"] { scroll-margin-top: 84px; }'));
});
