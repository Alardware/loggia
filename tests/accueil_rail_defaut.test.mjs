// ─────────────────────────────────────────────────────────────────────────────
// Le côté de l'Accueil PAR DÉFAUT : celui de la capture du 19/09.
//
// « Par défaut, avec bien sûr À surveiller tout en haut » : À surveiller,
// l'heure (en tuiles), la météo, le CO₂, En ce moment, le calendrier ; Rappels
// et Agenda suivent, masqués. Un agencement enregistré reste le sien. Voir
// l'ADR 0058.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true });
const { WIDGETS_OPTION, STYLES_WIDGETS, styleDe } = await import('../src/horloge.js');

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8').replace(/\r\n/g, '\n');
const liste = (nom) => {
  const m = APP.match(new RegExp('\\nconst ' + nom + ' = (\\[[^\\]]*\\]);'));
  assert.ok(m, nom + ' introuvable');
  return JSON.parse(m[1].replace(/'/g, '"'));
};

test('l’ordre de la capture, À surveiller tout en haut', () => {
  const rail = liste('ACC_RAIL');
  assert.equal(rail[0], 'attention', 'À surveiller n’est plus en tête');
  assert.deepEqual(rail, ['attention', 'heure', 'meteo', 'co2', 'moment', 'calendrier', 'rappels', 'agenda']);
});

test('l’heure, le CO₂ et le calendrier sont là d’emblée — et restent en option', () => {
  const ajoutees = liste('ACC_AJOUTEES_DEFAUT');
  assert.deepEqual([...ajoutees].sort(), [...WIDGETS_OPTION].sort(), 'un widget en option manque, ou n’en est pas un');
  // La croix les retire toujours : ils restent dans WIDGETS_OPTION.
  assert.ok(APP.includes('const estOption = (id) => WIDGETS_OPTION.indexOf(id) >= 0;'));
  assert.ok(APP.includes('ajoutees: Array.isArray(v.ajoutees) ? v.ajoutees : [...ACC_AJOUTEES_DEFAUT],'), 'un accueil jamais rangé les reçoit ; un agencement enregistré garde les siens');
});

test('Rappels et Agenda masqués par défaut ; l’heure en tuiles', () => {
  assert.deepEqual(liste('ACC_CACHES_DEFAUT'), ['rappels', 'agenda']);
  assert.ok(APP.includes('caches: Array.isArray(v.caches) ? v.caches : [...ACC_CACHES_DEFAUT],'), 'un masquage enregistré, même vide, reste le sien');
  assert.equal(STYLES_WIDGETS.heure[0], 'tuiles');
  assert.equal(styleDe({}, 'heure'), 'tuiles', 'une heure jamais réglée se montre en tuiles');
  assert.equal(styleDe({}, 'calendrier'), 'semaine');
});
