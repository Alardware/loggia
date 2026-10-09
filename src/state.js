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

import { estCleAppareil, estCleServeur, horsSauvegarde } from './config.js';

/** Index de la decouverte : zones, appareils, entites. */
export let LOGGIA_INDEX = null;
/** `loggia_entities` de l'utilisateur courant. */
let LOGGIA_ENT = {};
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
let LOGGIA_SERVER = false;

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
  // Restent attachees a l'appareil : ses marges d'ecran et la trace du
  // dernier passage. Le profil actif et le code administrateur ont rejoint la
  // maison le 03/09 — ils differaient d'un appareil a l'autre, et meme entre
  // l'acces local et l'acces distant, faute d'origine commune.
  'loggia-navoffset', 'loggia-topoffset', 'loggia-lastseen',
]);
export const estPersonnelle = (cle) => {
  const s = String(cle);
  return PERSONNELLES.has(s) || s.endsWith('panel');
};

/** Lecture tolerante du stockage local : une valeur illisible ne casse rien. */
export function readLS(key, fb) {
  // Sans navigateur (un test qui rend un composant, ADR 0069) : le defaut,
  // sans crier a la corruption.
  if (typeof window === 'undefined') return fb;
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
      /* `orion-skyorion` portait deux fois le nom du projet, et sa
       * contrepartie ne s'obtenait pas en changeant le prefixe. Ce cas
       * particulier est parti le 24/09 (plan S5) : il recopiait un reglage
       * vers `loggia-ciel`, que plus rien ne lit depuis que le ciel etoile a
       * ete retire. Une cle `orion-skyorion` restante devient donc
       * `loggia-skyorion`, qui ne sert a rien non plus — mais au moins la
       * regle est UNE, au lieu d'une exception qui promet une reprise. */
      const neuf = 'loggia' + vieux.slice(5);
      if (ls.getItem(neuf) == null) ls.setItem(neuf, ls.getItem(vieux));
    });
  } catch { /* stockage indisponible : rien a reprendre */ }
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
 *
 * Rend l'ISSUE, en promesse qui ne rejette jamais (audit du 03/10) : `false`
 * quand le composant a refuse le lot, `null` quand il n'est pas arrive — le
 * transport a coupe et il attend au carnet (`enattente.js`) —, `true` sinon,
 * y compris sans composant. Presque personne ne la lit ; l'accueil, si : une
 * grille refusee ne doit pas rester a l'ecran.
 */
export function cfgSet(patch) {
  if (!patch || typeof patch !== 'object') return Promise.resolve(null);
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
  } catch { /* stockage indisponible : la valeur serveur suffit */ }
  return Promise.resolve(cfgSave ? cfgSave(patch) : true);
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
  } catch { return null; }
}

/**
 * Le compte Home Assistant de cette session est-il ORDINAIRE (03/10) ?
 *
 * Il ne voit pas les gestes qu'il ne pourra jamais enregistrer : le composant
 * reserve la configuration de la maison aux administrateurs (`store.py`), et
 * un geste qui semble marcher puis revient au rechargement ment. Ranger ses
 * cartes et changer l'apparence lui restent ouverts — rien de cela ne passe
 * par ici.
 *
 * C'est le COMPTE qui compte, jamais le profil Loggia : un profil Admin se
 * choisit au code depuis n'importe quel compte, et c'est celui d'une
 * installation neuve.
 *
 * « Ordinaire », seulement quand Home Assistant le dit en toutes lettres
 * (`is_admin === false`), comme la vue Systeme. Sur un doute — pas encore de
 * compte, la demonstration, un test —, rien ne se masque : un administrateur
 * ne doit jamais perdre un geste, et le serveur tranche de toute facon.
 */
export function compteOrdinaire(hass) {
  const h = hass || getHass();
  return !!(h && h.user && h.user.is_admin === false);
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
  } catch {
    return null;   // page parente d'une autre origine : on ne peut pas savoir
  }
}

