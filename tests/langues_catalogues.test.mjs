/* Les catalogues de traduction, complets et coherents (ADR 0070, 22/09).
 *
 * Un catalogue est un objet { texte francais: traduction }. Chaque langue
 * doit porter EXACTEMENT les cles de l'anglais : une cle en moins, c'est un
 * mot francais au milieu de l'allemand ; une cle en trop, c'est du travail
 * que rien ne lit. Les reperes {…} doivent survivre a la traduction, sinon
 * l'ecran montre « {n} lampes » a la lettre. */
import test from 'node:test';
import assert from 'node:assert/strict';

import { CHARGEURS } from '../src/langues/index.js';

const reperes = (s) => (String(s).match(/\{[a-zA-Z_]+\}/g) || []).sort().join(' ');
const en = (await CHARGEURS.en()).default;
const clesEn = Object.keys(en);

test('le catalogue anglais est sain : des cles non vides, des valeurs non vides', () => {
  assert.ok(clesEn.length > 2000);
  for (const k of clesEn) {
    assert.ok(k.length, 'cle vide');
    assert.equal(typeof en[k], 'string', k);
    assert.ok(en[k].length, 'valeur vide : ' + k);
  }
});

for (const code of Object.keys(CHARGEURS).filter(c => c !== 'en')) {
  test(`${code} : les memes cles que l’anglais, toutes traduites, reperes intacts`, async () => {
    const cat = (await CHARGEURS[code]()).default;
    const cles = Object.keys(cat);
    const manquantes = clesEn.filter(k => !(k in cat));
    const enTrop = cles.filter(k => !(k in en));
    assert.deepEqual(manquantes, [], code + ' : cles manquantes');
    assert.deepEqual(enTrop, [], code + ' : cles en trop');
    /* Une valeur est une chaine — ou, pour une langue a plus de deux formes
     * de pluriel (ADR 0071), un objet de formes { few, many, other… } dont
     * chaque forme est une chaine non vide aux memes reperes. Les categories
     * sont celles qu'Intl connait pour la langue. */
    const categories = new Set(new Intl.PluralRules(code).resolvedOptions().pluralCategories);
    const formesDe = (v) => (typeof v === 'object' && v ? Object.values(v) : [v]);
    const vides = clesEn.filter(k => formesDe(cat[k]).some(f => typeof f !== 'string' || !f.trim()));
    assert.deepEqual(vides, [], code + ' : valeurs vides');
    const objetsFaux = clesEn.filter(k => typeof cat[k] === 'object' && cat[k]
      && (!('other' in cat[k]) || Object.keys(cat[k]).some(c => !categories.has(c))));
    assert.deepEqual(objetsFaux, [], code + ' : un objet de formes sans « other », ou avec une categorie que la langue n’a pas');
    if (categories.size <= 2) {
      const objets = clesEn.filter(k => typeof cat[k] === 'object');
      assert.deepEqual(objets, [], code + ' : deux formes suffisent a cette langue, une chaine suffit');
    }
    const reperesFaux = clesEn.filter(k => formesDe(cat[k]).some(f => reperes(k) !== reperes(f)));
    assert.deepEqual(reperesFaux, [], code + ' : reperes {…} perdus ou renommes');
    /* Une valeur identique a l'anglais alors que l'anglais differe du
     * francais : une ligne oubliee dans la langue du filet. Beaucoup de mots
     * sont legitimement les memes — « System », « Online », « Alarm », « Gas »,
     * « Sensor » en allemand ou en neerlandais (une cinquantaine chacun) : la
     * borne ne vise qu'un MORCEAU entier oublie (cinq cents lignes), pas le
     * mot juste. */
    const restesAnglais = clesEn.filter(k => en[k] !== k && typeof cat[k] === 'string' && cat[k] === en[k]);
    assert.ok(restesAnglais.length < clesEn.length * 0.05, code + ' : ' + restesAnglais.length + ' valeurs restees en anglais, p. ex. ' + restesAnglais.slice(0, 8).join(' | '));
  });
}
