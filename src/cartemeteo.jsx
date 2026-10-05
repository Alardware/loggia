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
import { useState, useEffect, useRef, useId } from 'react';
import { tr } from './i18n.js';
import { nombre } from './format.js';
import { weatherEntity, WeatherIco, haWeatherLabel } from './wxutil.jsx';
import { Fi, nomCarte } from './ui.jsx';
import { typesPrevision, degres, estNuit, modeMeteo, heuresMeteo, extremesDuJour, pluieEtVent } from './meteo.js';
import { CARTE_RAIL } from './styles.js';

/* La surface, le filet et l'ombre de `railPanel` (App.jsx) — « En ce moment »,
 * « Rappels », « Agenda » : la météo est une carte du rail parmi les autres, et
 * ses textes prennent les couleurs du thème, clair comme sombre. */
const DOUX = 'var(--o-text2)';

/* Home Assistant REMPLACE son objet `hass` à chaque changement d'état :
 * l'abonnement lit le `hass` du moment par une référence vivante, et ne dépend
 * que d'un booléen, de l'entité et du type (voir `useEtatServeur`). */
function usePrevisions(hass, entite, type) {
  /* `undefined` tant que la première livraison n'est pas là (lot 14 de
   * l'audit du 03/10) : la carte en garde la place. Les prévisions arrivent
   * après le premier dessin, et la carte grandissait alors de 105 px, poussant
   * le CO₂ et tout le rail. `null` : rien à attendre (refus, rien à demander). */
  const [liste, setListe] = useState(undefined);
  const hRef = useRef(hass);
  useEffect(() => { hRef.current = hass; });
  const connecte = !!(hass && hass.connection && typeof hass.connection.subscribeMessage === 'function');
  useEffect(() => {
    if (!connecte || !entite || !type) { setListe(null); return undefined; }
    let fini = false, stop = null;
    const fermer = (f) => { try { f(); } catch { /* déjà fermé */ } };
    hRef.current.connection.subscribeMessage(
      (ev) => { if (!fini && ev) setListe(l => (Array.isArray(ev.forecast) ? ev.forecast : l === undefined ? null : l)); },
      { type: 'weather/subscribe_forecast', entity_id: entite, forecast_type: type },
    ).then(u => { if (fini) fermer(u); else stop = u; }).catch(() => { if (!fini) setListe(null); /* pas de prévision : ni le bloc ni sa réserve */ });
    return () => { fini = true; if (stop) fermer(stop); };
  }, [connecte, entite, type]);
  return connecte && entite && type ? liste : null;
}

