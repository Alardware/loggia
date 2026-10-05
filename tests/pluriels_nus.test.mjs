/* Les deux gabarits d'un pluriel arrivent NUS à trN (audit du 03/10,
 * constat « pluriels »).
 *
 * `trN(n, un, plusieurs)` choisit la clé d'après `n`, puis `tr` départage
 * l'objet de formes du polonais — { few, many, other } — d'après ce même `n`
 * (ADR 0071). Huit appels de `App.jsx` lui passaient des textes DÉJÀ
 * traduits : appelé sans nombre, `tr('{n} icônes')` avait tranché l'objet en
 * « other » avant que `n` n'arrive. Un écran polonais disait « 3 ikon » au
 * lieu de « 3 ikony », et « 5 innej osoby » — la forme des fractions — au
 * lieu de « 5 innych osób ». En français comme en anglais, rien ne se
 * voyait : deux formes, et la bonne sortait toujours.
 *
 * Le premier test lit les appels de `src/` : chaque gabarit est un littéral,
 * ni un `tr(…)` ni une expression que `tout_tr_traduit` ne saurait plus
 * vérifier. Le deuxième fait parler le polonais. Le troisième tient le
 * nombre que la cloche annonce, trouvé faux sur les mêmes lignes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(RACINE, 'src');

// La langue se résout À L'IMPORT d'i18n.js : le polonais et son catalogue
// sont posés avant, là où l'amorce les dépose (`window.__loggiaCatalogue`).
const PL = (await import(pathToFileURL(join(SRC, 'langues', 'pl.js')).href)).default;
Object.defineProperty(globalThis, 'navigator', { value: { language: 'pl-PL' }, configurable: true });
globalThis.window = { __loggiaCatalogue: { code: 'pl', cat: PL } };
const { tr, trN, langue } = await import(pathToFileURL(join(SRC, 'i18n.js')).href);

const fichiers = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) { if (f !== 'langues') walk(p); }
    else if (/\.jsx?$/.test(f)) fichiers.push(p);
  }
})(SRC);
const nom = (f) => relative(SRC, f).replace(/\\/g, '/');

/* Les commentaires blanchis — un commentaire peut citer la forme fautive pour
 * l'expliquer —, les chaînes sautées : `accept="image/*"` n'ouvre pas de
 * commentaire. Les sauts de ligne restent, et les numéros de ligne avec. */
const blanc = (m) => m.replace(/[^\n]/g, ' ');
const sansCommentaires = (s) => s.replace(
  /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
  (m) => (m.startsWith('/*') || m.startsWith('//') ? blanc(m) : m));

/* Les arguments de premier niveau d'un appel, `i` juste après sa parenthèse. */
function argumentsDe(s, i) {
  const args = [];
  let prof = 0, debut = i, q = null;
  for (let k = i; k < s.length; k++) {
    const c = s[k];
    if (q) { if (c === '\\') k++; else if (c === q) q = null; continue; }
    if (c === "'" || c === '"' || c === '`') q = c;
    else if ('([{'.includes(c)) prof++;
    else if (')]}'.includes(c)) {
      if (prof === 0) { args.push(s.slice(debut, k).trim()); return args; }
      prof--;
    } else if (c === ',' && prof === 0) { args.push(s.slice(debut, k).trim()); debut = k + 1; }
  }
  return null;
}

