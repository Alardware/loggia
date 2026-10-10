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
import { trouverCreneau } from './creneau.js';

/** Le registre d'entités, mis à plat pour les découvertes qui lisent les clés
 * de traduction. `entityMeta` est une Map ; on n'en sort que ce qui sert. */
function listeEntites(index) {
  const table = index && index.entityMeta;
  if (!table || typeof table.forEach !== 'function') return [];
  const out = [];
  table.forEach((m, id) => out.push({ id, cle: (m && m.translationKey) || '', desactive: !!(m && m.disabled) }));
  return out;
}
import { mergedProfile, primaryEntity } from './profiles.js';
import { comparerTextes } from './i18n.js';

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
    /* Les unites observees sur un robot ne sont pas les seules possibles : une
     * installation en mesures imperiales publie des pieds carres, et plus d'une
     * integration donne la duree en heures ou en secondes. */
    area_cleaned: pick('area_cleaned', { domain: 'sensor', unit: ['m²', 'm2', 'ft²', 'sq ft'] }),
    duration: pick('duration', { domain: 'sensor', unit: ['min', 'h', 's'] }),
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
  // Le choix de l'utilisateur prime MÊME s'il manque à la liste classée : un
  // panneau logiciel (Alarmo…) peut échapper au classement par appareil, et
  // l'ignorer renverrait les commandes vers l'autre système (UniFi Protect…).
  const main = (chosen && (list.find(v => v.id === chosen) || { id: chosen, name: chosen })) || list[0];
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
  const src = (energyPrefs && Array.isArray(energyPrefs.energy_sources)) ? energyPrefs.energy_sources : null;
  /* LA FICHE NE COUPE PLUS LA DEDUCTION (07/10).
   *
   * On rendait ici la fiche SEULE, sans meme regarder le tableau de bord
   * Energie. Or l'ecran Parametres n'expose que six champs de PUISSANCE :
   * nommer sa voiture suffisait a perdre les compteurs, les couts, les prix,
   * le gaz, l'eau et les appareils mesures que Home Assistant declarait.
   *
   * La deduction se fait donc TOUJOURS, et c'est `enHaids` (state.js) qui
   * marie les deux — la fiche d'abord, le tableau pour tout ce qu'elle ne dit
   * pas. Le garde du 02/10 (un capteur retire de la fiche ne doit pas revenir
   * par le tableau) y vit aussi, par FAMILLE de capteurs. */
  if (!src) {
    return cfg
      ? { available: true, source: 'utilisateur', haids: {}, devices: [], prix: [], prixVente: [] }
      : { available: false, reason: 'tableau de bord Energie non configure', haids: {}, devices: [], prix: [], prixVente: [] };
  }

  /* LE TABLEAU DE BORD ÉNERGIE A DEUX FORMATS, et on ne lisait que l'ancien.
   *
   * Historiquement, UNE source `grid` portait toutes les connexions dans
   * `flow_from` et `flow_to`. Les versions récentes de Home Assistant écrivent
   * UNE SOURCE PAR CONNEXION, avec `stat_energy_from` directement sur la
   * source — un contrat heures creuses / heures pleines en donne donc deux.
   *
   * `grid.flow_from[0]` ne trouvait rien du tout sur une installation
   * récente : ni consommation, ni coût, ni injection. Et même à l'ancien
   * format, ne prendre que la PREMIÈRE connexion ne lisait que la moitié d'un
   * compteur bi-horaire.
   *
   * On aplatit donc les deux formes, et on garde toutes les parts.
   */
  const grids = src.filter(x => x && x.type === 'grid');
  const imports = [], exports_ = [];
  for (const g of grids) {
    const froms = (Array.isArray(g.flow_from) && g.flow_from.length) ? g.flow_from : (g.stat_energy_from ? [g] : []);
    const tos = (Array.isArray(g.flow_to) && g.flow_to.length) ? g.flow_to : (g.stat_energy_to ? [g] : []);
    for (const f of froms) if (f && f.stat_energy_from) imports.push({ src: g, flux: f });
    for (const t of tos) if (t && t.stat_energy_to) exports_.push({ src: g, flux: t });
  }
  const solar = src.filter(x => x && x.type === 'solar').map(x => x.stat_energy_from).filter(Boolean);
  /* LA BATTERIE DOMESTIQUE. Le tableau de bord Energie la declare comme une
   * source a part entiere, avec deux compteurs : `stat_energy_from` est ce
   * qu'elle REND a la maison, `stat_energy_to` ce qu'elle STOCKE. On ne lisait
   * ni l'un ni l'autre — le schema de la maison n'avait donc jamais de
   * batterie chez qui n'avait pas rempli la fiche a la main (audit du 07/10).
   *
   * La vue veut une PUISSANCE SIGNEE (positive en charge) et un niveau. Les
   * compteurs sont des energies : la puissance se cherche dans `power_config`
   * quand Home Assistant la nomme, sinon sur l'appareil du compteur. */
  const batteries = src.filter(x => x && x.type === 'battery');
  const batDecharge = batteries.map(x => x.stat_energy_from).filter(Boolean);
  const batCharge = batteries.map(x => x.stat_energy_to).filter(Boolean);
  const batCle = batDecharge[0] || batCharge[0] || null;
  const batRate = (cle) => {
    for (const b of batteries) if (b.power_config && b.power_config[cle]) return b.power_config[cle];
    return null;
  };
  /* LE GAZ ET L'EAU. Le tableau de bord Energie les declare comme l'electricite
   * — un type de source, un compteur, parfois un cout. On ne les lisait pas du
   * tout : les deux tuiles ne pouvaient apparaitre chez personne, meme sur une
   * maison qui les avait renseignes (07/10). */
  const parType = (nom) => src.filter(x => x && x.type === nom).map(x => x.stat_energy_from).filter(Boolean);
  const gaz = parType('gas');
  const eau = parType('water');
  /* LE PRIX DU KILOWATTHEURE, tel que le tableau de bord le declare : un nombre
   * fixe (`number_energy_price`) ou une entite qui le publie
   * (`entity_energy_price`). C'est la seule source generique d'un tarif —
   * personne n'a de capteur « prix » par defaut. Les prix de TOUTES les
   * connexions sortent : un contrat heures creuses / pleines en a deux, et
   * c'est a la vue de dire lequel court. */
  const prix = [];
  for (const x of imports) {
    const p = x.flux.number_energy_price != null ? x.flux.number_energy_price : x.src.number_energy_price;
    const e = x.flux.entity_energy_price || x.src.entity_energy_price || null;
    if (typeof p === 'number' && isFinite(p)) prix.push({ valeur: p, entite: e, compteur: x.flux.stat_energy_from });
    else if (e) prix.push({ valeur: null, entite: e, compteur: x.flux.stat_energy_from });
  }

  /* CE QUE L'INJECTION RAPPORTE. Le tableau de bord declare, en face du prix
   * d'achat, un prix de REVENTE (`number_energy_price_export`, ou l'entite qui
   * le publie) et parfois la somme deja gagnee (`stat_compensation`, que Home
   * Assistant tient lui-meme comme il tient `stat_cost`). Rien n'en etait lu :
   * l'injection s'affichait en kilowattheures, jamais en euros (audit du
   * 07/10). Comme pour le cout, on reprend SON chiffre — il connait les
   * paliers et les contrats, pas nous. */
  const compensations = exports_.map(x => x.flux.stat_compensation).filter(Boolean);
  const prixVente = [];
  for (const x of exports_) {
    const p = x.flux.number_energy_price_export != null
      ? x.flux.number_energy_price_export : x.src.number_energy_price_export;
    const e = x.flux.entity_energy_price_export || x.src.entity_energy_price_export || null;
    if (typeof p === 'number' && isFinite(p)) prixVente.push({ valeur: p, entite: e, compteur: x.flux.stat_energy_to });
    else if (e) prixVente.push({ valeur: null, entite: e, compteur: x.flux.stat_energy_to });
  }

  // Puissance instantanee : un capteur `power` du meme appareil que le compteur.
  // Choisi par sa seule device_class, sans regarder l'unite : c'est voulu, un
  // capteur en kW (compteur P1/DSMR) est une puissance comme une autre. L'unite
  // se lit a la LECTURE, par `wattsDe` (unites.js, audit du 03/10).
  const powerOf = (id) => id ? pickSibling(index, states, id, { domain: 'sensor', deviceClass: 'power' }) : null;
  /* Le format récent NOMME lui-même la puissance, dans `power_config` : c'est
   * plus sûr qu'une déduction par voisinage, et on la prend quand elle est là. */
  const rate = (liste, cle) => {
    for (const x of liste) {
      const p = x.src && x.src.power_config;
      if (p && p[cle]) return p[cle];
    }
    return null;
  };
  const partsImport = imports.map(x => x.flux.stat_energy_from);
  const partsExport = exports_.map(x => x.flux.stat_energy_to);
  const couts = imports.map(x => x.flux.stat_cost).filter(Boolean);
  /* Un seul compteur : c'est LE compteur. Plusieurs : aucun ne vaut pour le
   * tout, et mieux vaut ne rien désigner que d'en élire un au hasard — les
   * parts restent à côté, pour qui sait les additionner (ADR 0030). */
  const seul = (a) => (a.length === 1 ? a[0] : null);
  const gridStat = seul(partsImport);
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
    source: cfg ? 'utilisateur' : 'tableau de bord Energie',
    haids: {
      consoJour: gridStat,
      coutJour: seul(couts),
      injectionJour: seul(partsExport),
      prodJour: solarStat,
      gridNow: rate(imports, 'stat_rate_from') || powerOf(gridStat),
      solarNow: powerOf(solarStat),
      injectionNow: rate(exports_, 'stat_rate_to') || null,
      /* La batterie : une puissance SIGNEE si l'appareil en publie une, sinon
       * les deux sens separement — la vue fait la difference. Le niveau se
       * cherche sur le meme appareil que le compteur. */
      batNow: batCle ? powerOf(batCle) : null,
      batChargeNow: batRate('stat_rate_to'),
      batDechargeNow: batRate('stat_rate_from'),
      batSoc: batCle ? pickSibling(index, states, batCle, { domain: 'sensor', deviceClass: 'battery' }) : null,
      /* LE CRÉNEAU TARIFAIRE EN COURS (09/10). Home Assistant ne lui donne ni
       * `device_class` ni rôle dans le tableau de bord : il n'existait que
       * désigné à la main, partout, ce qui contredit « tout opérationnel sans
       * configurer ».
       *
       * On le cherche dans TOUTE la maison, et non auprès des compteurs : le
       * créneau décrit le CONTRAT, les compteurs décrivent le COMPTEUR, et
       * rien ne les lie — mesuré sur une installation réelle, ils venaient de
       * deux intégrations différentes. C'est la clé de traduction qui le
       * désigne, et l'unicité qui le garantit (creneau.js). */
      hcActive: trouverCreneau(listeEntites(index)),
      // Ce que l'injection a rapporte, quand Home Assistant le tient.
      revenuJour: seul(compensations),
      /* Les PARTS, quand le contrat en compte plusieurs : l'historique les
       * additionne au lieu de n'en lire qu'une. Absentes quand il n'y en a
       * qu'une — `consoJour` suffit alors, et une liste d'un seul élément ne
       * ferait que doubler l'information. */
      gasJour: seul(gaz),
      waterJour: seul(eau),
      consoJourParts: partsImport.length > 1 ? partsImport : null,
      injectionJourParts: partsExport.length > 1 ? partsExport : null,
      coutJourParts: couts.length > 1 ? couts : null,
      revenuJourParts: compensations.length > 1 ? compensations : null,
      prodJourParts: solar.length > 1 ? solar : null,
    },
    devices,
    /* A COTE des identifiants : un prix est une VALEUR, pas une entite, et
     * `enHaids` ne transporte que des identifiants. La vue lit celui-ci
     * directement dans la resolution. */
    prix,
    /* Le prix de REVENTE, a cote de celui d'achat : meme forme, meme raison —
     * une valeur, ou l'entite qui la publie, jamais un identifiant seul. */
    prixVente,
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
/* Home Assistant fabrique l'identifiant d'une entite a partir de son nom
 * TRADUIT : System Monitor installe en allemand publie `_speicher`, en
 * espagnol `_memoria`. Le processeur s'en tire — le sigle CPU ne se traduit
 * nulle part, et `_cpu` suffit a retrouver l'appareil. La memoire et le disque,
 * eux, ne repondaient qu'en anglais et en francais : la machine apparaissait,
 * ses deux jauges restaient vides.
 *
 * Ces motifs resteront toujours un pis-aller : Home Assistant ne publie aucune
 * `device_class` pour « occupation memoire ». On couvre donc les racines des
 * langues les plus repandues, en gardant des morceaux courts et distinctifs. */
