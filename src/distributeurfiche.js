/* ── Ce que la fiche du distributeur et Paramètres calculent (ADR 0155 ; chantier IoT, tâche 1) ──
 *
 * L'historique des repas reconstruit depuis Home Assistant, son résumé, le planning tel que l'onglet le
 * montre, les libellés d'heures et de jours, les scripts candidats de Paramètres. Tout cela vivait dans
 * `distributeur.js`, au démarrage, quand seules la fiche et Paramètres — chargées à la demande —
 * l'emploient : il les suit, et rend sa place aux cartes (§ 12 de la conception). Les règles ne changent
 * pas : rien ne sort de l'appareil désigné, un script deviné ne commande jamais, une heure qu'on ne peut
 * pas déduire ne s'invente pas.
 *
 * La mesure d'une portion et les jours de réserve sont revenus au démarrage (étape 2 du chantier IoT,
 * 19/10 ; I10) : la CARTE dit « Distribuer 12 g » et « ≈ 8 j ». Ce module les reprend tels quels, pour la
 * fiche et Paramètres, qui les importent d'ici. Le résumé de l'Historique devient les sept jours GLISSANTS
 * de sa maquette (`septJoursRepas`, I25) : la semaine du calendrier et ses barres partent.
 */
import { tr, trN, trSens } from './i18n.js';
import { sansAccents } from './outils.js';
import { heureValide, resumeJours, dureeLisible } from './robots.js';
import { niveauUsure } from './robotsfiche.js';
import { TABLES, designees, estMasse, enGrammes } from './distributeur.js';

export { mesurePortion, repasPourReserve, joursDeReserveDistributeur } from './distributeur.js';

/* ════════════ Les tables que le démarrage ne lit pas (passe bis de l'étape 2, 19/10) ════════════
 *
 * Celles du programme de l'appareil, que seul le serveur décode (`distributeur_appareil.py`), des consommables, du select de mode
 * et des cibles de commande : la popup, ou le Python seul, les emploient. Avec `TABLES` (distributeur.js), elles sont ÉGALES clé par
 * clé à `tables` de la fixture partagée — un test le tient sur l'union, et une clé ne vit que d'un côté. */
export const TABLES_FICHE = Object.freeze({
  DOMAINES_ACTION_APPAREIL: ['button', 'number', 'select', 'text'],
  MOTIF_MODE_Z2M: '_mode$',
  OPTIONS_MODE_Z2M: ['manual', 'schedule'],
  MODES: { manual: 'manuel', schedule: 'programme' },
  JOURS_Z2M: {
    everyday: [0, 1, 2, 3, 4, 5, 6], workdays: [0, 1, 2, 3, 4], weekend: [5, 6],
    mon: [0], tue: [1], wed: [2], thu: [3], fri: [4], sat: [5], sun: [6],
    'mon-wed-fri-sun': [0, 2, 4, 6], 'tue-thu-sat': [1, 3, 5],
  },
  JOURS_TUYA: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
  SERVICES_PETSAFE: ['petsafe.add_schedule'],
  SERVICE_TUYA_PROGRAMME: 'tuya.get_feeder_meal_plan',
  CLES_CONSOMMABLE: { deshydratant: ['desiccant_left_days', 'remaining_desiccant'], filtre: ['remaining_filter_days'], nettoyage: ['remaining_cleaning_days'] },
  UNITES_JOURS: ['d'],
  MOTIF_CONSOMMABLE_PCT: { deshydratant: 'desiccant.*level', filtre: 'filter_percent' },
  CLES_RESET: { deshydratant: ['desiccant_reset', 'reset_desiccant'], filtre: ['filter_reset', 'reset_filter'], nettoyage: ['cleaning_reset'] },
  MOTIF_RESET: { deshydratant: 'reset.*desiccant|desiccant.*reset' },
});

