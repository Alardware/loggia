/* Le dernier MODE de chaque ventilateur (ticket #43).
 *
 * « Avant je pouvais mettre la ventilation en automatique ; maintenant c'est
 * soit 50 %, soit éteint. » Allumé d'un `turn_on` nu, un purificateur VeSync
 * repart en manuel, à sa vitesse par défaut. Une bascule de Loggia le rallume
 * donc dans le mode qu'il avait. Retenu hors des composants : une carte se
 * remonte, éteinte, et l'oubliait. */

const MODES = new Map();

/** Noter le mode d'un ventilateur tel que Home Assistant le publie : allumé, il fait foi ; éteint, il ne sert que de premier repère. */
export function retenirModeVentilo(id, st) {
  if (!id || String(id).split('.')[0] !== 'fan' || !st || !st.attributes) return;
  const { preset_modes: modes, preset_mode: mode } = st.attributes;
  if (!Array.isArray(modes)) return;
  /* Allumé HORS de ses modes (manuel, d'une vitesse choisie ailleurs) : le
   * mode retenu plus tôt ne vaut plus. Le rallumer en « auto » contredirait le
   * dernier choix (relecture du 03/11). */
  if (modes.indexOf(mode) < 0) { if (st.state === 'on') MODES.delete(id); return; }
  if (st.state === 'on' || !MODES.has(id)) MODES.set(id, mode);
}

/** Ce que l'allumage de `id` doit porter en plus : `{ preset_mode }`, ou null. */
export function chargeAllumage(id) {
  return MODES.has(id) ? { preset_mode: MODES.get(id) } : null;
}
