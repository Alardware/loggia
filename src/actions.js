/**
 * D'une capacité à un appel de service — sans deviner, et sans mentir.
 *
 * Le dashboard appelle les services à la main, trente fois, sur le même motif :
 *
 *     try { hass.callService('cover', 'set_cover_position', { … }); } catch (e) {}
 *
 * Trois défauts y sont inscrits. Rien ne vérifie que l'entité accepte la
 * commande — un volet sans position recevait `set_cover_position` et ne bougeait
 * pas. Les bornes sont écrites en dur — la consigne de chauffage était plafonnée
 * à 30° alors que la climatisation d'ici monte à 35°, et un `number` va de -180
 * à 180. Et le `catch` vide avale l'échec : refus de permission, entité
 * injoignable, service inexistant, l'utilisateur ne voit rien et croit avoir agi.
 *
 * Ce module traduit une capacité — celles que `capabilities.js` a établies — en
 * un appel concret, avec ses bornes lues sur l'entité, ou en un refus motivé.
 * `planAction` décide sans rien envoyer, ce qui le rend testable et permet à une
 * vue de savoir à l'avance si un geste aboutira. `runAction` envoie, et rapporte
 * ce qui s'est passé.
 *
 * Aucun identifiant d'entité, aucune marque n'est écrit ici. Les noms de
 * services et de champs sont ceux de Home Assistant, publics et stables.
 */

import { entityCaps } from './capabilities.js';
import { getHass } from './state.js';

const domaineDe = (id) => (typeof id === 'string' ? id.slice(0, id.indexOf('.')) : '');

// ─────────────────────────────────────────────────────────────────────────────
// La traduction.
//
//   service  le nom du service à appeler, dans le domaine de l'entité
//   field    le champ qui porte la valeur, absent si la commande n'en prend pas
//   kind     comment lire et borner cette valeur :
//              pct     entier 0–100
//              ratio   réel 0–1
//              range   borné par ce que l'entité publie (min/max/pas)
//              option  doit appartenir à une liste publiée par l'entité
//              rgb     trois composantes 0–255
//              raw     transmis tel quel
//   bounds   où lire les bornes sur l'entité, pour `range`
//   list     où lire les valeurs permises, pour `option`
// ─────────────────────────────────────────────────────────────────────────────

