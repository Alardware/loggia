/**
 * Ce qu'une entité sait faire — d'après elle, pas d'après son nom.
 *
 * Le dashboard supposait les capacités à partir du domaine : un `cover` a une
 * position, un `light` a une couleur. C'est faux une fois sur deux. Home
 * Assistant publie la réponse exacte, entité par entité, dans trois attributs
 * que personne ne lisait :
 *
 *   `supported_features`      un masque de bits, dont la signification dépend
 *                             du domaine — le bit 4 vaut SET_POSITION pour un
 *                             volet et VOLUME_SET pour un lecteur.
 *   `supported_color_modes`   les lampes n'y mettent PAS la couleur ni la
 *                             luminosité ; elles ont leur propre liste. Une
 *                             lampe à 44 (effet, flash, transition) peut très
 *                             bien être une lampe de couleur.
 *   les attributs présents    ce que l'entité RAPPORTE, qui ne coïncide pas
 *                             avec ce qu'elle accepte.
 *
 * Les services, eux, appartiennent au DOMAINE, pas à l'entité : `cover` publie
 * `set_cover_tilt_position` même quand aucun volet de la maison n'a d'
 * inclinaison. Ils servent donc de garde-fou (le domaine est-il chargé ?) et de
 * seule source pour les domaines sans masque — un bouton, un script, un
 * interrupteur n'ont pas de `supported_features`.
 *
 * Aucun identifiant d'entité, aucune marque, aucun modèle n'est écrit ici. Les
 * seules constantes sont celles que Home Assistant publie dans sa
 * documentation, et elles valent pour toute installation.
 */

const domaineDe = (id) => (typeof id === 'string' ? id.slice(0, id.indexOf('.')) : '');

/** Une entité absente ou muette ne prouve rien sur ce qu'elle sait faire. */
const repond = (st) => !!(st && st.state != null && st.state !== 'unavailable' && st.state !== 'unknown');

// ─────────────────────────────────────────────────────────────────────────────
// Les masques de bits, par domaine.
//
// Ces valeurs viennent des `*EntityFeature` de Home Assistant. Elles sont
// publiques et ne changent pas : un bit retiré casserait toutes les
// intégrations, donc Home Assistant les déprécie sans jamais les réattribuer.
// ─────────────────────────────────────────────────────────────────────────────

