/* ── Le distributeur de croquettes, ce qui se CALCULE (ADR 0155, 05/10) ──────
 *
 * La fiche du distributeur est une feuille à onglets sur le modèle du robot
 * (Accueil, Repas, Historique, Entretien s'il y a de quoi, roue Réglages ;
 * ADR 0216). Ce fichier porte ce qui s'y calcule ; pas de React, pas de Home
 * Assistant : la vue lui passe des entités déjà lues et la réponse du serveur
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
 * Ici, celles que le DÉMARRAGE lit ; celles que seule la popup emploie, ou que
 * seul le serveur lit (le programme de l'appareil, les consommables), vivent dans
 * `TABLES_FICHE` (distributeurfiche.js) : la fixture fige l'union des deux
 * (passe bis de l'étape 2, 19/10 : le démarrage n'en porte rien).
 * Les motifs se testent sur le SUFFIXE en minuscules (la partie de l'entity_id
 * après le point), jamais sur le nom affiché, qui change avec la langue.
 *
 * Ce fichier ne garde que ce que la CARTE lit au démarrage (chantier IoT, tâche 1 ; § 12 de la
 * conception) : l'appareil et ses sœurs, la commande, la portion, les anomalies, le bac, le prochain et le
 * dernier repas. L'historique reconstruit, son résumé, le planning affiché, les libellés d'heures et de
 * jours et les scripts candidats de Paramètres vivent dans `distributeurfiche.js`, que la fiche et
 * Paramètres — tous deux à la demande — importent.
 *
 * La carte y prend aussi (étape 2 du chantier IoT, 19/10 ; I10, § 6) ce qu'elle dit et ce qu'elle offre :
 * sa phrase (`phraseDistributeur`), « Distribuer 12 g » (`grammesRation`), sa vue entière
 * (`carteDistributeur`) — et pour elles la mesure d'une portion et la réserve en jours, revenues de
 * `distributeurfiche.js` : la carte dit « ≈ 8 j ».
 */
import { tr, locale } from './i18n.js';
import { sansAccents } from './outils.js';
import { jourPlanning, heureValide } from './robots.js';
import { joursDeReserve } from './objets.js';
import { quandLumiere } from './lumieres.js';

/* ════════════ Les tables (égales à `tables` de la fixture, clé par clé) ════════════ */

/* Les grammes d'une unité de MASSE de Home Assistant (`UnitOfMass`, avec « ug » pour µg) : ce qui pèse, par opposition à ce qui
 * compte des portions. Seules g et kg comptaient (passe bis 2 de l'étape 2, 19/10) : un « Poids d'une portion » désigné en oz, en lb
 * ou en mg devenait la TAILLE de la ration, et le pas à pas de « Servir maintenant » aurait écrit sur un poids — l'étalonnage de
 * l'appareil. `UNITES_MASSE` en est la liste, que la fixture fige des deux côtés ; `enGrammes` convertit. */
const GRAMMES_PAR_UNITE = { g: 1, kg: 1000, mg: 0.001, 'µg': 0.000001, ug: 0.000001, oz: 28.349523125, lb: 453.59237, st: 6350.29318 };

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
  CLES_PORTION: ['manual_feed_quantity', 'manual_portions', 'portions', 'serving_size'],
  MOTIF_SUFFIXE_PORTION: '(^|_)(serving_size|portions|manual_portions)$',
  CLES_POIDS_PORTION: ['portion_weight'],
  MOTIF_SUFFIXE_POIDS_PORTION: '(^|_)portion_weight$',
  UNITES_MASSE: Object.keys(GRAMMES_PAR_UNITE),
  CLES_PROGRAMME: { petlibro: ['feeding_schedule'], petkit: ['raw_distribution_data'], aqara_mode: ['feeding_mode'], tuya_local: ['meal_plan', 'schedule'] },
  MOTIF_SCHEDULE_Z2M: '_schedule$',
  CLES_ANOMALIE_BAS: ['food_level', 'food_level_1', 'food_level_2', 'food_low', 'left_food_low', 'right_food_low', 'tank_empty'],
  CLES_ANOMALIE_BLOQUE: ['barn_door_error', 'door_blocked', 'error_detected', 'food_dispenser_state', 'food_outlet_state', 'rotor_stuck'],
  MOTIF_BAS: 'food_(low|shortage|empty|level)|hopper_low|not_enough_food|pet_food_left_level',
  MOTIF_BLOQUE: 'block|jam|stuck|clog',
  MOTIF_ANOMALIE_SANS_CLASSE: '(^|_)error$',
  MOTIF_CONSOMMABLE: { deshydratant: 'desiccant', filtre: 'filter', nettoyage: 'clean' },
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

