// ─────────────────────────────────────────────────────────────────────────────
// Une liste de libellés devenue fonction est-elle bien APPELÉE partout ?
//
// Les listes traduites (`PAR_TABS`, `CAMERAS`, `FIRST_USER`…) ne peuvent plus
// être des tableaux : construites à l'import, elles figeaient le texte dans la
// langue du démarrage et imposaient un rechargement à chaque changement. Elles
// sont donc écrites `const X = () => [...]` et appelées au rendu.
//
// Le piège est que la conversion est SILENCIEUSE. Un usage oublié compile,
// passe le lint, passe la CI — puis casse à l'écran, mais seulement dans la
// branche concernée. `visTabs = isAdmin ? PAR_TABS : PAR_TABS().filter(...)`
// a survécu à une session entière de tests parce que le compte de test
// n'était pas administrateur ; le tableau de bord est mort chez l'utilisateur,
// qui l'est.
//
// Ce test relit les sources, repère chaque constante MAJUSCULES définie comme
// fonction fléchée, et vérifie que toutes ses mentions sont suivies de `(`.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { parse } from 'espree';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(RACINE, 'src');

/** Tous les fichiers de code sous `src`, chemins absolus. */
function sources(rep) {
  const out = [];
  for (const nom of readdirSync(rep)) {
    const p = join(rep, nom);
    if (statSync(p).isDirectory()) out.push(...sources(p));
    else if (/\.jsx?$/.test(nom)) out.push(p);
  }
  return out;
}

/**
 * Efface les listes d'import et de ré-export en gardant les sauts de ligne,
 * pour que les numéros restent justes. Elles nomment les symboles sans les
 * appeler, et s'étalent souvent sur plusieurs lignes — un filtre ligne à ligne
 * les rate.
 *
 * Ne vise QUE ces listes. Une règle plus large (« de `export` au prochain
 * point-virgule ») avale le corps de `export default function App() {…}` et
 * rend le test aveugle sans rien signaler.
 */
const BLOCS = [
  /^[ \t]*import\s[\s\S]*?from\s*['"][^'"]*['"]\s*;?/gm,   // import { a, b } from '…'
  /^[ \t]*import\s*['"][^'"]*['"]\s*;?/gm,                  // import '…' (effet de bord)
  /^[ \t]*export\s*\{[^}]*\}(?:\s*from\s*['"][^'"]*['"])?\s*;?/gm, // export { a, b }
];

function sansImports(texte) {
  let out = texte;
  for (const re of BLOCS) out = out.replace(re, b => b.replace(/[^\n]/g, ' '));
  return out;
}

const FICHIERS = sources(SRC).map(p => {
  const brut = readFileSync(p, 'utf8');
  return { p, texte: brut, code: sansImports(brut) };
});

/* Les constantes MAJUSCULES écrites `= () =>`, quel que soit le fichier. */
const LISTES = new Set();
for (const { texte } of FICHIERS) {
  for (const m of texte.matchAll(/\b(?:const|let)\s+([A-Z][A-Z0-9_]{2,})\s*=\s*\(\s*\)\s*=>/g)) {
    LISTES.add(m[1]);
  }
}

test('des listes de libellés existent bien sous forme de fonctions', () => {
  assert.ok(LISTES.size >= 5,
    'moins de 5 listes-fonctions repérées (' + LISTES.size + ') — le repérage est cassé');
});

test('le masquage des imports ne dévore pas le code', () => {
  // Un masquage trop gourmand rend le test aveugle en silence : il ne trouve
  // plus rien à signaler et passe au vert. Une liste d'import ne contient ni
  // `=>` ni `function` ; s'il en disparaît, la règle a mordu dans le code.
  const compte = (t, re) => (t.match(re) || []).length;
  for (const { p, texte, code } of FICHIERS) {
    for (const [quoi, re] of [['=>', /=>/g], ['function', /\bfunction\b/g]]) {
      assert.equal(compte(code, re), compte(texte, re),
        relative(RACINE, p) + ' : le masquage a effacé des « ' + quoi +
        ' » — la règle déborde des listes d’import');
    }
  }
});

