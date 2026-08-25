// ─────────────────────────────────────────────────────────────────────────────
// Découverte de l'installation Home Assistant — socle de la version générique.
//
// Ce module ne connaît AUCUNE entité, zone ni appareil en particulier. Tout ce
// qu'il expose est déduit à l'exécution de deux sources :
//   1. les registres HA (zones, appareils, entités), lus en WebSocket ;
//   2. hass.states, pour les entités qui ne figurent dans aucun registre
//      (entités YAML, template, groupes…).
//
// Lecture seule. Aucune écriture, aucun token : les appels passent par la session
// de l'utilisateur connecté, donc les permissions Home Assistant s'appliquent
// telles quelles. Un utilisateur qui n'a pas le droit de lister un registre
// obtient simplement une découverte dégradée, jamais une erreur bloquante.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from 'react';
import { buildDevices } from './devices.js';
import { capsSummary } from './capabilities.js';

export const DISCOVERY_VERSION = 1;

// Domaines pris en compte pour les capacités. Cette liste dit « ce qu'on sait
// afficher », jamais « ce que l'utilisateur possède ».
export const CAP_DOMAINS = [
  'light', 'switch', 'sensor', 'binary_sensor', 'climate', 'cover', 'fan',
  'media_player', 'vacuum', 'lawn_mower', 'lock', 'camera', 'alarm_control_panel',
  'water_heater', 'humidifier', 'weather', 'person', 'device_tracker',
  'scene', 'script', 'automation', 'update', 'button', 'number', 'select',
  'input_boolean', 'input_number', 'input_select', 'input_datetime', 'image',
  'todo', 'calendar', 'siren', 'valve', 'text',
];

// Domaines qui justifient une vue spécialisée. La vue n'est proposée que si au
// moins une entité du domaine existe (cf. capabilities().views).
export const VIEW_CAPS = {
  lumieres: ['light'],
  climat: ['climate', 'water_heater'],
  volets: ['cover'],
  aspirateur: ['vacuum'],
  tondeuse: ['lawn_mower'],
  medias: ['media_player'],
  securite: ['camera', 'alarm_control_panel'],
  energie: ['sensor'], // affiné plus bas : il faut un capteur de puissance/énergie
  meteo: ['weather'],
};

const REG = {
  areas: 'config/area_registry/list',
  devices: 'config/device_registry/list',
  entities: 'config/entity_registry/list',
  floors: 'config/floor_registry/list',
};

const domainOf = (id) => (typeof id === 'string' ? id.slice(0, id.indexOf('.')) : '');

/** Appel WebSocket qui ne jette jamais : renvoie [] et note l'erreur. */
async function safeWS(hass, type, errors) {
  try {
    if (!hass || typeof hass.callWS !== 'function') throw new Error('callWS indisponible');
    const r = await hass.callWS({ type });
    return Array.isArray(r) ? r : [];
  } catch (e) {
    errors.push({ type, message: (e && e.message) || String(e) });
    return [];
  }
}

/** Même chose pour une réponse qui est un objet et non une liste. */
async function safeWSObj(hass, type, errors) {
  try {
    if (!hass || typeof hass.callWS !== 'function') throw new Error('callWS indisponible');
    const r = await hass.callWS({ type });
    return (r && typeof r === 'object') ? r : null;
  } catch (e) {
    errors.push({ type, message: (e && e.message) || String(e) });
    return null;
  }
}

/**
 * Lit les registres. Chaque registre est indépendant : l'échec de l'un
 * (permission insuffisante, version de HA plus ancienne) n'empêche pas les autres.
 *
 * On lit aussi les préférences du tableau de bord Énergie natif : c'est la
 * seule description standard de l'installation électrique — quel compteur, quelle
 * production solaire, quels appareils suivis. Toute installation qui a configuré
 * l'Énergie de Home Assistant nous la donne sans rien avoir à saisir.
 */
