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
  assert.deepEqual(rail, ['attention', 'heure', 'meteo', 'co2', 'moment', 'rappels', 'agenda']);
});

test('l’heure et le CO₂ sont là d’emblée, et sont les seules options (02/10)', () => {
  /* Le calendrier a quitte les widgets presents par defaut, puis les options
   * tout court (decision 0132) : la carte Agenda tient sa place, dessine la
   * semaine AVEC ses evenements, et sa feuille va plus loin que le mois du
   * widget — « retire la du coup elle ne serre plus a rien ». */
  const ajoutees = liste('ACC_AJOUTEES_DEFAUT');
  assert.deepEqual([...ajoutees].sort(), ['co2', 'heure']);
  for (const id of ajoutees) {
    assert.ok(WIDGETS_OPTION.indexOf(id) >= 0, id + ' est propose par defaut sans etre une option');
  }
  assert.equal(WIDGETS_OPTION.indexOf('calendrier'), -1, 'le calendrier n’est plus ajoutable : il n’existe plus');
  // La croix les retire toujours : ils restent dans WIDGETS_OPTION.
  assert.ok(APP.includes('const estOption = (id) => WIDGETS_OPTION.indexOf(id) >= 0;'));
  assert.ok(APP.includes('ajoutees: Array.isArray(v.ajoutees) ? v.ajoutees : [...ACC_AJOUTEES_DEFAUT],'), 'un accueil jamais rangé les reçoit ; un agencement enregistré garde les siens');
});

test('Rappels masqués par défaut, l’Agenda non ; l’heure en tuiles', () => {
  /* L'Agenda s'est demasque le 02/10 : il REMPLACE le calendrier, qui lui
   * s'affichait. Le laisser masque aurait retire une carte a tout le monde. */
  /* Les Rappels se sont demasques le 03/10 : la carte ne porte plus deux
   * lignes qui ne concernaient personne, mais les listes de taches de chacun —
   * et elle n'existe pas sans liste. Plus rien a cacher. */
  assert.deepEqual(liste('ACC_CACHES_DEFAUT'), []);
  assert.ok(APP.includes('caches: Array.isArray(v.caches) ? v.caches : [...ACC_CACHES_DEFAUT],'), 'un masquage enregistré, même vide, reste le sien');
  assert.equal(STYLES_WIDGETS.heure[0], 'tuiles');
  assert.equal(styleDe({}, 'heure'), 'tuiles', 'une heure jamais réglée se montre en tuiles');
  assert.equal(styleDe({}, 'calendrier'), null, 'un widget retire n’a plus de style');
});
