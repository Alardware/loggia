// ─────────────────────────────────────────────────────────────────────────────
// Les lecteurs de configuration (src/lectures.js) : une configuration abîmée
// rend le défaut sûr, jamais une valeur qui fait tomber l'écran (lot 16,
// point 10b de l'audit de Luna, 05/10).
//
// Le fichier promet, en tête : « une configuration absente, vide ou mal formée
// rend le défaut, jamais `undefined` ». Aucun test ne l'exécutait. Deux trous
// tenaient derrière cette promesse :
//  1. un repas ou un jour du planning abîmé (`null`, un nombre, un repas sans
//     heure) passait tel quel. `prochaineRation` et `croqKeys` lisent `m.auto`,
//     `deriveAccueil` fait `m.time.split(':')` : l'erreur part du corps d'App,
//     au-dessus de la barrière par vue — tout l'écran passe en page de secours
//     (05/10, ADR 0155 : `croqMeals` et `croqRepasEdition` sont partis avec
//     l'ancienne liste ; `croqAncienneListe`, qui la lit pour l'encart de
//     migration, tient la même promesse) ;
//  2. un identifiant d'entité qui n'est pas une chaîne (un nombre, un objet)
//     finissait dans les clés surveillées, où `useHass` fait `k.charAt(...)`
//     sur chacune : même chute, pour le distributeur, les scripts Hue, les
//     notifications et le mode des volets.
// Le déclencheur est rare — Loggia n'écrit jamais ces formes ; il faut un
// fichier d'import retouché à la main, une ancienne version ou un magasin
// abîmé — mais quand il survient, c'est tout le panneau qui tombe.
//
// Une configuration VALIDE rend exactement ce qu'elle rendait.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true });
const { setLoggiaState } = await import('../src/state.js');
const L = await import('../src/lectures.js');

/** Serveur joignable : `cfgVal` ne descend pas dans le stockage local. */
const etat = ({ cfg = {}, ent = {} } = {}) => setLoggiaState({ cfg, ent, server: true });

/** Ce qu'une configuration abîmée peut contenir à la place d'un objet ou d'une liste. */
const ABIMES = [null, undefined, 'abc', '', 42, 0, true, false, [], ['x'], {}, { 0: 'x' }];
/** Les mêmes, là où un objet est attendu : `{ 0: 'x' }` y est une forme valide. */
const ABIMES_OBJ = ABIMES.filter(v => !(v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length));

/** Les identifiants d'entité qu'un lecteur rend : `useHass` les veut en chaînes. */
const tousChaines = (v) => Object.values(v).every(x => typeof x === 'string' && x !== '');

test('tous les lecteurs sont couverts ici', () => {
  // Un lecteur ajouté à lectures.js sans cas dans ce fichier fait échouer ce test.
  assert.deepEqual(Object.keys(L).sort(),
    ['croqAncienneListe', 'croqHaids', 'hueScripts', 'notifIds', 'plantsCfg', 'roomHidden', 'voletDays', 'voletMode']);
});

test('configuration absente : chaque lecteur rend son défaut', () => {
  etat();
  assert.equal(L.voletMode(), null);
  for (const f of ['voletDays', 'croqAncienneListe', 'roomHidden', 'plantsCfg']) assert.deepEqual(L[f](), [], f);
  for (const f of ['croqHaids', 'hueScripts', 'notifIds']) assert.deepEqual(L[f](), {}, f);
  // Sans serveur ni navigateur non plus.
  setLoggiaState({ cfg: {}, ent: {}, server: false });
  assert.equal(L.voletMode(), null);
  assert.deepEqual(L.croqAncienneListe(), []);
  assert.deepEqual(L.plantsCfg(), []);
});

/* ── Les volets ───────────────────────────────────────────────────────────── */

test('volets : une configuration valide rend ce qu’elle rendait', () => {
  const days = [{ haid: 'input_datetime.lever_lundi', jour: 'lun' }, { haid: 'input_datetime.lever_mardi' }];
  etat({ ent: { covers: { mode: 'input_select.volets_mode', days } } });
  assert.equal(L.voletMode(), 'input_select.volets_mode');
  assert.deepEqual(L.voletDays(), days);
});

