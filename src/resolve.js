// ─────────────────────────────────────────────────────────────────────────────
// Resolution des entites d'un domaine.
//
// Une vue specialisee a besoin de savoir QUELLE entite lire : l'etat de
// l'aspirateur, le flux de la camera, le capteur du compteur. Ce fichier repond
// a cette question sans nommer aucune entite, selon un ordre unique :
//
//   1. ce que l'utilisateur a choisi   (configuration serveur)
//   2. ce que la decouverte a trouve   (registres Home Assistant)
//   3. rien                            (la vue se masque, cf. capacites)
//
// Aucune valeur de secours pointant une installation particuliere. Un resultat
// vide est une reponse valide, jamais une erreur.
// ─────────────────────────────────────────────────────────────────────────────

import { siblingsOf, pickSibling } from './discovery.js';
import { mergedProfile, primaryEntity } from './profiles.js';

/** Choix de l'utilisateur pour ce domaine, s'il en a fait un. */
function userPick(userCfg, key) {
  const v = userCfg && userCfg[key];
  return typeof v === 'string' && v ? v : null;
}

/**
 * Aspirateur.
 *
 * Le domaine `vacuum` donne l'appareil ; ses capteurs sont retrouves par le
 * `device_id`. Sur les integrations qui exposent des capteurs template (donc
 * sans appareil), `siblings` est vide : les champs concernes valent null et la
 * vue affiche des tirets, ce qu'elle sait deja faire.
 */
export function resolveVacuum({ index, caps, states = {}, userCfg = {} } = {}) {
  const list = (caps && caps.devices && caps.devices.vacuum) || [];
  if (!list.length) return { available: false, reason: 'aucune entite du domaine vacuum' };

  const chosen = userPick(userCfg, 'loggia_vacuum_entity');
  const main = (chosen && list.find(v => v.id === chosen)) || list[0];
  const sib = siblingsOf(index, main.id);
  const st = states[main.id] || {};
  const attrs = st.attributes || {};

  // Surcharges explicites : l'utilisateur a designe lui-meme un capteur.
  const over = (userCfg && typeof userCfg.loggia_vacuum === 'object' && userCfg.loggia_vacuum) || {};
  const pick = (key, opts) => over[key] || pickSibling(index, states, main.id, opts);

  return {
    available: true,
    main: main.id,
    name: main.name,
    area: main.area,
    choices: list.map(v => ({ id: v.id, name: v.name })),
    siblings: sib.length,

    // L'ETAT vient de l'entite vacuum elle-meme, pas d'un capteur : c'est la
    // seule source garantie chez tout le monde. Valeurs normalisees par Home
    // Assistant (docked, cleaning, paused, returning, error, idle), a traduire
    // cote interface. Un capteur d'etat maison n'est jamais rattache a
    // l'appareil, donc introuvable par le registre.
    state: st.state || null,

    // La batterie est souvent un attribut de l'entite avant d'etre un capteur.
    batteryLevel: typeof attrs.battery_level === 'number' ? attrs.battery_level : null,
    fanSpeed: attrs.fan_speed || null,
    supportedFeatures: attrs.supported_features || 0,

    // device_class d'abord : c'est l'attribut normalise de Home Assistant.
    battery: pick('battery', { domain: 'sensor', deviceClass: 'battery' }),
    map: pick('map', { domain: 'image' }) || pickSibling(index, states, main.id, { domain: 'camera' }),
    // Capteurs sans device_class : unite d'abord, motif generique en dernier
    // recours (aucun nom d'appareil dans le motif).
    area_cleaned: pick('area_cleaned', { domain: 'sensor', unit: 'm²' }),
    duration: pick('duration', { domain: 'sensor', unit: 'min' }),
    status: pick('status', { domain: 'sensor', match: /_(status|state|etat)$/ }),
  };
}

/**
 * Etats normalises du domaine vacuum → libelle francais.
 *
 * Remplace la dependance a un capteur d'etat deja traduit : chez un tiers, ce
 * capteur n'existe pas, mais l'etat de l'entite, lui, est toujours la.
 */
export const VACUUM_STATE_FR = {
  cleaning: 'Nettoyage',
  docked: 'Sur la base',
  paused: 'En pause',
  idle: 'En veille',
  returning: 'Retour base',
  error: 'Erreur',
  unavailable: 'Indisponible',
  unknown: 'Inconnu',
};

