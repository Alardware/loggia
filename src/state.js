/**
 * Etat partage du dashboard : ce que la decouverte a trouve, la configuration
 * de l'utilisateur, et l'acces a Home Assistant.
 *
 * Ces valeurs vivaient dans App.jsx. Les en sortir permet a une vue chargee a
 * la demande de les lire sans reimporter App.jsx — ce qui creerait un cycle et
 * ramenerait tout le monolithe dans son propre morceau, annulant le decoupage.
 *
 * App reste seul a les ECRIRE, via `setLoggiaState`. Les vues ne font que lire.
 */

/** Index de la decouverte : zones, appareils, entites. */
export let LOGGIA_INDEX = null;
/** `loggia_entities` de l'utilisateur courant. */
export let LOGGIA_ENT = {};
/** Ce que resolve.js a trouve : thermostats, volets, cameras… */
export let LOGGIA_RESOLVED = null;
/** Configuration de l'utilisateur, telle que le serveur la connait. */
export let LOGGIA_CFG = {};

// Fournie par App : envoie un lot de reglages au serveur et rafraichit l'etat.
let cfgSave = null;

/**
 * Alimente l'etat. Appele par App a chaque rendu ; avant la premiere reponse
 * tout vaut null / {} et les lectures retombent sur leurs replis.
 */
/** Vrai des que le composant a repondu : le serveur fait alors autorite. */
export let LOGGIA_SERVER = false;

export function setLoggiaState({ index, ent, resolved, cfg, save, server }) {
  if (index !== undefined) LOGGIA_INDEX = index;
  if (ent !== undefined) LOGGIA_ENT = ent;
  if (resolved !== undefined) LOGGIA_RESOLVED = resolved;
  if (cfg !== undefined) LOGGIA_CFG = cfg;
  if (save !== undefined) cfgSave = save;
  if (server !== undefined) LOGGIA_SERVER = server;
}

/**
 * Reglage propre a l'appareil, que le serveur ne synchronise pas.
 *
 * Miroir exact de `est_personnelle()` cote composant : les deux listes doivent
 * dire la meme chose, sinon un reglage serait cherche la ou il n'est pas.
 */
const PERSONNELLES = new Set([
  'loggia_active_user', 'loggia-navoffset', 'loggia-topoffset', 'loggia-lastseen',
  'loggia_admin_pin',   // ne quitte jamais le navigateur
]);
export const estPersonnelle = (cle) => {
  const s = String(cle);
  return PERSONNELLES.has(s) || s.endsWith('panel');
};

/** Lecture tolerante du stockage local : une valeur illisible ne casse rien. */
export function readLS(key, fb) {
  try {
    const v = window.localStorage.getItem(key);
    return v ? JSON.parse(v) : fb;
  } catch (e) {
    console.warn('readLS: config corrompue, retour au defaut', key, e);
    return fb;
  }
}

/**
 * Reprend les reglages ecrits avant que le projet ne s'appelle Loggia.
 *
 * A faire AVANT la premiere lecture, donc avant le rendu : une installation
 * existante a tout son parametrage sous les anciennes cles — theme, marges,
 * panneaux replies, profils, et le code administrateur, qui ne quitte jamais
 * le navigateur et que le serveur ne peut donc pas rendre.
 *
 * Une reprise globale plutot qu'une reprise dans `readLS` : une vingtaine
 * d'endroits lisent `localStorage` directement, et les oublier au cas par cas
 * se serait vu au premier reglage disparu.
 *
 * Les anciennes cles sont laissees en place. Elles ne coutent qu'une entree
 * chacune, et une version precedente du dashboard retrouverait la sienne.
 */
export function migrerAnciennesCles() {
  try {
    const ls = window.localStorage;
    // On releve les cles avant d'ecrire : ajouter pendant le parcours
    // decalerait les index et sauterait des entrees.
    const vieilles = [];
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k && (k.indexOf('orion_') === 0 || k.indexOf('orion-') === 0)) vieilles.push(k);
    }
    vieilles.forEach((vieux) => {
      // `orion-skyorion` portait deux fois le nom du projet ; sa contrepartie
      // ne s'obtient pas en changeant le prefixe.
      const neuf = vieux === 'orion-skyorion' ? 'loggia-ciel' : 'loggia' + vieux.slice(5);
      if (ls.getItem(neuf) == null) ls.setItem(neuf, ls.getItem(vieux));
    });
  } catch (e) { /* stockage indisponible : rien a reprendre */ }
}