test('volets : un domaine abîmé rend le défaut', () => {
  for (const covers of ABIMES) {
    etat({ ent: { covers } });
    assert.equal(L.voletMode(), null, JSON.stringify(covers));
    assert.deepEqual(L.voletDays(), [], JSON.stringify(covers));
  }
});

test('volets : un mode qui n’est pas un identifiant rend null', () => {
  for (const mode of [42, true, {}, ['input_select.x'], '', null]) {
    etat({ ent: { covers: { mode } } });
    assert.equal(L.voletMode(), null, JSON.stringify(mode));
  }
});

test('volets : un jour abîmé ne passe pas, les bons restent dans l’ordre', () => {
  for (const days of ABIMES) {
    etat({ ent: { covers: { days } } });
    assert.deepEqual(L.voletDays(), [], JSON.stringify(days));
  }
  etat({ ent: { covers: { days: [null, 3, 'input_datetime.x', [], {}, { haid: 5 }, { haid: { id: 'x' } }, { haid: 'input_datetime.a' }, { haid: 'input_datetime.b' }] } } });
  assert.deepEqual(L.voletDays(), [{ haid: 'input_datetime.a' }, { haid: 'input_datetime.b' }]);
  assert.ok(L.voletDays().every(d => typeof d.haid === 'string'));
});

/* ── Le distributeur ──────────────────────────────────────────────────────── */

const HAIDS = { reservoir: 'input_number.croquettes_reservoir', portionWeight: 'number.distributeur_portion', distribuees: 'sensor.croquettes_du_jour' };
const MEALS = [
  { id: 'matin', time: '07:30', label: 'Repas du matin', g: 45, auto: 'input_boolean.repas_matin' },
  { id: 'soir', time: '19:00', label: 'Repas du soir', g: 45, auto: 'automation.croquettes_soir' },
];
/* Ce que l'encart de migration en lit : l'heure, le libellé, l'interrupteur,
 * et s'il est une automatisation (un `input_boolean` ne distribuait rien). */
const LUS = [
  { heure: '07:30', label: 'Repas du matin', auto: 'input_boolean.repas_matin', relie: false },
  { heure: '19:00', label: 'Repas du soir', auto: 'automation.croquettes_soir', relie: true },
];

test('distributeur : une configuration valide rend ce qu’elle rendait', () => {
  etat({ cfg: { loggia_feeder: { haids: HAIDS, meals: MEALS } } });
  assert.deepEqual(L.croqHaids(), HAIDS);
  assert.deepEqual(L.croqAncienneListe(), LUS);
  // La clé éditée prime sur `loggia_entities`, qui reste le repli.
  etat({ ent: { feeder: { haids: HAIDS, meals: MEALS } } });
  assert.deepEqual(L.croqHaids(), HAIDS);
  assert.deepEqual(L.croqAncienneListe(), LUS);
  // Une liste vidée dans la clé éditée (« Oublier l'ancienne liste ») ne
  // ressuscite pas celle de `loggia_entities`.
  etat({ cfg: { loggia_feeder: { haids: HAIDS, meals: [] } }, ent: { feeder: { haids: HAIDS, meals: MEALS } } });
  assert.deepEqual(L.croqAncienneListe(), []);
});

