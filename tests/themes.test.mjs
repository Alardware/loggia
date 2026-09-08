// ─────────────────────────────────────────────────────────────────────────────
// Un thème tient sur trois endroits qui doivent dire la même chose.
//
// `LOGGIA_PRESETS` porte les couleurs, `PRESET_META()` la carte du sélecteur,
// et deux listes — NATIFS et COMMU — décident laquelle s'affiche. Rien ne relie
// les trois : un thème proposé sans preset donne un clic qui ne fait rien, un
// preset sans carte est du code que personne n'atteint.
//
// S'y ajoute un piège propre aux presets. `THEME_KEYS` est la liste des jetons
// PURGÉS avant d'appliquer un thème. Un preset qui en pose un absent de cette
// liste le laisse au thème suivant — le bleu de l'un sur le fond de l'autre,
// jusqu'au rechargement. C'est arrivé en écrivant « The Projekt », qui teinte
// le voile météo et les accents décoratifs ; d'où le contrôle ci-dessous, qui
// vaut pour tous les presets et pas seulement celui-là.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');

const app = lire('src', 'App.jsx');
const par = lire('src', 'views', 'parametres.jsx');

/** Le bloc source de `LOGGIA_PRESETS`, des accolades à la fonction suivante. */
function blocPresets() {
  const i = app.indexOf('const LOGGIA_PRESETS = {');
  assert.notEqual(i, -1, 'la table des thèmes a disparu');
  const j = app.indexOf('\nfunction lum(', i);
  assert.ok(j > i, 'la fin de la table des thèmes est introuvable');
  return app.slice(i, j);
}

/** Les identifiants déclarés dans la table, dans l'ordre du fichier. */
function idsPresets() {
  return [...blocPresets().matchAll(/\n {2}([a-z][a-z0-9]*): \{/g)].map(m => m[1]);
}

/** Les identifiants proposés par les deux onglets du sélecteur. */
function idsProposes() {
  const lignes = [...par.matchAll(/const (?:NATIFS|COMMU) = \[([^\]]*)\]/g)];
  assert.equal(lignes.length, 2, 'les deux listes du sélecteur de thème ont changé de forme');
  return lignes.flatMap(m => [...m[1].matchAll(/'([a-z0-9]*)'/g)].map(x => x[1]));
}

