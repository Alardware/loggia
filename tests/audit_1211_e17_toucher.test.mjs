// ─────────────────────────────────────────────────
// Lot E17 de l'audit du 12/11 (ADR 0371) : une cible qu'un doigt attrape.
//
// Mesurés au téléphone et à la tablette, sous les 44 px visés : les puces
// des pièces et des actions du moment (33 de haut), les filtres d'Objets
// (38 × 37), les onglets de l'Énergie (30), « Cartes / Plan » (37 × 30),
// les minis d'une carte de pièce (38 × 26), les − et + des scènes
// (24 × 24), la croix des fiches (34 × 34), les puces des Paramètres (33).
//
// La décision : le DESSIN ne change pas ; la zone sensible s'étend jusqu'à
// 44 px, au doigt seulement, et jamais sur le dessin d'un voisin. Ce test
// tient ces trois promesses dans la feuille de style, et les repères posés
// dans le code.
// ─────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lire = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const CSS = lire('src/index.css');
const DEBUT = CSS.indexOf("/* ── Lot E17 de l'audit du 12/11 (ADR 0371)");
const BLOC = CSS.slice(DEBUT);
// Le bloc sans ses commentaires : ce que le navigateur lit.
const NU = BLOC.replace(/\/\*[\s\S]*?\*\//g, '').trim();

// Chaque famille de la règle, et le fichier qui la porte : une famille de plus dans la feuille demande une ligne ici.
const FAMILLES = {
  '.o-doigt': ['src/ui.jsx', 'className="o-doigt"'],
  '.o-rmbtn': ['src/cartes/volet.jsx', 'o-rmbtn'],
  '.o-objfiltre': ['src/vues/objets.jsx', 'className="o-objfiltre"'],
  '.o-armchip': ['src/cartescustom/cartes.jsx', 'className="o-armchip"'],
  '.o-piece-minis > button': ['src/accueil/briques.jsx', 'className="o-piece-minis"'],
  '.o-room-scroll > button': ['src/vues/piece.jsx', 'className="o-room-scroll"'],
  '.o-actions-moment > button': ['src/accueil/actionsmoment.jsx', 'className="o-actions-moment"'],
  '.o-qb button': ['src/scenes.jsx', "'o-qb'"],
  '.o-choix-tel button': ['src/views/partel.jsx', 'className="o-choix-tel"'],
  '.o-ligne-tel button': ['src/views/partel.jsx', 'className="o-ligne-tel"'],
  '.o-en-onglets > button': ['src/views/energie.jsx', 'className="o-en-onglets"'],
  '.sys-charge button': ['src/views/systeme.jsx', 'className="sys-charge"'],
  '.o-obj-head > button': ['src/views/systeme.jsx', 'className="o-obj-head"'],
  'button.o-nav-assist': ['src/chrome/entete.jsx', 'className="o-nav-assist"'],
  '[data-croix]': ['src/ui.jsx', 'data-croix=""'],
};

const listeDe = (re) => { const m = re.exec(BLOC); return m ? m[1].split(',').map(s => s.trim()) : null; };
const PLACES = listeDe(/:where\(([^)]*)\) \{ position: relative; \}/);
const ETENDUES = listeDe(/:is\(([^)]*)\)::after \{/);

// ── Au doigt seulement ───────────────────────────────────────────────────────

test('E17 : tout le bloc vit sous `pointer: coarse` — la souris n’y gagne rien', () => {
  assert.ok(DEBUT > 0, 'le bloc du lot est en fin de feuille');
  assert.ok(NU.indexOf('@media (pointer: coarse) {') === 0, 'une seule règle de tête, la requête du doigt');
  // L'accolade de la requête ne se referme qu'au dernier caractère : rien ne traîne dehors.
  let niveau = 0; let fermee = -1;
  for (let i = 0; i < NU.length; i++) {
    if (NU[i] === '{') niveau++;
    else if (NU[i] === '}') { niveau--; if (niveau === 0 && fermee < 0) fermee = i; }
  }
  assert.equal(niveau, 0, 'accolades appariées');
  assert.equal(fermee, NU.length - 1, 'aucune règle hors de la requête');
});

// ── La zone : jusqu'à 44 px, pas un pixel de plus ────────────────────────────