const PLANS = {
  light: {
    set_brightness: { service: 'turn_on', field: 'brightness_pct', kind: 'pct' },
    set_color_temp: {
      service: 'turn_on', field: 'color_temp_kelvin', kind: 'range',
      bounds: { min: 'min_color_temp_kelvin', max: 'max_color_temp_kelvin' },
    },
    set_color: { service: 'turn_on', field: 'rgb_color', kind: 'rgb' },
    set_effect: { service: 'turn_on', field: 'effect', kind: 'option', list: 'effect_list' },
  },
  cover: {
    open: { service: 'open_cover' },
    close: { service: 'close_cover' },
    stop: { service: 'stop_cover' },
    set_position: { service: 'set_cover_position', field: 'position', kind: 'pct' },
    open_tilt: { service: 'open_cover_tilt' },
    close_tilt: { service: 'close_cover_tilt' },
    stop_tilt: { service: 'stop_cover_tilt' },
    set_tilt_position: { service: 'set_cover_tilt_position', field: 'tilt_position', kind: 'pct' },
  },
  climate: {
    set_temperature: {
      service: 'set_temperature', field: 'temperature', kind: 'range',
      bounds: { min: 'min_temp', max: 'max_temp', step: 'target_temp_step' },
    },
    set_hvac_mode: { service: 'set_hvac_mode', field: 'hvac_mode', kind: 'option', list: 'hvac_modes' },
    set_preset_mode: { service: 'set_preset_mode', field: 'preset_mode', kind: 'option', list: 'preset_modes' },
    set_fan_mode: { service: 'set_fan_mode', field: 'fan_mode', kind: 'option', list: 'fan_modes' },
    set_swing_mode: { service: 'set_swing_mode', field: 'swing_mode', kind: 'option', list: 'swing_modes' },
    // `pct` bornait a 0-100 en dur, alors qu'un deshumidificateur accepte
    // typiquement 30 a 99 : une consigne sous le minimum partait quand meme,
    // pour se faire refuser par l'appareil, et `bounds` revenait vide — une
    // interface qui dessine son curseur d'apres lui proposait donc 0-100.
    set_humidity: {
      service: 'set_humidity', field: 'humidity', kind: 'range',
      bounds: { min: 'min_humidity', max: 'max_humidity' },
    },
  },
  water_heater: {
    set_temperature: {
      service: 'set_temperature', field: 'temperature', kind: 'range',
      bounds: { min: 'min_temp', max: 'max_temp' },
    },
    set_operation_mode: {
      service: 'set_operation_mode', field: 'operation_mode',
      kind: 'option', list: 'operation_list',
    },
  },
  media_player: {
    play: { service: 'media_play' },
    pause: { service: 'media_pause' },
    play_pause: { service: 'media_play_pause' },
    stop: { service: 'media_stop' },
    next_track: { service: 'media_next_track' },
    previous_track: { service: 'media_previous_track' },
    set_volume: { service: 'volume_set', field: 'volume_level', kind: 'ratio' },
    volume_up: { service: 'volume_up' },
    volume_down: { service: 'volume_down' },
    mute: { service: 'volume_mute', field: 'is_volume_muted', kind: 'raw' },
    select_source: { service: 'select_source', field: 'source', kind: 'option', list: 'source_list' },
    select_sound_mode: {
      service: 'select_sound_mode', field: 'sound_mode',
      kind: 'option', list: 'sound_mode_list',
    },
    set_shuffle: { service: 'shuffle_set', field: 'shuffle', kind: 'raw' },
    set_repeat: { service: 'repeat_set', field: 'repeat', kind: 'raw' },
    seek: { service: 'media_seek', field: 'seek_position', kind: 'raw' },
  },
  vacuum: {
    start: { service: 'start' },
    pause: { service: 'pause' },
    stop: { service: 'stop' },
    return_home: { service: 'return_to_base' },
    locate: { service: 'locate' },
    clean_spot: { service: 'clean_spot' },
    set_fan_speed: { service: 'set_fan_speed', field: 'fan_speed', kind: 'option', list: 'fan_speed_list' },
  },
  lawn_mower: {
    start_mowing: { service: 'start_mowing' },
    pause: { service: 'pause' },
    dock: { service: 'dock' },
  },
  fan: {
    set_speed: { service: 'set_percentage', field: 'percentage', kind: 'pct' },
    oscillate: { service: 'oscillate', field: 'oscillating', kind: 'raw' },
    set_direction: { service: 'set_direction', field: 'direction', kind: 'raw' },
    set_preset_mode: { service: 'set_preset_mode', field: 'preset_mode', kind: 'option', list: 'preset_modes' },
  },
  lock: {
    lock: { service: 'lock' },
    unlock: { service: 'unlock' },
    open: { service: 'open' },
  },
  valve: {
    open: { service: 'open_valve' },
    close: { service: 'close_valve' },
    stop: { service: 'stop_valve' },
    set_position: { service: 'set_valve_position', field: 'position', kind: 'pct' },
  },
  /* `accepte` : ce que le service prend EN PLUS de la valeur de la capacite.
   *
   * Un panneau protege par un code refuse la commande sans lui. Le plan ne
   * batissait que le champ de la capacite, donc le code tombait — et trois
   * appels gardaient leur route directe pour cette seule raison.
   *
   * La liste est etroite a dessein : elle nomme les champs legitimes, service
   * par service. Sans elle, `options` deviendrait une porte ouverte par ou
   * n'importe quoi rejoindrait la charge utile, et la verification ne voudrait
   * plus rien dire. */
  alarm_control_panel: {
    arm_home: { service: 'alarm_arm_home', accepte: ['code'] },
    arm_away: { service: 'alarm_arm_away', accepte: ['code'] },
    arm_night: { service: 'alarm_arm_night', accepte: ['code'] },
    arm_vacation: { service: 'alarm_arm_vacation', accepte: ['code'] },
    arm_custom_bypass: { service: 'alarm_arm_custom_bypass', accepte: ['code'] },
    // Desarmer n'a pas de bit dans `supported_features` : on en sort toujours.
    disarm: { service: 'alarm_disarm', accepte: ['code'] },
    trigger: { service: 'alarm_trigger', accepte: ['code'] },
  },
  number: {
    set_value: {
      service: 'set_value', field: 'value', kind: 'range',
      bounds: { min: 'min', max: 'max', step: 'step' },
    },
  },
  input_number: {
    set_value: {
      service: 'set_value', field: 'value', kind: 'range',
      bounds: { min: 'min', max: 'max', step: 'step' },
    },
  },
  select: { select_option: { service: 'select_option', field: 'option', kind: 'option', list: 'options' } },
  input_select: { select_option: { service: 'select_option', field: 'option', kind: 'option', list: 'options' } },
  text: { set_value: { service: 'set_value', field: 'value', kind: 'raw' } },
  input_text: { set_value: { service: 'set_value', field: 'value', kind: 'raw' } },
  button: { press: { service: 'press' } },
  input_button: { press: { service: 'press' } },
  update: { install: { service: 'install' } },
  automation: { trigger: { service: 'trigger' } },
  timer: {
    start: { service: 'start' }, pause: { service: 'pause' },
    cancel: { service: 'cancel' }, finish: { service: 'finish' },
  },
  /* Creer un rendez-vous.
   *
   * `calendar.create_event` prend le titre par `summary` et la date par DEUX
   * paires exclusives : `start_date_time`/`end_date_time` quand il y a une
   * heure, `start_date`/`end_date` pour une journee entiere. Le moteur ne
   * choisit pas entre les deux — l'appelant sait s'il a une heure ou non, et
   * une paire panachee serait refusee par Home Assistant, qui le dira.
   *
   * `end_date` d'une journee entiere est EXCLUSIVE : un evenement d'un seul
   * jour finit le lendemain. C'est la convention iCalendar, et l'oublier
   * fabrique un rendez-vous de duree nulle. */
  calendar: {
    creer_evenement: {
      service: 'create_event', field: 'summary', kind: 'raw',
      accepte: ['description', 'location',
        'start_date_time', 'end_date_time', 'start_date', 'end_date'],
    },
    /* Modifier et supprimer ne sont PAS des services.
     *
     * Home Assistant n'expose que `create_event` et `get_events` ; les deux
     * autres gestes passent par des commandes WebSocket. Le moteur les porte
     * quand meme : la verification de capacite, le refus explique et le canal
     * d'echec valent pour eux comme pour le reste. Seul le dernier metre
     * change, et `runPlan` s'en charge.
     *
     * L'identifiant `uid` vient de l'API des agendas, qui le rend avec chaque
     * evenement — verifie : il est present partout, aux cotes de
     * `recurrence_id` et `rrule`.
     *
     * `event` est un OBJET imbrique, pas des champs a plat : le serveur le dit
     * lui-meme quand on l'omet — « required key not provided at 'event' ». */
    modifier_evenement: {
      ws: 'calendar/event/update', field: 'uid', kind: 'raw',
      accepte: ['event', 'recurrence_id', 'recurrence_range'],
    },
    supprimer_evenement: {
      ws: 'calendar/event/delete', field: 'uid', kind: 'raw',
      accepte: ['recurrence_id', 'recurrence_range'],
    },
  },
  siren: { turn_on: { service: 'turn_on' }, turn_off: { service: 'turn_off' } },
};

