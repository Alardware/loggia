/* « Animations réduites » : un réglage de L'APPAREIL (audit des thèmes du
 * 13/11, V4), comme le « Ciel animé » et le « Verre des cartes ».
 *
 * Une tablette murale n'expose pas toujours le réglage du système
 * (`prefers-reduced-motion`). Celui-ci fige ce qui tourne sans fin — les
 * icônes d'un appareil en marche, les flux de l'Énergie, les vagues de
 * l'anneau, les pulsations, la météo animée — et rien d'autre : une feuille
 * s'ouvre et se ferme comme avant, un appui répond comme avant.
 *
 * Comme `verre.js`, ce module ne dépend de rien : le démarrage (theme.js) pose
 * la classe avant le premier rendu.
 */
const CLE_CALME = 'loggia-calme';

const lire = (k) => { try { return localStorage.getItem(k); } catch { return null; } };

/** Le choix de cet appareil : true quand les animations sont réduites. */
export const lireCalme = () => lire(CLE_CALME) === '1';

/** Pose (ou retire) `loggia-calme` sur la racine. */
export function poserCalme(root) {
  try { (root || document.documentElement).classList.toggle('loggia-calme', lireCalme()); } catch { /* pas de document */ }
}

/** Enregistre le choix ; la classe suit sur-le-champ. */
export function ecrireCalme(on) {
  try { if (on) localStorage.setItem(CLE_CALME, '1'); else localStorage.removeItem(CLE_CALME); } catch { /* stockage indisponible */ }
  poserCalme();
}

/** La météo bouge-t-elle sur cet appareil ? Non dès que « Ciel animé » est
 *  coupé ou que les animations sont réduites : le ciel, la mini-scène d'une
 *  carte et les icônes météo se taisent ENSEMBLE (V4). */
export const meteoAnimee = () => lire('loggia-wxfx') !== '0' && !lireCalme();
