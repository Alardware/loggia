// ─────────────────────────────────────────────────────────────────────────────
// Un composant qui enveloppe un champ de saisie ne se définit pas dans un autre.
//
// React identifie un élément par son TYPE. Une fonction déclarée dans le corps
// d'un composant est recréée à chaque rendu : nouvelle référence, donc nouveau
// type au même endroit, donc React démonte le sous-arbre et le remonte. Le
// nœud du DOM est jeté, un neuf prend sa place.
//
// Sur un bouton, cela ne se voit pas. Sur un champ de saisie, c'est fatal :
//
//   • à chaque lettre tapée le champ est détruit, le focus tombe sur le
//     document, et il faut recliquer pour la lettre suivante ;
//   • `onBlur` ne part JAMAIS — un nœud retiré du document n'a pas perdu le
//     focus, il l'a emporté —, donc ce que l'on tape n'est jamais enregistré.
//
// Le second point est le pire, parce qu'il est muet. Le champ affiche la
// valeur : elle vit dans l'état du parent, qui lui ne remonte pas. On croit
// avoir saisi quelque chose. Au rechargement, il n'y a rien.
//
// Mesuré le 09/09/2026 sur trois champs, tous cassés de la même façon :
//
//   • le nom de l'assistant (Paramètres → Connexion), enveloppé de `SecBar` et
//     `SecGroup` — signalé : « je met une lettre je suis obliger de recliquer
//     dessus pour pouvoir mettre la 2éme lettre » ;
//   • les marges du tableau de bord (Apparence), glissière dans `MarginRow`,
//     elle-même sous `AppCard` et `OptRow` : la poignée lâchait au premier
//     mouvement ;
//   • les nombres des règles de volets, dans `Nombre`.
//
// Aucune de ces trois n'apparaissait au lint, aux tests ou dans la console.
//
// La règle vérifiée ici est étroite à dessein : elle ne dit pas « jamais de
// composant interne », elle dit « pas de composant interne AUTOUR d'un
// contrôle de formulaire ». C'est exactement la faute, elle se constate sans
// liste d'exceptions à entretenir, et elle se déclenche le jour où quelqu'un
// ajoute un champ dans un composant interne — c'est-à-dire au moment précis où
// cela devient un bug.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Toutes les sources du produit, chemin relatif et contenu. */
function sources() {
  const out = [];
  (function marcher(rep) {
    for (const f of readdirSync(rep)) {
      const p = join(rep, f);
      if (statSync(p).isDirectory()) marcher(p);
      else if (f.endsWith('.jsx') || f.endsWith('.js')) {
        out.push([relative(RACINE, p).split('\\').join('/'), readFileSync(p, 'utf8')]);
      }
    }
  })(join(RACINE, 'src'));
  return out;
}

// Ce qui prend le focus et le perd en silence quand on le remonte.
const CONTROLE = /<(input|textarea|select)\b|contentEditable/;