/**
 * Valeur d'un reglage. Le serveur fait foi — c'est lui qui suit l'utilisateur
 * d'un appareil a l'autre ; le localStorage ne sert que si le composant Loggia
 * n'est pas installe, ou avant que sa reponse arrive.
 */
export function cfgVal(key, fallback = null) {
  const v = LOGGIA_CFG ? LOGGIA_CFG[key] : undefined;
  if (v !== undefined && v !== null) return v;
  // Serveur joignable : il fait autorite sur tout ce qui est commun a la
  // maison. Sans cette regle, une valeur laissee dans le stockage d'un
  // appareil survit a sa suppression cote serveur et ne remonte jamais — deux
  // appareils finissent par afficher deux dashboards differents, l'un sur la
  // configuration partagee, l'autre sur un reliquat que plus personne ne voit.
  // Les reglages propres a l'appareil, eux, continuent de venir d'ici.
  if (LOGGIA_SERVER && !estPersonnelle(key)) return fallback;
  return readLS(key, fallback);
}

/**
 * Ecriture d'un lot de reglages — symetrique de `cfgVal`, et c'est tout son
 * interet : ce qui s'ecrit ici se relit la. Une ecriture purement locale serait
 * masquee par la valeur serveur au rechargement, et donnerait l'impression que
 * rien ne s'enregistre.
 *
 * `LOGGIA_CFG` est mis a jour tout de suite : le rendu suivant voit la nouvelle
 * valeur sans attendre l'aller-retour. Une valeur `null` efface la cle.
 */
export function cfgSet(patch) {
  if (!patch || typeof patch !== 'object') return;
  const next = { ...(LOGGIA_CFG || {}) };
  Object.keys(patch).forEach((k) => {
    if (patch[k] == null) delete next[k];
    else next[k] = patch[k];
  });
  LOGGIA_CFG = next;
  try {
    Object.keys(patch).forEach((k) => {
      if (patch[k] == null) localStorage.removeItem(k);
      else localStorage.setItem(k, JSON.stringify(patch[k]));
    });
  } catch (e) { /* stockage indisponible : la valeur serveur suffit */ }
  if (cfgSave) cfgSave(patch);
}

/**
 * L'objet `hass` du document parent. Le dashboard tourne dans une iframe de
 * meme origine : on remonte au document du haut quand il existe.
 */
export function getHass() {
  try {
    const doc = (window.top && window.top !== window && window.top.document)
      ? window.top.document : document;
    const el = doc.querySelector('home-assistant');
    return (el && el.hass) || null;
  } catch (e) { return null; }
}

/**
 * Script qui distribue une ration.
 *
 * Home Assistant n'expose rien de standard pour cela : c'est toujours un script
 * ecrit a la main. Faute d'etre designe dans la configuration, le bouton
 * « Distribuer une ration » disparaissait sans un mot — alors que le script
 * existe presque toujours, sous un nom qui le dit.
 *
 * On le reconnait donc au nom, comme les capteurs de l'aspirateur. Un script
 * mal devine ne casse rien : il n'est appele que sur un clic volontaire.
 */
export function feederScript(hass, cfg) {
  const designe = (cfg || {}).script;
  const S = (hass && hass.states) || {};
  if (designe && S[designe]) return designe;
  const mots = /(nourri|croquette|ration|gamelle|feed|distribu)/;
  return Object.keys(S).find(id => id.indexOf('script.') === 0 && mots.test(vacSlug(
    id.slice(7) + '_' + ((S[id].attributes && S[id].attributes.friendly_name) || '')
  ))) || null;
}

