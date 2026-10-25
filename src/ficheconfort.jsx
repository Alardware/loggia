/* ── La fiche de confort d’une pièce, chargée à la demande (chantier Capteurs, plan 1, tâche 1 : la borne) ──
 *
 * Telle quelle (ADR 0039) : l’indice et son mot, le conseil, une barre et la courbe du jour par mesure. Elle a
 * quitté App.jsx, et le démarrage avec lui, pour faire la place de la carte d’une mesure. Elle lit la même table
 * que les cartes (`confort.js`). Elle n’importe jamais App.jsx : la coquille (`RoomComfortModal`) lui passe la
 * courbe du jour, que la fiche de l’Extérieur dessine aussi, et la teinte de ses pastilles (`briques`).
 * Le module n’exporte que le CONTENU : la coquille garde la feuille et pose la frontière Suspense dedans
 * (correction bis, point 3) — un morceau qui ne se charge pas se dit dans la feuille, jamais à la place de la pièce.
 */
import { useState, useEffect, useRef } from 'react';
import { tr } from './i18n.js';
import { NomFeuille, CroixFeuille, Fi } from './ui.jsx';
import { verdictMesure, zoneMesure, scoreMesure, echelleMesure, indiceConfort, mesuresFiche, nomMesure, iconeMesure } from './confort.js';
import { uniteTemp, versCelsius, deCelsius, signeTemp } from './unites.js';
import { nombre } from './format.js';
import { LISERE } from './styles.js';

// Les décimales de la fiche : le `dec` d’App.jsx.
const dec = (n, d) => nombre(n, d);

// Échelles de confort : min/max de la barre, dégradé traffic-light, ticks chiffrés, verdict(valeur).
// Les VERDICTS viennent de `confort.js` (ADR 0039) : la barre de la pièce et cette fiche lisent la même table.
/* La barre de la fiche : l'échelle de la jauge des cartes (`echelleMesure`) —
 * mêmes bornes, mêmes couleurs par palier, mêmes repères (captures du 19/09). */
const echelleFiche = (cle, suffixe = '') => {
  const e = echelleMesure(cle);
  return { min: e.de, max: e.a, grad: 'linear-gradient(90deg,' + e.bandes.map(b => b.c + ' ' + b.de + '% ' + b.a + '%').join(',') + ')', ticks: e.reperes.map(r => r.v + suffixe), tickV: e.reperes.map(r => r.v) };
};
/* Une FONCTION, appelée au rendu de la fiche (relecture du 03/10). Objet du
 * module, la table se bâtissait une seule fois, à l'import : ses quatre titres
 * gardaient la langue du démarrage. Passer à l'allemand sans recharger
 * laissait « Qualité de l'air » en français ; de même au premier démarrage,
 * quand Home Assistant ne parle pas la langue du navigateur. L'ancien nom,
 * `COMFORT`, est aussi un mot des catalogues (« COMFORT INDEX ») : devenu
 * fonction, tests/listes_fonctions l'y aurait vu mentionné sans appel. */
