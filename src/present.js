/**
 * Ce qu'une carte doit montrer.
 *
 * Les moteurs précédents savent ce qu'un appareil EST (`devices.js`), ce qu'il
 * SAIT FAIRE (`capabilities.js`), COMMENT le lui demander (`actions.js`) et ce
 * que les attributs ne disent pas (`profiles.js`). Il reste à trancher ce qui
 * s'affiche, et ce module ne fait que cela — il ne dessine rien, il décide.
 *
 * Trois décisions, chacune fondée sur une mesure faite sur une installation
 * réelle plutôt que sur une intuition :
 *
 *   Qui mérite une carte. La moitié du parc — 90 appareils sur 184 — sont des
 *   entrées de service sans matériel derrière, une par dépôt suivi. Les mettre
 *   sur le même plan qu'une lampe noie les quatre-vingt-quatorze objets réels.
 *
 *   Quels boutons. 35 % des commandes qu'un affichage « par domaine »
 *   proposerait n'aboutiraient pas : le service existe au niveau du domaine,
 *   l'entité ne le supporte pas. Un bouton sans effet est pire qu'absent.
 *
 *   Quoi dire quand ça ne répond pas. Une entité muette parmi dix ne met pas
 *   l'appareil en panne, et le prétendre alarme pour rien ; mais un appareil
 *   dont plus rien ne répond doit le dire, au lieu d'afficher un dernier état
 *   figé qui passe pour actuel.
 */

import { deviceCaps } from './capabilities.js';
import { planAction } from './actions.js';
import { mergedProfile, primaryEntity } from './profiles.js';

const domaineDe = (id) => (typeof id === 'string' ? id.slice(0, id.indexOf('.')) : '');

/**
 * Les domaines qui portent l'usage d'un appareil, du plus parlant au moins.
 *
 * Sert à choisir ce qu'une carte met en avant quand un appareil couvre
 * plusieurs domaines : un thermostat est une consigne avant d'être une
 * batterie, une caméra est une image avant d'être un détecteur.
 */
const DOMAINES_PRINCIPAUX = [
  'climate', 'water_heater', 'vacuum', 'lawn_mower', 'camera', 'media_player',
  'cover', 'valve', 'light', 'fan', 'humidifier', 'lock', 'alarm_control_panel',
  'switch', 'siren', 'select', 'number', 'button', 'update', 'binary_sensor', 'sensor',
];

/** Les valeurs qu'une carte affiche volontiers, dans l'ordre où elle les lit. */
const LECTURES_UTILES = ['temperature', 'humidity', 'position', 'brightness',
  'volume', 'media', 'speed', 'battery'];

/**
 * L'état d'un appareil, en trois mots plutôt qu'en un booléen.
 *
 *   ok        tout répond
 *   degraded  une partie se tait : la carte reste utile, avec une réserve
 *   offline   plus rien ne répond : ce qui est affiché n'est plus d'actualité
 */
export function deviceStatus(device) {
  if (!device || !device.entities || !device.entities.length) return 'offline';
  if (!device.unavailable) return 'ok';
  if (device.unavailable >= device.entities.length) return 'offline';
  return 'degraded';
}

/**
 * Un appareil a-t-il sa place parmi les objets de la maison ?
 *
 * Ce n'est pas un jugement sur sa légitimité : une entrée de service est
 * parfaitement valable, elle n'est simplement pas un objet qu'on manipule.
 */
export function isPhysical(device, profile = null) {
  const p = profile || mergedProfile(device);
  if (p && p.presentation && p.presentation.physical === false) return false;
  return true;
}

/**
 * Ce qu'une carte doit montrer pour un appareil.
 *
 * @param {object} device  un appareil de `buildDevices`
 * @param {object} ctx     { states, services, meta, names }
 */