/**
 * Formatage des mesures brutes.
 *
 * Les capteurs natifs renvoient des nombres nus (« 55.0 ») la ou un capteur
 * template maison renvoyait deja « 55 min ». Le formatage remonte donc cote
 * interface, ce qui le rend valable pour toutes les installations.
 */
export function fmtDuration(value) {
  const n = parseFloat(value);
  if (isNaN(n)) return null;
  const m = Math.round(n);
  if (m < 60) return m + ' min';
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? h + ' h ' + String(r).padStart(2, '0') : h + ' h';
}

export function fmtArea(value) {
  const n = parseFloat(value);
  return isNaN(n) ? null : Math.round(n) + ' m²';
}

/** Alarme : une seule entite du domaine, ou le choix de l'utilisateur. */
export function resolveAlarm({ caps, userCfg = {} } = {}) {
  const list = (caps && caps.devices && caps.devices.alarm_control_panel) || [];
  if (!list.length) return { available: false, reason: 'aucun panneau d alarme' };
  const chosen = userPick(userCfg, 'loggia_alarm');
  const main = (chosen && list.find(v => v.id === chosen)) || list[0];
  return { available: true, main: main.id, name: main.name, choices: list.map(v => ({ id: v.id, name: v.name })) };
}

/**
 * Cameras. On ecarte les flux secondaires du meme appareil : une camera qui
 * expose plusieurs resolutions apparaitrait sinon en double ou en triple.
 */
export function resolveCameras({ index, caps, states = {}, userCfg = {} } = {}) {
  const list = (caps && caps.devices && caps.devices.camera) || [];
  if (!list.length) return { available: false, reason: 'aucune camera', list: [] };

  // Une liste choisie par l'utilisateur ne decrit que les flux : le formulaire
  // demande un nom et une entite, pas quatre detecteurs. On la complete donc
  // par les binary_sensor du meme appareil, et on accepte les deux noms de
  // champ — `name` cote formulaire, `label` cote configuration heritee.
  const chosen = Array.isArray(userCfg.loggia_cameras) ? userCfg.loggia_cameras : null;
  if (chosen && chosen.length) {
    return {
      available: true,
      source: 'utilisateur',
      list: chosen.filter(c => c && c.haid).map(c => {
        const det = camDetections(index, states, c.haid);
        return {
          ...c,
          id: c.haid,
          name: c.name || c.label || c.haid,
          label: c.label || c.name || c.haid,
          motion: c.motion || det.motion,
          person: c.person || det.person,
          vehicle: c.vehicle || det.vehicle,
          sonnette: c.sonnette || det.sonnette,
          colis: c.colis || det.colis,
        };
      }),
    };
  }

  // Une camera publie souvent plusieurs flux — haute definition, basse
  // definition, cliche — qui decrivent un seul objectif au mur. On n'en presente
  // qu'un, et le choix n'est pas indifferent : sur l'installation d'essai, le
  // seul flux « haute definition » est hors service tandis que deux autres
  // enregistrent. Prendre le premier venu pouvait donc afficher une image morte.
  const parAppareil = new Map();
  list.forEach(c => {
    const meta = index && index.entityMeta.get(c.id);
    const key = (meta && meta.deviceId) || c.id;
    if (!parAppareil.has(key)) parAppareil.set(key, []);
    parAppareil.get(key).push(c);
  });

  const unique = [];
  parAppareil.forEach(flux => {
    let choisi = flux[0];
    if (flux.length > 1) {
      const pseudo = { entities: flux.map(f => f.id), domains: ['camera'] };
      const profil = mergedProfile(pseudo);
      const noms = new Map(flux.map(f => [f.id, f.name || f.id]));
      const retenu = profil && profil.merge
        ? primaryEntity(pseudo, profil.merge, { states, names: (id) => noms.get(id) })
        : null;
      choisi = flux.find(f => f.id === retenu) || choisi;
    }
    unique.push({
      id: choisi.id, name: choisi.name, area: choisi.area, available: choisi.available,
      // Les autres flux ne sont pas perdus : une vue de detail peut les proposer.
      streams: flux.map(f => f.id),
      ...camDetections(index, states, choisi.id),
    });
  });
  return { available: true, source: 'decouverte', list: unique };
}

/**
 * Detecteurs d'une camera : les binary_sensor du MEME appareil.
 *
 * La `device_class` tranche quand elle existe (`motion`, `occupancy`), sinon on
 * lit le nom — les integrations nomment ces capteurs dans leur langue, d'ou les
 * variantes. Un detecteur absent vaut null : la vue n'affiche simplement pas la
 * ligne correspondante.
 */
