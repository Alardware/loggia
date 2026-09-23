/* Le README dit vrai (plan du 22/09, point M4).
 *
 * Sa règle est simple : ce que le README affirme du code doit être vérifiable
 * dans le code. Six affirmations avaient cessé de l'être sans que rien ne le
 * signale — « sept commandes » quand il y en avait douze, « le jeton lu à un
 * seul endroit » quand il y en avait trois, une désignation du distributeur
 * qu'aucun écran n'offrait, une barre du bas qui répondait aussi à la largeur.
 *
 * Un chiffre ou une promesse du README se vérifie donc ICI, contre sa source.
 * Le même garde-fou que `pages_legales.test.mjs` tient sur les pages du site. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const README = lire('README.md');

/* Les chiffres en toutes lettres : le README écrit « douze », pas « 12 ». */
const MOTS = ['zéro', 'une', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix',
  'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'];
const enLettres = (n) => MOTS[n] || String(n);

test('le nombre de commandes réservées aux administrateurs', () => {
  /* La liste qui fait foi est celle de `test_websocket_api.py` : elle épingle
   * déjà quelles commandes portent `require_admin`, et refuse qu'une commande
   * nouvelle échappe au classement. Le README la compte. */
  const py = lire('tests', 'python', 'test_websocket_api.py');
  const bloc = py.slice(py.indexOf('ADMIN_SEULEMENT = ['));
  const liste = bloc.slice(0, bloc.indexOf(']'));
  const n = (liste.match(/"WS_[A-Z_]+"/g) || []).length;
  assert.ok(n > 0, 'la liste des commandes admin est illisible');
  const m = README.match(/sur les ([a-zé]+) commandes WebSocket/);
  assert.ok(m, 'le README ne dit plus combien de commandes sont réservées');
  assert.equal(m[1], enLettres(n),
    `le README annonce « ${m[1]} » commandes réservées, il y en a ${n}`);
});