test('E17 : la zone va à 44 px dans chaque sens, et ne dépasse jamais 44', () => {
  // `(100% - 44px) / 2` est négatif sous 44 px (la zone déborde d'autant de chaque côté), nul ou positif au-dessus —
  // et `min(0px, …)` le ramène alors à zéro : un bouton déjà assez grand ne gagne rien.
  assert.ok(BLOC.includes("content: ''; position: absolute;"));
  assert.ok(BLOC.includes('inset: min(0px, (100% - 44px) / 2) max(var(--o-doigt-x, -22px), min(0px, (100% - 44px) / 2));'));
});

test('E17 : chaque bouton étendu est placé — sans quoi la zone couvrirait un ancêtre entier', () => {
  assert.ok(PLACES && ETENDUES, 'les deux listes se lisent');
  assert.deepEqual(PLACES, ETENDUES, 'la même liste, dans le même ordre');
  // `:where()` pèse zéro : un bouton déjà `absolute` ou `sticky` garde sa position.
  assert.ok(BLOC.includes(':where(' + PLACES.join(', ') + ') { position: relative; }'));
});

test('E17 : chaque famille de la règle existe dans le code', () => {
  assert.deepEqual([...PLACES].sort(), Object.keys(FAMILLES).sort());
  for (const [famille, [fichier, repere]] of Object.entries(FAMILLES)) {
    assert.ok(lire(fichier).includes(repere), famille + ' — ' + fichier);
  }
});

// ── Le dessin ne change pas ──────────────────────────────────────────────────

test('E17 : aucune taille, aucune police, aucun fond — rien de ce qui se voit', () => {
  assert.equal(/(^|[\s;{])(min-|max-)?(height|width)\s*:/.test(NU), false, 'ni hauteur ni largeur');
  assert.equal(/font-size|font-weight|line-height|border-radius|background|transform|box-shadow|\bgap\s*:/.test(NU), false);
  // Les seules boîtes qui changent : trois rangées qui défilent, qui s'épaississent et le rendent en marge.
  const rembourrages = NU.match(/[.a-z-]+ \{ padding-[^}]*\}/g) || [];
  assert.deepEqual(rembourrages.map(r => r.slice(0, r.indexOf(' {'))), ['.o-room-scroll', '.o-actions-moment', '.o-objfiltres']);
});

test('E17 : une rangée qui défile rend en marge ce qu’elle prend en épaisseur', () => {
  // La barre des pièces : 2 px sous ses puces dans le code, 6 de plus de chaque côté, 6 rendus de chaque côté.
  assert.ok(lire('src/vues/piece.jsx').includes("overflowX: 'auto', paddingBottom: 2, minWidth: 0 }"));
  assert.ok(BLOC.includes('.o-room-scroll { padding-block: 6px 8px !important; margin-block: -6px !important; }'));
  // Les actions du moment : 10 px au-dessus dans le code — 4 + les 6 du rembourrage.
  assert.ok(lire('src/accueil/actionsmoment.jsx').includes("scrollbarWidth: 'none', marginTop: 10, maxWidth: '100%' }"));
  assert.ok(BLOC.includes('.o-actions-moment { padding-block: 6px !important; margin-top: 4px !important; margin-bottom: -6px !important; }'));
  // Les filtres d'Objets : la rangée des favoris laissait 2 px au-dessus, repris en marge ; 6 et 6 ici.
  assert.ok(CSS.includes('.o-favrow { scrollbar-width: thin; padding: 2px 3px 6px; margin: -2px -3px 0; }'));
  assert.ok(BLOC.includes('.o-objfiltres { padding-top: 6px; margin-top: -6px; }'));
});

