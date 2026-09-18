// ─────────────────────────────────────────────────────────────────────────────
// Le mode clair tenu, un seul signal pour le hors-ligne, les identités en
// jetons (v3.50.0, ADR 0048).
//
// Trois garde-fous. Les couleurs qui servent de TEXTE en clair tiennent le
// contraste (4,5:1 sur blanc, 3:1 sur le fond de page pour les identités qui
// ne s'écrivent qu'en gros ou en gras) — calculé ici, pas promis. Ce qui se
// dessine sur du noir quel que soit le thème (veille, caméra) vit dans un
// îlot sombre. Et « ne répond plus » se dit d'une seule façon : le liseré.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const compter = (s, motif) => s.split(motif).length - 1;
const css = lire('src', 'index.css');
const app = lire('src', 'App.jsx');

const bloc = (debut) => { const i = css.indexOf(debut); return css.slice(i, css.indexOf('\n}', i)); };
const jetons = (texte) => { const m = {}; for (const [, k, v] of texte.matchAll(/(--o-[a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\b/g)) m[k] = v; return m; };
const SOMBRE = jetons(bloc(':root {'));
const CLAIR = { ...SOMBRE, ...jetons(bloc('html.loggia-light {')) };

const lum = (hex) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; const n = parseInt(hex.slice(1), 16); return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255); };
const contraste = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

test('en clair, chaque couleur qui sert de texte tient le contraste', () => {
  const texte = ['--o-text', '--o-text1', '--o-text2', '--o-text3', '--o-ok', '--o-warn', '--o-warn2', '--o-bad', '--o-cold', '--o-accent-soft', '--o-purple', '--o-cyan', '--o-gold'];
  for (const k of texte) {
    assert.ok(CLAIR[k], k + ' défini en clair');
    assert.ok(contraste(CLAIR[k], '#ffffff') >= 4.5, k + ' sur blanc : ' + contraste(CLAIR[k], '#ffffff').toFixed(2));
    assert.ok(contraste(CLAIR[k], CLAIR['--o-bg']) >= 4.5, k + ' sur le fond : ' + contraste(CLAIR[k], CLAIR['--o-bg']).toFixed(2));
  }
  // Les identités s'écrivent en gros (la température d'une pièce, 25 px) ou
  // colorent une icône : 3:1 sur le fond, 4,5:1 sur une carte blanche.
  const identites = ['--o-piece-ambre', '--o-piece-tendre', '--o-piece-chambre', '--o-piece-bain', '--o-piece-vert', '--o-lampe', '--o-orange', '--o-rose'];
  for (const k of identites) {
    assert.ok(CLAIR[k] !== SOMBRE[k], k + ' redéfini en clair');
    assert.ok(contraste(CLAIR[k], '#ffffff') >= 4.5, k + ' sur blanc : ' + contraste(CLAIR[k], '#ffffff').toFixed(2));
    assert.ok(contraste(CLAIR[k], CLAIR['--o-bg']) >= 3, k + ' sur le fond : ' + contraste(CLAIR[k], CLAIR['--o-bg']).toFixed(2));
  }
});

test('en sombre aussi, le texte et les identités se lisent', () => {
  for (const k of ['--o-text2', '--o-text3', '--o-ok', '--o-warn', '--o-bad', '--o-cold', '--o-accent-soft', '--o-lampe', '--o-orange', '--o-rose', '--o-piece-ambre', '--o-piece-chambre']) {
    assert.ok(contraste(SOMBRE[k], SOMBRE['--o-bg']) >= 4.5, k + ' : ' + contraste(SOMBRE[k], SOMBRE['--o-bg']).toFixed(2));
  }
});

