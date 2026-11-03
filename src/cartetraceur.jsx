/* ── La carte d'un traceur d'objet (lot 13 du rapport Gladys, H2 ; ADR 0318) ──
 *
 * Chargée à la demande (`CarteTraceur`, cartescustom/cartes.jsx) : une maison sans
 * traceur d'objet n'en télécharge rien. Elle s'abonne elle-même au traceur et aux
 * capteurs de son APPAREIL (la batterie, le dernier signal) : le démarrage n'en
 * porte que l'adresse. Le gabarit des cartes IoT, celui de l'eau
 * chaude (`o-gabarit`, ADR 0202) :
 *  - LARGE (184) : la plaque en haut ; au milieu, le nom, la zone (« À la maison »,
 *    « Absent », le nom de la zone) et le dernier signal (« Signal il y a 3 j ») à
 *    gauche, la batterie NOMMÉE à droite ; aucune commande : il n'y a rien à commander ;
 *  - ÉTROITE (1c, au téléphone) : la plaque et la batterie en haut, le nom entier,
 *    la zone, le signal ;
 *  - COMPACTE (88) : la plaque, le nom, la zone, la batterie à droite.
 * La couleur : le vert de la carte d'une personne quand il est à la maison, le
 * liseré qui respire quand il ne répond plus. Toucher la carte ouvre sa popup : la
 * surface, premier enfant, dit ce qu'elle affiche (ADR 0074).
 */
import { Fi, Surface, nomCarte } from './ui.jsx';
import { tr } from './i18n.js';
import { LISERE } from './styles.js';
import { LOGGIA_INDEX, entitesAppareilDe } from './state.js';
import { couleurPile } from './attention.js';
import { RM_CARD, RM_ICO, RM_MILIEU, RM_NAME, RM_SUB, GlypheCarte } from './cartes/briques.jsx';
import { hassQuiConnait } from './cartes/mesure.jsx';
import { ChiffreNomme, ChiffreNommeHaut } from './cartes/robot.jsx';
import { SURF_CARTE, useHass } from './app/noyau.jsx';
import { vueTraceur } from './traceur.js';

/** Le traceur et les capteurs de son appareil, que la carte et la popup suivent. */
export const clesTraceur = (id) => [id, ...entitesAppareilDe(id).filter(e => e.indexOf('sensor.') === 0)];

export default function CarteTraceur({ id, hass, nom = null, chip = false, onOpen = null, Glyphe = GlypheCarte }) {
  const H = hassQuiConnait(useHass(clesTraceur(id)), hass, id);
  const S = (H && H.states) || {};
  const v = vueTraceur({ id, S, index: LOGGIA_INDEX, nom });
  const label = nomCarte(v.nom, v.zone, [v.quand, v.pile != null ? tr('pile {n}', { n: v.pile + ' %' }) : null].filter(Boolean).join(' · ') || null);
  const teintePile = v.pile != null ? couleurPile(v.pile, 'var(--o-text)') : null;
  const plaque = (style, taille) => <span className={chip ? 'o-cvico' : undefined} style={style}><Glyphe id={id} size={taille}><Fi i="marker" size={taille} /></Glyphe></span>;
  const fond = v.mort ? ['var(--o-s1)', 'var(--o-text3)'] : ['var(--o-s1)', 'var(--o-text1)'];
  if (chip) {
    return (
      <div className={'o-piece o-cvdense' + (v.mort ? ' o-panne' : '')} data-traceur=""
        style={{ position: 'relative', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '12px 14px', borderRadius: 'var(--o-radius,18px)', cursor: onOpen ? 'pointer' : 'default', background: SURF_CARTE, border: LISERE, boxShadow: 'var(--o-shadow,0 10px 26px rgba(0,0,0,.3))', transition: 'all .25s' }}>
        {onOpen && <Surface onClick={() => onOpen(id)} label={label} />}
        <div className="o-cvrow" style={{ display: 'flex', alignItems: 'center' }}>
          {plaque({ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: fond[0], color: fond[1] }, 15)}
          <div className="o-cvtxt">
            <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.nom}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: v.encre, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.zone}</div>
          </div>
          {v.pile != null && <span className="o-cvmesure" style={{ fontSize: 13, fontWeight: 800, flexShrink: 0, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', color: teintePile }}>{v.pile + ' %'}</span>}
        </div>
      </div>
    );
  }
  return (
    <div className={'o-rmcard o-gabarit' + (v.mort ? ' o-panne' : '')} data-traceur=""
      style={{ ...RM_CARD, position: 'relative', cursor: onOpen ? 'pointer' : 'default', background: SURF_CARTE, border: LISERE }}>
      {onOpen && <Surface onClick={() => onOpen(id)} label={label} />}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        {plaque(RM_ICO(fond[0], fond[1]), 17)}
        {v.pile != null && <ChiffreNommeHaut v={v.pile} nom={tr('Batterie')} couleur={teintePile} />}
      </div>
      <div style={{ ...RM_MILIEU, marginTop: 'var(--o-milieu-haut, 10px)' }}>
        <div style={{ minWidth: 0 }}>
          <div className="o-gab-nom" style={{ ...RM_NAME, fontSize: 15 }}>{v.nom}</div>
          <div className="o-gab-phrase" style={{ ...RM_SUB, color: v.encre, '--o-n': Math.max(1, v.zone.length) }}>{v.zone}</div>
          {v.quand && <div style={{ ...RM_SUB, color: 'var(--o-text3)' }}>{v.quand}</div>}
        </div>
        {v.pile != null && <ChiffreNomme v={v.pile} nom={tr('Batterie')} couleur={teintePile} />}
      </div>
    </div>
  );
}
