// ─────────────────────────────────────────────────────────────────────────────
// Défaire et refaire, en mode édition.
//
// `saveAccL` est le passage UNIQUE de tout ce qui se modifie sur l'accueil :
// ordre des sections, masquages, ordre des pièces, tailles. Une pile posée là
// les couvre toutes — mais elle ne tient que tant que ce passage reste unique.
// Le jour où un geste écrira `loggia_accueil` directement, il deviendra
// silencieusement inannulable : rien ne planterait, le bouton resterait gris.
//
// On empile des ÉTATS, pas des gestes. Revenir en arrière est alors une simple
// réaffectation, et aucun geste n'a besoin de savoir s'inverser.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
const en = readFileSync(join(RACINE, 'src', 'langues', 'en.js'), 'utf8');

test('tout ce qui s’édite passe par le point qui empile', () => {
  // Une seule écriture directe de `loggia_accueil` en dehors de la pile suffit
  // à rendre un geste inannulable.
  const ecritures = src.match(/cfgSet\(\{ loggia_accueil:/g) || [];
  assert.equal(ecritures.length, 3,
    'un geste écrit loggia_accueil hors des trois points prévus (sauvegarde, défaire, refaire) : il sera inannulable');
  assert.match(src, /const saveAccL = \(n\) => \{\s*\n\s*setPasse/,
    'la sauvegarde n’empile plus l’état précédent');
});

test('une nouvelle action coupe la branche refaite', () => {
  const i = src.indexOf('const saveAccL = (n) => {');
  const corps = src.slice(i, src.indexOf('};', i));
  // Sans cela, on pourrait « refaire » un état abandonné depuis longtemps et
  // le voir ressurgir par-dessus le travail en cours.
  assert.match(corps, /setFutur\(\[\]\);/, 'la branche refaite survit à une nouvelle action');
});

test('la pile a un fond', () => {
  const i = src.indexOf('const saveAccL = (n) => {');
  const corps = src.slice(i, src.indexOf('};', i));
  // Chaque pas garde une copie de l'agencement : sans plafond, une longue
  // séance d'édition les accumulerait toutes.
  assert.match(corps, /p\.slice\(-19\)/, 'la pile d’annulation n’a plus de plafond');
});

test('quitter l’édition oublie l’historique', () => {
  // Rouvrir le mode le lendemain et pouvoir défaire un geste qu'on ne voit
  // plus à l'écran serait une trappe, pas un filet.
  assert.match(src, /if \(!editMode\) \{ setPasse\(\[\]\); setFutur\(\[\]\); \}/,
    'l’historique survit à la sortie du mode édition');
});

test('Ctrl+Z ne vole pas l’annulation d’un champ de saisie', () => {
  const i = src.indexOf("e.key.toLowerCase() !== 'z'");
  assert.notEqual(i, -1, 'le raccourci a disparu');
  const bloc = src.slice(i, i + 420);
  assert.match(bloc, /INPUT|TEXTAREA/, 'le raccourci s’applique désormais dans les champs de saisie');
  assert.match(bloc, /isContentEditable/, 'les zones éditables ne sont plus épargnées');
  // Détecter le champ ne suffit pas : il faut en SORTIR. Sans ce retour, la
  // détection existe et ne sert à rien.
  assert.match(bloc, /if \(dansUnChamp\) return;/,
    'le raccourci détecte le champ de saisie mais ne s’y abstient plus');
  assert.match(bloc, /if \(e\.shiftKey\) refaire\(\); else annuler\(\);/, 'Maj ne distingue plus refaire de défaire');
});

test('le bouton dit « défaire », pas « annuler »', () => {
  // « Annuler » est déjà pris par les dialogues, où il se traduit « Cancel » —
  // un autre sens. Le bouton d'historique afficherait « Cancel » en anglais.
  assert.match(src, /<Fi i="undo" size=\{12\} \/>\{tr\('Défaire'\)\}/,
    'le bouton reprend un libellé dont la traduction anglaise dit autre chose');
  assert.match(en, /'Défaire': 'Undo',/, 'la traduction de « Défaire » a disparu');
  assert.match(en, /'Refaire': 'Redo',/, 'la traduction de « Refaire » a disparu');
});
