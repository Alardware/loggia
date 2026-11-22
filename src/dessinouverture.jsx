/* ── Le DESSIN d'une ouverture : la porte, ou les deux vantaux (ADR 0388 ; ses maquettes du 22/11) ─────────────
 *
 * Il aime « l'illustration en arrière-plan qui m'indique visuellement si c'est ouvert ou fermé » (15/09) : ses maquettes la gardent,
 * redessinée — en bas à droite de la tuile (56 × 70) et en grand dans le haut de la popup (104 × 130), sur la même grille de 120 × 150.
 *  - Fermée : le cadre et le vantail au gris du trait (`--o-text3`), le vantail plein du gris des plaques (`--o-s1`).
 *  - Ouverte : l'ambre (`--o-warn`) — le battant de la porte pivote et laisse voir le noir de l'embrasure, un pointillé au sol ; le
 *    vantail de la fenêtre glisse sur l'autre, une flèche dit le sens.
 *  - Muette : le dessin fermé, éteint (0,55).
 * Les couleurs sont des jetons du thème, posés en `style` : un attribut de présentation SVG ne lit pas `var()` partout.
 * Chargé à la demande avec la tuile et la popup (carteouverture.jsx, ficheouverture.jsx) : le démarrage n'en porte rien.
 */
const TRAIT = 'var(--o-text3)';
const VANTAIL = 'var(--o-s1)';
const VIDE = 'var(--o-well2, rgba(0,0,0,.4))';
const AMBRE = 'var(--o-warn)';
const LAVIS = 'rgba(var(--o-warn-rgb),.14)';
const t = (stroke, w, extra) => ({ fill: 'none', stroke, strokeWidth: w, ...extra });

/** `type` : 'porte' ou 'fenetre' ; `etat` : 'ouverte', 'fermee' ou 'muette' ; `hauteur` : en px (la largeur suit, 120 × 150). */
export default function DessinOuverture({ type, etat, hauteur = 70 }) {
  const ouverte = etat === 'ouverte';
  const style = { display: 'block', height: hauteur, width: hauteur * 0.8, opacity: etat === 'muette' ? 0.55 : 1 };
  if (type === 'porte') {
    return (
      <svg aria-hidden="true" data-dessin={'porte-' + etat} viewBox="0 0 120 150" style={style}>
        <rect x="14" y="6" width="92" height="140" rx="4" style={t(TRAIT, 3)} />
        {ouverte ? (<>
          <rect x="22" y="14" width="76" height="132" style={{ fill: VIDE }} />
          <path d="M22 14 L58 24 L58 138 L22 146 Z" style={{ fill: LAVIS, stroke: AMBRE, strokeWidth: 2, strokeLinejoin: 'round' }} />
          <circle cx="51" cy="84" r="3.5" style={{ fill: AMBRE }} />
          <path d="M98 146 L70 146" style={t(AMBRE, 2, { strokeDasharray: '3 4', strokeLinecap: 'round' })} />
        </>) : (<>
          <rect x="22" y="14" width="76" height="132" rx="2" style={{ fill: VANTAIL, stroke: TRAIT, strokeWidth: 2 }} />
          <circle cx="86" cy="82" r="4" style={{ fill: TRAIT }} />
        </>)}
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" data-dessin={'fenetre-' + etat} viewBox="0 0 120 150" style={style}>
      <rect x="6" y="10" width="108" height="134" rx="4" style={t(TRAIT, 3)} />
      {ouverte ? (<>
        <rect x="62" y="16" width="46" height="122" style={{ fill: VIDE }} />
        <rect x="12" y="16" width="50" height="122" rx="2" style={{ fill: LAVIS, stroke: TRAIT, strokeWidth: 2 }} />
        <rect x="30" y="16" width="50" height="122" rx="2" style={{ fill: LAVIS, stroke: AMBRE, strokeWidth: 2 }} />
        <rect x="35" y="70" width="3" height="18" rx="1.5" style={{ fill: AMBRE }} />
        <path d="M88 77 L102 77 M97 72 L102 77 L97 82" style={t(AMBRE, 2, { strokeLinecap: 'round', strokeLinejoin: 'round' })} />
      </>) : (<>
        <rect x="12" y="16" width="50" height="122" rx="2" style={{ fill: VANTAIL, stroke: TRAIT, strokeWidth: 2 }} />
        <rect x="58" y="16" width="50" height="122" rx="2" style={{ fill: VANTAIL, stroke: TRAIT, strokeWidth: 2 }} />
        <path d="M20 30 L34 22 M20 46 L46 30" style={t(TRAIT, 1.5, { strokeLinecap: 'round', opacity: 0.6 })} />
        <rect x="63" y="70" width="3" height="18" rx="1.5" style={{ fill: TRAIT }} />
      </>)}
    </svg>
  );
}
