/* La course du soleil, pour « Nuit de l'écran » (ADR 0287) quand Home
 * Assistant n'a pas de `sun.sun`. Chargé à la demande par nuitecran.js : le
 * démarrage ne l'emporte pas.
 *
 * Même calcul que `sunInfo` (App.jsx, d'où l'on ne peut pas importer), réduit
 * aux deux heures utiles. */

/** Lever et coucher du soleil en heures locales, à la position que Home
 *  Assistant connaît ; null sans position. */
export function coursSoleil(hass, date = new Date()) {
  const c = hass && hass.config;
  if (!c || typeof c.latitude !== 'number' || typeof c.longitude !== 'number') return null;
  const rad = Math.PI / 180;
  const j = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 864e5);
  const B = rad * (360 / 365) * (j - 81);
  const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B); // équation du temps (min)
  const decl = -23.44 * Math.cos(rad * (360 / 365) * (j + 10));
  // Demi-arc diurne, en heures ; borné : jour ou nuit polaires donnent 12 h ou 0 h.
  const H = Math.acos(Math.min(1, Math.max(-1, -Math.tan(rad * c.latitude) * Math.tan(rad * decl)))) / rad / 15;
  const midi = 12 - c.longitude / 15 - date.getTimezoneOffset() / 60 - eot / 60;
  return { lever: midi - H, coucher: midi + H };
}