/** Les identifiants qui ont une carte dans le sélecteur. */
function idsCartes() {
  const i = par.indexOf('const PRESET_META = () => [');
  assert.notEqual(i, -1, 'la liste des cartes de thème a disparu');
  const bloc = par.slice(i, par.indexOf('\n];', i));
  return [...bloc.matchAll(/\{ id: '([a-z0-9]*)'/g)].map(m => m[1]);
}

test('tout thème proposé a une carte', () => {
  // Sans carte, `PRESET_META().find(...)` rend `undefined` et le thème
  // disparaît simplement de la liste — sans erreur, sans trace.
  const cartes = idsCartes();
  const sansCarte = idsProposes().filter(id => cartes.indexOf(id) < 0);
  assert.deepEqual(sansCarte, [], 'un thème est proposé sans carte : il ne s’affichera nulle part');
});

test('toute carte est proposée quelque part', () => {
  // L'inverse : une carte qu'aucun onglet ne liste est du code mort déguisé
  // en fonctionnalité.
  const proposes = idsProposes();
  const orphelines = idsCartes().filter(id => proposes.indexOf(id) < 0);
  assert.deepEqual(orphelines, [], 'une carte de thème n’apparaît dans aucun onglet');
});

test('toute carte autre que le défaut a ses couleurs', () => {
  // `''` est le thème par défaut : il n'a pas d'entrée et retombe sur les
  // jetons de base d'`index.css`. Tous les autres doivent en avoir une, sinon
  // le clic ne change rien du tout.
  const ids = idsPresets();
  const sansCouleurs = idsCartes().filter(id => id !== '' && ids.indexOf(id) < 0);
  assert.deepEqual(sansCouleurs, [], 'une carte de thème ne pointe vers aucun jeu de couleurs');
});

test('chaque thème a ses deux variantes', () => {
  // Le mode d'affichage bascule clair/sombre pour TOUS les thèmes. Une
  // variante manquante laisse en place les jetons du thème précédent.
  const bloc = blocPresets();
  const manquantes = [];
  for (const id of idsPresets()) {
    const i = bloc.indexOf('\n  ' + id + ': {');
    const seg = bloc.slice(i, bloc.indexOf('\n  },', i));
    for (const mode of ['dark', 'light']) {
      if (seg.indexOf('\n    ' + mode + ': {') < 0) manquantes.push(id + ' · ' + mode);
    }
  }
  assert.deepEqual(manquantes, [], 'un thème n’a qu’une variante : l’autre mode gardera les couleurs du thème précédent');
});

test('aucun jeton posé par un thème n’échappe au grand ménage', () => {
  // `THEME_KEYS` est la liste des jetons retirés avant d'appliquer un thème.
  // Un jeton posé par un preset et absent de cette liste SURVIT au changement
  // de thème : il faut recharger la page pour s'en débarrasser.
  const i = app.indexOf('const THEME_KEYS = [');
  const purges = new Set([...app.slice(i, app.indexOf('];', i)).matchAll(/'(--o-[a-z0-9-]+)'/g)].map(m => m[1]));
  const fuites = [...new Set([...blocPresets().matchAll(/'(--o-[a-z0-9-]+)':/g)].map(m => m[1]))]
    .filter(k => !purges.has(k))
    .sort();
  assert.deepEqual(fuites, [],
    'ce jeton est posé par un thème sans figurer dans THEME_KEYS : il restera en place au thème suivant');
});

// ─────────────────────────────────────────────────────────────────────────────
// The Projekt : ce que la charte impose et qu'un ajustement pourrait défaire.
// ─────────────────────────────────────────────────────────────────────────────

/** Le bloc source du thème, et ses deux variantes séparées. */
function projekt() {
  const bloc = blocPresets();
  const i = bloc.indexOf('\n  projekt: {');
  assert.notEqual(i, -1, 'le thème The Projekt a disparu');
  const seg = bloc.slice(i, bloc.indexOf('\n  },', i));
  return { seg, dark: seg.slice(seg.indexOf('dark: {'), seg.indexOf('light: {')), light: seg.slice(seg.indexOf('light: {')) };
}

test('The Projekt reteint les accents décoratifs, dans les deux modes', () => {
  // `--o-purple` est la couleur des VOLETS d'un bout à l'autre du dashboard.
  // Laissé à sa valeur par défaut, il traversait ce thème monochrome comme un
  // trait de feutre. Chaque accent décoratif doit donc être redéfini — et dans
  // les DEUX variantes, sans quoi le mode clair récupère le violet.
  const p = projekt();
  const attendus = ['--o-purple', '--o-cyan', '--o-gold', '--o-cold', '--o-warn', '--o-sky',
    // Et les teintes des pièces. Sans elles, l'orange de la cuisine et le rose
    // de la chambre d'enfant traversaient le thème — c'est ce qui restait de
    // visible après le premier passage.
    '--o-piece-ambre', '--o-piece-tendre', '--o-piece-vert'];
  for (const [nom, part] of [['sombre', p.dark], ['clair', p.light]]) {
    const manquants = attendus.filter(k => part.indexOf("'" + k + "'") < 0);
    assert.deepEqual(manquants, [],
      `variante ${nom} : ces accents retombent sur leur valeur par défaut, hors charte`);
  }
});

test('The Projekt distingue l’accent qui remplit de celui qui écrit', () => {
  // #3CA2D9 remplit, #BEE8FF écrit. Sur #020D12 le premier passe tout juste,
  // le second respire. Les confondre rend illisible tout libellé d'accent.
  assert.match(projekt().seg, /accent: '#3ca2d9', accentText: '#bee8ff'/,
    'les deux bleus de la charte ont été confondus en un seul');
});

test('aucune teinte de pièce n’est écrite en dur', () => {
  // Elles l'étaient toutes, et trois l'étaient DEUX FOIS : une valeur littérale
  // pour le lavis, un jeton pour l'icône. Tant qu'aucun thème ne les déplaçait,
  // l'écart ne se voyait pas — le lavis de la Chambre restait violet quand son
  // icône passait à l'acier.
  const i = app.indexOf('const PIECES = [');
  assert.notEqual(i, -1, 'la table des pièces a disparu');
  const bloc = app.slice(i, app.indexOf('\n];', i));
  const dures = [...bloc.matchAll(/(?:#[0-9a-f]{6}|rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+)/gi)].map(m => m[0]);
  assert.deepEqual(dures, [],
    'une teinte de pièce est de nouveau écrite en dur : aucun thème ne pourra la suivre');
});

test('The Projekt garde sa lueur, dans les deux modes', () => {
  // Le fond n'est pas plat : c'est la lueur venue du haut qui donne la
  // profondeur que les autres thèmes vont chercher dans une ombre portée.
  // Sans `bggrad`, il ne reste qu'un aplat noir et le thème perd son sujet.
  const p = projekt();
  for (const [nom, part] of [['sombre', p.dark], ['clair', p.light]]) {
    assert.match(part, /bggrad: 'radial-gradient\(/, `variante ${nom} : la lueur a disparu, le fond est redevenu plat`);
  }
});
