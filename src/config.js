// ─────────────────────────────────────────────────────────────────────────────
// Configuration Loggia — couche d'acces unique.
//
// Aujourd'hui, chaque reglage est ecrit directement dans le localStorage du
// navigateur. Deux consequences genantes : la configuration est liee a l'appareil
// (un telephone ne voit pas les reglages du PC) ET a l'origine (l'acces par IP
// locale et l'acces par Nabu Casa sont deux stockages distincts, ce qui a deja
// pose probleme). Elle n'est pas non plus liee a l'utilisateur Home Assistant.
//
// Ce module route les lectures/ecritures vers le composant `loggia` quand il est
// present (stockage serveur, par utilisateur), et retombe sur le localStorage
// sinon. Rien n'est migre automatiquement : voir migrateFromLocalStorage().
// ─────────────────────────────────────────────────────────────────────────────

export const CONFIG_VERSION = 1;

const WS_GET = 'loggia/config/get';
const WS_SET = 'loggia/config/set';
const WS_DELETE = 'loggia/config/delete';

// Ne quitte jamais le navigateur : le projet interdit de lire ou de synchroniser
// le code PIN administrateur.
export const LOCAL_ONLY_KEYS = new Set(['loggia_admin_pin']);

// Prefixes reconnus comme appartenant a Loggia dans le localStorage.
const KEY_PREFIXES = ['loggia_', 'loggia-'];
const isLoggiaKey = (k) => typeof k === 'string' && KEY_PREFIXES.some(p => k.indexOf(p) === 0);

// Cles reellement lues ou ecrites par la V2, relevees dans App.jsx
// (localStorage.getItem/setItem/removeItem + readLS). Le navigateur en contient
// beaucoup d'autres, heritees de la V1 : loggia_feeder, loggia_fridge, loggia_locks,
// loggia_shutters, loggia_layout, loggia_sync_*, loggia_users_v2… Aucune n'est lue
// par la V2 et rien ne sert a les transporter dans le stockage serveur.
//
// Deux pieges a garder en tete : `loggia_medias` (V2) ressemble a `loggia_media`
// (V1), et `loggia_users` (V2) a `loggia_users_v2` (V1). Ne pas confondre.
// `loggia-sky`, `loggia-frosted`, `loggia-contrast` et `loggia-light` ne sont PAS des
// cles : ce sont des classes CSS. `loggia-fellback` vit dans sessionStorage.
export const MIGRATABLE_KEYS = [
  'loggia-croqpanel', 'loggia-enpanel', 'loggia-ha', 'loggia-hiddenviews', 'loggia-lastseen',
  'loggia-mode', 'loggia-navbar', 'loggia-navoffset', 'loggia-objpanel', 'loggia-parpanel',
  'loggia-roompanel', 'loggia-scenepanel', 'loggia-secpanel', 'loggia-shownviews',
  'loggia-ciel', 'loggia-syspanel', 'loggia-theme', 'loggia-topoffset', 'loggia-vacpanel',
  'loggia-wxfx',
  'loggia_active_user', 'loggia_alarm', 'loggia_cameras', 'loggia_customviews',
  'loggia_energyHaids', 'loggia_haCfg', 'loggia_lights', 'loggia_look', 'loggia_medias',
  'loggia_people', 'loggia_plants', 'loggia_quickscenes', 'loggia_roomhidden', 'loggia_rooms',
  'loggia_switchlights', 'loggia_users',
];
const MIGRATABLE = new Set(MIGRATABLE_KEYS);

/** Lecture localStorage tolerante : une valeur corrompue ne casse rien. */
function lsRead(key, fallback = null) {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw == null) return fallback;
    try { return JSON.parse(raw); } catch (e) { return raw; } // valeurs simples ('dark', '0'…)
  } catch (e) { return fallback; }
}

function lsWrite(key, value) {
  try {
    if (value === null || value === undefined) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    return true;
  } catch (e) { return false; }
}

/** Toutes les cles Loggia du localStorage, PIN exclu. */
export function collectLocal() {
  const out = {};
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!isLoggiaKey(k) || LOCAL_ONLY_KEYS.has(k)) continue;
      out[k] = lsRead(k);
    }
  } catch (e) { /* stockage indisponible (navigation privee) */ }
  return out;
}

