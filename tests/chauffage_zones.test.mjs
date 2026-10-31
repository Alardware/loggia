// Un module fil pilote devient un chauffage (chantier Chauffage, plan 2, tâche 5).
//
// Un module fil pilote (le NodOn sous zigbee2mqtt) porte, sur UN appareil, trois
// entités : le `select` de ses ordres (Confort, Éco, Hors-gel, Arrêt…),
// l'interrupteur qui ALIMENTE le module — le couper le rend sourd à tout ordre —
// et un capteur de puissance. L'écran ne connaissait que l'interrupteur, rangé
// sous « Prises » comme une prise de radiateur : basculer cette carte coupait
// le module.
//
// Le serveur dit désormais la famille de chaque chauffage dans l'index (tâche 1).
// La résolution fait du `select` une zone de chauffage (choix 2 du plan 2) et
// cette découverte COMPLÈTE les zones décrites à la main au lieu d'être
// remplacée par elles (choix 3, règle du 07/10). L'interrupteur d'un module n'a
// plus de carte, ni dans les pièces ni dans Objets : l'appareil est représenté
// par sa zone.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';

import { resolveClimate, interrupteurDeModule, modulesHorsSaisie } from '../src/resolve.js';
import { area, device, entity, state, states, ctxOf, indexOf } from './fixtures.mjs';

import { MONOLITHE } from './monolithe.mjs'; // App.jsx et ce qui en sort (ADR 0282)
const APP = MONOLITHE;

// Les options du NodOn SIN-4-FP-21, telles que zigbee2mqtt les publie.
const NODON = ['comfort', 'eco', 'frost_protection', 'off', 'comfort_-1', 'comfort_-2'];
const SELECT = 'select.radiateur_chambre_pilot_wire_mode';
const INTER = 'switch.radiateur_chambre';
const PUISSANCE = 'sensor.radiateur_chambre_power';

/**
 * Une maison : un module fil pilote dans la chambre (son `select`, son
 * interrupteur, sa puissance, son énergie), le thermomètre de la pièce, une
 * prise de chevet dans la même pièce, une prise et une lampe au séjour, un
 * interrupteur sans appareil. Chaque option change UNE chose.
 *
 * Les noms sont ceux de zigbee2mqtt : l'appareil porte celui que l'utilisateur
 * lui a donné (« Radiateur Chambre ») ; son `select` s'affiche sous ce nom
 * suivi de celui de l'exposition (« Radiateur Chambre Pilot wire mode »).
 */
function maison({ famille = 'fil_pilote', etatDuSelect = true, nomAppareil = 'Radiateur Chambre',
  nomAffiche = 'Radiateur Chambre Pilot wire mode', nomRegistre = null, masque = false, desactive = false,
  thermostat = false, thermometreDuModule = false } = {}) {
  const ents = [
    { ...entity(SELECT, { device: 'd_module', name: nomRegistre, hidden: masque, disabled: desactive }), famille },
    entity(INTER, { device: 'd_module' }),
    entity(PUISSANCE, { device: 'd_module' }),
    entity('sensor.radiateur_chambre_energy', { device: 'd_module' }),
    entity('sensor.chambre_temperature', { area: 'chambre' }),
    entity('switch.prise_chevet', { device: 'd_chevet' }),
    entity('switch.prise_salon', { device: 'd_prise' }),
    entity('switch.sans_appareil', { area: 'salon' }),
    entity('light.salon', { area: 'salon' }),
  ];
  const st = [
    ...(etatDuSelect ? [state(SELECT, 'comfort', { ...(nomAffiche ? { friendly_name: nomAffiche } : {}), options: NODON })] : []),
    state(INTER, 'on', { friendly_name: 'Radiateur Chambre' }),
    state(PUISSANCE, '612', { device_class: 'power', unit_of_measurement: 'W' }),
    state('sensor.radiateur_chambre_energy', '12.3', { device_class: 'energy', unit_of_measurement: 'kWh' }),
    state('sensor.chambre_temperature', '19.2', { device_class: 'temperature', unit_of_measurement: '°C' }),
    state('switch.prise_chevet', 'off', { friendly_name: 'Prise chevet' }),
    state('switch.prise_salon', 'on', { friendly_name: 'Prise salon' }),
    state('switch.sans_appareil', 'off', { friendly_name: 'Sans appareil' }),
    state('light.salon', 'on', { friendly_name: 'Lampe salon', supported_color_modes: ['onoff'] }),
  ];
  if (thermostat) {
    ents.push(entity('climate.salon', { device: 'd_therm' }));
    st.push(state('climate.salon', 'heat', { friendly_name: 'Thermostat salon' }));
  }
  if (thermometreDuModule) {
    ents.push(entity('sensor.radiateur_chambre_temperature', { device: 'd_module' }));
    st.push(state('sensor.radiateur_chambre_temperature', '18.7', { device_class: 'temperature', unit_of_measurement: '°C' }));
  }
  return {
    areas: [area('chambre', 'Chambre'), area('salon', 'Séjour')],
    devices: [
      device('d_module', nomAppareil, 'chambre'),
      device('d_chevet', 'Prise chevet', 'chambre'),
      device('d_prise', 'Prise salon', 'salon'),
      device('d_therm', 'Thermostat', 'salon'),
    ],
    entities: ents,
    floors: [],
    states: states(...st),
    energyPrefs: null,
  };
}

