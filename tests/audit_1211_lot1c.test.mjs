// ─────────────────────────────────────────────────
// La vue Appareils ne comptait pas comme l'Accueil (audit du 12/11, lot 1c).
//
// Sur une vraie installation : « 93 appareils répartis dans 11 pièces » en
// tête, quand l'Accueil montre 7 pièces — la vue comptait les zones de Home
// Assistant, « Network » et le local technique compris. Et à droite de
// « Tous », « 64 appareils » : le nombre de cartes, à côté d'une puce
// « Tous 93 ». Deux comptes pour un seul mot.
// ─────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { statsObjets, compteObjets, pucesObjets } from '../src/objets.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => readFileSync(join(RACINE, p), 'utf8').replace(/\r\n/g, '\n');
// Le rapprochement des noms de la vue d'une pièce (`rmNorm`, app/noyau.jsx), redit ici : la casse, les accents, la ponctuation.
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// Sa maison, en petit : sept zones Home Assistant portent des appareils, quatre sont des pièces de Loggia.
const PIECES_LOGGIA = ['Séjour', 'Cuisine', 'Chambre', 'Extérieur'];
const MAISON = [
  { cle: 'light.sejour', piece: 'Séjour', filtres: ['lumieres'], actif: true },
  { cle: 'media_player.tv', piece: 'sejour', filtres: ['multimedia'] }, // la zone, écrite sans accent ni majuscule
  { cle: 'light.cuisine', piece: 'Cuisine', filtres: ['lumieres'] },
  { cle: 'climate.chambre', piece: 'Chambre', filtres: ['chauffage'] },
  { cle: 'switch.nas', piece: 'Network', filtres: ['prises'], actif: true },
  { cle: 'switch.box', piece: 'Network', filtres: ['prises'] },
  { cle: 'switch.chaudiere', piece: 'Local technique', filtres: ['iot'] },
  { cle: 'camera.rue', piece: 'Rue', filtres: [] },
  { cle: 'obj:feeder', piece: null, filtres: ['iot'] },
  // Un groupe de capteurs : UNE carte, quatre portes.
  { cle: 'groupe:ouvertures', type: 'groupe', piece: null, filtres: ['capteurs'], membres: ['a', 'b', 'c', 'd'], actifsMembres: 1, muetsMembres: 1 },
];

// ── X7 : les pièces de l'en-tête sont celles de Loggia ───────────────────────

test('l’en-tête compte les pièces de Loggia, pas les zones de Home Assistant', () => {
  // Sans liste : tout nom de zone compte — sept, dont « Network », « Local technique », « Rue », et « sejour » à part de « Séjour ».
  assert.equal(statsObjets(MAISON).pieces, 7, 'sans liste, chaque nom de zone compte, « sejour » à part de « Séjour »');
  const s = statsObjets(MAISON, PIECES_LOGGIA, norm);
  assert.equal(s.pieces, 3, '« Network », « Local technique » ou « Rue » comptent pour des pièces, ou « sejour » pour une quatrième');
  // Les appareils de ces zones restent comptés : seule la pièce ne l'est plus.
  assert.equal(s.appareils, 13, 'les appareils d’une zone qui n’est pas une pièce ont disparu du total');
  assert.equal(s.actifs, 3);
  assert.equal(s.absentes, 1);
});

test('une pièce de Loggia sans appareil ne compte pas ; sans pièce de Loggia, aucune', () => {
  // « Extérieur » est une pièce de Loggia, mais rien n'y est rangé : « répartis dans 3 pièces », pas 4.
  assert.equal(statsObjets(MAISON, PIECES_LOGGIA, norm).pieces, 3);
  assert.equal(statsObjets(MAISON, [], norm).pieces, 0);
  assert.deepEqual(statsObjets([], PIECES_LOGGIA, norm), { appareils: 0, pieces: 0, actifs: 0, absentes: 0 });
});

test('la vue passe les pièces de Loggia, celles de l’Accueil, aux chiffres de tête', () => {
  const v = lire('src/vues/objets.jsx');
  assert.ok(v.includes("const piecesSig = normRooms(cfgVal('loggia_rooms', null)).map(r => r.room).join('|');"), 'la vue ne lit plus les pièces de Loggia');
  assert.ok(v.includes('const stats = useMemo(() => statsObjets(objets, piecesLoggia, rmNorm), [objets, piecesLoggia]);'), 'l’en-tête compte à nouveau les zones de Home Assistant');
  // La même liste et le même rapprochement que la pièce d'une mesure (`pieceLoggiaDe`, app/noyau.jsx).
  assert.ok(lire('src/app/noyau.jsx').includes("const p = normRooms(cfgVal('loggia_rooms', null)).find(r => rmNorm(r.room) === rmNorm(z));"), 'la règle « pièce de Loggia » a changé : l’en-tête ne la suit plus');
});

// ── E10 : un seul total ──────────────────────────────────────────────────────

test('sous « Tous », la liste annonce le nombre de sa puce, pas son nombre de cartes', () => {
  // Dix cartes, treize appareils : le groupe pèse ses quatre portes.
  assert.equal(MAISON.length, 10);
  const tous = compteObjets(MAISON, 'tous');
  assert.equal(tous, 13);
  assert.equal(pucesObjets(MAISON).find(p => p.id === 'tous').n, tous, 'la puce « Tous » et la liste ne comptent pas la même chose');
  assert.equal(statsObjets(MAISON).appareils, tous, 'l’en-tête et la liste ne comptent pas la même chose');
  // Sous un filtre, la liste filtrée pèse ce que dit sa puce.
  for (const p of pucesObjets(MAISON).filter(x => x.id !== 'tous')) {
    const visibles = MAISON.filter(o => o.filtres.indexOf(p.id) >= 0);
    assert.equal(compteObjets(visibles, 'tous'), p.n, 'le filtre « ' + p.id + ' » : la liste et la puce diffèrent');
  }
  const v = lire('src/vues/objets.jsx');
  assert.ok(v.includes("{trN(compteObjets(visibles, 'tous'), '{n} appareil', '{n} appareils')}"), 'la liste écrit « 89 appareils » à côté d’une puce « Tous 121 »');
  assert.ok(!v.includes("trN(visibles.length, '{n} appareil', '{n} appareils')"), 'le nombre de cartes est revenu sous le mot « appareils »');
});

test('ce qui n’a pas de famille reste sous « Tous » seulement : la somme des familles peut être plus petite', () => {
  /* Voulu (14/09 et 17/09) : ni puce « Sécurité » ni puce « Caméras » — une serrure, une sirène, une caméra ne se voient que sous
   * « Tous ». Ce n'est pas un écart de compte : ce test le dit pour qu'on ne le « corrige » pas. */
  const familles = pucesObjets(MAISON).filter(p => p.id !== 'tous' && p.id !== 'favoris').reduce((n, p) => n + p.n, 0);
  assert.equal(compteObjets(MAISON, 'tous') - familles, 1, 'la caméra sans famille devrait manquer à la somme, et elle seule');
});