const BITS = {
  cover: {
    1: 'open', 2: 'close', 4: 'set_position', 8: 'stop',
    16: 'open_tilt', 32: 'close_tilt', 64: 'stop_tilt', 128: 'set_tilt_position',
  },
  climate: {
    1: 'set_temperature', 2: 'set_temperature_range', 4: 'set_humidity',
    8: 'set_fan_mode', 16: 'set_preset_mode', 32: 'set_swing_mode',
    64: 'set_aux_heat', 128: 'turn_off', 256: 'turn_on',
    512: 'set_swing_horizontal_mode',
  },
  light: {
    // La couleur et la luminosité ne sont PAS ici : voir `supported_color_modes`.
    1: 'set_effect_legacy', 2: 'set_color_legacy', 4: 'set_effect',
    8: 'flash', 32: 'transition',
  },
  media_player: {
    1: 'pause', 2: 'seek', 4: 'set_volume', 8: 'mute',
    16: 'previous_track', 32: 'next_track', 128: 'turn_on', 256: 'turn_off',
    512: 'play_media', 1024: 'step_volume', 2048: 'select_source', 4096: 'stop',
    8192: 'clear_playlist', 16384: 'play', 32768: 'set_shuffle',
    65536: 'select_sound_mode', 131072: 'browse_media', 262144: 'set_repeat',
    524288: 'group', 1048576: 'announce', 2097152: 'enqueue',
  },
  vacuum: {
    1: 'turn_on', 2: 'turn_off', 4: 'pause', 8: 'stop', 16: 'return_home',
    32: 'set_fan_speed', 64: 'battery', 128: 'status', 256: 'send_command',
    512: 'locate', 1024: 'clean_spot', 2048: 'map', 4096: 'state', 8192: 'start',
  },
  lawn_mower: { 1: 'start_mowing', 2: 'pause', 4: 'dock' },
  fan: {
    1: 'set_speed', 2: 'oscillate', 4: 'set_direction',
    8: 'set_preset_mode', 16: 'turn_off', 32: 'turn_on',
  },
  humidifier: { 1: 'set_mode' },
  water_heater: {
    1: 'set_temperature', 2: 'set_operation_mode', 4: 'set_away_mode',
    8: 'turn_on', 16: 'turn_off',
  },
  alarm_control_panel: {
    1: 'arm_home', 2: 'arm_away', 4: 'arm_night', 8: 'trigger',
    16: 'arm_custom_bypass', 32: 'arm_vacation',
  },
  lock: { 1: 'open' },
  camera: { 1: 'on_off', 2: 'stream' },
  weather: { 1: 'forecast_daily', 2: 'forecast_hourly', 4: 'forecast_twice_daily' },
  remote: { 1: 'learn_command', 2: 'delete_command', 4: 'activity' },
  siren: { 1: 'turn_on', 2: 'turn_off', 4: 'set_tone', 8: 'set_volume', 16: 'set_duration' },
  valve: { 1: 'open', 2: 'close', 4: 'set_position', 8: 'stop' },
  update: {
    1: 'install', 2: 'install_specific_version', 4: 'progress',
    8: 'backup', 16: 'release_notes',
  },
  todo: {
    1: 'create_item', 2: 'delete_item', 4: 'update_item',
    8: 'move_item', 16: 'set_due_date', 32: 'set_due_datetime', 64: 'set_description',
  },
  notify: { 1: 'title' },
};

// ─────────────────────────────────────────────────────────────────────────────
// Les domaines sans masque.
//
// Un interrupteur, un bouton, un script n'ont pas de `supported_features` : ce
// qu'ils acceptent tient au domaine seul. La liste est courte parce qu'elle ne
// couvre QUE ces cas — partout ailleurs, c'est l'entité qui répond.
// ─────────────────────────────────────────────────────────────────────────────

const SANS_MASQUE = {
  switch: ['turn_on', 'turn_off', 'toggle'],
  input_boolean: ['turn_on', 'turn_off', 'toggle'],
  automation: ['turn_on', 'turn_off', 'toggle', 'trigger'],
  script: ['turn_on', 'turn_off'],
  scene: ['turn_on'],
  button: ['press'],
  input_button: ['press'],
  number: ['set_value'],
  input_number: ['set_value'],
  select: ['select_option'],
  input_select: ['select_option'],
  text: ['set_value'],
  input_text: ['set_value'],
  input_datetime: ['set_datetime'],
  timer: ['start', 'pause', 'cancel', 'finish'],
};

// ─────────────────────────────────────────────────────────────────────────────
// Ce que l'entité rapporte.
//
// Un attribut présent et non nul est une lecture disponible. On ne devine pas :
// une clim qui ne publie pas `current_humidity` ne mesure pas l'humidité, et
// afficher un tiret à sa place vaut mieux que d'inventer une valeur.
// ─────────────────────────────────────────────────────────────────────────────

const LECTURES = {
  current_temperature: 'temperature',
  current_humidity: 'humidity',
  temperature: 'temperature',
  humidity: 'humidity',
  battery_level: 'battery',
  current_position: 'position',
  current_tilt_position: 'tilt',
  brightness: 'brightness',
  color_temp_kelvin: 'color_temp',
  rgb_color: 'color',
  percentage: 'speed',
  volume_level: 'volume',
  media_title: 'media',
  fan_speed: 'fan_speed',
};

