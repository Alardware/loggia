/* ── Le distributeur de croquettes, ce qui se CALCULE (ADR 0155, 05/10) ──────
 *
 * La fiche du distributeur devient une feuille à onglets sur le modèle du
 * robot (Accueil, Planning, Historique, Entretien, roue Réglages). Ce fichier
 * porte tout ce qui s'y calcule ; pas de React, pas de Home Assistant : la vue
 * lui passe des entités déjà lues et la réponse du serveur
 * (`loggia/distributeurs/etat`), les tests aussi.
 *
 * Trois règles, toutes du 05/10 :
 *  - rien ne sort de l'APPAREIL désigné. « Distribuer » prenait le premier
 *    `select.*feed` de toute la maison, l'épingle le premier
 *    `number.*serving_size` : un aquarium à côté, et c'est lui qu'on nourrissait ;
 *  - un script deviné à son nom ne commande jamais : seul le script DÉSIGNÉ ;
 *  - une heure qu'on ne peut pas déduire ne s'invente pas : le prochain repas
 *    et les jours de réserve ne comptent que les heures FIXES.
 *
 * Les tables sont celles de `custom_components/loggia/distributeur_appareil.py`,
 * À L'IDENTIQUE : une seule fixture (`tests/fixtures/distributeurs.json`) les
 * fige des deux côtés — si le Python et le JS divergent, l'un des deux rougit.
 * Les motifs se testent sur le SUFFIXE en minuscules (la partie de l'entity_id
 * après le point), jamais sur le nom affiché, qui change avec la langue.
 */
import { tr, trN } from './i18n.js';
import { sansAccents } from './outils.js';
import { joursDeReserve } from './objets.js';
import { jourPlanning, heureValide, resumeJours, dureeLisible } from './robots.js';

/* ════════════ Les tables (égales à `tables` de la fixture, clé par clé) ════════════ */

export const TABLES = Object.freeze({
  CLES_BOUTON: ['feed', 'manual_feed'],
  MOTIF_SUFFIXE_FEED: '(^|_)(manual_)?feed(_now)?$|food_out$',
  MOTIF_EXCLU_BOUTON: 'plan|schedule|reset|cancel|enable|disable',
  CLES_NUMBER_ECRIT: ['feed', 'manual_feed'],
  PLATEFORMES_NUMBER_ECRIT: ['petkit', 'tuya', 'tuya_local'],
  MOTIF_NUMBER_REGLAGE: 'quantity|size|portion|weight',
  PREFIXE_TEXT_ECRIT: 'manual_feed',
  PLATEFORMES_TEXT_ECRIT: ['petkit'],
  MOTIF_SELECT_FEED: '_feed$',
  OPTION_START: 'START',
  DOMAINES_ACTION_APPAREIL: ['button', 'number', 'select', 'text'],
  CLES_PORTION: ['manual_feed_quantity', 'manual_portions', 'portions', 'serving_size'],
  MOTIF_SUFFIXE_PORTION: '(^|_)(serving_size|portions|manual_portions)$',
  CLES_POIDS_PORTION: ['portion_weight'],
  MOTIF_SUFFIXE_POIDS_PORTION: '(^|_)portion_weight$',
  CLES_PROGRAMME: { petlibro: ['feeding_schedule'], petkit: ['raw_distribution_data'], aqara_mode: ['feeding_mode'], tuya_local: ['meal_plan', 'schedule'] },
  MOTIF_MODE_Z2M: '_mode$',
  OPTIONS_MODE_Z2M: ['manual', 'schedule'],
  MOTIF_SCHEDULE_Z2M: '_schedule$',
  MODES: { manual: 'manuel', schedule: 'programme' },
  JOURS_Z2M: {
    everyday: [0, 1, 2, 3, 4, 5, 6], workdays: [0, 1, 2, 3, 4], weekend: [5, 6],
    mon: [0], tue: [1], wed: [2], thu: [3], fri: [4], sat: [5], sun: [6],
    'mon-wed-fri-sun': [0, 2, 4, 6], 'tue-thu-sat': [1, 3, 5],
  },
  JOURS_TUYA: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
  SERVICES_PETSAFE: ['petsafe.add_schedule'],
  SERVICE_TUYA_PROGRAMME: 'tuya.get_feeder_meal_plan',
  CLES_ANOMALIE_BAS: ['food_level', 'food_level_1', 'food_level_2', 'food_low', 'left_food_low', 'right_food_low', 'tank_empty'],
  CLES_ANOMALIE_BLOQUE: ['barn_door_error', 'door_blocked', 'error_detected', 'food_dispenser_state', 'food_outlet_state', 'rotor_stuck'],
  MOTIF_BAS: 'food_(low|shortage|empty|level)|hopper_low|not_enough_food|pet_food_left_level',
  MOTIF_BLOQUE: 'block|jam|stuck|clog',
  CLES_CONSOMMABLE: { deshydratant: ['desiccant_left_days', 'remaining_desiccant'], filtre: ['remaining_filter_days'], nettoyage: ['remaining_cleaning_days'] },
  UNITES_JOURS: ['d'],
  MOTIF_CONSOMMABLE: { deshydratant: 'desiccant', filtre: 'filter', nettoyage: 'clean' },
  MOTIF_CONSOMMABLE_PCT: { deshydratant: 'desiccant.*level', filtre: 'filter_percent' },
  CLES_RESET: { deshydratant: ['desiccant_reset', 'reset_desiccant'], filtre: ['filter_reset', 'reset_filter'], nettoyage: ['cleaning_reset'] },
  MOTIF_RESET: { deshydratant: 'reset.*desiccant|desiccant.*reset' },
  CLES_CONNECTIVITE: ['online'],
  CLES_EN_COURS: ['feeding'],
  CLES_PROCHAIN: ['next_feed_time'],
  MOTIF_PROCHAIN: '(^|_)next_feed(ing|_time)?$',
  CLES_DERNIER: ['last_feed_time', 'pet_last_meal_date'],
  MOTIF_DERNIER: '(^|_)last_feed(ing|_time)?$',
  CLES_COMPTEUR: ['manual_dispensed', 'planned_dispensed', 'portions_dispensed_today', 'times_dispensed', 'today_feeding_quantity_weight', 'today_feeding_times', 'total_dispensed', 'weight_dispensed_today'],
  MOTIF_COMPTEUR_Z2M: '(^|_)(portions_per_day|weight_per_day)$',
  CLES_SOURCE_REPAS: ['last_amount', 'last_feeding_size', 'last_feeding_source'],
  MOTIF_SOURCE_REPAS: '(^|_)feeding_(source|size)$',
});

const T = TABLES;
const rx = (motif, s) => new RegExp(motif).test(String(s == null ? '' : s));
const dans = (liste, v) => v != null && liste.indexOf(v) >= 0;
const nombre = (v) => { if (v == null || v === '') return null; const n = typeof v === 'number' ? v : parseFloat(v); return Number.isFinite(n) ? n : null; };
const estId = (v) => typeof v === 'string' && v.indexOf('.') > 0;
// Un identifiant DÉSIGNÉ, comme `_id` du Python : sans les blancs d'une saisie
// (05/10, contradicteur : « select.x » suivi d'un espace ne désignait plus rien
// côté écran, alors que le serveur le lisait).
const idDe = (v) => { const s = typeof v === 'string' ? v.trim() : ''; return s.indexOf('.') > 0 ? s : null; };
// Les clés de traduction se comparent en minuscules, comme `_cle` du Python.
const cleDe = (e) => String((e && e.cle) || '').toLowerCase();
// L'ordre des points de code, celui du `sorted()` de Python : `localeCompare`
// rangerait autrement « _ » et les chiffres, et la première sœur ne serait plus
// la même des deux côtés.
const parId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const muette = (st) => !st || st.state === 'unavailable';

