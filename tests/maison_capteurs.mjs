/* La maison des groupes et des plantes (chantier Capteurs, étapes 2 et 3) : ses registres, ses états, et ce que l'écran passe
 * aux règles (`ctxCapteurs`, App.jsx), lu dans son index. Partagée par les tests des groupes, des plantes et d'Objets. */
import { area, device, entity, state, states, indexOf } from './fixtures.mjs';

/* Une maison : au Séjour, deux portes sur leurs contacts (chacun avec son sabotage) et le mouvement d'une enceinte ; au
 * garage — une zone que Loggia ne compte pas —, deux portes ; dans la chambre, une fenêtre seule ; dehors, deux caméras
 * (leur mouvement, la sonnette en `occupancy`, l'écoute d'une alarme CO) ; à la cuisine, une fumée sur un appareil de
 * SERVICE, une fuite masquée, un CO désactivé, une porte de diagnostic ; sans appareil : une porte écrite à la main, deux
 * « Besoin eau » de modèle (`moisture`), MeteoAlarm ; une vigilance qui porte un appareil ; une vibration. */
export function maisonGroupes() {
  const bin = (id, dev, classe, opt = {}) => ({ ...entity(id, { device: dev, ...opt }), device_class: classe });
  const b = (id, v, nom, classe, extra = {}) => state(id, v, { friendly_name: nom, device_class: classe, ...extra });
  return {
    areas: [area('sejour', 'Séjour'), area('garage', 'Garage'), area('chambre', 'Chambre'), area('cuisine', 'Cuisine'), area('dehors', 'Caméras')],
    devices: [
      device('d_entree', 'Contact porte entrée', 'sejour'), device('d_baie', 'Contact baie vitrée', 'sejour'),
      device('d_enceinte', 'Enceinte séjour', 'sejour'), device('d_garage_av', 'Contact garage avant', 'garage'),
      device('d_garage_ar', 'Contact garage arrière', 'garage'), device('d_fenetre', 'Contact fenêtre chambre', 'chambre'),
      device('d_cam_porte', 'Caméra porte', 'dehors'), device('d_cam_jardin', 'Caméra jardin', 'dehors'),
      device('d_cuisine', 'Détecteurs cuisine', 'cuisine'), device('d_cloud', 'Alarme en ligne', null, { entry_type: 'service' }),
      device('d_vigilance', 'Vigilance', null), device('d_lave', 'Lave-linge', 'cuisine'),
    ],
    entities: [
      bin('binary_sensor.porte_entree', 'd_entree', 'door'), bin('binary_sensor.porte_entree_sabotage', 'd_entree', 'tamper'),
      bin('binary_sensor.baie_vitree', 'd_baie', 'door'), bin('binary_sensor.baie_vitree_sabotage', 'd_baie', 'tamper'),
      bin('binary_sensor.enceinte_mouvement', 'd_enceinte', 'motion'),
      bin('binary_sensor.garage_avant', 'd_garage_av', 'garage_door'), bin('binary_sensor.garage_arriere', 'd_garage_ar', 'garage_door'),
      bin('binary_sensor.fenetre_chambre', 'd_fenetre', 'window'),
      bin('binary_sensor.camera_porte_mouvement', 'd_cam_porte', 'motion'), bin('binary_sensor.camera_porte_sonnette', 'd_cam_porte', 'occupancy'),
      bin('binary_sensor.camera_porte_co', 'd_cam_porte', 'carbon_monoxide'), bin('binary_sensor.camera_jardin_mouvement', 'd_cam_jardin', 'motion'),
      bin('binary_sensor.camera_jardin_co', 'd_cam_jardin', 'carbon_monoxide'),
      bin('binary_sensor.fumee_en_ligne', 'd_cloud', 'smoke'), bin('binary_sensor.fuite_cuisine', 'd_cuisine', 'moisture', { hidden: true }),
      bin('binary_sensor.co_cuisine', 'd_cuisine', 'carbon_monoxide', { disabled: true }), bin('binary_sensor.porte_diagnostic', 'd_cuisine', 'door', { category: 'diagnostic' }),
      bin('binary_sensor.vigilance_appareil', 'd_vigilance', 'safety'), bin('binary_sensor.lave_linge_vibration', 'd_lave', 'vibration'),
      { ...entity('binary_sensor.porte_cave'), device_class: 'door' },
    ],
    floors: [],
    states: states(
      b('binary_sensor.porte_entree', 'off', 'Porte entrée', 'door'), b('binary_sensor.porte_entree_sabotage', 'off', 'Porte entrée sabotage', 'tamper'),
      b('binary_sensor.baie_vitree', 'on', 'Baie vitrée', 'door'), b('binary_sensor.baie_vitree_sabotage', 'off', 'Baie vitrée sabotage', 'tamper'),
      b('binary_sensor.enceinte_mouvement', 'off', 'Enceinte mouvement', 'motion'),
      b('binary_sensor.garage_avant', 'off', 'Garage avant', 'garage_door'), b('binary_sensor.garage_arriere', 'off', 'Garage arrière', 'garage_door'),
      b('binary_sensor.fenetre_chambre', 'off', 'Fenêtre chambre', 'window'),
      b('binary_sensor.camera_porte_mouvement', 'off', 'Caméra porte mouvement', 'motion'), b('binary_sensor.camera_porte_sonnette', 'off', 'Caméra porte sonnette', 'occupancy'),
      b('binary_sensor.camera_porte_co', 'off', 'Caméra porte alarme CO', 'carbon_monoxide'), b('binary_sensor.camera_jardin_mouvement', 'off', 'Caméra jardin mouvement', 'motion'),
      b('binary_sensor.camera_jardin_co', 'off', 'Caméra jardin alarme CO', 'carbon_monoxide'),
      b('binary_sensor.fumee_en_ligne', 'off', 'Fumée en ligne', 'smoke'), b('binary_sensor.fuite_cuisine', 'off', 'Fuite cuisine', 'moisture'),
      b('binary_sensor.co_cuisine', 'off', 'CO cuisine', 'carbon_monoxide'), b('binary_sensor.porte_diagnostic', 'off', 'Porte diagnostic', 'door'),
      b('binary_sensor.vigilance_appareil', 'off', 'Vigilance', 'safety', { awareness_level: '1; green; Minor' }),
      b('binary_sensor.lave_linge_vibration', 'off', 'Lave-linge vibration', 'vibration'),
      b('binary_sensor.porte_cave', 'off', 'Porte cave', 'door'),
      b('binary_sensor.ficus_besoin_eau', 'off', 'Ficus besoin eau', 'moisture'), b('binary_sensor.monstera_besoin_eau', 'on', 'Monstera besoin eau', 'moisture'),
      b('binary_sensor.meteoalarm', 'off', 'MeteoAlarm', 'safety', { attribution: 'Information provided by MeteoAlarm' }),
    ),
    energyPrefs: null,
  };
}