function camDetections(index, states, camId) {
  const pick = (opts) => pickSibling(index, states, camId, { domain: 'binary_sensor', ...opts });
  return {
    motion: pick({ deviceClass: 'motion' }) || pick({ deviceClass: 'occupancy' }) || pick({ match: /_(motion|mouvement)$/ }),
    person: pick({ match: /(person|personne|people)/ }),
    vehicle: pick({ match: /(vehicle|vehicule|voiture)/ }),
    sonnette: pick({ match: /(doorbell|sonnette|ring)/ }),
    colis: pick({ match: /(package|colis|parcel)/ }),
  };
}

/**
 * Lecteurs multimedia.
 *
 * Une meme enceinte est souvent exposee DEUX fois : par son integration
 * d'origine, et par celle qui la pilote (Music Assistant, Alexa…). Les deux
 * entites portent le meme `device_id`. On n'en presente donc qu'une, l'autre
 * devenant son « compagnon » — c'est lui qui porte en general les metadonnees
 * de lecture, quand l'entite native reste muette.
 *
 * Ce compagnon etait jusqu'ici designe par un suffixe ecrit en dur (`_2`).
 * Aucune convention ne le garantit : une mise a jour d'integration renomme les
 * entites et le lien casse en silence. L'appareil, lui, ne bouge pas.
 */
export function resolveMedia({ index, caps, states = {}, userCfg = {} } = {}) {
  const companion = (id) => pickSibling(index, states, id, { domain: 'media_player' });

  const chosen = Array.isArray(userCfg.loggia_medias) ? userCfg.loggia_medias : null;
  if (chosen && chosen.length) {
    // Un compagnon absent de la configuration est retrouve, pas invente.
    return { available: true, source: 'utilisateur', list: chosen.map(p => ({ ...p, ma: p.ma || companion(p.haid) })) };
  }

  const list = (caps && caps.devices && caps.devices.media_player) || [];
  if (!list.length) return { available: false, reason: 'aucun lecteur (domaine media_player)', list: [] };

  const seen = new Set();
  const out = [];
  list.forEach(p => {
    const meta = index && index.entityMeta.get(p.id);
    const key = (meta && meta.deviceId) || p.id;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ id: p.id, haid: p.id, name: p.name, area: p.areaName || null, ma: companion(p.id) });
  });
  return { available: true, source: 'decouverte', list: out };
}

/**
 * Presence. Le domaine `person` est cree par Home Assistant lui-meme des qu'un
 * compte existe : aucune configuration n'est necessaire.
 */
export function resolvePeople({ caps, states = {}, userCfg = {} } = {}) {
  // La photo d'un profil Home Assistant est publiee sur l'entite, en chemin
  // absolu (`/api/image/serve/...`). Meme origine que le dashboard : elle
  // s'affiche telle quelle, sans rien recopier ni reconfigurer.
  const pictureOf = (id) => {
    const a = (states[id] && states[id].attributes) || {};
    return a.entity_picture || null;
  };

  const chosen = Array.isArray(userCfg.loggia_people) ? userCfg.loggia_people : null;
  if (chosen && chosen.length) {
    return { available: true, source: 'utilisateur', list: chosen.map(p => ({ ...p, img: p.img || pictureOf(p.haid) })) };
  }

  const list = (caps && caps.devices && caps.devices.person) || [];
  if (!list.length) return { available: false, reason: 'aucune personne declaree', list: [] };
  return { available: true, source: 'decouverte', list: list.map(p => ({ haid: p.id, name: p.name, img: pictureOf(p.id) })) };
}

/** Volets : le domaine `cover` suffit ; un choix explicite reste prioritaire. */
export function resolveCovers({ caps, userCfg = {} } = {}) {
  const chosen = Array.isArray(userCfg.loggia_covers) ? userCfg.loggia_covers : null;
  if (chosen && chosen.length) return { available: true, source: 'utilisateur', list: chosen };
  const list = (caps && caps.devices && caps.devices.cover) || [];
  if (!list.length) return { available: false, reason: 'aucun volet', list: [] };
  return { available: true, source: 'decouverte', list: list.map(c => ({ id: c.id, name: c.name, area: c.area })) };
}

