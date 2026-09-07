// ─────────────────────────────────────────────────────────────────────────────
// Cinquante-six omissions volontaires, et pas une de plus.
//
// `react-hooks/exhaustive-deps` signalait 57 dépendances manquantes. Elles ont
// été lues une par une : aucune n'était un oubli. Toutes suivent le même choix,
// pris cinquante-sept fois et écrit nulle part.
//
// Home Assistant REMPLACE son objet `hass` à chaque changement d'état de la
// maison — plusieurs fois par seconde quand quelqu'un traverse une pièce. Un
// effet qui en dépend se relance à ce rythme : il rouvre son sondage, refait sa
// requête, réabonne son écoute. Le code dépend donc d'une SIGNATURE stable —
// `sig`, `nsig`, `csig`, `Object.keys(S).length`, `ids.join('|')` — qui ne
// bouge que quand le contenu utile bouge. La règle ne sait pas suivre ce
// détour, et redemande l'objet qu'on évite exprès.
//
// Ajouter la dépendance manquante serait, dans plusieurs cas, ÉCRIRE le bug :
// `parametres.jsx` mesure la latence une fois quand l'onglet s'ouvre, avec
// `}, [tab])` ; y ajouter `lat`, que la mesure elle-même met à jour, relancerait
// la mesure en boucle.
//
// Là où la péremption mordrait vraiment, le code utilise déjà une référence
// vivante : `ciel3d.jsx` lit `propsRef.current.exposure` dans sa boucle
// d'animation, et `useEtatServeur` fait de même pour son sondage.
//
// Reste le vrai danger : cinquante-six avertissements permanents rendent la
// règle inaudible. Le cinquante-septième — celui qui serait un vrai oubli —
// passerait au milieu sans que personne le voie. Ce test est là pour ça : il
// fige l'inventaire vérifié. Un nouveau manquement fait échouer la suite en le
// nommant ; un manquement corrigé la fait échouer aussi, pour qu'on descende le
// compteur plutôt que de le laisser mentir.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ESLint } from 'eslint';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');

/** L'inventaire relu le 7 septembre 2026, par fichier et par dépendance. */
const VERIFIE = {
  'src/App.jsx': [
    'HIST_IDS, SYS.host.online, and hass', 'S', 'S', 'S',
    'S', 'S and domaineOk', 'S and ids', 'S and lecteurs',
    'S and zonesHaids', 'a and dashHass', 'ancre', 'api and plage',
    'applyUser', 'autoOn', 'choisis and tousCals', 'cle and hass',
    'cv.name', 'dayOn', 'dc', 'debutGrille',
    'debutGrille', 'debutGrille and finGrille', 'derived', 'derived',
    'derivedCovers', 'derivedVols', 'discovery', 'discovery',
    'domaineOk', 'hass', 'hass', 'hass',
    'hass', 'hass', 'hass', 'hass and live',
    'hass, ids, and metrics', 'hidden', 'ids', 'keys and noisyKeys',
    'lights and presentRooms', 'loggiaRuntime.index', 'noms', 'seulement',
    'vuSig', 'vuesAutorisees',
  ],
  'src/ciel3d.jsx': ['exposure and limitMag'],
  'src/ui.jsx': ['cur'],
  'src/views/meteo.jsx': ['hass'],
  'src/views/parametres.jsx': [
    'entTouched and readEnt', 'h', 'hass', 'hass',
    'hass', 'hass and updBusy', 'lat and ping',
  ],
};

const APOSTROPHE = String.fromCharCode(39);
const ANTISLASH = String.fromCharCode(92);

/** Ce que l'outil voit aujourd'hui, dans la même forme. */
async function releve() {
  const par = {};
  for (const f of await new ESLint().lintFiles(['src'])) {
    const nom = f.filePath.replace(/.*OrionV2-source./, '').split(ANTISLASH).join('/');
    for (const m of f.messages) {
      if (m.ruleId !== 'react-hooks/exhaustive-deps') continue;
      const d = m.message.match(/missing dependenc[a-z]*: (.*?)\. Either/);
      if (d) (par[nom] = par[nom] || []).push(d[1].split(APOSTROPHE).join(''));
    }
  }
  for (const k of Object.keys(par)) par[k].sort();
  return par;
}

test('aucune dépendance omise en plus de celles qui ont été relues', async () => {
  const vu = await releve();
  const fichiers = new Set([...Object.keys(VERIFIE), ...Object.keys(vu)]);
  const nouveaux = [];
  const disparus = [];
  for (const f of fichiers) {
    // On compare des multi-ensembles : cinq `hass` dans un fichier ne sont pas
    // un seul `hass`, et remplacer une omission par une autre ne doit pas
    // passer pour un statu quo.
    const attendu = [...(VERIFIE[f] || [])];
    for (const d of vu[f] || []) {
      const i = attendu.indexOf(d);
      if (i < 0) nouveaux.push(`${f} → ${d}`); else attendu.splice(i, 1);
    }
    for (const d of attendu) disparus.push(`${f} → ${d}`);
  }
  assert.deepEqual(nouveaux, [],
    'un effet omet une dépendance qui n’a jamais été relue : soit elle est voulue et il faut le dire ici, soit c’est un oubli');
  assert.deepEqual(disparus, [],
    'une omission de la liste a été corrigée — retire-la de VERIFIE, sinon le compteur ment');
});

// ─────────────────────────────────────────────────────────────────────────────
// Six vues sondaient le serveur avec le même code, à la ligne près.
//
// Même premier appel, même intervalle, même drapeau « vivant », même `[!!h]`.
// Six copies, c'est six endroits où corriger la fermeture périmée — et le
// septième qu'on écrirait demain en recopiant le sixième.
// ─────────────────────────────────────────────────────────────────────────────

const VUES_SONDEUSES = ['fenetres', 'volets', 'nuit', 'presence', 'veilles', 'interrupteurs'];

test('aucune vue ne refait son propre sondage', () => {
  for (const v of VUES_SONDEUSES) {
    const src = readFileSync(join(RACINE, 'src', 'views', v + '.jsx'), 'utf8');
    assert.ok(!/const t = setInterval\(lire/.test(src),
      `${v}.jsx a repris une boucle de sondage locale`);
    assert.match(src, /useEtatServeur\(hass,/,
      `${v}.jsx n’utilise plus le sondage partagé`);
  }
});

test('le sondage lit le hass du moment, pas celui du premier rendu', () => {
  const ui = readFileSync(join(RACINE, 'src', 'ui.jsx'), 'utf8');
  const i = ui.indexOf('export function useEtatServeur(');
  assert.notEqual(i, -1, 'le sondage partagé a disparu');
  const corps = ui.slice(i, ui.indexOf('\n}', i));
  // Home Assistant remplace son objet à chaque changement d'état. Capturer
  // celui du premier rendu marche — la connexion, elle, survit — mais par
  // chance, pas par construction.
  assert.match(corps, /const lire = \(\) => hRef\.current\.callWS/,
    'la boucle rappelle un hass capturé : elle tient de nouveau à une propriété non écrite');
  assert.ok(!/\}, \[!!/.test(corps),
    'la dépendance redevient une expression que l’outil ne sait pas vérifier');
});
