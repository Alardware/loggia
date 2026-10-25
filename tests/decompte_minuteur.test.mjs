/* Le minuteur se DÉCOMPTE (sa demande du 20/10, capture de la fiche d'une lampe :
 * « quand j'active le minuteur, j'aimerais bien avoir le décompte avant extinction »).
 *
 * « S'éteint à 13:21 · dans 15 min » restait figé : la fiche ne recalculait l'heure
 * qu'au relevé des minuteurs (15 s) et n'écrivait que des minutes. Désormais le
 * temps qu'il reste se dit à la SECONDE sous l'heure — « dans 14 min 32 s »,
 * « dans 32 s » —, à la minute au-delà — « dans 1 h 30 » —, et la fiche bat la
 * seconde tant qu'un minuteur tourne. La fiche d'une prise, même panneau, suit. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
const P = await import('../src/prises.js');
const L = await import('../src/lumieresfiche.js');
const lire = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const NB = ' ';
const T = Date.parse('2026-10-20T13:06:28+02:00');
const dans = (s) => T + s * 1000;

test('le temps qu’il reste : à la seconde sous l’heure, à la minute au-delà, jamais négatif', () => {
  assert.equal(P.decompte(dans(872), T), '14 min 32 s');
  assert.equal(P.decompte(dans(32), T), '32 s');
  assert.equal(P.decompte(dans(1800), T), '30 min', 'pile : pas de « 0 s » qui traîne');
  assert.equal(P.decompte(dans(60), T), '1 min');
  assert.equal(P.decompte(dans(3599), T), '59 min 59 s');
  assert.equal(P.decompte(dans(3600), T), '1 h');
  assert.equal(P.decompte(dans(5400), T), '1 h 30');
  assert.equal(P.decompte(dans(5401), T), '1 h 31', 'au-delà de l’heure, la minute entamée compte, comme avant');
  assert.equal(P.decompte(dans(0), T), '0 s');
  assert.equal(P.decompte(dans(-5), T), '0 s');
  // Une fraction de seconde entamée compte pour une seconde entière : le décompte ne saute jamais une seconde.
  assert.equal(P.decompte(dans(872) - 400, T), '14 min 32 s');
});

test('la fiche d’une lampe : « S’éteint à 13:21 · dans 14 min 32 s », le nombre et son unité liés', () => {
  assert.equal(L.phraseMinuteur(dans(872), T), 'S’éteint à 13:21 · dans 14' + NB + 'min' + NB + '32' + NB + 's');
  assert.equal(L.phraseMinuteur(dans(1800), T), 'S’éteint à 13:36 · dans 30' + NB + 'min');
  assert.equal(L.phraseMinuteur(dans(5400), T), 'S’éteint à 14:36 · dans 1' + NB + 'h' + NB + '30');
});

test('la fiche d’une prise, même panneau : « Se coupe à 13:21 · dans 14 min 32 s »', () => {
  const ligne = P.ligneDePrise({ st: { state: 'on', attributes: {} }, mesure: true, watts: 146, minuteur: dans(872), maintenant: T });
  assert.equal(P.phrasePrise(ligne, { longue: true, maintenant: T }), 'Se coupe à 13:21 · dans 14' + NB + 'min' + NB + '32' + NB + 's');
  assert.equal(P.phrasePrise(ligne, { maintenant: T }), 'Se coupe à 13:21', 'la carte garde la forme courte');
});

test('les deux fiches battent la seconde tant qu’un minuteur tourne — et seulement alors', () => {
  for (const f of ['src/fichelumiere.jsx', 'src/ficheprise.jsx']) {
    const src = lire(f);
    assert.ok(src.includes("import { ") && src.includes('useHorloge'), f + ' : l’horloge');
    assert.match(src, /useHorloge\(maintenant == null && !!fin && (v\.on|on)\)/, f + ' : la seconde ne bat que pour un minuteur qui tourne, jamais dans les tests');
  }
});

test('les mots des secondes existent dans les six catalogues', () => {
  for (const lg of ['en', 'de', 'nl', 'it', 'es', 'pl']) {
    const c = lire('src/langues/' + lg + '.js');
    for (const cle of ["'{m} min {s} s':", "'{n} s':"]) assert.ok(c.includes(cle), lg + ' : ' + cle);
  }
});
