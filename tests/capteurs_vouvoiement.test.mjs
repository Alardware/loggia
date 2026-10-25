/* Le français des capteurs VOUVOIE (sa règle, 19/10 : « fais passer au vouvoiement les autres textes français qui tutoient
 * encore »).
 *
 * Seule la CLÉ française change : dans les catalogues, la valeur traduite reste telle quelle — l'allemand et l'espagnol
 * tutoient comme Home Assistant, et le polonais ne se réécrit jamais (tests/polonais_seba882). Un texte qui DÉCRIT ce que fait
 * l'appareil reste comme il est.
 *
 * Les écrans des capteurs sont lus en entier. Paramètres est partagé avec d'autres séances : on n'y garde que les textes des
 * capteurs et des alertes. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');

// Des bornes de mot qui connaissent les accents : `\b` coupe « arrête » en « arr » + « te ».
const MOT = (m) => '(?<![\\p{L}])(' + m + ')(?![\\p{L}])';
const IMPERATIF = new RegExp('(^|[.:!?—–]\\s|puis\\s)' + MOT('Clique|Touche|Appuie|Sélectionne|Choisis|Glisse|Ajoute|Tape|Fais|Va|Donne|Règle|Mets|Range|Vérifie|vérifie|Désigne|désigne|Regarde|regarde|Réessaie|Crée|crée|Coche|Ouvre|Indique'), 'u');
const PRONOM = new RegExp(MOT('tu|ton|ta|tes|toi|te'), 'iu');
const tutoie = (t) => IMPERATIF.test(t) || PRONOM.test(t) || /(désigne|donne|range|crée)-(la|le|les|lui|leur)/iu.test(t);

// Les textes affichés : les arguments de `tr('…')`, `trSens('…')` et `trN(n, '…', '…')` — jamais le code ni les commentaires.
const CHAINE = "'((?:[^'\\\\\\n]|\\\\.)+)'";
const APPEL = new RegExp("\\btr[A-Za-z]*\\(\\s*(?:[^,()'`]+,\\s*)?" + CHAINE + "(?:\\s*,\\s*" + CHAINE + ")?", 'g');
const textesDe = (...p) => [...lire(...p).matchAll(APPEL)]
  .flatMap(m => [m[1], m[2]].filter(Boolean).map(t => [p.join('/'), t]));

const ECRANS = [['src', 'views', 'veilles.jsx'], ['src', 'views', 'presence.jsx'], ['src', 'views', 'fenetres.jsx'],
  ['src', 'fichecapteur.jsx'], ['src', 'fichegroupe.jsx'], ['src', 'ficheconfort.jsx'], ['src', 'capteurssections.jsx'],
  ['src', 'ficheplante.jsx'], ['src', 'fichepiece.jsx'], ['src', 'groupes.js'], ['src', 'piles.js'], ['src', 'plantes.js'],
  ['src', 'confort.js'], ['src', 'mesuresfiche.js'], ['src', 'horsair.js']];

test('les écrans des capteurs vouvoient', () => {
  const textes = ECRANS.flatMap((p) => textesDe(...p));
  assert.ok(textes.length > 150, 'les textes ne sont plus lus : ' + textes.length);
  assert.deepEqual(textes.filter(([, t]) => tutoie(t)), [], 'tutoiement');
});

test('les textes des capteurs et des alertes de Paramètres vouvoient', () => {
  const p = lire('src', 'views', 'parametres.jsx');
  for (const t of ['Choisissez d’abord un téléphone.', 'Test envoyé — regardez votre téléphone.',
    'Aucun capteur supplémentaire trouvé. Rangez vos capteurs dans une zone Home Assistant : la détection s’appuie dessus en premier.',
    '{n} capteur détecté ({z} par la zone Home Assistant) — vérifiez puis « Enregistrer et recharger ».',
    '{n} capteurs détectés ({z} par la zone Home Assistant) — vérifiez puis « Enregistrer et recharger ».',
    '{n} capteur détecté par le nom — vérifiez puis « Enregistrer et recharger ».',
    '{n} capteurs détectés par le nom — vérifiez puis « Enregistrer et recharger ».']) {
    assert.ok(p.includes("'" + t + "'"), 'absent de Paramètres : ' + t);
  }
  for (const t of ['regarde ton téléphone', 'Choisis d’abord', 'Range tes capteurs', '— vérifie puis']) {
    assert.ok(!p.includes(t), 'encore tutoyé dans Paramètres : ' + t);
  }
});

test('seule la clé française change : chaque catalogue garde sa valeur', () => {
  const CLES = {
    'Et lancer, si vous le souhaitez': 'Et lancer, si tu veux',
    'Et allumer, si vous le souhaitez': 'Et allumer, si tu veux',
    'Choisissez d’abord un téléphone.': 'Choisis d’abord un téléphone.',
    'Test envoyé — regardez votre téléphone.': 'Test envoyé — regarde ton téléphone.',
  };
  for (const l of ['en', 'de', 'nl', 'it', 'es', 'pl']) {
    const cat = lire('src', 'langues', l + '.js');
    for (const [neuve, ancienne] of Object.entries(CLES)) {
      assert.ok(cat.includes("'" + neuve + "':"), l + ' : la clé vouvoyée manque — ' + neuve);
      assert.ok(!cat.includes("'" + ancienne + "':"), l + ' : l’ancienne clé tutoyée reste — ' + ancienne);
    }
  }
});