/** Les listes d'options qu'une entité publie : modes, sources, préréglages. */
const LISTES = {
  hvac_modes: 'modes',
  preset_modes: 'presets',
  fan_modes: 'fan_modes',
  swing_modes: 'swing_modes',
  effect_list: 'effects',
  source_list: 'sources',
  sound_mode_list: 'sound_modes',
  options: 'options',
  operation_list: 'operations',
  fan_speed_list: 'fan_speeds',
  available_tones: 'tones',
};

/**
 * Les capacités que `supported_color_modes` ajoute à une lampe.
 *
 * Home Assistant ne met ni la couleur ni la luminosité dans le masque : une
 * lampe qui accepte `xy` accepte la couleur, une lampe `brightness` se tamise.
 * C'est la seule façon de le savoir, et elle vaut pour toutes les lampes.
 */
const MODES_COULEUR = {
  onoff: [],
  brightness: ['set_brightness'],
  color_temp: ['set_brightness', 'set_color_temp'],
  hs: ['set_brightness', 'set_color'],
  xy: ['set_brightness', 'set_color'],
  rgb: ['set_brightness', 'set_color'],
  rgbw: ['set_brightness', 'set_color'],
  rgbww: ['set_brightness', 'set_color', 'set_color_temp'],
  white: ['set_brightness'],
};

/** Les domaines dont allumer et éteindre ne passent pas par le masque. */
const ALLUMABLES = new Set(['light', 'switch', 'fan', 'siren', 'humidifier',
  'input_boolean', 'automation', 'media_player']);

/**
 * Ce qui n'est pas du pilotage.
 *
 * Installer une mise à jour est une capacité réelle, mais ce n'est pas
 * commander la maison. Sur une installation ordinaire, les entités `update`
 * sont les plus nombreuses de toutes — un dépôt HACS en crée une chacun — et
 * elles noieraient n'importe quel classement des appareils par capacité.
 */
const MAINTENANCE = new Set(['install', 'install_specific_version', 'progress',
  'release_notes', 'backup']);

/** Les bits mis dans un masque, traduits par la table de son domaine. */
function bitsDe(masque, table) {
  const out = [];
  if (!table || typeof masque !== 'number' || masque <= 0) return out;
  Object.keys(table).forEach(bit => {
    // eslint-disable-next-line no-bitwise
    if (masque & Number(bit)) out.push(table[bit]);
  });
  return out;
}

/**
 * Ce qu'une entité sait faire, telle qu'elle le déclare.
 *
 * @param {string} entityId
 * @param {object} st        l'état, `hass.states[entityId]`
 * @param {object} services  `index.services`, facultatif : sert de garde-fou
 * @returns {object} { id, domain, can, reads, options, features, available }
 */
export function entityCaps(entityId, st, services = null) {
  const domain = domaineDe(entityId);
  const attrs = (st && st.attributes) || {};
  const can = new Set();
  const reads = new Set();
  const options = {};

  const masque = typeof attrs.supported_features === 'number' ? attrs.supported_features : null;
  bitsDe(masque, BITS[domain]).forEach(c => can.add(c));
  (SANS_MASQUE[domain] || []).forEach(c => can.add(c));

  if (ALLUMABLES.has(domain)) { can.add('turn_on'); can.add('turn_off'); can.add('toggle'); }
  if (domain === 'cover' || domain === 'valve') can.add('toggle');
  if (domain === 'lock') { can.add('lock'); can.add('unlock'); }
  // Changer de mode n'a pas de bit : `climate.set_hvac_mode` vaut pour toute
  // entité du domaine, et c'est la liste `hvac_modes` qui dit lesquels.
  if (domain === 'climate') can.add('set_hvac_mode');
  // Basculer lecture/pause suppose de savoir faire l'un OU l'autre : le service
  // `media_play_pause` n'a pas de bit propre, il s'appuie sur ceux-la.
  if (domain === 'media_player' && (can.has('pause') || can.has('play'))) can.add('play_pause');
  // Monter et baisser le volume par crans : un seul bit, deux services.
  if (can.has('step_volume')) { can.add('volume_up'); can.add('volume_down'); }

  if (domain === 'light') {
    const modes = Array.isArray(attrs.supported_color_modes) ? attrs.supported_color_modes : [];
    modes.forEach(m => (MODES_COULEUR[m] || []).forEach(c => can.add(c)));
    if (modes.length) options.color_modes = modes.slice();
  }

  Object.keys(LECTURES).forEach(a => {
    if (attrs[a] !== undefined && attrs[a] !== null) reads.add(LECTURES[a]);
  });
  Object.keys(LISTES).forEach(a => {
    if (Array.isArray(attrs[a]) && attrs[a].length) options[LISTES[a]] = attrs[a].slice();
  });

  // Un capteur ne fait rien, mais il rapporte : sa `device_class` dit quoi.
  if ((domain === 'sensor' || domain === 'binary_sensor') && attrs.device_class) {
    reads.add(String(attrs.device_class));
  }

  // Garde-fou : si le domaine n'est pas chargé, rien n'est commandable. Une
  // entité restée dans le registre après le retrait de son intégration en est
  // le cas courant — elle a des attributs, mais plus personne pour obéir.
  if (services && !services[domain]) can.clear();

  return { id: entityId, domain, can, reads, options, features: masque, available: repond(st) };
}