/* ════════════ L'appareil et ses sœurs ════════════ */

/** Les entités désignées dans Paramètres, dans l'ordre où elles désignent
 * l'appareil, SANS DOUBLON (05/10, contradicteur : la même entité désignée
 * deux fois sur un autre appareil donnait deux notes « appareil divergent »). */
export function designees(cfg) {
  const c = (cfg && typeof cfg === 'object') ? cfg : {};
  const h = (c.haids && typeof c.haids === 'object') ? c.haids : {};
  return [...new Set([c.haid, h.portionWeight, h.distribuees, h.reservoir].map(idDe).filter(Boolean))];
}
/* Sans appareil, le script désigné est une sœur de plus, comme `designees` du Python. */
const scriptDesigne = (cfg) => { const s = idDe(cfg && cfg.script); return s && s.indexOf('script.') === 0 ? s : null; };

const meta = (index, id) => (index && index.entityMeta && typeof index.entityMeta.get === 'function' && index.entityMeta.get(id)) || null;

/**
 * L'appareil du distributeur : `cfg.appareil` s'il est donné ; sinon celui de
 * la première entité désignée qui en a un (haid > portion > compteur >
 * réservoir). Un réservoir en `input_number` n'a pas d'appareil : il ne
 * désigne rien, et ne diverge de rien. Un `appareil` fait de blancs n'en
 * désigne aucun (05/10, contradicteur : « Distribuer » disparaissait).
 */
export function appareilDistributeur(index, cfg) {
  const choisi = cfg && typeof cfg.appareil === 'string' ? cfg.appareil.trim() : '';
  if (choisi) return choisi;
  for (const id of designees(cfg)) { const m = meta(index, id); if (m && m.deviceId) return m.deviceId; }
  return null;
}

/** Une entité désignée posée sur un AUTRE appareil : ignorée, et signalée. */
export function notesAppareil(index, cfg, deviceId) {
  if (!deviceId) return [];
  return designees(cfg).filter(id => { const m = meta(index, id); return m && m.deviceId && m.deviceId !== deviceId; })
    .map(id => ({ code: 'appareil_divergent', entity_id: id }));
}

/**
 * Les sœurs : les entités de l'appareil, décrites une fois. Une entité MASQUÉE
 * en reste une — tuya-local masque son `meal_plan`, l'écarter ferait croire à
 * un appareil sans programme —, une DÉSACTIVÉE non (elle n'a pas d'état). Sans
 * appareil, les seules entités désignées.
 *
 * `{ id, domaine, objet, cle, categorie, classe, unite, etat, attributs,
 * plateforme, nom, texte }` — la forme de `decrireSoeurs` (robots.js), plus
 * `objet` en minuscules : c'est lui que les motifs regardent.
 */
export function soeursDistributeur(index, states, deviceId, cfg = null) {
  const S = states || {};
  const ids = [];
  if (deviceId) {
    if (index && index.entityMeta && typeof index.entityMeta.forEach === 'function') {
      index.entityMeta.forEach((m, id) => { if (m && m.deviceId === deviceId && !m.disabled) ids.push(id); });
    }
  } else {
    [...designees(cfg), scriptDesigne(cfg)].filter(Boolean).forEach(id => { const m = meta(index, id); if ((m && !m.disabled) || (!m && S[id])) ids.push(id); });
  }
  return [...new Set(ids)].map(id => decrire(index, S, id)).sort(parId);
}

function decrire(index, S, id) {
  const m = meta(index, id) || {};
  const st = S[id] || null;
  const a = (st && st.attributes) || {};
  const objet = id.slice(id.indexOf('.') + 1).toLowerCase();
  const appareil = sansAccents(m.device || '');
  let nom = String(a.friendly_name || m.name || objet);
  if (appareil && sansAccents(nom).indexOf(appareil) === 0 && nom.length > appareil.length + 1) nom = nom.slice(appareil.length).replace(/^[\s·:–-]+/, '');
  return {
    id, domaine: id.slice(0, id.indexOf('.')), objet, cle: m.translationKey || null, categorie: m.category || null,
    classe: a.device_class || m.deviceClass || null, unite: a.unit_of_measurement || null,
    etat: st ? st.state : null, attributs: a, plateforme: m.platform || null,
    nom: nom.charAt(0).toUpperCase() + nom.slice(1),
    texte: sansAccents((m.translationKey || '') + ' ' + objet),
  };
}

/* ════════════ La commande (règle R1) ════════════ */

const commandeDe = (s, domaine, service, donnees = {}, quantite = false) => {
  const a = s.attributs || {};
  return { domaine, service, entity_id: s.id, donnees, quantite,
    min: quantite && domaine === 'number' ? nombre(a.min) : null,
    max: quantite && domaine === 'number' ? nombre(a.max) : null,
    pas: quantite && domaine === 'number' ? nombre(a.step) : null };
};

/**
 * Ce qui distribue, parmi les SEULES sœurs — la première règle qui s'applique :
 *  1. un bouton `feed` / `manual_feed`, ou au suffixe `feed` / `food_out`
 *     (hors plan, schedule, reset, cancel, enable, disable) → `button.press` ;
 *  2. un number `feed` / `manual_feed` sur petkit, tuya, tuya_local →
 *     `number.set_value` : c'est l'ÉCRITURE qui distribue, jamais un curseur ;
 *  3. un text `manual_feed…` (PetKit) → `text.set_value` ;
 *  4. un select au suffixe `_feed` qui propose START (Zigbee2MQTT) ;
 *  5. le script DÉSIGNÉ dans Paramètres → `script.turn_on` ;
 *  6. sinon `null` : « Loggia ne sait pas commander ce distributeur ».
 * La commande de l'appareil passe avant le script désigné, comme le
 * « Distribuer » d'avant le 05/10. Un select feed muet garde ses options (des
 * attributs de capacité) : reconnu, il dit « ne répond plus », pas « ne sait
 * pas commander ». `states` est là pour la symétrie avec le Python.
 */
export function commandeDistribuer(soeurs, states, cfg) {
  const s = soeurs || [];
  for (const e of s) {
    if (e.domaine === 'button' && !rx(T.MOTIF_EXCLU_BOUTON, cleDe(e) + ' ' + e.objet)
      && (dans(T.CLES_BOUTON, cleDe(e)) || rx(T.MOTIF_SUFFIXE_FEED, e.objet))) return commandeDe(e, 'button', 'press');
  }
  for (const e of s) {
    if (e.domaine === 'number' && dans(T.CLES_NUMBER_ECRIT, cleDe(e)) && dans(T.PLATEFORMES_NUMBER_ECRIT, e.plateforme)
      && !rx(T.MOTIF_NUMBER_REGLAGE, cleDe(e))) return commandeDe(e, 'number', 'set_value', {}, true);
  }
  for (const e of s) {
    if (e.domaine === 'text' && cleDe(e).indexOf(T.PREFIXE_TEXT_ECRIT) === 0 && dans(T.PLATEFORMES_TEXT_ECRIT, e.plateforme)) {
      return commandeDe(e, 'text', 'set_value', {}, true);
    }
  }
  for (const e of s) {
    if (e.domaine !== 'select' || !rx(T.MOTIF_SELECT_FEED, e.objet)) continue;
    const opts = Array.isArray(e.attributs && e.attributs.options) ? e.attributs.options : [];
    // START, casse ignorée, comme `_option_start` du Python et `_est_start`
    // d'automatisations.py : l'écran et le serveur reconnaissent la MÊME
    // commande. L'option envoyée est celle de l'ENTITÉ — select_option refuse
    // une option qu'elle ne propose pas. (05/10, relecture « tests » : deux
    // correctifs croisés avaient laissé le JS exact et le Python sans casse ;
    // un « start » donnait au serveur une commande, à l'écran aucune.)
    const o = opts.find(x => typeof x === 'string' && x.trim().toUpperCase() === T.OPTION_START);
    if (o != null) return commandeDe(e, 'select', 'select_option', { option: o });
  }
  const sc = scriptDesigne(cfg);
  if (sc) return { domaine: 'script', service: 'turn_on', entity_id: sc, donnees: {}, quantite: false, min: null, max: null, pas: null };
  return null;
}

