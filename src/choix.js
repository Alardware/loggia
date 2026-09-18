/* La logique des listes de Loggia (`ListeChoix` et `ChampSuggere`, ui.jsx),
 * à part pour se tester sans navigateur : filtrer, grouper, placer.
 *
 * Retour du 18/09 (« pourquoi sont-ils blancs comme ça », captures des
 * Alertes) : le menu d'un <select> natif, comme celui d'une <datalist>, est
 * dessiné par le système — blanc sous Windows, quel que soit le thème.
 * Loggia dessine donc les siens, partout, et tous à la même taille.
 */

/** Au-delà de douze options, un champ filtre la liste. */
export const SEUIL_RECHERCHE = 12;

/** La taille de TOUTES les listes (retour du 18/09 : « même largeur et même
 *  hauteur ») : un menu de deux choix s'ouvre comme un menu de cent — la
 *  liste courte laisse du vide, la longue défile. */
export const LARGEUR_MENU = 320;
export const HAUTEUR_MENU = 320;

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

/** Où poser la liste, d'après le rectangle de son ancre et la taille de
 *  l'écran : sous l'ancre ; au-dessus quand la place manque en bas et qu'il y
 *  en a davantage en haut — un choix posé en bas de page ne s'ouvre plus hors
 *  de l'écran. Toujours la même taille, plus petite seulement si l'écran ne
 *  la tient pas ; jamais collée à ses bords. */
export function placerMenu(r, vw, vh) {
  const w = Math.min(LARGEUR_MENU, vw - 16);
  const left = Math.max(8, Math.min(r.left, vw - w - 8));
  const bas = vh - r.bottom - 14;
  const haut = r.top - 14;
  const dessous = bas >= HAUTEUR_MENU || bas >= haut;
  return {
    left, w, dessous,
    h: Math.max(120, Math.min(HAUTEUR_MENU, dessous ? bas : haut)),
    top: r.bottom + 6,
    bottom: vh - r.top + 6,
  };
}
