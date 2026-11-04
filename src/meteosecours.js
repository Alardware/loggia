/* La température du dehors quand la météo n'en donne pas (03/11, idée reprise
 * de HomeDeck — sans son dernier recours, un service en ligne : rien ne sort
 * de la maison).
 *
 * Le secours, c'est la sonde d'une pièce du DEHORS (jardin, terrasse… ou le
 * réglage « Pièce du dehors » de sa fiche, `estDehors`) qui mesure une
 * température : celle que la fiche de la pièce a désignée (`haid.temp`). La
 * première qui répond, dans l'ordre des pièces. */
import { estDehors } from './app/noyau.jsx';
import { lireNombre } from './cartes/mesure.jsx';

export function temperatureDehors(rooms, S) {
  if (!Array.isArray(rooms) || !S) return null;
  for (const r of rooms) {
    if (!r || !r.room || !estDehors(r.room)) continue;
    const id = r.haid && r.haid.temp;
    const v = id && S[id] ? lireNombre(S[id].state) : null;
    if (v != null && Number.isFinite(v)) return v;
  }
  return null;
}
