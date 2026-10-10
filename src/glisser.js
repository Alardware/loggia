/* ── Glisser une carte au DOIGT, sans que la page parte avec ────────────────
 *
 * « Il est difficile sur tactile de déplacer les cartes : c'est la barre de
 * défilement qui prend le dessus, plutôt que ce soit la carte en déplacement
 * et la barre qui suive le geste » (07/10).
 *
 * Deux manques, et ils vont ensemble.
 *
 * 1. LE DÉFILEMENT GAGNE. Les cartes en édition portent `touch-action: pan-y`,
 *    qui dit au navigateur : « le défilement vertical est à toi ». C'est voulu
 *    AVANT la saisie — sans lui, un doigt posé sur une carte ne pourrait plus
 *    faire défiler la page, et en mode édition les cartes couvrent l'écran.
 *    Mais le navigateur le garde aussi APRÈS : l'appui long saisissait la
 *    carte, le doigt montait, et la page partait à sa place.
 *
 *    On ne touche donc pas à `touch-action` : on bloque le défilement au
 *    moment où la carte est vraiment prise, par un `touchmove` non passif.
 *    L'appui long exige l'immobilité ; le défilement n'a pas encore démarré, et
 *    `preventDefault` l'en empêche pour de bon. Avant la saisie, rien n'est
 *    posé et la page défile comme toujours.
 *
 * 2. LA PAGE NE SUIT PAS. Une fois la carte attrapée, on ne pouvait pas
 *    atteindre une cellule hors de l'écran. Le doigt près d'un bord fait
 *    maintenant défiler le conteneur, d'autant plus vite qu'il en est proche —
 *    « la barre qui suit le geste ».
 *
 * Le défilement que NOUS faisons (`scrollTop`) n'est pas concerné par le
 * blocage : `preventDefault` n'arrête que le geste du doigt.
 */

/* La bande, en haut et en bas, où le doigt entraîne la page ; et la vitesse au
 * bord même. Plus on s'enfonce dans la bande, plus ça va vite — un seuil sec
 * donnerait une page qui part d'un coup. */
const MARGE = 72;
const VITESSE = 16;

/**
 * Le premier ancêtre qui défile vraiment, ou `null` pour la fenêtre.
 *
 * Un conteneur qui a `overflow: auto` mais pas de débordement ne défile pas :
 * s'arrêter à lui laisserait la carte prisonnière de l'écran.
 */
export function conteneurDefilant(depuis) {
  let el = depuis && depuis.parentElement;
  while (el && el.nodeType === 1) {
    let st = null;
    try { st = (el.ownerDocument.defaultView || window).getComputedStyle(el); } catch { st = null; }
    const flot = st ? (st.overflowY || '') : '';
    if ((flot === 'auto' || flot === 'scroll') && el.scrollHeight > el.clientHeight + 1) return el;
    el = el.parentElement;
  }
  return null;
}

/** Le haut et le bas de ce qu'on voit, pour la fenêtre comme pour un cadre. */
function zoneVisible(boite, vue) {
  if (!boite) return { haut: 0, bas: (vue && vue.innerHeight) || 0 };
  const r = boite.getBoundingClientRect();
  return { haut: r.top, bas: r.bottom };
}

/**
 * De combien faire défiler, pour un doigt à la hauteur `y`.
 *
 * Négatif vers le haut, positif vers le bas, zéro au milieu. Isolé pour qu'un
 * test puisse le lire sans navigateur.
 */
export function pasDefilement(y, haut, bas, marge = MARGE, vitesse = VITESSE) {
  if (!(bas > haut)) return 0;
  /* Une zone plus courte que deux bandes verrait ses deux bords se recouvrir :
   * on les rétrécit, plutôt que de tirer dans les deux sens à la fois. */
  const m = Math.min(marge, (bas - haut) / 2);
  if (m <= 0) return 0;
  if (y < haut + m) return -vitesse * Math.min(1, (haut + m - y) / m);
  if (y > bas - m) return vitesse * Math.min(1, (y - (bas - m)) / m);
  return 0;
}

/**
 * Le défilement qui suit le doigt pendant un glisser.
 *
 * `viser(y)` dit où est le doigt, `arreter()` rend la main. La boucle se
 * relance d'elle-même tant qu'on reste près d'un bord : un doigt immobile au
 * bas de l'écran continue de faire monter la page, comme partout ailleurs.
 */
export function defileurAuto(depuis) {
  const vue = (depuis && depuis.ownerDocument && depuis.ownerDocument.defaultView) || (typeof window !== 'undefined' ? window : null);
  if (!vue || typeof vue.requestAnimationFrame !== 'function') return { viser: () => {}, arreter: () => {} };
  const boite = conteneurDefilant(depuis);
  let y = null;
  let image = 0;
  const pas = () => {
    image = 0;
    if (y == null) return;
    const { haut, bas } = zoneVisible(boite, vue);
    const d = pasDefilement(y, haut, bas);
    if (!d) return;
    if (boite) boite.scrollTop += d;
    else vue.scrollBy(0, d);
    image = vue.requestAnimationFrame(pas);
  };
  return {
    viser: (py) => { y = py; if (!image) image = vue.requestAnimationFrame(pas); },
    arreter: () => { y = null; if (image) vue.cancelAnimationFrame(image); image = 0; },
  };
}

/**
 * Le défilement du doigt, coupé le temps d'un glisser.
 *
 * Rend la fonction qui le rétablit. `passive: false` est indispensable —
 * sans lui le navigateur ignore `preventDefault` et défile quand même.
 */
export function bloquerDefilement(doc) {
  const d = doc || (typeof document !== 'undefined' ? document : null);
  if (!d || typeof d.addEventListener !== 'function') return () => {};
  const stop = (e) => { if (e.cancelable) e.preventDefault(); };
  d.addEventListener('touchmove', stop, { passive: false });
  return () => { try { d.removeEventListener('touchmove', stop, { passive: false }); } catch { /* deja parti */ } };
}
