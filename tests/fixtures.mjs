// Installations synthetiques.
//
// Chaque fabrique rend un objet de la forme que `buildIndex` attend :
//   { areas, devices, entities, floors, states, energyPrefs }
// c'est-a-dire ce que Home Assistant renvoie sur
// `config/{area,device,entity,floor}_registry/list` et `energy/get_prefs`.
//
// Les cas ne sont pas des variations decoratives : chacun reproduit une facon
// dont une vraie installation differe de celle du developpeur — zone posee sur
// l'appareil et non sur l'entite, plusieurs appareils du meme type, entites
// masquees, flux video en double, capteurs sans `device_class`.

import { buildIndex, capabilities } from '../src/discovery.js';

// ── Fabriques elementaires ───────────────────────────────────────────────────

export const area = (id, name, floor = null) => ({ area_id: id, name, floor_id: floor, icon: null });
// `meta` porte ce que les registres savent de l'appareil : fabricant, modele,
// integration. C'est ce qui distingue deux appareils d'un meme domaine.
export const device = (id, name, areaId = null, meta = {}) => ({
  id, name, name_by_user: null, area_id: areaId,
  manufacturer: null, model: null, sw_version: null,
  integration: null, via_device_id: null, entry_type: null,
  ...meta,
});

export const entity = (entity_id, opt = {}) => ({
  entity_id,
  device_id: opt.device || null,
  area_id: opt.area || null,
  entity_category: opt.category || null,
  hidden_by: opt.hidden ? 'user' : null,
  disabled_by: opt.disabled ? 'user' : null,
  name: opt.name || null,
  original_name: opt.original || null,
  // La plateforme et la clé de traduction (chantier Médias, tâche 2) : ce qui dit l'intégration d'une entité sans appareil, et la sœur « Annoncer » d'une Echo.
  platform: opt.platform || null,
  translation_key: opt.key || null,
});

export const state = (entity_id, st, attributes = {}) => [entity_id, { entity_id, state: String(st), attributes }];

/** Assemble un jeu d'etats a partir de paires produites par `state`. */
export const states = (...pairs) => Object.fromEntries(pairs);

const home = (o) => ({ areas: [], devices: [], entities: [], floors: [], states: {}, energyPrefs: null, ...o });

// ── Aides de mise en contexte ────────────────────────────────────────────────

export function indexOf(fx) {
  return buildIndex({ areas: fx.areas, devices: fx.devices, entities: fx.entities, floors: fx.floors, states: fx.states });
}

export function capsOf(fx, index = indexOf(fx)) {
  return capabilities({ states: fx.states, index });
}

/** Contexte complet, tel que `buildRuntime` le compose pour les resolveurs. */
export function ctxOf(fx, userCfg = {}) {
  const index = indexOf(fx);
  return { index, caps: capsOf(fx, index), states: fx.states, energyPrefs: fx.energyPrefs, userCfg };
}

// ── Installations ────────────────────────────────────────────────────────────

/** Home Assistant fraichement installe : aucune zone, aucun appareil. */
export const emptyHome = () => home({});

/**
 * Petite maison ordinaire : deux pieces meublees, une zone technique.
 * Les capteurs d'ambiance portent leur `device_class`, comme le font les
 * integrations serieuses.
 */
export const simpleHome = () => home({
  areas: [area('salon', 'Séjour'), area('chambre', 'Chambre'), area('reseau', 'Réseau')],
  devices: [device('d_lampe', 'Lampe salon', 'salon'), device('d_therm', 'Thermostat', 'chambre')],
  entities: [
    entity('light.salon', { device: 'd_lampe' }),
    entity('light.chambre', { area: 'chambre' }),
    entity('climate.chambre', { device: 'd_therm' }),
    entity('sensor.chambre_temperature', { device: 'd_therm' }),
    entity('sensor.salon_temperature', { area: 'salon' }),
    entity('sensor.salon_humidite', { area: 'salon' }),
    entity('cover.salon', { area: 'salon' }),
    entity('scene.soiree', {}),
    entity('binary_sensor.routeur', { area: 'reseau' }),
  ],
  states: states(
    state('light.salon', 'on', { friendly_name: 'Lampe salon', supported_color_modes: ['brightness'], brightness: 180 }),
    state('light.chambre', 'off', { friendly_name: 'Plafonnier chambre', supported_color_modes: ['onoff'] }),
    state('climate.chambre', 'heat', { friendly_name: 'Thermostat chambre' }),
    state('sensor.chambre_temperature', '19.4', { device_class: 'temperature', unit_of_measurement: '°C' }),
    state('sensor.salon_temperature', '21.2', { device_class: 'temperature', unit_of_measurement: '°C' }),
    state('sensor.salon_humidite', '47', { device_class: 'humidity', unit_of_measurement: '%' }),
    state('cover.salon', 'open', { friendly_name: 'Volet séjour', current_position: 100 }),
    state('scene.soiree', 'unknown', { friendly_name: 'Soirée' }),
    state('binary_sensor.routeur', 'on', { device_class: 'connectivity' }),
  ),
});