export function CarteMeteo({ hass, onOpen = null }) {
  const S = (hass && hass.states) || {};
  const id = weatherEntity(hass);
  const st = id ? S[id] : null;
  const types = typesPrevision(st);
  const parHeure = usePrevisions(hass, id, types.heure ? 'hourly' : null);
  const parJour = usePrevisions(hass, id, types.jour ? 'daily' : null);
  const did = useId(); // avant le `return null` : l'ordre des crochets ne change pas d'un rendu à l'autre
  if (!st || st.state === 'unavailable' || st.state === 'unknown') return null;

  const a = st.attributes || {};
  const maintenant = Date.now();
  const soleil = S['sun.sun'] || null;
  const nuit = estNuit(maintenant, soleil);
  const mode = modeMeteo(st.state, nuit);
  const ciel = haWeatherLabel(st.state);
  const extremes = extremesDuJour(parJour, maintenant);
  const pluie = pluieEtVent(parJour, a, maintenant);
  const heures = heuresMeteo({ etat: st, previsions: parHeure, maintenant, soleil });
  const nom = a.friendly_name || tr('Météo');
  const temperature = degres(a.temperature, 1);
  const ouvrir = () => { if (onOpen) onOpen(id); };
  /* Relecture du lot 13 : un rôle bouton rend sa descendance
   * présentationnelle — les extrêmes, la pluie, le vent et les heures
   * affichés ne se lisaient nulle part. Le nom reste court ; ces blocs se
   * lisent en DESCRIPTION, au focus. Seulement ceux qui se dessinent : une
   * référence vers un bloc absent ne décrirait rien. */
  const decrit = [extremes && did + '-ext', (pluie.proba != null || pluie.vent != null) && did + '-pl', heures.length > 0 && did + '-h'].filter(Boolean).join(' ') || undefined;

  return (
    /* Son nom est ce qu'elle AFFICHE (lot 13 de l'audit du 03/10) : le lieu,
     * la température, le ciel — « Maison, 18,2°, Nuageux ». « Ouvrir Maison »
     * taisait la météo même, et ce mot d'ordre n'est écrit nulle part sur la
     * carte (WCAG 2.5.3). Aucune commande dedans : elle reste un bouton, qui
     * dit qu'il ouvre une fiche. */
    <div className="o-carte-meteo" role="button" tabIndex={0} aria-label={nomCarte(nom, temperature, ciel)} aria-haspopup="dialog" aria-describedby={decrit}
      onClick={ouvrir} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ouvrir(); } }}
      style={{ ...CARTE_RAIL, padding: '14px 16px 13px', cursor: 'pointer', minWidth: 0 }}>
      {/* La temperature ne cede jamais sa place : c'est la colonne de droite qui
        * se plie — « Partiellement nuageux » passe sur deux lignes dans un rail
        * etroit. Le corps du chiffre suit la largeur de la carte (index.css). */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: '0 0 auto', minWidth: 0, maxWidth: '62%' }}>
          <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nom}</div>
          {temperature && <div className="o-meteo-temp" style={{ fontWeight: 300, lineHeight: 1.05, letterSpacing: '-.02em', fontVariantNumeric: 'tabular-nums', marginTop: 4, whiteSpace: 'nowrap' }}>{temperature}</div>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flex: '1 1 0', minWidth: 0, textAlign: 'right' }}>
          {mode && <WeatherIco wx={mode} size={44} />}
          {ciel && <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.2, marginTop: 6 }}>{ciel}</div>}
          {extremes && <div id={did + '-ext'} style={{ fontSize: 12, fontWeight: 600, color: DOUX, marginTop: 3 }}>{[tr('Max {n}', { n: extremes.max }), extremes.min && tr('Min {n}', { n: extremes.min })].filter(Boolean).join(' · ')}</div>}
          {!extremes && parJour === undefined && <div aria-hidden="true" style={{ fontSize: 12, fontWeight: 600, marginTop: 3 }}>{' '}</div>}
        </div>
      </div>
      {/* La pluie attendue et le vent (ADR 0038, son « non fait »). La capture
        * du 17/09 ne les montrait pas — c'est pour ça qu'ils avaient attendu.
        * Une ligne discrète sous l'en-tête, jamais une colonne de plus : la
        * disposition de la capture ne bouge pas.
        *
        * On n'affiche QUE ce que le service donne. Le cumul ne sort pas seul,
        * sans probabilité : « 0 mm » sous un ciel ensoleillé est du bruit. */}
      {(pluie.proba != null || pluie.vent != null) && (
        <div id={did + '-pl'} style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 9, fontSize: 12, fontWeight: 600, color: DOUX }}>
          {pluie.proba != null && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Fi i="raindrops" size={12} />
              {pluie.proba + ' %' + (pluie.cumul ? ' · ' + tr('{n} {u}', { n: nombre(pluie.cumul, 1, 0), u: pluie.uniteCumul }) : '')}
            </span>
          )}
          {pluie.vent != null && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Fi i="wind" size={12} />
              {pluie.vent + ' ' + pluie.uniteVent}
            </span>
          )}
        </div>
      )}
      {heures.length > 0 && (
        <div id={did + '-h'} style={{ display: 'grid', gridTemplateColumns: 'repeat(' + heures.length + ', minmax(0, 1fr))', gap: 2, marginTop: 12, paddingTop: 11, borderTop: 'var(--o-bw,1px) solid var(--o-bd3)' }}>
          {heures.map(h => (
            <div key={h.cle} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, minWidth: 0 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-text3)', whiteSpace: 'nowrap' }}>{h.libelle}</span>
              <span style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{h.mode && <WeatherIco wx={h.mode} size={28} anime={false} />}</span>
              <span style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{h.temp}</span>
            </div>
          ))}
        </div>
      )}
      {/* La rangée des heures, attendue : sa place, invisible, le temps de la
        * première livraison (voir `usePrevisions`). La même pile qu'une
        * colonne — libellé, icône de 28, température — et le même filet. */}
      {!heures.length && parHeure === undefined && (
        <div aria-hidden="true" style={{ visibility: 'hidden', display: 'flex', flexDirection: 'column', gap: 5, marginTop: 12, paddingTop: 11, borderTop: 'var(--o-bw,1px) solid transparent', fontWeight: 700 }}>
          <span style={{ fontSize: 11 }}>{' '}</span><span style={{ height: 28 }} /><span style={{ fontSize: 14 }}>{' '}</span>
        </div>
      )}
    </div>
  );
}
