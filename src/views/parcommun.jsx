/* Les briques des pages Paramètres (maquettes du 18/09, ADR 0050).
 *
 * Une page de réglages parle toujours de la même façon : un en-tête (titre en
 * italique, une ligne qui compte, les actions à droite), des panneaux au titre
 * en italique, des lignes séparées par un filet qui court d'un bord à l'autre.
 * Ces pièces vivaient recopiées dans chaque section — cartes, en-têtes, puces
 * aux tailles qui dérivaient. Ici, une seule fois.
 *
 * Les couleurs sont les jetons du thème, jamais une valeur en dur, et un
 * panneau dit son niveau comme le reste de l'écran (ADR 0047) : `alerte`
 * l'entoure d'ambre, sans battre.
 */
import { Fi } from '../ui.jsx';
import { tr, locale } from '../i18n.js';

export const TITRE_PANNEAU = { fontFamily: "'Newsreader',serif", fontStyle: 'italic', fontSize: 20, fontWeight: 500, lineHeight: 1.2, color: 'var(--o-text)', letterSpacing: '-.005em' };
export const DESC_PANNEAU = { fontSize: 12.5, color: 'var(--o-text2)', fontWeight: 600, lineHeight: 1.45, marginTop: 3 };
export const CAPITALES = { fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--o-text3)' };
export const MONO = { fontFamily: 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace' };
export const FILET = 'var(--o-bw,1px) solid var(--o-bd3)';

/** Un panneau : titre, description, ce qui se range à droite, puis ses lignes.
 *  `niveau` = 'alerte' l'entoure d'ambre ; `pied` ferme le panneau d'une
 *  dernière ligne (une note, des boutons). */
export function Panneau({ titre = null, desc = null, droite = null, niveau = null, pied = null, children = null, id = undefined, titreStyle = null }) {
  const bord = niveau === 'alerte' ? '1px solid rgba(var(--o-warn-rgb),.55)'
    : niveau === 'danger' ? '1px solid rgba(var(--o-bad-rgb),.55)' : 'var(--o-bw,1px) solid var(--o-bd2)';
  const fond = niveau === 'danger' ? 'linear-gradient(180deg,rgba(var(--o-bad-rgb),.07),rgba(var(--o-bad-rgb),.03))'
    : 'linear-gradient(180deg,var(--o-surfA),var(--o-surfB))';
  return (
    <section id={id} style={{ background: fond, border: bord, borderRadius: 'var(--o-radius,18px)', boxShadow: 'var(--o-shadow,0 14px 36px rgba(0,0,0,.34))', overflow: 'hidden', minWidth: 0 }}>
      {(titre || desc || droite) && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '18px 22px ' + (children ? '16px' : '18px'), flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 240px', minWidth: 0 }}>
            {titre && <div style={{ ...TITRE_PANNEAU, ...(titreStyle || {}) }}>{titre}</div>}
            {desc && <div style={DESC_PANNEAU}>{desc}</div>}
          </div>
          {droite && <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>{droite}</div>}
        </div>
      )}
      {children}
      {pied && <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '14px 22px', borderTop: FILET }}>{pied}</div>}
    </section>
  );
}

/** Une ligne de panneau : titre et description à gauche, le réglage à droite.
 *  `retrait` : un réglage qui dépend du précédent ; `eteint` : un réglage
 *  sans effet tant que son parent est coupé (il reste lisible, grisé). */
export function Ligne({ titre = null, desc = null, children = null, retrait = false, eteint = false, style = null }) {
  return (
    <div className="o-optrow" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 22px', paddingLeft: retrait ? 46 : 22, borderTop: FILET, opacity: eteint ? .5 : 1, transition: 'opacity .2s', ...(style || {}) }}>
      {(titre || desc) && (
        <div style={{ flex: 1, minWidth: 0, maxWidth: '62ch' }}>
          {titre && <div style={{ fontSize: 13.5, fontWeight: 700 }}>{titre}</div>}
          {desc && <div style={{ fontSize: 12, color: 'var(--o-text2)', fontWeight: 600, lineHeight: 1.45, marginTop: 2 }}>{desc}</div>}
        </div>
      )}
      {children != null && <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end', marginLeft: 'auto' }}>{children}</div>}
    </div>
  );
}

/** Le repère en capitales d'un groupe de lignes (« DERNIERS APPUIS »). */
export const Intertitre = ({ children, style = null }) => (
  <div style={{ ...CAPITALES, padding: '14px 22px 8px', borderTop: FILET, ...(style || {}) }}>{children}</div>
);

const TEINTES = {
  ok: ['var(--o-ok)', 'var(--o-ok-rgb)'],
  alerte: ['var(--o-warn)', 'var(--o-warn-rgb)'],
  danger: ['var(--o-bad)', 'var(--o-bad-rgb)'],
  accent: ['var(--o-accent-soft)', 'var(--o-accent-rgb)'],
};
/** Une pastille d'état : `niveau` ok · alerte · danger · accent · neutre ;
 *  `point` la fait précéder d'un point, `icone` d'un glyphe. */
export function Pastille({ niveau = 'neutre', point = false, icone = null, capitales = false, children }) {
  const t = TEINTES[niveau];
  const col = t ? t[0] : 'var(--o-text2)';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: capitales ? '4px 9px' : '6px 12px', borderRadius: capitales ? 8 : 999, flexShrink: 0, whiteSpace: 'nowrap', fontFamily: 'var(--o-font)', fontStyle: 'normal', lineHeight: 1.3,
      fontSize: capitales ? 10.5 : 12, fontWeight: 800, letterSpacing: capitales ? '.06em' : 0, textTransform: capitales ? 'uppercase' : 'none',
      background: t ? 'rgba(' + t[1] + ',.14)' : 'var(--o-s1)', color: col }}>
      {point && <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: col }} />}
      {icone && <Fi i={icone} size={12} color={col} />}
      {children}
    </span>
  );
}

export const btnPrimaire = { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 12, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 800, fontFamily: 'inherit', background: 'var(--o-accent-fond)', color: '#fff', whiteSpace: 'nowrap' };
export const btnSecondaire = { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: 12, cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text1)', whiteSpace: 'nowrap' };
export const btnDiscret = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', background: 'var(--o-s1)', border: 'none', color: 'var(--o-text1)', whiteSpace: 'nowrap' };
export const btnDanger = { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: 12, cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', background: 'transparent', border: '1px solid rgba(var(--o-bad-rgb),.6)', color: 'var(--o-bad)', whiteSpace: 'nowrap' };

/** La zone depliee d'une regle : sous un filet qui court d'un bord a l'autre
 *  de sa carte (les cartes de regles ont 22 px de marge laterale). */
export const ZONE_REGLAGES = { margin: '16px -22px 0', padding: '2px 22px 0', borderTop: FILET };

/** L'heure d'une ligne de journal : seule aujourd'hui, « hier » la veille,
 *  la date avant. */
export function quandCourt(ts) {
  const d = new Date(ts * 1000);
  const h = d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
  const auj = new Date();
  if (d.toDateString() === auj.toDateString()) return h;
  if (d.toDateString() === new Date(auj.getTime() - 86400000).toDateString()) return tr('hier') + ' ' + h;
  return d.toLocaleDateString(locale(), { day: 'numeric', month: 'short' }) + ' ' + h;
}

/** La premiere lettre en capitale : « ouvrir » devient « Ouvrir ». */
export const majuscule = (t) => { const s = String(t || ''); return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; };