/**
 * Zone posee sur l'APPAREIL, pas sur l'entite. C'est le cas le plus courant :
 * on range un appareil dans une piece, et ses entites suivent.
 */
export const inheritedArea = () => home({
  areas: [area('cuisine', 'Cuisine')],
  devices: [device('d_multi', 'Capteur multi', 'cuisine')],
  entities: [
    entity('sensor.multi_temperature', { device: 'd_multi' }),
    entity('light.cuisine', { device: 'd_multi' }),
  ],
  states: states(
    state('sensor.multi_temperature', '22.0', { device_class: 'temperature', unit_of_measurement: '°C' }),
    state('light.cuisine', 'off', { supported_color_modes: ['onoff'] }),
  ),
});

/**
 * Trois aspirateurs. Chacun expose ses capteurs sur SON appareil : c'est ce qui
 * doit empecher la batterie du premier de se retrouver sur la fiche du second.
 */
export const threeVacuums = () => {
  const ents = [];
  const st = [];
  ['alpha', 'beta', 'gamma'].forEach((n, i) => {
    ents.push(entity(`vacuum.${n}`, { device: `d_${n}` }));
    ents.push(entity(`sensor.${n}_batterie`, { device: `d_${n}`, category: 'diagnostic' }));
    ents.push(entity(`sensor.${n}_surface`, { device: `d_${n}` }));
    ents.push(entity(`sensor.${n}_duree`, { device: `d_${n}` }));
    ents.push(entity(`image.${n}_carte`, { device: `d_${n}` }));
    st.push(state(`vacuum.${n}`, i === 0 ? 'cleaning' : 'docked', { friendly_name: n, battery_level: 90 - i * 10, fan_speed: 'medium', supported_features: 12345 }));
    st.push(state(`sensor.${n}_batterie`, String(90 - i * 10), { device_class: 'battery', unit_of_measurement: '%' }));
    st.push(state(`sensor.${n}_surface`, String(40 + i), { unit_of_measurement: 'm²' }));
    st.push(state(`sensor.${n}_duree`, String(55 + i), { unit_of_measurement: 'min' }));
    st.push(state(`image.${n}_carte`, '2026-08-22T10:00:00+00:00', {}));
  });
  return home({
    areas: [area('salon', 'Séjour')],
    devices: ['alpha', 'beta', 'gamma'].map((n, i) => device(`d_${n}`, n, i === 0 ? 'salon' : null)),
    entities: ents,
    states: states(...st),
  });
};

/** Entites masquees ou desactivees : presentes au registre, absentes des vues. */
export const hiddenDisabled = () => home({
  areas: [area('salon', 'Séjour')],
  devices: [device('d_lampe', 'Lampe', 'salon')],
  entities: [
    entity('light.visible', { device: 'd_lampe' }),
    entity('light.masquee', { device: 'd_lampe', hidden: true }),
    entity('light.desactivee', { device: 'd_lampe', disabled: true }),
    entity('sensor.diagnostic', { device: 'd_lampe', category: 'diagnostic' }),
  ],
  states: states(
    state('light.visible', 'on', { supported_color_modes: ['brightness'] }),
    state('light.masquee', 'on', { supported_color_modes: ['brightness'] }),
    state('light.desactivee', 'unavailable', {}),
    state('sensor.diagnostic', '3', {}),
  ),
});