/** Ce que l'écran passe aux règles (`ctxCapteurs`, App.jsx), lu dans l'index de la maison ; `pieces` : les pièces de Loggia. */
export function ctxDe(fx, pieces) {
  const ix = indexOf(fx);
  return {
    meta: (id) => ix.entityMeta.get(id) || {},
    physique: (d) => { const x = ix.deviceMeta.get(d); return !!x && x.entryType !== 'service'; },
    soeurs: (id) => { const d = (ix.entityMeta.get(id) || {}).deviceId; return d ? [...ix.entityMeta.keys()].filter(e => e !== id && ix.entityMeta.get(e).deviceId === d) : []; },
    piece: (id) => { const z = ix.areaNameOf(id); return z && pieces.includes(z) ? z : ''; },
    appareil: (id) => (ix.entityMeta.get(id) || {}).device || null,
  };
}

/* Ses plantes : un Ficus dans la zone « Technique », qui n'est pas une pièce (son contact de sol, sa conductivité, sa lumière,
 * sa température, sa pile de diagnostic) ; un capteur que l'utilisateur a nommé « Monstera », au bureau ; une orchidée dont la
 * conductivité n'a que son unité ; une sonde de sol seule ; une sonde de sol sur un service ; une sonde masquée. */
export function maisonPlantes() {
  const cap = (id, dev, classe, opt = {}) => ({ ...entity(id, { device: dev, ...opt }), device_class: classe });
  const m = (id, v, nom, classe, unite) => state(id, v, { friendly_name: nom, ...(classe ? { device_class: classe } : {}), unit_of_measurement: unite });
  return {
    areas: [area('technique', 'Technique'), area('bureau', 'Bureau'), area('sejour', 'Séjour')],
    devices: [
      device('d_ficus', 'Ficus', 'technique', { manufacturer: 'Xiaomi', model: 'Flower care' }),
      device('d_monstera', 'Capteur plante 7F3E', 'bureau', { name_by_user: 'Monstera', manufacturer: 'Xiaomi', model: 'Flower care' }),
      device('d_orchidee', 'Orchidée', 'sejour'), device('d_potager', 'Sonde potager', 'sejour'),
      device('d_service', 'Arrosage en ligne', null, { entry_type: 'service' }), device('d_cachee', 'Sonde cachée', 'sejour'),
    ],
    entities: [
      cap('sensor.ficus_moisture', 'd_ficus', 'moisture'), cap('sensor.ficus_conductivity', 'd_ficus', 'conductivity'),
      cap('sensor.ficus_illuminance', 'd_ficus', 'illuminance'), cap('sensor.ficus_temperature', 'd_ficus', 'temperature'),
      cap('sensor.ficus_battery', 'd_ficus', 'battery', { category: 'diagnostic' }),
      cap('sensor.capteur_plante_7f3e_moisture', 'd_monstera', 'moisture'), cap('sensor.capteur_plante_7f3e_conductivity', 'd_monstera', 'conductivity'),
      cap('sensor.capteur_plante_7f3e_battery', 'd_monstera', 'battery', { category: 'diagnostic' }),
      cap('sensor.orchidee_sol', 'd_orchidee', 'moisture'), cap('sensor.orchidee_engrais', 'd_orchidee', null),
      cap('sensor.potager_sol', 'd_potager', 'moisture'),
      cap('sensor.arrosage_sol', 'd_service', 'moisture'), cap('sensor.arrosage_engrais', 'd_service', 'conductivity'),
      cap('sensor.cachee_sol', 'd_cachee', 'moisture', { hidden: true }), cap('sensor.cachee_engrais', 'd_cachee', 'conductivity'),
    ],
    floors: [],
    states: states(
      m('sensor.ficus_moisture', 28, 'Ficus humidité', 'moisture', '%'), m('sensor.ficus_conductivity', 784, 'Ficus conductivité', 'conductivity', 'µS/cm'),
      m('sensor.ficus_illuminance', 84, 'Ficus lumière', 'illuminance', 'lx'), m('sensor.ficus_temperature', 19.5, 'Ficus température', 'temperature', '°C'),
      m('sensor.ficus_battery', 100, 'Ficus pile', 'battery', '%'),
      m('sensor.capteur_plante_7f3e_moisture', 12, 'Capteur plante 7F3E humidité', 'moisture', '%'),
      m('sensor.capteur_plante_7f3e_conductivity', 410, 'Capteur plante 7F3E conductivité', 'conductivity', 'µS/cm'),
      m('sensor.capteur_plante_7f3e_battery', 4, 'Capteur plante 7F3E pile', 'battery', '%'),
      m('sensor.orchidee_sol', 40, 'Orchidée sol', 'moisture', '%'), m('sensor.orchidee_engrais', 900, 'Orchidée engrais', null, 'µS/cm'),
      m('sensor.potager_sol', 33, 'Potager sol', 'moisture', '%'),
      m('sensor.arrosage_sol', 50, 'Arrosage sol', 'moisture', '%'), m('sensor.arrosage_engrais', 500, 'Arrosage engrais', 'conductivity', 'µS/cm'),
      m('sensor.cachee_sol', 50, 'Cachée sol', 'moisture', '%'), m('sensor.cachee_engrais', 500, 'Cachée engrais', 'conductivity', 'µS/cm'),
      // Le soleil haut (audit du 19/10, M6 ; contre-relecture du lot 3) : la lumière d'une plante ne se juge qu'à 20° d'élévation au moins — sinon le Ficus ne presserait pas.
      state('sun.sun', 'above_horizon', { friendly_name: 'Soleil', elevation: 35 }),
    ),
    energyPrefs: null,
  };
}