const CPU_RE = /(processor_use|utilisation_cpu|cpu_utilization|cpu_use|_cpu$|_cpu_|prozessor)/;
const MEM_RE = /(memory_use_percent|utilisation_de_la_memoire|memory_utilization|_memoire|_memory|_speicher|_memoria|_geheugen|_minne)/;
const DISK_RE = /(disk_use_percent|utilisation_disque|utilisation_du_disque|storage_utilization|_disk|_disque|_festplatte|_speicherplatz|_disco|_schijf)/;

/* ── Les capteurs frères de la machine (vue Système, ADR 0037) ───────────────
 * La configuration nomme le capteur de charge processeur ; le swap, la mémoire
 * en octets et les débits se ramassent sur le MÊME appareil. Même pis-aller que
 * ci-dessus pour les noms traduits (« swap » se dit « espace d'échange » chez un
 * System Monitor français) ; l'unité et la `device_class` font le tri.
 *
 * Une entité désactivée n'a pas d'état : elle ne se ramasse pas, et sa tuile ne
 * s'affiche pas. */
const SWAP_RE = /(swap|espace_d_echange|_echange|auslagerung|intercambio|scambio|wisselgeheugen)/;
const MEMOIRE_RE = /(memory|memoire|speicher|memoria|geheugen|minne)/;
const LIBRE_RE = /(free|libre|frei|libero|vrij|ledig)/;
const RX_RE = /(_rx$|_rx_|entrant|_in_|_in$|eingehend|inkomend)/;
const TX_RE = /(_tx$|_tx_|sortant|_out_|_out$|ausgehend|saliente|uscente|uitgaand)/;
const TAILLE_RE = /^(B|kB|KB|KiB|MB|MiB|GB|GiB|TB|TiB)$/;
/* Les interfaces que personne ne branche : boucle locale, ponts et paires
 * virtuelles de Docker, tunnels. */
