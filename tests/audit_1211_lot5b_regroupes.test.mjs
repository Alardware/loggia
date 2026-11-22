// ─────────────────────────────────────────────────
// Lot 5b de l'audit du 12/11, partie X : de petites fonctions écrites
// plusieurs fois, regroupées — rien d'autre.
//
// La durée en minutes (`dureeMinutes`) et l'heure « 14:20 » (`heureCourte`)
// vivent dans format.js ; la pièce d'une entité (`nomZoneDe`) dans state.js ;
// « sans accents » reste `sansAccents` (outils.js). Les copies gardent leur nom
// quand quelqu'un l'importe ou qu'un test l'épingle, et s'y branchent. Aucun
// texte affiché ne change : ce test JOUE les fonctions communes, vérifie que
// les anciens noms rendent la même chose, et que ce qui fait AUTRE CHOSE
// (l'heure en secondes, celle du fuseau de la maison, `zoneDe`) est resté.
//
// Ne lit pas `src/App.jsx` : rien de ce qui est regroupé ici n'y vit.
// ─────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { dureeMinutes, heureCourte } from '../src/format.js';
import { nomZoneDe, setLoggiaState } from '../src/state.js';
import { dureeLisible } from '../src/robots.js';
import { dureePrise } from '../src/prises.js';
import { dureeTexte } from '../src/enfantetat.js';
import { estListeDeSorties } from '../src/applis.js';
import { buildIndex } from '../src/discovery.js';
import { preparerLangue, langue } from '../src/i18n.js';

const lire = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

// ── La durée en minutes ──────────────────────────────────────────────────────

const ENTREES = [-5, -0.4, null, undefined, '', NaN, 'abc', 0, 0.4, 0.5, 59, 59.4, 59.5, 60, 61, 65, 85, 120, 125, 135, 1439, 1440, 1441, '90', ' 30 ', Infinity];

test('`dureeMinutes` : « 0 min », « 59 min », « 1 h », « 1 h 01 », « 2 h 05 », « 24 h » ; jamais négative', () => {
  assert.deepEqual([0, 59, 60, 61, 125, 1440, 1441].map(dureeMinutes), ['0 min', '59 min', '1 h', '1 h 01', '2 h 05', '24 h', '24 h 01']);
  assert.deepEqual([-5, null, undefined, '', NaN, 'abc'].map(dureeMinutes), Array(6).fill('0 min'), 'ce qui ne se lit pas, ou sous zéro');
  assert.deepEqual([0.4, 0.5, 59.4, 59.5].map(dureeMinutes), ['0 min', '1 min', '59 min', '1 h'], 'arrondie à la minute');
  assert.deepEqual(['90', ' 30 '].map(dureeMinutes), ['1 h 30', '30 min'], 'un nombre écrit en texte');
  // L'infini traverse l'arrondi : « Infinity h », comme le rendaient les trois copies. Relevé, pas corrigé (lot sans changement).
  assert.equal(dureeMinutes(Infinity), 'Infinity h', 'l’infini, comme avant');
});

test('les trois anciens noms rendent ce que rend `dureeMinutes`', () => {
  for (const x of ENTREES) {
    const attendu = dureeMinutes(x);
    assert.equal(dureeLisible(x), attendu, 'robots.js : ' + String(x));
    assert.equal(dureePrise(x), attendu, 'prises.js : ' + String(x));
    assert.equal(dureeTexte(x), attendu, 'enfantetat.js : ' + String(x));
  }
  for (const [f, nom] of [['src/robots.js', 'dureeLisible'], ['src/prises.js', 'dureePrise'], ['src/enfantetat.js', 'dureeTexte']]) {
    const t = lire(f);
    assert.ok(t.includes('export function ' + nom + '(') && t.includes('return dureeMinutes('), f + ' : ' + nom + ' ne passe plus par dureeMinutes');
    assert.ok(/import \{[^}]*\bdureeMinutes\b[^}]*\} from '\.\/format\.js';/.test(t), f + ' : l’import de format.js');
    assert.ok(!t.includes("tr('{h} h {m}'"), f + ' : la copie de la durée est revenue');
  }
});

