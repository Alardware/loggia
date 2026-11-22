/* Les réglages de l'air, que la fiche offre quand l'appareil les SAIT (chantier du 20/11, A5).
 *
 * Un climatiseur règle sa ventilation et son balayage, un purificateur ou un ventilateur sa vitesse, un humidificateur ou un
 * déshumidificateur son humidité visée ; et l'un comme l'autre dit quand son bac est plein. Les commandes existaient (`actions.js`),
 * aucun écran ne les appelait. Ici, ce qui se LIT : chaque réglage n'est proposé que si l'entité le déclare — son
 * `supported_features` (`entityCaps`) ET sa liste (`fan_modes`, `swing_modes`, `percentage_step`, `min_humidity`…) —, jamais d'après
 * son nom ni sa marque.
 *
 * Pur : `tr` / `trHA` pour les mots, `entityCaps` pour ce que l'entité sait faire, et ce qu'on lui passe — l'état de l'entité, les
 * états (`S`) et l'index (`meta`, une Map `entity_id → fiche`) pour son bac.
 */
import { tr, trHA } from './i18n.js';
import { entityCaps } from './capabilities.js';
import { voisinsDeLAppareil } from './chauffageseuils.js';

// Ce que HA appelle un bac : la clé de traduction que l'intégration pose sur le binaire de l'appareil, allumé quand il y a un souci.
// Lues dans le code des intégrations : Tuya `tankfull` ; Vesync `water_lacks`, `water_tank_lifted` ; Xiaomi Miio `no_water`.
const BACS = {
  tankfull: 'plein',
  water_lacks: 'vide',
  no_water: 'vide',
  water_tank_lifted: 'retire',
};

const brut = (v) => String(v);
// « quiet_mode » → « Quiet mode » : tel que l'appareil l'écrit, lisible, une majuscule en tête.
const lisible = (v) => { const t = brut(v).replace(/_/g, ' ').trim(); return t.charAt(0).toUpperCase() + t.slice(1); };

/** Le mot d'un réglage : celui de Home Assistant pour les siens (« auto », « low », « vertical »…), dans la langue de l'écran ; sinon
 * tel que l'appareil l'écrit. `domaine` : `climate` ou `humidifier` ; `attribut` : `fan_mode`, `swing_mode`, `swing_horizontal_mode`, `mode`. */
export function motReglage(domaine, attribut, valeur) {
  return trHA('component.' + domaine + '.entity_component._.state_attributes.' + attribut + '.state.' + valeur) || lisible(valeur);
}

// Une liste d'options publiée : des textes non vides, au moins deux (un seul choix n'est pas un réglage).
const options = (liste) => (Array.isArray(liste) ? liste.filter(m => typeof m === 'string' && m) : []);
const nombreOuNull = (v) => { const n = Number(v); return v != null && v !== '' && Number.isFinite(n) ? n : null; };

/** Un menu de choix d'un `climate` ou d'un `humidifier` : `{ cle, titre, capacite, options: [{ id, label }], courant }`. */
function menu(cle, titre, capacite, domaine, attribut, liste, courant) {
  const ids = options(liste);
  if (ids.length < 2) return null;
  return { cle, titre, capacite, options: ids.map(id => ({ id, label: motReglage(domaine, attribut, id) })), courant: ids.includes(courant) ? courant : null };
}

/** La vitesse d'un ventilateur ou d'un purificateur : `{ pct, pas, etapes }` — `pct` sa vitesse (null éteint), `pas` le cran de
 * l'appareil (`percentage_step`), `etapes` ses crans numérotés quand il en a de 2 à 6 (sinon `[]` : un pas à pas). null sans le bit. */
export function vitesseDuVentilo(id, st) {
  const a = (st && st.attributes) || {};
  if (!st || !entityCaps(id, st).can.has('set_speed')) return null;
  const pas = nombreOuNull(a.percentage_step) > 0 ? Number(a.percentage_step) : 1;
  const n = Math.round(100 / pas);
  const pct = st.state === 'on' ? nombreOuNull(a.percentage) : null;
  return { pct, pas, etapes: n >= 2 && n <= 6 ? Array.from({ length: n }, (_, i) => i + 1) : [] };
}

/** Le cran de `etapes` où se trouve `pct` (1…n), ou null éteint. */
export function etapeDe(vitesse, pct) {
  if (!vitesse || !vitesse.etapes.length || !(pct > 0)) return null;
  return Math.min(vitesse.etapes.length, Math.max(1, Math.round(pct / vitesse.pas)));
}

/** Le pourcentage que vise le cran `k`. */
export const pctDeLEtape = (vitesse, k) => Math.min(100, Math.round(k * vitesse.pas));

/** La vitesse voisine d'un ventilateur sans crans : d'un pas (au moins 10 %), jamais à 0 (éteindre est le geste de sa carte) ni
 * au-delà de 100 ; null si elle ne bouge pas. */
