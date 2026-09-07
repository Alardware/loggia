// ─────────────────────────────────────────────────────────────────────────────
// Un mode se MÉMORISE, il ne se déduit pas de ses valeurs.
//
// « Heures à lui », dans le détail par volet, était déduit de la présence d'un
// décalage : `ouverture != null || fermeture != null`. Vider le dernier champ
// rendait donc le mode faux, le bloc entier se démontait, et le volet
// retombait sur « Comme les autres ». Le champ disparaissait sous les doigts
// de qui essayait simplement de corriger un nombre.
//
// C'était d'autant plus faux que la ligne d'aide, juste en dessous, annonce
// l'inverse : « Vide = suit l'heure générale pour ce sens. » Vider est un
// choix, pas une sortie du mode.
//
// La leçon vaut au-delà des volets : dès qu'un réglage a un mode ET des
// valeurs, l'un ne doit pas se lire dans les autres.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(RACINE, 'src', 'views', 'volets.jsx'), 'utf8');

test('« Heures à lui » survit à des champs vides', () => {
  const m = src.match(/const propre = !!\(r && !r\.exclu && \(([^)]*)\)\);/);
  assert.ok(m, 'la règle du mode « Heures à lui » a disparu ou changé de forme');
  const cond = m[1];
  assert.match(cond, /r\.perso/,
    'le mode redevient déduit des valeurs : vider les deux champs le fera disparaître');
  // Le bouton doit poser le drapeau, sinon la lecture ne trouvera jamais rien.
  assert.match(src, /poser\(\{ perso: true, ouverture: 60, fermeture: null \}\)/,
    'le bouton « Heures à lui » ne pose plus le mode');
});

test('les réglages écrits avant le drapeau restent reconnus', () => {
  const m = src.match(/const propre = !!\(r && !r\.exclu && \(([^)]*)\)\);/);
  const cond = m[1];
  // Une installation configurée avant ce correctif n'a que ses décalages :
  // ne lire que le drapeau ferait retomber tous ses volets sur « Comme les
  // autres » à la première ouverture de la page.
  assert.match(cond, /r\.ouverture != null \|\| r\.fermeture != null/,
    'les anciennes configurations perdraient leur mode');
});

test('vider un champ écrit null, pas zéro', () => {
  // `Number('')` vaut 0 : sans le test explicite du vide, effacer le contenu
  // enregistrerait un décalage de zéro minute — un réglage actif — au lieu de
  // rendre le volet à l'heure générale.
  const champs = src.match(/e\.target\.value === '' \? null :/g) || [];
  assert.equal(champs.length, 2,
    'les deux champs de minutes doivent distinguer « vide » de « zéro »');
});

// ─────────────────────────────────────────────────────────────────────────────
// Une règle activée doit pouvoir se replier.
//
// Sur Paramètres → Règles, activer une règle déployait tout son paramétrage et
// ne le refermait jamais. On règle une automatisation une fois, puis on n'y
// revient plus : cinq familles déployées remplissaient plusieurs écrans de
// champs qu'on ne relit pas.
//
// « Activée » et « dépliée » sont donc deux états distincts, et le pli ne
// touche pas au fonctionnement : la règle continue de tourner.
// ─────────────────────────────────────────────────────────────────────────────

const ui = readFileSync(join(RACINE, 'src', 'ui.jsx'), 'utf8');
// Les cinq onglets de Paramètres → Règles.
const VUES_REGLES = ['volets', 'nuit', 'veilles', 'fenetres', 'presence'];
// Celles dont l'en-tête était écrit à l'identique et a été extrait.
const VUES_EXTRAITES = ['volets', 'nuit', 'veilles'];

