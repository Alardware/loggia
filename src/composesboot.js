/* ── La voiture, la litière, la fontaine : ce que le DÉMARRAGE en garde (chantier du 20/11, A11 et A12 ; ADR 0386) ──
 *
 * La découverte (`composes.js`) pèse plus de 7 Ko : elle se charge à la demande, et seulement dans une maison qui a de quoi la
 * nourrir — une distance (une voiture) ou une plateforme d'animaux dans l'index. Ailleurs, rien ne se télécharge. Tant qu'elle
 * n'est pas arrivée, il n'y a ni voiture ni litière : l'écran les montre au relevé suivant, et les portes de la maison se
 * comptent comme avant. Pur : ni React ni Home Assistant.
 */

/** Les plateformes des litières et des fontaines (lues dans le code des intégrations) : la découverte les reprend. */
export const PLATEFORMES_ANIMAUX = ['litterrobot', 'petkit', 'petlibro'];
/** Le préfixe des clés de carte d'un appareil composé : `obj:app:<appareil>`. */
export const CLE_COMPOSE = 'obj:app:';

let M = null, enRoute = null, VU = { index: null, oui: false };
const ABONNES = new Set();
/** Le module de la découverte, ou null tant qu'il n'est pas là. Son chargement part au premier appel, s'il y a de quoi. */
export function composes(index) {
  if (M) return M;
  if (VU.index !== index) {
    let oui = false;
    const t = index && index.entityMeta;
    if (t && typeof t.forEach === 'function') t.forEach(m => { if (m && (m.deviceClass === 'distance' || PLATEFORMES_ANIMAUX.indexOf(m.platform) >= 0)) oui = true; });
    VU = { index, oui };
  }
  // `m` vide : un import retenu par `vite:preloadError` (recharge.js) — la page repart.
  if (VU.oui && !enRoute) enRoute = import('./composes.js').then(m => { if (m) { M = m; ABONNES.forEach(f => f()); ABONNES.clear(); } }, () => { enRoute = null; });
  return null;
}
/** Prévient `f` à l'arrivée de la découverte — une vue mémorisée se refait alors, sans attendre que la maison change. Rend de
 *  quoi se désabonner. Déjà là : rien à attendre. */
export function quandComposes(f) {
  if (!M) ABONNES.add(f);
  return () => { ABONNES.delete(f); };
}

/** Les entités que l'écran suit pour la carte d'une clé `obj:app:<appareil>` (App.jsx) — aucune tant que la découverte manque. */
export function clesDuCompose(cle, index, S) {
  const K = composes(index);
  const c = K ? K.composesDe(index, S).find(x => CLE_COMPOSE + x.appareil === cle) : null;
  return c ? K.entitesCompose(c) : [];
}