/**
 * Installation electrique decrite par le tableau de bord Energie natif.
 * Les statistiques sont en kWh ; les puissances instantanees sont des entites
 * du meme appareil, retrouvees par `device_class: power`.
 */
export const energyHome = () => home({
  areas: [area('technique', 'Technique')],
  devices: [device('d_compteur', 'Compteur', 'technique'), device('d_pv', 'Onduleur', 'technique'), device('d_prise', 'Prise bureau', null)],
  entities: [
    entity('sensor.compteur_energie', { device: 'd_compteur' }),
    entity('sensor.compteur_puissance', { device: 'd_compteur' }),
    entity('sensor.compteur_injection', { device: 'd_compteur' }),
    entity('sensor.compteur_cout', { device: 'd_compteur' }),
    entity('sensor.pv_energie', { device: 'd_pv' }),
    entity('sensor.pv_puissance', { device: 'd_pv' }),
    entity('sensor.prise_energie', { device: 'd_prise' }),
    entity('sensor.prise_puissance', { device: 'd_prise' }),
  ],
  states: states(
    state('sensor.compteur_energie', '1234.5', { device_class: 'energy', unit_of_measurement: 'kWh' }),
    state('sensor.compteur_puissance', '820', { device_class: 'power', unit_of_measurement: 'W' }),
    state('sensor.compteur_injection', '12.0', { device_class: 'energy', unit_of_measurement: 'kWh' }),
    state('sensor.compteur_cout', '4.21', { device_class: 'monetary', unit_of_measurement: '€' }),
    state('sensor.pv_energie', '78.9', { device_class: 'energy', unit_of_measurement: 'kWh' }),
    state('sensor.pv_puissance', '1450', { device_class: 'power', unit_of_measurement: 'W' }),
    state('sensor.prise_energie', '3.4', { device_class: 'energy', unit_of_measurement: 'kWh' }),
    state('sensor.prise_puissance', '65', { device_class: 'power', unit_of_measurement: 'W' }),
  ),
  energyPrefs: {
    energy_sources: [
      {
        type: 'grid',
        flow_from: [{ stat_energy_from: 'sensor.compteur_energie', stat_cost: 'sensor.compteur_cout' }],
        flow_to: [{ stat_energy_to: 'sensor.compteur_injection' }],
      },
      { type: 'solar', stat_energy_from: 'sensor.pv_energie' },
    ],
    device_consumption: [{ stat_consumption: 'sensor.prise_energie', name: 'Prise bureau' }],
  },
});

/** Une machine supervisee, a la maniere de System Monitor ou de Glances. */
export const systemHome = () => home({
  areas: [],
  devices: [device('d_hote', 'Serveur maison', null)],
  entities: [
    entity('sensor.processor_use', { device: 'd_hote' }),
    entity('sensor.memory_use_percent', { device: 'd_hote' }),
    entity('sensor.disk_use_percent_data', { device: 'd_hote' }),
    entity('sensor.processor_temperature', { device: 'd_hote' }),
    entity('sensor.last_boot', { device: 'd_hote' }),
    entity('binary_sensor.hote_en_ligne', { device: 'd_hote' }),
  ],
  states: states(
    state('sensor.processor_use', '17', { unit_of_measurement: '%' }),
    state('sensor.memory_use_percent', '43', { unit_of_measurement: '%' }),
    state('sensor.disk_use_percent_data', '61', { unit_of_measurement: '%' }),
    state('sensor.processor_temperature', '48', { device_class: 'temperature', unit_of_measurement: '°C' }),
    state('sensor.last_boot', '2026-08-01T04:00:00+00:00', { device_class: 'timestamp' }),
    state('binary_sensor.hote_en_ligne', 'on', { device_class: 'connectivity' }),
  ),
});

/**
 * Une enceinte exposee DEUX fois : par l'integration d'origine et par celle qui
 * la pilote. Les deux entites portent le meme appareil — c'est le seul lien
 * fiable, un suffixe dans l'identifiant ne survit pas a un renommage.
 */