/**
 * La valeur écrite pour `n` portions : UNE PORTION = UN PAS de l'entité,
 * bornée — `min(max, max(min, n × pas))`. Écrire « 2 » dans le number en
 * grammes d'un PetKit au pas de 20 serait refusé, ou distribuerait 2 g.
 */
export function valeurPortions(commande, n) {
  if (!commande || !commande.quantite) return null;
  // Un pas nul ou absent vaut 1, comme le Python : « 0 » n'écrirait que le plancher.
  const pas = commande.pas > 0 ? commande.pas : 1;
  const min = commande.min != null ? commande.min : 1;
  let v = Math.max(min, (Math.max(1, Math.round(Number(n) || 1))) * pas);
  if (commande.max != null) v = Math.min(commande.max, v);
  return Math.round(v * 1000) / 1000;
}

/** L'appel complet pour `n` portions : `{ domaine, service, data }`. Un bouton
 * ou un select partent UNE fois, quel que soit `n` ; un script reçoit
 * `variables: { portions }` ; un text, la valeur en chaîne. */
export function envoiDistribuer(commande, n = 1) {
  if (!commande) return null;
  const k = Math.max(1, Math.round(Number(n) || 1));
  const data = { entity_id: commande.entity_id };
  if (commande.domaine === 'number') data.value = valeurPortions(commande, k);
  else if (commande.domaine === 'text') data.value = String(k);
  else if (commande.domaine === 'select') Object.assign(data, commande.donnees || {});
  else if (commande.domaine === 'script') data.variables = { portions: k };
  return { domaine: commande.domaine, service: commande.service, data };
}

/* ════════════ La portion, le mode, les cibles ════════════ */

/**
 * La taille de la portion : le number désigné (`haids.portionWeight`) s'il
 * existe, sinon la sœur number de clé ou de suffixe de portion. L'unité vient
 * de l'ENTITÉ — un `serving_size` d'Aqara compte des portions, jamais un « g »
 * en dur.
 * Le number désigné posé sur un AUTRE appareil est ignoré, comme côté serveur
 * (05/10, contradicteur : l'écran aurait réglé la portion de l'aquarium voisin).
 * `index` (LOGGIA_INDEX) dit où il est posé ; sans lui, on le croit — comme le
 * Python sans registre. Une sœur désignée sans état reste la portion.
 */
export function portionDistributeur(soeurs, states, cfg, deviceId = null, index = null) {
  const S = states || {};
  const pw = idDe(cfg && cfg.haids && cfg.haids.portionWeight);
  let e = null;
  if (pw && pw.indexOf('number.') === 0) {
    e = (soeurs || []).find(x => x.id === pw) || null;
    const ailleurs = (meta(index, pw) || {}).deviceId || null;
    if (!e && S[pw] && !(ailleurs && deviceId && ailleurs !== deviceId)) e = { id: pw, attributs: S[pw].attributes || {} };
  }
  if (!e) e = (soeurs || []).find(x => x.domaine === 'number' && dans(T.CLES_PORTION, cleDe(x))) || null;
  if (!e) e = (soeurs || []).find(x => x.domaine === 'number' && rx(T.MOTIF_SUFFIXE_PORTION, x.objet)) || null;
  if (!e) return null;
  const a = e.attributs || {};
  return { entity_id: e.id, unite: a.unit_of_measurement || null, min: nombre(a.min), max: nombre(a.max), pas: nombre(a.step) };
}

/** Le poids d'une portion (Aqara : `portion_weight`, en g). */
export function poidsPortion(soeurs) {
  const s = soeurs || [];
  const e = s.find(x => x.domaine === 'number' && dans(T.CLES_POIDS_PORTION, cleDe(x)))
    || s.find(x => x.domaine === 'number' && rx(T.MOTIF_SUFFIXE_POIDS_PORTION, x.objet));
  return e ? { entity_id: e.id, unite: (e.attributs && e.attributs.unit_of_measurement) || null } : null;
}

/** Le select du mode de distribution (Aqara : ZHA par sa clé, Zigbee2MQTT par son suffixe et ses options). */
export function selectMode(soeurs) {
  const s = soeurs || [];
  const cles = T.CLES_PROGRAMME.aqara_mode;
  // Les deux options attendues, AU MOINS (une option de plus ne l'écarte pas), comme le Python.
  const aLesModes = (e) => {
    const vues = new Set((Array.isArray(e.attributs && e.attributs.options) ? e.attributs.options : []).map(o => String(o).toLowerCase()));
    return T.OPTIONS_MODE_Z2M.every(o => vues.has(o));
  };
  return s.find(e => e.domaine === 'select' && (dans(cles, cleDe(e))
    || (e.plateforme === 'mqtt' && rx(T.MOTIF_MODE_Z2M, e.objet) && aLesModes(e))))
    || null;
}

/** Les cibles de COMMANDE : la commande, la portion, le mode et le script
 * désigné, triés. Jamais un capteur ni le réservoir : une automatisation qui
 * ne fait que lire le bac n'est pas un repas. */
export function ciblesDeCommande({ commande = null, portion = null, mode = null, cfg = null } = {}) {
  const reservoir = idDe(cfg && cfg.haids && cfg.haids.reservoir);
  const ids = [commande && commande.entity_id, portion && portion.entity_id, mode && mode.id, scriptDesigne(cfg)]
    .filter(id => id && id !== reservoir && !/^(binary_)?sensor\./.test(id));
  return [...new Set(ids)].sort();
}

/* ════════════ Anomalies, consommables, capteurs ════════════ */

/** Les anomalies (binary_sensor) : bac presque vide, distribution bloquée, ou
 * un autre problème sous son propre nom. Par la clé d'abord, quelle que soit
 * la classe ; sinon la classe `problem` exigée. */
export function anomaliesDistributeur(soeurs) {
  const out = [];
  (soeurs || []).forEach(e => {
    if (e.domaine !== 'binary_sensor') return;
    let type = null;
    if (dans(T.CLES_ANOMALIE_BAS, cleDe(e))) type = 'bas';
    else if (dans(T.CLES_ANOMALIE_BLOQUE, cleDe(e))) type = 'bloque';
    else if (e.classe === 'problem') type = rx(T.MOTIF_BAS, e.objet) ? 'bas' : rx(T.MOTIF_BLOQUE, e.objet) ? 'bloque' : 'autre';
    if (type) out.push({ entity_id: e.id, type, actif: e.etat === 'on' });
  });
  return out;
}

/**
 * L'alerte que la CARTE porte : la première anomalie ACTIVE, sous le mot de la
 * fiche (« Bac presque vide », « Distribution bloquée », sinon le nom de
 * l'entité). `{ type, entity_id, mot }` ou `null`. 05/10, relecture « écran » :
 * un Petlibro n'a pas de réservoir en % — rien ne passait au rouge, et le bac
 * presque vide ne se voyait qu'en ouvrant la fiche.
 */