test('distributeur : la forme qu’écrivait Paramètres → Entités (nulls, repas sans interrupteur) passe', () => {
  // views/parametres.jsx, jusqu'au 05/10 : un champ vide s'écrit `null`, un
  // repas sans automatisation porte `auto: null`. Ces listes restent dans les
  // magasins : l'encart de migration les lit.
  // Un `auto` vide (une version d'avant n'écrivait pas `null`) reste un repas
  // sans interrupteur, pas un repas abîmé.
  const meals = [{ id: 'repas0', time: '08:00', label: '', g: 0, auto: null }, { id: 'repas1', time: '18:30', label: 'Soir', g: 40, auto: 'input_boolean.soir' },
    { id: 'repas2', time: '12:00', label: 'Midi', g: 20, auto: '' }, { id: 'repas3', time: '15:00', label: 'Goûter', g: 10 }];
  etat({ cfg: { loggia_feeder: { haids: { reservoir: 'input_number.r', portionWeight: null, distribuees: null }, meals } } });
  const h = L.croqHaids();
  assert.equal(h.reservoir, 'input_number.r');
  assert.equal(h.portionWeight ?? null, null);
  assert.equal(h.distribuees ?? null, null);
  // Ce que `croqKeys` en tire est inchangé.
  assert.deepEqual(Object.values(h).filter(Boolean), ['input_number.r']);
  assert.deepEqual(L.croqAncienneListe(), [
    { heure: '08:00', label: '', auto: null, relie: false }, { heure: '18:30', label: 'Soir', auto: 'input_boolean.soir', relie: false },
    { heure: '12:00', label: 'Midi', auto: null, relie: false }, { heure: '15:00', label: 'Goûter', auto: null, relie: false },
  ]);
});

test('distributeur : un domaine ou des entités abîmés rendent {}', () => {
  for (const feeder of ABIMES) {
    etat({ cfg: { loggia_feeder: feeder } });
    assert.deepEqual(L.croqHaids(), {}, 'feeder ' + JSON.stringify(feeder));
    assert.deepEqual(L.croqAncienneListe(), [], 'feeder ' + JSON.stringify(feeder));
  }
  for (const haids of ABIMES_OBJ) {
    etat({ cfg: { loggia_feeder: { haids } } });
    assert.deepEqual(L.croqHaids(), {}, 'haids ' + JSON.stringify(haids));
  }
});

test('distributeur : une entité qui n’est pas une chaîne ne finit pas dans les clés surveillées', () => {
  etat({ cfg: { loggia_feeder: { haids: { reservoir: 42, portionWeight: { id: 'number.p' }, distribuees: ['sensor.d'], autre: 'sensor.ok' } } } });
  const h = L.croqHaids();
  assert.ok(tousChaines(h), JSON.stringify(h));
  assert.equal(h.reservoir ?? null, null);
  assert.equal(h.autre, 'sensor.ok');
});

test('distributeur : des repas abîmés rendent []', () => {
  for (const meals of ABIMES) {
    etat({ cfg: { loggia_feeder: { haids: HAIDS, meals } } });
    assert.deepEqual(L.croqAncienneListe(), [], 'meals ' + JSON.stringify(meals));
  }
});

/* L'ancienne liste se lit TOUTE (ADR 0155) : un repas abîmé reste dans
 * l'encart — il ne doit pas se perdre en silence —, mais en champs SÛRS. Ce
 * qui n'est pas un repas (`null`, un nombre, une chaîne, une liste) part. */
test('distributeur : un repas abîmé se lit en champs sûrs, ce qui n’en est pas un part, l’ordre reste', () => {
  etat({ cfg: { loggia_feeder: { meals: [
    null, 3, 'matin', [], {},
    { id: 'sans_heure', auto: 'input_boolean.x' },
    { id: 'heure_nombre', time: 730 },
    { id: 'auto_nombre', time: '09:00', auto: 5 },
    { id: 'auto_objet', time: '10:00', auto: { id: 'input_boolean.y' } },
    MEALS[0], MEALS[1],
  ] } } });
  const vide = { heure: '', label: '', auto: null, relie: false };
  assert.deepEqual(L.croqAncienneListe(), [
    vide,
    { ...vide, auto: 'input_boolean.x' },
    vide,
    { ...vide, heure: '09:00' },
    { ...vide, heure: '10:00' },
    ...LUS,
  ]);
  // Ce que lit l'encart ne lève pas, et n'affiche jamais « [object Object] ».
  for (const m of L.croqAncienneListe()) {
    assert.equal(typeof m.heure, 'string');
    assert.equal(typeof m.label, 'string');
    assert.ok(m.auto === null || (typeof m.auto === 'string' && m.auto !== ''));
    assert.equal(typeof m.relie, 'boolean');
  }
});

/* ── Scripts Hue, notifications ───────────────────────────────────────────── */