/** La zone que la découverte fait du module, telle que les vues la lisent. */
const ZONE = {
  id: SELECT, haid: SELECT, name: 'Radiateur Chambre', room: 'Chambre', type: 'pilot_wire',
  modeEnt: SELECT, tempCible: null, hasAuto: false,
  tempSensor: 'sensor.chambre_temperature', puissance: PUISSANCE, decouvert: true,
};

// ── La zone découverte ───────────────────────────────────────────────────────

test('un module fil pilote devient une zone de chauffage, à la forme exacte', () => {
  const c = resolveClimate(ctxOf(maison()));
  assert.equal(c.available, true);
  assert.equal(c.source, 'decouverte');
  assert.deepEqual(c.list, [ZONE],
    'le select est la zone : le nom de son appareil, son mode, sa pièce, le thermomètre de la pièce, sa puissance — et AUCUNE consigne inventée');
});

test('le thermomètre du module passe avant celui de la pièce ; sans capteur de puissance, rien', () => {
  const fx = maison({ thermometreDuModule: true });
  delete fx.states[PUISSANCE];
  fx.entities = fx.entities.filter(e => e.entity_id !== PUISSANCE);
  const z = resolveClimate(ctxOf(fx)).list[0];
  assert.equal(z.tempSensor, 'sensor.radiateur_chambre_temperature', 'le capteur voisin d’abord');
  assert.equal(z.puissance, null, 'un capteur absent vaut null, pas un identifiant inventé');
});

test('le nom : celui de l’appareil, sinon le nom affiché du select, sinon le registre, sinon l’identifiant', () => {
  /* Décision du 10/10 : sous zigbee2mqtt, le select s'affiche « Radiateur
   * Chambre Pilot wire mode ». La zone prend le nom de l'APPAREIL, celui que
   * l'utilisateur a donné ; le serveur nomme le chauffage de même
   * (chauffage.py, `_etat_un`). */
  const nom = (o) => resolveClimate(ctxOf(maison(o))).list[0].name;
  assert.equal(nom(), 'Radiateur Chambre', 'l’appareil d’abord, pas « … Pilot wire mode »');
  assert.equal(nom({ nomAppareil: null }), 'Radiateur Chambre Pilot wire mode', 'un appareil sans nom : le nom affiché du select');
  assert.equal(nom({ nomAppareil: null, nomAffiche: null, nomRegistre: 'Fil pilote chambre' }), 'Fil pilote chambre',
    'ni l’un ni l’autre : le nom du registre');
  assert.equal(nom({ nomAppareil: null, nomAffiche: null }), SELECT, 'aucun nom : l’identifiant');
  // Renommé dans Home Assistant, l'appareil porte `name_by_user` : c'est celui-là.
  const fx = maison();
  fx.devices[0] = device('d_module', 'SIN-4-FP-21', 'chambre', { name_by_user: 'Radiateur Chambre' });
  assert.equal(resolveClimate(ctxOf(fx)).list[0].name, 'Radiateur Chambre', 'le nom donné par l’utilisateur, pas celui du modèle');
});

