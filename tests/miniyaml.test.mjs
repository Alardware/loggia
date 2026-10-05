// Lire la configuration d'une carte Lovelace (05/10).
//
// On colle du YAML, parce que c'est ce que donnent la documentation des cartes
// et l'éditeur de Home Assistant. Pas de bibliothèque : le paquet versionné
// pèse déjà un mégaoctet, et une configuration de carte n'emploie qu'un coin
// du langage.
//
// Ce qui n'est pas lu doit être REFUSÉ, pas deviné : une configuration mal
// comprise donnerait une carte fausse, ce qui est pire qu'un refus.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lireScalaire, lireConfig } from '../src/miniyaml.js';

test('les scalaires : ce qui est cité reste du texte', () => {
  assert.equal(lireScalaire('tile'), 'tile');
  assert.equal(lireScalaire('42'), 42);
  assert.equal(lireScalaire('-3.5'), -3.5);
  assert.equal(lireScalaire('true'), true);
  assert.equal(lireScalaire('false'), false);
  assert.equal(lireScalaire('null'), null);
  assert.equal(lireScalaire('~'), null);
  assert.equal(lireScalaire('"42"'), '42', 'entre guillemets, un nombre est du texte');
  assert.equal(lireScalaire("'true'"), 'true');
  // Deux pièges classiques : une version et une heure ne sont pas des nombres.
  assert.equal(lireScalaire('1.2.3'), '1.2.3');
  assert.equal(lireScalaire('08:00'), '08:00');
  assert.deepEqual(lireScalaire('[a, 2, true]'), ['a', 2, true]);
  assert.deepEqual(lireScalaire('[]'), []);
  assert.equal(lireScalaire(''), null);
});

test('une configuration de carte, telle qu’on la copie', () => {
  const r = lireConfig('type: tile\nentity: light.salon\nvertical: true');
  assert.equal(r.ok, true);
  assert.deepEqual(r.config, { type: 'tile', entity: 'light.salon', vertical: true });
});

test('l’imbrication et les listes', () => {
  const r = lireConfig([
    'type: custom:mini-graph-card',
    'entities:',
    '  - sensor.temperature',
    '  - entity: sensor.humidite',
    '    name: Humidité',
    'show:',
    '  labels: true',
    '  extrema: false',
  ].join('\n'));
  assert.equal(r.ok, true);
  assert.equal(r.config.type, 'custom:mini-graph-card');
  assert.deepEqual(r.config.entities, ['sensor.temperature', { entity: 'sensor.humidite', name: 'Humidité' }]);
  assert.deepEqual(r.config.show, { labels: true, extrema: false });
});

test('les commentaires s’en vont, sauf dans une chaîne', () => {
  const r = lireConfig('# la carte du salon\ntype: tile  # le type\nname: "Salon #1"');
  assert.equal(r.ok, true);
  assert.deepEqual(r.config, { type: 'tile', name: 'Salon #1' });
});

test('le JSON passe aussi — c’est du YAML, et JSON.parse le fait mieux', () => {
  const r = lireConfig('{"type":"tile","entity":"light.salon"}');
  assert.equal(r.ok, true);
  assert.deepEqual(r.config, { type: 'tile', entity: 'light.salon' });
  assert.equal(lireConfig('[1,2]').ok, false, 'une liste n’est pas une carte');
  assert.equal(lireConfig('{bancal').raison, 'syntaxe');
});

test('ce qui ne se lit pas est REFUSÉ, jamais deviné', () => {
  assert.deepEqual(lireConfig(''), { ok: false, raison: 'vide' });
  assert.deepEqual(lireConfig('   \n\n'), { ok: false, raison: 'vide' });
  assert.equal(lireConfig('juste une phrase').raison, 'syntaxe', 'pas de paire clé/valeur');
  assert.equal(lireConfig('- a\n- b').raison, 'objet', 'une liste n’est pas une carte');
  // Rien ne doit jamais remonter sous forme d'exception jusqu'à la vue.
  for (const t of [null, undefined, 42, {}, '\t\t', 'a:\n  - x\n - y']) {
    assert.doesNotThrow(() => lireConfig(t), 'lireConfig ne lève jamais');
  }
});

test('un aller-retour garde la configuration intacte', () => {
  const texte = 'type: custom:apexcharts-card\nheader:\n  show: true\n  title: Consommation\nseries:\n  - entity: sensor.conso\n    name: Maison';
  const r = lireConfig(texte);
  assert.equal(r.ok, true);
  // C'est cet objet-là que `CarteLovelace` passe à Home Assistant.
  assert.deepEqual(r.config, {
    type: 'custom:apexcharts-card',
    header: { show: true, title: 'Consommation' },
    series: [{ entity: 'sensor.conso', name: 'Maison' }],
  });
});