/** Capteur de temperature de la meme zone, quand l'appareil n'en expose pas. */
function areaTemp(index, states, entityId) {
  if (!index || !index.areaOf) return null;
  const a = index.areaOf(entityId);
  const ids = (a && index.byArea && index.byArea.get(a)) || [];
  return ids.find(id => {
    if (id.indexOf('sensor.') !== 0) return false;
    const at = (states[id] && states[id].attributes) || {};
    return at.device_class === 'temperature';
  }) || null;
}

/**
 * Chauffage. Deux familles coexistent : les thermostats du domaine `climate`,
 * pilotables tels quels, et les radiateurs fil pilote — un `switch` entoure
 * d'aides (consigne, mode, auto) que seule une configuration peut decrire.
 * Seule la premiere se decouvre ; la seconde reste au choix de l'utilisateur.
 */
export function resolveClimate({ index, caps, states = {}, userCfg = {} } = {}) {
  const chosen = Array.isArray(userCfg.loggia_climate) ? userCfg.loggia_climate : null;
  if (chosen && chosen.length) return { available: true, source: 'utilisateur', list: chosen };
  const list = (caps && caps.devices && caps.devices.climate) || [];
  if (!list.length) return { available: false, reason: 'aucun thermostat', list: [] };
  return {
    available: true, source: 'decouverte',
    list: list.map(c => ({
      // `room` porte un NOM : c'est ainsi que les vues rapprochent un appareil
      // d'une piece. Un area_id ne correspondrait a aucune piece configuree.
      id: c.id, haid: c.id, name: c.name, room: c.areaName || c.area || null, type: 'thermostat', hasAuto: false,
      tempSensor: pickSibling(index, states, c.id, { domain: 'sensor', deviceClass: 'temperature' })
        || areaTemp(index, states, c.id),
    })),
  };
}

/**
 * Energie.
 *
 * Source standard : les preferences du tableau de bord Energie natif. Elles
 * nomment le compteur, la production solaire et les appareils suivis — en kWh
 * cumules, puisque ce sont des statistiques. Pour les valeurs instantanees (W),
 * on cherche un capteur de puissance sur le MEME appareil.
 *
 * Ce que ces preferences ne donnent pas (tarif heures pleines/creuses, cout du
 * mois, taux d'autoconsommation) n'a pas d'equivalent standard : ces cases
 * restent nulles, et la vue masque simplement ce qu'elle n'a pas.
 */
export function resolveEnergy({ index, states = {}, energyPrefs = null, userCfg = {} } = {}) {
  /* `loggia_energyHaids` : le nom que l'ecran Parametres ecrit, et un objet de
   * la meme forme que celui attendu ici. On lisait `loggia_energy`, jamais
   * ecrit : la configuration de l'utilisateur ne prenait donc jamais le pas
   * sur le tableau de bord Energie natif, et son absence masquait la vue
   * entiere chez qui ne s'en sert pas. */
  const brut = (userCfg && (userCfg.loggia_energyHaids || userCfg.loggia_energy)) || null;
  const cfg = (brut && typeof brut === 'object' && Object.keys(brut).length) ? brut : null;
  if (cfg) return { available: true, source: 'utilisateur', haids: cfg, devices: [] };
  const src = (energyPrefs && Array.isArray(energyPrefs.energy_sources)) ? energyPrefs.energy_sources : null;
  if (!src) return { available: false, reason: 'tableau de bord Energie non configure', haids: {}, devices: [] };

  const grid = src.find(x => x && x.type === 'grid') || null;
  const from = (grid && Array.isArray(grid.flow_from) && grid.flow_from[0]) || null;
  const to = (grid && Array.isArray(grid.flow_to) && grid.flow_to[0]) || null;
  const solar = src.filter(x => x && x.type === 'solar').map(x => x.stat_energy_from).filter(Boolean);

  // Puissance instantanee : un capteur `power` du meme appareil que le compteur.
  const powerOf = (id) => id ? pickSibling(index, states, id, { domain: 'sensor', deviceClass: 'power' }) : null;
  const gridStat = from ? from.stat_energy_from : null;
  const solarStat = solar[0] || null;

  const devices = ((energyPrefs && energyPrefs.device_consumption) || [])
    .map(d => d && d.stat_consumption ? {
      name: d.name || (index && index.nameOf ? index.nameOf(d.stat_consumption) : d.stat_consumption),
      kwh: d.stat_consumption,
      power: powerOf(d.stat_consumption),
    } : null)
    .filter(Boolean);

  return {
    available: true,
    source: 'tableau de bord Energie',
    haids: {
      consoJour: gridStat,
      coutJour: (from && from.stat_cost) || null,
      injectionJour: to ? to.stat_energy_to : null,
      prodJour: solarStat,
      gridNow: powerOf(gridStat),
      solarNow: powerOf(solarStat),
    },
    devices,
  };
}