test('un select masqué ou désactivé dans Home Assistant ne devient rien — comme un thermostat masqué', () => {
  for (const o of [{ masque: true }, { desactive: true }]) {
    const c = resolveClimate(ctxOf(maison(o)));
    assert.equal(c.available, false, JSON.stringify(o));
    assert.deepEqual(c.list, [], JSON.stringify(o));
  }
  // Le thermostat masqué, à côté : la découverte l'écartait déjà (`index.live`).
  const fx = maison({ masque: true, thermostat: true });
  fx.entities.find(e => e.entity_id === 'climate.salon').hidden_by = 'user';
  assert.deepEqual(resolveClimate(ctxOf(fx)).list, []);
});

test('les thermostats ne changent pas : les mêmes zones, en tête, et le module après', () => {
  const c = resolveClimate(ctxOf(maison({ thermostat: true })));
  assert.deepEqual(c.list.map(z => z.id), ['climate.salon', SELECT]);
  assert.deepEqual(c.list[0], {
    id: 'climate.salon', haid: 'climate.salon', name: 'Thermostat salon', room: 'Séjour',
    type: 'thermostat', hasAuto: false, tempSensor: null,
  }, 'un thermostat garde exactement sa forme d’avant');
});

test('un select sans famille ne devient rien', () => {
  const c = resolveClimate(ctxOf(maison({ famille: null })));
  assert.equal(c.available, false, 'ni thermostat ni module : la vue se tait');
  assert.equal(typeof c.reason, 'string');
  assert.deepEqual(c.list, []);
  // Même maison, un thermostat en plus : lui seul.
  assert.deepEqual(resolveClimate(ctxOf(maison({ famille: null, thermostat: true }))).list.map(z => z.id), ['climate.salon']);
});

test('un select fil pilote sans état ne devient rien', () => {
  const c = resolveClimate(ctxOf(maison({ etatDuSelect: false })));
  assert.equal(c.available, false);
  assert.deepEqual(c.list, []);
});

// ── La saisie : complétée, jamais remplacée ──────────────────────────────────

// Deux zones décrites à la main sur des aides (input_*), comme chez qui a écrit
// son chauffage en automatisations : elles ne nomment pas le select du module.
const SAISIE = () => [
  { id: 'chambre', name: 'Chambre', room: 'Chambre', haid: INTER, type: 'pilot_wire',
    tempCible: 'input_number.consigne_chambre', modeEnt: 'input_select.mode_chambre', autoEnt: null, hasAuto: false, tempSensor: null },
];

test('une saisie qui ne décrit pas le module : elle, telle quelle, puis le module', () => {
  const mine = SAISIE();
  const c = resolveClimate(ctxOf(maison({ thermostat: true }), { loggia_climate: mine }));
  assert.equal(c.available, true);
  assert.equal(c.source, 'utilisateur');
  assert.equal(c.list.length, 2);
  assert.equal(c.list[0], mine[0], 'la zone saisie est rendue telle quelle — le même objet');
  assert.deepEqual(c.list[1], ZONE, 'le module la complète');
  assert.ok(!c.list.some(z => z.haid === 'climate.salon'),
    'les thermostats ne changent pas : une saisie les laisse au registre, comme avant');
  assert.equal(mine.length, 1, 'la saisie n’est pas modifiée');
});

