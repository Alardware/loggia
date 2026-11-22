/* ── Les tuiles Gaz et Eau de la vue Énergie (chantier du 20/11, F2 ; ADR 0381) ──
 *
 * Pur, chargé avec la vue Énergie seulement. La vue leur donne la JOURNÉE du
 * compteur (`valJour`, comme pour l'électricité), dans l'unité du compteur ;
 * ici se décide comment l'écrire. Avant, la tuile lisait l'état brut : chez un
 * compteur qui compte depuis sa pose (Gazpar, Suez, Veolia), « Eau 1 235 m³ »
 * pour la journée — et l'eau, arrondie à l'unité, écrivait 0,35 m³ « 0 ».
 *
 * `{ valeur, decimales, unite }`, ou null quand il n'y a pas de chiffre : la
 * vue écrit alors un tiret, jamais un index pris pour une journée.
 */
import { facteurKwh } from './unites.js';

const lisible = (v) => typeof v === 'number' && Number.isFinite(v);
const M3 = ['m³', 'm3'];

/** L'eau du jour : en litres sous 1 m³, en m³ (deux décimales) au-dessus ; des litres entiers ; une autre unité telle quelle. */
export function tuileEau(v, unite) {
  if (!lisible(v)) return null;
  const u = unite ? String(unite).trim() : 'L';
  if (M3.indexOf(u) >= 0) return v < 1 ? { valeur: v * 1000, decimales: 0, unite: 'L' } : { valeur: v, decimales: 2, unite: 'm³' };
  if (u === 'L') return { valeur: v, decimales: 0, unite: 'L' };
  return { valeur: v, decimales: 1, unite: u };
}

/** Le gaz du jour : une énergie (Wh, kWh, MJ…) se dit en kWh ; un volume (m³) garde son unité. */
export function tuileGaz(v, unite) {
  if (!lisible(v)) return null;
  const u = unite ? String(unite).trim() : 'kWh';
  const f = facteurKwh(u);
  const energie = f !== 1 || u.toLowerCase() === 'kwh';
  return energie ? { valeur: v * f, decimales: 1, unite: 'kWh' } : { valeur: v, decimales: 1, unite: u };
}
