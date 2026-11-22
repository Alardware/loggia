// ─────────────────────────────────────────────────
// Lot 4 de l'audit du 12/11 (ADR 0370) : les animations des dessins et la
// couleur des bascules.
//
// E18 — Seize animations d'icônes ne jouaient jamais : `dessins.js` et
// `dessinsrares.js` les appelaient en style en ligne (`animation:o-ic-…`),
// la feuille ne les définissait pas. 41 dessins sur 171 gardaient une partie
// figée. Ce test tient la règle dans les deux sens qui comptent : tout ce
// qu'un dessin appelle est défini.
//
// E14 — Les bascules portaient trois couleurs (rose, ambre, bleu). Sa
// décision : l'ambre pour une lumière, le bleu de la maison pour le reste.
// ─────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lire = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const CSS = lire('src/index.css');
const DESSINS = lire('src/dessins.js') + '\n' + lire('src/dessinsrares.js');

const definies = new Set([...CSS.matchAll(/@keyframes (o-ic-[a-z0-9-]+)\b/g)].map(m => m[1]));
const appelees = new Set([...DESSINS.matchAll(/animation:(o-ic-[a-z0-9-]+)\b/g)].map(m => m[1]));

// ── E18 : tout ce qu'un dessin appelle est défini ────────────────────────────

test('E18 : chaque animation qu’un dessin appelle a ses @keyframes', () => {
  assert.ok(appelees.size >= 30, 'les dessins appellent bien leurs animations en style en ligne');
  const manquantes = [...appelees].filter(n => !definies.has(n)).sort();
  assert.deepEqual(manquantes, [], 'une animation appelée sans définition laisse une partie du dessin figée');
});

test('E18 : les seize qui manquaient sont là, une fois chacune', () => {
  const seize = ['buzz', 'door', 'draw', 'glow', 'grow', 'heart', 'knob', 'lift', 'nudge-r', 'ring', 'rise', 'sundown', 'sunup', 'sway', 'switch', 'wink'];
  for (const n of seize) {
    assert.equal((CSS.match(new RegExp('@keyframes o-ic-' + n + ' \\{', 'g')) || []).length, 1, 'o-ic-' + n);
    assert.ok(appelees.has('o-ic-' + n), 'o-ic-' + n + ' est appelée par un dessin');
  }
});

test('E18 : elles gardent le préfixe et l’écriture en ligne que la mise en pause vise', () => {
  // Le mouvement réduit et le dessin figé arrêtent tout ce qui s'appelle `o-ic-…`, posé en style en ligne.
  assert.ok(CSS.includes('[style*="animation:o-ic-"] { animation: none !important; }'));
  assert.ok(CSS.includes('.o-ico-fige svg *, .o-ico-fige * { animation: none !important; }'));
  for (const n of definies) assert.ok(n.indexOf('o-ic-') === 0);
});

test('E18 : un trait qui se dessine porte de quoi se dessiner', () => {
  assert.ok(/@keyframes o-ic-draw \{[^}]*stroke-dashoffset: 1;[^@]*stroke-dashoffset: 0;/.test(CSS), 'le trait part de rien et se trace');
  const traits = [...DESSINS.matchAll(/<path[^>]*animation:o-ic-draw [^>]*>/g)].map(m => m[0]);
  assert.ok(traits.length >= 4);
  for (const t of traits) assert.ok(t.includes('pathLength="1"') && t.includes('stroke-dasharray="1"'), t.slice(0, 60));
});

test('E18 : chaque partie animée tourne ou glisse autour du point que son tracé nomme', () => {
  // `transform-box:view-box` : le point d'ancrage est en unités du dessin, pas de la boîte du tracé.
  const animes = [...DESSINS.matchAll(/style="([^"]*animation:o-ic-(?:door|sway|ring|rise|grow|wink|heart|glow)[^"]*)"/g)].map(m => m[1]);
  assert.ok(animes.length >= 25);
  for (const s of animes) assert.ok(s.includes('transform-box:view-box') && s.includes('transform-origin:'), s.slice(0, 70));
});

// ── E14 : l'ambre pour une lumière, le bleu pour le reste ────────────────────

