// ─────────────────────────────────────────────────
// Lot 5c de l'audit du 12/11 (ADR 0374) : ce qui CHANGE le dessin, validé sur
// une planche avant / après (« Oui, recommandé », 15/11).
//
//  - Trois bascules de 42 × 24 prennent le dessin de la bascule de la maison
//    (46 × 26, rond de 20) : le réglage d'un appareil dans sa fiche, la
//    programmation automatique d'une zone de chauffage, « Ne pas juger cette
//    mesure ». Elles gardent leur geste ; le dessin ne s'écrit plus qu'une fois
//    (`railBascule`, `rondBascule`, cartes/briques.jsx), et `RmBascule`, sa
//    voisine, le lit aussi.
//  - Trois croix de panneau (28 px carrée, 30 px rondes) prennent le dessin de
//    la croix commune (34 × 34, coins de 10) et son glyphe. Elles gardent leur
//    bouton : elles ferment un panneau posé DANS la feuille, pas la feuille.
//  - Le seuil de 1180 px du puits d'Énergie reste : son choix.
//
// Ce test tient chaque point, et empêche une quatrième taille de revenir.
// ─────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { composant } from './rendu.mjs';

const { railBascule, rondBascule } = await import('../src/cartes/briques.jsx');

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(join(RACINE, f), 'utf8').replace(/\r\n/g, '\n');
const CSS = lire('src/index.css');

/** Les déclarations d'un attribut `style` rendu, triées : l'ordre des clés ne dit rien à l'écran. */
const declarations = (html, debut) => {
  const i = html.indexOf(debut);
  assert.ok(i >= 0, '« ' + debut + ' » a disparu du rendu');
  const m = html.slice(i).match(/style="([^"]*)"/);
  assert.ok(m, 'pas de style après « ' + debut + ' »');
  return m[1].split(';').filter(Boolean).sort();
};

/** Tous les fichiers de src/, sauf les langues. */
const sources = () => {
  const out = [];
  const marcher = (d) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) { if (f !== 'langues') marcher(p); continue; }
      if (/\.(js|jsx)$/.test(f)) out.push([relative(RACINE, p).split('\\').join('/'), readFileSync(p, 'utf8')]);
    }
  };
  marcher(join(RACINE, 'src'));
  return out;
};

// ── A. Les bascules ──────────────────────────────────────────────────────────