const FICHE_CONFORT = () => ({
  temp: { key: 'temp', label: tr('Température'), ico: 'thermometer-half', ...echelleFiche('temp', '°'), verdict: v => verdictMesure('temp', v) },
  hum: { key: 'hum', label: tr('Humidité'), ico: 'humidity', ...echelleFiche('hum', '%'), verdict: v => verdictMesure('hum', v) },
  // Le CO₂ porte le nom et la glyphe de sa carte (`HABILLAGE`, confort.js ; audit du 19/10, lot 4) : « Qualité de l'air » est l'indice.
  co2: { key: 'co2', label: nomMesure('co2'), ico: iconeMesure('co2'), ...echelleFiche('co2'), verdict: v => verdictMesure('co2', v) },
  bruit: { key: 'bruit', label: tr('Bruit'), ico: 'volume', ...echelleFiche('bruit'), verdict: v => verdictMesure('bruit', v) },
});
/* Le panneau d'une mesure : le gris --o-s3, le liseré du réglage « Liserés » et l'arrondi du thème, comme les fiches des capteurs. */
const PANNEAU_MESURE = { background: 'var(--o-s3)', border: LISERE, borderRadius: 'var(--o-radius,18px)', padding: '15px 16px 13px' };
const cf_pct = (v, m) => Math.max(0, Math.min(100, (v - m.min) / (m.max - m.min) * 100));
// `v` est TOUJOURS en Celsius (c'est ce que verdictMesure/indiceConfort et l'échelle de la
// barre attendent) : seule la température se reconvertit vers l'unité réelle à l'affichage.
const cf_big = (v, m, uniteT = 'C') => m.key === 'temp' ? dec(deCelsius(v, uniteT), 1) + ' ' + signeTemp(uniteT) : m.key === 'hum' ? Math.round(v) + ' %' : m.key === 'bruit' ? Math.round(v) + ' dB' : Math.round(v) + ' ppm';
const cf_tag = (v, m, uniteT = 'C') => m.key === 'temp' ? Math.round(deCelsius(v, uniteT)) + signeTemp(uniteT) : m.key === 'hum' ? Math.round(v) + '%' : m.key === 'bruit' ? Math.round(v) + ' dB' : Math.round(v) + ' ppm';
/* La pire mesure est celle qui a la plus basse NOTE (`scoreMesure`), jamais sa couleur : le bleu dit l'idéal depuis la v3.57.0,
 * et un classement par couleur qui le tenait pour du froid conseillait de chauffer une pièce parfaite (audit du 19/10, H2). */
const cf_note = (m, v) => { const n = scoreMesure(m.key, v); return n == null ? 100 : n; };

