/* ── La carte de l'eau chaude (chantier G3, E2 ; ADR 0302) ───────────────────
 *
 * Chargée à la demande (`CarteEauChaude`, cartes/eauborne.jsx) : une maison sans
 * chauffe-eau connecté n'en télécharge rien. Le gabarit des cartes IoT — celui
 * du robot, du distributeur et de la vanne (`o-gabarit`, ADR 0202) :
 *  - LARGE (184) : la plaque seule en haut ; la rangée du milieu, le nom et la
 *    phrase à gauche (« Éco · 52° → 55° »), la température de l'eau NOMMÉE à
 *    droite ; pas de commande au pied — la consigne, le mode et l'arrêt sont
 *    dans la popup, où l'on voit ce qu'on change ;
 *  - ÉTROITE (1c, au téléphone) : la plaque et la température en haut, le nom
 *    entier, la phrase ;
 *  - COMPACTE (88) : la plaque, le nom, la phrase, la température à droite.
 * La couleur : l'orange de la chauffe seulement quand un attribut dit qu'il
 * chauffe (`chauffeEauEnChauffe`, G1) ; neutre en marche, gris à l'arrêt, le
 * liseré qui respire quand il ne répond plus. La phrase est celle de la carte
 * générique (`phraseChauffeEau`, G1) : « Pompe à chaleur · 52,5° → 55° ».
 * La carte n'est pas un bouton (ADR 0074) : la surface, premier enfant, dit ce
 * qu'elle affiche, et ouvre la popup.
 */
import { Fi, Surface, nomCarte } from './ui.jsx';
import { tr } from './i18n.js';
import { LISERE } from './styles.js';
import { RM_CARD, RM_ICO, RM_MILIEU, RM_NAME, RM_SUB } from './cartes/briques.jsx';
import { ChiffreNomme, ChiffreNommeHaut } from './cartes/robot.jsx';
import { SURF_CARTE, lavisCarte } from './app/noyau.jsx';
import { vueEauChaude } from './eauchaude.js';

const Sans = ({ children }) => children;

export default function CarteEau({ id, hass, nom = null, chip = false, onOpen = null, Glyphe = Sans }) {
  const S = (hass && hass.states) || {};
  const v = vueEauChaude({ id, S, nom });
  const [fond, encre] = v.plaque;
  const chiffre = v.chiffre;
  const label = nomCarte(v.nom, v.phrase.texte, chiffre != null ? tr('eau {t}°', { t: chiffre }) : null);
  const fondCarte = v.chauffe ? lavisCarte('var(--o-orange-rgb)', .12, .03) : SURF_CARTE;
  const plaque = (style, taille) => <span className={chip ? 'o-cvico' : undefined} style={style}><Glyphe id={id} size={taille}><Fi i="raindrops" size={taille} /></Glyphe></span>;
  if (chip) {
    return (
      <div className={'o-piece o-cvdense' + (v.mort ? ' o-panne' : '')}
        style={{ position: 'relative', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '12px 14px', borderRadius: 'var(--o-radius,18px)', cursor: onOpen ? 'pointer' : 'default', background: fondCarte, border: LISERE, boxShadow: 'var(--o-shadow,0 10px 26px rgba(0,0,0,.3))', transition: 'all .25s' }}>
        {onOpen && <Surface onClick={() => onOpen(id)} label={label} />}
        <div className="o-cvrow" style={{ display: 'flex', alignItems: 'center' }}>
          {plaque({ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: fond, color: encre }, 15)}
          <div className="o-cvtxt">
            <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.nom}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: v.phrase.encre, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.phrase.texte}</div>
          </div>
          {chiffre != null && <span className="o-cvmesure" style={{ fontSize: 13, fontWeight: 800, flexShrink: 0, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', color: 'var(--o-text)' }}>{chiffre + '°'}</span>}
        </div>
      </div>
    );
  }
  return (
    <div className={'o-rmcard o-gabarit' + (v.mort ? ' o-panne' : '')} data-eau-chaude=""
      style={{ ...RM_CARD, position: 'relative', cursor: onOpen ? 'pointer' : 'default', background: fondCarte, border: LISERE }}>
      {onOpen && <Surface onClick={() => onOpen(id)} label={label} />}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        {plaque(RM_ICO(fond, encre), 17)}
        {chiffre != null && <ChiffreNommeHaut v={chiffre} u="°" nom={tr('Eau')} />}
      </div>
      <div style={{ ...RM_MILIEU, marginTop: 'var(--o-milieu-haut, 10px)' }}>
        <div style={{ minWidth: 0 }}>
          <div className="o-gab-nom" style={{ ...RM_NAME, fontSize: 15 }}>{v.nom}</div>
          <div className="o-gab-phrase" style={{ ...RM_SUB, color: v.phrase.encre, '--o-n': Math.max(1, v.phrase.texte.length) }}>{v.phrase.texte}</div>
        </div>
        {chiffre != null && <ChiffreNomme v={chiffre} u="°" nom={tr('Eau')} />}
      </div>
    </div>
  );
}