export const mediaHome = () => home({
  areas: [area('salon', 'Séjour'), area('bureau', 'Bureau')],
  devices: [device('d_echo', 'Echo Salon', 'salon'), device('d_ampli', 'Ampli bureau', 'bureau')],
  entities: [
    entity('media_player.echo_salon', { device: 'd_echo' }),
    entity('media_player.sejour_echo_salon', { device: 'd_echo' }),
    entity('media_player.ampli', { device: 'd_ampli' }),
  ],
  states: states(
    state('media_player.echo_salon', 'idle', { friendly_name: 'Echo Salon', volume_level: 0.4 }),
    state('media_player.sejour_echo_salon', 'playing', { friendly_name: 'Echo Salon (pilote)', media_title: 'Une chanson' }),
    state('media_player.ampli', 'off', { friendly_name: 'Ampli bureau' }),
  ),
});

/**
 * La maison des médias de sa maquette (chantier Médias, tâche 2 ; M1 B, M9, M10, M14) : ce que son registre montrait le 17/10,
 * aux noms de la démo. Une Echo exposée DEUX fois, par l'intégration officielle (« Alexa Devices », l'appareil `d_dot`,
 * la `notify` « Annoncer », les bits 5644 : ni lecture ni pause) et par `alexa_media_player` (HACS, un AUTRE appareil au
 * registre, `d_dot_hacs`, les bits 318399) — les deux identifiants finissent pareil, comme chez lui ; le groupe « Partout »,
 * officiel, avec sa `notify` ; une Apple TV (`apple_tv`, sa `remote.`) ; Spotify, un appareil de SERVICE ; le haut-parleur
 * d'une sonnette, sur l'appareil d'une caméra ; une Echo officielle seule, sans HACS.
 */
export const alexaHome = () => home({
  areas: [area('chambre_lino', 'Chambre de Lino'), area('salon', 'Séjour'), area('bureau', 'Bureau'), area('entree', 'Entrée')],
  devices: [
    device('d_dot', 'Echo Dot - Chambre Lino', 'chambre_lino', { manufacturer: 'Amazon', model: 'Echo Dot (3rd Gen)', integration: 'alexa_devices' }),
    device('d_dot_hacs', 'Echo Dot Chambre Lino', 'chambre_lino', { manufacturer: 'Amazon', model: 'Echo Dot', integration: 'alexa_media' }),
    // Le modèle qu'écrivent les deux intégrations pour un groupe d'enceintes, lu dans son registre : c'est à lui que le groupe se reconnaît.
    device('d_partout', 'Partout', null, { manufacturer: 'Amazon', model: 'Speaker Group', integration: 'alexa_devices' }),
    device('d_atv', 'Apple TV Salon', 'salon', { manufacturer: 'Apple', model: 'Apple TV 4K', integration: 'apple_tv' }),
    device('d_spotify', 'Spotify Démo', null, { manufacturer: 'Spotify AB', model: 'Spotify', integration: 'spotify', entry_type: 'service' }),
    device('d_sonnette', 'Sonnette entrée', 'entree', { manufacturer: 'Démo', model: 'G6 Entrée', integration: 'demo' }),
    device('d_bureau', 'Echo Dot - Bureau', 'bureau', { manufacturer: 'Amazon', model: 'Echo Dot (3rd Gen)', integration: 'alexa_devices' }),
  ],
  entities: [
    entity('media_player.chambre_lino_echo_dot', { device: 'd_dot', platform: 'alexa_devices' }),
    entity('notify.chambre_lino_echo_dot_annoncer', { device: 'd_dot', platform: 'alexa_devices', key: 'announce' }),
    entity('notify.chambre_lino_echo_dot_parler', { device: 'd_dot', platform: 'alexa_devices', key: 'speak' }),
    entity('sensor.chambre_lino_echo_dot_prochaine_alarme', { device: 'd_dot', platform: 'alexa_devices' }),
    entity('media_player.echo_dot_chambre_lino', { device: 'd_dot_hacs', platform: 'alexa_media' }),
    entity('media_player.partout', { device: 'd_partout', platform: 'alexa_devices' }),
    entity('notify.partout_annoncer', { device: 'd_partout', platform: 'alexa_devices', key: 'announce' }),
    entity('media_player.apple_tv_salon', { device: 'd_atv', platform: 'apple_tv' }),
    entity('remote.apple_tv_salon', { device: 'd_atv', platform: 'apple_tv' }),
    entity('media_player.spotify_demo', { device: 'd_spotify', platform: 'spotify' }),
    entity('camera.sonnette_entree', { device: 'd_sonnette', platform: 'demo' }),
    entity('media_player.sonnette_entree_haut_parleur', { device: 'd_sonnette', platform: 'demo' }),
    entity('media_player.bureau_echo_dot', { device: 'd_bureau', platform: 'alexa_devices' }),
  ],
  states: states(
    state('media_player.chambre_lino_echo_dot', 'playing', { friendly_name: 'Echo Dot - Chambre Lino', supported_features: 5644, volume_level: 0.3, device_class: 'speaker' }),
    state('notify.chambre_lino_echo_dot_annoncer', 'unknown', { friendly_name: 'Echo Dot - Chambre Lino Annoncer' }),
    state('notify.chambre_lino_echo_dot_parler', 'unknown', { friendly_name: 'Echo Dot - Chambre Lino Parler' }),
    state('sensor.chambre_lino_echo_dot_prochaine_alarme', 'unknown', { friendly_name: 'Echo Dot - Chambre Lino Prochaine alarme', device_class: 'timestamp' }),
    state('media_player.echo_dot_chambre_lino', 'playing', { friendly_name: 'Echo Dot Chambre Lino', supported_features: 318399, volume_level: 0.3, media_title: 'Clair de Lune', media_artist: 'Debussy', media_duration: 300, media_position: 91 }),
    state('media_player.partout', 'idle', { friendly_name: 'Partout', supported_features: 5644, volume_level: 0.4 }),
    state('notify.partout_annoncer', 'unknown', { friendly_name: 'Partout Annoncer' }),
    state('media_player.apple_tv_salon', 'off', { friendly_name: 'Apple TV Salon', supported_features: 450487, device_class: 'tv', source_list: ['Netflix', 'Arte'] }),
    state('remote.apple_tv_salon', 'off', { friendly_name: 'Apple TV Salon', supported_features: 0 }),
    state('media_player.spotify_demo', 'playing', { friendly_name: 'Spotify Démo', supported_features: 1572925, media_title: 'Clair de Lune', source_list: ['Echo Dot - Chambre Lino', 'Partout'] }),
    state('camera.sonnette_entree', 'idle', { friendly_name: 'Sonnette entrée' }),
    state('media_player.sonnette_entree_haut_parleur', 'idle', { friendly_name: 'Sonnette entrée Haut-parleur', supported_features: 136708, volume_level: 0.5 }),
    state('media_player.bureau_echo_dot', 'unavailable', { friendly_name: 'Echo Dot - Bureau', supported_features: 5644 }),
  ),
});

