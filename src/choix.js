/* La logique d'une liste de choix (`ListeChoix`, ui.jsx), à part pour se tester
 * sans navigateur : filtrer, grouper, placer.
 *
 * Retour du 18/09 (« pourquoi sont-ils blancs comme ça », captures des
 * Alertes) : le menu d'un <select> natif est dessiné par le système — blanc
 * sous Windows, quel que soit le thème. Loggia dessine donc le sien, partout.
 */

/** Au-delà de douze options, un champ filtre la liste. */
export const SEUIL_RECHERCHE = 12;

/** Minuscules sans accents : « Éclairage » se trouve en tapant « eclai ». */
export function sansAccents(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Les options qui répondent au texte tapé : le nom, l'identifiant affiché
 *  dessous ou la clé elle-même. Sans texte, toutes. */
export function filtrerChoix(options, texte) {
  const liste = Array.isArray(options) ? options : [];
  const q = sansAccents(String(texte == null ? '' : texte).trim());
  if (!q) return liste;
  return liste.filter(o => o && sansAccents([o.label, o.sub, o.id].filter(x => x != null).join(' ')).indexOf(q) >= 0);
}

/** Les options en blocs : celles qui se suivent sous le même `groupe` en font
 *  un seul, sous son intitulé. `i` garde le rang dans la liste — celui que
 *  suivent les flèches du clavier. */
export function blocsChoix(options) {
  const blocs = [];
  (Array.isArray(options) ? options : []).forEach((o, i) => {
    const groupe = (o && o.groupe) || '';
    const dernier = blocs[blocs.length - 1];
    if (dernier && dernier.groupe === groupe) dernier.items.push({ o, i });
    else blocs.push({ groupe, items: [{ o, i }] });
  });
  return blocs;
}

/** Où poser le menu, d'après le rectangle de son bouton et la taille de
 *  l'écran : sous le bouton ; au-dessus quand la place manque en bas et qu'il
 *  y en a davantage en haut — un choix posé en bas de page ne s'ouvre plus
 *  hors de l'écran. Jamais plus large que l'écran, ni collé à ses bords. */
export function placerMenu(r, vw, vh, largeur) {
  const w = Math.min(Math.max(largeur || 0, r.width || 0), vw - 16);
  const left = Math.max(8, Math.min(r.left, vw - w - 8));
  const bas = vh - r.bottom - 14;
  const haut = r.top - 14;
  const voulu = Math.min(340, Math.round(vh * 0.5));
  const dessous = bas >= Math.min(voulu, 200) || bas >= haut;
  return {
    left, w, dessous,
    top: r.bottom + 6,
    bottom: vh - r.top + 6,
    max: Math.max(120, Math.min(voulu, dessous ? bas : haut)),
  };
}
