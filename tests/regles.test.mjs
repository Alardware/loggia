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
const VUES_REGLES = ['volets', 'nuit', 'veilles'];

test('l’en-tête des règles est écrit une seule fois', () => {
  // Il l'était trois fois à l'identique. Le poser ailleurs évite de devoir lui
  // ajouter le pli trois fois — et d'oublier la quatrième vue à venir.
  assert.match(ui, /export function RegleEntete\(/, 'l’en-tête partagé a disparu');
  assert.match(ui, /export function Bascule\(/, 'l’interrupteur partagé a disparu');
  for (const v of VUES_REGLES) {
    const src = readFileSync(join(RACINE, 'src', 'views', v + '.jsx'), 'utf8');
    assert.ok(!/const Entete = \(\{ nom/.test(src), `${v}.jsx a repris une copie locale de l’en-tête`);
    assert.ok(!/const Bascule = \(\{ on/.test(src), `${v}.jsx a repris une copie locale de l’interrupteur`);
    assert.match(src, /RegleEntete, usePli/, `${v}.jsx n’importe plus l’en-tête partagé`);
  }
});

test('chaque règle dépliée peut se replier', () => {
  // Un déploiement qui ne regarde que `actif` ne se referme jamais.
  for (const v of VUES_REGLES) {
    const src = readFileSync(join(RACINE, 'src', 'views', v + '.jsx'), 'utf8');
    const gardes = src.match(/\{[a-z0-9]+\.actif && [^(]*\(/g) || [];
    assert.ok(gardes.length > 0, `${v}.jsx : aucun déploiement trouvé`);
    for (const g of gardes) {
      assert.match(g, /&& !pli/i,
        `${v}.jsx : « ${g.trim()} » ne tient pas compte du pli — cette règle restera dépliée`);
    }
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