/* ════════════ TROUVER LE DISTRIBUTEUR, SANS RIEN DEMANDER ════════════
 *
 * Home Assistant n'a pas de domaine pour ces appareils : aucun `vacuum.` ou
 * `light.` ne les designe, et le distributeur etait donc le dernier qui
 * n'existait QUE par sa fiche — sans une entite nommee a la main dans
 * Parametres, pas de carte, pas de vue, rien (07/10, « tout doit etre
 * operationnel »).
 *
 * Mais les integrations qui en gerent nomment leurs entites de la meme facon,
 * par une CLE DE TRADUCTION : le meme mot dans toutes les langues, et c'est
 * deja sur elles que repose toute la lecture ci-dessus. On remonte donc des
 * entites a leur appareil.
 *
 * DEUX FAMILLES DE SIGNAUX AU MINIMUM. Une seule ne suffit pas : `portions`
 * tout seul pourrait etre autre chose, et poser une carte de croquettes sur un
 * appareil qui n'en est pas un serait pire que de n'en poser aucune. Deux
 * familles distinctes — une portion ET un prochain repas, un programme ET un
 * niveau bas — ne se rencontrent que sur un vrai distributeur.
 */
const SIGNATURES = [
  ['portion', (c) => dans(T.CLES_PORTION, c) || rx(T.MOTIF_SUFFIXE_PORTION, c)],
  ['poids', (c) => dans(T.CLES_POIDS_PORTION, c) || rx(T.MOTIF_SUFFIXE_POIDS_PORTION, c)],
  ['programme', (c) => Object.values(T.CLES_PROGRAMME).some(l => dans(l, c)) || rx(T.MOTIF_SCHEDULE_Z2M, c)],
  ['prochain', (c) => dans(T.CLES_PROCHAIN, c) || rx(T.MOTIF_PROCHAIN, c)],
  ['dernier', (c) => dans(T.CLES_DERNIER, c) || rx(T.MOTIF_DERNIER, c)],
  ['encours', (c) => dans(T.CLES_EN_COURS, c)],
  ['compteur', (c) => dans(T.CLES_COMPTEUR, c) || rx(T.MOTIF_COMPTEUR_Z2M, c)],
  ['niveau', (c) => dans(T.CLES_ANOMALIE_BAS, c) || rx(T.MOTIF_BAS, c)],
  ['bloque', (c) => dans(T.CLES_ANOMALIE_BLOQUE, c)],
  ['repas', (c) => dans(T.CLES_SOURCE_REPAS, c) || rx(T.MOTIF_SOURCE_REPAS, c)],
  ['consommable', (c) => Object.values(T.MOTIF_CONSOMMABLE).some(m => rx(m, c))],
];

/* Le resultat est MEMORISE par index : `distributeurConfigure()` est appelee a
 * chaque rendu, et parcourir toutes les entites de la maison a chaque fois
 * coute cher pour une reponse qui ne change qu'au rechargement du registre. */
let _trouve = { index: undefined, appareil: null };

/**
 * L'appareil qui ressemble a un distributeur, ou `null`.
 *
 * Une entite MASQUEE compte (tuya-local masque son `meal_plan`), une
 * DESACTIVEE non : elle n'a pas d'etat. A egalite de signaux, c'est l'appareil
 * dont l'identifiant vient en premier — pour que deux lectures de suite
 * rendent la meme chose.
 */