/**
 * Machines supervisees.
 *
 * Il n'existe pas de domaine « serveur » dans Home Assistant : une machine se
 * reconnait a ce qu'elle expose, un pourcentage de charge processeur. On part
 * donc de ces capteurs, on remonte a leur appareil, puis on ramasse le reste
 * (memoire, disque, temperature, uptime, disponibilite) parmi ses entites.
 *
 * Fonctionne avec System Monitor (integre a Home Assistant), Glances, Unraid,
 * UniFi ou tout autre integration qui publie ces capteurs.
 */
const CPU_RE = /(processor_use|utilisation_cpu|cpu_utilization|cpu_use|_cpu$|_cpu_)/;
const MEM_RE = /(memory_use_percent|utilisation_de_la_memoire|memory_utilization|_memoire|_memory)/;
const DISK_RE = /(disk_use_percent|utilisation_disque|utilisation_du_disque|storage_utilization|_disk|_disque)/;

export function resolveSystem({ index, states = {}, userCfg = {} } = {}) {
  const cfg = (userCfg && typeof userCfg.loggia_system === 'object' && userCfg.loggia_system) || null;
  if (cfg) return { available: true, source: 'utilisateur', hosts: [] , table: cfg };
  if (!index) return { available: false, reason: 'decouverte indisponible', hosts: [] };

  const pct = (id) => {
    const a = (states[id] && states[id].attributes) || {};
    return a.unit_of_measurement === '%';
  };
  const seen = new Set();
  const hosts = [];
  Object.keys(states).forEach(id => {
    if (id.indexOf('sensor.') !== 0 || !CPU_RE.test(id) || !pct(id)) return;
    const meta = index.entityMeta.get(id);
    const key = (meta && meta.deviceId) || id;
    if (seen.has(key)) return;
    seen.add(key);
    const sib = (opts) => pickSibling(index, states, id, opts);
    hosts.push({
      key,
      name: (meta && meta.device) || (index.nameOf ? index.nameOf(id) : id),
      cpu: id,
      memPct: sib({ domain: 'sensor', match: MEM_RE, unit: '%' }),
      disk: sib({ domain: 'sensor', match: DISK_RE, unit: '%' }),
      temp: sib({ domain: 'sensor', deviceClass: 'temperature' }),
      uptime: sib({ domain: 'sensor', deviceClass: 'timestamp' }),
      online: sib({ domain: 'binary_sensor', deviceClass: 'connectivity' }),
      clients: sib({ domain: 'sensor', match: /(client|clients)/ }),
    });
  });
  if (!hosts.length) return { available: false, reason: 'aucune machine supervisee', hosts: [] };
  hosts.sort((a, b) => String(a.name).localeCompare(String(b.name), 'fr'));
  return { available: true, source: 'decouverte', hosts };
}

/** Meteo : le domaine `weather` suffit. */
export function resolveWeather({ caps, userCfg = {} } = {}) {
  const list = (caps && caps.devices && caps.devices.weather) || [];
  if (!list.length) return { available: false, reason: 'aucune entite meteo' };
  /* `loggia_weather` : c'est le nom que l'ecran Parametres ecrit. On lisait
   * `loggia_weather_entity`, que personne n'ecrit nulle part — le choix de
   * l'utilisateur etait donc ignore et `list[0]` s'imposait, ce qui se voit
   * des qu'une installation declare deux entites meteo. L'ancien nom reste
   * accepte : une configuration ecrite a la main pourrait le porter. */
  const chosen = userPick(userCfg, 'loggia_weather') || userPick(userCfg, 'loggia_weather_entity');
  const main = (chosen && list.find(v => v.id === chosen)) || list[0];
  return { available: true, main: main.id, name: main.name, choices: list.map(v => ({ id: v.id, name: v.name })) };
}

/**
 * Pieces. Les zones Home Assistant sont la source, mais toutes ne sont pas des
 * pieces : une installation soignee comporte souvent des regroupements
 * techniques (reseau, energie, securite) avec des centaines d'entites.
 *
 * On ne devine pas, on classe. Une zone est proposee comme piece si elle
 * contient au moins un equipement d'ambiance ou un capteur de temperature. Le
 * reste est propose a part, et l'utilisateur tranche.
 */