const LITTERAL = /^(?:'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")$/;
const APPELS = [];
for (const f of fichiers) {
  const s = sansCommentaires(readFileSync(f, 'utf8'));
  for (const m of s.matchAll(/\btrN\(/g)) {
    if (/function\s+$/.test(s.slice(Math.max(0, m.index - 12), m.index))) continue; // la définition
    APPELS.push({
      ou: nom(f) + ':' + s.slice(0, m.index).split('\n').length,
      args: argumentsDe(s, m.index + m[0].length),
    });
  }
}

test('les deux gabarits de chaque trN sont des littéraux — jamais un tr(…)', () => {
  // Sans ce garde-fou, une lecture cassée rendrait le test toujours vert.
  assert.ok(APPELS.length >= 15, `seulement ${APPELS.length} appels de trN trouvés : la lecture est cassée`);
  const fautifs = APPELS
    .filter(a => !a.args || a.args.length < 3 || !LITTERAL.test(a.args[1]) || !LITTERAL.test(a.args[2]))
    .map(a => a.ou + '  ' + (a.args ? a.args.slice(1, 3).join(' | ') : '(illisible)'));
  assert.deepEqual(fautifs, [],
    'traduit d’abord, sans nombre, l’objet de formes polonais sort toujours en « other » : passe les clés nues');
});

test('en polonais, la forme suit le nombre : 2 à 4 et 22 « few », 5 et plus « many »', () => {
  assert.equal(langue(), 'pl', 'le catalogue polonais n’est pas chargé : le test ne prouverait rien');
  assert.deepEqual([1, 3, 5, 22].map(n => trN(n, '{n} icône', '{n} icônes')),
    ['1 ikona', '3 ikony', '5 ikon', '22 ikony']);
  assert.equal(trN(3, '{n} résultat', '{n} résultats'), '3 wyniki');
  assert.equal(trN(3, '{n} appareil', '{n} appareils'), '3 urządzenia');
  assert.equal(trN(5, '{n} autre personne', '{n} autres personnes'), '5 innych osób');
  /* Le défaut lui-même : sans nombre, `tr` ne peut prendre que « other », la
   * forme des fractions — ce que ces appels affichaient, quel que soit le compte. */
  assert.equal(tr('{n} autres personnes'), '{n} innej osoby');
});

test('un compte ne se tranche pas à la française : `n > 1 ? tr(…) : tr(…)` passe par trN', () => {
  /* Relecture du 03/10 : dix-neuf comptes choisissaient leur clé par la règle
   * française, `n > 1`. Zéro tombait au SINGULIER, juste en français : la
   * fiche du robot disait « 5 stref · 0 wybrana » (au lieu de « 0 wybranych »),
   * une vue vide « 0 card ». `trN` tranche par `n === 1`, et le catalogue
   * départage le reste. Une phrase au singulier SANS nombre (« Fenêtre
   * ouverte », gardée par n ≥ 1) reste permise. */
  const CLE_N = String.raw`'(?:[^'\\\n]|\\.)*\{n\}(?:[^'\\\n]|\\.)*'`;
  const motif = new RegExp(String.raw`[\w$.\]]+ > 1 \? tr\(` + CLE_N + String.raw`, \{[^}]*\}\) : tr\(` + CLE_N, 'g');
  const fautifs = [];
  for (const f of fichiers) {
    const s = sansCommentaires(readFileSync(f, 'utf8'));
    for (const m of s.matchAll(motif)) fautifs.push(nom(f) + ':' + s.slice(0, m.index).split('\n').length + '  ' + m[0].slice(0, 70));
  }
  assert.deepEqual(fautifs, [], 'zéro prend la forme du pluriel hors du français : trN(n, singulier, pluriel)');
  assert.equal(trN(0, '{n} sélectionnée', '{n} sélectionnées'), '0 wybranych', 'zéro, en polonais');
  assert.equal(trN(1, '{n} sélectionnée', '{n} sélectionnées'), '1 wybrana');
});

test('la cloche annonce le nombre des NON LUES, pas la longueur du journal', () => {
  /* « Lu » vit dans le journal depuis le 01/10 : `notifs` garde aussi les
   * lues, et la cloche disait « 7 non lues » pour deux. Les deux portes — le
   * bandeau et la carte compte du tiroir — comptent comme leur pastille. */
  const app = readFileSync(join(SRC, 'App.jsx'), 'utf8');
  assert.equal(app.split("trN(nbNonVues, '{n} non lue', '{n} non lues')").length - 1, 2, 'les deux cloches');
  assert.ok(!app.includes('trN(notifs.length'), 'un compte qui mêle les lues aux non lues');
});
