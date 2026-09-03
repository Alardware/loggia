/**
 * Mode démonstration : une maison qui n'existe pas, jouable.
 *
 * `index.html?demo` — la page directe, pas le panneau — monte le dashboard sur
 * cette maison : personne à espionner, rien à installer, et l'on peut TOUT
 * essayer, y compris les vues d'administration. C'est aussi le banc d'essai
 * des branches que l'installation réelle n'exerce pas : la 2.8.0 est morte
 * dans une branche que seul un compte administrateur atteignait.
 *
 * Trois principes :
 *
 * 1. AUCUNE trace. `localStorage` est remplacé par un magasin en mémoire,
 *    préchargé avec la configuration de la maison : la vraie configuration du
 *    navigateur n'est ni lue ni écrite, et tout s'évapore à la fermeture.
 * 2. VIVANTE. `callService` mute les états factices ; le poll du dashboard
 *    voit la nouvelle signature et redessine. Une lampe basculée bascule.
 * 3. HONNÊTE. Un badge « Démonstration » reste à l'écran. Ce qui exige un
 *    serveur (websocket, journal, templates) est simplement absent, comme sur
 *    une installation qui n'a pas ces moyens.
 *
 * L'ancien `scripts/demo.js` (injection DevTools pour les captures du README)
 * est remplacé par ce module.
 */

const maintenant = () => new Date().toISOString();
const s = (state, attributes = {}) => ({ state: String(state), attributes, last_updated: maintenant(), last_changed: maintenant() });

const PIECES = [
  ['salon', 'Salon', 21.4, 47, 612],
  ['cuisine', 'Cuisine', 22.8, 51, null],
  ['chambre', 'Chambre', 19.6, 49, 704],
  ['bureau', 'Bureau', 20.9, 45, 538],
  ['entree', 'Entrée', 20.1, 46, null],
  ['salle_de_bain', 'Salle de bain', 23.2, 58, null],
];