test('l’enfant disait « {n} h », les autres « {h} h » : le même texte, en néerlandais comme en polonais', async () => {
  const attendre = async (l) => { for (let i = 0; i < 100 && langue() !== l; i++) { preparerLangue({ language: l }); await new Promise(r => setTimeout(r, 10)); } };
  try {
    for (const [l, une, deux] of [['nl', '1 u', '2 u 05'], ['pl', '1 godz.', '2 godz. 05']]) {
      await attendre(l);
      assert.equal(langue(), l, 'le catalogue ' + l + ' ne s’est pas chargé');
      assert.deepEqual([dureeMinutes(60), dureeMinutes(125)], [une, deux], l);
      for (const x of [60, 120, 125, 1440]) assert.equal(dureeTexte(x), dureeMinutes(x), l + ' : ' + x);
    }
  } finally {
    preparerLangue({ language: 'fr' });
    assert.equal(langue(), 'fr');
  }
});

// ── L'heure « 14:20 » ────────────────────────────────────────────────────────

test('`heureCourte` : « 00:05 », « 09:05 », « 14:20 », d’une Date comme de millisecondes', () => {
  const jour = (h, m) => new Date(2026, 10, 15, h, m);
  assert.deepEqual([jour(0, 5), jour(9, 5), jour(14, 20), jour(23, 59)].map(heureCourte), ['00:05', '09:05', '14:20', '23:59']);
  assert.deepEqual([jour(0, 5), jour(9, 5), jour(14, 20)].map(d => heureCourte(d.getTime())), ['00:05', '09:05', '14:20']);
  // Une entrée illisible rend ce que rendaient les treize copies : la même ligne, au caractère près.
  const avant = (t) => new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  for (const x of [NaN, undefined, 'x', new Date(NaN)]) assert.equal(heureCourte(x), avant(x), String(x));
});

const HEURES = [
  ['src/prises.js', "const heureDe = heureCourte;"],
  ['src/lumieres.js', "const heureDe = heureCourte;"],
  ['src/robots.js', 'const h = heureCourte(t);'],
  ['src/fichedistributeur.jsx', "const heureDe = heureCourte;"],
  ['src/distributeur.js', "const heureLocale = heureCourte;"],
  ['src/prisesfiche.js', "const heure = heureCourte;"],
  ['src/minuteurmedia.js', "const heure = heureCourte;"],
  ['src/conseilsui.jsx', "const heure = heureCourte;"],
  ['src/meteo.js', "const hhmm = heureCourte;"],
  ['src/ficheborne.jsx', "tr('Branchée depuis {h}', { h: heureCourte(v.depuis) })"],
  ['src/views/systeme.jsx', '{heureCourte(l.t)}'],
  ['src/ficheprise.jsx', '{heureCourte(l.t)}'],
  ['src/fichelumiere.jsx', '{heureCourte(l.t)}'],
];

test('les treize copies branchées ne portent plus leur propre `toLocaleTimeString`', () => {
  for (const [f, branche] of HEURES) {
    const t = lire(f);
    assert.ok(!t.includes('toLocaleTimeString'), f + ' formate de nouveau une heure à la main');
    assert.ok(t.includes(branche), f + ' : ' + branche);
    assert.ok(/import \{[^}]*\bheureCourte\b[^}]*\} from '\.\.?\/format\.js';/.test(t), f + ' : l’import de format.js');
  }
});

test('ce qui dit autre chose est resté : l’heure en secondes, celle de la maison, celle d’un robot, `heureDe` d’une fiche', () => {
  const secondes = "const heureDe = (ts) => new Date(Number(ts) * 1000).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });";
  assert.ok(lire('src/fichemedia.jsx').includes(secondes), 'fichemedia.jsx : l’heure en secondes');
  assert.ok(lire('src/ficheenfant.jsx').includes(secondes), 'ficheenfant.jsx : l’heure en secondes');
  assert.ok(lire('src/voletsfiche.js').includes('const heureMaison = (t, fuseau) => new Intl.DateTimeFormat(locale(), { timeZone: fuseau || undefined,'), 'voletsfiche.js : heureMaison');
  assert.ok(lire('src/robotsfiche.js').includes("const heureDe = (t) => new Date(t).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });"), 'robotsfiche.js');
  const fiches = lire('src/appareils/fiches.jsx');
  assert.ok(fiches.includes("if (isNaN(d.getTime())) return '—';"), 'appareils/fiches.jsx : heureDe et son « — »');
});

// ── La pièce d'une entité ────────────────────────────────────────────────────

