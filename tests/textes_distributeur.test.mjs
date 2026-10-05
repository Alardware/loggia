/* Les textes du distributeur disent VRAI (05/10, contradicteur des textes,
 * ADR 0155). Règle « textes vrais » : une phrase de l'écran ne promet ni ne
 * fait craindre ce que le code ne fait pas.
 *
 * - L'encart « Ancienne liste de repas » disait « Ils ne servent plus » :
 *   cela se lisait « le repas de 19:00 ne part plus », alors que
 *   l'automatisation reliée distribue toujours — Loggia n'y touche pas.
 * - « erreur au depart » (journal, distributeurs.py) est le DÉPART d'un
 *   repas qui casse. Traduit « error at start », « Fehler beim Start »,
 *   « błąd przy starcie », il se confondait avec le redémarrage de Home
 *   Assistant, que « manque au redemarrage » nomme déjà.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const LANGUES = ['en', 'de', 'nl', 'it', 'es', 'pl'];
const CATALOGUES = Object.fromEntries(await Promise.all(LANGUES.map(async l => [l, (await import(`../src/langues/${l}.js`)).default])));
const PARAMETRES = readFileSync(new URL('../src/views/parametres.jsx', import.meta.url), 'utf8');

// La phrase de l'encart, telle que Paramètres l'appelle : la clé qui suit le titre.
const phraseEncart = () => {
  const m = PARAMETRES.match(/tr\('Ancienne liste de repas'\)[\s\S]{0,400}?tr\('((?:[^'\\]|\\.)*)'\)/);
  assert.ok(m, 'l’encart n’a plus sa phrase après son titre');
  return m[1];
};

test('l’encart ne fait pas croire que les repas ne partent plus : les automatisations distribuent toujours', () => {
  const fr = phraseEncart();
  assert.ok(!/ne servent plus/.test(fr), fr);
  assert.match(fr, /distribuent toujours/);
  for (const l of LANGUES) assert.ok(typeof CATALOGUES[l][fr] === 'string' && CATALOGUES[l][fr].length > 0, l + ' : la phrase de l’encart n’est pas traduite');
});

/* L'allemand de Loggia TUTOIE (de.js, « du » partout). Après deux-points, un
 * « Sie haben … » se lit comme le vouvoiement : « 3 Mahlzeiten nicht
 * verknüpft: Sie haben selbst nichts ausgegeben » disait « VOUS n'avez rien
 * distribué » (05/10, mesuré dans la démo). */
test('l’allemand ne vouvoie pas par accident : pas de « Sie » en tête après deux-points', () => {
  const cles = ['{n} repas non relié : il ne distribuait rien par lui-même', '{n} repas non reliés : ils ne distribuaient rien par eux-mêmes'];
  for (const k of cles) assert.ok(!/: Sie /.test(CATALOGUES.de[k]), CATALOGUES.de[k]);
});

test('« erreur au depart » se dit comme le départ d’un repas, pas comme un démarrage', () => {
  const DEMARRAGE = { en: /start/i, de: /start/i, nl: /start/i, it: /partenza|avvio/i, es: /inici/i, pl: /start|uruchom/i };
  for (const l of LANGUES) {
    const v = CATALOGUES[l]['erreur au depart'];
    assert.equal(typeof v, 'string', l);
    assert.ok(!DEMARRAGE[l].test(v), l + ' : « ' + v + ' » se lit comme un démarrage');
  }
});

/* En anglais, « feed » sans complément veut dire MANGER : « Loggia feeds at
 * these times », « Two sources are feeding », « can also feed on its own time
 * slots » (= « se nourrit de ses créneaux ») disaient que Loggia ou l'appareil
 * mangent. Le verbe de en.js pour distribuer est « dispense » (« Distribuer »
 * → « Dispense ») ; « feeder », « Feeding mode » restent (05/10, contradicteur
 * de F2). */
test('l’anglais ne fait pas manger le distributeur : « dispense », jamais « feed » comme verbe', () => {
  const cles = [
    'L’appareil peut aussi distribuer selon ses propres créneaux. Passez-le en mode manuel dans Réglages si vous ne vous en servez pas.',
    'Loggia distribue à ces heures, même écran fermé.',
    'Deux sources distribuent : vérifiez qu’un repas ne part pas deux fois.',
    'En pause : une autre source distribue déjà.',
    '{n} repas non relié : il ne distribuait rien par lui-même',
    '{n} repas non reliés : ils ne distribuaient rien par eux-mêmes',
    'Votre ancienne liste ne distribuait rien par elle-même.',
  ];
  for (const k of cles) {
    const v = CATALOGUES.en[k];
    assert.equal(typeof v, 'string', k);
    assert.ok(!/\bfeed(s|ing)?\b/i.test(v), '« ' + v + ' » : « feed » sans complément se lit « manger »');
  }
});

/* « désignez son appareil ou son script de distribution dans Paramètres » :
 * la phrase renvoie à un CHAMP de Paramètres ; elle doit en dire le nom tel
 * que le champ l'affiche (« Script de distribution »), sinon on cherche un
 * « Fütterungsskript » qui n'existe pas (05/10, contradicteur de F2). */
test('la phrase « sans commande » nomme le champ de Paramètres comme il s’affiche', () => {
  const k = 'Loggia ne sait pas commander ce distributeur : désignez son appareil ou son script de distribution dans Paramètres.';
  for (const l of LANGUES) {
    const champ = CATALOGUES[l]['Script de distribution'];
    assert.equal(typeof champ, 'string', l);
    assert.ok(CATALOGUES[l][k].toLowerCase().includes(champ.toLowerCase()), l + ' : « ' + CATALOGUES[l][k] + ' » ne nomme pas « ' + champ + ' »');
  }
});