export function trouverDistributeur(index) {
  if (_trouve.index === index) return _trouve.appareil;
  const table = index && index.entityMeta;
  let appareil = null;
  if (table && typeof table.forEach === 'function') {
    const vus = new Map();
    table.forEach((m, id) => {
      if (!m || !m.deviceId || m.disabled || !id) return;
      const cle = String(m.translationKey || '').toLowerCase();
      if (!cle) return;
      SIGNATURES.forEach(([nom, voit]) => {
        if (!voit(cle)) return;
        const s = vus.get(m.deviceId) || new Set();
        s.add(nom);
        vus.set(m.deviceId, s);
      });
    });
    let meilleur = 0;
    [...vus.keys()].sort().forEach(dev => {
      const n = vus.get(dev).size;
      if (n >= 2 && n > meilleur) { meilleur = n; appareil = dev; }
    });
  }
  _trouve = { index, appareil };
  return appareil;
}

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
  /* Rien de designe : ON CHERCHE (07/10). Le distributeur etait le dernier
   * appareil qui n'existait que par sa fiche. */
  return trouverDistributeur(index);
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

/** Une unité de MASSE (`UNITES_MASSE` : g, kg, mg, µg, oz, lb, st) : ce qui pèse, par opposition à ce qui compte des portions. */
export const estMasse = (u) => dans(T.UNITES_MASSE, u);
/** Des grammes : la valeur telle quelle sans unité (l'ancienne aide en grammes), convertie depuis une unité de masse, rien sinon.
 * La fiche et `distributeurfiche.js` l'importent (passe bis 2) : une seule table de conversion. */
export const enGrammes = (v, u) => (v == null ? null : u == null || u === '' ? v : estMasse(u) ? v * GRAMMES_PAR_UNITE[u] : null);
const uniteDe = (e) => (e && e.attributs && e.attributs.unit_of_measurement) || null;

/* Le number désigné « Poids d'une portion » (`haids.portionWeight`) : une sœur, ou une entité connue de `states` qui n'est pas
 * posée sur un AUTRE appareil — `index` (LOGGIA_INDEX) dit où elle est posée ; sans lui, on la croit, comme le Python sans registre
 * (05/10, contradicteur : l'écran aurait réglé la portion de l'aquarium voisin). Une sœur désignée sans état compte quand même. */
function numberDesigne(soeurs, states, cfg, deviceId, index) {
  const pw = idDe(cfg && cfg.haids && cfg.haids.portionWeight);
  if (!pw || pw.indexOf('number.') !== 0) return null;
  const e = (soeurs || []).find(x => x.id === pw);
  if (e) return e;
  const st = (states || {})[pw];
  const ailleurs = (meta(index, pw) || {}).deviceId || null;
  return st && !(ailleurs && deviceId && ailleurs !== deviceId) ? { id: pw, attributs: st.attributes || {} } : null;
}

/**
 * La taille de la portion : le number désigné (`haids.portionWeight`) s'il
 * existe et si son unité n'est PAS une masse, sinon la sœur number de clé ou
 * de suffixe de portion. L'unité vient de l'ENTITÉ — un `serving_size`
 * d'Aqara compte des portions, jamais un « g » en dur.
 * Un number désigné en g ou en kg est le POIDS d'une portion, ce que le champ
 * de Paramètres demande (passe bis de l'étape 2, 19/10 ; D1) : la taille se
 * cherche alors parmi les sœurs. Avant, la carte prenait ce poids pour la
 * portion (« Distribuer 6 g » au lieu de 12), et le pas à pas de « Servir
 * maintenant » aurait réglé l'étalonnage de l'appareil.
 */
export function portionDistributeur(soeurs, states, cfg, deviceId = null, index = null) {
  const s = soeurs || [];
  const d = numberDesigne(s, states, cfg, deviceId, index);
  const e = (d && !estMasse(uniteDe(d)) ? d : null)
    || s.find(x => x.domaine === 'number' && dans(T.CLES_PORTION, cleDe(x)))
    || s.find(x => x.domaine === 'number' && rx(T.MOTIF_SUFFIXE_PORTION, x.objet));
  if (!e) return null;
  const a = e.attributs || {};
  return { entity_id: e.id, unite: uniteDe(e), min: nombre(a.min), max: nombre(a.max), pas: nombre(a.step) };
}