// Les mêmes petites lectures que distributeur.js : recopiées plutôt qu'exportées, le démarrage n'en porte pas les noms.
const T = { ...TABLES, ...TABLES_FICHE };
const rx = (motif, s) => new RegExp(motif).test(String(s == null ? '' : s));
const dans = (liste, v) => v != null && liste.indexOf(v) >= 0;
const cleDe = (e) => String((e && e.cle) || '').toLowerCase();
const idDe = (v) => { const s = typeof v === 'string' ? v.trim() : ''; return s.indexOf('.') > 0 ? s : null; };
const scriptDesigne = (cfg) => { const s = idDe(cfg && cfg.script); return s && s.indexOf('script.') === 0 ? s : null; };
const meta = (index, id) => (index && index.entityMeta && typeof index.entityMeta.get === 'function' && index.entityMeta.get(id)) || null;
const nombre = (v) => { if (v == null || v === '') return null; const n = typeof v === 'number' ? v : parseFloat(v); return Number.isFinite(n) ? n : null; };
// Sauf les grammes (`enGrammes`, `estMasse`) : une seule table de conversion, celle du démarrage (passe bis 2 de l'étape 2, 19/10).
const joursValides = (j) => (Array.isArray(j) ? j.filter(x => Number.isInteger(x) && x >= 0 && x <= 6) : null);

/* ════════════ Le mode, les cibles, les notes (la popup et le serveur ; passe bis de l'étape 2, 19/10) ════════════ */

/** Une entité désignée posée sur un AUTRE appareil : ignorée, et signalée — `{ code: 'appareil_divergent', entity_id }`. */
export function notesAppareil(index, cfg, deviceId) {
  if (!deviceId) return [];
  return designees(cfg).filter(id => { const m = meta(index, id); return m && m.deviceId && m.deviceId !== deviceId; })
    .map(id => ({ code: 'appareil_divergent', entity_id: id }));
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

/* ════════════ Les consommables et les réglages (la popup seule les lit ; passe bis de l'étape 2, 19/10) ════════════ */

/** Les consommables (sensor) : déshydratant, filtre, nettoyage — en jours
 * restants ou en pourcentage —, et le bouton qui les remet à neuf. Les tables
 * sont celles de `distributeur_appareil.py` (R3), par la fixture partagée. */
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

/**
 * Le niveau d'un consommable, sur le gabarit des pièces d'usure du robot (I20 ; passe bis de l'étape 2, 19/10) : en pourcentage,
 * celui du robot — bas sous 15 (le rouge), moyen sous 35 (l'ambre), bon au-delà ; en jours restants, bas à 3 jours ou moins, moyen à
 * 7 ou moins, bon au-delà ; `null` sans mesure.
 */
export function niveauConsommable(c) {
  if (!c) return null;
  if (c.pct != null) return niveauUsure(c.pct);
  if (c.jours == null) return null;
  return c.jours <= 3 ? 'bas' : c.jours <= 7 ? 'moyen' : 'bon';
}

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

/* ════════════ Les scripts candidats (Paramètres) ════════════ */

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
    const g = quantites.find(q => estMasse(q.unite));
    return { t: l.t, source: l.source || sourceA(l.t), quantites, grammes: g ? enGrammes(g.valeur, g.unite) : null, origines: l.origines };
  }).sort((a, b) => b.t - a.t);
}

/* Le titre d'un repas d'après sa source (I25) : ce qu'on SAIT, jamais « Repas du matin » deviné à l'heure. Une automatisation se
 * nomme par son nom, à défaut de quoi « Depuis une automatisation ». */
const TITRE_SOURCE = {
  automatisation: () => tr('Depuis une automatisation'),
  loggia: () => tr('Planning de Loggia'),
  programme: () => tr('Programme de l’appareil'),
  manuel: () => tr('Repas à la main'),
  distance: () => tr('À distance'),
};
/* La pastille d'origine (I25) : qui l'a lancé, quand on le SAIT. « À distance » n'en a pas : l'application du fabricant, Loggia ou
 * une automatisation que le serveur ne reconnaît pas disent toutes « remote ». */
const ORIGINE_SOURCE = { automatisation: 'automatisme', loggia: 'automatisme', programme: 'appareil', manuel: 'main' };

