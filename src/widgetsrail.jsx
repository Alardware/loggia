/* ── Les widgets en option du rail de l'Accueil : l'heure (ADR 0041), le CO₂ (ADR 0044) ──
 *
 * Deux captures fournies le 17/09 (« sur le côté à l'accueil voici d'autres
 * widgets que l'on pourrait mettre, pour l'heure 2 styles ») : des aiguilles
 * sur de grands chiffres, et trois tuiles heures · minutes · secondes.
 *
 * Les captures donnent la DISPOSITION ; les teintes sont celles des cartes du
 * rail (`railPanel`, la carte météo) — une capture venue d'ailleurs ne donne
 * pas une palette.
 *
 * Tout ce qui se calcule vit dans `horloge.js`, testé à sec. Rien sans source :
 * pas de météo, pas de température sous les aiguilles.
 *
 * Le calendrier « semaine » et « mois » a vécu ici jusqu'à la décision 0132 :
 * la carte Agenda de `agendarail.jsx` dit la même chose, et sa feuille va plus
 * loin — « retire la du coup elle ne serre plus a rien ».
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import { tr, locale } from './i18n.js';
import { weatherEntity, WeatherIco } from './wxutil.jsx';
import { degres, estNuit, modeMeteo } from './meteo.js';
import { chiffresHeure, anglesAiguilles } from './horloge.js';
import { pointsHistorique, barresJournee, etendue, reperesAxe } from './air.js';
import { CARTE_RAIL, petitesCapitales } from './styles.js';

/* La surface des cartes du rail (voir `railPanel` dans App.jsx et cartemeteo.jsx). */
/* Une tuile DANS un widget : le fond des pastilles de la barre de confort. */
const TUILE = { background: 'var(--o-s2)', borderRadius: 12, minWidth: 0 };
const PETITES_CAPITALES = petitesCapitales(9.5);

/* L'heure qui passe : un rendu par `pas`, calé sur la frontière (la seconde ou
 * la minute ronde) pour que deux widgets voisins changent ensemble. Le widget
 * masqué n'est pas monté : rien ne tourne pour rien. */
function useMaintenant(pas) {
  const [t, setT] = useState(() => Date.now());
  useEffect(() => {
    let iv = null;
    const to = setTimeout(() => { setT(Date.now()); iv = setInterval(() => setT(Date.now()), pas); }, pas - (Date.now() % pas));
    return () => { clearTimeout(to); if (iv) clearInterval(iv); };
  }, [pas]);
  return t;
}

const sansPoint = (s) => String(s || '').replace(/\./g, '');

/* ════════════ L'HEURE ════════════ */

function HeureAiguilles({ hass }) {
  const t = useMaintenant(1000);
  const d = new Date(t);
  const { h, m } = chiffresHeure(d);
  const a = anglesAiguilles(d);
  const S = (hass && hass.states) || {};
  const idMeteo = weatherEntity(hass);
  const st = idMeteo ? S[idMeteo] : null;
  const vivante = st && st.state !== 'unavailable' && st.state !== 'unknown';
  const mode = vivante ? modeMeteo(st.state, estNuit(t, S['sun.sun'] || null)) : null;
  const temp = vivante ? degres((st.attributes || {}).temperature, 0) : null;
  const date = sansPoint(d.toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short' }));
  return (
    <div className="o-w-temps" role="img" aria-label={tr('Heure') + ' ' + h + ':' + m} style={{ ...CARTE_RAIL, padding: '12px 14px 12px' }}>
      <div style={{ ...PETITES_CAPITALES, fontSize: 10.5, color: 'var(--o-text2)', textAlign: 'center' }}>{date}</div>
      <div className="o-w-cadran" aria-hidden="true" style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '2px 0' }}>
        {/* Les chiffres, très pâles, derrière les aiguilles : l'heure se lit deux fois. */}
        <div className="o-w-chiffres-fond" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.62em', fontWeight: 800, lineHeight: 1, letterSpacing: '-.02em', fontVariantNumeric: 'tabular-nums', color: 'var(--o-text)', opacity: .09 }}>
          <span>{h}</span><span>{m}</span>
        </div>
        <svg viewBox="-50 -50 100 100" style={{ position: 'absolute', top: '50%', left: '50%', height: '100%', aspectRatio: '1 / 1', transform: 'translate(-50%,-50%)', overflow: 'visible' }}>
          <line x1="0" y1="3" x2="0" y2="-23" stroke="var(--o-text)" strokeWidth="3.4" strokeLinecap="round" transform={'rotate(' + a.heures + ')'} />
          <line x1="0" y1="4" x2="0" y2="-38" stroke="var(--o-text2)" strokeWidth="2.4" strokeLinecap="round" transform={'rotate(' + a.minutes + ')'} />
          <line x1="0" y1="11" x2="0" y2="-42" stroke="var(--o-accent)" strokeWidth="1.3" strokeLinecap="round" transform={'rotate(' + a.secondes + ')'} />
          <circle r="3.6" fill="var(--o-text)" />
          <circle r="1.4" fill="var(--o-surfA)" />
        </svg>
      </div>
      {(mode || temp) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
          {mode && <WeatherIco wx={mode} size={20} anime={false} />}{temp}
        </div>
      )}
    </div>
  );
}

