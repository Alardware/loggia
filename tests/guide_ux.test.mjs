// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Le guide de l'interface (21/11, son « Oui, rédige-le » sur la planche) : docs/guide-ux.md.
//
// Le guide cite des composants, des jetons, des décisions et des tests. Ce test vérifie qu'ils existent encore : un
// composant renommé, une décision déplacée ou un test retiré fait échouer la suite, et le guide se corrige avec — sinon
// il finirait par mentir sans que personne le voie.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');
const guide = lire('docs', 'guide-ux.md');

// Les règles : « ### N. Titre », jusqu'à la suivante.
const REGLES = guide.split(/\n(?=### \d+\. )/).filter(b => /^### \d+\. /.test(b))
  .map(b => ({ n: Number(/^### (\d+)\. /.exec(b)[1]), texte: b }));
// Le paragraphe « Tenu par » d'une règle, qui peut tenir sur deux lignes.
const tenuPar = (texte) => { const m = /\*\*Tenu par\.\*\* ([\s\S]*?)(?:\n\n|\n---|$)/.exec(texte); return m ? m[1] : ''; };
const TOUS = REGLES.map(r => tenuPar(r.texte)).join('\n');

// ASSERTION MODIFIÉE (21/11, ADR 0387) : 45 -> 46, « une commande n'apparaît que si l'entité la publie ».
test('le guide compte ses 46 règles, dans l’ordre, chacune complète', () => {
  assert.deepEqual(REGLES.map(r => r.n), Array.from({ length: 46 }, (_, i) => i + 1));
  for (const { n, texte } of REGLES) {
    for (const partie of ['**La règle.**', '**Pourquoi.**', '**Oui.**', '**Non.**', '**Tenu par.**']) {
      assert.ok(texte.includes(partie), `règle ${n} : il manque ${partie}`);
    }
  }
});

test('chaque composant cité existe encore là où le guide le dit', () => {
  const cites = [...TOUS.matchAll(/`(src\/[^`]+)` › `(\w+)`/g)];
  assert.ok(cites.length >= 12, 'le guide cite ses composants');
  for (const [, fichier, nom] of cites) {
    assert.ok(existsSync(join(RACINE, fichier)), `${fichier} n'existe plus`);
    assert.match(lire(fichier), new RegExp(`(function|const|class) ${nom}\\b`), `${nom} n'est plus défini dans ${fichier}`);
  }
});

test('chaque décision citée a son fichier', () => {
  const decisions = readdirSync(join(RACINE, 'docs', 'decisions'));
  const numeros = [...TOUS.matchAll(/ADR ((?:\d{4}(?:, )?)+)/g)].flatMap(m => m[1].split(', '));
  assert.ok(numeros.length >= 30, 'le guide renvoie à ses décisions');
  for (const n of numeros) assert.ok(decisions.some(f => f.startsWith(n + '-')), `ADR ${n} introuvable dans docs/decisions`);
});

test('chaque test cité existe encore', () => {
  const tests = [...TOUS.matchAll(/`(tests\/[\w.-]+\.test\.mjs)`/g)].map(m => m[1]);
  assert.ok(tests.length >= 20, 'le guide renvoie à ses tests');
  for (const t of tests) assert.ok(existsSync(join(RACINE, t)), `${t} n'existe plus`);
});

test('chaque jeton cité est un jeton du thème', () => {
  const theme = lire('src', 'theme.js') + lire('src', 'styles.js') + lire('src', 'contraste.js');
  const jetons = [...TOUS.matchAll(/`(--o-[\w-]+)`/g)].map(m => m[1]);
  assert.ok(jetons.length >= 4);
  for (const j of jetons) assert.ok(theme.includes(j), `${j} n'est plus un jeton du thème`);
});

test('les deux README et le glossaire mènent au guide', () => {
  // Le 21/11, à sa demande : le lien vit dans « Développement » / « Development », et en tête du glossaire.
  for (const f of ['README.md', 'README.fr.md']) {
    assert.ok(lire(f).includes('[docs/guide-ux.md](docs/guide-ux.md)'), `${f} ne mène plus au guide`);
  }
  assert.ok(lire('docs', 'GLOSSAIRE.md').includes('[guide-ux.md](guide-ux.md)'), 'le glossaire ne mène plus au guide');
});

test('le guide est public : rien d’une maison réelle', () => {
  // Aucune entité Home Assistant nommée : les exemples restent génériques.
  assert.doesNotMatch(guide, /\b(light|switch|climate|sensor|binary_sensor|cover|media_player|vacuum|lock|camera)\.[a-z0-9_]+\b/);
});