/**
 * Registres vus par le composant Loggia.
 *
 * Les quatre commandes de Home Assistant utilisées plus bas sont RÉSERVÉES AUX
 * ADMINISTRATEURS. Sur un compte ordinaire, la découverte ne rendait rien : ni
 * pièces, ni zones, ni appareils — le dashboard retombait sur ce qu'il pouvait
 * deviner des seuls états. Le composant, lui, tourne dans Home Assistant et lit
 * ces registres pour tout le monde.
 *
 * Il nomme ses champs `id` là où Home Assistant dit `area_id`, `device_id` ou
 * `entity_id` : la conversion se fait ici, pour que le reste du fichier ne
 * connaisse qu'une seule forme.
 */
async function registresDuComposant(hass) {
  if (!hass || typeof hass.callWS !== 'function') return null;
  let r;
  try {
    r = await hass.callWS({ type: 'loggia/discovery' });
  } catch (e) {
    return null;   // composant absent ou trop ancien : on se rabat plus bas
  }
  const index = r && r.index;
  if (!index || index.version !== 1) return null;
  return {
    areas: (index.areas || []).map(a => ({ area_id: a.id, name: a.name, floor_id: a.floor })),
    devices: (index.devices || []).map(d => ({
      id: d.id, name: d.name, name_by_user: null,
      manufacturer: d.manufacturer, model: d.model, sw_version: d.firmware,
      area_id: d.area, via_device_id: d.via, entry_type: d.entry_type,
      // Le domaine de l'intégration, que les registres n'exposent qu'au travers
      // de `identifiers` : le composant l'a déjà extrait.
      integration: d.integration,
    })),
    entities: (index.entities || []).map(e => ({
      entity_id: e.id, name: e.name, device_id: e.device, area_id: e.area,
      platform: e.platform, entity_category: e.category,
      device_class: e.device_class, original_device_class: e.device_class,
      unit_of_measurement: e.unit, hidden_by: e.hidden ? 'user' : null,
    })),
    floors: (index.floors || []).map(f => ({ floor_id: f.id, name: f.name, level: f.level })),
    // Ce que l'installation sait réellement faire. Une capacité déduite du seul
    // domaine reste une supposition ; cette liste, non.
    services: index.services || {},
  };
}

export async function fetchRegistries(hass) {
  const errors = [];
  const duComposant = await registresDuComposant(hass);
  if (duComposant) {
    const energyPrefs = await safeWSObj(hass, 'energy/get_prefs', errors);
    return { ...duComposant, energyPrefs, errors, source: 'composant' };
  }
  const [areas, devices, entities, floors, energyPrefs] = await Promise.all([
    safeWS(hass, REG.areas, errors),
    safeWS(hass, REG.devices, errors),
    safeWS(hass, REG.entities, errors),
    safeWS(hass, REG.floors, errors),
    safeWSObj(hass, 'energy/get_prefs', errors),
  ]);
  return { areas, devices, entities, floors, energyPrefs, errors, services: {}, source: 'home-assistant' };
}

/**
 * Croise registres et états.
 *
 * Rattachement d'une entité à une zone, dans l'ordre de priorité de Home
 * Assistant : la zone posée sur l'entité l'emporte sur celle de son appareil.
 */