/** Panneau actuellement ouvert au demarrage, ou null. */
export async function lirePageAccueil(hass) {
  if (!hass || typeof hass.callWS !== 'function') return null;
  try {
    const r = await hass.callWS({ type: 'frontend/get_user_data', key: 'core' });
    return ((r && r.value) || {}).default_panel || null;
  } catch {
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
  } catch {
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
  /* Les POSTES de consommation ont leur clé, comme les capteurs d'énergie à
   * côté desquels ils vivent. Sans elle, ils ne venaient que de
   * `loggia_entities` — que le serveur remplit, et que la démonstration, qui
   * n'en a pas, ne pouvait pas garnir : la section restait vide dans la
   * vitrine (06/10). */
  energyDevices: 'loggia_energyDevices',
  weather: 'loggia_weather',
  // Le distributeur (14/09) : une cle a lui, comme les autres, sinon il
  // n'existe que par `loggia_entities` — que la demo, sans serveur, n'a pas.
  feeder: 'loggia_feeder',
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

/* Le code administrateur ne vit plus dans le navigateur (18/09) : hache par le
 * composant, verifie par lui. Une copie laissee la par les versions d'avant
 * s'efface au premier chargement. */
try { localStorage.removeItem('loggia_admin_pin'); } catch { /* stockage indisponible, ou pas de navigateur */ }
/* Quatre cles sont sorties de cette liste le 24/09 (plan S5) parce que RIEN
 * ne les lisait, nulle part : `loggia_lightlayout`, `loggia_climlayout` et
 * `loggia_medlayout` — les vues Lumieres, Climat et Medias n'ont pas d'editeur
 * d'agencement, ces trois-la etaient synchronisees pour personne — et
 * `loggia-ciel`, dont la fonctionnalite (le ciel etoile) a ete supprimee sans
 * elle. Les retirer n'efface aucune donnee : une valeur deja posee reste ou
 * elle est, elle cesse seulement d'etre portee et exportee. */
export const LOGGIA_SYNC_KEYS = ['loggia_rooms', 'loggia_energyHaids', 'loggia_alarm', 'loggia_weather', 'loggia_people', 'loggia_switchlights', 'loggia_cameras', 'loggia_medias', 'loggia_customviews', 'loggia_users', 'loggia_assistant', 'loggia_accueil', 'loggia_look', 'loggia_active_user', 'loggia_roomlayout', 'loggia_objlayout', 'loggia_coverlayout', 'loggia_enlayout', 'loggia_seclayout', 'loggia_camdispo', 'loggia_icones', 'loggia_lights', 'loggia_climate', 'loggia-theme', 'loggia-mode', 'loggia-ha', 'loggia-navbar', 'loggia-navoffset', 'loggia-topoffset', 'loggia-wxfx', 'loggia-langue'];

/** Les cles que le MOTEUR lit : la configuration de la maison, pas l'apparence.
 *
 * `LOGGIA_SYNC_KEYS` melange deux choses, et c'est justifie pour ce qu'il fait
 * — theme, marges et langue suivent la maison au meme titre que les pieces.
 * Mais la disponibilite des vues ne depend que de la configuration, et les
 * preferences d'apparence sont ecrites EN CLAIR (`loggia-mode` vaut `dark`, pas
 * `"dark"`). Les relire avec `readLS`, qui attend du JSON, faisait annoncer
 * « config corrompue » a chaque ouverture sur une valeur parfaitement valide.
 *
 * Le moteur ne lit de toute facon que des cles en `loggia_` : voir `resolve.js`
 * et `views.js`, ou chaque acces a `userCfg` porte ce prefixe.
 */
export const LOGGIA_CONFIG_KEYS = LOGGIA_SYNC_KEYS.filter(k => k.indexOf('loggia_') === 0);

// ─────────────────────────────────────────────────────────────────────────────
// La configuration COMPLETE : celle du serveur, pas seulement du navigateur.
//
// Il y avait ici un export et un import qui ne lisaient que le `localStorage`.
// C'etait la verite avant que la configuration soit partagee entre appareils ;
// depuis, la source est le composant, et `cfgVal` lui donne la priorite. Vider
// le seul stockage local ne reinitialisait rien : tout redescendait du serveur
// au rechargement suivant. Plus personne ne les appelait (24/09, plan S4) : ce
// qui suit les remplace, et interroge le serveur.
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
    // Le serveur injoignable : pas de sauvegarde du tout, plutot qu'un fichier
    // presque vide qui aurait l'air d'une sauvegarde (audit 18/09).
    const r = await h.callWS({ type: 'loggia/config/get' });
    serveur = (r && r.config) || {};
  }
  /* Le stockage local complete : une cle jamais synchronisee n'existe que la.
   *
   * Sauf les cles purement locales. Le code PIN administrateur repond au motif
   * `loggia_`, le serveur ne l'a jamais — donc `serveur[k] === undefined` — et il
   * atterrissait en clair dans le fichier exporte : celui que l'on envoie au
   * support ou que l'on passe a un autre appareil. `config.js` fait ce filtre
   * depuis toujours, il manquait ici. Le composant Python refusait bien la cle a
   * l'enregistrement, mais le mal etait fait : lue, ecrite, transmise.
   *
   * Les valeurs locales sont aussi decodees : elles sortent de `localStorage`
   * sous forme de chaine, alors que celles du serveur arrivent deja converties.
   * Melangees telles quelles, un `loggia_rooms` local revenait a l'import en JSON
   * double-encode — `normRooms` n'y voyait plus un tableau et rendait la main a
   * la decouverte. Pieces, lecteurs et vues personnalisees disparaissaient.
   *
   * Ni ce que l'appareil sait de lui-meme — la photo de fond, le journal lu,
   * l'ecran de veille —, ni ce que le serveur calcule : voir `horsSauvegarde`
   * (config.js). Le filtre vaut aussi pour le SERVEUR : un ancien import y a
   * parfois range la photo d'un appareil dans la partie commune.
   */
  const garde = {};
  Object.keys(serveur).forEach((k) => { if (!horsSauvegarde(k)) garde[k] = serveur[k]; });
  const local = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!/^loggia[_-]/.test(k) || horsSauvegarde(k) || serveur[k] !== undefined) continue;
      const brut = localStorage.getItem(k);
      try { local[k] = JSON.parse(brut); } catch { local[k] = brut; }
    }
  } catch { /* stockage indisponible : l'export reste valable */ }
  return JSON.stringify({
    format: 'loggia-config',
    version: 1,
    exporte_le: new Date().toISOString(),
    source: h ? 'serveur' : 'appareil',
    config: { ...local, ...garde },
  }, null, 2);
}

