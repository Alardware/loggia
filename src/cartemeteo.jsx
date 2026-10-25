/* ── La carte météo du rail de l'Accueil (ADR 0038 ; sa maquette « Cartes météo », 20/10) ──
 *
 * Sur le côté, avec « À surveiller », « En ce moment » et l'agenda. Depuis la
 * maquette du 20/10 (cadre 1a) : le nom de la VILLE et, dessous, une phrase qui
 * répond à la question qu'on se pose — « Sec jusqu'à samedi », « Pluie vers
 * 16 h · rentrez le linge » —, l'icône à droite ; la température en grand, le
 * ciel et les extrêmes du jour à droite ; le vent et le coucher du soleil (le
 * lever, de nuit) ; puis les heures qui viennent. Une vigilance orange ou rouge
 * teinte la carte et prend la phrase ; la pluie annoncée la teinte en froid.
 * Les TEINTES restent celles des autres cartes du rail (ADR 0038) : la teinte
 * d'état est un lavis, comme sur les autres cartes de la maison.
 *
 * Tout ce qui se calcule vit dans `meteo.js`, testé à sec. Les prévisions
 * arrivent par abonnement (`weather/subscribe_forecast`) : Home Assistant les
 * pousse quand elles changent, rien n'est sondé. Un type de prévision que
 * l'entité ne sait pas donner n'est pas demandé, et son bloc ne se dessine pas.
 */
import { useState, useEffect, useRef, useId } from 'react';
import { tr } from './i18n.js';
import { weatherEntity, WeatherIco, haWeatherLabel } from './wxutil.jsx';
import { Fi, nomCarte } from './ui.jsx';
import { typesPrevision, degres, estNuit, modeMeteo, heuresMeteo, extremesDuJour, pluieEtVent, nomVille, phraseMeteo, soleilMeteo, vigilanceWidget } from './meteo.js';
import { CARTE_RAIL } from './styles.js';
import { capteurVigilance } from './vigilance.js';

/* La surface, le filet et l'ombre de `railPanel` (App.jsx) — « En ce moment »,
 * « Rappels », « Agenda » : la météo est une carte du rail parmi les autres, et
 * ses textes prennent les couleurs du thème, clair comme sombre. */
const DOUX = 'var(--o-text2)';

/* Home Assistant REMPLACE son objet `hass` à chaque changement d'état :
 * l'abonnement lit le `hass` du moment par une référence vivante, et ne dépend
 * que d'un booléen, de l'entité et du type (voir `useEtatServeur`). */
