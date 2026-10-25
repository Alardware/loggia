// Le français VOUVOIE (sa règle, 19/10) — les lumières, la nuit et les interrupteurs.
//
// Cinq textes tutoyaient encore (« Range-les », « écris le service », « Appuie
// sur un bouton », « regarde le journal », « ta télécommande »). Seule la CLÉ
// française change : la valeur traduite reste telle quelle — l'allemand et
// l'espagnol tutoient comme Home Assistant, le polonais ne se réécrit jamais.
// Un texte qui DÉCRIT ce que fait l'appareil (« Allume si c'est éteint… ») reste.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');

const FICHIERS = [['src', 'views', 'nuit.jsx'], ['src', 'views', 'interrupteurs.jsx'], ['src', 'fichelumiere.jsx'],
  ['src', 'entetelumieres.jsx'], ['src', 'scenes.jsx'], ['src', 'lumieres.js'], ['src', 'lumieresetat.js'], ['src', 'lumieresfiche.js']];

const textes = () => FICHIERS.flatMap((p) => [...lire(...p).matchAll(/\btrN?\(\s*'((?:[^'\\]|\\.)*)'/g)].map(m => [p.join('/'), m[1]]));

const tutoie = (t) => /(^|[.:!?—]\s)(Clique|Touche|Appuie|Sélectionne|Choisis|Glisse|Ajoute|Tape|Fais|Va|Donne|Règle|Mets|Garde|Range|Écris|Regarde|Vérifie|Ouvre|Coche)\b/.test(t)
  // Des frontières de LETTRES (Unicode) : `\b` couperait « fête » en « f|ête » et y verrait « te ».
  || /(?<!\p{L})(tu|ton|ta|tes|toi|te)(?!\p{L})/iu.test(t)
  || /\b(Range|Donne|Mets)-(les|lui|leur|la|le)\b/.test(t)
  || /[:—]\s(écris|regarde|appuie|choisis|touche|clique|range)\b/.test(t);

test('les textes français des lumières, de la nuit et des interrupteurs vouvoient', () => {
  const tous = textes();
  assert.ok(tous.length > 100, 'les textes ne sont plus lus : ' + tous.length);
  assert.deepEqual(tous.filter(([, t]) => tutoie(t)), [], 'tutoiement');
});

test('le garde reconnaît bien les tournures d’avant', () => {
  for (const t of ['Aucune pièce avec un capteur de mouvement et une lampe. Range-les dans une zone Home Assistant : la règle s’appuie dessus.',
    'Pour tout le reste : écris le service et sa cible', 'Appuie sur un bouton : il apparaît ici, avec son nom.',
    'MQTT est là, mais l’abonnement a échoué — regarde le journal de Home Assistant', 'Rien encore. Appuie sur un bouton de ta télécommande : il se montrera ici.']) {
    assert.ok(tutoie(t), t);
  }
  assert.ok(!tutoie('Allume si c’est éteint, éteint si c’est allumé'), 'une description de l’appareil n’est pas un tutoiement');
});

test('chaque catalogue garde sa traduction sous la clé vouvoyée, et l’ancienne clé est partie', () => {
  const paires = [
    ['Rangez-les dans une zone Home Assistant', 'Range-les dans une zone Home Assistant'],
    ['Pour tout le reste : écrivez le service et sa cible', 'Pour tout le reste : écris le service et sa cible'],
    ['Appuyez sur un bouton : il apparaît ici', 'Appuie sur un bouton : il apparaît ici'],
    ['— regardez le journal de Home Assistant', '— regarde le journal de Home Assistant'],
    ['Appuyez sur un bouton de votre télécommande', 'Appuie sur un bouton de ta télécommande'],
    ["'Appuyez sur un bouton':", "'Appuie sur un bouton':"],
  ];
  for (const lg of ['en', 'de', 'nl', 'it', 'es', 'pl']) {
    const c = lire('src', 'langues', lg + '.js');
    for (const [nouveau, ancien] of paires) {
      assert.ok(c.includes(nouveau), lg + ' : clé absente — ' + nouveau);
      assert.ok(!c.includes(ancien), lg + ' : ancienne clé restée — ' + ancien);
    }
  }
});