function HeureTuiles() {
  const t = useMaintenant(1000);
  const { h, m, s } = chiffresHeure(new Date(t));
  const tuile = (v, mot, muet) => (
    <div style={{ ...TUILE, padding: '13px 4px 10px', textAlign: 'center' }}>
      <div className="o-w-tuile-chiffre" aria-hidden={muet || undefined} style={{ fontWeight: 300, lineHeight: 1, letterSpacing: '-.02em', fontVariantNumeric: 'tabular-nums' }}>{v}</div>
      <div aria-hidden="true" style={{ ...PETITES_CAPITALES, marginTop: 8 }}>{mot}</div>
    </div>
  );
  return (
    <div className="o-w-temps" role="img" aria-label={tr('Heure') + ' ' + h + ':' + m} style={{ ...CARTE_RAIL, padding: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        {tuile(h, tr('Heures'), true)}{tuile(m, tr('Minutes'), true)}{tuile(s, tr('Secondes'), true)}
      </div>
    </div>
  );
}

export function HorlogeRail({ style = 'aiguilles', hass = null }) {
  return style === 'tuiles' ? <HeureTuiles /> : <HeureAiguilles hass={hass} />;
}


/* ════════════ L'AIR : LE CO₂ (ADR 0044) ════════════ */

/* L'historique d'un capteur sur vingt-quatre heures, relu toutes les cinq
 * minutes : un capteur de CO₂ change à chaque minute, le relire à chaque
 * changement pèserait pour rien. Référence vivante sur `hass` — Home
 * Assistant le REMPLACE à chaque état. */
function useHistoriqueJour(hass, id, pas = 300000) {
  const [points, setPoints] = useState(null);
  const hRef = useRef(hass);
  useEffect(() => { hRef.current = hass; });
  const connecte = !!(hass && typeof hass.callApi === 'function');
  const tic = useMaintenant(pas);
  useEffect(() => {
    if (!connecte || !id) { setPoints(null); return undefined; }
    let vivant = true;
    const fin = new Date();
    const debut = new Date(fin.getTime() - 86400000).toISOString();
    hRef.current.callApi('GET', 'history/period/' + debut + '?filter_entity_id=' + encodeURIComponent(id) + '&end_time=' + encodeURIComponent(fin.toISOString()) + '&minimal_response&no_attributes')
      .then(r => { if (vivant) setPoints(pointsHistorique(r)); })
      .catch(() => { if (vivant) setPoints('erreur'); });
    return () => { vivant = false; };
  }, [connecte, id, tic]);
  return points;
}

/* La carte CO₂ de la capture : la pièce la plus chargée, la règle d'aération,
 * l'étendue de la journée, une barre par heure — la dernière est le moment,
 * pleine ; celles qui passent le seuil disent l'état, en ambre — et le geste
 * pour aérer quand il y a quelque chose à commander. */
export function Co2Rail({ hass, capteur, seuil, action = null, onAgir = null }) {
  const reponse = useHistoriqueJour(hass, capteur ? capteur.id : null);
  const histoErreur = reponse === 'erreur';
  const points = histoErreur ? null : reponse;
  const barres = useMemo(() => barresJournee(points || [], Date.now()), [points]);
  const actuel = capteur && capteur.valeur != null ? Math.round(capteur.valeur) : null;
  const { min, max } = etendue(barres, actuel);
  const plafond = Math.max(max || 0, seuil, 1);
  const [avant, milieu, apres] = reperesAxe(24);
  return (
    <div className="o-w-air" style={{ ...CARTE_RAIL, padding: '14px 14px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-.01em' }}>CO₂</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text2)', marginTop: 2, lineHeight: 1.35 }}>{capteur && capteur.piece ? capteur.piece + ' · ' : ''}{tr('Aérer au-dessus de {n} ppm', { n: seuil })}</div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ ...PETITES_CAPITALES, textTransform: 'none' }}>24 h</div>
          <div style={{ fontSize: 14, fontWeight: 800, fontVariantNumeric: 'tabular-nums', marginTop: 2, whiteSpace: 'nowrap' }}>{histoErreur ? tr('indisponible') : min != null ? min + ' – ' + max + ' ppm' : '—'}</div>
        </div>
      </div>
      <div role="img" aria-label={tr('CO₂ sur 24 heures')} style={{ display: 'grid', gridTemplateColumns: 'repeat(24, minmax(0, 1fr))', gap: 3, alignItems: 'end', height: 64, marginTop: 12 }}>
        {barres.map((v, i) => {
          const dernier = i === barres.length - 1;
          const val = dernier && actuel != null ? actuel : v;
          const haut = val != null && val >= seuil;
          return <div key={i} style={{ height: val == null ? 3 : Math.max(4, Math.round(64 * val / plafond)), borderRadius: 3,
            background: val == null ? 'var(--o-s2)' : dernier ? (haut ? 'var(--o-warn)' : 'var(--o-accent-fond)') : (haut ? 'rgba(var(--o-warn-rgb),.45)' : 'rgba(var(--o-accent-rgb),.22)') }} />;
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10.5, fontWeight: 700, color: 'var(--o-text3)', fontVariantNumeric: 'tabular-nums' }}>
        <span>{avant}</span><span>{milieu}</span><span>{apres}</span>
      </div>
      {action && (
        <button type="button" onClick={() => { if (onAgir) onAgir(action); }}
          style={{ marginTop: 12, width: '100%', padding: '12px 14px', borderRadius: 14, border: 'none', cursor: 'pointer', fontSize: 13.5, fontWeight: 800, fontFamily: 'inherit', background: 'var(--o-accent-fond)', color: '#fff' }}>{action.libelle}</button>
      )}
    </div>
  );
}
