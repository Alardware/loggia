/* Le socle des langues (ADR 0070, 22/09).
 *
 * Six langues au lieu de deux, un seul endroit qui les liste, et les mots du
 * serveur traduits sur l'ecran. On teste le comportement — ce qu'un code
 * donne, ce qu'une ligne de journal affiche — pas la forme des fichiers. */
import test from 'node:test';
import assert from 'node:assert/strict';

import { LANGUES, CHARGEURS, LOCALES, langueServie } from '../src/langues/index.js';
import { tr, trN, languesDisponibles, formePlurielle } from '../src/i18n.js';
import { mot, pourquoi } from '../src/journalmots.js';

test('les sept langues : la liste, les chargeurs et les locales disent la meme chose', () => {
  const codes = LANGUES.map(l => l.code).filter(c => c !== 'auto');
  assert.deepEqual(codes, ['fr', 'en', 'de', 'nl', 'it', 'es', 'pl']);
  assert.deepEqual(Object.keys(CHARGEURS).sort(), codes.filter(c => c !== 'fr').sort(), 'chaque langue sauf le francais a son catalogue');
  assert.deepEqual(Object.keys(LOCALES).sort(), [...codes].sort(), 'chaque langue a sa locale Intl');
  for (const l of LANGUES) {
    if (l.code === 'auto') continue;
    assert.ok(l.nom && l.enFrancais, l.code + ' : un nom natif et un nom francais');
  }
  assert.equal(languesDisponibles(), LANGUES, 'les reglages lisent la meme liste');
});

test('langueServie : le francais et les langues a catalogue, rien d’autre (c’est ce que ?lang= accepte)', () => {
  for (const c of ['fr', 'en', 'de', 'nl', 'it', 'es', 'pl']) assert.ok(langueServie(c), c);
  for (const c of ['cs', 'auto', '', 'EN', 'constructor', '__proto__']) assert.ok(!langueServie(c), String(c));
});

test('trois formes de pluriel : la regle de la langue departage un objet de formes (ADR 0071)', () => {
  const formes = { few: '{n} pokoje', many: '{n} pokoi', other: '{n} pokoi' };
  // Le polonais : 2-4 (sauf 12-14) prennent « few », 5+ et 12-14 « many ».
  assert.equal(formePlurielle(formes, 2, 'pl'), '{n} pokoje');
  assert.equal(formePlurielle(formes, 4, 'pl'), '{n} pokoje');
  assert.equal(formePlurielle(formes, 5, 'pl'), '{n} pokoi');
  assert.equal(formePlurielle(formes, 12, 'pl'), '{n} pokoi');
  assert.equal(formePlurielle(formes, 22, 'pl'), '{n} pokoje');
  assert.equal(formePlurielle(formes, 1.5, 'pl'), '{n} pokoi', 'une fraction : other');
  // Sans nombre, « other » ; une chaine passe telle quelle ; une categorie
  // absente retombe sur « other », puis « many ».
  assert.equal(formePlurielle(formes, null, 'pl'), '{n} pokoi');
  assert.equal(formePlurielle('{n} rooms', 3, 'en'), '{n} rooms');
  assert.equal(formePlurielle({ many: 'M', other: 'O' }, 2, 'pl'), 'O');
  assert.equal(formePlurielle({ many: 'M' }, 2, 'pl'), 'M');
  // Une langue a deux formes ne voit jamais « few » : elle prend « other ».
  assert.equal(formePlurielle(formes, 3, 'en'), '{n} pokoi');
});

test('trN : une forme pour 1, une pour le reste, n passe aux reperes', () => {
  assert.equal(trN(1, '{n} lampe allumée', '{n} lampes allumées'), '1 lampe allumée');
  assert.equal(trN(0, '{n} lampe allumée', '{n} lampes allumées'), '0 lampes allumées');
  assert.equal(trN(4, '{n} lampe allumée', '{n} lampes allumées'), '4 lampes allumées');
  assert.equal(trN(2, '{n} {q}', '{n} {q}s', { q: 'x' }), '2 xs');
});

test('les mots du serveur : un mot fixe passe par tr, un texte compose par ses parties', () => {
  // Sans catalogue charge (les tests tournent en francais), tr rend la cle :
  // on verifie que les parties sont remplies et jointes, et les vides tus.
  const ligne = { quoi: 'couper', regle: 'vent', motif: 'vent 62 km/h', detail: '',
    g: { motif: [['vent {v}', { v: '62 km/h' }], ['capteur de baie indisponible', {}]] } };
  assert.equal(mot(ligne, 'quoi'), 'couper');
  assert.equal(mot(ligne, 'motif'), 'vent 62 km/h · capteur de baie indisponible');
  assert.equal(mot(ligne, 'detail'), '');
  assert.equal(pourquoi(ligne), 'vent · vent 62 km/h · capteur de baie indisponible');
});

test('une ligne ancienne, sans parties, garde son francais compose', () => {
  const vieille = { quoi: 'fermer', regle: 'planning', motif: 'coucher +30 min', detail: '2 en attente' };
  assert.equal(pourquoi(vieille), 'planning · coucher +30 min · 2 en attente');
  assert.equal(mot(null, 'quoi'), '');
  assert.equal(mot({}, 'motif'), '');
});

test('la regle « retour » a sa propre cle : elle n’est pas le bouton Retour', () => {
  assert.equal(mot({ regle: 'retour' }, 'regle'), tr('retour (règle)'));
  assert.equal(mot({ motif: 'retour' }, 'motif'), tr('retour'), 'le motif, lui, reste le mot');
});
