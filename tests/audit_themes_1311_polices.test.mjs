// ─────────────────────────────────────────────────────────────────────────────
// Audit des thèmes du 13/11 — E5 : Google, Material et GitHub ont leur police.
//
// Constat : Loggia n'embarquait que Manrope, Newsreader et Outfit. Les thèmes
// Google et Material nomment Roboto, GitHub nomme Mona Sans : aucune n'était
// fournie, le système répondait — Segoe UI sur un PC, Roboto sur une tablette
// Android, San Francisco sur un iPhone. Le même thème changeait de tête d'un
// écran à l'autre.
// Décision D3a : embarquer Roboto et Mona Sans (SIL OFL 1.1), fichiers de
// @fontsource-variable 5.3.0 TELS QUELS, latin et latin étendu (le polonais).
// Un navigateur ne demande un fichier que si un glyphe emploie la famille :
// rien n'est chargé sous un autre thème. « SF Pro » et « Google Sans » ne sont
// pas libres : iOS garde la police du système, Google prend Roboto.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');
const feuille = lire('public', 'fonts', 'fonts.css');
const theme = lire('src', 'theme.js');
const BLOCS = [...feuille.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1]);
const champ = (b, nom) => { const m = b.match(new RegExp(nom + ':\\s*([^;]+);')); return m ? m[1].trim() : ''; };
const famille = (b) => champ(b, 'font-family').replace(/'/g, '');
const fichier = (b) => { const m = b.match(/url\(\.\/([^)]+)\)/); return m ? m[1] : ''; };
const LATIN = 'U+0000-00FF', LATIN_ETENDU = 'U+0100-02BA';

/* Les fichiers publiés par @fontsource-variable 5.3.0 : poids et empreinte. Un fichier retouché, ou d'une autre version, ne passe pas. */
const POLICES = {
  Roboto: { graisses: '100 900', fichiers: {
    'roboto-latin-wght-normal.woff2': [43136, '1404ca348bd75ef836f4dd8b6f2cc719458642d1237c368296b2fc652dca47dc'],
    'roboto-latin-ext-wght-normal.woff2': [29392, 'cedb374b05a35034cf96db185db4eeb8f8ce49e1a56197673702ff11b5533d6e'] } },
  'Mona Sans': { graisses: '200 900', fichiers: {
    'mona-sans-latin-wght-normal.woff2': [39788, 'a59061e38c5e7e6a00aaa6b6645a220c7d9c530991167f058cc0f8575f5d5844'],
    'mona-sans-latin-ext-wght-normal.woff2': [15524, '5adec652263260d219807b036bca9fe94ab6dc2ba6d30c0d45dc6a955dac270e'] } },
};

test('E5 — Roboto et Mona Sans sont déclarées : latin et latin étendu, toutes les graisses, sans bloquer le texte', () => {
  for (const [nom, p] of Object.entries(POLICES)) {
    const blocs = BLOCS.filter((b) => famille(b) === nom);
    assert.equal(blocs.length, 2, nom + ' : deux blocs attendus (latin, latin étendu)');
    assert.deepEqual(blocs.map(fichier).sort(), Object.keys(p.fichiers).sort(), nom + ' : les deux fichiers, et eux seuls');
    for (const b of blocs) {
      assert.equal(champ(b, 'font-weight'), p.graisses, nom + ' : la plage de graisses du fichier variable');
      assert.equal(champ(b, 'font-style'), 'normal');
      assert.equal(champ(b, 'font-display'), 'swap', nom + ' : le texte s’affiche tout de suite, la police le rejoint');
      assert.match(b, /format\('woff2'\)/);
      const etendu = fichier(b).includes('-latin-ext-');
      assert.ok(champ(b, 'unicode-range').startsWith(etendu ? LATIN_ETENDU : LATIN), fichier(b) + ' : la plage de caractères de son jeu');
    }
    /* Le polonais (ł, ą, ę…) vit dans le latin étendu : sans lui, un mot mélangerait deux polices. */
    assert.ok(blocs.some((b) => champ(b, 'unicode-range').startsWith(LATIN_ETENDU)), nom + ' : le latin étendu manque');
  }
});

test('E5 — les quatre fichiers sont là, tels que publiés', () => {
  for (const p of Object.values(POLICES)) for (const [f, [poids, empreinte]] of Object.entries(p.fichiers)) {
    const chemin = join(RACINE, 'public', 'fonts', f);
    assert.ok(existsSync(chemin), f + ' absent de public/fonts');
    const octets = readFileSync(chemin);
    assert.equal(octets.subarray(0, 4).toString('latin1'), 'wOF2', f + ' : ce n’est pas un fichier woff2');
    assert.equal(octets.length, poids, f + ' : poids');
    assert.equal(createHash('sha256').update(octets).digest('hex'), empreinte, f + ' : ce n’est pas le fichier publié');
  }
});

