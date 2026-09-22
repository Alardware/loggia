// ─────────────────────────────────────────────────────────────────────────────
// Les catalogues de traduction, tenus par rapport a l'anglais.
//
// Un catalogue peut etre incomplet — une cle absente retombe sur le filet
// anglais, puis sur le francais. Ce qu'il ne peut pas etre : faux. Une cle qui
// n'existe plus dans `en.js` ne sera jamais lue et pourrit le fichier a chaque
// rebase ; un repere perdu (`{n}`, `{h}`) affiche une phrase trouee a l'ecran,
// et c'est invisible tant que personne ne lit cette langue.
//
// Le test parcourt tout `src/langues/` : la langue ajoutee demain est couverte
// sans y toucher.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
const DOSSIER = join(ICI, '..', 'src', 'langues');

const catalogues = readdirSync(DOSSIER).filter(f => f.endsWith('.js'));
const charger = async (f) => (await import(join(DOSSIER, f))).default;

const EN = await charger('en.js');

/** Les reperes d'une phrase : `{n}`, `{h}`, `{nom}` — sans l'ordre. */
const reperes = (s) => new Set(String(s).match(/\{[a-zA-Z_][a-zA-Z0-9_]*\}/g) || []);

test('il y a au moins l\'anglais', () => {
  assert.ok(catalogues.includes('en.js'));
  assert.ok(Object.keys(EN).length > 1000);
});

for (const fichier of catalogues) {
  const langue = fichier.replace(/\.js$/, '');

  test(`${langue} : chaque valeur est une chaine non vide`, async () => {
    const cat = await charger(fichier);
    for (const [cle, valeur] of Object.entries(cat)) {
      assert.equal(typeof valeur, 'string', `${langue} : ${cle} n'est pas une chaine`);
      assert.notEqual(valeur.trim(), '', `${langue} : ${cle} est vide`);
    }
  });

  test(`${langue} : chaque cle existe dans en.js`, async () => {
    const cat = await charger(fichier);
    const orphelines = Object.keys(cat).filter(c => !(c in EN));
    assert.deepEqual(orphelines, [], `${langue} : cles absentes de en.js`);
  });

  test(`${langue} : les reperes de la cle se retrouvent dans la valeur`, async () => {
    const cat = await charger(fichier);
    const trouees = [];
    for (const [cle, valeur] of Object.entries(cat)) {
      const attendus = reperes(cle);
      const obtenus = reperes(valeur);
      const manquants = [...attendus].filter(r => !obtenus.has(r));
      const inventes = [...obtenus].filter(r => !attendus.has(r));
      if (manquants.length || inventes.length) trouees.push({ cle, manquants, inventes });
    }
    assert.deepEqual(trouees, [], `${langue} : reperes perdus ou inventes`);
  });
}