/**
 * L'inverse de `PLANS` : d'un couple (domaine, service) vers la capacité.
 *
 * Le dashboard appelle encore les services par leur nom, à travers des aides
 * locales — `call('light', 'turn_on', { entity_id, brightness_pct })`. Les
 * réécrire une par une, ce sont cinquante retouches à la main dans un fichier
 * de douze mille lignes, chacune une occasion de se tromper.
 *
 * Cette fonction fait le chemin dans l'autre sens, une fois, à partir de la
 * même table. Un appel par son nom retrouve donc la capacité correspondante, et
 * avec elle les vérifications : l'entité déclare-t-elle savoir le faire, et la
 * valeur tient-elle dans ses bornes réelles.
 *
 * Le champ présent dans `data` tranche quand plusieurs capacités mènent au même
 * service : `light.turn_on` vaut `set_brightness` avec `brightness_pct`,
 * `set_color` avec `rgb_color`, et un simple `turn_on` sans rien.
 *
 * Rend `null` quand rien ne correspond — `alarm_disarm`, `play_media`,
 * `update_entity` n'ont pas de capacité, et l'appelant garde alors sa route
 * directe plutôt que de voir sa commande disparaître.
 */
export function capaciteDe(domain, service, data = {}) {
  const table = PLANS[domain] || {};
  const candidats = Object.keys(table).filter(c => table[c].service === service);
  // D'abord celle dont le champ est fourni : c'est elle qu'on demande.
  const avecChamp = candidats.find(c => table[c].field && data[table[c].field] !== undefined);
  if (avecChamp) return { capacite: avecChamp, champ: table[avecChamp].field, accepte: table[avecChamp].accepte || [] };
  const sansChamp = candidats.find(c => !table[c].field);
  if (sansChamp) return { capacite: sansChamp, champ: null, accepte: table[sansChamp].accepte || [] };
  // `turn_on` / `turn_off` / `toggle` ne sont pas dans la table : ils valent
  // pour tout domaine allumable, et `planAction` les traite à part.
  if (BASCULE.has(service)) return { capacite: service, champ: null, accepte: [] };
  return null;
}