test('l’en-tête des règles est écrit une seule fois', () => {
  // Il l'était trois fois à l'identique. Le poser ailleurs évite de devoir lui
  // ajouter le pli trois fois — et d'oublier la quatrième vue à venir.
  assert.match(ui, /export function RegleEntete\(/, 'l’en-tête partagé a disparu');
  assert.match(ui, /export function Bascule\(/, 'l’interrupteur partagé a disparu');
  for (const v of VUES_EXTRAITES) {
    const src = readFileSync(join(RACINE, 'src', 'views', v + '.jsx'), 'utf8');
    assert.ok(!/const Entete = \(\{ nom/.test(src), `${v}.jsx a repris une copie locale de l’en-tête`);
    assert.ok(!/const Bascule = \(\{ on/.test(src), `${v}.jsx a repris une copie locale de l’interrupteur`);
  }
  for (const v of VUES_REGLES) {
    const src = readFileSync(join(RACINE, 'src', 'views', v + '.jsx'), 'utf8');
    assert.match(src, /RegleEntete, usePli/, `${v}.jsx n’importe plus l’en-tête partagé`);
  }
});

test('les cinq onglets ont au moins une règle repliable', () => {
  // Deux d'entre eux étaient bâtis autrement, sans le composant d'en-tête, et
  // sont restés dépliés une version de plus.
  for (const v of VUES_REGLES) {
    const src = readFileSync(join(RACINE, 'src', 'views', v + '.jsx'), 'utf8');
    assert.match(src, /<RegleEntete[\s\S]{0,400}?plie=\{/,
      `${v}.jsx : aucune règle repliable — cet onglet restera déplié`);
  }
});

test('chaque en-tête pilote SON pli, et lui seul', () => {
  // Vérifier que le pli est branché quelque part ne suffit pas. « Protection
  // solaire » avait reçu deux jeux de props — `plie={pliSol}` puis
  // `plie={pliVent}` — et en JSX le dernier gagne : l'en-tête basculait le pli
  // du vent pendant que son contenu attendait celui du soleil. Le chevron
  // bougeait, rien ne se repliait, et le bloc du vent n'était plus pliable du
  // tout. Rien ne le signalait : deux props valides, deux gardes valides,
  // simplement pas les mêmes.
  for (const v of VUES_REGLES) {
    const src = readFileSync(join(RACINE, 'src', 'views', v + '.jsx'), 'utf8');

    // Une balise ne porte `plie` qu'une fois.
    for (const balise of src.match(/<RegleEntete[\s\S]*?\/>/g) || []) {
      const n = (balise.match(/\bplie=\{/g) || []).length;
      assert.equal(n, 1, `${v}.jsx : un en-tête porte ${n} fois « plie » — le dernier écrase les autres`);
    }

    // Pour chaque en-tête, on relie la règle qu'il commande au pli qu'il porte,
    // puis on exige que TOUTES les gardes de cette règle portent CE pli.
    //
    // Compter, ou comparer des ensembles, ne suffirait pas : « Départ et
    // retour » gouverne trois blocs avec un seul pli, et il suffirait qu'un
    // seul des trois le garde pour que l'ensemble paraisse complet — pendant
    // qu'un bloc resterait déplié pour de bon.
    const pilotes = [];
    for (const balise of src.match(/<RegleEntete[\s\S]*?\/>/g) || []) {
      const mOn = balise.match(/on=\{!*([A-Za-z0-9_]+)\.actif\}/);
      const mPli = balise.match(/plie=\{(pli[A-Za-z0-9]*)\}/);
      if (!mOn || !mPli) continue;
      const [regle, pli] = [mOn[1], mPli[1]];
      pilotes.push(pli);
      const gardes = src.match(new RegExp('\\{' + regle + '\\.actif &&[^(]*\\(', 'g')) || [];
      assert.ok(gardes.length > 0, `${v}.jsx : « ${regle} » a un en-tête pliable mais rien à replier`);
      for (const g of gardes) {
        assert.ok(g.includes('!' + pli + ' &&'),
          `${v}.jsx : « ${g.trim()} » ne porte pas ${pli}, le pli de son en-tête — ce bloc restera déplié`);
      }
    }
    assert.equal(new Set(pilotes).size, pilotes.length,
      `${v}.jsx : deux en-têtes partagent le même pli — ils se replieront ensemble`);
  }
});

test('le pli reste sur l’appareil', () => {
  // `estPersonnelle` classe sur le suffixe « panel ». Ce qu'on a replié sur son
  // téléphone n'a pas à se replier sur la tablette de quelqu'un d'autre.
  const m = ui.match(/localStorage\.getItem\('(loggia-[a-z]+)'\)/);
  assert.ok(m, 'la clé du pli est introuvable');
  assert.ok(m[1].endsWith('panel'),
    `${m[1]} ne finit pas par « panel » : le pli suivrait la maison au lieu de l’appareil`);
});

test('le pli ne s’affiche pas sur une règle éteinte', () => {
  const i = ui.indexOf('export function RegleEntete(');
  const corps = ui.slice(i, ui.indexOf('\n}', i));
  // On ne replie pas ce qui n'affiche rien : sans cela, le chevron apparaîtrait
  // sur une règle désactivée et ne ferait rien.
  assert.match(corps, /const pliable = !!\(on && onPlier\);/,
    'le chevron s’affiche désormais sur les règles éteintes');
});

// ─────────────────────────────────────────────────────────────────────────────
// Un en-tête doit dire DE QUOI il commande le pli.
//
// `RegleEntete` acceptait `zone` et le posait en `aria-controls` — mais aucun
// appelant ne le lui passait. Le commentaire du composant décrivait donc un
// motif que le code ne réalisait pas : exactement la faute du `nom` de
// `Bascule`, accepté par JSX et jeté par la fonction.
//
// Le report tenait à un obstacle qui n'existait pas : « il faudrait convertir
// les fragments en <div>, ce qui casserait la mise en page ». Les cartes de
// règles sont des blocs simples, sans flex ni gap — un enrobage y est neutre.
// ─────────────────────────────────────────────────────────────────────────────

test('chaque en-tête repliable désigne la région qu’il replie', () => {
  for (const v of VUES_REGLES) {
    const src = readFileSync(join(RACINE, 'src', 'views', v + '.jsx'), 'utf8');
    for (const balise of src.match(/<RegleEntete[\s\S]*?\/>/g) || []) {
      if (!/\bplie=\{/.test(balise)) continue;          // en-tête non repliable
      const z = balise.match(/zone="([^"]+)"/);
      assert.ok(z, `${v}.jsx : un en-tête repliable ne dit pas quelle région il commande`);
      for (const id of z[1].split(' ')) {
        // Une zone qui désigne un identifiant que personne ne porte ne relie
        // rien : l'attribut a l'air posé et ne mène nulle part.
        assert.ok(src.includes(`id="${id}"`),
          `${v}.jsx : aucune région ne porte l’identifiant « ${id} »`);
      }
    }
  }
});

test('la relation disparaît avec la région', () => {
  const i = ui.indexOf('export function RegleEntete(');
  const corps = ui.slice(i, ui.indexOf('\n}', i));
  // Replier ne masque pas la région : cela la démonte. Garder `aria-controls`
  // laisserait une référence vers un identifiant absent du document — ce qu'un
  // vérificateur signale, et qui ne mène nulle part.
  assert.match(corps, /aria-controls=\{pliable && zone && !plie \? zone : undefined\}/,
    'l’en-tête garde aria-controls une fois replié : il désigne alors une région démontée');
});
