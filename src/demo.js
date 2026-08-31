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
    'sun.sun': s('above_horizon', { friendly_name: 'Soleil', elevation: 34 }),
    'weather.maison': s('partlycloudy', { friendly_name: 'Météo', temperature: 24, humidity: 52, temperature_unit: '°C' }),
    'alarm_control_panel.maison': s('disarmed', { friendly_name: 'Alarme' }),
    'sensor.production_solaire': s(1840, { friendly_name: 'Production solaire', unit_of_measurement: 'W', device_class: 'power' }),
    'sensor.reseau': s(-460, { friendly_name: 'Réseau', unit_of_measurement: 'W', device_class: 'power' }),
    'sensor.surplus': s(460, { friendly_name: 'Surplus', unit_of_measurement: 'W', device_class: 'power' }),
    'person.camille': s('home', { friendly_name: 'Camille' }),
    'person.alex': s('not_home', { friendly_name: 'Alex' }),
    'media_player.salon': s('playing', { friendly_name: 'Enceinte salon', media_title: 'Clair de Lune', media_artist: 'Debussy', volume_level: .35, supported_features: 20925, entity_picture: 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2096%2096%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%234c1d95%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%230ea5e9%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%2296%22%20height%3D%2296%22%20fill%3D%22url(%23g)%22%2F%3E%3Ccircle%20cx%3D%2248%22%20cy%3D%2248%22%20r%3D%2226%22%20fill%3D%22%23111827%22%2F%3E%3Ccircle%20cx%3D%2248%22%20cy%3D%2248%22%20r%3D%225%22%20fill%3D%22%23f4f4f5%22%2F%3E%3C%2Fsvg%3E' }),
    'vacuum.aspirateur': s('docked', { friendly_name: 'Aspirateur', battery_level: 100 }),
    'binary_sensor.porte_entree': s('off', { friendly_name: "Porte d'entrée", device_class: 'door' }),
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
    states['light.' + cle] = s(cle === 'salon' || cle === 'cuisine' ? 'on' : 'off', { friendly_name: 'Plafonnier ' + nom, brightness: 180, supported_color_modes: ['brightness'] });
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
    loggia_entities: {
      weather: ['weather.maison', 'sun.sun'],
      alarm: 'alarm_control_panel.maison',
      cameras: [],
      people: [{ name: 'Camille', haid: 'person.camille' }, { name: 'Alex', haid: 'person.alex' }],
      energy: { solarOutput: 'sensor.production_solaire', consoNow: 'sensor.reseau', surplusNow: 'sensor.surplus' },
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
      toucher(id || 'alarm_control_panel.maison', service === 'alarm_disarm' ? 'disarmed' : service === 'alarm_arm_home' ? 'armed_home' : 'armed_away');
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
    callWS: () => Promise.reject(new Error('démonstration : pas de composant serveur')),
    callService,
    callApi: (methode, chemin) => {
      if (methode === 'GET' && String(chemin).indexOf('calendars/') === 0) return Promise.resolve(calendrierDemo());
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
