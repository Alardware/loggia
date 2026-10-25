// ─────────────────────────────────────────────────────────────────────────────
// Les étoiles scintillent, elles ne clignotent pas (18/10).
//
// « Elles doivent scintiller, pas clignoter. Actuellement elles clignotent
// toutes en même temps. » Le shader du handoff tirait le rythme d'une étoile
// du nombre qui la fait paraître : `step(.985, r)` ne garde que les cases où
// r ≥ 0,985 — toutes les étoiles visibles avaient donc la même fréquence
// (1 + 3r ≈ 4) et la même phase (40r, à 0,6 rad près), et passaient ensemble
// de 10 à 100 % de leur éclat.
//
// Le test refait le calcul sur les étoiles qui PARAISSENT vraiment (le hash et
// les constantes du scintillement sont lus dans src/ciel.js) et mesure la
// corrélation entre leurs éclats au fil du temps : proche de 1, elles
// clignotent ensemble ; proche de 0, chacune vit à son rythme.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'ciel.js'), 'utf8');
const f = Math.fround;
const fract = (x) => f(x - Math.floor(x));
const N = '([\\d.]+)';

/** Le hash du shader, constantes lues dans la source (comme tests/wx3d_hash). */
const hash = (() => {
  const m = src.match(/float hash\(vec2 p\)\{p=fract\(p\*vec2\(([\d.]+),([\d.]+)\)\);p\+=dot\(p,p\+([\d.]+)\);return fract\(p\.x\*p\.y\);\}/);
  assert.ok(m, 'le hash doit être lisible');
  const [mx, my, k] = [1, 2, 3].map((i) => parseFloat(m[i]));
  return (px, py) => {
    let x = fract(f(px * mx)), y = fract(f(py * my));
    const d = f(f(x * f(x + k)) + f(y * f(y + k)));
    x = f(x + d); y = f(y + d);
    return fract(f(x * y));
  };
})();

/* Les tirages propres à chaque étoile, et les constantes du scintillement. */
const tirages = src.match(new RegExp('float r2=hash\\(gi\\+' + N + '\\),r3=hash\\(gi\\+' + N + '\\),kh=' + N + '\\/3600\\.;'));
assert.ok(tirages, 'chaque étoile doit tirer son rythme à part (r2, r3), pas du nombre qui la fait paraître');
const [d2, d3, tour] = [1, 2, 3].map((i) => parseFloat(tirages[i]));
const kh = tour / 3600;
const c = src.match(new RegExp('star\\*=' + N + '\\+' + N + '\\*\\(' + N + '\\*sin\\(uTime\\*kh\\*floor\\(' + N + '\\+r2\\*' + N + '\\)\\+r3\\*' + N + '\\)\\+'
  + N + '\\*sin\\(uTime\\*kh\\*floor\\(' + N + '\\+r3\\*' + N + '\\)\\+r2\\*' + N + '\\)\\);'));
assert.ok(c, 'le scintillement des étoiles doit être lisible');
const [base, ampl, a1, f1, e1, p1, a2, f2, e2, p2] = c.slice(1).map(parseFloat);

const NOUVEAU = (t, e) => base + ampl * (a1 * Math.sin(t * kh * Math.floor(f1 + e.r2 * e1) + e.r3 * p1)
  + a2 * Math.sin(t * kh * Math.floor(f2 + e.r3 * e2) + e.r2 * p2));
const ANCIEN = (t, e) => 0.55 + 0.45 * Math.sin(t * (1 + e.r * 3) + e.r * 40);

/** Les étoiles qui paraissent : r ≥ 0,985, comme `step(.985, r)`. */
const ETOILES = (() => {
  const vues = [];
  for (let y = 0; y < 90 && vues.length < 40; y++) for (let x = 0; x < 300 && vues.length < 40; x++) {
    const r = hash(x, y);
    if (r >= 0.985) vues.push({ r, r2: hash(x + d2, y + d2), r3: hash(x + d3, y + d3) });
  }
  return vues;
})();

const serie = (eclat, e, t0 = 0, d = 10) => { const s = []; for (let t = t0; t < t0 + d; t += 0.05) s.push(eclat(t, e)); return s; };
const correlation = (a, b) => {
  const ma = a.reduce((x, y) => x + y) / a.length, mb = b.reduce((x, y) => x + y) / b.length;
  let n = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return n / Math.sqrt(da * db);
};
const ensemble = (eclat, t0) => {
  const S = ETOILES.map((e) => serie(eclat, e, t0));
  let somme = 0, paires = 0;
  for (let i = 0; i < S.length; i++) for (let j = i + 1; j < S.length; j++) { somme += correlation(S[i], S[j]); paires++; }
  return somme / paires;
};

test('l’ancien scintillement : toutes les étoiles pulsent ensemble, de 10 à 100 %', () => {
  // Ce test ne protège rien : il documente le défaut, pour qu'on ne revienne
  // pas un jour au rythme tiré de r. Mesuré : corrélation 0,93 sur les dix
  // premières secondes — à l'ouverture, et de nouveau à chaque heure, quand
  // uTime repart de zéro —, puis la phase se disperse, mais le tempo reste le
  // même pour toutes : une pulsation toutes les 1,57 à 1,59 s.
  assert.equal(ETOILES.length, 40, 'pas assez d’étoiles visibles pour mesurer');
  assert.ok(ensemble(ANCIEN, 0) > 0.9, 'les étoiles étaient synchronisées à l’ouverture');
  const periodes = ETOILES.map((e) => 2 * Math.PI / (1 + 3 * e.r));
  assert.ok(Math.max(...periodes) - Math.min(...periodes) < 0.02, 'elles avaient toutes le même tempo');
});

test('chaque étoile scintille à son rythme : leurs éclats ne se suivent pas', () => {
  for (const t0 of [0, 1800]) { // à l'ouverture (et à chaque heure), puis au milieu de l'heure
    const m = ensemble(NOUVEAU, t0);
    assert.ok(Math.abs(m) < 0.15, 'à ' + t0 + ' s, corrélation moyenne ' + m.toFixed(2) + ' : les étoiles clignotent encore ensemble');
  }
});

test('l’éclat varie sans s’éteindre : un scintillement, pas un clignotement', () => {
  let bas = 1, haut = 0;
  for (const e of ETOILES) for (const v of serie(NOUVEAU, e, 0, 60)) { bas = Math.min(bas, v); haut = Math.max(haut, v); }
  assert.ok(bas >= 0.4, 'une étoile descend à ' + bas.toFixed(2) + ' de son éclat : elle clignote');
  assert.ok(haut - bas >= 0.25, 'l’éclat ne varie que de ' + (haut - bas).toFixed(2) + ' : plus de scintillement du tout');
});

test('le temps du shader revient à zéro chaque heure sans faire sauter les étoiles', () => {
  // uTime = t % 3600 : des périodes entières sur l'heure rendent la remise à
  // zéro invisible ; avec des fréquences quelconques, toutes les étoiles
  // changeaient d'éclat au même instant, une fois par heure.
  assert.ok(Math.abs(tour - 2 * Math.PI) < 1e-6, 'un tour par heure : 2π exact, sinon chaque étoile saute un peu à la remise à zéro');
  for (const e of ETOILES) {
    const saut = Math.abs(NOUVEAU(3600 - 1e-4, e) - NOUVEAU(0, e));
    assert.ok(saut < 0.005, 'saut de ' + saut.toFixed(3) + ' à la remise à zéro de l’heure');
  }
});
