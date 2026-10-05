/* Les signaux qui tournent sans fin se taisent hors de l'écran (lot 14 de
 * l'audit du 03/10).
 *
 * Le liseré « ne répond plus » (`o-panne`, ADR 0048 : un souffle et une
 * bordure qui tourne) et le point LIVE (`o-livedot`) tournent tant qu'ils
 * existent. Le liseré anime une ombre et une propriété (`--o-tour`) que le
 * compositeur ne sait pas prendre : chaque image recalcule les styles et
 * repeint, même quand la carte est sous le pli. Mesuré dans la démo (1440 ×
 * 900) : la tuile « Jardin » en panne et quatre points LIVE, tous HORS de
 * l'écran au repos, faisaient tourner le fil principal à chaque image.
 *
 * Un SEUL observateur pour toute la page. Il n'a pas à connaître les vingt-cinq
 * gabarits qui posent ces classes : il apprend chaque élément par son
 * `animationstart` (qui remonte jusqu'au document), et lui pose
 * `data-o-hors` quand il quitte l'écran — la feuille de style met alors ses
 * animations en pause (index.css). Le dessin ne change pas : une animation en
 * pause garde son image, et repart d'où elle était au retour.
 *
 * L'écran de veille, lui, recouvre tout sans rien sortir de l'écran : il a sa
 * propre règle (`.loggia-ambient-on`, index.css), pas d'observateur.
 */

/** Les animations sans fin qu'on suspend hors de l'écran. */
export const ANIMATIONS_SUSPENDUES = Object.freeze(['o-souffle', 'o-tour', 'o-livedot', 'o-livehalo']);

/** L'attribut que pose l'observateur sur un élément sorti de l'écran. */
export const ATTRIBUT_HORS = 'data-o-hors';

/* Le halo d'une carte déborde de 7 px, celui d'un point LIVE de 6 : la marge
 * ne suspend qu'une fois TOUT le signal sorti, jamais un bout encore visible. */
const MARGE = '8px';

/**
 * Pose l'écoute sur `doc` (le `document`). Rend la fonction qui la retire.
 * Sans `IntersectionObserver` (un très vieux navigateur), rien ne change :
 * tout tourne, comme avant.
 */
export function ecouterHorsEcran(doc = globalThis.document, Observateur = globalThis.IntersectionObserver) {
  if (!doc || typeof Observateur !== 'function') return () => {};
  const noms = new Set(ANIMATIONS_SUSPENDUES);
  const suivis = new Set();
  const io = new Observateur((entrees) => {
    for (const e of entrees) {
      const el = e.target;
      // Un élément retiré de la page ne revient pas : on cesse de le suivre.
      if (!el.isConnected) { lacher(el); continue; }
      if (e.isIntersecting) el.removeAttribute(ATTRIBUT_HORS);
      else el.setAttribute(ATTRIBUT_HORS, '');
    }
  }, { rootMargin: MARGE });
  const lacher = (el) => { io.unobserve(el); suivis.delete(el); };
  const surDepart = (ev) => {
    if (!noms.has(ev.animationName)) return;
    const el = ev.target;
    if (!el || suivis.has(el)) return;
    // Ménage au passage : React remplace des cartes ; celles qu'il a retirées
    // hors de l'écran ne redonneraient plus jamais de nouvelles.
    for (const v of suivis) if (!v.isConnected) lacher(v);
    suivis.add(el);
    io.observe(el);
  };
  doc.addEventListener('animationstart', surDepart, true);
  return () => {
    doc.removeEventListener('animationstart', surDepart, true);
    io.disconnect();
    for (const el of suivis) el.removeAttribute(ATTRIBUT_HORS);
    suivis.clear();
  };
}