/* ── Page d'accueil de Home Assistant ───────────────────────────────────────
 *
 * Home Assistant retient par compte le panneau ouvert au demarrage, sous la cle
 * `core` des donnees d'interface. Son selecteur ne propose que les dashboards
 * Lovelace : un panneau ne s'y choisit pas, et l'utilisateur devait donc passer
 * par la barre laterale a chaque ouverture — ce qui recharge la vue.
 *
 * Loggia tourne dans le frontend de Home Assistant : il peut ecrire ce reglage
 * lui-meme, pour le compte connecte et lui seul.
 */

/** Chemin du panneau qui nous affiche, lu sur la page parente. */
export function cheminPanneau() {
  try {
    const chemin = (window.top && window.top.location && window.top.location.pathname) || '';
    return chemin.split('/').filter(Boolean)[0] || null;
  } catch (e) {
    return null;   // page parente d'une autre origine : on ne peut pas savoir
  }
}

/** Panneau actuellement ouvert au demarrage, ou null. */
export async function lirePageAccueil(hass) {
  if (!hass || typeof hass.callWS !== 'function') return null;
  try {
    const r = await hass.callWS({ type: 'frontend/get_user_data', key: 'core' });
    return ((r && r.value) || {}).default_panel || null;
  } catch (e) {
    return null;
  }
}

/**
 * Fait de `chemin` la page d'accueil du compte connecte.
 *
 * La valeur existante est relue et fusionnee : cette meme cle porte d'autres
 * reglages — le mode avance, notamment — qu'une ecriture seche effacerait.
 */
export async function definirPageAccueil(hass, chemin) {
  if (!hass || typeof hass.callWS !== 'function' || !chemin) return false;
  try {
    const r = await hass.callWS({ type: 'frontend/get_user_data', key: 'core' });
    const valeur = { ...((r && r.value) || {}), default_panel: chemin };
    await hass.callWS({ type: 'frontend/set_user_data', key: 'core', value: valeur });
    return true;
  } catch (e) {
    return false;
  }
}

// Domaines que le formulaire Paramètres → Entités sait éditer. Leur clé de
// premier niveau fait foi : c'est celle que l'utilisateur modifie, et deux
// descriptions concurrentes du même domaine finissent toujours par diverger.
export const ENT_ALIAS = {
  cameras: 'loggia_cameras',
  people: 'loggia_people',
  alarm: 'loggia_alarm',
  switchLights: 'loggia_switchlights',
  energy: 'loggia_energyHaids',
  weather: 'loggia_weather',
};

export function loggiaEnt(domain, fallback = null) {
  const alias = ENT_ALIAS[domain];
  if (alias) {
    // Une liste vidée volontairement reste vide : on ne ressuscite pas
    // l'ancienne description parce que la nouvelle ne contient rien.
    const edite = cfgVal(alias, null);
    if (edite != null) return edite;
  }
  const v = LOGGIA_ENT && LOGGIA_ENT[domain];
  return (v == null) ? fallback : v;
}

export const LOGGIA_SYNC_KEYS = ['loggia_rooms', 'loggia_energyHaids', 'loggia_alarm', 'loggia_weather', 'loggia_people', 'loggia_switchlights', 'loggia_cameras', 'loggia_medias', 'loggia_customviews', 'loggia_users', 'loggia_lights', 'loggia-theme', 'loggia-mode', 'loggia-ha', 'loggia-navbar', 'loggia-navoffset', 'loggia-topoffset', 'loggia-wxfx', 'loggia-ciel', 'loggia-langue'];

export const importLoggiaConfig = (txt) => {
  const o = JSON.parse(String(txt).trim());
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('invalide');
  // Miroir EXACT de la source : on purge d'abord toutes les clés synchronisables —
  // une clé absente de l'export = retour aux défauts (sinon une vieille config locale survivrait à l'import).
  LOGGIA_SYNC_KEYS.forEach(k => { try { localStorage.removeItem(k); } catch (e) {} });
  Object.keys(o).forEach(k => { if (LOGGIA_SYNC_KEYS.indexOf(k) >= 0 && typeof o[k] === 'string') { try { localStorage.setItem(k, o[k]); } catch (e) {} } });
  window.location.reload();
};

export const exportLoggiaConfig = () => { const o = {}; LOGGIA_SYNC_KEYS.forEach(k => { try { const v = localStorage.getItem(k); if (v != null) o[k] = v; } catch (e) {} }); return JSON.stringify(o); };