test('le nombre total de commandes WebSocket, dans le docstring du composant', () => {
  const ws = lire('custom_components', 'loggia', 'websocket_api.py');
  const n = (ws.match(/^WS_[A-Z_]+ = "/gm) || []).length;
  const m = ws.match(/Les (\d+) commandes/);
  assert.ok(m, 'le docstring ne dit plus combien de commandes il documente');
  assert.equal(Number(m[1]), n, `le docstring annonce ${m[1]} commandes, il y en a ${n}`);
});

test('le jeton d’accès : le README ne promet plus « un seul endroit »', () => {
  /* Il est lu pour les images — la caméra, la carte du robot —, et le README
   * doit dire cela, pas un compte qui se démentira à la prochaine image. */
  const sources = ['camera.jsx', 'vacplan.jsx', 'App.jsx', 'ui.jsx']
    .map(f => lire('src', f)).join('\n');
  const lectures = (sources.match(/auth\.data\.access_token/g) || []).length;
  assert.ok(lectures >= 1, 'plus aucune lecture du jeton : la phrase du README est à réécrire');
  assert.ok(!/jeton[^.]*lu \*\*à un seul endroit\*\*/.test(README),
    `le README promet une seule lecture du jeton ; il y en a ${lectures}`);
  assert.match(README, /jeton d'accès Home Assistant n'est lu que \*\*pour les images\*\*/,
    'le README ne dit plus à quoi sert le jeton');
});

test('« le TYPE d’appareil décide, jamais la largeur » : aucune règle de largeur ne montre la barre du bas', () => {
  const css = lire('src', 'index.css');
  assert.match(README, /le TYPE d'appareil qui décide, jamais\s+la largeur/,
    'le README ne promet plus la règle : ce test n’a plus d’objet');
  /* Chaque bloc `@media (max-width: …)` est relu en entier : la barre du bas et
   * l'assistant qu'elle reprend n'ont rien à y faire. */
  for (const m of css.matchAll(/@media \(max-width: \d+px\)/g)) {
    let i = css.indexOf('{', m.index), n = 0;
    for (let j = i; j < css.length; j += 1) {
      if (css[j] === '{') n += 1;
      else if (css[j] === '}') { n -= 1; if (n === 0) { i = j; break; } }
    }
    const bloc = css.slice(m.index, i + 1);
    assert.ok(!/\.loggia-mobilenav \{[^}]*display: flex/.test(bloc),
      `${m[0]} montre la barre du bas : une fenêtre étroite à la souris aurait les deux navigations`);
  }
  assert.match(css, /html\.loggia-tactile \.loggia-mobilenav \{ display: flex/,
    'plus rien ne montre la barre du bas sur un écran tactile');
});

test('ce que le README dit se désigner « sur la page concernée » a bien un écran', () => {
  const par = lire('src', 'views', 'parametres.jsx');
  const debut = par.indexOf('export const VIEW_ENT_SECTIONS = {');
  const table = par.slice(debut, debut + par.slice(debut).indexOf('};'));
  const sections = new Set([...table.matchAll(/'([a-z]+)'/g)].map(m => m[1]));
  /* Le distributeur de croquettes : promis par le README, et jusqu'au 23/09
   * écrit par la seule démonstration. */
  assert.match(README, /un \*\*distributeur de croquettes\*\*/, 'le README ne le promet plus');
  assert.ok(sections.has('feeder'),
    'le README promet de désigner le distributeur sur la page concernée, aucune vue ne l’offre');
  const veilles = lire('src', 'views', 'veilles.jsx');
  assert.match(README, /les \*\*capteurs de consommable\*\*/, 'le README ne les promet plus');
  assert.match(veilles, /consommables/, 'Règles › Veilles ne désigne plus les consommables');
  const presence = lire('src', 'views', 'presence.jsx');
  assert.match(README, /le \*\*mode invité\*\*/, 'le README ne le promet plus');
  assert.match(presence, /input_boolean/, 'Règles › Présence ne désigne plus le mode invité');
});

test('les paramètres d’aperçu de la démo existent, et « lang » couvre toutes les langues', async () => {
  /* Le README annonçait `lang=fr|en` bien après l'arrivée des cinq autres :
   * la démo en accepte sept, et son texte en promettait deux. Un paramètre
   * d'aperçu ne se voit pas à l'écran — personne ne remarque qu'il ment. */
  const main = lire('src', 'main.jsx');
  /* `fiche` se lit plus tard que les autres — il ouvre un appareil, pas un
   * réglage d'amorçage — et vit donc dans App.jsx. */
  const lecteurs = main + '\n' + lire('src', 'App.jsx');
  const { LANGUES } = await import(new URL('../src/langues/index.js', import.meta.url));
  const servies = LANGUES.filter(l => l.code !== 'auto').length;
  assert.ok(README.includes("`lang=<le code d'une des " + enLettres(servies) + " langues>`"),
    'le README ne dit pas combien de langues le paramètre d’aperçu accepte');
  for (const p of ['mode', 'lang', 'theme', 'vue', 'fiche']) {
    assert.ok(lecteurs.includes(".get('" + p + "')"), `le README annonce ?${p}=, la démo ne le lit plus`);
  }
  assert.match(main, /langueServie\(lg\)/,
    'la démo ne valide plus « lang » par la liste des langues servies');
});

test('les cartes template : le README les vend, le composeur sait en poser', () => {
  assert.match(README, /\*\*cartes template\*\*/, 'le README ne les vend plus');
  const app = lire('src', 'App.jsx');
  const ui = lire('src', 'ui.jsx');
  assert.match(app, /<TplForm hass=\{hass\} onAdd=/,
    'le composeur n’offre plus de poser une carte template : le README promettrait du vide');
  assert.match(ui, /onAdd\(\{ t: 'tpl'/, 'le formulaire ne produit plus de carte template');
  assert.match(app, /t === 'tpl'|cvEstTpl/, 'plus rien ne rend une carte template');
});