export function buildIndex({ areas = [], devices = [], entities = [], floors = [], states = {}, services = null }) {
  const deviceArea = new Map();
  const deviceMeta = new Map();   // device_id -> fabricant, modele, integration
  const deviceName = new Map();
  devices.forEach(d => {
    if (!d || !d.id) return;
    deviceArea.set(d.id, d.area_id || null);
    deviceName.set(d.id, d.name_by_user || d.name || null);
    // Fabricant, modele, integration : jetes jusqu'ici, alors que ce sont eux
    // qui distinguent deux appareils du meme domaine. Deux robots sont tous
    // deux des `vacuum` ; seul le modele dit lequel accepte quelle commande.
    deviceMeta.set(d.id, {
      id: d.id,
      name: d.name_by_user || d.name || null,
      manufacturer: d.manufacturer || null,
      model: d.model || null,
      firmware: d.sw_version || null,
      integration: d.integration || null,
      area: d.area_id || null,
      via: d.via_device_id || null,
      entryType: d.entry_type || null,
    });
  });

  const areaById = new Map();
  areas.forEach(a => { if (a && a.area_id) areaById.set(a.area_id, a); });

  const entityArea = new Map();   // entity_id → area_id
  const entityMeta = new Map();   // entity_id → { deviceId, device, category, hidden, disabled, name }
  entities.forEach(e => {
    if (!e || !e.entity_id) return;
    const area = e.area_id || (e.device_id ? deviceArea.get(e.device_id) : null) || null;
    entityArea.set(e.entity_id, area);
    entityMeta.set(e.entity_id, {
      deviceId: e.device_id || null,
      device: e.device_id ? (deviceName.get(e.device_id) || null) : null,
      category: e.entity_category || null,     // 'config' | 'diagnostic' | null
      hidden: !!e.hidden_by,
      disabled: !!e.disabled_by,
      name: e.name || e.original_name || null,
    });
  });

  // Entités vivantes : présentes dans states, ni masquées ni désactivées. Celles
  // qui ne figurent dans aucun registre (YAML, template) sont gardées, sans zone.
  const live = [];
  Object.keys(states).forEach(id => {
    const m = entityMeta.get(id);
    if (m && (m.hidden || m.disabled)) return;
    live.push(id);
  });

  const byArea = new Map();       // area_id → [entity_id]
  const orphans = [];             // entités sans zone
  live.forEach(id => {
    const a = entityArea.get(id) || null;
    if (!a) { orphans.push(id); return; }
    if (!byArea.has(a)) byArea.set(a, []);
    byArea.get(a).push(id);
  });

  const areaList = areas
    .filter(a => a && a.area_id)
    .map(a => ({
      id: a.area_id,
      name: a.name || a.area_id,
      icon: a.icon || null,
      floor: a.floor_id || null,
      entities: byArea.get(a.area_id) || [],
    }))
    .sort((x, y) => x.name.localeCompare(y.name, 'fr'));

  return {
    areaList,
    areaById,
    entityArea,
    entityMeta,
    deviceMeta,
    // Les services appartiennent au DOMAINE, pas a l'entite : `cover` publie
    // `set_cover_tilt_position` meme quand aucun volet n'a d'inclinaison. Ils
    // servent donc a savoir si un domaine est charge, pas ce qu'il accepte.
    services,
    byArea,
    orphans,
    live,
    floors: floors.filter(f => f && f.floor_id).map(f => ({ id: f.floor_id, name: f.name || f.floor_id, level: f.level })),
    areaOf: (id) => entityArea.get(id) || null,
    /** Nom lisible de la zone d'une entite, ou null si elle n'en a pas. */
    areaNameOf: (id) => {
      const a = entityArea.get(id);
      const o = a ? areaById.get(a) : null;
      return (o && (o.name || o.area_id)) || null;
    },
    nameOf: (id) => {
      const st = states[id];
      const m = entityMeta.get(id);
      return (st && st.attributes && st.attributes.friendly_name) || (m && m.name) || id;
    },
  };
}

/**
 * Entites soeurs : toutes celles rattachees au meme appareil physique.
 *
 * C'est le mecanisme qui permet de supprimer les entity_id en dur. Les huit
 * capteurs d'un aspirateur (batterie, etat, surface, carte…) portent le meme
 * `device_id` que l'entite `vacuum.*` : on les retrouve par le registre au lieu
 * de les nommer. Renvoie [] si l'entite n'a pas d'appareil (entite YAML,
 * template, groupe) — auquel cas il faudra un rattachement manuel.
 */
export function siblingsOf(index, entityId) {
  if (!index) return [];
  const meta = index.entityMeta.get(entityId);
  if (!meta || !meta.deviceId) return [];
  const out = [];
  index.entityMeta.forEach((m, id) => {
    if (m.deviceId === meta.deviceId && id !== entityId) out.push(id);
  });
  return out;
}