// Barre dégradée + bulle marqueur sur la valeur + ticks (reproduit l'appli air-quality de référence).
// Elle redit le chiffre et le mot de son panneau : elle se tait pour un lecteur d'écran (audit du 19/10, lot 4).
function ComfortBar({ m, value, uniteT = 'C' }) {
  const pct = cf_pct(value, m);
  return (
    <div aria-hidden="true">
      <div style={{ position: 'relative', height: 24 }}>
        <div style={{ position: 'absolute', left: `clamp(28px, ${pct}%, calc(100% - 28px))`, bottom: 0, transform: 'translateX(-50%)', transition: 'left .55s cubic-bezier(.23,1,.32,1)', willChange: 'left' }}>
          <span style={{ position: 'relative', display: 'block', background: 'var(--o-text)', color: 'var(--o-bg)', fontSize: 11, fontWeight: 800, padding: '2px 7px', borderRadius: 10, whiteSpace: 'nowrap' }}>
            {cf_tag(value, m, uniteT)}
            <span style={{ position: 'absolute', bottom: -4, left: '50%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderTop: '4px solid var(--o-text)' }} />
          </span>
        </div>
      </div>
      <div style={{ height: 13, borderRadius: 10, background: m.grad, marginTop: 3 }} />
      <div style={{ position: 'relative', height: 15, marginTop: 5 }}>
        {m.ticks.map((t, i) => (
          <span key={t} style={{ position: 'absolute', left: cf_pct(m.tickV[i], m) + '%', transform: 'translateX(-50%)', fontSize: 11, fontWeight: 600, color: 'var(--o-text3)', whiteSpace: 'nowrap' }}>
            {m.key === 'temp' ? Math.round(deCelsius(m.tickV[i], uniteT)) + '°' : t}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function RoomComfortModal({ piece, hass, bruitId = null, briques }) {
  const { Sparkline, hx } = briques;
  const live = piece.live || null;
  const parseNum = (s) => { if (s == null) return null; const n = parseFloat(String(s).replace(',', '.')); return isNaN(n) ? null : n; };
  // `vals.temp` est converti en Celsius tout de suite : verdictMesure, indiceConfort et
  // l'échelle de la barre (14-30) raisonnent tous en Celsius. Seul `uniteT` (affichage) suit
  // l'unité réelle du capteur.
  // Une pièce réelle ne lit que ses capteurs : une mesure absente reste null,
  // et la fiche la tait comme la barre. Les chaînes de `piece` ne servent
  // qu'à l'écran d'avant la connexion (`mesuresFiche`, audit du 03/10).
  const mesures = mesuresFiche(live, piece);
  const uniteT = uniteTemp(live && live.tempId && hass && hass.states && hass.states[live.tempId] ? hass.states[live.tempId].attributes : null, hass);
  const vals = {
    temp: versCelsius(mesures.temp, uniteT),
    hum: mesures.hum,
    co2: mesures.co2,
    // Le bruit ne vit pas dans la configuration des pièces : la vue le trouve dans la zone (ADR 0039).
    bruit: bruitId && hass && hass.states && hass.states[bruitId] ? parseNum(hass.states[bruitId].state) : null,
  };
  const ids = { temp: live && live.tempId, hum: live && live.humId, co2: live && live.co2Id, bruit: bruitId };
  const table = FICHE_CONFORT();
  const metrics = [table.temp, table.hum, table.co2, table.bruit].filter(m => vals[m.key] != null);
  /* Les mesures CONFIGURÉES — celles qui ont un capteur, qu'il parle ou non (audit du 19/10, M18) : un capteur muet garde son
   * panneau, « — » et « Indisponible », au lieu de « Pas de capteur configuré pour cette pièce ». */
  const configurees = [table.temp, table.hum, table.co2, table.bruit].filter(m => vals[m.key] != null || ids[m.key]);
  const verdicts = metrics.map(m => ({ m, vd: m.verdict(vals[m.key]) }));
  const worst = verdicts.reduce((a, b) => cf_note(b.m, vals[b.m.key]) < cf_note(a.m, vals[a.m.key]) ? b : a, verdicts[0]);
  // Idéale quand même la pire mesure est dans une bonne zone (le bleu de l'idéal ou le vert du « Bon »), selon la table.
  const zonePire = worst ? zoneMesure(worst.m.key, vals[worst.m.key]) : null;
  // Le mot de la fiche est celui de la barre : l'indice de confort (ADR 0039).
  const confort = indiceConfort(vals, uniteT);
  const overall = confort ? confort.verdict : { t: '—', c: 'var(--o-text2)' };
  const advice = !verdicts.length ? (configurees.length ? tr('Indisponible') : tr('Aucune donnée capteur pour cette pièce.'))
    : (!zonePire || zonePire.bon ? tr('Conditions idéales dans cette pièce.')
      : worst.m.key === 'co2' ? tr('Niveau de CO2 élevé, pensez à aérer la pièce.')
        : worst.m.key === 'bruit' ? tr('Niveau sonore élevé dans la pièce.')
        : worst.m.key === 'temp' ? (vals.temp > 24 ? tr('Il fait chaud, pensez à ventiler ou rafraîchir.') : tr('Il fait frais, un peu de chauffage ?'))
          : (vals.hum > 60 ? tr('Air humide, aérez pour assainir.') : tr('Air un peu sec, pensez à humidifier.')));

  const [hist, setHist] = useState({});
  const [histState, setHistState] = useState('loading');
  /* L'historique se lit par SIGNATURE des capteurs lisibles (audit du 19/10, M18) : lu une seule fois à l'ouverture, un capteur
   * muet qui revenait restait « Historique indisponible ». La signature ne bouge que si l'un d'eux se tait, revient ou change —
   * jamais à chaque `hass` neuf ; `hass` se lit par une référence vivante. */
  const hRef = useRef(hass);
  hRef.current = hass;
  const lisibles = metrics.filter(m => ids[m.key]).map(m => m.key + '=' + ids[m.key]).join('|');
  const connecte = !!(hass && hass.callApi);
  useEffect(() => {
    let alive = true;
    const h = hRef.current;
    const list = lisibles ? lisibles.split('|').map(x => { const i = x.indexOf('='); return { k: x.slice(0, i), id: x.slice(i + 1) }; }) : [];
    if (!connecte || !list.length) { setHistState('none'); return; }
    setHistState('loading');
    const start = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    Promise.all(list.map(x =>
      h.callApi('GET', 'history/period/' + start + '?filter_entity_id=' + encodeURIComponent(x.id) + '&minimal_response&no_attributes')
        .then(res => ({ k: x.k, arr: (res && res[0]) ? res[0] : [] }))
        .catch(() => ({ k: x.k, arr: [] }))
    )).then(results => {
      if (!alive) return;
      const map = {};
      results.forEach(r => { const pts = r.arr.map(s => parseFloat(s.state)).filter(v => !isNaN(v)); if (pts.length >= 2) map[r.k] = pts; });
      setHist(map);
      setHistState(Object.keys(map).length ? 'done' : 'none');
    }).catch(() => { if (alive) setHistState('error'); });
    return () => { alive = false; };
  }, [lisibles, connecte]);

  return (
      <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 38, height: 38, borderRadius: 14, background: piece.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{piece.icon}</span>
          <NomFeuille><span style={{ flex: 1, fontSize: 19, fontWeight: 700, color: 'var(--o-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{piece.name}</span></NomFeuille>
          <CroixFeuille />
        </div>
        <div style={{ textAlign: 'center', margin: '16px 0 2px' }}>
          <div style={{ fontSize: 30, fontWeight: 800, color: overall.c, letterSpacing: '-.01em' }}>{overall.t}</div>
          {confort && <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-text3)', marginTop: 4 }}>{tr('Indice de confort')} · {confort.indice} / 100</div>}
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--o-text2)', marginTop: 6, lineHeight: 1.45, maxWidth: 320, marginLeft: 'auto', marginRight: 'auto' }}>{advice}</div>
        </div>
        {!configurees.length
          ? <div style={{ padding: '28px 0 10px', textAlign: 'center', fontSize: 13, color: 'var(--o-text3)', fontWeight: 600 }}>{tr('Pas de capteur configuré pour cette pièce.')}</div>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 18 }}>
              {configurees.map(m => { const v = vals[m.key]; if (v == null) return (
                <div key={m.key} className="o-panne" style={PANNEAU_MESURE}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--o-s1)', color: 'var(--o-text3)' }}><Fi i={m.ico} size={16} /></span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--o-text)' }}>{m.label}</span>
                    <span style={{ marginLeft: 'auto', textAlign: 'right' }}>
                      <span style={{ fontSize: 19, fontWeight: 800, color: 'var(--o-text3)' }}>{'\u2014'}</span>
                      <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--o-bad)', marginTop: 1 }}>{tr('Indisponible')}</span>
                    </span>
                  </div>
                </div>
              );
              const vd = m.verdict(v); return (
                <div key={m.key} style={PANNEAU_MESURE}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                    <span style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: hx(vd.c, .16), color: vd.c }}><Fi i={m.ico} size={16} /></span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--o-text)' }}>{m.label}</span>
                    <span style={{ marginLeft: 'auto', textAlign: 'right' }}>
                      <span style={{ fontSize: 19, fontWeight: 800, color: 'var(--o-text)' }}>{cf_big(v, m, uniteT)}</span>
                      <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: vd.c, marginTop: 1 }}>{vd.t}</span>
                    </span>
                  </div>
                  <ComfortBar m={m} value={v} uniteT={uniteT} />
                  <div style={{ marginTop: 14 }}>
                    {histState === 'loading'
                      ? <div style={{ height: 46, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--o-text3)', fontWeight: 600 }}>{tr("Chargement de l'historique…")}</div>
                      : hist[m.key]
                        ? <><Sparkline points={hist[m.key]} color={vd.c} /><div style={{ fontSize: 11, color: 'var(--o-text3)', fontWeight: 600, marginTop: 3 }}>{tr('24 dernières heures')}</div></>
                        : <div style={{ height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--o-text3)', fontWeight: 600 }}>{tr('Historique indisponible')}</div>}
                  </div>
                </div>
              ); })}
            </div>}
      </>
  );
}
