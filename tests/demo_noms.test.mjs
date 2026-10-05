// ─────────────────────────────────────────────────────────────────────────────
// La maison de démonstration parle la langue de la démo (audit du 03/10).
//
// `lieu()` et `etiquette()` rendent tel quel un nom qu'elles ne connaissent
// pas : sans entrée dans `LIEUX` ou `APPAREILS`, il sort en français, sans
// bruit. Onze noms et rappels (« Garage », « Arroser les plantes », « Liste
// partagée »…), treize états (« Porte de garage », « Baie vitrée »…), les
// appareils du registre, le journal d'activité et l'agenda restaient ainsi
// français dans une démo polonaise. Et deux configurations bâties à l'import
// figeaient un nom avant que la langue ne soit connue.
//
// Ce fichier lit `demo.js` comme le test du badge (mise_en_page_lot7) : tout
// nom écrit en français a son entrée dans les six langues, et un nom écrit
// hors d'un état passe par `etiquette()`. Restent tels quels, partout, les
// noms qu'une INTÉGRATION donne et les prénoms.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const demo = readFileSync(join(RACINE, 'src', 'demo.js'), 'utf8');
const LANGUES = ['en', 'de', 'nl', 'it', 'es', 'pl'];
// Un littéral entre apostrophes, ou entre guillemets quand il en porte une.
const LIT = String.raw`(?:'([^'\n]*)'|"([^"\n]*)")`;