/**
 * Une seule camera physique, trois flux (haute, moyenne, basse resolution) —
 * ce que fait toute integration video serieuse. Elle doit apparaitre UNE fois.
 */
export const cameraHome = () => home({
  areas: [area('entree', 'Entrée')],
  devices: [device('d_cam', 'Caméra entrée', 'entree'), device('d_alarme', 'Centrale', null)],
  entities: [
    entity('camera.entree_high', { device: 'd_cam' }),
    entity('camera.entree_medium', { device: 'd_cam' }),
    entity('camera.entree_low', { device: 'd_cam' }),
    entity('binary_sensor.entree_motion', { device: 'd_cam' }),
    entity('binary_sensor.entree_personne_detectee', { device: 'd_cam' }),
    entity('binary_sensor.entree_sonnette', { device: 'd_cam' }),
    entity('alarm_control_panel.maison', { device: 'd_alarme' }),
    entity('person.alex', {}),
    entity('person.sam', {}),
  ],
  states: states(
    state('camera.entree_high', 'idle', { friendly_name: 'Caméra entrée' }),
    state('camera.entree_medium', 'idle', {}),
    state('camera.entree_low', 'idle', {}),
    state('binary_sensor.entree_motion', 'off', { device_class: 'motion' }),
    state('binary_sensor.entree_personne_detectee', 'off', {}),
    state('binary_sensor.entree_sonnette', 'off', {}),
    state('alarm_control_panel.maison', 'disarmed', { supported_features: 3 }),
    state('person.alex', 'home', { friendly_name: 'Alex' }),
    state('person.sam', 'not_home', { friendly_name: 'Sam' }),
  ),
});