/**
 * Choisit UNE entite soeur selon des criteres, par ordre de fiabilite :
 *   1. `deviceClass` — l'attribut standard de Home Assistant, le plus sur ;
 *   2. `unit` — l'unite de mesure ;
 *   3. `match` — un motif sur l'identifiant, en dernier recours seulement.
 *
 * `domain` restreint au domaine voulu. Renvoie null si rien ne correspond :
 * l'appelant doit toujours prevoir l'absence.
 */
export function pickSibling(index, states, entityId, { domain, deviceClass, unit, match } = {}) {
  const ids = siblingsOf(index, entityId);
  const ok = (id) => {
    if (domain && domainOf(id) !== domain) return false;
    const a = (states[id] && states[id].attributes) || {};
    if (deviceClass && a.device_class !== deviceClass) return false;
    if (unit && a.unit_of_measurement !== unit) return false;
    if (match && !match.test(id)) return false;
    return true;
  };
  // Une entite de diagnostic reste acceptable ici (la batterie en est souvent
  // une), mais on prefere une entite principale si les deux existent.
  const matches = ids.filter(ok);
  if (!matches.length) return null;
  const principal = matches.find(id => {
    const m = index.entityMeta.get(id);
    return !m || !m.category;
  });
  return principal || matches[0];
}

/** Un capteur compte comme « énergie » d'après sa device_class, jamais son nom. */
const ENERGY_CLASSES = new Set(['power', 'energy', 'current', 'voltage', 'gas', 'water']);

/**
 * Capacités de l'installation : ce que le dashboard peut proposer.
 *
 * Aucun test sur un entity_id. On compte par domaine et par device_class, et on
 * en déduit les vues. Une entité indisponible est comptée à part : elle existe
 * (donc la vue a un sens) mais on sait le signaler.
 */
export function capabilities({ states = {}, index = null }) {
  const counts = {};
  const byDomain = {};
  let unavailable = 0;

  const ids = index ? index.live : Object.keys(states);
  ids.forEach(id => {
    const d = domainOf(id);
    if (!d) return;
    const st = states[id];
    if (st && (st.state === 'unavailable' || st.state === 'unknown')) unavailable++;
    counts[d] = (counts[d] || 0) + 1;
    if (!byDomain[d]) byDomain[d] = [];
    byDomain[d].push(id);
  });

  const has = {};
  CAP_DOMAINS.forEach(d => { has[d] = (counts[d] || 0) > 0; });

  const energySensors = (byDomain.sensor || []).filter(id => {
    const a = states[id] && states[id].attributes;
    return !!(a && ENERGY_CLASSES.has(a.device_class));
  });

  // Appareils présentables d'un domaine : les entités de configuration et de
  // diagnostic n'ont rien à faire sur une carte.
  const listOf = (domain) => (byDomain[domain] || [])
    .filter(id => {
      const m = index && index.entityMeta.get(id);
      return !(m && (m.category === 'config' || m.category === 'diagnostic'));
    })
    .map(id => ({
      id,
      name: index ? index.nameOf(id) : id,
      // `area` est un area_id ; `areaName` le libelle. Les deux servent :
      // l'identifiant pour regrouper, le nom pour afficher et pour se
      // rapprocher des pieces, qui sont designees par leur nom.
      area: index ? index.areaOf(id) : null,
      areaName: index ? index.areaNameOf(id) : null,
      device: (index && index.entityMeta.get(id) && index.entityMeta.get(id).device) || null,
      available: !!(states[id] && states[id].state !== 'unavailable' && states[id].state !== 'unknown'),
    }));

  const devices = {};
  ['vacuum', 'lawn_mower', 'climate', 'water_heater', 'camera', 'media_player',
    'cover', 'alarm_control_panel', 'lock', 'fan', 'humidifier', 'weather', 'person'].forEach(d => {
      if (has[d]) devices[d] = listOf(d);
    });

  const views = {};
  Object.keys(VIEW_CAPS).forEach(v => { views[v] = VIEW_CAPS[v].some(d => has[d]); });
  views.energie = energySensors.length > 0; // un capteur quelconque ne suffit pas

  return {
    counts, has, devices, views, energySensors,
    totals: {
      entities: ids.length,
      unavailable,
      areas: index ? index.areaList.length : 0,
      areasUsed: index ? index.areaList.filter(a => a.entities.length).length : 0,
      orphans: index ? index.orphans.length : 0,
      domains: Object.keys(counts).length,
    },
  };
}