test('E17 : un bouton qui rogne son texte ne rogne plus sa zone — là où le navigateur le permet', () => {
  const garde = BLOC.indexOf('@supports (overflow: clip) {');
  assert.ok(garde > 0);
  // Hors de la garde, `overflow-y: visible` à côté d'un `overflow-x: hidden` deviendrait un défilement.
  assert.equal(BLOC.slice(0, garde).replace(/\/\*[\s\S]*?\*\//g, '').includes('overflow'), false);
  assert.ok(BLOC.slice(garde).includes('.o-en-onglets > button { overflow-x: clip; overflow-y: visible; }'));
  assert.ok(BLOC.slice(garde).includes('.o-armchip { overflow-x: clip !important; overflow-y: visible !important; }'));
  // Le texte, lui, reste rogné dans son sens : l'onglet et la puce d'alarme gardent leur écriture.
  assert.ok(CSS.includes('.o-en-onglets > button { min-width: 0; overflow: hidden; justify-content: center; }'));
  assert.ok(lire('src/cartescustom/cartes.jsx').includes("whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'"));
});

// ── Jamais sur le dessin d'un voisin ─────────────────────────────────────────

test('E17 : entre deux voisins serrés, pas plus que la moitié de l’écart', () => {
  // « Cartes / Plan » et tous les segments : 3 px entre deux moitiés.
  const noyau = lire('src/app/noyau.jsx');
  assert.ok(noyau.includes('<div role="group" aria-label={label || undefined} className="o-doigt-serre"'));
  assert.ok(noyau.includes("boxSizing: 'border-box', padding: 3, gap: 3, borderRadius: 12"));
  assert.ok(BLOC.includes('.o-doigt-serre { --o-doigt-x: -1.5px; }'));
  // « Blanc chaud » et « Éteindre » des scènes : 4 px — la même borne, posée sur leur rangée. Pas de règle au nom de la
  // barre des ambiances : hors de son bloc du téléphone, elle n'en porte aucune (tests/barre_ambiances.test.mjs).
  assert.ok(lire('src/scenes.jsx').includes("<QuickBox label={tr('Direct')} className=\"o-qb-direct\">\n          <div className=\"o-doigt-serre\" style={{ display: 'flex', gap: 4 }}>"));
  assert.equal(/\.o-bar-scenes|\.o-qb-(lbl|txt|piece|collection|lumi|direct)\b/.test(NU), false);
  // Une seule borne dans la feuille, et elle ne dépasse la moitié d'aucun des deux écarts.
  assert.deepEqual(NU.match(/--o-doigt-x: -[0-9.]+px/g), ['--o-doigt-x: -1.5px']);
});

test('E17 : les étages de l’Accueil ne s’étendent pas — 2 px les séparent, il n’y a rien à prendre', () => {
  // Constaté, pas corrigé : 25 px de large au téléphone. Les élargir demande d'élargir le DESSIN (sa décision).
  const accueil = lire('src/accueil/dashboard.jsx');
  assert.ok(accueil.includes("<button key={e.id || 'tous'} type=\"button\" onClick={() => setEtageChoisi(e.id)}"));
  assert.ok(accueil.includes("<div style={{ display: 'flex', gap: 2, padding: 3, borderRadius: 12, background: 'var(--o-well)'"));
});

// ── Les repères posés dans le code ───────────────────────────────────────────

test('E17 : les boutons sans famille portent `o-doigt`', () => {
  assert.ok(lire('src/app/noyau.jsx').includes('<button key={String(o.id)} className="o-doigt" aria-pressed={on}'), 'les moitiés d’un segment');
  assert.ok(lire('src/ui.jsx').includes('<button ref={btnRef} type="button" className="o-doigt" onClick='), 'le bouton de tout menu (ListeChoix)');
  assert.ok(lire('src/accueil/briques.jsx').includes('ref={refPuce} className="o-doigt" onClick={() => onEteindre(ids)}'), '« Tout éteindre »');
  // La classe vient APRÈS le geste : tests/scenarios_maison.test.mjs épingle `<button type="button" onClick={…}`.
  assert.ok(lire('src/vues/scenarios.jsx').includes("<button type=\"button\" onClick={() => setFiche('maison')} className=\"o-doigt\" style={{ marginLeft: 'auto',"), '« Enregistrer la maison »');
  assert.ok(lire('src/conseilsui.jsx').includes('className="o-doigt" onClick={appui}'), '« Me prévenir »');
  assert.ok(lire('src/engraphes.jsx').includes("type={ouvrable ? 'button' : undefined} className={ouvrable ? 'o-doigt' : undefined}"), 'un jour du calendrier');
  const histo = lire('src/views/energiehisto.jsx');
  assert.equal((histo.match(/<button className="o-doigt" onClick=\{\(\) => set(?:Recul|MoisRecul|Comparer)\(/g) || []).length, 6, 'les flèches de période et « Comparer »');
});

test('E17 : les deux règles d’avant restent — la croix rouge de l’édition, les interrupteurs', () => {
  assert.ok(CSS.includes(".o-tapzone::after { content: ''; position: absolute; inset: -9px; border-radius: inherit; }"));
  assert.ok(CSS.includes("[role=\"switch\"]::after { content: ''; position: absolute; inset: -9px -5px; }"));
});
