/* ── La carte de la borne de recharge (chantier G3, E3 ; ADR 0302) ──────────
 *
 * Chargée à la demande (`CarteBorne`, cartes/eauborne.jsx) : une maison sans
 * borne n'en télécharge rien. Le gabarit des cartes IoT (`o-gabarit`) :
 *  - LARGE (184) : la plaque en haut ; le nom et la phrase (« En charge »,
 *    « Branchée », « En pause », « Débranchée ») à gauche, la PUISSANCE nommée à
 *    droite pendant la charge. Pas de commande au pied : la pause, la reprise
 *    et le courant se règlent dans la popup, qui demande avant d'agir ;
 *  - ÉTROITE (1c) : la plaque et la puissance en haut, le nom, la phrase ;
 *  - COMPACTE (88) : la plaque, le nom, la phrase, la puissance à droite.
 * Le vert de la charge, le gris au repos, le gris éteint quand elle se tait.
 */
import { Fi, Surface, nomCarte } from './ui.jsx';
import { tr, locale } from './i18n.js';
import { fmtWatts } from './format.js';
import { LISERE } from './styles.js';
import { RM_CARD, RM_ICO, RM_MILIEU, RM_NAME, RM_SUB } from './cartes/briques.jsx';
import { ChiffreNomme, ChiffreNommeHaut } from './cartes/robot.jsx';
import { SURF_CARTE, lavisCarte } from './app/noyau.jsx';
import { vueBorne } from './bornevue.js';

const Sans = ({ children }) => children;
/** « 7,2 » kW, ou des watts sous le kilowatt : le chiffre et son unité, séparés pour la carte. */
const chiffreDe = (w) => (w >= 1000 ? [(Math.round(w / 100) / 10).toLocaleString(locale(), { maximumFractionDigits: 1 }), 'kW'] : [String(Math.round(w)), 'W']);

export default function CarteBorneContenu({ borne, hass, nom = null, chip = false, onOpen = null, Glyphe = Sans }) {
  const S = (hass && hass.states) || {};
  const v = vueBorne({ borne, S, nom });
  if (!v) return null;
  const id = borne.puissance;
  const [fond, encre] = v.plaque;
  const charge = v.etat === 'charge' && v.watts != null;
  const [c, u] = charge ? chiffreDe(v.watts) : [null, null];
  const label = nomCarte(v.nom, v.phrase.texte, charge ? fmtWatts(v.watts) : null);
  const fondCarte = charge ? lavisCarte('var(--o-ok-rgb)', .12, .03) : SURF_CARTE;
  const plaque = (style, taille) => <span className={chip ? 'o-cvico' : undefined} style={style}><Glyphe id={id} size={taille}><Fi i="charging-station" size={taille} /></Glyphe></span>;
  if (chip) {
    return (
      <div className={'o-piece o-cvdense' + (v.mort ? ' o-panne' : '')}
        style={{ position: 'relative', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '12px 14px', borderRadius: 'var(--o-radius,18px)', cursor: onOpen ? 'pointer' : 'default', background: fondCarte, border: LISERE, boxShadow: 'var(--o-shadow,0 10px 26px rgba(0,0,0,.3))', transition: 'all .25s' }}>
        {onOpen && <Surface onClick={onOpen} label={label} />}
        <div className="o-cvrow" style={{ display: 'flex', alignItems: 'center' }}>
          {plaque({ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: fond, color: encre }, 15)}
          <div className="o-cvtxt">
            <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.nom}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: v.phrase.encre, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.phrase.texte}</div>
          </div>
          {charge && <span className="o-cvmesure" style={{ fontSize: 13, fontWeight: 800, flexShrink: 0, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', color: 'var(--o-text)' }}>{fmtWatts(v.watts)}</span>}
        </div>
      </div>
    );
  }
  return (
    <div className={'o-rmcard o-gabarit' + (v.mort ? ' o-panne' : '')} data-borne=""
      style={{ ...RM_CARD, position: 'relative', cursor: onOpen ? 'pointer' : 'default', background: fondCarte, border: LISERE }}>
      {onOpen && <Surface onClick={onOpen} label={label} />}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        {plaque(RM_ICO(fond, encre), 17)}
        {charge && <ChiffreNommeHaut v={c} u={u} nom={tr('Puissance')} />}
      </div>
      <div style={{ ...RM_MILIEU, marginTop: 'var(--o-milieu-haut, 10px)' }}>
        <div style={{ minWidth: 0 }}>
          <div className="o-gab-nom" style={{ ...RM_NAME, fontSize: 15 }}>{v.nom}</div>
          <div className="o-gab-phrase" style={{ ...RM_SUB, color: v.phrase.encre, '--o-n': Math.max(1, v.phrase.texte.length) }}>{v.phrase.texte}</div>
        </div>
        {charge && <ChiffreNomme v={c} u={u} nom={tr('Puissance')} />}
      </div>
    </div>
  );
}