// ─────────────────────────────────────────────────────────────────────────────
// La configuration COMPLETE : celle du serveur, pas seulement du navigateur.
//
// Les trois fonctions ci-dessus travaillent sur le `localStorage`. C'etait la
// verite avant que la configuration soit partagee entre appareils ; depuis, la
// source est le composant, et `cfgVal` lui donne la priorite. Vider le seul
// stockage local ne reinitialisait donc rien : tout redescendait du serveur au
// rechargement suivant.
// ─────────────────────────────────────────────────────────────────────────────

/** Le pont vers le composant, ou null s'il n'est pas installe. */
const pont = () => {
  const h = getHass();
  return (h && typeof h.callWS === 'function') ? h : null;
};

/**
 * Toute la configuration, telle que le serveur la connait pour cet utilisateur.
 *
 * Le format porte sa version : un fichier exporte aujourd'hui doit rester
 * lisible quand la structure aura change.
 */
export async function exportConfigComplete() {
  const h = pont();
  let serveur = {};
  if (h) {
    try {
      const r = await h.callWS({ type: 'loggia/config/get' });
      serveur = (r && r.config) || {};
    } catch (e) { serveur = {}; }
  }
  // Le stockage local complete : une cle jamais synchronisee n'existe que la.
  const local = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (/^loggia[_-]/.test(k) && serveur[k] === undefined) local[k] = localStorage.getItem(k);
    }
  } catch (e) { /* stockage indisponible : l'export reste valable */ }
  return JSON.stringify({
    format: 'loggia-config',
    version: 1,
    exporte_le: new Date().toISOString(),
    source: h ? 'serveur' : 'appareil',
    config: { ...local, ...serveur },
  }, null, 2);
}

/**
 * Restaure une configuration exportee.
 *
 * L'ancien format — un objet plat de cles — reste accepte : un fichier
 * enregistre avant cette version doit pouvoir revenir.
 */
export async function importConfigComplete(txt) {
  const brut = JSON.parse(String(txt).trim());
  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) throw new Error('fichier invalide');
  const config = (brut.format === 'loggia-config' && brut.config) ? brut.config : brut;
  if (!config || typeof config !== 'object') throw new Error('aucune configuration dans ce fichier');

  const h = pont();
  if (h) {
    // On efface d'abord ce qui existe, sinon une cle absente de l'export
    // survivrait a la restauration — l'import doit etre un MIROIR.
    const actuelle = await h.callWS({ type: 'loggia/config/get' }).catch(() => null);
    const purge = {};
    Object.keys((actuelle && actuelle.config) || {}).forEach(k => { purge[k] = null; });
    if (Object.keys(purge).length) await h.callWS({ type: 'loggia/config/set', config: purge });
    const aEcrire = {};
    Object.keys(config).forEach(k => { if (config[k] != null) aEcrire[k] = config[k]; });
    if (Object.keys(aEcrire).length) await h.callWS({ type: 'loggia/config/set', config: aEcrire });
  }
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (/^loggia[_-]/.test(k)) localStorage.removeItem(k);
    }
    Object.keys(config).forEach(k => {
      const v = config[k];
      if (typeof v === 'string') localStorage.setItem(k, v);
    });
  } catch (e) { /* le serveur fait foi de toute facon */ }
}

/**
 * Remise a zero : le dashboard redevient ce qu'il est sur une installation
 * neuve, decouverte comprise.
 *
 * Une cle mise a `null` est supprimee par le composant DES DEUX COTES — la
 * partie commune et la partie personnelle. On lit donc ce qui existe pour le
 * demander explicitement, plutot que de se fier a une liste ecrite ici, qui
 * oublierait les cles ajoutees depuis.
 *
 * L'appelant est cense avoir propose un export d'abord : cette operation ne se
 * rattrape pas autrement.
 */
