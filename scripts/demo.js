/**
 * Maison de demonstration, pour les captures du README.
 *
 * Les captures d'un tableau de bord domotique montrent forcement une
 * installation : prenoms, flux de cameras, consommation, plan du logement. Rien
 * de tout cela n'a sa place dans un depot public. Plutot que de flouter apres
 * coup — au risque d'un oubli — on part d'une maison qui n'existe pas.
 *
 * A injecter AVANT le code de l'application, sur `/local/loggia/index.html` :
 * `getHass()` cherche un element `home-assistant` dans le document du haut, et
 * la page ouverte directement est son propre document du haut.
 *
 *   Chrome DevTools : navigate_page({ url, initScript: <ce fichier> })
 *
 * `callWS` echoue volontairement : le composant serveur n'existe pas ici, et le
 * dashboard doit retomber sur la configuration locale posee juste en dessous.
 */
(() => {
  const maintenant = new Date().toISOString();
  const s = (state, attributes = {}) => ({ state: String(state), attributes, last_updated: maintenant, last_changed: maintenant });

  const pieces = [
    ['salon', 'Salon', 21.4, 47, 612],
    ['cuisine', 'Cuisine', 22.8, 51, null],
    ['chambre', 'Chambre', 19.6, 49, 704],
    ['bureau', 'Bureau', 20.9, 45, 538],
    ['entree', 'Entrée', 20.1, 46, null],
    ['salle_de_bain', 'Salle de bain', 23.2, 58, null],
  ];

  const states = {
    'sun.sun': s('above_horizon', { friendly_name: 'Soleil', elevation: 34 }),
    'weather.maison': s('partlycloudy', { friendly_name: 'Météo', temperature: 24, humidity: 52, temperature_unit: '°C' }),
    'alarm_control_panel.maison': s('disarmed', { friendly_name: 'Alarme' }),
    // Energie : production solaire, flux reseau, consommation.
    'sensor.production_solaire': s(1840, { friendly_name: 'Production solaire', unit_of_measurement: 'W', device_class: 'power' }),
    'sensor.reseau': s(-460, { friendly_name: 'Réseau', unit_of_measurement: 'W', device_class: 'power' }),
    'sensor.surplus': s(460, { friendly_name: 'Surplus', unit_of_measurement: 'W', device_class: 'power' }),
  };

  pieces.forEach(([cle, nom, t, h, co2]) => {
    states['sensor.' + cle + '_temperature'] = s(t, { friendly_name: nom + ' température', unit_of_measurement: '°C', device_class: 'temperature' });
    states['sensor.' + cle + '_humidite'] = s(h, { friendly_name: nom + ' humidité', unit_of_measurement: '%', device_class: 'humidity' });
    if (co2 != null) states['sensor.' + cle + '_co2'] = s(co2, { friendly_name: nom + ' CO2', unit_of_measurement: 'ppm', device_class: 'carbon_dioxide' });
    states['light.' + cle] = s(cle === 'salon' || cle === 'cuisine' ? 'on' : 'off', { friendly_name: 'Plafonnier ' + nom, brightness: 180, supported_color_modes: ['brightness'] });
  });

  const el = document.createElement('home-assistant');
  el.hass = {
    states,
    connected: true,
    language: 'fr',
    user: { id: 'demo', name: 'Démo', is_admin: true },
    callWS: () => Promise.reject(new Error('démonstration : pas de composant serveur')),
    callService: () => Promise.resolve(),
    callApi: () => Promise.resolve({}),
    auth: { data: { access_token: null } },
  };
  document.documentElement.appendChild(el);

  // Configuration locale : sans elle, le dashboard tenterait une decouverte qui
  // a besoin des registres de Home Assistant, donc d'une vraie connexion.
  const cfg = {
    loggia_rooms: pieces.map(([cle, nom, , , co2]) => ({
      room: nom,
      haid: { temp: 'sensor.' + cle + '_temperature', humidity: 'sensor.' + cle + '_humidite', co2: co2 != null ? 'sensor.' + cle + '_co2' : null },
    })),
    loggia_entities: {
      weather: ['weather.maison', 'sun.sun'],
      alarm: 'alarm_control_panel.maison',
      cameras: [],
      people: [],
      energy: { solarOutput: 'sensor.production_solaire', consoNow: 'sensor.reseau', surplusNow: 'sensor.surplus' },
    },
    loggia_users: [{ name: 'Démo', role: 'Admin', c: 'var(--o-accent)' }],
    loggia_quickscenes: [
      { name: 'Réveil', sub: 'Volets, café', icon: 'mug-hot', haid: 'scene.reveil' },
      { name: 'Je rentre', sub: 'Lumières + chauffage', icon: 'home', haid: 'scene.je_rentre' },
      { name: 'Cinéma', sub: 'TV, volets', icon: 'film', haid: 'scene.cinema' },
      { name: 'Nuit', sub: 'Tout éteint, alarme', icon: 'moon', haid: 'scene.nuit' },
    ],
    loggia_onboarded: 1,
  };
  try {
    Object.keys(cfg).forEach((k) => localStorage.setItem(k, JSON.stringify(cfg[k])));
  } catch (e) { /* stockage indisponible : la page s'affichera plus vide */ }
})();
