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

export const TITRE_PANNEAU = { fontFamily: 'var(--o-serif, Newsreader, serif)', fontStyle: 'italic', fontSize: 20, fontWeight: 500, lineHeight: 1.2, color: 'var(--o-text)', letterSpacing: '-.005em' };
const DESC_PANNEAU = { fontSize: 12.5, color: 'var(--o-text2)', fontWeight: 600, lineHeight: 1.45, marginTop: 3 };
export const CAPITALES = { fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--o-text3)' };
export const MONO = { fontFamily: 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace' };
export const FILET = 'var(--o-bw,1px) solid var(--o-bd3)';

/** Un panneau : titre, description, ce qui se range à droite, puis ses lignes.
 *  `niveau` = 'alerte' l'entoure d'ambre ; `pied` ferme le panneau d'une
 *  dernière ligne (une note, des boutons). */
/* La PORTÉE d'un réglage (03/11) : « Paramètres · réglages suivis sur tous ses
 * écrans » est la règle, et ce qui ne vaut que pour l'écran qu'on tient le dit
 * — gardé dans son navigateur (veille, ciel, verre, marges…). Sans la marque,
 * on ne pouvait pas deviner ce qu'un geste changerait ailleurs. */
export const MarqueIci = () => <Pastille capitales>{tr('Cet écran')}</Pastille>;

export function Panneau({ titre = null, desc = null, droite = null, niveau = null, pied = null, children = null, id = undefined, titreStyle = null, ici = false }) {
  const bord = niveau === 'alerte' ? '1px solid rgba(var(--o-warn-rgb),.55)'
    : niveau === 'danger' ? '1px solid rgba(var(--o-bad-rgb),.55)' : 'var(--o-bw,1px) solid var(--o-bd2)';
  const fond = niveau === 'danger' ? 'linear-gradient(180deg,rgba(var(--o-bad-rgb),.07),rgba(var(--o-bad-rgb),.03))'
    : 'linear-gradient(180deg,var(--o-surfA),var(--o-surfB))';
  return (
    <section id={id} className="o-panneau" style={{ background: fond, border: bord, borderRadius: 'var(--o-radius,18px)', boxShadow: 'var(--o-shadow,0 14px 36px rgba(0,0,0,.34))', overflow: 'hidden', minWidth: 0 }}>
      {(titre || desc || droite || ici) && (
        <div className="o-panneau-tete" style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '18px 22px ' + (children ? '16px' : '18px'), flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 240px', minWidth: 0 }}>
            {/* Un `h2`, plus un `div` (plan M7) : chaque panneau de Paramètres
              * et de Règles portait son titre sans niveau, si bien qu'un
              * lecteur d'écran n'avait aucun plan de la page. `margin: 0` et la
              * graisse du jeton : rien ne bouge à l'œil, comme pour les titres
              * de l'Accueil (ADR 0063). */}
            {titre && <h2 className={titreStyle ? undefined : 'o-panneau-titre'} style={{ margin: 0, ...TITRE_PANNEAU, ...(titreStyle || {}) }}>{titre}</h2>}
            {desc && <div className="o-panneau-desc" style={DESC_PANNEAU}>{desc}</div>}
          </div>
          {(droite || ici) && <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>{ici && <MarqueIci />}{droite}</div>}
        </div>
      )}
      {children}
      {pied && <div className="o-panneau-pied" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '14px 22px', borderTop: FILET }}>{pied}</div>}
    </section>
  );
}

/** Une ligne de panneau : titre et description à gauche, le réglage à droite.
 *  `retrait` : un réglage qui dépend du précédent ; `eteint` : un réglage
 *  sans effet tant que son parent est coupé (il reste lisible, grisé). */