/** Un refus de lecture, avec un code que l'ecran traduit. */
function refusImport(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

/**
 * Lit un fichier de configuration SANS RIEN ECRIRE : ce qu'on en garde, et de
 * quoi le resumer avant de demander confirmation.
 *
 * L'import prenait n'importe quel objet JSON pour une configuration : un
 * `package.json` choisi par erreur dans les telechargements remplacait la
 * maison par ses `dependencies`, sans un mot (audit du 03/10). Seules les cles
 * Loggia passent desormais, et un fichier qui n'en contient aucune est refuse
 * avant tout envoi.
 *
 * L'ancien format — un objet plat de cles — reste accepte : un fichier
 * enregistre avant la version 1 doit pouvoir revenir.
 *
 * Refus (`Error` portant `code`) : `illisible`, `pas_loggia`, `vide`.
 */
export function lireConfigImport(txt) {
  let brut;
  try { brut = JSON.parse(String(txt).trim()); } catch { throw refusImport('illisible'); }
  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) throw refusImport('illisible');
  const export1 = brut.format === 'loggia-config';
  const source = export1 ? brut.config : brut;
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw refusImport(export1 ? 'vide' : 'pas_loggia');
  const config = {};
  const ignorees = [];
  Object.keys(source).forEach((k) => {
    if (source[k] == null) return;
    // Le PIN, la photo d'un autre appareil, une cle etrangere : rien de tout
    // cela ne remonte, meme d'un fichier ancien ou bricole a la main.
    if (horsSauvegarde(k)) { ignorees.push(k); return; }
    config[k] = source[k];
  });
  if (!Object.keys(config).length) throw refusImport(export1 ? 'vide' : 'pas_loggia');
  const compte = (v) => (Array.isArray(v) ? v.length : 0);
  const date = export1 && typeof brut.exporte_le === 'string' && !isNaN(Date.parse(brut.exporte_le))
    ? brut.exporte_le : null;
  return {
    config,
    ignorees,
    resume: { exporteLe: date, cles: Object.keys(config).length, pieces: compte(config.loggia_rooms), profils: compte(config.loggia_users) },
  };
}

/**
 * Restaure une configuration exportee : le texte du fichier, ou ce qu'en a
 * deja lu `lireConfigImport`.
 */