test('une saisie qui décrit déjà le module, par son mode ou par son entité : elle seule', () => {
  const parMode = [{ ...SAISIE()[0], modeEnt: SELECT }];
  assert.deepEqual(resolveClimate(ctxOf(maison(), { loggia_climate: parMode })).list, parMode, 'décrit en modeEnt : pas de doublon');
  const parEntite = [{ id: 'chambre', name: 'Chambre', room: 'Chambre', haid: SELECT }];
  assert.deepEqual(resolveClimate(ctxOf(maison(), { loggia_climate: parEntite })).list, parEntite, 'décrit en haid : pas de doublon');
});

test('les modules hors saisie : seulement ce qui est découvert et que la saisie ne nomme pas', () => {
  const autre = { ...ZONE, id: 'select.bureau', haid: 'select.bureau', modeEnt: 'select.bureau' };
  const decrite = { id: 'x', haid: 'switch.x', modeEnt: 'select.bureau' };
  assert.deepEqual(modulesHorsSaisie([decrite], [ZONE, autre]), [ZONE]);
  assert.deepEqual(modulesHorsSaisie([{ id: 'y', haid: SELECT }], [ZONE]), [], 'nommé en haid');
  assert.deepEqual(modulesHorsSaisie([], [ZONE, { id: 'climate.a', haid: 'climate.a' }]), [ZONE], 'une zone qui n’est pas découverte ne passe jamais');
  // Une saisie abîmée (null, une entité en objet) ne fait rien tomber.
  assert.deepEqual(modulesHorsSaisie([null, { haid: { id: SELECT } }], [ZONE]), [ZONE]);
  assert.deepEqual(modulesHorsSaisie(null, null), []);
});

// ── L'interrupteur d'un module ───────────────────────────────────────────────

test('l’interrupteur d’un module se reconnaît par son appareil, rien d’autre', () => {
  const fx = maison();
  // Un voyant fictif sur le même appareil : c'est le DOMAINE qui l'écarte.
  fx.entities.push(entity('light.voyant_radiateur', { device: 'd_module' }));
  fx.states['light.voyant_radiateur'] = { entity_id: 'light.voyant_radiateur', state: 'on', attributes: {} };
  const ix = indexOf(fx);
  assert.equal(interrupteurDeModule(ix, INTER), true, 'l’interrupteur du module');
  assert.equal(interrupteurDeModule(ix, 'switch.prise_chevet'), false, 'une prise dont l’appareil n’a pas de select fil pilote');
  assert.equal(interrupteurDeModule(ix, 'switch.sans_appareil'), false, 'un interrupteur sans appareil');
  assert.equal(interrupteurDeModule(ix, 'light.salon'), false, 'une lampe');
  assert.equal(interrupteurDeModule(ix, 'light.voyant_radiateur'), false, 'une lampe, même sur l’appareil du module');
  assert.equal(interrupteurDeModule(ix, SELECT), false, 'le select lui-même n’est pas un interrupteur');
  assert.equal(interrupteurDeModule(ix, 'switch.inconnu'), false, 'une entité que l’index ne connaît pas');
  assert.equal(interrupteurDeModule(indexOf(maison({ famille: null })), INTER), false, 'sans famille, l’interrupteur reste une prise');
  assert.equal(interrupteurDeModule(null, INTER), false, 'sans index, rien');
});

// ── Objets et Pièce ──────────────────────────────────────────────────────────
// `objetsDeLaMaison`, `roomEntitiesBrutes`, `climateZones`… vivent dans App.jsx,
// qui n'exporte que l'application. Un crochet de chargement leur ajoute un
// export sous `?chauffage_zones`, pour ce fichier seul — le patron de
// tests/objets.test.mjs ; le fichier n'est pas touché.

const SUFFIXE = '?chauffage_zones';
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
        "  return { ...r, source: String(r.source) + ';export { objetsDeLaMaison, roomEntitiesBrutes, climateZones, climateKeys, readZone, nomDeCle };' };",
        '}',
      ].join('\n')));
      const { setLoggiaState } = await import('../src/state.js');
      const mod = await import(new URL('../src/App.jsx' + SUFFIXE, import.meta.url).href);
      return { setLoggiaState, ...mod };
    })();
  }
  return chargement;
}