export async function resetLoggiaComplet() {
  const h = pont();
  if (h) {
    try {
      const r = await h.callWS({ type: 'loggia/config/get' });
      const patch = {};
      Object.keys((r && r.config) || {}).forEach(k => { patch[k] = null; });
      if (Object.keys(patch).length) await h.callWS({ type: 'loggia/config/set', config: patch });
      // Les reglages personnels de ce compte, que le patch ci-dessus ne couvre
      // que si l'utilisateur est administrateur.
      await h.callWS({ type: 'loggia/config/delete' }).catch(() => null);
    } catch (e) { /* on vide au moins l'appareil */ }
  }
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (/^loggia[_-]/.test(k)) localStorage.removeItem(k);
    }
  } catch (e) { /* rien de plus a faire */ }
}


// Interrupteurs (domaine switch) à traiter comme des lumières on/off dans la vue Lumières.
// Interrupteurs traités comme des lumières — choix de l'utilisateur, sans
// défaut : une installation neuve n'en déclare aucun.
export const switchLightsCfg = () => (cfgVal('loggia_switchlights', []) || []).filter(Boolean);

// Reliquat de transition : un choix explicite reste prioritaire, mais il n'y a
// plus d'entite par defaut — c'est la decouverte qui trouve le panneau.
export const secAlarm = () => cfgVal('loggia_alarm', '') || '';

export function normRooms(raw) {
  if (!Array.isArray(raw) || !raw.length) return discoveredRooms() || [];
  const byName = {};
  (discoveredRooms() || []).forEach(d => { byName[d.room] = d; });
  const out = raw.map(x => {
    if (typeof x === 'string') return byName[x] || { room: x, haid: { temp: null, humidity: null, co2: null, lights: [] } };
    if (!x || !x.room) return null;
    const d = byName[x.room], h = x.haid || {};
    return { ...x, haid: { temp: h.temp || (d && d.haid.temp) || null, humidity: h.humidity || (d && d.haid.humidity) || null, co2: h.co2 || (d && d.haid.co2) || null, lights: Array.isArray(h.lights) ? h.lights : [] } };
  }).filter(Boolean);
  return out.length ? out : (discoveredRooms() || []);
}
// Illustrations SVG des plantes (fournies par le user, réf. design « Objets connectés ») — data URI CSS.

export const medPlayers = () => {
  const raw = cfgVal('loggia_medias', null);
  // Sans choix explicite : les lecteurs trouvés, chacun avec son compagnon.
  if (!Array.isArray(raw) || !raw.length) return medResolved().map((m, i) => ({ ...m, c: MED_COLORS[i % MED_COLORS.length] }));
  return raw.filter(p => p && p.haid).map((p, i) => ({ id: p.id || p.haid, name: p.name || p.haid.replace('media_player.', '').replace(/_/g, ' '), haid: p.haid, ma: p.ma || undefined, c: p.c || MED_COLORS[i % MED_COLORS.length] }));
};

// Compagnon manquant dans une configuration ancienne : la résolution le retrouve
// par l'appareil. Un suffixe écrit en dur (`_2`) casse au premier renommage.
export const medCompanion = (haid) => {
  const found = medResolved().find(m => m.haid === haid || m.ma === haid);
  return (found && (found.haid === haid ? found.ma : found.haid)) || null;
};
// Logos des services, en SVG local — le projet n'embarque aucune ressource
// externe. Chaque `logo` se dessine dans un carre de 32, centre sur (0,0).

// Capteurs d'énergie : configuration de l'utilisateur, puis ce que le tableau de
// bord Énergie natif permet de déduire, puis les constantes en repli. Les cases
// sans équivalent standard restent nulles et la vue ne les affiche pas.
export function enHaids() {
  const r = LOGGIA_RESOLVED && LOGGIA_RESOLVED.energy;
  const fromPrefs = (r && r.available) ? r.haids : null;
  // loggiaEnt('energy') lit déjà loggia_energyHaids en priorité (cf. ENT_ALIAS).
  const cfg = loggiaEnt('energy', null);
  const out = {};
  if (fromPrefs) Object.keys(fromPrefs).forEach(k => { if (fromPrefs[k]) out[k] = fromPrefs[k]; });
  if (cfg && typeof cfg === 'object') Object.keys(cfg).forEach(k => { if (cfg[k]) out[k] = cfg[k]; });
  return out;
}
// Appareils suivis : ceux de la configuration, sinon ceux que le tableau de bord
// Énergie déclare. L'habillage (icône, couleur, illustration) tourne sur la
// palette existante, Home Assistant ne le fournissant pas.

