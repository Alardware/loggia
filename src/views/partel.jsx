/* Les briques des Paramètres au téléphone (maquette v4, 02/11).
 *
 * Au téléphone, la maquette ne reprend pas les panneaux de l'ordinateur : des
 * cartes à titre simple (13 px), des lignes séparées d'un filet, et des choix
 * posés SOUS leur titre, en boutons qui passent à la ligne — rien ne déborde
 * de l'écran. Les mesures sont celles de la maquette ; les couleurs, les
 * jetons du thème.
 */
import { Fi } from '../ui.jsx';
import { MarqueIci } from './parcommun.jsx';

const TITRE = { fontSize: 13, fontWeight: 800 };
const DESC = { fontSize: 11.5, fontWeight: 600, color: 'var(--o-text2)', marginTop: 2, lineHeight: 1.4 };

/** Une carte : titre, description, une puce d'icône à gauche si `chip`.
 *  `style` : 'tirets' (réglage de secours) ou 'danger'. */
export function CarteTel({ titre = null, desc = null, chip = null, chipFond = 'var(--o-s1)', chipCouleur = 'var(--o-text2)', style = null, gap = 12, children = null, ici = false }) {
  const fond = style === 'tirets' ? 'var(--o-s2)' : style === 'danger' ? 'rgba(var(--o-bad-rgb),.07)' : 'linear-gradient(180deg,var(--o-surfA),var(--o-surfB))';
  const bord = style === 'tirets' ? '1px dashed var(--o-bd1)' : style === 'danger' ? '1px solid rgba(var(--o-bad-rgb),.35)' : 'var(--o-bw,1px) solid var(--o-bd2)';
  return (
    <section style={{ padding: 18, borderRadius: 20, background: fond, border: bord, boxShadow: style ? 'none' : 'var(--o-shadow,0 14px 36px rgba(0,0,0,.34))', display: 'flex', flexDirection: 'column', gap, minWidth: 0 }}>
      {(titre || desc) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {chip && <span aria-hidden="true" style={{ width: 40, height: 40, flex: 'none', borderRadius: 12, background: chipFond, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Fi i={chip} size={17} color={chipCouleur} /></span>}
          <div style={{ flex: 1, minWidth: 0, lineHeight: 1.35 }}>
            {titre && <h2 style={{ margin: 0, ...TITRE }}>{titre}</h2>}
            {desc && <div style={DESC}>{desc}</div>}
          </div>
          {ici && <MarqueIci />}
        </div>
      )}
      {children}
    </section>
  );
}

/** Des lignes à la suite, chacune sous un filet. */
export const LignesTel = ({ children }) => <div style={{ display: 'flex', flexDirection: 'column' }}>{children}</div>;

/** Une ligne : icône ou avatar, titre, description, et ses réglages à droite
 *  (ils passent dessous quand la place manque). Avec `onClick`, la ligne
 *  entière est un bouton, et un chevron le dit. */
export function LigneTel({ titre = null, desc = null, ico = null, icoCouleur = 'var(--o-text2)', ava = null, avaFond = null, mono = false, eteint = false, retrait = false, onClick = null, label = undefined, children = null, ici = false }) {
  const corps = (
    <>
      {ico && <span aria-hidden="true" style={{ display: 'inline-flex' }}><Fi i={ico} size={15} color={icoCouleur} /></span>}
      {ava != null && <span aria-hidden="true" style={{ width: 36, height: 36, flex: 'none', borderRadius: '50%', background: avaFond, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: '#fff' }}>{ava}</span>}
      {(titre || desc) && (
        <span style={{ flex: '1 1 180px', minWidth: 0, lineHeight: 1.3, textAlign: 'left' }}>
          {titre && <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12.5, fontWeight: 800 }}>{titre}{ici && <MarqueIci />}</span>}
          {desc && <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--o-text2)', marginTop: 1, fontFamily: mono ? 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace' : 'inherit' }}>{desc}</span>}
        </span>
      )}
      {children != null && <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', marginLeft: 'auto', maxWidth: '100%' }}>{children}</span>}
      {onClick && <span aria-hidden="true" style={{ display: 'inline-flex' }}><Fi i="angle-small-right" size={14} color="var(--o-text3)" /></span>}
    </>
  );
  const style = { display: 'flex', alignItems: 'center', gap: '10px 12px', flexWrap: onClick ? 'nowrap' : 'wrap', padding: '10px 0 10px ' + (retrait ? 26 : 0) + 'px', borderTop: '1px solid var(--o-bd3)', opacity: eteint ? .5 : 1, transition: 'opacity .2s', width: '100%', minWidth: 0 };
  // `o-ligne-tel` : la rangée que la recherche des réglages allume (reglagesindex.js).
  return onClick
    ? <button type="button" className="o-ligne-tel" onClick={onClick} aria-label={label} style={{ ...style, background: 'none', border: 'none', borderTop: style.borderTop, color: 'inherit', font: 'inherit', cursor: 'pointer' }}>{corps}</button>
    : <div className="o-ligne-tel" style={style}>{corps}</div>;
}

