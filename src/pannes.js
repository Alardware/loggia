/* Une panne qui s'explique (06/11, étape 9 du rapport sur l'usage).
 *
 * « Un appareil injoignable se dit “Indisponible depuis 14:05”, mais rien n'explique quoi faire. » La fiche d'un appareil qui
 * ne répond plus dit désormais ce qui se tait — la lampe, le volet, toute une intégration —, la piste la plus probable selon
 * le réseau par lequel il passe (une maille Zigbee, Z-Wave ou Thread, le Wi-Fi, le Bluetooth, le service en ligne d'un
 * fabricant) et, à un administrateur, le chemin de sa page dans Home Assistant (`aidepanne.jsx`). « À surveiller » ne dit que
 * l'intégration ENTIÈRE qui se tait (sa décision du 16/09, redite le 06/11) : une pile vide ou une imprimante qui dort ne s'y
 * montrent pas, leur fiche l'explique. Pur : ni React, ni Home Assistant. */
import { tr } from './i18n.js';
import { estPontZigbee } from './prises.js';

/* Les noms des intégrations courantes, tels que leurs fabricants les écrivent : des noms propres, qui ne se traduisent pas. */
const NOMS_INTEGRATIONS = {
  zha: 'Zigbee (ZHA)', zigbee2mqtt: 'Zigbee2MQTT', deconz: 'deCONZ', hue: 'Philips Hue', zwave_js: 'Z-Wave', matter: 'Matter', thread: 'Thread',
  mqtt: 'MQTT', esphome: 'ESPHome', shelly: 'Shelly', tasmota: 'Tasmota', tplink: 'TP-Link', wiz: 'WiZ', yeelight: 'Yeelight', lifx: 'LIFX',
  wled: 'WLED', xiaomi_miio: 'Xiaomi', broadlink: 'Broadlink', sonos: 'Sonos', cast: 'Google Cast', apple_tv: 'Apple TV',
  androidtv: 'Android TV', androidtv_remote: 'Android TV', samsungtv: 'Samsung TV', webostv: 'LG webOS', tuya: 'Tuya',
  smartthings: 'SmartThings', netatmo: 'Netatmo', alexa_media: 'Alexa Media', alexa_devices: 'Alexa Devices', nest: 'Google Nest', ring: 'Ring', tado: 'tado°',
  somfy: 'Somfy', overkiz: 'Overkiz', ecovacs: 'Ecovacs', roborock: 'Roborock', switchbot: 'SwitchBot', nuki: 'Nuki', reolink: 'Reolink',
  unifiprotect: 'UniFi Protect', xiaomi_ble: 'Xiaomi BLE', bthome: 'BTHome', meross_cloud: 'Meross',
  sonoff: 'Sonoff', tibber: 'Tibber',
};
/* Par où passe le signal : c'est lui qui décide de la piste. Une maille relaie par ses appareils branchés sur secteur. */
const MAILLES = { zha: 'Zigbee', zigbee2mqtt: 'Zigbee', deconz: 'Zigbee', hue: 'Zigbee', zwave_js: 'Z-Wave', matter: 'Thread', thread: 'Thread' };
const WIFI = ['esphome', 'shelly', 'tasmota', 'tplink', 'wiz', 'yeelight', 'lifx', 'wled', 'xiaomi_miio', 'broadlink', 'sonos', 'cast', 'apple_tv',
  'androidtv', 'androidtv_remote', 'samsungtv', 'webostv'];
const NUAGE = ['tuya', 'smartthings', 'netatmo', 'alexa_media', 'alexa_devices', 'nest', 'ring', 'tado', 'somfy', 'overkiz', 'ecovacs', 'roborock', 'meross_cloud', 'sonoff', 'tibber'];
const BLUETOOTH = ['xiaomi_ble', 'bthome', 'switchbot'];

