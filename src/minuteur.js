/* Le décompte d'un minuteur d'extinction (21/09).
 *
 * « Pourquoi Loggia doit rester ouvert, c'est absurde, et je n'ai pas le
 * décompte. » Le minuteur vit désormais dans Home Assistant
 * (`custom_components/loggia/minuteurs.py`) : l'écran ne tient plus rien, il
 * LIT une heure de fin et compte à rebours dessus, à la seconde.
 *
 * L'heure qui fait foi est celle du SERVEUR : la réponse la donne
 * (`maintenant`), on en tire l'écart avec l'horloge de l'appareil. Une tablette
 * qui retarde de trois minutes n'annonce pas trois minutes de trop.
 */

/** L'écart, en millisecondes, entre l'horloge du serveur et celle de
 *  l'appareil, mesuré au moment où la réponse arrive. 0 sans réponse. */
export function decalageServeur(etat, localMs) {
  const m = etat && Number(etat.maintenant);
  return m > 0 ? m * 1000 - localMs : 0;
}

/** Les secondes qui restent au minuteur de `id`, entières, ou `null` s'il n'y
 *  en a pas (ou plus). */
export function resteMinuteur(etat, id, localMs, decalageMs = 0) {
  const m = etat && etat.minuteurs && etat.minuteurs[id];
  const fin = m ? Number(m.fin) : NaN;
  if (!(fin > 0)) return null;
  const s = Math.ceil(fin - (localMs + decalageMs) / 1000);
  return s > 0 ? s : null;
}

/** « 29:41 », « 4:05 », « 1:02:05 » : le décompte tel qu'on le lit sur une
 *  minuterie de cuisine. */
export function decompte(secondes) {
  const s = Math.max(0, Math.floor(Number(secondes) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const deux = (n) => String(n).padStart(2, '0');
  return h > 0 ? h + ':' + deux(m) + ':' + deux(r) : m + ':' + deux(r);
}