test('E5 — rien ne sort de la maison, et rien ne part avec la page', () => {
  for (const b of BLOCS) assert.match(b, /src:\s*url\(\.\/[^)/]+\.woff2\)/, 'une police doit venir du dossier de la feuille : ' + famille(b));
  assert.ok(!/url\(\s*['"]?(?:https?:)?\/\//.test(feuille), 'aucune adresse distante dans la feuille des polices');
  /* Pas de préchargement : ces polices ne servent qu'à trois thèmes. La page n'en précharge que deux (lot14_chargement). */
  const page = lire('index.html');
  for (const p of Object.values(POLICES)) for (const f of Object.keys(p.fichiers)) assert.ok(!page.includes(f), f + ' ne doit pas être préchargé');
});

test('E5 — chaque thème reçoit la police qu’il nomme en premier', () => {
  const pile = (cle) => { const d = theme.indexOf('\n  ' + cle + ': {'); assert.ok(d > 0, cle); const bloc = theme.slice(d, theme.indexOf('\n  },', d));
    const piles = [...bloc.matchAll(/\bfont: "([^"]+)"/g)].map((m) => m[1]); assert.equal(piles.length, 2, cle + ' : une pile en sombre, une en clair'); return piles; };
  for (const p of pile('google')) assert.ok(p.startsWith("'Roboto',"), 'Google : Roboto en tête');
  for (const p of pile('material')) assert.ok(p.startsWith("'Roboto',"), 'Material : Roboto en tête');
  for (const p of pile('github')) assert.ok(p.startsWith("'Mona Sans',"), 'GitHub : Mona Sans en tête');
  /* iOS : « SF Pro » n'est pas libre — la police du système, jamais une des deux embarquées. */
  for (const p of pile('ios')) assert.ok(!/Roboto|Mona Sans/.test(p), 'iOS garde la police du système');
  /* Pour tout thème : une famille nommée EN TÊTE entre apostrophes est une famille que Loggia fournit. */
  const fournies = new Set(BLOCS.map(famille));
  for (const m of theme.matchAll(/\bfont: "([^"]+)"/g)) {
    const tete = m[1].split(',')[0].trim();
    if (tete.startsWith("'")) assert.ok(fournies.has(tete.replace(/'/g, '')), 'un thème nomme en premier ' + tete + ', que public/fonts ne fournit pas');
  }
});

test('E5 — sous GitHub, le zéro n’est pas barré : les chiffres prennent leur largeur naturelle (son choix « B »)', () => {
  /* Mona Sans barre le zéro de ses chiffres à chasse fixe ; `"zero" 0` n'y change rien (essayé). Loggia écrit
   * `tabular-nums` partout : le thème GitHub, et lui seul, s'en dispense. */
  const css = lire('src', 'index.css');
  const d = theme.indexOf('\n  github: {'), bloc = theme.slice(d, theme.indexOf('\n  },', d));
  assert.equal((bloc.match(/chiffres: 'naturels'/g) || []).length, 2, 'GitHub : en sombre ET en clair');
  /* `", chiffres:` — la clé d'un preset, à la suite de sa pile de polices ; pas la mention d'un commentaire. */
  assert.equal((theme.match(/", chiffres: 'naturels'/g) || []).length, 2, 'aucun autre thème : Roboto et Manrope n’ont pas de zéro barré');
  assert.match(theme, /root\.classList\.toggle\('loggia-chiffres-naturels', v\.chiffres === 'naturels'\)/, 'le thème pose sa classe');
  /* Quitter GitHub pour le thème de base (aucune variante appliquée) doit rendre la chasse fixe. */
  assert.match(theme, /root\.classList\.remove\('loggia-chiffres-naturels'\)/, 'la remise à zéro retire la classe');
  const regle = css.match(/html\.loggia-chiffres-naturels, html\.loggia-chiffres-naturels \* \{([^}]*)\}/);
  assert.ok(regle, 'la règle des chiffres naturels manque');
  assert.match(regle[1], /font-variant-numeric:\s*normal\s*!important/, '`!important` : plus de cent composants écrivent tabular-nums en ligne');
  /* Elle vient APRÈS la règle générale, et celle-ci reste : tous les autres thèmes gardent leurs chiffres qui ne gigotent pas. */
  const generale = css.indexOf('body, button, input, select, textarea { font-variant-numeric: tabular-nums; }');
  assert.ok(generale > 0 && css.indexOf('html.loggia-chiffres-naturels,') > generale);
});