export async function importConfigComplete(entree) {
  const { config } = typeof entree === 'string' ? lireConfigImport(entree) : entree;

  const h = pont();
  if (h) {
    // L'import est un MIROIR : une cle absente du fichier ne doit pas survivre
    // a la restauration. Sans lecture, pas de miroir — on ecrirait par-dessus
    // sans avoir efface (audit 18/09). L'appelant affiche l'erreur.
    const actuelle = await h.callWS({ type: 'loggia/config/get' });
    /* UN SEUL envoi : la purge et le contenu du fichier ensemble (audit du
     * 03/10). Le composant construit la nouvelle configuration en memoire, la
     * verifie — droits, nombre de cles, tailles — puis l'ecrit d'un bloc :
     * refusee, rien n'a bouge (store.py, `_set_locked`).
     *
     * En deux envois, la purge passait toujours — des valeurs nulles ne pesent
     * rien — et la reecriture pouvait etre refusee, ou perdue avec la
     * connexion. Il ne restait alors plus rien de la maison : ni pieces, ni
     * profils, ni agencements, sur tous les ecrans a la fois. */
    const patch = {};
    // Tout ce qui existe est purge — y compris la photo d'un appareil qu'un
    // ancien import aurait rangee la. Sauf ce que le serveur tient en cours
    // d'execution : un minuteur qui tourne n'appartient a aucun fichier.
    Object.keys((actuelle && actuelle.config) || {}).forEach((k) => { if (!estCleServeur(k)) patch[k] = null; });
    Object.assign(patch, config);
    await h.callWS({ type: 'loggia/config/set', config: patch });
  }
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      // Ce que l'appareil sait de lui-meme reste : sa photo de fond, son
      // journal lu, son ecran de veille. Le carnet des reglages en attente,
      // lui, part : il rejouerait par-dessus la maison importee des reglages
      // d'avant l'import.
      if (/^loggia[_-]/.test(k) && !estCleAppareil(k)) localStorage.removeItem(k);
    }
    /* Une chaine s'ecrit telle quelle — le theme et le mode sont lus bruts au
     * premier affichage.
     *
     * Le reste, en JSON, SEULEMENT SANS COMPOSANT : ce stockage est alors la
     * configuration, et n'ecrire que les chaines perdait pieces et profils.
     * Avec le composant, le serveur fait foi et la page se recharge sur lui ;
     * une copie complete laissee ici remonterait plus tard au serveur par
     * `completerDepuisLocal`, des qu'une cle y manquerait — et defairait une
     * remise a zero ou un import faits depuis un autre ecran (relecture du
     * lot 1, audit du 03/10). */
    Object.keys(config).forEach((k) => {
      const v = config[k];
      if (typeof v === 'string') localStorage.setItem(k, v);
      else if (!h) localStorage.setItem(k, JSON.stringify(v));
    });
  } catch { /* le serveur fait foi de toute facon */ }
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
    // Un refus ou un serveur muet remonte a l'appelant : vider l'appareil
    // seul puis recharger aurait resynchronise la configuration de la maison
    // comme si de rien n'etait (audit 18/09).
    const r = await h.callWS({ type: 'loggia/config/get' });
    const patch = {};
    Object.keys((r && r.config) || {}).forEach(k => { patch[k] = null; });
    if (Object.keys(patch).length) await h.callWS({ type: 'loggia/config/set', config: patch });
    // Les reglages personnels de ce compte, que le patch ci-dessus ne couvre
    // que si l'utilisateur est administrateur.
    await h.callWS({ type: 'loggia/config/delete' });
  }
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (/^loggia[_-]/.test(k)) localStorage.removeItem(k);
    }
  } catch { /* rien de plus a faire */ }
}


// Interrupteurs (domaine switch) à traiter comme des lumières on/off dans la vue Lumières.
// Interrupteurs traités comme des lumières — choix de l'utilisateur, sans
// défaut : une installation neuve n'en déclare aucun.
// Un objet à la place de la liste (configuration abîmée) levait `.filter` dans
// le corps d'App : tout l'écran tombait (05/10, suite du point 10b).
export const switchLightsCfg = () => { const v = cfgVal('loggia_switchlights', []); return Array.isArray(v) ? v.filter(Boolean) : []; };

