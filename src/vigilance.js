/* ── La vigilance météo (chantier Capteurs, étape 2 ; C28, § 19.5) ────────────────────────────────
 *
 * MeteoAlarm n'est pas un détecteur : elle quitte Maison, n'entre pas dans le
 * groupe Sécurité, et garde sa carte, dans Dehors. La carte lit, dans l'ordre :
 *  - le capteur d'alerte départementale de Météo-France — son état EST le niveau
 *    (« Vert », « Jaune », « Orange », « Rouge »), ses attributs disent le niveau
 *    de chaque phénomène (« Vent violent », « Orages ») ;
 *  - sinon le binaire MeteoAlarm (`safety`), reconnu par la règle de l'Accueil
 *    (attention.js) : `awareness_level` (« 2; yellow; Moderate »), l'attribution,
 *    à défaut l'identifiant ; `event` dit l'événement ; sans couleur, la
 *    gravité à l'échelle de MeteoAlarm — Severe l'orange, Extreme le rouge
 *    (ADR 0310 : Severe valait le rouge).
 * Au calme, elle écrit le NIVEAU (« Vigilance verte »), jamais « Tout va bien » ;
 * sans niveau connu (MeteoAlarm éteinte), « Aucune alerte en cours ». En alerte,
 * l'ambre pour jaune, l'orange pour orange, le rouge pour rouge, avec l'événement
 * s'il est donné. Muette, « Indisponible », à regarder : une panne.
 *
 * Pur : pas de React, pas de Home Assistant.
 */
import { tr } from './i18n.js';
// Le niveau se lit en UN endroit, avec la règle de l'Accueil (lot 6 Gladys, ADR 0310) : attention.js.
import { estMeteoAlarm, niveauVigilanceDe, lireVigilance, texteVigilance } from './attention.js';

/** Le niveau d'un mot de couleur — « Jaune », « yellow » —, ou null (en français comme en anglais : « Vert » chez Météo-France,
 *  « yellow » chez MeteoAlarm). */
export const niveauDe = niveauVigilanceDe;

/** Le capteur d'alerte départementale de Météo-France : le rôle `vigilance` de l'index (son identifiant stable), sinon sa
 *  plateforme et sa clé de traduction (`weather_alert`) ou son identifiant ; sans registre, l'identifiant (`…_weather_alert`) et
 *  un état qui est un niveau. */
export function estVigilanceMeteoFrance(id, st, meta = null) {
  if (String(id).indexOf('sensor.') !== 0) return false;
  const m = meta || {};
  // Le rôle que le composant pose à son identifiant stable, « 18 Weather alert » (ADR 0310) — la clé, pas le nom.
  if (m.meteo === 'vigilance') return true;
  if (m.platform === 'meteo_france' && (m.translationKey === 'weather_alert' || /_weather_alert$/.test(id))) return true;
  return /_weather_alert$/.test(id) && !!niveauDe(st && st.state);
}

/** Une entité qui dit la vigilance météo : MeteoAlarm (la règle de l'Accueil), ou le capteur de Météo-France. */
export function estVigilance(id, st, meta = null) {
  return estMeteoAlarm(id, st && st.attributes) || estVigilanceMeteoFrance(id, st, meta);
}

/** Le capteur de vigilance de la maison — le premier trouvé parmi les états (Météo-France d'abord, qui dit le niveau
 *  de chaque phénomène, MeteoAlarm sinon) — ou null. Le widget et la popup météo le lisent (sa maquette, 20/10). */
export function capteurVigilance(S, index = null) {
  const meta = (id) => (index && index.entityMeta ? index.entityMeta.get(id) : null);
  const ids = Object.keys(S || {});
  return ids.find(id => estVigilanceMeteoFrance(id, S[id], meta(id))) || ids.find(id => estMeteoAlarm(id, S[id] && S[id].attributes)) || null;
}

/**
 * La vue de la carte Vigilance météo : `{ niveau, detail, phrase, ton, glyphe, regarder, muette, puces }` — `ton` : null au
 * calme, 'warn' (jaune), 'warn2' (orange), 'bad' (rouge, ou muette) ; `puces` vide : la carte n'en a pas.
 */
export function vueVigilance(S, id) {
  const st = S && S[id];
  const muette = !st || st.state === 'unavailable' || st.state === 'unknown';
  // Le niveau et le détail : LA lecture (attention.js) ; la phrase, la même que celle du widget et de l'Accueil.
  const v = muette ? null : lireVigilance(id, st);
  const niveau = v ? v.niveau : null, detail = v ? v.detail : null;
  const phrase = muette ? tr('Indisponible') : !niveau ? tr('Aucune alerte en cours') : texteVigilance(v);
  const ton = muette || niveau === 'rouge' ? 'bad' : niveau === 'orange' ? 'warn2' : niveau === 'jaune' ? 'warn' : null;
  return { niveau, detail, phrase, ton, glyphe: 'umbrella', regarder: muette || (!!niveau && niveau !== 'vert'), muette, puces: [] };
}
