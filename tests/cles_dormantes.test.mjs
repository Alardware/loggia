// ─────────────────────────────────────────────────────────────────────────────
// Une clé sans lecteur part ; une clé sans écrivain RESTE (24/09, plan S5).
//
// Le plan reprochait à Loggia de traîner « des clés lues par personne, écrites
// par personne ». Les deux moitiés de la phrase n'ont pas du tout le même
// poids, et c'est tout le sujet.
//
// UNE CLÉ QUE RIEN NE LIT ne sert à rien : elle voyage à chaque écriture,
// sort dans chaque export, et ment sur ce que Loggia sait faire. Quatre
// étaient dans ce cas — les agencements des vues Lumières, Climat et Médias,
// qui n'ont pas d'éditeur, et `loggia-ciel`, dont le ciel étoilé a été retiré
// sans elle. Parties.
//
// UNE CLÉ QUE PLUS RIEN N'ÉCRIT est un chemin de reprise. `loggia_system`,
// `loggia_plants`, `loggia_covers`, `loggia_vacuum`, `loggia_lights`,
// `loggia_vacuum_entity`, `loggia_weather_entity` : l'écran Entités ne les
// écrit plus, mais une installation venue d'une version antérieure les porte.
// Retirer le lecteur effacerait son réglage EN SILENCE. Elles restent, et ce
// test refuse qu'on les enlève sans le décider.
//
// Même chose pour `MIGRATABLE_KEYS` : une liste de migration DOIT contenir des
// clés que plus rien n'écrit — c'est sa définition. Le plan y voyait douze
// entrées mortes ; ce sont douze entrées qui font leur travail.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

const parcourir = (dir, sortie = []) => {
  for (const nom of readdirSync(dir)) {
    const p = join(dir, nom);
    if (statSync(p).isDirectory()) { if (nom !== 'langues') parcourir(p, sortie); }
    else if (/\.(js|jsx)$/.test(nom)) sortie.push(p);
  }
  return sortie;
};

const FICHIERS = parcourir(join(RACINE, 'src'))
  .map(p => [p.slice(RACINE.length + 1).replace(/\\/g, '/'), readFileSync(p, 'utf8')]);
const texte = (chemin) => (FICHIERS.find(([c]) => c === chemin) || ['', ''])[1];

/* Les listes qui PORTENT une clé sans la lire : y figurer ne compte pas comme
 * un lecteur. `demo.js` non plus — une maison inventée n'est pas un usage. */
const PORTEUSES = ['src/state.js', 'src/config.js', 'src/demo.js'];

const lecteurs = (cle) => FICHIERS
  .filter(([c]) => PORTEUSES.indexOf(c) < 0)
  .filter(([, t]) => t.includes(cle))
  .map(([c]) => c);

test('les quatre clés sans lecteur ont bien quitté la synchronisation', async () => {
  const { LOGGIA_SYNC_KEYS } = await import('../src/state.js');
  for (const morte of ['loggia_lightlayout', 'loggia_climlayout', 'loggia_medlayout', 'loggia-ciel']) {
    assert.ok(LOGGIA_SYNC_KEYS.indexOf(morte) < 0, morte + ' est revenue dans la synchronisation');
    assert.deepEqual(lecteurs(morte), [], morte + ' a retrouvé un lecteur : alors elle doit RETOURNER dans la liste');
  }
});

test('aucune clé synchronisée sans quelqu’un pour la lire', async () => {
  /* Le contrôle général : si une clé voyage, quelque chose doit s'en servir.
   * Les agencements ont leur éditeur, les entités leur résolveur. */
  const { LOGGIA_SYNC_KEYS } = await import('../src/state.js');
  const orphelines = LOGGIA_SYNC_KEYS.filter(k => lecteurs(k).length === 0);
  assert.deepEqual(orphelines, [],
    'ces clés sont écrites, transportées et exportées, et personne ne les lit');
});

test('les clés que plus rien n’écrit gardent leur lecteur — c’est la reprise', () => {
  /* Les retirer effacerait le réglage de qui vient d'une version antérieure.
   * Si l'une doit partir un jour, ce sera une DÉCISION, pas un ménage. */
  const attendus = {
    loggia_system: 'src/resolve.js',
    loggia_plants: 'src/lectures.js',
    loggia_covers: 'src/resolve.js',
    loggia_vacuum: 'src/resolve.js',
    loggia_lights: 'src/App.jsx',
    loggia_vacuum_entity: 'src/resolve.js',
    loggia_weather_entity: 'src/resolve.js',
  };
  for (const [cle, ou] of Object.entries(attendus)) {
    assert.ok(texte(ou).includes(cle), cle + ' a perdu son lecteur dans ' + ou + ' : un ancien réglage s’efface en silence');
  }
});

test('la table des domaines ne se dit plus « miroir » de ce qu’elle ne reflète pas', async () => {
  const v = texte('src/views.js');
  assert.ok(!/Miroir de `ENT_ALIAS`/.test(v), 'la phrase fausse est revenue');
  const { ENT_ALIAS } = await import('../src/state.js');
  const domaines = (v.slice(v.indexOf('const CLES_DOMAINE = {')).split('};')[0].match(/^ {2}\w+:/gm) || []).length;
  assert.ok(domaines > Object.keys(ENT_ALIAS).length,
    'si les deux tables disent enfin la même chose, cette explication n’a plus lieu d’être');
});