/* L'icone qu'on a CHOISIE pour une entite : `{ "<entity_id>": "<glyphe>" }`.
 *
 * Elle ne dit rien d'autre. Jusqu'au 26/09, la seule facon de changer l'allure
 * d'une prise etait de la declarer lumiere — ce qui change aussi sa carte, sa
 * famille et son filtre. « Je veux pouvoir, si je le desire, modifier l'icone
 * par defaut », sans que cela « change de categorie », et pour n'importe quel
 * type de carte. Une entree ici ne touche donc ni au domaine, ni aux filtres :
 * elle remplace un glyphe, rien de plus, et son absence rend la devinette. */
export const iconesCfg = () => { const v = cfgVal('loggia_icones', null); return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}; };

// Reliquat de transition : un choix explicite reste prioritaire, mais il n'y a
// plus d'entite par defaut — c'est la decouverte qui trouve le panneau.
export const secAlarm = () => cfgVal('loggia_alarm', '') || '';

/* ── Ce qu'un profil non-admin a le droit de faire ──────────────────────────
 *
 * Un profil « Famille » voyait déjà moins : la clé `vues` d'un utilisateur
 * restreint les vues qu'il atteint. Mais il ne POUVAIT rien : toutes les
 * sections des Paramètres qui changent l'installation — automatisations,
 * règles, entités, mises à jour — sont réservées à l'administrateur, et le
 * mode édition aussi. C'était tout ou rien, et le seul moyen de confier une
 * seule de ces choses était de faire de la personne un administrateur.
 *
 * Ce catalogue les rouvre une par une. Deux n'y figureront jamais : la gestion
 * des profils et le code administrateur. Les accorder laisserait quelqu'un se
 * promouvoir lui-même, et le réglage entier n'aurait plus de sens.
 *
 * Rien de coché = aucune autorisation. C'est l'INVERSE de `vues`, où rien de
 * coché veut dire « tout est visible ». Les deux défauts vont dans le même
 * sens : une restriction ne s'applique que si on la demande, un pouvoir ne se
 * donne que si on le donne.
 *
 * Ces autorisations ne sont pas une sécurité. Le tableau de bord emprunte la
 * session Home Assistant du navigateur : ce que le serveur refuse à cette
 * session, aucune case cochée ici ne l'autorisera, et ce qu'il accepte reste
 * atteignable par d'autres chemins. C'est un garde-fou contre la fausse
 * manœuvre, pas contre quelqu'un qui cherche à passer outre. Le vrai verrou —
 * le code admin — garde ce qu'il a toujours gardé : le passage vers un profil
 * administrateur.
 */
export const DROITS = [
  ['edition', 'Mode édition'],
  ['vues', 'Vues'],
  ['auto', 'Automatisations'],
  ['regles', 'Règles'],
  ['inter', 'Interrupteurs'],
  ['alertes', 'Alertes'],
  ['maj', 'Mises à jour'],
];

export const DROITS_IDS = DROITS.map(d => d[0]);

/* Les autorisations dont le COMPOSANT garde l'écriture (audit du 03/10).
 *
 * Les règles et les interrupteurs s'enregistrent par des commandes réservées
 * aux administrateurs de Home Assistant (`require_admin`, websocket_api.py) ;
 * les alertes dans `loggia_alertes`, une clé de la maison (store.py). Cocher la
 * case ouvre la section, mais sous un compte Home Assistant ordinaire rien de
 * ce qu'on y règle n'est accepté — c'est ce que dit déjà, plus haut, « ces
 * autorisations ne sont pas une sécurité ». L'éditeur de profil le dit au
 * moment d'accorder ; la frontière, elle, ne bouge pas (ADR 0125). */
export const DROITS_ADMIN_HA = ['regles', 'inter', 'alertes'];

/* Signature d'une liste de profils : ce qui, en changeant, doit faire
 * adopter la version du serveur sur les autres appareils.
 *
 * Elle enumerait sept champs et en oubliait deux — `vues` et `droits`. Une
 * restriction de vues posee sur le PC, une autorisation accordee a quelqu'un,
 * n'atteignaient donc jamais la tablette : la signature ne bougeait pas, et
 * la liste locale restait en place.
 *
 * D'ou une signature qui prend l'objet ENTIER, moins la cle de rendu `_k`,
 * qui est tiree au hasard a chaque chargement. Oublier un champ ajoute
 * demain redeviendrait sinon le meme silence. */
export const usersSig = (a) => JSON.stringify((a || []).map((u) => {
  const { _k, ...reste } = u || {};
  return Object.keys(reste).sort().map(k => [k, reste[k]]);
}));