/** Déclaration indentée d'un identifiant capitalisé : un composant imbriqué. */
const DECL = /^([ \t]+)(?:(?:const|let)\s+([A-Z][A-Za-z0-9_]*)\s*=\s*(?:\(|function|memo\(|React\.memo\()|function\s+([A-Z][A-Za-z0-9_]*)\s*\()/;

/**
 * Le corps de la définition qui commence à `depart`, par équilibrage des
 * parenthèses et des accolades. Compter les lignes se tromperait : ces
 * composants tiennent sur cinq lignes comme sur trente.
 */
function corps(src, depart) {
  let i = src.indexOf('(', depart);
  if (i < 0) return '';
  let p = 0, a = 0;
  const debut = i;
  for (; i < src.length; i += 1) {
    const c = src[i];
    if (c === '(') p += 1;
    else if (c === ')') { p -= 1; if (p === 0 && a === 0) return src.slice(debut, i + 1); }
    else if (c === '{') a += 1;
    else if (c === '}') a -= 1;
  }
  return src.slice(debut);
}

/**
 * Ce qui est passé en enfants à `<Nom>…</Nom>`, toutes utilisations confondues.
 *
 * Un composant peut n'avoir aucun champ chez lui et n'en être pas moins
 * fatal : `SecBar` et `SecGroup` n'ont jamais contenu d'`<input>`, ils
 * l'enveloppaient. Remonter le parent remonte l'enfant.
 */
function enfants(src, nom) {
  const out = [];
  const ouvre = new RegExp('<' + nom + '(?=[\\s/>])', 'g');
  const ferme = '</' + nom + '>';
  let m;
  while ((m = ouvre.exec(src)) !== null) {
    const fin = src.indexOf(ferme, m.index);
    if (fin < 0) continue;                       // balise auto-fermante : pas d'enfants
    let bloc = src.slice(m.index, fin);
    // Une occurrence imbriquée du même composant décalerait la fermeture ; on
    // s'arrête alors au premier `</Nom>`, ce qui ne peut que sous-estimer.
    const debutEnfants = bloc.indexOf('>');
    if (debutEnfants > 0) bloc = bloc.slice(debutEnfants);
    out.push(bloc);
  }
  return out.join('\n');
}

/** Les composants définis dans un autre composant et employés comme balise. */
function internes(src) {
  const trouves = [];
  let pos = 0;
  for (const l of src.split('\n')) {
    const m = DECL.exec(l);
    if (m) {
      const nom = m[2] || m[3];
      if (new RegExp('<' + nom + '(?=[\\s/>])').test(src)) trouves.push({ nom, index: pos });
    }
    pos += l.length + 1;
  }
  return trouves;
}

test('aucun composant interne n’enveloppe un contrôle de formulaire', () => {
  const fautes = [];
  for (const [chemin, src] of sources()) {
    for (const c of internes(src)) {
      const dedans = CONTROLE.test(corps(src, c.index));
      const dessous = CONTROLE.test(enfants(src, c.nom));
      if (dedans || dessous) {
        const ligne = src.slice(0, c.index).split('\n').length;
        fautes.push(`${chemin}:${ligne} ${c.nom} (${dedans ? 'contient' : 'reçoit'} un champ)`);
      }
    }
  }
  assert.deepEqual(fautes, [],
    'composants internes autour d’un champ — les remonter au niveau du module :\n  ' + fautes.join('\n  '));
});

// ─────────────────────────────────────────────────────────────────────────────
// Les trois qui avaient mordu, nommément.
//
// Le test ci-dessus les couvre déjà. Ceux-ci disent où ils doivent être, ce qui
// rend la régression lisible : un `SecBar` remis dans le composant ne ferait
// pas seulement échouer une règle abstraite, il nommerait le champ qu'il casse.
// ─────────────────────────────────────────────────────────────────────────────

const PAR = readFileSync(join(RACINE, 'src', 'views', 'parametres.jsx'), 'utf8');
const VOL = readFileSync(join(RACINE, 'src', 'views', 'volets.jsx'), 'utf8');

test('les briques des Paramètres sont au niveau du module', () => {
  for (const nom of ['SecBar', 'SecGroup', 'SecTgl', 'AppCard', 'OptRow', 'Tgl', 'Seg', 'MarginRow', 'Row']) {
    assert.match(PAR, new RegExp('^const ' + nom + ' = \\(', 'm'), nom + ' doit être défini au niveau du module');
  }
});

test('le champ nombre des volets est au niveau du module', () => {
  assert.match(VOL, /^const Nombre = \(/m);
  assert.match(VOL, /^const champ = \{/m);
});

test('le nom de l’assistant s’enregistre à la sortie ET sur Entrée', () => {
  // La sortie du champ seule ne suffisait pas : on tape, on appuie sur Entrée,
  // et rien ne partait — sans que rien ne le signale.
  assert.match(PAR, /const validerAssistant = \(\) => \{/);
  assert.match(PAR, /onBlur=\{validerAssistant\}/);
  assert.match(PAR, /onKeyDown=\{\(e\) => \{ if \(e\.key === 'Enter'\)/);
  assert.match(PAR, /validerAssistant\(\); e\.currentTarget\.blur\(\)/);
  // Vide efface la clé au lieu d'écrire une chaîne vide, sinon `nomAssistant`
  // recevrait '' et interrogerait un composant sans nom.
  assert.match(PAR, /cfgSet\(\{ loggia_assistant: nom \|\| null \}\)/);
});
