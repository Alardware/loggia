/* ── La popup de la borne de recharge (chantier G3, E3 ; ADR 0302) ──────────
 *
 * Chargée à la demande (`FicheBorne`, cartes/eauborne.jsx). Une feuille SANS
 * onglets, à la hauteur de son contenu, UNE croix (l'en-tête commun) :
 *  - la tête : l'état en grand, la puissance, « Branchée depuis 18:05 » ;
 *  - « Charge en cours » : les kWh depuis le branchement — l'index d'énergie
 *    de la borne, moins ce qu'il valait au branchement (son historique) ;
 *  - « Courant maximum » : − et +, au pas de l'appareil, DANS ses bornes
 *    (`number.set_value`) ;
 *  - « Mettre en pause » / « Reprendre » : SEULEMENT si la borne a un
 *    interrupteur, et toujours avec une question — on n'arrête pas la charge
 *    d'une voiture d'un appui de travers ;
 *  - en pied, « L'appareil » : la fiche universelle, par-dessus.
 * Aucun essai chez l'utilisateur : la démo porte une borne (`?demo`).
 */
import { useState } from 'react';
import { tr, locale } from './i18n.js';
import { Fi } from './ui.jsx';
import { LOGGIA_INDEX } from './state.js';
import { LISERE } from './styles.js';
import { fmtWatts, nombre } from './format.js';
import { commanderService } from './actions.js';
import { useOptimiste } from './optimiste.js';
import { useEtatsHist } from './historique.jsx';
import { EnteteFiche, PETITES_CAPITALES } from './fichecommune.jsx';
import { vueBorne, bornerCourant, kwhDepuis } from './bornevue.js';

