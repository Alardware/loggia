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

import { useEffect, useRef } from 'react';

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

/* L'APPUI LONG qui range hors édition (05/11, étape 5 du rapport sur l'usage) : une demi-seconde. Plus court, un doigt qui
 * hésite avant de faire défiler la page saisirait la carte ; en édition, où l'on vient pour ranger, 200 ms suffisent. */
export const APPUI_LONG_MS = 500;

/**
 * Le clic qui suit un glisser, avalé (05/11, étape 5).
 *
 * Hors édition, une tuile qu'on vient de ranger ne doit pas s'ouvrir au lâcher : le navigateur envoie quand même un
 * `click` après le `pointerup`. On l'arrête à la capture, une fois, et l'écoute part d'elle-même peu après — un clic qui
 * ne vient pas ne la laisse pas traîner.
 */
export function avalerProchainClic(doc) {
  const d = doc || (typeof document !== 'undefined' ? document : null);
  if (!d || typeof d.addEventListener !== 'function') return;
  let minuteur = null;
  const stop = (e) => { e.stopPropagation(); e.preventDefault(); fin(); };
  const fin = () => { clearTimeout(minuteur); try { d.removeEventListener('click', stop, true); } catch { /* deja parti */ } };
  d.addEventListener('click', stop, true);
  minuteur = setTimeout(fin, 450);
}

/* ── RANGER HORS ÉDITION, partout (05/11, étape 5 du rapport sur l'usage) ─────
 *
 * « Déplacer les cartes, ça ne fonctionne que sur les cartes pièces à l'Accueil :
 * pourquoi les autres non ? Et sur PC, pourquoi ça ne marche pas du tout ? »
 * (05/11). Un seul outil pour toutes les grilles qu'on range en édition : un
 * appui long — une demi-seconde, au doigt comme à la souris — saisit la carte
 * sous le pointeur ; elle suit le pointeur, la place visée s'allume, le lâcher
 * l'y pose. Un toucher court et un clic gardent leur geste (la fiche, la
 * commande) ; un pointeur qui bouge avant la demi-seconde fait défiler, il ne
 * range pas ; le clic qui suit le lâcher est avalé.
 *
 * La GRILLE porte les gestes (délégués : `{...ranger}` sur son conteneur) ;
 * chaque carte porte sa clé (`data-id`, ou l'attribut choisi). L'appui sur une
 * commande de la carte — une bascule, une barre, un bouton qui n'est ni la
 * carte ni sa surface — ne saisit rien. La prise et la place visée se marquent
 * sur le DOM (`data-range`, index.css) : rien à redessiner pendant le geste,
 * et l'ordre ne s'écrit qu'au lâcher (`onRanger(cle, cible)` : la carte prend
 * la place de la cible). En édition, la vue ne pose pas ces gestes : les
 * siens restent.
 */
const SANS_PRISE = 'button, [role="switch"], [role="slider"], input, select, textarea, a[href]';
const SEUIL_PRISE_PX = 10;

/* La copie qui suit le pointeur — la même que celle de l'Accueil (`poserFantome`) : le défilement du doigt coupé le temps du
 * geste, la page qui suit près des bords. */
function copieFlottante(el, x0, y0) {
  const doc = el.ownerDocument || document;
  const f = el.cloneNode(true);
  const r = el.getBoundingClientRect();
  Object.assign(f.style, { position: 'fixed', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', margin: '0',
    pointerEvents: 'none', zIndex: '9999', opacity: '.96', transform: 'scale(1.02)', transition: 'none', outline: 'none', boxShadow: '0 22px 48px rgba(0,0,0,.55)' });
  doc.body.appendChild(f);
  const rendre = bloquerDefilement(doc);
  const defileur = defileurAuto(el);
  return {
    suivre: (x, y) => { f.style.transform = 'translate(' + (x - x0) + 'px,' + (y - y0) + 'px) scale(1.02)'; defileur.viser(y); },
    lever: () => { defileur.arreter(); rendre(); try { f.remove(); } catch { /* deja partie */ } },
  };
}

/** Les gestes à poser sur une grille rangeable hors édition ; null quand `actif` est faux. */
export function useRangerLibre({ onRanger, attribut = 'data-id', actif = true } = {}) {
  const geste = useRef(null);
  const rappel = useRef(onRanger);
  /* Sans tableau : à chaque rendu, l'ordre écrit au lâcher est celui du moment (le motif de `useEtatServeur`). */
  useEffect(() => { rappel.current = onRanger; });
  if (!actif) return null;
  const sel = '[' + attribut + ']';
  const finir = (ranger) => {
    const g = geste.current;
    geste.current = null;
    if (!g) return;
    clearTimeout(g.minuteur);
    if (!g.copie) return;
    g.copie.lever();
    g.carte.removeAttribute('data-range');
    if (g.cible) g.cible.removeAttribute('data-range');
    avalerProchainClic(g.carte.ownerDocument);
    const cible = g.cible && g.cible.getAttribute(attribut);
    if (ranger && cible && cible !== g.cle && rappel.current) rappel.current(g.cle, cible);
  };
  return {
    'data-rangeable': '',
    onPointerDown: (e) => {
      if (e.button > 0 || geste.current) return;
      const t = e.target;
      const carte = t && t.closest ? t.closest(sel) : null;
      if (!carte || !e.currentTarget.contains(carte)) return;
      const commande = t.closest(SANS_PRISE);
      if (commande && commande !== carte && carte.contains(commande) && !commande.classList.contains('o-surface')) return;
      const grille = e.currentTarget, doigt = e.pointerId, x0 = e.clientX, y0 = e.clientY;
      const g = { cle: carte.getAttribute(attribut), carte, grille, x0, y0, cible: null, copie: null };
      g.minuteur = setTimeout(() => {
        if (geste.current !== g) return;
        try { carte.setPointerCapture(doigt); } catch { /* le pointeur est parti */ }
        try { if (navigator.vibrate) navigator.vibrate(35); } catch { /* pas de vibreur */ }
        try { const s = carte.ownerDocument.getSelection(); if (s) s.removeAllRanges(); } catch { /* rien de choisi */ }
        g.copie = copieFlottante(carte, x0, y0);
        carte.setAttribute('data-range', 'prise');
      }, APPUI_LONG_MS);
      geste.current = g;
    },
    onPointerMove: (e) => {
      const g = geste.current;
      if (!g) return;
      if (!g.copie) {
        if (Math.abs(e.clientX - g.x0) > SEUIL_PRISE_PX || Math.abs(e.clientY - g.y0) > SEUIL_PRISE_PX) { clearTimeout(g.minuteur); geste.current = null; }
        return;
      }
      g.copie.suivre(e.clientX, e.clientY);
      // Les places se lisent à chaque mouvement : la page défile près des bords, et rien ne bouge dans la grille.
      const sous = Array.prototype.find.call(g.grille.querySelectorAll(sel), (el) => {
        const r = el.getBoundingClientRect();
        return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      });
      if (!sous || sous === g.cible) return;
      if (g.cible && g.cible !== g.carte) g.cible.removeAttribute('data-range');
      g.cible = sous;
      if (sous !== g.carte) sous.setAttribute('data-range', 'visee');
    },
    onPointerUp: () => finir(true),
    onPointerCancel: () => finir(false),
    // Un appui long au doigt ouvre parfois le menu du navigateur : pas pendant un rangement.
    onContextMenu: (e) => { if (geste.current) e.preventDefault(); },
  };
}