export function deviceCard(device, ctx = {}) {
  const states = ctx.states || {};
  const services = ctx.services || null;
  const caps = deviceCaps(device, states, services, ctx.meta || null);
  const profile = mergedProfile(device, caps);

  // L'entité qui représente l'appareil. Quand un profil dit que plusieurs
  // entités d'un même domaine n'en décrivent qu'une, il choisit ; sinon on
  // prend celle du domaine le plus parlant.
  let primary = null;
  if (profile && profile.merge) {
    primary = primaryEntity(device, profile.merge, { names: ctx.names, states });
  }
  if (!primary) {
    const dom = DOMAINES_PRINCIPAUX.find(d => (device.domains || []).indexOf(d) >= 0);
    primary = (device.entities || []).find(id => domaineDe(id) === dom)
      || (device.entities || [])[0] || null;
  }

  // Les commandes qui aboutiraient vraiment, avec leurs bornes. Une commande à
  // option n'est proposée que si l'entité publie des options : sans liste, le
  // geste n'aurait nulle part où aller.
  const controls = [];
  if (primary) {
    const capsPrim = caps.byEntity.get(primary);
    const options = (capsPrim && capsPrim.options) || {};
    (capsPrim ? [...capsPrim.can] : []).forEach(c => {
      const p = planAction(primary, c, 0, { states, services });
      if (p.ok) { controls.push({ capability: c, bounds: p.bounds }); return; }
      // Refus faute de valeur d'essai : la commande reste offerte si l'entité
      // publie de quoi choisir. C'est le cas des modes et des sources.
      const liste = Object.keys(options).find(k => Array.isArray(options[k]) && options[k].length);
      if (liste && /option|manquante/.test(p.reason || '')) {
        controls.push({ capability: c, options: options[liste] });
      }
    });
    controls.sort((a, b) => a.capability.localeCompare(b.capability));
  }

  const readings = LECTURES_UTILES.filter(r => caps.reads.has(r));

  return {
    id: device.id,
    name: device.name || device.id,
    area: device.area || null,
    areaName: device.areaName || null,
    integration: device.integration || null,
    primary,
    domain: primary ? domaineDe(primary) : null,
    controls,
    readings,
    status: deviceStatus(device),
    controllable: caps.controllable,
    physical: isPhysical(device, profile),
    // Les entités écartées restent accessibles : rien n'est supprimé, et une
    // vue de détail peut toutes les proposer.
    others: (device.entities || []).filter(id => id !== primary),
    notes: (profile && profile.notes) || [],
    profiles: (profile && profile.ids) || [],
  };
}

/**
 * Les appareils à présenter, triés.
 *
 * Par défaut, ceux qui ont un matériel derrière ET quelque chose à montrer —
 * une commande ou une valeur. Les autres restent disponibles en passant
 * `all: true`, car un écran de diagnostic a besoin de les voir.
 */
export function presentableDevices(devices, ctx = {}) {
  const out = [];
  devices.forEach(d => {
    const carte = deviceCard(d, ctx);
    if (!ctx.all) {
      if (!carte.physical) return;
      if (!carte.controllable && !carte.readings.length) return;
    }
    out.push(carte);
  });
  return out.sort((a, b) => String(a.name).localeCompare(String(b.name), 'fr'));
}

/** Les appareils présentables d'une zone. */
export function cardsByArea(devices, areaId, ctx = {}) {
  return presentableDevices(devices, ctx).filter(c => c.area === areaId);
}

/**
 * Ce que la présentation retient, et ce qu'elle écarte.
 *
 * Un écart important entre les deux n'est pas une anomalie : c'est la mesure de
 * ce qu'une installation contient et qui n'a rien à faire sur un tableau de bord.
 */
export function presentationSummary(devices, ctx = {}) {
  let physiques = 0, pilotables = 0, avecLecture = 0, retenus = 0;
  const parStatut = { ok: 0, degraded: 0, offline: 0 };
  devices.forEach(d => {
    const c = deviceCard(d, ctx);
    if (c.physical) physiques += 1;
    if (c.controllable) pilotables += 1;
    if (c.readings.length) avecLecture += 1;
    if (c.physical && (c.controllable || c.readings.length)) retenus += 1;
    parStatut[c.status] += 1;
  });
  return {
    total: devices.size || devices.length || 0,
    physiques, pilotables, avecLecture, retenus, parStatut,
  };
}

/**
 * L'identité d'une tuile caméra dans la liste de l'accueil.
 *
 * Loggia accepte qu'une caméra soit déclarée par son seul nom, sans entité :
 * la tuile prend alors son rendu de repli. Ces caméras n'ont pas de `haid`, et
 * la liste les rendait toutes avec la même clé vide.
 *
 * React s'en plaignait dans la console, mais le vrai dégât était plus discret :
 * sans clé distincte, il ne peut plus dire quelle tuile est laquelle, et l'état
 * local d'une tuile — sa popup d'agrandissement ouverte — peut se retrouver sur
 * sa voisine dès que l'ordre de la liste change.
 *
 * L'entité passe en premier quand elle existe : elle est déjà unique, et elle
 * survit à un changement d'ordre. À défaut, le rang départage ce que le nom ne
 * suffit pas à rendre unique — rien n'interdit deux « Entrée ».
 */
export function cleCamera(cam, rang) {
  const c = cam || {};
  return c.haid || ((c.name || c.label || 'cam') + '#' + rang);
}
