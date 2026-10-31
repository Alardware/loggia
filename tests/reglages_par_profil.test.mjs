// ─────────────────────────────────────────────────────────────────────────────
// Ce qu'on RANGE appartient à qui l'a rangé (11/10).
//
// « Je modifie en tant que Guillaume, ça modifie aussi Luna, qui est un autre
// profil. Ça ne doit pas se produire : toute modification est liée au même
// profil, il n'a pas à synchroniser les autres. »
//
// Et la frontière, qu'il a posée dans la même conversation : « la seule chose
// qui est commune à tous, c'est l'ajout, la suppression et la modification
// d'entités. »
//
// Le 10/10, trois clés avaient reçu ce traitement à la main dans
// `readViewsCfg` : le menu séparait bien deux personnes, et les ONZE autres
// clés d'agencement continuaient de synchroniser tout le monde — la grille de
// l'Accueil en tête. D'où un tri au passage central (`cfgVal` / `cfgSet`), et
// cette suite qui vérifie le COMPORTEMENT, pas la forme du code : on range, et
// on regarde ce que l'autre profil voit.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MONOLITHE } from './monolithe.mjs'; // App.jsx et ce qui en sort (ADR 0282)
// La langue AVANT l'import, comme les autres suites qui chargent src/.
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true });
const S = await import('../src/state.js');

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');

/** Le profil qui regarde cet écran, et la configuration que le serveur sert.
 *  `server: true` : le composant a répondu, donc il fait foi. */
const regarde = (id, cfg = {}) =>
  S.setLoggiaState({ cfg: { loggia_active_user: String(id), ...cfg }, server: true });

test('ranger en tant que Guillaume ne touche pas Luna', () => {
  regarde(0);
  S.cfgSet({ loggia_accueil: { pc: ['meteo', 'alarme'] } });

  // Ce qui part vers le serveur porte une PART, pas la grille à nu.
  const brut = S.LOGGIA_CFG.loggia_accueil;
  assert.deepEqual(Object.keys(brut), ['__profils'], 'la valeur n’est pas rangée par profil');
  assert.deepEqual(brut.__profils['0'], { pc: ['meteo', 'alarme'] });

  // Guillaume la relit telle qu'il l'a posée : le découpage est invisible pour
  // l'appelant, qui n'a rien eu à savoir.
  assert.deepEqual(S.cfgVal('loggia_accueil', null), { pc: ['meteo', 'alarme'] });

  // Luna, dans la même maison, ne la voit pas. C'est tout le sujet.
  regarde(1, { loggia_accueil: brut });
  assert.equal(S.cfgVal('loggia_accueil', null), null,
    'Luna hérite du rangement de Guillaume : « ça ne doit pas se produire »');
});

test('deux profils rangent sans s’écraser', () => {
  regarde(1, { loggia_accueil: { __profils: { 0: { pc: ['meteo'] } } } });
  S.cfgSet({ loggia_accueil: { pc: ['robot'] } });
  const p = S.LOGGIA_CFG.loggia_accueil.__profils;
  assert.deepEqual(p['0'], { pc: ['meteo'] }, 'la part de l’autre profil a été écrasée');
  assert.deepEqual(p['1'], { pc: ['robot'] });
});

test('une disposition d’avant la bascule reste lisible par tous', () => {
  /* La reprise : personne ne doit ouvrir Loggia sur une grille vide le jour de
   * la mise à jour. Une valeur sans marqueur est la valeur commune d'avant. */
  const ancienne = { pc: ['meteo'], mobile: ['alarme'] };
  for (const id of [0, 1, 2]) {
    regarde(id, { loggia_accueil: ancienne });
    assert.deepEqual(S.cfgVal('loggia_accueil', null), ancienne,
      'le profil ' + id + ' a perdu la grille existante à la bascule');
  }
});

test('le premier rangement laisse les autres sur ce qu’ils voyaient', () => {
  regarde(0, { loggia_accueil: { pc: ['meteo'] } });
  S.cfgSet({ loggia_accueil: { pc: ['meteo', 'robot'] } });
  const brut = S.LOGGIA_CFG.loggia_accueil;
  assert.deepEqual(brut.__profils['*'], { pc: ['meteo'] },
    'la valeur commune n’a pas été conservée : les autres profils perdraient leur grille');
  regarde(1, { loggia_accueil: brut });
  assert.deepEqual(S.cfgVal('loggia_accueil', null), { pc: ['meteo'] });
});