// Configurable (Paramètres → Entités) : {name, haid, ma?} — id/couleur auto-complétés.
export const MED_COLORS = ['var(--o-cyan)', 'var(--o-accent)', 'var(--o-purple)', 'var(--o-ok)', '#ff8a4c', '#f472b6', '#8fb7ff', '#ffce73'];

// Lecteurs multimédia : la configuration, sinon ce que la résolution apparie.
export function medResolved() {
  const r = LOGGIA_RESOLVED && LOGGIA_RESOLVED.media;
  return (r && r.available) ? r.list : [];
}

// Répare les loggia_rooms anciens (tableau de chaînes, haid manquants) en refusionnant les capteurs
// des défauts par nom de pièce — sans toucher aux personnalisations valides.
// Pièces trouvées par la découverte, au format attendu par les vues. C'est le
// repli quand l'utilisateur n'a rien choisi. Il n'y a plus de liste écrite :
// une pièce non trouvée n'apparaît pas, plutôt que d'apparaître vide.
export function discoveredRooms() {
  const r = LOGGIA_RESOLVED && LOGGIA_RESOLVED.rooms;
  const src = (r && r.suggested && r.suggested.length) ? r.suggested : null;
  if (!src) return null;
  return src.map(a => ({ room: a.name, haid: { temp: a.temp || null, humidity: a.hum || null, co2: a.co2 || null } }));
}

/* ── Pièces de l'aspirateur ─────────────────────────────────────────────────
 *
 * Deux listes existent et ne se recouvrent pas :
 *
 *  - le ROBOT publie `attributes.rooms` : la vérité sur le découpage de la
 *    carte, mais sous des clés de TYPE de pièce (« bedroom », « salle_de_bains »)
 *    qui ne portent ni couleur, ni interrupteur ;
 *  - la CONFIGURATION porte des zones nommées par l'utilisateur, avec couleur,
 *    icône et l'`input_boolean` que lit son script de nettoyage — mais elle
 *    dérive dès que le robot recartographie, et il n'y a pas d'écran pour
 *    l'étendre.
 *
 * On garde donc le robot comme source des pièces, et on rattache à chacune la
 * zone configurée qui lui correspond, pour qu'un clic sur le plan fasse
 * exactement ce que fait le bouton de la liste : basculer le même interrupteur.
 */
const vacSlug = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
// « salle_de_bains » et « salle_de_bain » sont la même pièce : le pluriel ne
// doit pas empêcher le rapprochement.
const vacSing = (s) => s.replace(/s(?=_|$)/g, '');

/** Proximité de deux libellés, du plus sûr (4) au plus vague (1) ; 0 = rien. */
function vacScore(cle, txt) {
  const a = vacSing(vacSlug(cle)), b = vacSing(vacSlug(txt));
  if (!a || !b) return 0;
  if (a === b) return 4;
  if (b.endsWith('_' + a) || a.endsWith('_' + b)) return 3;
  if (b.indexOf('_' + a + '_') >= 0) return 2;
  const da = a.split('_').pop(), db = b.split('_').pop();
  return (da && da === db) ? 1 : 0;
}

/**
 * Appariement glouton : on prend d'abord les rapprochements les plus sûrs, et
 * chaque candidat ne sert qu'une fois. Sans cela « Chambre » attraperait
 * « chambre_enfant » avant que « Chambre enfant » ait sa chance.
 * @returns {Object} indice de pièce → indice de candidat
 */
function vacApparier(pieces, cands, prisP, prisC) {
  const paires = [];
  pieces.forEach((p, i) => {
    if (prisP[i]) return;
    cands.forEach((c, j) => {
      if (prisC[j]) return;
      let s = 0;
      c.txts.forEach(t => { const v = vacScore(p.cle, t); if (v > s) s = v; });
      if (s > 0) paires.push({ i, j, s });
    });
  });
  paires.sort((x, y) => y.s - x.s);
  const res = {};
  paires.forEach(({ i, j }) => {
    if (prisP[i] || prisC[j]) return;
    prisP[i] = 1; prisC[j] = 1; res[i] = j;
  });
  return res;
}