test('les identités ont leurs jetons, et l’écran ne les écrit plus en dur', () => {
  for (const k of ['--o-lampe', '--o-lampe-b', '--o-lampe-rgb', '--o-orange', '--o-orange-rgb', '--o-rose', '--o-rose-rgb', '--o-flux-solaire', '--o-flux-maison', '--o-flux-reseau', '--o-flux-ve', '--o-flux-batterie', '--o-text3-rgb']) {
    assert.ok(bloc(':root {').includes(k + ':'), k);
  }
  const ui = lire('src', 'ui.jsx');
  for (const k of ['orange', 'rose', 'lampe']) assert.ok(ui.includes("'var(--o-" + k + ")': '--o-" + k + "-rgb'"), 'hx connaît ' + k);
  for (const brut of ["'#ff8a4c'", '"#ff8a4c"', "'#ffce73'", '"#ffce73"', '#FF2D78', "'52,211,153'", 'rgba(52,211,153,', "'140,152,180'", 'rgba(140,152,180,', 'linear-gradient(135deg,#ffb347,#f87171)', "solar: '#fbbf24'", 'linear-gradient(90deg,#ffce73,#f59e0b)', 'rgba(255,138,76,', "'255,45,120'"]) {
    assert.equal(compter(app, brut), 0, brut);
  }
  assert.ok(app.includes("const RM_ROSE = 'var(--o-rose)';"));
  assert.ok(app.includes("const C = { solar: 'var(--o-flux-solaire)', home: 'var(--o-flux-maison)', grid: 'var(--o-flux-reseau)', ev: 'var(--o-flux-ve)', bat: 'var(--o-flux-batterie)' };"));
  assert.ok(app.includes("function ViewHead({ titre, sous, badge, rgb = 'var(--o-ok-rgb)' })"), 'le vert de l’en-tête suit le thème');
  assert.ok(app.includes("{ id: 'accent', label: 'Accent', col: 'var(--o-accent-soft)', rgb: 'var(--o-accent-soft-rgb)' },"), 'l’accent d’une pièce, en texte, prend la variante lisible');
  // Restent en dur, par nature : les palettes des thèmes, les couleurs de
  // profil et d’accent choisies (une valeur enregistrée doit être une couleur).
  assert.ok(ui.includes("export const USER_COLORS = ['#4f8cff',"));
});

test('un îlot sombre garde les jetons sombres sous n’importe quel thème', () => {
  const ilot = bloc('.o-sombre {');
  for (const k of ['--o-text', '--o-text2', '--o-ok', '--o-warn', '--o-bad', '--o-lampe', '--o-accent-soft']) assert.ok(ilot.includes(k + ':'), k);
  assert.equal(jetons(ilot)['--o-bad'], SOMBRE['--o-bad']);
  assert.ok(app.includes(`<div className="o-sombre" role="button" aria-label={tr('Toucher pour réveiller')}`), 'la veille');
  assert.ok(app.includes("className={'o-sombre o-cam-tuile' + (c.online === false ? ' o-panne' : '')}"), 'la tuile caméra');
});

test('« ne répond plus » se dit d’une seule façon : le liseré', () => {
  assert.ok(app.includes("function RoomFeederCard({ nom, sub, pct, prochaine, onFeed, onRempli = null, onOpen, extra = null, chip = false, mort = false })"));
  assert.ok(app.includes("function RoomPlantCard({ mort = false, nom, sub, hum, verdict, verdictCol,"));
  assert.equal(compter(app, "className={'o-piece o-cvdense' + (mort ? ' o-panne' : '')}"), 2, 'distributeur et plante, compacts');
  assert.equal(compter(app, "className={'o-rmcard' + (mort ? ' o-panne' : '')}"), 8, 'toutes les cartes de pièce (la lampe porte aussi o-light-card)');
  assert.ok(app.includes("const mort = !!(estClimate(zone) && (!S || !S[zone.haid] || S[zone.haid].state === 'unavailable'));"), 'la zone de chauffage');
  assert.ok(app.includes("mort: muet(croq.reservoir) };") && app.includes("mort={d.mort}"), 'le distributeur');
  assert.ok(app.includes("mort: muet(plantCapteur(S, p.base, 'moisture'))") && app.includes("mort={pl.mort}"), 'la plante');
  assert.ok(app.includes("<div className={mort ? 'o-panne' : undefined} style={{ ...CV_CADRE, opacity: mort ? .55 : 1 }}>"), 'le hero d’une machine');
  assert.ok(lire('src', 'ficherobot.jsx').includes("<div className=\"o-panne\" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 14px 6px 6px', borderRadius: 30 }}>"), 'la fiche du robot');
  assert.ok(css.includes('.o-cam-tuile.o-panne::before { inset: 0; }'), 'le liseré de la caméra reste dans ses coins');
});
