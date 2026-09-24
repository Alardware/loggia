// ─────────────────────────────────────────────────────────────────────────────
// Tout ce qui passe par tr() a sa traduction (24/09, plan S6).
//
// Quatre tests recopiaient à la main une liste de libellés — « les mots de
// l'accueil ont leur traduction », « les mots du composeur », et deux autres —
// et vérifiaient que chacun était au catalogue. L'intention était bonne. La
// liste, elle, ne se met pas à jour toute seule : six des dix-sept libellés de
// l'accueil n'existaient plus à l'écran, et le test les tenait pour vivants.
//
// Ce test-ci ne recopie rien : il LIT les appels. Tout texte littéral passé à
// `tr()` ou `trN()` dans `src/` doit avoir sa clé. Il couvre 1 953 textes au
// lieu d'une cinquantaine, et il ne peut pas rouiller.
//
// Il a trouvé deux manques en naissant : les étiquettes de lecteur d'écran
// `tr('Rechercher')` et `tr('Nom')` sortaient en français dans les six langues.
//
// L'INVERSE — une clé de catalogue que plus rien n'appelle — est vérifié par
// `catalogue_sans_appel` ci-dessous. Les deux ensemble tiennent les catalogues
// exactement à la taille de ce qui s'affiche.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const RACINE = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const parcourir = (dir, filtre, sortie = []) => {
  for (const nom of readdirSync(dir)) {
    const p = join(dir, nom);
    if (statSync(p).isDirectory()) { if (nom !== 'langues') parcourir(p, filtre, sortie); }
    else if (filtre.test(nom)) sortie.push(p);
  }
  return sortie;
};

const court = (p) => p.slice(RACINE.length).replace(/\\/g, '/');
const decode = (s) => s.replace(/\\n/g, '\n').replace(/\\'/g, "'")
  .replace(/\\"/g, '"').replace(/\\\\/g, '\\');

/* Un littéral simple, apostrophes échappées comprises. Les gabarits `...` et
 * les expressions sont hors de portée : ce ne sont pas des clés fixes. */
const LIT = String.raw`'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"`;
const TR = new RegExp(String.raw`\btr\(\s*(?:${LIT})`, 'g');
const TRN = new RegExp(String.raw`\btrN\(\s*[^,()]+,\s*(?:${LIT})\s*,\s*(?:${LIT})`, 'g');
/* `tr(n > 1 ? 'des' : 'un')` : la condition passe avant le texte. Trois
 * endroits l'écrivent ainsi, et une extraction qui ne les voit pas laisserait
 * six textes sans garde. */
const TERNAIRE = new RegExp(String.raw`\btr\(\s*[^'"(),]+\?\s*(?:${LIT})\s*:\s*(?:${LIT})`, 'g');

const APPELS = new Map(); // texte -> premier fichier vu
for (const p of parcourir(join(RACINE, 'src'), /\.(js|jsx)$/)) {
  const s = readFileSync(p, 'utf8');
  const poser = (brut) => {
    const t = decode(brut);
    if (t && !APPELS.has(t)) APPELS.set(t, court(p));
  };
  for (const m of s.matchAll(TR)) poser(m[1] ?? m[2]);
  for (const m of s.matchAll(TRN)) { poser(m[1] ?? m[2]); poser(m[3] ?? m[4]); }
  for (const m of s.matchAll(TERNAIRE)) { poser(m[1] ?? m[2]); poser(m[3] ?? m[4]); }
}

const en = (await import(pathToFileURL(join(RACINE, 'src', 'langues', 'en.js')).href)).default;
const CLES = new Set(Object.keys(en));

test('tout texte passé à tr() ou trN() a sa clé au catalogue', () => {
  const manquants = [...APPELS].filter(([t]) => !CLES.has(t))
    .map(([t, f]) => `${JSON.stringify(t)} — ${f}`);
  assert.deepEqual(manquants, [],
    'ces textes s’affichent en français dans les six langues : ajoute-les aux catalogues');
});

test('le balayage trouve bien les appels : il en voit plus d’un millier', () => {
  // Sans ce garde-fou, une expression régulière cassée rendrait le test
  // ci-dessus toujours vert — et silencieux.
  assert.ok(APPELS.size > 1500, `seulement ${APPELS.size} appels trouvés : le balayage est cassé`);
});

/* Le corpus où une clé peut être appelée : l'interface, et le composant, qui
 * envoie ses mots de journal et ses notifications en français — `journalmots.js`
 * les repasse par `tr`. `scripts/` porte la liste des clés du téléphone. */
const CORPUS = [
  ...parcourir(join(RACINE, 'src'), /\.(js|jsx)$/),
  ...parcourir(join(RACINE, 'custom_components', 'loggia'), /\.(py|json|yaml)$/)
    .filter(p => !/__pycache__|frontend/.test(p)),
  ...readdirSync(join(RACINE, 'scripts')).map(f => join(RACINE, 'scripts', f)),
].map(p => readFileSync(p, 'utf8')).join('\n');

test('aucune clé de catalogue que plus rien n’appelle', () => {
  /* La clé EST le texte français. On la cherche telle quelle, PARTOUT — pas
   * seulement dans un `tr('…')` : beaucoup de textes transitent par une table
   * (`MESURES_NOMS`, `WX_NOMS`) avant d'y arriver, et les gabarits du serveur
   * vivent dans les `.py`. Chercher le littéral est la seule méthode qui ne
   * tue pas de vivant. */
  const orphelines = [...CLES].filter(c => !CORPUS.includes(c));
  assert.deepEqual(orphelines, [],
    'ces clés sont traduites six fois et ne s’afficheront jamais : retire-les des catalogues');
});