const VIRTUELLE_RE = /^(lo|docker\d*|veth\w*|hassio|br-\w+|br\d+|virbr\d*|tun\d*|tap\d*|wg\d*|tailscale\d*|zt\w+)$/;
const rangInterface = (nom) => (/^(eth|en|em)/.test(nom) ? 0 : /^wl/.test(nom) ? 2 : 1);

/** `sensor.hote_enp1s0_rx` → `enp1s0` ; `…_debit_entrant_via_eth0` → `eth0`. */
export function interfaceDe(id) {
  const court = String(id).replace(/^sensor\./, '').replace(/_(rx|tx)$/, '');
  return court.slice(court.lastIndexOf('_') + 1);
}

export function capteursHote(freres, states) {
  const out = {};
  const debits = {};
  (freres || []).forEach(id => {
    if (String(id).indexOf('sensor.') !== 0 || !states || !states[id]) return;
    const a = states[id].attributes || {};
    const unite = String(a.unit_of_measurement || '');
    if (a.device_class === 'data_rate') {
      const sens = RX_RE.test(id) ? 'rx' : TX_RE.test(id) ? 'tx' : null;
      const nom = interfaceDe(id);
      if (!sens || VIRTUELLE_RE.test(nom)) return;
      (debits[nom] = debits[nom] || {})[sens] = id;
      return;
    }
    if (SWAP_RE.test(id)) {
      if (unite === '%') { if (!out.swapPct) out.swapPct = id; }
      else if (TAILLE_RE.test(unite)) {
        const cle = LIBRE_RE.test(id) ? 'swapFree' : 'swapUsed';
        if (!out[cle]) out[cle] = id;
      }
      return;
    }
    // Glances publie aussi la mémoire de SES conteneurs : ce n'est pas celle de la machine.
    if (MEMOIRE_RE.test(id) && TAILLE_RE.test(unite) && !/(container|conteneur|docker)/.test(id)) {
      const cle = LIBRE_RE.test(id) ? 'memFree' : 'memUsed';
      if (!out[cle]) out[cle] = id;
    }
  });
  // UNE interface : celle qui a ses deux sens, filaire d'abord, le Wi-Fi en dernier.
  const noms = Object.keys(debits).filter(n => debits[n].rx && debits[n].tx)
    .sort((a, b) => rangInterface(a) - rangInterface(b) || (a < b ? -1 : a > b ? 1 : 0));
  if (noms.length) { out.netIn = debits[noms[0]].rx; out.netOut = debits[noms[0]].tx; }
  return out;
}

