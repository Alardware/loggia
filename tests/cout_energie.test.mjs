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
  /* La ligne épinglée ici lisait `flow_from[0].stat_cost`, la forme ancienne.
   * Les versions récentes posent une source par connexion, et un contrat à
   * deux tarifs porte donc deux coûts : `couts` les ramasse aux deux formats,
   * `seul()` n'en désigne un que s'il est le seul (06/10). Ce qui ne change
   * pas, et que ce test garde : le chiffre vient de Home Assistant. */
  assert.ok(RES.includes('const couts = imports.map(x => x.flux.stat_cost).filter(Boolean);'),
    '`stat_cost` est la statistique que Home Assistant tient lui-même');
  assert.ok(RES.includes('coutJour: seul(couts),'), 'deux coûts : aucun ne vaut pour le tout');
  /* Rien ne se recalcule à partir d'un prix du kWh : Home Assistant connaît les
   * heures creuses et les tarifs multiples, pas nous. */
  /* La DECLARATION seulement, et sur sa ligne : `[^;]*` traversait les retours
   * a la ligne et allait trouver l'etoile du premier commentaire venu — depuis
   * que la carte du Tarif recoit `coutJour={coutJour}`, le motif se declenchait
   * sur du JSX sans point-virgule (07/10). */
  assert.ok(!/const coutJour\s*=\s*[^;\n]*\*/.test(APP), 'aucune multiplication : on reprend le chiffre tel quel');
});

test('il s’affiche, et seulement quand il existe', () => {
  /* `euroJour` plutot que l'etat brut (07/10) : le `stat_cost` que Home
   * Assistant tient est un cumul, pas une journee. Il garde sa devise — c'est
   * de l'argent, rien a ramener en kilowattheures. */
  assert.ok(APP.includes('const coutJour = euroJour(EN.coutJour);'),
    'lu comme ses voisins de la vue Énergie');
  assert.ok(APP.includes('{coutJour != null && ('),
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