/** Pose la maison dans l'état partagé, comme App le fait, le temps de `f`. */
async function avecMaison(fx, { cfg = {}, ent = {} } = {}, f) {
  const a = await app();
  const ctx = ctxOf(fx, cfg);
  a.setLoggiaState({ index: ctx.index, ent, cfg, resolved: { climate: resolveClimate(ctx) } });
  try {
    return await f(a);
  } finally {
    a.setLoggiaState({ index: null, ent: {}, cfg: {}, resolved: null });
  }
}

test('Objets : l’interrupteur du module n’a plus de carte, le module est rangé sous Chauffage', async () => {
  const fx = maison();
  await avecMaison(fx, {}, ({ objetsDeLaMaison }) => {
    const objets = objetsDeLaMaison({ states: fx.states }, [], new Set());
    const cles = objets.map(o => o.cle);
    assert.ok(!cles.includes(INTER), 'l’interrupteur du module est encore une carte — un geste machinal coupe le module');
    assert.ok(!cles.includes(SELECT), 'le select ne fait pas une seconde carte : il EST la zone');
    assert.ok(cles.includes('switch.prise_chevet') && cles.includes('switch.prise_salon'), 'une prise ordinaire reste une prise');
    const z = objets.find(o => o.cle === 'zone:' + SELECT);
    assert.ok(z, 'le module n’a pas de carte');
    assert.equal(z.type, 'zone');
    assert.equal(z.nom, 'Radiateur Chambre');
    assert.equal(z.piece, 'Chambre');
    assert.deepEqual(z.filtres, ['chauffage'], 'rangé sous Chauffage, plus sous Prises');
    assert.deepEqual(z.zone, ZONE);
  });
});

test('Objets : un interrupteur ajouté à la main reste une carte', async () => {
  // L'éditeur a le dernier mot : ce qu'on y ajoute n'est pas retiré.
  const fx = maison();
  await avecMaison(fx, {}, ({ objetsDeLaMaison }) => {
    const cles = objetsDeLaMaison({ states: fx.states }, [INTER], new Set()).map(o => o.cle);
    assert.ok(cles.includes(INTER));
  });
});

test('Pièce : le module a la carte de sa zone, son interrupteur aucune', async () => {
  const fx = maison();
  await avecMaison(fx, {}, ({ roomEntitiesBrutes }) => {
    const ids = roomEntitiesBrutes({ states: fx.states }, 'Chambre');
    assert.ok(ids.includes('zone:' + SELECT), 'la carte du module, par sa zone');
    assert.ok(!ids.includes(INTER), 'l’interrupteur du module a encore une carte dans la pièce');
    assert.ok(ids.includes('switch.prise_chevet'), 'une prise ordinaire de la pièce garde la sienne');
  });
});

test('les zones : la saisie, puis les modules qu’elle ne décrit pas — l’ancienne configuration aussi', async () => {
  const fx = maison();
  const mine = SAISIE();
  await avecMaison(fx, { cfg: { loggia_climate: mine } }, ({ climateZones, objetsDeLaMaison }) => {
    assert.deepEqual(climateZones(fx.states).map(z => z.id), ['chambre', SELECT], 'côte à côte, pendant les jours d’essai');
    assert.equal(climateZones(fx.states)[0], mine[0], 'la zone saisie, telle quelle');
    const cles = objetsDeLaMaison({ states: fx.states }, [], new Set()).map(o => o.cle);
    assert.ok(cles.includes('zone:chambre') && cles.includes('zone:' + SELECT), 'deux cartes : la zone décrite et le module');
  });
  const decrite = [{ ...mine[0], modeEnt: SELECT }];
  await avecMaison(fx, { cfg: { loggia_climate: decrite } }, ({ climateZones }) => {
    assert.deepEqual(climateZones(fx.states).map(z => z.id), ['chambre'], 'déjà décrit : pas de doublon');
  });
  /* `loggia_entities.climate`, la configuration héritée : la résolution ne la
   * connaît pas (elle découvre le module), c'est `climateZones` qui la
   * complète — et ne double pas ce qu'elle décrit. */
  await avecMaison(fx, { ent: { climate: decrite } }, ({ climateZones }) => {
    assert.deepEqual(climateZones(fx.states).map(z => z.id), ['chambre']);
  });
  await avecMaison(fx, { ent: { climate: mine } }, ({ climateZones }) => {
    assert.deepEqual(climateZones(fx.states).map(z => z.id), ['chambre', SELECT]);
  });
});