/**
 * Allumer, éteindre, basculer.
 *
 * Home Assistant offre `homeassistant.turn_on` pour tous les domaines, mais le
 * service du domaine lui-même accepte davantage — `light.turn_on` prend la
 * luminosité, `homeassistant.turn_on` non. On préfère donc le domaine, et on ne
 * retombe sur le service générique que s'il n'en a pas.
 */
const BASCULE = new Set(['turn_on', 'turn_off', 'toggle']);
const SANS_BASCULE_PROPRE = new Set(['group', 'person', 'device_tracker']);

/** Arrondit au pas publié par l'entité — 0,5° pour un thermostat, 1 pour un rang. */
function auPas(v, pas) {
  if (!pas || !(pas > 0)) return v;
  const n = Math.round(v / pas) * pas;
  // Le pas peut valoir 0,0001 : on recolle aux décimales qu'il porte lui-même,
  // sinon l'arrondi flottant renverrait 0,30000000000000004.
  const dec = String(pas).indexOf('.') >= 0 ? String(pas).split('.')[1].length : 0;
  return Number(n.toFixed(dec));
}

const nombre = (v) => (typeof v === 'number' && isFinite(v) ? v : Number(v));

/** Prépare la valeur, ou dit pourquoi elle ne convient pas. */
function valeur(plan, brute, attrs) {
  if (!plan.field) return { ok: true };   // la commande ne prend rien

  if (plan.kind === 'option') {
    const permises = Array.isArray(attrs[plan.list]) ? attrs[plan.list] : null;
    if (!permises || !permises.length) return { ok: false, reason: 'aucune option publiée' };
    if (permises.indexOf(brute) < 0) {
      return { ok: false, reason: 'option inconnue de l’entité : ' + String(brute) };
    }
    return { ok: true, v: brute };
  }

  if (plan.kind === 'rgb') {
    const t = Array.isArray(brute) ? brute : null;
    if (!t || t.length !== 3 || t.some(x => !(x >= 0 && x <= 255))) {
      return { ok: false, reason: 'couleur attendue sous forme [r, v, b] entre 0 et 255' };
    }
    return { ok: true, v: t.map(x => Math.round(x)) };
  }

  if (plan.kind === 'raw') {
    if (brute === undefined) return { ok: false, reason: 'valeur manquante' };
    return { ok: true, v: brute };
  }

  const n = nombre(brute);
  if (!isFinite(n)) return { ok: false, reason: 'valeur numérique attendue' };

  if (plan.kind === 'pct') return { ok: true, v: Math.max(0, Math.min(100, Math.round(n))) };
  if (plan.kind === 'ratio') return { ok: true, v: Math.max(0, Math.min(1, n)) };

  // `range` : les bornes viennent de l'entité, jamais d'une constante. Une
  // climatisation monte à 35°, un chauffe-eau à 60, un `number` va de -180 à 180.
  const b = plan.bounds || {};
  const min = b.min != null && attrs[b.min] != null ? nombre(attrs[b.min]) : null;
  const max = b.max != null && attrs[b.max] != null ? nombre(attrs[b.max]) : null;
  const pas = b.step != null && attrs[b.step] != null ? nombre(attrs[b.step]) : null;
  let v = n;
  if (pas) v = auPas(v, pas);
  if (min != null) v = Math.max(min, v);
  if (max != null) v = Math.min(max, v);
  return { ok: true, v, clamped: v !== n, min, max, step: pas };
}

/**
 * Ce qu'il faudrait envoyer pour obtenir `capability` sur `entityId` — ou le
 * refus motivé. Rien n'est envoyé : une vue peut s'en servir pour savoir à
 * l'avance si un geste aboutirait.
 *
 * @param {string} entityId
 * @param {string} capability  une capacité au sens de `capabilities.js`
 * @param {*} value            la valeur, quand la commande en prend une
 * @param {object} ctx         { states, services }
 * @returns {object} { ok, domain, service, data, target } ou { ok:false, reason }
 */
/**
 * Le meme plan pour plusieurs entites, sans mentir sur celles qu'on ecarte.
 *
 * Trois commandes du dashboard visent un groupe : eteindre les lampes d'une
 * piece, ouvrir ou fermer ses volets, changer le mode de ses thermostats. Elles
 * gardaient la route directe parce que `planAction` ne prenait qu'une entite —
 * donc aucune verification, et le lot partait entier meme si la moitie ne
 * savait pas obeir.
 *
 * Ici chaque entite est planifiee separement, et l'on ne garde que celles qui
 * aboutissent au MEME appel. Deux raisons de ne pas se contenter du premier
 * plan : une entite peut ne pas declarer la capacite, et une autre peut voir sa
 * valeur ramenee a ses propres bornes — deux volets, l'un qui accepte 30 %,
 * l'autre plafonne a 20, ne peuvent pas partir dans le meme envoi sans que l'un
 * des deux recoive autre chose que ce qu'on a demande.
 *
 * `ecartees` nomme les laissees-pour-compte. Un appelant qui les ignore se
 * comporte comme avant ; un appelant qui les lit peut enfin le dire.
 */
