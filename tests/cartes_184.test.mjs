// ─────────────────────────────────────────────────────────────────────────────
// Une standard = 184 px dans TOUTES les grilles de cartes (04/10, question 5 de
// l'audit du 03/10 : « ok pour 184 mais il faut que 2 compactes puissent être à
// côté sans déborder, ça doit être aligné »).
//
// Les grilles denses (vue d'une pièce, Objets, Volets, piles d'Énergie, vues
// custom) posaient `gap: 16` en ligne : l'écart ENTRE RANGÉES valait donc 16,
// et une standard, qui couvre deux rangées de 88 et l'écart qui les sépare,
// mesurait 88 + 16 + 88 = 192 px — 186 au téléphone, où un `gap: 10px
// !important` resserrait tout. L'Accueil (src/placement.js) et les Scénarios
// donnent 184. Mesuré dans la démo, 1440 et 390 px, en mode normal et en
// édition : 192 / 186 avant, 184 partout après ; deux compactes empilées à
// côté d'une standard tombent sur son haut et son bas, à 8 px l'une de
// l'autre ; l'écart horizontal ne bouge pas (16 ; 10 au téléphone, sauf dans
// les vues custom, qui gardent 16 à toutes les largeurs).
//
// Le texte du source suffit : la hauteur d'une standard EST 2 × rangée +
// écart vertical, et ce test lit les deux là où ils vivent. Il échoue sur le
// code d'avant (`gap: 16`, aucune règle de rangée au téléphone).
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const src = lire('src', 'App.jsx');
// Les commentaires CSS citent parfois des accolades : ils sortent avant de compter.
const css = lire('src', 'index.css').replace(/\/\*[\s\S]*?\*\//g, '');

const HAUTEUR_STANDARD = 184;

/** Les grilles de cartes à rangées de 88 px : leur classe et leur style en ligne. */
function grillesDenses() {
  const out = [];
  const re = /<div\b[^>]*?className="([^"]*)"[^>]*?style=\{\{([^}]*)\}\}/g;
  let m;
  while ((m = re.exec(src))) {
    const cls = m[1].split(/\s+/);
    if (cls.includes('grid-dense') || cls.includes('grid-custom')) out.push({ cls: m[1], style: m[2] });
  }
  return out;
}

/** La rangée d'une classe CSS, en pixels (`grid-auto-rows`). */
function rangee(sel) {
  const m = css.match(new RegExp('\\' + sel + ' \\{[^}]*grid-auto-rows: (\\d+)px'));
  assert.ok(m, sel + ' : grid-auto-rows introuvable');
  return Number(m[1]);
}

/** Le corps d'un bloc `@media` qui contient `temoin`, accolades appariées. */
function blocMedia(entete, temoin) {
  let d = css.indexOf(entete);
  while (d >= 0) {
    let i = css.indexOf('{', d) + 1, prof = 1;
    const debut = i;
    while (prof > 0 && i < css.length) { if (css[i] === '{') prof += 1; else if (css[i] === '}') prof -= 1; i += 1; }
    const corps = css.slice(debut, i - 1);
    if (corps.includes(temoin)) return corps;
    d = css.indexOf(entete, i);
  }
  return null;
}

test('chaque grille dense écarte ses RANGÉES de 8 px et garde ses 16 px entre colonnes', () => {
  const g = grillesDenses();
  const noms = g.map(x => x.cls).join(' | ');
  // Pièce et Volets (grid-roomdev), Objets, piles d'Énergie, vues custom.
  assert.equal(g.filter(x => x.cls.includes('grid-roomdev')).length, 2, 'la vue d’une pièce et les Volets : ' + noms);
  assert.ok(g.some(x => x.cls === 'grid-objets grid-dense'), 'Objets : ' + noms);
  assert.ok(g.some(x => x.cls === 'o-piles grid-objets grid-dense'), 'piles d’Énergie : ' + noms);
  assert.ok(g.some(x => x.cls === 'grid-custom'), 'vues custom : ' + noms);
  for (const x of g) {
    assert.ok(!/(^|[\s,])gap:/.test(x.style), x.cls + ' : un `gap` en ligne fixe AUSSI l’écart vertical — ' + x.style);
    assert.ok(/\browGap: 8\b/.test(x.style), x.cls + ' : rowGap 8 attendu — ' + x.style);
    assert.ok(/\bcolumnGap: 16\b/.test(x.style), x.cls + ' : l’écart horizontal ne change pas — ' + x.style);
  }
});

test('une standard = deux rangées + l’écart = 184 px, comme à l’Accueil', () => {
  // L'écart vertical : `rowGap`, ou le `gap` qui le fixait avant (192 px).
  const ecart = (x) => Number((x.style.match(/\browGap: (\d+)/) || x.style.match(/(?:^|[\s,])gap: (\d+)/) || [])[1]);
  for (const x of grillesDenses()) {
    const r = rangee(x.cls.includes('grid-custom') ? '.grid-custom' : '.grid-dense');
    assert.equal(r, 88, x.cls + ' : une compacte = une rangée de 88');
    assert.equal(2 * r + ecart(x), HAUTEUR_STANDARD, x.cls + ' : ' + r + ' + ' + ecart(x) + ' + ' + r);
  }
  // L'Accueil pose ses pièces au pixel (placement.js) : même rangée, même écart.
  const pl = lire('src', 'placement.js');
  const rg = Number((pl.match(/const RANGEE = (\d+);/) || [])[1]);
  const ec = Number((pl.match(/const ECART = (\d+);/) || [])[1]);
  assert.equal(2 * rg + ec, HAUTEUR_STANDARD, 'l’Accueil donne 184, les vues aussi');
});

