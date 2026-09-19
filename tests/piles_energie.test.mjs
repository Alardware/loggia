// ─────────────────────────────────────────────────────────────────────────────
// Les piles et batteries dans la vue Énergie (retour du 19/09).
//
// « Dans Énergie, à la suite des postes de consommation, on pourrait ajouter
// les nouveaux capteurs de batterie, non ? » — les cartes à cinq barres de la
// v3.57.0, toutes au même endroit, la plus basse d'abord. Voir l'ADR 0057.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pilesMaison } from '../src/piles.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');
const APP = lire('src', 'App.jsx');
const e = (state, attributes = {}) => ({ state: String(state), attributes });
const pile = (state, nom) => e(state, { device_class: 'battery', unit_of_measurement: '%', friendly_name: nom });

test('les piles : la classe battery, la plus basse d’abord, les muettes à la fin', () => {
  const S = {
    'sensor.detecteur_fumee_pile': pile(64, 'Détecteur fumée'),
    'sensor.porte_pile': pile(9, 'Porte d’entrée'),
    'sensor.telecommande_pile': pile('unavailable', 'Télécommande'),
    'sensor.telephone_batterie': pile(64, 'Téléphone'),
    'sensor.fenetre_pile': pile('30.5', 'Fenêtre'),
    'sensor.cachee_pile': pile(5, 'Cachée'),
    'sensor.desactivee_pile': pile(3, 'Désactivée'),
    'sensor.salon_temperature': e(21, { device_class: 'temperature' }),
    'binary_sensor.pile_faible': e('on', { device_class: 'battery' }),
    'sensor.pile_texte': e('low', { device_class: 'battery' }),
  };
  // Le registre : une entité masquée, une désactivée — et une de diagnostic,
  // la catégorie de presque toutes les piles Zigbee, qui reste. Le téléphone
  // (l'application Home Assistant, `mobile_app`) sort : « retire les
  // téléphones de la liste des piles » (19/09).
  const meta = (id) => ({ 'sensor.cachee_pile': { hidden: true }, 'sensor.desactivee_pile': { disabled: true }, 'sensor.fenetre_pile': { category: 'diagnostic' }, 'sensor.telephone_batterie': { platform: 'mobile_app' }, 'sensor.detecteur_fumee_pile': { platform: 'mqtt' } })[id] || {};
  assert.deepEqual(pilesMaison(S, meta), [
    { id: 'sensor.porte_pile', niveau: 9 },
    { id: 'sensor.fenetre_pile', niveau: 30.5 },
    { id: 'sensor.detecteur_fumee_pile', niveau: 64 },
    { id: 'sensor.telecommande_pile', niveau: null },
  ]);
  // Égalité de niveau : l'ordre des noms.
  assert.deepEqual(pilesMaison({ 'sensor.b': pile(50, 'Bureau'), 'sensor.a': pile(50, 'Atelier') }).map(p => p.id), ['sensor.a', 'sensor.b']);
  assert.deepEqual(pilesMaison(null), []);
  assert.deepEqual(pilesMaison({ 'sensor.x': pile(50, 'X') }), [{ id: 'sensor.x', niveau: 50 }], 'sans registre, tout compte');
});

test('piles.js est pur : ni React, ni Home Assistant', () => {
  assert.doesNotMatch(lire('src', 'piles.js'), /^import /m);
});

test('la vue Énergie : la section suit les postes, avec la carte standard et la grille des Objets', () => {
  assert.ok(APP.includes("import { pilesMaison } from './piles.js';"));
  const i = APP.indexOf('\nfunction EnergieContent(');
  const vue = APP.slice(i, APP.indexOf('\nfunction ', i + 1));
  assert.ok(vue.includes('const piles = pilesMaison(S, (id) => (LOGGIA_INDEX && LOGGIA_INDEX.entityMeta && LOGGIA_INDEX.entityMeta.get(id)) || {});'), 'les piles, filtrées par le registre');
  assert.ok(vue.indexOf("tr('Postes de consommation')") < vue.indexOf("tr('Piles et batteries')"), 'la section vient après les postes');
  assert.ok(vue.includes('{piles.length > 0 && ('), 'sans pile, pas de section');
  assert.ok(vue.includes('<div className="o-piles grid-objets grid-dense"'), 'la grille des Objets : 176 × 184 au téléphone');
  assert.ok(vue.includes('{piles.map((p, i) => <Anim key={p.id} i={i} base={200}>{dc.card(p.id)}</Anim>)}') && vue.includes('{dc.sheets}'), 'la carte standard, et sa fiche au toucher');
  assert.ok(lire('src', 'langues', 'en.js').includes("'Piles et batteries': 'Batteries',"));
});