test('une zone découverte se lit par son select, sans consigne', async () => {
  const fx = maison();
  await avecMaison(fx, {}, ({ climateZones, readZone }) => {
    const z = readZone(fx.states, climateZones(fx.states).find(x => x.id === SELECT));
    assert.equal(z.modeBrut, 'comfort', 'l’option telle que le module l’écrit');
    assert.equal(z.mode, 'confort', 'sa famille, pour la couleur');
    assert.equal(z.current, 19.2, 'la température de la pièce');
    assert.equal(z.target, undefined, 'aucune consigne inventée');
  });
});

test('une clé de zone qui porte un point se nomme quand même', async () => {
  /* L'identifiant d'une zone découverte EST l'entity_id de son select : sa clé,
   * `zone:select.…`, porte un point. `nomDeCle` la trouve par son préfixe ; le
   * nom d'une carte de la Pièce, lui, ne passait par elle que pour une clé
   * SANS point — il affichait la clé brute en édition. */
  const fx = maison();
  await avecMaison(fx, {}, ({ nomDeCle }) => {
    assert.equal(nomDeCle(fx.states, 'zone:' + SELECT), 'Radiateur Chambre');
  });
  assert.ok(APP.includes(": (k.indexOf('zone:') === 0 || (k.indexOf(':') > 0 && k.indexOf('.') < 0)) ? nomDeCle(S0, k)"),
    'la Pièce nomme une clé de zone par nomDeCle, point ou pas');
});

test('les clés surveillées : le select et la puissance du module', async () => {
  const fx = maison();
  await avecMaison(fx, {}, ({ climateKeys }) => {
    const cles = climateKeys();
    assert.ok(cles.includes(SELECT), 'le select : le mode se redessine');
    assert.ok(cles.includes(PUISSANCE), 'la puissance : « Chauffe » se lit sur elle');
    assert.ok(cles.includes('sensor.chambre_temperature'), 'la Pièce suit aussi la température');
    const commandes = climateKeys(false);
    assert.ok(commandes.includes(SELECT) && commandes.includes(PUISSANCE));
    assert.ok(!commandes.includes('sensor.chambre_temperature'), 'Objets ne suit que ce qu’il commande : une mesure en retard ne ment pas');
  });
  // Objets suit ce que les zones commandent ; la Pièce, toutes leurs clés.
  const i = APP.indexOf('const VIEW_HAKEYS');
  const bloc = APP.slice(i, APP.indexOf('\n  };', i));
  assert.ok(bloc.slice(bloc.indexOf('objets:'), bloc.indexOf('securite:')).includes('...climateKeys(false)'),
    'la vue Objets ne suit pas le select d’un module : sa bascule mentirait 6 s');
  assert.ok(APP.includes("const roomKeys = activeRoom ? ['light.', 'switch.', 'cover.', 'climate.', 'media_player.', 'fan.', 'lock.', ...climateKeys(),"),
    'la Pièce suit les zones');
  // La puissance jitte : arrondie à 10 W, elle ne redessine pas l'écran à chaque tic.
  const n = APP.indexOf('const noisyKeys = [');
  assert.ok(APP.slice(n, APP.indexOf('.filter(Boolean);', n)).includes('...climateZones(null).map(z => z.puissance),'),
    'la puissance d’un module n’est pas une clé bruyante');
});
