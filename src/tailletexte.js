/* La taille du texte (07/11, étape 10 du rapport sur l'usage) : deux crans — normale, grande —, propres à CET écran (une
 * tablette lue de loin, le téléphone d'un parent qui voit moins bien), jamais partagés ni exportés. Un troisième, « Très
 * grande » (130 %), a été retiré le 07/11 : « très grand c'est pas ouf ».
 *
 * Le TEXTE grandit, la disposition ne bouge pas : mêmes cartes par rangée, mêmes icônes. Chaque taille de police passe à la
 * construction par `var(--o-texte, 1)` (scripts/taille_du_texte.mjs) ; on pose ici la variable sur la page. Une variable CSS
 * se comporte pareil dans tous les navigateurs — le zoom du cadre essayé d'abord marchait dans Chrome, pas dans l'app
 * Home Assistant de l'iPhone (moteur de Safari). */
import { useSyncExternalStore } from 'react';

export const CLE_TAILLE_TEXTE = 'loggia-texte';
export const CRANS_TEXTE = { normal: 1, grand: 1.15 };
// Un écran réglé sur l'ancien « Très grande » garde un texte agrandi : il passe à « Grande ».
const ANCIENS_CRANS = { 'tres-grand': 'grand' };
const EVENEMENT = 'loggia:taille-texte';
/* Une carte garde sa hauteur (88 / 184, le gabarit de la maison) : son texte grandit d'au plus 15 % — la « Grande » entière.
 * Au-delà, le pied d'une carte de médias — la réglette du volume — touchait le bord (démo, 07/11 : 16 px de trop à 130 %, 7
 * à 115 %, que sa marge de 16 px absorbe). index.css et la carte de scénario lisent `--o-texte-carte`. */
const PLAFOND_CARTE = 1.15;

/** Le cran de cet écran : 'normal' sans réglage, ou si le réglage ne se lit pas. */
export function lireTailleTexte(stockage = null) {
  try {
    const s = stockage || (typeof localStorage !== 'undefined' ? localStorage : null);
    const lu = s ? s.getItem(CLE_TAILLE_TEXTE) : null;
    const v = lu && Object.prototype.hasOwnProperty.call(ANCIENS_CRANS, lu) ? ANCIENS_CRANS[lu] : lu;
    return v && Object.prototype.hasOwnProperty.call(CRANS_TEXTE, v) ? v : 'normal';
  } catch { return 'normal'; }
}

/** Poser le cran sur la page (`--o-texte`, et `--o-texte-carte` pour les cartes) ; la taille normale retire les variables.
 * Rend le facteur appliqué. */
export function appliquerTailleTexte(cran, win = (typeof window !== 'undefined' ? window : null)) {
  const z = CRANS_TEXTE[cran] || 1;
  const racine = win && win.document && win.document.documentElement;
  if (racine && racine.style) {
    if (z === 1) {
      racine.style.removeProperty('--o-texte');
      racine.style.removeProperty('--o-texte-carte');
    } else {
      racine.style.setProperty('--o-texte', String(z));
      racine.style.setProperty('--o-texte-carte', String(Math.min(z, PLAFOND_CARTE)));
    }
  }
  // Le premier essai zoomait le cadre de `panel.js` ; recharger Loggia seule le lui laisserait.
  try {
    const cadre = win && win.frameElement;
    if (cadre && cadre.style && cadre.style.zoom) Object.assign(cadre.style, { zoom: '', width: '100%', height: '100%' });
  } catch { /* cadre d'une autre origine : rien à défaire */ }
  return z;
}

/** Choisir un cran : gardé sur cet écran, appliqué tout de suite, annoncé aux réglages ouverts. */
export function poserTailleTexte(cran) {
  if (!Object.prototype.hasOwnProperty.call(CRANS_TEXTE, cran)) return;
  try { localStorage.setItem(CLE_TAILLE_TEXTE, cran); } catch { /* stockage refusé : appliqué quand même */ }
  appliquerTailleTexte(cran);
  try { window.dispatchEvent(new CustomEvent(EVENEMENT, { detail: cran })); } catch { /* sans fenêtre */ }
}

const abonner = (f) => {
  try { window.addEventListener(EVENEMENT, f); } catch { return () => {}; }
  return () => { try { window.removeEventListener(EVENEMENT, f); } catch { /* rien */ } };
};
/** Le cran de cet écran et de quoi le changer, pour les réglages. */
export function useTailleTexte() {
  const cran = useSyncExternalStore(abonner, () => lireTailleTexte(), () => 'normal');
  return [cran, poserTailleTexte];
}