/** Préfixe commun de plusieurs identifiants, coupé au dernier « _ ». */
function vacPrefixe(ids) {
  if (ids.length < 2) return null;
  let p = ids[0];
  ids.forEach(id => { let i = 0; while (i < p.length && i < id.length && p[i] === id[i]) i++; p = p.slice(0, i); });
  const c = p.lastIndexOf('_');
  return c > 0 ? p.slice(0, c + 1) : null;
}

/** Joli nom : « salle_de_bains » → « Salle de bains ». */
const vacNom = (cle) => { const t = String(cle).replace(/_/g, ' ').trim(); return t.charAt(0).toUpperCase() + t.slice(1); };

/**
 * Entités du robot trouvées toutes seules.
 *
 * Usure des brosses, mode de travail, débit d'eau : ces entités existent chez
 * qui a un robot, mais rien ne les désigne. Les faire saisir une par une dans
 * les réglages était le seul moyen de les afficher — autant dire qu'elles ne
 * s'affichaient jamais.
 *
 * On les reconnaît à leur nom, en français comme en anglais, parmi les seules
 * entités qui partagent le préfixe de l'entité `vacuum` : un robot déclaré
 * `vacuum.<nom>` ne fait regarder que `sensor.<nom>_*`, `select.<nom>_*`, etc.
 * Rien n'est inventé — un rôle sans entité reste vide, et la ligne
 * correspondante n'apparaît pas.
 */
export function vacSensors(hass, vacId) {
  const S = (hass && hass.states) || {};
  const base = String(vacId || '').split('.')[1] || '';
  if (!base) return {};
  const cands = Object.keys(S).filter(id => {
    const objet = id.split('.')[1];
    return objet && objet.indexOf(base + '_') === 0;
  });
  // Identifiant ET nom convivial : selon les intégrations, le mot utile est
  // dans l'un ou dans l'autre.
  const mots = (id) => {
    const e = S[id];
    return vacSlug(id.split('.')[1] + '_' + ((e && e.attributes && e.attributes.friendly_name) || ''));
  };
  const trouve = (dom, ...tests) => cands.find(id => id.indexOf(dom + '.') === 0 && tests.every(re => re.test(mots(id)))) || null;
  return {
    brushMain: trouve('sensor', /bross|brush/, /princip|main/),
    brushSide: trouve('sensor', /bross|brush/, /lateral|side/),
    mop: trouve('sensor', /serpilli|mop/),
    filter: trouve('sensor', /filtr|filter/),
    care: trouve('sensor', /entretien|care/),
    areaTotal: trouve('sensor', /surface|area/, /total/),
    durTotal: trouve('sensor', /duree|duration/, /total/),
    count: trouve('sensor', /nombre|count/, /nettoyage|clean/),
    error: trouve('sensor', /erreur|error/),
    mopOn: trouve('binary_sensor', /serpilli|mop/),
    workMode: trouve('select', /mode/),
    waterFlow: trouve('select', /water|eau|debit/),
    lastTask: trouve('event', /tache|task/),
  };
}

/**
 * Libellé d'une option de `select`. Home Assistant ne publie pas ses
 * traductions dans l'état : les options arrivent en anglais technique
 * (« sweeping_and_mopping »). On traduit les mots courants et on humanise le
 * reste, plutôt que d'afficher l'identifiant brut.
 */
const VAC_MOTS = {
  sweeping: 'Aspiration', mopping: 'Serpillière', vacuuming: 'Aspiration',
  sweeping_and_mopping: 'Aspiration + serpillière', mopping_after_sweeping: 'Serpillière après aspiration',
  low: 'Faible', medium: 'Moyen', high: 'Élevé', ultrahigh: 'Maximum', ultra_high: 'Maximum',
  quiet: 'Silencieux', normal: 'Normal', max: 'Maximum', max_plus: 'Maximum +',
  standard: 'Standard', strong: 'Fort', off: 'Arrêt', auto: 'Auto', customize: 'Personnalisé',
};
export function vacOption(opt) {
  const k = vacSlug(opt);
  return VAC_MOTS[k] || vacNom(k);
}

