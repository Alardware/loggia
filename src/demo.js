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
const ilYaMin = (min) => new Date(Date.now() - min * 60000).toISOString();

const PIECES = [
  ['salon', 'Salon', 21.4, 47, 612],
  ['cuisine', 'Cuisine', 22.8, 51, null],
  ['chambre', 'Chambre', 19.6, 49, 1280],  // charge : la carte « A surveiller » a de quoi montrer
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
    'weather.maison': s('partlycloudy', { friendly_name: 'Météo', temperature: 24.3, humidity: 52, temperature_unit: '°C', supported_features: 3,
      apparent_temperature: 26, wind_speed: 9, wind_gust_speed: 20, wind_bearing: 281, wind_speed_unit: 'km/h',
      pressure: 1014, uv_index: 3, visibility: 12 }),
    /* 39 = maison (1) + absent (2) + nuit (4) + vacances (32), les quatre modes
     * que `callService` modelise plus bas. Un vrai panneau publie ce masque, et
     * c'est lui qui dit au moteur d'actions quels armements l'entite accepte :
     * sans lui, aucun mode n'etait declare, et chaque armement se faisait
     * refuser des qu'il passait par la verification. Desarmer, lui, n'a pas de
     * bit — on en sort toujours. */
    'alarm_control_panel.maison': s('disarmed', { friendly_name: 'Alarme', supported_features: 39 }),
    'lock.porte_entree': s('locked', { friendly_name: 'Porte d’entrée' }),
    // La sirene de la vue Securite (ADR 0034) : deux sonneries, pas de duree
    // geree — le test sonore l'eteint lui-meme apres trois secondes.
    'siren.interieure': s('off', { friendly_name: 'Sirène intérieure', supported_features: 7, available_tones: ['alarme', 'carillon'] }),
    // La camera de l'entree et ses reglages : cinq interrupteurs du meme appareil.
    'camera.entree': s('idle', { friendly_name: 'Caméra entrée' }),
    'switch.camera_entree_detection_mouvement': s('on', { friendly_name: 'Caméra entrée Détection de mouvement' }),
    'switch.camera_entree_suivi': s('off', { friendly_name: 'Caméra entrée Suivi de mouvement' }),
    'switch.camera_entree_pleurs': s('off', { friendly_name: 'Caméra entrée Détection des pleurs' }),
    'switch.camera_entree_prive': s('off', { friendly_name: 'Caméra entrée Mode privé' }),
    'switch.camera_entree_voyant': s('on', { friendly_name: 'Caméra entrée Voyant' }),
    // Ses deux detecteurs : ce que la tuile raconte en dernier evenement (ADR 0031).
    'binary_sensor.camera_entree_mouvement': s('off', { friendly_name: 'Caméra entrée Mouvement', device_class: 'motion' }),
    'binary_sensor.camera_entree_personne': s('off', { friendly_name: 'Caméra entrée Personne' }),
    // Le sonometre du salon : la pastille « Bruit » de la barre de confort (ADR 0039).
    'sensor.salon_bruit': s(34, { friendly_name: 'Salon Bruit', unit_of_measurement: 'dB', device_class: 'sound_pressure' }),
    /* La machine de la vue Systeme (ADR 0037) : un System Monitor tel que la
     * decouverte le reconnait — la charge processeur, et ses freres sur le meme
     * appareil — puis les trois mises a jour que publie le Superviseur. */
    'sensor.system_monitor_processor_use': s(18, { friendly_name: 'System Monitor Processor use', unit_of_measurement: '%' }),
    'sensor.system_monitor_memory_use_percent': s(31, { friendly_name: 'System Monitor Memory usage', unit_of_measurement: '%' }),
    'sensor.system_monitor_memory_use': s(2540, { friendly_name: 'System Monitor Memory use', unit_of_measurement: 'MiB', device_class: 'data_size' }),
    'sensor.system_monitor_memory_free': s(5652, { friendly_name: 'System Monitor Memory free', unit_of_measurement: 'MiB', device_class: 'data_size' }),
    'sensor.system_monitor_disk_use_percent': s(46, { friendly_name: 'System Monitor Disk usage', unit_of_measurement: '%' }),
    'sensor.system_monitor_processor_temperature': s(52, { friendly_name: 'System Monitor Processor temperature', unit_of_measurement: '°C', device_class: 'temperature' }),
    'sensor.system_monitor_last_boot': s(new Date(Date.now() - (12 * 24 + 6) * 3600000).toISOString(), { friendly_name: 'System Monitor Last boot', device_class: 'timestamp' }),
    'sensor.system_monitor_swap_use_percent': s(4, { friendly_name: 'System Monitor Swap usage', unit_of_measurement: '%' }),
    'sensor.system_monitor_swap_use': s(82, { friendly_name: 'System Monitor Swap use', unit_of_measurement: 'MiB', device_class: 'data_size' }),
    'sensor.system_monitor_swap_free': s(1966, { friendly_name: 'System Monitor Swap free', unit_of_measurement: 'MiB', device_class: 'data_size' }),
    'sensor.system_monitor_network_throughput_in_eth0': s(4.2, { friendly_name: 'System Monitor Network throughput in eth0', unit_of_measurement: 'Mbit/s', device_class: 'data_rate' }),
    'sensor.system_monitor_network_throughput_out_eth0': s(1.1, { friendly_name: 'System Monitor Network throughput out eth0', unit_of_measurement: 'Mbit/s', device_class: 'data_rate' }),
    'update.home_assistant_core_update': s('on', { friendly_name: 'Home Assistant Core Update', title: 'Home Assistant Core', installed_version: '2026.3.4', latest_version: '2026.4.0' }),
    'update.home_assistant_supervisor_update': s('off', { friendly_name: 'Home Assistant Supervisor Update', title: 'Home Assistant Supervisor', installed_version: '2026.03.2', latest_version: '2026.03.2' }),
    'update.home_assistant_operating_system_update': s('off', { friendly_name: 'Home Assistant Operating System Update', title: 'Home Assistant Operating System', installed_version: '16.2', latest_version: '16.2' }),
    // Des firmwares Zigbee et un module HACS en attente : la section des mises
    // a jour les range par integration (maquettes du 18/09).
    'update.interrupteur_couloir_firmware': s('on', { friendly_name: 'Interrupteur Couloir', installed_version: '1124102917', latest_version: '1124103169' }),
    'update.interrupteur_chambre_firmware': s('on', { friendly_name: 'Interrupteur Chambre', installed_version: '1107324829', latest_version: '1124103169' }),
    'update.carte_meteo_animee_update': s('on', { friendly_name: 'Carte météo animée', installed_version: 'v2.0.1', latest_version: 'v2.0.2' }),
    // Des automatisations Home Assistant : Loggia les liste, les allume, les
    // lance — il ne les ecrit pas. Sans elles, leur section serait vide ici.
    'automation.lumiere_couloir_la_nuit': s('on', { friendly_name: 'Lumière couloir la nuit', last_triggered: ilYaMin(420) }),
    'automation.veilleuse_chambre_au_coucher': s('on', { friendly_name: 'Veilleuse chambre au coucher', last_triggered: ilYaMin(900) }),
    'automation.eclairage_terrasse_au_crepuscule': s('off', { friendly_name: 'Éclairage terrasse au crépuscule', last_triggered: ilYaMin(8600) }),
    'automation.volets_ouverture_du_matin': s('on', { friendly_name: 'Volets : ouverture du matin', last_triggered: ilYaMin(560) }),
    'automation.volets_fermeture_au_coucher_du_soleil': s('on', { friendly_name: 'Volets : fermeture au coucher du soleil', last_triggered: ilYaMin(80) }),
    'automation.chauffage_consigne_de_nuit': s('on', { friendly_name: 'Chauffage : consigne de nuit', last_triggered: ilYaMin(1000) }),
    'automation.radiateur_bureau_hors_gel': s('off', { friendly_name: 'Radiateur bureau hors gel' }),
    'automation.alarme_armement_en_partant': s('on', { friendly_name: 'Alarme : armement en partant', last_triggered: ilYaMin(2900) }),
    'automation.sonnette_vers_le_telephone': s('on', { friendly_name: 'Sonnette vers le téléphone', last_triggered: ilYaMin(190) }),
    'automation.delestage_du_chauffe_eau': s('on', { friendly_name: 'Délestage du chauffe-eau', last_triggered: ilYaMin(1300) }),
    'automation.arrosage_du_potager': s('on', { friendly_name: 'Arrosage du potager', last_triggered: ilYaMin(700) }),
    'automation.lave_linge_termine': s('on', { friendly_name: 'Lave-linge terminé', last_triggered: ilYaMin(1500) }),
    // Le distributeur de croquettes et une plante : ce que la vue Objets et
    // leurs fiches ont a montrer.
    'input_number.croquettes_reservoir': s(760, { friendly_name: 'Réservoir de croquettes', min: 0, max: 2000, step: 10, unit_of_measurement: 'g' }),
    'number.distributeur_portion': s(45, { friendly_name: 'Portion du distributeur', min: 5, max: 100, step: 5, unit_of_measurement: 'g' }),
    'sensor.croquettes_du_jour': s(90, { friendly_name: 'Croquettes distribuées aujourd’hui', unit_of_measurement: 'g' }),
    'select.distributeur_feed': s('STOP', { friendly_name: 'Distribuer', options: ['STOP', 'START'] }),
    'input_boolean.repas_matin': s('on', { friendly_name: 'Repas du matin' }),
    'input_boolean.repas_soir': s('on', { friendly_name: 'Repas du soir' }),
    'sensor.basilic_moisture': s(62, { friendly_name: 'Basilic humidité du sol', device_class: 'moisture', unit_of_measurement: '%' }),
    'sensor.basilic_temperature': s(21.4, { friendly_name: 'Basilic température', device_class: 'temperature', unit_of_measurement: '°C' }),
    'sensor.basilic_illuminance': s(1800, { friendly_name: 'Basilic lumière', device_class: 'illuminance', unit_of_measurement: 'lx' }),
    'sensor.basilic_conductivity': s(640, { friendly_name: 'Basilic conductivité', unit_of_measurement: 'µS/cm' }),
    'sensor.basilic_battery': s(81, { friendly_name: 'Basilic pile', device_class: 'battery', unit_of_measurement: '%' }),
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
    // Un vrai robot annonce ce qu'il sait faire : sans supported_features ni
    // liste de vitesses, la fiche n'avait ni boutons ni selecteur a montrer.
    'vacuum.aspirateur': s('docked', { friendly_name: 'Aspirateur', battery_level: 92,
      supported_features: 8828, fan_speed: 'max_plus',
      fan_speed_list: ['quiet', 'normal', 'max', 'max_plus'],
      // Les pieces que le robot annonce, avec leurs segments (vue du robot, ADR 0042).
      rooms: { salon: 1, cuisine: 2, bureau: 3, chambre: 4, 'entrée': 5 } }),
    // Ses soeurs : pieces d'usure en %, surface de la session, compteurs, reglages.
    'sensor.aspirateur_filtre': s(32, { friendly_name: 'Aspirateur Filtre', unit_of_measurement: '%' }),
    'sensor.aspirateur_brosse_principale': s(58, { friendly_name: 'Aspirateur Brosse principale', unit_of_measurement: '%' }),
    'sensor.aspirateur_brosse_laterale': s(81, { friendly_name: 'Aspirateur Brosse latérale', unit_of_measurement: '%' }),
    'sensor.aspirateur_serpilliere': s(47, { friendly_name: 'Aspirateur Serpillière', unit_of_measurement: '%' }),
    'sensor.aspirateur_surface_nettoyee': s(42, { friendly_name: 'Aspirateur Surface nettoyée', device_class: 'area', unit_of_measurement: 'm²' }),
    'sensor.aspirateur_surface_totale': s(1843, { friendly_name: 'Aspirateur Surface totale nettoyée', device_class: 'area', unit_of_measurement: 'm²' }),
    'sensor.aspirateur_duree_totale': s(164, { friendly_name: 'Aspirateur Durée totale de nettoyage', device_class: 'duration', unit_of_measurement: 'h' }),
    'sensor.aspirateur_nombre_total': s(212, { friendly_name: 'Aspirateur Nombre total de nettoyages' }),
    'button.aspirateur_reinitialiser_filtre': s('unknown', { friendly_name: 'Aspirateur Réinitialiser le filtre' }),
    'select.aspirateur_mode_de_travail': s('vacuum', { friendly_name: 'Aspirateur Mode de travail', options: ['vacuum', 'mop', 'vacuum_and_mop'] }),
    'select.aspirateur_debit_d_eau': s('medium', { friendly_name: "Aspirateur Débit d'eau", options: ['low', 'medium', 'high'] }),
    'switch.aspirateur_detection_tapis': s('on', { friendly_name: 'Aspirateur Détection tapis' }),
    'switch.aspirateur_mode_avance': s('off', { friendly_name: 'Aspirateur Mode avancé' }),
    // La tondeuse en pleine tonte : une fiche au repos ne montrerait ni la
    // couleur active du cadran ni le bouton pause.
    'lawn_mower.tondeuse': s('mowing', { friendly_name: 'Tondeuse', battery_level: 64,
      supported_features: 7 }),
    // Ses soeurs : les zones sont des interrupteurs, les lames se comptent en heures.
    'binary_sensor.tondeuse_en_charge': s('off', { friendly_name: 'Tondeuse En charge', device_class: 'battery_charging' }),
    'switch.tondeuse_zone_pelouse_avant': s('off', { friendly_name: 'Tondeuse Zone Pelouse avant' }),
    'switch.tondeuse_zone_pelouse_arriere': s('on', { friendly_name: 'Tondeuse Zone Pelouse arrière' }),
    'switch.tondeuse_zone_cote_garage': s('off', { friendly_name: 'Tondeuse Zone Côté garage' }),
    'sensor.tondeuse_usage_des_lames': s(43, { friendly_name: "Tondeuse Durée d'utilisation des lames", device_class: 'duration', unit_of_measurement: 'h' }),
    'sensor.tondeuse_seuil_des_lames': s(60, { friendly_name: "Tondeuse Seuil d'usure des lames", device_class: 'duration', unit_of_measurement: 'h' }),
    'sensor.tondeuse_surface': s(210, { friendly_name: 'Tondeuse Surface', unit_of_measurement: 'm²' }),
    'sensor.tondeuse_cycles_de_batterie': s(86, { friendly_name: 'Tondeuse Cycles de batterie', unit_of_measurement: 'cycles' }),
    'sensor.tondeuse_temps_de_travail_total': s(212, { friendly_name: 'Tondeuse Temps de travail total', device_class: 'duration', unit_of_measurement: 'h' }),
    'sensor.tondeuse_kilometrage_total': s(148, { friendly_name: 'Tondeuse Kilométrage total', device_class: 'distance', unit_of_measurement: 'km' }),
    'sensor.tondeuse_signal_wi_fi': s(-58, { friendly_name: 'Tondeuse Signal Wi-Fi', device_class: 'signal_strength', unit_of_measurement: 'dBm' }),
    'number.tondeuse_hauteur_des_lames': s(40, { friendly_name: 'Tondeuse Hauteur des lames', min: 20, max: 70, step: 5, unit_of_measurement: 'mm' }),
    'switch.tondeuse_detection_de_pluie': s('on', { friendly_name: 'Tondeuse Détection de pluie' }),
    'select.tondeuse_securite_faune': s('high', { friendly_name: 'Tondeuse Sécurité faune', options: ['off', 'low', 'high'] }),
    'switch.tondeuse_voix': s('on', { friendly_name: 'Tondeuse Voix' }),
    'update.tondeuse_micrologiciel': s('off', { friendly_name: 'Tondeuse Micrologiciel', installed_version: '1.14.0', latest_version: '1.14.0' }),
    'binary_sensor.porte_entree': s('off', { friendly_name: "Porte d'entrée", device_class: 'door' }),
    'binary_sensor.mouvement_entree': s('off', { friendly_name: 'Mouvement entrée', device_class: 'motion' }),
    'sensor.pile_porte_entree': s(9, { friendly_name: 'Pile porte entrée', device_class: 'battery', unit_of_measurement: '%' }),
    'person.demo': s('home', { friendly_name: 'Démo' }),
    'person.sam': s('not_home', { friendly_name: 'Sam' }),
    'binary_sensor.fenetre_chambre': s('on', { friendly_name: 'Fenêtre chambre', device_class: 'window' }),  // ouverte : la carte Chambre le dit
    'binary_sensor.fenetre_salon': s('off', { friendly_name: 'Fenêtre salon', device_class: 'window' }),
    'switch.radiateur_chambre': s('on', { friendly_name: 'Radiateur chambre' }),
    'switch.radiateur_salon': s('on', { friendly_name: 'Radiateur salon' }),
    'binary_sensor.detecteur_fumee': s('off', { friendly_name: 'Détecteur de fumée cuisine', device_class: 'smoke' }),
    // Les autres familles que la section Alertes compte, et la vanne qu'elle
    // coupe sur une fuite : une maison equipee, pas une liste vide.
    'binary_sensor.detecteur_fumee_entree': s('off', { friendly_name: 'Détecteur de fumée entrée', device_class: 'smoke' }),
    'binary_sensor.detecteur_co_salon': s('off', { friendly_name: 'Détecteur de monoxyde salon', device_class: 'carbon_monoxide' }),
    'binary_sensor.fuite_evier': s('off', { friendly_name: 'Fuite sous l’évier', device_class: 'moisture' }),
    'valve.arrivee_eau': s('open', { friendly_name: 'Arrivée d’eau', device_class: 'water' }),
    // Le telephone de l'app compagnon : son traceur donne son nom au service notify.
    'device_tracker.telephone_de_camille': s('home', { friendly_name: 'Téléphone de Camille', source_type: 'gps' }),
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
    /* La demo se donne un assistant, pour que le bouton du bas existe et que
     * la popup ait quelque chose a raconter. Le nom vaut ce qu'il dit : c'est
     * un reglage, chacun met le sien. */
    loggia_assistant: 'demo',
    // Les alertes de surete : un telephone choisi, les familles de danger
    // allumees. La demo n'envoie rien — il n'y a pas de composant.
    loggia_alertes: { actif: true, service: 'mobile_app_telephone_de_camille', cooldown_min: 5,
      categories: { fumee: true, gaz: true, co: true, fuite: true, alarme: true, portes: true },
      calme: { actif: false, debut: '22:00', fin: '07:00' },
      actions: { actif: true, lumieres: true, volets: true, vanne: { actif: true, entite: '' } } },
    loggia_rooms: PIECES.map(([cle, nom, , , co2]) => ({
      room: nom,
      haid: { temp: 'sensor.' + cle + '_temperature', humidity: 'sensor.' + cle + '_humidite', co2: co2 != null ? 'sensor.' + cle + '_co2' : null },
    })),
    // `loggia_energyHaids` est la cle que lisent `enHaids()` ET la disponibilite
    // des vues : sans elle, la vue Energie restait masquee en demonstration.
    // `loggia_cameras` est la cle que lit l'agregat — `loggia_entities.cameras`
    // sert ailleurs. Sans `haid`, la tuile prend son rendu de repli : degrade,
    // halo et badge « Direct », au lieu d'attendre un flux qui n'existe pas ici.
    loggia_cameras: [{ name: 'Jardin', online: false }, { name: 'Entrée', haid: 'camera.entree', online: true }],
    loggia_energyHaids: { solarOutput: 'sensor.production_solaire', consoNow: 'sensor.reseau', surplusNow: 'sensor.surplus', consoJour: 'sensor.conso_jour', prodJour: 'sensor.production_jour', injectionJour: 'sensor.injection_jour', consoJourHc: 'sensor.conso_jour_hc', consoJourHp: 'sensor.conso_jour_hp' },
    loggia_entities: {
      weather: ['weather.maison', 'sun.sun'],
      alarm: 'alarm_control_panel.maison',
      cameras: [{ name: 'Jardin', online: false }, { name: 'Entrée', haid: 'camera.entree', online: true }],
      people: [{ name: 'Camille', haid: 'person.camille' }, { name: 'Alex', haid: 'person.alex' }],
      energy: { solarOutput: 'sensor.production_solaire', consoNow: 'sensor.reseau', surplusNow: 'sensor.surplus', consoJour: 'sensor.conso_jour', prodJour: 'sensor.production_jour', injectionJour: 'sensor.injection_jour', consoJourHc: 'sensor.conso_jour_hc', consoJourHp: 'sensor.conso_jour_hp' },
    },
    // Deux profils : la demo doit exercer les DEUX branches, admin comprise.
    loggia_users: [{ name: 'Démo', role: 'Admin', c: 'var(--o-accent)' }, { name: 'Invité', role: 'Famille', c: 'var(--o-purple)' }],
    loggia_plants: [{ base: 'sensor.basilic', name: 'Basilic', room: 'Cuisine' }],
    // Le distributeur a sa cle (alias `feeder` → `loggia_feeder`) : `loggia_entities`
    // ne se lit qu'avec un serveur, que la demo n'a pas.
    loggia_feeder: { haids: { reservoir: 'input_number.croquettes_reservoir', portionWeight: 'number.distributeur_portion', distribuees: 'sensor.croquettes_du_jour' },
      meals: [{ time: '07:30', g: 45, auto: 'input_boolean.repas_matin' }, { time: '19:00', g: 45, auto: 'input_boolean.repas_soir' }] },
    loggia_onboarded: 1,
  };
}