/**
 * Cles du localStorage effectivement migrables : celles que la V2 utilise.
 * Le reste (reliquats V1) est ignore, et jamais efface.
 */
export function collectMigratable() {
  const all = collectLocal();
  const out = {};
  Object.keys(all).forEach(k => { if (MIGRATABLE.has(k)) out[k] = all[k]; });
  return out;
}

/** Cles Loggia presentes mais inconnues de la V2 — diagnostic uniquement. */
export function collectLegacy() {
  const all = collectLocal();
  return Object.keys(all).filter(k => !MIGRATABLE.has(k));
}

/**
 * Etat du backend. `available` ne devient vrai que si la commande repond :
 * un composant absent, trop ancien ou sans permission donne simplement `false`,
 * et tout continue en localStorage.
 */
export async function probe(hass) {
  if (!hass || typeof hass.callWS !== 'function') {
    return { available: false, reason: 'hass indisponible', user: null, config: {} };
  }
  try {
    const r = await hass.callWS({ type: WS_GET });
    return {
      available: true,
      reason: null,
      user: (r && r.user) || null,
      config: (r && r.config) || {},
    };
  } catch (e) {
    return { available: false, reason: (e && (e.message || e.code)) || 'inconnu', user: null, config: {} };
  }
}

/**
 * Cree un accesseur de configuration.
 *
 * En mode serveur, la configuration est chargee une fois puis tenue en cache :
 * les lectures restent synchrones (comme l'etaient les appels localStorage), les
 * ecritures partent en arriere-plan et sont regroupees pour ne pas ecrire a
 * chaque frappe.
 */
export function createConfig({ hass, serverConfig = null, user = null }) {
  const server = serverConfig !== null;
  const cache = server ? { ...serverConfig } : {};
  let pending = {};
  let timer = null;
  let lastError = null;

  const flush = async () => {
    timer = null;
    const patch = pending;
    pending = {};
    if (!Object.keys(patch).length) return;
    try {
      await hass.callWS({ type: WS_SET, config: patch });
      lastError = null;
    } catch (e) {
      lastError = (e && (e.message || e.code)) || 'echec ecriture';
      // Repli : le reglage n'est pas perdu, il redevient local.
      Object.keys(patch).forEach(k => lsWrite(k, patch[k]));
    }
  };

  return {
    mode: server ? 'server' : 'local',
    user,
    get lastError() { return lastError; },

    /** Lecture synchrone. Le PIN reste toujours local. */
    get(key, fallback = null) {
      if (LOCAL_ONLY_KEYS.has(key) || !server) return lsRead(key, fallback);
      const v = cache[key];
      return v === undefined ? fallback : v;
    },

    /** Ecriture. En mode serveur, groupee et differee de 400 ms. */
    set(key, value) {
      if (LOCAL_ONLY_KEYS.has(key) || !server) return lsWrite(key, value);
      if (value === null || value === undefined) delete cache[key];
      else cache[key] = value;
      pending[key] = value === undefined ? null : value;
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, 400);
      return true;
    },

    /** Force l'ecriture immediate des reglages en attente. */
    flush() { if (timer) { clearTimeout(timer); } return flush(); },

    /** Liste des cles connues. */
    keys() { return server ? Object.keys(cache) : Object.keys(collectLocal()); },

    /** Efface la configuration serveur de l'utilisateur (le local reste intact). */
    async reset() {
      if (!server) return false;
      await hass.callWS({ type: WS_DELETE });
      Object.keys(cache).forEach(k => delete cache[k]);
      return true;
    },
  };
}

/**
 * Migration explicite du localStorage vers le stockage serveur.
 *
 * Volontairement NON automatique : tant qu'elle n'est pas appelee, le
 * comportement du dashboard est strictement inchange. Le localStorage n'est pas
 * efface — en cas de retour en arriere, la configuration d'origine est intacte.
 *
 * `dryRun` (defaut) n'ecrit rien et renvoie ce qui serait migre.
 */
