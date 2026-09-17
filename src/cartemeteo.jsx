/* ── La carte météo du rail de l'Accueil (ADR 0038) ─────────────────────────
 *
 * Sur le côté, avec « À surveiller », « En ce moment » et l'agenda : le lieu et
 * la température en grand, le ciel et les extrêmes du jour à droite, puis les
 * heures qui viennent. La DISPOSITION est celle de la capture fournie le 17/09 ;
 * les TEINTES sont celles des autres cartes du rail. Le fond bleu de la capture
 * avait d'abord été repris tel quel : « applique les mêmes teintes que pour les
 * autres cartes, c'est ridicule là » — une capture venue d'ailleurs donne une
 * mise en page, pas une palette.
 *
 * Tout ce qui se calcule vit dans `meteo.js`, testé à sec. Les prévisions
 * arrivent par abonnement (`weather/subscribe_forecast`) : Home Assistant les
 * pousse quand elles changent, rien n'est sondé. Un type de prévision que
 * l'entité ne sait pas donner n'est pas demandé, et son bloc ne se dessine pas.
 */
import { useState, useEffect, useRef } from 'react';
import { tr } from './i18n.js';
import { weatherEntity, WeatherIco, haWeatherLabel } from './wxutil.jsx';
import { typesPrevision, degres, estNuit, modeMeteo, heuresMeteo, extremesDuJour } from './meteo.js';

/* La surface, le filet et l'ombre de `railPanel` (App.jsx) — « En ce moment »,
 * « Rappels », « Agenda » : la météo est une carte du rail parmi les autres, et
 * ses textes prennent les couleurs du thème, clair comme sombre. */
const CARTE_RAIL = { background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd2)', borderRadius: 'var(--o-radius,18px)', boxShadow: 'var(--o-shadow)', color: 'var(--o-text)' };
const DOUX = 'var(--o-text2)';

/* Home Assistant REMPLACE son objet `hass` à chaque changement d'état :
 * l'abonnement lit le `hass` du moment par une référence vivante, et ne dépend
 * que d'un booléen, de l'entité et du type (voir `useEtatServeur`). */
function usePrevisions(hass, entite, type) {
  const [liste, setListe] = useState(null);
  const hRef = useRef(hass);
  useEffect(() => { hRef.current = hass; });
  const connecte = !!(hass && hass.connection && typeof hass.connection.subscribeMessage === 'function');
  useEffect(() => {
    if (!connecte || !entite || !type) { setListe(null); return undefined; }
    let fini = false, stop = null;
    const fermer = (f) => { try { f(); } catch { /* déjà fermé */ } };
    hRef.current.connection.subscribeMessage(
      (ev) => { if (!fini && ev && Array.isArray(ev.forecast)) setListe(ev.forecast); },
      { type: 'weather/subscribe_forecast', entity_id: entite, forecast_type: type },
    ).then(u => { if (fini) fermer(u); else stop = u; }).catch(() => { /* pas de prévision : le bloc ne se dessine pas */ });
    return () => { fini = true; if (stop) fermer(stop); };
  }, [connecte, entite, type]);
  return liste;
}

export function CarteMeteo({ hass, onOpen = null }) {
  const S = (hass && hass.states) || {};
  const id = weatherEntity(hass);
  const st = id ? S[id] : null;
  const types = typesPrevision(st);
  const parHeure = usePrevisions(hass, id, types.heure ? 'hourly' : null);
  const parJour = usePrevisions(hass, id, types.jour ? 'daily' : null);
  if (!st || st.state === 'unavailable' || st.state === 'unknown') return null;

  const a = st.attributes || {};
  const maintenant = Date.now();
  const soleil = S['sun.sun'] || null;
  const nuit = estNuit(maintenant, soleil);
  const mode = modeMeteo(st.state, nuit);
  const ciel = haWeatherLabel(st.state);
  const extremes = extremesDuJour(parJour, maintenant);
  const heures = heuresMeteo({ etat: st, previsions: parHeure, maintenant, soleil });
  const nom = a.friendly_name || tr('Météo');
  const ouvrir = () => { if (onOpen) onOpen(id); };

  return (
    <div className="o-carte-meteo" role="button" tabIndex={0} aria-label={tr('Ouvrir') + ' ' + nom}
      onClick={ouvrir} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ouvrir(); } }}
      style={{ ...CARTE_RAIL, padding: '14px 16px 13px', cursor: 'pointer', minWidth: 0 }}>
      {/* La temperature ne cede jamais sa place : c'est la colonne de droite qui
        * se plie — « Partiellement nuageux » passe sur deux lignes dans un rail
        * etroit. Le corps du chiffre suit la largeur de la carte (index.css). */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: '0 0 auto', minWidth: 0, maxWidth: '62%' }}>
          <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nom}</div>
          {degres(a.temperature, 1) && <div className="o-meteo-temp" style={{ fontWeight: 300, lineHeight: 1.05, letterSpacing: '-.02em', fontVariantNumeric: 'tabular-nums', marginTop: 4, whiteSpace: 'nowrap' }}>{degres(a.temperature, 1)}</div>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flex: '1 1 0', minWidth: 0, textAlign: 'right' }}>
          {mode && <WeatherIco wx={mode} size={44} />}
          {ciel && <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.2, marginTop: 6 }}>{ciel}</div>}
          {extremes && <div style={{ fontSize: 12, fontWeight: 600, color: DOUX, marginTop: 3 }}>{[tr('Max {n}', { n: extremes.max }), extremes.min && tr('Min {n}', { n: extremes.min })].filter(Boolean).join(' · ')}</div>}
        </div>
      </div>
      {heures.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(' + heures.length + ', minmax(0, 1fr))', gap: 2, marginTop: 12, paddingTop: 11, borderTop: 'var(--o-bw,1px) solid var(--o-bd3)' }}>
          {heures.map(h => (
            <div key={h.cle} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, minWidth: 0 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-text3)', whiteSpace: 'nowrap' }}>{h.libelle}</span>
              <span style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{h.mode && <WeatherIco wx={h.mode} size={28} />}</span>
              <span style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{h.temp}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