export function alerteDistributeur(lecture) {
  const anomalies = lecture && Array.isArray(lecture.anomalies) ? lecture.anomalies : [];
  const a = anomalies.find(x => x && x.actif) || null;
  if (!a) return null;
  const soeur = (lecture && Array.isArray(lecture.soeurs) ? lecture.soeurs : []).find(s => s && s.id === a.entity_id);
  const mot = a.type === 'bas' ? tr('Bac presque vide') : a.type === 'bloque' ? tr('Distribution bloquée') : ((soeur && soeur.nom) || a.entity_id);
  return { type: a.type, entity_id: a.entity_id, mot };
}

/* Les mots d'un script qui distribue, ceux qu'on devinait avant le 05/10. */
const MOTS_SCRIPT = /(nourri|croquette|ration|gamelle|feed|distribu)/;

/**
 * Les scripts dont l'identifiant ou le nom dit qu'ils distribuent, triés : des
 * CANDIDATS que Paramètres PROPOSE en tête de la liste « Script de
 * distribution », jamais une commande (seul le script désigné en est une).
 * 05/10, relecture « données » : celui dont le script était deviné à son nom
 * perdait « Distribuer » et voyait ses automatisations réduites à des indices,
 * sans qu'un mot le lui dise.
 */
export function scriptsCandidats(states) {
  const S = states && typeof states === 'object' ? states : {};
  return Object.keys(S).filter(id => id.indexOf('script.') === 0 && MOTS_SCRIPT.test(sansAccents(
    id.slice(7) + ' ' + ((S[id] && S[id].attributes && S[id].attributes.friendly_name) || ''),
  ))).sort();
}

/** Les consommables (sensor) : déshydratant, filtre, nettoyage — en jours
 * restants ou en pourcentage —, et le bouton qui les remet à neuf. */
export function consommablesDistributeur(soeurs) {
  const s = soeurs || [];
  const out = [];
  s.forEach(e => {
    if (e.domaine !== 'sensor') return;
    // Comme `_role_consommable` du Python (05/10, contradicteur) : reconnu par
    // sa CLÉ, il se lit en % si son unité est « % » — un `remaining_desiccant`
    // en pourcentage ne devient pas « 62 jours ». La valeur est rendue telle
    // quelle, sans troncature : l'écran l'arrondit pour l'afficher.
    const u = (e.attributs && e.attributs.unit_of_measurement) || null;
    let role = Object.keys(T.CLES_CONSOMMABLE).find(r => dans(T.CLES_CONSOMMABLE[r], cleDe(e))) || null;
    let mesure = role ? (u === '%' ? 'pct' : 'jours') : null;
    if (!role && dans(T.UNITES_JOURS, u)) { role = Object.keys(T.MOTIF_CONSOMMABLE).find(r => rx(T.MOTIF_CONSOMMABLE[r], e.objet)) || null; mesure = 'jours'; }
    if (!role && u === '%') { role = Object.keys(T.MOTIF_CONSOMMABLE_PCT).find(r => rx(T.MOTIF_CONSOMMABLE_PCT[r], e.objet)) || null; mesure = 'pct'; }
    if (!role) return;
    const v = nombre(e.etat);
    // Le bouton de remise à neuf : par sa clé d'abord, sinon par son nom — deux passes, comme `_reset`.
    const reset = s.find(b => b.domaine === 'button' && dans(T.CLES_RESET[role] || [], cleDe(b)))
      || (T.MOTIF_RESET[role] ? s.find(b => b.domaine === 'button' && rx(T.MOTIF_RESET[role], b.objet)) : null);
    out.push({ entity_id: e.id, role, jours: mesure === 'jours' ? v : null, pct: mesure === 'pct' ? v : null, reset: reset ? reset.id : null });
  });
  return out;
}

const premier = (s, domaine, cles, motif = null) => {
  const e = (s || []).find(x => x.domaine === domaine && (dans(cles, cleDe(x)) || (motif && rx(motif, x.objet))));
  return e ? e.id : null;
};

/** Le capteur « en cours de distribution » (Tuya `feeding`), ou `null`. */
export const capteurEnCours = (soeurs) => premier(soeurs, 'binary_sensor', T.CLES_EN_COURS);
/** Le capteur « prochain repas » de l'appareil (horodatage), ou `null`. */
export const capteurProchain = (soeurs) => premier(soeurs, 'sensor', T.CLES_PROCHAIN, T.MOTIF_PROCHAIN);

/**
 * Ce que l'historique peut lire : le capteur du dernier repas, les compteurs
 * (du jour ou cumulés), les capteurs qui disent la source ou la taille du
 * dernier repas — et les entités `event` de l'appareil.
 */
export function sourcesHistorique(soeurs) {
  const s = soeurs || [];
  return {
    dernier: premier(s, 'sensor', T.CLES_DERNIER, T.MOTIF_DERNIER),
    compteurs: s.filter(e => e.domaine === 'sensor' && (dans(T.CLES_COMPTEUR, cleDe(e)) || rx(T.MOTIF_COMPTEUR_Z2M, e.objet))).map(e => e.id),
    evenements: s.filter(e => (e.domaine === 'sensor' && (dans(T.CLES_SOURCE_REPAS, cleDe(e)) || rx(T.MOTIF_SOURCE_REPAS, e.objet))) || e.domaine === 'event').map(e => e.id),
  };
}

/**
 * En ligne ? (ADR 0048 : hors ligne = liseré `o-panne`.) Dans cet ordre :
 *  - 'commande' : l'entité de commande `unavailable` ou absente (`unknown`
 *    est l'état normal d'un select feed de Zigbee2MQTT, pas une panne) ;
 *  - 'connectivite' : la connectivité de l'appareil (ou son entité `online`) à `off` ;
 *  - 'reservoir' : le réservoir désigné `unavailable` ou absent. Un réservoir
 *    `unknown` est SANS VALEUR, pas en panne : `health.js` sépare les deux.
 * Le réservoir seul ne suffisait plus : chez l'utilisateur, c'est un
 * `input_number` qui ne tombe jamais.
 */
export function enLigne(soeurs, states, cfg, commande = commandeDistribuer(soeurs, states, cfg)) {
  const S = states || {};
  if (commande && muette(S[commande.entity_id])) return { mort: true, raison: 'commande' };
  if ((soeurs || []).some(e => e.domaine === 'binary_sensor' && (e.classe === 'connectivity' || dans(T.CLES_CONNECTIVITE, cleDe(e))) && e.etat === 'off')) return { mort: true, raison: 'connectivite' };
  const r = cfg && cfg.haids && cfg.haids.reservoir;
  if (estId(r) && muette(S[r])) return { mort: true, raison: 'reservoir' };
  return { mort: false, raison: null };
}

/* ════════════ Les réglages ════════════ */

/* Ce qu'on règle d'abord sur un distributeur. Contrairement au robot, la voix,
 * le son et le voyant en font partie : sur un distributeur posé dans une
 * cuisine, l'annonce sonore de chaque repas est LE réglage qu'on cherche. */
const REGLAGE_DISTRIBUTEUR = /serving_size|manual_feed_quantity|portions?|portion_weight|mode|slow_feed|child_lock|lock|voice|sound|volume|led|light|indicator|desiccant_frequency/;