/** Le poids d'une portion : le number désigné dont l'unité est une masse (D1), sinon la sœur (Aqara : `portion_weight`, en g). */
export function poidsPortion(soeurs, states = null, cfg = null, deviceId = null, index = null) {
  const s = soeurs || [];
  const d = numberDesigne(s, states, cfg, deviceId, index);
  const e = d && estMasse(uniteDe(d)) ? d
    : s.find(x => x.domaine === 'number' && dans(T.CLES_POIDS_PORTION, cleDe(x))) || s.find(x => x.domaine === 'number' && rx(T.MOTIF_SUFFIXE_POIDS_PORTION, x.objet));
  return e ? { entity_id: e.id, unite: uniteDe(e) } : null;
}

/* Le select du mode (Aqara), les cibles de commande et les notes d'une entité désignée ailleurs : des briques que seule la popup, ou
 * seul le serveur, emploient — elles vivent dans distributeurfiche.js (passe bis de l'étape 2, 19/10). */

/* ════════════ Anomalies, capteurs ════════════ */

/** Les anomalies (binary_sensor) : bac presque vide, distribution bloquée, ou
 * un autre problème sous son propre nom. Par la clé d'abord, quelle que soit
 * la classe ; sinon la classe `problem` exigée ; sinon le suffixe `_error`
 * qu'un Aqara publie sous Zigbee2MQTT SANS classe (passe bis de l'étape 2,
 * 19/10 ; B) — son erreur ne s'affichait nulle part. L'ABSENCE de classe est
 * exigée (passe bis 2) : un `_link_error` de classe connectivity à « on » dit
 * « connecté », pas « problème ». */
export function anomaliesDistributeur(soeurs) {
  const out = [];
  (soeurs || []).forEach(e => {
    if (e.domaine !== 'binary_sensor') return;
    let type = null;
    if (dans(T.CLES_ANOMALIE_BAS, cleDe(e))) type = 'bas';
    else if (dans(T.CLES_ANOMALIE_BLOQUE, cleDe(e))) type = 'bloque';
    else if (e.classe === 'problem') type = rx(T.MOTIF_BAS, e.objet) ? 'bas' : rx(T.MOTIF_BLOQUE, e.objet) ? 'bloque' : 'autre';
    else if (!e.classe && rx(T.MOTIF_ANOMALIE_SANS_CLASSE, e.objet)) type = 'autre';
    if (type) out.push({ entity_id: e.id, type, actif: e.etat === 'on' });
  });
  return out;
}

/**
 * L'alerte que la CARTE porte : la première anomalie ACTIVE, `{ type,
 * entity_id }` ou `null` — son mot est celui de la phrase (`MOT_ALERTE`) ; la
 * popup dit les siens, le nom propre de l'entité compris. 05/10, relecture
 * « écran » : un Petlibro n'a pas de réservoir en % — rien ne passait au rouge,
 * et le bac presque vide ne se voyait qu'en ouvrant la fiche.
 */
