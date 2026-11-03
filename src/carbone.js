/* ── Le réseau d'Electricity Maps, lu à la clé (lot 14 Gladys, D16 et E1 ; ADR 0319) ──
 *
 * L'intégration Electricity Maps (plateforme `co2signal`) publie deux capteurs :
 * la part d'énergies FOSSILES du réseau (`fossil_fuel_percentage`, en %) et son
 * INTENSITÉ CARBONE (`carbon_intensity`, en gCO2eq/kWh). La vue Énergie cherchait
 * la première au NOM (`/fossil/` dans l'identifiant) : renommée, la tuile
 * disparaissait, et l'intensité ne se lisait nulle part (ADR 0164).
 *
 * Désormais : une entité de la plateforme, reconnue à sa clé de traduction ; sans
 * clé (une version ancienne de l'intégration), à son unité. Jamais le nom.
 *
 * Pur : les états et la table des métadonnées de l'index (`entityMeta`) entrent,
 * des identifiants ou null sortent (tests/gladys_lot14_lecture.test.mjs). Seule
 * la vue Énergie, chargée à la demande, l'importe.
 */

const CLES = { fossil_fuel_percentage: 'fossile', carbon_intensity: 'intensite' };
const parUnite = (u) => (u === '%' ? 'fossile' : /^gCO2(eq)?\/kWh$/i.test(String(u || '')) ? 'intensite' : null);

/** `{ fossile, intensite }` : les capteurs d'Electricity Maps, ou null pour celui que la maison n'a pas. */
export function capteursCarbone(S, meta) {
  const out = { fossile: null, intensite: null };
  if (!S || !meta || typeof meta.forEach !== 'function') return out;
  meta.forEach((m, id) => {
    if (!m || m.platform !== 'co2signal' || m.disabled || String(id).indexOf('sensor.') !== 0 || !S[id]) return;
    const role = m.translationKey ? CLES[m.translationKey] : parUnite((S[id].attributes || {}).unit_of_measurement);
    if (role && !out[role]) out[role] = id;
  });
  return out;
}

/** La valeur d'un de ces capteurs, ou null quand il ne dit rien de lisible. */
export function valeurCarbone(S, id) {
  const v = id && S && S[id] ? parseFloat(S[id].state) : NaN;
  return Number.isFinite(v) ? v : null;
}

/** L'unité de l'intensité, écrite comme on la lit : « gCO₂eq/kWh ». */
export const uniteCarbone = (u) => String(u || 'gCO2eq/kWh').replace('CO2', 'CO₂');