/**
 * Les réglages de l'appareil, sur le gabarit de `reglagesRobot` :
 * `{ principaux, autres }`, chaque réglage `{ id, domaine, type, nom, texte,
 * actif | valeur, options, min, max, pas, unite }`. `domaine` dit quel service
 * appeler — un voyant peut être une `light`, pas un `switch`. La commande de
 * distribution n'en est pas un : l'écrire DISTRIBUE.
 */
export function reglagesDistributeur(soeurs, commande = null) {
  const vivant = (s) => s.etat != null && s.etat !== 'unavailable' && s.etat !== 'unknown' && s.etat !== '';
  const exclu = commande ? commande.entity_id : null;
  const tous = (soeurs || []).filter(s => vivant(s) && s.id !== exclu && ['switch', 'light', 'select', 'number'].indexOf(s.domaine) >= 0).map(s => {
    const a = s.attributs || {};
    if (s.domaine === 'switch' || s.domaine === 'light') return { id: s.id, domaine: s.domaine, type: 'bascule', nom: s.nom, texte: s.texte, actif: s.etat === 'on' };
    if (s.domaine === 'select') return { id: s.id, domaine: 'select', type: 'choix', nom: s.nom, texte: s.texte, valeur: s.etat, options: Array.isArray(a.options) ? a.options : [] };
    return { id: s.id, domaine: 'number', type: 'nombre', nom: s.nom, texte: s.texte, valeur: nombre(s.etat), min: nombre(a.min), max: nombre(a.max), pas: nombre(a.step) || 1, unite: s.unite || null };
  }).filter(r => r.type !== 'choix' || r.options.length > 1).filter(r => r.type !== 'nombre' || r.valeur != null);
  const principaux = tous.filter(r => REGLAGE_DISTRIBUTEUR.test(r.texte)).slice(0, 8);
  const pris = new Set(principaux.map(r => r.id));
  return { principaux, autres: tous.filter(r => !pris.has(r.id)) };
}

/* ════════════ Tout l'appareil, d'un coup ════════════ */

/**
 * Ce que la carte et la fiche lisent de l'appareil, en un appel :
 * `{ appareil, notes, soeurs, commande, portion, poidsPortion, mode, cibles,
 * anomalies, alerte, consommables, enLigne, enCours, distribue, prochainCapteur,
 * historique, reglages }`. `index` est `LOGGIA_INDEX` (son `entityMeta`),
 * `cfg` la clé `loggia_feeder` telle quelle.
 */
export function lireDistributeur(index, states, cfg) {
  const S = states || {};
  const appareil = appareilDistributeur(index, cfg);
  const soeurs = soeursDistributeur(index, S, appareil, cfg);
  const commande = commandeDistribuer(soeurs, S, cfg);
  const portion = portionDistributeur(soeurs, S, cfg, appareil, index);
  const mode = selectMode(soeurs);
  const enCours = capteurEnCours(soeurs);
  const anomalies = anomaliesDistributeur(soeurs);
  return {
    appareil, notes: notesAppareil(index, cfg, appareil), soeurs, commande, portion, poidsPortion: poidsPortion(soeurs), mode,
    cibles: ciblesDeCommande({ commande, portion, mode, cfg }),
    anomalies, alerte: alerteDistributeur({ anomalies, soeurs }), consommables: consommablesDistributeur(soeurs),
    enLigne: enLigne(soeurs, S, cfg, commande), enCours, distribue: !!enCours && !!S[enCours] && S[enCours].state === 'on',
    prochainCapteur: capteurProchain(soeurs), historique: sourcesHistorique(soeurs), reglages: reglagesDistributeur(soeurs, commande),
  };
}

/* ════════════ Le bac, la portion en grammes ════════════ */

const enGrammes = (v, u) => (v == null ? null : u === 'kg' ? v * 1000 : u === 'g' || u == null || u === '' ? v : null);

/**
 * Le niveau du bac : `{ pct, grammes }`. En %, le pourcentage est la valeur et
 * les grammes ne se savent pas (la contenance n'est écrite nulle part) ; en g
 * (ou sans unité, l'ancienne aide en grammes), le pourcentage se rapporte au
 * maximum que l'aide déclare, `maxDefaut` sinon.
 */
export function niveauDuBac(states, reservoir, maxDefaut = 1500) {
  const st = estId(reservoir) && states ? states[reservoir] : null;
  const v = st ? nombre(st.state) : null;
  if (v == null) return { pct: null, grammes: null };
  const a = st.attributes || {};
  const u = a.unit_of_measurement || null;
  if (u === '%') return { pct: Math.max(0, Math.min(100, Math.round(v))), grammes: null };
  const g = enGrammes(v, u);
  const max = enGrammes(nombre(a.max), u);
  const plein = max > 0 ? max : maxDefaut;
  return { pct: g == null ? null : Math.max(0, Math.min(100, Math.round(g / plein * 100))), grammes: g };
}

/**
 * Combien de grammes fait une portion, et combien de portions part un appui :
 *  - une portion réglée en g (la démo, un number « portion » en grammes) :
 *    un appui = cette quantité ;
 *  - un poids de portion (Aqara `portion_weight`, en g) : g par portion, et la
 *    taille de portion (sans unité) dit combien de portions part un appui ;
 *  - rien de tel : `null` — les jours de réserve ne se devinent pas.
 */
export function mesurePortion(states, portion, poids) {
  const S = states || {};
  const val = (o) => (o && S[o.entity_id] ? nombre(S[o.entity_id].state) : null);
  const vp = val(portion);
  if (portion && vp != null && (portion.unite === 'g' || portion.unite === 'kg')) return { grammesParPortion: enGrammes(vp, portion.unite), portionsParAppui: 1 };
  const vg = poids && (poids.unite === 'g' || poids.unite === 'kg') ? enGrammes(val(poids), poids.unite) : null;
  if (vg == null || !(vg > 0)) return null;
  return { grammesParPortion: vg, portionsParAppui: portion && !portion.unite && vp > 0 ? vp : 1 };
}

/* ════════════ Les repas à heure fixe ════════════ */

const toutesLesJours = [0, 1, 2, 3, 4, 5, 6];
const joursValides = (j) => (Array.isArray(j) ? j.filter(x => Number.isInteger(x) && x >= 0 && x <= 6) : null);

/**
 * Les repas à HEURE FIXE de chaque source ACTIVE, d'après la réponse du
 * serveur : `[{ heure, jours, portions, source, nom, conditionnel, id }]`.
 *  - le programme de l'appareil, s'il est lisible et actif : ses créneaux allumés ;
 *  - les automatisations allumées : leurs `heures` (le serveur n'y range que
 *    les heures fixes : ni soleil, ni périodique, ni helper vide) ;
 *  - le planning de Loggia, seulement si aucune source supérieure n'est
 *    active : sinon le serveur le RETIENT au départ (« En pause »).
 * `allumee(a)` lit l'état d'une automatisation : par défaut celui de la
 * réponse ; la fiche passe l'état vivant (et la demande en vol) de `hass`.
 */