/** Un choix : son titre, sa phrase, puis ses options en boutons, à la ligne
 *  quand il le faut. Choisi = bleu plein, texte blanc. `lecture` : la valeur
 *  se montre sans se changer (le type d'écran, que Loggia détecte) ; `eteint`
 *  grise sans verrouiller : on peut préparer un réglage avant de l'allumer. */
export function ChoixTel({ titre, desc = null, opts, value, onPick = () => {}, off = false, eteint = false, lecture = false, label = undefined }) {
  return (
    <div className="o-choix-tel">
      <div style={TITRE}>{titre}</div>
      {desc && <div style={DESC}>{desc}</div>}
      <div role="group" aria-label={label || titre} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10, opacity: off || eteint ? .45 : 1, transition: 'opacity .2s' }}>
        {opts.map(([v, l]) => {
          const on = String(value) === String(v);
          const st = { padding: '8px 13px', borderRadius: 10, border: 'none', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, transition: 'background .2s', background: on ? 'var(--o-accent-fond)' : 'var(--o-s1)', color: on ? '#fff' : 'var(--o-text1)' };
          return lecture
            ? <span key={String(v)} aria-current={on ? 'true' : undefined} style={st}>{l}</span>
            : <button key={String(v)} type="button" aria-pressed={on} disabled={off} onClick={() => onPick(v)} style={{ ...st, cursor: off ? 'not-allowed' : 'pointer' }}>{l}</button>;
        })}
      </div>
    </div>
  );
}

/** L'interrupteur du téléphone, 34 × 20 comme la maquette. */
export const BasculeTel = ({ on, cb, nom, off = false }) => (
  <button type="button" role="switch" aria-checked={!!on} aria-label={nom} disabled={off} onClick={cb}
    style={{ flex: 'none', width: 34, height: 20, borderRadius: 999, border: 'none', padding: 2, display: 'flex', cursor: off ? 'not-allowed' : 'pointer', transition: 'background .2s', background: on ? 'var(--o-accent-fond)' : 'var(--o-piste, var(--o-bd1))' }}>
    <span style={{ width: 16, height: 16, borderRadius: '50%', background: '#fff', transform: on ? 'translateX(14px)' : 'translateX(0px)', transition: 'transform .2s cubic-bezier(.3,.7,.3,1)', boxShadow: '0 1px 3px rgba(0,0,0,.3)' }} />
  </button>
);

/** Le bouton d'une ligne (« Changer le code », « Oublier »…). */
export const btnTel = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: 'var(--o-s1)', color: 'var(--o-text)', fontSize: 11.5, fontWeight: 800, whiteSpace: 'nowrap' };
/** Un lien d'une ligne : « Ouvrir › », en accent. */
export const lienTel = { display: 'inline-flex', alignItems: 'center', gap: 3, padding: '4px 0', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 800, color: 'var(--o-accent-soft)', whiteSpace: 'nowrap', textDecoration: 'none' };
/** Une pastille de ligne en capitales (« EN LIGNE »). */
export const pasTel = (niveau) => ({ padding: '3px 9px', borderRadius: 8, fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', whiteSpace: 'nowrap', background: niveau ? 'rgba(var(--o-' + niveau + '-rgb),.16)' : 'var(--o-s1)', color: niveau ? 'var(--o-' + niveau + ')' : 'var(--o-text2)' });