/* ── Les scénarios (ADR 0027) ─────────────────────────────────────────────────
 * Le faux serveur : les huit de Loggia, résolus contre la maison de
 * démonstration comme le vrai le ferait — on compte ce qui a quelque chose à
 * faire —, deux déjà liés à une scène (ce que la reprise des anciennes scènes
 * rapides donne), un scénario personnel. Le magasin est en mémoire : ce qu'on
 * enregistre tient le temps de l'onglet. */
const SCN_A = (famille, geste, portee = 'maison', reste = {}) => ({ famille, geste, portee, ...reste });
const SCN_INTEGRES = [
  { id: 'reveil', icone: 'sunrise', teinte: 'ambre', actions: [SCN_A('volets', 'ouvrir'), SCN_A('lumieres', 'allumer', 'maison', { valeur: 30, si: 'nuit' }), SCN_A('chauffage', 'confort')] },
  { id: 'depart', icone: 'running', teinte: 'bain', actions: [SCN_A('lumieres', 'eteindre'), SCN_A('medias', 'eteindre'), SCN_A('chauffage', 'eco'), SCN_A('alarme', 'absent'), SCN_A('serrures', 'verrouiller')] },
  { id: 'retour', icone: 'home', teinte: 'accent', actions: [SCN_A('lumieres', 'allumer', 'vie', { valeur: 60, si: 'nuit' }), SCN_A('chauffage', 'confort')] },
  { id: 'nuit', icone: 'moon', teinte: 'chambre', actions: [SCN_A('lumieres', 'eteindre', 'maison', { sauf_veilleuses: true }), SCN_A('volets', 'fermer'), SCN_A('medias', 'eteindre'), SCN_A('alarme', 'nuit'), SCN_A('serrures', 'verrouiller')] },
  { id: 'cinema', icone: 'film', teinte: 'vert', actions: [SCN_A('medias', 'pause'), SCN_A('lumieres', 'allumer', 'piece', { valeur: 10 }), SCN_A('volets', 'fermer', 'piece'), SCN_A('medias', 'allumer_tv', 'piece')] },
  { id: 'musique', icone: 'music', teinte: 'tendre', actions: [SCN_A('medias', 'lecture', 'piece'), SCN_A('lumieres', 'allumer', 'piece', { valeur: 50 })] },
  { id: 'invites', icone: 'users', teinte: 'ambre', actions: [SCN_A('lumieres', 'allumer', 'vie', { valeur: 100 }), SCN_A('chauffage', 'confort')] },
  { id: 'tout_eteindre', icone: 'power', teinte: 'gris', actions: [SCN_A('lumieres', 'eteindre'), SCN_A('medias', 'eteindre')] },
];
const SCN_PIECE = {
  'light.salon': 'Salon', 'cover.salon': 'Salon', 'cover.volet_salon': 'Salon', 'media_player.salon': 'Salon', 'media_player.enceinte_salon': 'Salon', 'climate.salon': 'Salon',
  'light.cuisine': 'Cuisine', 'cover.cuisine': 'Cuisine', 'cover.volet_cuisine': 'Cuisine',
  'light.chambre': 'Chambre', 'cover.chambre': 'Chambre', 'cover.volet_chambre': 'Chambre', 'climate.chambre': 'Chambre',
  'light.bureau': 'Bureau', 'light.entree': 'Entrée', 'lock.porte_entree': 'Entrée', 'light.sdb': 'Salle de bain',
};
const SCN_INTIME = /chambre|bain/i;
const SCN_CFG = {
  integres: { reveil: { lien: 'scene.reveil' }, cinema: { lien: 'scene.cinema' } },
  persos: [{ id: 'perso_apero', nom: 'Apéro', icone: 'glass-cheers', teinte: 'tendre', accueil: true, masque: false, lien: null, piece: null,
    actions: [SCN_A('medias', 'lecture', 'piece', { piece: 'Salon' }), SCN_A('lumieres', 'allumer', 'piece', { piece: 'Salon', valeur: 40 })] }],
  ordre: [],
};
const SCN_DERNIERS = { nuit: Date.now() / 1000 - 9 * 3600, depart: Date.now() / 1000 - 86400 - 1800 };
function scnEffectifs() {
  const out = SCN_INTEGRES.map(b => {
    const o = SCN_CFG.integres[b.id] || {};
    return { id: b.id, integre: true, nom: o.nom || null, icone: o.icone || b.icone, teinte: o.teinte || b.teinte, masque: !!o.masque, accueil: o.accueil !== false,
      lien: o.lien || null, piece: o.piece || null, actions: (Array.isArray(o.actions) ? o.actions : b.actions).map(a => ({ ...a })), modifie: Object.keys(o).length > 0 };
  }).concat(SCN_CFG.persos.map(p => ({ ...p, integre: false, modifie: true, actions: (p.actions || []).map(a => ({ ...a })) })));
  if (SCN_CFG.ordre.length) { const rang = {}; SCN_CFG.ordre.forEach((id, i) => { rang[id] = i; }); out.sort((a, b) => (rang[a.id] == null ? 99 : rang[a.id]) - (rang[b.id] == null ? 99 : rang[b.id])); }
  return out;
}
function scnCibles(a, states, piece) {
  const dom = { lumieres: 'light.', volets: 'cover.', medias: 'media_player.', chauffage: 'climate.', alarme: 'alarm_control_panel.', serrures: 'lock.' }[a.famille];
  const nuit = !!(states['sun.sun'] && states['sun.sun'].state === 'below_horizon');
  if ((a.si === 'nuit' && !nuit) || (a.si === 'jour' && nuit) || !dom) return [];
  const ou = a.piece || piece;
  return Object.keys(states).filter(id => {
    if (id.indexOf(dom) !== 0) return false;
    const st = states[id].state, p = SCN_PIECE[id] || null;
    if (a.portee === 'piece' && (!ou || !p || p.toLowerCase() !== ou.toLowerCase())) return false;
    if (a.portee === 'vie' && (!p || SCN_INTIME.test(p))) return false;
    if (a.famille === 'lumieres') return a.geste === 'eteindre' ? st === 'on' : true;
    if (a.famille === 'volets') return a.geste === 'fermer' ? st !== 'closed' : st !== 'open';
    if (a.famille === 'medias') { const tv = (states[id].attributes || {}).device_class === 'tv'; return a.geste === 'eteindre' ? st !== 'off' : a.geste === 'pause' ? st === 'playing' : a.geste === 'lecture' ? (!tv && st !== 'playing') : tv; }
    if (a.famille === 'serrures') return st !== 'locked';
    return true;
  }).sort();
}
const scnPieceDe = (s) => s.piece || ((s.id === 'cinema' || s.id === 'musique') ? 'Salon' : null);
function scenariosDemo(states) {
  const liens = Object.keys(states).filter(id => /^(scene|script)\./.test(id)).sort().map(id => ({ haid: id, nom: (states[id].attributes || {}).friendly_name || id }));
  const scenarios = scnEffectifs().map(s => {
    const piece = scnPieceDe(s);
    const resume = s.lien ? [] : s.actions.map(a => ({ famille: a.famille, geste: a.geste, portee: a.portee || 'maison', piece: a.piece || (a.portee === 'piece' ? piece : null), valeur: a.valeur, si: a.si, n: scnCibles(a, states, piece).length }));
    // La suggestion suit la même règle de mots-clés que le serveur : « je_rentre » va à Je rentre, « nuit » à Bonne nuit.
    const suggestion = s.integre && !s.lien ? ({ retour: 'scene.je_rentre', nuit: 'scene.nuit' }[s.id] || null) : null;
    return { ...s, piece_effective: piece, resume, dernier: SCN_DERNIERS[s.id] || null, suggestion: suggestion && states[suggestion] ? suggestion : null, lien_absent: !!s.lien && !states[s.lien] };
  });
  return { scenarios, liens, pieces: ['Bureau', 'Chambre', 'Cuisine', 'Entrée', 'Salle de bain', 'Salon'], alarme: 'alarm_control_panel.maison', journal: [] };
}
function scenariosPatch(patch) {
  const p = patch || {};
  if (p.enregistrer) {
    const s = { ...p.enregistrer };
    if (SCN_INTEGRES.some(b => b.id === s.id)) {
      const o = { ...(SCN_CFG.integres[s.id] || {}), ...s }; delete o.id; if (o.actions == null) delete o.actions;
      SCN_CFG.integres[s.id] = o;
    } else {
      const ex = s.id ? SCN_CFG.persos.find(x => x.id === s.id) : null;
      if (ex) Object.assign(ex, s, { actions: s.actions || [] });
      else {
        const base = 'perso_' + String(s.nom || 'scenario').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
        let id = base, n = 2;
        while (SCN_CFG.persos.some(x => x.id === id)) { id = base + '_' + n; n += 1; }
        SCN_CFG.persos.push({ id, nom: s.nom || id, icone: s.icone || 'sparkles', teinte: s.teinte || 'accent', lien: s.lien || null, piece: s.piece || null, actions: s.actions || [], accueil: s.accueil !== false, masque: !!s.masque });
      }
    }
  }
  if (p.supprimer) SCN_CFG.persos = SCN_CFG.persos.filter(x => x.id !== p.supprimer);
  if (p.reinitialiser) delete SCN_CFG.integres[p.reinitialiser];
  if (Array.isArray(p.ordre)) SCN_CFG.ordre = p.ordre.slice();
  return SCN_CFG;
}
function scenariosLancer(id, states) {
  const s = scnEffectifs().find(x => x.id === id);
  if (!s) return null;
  const fait = []; let n = 0;
  if (s.lien) { fait.push({ famille: 'lien', geste: s.lien.split('.')[0], n: 1 }); n = 1; }
  else {
    const piece = scnPieceDe(s);
    s.actions.forEach(a => {
      const ids = scnCibles(a, states, piece);
      ids.forEach(hid => {
        const st = states[hid]; if (!st) return;
        const etat = { lumieres: a.geste === 'eteindre' ? 'off' : 'on', volets: a.geste === 'fermer' ? 'closed' : 'open',
          medias: a.geste === 'eteindre' ? 'off' : a.geste === 'pause' ? 'paused' : a.geste === 'lecture' ? 'playing' : 'on',
          serrures: 'locked', alarme: { absent: 'armed_away', nuit: 'armed_night', maison: 'armed_home' }[a.geste] }[a.famille];
        if (etat) states[hid] = { ...st, state: etat, last_changed: new Date().toISOString() };
      });
      fait.push({ famille: a.famille, geste: a.geste, n: ids.length }); n += ids.length;
    });
  }
  SCN_DERNIERS[id] = Date.now() / 1000;
  return { id, fait, n };
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
/* L'historique d'un robot (ADR 0042) : son etat, session par session, et la
 * surface que son capteur atteignait. La tondeuse de la demo est en pleine
 * tonte : sa derniere session est en cours. */
function historiqueRobotDemo(ids, states) {
  const jour = (n, h, m) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(h, m, 0, 0); return d.getTime(); };
  const iso = (t) => new Date(t).toISOString();
  const robot = ids.find(id => /^(vacuum|lawn_mower)\./.test(id));
  const tond = robot.indexOf('lawn_mower.') === 0;
  const travail = tond ? 'mowing' : 'cleaning';
  // [il y a n jours, heure, minute, duree en minutes, issue, surface]
  const passes = tond
    ? [[5, 6, 0, 161, 'docked', 365], [3, 19, 30, 28, 'docked', 35], [2, 6, 0, 130, 'docked', 330]]
    : [[5, 14, 2, 94, 'docked', 68], [3, 8, 30, 22, 'idle', 19], [1, 8, 30, 51, 'docked', 42], [0, 8, 31, 48, 'docked', 42]];
  const etats = [{ entity_id: robot, state: 'docked', last_changed: iso(jour(8, 12, 0)) }];
  const surfaces = [];
  const capteur = ids.find(id => id !== robot) || null;
  passes.forEach(([n, h, m, duree, issue, surface]) => {
    const debut = jour(n, h, m);
    if (debut > Date.now()) return;
    etats.push({ state: travail, last_changed: iso(debut) });
    if (issue === 'docked') { etats.push({ state: 'returning', last_changed: iso(debut + duree * 60000) }); etats.push({ state: 'docked', last_changed: iso(debut + (duree + 3) * 60000) }); }
    else etats.push({ state: issue, last_changed: iso(debut + duree * 60000) });
    if (capteur) { surfaces.push({ state: '0', last_changed: iso(debut) }); surfaces.push({ state: String(surface), last_changed: iso(debut + duree * 60000) }); }
  });
  const actuel = states[robot] && states[robot].state;
  if (actuel === travail) { const t = Date.now() - 37 * 60000; etats.push({ state: travail, last_changed: iso(t) }); if (capteur) surfaces.push({ state: String(states[capteur] ? states[capteur].state : 0), last_changed: iso(t + 60000) }); }
  const listes = [etats];
  if (capteur && surfaces.length) { surfaces[0].entity_id = capteur; listes.push(surfaces); }
  return listes;
}

