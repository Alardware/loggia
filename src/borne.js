/* ── La borne de recharge, trouvée sans réglage (chantier G3, E3 ; ADR 0302) ──
 *
 * La puissance de charge du véhicule (`evNow`) ne venait que d'un réglage :
 * chez qui ne l'avait pas rempli, la maison du schéma n'avait jamais de
 * voiture. On la reconnaît désormais par FAMILLE — aucun nom de marque :
 *
 *   — un APPAREIL qui porte une puissance (`sensor` de classe `power`) ET un
 *     `number` de classe `current` RÉGLABLE (des bornes, `min` < `max`) : le
 *     courant maximum de charge ;
 *   — et au moins un INDICE de recharge : un `binary_sensor` de classe `plug`
 *     ou `battery_charging`, ou un `enum` dont un état est `charging` — une
 *     pompe à chaleur à courant limité n'en a aucun ;
 *   — CONFIRMÉ par le tableau Énergie : une ligne de ses appareils mesurés
 *     (`device_consumption`) est sur cet appareil.
 *
 * UN seul candidat, sinon rien : deux bornes, c'est deux voitures, et choisir
 * au hasard ferait mentir le schéma.
 *
 * Ce module est au DÉMARRAGE (la résolution le lit) : il ne garde que la
 * découverte et `borneEnCharge`. Ce que montrent la carte et la popup vit dans
 * `bornevue.js`, qu'elles seules chargent. Pur : ni React ni Home Assistant.
 */
import { wattsDe } from './unites.js';

const MUETS = ['unavailable', 'unknown'];
const nombre = (v) => { const n = typeof v === 'number' ? v : parseFloat(v); return Number.isFinite(n) ? n : null; };
const domaine = (id) => String(id).split('.')[0];
const classeDe = (id, S, m) => ((S[id] && S[id].attributes && S[id].attributes.device_class) || (m && m.deviceClass) || '');

/** Les entités vivantes de chaque appareil : `Map(appareil → [entity_id])`, sans les masquées ni les désactivées. */
function parAppareil(index) {
  const out = new Map();
  const table = index && index.entityMeta;
  if (!table || typeof table.forEach !== 'function') return out;
  table.forEach((m, id) => {
    if (!m || !m.deviceId || m.hidden || m.disabled) return;
    if (!out.has(m.deviceId)) out.set(m.deviceId, []);
    out.get(m.deviceId).push(id);
  });
  return out;
}

/** Un `number` de courant qu'on peut régler : classe `current` (ou unité A) et des bornes. */
function courantReglable(id, S, m) {
  if (domaine(id) !== 'number') return false;
  const a = (S[id] && S[id].attributes) || {};
  const classe = classeDe(id, S, m);
  if (classe !== 'current' && a.unit_of_measurement !== 'A') return false;
  const min = nombre(a.min), max = nombre(a.max);
  return min != null && max != null && max > min;
}

/** L'interrupteur de la charge : le seul de l'appareil, sinon celui dont la clé de traduction parle de charge — sinon aucun. */
function interrupteurDe(ids, meta) {
  const sw = ids.filter(id => domaine(id) === 'switch' && (meta(id).category || '') !== 'diagnostic').sort();
  if (sw.length === 1) return sw[0];
  const charge = sw.filter(id => /charg/.test(String(meta(id).translationKey || '')));
  return charge.length === 1 ? charge[0] : null;
}

/**
 * La borne de la maison, ou null.
 * `{ appareil, puissance, courant, prise, statut, interrupteur, energie }` — chacun un `entity_id` ou null.
 */
export function trouverBorne({ index = null, states = {}, energyPrefs = null } = {}) {
  const S = states || {};
  const meta = (id) => (index && index.entityMeta && index.entityMeta.get(id)) || {};
  const mesures = ((energyPrefs && energyPrefs.device_consumption) || [])
    .flatMap(d => (d ? [d.stat_consumption, d.stat_rate] : [])).filter(x => typeof x === 'string' && x);
  const confirmes = new Set(mesures.map(id => meta(id).deviceId).filter(Boolean));
  const candidats = [];
  parAppareil(index).forEach((ids, appareil) => {
    if (!confirmes.has(appareil)) return;
    const principal = (liste) => liste.sort((x, y) => (meta(x).category ? 1 : 0) - (meta(y).category ? 1 : 0) || (x < y ? -1 : 1))[0] || null;
    const puissance = principal(ids.filter(id => domaine(id) === 'sensor' && classeDe(id, S, meta(id)) === 'power'));
    const courant = principal(ids.filter(id => courantReglable(id, S, meta(id))));
    if (!puissance || !courant) return;
    const prise = principal(ids.filter(id => domaine(id) === 'binary_sensor' && ['plug', 'battery_charging'].indexOf(classeDe(id, S, meta(id))) >= 0));
    const statut = principal(ids.filter(id => domaine(id) === 'sensor' && S[id] && S[id].attributes
      && Array.isArray(S[id].attributes.options) && S[id].attributes.options.map(String).indexOf('charging') >= 0));
    if (!prise && !statut) return;
    const energie = mesures.find(id => meta(id).deviceId === appareil && domaine(id) === 'sensor' && classeDe(id, S, meta(id)) === 'energy')
      || principal(ids.filter(id => domaine(id) === 'sensor' && classeDe(id, S, meta(id)) === 'energy'));
    candidats.push({ appareil, puissance, courant, prise, statut, interrupteur: interrupteurDe(ids, meta), energie: energie || null });
  });
  return candidats.length === 1 ? candidats[0] : null;
}

/** Au-dessus de 50 W, quelque chose charge — en dessous, une borne en veille. */
export const SEUIL_CHARGE_W = 50;

/** La borne charge-t-elle ? Son état `charging`, ou plus de 50 W — ce qu'Objets compte « actif ». */
export function borneEnCharge(borne, S = {}) {
  if (!borne || !S) return false;
  const statut = borne.statut && S[borne.statut] ? String(S[borne.statut].state) : null;
  const w = borne.puissance && S[borne.puissance] && MUETS.indexOf(String(S[borne.puissance].state)) < 0 ? wattsDe(S[borne.puissance]) : null;
  return statut === 'charging' || (w != null && w > SEUIL_CHARGE_W);
}
