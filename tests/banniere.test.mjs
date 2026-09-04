// ─────────────────────────────────────────────────────────────────────────────
// La bannière ne montre que ce qui se passe.
//
// « 0 / 4 ouvrants ouverts » occupe une place et ne demande rien. Chaque
// compteur disparaît donc à zéro — et cela a un prix : ce qui apparaît et
// disparaît doit être JUSTE à l'instant où on le regarde.
//
// Or `useHass` ne réveille l'accueil que sur les entités qu'on lui désigne.
// Les ouvrants n'y étaient pas : la bannière gardait une fenêtre ouverte à
// l'écran longtemps après sa fermeture. Tant qu'elle affichait « 0 / 4 » en
// permanence, un retard passait pour une valeur ; maintenant qu'elle se cache,
// il devient un mensonge visible. D'où `bannerKeys`, et d'où ce test.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');

/** Le corps d'une fonction ou d'un objet nommé, tel qu'écrit. */
function bloc(entete) {
  const i = src.indexOf(entete);
  assert.notEqual(i, -1, `${entete} introuvable`);
  const fin = src.indexOf('\n};', i);
  assert.notEqual(fin, -1, `fin de ${entete} introuvable`);
  return src.slice(i, fin);
}

test('ce que la bannière compte, l’accueil le surveille', () => {
  const i = src.indexOf('const accueilKeys = [');
  assert.notEqual(i, -1, 'accueilKeys a disparu ou changé de nom');
  const keys = src.slice(i, src.indexOf('];', i));
  assert.ok(keys.includes('bannerKeys()'),
    'bannerKeys() n’est plus dans accueilKeys : la bannière lit des états que rien ne la fait relire');
});

test('bannerKeys lit la MÊME table que la bannière', () => {
  // Une seconde liste de domaines, recopiée, se désynchroniserait au premier
  // ajout — et la métrique nouvelle serait celle qui se fige.
  const b = bloc('const bannerKeys = () => {');
  assert.ok(b.includes('APPAREIL_ACTIF['), 'bannerKeys duplique la liste des domaines au lieu de la lire');
  assert.ok(b.includes('OUVRANT_DCS'), 'bannerKeys ne reconnaît plus les ouvrants');
  assert.ok(b.includes('media_player'), 'bannerKeys ne surveille plus les lecteurs');
  // Pas de préfixe nu : `binary_sensor.` réveillerait l'accueil à chaque
  // détection de mouvement, pour des capteurs que la bannière ne compte pas.
  assert.ok(!/'binary_sensor\.'/.test(b), 'bannerKeys surveille tout binary_sensor. — trop large');
});

test('les domaines « en marche » ne recomptent pas les lumières', () => {
  const t = bloc('const APPAREIL_ACTIF = {');
  for (const dom of ['light:', 'media_player:']) {
    assert.ok(!t.includes(dom), `${dom} est déjà compté ailleurs dans la bannière`);
  }
  // Un robot qui rentre à sa base travaille encore : il n'est pas au repos.
  assert.match(t, /returning/, 'un robot en retour ne compte plus comme actif');
});

test('aucun compteur de la bannière ne s’affiche à zéro', () => {
  const i = src.indexOf('const cases = [];');
  assert.notEqual(i, -1, 'la bannière n’est plus construite en liste');
  const b = src.slice(i, src.indexOf('if (!cases.length)', i));
  for (const [quoi, garde] of [
    ['ouvrants', 'ouvStat.ouverts > 0'],
    ['lumières', 'a.lightsOn > 0'],
    ['médias', 'actifsStat.medias > 0'],
    ['appareils', 'actifsStat.appareils > 0'],
  ]) {
    assert.ok(b.includes(garde), `les ${quoi} s’affichent sans condition (${garde} attendu)`);
  }
});