export function repasActifs(etat, { allumee = null } = {}) {
  if (!etat || typeof etat !== 'object') return [];
  const on = typeof allumee === 'function' ? allumee : (a) => a.etat === 'on';
  const out = [];
  const p = etat.programme;
  const progActif = !!(p && p.lisible && p.active);
  if (progActif) {
    (p.repas || []).forEach((r, i) => {
      if (r && r.actif && heureValide(r.heure)) out.push({ heure: r.heure, jours: joursValides(r.jours) || toutesLesJours, portions: nombre(r.portions), source: 'appareil', nom: null, conditionnel: false, id: 'p' + i });
    });
  }
  const autos = Array.isArray(etat.automatisations) ? etat.automatisations : [];
  let autoActive = false;
  autos.forEach(a => {
    if (!a || !on(a)) return;
    autoActive = true;
    (Array.isArray(a.heures) ? a.heures : []).filter(heureValide).forEach(h => {
      out.push({ heure: h, jours: joursValides(a.jours) || toutesLesJours, portions: nombre(a.portions), source: 'automatisations', nom: a.nom || null, conditionnel: !!a.conditionnel, id: a.entity_id + '@' + h });
    });
  });
  const sup = etat.sources && typeof etat.sources === 'object'
    ? !!((etat.sources.programme && etat.sources.programme.active) || (etat.sources.automatisations && etat.sources.automatisations.active) || autoActive)
    // Sans `sources` : le programme ACTIF, lisible ou non (« active » au sens de l'ADR 0155).
    : !!(p && p.active) || autoActive;
  if (!sup) {
    const pl = etat.planning && Array.isArray(etat.planning.repas) ? etat.planning.repas : [];
    pl.forEach(r => {
      if (r && r.actif && heureValide(r.heure)) out.push({ heure: r.heure, jours: joursValides(r.jours) || toutesLesJours, portions: nombre(r.portions), source: 'loggia', nom: null, conditionnel: false, id: r.id || r.heure });
    });
  }
  return out;
}

const minutesDe = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + m; };

/**
 * Le prochain repas : la première échéance STRICTEMENT après `maintenant`
 * parmi les repas à heure fixe des sources actives ; à défaut, le capteur
 * « prochain repas » de l'appareil (`capteur`, son horodatage). `null` sinon :
 * une heure qu'on ne peut pas déduire ne s'invente pas.
 * `{ date, heure, source, nom, portions, conditionnel }`, `source` valant
 * 'appareil' | 'automatisations' | 'loggia' | 'capteur'.
 */