export function vitesseVoisine(vitesse, sens) {
  // Éteint, « − » ne rallume pas au plus bas : un geste qui éteint ne démarre rien.
  if (!vitesse || (vitesse.pct == null && sens < 0)) return null;
  const pas = Math.max(vitesse.pas, 10);
  const de = vitesse.pct == null ? 0 : vitesse.pct;
  const vise = Math.min(100, Math.max(Math.round(vitesse.pas), Math.round(de + sens * pas)));
  return vise === Math.round(de) ? null : vise;
}

/** L'humidité visée d'un `humidifier` ou d'un `climate` : `{ min, max, valeur, courante }` ; null si l'entité n'en règle pas.
 * Un `climate` doit le DIRE (bit `set_humidity`) ; un `humidifier` la règle toujours, ses bornes par défaut 0 et 100. */
export function humiditeVisee(id, st) {
  const a = (st && st.attributes) || {};
  if (!st) return null;
  const dom = String(id).split('.')[0];
  const valeur = nombreOuNull(a.humidity);
  if (dom === 'climate') { if (!entityCaps(id, st).can.has('set_humidity') || valeur === null) return null; }
  else if (dom !== 'humidifier' || !('humidity' in a)) return null;
  const min = nombreOuNull(a.min_humidity) ?? 0;
  const max = nombreOuNull(a.max_humidity) ?? 100;
  return max > min ? { min, max, valeur, courante: nombreOuNull(a.current_humidity) } : null;
}

/** Le cran d'humidité : 5 points sur une plage de 20 ou plus, 1 sinon. */
export const pasHumidite = (h) => (h.max - h.min >= 20 ? 5 : 1);

/** L'humidité voisine, calée sur le pas et dans les bornes ; null si elle ne bouge pas. */
export function humiditeVoisine(h, sens) {
  if (!h) return null;
  const pas = pasHumidite(h);
  const v = h.valeur == null ? h.min : h.valeur;
  const vise = sens > 0 ? Math.floor(v / pas) * pas + pas : Math.ceil(v / pas) * pas - pas;
  const borne = Math.min(h.max, Math.max(h.min, vise));
  return borne === v ? null : borne;
}

/** Une consigne d'humidité envoyée, dans les bornes de l'appareil. */
export const humiditeBornee = (h, v) => Math.min(h.max, Math.max(h.min, Math.round(Number(v))));

/** Les bacs en alerte de l'appareil : `[{ cle: 'plein' | 'vide' | 'retire', id, texte }]` — un binaire du MÊME appareil, allumé, que
 * l'intégration a nommé par sa clé de traduction (`BACS`) ; jamais par son nom. */
export function bacsEnAlerte(id, S, meta) {
  if (!S || !meta) return [];
  const sortie = [];
  voisinsDeLAppareil(meta, id).forEach((eid) => {
    if (eid.indexOf('binary_sensor.') !== 0 || !S[eid] || S[eid].state !== 'on') return;
    const m = meta.get(eid) || {};
    if (m.disabled || m.hidden) return;
    const cle = BACS[String(m.translationKey || '').toLowerCase()];
    if (cle && !sortie.some(x => x.cle === cle)) {
      sortie.push({ cle, id: eid, texte: cle === 'plein' ? tr('Bac plein') : cle === 'vide' ? tr('Réservoir vide') : tr('Réservoir retiré') });
    }
  });
  return sortie;
}

/**
 * Tout ce qu'une fiche offre pour `id` (`climate`, `fan` ou `humidifier`) : `{ menus, vitesse, humidite, bacs }`, chacun vide ou null
 * quand l'appareil ne le sait pas. Un appareil muet n'offre rien à régler (ses bacs, eux, se disent encore).
 */
export function reglagesAir(id, S, meta) {
  const vide = { menus: [], vitesse: null, humidite: null, bacs: [] };
  const st = S && id ? S[id] : null;
  if (!st) return vide;
  const dom = String(id).split('.')[0];
  const bacs = bacsEnAlerte(id, S, meta);
  if (st.state === 'unavailable' || st.state === 'unknown') return { ...vide, bacs };
  const a = st.attributes || {};
  const can = entityCaps(id, st).can;
  const menus = [];
  if (dom === 'climate') {
    if (can.has('set_fan_mode')) menus.push(menu('fan_mode', tr('Ventilation'), 'set_fan_mode', 'climate', 'fan_mode', a.fan_modes, a.fan_mode));
    if (can.has('set_swing_mode')) menus.push(menu('swing_mode', tr('Balayage'), 'set_swing_mode', 'climate', 'swing_mode', a.swing_modes, a.swing_mode));
    if (can.has('set_swing_horizontal_mode')) menus.push(menu('swing_horizontal_mode', tr('Balayage horizontal'), 'set_swing_horizontal_mode', 'climate', 'swing_horizontal_mode', a.swing_horizontal_modes, a.swing_horizontal_mode));
  } else if (dom === 'humidifier' && can.has('set_mode')) {
    menus.push(menu('mode', tr('Mode'), null, 'humidifier', 'mode', a.available_modes, a.mode));
  }
  return { menus: menus.filter(Boolean), vitesse: dom === 'fan' ? vitesseDuVentilo(id, st) : null, humidite: humiditeVisee(id, st), bacs };
}