test('au téléphone, la grille dense repasse à 8 px entre rangées APRÈS les `gap: 10px !important`', () => {
  const tel = blocMedia('@media (max-width: 820px)', '.grid-objets {');
  assert.ok(tel, 'le bloc du téléphone (≤ 820 px) des grilles Objets / Pièce');
  const regle = '.grid-dense { row-gap: 8px !important; }';
  const i = tel.indexOf(regle);
  assert.ok(i >= 0, 'sans elle, 88 + 10 + 88 = 186 au téléphone');
  // Même poids que les deux règles qui resserrent tout : c'est l'ordre qui tranche.
  for (const avant of ['.grid-roomdev { grid-template-columns: 1fr 1fr !important; gap: 10px !important; }',
    '.grid-objets { grid-template-columns: 1fr 1fr !important; gap: 10px !important; }']) {
    const j = tel.indexOf(avant);
    assert.ok(j >= 0, 'l’écart horizontal du téléphone reste 10 px : ' + avant);
    assert.ok(j < i, 'la règle des rangées vient après ' + avant.split(' {')[0]);
  }
  // Rien d'autre dans cette règle : largeur et taille restent les choix de l'utilisateur.
  assert.equal((tel.match(/\.grid-dense \{[^}]*\}/g) || []).join(''), regle);
});

// Relecture du 04/10 — ce que les 8 px entre rangées ont cassé, mesuré dans la
// démo (vue perso de trois agendas ; Pièce Salon en édition), 320 → 1440 px.

/** Le bloc d'une fonction de App.jsx, jusqu'à la suivante. */
const fonction = (nom) => { const i = src.indexOf('function ' + nom + '('); assert.ok(i >= 0, nom + ' introuvable'); return src.slice(i, src.indexOf('\nfunction ', i + 1)); };

test('la carte Agenda d’une vue perso tient ses trois événements dans 184 px', () => {
  const c = fonction('CvAgenda');
  // Le titre : une ligne, et incompressible. Sur deux lignes (1366, 800, 390 px),
  // il poussait le 3e événement dehors ; tronqué sans `flexShrink: 0`, la colonne
  // qui déborde l'écrasait à 0 px et il disparaissait.
  const titre = (c.match(/<div style=\{\{([^}]*)\}\}>\{cvName\(st, id\)\}/) || [])[1] || '';
  for (const p of ["whiteSpace: 'nowrap'", "overflow: 'hidden'", "textOverflow: 'ellipsis'", 'flexShrink: 0']) assert.ok(titre.includes(p), 'titre de l’agenda : ' + p + ' — ' + titre);
  // La hauteur : trait 1 + marge 16 + titre 18 + 8 + trois pastilles (texte 32
  // + rembourrage) + deux écarts, sans dépasser le bas visible (184 − 1).
  // Avec `padding: '6px 10px'`, 187 : la 3e pastille perdait son bas arrondi.
  assert.ok(c.includes('events.slice(0, 3)'), 'trois événements');
  const padV = Number((c.match(/gap: 10, padding: '(\d+)px 10px'/) || [])[1]);
  const ecart = Number((c.match(/flexDirection: 'column', gap: (\d+) \}/) || [])[1]);
  assert.ok(padV >= 0 && ecart >= 0, 'rembourrage ' + padV + ', écart ' + ecart);
  const bas = 1 + 16 + 18 + 8 + 3 * (32 + 2 * padV) + 2 * ecart;
  assert.ok(bas <= HAUTEUR_STANDARD - 1, 'bas de la 3e pastille à ' + bas + ' px pour une carte de ' + HAUTEUR_STANDARD);
});

test('en édition, deux pointillés empilés gardent 2 px d’écart, comme sur l’Accueil', () => {
  // Pointillé de 1 px à `--o-pointille-ecart` du bord (3 px par défaut) : entre
  // deux rangées de 8, 8 − 2 × (3 + 1) = 0 — un seul trait de 2 px.
  const m = css.match(/\.grid-dense > \.o-pointille, \.grid-custom > \.o-pointille \{ --o-pointille-ecart: (\d+)px; \}/);
  assert.ok(m, 'règle de l’écart du pointillé dans les grilles denses et les vues perso');
  const ecart = Number(m[1]);
  assert.equal(8 - 2 * (ecart + 1), 2, 'espace entre les deux traits');
  // Même dosage que les pièces de l'Accueil, à la même rangée de 8.
  assert.ok(fonction('Dashboard').includes("'--o-pointille-ecart': '" + ecart + "px'"), 'l’Accueil pose ' + ecart + ' px');
});