test('E14 : deux couleurs de bascule, deux jetons', () => {
  const briques = lire('src/cartes/briques.jsx');
  assert.ok(briques.includes("const RM_BLEU = 'var(--o-accent-fond)';") && briques.includes("const RM_AMBRE = 'var(--o-bascule-lampe)';"));
  assert.ok(briques.includes('function RmBascule({ on, nom, onToggle, couleur = RM_BLEU, inerte = false, className = undefined }) {'), 'le bleu de la maison par défaut');
  assert.equal(briques.includes('RM_ROSE'), false, 'le rose n’est plus une couleur de bascule');
  // La bascule de Système et de Paramètres : le même bleu.
  assert.ok(lire('src/ui.jsx').includes("background: on ? 'var(--o-accent-fond)' : 'var(--o-s1)'"));
});

test('E14 : l’ambre, là où c’est une lumière — sa carte, sa fiche, la tuile d’une pièce', () => {
  assert.ok(lire('src/cartes/lumiere.jsx').includes('inerte={inerte} couleur={RM_AMBRE} />'));
  assert.ok(lire('src/fichelumiere.jsx').includes('couleur="var(--o-bascule-lampe)" />}'));
  const tuile = lire('src/accueil/briques.jsx');
  assert.equal((tuile.match(/background: on \? 'var\(--o-bascule-lampe\)' : 'var\(--o-bd1\)'/g) || []).length, 2, 'la tuile large et la tuile compacte');
  assert.equal(tuile.includes('linear-gradient(135deg,var(--o-lampe),var(--o-lampe-b))'), false);
});

test('E14 : aucune autre carte ne choisit sa couleur de bascule', () => {
  // Une prise, un lecteur, un chauffage : le bleu par défaut, sans rien passer.
  for (const f of ['src/cartes/prise.jsx', 'src/cartes/media.jsx', 'src/cartes/chauffage.jsx', 'src/cartes/generique.jsx']) {
    assert.equal(/<RmBascule[^>]*couleur=/.test(lire(f)), false, f);
  }
});

// ── I2 : oublier un écran demande deux appuis ────────────────────────────────

test('I2 : oublier un écran — le premier appui arme, le second oublie, 4 s et il se désarme', () => {
  const vue = lire('src/views/appareils.jsx');
  assert.ok(vue.includes("const OUBLI_ARME = { background: 'var(--o-bad)', color: '#fff' };"), 'le rouge plein de la feuille d’un profil');
  assert.ok(vue.includes('if (arme !== id) { setArme(id); return; }'), 'le premier appui n’oublie rien');
  assert.ok(vue.includes('const t = setTimeout(() => setArme(null), 4000);'), 'désarmé seul au bout de 4 s');
  // Les deux écritures — la ligne du téléphone, la feuille de l'ordinateur — passent par le même geste.
  assert.ok(vue.includes("onClick={() => oublier(id)} style={{ ...btnTel, ...(arme === id ? OUBLI_ARME : null) }}>{arme === id ? tr('Confirmer ?') : tr('Oublier')}</button>"));
  assert.ok(vue.includes("onClick={() => oublier(ouvert, () => setOuvert(null))} style={{ ...btnDanger, ...(arme === ouvert ? OUBLI_ARME : null) }}>{arme === ouvert ? tr('Confirmer ?') : tr('Oublier cet écran')}</button>"));
  // Plus aucun bouton n'efface une fiche d'écran d'un seul appui.
  assert.equal(/onClick=\{\(\) => \{ poserFiche\([a-z]+, null\)/.test(vue), false);
});

test('E14 : en thème clair, l’ambre éclaire au lieu de brunir', () => {
  assert.ok(CSS.includes(':root { --o-bascule-lampe: linear-gradient(135deg, var(--o-lampe), var(--o-lampe-b)); }'), 'le dégradé de la lampe, qui suit le thème');
  assert.ok(/html\.loggia-light \{ --o-bascule-lampe: linear-gradient\(135deg, #[0-9a-f]{6}, #[0-9a-f]{6}\); \}/.test(CSS), 'un ambre à lui en thème clair');
});
