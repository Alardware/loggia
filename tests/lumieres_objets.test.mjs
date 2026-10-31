/* Quelles lumières (chantier Lumières, L11).
 *
 * Une lumière de la maison est un `light.*` SANS catégorie, ou un switch que la
 * maison déclare lumière : la LED d'une borne Wi-Fi (`entity_category: config`)
 * n'en est pas une, quel que soit son nom. `discoverLights` et
 * `objetsDeLaMaison` vivent dans App.jsx, qui n'exporte que l'application :
 * sous `?lumieres_objets`, un crochet de chargement leur ajoute un export — le
 * patron de tests/prises_objets.test.mjs. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';

import { area, device, entity, state, states, ctxOf } from './fixtures.mjs';

import { MONOLITHE } from './monolithe.mjs'; // App.jsx et ce qui en sort (ADR 0282)
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });

/* Sa maison, en petit : une Hue couleur, un variateur Legrand, la LED de sa
 * borne Wi-Fi (son nom ne dit rien d'un réseau : seule sa catégorie la trahit),
 * et la lumière extérieure, une prise déclarée lumière. */
function maison() {
  return {
    areas: [area('chambre', 'Chambre'), area('bureau', 'Bureau'), area('salon', 'Salon')],
    devices: [
      device('d_hue', 'Ampoule chambre', 'chambre', { manufacturer: 'Philips', model: 'Hue White and Color Ambiance' }),
      device('d_legrand', 'Interrupteur Bureau', 'bureau', { manufacturer: 'Legrand', model: 'Dimmer switch' }),
      device('d_borne', 'Borne Wi-Fi', 'salon', { manufacturer: 'Ubiquiti', model: 'U6-LR' }),
      device('d_ext', 'Lumière extérieur', 'salon', { manufacturer: 'Nous', model: 'Smart plug' }),
    ],
    entities: [
      entity('light.ampoule_chambre', { device: 'd_hue' }),
      entity('light.bureau', { device: 'd_legrand' }),
      entity('light.borne_salon_voyant', { device: 'd_borne', category: 'config' }),
      entity('switch.lumiere_exterieur', { device: 'd_ext' }),
    ],
    floors: [],
    states: states(
      state('light.ampoule_chambre', 'on', { friendly_name: 'Ampoule chambre', supported_color_modes: ['color_temp', 'xy'], color_mode: 'color_temp', color_temp_kelvin: 2700, brightness: 115 }),
      state('light.bureau', 'off', { friendly_name: 'Plafonnier Bureau', supported_color_modes: ['brightness'] }),
      state('light.borne_salon_voyant', 'on', { friendly_name: 'Voyant', supported_color_modes: ['onoff'] }),
      state('switch.lumiere_exterieur', 'on', { friendly_name: 'Lumière extérieur' }),
    ),
    energyPrefs: null,
  };
}

const SUFFIXE = '?lumieres_objets';
let chargement = null;
function app() {
  if (!chargement) {
    chargement = (async () => {
      if (typeof globalThis.requestAnimationFrame !== 'function') {
        globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
        globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
      }
      register('./jsx-hooks.mjs', import.meta.url);
      register('data:text/javascript,' + encodeURIComponent([
        'export async function load(url, ctx, next) {',
        `  if (!url.endsWith('/src/App.jsx${SUFFIXE}')) return next(url, ctx);`,
        `  const r = await next(url.slice(0, -${SUFFIXE.length}), ctx);`,
        "  return { ...r, source: String(r.source) + ';export { discoverLights, objetsDeLaMaison, deriveAccueil };' };",
        '}',
      ].join('\n')));
      const { setLoggiaState } = await import('../src/state.js');
      const mod = await import(new URL('../src/App.jsx' + SUFFIXE, import.meta.url).href);
      return { setLoggiaState, ...mod };
    })();
  }
  return chargement;
}

async function avecMaison(fx, f) {
  const a = await app();
  const ctx = ctxOf(fx, {});
  a.setLoggiaState({ index: ctx.index, ent: { switchLights: ['switch.lumiere_exterieur'] }, cfg: {}, resolved: null });
  try {
    return await f(a, ctx);
  } finally {
    a.setLoggiaState({ index: null, ent: {}, cfg: {}, resolved: null });
  }
}

