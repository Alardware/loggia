/* ── Ce que la maison vient de faire ────────────────────────────────────────
 *
 * Le journal d'activite et les courbes d'historique vivaient dans `App.jsx`.
 * Trois vues s'en servent — une piece, la Securite, le Systeme — et deux autres
 * les courbes. Les laisser la-bas obligeait la vue Systeme a y rester avec
 * elles : on ne charge pas une vue a la demande si le tronc la retient.
 *
 * Rien ici ne connait le reste du dashboard : ce module n'importe que la
 * traduction et deux crochets React. */
import { useState, useEffect } from 'react';
import { tr, locale } from './i18n.js';

export function useRoomLogbook(hass, ids) {
  // `ids = null` : le journal de TOUTE la maison — le logbook écarte déjà de
  // lui-même les capteurs continus, ce qui arrive mérite d'être raconté.
  const [events, setEvents] = useState([]);
  const conn = hass && hass.connection;
  const sig = ids ? ids.join('|') : '*';
  useEffect(() => {
    setEvents([]);
    if (!conn || (ids && !ids.length)) return;
    let unsub = null, mort = false;
    const debut = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    conn.subscribeMessage((msg) => {
      if (mort || !msg || !Array.isArray(msg.events) || !msg.events.length) return;
      setEvents(prev => {
        const tous = [...prev, ...msg.events.filter(e => e && e.entity_id && e.state !== 'unknown' && e.state !== 'unavailable')];
        tous.sort((a, b) => (b.when || 0) - (a.when || 0));
        return tous.slice(0, 30);
      });
    }, { type: 'logbook/event_stream', start_time: debut, ...(ids ? { entity_ids: ids } : {}) })
      .then(u => { if (mort) { try { u(); } catch {} } else unsub = u; })
      .catch(() => {}); // logbook absent ou refuse : la carte ne s'affiche pas, c'est tout
    return () => { mort = true; if (unsub) { try { unsub(); } catch {} } };
  }, [conn, sig]);
  return events;
}

/** L'etat d'un evenement du journal, dit en un mot. */
export function etatJournal(id, st, S) {
  const dom = id.slice(0, id.indexOf('.'));
  const a = (S && S[id] && S[id].attributes) || {};
  if (['light', 'switch', 'fan', 'input_boolean', 'humidifier'].indexOf(dom) >= 0) return st === 'on' ? tr('Allumé') : tr('Éteint');
  if (dom === 'cover') return st === 'open' ? tr('Ouvert') : st === 'closed' ? tr('Fermé') : st === 'opening' ? tr('Ouverture…') : st === 'closing' ? tr('Fermeture…') : st;
  if (dom === 'lock') return st === 'locked' ? tr('Verrouillée') : st === 'unlocked' ? tr('Déverrouillée') : st;
  if (dom === 'media_player') return st === 'playing' ? tr('Lecture') : st === 'paused' ? tr('En pause') : st === 'off' ? tr('Éteint') : st === 'on' ? tr('Allumé') : tr('Inactif');
  if (dom === 'binary_sensor') {
    const porte = ['door', 'window', 'garage_door', 'opening'].indexOf(a.device_class) >= 0;
    return st === 'on' ? (porte ? tr('Ouvert') : tr('Détecté')) : (porte ? tr('Fermé') : 'RAS');
  }
  if (dom === 'climate') return st === 'off' ? tr('Éteint') : st === 'heat' ? tr('CONFORT') : st;
  if (dom === 'vacuum') return st === 'cleaning' ? tr('Nettoyage') : st === 'docked' ? tr('À la base') : st === 'returning' ? tr('Retour base') : st === 'paused' ? tr('En pause') : st;
  if (dom === 'person') return st === 'home' ? tr('Présent') : 'Absent';
  return st + (a.unit_of_measurement ? ' ' + a.unit_of_measurement : '');
}

/* Regroupe les répétitions CONSÉCUTIVES d'une même entité : un lecteur qui
 * change de titre toutes les trois minutes noyait le journal — une ligne
 * portée « ×n », datée du dernier événement, raconte la même chose. */
export function grouperJournal(events, cle = (e) => e.entity_id) {
  const out = [];
  for (const e of events) {
    const d = out[out.length - 1];
    if (d && cle(d) != null && cle(d) === cle(e)) { d.n = (d.n || 1) + 1; continue; }
    out.push({ ...e, n: 1 });
  }
  return out;
}