/**
 * L'Historique des sept derniers jours (I25 ; sa maquette 1e) : les 7 × 24 h qui finissent maintenant, comme le robot (I19) — une
 * semaine du calendrier affichait « 0 repas » le premier jour de la semaine. `{ n, grammes, rangees }` : `grammes` vaut null si
 * aucun repas ne se pèse ; une rangée par repas (les lignes de `repasDepuisHistorique`, du plus récent au plus ancien), avec son
 * `titre` VRAI — le nom de l'automatisation qui a servi (`noms`, par entity_id), sinon celui de sa source, « Repas » quand on ne
 * la sait pas (UN repas, au singulier : la clé de l'onglet se traduit « Meals » — passe bis, point D) — et son `origine` :
 * 'automatisme', 'main', 'appareil', ou null.
 */
export function septJoursRepas(lignes, { noms = {}, maintenant = Date.now() } = {}) {
  const depuis = maintenant - 7 * 86400000;
  const dans = (Array.isArray(lignes) ? lignes : []).filter(l => l && l.t >= depuis);
  const aGrammes = dans.some(l => l.grammes != null);
  const titre = (l) => {
    const auto = l.source === 'automatisation' ? (l.origines || []).find(id => String(id).indexOf('automation.') === 0 && noms && noms[id]) : null;
    return auto ? noms[auto] : TITRE_SOURCE[l.source] ? TITRE_SOURCE[l.source]() : trSens('Repas · un repas');
  };
  return {
    n: dans.length,
    grammes: aGrammes ? Math.round(dans.reduce((s, l) => s + (l.grammes || 0), 0)) : null,
    rangees: dans.map((l, i) => ({ ...l, cle: l.t + '-' + i, titre: titre(l), origine: ORIGINE_SOURCE[l.source] || null })),
  };
}

/**
 * « Aujourd'hui : {n} repas · {g} g », si l'appareil a un compteur du jour :
 * `{ repas, portions, grammes }`, chacun `null` quand rien ne le compte.
 * Le TOTAL du jour passe avant ses parts (05/10, contradicteur) : chez PetKit,
 * `total_dispensed` est le total de la journée et `manual_dispensed` /
 * `planned_dispensed` ses deux moitiés — prendre la première par ordre
 * alphabétique affichait les seules rations manuelles. Le compteur se reconnaît
 * à sa clé de traduction, à défaut à son entity_id (qu'on peut renommer).
 * Un compteur qui n'a pas bougé AUJOURD'HUI ne compte rien (passe bis de
 * l'étape 2, 19/10) : à 00:20, les 24 g d'hier faisaient « 0 repas · 24 g » ;
 * sans date lisible, sa valeur se croit, comme avant.
 */
export function compteDuJour(lecture, states, maintenant = Date.now()) {
  const S = states || {};
  const out = { repas: null, portions: null, grammes: null };
  const minuit = new Date(maintenant); minuit.setHours(0, 0, 0, 0);
  const soeurs = new Map(((lecture && lecture.soeurs) || []).map(s => [s.id, s]));
  const texte = (id) => { const s = soeurs.get(id); return ((s && s.cle) || '') + ' ' + id; };
  const rang = (id) => (/total/.test(texte(id)) ? 0 : /manual|planned/.test(texte(id)) ? 2 : 1);
  [...((lecture && lecture.historique && lecture.historique.compteurs) || [])].sort((a, b) => rang(a) - rang(b)).forEach(id => {
    const e = S[id];
    const v = e ? nombre(e.state) : null;
    if (v == null) return;
    const tc = Date.parse(e.last_changed || '');
    if (!isNaN(tc) && tc < minuit.getTime()) return;
    const u = (e.attributes && e.attributes.unit_of_measurement) || null;
    const g = u ? enGrammes(v, u) : null;
    if (g != null) { if (out.grammes == null) out.grammes = g; }
    else if (/times/.test(texte(id))) { if (out.repas == null) out.repas = v; }
    else if (/portion|dispensed/.test(texte(id)) && out.portions == null) out.portions = v;
  });
  return out;
}
