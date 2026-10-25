/* Qu'est-ce qu'une prise : le jumeau de l'écran rejoue la fixture partagée
 * avec le serveur (chantier Prises, § 6.2 et 6.4).
 *
 * `tests/fixtures/prises_parite.json` vient du plan 1 (le serveur) : des noms
 * et le type qu'on en tire, des switch et leur verdict. Le jumeau Python la
 * rejoue de son côté (tests/python) ; ici, `typeDePrise` et `estPrise` de
 * src/prises.js. Une règle qui dérive d'un côté se voit ici, cas par cas. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
const { typeDePrise, estPrise, compteursMaison } = await import('../src/prises.js');
const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/prises_parite.json', import.meta.url), 'utf8'));

test('la fixture partagée a des noms et des switch à rejouer', () => {
  assert.ok(Array.isArray(FIXTURE.types) && FIXTURE.types.length > 0, 'aucun nom');
  assert.ok(Array.isArray(FIXTURE.prises) && FIXTURE.prises.length > 0, 'aucun switch');
});

test('le type d’un nom : celui que trouve le serveur', () => {
  for (const c of FIXTURE.types) assert.equal(typeDePrise(c.nom, c.impose, c.indice), c.attendu, JSON.stringify(c));
});

test('ce qu’est une prise, et ses capteurs : le verdict du serveur, cas par cas', () => {
  for (const c of FIXTURE.prises) {
    const verdict = estPrise({ entite: c.entite, appareil: c.appareil, soeurs: c.soeurs, lumiere: c.lumiere, filPilote: c.fil_pilote, sirene: c.sirene, compteurs: c.compteurs });
    assert.deepEqual(verdict, c.attendu, c.cas);
  }
});

/* Les compteurs de la maison (décision du 19/10) : les capteurs que le tableau
 * de bord Énergie déclare sources — réseau, solaire, batterie, gaz. Leur
 * appareil n'a pas de prise : le relais d'un Shelly EM, le poêle posé sur
 * l'appareil qui porte l'énergie de toute la maison. */
test('les compteurs de la maison, lus dans les préférences énergie : ceux du serveur', () => {
  assert.ok(Array.isArray(FIXTURE.compteurs) && FIXTURE.compteurs.length > 0, 'aucunes préférences');
  for (const c of FIXTURE.compteurs) assert.deepEqual(compteursMaison(c.prefs), c.attendu, c.cas);
});

test('un Set de compteurs vaut la liste', () => {
  const c = FIXTURE.prises.find(x => x.compteurs && !x.attendu.prise);
  const verdict = estPrise({ entite: c.entite, appareil: c.appareil, soeurs: c.soeurs, compteurs: new Set(c.compteurs) });
  assert.deepEqual(verdict, c.attendu, c.cas);
});
