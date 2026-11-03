/* ── La fraîcheur des mesures, jugée au SERVEUR (ADR 0311) ──────────────────
 *
 * L'écran ne reçoit pas `last_reported` (ADR 0303) : il ne juge pas. Le serveur, lui, le lit, et l'état des veilles
 * (`loggia/veilles/etat`) porte `figees` : {entité: instant du dernier relevé de son appareil, en secondes}. La racine le relit
 * avec le seuil des piles (`useSeuilPile`, toutes les 30 s) ; la carte d'une mesure et celle d'une plante écrivent alors
 * « Dernier relevé il y a 7 h » à la place de leur phrase. Une réponse illisible ou absente ne défait pas le dernier verdict.
 * Sans React : testable à sec (tests/fraicheur_serveur.test.mjs).
 */
import { tr } from './i18n.js';

let FIGEES = {};
let SIGNE = '';
const ECOUTES = new Set();

/** Retient le verdict du serveur ; prévient les cartes qui écoutent s'il a changé. */
export function retenirFigees(veilles) {
  const brut = veilles && typeof veilles.figees === 'object' && veilles.figees ? veilles.figees : null;
  if (!brut) return;
  const neuf = {};
  Object.keys(brut).forEach(id => { const t = Number(brut[id]); if (t > 0 && Number.isFinite(t)) neuf[id] = t * 1000; });
  const signe = JSON.stringify(neuf);
  if (signe === SIGNE) return;
  FIGEES = neuf;
  SIGNE = signe;
  ECOUTES.forEach(f => f());
}

/** L'instant du dernier relevé d'une mesure figée, en ms ; null si le serveur ne la dit pas figée. */
export const figeeDe = (id) => (id && FIGEES[id]) || null;

/** S'abonner aux changements du verdict (`useSyncExternalStore`). */
export function ecouterFigees(f) {
  ECOUTES.add(f);
  return () => ECOUTES.delete(f);
}

/** « Dernier relevé il y a 7 h », « … il y a 3 j » au-delà de 48 h. */
export function texteFigee(t, maintenant = Date.now()) {
  const h = Math.max(0, Math.floor((maintenant - t) / 3600000));
  return h < 48 ? tr('Dernier relevé il y a {n} h', { n: h }) : tr('Dernier relevé il y a {n} j', { n: Math.floor(h / 24) });
}