export function usePrevisions(hass, entite, type) {
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

/* Le lavis d'une teinte d'état sur la surface du rail : la même recette que les
 * cartes de la maison (`lavisCarte`, App.jsx) — la teinte en haut, presque rien
 * à 72 %, sur la surface. Sans teinte, la surface nue. */
export const fondTeinte = (rgb) => (rgb ? `linear-gradient(180deg, rgba(${rgb},.12), rgba(${rgb},.03) 72%), var(--o-surfA)` : undefined);
export const RGB_TON = { cold: 'var(--o-cold-rgb)', warn: 'var(--o-warn-rgb)', warn2: 'var(--o-warn2-rgb)', bad: 'var(--o-bad-rgb)' };
export const ENCRE_TON = { cold: 'var(--o-cold)', warn: 'var(--o-warn)', warn2: 'var(--o-warn2)', bad: 'var(--o-bad)' };

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
  const nom = nomVille(a.friendly_name) || tr('Météo');
  const temperature = degres(a.temperature, 1);
  const astre = soleilMeteo(maintenant, soleil);
  /* La phrase, et la vigilance qui la prend quand elle est orange ou rouge.
   * Une vigilance jaune reste dans la popup : l'Accueil ne fait pas de bruit. */
  const vigilance = vigilanceWidget(S, capteurVigilance(S));
  const phrase = vigilance && vigilance.widget ? { texte: vigilance.texte, ton: vigilance.ton } : phraseMeteo({ heures: parHeure, jours: parJour, maintenant, soleil, etat: st });
  const ton = (phrase && phrase.ton) || null;
  const ouvrir = () => { if (onOpen) onOpen(id); };
  /* Relecture du lot 13 : un rôle bouton rend sa descendance
   * présentationnelle — la phrase, les extrêmes, le vent et les heures
   * affichés ne se lisaient nulle part. Le nom reste court ; ces blocs se
   * lisent en DESCRIPTION, au focus. Seulement ceux qui se dessinent : une
   * référence vers un bloc absent ne décrirait rien. */
  const decrit = [phrase && did + '-ph', extremes && did + '-ext', (pluie.vent != null || astre) && did + '-pl', heures.length > 0 && did + '-h'].filter(Boolean).join(' ') || undefined;

  return (
    /* Son nom est ce qu'elle AFFICHE (lot 13 de l'audit du 03/10) : le lieu,
     * la température, le ciel — « Maison, 18,2°, Nuageux ». « Ouvrir Maison »
     * taisait la météo même, et ce mot d'ordre n'est écrit nulle part sur la
     * carte (WCAG 2.5.3). Aucune commande dedans : elle reste un bouton, qui
     * dit qu'il ouvre une fiche. */
    <div className="o-carte-meteo" role="button" tabIndex={0} aria-label={nomCarte(nom, temperature, ciel)} aria-haspopup="dialog" aria-describedby={decrit}
      onClick={ouvrir} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ouvrir(); } }}
      style={{ ...CARTE_RAIL, padding: '14px 16px 13px', cursor: 'pointer', minWidth: 0, background: fondTeinte(ton ? RGB_TON[ton] : null) || CARTE_RAIL.background }}>
      {/* Le nom de la ville et la phrase, l'icône à droite (cadre 1a). La phrase
        * tient sur deux lignes au plus ; sans prévision, elle n'existe pas. */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nom}</div>
          {phrase && <div id={did + '-ph'} style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.35, color: ton ? ENCRE_TON[ton] : DOUX, marginTop: 3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{phrase.texte}</div>}
        </div>
        {mode && <span style={{ width: 64, height: 64, margin: '-14px -10px -12px 0', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><WeatherIco wx={mode} size={64} /></span>}
      </div>
      {/* La temperature ne cede jamais sa place : c'est la colonne de droite qui
        * se plie — « Partiellement nuageux » passe sur deux lignes dans un rail
        * etroit. Le corps du chiffre suit la largeur de la carte (index.css). */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginTop: 12 }}>
        {temperature && <div className="o-meteo-temp" style={{ flex: '0 0 auto', fontWeight: 800, lineHeight: 1, letterSpacing: '-.03em', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{temperature}</div>}
        <div style={{ flex: '1 1 0', minWidth: 0, textAlign: 'right', paddingBottom: 4 }}>
          {ciel && <div style={{ fontSize: 14, fontWeight: 800, lineHeight: 1.2 }}>{ciel}</div>}
          {extremes && <div id={did + '-ext'} style={{ fontSize: 12, fontWeight: 600, color: DOUX, marginTop: 2 }}>{[tr('Max {n}', { n: extremes.max }), extremes.min && tr('Min {n}', { n: extremes.min })].filter(Boolean).join(' · ')}</div>}
          {!extremes && parJour === undefined && <div aria-hidden="true" style={{ fontSize: 12, fontWeight: 600, marginTop: 2 }}>{' '}</div>}
        </div>
      </div>
      {/* Le vent et le coucher du soleil (le lever, de nuit), sous la température
        * (cadre 1a) : la vigilance y ajoute son échéance. On n'affiche QUE ce
        * que l'entité et sun.sun donnent. */}
      {(pluie.vent != null || astre) && (
        <div id={did + '-pl'} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 14px', marginTop: 10, fontSize: 12, fontWeight: 700, color: DOUX }}>
          {pluie.vent != null && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', color: pluie.vent >= 50 ? 'var(--o-warn2)' : DOUX }}>
              <Fi i="wind" size={12} color="var(--o-text3)" />
              {pluie.vent + ' ' + pluie.uniteVent}
            </span>
          )}
          {astre && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
              <Fi i={astre.jour ? 'sunset' : 'sunrise'} size={12} color="var(--o-text3)" />
              {astre.libelle}
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
          <span style={{ fontSize: 11 }}>{' '}</span><span style={{ height: 28 }} /><span style={{ fontSize: 14 }}>{' '}</span>
        </div>
      )}
    </div>
  );
}
