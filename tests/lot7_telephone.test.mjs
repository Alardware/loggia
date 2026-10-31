/* FINITIONS AU TÉLÉPHONE (30/10, lot 7 de l'audit du 28/10, V1–V7 et V9 ; ADR 0290).
 *
 * Mesuré dans la démo, avant et après, à 390, 360 et 320 px, à la tablette et à
 * 1440 px :
 *  - V1, la barre du bas : sous 360 px, 6 px au moins entre deux libellés (4
 *    avant) et le bouton de l'assistant à 54 px ;
 *  - V2, le héros : 22 px de ciel sous les chiffres (40 avant), les avatars à
 *    30 px sous 340 px ;
 *  - V3, un voile du fond du thème sous le texte du héros, en clair sur un ciel
 *    clair ;
 *  - V4, 11 px au moins : capitales du héros, rubriques du menu, jours du
 *    calendrier ;
 *  - V5, 44 px au doigt : points des pages, « Tous les scénarios », puces
 *    d'étage — le dessin ne bouge pas ;
 *  - V6, l'état des pièces compactes à 320 px, le libellé court de la recherche ;
 *  - V7, la croix d'une fiche se nomme « Fermer la fiche » ;
 *  - V9, la pièce compacte n'anime plus la couleur de son texte.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { register } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

register('./jsx-hooks.mjs', import.meta.url);
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
}
const { CroixFeuille } = await import('../src/ui.jsx');

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const lire = (f) => readFileSync(join(SRC, f), 'utf8');
const CSS = lire('index.css');
const LOT7 = CSS.slice(CSS.indexOf('/* ── Lot 7 de l\'audit du 28/10'));

test('V7 : la croix d’une fiche se nomme « Fermer la fiche », dans les sept langues', () => {
  const html = renderToStaticMarkup(createElement(CroixFeuille));
  assert.ok(html.includes('aria-label="Fermer la fiche"') && html.includes('title="Fermer la fiche"'), html);
  for (const lg of ['en', 'de', 'nl', 'it', 'es', 'pl']) {
    const m = /^ {2}'Fermer la fiche': '([^']+)',$/m.exec(lire('langues/' + lg + '.js'));
    assert.ok(m && m[1] && m[1] !== 'Fermer la fiche', lg + ' : « Fermer la fiche » manque');
  }
});

test('V9 : la pièce compacte n’anime que son fond, son liseré et son ombre', () => {
  const b = lire('accueil/briques.jsx');
  const chip = b.slice(b.indexOf('<div className="o-piece o-piecechip"'), b.indexOf('<span ref={flashRef}', b.indexOf('<div className="o-piece o-piecechip"')));
  assert.ok(chip.includes("transition: 'background .25s, border-color .25s, box-shadow .25s'"), chip);
  assert.ok(!chip.includes("'all "), 'plus de `all` : la couleur du texte, héritée, passait par le blanc du thème sombre');
});

test('V5 : les cibles du téléphone font 44 px, le dessin ne bouge pas', () => {
  const b = lire('accueil/briques.jsx');
  // Les points : 44 × 44, élargis vers l'extérieur, le point dans sa case de 24 du côté du voisin.
  assert.ok(b.includes("minWidth: 44, height: 44, margin: '-19px 0'") && b.includes("justifyContent: i ? 'flex-start' : 'flex-end'") && b.includes("<span aria-hidden=\"true\" style={{ width: 24, display: 'flex', justifyContent: 'center' }}>"));
  // « Tous les scénarios » : 44 de haut, la ligne garde sa hauteur.
  assert.ok(b.includes("minHeight: 44, margin: '-10px 0', padding: '0 2px'"));
  // Les puces d'étage : le bouton est la zone, la pastille son contenu ; le puits ne la rogne plus.
  const d = lire('accueil/dashboard.jsx');
  const puces = d.slice(d.indexOf('const etagesPuces ='), d.indexOf('const serre ='));
  assert.ok(puces.includes("height: 44, margin: '-7px 0'") && puces.includes("height: 30, lineHeight: '30px'"));
  assert.ok(!puces.includes("overflow: 'hidden' }}>"), 'le puits rognait la zone à 36 px');
  assert.ok(puces.includes("background: on ? 'var(--o-accent-fond)' : 'transparent', color: on ? '#fff' : 'var(--o-text1)'"), 'la puce choisie reste bleu plein, texte blanc');
});

test('V4 : capitales du héros, rubriques du menu et jours du calendrier à 11 px au moins', () => {
  const d = lire('accueil/dashboard.jsx');
  assert.equal((d.match(/fontSize: 10, fontWeight: 700, letterSpacing: '\.03em'/g) || []).length, 0);
  assert.equal((d.match(/fontSize: 11, fontWeight: 700, letterSpacing: '\.03em'/g) || []).length, 7);
  const m = lire('chrome/barrelaterale.jsx');
  assert.equal((m.match(/fontSize: 10, fontWeight: 800, letterSpacing: '\.1em'/g) || []).length, 0, 'une rubrique du menu à 10 px');
  const a = lire('agendarail.jsx');
  assert.ok(a.includes("<span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: sel ? 'inherit' : 'var(--o-text2)' }}>{dow}</span>"));
});

test('V1, V2, V3, V6 : les règles du téléphone', () => {
  assert.ok(LOT7.includes('@media (max-width: 360px) { .o-nav-assist { width: 54px !important; } }'));
  assert.ok(lire('chrome/entete.jsx').includes('className="o-nav-assist"'));
  assert.ok(LOT7.includes('.o-banniere { padding-bottom: 4px !important; }') && LOT7.includes('.o-pages-points { margin-top: -8px; }'));
  assert.ok(LOT7.includes('.o-avatarin { width: 30px !important; height: 30px !important; }'));
  // Le voile : la couleur du fond du thème, jamais une couleur écrite, et pas sous un ciel sombre (texte blanc).
  const voile = LOT7.slice(LOT7.indexOf('.o-banniere::before'), LOT7.indexOf('}', LOT7.indexOf('.o-banniere::before')));
  assert.ok(voile.includes('color-mix(in srgb, var(--o-bg) 40%, transparent)') && !/#[0-9a-f]{3,6}\b|rgba?\(/i.test(voile), voile);
  assert.ok(LOT7.includes('html.loggia-light main:has(.o-wx3d):not(:has(.o-wx3d-sombre)) .o-banniere::before'));
  assert.ok(LOT7.includes('.o-chip-etat { font-size: 11px !important; }') && lire('accueil/briques.jsx').includes('<div className="o-chip-etat"'));
  // La recherche : un seul libellé à la fois, et chacun est traduit.
  const e = lire('chrome/entete.jsx');
  assert.ok(e.includes("{tr('Rechercher une pièce, une scène…')}") && e.includes("{tr('Rechercher…')}"));
  assert.ok(LOT7.includes('.o-recherche-court { display: none; }') && LOT7.includes('@container (max-width: 1200px) {'));
});