/**
 * Pièces à afficher : `{ id, name, color, icon, toggle, segments }`.
 * `toggle` peut être absent — une pièce que le robot connaît mais dont aucun
 * interrupteur ne parle reste visible, simplement pas sélectionnable.
 * Sans robot joignable, la configuration passe telle quelle : rien ne change
 * pour qui n'a pas d'entité `vacuum` exposant ses pièces.
 */
export function vacRooms(hass, vacId, zones = []) {
  const st = (hass && hass.states && vacId) ? hass.states[vacId] : null;
  const brut = st && st.attributes && st.attributes.rooms;
  if (!brut || typeof brut !== 'object') return zones;
  // Une clé peut porter PLUSIEURS segments quand deux pièces partagent le même
  // type : elles se nettoient ensemble, comme une seule entrée.
  const pieces = Object.keys(brut).map(cle => {
    const v = brut[cle];
    const segs = (Array.isArray(v) ? v : [v]).map(Number).filter(n => !isNaN(n));
    return { cle, segments: segs, id: 'seg:' + segs.join('-') };
  }).filter(p => p.segments.length);
  if (!pieces.length) return zones;

  const prisP = {}, prisZ = {};
  const czones = zones.map(z => ({ txts: [z.id, z.name], z }));
  const parZone = vacApparier(pieces, czones, prisP, prisZ);

  // Les zones configurées ne couvrent que ce que l'utilisateur avait saisi. Les
  // autres pièces cherchent leur interrupteur parmi ceux qui partagent le
  // préfixe des interrupteurs déjà connus — « input_boolean.xxx_nettoyer_ »
  // chez qui les a nommés ainsi, rien du tout chez les autres.
  const prefixe = vacPrefixe(zones.map(z => z.toggle).filter(Boolean));
  const S = (hass && hass.states) || {};
  const dejaPris = zones.map(z => z.toggle).filter(Boolean);
  const cbool = !prefixe ? [] : Object.keys(S)
    .filter(id => id.indexOf(prefixe) === 0 && dejaPris.indexOf(id) < 0)
    .map(id => ({ txts: [id, (S[id].attributes && S[id].attributes.friendly_name) || ''], toggle: id }));
  const parBool = vacApparier(pieces, cbool, prisP, {});

  // Dernier recours : s'il ne reste qu'une pièce sans interrupteur et qu'une
  // seule zone configurée sans emploi, c'est forcément elle. C'est ce qui
  // rattache « bedroom » à « Chambre », qu'aucune comparaison de texte ne peut
  // rapprocher.
  const restP = pieces.map((p, i) => i).filter(i => !prisP[i]);
  const restZ = czones.map((c, j) => j).filter(j => !prisZ[j]);
  if (restP.length === 1 && restZ.length === 1) { parZone[restP[0]] = restZ[0]; prisP[restP[0]] = 1; prisZ[restZ[0]] = 1; }

  // Palette des pièces nouvelles : on écarte les couleurs déjà portées par une
  // zone configurée, sinon deux pièces voisines finissent de la même teinte.
  const prises = zones.map(z => z.color);
  const libres = MED_COLORS.filter(c => prises.indexOf(c) < 0);
  const palette = libres.length ? libres : MED_COLORS;
  let nouv = 0;

  return pieces.map((p, i) => {
    const z = parZone[i] != null ? czones[parZone[i]].z : null;
    const b = parBool[i] != null ? cbool[parBool[i]].toggle : null;
    return {
      id: p.id,
      segments: p.segments,
      name: (z && z.name) || vacNom(p.cle),
      color: (z && z.color) || palette[nouv++ % palette.length],
      icon: (z && z.icon) || null,
      toggle: (z && z.toggle) || b || null,
      // Rang de la zone configurée : conserve l'ordre auquel l'utilisateur est
      // habitué, les pièces nouvelles venant ensuite par numéro de segment.
      rang: parZone[i] != null ? parZone[i] : 1000 + p.segments[0],
    };
  }).sort((a, b) => a.rang - b.rang);
}