test('A : le dessin d’une bascule de la maison — 46 × 26, un rond de 20 — s’écrit une fois', () => {
  assert.deepEqual(railBascule(true), { width: 46, height: 26, borderRadius: 14, background: 'var(--o-accent-fond)', position: 'relative', flexShrink: 0, transition: 'background .25s' });
  assert.equal(railBascule(false).background, 'rgba(150,162,184,.2)', 'le gris du rail éteint');
  assert.equal(railBascule(true, 'var(--o-bascule-lampe)').background, 'var(--o-bascule-lampe)', 'l’ambre d’une lumière passe par l’appelant');
  assert.equal(railBascule(false, 'var(--o-bascule-lampe)').background, 'rgba(150,162,184,.2)');
  assert.deepEqual(rondBascule(true), { position: 'absolute', top: 3, left: 23, width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 2px 5px rgba(0,0,0,.35)', transition: 'left .32s cubic-bezier(.34,1.56,.64,1)' });
  assert.equal(rondBascule(false).left, 3);
  // Le rond tient dans le rail, à 3 px de chaque bord : 3 + 20 + 3 = 26 ; 23 + 20 + 3 = 46.
  assert.equal(rondBascule(false).top + rondBascule(false).height + 3, railBascule(false).height);
  assert.equal(rondBascule(true).left + rondBascule(true).width + 3, railBascule(true).width);
  // Une seule écriture, à côté de `RmBascule` : le gris du rail et l'ombre du rond ne vivent qu'une fois, dans cartes/briques.jsx.
  const ou = sources().filter(([, s]) => s.includes('rgba(150,162,184,.2)') || s.includes('0 2px 5px rgba(0,0,0,.35)')).map(([f]) => f);
  assert.deepEqual(ou, ['src/cartes/briques.jsx']);
  const briques = lire('src/cartes/briques.jsx');
  assert.equal(briques.split('rgba(150,162,184,.2)').length - 1, 1, '`RmBascule` a gardé une copie du rail');
  assert.equal(briques.split('0 2px 5px rgba(0,0,0,.35)').length - 1, 1, '`RmBascule` a gardé une copie du rond');
  // Pas dans styles.js : ce fichier ne porte aucune couleur en dur (tests/etats.test.mjs), et le gris du rail en est une.
  assert.ok(!/Bascule/.test(lire('src/styles.js')), 'le dessin de la bascule est revenu dans styles.js');
});

test('A : `RmBascule` rend ce qu’elle rendait — même rail, même rond, à la déclaration près', async () => {
  const RmBascule = await composant('cartes/briques.jsx', 'RmBascule');
  const rendu = (props) => renderToStaticMarkup(createElement(RmBascule, { nom: 'Lampe', onToggle: () => {}, ...props }));
  const rail = (fond, curseur = 'pointer', opacite = '1') => ['width:46px', 'height:26px', 'border-radius:14px', 'background:' + fond, 'position:relative', 'cursor:' + curseur,
    'opacity:' + opacite, 'flex-shrink:0', 'display:inline-block', 'transition:background .25s'].sort();
  const rond = (gauche) => ['position:absolute', 'top:3px', 'left:' + gauche + 'px', 'width:20px', 'height:20px', 'border-radius:50%', 'background:#fff',
    'box-shadow:0 2px 5px rgba(0,0,0,.35)', 'transition:left .32s cubic-bezier(.34,1.56,.64,1)'].sort();
  const allumee = rendu({ on: true });
  assert.deepEqual(declarations(allumee, '<span role="switch"'), rail('var(--o-accent-fond)'));
  assert.deepEqual(declarations(allumee, '><span style='), rond(23));
  assert.ok(allumee.includes('aria-checked="true"') && allumee.includes('aria-label="Éteindre Lampe"'));
  const eteinte = rendu({ on: false });
  assert.deepEqual(declarations(eteinte, '<span role="switch"'), rail('rgba(150,162,184,.2)'));
  assert.deepEqual(declarations(eteinte, '><span style='), rond(3));
  // L'ambre d'une lumière, et la bascule d'une prise muette : dessinée, effacée, sans main.
  assert.deepEqual(declarations(rendu({ on: true, couleur: 'var(--o-bascule-lampe)' }), '<span role="switch"'), rail('var(--o-bascule-lampe)'));
  assert.deepEqual(declarations(rendu({ on: true, inerte: true }), '<span role="switch"'), rail('var(--o-accent-fond)', 'default', '0.4'));
  // Elle lit le dessin partagé, et redit sa position : c'est elle qui passe au-dessus de la surface de sa carte (lot 13).
  assert.ok(lire('src/cartes/briques.jsx').includes("style={{ ...railBascule(on, couleur), position: 'relative', cursor: inerte ? 'default' : 'pointer', opacity: inerte ? .4 : 1, display: 'inline-block' }}>"));
});

test('A : les trois bascules de 42 × 24 lisent ce dessin, et gardent leur geste', () => {
  const fiches = lire('src/appareils/fiches.jsx');
  assert.ok(fiches.includes("onClick={basculer} style={{ ...railBascule(on), cursor: 'pointer' }}><span style={rondBascule(on)} /></span>;"), 'le réglage d’un appareil dans sa fiche');
  assert.ok(fiches.includes("aria-label={enDemande ? tr('Couper') + ' ' + label : label}") && fiches.includes('const geste = appuiBascule({ on, garde: gs.garde, enDemande });'), 'sa garde et son libellé');
  const chauffage = lire('src/cartes/chauffage.jsx');
  assert.ok(chauffage.includes("{tr('Auto')}</span><span style={railBascule(!!z.auto)}><span style={rondBascule(!!z.auto)} /></span></span>}"), 'la programmation automatique d’une zone');
  assert.ok(chauffage.includes("aria-label={z.auto ? tr('Désactiver la programmation automatique') : tr('Activer la programmation automatique')}"));
  const capteur = lire('src/fichecapteur.jsx');
  assert.ok(capteur.includes('<span aria-hidden="true" style={railBascule(!!nonJugee)}><span style={rondBascule(!!nonJugee)} /></span>'), '« Ne pas juger cette mesure »');
  assert.ok(capteur.includes("<button type=\"button\" role=\"switch\" aria-checked={nonJugee} aria-label={tr('Ne pas juger cette mesure')} onClick={basculerJugement}"), 'la rangée entière bascule');
  for (const [f, s, d] of [['src/appareils/fiches.jsx', fiches, '../cartes/briques.jsx'], ['src/cartes/chauffage.jsx', chauffage, './briques.jsx'], ['src/fichecapteur.jsx', capteur, './cartes/briques.jsx']]) {
    const ligne = s.split('\n').find(l => l.startsWith('import {') && l.endsWith("} from '" + d + "';")) || '';
    assert.ok(/\brailBascule, rondBascule\b/.test(ligne), f + ' : le dessin vient de cartes/briques.jsx');
  }
});

test('A : plus aucune bascule de 42 × 24, ni de rond de 18 qui glisse à 21', () => {
  const restes = sources().filter(([, s]) => /width: 42, height: 24/.test(s) || /\? 21 : 3, width: 18/.test(s)).map(([f]) => f);
  assert.deepEqual(restes, [], 'une petite bascule est revenue : prends `railBascule` et `rondBascule` (cartes/briques.jsx)');
});

// ── B. Les croix ─────────────────────────────────────────────────────────────

test('B : la croix commune rend ce qu’elle rendait, et son dessin se lit ailleurs', async () => {
  const ui = await import('../src/ui.jsx');
  assert.deepEqual(ui.DESSIN_CROIX, { width: 34, height: 34, borderRadius: 10, flexShrink: 0, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center',
    justifyContent: 'center', background: 'var(--o-s1)', color: 'var(--o-text1)' });
  const html = renderToStaticMarkup(createElement(ui.CroixFeuille));
  assert.ok(html.includes('<button type="button" data-croix="" aria-label="Fermer la fiche" title="Fermer la fiche" style="width:34px;height:34px;border-radius:10px;flex-shrink:0;border:none;'
    + 'cursor:pointer;display:flex;align-items:center;justify-content:center;background:var(--o-s1);color:var(--o-text1)">'), 'la croix commune a changé de dessin');
  // Le glyphe : le même trait pour les quatre croix.
  assert.ok(html.includes(renderToStaticMarkup(ui.CROIX)), 'la croix commune ne porte plus le glyphe partagé');
  assert.ok(renderToStaticMarkup(ui.CROIX).startsWith('<svg aria-hidden="true" focusable="false" width="16" height="16"'));
  // Un appelant peut encore poser un écart par-dessus.
  assert.ok(renderToStaticMarkup(createElement(ui.CroixFeuille, { style: { marginLeft: 4 } })).includes('color:var(--o-text1);margin-left:4px"'));
});

test('B : les trois croix de panneau prennent ce dessin, et gardent leur geste', () => {
  const agenda = lire('src/feuilleagenda.jsx');
  assert.ok(agenda.includes("<button type=\"button\" onClick={onFermer} aria-label={tr('Fermer')} className=\"o-doigt\" style={DESSIN_CROIX}>{CROIX}</button>"), 'la fiche d’un rendez-vous');
  assert.ok(!agenda.includes('width: 28, height: 28') && !agenda.includes('cross-small'), 'la croix de 28 px est revenue');
  for (const f of ['src/formevenement.jsx', 'src/nouveaurappel.jsx']) {
    const s = lire(f);
    assert.ok(s.includes("<button onClick={onClose} aria-label={tr('Fermer')} className=\"o-doigt\" style={{ ...DESSIN_CROIX, background: 'var(--o-s2)' }}>{CROIX}</button>"), f + ' : la croix du formulaire');
    assert.ok(!/width: 30, height: 30, borderRadius: '50%'/.test(s), f + ' : la croix ronde de 30 px est revenue');
    // Le fond d'un cran plus clair : le panneau est déjà en `--o-s1`, la croix commune s'y fondrait.
    assert.ok(s.includes("borderRadius: 16, background: 'var(--o-s1)', display: 'flex', flexDirection: 'column', gap: 12 }}>"), f + ' : le panneau a changé de fond — revois celui de sa croix');
  }
  // Aucune des trois n'est devenue `CroixFeuille` : elle fermerait la feuille entière.
  assert.equal(agenda.split('<CroixFeuille').length - 1, 2, 'feuilleagenda.jsx : les croix de ses DEUX feuilles, pas une de plus');
  assert.ok(!lire('src/formevenement.jsx').includes('CroixFeuille') && !lire('src/nouveaurappel.jsx').includes('CroixFeuille'));
  for (const f of ['src/feuilleagenda.jsx', 'src/formevenement.jsx', 'src/nouveaurappel.jsx']) {
    assert.ok(/^import \{[^}]*\bDESSIN_CROIX, CROIX\b[^}]*\} from '\.\/ui\.jsx';$/m.test(lire(f)), f + ' : le dessin vient de ui.jsx');
  }
});

test('B : à 34 px, elles reçoivent la zone de 44 px d’un doigt (E17)', () => {
  // `o-doigt` : la zone du lot E17, sous `pointer: coarse` seulement — rien ne change à la souris.
  assert.ok(CSS.includes(':where(.o-doigt, '), 'la famille `o-doigt` a quitté la feuille');
  assert.ok(CSS.includes('inset: min(0px, (100% - 44px) / 2) max(var(--o-doigt-x, -22px), min(0px, (100% - 44px) / 2));'));
});

// ── C. Ce qui reste, par son choix ───────────────────────────────────────────

test('C : le seuil de 1180 px du puits d’Énergie reste tel quel', () => {
  assert.ok(CSS.includes('@media (max-width: 1180px) { .o-en-well { margin-left: -16px; margin-right: -16px; } }'));
});
