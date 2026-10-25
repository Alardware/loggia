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
// L'appariement d'une Echo exposée deux fois (chantier Médias, M1, M14) : la jumelle que `cibleAlexa` retrouve, et ce que chaque intégration sait.
import { cibleAlexa, estEcho } from './favlecture.js';
import { integrationDe } from './telecommande.js';
import { BITS, estAlexa } from './lecteur.js';
import { horsAir, sondeDAppareil, sondeDeLaPiece } from './horsair.js';

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
 * Lecteurs multimedia : un appareil, une carte (chantier Médias, M1 B, M14 ;
 * ADR 0208).
 *
 * Une meme enceinte est souvent exposee DEUX fois : par son integration
 * d'origine, et par celle qui la pilote (Music Assistant, Alexa…). Quand les
 * deux entites portent le meme `device_id`, l'appareil les lie — c'etait deja la
 * regle. Chez lui, les deux integrations d'une Echo (« Alexa Devices »,
 * l'officielle, et `alexa_media_player`, celle de HACS) font DEUX appareils au
 * registre : rien ne les fusionnait, et Objets montrait quatorze cartes pour
 * sept appareils.
 *
 * LA PAIRE, dans l'ordre (§ 7.3 ; passe bis du 17/10) :
 *  1. la sœur du meme appareil (`pickSibling`, Music Assistant) ;
 *  2. l'EMPREINTE : les deux appareils partagent l'empreinte d'un identifiant
 *     (le numero de serie que les deux integrations ecrivent au registre, hache
 *     par le serveur — discovery.py). C'est le signal premier : il survit a un
 *     renommage, et une Echo ne porte pas le numero de serie d'une autre. Si
 *     PLUSIEURS lecteurs partagent l'empreinte, le doute : pas de paire ;
 *     PLUSIEURS lecteurs partagent l'empreinte, le doute : pas de paire — et la
 *     RECIPROCITE (passe bis 2) : la paire n'existe que si chacun des deux n'a
 *     qu'UN partenaire possible (A[X], B[X, Y], C[Y] : B en a deux, personne
 *     ne s'apparie, quel que soit l'ordre de la liste) ;
 *  3. a defaut seulement, le NOM (`cibleAlexa`, favlecture.js : l'un des deux
 *     identifiants finit par l'autre sur une frontiere de mot, ou les deux noms
 *     portent les memes mots), dans les deux sens et avec l'UNICITE — une
 *     jumelle que deux officielles revendiquent n'est appariee a aucune, une
 *     officielle qui en revendique deux non plus. Le nom n'apparie QUE la paire
 *     Alexa (passe bis 2) : une Echo OFFICIELLE qui revendique une jumelle de
 *     l'integration de HACS ; tout autre lecteur ne s'apparie jamais par le nom
 *     (un Sonos `salon` prenait la jumelle `echo_salon`, et la carte « Salon »
 *     commandait l'Echo). Deux appareils qui portent chacun leurs empreintes
 *     sans en partager aucune sont deux appareils : le nom ne les marie pas.
 * Dans le doute, pas de paire : deux cartes valent mieux qu'une enceinte
 * commandee a la place d'une autre (la relecture du 17/10 : deux Echo
 * officielles dont les identifiants finissaient pareil, plus une jumelle HACS au
 * nom par defaut, et la carte de la chambre commandait l'enceinte du bureau).
 *
 * Le JUMEAU (`ma`) est l'autre entite du meme appareil ; la carte garde pour
 * `haid` l'entite de l'integration officielle — jamais la jumelle HACS quand une
 * autre existe : ses sœurs « Annoncer » et ses capteurs sont a elle — et
 * `lireLecteur` (lecteur.js) designe celle qui commande. N'entrent PAS dans
 * Multimedia : l'entite d'un appareil de SERVICE (Spotify : une entree de
 * compte, pas un appareil) et celle d'un appareil qui porte une camera (le
 * haut-parleur d'une sonnette : Securite la garde par sa camera).
 *
 * Chaque lecteur dit aussi ce que la popup et l'annonce lisent (M9, M10, § 6.5) :
 * `alexa` (une Echo, par l'une ou l'autre integration : pas d'interrupteur),
 * `modele` (le genre, sous le nom), `annonce` (la `notify` « Annoncer » de
 * l'officielle, sur l'appareil) et `annonceHacs` (la jumelle qui sait le service
 * `notify.alexa_media`), `groupe` (un groupe d'enceintes : « Toute la maison »).
 *
 * Un compagnon designe par un suffixe ecrit en dur (`_2`) casserait au premier
 * renommage : rien ici ne lit un suffixe, sauf la regle de `cibleAlexa`, qui
 * compare les deux identifiants entre eux.
 */
/* Ce que seule une Echo PHYSIQUE porte, par l'une ou l'autre integration (sa copie
 * du registre, lue le 17/10) : « Parler » (`notify`), la prochaine alarme, la
 * prochaine minuterie, le prochain rappel (`sensor`), « Drop In » (`select`) — a
 * leurs cles de traduction, jamais a leurs noms. Un groupe d'enceintes n'a rien
 * de cela : il sait annoncer, il a sa connectivite, et c'est tout. */
const CLES_ECHO = { notify: ['speak'], sensor: ['alarm', 'timer', 'reminder', 'next_alarm', 'next_timer', 'next_reminder'], select: ['dropin'] };
/* Le modele qu'ecrivent les deux integrations pour un groupe d'enceintes (la
 * famille « WHA » de l'API d'Amazon) : « Speaker Group », verifie sur les deux
 * appareils de son groupe « Partout ». Une Echo dit « Echo Dot », « Echo ». */
const MODELE_GROUPE = /\bspeaker group\b/i;

export function resolveMedia({ index, caps, states = {}, userCfg = {} } = {}) {
  const meta = (id) => (index && index.entityMeta && index.entityMeta.get(id)) || null;
  const appareil = (id) => { const m = meta(id); return m && m.deviceId && index.deviceMeta ? index.deviceMeta.get(m.deviceId) || null : null; };
  const appareilId = (id) => { const m = meta(id); return (m && m.deviceId) || null; };
  const integration = (id) => integrationDe(id, index);
  // Hors Multimedia (M1) : un appareil de service, ou un appareil qui porte une camera.
  const horsMultimedia = (id) => {
    const d = appareil(id);
    if (!d) return false;
    if (d.entryType === 'service') return true;
    return siblingsOf(index, id).some(e => e.indexOf('camera.') === 0);
  };
  const liste = ((caps && caps.devices && caps.devices.media_player) || []).filter(p => !horsMultimedia(p.id));
  const ids = liste.map(p => p.id);
  // Les empreintes de l'appareil d'une entite (le serveur les pose pour un lecteur) ; vides sans le composant.
  const empreintes = (id) => { const d = appareil(id); return d && Array.isArray(d.empreintes) ? d.empreintes : []; };
  const memeAppareilPhysique = (a, b) => { const ea = empreintes(a); return ea.length > 0 && empreintes(b).some(e => ea.indexOf(e) >= 0); };
  // 2. Par l'empreinte : les autres lecteurs, d'un AUTRE appareil au registre, qui partagent une empreinte avec celui-ci.
  const parEmpreinte = (id) => ids.filter(autre => autre !== id && appareilId(autre) !== appareilId(id) && memeAppareilPhysique(id, autre));
  // 3. Par le nom (le repli) : qui revendique qui, pour l'unicite. `cibleAlexa` rend deja null quand une officielle en revendique deux —
  //    et il n'apparie que la paire Alexa : seule une officielle revendique, et seulement une jumelle de l'integration de HACS (passe bis 2).
  const revendications = new Map();
  ids.forEach(id => {
    const c = cibleAlexa(id, states, index);
    if (!c || c === id || ids.indexOf(c) < 0) return;
    if (!revendications.has(c)) revendications.set(c, []);
    revendications.get(c).push(id);
  });
  const parNom = (id) => {
    // Une jumelle HACS : l'officielle qui la revendique — si elle est seule a le faire.
    const pretendantes = revendications.get(id) || [];
    if (pretendantes.length) return pretendantes.length === 1 ? pretendantes[0] : null;
    // Une officielle : la jumelle qu'elle revendique, si personne d'autre ne la revendique.
    const c = cibleAlexa(id, states, index);
    if (!c || c === id || ids.indexOf(c) < 0) return null;
    return (revendications.get(c) || []).length === 1 ? c : null;
  };
  const jumeauDe = (id) => {
    const s = pickSibling(index, states, id, { domain: 'media_player' });
    if (s) return s;
    const e = parEmpreinte(id);
    /* La RECIPROCITE (passe bis 2, 17/10) : une paire par l'empreinte n'existe que si chacun des deux n'a QU'UN partenaire possible.
     * A[X], B[X, Y], C[Y] : B en a deux — selon l'ordre de la liste on obtenait A+B, C+B ou personne. Dans le doute, pas de paire,
     * et pas de repli par le nom non plus : l'empreinte a parle. */
    if (e.length === 1 && parEmpreinte(e[0]).length === 1) return e[0];
    if (e.length) return null;   // le doute : pas de paire
    const n = parNom(id);
    // Deux appareils qui portent chacun leurs empreintes sans en partager aucune sont deux appareils : le nom ne les marie pas.
    if (n && empreintes(id).length && empreintes(n).length) return null;
    return n;
  };
  // La sœur « Annoncer » de l'officielle (M9) : une `notify` du meme appareil, reconnue a sa cle de traduction.
  const annonceDe = (id) => (id ? siblingsOf(index, id).find(e => e.indexOf('notify.') === 0 && !!states[e] && meta(e) && meta(e).translationKey === 'announce') : null) || null;
  // L'appareil d'une entite porte-t-il ce que seule une Echo physique a (CLES_ECHO) ?
  const porteUneCleEcho = (id) => !!id && siblingsOf(index, id).some(e => {
    const cles = CLES_ECHO[e.slice(0, e.indexOf('.'))];
    const m = meta(e);
    return !!cles && !!m && cles.indexOf(m.translationKey) >= 0;
  });
  /* Un groupe d'enceintes (« Partout » : « Toute la maison », M9), lu sur les DEUX appareils de la paire. D'abord ce que le
   * registre dit qu'il est : le modele « Speaker Group » (MODELE_GROUPE) ; un modele connu qui dit autre chose (« Echo Dot ») est
   * une Echo. Sans modele au registre seulement, sa forme : ni l'un ni l'autre de ses appareils ne porte ce qu'une Echo a. Un groupe
   * n'est pas un appareil physique : une Echo a sa prochaine alarme, « Parler », « Drop In ». Home Assistant ne dit pas qui est
   * dans le groupe (aucun bit GROUPING) : on ne l'invente pas. */
  const groupeDe = (haid, ma) => {
    const modeles = [haid, ma].map(e => { const d = e ? appareil(e) : null; return d && d.model ? String(d.model) : null; }).filter(Boolean);
    if (modeles.length) return modeles.some(m => MODELE_GROUPE.test(m));
    return !porteUneCleEcho(haid) && !porteUneCleEcho(ma);
  };
  const enrichir = (p) => {
    const haid = p.haid, ma = p.ma || null;
    const d = appareil(haid);
    const alexa = estAlexa(integration(haid)) || (!!ma && estAlexa(integration(ma)));
    const annonce = annonceDe(haid) || annonceDe(ma);
    const annonceHacs = [haid, ma].find(e => e && estEcho(integration(e))) || null;
    return {
      ...p, ma, alexa,
      modele: (d && d.model) || null,
      annonce, annonceHacs,
      groupe: alexa && !!(annonce || annonceHacs) && groupeDe(haid, ma),
    };
  };

  const chosen = Array.isArray(userCfg.loggia_medias) ? userCfg.loggia_medias : null;
  if (chosen && chosen.length) {
    /* Un jumeau absent de la configuration est retrouve, pas invente — et jamais pris deux fois, ni parmi les cartes configurees
     * (la garde `pris`, passe bis 2) : deux cartes a la main pour les deux entites d'une Echo restent deux cartes, chacune la sienne.
     * Un jumeau ecrit dans la configuration, lui, est garde tel quel : la configuration l'emporte. */
    const pris = new Set(chosen.map(p => p && p.haid).filter(Boolean));
    const list = chosen.map(p => {
      let ma = p.ma || null;
      if (!ma) { const j = jumeauDe(p.haid); if (j && !pris.has(j)) ma = j; }
      if (ma) pris.add(ma);
      return enrichir({ ...p, ma });
    });
    return { available: true, source: 'utilisateur', list };
  }

  if (!liste.length) return { available: false, reason: 'aucun lecteur (domaine media_player)', list: [] };

  const pris = new Set();
  const out = [];
  const bits = (id) => Number(((states[id] || {}).attributes || {}).supported_features) || 0;
  liste.forEach(p => {
    if (pris.has(p.id)) return;
    pris.add(p.id);
    let haid = p.id, ma = jumeauDe(p.id);
    if (ma && pris.has(ma)) ma = null;
    if (ma) {
      pris.add(ma);
      /* L'officielle pour `haid` : jamais la jumelle HACS quand l'autre n'en est pas une. Sans HACS d'aucun cote (Music
       * Assistant), l'entite d'origine reste la premiere ; a defaut de tout signe, celle qui sait le moins de gestes garde la
       * carte, et l'autre commande (`lireLecteur`). */
      const hacs = (id) => estEcho(integration(id));
      if (hacs(haid) && !hacs(ma)) [haid, ma] = [ma, haid];
      else if (hacs(haid) === hacs(ma) && (bits(haid) & BITS.PLAY) && !(bits(ma) & BITS.PLAY)) [haid, ma] = [ma, haid];
    }
    const principal = liste.find(x => x.id === haid) || p;
    out.push(enrichir({ id: haid, haid, name: principal.name, area: principal.areaName || null, ma }));
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
 * Les modules fil pilote de la maison, en zones de chauffage (chantier
 * Chauffage, plan 2, choix 2). Le serveur reconnait un module a ce que l'ecran
 * ne voit pas — l'`unique_id` qui dit « pilot wire », ses options — et pose sa
 * `famille` dans l'index : l'ecran la lit, il ne la devine pas. Un `select`
 * sans etat n'est pas la : rien. Masque ou desactive dans Home Assistant non
 * plus — comme un thermostat masque, que la decouverte ecarte (`index.live`).
 *
 * Le nom est celui de l'APPAREIL, que l'utilisateur a donne (« Radiateur
 * Chambre ») : son `select` s'affiche sous ce nom suivi de celui de
 * l'exposition (« Radiateur Chambre Pilot wire mode » sous zigbee2mqtt). Le
 * serveur nomme le chauffage de meme (`chauffage.py`, `_etat_un`).
 *
 * Pas de consigne : un module ne connait que des ordres (Confort, Eco,
 * Hors-gel, Arret…). En inventer une ferait envoyer 19,5 a qui n'a rien regle.
 */
function zonesFilPilote(index, states) {
  const table = index && index.entityMeta;
  if (!table || typeof table.forEach !== 'function') return [];
  const out = [];
  table.forEach((m, id) => {
    if (!m || m.famille !== 'fil_pilote' || m.hidden || m.disabled || id.indexOf('select.') !== 0 || !states[id]) return;
    out.push({
      id, haid: id, name: m.device || (states[id].attributes || {}).friendly_name || m.name || id,
      // Le NOM de la piece, comme pour un thermostat (plus bas).
      room: (index.areaNameOf && index.areaNameOf(id)) || (index.areaOf && index.areaOf(id)) || null,
      type: 'pilot_wire', modeEnt: id, tempCible: null, hasAuto: false,
      tempSensor: pickSibling(index, states, id, { domain: 'sensor', deviceClass: 'temperature' })
        || areaTemp(index, states, id),
      // « Chauffe » se lit sur elle : un module ne dit pas s'il chauffe.
      puissance: pickSibling(index, states, id, { domain: 'sensor', deviceClass: 'power' }),
      decouvert: true,
    });
  });
  return out;
}

/** Les modules decouverts qu'une saisie ne decrit pas : une zone saisie qui
 * nomme deja leur `select` — en mode ou en entite — les represente. */
export function modulesHorsSaisie(saisie, zones) {
  return (zones || []).filter(z => z && z.decouvert
    && !(saisie || []).some(s => s && (s.modeEnt === z.modeEnt || s.haid === z.modeEnt)));
}

/* Les appareils qui portent un module fil pilote, releves une fois par index :
 * l'index ne change plus apres `buildIndex`, et Objets pose la question pour
 * chaque interrupteur de la maison a chaque rendu. */
const APPAREILS_FIL_PILOTE = new WeakMap();

/**
 * L'interrupteur d'un module fil pilote : un `switch` dont l'APPAREIL porte un
 * `select` de famille `fil_pilote`. Il alimente le module — le couper le rend
 * sourd a tout ordre. L'appareil est represente par sa zone de chauffage :
 * l'interrupteur n'a pas de carte a lui (plan 2, choix 2), il reste dans la
 * fiche de l'appareil.
 */
export function interrupteurDeModule(index, entityId) {
  const t = index && index.entityMeta;
  const m = t && typeof entityId === 'string' && entityId.indexOf('switch.') === 0 && t.get(entityId);
  if (!m || !m.deviceId) return false;
  if (!APPAREILS_FIL_PILOTE.has(t)) {
    const s = new Set();
    t.forEach((x, id) => { if (x && x.famille === 'fil_pilote' && id.indexOf('select.') === 0) s.add(x.deviceId); });
    APPAREILS_FIL_PILOTE.set(t, s);
  }
  return APPAREILS_FIL_PILOTE.get(t).has(m.deviceId);
}

/**
 * Chauffage. Deux familles coexistent : les thermostats du domaine `climate`,
 * pilotables tels quels, et les radiateurs fil pilote. Un module fil pilote se
 * decouvre par la famille que le serveur pose dans l'index (ci-dessus) ; des
 * aides (consigne, mode, auto) autour d'un `switch`, elles, seule une saisie
 * sait les decrire.
 *
 * La saisie est rendue TELLE QUELLE, et les modules qu'elle ne decrit pas la
 * completent (regle du 07/10 : une fiche complete la decouverte, jamais ne la
 * remplace). Les thermostats ne changent pas : une saisie les laisse au
 * registre, ou Objets les trouve.
 */
export function resolveClimate({ index, caps, states = {}, userCfg = {} } = {}) {
  const chosen = Array.isArray(userCfg.loggia_climate) ? userCfg.loggia_climate : null;
  const modules = zonesFilPilote(index, states);
  if (chosen && chosen.length) return { available: true, source: 'utilisateur', list: chosen.concat(modulesHorsSaisie(chosen, modules)) };
  const list = ((caps && caps.devices && caps.devices.climate) || []).map(c => ({
    // `room` porte un NOM : c'est ainsi que les vues rapprochent un appareil
    // d'une piece. Un area_id ne correspondrait a aucune piece configuree.
    id: c.id, haid: c.id, name: c.name, room: c.areaName || c.area || null, type: 'thermostat', hasAuto: false,
    tempSensor: pickSibling(index, states, c.id, { domain: 'sensor', deviceClass: 'temperature' })
      || areaTemp(index, states, c.id),
  })).concat(modules);
  if (!list.length) return { available: false, reason: 'aucun thermostat', list: [] };
  return { available: true, source: 'decouverte', list };
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
  /* L'air de la piece, pas celui d'un frigo (audit du 19/10, H9) : ni un
   * diagnostic, ni la sonde d'un appareil qui a un autre role — un frigo, une
   * prise, un chauffe-eau, un thermostat, un humidificateur (`horsAir`) — ; et,
   * parmi ce qui reste, une MESURE (`state_class: measurement`) d'abord. */
  const meta = (id) => (index.entityMeta && index.entityMeta.get(id)) || {};
  const parAppareil = new Map();
  if (index.entityMeta) index.entityMeta.forEach((m, id) => { if (m && m.deviceId) { if (!parAppareil.has(m.deviceId)) parAppareil.set(m.deviceId, []); parAppareil.get(m.deviceId).push(id); } });
  const soeurs = (id) => { const d = meta(id).deviceId; return d ? (parAppareil.get(d) || []).filter(e => e !== id) : []; };
  const deLAir = (id, piece) => { const d = meta(id).deviceId; return !horsAir(id, states, meta, d && index.deviceMeta ? index.deviceMeta.get(d) : null, soeurs(id), piece); };
  index.areaList.forEach(a => {
    let ambiance = 0;
    // Capteurs d'ambiance de la zone : de quoi remplir la carte d'une piece
    // sans que personne ait a designer une entite a la main.
    let co2 = null;
    const air = { temperature: [], humidity: [] };
    a.entities.forEach(id => {
      const d = id.slice(0, id.indexOf('.'));
      if (ROOM_DOMAINS.indexOf(d) >= 0) ambiance++;
      if (d !== 'sensor') return;
      const at = (states[id] && states[id].attributes) || {};
      if (air[at.device_class] && deLAir(id, a.name)) air[at.device_class].push(id);
      else if (!co2 && at.device_class === 'carbon_dioxide') co2 = id;
    });
    /* Un thermomètre à part d'abord, une mesure (`state_class`) en tête ; à défaut, la sonde du thermostat ou de l'humidificateur
     * (relecture du lot 3) : une pièce qui n'a qu'un tado garde sa température — celle que le thermostat affiche, jamais l'eau de sa
     * chaudière ni sa sonde du dehors (`sondeDeLaPiece`, contre-relecture). */
    const mesure = (l) => l.find(id => ((states[id] || {}).attributes || {}).state_class === 'measurement') || l[0] || null;
    const choisir = (l, classe) => mesure(l.filter(id => !sondeDAppareil(soeurs(id))))
      || sondeDeLaPiece(l.filter(id => sondeDAppareil(soeurs(id))), states, soeurs, meta, classe, a.name);
    const temp = choisir(air.temperature, 'temperature'), hum = choisir(air.humidity, 'humidity');
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