test('un profil sans part n’hérite pas des vues d’un autre', () => {
  /* « Un profil non admin ne doit avoir que les vues par défaut, et non les
   * vues secondaires » (10/10) : il s'était retrouvé avec la Climatisation que
   * quelqu'un d'autre s'était ajoutée, et sans le droit de la retirer.
   *
   * Le MENU ne s'hérite donc pas, alors que la DISPOSITION si : une vue en
   * trop ajoute ce qu'on n'a pas choisi, une grille héritée ne fait que donner
   * un point de départ. */
  const brut = { __profils: { '*': ['climat'] } };
  regarde(0, { 'loggia-shownviews': brut });
  assert.deepEqual(S.cfgVal('loggia-shownviews', []), ['climat'],
    'le premier profil perd son propre réglage');
  regarde(1, { 'loggia-shownviews': brut });
  assert.deepEqual(S.cfgVal('loggia-shownviews', []), [],
    'une vue secondaire a été héritée par un autre profil');
});

test('les entités restent communes à la maison', () => {
  // « La seule chose qui est commune à tous, c'est l'ajout, la suppression et
  // la modification d'entités. » Décrire deux fois une pièce n'a aucun sens.
  const pieces = [{ room: 'Salon' }];
  for (const id of [0, 1]) {
    regarde(id, { loggia_rooms: pieces });
    assert.deepEqual(S.cfgVal('loggia_rooms', null), pieces,
      'les pièces se sont séparées par profil');
  }
  for (const k of ['loggia_rooms', 'loggia_cameras', 'loggia_icones', 'loggia_users',
    'loggia_customviews', 'loggia_energyHaids', 'loggia_medias', 'loggia_alarm']) {
    assert.ok(!S.estParProfil(k), k + ' décrit une entité : elle doit rester commune');
  }
});

test('effacer sa part laisse celle des autres', () => {
  regarde(0, { loggia_epingles: { __profils: { 0: ['a'], 1: ['b'] } } });
  S.cfgSet({ loggia_epingles: null });
  assert.deepEqual(S.LOGGIA_CFG.loggia_epingles.__profils, { 1: ['b'] });
  // Et la dernière part partie, la clé s'efface : pas de coquille vide.
  regarde(1, { loggia_epingles: { __profils: { 1: ['b'] } } });
  S.cfgSet({ loggia_epingles: null });
  assert.equal(S.LOGGIA_CFG.loggia_epingles, undefined);
});

test('tout ce qui se RANGE suit le profil', () => {
  /* Le garde-fou qui compte : c'est l'oubli d'une clé qui a fait durer ce bug
   * deux jours. `AGENCEMENT` (store.py) est la liste de ce qu'on range — elle
   * et `PAR_PROFIL` doivent dire la même chose, sinon une clé ajoutée demain
   * resynchroniserait tous les profils en silence. */
  const store = lire('custom_components', 'loggia', 'store.py');
  const i = store.indexOf('AGENCEMENT: frozenset[str] = frozenset(');
  assert.ok(i > 0, 'la liste AGENCEMENT a disparu');
  const liste = store.slice(i, store.indexOf('\n)', i));
  const cles = [...liste.matchAll(/"(loggia[a-z_-]+)"/g)].map(m => m[1]);
  assert.ok(cles.length >= 14, 'AGENCEMENT a maigri : ' + cles.length + ' clés');
  for (const k of cles) {
    assert.ok(S.estParProfil(k),
      k + ' est de l’agencement mais ne suit pas le profil : elle synchroniserait tous les profils');
  }
});

test('changer de profil relit les réglages', () => {
  /* Un `useState(() => cfgVal(...))` ne se réévalue pas parce que le profil a
   * changé : huit réglages resteraient sur la part de l'ancien. La racine du
   * rendu porte donc le profil, comme elle porte déjà la première réponse du
   * serveur (ADR 0184). */
  const app = MONOLITHE;
  assert.ok(app.includes("<div key={(servi ? 'srv' : 'local') + ':' + userIdx}"),
    'la racine ne porte plus le profil : les réglages lus au montage resteraient sur la part de l’ancien profil');
});

test('les trois clés du menu n’ont plus de découpage à elles', () => {
  /* Deux découpages superposés indexeraient deux fois la même valeur :
   * `{__profils:{"0":{"0":[…]}}}`. `ui.jsx` pose donc la valeur telle qu'il
   * veut la voir, et laisse `state.js` la ranger. */
  const ui = lire('src', 'ui.jsx');
  const i = ui.indexOf('\nexport function writeViewsCfg(');
  assert.ok(i > 0, 'writeViewsCfg a disparu');
  const corps = ui.slice(i, ui.indexOf('\n}\n', i));
  assert.ok(!/loggia_active_user/.test(corps),
    'writeViewsCfg découpe de nouveau par profil : la valeur serait indexée deux fois');
  assert.match(corps, /'loggia-hiddenviews': \[\.\.\.cfg\.hidden\]/,
    'writeViewsCfg ne pose plus la valeur telle quelle');
});