/**
 * Les capacités d'un appareil : l'union de celles de ses entités, sans perdre
 * qui fait quoi.
 *
 * Un thermostat porte sa consigne sur son entité `climate` et sa batterie sur
 * un `sensor` : demander « cet appareil rapporte-t-il sa batterie » ne doit pas
 * obliger l'appelant à parcourir les cinq entités lui-même. `byEntity` garde le
 * détail pour qui en a besoin.
 */
export function deviceCaps(device, states = {}, services = null, meta = null) {
  const can = new Set();
  const reads = new Set();
  const controls = new Set();
  const byEntity = new Map();
  const vide = { can, reads, controls, byEntity, domains: [], controllable: false };
  if (!device || !Array.isArray(device.entities)) return vide;

  device.entities.forEach(id => {
    const c = entityCaps(id, states[id], services);
    byEntity.set(id, c);
    c.can.forEach(x => can.add(x));
    c.reads.forEach(x => reads.add(x));
    // Ce qui compte comme pilotage : ni maintenance, ni entité de réglage ou de
    // diagnostic. Une case « activer les logs de debug » est commandable, mais
    // elle n'a rien à faire sur la carte d'un appareil.
    const m = meta && meta.get ? meta.get(id) : null;
    if (m && (m.category === 'config' || m.category === 'diagnostic')) return;
    c.can.forEach(x => { if (!MAINTENANCE.has(x)) controls.add(x); });
  });
  return {
    can, reads, controls, byEntity,
    domains: (device.domains || []).slice(),
    controllable: controls.size > 0,
  };
}

/**
 * Inventaire des capacités d'une installation : qui sait faire quoi, et
 * combien. Sert à décider ce qu'une vue peut proposer sans l'essayer.
 */
export function capsSummary(devices, states = {}, services = null, meta = null) {
  const parCapacite = new Map();
  const parDomaine = new Map();
  let pilotables = 0;
  devices.forEach(d => {
    const c = deviceCaps(d, states, services, meta);
    if (c.controllable) pilotables += 1;
    c.controls.forEach(x => parCapacite.set(x, (parCapacite.get(x) || 0) + 1));
    c.byEntity.forEach(e => {
      if (!e.can.size && !e.reads.size) return;
      const n = parDomaine.get(e.domain) || { entities: 0, can: new Set(), reads: new Set() };
      n.entities += 1;
      e.can.forEach(x => n.can.add(x));
      e.reads.forEach(x => n.reads.add(x));
      parDomaine.set(e.domain, n);
    });
  });
  return { parCapacite, parDomaine, devices: devices.size || devices.length || 0, pilotables };
}