export function Ligne({ titre = null, desc = null, children = null, retrait = false, eteint = false, style = null, ico = null, icoFond = 'var(--o-s1)', icoCouleur = 'var(--o-text2)', descCouleur = null, ici = false }) {
  return (
    <div className="o-optrow" data-retrait={retrait ? '' : undefined} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 22px', paddingLeft: retrait ? 46 : 22, borderTop: FILET, opacity: eteint ? .5 : 1, transition: 'opacity .2s', ...(style || {}) }}>
      {/* L'icône d'une ligne, dans sa puce de 34 (maquette v3, 02/11). */}
      {ico && <span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: 11, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: icoFond }}><Fi i={ico} size={15} color={icoCouleur} /></span>}
      {(titre || desc) && (
        <div className="o-optrow-texte" style={{ flex: 1, minWidth: 0, maxWidth: '62ch' }}>
          {titre && <div className="o-optrow-titre" style={{ fontSize: 13.5, fontWeight: 700 }}>{titre}</div>}
          {desc && <div className="o-optrow-desc" style={{ fontSize: 12, color: descCouleur || 'var(--o-text2)', fontWeight: 600, lineHeight: 1.45, marginTop: 2 }}>{desc}</div>}
        </div>
      )}
      {/* À côté du texte, pas dedans : le titre reste ce qu'il dit. */}
      {ici && <MarqueIci />}
      {children != null && <div className="o-optrow-reglage" style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end', marginLeft: 'auto' }}>{children}</div>}
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
/* Les réglages dépliés d'une règle sur le fond plus sombre de la maquette v3
 * (03/11) : la marge basse négative les mène jusqu'au filet de la ligne suivante. */
export const ZONE_REGLAGES = { margin: '14px -22px -14px', padding: '2px 22px 14px', borderTop: FILET, background: 'var(--o-s3)' };

/** L'heure d'une ligne de journal : seule aujourd'hui, « hier » la veille,
 *  la date avant. */
export function quandCourt(ts) {
  const d = new Date(ts * 1000);
  const h = d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
  const auj = new Date();
  if (d.toDateString() === auj.toDateString()) return h;
  // La veille sur le CALENDRIER : « maintenant moins 24 h » retombait
  // l'avant-veille entre 0 h et 1 h, le lendemain du passage à l'heure d'été.
  const hier = new Date(auj); hier.setDate(hier.getDate() - 1);
  if (d.toDateString() === hier.toDateString()) return tr('hier') + ' ' + h;
  return d.toLocaleDateString(locale(), { day: 'numeric', month: 'short' }) + ' ' + h;
}

/** La premiere lettre en capitale : « ouvrir » devient « Ouvrir ». */
export const majuscule = (t) => { const s = String(t || ''); return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; };

/** Une rangée de cartes de personnes ou d'écrans (maquette v3, 02/11) : deux
 *  colonnes au téléphone, autant qu'il en tient au-delà. Posée À NU, hors de
 *  tout panneau — pas de boîte dans une boîte. */
export const GrilleCartes = ({ children, label = undefined }) => (
  <div role="list" aria-label={label} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(190px,calc(50% - 6px)),1fr))', gap: 12 }}>{children}</div>
);

/** Une carte de la rangée : un avatar (`ava` : initiale sur `avaFond`) ou une
 *  icône (`ico`), le nom, une ligne sous le nom, un point d'activité (`vu`,
 *  vert si `actif`) et une étiquette en haut à droite. `choisi` la remplit
 *  d'accent, texte blanc ; `ajout` la dessine en pointillés. Avec `onClick`,
 *  la carte entière est un bouton ; sans, `children` y pose une action. */
export function CarteGens({ ava = null, avaFond = null, ico = null, nom, sous = null, vu = null, actif = false, etiquette = null, choisi = false, ajout = false, onClick = null, label = undefined, haut = 176, children = null }) {
  const blanc = choisi ? 'rgba(255,255,255,.82)' : 'var(--o-text2)';
  const corps = (
    <>
      {ava != null && <span aria-hidden="true" style={{ width: 52, height: 52, borderRadius: '50%', background: avaFond, color: 'var(--o-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800, flexShrink: 0 }}>{ava}</span>}
      {ico && <span aria-hidden="true" style={{ width: 48, height: 48, borderRadius: 15, background: choisi ? 'rgba(255,255,255,.18)' : 'var(--o-s1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Fi i={ico} size={20} color={choisi ? '#fff' : 'var(--o-text2)'} /></span>}
      {etiquette && <span style={{ position: 'absolute', top: 16, right: 16, padding: '3px 8px', borderRadius: 7, fontSize: 10, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', background: 'rgba(var(--o-accent-rgb),.16)', color: 'var(--o-accent-soft)' }}>{etiquette}</span>}
      <span style={{ display: 'block', marginTop: 'auto', minWidth: 0, width: '100%', lineHeight: 1.3, textAlign: 'left' }}>
        <span style={{ display: 'block', fontSize: 15, fontWeight: 800, overflowWrap: 'anywhere' }}>{nom}</span>
        {sous && <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: blanc, marginTop: 2 }}>{sous}</span>}
        {vu && <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: blanc, marginTop: 8 }}>
          <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: choisi ? '#fff' : actif ? 'var(--o-ok)' : 'var(--o-text3)' }} />{vu}</span>}
        {children}
      </span>
    </>
  );
  const style = {
    position: 'relative', minHeight: haut, boxSizing: 'border-box', padding: 16, borderRadius: 'var(--o-radius,18px)', minWidth: 0,
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12, font: 'inherit',
    background: choisi ? 'var(--o-accent-fond)' : ajout ? 'transparent' : 'linear-gradient(180deg,var(--o-surfA),var(--o-surfB))',
    border: ajout ? '1.5px dashed var(--o-bd1)' : choisi ? 'none' : 'var(--o-bw,1px) solid var(--o-bd2)',
    boxShadow: ajout ? 'none' : 'var(--o-shadow,0 14px 36px rgba(0,0,0,.34))',
    color: choisi ? '#fff' : 'var(--o-text)', cursor: onClick ? 'pointer' : 'default', transition: 'background .25s',
  };
  return (
    <div role="listitem" style={{ display: 'flex', minWidth: 0 }}>
      {onClick
        ? <button type="button" onClick={onClick} aria-label={label} style={{ ...style, flex: 1 }}>{corps}</button>
        : <div style={{ ...style, flex: 1 }}>{corps}</div>}
    </div>
  );
}