/**
 * Hook de découverte. Les registres ne bougeant quasiment jamais en cours de
 * session, ils sont lus une seule fois ; `refresh()` force une relecture.
 */
export function useDiscovery(hass) {
  const [data, setData] = useState({ ready: false, errors: null, index: null,
    caps: null, devices: null, abilities: null, raw: null });
  const startedRef = useRef(false);
  const aliveRef = useRef(true);
  useEffect(() => () => { aliveRef.current = false; }, []);

  const load = useCallback(() => {
    if (!hass) return Promise.resolve(null);
    return fetchRegistries(hass).then(reg => {
      const states = hass.states || {};
      const index = buildIndex({ ...reg, states });
      const caps = capabilities({ states, index });
      // Les appareils sont construits une fois, ici : ils ne changent qu'avec
      // les registres, pas avec les états, qui eux bougent en permanence.
      const devices = buildDevices(index, states);
      // Ce que chaque appareil sait faire, d'après ce qu'il déclare lui-même.
      const abilities = capsSummary(devices, states, index.services, index.entityMeta);
      const next = { ready: true, errors: reg.errors.length ? reg.errors : null,
        index, caps, devices, abilities, raw: reg };
      if (aliveRef.current) setData(next);
      return next;
    }).catch(() => null);
  }, [hass]);

  useEffect(() => {
    if (!hass || startedRef.current) return;
    startedRef.current = true;
    load();
  }, [hass, load]);

  return { ...data, refresh: load };
}

/**
 * Résumé lisible, pour vérifier la découverte sur une installation réelle sans
 * rien afficher dans l'interface. À appeler depuis la console du navigateur :
 *   loggiaDiscovery.report()
 */
export function report(d) {
  if (!d || !d.ready) return 'Découverte non terminée (Home Assistant absent ?)';
  const c = d.caps, t = c.totals;
  const L = [];
  L.push('Loggia · découverte v' + DISCOVERY_VERSION);
  L.push(`${t.areas} zones (${t.areasUsed} utilisées) · ${t.entities} entités · ${t.domains} domaines`);
  L.push(`${t.unavailable} entités indisponibles · ${t.orphans} sans zone`);
  if (d.errors) L.push('Registres en échec : ' + d.errors.map(e => e.type + ' (' + e.message + ')').join(', '));
  if (d.devices && d.devices.size) {
    const dv = [...d.devices.values()];
    const marques = new Set(dv.map(x => x.manufacturer).filter(Boolean));
    const integrations = new Set(dv.map(x => x.integration).filter(Boolean));
    L.push(`${dv.length} appareils (${dv.filter(x => !x.available).length} hors ligne)`
      + ` · ${marques.size} fabricants · ${integrations.size} intégrations`);
  }
  if (d.abilities && d.abilities.parCapacite.size) {
    L.push('');
    L.push('Ce que les appareils savent faire (nombre d’appareils) :');
    [...d.abilities.parCapacite.entries()]
      .sort((a, b) => b[1] - a[1])
      .forEach(([k, n]) => L.push('  ' + k.padEnd(24) + n));
  }
  L.push('');
  L.push('Entités par domaine :');
  Object.keys(c.counts).sort((a, b) => c.counts[b] - c.counts[a]).forEach(k => {
    L.push('  ' + k.padEnd(22) + c.counts[k]);
  });
  L.push('');
  L.push('Vues que la découverte proposerait :');
  Object.keys(c.views).forEach(v => L.push('  ' + v.padEnd(14) + (c.views[v] ? 'oui' : 'non')));
  L.push('');
  L.push('Zones détectées :');
  d.index.areaList.forEach(a => L.push('  ' + a.name.padEnd(22) + a.entities.length + ' entités'));
  if (!d.index.areaList.length) L.push('  (aucune zone configurée dans Home Assistant)');
  return L.join('\n');
}
