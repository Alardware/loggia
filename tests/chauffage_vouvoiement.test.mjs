/* Les textes français du chauffage, de la règle des fenêtres et de la présence
 * vouvoient (sa demande du 19/10). Seule la CLÉ française change : dans les
 * catalogues, l'allemand et l'espagnol tutoient comme Home Assistant, et le
 * polonais ne se réécrit jamais. Un texte qui DÉCRIT ce que fait l'appareil
 * (« Coupe la zone sans toucher à la consigne », sous l'interrupteur
 * « Chauffe ») n'est pas un ordre : il reste. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');

test('les textes français du chauffage, des fenêtres et de la présence vouvoient', () => {
  const fichiers = [['src', 'fichechauffage.jsx'], ['src', 'chauffageecran.js'], ['src', 'barremaison.jsx'],
    ['src', 'refuschauffage.js'], ['src', 'chauffageplanning.js'], ['src', 'chauffage.js'],
    ['src', 'views', 'fenetres.jsx'], ['src', 'views', 'presence.jsx']];
  const textes = fichiers.flatMap((p) => [...lire(...p).matchAll(/tr[NH]?\('((?:[^'\\]|\\.)*)'/g)].map(m => [p.join('/'), m[1]]));
  assert.ok(textes.length > 150, 'les textes ne sont plus lus : ' + textes.length);
  const tutoie = textes.filter(([, t]) => /(^|[.:!?]\s)(Clique|Touche|Appuie|Sélectionne|Choisis|Glisse|Ajoute|Tape|Fais|Va|Donne|Règle|Mets|Garde|Range|Coche|Remets|Renomme)\b/.test(t)
    || /(?<![\p{L}’'])(tu|ton|ta|tes|toi|te)(?![\p{L}])/iu.test(t) || /:\s(choisis|range|coche|mets|fais)\b/i.test(t));
  assert.deepEqual(tutoie, [], 'tutoiement');
  const fenetres = lire('src', 'views', 'fenetres.jsx');
  assert.ok(fenetres.includes("tr('Rien à couper : choisissez au moins un appareil.')"));
  assert.ok(fenetres.includes("Rangez vos capteurs dans une zone Home Assistant"));
});

test('la clé change, la traduction reste', () => {
  for (const langue of ['de', 'en', 'es', 'it', 'nl', 'pl']) {
    const cat = lire('src', 'langues', langue + '.js');
    assert.ok(cat.includes("'Rien à couper : choisissez au moins un appareil.':"), langue);
    assert.ok(!cat.includes('choisis au moins un appareil'), langue + ' : l’ancienne clé reste');
  }
  assert.ok(lire('src', 'langues', 'de.js').includes("'Rien à couper : choisissez au moins un appareil.': 'Nichts abzuschalten: Wähle mindestens ein Gerät.'"),
    'l’allemand tutoie comme Home Assistant : sa valeur ne change pas');
});