test('`nomZoneDe` : le nom de la zone, ou null — sans index, entité inconnue, entité sans zone', () => {
  const ix = buildIndex({
    areas: [{ area_id: 'cuisine', name: 'Cuisine' }, { area_id: 'muette', name: '' }],
    devices: [{ id: 'd1', name: 'Four', area_id: 'cuisine' }],
    entities: [
      { entity_id: 'light.cuisine', device_id: 'd1' },
      { entity_id: 'light.zone', area_id: 'cuisine' },
      { entity_id: 'switch.sans_zone' },
      { entity_id: 'light.muette', area_id: 'muette' },
    ],
    states: { 'light.cuisine': { state: 'on', attributes: {} }, 'light.zone': { state: 'on', attributes: {} }, 'switch.sans_zone': { state: 'off', attributes: {} }, 'light.muette': { state: 'on', attributes: {} } },
  });
  try {
    setLoggiaState({ index: null });
    assert.equal(nomZoneDe('light.cuisine'), null, 'sans index');
    setLoggiaState({ index: { areaList: [] } });
    assert.equal(nomZoneDe('light.cuisine'), null, 'un index sans areaNameOf');
    setLoggiaState({ index: ix });
    assert.equal(nomZoneDe('light.cuisine'), 'Cuisine', 'la zone héritée de l’appareil');
    assert.equal(nomZoneDe('light.zone'), 'Cuisine', 'la zone de l’entité');
    assert.equal(nomZoneDe('light.inconnue'), null, 'une entité inconnue');
    assert.equal(nomZoneDe('switch.sans_zone'), null, 'une entité sans zone');
    assert.equal(nomZoneDe('light.muette'), 'muette', 'une zone sans nom : son identifiant, comme areaNameOf');
    for (const id of ['light.cuisine', 'light.inconnue', 'switch.sans_zone', undefined]) assert.equal(nomZoneDe(id), ix.areaNameOf(id), String(id));
  } finally {
    setLoggiaState({ index: null });
  }
});

test('les neuf copies passent par `nomZoneDe` ; `zoneDe` et `zoneIdDe`, qui font autre chose, sont restés', () => {
  for (const f of ['src/ficheeau.jsx', 'src/ficheborne.jsx', 'src/fichevanne.jsx', 'src/fichetraceur.jsx', 'src/fichevolet.jsx', 'src/fichelumiere.jsx', 'src/vues/objets.jsx', 'src/edition/feuilles.jsx']) {
    const t = lire(f);
    assert.ok(!t.includes('areaNameOf'), f + ' relit de nouveau areaNameOf');
    assert.ok(/import \{[^}]*\bnomZoneDe\b[^}]*\} from '\.\.?\/state\.js';/.test(t), f + ' : l’import de state.js');
  }
  const fiches = lire('src/appareils/fiches.jsx');
  assert.ok(fiches.includes('const pieceDuChauffage = nomZoneDe;'), 'appareils/fiches.jsx : pieceDuChauffage garde son nom');
  assert.ok(fiches.includes("const zoneDe = (id) => { const z = ((LOGGIA_INDEX && LOGGIA_INDEX.areaList) || []).find("), 'appareils/fiches.jsx : zoneDe');
  assert.ok(/const zoneIdDe = /.test(lire('src/fichemedia.jsx')), 'fichemedia.jsx : zoneIdDe');
});

// ── Sans accents ─────────────────────────────────────────────────────────────

test('`aplati` (applis.js) et `sansAccent` (scenes.jsx) passent par `sansAccents`, sans changer ce qu’ils rendent', () => {
  assert.ok(lire('src/applis.js').includes("const aplati = (s) => sansAccents(s || '').trim();"), 'applis.js');
  assert.ok(lire('src/scenes.jsx').includes("const sansAccent = (s) => sansAccents(s || '').trim();"), 'scenes.jsx');
  // Les noms des lecteurs se comparent sans accents, sans casse, sans blancs autour : une liste de SORTIES reste reconnue.
  const etats = { 'media_player.salon': { state: 'on', attributes: { friendly_name: 'Écho Salon' } }, 'media_player.zero': { state: 'on', attributes: { friendly_name: 0 } } };
  assert.equal(estListeDeSorties(['  echo salon ', 'Partout'], etats), true);
  assert.equal(estListeDeSorties(['Netflix', 'YouTube'], etats), false);
  assert.equal(estListeDeSorties(['0', 'Partout'], etats), false, 'un nom 0 s’effaçait, il s’efface encore');
  // prises.js garde son aplati à lui (le « ł » polonais).
  assert.ok(/const aplati = \(s\) => String\(s \|\| ''\)\.normalize\('NFD'\)/.test(lire('src/prises.js')), 'prises.js');
});
