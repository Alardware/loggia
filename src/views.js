// ─────────────────────────────────────────────────────────────────────────────
// Disponibilite des vues.
//
// Une vue n'a de sens que si l'installation a de quoi la remplir. Ce fichier
// repond a une seule question, au meme endroit pour tout le monde : la vue X
// a-t-elle quelque chose a montrer, et sinon pourquoi ?
//
// Trois consommateurs : les barres de navigation (qui masquent), la recherche
// (qui n'y renvoie pas), et la vue elle-meme (qui affiche un etat vide quand on
// l'atteint quand meme — lien direct, ou vue reaffichee a la main depuis
// Parametres → Vues).
//
// Regle de prudence : tant que la decouverte n'a pas repondu, TOUT est
// disponible. Masquer d'abord pour reafficher ensuite ferait clignoter la
// navigation au demarrage.
// ─────────────────────────────────────────────────────────────────────────────

/** Vues qui existent quelle que soit l'installation. */
export const VIEW_ALWAYS = ['accueil', 'parametres'];

/** Tous les identifiants de vue que le dashboard sait afficher. */
export const VIEW_IDS = [
  'accueil', 'pieces', 'scenes', 'objets', 'energie', 'securite', 'systeme',
  'lumieres', 'climat', 'volets', 'aspirateur', 'croquettes', 'medias', 'meteo', 'parametres',
];

const OK = { ok: true, reason: null };
const no = (reason) => ({ ok: false, reason });

/** Toutes disponibles — etat d'attente, et repli si le calcul echoue. */
export function allAvailable() {
  const out = {};
  VIEW_IDS.forEach(v => { out[v] = OK; });
  return out;
}

/**
 * Un domaine configure ne compte que si au moins une de ses entites existe
 * vraiment : une configuration heritee d'une autre installation ne doit pas
 * faire apparaitre une vue vide.
 */
function configLive(userCfg, domain, states) {
  const ent = userCfg && userCfg.loggia_entities && userCfg.loggia_entities[domain];
  if (!ent) return false;
  const ids = JSON.stringify(ent).match(/[a-z_]+\.[a-z0-9_]+/g);
  if (!ids || !ids.length) return false;
  if (!states) return true;
  return ids.some(id => !!states[id]);
}

export function viewAvailability(ctx) {
  if (!ctx || !ctx.ready || !ctx.caps) return allAvailable();

  const caps = ctx.caps;
  const res = ctx.resolved || {};
  const states = ctx.states || {};
  const userCfg = ctx.userCfg || {};
  const has = caps.has || {};
  const views = caps.views || {};
  const cfg = (d) => configLive(userCfg, d, states);
  const out = {};

  out.accueil = OK;
  out.parametres = OK;

  const rooms = res.rooms || {};
  const nRooms = (rooms.rooms || []).length || (rooms.suggested || []).length;
  out.pieces = nRooms ? OK : no('aucune zone Home Assistant ne contient d’équipement d’ambiance');

  out.scenes = (has.scene || has.script) ? OK : no('aucune scène ni script dans Home Assistant');

  // Objets est un regroupement : il suffit qu'un seul de ses appareils existe.
  const objets = has.vacuum || has.lawn_mower || has.media_player || cfg('feeder') || cfg('plants');
  out.objets = objets ? OK : no('aucun appareil à regrouper');

  out.lumieres = views.lumieres ? OK : no('aucune lumière (domaine light)');
  out.climat = views.climat ? OK : no('aucun thermostat ni chauffe-eau');
  out.volets = views.volets ? OK : no('aucun volet (domaine cover)');
  out.aspirateur = views.aspirateur ? OK : no('aucun aspirateur (domaine vacuum)');
  out.medias = views.medias ? OK : no('aucun lecteur (domaine media_player)');
  out.securite = views.securite ? OK : no('aucune caméra ni panneau d’alarme');

  // Météo : une entité `weather` suffit — toute installation Home Assistant en
  // déclare une par défaut, mais on ne le suppose pas.
  const wx = Object.keys(states).some(id => id.indexOf('weather.') === 0) || cfg('weather');
  out.meteo = wx ? OK : no('aucune entité météo (domaine weather)');

  // Énergie : des capteurs de puissance ne suffisent pas, encore faut-il savoir
  // LESQUELS lire — d'où le tableau de bord Énergie natif, ou une configuration.
  const energyReady = (res.energy && res.energy.available) || cfg('energy');
  out.energie = (views.energie && energyReady) ? OK
    : !views.energie ? no('aucun capteur de puissance ou d’énergie')
      : no('le tableau de bord Énergie de Home Assistant n’est pas configuré');

  const sysReady = (res.system && res.system.available) || cfg('system');
  out.systeme = sysReady ? OK : no('aucune machine supervisée — pas de capteur de charge processeur');

  // Croquettes : distributeur maison, sans équivalent standard. Configuration
  // obligatoire, rien à découvrir.
  out.croquettes = cfg('feeder') ? OK : no('aucun distributeur de croquettes configuré');

  return out;
}

/** Lecture tolerante : inconnu = disponible. */
export function isViewAvailable(views, vid) {
  const v = views && views[vid];
  return !v || v.ok !== false;
}

/** Motif de l'indisponibilite, ou null. */
export function viewReason(views, vid) {
  const v = views && views[vid];
  return (v && v.ok === false) ? v.reason : null;
}
