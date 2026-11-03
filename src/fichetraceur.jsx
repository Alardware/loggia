/* ── La popup d'un traceur d'objet (lot 13 du rapport Gladys, H2 ; ADR 0318) ──
 *
 * Chargée à la demande, feuille comprise (`FicheTraceur`, appareils/fiches.jsx). Une feuille SANS
 * onglets, à la hauteur de son contenu, UNE croix (celle de l'en-tête commun) :
 *  - la tête : où il est, en grand (« À la maison », « Absent », le nom de la zone),
 *    et son dernier signal ;
 *  - les faits : le dernier signal (« Il y a 3 j », l'heure exacte en dessous), la
 *    batterie, l'état que l'intégration donne au traceur, tel qu'elle l'écrit ;
 *  - en pied, « L'appareil » : la fiche universelle, par-dessus.
 * Rien ne se commande : un traceur se lit. Il ne compte pas dans la présence de la
 * maison, et la feuille ne le propose nulle part comme une personne.
 */
import { useState, Suspense } from 'react';
import { tr, locale } from './i18n.js';
import { Fi, BottomSheet } from './ui.jsx';
import { LOGGIA_INDEX } from './state.js';
import { relTime } from './format.js';
import { couleurPile } from './attention.js';
import { EnteteFiche, PETITES_CAPITALES, filet } from './fichecommune.jsx';
import { PANNEAU, RANGEE_SERREE, EN_BOUTON, TITRE, SOUS } from './fichekit.js';
import { vueTraceur } from './traceur.js';
import { useHass } from './app/noyau.jsx';
import { hassQuiConnait } from './cartes/mesure.jsx';
import { GlypheCarte } from './cartes/briques.jsx';
import { FicheAppareil, BoutonEpingle } from './appareils/fiches.jsx';
import { clesTraceur } from './cartetraceur.jsx';
import { lazyRecharge } from './recharge.js';
import { coordDe } from './cartegeo.js';

// « Voir sur la carte » (lot 16 Gladys, ADR 0321) : la carte de HA, centrée sur lui, chargée à la demande, Leaflet compris.
const FeuilleCarte = lazyRecharge(() => import('./feuillecarte.jsx'));

const VALEUR = { fontSize: 13, fontWeight: 800, color: 'var(--o-text1)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };
const pieceDe = (id) => (LOGGIA_INDEX && typeof LOGGIA_INDEX.areaNameOf === 'function' ? LOGGIA_INDEX.areaNameOf(id) : null);

/** La feuille : le `hass` vivant du traceur et des capteurs de son appareil, l'épingle, et la fiche universelle par-dessus. */
export default function FeuilleTraceur({ id, hass, onClose }) {
  const H = hassQuiConnait(useHass(clesTraceur(id)), hass, id);
  const [fiche, setFiche] = useState(null);
  const [carte, setCarte] = useState(false);
  return (
    <BottomSheet onClose={onClose}>
      {() => (<>
        <FicheTraceurContent id={id} hass={H} onFiche={setFiche} onCarte={() => setCarte(true)} epingle={<BoutonEpingle id={id} />} Glyphe={GlypheCarte} />
        {fiche && <FicheAppareil id={fiche} hass={H} onClose={() => setFiche(null)} />}
        {carte && <Suspense fallback={null}><FeuilleCarte focus={id} onClose={() => setCarte(false)} /></Suspense>}
      </>)}
    </BottomSheet>
  );
}

export function FicheTraceurContent({ id, hass, onFiche = null, onCarte = null, epingle = null, Glyphe = null }) {
  const S = (hass && hass.states) || {};
  const v = vueTraceur({ id, S, index: LOGGIA_INDEX });
  const piece = pieceDe(id);
  const genre = tr('traceur d’objet');
  const exact = v.signal != null ? new Date(v.signal).toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : null;
  return (
    <div>
      <EnteteFiche nom={v.nom} epingle={epingle}
        plaque={{ fond: 'var(--o-s1)', encre: v.mort ? 'var(--o-text3)' : 'var(--o-text1)', icone: 'marker', glyphe: Glyphe ? <Glyphe id={id} size={18}><Fi i="marker" size={18} /></Glyphe> : null }}
        sousNom={piece ? piece + ' · ' + genre : genre.charAt(0).toUpperCase() + genre.slice(1)} />
      <div data-tete="" style={{ ...PANNEAU, marginTop: 18, padding: 18 }}>
        <div style={{ ...PETITES_CAPITALES }}>{tr('Où')}</div>
        <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.15, marginTop: 4, color: v.mort ? 'var(--o-text3)' : v.lieu === 'maison' ? 'var(--o-ok)' : 'var(--o-text)', overflowWrap: 'anywhere' }}>{v.zone}</div>
        {v.quand && <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--o-text2)', marginTop: 6 }}>{v.quand}</div>}
      </div>
      <div style={{ ...PANNEAU, marginTop: 12, overflow: 'hidden' }}>
        <div style={RANGEE_SERREE}>
          <span style={{ flex: 1, minWidth: 0 }}><span style={TITRE}>{tr('Dernier signal')}</span>{exact && <span style={SOUS}>{exact}</span>}</span>
          <span style={VALEUR}>{v.signal == null ? '—' : relTime(new Date(v.signal).toISOString())}</span>
        </div>
        {v.pile != null && (
          <div style={{ ...RANGEE_SERREE, borderTop: filet(1) }}>
            <span style={{ ...TITRE, flex: 1, minWidth: 0 }}>{tr('Batterie')}</span>
            <span style={{ ...VALEUR, color: couleurPile(v.pile, 'var(--o-text1)') }}>{v.pile + ' %'}</span>
          </div>
        )}
        {v.etat && (
          <div style={{ ...RANGEE_SERREE, borderTop: filet(1) }}>
            <span style={{ ...TITRE, flex: 1, minWidth: 0 }}>{tr('État du traceur')}</span>
            <span style={{ ...VALEUR, whiteSpace: 'normal', textAlign: 'right', overflowWrap: 'anywhere' }}>{v.etat}</span>
          </div>
        )}
        {/* Sur la carte, seulement s'il dit où il est : un traceur sans coordonnées n'y serait pas posé. */}
        {onCarte && coordDe(S[id]) && (
          <button type="button" onClick={onCarte} style={{ ...RANGEE_SERREE, ...EN_BOUTON, borderTop: filet(1) }}>
            <span style={{ ...TITRE, flex: 1, minWidth: 0 }}>{tr('Voir sur la carte')}</span>
            <Fi i="angle-small-right" size={16} color="var(--o-text3)" />
          </button>
        )}
        {onFiche && (
          <button type="button" onClick={() => onFiche(id)} style={{ ...RANGEE_SERREE, ...EN_BOUTON, borderTop: filet(1) }}>
            <span style={{ flex: 1, minWidth: 0 }}><span style={TITRE}>{tr('L’appareil')}</span><span style={SOUS}>{tr('L’épingle, les commandes et toutes ses entités')}</span></span>
            <Fi i="angle-small-right" size={16} color="var(--o-text3)" />
          </button>
        )}
      </div>
    </div>
  );
}