const ROOM_DOMAINS = ['light', 'climate', 'cover', 'media_player', 'fan'];
export function resolveRooms({ index, states = {}, userCfg = {} } = {}) {
  const chosen = Array.isArray(userCfg.loggia_rooms) ? userCfg.loggia_rooms : null;
  const source = (chosen && chosen.length) ? 'utilisateur' : 'decouverte';
  // Les zones proposees sont calculees MEME quand des pieces sont deja
  // enregistrees : l'ecran de premier lancement doit pouvoir les cocher, et
  // c'est aussi par la qu'une configuration ancienne — ou les pieces ne sont
  // que des noms — retrouve ses capteurs d'ambiance.
  if (!index || !index.areaList.length) {
    return { source: (chosen && chosen.length) ? 'utilisateur' : 'aucune', rooms: chosen || [], suggested: [], technical: [] };
  }

  const suggested = [];
  const technical = [];
  index.areaList.forEach(a => {
    let ambiance = 0;
    // Capteurs d'ambiance de la zone : de quoi remplir la carte d'une piece
    // sans que personne ait a designer une entite a la main.
    let temp = null, hum = null, co2 = null;
    a.entities.forEach(id => {
      const d = id.slice(0, id.indexOf('.'));
      if (ROOM_DOMAINS.indexOf(d) >= 0) ambiance++;
      if (d !== 'sensor') return;
      const at = (states[id] && states[id].attributes) || {};
      if (!temp && at.device_class === 'temperature') temp = id;
      else if (!hum && at.device_class === 'humidity') hum = id;
      else if (!co2 && at.device_class === 'carbon_dioxide') co2 = id;
    });
    const entry = { id: a.id, name: a.name, entities: a.entities.length, ambiance, temp, hum, co2 };
    if (ambiance > 0 || temp) suggested.push(entry); else technical.push(entry);
  });
  return { source, rooms: chosen || [], suggested, technical };
}

/** Vue d'ensemble, pour verification. */
export function resolveAll(ctx) {
  return {
    vacuum: resolveVacuum(ctx),
    alarm: resolveAlarm(ctx),
    cameras: resolveCameras(ctx),
    people: resolvePeople(ctx),
    media: resolveMedia(ctx),
    covers: resolveCovers(ctx),
    climate: resolveClimate(ctx),
    energy: resolveEnergy(ctx),
    system: resolveSystem(ctx),
    weather: resolveWeather(ctx),
    rooms: resolveRooms(ctx),
  };
}

/** Resume lisible : loggiaResolve.report() */
export function report(r) {
  const L = [];
  L.push('Loggia · resolution sans entity_id en dur');
  L.push('');
  const v = r.vacuum;
  L.push('Aspirateur : ' + (v.available ? v.name + ' (' + v.main + ')' : 'aucun — vue masquee'));
  if (v.available) {
    L.push('  entites du meme appareil : ' + v.siblings);
    ['battery', 'map', 'area_cleaned', 'duration', 'status'].forEach(k => {
      L.push('  ' + k.padEnd(14) + (v[k] || '— non trouve'));
    });
    if (v.choices.length > 1) L.push('  autres appareils : ' + v.choices.slice(1).map(c => c.name).join(', '));
  }
  L.push('');
  L.push('Alarme : ' + (r.alarm.available ? r.alarm.name : 'aucune'));
  L.push('Meteo : ' + (r.weather.available ? r.weather.name : 'aucune'));
  L.push('Cameras (' + r.cameras.source + ') : ' + (r.cameras.list || []).length);
  (r.cameras.list || []).forEach(c => L.push('  ' + (c.name || c.id)));
  L.push('');
  const ro = r.rooms;
  L.push('Pieces — source : ' + ro.source);
  if (ro.source === 'decouverte') {
    L.push('  proposees comme pieces :');
    ro.suggested.forEach(a => L.push('    ' + a.name.padEnd(18) + a.ambiance + ' equipements' + (a.temp ? ' · temperature' : '')));
    L.push('  ecartees (aucun equipement d ambiance) :');
    ro.technical.forEach(a => L.push('    ' + a.name.padEnd(18) + a.entities + ' entites'));
  } else {
    L.push('  ' + ro.rooms.length + ' pieces configurees par l utilisateur');
  }
  return L.join('\n');
}