export function resolveSystem({ index, states = {}, userCfg = {} } = {}) {
  const cfg = (userCfg && typeof userCfg.loggia_system === 'object' && userCfg.loggia_system) || null;
  /* LA FICHE NE COUPE PLUS LA DECOUVERTE (07/10), comme pour l'energie. On
   * rendait ici `hosts: []` des qu'une fiche existait : remplir UN emplacement
   * de machine faisait perdre les deux autres, que la decouverte connaissait.
   * C'est `sysSensors` (sysconf.js) qui marie les deux, emplacement par
   * emplacement — celui que la fiche declare lui appartient, meme vide. */
  if (!index) return { available: !!cfg, source: cfg ? 'utilisateur' : null, reason: 'decouverte indisponible', hosts: [], table: cfg };

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
  if (!hosts.length) return { available: !!cfg, source: cfg ? 'utilisateur' : null, reason: 'aucune machine supervisee', hosts: [], table: cfg };
  hosts.sort((a, b) => comparerTextes(String(a.name), String(b.name)));
  return { available: true, source: cfg ? 'utilisateur' : 'decouverte', table: cfg, hosts };
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

/* La detection des capteurs de piece (« Detecter automatiquement » de la fiche
 * « Entites de la vue » de l'Accueil). `rooms` : les lignes du formulaire
 * `{ room, temp, humidity, co2 }` ; `suggestions` : `resolveRooms().suggested`.
 *   1) La zone Home Assistant fait autorite : la decouverte a deja releve les
 *      capteurs d'ambiance de chacune.
 *   2) Le nom, en second recours, pour qui n'a pas range ses entites en zones.
 * Un choix qui marche n'est jamais ecrase. */
export function detecterCapteursPieces(rooms, { suggestions = [], capteurs = [], vivant = () => false } = {}) {
  const parZone = {};
  (suggestions || []).forEach(a => { parZone[String(a.name).toLowerCase()] = a; });
  const slug = (t) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_');
  let trouves = 0, parZoneN = 0;
  const suivantes = (rooms || []).map(r => {
    if (!r.room) return r;
    const zone = parZone[String(r.room).toLowerCase()];
    const sl = slug(r.room);
    const pick = (cle, suffixes, cur) => {
      if (vivant(cur)) return cur;
      if (zone && zone[cle]) { trouves++; parZoneN++; return zone[cle]; }
      for (const sf of suffixes) {
        const hit = capteurs.find(id => id.indexOf(sl) >= 0 && id.indexOf(sf) >= 0);
        if (hit) { trouves++; return hit; }
      }
      return cur;
    };
    return { ...r, temp: pick('temp', ['temperature'], r.temp), humidity: pick('hum', ['humidity', 'humidite'], r.humidity), co2: pick('co2', ['co2', 'carbone'], r.co2) };
  });
  return { rooms: suivantes, trouves, parZone: parZoneN };
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
