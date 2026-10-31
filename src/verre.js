/* « Verre des cartes » : Plein ou Léger (Paramètres > Effets, ADR 0284).
 *
 * Ce n'est pas une seconde matière — la décision du 29/08 tient : un seul
 * verre, le translucide de l'Accueil, partout. Seul le COÛT change. En Plein,
 * chaque carte recalcule un flou d'arrière-plan à chaque défilement ; en
 * Léger, plus aucune carte n'en porte, et la photo de fond est floutée une
 * fois pour toutes (index.css, `html.loggia-verre-leger`).
 *
 * Un réglage de L'APPAREIL, comme le « Ciel animé » (wxpresets.js) : c'est la
 * tablette murale qui rame, pas le PC. « Auto » suit la fluidité que le ciel
 * de l'Accueil mesure (`loggia-ciel-actuel`, posé par ciel.js) : plein donne
 * Plein, léger ou fixe donnent Léger. Sans mesure EN COURS — effets coupés,
 * qualité du ciel forcée, rien de mesuré —, Auto reste à Plein, comme avant.
 *
 * Ce module ne dépend de rien : le démarrage (theme.js) pose la classe avant
 * le premier rendu, et il ne doit pas tirer le ciel ni sa table avec lui. Il
 * ne garde que la LECTURE : l'écriture vit dans Paramètres (`ecrireVerre`,
 * views/parametres.jsx), chargé à la demande. */
export const CLE_VERRE = 'loggia-verre';
const lire = (k) => { try { return localStorage.getItem(k); } catch { return null; } };

/** Le choix de cet appareil : 'auto', 'plein' ou 'leger'. */
export const lireVerre = () => { const q = lire(CLE_VERRE); return q === 'plein' || q === 'leger' ? q : 'auto'; };

/** Ce que la mesure du ciel dit ici : 'plein', 'leger', ou null sans mesure en cours. */
export function verreMesure() {
  if (lire('loggia-wxfx') === '0' || lire('loggia-ciel-qualite')) return null;
  const n = lire('loggia-ciel-actuel');
  return n === 'plein' ? n : n === 'leger' || n === 'fixe' ? 'leger' : null;
}

/** Le rendu retenu sur cet appareil : true pour Léger. */
export const verreLeger = () => { const q = lireVerre(); return q === 'auto' ? verreMesure() === 'leger' : q === 'leger'; };

/** Pose (ou retire) `loggia-verre-leger` sur la racine. */
export function poserVerre(root) {
  try { (root || document.documentElement).classList.toggle('loggia-verre-leger', verreLeger()); } catch { /* pas de document */ }
}
