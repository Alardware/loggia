// ─────────────────────────────────────────────────────────────────────────────
// Le polonais de Seba882 ne se réécrit pas (03/10).
//
// La traduction polonaise est l'œuvre d'un Polonais, le contributeur GitHub
// Seba882 (PR #3, reprise telle quelle le 23/09 dans c153b83 — ADR 0071).
// L'utilisateur : « c'est un vrai polonais qui a fait la traduction, je ne
// veux pas modifier cette partie ». Le contrôle du 03/10 a trouvé deux de ses
// phrases réécrites sans nécessité par des sessions précédentes ; elles sont
// restaurées, et ce test empêche que cela recommence.
//
// `polonais_seba882.json` porte, pour chacune de ses valeurs encore en usage,
// l'empreinte de la clé et celle de la valeur (SHA-256 tronqué, pas le texte).
// Une valeur RETOUCHÉE fait échouer ce test. Une clé qui DISPARAÎT est permise
// (son texte français a changé ou n'existe plus) : la nouvelle traduction doit
// alors reprendre ses mots là où le sens n'a pas bougé. Pour corriger une de
// ses valeurs, il faut son accord, puis l'empreinte ici.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const pl = (await import(pathToFileURL(join(RACINE, 'src', 'langues', 'pl.js')).href)).default;
const empreintes = JSON.parse(readFileSync(join(RACINE, 'tests', 'polonais_seba882.json'), 'utf8'));
const h = (v) => createHash('sha256').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('hex').slice(0, 16);

test('aucune valeur polonaise de Seba882 n’est retouchée', () => {
  const retouchees = Object.keys(pl).filter(k => h(k) in empreintes && empreintes[h(k)] !== h(pl[k]));
  assert.deepEqual(retouchees, [], 'valeurs de Seba882 réécrites — il faut son accord : ' + retouchees.join(' | '));
});

test('l’empreinte couvre bien sa traduction : plus de deux mille valeurs retrouvées', () => {
  // Sans ce garde-fou, une empreinte calculée autrement rendrait le test
  // ci-dessus toujours vert.
  const retrouvees = Object.keys(pl).filter(k => h(k) in empreintes).length;
  // 1 950 depuis le 01/11 : les mots de l'ancien premier lancement sont partis avec lui — retirés, pas réécrits.
  // 1 900 depuis le 02/11 : les Paramètres sur la maquette v3 ont laissé 64 phrases sans lecteur — retirées, pas réécrites.
  assert.ok(retrouvees > 1900, `seulement ${retrouvees} valeurs retrouvées`);
});

test('ses deux entrées restaurées le 03/10 gardent ses mots', () => {
  assert.equal(pl['+{n} autres'].few, '+{n} inne');
  assert.equal(pl['+{n} autres'].many, '+{n} innych');
  // La seconde, « Requis pour basculer vers un profil Admin… », est partie avec
  // l'ancien panneau du code (maquette v3, 02/11) : retirée, pas réécrite.
});