function planGroupe(ids, capability, value, ctx, options) {
  const liste = ids.filter(Boolean);
  if (!liste.length) return { ok: false, reason: 'aucune entité' };
  const plans = liste.map(id => ({ id, p: planAction(id, capability, value, ctx, options) }));
  const bons = plans.filter(x => x.p.ok);
  if (!bons.length) {
    return { ok: false, reason: plans[0].p.reason, ecartees: liste };
  }
  const ref = bons[0].p;
  const memeAppel = (p) => p.domain === ref.domain && p.service === ref.service
    && JSON.stringify(p.data) === JSON.stringify(ref.data);
  const retenues = bons.filter(x => memeAppel(x.p)).map(x => x.id);
  const ecartees = liste.filter(id => retenues.indexOf(id) < 0);
  return {
    ...ref,
    target: { entity_id: retenues },
    ecartees: ecartees.length ? ecartees : null,
  };
}

export function planAction(entityId, capability, value, ctx = {}, options = {}) {
  // Un tableau d'entites suit le meme chemin, entite par entite.
  if (Array.isArray(entityId)) return planGroupe(entityId, capability, value, ctx, options);
  const states = ctx.states || {};
  const services = ctx.services || null;
  const domain = domaineDe(entityId);
  if (!domain || !capability) return { ok: false, reason: 'entité ou capacité manquante' };

  const st = states[entityId];
  // Une entité absente des états n'existe pas — ou elle est désactivée, ce qui
  // revient au même pour qui veut la commander. On ne le vérifie que si
  // l'appelant a fourni les états : les lui demander est le seul moyen de
  // savoir, et s'en passer est un choix explicite.
  if (ctx.states && !st) return { ok: false, reason: 'entité inconnue de Home Assistant' };
  const attrs = (st && st.attributes) || {};
  const caps = entityCaps(entityId, st, services);

  // L'entité doit déclarer la capacité. C'est tout l'intérêt de l'étape
  // précédente : un volet sans position recevait `set_cover_position` et ne
  // bougeait pas, sans que rien ne le signale.
  if (!caps.can.has(capability)) {
    return { ok: false, reason: 'l’entité ne déclare pas « ' + capability + ' »' };
  }

  let domaineAppele = domain;
  let plan = (PLANS[domain] || {})[capability];

  if (!plan && BASCULE.has(capability)) {
    // `homeassistant.turn_on` marche partout ; le service du domaine accepte
    // davantage quand il existe.
    const propre = !SANS_BASCULE_PROPRE.has(domain)
      && (!services || (services[domain] && services[domain][capability]));
    domaineAppele = propre ? domain : 'homeassistant';
    plan = { service: capability };
  }
  if (!plan) return { ok: false, reason: 'aucune traduction connue pour « ' + capability + ' »' };

  // Une commande WebSocket n'est pas un service : la chercher dans la liste
  // des services la declarerait absente a tort.
  if (!plan.ws && services && !(services[domaineAppele] && services[domaineAppele][plan.service])) {
    return { ok: false, reason: 'service absent : ' + domaineAppele + '.' + plan.service };
  }

  const v = valeur(plan, value, attrs);
  if (!v.ok) return { ok: false, reason: v.reason };

  const data = {};
  if (plan.field && v.v !== undefined) data[plan.field] = v.v;
  // Et rien d'autre que ce que ce service declare accepter.
  (plan.accepte || []).forEach((k) => {
    const x = options[k];
    if (x !== undefined && x !== null && x !== '') data[k] = x;
  });

  if (plan.ws) {
    /* La commande WebSocket porte l'entite DANS son message, pas dans une
     * cible a part : `callWS({ type, entity_id, uid, … })`. */
    return {
      ok: true, domain: domaineAppele, ws: plan.ws, target: null,
      data: { entity_id: entityId, ...data },
      clamped: false, bounds: null, available: caps.available,
    };
  }
  return {
    ok: true,
    domain: domaineAppele,
    service: plan.service,
    target: { entity_id: entityId },
    data,
    // Ce qu'on a dû corriger, pour que l'appelant puisse le montrer plutôt que
    // de laisser croire que la valeur demandée a été appliquée.
    clamped: !!v.clamped,
    bounds: v.min != null || v.max != null ? { min: v.min, max: v.max, step: v.step } : null,
    available: caps.available,
  };
}