for (const [nom, domaine, valide] of [
  ['hueScripts', 'hueScripts', { active: 'input_text.hue_active', room: 'input_select.hue_piece', apply: 'script.hue_appliquer', detente: 'script.hue_detente' }],
  ['notifIds', 'notifications', { dishwasher: 'sensor.lave_vaisselle_puissance', dishwasherStart: 'input_datetime.lv_depart', bins: 'sensor.poubelles' }],
]) {
  test(`${nom} : une configuration valide rend ce qu’elle rendait`, () => {
    etat({ ent: { [domaine]: valide } });
    assert.deepEqual(L[nom](), valide);
  });

  test(`${nom} : un domaine abîmé rend {}`, () => {
    for (const v of ABIMES_OBJ) {
      etat({ ent: { [domaine]: v } });
      // Un tableau passait : `typeof [] === 'object'`.
      assert.deepEqual(L[nom](), {}, JSON.stringify(v));
    }
  });

  test(`${nom} : une entité qui n’est pas une chaîne ne finit pas dans les clés surveillées`, () => {
    const premier = Object.keys(valide)[0];
    etat({ ent: { [domaine]: { ...valide, [premier]: 7, intrus: { id: 'x' }, liste: ['sensor.z'], vide: '' } } });
    const r = L[nom]();
    assert.ok(tousChaines(r), JSON.stringify(r));
    assert.equal(r[premier] ?? null, null);
    for (const k of Object.keys(valide).slice(1)) assert.equal(r[k], valide[k], k);
  });
}

/* ── Pièces masquées (stockage de l'appareil) ─────────────────────────────── */

test('pièces masquées : le stockage local, abîmé ou absent, rend []', () => {
  const avant = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const warn = console.warn;
  const m = new Map();
  globalThis.window = { localStorage: { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) } };
  console.warn = () => {};   // readLS signale un JSON illisible : attendu ici
  try {
    etat();
    assert.deepEqual(L.roomHidden(), []);
    m.set('loggia_roomhidden', JSON.stringify(['Cuisine', 'Garage']));
    assert.deepEqual(L.roomHidden(), ['Cuisine', 'Garage']);
    for (const brut of ['null', '"Cuisine"', '42', 'true', '{"Cuisine":1}', '{', '']) {
      m.set('loggia_roomhidden', brut);
      assert.deepEqual(L.roomHidden(), [], brut);
    }
  } finally {
    console.warn = warn;
    if (avant) Object.defineProperty(globalThis, 'window', avant); else delete globalThis.window;
  }
});

/* ── Plantes ──────────────────────────────────────────────────────────────── */

test('plantes : une configuration valide rend ce qu’elle rendait', () => {
  const plants = [{ base: 'sensor.basilic', name: 'Basilic', room: 'Cuisine' }, { base: 'sensor.ficus' }];
  etat({ cfg: { loggia_plants: plants } });
  assert.deepEqual(L.plantsCfg(), plants);
});

test('plantes : une liste abîmée rend [], une ligne sans base ne passe pas', () => {
  for (const v of ABIMES) {
    etat({ cfg: { loggia_plants: v } });
    assert.deepEqual(L.plantsCfg(), [], JSON.stringify(v));
  }
  etat({ cfg: { loggia_plants: [null, 3, 'sensor.x', [], {}, { name: 'Sans base' }, { base: '' }, { base: 'sensor.menthe', name: 'Menthe' }] } });
  assert.deepEqual(L.plantsCfg(), [{ base: 'sensor.menthe', name: 'Menthe' }]);
});

/* ── L'éditeur du distributeur ────────────────────────────────────────────── */