test('L11 : la LED d’une borne Wi-Fi n’est pas une lumière de la maison — sa catégorie le dit, pas son nom', async () => {
  const fx = maison();
  await avecMaison(fx, ({ discoverLights }, ctx) => {
    const ids = (index) => discoverLights({ states: fx.states }, index).map(l => l.id).sort();
    const attendu = ['light.ampoule_chambre', 'light.bureau', 'switch.lumiere_exterieur'];
    assert.deepEqual(ids(ctx.index), attendu, 'l’index passé');
    assert.deepEqual(ids(undefined), attendu, 'l’index de Loggia, sans index passé');
  });
});

test('L11 : Objets › Lumières ne montre pas la LED ; la lumière extérieure, déclarée, y garde sa place', async () => {
  const fx = maison();
  await avecMaison(fx, ({ objetsDeLaMaison }) => {
    const objets = objetsDeLaMaison({ states: fx.states }, [], new Set());
    const lumieres = objets.filter(o => o.filtres.includes('lumieres')).map(o => o.cle).sort();
    assert.deepEqual(lumieres, ['light.ampoule_chambre', 'light.bureau', 'switch.lumiere_exterieur']);
    assert.ok(!objets.some(o => o.cle === 'light.borne_salon_voyant'), 'ni sous Lumières, ni ailleurs : une entité de configuration');
  });
});

/* Relecture des tâches 1 à 5, point 8 (passe 9 bis A) : « n allumées » de l'Accueil, de l'écran de veille et de l'aperçu des Paramètres comptaient tout
 * `light.*`, la LED d'une borne Wi-Fi comprise — une lampe de plus qu'Objets › Lumières. Les trois passent par `lumieresDe` (lumieres.js, `estLumiere`). */
test('L11 : le compteur de l’Accueil compte comme Objets › Lumières — la LED d’une borne n’y est pas, la lumière extérieure déclarée y est', async () => {
  const fx = maison();
  // La lumière extérieure éteinte : l'ancien compte (tout `light.*`) disait 2 allumées — l'ampoule et la LED —, Objets › Lumières n'en voit qu'une.
  const hass = { states: { ...fx.states, 'switch.lumiere_exterieur': { ...fx.states['switch.lumiere_exterieur'], state: 'off' } } };
  await avecMaison(fx, ({ discoverLights, deriveAccueil }) => {
    const objets = discoverLights(hass);
    const a = deriveAccueil(hass, {}, null);
    assert.deepEqual([objets.filter(l => l.on).length, objets.length], [1, 3], 'Objets › Lumières : 1 allumée sur 3');
    assert.deepEqual([a.lightsOn, a.lightsTotal], [1, 3], 'l’Accueil dit la même chose : ni la LED allumée, ni un « sur 4 »');
    // Allumée, la lumière extérieure compte : un switch déclaré est une lumière de la maison.
    const allumee = deriveAccueil({ states: fx.states }, {}, null);
    assert.deepEqual([allumee.lightsOn, allumee.lightsTotal], [2, 3]);
    // Des lumières choisies dans la configuration restent ce que l'on a choisi.
    const choisies = deriveAccueil(hass, { lights: [{ haid: 'light.bureau' }, { haid: 'light.ampoule_chambre' }] }, null);
    assert.deepEqual([choisies.lightsOn, choisies.lightsTotal], [1, 2]);
  });
});

