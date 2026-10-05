// Le coût du jour (05/10).
//
// `resolveEnergy` le résolvait depuis le tableau de bord Énergie de Home
// Assistant (`stat_cost`) et PERSONNE ne le lisait : on allait le chercher, on
// le rangeait dans l'index, et il mourait là. Même défaut que les étages.
//
// Home Assistant le calcule lui-même, heures creuses et tarifs multiples
// compris : on reprend son chiffre, on n'en refait pas un.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const APP = lire('src', 'App.jsx');
const RES = lire('src', 'resolve.js');

test('le coût vient du tableau de bord Énergie, pas d’un calcul maison', () => {
  assert.ok(RES.includes("coutJour: (from && from.stat_cost) || null,"),
    '`stat_cost` est la statistique que Home Assistant tient lui-même');
  /* Rien ne se recalcule à partir d'un prix du kWh : Home Assistant connaît les
   * heures creuses et les tarifs multiples, pas nous. */
  assert.ok(!/coutJour\s*=\s*[^;]*\*/.test(APP), 'aucune multiplication : on reprend le chiffre tel quel');
});

test('il s’affiche, et seulement quand il existe', () => {
  assert.ok(APP.includes('const coutJour = avail(EN.coutJour) ? num(EN.coutJour) : null;'),
    'lu comme ses voisins de la vue Énergie');
  assert.ok(APP.includes('{coutJour != null && <div>'),
    'sans tarif déclaré, `stat_cost` n’existe pas : rien ne s’affiche — ni zéro, ni tiret');
  assert.ok(APP.includes("{tr('Coût du jour')}"), 'son libellé passe par le catalogue');
});

test('la devise vient de Home Assistant, jamais supposée en euros', () => {
  assert.ok(APP.includes("const uniteDe = (id) => (id && S[id] && S[id].attributes && S[id].attributes.unit_of_measurement) || null;"),
    'l’unité se lit sur l’entité');
  assert.ok(APP.includes('const deviseJour = uniteDe(EN.coutJour) || uniteDe(EN.ecoJour)'),
    'celle du coût d’abord, puis celle de l’économie');
  assert.ok(APP.includes("|| (hass && hass.config && hass.config.currency) || '€';"),
    'puis celle de l’installation — l’euro n’est que le dernier recours');
});

test('la démonstration le montre, avec son unité', () => {
  const DEMO = lire('src', 'demo.js');
  assert.ok(DEMO.includes("coutJour: 'sensor.cout_du_jour',"), 'désigné dans la configuration d’énergie');
  assert.ok(DEMO.includes("device_class: 'monetary'"), 'un capteur monétaire, comme en vrai');
  assert.ok(/'sensor\.cout_du_jour': s\([\d.]+, \{ friendly_name: etiquette\('Coût du jour'\)/.test(DEMO),
    'son nom passe par la table des étiquettes : la démo parle les sept langues');
});