const PANNEAU = { marginTop: 12, borderRadius: 18, background: 'var(--o-s3)', border: LISERE, overflow: 'hidden' };
const RANGEE = { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' };
const PUCE = { height: 44, padding: '0 14px', borderRadius: 10, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', flexShrink: 0 };
const DOUX = { ...PUCE, height: 40, fontSize: 12, background: 'var(--o-s2)', color: 'var(--o-text1)' };
const PLEIN = { ...DOUX, background: 'var(--o-accent-fond)', color: '#fff' };
const ROND = { width: 44, height: 44, borderRadius: 12, border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--o-s1)', color: 'var(--o-text1)', fontFamily: 'inherit', flexShrink: 0 };

const pieceDe = (id) => (LOGGIA_INDEX && typeof LOGGIA_INDEX.areaNameOf === 'function' ? LOGGIA_INDEX.areaNameOf(id) : null);

export default function FicheBorneContenu({ borne, hass, nom = null, onFiche = null, epingle = null, Glyphe = null }) {
  const S = (hass && hass.states) || {};
  const v = vueBorne({ borne, S, nom });
  const [ovCourant, poserCourant] = useOptimiste(v ? v.courant.valeur : null);
  const [demande, setDemande] = useState(false);
  // Les kWh de la charge en cours : l'historique de l'index depuis le branchement.
  const hist = useEtatsHist(hass, v && v.depuis && borne.energie ? borne.energie : null, v ? v.depuis : null, null, v && v.depuis ? Math.floor(Date.now() / 300000) : 0);
  if (!v) return null;
  const id = borne.puissance;
  const courant = ovCourant != null ? ovCourant : v.courant.valeur;
  const kwh = borne.energie && v.depuis ? kwhDepuis(hist, S[borne.energie]) : null;
  const zone = pieceDe(id);
  const genre = tr('borne de recharge');
  const heure = (ms) => new Date(ms).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
  const regler = (sens) => {
    const cible = bornerCourant((courant != null ? courant : v.courant.min) + sens * v.courant.pas, v.courant);
    if (cible == null || cible === courant) return;
    poserCourant(cible);
    commanderService(hass, borne.courant, 'number', 'set_value', { entity_id: borne.courant, value: cible });
  };
  const confirmer = () => {
    setDemande(false);
    if (!borne.interrupteur || !v.pause) return;
    commanderService(hass, borne.interrupteur, 'switch', v.pause === 'pause' ? 'turn_off' : 'turn_on', { entity_id: borne.interrupteur });
  };
  const mot = v.pause === 'pause' ? tr('Mettre en pause') : tr('Reprendre');
  const question = v.pause === 'pause' ? tr('Mettre la charge en pause ?') : tr('Reprendre la charge ?');
  return (
    <div>
      <EnteteFiche nom={v.nom} epingle={epingle}
        plaque={{ fond: v.plaque[0], encre: v.plaque[1], icone: 'charging-station', glyphe: Glyphe ? <Glyphe id={id} size={18}><Fi i="charging-station" size={18} /></Glyphe> : null }}
        sousNom={zone ? zone + ' · ' + genre : genre.charAt(0).toUpperCase() + genre.slice(1)} />
      <div data-tete="" style={{ marginTop: 18, padding: 18, borderRadius: 18, background: v.etat === 'charge' ? 'rgba(var(--o-ok-rgb),.08)' : 'var(--o-s3)', border: LISERE }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.1, color: v.etat === 'charge' ? 'var(--o-ok)' : v.mort ? 'var(--o-text3)' : 'var(--o-text)' }}>{v.phrase.texte}</div>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--o-text2)', marginTop: 6 }}>
              {[v.watts != null ? fmtWatts(v.watts) : null, v.depuis ? tr('Branchée depuis {h}', { h: heure(v.depuis) }) : null].filter(Boolean).join(' · ') || '—'}
            </div>
          </div>
          {v.pause && !demande && (
            <button type="button" onClick={() => setDemande(true)} aria-label={mot + ' ' + v.nom}
              style={{ ...PUCE, ...(v.pause === 'reprise' ? { background: 'var(--o-accent-fond)', color: '#fff' } : { background: 'var(--o-s1)', color: 'var(--o-text1)' }) }}>
              <Fi i={v.pause === 'pause' ? 'pause' : 'play'} size={13} />{mot}
            </button>
          )}
        </div>
        {demande && v.pause && (
          <div role="group" aria-label={question} style={{ marginTop: 16, padding: '14px 16px', borderRadius: 14, background: 'var(--o-s1)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.45 }}>{question}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button type="button" style={DOUX} onClick={() => setDemande(false)}>{tr('Pas maintenant')}</button>
              <button type="button" style={PLEIN} onClick={confirmer}>{mot}</button>
            </div>
          </div>
        )}
      </div>
      {kwh != null && (
        <div data-session="" style={{ ...PANNEAU, ...RANGEE }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{tr('Charge en cours')}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text2)', marginTop: 2 }}>{tr('Depuis le branchement')}</div>
          </div>
          <span style={{ fontSize: 20, fontWeight: 800, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{nombre(kwh, 1)}<span style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-text2)', marginLeft: 4 }}>kWh</span></span>
        </div>
      )}
      {v.courant.valeur != null && (
        <div data-courant="" style={PANNEAU}>
          <div style={RANGEE}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ ...PETITES_CAPITALES }}>{tr('Courant maximum')}</div>
              {v.courant.min != null && v.courant.max != null && <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text2)', marginTop: 4 }}>{tr('De {min} à {max}', { min: v.courant.min + ' ' + v.courant.unite, max: v.courant.max + ' ' + v.courant.unite })}</div>}
            </div>
            <button type="button" style={ROND} aria-label={tr('Baisser le courant')} disabled={courant != null && courant <= v.courant.min} onClick={() => regler(-1)}><Fi i="minus-small" size={16} /></button>
            <span aria-live="polite" style={{ minWidth: 56, textAlign: 'center', fontSize: 20, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{courant != null ? courant + ' ' + v.courant.unite : '—'}</span>
            <button type="button" style={ROND} aria-label={tr('Monter le courant')} disabled={courant != null && courant >= v.courant.max} onClick={() => regler(1)}><Fi i="plus-small" size={16} /></button>
          </div>
        </div>
      )}
      {onFiche && (
        <button type="button" onClick={() => onFiche(id)} style={{ ...PANNEAU, ...RANGEE, width: '100%', cursor: 'pointer', color: 'var(--o-text)', fontFamily: 'inherit', textAlign: 'left' }}>
          <span style={{ flex: 1, fontSize: 14, fontWeight: 700 }}>{tr('L’appareil')}</span><Fi i="angle-small-right" size={14} />
        </button>
      )}
    </div>
  );
}
