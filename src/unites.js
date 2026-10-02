/* ── Lire la vraie unité, jamais la supposer ─────────────────────────────────
 *
 * Home Assistant convertit déjà une température ou une vitesse de vent dans
 * l'unité choisie par l'installation (°F aux États-Unis, mph, in...) : la
 * VALEUR qui arrive est donc toujours la bonne. Le bug n'était pas un chiffre
 * faux, c'était le code qui comparait ce chiffre à des seuils écrits en
 * Celsius ou qui collait "°C" à côté sans vérifier — un Américain lisait
 * « forte chaleur » à 2 °C parce que 35,6 °F avait franchi un seuil pensé
 * pour des degrés Celsius.
 *
 * Les seuils du code restent en Celsius et en km/h : plus simples à lire et
 * à comparer entre eux. C'est la VALEUR qui se convertit vers ce repère
 * commun avant toute comparaison, jamais l'inverse. */

/** Celsius ou Fahrenheit d'une entité de température, repli sur l'unité de
 * l'installation puis sur le Celsius — jamais une supposition silencieuse.
 * `temperature_unit` (entité `weather`) et `unit_of_measurement` (un capteur
 * ordinaire, ex. la température CPU) ne portent pas le même nom. */
export function uniteTemp(attrs, hass) {
  const u = (attrs && (attrs.temperature_unit || attrs.unit_of_measurement))
    || (hass && hass.config && hass.config.unit_system && hass.config.unit_system.temperature);
  return u === '°F' || u === 'F' ? 'F' : 'C';
}

export function versCelsius(valeur, unite) {
  if (valeur == null) return valeur;
  return unite === 'F' ? (valeur - 32) * 5 / 9 : valeur;
}

export function deCelsius(valeur, unite) {
  if (valeur == null) return valeur;
  return unite === 'F' ? valeur * 9 / 5 + 32 : valeur;
}

/** km/h ou mph d'une entité `weather`. HA ne connaît que ces deux-là pour le vent. */
export function uniteVent(attrs) {
  const u = attrs && attrs.wind_speed_unit;
  return u === 'mph' ? 'mph' : 'km/h';
}

export function versKmh(valeur, unite) {
  if (valeur == null) return valeur;
  return unite === 'mph' ? valeur * 1.609344 : valeur;
}