/**
 * Envoie, et dit ce qui s'est passé.
 *
 * Le `catch` vide des appels actuels transforme un refus de permission en
 * silence : l'utilisateur appuie, rien ne bouge, rien ne l'explique. Ici
 * l'échec revient à l'appelant, à charge pour lui de le montrer.
 */
export async function runAction(hass, entityId, capability, value, ctx = {}) {
  const plan = planAction(entityId, capability, value, ctx);
  if (!plan.ok) return plan;
  return runPlan(hass, plan);
}

/**
 * Exécute un plan déjà établi.
 *
 * Une interface a souvent besoin du plan AVANT de l'envoyer : pour afficher la
 * valeur réellement appliquée plutôt que celle demandée, quand l'entité a ses
 * propres bornes. Elle appelle alors `planAction`, lit `data`, et envoie ce
 * même plan — sans le recalculer.
 */
export async function runPlan(hass, plan) {
  if (!plan || !plan.ok) return plan || { ok: false, reason: 'aucun plan' };
  /* Le dernier metre, quand la commande n'est pas un service. Tout ce qui
   * precede — capacite declaree, valeur validee, refus explique — vaut
   * identiquement ; seul l'envoi differe. */
  if (plan.ws) {
    if (!hass || typeof hass.callWS !== 'function') {
      return { ok: false, reason: 'Home Assistant indisponible', plan };
    }
    try {
      await hass.callWS({ type: plan.ws, ...plan.data });
      return { ok: true, plan };
    } catch (e) {
      return { ok: false, reason: (e && (e.message || e.error)) || String(e), plan };
    }
  }
  if (!hass || typeof hass.callService !== 'function') {
    return { ok: false, reason: 'Home Assistant indisponible', plan };
  }
  try {
    await hass.callService(plan.domain, plan.service, plan.data, plan.target);
    return { ok: true, plan };
  } catch (e) {
    return { ok: false, reason: (e && (e.message || e.error)) || String(e), plan };
  }
}

/**
 * Les capacités d'une entité qui aboutiraient réellement, avec leur plan.
 *
 * Sert à construire une carte : n'afficher un bouton que s'il a un effet, et
 * connaître d'avance les bornes du curseur.
 */
export function availableActions(entityId, ctx = {}) {
  const st = (ctx.states || {})[entityId];
  const caps = entityCaps(entityId, st, ctx.services || null);
  const out = new Map();
  caps.can.forEach(c => {
    /* Valeur d'essai neutre : elle ne sert qu'a valider la traduction, pas a
     * etre envoyee.
     *
     * Les commandes a option et a couleur sont donc absentes de cette carte —
     * `0` n'appartient a aucune liste et n'est pas un triplet. C'est VOULU et
     * verifie par les tests : choisir un mode a la place de l'utilisateur ne
     * regarde pas le moteur, c'est a la vue de proposer la liste que l'entite
     * publie. Cette carte repond « ce geste aboutirait tel quel », pas « cette
     * capacite existe » — `entityCaps` est la pour cela.
     *
     * A ne pas relire comme un defaut : le commentaire precedent attribuait
     * cette absence a une entite muette, ce qui etait faux et invitait a
     * « corriger » une intention. */
    const p = planAction(entityId, c, 0, ctx);
    if (p.ok) out.set(c, p);
  });
  return out;
}

/* ── Le dernier metre : de la capacite a la commande envoyee ────────────────
 *
 * Ces quatre fonctions vivaient dans `App.jsx`. Elles n'y avaient rien a faire :
 * elles ne rendent aucune vue, et deux d'entre elles sont le seul chemin verifie
 * du dashboard. Les vues, elles, ne pouvaient pas les appeler — `parametres.jsx`
 * gardait deux commandes sur la route directe pour cette seule raison, sans
 * verification ni bornes.
 *
 * Elles rejoignent donc le moteur dont elles sont le dernier metre. */
/** Le contexte du moteur d'actions, depuis le pont Home Assistant. */
export function actionCtx(h) {
  const hs = h || getHass();
  /* Une carte de services VIDE n'est pas une information.
   *
   * `planAction` refuse une commande dont le service n'apparait pas dans cette
   * carte — c'est la garde qui empeche d'envoyer `set_cover_position` a un
   * volet qui ne la publie pas. Mais `{}` ne dit pas « aucun service n'existe »,
   * il dit « je ne sais pas ». Home Assistant en publie toujours des centaines.
   *
   * La demo, elle, annonce `services: {}`. Chaque commande passee par
   * `commander` y etait donc refusee — et l'affichage optimiste le masquait :
   * l'interrupteur basculait, revenait quatre secondes plus tard, et on croyait
   * a une lenteur. Le seul chemin verifie du dashboard etait inerte la ou on
   * l'essaye. */
  const svc = hs && hs.services;
  return { states: (hs && hs.states) || {}, services: (svc && Object.keys(svc).length) ? svc : null };
}