/**
 * Fait remonter au serveur ce qui n'existe que sur cet appareil.
 *
 * Sans cela, un reglage fait avant l'arrivee du composant reste prisonnier du
 * navigateur qui l'a ecrit : le poste d'origine l'affiche, les autres non, et
 * rien ne les reconcilie jamais. C'est ce qui faisait diverger durablement un
 * telephone d'un ordinateur.
 *
 * Deux garde-fous : on n'ecrase JAMAIS une valeur deja connue du serveur — la
 * sienne est forcement plus recente qu'un reliquat local — et on laisse de cote
 * les reglages propres a l'appareil, qui n'ont rien a faire en commun.
 *
 * @param {Function} estPersonnelle  Predicat fourni par l'appelant, pour que la
 *   liste des cles d'appareil reste definie a un seul endroit.
 */
export async function completerDepuisLocal(hass, serverConfig, estPersonnelle) {
  const local = collectMigratable();
  const patch = {};
  Object.keys(local).forEach((k) => {
    if (estPersonnelle(k)) return;
    const dejaLa = serverConfig && serverConfig[k];
    if (dejaLa !== undefined && dejaLa !== null) return;
    patch[k] = local[k];
  });
  const cles = Object.keys(patch);
  if (!cles.length) return { cles: [] };
  await hass.callWS({ type: WS_SET, config: patch });
  return { cles };
}

export async function migrateFromLocalStorage(hass, { dryRun = true, overwrite = false } = {}) {
  const local = collectMigratable();
  const keys = Object.keys(local);
  const ignored = collectLegacy();
  const state = await probe(hass);

  if (!state.available) {
    return { ok: false, reason: 'composant loggia indisponible : ' + state.reason, keys };
  }
  const already = Object.keys(state.config);
  if (already.length && !overwrite) {
    return {
      ok: false,
      reason: 'une configuration serveur existe deja (' + already.length + ' cles) — relancer avec overwrite',
      keys, already,
    };
  }
  if (!keys.length) return { ok: false, reason: 'aucune cle V2 dans le localStorage', keys, ignored };
  if (dryRun) {
    return { ok: true, dryRun: true, keys, count: keys.length, ignored, ignoredCount: ignored.length, user: state.user };
  }

  await hass.callWS({ type: WS_SET, config: local });
  const after = await probe(hass);
  const written = Object.keys(after.config);
  const manquantes = keys.filter(k => written.indexOf(k) < 0);
  return {
    ok: manquantes.length === 0,
    dryRun: false,
    count: keys.length,
    written: written.length,
    manquantes,
    ignoredCount: ignored.length,
    user: after.user,
    note: 'le localStorage n a pas ete efface',
  };
}

/**
 * Resume lisible avec relecture du serveur.
 *
 * `report()` seul travaillait sur l'etat capture au chargement de la page : apres
 * une migration il annoncait encore « 0 cle cote serveur », ce qui est trompeur.
 * Cette version resonde avant d'afficher.
 */
export async function reportLive(hass) {
  return report(await probe(hass));
}

/** Resume lisible a partir d'un etat deja connu. */
export function report(state) {
  if (!state) return 'Configuration : etat inconnu';
  const L = [];
  L.push('Loggia · configuration v' + CONFIG_VERSION);
  L.push('Mode : ' + (state.available ? 'serveur (composant loggia)' : 'local (localStorage)'));
  if (!state.available) L.push('Raison : ' + state.reason);
  if (state.user) L.push('Utilisateur : ' + state.user.name + (state.user.is_admin ? ' (admin)' : ''));
  const srv = Object.keys(state.config || {});
  const mig = Object.keys(collectMigratable());
  const leg = collectLegacy();
  L.push('Cles cote serveur : ' + srv.length);
  L.push('Cles V2 dans le navigateur : ' + mig.length);
  L.push('Reliquats V1 ignores : ' + leg.length + (leg.length ? ' (' + leg.slice(0, 5).join(', ') + (leg.length > 5 ? '...' : '') + ')' : ''));
  L.push('');
  L.push('Migration : loggiaConfig.migrate()       simulation, n ecrit rien');
  L.push('            loggiaConfig.migrate(false)  ecrit reellement');
  return L.join('\n');
}
