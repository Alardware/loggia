// ─────────────────────────────────────────────────────────────────────────────
// L'identité d'une tuile caméra.
//
// Loggia accepte qu'une caméra soit déclarée par son seul nom, sans entité :
// la tuile prend alors son rendu de repli. Ces caméras-là n'ont pas de `haid`,
// et `key={c.haid || c.id}` valait donc `undefined` pour toutes.
//
// React s'en plaignait dans la console, mais le vrai dégât était plus discret :
// sans clé distincte, il ne peut plus dire quelle tuile est laquelle. L'état
// local d'une tuile — sa popup d'agrandissement ouverte — peut alors se
// retrouver sur sa voisine dès que l'ordre de la liste change.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleCamera } from '../src/present.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');

test('une caméra sans entité reçoit quand même une clé', () => {
  // Le cas de la démo, et de toute caméra déclarée par son nom seul.
  const k = cleCamera({ name: 'Jardin', online: true }, 0);
  assert.equal(typeof k, 'string', 'la clé n’est pas une chaîne');
  assert.ok(k, 'la clé est vide : React ne distinguera plus les tuiles');
});

test('deux caméras homonymes sans entité gardent des clés distinctes', () => {
  // Rien n'interdit deux « Entrée ». Sans le rang pour les départager, elles
  // partageraient une clé et React les confondrait.
  assert.notEqual(cleCamera({ name: 'Entrée' }, 0), cleCamera({ name: 'Entrée' }, 1),
    'deux caméras du même nom partagent une clé');
});

test('une caméra sans nom ni entité reste identifiable', () => {
  const a = cleCamera({}, 0), b = cleCamera({}, 1);
  assert.ok(a && b, 'une caméra sans nom perd sa clé');
  assert.notEqual(a, b, 'deux caméras anonymes partagent une clé');
  // Et rien ne doit jeter sur une entrée absente : la liste vient de la
  // configuration de l'utilisateur, pas d'un schéma garanti.
  assert.ok(cleCamera(null, 0), 'une entrée nulle fait perdre la clé');
});

test('l’entité prime quand elle existe', () => {
  // Un entity_id est déjà unique, et il survit à un changement d'ordre —
  // contrairement au rang. Il doit donc passer avant.
  assert.equal(cleCamera({ haid: 'camera.jardin', name: 'Jardin' }, 3), 'camera.jardin',
    'la clé n’est plus l’entité quand la caméra en a une : elle bougera avec l’ordre');
});

test('toute une liste de caméras sans entité reste sans doublon', () => {
  const liste = [{ name: 'Entrée' }, { name: 'Entrée' }, {}, { name: 'Jardin' }, { haid: 'camera.rue' }];
  const cles = liste.map(cleCamera);
  assert.equal(new Set(cles).size, liste.length, `clés en double : ${cles.join(', ')}`);
});

test('la tuile est rendue avec cette clé, pas avec l’entité seule', () => {
  const i = src.indexOf('<CameraTile key=');
  assert.notEqual(i, -1, 'le rendu des tuiles caméra a disparu');
  assert.match(src.slice(i, i + 60), /key=\{c\.cle\}/,
    'la tuile reprend une clé qui peut valoir undefined pour les caméras sans entité');
  assert.match(src, /cle: cleCamera\(cam, i\)/,
    'la clé n’est plus posée là où la liste se construit');
});

test('le repli de démonstration a des clés fixes, pas traduites', () => {
  const i = src.indexOf('const CAMERAS = () => [');
  assert.notEqual(i, -1, 'la liste de repli a disparu');
  const bloc = src.slice(i, src.indexOf('\n];', i));
  // Ces deux entrées n'ont pas d'entité non plus. Et leur `label` passe par
  // `tr()` : une clé bâtie dessus changerait à chaque changement de langue et
  // remonterait les tuiles pour rien.
  assert.equal((bloc.match(/cle: '[^']+'/g) || []).length, 2,
    'les caméras de repli n’ont plus toutes une clé fixe');
  assert.ok(!/cle: tr\(/.test(bloc), 'la clé de repli passe par tr() : elle changera avec la langue');
});

test('la vue Sécurité n’affiche que les caméras qui ont une entité', () => {
  const i = src.indexOf('const camList = rCams.map(');
  assert.notEqual(i, -1, 'camList a disparu');
  const corps = src.slice(i, src.indexOf(';', src.indexOf('.filter(', i)));
  // C'est ce filtre — et lui seul — qui rend sûre la clé `c.haid` du rendu de
  // cette vue. Le retirer y ramènerait exactement le défaut corrigé ici.
  assert.match(corps, /\.filter\(c => c && c\.haid\)/,
    'la vue Sécurité accepte des caméras sans entité : sa clé de liste redeviendra undefined');
});