/**
 * L'entite accepte-t-elle cette capacite ?
 *
 * Sert a ne PAS dessiner un bouton inerte. Home Assistant refuse explicitement
 * un service qu'une entite ne declare pas — « does not support action » — donc
 * un bouton de pause sur une enceinte qui n'a pas le bit PAUSE ne fait rien
 * d'autre que promettre. Mieux vaut ne rien montrer que montrer un mensonge.
 *
 * On interroge la CAPACITE seule, sans valeur : une commande a liste comme le
 * choix d'un mode serait refusee faute de valeur d'essai, alors qu'elle est
 * bien offerte.
 */
export function peut(hass, id, capability) {
  if (!id) return false;
  const ctx = actionCtx(hass);
  return entityCaps(id, ctx.states[id], ctx.services).can.has(capability);
}

/**
 * Commande une entite par sa CAPACITE, et rend la valeur reellement envoyee.
 *
 * Elle peut differer de celle demandee : les bornes appartiennent a l'entite,
 * et une consigne de 34° passe sur une climatisation qui monte a 35 mais serait
 * ramenee a 24 sur un plancher chauffant. L'interface affiche donc ce qui a ete
 * envoye, jamais ce qui a ete demande.
 *
 * Rend `null` si l'entite ne declare pas la capacite — la vue ne doit alors
 * afficher aucun changement, puisqu'il n'y en aura pas.
 */
/**
 * Un appel de service par son nom, passe par la validation quand c'est possible.
 *
 * Le dashboard garde des aides locales qui prennent un domaine et un service —
 * `call('light', 'turn_on', { entity_id, brightness_pct })`. Les reecrire une
 * par une, ce sont cinquante retouches a la main dans douze mille lignes.
 *
 * `capaciteDe` fait le chemin inverse a partir de la meme table : de (domaine,
 * service, champ) vers la capacite. L'appel retrouve donc `planAction`, et avec
 * lui les deux verifications qui manquaient — l'entite declare-t-elle savoir le
 * faire, et la valeur tient-elle dans SES bornes plutot que dans une constante.
 *
 * Ce qui n'a pas de capacite garde sa route directe : `alarm_disarm`,
 * `play_media`, `update_entity` n'en ont pas, et une commande qui disparait
 * vaudrait moins qu'une commande non verifiee.
 */
/**
 * Les champs de date d'un `calendar.create_event`.
 *
 * Deux paires exclusives, et une regle qui se paie cher quand on l'oublie :
 * `end_date` d'une journee entiere est EXCLUSIVE. Un rendez-vous du 10 va donc
 * du 10 au 11. Ecrire du 10 au 10 fabrique une duree nulle — Home Assistant
 * l'accepte sans broncher, et rien ne s'affiche ensuite.
 *
 * Les dates arrivent en `AAAA-MM-JJ` et les heures en `HH:MM`, telles que les
 * champs du navigateur les rendent. Le service veut du temps LOCAL, sans
 * fuseau : on concatene, on n'convertit pas.
 */
export function datesEvenement(journee, dDebut, hDebut, dFin, hFin) {
  if (!journee) {
    return { start_date_time: dDebut + ' ' + hDebut + ':00', end_date_time: dFin + ' ' + hFin + ':00' };
  }
  const f = new Date(dFin + 'T00:00:00');
  f.setDate(f.getDate() + 1);
  const dd = (n) => String(n).padStart(2, '0');
  return { start_date: dDebut, end_date: f.getFullYear() + '-' + dd(f.getMonth() + 1) + '-' + dd(f.getDate()) };
}

/**
 * L'inverse exact de `datesEvenement` : d'un evenement de l'API vers les champs
 * du formulaire.
 *
 * Le piege est le meme, pris a l'envers. L'API rend `end.date` EXCLUSIVE : un
 * rendez-vous du 10 revient « du 10 au 11 ». L'afficher tel quel ferait croire
 * a deux jours, et le reenregistrer en ajouterait un a chaque passage — un
 * evenement qui s'allonge tout seul a chaque modification.
 *
 * Les deux fonctions doivent donc rester symetriques, et un test le verifie en
 * faisant l'aller-retour.
 */