export function alerteDistributeur(lecture) {
  const anomalies = lecture && Array.isArray(lecture.anomalies) ? lecture.anomalies : [];
  const a = anomalies.find(x => x && x.actif) || null;
  return a ? { type: a.type, entity_id: a.entity_id } : null;
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
/* La connectivité de l'appareil COUPÉE : son binary_sensor de classe connectivity, ou de clé `online`, à « off » — lue ici et par la
 * carte (depuis quand l'appareil se tait). */
const coupee = (e) => e.domaine === 'binary_sensor' && e.etat === 'off' && (e.classe === 'connectivity' || dans(T.CLES_CONNECTIVITE, cleDe(e)));

export function enLigne(soeurs, states, cfg, commande = commandeDistribuer(soeurs, states, cfg)) {
  const S = states || {};
  if (commande && muette(S[commande.entity_id])) return { mort: true, raison: 'commande' };
  if ((soeurs || []).some(coupee)) return { mort: true, raison: 'connectivite' };
  const r = cfg && cfg.haids && cfg.haids.reservoir;
  if (estId(r) && muette(S[r])) return { mort: true, raison: 'reservoir' };
  return { mort: false, raison: null };
}

/* ════════════ Tout l'appareil, d'un coup ════════════ */

/**
 * Ce que la carte et la fiche lisent de l'appareil, en un appel :
 * `{ appareil, soeurs, commande, portion, poidsPortion, anomalies, alerte,
 * enLigne, enCours, distribue, prochainCapteur, historique }`. `index` est
 * `LOGGIA_INDEX` (son `entityMeta`), `cfg` la clé `loggia_feeder` telle quelle.
 * Ce que seule la popup lit — les consommables, les réglages, le select du mode
 * — ou que seul le serveur emploie — les cibles de commande, les notes — se
 * calcule dans `distributeurfiche.js` sur `soeurs` (passe bis de l'étape 2,
 * 19/10 : le démarrage n'en porte rien).
 */
export function lireDistributeur(index, states, cfg) {
  const S = states || {};
  const appareil = appareilDistributeur(index, cfg);
  const soeurs = soeursDistributeur(index, S, appareil, cfg);
  const commande = commandeDistribuer(soeurs, S, cfg);
  const enCours = capteurEnCours(soeurs);
  const anomalies = anomaliesDistributeur(soeurs);
  return {
    appareil, soeurs, commande, portion: portionDistributeur(soeurs, S, cfg, appareil, index), poidsPortion: poidsPortion(soeurs, S, cfg, appareil, index),
    anomalies, alerte: alerteDistributeur({ anomalies }),
    enLigne: enLigne(soeurs, S, cfg, commande), enCours, distribue: !!enCours && !!S[enCours] && S[enCours].state === 'on',
    prochainCapteur: capteurProchain(soeurs), historique: sourcesHistorique(soeurs),
  };
}

/* ════════════ Le bac, la portion en grammes ════════════ */

/**
 * Le niveau du bac : `{ pct, grammes }`. En %, le pourcentage est la valeur et
 * les grammes ne se savent pas (la contenance n'est écrite nulle part) ; dans
 * une masse (ou sans unité, l'ancienne aide en grammes), le pourcentage se
 * rapporte au maximum que l'aide déclare, `maxDefaut` sinon — en grammes
 * (`enGrammes`).
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

const minuit = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d; };

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

/* ════════════ La portion en grammes, les jours de réserve (revenus pour la carte) ════════════
 *
 * Étape 2 du chantier IoT (19/10 ; I10, § 6) : la carte dit « Distribuer 12 g » et « ≈ 8 j ». Ces trois
 * fonctions avaient quitté le démarrage pour `distributeurfiche.js` (étape 1, tâche 1) quand seule la
 * fiche les lisait ; elles reviennent telles quelles, et `distributeurfiche.js` les reprend d'ici — la
 * fiche et Paramètres n'y voient rien changer. */

/**
 * Combien de grammes fait une portion, et combien de portions part un appui :
 *  - une taille de ration réglée en g ou en kg : un appui = cette quantité ;
 *  - un poids de portion (Aqara `portion_weight`, en g ; ou le number désigné
 *    en grammes) : g par portion, et la taille de ration dit combien de
 *    portions part un appui — toute unité qui n'est PAS une masse (aucune,
 *    « portion », « portions »…) compte des portions (passe bis de l'étape 2,
 *    19/10 ; D1 : Zigbee2MQTT donne l'unité « portion » au `serving_size`, et la
 *    carte disait « Distribuer 6 g » au lieu de 12) ;
 *  - rien de tel : `null` — les jours de réserve ne se devinent pas.
 */
export function mesurePortion(states, portion, poids) {
  const S = states || {};
  const val = (o) => (o && S[o.entity_id] ? nombre(S[o.entity_id].state) : null);
  const vp = val(portion);
  if (portion && vp != null && estMasse(portion.unite)) return { grammesParPortion: enGrammes(vp, portion.unite), portionsParAppui: 1 };
  const vg = poids && estMasse(poids.unite) ? enGrammes(val(poids), poids.unite) : null;
  if (vg == null || !(vg > 0)) return null;
  return { grammesParPortion: vg, portionsParAppui: portion && vp > 0 ? vp : 1 };
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

/* ════════════ La carte (étape 2 du chantier IoT, 19/10 ; I10, I22, § 6 de la conception) ════════════ */

/** Les grammes d'un appui sur « Distribuer » (I10) : `n` portions pour une commande qui ÉCRIT une quantité — la carte en part une ;
 *  ce qui part VRAIMENT, la valeur relevée au minimum de l'entité (`valeurPortions`, en pas) —, sinon ce que l'appareil sert d'un
 *  appui (`portionsParAppui`, sa taille de ration). `null` sans mesure : « Distribuer », sans grammes inventés. */
export function grammesRation(mesure, commande, n = 1) {
  if (!mesure || !(mesure.grammesParPortion > 0)) return null;
  const portions = commande && commande.quantite ? valeurPortions(commande, n) / (commande.pas > 0 ? commande.pas : 1) : (mesure.portionsParAppui > 0 ? mesure.portionsParAppui : 1);
  return Math.round(portions * mesure.grammesParPortion * 10) / 10;
}

const heureLocale = (t) => new Date(t).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });

