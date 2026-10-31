/* ── L'eau chaude : ce que dit un `water_heater` (chantier G3, E2 ; ADR 0302) ──
 *
 * Un chauffe-eau, un ballon thermodynamique ou une chaudière qui fait l'eau
 * chaude a sa carte et sa popup ; ce module dit ce qu'elles montrent, sans
 * React ni Home Assistant :
 *   — le MODE traduit et la phrase de la carte : ceux de la carte générique
 *     (`modeChauffeEau`, `phraseChauffeEau`, objets.js, chantier G1) — les sept
 *     états standard ; un mode du fabricant reste tel qu'il l'écrit ;
 *   — « en chauffe » seulement si un attribut connu le dit
 *     (`chauffeEauEnChauffe` : `hvac_action` à `heating` ou `preheating`) ;
 *   — la température de l'eau, la consigne et ses BORNES (`min_temp`,
 *     `max_temp` : Home Assistant refuse une consigne qui en sort) ;
 *   — ce que l'appareil sait faire, lu dans `supported_features`.
 */
import { tr } from './i18n.js';
import { modeChauffeEau, phraseChauffeEau, chauffeEauEnChauffe } from './objets.js';

/** `WaterHeaterEntityFeature` de Home Assistant. */
const EAU_CONSIGNE = 1;
const EAU_MODE = 2;
const EAU_ABSENCE = 4;
const EAU_MARCHE = 8;

const MUETS = ['unavailable', 'unknown'];
const nombre = (v) => { const n = typeof v === 'number' ? v : parseFloat(v); return Number.isFinite(n) ? n : null; };

/** La consigne ramenée dans les bornes de l'appareil, au pas donné (1° par défaut, 0,5 si l'appareil en a un plus fin). */
export function bornerConsigne(v, min, max, pas = 1) {
  const n = nombre(v);
  if (n == null) return null;
  const p = nombre(pas) > 0 ? nombre(pas) : 1;
  let x = Math.round(n / p) * p;
  if (nombre(min) != null) x = Math.max(nombre(min), x);
  if (nombre(max) != null) x = Math.min(nombre(max), x);
  return Math.round(x * 10) / 10;
}

/**
 * Ce que montrent la carte et la popup d'un chauffe-eau.
 *
 * `{ nom, mort, marche, mode, motMode, actuelle, consigne, min, max, pas, modes,
 *    absence, sait: { consigne, mode, absence, marche }, phrase: { texte, encre }, plaque: [fond, encre] }`
 */
export function vueEauChaude({ id, S = {}, nom = null }) {
  const st = (S && S[id]) || null;
  const a = (st && st.attributes) || {};
  const etat = st ? String(st.state) : 'unavailable';
  const mort = !st || MUETS.indexOf(etat) >= 0;
  const bits = nombre(a.supported_features) || 0;
  const liste = Array.isArray(a.operation_list) ? a.operation_list.map(String) : [];
  const mode = mort ? null : (a.operation_mode != null ? String(a.operation_mode) : etat);
  const marche = !mort && mode !== 'off' && etat !== 'off';
  const actuelle = nombre(a.current_temperature);
  const consigne = nombre(a.temperature);
  const absence = a.away_mode === 'on' ? true : a.away_mode === 'off' ? false : null;
  const sait = {
    consigne: !!(bits & EAU_CONSIGNE),
    mode: !!(bits & EAU_MODE) && liste.length > 1,
    absence: !!(bits & EAU_ABSENCE),
    // Marche/arrêt : le service dédié, sinon le mode `off` de sa liste.
    marche: !!(bits & EAU_MARCHE) || liste.indexOf('off') >= 0,
  };
  const motMode = mode ? modeChauffeEau(mode) : null;
  // En chauffe : seulement si un attribut connu le dit (G1) — un ballon en « Éco » n'est pas un appareil qui chauffe.
  const chauffe = marche && chauffeEauEnChauffe(a);
  // La phrase de la carte générique (G1), et l'absence quand elle est posée.
  const texte = mort ? tr('Indisponible') : [phraseChauffeEau(st), absence && marche ? tr('Absence') : null].filter(Boolean).join(' · ');
  return {
    nom: nom || a.friendly_name || id,
    mort, marche, chauffe, mode, motMode, actuelle, consigne, absence, sait,
    min: nombre(a.min_temp), max: nombre(a.max_temp),
    pas: nombre(a.target_temp_step) > 0 ? nombre(a.target_temp_step) : 1,
    modes: liste.map(m => ({ id: m, label: modeChauffeEau(m) })),
    // Le mode de remise en marche : celui qui n'est pas l'arrêt, le premier de sa liste.
    modeMarche: liste.find(m => m !== 'off') || null,
    // L'orange de la chauffe seulement quand il chauffe ; en marche, le texte ; à l'arrêt ou muet, le gris.
    phrase: { texte, encre: chauffe ? 'var(--o-orange)' : marche ? 'var(--o-text2)' : 'var(--o-text3)' },
    plaque: chauffe ? ['rgba(var(--o-orange-rgb),.18)', 'var(--o-orange)'] : marche ? ['var(--o-s1)', 'var(--o-text1)'] : ['var(--o-s1)', 'var(--o-text3)'],
    // La température de l'eau, en grand à droite de la carte.
    chiffre: actuelle != null ? Math.round(actuelle) : (consigne != null ? Math.round(consigne) : null),
  };
}

/** Les ordres d'une marche ou d'un arrêt : `[domaine, service, données]`, ou null si l'appareil ne sait pas. */
export function ordreMarche(id, v, allumer) {
  if (!v || !v.sait.marche) return null;
  // Le service dédié quand l'appareil le déclare (bit 8) ; sinon le mode `off` de sa liste, et pour rallumer le premier autre.
  if (v.sait.marche && !(v.modes.some(m => m.id === 'off'))) return ['water_heater', allumer ? 'turn_on' : 'turn_off', { entity_id: id }];
  if (!allumer) return ['water_heater', 'set_operation_mode', { entity_id: id, operation_mode: 'off' }];
  return v.modeMarche ? ['water_heater', 'set_operation_mode', { entity_id: id, operation_mode: v.modeMarche }] : ['water_heater', 'turn_on', { entity_id: id }];
}