/** Les autorisations effectives d'un profil : toutes pour un admin.
 *
 * Le filtre n'est pas décoratif. Une configuration écrite par une version plus
 * récente peut nommer un droit que celle-ci ne connaît pas ; le laisser passer
 * ferait apparaître une section qu'aucun rendu n'attend.
 */
export function droitsDe(user) {
  if (!user) return [];
  if (user.role === 'Admin') return DROITS_IDS;
  return Array.isArray(user.droits) ? user.droits.filter(d => DROITS_IDS.indexOf(d) >= 0) : [];
}

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
  // `p.haid.replace` plus bas : un identifiant qui n'est pas une chaîne faisait
  // tomber tout l'écran (05/10, suite du point 10b).
  return raw.filter(p => p && typeof p.haid === 'string' && p.haid).map((p, i) => ({ id: p.id || p.haid, name: p.name || p.haid.replace('media_player.', '').replace(/_/g, ' '), haid: p.haid, ma: p.ma || undefined, c: p.c || MED_COLORS[i % MED_COLORS.length] }));
};

// Compagnon manquant dans une configuration ancienne : la résolution le retrouve
// par l'appareil. Un suffixe écrit en dur (`_2`) casse au premier renommage.
export const medCompanion = (haid) => {
  const found = medResolved().find(m => m.haid === haid || m.ma === haid);
  return (found && (found.haid === haid ? found.ma : found.haid)) || null;
};
// Logos des services, en SVG local — le projet n'embarque aucune ressource
// externe. Chaque `logo` se dessine dans un carre de 32, centre sur (0,0).

// Capteurs d'énergie : la configuration de l'utilisateur SI elle existe, sinon
// ce que le tableau de bord Énergie natif permet de déduire. Les deux ne se
// mélangent jamais : voir le commentaire d'enHaids(). Les cases sans
// équivalent standard restent nulles et la vue ne les affiche pas.
/* LES CAPTEURS DU SCHEMA, PAR FAMILLE.
 *
 * Le tableau de bord Energie et la fiche ne donnent pas les memes NOMS a la
 * meme chose : `gridNow` et `consoNow` sont le meme capteur, `solarNow` et
 * `solarOutput` aussi. Vider un champ dans la fiche ne retirait donc rien —
 * le tableau le resservait sous son autre nom, et un capteur qu'on venait de
 * retirer restait actif sur le schema (retour du 02/10).
 *
 * Des que la fiche DECLARE une cle d'une famille — meme vide, c'est un choix —
 * elle decide pour la famille entiere. Partout ailleurs, les deux se marient. */
const FAM_SCHEMA = [
  ['consoNow', 'gridNow'],
  ['surplusNow', 'injectionNow'],
  ['solarOutput', 'solarNow'],
  ['evNow'],
  ['batNow', 'batSoc', 'batChargeNow', 'batDechargeNow'],
];

/**
 * Les capteurs d'energie : CE QUE LA FICHE DIT, COMPLETE PAR LE TABLEAU.
 *
 * La fiche faisait foi seule des qu'elle avait ete enregistree une fois. Mais
 * l'ecran Parametres n'expose que six champs de puissance : nommer sa voiture
 * suffisait a perdre les compteurs, les couts, le gaz, l'eau et les appareils
 * que Home Assistant declarait (07/10, « tout doit etre operationnel »).
 *
 * Desormais : la fiche d'abord, le tableau de bord pour tout ce qu'elle ne dit
 * pas — sauf dans une famille du schema qu'elle a touchee, ou elle reste seule
 * maitresse (voir `FAM_SCHEMA`).
 */
export function enHaids() {
  const r = LOGGIA_RESOLVED && LOGGIA_RESOLVED.energy;
  const deduit = (r && r.haids && typeof r.haids === 'object') ? r.haids : {};
  const cfg = loggiaEnt('energy', null);
  const out = {};
  Object.keys(deduit).forEach(k => { if (deduit[k]) out[k] = deduit[k]; });
  if (!cfg || typeof cfg !== 'object') return out;
  // Une famille touchee par la fiche se vide d'abord : elle n'appartient qu'a elle.
  FAM_SCHEMA.forEach(fam => {
    if (fam.some(k => Object.prototype.hasOwnProperty.call(cfg, k))) fam.forEach(k => { delete out[k]; });
  });
  Object.keys(cfg).forEach(k => { if (cfg[k]) out[k] = cfg[k]; });
  return out;
}