/** Une table de la démo, ligne à ligne : nom français → { langue: texte }. */
function table(nom) {
  const debut = demo.indexOf('const ' + nom + ' = {\n');
  assert.ok(debut >= 0, nom + ' introuvable');
  const lignes = demo.slice(debut, demo.indexOf('\n};', debut)).split('\n').filter(l => /^ {2}['"]/.test(l));
  const forme = new RegExp('^ {2}' + LIT + String.raw`: \{ (.*) \},$`);
  const t = new Map();
  for (const l of lignes) {
    const m = l.match(forme);
    assert.ok(m, nom + ' : ligne illisible, ' + l.slice(0, 60));
    t.set(m[1] ?? m[2], Object.fromEntries([...m[3].matchAll(/\b([a-z]{2}): '([^'\n]*)'/g)].map(x => [x[1], x[2]])));
  }
  return t;
}
const LIEUX = table('LIEUX');
const APPAREILS = table('APPAREILS');

/* Ce qui se lit pareil dans toutes les langues : les prénoms, « Démo » (le
 * nom du compte), deux noms de modèle, et les noms qu'une intégration donne,
 * anglais même chez un Français. Ajouter un nom ici, c'est affirmer qu'il se
 * lit pareil en polonais. */
const TELS_QUELS = new Set(['Camille', 'Alex', 'Léa', 'Sam', 'Démo', 'Orbit V3', 'Meadow M2']);
const INTEGRATION = /^(System Monitor|Home Assistant|ESPHome|Zigbee2MQTT|Mosquitto broker|MariaDB|Samba share|Studio Code Server)( |$)|^homeassistant\./;
const telQuel = (n) => TELS_QUELS.has(n) || INTEGRATION.test(n);
const litteraux = (avant) => [...demo.matchAll(new RegExp(avant + LIT, 'g'))].map(m => m[1] ?? m[2]);

test('chaque entrée des tables de la démo parle les six langues', () => {
  assert.ok(LIEUX.size >= 7 && APPAREILS.size >= 100, 'la lecture des tables a échoué');
  for (const [nom, t] of [['LIEUX', LIEUX], ['APPAREILS', APPAREILS]]) {
    for (const [cle, v] of t) {
      for (const l of LANGUES) assert.ok(v[l] && v[l].trim(), `${nom} · ${cle} : ${l} manque`);
    }
  }
});

test('chaque nom écrit en français dans la démo a son entrée dans les six langues', () => {
  const noms = new Set([
    // Les états : `s()` passe chaque friendly_name par `etiquette()`.
    ...litteraux('friendly_name: '),
    ...litteraux(String.raw`\b(?:etiquette|lieu)\(`),
  ]);
  // Les pièces, nommées par `lieu(nom)`.
  const pieces = demo.slice(demo.indexOf('const PIECES = ['), demo.indexOf('];', demo.indexOf('const PIECES = [')));
  for (const m of pieces.matchAll(/\['\w+', '([^']+)',/g)) noms.add(m[1]);
  assert.ok(noms.size > 100, 'la lecture de demo.js a échoué');
  const sansEntree = [...noms].filter(n => !telQuel(n) && !APPAREILS.has(n) && !LIEUX.has(n));
  assert.deepEqual(sansEntree, [], 'sans entrée, ces noms restent en français dans toutes les langues');
});

test('un nom écrit hors d’un état passe par etiquette()', () => {
  /* `s()` ne traduit que le friendly_name d'un état. Le registre (nom et
   * modèle d'un appareil), le journal d'activité et l'agenda sont des
   * littéraux à part : écrits en clair, ils restaient français, quelle que
   * soit l'entrée de la table. */
  const enClair = litteraux(String.raw`\b(?:name|model|summary): `).filter(n => !telQuel(n));
  assert.deepEqual(enClair, [], 'à écrire etiquette(…)');
  assert.ok(demo.includes(`nom: etiquette("Porte d'entrée"), genre: 'ouverture'`), 'le dernier indice de la présence');
  assert.ok(demo.includes("regle: etiquette('Variateur Salon'), quoi: 'bouton'"), 'la règle d’un interrupteur porte son nom');
});

test('ce qui porte un nom se bâtit quand la langue est connue', () => {
  /* Évaluée à l'import, une table figeait le français : `installerDemo` ne
   * pose la langue qu'ensuite. Le planning de la tondeuse annonçait « Pelouse
   * avant » ; la pièce de l'éclairage nocturne restait « Entrée », une clé
   * qu'aucune zone traduite ne retrouvait. */
  assert.ok(demo.includes('const ROB_CFG = () => (ROB_CFG_ || (ROB_CFG_ = {') && !/\bROB_CFG[.[]/.test(demo), 'ROB_CFG()');
  assert.ok(demo.includes("nom: etiquette('Pelouse avant'), segments: [] }"), 'la zone du planning');
  assert.ok(demo.includes('const NUI_CFG = () => (NUI_CFG_ || (NUI_CFG_ = {') && !/\bNUI_CFG[.[]/.test(demo), 'NUI_CFG()');
  assert.ok(demo.includes("pieces: { [lieu('Entrée')]: { actif: true,"), 'la pièce, clé dans la langue de la zone');
});

test('les pièces du robot et de son planning se disent dans la langue de la démo', () => {
  /* Relecture du 03/10 : la fiche du robot, en anglais, listait « Salon,
   * Cuisine, Bureau, Chambre, Entrée » et annonçait « Next run : Salon ·
   * Cuisine ». Les pièces viennent de l'attribut `rooms` du robot, mises en
   * forme par `vacNom` ; les zones d'un planning, de leur `nom`. */
  const robot = demo.slice(demo.indexOf("'vacuum.aspirateur': s("), demo.indexOf("'sensor.aspirateur_filtre'"));
  assert.ok(robot.includes('rooms: Object.fromEntries(') && robot.includes('lieu(nom).toLowerCase()'), 'les pièces annoncées passent par lieu()');
  assert.doesNotMatch(robot, /rooms: \{ ?\w+: \d/, 'une table de pièces écrite en français');
  const debut = demo.indexOf('const ROB_CFG = () =>');
  const plannings = demo.slice(debut, demo.indexOf('robots: {', debut));
  assert.deepEqual([...plannings.matchAll(new RegExp(String.raw`\bnom: ` + LIT, 'g'))].map(m => m[1] ?? m[2]), [],
    'une zone de planning nommée en clair reste française');
  assert.ok(plannings.includes("nom: lieu('Salon')") && plannings.includes("nom: lieu('Cuisine')"), 'les zones du planning');
});

test('le journal d’erreurs de la démo parle anglais, comme celui de Home Assistant', () => {
  /* Relecture du 03/10 : `erreursDemo()` répond à `system_log/list` et la vue
   * Système affiche `message[0]` tel quel. Home Assistant écrit son journal en
   * anglais, quelle que soit la langue de l'écran ; la démo l'écrivait en
   * français, pour tous ses visiteurs, sous des titres anglais (mqtt, rest,
   * zha…). Le filet ci-dessus ne lit que `name`, `model` et `summary`. Et pas
   * d'etiquette() ici : une vraie installation ne traduit pas ce journal. */
  const debut = demo.indexOf('function erreursDemo() {');
  assert.ok(debut >= 0, 'erreursDemo introuvable');
  const corps = demo.slice(debut, demo.indexOf('\n}\n', debut));
  const messages = [...corps.matchAll(new RegExp(String.raw`message: \[` + LIT, 'g'))].map(m => m[1] ?? m[2]);
  assert.ok(messages.length >= 8, 'la lecture de erreursDemo a échoué');
  assert.equal(messages.length, (corps.match(/\bmessage: /g) || []).length, 'un message écrit autrement qu’en littéral : Home Assistant ne traduit pas son journal');
  // Ni accent ni guillemet français, ni mot-outil français.
  const francais = messages.filter(m => !/^[\x20-\x7E]+$/.test(m) || /\b(?:de|du|des|la|le|les|au|aux|dans|une?|et|pour|sur|nouvelle)\b/i.test(m));
  assert.deepEqual(francais, [], 'à écrire en anglais, la langue du journal de Home Assistant');
});

test('chaque mot du journal de la démo a sa clé : un texte composé passe par ses parties', async () => {
  /* Relecture du 03/10. Sans `g`, `mot()` (journalmots.js) passe le champ à
   * `tr` tel quel. « soleil à 225° », « lever +15 min », « mouvement :
   * Entrée », « 3 min sans mouvement », « CO2 chambre : 1310 ppm, il faut
   * aérer »… n'étaient la clé de rien : le journal des règles de la démo
   * restait français dans les sept langues, quand le serveur envoie ses
   * parties. Ici : chaque mot fixe est une clé, chaque gabarit aussi, et le
   * français rendu suit ses parties, comme `rendre_fr`. */
  const { reglesDemo } = await import('../src/demo.js');
  const en = (await import('../src/langues/en.js')).default;
  const etat = reglesDemo({});
  assert.ok(etat.journal.length >= 10, 'la lecture du journal a échoué');
  /* Ce qui se lit pareil partout, et que le serveur écrit en clair lui aussi :
   * l'heure du coucher (« 23:30 ») et le geste technique d'un interrupteur. */
  const neutre = /^(\d{1,2}:\d{2}|[a-z0-9_]+ → [a-z_]+\.[a-z_]+)$/;
  const cle = (k) => Object.prototype.hasOwnProperty.call(en, k);
  const remplir = (gab, args) => Object.keys(args || {}).reduce((s, k) => s.split('{' + k + '}').join(String(args[k])), gab);
  const sansCle = [];
  for (const l of [...etat.journal, ...Object.values(etat.attentes)]) {
    for (const champ of ['regle', 'quoi', 'sens', 'motif', 'detail']) {
      // La règle d'un interrupteur est son NOM : il ne se traduit pas.
      if (champ === 'regle' && l.module === 'interrupteurs') continue;
      const parties = l.g && l.g[champ];
      if (parties) {
        for (const [gabarit] of parties) if (!cle(gabarit)) sansCle.push(champ + ' · ' + gabarit);
        assert.equal(l[champ], parties.map(([gab, args]) => remplir(gab, args)).join(' · '), 'le français rendu ne suit plus ses parties');
      } else if (l[champ] && !neutre.test(l[champ]) && !cle(l[champ])) sansCle.push(champ + ' · ' + l[champ]);
    }
  }
  assert.deepEqual(sansCle, [], 'sans clé, ces mots s’affichent en français dans les sept langues');
});