test('Paramètres lit l’ancienne liste par le lecteur, pas la clé brute', () => {
  // Contre-relecture du 05/10 : le lecteur gardé, l'Accueil se rendait, mais
  // `useEntConfig` relisait `loggia_feeder.meals` à la main et faisait
  // `m.time` sur un repas `null`. Toute la vue Paramètres tombait (barrière
  // par vue, vérifié dans la démo), et c'est d'elle qu'on répare.
  const src = readFileSync(new URL('../src/views/parametres.jsx', import.meta.url), 'utf8');
  // Suite du 05/10 : par le lecteur DE L'ÉDITEUR, qui gardait aussi le repas
  // abîmé pour qu'on le répare. Puis l'éditeur est parti (ADR 0155) : l'encart
  // « Ancienne liste de repas » lit par `croqAncienneListe`, qui garde le repas
  // abîmé en champs sûrs (tests/distributeur_migration.test.mjs).
  assert.match(src, /import \{ croqAncienneListe \} from '\.\.\/lectures\.js';/);
  assert.match(src, /const liste = croqAncienneListe\(\)\.filter\(/);
  assert.doesNotMatch(src, /croqRepasEdition|croqMeals|repas: avecCle\(/, 'l’éditeur de l’ancienne liste est revenu');
  assert.doesNotMatch(src, /\.meals\) \|\| \[\]\)\.map/, 'une relecture brute des repas est revenue');
  // Le seul accès direct aux repas est gardé : une liste, des objets.
  const acces = src.split('\n').filter(l => /\w\.meals\b/.test(l) && !/^\s*(\*|\/\/)/.test(l));
  assert.ok(acces.length >= 1);
  for (const l of acces) assert.match(l, /Array\.isArray\((\w+)\.meals\) \? \1\.meals\.filter\(/, l);
});

/* ── La règle commune ─────────────────────────────────────────────────────── */

/* La FORME que chaque lecteur promet, pas seulement « pas undefined »
 * (05/10, relecture du lot 16) : les lecteurs d'avant ne levaient pas non
 * plus — ils rendaient `42`, `'abc'` ou `['x']`, et la chute venait plus loin
 * (`croqKeys`, `useHass`). L'ancienne règle passait donc sur le code d'avant. */
const objet = (r) => !!r && typeof r === 'object' && !Array.isArray(r);
const objets = (r) => Array.isArray(r) && r.every(objet);
const FORMES = {
  voletMode: (r) => r === null || (typeof r === 'string' && r !== ''),
  voletDays: (r) => objets(r) && r.every(d => typeof d.haid === 'string' && d.haid !== ''),
  croqHaids: (r) => objet(r) && tousChaines(r),
  croqAncienneListe: (r) => objets(r) && r.every(m => typeof m.heure === 'string' && typeof m.label === 'string'
    && (m.auto === null || (typeof m.auto === 'string' && m.auto !== '')) && typeof m.relie === 'boolean'),
  hueScripts: (r) => objet(r) && tousChaines(r),
  notifIds: (r) => objet(r) && tousChaines(r),
  roomHidden: (r) => Array.isArray(r),
  plantsCfg: (r) => objets(r) && r.every(p => !!p.base),
};

test('aucun lecteur ne lève, quelle que soit la forme reçue, et chacun rend la forme qu’il promet', () => {
  assert.deepEqual(Object.keys(FORMES).sort(), Object.keys(L).sort(), 'un lecteur sans forme promise ici');
  for (const v of ABIMES) {
    for (const cfgEnt of [
      { cfg: { loggia_feeder: v, loggia_plants: v }, ent: { covers: v, feeder: v, hueScripts: v, notifications: v } },
      { cfg: { loggia_feeder: { haids: v, meals: v } }, ent: { covers: { mode: v, days: v } } },
      { cfg: { loggia_feeder: { haids: { reservoir: v }, meals: [v, { time: v, label: v, g: v, auto: v }] }, loggia_plants: [v] }, ent: { covers: { days: [v] }, hueScripts: { a: v }, notifications: { a: v } } },
    ]) {
      etat(cfgEnt);
      for (const f of Object.keys(L)) {
        let r;
        assert.doesNotThrow(() => { r = L[f](); }, f + ' ' + JSON.stringify(v));
        assert.notEqual(r, undefined, f + ' ' + JSON.stringify(v));
        assert.ok(FORMES[f](r), f + ' rend ' + JSON.stringify(r) + ' pour ' + JSON.stringify(v));
      }
    }
  }
});