/** « Repas à 19:00 » aujourd'hui, « Repas demain 07:30 », « Repas mercredi 07:30 » au-delà — le patron de `libellePassage` (robots.js). */
function libelleRepas(date, maintenant = Date.now()) {
  const t = new Date(date).getTime();
  const ecart = Math.round((minuit(t).getTime() - minuit(maintenant).getTime()) / 86400000);
  const h = heureLocale(t);
  if (ecart <= 0) return tr('Repas à {h}', { h });
  if (ecart === 1) return tr('Repas demain {h}', { h });
  return tr('Repas {jour} {h}', { jour: new Date(t).toLocaleDateString(locale(), { weekday: 'long' }), h });
}

/* Le mot COURT d'une anomalie, dans la phrase d'une carte ; la popup dit « Problème signalé par l'appareil » en entier. */
const MOT_ALERTE = { bas: () => tr('Bac presque vide'), bloque: () => tr('Distribution bloquée'), autre: () => tr('Problème signalé') };

/**
 * La phrase d'état du distributeur (I7, § 6), la première ligne qui s'applique, et son encre — la carte large, l'étroite et la
 * compacte la partagent :
 *  1. hors ligne (`enLigne`) : « Indisponible depuis 14:20 », en rouge, le liseré qui respire (`panne`) ; l'aide du bac seule muette
 *     — la vis répond encore — : « Réservoir indisponible » ;
 *  2. une anomalie active (`alerte` : `bas`, `bloque`, `autre`) : « Bac presque vide · Repas à 19:00 », en ambre ;
 *  3. le jour ordinaire : « Repas à 19:00 · ≈ 8 j », « Repas demain 07:30 · ≈ 8 j » ; sans prochain repas « ≈ 8 j de réserve » ;
 *     sans réserve « Repas à 19:00 » ; sinon le dernier repas du jour, « Dernier repas à 07:30 » — en gris, en ambre sous 15 % de bac.
 * Rien ne rassure, et rien ne s'invente : un programme que l'appareil tient sans le montrer (`programme`) se nomme au lieu de
 * « Aucun repas prévu » ; tant que le serveur n'a pas répondu (`sources` faux), un tiret. Rend `{ texte, encre, panne }`.
 */
export function phraseDistributeur({ mort = false, raison = null, depuis = null, alerte = null, prochain = null, jours = null, pct = null, dernier = null, programme = false, sources = true, maintenant = Date.now() } = {}) {
  if (mort && raison === 'reservoir') return { texte: tr('Réservoir indisponible'), encre: 'var(--o-bad)', panne: true };
  if (mort) {
    const q = depuis ? quandLumiere(depuis, maintenant) : null;
    return { texte: q ? tr('Indisponible depuis {h}', { h: q }) : tr('Indisponible'), encre: 'var(--o-bad)', panne: true };
  }
  const repas = prochain && prochain.date ? libelleRepas(prochain.date, maintenant) : null;
  if (alerte && MOT_ALERTE[alerte]) return { texte: [MOT_ALERTE[alerte](), repas].filter(Boolean).join(' · '), encre: 'var(--o-warn)', panne: false };
  const encre = pct != null && pct < 15 ? 'var(--o-warn)' : 'var(--o-text2)';
  const duJour = dernier != null && minuit(dernier).getTime() === minuit(maintenant).getTime();
  const texte = repas && jours != null ? repas + ' · ' + tr('≈ {n} j', { n: jours })
    : repas || (jours != null ? tr('≈ {n} j de réserve', { n: jours })
      : duJour ? tr('Dernier repas à {h}', { h: heureLocale(dernier) })
        : !sources ? '—' : programme ? tr('Programme de l’appareil') : tr('Aucun repas prévu'));
  return { texte, encre, panne: false };
}

