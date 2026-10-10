// ─────────────────────────────────────────────────────────────────────────────
// Le hash du ciel, mesuré comme on l'a mesuré pour trouver la panne.
//
// `hash21` multiplie la coordonnée par ~443 avant `fract`. Or `fbm` fait quatre
// fois p*2.02 + 11.3, et le vent ajoute le temps : la coordonnée grandit sans
// fin. Passé un certain ordre de grandeur, le float n'a plus de quoi
// distinguer deux cases voisines — elles rendent la même valeur, et le ciel
// se casse en rectangles plats. Invisible sur un écran d'ordinateur, franc sur
// un téléphone, et pire à mesure que le tableau reste ouvert.
//
// Le test refait la mesure : combien de valeurs DISTINCTES le hash rend-il sur
// 256 points, en float32 strict ? Sans repli, quatre après une journée. Avec,
// le maximum atteignable.
//
// La simulation lit ses constantes dans le shader : si elles bougent, le test
// suit au lieu de mentir.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'wx3d.jsx'), 'utf8');

test('la coordonnée est repliée avant d’être hachée', () => {
  const corps = src.match(/float hash21\(vec2 p\)\{([\s\S]*?)\n\}/);
  assert.ok(corps, 'hash21 doit exister');
  assert.match(corps[1], /p = mod\(p, 256\.0\);/,
    'sans repli, le hash s’effondre sur les grandes coordonnées');
  assert.ok(corps[1].indexOf('mod(p') < corps[1].indexOf('fract(p'),
    'le repli doit venir AVANT la multiplication, sinon il ne sert à rien');
});

/** Le float32 du GPU, opération par opération — `Math.fround` à chaque étape. */
const f = Math.fround;

/** Les deux multiplicateurs, lus dans le shader. */
const [mx, my] = (() => {
  const m = src.match(/fract\(p \* vec2\(([\d.]+), ([\d.]+)\)\)/);
  assert.ok(m, 'les multiplicateurs de hash21 doivent être lisibles');
  return [parseFloat(m[1]), parseFloat(m[2])];
})();

const hash21 = (px, py, replie) => {
  if (replie) { px = f(px % 256); py = f(py % 256); }
  let qx = f(f(px * mx) % 1), qy = f(f(py * my) % 1);
  const d = f(f(qx * f(qx + 19.19)) + f(qy * f(qy + 19.19)));
  qx = f(qx + d); qy = f(qy + d);
  return f(f(f(qx + qy) * qx) % 1);
};

/** La coordonnée après n octaves de fbm. */
const octave = (p, n) => { for (let i = 0; i < n; i++) p = f(f(p * 2.02) + 11.3); return p; };

/** Combien de valeurs distinctes sur 256 points voisins. */
const distinctes = (base, replie) => {
  const vues = new Set();
  for (let i = 0; i < 256; i++)
    vues.add(hash21(octave(f(base + i), 3), octave(f(base + i * 0.7), 3), replie));
  return vues.size;
};

// Le vent pousse la coordonnée d'environ 0,022 par seconde au preset « cloudy ».
const APRES = { 'à l’ouverture': 0, 'après une heure': 79, 'après une journée': 1901, 'après une semaine': 13300 };

test('sans repli, le hash s’effondre avec le temps', () => {
  // Ce test ne protège rien : il documente la panne, pour que la ligne de repli
  // ne soit pas retirée un jour comme une coquetterie.
  assert.ok(distinctes(13 + APRES['après une journée'], false) < 20,
    'après une journée, le hash non replié rend une poignée de valeurs');
});

test('replié, le hash tient quelle que soit la durée', () => {
  for (const [quand, t] of Object.entries(APRES)) {
    const n = distinctes(13 + t, true);
    assert.ok(n > 240, `${quand} : seulement ${n} valeurs distinctes sur 256`);
  }
});