function historiqueDemo(chemin, states) {
  const m = String(chemin).match(/filter_entity_id=([^&]+)/);
  const plusieurs = m ? decodeURIComponent(m[1]).split(',') : [];
  if (plusieurs.some(x => /^(vacuum|lawn_mower)\./.test(x))) return historiqueRobotDemo(plusieurs, states);
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
  // Le CO2 ne descend jamais sous l'air du dehors : une journee plausible, la nuit qui charge.
  const co2 = attrs.device_class === 'carbon_dioxide';
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
      v = co2 ? 430 + (cur - 430) * (0.45 + 0.55 * Math.max(0, Math.sin((heure - 18) / 14 * Math.PI))) * (0.9 + 0.1 * Math.sin(i))
        : solaire ? cur * jour * (0.8 + 0.4 * Math.sin(i)) : cur * (0.7 + 0.6 * Math.sin(i / 3.7) + 0.15 * Math.sin(i));
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
// L'ecoute d'apprentissage de la demo : coupee au depart, comme le serveur.
const INTER_ECOUTE = { fin: 0 };
const interEcoute = () => {
  const reste = Math.max(0, Math.round((INTER_ECOUTE.fin - Date.now()) / 1000));
  return { active: reste > 0, reste };
};

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
    ecoute: interEcoute(),
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
  baies: { actif: true, volets: { 'cover.volet_salon': 'binary_sensor.fenetre_salon' } },
};

