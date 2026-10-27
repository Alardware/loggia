/* TEST AJOUTÉ (étape 3 IoT, 25/10 ; § 11) — les textes de l'arrivée d'eau dans les sept langues.
 *
 * Ce qui est garanti :
 *  - chaque texte que la carte, la popup, l'en-tête IoT et Paramètres écrivent pour l'eau a sa traduction dans les six catalogues ;
 *  - l'allemand, l'espagnol, l'italien et le néerlandais ne passent jamais à la forme de politesse (sa décision du 19/10 : comme Home
 *    Assistant, ils tutoient — ici, aucun texte ne s'adresse d'ailleurs à la personne) ;
 *  - le polonais nouveau est dans un bloc marqué pour Seba882, et chaque pluriel a ses formes `{ few, many, other }` ;
 *  - « Sec » d'un détecteur a SON sens (`Sec · détecteur`) : le « Sec » d'une clim est un mode, « Trocknen » ;
 *  - ce que plus rien n'appelle (la bascule « Vanne d'eau coupée » partie de Paramètres) a quitté les catalogues. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const URL_ = (p) => new URL('../' + p, import.meta.url);
const cat = async (lg) => (await import(URL_('src/langues/' + lg + '.js').href)).default;
const SOURCES = ['src/eau.js', 'src/cartevanne.jsx', 'src/fichevanne.jsx', 'src/enteteiot.jsx'].map(p => readFileSync(URL_(p), 'utf8')).join('\n');
const cles = new Set();
for (const m of SOURCES.matchAll(/\btr(?:Sens)?\(\s*'((?:[^'\\]|\\.)*)'/g)) cles.add(m[1]);
const pluriels = new Set();
for (const m of SOURCES.matchAll(/\btrN\(\s*[^,]+,\s*'((?:[^'\\]|\\.)*)'\s*,\s*'((?:[^'\\]|\\.)*)'/g)) { cles.add(m[1]); cles.add(m[2]); pluriels.add(m[2]); }

test('§ 11 : chaque texte de l’eau a sa traduction dans les six catalogues', async () => {
  assert.ok(cles.size > 50, 'les textes de l’étape sont lus : ' + cles.size);
  for (const lg of ['en', 'de', 'nl', 'it', 'es', 'pl']) {
    const c = await cat(lg);
    const manque = [...cles].filter(k => !(k in c));
    assert.deepEqual(manque, [], lg + ' : ' + manque.join(' | '));
  }
});

test('§ 11 : l’allemand, l’espagnol, l’italien et le néerlandais tutoient — jamais la forme de politesse', async () => {
  const politesse = { de: /\b(Sie|Ihr|Ihre|Ihnen)\b/, es: /\b(usted|ustedes|su configuración)\b/i, it: /\b(Lei|La sua|Suo)\b/, nl: /\b(u|uw)\b/ };
  for (const lg of Object.keys(politesse)) {
    const c = await cat(lg);
    const vous = [...cles].filter(k => typeof c[k] === 'string' && politesse[lg].test(c[k]));
    assert.deepEqual(vous, [], lg + ' : ' + vous.map(k => c[k]).join(' | '));
  }
});

test('§ 11 : le polonais nouveau, marqué pour Seba882, et ses pluriels à trois formes', async () => {
  const pl = await cat('pl');
  for (const k of pluriels) assert.ok(pl[k] && ['few', 'many', 'other'].every(f => typeof pl[k][f] === 'string'), k);
  const texte = readFileSync(URL_('src/langues/pl.js'), 'utf8');
  const i = texte.indexOf("  // L'arrivée d'eau (chantier IoT, étape 3, 25/10)\n  //   Textes nouveaux, à relire par Seba882.\n");
  assert.ok(i > 0, 'le bloc polonais est marqué');
  assert.ok(texte.indexOf("'Fermer l’eau'", i) > i, 'le polonais de l’eau est DANS ce bloc');
});

/* TEST AJOUTÉ (passe bis de l'étape 3, 25/10 ; points 16 et 18). */
test('passe bis : la ligne de Paramètres ne nomme plus de filtre, le néerlandais se corrige, le polonais reprend les mots de Seba882', async () => {
  const PAR = readFileSync(URL_('src/views/parametres.jsx'), 'utf8');
  assert.ok(PAR.includes("tr('Se règle dans la popup de la vanne d’eau.')"));
  for (const lg of ['en', 'de', 'nl', 'it', 'es', 'pl']) {
    const c = await cat(lg);
    assert.ok(typeof c['Se règle dans la popup de la vanne d’eau.'] === 'string', lg);
    assert.ok(!('Se règle dans la popup de la vanne d’eau, dans Objets › IoT.' in c), lg + ' garde l’ancienne ligne');
  }
  assert.equal((await cat('nl'))['Se règle dans la popup de la vanne d’eau.'], 'Wordt ingesteld in de pop-up van de waterkraan.', '« Stel je in in… » était fautif');
  // Le même sens qu'une valeur de Seba882 (« Sterowane gniazdko też się nada », tests/polonais_seba882.test.mjs) : ses mots.
  assert.ok((await cat('pl'))['Vide : toutes les vannes d’eau que Home Assistant connaît. Une prise commandée vaut aussi.'].endsWith('Sterowane gniazdko też się nada.'));
});

test('« Sec » d’un détecteur a son sens ; la bascule partie de Paramètres a quitté les catalogues', async () => {
  const de = await cat('de');
  assert.equal(de['Sec · détecteur'], 'Trocken');
  assert.equal(de['Sec'], 'Trocknen', 'le mode d’une clim, inchangé');
  for (const lg of ['en', 'de', 'nl', 'it', 'es', 'pl']) {
    const c = await cat(lg);
    for (const k of ['Vanne d’eau coupée', 'Sur une fuite. Reste coupée jusqu’à ce qu’on la rouvre à la main.', 'Vide : la première vanne d’eau que Home Assistant connaît. Une prise commandée vaut aussi.']) {
      assert.ok(!(k in c), lg + ' garde « ' + k + ' »');
    }
  }
});
