// Le petit sapin de fin d'année (ADR 0342) : quand il paraît, ce qu'il compte,
// et qu'il ne se pose qu'à ses deux places, jamais sur les cartes ni le ciel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { joursAvantNoel, saisonNoel } from '../src/saison.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(join(RACINE, f), 'utf8');

test('le compte des jours jusqu’au 25 décembre', () => {
  assert.equal(joursAvantNoel(new Date(2026, 10, 10, 14, 30)), 45);
  assert.equal(joursAvantNoel(new Date(2026, 11, 24, 23, 59)), 1);
  assert.equal(joursAvantNoel(new Date(2026, 11, 25, 0, 1)), 0);
  // Le passage à l'heure d'hiver (fin octobre) ne retire pas un jour.
  assert.equal(joursAvantNoel(new Date(2026, 9, 24, 12)), 62);
});

test('il paraît du 1er novembre au 25 décembre, pas avant, pas après', () => {
  assert.equal(saisonNoel(new Date(2026, 9, 31, 23, 59)), null);
  assert.deepEqual(saisonNoel(new Date(2026, 10, 1, 0, 0)), { jours: 54 });
  assert.deepEqual(saisonNoel(new Date(2026, 10, 10)), { jours: 45 });
  assert.deepEqual(saisonNoel(new Date(2026, 11, 25, 20)), { jours: 0 });
  assert.equal(saisonNoel(new Date(2026, 11, 26)), null);
  assert.equal(saisonNoel(new Date(2027, 0, 2)), null);
  assert.equal(saisonNoel(new Date(2027, 6, 14)), null);
  assert.equal(saisonNoel(new Date('pas une date')), null);
});

test('deux places seulement : la date de l’en-tête et le bonjour de l’Accueil', () => {
  assert.match(lire('src/chrome/entete.jsx'), /<SapinNoel[^>]*className="o-noel-entete"/);
  assert.match(lire('src/accueil/dashboard.jsx'), /\{salut\}<SapinNoel className="o-noel-salut"/);
  const css = lire('src/index.css');
  // Jamais les deux à la fois : celui du bonjour ne paraît que là où la date de l'en-tête s'efface.
  assert.match(css, /\.o-noel-salut \{ display: none; \}/);
  assert.match(css, /@media \(max-width: 560px\) \{[^}]*\.o-noel-entete/);
  assert.match(css, /\.o-noel-salut \{ display: inline-flex; \}/);
});

test('rien qui bouge, aucune couleur écrite en dur, le texte dit par les langues', () => {
  const src = lire('src/sapin.jsx');
  assert.doesNotMatch(src, /animation|@keyframes|setInterval|requestAnimationFrame/);
  assert.doesNotMatch(src, /#[0-9a-fA-F]{3,6}\b/);
  for (const cle of ['J-1', 'J-{n}', 'Noël demain', 'Noël dans {n} jours', 'Joyeux Noël']) {
    assert.ok(src.includes(`'${cle}'`), cle);
    for (const l of ['en', 'de', 'nl', 'it', 'es', 'pl']) assert.ok(lire(`src/langues/${l}.js`).includes(`'${cle}':`), `${l} : ${cle}`);
  }
});