/* Ses piles (chantier Capteurs, C32, § 8) : la porte d'entrée (9 %), la fenêtre de la chambre (12 %), un bouton du salon (14 %), le
 * détecteur de fumée de la cuisine (72 %) ; la télécommande muette ; une sonnette qui ne dit que « pile faible » (un binaire) ; la porte
 * porte aussi un binaire « pile faible », que sa pile chiffrée rend inutile. Écartés : un téléphone (mobile_app), l'aspirateur, la
 * tondeuse en charge et la batterie de la maison (le rôle batSoc d'Énergie, que l'écran exclut). */
export function maisonPiles() {
  const cap = (id, dev, classe, opt = {}, plus = {}) => ({ ...entity(id, { device: dev, ...opt }), device_class: classe, ...plus });
  const m = (id, v, nom, classe, unite) => state(id, v, { friendly_name: nom, ...(classe ? { device_class: classe } : {}), ...(unite ? { unit_of_measurement: unite } : {}) });
  return {
    areas: [area('entree', 'Entrée'), area('chambre', 'Chambre'), area('salon', 'Salon'), area('cuisine', 'Cuisine')],
    devices: [
      device('d_porte', 'Contact porte entrée', 'entree'), device('d_fenetre', 'Contact fenêtre chambre', 'chambre'), device('d_bouton', 'Bouton salon', 'salon'),
      device('d_fumee', 'Détecteur de fumée cuisine', 'cuisine'), device('d_telecommande', 'Télécommande', 'salon'), device('d_sonnette', 'Sonnette', 'entree'),
      device('d_telephone', 'Téléphone', null), device('d_aspirateur', 'Aspirateur', null), device('d_tondeuse', 'Tondeuse', null), device('d_batterie', 'Batterie maison', null),
    ],
    entities: [
      cap('binary_sensor.porte_entree', 'd_porte', 'door'), cap('sensor.porte_entree_pile', 'd_porte', 'battery', { category: 'diagnostic' }), cap('binary_sensor.porte_entree_pile_faible', 'd_porte', 'battery'),
      cap('binary_sensor.fenetre_chambre', 'd_fenetre', 'window'), cap('sensor.fenetre_chambre_pile', 'd_fenetre', 'battery', { category: 'diagnostic' }),
      cap('sensor.bouton_salon_pile', 'd_bouton', 'battery', { category: 'diagnostic' }),
      cap('binary_sensor.fumee_cuisine', 'd_fumee', 'smoke'), cap('sensor.fumee_cuisine_pile', 'd_fumee', 'battery', { category: 'diagnostic' }),
      cap('sensor.telecommande_pile', 'd_telecommande', 'battery', { category: 'diagnostic' }),
      cap('binary_sensor.sonnette_pile_faible', 'd_sonnette', 'battery'),
      cap('sensor.telephone_pile', 'd_telephone', 'battery', {}, { platform: 'mobile_app' }),
      cap('vacuum.aspirateur', 'd_aspirateur', null), cap('sensor.aspirateur_pile', 'd_aspirateur', 'battery'),
      cap('lawn_mower.tondeuse', 'd_tondeuse', null), cap('sensor.tondeuse_pile', 'd_tondeuse', 'battery'), cap('binary_sensor.tondeuse_en_charge', 'd_tondeuse', 'battery_charging'),
      cap('sensor.batterie_niveau', 'd_batterie', 'battery'),
    ],
    floors: [],
    states: states(
      m('binary_sensor.porte_entree', 'off', 'Porte entrée', 'door'), m('sensor.porte_entree_pile', 9, 'Porte entrée pile', 'battery', '%'), m('binary_sensor.porte_entree_pile_faible', 'on', 'Porte entrée pile faible', 'battery'),
      m('binary_sensor.fenetre_chambre', 'on', 'Fenêtre chambre', 'window'), m('sensor.fenetre_chambre_pile', 12, 'Fenêtre chambre pile', 'battery', '%'),
      m('sensor.bouton_salon_pile', 14, 'Bouton salon pile', 'battery', '%'),
      m('binary_sensor.fumee_cuisine', 'off', 'Fumée cuisine', 'smoke'), m('sensor.fumee_cuisine_pile', 72, 'Fumée cuisine pile', 'battery', '%'),
      m('sensor.telecommande_pile', 'unavailable', 'Télécommande pile', 'battery', '%'),
      m('binary_sensor.sonnette_pile_faible', 'on', 'Sonnette pile faible', 'battery'),
      m('sensor.telephone_pile', 40, 'Téléphone pile', 'battery', '%'),
      m('vacuum.aspirateur', 'docked', 'Aspirateur', null), m('sensor.aspirateur_pile', 92, 'Aspirateur pile', 'battery', '%'),
      m('lawn_mower.tondeuse', 'docked', 'Tondeuse', null), m('sensor.tondeuse_pile', 64, 'Tondeuse pile', 'battery', '%'), m('binary_sensor.tondeuse_en_charge', 'on', 'Tondeuse en charge', 'battery_charging'),
      m('sensor.batterie_niveau', 78, 'Batterie niveau', 'battery', '%'),
    ),
    energyPrefs: null,
  };
}

/** Deux maisons en une : leurs zones (sans doublon), leurs appareils, leurs entités et leurs états. */
export function fusion(...maisons) {
  const zones = new Map();
  maisons.forEach(m => m.areas.forEach(a => zones.set(a.area_id, a)));
  return {
    areas: [...zones.values()], devices: maisons.flatMap(m => m.devices), entities: maisons.flatMap(m => m.entities), floors: [],
    states: Object.assign({}, ...maisons.map(m => m.states)), energyPrefs: null,
  };
}
