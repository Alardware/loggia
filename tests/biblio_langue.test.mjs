// ─────────────────────────────────────────────────────────────────────────────
// La Bibliothèque de cartes parle la langue de l'écran (relecture du 03/10).
//
// Paramètres → Vues → « Bibliothèque de cartes » s'ouvre sur une VRAIE
// installation, pour tout le monde. Ses intitulés passaient par `tr()`, pas
// ses données fictives : sur une page anglaise, le lave-linge consommait
// « 0,6 kWh », « À surveiller » disait « Séjour · 1480 ppm » et « Garage ·
// 1 h 49 », le widget CO₂ « Séjour », et les cartes s'appelaient « Lampe
// salon », « Thermostat séjour », « Volet chambre ». Aucun filet ne les
// voyait : `rien_en_francais` lit le texte du JSX et quatre attributs, pas
// les props d'un composant ni les champs d'un objet.
//
// Ce fichier lit `biblioStates`, `SCN_BIBLIO` et `BiblioView` dans App.jsx,
// comme `demo_noms` lit demo.js. Restent tels quels les prénoms et la plante
// (« Monstera », un nom de genre).
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
const LANGUES = ['en', 'de', 'nl', 'it', 'es', 'pl'];
const CATALOGUES = {};
for (const l of LANGUES) CATALOGUES[l] = (await import(pathToFileURL(join(RACINE, 'src', 'langues', l + '.js')).href)).default;

/** Un morceau d'App.jsx, de `debut` à la première `fin` qui suit. */
const bloc = (debut, fin) => {
  const i = app.indexOf(debut);
  assert.ok(i >= 0, debut.trim() + ' introuvable');
  const j = app.indexOf(fin, i + debut.length);
  assert.ok(j > i, 'la fin de ' + debut.trim() + ' est introuvable');
  return app.slice(i, j);
};
const ETATS = bloc('\nfunction biblioStates() {', '\n}\n');
const SCENARIO = bloc('\nconst SCN_BIBLIO = () => ({', '\n});\n');
const VUE = bloc('\nfunction BiblioView() {', '\n}\n');

// Un littéral entre apostrophes, ou entre guillemets quand il en porte une.
const LIT = String.raw`(?:'([^'\n]*)'|"([^"\n]*)")`;
/* Ce qui se lit pareil dans toutes les langues. Ajouter un nom ici, c'est
 * affirmer qu'il se lit pareil en polonais. */
const TELS_QUELS = new Set(['Camille', 'Alex', 'Marie', 'Sam', 'Noa', 'Lou', 'Éli', 'Maé', 'Zoé', 'Tom', 'Ana', 'Monstera']);
/** Les clés auxquelles manque au moins une des six langues. */
const sansTraduction = (cles) => [...cles].filter(k => LANGUES.some(l => {
  const v = CATALOGUES[l][k];
  return typeof v === 'string' ? !v.trim() : !(v && typeof v === 'object');
}));

test('chaque nom de la maison fictive passe par tr(), sa clé dans les six langues', () => {
  const tous = [...ETATS.matchAll(/friendly_name: /g)].length;
  const lus = [...ETATS.matchAll(new RegExp(String.raw`friendly_name: (tr\()?` + LIT, 'g'))];
  assert.ok(tous > 40, 'la lecture de biblioStates a échoué');
  assert.equal(lus.length, tous, 'un friendly_name ni littéral ni tr(…) : ce test ne sait pas le lire');
  const enClair = lus.filter(m => !m[1]).map(m => m[2] ?? m[3]).filter(n => !TELS_QUELS.has(n));
  assert.deepEqual(enClair, [], 'à écrire tr(…) : ces noms restaient en français dans toutes les langues');
  const cles = new Set(lus.filter(m => m[1]).map(m => m[2] ?? m[3]));
  assert.ok(cles.size > 20, 'les noms traduits ne sont plus lus');
  assert.deepEqual(sansTraduction(cles), [], 'sans entrée au catalogue, tr() rend le français');
});

test('les textes que la Bibliothèque passe à ses cartes parlent la langue de l’écran', () => {
  /* Les props textuelles des cartes et les champs d'objet qui les
   * nourrissent : un littéral n'y est permis que s'il se lit pareil partout. */
  const PROPS = new RegExp(String.raw`\b(nom|name|piece|sous|sub|etat|label|titre|conso|restant)(?:=|: )` + LIT, 'g');
  const enClair = [...(SCENARIO + VUE).matchAll(PROPS)]
    .filter(m => !TELS_QUELS.has(m[2] ?? m[3]))
    .map(m => m[1] + ' : ' + (m[2] ?? m[3]));
  assert.deepEqual(enClair, [], 'à écrire tr(…), ou dec() pour un nombre');
  // Les quatre fuites relevées, nommées : qu'une revienne, on sait laquelle.
  assert.ok(VUE.includes("conso={dec(0.6, 1) + ' kWh'}"), 'le lave-linge : la virgule ou le point selon la langue');
  assert.ok(VUE.includes("sous: tr('Garage') + ' · ' + tr('{h} h {m}', { h: 1, m: 49 })"), 'le garage de « À surveiller »');
  assert.ok(VUE.includes("sous: tr('Séjour') + ' · ' + tr('{v} ppm', { v: 1480 })"), 'le CO₂ de « À surveiller »');
  assert.ok(VUE.includes("capteur={{ id: 'sensor.biblio_co2', nom: tr('CO₂ séjour'), piece: tr('Séjour'), valeur: 640 }}"), 'le widget CO₂ du rail');
});