export function prochainRepas(etat, maintenant = Date.now(), { allumee = null, capteur = null } = {}) {
  const m = new Date(maintenant);
  let mieux = null;
  repasActifs(etat, { allumee }).forEach(r => {
    const min = minutesDe(r.heure);
    const jours = new Set(r.jours);
    const le = (k) => new Date(m.getFullYear(), m.getMonth(), m.getDate() + k, Math.floor(min / 60), min % 60, 0, 0);
    // Huit jours : si l'heure d'aujourd'hui est passée, le même jour revient dans sept.
    const k = [0, 1, 2, 3, 4, 5, 6, 7].find(n => le(n).getTime() > m.getTime() && jours.has(jourPlanning(le(n))));
    if (k == null) return;
    if (!mieux || le(k).getTime() < mieux.date.getTime()) mieux = { date: le(k), heure: r.heure, source: r.source, nom: r.nom, portions: r.portions, conditionnel: r.conditionnel };
  });
  if (mieux) return mieux;
  const t = capteur ? Date.parse(capteur) : NaN;
  if (!isNaN(t) && t > m.getTime()) {
    const d = new Date(t);
    return { date: d, heure: String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'), source: 'capteur', nom: null, portions: null, conditionnel: false };
  }
  return null;
}

/**
 * Les repas d'une journée moyenne, en grammes, pour `joursDeReserve` :
 * `[{ g }]`. g = portions × grammes d'une portion, sur les seuls repas à heure
 * fixe des sources ACTIVES ; un repas qui ne part que certains jours compte au
 * prorata de la semaine. Un appui (bouton, select START, script) part
 * `portionsParAppui` portions, quel que soit le repas. Sans mesure de portion :
 * `[]`, et la fiche dit « Ce qu'il reste dans le bac ».
 */
export function repasPourReserve(etat, mesure, { allumee = null } = {}) {
  if (!mesure || !(mesure.grammesParPortion > 0)) return [];
  const parAppui = mesure.portionsParAppui > 0 ? mesure.portionsParAppui : 1;
  const ecrit = !!(etat && etat.commande && etat.commande.quantite);
  return repasActifs(etat, { allumee }).map(r => {
    // Le planning de Loggia ne fixe une quantité que si la commande l'ÉCRIT ;
    // sinon une pression = une ration.
    const portions = r.source === 'loggia' ? (ecrit && r.portions > 0 ? r.portions : parAppui) : (r.portions > 0 ? r.portions : parAppui);
    return { g: Math.round(portions * mesure.grammesParPortion * (new Set(r.jours).size / 7) * 10) / 10 };
  });
}

/** Les jours de réserve du bac : `null` quand on ne sait pas. */
export function joursDeReserveDistributeur(grammes, etat, mesure, options = {}) {
  return joursDeReserve(grammes, repasPourReserve(etat, mesure, options));
}

/* ════════════ Le Planning : ce qui s'affiche, et ses états vides ════════════ */

/**
 * Ce que l'onglet Planning montre, d'après la réponse du serveur :
 * `{ vide, blocs: { programme, automatisations, loggia }, deuxSources, pause,
 * peutAjouter, miseEnGarde, ancienneListe }`.
 * `vide` vaut 'indisponible' (serveur muet : HA pas redémarré), 'sans_commande'
 * (ni bloc ni commande : « Loggia ne sait pas commander… »), 'aucun' (une
 * commande, rien de programmé), ou `null` quand un bloc s'affiche.
 * « Deux sources » ne s'allume que pour un programme LISIBLE actif à côté
 * d'automatisations actives : un programme illisible ne crie pas au loup.
 * Ajouter un repas : seulement si le serveur le permet (`peutPlanifier` :
 * aucune source PRÉSENTE et une commande) ET si le compte n'est pas ordinaire
 * (ADR 0144) ; la mise en garde fixe quand le programme de l'appareil est inconnu.
 */
export function planningAffiche(etat, { ordinaire = false, allumee = null } = {}) {
  const sans = { programme: false, automatisations: false, loggia: false };
  if (!etat || typeof etat !== 'object') return { vide: 'indisponible', blocs: sans, deuxSources: false, pause: false, peutAjouter: false, miseEnGarde: false, ancienneListe: false };
  const on = typeof allumee === 'function' ? allumee : (a) => a.etat === 'on';
  const p = etat.programme || null;
  const autos = Array.isArray(etat.automatisations) ? etat.automatisations.filter(Boolean) : [];
  const repasLoggia = etat.planning && Array.isArray(etat.planning.repas) ? etat.planning.repas : [];
  const blocs = {
    programme: !!(p && p.source && (p.presente || p.mode != null || p.note === 'capteur_diagnostic' || p.note === 'non_lisible')),
    automatisations: autos.length > 0,
    loggia: repasLoggia.length > 0,
  };
  const autoActive = autos.some(on);
  const progLisibleActif = !!(p && p.lisible && p.active);
  const peutAjouter = !!etat.peutPlanifier && !ordinaire;
  const rien = !blocs.programme && !blocs.automatisations && !blocs.loggia;
  return {
    vide: rien ? (etat.commande ? 'aucun' : 'sans_commande') : null,
    blocs,
    deuxSources: progLisibleActif && autoActive,
    pause: blocs.loggia && (progLisibleActif || autoActive || !!(etat.sources && ((etat.sources.programme && etat.sources.programme.active) || (etat.sources.automatisations && etat.sources.automatisations.active)))),
    peutAjouter,
    miseEnGarde: peutAjouter && !!p && p.connu === false,
    // « Votre ancienne liste ne distribuait rien par elle-même. », quand le
    // planning de Loggia est proposé — et seulement s'il reste un repas qui
    // n'était relié à RIEN (05/10, relecture « données ») : une liste dont
    // tous les repas étaient reliés à des automatisations distribuait, même
    // si ces automatisations, renommées ou supprimées dans HA, ne se voient
    // plus ; la phrase y serait fausse.
    ancienneListe: peutAjouter && !!(etat.ancienne_liste && Number(etat.ancienne_liste.n) > (Number(etat.ancienne_liste.relies) || 0)),
  };
}

/* ════════════ Les libellés d'heure et de jours ════════════ */

// Le moins typographique, et le plus : une table plutôt qu'un ternaire de deux
// chaînes, que la garde des deux-points collés (deux_points.test) prendrait
// pour un libellé collé à sa valeur.
const SIGNES = ['−', '+'];

/** « +30 min », « −1 h 15 » ; rien pour un décalage nul. */
export function libelleDecalage(minutes) {
  const n = Math.round(Number(minutes) || 0);
  if (!n) return '';
  return SIGNES[n > 0 ? 1 : 0] + dureeLisible(Math.abs(n));
}

/** Le libellé d'un déclencheur résumé par le serveur. */
export function libelleDeclencheur(d) {
  if (!d || typeof d !== 'object') return tr('Déclenchée autrement');
  if (d.type === 'heure' && heureValide(d.heure)) return d.heure;
  if (d.type === 'soleil') {
    const dec = libelleDecalage(d.decalage);
    if (d.evenement === 'sunset') return dec ? tr('Coucher du soleil {d}', { d: dec }) : tr('Coucher du soleil');
    return dec ? tr('Lever du soleil {d}', { d: dec }) : tr('Lever du soleil');
  }
  const n = Number(d.toutes);
  if (d.type === 'periodique' && n > 0) return trN(n, 'Toutes les {n} h', 'Toutes les {n} h');
  return tr('Déclenchée autrement');
}

/**
 * Les heures d'une automatisation, telles que sa ligne les dit :
 * « 07:30 · 19:00 », sinon ses déclencheurs (« Lever du soleil −30 min »,
 * « Toutes les 8 h », « Déclenchée autrement »), « Sans heure fixe » sans
 * déclencheur lisible.
 */
export function libelleHeures(a) {
  const heures = a && Array.isArray(a.heures) ? a.heures.filter(heureValide) : [];
  const autres = (a && Array.isArray(a.declencheurs) ? a.declencheurs : []).filter(d => !(d && d.type === 'heure' && heureValide(d.heure))).map(libelleDeclencheur);
  const tout = [...new Set([...heures, ...autres])];
  return tout.length ? tout.join(' · ') : tr('Sans heure fixe');
}

/** Les jours, dans l'ordre de la langue : `null` = tous les jours. */
export function libelleJours(jours, premier = 1, loc = 'fr-FR') {
  const j = joursValides(jours);
  return j == null ? tr('Tous les jours') : resumeJours(j, premier, loc);
}

/* ════════════ L'historique ════════════ */

/* La source d'un repas d'après ce que l'appareil en dit (`last_feeding_source`
 * d'Aqara, `feeding_source` de Zigbee2MQTT) : programmé, manuel (le bouton de
 * l'appareil), à distance (l'application, ou Home Assistant). */
export function sourceDeValeur(v) {
  const s = String(v == null ? '' : v).toLowerCase();
  if (/schedul|plan|timer|auto/.test(s)) return 'programme';
  if (/manual|button|key|local/.test(s)) return 'manuel';
  if (/remote|app|cloud/.test(s)) return 'distance';
  return null;
}
const RANG_SOURCE = { loggia: 0, automatisation: 1, programme: 2, manuel: 3, distance: 4 };
const tempsDe = (e) => Date.parse((e && (e.last_changed || e.last_updated)) || '');

/**
 * Les repas des derniers jours, reconstruits depuis l'historique de Home
 * Assistant (`history/period`, `brut` : une liste par entité) :
 *  - une hausse de COMPTEUR = un repas (la remise à zéro de minuit n'en est
 *    pas un ; un compteur qui retombe SANS passer par zéro a repris à zéro
 *    puis compté : un repas de sa nouvelle valeur) ;
 *  - un changement du capteur « dernier repas » = un repas, à SON heure ;
 *  - une entité `event` qui change = un repas ;
 *  - un `last_triggered` d'automatisation reconnue (son historique AVEC
 *    attributs) = un repas ;
 *  - un « distribuer » du journal de Loggia = un repas.
 * Ce qui tombe dans la même `fenetre` (2 min) est UN repas : le compteur, le
 * capteur et l'automatisation qui l'a lancé disent le même. Sa source, la plus
 * précise : Loggia, l'automatisation, sinon ce que l'appareil en dit.
 * `[{ t, source, quantites: [{ valeur, unite }], grammes, origines }]`, du plus
 * récent au plus ancien. `states` donne les unités (l'historique minimal n'a
 * pas d'attributs).
 */
export function repasDepuisHistorique(brut, {
  compteurs = [], dernier = null, evenements = [], automatisations = [], journal = [],
  states = {}, depuis = null, maintenant = Date.now(), fenetre = 120000,
} = {}) {
  const listes = new Map();
  (Array.isArray(brut) ? brut : []).forEach(l => {
    if (!Array.isArray(l) || !l.length) return;
    const id = l[0] && l[0].entity_id;
    if (id) listes.set(id, l.filter(e => e && !isNaN(tempsDe(e))).sort((a, b) => tempsDe(a) - tempsDe(b)));
  });
  const S = states || {};
  const brutes = [];
  const pousser = (t, source, origine, q = null) => { if (!isNaN(t)) brutes.push({ t, source, origine, q }); };

  (compteurs || []).forEach(id => {
    const unite = (S[id] && S[id].attributes && S[id].attributes.unit_of_measurement) || null;
    let avant = null;
    (listes.get(id) || []).forEach(e => {
      const v = nombre(e.state);
      if (v == null) return; // muet : la valeur d'avant reste la référence
      if (avant != null) {
        // La hausse ; sinon, retombé sans passer par zéro, sa nouvelle valeur ;
        // sinon (égal, ou remis à zéro) rien. Écrit sans « > … < » sur une ligne :
        // rien_en_francais y lirait un nœud de texte JSX.
        const delta = Math.max(0, v - avant) || ((avant - v) && v);
        if (delta > 0) pousser(tempsDe(e), null, id, { id, valeur: Math.round(delta * 1000) / 1000, unite });
      }
      avant = v;
    });
  });
  const parHorodatage = (id, source) => {
    const vus = new Set();
    (listes.get(id) || []).forEach(e => {
      const t = Date.parse(e.state);
      if (isNaN(t) || vus.has(t)) return;
      vus.add(t); pousser(t, source, id);
    });
  };
  if (dernier) parHorodatage(dernier, null);
  (evenements || []).filter(id => String(id).indexOf('event.') === 0).forEach(id => parHorodatage(id, null));
  (automatisations || []).forEach(id => {
    const vus = new Set();
    (listes.get(id) || []).forEach(e => {
      const t = Date.parse((e.attributes && e.attributes.last_triggered) || '');
      if (isNaN(t) || vus.has(t)) return;
      vus.add(t); pousser(t, 'automatisation', id);
    });
  });
  // `regles.agir` note « distribuer » même quand RIEN n'est parti — commande
  // refusée par Home Assistant, entité gelée : `n` vaut alors 0 (05/10,
  // contradicteur). Un repas qui n'est pas parti n'entre pas dans l'historique.
  (Array.isArray(journal) ? journal : []).forEach(j => {
    if (j && j.module === 'distributeurs' && j.quoi === 'distribuer' && !j.simule && Number(j.ts) > 0
      && (j.n == null || Number(j.n) > 0)) pousser(Number(j.ts) * 1000, 'loggia', 'journal');
  });

  // Ce que l'appareil dit de la source du dernier repas, à l'heure d'un repas.
  const capteursSource = (evenements || []).filter(id => String(id).indexOf('sensor.') === 0 && /source/.test(id));
  const sourceA = (t) => {
    for (const id of capteursSource) {
      const l = (listes.get(id) || []).filter(e => tempsDe(e) <= t + fenetre);
      const s = l.length ? sourceDeValeur(l[l.length - 1].state) : null;
      if (s) return s;
    }
    return null;
  };

  const lignes = [];
  brutes.sort((a, b) => a.t - b.t).forEach(b => {
    const l = lignes.length ? lignes[lignes.length - 1] : null;
    if (l && b.t - l.t0 <= fenetre) {
      if (b.source && (!l.source || RANG_SOURCE[b.source] < RANG_SOURCE[l.source])) l.source = b.source;
      if (b.origine !== 'journal' && l.origines.indexOf(b.origine) < 0) l.origines.push(b.origine);
      if (b.q) l.q.push(b.q);
      return;
    }
    lignes.push({ t0: b.t, t: b.t, source: b.source, origines: b.origine === 'journal' ? [] : [b.origine], q: b.q ? [b.q] : [] });
  });
  const fin = (maintenant instanceof Date ? maintenant.getTime() : Number(maintenant)) + fenetre;
  const debut = depuis == null ? -Infinity : (depuis instanceof Date ? depuis.getTime() : Number(depuis));
  return lignes.filter(l => l.t >= debut && l.t <= fin).map(l => {
    // Plusieurs hausses du même compteur s'additionnent ; deux compteurs de même unité disent la même chose.
    const parId = new Map();
    l.q.forEach(q => parId.set(q.id, { valeur: (parId.has(q.id) ? parId.get(q.id).valeur : 0) + q.valeur, unite: q.unite }));
    const parUnite = new Map();
    parId.forEach(q => { const k = q.unite || ''; if (!parUnite.has(k) || parUnite.get(k).valeur < q.valeur) parUnite.set(k, q); });
    const quantites = [...parUnite.values()].map(q => ({ valeur: Math.round(q.valeur * 1000) / 1000, unite: q.unite }));
    const g = quantites.find(q => q.unite === 'g' || q.unite === 'kg');
    return { t: l.t, source: l.source || sourceA(l.t), quantites, grammes: g ? enGrammes(g.valeur, g.unite) : null, origines: l.origines };
  }).sort((a, b) => b.t - a.t);
}

const minuit = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d; };

