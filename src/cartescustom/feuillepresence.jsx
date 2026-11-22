/* ── La feuille Présence : toute la maisonnée (sortie de galerie.jsx au lot 16 du rapport Gladys ; ADR 0321) ──
 *
 * Chargée à la demande, au premier toucher de la carte Présence (`CvPresence`,
 * galerie.jsx) : elle n'a rien à faire au démarrage. Son texte est celui de
 * galerie.jsx, tel quel, plus « Voir sur la carte » — la carte des personnes et
 * des traceurs (feuillecarte.jsx), chargée à son tour à la demande, Leaflet
 * compris. */
import { useState, useEffect, Suspense } from 'react';
import { lazyRecharge } from '../recharge.js';
import { BottomSheet, TitreFeuille, editBtn } from '../ui.jsx';
import { relTime } from '../format.js';
import { tr, locale } from '../i18n.js';
import { getHass, LOGGIA_INDEX, plateformeDe } from '../state.js';
import { pickSibling } from '../discovery.js';
import { lireHistorique } from '../absence.js';
import { mouvementsDuJour, texteJournee, telephoneDe, chargeDe } from '../journeepresence.js';

const FeuilleCarte = lazyRecharge(() => import('../feuillecarte.jsx'));

const heure = (t) => new Date(t).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
const minuitDe = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };

/* La journée de chacun (P3, ADR 0383) : l'historique des `person` depuis minuit, lu UNE fois à l'ouverture de la feuille. */
function useJournees(ids) {
  const [series, setSeries] = useState({});
  const cle = ids.join(',');
  useEffect(() => {
    const h = getHass();
    if (!h || typeof h.callApi !== 'function' || !cle) return undefined;
    let vivant = true;
    const q = 'history/period/' + new Date(minuitDe()).toISOString() + '?filter_entity_id=' + cle.split(',').map(encodeURIComponent).join(',')
      + '&minimal_response&no_attributes';
    Promise.resolve(h.callApi('GET', q)).then((r) => { if (vivant) setSeries(lireHistorique(r)); }, () => {});
    return () => { vivant = false; };
  }, [cle]);
  return series;
}

/* Ce qu'on ajoute sous « zone · depuis » : la journée, puis la pile de son téléphone (P3) ; '' s'il n'y a rien à dire. */
function ligneJournee(p, series, S) {
  const journee = texteJournee(mouvementsDuJour(series[p.haid], minuitDe()), heure);
  const tel = telephoneDe(S[p.haid], plateformeDe);
  const pile = tel ? pickSibling(LOGGIA_INDEX, S, tel, { domain: 'sensor', deviceClass: 'battery' }) : null;
  const n = pile ? chargeDe(S[pile]) : null;
  return [journee, n != null ? tr('téléphone {n} %', { n }) : ''].filter(Boolean).join(' · ');
}

/* Toute la maisonnée, sans limite : la carte n'en montre que ce que 184 px
 * peuvent porter. Même patron que les autres feuilles (ADR 0055) : hauteur au
 * contenu, une croix en bout de ligne d'en-tête. Chaque ligne dit où est la
 * personne et depuis quand, comme la carte d'une personne seule. */
function FeuillePresence({ liste, onClose }) {
  const maison = liste.filter(p => p.home).length;
  const [carte, setCarte] = useState(false);
  const series = useJournees(liste.map(p => p.haid).filter(Boolean));
  const S = (getHass() && getHass().states) || {};
  return (
    <BottomSheet onClose={onClose}>
      <TitreFeuille marge={12}>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
          <span style={{ fontSize: 17, fontWeight: 800 }}>{tr('Présence')}</span>
          <span style={{ fontSize: 12, fontWeight: 800, color: maison ? 'var(--o-ok)' : 'var(--o-text3)' }}>{maison + ' / ' + liste.length}</span>
        </span>
      </TitreFeuille>
      <div role="list">
        {liste.map((p) => (
          <div key={p.haid} role="listitem" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderTop: 'var(--o-bw,1px) solid var(--o-bd3)' }}>
            <span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: p.img ? `url("${p.img}") center/cover` : 'var(--o-s1)', fontSize: 12, fontWeight: 800, color: p.home ? 'var(--o-text2)' : 'var(--o-text3)', opacity: p.home || !p.img ? 1 : .55 }}>{!p.img && p.name.slice(0, 2).toUpperCase()}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 14, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
              <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: p.home ? 'var(--o-ok)' : 'var(--o-text3)' }}>{p.mot + (p.lc ? ' · ' + relTime(p.lc).toLowerCase() : '')}</span>
              {ligneJournee(p, series, S) && <span data-journee="" style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--o-text3)', marginTop: 2 }}>{ligneJournee(p, series, S)}</span>}
            </span>
            <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: '50%', flexShrink: 0, background: p.home ? 'var(--o-ok)' : 'var(--o-text3)', boxShadow: p.home ? '0 0 6px rgba(var(--o-ok-rgb),.6)' : 'none' }} />
          </div>
        ))}
      </div>
      <button type="button" onClick={() => setCarte(true)} style={{ ...editBtn(), marginTop: 12 }}>{tr('Voir sur la carte')}</button>
      {carte && <Suspense fallback={null}><FeuilleCarte suivies={liste} onClose={() => setCarte(false)} /></Suspense>}
    </BottomSheet>
  );
}

export default FeuillePresence;
