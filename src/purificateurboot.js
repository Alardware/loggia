/* Reconnaître un PURIFICATEUR d'air (sa consigne du 21/11, ADR 0387) — la seule part de sa fiche que le démarrage embarque.
 *
 * Un purificateur est un `fan` comme un ventilateur de plafond ou la ventilation d'un poêle : rien dans son état ne le distingue.
 * Ce qui le dit, c'est son APPAREIL : il porte une mesure de l'air (la qualité que VeSync publie, ses particules) ou la durée de
 * vie de son filtre. On le lit dans l'index — la clé de traduction de l'intégration, la classe de l'entité —, jamais dans un nom
 * ni une marque. Le reste de la fiche (`purificateur.js`, `fichepurificateur.jsx`) se charge à l'ouverture.
 */
import { siblingsOf } from './discovery.js';

// Les clés de traduction des intégrations : VeSync `air_quality`, `pm25`, `filter_life` ; Xiaomi Miio `aqi`, `filter_life_remaining`.
const CLES_AIR = ['air_quality', 'pm25', 'pm2_5', 'aqi', 'filter_life', 'filter_life_remaining'];
// Les classes de Home Assistant qui disent une mesure de l'air.
const CLASSES_AIR = ['pm25', 'pm10', 'pm1', 'aqi'];

/** Vrai quand `id` est le ventilateur d'un purificateur : un `fan` dont l'appareil porte une mesure de l'air ou un filtre. */
export function estPurificateur(index, id) {
  if (!id || String(id).indexOf('fan.') !== 0 || !index || !index.entityMeta) return false;
  return siblingsOf(index, id).some((s) => {
    if (s.indexOf('sensor.') !== 0) return false;
    const m = index.entityMeta.get(s) || {};
    if (m.disabled) return false;
    return CLES_AIR.indexOf(String(m.translationKey || '').toLowerCase()) >= 0 || CLASSES_AIR.indexOf(m.deviceClass) >= 0;
  });
}
