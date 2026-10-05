/* Les styles que plusieurs modules partageaient en copie (v3.49.0).
 *
 * Une carte du rail, les petites capitales d'un repère, la puce d'un filtre :
 * trois formes qui étaient recopiées d'un fichier à l'autre, et qui dérivaient
 * (9,5 contre 10,5 px, `minWidth` ou pas). Ici, une seule fois — les jetons du
 * thème, jamais une couleur en dur. */

/** Une carte du rail de l'Accueil (météo, CO₂, en ce moment…). */
export const CARTE_RAIL = { background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd2)', borderRadius: 'var(--o-radius,18px)', boxShadow: 'var(--o-shadow)', color: 'var(--o-text)', minWidth: 0 };

/* Le liseré d'une carte ou d'un panneau (04/10). Un seul trait pour toutes :
 * « Liserés » (Apparence) pose `--o-bw` à 0 quand il est coupé, un thème qui
 * n'en dessine pas (Neumorphix, iOS, Material) le pose à 0 lui-même. Les
 * cartes de la maison l'ignoraient (`border: 'none'` en dur) : le réglage ne
 * bordait que le rail et les panneaux de Paramètres. `* { box-sizing:
 * border-box }` (index.css) : le trait se prend DANS la carte, 88 et 184
 * restent exacts. Même valeur que la bordure de CARTE_RAIL. */
export const LISERE = 'var(--o-bw,1px) solid var(--o-bd2)';

/** Le repère en petites capitales au-dessus d'une valeur. */
export const petitesCapitales = (taille = 10.5) => ({ fontSize: taille, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--o-text3)' });

/* Le gabarit d'une carte de la maison — l'icône en haut à gauche, le titre
 * SOUS l'icône, le contenu ensuite ; hauteur standard, le liseré du réglage
 * « Liserés » (04/10 : il était `border: 'none'`, sourd à l'interrupteur).
 *
 * `App.jsx` et la vue Système en tenaient chacun une copie (`RM_CARD` et
 * `SYS_CARTE`), et un test les comparait morceau par morceau pour qu'elles ne
 * dérivent pas. C'est le même dessin : il vit ici (plan M1, première étape).
 * Les deux différences restent chez l'appelant, à découvert — la vue Système
 * borne sa boîte, l'Accueil anime la sienne. */
export const CARTE_MAISON = { display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 172, padding: 16, borderRadius: 'var(--o-radius,18px)', background: 'linear-gradient(180deg,var(--o-surfA),var(--o-surfB))', border: LISERE, boxShadow: 'var(--o-shadow,0 6px 16px rgba(0,0,0,.26))' };

/** La boîte d'icône d'une carte de la maison : la géométrie seule, l'appelant
 * pose le fond et la couleur (l'un donne un dégradé, l'autre un `rgba`). */
export const ICONE_CARTE = { width: 38, height: 38, borderRadius: 14, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' };

/** Le nom d'une carte de la maison, et sa ligne de détail. */
export const NOM_CARTE = { fontSize: 14, fontWeight: 700, color: 'var(--o-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
export const SOUS_CARTE = { fontSize: 12, fontWeight: 600, color: 'var(--o-text3)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };

/** La puce d'un filtre : pleine quand elle est choisie. */
export const puce = (on) => ({ padding: '6px 12px', borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 700, border: 'none', background: on ? 'var(--o-accent-fond)' : 'var(--o-s1)', color: on ? '#fff' : 'var(--o-text2)' });
/* La même, un cran plus haute, au gris non choisi plus clair : les
 * réglages des Volets et des Interrupteurs la tenaient en trois copies
 * (lot 15 de l’audit du 03/10). L'écart reste à découvert ; le choix — bleu
 * plein, texte blanc — ne se recopie plus. */
export const puceHaute = (on) => ({ ...puce(on), padding: '7px 12px', ...(on ? null : { color: 'var(--o-text1)' }) });
