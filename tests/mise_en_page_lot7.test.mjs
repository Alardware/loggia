// ─────────────────────────────────────────────────────────────────────────────
// Ce qui se coupait ou débordait à l'écran (audit du 03/10, lot 7).
//
// Chaque correction a été mesurée dans la démo (390, 360 et 320 px, 1024 et
// 1440 px, dans les sept langues) ; la mise en page ne se calcule pas sous
// Node, ce fichier épingle donc ce qui la tient. La barre du bas a son propre
// fichier : barre_mobile_courte.test.mjs.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const app = lire('src', 'App.jsx');
const css = lire('src', 'index.css');

test('pastille de pièce (maquette 1b) : le nom a toute la largeur, sous l’icône et l’interrupteur', () => {
  const d = app.indexOf('if (chip) {', app.indexOf('function PieceCard('));
  const chip = app.slice(d, app.indexOf('if (compact) {', d));
  assert.ok(chip.includes("display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 4, padding: '11px 14px'"), 'une colonne : haut, puis bas');
  const haut = chip.indexOf("justifyContent: 'space-between', gap: 8, minHeight: 25 }}>");
  const inter = chip.indexOf('role="switch"');
  const nom = chip.indexOf("fontSize: 14, fontWeight: 800, whiteSpace: 'nowrap'");
  assert.ok(haut > 0 && inter > haut && nom > inter, 'l’interrupteur dans la ligne du haut, le nom en dessous');
  assert.ok(chip.includes("{temp && <><span style={{ color: p.tc, fontWeight: 800 }}>{temp}</span> · </>}"), 'la température ouvre la ligne d’état');
  assert.ok(!css.includes('o-chip-temp-d'), 'plus de bascule par container query');
});

test('FlipText au repos est du texte : l’ellipse du parent le coupe au lieu de le cacher', () => {
  const ui = lire('src', 'ui.jsx');
  const f = ui.slice(ui.indexOf('export function FlipText('), ui.indexOf('\n}\n', ui.indexOf('export function FlipText(')));
  assert.ok(f.includes("if (prev == null) return <span aria-live={live ? 'polite' : undefined} style={style}>{cur}</span>;"));
  assert.ok(f.indexOf('if (prev == null) return') < f.indexOf("display: 'inline-block', overflow: 'hidden'"), 'le bloc atomique ne sert qu’à la bascule');
});

test('la barre des pièces centre la puce choisie en mesurant DANS la barre', () => {
  const i = app.indexOf("const el = w.querySelector('[data-room-active=\"1\"]');");
  const effet = app.slice(i, app.indexOf('}, [room]);', i));
  assert.ok(effet.includes('const dansBarre = w.scrollLeft + el.getBoundingClientRect().left - w.getBoundingClientRect().left;'));
  assert.ok(!effet.includes('el.offsetLeft'), '`offsetLeft` part du corps de la page, barre latérale comprise');
});

test('le champ de recherche de l’en-tête garde de quoi se lire, sans faire déborder l’en-tête', () => {
  assert.ok(css.includes('.loggia-hdr { container-type: inline-size; }'));
  assert.ok(css.includes('.o-hdr-search { min-width: 200px; }'));
  assert.match(css, /@container \(max-width: 700px\) \{\s*\.o-hdr-date, \.o-hdr-div \{ display: none !important; \}/);
  assert.match(css, /@container \(max-width: 540px\) \{\s*\.o-hdr-search \{ min-width: 0; \}\s*\.o-hdr-kbd \{ display: none; \}/);
  assert.ok(app.includes('<span className="o-hdr-kbd" style={{ flexShrink: 0,'));
  const champ = app.slice(app.indexOf('<div className="o-hdr-search"'), app.indexOf('</div>', app.indexOf('<div className="o-hdr-search"')));
  assert.ok(!/minWidth: \d/.test(champ.split('\n')[0]), 'le minimum vit dans index.css, sinon la requête de conteneur ne pourrait pas le lever');
});

test('hub Paramètres : sous-titres sur deux lignes réservées, valeur jamais coupée', () => {
  const p = lire('src', 'views', 'parametres.jsx');
  assert.ok(p.includes("lineHeight: 1.35, minHeight: '2.7em', color: 'var(--o-text3)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{sec.sub}</div>"));
  assert.ok(p.includes("<span style={{ flexShrink: 0, maxWidth: '100%', fontSize: sec.small ? 17 : 24,"));
});

test('le badge de la démo s’efface pendant qu’une fenêtre est ouverte', () => {
  const demo = lire('src', 'demo.js');
  assert.ok(demo.includes("badge.setAttribute('data-demo-badge', '');"));
  assert.ok(demo.includes(`effacement.textContent = 'html:has([role="dialog"]) [data-demo-badge]{display:none!important}';`));
  // Les deux fenêtres qui le portent : les feuilles, et le code administrateur.
  assert.ok(lire('src', 'ui.jsx').includes(`className={'o-sheet' + (opaque ? ' o-sheet-opaque' : '') + (onglets ? ' o-sheet-onglets' : '')} role="dialog"`));
  assert.ok(lire('src', 'pinmodal.jsx').includes('<div ref={boiteRef} role="dialog"'));
});

test('aucune fenêtre ne porte aria-modal : la région d’annonce du toast doit rester lisible', () => {
  // Relecture du 03/10 : avec aria-modal, WebKit et Chromium retiraient de
  // l'arbre d'accessibilité la région d'annonce, hors de la feuille — un échec
  // lancé depuis une fiche restait muet. `inerterAutour` confine déjà.
  for (const f of ['ui.jsx', 'pinmodal.jsx']) assert.ok(!lire('src', f).includes('aria-modal="true"'), f);
  assert.ok(lire('src', 'ui.jsx').includes("frere.hasAttribute('data-annonce')"), 'la région reste éveillée');
  assert.ok(css.includes('[data-section] { scroll-margin-top: 84px; scroll-margin-bottom: calc(var(--o-navh, 0px) + 12px); }'), 'la tuile rendue ne passe pas sous la barre du bas');
});

test('le badge de la démo parle la langue de la démo', () => {
  const demo = lire('src', 'demo.js');
  const table = demo.slice(demo.indexOf('const BADGE = {'), demo.indexOf('};', demo.indexOf('const BADGE = {')));
  for (const l of ['fr', 'en', 'de', 'nl', 'it', 'es', 'pl']) assert.match(table, new RegExp('\\n    ' + l + ": \\['[^']+', '[^']+'\\],"), l + ' manque');
  assert.ok(demo.includes('const [texteBadge, texteLien] = BADGE[LANGUE_DEMO] || BADGE.fr;'));
  assert.ok(demo.includes('badge.textContent = texteBadge;') && demo.includes('lien.textContent = texteLien;'));
  assert.ok(demo.includes("lien.hreflang = 'fr';"), 'les pages légales n’existent qu’en français');
});