/** L'intégration qui compte : MQTT derrière un pont Zigbee2MQTT est Zigbee2MQTT (`pont` : `{ fabricant, modele }` de l'appareil par lequel il passe). */
export function integrationDeLaPanne(plateforme, pont = null) {
  const p = String(plateforme || '');
  return p === 'mqtt' && estPontZigbee(pont) ? 'zigbee2mqtt' : p;
}
/** Son nom lisible : le nom courant, sinon l'identifiant, sa première lettre en capitale. */
export function nomIntegration(p) {
  if (!p) return '';
  return NOMS_INTEGRATIONS[p] || (p.charAt(0).toUpperCase() + p.slice(1).replace(/_/g, ' '));
}
/** Le réseau : 'maille', 'wifi', 'portee_courte' (le Bluetooth), 'service_en_ligne' (un nuage de fabricant) ou null quand on ne sait pas. */
export function reseauDe(p) {
  if (MAILLES[p]) return 'maille';
  if (WIFI.indexOf(p) >= 0) return 'wifi';
  if (BLUETOOTH.indexOf(p) >= 0) return 'portee_courte';
  if (NUAGE.indexOf(p) >= 0) return 'service_en_ligne';
  return null;
}
/** Ce qui se tait, en un mot. */
export function genrePanne(id, estPrise = false) {
  const d = String(id || '').split('.')[0];
  if (d === 'light') return 'lampe';
  if (d === 'switch') return estPrise ? 'prise' : 'appareil';
  if (d === 'cover') return 'volet';
  if (d === 'sensor' || d === 'binary_sensor') return 'capteur';
  if (d === 'climate' || d === 'water_heater') return 'thermostat';
  if (d === 'media_player') return 'lecteur';
  if (d === 'camera') return 'camera';
  return 'appareil';
}
const TITRES = () => ({
  lampe: tr('La lampe ne répond plus'), prise: tr('La prise ne répond plus'), volet: tr('Le volet ne répond plus'), capteur: tr('Le capteur ne répond plus'),
  thermostat: tr('Le thermostat ne répond plus'), lecteur: tr('Le lecteur ne répond plus'), camera: tr('La caméra ne répond plus'), appareil: tr('L’appareil ne répond plus'),
});

/**
 * L'aide d'une panne : `{ titre, conseil, chemin }`, ou null quand l'entité répond. `chemin` : la page de Home Assistant —
 * celle de l'appareil, sinon celle de l'intégration —, pour un administrateur seulement : ces pages lui sont réservées.
 */
export function aidePanne({ id, st, plateforme = null, pont = null, appareil = null, estPrise = false, integrationMuette = false, admin = false } = {}) {
  if (!id || !st || st.state !== 'unavailable') return null;
  const p = integrationDeLaPanne(plateforme, pont);
  const nom = nomIntegration(p);
  const res = reseauDe(p);
  const g = genrePanne(id, estPrise);
  let titre = TITRES()[g], conseil;
  if (integrationMuette && nom) {
    titre = tr('{x} ne répond plus', { x: nom });
    conseil = tr('Tous ses appareils se taisent : c’est l’intégration qu’il faut regarder — sa passerelle, sa connexion ou son compte.');
  } else if (g === 'prise') {
    // Les mots de la fiche d'une prise (chantier Prises), dits aussi ailleurs.
    conseil = (MAILLES[p] === 'Zigbee' ? tr('Vérifiez qu’elle est branchée et à portée du réseau Zigbee.') : tr('Vérifiez qu’elle est branchée et à portée du réseau.'))
      + ' ' + tr('Loggia la reprendra dès qu’elle répond.');
  } else if (res === 'maille') {
    conseil = tr('Vérifiez son alimentation (pile ou prise), et qu’un autre appareil {x} branché sur secteur n’est pas trop loin : c’est par eux que passe le signal.', { x: MAILLES[p] });
  } else if (res === 'wifi') {
    conseil = tr('Vérifiez son alimentation et sa connexion au Wi-Fi.');
  } else if (res === 'portee_courte') {
    conseil = tr('Vérifiez sa pile, et sa distance au Bluetooth de Home Assistant.');
  } else if (res === 'service_en_ligne') {
    conseil = tr('Tout passe par le service en ligne du fabricant ({x}) : vérifiez la connexion Internet, ou le compte dans Home Assistant.', { x: nom });
  } else {
    conseil = nom ? tr('Vérifiez son alimentation, puis l’intégration {x} dans Home Assistant.', { x: nom }) : tr('Vérifiez son alimentation, puis son intégration dans Home Assistant.');
  }
  const chemin = !admin ? null
    : appareil ? '/config/devices/device/' + encodeURIComponent(appareil)
      : plateforme ? '/config/integrations/integration/' + encodeURIComponent(plateforme) : null;
  return { titre, conseil, chemin };
}