function etatsInitiaux() {
  const states = {
    'sun.sun': (() => {
      const lever = new Date(); lever.setHours(7, 12, 0, 0);
      const coucher = new Date(); coucher.setHours(20, 28, 0, 0);
      if (coucher < new Date()) coucher.setDate(coucher.getDate() + 1);
      if (lever < new Date()) lever.setDate(lever.getDate() + 1);
      return s('above_horizon', { friendly_name: 'Soleil', elevation: 34, next_rising: lever.toISOString(), next_setting: coucher.toISOString() });
    })(),
    'weather.maison': s('partlycloudy', { friendly_name: 'Météo', temperature: 24, humidity: 52, temperature_unit: '°C',
      apparent_temperature: 26, wind_speed: 9, wind_gust_speed: 20, wind_bearing: 281, wind_speed_unit: 'km/h',
      pressure: 1014, uv_index: 3, visibility: 12 }),
    'alarm_control_panel.maison': s('disarmed', { friendly_name: 'Alarme' }),
    'sensor.production_solaire': s(1840, { friendly_name: 'Production solaire', unit_of_measurement: 'W', device_class: 'power' }),
    'sensor.reseau': s(-460, { friendly_name: 'Réseau', unit_of_measurement: 'W', device_class: 'power' }),
    'sensor.surplus': s(460, { friendly_name: 'Surplus', unit_of_measurement: 'W', device_class: 'power' }),
    // Les kWh du jour : sans eux, pas de bilan ni de cadran d'autosuffisance.
    'sensor.conso_jour': s(6.16, { friendly_name: 'Consommation du jour', unit_of_measurement: 'kWh', device_class: 'energy' }),
    'sensor.production_jour': s(4.32, { friendly_name: 'Production du jour', unit_of_measurement: 'kWh', device_class: 'energy' }),
    'sensor.injection_jour': s(0.96, { friendly_name: 'Injection du jour', unit_of_measurement: 'kWh', device_class: 'energy' }),
    'sensor.conso_jour_hc': s(3.90, { friendly_name: 'Consommation heures creuses', unit_of_measurement: 'kWh', device_class: 'energy' }),
    'sensor.conso_jour_hp': s(2.26, { friendly_name: 'Consommation heures pleines', unit_of_measurement: 'kWh', device_class: 'energy' }),
    'sensor.part_fossile_reseau': s(38, { friendly_name: 'Part fossile du réseau', unit_of_measurement: '%' }),
    // De quoi remplir les cartes de la vue Meteo : indice d'air et vigilance.
    'sensor.qualite_air_exterieur': s(62, { friendly_name: "Qualité de l'air", device_class: 'aqi' }),
    'sensor.vigilance_meteo': s('Jaune', { friendly_name: 'Vigilance météo', vent_violent: 'Jaune', orages: 'Jaune' }),
    'person.camille': s('home', { friendly_name: 'Camille' }),
    'person.alex': s('not_home', { friendly_name: 'Alex' }),
    'media_player.salon': s('playing', { friendly_name: 'Enceinte salon', media_title: 'Clair de Lune', media_artist: 'Debussy', volume_level: .35, supported_features: 20925, entity_picture: 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2096%2096%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%234c1d95%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%230ea5e9%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%2296%22%20height%3D%2296%22%20fill%3D%22url(%23g)%22%2F%3E%3Ccircle%20cx%3D%2248%22%20cy%3D%2248%22%20r%3D%2226%22%20fill%3D%22%23111827%22%2F%3E%3Ccircle%20cx%3D%2248%22%20cy%3D%2248%22%20r%3D%225%22%20fill%3D%22%23f4f4f5%22%2F%3E%3C%2Fsvg%3E' }),
    'vacuum.aspirateur': s('docked', { friendly_name: 'Aspirateur', battery_level: 100 }),
    'binary_sensor.porte_entree': s('off', { friendly_name: "Porte d'entrée", device_class: 'door' }),
    'binary_sensor.fenetre_chambre': s('off', { friendly_name: 'Fenêtre chambre', device_class: 'window' }),
    'binary_sensor.fenetre_salon': s('off', { friendly_name: 'Fenêtre salon', device_class: 'window' }),
    'switch.radiateur_chambre': s('on', { friendly_name: 'Radiateur chambre' }),
    'switch.radiateur_salon': s('on', { friendly_name: 'Radiateur salon' }),
    'binary_sensor.detecteur_fumee': s('off', { friendly_name: 'Détecteur de fumée cuisine', device_class: 'smoke' }),
    'climate.salon': s('heat', { friendly_name: 'Thermostat salon', current_temperature: 21.4, temperature: 22, hvac_action: 'heating', hvac_modes: ['off', 'heat'], min_temp: 7, max_temp: 30, target_temp_step: .5 }),
    'climate.chambre': s('off', { friendly_name: 'Thermostat chambre', current_temperature: 19.6, temperature: 19, hvac_action: 'off', hvac_modes: ['off', 'heat'], min_temp: 7, max_temp: 30, target_temp_step: .5 }),
    'cover.volet_salon': s('open', { friendly_name: 'Volet salon', current_position: 100, supported_features: 15 }),
    'cover.volet_cuisine': s('open', { friendly_name: 'Volet cuisine', current_position: 60, supported_features: 15 }),
    'cover.volet_chambre': s('closed', { friendly_name: 'Volet chambre', current_position: 0, supported_features: 15 }),
    'scene.reveil': s('unknown', { friendly_name: 'Réveil' }),
    'scene.je_rentre': s('unknown', { friendly_name: 'Je rentre' }),
    'scene.cinema': s('unknown', { friendly_name: 'Cinéma' }),
    'scene.nuit': s('unknown', { friendly_name: 'Nuit' }),
  };
  PIECES.forEach(([cle, nom, t, h, co2]) => {
    states['sensor.' + cle + '_temperature'] = s(t, { friendly_name: nom + ' température', unit_of_measurement: '°C', device_class: 'temperature' });
    states['sensor.' + cle + '_humidite'] = s(h, { friendly_name: nom + ' humidité', unit_of_measurement: '%', device_class: 'humidity' });
    if (co2 != null) states['sensor.' + cle + '_co2'] = s(co2, { friendly_name: nom + ' CO2', unit_of_measurement: 'ppm', device_class: 'carbon_dioxide' });
    /* Le salon a une lampe de COULEUR, les autres non : c'est ce qui permet
     * de voir que Loggia ne propose une teinte que la ou elle existe. */
    states['light.' + cle] = s(cle === 'salon' || cle === 'cuisine' ? 'on' : 'off', cle === 'salon'
      ? { friendly_name: 'Plafonnier ' + nom, brightness: 180, rgb_color: [255, 176, 92], color_temp_kelvin: 2900,
          min_color_temp_kelvin: 2000, max_color_temp_kelvin: 6535, supported_color_modes: ['color_temp', 'rgb'] }
      : { friendly_name: 'Plafonnier ' + nom, brightness: 180, supported_color_modes: ['brightness'] });
  });
  return states;
}

/* La configuration de la maison, servie par le magasin mémoire : le dashboard
 * la lit comme s'il lisait le localStorage. */
function configDemo() {
  return {
    loggia_rooms: PIECES.map(([cle, nom, , , co2]) => ({
      room: nom,
      haid: { temp: 'sensor.' + cle + '_temperature', humidity: 'sensor.' + cle + '_humidite', co2: co2 != null ? 'sensor.' + cle + '_co2' : null },
    })),
    // `loggia_energyHaids` est la cle que lisent `enHaids()` ET la disponibilite
    // des vues : sans elle, la vue Energie restait masquee en demonstration.
    loggia_energyHaids: { solarOutput: 'sensor.production_solaire', consoNow: 'sensor.reseau', surplusNow: 'sensor.surplus', consoJour: 'sensor.conso_jour', prodJour: 'sensor.production_jour', injectionJour: 'sensor.injection_jour', consoJourHc: 'sensor.conso_jour_hc', consoJourHp: 'sensor.conso_jour_hp' },
    loggia_entities: {
      weather: ['weather.maison', 'sun.sun'],
      alarm: 'alarm_control_panel.maison',
      cameras: [],
      people: [{ name: 'Camille', haid: 'person.camille' }, { name: 'Alex', haid: 'person.alex' }],
      energy: { solarOutput: 'sensor.production_solaire', consoNow: 'sensor.reseau', surplusNow: 'sensor.surplus', consoJour: 'sensor.conso_jour', prodJour: 'sensor.production_jour', injectionJour: 'sensor.injection_jour', consoJourHc: 'sensor.conso_jour_hc', consoJourHp: 'sensor.conso_jour_hp' },
    },
    // Deux profils : la demo doit exercer les DEUX branches, admin comprise.
    loggia_users: [{ name: 'Démo', role: 'Admin', c: 'var(--o-accent)' }, { name: 'Invité', role: 'Famille', c: 'var(--o-purple)' }],
    loggia_quickscenes: [
      { name: 'Réveil', sub: 'Volets, café', icon: 'mug-hot', haid: 'scene.reveil' },
      { name: 'Je rentre', sub: 'Lumières + chauffage', icon: 'home', haid: 'scene.je_rentre' },
      { name: 'Cinéma', sub: 'TV, volets', icon: 'film', haid: 'scene.cinema' },
      { name: 'Nuit', sub: 'Tout éteint, alarme', icon: 'moon', haid: 'scene.nuit' },
    ],
    loggia_onboarded: 1,
  };
}

/* Un agenda pour la carte de l'accueil : demain, et les jours d'après. */
/* Historique factice, au format de l'API REST de Home Assistant.
 *
 * Sans lui, toutes les courbes de la démo affichaient « historique
 * indisponible » : la démo montrait un dashboard sans mémoire. On fabrique
 * donc 24 h de points autour de la valeur ACTUELLE du capteur — une marche
 * lente, plus une bosse de journée pour ce qui suit le soleil, et rien
 * d'inventé pour un capteur qui n'existe pas.
 */
function historiqueDemo(chemin, states) {
  const m = String(chemin).match(/filter_entity_id=([^&]+)/);
  const id = m ? decodeURIComponent(m[1]) : null;
  const cur = id && states[id] ? parseFloat(states[id].state) : NaN;
  if (!id || isNaN(cur)) return [];
  const d = String(chemin).match(/history\/period\/([^?]+)/);
  const t0 = d ? Date.parse(decodeURIComponent(d[1])) : Date.now() - 86400000;
  const t1 = Date.now();
  const solaire = /solaire|solar|production/i.test(id);
  // Un compteur d'ÉNERGIE ne redescend pas : il monte jusqu'à sa valeur du
  // moment. Une puissance, elle, va et vient. Les deux courbes n'ont donc pas
  // la même forme, et le graphe de consommation lit bien des différences.
  const attrs = (states[id] && states[id].attributes) || {};
  const cumul = attrs.device_class === 'energy' || /kwh/i.test(attrs.unit_of_measurement || '');
  const pas = (t1 - t0) / 48;
  const pts = [];
  let acc = 0;
  const parts = [];
  for (let i = 0; i <= 48; i++) {
    const heure = new Date(t0 + pas * i).getHours() + new Date(t0 + pas * i).getMinutes() / 60;
    const jour = Math.max(0, Math.sin((heure - 6) / 12 * Math.PI));
    parts.push(solaire ? jour * (0.6 + 0.5 * Math.abs(Math.sin(i))) : (0.5 + 0.5 * Math.abs(Math.sin(i / 3.7))));
  }
  const somme = parts.reduce((a, v) => a + v, 0) || 1;
  for (let i = 0; i <= 48; i++) {
    const t = t0 + pas * i;
    let v;
    if (cumul) { acc += cur * parts[i] / somme; v = acc; }
    else {
      const heure = new Date(t).getHours() + new Date(t).getMinutes() / 60;
      const jour = Math.max(0, Math.sin((heure - 6) / 12 * Math.PI));
      v = solaire ? cur * jour * (0.8 + 0.4 * Math.sin(i)) : cur * (0.7 + 0.6 * Math.sin(i / 3.7) + 0.15 * Math.sin(i));
    }
    pts.push({ state: String(Math.round(v * 100) / 100), last_changed: new Date(t).toISOString() });
  }
  return [pts];
}

/* Prévisions factices, au format du service `weather.get_forecasts` : une
 * journée qui se réchauffe puis retombe, et une semaine qui alterne. */
function previsionsDemo(type) {
  const CONDS = ['partlycloudy', 'sunny', 'cloudy', 'rainy', 'partlycloudy', 'sunny', 'cloudy'];
  const out = [];
  if (type === 'daily') {
    for (let i = 0; i < 7; i++) {
      const d = new Date(); d.setDate(d.getDate() + i); d.setHours(12, 0, 0, 0);
      out.push({ datetime: d.toISOString(), condition: CONDS[i % CONDS.length],
        temperature: 26 - Math.round(Math.abs(Math.sin(i)) * 7), templow: 13 + Math.round(Math.cos(i) * 3),
        precipitation: i === 3 ? 4.2 : 0, precipitation_probability: i === 3 ? 70 : 10 });
    }
    return out;
  }
  for (let i = 1; i <= 12; i++) {
    const d = new Date(Date.now() + i * 3600000);
    const h = d.getHours();
    out.push({ datetime: d.toISOString(), condition: h >= 20 || h <= 6 ? 'clear-night' : CONDS[i % CONDS.length],
      temperature: Math.round(19.5 + 6.5 * Math.sin((h - 10) / 24 * 2 * Math.PI)),
      precipitation: 0, precipitation_probability: 5 * (i % 4) });
  }
  return out;
}

/* Interrupteurs sans fil : deux telecommandes, l'une deja reglee, l'autre a
 * decouvrir. Les noms de boutons sont ceux que zigbee2mqtt donne vraiment a un
 * variateur Hue et a un bouton IKEA — la demonstration ne doit pas apprendre
 * un vocabulaire qui n'existe pas. */
const INTER_AFF = {
  'z2m/Variateur Salon': {
    nom: 'Variateur Salon',
    source: 'z2m',
    actions: {
      on_press_release: [{ service: 'homeassistant.turn_on', data: { entity_id: 'light.salon' } }],
      off_press_release: [{ service: 'homeassistant.turn_off', data: { entity_id: 'light.salon' } }],
      up_press_release: [{ service: 'light.turn_on', data: { brightness_step_pct: 10, entity_id: 'light.salon' } }],
    },
  },
};
const INTER_DEPART = Date.now() / 1000;

function interDemo() {
  return {
    appareils: [
      {
        cle: 'z2m/Variateur Salon', source: 'z2m', nom: 'Variateur Salon',
        affectees: ['off_press_release', 'on_press_release', 'up_press_release'],
        vues: ['down_press_release', 'off_press_release', 'on_press_release', 'up_press_release'],
      },
      {
        cle: 'z2m/Bouton Cuisine', source: 'z2m', nom: 'Bouton Cuisine',
        affectees: [], vues: ['on', 'off', 'brightness_move_up'],
      },
    ],
    sources: { mqtt_present: true, z2m: true, zha: false, deconz: false },
    affectations: INTER_AFF,
    journal: [
      { cle: 'z2m/Bouton Cuisine', source: 'z2m', nom: 'Bouton Cuisine', action: 'on', ts: INTER_DEPART - 4 },
      { cle: 'z2m/Variateur Salon', source: 'z2m', nom: 'Variateur Salon', action: 'up_press_release', ts: INTER_DEPART - 26 },
      { cle: 'z2m/Variateur Salon', source: 'z2m', nom: 'Variateur Salon', action: 'on_press_release', ts: INTER_DEPART - 71 },
    ],
  };
}

function interAffecter(msg) {
  const enr = INTER_AFF[msg.cle] || { nom: msg.nom || msg.cle, source: 'z2m', actions: {} };
  if (msg.gestes && msg.gestes.length) enr.actions[msg.action] = msg.gestes;
  else delete enr.actions[msg.action];
  if (Object.keys(enr.actions).length) INTER_AFF[msg.cle] = enr;
  else delete INTER_AFF[msg.cle];
  return INTER_AFF;
}

/* Regles de volets : le planning arme, la protection solaire reglee sur deux
 * facades, le vent au repos. De quoi voir la page telle qu'elle sera une fois
 * remplie, plutot qu'un formulaire vide. */
const VOL_CFG = {
  planning: { actif: true, mode: 'auto', ouverture: { decalage: 15 }, fermeture: { decalage: -20 }, jours: [0, 1, 2, 3, 4, 5, 6], volets: { 'cover.chambre': { ouverture: 90, fermeture: null } } },
  soleil: {
    actif: true, position: 30, elevation_min: 15, temp_min: 25,
    temp_entite: 'sensor.exterieur_temperature',
    volets: { 'cover.salon': { orientation: 225, ouverture: 90 } },
  },
  vent: { actif: false, entite: '', seuil: 50 },
};

function voletsDemo(states) {
  const sun = states['sun.sun'];
  const at = (sun && sun.attributes) || {};
  return {
    config: VOL_CFG,
    soleil: { azimut: at.azimuth != null ? at.azimuth : 214, elevation: at.elevation != null ? at.elevation : 34 },
    abaisses: VOL_CFG.soleil.actif ? ['cover.salon'] : [],
    a_l_abri: false,
    journal: [
      { quoi: 'proteger', regle: 'soleil', n: 1, detail: 'cover.salon', ts: Date.now() / 1000 - 900 },
      { quoi: 'ouvrir', regle: 'planning', n: 6, detail: '', ts: Date.now() / 1000 - 27000 },
    ],
  };
}

function voletsPatch(patch) {
  Object.keys(patch || {}).forEach(section => {
    if (VOL_CFG[section]) Object.assign(VOL_CFG[section], patch[section]);
  });
  return VOL_CFG;
}

/* Fenetre ouverte, chauffage coupe : la regle armee sur une piece, pour que la
 * page se montre remplie plutot que vide. */
const FEN_CFG = {
  actif: true, delai: 3, reprise: 0,
  pieces: { Chambre: { actif: true, ouvrants: ['binary_sensor.fenetre_chambre'], chauffages: ['switch.radiateur_chambre'] } },
};

function fenetresDemo() {
  return {
    config: FEN_CFG,
    coupes: {},
    en_attente: [],
    journal: [{ quoi: 'rendre', piece: 'Chambre', entites: ['switch.radiateur_chambre'], ts: Date.now() / 1000 - 5400 }],
  };
}

function fenetresPatch(patch) {
  Object.keys(patch || {}).forEach(k => {
    if (k === 'pieces') {
      Object.keys(patch.pieces || {}).forEach(nom => {
        if (patch.pieces[nom] === null) delete FEN_CFG.pieces[nom];
        else FEN_CFG.pieces[nom] = { ...(FEN_CFG.pieces[nom] || {}), ...patch.pieces[nom] };
      });
    } else FEN_CFG[k] = patch[k];
  });
  return FEN_CFG;
}

/* Les registres, tels que le composant les enverrait : des zones, et les
 * entites qui y sont rangees. Le dashboard croise ensuite avec les etats. */
function indexDemo(states) {
  const ZONES = [
    ['salon', 'Salon'], ['cuisine', 'Cuisine'], ['chambre', 'Chambre'],
    ['bureau', 'Bureau'], ['entree', 'Entrée'], ['sdb', 'Salle de bain'],
  ];
  const ZONE_DE = {
    salon: ['light.salon', 'sensor.salon_temperature', 'sensor.salon_humidite', 'cover.salon',
            'binary_sensor.fenetre_salon', 'switch.radiateur_salon', 'media_player.enceinte_salon'],
    cuisine: ['light.cuisine', 'sensor.cuisine_temperature', 'sensor.cuisine_humidite', 'cover.cuisine'],
    chambre: ['light.chambre', 'sensor.chambre_temperature', 'sensor.chambre_humidite', 'cover.chambre',
              'binary_sensor.fenetre_chambre', 'switch.radiateur_chambre'],
    bureau: ['light.bureau', 'sensor.bureau_temperature', 'sensor.bureau_humidite'],
    entree: ['light.entree', 'sensor.entree_temperature', 'binary_sensor.porte_entree'],
    sdb: ['light.sdb', 'sensor.sdb_temperature'],
  };
  const entities = [];
  Object.keys(ZONE_DE).forEach(zone => {
    ZONE_DE[zone].forEach(id => {
      if (!states[id]) return;
      const at = states[id].attributes || {};
      entities.push({ id, name: at.friendly_name || id, device: null, area: zone,
        platform: 'demo', category: null, device_class: at.device_class || null,
        unit: at.unit_of_measurement || null, hidden: false });
    });
  });
  return {
    version: 1,
    areas: ZONES.map(([id, name]) => ({ id, name, floor: null, icon: null })),
    devices: [],
    entities,
    floors: [],
    services: {},
    component_version: null,
  };
}

function calendrierDemo() {
  const j = (n) => { const d = new Date(Date.now() + n * 864e5); return d.toISOString().slice(0, 10); };
  const h = (n, hh) => { const d = new Date(Date.now() + n * 864e5); d.setHours(hh, 0, 0, 0); return d.toISOString(); };
  return [
    { summary: 'Ramassage des poubelles', start: { date: j(1) }, end: { date: j(2) } },
    { summary: 'Café avec Sam', start: { dateTime: h(2, 10) }, end: { dateTime: h(2, 11) } },
    { summary: 'Contrôle chaudière', start: { dateTime: h(4, 14) }, end: { dateTime: h(4, 15) } },
  ];
}

export function installerDemo() {
  // ── 1. Magasin mémoire à la place du localStorage ─────────────────────────
  const mem = new Map();
  const cfg = configDemo();
  Object.keys(cfg).forEach(k => mem.set(k, JSON.stringify(cfg[k])));
  const faux = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { mem.set(String(k), String(v)); },
    removeItem: (k) => { mem.delete(k); },
    clear: () => { mem.clear(); },
    key: (i) => Array.from(mem.keys())[i] || null,
    get length() { return mem.size; },
  };
  try { Object.defineProperty(window, 'localStorage', { value: faux, configurable: true }); } catch (e) { /* repli : la demo ecrira le vrai stockage */ }

  // ── 2. La maison ──────────────────────────────────────────────────────────
  const states = etatsInitiaux();
  const toucher = (id, patch, attrs) => {
    // entity_id à la manière de HA : une chaîne ou un tableau d'ids.
    if (Array.isArray(id)) { id.forEach(x => toucher(x, patch, attrs)); return; }
    const cur = states[id]; if (!cur) return;
    states[id] = { state: patch != null ? String(patch) : cur.state, attributes: { ...cur.attributes, ...(attrs || {}) }, last_updated: maintenant(), last_changed: maintenant() };
    el.hass = { ...el.hass, states };
  };
  const callService = (domaine, service, data) => {
    const id = data && data.entity_id;
    if (domaine === 'homeassistant' || domaine === 'light' || domaine === 'switch' || domaine === 'fan') {
      if (service === 'turn_on') toucher(id, 'on');
      else if (service === 'turn_off') toucher(id, 'off');
      else if (service === 'toggle') toucher(id, states[id] && states[id].state === 'on' ? 'off' : 'on');
    } else if (domaine === 'cover') {
      if (service === 'open_cover') toucher(id, 'open', { current_position: 100 });
      else if (service === 'close_cover') toucher(id, 'closed', { current_position: 0 });
      else if (service === 'set_cover_position') toucher(id, (data.position || 0) > 0 ? 'open' : 'closed', { current_position: data.position || 0 });
    } else if (domaine === 'climate') {
      if (service === 'set_temperature') toucher(id, null, { temperature: data.temperature });
      else if (service === 'set_hvac_mode') toucher(id, data.hvac_mode, { hvac_action: data.hvac_mode === 'off' ? 'off' : 'heating' });
    } else if (domaine === 'alarm_control_panel') {
      // Un vrai panneau laisse le temps de sortir : la démo passe par `arming`
      // avec le délai et le mode visé (les attributs d'Alarmo), puis arme.
      const cible = { alarm_disarm: 'disarmed', alarm_arm_home: 'armed_home', alarm_arm_night: 'armed_night', alarm_arm_vacation: 'armed_vacation' }[service] || 'armed_away';
      const cid = id || 'alarm_control_panel.maison';
      if (cible === 'disarmed') { toucher(cid, 'disarmed'); return Promise.resolve(); }
      const delay = 20;
      toucher(cid, 'arming', { delay, arm_mode: cible });
      setTimeout(() => { const s = states[cid]; if (s && s.state === 'arming' && s.attributes.arm_mode === cible) toucher(cid, cible); }, delay * 1000);
    } else if (domaine === 'media_player' && service === 'media_play_pause') {
      toucher(id, states[id] && states[id].state === 'playing' ? 'paused' : 'playing');
    }
    return Promise.resolve();
  };

  const el = document.createElement('home-assistant');
  el.hass = {
    states,
    connected: true,
    language: 'fr',
    user: { id: 'demo', name: 'Démo', is_admin: true },
    /* Le websocket n'existe pas ici — sauf pour les PRÉVISIONS météo, que la
     * vue Météo demande par service. Sans elles, sa bannière n'aurait ni
     * heures ni semaine, et la démonstration montrerait une vue à moitié
     * vide qui ne ressemble à rien de réel. */
    callWS: (msg) => {
      if (msg && msg.type === 'call_service' && msg.domain === 'weather' && msg.service === 'get_forecasts') {
        const type = (msg.service_data && msg.service_data.type) || 'hourly';
        return Promise.resolve({ response: { 'weather.maison': { forecast: previsionsDemo(type) } } });
      }
      /* Meme raison que les previsions : sans reponse ici, la section
       * Interrupteurs ne montrerait qu'un message d'erreur, alors qu'elle est
       * justement ce qu'il y a a voir. Un variateur Hue et un bouton IKEA,
       * l'un regle et l'autre pas. */
      if (msg && msg.type === 'loggia/interrupteurs/etat') return Promise.resolve(interDemo());
      if (msg && msg.type === 'loggia/interrupteurs/affecter') {
        return Promise.resolve({ affectations: interAffecter(msg) });
      }
      if (msg && msg.type === 'loggia/volets/etat') return Promise.resolve(voletsDemo(states));
      if (msg && msg.type === 'loggia/volets/config') {
        return Promise.resolve({ config: voletsPatch(msg.patch) });
      }
      if (msg && msg.type === 'loggia/fenetres/etat') return Promise.resolve(fenetresDemo());
      if (msg && msg.type === 'loggia/fenetres/config') {
        return Promise.resolve({ config: fenetresPatch(msg.patch) });
      }
      /* Sans zones, aucune regle par piece n'est proposable : c'est la zone
       * qui dit quel radiateur est dans la meme piece que quelle fenetre. */
      if (msg && msg.type === 'loggia/discovery') return Promise.resolve({ index: indexDemo(states) });
      return Promise.reject(new Error('démonstration : pas de composant serveur'));
    },
    callService,
    callApi: (methode, chemin) => {
      if (methode === 'GET' && String(chemin).indexOf('calendars/') === 0) return Promise.resolve(calendrierDemo());
      if (methode === 'GET' && String(chemin).indexOf('history/period/') === 0) return Promise.resolve(historiqueDemo(String(chemin), states));
      return Promise.resolve({});
    },
    auth: { data: { access_token: null } },
  };
  document.documentElement.appendChild(el);

  // Un calendrier dans les états, pour que la carte Agenda se montre.
  states['calendar.maison'] = s('off', { friendly_name: 'Calendrier maison' });

  // ── 3. Le badge ───────────────────────────────────────────────────────────
  const badge = document.createElement('div');
  badge.textContent = 'Démonstration — données factices';
  badge.style.cssText = 'position:fixed;left:50%;bottom:10px;transform:translateX(-50%);z-index:99999;padding:6px 14px;border-radius:999px;background:rgba(77,163,255,.16);border:1px solid rgba(77,163,255,.4);color:#8fc2ff;font:700 11.5px/1.4 system-ui,sans-serif;pointer-events:none;';
  document.documentElement.appendChild(badge);
}
