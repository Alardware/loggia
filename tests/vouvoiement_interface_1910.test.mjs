/* LE FRANÇAIS DE L'INTERFACE GÉNÉRALE VOUVOIE (19/10).
 *
 * Sa règle : « Vous » partout en français. Trente-sept textes de l'interface
 * générale tutoyaient encore — l'édition (« attrape une carte… »), les
 * scénarios, les conseils météo (« couvre-toi bien »), les Paramètres, le
 * code, l'assistant, la voix, Système. Seule la CLÉ française change : dans
 * les catalogues, la valeur traduite reste telle quelle — l'allemand et
 * l'espagnol tutoient comme Home Assistant, le polonais ne se réécrit
 * jamais. Un texte qui DÉCRIT ce que fait un bouton, à la 3e personne
 * (« Coupe la zone sans toucher à la consigne », « Relance le cœur… »),
 * n'est pas un tutoiement et reste. Modèle : tests/volets_audit_1910.test.mjs. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const CATALOGUES = ['en', 'de', 'es', 'it', 'nl', 'pl'];

const FICHIERS = [['src', 'App.jsx'], ['src', 'views', 'parametres.jsx'], ['src', 'pinmodal.jsx'],
  ['src', 'views', 'assistant.jsx'], ['src', 'voix.js'], ['src', 'views', 'systeme.jsx'], ['src', 'views', 'appareils.jsx'],
  // La fiche d'un scénario a quitté App.jsx (19/10) : ses textes y sont gardés aussi.
  ['src', 'fichescenario.jsx']];

/* Les textes qu'une autre séance doit encore reprendre, nommés à la lettre plutôt
 * que d'ignorer un fichier entier. Vide depuis le 19/10 : « Range tes capteurs… »
 * a été repris par la séance des Capteurs. */
const AUTRES_SEANCES = new Set([]);
/* Les deux écritures d'un texte : entre apostrophes, et entre guillemets quand il
 * porte une apostrophe droite (« n'apparaissent ») — c'est ainsi que la phrase de
 * l'Énergie échappait à la règle. */
const TEXTES = /\btr\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g;

const VERBES = 'Clique|Touche|Appuie|Sélectionne|Choisis|Glisse|Ajoute|Tape|Fais|Va|Donne|Règle|Mets|Garde|Attrape|Coche|Décoche|'
  + 'Masque|Réessaie|Recharge|Pense|Prends|Profite|Limite|Maintiens|Épingle|Compose|Avance|Recule|Modifie|Remets|Désigne|Active|'
  + 'Regarde|Parle|Pose|Couvre|Renomme|Retire|Réordonne';
const IMPERATIF = new RegExp('(^|[.:!?—,]\\s|\\bou\\s|\\bpuis\\s)(' + VERBES + ')(-(le|la|les|en|lui|toi))?\\s', 'i');
const PRONOM = /(^|[\s(«—])(tu|toi|tes|ta)(?=[\s,.!?»)])|(^|[\s(«—])t’|-toi\b|\bton (téléphone|code|compte|écran)\b/i;

test('les textes français de l’interface générale vouvoient', () => {
  const textes = FICHIERS.flatMap((p) => [...lire(...p).matchAll(TEXTES)].map(m => [p.join('/'), m[1] ?? m[2]]));
  assert.ok(textes.length > 1500, 'les textes ne sont plus lus : ' + textes.length);
  const tutoie = textes.filter(([, t]) => !AUTRES_SEANCES.has(t) && (IMPERATIF.test(t) || PRONOM.test(t)));
  assert.deepEqual(tutoie, [], 'tutoiement');
});

test('la règle sait reconnaître un tutoiement, et laisse une description à la 3e personne', () => {
  for (const t of ['Choisis une scène ou un script.', 'Risque de gel, couvre-toi bien', 'Test envoyé — regarde ton téléphone.',
    'Mode édition : attrape une carte pour la déplacer où tu veux', 'Vue vide — active le crayon (en haut)', 'Parle, je t’écoute.'])
    assert.ok(IMPERATIF.test(t) || PRONOM.test(t), 'non vu : ' + t);
  for (const t of ['Coupe la zone sans toucher à la consigne', 'Relance le cœur sans toucher à la machine · ~40 s',
    'Arrête le moteur là où il est', 'La nuit, la veille baisse d\'un ton et l\'horloge dérive pour ménager l\'écran.', 'Actives', 'règles actives'])
    assert.ok(!IMPERATIF.test(t) && !PRONOM.test(t), 'vu à tort : ' + t);
});

// Les clés renommées : la nouvelle partout, l'ancienne nulle part — et une seule fois par catalogue.
const RENOMMEES = [
  ['Risque de gel, couvre-toi bien', 'Risque de gel, couvrez-vous bien'],
  ['Forte chaleur, pense à t’hydrater', 'Forte chaleur, pensez à vous hydrater'],
  ['Choisis une entité : les cartes qu’elle accepte s’affichent ensuite.', 'Choisissez une entité : les cartes qu’elle accepte s’affichent ensuite.'],
  ['Test envoyé — regarde ton téléphone.', 'Test envoyé — regardez votre téléphone.'],
  ['Trop d’essais. Réessaie dans {n} s.', 'Trop d’essais. Réessayez dans {n} s.'],
  ['Appuie et parle, j’écoute jusqu’au silence.', 'Appuyez et parlez, j’écoute jusqu’au silence.'],
  ['Le son n’a pas démarré. Touche l’écran, puis réessaie.', 'Le son n’a pas démarré. Touchez l’écran, puis réessayez.'],
];

/* La phrase de l'Énergie (Paramètres › Entités, 19/10) : écrite entre guillemets dans
 * les sources et dans en.js, avec `n\'` ailleurs — seule sa fin change. */
test('l’Énergie vouvoie aussi : « …que si vous les renseignez. »', () => {
  const p = lire('src', 'views', 'parametres.jsx');
  assert.ok(p.includes('sur le schéma que si vous les renseignez."'), 'Paramètres');
  for (const f of [['src', 'views', 'parametres.jsx'], ...CATALOGUES.map(c => ['src', 'langues', c + '.js'])]) {
    const s = lire(...f);
    assert.ok(!s.includes('que si tu les renseignes'), f.join('/') + ' tutoie encore');
    if (f[1] === 'langues') assert.equal(s.split('sur le schéma que si vous les renseignez.').length - 1, 1, f.join('/') + ' : la clé une fois');
  }
});

test('chaque clé renommée l’est dans les six catalogues, valeur gardée', () => {
  const sources = FICHIERS.map(p => lire(...p)).join('\n');
  for (const [vieux, neuf] of RENOMMEES) {
    assert.ok(!sources.includes("'" + vieux + "'"), 'ancienne clé encore appelée : ' + vieux);
    assert.ok(sources.includes("tr('" + neuf + "'"), 'nouvelle clé absente des sources : ' + neuf);
    for (const c of CATALOGUES) {
      const cat = lire('src', 'langues', c + '.js');
      assert.ok(!cat.includes("'" + vieux + "':"), c + ' garde l’ancienne clé : ' + vieux);
      assert.equal(cat.split("'" + neuf + "':").length - 1, 1, c + ' : la nouvelle clé une fois : ' + neuf);
    }
  }
});
