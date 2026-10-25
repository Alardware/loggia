// ─────────────────────────────────────────────────────────────────────────────
// Le hash du ciel, mesuré comme on l'a mesuré pour trouver la panne (ticket
// #25 : « le ciel se casse en rectangles sur téléphone », ADR 0180).
//
// Le hash multiplie la coordonnée par plusieurs centaines avant `fract`. Or
// `fbm` la fait grandir à chaque octave, et le vent y ajoute le temps : elle
// grandit sans fin. Passé un certain ordre de grandeur, le float n'a plus de
// quoi distinguer deux cases voisines — elles rendent la même valeur, et le
// ciel se casse en rectangles plats.
//
// Le 17/10, le ciel a changé (handoff « Loggia themes redesign », src/ciel.js) :
// autre hash (123.34, 456.21), autre fbm (une rotation-échelle au lieu de
// p*2.02 + 11.3). Le handoff a repris le correctif de la PR #28 — le repli à
// 256 avant le hash, dans `hn` — et ce test refait la mesure sur le NOUVEAU
// shader : combien de valeurs DISTINCTES le hash rend-il sur 256 points, en
// float32 strict ? Sans repli, une après une journée de vent. Avec, le maximum
// atteignable.
//
// La simulation lit ses constantes dans le shader : si elles bougent, le test
// suit au lieu de mentir.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'ciel.js'), 'utf8');

test('la coordonnée est repliée avant d’être hachée, et tout le bruit passe par le repli', () => {
  assert.match(src, /float hn\(vec2 p\)\{return hash\(mod\(p,256\.\)\);\}/,
    'sans repli, le hash s’effondre sur les grandes coordonnées');
  const bruit = src.match(/float noise\(vec2 p\)\{([^\n]*)\}/);
  assert.ok(bruit, 'noise() doit exister');
  assert.equal((bruit[1].match(/\bhn\(/g) || []).length, 4, 'les quatre coins du bruit passent par le repli');
  assert.ok(!/\bhash\(/.test(bruit[1]), 'un coin du bruit hache sans replier : c’est lui qui casserait en rectangles');
});

test('le temps du shader tourne en rond, et le vent repart quand personne ne regarde', () => {
  assert.ok(src.includes('gl.uniform1f(u.uTime, t % 3600)'), 'uTime grandit sans fin');
  assert.ok(src.includes('if (this.drift > 1000) this.drift = Math.random() * 8;'), 'la dérive du vent grandit sans fin (tests/lot14_webgl le vérifie en marche)');
});

/** Le float32 du GPU, opération par opération — `Math.fround` à chaque étape. */
const f = Math.fround;
const fract = (x) => f(x - Math.floor(x));

/** Les deux multiplicateurs et la constante, lus dans le shader. */
const [mx, my, k] = (() => {
  const m = src.match(/float hash\(vec2 p\)\{p=fract\(p\*vec2\(([\d.]+),([\d.]+)\)\);p\+=dot\(p,p\+([\d.]+)\);return fract\(p\.x\*p\.y\);\}/);
  assert.ok(m, 'le hash doit être lisible');
  return [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])];
})();

const hash = (px, py) => {
  let x = fract(f(px * mx)), y = fract(f(py * my));
  const d = f(f(x * f(x + k)) + f(y * f(y + k)));
  x = f(x + d); y = f(y + d);
  return fract(f(x * y));
};
const mod = (x, y) => f(x - f(y * Math.floor(f(x / y))));
const hn = (px, py, replie) => (replie ? hash(mod(px, 256), mod(py, 256)) : hash(px, py));
// L'octave suivante : m*p, avec mat2(1.6,1.2,-1.2,1.6) — colonnes en GLSL.
const rot = (x, y) => [f(f(1.6 * x) - f(1.2 * y)), f(f(1.2 * x) + f(1.6 * y))];

/** Combien de valeurs distinctes sur 256 cases voisines, à la cinquième octave (OCT 5, niveau « plein »). */
const distinctes = (base, replie) => {
  const vues = new Set();
  for (let i = 0; i < 256; i++) {
    let x = f(base + i), y = f(0.37 * i + 2.1);
    for (let o = 0; o < 4; o++) [x, y] = rot(x, y);
    vues.add(hn(Math.floor(x), Math.floor(y), replie));
  }
  return vues.size;
};

// Le vent le plus fort (« vent », 1) pousse de 0,1005 par seconde ; le nuage le lit ×1,6.
const VENT = 0.1005 * 1.6;
const APRES = { 'à l’ouverture': 0, 'après une heure': 3600, 'après une journée': 86400, 'après une semaine': 604800 };

test('sans repli, le hash s’effondre avec le temps', () => {
  // Ce test ne protège rien : il documente la panne, pour que le repli ne
  // soit pas retiré un jour comme une coquetterie.
  assert.ok(distinctes(13 + VENT * APRES['après une journée'], false) < 20,
    'après une journée de vent, le hash non replié rend une poignée de valeurs');
});

test('replié, le hash tient quelle que soit la durée', () => {
  for (const [quand, s] of Object.entries(APRES)) {
    const n = distinctes(13 + VENT * s, true);
    assert.ok(n > 230, `${quand} : seulement ${n} valeurs distinctes sur 256`);
  }
});