test('toute mention d’une liste-fonction est un appel', () => {
  const fautes = [];

  for (const { p, code } of FICHIERS) {
    code.split('\n').forEach((ligne, i) => {
      for (const nom of LISTES) {
        for (const m of ligne.matchAll(new RegExp('\\b' + nom + '\\b', 'g'))) {
          if (ligne[m.index + nom.length] === '(') continue;      // appel
          const avant = ligne.slice(0, m.index);
          if (/\b(?:const|let|var)\s+$/.test(avant)) continue;    // déclaration
          fautes.push(
            relative(RACINE, p) + ':' + (i + 1) + '  ' + nom +
            ' mentionné sans parenthèses → ' + ligne.trim().slice(0, 100)
          );
        }
      }
    });
  }

  assert.deepEqual(fautes, [], '\n' + fautes.join('\n') + '\n');
});

// ─────────────────────────────────────────────────────────────────────────────
// Le cas d'AVANT la conversion (relecture du 03/10). Le test précédent ne voit
// qu'une liste DÉJÀ écrite en fonction. `COMFORT`, la table de la fiche de
// confort d'une pièce, était restée un objet du module avec ses `tr()` dedans :
// bâtie une fois à l'import, elle gardait « Qualité de l'air » dans la langue
// du démarrage, et aucun filet ne la voyait.
//
// espree lit chaque source et relève tout appel qui dépend de la langue
// EXÉCUTÉ à l'import : hors de toute fonction, ou dans une fonction que le
// module exécute aussitôt (`[…].map(k => tr(k))`, `(() => tr(…))()`). Une
// fonction seulement gardée (`const X = () => …`, `memo(() => …)`) attend le
// rendu. Limite assumée : un utilitaire appelé à l'import qui appelle tr()
// lui-même n'est pas suivi.
// ─────────────────────────────────────────────────────────────────────────────

const DEPEND_LANGUE = new Set(['tr', 'trN', 'trSens', 'trCourt', 'trHA', 'nomProfil', 'nombre', 'locale', 'langue']);
const PORTEE = new Set(['ArrowFunctionExpression', 'FunctionExpression', 'FunctionDeclaration', 'ClassDeclaration', 'ClassExpression']);
/* Les méthodes de tableau qui exécutent leur fonction sur-le-champ. */
const IMMEDIATS = new Set(['map', 'flatMap', 'filter', 'forEach', 'reduce', 'some', 'every', 'find', 'sort']);
/* Restes connus, plus anciens que cette relecture (« fichier constante »).
 * La liste ne fait que rétrécir : un reste converti doit en sortir. */
const RESTES = ['src/App.jsx HUE_SCENES', 'src/App.jsx VIEW_TITLES', 'src/Onboarding.jsx VIEW_TITLES'];

test('rien de ce qui dépend de la langue ne s’évalue à l’import', () => {
  const fautes = [], vus = new Set();
  for (const { p, texte } of FICHIERS) {
    if (p.startsWith(join(SRC, 'langues'))) continue;          // les catalogues : des données
    const fichier = relative(RACINE, p).split(sep).join('/');
    const ast = parse(texte, { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true }, loc: true });
    for (const st of ast.body) {
      const decl = st.declaration || st;                        // `export const …` compris
      const nom = decl.type === 'VariableDeclaration' ? decl.declarations.map(d => d.id.name || d.id.type).join(', ') : decl.type;
      const visiter = (n, executee = false) => {
        if (!n || typeof n.type !== 'string') return;
        if (PORTEE.has(n.type) && !executee) return;            // gardée, pas exécutée : appelée au rendu
        if (n.type === 'CallExpression') {
          if (n.callee.type === 'Identifier' && DEPEND_LANGUE.has(n.callee.name)) {
            const cle = fichier + ' ' + nom;
            if (RESTES.includes(cle)) vus.add(cle);
            else fautes.push(fichier + ':' + n.loc.start.line + '  ' + n.callee.name + '() à l’import, dans ' + nom);
          }
          visiter(n.callee, PORTEE.has(n.callee.type));         // (() => …)() : exécutée sur-le-champ
          const parcours = n.callee.type === 'MemberExpression' && IMMEDIATS.has(n.callee.property.name);
          n.arguments.forEach(a => visiter(a, parcours));       // […].map(k => …) : idem
          return;
        }
        for (const [k, v] of Object.entries(n)) {
          if (k === 'loc' || k === 'range') continue;
          if (Array.isArray(v)) v.forEach(x => visiter(x));     // pas forEach(visiter) : l'index passerait pour `executee`
          else if (v && typeof v.type === 'string') visiter(v);
        }
      };
      visiter(st);
    }
  }
  assert.deepEqual(fautes, [], '\n' + fautes.join('\n') + '\n→ en faire une fonction appelée au rendu : `const X = () => (…)`\n');
  assert.deepEqual(RESTES.filter(r => !vus.has(r)), [], 'reste converti : le retirer de RESTES');
});