/**
 * Les PRIX du kilowattheure declares dans le tableau de bord Energie.
 *
 * `enHaids` ne transporte que des identifiants ; un prix est une VALEUR, ou
 * l'entite qui la publie. C'est la seule source generique d'un tarif : personne
 * n'a de capteur « prix » par defaut, et sans cela la carte du tarif ne pouvait
 * s'afficher que chez qui en avait fabrique un (07/10).
 *
 * `[{ valeur, entite, compteur }]`, une entree par connexion — un contrat
 * heures creuses / pleines en donne deux.
 */
export function enPrix() {
  const r = LOGGIA_RESOLVED && LOGGIA_RESOLVED.energy;
  return (r && Array.isArray(r.prix)) ? r.prix : [];
}

/** Le prix de REVENTE du kilowattheure, meme forme que celui d'achat. Vide
 * tant que le tableau de bord Energie n'en declare pas : on ne devine pas un
 * tarif de rachat. */
export function enVente() {
  const r = LOGGIA_RESOLVED && LOGGIA_RESOLVED.energy;
  return (r && Array.isArray(r.prixVente)) ? r.prixVente : [];
}

// Appareils suivis : ceux de la configuration, sinon ceux que le tableau de bord
// Énergie déclare. L'habillage (icône, couleur, illustration) tourne sur la
// palette existante, Home Assistant ne le fournissant pas.

// Configurable (Paramètres → Entités) : {name, haid, ma?} — id/couleur auto-complétés.
const MED_COLORS = ['var(--o-cyan)', 'var(--o-accent)', 'var(--o-purple)', 'var(--o-ok)', '#ff8a4c', '#f472b6', '#8fb7ff', '#ffce73'];

// Lecteurs multimédia : la configuration, sinon ce que la résolution apparie.
function medResolved() {
  const r = LOGGIA_RESOLVED && LOGGIA_RESOLVED.media;
  return (r && r.available) ? r.list : [];
}

// Répare les loggia_rooms anciens (tableau de chaînes, haid manquants) en refusionnant les capteurs
// des défauts par nom de pièce — sans toucher aux personnalisations valides.
// Pièces trouvées par la découverte, au format attendu par les vues. C'est le
// repli quand l'utilisateur n'a rien choisi. Il n'y a plus de liste écrite :
// une pièce non trouvée n'apparaît pas, plutôt que d'apparaître vide.
function discoveredRooms() {
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
 *
 * Ces mots sont des CLÉS du catalogue, en français : ils se traduisent à
 * l'affichage (ficherobot.jsx, par `trSens`), state.js ne pouvant importer
 * i18n.js qui l'importe déjà (audit du 03/10).
 *
 * Quatre portent leur sens (relecture du 03/10) : leur clé nue est traduite
 * pour un autre écran. « Moyen » est le niveau de CO₂ — « Fair » en anglais,
 * « Regular » (médiocre) en espagnol, « Średnia » au féminin en polonais ; le
 * pas-à-pas disait « Low → Fair → High ». « Normal » est l'état d'un capteur
 * (« Normalnie », un adverbe), « Standard » une taille de carte
 * (« Standardowa »), « Serpillière » l'accessoire (« Panno », le chiffon). Un
 * niveau ou un mode du robot — aspiration, débit d'eau, mode de travail : tous
 * passent par ici — a ses clés ; le CO₂ et les cartes gardent les leurs.
 */
const VAC_MOTS = {
  sweeping: 'Aspiration', mopping: 'Serpillière · mode', vacuuming: 'Aspiration',
  vacuum: 'Aspiration', mop: 'Serpillière · mode', vacuum_and_mop: 'Aspiration + serpillière', mop_after_vacuum: 'Serpillière après aspiration',
  sweeping_and_mopping: 'Aspiration + serpillière', mopping_after_sweeping: 'Serpillière après aspiration',
  low: 'Faible', medium: 'Moyen · réglage', high: 'Élevé', ultrahigh: 'Maximum', ultra_high: 'Maximum',
  quiet: 'Silencieux', normal: 'Normal · réglage', max: 'Maximum', max_plus: 'Maximum +',
  standard: 'Standard · réglage', strong: 'Fort', off: 'Arrêt', auto: 'Auto', customize: 'Personnalisé',
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
