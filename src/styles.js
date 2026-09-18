/* Les styles que plusieurs modules partageaient en copie (v3.49.0).
 *
 * Une carte du rail, les petites capitales d'un repère, la puce d'un filtre :
 * trois formes qui étaient recopiées d'un fichier à l'autre, et qui dérivaient
 * (9,5 contre 10,5 px, `minWidth` ou pas). Ici, une seule fois — les jetons du
 * thème, jamais une couleur en dur. */

/** Une carte du rail de l'Accueil (météo, CO₂, en ce moment…). */
export const CARTE_RAIL = { background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd2)', borderRadius: 'var(--o-radius,18px)', boxShadow: 'var(--o-shadow)', color: 'var(--o-text)', minWidth: 0 };

/** Le repère en petites capitales au-dessus d'une valeur. */
export const petitesCapitales = (taille = 10.5) => ({ fontSize: taille, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--o-text3)' });

/** La puce d'un filtre : pleine quand elle est choisie. */
export const puce = (on) => ({ padding: '6px 12px', borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 700, border: 'none', background: on ? 'var(--o-accent-fond)' : 'var(--o-s1)', color: on ? '#fff' : 'var(--o-text2)' });