export function champsDepuisEvenement(e) {
  const dd = (n) => String(n).padStart(2, '0');
  const iso = (d) => d.getFullYear() + '-' + dd(d.getMonth() + 1) + '-' + dd(d.getDate());
  const hm = (d) => dd(d.getHours()) + ':' + dd(d.getMinutes());
  const s = (e && e.start) || {};
  const f = (e && e.end) || {};
  if (s.date) {
    const fin = new Date((f.date || s.date) + 'T00:00:00');
    fin.setDate(fin.getDate() - 1);
    // Une journee entiere d'un seul jour revient « du 10 au 11 » : on retire le
    // jour ajoute a l'ecriture, sans jamais passer avant le debut.
    const dFin = fin < new Date(s.date + 'T00:00:00') ? s.date : iso(fin);
    return { journee: true, dDebut: s.date, hDebut: '', dFin, hFin: '' };
  }
  const a = new Date(s.dateTime);
  const b = new Date(f.dateTime || s.dateTime);
  return { journee: false, dDebut: iso(a), hDebut: hm(a), dFin: iso(b), hFin: hm(b) };
}

/**
 * La fin vient-elle apres le debut ?
 *
 * Le seul cas que Home Assistant accepte sans rien dire tout en ne creant rien
 * de visible. Une journee entiere se compare sur la date seule — le 10 au 10
 * est valide, c'est une journee ; un horaire exige une fin STRICTEMENT apres,
 * sinon la duree est nulle.
 */
export function finApresDebut(journee, dDebut, hDebut, dFin, hFin) {
  if (journee) return dFin >= dDebut;
  return new Date(dFin + 'T' + hFin) > new Date(dDebut + 'T' + hDebut);
}

export function commanderService(hass, id, domaine, service, data) {
  const d = data || {};
  const trad = id ? capaciteDe(domaine, service, d) : null;
  /* `planAction` ne rebatit que le champ de la capacite : tout ce que l'appel
   * portait en plus serait perdu en chemin. Un `code` d'alarme, une duree de
   * transition, un `enqueue` de lecteur — la commande partirait amputee, et
   * personne ne le verrait. On ne passe donc par la validation que si l'appel
   * ne transporte rien d'autre que l'entite et la valeur attendue. */
  const extras = Object.keys(d).filter(k => k !== 'entity_id' && k !== (trad && trad.champ));
  /* Sauf ce que le service declare accepter : un code d'alarme n'est pas un
   * champ perdu, c'est un champ prevu. `capaciteDe` le nomme, `planAction` le
   * remet dans la charge utile, et rien d'autre ne passe par la. */
  const admis = trad ? extras.filter(k => (trad.accepte || []).indexOf(k) >= 0) : [];
  if (trad && extras.length === admis.length) {
    const options = {};
    admis.forEach((k) => { options[k] = d[k]; });
    return commander(hass, id, trad.capacite, trad.champ ? d[trad.champ] : undefined, null, options);
  }
  if (hass && hass.callService) hass.callService(domaine, service, d);
  return null;
}

export function commander(hass, id, capability, value, champ, options) {
  const ctx = actionCtx(hass);
  const p = planAction(id, capability, value, ctx, options || {});
  if (!p.ok) {
    /* Un plan refuse etait muet : `planAction` dit pourquoi — l'entite ne
     * declare pas la capacite, le service n'existe pas, la valeur ne tient pas
     * dans ses bornes — et cette raison mourait ici. On appuyait, rien ne se
     * passait, et rien ne l'expliquait : exactement le defaut que ce moteur
     * existe pour corriger, reproduit au dernier metre.
     *
     * Meme canal qu'un echec d'envoi : le toast dit qu'il ne s'est rien passe. */
    Promise.reject(Object.assign(new Error(p.reason || 'commande impossible'), { code: 'service_error' }));
    return null;
  }
  /* `runPlan` attrape le rejet pour pouvoir en donner la raison — et l'echec
   * s'arretait la. L'ecoute globale des rejets, seul canal d'erreur visible du
   * dashboard, ne voyait donc jamais passer une commande refusee : le toast
   * « Commande non executee » ne pouvait pas se declencher pour les cinquante et
   * quelques appels qui passent par ici.
   *
   * Le mensonge durait : une carte de volet peint la position demandee, puis
   * attend que l'etat reel bouge pour se recaler. Refusee, la commande ne fait
   * bouger personne, et la carte reste sur une position que rien n'a atteinte.
   *
   * On relance donc le rejet, sans le traiter, pour que l'ecoute s'en saisisse.
   * `code` le fait passer le filtre de l'ecouteur. */
  runPlan(hass, p).then((r) => {
    if (r && r.ok) return;
    const motif = (r && r.reason) ? String(r.reason) : 'service';
    Promise.reject(Object.assign(new Error(motif), { code: 'service_error' }));
  });
  return champ ? p.data[champ] : (p.data || {});
}
