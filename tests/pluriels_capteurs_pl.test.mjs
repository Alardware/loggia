/* Les pluriels polonais des étapes 2 et 3 du chantier Capteurs (passe bis du 17/10, point 1 ; § 11 de la conception).
 *
 * Les textes nouveaux qui comptent — « {n} ouvertes sur {total} », « {n} fermées », « {n} ouvertes », « {n} piles à changer »,
 * « {n} piles sans nouvelles », « {n} piles · la plus basse à {p} % », « {n} piles » — étaient des chaînes plates en polonais :
 * la démo disait « 3 baterii do wymiany » au lieu de « 3 baterie », et cinq ouvertes auraient donné « 5 otwarte » au lieu
 * d'« otwartych ». Le § 11 exige les objets de formes { few, many, other } qu'`Intl.PluralRules('pl')` départage (ADR 0071) :
 * 2 à 4 (et 22) « few », 5 et plus (et 12 à 14) « many » ; 1 passe par la clé du singulier.
 *
 * Les six autres langues n'ont que deux formes : `trN` choisit la clé du singulier pour 1, celle du pluriel sinon — une chaîne
 * par clé suffit, et le test le tient aussi. Le polonais nouveau reste marqué « à relire par Seba882 » dans le catalogue.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(RACINE, 'src');

// La langue se résout À L'IMPORT d'i18n.js : le polonais et son catalogue sont posés avant, là où l'amorce les dépose.
const PL = (await import(pathToFileURL(join(SRC, 'langues', 'pl.js')).href)).default;
Object.defineProperty(globalThis, 'navigator', { value: { language: 'pl-PL' }, configurable: true });
globalThis.window = { __loggiaCatalogue: { code: 'pl', cat: PL } };
const { trN, langue } = await import(pathToFileURL(join(SRC, 'i18n.js')).href);

const CLES = [
  ['{n} ouverte sur {total}', '{n} ouvertes sur {total}'], ['{n} fermée', '{n} fermées'], ['{n} ouverte', '{n} ouvertes'],
  ['{n} pile à changer', '{n} piles à changer'], ['{n} pile sans nouvelles', '{n} piles sans nouvelles'],
  ['{n} pile · {p} %', '{n} piles · la plus basse à {p} %'], ['{n} pile', '{n} piles'],
];

test('les pluriels polonais des capteurs portent leurs trois formes, et restent marqués à relire', () => {
  assert.equal(langue(), 'pl', 'le catalogue polonais n’est pas chargé : le test ne prouverait rien');
  for (const [, pluriel] of CLES) {
    const v = PL[pluriel];
    assert.equal(typeof v, 'object', pluriel + ' : une chaîne plate ne sait pas dire « few » et « many »');
    assert.deepEqual(Object.keys(v).sort(), ['few', 'many', 'other'], pluriel);
    assert.notEqual(v.few, v.many, pluriel + ' : 2 à 4 et 5 et plus ne se disent pas pareil');
  }
  // Chaque clé est sous la marque de sa section (« // — les capteurs : … », puis « Textes nouveaux, à relire par Seba882 »).
  const source = readFileSync(join(SRC, 'langues', 'pl.js'), 'utf8');
  for (const [, pluriel] of CLES) {
    const i = source.indexOf("\n  '" + pluriel + "'");
    const section = source.lastIndexOf('\n  // — ', i);
    assert.ok(i > 0 && section > 0 && source.slice(section, i).includes('à relire par Seba882'), pluriel + ' : sous une marque « à relire par Seba882 »');
  }
});

test('en polonais, 1, 3 et 5 : le singulier, « few », « many »', () => {
  assert.deepEqual([1, 3, 5].map(n => trN(n, '{n} ouverte sur {total}', '{n} ouvertes sur {total}', { total: 6 })), ['1 otwarte z 6', '3 otwarte z 6', '5 otwartych z 6']);
  assert.deepEqual([1, 3, 5].map(n => trN(n, '{n} fermée', '{n} fermées')), ['1 zamknięte', '3 zamknięte', '5 zamkniętych']);
  assert.deepEqual([1, 3, 5].map(n => trN(n, '{n} ouverte', '{n} ouvertes')), ['1 otwarte', '3 otwarte', '5 otwartych']);
  assert.deepEqual([1, 3, 5].map(n => trN(n, '{n} pile à changer', '{n} piles à changer')), ['1 bateria do wymiany', '3 baterie do wymiany', '5 baterii do wymiany']);
  assert.deepEqual([1, 3, 5].map(n => trN(n, '{n} pile sans nouvelles', '{n} piles sans nouvelles')), ['1 bateria bez sygnału', '3 baterie bez sygnału', '5 baterii bez sygnału']);
  assert.deepEqual([1, 3, 5].map(n => trN(n, '{n} pile · {p} %', '{n} piles · la plus basse à {p} %', { p: 64 })), ['1 bateria · 64 %', '3 baterie · najniższa 64 %', '5 baterii · najniższa 64 %']);
  assert.deepEqual([1, 3, 5].map(n => trN(n, '{n} pile', '{n} piles')), ['1 bateria', '3 baterie', '5 baterii']);
  // Les cas limites de la règle : 12 à 14 et 0 « many », 22 « few ».
  assert.deepEqual([0, 12, 22].map(n => trN(n, '{n} pile', '{n} piles')), ['0 baterii', '12 baterii', '22 baterie']);
});

test('les six autres langues : deux formes, une chaîne par clé, le pluriel distinct du singulier', async () => {
  for (const code of ['en', 'de', 'nl', 'it', 'es']) {
    const cat = (await import(pathToFileURL(join(SRC, 'langues', code + '.js')).href)).default;
    for (const [un, plusieurs] of CLES) {
      assert.equal(typeof cat[un], 'string', code + ' : ' + un);
      assert.equal(typeof cat[plusieurs], 'string', code + ' : ' + plusieurs);
    }
    // Là où la langue accorde le nom, le pluriel se distingue (l'anglais et l'allemand gardent « open » / « offen », « closed » / « geschlossen »).
    for (const [un, plusieurs] of CLES.filter(([u]) => u.indexOf('pile') >= 0)) assert.notEqual(cat[un], cat[plusieurs], code + ' : ' + plusieurs);
  }
});