/**
 * Ce que la carte du distributeur montre et offre (I5, I6, I10, I22 ; § 6), lu sur l'APPAREIL désigné et la réponse du serveur
 * (`loggia/distributeurs/etat`, ou null tant qu'elle manque) : la lecture de l'appareil (`lecture`), le réservoir NOMMÉ (`pct`,
 * `grammes`), le prochain repas des sources actives (l'état VIVANT d'une automatisation, sinon celui de la réponse), la réserve en
 * jours, « Distribuer » (`envoi` : une portion par la commande de l'appareil, absente quand il ne répond pas — un réservoir muet,
 * lui, n'empêche pas la vis), ses grammes (`ration`), la panne et sa raison, l'anomalie active, et la phrase. « Je l'ai rempli »
 * n'est pas à la carte : la popup l'offre, sur une aide `input_number` vivante (fichedistributeur.jsx).
 */
export function carteDistributeur({ index = null, states = null, cfg = null, etat = null, maintenant = Date.now(), maxDefaut = 1500 } = {}) {
  const S = states || {};
  const lecture = lireDistributeur(index, S, cfg);
  const reservoir = idDe(cfg && cfg.haids && cfg.haids.reservoir);
  const stRes = reservoir ? S[reservoir] : null;
  const reservoirMort = !!reservoir && muette(stRes);
  const maxAide = stRes && stRes.attributes ? nombre(stRes.attributes.max) : null;
  const max = maxAide > 0 ? maxAide : maxDefaut;
  const niveau = reservoirMort ? { pct: null, grammes: null } : niveauDuBac(S, reservoir, max);
  const allumee = (a) => (S[a.entity_id] ? S[a.entity_id].state === 'on' : a.etat === 'on');
  const capteur = lecture.prochainCapteur && S[lecture.prochainCapteur] ? S[lecture.prochainCapteur].state : null;
  const prochain = prochainRepas(etat, maintenant, { allumee, capteur });
  const mesure = mesurePortion(S, lecture.portion, lecture.poidsPortion);
  const jours = etat ? joursDeReserveDistributeur(niveau.grammes, etat, mesure, { allumee }) : null;
  const { mort, raison } = lecture.enLigne;
  const envoi = lecture.commande && !(mort && raison !== 'reservoir') ? envoiDistribuer(lecture.commande, 1) : null;
  // Depuis quand l'appareil se tait : sa commande muette, ou sa connectivité coupée.
  const tu = raison === 'commande' && lecture.commande ? lecture.commande.entity_id
    : raison === 'connectivite' ? ((lecture.soeurs.find(coupee) || {}).id || null) : null;
  /* Le dernier repas : le compteur DÉSIGNÉ dans Paramètres (`haids.distribuees`), s'il a compté aujourd'hui — un compteur à zéro
   * (sa remise à minuit), muet ou sans valeur n'a rien servi (05/10) —, sinon ce que l'appareil ou les automatisations en disent. */
  const designe = idDe(cfg && cfg.haids && cfg.haids.distribuees);
  const stD = designe ? S[designe] : null;
  const tD = stD && nombre(stD.state) > 0 ? Date.parse(stD.last_changed || '') : NaN;
  const dr = !isNaN(tD) && tD >= minuit(maintenant).getTime() ? { t: tD } : dernierRepas(lecture, S, etat, maintenant);
  const alerte = lecture.alerte ? lecture.alerte.type : null;
  const programme = !!(etat && etat.programme && etat.programme.presente && !etat.programme.lisible);
  return {
    lecture, reservoir, reservoirMort, max, pct: niveau.pct, grammes: niveau.grammes, prochain, mesure, jours, envoi,
    ration: envoi ? grammesRation(mesure, lecture.commande, 1) : null,
    mort, raison, alerte,
    phrase: phraseDistributeur({ mort, raison, depuis: tu && S[tu] ? S[tu].last_changed : null, alerte, prochain, jours, pct: niveau.pct,
      dernier: dr ? dr.t : null, programme, sources: etat != null, maintenant }),
  };
}