/** La semaine en cours, du premier jour de la langue au dernier : un jour par
 * barre, le nombre de repas et, si l'appareil les compte, les grammes. */
export function resumeSemaineRepas(lignes, maintenant = Date.now(), premier = 1) {
  const auj = minuit(maintenant);
  const recul = (auj.getDay() - (premier % 7) + 7) % 7;
  const debut = new Date(auj); debut.setDate(debut.getDate() - recul);
  const jours = Array.from({ length: 7 }, (_, i) => { const d = new Date(debut); d.setDate(d.getDate() + i); return { date: d, n: 0, grammes: 0, aujourdhui: d.getTime() === auj.getTime() }; });
  const limite = new Date(debut); limite.setDate(limite.getDate() + 7);
  const dansSemaine = (lignes || []).filter(l => l && l.t >= debut.getTime() && l.t < limite.getTime());
  const aGrammes = dansSemaine.some(l => l.grammes != null);
  dansSemaine.forEach(l => {
    const j = jours.find(x => minuit(l.t).getTime() === x.date.getTime());
    if (j) { j.n += 1; j.grammes += l.grammes || 0; }
  });
  if (!aGrammes) jours.forEach(j => { j.grammes = null; });
  return { jours, n: dansSemaine.length, grammes: aGrammes ? dansSemaine.reduce((s, l) => s + (l.grammes || 0), 0) : null };
}

/**
 * Le dernier repas, pour la tuile de l'Accueil : le capteur « dernier repas »
 * de l'appareil, sinon le compteur du jour (sa dernière hausse, s'il a compté
 * quelque chose aujourd'hui), sinon le dernier déclenchement d'une
 * automatisation RECONNUE (un indice n'est pas une preuve de repas).
 * `{ t, source: 'capteur' | 'compteur' | 'automatisation' }` ou `null`.
 */
export function dernierRepas(lecture, states, etat = null, maintenant = Date.now()) {
  const S = states || {};
  const h = (lecture && lecture.historique) || {};
  const fin = (maintenant instanceof Date ? maintenant.getTime() : Number(maintenant)) + 60000;
  const t = h.dernier && S[h.dernier] ? Date.parse(S[h.dernier].state) : NaN;
  if (!isNaN(t) && t <= fin) return { t, source: 'capteur' };
  for (const id of h.compteurs || []) {
    const e = S[id];
    const v = e ? nombre(e.state) : null;
    const tc = e ? Date.parse(e.last_changed || '') : NaN;
    if (v > 0 && !isNaN(tc) && tc >= minuit(maintenant).getTime()) return { t: tc, source: 'compteur' };
  }
  let mieux = null;
  (etat && Array.isArray(etat.automatisations) ? etat.automatisations : []).forEach(a => {
    if (!a || a.indice) return;
    const vivant = S[a.entity_id] && S[a.entity_id].attributes ? S[a.entity_id].attributes.last_triggered : null;
    [a.dernier, vivant].forEach(x => { const ta = Date.parse(x || ''); if (!isNaN(ta) && ta <= fin && (mieux == null || ta > mieux)) mieux = ta; });
  });
  return mieux == null ? null : { t: mieux, source: 'automatisation' };
}

/**
 * « Aujourd'hui : {n} repas · {g} g », si l'appareil a un compteur du jour :
 * `{ repas, portions, grammes }`, chacun `null` quand rien ne le compte.
 * Le TOTAL du jour passe avant ses parts (05/10, contradicteur) : chez PetKit,
 * `total_dispensed` est le total de la journée et `manual_dispensed` /
 * `planned_dispensed` ses deux moitiés — prendre la première par ordre
 * alphabétique affichait les seules rations manuelles. Le compteur se reconnaît
 * à sa clé de traduction, à défaut à son entity_id (qu'on peut renommer).
 */
export function compteDuJour(lecture, states) {
  const S = states || {};
  const out = { repas: null, portions: null, grammes: null };
  const soeurs = new Map(((lecture && lecture.soeurs) || []).map(s => [s.id, s]));
  const texte = (id) => { const s = soeurs.get(id); return ((s && s.cle) || '') + ' ' + id; };
  const rang = (id) => (/total/.test(texte(id)) ? 0 : /manual|planned/.test(texte(id)) ? 2 : 1);
  [...((lecture && lecture.historique && lecture.historique.compteurs) || [])].sort((a, b) => rang(a) - rang(b)).forEach(id => {
    const e = S[id];
    const v = e ? nombre(e.state) : null;
    if (v == null) return;
    const u = (e.attributes && e.attributes.unit_of_measurement) || null;
    const g = u ? enGrammes(v, u) : null;
    if (g != null) { if (out.grammes == null) out.grammes = g; }
    else if (/times/.test(texte(id))) { if (out.repas == null) out.repas = v; }
    else if (/portion|dispensed/.test(texte(id)) && out.portions == null) out.portions = v;
  });
  return out;
}
