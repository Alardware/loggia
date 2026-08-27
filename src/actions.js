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
  alarm_control_panel: {
    arm_home: { service: 'alarm_arm_home' },
    arm_away: { service: 'alarm_arm_away' },
    arm_night: { service: 'alarm_arm_night' },
    arm_vacation: { service: 'alarm_arm_vacation' },
    trigger: { service: 'alarm_trigger' },
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
  siren: { turn_on: { service: 'turn_on' }, turn_off: { service: 'turn_off' } },
};

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
export function planAction(entityId, capability, value, ctx = {}) {
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

  if (services && !(services[domaineAppele] && services[domaineAppele][plan.service])) {
    return { ok: false, reason: 'service absent : ' + domaineAppele + '.' + plan.service };
  }

  const v = valeur(plan, value, attrs);
  if (!v.ok) return { ok: false, reason: v.reason };

  const data = {};
  if (plan.field && v.v !== undefined) data[plan.field] = v.v;

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
