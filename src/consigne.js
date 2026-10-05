/* ── La consigne d'un thermostat : la lire, jamais l'inventer ────────────────
 *
 * Audit du 03/10. La carte et la fiche d'un thermostat retombaient sur 20 °C,
 * celles du fil pilote sur 19, dès que rien ne publiait de consigne unique.
 * Ce n'est pas un cas rare : en mode `heat_cool`, Home Assistant met
 * `temperature` à null et porte la consigne en DEUX bornes (`target_temp_low`,
 * `target_temp_high`) ; bien des intégrations font de même à l'arrêt, et un
 * `input_number` indisponible ne dit rien non plus. L'écran affichait donc
 * « 20 °C » — la compacte, elle, disait déjà « — » —, et le « + » ENVOYAIT
 * 20,5 : une consigne que personne n'avait choisie, posée sur un appareil qui
 * en tenait deux.
 *
 * Choix : « — » et des boutons inertes tant qu'aucune consigne unique n'est
 * lisible (règle du zéro, ADR 0030). Piloter la plage aurait demandé une
 * capacité de plus au moteur d'actions (`set_temperature_range` : deux
 * champs, deux jeux de bornes, l'écart minimal que l'appareil impose entre
 * eux) et deux paires de boutons sur une carte de 184 px — beaucoup de
 * surface, et autant de façons d'envoyer une plage fausse, pour un mode que
 * l'on règle rarement. La plage se LIT dans la fiche ; elle se règle dans
 * Home Assistant, ou en repassant l'appareil sur un mode à consigne unique.
 *
 * Aucune conversion ici : la valeur arrive déjà dans l'unité de
 * l'installation et repart telle quelle (ADR 0128). */

/** Un nombre fini, ou null — « unknown », '' et undefined ne valent pas 0. */
function nombre(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** La consigne unique d'un `climate`, ou null — jamais un défaut. */
export function consigneClimat(attrs) {
  return nombre(attrs && attrs.temperature);
}

/** La plage d'un `climate` à deux bornes : `{ bas, haut }`, ou null s'il en
 * manque une — une moitié de plage ne se montre pas. */
export function plageClimat(attrs) {
  const bas = nombre(attrs && attrs.target_temp_low);
  const haut = nombre(attrs && attrs.target_temp_high);
  return bas != null && haut != null ? { bas, haut } : null;
}

/** La consigne d'après un appui sur ± d'un fil pilote : au demi-degré, dans
 * ses bornes de repli (un `input_number` ne borne rien côté serveur). Une
 * consigne absente le RESTE : null, jamais « un défaut + 0,5 ». Une chaîne
 * est refusée aussi — « 19 » + 0,5 ferait « 190.5 ». */
export function pasConsigne(actuelle, pas, min, max) {
  if (typeof actuelle !== 'number' || !Number.isFinite(actuelle)) return null;
  return Math.max(min, Math.min(max, Math.round((actuelle + pas) * 2) / 2));
}