test('L11 : l’écran de veille, l’en-tête et l’aperçu des Paramètres comptent par `lumieresDe` — plus aucun compte de `light.*` à la main', () => {
  const lire = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const app = MONOLITHE, params = lire('src/views/parametres.jsx'), etat = lire('src/state.js');
  assert.ok(app.includes("return lumieresDe(S, ctxLumieres()).filter(id => S[id] && S[id].state === 'on').length;"), 'le chip « n allumées » du header et de l’écran de veille');
  assert.ok(app.includes('if (!lightIds.length) lightIds = lumieresDe(S, ctxLumieres());'), 'le compteur de l’Accueil');
  // ASSERTION MODIFIÉE (ADR 0261, A1) : `switchLights` et `ctxLumieres` vivent dans state.js, à côté du réglage — une seule copie.
  assert.ok(etat.includes('export const ctxLumieres = () => ({ meta: LOGGIA_INDEX && LOGGIA_INDEX.entityMeta, switchsLumiere: switchLights() });'), 'ses catégories et ses switch déclarés viennent de l’index et de la maison');
  assert.ok(!app.includes('const switchLights = (') && !params.includes("loggiaEnt('switchLights'"), 'plus aucune copie de `switchLights` hors de state.js');
  assert.ok(params.includes("lumieresDe(S, ctxLumieres()).filter(id => S[id] && S[id].state === 'on').length"), 'l’aperçu des Paramètres');
  assert.ok(!/id\.indexOf\('light\.'\) === 0 && S\[id\]/.test(app + params), 'plus de compte de light.* sans catégorie');
  assert.ok(!app.includes("lightIds = Object.keys(S).filter(e => e.indexOf('light.') === 0);"), 'l’ancien repli de l’Accueil est parti');
});

/* ADR 0261 (A1, A2) : UNE définition de la lumière de la maison, `lumieresDe` — la découverte, Objets et les compteurs la lisent. */
function maisonAvecGroupes() {
  const fx = maison();
  fx.entities.push(entity('light.cachee', { device: 'd_hue', hidden: true }), entity('light.desactivee', { device: 'd_hue', disabled: true }), entity('light.groupe_chambre', { area: 'chambre' }), entity('light.groupe_lointain', { area: 'salon' }));
  Object.assign(fx.states, states(
    state('light.cachee', 'on', { friendly_name: 'Cachée', supported_color_modes: ['brightness'] }),
    state('light.desactivee', 'on', { friendly_name: 'Désactivée', supported_color_modes: ['brightness'] }),
    // Un groupe de Home Assistant : ses membres sont déjà là, il ne compte pas deux fois.
    state('light.groupe_chambre', 'on', { friendly_name: 'Chambre (groupe)', supported_color_modes: ['brightness'], entity_id: ['light.ampoule_chambre', 'light.bureau'] }),
    // Un groupe dont les membres ne sont pas dans le relevé : il reste, c'est la seule carte de ces lampes.
    state('light.groupe_lointain', 'on', { friendly_name: 'Dépendance', supported_color_modes: ['brightness'], entity_id: ['light.remise', 'light.atelier'] }),
  ));
  return fx;
}

test('ADR 0261 : la découverte retire ce que le registre cache ou désactive, et dédoublonne les groupes — on garde les membres', async () => {
  const fx = maisonAvecGroupes();
  await avecMaison(fx, ({ discoverLights, objetsDeLaMaison, deriveAccueil }, ctx) => {
    const attendu = ['light.ampoule_chambre', 'light.bureau', 'light.groupe_lointain', 'switch.lumiere_exterieur'];
    assert.deepEqual(discoverLights({ states: fx.states }, ctx.index).map(l => l.id).sort(), attendu);
    const objets = objetsDeLaMaison({ states: fx.states }, [], new Set());
    assert.deepEqual(objets.filter(o => o.filtres.includes('lumieres')).map(o => o.cle).sort(), attendu, 'Objets › Lumières dit la même liste');
    const a = deriveAccueil({ states: fx.states }, {}, null);
    assert.deepEqual([a.lightsOn, a.lightsTotal], [3, 4], 'le compteur de l’Accueil aussi : l’ampoule, le groupe lointain et la lumière extérieure allumés, sur quatre');
  });
});

test('ADR 0261 : plus aucun motif de nom dans la découverte — la LED d’une borne se reconnaît à sa catégorie seule', () => {
  const app = MONOLITHE;
  assert.ok(!app.includes('u6|g6|unifi|udm|usw|uap'), 'le motif UniFi est parti');
  const i = app.indexOf('function discoverLights(');
  assert.ok(app.slice(i, app.indexOf('\n}\n', i)).includes('const ids = lumieresDe(S, { meta, switchsLumiere: switchLights() });'), 'la découverte lit `lumieresDe`');
});