function voletsDemo(states) {
  const sun = states['sun.sun'];
  const at = (sun && sun.attributes) || {};
  return {
    config: VOL_CFG,
    soleil: { azimut: at.azimuth != null ? at.azimuth : 214, elevation: at.elevation != null ? at.elevation : 34 },
    abaisses: VOL_CFG.soleil.actif ? ['cover.salon'] : [],
    a_l_abri: false,
    // Les prochains rendez-vous du planning : demain matin, ce soir.
    prochains: { ouverture: { 15: new Date(new Date().setHours(31, 48, 0, 0)).toISOString() }, fermeture: { '-20': new Date(new Date().setHours(20, 24, 0, 0)).toISOString() } },
    journal: [
      { module: 'volets', regle: 'soleil', quoi: 'proteger', cibles: ['cover.salon'], n: 1, motif: 'soleil à 225°', detail: '', simule: false, ts: Date.now() / 1000 - 900 },
      { module: 'volets', regle: 'planning', quoi: 'ouvrir', cibles: ['cover.salon', 'cover.cuisine', 'cover.chambre'], n: 3, motif: 'lever +15 min', detail: '', simule: false, ts: Date.now() / 1000 - 27000 },
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
    journal: [{ module: 'fenetres', regle: 'fenetre', quoi: 'rendre', cibles: ['switch.radiateur_chambre'], n: 1, motif: 'Chambre', detail: '', simule: false, ts: Date.now() / 1000 - 5400 }],
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

/* Le Superviseur de la demonstration (vue Systeme, ADR 0037) : une machine, six
 * modules complementaires dont un arrete, une sauvegarde de la nuit. Les
 * modules se demarrent et s'arretent pour de vrai — la bascule doit repondre. */
const MODULES_DEMO = [
  { slug: 'demo_zigbee2mqtt', name: 'Zigbee2MQTT', version: '2.1.3', version_latest: '2.1.3', update_available: false, state: 'started', icon: false },
  { slug: 'demo_mosquitto', name: 'Mosquitto broker', version: '6.5.1', version_latest: '6.5.1', update_available: false, state: 'started', icon: false },
  { slug: 'demo_esphome', name: 'ESPHome', version: '2026.3.1', version_latest: '2026.3.2', update_available: true, state: 'started', icon: false },
  { slug: 'demo_mariadb', name: 'MariaDB', version: '2.7.2', version_latest: '2.7.2', update_available: false, state: 'started', icon: false },
  { slug: 'demo_samba', name: 'Samba share', version: '12.5.0', version_latest: '12.5.0', update_available: false, state: 'started', icon: false },
  { slug: 'demo_vscode', name: 'Studio Code Server', version: '5.19.0', version_latest: '5.19.0', update_available: false, state: 'stopped', icon: false },
];
const MESURES_MODULES_DEMO = {
  demo_zigbee2mqtt: [5.2, 412], demo_mosquitto: [0.4, 38], demo_esphome: [1.8, 264], demo_mariadb: [3.1, 356], demo_samba: [0.2, 24], demo_vscode: [2.4, 310],
};

function superviseurDemo(msg) {
  const chemin = String(msg.endpoint || '');
  const geste = chemin.match(/^\/addons\/([^/]+)\/(start|stop)$/);
  if (geste && msg.method === 'post') {
    const m = MODULES_DEMO.find(x => x.slug === geste[1]);
    if (m) m.state = geste[2] === 'start' ? 'started' : 'stopped';
    return Promise.resolve({});
  }
  const mesures = chemin.match(/^\/addons\/([^/]+)\/stats$/);
  if (mesures) {
    const [cpu, mio] = MESURES_MODULES_DEMO[mesures[1]] || [0, 0];
    const total = 8192 * 1048576;
    return Promise.resolve({ cpu_percent: cpu, memory_usage: mio * 1048576, memory_limit: total, memory_percent: Math.round(mio * 1048576 / total * 1000) / 10 });
  }
  const nuit = new Date(); nuit.setHours(3, 0, 0, 0);
  if (nuit > new Date()) nuit.setDate(nuit.getDate() - 1);
  const reponses = {
    '/host/info': { hostname: 'homeassistant', operating_system: 'Home Assistant OS 16.2', chassis: 'embedded', disk_total: 128.0, disk_used: 58.4, disk_free: 69.6,
      boot_timestamp: (Date.now() - (12 * 24 + 6) * 3600000) * 1000 },
    '/os/info': { version: '16.2', version_latest: '16.2', update_available: false, board: 'rpi5-64' },
    '/core/info': { version: '2026.3.4', version_latest: '2026.4.0', update_available: true },
    '/supervisor/info': { version: '2026.03.2', version_latest: '2026.03.2', update_available: false },
    '/addons': { addons: MODULES_DEMO.map(m => ({ ...m })) },
    '/backups': { backups: [
      { slug: 'demo1', name: 'Sauvegarde automatique', date: nuit.toISOString(), type: 'full', size: 1945.6 },
      { slug: 'demo0', name: 'Avant mise à jour', date: new Date(nuit.getTime() - 5 * 86400000).toISOString(), type: 'partial', size: 412.3 },
    ] },
    '/network/info': { interfaces: [{ interface: 'eth0', type: 'ethernet', enabled: true, connected: true, primary: true, ipv4: { method: 'auto', address: ['192.0.2.20/24'], gateway: '192.0.2.1' } }] },
  };
  return reponses[chemin] ? Promise.resolve(reponses[chemin]) : Promise.reject(new Error('démonstration : point du Superviseur inconnu'));
}

/* Le journal d'erreurs de Home Assistant, et le logbook des mises a jour : de
 * quoi montrer les trois niveaux du journal de la vue Systeme. */
function erreursDemo() {
  const ilYA = (min) => (Date.now() - min * 60000) / 1000;
  return [
    { name: 'homeassistant.components.mqtt.client', message: ['Connexion au courtier perdue, nouvelle tentative dans 10 s'], level: 'WARNING', timestamp: ilYA(95), first_occurred: ilYA(95), count: 1, source: ['components/mqtt/client.py', 712], exception: '' },
    { name: 'homeassistant.components.rest.data', message: ['Délai dépassé en interrogeant la ressource distante'], level: 'ERROR', timestamp: ilYA(340), first_occurred: ilYA(700), count: 3, source: ['components/rest/data.py', 118], exception: '' },
    // Assez de lignes pour que le journal DEFILE dans sa carte : c'est ce qu'il y a a montrer.
    { name: 'homeassistant.components.zha.core.device', message: ['Appareil injoignable, nouvelle tentative'], level: 'WARNING', timestamp: ilYA(180), first_occurred: ilYA(260), count: 4, source: ['components/zha/core/device.py', 301], exception: '' },
    { name: 'homeassistant.components.recorder.util', message: ['La purge de la base a pris 41 s'], level: 'WARNING', timestamp: ilYA(505), first_occurred: ilYA(505), count: 1, source: ['components/recorder/util.py', 220], exception: '' },
    { name: 'homeassistant.components.camera', message: ['Flux interrompu, reconnexion'], level: 'WARNING', timestamp: ilYA(640), first_occurred: ilYA(900), count: 6, source: ['components/camera/__init__.py', 512], exception: '' },
    { name: 'homeassistant.helpers.template', message: ['Le modèle renvoie « unknown » pour un capteur attendu numérique'], level: 'ERROR', timestamp: ilYA(820), first_occurred: ilYA(820), count: 1, source: ['helpers/template.py', 644], exception: '' },
    { name: 'homeassistant.components.cast.media_player', message: ['Enceinte déconnectée du réseau'], level: 'WARNING', timestamp: ilYA(1010), first_occurred: ilYA(1010), count: 2, source: ['components/cast/media_player.py', 188], exception: '' },
    { name: 'homeassistant.components.websocket_api.http.connection', message: ['Client déconnecté : file de messages pleine'], level: 'ERROR', timestamp: ilYA(1230), first_occurred: ilYA(1230), count: 1, source: ['components/websocket_api/http.py', 97], exception: '' },
  ];
}

function logbookDemo() {
  const ilYA = (min) => new Date(Date.now() - min * 60000).toISOString();
  return [
    { when: ilYA(610), name: 'ESPHome Update', entity_id: 'update.esphome_update', state: 'on' },
    { when: ilYA(420), name: 'Home Assistant Core Update', entity_id: 'update.home_assistant_core_update', state: 'on' },
  ];
}

/* Les registres, tels que le composant les enverrait : des zones, et les
 * entites qui y sont rangees. Le dashboard croise ensuite avec les etats. */
function indexDemo(states) {
  const ZONES = [
    ['salon', 'Salon'], ['cuisine', 'Cuisine'], ['chambre', 'Chambre'],
    ['bureau', 'Bureau'], ['entree', 'Entrée'], ['sdb', 'Salle de bain'],
  ];
  const ZONE_DE = {
    salon: ['light.salon', 'media_player.salon', 'sensor.salon_temperature', 'sensor.salon_humidite', 'sensor.salon_co2', 'sensor.salon_bruit', 'cover.salon', 'cover.volet_salon',
            'binary_sensor.fenetre_salon', 'switch.radiateur_salon', 'media_player.enceinte_salon', 'binary_sensor.detecteur_co_salon'],
    cuisine: ['light.cuisine', 'sensor.cuisine_temperature', 'sensor.cuisine_humidite', 'cover.cuisine', 'cover.volet_cuisine', 'binary_sensor.detecteur_fumee', 'binary_sensor.fuite_evier', 'valve.arrivee_eau'],
    chambre: ['light.chambre', 'sensor.chambre_temperature', 'sensor.chambre_humidite', 'sensor.chambre_co2', 'cover.chambre', 'cover.volet_chambre',
              'binary_sensor.fenetre_chambre', 'switch.radiateur_chambre'],
    bureau: ['light.bureau', 'sensor.bureau_temperature', 'sensor.bureau_humidite', 'sensor.bureau_co2'],
    entree: ['light.entree', 'sensor.entree_temperature', 'binary_sensor.porte_entree', 'binary_sensor.detecteur_fumee_entree', 'binary_sensor.mouvement_entree', 'lock.porte_entree', 'siren.interieure',
             'camera.entree', 'switch.camera_entree_detection_mouvement', 'switch.camera_entree_suivi', 'switch.camera_entree_pleurs',
             'switch.camera_entree_prive', 'switch.camera_entree_voyant', 'binary_sensor.camera_entree_mouvement', 'binary_sensor.camera_entree_personne'],
    sdb: ['light.sdb', 'sensor.sdb_temperature'],
  };
  // La camera de l'entree et ses reglages forment UN appareil : c'est par lui
  // que la fiche retrouve les interrupteurs d'une camera.
  const APPAREIL_DE = (id) => /^(camera\.entree$|switch\.camera_entree_|binary_sensor\.camera_entree_)/.test(id) ? 'cam_entree' : null;
  const entities = [];
  Object.keys(ZONE_DE).forEach(zone => {
    ZONE_DE[zone].forEach(id => {
      if (!states[id]) return;
      const at = states[id].attributes || {};
      entities.push({ id, name: at.friendly_name || id, device: APPAREIL_DE(id), area: zone,
        platform: 'demo', category: null, device_class: at.device_class || null,
        unit: at.unit_of_measurement || null, hidden: false });
    });
  });
  // Les robots (ADR 0042) : un appareil chacun. C'est par lui que leur vue
  // retrouve pieces d'usure, zones et reglages — reconnus a la cle de traduction.
  const ROBOTS = {
    robot_aspirateur: ['ecovacs', {
      'vacuum.aspirateur': [null, null], 'sensor.aspirateur_filtre': ['lifespan_filter', 'diagnostic'],
      'sensor.aspirateur_brosse_principale': ['lifespan_brush', 'diagnostic'], 'sensor.aspirateur_brosse_laterale': ['lifespan_side_brush', 'diagnostic'],
      'sensor.aspirateur_serpilliere': ['lifespan_round_mop', 'diagnostic'], 'sensor.aspirateur_surface_nettoyee': ['stats_area', null],
      'sensor.aspirateur_surface_totale': ['total_stats_area', null], 'sensor.aspirateur_duree_totale': ['total_stats_time', null],
      'sensor.aspirateur_nombre_total': ['total_stats_cleanings', null], 'button.aspirateur_reinitialiser_filtre': ['reset_lifespan_filter', 'config'],
      'select.aspirateur_mode_de_travail': ['work_mode', 'config'], 'select.aspirateur_debit_d_eau': ['water_amount', 'config'],
      'switch.aspirateur_detection_tapis': ['carpet_auto_fan_boost', 'config'], 'switch.aspirateur_mode_avance': ['advanced_mode', 'config'],
    }],
    robot_tondeuse: ['mammotion', {
      'lawn_mower.tondeuse': [null, null], 'binary_sensor.tondeuse_en_charge': [null, 'diagnostic'],
      'switch.tondeuse_zone_pelouse_avant': ['area', 'config'], 'switch.tondeuse_zone_pelouse_arriere': ['area', 'config'], 'switch.tondeuse_zone_cote_garage': ['area', 'config'],
      'sensor.tondeuse_usage_des_lames': ['blade_used_time', 'diagnostic'], 'sensor.tondeuse_seuil_des_lames': ['blade_used_warn_time', 'diagnostic'],
      'sensor.tondeuse_surface': ['area', 'diagnostic'], 'sensor.tondeuse_cycles_de_batterie': ['maintenance_bat_cycles', 'diagnostic'],
      'sensor.tondeuse_temps_de_travail_total': ['maintenance_work_time', 'diagnostic'], 'sensor.tondeuse_kilometrage_total': ['maintenance_distance', 'diagnostic'],
      'sensor.tondeuse_signal_wi_fi': ['wifi_rssi', 'diagnostic'], 'number.tondeuse_hauteur_des_lames': ['blade_height', 'config'],
      'switch.tondeuse_detection_de_pluie': ['rain_detection', 'config'], 'select.tondeuse_securite_faune': ['wildlife_safety', 'config'],
      'switch.tondeuse_voix': ['voice_on_off', 'config'], 'update.tondeuse_micrologiciel': ['update', 'config'],
    }],
  };
  Object.keys(ROBOTS).forEach(appareil => {
    const [plateforme, liste] = ROBOTS[appareil];
    Object.keys(liste).forEach(id => {
      if (!states[id]) return;
      const at = states[id].attributes || {};
      entities.push({ id, name: at.friendly_name || id, device: appareil, area: null, platform: plateforme, key: liste[id][0], category: liste[id][1],
        device_class: at.device_class || null, unit: at.unit_of_measurement || null, hidden: false });
    });
  });
  // La machine : un appareil sans piece. C'est par lui que la vue Systeme
  // retrouve, autour de la charge processeur, la memoire, le swap et les debits.
  Object.keys(states).filter(id => id.indexOf('sensor.system_monitor_') === 0).forEach(id => {
    const at = states[id].attributes || {};
    entities.push({ id, name: at.friendly_name || id, device: 'sysmon', area: null,
      platform: 'systemmonitor', category: 'diagnostic', device_class: at.device_class || null,
      unit: at.unit_of_measurement || null, hidden: false });
  });
  // Les mises a jour : chacune publiee par son integration — c'est elle qui
  // fait le groupe dans la section des mises a jour.
  [['update.interrupteur_couloir_firmware', 'mqtt'], ['update.interrupteur_chambre_firmware', 'mqtt'], ['update.carte_meteo_animee_update', 'hacs'],
    ['update.home_assistant_core_update', 'hassio'], ['update.home_assistant_supervisor_update', 'hassio'], ['update.home_assistant_operating_system_update', 'hassio']].forEach(([id, plateforme]) => {
    if (!states[id]) return;
    const at = states[id].attributes || {};
    entities.push({ id, name: at.friendly_name || id, device: null, area: null, platform: plateforme, category: 'config',
      device_class: null, unit: null, hidden: false });
  });
  return {
    version: 1,
    areas: ZONES.map(([id, name]) => ({ id, name, floor: null, icon: null })),
    devices: [{ id: 'cam_entree', name: 'Caméra entrée', area: 'entree', manufacturer: 'Démo', model: 'Caméra', firmware: null, via: null, entry_type: null, integration: 'demo' },
      { id: 'sysmon', name: 'System Monitor', area: null, manufacturer: 'Démo', model: 'System Monitor', firmware: null, via: null, entry_type: 'service', integration: 'systemmonitor' },
      { id: 'robot_aspirateur', name: 'Aspirateur', area: null, manufacturer: 'Démo', model: 'Orbit V3', firmware: null, via: null, entry_type: null, integration: 'ecovacs' },
      { id: 'robot_tondeuse', name: 'Tondeuse', area: null, manufacturer: 'Démo', model: 'Meadow M2', firmware: null, via: null, entry_type: null, integration: 'mammotion' }],
    entities,
    floors: [],
    services: {},
    component_version: null,
  };
}

/* Depart et retour : la regle armee, alarme comprise, mais le desarmement au
 * retour laisse ferme — c'est le defaut, et la demonstration doit le montrer. */
const PRE_CFG = {
  actif: true, delai_depart: 5, personnes: ['person.demo', 'person.sam'],
  depart: { lumieres: true, chauffage: { actif: true, consigne: 17, confort: 20 },
    alarme: { actif: true, entite: 'alarm_control_panel.maison', mode: 'away' } },
  retour: { lumieres: true, seulement_la_nuit: true, chauffage: true, desarmer: false },
  indices: { actif: true, mains: true },
};

function presenceDemo() {
  return {
    config: PRE_CFG,
    dehors: false,
    en_attente: false,
    eteintes: [],
    indices: { capteurs: ['binary_sensor.fenetre_chambre', 'binary_sensor.fenetre_salon', 'binary_sensor.porte_entree'],
      dernier: { entite: 'binary_sensor.porte_entree', nom: "Porte d'entrée", genre: 'ouverture', ts: Date.now() / 1000 - 600 } },
    journal: [
      { module: 'presence', regle: 'depart', quoi: 'reporter', cibles: [], n: 0, motif: "ouverture : Porte d'entrée", detail: '', simule: false, ts: Date.now() / 1000 - 600 },
      { module: 'presence', regle: 'retour', quoi: 'rallumer', cibles: ['light.salon', 'light.cuisine'], n: 2, motif: 'retour', detail: '', simule: false, ts: Date.now() / 1000 - 7200 },
      { module: 'presence', regle: 'depart', quoi: 'eteindre', cibles: ['light.salon', 'light.cuisine', 'light.bureau'], n: 3, motif: 'maison vide', detail: '', simule: false, ts: Date.now() / 1000 - 34000 },
    ],
  };
}

function presencePatch(patch) {
  const objet = (x) => x && typeof x === 'object' && !Array.isArray(x);
  Object.keys(patch || {}).forEach(k => {
    if (objet(PRE_CFG[k]) && objet(patch[k])) {
      Object.keys(patch[k]).forEach(kk => {
        if (objet(PRE_CFG[k][kk]) && objet(patch[k][kk])) Object.assign(PRE_CFG[k][kk], patch[k][kk]);
        else PRE_CFG[k][kk] = patch[k][kk];
      });
    } else PRE_CFG[k] = patch[k];
  });
  return PRE_CFG;
}

/* La nuit : la veilleuse d'une chambre reglee, l'extinction du soir armee et
 * la veilleuse mise de cote — c'est l'usage le plus courant, autant le
 * montrer plutot qu'un formulaire vide. */
const NUI_CFG = {
  veilleuse: { actif: true, lampes: ['light.chambre'], duree: 30, fondu: 5, depuis: '19:00' },
  coucher: { actif: true, heure: '23:30', sauf: ['light.chambre'], jours: [0, 1, 2, 3, 4, 5, 6] },
  eclairage: { actif: true, luminosite: 10, duree: 3, pieces: { 'Entrée': { actif: true, capteurs: ['binary_sensor.mouvement_entree'], lampes: ['light.entree'] } } },
};

function nuitDemo() {
  return {
    config: NUI_CFG,
    en_cours: [],
    eclairees: {},
    journal: [
      { module: 'nuit', regle: 'eclairage', quoi: 'allumer', cibles: ['light.entree'], n: 1, motif: 'mouvement : Entrée', detail: '', simule: false, ts: Date.now() / 1000 - 30000 },
      { module: 'nuit', regle: 'eclairage', quoi: 'eteindre', cibles: ['light.entree'], n: 1, motif: '3 min sans mouvement', detail: '', simule: false, ts: Date.now() / 1000 - 29700 },
      { module: 'nuit', regle: 'veilleuse', quoi: 'eteindre', cibles: ['light.chambre'], n: 1, motif: '30 min', detail: '', simule: false, ts: Date.now() / 1000 - 50000 },
      { module: 'nuit', regle: 'coucher', quoi: 'eteindre', cibles: ['light.salon', 'light.cuisine'], n: 2, motif: '23:30', detail: '1 sous la main de quelqu’un', simule: false, ts: Date.now() / 1000 - 54000 },
    ],
  };
}

function nuitPatch(patch) {
  Object.keys(patch || {}).forEach(k => {
    if (!NUI_CFG[k]) return;
    // Les pièces de l'éclairage nocturne arrivent une à la fois, comme sur le serveur.
    if (k === 'eclairage' && patch[k] && patch[k].pieces) {
      const pieces = { ...(NUI_CFG.eclairage.pieces || {}) };
      Object.keys(patch[k].pieces).forEach(nom => {
        if (patch[k].pieces[nom] === null) delete pieces[nom];
        else pieces[nom] = { ...(pieces[nom] || {}), ...patch[k].pieces[nom] };
      });
      Object.assign(NUI_CFG[k], patch[k], { pieces });
    } else Object.assign(NUI_CFG[k], patch[k]);
  });
  return NUI_CFG;
}

/* Les trois veilles : l'air arme, les piles armees, le tarif au repos faute
 * de capteur de tarif dans la maison de demonstration. */
const VEI_CFG = {
  co2: { actif: true, seuil: 1200, capteurs: [], ventilation: [] },
  batterie: { actif: true, seuil: 15 },
  creuses: { actif: false, entite: '', valeur: '', prises: [] },
};

/* Le journal de la maison : les lignes de chaque module, melees dans l'ordre
 * du temps, plus ce que le socle retient en ce moment. La demo montre une
 * main posee sur une lampe (le gel), un volet tenu par la protection
 * solaire, et une ligne simulee — de quoi voir chaque filtre agir. */
const GELS_DEMO = { 'light.salon': 1260 };
function reglesDemo(states) {
  const lignes = [
    { module: 'interrupteurs', regle: 'Variateur Salon', quoi: 'bouton', cibles: ['light.salon'], n: 1, motif: 'on_press_release → light.turn_on', detail: '', simule: false, ts: Date.now() / 1000 - 540 },
    { module: 'volets', regle: 'planning', quoi: 'fermer', cibles: ['cover.chambre'], n: 1, motif: 'coucher -20 min', detail: '', simule: true, ts: Date.now() / 1000 - 3600 },
    ...voletsDemo(states).journal, ...fenetresDemo().journal, ...presenceDemo().journal,
    ...nuitDemo().journal, ...veillesDemo(states).journal,
  ];
  lignes.sort((a, b) => b.ts - a.ts);
  return {
    journal: lignes,
    gels: { ...GELS_DEMO },
    tenues: VOL_CFG.soleil.actif ? { 'cover.volet_salon': { module: 'volets', regle: 'soleil' } } : {},
    attentes: { 'cover.volet_chambre': { sens: 'fermer', motif: 'baie ouverte', expire: Date.now() / 1000 + 36000 } },
    calme: false,
  };
}

function veillesDemo(states) {
  const classe = (c) => Object.keys(states)
    .filter(id => (id.startsWith('sensor.') || id.startsWith('binary_sensor.'))
      && ((states[id].attributes || {}).device_class === c)).sort();
  return {
    config: VEI_CFG,
    capteurs_co2: classe('carbon_dioxide'),
    capteurs_batterie: classe('battery'),
    notification: true,
    signales: [],
    journal: [{ module: 'veilles', regle: 'co2', quoi: 'prevenir', cibles: [], n: 1, motif: '1310 ppm', detail: 'CO2 chambre : 1310 ppm, il faut aérer', simule: false, ts: Date.now() / 1000 - 9000 }],
  };
}

function veillesPatch(patch) {
  Object.keys(patch || {}).forEach(k => {
    if (VEI_CFG[k]) Object.assign(VEI_CFG[k], patch[k]);
  });
  return VEI_CFG;
}

/* Le planning des robots (ADR 0043). Lundi vaut 0, comme côté serveur. La
 * tondeuse de la démo a son capteur de pluie : c'est lui que l'onglet montre. */
/* Le code administrateur de la demo : verifie « par le serveur », comme en vrai. */
const PIN_DEMO = { code: '0000', rates: 0 };

const ROB_CFG = {
  plannings: [
    { id: 'p-semaine', robot: 'vacuum.aspirateur', heure: '09:30', jours: [0, 1, 2, 3, 4], actif: true,
      zones: [{ id: 'salon', nom: 'Salon', segments: [1] }, { id: 'cuisine', nom: 'Cuisine', segments: [2] }] },
    { id: 'p-samedi', robot: 'vacuum.aspirateur', heure: '18:00', jours: [5], actif: true, zones: [] },
    { id: 'p-nuit', robot: 'vacuum.aspirateur', heure: '23:00', jours: [6], actif: false, zones: [] },
    { id: 'p-tonte', robot: 'lawn_mower.tondeuse', heure: '10:00', jours: [1, 4], actif: true,
      zones: [{ id: 'switch.tondeuse_zone_pelouse_avant', nom: 'Pelouse avant', segments: [] }] },
  ],
  robots: { 'vacuum.aspirateur': { calme: { actif: true, debut: '22:00', fin: '07:00' }, pluie: { actif: false } } },
};

/* Une COPIE à chaque réponse, comme un vrai serveur : l'écran ne doit pas
 * tenir l'objet que la commande suivante modifiera. */
const copieRobots = () => JSON.parse(JSON.stringify(ROB_CFG));

function robotsDemo(states) {
  return { config: copieRobots(), meteo: Object.keys(states).filter(id => id.startsWith('weather.')).sort()[0] || null, journal: [] };
}

function robotsPatch(patch) {
  const p = patch || {};
  if (Array.isArray(p.plannings)) ROB_CFG.plannings = p.plannings;
  Object.keys(p.robots || {}).forEach(id => {
    const actuel = ROB_CFG.robots[id] || { calme: { actif: false, debut: '22:00', fin: '07:00' }, pluie: { actif: false } };
    ROB_CFG.robots[id] = { calme: { ...actuel.calme, ...(p.robots[id].calme || {}) }, pluie: { ...actuel.pluie, ...(p.robots[id].pluie || {}) } };
  });
  return copieRobots();
}

/* Deux agendas, pas un : le choix des agendas et la mention du calendrier
 * sous chaque evenement n apparaissent qu a partir de deux. */
/* L'arbre que la demonstration fait parcourir. Les radios viennent en
 * premier : c'est ce qu'une maison lance le plus souvent, et c'est ce que
 * `radio_browser` expose sur une vraie installation. */
function parcoursDemo(cid) {
  const dossier = (title, id) => ({ title, media_content_id: id, media_content_type: 'directory', media_class: 'directory', can_expand: true, can_play: false });
  const piste = (title, id, cls) => ({ title, media_content_id: id, media_content_type: 'music', media_class: cls || 'music', can_expand: false, can_play: true });
  if (!cid) {
    return { title: 'Sources', children: [
      dossier('Radios', 'demo://radios'),
      dossier('Musique locale', 'demo://musique'),
      dossier('Podcasts', 'demo://podcasts'),
    ] };
  }
  if (cid === 'demo://radios') {
    return { title: 'Radios', children: [
      piste('FIP', 'demo://radio/fip', 'channel'),
      piste('France Inter', 'demo://radio/inter', 'channel'),
      piste('Radio Classique', 'demo://radio/classique', 'channel'),
      piste('Nova', 'demo://radio/nova', 'channel'),
    ] };
  }
  if (cid === 'demo://musique') {
    return { title: 'Musique locale', children: [
      dossier('Debussy', 'demo://musique/debussy'),
      piste('Gymnopedie n1', 'demo://musique/gymnopedie', 'music'),
    ] };
  }
  if (cid === 'demo://musique/debussy') {
    return { title: 'Debussy', children: [
      piste('Clair de Lune', 'demo://musique/clair', 'music'),
      piste('Arabesque n1', 'demo://musique/arabesque', 'music'),
    ] };
  }
  // Un dossier qui existe mais ne contient rien : l'ecran vide se distingue
  // d'une erreur, et le navigateur doit le dire.
  return { title: 'Podcasts', children: [] };
}

/* Ce que la demo retient des gestes faits sur l'agenda.
 *
 * Sans cette memoire, supprimer un rendez-vous ne se voyait pas : la liste
 * se reconstruit a chaque lecture, l'evenement revenait aussitot, et la
 * demonstration montrait un geste sans effet — exactement le defaut que le
 * reste du dashboard s'emploie a eviter. */
const calSupprimes = new Set();
const calModifies = new Map();

function calendrierDemo(id) {
  const j = (n) => { const d = new Date(Date.now() + n * 864e5); return d.toISOString().slice(0, 10); };
  const h = (n, hh) => { const d = new Date(Date.now() + n * 864e5); d.setHours(hh, 0, 0, 0); return d.toISOString(); };
  const vivants = (l) => l
    .filter(e => !calSupprimes.has(e.uid))
    .map(e => (calModifies.has(e.uid) ? { ...e, ...calModifies.get(e.uid) } : e));
  if (id === 'calendar.travail') return vivants([
    { uid: 'demo-equipe', summary: 'Point d equipe', start: { dateTime: h(1, 9) }, end: { dateTime: h(1, 10) } },
    { uid: 'demo-livrable', summary: 'Livrable client', start: { dateTime: h(3, 17) }, end: { dateTime: h(3, 18) } },
  ]);
  return vivants([
    { uid: 'demo-poubelles', summary: 'Ramassage des poubelles', start: { date: j(1) }, end: { date: j(2) } },
    { uid: 'demo-cafe', summary: 'Café avec Sam', start: { dateTime: h(2, 10) }, end: { dateTime: h(2, 11) } },
    { uid: 'demo-chaudiere', summary: 'Contrôle chaudière', start: { dateTime: h(4, 14) }, end: { dateTime: h(4, 15) } },
    // Un rendez-vous AUJOURD'HUI et une journee a deux : sans eux, deux etats
    // du calendrier ne se voyaient nulle part — le halo du jour courant et
    // l'anneau epaissi d'une journee chargee.
    { uid: 'demo-colis', summary: 'Livraison colis', start: { dateTime: h(0, 16) }, end: { dateTime: h(0, 17) } },
    { uid: 'demo-ramoneur', summary: 'Visite du ramoneur', start: { dateTime: h(2, 15) }, end: { dateTime: h(2, 16) } },
  ]);
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
  try { Object.defineProperty(window, 'localStorage', { value: faux, configurable: true }); } catch { /* repli : la demo ecrira le vrai stockage */ }

  // ── 2. La maison ──────────────────────────────────────────────────────────
  const states = etatsInitiaux();
  const toucher = (id, patch, attrs) => {
    // entity_id à la manière de HA : une chaîne ou un tableau d'ids.
    if (Array.isArray(id)) { id.forEach(x => toucher(x, patch, attrs)); return; }
    const cur = states[id]; if (!cur) return;
    states[id] = { state: patch != null ? String(patch) : cur.state, attributes: { ...cur.attributes, ...(attrs || {}) }, last_updated: maintenant(), last_changed: maintenant() };
    el.hass = { ...el.hass, states };
  };
  /* `target` compte autant que `data`.
   *
   * Home Assistant accepte l'entite des deux facons : dans les donnees du
   * service, ou dans une cible a part — `callService(domaine, service, data,
   * target)`. Le moteur d'actions de Loggia emploie la seconde, parce que c'est
   * celle que Home Assistant recommande.
   *
   * La demo n'en prenait que trois arguments : la cible tombait, l'entite valait
   * `undefined`, et la commande ne touchait rien. Rien ne le signalait — la
   * carte peignait l'etat demande, puis revenait quatre secondes plus tard. Tout
   * le chemin verifie du dashboard etait donc inerte ici, la ou on l'essaye. */
  const callService = (domaine, service, data, target) => {
    const id = (data && data.entity_id) || (target && target.entity_id);
    // La sirene aussi (ADR 0034) : sa bascule et son test sonore passent par turn_on / turn_off.
    if (domaine === 'automation' && service === 'trigger') {
      toucher(id, null, { last_triggered: maintenant() });
    } else if (domaine === 'update') {
      // Une installation prend du temps : la section montre sa progression.
      const at = (states[id] && states[id].attributes) || {};
      if (service === 'install') {
        toucher(id, null, { in_progress: true });
        setTimeout(() => toucher(id, 'off', { in_progress: false, installed_version: at.latest_version }), 3500);
      } else if (service === 'skip') toucher(id, 'off', { skipped_version: at.latest_version });
    } else if (domaine === 'homeassistant' || domaine === 'light' || domaine === 'switch' || domaine === 'fan' || domaine === 'siren' || domaine === 'automation') {
      if (service === 'turn_on') toucher(id, 'on');
      else if (service === 'turn_off') toucher(id, 'off');
      else if (service === 'toggle') toucher(id, states[id] && states[id].state === 'on' ? 'off' : 'on');
    } else if (domaine === 'number' || domaine === 'input_number') {
      if (service === 'set_value') toucher(id, data.value);
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
    } else if (domaine === 'lawn_mower' || domaine === 'vacuum') {
      const cible = { start_mowing: 'mowing', start: 'cleaning', pause: 'paused',
        dock: 'returning', return_to_base: 'returning', stop: 'idle' }[service];
      if (cible) {
        toucher(id, cible);
        // Un robot qui rentre met du temps : sans ce delai la demonstration
        // sauterait l etape que la fiche sert justement a montrer.
        if (cible === 'returning') setTimeout(() => toucher(id, 'docked'), 4000);
      } else if (service === 'set_fan_speed') toucher(id, null, { fan_speed: data.fan_speed });
    } else if (domaine === 'lock') {
      // Une serrure motorisee met deux bonnes secondes : sans ce passage par
      // `locking`, la demo montrerait un mouvement instantane qui n'existe pas.
      const lid = id || 'lock.porte_entree';
      const vise = service === 'lock' ? 'locked' : 'unlocked';
      toucher(lid, vise === 'locked' ? 'locking' : 'unlocking');
      setTimeout(() => toucher(lid, vise), 2000);
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
      /* Le navigateur de medias : sans reponse ici, il n'aurait qu'un message
       * d'erreur a montrer, alors que c'est l'arbre qu'il faut voir. Deux
       * niveaux suffisent a rendre la navigation credible. */
      if (msg && msg.type === 'media_player/browse_media') {
        return Promise.resolve(parcoursDemo(msg.media_content_id));
      }
      if (msg && msg.type === 'loggia/scenarios/etat') return Promise.resolve(scenariosDemo(states));
      if (msg && msg.type === 'loggia/scenarios/config') return Promise.resolve({ config: scenariosPatch(msg.patch), etat: scenariosDemo(states) });
      if (msg && msg.type === 'loggia/scenarios/lancer') return Promise.resolve(scenariosLancer(msg.id, states));
      if (msg && msg.type === 'loggia/interrupteurs/etat') return Promise.resolve(interDemo());
      if (msg && msg.type === 'loggia/interrupteurs/ecouter') {
        const duree = Math.max(0, Math.min(900, Number(msg.duree) || 0));
        INTER_ECOUTE.fin = duree ? Date.now() + duree * 1000 : 0;
        return Promise.resolve({ ecoute: interEcoute() });
      }
      if (msg && msg.type === 'loggia/interrupteurs/affecter') {
        return Promise.resolve({ affectations: interAffecter(msg) });
      }
      if (msg && msg.type === 'loggia/volets/etat') return Promise.resolve(voletsDemo(states));
      if (msg && msg.type === 'loggia/volets/config') {
        return Promise.resolve({ config: voletsPatch(msg.patch) });
      }
      // Les services notify : ceux que la section Alertes propose comme cible.
      if (msg && msg.type === 'get_services') return Promise.resolve({ notify: { mobile_app_telephone_de_camille: {}, notify: {}, persistent_notification: {} } });
      if (msg && msg.type === 'loggia/fenetres/etat') return Promise.resolve(fenetresDemo());
      if (msg && msg.type === 'loggia/fenetres/config') {
        return Promise.resolve({ config: fenetresPatch(msg.patch) });
      }
      /* Sans zones, aucune regle par piece n'est proposable : c'est la zone
       * qui dit quel radiateur est dans la meme piece que quelle fenetre. */
      if (msg && msg.type === 'loggia/presence/etat') return Promise.resolve(presenceDemo());
      if (msg && msg.type === 'loggia/presence/config') {
        return Promise.resolve({ config: presencePatch(msg.patch) });
      }
      if (msg && msg.type === 'loggia/nuit/etat') return Promise.resolve(nuitDemo());
      if (msg && msg.type === 'loggia/nuit/config') {
        return Promise.resolve({ config: nuitPatch(msg.patch) });
      }
      if (msg && msg.type === 'loggia/pin/verifier') {
        if (String(msg.pin) === PIN_DEMO.code) { PIN_DEMO.rates = 0; return Promise.resolve({ ok: true }); }
        PIN_DEMO.rates += 1;
        return Promise.resolve({ ok: false, bloque: PIN_DEMO.rates >= 5 ? 60 : 0 });
      }
      if (msg && msg.type === 'loggia/pin/definir') { PIN_DEMO.code = String(msg.pin); return Promise.resolve({ defini: true }); }
      if (msg && msg.type === 'loggia/robots/etat') return Promise.resolve(robotsDemo(states));
      if (msg && msg.type === 'loggia/robots/config') return Promise.resolve({ config: robotsPatch(msg.patch) });
      if (msg && msg.type === 'loggia/veilles/etat') return Promise.resolve(veillesDemo(states));
      if (msg && msg.type === 'loggia/regles/etat') return Promise.resolve(reglesDemo(states));
      if (msg && msg.type === 'loggia/regles/degeler') {
        const etait = msg.entity_id in GELS_DEMO;
        delete GELS_DEMO[msg.entity_id];
        return Promise.resolve({ entity_id: msg.entity_id, etait_gele: etait, gels: { ...GELS_DEMO } });
      }
      if (msg && msg.type === 'loggia/veilles/config') {
        return Promise.resolve({ config: veillesPatch(msg.patch) });
      }
      /* Modifier et supprimer un rendez-vous : les seules commandes du
       * dashboard qui ne passent pas par un service. Sans elles ici, le geste
       * echouerait sur « pas de composant serveur » et la demo montrerait un
       * bouton qui ne fait rien. */
      if (msg && msg.type === 'calendar/event/delete') {
        calSupprimes.add(msg.uid);
        return Promise.resolve({});
      }
      if (msg && msg.type === 'calendar/event/update') {
        const ev = msg.event || {};
        const patch = { summary: ev.summary };
        if (ev.start_date) { patch.start = { date: ev.start_date }; patch.end = { date: ev.end_date }; }
        else if (ev.start_date_time) {
          // La demo garde l'heure locale telle qu'envoyee : `T` a la place de
          // l'espace suffit a en refaire une date que le dashboard sait lire.
          patch.start = { dateTime: String(ev.start_date_time).replace(' ', 'T') };
          patch.end = { dateTime: String(ev.end_date_time).replace(' ', 'T') };
        }
        calModifies.set(msg.uid, patch);
        return Promise.resolve({});
      }
      /* L'assistant de demonstration. Il ne pense rien : il rend un historique
       * court, puis recopie mot a mot une reponse ecrite d'avance. Ce qui se
       * montre ici n'est pas son intelligence, c'est le chemin — l'orbe qui
       * change d'etat, la bulle qui se remplit, l'arret qui arrete. */
      if (msg && msg.type === 'demo/info') return Promise.resolve({ addon: { version: 'demo' }, identity: null, phases: [], profile: null });
      if (msg && msg.type === 'demo/history') {
        return Promise.resolve({ conversation_id: 'demo-1', messages: [
          { role: 'user', text: 'Il fait quel temps dehors ?', ts: Date.now() - 7 * 60000 },
          { role: 'assistant', text: 'Onze degres et couvert. Il devrait pleuvoir vers vingt-trois heures.', ts: Date.now() - 7 * 60000 + 4000 },
        ] });
      }
      if (msg && msg.type === 'demo/cancel') return Promise.resolve({});
      /* L'API commune de Home Assistant, celle des entites de conversation
       * qui n'ont pas de protocole a elles : une reponse d'un bloc, sans
       * historique ni flux. */
      if (msg && msg.type === 'conversation/process') {
        return new Promise((ok) => setTimeout(() => ok({
          conversation_id: msg.conversation_id || 'demo-assist',
          response: { response_type: 'action_done', language: 'fr', data: {}, speech: { plain: {
            speech: "Ici l'agent integre de Home Assistant, dans la demo : une reponse d'un bloc, sans historique ni flux. Change d'entite dans l'en-tete pour comparer.",
          } } },
        }), 600));
      }
      if (msg && msg.type === 'loggia/discovery') return Promise.resolve({ index: indexDemo(states) });
      /* La vue Systeme (ADR 0037) : sans ces reponses elle ne montrerait que
       * ses tuiles, alors que les versions, les modules et le journal sont
       * justement ce qu'il y a a voir. */
      if (msg && msg.type === 'supervisor/api') return superviseurDemo(msg);
      if (msg && msg.type === 'system_log/list') return Promise.resolve(erreursDemo());
      if (msg && msg.type === 'cloud/status') return Promise.resolve({ logged_in: true, cloud: 'connected' });
      return Promise.reject(new Error('démonstration : pas de composant serveur'));
    },
    /* `connection.subscribeMessage` : le seul endroit ou la demo doit imiter
     * un FLUX et non une reponse. L'assistant repond mot a mot ; rendre la
     * phrase d'un bloc montrerait autre chose que ce qui se passe vraiment. */
    connection: {
      subscribeMessage: (rappel, msg) => {
        if (msg && msg.type === 'logbook/event_stream') {
          /* Le journal de la demo : ce que les detecteurs de la camera de
           * l'entree ont vu — un mouvement il y a trois minutes, quelqu'un il
           * y a quarante et une. De quoi faire parler la tuile (ADR 0031). */
          const ids = Array.isArray(msg.entity_ids) ? msg.entity_ids : null;
          const ilYA = (min) => (Date.now() - min * 60000) / 1000;
          const vus = [
            { when: ilYA(3), entity_id: 'binary_sensor.camera_entree_mouvement', state: 'on', name: 'Caméra entrée Mouvement' },
            { when: ilYA(2.5), entity_id: 'binary_sensor.camera_entree_mouvement', state: 'off', name: 'Caméra entrée Mouvement' },
            { when: ilYA(41), entity_id: 'binary_sensor.camera_entree_personne', state: 'on', name: 'Caméra entrée Personne' },
            { when: ilYA(40), entity_id: 'binary_sensor.camera_entree_personne', state: 'off', name: 'Caméra entrée Personne' },
          ].filter(e => !ids || ids.indexOf(e.entity_id) >= 0);
          let mort = false;
          setTimeout(() => { if (!mort && vus.length) rappel({ events: vus }); }, 120);
          return Promise.resolve(() => { mort = true; });
        }
        /* Les previsions de la carte meteo du rail (ADR 0038) : un abonnement,
         * comme sur une vraie installation — une livraison, puis le silence. */
        if (msg && msg.type === 'weather/subscribe_forecast') {
          let mort = false;
          setTimeout(() => { if (!mort) rappel({ type: msg.forecast_type, forecast: previsionsDemo(msg.forecast_type) }); }, 120);
          return Promise.resolve(() => { mort = true; });
        }
        /* Ce que l'enregistreur dit de sa base (vue Systeme) : le flux rend ce
         * qu'il sait, puis se termine. */
        if (msg && msg.type === 'system_health/info') {
          let mort = false;
          setTimeout(() => {
            if (mort) return;
            rappel({ type: 'initial', data: { recorder: { info: { estimated_db_size: '1433.60 MiB', database_engine: 'mysql', database_version: '11.4.2-MariaDB' } } } });
            rappel({ type: 'finish' });
          }, 150);
          return Promise.resolve(() => { mort = true; });
        }
        if (!msg || msg.type !== 'demo/chat') return Promise.reject(new Error('démonstration : pas de composant serveur'));
        /* Trois sujets reconnus, pour que la demo montre aussi la teinte de
         * l'orbe : l'alerte en rouge, le chauffage en orange, ce qui est ferme
         * en vert. Le reste recoit la phrase qui dit ce qu'est la demo. */
        const q = String(msg.text || '');
        const phrase = /fum|alarm|fuite|intrus|smoke|leak/i.test(q)
          ? 'Alerte : de la fumee est detectee dans la cuisine. Aere, et verifie la plaque de cuisson.'
          : /chauff|radiateur|thermostat|heat/i.test(q)
          ? 'Le chauffage tient dix-neuf degres dans le salon, et la chambre remonte doucement.'
          : /ferm|verrou|closed|lock/i.test(q)
            ? 'Tout est ferme : les volets sont baisses et les lumieres du salon sont eteintes.'
            : 'Je suis la demonstration : je ne sais rien de ta maison, mais je sais montrer le chemin. Pose la meme question a ton assistant, et il repondra pour de vrai.';
        const mots = phrase.split(' ');
        let i = 0, mort = false;
        rappel({ event: 'accepted', message_id: 'demo-' + Date.now(), conversation_id: 'demo-1' });
        const suite = () => {
          if (mort) return;
          if (i >= mots.length) { rappel({ event: 'done' }); return; }
          rappel({ event: 'delta', text: (i ? ' ' : '') + mots[i++] });
          setTimeout(suite, 55);
        };
        setTimeout(suite, 700);
        return Promise.resolve(() => { mort = true; });
      },
    },
    callService,
    callApi: (methode, chemin) => {
      if (methode === 'GET' && String(chemin).indexOf('calendars/') === 0) {
        const cid = String(chemin).slice(10).split('?')[0];
        return Promise.resolve(calendrierDemo(cid));
      }
      if (methode === 'GET' && String(chemin).indexOf('history/period/') === 0) return Promise.resolve(historiqueDemo(String(chemin), states));
      if (methode === 'GET' && String(chemin).indexOf('logbook/') === 0) return Promise.resolve(logbookDemo());
      return Promise.resolve({});
    },
    auth: { data: { access_token: null } },
  };
  document.documentElement.appendChild(el);

  // Un calendrier dans les états, pour que la carte Agenda se montre.
  /* Deux agendas, et un seul qui accepte qu'on y ecrive : `supported_features`
   * a 7 vaut creer + supprimer + modifier ; a 0, rien. Sans cet ecart, la demo
   * ne montrerait pas ce qui compte — les boutons n'apparaissent que la ou le
   * geste aboutira, et « Travail » reste en lecture seule comme l'est un
   * abonnement iCal. */
  states['calendar.maison'] = s('off', { friendly_name: 'Calendrier maison', supported_features: 7 });
  states['calendar.travail'] = s('off', { friendly_name: 'Travail', supported_features: 0 });

  /* Deux entites de conversation, pour que le choix de l'assistant se montre :
   * celle de la demo, qui parle son propre protocole, et l'agent integre de
   * Home Assistant, qui passe par l'API commune. */
  states['conversation.demo'] = s('unknown', { friendly_name: 'Démo' });
  states['conversation.home_assistant'] = s('unknown', { friendly_name: 'Home Assistant' });

  // ── 3. Le badge ───────────────────────────────────────────────────────────
  const badge = document.createElement('div');
  badge.textContent = 'Démonstration — données factices';
  badge.style.cssText = 'position:fixed;left:50%;bottom:10px;transform:translateX(-50%);z-index:99999;padding:6px 14px;border-radius:999px;background:rgba(77,163,255,.16);border:1px solid rgba(77,163,255,.4);color:#8fc2ff;font:700 11.5px/1.4 system-ui,sans-serif;pointer-events:none;';
  document.documentElement.appendChild(badge);
}