export function RoomActivityCard({ hass, ids, titre = null, sous = null, max = 8 }) {
  const events = grouperJournal(useRoomLogbook(hass, ids));
  if (!events.length) return null;
  const S = (hass && hass.states) || {};
  const heure = (when) => { const ms = when < 1e12 ? when * 1000 : when; const d = new Date(ms); return d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }); };
  const actif = (e) => ['on', 'open', 'unlocked', 'playing', 'heat', 'cleaning', 'home'].indexOf(e.state) >= 0;
  return (
    <div style={{ background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd2)', borderRadius: 'var(--o-radius,18px)', padding: '20px 22px', boxShadow: 'var(--o-shadow,0 14px 36px rgba(0,0,0,.34))' }}>
      <div style={{ fontSize: 15, fontWeight: 700 }}>{titre || tr('Activité')}</div>
      <div style={{ fontSize: 12, color: 'var(--o-text2)', fontWeight: 600, margin: '3px 0 10px' }}>{sous || tr('Les dernières 24 heures, en direct')}</div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {events.slice(0, max).map((e, i) => (
          <div key={(e.when || 0) + '|' + e.entity_id + '|' + i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: i ? 'var(--o-bw,1px) solid var(--o-bd3)' : 'none' }}>
            <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: actif(e) ? 'var(--o-warn)' : 'var(--o-text3)', boxShadow: actif(e) ? '0 0 7px var(--o-warn)' : 'none' }} />
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name || (S[e.entity_id] && S[e.entity_id].attributes && S[e.entity_id].attributes.friendly_name) || e.entity_id}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: actif(e) ? 'var(--o-warn)' : 'var(--o-text2)', whiteSpace: 'nowrap' }}>{e.state != null ? etatJournal(e.entity_id, e.state, S) : (e.message || '')}{e.n > 1 ? ' ·×' + e.n : ''}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text3)', flexShrink: 0, minWidth: 38, textAlign: 'right' }}>{heure(e.when)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function useSysHist(hass, ids, hours, refreshKey) {
  const [data, setData] = useState({});
  const key = ids.filter(Boolean).join('|');
  const connecte = hass ? 1 : 0;
  useEffect(() => {
    let alive = true;
    if (!hass || !hass.callApi || !key) { setData({}); return undefined; }
    const start = new Date(Date.now() - hours * 3600 * 1000).toISOString();
    Promise.all(key.split('|').map(id =>
      hass.callApi('GET', 'history/period/' + start + '?filter_entity_id=' + encodeURIComponent(id) + '&minimal_response&no_attributes')
        .then(res => ({ id, arr: (res && res[0]) || [] })).catch(() => ({ id, arr: [] }))
    )).then(rs => {
      if (!alive) return;
      const m = {};
      rs.forEach(r => { const pts = r.arr.map(x => ({ t: new Date(x.last_changed || x.last_updated || 0).getTime(), v: parseFloat(x.state) })).filter(pt => !isNaN(pt.v)); if (pts.length >= 2) m[r.id] = pts; });
      setData(m);
    });
    return () => { alive = false; };
  }, [connecte, key, hours, refreshKey]);
  return data;
}
// Aire + ligne sur points d'historique {t,v}, echelle automatique.
//
// Une serie inventee servait autrefois de repli quand l'historique manquait :
// la courbe s'affichait sous le libelle « Releve Home Assistant » sans que rien
// ne distingue le vrai du decor. Faute d'historique, on le dit maintenant.
export function SysArea({ pts, color, fill, h = 64 }) {
  const data = pts && pts.length >= 2 ? pts : null;
  if (!data) return <div style={{ height: h, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: 'var(--o-text3)' }}>{tr('historique indisponible')}</div>;
  const vals = data.map(pt => pt.v);
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const W = 240;
  const xs = vals.map((v, i) => [(i / (vals.length - 1)) * W, h - 4 - ((v - min) / span) * (h - 12)]);
  const line = 'M ' + xs.map(([x, y]) => x.toFixed(1) + ' ' + y.toFixed(1)).join(' L ');
  return (
    <svg viewBox={`0 0 ${W} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height: h, display: 'block' }}>
      <path d={`${line} L ${W} ${h} L 0 ${h} Z`} fill={fill} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
